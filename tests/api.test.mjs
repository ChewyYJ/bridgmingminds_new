import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { localEvaluation, validateEvaluation } from "../server/evaluator.mjs";
import { serveWeb } from "../server/static.mjs";

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mind-garden-"));
  let service = createApp({
    dbPath: join(dir, "garden.sqlite"),
    storageDir: join(dir, "audio"),
    apiKey: "",
    disableWorker: true,
    ...options,
  });
  let server = await new Promise((r) => {
    const s = service.app.listen(0, "127.0.0.1", () => r(s));
  });
  let base = `http://127.0.0.1:${server.address().port}`;
  async function request(
    path,
    { token, method = "GET", body, raw, headers, ...rest } = {},
  ) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: raw || (body ? JSON.stringify(body) : undefined),
      ...rest,
    });
    let data;
    const type = response.headers.get("content-type") || "";
    if (type.includes("json")) data = await response.json();
    else data = await response.text();
    return { status: response.status, data, headers: response.headers };
  }
  async function guest() {
    const { data, status } = await request("/auth/guest", { method: "POST" });
    assert.equal(status, 200);
    return data.token;
  }
  async function session(token, mode = "spin_speak", more = {}) {
    const result = await request("/sessions", {
      token,
      method: "POST",
      body: { mode, ...more },
    });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data;
  }
  async function attempt(
    token,
    s,
    text = "I think public learning matters because people need evidence. For example, an accessible library can help. However, communities have different needs.",
    more = {},
  ) {
    const result = await request("/attempts", {
      token,
      method: "POST",
      body: { sessionId: s.id, responseType: "text", text, ...more },
    });
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
    return result.data;
  }
  async function complete(token, a) {
    const { data: job, status } = await request(`/attempts/${a.id}/evaluate`, {
      token,
      method: "POST",
      body: {},
    });
    assert.equal(status, 202, JSON.stringify(job));
    await service.runJobs();
    return (await request(`/attempts/${a.id}`, { token })).data;
  }
  t.after(async () => {
    await new Promise((r) => server.close(r));
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    get service() {
      return service;
    },
    get base() {
      return base;
    },
    request,
    guest,
    session,
    attempt,
    complete,
    dir,
    async restart(opts = {}) {
      await new Promise((r) => server.close(r));
      service.close();
      service = createApp({
        dbPath: join(dir, "garden.sqlite"),
        storageDir: join(dir, "audio"),
        apiKey: "",
        disableWorker: true,
        ...opts,
      });
      server = await new Promise((r) => {
        const s = service.app.listen(0, "127.0.0.1", () => r(s));
      });
      base = `http://127.0.0.1:${server.address().port}`;
    },
  };
}

test("new learner completes onboarding, all modes, journal, growth, and synchronized login", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  assert.equal(
    (
      await f.request("/me", {
        token,
        method: "PATCH",
        body: {
          displayName: "Maya",
          interests: ["Science", "Technology"],
          goal: "reasoning",
          timezone: "Asia/Singapore",
          onboardingComplete: true,
        },
      })
    ).status,
    200,
  );
  const spin = await f.session(token);
  const done = await f.complete(token, await f.attempt(token, spin));
  assert.equal(done.status, "completed");
  assert.equal(done.prompt, spin.prompt.question);
  assert.equal(done.evaluation.provider, "local");
  assert.equal(done.evaluation.overall_score, null);
  for (const d of done.evaluation.dimensions) {
    assert.equal(d.level, null);
    if (d.key !== "delivery") assert.ok(d.evidence_spans.length);
    for (const span of d.evidence_spans)
      assert.equal(done.text.slice(span.start, span.end), span.quote);
  }
  const list = (await f.request("/articles", { token })).data;
  assert.ok(list.length >= 6);
  const read = await f.session(token, "read_reflect", {
    articleId: list[0].id,
    questionIndex: 1,
  });
  assert.equal(read.prompt.question, list[0].questions[1]);
  assert.ok(read.articleSnapshot.contentHash);
  const reflection = await f.complete(
    token,
    await f.attempt(
      token,
      read,
      `${list[0].summary} I think this matters because we should distinguish evidence from inference. However, this source has limits.`,
    ),
  );
  assert.ok(
    reflection.evaluation.verification_flags.some((x) =>
      x.includes("only the provided summary"),
    ),
  );
  assert.equal(
    reflection.evaluation.assessment.source_scope,
    "provided_summary",
  );
  const journal = await f.request("/journal", {
    token,
    method: "POST",
    body: { attemptId: reflection.id },
  });
  assert.equal(journal.status, 201);
  assert.equal(
    (
      await f.request("/journal", {
        token,
        method: "POST",
        body: { attemptId: reflection.id },
      })
    ).data.id,
    journal.data.id,
  );
  const debate = await f.session(token, "debate", {
    position: "against",
    rounds: 2,
  });
  const first = await f.request(`/debates/${debate.id}/turn`, {
    token,
    method: "POST",
    body: {
      text: "I oppose this proposition because a blanket rule can overlook practical needs.",
      idempotencyKey: "debate-turn-one",
    },
  });
  assert.equal(first.status, 200);
  assert.equal(first.data.turns.length, 2);
  assert.ok(first.data.turns[1].text.includes("An alternative view:"));
  const last = await f.request(`/debates/${debate.id}/turn`, {
    token,
    method: "POST",
    body: {
      text: "However, I accept a limited version if there is evidence that it helps the people affected.",
      idempotencyKey: "debate-turn-two",
    },
  });
  assert.equal(last.status, 200);
  assert.equal(last.data.status, "completed");
  assert.ok(last.data.summary);
  assert.ok(last.data.attemptId);
  await f.service.runJobs();
  assert.equal(
    (await f.request(`/attempts/${last.data.attemptId}`, { token })).data
      .status,
    "completed",
  );
  assert.equal(
    (
      await f.request("/garden/plant", {
        token,
        method: "POST",
        body: { plotId: "plot-1", plantType: "daisy" },
      })
    ).status,
    200,
  );
  for (let i = 0; i < 3; i++)
    assert.equal(
      (
        await f.request("/garden/water", {
          token,
          method: "POST",
          body: { plotId: "plot-1", idempotencyKey: `watering-${i}` },
        })
      ).status,
      200,
    );
  const state = (await f.request("/state", { token })).data;
  assert.equal(state.plots[0].growth, 3);
  assert.equal(
    state.attempts.filter((a) => a.status === "completed").length,
    3,
  );
  assert.equal(state.streak, 1);
  assert.equal(state.quests.filter((q) => q.completed).length, 3);
  const signup = await f.request("/auth/register", {
    token,
    method: "POST",
    body: { email: "maya@example.test", password: "correct horse battery" },
  });
  assert.equal(signup.status, 200);
  assert.equal(signup.data.profile.id, state.profile.id);
  const login = await f.request("/auth/login", {
    method: "POST",
    body: { email: "maya@example.test", password: "correct horse battery" },
  });
  assert.equal(login.status, 200);
  assert.deepEqual(
    (await f.request("/state", { token: login.data.token })).data.plots,
    state.plots,
  );
  assert.equal(
    (
      await f.request("/auth/login", {
        method: "POST",
        body: { email: "maya@example.test", password: "wrong-password" },
      })
    ).status,
    401,
  );
});

test("idempotent concurrent evaluation, retries, duplicate content and garden transactions cannot mint resources", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const session = await f.session(token);
  const answer = await f.attempt(token, session);
  const jobs = await Promise.all(
    Array.from({ length: 8 }, () =>
      f.request(`/attempts/${answer.id}/evaluate`, {
        token,
        method: "POST",
        body: {},
      }),
    ),
  );
  assert.equal(new Set(jobs.map((j) => j.data.id)).size, 1);
  await Promise.all([f.service.runJobs(), f.service.runJobs()]);
  const before = (await f.request("/state", { token })).data;
  assert.equal(before.wallet.seeds, 2);
  assert.equal(before.wallet.water, 5);
  await f.complete(token, answer);
  assert.deepEqual(
    (await f.request("/state", { token })).data.wallet,
    before.wallet,
  );
  const duplicateSession = await f.session(token, "spin_speak", {
    promptId: session.prompt.id,
  });
  await f.complete(token, await f.attempt(token, duplicateSession));
  assert.deepEqual(
    (await f.request("/state", { token })).data.wallet,
    before.wallet,
  );
  const retry = await f.complete(
    token,
    await f.attempt(
      token,
      session,
      "My revised claim is that libraries help because they provide access. For example, they offer free reading. However, opening hours can exclude workers.",
      { retryOf: answer.id },
    ),
  );
  assert.equal(retry.rewards.sunlight, 3);
  assert.equal(retry.rewards.seeds, 0);
  const beforeSecond = (await f.request("/state", { token })).data.wallet;
  await f.complete(
    token,
    await f.attempt(token, session, undefined, { retryOf: retry.id }),
  );
  assert.deepEqual(
    (await f.request("/state", { token })).data.wallet,
    beforeSecond,
  );
  const plants = await Promise.all(
    Array.from({ length: 3 }, () =>
      f.request("/garden/plant", {
        token,
        method: "POST",
        body: { plotId: "plot-1", plantType: "daisy" },
      }),
    ),
  );
  assert.equal(plants.filter((r) => r.status === 200).length, 1);
  const waterBefore = (await f.request("/state", { token })).data.wallet.water;
  await Promise.all(
    Array.from({ length: 4 }, () =>
      f.request("/garden/water", {
        token,
        method: "POST",
        body: { plotId: "plot-1", idempotencyKey: "same-water-request" },
      }),
    ),
  );
  const after = (await f.request("/state", { token })).data;
  assert.equal(after.plots[0].growth, 1);
  assert.equal(after.wallet.water, waterBefore - 1);
});

test("authentication, cross-user isolation, secure audio, reports, export and cascading deletion", async (t) => {
  const f = await fixture(t);
  const a = await f.guest(),
    b = await f.guest();
  assert.equal((await f.request("/state")).status, 401);
  assert.equal(
    (
      await f.request("/state", {
        token: a,
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const session = await f.session(a);
  const answer = await f.complete(a, await f.attempt(a, session));
  const job = (
    await f.request(`/attempts/${answer.id}/evaluate`, {
      token: a,
      method: "POST",
      body: {},
    })
  ).data;
  for (const path of [
    `/sessions/${session.id}`,
    `/attempts/${answer.id}`,
    `/jobs/${job.id}`,
  ])
    assert.equal((await f.request(path, { token: b })).status, 404);
  assert.equal(
    (
      await f.request(`/attempts/${answer.id}/transcript`, {
        token: b,
        method: "PATCH",
        body: { text: "Another user should never change this saved answer." },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request("/journal", {
        token: b,
        method: "POST",
        body: { attemptId: answer.id },
      })
    ).status,
    404,
  );
  const sessionB = await f.session(b);
  assert.equal(
    (
      await f.request("/attempts", {
        token: b,
        method: "POST",
        body: {
          sessionId: sessionB.id,
          text: "This is a new response but must not link to another account.",
          retryOf: answer.id,
        },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request("/audio", {
        token: a,
        method: "POST",
        raw: Buffer.alloc(32),
        headers: { "Content-Type": "audio/webm" },
      })
    ).status,
    403,
  );
  await f.request("/me", {
    token: a,
    method: "PATCH",
    body: { consent: { recording: true } },
  });
  const upload = await f.request("/audio", {
    token: a,
    method: "POST",
    raw: Buffer.alloc(32, 1),
    headers: { "Content-Type": "audio/webm" },
  });
  assert.equal(upload.status, 201);
  const aid = upload.data.id;
  assert.equal((await f.request(`/audio/${aid}`, { token: b })).status, 404);
  assert.equal(
    (
      await f.request("/attempts", {
        token: b,
        method: "POST",
        body: {
          sessionId: sessionB.id,
          responseType: "audio",
          audioId: aid,
          text: "",
        },
      })
    ).status,
    404,
  );
  const url = (await f.request(`/audio/${aid}/url`, { token: a })).data.url;
  assert.equal((await f.request(url.replace("/api", ""))).status, 200);
  assert.equal(
    (await f.request(url.replace("/api", "") + "tampered")).status,
    401,
  );
  const transcription = (
    await f.request(`/audio/${aid}/transcribe`, {
      token: a,
      method: "POST",
      body: {},
    })
  ).data;
  assert.equal(transcription.requiresManualTranscription, true);
  assert.equal(
    (
      await f.request("/reports", {
        token: a,
        method: "POST",
        body: {
          attemptId: answer.id,
          reason: "I question how this reasoning was assessed.",
        },
      })
    ).status,
    200,
  );
  const exported = (await f.request("/export", { token: a })).data;
  assert.equal(exported.recordings[0].id, aid);
  assert.equal(exported.attempts.length, 1);
  assert.ok(!JSON.stringify(exported).includes("password_hash"));
  assert.ok(!JSON.stringify(exported).includes("token_hash"));
  assert.equal(
    (await f.request("/account", { token: a, method: "DELETE" })).status,
    200,
  );
  assert.equal((await f.request("/state", { token: a })).status, 401);
  assert.equal((await f.request(url.replace("/api", ""))).status, 401);
  assert.equal(readdirSync(join(f.dir, "audio")).length, 0);
  for (const table of [
    "sessions",
    "attempts",
    "jobs",
    "audio",
    "journal",
    "reports",
    "reward_ledger",
  ])
    assert.equal(
      f.service.db
        .prepare(`SELECT count(*) c FROM ${table} WHERE user_id=?`)
        .get(exported.profile.id).c,
      0,
    );
  assert.equal((await f.request("/state", { token: b })).status, 200);
});

test("evaluation failures retain the answer, reject invented quotes, and recover durable jobs after restart", async (t) => {
  const f = await fixture(t, {
    evaluator: () => {
      throw new Error("Simulated upstream timeout");
    },
  });
  const token = await f.guest();
  const session = await f.session(token);
  const answer = await f.attempt(token, session);
  const failed = await f.complete(token, answer);
  assert.equal(failed.status, "failed");
  assert.equal(failed.text, answer.text);
  assert.equal((await f.request("/state", { token })).data.wallet.seeds, 1);
  await f.restart({
    evaluator: (a, s) => {
      const result = localEvaluation(a, s);
      result.dimensions[0].evidence_spans = [
        { start: 0, end: 8, quote: "invented" },
      ];
      return result;
    },
  });
  const invalid = await f.complete(token, answer);
  assert.equal(invalid.status, "failed");
  assert.match(invalid.error, /does not match/);
  await f.restart();
  const queued = await f.request(`/attempts/${answer.id}/evaluate`, {
    token,
    method: "POST",
    body: {},
  });
  assert.equal(queued.data.status, "queued");
  f.service.db
    .prepare("UPDATE jobs SET status='processing' WHERE id=?")
    .run(queued.data.id);
  await f.restart();
  assert.equal(
    (await f.request(`/jobs/${queued.data.id}`, { token })).data.status,
    "queued",
  );
  await f.service.runJobs();
  const completed = (await f.request(`/attempts/${answer.id}`, { token })).data;
  assert.equal(completed.status, "completed");
  assert.equal(completed.text, answer.text);
  assert.equal((await f.request("/state", { token })).data.wallet.seeds, 2);
});

test("debate duplicate turns are idempotent and completed session cannot acquire extra rounds", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const s = await f.session(token, "debate", { rounds: 2 });
  const body = {
    text: "My opening position supports a narrow pilot because the evidence should be tested.",
    idempotencyKey: "opening-argument",
  };
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      f.request(`/debates/${s.id}/turn`, { token, method: "POST", body }),
    ),
  );
  assert.ok(results.some((r) => r.status === 200));
  const saved = (await f.request(`/sessions/${s.id}`, { token })).data;
  assert.equal(saved.turns.length, 2);
  assert.equal(
    (
      await f.request(`/debates/${s.id}/turn`, {
        token,
        method: "POST",
        body: {
          ...body,
          text: "A different argument must not reuse the existing request identifier.",
        },
      })
    ).status,
    409,
  );
  const lastBody = {
    text: "The strongest objection is unequal cost. However, a small pilot could expose these effects.",
    idempotencyKey: "closing-argument",
  };
  await f.request(`/debates/${s.id}/turn`, {
    token,
    method: "POST",
    body: lastBody,
  });
  const repeat = await f.request(`/debates/${s.id}/turn`, {
    token,
    method: "POST",
    body: lastBody,
  });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.data.turns.length, 4);
  assert.equal(
    (
      await f.request(`/debates/${s.id}/turn`, {
        token,
        method: "POST",
        body: { ...lastBody, idempotencyKey: "extra-argument" },
      })
    ).status,
    409,
  );
  await f.service.runJobs();
  assert.equal((await f.request("/state", { token })).data.attempts.length, 1);
});

test("daily resource caps leave practice available and reward spending never changes assessments", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const catalogue = (await f.request("/prompts?mode=spin_speak", { token }))
    .data;
  const completed = [];
  for (const prompt of catalogue.slice(0, 11)) {
    const session = await f.session(token, "spin_speak", {
      promptId: prompt.id,
    });
    completed.push({
      session,
      attempt: await f.complete(token, await f.attempt(token, session)),
    });
  }
  const state = (await f.request("/state", { token })).data;
  assert.equal(state.attempts.length, 11);
  assert.equal(state.wallet.seeds, 11); // starter seed + first ten different challenges
  assert.equal(completed[10].attempt.rewards.seeds, 0);
  const before = state.wallet.sunlight;
  for (const { session, attempt } of completed.slice(0, 4)) {
    await f.complete(
      token,
      await f.attempt(token, session, undefined, { retryOf: attempt.id }),
    );
  }
  const after = (await f.request("/state", { token })).data;
  assert.equal(after.wallet.sunlight, before + 7); // three retries * 2 and first daily retry quest
  const evaluation = completed[0].attempt.evaluation;
  await f.request("/garden/plant", {
    token,
    method: "POST",
    body: { plotId: "plot-1", plantType: "tulip" },
  });
  await f.request("/garden/decorate", {
    token,
    method: "POST",
    body: { decoration: "birdbath" },
  });
  assert.deepEqual(
    (await f.request(`/attempts/${completed[0].attempt.id}`, { token })).data
      .evaluation,
    evaluation,
  );
});

test("long valid debate rounds queue their complete transcript without widening single-answer limits", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const spin = await f.session(token);
  assert.equal(
    (
      await f.request("/attempts", {
        token,
        method: "POST",
        body: {
          sessionId: spin.id,
          responseType: "text",
          text: "x".repeat(10001),
        },
      })
    ).status,
    400,
  );
  for (const [rounds, characters] of [
    [2, 6000],
    [3, 10000],
  ]) {
    const session = await f.session(token, "debate", { rounds });
    assert.equal(
      (
        await f.request(`/debates/${session.id}/turn`, {
          token,
          method: "POST",
          body: {
            text: "x".repeat(10001),
            idempotencyKey: `oversized-${rounds}`,
          },
        })
      ).status,
      400,
    );
    const text =
      "Libraries help people learn because shared access creates opportunities. However, services need funding. "
        .repeat(100)
        .slice(0, characters);
    let saved;
    for (let round = 1; round <= rounds; round++) {
      const result = await f.request(`/debates/${session.id}/turn`, {
        token,
        method: "POST",
        body: { text, idempotencyKey: `long-${rounds}-${round}` },
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      saved = result.data;
    }
    assert.equal(saved.status, "completed");
    assert.ok(saved.jobId);
    const queued = (await f.request(`/attempts/${saved.attemptId}`, { token }))
      .data;
    assert.equal(queued.status, "queued");
    assert.equal(
      queued.text,
      Array.from(
        { length: rounds },
        (_, i) => `Round ${i + 1}: ${text.trim()}`,
      ).join("\n\n"),
    );
    assert.ok(queued.text.length > 10000);
    await f.service.runJobs();
    const completed = (
      await f.request(`/attempts/${saved.attemptId}`, { token })
    ).data;
    assert.equal(completed.status, "completed");
    assert.equal(completed.text, queued.text);
    assert.equal(
      (await f.request(`/jobs/${saved.jobId}`, { token })).data.status,
      "completed",
    );
    for (const dimension of completed.evaluation.dimensions)
      for (const span of dimension.evidence_spans)
        assert.equal(completed.text.slice(span.start, span.end), span.quote);
  }
});

test("practice rhythm includes rewarded and unrewarded retries, uses local Monday weeks and handles DST", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-01T05:30:00Z"),
  });
  const f = await fixture(t);
  const token = await f.guest();
  await f.request("/me", {
    token,
    method: "PATCH",
    body: { timezone: "America/New_York" },
  });
  const session = await f.session(token);
  const original = await f.complete(token, await f.attempt(token, session));
  // Both instants are 01:30 on the fall-back Sunday and count as one date.
  t.mock.timers.setTime(new Date("2026-11-01T06:30:00Z").getTime());
  const firstRetry = await f.complete(
    token,
    await f.attempt(token, session, undefined, { retryOf: original.id }),
  );
  const sunday = (await f.request("/state", { token })).data;
  assert.deepEqual(sunday.practiceWeek, {
    day: "2026-11-01",
    timezone: "America/New_York",
    days: ["2026-11-01"],
    target: 3,
  });
  assert.equal(sunday.streak, 1);
  assert.deepEqual(sunday.quests.find((q) => q.mode === "retry").reward, {
    seeds: 0,
    water: 1,
    sunlight: 1,
    xp: 10,
  });
  // Monday UTC is still Sunday locally; the week must not reset prematurely.
  t.mock.timers.setTime(new Date("2026-11-02T04:30:00Z").getTime());
  assert.deepEqual(
    (await f.request("/state", { token })).data.practiceWeek,
    sunday.practiceWeek,
  );
  t.mock.timers.setTime(new Date("2026-11-02T05:15:00Z").getTime());
  const mondayRetry = await f.complete(
    token,
    await f.attempt(token, session, undefined, { retryOf: firstRetry.id }),
  );
  const monday = (await f.request("/state", { token })).data;
  assert.equal(mondayRetry.rewards.seeds, 0);
  assert.equal(mondayRetry.rewards.sunlight, 1); // Existing first daily quest only.
  assert.equal(mondayRetry.rewards.xp, 10);
  assert.deepEqual(monday.practiceWeek.days, ["2026-11-02"]);
  assert.equal(monday.streak, 2);
  t.mock.timers.setTime(new Date("2026-11-03T05:15:00Z").getTime());
  await f.complete(
    token,
    await f.attempt(token, session, undefined, { retryOf: mondayRetry.id }),
  );
  const duplicate = await f.complete(
    token,
    await f.attempt(token, session, undefined, { retryOf: mondayRetry.id }),
  );
  assert.equal(duplicate.rewards.xp, 0);
  const tuesday = (await f.request("/state", { token })).data;
  assert.deepEqual(tuesday.practiceWeek.days, ["2026-11-02", "2026-11-03"]);
  assert.equal(tuesday.streak, 3);
  // Persist a future completion, then verify it cannot inflate today's count.
  t.mock.timers.setTime(new Date("2026-11-04T05:15:00Z").getTime());
  await f.complete(
    token,
    await f.attempt(token, session, undefined, { retryOf: mondayRetry.id }),
  );
  t.mock.timers.setTime(new Date("2026-11-03T05:15:00Z").getTime());
  assert.deepEqual(
    (await f.request("/state", { token })).data.practiceWeek,
    tuesday.practiceWeek,
  );
  assert.equal((await f.request("/state", { token })).data.streak, 3);
  await f.restart();
  assert.deepEqual(
    (await f.request("/export", { token })).data.practiceWeek,
    tuesday.practiceWeek,
  );
  t.mock.timers.setTime(new Date("2026-11-09T05:15:00Z").getTime());
  const nextWeek = (await f.request("/state", { token })).data;
  assert.deepEqual(nextWeek.practiceWeek.days, []);
  assert.equal(nextWeek.practiceWeek.day, "2026-11-09");
  assert.equal(nextWeek.streak, 0);
});

test("comparable analytics keep coaching templates and providers in separate groups", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const session = await f.session(token);
  const original = await f.complete(token, await f.attempt(token, session));
  const profile = (await f.request("/me", { token })).data;
  for (const [index, template] of [
    "template-a",
    "template-a",
    "template-a",
    "template-b",
  ].entries()) {
    const attempt = {
      ...original,
      id: crypto.randomUUID(),
      evaluation: {
        ...original.evaluation,
        provider: "openai",
        model_version: "configured-model",
        prompt_template_version: template,
      },
    };
    f.service.db
      .prepare("INSERT INTO attempts VALUES(?,?,?,?,?)")
      .run(
        attempt.id,
        profile.id,
        session.id,
        JSON.stringify(attempt),
        `2026-01-0${index + 1}T12:00:00Z`,
      );
  }
  const analytics = (await f.request("/profile/analytics", { token })).data;
  assert.deepEqual(
    analytics.groups.map((group) => group.count).sort(),
    [1, 1, 3],
  );
  assert.equal(
    analytics.groups.filter((group) => !group.insufficientData).length,
    1,
  );
  assert.ok(analytics.groups.every((group) => !group.eligibleForComparison));
  assert.ok(
    analytics.groups.every((group) => group.ratingStatus === "unvalidated"),
  );
  assert.ok(
    analytics.groups.some(
      (group) => group.key.includes("template-a") && group.count === 3,
    ),
  );
  assert.ok(
    analytics.groups.some(
      (group) => group.key.includes("template-b") && group.count === 1,
    ),
  );
  assert.ok(
    analytics.groups.some(
      (group) => group.key.includes("local") && group.count === 1,
    ),
  );
});

test("browser sessions use HttpOnly cookies, reject missing mutation origins and expire", async (t) => {
  const f = await fixture(t);
  const result = await f.request("/auth/guest", {
    method: "POST",
    headers: { Origin: "http://localhost:8081" },
  });
  const cookie = result.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const headers = { Cookie: cookie.split(";")[0] };
  assert.equal((await f.request("/me", { headers })).status, 200);
  assert.equal(
    (
      await f.request("/me", {
        method: "PATCH",
        headers,
        body: { displayName: "Browser learner" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request("/me", {
        method: "PATCH",
        headers: { ...headers, Origin: "http://localhost:8081" },
        body: { displayName: "Browser learner" },
      })
    ).status,
    200,
  );
  const stored = f.service.db
    .prepare("SELECT token_hash FROM auth_sessions")
    .get();
  assert.notEqual(stored.token_hash, result.data.token);
  f.service.db
    .prepare("UPDATE auth_sessions SET expires_at='2000-01-01T00:00:00.000Z'")
    .run();
  assert.equal((await f.request("/me", { headers })).status, 401);
});

test("exported web hosting exposes only dist and rejects malformed URL decoder input", async (t) => {
  const f = await fixture(t);
  const dist = join(f.dir, "dist");
  mkdirSync(dist);
  writeFileSync(join(dist, "index.html"), "<!doctype html><h1>Garden app</h1>");
  writeFileSync(join(dist, "app.js"), "window.gardenReady=true;");
  writeFileSync(join(f.dir, "secret.txt"), "private-server-material");
  assert.equal(serveWeb(f.service.app, dist), true);
  const index = await fetch(f.base + "/garden", {
    headers: { Accept: "text/html" },
  });
  assert.equal(index.status, 200);
  assert.match(await index.text(), /Garden app/);
  const script = await fetch(f.base + "/app.js");
  assert.match(await script.text(), /gardenReady/);
  const privateFile = await fetch(f.base + "/secret.txt");
  assert.ok(!(await privateFile.text()).includes("private-server-material"));
  assert.equal((await fetch(f.base + "/api/missing")).status, 401);
  assert.equal((await f.request("/health?bad=%FF")).status, 400);
  assert.equal(
    (await f.request("/health?bad=" + "a".repeat(5000))).status,
    414,
  );
});

test("maximum-length Unicode answers get bounded exact quotes without inventing sentence structure", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const session = await f.session(token);
  // The first emoji crosses the original 800-unit boundary. This is one sentence,
  // even though producing compact evidence requires several chunks.
  const prefix =
    "a".repeat(799) +
    "🌱 because evidence could improve this claim however circumstances differ ";
  const text =
    prefix +
    "🌻".repeat(Math.floor((10000 - prefix.length) / 2)) +
    ((10000 - prefix.length) % 2 ? "x" : "");
  assert.equal(text.length, 10000);
  assert.ok(text.isWellFormed());
  const completed = await f.complete(
    token,
    await f.attempt(token, session, text),
  );
  assert.equal(completed.status, "completed");
  assert.equal(completed.text, text);
  assert.equal(
    completed.evaluation.dimensions.find((d) => d.key === "organised").level,
    null,
  );
  assert.equal(
    completed.evaluation.dimensions.find((d) => d.key === "reasoned").level,
    null,
  );
  assert.equal(completed.evaluation.model_version, "local-review-prompts-v3");
  for (const dimension of completed.evaluation.dimensions) {
    for (const span of dimension.evidence_spans) {
      assert.ok(span.quote.length <= 800);
      assert.ok(span.end <= text.length);
      assert.equal(text.slice(span.start, span.end), span.quote);
      assert.ok(
        span.quote.isWellFormed(),
        "An evidence quote must not split an emoji surrogate pair",
      );
    }
  }
  const longWords =
    "A nuanced viewpoint because context matters however evidence has limits "
      .repeat(200)
      .slice(0, 10000)
      .trim();
  const second = await f.complete(
    token,
    await f.attempt(token, session, longWords),
  );
  assert.equal(second.status, "completed");
  assert.equal(
    second.evaluation.dimensions.find((d) => d.key === "organised").level,
    null,
  );
  // Zod measures its current string limit in Unicode code points, whereas quote
  // indices deliberately remain UTF-16 offsets. Exercise that larger byte size.
  const unicodePrefix = "Because context matters however evidence differs ";
  const unicodeMaximum =
    unicodePrefix + "🌱".repeat(10000 - [...unicodePrefix].length);
  assert.equal([...unicodeMaximum].length, 10000);
  const unicodeAnswer = await f.complete(
    token,
    await f.attempt(token, session, unicodeMaximum),
  );
  assert.equal(unicodeAnswer.status, "completed");
  for (const dimension of unicodeAnswer.evaluation.dimensions) {
    for (const span of dimension.evidence_spans) {
      assert.ok(span.quote.length <= 800);
      assert.ok(span.quote.isWellFormed());
      assert.equal(unicodeMaximum.slice(span.start, span.end), span.quote);
    }
  }
});

test("evidence beyond the saved answer is rejected even when slice would truncate it", () => {
  const attempt = {
    id: "quote-test",
    mode: "spin_speak",
    text: "I think a small trial helps because it tests an assumption.",
  };
  const evaluation = localEvaluation(attempt, {});
  evaluation.dimensions[0].evidence_spans = [
    { start: 0, end: attempt.text.length + 100, quote: attempt.text },
  ];
  assert.throws(
    () => validateEvaluation(evaluation, attempt),
    /does not match your saved answer/,
  );
});

test("empty drafts are rejected while unusable repetitions receive honest N/A feedback", async (t) => {
  const f = await fixture(t);
  const token = await f.guest();
  const session = await f.session(token);
  for (const text of ["", "                    "]) {
    assert.equal(
      (
        await f.request("/attempts", {
          token,
          method: "POST",
          body: { sessionId: session.id, responseType: "text", text },
        })
      ).status,
      400,
    );
  }
  for (const text of [
    "..............",
    "because because because because",
    "aaaaaaaaaaaaaaaaaaaa",
    "🌱🌱🌱🌱🌱🌱🌱🌱🌱🌱",
  ]) {
    const completed = await f.complete(
      token,
      await f.attempt(token, session, text),
    );
    assert.equal(completed.status, "completed");
    assert.ok(completed.evaluation.dimensions.every((d) => d.level === null));
    assert.ok(
      completed.evaluation.dimensions.every(
        (d) => d.evidence_spans.length === 0,
      ),
    );
    assert.equal(completed.evaluation.needs_review, true);
    assert.match(completed.evaluation.key_takeaway, /one idea/);
  }
});

test("static assets do not consume the API rate budget, while API bursts remain limited", async (t) => {
  const f = await fixture(t);
  const web = join(f.dir, "web");
  mkdirSync(web);
  writeFileSync(join(web, "index.html"), "<html><body>Garden</body></html>");
  writeFileSync(
    join(web, "icon.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  serveWeb(f.service.app, web);
  for (let i = 0; i < 350; i++) {
    const asset = await fetch(f.base + "/icon.svg");
    assert.equal(asset.status, 200);
    await asset.text();
  }
  assert.equal((await f.request("/state")).status, 401);
  for (let i = 0; i < 299; i++)
    assert.equal((await f.request("/health")).status, 200);
  assert.equal((await f.request("/health")).status, 429);
});

test("today news endpoint requires authentication and uses each account’s saved timezone", async (t) => {
  const requests = [];
  const f = await fixture(t, {
    newsService: {
      async getFeed({ timezone }) {
        requests.push(timezone);
        return {
          articles: [],
          fetchedAt: "2026-10-13T00:30:00.000Z",
          day: timezone === "America/Los_Angeles" ? "2026-10-12" : "2026-10-13",
          timezone,
          status: "ok",
        };
      },
    },
  });
  assert.equal((await f.request("/news")).status, 401);
  assert.equal(requests.length, 0);
  const token = await f.guest();
  const other = await f.guest();
  await f.request("/me", {
    token,
    method: "PATCH",
    body: { timezone: "America/Los_Angeles" },
  });
  await f.request("/me", {
    token: other,
    method: "PATCH",
    body: { timezone: "Asia/Singapore" },
  });
  const first = await f.request("/news?timezone=Asia/Singapore", { token });
  assert.equal(first.status, 200);
  assert.equal(first.data.timezone, "America/Los_Angeles");
  assert.equal(first.data.day, "2026-10-12");
  const second = await f.request("/news", { token: other });
  assert.equal(second.data.timezone, "Asia/Singapore");
  assert.equal(second.data.day, "2026-10-13");
  assert.deepEqual(requests, ["America/Los_Angeles", "Asia/Singapore"]);
});

test("local background worker completes a queued practice without manual polling work", async (t) => {
  const f = await fixture(t, { disableWorker: false, jobDelay: 5 });
  const token = await f.guest();
  const session = await f.session(token);
  const attempt = await f.attempt(token, session);
  const queued = await f.request(`/attempts/${attempt.id}/evaluate`, {
    token,
    method: "POST",
    body: {},
  });
  assert.equal(queued.status, 202);
  const deadline = Date.now() + 3000;
  let saved;
  do {
    saved = await f.request(`/attempts/${attempt.id}`, { token });
    if (saved.data.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < deadline);
  assert.equal(saved.data.status, "completed");
  assert.ok(saved.data.evaluation);
  assert.equal(saved.data.rewards.xp, 30);
});
