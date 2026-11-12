import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/database.mjs";
import {
  createWordBloomService,
  localWordBloom,
  reviewInterval,
} from "../server/wordbloom.mjs";
import {
  WORDBLOOM_PASSAGES,
  wordBloomCatalogue,
  wordSpans,
} from "../shared/wordbloom-catalogue.mjs";
import { validateBridge } from "../server/bridge-evaluator.mjs";
import { bridgeFixture } from "./helpers/bridge-fixture.mjs";

const text =
  "We could work together so the shared space is easier for everyone to use. Listening to different viewpoints could help us choose a design.";
const quote = text.slice(0, text.indexOf(".") + 1);
const sourceSpan = { start: 0, end: quote.length, quote };
const candidates = ["collaborate", "accessible", "perspective"].map(
  (wordId) => ({
    wordId,
    sourceSpan,
    reason:
      "An optional contextual vocabulary opportunity in this synthetic fixture.",
    type: "optional_enrichment",
    confidence: "high",
  }),
);
const fallback = {
  id: "fallback-v1",
  title: "Original fallback",
  text: "A small practice can leave room to try something new.",
  target: "A comfortable pace",
};

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "wordbloom-")),
    path = join(directory, "test.sqlite");
  let db = openDatabase(path),
    time = "2026-11-12T08:00:00.000Z";
  const uid = randomUUID(),
    other = randomUUID();
  for (const id of [uid, other])
    await db
      .prepare(
        "INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        id,
        JSON.stringify({
          dailyWorkout: true,
          timezone: "Asia/Singapore",
          goal: "articulation",
        }),
        '{"seeds":0,"water":0,"sunlight":0}',
        "[]",
        time,
      );
  t.after(async () => {
    await db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const service = () =>
    createWordBloomService({ db, now: () => new Date(time) });
  return {
    uid,
    other,
    get db() {
      return db;
    },
    get service() {
      return service();
    },
    setTime(value) {
      time = value;
    },
    async restart() {
      await db.close();
      db = openDatabase(path);
    },
    async attempt(answer = text, mode = "spin_speak", sid = randomUUID()) {
      const id = randomUUID();
      await db
        .prepare(
          "INSERT INTO sessions VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .run(sid, uid, mode, "{}", time);
      const attempt = {
        id,
        sessionId: sid,
        text: answer,
        mode,
        createdAt: time,
        status: "completed",
      };
      await db
        .prepare("INSERT INTO attempts VALUES(?,?,?,?,?)")
        .run(id, uid, sid, JSON.stringify(attempt), time);
      return attempt;
    },
    async introduce(count = 3) {
      const attempt = await this.attempt();
      const result = await this.service.processAttempt(uid, attempt, {
        provider: "openai",
        wordbloom: { candidates: candidates.slice(0, count), uses: [] },
      });
      return { attempt, result };
    },
    async assign() {
      return db.transaction(async () => {
        await db.lockUser(uid);
        const selected = await this.service.selectPassage(uid, fallback);
        const session = { ...selected, id: randomUUID(), mode: "read_aloud" };
        await db
          .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
          .run(session.id, uid, session.mode, JSON.stringify(session), time);
        await this.service.recordAssignment(uid, session);
        return session;
      });
    },
  };
}

test("approved words occur naturally in the matching original passages; local suggestions are optional, bounded enrichment", () => {
  for (const word of wordBloomCatalogue()) {
    const passage = WORDBLOOM_PASSAGES.find(
      (item) => item.theme === word.theme,
    );
    assert.ok(wordSpans(passage.text, word.word).length);
    assert.ok(passage.text.split(/\s+/).length < 130);
    assert.ok(word.meaning && word.example);
  }
  assert.equal(localWordBloom(text).length, 1);
  assert.equal(localWordBloom(text)[0].type, "optional_enrichment");
  assert.equal(localWordBloom(text)[0].confidence, "unassessed");
  assert.deepEqual(
    localWordBloom(
      "A precise and sufficient explanation can stand on its own.",
    ),
    [],
  );
  assert.deepEqual(
    localWordBloom("We could work together and collaborate."),
    [],
  );
});

for (const count of [0, 1, 2, 3])
  test(`WordBloom handles ${count} candidates without forced additions or duplicate suggestions`, async (t) => {
    const f = await fixture(t);
    const { attempt, result } = await f.introduce(count);
    assert.equal(result.discoveredWordIds.length, count);
    assert.equal((await f.service.summary(f.uid)).words.length, count);
    await f.service.processAttempt(f.uid, attempt, {
      provider: "openai",
      wordbloom: { candidates, uses: [] },
    });
    // A completed source is processed once, including a zero-candidate result.
    const again = await f.service.processAttempt(f.uid, attempt, {
      provider: "openai",
      wordbloom: { candidates, uses: [] },
    });
    assert.equal(again.discoveredWordIds.length, count);
    assert.equal((await f.service.summary(f.uid)).words.length, count);
  });

test("reading exposures are idempotent and adapt to optional self-report without fabricating acoustic or mastery evidence", async (t) => {
  const f = await fixture(t);
  await f.introduce();
  const session = await f.assign(),
    words = session.wordbloom.words;
  assert.equal(words.length, 3);
  for (const word of words)
    for (const span of word.spans)
      assert.equal(
        session.passage.text.slice(span.start, span.end).toLowerCase(),
        word.word,
      );
  const attempt = await f.attempt(
    "I practised a phrase and noticed a comfortable pause.",
    "read_aloud",
    session.id,
  );
  const reviews = [
    { vocabularyId: words[0].vocabularyId, outcome: "needs_practice" },
    { vocabularyId: words[1].vocabularyId, outcome: "comfortable" },
  ];
  await f.db.transaction(() =>
    f.service.completeReading(f.uid, session, attempt, reviews),
  );
  await f.db.transaction(() =>
    f.service.completeReading(f.uid, session, attempt, reviews),
  );
  const summary = await f.service.summary(f.uid);
  assert.ok(
    summary.words.every(
      (word) => word.exposureCount === 1 && word.productiveUseCandidates === 0,
    ),
  );
  assert.equal(
    summary.words.find((word) => word.id === words[0].vocabularyId)
      .intervalDays,
    1,
  );
  assert.equal(
    summary.words.find((word) => word.id === words[1].vocabularyId)
      .intervalDays,
    6,
  );
  assert.equal(
    summary.words.find((word) => word.id === words[2].vocabularyId)
      .intervalDays,
    3,
  );
  assert.ok(
    (await f.service.exportData(f.uid)).observations
      .filter((item) => item.kind === "reading_self_review")
      .every(
        (item) =>
          item.data.source === "self_report" &&
          item.data.acousticAssessment === false,
      ),
  );
  f.setTime("2026-11-13T08:00:01.000Z");
  const review = await f.assign();
  assert.deepEqual(
    review.wordbloom.words.map((word) => word.vocabularyId),
    [words[0].vocabularyId],
  );
  assert.equal(review.wordbloom.words[0].firstExposure, false);
  await f.restart();
  assert.equal((await f.service.summary(f.uid)).words[0].exposureCount, 1);
});

test("dismissal, familiarity, opt-out and account boundaries prevent unwanted resurfacing", async (t) => {
  const f = await fixture(t);
  await f.introduce();
  const words = (await f.service.summary(f.uid)).words;
  await f.service.changeWord(f.uid, words[0].id, "dismiss");
  await f.service.changeWord(f.uid, words[1].id, "familiar");
  await assert.rejects(
    f.service.changeWord(f.other, words[2].id, "dismiss"),
    (error) => error.status === 404,
  );
  const selected = await f.assign();
  assert.deepEqual(
    selected.wordbloom.words.map((word) => word.vocabularyId),
    [words[2].id],
  );
  await f.introduce();
  assert.equal(
    (await f.service.summary(f.uid)).words.find(
      (word) => word.id === words[0].id,
    ).status,
    "dismissed",
  );
  await f.db
    .prepare("UPDATE users SET profile=? WHERE id=?")
    .run(
      JSON.stringify({ dailyWorkout: true, wordBloomEnabled: false }),
      f.uid,
    );
  assert.equal((await f.assign()).passage.id, fallback.id);
  assert.equal((await f.service.context(f.uid)).enabled, false);
  assert.deepEqual((await f.service.exportData(f.other)).words, []);
  await f.db.prepare("DELETE FROM users WHERE id=?").run(f.uid);
  for (const table of [
    "user_vocabulary",
    "vocabulary_exposures",
    "vocabulary_observations",
    "wordbloom_processed_attempts",
  ])
    assert.equal(
      (await f.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get()).count,
      0,
    );
});

test("later word-use candidates are recorded separately and cannot mint mastery or duplicate evidence", async (t) => {
  const f = await fixture(t);
  await f.introduce(1);
  f.setTime("2026-11-14T08:00:00Z");
  const attempt = await f.attempt(
    "Neighbours can collaborate on a shared garden. Everyone can contribute one idea.",
  );
  const quote = "Neighbours can collaborate on a shared garden.";
  const evaluation = {
    provider: "openai",
    wordbloom: {
      candidates: [],
      uses: [
        {
          wordId: "collaborate",
          sourceSpan: { start: 0, end: quote.length, quote },
          confidence: "high",
        },
      ],
    },
  };
  await f.service.processAttempt(f.uid, attempt, evaluation);
  await f.service.processAttempt(f.uid, attempt, evaluation);
  const word = (await f.service.summary(f.uid)).words[0];
  assert.equal(word.productiveUseCandidates, 1);
  assert.equal(word.exposureCount, 0);
  assert.equal(word.status, "scheduled");
  const observation = (await f.service.exportData(f.uid)).observations.find(
    (item) => item.kind === "productive_use_candidate",
  );
  assert.equal(observation.data.validation, "unvalidated");
  assert.equal(observation.data.independence, "not_established");
});

test("BRIDGE vocabulary contract rejects unknown terms, invented excerpts, excess suggestions and unsupported use claims", () => {
  for (const count of [0, 1, 2, 3]) {
    const raw = bridgeFixture(text);
    raw.vocabulary_candidates = candidates
      .slice(0, count)
      .map((item) => ({
        word_id: item.wordId,
        source_quote: quote,
        reason: item.reason,
        improvement_type: item.type,
        confidence: "high",
      }));
    assert.equal(
      validateBridge(
        raw,
        { id: "fixture", mode: "spin_speak", text },
        { prompt: {} },
        "offline",
        "openai",
      ).wordbloom.candidates.length,
      count,
    );
  }
  for (const mutate of [
    (raw) => {
      raw.vocabulary_candidates = [
        {
          word_id: "unknown",
          source_quote: quote,
          reason: "Reason",
          improvement_type: "precision",
          confidence: "high",
        },
      ];
    },
    (raw) => {
      raw.vocabulary_candidates = Array.from({ length: 4 }, () => ({
        word_id: "collaborate",
        source_quote: quote,
        reason: "Reason",
        improvement_type: "precision",
        confidence: "high",
      }));
    },
    (raw) => {
      raw.vocabulary_candidates = [
        {
          word_id: "collaborate",
          source_quote: "An invented response.",
          reason: "Reason",
          improvement_type: "precision",
          confidence: "high",
        },
      ];
    },
    (raw) => {
      raw.productive_uses = [
        { word_id: "collaborate", source_quote: quote, confidence: "high" },
      ];
    },
  ]) {
    const raw = bridgeFixture(text);
    mutate(raw);
    assert.throws(
      () =>
        validateBridge(
          raw,
          { id: "fixture", mode: "spin_speak", text },
          { prompt: {} },
          "offline",
          "openai",
        ),
      (error) => error.code === "assessment_invalid_response",
    );
  }
  assert.equal(reviewInterval(60, "comfortable"), 60);
  assert.equal(reviewInterval(1, "needs_practice"), 1);
});
