import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { prompts } from "../server/content.mjs";
import { silentWav } from "./helpers/silent-wav.mjs";
import {
  speechCapabilities,
  normalizeSpeechResult,
} from "../server/speech-assessment.mjs";
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "reading-speech-"));
  let service,
    server,
    base,
    calls = 0,
    behavior = "success",
    clock = "2026-11-12T08:00:00.000Z",
    release,
    entered;
  const options = {
    dbPath: join(directory, "db.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: "",
    disableWorker: true,
    dailyNow: () => new Date(clock),
    decodeSpeechAudio: async () => ({
      pcm: Buffer.alloc(32000),
      durationMs: 1000,
    }),
    speechProvider: {
      capabilities: (locale) =>
        speechCapabilities({ configured: true, locale }),
      assess: async ({ referenceText, locale, prosody }) => {
        calls++;
        if (behavior === "fail")
          throw Object.assign(new Error("SECRET provider response"), {
            code: "speech_provider",
          });
        if (behavior === "wait")
          await new Promise((resolve) => {
            release = resolve;
            entered?.();
          });
        const word = referenceText.includes("collaborate")
          ? "collaborate"
          : referenceText.match(/[\p{L}\p{N}]+/u)[0];
        return normalizeSpeechResult({
          segments: [
            {
              RecognitionStatus: "Success",
              Offset: 0,
              Duration: 10000000,
              NBest: [
                {
                  Confidence: 0.9,
                  Display: word,
                  PronunciationAssessment: {
                    AccuracyScore: behavior === "stable" ? 90 : 83,
                    FluencyScore: 77,
                  },
                  Words: [
                    {
                      Word: word,
                      Offset: 0,
                      Duration: 5000000,
                      PronunciationAssessment: {
                        AccuracyScore: behavior === "stable" ? 90 : 83,
                        ErrorType: "None",
                      },
                    },
                  ],
                },
              ],
            },
          ],
          referenceText,
          locale,
          prosodyRequested: prosody,
          sdkVersion: "offline-fixture",
          audioDurationMs: 1000,
        });
      },
    },
  };
  async function boot() {
    service = createApp(options);
    server = await new Promise((resolve) => {
      const s = service.app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  await boot();
  t.after(async () => {
    release?.();
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(
    path,
    token,
    body,
    method = body ? "POST" : "GET",
    raw,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body || raw
          ? { "Content-Type": raw ? "audio/wav" : "application/json" }
          : {}),
      },
      body: raw || (body ? JSON.stringify(body) : undefined),
    });
    return { status: response.status, data: await response.json() };
  }
  async function ok(...args) {
    const r = await request(...args);
    assert.ok(r.status < 300, JSON.stringify(r));
    return r.data;
  }
  async function guest() {
    const { token } = await ok("/auth/guest", null, {});
    await ok(
      "/me",
      token,
      { onboardingComplete: true, consent: { recording: true } },
      "PATCH",
    );
    await ok("/daily-workout/enroll", token, {});
    return token;
  }
  async function reading(token, audio = true) {
    const assignment = await ok("/read-aloud/assignment", token);
    const upload = audio
      ? await ok("/audio", token, null, "POST", silentWav())
      : null;
    return ok(`/read-aloud/assignments/${assignment.id}/submit`, token, {
      idempotencyKey: randomUUID(),
      notes: "I practised the final sentence and noticed a comfortable pause.",
      selfReviewConfirmed: true,
      ...(upload ? { audioId: upload.id } : {}),
    });
  }
  const enqueue = (token, id, extra = {}) =>
    ok(`/read-aloud/attempts/${id}/speech-assessment`, token, {
      locale: "en-US",
      processingConsent: true,
      ...extra,
    });
  return {
    ok,
    request,
    guest,
    reading,
    spin: async (token) => {
      const session = await ok("/sessions", token, {
        mode: "spin_speak",
        promptId: prompts.find((p) => p.mode === "spin_speak").id,
      });
      const upload = await ok(
        "/audio",
        token,
        null,
        "POST",
        silentWav(),
      );
      const attempt = await ok("/attempts", token, {
        sessionId: session.id,
        responseType: "audio",
        audioId: upload.id,
        text: "We could work together on a shared garden. Each neighbour could suggest a plant.",
      });
      await ok(`/attempts/${attempt.id}/evaluate`, token, {});
      await service.runJobs();
      // Seed a validated-script fixture, then explicitly select vocabulary using
      // the current daily flow. Daily feedback no longer auto-adds words.
      const stored = service.db
        .prepare("SELECT data FROM attempts WHERE id=?")
        .get(attempt.id);
      const completed = JSON.parse(stored.data);
      completed.dailyScript = {
        text: "Neighbours can collaborate on a shared garden.",
        vocabulary: [{ wordId: "collaborate" }],
      };
      service.db
        .prepare("UPDATE attempts SET data=? WHERE id=?")
        .run(JSON.stringify(completed), attempt.id);
      await ok(`/attempts/${attempt.id}/vocabulary`, token, {
        wordIds: ["collaborate"],
      });
    },
    enqueue,
    async assertReadingRewards(token, count = 1) {
      const ledger = (await ok("/export", token)).gamificationData.ledger
        .filter(item => item.activity_type === "read_aloud");
      assert.equal(ledger.length, count, "speech jobs must not mint separate reading rewards");
      assert.equal(ledger.reduce((total, row) => total + row.coins_delta, 0), count * 3);
      assert.equal(ledger.reduce((total, row) => total + row.xp_delta, 0), 0);
    },
    get calls() {
      return calls;
    },
    get db() {
      return service.db;
    },
    run: () => service.runJobs(),
    setTime(value) {
      clock = value;
    },
    behavior(value) {
      behavior = value;
    },
    wait: () =>
      new Promise((resolve) => {
        entered = resolve;
      }),
    release: () => release?.(),
    restart: async () => {
      await new Promise((resolve) => server.close(resolve));
      await service.close();
      await boot();
    },
  };
}
test("explicit acoustic assessment persists once, survives restart/export and changes no daily rewards", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    attempt = await f.reading(token);
  const jobs = await Promise.all([
    f.enqueue(token, attempt.id),
    f.enqueue(token, attempt.id),
  ]);
  assert.equal(jobs[0].id, jobs[1].id);
  await Promise.all([f.run(), f.run()]);
  assert.equal(f.calls, 1);
  const job = await f.ok(`/read-aloud/speech-jobs/${jobs[0].id}`, token);
  assert.equal(job.status, "completed");
  assert.equal(job.result.utterances[0].metrics.accuracy, 83);
  const saved = await f.ok(`/attempts/${attempt.id}`, token);
  assert.equal(saved.evaluation.provider, "self_review");
  assert.equal(saved.speechAssessment.status, "assessed");
  assert.equal((await f.ok("/state", token)).xp, 0);
  await f.assertReadingRewards(token);
  await f.enqueue(token, attempt.id);
  await f.run();
  assert.equal(f.calls, 1);
  await f.restart();
  assert.equal(
    (await f.ok(`/read-aloud/attempts/${attempt.id}/speech-assessment`, token))
      .status,
    "completed",
  );
  const exported = await f.ok("/export", token);
  assert.equal(exported.speechJobs.length, 1);
  assert.equal(exported.speechJobs[0].data.result.provider, "azure");
  await f.ok("/account", token, null, "DELETE");
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM speech_jobs").get().n,
    0,
  );
});
test("jobs recover from queued restart, preserve pinned settings and enforce account boundaries", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    other = await f.guest(),
    attempt = await f.reading(token),
    job = await f.enqueue(token, attempt.id);
  assert.equal(
    (await f.request(`/read-aloud/speech-jobs/${job.id}`, other)).status,
    404,
  );
  assert.equal(
    (
      await f.request(
        `/read-aloud/attempts/${attempt.id}/speech-assessment`,
        other,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request(
        `/read-aloud/attempts/${attempt.id}/speech-assessment`,
        other,
        { locale: "en-US", processingConsent: true },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request(
        `/read-aloud/attempts/${attempt.id}/speech-assessment`,
        token,
        { locale: "en-GB", processingConsent: true },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request(
        `/read-aloud/attempts/${attempt.id}/speech-assessment`,
        token,
        { locale: "en-US", processingConsent: false },
      )
    ).status,
    400,
  );
  await f.restart();
  await f.run();
  assert.equal(
    (await f.ok(`/read-aloud/speech-jobs/${job.id}`, token)).status,
    "completed",
  );
  assert.equal(f.calls, 1);
});
test("provider failures remain explicit and retry the same job without duplicating XP", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    attempt = await f.reading(token);
  f.behavior("fail");
  const job = await f.enqueue(token, attempt.id);
  await f.run();
  const failed = await f.ok(`/read-aloud/speech-jobs/${job.id}`, token);
  assert.equal(failed.status, "failed");
  assert.ok(!JSON.stringify(failed).includes("SECRET"));
  assert.equal(
    (await f.ok(`/attempts/${attempt.id}`, token)).speechAssessment,
    undefined,
  );
  f.behavior("success");
  assert.equal((await f.enqueue(token, attempt.id)).id, job.id);
  await f.run();
  assert.equal(f.calls, 2);
  assert.equal((await f.ok("/state", token)).xp, 0);
  await f.assertReadingRewards(token);
  const noAudio = await f.reading(token, false);
  assert.equal(
    (
      await f.request(
        `/read-aloud/attempts/${noAudio.id}/speech-assessment`,
        token,
        { locale: "en-US", processingConsent: true },
      )
    ).status,
    409,
  );
});
test("withdrawn recording consent during processing prevents result persistence", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    attempt = await f.reading(token);
  f.behavior("wait");
  const job = await f.enqueue(token, attempt.id);
  const entered = f.wait(),
    running = f.run();
  await entered;
  await f.ok("/me", token, { consent: { recording: false } }, "PATCH");
  f.release();
  await running;
  assert.equal(
    (await f.ok(`/read-aloud/speech-jobs/${job.id}`, token)).status,
    "failed",
  );
  assert.equal(
    (await f.ok(`/attempts/${attempt.id}`, token)).speechAssessment,
    undefined,
  );
  assert.equal((await f.ok("/state", token)).xp, 0);
  await f.assertReadingRewards(token);
});

test("repeated provider failures stop at the retry cap without minting rewards", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    attempt = await f.reading(token);
  f.behavior("fail");
  for (let index = 0; index < 3; index++) {
    await f.enqueue(token, attempt.id);
    await f.run();
  }
  assert.equal(f.calls, 3);
  assert.equal(
    (
      await f.request(
        `/read-aloud/attempts/${attempt.id}/speech-assessment`,
        token,
        { locale: "en-US", processingConsent: true },
      )
    ).status,
    429,
  );
  assert.equal((await f.ok("/state", token)).xp, 0);
  await f.assertReadingRewards(token);
});
test("account deletion while a provider is processing cannot resurrect assessments or jobs", async (t) => {
  const f = await fixture(t),
    token = await f.guest(),
    attempt = await f.reading(token);
  f.behavior("wait");
  await f.enqueue(token, attempt.id);
  const entered = f.wait(),
    running = f.run();
  await entered;
  await f.ok("/account", token, null, "DELETE");
  f.release();
  await running;
  assert.equal(
    f.db.prepare("SELECT count(*) AS n FROM speech_jobs").get().n,
    0,
  );
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM attempts").get().n, 0);
});

test("WordBloom pronunciation observations commit with speech feedback while rewards and self-reports remain separate", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  await f.spin(token);
  const attempt = await f.reading(token),
    job = await f.enqueue(token, attempt.id);
  await f.run();
  const completed = await f.ok(`/read-aloud/speech-jobs/${job.id}`, token);
  assert.equal(
    completed.wordBloomReview.words[0].observationStatus,
    "observed",
  );
  assert.equal(completed.wordBloomReview.words[0].action, "unchanged");
  const exported = await f.ok("/export", token);
  assert.equal(exported.wordBloom.pronunciationObservations.length, 1);
  assert.equal(
    exported.wordBloom.observations.filter(
      (item) => item.kind === "reading_self_review",
    ).length,
    1,
  );
  assert.equal((await f.ok("/state", token)).xp, 15);
  await f.assertReadingRewards(token);
  await f.enqueue(token, attempt.id);
  await f.run();
  assert.equal(
    (await f.ok("/export", token)).wordBloom.pronunciationObservations.length,
    1,
  );
  assert.equal(f.calls, 1);
});
test("a vocabulary observation write failure rolls back the acoustic result and retry recovers the same job", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  await f.spin(token);
  const attempt = await f.reading(token),
    job = await f.enqueue(token, attempt.id);
  f.db.exec(
    "CREATE TRIGGER reject_pronunciation BEFORE INSERT ON vocabulary_pronunciation BEGIN SELECT RAISE(ABORT,'forced private write failure'); END",
  );
  await f.run();
  assert.equal(
    (await f.ok(`/read-aloud/speech-jobs/${job.id}`, token)).status,
    "failed",
  );
  assert.equal(
    (await f.ok(`/attempts/${attempt.id}`, token)).speechAssessment,
    undefined,
  );
  assert.equal(
    (await f.ok("/export", token)).wordBloom.pronunciationObservations.length,
    0,
  );
  assert.equal((await f.ok("/state", token)).xp, 15);
  await f.assertReadingRewards(token);
  f.db.exec("DROP TRIGGER reject_pronunciation");
  await f.enqueue(token, attempt.id);
  await f.run();
  assert.equal(
    (await f.ok(`/read-aloud/speech-jobs/${job.id}`, token)).status,
    "completed",
  );
  assert.equal(
    (await f.ok("/export", token)).wordBloom.pronunciationObservations.length,
    1,
  );
  assert.equal(f.calls, 2);
  assert.equal((await f.ok("/state", token)).xp, 15);
  await f.assertReadingRewards(token);
});

test("separate days of stable reading observations adjust WordBloom intervals through the real job API", async (t) => {
  const f = await fixture(t),
    token = await f.guest();
  await f.spin(token);
  f.behavior("stable");
  const first = await f.reading(token),
    firstJob = await f.enqueue(token, first.id);
  await f.run();
  assert.equal(
    (await f.ok(`/read-aloud/speech-jobs/${firstJob.id}`, token))
      .wordBloomReview.words[0].action,
    "unchanged",
  );
  f.setTime("2026-11-16T08:00:00.000Z");
  const second = await f.reading(token),
    secondJob = await f.enqueue(token, second.id);
  await f.run();
  assert.equal(
    (await f.ok(`/read-aloud/speech-jobs/${secondJob.id}`, token))
      .wordBloomReview.words[0].action,
    "review_later",
  );
  const word = (await f.ok("/wordbloom/summary", token)).words[0];
  assert.equal(word.intervalDays, 6);
  assert.equal(word.exposureCount, 2);
  assert.equal(word.productiveUseCandidates, 0);
  assert.equal((await f.ok("/state", token)).xp, 15);
  await f.assertReadingRewards(token, 2);
});
