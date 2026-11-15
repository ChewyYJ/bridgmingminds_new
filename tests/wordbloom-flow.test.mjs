import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { wordBloomWord } from "../shared/wordbloom-catalogue.mjs";

const answer =
  "We could work together on a shared garden. Each neighbour could suggest a plant and explain what it needs.";
const notes =
  "I practised the final sentence and paused before its last phrase.";
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "wordbloom-flow-"));
  let clock = "2026-11-12T08:00:00.000Z",
    service,
    server,
    base;
  const options = {
    dbPath: join(directory, "test.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: "",
    disableWorker: true,
    dailyNow: () => new Date(clock),
  };
  async function boot() {
    service = createApp(options);
    server = await new Promise((resolve) => {
      const current = service.app.listen(0, "127.0.0.1", () =>
        resolve(current),
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
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }
  const ok = async (...args) => {
    const result = await request(...args);
    assert.ok(result.status < 300, JSON.stringify(result));
    return result.data;
  };
  const guest = async () => {
    const { token } = await ok("/auth/guest", null, {});
    await ok(
      "/me",
      token,
      { timezone: "Asia/Singapore", onboardingComplete: true },
      "PATCH",
    );
    await ok("/daily-workout/enroll", token, {});
    return token;
  };
  const spin = async (token, text = answer) => {
    const session = await ok("/sessions", token, { mode: "spin_speak", promptId: "society-shared-space" });
    // Model the saved BRIDGE sessions created before the new speaking journey.
    // Their original automatic vocabulary discovery remains supported.
    delete session.dailySpeakingJourney;
    await service.db.prepare("UPDATE sessions SET data=? WHERE id=?").run(JSON.stringify(session), session.id);
    const attempt = await ok("/attempts", token, {
      sessionId: session.id,
      text,
    });
    await ok(`/attempts/${attempt.id}/evaluate`, token, {});
    await service.runJobs();
    return ok(`/attempts/${attempt.id}`, token);
  };
  const read = async (token, assignment, reviews) => {
    const body = {
      idempotencyKey: randomUUID(),
      notes,
      selfReviewConfirmed: true,
      ...(reviews ? { wordReviews: reviews } : {}),
    };
    const path = `/read-aloud/assignments/${assignment.id}/submit`;
    return { body, path, result: await ok(path, token, body) };
  };
  return {
    request,
    ok,
    guest,
    spin,
    read,
    setTime(value) {
      clock = value;
    },
    get db() {
      return service.db;
    },
    async restart() {
      await new Promise((resolve) => server.close(resolve));
      await service.close();
      await boot();
    },
  };
}

test("dictionary reviews resume, rotate contexts and award the daily completion bonus once", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const other = await f.guest();
  await f.spin(token);
  const baseline = await f.ok("/state", token);
  const dictionary = () => f.ok("/wordbloom/summary", token);
  const start = () => f.ok("/wordbloom/reviews", token, {});
  const reviewPath = (id) => `/wordbloom/reviews/${id}`;
  const complete = (id, answer) =>
    f.ok(reviewPath(id), token, {
      step: "reflect",
      answer,
    });
  const [saved] = (await dictionary()).words;
  assert.equal(saved.recallDue, true);
  const [first, duplicate] = await Promise.all([start(), start()]);
  assert.deepEqual(first, duplicate);
  assert.equal(first.word, undefined);
  assert.ok(first.passage.includes("____"));
  assert.equal(
    (
      await f.request(reviewPath(first.id), other, {
        step: "recall",
        answer: "collaborate",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request(reviewPath(first.id), token, {
        step: "reflect",
        answer: "We collaborate in teams.",
      })
    ).status,
    409,
  );
  const recallInput = { step: "recall", answer: "Collaborate" };
  await f.ok(reviewPath(first.id), token, recallInput);
  await f.restart();
  assert.equal((await start()).recall.correct, true);
  assert.equal(
    (
      await f.request(reviewPath(first.id), token, {
        step: "reflect",
        answer: "We help one another.",
      })
    ).status,
    400,
  );
  const reflection =
    "We can collaborate by sharing the research and the writing.";
  const [done, retried] = await Promise.all([
    complete(first.id, reflection),
    complete(first.id, reflection),
  ]);
  assert.deepEqual(done.result, retried.result);
  assert.equal(done.result.xp, 5);
  assert.equal(done.result.dueAt, "2026-11-13T08:00:00.000Z");
  assert.equal((await f.ok("/state", token)).xp, baseline.xp + 5);
  assert.equal(await start(), null);

  const additional = wordBloomWord("evidence");
  const sameDay = "2026-11-12T09:00:00.000Z";
  f.setTime(sameDay);
  await f.db
    .prepare(
      `INSERT INTO user_vocabulary (id,user_id,word_id,source_attempt_id,source_day,status,data,due_at,interval_days,exposure_count,productive_count,created_at,updated_at)
    SELECT ?,user_id,?,source_attempt_id,source_day,'scheduled',?,due_at,3,0,0,?,? FROM user_vocabulary WHERE id=?`,
    )
    .run(
      randomUUID(),
      additional.id,
      JSON.stringify({ ...additional, source: saved.source }),
      sameDay,
      sameDay,
      saved.id,
    );
  const second = await start();
  await f.ok(reviewPath(second.id), token, { step: "recall", answer: "guess" });
  const secondDone = await complete(
    second.id,
    "I would look for evidence in the bus arrival logs.",
  );
  assert.equal(secondDone.result.correct, 0);
  assert.equal(secondDone.result.xp, 0);
  assert.equal((await f.ok("/home/today", token)).completed, 1);

  f.setTime(done.result.dueAt);
  const later = await start();
  assert.notEqual(later.title, first.title);
  await f.ok(reviewPath(later.id), token, recallInput);
  const laterDone = await complete(
    later.id,
    "We can collaborate on the poster and share the editing.",
  );
  assert.equal(laterDone.result.streak, 2);
  assert.equal(laterDone.result.dueAt, "2026-11-20T08:00:00.000Z");
  const evidence = (await dictionary()).words.find((word) => word.wordId === "evidence");
  await f.ok(`/wordbloom/${evidence.id}`, token, { action: "familiar" }, "PATCH");
  f.setTime(laterDone.result.dueAt);
  const third = await start();
  await f.ok(reviewPath(third.id), token, recallInput);
  const thirdDone = await complete(third.id, reflection);
  assert.equal(thirdDone.result.streak, 3);
  assert.equal(thirdDone.result.dueAt, "2026-12-20T08:00:00.000Z");
  assert.equal((await f.ok("/export", token)).wordBloom.reviews.length, 4);
});

test("speaking → WordBloom → reading → adaptive review uses actual persisted activities without extra XP", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  const spoken = await f.spin(token);
  assert.equal(spoken.wordBloom.discoveredWordIds.length, 1);
  let word = (await f.ok("/wordbloom/summary", token)).words[0];
  assert.equal(word.word, "collaborate");
  assert.equal(word.source.kind, "curated_match");
  assert.equal(word.source.confidence, "unassessed");
  const assignment = await f.ok("/read-aloud/assignment", token);
  assert.equal(assignment.wordbloom.words[0].vocabularyId, word.id);
  assert.ok(assignment.passage.text.includes("collaborate"));
  const completed = await f.read(token, assignment, [
    { vocabularyId: word.id, outcome: "needs_practice" },
  ]);
  assert.equal((await f.ok("/state", token)).xp, 25);
  assert.equal((await f.ok("/state", token)).dailyWorkout.completed, 2);
  await f.ok(completed.path, token, completed.body);
  word = (await f.ok("/wordbloom/summary", token)).words[0];
  assert.equal(word.exposureCount, 1);
  assert.equal(word.intervalDays, 1);
  assert.equal(word.productiveUseCandidates, 0);
  await f.spin(
    token,
    "Neighbours can collaborate on a shared garden. Each person can contribute an idea.",
  );
  word = (await f.ok("/wordbloom/summary", token)).words[0];
  assert.equal(word.productiveUseCandidates, 1);
  assert.equal(word.exposureCount, 1);
  assert.equal(word.status, "introduced");
  assert.equal((await f.ok("/state", token)).xp, 25);
  f.setTime("2026-11-13T08:00:01.000Z");
  await f.restart();
  const review = await f.ok("/read-aloud/assignment", token);
  assert.equal(review.wordbloom.words[0].firstExposure, false);
  assert.equal(review.wordbloom.words[0].word, "collaborate");
  const exported = await f.ok("/export", token);
  assert.equal(exported.wordBloom.words[0].exposureCount, 1);
  assert.equal(exported.wordBloom.processedAttempts.length, 2);
  assert.equal(
    exported.wordBloom.observations.find(
      (item) => item.kind === "reading_self_review",
    ).data.acousticAssessment,
    false,
  );
});

test("reading before speaking never mutates the assigned passage; words appear in the next eligible assignment", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  const original = await f.ok("/read-aloud/assignment", token);
  assert.deepEqual(original.wordbloom.words, []);
  await f.read(token, original);
  await f.spin(token);
  const same = await f.ok("/read-aloud/assignment", token);
  assert.equal(same.id, original.id);
  assert.deepEqual(same.passage, original.passage);
  assert.deepEqual(same.wordbloom, original.wordbloom);
  f.setTime("2026-11-13T08:00:00.000Z");
  const next = await f.ok("/read-aloud/assignment", token);
  assert.notEqual(next.id, original.id);
  assert.equal(next.wordbloom.words[0].word, "collaborate");
  assert.deepEqual(same.passage, original.passage);
});

test("concurrent assignment, dismissal, explicit familiarity, opt-out and account deletion preserve privacy and core completion", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    other = await f.guest();
  await f.spin(token);
  const word = (await f.ok("/wordbloom/summary", token)).words[0];
  const assignments = await Promise.all(
    Array.from({ length: 3 }, () => f.ok("/read-aloud/assignment", token)),
  );
  assert.equal(new Set(assignments.map((item) => item.id)).size, 1);
  assert.equal((await f.ok("/export", token)).wordBloom.exposures.length, 1);
  assert.equal(
    (
      await f.request(
        `/wordbloom/${word.id}`,
        other,
        { action: "dismiss" },
        "PATCH",
      )
    ).status,
    404,
  );
  assert.deepEqual((await f.ok("/wordbloom/summary", other)).words, []);
  const invalid = await f.request(
    `/read-aloud/assignments/${assignments[0].id}/submit`,
    token,
    {
      idempotencyKey: randomUUID(),
      notes,
      selfReviewConfirmed: true,
      wordReviews: [{ vocabularyId: randomUUID(), outcome: "comfortable" }],
    },
  );
  assert.equal(invalid.status, 400);
  await f.ok("/me", token, { wordBloomEnabled: false }, "PATCH");
  await f.read(token, assignments[0]);
  assert.equal((await f.ok("/state", token)).xp, 25);
  assert.equal(
    (await f.ok("/wordbloom/summary", token)).words[0].exposureCount,
    0,
  );
  f.setTime("2026-11-13T08:00:00.000Z");
  assert.deepEqual(
    (await f.ok("/read-aloud/assignment", token)).wordbloom.words,
    [],
  );
  await f.ok("/me", token, { wordBloomEnabled: true }, "PATCH");
  await f.ok(`/wordbloom/${word.id}`, token, { action: "dismiss" }, "PATCH");
  await f.spin(token);
  f.setTime("2026-11-14T08:00:00.000Z");
  assert.deepEqual(
    (await f.ok("/read-aloud/assignment", token)).wordbloom.words,
    [],
  );
  assert.equal(
    (await f.ok("/wordbloom/summary", token)).words[0].status,
    "dismissed",
  );
  await f.ok(`/wordbloom/${word.id}`, token, { action: "familiar" }, "PATCH");
  assert.equal(
    (await f.ok("/wordbloom/summary", token)).words[0].familiaritySource,
    "self_report",
  );
  const uid = (await f.ok("/state", token)).profile.id;
  await f.ok("/account", token, undefined, "DELETE");
  for (const table of [
    "user_vocabulary",
    "vocabulary_exposures",
    "vocabulary_observations",
    "wordbloom_processed_attempts",
  ])
    assert.equal(
      (
        await f.db
          .prepare(`SELECT COUNT(*) count FROM ${table} WHERE user_id=?`)
          .get(uid)
      ).count,
      0,
    );
});
