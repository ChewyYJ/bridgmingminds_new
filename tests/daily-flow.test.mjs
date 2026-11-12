import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { plantCareStatus } from "../shared/garden-care.mjs";

async function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "daily-flow-"));
  let clock = "2026-11-11T15:59:00Z";
  const options = {
    dbPath: join(directory, "test.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: "",
    disableWorker: true,
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
      { timezone: "Asia/Singapore", onboardingComplete: true },
      "PATCH",
    );
    if (enroll) await ok("/daily-workout/enroll", token, {});
    return token;
  }
  async function spin(token) {
    const session = await ok("/sessions", token, { mode: "spin_speak" });
    const attempt = await ok("/attempts", token, {
      sessionId: session.id,
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
    assert.equal(state.dailyWorkout.streak.securedToday, false);
    assert.equal(state.streak, 0);
    assert.equal(state.xp, order === "reading-first" ? 10 : 15);
    if (order === "reading-first") {
      await f.spin(token);
      await f.service.runJobs();
    } else reading = await f.reading(token);
    state = await f.ok("/state", token);
    assert.equal(state.dailyWorkout.completed, 2);
    assert.equal(state.xp, 25);
    assert.equal(state.wallet.seeds, initial.wallet.seeds + 1);
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
    assert.equal((await f.ok("/state", token)).xp, 25);
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
    assert.equal((await f.ok("/state", token)).xp, 25);
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
  assert.equal(state.xp, 25);
  f.setTime("2026-11-13T16:01:00Z");
  state = await f.ok("/state", token);
  assert.equal(state.dailyWorkout.streak.current, 0);
  assert.equal(state.xp, 25);
});

test("reading validates ownership, attestation and meaningful interaction; optional modes cannot secure a day", async (t) => {
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
  assert.equal((await f.ok("/state", token)).xp, 0);
  assert.equal((await f.ok("/state", token)).dailyWorkout.completed, 0);
  const legacy = await f.guest(false);
  assert.equal((await f.request("/read-aloud/assignment", legacy)).status, 409);
  assert.equal(
    (await f.request("/daily-workout/enroll", token, { xp: 100 })).status,
    400,
  );
});

test("daily gardens survive a long break and optional watering cannot grant mastery", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  const planted = await f.ok("/garden/plant", token, {
    plotId: "plot-1",
    plantType: "fern",
    idempotencyKey: randomUUID(),
  });
  const plant = planted.plots.find((item) => item.id === "plot-1");
  assert.equal(plant.carePolicy, "non_punitive_v1");
  f.setTime("2026-12-11T12:00:00Z");
  await f.restart();
  const state = await f.ok("/state", token);
  const retained = state.plots.find((item) => item.id === "plot-1");
  assert.equal(retained.plantId, plant.plantId);
  assert.equal(
    plantCareStatus(retained, Date.parse("2026-12-11T12:00:00Z")),
    "thirsty",
  );
  const watered = await f.ok("/garden/water", token, {
    plotId: plant.id,
    plantId: plant.plantId,
    idempotencyKey: randomUUID(),
  });
  assert.equal(watered.wallet.water, state.wallet.water);
  assert.equal(watered.xp, state.xp);
  assert.equal(watered.plots[0].growth, plant.growth);
  f.setTime("2027-01-11T12:00:00Z");
  const archived = await f.ok("/garden/archive", token, {
    plotId: plant.id,
    plantId: plant.plantId,
    idempotencyKey: randomUUID(),
  });
  const restored = await f.ok("/garden/restore", token, {
    archiveId: archived.archivedPlants[0].id,
    plotId: "plot-1",
    idempotencyKey: randomUUID(),
  });
  assert.equal(restored.plots[0].plantId, plant.plantId);
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

test("enrollment preserves historical XP and plant growth without retroactive daily credit", async (t) => {
  const f = await fixture(t);
  const token = await f.guest(false);
  await f.spin(token); await f.service.runJobs();
  const planted = await f.ok("/garden/plant", token, { plotId: "plot-1", plantType: "fern", idempotencyKey: randomUUID() });
  const plant = planted.plots[0];
  const before = await f.ok("/garden/water", token, { plotId: plant.id, plantId: plant.plantId, idempotencyKey: randomUUID() });
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
  assert.equal(after.plots[0].carePolicy, "non_punitive_v1");
  assert.equal(after.dailyWorkout.completed, 0);
  assert.equal(after.dailyWorkout.streak.securedToday, false);
  assert.equal(after.attempts.length, before.attempts.length);
});
