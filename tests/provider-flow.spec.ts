import { continueWithoutReflection } from "./helpers/self-reflection";
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

// All ratings/transcripts are synthetic transport fixtures. Assertions establish
// UI → real API/SQLite → stub transport → UI integrity, not AI scoring accuracy.
const origin = "http://localhost:3003";
const fixtureHeaders = {
  "X-Offline-Fixture": "mindgarden-offline-fixture-only",
};
const answer =
  "A small trial can help test a proposal because we can compare outcomes before wider use. For example, ask the people affected and record both benefits and costs. However, one trial may not represent everyone.";
const answerEvidence =
  "For example, ask the people affected and record both benefits and costs.";
const evidencePrefix = "I need more evidence.\n🌱 ";
const interiorEvidence =
  "A small trial may reveal who benefits, but it cannot represent every community.";
const unicodeAnswer = `${evidencePrefix}${interiorEvidence}\nI need more evidence. That is why I would ask what could change the result.`;
const transcript =
  "A small trial can help us compare outcomes before a wider change. We should include people affected by the decision and explain the limits of the evidence.";
const challenger =
  "A small trial may miss people whose circumstances differ from the initial participants. What result would lead you to revise your proposal?";
const privateReflection =
  "PRIVATE_SELF_REFLECTION_ONLY_MARKER: Next time I could pause and use a clearer example.";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const externalRequests = new WeakMap<Page, string[]>();
const runtimeErrors = new WeakMap<Page, string[]>();

async function fixtureStatus(page: Page) {
  const response = await page.request.get(`${origin}/__offline_ai/status`, {
    headers: fixtureHeaders,
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.fixture).toBe("mindgarden-offline-provider");
  expect(result.network).toBe("blocked");
  expect(result.unexpected).toEqual([]);
  return result;
}
async function state(page: Page) {
  const response = await page.request.get(`${origin}/api/state`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function persisted(page: Page, id: string) {
  const response = await page.request.get(
    `${origin}/__offline_ai/persisted/${id}`,
    { headers: fixtureHeaders },
  );
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function onboard(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill(name);
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Spin & Speak", exact: true }),
  ).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page
    .getByRole("button", { name: `Navigate to ${name}`, exact: true })
    .or(page.getByRole("button", { name, exact: true }))
    .or(page.getByRole("tab", { name, exact: true }))
    .or(page.getByRole("link", { name, exact: true }))
    .first()
    .click();
}
async function startSpeaking(page: Page) {
  await page.getByRole("button", { name: "Spin & Speak", exact: true }).click();
  await page
    .getByRole("button", { name: "Spin a prompt", exact: true })
    .click();
  await page.getByRole("button", { name: "Skip prep", exact: true }).click();
}
async function reopenAudioDraft(page: Page) {
  await page.reload();
  await page
    .getByRole("button", { name: "Continue response", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue this response", exact: true })
    .click();
  await expect(page.getByTestId("self-reflection")).toBeVisible();
}
async function aiFeedback(page: Page, mode: string, savedText: string) {
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible({ timeout: 25_000 });
  await expect(
    page.getByText("Provisional AI feedback", { exact: true }),
  ).toBeVisible();
  const current = await state(page);
  const attempt = current.attempts.find(
    (item: any) =>
      item.mode === mode &&
      item.text === savedText &&
      item.status === "completed",
  );
  expect(attempt).toBeTruthy();
  expect(attempt.evaluation.provider).toBe("openai");
  expect(attempt.evaluation.model_version).toBe("gpt-6-luna-offline-fixture");
  expect(attempt.evaluation.assessment.validation_status).toBe("unvalidated");
  expect(attempt.evaluation.assessment.scoring_method).toBe("llm_rubric");
  expect(attempt.evaluation.overall_score).toBeNull();
  const support = attempt.evaluation.dimensions.find(
    (item: any) => item.key === "grounded",
  );
  expect(support.level).toBe(2);
  await page.getByTestId("grow-dimension-grounded").click();
  for (const [index, span] of support.evidence_spans.entries()) {
    expect(savedText.slice(span.start, span.end)).toBe(span.quote);
    await expect(
      page.getByTestId(`grow-evidence-grounded-${index}`),
    ).toHaveText(`“${span.quote}”`);
  }
  await page.getByTestId("grow-dimension-grounded").click();
  const saved = await persisted(page, attempt.id);
  expect(saved.attempt.text).toBe(savedText);
  expect(saved.attempt.evaluation).toEqual(attempt.evaluation);
  expect(saved.job.status).toBe("completed");
  expect(JSON.stringify(current)).not.toContain(
    "e2e-offline-key-not-a-real-credential",
  );
  return attempt;
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.metadata.providerFixture !== true,
    "Run only with tests/e2e-ai.config.ts and its offline provider fixture.",
  );
  const blocked: string[] = [];
  externalRequests.set(page, blocked);
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ["data:", "blob:"].includes(url.protocol))
      return route.continue();
    blocked.push(`${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await fixtureStatus(page);
  const health = await (await page.request.get(`${origin}/api/health`)).json();
  expect(health.ai).toMatchObject({
    mode: "openai",
    configured: true,
    configValid: true,
    liveVerified: false,
    models: { text: "gpt-6-luna", transcription: "gpt-transcribe" },
  });
});
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.project.metadata.providerFixture !== true) return;
  expect(externalRequests.get(page) ?? []).toEqual([]);
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
  await fixtureStatus(page);
});

test("configured feedback recovers a provider failure with the same saved answer and one reward", async ({
  page,
}, testInfo) => {
  await onboard(page, "Offline AI Recovery");
  await startSpeaking(page);
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(answer);
  const before = await state(page);
  const initialCalls = (await fixtureStatus(page)).calls.length;
  const control = await page.request.post(`${origin}/__offline_ai/control`, {
    headers: fixtureHeaders,
    data: { failEvaluationOnce: true },
  });
  expect(control.ok()).toBeTruthy();
  await page
    .getByRole("button", { name: "Reflect first", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your reflection", exact: true })
    .fill(privateReflection);
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry evaluation", exact: true }),
  ).toBeVisible({ timeout: 25_000 });
  const failedState = await state(page);
  const failed = failedState.attempts.find((item: any) => item.text === answer);
  expect(failed.status).toBe("failed");
  expect(failed.evaluation).toBeFalsy();
  expect(failedState.wallet).toEqual(before.wallet);
  const failedDatabase = await persisted(page, failed.id);
  expect(failedDatabase.attempt.text).toBe(answer);
  expect(failedDatabase.attempt.selfReflection).toBe(privateReflection);
  expect(failedDatabase.job.status).toBe("failed");
  expect(failedDatabase.job.error).toContain("unavailable (503)");
  expect(failedDatabase.job.error).not.toContain("PRIVATE-UPSTREAM");
  await expect(page.getByText(/PRIVATE-UPSTREAM-FIXTURE/)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Retry evaluation", exact: true })
    .click();
  const attempt = await aiFeedback(page, "spin_speak", answer);
  expect(attempt.id).toBe(failed.id);
  const recoveredDatabase = await persisted(page, attempt.id);
  expect(recoveredDatabase.attempt.selfReflection).toBe(privateReflection);
  expect(recoveredDatabase.job.id).toBe(failedDatabase.job.id);
  expect(recoveredDatabase.job.retry_count).toBe(1);
  const completed = await state(page);
  expect(completed.attempts).toHaveLength(1);
  expect(completed.wallet.seeds).toBe(before.wallet.seeds + 1);
  const calls = (await fixtureStatus(page)).calls.slice(initialCalls);
  expect(calls.map((call: any) => [call.kind, call.outcome])).toEqual([
    ["evaluation", "503"],
    ["evaluation", "ok"],
  ]);
  expect(
    calls.every((call: any) => call.answerHash === hash(answer)),
  ).toBeTruthy();
  await page
    .getByText("Practice complete", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("configured-feedback-desktop.png"),
  });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await nav(page, "Profile");
  await page
    .getByRole("button", { name: /^View practice:/ })
    .first()
    .click();
  await expect(
    page.getByText("Provisional AI feedback", { exact: true }),
  ).toBeVisible();
  expect((await state(page)).wallet).toEqual(completed.wallet);
  expect((await fixtureStatus(page)).calls.length).toBe(initialCalls + 2);
});

test("canonical keyed feedback dimensions become checked feedback without losing evidence", async ({
  page,
}) => {
  await onboard(page, "Offline Keyed Feedback");
  await startSpeaking(page);
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(answer);
  const initialCalls = (await fixtureStatus(page)).calls.length;
  const control = await page.request.post(`${origin}/__offline_ai/control`, {
    headers: fixtureHeaders,
    data: { evaluationShapeOnce: "keyed_map" },
  });
  expect(control.ok()).toBeTruthy();
  await continueWithoutReflection(page);
  const attempt = await aiFeedback(page, "spin_speak", answer);
  const dimensions = attempt.evaluation.dimensions.filter(
    (item: any) => item.key !== "delivery",
  );
  expect(dimensions.map((item: any) => item.key)).toEqual([
    "grounded",
    "reasoned",
    "organised",
    "well_rounded",
  ]);
  for (const dimension of dimensions) {
    expect(dimension).toMatchObject({
      level: 2,
      confidence: "low",
      evidence_spans: [
        {
          start: answer.indexOf(answerEvidence),
          end: answer.indexOf(answerEvidence) + answerEvidence.length,
          quote: answerEvidence,
        },
      ],
      strength: "Your saved response supplies a concrete point to revisit.",
      improvement: "Explain one observation that could change your conclusion.",
    });
    await expect(
      page.getByTestId(`grow-dimension-${dimension.key}`),
    ).toBeVisible();
  }
  const calls = (await fixtureStatus(page)).calls.slice(initialCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    kind: "evaluation",
    replyShape: "keyed_map",
    answerHash: hash(answer),
    outcome: "ok",
  });
});

test("malformed dimensions show a friendly saved-work error and retry the same answer with one reward", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await onboard(page, "Offline Malformed Feedback");
  await startSpeaking(page);
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(answer);
  const before = await state(page);
  const initialCalls = (await fixtureStatus(page)).calls.length;
  const control = await page.request.post(`${origin}/__offline_ai/control`, {
    headers: fixtureHeaders,
    data: { evaluationShapeOnce: "malformed_dimensions" },
  });
  expect(control.ok()).toBeTruthy();
  await continueWithoutReflection(page);
  const friendly =
    "The AI feedback could not be checked. Your answer is saved; please try again.";
  await expect(
    page.getByRole("button", { name: "Retry evaluation", exact: true }),
  ).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("alert")).toContainText(friendly);
  const failedState = await state(page);
  expect(failedState.attempts).toHaveLength(1);
  const failed = failedState.attempts[0];
  expect(failed.status).toBe("failed");
  expect(failed.errorCode).toBe("assessment_invalid_response");
  expect(failed.text).toBe(answer);
  expect(failed.evaluation).toBeFalsy();
  expect(failedState.wallet).toEqual(before.wallet);
  expect(failedState.xp).toBe(before.xp);
  const failedDatabase = await persisted(page, failed.id);
  expect(failedDatabase.job.status).toBe("failed");
  expect(failedDatabase.job.error).toBe(friendly);
  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toMatch(
    /invalid_type|ZodError|"expected"|"received"|"path"/,
  );
  await page.screenshot({
    path: testInfo.outputPath("friendly-feedback-error-mobile.png"),
  });
  await page
    .getByRole("button", { name: "Retry evaluation", exact: true })
    .click();
  const recovered = await aiFeedback(page, "spin_speak", answer);
  expect(recovered.id).toBe(failed.id);
  const recoveredDatabase = await persisted(page, failed.id);
  expect(recoveredDatabase.job.id).toBe(failedDatabase.job.id);
  expect(recoveredDatabase.job.retry_count).toBe(1);
  const completed = await state(page);
  expect(completed.attempts).toHaveLength(1);
  expect(completed.wallet.seeds).toBe(before.wallet.seeds + 1);
  const calls = (await fixtureStatus(page)).calls.slice(initialCalls);
  expect(calls.map((call: any) => call.replyShape)).toEqual([
    "malformed_dimensions",
    "array",
  ]);
  expect(calls.every((call: any) => call.answerHash === hash(answer))).toBe(
    true,
  );
  // Revisiting the persisted result must neither call the provider again nor
  // grant a second reward after recovering this failed assessment.
  await page.goto(`/attempt?id=${failed.id}`);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  expect((await state(page)).wallet).toEqual(completed.wallet);
  expect((await fixtureStatus(page)).calls.length).toBe(initialCalls + 2);
});

for (const scenario of [
  {
    rejected: "missing_quote",
    accepted: "array",
    label: "quote-only evidence",
  },
  {
    rejected: "ambiguous_quote",
    accepted: "legacy_offsets",
    label: "legacy evidence with incorrect Unicode offsets",
  },
]) {
  test(`${scenario.label} resolves an interior quote after an emoji and preserves the saved response on retry`, async ({
    page,
  }) => {
    await onboard(page, "Offline Unicode Evidence");
    await startSpeaking(page);
    await page
      .getByRole("textbox", { name: "Your response", exact: true })
      .fill(unicodeAnswer);
    const before = await state(page);
    const initialCalls = (await fixtureStatus(page)).calls.length;
    const rejectControl = await page.request.post(
      `${origin}/__offline_ai/control`,
      {
        headers: fixtureHeaders,
        data: { evaluationShapeOnce: scenario.rejected },
      },
    );
    expect(rejectControl.ok()).toBeTruthy();
    await page
      .getByRole("button", { name: "Reflect first", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Your reflection", exact: true })
      .fill(privateReflection);
    await page
      .getByRole("button", { name: "Save & get feedback", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry evaluation", exact: true }),
    ).toBeVisible({ timeout: 25_000 });
    const friendly =
      "The AI feedback could not be checked. Your answer is saved; please try again.";
    await expect(page.getByRole("alert")).toContainText(friendly);
    const failedState = await state(page);
    expect(failedState.attempts).toHaveLength(1);
    const failed = failedState.attempts[0];
    expect(failed).toMatchObject({
      text: unicodeAnswer,
      selfReflection: privateReflection,
      status: "failed",
      errorCode: "assessment_invalid_response",
    });
    expect(failed.evaluation).toBeFalsy();
    expect(failedState.wallet).toEqual(before.wallet);
    expect(failedState.xp).toBe(before.xp);
    const failedDatabase = await persisted(page, failed.id);
    expect(failedDatabase.job).toMatchObject({
      status: "failed",
      error: friendly,
    });
    expect(await page.locator("body").innerText()).not.toMatch(
      /invalid_type|ZodError|"expected"|"received"|"path"/,
    );

    if (scenario.accepted === "legacy_offsets") {
      const acceptControl = await page.request.post(
        `${origin}/__offline_ai/control`,
        {
          headers: fixtureHeaders,
          data: { evaluationShapeOnce: scenario.accepted },
        },
      );
      expect(acceptControl.ok()).toBeTruthy();
    }
    await page
      .getByRole("button", { name: "Retry evaluation", exact: true })
      .click();
    const recovered = await aiFeedback(page, "spin_speak", unicodeAnswer);
    expect(recovered.id).toBe(failed.id);
    expect(recovered.selfReflection).toBe(privateReflection);
    expect(recovered.evaluation.prompt_template_version).toBe(
      "garden-coach-v5",
    );
    // The astral emoji occupies two UTF-16 code units. This interior quote is
    // neither the entire response nor located at the trivially correct zero.
    expect(evidencePrefix.length).toBe(Array.from(evidencePrefix).length + 1);
    for (const dimension of recovered.evaluation.dimensions.filter(
      (item: any) => item.key !== "delivery",
    )) {
      expect(dimension.evidence_spans).toEqual([
        {
          start: evidencePrefix.length,
          end: evidencePrefix.length + interiorEvidence.length,
          quote: interiorEvidence,
        },
      ]);
      await page.getByTestId(`grow-dimension-${dimension.key}`).click();
      await expect(
        page.getByTestId(`grow-evidence-${dimension.key}-0`),
      ).toHaveText(`“${interiorEvidence}”`);
      await page.getByTestId(`grow-dimension-${dimension.key}`).click();
    }
    await page
      .getByRole("button", { name: "Review my saved response", exact: true })
      .click();
    await expect(page.getByText(unicodeAnswer, { exact: true })).toBeVisible();
    await expect(
      page.getByText(privateReflection, { exact: true }),
    ).toBeVisible();
    const recoveredDatabase = await persisted(page, failed.id);
    expect(recoveredDatabase.job.id).toBe(failedDatabase.job.id);
    expect(recoveredDatabase.job.retry_count).toBe(1);
    expect(recoveredDatabase.attempt.selfReflection).toBe(privateReflection);
    const completed = await state(page);
    expect(completed.attempts).toHaveLength(1);
    expect(completed.wallet.seeds).toBe(before.wallet.seeds + 1);
    const calls = (await fixtureStatus(page)).calls.slice(initialCalls);
    expect(calls.map((call: any) => call.replyShape)).toEqual([
      scenario.rejected,
      scenario.accepted,
    ]);
    expect(
      calls.every((call: any) => call.answerHash === hash(unicodeAnswer)),
    ).toBe(true);
    const wireSpan = calls[1].wireEvidence[0];
    if (scenario.accepted === "legacy_offsets") {
      expect(wireSpan).toEqual({
        start: evidencePrefix.length - 1,
        end: evidencePrefix.length - 1 + interiorEvidence.length,
        quote: interiorEvidence,
      });
      expect(unicodeAnswer.slice(wireSpan.start, wireSpan.end)).not.toBe(
        interiorEvidence,
      );
    } else {
      expect(wireSpan).toEqual({ quote: interiorEvidence });
    }
    // Reloading the completed attempt must preserve its note and exact spans
    // without another provider call or another completion reward.
    await page.goto(`/attempt?id=${recovered.id}`);
    await expect(
      page.getByText("Practice complete", { exact: true }),
    ).toBeVisible();
    expect((await state(page)).wallet).toEqual(completed.wallet);
    expect((await persisted(page, recovered.id)).attempt.evaluation).toEqual(
      recovered.evaluation,
    );
    expect((await fixtureStatus(page)).calls.length).toBe(initialCalls + 2);
  });
}

test("configured reading and debate carry their real source and conversation through the browser flow", async ({
  page,
}) => {
  await onboard(page, "Offline AI Ideas");
  const initialCalls = (await fixtureStatus(page)).calls.length;
  await nav(page, "Discover");
  await page.getByRole("button", { name: "Science", exact: true }).click();
  await page
    .getByRole("button", {
      name: "What can a distant planet teach us about evidence?",
      exact: true,
    })
    .click();
  await page.getByRole("radio", { name: /Why is the word/ }).click();
  await page
    .getByRole("button", { name: "Start reflection", exact: true })
    .click();
  const reflection =
    "The summary says the observations may indicate atmospheric gases, so the claim remains uncertain. I would distinguish that inference from direct evidence that the planet supports life, which the supplied reading does not establish.";
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(reflection);
  await continueWithoutReflection(page);
  const reading = await aiFeedback(page, "read_reflect", reflection);
  expect(reading.selfReflection || "").toBe("");
  expect(reading.evaluation.assessment.source_scope).toBe("provided_summary");
  await page
    .getByRole("button", { name: "Save to journal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved to journal", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Debate Garden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Against the proposition", exact: true })
    .click();
  await page.getByRole("button", { name: "Start debate", exact: true }).click();
  const opening =
    "I oppose unrestricted AI homework because a finished answer can hide whether a learner understands the steps. A supervised trial should require an independent explanation, while preserving support for students who need it.";
  await page
    .getByRole("textbox", { name: "Your opening argument", exact: true })
    .fill(opening);
  await page
    .getByRole("button", { name: "Send my argument", exact: true })
    .click();
  await expect(page.getByText("ROUND 2 OF 2", { exact: true })).toBeVisible();
  await expect(page.getByText("AI CHALLENGER", { exact: true })).toBeVisible();
  await expect(page.getByText(challenger, { exact: true })).toBeVisible();
  const reply =
    "That concern is fair. I would include students with different support needs and compare independent explanations. If the restriction reduced access without helping understanding, I would revise the proposal.";
  const beforeFinalTurn = await state(page);
  await page
    .getByRole("textbox", {
      name: "Your response to the challenge",
      exact: true,
    })
    .fill(reply);
  // Both paths save the full debate before evaluation. Losing this GET must
  // preserve the final turn key; the direct action then queues that same draft.
  const attemptUrl = /\/api\/attempts\/[^/?]+$/;
  let failedFinalFetch = false;
  let releaseFinalFetch!: () => void;
  const finalFetchGate = new Promise<void>((resolve) => {
    releaseFinalFetch = resolve;
  });
  await page.route(attemptUrl, async (route) => {
    if (route.request().method() === "GET" && !failedFinalFetch) {
      failedFinalFetch = true;
      await finalFetchGate;
      await route.abort("connectionfailed");
    } else await route.continue();
  });
  const finalTurnRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      /\/api\/debates\/[^/]+\/turn$/.test(request.url()),
  );
  await continueWithoutReflection(page);
  const submittedTurn = (await finalTurnRequest).postDataJSON();
  expect(submittedTurn).toMatchObject({ text: reply, deferEvaluation: true });
  try {
    await expect.poll(() => failedFinalFetch).toBe(true);
    await expect(
      page.getByRole("textbox", {
        name: "Your response to the challenge",
        exact: true,
      }),
    ).not.toBeEditable();
  } finally {
    releaseFinalFetch();
  }
  await expect(page.getByRole("alert")).toBeVisible();
  expect(failedFinalFetch).toBe(true);
  await expect(
    page.getByRole("textbox", {
      name: "Your response to the challenge",
      exact: true,
    }),
  ).toHaveValue(reply);
  await page.unroute(attemptUrl);
  const evaluationUrl = /\/api\/attempts\/[^/]+\/evaluate$/;
  await page.route(evaluationUrl, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      json: { error: "Test queue unavailable; the full debate is saved." },
    }),
  );
  const repeatedTurn = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      /\/api\/debates\/[^/]+\/turn$/.test(request.url()),
  );
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  expect((await repeatedTurn).postDataJSON()).toEqual(submittedTurn);
  await expect(page.getByRole("alert")).toContainText("Test queue unavailable");
  await expect(page.getByTestId("self-reflection-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByTestId("self-reflection-note")).toHaveCount(0);
  const savedDebate = await state(page);
  const pendingDebate = savedDebate.attempts.find(
    (item: any) => item.mode === "debate",
  );
  expect(pendingDebate).toMatchObject({
    status: "draft",
    text: `Round 1: ${opening}\n\nRound 2: ${reply}`,
  });
  expect(pendingDebate.evaluation).toBeFalsy();
  expect(savedDebate.wallet).toEqual(beforeFinalTurn.wallet);
  expect(
    (await fixtureStatus(page)).calls
      .slice(initialCalls)
      .filter(
        (call: any) => call.kind === "evaluation" && call.mode === "debate",
      ),
  ).toHaveLength(0);
  await page.unroute(evaluationUrl);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible({ timeout: 25_000 });
  const debateState = await state(page);
  const debate = debateState.attempts.find(
    (item: any) => item.mode === "debate",
  );
  expect(debate.id).toBe(pendingDebate.id);
  expect(debate.text).toContain(opening);
  expect(debate.text).toContain(reply);
  expect(debate.selfReflection || "").toBe("");
  expect(
    debateState.attempts.filter((item: any) => item.mode === "debate"),
  ).toHaveLength(1);
  await aiFeedback(page, "debate", debate.text);
  const session = await (
    await page.request.get(`${origin}/api/sessions/${debate.sessionId}`)
  ).json();
  expect(
    session.turns.some(
      (turn: any) => turn.speaker === "ai" && turn.text === challenger,
    ),
  ).toBeTruthy();
  expect(
    session.turns.filter((turn: any) => turn.speaker === "user"),
  ).toHaveLength(2);
  expect(
    session.turns.filter((turn: any) => turn.speaker === "ai"),
  ).toHaveLength(2);
  expect(debateState.journal).toHaveLength(1);
  const calls = (await fixtureStatus(page)).calls.slice(initialCalls);
  expect(
    calls.filter(
      (call: any) => call.kind === "evaluation" && call.mode === "debate",
    ),
  ).toHaveLength(1);
  expect(
    calls.some(
      (call: any) =>
        call.kind === "evaluation" &&
        call.mode === "read_reflect" &&
        call.hasSourceSummary &&
        call.sourceScope === "provided_summary",
    ),
  ).toBeTruthy();
  expect(
    calls.some(
      (call: any) =>
        call.kind === "debate" && call.argumentHash === hash(opening),
    ),
  ).toBeTruthy();
  expect(
    calls.some(
      (call: any) =>
        call.kind === "evaluation" &&
        call.mode === "debate" &&
        call.conversationTurns > 0,
    ),
  ).toBeTruthy();
});

test("generated guiding questions keep private notes separate from a revised answer and provider input", async ({
  page,
}) => {
  await onboard(page, "Offline Guided Revision");
  await startSpeaking(page);
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(answer);
  const initialCalls = (await fixtureStatus(page)).calls.length;
  await continueWithoutReflection(page);
  const original = await aiFeedback(page, "spin_speak", answer);
  const questions = [
    "What observation could support your main point?",
    "How does that observation connect to your conclusion?",
    "What could make you reconsider your view?",
  ];
  const placeholders = [
    "A relevant observation",
    "Your reasoning",
    "A reason to reconsider",
  ];
  expect(
    original.evaluation.guiding_questions.map((item: any) => item.question),
  ).toEqual(questions);
  const toggle = page.getByTestId("thought-guide-toggle");
  const guideNotes = questions.map(
    (_, index) =>
      `PRIVATE_GUIDE_NOTE_ONLY_MARKER: private planning note ${index + 1}`,
  );
  for (const [index, question] of questions.entries()) {
    if (index > 0)
      await page
        .getByRole("button", { name: "Next question", exact: true })
        .click();
    await expect(page.getByTestId("thought-guide-progress")).toHaveText(
      `${index + 1}/3`,
    );
    await expect(
      page.getByTestId("thought-guide").getByRole("textbox"),
    ).toHaveCount(1);
    await expect(
      page.getByTestId(`thought-guide-question-${index}`),
    ).toHaveText(question);
    await expect(
      page.getByTestId(`thought-guide-field-${index}`).getByRole("textbox"),
    ).toHaveAttribute("placeholder", placeholders[index]);
    await page
      .getByTestId(`thought-guide-field-${index}`)
      .getByRole("textbox")
      .fill(guideNotes[index]);
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Next question", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("thought-guide-example")).toHaveCount(0);
  await expect(
    page.getByTestId("thought-guide").getByRole("button", { name: /example/i }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId("thought-guide").getByText(/^examples?(?:$|\s*:)/i),
  ).toHaveCount(0);
  const owner = (await state(page)).profile.id;
  const storageKey = `mind-garden-draft:${owner}:thought-guide:${original.id}`;
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.answers,
        storageKey,
      ),
    )
    .toEqual(guideNotes);
  await page
    .getByRole("button", { name: "Previous question", exact: true })
    .click();
  await expect(page.getByTestId("thought-guide-progress")).toHaveText("2/3");
  await expect(
    page.getByTestId("thought-guide-field-1").getByRole("textbox"),
  ).toHaveValue(guideNotes[1]);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.currentStep,
        storageKey,
      ),
    )
    .toBe(1);
  await page.goto(`/attempt?id=${original.id}`);
  await expect(page.getByTestId("thought-guide-progress")).toHaveText("2/3");
  await expect(
    page.getByTestId("thought-guide-field-1").getByRole("textbox"),
  ).toHaveValue(guideNotes[1]);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "Your response",
    exact: true,
  });
  await expect(editor).toHaveValue(answer);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByTestId("thought-guide-progress")).toHaveText("2/3");
  await page
    .getByRole("button", { name: "Previous question", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Previous question", exact: true }),
  ).toBeDisabled();
  for (const index of questions.keys()) {
    if (index > 0)
      await page
        .getByRole("button", { name: "Next question", exact: true })
        .click();
    await expect(page.getByTestId("thought-guide-progress")).toHaveText(
      `${index + 1}/3`,
    );
    await expect(
      page.getByTestId("thought-guide").getByRole("textbox"),
    ).toHaveCount(1);
    await expect(
      page.getByTestId(`thought-guide-field-${index}`).getByRole("textbox"),
    ).toHaveValue(guideNotes[index]);
  }
  await expect(editor).toHaveValue(answer);
  const revised = `${answer}\nI would decide in advance which result would lead me to change the proposal.`;
  await editor.fill(revised);
  await page
    .getByRole("button", { name: "Reflect first", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your reflection", exact: true })
    .fill(privateReflection);
  const submission = page.waitForRequest(
    (request) =>
      request.url() === `${origin}/api/attempts` && request.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  const payload = (await submission).postDataJSON();
  expect(payload).toMatchObject({
    text: revised,
    selfReflection: privateReflection,
    retryOf: original.id,
  });
  expect(JSON.stringify(payload)).not.toContain(
    "PRIVATE_GUIDE_NOTE_ONLY_MARKER",
  );
  const revision = await aiFeedback(page, "spin_speak", revised);
  expect(revision.retryOf).toBe(original.id);
  expect(revision.selfReflection).toBe(privateReflection);
  const saved = await persisted(page, original.id);
  expect(saved.attempt.text).toBe(answer);
  expect(saved.attempt.evaluation).toEqual(original.evaluation);
  expect(JSON.stringify(await state(page))).not.toContain(
    "PRIVATE_GUIDE_NOTE_ONLY_MARKER",
  );
  const calls = (await fixtureStatus(page)).calls.slice(initialCalls);
  expect(
    calls.map((call: any) => [call.kind, call.answerHash, call.outcome]),
  ).toEqual([
    ["evaluation", hash(answer), "ok"],
    ["evaluation", hash(revised), "ok"],
  ]);
  // The fixture asserts both private markers are absent from every complete
  // provider message, beyond simply checking that ANSWER matches the revision.
});

test("explicit AI drafting preserves notes, original feedback, and rewards across retry and regeneration", async ({
  page,
}, testInfo) => {
  await onboard(page, "Offline Draft Gardener");
  await startSpeaking(page);
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(answer);
  const initialCalls = (await fixtureStatus(page)).calls.length;
  await page
    .getByRole("button", { name: "Reflect first", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your reflection", exact: true })
    .fill(privateReflection);
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  const original = await aiFeedback(page, "spin_speak", answer);
  const before = await state(page);
  const originalDatabase = await persisted(page, original.id);
  const questions = original.evaluation.guiding_questions;
  const notes = [
    "PRIVATE_GUIDE_NOTE_ONLY_MARKER: compare two small community trials before making a wider change",
    "PRIVATE_GUIDE_NOTE_ONLY_MARKER: residents can describe both benefits and costs",
    "PRIVATE_GUIDE_NOTE_ONLY_MARKER: I would reconsider if one group was worse off",
  ];
  const noteKey = `mind-garden-draft:${before.profile.id}:thought-guide:${original.id}`;
  const draftKey = `mind-garden-draft:${before.profile.id}:thought-guide-response:${original.id}`;
  const endpoint = `${origin}/api/attempts/${original.id}/guided-response`;
  const next = page.getByRole("button", { name: "Next question", exact: true });
  const back = page.getByRole("button", {
    name: "Previous question",
    exact: true,
  });
  const create = page.getByRole("button", {
    name: "Create AI draft",
    exact: true,
  });
  const update = page.getByRole("button", {
    name: "Update AI draft",
    exact: true,
  });
  const field = (index: number) =>
    page.getByTestId(`thought-guide-field-${index}`).getByRole("textbox");
  const readCache = (key: string) =>
    page.evaluate(
      (name) => JSON.parse(localStorage.getItem(name) || "null"),
      key,
    );
  const draftCalls = async () =>
    (await fixtureStatus(page)).calls
      .slice(initialCalls)
      .filter((call: any) => call.kind === "guided_response");
  const failNextDraft = async () => {
    const response = await page.request.post(`${origin}/__offline_ai/control`, {
      headers: fixtureHeaders,
      data: { failGuidedResponseOnce: true },
    });
    expect(response.ok()).toBeTruthy();
  };
  const assertOriginalUnchanged = async () => {
    const current = await state(page);
    expect(current.wallet).toEqual(before.wallet);
    expect(current.xp).toBe(before.xp);
    expect(current.attempts).toEqual(before.attempts);
    expect(await persisted(page, original.id)).toEqual(originalDatabase);
    expect(JSON.stringify(current)).not.toContain(
      "PRIVATE_GUIDE_NOTE_ONLY_MARKER",
    );
  };
  const expectDraft = async (draft: any) => {
    expect(draft.provider).toBe("openai");
    expect(draft.model).toBe("gpt-6-luna-offline-fixture");
    expect(Number.isNaN(Date.parse(draft.createdAt))).toBe(false);
    expect(draft.annotations).toHaveLength(3);
    await expect(page.getByTestId("guided-response-text")).toHaveText(
      draft.text,
    );
    // Text content preserves whitespace and exact spans, without inserting UI
    // annotation numbers into the learner's generated response.
    expect(await page.getByTestId("guided-response-text").textContent()).toBe(
      draft.text,
    );
    for (const [index, annotation] of draft.annotations.entries()) {
      expect(draft.text.slice(annotation.start, annotation.end)).toBe(
        annotation.quote,
      );
      await expect(
        page.getByTestId(`guided-response-highlight-${index}`),
      ).toHaveText(annotation.quote);
    }
  };

  await expect(create).toHaveCount(0);
  await next.click();
  await next.click();
  await expect(create).toBeDisabled();
  await expect(
    page.getByText("Add an answer to create a draft.", { exact: true }),
  ).toBeVisible();
  await back.click();
  await back.click();
  for (const index of notes.keys()) {
    await field(index).fill(notes[index]);
    if (index < 2) {
      await expect(create).toHaveCount(0);
      await next.click();
    }
  }
  await expect(create).toBeEnabled();
  expect(await draftCalls()).toEqual([]);
  await expect
    .poll(async () => (await readCache(noteKey))?.answers)
    .toEqual(notes);
  expect(await readCache(draftKey)).toBeNull();

  // Hold the first explicit request at the browser boundary to prove busy
  // controls cannot change the source snapshot while generation is pending.
  await failNextDraft();
  let captured: any;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    captured = route.request().postDataJSON();
    await gate;
    await route.continue();
  });
  const failedRequest = page.waitForResponse(endpoint);
  await create.click();
  try {
    await expect.poll(() => Boolean(captured)).toBe(true);
    expect(captured).toEqual({ questions, answers: notes });
    await expect(field(2)).not.toBeEditable();
    await expect(back).toBeDisabled();
    await expect(create).toBeDisabled();
  } finally {
    release();
  }
  expect((await failedRequest).status()).toBe(502);
  await page.unroute(endpoint);
  await expect(page.getByTestId("guided-response-error")).toContainText(
    "The AI provider is unavailable (503). Your saved work is safe; retry after resolving the issue.",
  );
  await expect(page.getByText(/PRIVATE-GUIDED-RESPONSE-UPSTREAM/)).toHaveCount(
    0,
  );
  await expect(page.getByTestId("guided-response")).toHaveCount(0);
  await expect(field(2)).toHaveValue(notes[2]);
  expect(await draftCalls()).toHaveLength(1);
  await assertOriginalUnchanged();

  // Simulate one device write failure after provider success. Retrying storage
  // must keep the same rendered draft and never buy a second generation.
  await page.evaluate((key) => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) {
        Storage.prototype.setItem = originalSetItem;
        throw new DOMException(
          "Synthetic device storage limit",
          "QuotaExceededError",
        );
      }
      return originalSetItem.call(this, name, value);
    };
  }, draftKey);
  const success = page.waitForResponse(endpoint);
  await create.click();
  const firstResponse = await success;
  expect(firstResponse.ok()).toBeTruthy();
  const firstDraft = await firstResponse.json();
  await expectDraft(firstDraft);
  await expect(
    page.getByText("Your ideas, shaped by AI.", { exact: true }),
  ).toBeVisible();
  await expect(create).toHaveCount(0);
  await expect(update).toHaveCount(0);
  await expect(page.getByTestId("guided-response-error")).toContainText(
    "Your draft is ready, but couldn’t be saved on this device.",
  );
  expect(await readCache(draftKey)).toBeNull();
  expect(await draftCalls()).toHaveLength(2);
  await page
    .getByRole("button", { name: "Save draft again", exact: true })
    .click();
  await expect
    .poll(() => readCache(draftKey))
    .toEqual({ version: 1, questions, answers: notes, draft: firstDraft });
  expect(await draftCalls()).toHaveLength(2);
  await expect(page.getByTestId("guided-response-error")).toHaveCount(0);
  await expect(
    page.getByTestId("guided-response-annotation-0"),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", {
      name: "Annotation 2: Connected reasoning",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByTestId("guided-response-annotation-1"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("guided-response-explanation-text")).toHaveText(
    firstDraft.annotations[1].explanation,
  );
  await page.getByTestId("guided-response-highlight-2").click();
  await expect(
    page.getByTestId("guided-response-annotation-2"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("guided-response-selected-quote")).toHaveText(
    `“${firstDraft.annotations[2].quote}”`,
  );
  await expect
    .poll(() => readCache(draftKey))
    .toEqual({ version: 1, questions, answers: notes, draft: firstDraft });
  await assertOriginalUnchanged();

  const changedNotes = [...notes];
  changedNotes[2] =
    "PRIVATE_GUIDE_NOTE_ONLY_MARKER: I would stop the trial if access became less fair";
  await field(2).fill(changedNotes[2]);
  await expect(page.getByTestId("guided-response-stale")).toHaveText(
    "Your notes changed. Update the draft when you’re ready.",
  );
  await expect(update).toBeEnabled();
  await expectDraft(firstDraft);
  expect(await draftCalls()).toHaveLength(2);

  // A failed update must retain both the user's new notes and the prior draft.
  await failNextDraft();
  const failedUpdate = page.waitForResponse(endpoint);
  await update.click();
  expect((await failedUpdate).status()).toBe(502);
  await expect(page.getByTestId("guided-response-error")).toBeVisible();
  await expectDraft(firstDraft);
  await expect(field(2)).toHaveValue(changedNotes[2]);
  const regenerated = page.waitForResponse(endpoint);
  await update.click();
  const updatedResponse = await regenerated;
  expect(updatedResponse.ok()).toBeTruthy();
  const updatedDraft = await updatedResponse.json();
  expect(updatedDraft.text).not.toBe(firstDraft.text);
  expect(updatedDraft.text).toContain(
    "I would stop the trial if access became less fair",
  );
  await expectDraft(updatedDraft);
  await expect(page.getByTestId("guided-response-stale")).toHaveCount(0);
  await expect(update).toHaveCount(0);
  await expect
    .poll(() => readCache(draftKey))
    .toEqual({
      version: 1,
      questions,
      answers: changedNotes,
      draft: updatedDraft,
    });
  await assertOriginalUnchanged();
  const calls = await draftCalls();
  expect(calls.map((call: any) => call.outcome)).toEqual([
    "503",
    "ok",
    "503",
    "ok",
  ]);
  expect(
    calls.every(
      (call: any) =>
        call.originalHash === hash(answer) && call.receivedGuideMarker,
    ),
  ).toBeTruthy();
  const guidanceHash = (answers: string[]) =>
    hash(
      JSON.stringify(
        questions.map((item: any, index: number) => ({
          question: item.question,
          answer: answers[index],
        })),
      ),
    );
  expect(calls.map((call: any) => call.guidanceHash)).toEqual([
    guidanceHash(notes),
    guidanceHash(notes),
    guidanceHash(changedNotes),
    guidanceHash(changedNotes),
  ]);

  await back.click();
  await expect
    .poll(async () => (await readCache(noteKey))?.currentStep)
    .toBe(1);
  await page.goto(`/attempt?id=${original.id}`);
  await expect(page.getByTestId("thought-guide-progress")).toHaveText("2/3");
  await expect(field(1)).toHaveValue(changedNotes[1]);
  await expectDraft(updatedDraft);
  expect(await draftCalls()).toHaveLength(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("guided-response").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("guided-ai-draft-mobile.png"),
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Your response", exact: true }),
  ).toHaveValue(answer);
  await page.getByTestId("thought-guide-toggle").click();
  await expectDraft(updatedDraft);
  await expect(page.getByTestId("thought-guide-progress")).toHaveText("2/3");

  // Keep device storage deliberately: the usual UI sign-out clears it, while
  // this real session switch checks that reads are intrinsically owner scoped.
  const headers = { Origin: origin };
  expect(
    (
      await page.request.post(`${origin}/api/auth/logout`, {
        headers,
        data: {},
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.post(`${origin}/api/auth/guest`, { headers, data: {} })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.patch(`${origin}/api/me`, {
        headers,
        data: {
          displayName: "Separate Draft Gardener",
          onboardingComplete: true,
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await startSpeaking(page);
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(answer);
  await continueWithoutReflection(page);
  const secondAttempt = await aiFeedback(page, "spin_speak", answer);
  const secondOwner = (await state(page)).profile.id;
  expect(secondOwner).not.toBe(before.profile.id);
  await expect(page.getByTestId("guided-response")).toHaveCount(0);
  await expect(field(0)).toHaveValue("");
  expect(
    await readCache(
      `mind-garden-draft:${secondOwner}:thought-guide-response:${secondAttempt.id}`,
    ),
  ).toBeNull();
  expect((await readCache(draftKey))?.draft).toEqual(updatedDraft);
  expect(
    (await page.request.get(`${origin}/api/attempts/${original.id}`)).status(),
  ).toBe(404);
  expect(await draftCalls()).toHaveLength(4);
});

test("configured transcript recovery preserves edits and intentional clearing without duplicate provider calls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await onboard(page, "Offline AI Voice");
  const initialCalls = (await fixtureStatus(page)).calls.length;
  await startSpeaking(page);
  await page
    .getByRole("button", { name: "Speak a response", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Allow private recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finish recording", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  await page
    .getByRole("button", { name: "Finish recording", exact: true })
    .click();
  await expect(
    page.getByText("Your recording is ready", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use recording", exact: true })
    .click();
  const editor = page.getByRole("textbox", {
    name: "Transcript",
    exact: true,
  });
  await expect(page.getByTestId("self-reflection")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("self-reflection-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByTestId("self-reflection-note")).toHaveCount(0);
  await expect(page.getByTestId("original-response-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(editor).toHaveCount(0);
  const savedAudio = (await state(page)).attempts[0];
  expect(savedAudio.text).toBe(transcript);
  const noteEditor = page.getByRole("textbox", {
    name: "Your reflection",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Reflection (optional)", exact: true })
    .click();
  await noteEditor.fill(privateReflection);
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  // Reproduce a stale device draft left blank while its successful server
  // transcription was already saved. The real SQLite attempt is unchanged.
  await page.evaluate((attemptId) => {
    const key = Object.keys(localStorage).find((item) => {
      if (!item.includes("practice:spin_speak:")) return false;
      return (
        JSON.parse(localStorage.getItem(item) || "null")?.attempt?.id ===
        attemptId
      );
    });
    if (!key) throw new Error("Expected this audio attempt's local draft");
    const draft = JSON.parse(localStorage.getItem(key)!);
    draft.text = "";
    draft.transcriptEdited = false;
    localStorage.setItem(key, JSON.stringify(draft));
  }, savedAudio.id);
  await reopenAudioDraft(page);
  await expect(noteEditor).toHaveValue(privateReflection);
  await expect(page.getByTestId("original-response-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page
    .getByRole("button", { name: "Review transcript", exact: true })
    .click();
  await expect(editor).toHaveValue(transcript, { timeout: 20_000 });
  await expect(
    page.getByText(/Automatic transcription isn’t enabled/),
  ).toHaveCount(0);
  const corrected = `${transcript} I corrected the final sentence before submitting this recording.`;
  await editor.fill(corrected);
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await reopenAudioDraft(page);
  await page
    .getByRole("button", { name: "Review transcript", exact: true })
    .click();
  await expect(editor).toHaveValue(corrected);
  expect((await persisted(page, savedAudio.id)).attempt.text).toBe(transcript);
  // An explicitly cleared editor is user intent, unlike the untouched blank
  // cache above. Reopening must not resurrect the server's older transcript.
  await editor.fill("");
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await reopenAudioDraft(page);
  await expect(noteEditor).toHaveValue(privateReflection);
  await expect(
    page.getByRole("button", { name: "Generate transcript", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Type transcript", exact: true })
    .click();
  await expect(editor).toHaveValue("");
  await editor.fill("Hi");
  await expect(
    page.getByRole("button", { name: "Review transcript", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Type transcript", exact: true }),
  ).toHaveCount(0);
  await editor.fill("");
  await page
    .getByRole("button", { name: "Generate transcript", exact: true })
    .click();
  await expect(editor).toHaveValue(transcript);
  await expect(noteEditor).toHaveValue(privateReflection);
  await editor.fill(corrected);
  const beforeEvaluationCalls = (await fixtureStatus(page)).calls.slice(
    initialCalls,
  );
  expect(
    beforeEvaluationCalls.filter((call: any) => call.kind === "transcription"),
  ).toHaveLength(1);
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  const attempt = await aiFeedback(page, "spin_speak", corrected);
  expect(attempt.id).toBe(savedAudio.id);
  expect(attempt.selfReflection).toBe(privateReflection);
  expect(attempt.responseType).toBe("audio");
  expect(attempt.audioId).toBeTruthy();
  expect(
    attempt.evaluation.dimensions.find((item: any) => item.key === "delivery")
      .level,
  ).toBeNull();
  const calls = (await fixtureStatus(page)).calls.slice(initialCalls);
  const transcription = calls.find(
    (call: any) => call.kind === "transcription",
  );
  expect(transcription.model).toBe("gpt-transcribe");
  expect(transcription.bytes).toBeGreaterThan(0);
  expect(
    calls.some(
      (call: any) =>
        call.kind === "evaluation" && call.answerHash === hash(corrected),
    ),
  ).toBeTruthy();
  await page
    .getByText("Practice complete", { exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("configured-feedback-mobile.png"),
  });
  await page
    .getByRole("button", { name: "Review my saved response", exact: true })
    .click();
  await expect(page.getByText(corrected, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Listen to my recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Play recording", exact: true }),
  ).toBeVisible();
});

test("failed transcript generation explains the failure and retries explicitly without losing the reflection", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const recoveryReflection =
    "Next time, I could slow down and make my example clearer.";
  await onboard(page, "Offline AI Retry Voice");
  const initialCalls = (await fixtureStatus(page)).calls.length;
  const failNextTranscription = async () => {
    const control = await page.request.post(`${origin}/__offline_ai/control`, {
      headers: fixtureHeaders,
      data: { failTranscriptionOnce: true },
    });
    expect(control.ok()).toBeTruthy();
  };
  await failNextTranscription();
  await startSpeaking(page);
  await page
    .getByRole("button", { name: "Speak a response", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Allow private recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finish recording", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  await page
    .getByRole("button", { name: "Finish recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use recording", exact: true })
    .click();
  await expect(page.getByTestId("self-reflection")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("self-reflection-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByTestId("self-reflection-note")).toHaveCount(0);
  const providerError = page.getByText(
    /The AI provider is unavailable \(503\)\./,
  );
  await expect(providerError).toBeVisible();
  await expect(page.getByText(/PRIVATE-TRANSCRIPTION-UPSTREAM/)).toHaveCount(0);
  const noteEditor = page.getByRole("textbox", {
    name: "Your reflection",
    exact: true,
  });
  await page
    .getByRole("button", { name: "Reflection (optional)", exact: true })
    .click();
  await noteEditor.fill(recoveryReflection);
  await page.getByTestId("self-reflection").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("missing-transcript-mobile.png"),
  });
  const before = await state(page);
  expect(before.attempts).toHaveLength(1);
  const draft = before.attempts[0];
  expect(draft.text).toBe("");
  expect(draft.status).toBe("draft");
  await page
    .getByRole("button", { name: "Type transcript", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "Transcript", exact: true });
  await expect(editor).toBeEditable();
  await editor.fill("A short start");
  await expect(
    page.getByRole("button", { name: "Review transcript", exact: true }),
  ).toBeVisible();
  await editor.fill("");

  await failNextTranscription();
  await page
    .getByRole("button", { name: "Generate transcript", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await fixtureStatus(page)).calls
          .slice(initialCalls)
          .filter((call: any) => call.kind === "transcription").length,
    )
    .toBe(2);
  await expect(providerError).toBeVisible();
  await expect(noteEditor).toHaveValue(recoveryReflection);
  await expect(editor).toHaveValue("");
  const failedGeneration = await state(page);
  expect(failedGeneration.attempts[0].id).toBe(draft.id);
  expect(failedGeneration.attempts[0].text).toBe("");
  expect(failedGeneration.attempts[0].evaluation).toBeFalsy();
  expect(failedGeneration.wallet).toEqual(before.wallet);

  // Hold only the explicit retry request to verify that user corrections cannot
  // race the returning generated transcript. The real backend still handles it.
  const transcriptionUrl = `${origin}/api/attempts/${draft.id}/transcribe`;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route(transcriptionUrl, async (route) => {
    requested = true;
    await pending;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Generate transcript", exact: true })
    .click();
  await expect.poll(() => requested).toBe(true);
  try {
    await expect(editor).not.toBeEditable();
    await expect(noteEditor).not.toBeEditable();
  } finally {
    release();
  }
  await expect(editor).toHaveValue(transcript, { timeout: 20_000 });
  await page.unroute(transcriptionUrl);
  await expect(noteEditor).toHaveValue(recoveryReflection);
  await expect(providerError).toHaveCount(0);
  expect((await persisted(page, draft.id)).attempt.text).toBe(transcript);
  const transcriptionCalls = (await fixtureStatus(page)).calls
    .slice(initialCalls)
    .filter((call: any) => call.kind === "transcription");
  expect(transcriptionCalls.map((call: any) => call.outcome)).toEqual([
    "503",
    "503",
    "ok",
  ]);
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  const attempt = await aiFeedback(page, "spin_speak", transcript);
  expect(attempt.id).toBe(draft.id);
  expect(attempt.selfReflection).toBe(recoveryReflection);
  expect(attempt.text).toBe(transcript);
});

test("configured friend voice is transcribed, corrected, resumed and shared only on send", async ({
  page: host,
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    permissions: ["microphone"],
  });
  const friend = await context.newPage();
  const friendErrors: string[] = [];
  const friendExternal: string[] = [];
  friend.on("pageerror", (error) => friendErrors.push(error.message));
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ["blob:", "data:"].includes(url.protocol))
      return route.continue();
    friendExternal.push(url.origin + url.pathname);
    return route.abort("blockedbyclient");
  });
  try {
    await onboard(host, "Voice Host");
    await onboard(friend, "Voice Friend");
    const before = await state(host);
    const initialCalls = (await fixtureStatus(host)).calls.length;
    for (const page of [host, friend])
      await page
        .getByRole("button", { name: "Debate with friends", exact: true })
        .click();
    const created = host.waitForResponse(
      (response) =>
        response.url().endsWith("/api/friends/rooms") &&
        response.request().method() === "POST",
    );
    await host
      .getByRole("button", { name: "Create invite", exact: true })
      .click();
    const room = await (await created).json();
    await friend
      .getByRole("textbox", { name: "Six-character invite code", exact: true })
      .fill(room.code);
    await friend
      .getByRole("button", { name: "Join debate", exact: true })
      .click();
    await expect(host.getByText("Your turn", { exact: true })).toBeVisible();
    await host.bringToFront();
    await host
      .getByRole("button", { name: "Record my turn", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Allow voice recording", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Record my response", exact: true })
      .click();
    await expect(
      host.getByRole("button", { name: "Finish recording", exact: true }),
    ).toBeEnabled({ timeout: 30_000 });
    await expect(host.getByLabel(/5[0-7] seconds remaining/)).toBeVisible();
    await host
      .getByRole("button", { name: "Finish recording", exact: true })
      .click();
    const upload = host.waitForResponse(
      (response) =>
        response.url().endsWith("/api/audio") &&
        response.request().method() === "POST",
    );
    await host
      .getByRole("button", { name: "Use recording", exact: true })
      .click();
    const audio = await (await upload).json();
    const editor = host.getByRole("textbox", {
      name: "Transcript to share",
      exact: true,
    });
    await expect(editor).toHaveValue(transcript);
    expect(
      (
        await friend.request.get(`${origin}/api/audio/${audio.id}/url`)
      ).status(),
    ).toBe(404);
    const corrected = `${transcript} I would include an independent check before expanding the trial.`;
    await editor.fill(corrected);
    await host
      .getByRole("button", { name: "Save & close", exact: true })
      .click();
    await host.reload();
    await host
      .getByRole("button", { name: "Debate with friends", exact: true })
      .click();
    await expect(editor).toHaveValue(corrected);
    await expect(
      host.getByRole("button", { name: "Play recording", exact: true }),
    ).toBeVisible();
    expect(
      (
        await friend.request.get(`${origin}/api/audio/${audio.id}/url`)
      ).status(),
    ).toBe(404);
    await host
      .getByRole("button", { name: "Send voice & text", exact: true })
      .click();
    await expect(friend.getByText(corrected, { exact: true })).toBeVisible();
    await friend.bringToFront();
    await friend
      .getByRole("button", { name: "Listen to voice message", exact: true })
      .click();
    await friend
      .getByRole("button", { name: "Play recording", exact: true })
      .click();
    await expect(
      friend.getByRole("button", { name: "Pause playback", exact: true }),
    ).toBeVisible();
    const saved = await (
      await host.request.get(`${origin}/api/friends/rooms/${room.id}`)
    ).json();
    expect(saved.turns).toHaveLength(1);
    expect(saved.turns[0]).toMatchObject({
      text: corrected,
      audioId: audio.id,
      userId: before.profile.id,
    });
    const calls = (await fixtureStatus(host)).calls.slice(initialCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "transcription", outcome: "ok" });
    expect(calls[0].bytes).toBeGreaterThan(0);
    const after = await state(host);
    expect(after.attempts).toEqual(before.attempts);
    expect(after.wallet).toEqual(before.wallet);
    expect(after.xp).toBe(before.xp);
    expect(friendErrors).toEqual([]);
    expect(friendExternal).toEqual([]);
  } finally {
    await context.close();
  }
});

test("daily BRIDGE rejects a broken graph, recovers the same answer, and persists inspectable maps across a revision", async ({
  page,
}, testInfo) => {
  await onboard(page, "Bridge Learner");
  await page
    .getByRole("button", { name: "Start my daily workout", exact: true })
    .click();
  await startSpeaking(page);
  await page.getByRole("button", { name: "Criteria", exact: true }).click();
  await expect(page.getByTestId("assessment-criterion-B")).toContainText(
    "Big Idea",
  );
  await expect(page.getByTestId("assessment-criterion-E")).toContainText(
    "Expression",
  );
  await page.getByRole("button", { name: "Criteria", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(answer);
  const before = await state(page);
  const control = await page.request.post(`${origin}/__offline_ai/control`, {
    headers: fixtureHeaders,
    data: { evaluationShapeOnce: "malformed_dimensions" },
  });
  expect(control.ok()).toBe(true);
  await continueWithoutReflection(page);
  await expect(
    page.getByRole("button", { name: "Retry evaluation", exact: true }),
  ).toBeVisible({ timeout: 25000 });
  const failed = (await state(page)).attempts[0];
  expect(failed.text).toBe(answer);
  expect(failed.evaluation).toBeFalsy();
  expect((await state(page)).xp).toBe(before.xp);
  await page
    .getByRole("button", { name: "Retry evaluation", exact: true })
    .click();
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible({ timeout: 25000 });
  await expect(
    page.getByRole("heading", { name: "Your Thought Map", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("feedback-reward-xp")).toContainText("+15 XP");
  await page.getByTestId("thought-map-node-claim").click();
  await expect(page.getByTestId("thought-map-source")).toContainText(answer);
  await page.getByTestId("thought-map-node-limit").click();
  await expect(page.getByTestId("thought-map-selected")).toContainText(
    "not something you said",
  );
  await expect(page.getByTestId("thought-map-source")).toHaveCount(0);
  const recovered = (await state(page)).attempts[0];
  expect(recovered.id).toBe(failed.id);
  expect(recovered.evaluation.rubric_version).toBe("bridge-v1");
  expect(recovered.evaluation.dimensions).toHaveLength(6);
  expect(recovered.evaluation.overall_score).toBeNull();
  const stored = await persisted(page, recovered.id);
  expect(stored.attempt.evaluation.thought_map).toEqual(
    recovered.evaluation.thought_map,
  );
  await page
    .getByRole("button", { name: "See full BRIDGE breakdown", exact: true })
    .click();
  await expect(page.getByTestId("bridge-dimension-E")).toContainText(
    "Expression",
  );
  await page.screenshot({
    path: testInfo.outputPath("bridge-map-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Text outline", exact: true }).click();
  await page.getByTestId("thought-map-outline-link").click();
  await expect(page.getByTestId("thought-map-selected")).toContainText(
    "No learner quotation",
  );
  await page.screenshot({
    path: testInfo.outputPath("bridge-outline-mobile.png"),
    fullPage: true,
  });
  await page.goto(`/attempt?id=${recovered.id}`);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const revised = `${answer} I would also ask the people affected which result would make them change their minds.`;
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(revised);
  await continueWithoutReflection(page);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible({ timeout: 25000 });
  await page.getByTestId("thought-trail-toggle").click();
  await expect(page.getByTestId("thought-trail-earlier")).toHaveText(answer);
  await expect(page.getByTestId("thought-trail-revision")).toHaveText(revised);
  await expect(
    page.getByRole("heading", {
      name: "Earlier attempt · saved map",
      exact: true,
    }),
  ).toBeVisible();
  expect((await state(page)).xp).toBe(15);
});

test("configured WordBloom schedules an evidenced word into reading without extra XP", async ({
  page,
}) => {
  await onboard(page, "WordBloom Provider Learner");
  await page
    .getByRole("button", { name: "Start my daily workout", exact: true })
    .click();
  await startSpeaking(page);
  const response =
    "We could work together on a shared garden. Each neighbour could suggest a plant and explain what it needs.";
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(response);
  await continueWithoutReflection(page);
  await expect(page.getByTestId("wordbloom-preview")).toContainText(
    "collaborate",
  );
  let words = await (
    await page.request.get(`${origin}/api/wordbloom/summary`)
  ).json();
  expect(words.words).toHaveLength(1);
  expect(words.words[0].source.kind).toBe("llm_contextual");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByTestId("daily-progress")).toHaveText("1/2");
  await page.getByRole("button", { name: "Read Aloud", exact: true }).click();
  await expect(page.getByTestId("wordbloom-highlight-collaborate")).toHaveText(
    "collaborate",
  );
  await page
    .getByRole("textbox", { name: "Your reading observation", exact: true })
    .fill(
      "I practised the final phrase and noticed a comfortable place to pause.",
    );
  await page
    .getByRole("checkbox", {
      name: "I practised this passage and reviewed my reading",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Save reading self-review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reading practice saved", exact: true }),
  ).toBeVisible();
  words = await (
    await page.request.get(`${origin}/api/wordbloom/summary`)
  ).json();
  expect(words.words[0].exposureCount).toBe(1);
  expect(words.words[0].intervalDays).toBe(3);
  expect((await state(page)).xp).toBe(25);
  await fixtureStatus(page);
});

test("optional reading acoustics recover a provider outage and preserve self-review, timing and daily XP", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await onboard(page, "Acoustic Fixture Learner");
  await page
    .getByRole("button", { name: "Start my daily workout", exact: true })
    .click();
  await page.getByRole("button", { name: "Read Aloud", exact: true }).click();
  await page
    .getByRole("button", { name: "Allow private recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(page.getByText(/^0:5[0-6]$/, { exact: false })).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Finish recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use recording", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your reading observation", exact: true })
    .fill(
      "I practised the final sentence and noticed a comfortable place to pause.",
    );
  await page
    .getByRole("checkbox", {
      name: "I practised this passage and reviewed my reading",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Save reading self-review", exact: true })
    .click();
  const panel = page.getByTestId("reading-speech");
  await expect(
    panel.getByRole("button", {
      name: "Assess my reading recording",
      exact: true,
    }),
  ).toBeDisabled();
  await panel
    .getByRole("checkbox", {
      name: "Allow Azure to assess this reading recording",
      exact: true,
    })
    .click();
  await panel
    .getByRole("button", { name: "Assess my reading recording", exact: true })
    .click();
  await expect(
    panel.getByRole("button", {
      name: "Retry acoustic assessment",
      exact: true,
    }),
  ).toBeVisible();
  await expect(panel).toContainText("Your saved reading is unchanged");
  expect((await state(page)).xp).toBe(10);
  await panel
    .getByRole("button", { name: "Retry acoustic assessment", exact: true })
    .click();
  await expect(panel).toContainText("Provisional acoustic feedback · en-GB");
  await expect(panel).toContainText("accuracy: 82/100");
  await expect(panel).not.toContainText("intelligibility:");
  await panel
    .getByRole("button", { name: "Inspect words and timings", exact: true })
    .click();
  await panel
    .getByRole("button", { name: /Inspect .* at 0.5 seconds/ })
    .click();
  const selected = panel.getByTestId("speech-selected-word");
  await expect(selected).toContainText("provider suggests reviewing this word");
  await selected
    .getByRole("button", { name: "Open saved recording", exact: true })
    .click();
  await selected
    .getByRole("button", { name: "Play recording", exact: true })
    .click();
  await expect(
    selected.getByRole("button", { name: "Pause playback", exact: true }),
  ).toBeVisible();
  await panel
    .getByText("Optional acoustic feedback", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/speech/reading-feedback-mobile.png",
  });
  await selected.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/speech/word-playback-mobile.png",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel
    .getByText("Optional acoustic feedback", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/speech/reading-feedback-desktop.png",
  });
  expect((await state(page)).xp).toBe(10);
  await page.reload();
  await expect(page.getByTestId("reading-speech")).toContainText(
    "Provisional acoustic feedback · en-GB",
  );
  await expect(page.getByTestId("reading-reward")).toContainText("+10 XP");
  await fixtureStatus(page);
});

test("speaking vocabulary receives separate provisional pronunciation evidence during the same two-activity workout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await onboard(page, "Integrated Vocabulary Learner");
  await page
    .getByRole("button", { name: "Start my daily workout", exact: true })
    .click();
  await startSpeaking(page);
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(
      "We could work together on a shared garden. Each neighbour could suggest a plant and explain what it needs.",
    );
  await continueWithoutReflection(page);
  await expect(page.getByTestId("wordbloom-preview")).toContainText(
    "collaborate",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Read Aloud", exact: true }).click();
  await expect(page.getByTestId("wordbloom-highlight-collaborate")).toHaveText(
    "collaborate",
  );
  await page
    .getByRole("button", { name: "Allow private recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(page.getByText(/^0:5[0-6]$/, { exact: false })).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Finish recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use recording", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your reading observation", exact: true })
    .fill(
      "I practised the final phrase and noticed a comfortable place to pause.",
    );
  await page
    .getByRole("checkbox", {
      name: "I practised this passage and reviewed my reading",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Save reading self-review", exact: true })
    .click();
  const panel = page.getByTestId("reading-speech");
  await panel
    .getByRole("checkbox", {
      name: "Allow Azure to assess this reading recording",
      exact: true,
    })
    .click();
  await panel
    .getByRole("button", { name: "Assess my reading recording", exact: true })
    .click();
  const retry = panel.getByRole("button", {
    name: "Retry acoustic assessment",
    exact: true,
  });
  await expect(
    panel
      .getByText("Provisional acoustic feedback · en-GB", { exact: true })
      .or(retry),
  ).toBeVisible();
  if (await retry.isVisible()) await retry.click();
  await expect(page.getByTestId("speech-wordbloom-review")).toContainText(
    "collaborate: Reading observation recorded; review interval unchanged.",
  );
  const summary = await (
    await page.request.get(`${origin}/api/wordbloom/summary`)
  ).json();
  expect(summary.words[0].pronunciationReview.observationStatus).toBe(
    "observed",
  );
  expect(summary.words[0].intervalDays).toBe(3);
  const exported = await (
    await page.request.get(`${origin}/api/export`)
  ).json();
  expect(exported.wordBloom.pronunciationObservations).toHaveLength(1);
  expect((await state(page)).xp).toBe(25);
  await page.reload();
  await expect(page.getByTestId("speech-wordbloom-review")).toContainText(
    "review interval unchanged",
  );
  await page
    .getByRole("button", { name: "Return to daily workout", exact: true })
    .click();
  await nav(page, "Profile");
  await expect(page.getByTestId("wordbloom-progress")).toContainText(
    "provisional reading pronunciation observation (en-GB)",
  );
  await expect(
    page.getByTestId("wordbloom-pronunciation-collaborate"),
  ).toContainText("no vocabulary mastery is inferred");
  await page
    .getByTestId("wordbloom-pronunciation-collaborate")
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/wordbloom/pronunciation-mobile.png",
  });
  await fixtureStatus(page);
});

test("repeated sourced feedback yields a fresh optional practice focus with pause and idempotent dismissal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await onboard(page, "Learner Focus Student");
  await page
    .getByRole("button", { name: "Start my daily workout", exact: true })
    .click();
  const mutationHeaders = { Origin: origin };
  for (const promptId of ["tech-attention", "tech-ai-learning"]) {
    expect(
      (
        await page.request.post(`${origin}/__offline_ai/control`, {
          headers: fixtureHeaders,
          data: { evaluationShapeOnce: "learner_gap" },
        })
      ).ok(),
    ).toBeTruthy();
    const session = await (
      await page.request.post(`${origin}/api/sessions`, {
        headers: mutationHeaders,
        data: { mode: "spin_speak", promptId },
      })
    ).json();
    const attempt = await (
      await page.request.post(`${origin}/api/attempts`, {
        headers: mutationHeaders,
        data: { sessionId: session.id, text: answer },
      })
    ).json();
    const queued = await (
      await page.request.post(`${origin}/api/attempts/${attempt.id}/evaluate`, {
        headers: mutationHeaders,
        data: {},
      })
    ).json();
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`${origin}/api/jobs/${queued.id}`)
            ).json()
          ).status,
      )
      .toBe("completed");
  }
  await nav(page, "Profile");
  const profile = page.getByTestId("learner-profile");
  await expect(profile.getByTestId("learner-recommendation")).toContainText(
    "Reasons",
  );
  await expect(profile).toContainText(
    "Two recent responses to different prompts",
  );
  await expect(profile).toContainText("12 saved criterion observations");
  await profile
    .getByRole("button", { name: "Pause practice suggestions", exact: true })
    .click();
  await page.reload();
  await expect(profile).toContainText("Practice suggestions are paused.");
  await profile
    .getByRole("button", { name: "Resume practice suggestions", exact: true })
    .click();
  await expect(profile.getByTestId("learner-recommendation")).toBeVisible();
  await profile
    .getByRole("button", { name: "Start focused speaking", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Spin a prompt", exact: true })
    .click();
  await expect(page.getByTestId("practice-learning-focus")).toContainText(
    "Reasons",
  );
  await expect(page.getByTestId("practice-learning-focus")).toContainText(
    "does not establish mastery",
  );
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await nav(page, "Profile");
  await expect(profile.getByTestId("learner-recommendation")).toBeVisible();
  let lose = true;
  await page.route("**/api/me/learner-profile", async (route) => {
    if (
      lose &&
      route.request().method() === "PATCH" &&
      route.request().postDataJSON()?.dismissId
    ) {
      lose = false;
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await profile
    .getByRole("button", {
      name: "Dismiss this practice suggestion",
      exact: true,
    })
    .click();
  await expect(
    profile.getByRole("button", {
      name: "Dismiss this practice suggestion",
      exact: true,
    }),
  ).toBeEnabled();
  await profile
    .getByRole("button", {
      name: "Dismiss this practice suggestion",
      exact: true,
    })
    .click();
  await expect(profile.getByTestId("learner-recommendation")).toHaveCount(0);
  const before = (await fixtureStatus(page)).calls.length;
  await profile
    .getByRole("button", { name: "Include saved BRIDGE feedback", exact: true })
    .click();
  await expect(profile).toContainText("12 saved criterion observations");
  await expect(
    profile.getByRole("button", {
      name: "Include saved BRIDGE feedback",
      exact: true,
    }),
  ).toBeEnabled();
  expect((await fixtureStatus(page)).calls.length).toBe(before);
  expect((await state(page)).xp).toBe(15);
  await profile.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/learner-profile/mobile.png",
  });
});
