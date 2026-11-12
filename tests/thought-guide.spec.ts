import { expect, test, type Page } from "@playwright/test";
import type { AppState, Attempt } from "../src/types";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
test.setTimeout(120_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || base;
const headers = { Origin: new URL(base).origin };
const answer =
  "A small trial could help a community compare outcomes before making a wider change. I would ask the people affected what improved and what became harder. One trial may not represent everyone.";
const revised = `${answer}\nI would also identify a result that would change the proposal before starting the trial.`;
const notes = [
  "PRIVATE_GUIDE_NOTE_ONLY_MARKER: compare two possible approaches",
  "PRIVATE_GUIDE_NOTE_ONLY_MARKER: ask who the trial might miss",
  "PRIVATE_GUIDE_NOTE_ONLY_MARKER: think about an unexpected result",
];
const fallbackQuestions = [
  "What is the main idea you want to express?",
  "What makes that idea convincing to you?",
  "What might change or limit your view?",
];

async function state(page: Page): Promise<AppState> {
  const response = await page.request.get(`${backend}/api/state`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function guest(page: Page, displayName: string) {
  const created = await page.request.post(`${backend}/api/auth/guest`, {
    headers,
    data: {},
  });
  expect(created.ok()).toBeTruthy();
  const updated = await page.request.patch(`${backend}/api/me`, {
    headers,
    data: { displayName, timezone: "UTC", onboardingComplete: true },
  });
  expect(updated.ok()).toBeTruthy();
  return (await state(page)).profile;
}

async function completedAttempt(page: Page, text: string): Promise<Attempt> {
  const sessionResponse = await page.request.post(`${backend}/api/sessions`, {
    headers,
    data: { mode: "spin_speak" },
  });
  expect(sessionResponse.status()).toBe(201);
  const session = await sessionResponse.json();
  const created = await page.request.post(`${backend}/api/attempts`, {
    headers,
    data: { sessionId: session.id, responseType: "text", text },
  });
  expect(created.status()).toBe(201);
  const attempt = await created.json();
  const queued = await page.request.post(
    `${backend}/api/attempts/${attempt.id}/evaluate`,
    { headers, data: {} },
  );
  expect(queued.status()).toBe(202);
  await expect
    .poll(
      async () =>
        (await state(page)).attempts.find((item) => item.id === attempt.id)
          ?.status,
    )
    .toBe("completed");
  return (await state(page)).attempts.find((item) => item.id === attempt.id)!;
}

async function openGuide(page: Page) {
  await expect(page.getByTestId("thought-guide")).toBeVisible();
  const toggle = page.getByTestId("thought-guide-toggle");
  if (await toggle.count()) {
    if ((await toggle.getAttribute("aria-expanded")) === "false")
      await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  } else {
    await expect(
      page.getByRole("heading", { name: "Think it through", exact: true }),
    ).toBeVisible();
  }
}

function field(page: Page, index: number) {
  return page.getByTestId(`thought-guide-field-${index}`).getByRole("textbox");
}

async function expectStep(page: Page, index: number) {
  const guide = page.getByTestId("thought-guide");
  await expect(page.getByTestId("thought-guide-progress")).toHaveText(
    `${index + 1}/3`,
  );
  await expect(guide.getByRole("textbox")).toHaveCount(1);
  await expect(field(page, index)).toBeVisible();
  const previous = guide.getByRole("button", {
    name: "Previous question",
    exact: true,
  });
  const next = guide.getByRole("button", {
    name: "Next question",
    exact: true,
  });
  if (index === 0) await expect(previous).toBeDisabled();
  else await expect(previous).toBeEnabled();
  if (index === 2) await expect(next).toHaveCount(0);
  else await expect(next).toBeEnabled();
  await expect(guide.getByRole("button", { name: /example/i })).toHaveCount(0);
  await expect(guide.getByText(/^examples?(?:$|\s*:)/i)).toHaveCount(0);
  await expect(page.getByTestId("thought-guide-example")).toHaveCount(0);
}

async function goToStep(page: Page, target: number) {
  const progress = page.getByTestId("thought-guide-progress");
  await expect(progress).toHaveText(/^[123]\/3$/);
  let current = Number((await progress.textContent())!.split("/")[0]) - 1;
  while (current !== target) {
    const forward = current < target;
    await page
      .getByRole("button", {
        name: forward ? "Next question" : "Previous question",
        exact: true,
      })
      .click();
    current += forward ? 1 : -1;
    await expectStep(page, current);
  }
  await expectStep(page, target);
}

async function expectAnswers(page: Page, values: string[]) {
  for (const [index, value] of values.entries()) {
    await goToStep(page, index);
    await expect(field(page, index)).toHaveValue(value);
  }
}

test("historic feedback guides a private saved revision with attempt and account isolation", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(15_000);
  const health = await (await page.request.get(`${backend}/api/health`)).json();
  expect(
    health.provider,
    "Guidance tests must not make paid provider calls",
  ).toBe("local");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const profile = await guest(page, "Guided Gardener");
  const original = await completedAttempt(page, answer);
  const other = await completedAttempt(
    page,
    `${answer} This is a separate practice.`,
  );

  // Only the legacy display boundary is projected: real saved answers, users,
  // rewards and retries remain in the isolated API/SQLite test environment.
  let legacyResponses = 0;
  const projectLegacy = (attempt: Attempt) => {
    if (attempt.id !== original.id || !attempt.evaluation) return attempt;
    const evaluation = { ...attempt.evaluation };
    delete evaluation.guiding_questions;
    evaluation.retry_prompt = "Old imperative guidance must not be displayed.";
    legacyResponses++;
    return { ...attempt, evaluation };
  };
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    const actual = await response.json();
    await route.fulfill({
      response,
      json: { ...actual, attempts: actual.attempts.map(projectLegacy) },
    });
  });
  await page.route(`${backend}/api/attempts/${original.id}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: projectLegacy(await response.json()),
    });
  });
  await page.goto(`${base}/attempt?id=${original.id}`);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  await openGuide(page);
  expect(legacyResponses).toBeGreaterThan(0);
  await expect(
    page.getByText("Old imperative guidance must not be displayed.", {
      exact: true,
    }),
  ).toHaveCount(0);
  // Answering is optional: blank steps remain navigable and the retry action
  // is available throughout, without waiting for all three notes.
  for (const index of notes.keys()) {
    await goToStep(page, index);
    await expect(field(page, index)).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
  }
  await goToStep(page, 0);
  for (const [index, question] of fallbackQuestions.entries()) {
    await goToStep(page, index);
    await expect(
      page.getByTestId(`thought-guide-question-${index}`),
    ).toHaveText(question);
    await expect(field(page, index)).toHaveValue("");
    await field(page, index).fill(notes[index]);
  }
  const storageKey = `mind-garden-draft:${profile.id}:thought-guide:${original.id}`;
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.answers,
        storageKey,
      ),
    )
    .toEqual(notes);
  await goToStep(page, 1);
  await expect(field(page, 1)).toHaveValue(notes[1]);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.currentStep,
        storageKey,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.goto(`${base}/attempt?id=${original.id}`);
  await page.reload();
  await openGuide(page);
  await expectStep(page, 1);
  await expect(field(page, 1)).toHaveValue(notes[1]);
  // Existing version-1 notes predate the stepper. Only remove its new optional
  // field from this synthetic user's real saved record to model that format.
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!);
    delete saved.currentStep;
    localStorage.setItem(key, JSON.stringify(saved));
  }, storageKey);
  await page.reload();
  await openGuide(page);
  await expectStep(page, 0);
  await expect(field(page, 0)).toHaveValue(notes[0]);
  await expectAnswers(page, notes);
  await goToStep(page, 1);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.currentStep,
        storageKey,
      ),
    )
    .toBe(1);
  await page.getByTestId("thought-guide").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("guiding-questions-mobile.png"),
  });

  // Another completed attempt must not inherit this attempt's private notes.
  await page.goto(`${base}/attempt?id=${other.id}`);
  await openGuide(page);
  await expectStep(page, 0);
  await expectAnswers(page, ["", "", ""]);
  await page.goto(`${base}/attempt?id=${original.id}`);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "Your response",
    exact: true,
  });
  await expect(editor).toHaveValue(answer);
  await expect(page.getByTestId("thought-guide-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await openGuide(page);
  await expectStep(page, 1);
  await expect(field(page, 1)).toHaveValue(notes[1]);
  await expectAnswers(page, notes);
  await expect(editor).toHaveValue(answer);
  await editor.fill(revised);
  await page
    .getByRole("button", { name: "Reflect first", exact: true })
    .click();
  const reflection = "Next time, I could make my example more specific.";
  await page
    .getByRole("textbox", { name: "Your reflection", exact: true })
    .fill(reflection);
  const submission = page.waitForRequest(
    (request) =>
      request.url() === `${backend}/api/attempts` &&
      request.method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  const body = (await submission).postDataJSON();
  expect(body).toMatchObject({
    text: revised,
    selfReflection: reflection,
    retryOf: original.id,
  });
  expect(JSON.stringify(body)).not.toContain("PRIVATE_GUIDE_NOTE_ONLY_MARKER");
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  const completed = await state(page);
  const revision = completed.attempts.find(
    (attempt) => attempt.retryOf === original.id,
  )!;
  expect(revision.text).toBe(revised);
  expect(revision.selfReflection).toBe(reflection);
  expect(
    completed.attempts.find((attempt) => attempt.id === original.id)?.text,
  ).toBe(answer);
  expect(JSON.stringify(completed)).not.toContain(
    "PRIVATE_GUIDE_NOTE_ONLY_MARKER",
  );
  await openGuide(page);
  await expectStep(page, 0);
  await expectAnswers(page, ["", "", ""]);

  // Switch the authenticated session via the real API while deliberately
  // retaining device storage. This exercises account-scoped reads even when
  // the usual Settings sign-out cleanup has not removed another user's drafts.
  const logout = await page.request.post(`${backend}/api/auth/logout`, {
    headers,
    data: {},
  });
  expect(logout.ok()).toBeTruthy();
  const secondProfile = await guest(page, "Second Gardener");
  expect(secondProfile.id).not.toBe(profile.id);
  const secondAttempt = await completedAttempt(page, answer);
  await page.goto(`${base}/attempt?id=${secondAttempt.id}`);
  await openGuide(page);
  await expectStep(page, 0);
  await expectAnswers(page, ["", "", ""]);
  await expect(page.getByText(/PRIVATE_GUIDE_NOTE_ONLY_MARKER/)).toHaveCount(0);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null")?.answers,
      storageKey,
    ),
  ).toEqual(notes);
  await goToStep(page, 0);
  await field(page, 0).fill("A separate account's private idea.");
  const secondKey = `mind-garden-draft:${secondProfile.id}:thought-guide:${secondAttempt.id}`;
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.answers?.[0],
        secondKey,
      ),
    )
    .toBe("A separate account's private idea.");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null")?.answers,
      storageKey,
    ),
  ).toEqual(notes);
  expect(errors).toEqual([]);
});
