import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { AUDIO_RETENTION_MS } from "./audio-routes.mjs";
import { createElevenLabsReader } from "./elevenlabs-reader.mjs";

export function installReadingSample({
  app,
  db,
  wrap,
  getAttempt,
  audioRoutes,
  audioStorage,
  limit,
  failure,
  options,
}) {
  const reader = options.sampleReader || createElevenLabsReader();
  const eligible = async (id, uid) => {
    const attempt = await getAttempt(id, uid);
    if (
      attempt.mode !== "read_aloud" ||
      !attempt.audioId ||
      !attempt.speechAssessment
    )
      throw failure(
        409,
        "Finish your reading and open its feedback before listening to a sample.",
      );
    return attempt;
  };
  const fingerprint = (attempt) =>
    createHash("sha256")
      .update(`${reader.identity}\n${attempt.passage.text}`)
      .digest("hex");
  const cached = async (attempt, uid) => {
    const sample = attempt.sampleReading;
    if (!sample || sample.fingerprint !== fingerprint(attempt)) return null;
    try {
      await audioRoutes.assertOwnAudio(sample.audioId, uid);
      return { audioId: sample.audioId, provider: "elevenlabs" };
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };
  const path = "/api/read-aloud/attempts/:id/sample";
  app.get(
    path,
    wrap(async (req, res) => {
      const attempt = await eligible(req.params.id, req.userId);
      const sample = await cached(attempt, req.userId);
      res.json({ available: Boolean(sample || reader.configured), sample });
    }),
  );
  app.post(
    path,
    wrap(async (req, res) => {
      z.object({})
        .strict()
        .parse(req.body || {});
      const uid = req.userId;
      const original = await eligible(req.params.id, uid);
      const existing = await cached(original, uid);
      if (existing) return res.json(existing);
      if (!reader.configured)
        throw failure(503, "Sample audio isn’t available yet.");
      const leaseName = `reading-sample:${uid}:${original.id}`;
      const lease = await db.acquireLease(leaseName, randomUUID(), 90000);
      if (!lease)
        throw failure(
          409,
          "Your sample is being prepared. Try again in a moment.",
        );
      let stored;
      const aid = randomUUID();
      try {
        // Recheck after locking: a concurrent request may have just completed.
        const attempt = await eligible(original.id, uid);
        const saved = await cached(attempt, uid);
        if (saved) return res.json(saved);
        await limit(`reading-sample:${uid}`, 10, 86400000);
        const bytes = await reader.synthesize(attempt.passage.text);
        stored = await audioStorage.put(`${uid}/${aid}`, bytes, "audio/mpeg");
        await db.transaction(async () => {
          if (!(await db.lockUser(uid)))
            throw failure(401, "Please sign in again.");
          if (!(await db.ownsLease(leaseName, lease.token)))
            throw failure(409, "Please request the sample again.");
          const latest = await eligible(attempt.id, uid);
          const created = new Date();
          await db
            .prepare(
              `INSERT INTO audio
          (id,user_id,mime,path,created_at,status,expected_size,size_bytes,expires_at)
          VALUES(?,?,?,?,?,'ready',?,?,?)`,
            )
            .run(
              aid,
              uid,
              "audio/mpeg",
              stored.path,
              created.toISOString(),
              bytes.length,
              bytes.length,
              new Date(created.getTime() + AUDIO_RETENTION_MS).toISOString(),
            );
          latest.sampleReading = {
            audioId: aid,
            fingerprint: fingerprint(attempt),
          };
          await db
            .prepare("UPDATE attempts SET data=? WHERE id=? AND user_id=?")
            .run(JSON.stringify(latest), latest.id, uid);
        });
        res.status(201).json({ audioId: aid, provider: "elevenlabs" });
      } catch (error) {
        if (stored)
          await audioRoutes.queueAudioDeletion({
            id: aid,
            path: stored.path,
            user_id: uid,
          });
        throw error;
      } finally {
        await db.releaseLease(leaseName, lease.token);
      }
    }),
  );
}
