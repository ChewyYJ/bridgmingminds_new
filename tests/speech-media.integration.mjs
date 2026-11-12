// Optional real-media checks. Requires FFMPEG_PATH or ffmpeg on PATH; no paid
// provider or real learner recording is used. Separate from the portable suite.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decodeSpeechAudio } from "../server/speech-audio.mjs";
const executable = process.env.FFMPEG_PATH || "ffmpeg";
function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      ["-hide_banner", "-loglevel", "error", "-nostdin", ...args],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const chunks = [],
      errors = [];
    child.on("error", reject);
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => errors.push(c));
    child.stdin.on("error", () => {});
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(
            new Error(
              `Fixture encoder failed (${code}): ${Buffer.concat(errors).toString().slice(0, 500)}`,
            ),
          ),
    );
    child.stdin.end(input);
  });
}
function wave(seconds = 4, rate = 48000, channels = 2) {
  const length = Math.round(seconds * rate) * channels * 2,
    b = Buffer.alloc(44 + length);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(length, 40);
  for (let frame = 0; frame < length / (2 * channels); frame++)
    for (let channel = 0; channel < channels; channel++)
      b.writeInt16LE(
        Math.round(
          Math.sin((frame / rate) * 2 * Math.PI * (440 + channel * 110)) * 6000,
        ),
        44 + (frame * channels + channel) * 2,
      );
  return b;
}
const source = wave();
function assertDecoded(result, seconds = 4) {
  assert.ok(
    Math.abs(result.durationMs - seconds * 1000) < 100,
    `duration=${result.durationMs}`,
  );
  assert.equal(result.pcm.length % 2, 0);
  let peak = 0;
  for (let offset = 0; offset < result.pcm.length; offset += 2)
    peak = Math.max(peak, Math.abs(result.pcm.readInt16LE(offset)));
  assert.ok(peak > 1000, "decoded signal must not be empty or silent");
}
const containers = [
  ["WebM/Opus", "audio/webm", ["-c:a", "libopus", "-f", "webm"]],
  ["Ogg/Opus", "audio/ogg", ["-c:a", "libopus", "-f", "ogg"]],
  ["MP3", "audio/mpeg", ["-c:a", "libmp3lame", "-f", "mp3"]],
  [
    "fragmented MP4/AAC",
    "audio/mp4",
    ["-c:a", "aac", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4"],
  ],
];
for (const [name, mime, format] of containers)
  test(`real ${name} converts stereo 48kHz audio to mono 16kHz PCM`, async () => {
    const bytes = await ffmpeg(
      ["-f", "wav", "-i", "pipe:0", ...format, "pipe:1"],
      source,
    );
    assertDecoded(await decodeSpeechAudio(bytes, mime, { executable }));
  });
test("real non-fragmented M4A with end-of-file metadata remains decodable", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "speech-media-fixture-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "native-style.m4a");
  await ffmpeg(
    ["-f", "wav", "-i", "pipe:0", "-c:a", "aac", "-b:a", "192k", path],
    wave(12),
  );
  const bytes = await readFile(path);
  assert.ok(
    bytes.indexOf(Buffer.from("mdat")) < bytes.indexOf(Buffer.from("moov")),
  );
  assertDecoded(
    await decodeSpeechAudio(bytes, "audio/m4a", { executable }),
    12,
  );
});
test("real stereo WAV is resampled, while corrupt media is rejected", async () => {
  assertDecoded(await decodeSpeechAudio(source, "audio/wav", { executable }));
  await assert.rejects(
    decodeSpeechAudio(Buffer.alloc(1000, 1), "audio/webm", { executable }),
    { code: "invalid_speech_audio" },
  );
});
test("real overlong compressed audio is rejected instead of silently truncated", async () => {
  const bytes = await ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=16000:duration=180.2",
    "-c:a",
    "libopus",
    "-b:a",
    "16k",
    "-f",
    "ogg",
    "pipe:1",
  ]);
  await assert.rejects(decodeSpeechAudio(bytes, "audio/ogg", { executable }), {
    code: "invalid_speech_audio",
  });
});

test("real native-style AAC upload passes through private reading jobs and actual decoding without extra XP", async (t) => {
  const { createApp } = await import("../server/app.mjs");
  const { speechCapabilities, normalizeSpeechResult } =
    await import("../server/speech-assessment.mjs");
  const { randomUUID } = await import("node:crypto");
  const directory = await mkdtemp(join(tmpdir(), "speech-real-api-"));
  let service, server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (service) await service.close();
    await rm(directory, { recursive: true, force: true });
  });
  const path = join(directory, "native.m4a");
  await ffmpeg(
    ["-f", "wav", "-i", "pipe:0", "-c:a", "aac", "-b:a", "192k", path],
    wave(12),
  );
  const media = await readFile(path);
  let calls = 0;
  service = createApp({
    dbPath: join(directory, "db.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: "",
    disableWorker: true,
    decodeSpeechAudio: (bytes, mime, options) =>
      decodeSpeechAudio(bytes, mime, {
        ...options,
        executable,
        temporaryRoot: join(directory, "scratch"),
      }),
    speechProvider: {
      capabilities: (locale) =>
        speechCapabilities({ configured: true, locale }),
      assess: async ({ pcm, referenceText, locale }) => {
        calls++;
        const durationMs = pcm.length / 32;
        assert.ok(Math.abs(durationMs - 12000) < 100);
        assert.ok(pcm.some((byte) => byte !== 0));
        const word = referenceText.match(/[\p{L}\p{N}]+/u)[0];
        return normalizeSpeechResult({
          referenceText,
          locale,
          sdkVersion: "offline-result-real-decoder",
          audioDurationMs: durationMs,
          segments: [
            {
              RecognitionStatus: "Success",
              Offset: 0,
              Duration: 10000000,
              NBest: [
                {
                  Display: word,
                  PronunciationAssessment: { AccuracyScore: 80 },
                  Words: [
                    {
                      Word: word,
                      Offset: 0,
                      Duration: 5000000,
                      PronunciationAssessment: {
                        AccuracyScore: 80,
                        ErrorType: "None",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        });
      },
    },
  });
  server = await new Promise((resolve) => {
    const current = service.app.listen(0, "127.0.0.1", () => resolve(current));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(
    path,
    token,
    body,
    method = body ? "POST" : "GET",
    raw,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body || raw
          ? { "Content-Type": raw ? "audio/m4a" : "application/json" }
          : {}),
      },
      body: raw || (body ? JSON.stringify(body) : undefined),
    });
    const data = await response.json();
    assert.ok(response.ok, JSON.stringify(data));
    return data;
  }
  const { token } = await request("/auth/guest", null, {});
  await request(
    "/me",
    token,
    { onboardingComplete: true, consent: { recording: true } },
    "PATCH",
  );
  await request("/daily-workout/enroll", token, {});
  const assignment = await request("/read-aloud/assignment", token);
  const audio = await request("/audio", token, null, "POST", media);
  const attempt = await request(
    `/read-aloud/assignments/${assignment.id}/submit`,
    token,
    {
      idempotencyKey: randomUUID(),
      audioId: audio.id,
      notes: "I practised the final phrase and noticed a comfortable pause.",
      selfReviewConfirmed: true,
    },
  );
  const job = await request(
    `/read-aloud/attempts/${attempt.id}/speech-assessment`,
    token,
    { locale: "en-GB", processingConsent: true },
  );
  await service.runJobs();
  const completed = await request(`/read-aloud/speech-jobs/${job.id}`, token);
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.status, "assessed");
  assert.equal(calls, 1);
  assert.equal((await request("/state", token)).xp, 10);
  const { readdir } = await import("node:fs/promises");
  assert.deepEqual(await readdir(join(directory, "scratch")), []);
});
