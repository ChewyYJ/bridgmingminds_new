import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { postgresPoolOptions } from "../server/postgres.mjs";

const directory = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));

export async function migrateCloud({ connectionString, ca, onApplied = () => {} }) {
  const { Pool } = await import("pg");
  const pool = new Pool(postgresPoolOptions({ connectionString, ca, max: 1 }));
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // The lock is transaction-scoped and therefore safe through the pooler.
    await client.query("SELECT pg_advisory_xact_lock(1337420831)");
    await client.query("CREATE SCHEMA IF NOT EXISTS mindgarden");
    await client.query("CREATE TABLE IF NOT EXISTS mindgarden.schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    await client.query("REVOKE ALL ON SCHEMA mindgarden FROM PUBLIC, anon, authenticated");
    await client.query("REVOKE ALL ON mindgarden.schema_migrations FROM PUBLIC, anon, authenticated");
    const files = (await readdir(directory)).filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file)).sort();
    const applied = [];
    for (const name of files) {
      const sql = await readFile(join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query("SELECT checksum FROM mindgarden.schema_migrations WHERE name=$1", [name]);
      if (previous.rows.length) {
        if (previous.rows[0].checksum !== checksum) throw Object.assign(new Error("Applied migration checksum changed."), { code: "MIGRATION_CHANGED" });
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO mindgarden.schema_migrations(name,checksum) VALUES($1,$2)", [name, checksum]);
      applied.push(name);
    }
    await client.query("COMMIT");
    for (const name of applied) onApplied(name);
    return { applied, current: files.length };
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("Set POSTGRES_URL or DATABASE_URL securely before running the cloud migration.");
    process.exitCode = 1;
  } else {
    try {
      const ca = process.env.POSTGRES_CA_FILE ? await readFile(process.env.POSTGRES_CA_FILE, "utf8") : undefined;
      const result = await migrateCloud({ connectionString, ca, onApplied: (name) => console.log(`Applied ${name}`) });
      console.log(`Cloud database ready: ${result.current} migration(s), ${result.applied.length} applied.`);
    } catch (error) {
      // Driver errors may contain connection details; never dump them or the URL.
      console.error(`Cloud migration failed (${error.code || error.name || "unknown"}). No migration transaction was committed.`);
      process.exitCode = 1;
    }
  }
}
