import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, X509Certificate } from "node:crypto";
import { Pool } from "pg";
import { openDatabase, transaction } from "../server/database.mjs";
import { openPostgresDatabase, postgresPoolOptions, postgresSql } from "../server/postgres.mjs";

function gate() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function seed(db, uid = randomUUID()) {
  await db.prepare("INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)")
    .run(uid, "{}", '{"water":2}', "[]", new Date().toISOString());
  return uid;
}

test("async SQLite transaction excludes other requests across awaits and rolls back atomically", async () => {
  const db = openDatabase(":memory:");
  const uid = await seed(db);
  const entered = gate();
  const release = gate();
  const events = [];
  try {
    const first = transaction(db, async () => {
      await db.lockUser(uid);
      await db.prepare("UPDATE users SET xp=10 WHERE id=?").run(uid);
      entered.resolve();
      await release.promise;
      events.push("transaction end");
      throw new Error("rollback fixture");
    });
    await entered.promise;
    const reader = db.prepare("SELECT xp FROM users WHERE id=?").get(uid).then((row) => {
      events.push("reader");
      return row;
    });
    await Promise.resolve();
    assert.deepEqual(events, []);
    release.resolve();
    await assert.rejects(first, /rollback fixture/);
    assert.equal((await reader).xp, 0);
    assert.deepEqual(events, ["transaction end", "reader"]);
  } finally { await db.close(); }
});

test("nested transaction failure only rolls back its savepoint", async () => {
  const db = openDatabase(":memory:");
  try {
    const uid = await seed(db);
    await transaction(db, async () => {
      await db.prepare("UPDATE users SET xp=3 WHERE id=?").run(uid);
      await assert.rejects(transaction(db, async () => {
        await db.prepare("UPDATE users SET xp=99 WHERE id=?").run(uid);
        throw new Error("nested failure");
      }), /nested failure/);
      assert.equal((await db.prepare("SELECT xp FROM users WHERE id=?").get(uid)).xp, 3);
    });
    assert.equal((await db.prepare("SELECT xp FROM users WHERE id=?").get(uid)).xp, 3);
    await assert.rejects(db.lockUser(uid), /require a transaction/);
    assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM users").get().n, 1);
  } finally { await db.close(); }
});

test("leases are atomic and stale fencing tokens cannot renew or release a new owner", async () => {
  const db = openDatabase(":memory:");
  try {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => db.acquireLease("evaluation:one", `worker-${i}`, 60000)));
    const won = results.filter(Boolean);
    assert.equal(won.length, 1);
    assert.equal(await db.ownsLease("evaluation:one", won[0].token), true);
    await db.prepare("UPDATE named_locks SET expires_at=0 WHERE name=?").run("evaluation:one");
    const next = await db.acquireLease("evaluation:one", "replacement", 60000);
    assert.ok(next);
    assert.notEqual(next.token, won[0].token);
    assert.equal(await db.releaseLease("evaluation:one", won[0].token), false);
    assert.equal(await db.renewLease("evaluation:one", won[0].token), false);
    assert.equal(await db.ownsLease("evaluation:one", next.token), true);
    assert.equal(await db.releaseLease("evaluation:one", next.token), true);
  } finally { await db.close(); }
});

test("shared rate limits admit only the limit and reset the expired window", async () => {
  const db = openDatabase(":memory:");
  try {
    const results = await Promise.all(Array.from({ length: 12 }, () => db.consumeRateLimit("user:one", 5, 60000)));
    assert.equal(results.filter((result) => result.allowed).length, 5);
    assert.ok(results.find((result) => !result.allowed).retryAfterMs > 0);
    await db.prepare("UPDATE rate_limits SET window_end=0 WHERE key=?").run("user:one");
    const reset = await db.consumeRateLimit("user:one", 5, 60000);
    assert.equal(reset.count, 1);
    assert.equal(reset.allowed, true);
  } finally { await db.close(); }
});

test("weekly usage is unique and deletion work survives account deletion", async () => {
  const db = openDatabase(":memory:");
  try {
    const uid = await seed(db);
    const sid = randomUUID();
    const now = new Date().toISOString();
    await db.prepare("INSERT INTO sessions(id,user_id,mode,data,created_at) VALUES(?,?,?,?,?)").run(sid, uid, "spin_speak", "{}", now);
    await db.prepare("INSERT INTO practice_usage(user_id,session_id,week_start,created_at) VALUES(?,?,?,?)").run(uid, sid, "2026-10-26", now);
    await assert.rejects(db.prepare("INSERT INTO practice_usage(user_id,session_id,week_start,created_at) VALUES(?,?,?,?)").run(uid, sid, "2026-10-26", now));
    await db.prepare("INSERT INTO deletion_outbox(id,object_key,user_id,created_at) VALUES(?,?,?,?)").run(randomUUID(), `${uid}/recording`, uid, now);
    await db.prepare("DELETE FROM users WHERE id=?").run(uid);
    assert.equal((await db.prepare("SELECT COUNT(*) count FROM practice_usage").get()).count, 0);
    assert.equal((await db.prepare("SELECT COUNT(*) count FROM deletion_outbox").get()).count, 1);
  } finally { await db.close(); }
});

test("local schema upgrades are idempotent across reopen", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mindgarden-db-"));
  const path = join(directory, "fixture.sqlite");
  let db = openDatabase(path);
  try {
    const uid = await seed(db);
    await db.close();
    db = openDatabase(path);
    assert.equal((await db.prepare("SELECT id FROM users WHERE id=?").get(uid)).id, uid);
    assert.equal(db.raw.prepare("PRAGMA table_info(audio)").all().filter((row) => row.name === "status").length, 1);
  } finally {
    await db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("SQL conversion qualifies application tables and preserves literal placeholders", () => {
  assert.equal(postgresSql("SELECT 'FROM users ?' AS value FROM users WHERE id=? -- ?\nAND email=?"), "SELECT 'FROM users ?' AS value FROM mindgarden.users WHERE id=$1 -- ?\nAND email=$2");
  assert.equal(postgresSql("INSERT OR IGNORE INTO garden_operations VALUES(?,?,?,?)"), "INSERT INTO mindgarden.garden_operations VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING");
  assert.equal(postgresSql("SELECT $$? FROM users$$ FROM users WHERE id=?"), "SELECT $$? FROM users$$ FROM mindgarden.users WHERE id=$1");
  assert.equal(postgresSql("SELECT /* outer ? /* inner ? */ */ id FROM users WHERE id=?"), "SELECT /* outer ? /* inner ? */ */ id FROM mindgarden.users WHERE id=$1");
});

test("PostgreSQL configuration cannot disable TLS verification through the URL", () => {
  const options = postgresPoolOptions({ connectionString: "postgresql://fixture:synthetic@example.invalid/postgres?ssl=false&sslmode=no-verify&sslrootcert=bad&uselibpqcompat=true" });
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(new URL(options.connectionString).searchParams.has("sslmode"), false);
  assert.equal(new URL(options.connectionString).searchParams.has("ssl"), false);
  assert.equal(new URL(options.connectionString).searchParams.has("sslrootcert"), false);
  assert.equal(options.max, 2);
  assert.equal(options.ssl.ca, undefined);
});

test("Supabase connections trust the official database CA with hostname verification intact", () => {
  const options = postgresPoolOptions({ connectionString: "postgresql://fixture:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" });
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.checkServerIdentity, undefined);
  assert.ok(Array.isArray(options.ssl.ca));
  const cert = new X509Certificate(options.ssl.ca.at(-1));
  assert.equal(cert.ca, true);
  assert.equal(cert.verify(cert.publicKey), true);
  assert.match(cert.subject, /Supabase Root 2021 CA/);
});

for (const onVercel of [false, true]) {
  test(`PostgreSQL ${onVercel ? "Vercel" : "local"} pool survives idle errors without retrying writes`, async (t) => {
    const previousVercel = process.env.VERCEL;
    if (onVercel) process.env.VERCEL = "1";
    else delete process.env.VERCEL;
    t.after(() => {
      if (previousVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previousVercel;
    });
    const pools = new Set();
    const logged = [];
    const failure = new Error("Synthetic private connection information");
    let writes = 0;
    t.mock.method(console, "error", (...args) => logged.push(args));
    t.mock.method(Pool.prototype, "query", function (sql) {
      pools.add(this);
      if (sql.includes("to_regclass")) return Promise.resolve({ rows: [{ relation: "mindgarden.practice_usage" }] });
      if (sql.startsWith("UPDATE")) {
        writes++;
        return Promise.reject(failure);
      }
      return Promise.resolve({ rows: [{ count: "1" }] });
    });
    const db = openPostgresDatabase({ connectionString: "postgresql://synthetic:fixture@example.invalid/postgres" });
    try {
      await db.ready;
      const pool = [...pools][0];
      assert.equal(pool.listenerCount("release"), onVercel ? 1 : 0);
      assert.doesNotThrow(() => pool.emit("error", failure));
      assert.deepEqual(logged, [["[garden-database] An idle database connection was removed."]]);
      await assert.rejects(db.prepare("UPDATE users SET xp=1 WHERE id=?").run("synthetic"), (error) => error === failure);
      assert.equal(writes, 1);
      assert.equal((await db.prepare("SELECT COUNT(*) count FROM users").get()).count, 1);
      assert.equal(pools.size, 1);
    } finally { await db.close(); }
  });
}
