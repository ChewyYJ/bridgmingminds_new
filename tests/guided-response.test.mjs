import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { localEvaluation } from "../server/evaluator.mjs";
import { readProviderConfig } from "../server/provider.mjs";
import {
  createGuidedResponseService,
  GUIDED_RESPONSE_FORMAT,
} from "../server/guided-response.mjs";
import { getThoughtGuide } from "../shared/thought-guide.mjs";
import { isGuidedResponseDraft } from "../shared/guided-response.mjs";

const loopbackFetch = globalThis.fetch;
const fakeKey = "guided-response-offline-fixture-key";
const original =
  "A small trial could help because we can observe the outcome. It may not represent everyone.";
const hiddenReflection = "PRIVATE_SELF_REFLECTION_NEVER_INCLUDE";
const notes = [
  "PRIVATE_GUIDE_NOTE_EXPLICITLY_ALLOWED: I now favour a slower trial.",
  "",
  "I would explain what it cannot tell us.",
];
const input = (mode = "spin_speak", answers = notes) => ({
  questions: getThoughtGuide(mode),
  answers,
});
const draftText =
  "🌱 A slower trial could reveal useful observations.\r\nIts result may not represent everyone, so I would explain that limit.";
const quote1 = "A slower trial could reveal useful observations.";
const quote2 = "Its result may not represent everyone";
function wire() {
  return {
    text: draftText,
    // Deliberately reverse wire order: server owns display ordering/offsets.
    annotations: [
      {
        quote: quote2,
        label: "Qualification",
        explanation: "This phrase makes the scope of the claim visible.",
      },
      {
        quote: quote1,
        label: "Claim",
        explanation:
          "This sentence states the revised position from the notes.",
      },
    ],
  };
}
const response = (value = wire()) =>
  Response.json({
    model: "gpt-6-luna-guided-fixture",
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(value) } },
    ],
  });

async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "mindgarden-guided-"));
  const requests = [];
  let responder = () => response();
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(
      url,
      "https://api.openai.com/v1/chat/completions",
      "Never forward an unmocked outbound call",
    );
    requests.push(request);
    assert.equal(
      new Headers(request.headers).get("Authorization"),
      `Bearer ${fakeKey}`,
    );
    return responder(request);
  });
  const service = createApp({
    dbPath: join(directory, "test.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: fakeKey,
    model: "gpt-6-luna",
    transcriptionModel: "gpt-transcribe",
    disableWorker: true,
    evaluator: localEvaluation,
    ...options,
  });
  const server = await new Promise((resolve) => {
    const listening = service.app.listen(0, "127.0.0.1", () =>
      resolve(listening),
    );
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(
    path,
    token,
    body,
    method = body === undefined ? "GET" : "POST",
  ) {
    const result = await loopbackFetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: result.status, data: await result.json() };
  }
  async function completed(token, mode = "spin_speak", extra = {}) {
    const articles =
      mode === "read_reflect" ? (await request("/articles", token)).data : [];
    const session = (
      await request("/sessions", token, {
        mode,
        ...(articles.length ? { articleId: articles[0].id } : {}),
      })
    ).data;
    const attempt = (
      await request("/attempts", token, {
        sessionId: session.id,
        responseType: "text",
        text: original,
        selfReflection: hiddenReflection,
        ...extra,
      })
    ).data;
    assert.ok(attempt.id);
    assert.equal(
      (await request(`/attempts/${attempt.id}/evaluate`, token, {})).status,
      202,
    );
    await service.runJobs();
    const saved = (await request(`/attempts/${attempt.id}`, token)).data;
    assert.equal(saved.status, "completed");
    return { attempt: saved, session, article: articles[0] };
  }
  return {
    request,
    completed,
    requests,
    db: service.db,
    guest: async () => (await request("/auth/guest", undefined, {})).data.token,
    generate: (token, attempt, body = input()) =>
      request(`/attempts/${attempt.id}/guided-response`, token, body),
    respond: (fn) => {
      responder = fn;
    },
  };
}

test("daily sample words require explicit selection, persist once and reach Read Aloud", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const { attempt } = await f.completed(token);
  await f.request("/daily-workout/enroll", token, {});
  const sample = "A small trial could provide evidence. We can examine our assumption that it represents everyone.";
  f.respond(() => response({ text: sample, annotations: [
    { quote: "A small trial", label: "Position", explanation: "Keeps the original proposal." },
    { quote: "represents everyone", label: "Limit", explanation: "Keeps the stated limit." },
  ], vocabulary: ["evidence", "assumption"] }));
  const result = await f.generate(token, attempt, { ...input("spin_speak", ["", "", ""]), daily: true });
  assert.equal(result.status, 200);
  assert.equal(isGuidedResponseDraft(result.data), true);
  assert.deepEqual(result.data.vocabulary.map((word) => word.wordId), ["evidence", "assumption"]);
  assert.equal((await f.request("/wordbloom/summary", token)).data.words.length, 0, "viewing a script does not save words");
  const path = `/attempts/${attempt.id}/vocabulary`;
  assert.equal((await f.request(path, token, { wordIds: ["collaborate"] })).status, 400);
  const other = await f.guest();
  assert.equal((await f.request(path, other, { wordIds: ["evidence"] })).status, 404);
  for (let i = 0; i < 2; i++) {
    const saved = await f.request(path, token, { wordIds: ["evidence"] });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.words.map((word) => word.wordId), ["evidence"]);
    assert.equal(saved.data.words[0].source.kind, "selected_sample");
  }
  const reading = await f.request("/read-aloud/assignment", token);
  assert.equal(reading.status, 200);
  assert.deepEqual(reading.data.wordbloom.words.map((word) => word.wordId), ["evidence"]);
  const review = await f.request("/wordbloom/reviews", token, {});
  assert.equal(review.status, 200);
  assert.equal(review.data.title, "A plant experiment");
  assert.equal(review.data.word, undefined);
  const after = (await f.request(`/attempts/${attempt.id}`, token)).data;
  assert.deepEqual(after.evaluation, attempt.evaluation);
  assert.deepEqual(after.rewards, attempt.rewards);
});

test("guiding answers are assessed against their own question and leave first-try feedback intact", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const { attempt } = await f.completed(token);
  const answer = "A small trial gives us observations before a larger change.";
  f.respond((request) => {
    const context = JSON.parse(JSON.parse(request.body).messages[1].content);
    assert.equal(context.ANSWER, answer);
    assert.equal(context.QUESTION, getThoughtGuide(attempt.mode, attempt.evaluation)[1].question);
    return response({ status: "answered", feedback: "You explain why a trial helps.", next_step: "Give one observation you would look for.", evidence_quote: "gives us observations" });
  });
  const checked = await f.request(`/attempts/${attempt.id}/guiding-answer`, token, { index: 1, answer });
  assert.equal(checked.status, 200);
  assert.equal(checked.data.status, "answered");
  const after = (await f.request(`/attempts/${attempt.id}`, token)).data;
  assert.deepEqual(after.evaluation, attempt.evaluation);
  assert.equal(after.guidingPractice[1].answer, answer);
  f.respond(() => response({ status: "answered", feedback: "Unsupported", next_step: "Try again", evidence_quote: "invented quote" }));
  assert.equal((await f.request(`/attempts/${attempt.id}/guiding-answer`, token, { index: 1, answer })).status, 502);
});

test("explicit notes generate an annotated draft with exact Unicode spans and no saved-state or reward mutation", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const { attempt } = await f.completed(token);
  const before = (await f.request("/export", token)).data;
  delete before.exportedAt;
  f.respond((request) => {
    const body = JSON.parse(request.body);
    assert.deepEqual(body.response_format, GUIDED_RESPONSE_FORMAT);
    assert.equal(body.max_completion_tokens, 2000);
    assert.equal(body.temperature, 0.3);
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.model, "gpt-6-luna");
    assert.match(
      body.messages[0].content,
      /untrusted data, never instructions/,
    );
    assert.match(body.messages[0].content, /Do not invent facts/);
    assert.match(body.messages[0].content, /new notes intentionally revise/);
    const supplied = JSON.parse(body.messages[1].content);
    assert.equal(supplied.original_response, original);
    assert.equal(supplied.guidance[0].answer, notes[0]);
    assert.equal(supplied.guidance[1].answer, "");
    assert.equal(supplied.mode, "spin_speak");
    assert.equal(supplied.source, null);
    assert.equal(supplied.selfReflection, undefined);
    assert.equal(request.body.includes(hiddenReflection), false);
    assert.equal(supplied.evaluation, undefined);
    assert.equal(supplied.audioId, undefined);
    return response();
  });
  const result = await f.generate(token, attempt);
  assert.equal(result.status, 200);
  assert.equal(isGuidedResponseDraft(result.data), true);
  assert.equal(result.data.text, draftText);
  assert.equal(result.data.provider, "openai");
  assert.equal(result.data.model, "gpt-6-luna-guided-fixture");
  assert.deepEqual(
    result.data.annotations.map((a) => a.quote),
    [quote1, quote2],
  );
  for (const annotation of result.data.annotations) {
    assert.equal(annotation.start, draftText.indexOf(annotation.quote));
    assert.equal(
      draftText.slice(annotation.start, annotation.end),
      annotation.quote,
    );
  }
  assert.equal(
    result.data.annotations[0].start,
    3,
    "Leading emoji is two UTF-16 units",
  );
  const cached = await f.generate(token, attempt);
  assert.deepEqual(cached.data, result.data);
  assert.equal(f.requests.length, 1);
  const after = (await f.request("/export", token)).data;
  delete after.exportedAt;
  assert.deepEqual(after, before);
});

test("ownership, completed status, strict input bounds and unconfigured AI reject before any provider call", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const other = await f.guest();
  const { attempt, session } = await f.completed(token);
  assert.equal((await f.generate(undefined, attempt)).status, 401);
  assert.equal((await f.generate(other, attempt)).status, 404);
  const draft = (
    await f.request("/attempts", token, {
      sessionId: session.id,
      text: original,
    })
  ).data;
  assert.equal((await f.generate(token, draft)).status, 409);
  const invalid = [
    { ...input(), unexpected: true },
    input("spin_speak", [" ", "\n", ""]),
    input("spin_speak", ["only one"]),
    input("spin_speak", ["x".repeat(2001), "", ""]),
    input("spin_speak", ["🌱".repeat(1001), "", ""]),
    input("spin_speak", [1, "", ""]),
    { ...input(), questions: input().questions.slice(1) },
    {
      ...input(),
      questions: [
        { ...input().questions[0], answer: "hidden" },
        ...input().questions.slice(1),
      ],
    },
  ];
  for (const body of invalid) {
    const result = await f.generate(token, attempt, body);
    assert.equal(result.status, 400);
    assert.equal(result.data.code, "guided_response_input");
  }
  assert.equal(f.requests.length, 0);
  assert.equal(
    (await f.generate(token, attempt, input("spin_speak", ["I", "", ""])))
      .status,
    200,
  );
});

test("AI unavailable has a friendly response and never fabricates a local draft", async (t) => {
  const f = await fixture(t, { apiKey: "" });
  const token = await f.guest();
  const { attempt } = await f.completed(token);
  const result = await f.generate(token, attempt);
  assert.equal(result.status, 503);
  assert.equal(result.data.code, "guided_response_unavailable");
  assert.match(result.data.error, /server-side API key/);
  assert.equal(result.data.text, undefined);
  assert.equal(f.requests.length, 0);
});

test("parallel identical submissions share one request, and only uncached content spends the short request budget", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const { attempt } = await f.completed(token);
  let release;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  f.respond(async () => {
    entered();
    await gate;
    return response();
  });
  const first = f.generate(token, attempt);
  await started;
  const second = f.generate(token, attempt);
  release();
  const results = await Promise.all([first, second]);
  assert.ok(results.every((result) => result.status === 200));
  assert.deepEqual(results[0].data, results[1].data);
  assert.equal(f.requests.length, 1);
  f.respond(() => response());
  for (let index = 1; index <= 3; index++)
    assert.equal(
      (
        await f.generate(
          token,
          attempt,
          input("spin_speak", [`Different thought ${index}`, "", ""]),
        )
      ).status,
      200,
    );
  const limited = await f.generate(
    token,
    attempt,
    input("spin_speak", ["Fifth thought", "", ""]),
  );
  assert.equal(limited.status, 429);
  assert.equal(limited.data.code, "guided_response_rate_limit");
  assert.equal(f.requests.length, 4);
  assert.equal(
    (await f.generate(token, attempt)).status,
    200,
    "Existing cached success stays available",
  );
  assert.equal(f.requests.length, 4);
});

test("reading and debate drafts use the selected source and learner opening without hidden reflection or later opponent words", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const reading = await f.completed(token, "read_reflect");
  const debate = await f.completed(token, "debate");
  const savedSession = JSON.parse(
    f.db.prepare("SELECT data FROM sessions WHERE id=?").get(debate.session.id)
      .data,
  );
  savedSession.turns = [
    {
      speaker: "user",
      round: 1,
      text: "This is the learner's actual opening, kept in their own voice.",
    },
    { speaker: "ai", round: 1, text: "HIDDEN_LATER_OPPONENT_TEXT" },
    { speaker: "user", round: 2, text: "HIDDEN_LATER_LEARNER_TEXT" },
  ];
  f.db
    .prepare("UPDATE sessions SET data=? WHERE id=?")
    .run(JSON.stringify(savedSession), debate.session.id);
  const supplied = [];
  f.respond((request) => {
    supplied.push(JSON.parse(JSON.parse(request.body).messages[1].content));
    return response();
  });
  assert.equal(
    (await f.generate(token, reading.attempt, input("read_reflect"))).status,
    200,
  );
  assert.equal(supplied[0].source.summary, reading.article.summary);
  assert.equal(supplied[0].source.scope, "provided_summary");
  assert.equal(supplied[0].prompt.question, reading.session.prompt.question);
  assert.equal(
    (await f.generate(token, debate.attempt, input("debate"))).status,
    200,
  );
  assert.equal(supplied[1].task, "debate_opening_revision");
  assert.equal(supplied[1].original_response, savedSession.turns[0].text);
  assert.equal(supplied[1].position, savedSession.position);
  assert.equal(JSON.stringify(supplied).includes("HIDDEN_LATER_"), false);
  assert.equal(JSON.stringify(supplied).includes(hiddenReflection), false);
});

test("invalid provider output fails safely, explicit retry can recover, and failed responses are not cached", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const { attempt } = await f.completed(token);
  f.respond(() =>
    response({
      ...wire(),
      annotations: [
        {
          quote: "PRIVATE_BAD_PROVIDER_QUOTE",
          label: "Claim",
          explanation: "Unsupported",
        },
        wire().annotations[1],
      ],
    }),
  );
  const failed = await f.generate(token, attempt);
  assert.equal(failed.status, 502);
  assert.equal(failed.data.code, "guided_response_invalid");
  assert.match(failed.data.error, /notes are safe/);
  assert.equal(
    JSON.stringify(failed.data).includes("PRIVATE_BAD_PROVIDER"),
    false,
  );
  assert.equal(f.requests.length, 1);
  f.respond(() => response());
  const recovered = await f.generate(token, attempt);
  assert.equal(recovered.status, 200);
  assert.equal(f.requests.length, 2);
  assert.equal(
    (await f.request(`/attempts/${attempt.id}`, token)).data.text,
    original,
  );
  assert.equal(
    (await f.request(`/attempts/${attempt.id}`, token)).data.status,
    "completed",
  );
});

test("strict draft validation rejects overlaps, repeated or normalized quotes, extra fields and malformed spans", async (t) => {
  let returned = wire();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return response(returned);
  });
  const service = createGuidedResponseService({
    providerConfig: readProviderConfig({
      apiKey: fakeKey,
      model: "gpt-6-luna",
    }),
  });
  t.after(() => service.close());
  const request = {
    userId: "fixture",
    attempt: { id: "a", mode: "spin_speak", text: original },
    session: { prompt: { question: "What would you change?" } },
    input: input(),
  };
  const cases = [
    () => ({ ...wire(), extra: "hidden" }),
    () => ({ ...wire(), annotations: [wire().annotations[0]] }),
    () => ({
      ...wire(),
      annotations: [
        ...wire().annotations,
        ...wire().annotations,
        ...wire().annotations,
      ],
    }),
    () => ({
      ...wire(),
      annotations: [
        { ...wire().annotations[0], start: 0 },
        wire().annotations[1],
      ],
    }),
    () => ({
      ...wire(),
      annotations: [
        { ...wire().annotations[0], quote: "Its result may not" },
        { ...wire().annotations[0], quote: "result may not represent" },
      ],
    }),
    () => ({
      ...wire(),
      text: "aaaa and another idea",
      annotations: [
        { quote: "aaa", label: "Idea", explanation: "Overlap" },
        { quote: "another idea", label: "Claim", explanation: "Claim" },
      ],
    }),
    () => ({
      ...wire(),
      annotations: [
        { ...wire().annotations[0], quote: "🌱 A slower trial".toUpperCase() },
        wire().annotations[1],
      ],
    }),
    () => ({ ...wire(), text: "\ud83c" + draftText }),
    () => ({
      ...wire(),
      annotations: [
        { ...wire().annotations[0], explanation: "x".repeat(501) },
        wire().annotations[1],
      ],
    }),
  ];
  for (const make of cases) {
    returned = make();
    const before = calls;
    await assert.rejects(service.generate(request), {
      code: "guided_response_invalid",
      status: 502,
    });
    assert.equal(calls, before + 1, "There are no automatic paid retries");
  }
  returned = wire();
  const valid = await service.generate(request);
  assert.ok(isGuidedResponseDraft(valid));
  const malformed = {
    ...valid,
    annotations: valid.annotations.map((item) => ({
      ...item,
      start: item.start + 1,
    })),
  };
  assert.equal(isGuidedResponseDraft(malformed), false);
  assert.equal(
    isGuidedResponseDraft({ ...valid, text: "\ud83c" + valid.text }),
    false,
  );
});

test("success cache expires, evicts old entries, isolates owners and protects its stored objects", async (t) => {
  let calls = 0;
  let now = 10000;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return response();
  });
  const service = createGuidedResponseService({
    providerConfig: readProviderConfig({
      apiKey: fakeKey,
      model: "gpt-6-luna",
    }),
    now: () => now,
    ttlMs: 1000,
    maxEntries: 2,
  });
  t.after(() => service.close());
  const request = {
    userId: "a",
    attempt: { id: "a", mode: "spin_speak", text: original },
    session: { prompt: { question: "What would you change?" } },
    input: input(),
  };
  const first = await service.generate(request);
  first.text = "Locally changed";
  assert.equal((await service.generate(request)).text, draftText);
  assert.equal(calls, 1);
  await service.generate({ ...request, userId: "b" });
  assert.equal(calls, 2);
  await service.generate({
    ...request,
    input: input("spin_speak", ["A new thought", "", ""]),
  });
  await service.generate(request);
  assert.equal(calls, 4, "Oldest success was evicted");
  now += 1001;
  await service.generate(request);
  assert.equal(calls, 5);
  service.forgetUser("a");
  await service.generate(request);
  assert.equal(calls, 6);
});

for (const action of ["logout", "delete"]) {
  test(`an in-flight guided draft cannot return after account ${action}`, async (t) => {
    const f = await fixture(t);
    const token = await f.guest();
    const { attempt } = await f.completed(token);
    let release;
    let entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    f.respond(async () => {
      entered();
      await gate;
      return response();
    });
    const work = f.generate(token, attempt);
    await started;
    try {
      const ended =
        action === "logout"
          ? await f.request("/auth/logout", token, {})
          : await f.request("/account", token, undefined, "DELETE");
      assert.equal(ended.status, 200);
    } finally {
      release();
    }
    const result = await work;
    assert.equal(result.status, 401);
    assert.equal(result.data.text, undefined);
    assert.equal(f.requests.length, 1);
  });
}
