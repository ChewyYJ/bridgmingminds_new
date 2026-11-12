import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { bridgeFixture } from "./helpers/bridge-fixture.mjs";

const answer =
  "A shared garden can help neighbours meet. Caring for plants together gives people a reason to talk.";
async function fixture(t, configured = true) {
  const directory = mkdtempSync(join(tmpdir(), "bridge-api-"));
  const original = global.fetch;
  let broken = true,
    calls = 0;
  global.fetch = async (url, options) => {
    if (String(url).startsWith("http://127.0.0.1:"))
      return original(url, options);
    assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(options.body),
      supplied = JSON.parse(body.messages[1].content);
    assert.equal(
      body.response_format.json_schema.name,
      "bridgingminds_bridge_v2",
    );
    assert.equal(supplied.selfReflection, undefined);
    const raw = bridgeFixture(supplied.ANSWER, supplied.applicable_dimensions);
    calls++;
    if (broken) raw.argument_graph.edges[0].target = "missing-node";
    return Response.json({
      model: "offline-bridge-snapshot",
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(raw) } },
      ],
    });
  };
  let service, server, base;
  const options = {
    dbPath: join(directory, "test.sqlite"),
    storageDir: join(directory, "audio"),
    disableWorker: true,
    apiKey: configured ? "offline-test-key" : "",
  };
  async function boot() {
    service = createApp(options);
    server = await new Promise((resolve) => {
      const listening = service.app.listen(0, "127.0.0.1", () =>
        resolve(listening),
      );
    });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  await boot();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    global.fetch = original;
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(path, token, body, method = body ? "POST" : "GET") {
    const result = await global.fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: result.status, data: await result.json() };
  }
  const ok = async (...args) => {
    const result = await request(...args);
    assert.ok(result.status < 300, JSON.stringify(result));
    return result.data;
  };
  const guest = async () => (await ok("/auth/guest", null, {})).token;
  const submit = async (token, session) =>
    ok("/attempts", token, {
      sessionId: session.id,
      text: answer,
      selfReflection: "PRIVATE_NOTE_NOT_ASSESSMENT_EVIDENCE",
    });
  const complete = async (token, attempt) => {
    await ok(`/attempts/${attempt.id}/evaluate`, token, {});
    await service.runJobs();
    return ok(`/attempts/${attempt.id}`, token);
  };
  return {
    request,
    ok,
    guest,
    submit,
    complete,
    repair() {
      broken = false;
    },
    get calls() {
      return calls;
    },
    async restart() {
      await new Promise((resolve) => server.close(resolve));
      await service.close();
      await boot();
    },
  };
}

test("invalid BRIDGE graphs cannot commit feedback or rewards; the same saved answer recovers once", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    other = await f.guest();
  await f.ok("/daily-workout/enroll", token, {});
  const session = await f.ok("/sessions", token, {
    mode: "spin_speak",
    promptId: "society-shared-space",
  });
  assert.equal(session.assessmentFramework, "bridge-v1");
  const attempt = await f.submit(token, session);
  let saved = await f.complete(token, attempt);
  assert.equal(saved.status, "failed");
  assert.equal(saved.text, answer);
  assert.equal(saved.evaluation, undefined);
  assert.equal((await f.ok("/state", token)).xp, 0);
  assert.equal(
    (await f.request(`/attempts/${attempt.id}/thought-map`, token)).status,
    404,
  );
  assert.equal(
    (await f.request(`/attempts/${attempt.id}/thought-map`, other)).status,
    404,
  );
  f.repair();
  saved = await f.complete(token, attempt);
  assert.equal(saved.status, "completed");
  assert.equal(saved.evaluation.rubric_version, "bridge-v1");
  assert.equal(saved.evaluation.model_version, "offline-bridge-snapshot");
  assert.equal(saved.evaluation.dimensions.length, 6);
  assert.equal(saved.evaluation.dimensions[3].status, "not_assessed");
  assert.equal(saved.rewards.xp, 15);
  const map = await f.ok(`/attempts/${attempt.id}/thought-map`, token);
  assert.equal(
    map.nodes[0].quote,
    answer.slice(map.nodes[0].source_span.start, map.nodes[0].source_span.end),
  );
  assert.equal(f.calls, 2);
  await f.complete(token, attempt);
  assert.equal(f.calls, 2);
  await f.restart();
  assert.deepEqual(
    await f.ok(`/attempts/${attempt.id}/thought-map`, token),
    map,
  );
  assert.equal((await f.ok("/state", token)).xp, 15);
  const exported = await f.ok("/export", token);
  assert.deepEqual(exported.attempts[0].evaluation.thought_map, map);
  await f.ok("/account", token, undefined, "DELETE");
  assert.equal(
    (await f.request(`/attempts/${attempt.id}/thought-map`, other)).status,
    404,
  );
});

test("enrollment does not rewrite historical rubrics; new daily sessions use BRIDGE without local scores", async (t) => {
  const f = await fixture(t, false),
    token = await f.guest();
  const legacySession = await f.ok("/sessions", token, { mode: "spin_speak" });
  const legacy = await f.complete(token, await f.submit(token, legacySession));
  assert.equal(legacy.evaluation.rubric_version, "grow-spin-speak-v2");
  await f.ok("/daily-workout/enroll", token, {});
  const dailySession = await f.ok("/sessions", token, { mode: "spin_speak" });
  const daily = await f.complete(token, await f.submit(token, dailySession));
  assert.equal(daily.evaluation.rubric_version, "bridge-v1");
  assert.ok(
    daily.evaluation.dimensions.every((dimension) => dimension.level === null),
  );
  assert.equal(daily.evaluation.thought_map.status, "not_assessed");
  assert.deepEqual(
    (await f.ok(`/attempts/${legacy.id}`, token)).evaluation,
    legacy.evaluation,
  );
  assert.equal(f.calls, 0);
});
