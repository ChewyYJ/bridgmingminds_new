import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../server/database.mjs";
import { createLearnerProfile } from "../server/learner-profile.mjs";
import { validateBridge } from "../server/bridge-evaluator.mjs";
import { bridgeFixture } from "./helpers/bridge-fixture.mjs";
import { prompts } from "../server/content.mjs";
async function fixture(t) {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  const uid = randomUUID(),
    other = randomUUID(),
    now = "2026-11-12T08:00:00.000Z";
  for (const id of [uid, other])
    await db
      .prepare(
        "INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        id,
        JSON.stringify({ dailyWorkout: true, goal: "reasoning" }),
        "{}",
        "[]",
        now,
      );
  const learner = createLearnerProfile({ db, now: () => new Date(now) });
  let serial = 0;
  async function add(
    index,
    {
      confidence = "high",
      level = 2,
      model = "fixture-model",
      retry = false,
      focus = false,
      record = true,
      local = false,
      at,
    } = {},
  ) {
    serial++;
    const session = {
      id: randomUUID(),
      mode: "spin_speak",
      prompt: prompts.filter((p) => p.mode === "spin_speak")[index],
      ...(focus ? { learningFocus: { dimension: "R" } } : {}),
    };
    const attempt = {
      id: randomUUID(),
      sessionId: session.id,
      mode: "spin_speak",
      promptId: session.prompt.id,
      text: "A shared garden can bring neighbours together. Caring for plants gives people a reason to meet.",
      status: "completed",
      createdAt:
        at || `2026-11-12T07:00:${String(serial).padStart(2, "0")}.000Z`,
      ...(retry ? { retryOf: randomUUID() } : {}),
    };
    const raw = bridgeFixture(attempt.text, session.prompt.bridgeDimensions);
    for (const dimension of raw.dimensions) {
      if (dimension.status === "assessed") {
        dimension.confidence = confidence;
        dimension.level = dimension.key === "R" ? level : 3;
      }
    }
    const evaluation = validateBridge(raw, attempt, session, model, "openai");
    if (local) evaluation.provider = "local";
    attempt.evaluation = evaluation;
    await db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
      .run(
        session.id,
        uid,
        session.mode,
        JSON.stringify(session),
        attempt.createdAt,
      );
    await db
      .prepare("INSERT INTO attempts VALUES(?,?,?,?,?)")
      .run(
        attempt.id,
        uid,
        session.id,
        JSON.stringify(attempt),
        attempt.createdAt,
      );
    if (record)
      await db.transaction(() =>
        learner.record(uid, attempt, session, evaluation),
      );
    return { attempt, session, evaluation };
  }
  return { db, uid, other, learner, add, summary: () => learner.summary(uid) };
}
test("two comparable high-confidence gaps across distinct prompts yield a sourced fresh practice recommendation, without mastery", async (t) => {
  const f = await fixture(t);
  await f.add(0);
  assert.equal((await f.summary()).recommendation, null);
  const second = await f.add(1);
  const profile = await f.summary();
  assert.equal(profile.recommendation.dimension, "R");
  assert.equal(profile.recommendation.evidence.length, 2);
  assert.ok(
    ![prompts[0].id, prompts[1].id].includes(
      profile.recommendation.exercise.promptId,
    ),
  );
  assert.equal(profile.masteryStatus, "not_assessed");
  await f.db.transaction(() =>
    f.learner.record(f.uid, second.attempt, second.session, second.evaluation),
  );
  assert.equal((await f.summary()).observationCount, 12);
});
test("low confidence, repeated topics, revisions, guided sessions, local results and different model versions cannot manufacture a stable gap", async (t) => {
  for (const variation of [
    { confidence: "medium" },
    { retry: true },
    { focus: true },
    { model: "other-model" },
    { local: true },
  ]) {
    const f = await fixture(t);
    await f.add(0);
    await f.add(1, variation);
    assert.equal((await f.summary()).recommendation, null);
  }
  const f = await fixture(t);
  await f.add(0);
  await f.add(0);
  assert.equal((await f.summary()).recommendation, null);
});
test("new comparable strong observations retire a repeated-gap suggestion; expired observations do not diagnose a current weakness", async (t) => {
  const f = await fixture(t);
  await f.add(0);
  await f.add(1);
  assert.ok((await f.summary()).recommendation);
  await f.add(2, { level: 3 });
  await f.add(3, { level: 4 });
  assert.equal((await f.summary()).recommendation, null);
  const old = await fixture(t);
  await old.add(0, { at: "2026-01-01T00:00:00Z" });
  await old.add(1, { at: "2026-01-02T00:00:00Z" });
  assert.equal((await old.summary()).recommendation, null);
});
test("dismissal is idempotent, pause survives reads, and another account cannot see observations or dismiss a foreign suggestion", async (t) => {
  const f = await fixture(t);
  await f.add(0);
  await f.add(1);
  const id = (await f.summary()).recommendation.id;
  await assert.rejects(f.learner.preferences(f.other, { dismissId: id }), {
    status: 409,
  });
  assert.equal((await f.learner.summary(f.other)).observationCount, 0);
  await f.learner.preferences(f.uid, { dismissId: id });
  await f.learner.preferences(f.uid, { dismissId: id });
  assert.equal((await f.summary()).recommendation, null);
  await f.learner.preferences(f.uid, { enabled: false });
  assert.equal((await f.summary()).status, "paused");
  await f.learner.preferences(f.uid, { enabled: true });
  assert.equal((await f.summary()).enabled, true);
});
test("explicit history import materialises existing feedback without rescoring or duplicates and deletion cascades", async (t) => {
  const f = await fixture(t);
  await f.add(0, { record: false });
  await f.add(1, { record: false });
  assert.equal((await f.summary()).observationCount, 0);
  assert.ok((await f.learner.importHistory(f.uid)).recommendation);
  await f.learner.importHistory(f.uid);
  assert.equal((await f.learner.exportData(f.uid)).length, 12);
  await f.db.prepare("DELETE FROM users WHERE id=?").run(f.uid);
  assert.equal(
    (await f.db.prepare("SELECT COUNT(*) n FROM skill_observations").get()).n,
    0,
  );
});
test("invented evidence is rejected and does not commit partial observations", async (t) => {
  const f = await fixture(t),
    source = await f.add(0, { record: false });
  source.evaluation.dimensions[1].evidence_spans[0].quote =
    "Invented learner quote";
  await assert.rejects(
    f.db.transaction(() =>
      f.learner.record(
        f.uid,
        source.attempt,
        source.session,
        source.evaluation,
      ),
    ),
    { status: 409 },
  );
  assert.equal((await f.summary()).observationCount, 0);
});
