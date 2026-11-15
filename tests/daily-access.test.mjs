import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { bridgeFixture } from "./helpers/bridge-fixture.mjs";
const answer =
  "A small trial can test an idea. It gives people a chance to compare outcomes before a wider change.";
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "daily-access-"));
  let clock = Date.parse("2026-11-02T08:00:00Z"),
    service,
    server,
    base,
    calls = 0,
    fail = false;
  const original = global.fetch;
  t.mock.method(global, "fetch", async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:"))
      return original(url, options);
    assert.equal(
      String(url),
      "https://api.openai.com/v1/chat/completions",
      "unexpected outbound request must never reach a socket",
    );
    calls++;
    if (fail)
      return Response.json(
        { error: { message: "Offline outage fixture" } },
        { status: 503 },
      );
    const body = JSON.parse(options.body),
      supplied = JSON.parse(body.messages[1].content);
    const raw =
      body.response_format.json_schema.name === "bridgingminds_bridge_v3"
        ? bridgeFixture(supplied.ANSWER, supplied.applicable_dimensions)
        : {
            dimensions: [
              "grounded",
              "reasoned",
              "organised",
              "well_rounded",
            ].map((key) => ({
              key,
              level: 2,
              confidence: "low",
              evidence_spans: [{ start: 0, end: answer.length, quote: answer }],
              strength: "You state a concrete point.",
              improvement: "Explain the link to your reason.",
            })),
            key_takeaway: "Explain the connection.",
            retry_prompt: "What might change your view?",
            verification_flags: [],
            needs_review: false,
          };
    return Response.json({
      model: "offline-daily-access-fixture",
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(raw) } },
      ],
    });
  });
  const options = {
    dbPath: join(directory, "test.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: "offline-daily-access-key",
    disableWorker: true,
    enforceUsageLimits: true,
    usageClock: () => clock,
    dailyNow: () => new Date(clock),
  };
  async function boot() {
    service = createApp(options);
    server = await new Promise((resolve) => {
      const current = service.app.listen(0, "127.0.0.1", () =>
        resolve(current),
      );
    });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (service) await service.close();
    await rm(directory, { recursive: true, force: true });
  });
  await boot();
  async function request(path, token, body, method = body ? "POST" : "GET") {
    const response = await original(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }
  async function ok(...args) {
    const result = await request(...args);
    assert.ok(result.status < 300, JSON.stringify(result));
    return result.data;
  }
  async function guest() {
    const { token } = await ok("/auth/guest", null, {});
    await ok(
      "/me",
      token,
      { onboardingComplete: true, timezone: "UTC" },
      "PATCH",
    );
    return token;
  }
  async function attempt(token, mode = "spin_speak") {
    const session = await ok("/sessions", token, { mode });
    return ok("/attempts", token, { sessionId: session.id, text: answer });
  }
  async function evaluate(token, attempt) {
    const queued = await ok(`/attempts/${attempt.id}/evaluate`, token, {});
    await service.runJobs();
    return ok(`/jobs/${queued.id}`, token);
  }
  return {
    ok,
    request,
    guest,
    attempt,
    evaluate,
    run: () => service.runJobs(),
    get calls() {
      return calls;
    },
    fail(value) {
      fail = value;
    },
    setTime(value) {
      clock = Date.parse(value);
    },
    restart: async () => {
      await new Promise((resolve) => server.close(resolve));
      await service.close();
      await boot();
    },
  };
}
test("hosted-like admission preserves the required daily activity after five optional/classic practices and still limits optional modes", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  for (let index = 0; index < 5; index++)
    assert.equal(
      (await f.evaluate(token, await f.attempt(token))).status,
      "completed",
    );
  assert.equal((await f.ok("/state", token)).usage.remaining, 0);
  const blocked = await f.attempt(token);
  assert.equal(
    (await f.request(`/attempts/${blocked.id}/evaluate`, token, {})).status,
    429,
  );
  const baseline = (await f.ok("/state", token)).xp;
  await f.ok("/daily-workout/enroll", token, {});
  // A draft begun before enrolment remains usable; it does not need a new rubric
  // or a discarded answer to obtain the required daily participation credit.
  assert.equal((await f.evaluate(token, blocked)).status, "completed");
  assert.equal((await f.ok("/state", token)).xp, baseline + 15);
  assert.equal((await f.ok("/state", token)).usage.used, 5);
  const daily = await f.attempt(token);
  assert.equal((await f.evaluate(token, daily)).status, "completed");
  assert.equal((await f.ok("/state", token)).xp, baseline + 15);
  const optional = await f.attempt(token, "debate");
  assert.equal(
    (await f.request(`/attempts/${optional.id}/evaluate`, token, {})).status,
    429,
  );
  const calls = f.calls;
  await f.evaluate(token, daily);
  assert.equal(f.calls, calls);
  await f.restart();
  assert.equal((await f.ok("/state", token)).usage.remaining, 0);
  assert.equal((await f.ok("/state", token)).usage.dailySpeakingIncluded, true);
});
test("outage and daily-cap retries recover after service midnight and keep the original activity receipt", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  await f.ok("/daily-workout/enroll", token, {});
  const assignment = await f.ok("/read-aloud/assignment", token);
  await f.ok(`/read-aloud/assignments/${assignment.id}/submit`, token, {
    idempotencyKey: "daily-cap-reading",
    notes: "I practised the final phrase and noticed a useful pause.",
    selfReviewConfirmed: true,
  });
  f.fail(true);
  for (let index = 0; index < 12; index++)
    assert.equal(
      (await f.evaluate(token, await f.attempt(token))).status,
      "failed",
    );
  const pending = await f.attempt(token);
  const limited = await f.evaluate(token, pending);
  assert.equal(limited.status, "failed");
  assert.match(limited.error, /daily speaking feedback request limit/);
  assert.equal(f.calls, 12);
  assert.equal((await f.ok("/state", token)).xp, 10);
  await f.restart();
  assert.equal((await f.evaluate(token, pending)).status, "failed");
  assert.equal(f.calls, 12);
  f.fail(false);
  f.setTime("2026-11-03T08:00:00Z");
  assert.equal((await f.evaluate(token, pending)).status, "completed");
  assert.equal(f.calls, 13);
  const exported = await f.ok("/export", token);
  const receipt = exported.dailySubmissionReceipts.find(
    (item) => item.attempt_id === pending.id,
  );
  assert.equal(receipt.local_date, "2026-11-02");
  assert.equal((await f.ok("/state", token)).xp, 25);
  assert.equal(exported.securedDailyWorkouts.length, 1);
  assert.equal(exported.securedDailyWorkouts[0].local_date, "2026-11-02");
});
