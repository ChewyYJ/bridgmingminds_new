import { randomUUID, createHash } from "node:crypto";
import { prompts } from "./content.mjs";
import { BRIDGE_KEYS, BRIDGE_VERSION } from "../shared/bridge-rubric.mjs";

export const LEARNER_POLICY = "learner-practice-v1";
const focuses = {
  B: [
    "Big Idea",
    "State your main point in one clear sentence before developing it.",
  ],
  R: ["Reasons", "Explain how one reason supports your main point."],
  I: [
    "Illustrations",
    "Add a concrete example, then explain what it supports.",
  ],
  D: [
    "Different Perspectives",
    "Consider a fair alternative view and explain your response.",
  ],
  G: ["Glue", "Connect your point, reason and example in a clear order."],
  E: [
    "Expression",
    "Choose clear wording for your intended listener. Delivery needs separate audio evidence.",
  ],
};
const fail = () =>
  Object.assign(
    new Error(
      "This saved feedback cannot supply a verified skill observation.",
    ),
    { status: 409 },
  );
export function createLearnerProfile({ db, now = () => new Date() }) {
  async function record(uid, attempt, session, evaluation) {
    if (
      attempt.mode !== "spin_speak" ||
      evaluation.provider !== "openai" ||
      evaluation.rubric_version !== BRIDGE_VERSION
    )
      return;
    if (
      ![evaluation.model_version, evaluation.prompt_template_version].every(
        (value) => typeof value === "string" && value.length,
      )
    )
      throw fail();
    const source = await db
      .prepare(
        "SELECT data FROM attempts WHERE id=? AND user_id=? AND session_id=?",
      )
      .get(attempt.id, uid, session.id);
    if (
      !source ||
      JSON.parse(source.data).text !== attempt.text ||
      JSON.parse(source.data).status !== "completed"
    )
      throw fail();
    const version = [
      evaluation.rubric_version,
      evaluation.prompt_template_version,
      evaluation.model_version,
    ].join("|");
    const assisted = Boolean(
      attempt.retryOf || session.retryOf || session.learningFocus,
    );
    for (const dimension of evaluation.dimensions || []) {
      if (!BRIDGE_KEYS.includes(dimension.key)) throw fail();
      const spans = dimension.evidence_spans || [];
      if (
        dimension.status === "assessed" &&
        (!Number.isInteger(dimension.level) ||
          dimension.level < 1 ||
          dimension.level > 4 ||
          !spans.length ||
          spans.some(
            (span) =>
              !Number.isInteger(span.start) ||
              span.start < 0 ||
              !Number.isInteger(span.end) ||
              span.end > attempt.text.length ||
              span.end <= span.start ||
              attempt.text.slice(span.start, span.end) !== span.quote,
          ))
      )
        throw fail();
      const data = {
        rubricVersion: evaluation.rubric_version,
        templateVersion: evaluation.prompt_template_version,
        modelVersion: evaluation.model_version,
        comparisonGroup: version,
        status: dimension.status,
        level: dimension.level,
        confidence: dimension.confidence,
        evidence: spans,
        improvement: dimension.improvement,
        assisted,
        validationStatus: "unvalidated",
        activity: "spin_speak",
        difficulty: session.prompt.difficulty || "unknown",
      };
      await db
        .prepare(
          "INSERT INTO skill_observations VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,attempt_id,dimension) DO NOTHING",
        )
        .run(
          randomUUID(),
          uid,
          attempt.id,
          session.id,
          session.prompt.id,
          dimension.key,
          JSON.stringify(data),
          attempt.createdAt,
          new Date(now()).toISOString(),
        );
    }
  }
  async function summary(uid) {
    const owner = await db
      .prepare("SELECT profile FROM users WHERE id=?")
      .get(uid);
    if (!owner)
      throw Object.assign(new Error("Please sign in again."), { status: 401 });
    const profile = JSON.parse(owner.profile);
    const observations = (
      await db
        .prepare(
          "SELECT * FROM skill_observations WHERE user_id=? ORDER BY occurred_at DESC,id DESC LIMIT 240",
        )
        .all(uid)
    ).map((row) => ({ ...row, data: JSON.parse(row.data) }));
    const result = {
      policyVersion: LEARNER_POLICY,
      enabled: profile.adaptiveRecommendations !== false,
      validationStatus: "unvalidated",
      masteryStatus: "not_assessed",
      observationCount: (
        await db
          .prepare(
            "SELECT COUNT(*) count FROM skill_observations WHERE user_id=?",
          )
          .get(uid)
      ).count,
      recommendation: null,
      status: "insufficient_evidence",
      notice:
        "Practice suggestions use provisional feedback, not a validated ability diagnosis. XP and plant mastery are separate.",
    };
    if (!result.enabled) return { ...result, status: "paused" };
    const candidates = [];
    let hasDismissed = false;
    for (const dimension of BRIDGE_KEYS) {
      const rows = observations.filter(
        (row) =>
          row.dimension === dimension &&
          row.data.status === "assessed" &&
          row.data.confidence === "high" &&
          !row.data.assisted &&
          Date.parse(row.occurred_at) >=
            new Date(now()).getTime() - 90 * 86400000,
      );
      const group = rows[0]?.data.comparisonGroup;
      const seen = new Set();
      const recent = rows
        .filter(
          (row) =>
            row.data.comparisonGroup === group &&
            !seen.has(row.prompt_id) &&
            seen.add(row.prompt_id),
        )
        .slice(0, 3);
      const gaps = recent.filter((row) => row.data.level <= 2);
      if (gaps.length < 2) continue;
      const id = createHash("sha256")
        .update(
          [LEARNER_POLICY, dimension, ...gaps.map((row) => row.id)].join("|"),
        )
        .digest("hex");
      if ((profile.dismissedRecommendations || []).includes(id)) {
        hasDismissed = true;
        continue;
      }
      const goal = String(profile.goal || "").toLowerCase();
      const relevant =
        (/reason|critical/.test(goal) && ["R", "I", "D"].includes(dimension)) ||
        (/articul|present|interview|speak/.test(goal) &&
          ["B", "G", "E"].includes(dimension));
      candidates.push({
        id,
        dimension,
        label: focuses[dimension][0],
        focus: focuses[dimension][1],
        priority: gaps.length + (relevant ? 0.5 : 0),
        evidence: gaps.map((row) => ({
          observationId: row.id,
          attemptId: row.attempt_id,
          promptId: row.prompt_id,
          quote: row.data.evidence[0].quote,
          feedback: row.data.improvement,
        })),
        group,
      });
    }
    candidates.sort(
      (a, b) =>
        b.priority - a.priority || a.dimension.localeCompare(b.dimension),
    );
    const target = candidates[0];
    if (!target)
      return {
        ...result,
        status: hasDismissed ? "dismissed" : observations.length
          ? "no_repeated_target"
          : "insufficient_evidence",
      };
    const sessions = (
      await db
        .prepare(
          "SELECT data FROM sessions WHERE user_id=? AND mode='spin_speak' ORDER BY created_at DESC LIMIT 100",
        )
        .all(uid)
    ).map((row) => JSON.parse(row.data));
    const recentIds = new Set(
      sessions.slice(0, 8).map((session) => session.prompt.id),
    );
    const previousIds = new Set(sessions.map((session) => session.prompt.id));
    const pool = prompts.filter(
      (prompt) =>
        prompt.mode === "spin_speak" &&
        prompt.bridgeDimensions.includes(target.dimension) &&
        !recentIds.has(prompt.id),
    );
    pool.sort(
      (a, b) =>
        Number(previousIds.has(a.id)) - Number(previousIds.has(b.id)) ||
        a.id.localeCompare(b.id),
    );
    if (!pool.length) return { ...result, status: "no_fresh_exercise" };
    return {
      ...result,
      status: "recommended",
      recommendation: {
        ...target,
        explanation: `Two recent responses to different prompts received provisional feedback about ${target.label.toLowerCase()}. Try a focused practice; this is not a permanent skill label.`,
        exercise: {
          promptId: pool[0].id,
          question: pool[0].question,
          mode: "spin_speak",
          difficulty: pool[0].difficulty,
          unseenInRecentHistory: !previousIds.has(pool[0].id),
        },
      },
    };
  }
  async function preferences(uid, { enabled, dismissId } = {}) {
    return db.transaction(async () => {
      await db.lockUser(uid);
      const current = await summary(uid);
      const owner = await db
        .prepare("SELECT profile FROM users WHERE id=?")
        .get(uid);
      const profile = JSON.parse(owner.profile);
      if (typeof enabled === "boolean")
        profile.adaptiveRecommendations = enabled;
      if (dismissId) {
        if (
          current.recommendation?.id !== dismissId &&
          !(profile.dismissedRecommendations || []).includes(dismissId)
        )
          throw Object.assign(
            new Error(
              "This recommendation has changed. Refresh before dismissing it.",
            ),
            { status: 409 },
          );
        profile.dismissedRecommendations = [
          ...new Set([...(profile.dismissedRecommendations || []), dismissId]),
        ].slice(-20);
      }
      await db
        .prepare("UPDATE users SET profile=? WHERE id=?")
        .run(JSON.stringify(profile), uid);
      return summary(uid);
    });
  }
  async function importHistory(uid) {
    return db.transaction(async () => {
      await db.lockUser(uid);
      const rows = await db
        .prepare(
          "SELECT data FROM attempts WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
        )
        .all(uid);
      for (const row of rows) {
        const attempt = JSON.parse(row.data);
        if (attempt.status !== "completed" || !attempt.evaluation) continue;
        const saved = await db
          .prepare("SELECT data FROM sessions WHERE id=? AND user_id=?")
          .get(attempt.sessionId, uid);
        if (saved)
          await record(
            uid,
            attempt,
            JSON.parse(saved.data),
            attempt.evaluation,
          );
      }
      return summary(uid);
    });
  }
  const exportData = async (uid) =>
    (
      await db
        .prepare(
          "SELECT * FROM skill_observations WHERE user_id=? ORDER BY occurred_at,id",
        )
        .all(uid)
    ).map((row) => ({ ...row, data: JSON.parse(row.data) }));
  return { record, summary, preferences, importHistory, exportData };
}
