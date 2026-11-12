import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { openPostgresDatabase } from "./postgres.mjs";

function openSqliteRaw(path) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, profile TEXT NOT NULL, wallet TEXT NOT NULL, plots TEXT NOT NULL, decorations TEXT NOT NULL DEFAULT '[]', xp INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, mode TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, data TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE, status TEXT NOT NULL, error TEXT, retry_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audio (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, mime TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS journal (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reward_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, source_key TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,source_key));
  CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE, reason TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS garden_archives (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, archived_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS garden_operations (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_key TEXT NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,request_key));
  CREATE TABLE IF NOT EXISTS friend_rooms (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, creator_id TEXT REFERENCES users(id) ON DELETE SET NULL, create_key TEXT NOT NULL, prompt TEXT NOT NULL, rounds INTEGER NOT NULL CHECK(rounds IN (2,3)), status TEXT NOT NULL CHECK(status IN ('waiting','active','completed','closed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL, close_reason TEXT, UNIQUE(creator_id,create_key));
  CREATE TABLE IF NOT EXISTS friend_members (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES friend_rooms(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, position TEXT NOT NULL CHECK(position IN ('for','against')), seat INTEGER NOT NULL CHECK(seat IN (0,1)), UNIQUE(room_id,user_id), UNIQUE(room_id,seat));
  CREATE TABLE IF NOT EXISTS friend_turns (id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES friend_rooms(id) ON DELETE CASCADE, member_id TEXT NOT NULL REFERENCES friend_members(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, turn_index INTEGER NOT NULL, text TEXT NOT NULL, audio_id TEXT REFERENCES audio(id) ON DELETE SET NULL, request_key TEXT, created_at TEXT NOT NULL, UNIQUE(room_id,turn_index), UNIQUE(room_id,user_id,request_key));
  CREATE INDEX IF NOT EXISTS friend_members_users ON friend_members(user_id,room_id);
  CREATE INDEX IF NOT EXISTS friend_turns_audio ON friend_turns(audio_id,room_id);
  CREATE INDEX IF NOT EXISTS friend_rooms_status ON friend_rooms(status,expires_at);
  CREATE INDEX IF NOT EXISTS auth_users ON auth_sessions(user_id);
  CREATE INDEX IF NOT EXISTS session_users ON sessions(user_id,created_at);
  CREATE INDEX IF NOT EXISTS attempt_users ON attempts(user_id,created_at);
  CREATE INDEX IF NOT EXISTS jobs_users ON jobs(user_id,status);
  CREATE INDEX IF NOT EXISTS audio_users ON audio(user_id);
  CREATE INDEX IF NOT EXISTS ledger_users ON reward_ledger(user_id,day,kind);
  CREATE INDEX IF NOT EXISTS journal_users ON journal(user_id);
  CREATE INDEX IF NOT EXISTS reports_users ON reports(user_id);`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS garden_archives_users ON garden_archives(user_id,archived_at)",
  );
  const addColumn = (table, name, definition) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === name))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  addColumn("users", "supabase_user_id", "TEXT");
  addColumn("jobs", "lease_owner", "TEXT");
  addColumn("jobs", "lease_token", "TEXT");
  addColumn("jobs", "lease_until", "INTEGER");
  addColumn("audio", "status", "TEXT NOT NULL DEFAULT 'ready'");
  addColumn("audio", "expected_size", "INTEGER");
  addColumn("audio", "size_bytes", "INTEGER");
  addColumn("audio", "expires_at", "TEXT");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_supabase_identity ON users(supabase_user_id);
    CREATE INDEX IF NOT EXISTS jobs_leases ON jobs(status,lease_until);
    CREATE TABLE IF NOT EXISTS named_locks (name TEXT PRIMARY KEY, owner TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS named_locks_expiry ON named_locks(expires_at);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_end INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(window_end);
    CREATE TABLE IF NOT EXISTS deletion_outbox (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, user_id TEXT, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS deletion_outbox_pending ON deletion_outbox(status,next_attempt_at);
    CREATE TABLE IF NOT EXISTS practice_usage (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, week_start TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,session_id));
    CREATE INDEX IF NOT EXISTS practice_usage_week ON practice_usage(user_id,week_start);
    CREATE TABLE IF NOT EXISTS daily_attempt_receipts (
      attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_type TEXT NOT NULL CHECK(activity_type IN ('read_aloud','spin_speak')),
      local_date TEXT NOT NULL, timezone TEXT NOT NULL, received_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_activity_completions (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      local_date TEXT NOT NULL,
      activity_type TEXT NOT NULL CHECK(activity_type IN ('read_aloud','spin_speak')),
      attempt_id TEXT NOT NULL REFERENCES attempts(id), timezone TEXT NOT NULL,
      completed_at TEXT NOT NULL, PRIMARY KEY(user_id,local_date,activity_type)
    );
    CREATE TABLE IF NOT EXISTS daily_workout_days (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      local_date TEXT NOT NULL, secured_at TEXT NOT NULL,
      PRIMARY KEY(user_id,local_date)
    );
    CREATE INDEX IF NOT EXISTS daily_receipt_days ON daily_attempt_receipts(user_id,local_date,received_at);
  `);
  db.exec(`
CREATE TABLE IF NOT EXISTS user_vocabulary (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL, source_attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  source_day TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('scheduled','introduced','review_due','familiar','dismissed')),
  data TEXT NOT NULL, due_at TEXT NOT NULL, interval_days REAL NOT NULL DEFAULT 3,
  exposure_count INTEGER NOT NULL DEFAULT 0, productive_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,word_id)
);
CREATE TABLE IF NOT EXISTS vocabulary_exposures (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocabulary_id TEXT NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL, completed_at TEXT, outcome TEXT,
  UNIQUE(user_id,vocabulary_id,session_id)
);
CREATE TABLE IF NOT EXISTS vocabulary_observations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocabulary_id TEXT NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('suggestion','reading_self_review','productive_use_candidate')),
  data TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,vocabulary_id,attempt_id,kind)
);
CREATE INDEX IF NOT EXISTS vocabulary_due ON user_vocabulary(user_id,status,due_at);
CREATE INDEX IF NOT EXISTS vocabulary_exposure_users ON vocabulary_exposures(user_id,assigned_at);
CREATE INDEX IF NOT EXISTS vocabulary_observation_users ON vocabulary_observations(user_id,created_at);
  `);
  db.exec(`CREATE TABLE IF NOT EXISTS skill_observations (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    prompt_id TEXT NOT NULL, dimension TEXT NOT NULL CHECK(dimension IN ('B','R','I','D','G','E')),
    data TEXT NOT NULL, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(user_id,attempt_id,dimension)
  ); CREATE INDEX IF NOT EXISTS skill_observation_users ON skill_observations(user_id,occurred_at);`);
  db.exec(`CREATE TABLE IF NOT EXISTS vocabulary_pronunciation (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vocabulary_id TEXT NOT NULL REFERENCES user_vocabulary(id) ON DELETE CASCADE,
    attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    locale TEXT NOT NULL, data TEXT NOT NULL, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('observed','insufficient_evidence')),
    UNIQUE(user_id,vocabulary_id,session_id,locale)
  ); CREATE INDEX IF NOT EXISTS vocabulary_pronunciation_users ON vocabulary_pronunciation(user_id,vocabulary_id,locale,occurred_at);`);
  db.exec(`CREATE TABLE IF NOT EXISTS speech_jobs (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed')),
    data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS speech_jobs_users ON speech_jobs(user_id,status);`);
  db.exec(`CREATE TABLE IF NOT EXISTS wordbloom_processed_attempts (
    attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, processed_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS wordbloom_processed_users ON wordbloom_processed_attempts(user_id);`);
  addColumn("practice_usage", "request_count", "INTEGER NOT NULL DEFAULT 0");
  return db;
}

function openSqliteDatabase(path) {
  const raw = openSqliteRaw(path);
  const context = new AsyncLocalStorage();
  let tail = Promise.resolve();
  let closed = false;
  let savepoint = 0;
  const exclusive = async (fn) => {
    const previous = tail;
    let release;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      if (closed) throw new Error("The database is closed.");
      return await fn();
    } finally { release(); }
  };
  const current = () => {
    const state = context.getStore();
    if (state && !state.active) throw new Error("The transaction has already finished.");
    return state;
  };
  const execute = (fn) => current() ? Promise.resolve().then(fn) : exclusive(fn);
  const adapter = {
    dialect: "sqlite",
    inTransaction: () => Boolean(current()),
    raw,
    ready: Promise.resolve(),
    prepare(sql) {
      return {
        get: (...params) => execute(() => raw.prepare(sql).get(...params)),
        all: (...params) => execute(() => raw.prepare(sql).all(...params)),
        run: (...params) => execute(() => {
          const result = raw.prepare(sql).run(...params);
          return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
        }),
      };
    },
    exec: (sql) => execute(() => raw.exec(sql)),
    async transaction(fn) {
      if (current()) {
        const name = `nested_${++savepoint}`;
        raw.exec(`SAVEPOINT ${name}`);
        try {
          const result = await fn(adapter);
          raw.exec(`RELEASE SAVEPOINT ${name}`);
          return result;
        } catch (error) {
          raw.exec(`ROLLBACK TO SAVEPOINT ${name}`);
          raw.exec(`RELEASE SAVEPOINT ${name}`);
          throw error;
        }
      }
      return exclusive(async () => {
        raw.exec("BEGIN IMMEDIATE");
        const state = { active: true };
        try {
          const result = await context.run(state, () => fn(adapter));
          raw.exec("COMMIT");
          return result;
        } catch (error) {
          raw.exec("ROLLBACK");
          throw error;
        } finally { state.active = false; }
      });
    },
    async close() {
      if (closed) return;
      await exclusive(() => { raw.close(); closed = true; });
    },
    async lockRow(table, rowId) {
      if (!current()) throw new Error("Row locks require a transaction.");
      if (!["users", "sessions", "friend_rooms"].includes(table)) throw new Error("Unsupported lock table.");
      return Boolean(await adapter.prepare(`SELECT id FROM ${table} WHERE id=?`).get(rowId));
    },
  };
  return adapter;
}

function withSharedOperations(db) {
  db.lockUser = (uid) => db.lockRow("users", uid);
  db.lockSession = (id) => db.lockRow("sessions", id);
  db.lockRoom = (id) => db.lockRow("friend_rooms", id);
  db.acquireLease = async (name, owner, ttlMs = 60000) => {
    if (!name || !owner || !Number.isSafeInteger(ttlMs) || ttlMs < 1)
      throw new TypeError("A lease needs a name, owner and positive integer duration.");
    const instant = Date.now();
    const token = randomUUID();
    const row = await db.prepare(`
      INSERT INTO named_locks(name,owner,token,expires_at) VALUES(?,?,?,?)
      ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,token=excluded.token,expires_at=excluded.expires_at
      WHERE named_locks.expires_at<=?
      RETURNING token,expires_at
    `).get(name, owner, token, instant + ttlMs, instant);
    return row ? { token: row.token, expiresAt: Number(row.expires_at) } : null;
  };
  db.releaseLease = async (name, token) => Boolean((await db.prepare(
    "DELETE FROM named_locks WHERE name=? AND token=?",
  ).run(name, token)).changes);
  db.ownsLease = async (name, token) => Boolean(await db.prepare(
    `SELECT token FROM named_locks WHERE name=? AND token=? AND expires_at>?${db.dialect === "postgres" && db.inTransaction() ? " FOR UPDATE" : ""}`,
  ).get(name, token, Date.now()));
  db.renewLease = async (name, token, ttlMs = 60000) => {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new TypeError("Invalid lease duration.");
    const instant = Date.now();
    return Boolean((await db.prepare(
      "UPDATE named_locks SET expires_at=? WHERE name=? AND token=? AND expires_at>?",
    ).run(instant + ttlMs, name, token, instant)).changes);
  };
  db.consumeRateLimit = async (key, maximum, windowMs = 60000) => {
    if (!key || !Number.isSafeInteger(maximum) || maximum < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1)
      throw new TypeError("Invalid rate limit.");
    const instant = Date.now();
    const row = await db.prepare(`
      INSERT INTO rate_limits(key,count,window_end) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET
        count=CASE WHEN rate_limits.window_end<=? THEN 1 ELSE rate_limits.count+1 END,
        window_end=CASE WHEN rate_limits.window_end<=? THEN excluded.window_end ELSE rate_limits.window_end END
      RETURNING count,window_end
    `).get(key, instant + windowMs, instant, instant);
    const allowed = Number(row.count) <= maximum;
    return { allowed, count: Number(row.count), resetAt: Number(row.window_end), retryAfterMs: allowed ? 0 : Math.max(0, Number(row.window_end) - instant) };
  };
  return db;
}

/** Construction is synchronous; await ready before admitting HTTP requests. */
export function openDatabase(pathOrOptions = ":memory:") {
  const options = typeof pathOrOptions === "string" ? { path: pathOrOptions } : pathOrOptions;
  const connectionString = options.connectionString || options.url;
  if (connectionString || options.dialect === "postgres") {
    if (!connectionString) throw new Error("PostgreSQL requires a connection string.");
    return withSharedOperations(openPostgresDatabase({ ...options, connectionString }));
  }
  return withSharedOperations(openSqliteDatabase(options.path || ":memory:"));
}

export async function transaction(db, fn) {
  return db.transaction(fn);
}
