import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createElevenLabsReader } from "../server/elevenlabs-reader.mjs";
import { createApp } from "../server/app.mjs";

const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(64)]);
test("ElevenLabs reads only the requested passage using the server key and returns bounded MP3", async () => {
  let request;
  const reader = createElevenLabsReader({
    key: "private-test-key",
    voiceId: "testvoice",
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return new Response(mp3, { headers: { "content-type": "audio/mpeg" } });
    },
  });
  assert.deepEqual(await reader.synthesize("A short passage."), mp3);
  assert.match(request.url, /testvoice\?output_format=mp3_44100_128$/);
  assert.equal(request.headers["xi-api-key"], "private-test-key");
  assert.deepEqual(JSON.parse(request.body), {
    text: "A short passage.",
    model_id: "eleven_multilingual_v2",
  });
  await assert.rejects(reader.synthesize("x".repeat(5001)), /unavailable/);
});

test("ElevenLabs fails safely for missing configuration, provider errors, oversized and invalid audio", async () => {
  await assert.rejects(
    createElevenLabsReader({ key: "", voiceId: "" }).synthesize("Hello"),
    /isn’t available/,
  );
  for (const response of [
    new Response("private-provider-detail", { status: 401 }),
    new Response("invalid audio", {
      headers: { "content-type": "audio/mpeg" },
    }),
    new Response(mp3, {
      headers: { "content-type": "audio/mpeg", "content-length": "9999999" },
    }),
  ]) {
    const reader = createElevenLabsReader({
      key: "fixture",
      voiceId: "fixture",
      fetchImpl: async () => response,
    });
    await assert.rejects(
      reader.synthesize("Hello"),
      (error) =>
        error.status === 502 &&
        !error.message.includes("private-provider-detail"),
    );
  }
});

test("sample is gated by owned feedback, cached, privately playable, bounded and never awards XP", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "reading-sample-"));
  let calls = 0,
    receivedText = "";
  const reader = {
    configured: true,
    identity: "fixture-voice-v1",
    synthesize: async (text) => {
      calls++;
      receivedText = text;
      return mp3;
    },
  };
  const service = createApp({
    dbPath: join(directory, "test.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: "",
    disableWorker: true,
    sampleReader: reader,
  });
  await service.ready;
  const server = await new Promise((resolve) => {
    const s = service.app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, token, body, method = body ? "POST" : "GET") => {
    const raw = Buffer.isBuffer(body);
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body
          ? { "Content-Type": raw ? "audio/mpeg" : "application/json" }
          : {}),
      },
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
  const ok = async (...args) => {
    const r = await request(...args);
    assert.ok(r.status < 300, JSON.stringify(r));
    return r.data;
  };
  const { token } = await ok("/auth/guest", null, {});
  const other = (await ok("/auth/guest", null, {})).token;
  await ok("/me", token, { consent: { recording: true } }, "PATCH");
  await ok("/daily-workout/enroll", token, {});
  const assignment = await ok("/read-aloud/assignment", token);
  const uploaded = await ok("/audio", token, mp3);
  const attempt = await ok(
    `/read-aloud/assignments/${assignment.id}/submit`,
    token,
    { idempotencyKey: randomUUID(), audioId: uploaded.id },
  );
  const path = `/read-aloud/attempts/${attempt.id}/sample`;
  assert.equal((await request(path, token, {})).status, 409);
  attempt.speechAssessment = { status: "assessed" }; // Completed assessment fixture; no real learner audio or paid provider call.
  await service.db
    .prepare("UPDATE attempts SET data=? WHERE id=?")
    .run(JSON.stringify(attempt), attempt.id);
  assert.equal((await request(path, other, {})).status, 404);
  assert.equal(
    (await request(path, token, { text: "arbitrary text" })).status,
    400,
  );
  assert.equal(calls, 0);
  assert.equal((await ok(path, token)).available, true);
  const sample = await ok(path, token, {});
  assert.equal(receivedText, assignment.passage.text);
  assert.equal(calls, 1);
  assert.deepEqual(await ok(path, token, {}), sample);
  assert.equal(calls, 1);
  assert.equal((await ok(path, token)).sample.audioId, sample.audioId);
  assert.equal(
    (await request(`/audio/${sample.audioId}/url`, other)).status,
    404,
  );
  const playback = await ok(`/audio/${sample.audioId}/url`, token);
  assert.deepEqual(
    Buffer.from(await (await fetch(base + playback.url)).arrayBuffer()),
    mp3,
  );
  const saved = JSON.parse(
    (
      await service.db
        .prepare("SELECT data FROM attempts WHERE id=?")
        .get(attempt.id)
    ).data,
  );
  assert.deepEqual(saved.rewards, attempt.rewards);
  // Expired samples are regenerated on demand, without a second reading submission.
  await service.db
    .prepare("UPDATE audio SET expires_at=? WHERE id=?")
    .run("2000-01-01T00:00:00Z", sample.audioId);
  reader.configured = false;
  assert.equal((await ok(path, token)).available, false);
  assert.equal((await request(path, token, {})).status, 503);
  reader.configured = true;
  const regenerated = await ok(path, token, {});
  assert.notEqual(regenerated.audioId, sample.audioId);
  assert.equal(calls, 2);
});
