import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server/app.mjs";
import { bridgeFixture } from "./helpers/bridge-fixture.mjs";
const answer =
  "A shared garden can bring neighbours together. Caring for plants gives people a reason to meet.";
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "learner-api-"));
  const nativeFetch = global.fetch;
  let calls = 0;
  let service, server;
  t.mock.method(global, "fetch", async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:"))
      return nativeFetch(url, options);
    assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
    calls++;
    const body = JSON.parse(options.body),
      supplied = JSON.parse(body.messages[1].content);
    const raw = bridgeFixture(supplied.ANSWER, supplied.applicable_dimensions);
    for (const dimension of raw.dimensions)
      if (dimension.status === "assessed") {
        dimension.confidence = "high";
        dimension.level = dimension.key === "R" ? 2 : 3;
      }
    return Response.json({
      model: "offline-learner-fixture",
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(raw) } },
      ],
    });
  });
  service = createApp({
    dbPath: join(dir, "db.sqlite"),
    storageDir: join(dir, "audio"),
    apiKey: "offline-learner-key",
    disableWorker: true,
  });
  server = await new Promise((resolve) => {
    const current = service.app.listen(0, "127.0.0.1", () => resolve(current));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, token, body, method = body ? "POST" : "GET") {
    const response = await nativeFetch(base + path, {
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
    await ok("/daily-workout/enroll", token, {});
    return token;
  }
  async function complete(token, promptId) {
    const session = await ok("/sessions", token, {
      mode: "spin_speak",
      ...(promptId ? { promptId } : {}),
    });
    const attempt = await ok("/attempts", token, {
      sessionId: session.id,
      text: answer,
      selfReflection: "PRIVATE_LEARNER_NOTE_NOT_EVIDENCE",
    });
    const job = await ok(`/attempts/${attempt.id}/evaluate`, token, {});
    await service.runJobs();
    return {
      session,
      attempt: await ok(`/attempts/${attempt.id}`, token),
      job: await ok(`/jobs/${job.id}`, token),
    };
  }
  return {
    ok,
    request,
    guest,
    complete,
    get db() {
      return service.db;
    },
    get calls() {
      return calls;
    },
  };
}
test("real API recommendations select a fresh targeted exercise and respect explicit category overrides", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    other = await f.guest();
  await f.complete(token, "tech-attention");
  assert.equal((await f.ok("/me/learner-profile", token)).recommendation, null);
  await f.complete(token, "tech-ai-learning");
  const profile = await f.ok("/me/learner-profile", token);
  assert.equal(profile.recommendation.dimension, "R");
  assert.ok(
    profile.recommendation.evidence.every((item) =>
      answer.includes(item.quote),
    ),
  );
  assert.equal((await f.ok("/me/learner-profile", other)).observationCount, 0);
  const explicit = await f.ok("/sessions", token, {
    mode: "spin_speak",
    topic: "Technology",
  });
  assert.equal(explicit.learningFocus, undefined);
  const focused = await f.complete(token);
  assert.equal(focused.session.learningFocus.dimension, "R");
  assert.ok(
    !["tech-attention", "tech-ai-learning"].includes(focused.session.prompt.id),
  );
  const exported = await f.ok("/export", token);
  assert.equal(exported.skillObservations.length, 18);
  assert.ok(
    exported.skillObservations
      .filter((item) => item.attempt_id === focused.attempt.id)
      .every((item) => item.data.assisted),
  );
  assert.ok(
    !JSON.stringify(exported.skillObservations).includes(
      "PRIVATE_LEARNER_NOTE",
    ),
  );
  assert.equal((await f.ok("/state", token)).xp, 15);
});
test("recommendation preferences are owned, idempotent and cannot fabricate skill observations", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    other = await f.guest();
  await f.complete(token, "tech-attention");
  await f.complete(token, "tech-ai-learning");
  const id = (await f.ok("/me/learner-profile", token)).recommendation.id;
  assert.equal(
    (await f.request("/me/learner-profile", other, { dismissId: id }, "PATCH"))
      .status,
    409,
  );
  assert.equal(
    (await f.request("/me/learner-profile", token, { level: 4 }, "PATCH"))
      .status,
    400,
  );
  await f.ok("/me/learner-profile", token, { dismissId: id }, "PATCH");
  await f.ok("/me/learner-profile", token, { dismissId: id }, "PATCH");
  await f.ok("/me/learner-profile", token, { enabled: false }, "PATCH");
  assert.equal(
    (await f.ok("/sessions", token, { mode: "spin_speak" })).learningFocus,
    undefined,
  );
  assert.equal((await f.ok("/me/learner-profile", token)).status, "paused");
});
test("observation failure rolls back feedback/rewards and history import is model-free and idempotent", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  f.db.exec(
    "CREATE TRIGGER reject_skill BEFORE INSERT ON skill_observations BEGIN SELECT RAISE(ABORT,'forced private observation failure'); END",
  );
  const failed = await f.complete(token, "tech-attention");
  assert.equal(failed.job.status, "failed");
  assert.equal(failed.attempt.evaluation, undefined);
  assert.equal((await f.ok("/state", token)).xp, 0);
  f.db.exec("DROP TRIGGER reject_skill");
  await f.ok(`/attempts/${failed.attempt.id}/evaluate`, token, {});
  const complete = await f.complete(token, "tech-ai-learning");
  assert.equal(complete.job.status, "completed");
  f.db.exec("DELETE FROM skill_observations");
  const before = f.calls;
  const imported = await f.ok("/me/learner-profile/import", token, {});
  assert.equal(imported.observationCount, 12);
  await f.ok("/me/learner-profile/import", token, {});
  assert.equal(f.calls, before);
  await f.ok("/account", token, null, "DELETE");
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM skill_observations").get().n,
    0,
  );
});
