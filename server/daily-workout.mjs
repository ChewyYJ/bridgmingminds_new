import { GAMIFICATION_CONFIG } from "../shared/gamification.mjs";

export const DAILY_ACTIVITY_XP = Object.freeze({
  read_aloud: GAMIFICATION_CONFIG.rewards.read_aloud.xp,
  spin_speak: GAMIFICATION_CONFIG.rewards.daily_practice.xp,
});

export function localDay(instant, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

function priorDay(day) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Calendar arithmetic uses ISO date keys, never 24 hours of elapsed local time. */
export function workoutStreak(securedDays, today) {
  const days = [...new Set(securedDays)].sort();
  let longest = 0,
    run = 0,
    previous;
  for (const day of days) {
    run = previous === priorDay(day) ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const secured = new Set(days);
  let cursor = secured.has(today) ? today : priorDay(today);
  let current = 0;
  while (secured.has(cursor)) {
    current++;
    cursor = priorDay(cursor);
  }
  return { current, longest, securedToday: secured.has(today) };
}

/** Internal domain service. Never expose receipt/completion as client-supplied events.
 * The caller pins a receipt only after validating a submission. Completion reads
 * the persisted outcome and commits inside the same transaction as that outcome.
 */
export function createDailyWorkoutService({ db, now = () => new Date(), awardCompletion, getProgression }) {
  const user = async (uid) => {
    const row = await db.prepare("SELECT * FROM users WHERE id=?").get(uid);
    if (!row) throw new Error("Daily workout owner not found.");
    return row;
  };
  async function pinReceipt(uid, attemptId) {
    return db.transaction(async () => {
      await db.lockUser(uid);
      const owner = await user(uid);
      const row = await db
        .prepare("SELECT data FROM attempts WHERE id=? AND user_id=?")
        .get(attemptId, uid);
      if (!row) throw new Error("Daily attempt not found.");
      const attempt = JSON.parse(row.data);
      if (!Object.hasOwn(DAILY_ACTIVITY_XP, attempt.mode)) return null;
      let timezone = JSON.parse(owner.profile).timezone || "UTC";
      const receivedAt = new Date(now()).toISOString();
      const day = localDay(receivedAt, timezone);
      const dayContext = await db
        .prepare(
          `SELECT timezone FROM daily_attempt_receipts
        WHERE user_id=? AND local_date=? ORDER BY received_at LIMIT 1`,
        )
        .get(uid, day);
      if (dayContext) timezone = dayContext.timezone;
      // First validated receipt wins across retries, midnight and timezone edits.
      await db
        .prepare(
          `INSERT INTO daily_attempt_receipts
        (attempt_id,user_id,activity_type,local_date,timezone,received_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(attempt_id) DO NOTHING`,
        )
        .run(attemptId, uid, attempt.mode, day, timezone, receivedAt);
      return db
        .prepare(
          "SELECT * FROM daily_attempt_receipts WHERE attempt_id=? AND user_id=?",
        )
        .get(attemptId, uid);
    });
  }

  async function complete(uid, attemptId) {
    return db.transaction(async () => {
      await db.lockUser(uid);
      await user(uid);
      const receipt = await db
        .prepare(
          "SELECT * FROM daily_attempt_receipts WHERE attempt_id=? AND user_id=?",
        )
        .get(attemptId, uid);
      if (!receipt)
        throw new Error("A trusted submission receipt is required.");
      const row = await db
        .prepare("SELECT data FROM attempts WHERE id=? AND user_id=?")
        .get(attemptId, uid);
      const attempt = row && JSON.parse(row.data);
      if (
        !attempt ||
        attempt.mode !== receipt.activity_type ||
        attempt.status !== "completed" ||
        !attempt.evaluation
      )
        throw new Error(
          "Only a successfully processed attempt can complete an activity.",
        );
      const tokens = attempt.text?.match(/[\p{L}\p{N}]+/gu) || [];
      if (
        tokens.length < 3 ||
        new Set(tokens.map((word) => word.toLowerCase())).size < 2
      )
        throw new Error("A meaningful response is required.");
      // The future Read Aloud adapter must persist an actual acoustic outcome.
      // Local transcript coaching and sample demo output cannot satisfy this.
      const authorisedSelfReview =
        attempt.completionPolicy === "read-aloud-self-review-v1" &&
        attempt.evaluation.speech?.status === "not_assessed" &&
        attempt.selfReviewConfirmed === true;
      if (
        attempt.mode === "read_aloud" &&
        !authorisedSelfReview &&
        (!attempt.audioId || attempt.evaluation.speech?.status !== "assessed")
      )
        throw new Error("Read Aloud requires a successful speech assessment.");
      const at = new Date(now()).toISOString();
      const inserted = await db
        .prepare(
          `INSERT INTO daily_activity_completions
        (user_id,local_date,activity_type,attempt_id,timezone,completed_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,local_date,activity_type) DO NOTHING`,
        )
        .run(
          uid,
          receipt.local_date,
          receipt.activity_type,
          attemptId,
          receipt.timezone,
          at,
        );
      const reward = inserted.changes && awardCompletion
        ? await awardCompletion(uid, {
            eventId: `daily:${attemptId}`,
            activityType: receipt.activity_type === "spin_speak" ? "daily_practice" : "read_aloud",
            completionId: attemptId,
            completedAt: at,
            localDate: receipt.local_date,
            timezone: receipt.timezone,
            dedupeKey: `daily:${receipt.local_date}:${receipt.activity_type}`,
          })
        : null;
      const xp = reward?.xpGranted || 0;
      const activities = await db
        .prepare(
          "SELECT activity_type FROM daily_activity_completions WHERE user_id=? AND local_date=?",
        )
        .all(uid, receipt.local_date);
      if (activities.length === 2) {
        await db
          .prepare(
            `INSERT INTO daily_workout_days
          (user_id,local_date,secured_at) VALUES(?,?,?)
          ON CONFLICT(user_id,local_date) DO NOTHING`,
          )
          .run(uid, receipt.local_date, at);
      }
      return {
        day: receipt.local_date,
        xp,
        coins: reward?.coinsGranted || 0,
        ...(reward ? { reward } : {}),
        completed: activities.length,
        streakSecured: reward?.streak.securedToday || Boolean((await getProgression?.(uid))?.streak.securedToday),
      };
    });
  }

  async function today(uid) {
    return db.transaction(async () => {
      const owner = await user(uid);
      const timezone = JSON.parse(owner.profile).timezone || "UTC";
      const day = localDay(now(), timezone);
      const rows = await db
        .prepare(
          "SELECT activity_type FROM daily_activity_completions WHERE user_id=? AND local_date=?",
        )
        .all(uid, day);
      const secured = await db
        .prepare(
          "SELECT local_date FROM daily_workout_days WHERE user_id=? AND local_date<=? ORDER BY local_date",
        )
        .all(uid, day);
      return {
        day,
        timezone,
        completed: rows.length,
        required: 2,
        activities: Object.entries(DAILY_ACTIVITY_XP).map(([type, xp]) => ({
          type,
          xp,
          coins: GAMIFICATION_CONFIG.rewards[type === "spin_speak" ? "daily_practice" : "read_aloud"].coins,
          completed: rows.some((row) => row.activity_type === type),
        })),
        xp: rows.reduce(
          (sum, row) => sum + DAILY_ACTIVITY_XP[row.activity_type],
          0,
        ),
        streak: (await getProgression?.(uid))?.streak || workoutStreak(
          secured.map((row) => row.local_date),
          day,
        ),
      };
    });
  }
  return { pinReceipt, complete, today };
}
