import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";

// Public database CA distributed by Supabase's own Studio configuration:
// https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json
// https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
// Valid through 26 April 2031. This is a trust anchor, not an application secret.
const supabaseCa = readFileSync(new URL("./certs/supabase-prod-ca-2021.crt", import.meta.url), "utf8");

const tables = new Set([
  "users", "auth_sessions", "sessions", "attempts", "jobs", "audio", "journal",
  "reward_ledger", "reports", "garden_archives", "garden_operations", "friend_rooms",
  "friend_members", "friend_turns", "named_locks", "rate_limits", "deletion_outbox",
  "practice_usage", "user_vocabulary", "vocabulary_exposures", "vocabulary_observations", "vocabulary_reviews", "wordbloom_processed_attempts", "speech_jobs", "vocabulary_pronunciation",
  "daily_attempt_receipts", "daily_activity_completions", "daily_workout_days", "skill_observations",
]);

/** Convert only SQL code, never quoted values or comments, to the cloud dialect. */
export function postgresSql(source) {
  let parameter = 0;
  let index = 0;
  let result = "";
  let plain = "";
  const flush = () => {
    result += plain
      .replace(/\b(FROM|JOIN|INTO|UPDATE|REFERENCES)\s+([a-z_][a-z_0-9]*)\b/gi, (match, keyword, table) =>
        tables.has(table.toLowerCase()) ? `${keyword} mindgarden.${table}` : match)
      .replace(/\?/g, () => `$${++parameter}`);
    plain = "";
  };
  while (index < source.length) {
    const char = source[index];
    let end = index;
    if (char === "'" || char === '"') {
      flush();
      end++;
      while (end < source.length) {
        if (source[end++] === char) {
          if (source[end] === char) end++;
          else break;
        }
      }
    } else if (source.startsWith("--", index)) {
      flush();
      end = source.indexOf("\n", index);
      if (end < 0) end = source.length;
    } else if (source.startsWith("/*", index)) {
      flush();
      end = index + 2;
      let depth = 1;
      while (end < source.length && depth) {
        if (source.startsWith("/*", end)) { depth++; end += 2; }
        else if (source.startsWith("*/", end)) { depth--; end += 2; }
        else end++;
      }
    } else if (char === "$" && /^\$(?:[a-z_][a-z_0-9]*)?\$/i.test(source.slice(index))) {
      flush();
      const delimiter = source.slice(index).match(/^\$(?:[a-z_][a-z_0-9]*)?\$/i)[0];
      const close = source.indexOf(delimiter, index + delimiter.length);
      end = close < 0 ? source.length : close + delimiter.length;
    } else {
      plain += char;
      index++;
      continue;
    }
    result += source.slice(index, end);
    index = end;
  }
  flush();
  if (/^\s*INSERT\s+OR\s+IGNORE\b/i.test(result)) {
    result = result.replace(/\bINSERT\s+OR\s+IGNORE\b/i, "INSERT").replace(/;\s*$/, "");
    if (/\bRETURNING\b/i.test(result)) result = result.replace(/\bRETURNING\b/i, "ON CONFLICT DO NOTHING RETURNING");
    else result += " ON CONFLICT DO NOTHING";
  }
  return result;
}

export function postgresPoolOptions({ connectionString, ca, max = 2 }) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid PostgreSQL connection protocol.");
  // pg parses these URL options after its config; remove them so a supplied
  // URL can never turn off certificate verification or replace the trusted CA.
  for (const key of [...url.searchParams.keys()])
    if (key.toLowerCase().startsWith("ssl") || key === "uselibpqcompat") url.searchParams.delete(key);
  if (!Number.isInteger(max) || max < 1 || max > 2) throw new Error("The cloud database pool must contain one or two connections.");
  const isSupabase = url.hostname.endsWith(".pooler.supabase.com") || url.hostname.endsWith(".supabase.co");
  const trustedCa = ca || (isSupabase ? [...rootCertificates, supabaseCa] : undefined);
  return {
    connectionString: url.toString(),
    max,
    ssl: { rejectUnauthorized: true, ...(trustedCa ? { ca: trustedCa } : {}) },
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
    application_name: "bridgingminds",
  };
}

function normalizeRow(row) {
  if (!row) return undefined;
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) row[key] = value.toISOString();
    else if (["count", "n", "expires_at", "lease_until", "window_end", "expected_size", "size_bytes", "next_attempt_at"].includes(key)
      && typeof value === "string" && /^-?\d+$/.test(value)) {
      const number = Number(value);
      if (Number.isSafeInteger(number)) row[key] = number;
    }
  }
  return row;
}

export function openPostgresDatabase(options) {
  const poolOptions = postgresPoolOptions(options);
  const context = new AsyncLocalStorage();
  let savepoint = 0;
  let closed = false;
  const poolPromise = import("pg").then(async ({ Pool }) => {
    const attachPool = process.env.VERCEL
      ? (await import("@vercel/functions")).attachDatabasePool
      : undefined;
    const pool = new Pool(poolOptions);
    // pg removes failed idle clients itself. Handle the event so a background
    // socket failure cannot become an uncaught exception or expose credentials.
    pool.on("error", () => {
      console.error("[garden-database] An idle database connection was removed.");
    });
    // Keep this pool shared; the platform hook closes idle clients before an
    // instance suspends without replaying queries or interrupting transactions.
    attachPool?.(pool);
    return pool;
  });
  const ready = poolPromise.then(async (pool) => {
    const result = await pool.query("SELECT to_regclass('mindgarden.practice_usage') AS relation");
    if (!result.rows[0]?.relation) throw new Error("Cloud database migrations have not been applied. Run scripts/migrate-cloud.mjs first.");
  });
  // The entry point owns surfacing initialization failures. Attaching a handler
  // prevents a rejected promise becoming unhandled before the first request.
  void ready.catch(() => {});
  const current = () => {
    const state = context.getStore();
    if (state && !state.active) throw new Error("The transaction has already finished.");
    return state;
  };
  const query = async (sql, values = []) => {
    if (closed) throw new Error("The database is closed.");
    await ready;
    const state = current();
    const client = state?.client || await poolPromise;
    // Supplying no query name deliberately uses unnamed statements, compatible
    // with Supabase transaction pooling.
    return client.query(postgresSql(sql), values);
  };
  const adapter = {
    dialect: "postgres",
    inTransaction: () => Boolean(current()),
    ready,
    prepare(sql) {
      return {
        get: async (...values) => normalizeRow((await query(sql, values)).rows[0]),
        all: async (...values) => (await query(sql, values)).rows.map(normalizeRow),
        run: async (...values) => ({ changes: (await query(sql, values)).rowCount || 0 }),
      };
    },
    exec: (sql) => query(sql),
    async transaction(fn) {
      await ready;
      const state = current();
      if (state) {
        const name = `nested_${++savepoint}`;
        await state.client.query(`SAVEPOINT ${name}`);
        try {
          const result = await fn(adapter);
          await state.client.query(`RELEASE SAVEPOINT ${name}`);
          return result;
        } catch (error) {
          await state.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
          await state.client.query(`RELEASE SAVEPOINT ${name}`);
          throw error;
        }
      }
      if (closed) throw new Error("The database is closed.");
      const client = await (await poolPromise).connect();
      const next = { client, active: true };
      try {
        await client.query("BEGIN");
        const result = await context.run(next, () => fn(adapter));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        next.active = false;
        client.release();
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      await (await poolPromise).end();
    },
    async lockRow(table, rowId) {
      if (!current()) throw new Error("Row locks require a transaction.");
      if (!["users", "sessions", "friend_rooms"].includes(table)) throw new Error("Unsupported lock table.");
      return Boolean(await adapter.prepare(`SELECT id FROM ${table} WHERE id=? FOR UPDATE`).get(rowId));
    },
  };
  return adapter;
}
