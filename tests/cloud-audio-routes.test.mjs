import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { openDatabase, transaction } from "../server/database.mjs";
import {
  createAudioStorage,
  MAX_RECORDING_BYTES,
} from "../server/audio-storage.mjs";
import {
  installAudioRoutes,
  AUDIO_UPLOAD_WINDOW_MS,
  AUDIO_RETENTION_MS,
} from "../server/audio-routes.mjs";

const bytes = Buffer.from("a synthetic private recording for route tests");
const failure = (status, message) =>
  Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(next);

async function fixture(t, { local = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "garden-audio-routes-"));
  const db = openDatabase(join(directory, "garden.sqlite"));
  let clock = Date.now();
  const objects = new Map();
  const deleted = [];
  let deleteFailure = false;
  let inspection;
  let signing;
  const audioStorage = local
    ? createAudioStorage({ storageDir: join(directory, "audio") })
    : {
        kind: "supabase",
        ready: Promise.resolve(),
        async signUpload(path) {
          if (signing) await signing(path);
          return {
            path,
            token: "synthetic-token",
            signedUrl: `https://storage.invalid/storage/v1/object/upload/sign/recordings/${path}?token=synthetic-token`,
          };
        },
        async inspect(path) {
          if (inspection) await inspection(path);
          const value = objects.get(path);
          return value ? { size: value.bytes.length, mime: value.mime } : null;
        },
        async exists(path) {
          return objects.has(path);
        },
        async read(path) {
          if (!objects.has(path)) throw failure(404, "missing");
          return objects.get(path).bytes;
        },
        async delete(path) {
          if (deleteFailure) throw new Error("Synthetic unavailable storage");
          deleted.push(path);
          objects.delete(path);
        },
        async signPlayback(path, seconds) {
          return {
            signedUrl: `https://storage.invalid/private/${path}?expires=${seconds}`,
          };
        },
      };
  const app = express();
  app.use(
    "/api/audio",
    express.raw({
      type: ["audio/*", "video/webm", "application/octet-stream"],
      limit: "10mb",
    }),
  );
  app.use(express.json());
  const getUser = (uid) =>
    db.prepare("SELECT * FROM users WHERE id=?").get(uid);
  const resolveAuth = async (req) => {
    const uid = req.headers["x-test-user"];
    return uid && (await getUser(uid)) ? uid : null;
  };
  // Authentication middleware is deliberately independent from the app's real
  // auth provider. The tested routes still recheck identity and DB ownership.
  app.use((req, res, next) => {
    resolveAuth(req)
      .then((uid) => {
        if (!uid) return next(failure(401, "Sign in"));
        req.userId = uid;
        next();
      })
      .catch(next);
  });
  const shared = new Set();
  const routes = installAudioRoutes({
    app,
    db,
    audioStorage,
    cloud: !local,
    wrap,
    getUser,
    resolveAuth,
    failure,
    signingSecret: randomBytes(32),
    providerConfig: { apiKey: "" },
    now: () => clock,
    limit: async (key, max, window) => {
      if (!(await db.consumeRateLimit(key, max, window)).allowed)
        throw failure(429, "Rate limited");
    },
    friends: () => ({
      canAccessAudio: async (aid, uid) => shared.has(`${aid}:${uid}`),
    }),
  });
  app.use((error, _req, res, _next) =>
    res
      .status(error.status || (error.issues ? 400 : 500))
      .json({ error: error.message }),
  );
  await db.ready;
  for (const uid of ["owner-a", "owner-b", "outsider"])
    await db
      .prepare(
        "INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        uid,
        JSON.stringify({ consent: { recording: true } }),
        "{}",
        "[]",
        new Date(clock).toISOString(),
      );
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const request = async (
    path,
    { user = "owner-a", method = "GET", body, raw, mime = "audio/webm" } = {},
  ) => {
    const response = await fetch(base + path, {
      method,
      redirect: "manual",
      headers: {
        "x-test-user": user,
        ...(raw
          ? { "Content-Type": mime }
          : body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
      },
      body: raw || (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, data, headers: response.headers };
  };
  const admit = async (
    user = "owner-a",
    size = bytes.length,
    mime = "audio/webm",
  ) =>
    request("/api/audio/uploads", {
      user,
      method: "POST",
      body: { size, mime },
    });
  const upload = async (user = "owner-a") => {
    const response = await admit(user);
    assert.equal(response.status, 201);
    objects.set(response.data.path, { bytes, mime: "audio/webm" });
    return response.data;
  };
  return {
    db,
    objects,
    deleted,
    routes,
    request,
    admit,
    upload,
    shared,
    audioStorage,
    time: () => clock,
    advance: (ms) => {
      clock += ms;
    },
    failDeletes: (value) => {
      deleteFailure = value;
    },
    onInspect: (fn) => {
      inspection = fn;
    },
    onSign: (fn) => {
      signing = fn;
    },
    consent: (uid, recording) =>
      db
        .prepare("UPDATE users SET profile=? WHERE id=?")
        .run(JSON.stringify({ consent: { recording } }), uid),
  };
}

test("cloud uploads remain private and unattachable until owned bytes are finalized", async (t) => {
  const f = await fixture(t);
  const pending = await f.upload();
  assert.equal((await f.request(`/api/audio/${pending.id}/url`)).status, 404);
  await assert.rejects(f.routes.assertOwnAudio(pending.id, "owner-a"), {
    status: 404,
  });
  assert.equal(
    (
      await f.request(`/api/audio/uploads/${pending.id}/complete`, {
        user: "owner-b",
        method: "POST",
      })
    ).status,
    404,
  );
  const first = await f.request(`/api/audio/uploads/${pending.id}/complete`, {
    method: "POST",
  });
  assert.equal(first.status, 200);
  assert.equal(first.data.id, pending.id);
  assert.equal(
    (
      await f.request(`/api/audio/uploads/${pending.id}/complete`, {
        method: "POST",
      })
    ).status,
    200,
  );
  const row = await f.routes.assertOwnAudio(pending.id, "owner-a");
  assert.equal(row.status, "ready");
  assert.equal(row.size_bytes, bytes.length);
  assert.equal(
    Date.parse(row.expires_at) - Date.parse(row.created_at),
    AUDIO_RETENTION_MS,
  );
  assert.equal(
    (await f.request(`/api/audio/${pending.id}/url`, { user: "outsider" }))
      .status,
    404,
  );
  const url = await f.request(`/api/audio/${pending.id}/url`);
  assert.equal(url.status, 200);
  assert.match(url.data.url, /https:\/\/storage\.invalid\/private\//);
  f.shared.add(`${pending.id}:owner-b`);
  assert.equal(
    (await f.request(`/api/audio/${pending.id}/url`, { user: "owner-b" }))
      .status,
    200,
  );
  assert.equal(
    (
      await f.request(`/api/audio/${pending.id}/transcribe`, {
        user: "owner-b",
        method: "POST",
      })
    ).status,
    404,
  );
});

test("cloud upload admission is bounded and checks consent and metadata", async (t) => {
  const f = await fixture(t);
  await f.consent("owner-b", false);
  assert.equal((await f.admit("owner-b")).status, 403);
  assert.equal((await f.admit("owner-a", MAX_RECORDING_BYTES + 1)).status, 400);
  assert.equal((await f.admit("owner-a", 12)).status, 400);
  assert.equal(
    (await f.admit("owner-a", bytes.length, "text/html")).status,
    415,
  );
  for (let i = 0; i < 5; i++) assert.equal((await f.admit()).status, 201);
  assert.equal((await f.admit()).status, 429);
  assert.equal(
    (await f.request("/api/audio", { method: "POST", raw: bytes })).status,
    409,
  );
});

for (const mismatch of ["size", "mime"]) {
  test(`finalization rejects actual ${mismatch} mismatch and durably queues deletion`, async (t) => {
    const f = await fixture(t);
    const pending = await f.upload();
    f.objects.set(pending.path, {
      bytes: mismatch === "size" ? Buffer.from("short") : bytes,
      mime: mismatch === "mime" ? "text/html" : "audio/webm",
    });
    assert.equal(
      (
        await f.request(`/api/audio/uploads/${pending.id}/complete`, {
          method: "POST",
        })
      ).status,
      400,
    );
    assert.equal(
      await f.db.prepare("SELECT id FROM audio WHERE id=?").get(pending.id),
      undefined,
    );
    assert.equal(f.objects.has(pending.path), false);
    assert.ok(
      await f.db
        .prepare("SELECT id FROM deletion_outbox WHERE id=?")
        .get(`audio:${pending.id}`),
    );
  });
}

test("consent and identity are rechecked after storage network operations", async (t) => {
  const f = await fixture(t);
  f.onSign(() => f.consent("owner-a", false));
  assert.equal((await f.admit()).status, 403);
  assert.equal(
    (await f.db.prepare("SELECT COUNT(*) AS count FROM audio").get()).count,
    0,
  );
  await f.consent("owner-a", true);
  f.onSign(null);
  const pending = await f.upload();
  f.onInspect(() => f.consent("owner-a", false));
  assert.equal(
    (
      await f.request(`/api/audio/uploads/${pending.id}/complete`, {
        method: "POST",
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.db.prepare("SELECT status FROM audio WHERE id=?").get(pending.id))
      .status,
    "pending",
  );
});

test("missing objects can finish later but abandoned admissions expire", async (t) => {
  const f = await fixture(t);
  const pending = (await f.admit()).data;
  assert.equal(
    (
      await f.request(`/api/audio/uploads/${pending.id}/complete`, {
        method: "POST",
      })
    ).status,
    409,
  );
  f.advance(AUDIO_UPLOAD_WINDOW_MS + 1);
  assert.equal(
    (
      await f.request(`/api/audio/uploads/${pending.id}/complete`, {
        method: "POST",
      })
    ).status,
    410,
  );
  assert.equal(
    await f.db.prepare("SELECT id FROM audio WHERE id=?").get(pending.id),
    undefined,
  );
});

test("account deletion revokes access immediately and retries storage removal across token replay", async (t) => {
  const f = await fixture(t);
  const pending = await f.upload();
  await transaction(f.db, async () => {
    await f.routes.queueUserAudioDeletion("owner-a");
    await f.db.prepare("DELETE FROM users WHERE id=?").run("owner-a");
  });
  assert.equal(
    await f.db.prepare("SELECT id FROM audio WHERE id=?").get(pending.id),
    undefined,
  );
  f.failDeletes(true);
  const failed = await f.routes.cleanupAudio();
  assert.equal(failed.deleted, 0);
  let outbox = await f.db
    .prepare("SELECT * FROM deletion_outbox WHERE id=?")
    .get(`audio:${pending.id}`);
  assert.equal(outbox.last_error, "storage_unavailable");
  assert.equal(f.objects.has(pending.path), true);
  f.failDeletes(false);
  f.advance(5 * 60000);
  await f.routes.cleanupAudio();
  assert.equal(f.objects.has(pending.path), false);
  assert.ok(
    await f.db
      .prepare("SELECT id FROM deletion_outbox WHERE id=?")
      .get(`audio:${pending.id}`),
  );
  f.objects.set(pending.path, { bytes, mime: "audio/webm" });
  f.advance(5 * 60000);
  await f.routes.cleanupAudio();
  assert.equal(
    f.objects.has(pending.path),
    false,
    "A replayed still-valid upload is deleted again",
  );
  f.advance(AUDIO_UPLOAD_WINDOW_MS);
  await f.routes.cleanupAudio();
  outbox = await f.db
    .prepare("SELECT * FROM deletion_outbox WHERE id=?")
    .get(`audio:${pending.id}`);
  assert.equal(outbox, undefined);
});

test("retention cleanup removes ready recordings and expired pending uploads", async (t) => {
  const f = await fixture(t);
  const ready = await f.upload();
  await f.request(`/api/audio/uploads/${ready.id}/complete`, {
    method: "POST",
  });
  const pending = await f.upload();
  f.advance(AUDIO_RETENTION_MS + 1);
  const result = await f.routes.cleanupAudio();
  assert.equal(result.expired, 2);
  assert.equal(f.objects.has(ready.path), false);
  assert.equal(f.objects.has(pending.path), false);
  assert.equal((await f.request(`/api/audio/${ready.id}/url`)).status, 404);
});

test("local uploads retain playback, manual transcription and immediate expired-file deletion", async (t) => {
  const f = await fixture(t, { local: true });
  assert.deepEqual((await f.admit()).data, { transport: "local" });
  const uploaded = await f.request("/api/audio", {
    method: "POST",
    raw: bytes,
  });
  assert.equal(uploaded.status, 201);
  const row = await f.routes.getAudio(uploaded.data.id, "owner-a");
  assert.equal(existsSync(row.path), true);
  assert.equal(
    (await f.request(`/api/audio/${row.id}`)).data,
    bytes.toString(),
  );
  assert.equal(
    (await f.request(`/api/audio/${row.id}/transcribe`, { method: "POST" }))
      .data.requiresManualTranscription,
    true,
  );
  await f.db
    .prepare("UPDATE audio SET created_at=? WHERE id=?")
    .run("2000-01-01T00:00:00.000Z", row.id);
  assert.equal((await f.request(`/api/audio/${row.id}/url`)).status, 404);
  assert.equal(existsSync(row.path), false);
  assert.equal(
    await f.db
      .prepare("SELECT id FROM deletion_outbox WHERE id=?")
      .get(`audio:${row.id}`),
    undefined,
  );
});
