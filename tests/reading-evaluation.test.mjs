import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createOpenAIReading,
  normalizeReadingFeedback,
  readingMeasurements,
  pcmWave,
} from "../server/openai-reading.mjs";
import { READING_CRITERIA } from "../shared/reading-rubric.mjs";
import { createApp } from "../server/app.mjs";
const pcm = Buffer.alloc(32000 * 4);
for (let i = 0; i < pcm.length; i += 2)
  pcm.writeInt16LE(
    Math.round(Math.sin(((i / 2) * 2 * Math.PI * 220) / 16000) * 8000),
    i,
  );
const reference = "A small garden can help people learn together.";
const answer = (text = reference) => ({
  speechDetected: true,
  transcript: text,
  summary: "Your words are clear.",
  nextStep: "Pause after each sentence.",
  criteria: READING_CRITERIA.map(({ key }) => ({
    key,
    status: "strength",
    observation: "The phrase is clearly audible.",
    nextStep: "Repeat the phrase at a comfortable pace.",
    evidence: { startSeconds: 0, endSeconds: 2, referenceQuote: "" },
  })),
});
const context = {
  pcm,
  referenceText: reference,
  locale: "en-GB",
  model: "fixture",
};

test("reading framework covers all five criteria and measures pace separately from qualitative feedback", () => {
  const r = normalizeReadingFeedback(answer(), context);
  assert.equal(r.provider, "openai");
  assert.equal(r.readingEvaluation.criteria.length, 5);
  assert.equal(r.readingEvaluation.measurements.estimatedWordsPerMinute, 120);
  assert.equal(r.readingEvaluation.measurements.transcriptCoveragePercent, 100);
  assert.equal(r.metrics, null);
  assert.deepEqual(r.words, []);
  const partial = readingMeasurements(pcm, "A small garden", reference);
  assert.equal(partial.matchedWords, 3);
  assert.ok(partial.transcriptCoveragePercent < 100);
});
test("missing, duplicate and score-injected criteria are rejected; unverifiable audio details become unassessed", () => {
  const data = answer();
  data.criteria[1].key = "pronunciation";
  assert.throws(() => normalizeReadingFeedback(data, context));
  assert.throws(() =>
    normalizeReadingFeedback({ ...answer(), score: 99 }, context),
  );
  const bad = answer();
  bad.criteria[0].evidence.endSeconds = 50;
  bad.criteria[1].evidence.referenceQuote = "invented quotation";
  const r = normalizeReadingFeedback(bad, context);
  assert.equal(r.readingEvaluation.criteria[0].status, "not_assessed");
  assert.equal(r.readingEvaluation.criteria[0].evidence, null);
  assert.equal(r.readingEvaluation.criteria[1].evidence.referenceQuote, "");
});
test("silence never triggers provider calls or produces favourable feedback", async () => {
  let calls = 0;
  const provider = createOpenAIReading({
    key: "fixture",
    fetchImpl: async () => {
      calls++;
      throw Error("must not call");
    },
  });
  const r = await provider.assess({ ...context, pcm: Buffer.alloc(32000 * 4) });
  assert.equal(calls, 0);
  assert.equal(r.status, "no_speech");
  assert.equal(r.readingEvaluation.measurements.estimatedWordsPerMinute, null);
  assert.ok(
    r.readingEvaluation.criteria.every((c) => c.status === "not_assessed"),
  );
});
test("provider sends real WAV audio with store false and rejects transport failures", async () => {
  let body;
  const provider = createOpenAIReading({
    key: "fixture",
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(answer()) } }],
        }),
      );
    },
  });
  await provider.assess(context);
  assert.equal(body.store, false);
  assert.equal(body.model, "gpt-audio-1.5");
  assert.equal(body.messages[1].content[1].type, "input_audio");
  const wave = Buffer.from(
    body.messages[1].content[1].input_audio.data,
    "base64",
  );
  assert.equal(wave.subarray(0, 4).toString(), "RIFF");
  assert.deepEqual(wave.subarray(44), pcm);
  await assert.rejects(
    createOpenAIReading({
      key: "fixture",
      fetchImpl: async () => new Response("secret", { status: 500 }),
    }).assess(context),
    /could not be completed/,
  );
});

test("Done atomically saves audio and queues evaluation without self-review; completed audio feedback awards once and restores", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "reading-eval-"));
  let calls = 0,
    noSpeech = false;
  const provider = createOpenAIReading({
    key: "fixture",
    fetchImpl: async (_url, opts) => {
      calls++;
      const req = JSON.parse(opts.body);
      const ref = JSON.parse(req.messages[1].content[0].text).referenceText;
      const value = answer(ref);
      if (noSpeech) {
        value.speechDetected = false;
        value.transcript = "";
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(value) } }],
        }),
      );
    },
  });
  const service = createApp({
    dbPath: join(directory, "db.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: "",
    disableWorker: true,
    speechProvider: provider,
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
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, token, body, method = body ? "POST" : "GET") => {
    const raw = Buffer.isBuffer(body);
    const r = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body
          ? { "Content-Type": raw ? "audio/wav" : "application/json" }
          : {}),
      },
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  };
  const ok = async (...args) => {
    const r = await request(...args);
    assert.ok(r.status < 300, JSON.stringify(r));
    return r.data;
  };
  const guest = async () => {
    const { token } = await ok("/auth/guest", null, {});
    await ok(
      "/me",
      token,
      { onboardingComplete: true, consent: { recording: true } },
      "PATCH",
    );
    await ok("/daily-workout/enroll", token, {});
    return token;
  };
  const token = await guest();
  const assignment = await ok("/read-aloud/assignment", token);
  const uploaded = await ok("/audio", token, pcmWave(pcm));
  const body = {
    idempotencyKey: randomUUID(),
    audioId: uploaded.id,
    evaluateRecording: true,
    processingConsent: true,
  };
  assert.equal(
    (
      await request(`/read-aloud/assignments/${assignment.id}/submit`, token, {
        ...body,
        processingConsent: false,
      })
    ).status,
    400,
  );
  const saved = await ok(
    `/read-aloud/assignments/${assignment.id}/submit`,
    token,
    body,
  );
  assert.ok(saved.speechJobId);
  assert.equal(saved.text, "");
  assert.equal(saved.selfReviewConfirmed, false);
  assert.equal(saved.rewards.xp, 0);
  const duplicate = await ok(
    `/read-aloud/assignments/${assignment.id}/submit`,
    token,
    body,
  );
  assert.equal(saved.id, duplicate.id);
  await service.runJobs();
  const job = await ok(`/read-aloud/speech-jobs/${saved.speechJobId}`, token);
  assert.equal(job.status, "completed", JSON.stringify(job));
  assert.equal(job.result.readingEvaluation.criteria.length, 5);
  assert.equal(calls, 1);
  const restored = await ok("/read-aloud/assignment", token);
  assert.equal(restored.latestAttempt.rewards.xp, 0);
  assert.equal(restored.latestAttempt.rewards.coins, 3);
  assert.equal(restored.latestAttempt.evaluation.speech.status, "assessed");
  assert.equal(restored.latestAttempt.speechAssessment.provider, "openai");
  await service.runJobs();
  assert.equal((await ok("/state", token)).xp, 0);
  const readingLedger = (await ok("/export", token)).gamificationData.ledger
    .filter(item => item.activity_type === "read_aloud");
  assert.equal(readingLedger.length, 1);
  assert.equal(readingLedger[0].coins_delta, 3);
  assert.equal(readingLedger[0].xp_delta, 0);
  const other = await guest();
  assert.equal(
    (await request(`/read-aloud/speech-jobs/${saved.speechJobId}`, other))
      .status,
    404,
  );
  noSpeech = true;
  const secondAssignment = await ok("/read-aloud/assignment", other);
  const secondAudio = await ok("/audio", other, pcmWave(pcm));
  const second = await ok(
    `/read-aloud/assignments/${secondAssignment.id}/submit`,
    other,
    { ...body, idempotencyKey: randomUUID(), audioId: secondAudio.id },
  );
  await service.runJobs();
  assert.equal(
    (await ok(`/read-aloud/speech-jobs/${second.speechJobId}`, other)).result
      .status,
    "no_speech",
  );
  assert.equal((await ok("/state", other)).xp, 0);
  const silentLedger = (await ok("/export", other)).gamificationData.ledger
    .filter(item => item.activity_type === "read_aloud");
  assert.equal(silentLedger.length, 0);
});
