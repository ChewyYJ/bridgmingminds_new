import { randomUUID } from "node:crypto";
import { AsyncResource } from "node:async_hooks";
import { z } from "zod";
import { createAzureSpeech } from "./azure-speech.mjs";
import { cleanupSpeechScratch, decodeSpeechAudio } from "./speech-audio.mjs";
import { createUsageService } from "./usage.mjs";

const input = z
  .object({
    locale: z.enum(["en-US", "en-GB"]),
    prosody: z.boolean().default(false),
    processingConsent: z.literal(true),
  })
  .strict();
const fail = (status, code, message) =>
  Object.assign(new Error(message), { status, code });
export function installReadingSpeech({
  app,
  db,
  wrap,
  getAttempt,
  getUser,
  wordBloom,
  audioRoutes,
  audioStorage,
  limit,
  cloud,
  options = {},
}) {
  const provider =
    options.speechProvider || createAzureSpeech(options.azureSpeech);
  const decode = options.decodeSpeechAudio || decodeSpeechAudio;
  const usage = createUsageService({
    db,
    enabled: true,
    dailyRequests:
      options.speechDailyRequestLimit ??
      Number(process.env.AI_DAILY_REQUEST_LIMIT || 100),
  });
  const owner = randomUUID(),
    active = new Map(),
    timers = new Set();
  const scope = new AsyncResource("reading-speech-worker");
  let closed = false;
  const instant = () => new Date().toISOString();
  const consent = async (uid) => {
    const user = await getUser(uid);
    if (!user || JSON.parse(user.profile).consent?.recording !== true)
      throw fail(
        403,
        "speech_consent",
        "Recording consent is required for acoustic assessment.",
      );
  };
  const view = (row) => ({
    id: row.id,
    attemptId: row.attempt_id,
    status: row.status,
    ...JSON.parse(row.data),
    updatedAt: row.updated_at,
  });
  async function execute(id, controller) {
    const leaseName = `speech:${id}`;
    const lease = await db.acquireLease(leaseName, owner, 180000);
    if (!lease) return;
    let job;
    try {
      job = await db.transaction(async () => {
        const current = await db
          .prepare("SELECT * FROM speech_jobs WHERE id=?")
          .get(id);
        if (!current || !["queued", "processing"].includes(current.status))
          return null;
        if (
          !(await db.lockUser(current.user_id)) ||
          !(await db.ownsLease(leaseName, lease.token))
        )
          return null;
        await consent(current.user_id);
        await db
          .prepare(
            "UPDATE speech_jobs SET status='processing',updated_at=? WHERE id=?",
          )
          .run(instant(), id);
        return current;
      });
      if (!job) return;
      const data = JSON.parse(job.data);
      const attempt = await getAttempt(job.attempt_id, job.user_id);
      if (
        attempt.mode !== "read_aloud" ||
        !attempt.audioId ||
        attempt.status !== "completed"
      )
        throw fail(
          409,
          "speech_source",
          "Save a reading with a private recording before assessment.",
        );
      const audio = await audioRoutes.assertOwnAudio(
        attempt.audioId,
        job.user_id,
      );
      await consent(job.user_id);
      const bytes = await audioStorage.read(audio.path);
      const { pcm } = await decode(bytes, audio.mime, {
        signal: controller.signal,
      });
      // Consent, ownership and retention may change while conversion is running.
      await consent(job.user_id);
      await audioRoutes.assertOwnAudio(attempt.audioId, job.user_id);
      await usage.allowRequest(job.user_id, { kind: "speech" });
      const result = await provider.assess({
        pcm,
        referenceText: attempt.passage.text,
        locale: data.locale,
        prosody: data.prosody,
        signal: controller.signal,
      });
      if (closed || controller.signal.aborted) return;
      await db.transaction(async () => {
        if (
          !(await db.lockUser(job.user_id)) ||
          !(await db.ownsLease(leaseName, lease.token))
        )
          return;
        await consent(job.user_id);
        await audioRoutes.assertOwnAudio(attempt.audioId, job.user_id);
        const latest = await getAttempt(attempt.id, job.user_id);
        const wordBloomReview = await wordBloom.recordPronunciation(job.user_id, latest.id, result);
        latest.speechAssessment = result;
        await db
          .prepare("UPDATE attempts SET data=? WHERE id=?")
          .run(JSON.stringify(latest), latest.id);
        // Keep the reading-session snapshot consistent with the history record.
        const sessionRow = await db
          .prepare("SELECT data FROM sessions WHERE id=? AND user_id=?")
          .get(latest.sessionId, job.user_id);
        if (sessionRow) {
          const session = JSON.parse(sessionRow.data);
          if (session.latestAttempt?.id === latest.id) {
            session.latestAttempt = latest;
            await db
              .prepare("UPDATE sessions SET data=? WHERE id=?")
              .run(JSON.stringify(session), latest.sessionId);
          }
        }
        await db
          .prepare(
            "UPDATE speech_jobs SET status='completed',data=?,updated_at=? WHERE id=?",
          )
          .run(JSON.stringify({ ...data, result, wordBloomReview, error: null }), instant(), id);
      });
    } catch (error) {
      if (!closed) {
        // A failure during the initial consent check still needs a terminal,
        // retryable state; never leave a queued request appearing to run forever.
        job ||= await db
          .prepare("SELECT * FROM speech_jobs WHERE id=?")
          .get(id);
        if (job)
          await db.transaction(async () => {
            if (
              !(await db.lockUser(job.user_id)) ||
              !(await db.ownsLease(leaseName, lease.token))
            )
              return;
            const data = JSON.parse(job.data);
            const code = [
              "usage_limit",
              "speech_consent",
              "speech_decoder_unavailable",
              "invalid_speech_audio",
              "speech_timeout",
              "speech_decode_timeout",
              "speech_configuration",
              "invalid_speech_result",
            ].includes(error.code)
              ? error.code
              : "speech_provider";
            const message =
              code === "usage_limit"
                ? error.message
                : code === "speech_consent"
                  ? "Recording consent was withdrawn. No assessment was saved."
                  : code === "speech_decoder_unavailable"
                    ? "The audio decoder is unavailable. Self-review remains available."
                    : "Acoustic assessment could not finish. Your saved reading is unchanged; you can retry.";
            await db
              .prepare(
                "UPDATE speech_jobs SET status='failed',data=?,updated_at=? WHERE id=?",
              )
              .run(
                JSON.stringify({
                  ...data,
                  retries:
                    (data.retries || 0) +
                    ([
                      "usage_limit",
                      "speech_configuration",
                      "speech_decoder_unavailable",
                    ].includes(code)
                      ? 0
                      : 1),
                  error: { code, message },
                }),
                instant(),
                id,
              );
          });
      }
    } finally {
      await db.releaseLease(leaseName, lease.token);
    }
  }
  function run(id) {
    if (closed) return Promise.resolve();
    if (active.has(id)) return active.get(id).promise;
    const controller = new AbortController();
    const promise = execute(id, controller).finally(() => active.delete(id));
    active.set(id, { controller, promise });
    return promise;
  }
  function schedule(id) {
    if (cloud || options.disableWorker || closed) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      scope.runInAsyncScope(() => run(id)).catch(() => {});
    }, 20);
    timers.add(timer);
  }
  app.get(
    "/api/read-aloud/speech-capabilities",
    wrap(async (_req, res) =>
      res.json({
        locales: [
          provider.capabilities("en-US"),
          provider.capabilities("en-GB"),
        ],
        requiresExplicitConsent: true,
      }),
    ),
  );
  app.get(
    "/api/read-aloud/attempts/:id/speech-assessment",
    wrap(async (req, res) => {
      await getAttempt(req.params.id, req.userId);
      const row = await db
        .prepare("SELECT * FROM speech_jobs WHERE attempt_id=? AND user_id=?")
        .get(req.params.id, req.userId);
      res.json(row ? view(row) : null);
    }),
  );
  app.post(
    "/api/read-aloud/attempts/:id/speech-assessment",
    wrap(async (req, res) => {
      const settings = input.parse(req.body);
      const capability = provider.capabilities(settings.locale);
      if (
        capability.status !== "available" ||
        (settings.prosody && !capability.prosody)
      )
        throw fail(
          503,
          "speech_configuration",
          "Acoustic assessment is unavailable for this practice target. Self-review remains available.",
        );
      const result = await db.transaction(async () => {
        if (!(await db.lockUser(req.userId)))
          throw fail(401, "account_missing", "Please sign in again.");
        await consent(req.userId);
        const attempt = await getAttempt(req.params.id, req.userId);
        if (
          attempt.mode !== "read_aloud" ||
          !attempt.audioId ||
          attempt.status !== "completed"
        )
          throw fail(
            409,
            "speech_source",
            "Save a reading with a private recording before assessment.",
          );
        await audioRoutes.assertOwnAudio(attempt.audioId, req.userId);
        const existing = await db
          .prepare("SELECT * FROM speech_jobs WHERE attempt_id=? AND user_id=?")
          .get(attempt.id, req.userId);
        if (existing) {
          const data = JSON.parse(existing.data);
          if (
            data.locale !== settings.locale ||
            data.prosody !== settings.prosody
          )
            throw fail(
              409,
              "speech_settings",
              "This recording already has a pinned practice target. Make a new reading attempt to change it.",
            );
          if (existing.status === "failed") {
            if ((data.retries || 0) >= 3)
              throw fail(
                429,
                "speech_retry_limit",
                "This assessment reached its retry limit. Please save a new reading take.",
              );
            await limit(`speech:${req.userId}`, 10, 3600000);
            existing.status = "queued";
            existing.data = JSON.stringify({ ...data, error: null });
            await db
              .prepare(
                "UPDATE speech_jobs SET status='queued',data=?,updated_at=? WHERE id=?",
              )
              .run(existing.data, instant(), existing.id);
          }
          return view(existing);
        }
        await limit(`speech:${req.userId}`, 10, 3600000);
        const id = randomUUID(),
          at = instant();
        const data = {
          locale: settings.locale,
          prosody: settings.prosody,
          consentedAt: at,
          retries: 0,
          result: null,
          error: null,
        };
        await db
          .prepare("INSERT INTO speech_jobs VALUES(?,?,?,?,?,?,?)")
          .run(
            id,
            req.userId,
            attempt.id,
            "queued",
            JSON.stringify(data),
            at,
            at,
          );
        return {
          id,
          attemptId: attempt.id,
          status: "queued",
          ...data,
          updatedAt: at,
        };
      });
      schedule(result.id);
      res.status(result.status === "completed" ? 200 : 202).json(result);
    }),
  );
  app.get(
    "/api/read-aloud/speech-jobs/:id",
    wrap(async (req, res) => {
      const row = await db
        .prepare("SELECT * FROM speech_jobs WHERE id=? AND user_id=?")
        .get(req.params.id, req.userId);
      if (!row)
        throw fail(404, "speech_job_missing", "Speech assessment not found.");
      if (["queued", "processing"].includes(row.status)) {
        if (cloud) await run(row.id);
        else schedule(row.id);
      }
      const latest = await db
        .prepare("SELECT * FROM speech_jobs WHERE id=? AND user_id=?")
        .get(row.id, req.userId);
      if (!latest)
        throw fail(404, "speech_job_missing", "Speech assessment not found.");
      res.json(view(latest));
    }),
  );
  return {
    available: () =>
      ["en-US", "en-GB"].some(
        (locale) => provider.capabilities(locale).status === "available",
      ),
    recover: async (maximum = 3) => {
      await cleanupSpeechScratch();
      const rows = await db
        .prepare(
          "SELECT id FROM speech_jobs WHERE status IN ('queued','processing') ORDER BY created_at LIMIT ?",
        )
        .all(maximum);
      for (const row of rows) await run(row.id);
    },
    close: async () => {
      closed = true;
      for (const timer of timers) clearTimeout(timer);
      for (const item of active.values()) item.controller.abort();
      await Promise.allSettled(
        [...active.values()].map((item) => item.promise),
      );
      scope.emitDestroy();
    },
  };
}
