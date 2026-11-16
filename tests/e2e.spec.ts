import { continueWithoutReflection } from "./helpers/self-reflection";
import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

// Use the installed Chrome channel here. For a portable CI run install Playwright's
// browser and set PLAYWRIGHT_CHANNEL=chromium, or configure another valid channel.
test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
test.setTimeout(180_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || "http://localhost:3002";
const screenshots = path.join(process.cwd(), "docs", "screenshots");
const response =
  "I think a clear example helps people understand because it connects an abstract claim to something they can examine. For example, a small trial could compare two approaches before a wider change. However, one example may not apply to everyone, so we should explain the limits.";
const revised = `${response} A fair alternative is to ask people affected by the change what evidence they would need; this could reveal assumptions that my first explanation missed.`;

async function nav(page: Page, name: string) {
  await page
    .getByRole("button", { name: `Navigate to ${name}`, exact: true })
    .or(page.getByRole("button", { name, exact: true }))
    .or(page.getByRole("tab", { name, exact: true }))
    .or(page.getByRole("link", { name, exact: true }))
    .first()
    .click();
}
async function state(page: Page) {
  const result = await page.request.get(`${backend}/api/state`);
  expect(
    result.ok(),
    `Authenticated state request (${result.status()})`,
  ).toBeTruthy();
  return result.json();
}
async function screenshot(page: Page, name: string) {
  await mkdir(screenshots, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.screenshot({ path: path.join(screenshots, name), fullPage: true });
}
async function feedback(page: Page) {
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByText("Coaching only · no scores", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("From your saved answer", { exact: true }),
  ).toHaveCount(0);
  const saved = await state(page);
  const attempt = saved.attempts.find(
    (item: any) => item.status === "completed",
  );
  expect(attempt).toBeTruthy();
  expect(attempt.evaluation.overall_score).toBeNull();
  expect(attempt.evaluation.assessment.validation_status).toBe("unvalidated");
  expect(attempt.evaluation.assessment.scoring_method).toBe("local_prompts");
  for (const dimension of attempt.evaluation.dimensions) {
    expect(dimension.level).toBeNull();
    await expect(
      page.getByTestId(`grow-dimension-${dimension.key}`),
    ).toContainText(dimension.label);
    await expect(
      page.getByTestId(`grow-dimension-${dimension.key}`),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId(`grow-detail-${dimension.key}`)).toHaveCount(
      0,
    );
  }
  for (const dimension of attempt.evaluation.dimensions) {
    const toggle = page.getByTestId(`grow-dimension-${dimension.key}`);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const details = page.getByTestId(`grow-detail-${dimension.key}`);
    await expect(details).toBeVisible();
    if (dimension.level !== null)
      expect(dimension.evidence_spans.length).toBeGreaterThan(0);
    for (const [index, span] of dimension.evidence_spans.entries()) {
      expect(attempt.text.slice(span.start, span.end)).toBe(span.quote);
      const quote = page.getByTestId(`grow-evidence-${dimension.key}-${index}`);
      await expect(quote).toBeVisible();
      expect(await quote.textContent()).toBe(`“${span.quote}”`);
    }
    await expect(
      details.getByText("From your saved answer", { exact: true }),
    ).toHaveCount(dimension.evidence_spans.length);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(details).toHaveCount(0);
  }
  await expect(
    page.getByText("From your saved answer", { exact: true }),
  ).toHaveCount(0);
  return attempt;
}

async function feedbackDisclosures(page: Page, savedAnswer: string) {
  await page
    .getByRole("button", { name: "Review my saved response", exact: true })
    .click();
  await expect(page.getByText(savedAnswer, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Hide my saved response", exact: true })
    .click();
  await expect(page.getByText(savedAnswer, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("From your saved answer", { exact: true }),
  ).toHaveCount(0);
  const method = page.getByTestId("assessment-criteria-details");
  await expect(method).toHaveCount(0);
  await page
    .getByRole("button", { name: "How this feedback works", exact: true })
    .click();
  await expect(method).toBeVisible();
  await expect(
    method.getByText(/^Research-informed coaching; this adaptation/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hide assessment method", exact: true })
    .click();
  await expect(method).toHaveCount(0);
}

async function compactFeedbackOnPhone(page: Page, savedAnswer: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  const grounded = page.getByTestId("grow-dimension-grounded");
  await grounded.scrollIntoViewIfNeeded();
  await grounded.focus();
  await grounded.press("Enter");
  await expect(grounded).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("grow-detail-grounded")).toBeVisible();
  await grounded.press("Space");
  await expect(grounded).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("grow-detail-grounded")).toHaveCount(0);
  await feedbackDisclosures(page, savedAnswer);

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  for (const dimension of [
    "grounded",
    "reasoned",
    "organised",
    "well_rounded",
  ]) {
    const bounds = await page
      .getByTestId(`grow-dimension-${dimension}`)
      .boundingBox();
    expect(bounds).toBeTruthy();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  const heading = page.getByText("Practice complete", {
    exact: true,
  });
  await heading.evaluate((element) =>
    element.scrollIntoView({ block: "start" }),
  );
  await screenshot(page, "feedback-neat-mobile.png");
  await page
    .getByRole("heading", { name: "Response review", exact: true })
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await screenshot(page, "feedback-grow-mobile.png");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await heading.evaluate((element) =>
    element.scrollIntoView({ block: "start" }),
  );
}

test("complete the learning loop, preserve drafts and accounts, and isolate personal data", async ({
  page,
  browser,
}) => {
  page.setDefaultTimeout(15_000);
  const runtimeErrors: string[] = [];
  const renderErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Unexpected text node|unique .*key.* prop|Invalid hook|Cannot update a component/.test(
        message.text(),
      )
    )
      renderErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Curious Tester");
  await page.getByRole("button", { name: "Reasoning", exact: true }).click();
  await page
    .getByRole("button", { name: "Start learning", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Hi, Curious/ }),
  ).toBeVisible();
  const initial = await state(page);
  expect(initial.profile.onboardingComplete).toBe(true);
  expect(initial.profile.goal).toBe("reasoning");
  expect(initial.wallet.seeds).toBeGreaterThanOrEqual(1);
  expect(initial.plots.some((plot: any) => plot.plantType)).toBe(false);
  expect(initial.profile.consent.recording).toBe(false);
  await screenshot(page, "desktop-home.png");

  await test.step("server-selected prompt, failed submission, and restored draft", async () => {
    await page
      .getByRole("button", { name: "Spin & Speak", exact: true })
      .click();
    const criteria = page.getByTestId("assessment-criteria-toggle");
    await expect(criteria).toHaveAttribute("aria-expanded", "false");
    await criteria.click();
    await expect(
      page.getByTestId("assessment-criterion-grounded"),
    ).toContainText("Support");
    await expect(
      page.getByTestId("assessment-criterion-well_rounded"),
    ).toContainText("Nuance");
    await criteria.click();
    const selected = page.waitForResponse(
      (result) =>
        result.url().endsWith("/api/sessions") &&
        result.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Spin a prompt", exact: true })
      .click();
    const session = await (await selected).json();
    await expect(
      page.getByText(session.prompt.question, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Skip prep", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Your response", exact: true })
      .fill(response);
    await page.route("**/api/attempts", (route) => route.abort("failed"));
    await continueWithoutReflection(page);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Your response", exact: true }),
    ).toHaveValue(response);
    await page.unroute("**/api/attempts");
    await page
      .getByRole("button", { name: "Save & close", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Spin & Speak", exact: true })
      .click();
    await expect(page.getByTestId("self-reflection")).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Your response", exact: true }),
    ).toHaveValue(response);
    await continueWithoutReflection(page);
    const attempt = await feedback(page);
    expect(attempt.prompt).toBe(session.prompt.question);
    expect(attempt.text).toBe(response);
    await feedbackDisclosures(page, response);
    await compactFeedbackOnPhone(page, response);
    await screenshot(page, "desktop-feedback.png");
  });

  const original = (await state(page)).attempts[0];
  await test.step("linked retry, evidence review, and feedback report", async () => {
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Your response", exact: true }),
    ).toHaveValue(response);
    await page
      .getByRole("textbox", { name: "Your response", exact: true })
      .fill(revised);
    await continueWithoutReflection(page);
    const attempt = await feedback(page);
    expect(attempt.retryOf).toBe(original.id);
    expect(attempt.text).toBe(revised);
    await page
      .getByRole("button", { name: "Review my saved response", exact: true })
      .click();
    await expect(page.getByText(revised, { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Flag questionable feedback", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "What should be reviewed?", exact: true })
      .fill(
        "Please review whether the Grounded suggestion reflects the limitations I stated.",
      );
    await page
      .getByRole("button", { name: "Save feedback concern", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Concern saved for review",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
  });

  await test.step("two-round debate and saved conversation", async () => {
    await page
      .getByRole("button", { name: "Debate Garden", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Against the proposition", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start debate", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Your opening argument", exact: true })
      .fill(
        "I oppose unrestricted AI homework because a finished answer can hide whether the student understood the steps. For example, a teacher could ask for an independent explanation. However, carefully designed support may help learners who are stuck.",
      );
    await page
      .getByRole("button", { name: "Send my argument", exact: true })
      .click();
    await expect(page.getByText("ROUND 2 OF 2", { exact: true })).toBeVisible();
    await expect(
      page.getByText("PRACTICE COACH", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save & close", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Debate Garden", exact: true })
      .click();
    await expect(page.getByText("ROUND 2 OF 2", { exact: true })).toBeVisible();
    await page
      .getByRole("textbox", {
        name: "Your response to the challenge",
        exact: true,
      })
      .fill(
        "That concern is fair because banning a tool could remove useful support. I would compare independent explanations before and after a supervised trial. However, students should disclose their use and have an alternative that does not require sharing private information.",
      );
    await continueWithoutReflection(page);
    const attempt = await feedback(page);
    expect(attempt.mode).toBe("debate");
    expect(attempt.text).toContain("Round 2:");
    await expect(
      page.getByText("DEBATE SUMMARY", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
  });

  await test.step("curated source, chosen reflection question, and journal", async () => {
    await nav(page, "Discover");
    await expect(
      page.getByText(/Curated reading · Summaries for practice/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Science", exact: true }).click();
    await page
      .getByRole("button", {
        name: "What can a distant planet teach us about evidence?",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("ORIGINAL EDITORIAL SUMMARY", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Read at NASA", exact: true }),
    ).toBeVisible();
    const question =
      "Examine: Why is the word “may” useful when communicating this finding?";
    await page
      .getByRole("radio", { name: new RegExp("Why is the word") })
      .click();
    await page
      .getByRole("button", { name: "Start reflection", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Your response", exact: true })
      .fill(
        "The word may matters because the Webb observations suggest atmospheric gases around 55 Cancri e rather than proving every explanation. The NASA summary describes carbon monoxide or carbon dioxide as possibilities. However, it does not show that the planet is habitable; more observations could challenge this inference.",
      );
    await continueWithoutReflection(page);
    const attempt = await feedback(page);
    expect(attempt.mode).toBe("read_reflect");
    expect(attempt.prompt).toBe(question);
    await page
      .getByRole("button", { name: "Save to journal", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Saved to journal",
        exact: true,
      }),
    ).toBeVisible();
    expect((await state(page)).journal).toHaveLength(1);
    await page.getByRole("button", { name: "Done", exact: true }).click();
  });

  await test.step("plant, nurture to bloom, and inspect saved profile", async () => {
    await nav(page, "Garden");
    await page.getByRole("button", { name: "Flowers", exact: true }).click();
    await page
      .getByRole("button", { name: "Plot 1, empty", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Plant · 1 seed", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Plot 1, daisy, seed", exact: true }),
    ).toBeVisible();
    for (const stage of ["sprout", "growing", "bloom"]) {
      await page
        .getByRole("button", { name: "Water · 1 water", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: `Plot 1, daisy, ${stage}`,
          exact: true,
        }),
      ).toBeVisible();
    }
    await page
      .getByRole("button", {
        name: "Stepping stones · 2 sunlight",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Stepping stones · placed",
        exact: true,
      }),
    ).toBeVisible();
    expect((await state(page)).decorations).toContain("stepping_stones");
    await screenshot(page, "desktop-garden.png");
    await nav(page, "Profile");
    await expect(
      page.getByText("Curious explorer", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Fully grown", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        /^New provisional ratings and local coaching are excluded from/,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^View practice:/ }),
    ).toHaveCount(4);
    await expect(
      page.getByText("Thought journal", { exact: true }),
    ).toBeVisible();
    await screenshot(page, "desktop-profile.png");
    const detail = (await state(page)).attempts[0];
    await page
      .getByRole("button", { name: /^View practice:/ })
      .first()
      .click();
    await expect(
      page.getByText("Practice complete", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Review my saved response", exact: true })
      .click();
    await expect(page.getByText(detail.text, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /^View practice:/ }),
    ).toHaveCount(4);
    await page.reload();
    const saved = await state(page);
    expect(
      saved.attempts.filter((item: any) => item.status === "completed"),
    ).toHaveLength(4);
    expect(saved.plots[0].growth).toBe(3);
    expect(saved.journal).toHaveLength(1);
  });

  // Upgrade and sign in through the visible account controls; a fresh browser
  // context models another device connecting to the same local backend.
  const email = `garden-e2e-${Date.now()}@example.test`;
  const password = "Garden-E2E-Password-42";
  await nav(page, "Profile");
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Account email", exact: true })
    .fill(email);
  await page.getByLabel("Account password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Create account.*keep/i }).click();
  await expect
    .poll(async () => (await state(page)).profile.isGuest)
    .toBe(false);
  const account = await state(page);
  expect(account.profile.id).toBe(initial.profile.id);
  expect(account.attempts).toHaveLength(4);

  const second = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const other = await second.newPage();
  await other.goto(base);
  await other.getByRole("button", { name: "Sign in", exact: true }).click();
  await other.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await other.getByLabel("Password", { exact: true }).fill(password);
  await other.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    other.getByRole("heading", { name: /Hi, Curious/ }),
  ).toBeVisible();
  expect((await state(other)).attempts).toHaveLength(4);
  expect((await state(other)).plots[0].growth).toBe(3);
  await screenshot(other, "mobile-home.png");
  await other.setViewportSize({ width: 768, height: 1024 });
  await screenshot(other, "tablet-home.png");
  expect(
    await other.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await other.setViewportSize({ width: 390, height: 844 });
  await nav(other, "Garden");
  await expect(
    other.getByRole("button", { name: "Plot 1, daisy, bloom", exact: true }),
  ).toBeVisible();
  await screenshot(other, "mobile-garden.png");
  expect(
    await other.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();
  await stranger.goto(base);
  await stranger
    .getByRole("button", { name: "Try as guest", exact: true })
    .click();
  await stranger
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Separate Gardener");
  await stranger
    .getByRole("button", { name: "Start learning", exact: true })
    .click();
  const strangerState = await state(stranger);
  expect(strangerState.profile.id).not.toBe(account.profile.id);
  expect(strangerState.attempts).toHaveLength(0);
  expect(strangerState.journal).toHaveLength(0);
  expect(
    (
      await stranger.request.get(`${backend}/api/attempts/${original.id}`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await stranger.request.get(
        `${backend}/api/sessions/${original.sessionId}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await stranger.request.post(`${backend}/api/journal`, {
        data: { attemptId: original.id },
        headers: { Origin: new URL(base).origin },
      })
    ).status(),
  ).toBe(404);

  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export my data", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("my-mind-garden.json");
  const downloadPath = await download.path();
  expect(
    JSON.parse(await readFile(downloadPath!, "utf8")).attempts,
  ).toHaveLength(4);

  const exported = await page.request.get(`${backend}/api/export`);
  expect(exported.ok()).toBe(true);
  const data = await exported.json();
  expect(data.attempts).toHaveLength(4);
  expect(data.reports).toHaveLength(1);
  expect(data.journal).toHaveLength(1);
  expect(runtimeErrors).toEqual([]);
  expect(renderErrors).toEqual([]);
  await stranger.request.delete(`${backend}/api/account`, {
    headers: { Origin: new URL(base).origin },
  });
  await page
    .getByRole("button", { name: "Delete personal data", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Type DELETE to confirm", exact: true })
    .fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete my data", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Try as guest", exact: true }),
  ).toBeVisible();
  expect((await other.request.get(`${backend}/api/state`)).status()).toBe(401);
  await strangerContext.close();
  await second.close();
});
