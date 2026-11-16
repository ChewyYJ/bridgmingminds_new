import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { createPlanningBoard } from "../shared/planning-board.mjs";
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
      "bridgingminds_bridge_v3",
    );
    assert.equal(supplied.selfReflection, undefined);
    const raw = bridgeFixture(supplied.ANSWER, supplied.applicable_dimensions, supplied.PLANNING_NOTES);
    calls++;
    if (broken) {
      raw.argument_graph.edges[0].target = "missing-node";
      raw.productive_uses = [{
        word_id: "collaborate",
        source_quote: raw.argument_graph.nodes[0].source_quote,
        confidence: "high",
      }];
    }
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
    const audio = Buffer.isBuffer(body);
    const result = await global.fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": audio ? "audio/wav" : "application/json" } : {}),
      },
      body: audio ? body : body ? JSON.stringify(body) : undefined,
    });
    return { status: result.status, data: await result.json() };
  }
  const ok = async (...args) => {
    const result = await request(...args);
    assert.ok(result.status < 300, JSON.stringify(result));
    return result.data;
  };
  const guest = async () => {
    const { token } = await ok("/auth/guest", null, {});
    await ok("/me", token, { consent: { recording: true } }, "PATCH");
    return token;
  };
  const submit = async (token, session, fields = {}) => {
    const recording = session.dailySpeakingJourney
      ? await ok("/audio", token, Buffer.alloc(100, 1))
      : null;
    return ok("/attempts", token, {
      sessionId: session.id,
      text: answer,
      selfReflection: "PRIVATE_NOTE_NOT_ASSESSMENT_EVIDENCE",
      ...(recording && { responseType: "audio", audioId: recording.id }),
      ...fields,
    });
  };
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
    preflight(path, method) {
      return original(base + path, {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:8081",
          "Access-Control-Request-Method": method,
          "Access-Control-Request-Headers": "content-type",
        },
      });
    },
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

test("invalid vocabulary and a broken connection do not discard verified feedback or map branches", async (t) => {
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
  const saved = await f.complete(token, attempt);
  assert.equal(saved.status, "completed");
  assert.equal(saved.text, answer);
  assert.equal(saved.evaluation.provider, "openai");
  assert.equal(saved.evaluation.rubric_version, "bridge-v1");
  assert.equal(saved.evaluation.thought_map.status, "provisional");
  assert.equal(saved.evaluation.thought_map.validationIncomplete, true);
  assert.ok(saved.evaluation.dimensions.some((dimension) => dimension.level !== null));
  assert.deepEqual(saved.evaluation.wordbloom?.uses || [], []);
  assert.equal(saved.rewards.xp, 15);
  assert.equal((await f.ok("/state", token)).xp, 15);
  const map = await f.ok(`/attempts/${attempt.id}/thought-map`, token);
  assert.equal(map.nodes.length, 4);
  assert.equal(map.edges.length, 2);
  assert.ok(map.edges.every((edge) => edge.target !== "missing-node"));
  assert.equal(
    (await f.request(`/attempts/${attempt.id}/thought-map`, other)).status,
    404,
  );
  assert.equal(f.calls, 1);
  await f.complete(token, attempt);
  assert.equal(f.calls, 1);
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
  const dailySession = await f.ok("/sessions", token, { mode: "spin_speak", promptId: "society-shared-space" });
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

test("planning notes and map evidence persist across retries and restart", async (t) => {
  const f = await fixture(t);
  f.repair();
  const token = await f.guest();
  await f.ok("/daily-workout/enroll", token, {});
  const session = await f.ok("/sessions", token, { mode: "spin_speak", promptId: "society-shared-space" });
  const planningNotes = "Borrow tools from neighbours.";
  const boardPath = `/sessions/${session.id}/brainstorm`;
  const preflight = await f.preflight(boardPath, "PUT");
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:8081");
  assert.ok(preflight.headers.get("access-control-allow-methods")?.split(", ").includes("PUT"));
  const instant = new Date().toISOString();
  await f.ok(boardPath, token, {
    version: "daily-whiteboard-v1",
    startedAt: instant,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    notes: [{ id: "reason", x: 20, y: 20, text: "  " + planningNotes }],
    strokes: [],
    connectors: [],
    snapshot: { version: 1, savedAt: instant, elementCount: 1 },
  }, "PUT");
  const original = await f.submit(token, session);
  const saved = await f.complete(token, original);
  assert.equal(saved.planningNotes, planningNotes);
  const map = saved.evaluation.thought_map;
  assert.equal(map.comparedNotes, true);
  assert.equal(map.nodes.find((node) => node.id === "planned").quote, planningNotes);
  const retry = await f.submit(token, session, { retryOf: original.id });
  assert.equal(retry.planningNotes, planningNotes);
  await f.complete(token, retry);
  await f.restart();
  assert.deepEqual(await f.ok(`/attempts/${original.id}/thought-map`, token), map);
});

test("spoken reading reflections retain their planning notes across retries", async (t) => {
  const f = await fixture(t, false);
  const token = await f.guest();
  const feed = await f.ok("/articles", token);
  const article = (Array.isArray(feed) ? feed : feed.articles)[0];
  const session = await f.ok("/sessions", token, { mode: "read_reflect", articleId: article.id });
  const audio = await f.ok("/audio", token, Buffer.alloc(100, 1));
  const planningNotes = "My view\nA reason\nOne example";
  const planningBoard = {
    ...createPlanningBoard("My view"), mode: "draw",
    nodes: [{ id: "a", text: "A reason", shape: "box", x: 0.25, y: 0.3 }, { id: "b", text: "One example", shape: "circle", x: 0.75, y: 0.3 }],
    links: [{ id: "ab", from: "a", to: "b" }],
    strokes: [{ id: "stroke", points: [{ x: 10, y: 20 }, { x: 50, y: 60 }] }],
  };
  for (const invalid of [
    { ...planningBoard, links: [{ id: "missing", from: "a", to: "absent" }] },
    { ...planningBoard, strokes: [{ id: "outside", points: [{ x: -1, y: 0 }, { x: 1, y: 1 }] }] },
    { ...planningBoard, nodes: [...planningBoard.nodes, planningBoard.nodes[0]] },
    { ...planningBoard, strokes: Array.from({ length: 5 }, (_, i) => ({ id: String(i), points: Array.from({ length: 320 }, () => ({ x: 10, y: 20 })) })) },
  ]) assert.equal((await f.request("/attempts", token, { sessionId: session.id, responseType: "audio", audioId: audio.id, planningBoard: invalid })).status, 400);
  const attempt = await f.submit(token, session, { responseType: "audio", audioId: audio.id, planningBoard });
  const saved = await f.complete(token, attempt);
  assert.equal(saved.planningNotes, planningNotes);
  const retry = await f.submit(token, session, { responseType: "audio", audioId: audio.id, retryOf: attempt.id });
  assert.equal(retry.planningNotes, planningNotes);
  assert.deepEqual(retry.planningBoard, planningBoard);
  await f.restart();
  const restored = await f.ok(`/attempts/${attempt.id}`, token);
  assert.equal(restored.planningNotes, planningNotes);
  assert.deepEqual(restored.planningBoard, planningBoard);
});
