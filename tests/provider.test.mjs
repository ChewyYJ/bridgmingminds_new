import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import {
  ASSESSMENT_RESPONSE_FORMAT,
  ASSESSMENT_FAILURE_CODE,
  ASSESSMENT_FAILURE_MESSAGE,
} from "../server/evaluator.mjs";

// The application transport is completely replaced. Only this saved reference
// reaches a socket, and the fixture always calls its own loopback HTTP server.
// These contract tests do not establish live provider/model availability.
const loopbackFetch = globalThis.fetch;
const fakeKey = "test-only-not-a-real-provider-key";
const chatUrl = "https://api.openai.com/v1/chat/completions";
const transcriptionUrl = "https://api.openai.com/v1/audio/transcriptions";
const answer =
  "A small trial can test the claim because we can compare outcomes before a wider change. However, a limited sample may not represent everyone.";

function assessment(text) {
  return {
    dimensions: ["grounded", "reasoned", "organised", "well_rounded"].map(
      (key) => ({
        key,
        level: 2,
        confidence: "low",
        evidence_spans: [{ start: 0, end: text.length, quote: text }],
        strength: "You offer a reason and acknowledge a limitation.",
        improvement: "Name the outcome you would measure in the trial.",
      }),
    ),
    key_takeaway: "Connect your example to a measurable observation.",
    retry_prompt: "Explain one result that would change your view.",
    verification_flags: [
      "The proposed trial has not been independently verified.",
    ],
    needs_review: false,
  };
}

const chatResponse = (content) =>
  Response.json({ choices: [{ message: { content } }] });
const assessmentResponse = (text) =>
  chatResponse(JSON.stringify(assessment(text)));

async function fixture(t, config = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mind-garden-provider-"));
  const requests = [];
  const unexpected = [];
  let respond;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    // Do not fall through to the original transport, even on test failure.
    if (![chatUrl, transcriptionUrl].includes(String(url)) || !respond) {
      unexpected.push(String(url));
      throw new Error("An unmocked outbound request was blocked.");
    }
    const request = { url: String(url), ...options };
    requests.push(request);
    assert.equal(request.method, "POST");
    assert.equal(
      new Headers(request.headers).get("Authorization"),
      `Bearer ${fakeKey}`,
    );
    assert.ok(request.signal instanceof AbortSignal);
    assert.equal(request.signal.aborted, false);
    return respond(request);
  });
  let configuration = {
    dbPath: join(dir, "garden.sqlite"),
    storageDir: join(dir, "audio"),
    apiKey: fakeKey,
    model: "gpt-6-luna",
    transcriptionModel: "gpt-transcribe",
    ...config,
    disableWorker: true,
  };
  let service;
  let server;
  let base;
  async function start() {
    service = createApp(configuration);
    server = await new Promise((resolve) => {
      const listening = service.app.listen(0, "127.0.0.1", () =>
        resolve(listening),
      );
    });
    base = `http://127.0.0.1:${server.address().port}`;
  }
  await start();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(
      unexpected,
      [],
      "All outbound calls must use an explicit offline mock",
    );
  });
  async function request(
    path,
    { token, method = "GET", body, raw, headers } = {},
  ) {
    assert.ok(path.startsWith("/") && !path.startsWith("//"));
    const response = await loopbackFetch(`${base}/api${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    return {
      status: response.status,
      data: response.headers.get("content-type")?.includes("json")
        ? await response.json()
        : Buffer.from(await response.arrayBuffer()),
    };
  }
  async function guest() {
    const result = await request("/auth/guest", { method: "POST" });
    assert.equal(result.status, 200);
    return result.data.token;
  }
  async function session(token, mode = "spin_speak", more = {}) {
    const result = await request("/sessions", {
      token,
      method: "POST",
      body: { mode, ...more },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.provider, "openai");
    return result.data;
  }
  async function attempt(token, session, more = {}) {
    const result = await request("/attempts", {
      token,
      method: "POST",
      body: {
        sessionId: session.id,
        responseType: "text",
        text: answer,
        ...more,
      },
    });
    assert.equal(result.status, 201);
    return result.data;
  }
  async function evaluate(token, attempt) {
    const queued = await request(`/attempts/${attempt.id}/evaluate`, {
      token,
      method: "POST",
      body: {},
    });
    assert.equal(queued.status, 202);
    await service.runJobs();
    return {
      attempt: (await request(`/attempts/${attempt.id}`, { token })).data,
      job: (await request(`/jobs/${queued.data.id}`, { token })).data,
    };
  }
  return {
    request,
    guest,
    session,
    attempt,
    evaluate,
    requests,
    database: () => service.db,
    runJobs: () => service.runJobs(),
    restart: async (overrides = {}) => {
      await new Promise((resolve) => server.close(resolve));
      await service.close();
      configuration = { ...configuration, ...overrides };
      await start();
    },
    respond: (handler) => {
      respond = handler;
    },
  };
}

test("configured evaluation sends saved context, validates evidence, and keeps provider secrets off client data", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const article = (await f.request("/articles", { token })).data[0];
  const session = await f.session(token, "read_reflect", {
    articleId: article.id,
    questionIndex: 1,
  });
  const attempt = await f.attempt(token, session);
  f.respond((request) => {
    assert.equal(request.url, chatUrl);
    assert.equal(
      new Headers(request.headers).get("Content-Type"),
      "application/json",
    );
    const body = JSON.parse(request.body);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.max_completion_tokens, 3200);
    assert.equal(body.temperature, 0);
    assert.equal(body.max_tokens, undefined);
    assert.deepEqual(body.response_format, ASSESSMENT_RESPONSE_FORMAT);
    assert.equal(body.messages[0].role, "system");
    assert.match(body.messages[0].content, /untrusted data/);
    const supplied = JSON.parse(body.messages[1].content);
    assert.equal(supplied.mode, "read_reflect");
    assert.deepEqual(supplied.prompt, session.prompt);
    assert.equal(supplied.ANSWER, answer);
    assert.deepEqual(supplied.source, {
      title: article.title,
      summary: article.summary,
      url: article.sourceUrl,
      questions: article.questions,
      scope: "provided_summary",
      truncated: false,
    });
    return assessmentResponse(supplied.ANSWER);
  });
  const result = await f.evaluate(token, attempt);
  assert.equal(result.job.status, "completed");
  assert.equal(result.attempt.status, "completed");
  assert.equal(result.attempt.text, answer);
  assert.equal(result.attempt.evaluation.provider, "openai");
  assert.equal(result.attempt.evaluation.model_version, "gpt-6-luna");
  assert.equal(result.attempt.evaluation.overall_score, null);
  assert.equal(
    result.attempt.evaluation.assessment.framework_id,
    "grow-read-reflect-v2",
  );
  assert.equal(
    result.attempt.evaluation.assessment.validation_status,
    "unvalidated",
  );
  assert.equal(
    result.attempt.evaluation.assessment.scoring_method,
    "llm_rubric",
  );
  assert.equal(
    result.attempt.evaluation.assessment.source_scope,
    "provided_summary",
  );
  for (const dimension of result.attempt.evaluation.dimensions) {
    if (dimension.key === "delivery") assert.equal(dimension.level, null);
    for (const span of dimension.evidence_spans)
      assert.equal(answer.slice(span.start, span.end), span.quote);
  }
  assert.equal(f.requests.length, 1);
  const state = (await f.request("/state", { token })).data;
  const exported = (await f.request("/export", { token })).data;
  assert.equal(
    JSON.stringify({ state, exported, result }).includes(fakeKey),
    false,
  );
  await f.evaluate(token, attempt);
  assert.equal(
    f.requests.length,
    1,
    "Completed jobs must not call the provider or award twice",
  );
  assert.deepEqual(
    (await f.request("/state", { token })).data.wallet,
    state.wallet,
  );
});

test("health reports configuration separately from live verification without a provider call", async (t) => {
  const f = await fixture(t);
  const health = await f.request("/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.provider, "openai");
  assert.deepEqual(health.data.ai, {
    mode: "openai",
    configured: true,
    configValid: true,
    liveVerified: false,
    models: { text: "gpt-6-luna", transcription: "gpt-transcribe" },
    issues: [],
    warnings: [],
  });
  assert.equal(f.requests.length, 0);
  assert.equal(JSON.stringify(health.data).includes(fakeKey), false);
});

test("whitespace-only key keeps local feedback and configuration errors cannot spend provider requests", async (t) => {
  const f = await fixture(t, { apiKey: "   " });
  const token = await f.guest();
  const health = await f.request("/health");
  assert.equal(health.data.provider, "local");
  assert.equal(health.data.ai.mode, "local");
  const session = await f.request("/sessions", {
    token,
    method: "POST",
    body: { mode: "spin_speak" },
  });
  const attempt = await f.attempt(token, session.data);
  const result = await f.evaluate(token, attempt);
  assert.equal(result.attempt.evaluation.provider, "local");
  assert.equal(
    result.attempt.evaluation.dimensions.every(
      (dimension) => dimension.level === null,
    ),
    true,
  );
  assert.equal(f.requests.length, 0);
});

test("invalid configuration cannot exhaust retries; fixing settings recovers the same saved answer", async (t) => {
  const f = await fixture(t, { model: "not-a-supported-profile" });
  const health = (await f.request("/health")).data;
  assert.equal(health.ai.mode, "configuration_error");
  assert.equal(health.ai.models.text, null);
  assert.equal(
    JSON.stringify(health).includes("not-a-supported-profile"),
    false,
  );
  const token = await f.guest();
  const session = await f.session(token);
  const attempt = await f.attempt(token, session);
  for (let index = 0; index < 6; index++) {
    const rejected = await f.request(`/attempts/${attempt.id}/evaluate`, {
      token,
      method: "POST",
      body: {},
    });
    assert.equal(rejected.status, 503);
    assert.equal(rejected.data.code, "provider_configuration");
    assert.match(rejected.data.error, /OPENAI_MODEL/);
  }
  const saved = (await f.request(`/attempts/${attempt.id}`, { token })).data;
  assert.equal(saved.status, "draft");
  assert.equal(saved.text, answer);
  assert.equal(f.requests.length, 0);
  await f.restart({ model: "gpt-6-luna" });
  f.respond(() => assessmentResponse(answer));
  const recovered = await f.evaluate(token, attempt);
  assert.equal(recovered.attempt.id, attempt.id);
  assert.equal(recovered.attempt.status, "completed");
  assert.equal(recovered.job.retryCount, 0);
  assert.equal(f.requests.length, 1);
});

test("a durable queued job blocked by changed configuration preserves its provider retry budget", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const attempt = await f.attempt(token, await f.session(token));
  const queued = await f.request(`/attempts/${attempt.id}/evaluate`, {
    token,
    method: "POST",
    body: {},
  });
  assert.equal(queued.status, 202);
  await f.restart({ model: "unsupported-profile" });
  await f.runJobs();
  const failed = (await f.request(`/jobs/${queued.data.id}`, { token })).data;
  assert.equal(failed.status, "failed");
  assert.equal(failed.retryCount, 0);
  assert.match(failed.error, /OPENAI_MODEL/);
  assert.equal(f.requests.length, 0);
  await f.restart({ model: "gpt-6-luna" });
  f.respond(() => assessmentResponse(answer));
  const recovered = await f.evaluate(token, attempt);
  assert.equal(recovered.job.id, queued.data.id);
  assert.equal(recovered.job.status, "completed");
  assert.equal(recovered.job.retryCount, 0);
  assert.equal(f.requests.length, 1);
});

test("five actual provider failures still cap paid requests across restarts and model changes", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const attempt = await f.attempt(token, await f.session(token));
  f.respond(() =>
    Response.json({ error: { code: "invalid_api_key" } }, { status: 401 }),
  );
  for (let index = 1; index <= 5; index++) {
    const failed = await f.evaluate(token, attempt);
    assert.equal(failed.job.retryCount, index);
    assert.equal(failed.attempt.status, "failed");
  }
  await f.restart({ model: "gpt-4.1-mini" });
  const capped = await f.request(`/attempts/${attempt.id}/evaluate`, {
    token,
    method: "POST",
    body: {},
  });
  assert.equal(capped.status, 429);
  assert.equal(f.requests.length, 5);
  assert.equal(
    (await f.request(`/attempts/${attempt.id}`, { token })).data.text,
    answer,
  );
  // Deliberately disabling AI is a free, explicit route to local feedback, not
  // a way to reset the paid request budget or to pretend an AI call succeeded.
  await f.restart({ apiKey: "" });
  const local = await f.evaluate(token, attempt);
  assert.equal(local.attempt.status, "completed");
  assert.equal(local.attempt.evaluation.provider, "local");
  assert.equal(local.job.retryCount, 5);
  assert.equal(f.requests.length, 5);
});

test("legacy model override evaluates without unsupported reasoning parameters", async (t) => {
  const f = await fixture(t, {
    model: "gpt-4.1-mini",
    transcriptionModel: "gpt-4o-mini-transcribe",
  });
  const token = await f.guest();
  const session = await f.session(token);
  const attempt = await f.attempt(token, session);
  f.respond((request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.model, "gpt-4.1-mini");
    assert.equal(body.reasoning_effort, undefined);
    assert.equal(body.max_completion_tokens, 3200);
    assert.equal(body.max_tokens, undefined);
    return assessmentResponse(answer);
  });
  const result = await f.evaluate(token, attempt);
  assert.equal(result.attempt.evaluation.model_version, "gpt-4.1-mini");
  assert.equal((await f.request("/health")).data.ai.warnings.length, 2);
});

test("bad provider credentials retain work with actionable errors instead of silently falling back", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const session = await f.session(token);
  const attempt = await f.attempt(token, session);
  f.respond(() =>
    Response.json(
      { error: { code: "invalid_api_key", message: fakeKey } },
      { status: 401 },
    ),
  );
  const failed = await f.evaluate(token, attempt);
  assert.equal(failed.attempt.status, "failed");
  assert.equal(failed.attempt.evaluation, undefined);
  assert.equal(failed.attempt.text, answer);
  assert.match(failed.job.error, /server key.*401/);
  assert.equal(JSON.stringify(failed).includes(fakeKey), false);
  const debate = await f.session(token, "debate");
  const response = await f.request(`/debates/${debate.id}/turn`, {
    token,
    method: "POST",
    body: { text: answer, idempotencyKey: "bad-key-recover" },
  });
  assert.equal(response.status, 502);
  assert.equal(response.data.code, "provider_authentication");
  assert.match(response.data.error, /saved/);
  assert.equal(JSON.stringify(response.data).includes(fakeKey), false);
  assert.equal(
    (await f.request(`/sessions/${debate.id}`, { token })).data.turns.length,
    1,
  );
});

for (const [name, invalidResponse, message] of [
  [
    "invented evidence",
    () => {
      const value = assessment(answer);
      value.dimensions[0].evidence_spans[0].quote =
        "This quote was never written.";
      return chatResponse(JSON.stringify(value));
    },
    /feedback could not be checked/,
  ],
  [
    "missing dimensions",
    () => chatResponse(JSON.stringify({ key_takeaway: "Incomplete output" })),
    /feedback could not be checked/,
  ],
  [
    "malformed JSON",
    () => chatResponse("This is not a JSON assessment"),
    /feedback could not be checked/,
  ],
  [
    "provider HTTP failure",
    () => Response.json({ error: "unavailable" }, { status: 503 }),
    /503/,
  ],
]) {
  test(`configured evaluation rejects ${name}, retains the answer, and recovers without duplicate rewards`, async (t) => {
    const f = await fixture(t);
    const token = await f.guest();
    // Read & Reflect remains reward-eligible. Classic free practice is now
    // deliberately unrewarded, so it cannot exercise this recovery invariant.
    const article = (await f.request('/articles', { token })).data[0];
    const session = await f.session(token, 'read_reflect', { articleId: article.id });
    const attempt = await f.attempt(token, session);
    const before = (await f.request("/state", { token })).data;
    f.respond(invalidResponse);
    const failed = await f.evaluate(token, attempt);
    assert.equal(failed.attempt.status, "failed");
    assert.equal(failed.attempt.text, answer);
    assert.equal(failed.attempt.evaluation, undefined);
    assert.match(failed.attempt.error, message);
    assert.equal(failed.job.status, "failed");
    assert.equal(failed.job.error, failed.attempt.error);
    if (name !== "provider HTTP failure") {
      assert.equal(failed.attempt.error, ASSESSMENT_FAILURE_MESSAGE);
      assert.equal(failed.attempt.errorCode, ASSESSMENT_FAILURE_CODE);
      assert.equal(failed.job.errorCode, ASSESSMENT_FAILURE_CODE);
    }
    assert.equal(failed.job.retryCount, 1);
    const unchanged = (await f.request("/state", { token })).data;
    assert.deepEqual(unchanged.wallet, before.wallet);
    assert.equal(unchanged.xp, before.xp);

    f.respond(() => assessmentResponse(answer));
    const recovered = await f.evaluate(token, attempt);
    assert.equal(recovered.job.id, failed.job.id);
    assert.equal(recovered.attempt.status, "completed");
    assert.equal(recovered.attempt.text, answer);
    assert.equal(recovered.attempt.error, undefined);
    assert.equal(recovered.attempt.evaluation.provider, "openai");
    const after = (await f.request("/state", { token })).data;
    assert.equal(after.wallet.coins, before.wallet.coins + 3);
    assert.equal(after.xp, before.xp + 15);
    assert.equal(after.attempts.length, 1);
    assert.equal(f.requests.length, 2);
    await f.evaluate(token, attempt);
    assert.equal(f.requests.length, 2);
    assert.deepEqual(
      (await f.request("/state", { token })).data.wallet,
      after.wallet,
    );
    assert.equal(f.database().prepare("SELECT COUNT(*) n FROM coin_ledger WHERE activity_type='read_reflect' AND coins_delta>0").get().n, 1);
  });
}

test("configured debate preserves rejected turns, retries once, and sends proposition and conversation context", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const session = await f.session(token, "debate", {
    position: "against",
    rounds: 2,
  });
  const turn = { text: answer, idempotencyKey: "offline-first-round" };
  const reply =
    "A small trial could leave out groups affected by a wider change. Which participants would make its findings more representative?";
  for (const failure of [
    () => Response.json({ error: "rate limited" }, { status: 429 }),
    () => chatResponse(""),
  ]) {
    f.respond(failure);
    const result = await f.request(`/debates/${session.id}/turn`, {
      token,
      method: "POST",
      body: turn,
    });
    assert.ok(result.status >= 400);
    assert.match(result.data.error, /saved|safe|retry/i);
    const saved = (await f.request(`/sessions/${session.id}`, { token })).data;
    assert.equal(saved.turns.length, 1);
    assert.equal(saved.turns[0].text, answer);
    assert.equal(saved.turns[0].speaker, "user");
  }
  f.respond((request) => {
    assert.equal(request.url, chatUrl);
    const body = JSON.parse(request.body);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.max_completion_tokens, 450);
    assert.equal(body.temperature, 0.5);
    assert.equal(body.max_tokens, undefined);
    const supplied = JSON.parse(body.messages[1].content);
    assert.equal(supplied.proposition, session.prompt.question);
    assert.equal(supplied.position, "against");
    assert.equal(supplied.argument, answer);
    assert.deepEqual(supplied.turns, []);
    return chatResponse(reply);
  });
  const accepted = await f.request(`/debates/${session.id}/turn`, {
    token,
    method: "POST",
    body: turn,
  });
  assert.equal(accepted.status, 200);
  assert.deepEqual(
    accepted.data.turns.map(({ speaker, text }) => ({ speaker, text })),
    [
      { speaker: "user", text: answer },
      { speaker: "ai", text: reply },
    ],
  );
  await f.request(`/debates/${session.id}/turn`, {
    token,
    method: "POST",
    body: turn,
  });
  assert.equal(
    f.requests.length,
    3,
    "Resending an accepted turn cannot call the provider twice",
  );

  const second = `${answer} I would ask people affected which outcome matters to them.`;
  f.respond((request) => {
    const body = JSON.parse(request.body);
    const supplied = JSON.parse(body.messages[1].content);
    if (supplied.ANSWER) {
      assert.equal(supplied.position, "against");
      assert.equal(supplied.conversation.has_response_opportunity, true);
      assert.equal(supplied.conversation.truncated, false);
      assert.deepEqual(
        supplied.conversation.turns.map(({ role, text }) => ({ role, text })),
        [
          { role: "learner", text: answer },
          { role: "opponent", text: reply },
          { role: "learner", text: second },
          { role: "opponent", text: reply },
        ],
      );
      return assessmentResponse(supplied.ANSWER);
    }
    assert.equal(supplied.argument, second);
    assert.deepEqual(supplied.turns, accepted.data.turns);
    return chatResponse(reply);
  });
  const finished = await f.request(`/debates/${session.id}/turn`, {
    token,
    method: "POST",
    body: { text: second, idempotencyKey: "offline-second-round" },
  });
  assert.equal(finished.status, 200);
  assert.equal(finished.data.turns.length, 4);
  const evaluated = await f.evaluate(token, { id: finished.data.attemptId });
  assert.equal(evaluated.attempt.status, "completed");
  assert.equal(evaluated.attempt.evaluation.provider, "openai");
  assert.equal(
    evaluated.attempt.text,
    `Round 1: ${answer}\n\nRound 2: ${second}`,
  );
});

test("configured transcription sends only an owned recording and preserves it through failures and correction", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  await f.request("/me", {
    token,
    method: "PATCH",
    body: { consent: { recording: true } },
  });
  const bytes = Buffer.from(
    "offline synthetic audio fixture, not a microphone recording",
  );
  const upload = await f.request("/audio", {
    token,
    method: "POST",
    raw: bytes,
    headers: { "Content-Type": "audio/webm" },
  });
  assert.equal(upload.status, 201);
  const audioId = upload.data.id;
  const session = await f.session(token);
  const attempt = await f.attempt(token, session, {
    responseType: "audio",
    audioId,
    text: "",
  });
  const stranger = await f.guest();
  assert.equal(
    (
      await f.request(`/audio/${audioId}/transcribe`, {
        token: stranger,
        method: "POST",
        body: {},
      })
    ).status,
    404,
  );
  assert.equal(
    f.requests.length,
    0,
    "Ownership must be checked before any provider call",
  );

  for (const response of [
    () => Response.json({ error: "unavailable" }, { status: 503 }),
    () => Response.json({ text: 42 }),
    () => Response.json({ text: "x".repeat(10001) }),
  ]) {
    f.respond(response);
    const result = await f.request(`/audio/${audioId}/transcribe`, {
      token,
      method: "POST",
      body: {},
    });
    assert.equal(result.status, 502);
    assert.match(result.data.error, /saved/);
    assert.deepEqual(
      (await f.request(`/audio/${audioId}`, { token })).data,
      bytes,
    );
    const saved = (await f.request(`/attempts/${attempt.id}`, { token })).data;
    assert.equal(saved.status, "draft");
    assert.equal(saved.text, "");
    assert.equal(saved.audioId, audioId);
  }
  f.respond(async (request) => {
    assert.equal(request.url, transcriptionUrl);
    assert.ok(request.body instanceof FormData);
    assert.equal(request.body.get("model"), "gpt-transcribe");
    assert.deepEqual([...request.body.keys()].sort(), ["file", "model"]);
    const file = request.body.get("file");
    assert.equal(file.name, "recording.webm");
    assert.equal(file.type, "audio/webm");
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
    return Response.json({ text: answer });
  });
  const transcribed = await f.request(`/audio/${audioId}/transcribe`, {
    token,
    method: "POST",
    body: {},
  });
  assert.equal(transcribed.status, 200);
  assert.deepEqual(transcribed.data, {
    text: answer,
    requiresManualTranscription: false,
  });
  assert.equal(
    (await f.request(`/attempts/${attempt.id}`, { token })).data.text,
    "",
    "Provider text remains reviewable, never silently submitted",
  );
  const correctedText = `${answer} I would also record the trial's limitations.`;
  const corrected = await f.request(`/attempts/${attempt.id}/transcript`, {
    token,
    method: "PATCH",
    body: { text: correctedText },
  });
  assert.equal(corrected.status, 200);
  assert.equal(corrected.data.transcriptEdited, true);
  f.respond((request) => {
    assert.equal(request.url, chatUrl);
    const supplied = JSON.parse(JSON.parse(request.body).messages[1].content);
    assert.equal(supplied.ANSWER, correctedText);
    return assessmentResponse(correctedText);
  });
  const evaluated = await f.evaluate(token, attempt);
  assert.equal(evaluated.attempt.status, "completed");
  assert.equal(evaluated.attempt.text, correctedText);
  assert.equal(evaluated.attempt.responseType, "audio");
  assert.equal(evaluated.attempt.audioId, audioId);
  assert.equal(
    evaluated.attempt.evaluation.dimensions.find((d) => d.key === "delivery")
      .level,
    null,
  );
});

for (const concurrentAction of [
  "corrected transcript",
  "completed evaluation",
]) {
  test(`late transcription cannot overwrite a ${concurrentAction} saved by another request`, async (t) => {
    const f = await fixture(t);
    const token = await f.guest();
    await f.request("/me", {
      token,
      method: "PATCH",
      body: { consent: { recording: true } },
    });
    const upload = await f.request("/audio", {
      token,
      method: "POST",
      raw: Buffer.from("offline synthetic recorded speech"),
      headers: { "Content-Type": "audio/webm" },
    });
    assert.equal(upload.status, 201);
    const attempt = await f.attempt(token, await f.session(token), {
      responseType: "audio",
      audioId: upload.data.id,
    });
    let release;
    let entered;
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    const response = new Promise((resolve) => {
      release = resolve;
    });
    f.respond((request) => {
      if (request.url === transcriptionUrl) {
        entered();
        return response;
      }
      assert.equal(request.url, chatUrl);
      return assessmentResponse(answer);
    });
    const pending = f.request(`/attempts/${attempt.id}/transcribe`, {
      token,
      method: "POST",
      body: {},
    });
    await waiting;
    let expected;
    let wallet;
    try {
      if (concurrentAction === "corrected transcript") {
        const corrected = await f.request(
          `/attempts/${attempt.id}/transcript`,
          {
            token,
            method: "PATCH",
            body: {
              text: "My corrected response should survive a slow transcription from another device.",
            },
          },
        );
        assert.equal(corrected.status, 200);
        expected = corrected.data;
      } else {
        const evaluated = await f.evaluate(token, attempt);
        assert.equal(evaluated.attempt.status, "completed");
        assert.equal(evaluated.job.status, "completed");
        expected = evaluated.attempt;
      }
      wallet = (await f.request("/state", { token })).data.wallet;
    } finally {
      release(
        Response.json({
          text: "An older provider transcript that must never replace the newer saved work.",
        }),
      );
    }
    const late = await pending;
    assert.equal(late.status, 409);
    assert.match(late.data.error, /latest saved version was kept/);
    const current = (await f.request(`/attempts/${attempt.id}`, { token }))
      .data;
    assert.deepEqual(current, expected);
    assert.deepEqual(
      (await f.request("/state", { token })).data.wallet,
      wallet,
    );
    assert.equal(current.audioId, upload.data.id);
  });
}

test("historical raw schema failures are safely projected without rewriting data or retry counts", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const session = await f.session(token);
  const attempt = await f.attempt(token, session, {
    selfReflection: "My separate private review.",
  });
  f.respond(() => chatResponse(JSON.stringify({ dimensions: {} })));
  const failed = await f.evaluate(token, attempt);
  const rawError = JSON.stringify([
    {
      expected: "array",
      code: "invalid_type",
      path: ["dimensions"],
      message: "Invalid input: expected array, received object",
    },
  ]);
  const db = f.database();
  const stored = JSON.parse(
    db.prepare("SELECT data FROM attempts WHERE id=?").get(attempt.id).data,
  );
  stored.error = rawError;
  delete stored.errorCode;
  db.prepare("UPDATE attempts SET data=? WHERE id=?").run(
    JSON.stringify(stored),
    attempt.id,
  );
  db.prepare("UPDATE jobs SET error=? WHERE id=?").run(rawError, failed.job.id);
  const beforeAttempt = db
    .prepare("SELECT * FROM attempts WHERE id=?")
    .get(attempt.id);
  const beforeJob = db
    .prepare("SELECT * FROM jobs WHERE id=?")
    .get(failed.job.id);
  await f.restart();
  for (const path of [
    `/attempts/${attempt.id}`,
    `/attempts/${attempt.id}/feedback`,
    "/state",
    "/home",
    "/export",
  ]) {
    const response = await f.request(path, { token });
    assert.equal(response.status, 200);
    const viewed =
      response.data.attempts?.find((a) => a.id === attempt.id) || response.data;
    assert.equal(viewed.error, ASSESSMENT_FAILURE_MESSAGE, path);
    assert.equal(viewed.errorCode, ASSESSMENT_FAILURE_CODE, path);
    assert.equal(viewed.text, answer);
    assert.equal(viewed.selfReflection, "My separate private review.");
    assert.doesNotMatch(
      JSON.stringify(response.data),
      /invalid_type|expected array|received object/,
    );
  }
  const job = (await f.request(`/jobs/${failed.job.id}`, { token })).data;
  assert.equal(job.error, ASSESSMENT_FAILURE_MESSAGE);
  assert.equal(job.errorCode, ASSESSMENT_FAILURE_CODE);
  assert.equal(job.retryCount, 1);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(
    f.database().prepare("SELECT * FROM attempts WHERE id=?").get(attempt.id),
    beforeAttempt,
  );
  assert.deepEqual(
    f.database().prepare("SELECT * FROM jobs WHERE id=?").get(failed.job.id),
    beforeJob,
  );
  f.respond(() => assessmentResponse(answer));
  const recovered = await f.evaluate(token, attempt);
  assert.equal(recovered.job.id, failed.job.id);
  assert.equal(recovered.attempt.status, "completed");
  assert.equal(recovered.attempt.error, undefined);
  assert.equal(recovered.attempt.errorCode, undefined);
  assert.equal(recovered.job.errorCode, undefined);
  assert.equal(recovered.job.retryCount, 1);
  assert.equal(recovered.attempt.selfReflection, "My separate private review.");
});

test("quote-only feedback derives exact spans, logs only safe failure reasons, and retries once without duplicate rewards", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const article = (await f.request('/articles', { token })).data[0];
  const session = await f.session(token, 'read_reflect', { articleId: article.id });
  const text =
    "🌱 My opening.\r\nA small trial can help 🌿 when its limits are clear. Shared phrase. Shared phrase.";
  const quote = "A small trial can help 🌿 when its limits are clear.";
  const reflection = "PRIVATE_REFLECTION_NEVER_LOG_THIS";
  const attempt = await f.attempt(token, session, {
    text,
    selfReflection: reflection,
  });
  const before = (await f.request("/state", { token })).data.wallet;
  const logs = [];
  t.mock.method(console, "warn", (...args) => logs.push(args));
  let currentQuote = "Shared phrase.";
  f.respond((request) => {
    assert.equal(request.body.includes(reflection), false);
    const value = assessment(text);
    value.dimensions.forEach((dimension) => {
      dimension.evidence_spans = [{ quote: currentQuote }];
    });
    return chatResponse(JSON.stringify(value));
  });
  const failed = await f.evaluate(token, attempt);
  assert.equal(failed.attempt.status, "failed");
  assert.equal(failed.attempt.errorCode, ASSESSMENT_FAILURE_CODE);
  assert.equal(failed.attempt.error, ASSESSMENT_FAILURE_MESSAGE);
  assert.deepEqual(logs, [
    ["[assessment-failed]", failed.job.id, "quote_ambiguous"],
  ]);
  assert.equal(JSON.stringify(logs).includes(text), false);
  assert.equal(JSON.stringify(logs).includes(reflection), false);
  assert.equal(failed.attempt.assessmentReason, undefined);
  assert.equal(failed.job.assessmentReason, undefined);
  assert.equal(f.requests.length, 1);
  assert.deepEqual((await f.request("/state", { token })).data.wallet, before);
  currentQuote = quote;
  const recovered = await f.evaluate(token, attempt);
  assert.equal(recovered.job.id, failed.job.id);
  assert.equal(recovered.attempt.status, "completed");
  assert.equal(recovered.attempt.selfReflection, reflection);
  assert.equal(recovered.attempt.text, text);
  assert.equal(recovered.job.retryCount, 1);
  for (const dimension of recovered.attempt.evaluation.dimensions.slice(0, 4)) {
    assert.equal(dimension.level, 2);
    assert.deepEqual(dimension.evidence_spans, [
      {
        start: text.indexOf(quote),
        end: text.indexOf(quote) + quote.length,
        quote,
      },
    ]);
  }
  const after = (await f.request("/state", { token })).data.wallet;
  assert.equal(after.coins, before.coins + 3);
  await f.evaluate(token, attempt);
  assert.equal(f.requests.length, 2);
  assert.deepEqual((await f.request("/state", { token })).data.wallet, after);
  assert.equal(f.database().prepare("SELECT COUNT(*) n FROM coin_ledger WHERE activity_type='read_reflect' AND coins_delta>0").get().n, 1);
});
