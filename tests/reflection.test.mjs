import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { localEvaluation } from "../server/evaluator.mjs";

const loopbackFetch = globalThis.fetch;
const answer =
  "A small trial could help because we can compare outcomes before a wider change. We should explain which people the evidence represents.";
const note =
  "PRIVATE-REFLECTION: I could connect my example more clearly. Do not treat this note as my answer or award points for it.";
const chatUrl = "https://api.openai.com/v1/chat/completions";

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mindgarden-reflection-"));
  const configuration = {
    dbPath: join(dir, "garden.sqlite"),
    storageDir: join(dir, "audio"),
    apiKey: "",
    model: "gpt-6-luna",
    transcriptionModel: "gpt-transcribe",
    disableWorker: true,
    ...options,
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
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  await start();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(
    path,
    token,
    body,
    method = body === undefined ? "GET" : "POST",
    raw,
  ) {
    const response = await loopbackFetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(raw
          ? { "Content-Type": "audio/webm" }
          : body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
      },
      body: raw || (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { status: response.status, data: await response.json() };
  }
  async function session(token, mode = "spin_speak", more = {}) {
    const result = await request("/sessions", token, { mode, ...more });
    assert.equal(result.status, 201);
    return result.data;
  }
  async function attempt(token, s, more = {}) {
    const result = await request("/attempts", token, {
      sessionId: s.id,
      text: answer,
      responseType: "text",
      ...more,
    });
    assert.equal(result.status, 201);
    return result.data;
  }
  return {
    request,
    session,
    attempt,
    guest: async () => (await request("/auth/guest", undefined, {})).data.token,
    reflect: (token, id, selfReflection) =>
      request(`/attempts/${id}/reflection`, token, { selfReflection }, "PATCH"),
    runJobs: () => service.runJobs(),
    jobs: () =>
      Number(service.db.prepare("SELECT count(*) AS n FROM jobs").get().n),
    restart: async () => {
      await new Promise((resolve) => server.close(resolve));
      service.close();
      await start();
    },
  };
}

test("reflection is optional, separate, editable before feedback and persisted/exported with its owner", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const stranger = await f.guest();
  const s = await f.session(token);
  const created = await f.attempt(token, s, { selfReflection: `  ${note}  ` });
  assert.equal(created.selfReflection, note);
  assert.equal(created.text, answer);
  const before = (await f.request("/state", token)).data;
  assert.equal(
    (
      await f.reflect(
        stranger,
        created.id,
        "Overwrite someone else's reflection",
      )
    ).status,
    404,
  );
  const updated = await f.reflect(
    token,
    created.id,
    " I would add a limitation. ",
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.data.selfReflection, "I would add a limitation.");
  assert.equal(updated.data.text, answer);
  await f.restart();
  assert.equal(
    (await f.request(`/attempts/${created.id}`, token)).data.selfReflection,
    "I would add a limitation.",
  );
  assert.equal(
    (await f.request("/export", token)).data.attempts.find(
      (a) => a.id === created.id,
    ).selfReflection,
    "I would add a limitation.",
  );
  assert.deepEqual(
    (await f.request("/state", token)).data.wallet,
    before.wallet,
  );
  assert.equal(
    (await f.reflect(token, created.id, "  ")).data.selfReflection,
    "",
  );
  const skipped = await f.attempt(token, s);
  assert.equal(skipped.selfReflection, undefined);
});

test("reflection validates its own 2000-character limit and cannot mutate response text", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const s = await f.session(token);
  const a = await f.attempt(token, s, { selfReflection: "🌱".repeat(1000) });
  assert.equal(a.selfReflection.length, 2000);
  for (const value of ["x".repeat(2001), "🌱".repeat(1001), null, 42, []]) {
    assert.equal((await f.reflect(token, a.id, value)).status, 400);
    assert.equal(
      (
        await f.request("/attempts", token, {
          sessionId: s.id,
          text: answer,
          selfReflection: value,
        })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await f.request(
        `/attempts/${a.id}/reflection`,
        token,
        { selfReflection: note, text: "Replace response" },
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal((await f.request(`/attempts/${a.id}`, token)).data.text, answer);
  await f.request("/me", token, { consent: { recording: true } }, "PATCH");
  const audio = await f.request(
    "/audio",
    token,
    undefined,
    "POST",
    Buffer.from("offline audio fixture"),
  );
  assert.equal(audio.status, 201);
  const draft = await f.attempt(token, s, {
    text: "",
    responseType: "audio",
    audioId: audio.data.id,
  });
  const reflected = await f.reflect(token, draft.id, note);
  assert.equal(reflected.status, 200);
  assert.equal(reflected.data.text, "");
  assert.equal(reflected.data.audioId, audio.data.id);
});

test("reflection freezes when queued/processing/completed but can be revised after failed evaluation", async (t) => {
  let entered;
  let release;
  let shouldFail = true;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await fixture(t, {
    evaluator: async (a) => {
      if (shouldFail) {
        entered();
        await pending;
        throw new Error("Controlled offline evaluator failure");
      }
      return localEvaluation(a);
    },
  });
  const token = await f.guest();
  const a = await f.attempt(token, await f.session(token), {
    selfReflection: note,
  });
  assert.equal(
    (await f.request(`/attempts/${a.id}/evaluate`, token, {})).status,
    202,
  );
  assert.equal((await f.reflect(token, a.id, "late queued note")).status, 409);
  const work = f.runJobs();
  await started;
  try {
    assert.equal(
      (await f.request(`/attempts/${a.id}`, token)).data.status,
      "processing",
    );
    assert.equal(
      (await f.reflect(token, a.id, "late processing note")).status,
      409,
    );
  } finally {
    release();
  }
  await work;
  assert.equal(
    (await f.reflect(token, a.id, "Revised before retrying failed evaluation."))
      .status,
    200,
  );
  shouldFail = false;
  await f.request(`/attempts/${a.id}/evaluate`, token, {});
  await f.runJobs();
  const completed = (await f.request(`/attempts/${a.id}`, token)).data;
  assert.equal(completed.status, "completed");
  assert.equal(
    completed.selfReflection,
    "Revised before retrying failed evaluation.",
  );
  assert.equal(
    (await f.reflect(token, a.id, "late completed note")).status,
    409,
  );
});

test("deferred debate persists one draft through duplicate/restart recovery and evaluates only explicitly", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const s = await f.session(token, "debate", { rounds: 2 });
  const first = {
    text: answer,
    idempotencyKey: "deferred-first-turn",
    deferEvaluation: true,
  };
  assert.equal(
    (await f.request(`/debates/${s.id}/turn`, token, first)).status,
    200,
  );
  const last = { ...first, idempotencyKey: "deferred-final-turn" };
  const responses = await Promise.all([
    f.request(`/debates/${s.id}/turn`, token, last),
    f.request(`/debates/${s.id}/turn`, token, last),
  ]);
  const accepted = responses.find((r) => r.status === 200).data;
  assert.equal(accepted.status, "completed");
  assert.ok(accepted.attemptId);
  assert.equal(accepted.jobId, undefined);
  assert.equal(f.jobs(), 0);
  assert.equal(
    (await f.request(`/attempts/${accepted.attemptId}`, token)).data.status,
    "draft",
  );
  await f.restart();
  const replay = await f.request(`/debates/${s.id}/turn`, token, {
    ...last,
    deferEvaluation: false,
  });
  assert.equal(replay.data.attemptId, accepted.attemptId);
  assert.equal(replay.data.jobId, undefined);
  assert.equal((await f.request("/state", token)).data.attempts.length, 1);
  assert.equal(f.jobs(), 0);
  const reflected = await f.reflect(token, accepted.attemptId, note);
  assert.equal(reflected.status, 200);
  const beforeText = reflected.data.text;
  const queued = await f.request(
    `/attempts/${accepted.attemptId}/evaluate`,
    token,
    {},
  );
  assert.equal(queued.status, 202);
  await f.runJobs();
  const completed = (await f.request(`/attempts/${accepted.attemptId}`, token))
    .data;
  assert.equal(completed.status, "completed");
  assert.equal(completed.selfReflection, note);
  assert.equal(completed.text, beforeText);
  const wallet = (await f.request("/state", token)).data.wallet;
  await f.request(`/attempts/${accepted.attemptId}/evaluate`, token, {});
  await f.runJobs();
  assert.deepEqual((await f.request("/state", token)).data.wallet, wallet);
});

test("reflection never reaches configured evaluation prompts or evidence in any mode", async (t) => {
  const sent = [];
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, chatUrl, "No unmocked outbound request is allowed");
    assert.equal(request.body.includes("PRIVATE-REFLECTION"), false);
    const input = JSON.parse(JSON.parse(request.body).messages[1].content);
    assert.equal(input.selfReflection, undefined);
    sent.push(input);
    const raw = {
      dimensions: ["grounded", "reasoned", "organised", "well_rounded"].map(
        (key) => ({
          key,
          level: 2,
          confidence: "low",
          evidence_spans: [
            { start: 0, end: input.ANSWER.length, quote: input.ANSWER },
          ],
          strength: "A reason is included in the response.",
          improvement: "Explain a relevant limitation.",
        }),
      ),
      key_takeaway: "Explain a relevant limitation.",
      retry_prompt: "Add one qualification.",
      verification_flags: [],
      needs_review: false,
    };
    return Response.json({
      choices: [{ message: { content: JSON.stringify(raw) } }],
    });
  });
  const f = await fixture(t, { apiKey: "offline-reflection-fixture" });
  const token = await f.guest();
  const articles = (await f.request("/articles", token)).data;
  for (const mode of ["spin_speak", "read_reflect", "debate"]) {
    const s = await f.session(
      token,
      mode,
      mode === "read_reflect" ? { articleId: articles[0].id } : {},
    );
    const a = await f.attempt(token, s, { selfReflection: note });
    await f.request(`/attempts/${a.id}/evaluate`, token, {});
    await f.runJobs();
    const completed = (await f.request(`/attempts/${a.id}`, token)).data;
    assert.equal(completed.status, "completed");
    assert.equal(completed.selfReflection, note);
    assert.equal(sent.at(-1).ANSWER, answer);
    for (const dimension of completed.evaluation.dimensions)
      for (const span of dimension.evidence_spans)
        assert.equal(completed.text.slice(span.start, span.end), span.quote);
  }
  assert.equal(sent.length, 3);
});

test("a failed final debate turn retains its defer choice when retried without the optional flag", async (t) => {
  let fail = false;
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, chatUrl, "No unmocked outbound request is allowed");
    const input = JSON.parse(JSON.parse(request.body).messages[1].content);
    assert.equal(
      input.ANSWER,
      undefined,
      "Deferred debate must not request evaluation",
    );
    if (fail)
      return Response.json(
        { error: { code: "temporary_failure" } },
        { status: 503 },
      );
    return Response.json({
      choices: [
        {
          message: {
            content:
              "A trial may omit affected groups. Which people would you include?",
          },
        },
      ],
    });
  });
  const f = await fixture(t, { apiKey: "offline-reflection-fixture" });
  const token = await f.guest();
  const s = await f.session(token, "debate", { rounds: 2 });
  await f.request(`/debates/${s.id}/turn`, token, {
    text: answer,
    idempotencyKey: "recover-first-turn",
    deferEvaluation: true,
  });
  const last = {
    text: answer,
    idempotencyKey: "recover-final-turn",
    deferEvaluation: true,
  };
  fail = true;
  assert.equal(
    (await f.request(`/debates/${s.id}/turn`, token, last)).status,
    502,
  );
  await f.restart();
  fail = false;
  const result = await f.request(`/debates/${s.id}/turn`, token, {
    text: answer,
    idempotencyKey: last.idempotencyKey,
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.jobId, undefined);
  assert.equal(f.jobs(), 0);
  assert.equal(
    (await f.request(`/attempts/${result.data.attemptId}`, token)).data.status,
    "draft",
  );
});
