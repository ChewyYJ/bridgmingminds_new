import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase, transaction } from "../server/database.mjs";
import { createUsageService } from "../server/usage.mjs";

// Opt-in only. These checks create and remove their own synthetic IDs in an
// already-migrated project; they never import or inspect local learner data.
const enabled = process.env.MINDGARDEN_CLOUD_DB_TEST === "1";
const connectionString = enabled ? process.env.TEST_CLOUD_DATABASE_URL || process.env.POSTGRES_URL : undefined;

test("cloud persistence, isolation, concurrency and fencing across two connections", { skip: !enabled, timeout: 120000 }, async () => {
  assert.ok(connectionString, "Provide TEST_CLOUD_DATABASE_URL or POSTGRES_URL securely.");
  const first = openDatabase({ connectionString });
  const second = openDatabase({ connectionString });
  const uid = randomUUID();
  const prefix = `synthetic-db-test:${uid}`;
  const sid = randomUUID();
  const createdAt = new Date().toISOString();
  try {
    await Promise.all([first.ready, second.ready]);
    await first.prepare("INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)").run(uid, "{}", "{}", "[]", createdAt);
    assert.equal((await second.prepare("SELECT id FROM users WHERE id=?").get(uid)).id, uid);
    assert.equal((await second.prepare("SELECT COUNT(*) n FROM users WHERE id=?").get(uid)).n, 1);

    // Each participant reads and replaces xp while holding the shared row lock.
    await Promise.all(Array.from({ length: 6 }, (_, index) => {
      const db = index % 2 ? first : second;
      return transaction(db, async () => {
        await db.lockUser(uid);
        const row = await db.prepare("SELECT xp FROM users WHERE id=?").get(uid);
        await db.prepare("UPDATE users SET xp=? WHERE id=?").run(row.xp + 1, uid);
      });
    }));
    assert.equal((await first.prepare("SELECT xp FROM users WHERE id=?").get(uid)).xp, 6);
    await assert.rejects(transaction(first, async () => {
      await first.prepare("UPDATE users SET xp=100 WHERE id=?").run(uid);
      throw new Error("synthetic rollback");
    }), /synthetic rollback/);
    assert.equal((await second.prepare("SELECT xp FROM users WHERE id=?").get(uid)).xp, 6);

    const leases = await Promise.all([first.acquireLease(prefix, "first", 60000), second.acquireLease(prefix, "second", 60000)]);
    assert.equal(leases.filter(Boolean).length, 1);
    const token = leases.find(Boolean).token;
    await first.prepare("UPDATE named_locks SET expires_at=0 WHERE name=?").run(prefix);
    const replacement = await second.acquireLease(prefix, "replacement", 60000);
    assert.ok(replacement);
    assert.equal(await first.releaseLease(prefix, token), false);
    assert.equal(await transaction(first, () => first.ownsLease(prefix, replacement.token)), true);

    const limits = await Promise.all(Array.from({ length: 10 }, (_, index) => (index % 2 ? first : second).consumeRateLimit(prefix, 5, 60000)));
    assert.equal(limits.filter((result) => result.allowed).length, 5);

    await first.prepare("INSERT INTO sessions(id,user_id,mode,data,created_at) VALUES(?,?,?,?,?)").run(sid, uid, "spin_speak", "{}", createdAt);
    await first.prepare("INSERT INTO practice_usage(user_id,session_id,week_start,created_at) VALUES(?,?,?,?)").run(uid, sid, "2026-10-26", createdAt);
    await assert.rejects(second.prepare("INSERT INTO practice_usage(user_id,session_id,week_start,created_at) VALUES(?,?,?,?)").run(uid, sid, "2026-10-26", createdAt), { code: "23505" });

    const usageFirst = createUsageService({ db: first, enabled: true, clock: () => Date.parse("2001-01-01T00:00:00Z") });
    const usageSecond = createUsageService({ db: second, enabled: true, clock: () => Date.parse("2001-01-01T00:00:00Z") });
    const sessions = [];
    for (let index = 0; index < 8; index++) {
      const id = randomUUID();
      sessions.push(id);
      await first.prepare("INSERT INTO sessions(id,user_id,mode,data,created_at) VALUES(?,?,?,?,?)").run(id, uid, "spin_speak", "{}", createdAt);
    }
    const reservations = await Promise.allSettled(sessions.map((id, index) => (index % 2 ? usageFirst : usageSecond).reservePractice(uid, id)));
    assert.equal(reservations.filter((result) => result.status === "fulfilled").length, 5);
    assert.equal((await usageFirst.snapshot(uid)).remaining, 0);

    const privileges = await first.prepare("SELECT has_schema_privilege('anon','mindgarden','USAGE') AS anonymous, has_schema_privilege('authenticated','mindgarden','USAGE') AS authenticated").get();
    assert.equal(privileges.anonymous, false);
    assert.equal(privileges.authenticated, false);
    const policies = await first.prepare("SELECT bool_and(c.relrowsecurity) AS enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mindgarden' AND c.relkind='r'").get();
    assert.equal(policies.enabled, true);
  } finally {
    await first.prepare("DELETE FROM users WHERE id=?").run(uid).catch(() => {});
    await first.prepare("DELETE FROM named_locks WHERE name=?").run(prefix).catch(() => {});
    await first.prepare("DELETE FROM rate_limits WHERE key=?").run(prefix).catch(() => {});
    await Promise.all([first.close(), second.close()]);
  }
});
