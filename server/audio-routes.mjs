import { Buffer } from "node:buffer";
import { createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { transaction } from "./database.mjs";
import { providerJson } from "./provider.mjs";
import { MAX_RECORDING_BYTES, RECORDING_MIME_TYPES } from "./audio-storage.mjs";

export const AUDIO_RETENTION_MS = 30 * 86400000;
// Supabase upload capabilities last two hours. Keep deletion tombstones longer
// so a still-valid upload cannot permanently resurrect a deleted recording.
export const AUDIO_UPLOAD_WINDOW_MS = 130 * 60000;
const CLEANUP_RETRY_MS = 5 * 60000;
const pendingUploadSchema = z
  .object({
    mime: z.string().min(1).max(100),
    size: z.number().int().min(16).max(MAX_RECORDING_BYTES),
  })
  .strict();

export function installAudioRoutes({
  app,
  db,
  audioStorage,
  cloud = audioStorage.kind === "supabase",
  wrap,
  getUser,
  resolveAuth,
  limit,
  failure,
  providerConfig,
  signingSecret,
  friends,
  allowAI,
  now = () => Date.now(),
}) {
  const instant = () => new Date(now()).toISOString();
  const friendService = () =>
    typeof friends === "function" ? friends() : friends;
  const mimeType = (value) => {
    const mime = String(value || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!RECORDING_MIME_TYPES.includes(mime))
      throw failure(415, "Use a WebM, MP4, M4A, MP3, WAV or Ogg recording.");
    return mime;
  };
  const requireConsent = async (uid) => {
    const user = await getUser(uid);
    if (!user) throw failure(401, "This account is no longer available.");
    const profile =
      typeof user.profile === "string"
        ? JSON.parse(user.profile)
        : user.profile;
    if (profile?.consent?.recording !== true)
      throw failure(
        403,
        "Please consent to private recording storage before uploading audio.",
      );
    return user;
  };
  const requireRequestOwner = async (req) => {
    if (resolveAuth && (await resolveAuth(req)) !== req.userId)
      throw failure(401, "Please sign in again before saving this recording.");
  };
  const expiresAt = (row) => {
    const duration =
      row.status === "pending" ? AUDIO_UPLOAD_WINDOW_MS : AUDIO_RETENTION_MS;
    const createdExpiry = Date.parse(row.created_at) + duration;
    const explicit = Date.parse(row.expires_at);
    return Number.isFinite(explicit)
      ? Math.min(explicit, createdExpiry)
      : createdExpiry;
  };

  async function queueAudioDeletion(row) {
    if (!row?.id || !row.path)
      throw new TypeError("A saved audio row is required for deletion.");
    await transaction(db, async () => {
      await db
        .prepare(
          `INSERT OR IGNORE INTO deletion_outbox
        (id,object_key,user_id,status,attempts,next_attempt_at,last_error,created_at)
        VALUES(?,?,?,'pending',0,0,NULL,?)`,
        )
        .run(`audio:${row.id}`, row.path, row.user_id || null, instant());
      await db.prepare("DELETE FROM audio WHERE id=?").run(row.id);
    });
  }

  async function queueUserAudioDeletion(uid) {
    return transaction(db, async () => {
      await db.lockUser(uid);
      const rows = await db
        .prepare("SELECT * FROM audio WHERE user_id=?")
        .all(uid);
      for (const row of rows) await queueAudioDeletion(row);
      return rows.length;
    });
  }

  async function deleteObject(entry) {
    try {
      await audioStorage.delete(entry.object_key);
      const replayUntil = Date.parse(entry.created_at) + AUDIO_UPLOAD_WINDOW_MS;
      if (!cloud || now() >= replayUntil) {
        await db
          .prepare("DELETE FROM deletion_outbox WHERE id=?")
          .run(entry.id);
      } else {
        await db
          .prepare(
            `UPDATE deletion_outbox SET status='pending',attempts=attempts+1,
          next_attempt_at=?,last_error=NULL WHERE id=?`,
          )
          .run(Math.min(now() + CLEANUP_RETRY_MS, replayUntil), entry.id);
      }
      return true;
    } catch {
      // Keep provider messages, object URLs and credentials out of durable logs.
      await db
        .prepare(
          `UPDATE deletion_outbox SET status='pending',attempts=attempts+1,
        next_attempt_at=?,last_error='storage_unavailable' WHERE id=?`,
        )
        .run(now() + CLEANUP_RETRY_MS, entry.id);
      return false;
    }
  }

  async function cleanupAudio() {
    const oldReady = new Date(now() - AUDIO_RETENTION_MS).toISOString();
    const oldPending = new Date(now() - AUDIO_UPLOAD_WINDOW_MS).toISOString();
    const expired = await db
      .prepare(
        `SELECT * FROM audio WHERE
      (expires_at IS NOT NULL AND expires_at<=?) OR
      (status='ready' AND created_at<?) OR
      (status='pending' AND created_at<?)
      ORDER BY created_at LIMIT 100`,
      )
      .all(instant(), oldReady, oldPending);
    for (const row of expired) await queueAudioDeletion(row);
    const pending = await db
      .prepare(
        `SELECT * FROM deletion_outbox WHERE status='pending'
        AND next_attempt_at<=? ORDER BY next_attempt_at,created_at LIMIT 100`,
      )
      .all(now());
    let deleted = 0;
    for (const entry of pending) if (await deleteObject(entry)) deleted++;
    return { expired: expired.length, processed: pending.length, deleted };
  }

  async function getAudio(aid, uid, allowShared = false) {
    let row = await db.prepare("SELECT * FROM audio WHERE id=?").get(aid);
    if (
      row &&
      row.user_id !== uid &&
      !(allowShared && (await friendService()?.canAccessAudio(aid, uid)))
    )
      row = null;
    if (!row || row.status !== "ready")
      throw failure(
        404,
        "Recording not found or its retention period has ended.",
      );
    if (expiresAt(row) <= now()) {
      await queueAudioDeletion(row);
      const entry = await db
        .prepare("SELECT * FROM deletion_outbox WHERE id=?")
        .get(`audio:${row.id}`);
      if (entry) await deleteObject(entry);
      throw failure(
        404,
        "This recording’s thirty-day retention period has ended.",
      );
    }
    if (!(await audioStorage.exists(row.path)))
      throw failure(
        404,
        "Recording not found or its retention period has ended.",
      );
    return row;
  }

  const assertOwnAudio = (aid, uid) => getAudio(aid, uid);

  app.post(
    "/api/audio/uploads",
    wrap(async (req, res) => {
      await requireRequestOwner(req);
      await requireConsent(req.userId);
      if (!cloud) return res.json({ transport: "local" });
      const input = pendingUploadSchema.parse(req.body);
      const mime = mimeType(input.mime);
      await limit(`audio:${req.userId}`, 20, 3600000);
      const aid = randomUUID();
      const row = {
        id: aid,
        user_id: req.userId,
        mime,
        path: `${req.userId}/${aid}`,
        created_at: instant(),
        expires_at: new Date(now() + AUDIO_UPLOAD_WINDOW_MS).toISOString(),
      };
      await transaction(db, async () => {
        await db.lockUser(req.userId);
        await requireConsent(req.userId);
        await requireRequestOwner(req);
        const pending = await db
          .prepare(
            "SELECT COUNT(*) AS count FROM audio WHERE user_id=? AND status='pending' AND expires_at>?",
          )
          .get(req.userId, instant());
        if (Number(pending.count) >= 5)
          throw failure(
            429,
            "Finish your pending recordings before starting another upload.",
          );
        await db
          .prepare(
            `INSERT INTO audio
        (id,user_id,mime,path,created_at,status,expected_size,size_bytes,expires_at)
        VALUES(?,?,?,?,?,'pending',?,NULL,?)`,
          )
          .run(
            aid,
            req.userId,
            mime,
            row.path,
            row.created_at,
            input.size,
            row.expires_at,
          );
      });
      try {
        const signed = await audioStorage.signUpload(row.path);
        await requireRequestOwner(req);
        await requireConsent(req.userId);
        res.status(201).json({ transport: "direct", id: aid, ...signed });
      } catch (error) {
        await queueAudioDeletion(row);
        throw error;
      }
    }),
  );

  app.post(
    "/api/audio/uploads/:id/complete",
    wrap(async (req, res) => {
      await requireRequestOwner(req);
      await requireConsent(req.userId);
      const row = await db
        .prepare("SELECT * FROM audio WHERE id=? AND user_id=?")
        .get(req.params.id, req.userId);
      if (!cloud || !row) throw failure(404, "Recording upload not found.");
      if (expiresAt(row) <= now()) {
        await queueAudioDeletion(row);
        throw failure(
          410,
          "This recording upload has expired. Please try again.",
        );
      }
      if (row.status === "ready")
        return res.json({ id: row.id, audioId: row.id });
      if (row.status !== "pending")
        throw failure(409, "This recording upload is unavailable.");
      const actual = await audioStorage.inspect(row.path);
      if (!actual)
        throw failure(
          409,
          "The recording is still uploading. Please try again.",
        );
      if (
        !Number.isSafeInteger(actual.size) ||
        actual.size < 16 ||
        actual.size > MAX_RECORDING_BYTES ||
        actual.size !== Number(row.expected_size) ||
        actual.mime !== row.mime
      ) {
        await queueAudioDeletion(row);
        const entry = await db
          .prepare("SELECT * FROM deletion_outbox WHERE id=?")
          .get(`audio:${row.id}`);
        if (entry) await deleteObject(entry);
        throw failure(
          400,
          "The uploaded recording did not match its declared size or format. Please record again.",
        );
      }
      await transaction(db, async () => {
        await db.lockUser(req.userId);
        await requireRequestOwner(req);
        await requireConsent(req.userId);
        const current = await db
          .prepare("SELECT * FROM audio WHERE id=? AND user_id=?")
          .get(row.id, req.userId);
        if (!current || expiresAt(current) <= now())
          throw failure(410, "This recording upload has expired.");
        if (current.status === "ready") return;
        if (current.status !== "pending")
          throw failure(409, "This recording upload is unavailable.");
        await db
          .prepare(
            "UPDATE audio SET status='ready',size_bytes=?,expires_at=? WHERE id=? AND status='pending'",
          )
          .run(
            actual.size,
            new Date(
              Date.parse(current.created_at) + AUDIO_RETENTION_MS,
            ).toISOString(),
            row.id,
          );
      });
      res.json({ id: row.id, audioId: row.id });
    }),
  );

  app.post(
    "/api/audio",
    wrap(async (req, res) => {
      if (cloud)
        throw failure(
          409,
          "Refresh the app to upload this recording directly to private storage.",
        );
      await limit(`audio:${req.userId}`, 20, 3600000);
      await requireConsent(req.userId);
      await requireRequestOwner(req);
      const mime = mimeType(req.headers["content-type"]);
      if (!Buffer.isBuffer(req.body) || req.body.length < 16)
        throw failure(400, "The recording is empty. Please record again.");
      if (req.body.length > MAX_RECORDING_BYTES)
        throw failure(413, "Keep recordings under 10 MB.");
      const aid = randomUUID();
      const stored = await audioStorage.put(aid, req.body, mime);
      try {
        await transaction(db, async () => {
          await db.lockUser(req.userId);
          await requireConsent(req.userId);
          await requireRequestOwner(req);
          await db
            .prepare(
              `INSERT INTO audio
          (id,user_id,mime,path,created_at,status,expected_size,size_bytes,expires_at)
          VALUES(?,?,?,?,?,'ready',?,?,?)`,
            )
            .run(
              aid,
              req.userId,
              mime,
              stored.path,
              instant(),
              req.body.length,
              req.body.length,
              new Date(now() + AUDIO_RETENTION_MS).toISOString(),
            );
        });
      } catch (error) {
        await queueAudioDeletion({
          id: aid,
          path: stored.path,
          user_id: req.userId,
        });
        const entry = await db
          .prepare("SELECT * FROM deletion_outbox WHERE id=?")
          .get(`audio:${aid}`);
        if (entry) await deleteObject(entry);
        throw error;
      }
      res.status(201).json({ id: aid, audioId: aid });
    }),
  );

  app.get(
    "/api/audio/:id/url",
    wrap(async (req, res) => {
      const audio = await getAudio(req.params.id, req.userId, true);
      const seconds = Math.max(
        1,
        Math.min(300, Math.floor((expiresAt(audio) - now()) / 1000)),
      );
      const expires = now() + seconds * 1000;
      let url;
      if (cloud) {
        url = (await audioStorage.signPlayback(audio.path, seconds)).signedUrl;
      } else {
        const encoded = Buffer.from(
          JSON.stringify({ audioId: audio.id, userId: req.userId, expires }),
        ).toString("base64url");
        const signature = createHmac("sha256", signingSecret)
          .update(encoded)
          .digest("base64url");
        url = `/api/audio/${audio.id}?access=${encoded}.${signature}`;
      }
      res.json({ url, expiresAt: new Date(expires).toISOString() });
    }),
  );

  app.get(
    "/api/audio/:id",
    wrap(async (req, res) => {
      const audio = await getAudio(req.params.id, req.userId, true);
      if (cloud) {
        const seconds = Math.max(
          1,
          Math.min(300, Math.floor((expiresAt(audio) - now()) / 1000)),
        );
        return res.redirect(
          302,
          (await audioStorage.signPlayback(audio.path, seconds)).signedUrl,
        );
      }
      res.setHeader("Content-Type", audio.mime);
      res.setHeader("Content-Disposition", "inline");
      res.sendFile(resolve(audio.path));
    }),
  );

  async function transcribeAudio(aid, uid) {
    const audio = await getAudio(aid, uid);
    if (!providerConfig.apiKey)
      return {
        text: "",
        requiresManualTranscription: true,
        message:
          "Automatic transcription is unavailable in local practice mode. Listen to your recording and type or paste your transcript before evaluation.",
      };
    await requireConsent(uid);
    await limit(`transcribe:${uid}`, 20, 3600000);
    if (allowAI) await allowAI(uid, "transcription");
    const ext =
      audio.mime.includes("mp4") || audio.mime.includes("m4a")
        ? "m4a"
        : audio.mime.includes("ogg")
          ? "ogg"
          : audio.mime.includes("wav")
            ? "wav"
            : audio.mime.includes("mpeg")
              ? "mp3"
              : "webm";
    const bytes = await audioStorage.read(audio.path);
    await requireConsent(uid);
    await getAudio(aid, uid);
    const form = new FormData();
    form.set("model", providerConfig.transcriptionModel);
    form.set(
      "file",
      new Blob([bytes], { type: audio.mime }),
      `recording.${ext}`,
    );
    const data = await providerJson(
      "audio/transcriptions",
      { body: form },
      providerConfig,
    );
    await requireConsent(uid);
    await getAudio(aid, uid);
    if (typeof data.text !== "string" || data.text.length > 10000)
      throw failure(
        502,
        "The transcription could not be read. Your recording is saved.",
      );
    return { text: data.text, requiresManualTranscription: false };
  }

  app.post(
    "/api/audio/:id/transcribe",
    wrap(async (req, res) => {
      const result = await transcribeAudio(req.params.id, req.userId);
      await requireRequestOwner(req);
      res.json(result);
    }),
  );

  return {
    getAudio,
    assertOwnAudio,
    transcribeAudio,
    cleanupAudio,
    queueAudioDeletion,
    queueUserAudioDeletion,
  };
}
