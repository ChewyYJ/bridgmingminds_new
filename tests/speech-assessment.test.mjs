import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSpeechResult,
  speechCapabilities,
} from "../server/speech-assessment.mjs";
const segment = (word = "Hello", offset = 0) => ({
  RecognitionStatus: "Success",
  Offset: offset,
  Duration: 10000000,
  NBest: [
    {
      Confidence: 0.92,
      Display: `${word}.`,
      PronunciationAssessment: {
        AccuracyScore: 81,
        FluencyScore: 74,
        CompletenessScore: 99,
        PronScore: 78,
        ProsodyScore: 70,
      },
      Words: [
        {
          Word: word,
          Offset: offset,
          Duration: 5000000,
          PronunciationAssessment: { AccuracyScore: 80, ErrorType: "None" },
        },
      ],
    },
  ],
});
const input = (overrides = {}) => ({
  segments: [segment()],
  referenceText: "Hello world.",
  locale: "en-US",
  sdkVersion: "test-fixture",
  audioDurationMs: 5000,
  ...overrides,
});
test("speech capabilities require configuration, a supported assessment locale and explicit duration mode", () => {
  assert.equal(speechCapabilities().status, "unavailable");
  assert.equal(
    speechCapabilities({ configured: true, locale: "en-SG" }).reason,
    "unsupported_locale",
  );
  assert.equal(
    speechCapabilities({ configured: true, locale: "en-GB" }).prosody,
    false,
  );
  assert.equal(speechCapabilities({ configured: true }).maximumSeconds, 180);
  assert.equal(
    speechCapabilities({ configured: true, continuous: false }).maximumSeconds,
    30,
  );
});
test("continuous results retain provider utterance metrics without fabricated totals, completeness or intelligibility", () => {
  const result = normalizeSpeechResult(
    input({ segments: [segment(), segment("world", 20000000)] }),
  );
  assert.equal(result.status, "assessed");
  assert.equal(result.metrics, null);
  assert.equal(result.utterances[0].metrics.accuracy, 81);
  assert.equal(result.utterances[0].metrics.completeness, null);
  assert.equal(result.utterances[0].metrics.intelligibility, null);
  assert.equal(result.utterances[0].metrics.prosody, null);
  assert.deepEqual(result.words[1].sourceSpan, {
    text: "world",
    start: 6,
    end: 11,
  });
  assert.equal(result.words[1].startMs, 2000);
  assert.equal(result.validationStatus, "unvalidated");
});
test("prosody is only exposed when requested for the supported locale", () => {
  assert.equal(
    normalizeSpeechResult(input({ prosodyRequested: true })).utterances[0]
      .metrics.prosody,
    70,
  );
  assert.throws(
    () =>
      normalizeSpeechResult(input({ locale: "en-GB", prosodyRequested: true })),
    { code: "invalid_speech_result" },
  );
  assert.equal(
    normalizeSpeechResult(input({ locale: "en-GB" })).utterances[0].metrics
      .prosody,
    null,
  );
});
test("reference anchors preserve Unicode offsets, repetition and unmatched observations", () => {
  const result = normalizeSpeechResult(
    input({
      referenceText: "🌱 Hello, hello again.",
      segments: [
        segment(),
        segment("hello", 10000000),
        segment("unknown", 20000000),
      ],
    }),
  );
  assert.deepEqual(
    result.words.map((w) => w.sourceSpan?.start ?? null),
    [3, 10, null],
  );
  assert.equal(result.words[2].word, "unknown");
});
test("invalid scores, timelines, oversized input and unsupported miscues fail closed", () => {
  for (const edit of [
    (r) => (r.NBest[0].PronunciationAssessment.AccuracyScore = 101),
    (r) => (r.NBest[0].Confidence = NaN),
    (r) => (r.Offset = -1),
    (r) => (r.NBest[0].Words[0].Duration = 90000000),
    (r) => (r.NBest[0].Words[0].PronunciationAssessment.ErrorType = "Omission"),
    (r) => (r.RecognitionStatus = "Error"),
  ]) {
    const raw = segment();
    edit(raw);
    assert.throws(() => normalizeSpeechResult(input({ segments: [raw] })), {
      code: "invalid_speech_result",
    });
  }
  assert.throws(
    () =>
      normalizeSpeechResult(
        input({ audioDurationMs: 31000, continuous: false }),
      ),
    { code: "invalid_speech_result" },
  );
  assert.throws(
    () =>
      normalizeSpeechResult(
        input({ segments: [segment("world", 20000000), segment()] }),
      ),
    { code: "invalid_speech_result" },
  );
});
test("no speech and missing metrics are distinct from zero scores", () => {
  const silent = normalizeSpeechResult(
    input({ segments: [{ RecognitionStatus: "NoMatch" }] }),
  );
  assert.equal(silent.status, "no_speech");
  assert.equal(silent.metrics, null);
  assert.deepEqual(silent.words, []);
  const raw = segment();
  delete raw.NBest[0].PronunciationAssessment;
  assert.equal(
    normalizeSpeechResult(input({ segments: [raw] })).status,
    "partial",
  );
  const zero = segment();
  zero.NBest[0].PronunciationAssessment.AccuracyScore = 0;
  assert.equal(
    normalizeSpeechResult(input({ segments: [zero] })).utterances[0].metrics
      .accuracy,
    0,
  );
});
