import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../server/database.mjs";
import { createUsageService, practiceWeek } from "../server/usage.mjs";

async function fixture(
  t,
  {
    enabled = true,
    dailyRequests = 100,
    instant = Date.parse("2026-11-01T15:59:59Z"),
  } = {},
) {
  const db = openDatabase(":memory:");
  const uid = randomUUID();
  await db
    .prepare(
      "INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)",
    )
    .run(uid, "{}", "{}", "[]", new Date(instant).toISOString());
  const state = { instant };
  const usage = createUsageService({
    db,
    enabled,
    dailyRequests,
    clock: () => state.instant,
  });
  const session = async (user = uid) => {
    const id = randomUUID();
    await db
      .prepare(
        "INSERT INTO sessions(id,user_id,mode,data,created_at) VALUES(?,?,?,?,?)",
      )
      .run(id, user, "spin_speak", "{}", new Date(state.instant).toISOString());
    return id;
  };
  t.after(() => db.close());
  return { db, uid, usage, state, session };
}

test("practice weeks reset at Singapore Monday midnight, including year boundaries", () => {
  assert.deepEqual(practiceWeek(Date.parse("2026-11-01T15:59:59.999Z")), {
    start: "2026-10-26",
    resetsAt: "2026-11-01T16:00:00.000Z",
  });
  assert.deepEqual(practiceWeek(Date.parse("2026-11-01T16:00:00.000Z")), {
    start: "2026-11-02",
    resetsAt: "2026-11-08T16:00:00.000Z",
  });
  assert.deepEqual(practiceWeek(Date.parse("2026-12-31T16:00:00.000Z")), {
    start: "2026-12-28",
    resetsAt: "2027-01-03T16:00:00.000Z",
  });
});

test("concurrent new sessions reserve exactly five weekly slots", async (t) => {
  const f = await fixture(t);
  const sessions = await Promise.all(
    Array.from({ length: 12 }, () => f.session()),
  );
  const results = await Promise.allSettled(
    sessions.map((sid) => f.usage.reservePractice(f.uid, sid)),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    5,
  );
  for (const result of results.filter((item) => item.status === "rejected"))
    assert.equal(result.reason.code, "usage_limit");
  const snapshot = await f.usage.snapshot(f.uid);
  assert.equal(snapshot.used, 5);
  assert.equal(snapshot.remaining, 0);
});

test("retries and revisions reuse a slot; the new week refreshes only new-session allowance", async (t) => {
  const f = await fixture(t);
  const sid = await f.session();
  await Promise.all(
    Array.from({ length: 10 }, () => f.usage.reservePractice(f.uid, sid)),
  );
  assert.equal((await f.usage.snapshot(f.uid)).used, 1);
  f.state.instant = Date.parse("2026-11-01T16:00:00Z");
  assert.equal((await f.usage.snapshot(f.uid)).used, 0);
  await f.usage.reservePractice(f.uid, sid);
  assert.equal((await f.usage.snapshot(f.uid)).used, 0);
  await f.usage.reservePractice(f.uid, await f.session());
  assert.equal((await f.usage.snapshot(f.uid)).used, 1);
});

test("reservation captures its week once even if clock crosses midnight during work", async (t) => {
  const f = await fixture(t);
  let reads = 0;
  const usage = createUsageService({
    db: f.db,
    enabled: true,
    clock: () =>
      reads++ === 0
        ? Date.parse("2026-11-01T15:59:59.999Z")
        : Date.parse("2026-11-01T16:00:00Z"),
  });
  await usage.reservePractice(f.uid, await f.session());
  assert.equal(reads, 1);
  const row = await f.db
    .prepare("SELECT week_start FROM practice_usage WHERE user_id=?")
    .get(f.uid);
  assert.equal(row.week_start, "2026-10-26");
});

test("a request denied by the service cap consumes neither a weekly slot nor a practice request", async (t) => {
  const f = await fixture(t, { dailyRequests: 1 });
  const first = await f.session();
  const second = await f.session();
  await f.usage.allowRequest(f.uid, { sessionId: first });
  await assert.rejects(f.usage.allowRequest(f.uid, { sessionId: second }), {
    code: "usage_limit",
  });
  assert.equal((await f.usage.snapshot(f.uid)).used, 1);
  assert.equal(
    await f.db
      .prepare("SELECT request_count FROM practice_usage WHERE session_id=?")
      .get(second),
    undefined,
  );
  await assert.rejects(f.usage.allowRequest(f.uid, { sessionId: first }), {
    code: "usage_limit",
  });
  assert.equal(
    (
      await f.db
        .prepare("SELECT request_count FROM practice_usage WHERE session_id=?")
        .get(first)
    ).request_count,
    1,
  );
  f.state.instant += 86400000;
  await f.usage.allowRequest(f.uid, { sessionId: second });
});

test("twelve requests per session are a permanent cap under concurrency", async (t) => {
  const f = await fixture(t);
  const sid = await f.session();
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () =>
      f.usage.allowRequest(f.uid, { sessionId: sid }),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    12,
  );
  assert.equal((await f.usage.snapshot(f.uid)).used, 1);
  f.state.instant += 60 * 86400000;
  await assert.rejects(f.usage.allowRequest(f.uid, { sessionId: sid }), {
    code: "usage_limit",
  });
});

test("transcription has a separate ten-request weekly cap and rolls over on Monday", async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled(
    Array.from({ length: 15 }, () =>
      f.usage.allowRequest(f.uid, { kind: "transcription" }),
    ),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    10,
  );
  assert.equal((await f.usage.snapshot(f.uid)).used, 0);
  f.state.instant = Date.parse("2026-11-01T16:00:00Z");
  await f.usage.allowRequest(f.uid, { kind: "transcription" });
});

test("foreign sessions cannot reserve allowance and local mode remains unmetered", async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.usage.reservePractice(f.uid, randomUUID()), {
    status: 404,
  });
  await assert.rejects(f.usage.allowRequest(f.uid), { status: 400 });
  const stranger = randomUUID();
  await f.db
    .prepare(
      "INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)",
    )
    .run(stranger, "{}", "{}", "[]", new Date().toISOString());
  await assert.rejects(f.usage.reservePractice(stranger, await f.session()), {
    status: 404,
  });
  assert.equal((await f.usage.snapshot(f.uid)).used, 0);
  const local = createUsageService({ db: f.db, enabled: false });
  for (let i = 0; i < 20; i++)
    await local.allowRequest(f.uid, { sessionId: await f.session() });
  assert.equal((await local.snapshot(f.uid)).used, 0);
});

test("optional acoustic requests have a separate weekly cap and share the service budget without reserving practice slots", async (t) => {
  const f = await fixture(t);
  for (let index = 0; index < 10; index++)
    await f.usage.allowRequest(f.uid, { kind: "speech" });
  await assert.rejects(f.usage.allowRequest(f.uid, { kind: "speech" }), {
    code: "usage_limit",
  });
  assert.equal((await f.usage.snapshot(f.uid)).used, 0);
  const limited = await fixture(t, { dailyRequests: 1 });
  await limited.usage.allowRequest(limited.uid, { kind: "speech" });
  await assert.rejects(
    limited.usage.allowRequest(limited.uid, { kind: "transcription" }),
    { code: "usage_limit" },
  );
  assert.equal((await limited.usage.snapshot(limited.uid)).used, 0);
});

async function dailyUser(f) {
  await f.db
    .prepare("UPDATE users SET profile=? WHERE id=?")
    .run(
      JSON.stringify({ dailyWorkout: true, timezone: "Pacific/Honolulu" }),
      f.uid,
    );
}
async function dailyAttempt(f, sid, { receipt = true, owner = f.uid } = {}) {
  const id = randomUUID(),
    at = new Date(f.state.instant).toISOString();
  await f.db
    .prepare("INSERT INTO attempts VALUES(?,?,?,?,?)")
    .run(
      id,
      owner,
      sid,
      JSON.stringify({
        id,
        sessionId: sid,
        mode: "spin_speak",
        text: "A meaningful original answer with reasons.",
        createdAt: at,
      }),
      at,
    );
  if (receipt)
    await f.db
      .prepare("INSERT INTO daily_attempt_receipts VALUES(?,?,?,?,?,?)")
      .run(id, owner, "spin_speak", at.slice(0, 10), "Pacific/Honolulu", at);
  return id;
}
test("daily speaking remains available after optional allowance is exhausted across all seven days of a week", async (t) => {
  const f = await fixture(t, { instant: Date.parse("2026-11-02T01:00:00Z") });
  for (let n = 0; n < 5; n++)
    await f.usage.reservePractice(f.uid, await f.session());
  await dailyUser(f);
  for (let day = 0; day < 7; day++) {
    f.state.instant = Date.parse("2026-11-02T01:00:00Z") + day * 86400000;
    const sessionId = await f.session(),
      attemptId = await dailyAttempt(f, sessionId);
    await f.usage.reservePractice(f.uid, sessionId, {
      attemptId,
      kind: "evaluation",
    });
    await f.usage.allowRequest(f.uid, {
      sessionId,
      attemptId,
      kind: "evaluation",
    });
  }
  const optional = await f.session();
  await f.db
    .prepare("UPDATE sessions SET mode='read_reflect' WHERE id=?")
    .run(optional);
  await assert.rejects(f.usage.reservePractice(f.uid, optional), {
    code: "usage_limit",
  });
  assert.equal((await f.usage.snapshot(f.uid)).used, 5);
  assert.equal((await f.usage.snapshot(f.uid)).dailySpeakingIncluded, true);
});
test("daily coaching and evaluation budgets are independent, durable, bounded and reset by processing day", async (t) => {
  const f = await fixture(t);
  await dailyUser(f);
  const sessionId = await f.session(),
    attemptId = await dailyAttempt(f, sessionId);
  const coaching = await Promise.allSettled(
    Array.from({ length: 15 }, () =>
      f.usage.allowRequest(f.uid, { sessionId }),
    ),
  );
  assert.equal(
    coaching.filter((item) => item.status === "fulfilled").length,
    8,
  );
  const evaluations = await Promise.allSettled(
    Array.from({ length: 20 }, () =>
      f.usage.allowRequest(f.uid, { sessionId, attemptId, kind: "evaluation" }),
    ),
  );
  assert.equal(
    evaluations.filter((item) => item.status === "fulfilled").length,
    12,
  );
  assert.equal((await f.usage.snapshot(f.uid)).used, 0);
  const restored = createUsageService({
    db: f.db,
    enabled: true,
    clock: () => f.state.instant,
  });
  await assert.rejects(
    restored.allowRequest(f.uid, { sessionId, attemptId, kind: "evaluation" }),
    { code: "usage_limit" },
  );
  await f.db
    .prepare("UPDATE users SET profile=? WHERE id=?")
    .run(
      JSON.stringify({ dailyWorkout: true, timezone: "Pacific/Kiritimati" }),
      f.uid,
    );
  await assert.rejects(
    restored.allowRequest(f.uid, { sessionId, attemptId, kind: "evaluation" }),
    { code: "usage_limit" },
  );
  f.state.instant += 86400000;
  await restored.allowRequest(f.uid, {
    sessionId,
    attemptId,
    kind: "evaluation",
  });
});
test("daily evaluation requires an owned attempt, matching session and trusted receipt; optional modes cannot use the exemption", async (t) => {
  const f = await fixture(t);
  await dailyUser(f);
  const sessionId = await f.session(),
    attemptId = await dailyAttempt(f, sessionId, { receipt: false });
  await assert.rejects(
    f.usage.allowRequest(f.uid, { sessionId, attemptId, kind: "evaluation" }),
    { code: "daily_submission_required" },
  );
  await assert.rejects(
    f.usage.allowRequest(f.uid, { sessionId, kind: "evaluation" }),
    { code: "daily_submission_required" },
  );
  const otherSession = await f.session(),
    otherAttempt = await dailyAttempt(f, otherSession);
  await assert.rejects(
    f.usage.allowRequest(f.uid, {
      sessionId,
      attemptId: otherAttempt,
      kind: "evaluation",
    }),
    { code: "daily_submission_required" },
  );
  await assert.rejects(
    f.usage.allowRequest(f.uid, {
      sessionId: randomUUID(),
      attemptId: otherAttempt,
      kind: "evaluation",
    }),
    { status: 404 },
  );
  for (let n = 0; n < 5; n++) {
    const sid = await f.session();
    await f.db.prepare("UPDATE sessions SET mode='debate' WHERE id=?").run(sid);
    await f.usage.reservePractice(f.uid, sid);
  }
  const debate = await f.session();
  await f.db
    .prepare("UPDATE sessions SET mode='debate' WHERE id=?")
    .run(debate);
  await assert.rejects(f.usage.reservePractice(f.uid, debate), {
    code: "usage_limit",
  });
});
test("global capacity rejects daily work without spending a daily budget or an optional practice slot", async (t) => {
  const f = await fixture(t, { dailyRequests: 1 });
  await dailyUser(f);
  const sessionId = await f.session(),
    attemptId = await dailyAttempt(f, sessionId);
  await f.usage.allowRequest(f.uid, {
    sessionId,
    attemptId,
    kind: "evaluation",
  });
  await assert.rejects(
    f.usage.allowRequest(f.uid, { sessionId, attemptId, kind: "evaluation" }),
    { code: "usage_limit" },
  );
  const count = await f.db
    .prepare(
      "SELECT count FROM rate_limits WHERE key LIKE 'daily-evaluation:%'",
    )
    .get();
  assert.equal(count.count, 1);
  assert.equal((await f.usage.snapshot(f.uid)).used, 0);
});
