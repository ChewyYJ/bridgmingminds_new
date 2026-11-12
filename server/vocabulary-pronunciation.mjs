import { randomUUID } from "node:crypto";
import { SPEECH_RESULT_VERSION } from "./speech-assessment.mjs";

export const ACOUSTIC_REVIEW_POLICY = "wordbloom-reading-review-v1";
const active = new Set(["scheduled", "introduced", "review_due"]);
const failure = () =>
  Object.assign(new Error("The saved reading source could not be verified."), {
    status: 404,
    code: "vocabulary_reading_source",
  });
const key = (text) => String(text).normalize("NFKC").toLocaleLowerCase("en");

// Pilot scheduling heuristics, not validated proficiency/mastery thresholds.
// Recognition confidence gates alignment reliability; it is NOT pronunciation
// confidence. Evidence, word accuracy and self-reports remain separate records.
function observation(word, passage, result) {
  const matches = word.spans.map((span) =>
    result.words.filter(
      (item) =>
        item.sourceSpan?.start === span.start &&
        item.sourceSpan?.end === span.end &&
        key(item.word) === key(word.word) &&
        key(passage.slice(span.start, span.end)) === key(word.word),
    ),
  );
  const usable =
    result.status === "assessed" &&
    matches.length > 0 &&
    matches.every(
      (items) =>
        items.length === 1 &&
        Number.isFinite(items[0].accuracy) &&
        items[0].accuracy >= 0 &&
        items[0].accuracy <= 100 &&
        Number.isFinite(items[0].recognitionConfidence) &&
        items[0].recognitionConfidence >= 0.8 &&
        items[0].recognitionConfidence <= 1 &&
        ["None", "Mispronunciation"].includes(items[0].providerErrorType),
    );
  if (!usable)
    return {
      status: "insufficient_evidence",
      outcome: "not_assessed",
      evidence: [],
    };
  const evidence = matches.map(([item]) => ({
    sourceSpan: {
      start: item.sourceSpan.start,
      end: item.sourceSpan.end,
      text: passage.slice(item.sourceSpan.start, item.sourceSpan.end),
    },
    startMs: item.startMs,
    durationMs: item.durationMs,
    accuracy: item.accuracy,
    providerErrorType: item.providerErrorType,
    recognitionConfidence: item.recognitionConfidence,
  }));
  const outcome = evidence.some(
    (item) =>
      item.accuracy < 70 && item.providerErrorType === "Mispronunciation",
  )
    ? "review_candidate"
    : evidence.every(
          (item) => item.accuracy >= 85 && item.providerErrorType === "None",
        )
      ? "stable_reading_candidate"
      : "no_change";
  return { status: "observed", outcome, evidence };
}

export function createVocabularyPronunciation({ db, now = () => new Date() }) {
  async function record(uid, attemptId, result) {
    return db.transaction(async () => {
      if (!(await db.lockUser(uid))) throw failure();
      const user = await db
        .prepare("SELECT profile FROM users WHERE id=?")
        .get(uid);
      const profile = JSON.parse(user.profile);
      if (!profile.dailyWorkout || profile.wordBloomEnabled === false)
        return { policyVersion: ACOUSTIC_REVIEW_POLICY, words: [] };
      const saved = await db
        .prepare("SELECT data FROM attempts WHERE id=? AND user_id=?")
        .get(attemptId, uid);
      if (!saved) throw failure();
      const attempt = JSON.parse(saved.data);
      const assigned = await db
        .prepare(
          "SELECT data FROM sessions WHERE id=? AND user_id=? AND mode='read_aloud'",
        )
        .get(attempt.sessionId, uid);
      if (
        !assigned ||
        attempt.mode !== "read_aloud" ||
        attempt.status !== "completed" ||
        !attempt.audioId
      )
        throw failure();
      const session = JSON.parse(assigned.data);
      if (
        session.passage.text !== attempt.passage.text ||
        result?.provider !== "azure" ||
        result.version !== SPEECH_RESULT_VERSION ||
        result.validationStatus !== "unvalidated" ||
        !["en-US", "en-GB"].includes(result.locale) ||
        !Array.isArray(result.words)
      )
        throw failure();
      const at = new Date(now()).toISOString(),
        decisions = [];
      for (const word of session.wordbloom?.words || []) {
        const row = await db
          .prepare("SELECT * FROM user_vocabulary WHERE id=? AND user_id=?")
          .get(word.vocabularyId, uid);
        if (!row || !active.has(row.status)) continue;
        const exposure = await db
          .prepare(
            "SELECT * FROM vocabulary_exposures WHERE user_id=? AND vocabulary_id=? AND session_id=? AND completed_at IS NOT NULL",
          )
          .get(uid, row.id, session.id);
        if (!exposure) continue;
        const existing = await db
          .prepare(
            "SELECT data FROM vocabulary_pronunciation WHERE user_id=? AND vocabulary_id=? AND session_id=? AND locale=?",
          )
          .get(uid, row.id, session.id, result.locale);
        if (existing) {
          decisions.push(JSON.parse(existing.data).decision);
          continue;
        }
        const observed = observation(word, session.passage.text, result);
        const id = randomUUID();
        const data = {
          policyVersion: ACOUSTIC_REVIEW_POLICY,
          provider: result.provider,
          sdkVersion: result.sdkVersion,
          locale: result.locale,
          validationStatus: "unvalidated",
          ...observed,
          decision: null,
        };
        await db
          .prepare(
            "INSERT INTO vocabulary_pronunciation VALUES(?,?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            uid,
            row.id,
            attempt.id,
            session.id,
            result.locale,
            JSON.stringify(data),
            exposure.assigned_at,
            at,
            observed.status,
          );
        const recent = (
          await db
            .prepare(
              "SELECT id,data,session_id FROM vocabulary_pronunciation WHERE user_id=? AND vocabulary_id=? AND locale=? ORDER BY occurred_at DESC,id DESC LIMIT 3",
            )
            .all(uid, row.id, result.locale)
        ).map((item) => ({ ...item, data: JSON.parse(item.data) }));
        const latestExposure = await db
          .prepare(
            "SELECT session_id FROM vocabulary_exposures WHERE user_id=? AND vocabulary_id=? AND completed_at IS NOT NULL ORDER BY assigned_at DESC,id DESC LIMIT 1",
          )
          .get(uid, row.id);
        const outcome = observed.outcome;
        const repeated =
          observed.status === "observed" &&
          outcome !== "no_change" &&
          recent.filter(
            (item) =>
              item.data.status === "observed" && item.data.outcome === outcome,
          ).length >= 2;
        let action = "unchanged",
          interval = Number(row.interval_days);
        if (
          repeated &&
          latestExposure?.session_id === session.id &&
          recent[0]?.id === id
        ) {
          if (outcome === "review_candidate") {
            interval = Math.max(1, Math.floor(interval / 2));
            action = "review_sooner";
          }
          if (
            outcome === "stable_reading_candidate" &&
            exposure.outcome !== "needs_practice"
          ) {
            interval = Math.min(60, Math.max(3, Math.ceil(interval * 1.8)));
            action = "review_later";
          }
        }
        const decision = {
          vocabularyId: row.id,
          wordId: row.word_id,
          locale: result.locale,
          observationStatus: observed.status,
          outcome,
          action,
          intervalDays: interval,
          basedOnObservationIds: repeated
            ? recent
                .filter((item) => item.data.outcome === outcome)
                .map((item) => item.id)
            : [id],
        };
        data.decision = decision;
        await db
          .prepare("UPDATE vocabulary_pronunciation SET data=? WHERE id=?")
          .run(JSON.stringify(data), id);
        if (latestExposure?.session_id === session.id && recent[0]?.id === id) {
          const catalogue = JSON.parse(row.data);
          catalogue.pronunciationReview = {
            policyVersion: ACOUSTIC_REVIEW_POLICY,
            validationStatus: "unvalidated",
            locale: result.locale,
            observationStatus: observed.status,
            outcome,
            action,
            occurredAt: exposure.assigned_at,
          };
          const due =
            action === "unchanged"
              ? row.due_at
              : new Date(
                  Date.parse(exposure.completed_at) + interval * 86400000,
                ).toISOString();
          await db
            .prepare(
              "UPDATE user_vocabulary SET data=?,interval_days=?,due_at=?,updated_at=? WHERE id=? AND user_id=?",
            )
            .run(JSON.stringify(catalogue), interval, due, at, row.id, uid);
        }
        decisions.push(decision);
      }
      return { policyVersion: ACOUSTIC_REVIEW_POLICY, words: decisions };
    });
  }
  async function exportData(uid) {
    return (
      await db
        .prepare(
          "SELECT * FROM vocabulary_pronunciation WHERE user_id=? ORDER BY occurred_at,id",
        )
        .all(uid)
    ).map((row) => ({ ...row, data: JSON.parse(row.data) }));
  }
  return { record, exportData };
}
