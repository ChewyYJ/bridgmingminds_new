import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { localDay } from "./daily-workout.mjs";

// Original, versioned editorial passages; never publisher article copies.
export const readingPassages = Object.freeze([
  {
    id: "small-spaces-v1",
    title: "Small spaces, shared possibilities",
    target: "Pause between ideas",
    text: "A small garden can change how a neighbourhood feels. A few pots beside a walkway offer colour, shade and a reason to stop. When neighbours care for the plants together, the space becomes a place to exchange ideas. Not every suggestion will work. Some plants need more sunlight, while others need less water. Trying a small change and noticing what happens can help the group decide what to do next. Progress begins with attention, a little patience and a willingness to learn from each other.",
  },
  {
    id: "better-questions-v1",
    title: "A question worth asking",
    target: "Make each sentence easy to follow",
    text: "A good question can open a conversation. Instead of asking whether an idea is simply good or bad, we can ask who might benefit and what might change. Listening to the answer gives us another piece of the picture. We may still disagree, but we can explain our reasons more clearly. A useful discussion leaves room for uncertainty. When the evidence is incomplete, saying what we do not yet know can make the next question more precise. Understanding grows when people feel able to ask, listen and think again.",
  },
  {
    id: "steady-learning-v1",
    title: "Learning one step at a time",
    target: "Let punctuation guide your pauses",
    text: "Learning a new skill rarely happens all at once. At first, a small task may require our full attention. With practice, familiar steps begin to feel easier. That does not mean every attempt will be better than the last. A difficult day can still teach us something useful. We can notice one detail, choose one change and try again. Taking a break is part of learning too. What matters is finding a routine that leaves enough room for curiosity, reflection and the next small step.",
  },
]);

const submission = z
  .object({
    idempotencyKey: z.string().min(8).max(100),
    audioId: z.string().uuid().optional(),
    notes: z.string().trim().min(20).max(2000),
    selfReviewConfirmed: z.literal(true),
    wordReviews: z
      .array(
        z
          .object({
            vocabularyId: z.string().uuid(),
            outcome: z.enum(["not_assessed", "needs_practice", "comfortable"]),
          })
          .strict(),
      )
      .max(3)
      .optional(),
  })
  .strict();

export function installReadAloud({
  app,
  db,
  wrap,
  mutate,
  getUser,
  daily,
  wordBloom,
  acousticAvailable = () => false,
  assertOwnAudio,
  failure,
  now = () => new Date(),
}) {
  const requireDaily = async (uid) => {
    const owner = await getUser(uid);
    if (!owner || JSON.parse(owner.profile).dailyWorkout !== true)
      throw failure(
        409,
        "Start the daily workout plan before opening Read Aloud.",
      );
    return owner;
  };
  const assignment = async (id, uid) => {
    const row = await db
      .prepare(
        "SELECT data FROM sessions WHERE id=? AND user_id=? AND mode='read_aloud'",
      )
      .get(id, uid);
    if (!row) throw failure(404, "Reading assignment not found.");
    return JSON.parse(row.data);
  };

  app.get(
    "/api/read-aloud/assignment",
    wrap(async (req, res) => {
      const result = await db.transaction(async () => {
        await db.lockUser(req.userId);
        const owner = await requireDaily(req.userId);
        const timezone = JSON.parse(owner.profile).timezone || "UTC";
        const day = localDay(now(), timezone);
        const rows = await db
          .prepare(
            "SELECT data FROM sessions WHERE user_id=? AND mode='read_aloud' ORDER BY created_at DESC",
          )
          .all(req.userId);
        const existing = rows
          .map((row) => JSON.parse(row.data))
          .find((session) => session.localDate === day);
        if (existing) return existing;
        const dayNumber = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86400000);
        const passage = readingPassages[dayNumber % readingPassages.length];
        const selected = await wordBloom.selectPassage(req.userId, passage);
        const session = {
          id: randomUUID(),
          mode: "read_aloud",
          localDate: day,
          timezone,
          ...selected,
          status: "assigned",
          createdAt: new Date(now()).toISOString(),
          speech: {
            status: acousticAvailable() ? "optional_after_save" : "unavailable",
            message: acousticAvailable()
              ? "This activity saves your self-review without speech scores. After saving a recording, you may separately opt in to acoustic feedback."
              : "Acoustic assessment is not connected. Self-review is available without pronunciation, pacing or intonation scores.",
          },
          completionPolicy: "read-aloud-self-review-v1",
        };
        await db
          .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
          .run(
            session.id,
            req.userId,
            session.mode,
            JSON.stringify(session),
            session.createdAt,
          );
        await wordBloom.recordAssignment(req.userId, session);
        return session;
      });
      res.json(result);
    }),
  );

  app.post(
    "/api/read-aloud/assignments/:id/submit",
    mutate(async (req, res) => {
      await requireDaily(req.userId);
      const data = submission.parse(req.body);
      const session = await assignment(req.params.id, req.userId);
      if (
        new Set((data.wordReviews || []).map((review) => review.vocabularyId))
          .size !== (data.wordReviews || []).length ||
        (data.wordReviews || []).some(
          (review) =>
            !session.wordbloom?.words.some(
              (word) => word.vocabularyId === review.vocabularyId,
            ),
        )
      )
        throw failure(
          400,
          "Review only the words in this assigned passage, once each.",
        );
      const requestHash = createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");
      const rows = await db
        .prepare("SELECT data FROM attempts WHERE session_id=? AND user_id=?")
        .all(session.id, req.userId);
      const existing = rows
        .map((row) => JSON.parse(row.data))
        .find((attempt) => attempt.idempotencyKey === data.idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw failure(
            409,
            "This saved submission has different content. Reopen your reading before trying again.",
          );
        return res.json(existing);
      }
      const tokens = data.notes.match(/[\p{L}\p{N}]+/gu) || [];
      if (
        tokens.length < 5 ||
        new Set(tokens.map((word) => word.toLowerCase())).size < 3
      )
        throw failure(
          400,
          "Describe one phrase you practised and what you noticed in at least five words.",
        );
      if (data.audioId) await assertOwnAudio(data.audioId, req.userId);
      const at = new Date(now()).toISOString();
      const attempt = {
        id: randomUUID(),
        sessionId: session.id,
        mode: "read_aloud",
        prompt: session.passage.title,
        passage: session.passage,
        text: data.notes,
        responseType: data.audioId ? "audio" : "text",
        ...(data.audioId ? { audioId: data.audioId } : {}),
        idempotencyKey: data.idempotencyKey,
        requestHash,
        completionPolicy: session.completionPolicy,
        selfReviewConfirmed: true,
        wordReviews: data.wordReviews || [],
        status: "completed",
        createdAt: at,
        completedAt: at,
        evaluation: {
          kind: "read_aloud_self_review",
          provider: "self_review",
          rubric_version: "read-aloud-self-review-v1",
          speech: { status: "not_assessed", metrics: null },
          key_takeaway:
            "Your reading observation is saved as self-review. It does not include acoustic or ability scores.",
          next_step:
            "Read the phrase again, letting punctuation guide a comfortable pause.",
        },
      };
      await db
        .prepare("INSERT INTO attempts VALUES(?,?,?,?,?)")
        .run(attempt.id, req.userId, session.id, JSON.stringify(attempt), at);
      await daily.pinReceipt(req.userId, attempt.id);
      attempt.rewards = await daily.complete(req.userId, attempt.id);
      await wordBloom.completeReading(
        req.userId,
        session,
        attempt,
        data.wordReviews || [],
      );
      await db
        .prepare("UPDATE attempts SET data=? WHERE id=?")
        .run(JSON.stringify(attempt), attempt.id);
      session.status = "completed";
      session.latestAttempt = attempt;
      await db
        .prepare("UPDATE sessions SET data=? WHERE id=?")
        .run(JSON.stringify(session), session.id);
      res.status(201).json(attempt);
    }),
  );
}
