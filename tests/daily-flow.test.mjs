import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { silentWav } from "./helpers/silent-wav.mjs";

async function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "daily-flow-"));
  let clock = "2026-11-11T15:59:00Z";
  // Keep persisted completion timestamps and the injected calendar clock aligned.
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(clock) });
  const options = {
    dbPath: join(directory, "test.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: "",
    disableWorker: true,
    // Isolate completion/recovery from live RSS and from curated story reuse.
    newsService: { getFeed: async () => ({ status: 'ok', articles: Array.from({ length: 12 }, (_, index) => ({
      id: `daily-fixture-${index}`, title: `Community research update ${index}`, source: 'Fixture editorial',
      sourceUrl: `https://example.test/daily-${index}`, publishedAt: '2026-11-10T00:00:00Z', category: 'Science',
    })) }) },
    dailyNow: () => new Date(clock),
    gardenNow: () => Date.parse(clock),
    ...overrides,
  };
  let service, server, base;
  async function boot() {
    service = createApp(options);
    server = await new Promise((resolve) => {
      const listening = service.app.listen(0, "127.0.0.1", () =>
        resolve(listening),
      );
    });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  await boot();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(path, token, body, method = body ? "POST" : "GET") {
    const result = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: result.status, data: await result.json() };
  }
  async function ok(path, token, body, method) {
    const result = await request(path, token, body, method);
    assert.ok(result.status < 300, `${path}: ${JSON.stringify(result)}`);
    return result.data;
  }
  async function guest(enroll = true) {
    const { token } = await ok("/auth/guest", null, {});
    await ok(
      "/me",
      token,
      { timezone: "Asia/Singapore", onboardingComplete: true, consent: { recording: true } },
      "PATCH",
    );
    if (enroll) await ok("/daily-workout/enroll", token, {});
    return token;
  }
  async function spin(token) {
    const session = await ok("/sessions", token, { mode: "spin_speak" });
    const uploaded = await fetch(base + '/audio', { method: 'POST', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav',
    }, body: silentWav() });
    assert.equal(uploaded.status, 201);
    const audio = await uploaded.json();
    const attempt = await ok("/attempts", token, {
      sessionId: session.id,
      responseType: 'audio', audioId: audio.id,
      text: "Parks are useful because neighbours have a shared place to meet and exchange ideas.",
      idempotencyKey: randomUUID(),
    });
    await ok(`/attempts/${attempt.id}/evaluate`, token, {});
    return attempt;
  }
  async function reading(token) {
    const assignment = await ok("/read-aloud/assignment", token);
    const body = {
      idempotencyKey: randomUUID(),
      notes:
        "I practised the final phrase and noticed a comfortable place to pause.",
      selfReviewConfirmed: true,
    };
    return {
      assignment,
      body,
      result: await ok(
        `/read-aloud/assignments/${assignment.id}/submit`,
        token,
        body,
      ),
    };
  }
  return {
    request,
    ok,
    guest,
    spin,
    reading,
    get service() {
      return service;
    },
    setTime(value) {
      clock = value;
      t.mock.timers.setTime(Date.parse(value));
    },
    async restart() {
      await new Promise((resolve) => server.close(resolve));
      await service.close();
      await boot();
    },
  };
}

for (const order of ["reading-first", "speaking-first"])
  test(`real daily API flow ${order}, retries, export and restart`, async (t) => {
    const f = await fixture(t),
      token = await f.guest();
    const initial = await f.ok("/state", token);
    assert.equal(initial.dailyWorkout.completed, 0);
    assert.deepEqual(initial.quests, []);
    let reading;
    if (order === "reading-first") reading = await f.reading(token);
    else {
      await f.spin(token);
      await f.service.runJobs();
    }
    let state = await f.ok("/state", token);
    assert.equal(state.dailyWorkout.completed, 1);
    assert.equal(state.dailyWorkout.streak.securedToday, true);
    assert.equal(state.streak, 1);
    assert.equal(state.xp, order === "reading-first" ? 0 : 15);
    if (order === "reading-first") {
      await f.spin(token);
      await f.service.runJobs();
    } else reading = await f.reading(token);
    state = await f.ok("/state", token);
    assert.equal(state.dailyWorkout.completed, 2);
    assert.equal(state.xp, 15);
    assert.equal(state.wallet.coins, initial.wallet.coins + 5);
    assert.equal(state.streak, 1);
    assert.equal(reading.result.evaluation.speech.status, "not_assessed");
    assert.equal(reading.result.evaluation.speech.metrics, null);
    assert.equal(state.attempts.length, 1);
    assert.equal(state.readAloudAttempts.length, 1);
    const path = `/read-aloud/assignments/${reading.assignment.id}/submit`;
    const duplicates = await Promise.all([
      f.ok(path, token, reading.body),
      f.ok(path, token, reading.body),
    ]);
    assert.equal(duplicates[0].id, reading.result.id);
    assert.equal((await f.ok("/state", token)).xp, 15);
    assert.equal(
      (
        await f.request(path, token, {
          ...reading.body,
          notes:
            "I changed this observation after saving it to the application.",
        })
      ).status,
      409,
    );
    await f.restart();
    assert.equal((await f.ok("/state", token)).dailyWorkout.completed, 2);
    assert.equal(
      (await f.ok("/read-aloud/assignment", token)).latestAttempt.id,
      reading.result.id,
    );
    const exported = await f.ok("/export", token);
    assert.equal(exported.readAloudAttempts[0].id, reading.result.id);
  assert.equal(exported.dailyActivityCompletions.length, 2);
  assert.equal(exported.securedDailyWorkouts.length, 1);
  assert.equal((await f.request(`/attempts/${reading.result.id}/evaluate`, token, {})).status, 409);
    await f.reading(token);
    await f.spin(token);
    await f.service.runJobs();
    assert.equal((await f.ok("/state", token)).xp, 15);
  });

test("daily processing pins the receipt day, and a missed day preserves earned progress", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  await f.reading(token);
  await f.spin(token);
  f.setTime("2026-11-11T16:01:00Z");
  await f.service.runJobs();
  let state = await f.ok("/state", token);
  assert.equal(state.dailyWorkout.day, "2026-11-12");
  assert.equal(state.dailyWorkout.completed, 0);
  assert.equal(state.dailyWorkout.streak.current, 1);
  assert.equal(state.xp, 15);
  f.setTime("2026-11-13T16:01:00Z");
  state = await f.ok("/state", token);
  assert.equal(state.dailyWorkout.streak.current, 0);
  assert.equal(state.xp, 15);
});

test("reading validates ownership and attestation; Read & Reflect earns shared progress separately from the daily checklist", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    other = await f.guest();
  const assignment = await f.ok("/read-aloud/assignment", token);
  const second = await f.ok("/read-aloud/assignment", token);
  assert.equal(second.id, assignment.id);
  const valid = {
    idempotencyKey: randomUUID(),
    notes: "I practised the opening sentence and paused at the full stop.",
    selfReviewConfirmed: true,
  };
  const path = `/read-aloud/assignments/${assignment.id}/submit`;
  assert.equal((await f.request(path, other, valid)).status, 404);
  assert.equal(
    (await f.request(path, token, { ...valid, selfReviewConfirmed: false }))
      .status,
    400,
  );
  assert.equal(
    (
      await f.request(path, token, {
        ...valid,
        notes: "test test test test test",
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.request(path, token, { ...valid, audioId: randomUUID() })).status,
    404,
  );
  assert.equal(
    (
      await f.request("/attempts", token, {
        sessionId: assignment.id,
        text: "Please award the reading through the wrong endpoint.",
      })
    ).status,
    400,
  );
  const session = await f.ok("/sessions", token, {
    mode: "read_reflect",
    articleId: "ai-in-learning",
  });
  const attempt = await f.ok("/attempts", token, {
    sessionId: session.id,
    text: "I see an interesting idea here because shared spaces can encourage more discussion.",
  });
  await f.ok(`/attempts/${attempt.id}/evaluate`, token, {});
  await f.service.runJobs();
  assert.equal((await f.ok("/state", token)).xp, 15);
  assert.equal((await f.ok("/state", token)).wallet.coins, 3);
  assert.equal((await f.ok("/state", token)).streak, 1);
  assert.equal((await f.ok("/state", token)).dailyWorkout.completed, 0);
  const legacy = await f.guest(false);
  assert.equal((await f.request("/read-aloud/assignment", legacy)).status, 409);
  assert.equal(
    (await f.request("/daily-workout/enroll", token, { xp: 100 })).status,
    400,
  );
});

test("retired garden actions and optional avatar care cannot remove earned learning progress", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  await f.reading(token); await f.spin(token); await f.service.runJobs();
  const before = await f.ok('/state', token);
  await f.ok('/avatar/care', token, { careEnabled: true }, 'PATCH');
  f.setTime("2026-12-11T12:00:00Z");
  await f.restart();
  const state = await f.ok("/state", token);
  assert.equal(state.gamification.fullness.value, 0);
  assert.equal(state.xp, before.xp);
  assert.deepEqual(state.wallet, before.wallet);
  for (const action of ['plant','water','archive','restore'])
    assert.equal((await f.request(`/garden/${action}`, token, { plotId: 'plot-1', idempotencyKey: randomUUID() })).status, 410);
  await f.spin(token); await f.service.runJobs();
  const after = await f.ok('/state', token);
  assert.equal(after.xp, before.xp + 15);
  assert.equal(after.wallet.coins, before.wallet.coins + 2);
});

test("the production guest limit remains 30 per hour despite the isolated browser-test override", async (t) => {
  const f = await fixture(t);
  for (let index = 0; index < 30; index++)
    assert.equal((await f.request("/auth/guest", null, {})).status, 200);
  assert.equal((await f.request("/auth/guest", null, {})).status, 429);
});

test("job polling recovers delayed local scheduling without duplicate daily rewards", async (t) => {
  const f = await fixture(t, { disableWorker: false, jobDelay: 60000 });
  const token = await f.guest();
  const attempt = await f.spin(token);
  const job = await f.service.db.prepare("SELECT id FROM jobs WHERE attempt_id=?").get(attempt.id);
  const recovered = await f.ok(`/jobs/${job.id}`, token);
  assert.equal(recovered.status, "completed");
  assert.equal((await f.ok(`/attempts/${attempt.id}`, token)).status, "completed");
  assert.equal((await f.ok("/state", token)).xp, 15);
  await f.ok(`/jobs/${job.id}`, token);
  assert.equal((await f.ok("/state", token)).xp, 15);
});

test("enrollment preserves imported historical XP and garden artwork without retroactive daily credit", async (t) => {
  const f = await fixture(t);
  const token = await f.guest(false);
  // This represents a saved pre-retirement account, not a bypass of a current
  // planting endpoint. Those endpoints are intentionally unavailable.
  const owner = f.service.db.prepare('SELECT id FROM users').get();
  const plant = { id: 'plot-1', plantId: randomUUID(), plantType: 'fern', growth: 1,
    plantedAt: '2026-10-01T00:00:00Z', waterDueAt: '2026-10-03T00:00:00Z' };
  f.service.db.prepare('UPDATE users SET xp=?,wallet=?,plots=? WHERE id=?').run(30,
    JSON.stringify({ seeds: 4, water: 2, sunlight: 3 }), JSON.stringify([plant]), owner.id);
  const before = await f.ok('/state', token);
  assert.equal(before.plots[0].growth, 1);
  assert.equal(before.xp, 30);
  f.setTime("2026-12-11T12:00:00Z");
  await f.ok("/daily-workout/enroll", token, {});
  await f.ok("/daily-workout/enroll", token, {});
  const after = await f.ok("/state", token);
  assert.equal(after.xp, before.xp);
  assert.deepEqual(after.wallet, before.wallet);
  assert.equal(after.plots[0].plantId, before.plots[0].plantId);
  assert.equal(after.plots[0].growth, before.plots[0].growth);
  assert.equal(after.dailyWorkout.completed, 0);
  assert.equal(after.dailyWorkout.streak.securedToday, false);
  assert.equal(after.attempts.length, before.attempts.length);
});
