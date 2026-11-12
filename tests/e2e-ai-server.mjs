// Test-only full-stack server: real Express/SQLite and a transport that can never
// forward provider requests. This is not a live-provider availability check.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { decodeSpeechAudio } from "../server/speech-audio.mjs";
import {
  normalizeSpeechResult,
  speechCapabilities,
} from "../server/speech-assessment.mjs";
import { bridgeFixture } from "./helpers/bridge-fixture.mjs";
import { serveWeb } from "../server/static.mjs";
import {
  DEFAULT_TEXT_MODEL,
  DEFAULT_TRANSCRIPTION_MODEL,
} from "../server/provider.mjs";

if (process.env.NODE_ENV !== "test")
  throw new Error("Offline AI browser fixture requires NODE_ENV=test.");
if (process.env.PORT && process.env.PORT !== "3003")
  throw new Error("Offline AI browser fixture only listens on port 3003.");

const fakeKey = "e2e-offline-key-not-a-real-credential";
const controlKey = "mindgarden-offline-fixture-only";
const chatUrl = "https://api.openai.com/v1/chat/completions";
const transcriptionUrl = "https://api.openai.com/v1/audio/transcriptions";
const responseModel = `${DEFAULT_TEXT_MODEL}-offline-fixture`;
const transcript =
  "A small trial can help us compare outcomes before a wider change. We should include people affected by the decision and explain the limits of the evidence.";
const debateReply =
  "A small trial may miss people whose circumstances differ from the initial participants. What result would lead you to revise your proposal?";
const interiorEvidence =
  "A small trial may reveal who benefits, but it cannot represent every community.";
const guidingQuestions = [
  {
    question: "What observation could support your main point?",
    placeholder: "A relevant observation",
  },
  {
    question: "How does that observation connect to your conclusion?",
    placeholder: "Your reasoning",
  },
  {
    question: "What could make you reconsider your view?",
    placeholder: "A reason to reconsider",
  },
];
const directory = mkdtempSync(join(tmpdir(), "mindgarden-e2e-ai-"));
const calls = [];
const unexpected = [];
let failEvaluations = 0;
let failTranscriptions = 0;
let failGuidedResponses = 0;
let nextEvaluationShape = null;

// Never capture a real credential or inherit a client-side key into this fixture.
process.env.OPENAI_API_KEY = fakeKey;
process.env.EXPO_PUBLIC_OPENAI_API_KEY = "";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const chat = (content) =>
  Response.json({
    model: responseModel,
    choices: [{ finish_reason: "stop", message: { content } }],
  });

function assessment(text, shape = "array") {
  // Short actual excerpts exercise quote extraction, rather than returning the
  // entire answer with trivially correct zero-based offsets.
  const sentences = (text.match(/[^.!?\n]+[.!?]/gu) || [])
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence.length <= 300 &&
        text.indexOf(sentence) === text.lastIndexOf(sentence),
    );
  let quote = text.includes(interiorEvidence)
    ? interiorEvidence
    : sentences[1] || sentences[0];
  assert.ok(quote, "Fixture answer needs a short unique evidence excerpt");
  if (shape === "missing_quote")
    quote = "This sentence was never part of the answer.";
  if (shape === "ambiguous_quote") quote = "I need more evidence.";
  let span = { quote };
  if (shape === "legacy_offsets") {
    // Realistic old-model mistake: count Unicode code points, not JS UTF-16.
    // The regression answer has a newline and an emoji before this excerpt.
    const start = Array.from(text.slice(0, text.indexOf(quote))).length;
    span = { start, end: start + Array.from(quote).length, quote };
  }
  const result = {
    dimensions: ["grounded", "reasoned", "organised", "well_rounded"].map(
      (key) => ({
        key,
        level: 2,
        confidence: "low",
        evidence_spans: [{ ...span }],
        strength: "Your saved response supplies a concrete point to revisit.",
        improvement:
          "Explain one observation that could change your conclusion.",
      }),
    ),
    key_takeaway: "Explain what could change your conclusion.",
    retry_prompt:
      "Add one observation that would make you reconsider your claim.",
    guiding_questions: guidingQuestions,
    verification_flags: [
      "Offline synthetic transport; no model accuracy or source verification is established.",
    ],
    needs_review: false,
  };
  if (["keyed_map", "malformed_dimensions"].includes(shape)) {
    // Deliberately reverse map insertion order and omit redundant inner keys.
    // The real validator must preserve each value and restore canonical order.
    result.dimensions = Object.fromEntries(
      [...result.dimensions].reverse().map(({ key, ...value }) => [key, value]),
    );
    if (shape === "malformed_dimensions")
      result.dimensions.grounded = "This is not a criterion object.";
  }
  return result;
}

function guidedResponse(guidance) {
  // Deliberately derive the synthetic draft from the submitted notes so a
  // stale payload/cache cannot pass simply by rendering a fixed mock answer.
  const answers = guidance.map(({ answer }) =>
    answer.replace(/^PRIVATE_GUIDE_NOTE_ONLY_MARKER:\s*/, "").trim(),
  );
  assert.ok(answers.every(Boolean), "This fixture uses three explicit notes");
  return {
    text: `I would ${answers[0]}.\n\nThis matters because ${answers[1]}. However, ${answers[2]}.`,
    annotations: [
      {
        quote: answers[0],
        label: "A clear proposal",
        explanation:
          "This opening turns your first note into a specific proposal.",
      },
      {
        quote: answers[1],
        label: "Connected reasoning",
        explanation: "This sentence connects your observation to the proposal.",
      },
      {
        quote: answers[2],
        label: "A meaningful limit",
        explanation:
          "This qualification preserves the condition from your final note.",
      },
    ],
  };
}

// No original fetch is saved or reachable. News is also replaced below, so every
// outbound server fetch is either one of these exact stubs or a test failure.
globalThis.fetch = async (url, options = {}) => {
  try {
    assert.ok(
      [chatUrl, transcriptionUrl].includes(String(url)),
      "Unexpected outbound URL",
    );
    assert.equal(options.method, "POST");
    assert.equal(
      new Headers(options.headers).get("Authorization"),
      `Bearer ${fakeKey}`,
    );
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.signal.aborted, false);
    assert.ok(calls.length < 1000, "Fixture call limit exceeded");
    if (String(url) === transcriptionUrl) {
      assert.ok(options.body instanceof FormData);
      assert.equal(options.body.get("model"), DEFAULT_TRANSCRIPTION_MODEL);
      const recording = options.body.get("file");
      assert.ok(recording instanceof Blob && recording.size > 0);
      const shouldFail = failTranscriptions > 0;
      if (shouldFail) failTranscriptions--;
      calls.push({
        kind: "transcription",
        model: DEFAULT_TRANSCRIPTION_MODEL,
        bytes: recording.size,
        mime: recording.type,
        outcome: shouldFail ? "503" : "ok",
      });
      if (shouldFail)
        return Response.json(
          { error: { message: "PRIVATE-TRANSCRIPTION-UPSTREAM-DETAIL" } },
          { status: 503 },
        );
      return Response.json({ text: transcript });
    }
    assert.equal(
      new Headers(options.headers).get("Content-Type"),
      "application/json",
    );
    const body = JSON.parse(options.body);
    assert.equal(body.model, DEFAULT_TEXT_MODEL);
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.max_tokens, undefined);
    assert.equal(body.messages[0].role, "system");
    assert.match(body.messages[0].content, /untrusted/);
    // A unique test-only private note must never enter any provider prompt,
    // including outside ANSWER. This is transport evidence, not a model claim.
    assert.equal(
      JSON.stringify(body.messages).includes(
        "PRIVATE_SELF_REFLECTION_ONLY_MARKER",
      ),
      false,
      "Self-reflection leaked into provider messages",
    );
    const supplied = JSON.parse(body.messages[1].content);
    if (
      body.response_format?.json_schema?.name === "mindgarden_guided_response"
    ) {
      assert.equal(body.response_format.type, "json_schema");
      const format = body.response_format.json_schema;
      assert.equal(format.strict, true);
      assert.equal(format.schema.type, "object");
      assert.equal(format.schema.additionalProperties, false);
      assert.deepEqual([...format.schema.required].sort(), [
        "annotations",
        "text",
      ]);
      assert.equal(format.schema.properties.text.type, "string");
      const annotations = format.schema.properties.annotations;
      assert.equal(annotations.type, "array");
      assert.equal(annotations.minItems, 2);
      assert.equal(annotations.maxItems, 5);
      assert.equal(annotations.items.type, "object");
      assert.equal(annotations.items.additionalProperties, false);
      assert.deepEqual([...annotations.items.required].sort(), [
        "explanation",
        "label",
        "quote",
      ]);
      assert.deepEqual(Object.keys(annotations.items.properties).sort(), [
        "explanation",
        "label",
        "quote",
      ]);
      assert.equal(body.temperature, 0.3);
      assert.equal(body.max_completion_tokens, 2000);
      assert.equal(typeof supplied.original_response, "string");
      assert.ok(supplied.original_response.length >= 20);
      assert.equal(supplied.selfReflection, undefined);
      assert.equal(supplied.evaluation, undefined);
      assert.equal(supplied.audio, undefined);
      assert.equal(supplied.guidance.length, 3);
      for (const item of supplied.guidance) {
        assert.deepEqual(Object.keys(item).sort(), ["answer", "question"]);
        assert.equal(typeof item.question, "string");
        assert.equal(typeof item.answer, "string");
      }
      // This is the only endpoint allowed to receive private guide notes, and
      // only after the browser's explicit draft-generation action.
      const shouldFail = failGuidedResponses > 0;
      if (shouldFail) failGuidedResponses--;
      calls.push({
        kind: "guided_response",
        mode: supplied.mode,
        model: body.model,
        originalHash: digest(supplied.original_response),
        guidanceHash: digest(JSON.stringify(supplied.guidance)),
        receivedGuideMarker: JSON.stringify(supplied.guidance).includes(
          "PRIVATE_GUIDE_NOTE_ONLY_MARKER",
        ),
        outcome: shouldFail ? "503" : "ok",
      });
      if (shouldFail)
        return Response.json(
          { error: { message: "PRIVATE-GUIDED-RESPONSE-UPSTREAM-DETAIL" } },
          { status: 503 },
        );
      return chat(JSON.stringify(guidedResponse(supplied.guidance)));
    }
    assert.equal(
      JSON.stringify(body.messages).includes("PRIVATE_GUIDE_NOTE_ONLY_MARKER"),
      false,
      "Guidance notes leaked into assessment or debate provider messages",
    );
    if (body.response_format?.json_schema?.name === "bridgingminds_bridge_v2") {
      const format = body.response_format.json_schema;
      assert.equal(format.strict, true);
      assert.equal(format.schema.properties.dimensions.minItems, 6);
      assert.equal(body.max_completion_tokens, 6000);
      const shouldFail = failEvaluations > 0;
      if (shouldFail) failEvaluations--;
      const reply = bridgeFixture(
        supplied.ANSWER,
        supplied.applicable_dimensions,
      );
      if (
        supplied.wordbloom?.enabled &&
        /work together/.test(supplied.ANSWER) &&
        !supplied.wordbloom.knownWordIds.includes("collaborate")
      ) {
        const quote = supplied.ANSWER.match(
          /[^.!?]*work together[^.!?]*[.!?]/u,
        )?.[0]?.trim();
        if (quote)
          reply.vocabulary_candidates = [
            {
              word_id: "collaborate",
              source_quote: quote,
              reason:
                "A contextual optional word in the synthetic provider fixture.",
              improvement_type: "optional_enrichment",
              confidence: "high",
            },
          ];
      }
      if (
        supplied.wordbloom?.reviewWords?.some(
          (word) => word.wordId === "collaborate",
        ) &&
        /collaborate/.test(supplied.ANSWER)
      ) {
        const quote = supplied.ANSWER.match(
          /[^.!?]*collaborate[^.!?]*[.!?]/u,
        )?.[0]?.trim();
        if (quote)
          reply.productive_uses = [
            { word_id: "collaborate", source_quote: quote, confidence: "high" },
          ];
      }
      const shape = nextEvaluationShape;
      nextEvaluationShape = null;
      if (shape === "learner_gap")
        for (const dimension of reply.dimensions) {
          if (dimension.status === "assessed") {
            dimension.confidence = "high";
            dimension.level = dimension.key === "R" ? 2 : 3;
          }
        }
      if (shape === "missing_quote")
        reply.argument_graph.nodes[0].source_quote =
          reply.argument_graph.nodes[0].text =
            "A sentence not present in the answer.";
      if (shape === "malformed_dimensions")
        reply.argument_graph.edges[0].target = "ghost";
      calls.push({
        kind: "bridge",
        model: body.model,
        answerHash: digest(supplied.ANSWER),
        outcome: shouldFail ? "503" : "ok",
      });
      if (shouldFail)
        return Response.json(
          { error: { message: "Offline fixture provider failure" } },
          { status: 503 },
        );
      return chat(JSON.stringify(reply));
    }
    if (body.response_format) {
      assert.equal(body.response_format.type, "json_schema");
      const format = body.response_format.json_schema;
      assert.equal(format.name, "mindgarden_assessment");
      assert.equal(format.strict, true);
      assert.equal(format.schema.type, "object");
      assert.equal(format.schema.additionalProperties, false);
      assert.deepEqual([...format.schema.required].sort(), [
        "dimensions",
        "guiding_questions",
        "key_takeaway",
        "needs_review",
        "retry_prompt",
        "verification_flags",
      ]);
      const dimensions = format.schema.properties.dimensions;
      assert.equal(dimensions.type, "array");
      assert.equal(dimensions.minItems, 4);
      assert.equal(dimensions.maxItems, 4);
      assert.equal(dimensions.items.type, "object");
      assert.equal(dimensions.items.additionalProperties, false);
      assert.deepEqual([...dimensions.items.required].sort(), [
        "confidence",
        "evidence_spans",
        "improvement",
        "key",
        "level",
        "strength",
      ]);
      assert.deepEqual(dimensions.items.properties.key.enum, [
        "grounded",
        "reasoned",
        "organised",
        "well_rounded",
      ]);
      assert.equal(dimensions.items.properties.evidence_spans.type, "array");
      const evidence = dimensions.items.properties.evidence_spans.items;
      assert.equal(evidence.type, "object");
      assert.equal(evidence.additionalProperties, false);
      assert.deepEqual(evidence.required, ["quote"]);
      assert.deepEqual(Object.keys(evidence.properties), ["quote"]);
      assert.equal(evidence.properties.quote.type, "string");
      assert.equal(evidence.properties.quote.minLength, 1);
      assert.equal(evidence.properties.quote.maxLength, 400);
      const guide = format.schema.properties.guiding_questions;
      assert.equal(guide.type, "array");
      assert.equal(guide.minItems, 3);
      assert.equal(guide.maxItems, 3);
      assert.equal(guide.items.type, "object");
      assert.equal(guide.items.additionalProperties, false);
      assert.deepEqual([...guide.items.required].sort(), [
        "placeholder",
        "question",
      ]);
      assert.deepEqual(Object.keys(guide.items.properties).sort(), [
        "placeholder",
        "question",
      ]);
      assert.equal(guide.items.properties.question.type, "string");
      assert.equal(guide.items.properties.placeholder.type, "string");
      assert.equal(body.temperature, 0);
      assert.equal(body.max_completion_tokens, 3200);
      assert.equal(typeof supplied.ANSWER, "string");
      assert.equal(supplied.selfReflection, undefined);
      assert.ok(supplied.ANSWER.length >= 20);
      const shouldFail = failEvaluations > 0;
      if (shouldFail) failEvaluations--;
      const replyShape = nextEvaluationShape || "array";
      nextEvaluationShape = null;
      const reply = assessment(supplied.ANSWER, replyShape);
      calls.push({
        kind: "evaluation",
        mode: supplied.mode,
        model: body.model,
        answerHash: digest(supplied.ANSWER),
        sourceScope: supplied.source?.scope ?? "none",
        hasSourceSummary: Boolean(supplied.source?.summary),
        conversationTurns: supplied.conversation?.turns?.length ?? 0,
        replyShape,
        wireEvidence: Array.isArray(reply.dimensions)
          ? reply.dimensions[0].evidence_spans
          : reply.dimensions.grounded?.evidence_spans,
        outcome: shouldFail ? "503" : "ok",
      });
      if (shouldFail)
        return Response.json(
          {
            error: {
              code: "temporary_failure",
              message: "PRIVATE-UPSTREAM-FIXTURE-DETAIL-MUST-NOT-REACH-UI",
            },
          },
          { status: 503 },
        );
      return chat(JSON.stringify(reply));
    }
    assert.equal(body.temperature, 0.5);
    assert.equal(body.max_completion_tokens, 450);
    assert.equal(typeof supplied.argument, "string");
    assert.ok(supplied.argument.length >= 20);
    assert.equal(typeof supplied.proposition, "string");
    calls.push({
      kind: "debate",
      model: body.model,
      argumentHash: digest(supplied.argument),
      turns: supplied.turns.length,
      outcome: "ok",
    });
    return chat(debateReply);
  } catch (error) {
    // Preserve an audit of blocked requests, without logging request bodies/keys.
    unexpected.push({
      endpoint: String(url).split("?")[0],
      error: error.code || error.name || "Error",
    });
    throw new Error("Offline fixture rejected an unexpected provider request.");
  }
};

let speechCalls = 0;
const service = createApp({
  enforceUsageLimits:
    process.env.E2E_ENFORCE_USAGE_LIMITS === "1" ? true : undefined,
  decodeSpeechAudio:
    process.env.E2E_REAL_SPEECH_MEDIA === "1"
      ? decodeSpeechAudio
      : async () => ({
          pcm: Buffer.alloc(96000),
          durationMs: 3000,
        }),
  speechProvider: {
    capabilities: (locale) => speechCapabilities({ configured: true, locale }),
    assess: async ({ pcm, referenceText, locale, prosody }) => {
      speechCalls++;
      if (speechCalls === 1)
        throw Object.assign(new Error("Offline speech failure fixture"), {
          code: "speech_provider",
        });
      const words = referenceText.match(/[\p{L}\p{N}]+/gu).slice(0, 3);
      if (
        referenceText.includes("collaborate") &&
        !words.includes("collaborate")
      )
        words.push("collaborate");
      return normalizeSpeechResult({
        referenceText,
        locale,
        prosodyRequested: prosody,
        sdkVersion: "offline-speech-fixture",
        audioDurationMs: pcm.length / 32,
        segments: [
          {
            RecognitionStatus: "Success",
            Offset: 0,
            Duration: 30000000,
            NBest: [
              {
                Confidence: 0.9,
                Display: words.join(" "),
                PronunciationAssessment: {
                  AccuracyScore: 82,
                  FluencyScore: 76,
                },
                Words: words.map((Word, index) => ({
                  Word,
                  Offset: index * 5000000,
                  Duration: 3000000,
                  PronunciationAssessment: {
                    AccuracyScore: index === 1 ? 63 : 90,
                    ErrorType: index === 1 ? "Mispronunciation" : "None",
                  },
                })),
              },
            ],
          },
        ],
      });
    },
  },
  apiKey: fakeKey,
  model: DEFAULT_TEXT_MODEL,
  transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL,
  dbPath: join(directory, "e2e-ai.sqlite"),
  storageDir: join(directory, "audio"),
  requestLimitPerMinute: 3000,
  newsService: {
    getFeed: async ({ timezone }) => ({
      articles: [],
      fetchedAt: null,
      day: new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
        new Date(),
      ),
      timezone,
      status: "unavailable",
      message: "News disabled in offline provider fixture.",
    }),
  },
});

// These diagnostic routes exist only in this temporary loopback test server.
service.app.use("/__offline_ai", (req, res, next) => {
  if (req.get("X-Offline-Fixture") !== controlKey) return res.sendStatus(403);
  res.setHeader("Cache-Control", "no-store");
  next();
});
service.app.get("/__offline_ai/status", (_req, res) =>
  res.json({
    fixture: "mindgarden-offline-provider",
    network: "blocked",
    calls,
    unexpected,
    pendingFailures: failEvaluations,
    pendingTranscriptionFailures: failTranscriptions,
    pendingGuidedResponseFailures: failGuidedResponses,
    pendingEvaluationShape: nextEvaluationShape,
    responseModel,
  }),
);
service.app.post("/__offline_ai/control", (req, res) => {
  if (
    Object.keys(req.body || {}).length !== 1 ||
    !(
      req.body?.failEvaluationOnce === true ||
      req.body?.failTranscriptionOnce === true ||
      req.body?.failGuidedResponseOnce === true ||
      [
        "keyed_map",
        "malformed_dimensions",
        "missing_quote",
        "ambiguous_quote",
        "legacy_offsets",
        "learner_gap",
      ].includes(req.body?.evaluationShapeOnce)
    )
  )
    return res.status(400).json({
      error: "Choose one supported provider failure or evaluation shape.",
    });
  if (req.body.failEvaluationOnce) failEvaluations = 1;
  else if (req.body.failTranscriptionOnce) failTranscriptions = 1;
  else if (req.body.failGuidedResponseOnce) failGuidedResponses = 1;
  else nextEvaluationShape = req.body.evaluationShapeOnce;
  res.json({ ok: true });
});
service.app.get("/__offline_ai/persisted/:id", (req, res) => {
  const row = service.db
    .prepare("SELECT data FROM attempts WHERE id=?")
    .get(req.params.id);
  if (!row) return res.sendStatus(404);
  const job = service.db
    .prepare("SELECT id,status,retry_count,error FROM jobs WHERE attempt_id=?")
    .get(req.params.id);
  res.json({ attempt: JSON.parse(row.data), job });
});

if (!serveWeb(service.app)) {
  service.close();
  rmSync(directory, { recursive: true, force: true });
  throw new Error(
    "Exported web bundle missing. Build it before starting this fixture.",
  );
}
const server = service.app.listen(3003, "127.0.0.1", () =>
  console.log(
    "MindGarden offline provider fixture ready at http://localhost:3003; every provider call is stubbed.",
  ),
);
let closing = false;
function cleanup() {
  if (closing) return;
  closing = true;
  service.close();
  rmSync(directory, { recursive: true, force: true });
}
server.on("error", (error) => {
  cleanup();
  throw error;
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      cleanup();
      process.exit(unexpected.length ? 1 : 0);
    }),
  );
process.on("exit", cleanup);
