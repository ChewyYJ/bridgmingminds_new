import test from "node:test";
import assert from "node:assert/strict";
import { createGuidedResponseService } from "../server/guided-response.mjs";
import { readProviderConfig } from "../server/provider.mjs";

const request = {
  userId: "learner",
  attempt: {
    id: "attempt",
    mode: "spin_speak",
    text: "I favour a small trial because we can study its results.",
  },
  session: { prompt: { question: "What would you change?" } },
  input: {
    questions: [
      { question: "Your view?" },
      { question: "Your reason?" },
      { question: "Any limit?" },
    ],
    answers: [
      "A small trial.",
      "It lets us learn.",
      "It may not represent everyone.",
    ],
  },
};
const providerConfig = readProviderConfig({
  apiKey: "offline-guided-test-key",
  model: "gpt-6-luna",
});
const wire = () =>
  Response.json({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            text: "I favour a small trial. Its results may not represent everyone.",
            annotations: [
              {
                quote: "I favour a small trial.",
                label: "Claim",
                explanation: "States your view.",
              },
              {
                quote: "may not represent everyone",
                label: "Limit",
                explanation: "Makes the uncertainty clear.",
              },
            ],
          }),
        },
      },
    ],
  });

test("asynchronous account and rate checks still share one guided provider request", async (t) => {
  let calls = 0,
    checks = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let began;
  const entered = new Promise((resolve) => {
    began = resolve;
  });
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return wire();
  });
  const service = createGuidedResponseService({
    providerConfig,
    isUserActive: async () => true,
    beforeRequest: async (userId, context) => {
      assert.equal(userId, request.userId);
      assert.equal(context.attempt, request.attempt);
      assert.equal(context.session, request.session);
      checks++;
      began();
      await gate;
    },
  });
  t.after(() => service.close());
  const first = service.generate(request);
  await entered;
  const duplicate = service.generate(request);
  release();
  const results = await Promise.all([first, duplicate]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(calls, 1);
  assert.equal(checks, 1);
});

test("async account rejection prevents provider access", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return wire();
  });
  const service = createGuidedResponseService({
    providerConfig,
    isUserActive: async () => false,
  });
  t.after(() => service.close());
  await assert.rejects(service.generate(request), {
    status: 401,
    code: "guided_response_session",
  });
  assert.equal(calls, 0);
});

test("async limiter rejection blocks provider access and clears the pending entry", async (t) => {
  let calls = 0,
    blocked = true;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return wire();
  });
  const service = createGuidedResponseService({
    providerConfig,
    beforeRequest: async () => {
      if (blocked) throw Object.assign(new Error("Limited"), { status: 429 });
    },
  });
  t.after(() => service.close());
  await assert.rejects(service.generate(request), { status: 429 });
  assert.equal(calls, 0);
  blocked = false;
  assert.ok((await service.generate(request)).text);
  assert.equal(calls, 1);
});

test("account removal during an asynchronous limiter check prevents a paid call", async (t) => {
  let calls = 0,
    active = true;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return wire();
  });
  const service = createGuidedResponseService({
    providerConfig,
    isUserActive: async () => active,
    beforeRequest: async () => {
      active = false;
    },
  });
  t.after(() => service.close());
  await assert.rejects(service.generate(request), { status: 401 });
  assert.equal(calls, 0);
});
