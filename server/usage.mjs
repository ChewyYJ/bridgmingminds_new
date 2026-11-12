import { transaction } from "./database.mjs";

export function practiceWeek(instant = Date.now()) {
  if (!Number.isFinite(instant))
    throw new TypeError("A valid practice timestamp is required.");
  const shifted = new Date(instant + 8 * 3600000);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() - ((shifted.getUTCDay() + 6) % 7));
  return {
    start: shifted.toISOString().slice(0, 10),
    resetsAt: new Date(
      shifted.getTime() + 7 * 86400000 - 8 * 3600000,
    ).toISOString(),
  };
}

// A reservation belongs to its original session, including linked revisions.
// Its request budget is permanent; only new weekly practice slots reset.
export function createUsageService({
  db,
  enabled,
  dailyRequests = 100,
  clock = Date.now,
}) {
  if (!Number.isSafeInteger(dailyRequests) || dailyRequests < 1)
    throw new TypeError("The daily AI request cap must be a positive integer.");
  const fail = (message) =>
    Object.assign(new Error(message), { status: 429, code: "usage_limit" });
  const take = async (key, max, duration, message) => {
    const result = await db.consumeRateLimit(key, max, duration);
    if (!result.allowed)
      throw Object.assign(fail(message), { retryAfterMs: result.retryAfterMs });
  };
  const snapshotAt = async (uid, instant) => {
    const week = practiceWeek(instant);
    const row = await db
      .prepare(
        "SELECT COUNT(*) count FROM practice_usage WHERE user_id=? AND week_start=?",
      )
      .get(uid, week.start);
    const owner = await db
      .prepare("SELECT profile FROM users WHERE id=?")
      .get(uid);
    return {
      limit: 5,
      used: row.count,
      remaining: Math.max(0, 5 - row.count),
      resetsAt: week.resetsAt,
      enabled,
      scope: "optional_and_classic_practice",
      dailySpeakingIncluded: owner
        ? JSON.parse(owner.profile).dailyWorkout === true
        : false,
    };
  };
  const snapshot = (uid) => snapshotAt(uid, clock());
  const lockUser = async (uid) => {
    if (!(await db.lockUser(uid)))
      throw Object.assign(new Error("Please sign in again."), { status: 401 });
  };
  const reserveLocked = async (uid, sid, instant, { attemptId, kind } = {}) => {
    const session = await db
      .prepare("SELECT id,mode FROM sessions WHERE id=? AND user_id=?")
      .get(sid, uid);
    if (!session)
      throw Object.assign(new Error("Practice session not found."), {
        status: 404,
      });
    const owner = await db
      .prepare("SELECT profile FROM users WHERE id=?")
      .get(uid);
    const daily =
      JSON.parse(owner.profile).dailyWorkout === true &&
      session.mode === "spin_speak";
    if (daily) {
      // Evaluation admission must come from a validated persisted attempt and
      // trusted receipt, never a client-provided day or a session label alone.
      if (attemptId || kind === "evaluation") {
        if (!attemptId)
          throw Object.assign(
            new Error("A trusted daily speaking submission is required."),
            { status: 409, code: "daily_submission_required" },
          );
        const attempt = await db
          .prepare(
            "SELECT data FROM attempts WHERE id=? AND user_id=? AND session_id=?",
          )
          .get(attemptId, uid, sid);
        const receipt = await db
          .prepare(
            "SELECT attempt_id FROM daily_attempt_receipts WHERE attempt_id=? AND user_id=? AND activity_type='spin_speak'",
          )
          .get(attemptId, uid);
        if (
          !attempt ||
          JSON.parse(attempt.data).mode !== "spin_speak" ||
          !receipt
        )
          throw Object.assign(
            new Error("A trusted daily speaking submission is required."),
            { status: 409, code: "daily_submission_required" },
          );
      }
      return { daily: true };
    }
    const existing = await db
      .prepare(
        "SELECT session_id FROM practice_usage WHERE user_id=? AND session_id=?",
      )
      .get(uid, sid);
    if (existing) return { daily: false };
    const usage = await snapshotAt(uid, instant);
    if (!usage.remaining)
      throw fail(
        "You’ve used your 5 AI practices this week. Your allowance resets on Monday.",
      );
    await db
      .prepare(
        "INSERT INTO practice_usage(user_id,session_id,week_start,created_at) VALUES(?,?,?,?)",
      )
      .run(
        uid,
        sid,
        practiceWeek(instant).start,
        new Date(instant).toISOString(),
      );
    return { daily: false };
  };
  const reservePractice = async (uid, sid, options = {}) => {
    if (!enabled) return;
    await transaction(db, async () => {
      await lockUser(uid);
      await reserveLocked(uid, sid, clock(), options);
    });
  };
  const allowRequest = async (
    uid,
    { sessionId, attemptId, kind = "practice" } = {},
  ) => {
    if (!enabled) return;
    if (!sessionId && !["transcription", "speech"].includes(kind))
      throw Object.assign(
        new Error("Choose a practice before requesting AI feedback."),
        { status: 400 },
      );
    // A rejected admission must not spend a practice slot or an earlier counter.
    await transaction(db, async () => {
      await lockUser(uid);
      const instant = clock();
      const admission = sessionId
        ? await reserveLocked(uid, sessionId, instant, { attemptId, kind })
        : null;
      const week = practiceWeek(instant);
      // Cost budgets reset by the server's fixed service day. They do not move
      // when the learner changes time zone, and delayed jobs can recover on a
      // later service day while preserving their original XP receipt day.
      const day = new Date(instant + 8 * 3600000).toISOString().slice(0, 10);
      if (kind === "speech") {
        await take(
          `speech-week:${uid}:${week.start}`,
          10,
          8 * 86400000,
          "You’ve used this week’s optional acoustic assessment allowance. Self-review remains available.",
        );
      } else if (kind === "transcription") {
        await take(
          `transcription-week:${uid}:${week.start}`,
          10,
          8 * 86400000,
          "You’ve used this week’s transcription allowance. You can still write your response.",
        );
      } else if (admission?.daily) {
        const evaluation = kind === "evaluation";
        await take(
          `daily-${evaluation ? "evaluation" : "coaching"}:${uid}:${day}`,
          evaluation ? 12 : 8,
          2 * 86400000,
          evaluation
            ? "Today’s daily speaking feedback request limit is reached. Your answer is saved; please retry after midnight Singapore time."
            : "Today’s optional speaking-coach request limit is reached. You can still submit your own daily answer for feedback.",
        );
      } else {
        const admitted = await db
          .prepare(
            "UPDATE practice_usage SET request_count=request_count+1 WHERE user_id=? AND session_id=? AND request_count<12 RETURNING request_count",
          )
          .get(uid, sessionId);
        if (!admitted)
          throw fail(
            "This practice has reached its AI request limit. Your work is saved.",
          );
      }
      await take(
        `provider-day:${day}`,
        dailyRequests,
        2 * 86400000,
        "AI practice is at capacity today. Your work is saved; please try again tomorrow.",
      );
    });
  };
  return { snapshot, reservePractice, allowRequest };
}
