import { randomUUID } from "node:crypto";
import { localDay } from "./daily-workout.mjs";
import { createVocabularyPronunciation } from "./vocabulary-pronunciation.mjs";
import { anchorProviderEvidence } from "./evaluator.mjs";
import {
  wordBloomCatalogue,
  wordBloomWord,
  wordSpans,
  WORDBLOOM_PASSAGES,
  WORDBLOOM_VERSION,
} from "../shared/wordbloom-catalogue.mjs";

const activeStatuses = new Set(["scheduled", "introduced", "review_due"]);
export function reviewInterval(days, outcome) {
  if (outcome === "needs_practice") return Math.max(1, Math.floor(days / 2));
  if (outcome === "comfortable")
    return Math.min(60, Math.max(3, Math.ceil(days * 1.8)));
  return Math.min(60, Math.max(1, days));
}

/** One optional enrichment match, never a semantic judgment or numerical score. */
export function localWordBloom(answer) {
  if (
    !/\b(?:we|people|neighbours|neighbors|students|teams) (?:can|could|should) work together\b/iu.test(
      answer,
    ) ||
    wordSpans(answer, "collaborate").length
  )
    return [];
  const quote = (answer.match(/[^.!?\n]+[.!?]?/gu) || [])
    .map((sentence) => sentence.trim())
    .find(
      (sentence) =>
        sentence.length <= 400 &&
        /\bwork together\b/iu.test(sentence) &&
        answer.indexOf(sentence) === answer.lastIndexOf(sentence),
    );
  if (!quote) return [];
  return [
    {
      wordId: "collaborate",
      sourceSpan: anchorProviderEvidence({ quote }, answer),
      reason:
        "An optional word related to a phrase you used. Simple wording is equally welcome.",
      type: "optional_enrichment",
      confidence: "unassessed",
    },
  ];
}

export function createWordBloomService({ db, now = () => new Date() }) {
  const pronunciation = createVocabularyPronunciation({ db, now });
  const instant = () => new Date(now()).toISOString();
  const profile = async (uid) => {
    const owner = await db
      .prepare("SELECT profile FROM users WHERE id=?")
      .get(uid);
    if (!owner)
      throw Object.assign(new Error("Please sign in again."), { status: 401 });
    return JSON.parse(owner.profile);
  };
  const enabled = (user) =>
    user.dailyWorkout === true && user.wordBloomEnabled !== false;
  const rows = (uid) =>
    db
      .prepare(
        "SELECT * FROM user_vocabulary WHERE user_id=? ORDER BY created_at,id",
      )
      .all(uid);
  const publicWord = (row) => ({
    ...JSON.parse(row.data),
    id: row.id,
    wordId: row.word_id,
    status: row.status,
    dueAt: row.due_at,
    intervalDays: Number(row.interval_days),
    exposureCount: Number(row.exposure_count),
    productiveUseCandidates: Number(row.productive_count),
  });
  async function context(uid) {
    const user = await profile(uid);
    if (!enabled(user))
      return {
        enabled: false,
        catalogue: [],
        knownWordIds: [],
        reviewWords: [],
        goal: user.goal,
      };
    const saved = await rows(uid);
    return {
      enabled: true,
      catalogue: wordBloomCatalogue(),
      knownWordIds: saved.map((row) => row.word_id),
      reviewWords: saved
        .filter((row) => row.status !== "dismissed")
        .map((row) => ({
          wordId: row.word_id,
          word: JSON.parse(row.data).word,
          meaning: JSON.parse(row.data).meaning,
        })),
      goal: user.goal,
    };
  }
  async function processAttempt(
    uid,
    attempt,
    evaluation,
    { discover = true } = {},
  ) {
    return db.transaction(async () => {
      await db.lockUser(uid);
      const user = await profile(uid);
      if (
        !enabled(user) ||
        attempt.mode !== "spin_speak" ||
        attempt.status !== "completed"
      )
        return { version: WORDBLOOM_VERSION, discoveredWordIds: [] };
      const saved = await db
        .prepare("SELECT data FROM attempts WHERE id=? AND user_id=?")
        .get(attempt.id, uid);
      if (
        !saved ||
        JSON.parse(saved.data).text !== attempt.text ||
        JSON.parse(saved.data).status !== "completed"
      )
        throw Object.assign(
          new Error("Completed vocabulary source not found."),
          { status: 404 },
        );
      const processed = await db
        .prepare(
          "SELECT data FROM wordbloom_processed_attempts WHERE attempt_id=? AND user_id=?",
        )
        .get(attempt.id, uid);
      if (processed) return JSON.parse(processed.data);
      const before = await rows(uid),
        known = new Set(before.map((row) => row.word_id));
      const at = instant(),
        day = localDay(at, user.timezone || "UTC");
      let remaining = Math.max(
        0,
        3 - before.filter((row) => row.source_day === day).length,
      );
      const candidates =
        evaluation.provider === "local"
          ? localWordBloom(attempt.text)
          : evaluation.wordbloom?.candidates || [];
      const discovered = [];
      for (const candidate of (discover ? candidates : []).slice(0, 3)) {
        const word = wordBloomWord(candidate.wordId);
        if (
          !word ||
          known.has(word.id) ||
          !remaining ||
          wordSpans(attempt.text, word.word).length ||
          candidate.confidence === "low"
        )
          continue;
        const span = anchorProviderEvidence(candidate.sourceSpan, attempt.text);
        const id = randomUUID();
        const data = {
          ...word,
          source: {
            attemptId: attempt.id,
            receivedAt: attempt.createdAt,
            span,
            kind:
              evaluation.provider === "local"
                ? "curated_match"
                : "llm_contextual",
            reason: candidate.reason,
            improvementType: candidate.type,
            confidence: candidate.confidence,
          },
          familiaritySource: null,
        };
        const inserted = await db
          .prepare(
            `INSERT INTO user_vocabulary
          (id,user_id,word_id,source_attempt_id,source_day,status,data,due_at,interval_days,exposure_count,productive_count,created_at,updated_at)
          VALUES(?,?,?,?,?,'scheduled',?,?,3,0,0,?,?) ON CONFLICT(user_id,word_id) DO NOTHING`,
          )
          .run(
            id,
            uid,
            word.id,
            attempt.id,
            day,
            JSON.stringify(data),
            at,
            at,
            at,
          );
        if (!inserted.changes) continue;
        known.add(word.id);
        remaining--;
        discovered.push(id);
        await db
          .prepare("INSERT INTO vocabulary_observations VALUES(?,?,?,?,?,?,?)")
          .run(
            randomUUID(),
            uid,
            id,
            attempt.id,
            "suggestion",
            JSON.stringify({ source: data.source }),
            at,
          );
      }
      const uses =
        evaluation.provider === "local"
          ? before
              .filter(
                (row) =>
                  row.status !== "dismissed" &&
                  wordSpans(attempt.text, row.word_id).length,
              )
              .map((row) => {
                const quote = (attempt.text.match(/[^.!?\n]+[.!?]?/gu) || [])
                  .map((part) => part.trim())
                  .find(
                    (part) =>
                      part.length <= 400 &&
                      wordSpans(part, row.word_id).length &&
                      attempt.text.indexOf(part) ===
                        attempt.text.lastIndexOf(part),
                  );
                return quote
                  ? {
                      wordId: row.word_id,
                      sourceSpan: anchorProviderEvidence(
                        { quote },
                        attempt.text,
                      ),
                      confidence: "unassessed",
                      kind: "lexical_mention",
                    }
                  : null;
              })
              .filter(Boolean)
          : evaluation.wordbloom?.uses || [];
      for (const use of uses.slice(0, 3)) {
        const row = before.find(
          (item) => item.word_id === use.wordId && item.status !== "dismissed",
        );
        if (!row || row.source_attempt_id === attempt.id) continue;
        const source = JSON.parse(row.data).source;
        if (Date.parse(attempt.createdAt) < Date.parse(source.receivedAt))
          continue;
        const span = anchorProviderEvidence(use.sourceSpan, attempt.text);
        if (!wordSpans(span.quote, row.word_id).length) continue;
        const inserted = await db
          .prepare(
            `INSERT INTO vocabulary_observations VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(user_id,vocabulary_id,attempt_id,kind) DO NOTHING`,
          )
          .run(
            randomUUID(),
            uid,
            row.id,
            attempt.id,
            "productive_use_candidate",
            JSON.stringify({
              span,
              source: use.kind || "llm_contextual",
              confidence: use.confidence,
              validation: "unvalidated",
              independence: "not_established",
              acousticAssessment: false,
            }),
            at,
          );
        if (inserted.changes)
          await db
            .prepare(
              "UPDATE user_vocabulary SET productive_count=productive_count+1,updated_at=? WHERE id=? AND user_id=?",
            )
            .run(at, row.id, uid);
      }
      const result = {
        version: WORDBLOOM_VERSION,
        discoveredWordIds: discovered,
      };
      await db
        .prepare("INSERT INTO wordbloom_processed_attempts VALUES(?,?,?,?)")
        .run(attempt.id, uid, JSON.stringify(result), at);
      return result;
    });
  }
  async function saveSelected(uid, attemptId, wordIds) {
    return db.transaction(async () => {
      await db.lockUser(uid);
      const user = await profile(uid);
      const row = await db
        .prepare("SELECT data FROM attempts WHERE id=? AND user_id=?")
        .get(attemptId, uid);
      const attempt = row && JSON.parse(row.data);
      if (!attempt || attempt.status !== "completed")
        throw Object.assign(new Error("Completed response not found."), {
          status: 404,
        });
      const offered = attempt.dailyScript?.vocabulary || [];
      if (
        wordIds.length > 3 ||
        new Set(wordIds).size !== wordIds.length ||
        wordIds.some((id) => !offered.some((word) => word.wordId === id))
      )
        throw Object.assign(
          new Error("Choose words from your sample script."),
          { status: 400 },
        );
      const at = instant(),
        day = localDay(at, user.timezone || "UTC");
      for (const wordId of wordIds) {
        const word = wordBloomWord(wordId);
        const span = wordSpans(attempt.dailyScript.text, word.word)[0];
        const data = {
          ...word,
          familiaritySource: null,
          source: {
            attemptId,
            receivedAt: attempt.createdAt,
            span: {
              ...span,
              quote: attempt.dailyScript.text.slice(span.start, span.end),
            },
            kind: "selected_sample",
            reason:
              "You selected this word from your sample script for Read Aloud practice.",
            confidence: "unassessed",
          },
        };
        await db
          .prepare(
            `INSERT INTO user_vocabulary (id,user_id,word_id,source_attempt_id,source_day,status,data,due_at,interval_days,exposure_count,productive_count,created_at,updated_at) VALUES(?,?,?,?,?,'scheduled',?,?,3,0,0,?,?) ON CONFLICT(user_id,word_id) DO NOTHING`,
          )
          .run(
            randomUUID(),
            uid,
            wordId,
            attemptId,
            day,
            JSON.stringify(data),
            at,
            at,
            at,
          );
      }
      return summary(uid);
    });
  }
  async function selectPassage(uid, fallback) {
    if (!enabled(await profile(uid)))
      return {
        passage: { ...fallback },
        wordbloom: { version: WORDBLOOM_VERSION, words: [] },
      };
    const at = instant();
    const eligible = (await rows(uid))
      .filter((row) => activeStatuses.has(row.status) && row.due_at <= at)
      .sort(
        (a, b) =>
          Number(a.exposure_count > 0) - Number(b.exposure_count > 0) ||
          a.due_at.localeCompare(b.due_at) ||
          a.created_at.localeCompare(b.created_at) ||
          a.id.localeCompare(b.id),
      );
    if (!eligible.length)
      return {
        passage: { ...fallback },
        wordbloom: { version: WORDBLOOM_VERSION, words: [] },
      };
    const theme = JSON.parse(eligible[0].data).theme;
    const selected = eligible
      .filter((row) => JSON.parse(row.data).theme === theme)
      .slice(0, 3);
    const passage = WORDBLOOM_PASSAGES.find((item) => item.theme === theme);
    if (
      !passage ||
      !selected.every((row) => wordSpans(passage.text, row.word_id).length)
    )
      return {
        passage: { ...fallback },
        wordbloom: { version: WORDBLOOM_VERSION, words: [] },
      };
    return {
      passage: { ...passage },
      wordbloom: {
        version: WORDBLOOM_VERSION,
        words: selected.map((row) => {
          const word = publicWord(row);
          return {
            vocabularyId: row.id,
            wordId: row.word_id,
            word: word.word,
            meaning: word.meaning,
            example: word.example,
            firstExposure: Number(row.exposure_count) === 0,
            spans: wordSpans(passage.text, word.word),
          };
        }),
      },
    };
  }
  async function recordAssignment(uid, session) {
    for (const word of session.wordbloom?.words || [])
      await db
        .prepare(
          `INSERT INTO vocabulary_exposures VALUES(?,?,?,?,?,NULL,NULL)
        ON CONFLICT(user_id,vocabulary_id,session_id) DO NOTHING`,
        )
        .run(randomUUID(), uid, word.vocabularyId, session.id, instant());
  }
  async function completeReading(uid, session, attempt, reviews = []) {
    if (!enabled(await profile(uid))) return;
    const at = instant();
    for (const word of session.wordbloom?.words || []) {
      const outcome =
        reviews.find((item) => item.vocabularyId === word.vocabularyId)
          ?.outcome || "not_assessed";
      const changed = await db
        .prepare(
          "UPDATE vocabulary_exposures SET completed_at=?,outcome=? WHERE user_id=? AND vocabulary_id=? AND session_id=? AND completed_at IS NULL",
        )
        .run(at, outcome, uid, word.vocabularyId, session.id);
      if (!changed.changes) continue;
      const row = await db
        .prepare("SELECT * FROM user_vocabulary WHERE id=? AND user_id=?")
        .get(word.vocabularyId, uid);
      if (!row) continue;
      const interval = reviewInterval(Number(row.interval_days), outcome);
      await db
        .prepare("INSERT INTO vocabulary_observations VALUES(?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          uid,
          row.id,
          attempt.id,
          "reading_self_review",
          JSON.stringify({
            outcome,
            source: "self_report",
            acousticAssessment: false,
            assignmentId: session.id,
          }),
          at,
        );
      await db
        .prepare(
          "UPDATE user_vocabulary SET exposure_count=exposure_count+1,interval_days=?,due_at=?,status=?,updated_at=? WHERE id=? AND user_id=?",
        )
        .run(
          interval,
          new Date(Date.parse(at) + interval * 86400000).toISOString(),
          activeStatuses.has(row.status) ? "introduced" : row.status,
          at,
          row.id,
          uid,
        );
    }
  }
  async function summary(uid) {
    const user = await profile(uid);
    return {
      enabled: enabled(user),
      version: WORDBLOOM_VERSION,
      words: (await rows(uid)).map((row) => {
        const word = publicWord(row);
        if (word.status === "introduced" && word.dueAt <= instant())
          word.status = "review_due";
        return word;
      }),
    };
  }
  async function changeWord(uid, id, action) {
    return db.transaction(async () => {
      await db.lockUser(uid);
      if (!["dismiss", "familiar"].includes(action))
        throw Object.assign(new Error("Choose dismiss or familiar."), {
          status: 400,
        });
      const row = await db
        .prepare("SELECT * FROM user_vocabulary WHERE id=? AND user_id=?")
        .get(id, uid);
      if (!row)
        throw Object.assign(new Error("Vocabulary item not found."), {
          status: 404,
        });
      const data = JSON.parse(row.data);
      if (action === "familiar") data.familiaritySource = "self_report";
      await db
        .prepare(
          "UPDATE user_vocabulary SET status=?,data=?,updated_at=? WHERE id=? AND user_id=?",
        )
        .run(
          action === "dismiss" ? "dismissed" : "familiar",
          JSON.stringify(data),
          instant(),
          id,
          uid,
        );
      return summary(uid);
    });
  }
  async function exportData(uid) {
    return {
      ...(await summary(uid)),
      pronunciationObservations: await pronunciation.exportData(uid),
      processedAttempts: (
        await db
          .prepare(
            "SELECT * FROM wordbloom_processed_attempts WHERE user_id=? ORDER BY processed_at",
          )
          .all(uid)
      ).map((row) => ({ ...row, data: JSON.parse(row.data) })),
      exposures: await db
        .prepare(
          "SELECT * FROM vocabulary_exposures WHERE user_id=? ORDER BY assigned_at",
        )
        .all(uid),
      observations: (
        await db
          .prepare(
            "SELECT * FROM vocabulary_observations WHERE user_id=? ORDER BY created_at",
          )
          .all(uid)
      ).map((row) => ({ ...row, data: JSON.parse(row.data) })),
    };
  }
  return {
    context,
    processAttempt,
    saveSelected,
    selectPassage,
    recordAssignment,
    completeReading,
    recordPronunciation: pronunciation.record,
    summary,
    changeWord,
    exportData,
  };
}
