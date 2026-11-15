import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/database.mjs";
import { createDailyWorkoutService, localDay, workoutStreak } from "../server/daily-workout.mjs";
import { createGamificationService } from "../server/gamification.mjs";

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "daily-workout-"));
  const path = join(directory, "test.sqlite");
  let db = openDatabase(path);
  let time = "2026-11-11T12:00:00Z";
  const uid = randomUUID();
  await db.prepare("INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)").run(
    uid, JSON.stringify({ timezone: "Asia/Singapore" }),
    JSON.stringify({ seeds: 4, water: 2, sunlight: 3 }), "[]", time,
  );
  const economy = () => createGamificationService({ db, now: () => new Date(time) });
  const service = () => createDailyWorkoutService({ db, now: () => new Date(time),
    awardCompletion: (owner, completion) => economy().awardValidatedCompletion(owner, completion),
    getProgression: owner => economy().summary(owner),
  });
  t.after(async () => { await db.close(); rmSync(directory, { recursive: true, force: true }); });
  return {
    uid,
    get db() { return db; },
    get daily() { return service(); },
    setTime(value) { time = value; },
    async restart() { await db.close(); db = openDatabase(path); },
    async attempt(mode, overrides = {}, owner = uid) {
      const sid = randomUUID(), id = randomUUID();
      await db.prepare("INSERT INTO sessions VALUES(?,?,?,?,?)").run(sid, owner, mode, "{}", time);
      const attempt = {
        id, sessionId: sid, mode, status: "completed", text: "Parks offer space for neighbours to meet.",
        evaluation: mode === "read_aloud" ? { speech: { status: "assessed" } } : {},
        ...(mode === "read_aloud" ? { audioId: randomUUID() } : {}), ...overrides,
      };
      await db.prepare("INSERT INTO attempts VALUES(?,?,?,?,?)").run(id, owner, sid, JSON.stringify(attempt), time);
      return id;
    },
    async finish(mode, overrides) {
      const id = await this.attempt(mode, overrides);
      await this.daily.pinReceipt(uid, id);
      return this.daily.complete(uid, id);
    },
    async timezone(timezone) {
      await db.prepare("UPDATE users SET profile=? WHERE id=?").run(JSON.stringify({ timezone }), uid);
    },
    async balance() {
      const state = await economy().summary(uid);
      return { xp: state.xp, coins: state.coins };
    },
  };
}

for (const order of [["read_aloud", "spin_speak"], ["spin_speak", "read_aloud"]]) {
  test(`daily activities in order ${order.join(" → ")} award exactly 15 XP and 5 Coins`, async (t) => {
    const f = await fixture(t);
    assert.equal((await f.daily.today(f.uid)).completed, 0);
    const first = await f.finish(order[0]);
    assert.equal(first.xp, order[0] === "read_aloud" ? 0 : 15);
    assert.equal(first.coins, order[0] === "read_aloud" ? 3 : 2);
    let state = await f.daily.today(f.uid);
    assert.equal(state.completed, 1);
    assert.equal(state.streak.securedToday, true);
    assert.equal(state.streak.current, 1);
    assert.equal((await f.balance()).coins, 4 + first.coins);
    await f.finish(order[1]);
    state = await f.daily.today(f.uid);
    assert.equal(state.completed, 2);
    assert.equal(state.xp, 15);
    assert.deepEqual(state.streak, { current: 1, longest: 1, securedToday: true });
    assert.deepEqual(await f.balance(), { xp: 15, coins: 9 });
    assert.deepEqual(JSON.parse((await f.db.prepare('SELECT wallet FROM users WHERE id=?').get(f.uid)).wallet), { seeds: 4, water: 2, sunlight: 3 });
    await f.restart();
    assert.equal((await f.daily.today(f.uid)).completed, 2);
    await f.finish(order[0]);
    await f.finish(order[1]);
    assert.equal((await f.balance()).xp, 15);
    assert.equal((await f.balance()).coins, 9);
  });
}

test("concurrent submissions and duplicate completions cannot mint extra rewards", async (t) => {
  const f = await fixture(t);
  const ids = await Promise.all([f.attempt("spin_speak"), f.attempt("read_aloud"), f.attempt("spin_speak")]);
  await Promise.all(ids.map((id) => f.daily.pinReceipt(f.uid, id)));
  const outcomes = await Promise.all([...ids, ...ids].map((id) => f.daily.complete(f.uid, id)));
  assert.equal(outcomes.reduce((sum, item) => sum + item.xp, 0), 15);
  assert.equal(outcomes.reduce((sum, item) => sum + item.coins, 0), 5);
  assert.equal((await f.db.prepare("SELECT COUNT(*) count FROM coin_ledger").get()).count, 3);
  assert.equal((await f.db.prepare("SELECT COUNT(*) count FROM reward_ledger").get()).count, 0);
});

test("midnight, provider delay, receipt retries and timezone edits preserve the submission day", async (t) => {
  const f = await fixture(t);
  f.setTime("2026-11-11T15:59:59Z");
  const id = await f.attempt("spin_speak");
  const first = await f.daily.pinReceipt(f.uid, id);
  assert.equal(first.local_date, "2026-11-11");
  f.setTime("2026-11-11T16:05:00Z");
  await f.timezone("Pacific/Auckland");
  await f.restart();
  assert.deepEqual(await f.daily.pinReceipt(f.uid, id), first);
  assert.equal((await f.daily.complete(f.uid, id)).day, "2026-11-11");
  assert.equal((await f.daily.today(f.uid)).completed, 0);
  assert.equal((await f.balance()).xp, 15);
});

test("a day's timezone snapshot is shared, and another account cannot claim its receipt", async (t) => {
  const f = await fixture(t);
  const firstId = await f.attempt("spin_speak");
  await f.daily.pinReceipt(f.uid, firstId);
  await f.timezone("Asia/Tokyo");
  const secondId = await f.attempt("read_aloud");
  assert.equal((await f.daily.pinReceipt(f.uid, secondId)).timezone, "Asia/Singapore");
  const other = randomUUID();
  await f.db.prepare("INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)")
    .run(other, '{"timezone":"UTC"}', '{"seeds":0,"water":0,"sunlight":0}', '[]', "2026-11-11T12:00:00Z");
  await assert.rejects(f.daily.pinReceipt(other, firstId), /not found/);
  await assert.rejects(f.daily.complete(other, firstId), /receipt/);
  assert.equal((await f.daily.today(other)).completed, 0);
});

test("consecutive days extend streak; missed days preserve XP and Coins", async (t) => {
  const f = await fixture(t);
  for (const day of [11, 12]) {
    f.setTime(`2026-11-${day}T12:00:00Z`);
    await f.finish("spin_speak"); await f.finish("read_aloud");
  }
  assert.equal((await f.daily.today(f.uid)).streak.current, 2);
  f.setTime("2026-11-13T12:00:00Z");
  assert.deepEqual((await f.daily.today(f.uid)).streak, { current: 2, longest: 2, securedToday: false });
  f.setTime("2026-11-14T12:00:00Z");
  assert.equal((await f.daily.today(f.uid)).streak.current, 0);
  assert.deepEqual(await f.balance(), { xp: 30, coins: 14 });
});

test("calendar dates handle DST and month/year boundaries", () => {
  assert.equal(localDay("2026-11-01T05:30:00Z", "America/New_York"), "2026-11-01");
  assert.equal(localDay("2026-11-01T06:30:00Z", "America/New_York"), "2026-11-01");
  assert.equal(localDay("2026-12-31T16:00:00Z", "Asia/Singapore"), "2027-01-01");
  assert.equal(workoutStreak(["2026-12-31", "2027-01-01"], "2027-01-01").current, 2);
});

test("pending/failed, meaningless, unavailable speech and foreign attempts earn nothing", async (t) => {
  const f = await fixture(t);
  for (const [mode, overrides] of [
    ["spin_speak", { status: "processing" }],
    ["spin_speak", { status: "failed" }],
    ["spin_speak", { text: "..." }],
    ["spin_speak", { text: "test test test" }],
    ["spin_speak", { evaluation: null }],
    ["read_aloud", { evaluation: { speech: { status: "unavailable" } } }],
    ["read_aloud", { audioId: null }],
  ]) {
    const id = await f.attempt(mode, overrides);
    await f.daily.pinReceipt(f.uid, id);
    await assert.rejects(f.daily.complete(f.uid, id));
  }
  const id = await f.attempt("spin_speak");
  await assert.rejects(f.daily.complete(f.uid, id), /receipt/);
  await assert.rejects(f.daily.pinReceipt(randomUUID(), id));
  for (const mode of ["debate", "read_reflect"]) {
    assert.equal(await f.daily.pinReceipt(f.uid, await f.attempt(mode)), null);
  }
  assert.equal((await f.balance()).xp, 0);
  assert.equal((await f.daily.today(f.uid)).completed, 0);
});

test("low-quality or uncertain ratings do not deny meaningful participation credit", async (t) => {
  const f = await fixture(t);
  const result = await f.finish("spin_speak", { evaluation: { needs_review: true, dimensions: [{ level: 1 }] } });
  assert.equal(result.xp, 15);
});

test("a failed reward write rolls back completion, XP and secured day", async (t) => {
  const f = await fixture(t);
  await f.finish("spin_speak");
  const id = await f.attempt("read_aloud");
  await f.daily.pinReceipt(f.uid, id);
  await f.db.exec(`CREATE TRIGGER fail_coins BEFORE INSERT ON coin_ledger
    WHEN NEW.activity_type='read_aloud' BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END`);
  await assert.rejects(f.daily.complete(f.uid, id), /simulated storage failure/);
  assert.equal((await f.daily.today(f.uid)).completed, 1);
  assert.equal((await f.balance()).xp, 15);
  assert.equal((await f.balance()).coins, 6);
  await f.db.exec("DROP TRIGGER fail_coins");
  assert.equal((await f.daily.complete(f.uid, id)).coins, 3);
  assert.equal((await f.balance()).xp, 15);
  assert.equal((await f.balance()).coins, 9);
});

test("account deletion cascades private daily records", async (t) => {
  const f = await fixture(t);
  await f.finish("spin_speak"); await f.finish("read_aloud");
  await f.db.prepare("DELETE FROM users WHERE id=?").run(f.uid);
  for (const table of ["daily_attempt_receipts", "daily_activity_completions", "daily_workout_days"])
    assert.equal((await f.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get()).count, 0);
});
