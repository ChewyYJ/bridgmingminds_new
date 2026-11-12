import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../server/database.mjs";
import { createWordBloomService } from "../server/wordbloom.mjs";
import { normalizeSpeechResult } from "../server/speech-assessment.mjs";
async function fixture(t) {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  let clock = "2026-11-01T08:00:00.000Z";
  const uid = randomUUID(),
    other = randomUUID();
  for (const id of [uid, other])
    await db
      .prepare(
        "INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        id,
        JSON.stringify({ dailyWorkout: true, timezone: "UTC" }),
        "{}",
        "[]",
        clock,
      );
  const words = createWordBloomService({ db, now: () => new Date(clock) });
  async function save(table, id, sid, data) {
    await db
      .prepare(`INSERT INTO ${table} VALUES(?,?,?,?,?)`)
      .run(id, uid, sid, JSON.stringify(data), clock);
  }
  const sid = randomUUID(),
    aid = randomUUID(),
    source = {
      id: aid,
      sessionId: sid,
      mode: "spin_speak",
      text: "We could work together on a shared garden. Each neighbour could help.",
      status: "completed",
      createdAt: clock,
    };
  await save("sessions", sid, "spin_speak", { id: sid, mode: "spin_speak" });
  await save("attempts", aid, sid, source);
  await words.processAttempt(uid, source, { provider: "local" });
  const item = async () => (await words.summary(uid)).words[0];
  async function reading(day, review = "not_assessed") {
    clock = `2026-11-${String(day).padStart(2, "0")}T08:00:00.000Z`;
    const selected = await words.selectPassage(uid, {
      id: "fallback",
      title: "Fallback",
      text: "No words are due.",
    });
    assert.equal(selected.wordbloom.words.length, 1, "word should be due");
    const session = {
      id: randomUUID(),
      mode: "read_aloud",
      createdAt: clock,
      ...selected,
    };
    await save("sessions", session.id, "read_aloud", session);
    await words.recordAssignment(uid, session);
    const attempt = {
      id: randomUUID(),
      sessionId: session.id,
      mode: "read_aloud",
      audioId: randomUUID(),
      passage: session.passage,
      status: "completed",
      createdAt: clock,
      text: "I practised the final phrase and noticed a pause.",
    };
    await save("attempts", attempt.id, session.id, attempt);
    await db.transaction(() =>
      words.completeReading(uid, session, attempt, [
        {
          vocabularyId: session.wordbloom.words[0].vocabularyId,
          outcome: review,
        },
      ]),
    );
    return { session, attempt };
  }
  function result(
    reading,
    {
      accuracy = 90,
      error = "None",
      confidence = 0.9,
      locale = "en-GB",
      missing = false,
    } = {},
  ) {
    return normalizeSpeechResult({
      referenceText: reading.session.passage.text,
      locale,
      sdkVersion: "offline-fixture",
      audioDurationMs: 1000,
      segments: missing
        ? []
        : [
            {
              RecognitionStatus: "Success",
              Offset: 0,
              Duration: 10000000,
              NBest: [
                {
                  Confidence: confidence,
                  Display: "collaborate",
                  PronunciationAssessment: { AccuracyScore: accuracy },
                  Words: [
                    {
                      Word: "collaborate",
                      Offset: 0,
                      Duration: 5000000,
                      PronunciationAssessment: {
                        AccuracyScore: accuracy,
                        ErrorType: error,
                      },
                    },
                  ],
                },
              ],
            },
          ],
    });
  }
  const record = (reading, options) =>
    words.recordPronunciation(
      uid,
      reading.attempt.id,
      result(reading, options),
    );
  return {
    db,
    uid,
    other,
    words,
    item,
    reading,
    result,
    record,
    profile: async (patch) => {
      const row = await db
        .prepare("SELECT profile FROM users WHERE id=?")
        .get(uid);
      await db
        .prepare("UPDATE users SET profile=? WHERE id=?")
        .run(JSON.stringify({ ...JSON.parse(row.profile), ...patch }), uid);
    },
  };
}
test("stable observations need distinct reading assignments; duplicate processing cannot lengthen intervals repeatedly", async (t) => {
  const f = await fixture(t),
    first = await f.reading(1);
  const initial = await f.record(first);
  assert.equal(initial.words[0].action, "unchanged");
  await f.record(first);
  assert.equal((await f.item()).intervalDays, 3);
  const second = await f.reading(5);
  const changed = await f.record(second);
  assert.equal(changed.words[0].action, "review_later");
  assert.equal((await f.item()).intervalDays, 6);
  await f.record(second);
  assert.equal((await f.item()).intervalDays, 6);
  const exported = await f.words.exportData(f.uid);
  assert.equal(exported.pronunciationObservations.length, 2);
  assert.equal(
    exported.observations.filter((o) => o.kind === "reading_self_review")
      .length,
    2,
  );
  assert.equal((await f.item()).productiveUseCandidates, 0);
});
test("repeated low word accuracy plus provider review flags shorten review without declaring an error or mastery", async (t) => {
  const f = await fixture(t),
    first = await f.reading(1);
  await f.record(first, { accuracy: 60, error: "Mispronunciation" });
  assert.equal((await f.item()).intervalDays, 3);
  const second = await f.reading(5);
  const decision = await f.record(second, {
    accuracy: 65,
    error: "Mispronunciation",
  });
  assert.equal(decision.words[0].action, "review_sooner");
  assert.equal((await f.item()).intervalDays, 1);
  assert.equal(
    (await f.item()).pronunciationReview.validationStatus,
    "unvalidated",
  );
  assert.equal((await f.item()).status, "introduced");
});
test("low confidence, absent speech and fabricated source alignment cannot become negative ability evidence", async (t) => {
  for (const options of [{ confidence: 0.4 }, { missing: true }]) {
    const f = await fixture(t),
      reading = await f.reading(1);
    const observed = await f.record(reading, options);
    assert.equal(observed.words[0].observationStatus, "insufficient_evidence");
    assert.equal((await f.item()).intervalDays, 3);
  }
  const f = await fixture(t),
    reading = await f.reading(1),
    result = f.result(reading);
  result.words[0].sourceSpan.start++;
  const observed = await f.words.recordPronunciation(
    f.uid,
    reading.attempt.id,
    result,
  );
  assert.equal(observed.words[0].outcome, "not_assessed");
});
test("different locales do not combine and a needs-practice self-report prevents a longer interval", async (t) => {
  const f = await fixture(t),
    first = await f.reading(1);
  await f.record(first, { locale: "en-US" });
  const second = await f.reading(5);
  assert.equal(
    (await f.record(second, { locale: "en-GB" })).words[0].action,
    "unchanged",
  );
  const third = await f.reading(9, "needs_practice");
  assert.equal(
    (await f.record(third, { locale: "en-GB" })).words[0].action,
    "unchanged",
  );
  assert.equal((await f.item()).intervalDays, 1);
});
test("late processing records provenance without rewriting a newer reading schedule", async (t) => {
  const f = await fixture(t),
    first = await f.reading(1),
    second = await f.reading(5);
  await f.record(second, { accuracy: 60, error: "Mispronunciation" });
  const before = await f.item();
  const delayed = await f.record(first, {
    accuracy: 60,
    error: "Mispronunciation",
  });
  assert.equal(delayed.words[0].action, "unchanged");
  assert.equal((await f.item()).dueAt, before.dueAt);
  assert.equal(
    (await f.item()).pronunciationReview.occurredAt,
    second.session.createdAt,
  );
});
test("pause, dismissal, familiar declarations, account isolation and deletion preserve user control", async (t) => {
  for (const action of ["pause", "dismiss", "familiar"]) {
    const f = await fixture(t),
      reading = await f.reading(1);
    if (action === "pause") await f.profile({ wordBloomEnabled: false });
    else await f.words.changeWord(f.uid, (await f.item()).id, action);
    assert.deepEqual((await f.record(reading)).words, []);
    assert.equal(
      (await f.words.exportData(f.uid)).pronunciationObservations.length,
      0,
    );
  }
  const f = await fixture(t),
    reading = await f.reading(1);
  await assert.rejects(
    f.words.recordPronunciation(f.other, reading.attempt.id, f.result(reading)),
    { status: 404 },
  );
  await f.record(reading);
  await f.db.prepare("DELETE FROM users WHERE id=?").run(f.uid);
  assert.equal(
    (
      await f.db
        .prepare("SELECT COUNT(*) n FROM vocabulary_pronunciation")
        .get()
    ).n,
    0,
  );
});
