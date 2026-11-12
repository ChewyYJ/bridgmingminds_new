import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createAzureSpeech } from "../server/azure-speech.mjs";
import {
  decodeSpeechAudio,
  pcmFromWave,
  validatePcm,
} from "../server/speech-audio.mjs";
const require = createRequire(import.meta.url);
function wave(samples = 16000) {
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples * 2, 40);
  return b;
}
const raw = {
  RecognitionStatus: "Success",
  Offset: 0,
  Duration: 10000000,
  NBest: [
    {
      Confidence: 0.9,
      Display: "Hello.",
      PronunciationAssessment: { AccuracyScore: 80 },
      Words: [
        {
          Word: "hello",
          Offset: 0,
          Duration: 5000000,
          PronunciationAssessment: { AccuracyScore: 80, ErrorType: "None" },
        },
      ],
    },
  ],
};
function fakeSdk(behavior = "success") {
  const seen = { closed: 0, writes: [], miscue: null, prosody: 0 };
  let recognizer;
  const resource = () => ({
    close() {
      seen.closed++;
    },
  });
  const sdk = {
    OutputFormat: { Detailed: 1 },
    ResultReason: { RecognizedSpeech: 1, NoMatch: 0 },
    CancellationReason: { EndOfStream: 1 },
    PropertyId: { SpeechServiceResponse_JsonResult: 1 },
    PronunciationAssessmentGradingSystem: { HundredMark: 100 },
    PronunciationAssessmentGranularity: { Word: 1 },
    SpeechConfig: {
      fromSubscription(key, region) {
        seen.credentials = { key, region };
        return resource();
      },
    },
    AudioStreamFormat: {
      getWaveFormatPCM(...args) {
        seen.format = args;
        return args;
      },
    },
    AudioInputStream: {
      createPushStream() {
        return {
          ...resource(),
          write(bytes) {
            seen.writes.push(Buffer.from(bytes));
          },
        };
      },
    },
    AudioConfig: {
      fromStreamInput() {
        return resource();
      },
    },
    PronunciationAssessmentConfig: class {
      constructor(reference, grade, granularity, miscue) {
        seen.reference = reference;
        seen.miscue = miscue;
      }
      set enableProsodyAssessment(value) {
        if (value) seen.prosody++;
      }
      applyTo() {}
    },
    SpeechRecognizer: class {
      constructor() {
        recognizer = this;
      }
      close() {
        seen.closed++;
      }
      startContinuousRecognitionAsync(ok, fail) {
        queueMicrotask(() => {
          if (behavior === "hang") return;
          if (behavior === "start_failure") return fail("SECRET");
          ok();
          if (behavior === "cancel")
            return this.canceled(null, { reason: 0, errorDetails: "SECRET" });
          if (behavior !== "silence")
            this.recognized(null, {
              result: {
                reason: 1,
                properties: {
                  getProperty() {
                    return behavior === "malformed"
                      ? "bad json"
                      : JSON.stringify(raw);
                  },
                },
              },
            });
          this.sessionStopped();
        });
      }
    },
  };
  return {
    sdk,
    seen,
    get recognizer() {
      return recognizer;
    },
  };
}
const assessment = {
  pcm: Buffer.alloc(32000),
  referenceText: "Hello.",
  locale: "en-US",
};
const service = (fixture, options = {}) =>
  createAzureSpeech({
    key: "private-key",
    region: "southeastasia",
    sdkVersion: "offline-fixture",
    loadSdk: async () => fixture.sdk,
    ...options,
  });
test("installed SDK exposes the continuous PCM and pronunciation APIs without opening a connection", () => {
  const sdk = require("microsoft-cognitiveservices-speech-sdk");
  assert.equal(
    typeof sdk.SpeechRecognizer.prototype.startContinuousRecognitionAsync,
    "function",
  );
  const stream = sdk.AudioInputStream.createPushStream(
    sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1),
  );
  stream.close();
  assert.equal(
    typeof Object.getOwnPropertyDescriptor(
      sdk.PronunciationAssessmentConfig.prototype,
      "enableProsodyAssessment",
    ).set,
    "function",
  );
});
test("WAV decoding validates container, sample format and duration without a subprocess", async () => {
  const result = await decodeSpeechAudio(wave(), "audio/wav", {
    executable: "/missing",
  });
  assert.equal(result.durationMs, 1000);
  assert.equal(result.pcm.length, 32000);
  const broken = wave();
  broken.writeUInt32LE(999, 40);
  assert.throws(() => pcmFromWave(broken), { code: "invalid_speech_audio" });
  const incomplete = wave().subarray(0, 100);
  assert.throws(() => pcmFromWave(incomplete), {
    code: "invalid_speech_audio",
  });
  assert.throws(() => validatePcm(Buffer.alloc(32000 * 181)), {
    code: "invalid_speech_audio",
  });
  assert.throws(() => validatePcm(Buffer.alloc(7999)), {
    code: "invalid_speech_audio",
  });
  await assert.rejects(
    decodeSpeechAudio(Buffer.from("bad"), "application/octet-stream"),
    { code: "unsupported_speech_audio" },
  );
});
test("decoder failures, cancellation and timeouts are bounded and never leak process diagnostics", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "speech-decoder-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, "decoder");
  await writeFile(
    executable,
    `#!${process.execPath}\nprocess.stdin.resume();process.stdin.on('end',()=>process.stdout.end(Buffer.alloc(32000)));`,
    { mode: 0o700 },
  );
  assert.equal(
    (
      await decodeSpeechAudio(Buffer.from("compressed-fixture"), "audio/webm", {
        executable,
      })
    ).durationMs,
    1000,
  );
  await assert.rejects(
    decodeSpeechAudio(Buffer.from("x"), "audio/webm", {
      executable: "/missing/ffmpeg",
    }),
    { code: "speech_decoder_unavailable" },
  );
  await writeFile(
    executable,
    `#!${process.execPath}\nsetInterval(()=>{},1000);`,
    { mode: 0o700 },
  );
  await assert.rejects(
    decodeSpeechAudio(Buffer.from("x"), "audio/webm", {
      executable,
      timeoutMs: 20,
    }),
    { code: "speech_decode_timeout" },
  );
  const controller = new AbortController();
  const pending = decodeSpeechAudio(Buffer.from("x"), "audio/mp4", {
    executable,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, { code: "speech_cancelled" });
});
test("continuous transport uses exact PCM buffer bytes, reference, locale and safe cleanup", async () => {
  const fixture = fakeSdk();
  const slab = Buffer.alloc(33000, 7),
    pcm = slab.subarray(100, 32100);
  const result = await service(fixture).assess({
    ...assessment,
    pcm,
    prosody: true,
  });
  assert.equal(result.status, "assessed");
  assert.deepEqual(fixture.seen.format, [16000, 16, 1]);
  assert.equal(fixture.seen.miscue, false);
  assert.equal(fixture.seen.reference, "Hello.");
  assert.equal(fixture.seen.prosody, 1);
  assert.equal(fixture.seen.writes[0].length, 32000);
  assert.equal(fixture.seen.closed, 5);
});
test("silent and failed provider callbacks cannot manufacture successful scores or leak diagnostics", async () => {
  assert.equal(
    (await service(fakeSdk("silence")).assess(assessment)).status,
    "no_speech",
  );
  for (const behavior of ["start_failure", "cancel", "malformed"]) {
    const fixture = fakeSdk(behavior);
    await assert.rejects(
      service(fixture).assess(assessment),
      (e) =>
        !e.message.includes("SECRET") &&
        e.code.startsWith(
          behavior === "malformed" ? "invalid_speech" : "speech_",
        ),
    );
    assert.ok(fixture.seen.closed >= 4);
  }
});
test("timeout, abort, missing configuration and unsupported locale fail before invalid work can persist", async () => {
  const fixture = fakeSdk("hang");
  await assert.rejects(service(fixture, { timeoutMs: 10 }).assess(assessment), {
    code: "speech_timeout",
  });
  assert.ok(fixture.seen.closed >= 4);
  const controller = new AbortController();
  controller.abort();
  let loaded = false;
  await assert.rejects(
    createAzureSpeech({
      key: "x",
      region: "eastus",
      loadSdk: async () => {
        loaded = true;
      },
    }).assess({ ...assessment, signal: controller.signal }),
    { code: "speech_cancelled" },
  );
  assert.equal(loaded, false);
  await assert.rejects(
    createAzureSpeech({ key: "", region: "" }).assess(assessment),
    { code: "speech_configuration" },
  );
  await assert.rejects(
    service(fakeSdk()).assess({
      ...assessment,
      locale: "en-GB",
      prosody: true,
    }),
    { code: "speech_locale" },
  );
});

test("seekable M4A copies are owner-only and removed on success, decoder failure and cancellation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "speech-seekable-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const temporaryRoot = join(directory, "scratch"),
    executable = join(directory, "decoder");
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs=require('node:fs');const path=process.argv[process.argv.indexOf('-i')+1];if((fs.statSync(path).mode&511)!==384||fs.readFileSync(path).toString()!=='compressed-fixture')process.exit(2);process.stdout.end(Buffer.alloc(32000));`,
    { mode: 0o700 },
  );
  await decodeSpeechAudio(Buffer.from("compressed-fixture"), "audio/m4a", {
    executable,
    temporaryRoot,
  });
  const { readdir, stat } = await import("node:fs/promises");
  assert.equal((await stat(temporaryRoot)).mode & 0o777, 0o700);
  assert.deepEqual(await readdir(temporaryRoot), []);
  await assert.rejects(
    decodeSpeechAudio(Buffer.from("compressed-fixture"), "audio/m4a", {
      executable: "/missing/ffmpeg",
      temporaryRoot,
    }),
    { code: "speech_decoder_unavailable" },
  );
  assert.deepEqual(await readdir(temporaryRoot), []);
  await writeFile(
    executable,
    `#!${process.execPath}\nsetInterval(()=>{},1000);`,
    { mode: 0o700 },
  );
  await assert.rejects(
    decodeSpeechAudio(Buffer.from("compressed-fixture"), "audio/m4a", {
      executable,
      temporaryRoot,
      timeoutMs: 30,
    }),
    { code: "speech_decode_timeout" },
  );
  assert.deepEqual(await readdir(temporaryRoot), []);
  const controller = new AbortController();
  const pending = decodeSpeechAudio(
    Buffer.from("compressed-fixture"),
    "audio/m4a",
    { executable, temporaryRoot, signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(pending, { code: "speech_cancelled" });
  assert.deepEqual(await readdir(temporaryRoot), []);
});
test("scratch recovery removes only stale private decode directories and rejects a symlink root", async (t) => {
  const { mkdir, readdir, utimes, symlink } = await import("node:fs/promises");
  const { cleanupSpeechScratch } = await import("../server/speech-audio.mjs");
  const root = await mkdtemp(join(tmpdir(), "speech-cleanup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ["decode-Old123", "decode-New123", "unrelated"])
    await mkdir(join(root, name), { mode: 0o700 });
  await writeFile(join(root, "decode-Old123", "input.m4a"), "private fixture", {
    mode: 0o600,
  });
  const old = new Date(Date.now() - 7200000);
  await utimes(join(root, "decode-Old123"), old, old);
  await utimes(join(root, "unrelated"), old, old);
  assert.equal(await cleanupSpeechScratch({ root }), 1);
  assert.deepEqual((await readdir(root)).sort(), [
    "decode-New123",
    "unrelated",
  ]);
  const link = join(root, "alias");
  await symlink(join(root, "decode-New123"), link);
  await assert.rejects(
    decodeSpeechAudio(Buffer.from("x"), "audio/mp4", { temporaryRoot: link }),
    { code: "speech_scratch_unavailable" },
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    decodeSpeechAudio(wave(), "audio/wav", { signal: abort.signal }),
    { code: "speech_cancelled" },
  );
});
