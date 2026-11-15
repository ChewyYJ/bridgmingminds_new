import { continueWithoutReflection } from "./helpers/self-reflection";
import { expect, test, type Page } from "@playwright/test";
import type { AppState, Attempt } from "../src/types";

// Real local API and SQLite throughout. Only the comparison GET failure is
// injected; no fabricated saved attempts, ratings, rewards, or source content.
test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
test.setTimeout(120_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || "http://localhost:3002";
const runtimeErrors = new WeakMap<Page, string[]>();

async function state(page: Page): Promise<AppState> {
  const result = await page.request.get(`${backend}/api/state`);
  expect(result.ok()).toBeTruthy();
  return result.json();
}

async function onboard(page: Page, name: string) {
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill(name);
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Hi, ${name.split(" ")[0]}.`,
      exact: true,
    }),
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

async function completed(page: Page, text: string): Promise<Attempt> {
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible({
    timeout: 25_000,
  });
  await expect(
    page.getByText("Coaching only · no scores", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await state(page)).attempts.find((item) => item.text === text)?.status,
    )
    .toBe("completed");
  const attempt = (await state(page)).attempts.find(
    (item) => item.text === text,
  )!;
  expect(attempt.evaluation?.provider).toBe("local");
  return attempt;
}

async function compare(page: Page, earlier: string, revision: string) {
  const toggle = page.getByTestId("thought-trail-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("thought-trail-details")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("thought-trail-earlier")).toHaveText(earlier);
  await expect(page.getByTestId("thought-trail-revision")).toHaveText(revision);
  // Exact textContent additionally protects whitespace in saved responses.
  expect(await page.getByTestId("thought-trail-earlier").textContent()).toBe(
    earlier,
  );
  expect(await page.getByTestId("thought-trail-revision").textContent()).toBe(
    revision,
  );
}

async function reopenLatest(page: Page) {
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await nav(page, "Profile");
  await page
    .getByRole("button", { name: /^View practice:/ })
    .first()
    .click();
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  // Reload the persisted attempt route, not the new-practice setup route.
  await page.reload();
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(15_000);
  const health = await (await page.request.get(`${backend}/api/health`)).json();
  expect(
    health.provider,
    "These workflows must not make paid provider calls",
  ).toBe("local");
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) || []).toEqual([]);
});

test("a daily idea becomes a saved revision with a recoverable comparison and deliberate garden handoff", async ({
  page,
}, testInfo) => {
  await onboard(page, "Daily Reader");
  await expect(page.getByText("Today’s idea", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Explore this idea", exact: true })
    .click();
  await expect(
    page.getByText("ORIGINAL EDITORIAL SUMMARY", { exact: true }),
  ).toBeVisible();
  const sessionResponse = page.waitForResponse(
    (result) =>
      result.url().endsWith("/api/sessions") &&
      result.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Start reflection", exact: true })
    .click();
  const session = await (await sessionResponse).json();
  expect(session.mode).toBe("read_reflect");
  expect(session.articleId).toBeTruthy();
  expect(session.articleSnapshot.sourceUrl).toMatch(/^https:\/\//);
  expect(session.articleSnapshot.summary.length).toBeGreaterThan(20);
  const originalText =
    "The summary offers a useful starting point because it gives a claim we can examine. I would distinguish what the source observed from what it inferred, and ask what evidence might change its conclusion.";
  const revisedText = `${originalText}\n\nI would also compare the source with an independent account and explain which uncertainty remains before applying the idea elsewhere.`;
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(originalText);
  await continueWithoutReflection(page);
  const original = await completed(page, originalText);
  expect(original.articleId).toBe(session.articleId);
  expect(original.prompt).toBe(session.prompt.question);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Your response", exact: true }),
  ).toHaveValue(originalText);
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(revisedText);

  const comparisonUrl = `${backend}/api/attempts/${original.id}`;
  let failedComparisons = 0;
  await page.route(comparisonUrl, async (route) => {
    if (route.request().method() === "GET" && failedComparisons === 0) {
      failedComparisons += 1;
      await route.abort("connectionfailed");
    } else await route.continue();
  });
  await continueWithoutReflection(page);
  const revision = await completed(page, revisedText);
  expect(revision.retryOf).toBe(original.id);
  await expect(
    page.getByText("Your earlier response couldn’t be loaded.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(failedComparisons).toBe(1);
  expect(
    (await state(page)).attempts.find((item) => item.id === original.id)?.text,
  ).toBe(originalText);
  await page.unroute(comparisonUrl);
  await page
    .getByRole("button", { name: "Reload comparison", exact: true })
    .click();
  await compare(page, originalText, revisedText);
  await page.getByTestId("thought-trail").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("thought-trail-desktop.png"),
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("thought-trail").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  // Saved text can wrap well past an incorrectly constrained flex panel while
  // the document still has no horizontal overflow. Check both axes and both
  // containing panels, not only viewport width or text visibility.
  for (const id of ["thought-trail-earlier", "thought-trail-revision"]) {
    const response = page.getByTestId(id);
    await expect
      .poll(
        async () => {
          const text = await response.boundingBox();
          const containers = await Promise.all([
            response.locator("..").boundingBox(),
            page.getByTestId("thought-trail-details").boundingBox(),
          ]);
          return containers.map(
            (panel) =>
              !!text &&
              !!panel &&
              text.x >= panel.x - 1 &&
              text.y >= panel.y - 1 &&
              text.x + text.width <= panel.x + panel.width + 1 &&
              text.y + text.height <= panel.y + panel.height + 1,
          );
        },
        {
          message: `${id} must fit its colored panel and disclosure on mobile`,
        },
      )
      .toEqual([true, true]);
  }
  await page.screenshot({
    path: testInfo.outputPath("thought-trail-mobile.png"),
  });
  const toggle = page.getByTestId("thought-trail-toggle");
  await toggle.focus();
  await toggle.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await reopenLatest(page);
  await compare(page, originalText, revisedText);
  const beforeGarden = await state(page);
  expect(beforeGarden.attempts).toHaveLength(2);
  expect(beforeGarden.plots.every((plot) => !plot.plantType)).toBe(true);
  await page.getByRole("button", { name: "Open Homeland", exact: true }).click();
  await expect(page.getByTestId("garden-canvas")).toBeVisible();
  const afterGarden = await state(page);
  expect(afterGarden.wallet).toEqual(beforeGarden.wallet);
  expect(afterGarden.plots).toEqual(beforeGarden.plots);
});

test("successive debate revisions start from the latest opening and retain the correct earlier version", async ({
  page,
}) => {
  await onboard(page, "Debate Revising");
  await page
    .getByRole("button", { name: "Debate Garden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Against the proposition", exact: true })
    .click();
  await page.getByRole("button", { name: "Start debate", exact: true }).click();
  const opening =
    "I oppose unrestricted use because a completed answer can hide whether someone understood the steps. A teacher could ask for an independent explanation, while allowing careful support when a learner is stuck.";
  const followup =
    "That concern is fair. I would compare independent explanations before and after a supervised trial, and ask students to disclose how they used the tool. An accessible alternative should remain available.";
  const firstRevision =
    "I would permit guided support but require students to explain their own reasoning. Comparing independent explanations before and after a supervised trial would test whether the support helped learning rather than only producing finished answers.";
  const secondRevision = `${firstRevision}\n\nThe trial should include learners with different needs, and a decline in independent explanations would lead me to revise the policy.`;
  await page
    .getByRole("textbox", { name: "Your opening argument", exact: true })
    .fill(opening);
  await page
    .getByRole("button", { name: "Send my argument", exact: true })
    .click();
  await expect(page.getByText("ROUND 2 OF 2", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", {
      name: "Your response to the challenge",
      exact: true,
    })
    .fill(followup);
  // The final turn is saved before its generated attempt is fetched. Losing
  // only that GET must preserve the turn's text and idempotency key on retry.
  const attemptUrl = /\/api\/attempts\/[^/?]+$/;
  let failedFinalFetch = false;
  await page.route(attemptUrl, async (route) => {
    if (route.request().method() === "GET" && !failedFinalFetch) {
      failedFinalFetch = true;
      await route.abort("connectionfailed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Reflect first", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(failedFinalFetch).toBe(true);
  await expect(
    page.getByRole("textbox", {
      name: "Your response to the challenge",
      exact: true,
    }),
  ).toHaveValue(followup);
  await page.unroute(attemptUrl);
  await page
    .getByRole("button", { name: "Reflect first", exact: true })
    .click();
  await expect(page.getByTestId("self-reflection")).toBeVisible();
  const pending = await state(page);
  expect(pending.attempts).toHaveLength(1);
  expect(pending.attempts[0].status).toBe("draft");
  expect(pending.attempts[0].evaluation).toBeFalsy();
  expect(pending.attempts[0].text).toBe(
    `Round 1: ${opening}\n\nRound 2: ${followup}`,
  );
  const session = await (
    await page.request.get(
      `${backend}/api/sessions/${pending.attempts[0].sessionId}`,
    )
  ).json();
  expect(
    session.turns.filter(
      (turn: { speaker: string }) => turn.speaker === "user",
    ),
  ).toHaveLength(2);
  expect(
    session.turns.filter((turn: { speaker: string }) => turn.speaker === "ai"),
  ).toHaveLength(2);
  const debateNote =
    "Next time, I could address the strongest opposing reason earlier.";
  await page
    .getByRole("textbox", { name: "Your reflection", exact: true })
    .fill(debateNote);
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Continue response", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue this response", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your reflection", exact: true }),
  ).toHaveValue(debateNote);
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  const original = await completed(
    page,
    `Round 1: ${opening}\n\nRound 2: ${followup}`,
  );
  expect(original.id).toBe(pending.attempts[0].id);
  expect(original.selfReflection).toBe(debateNote);
  await page
    .getByRole("button", { name: "Revise opening", exact: true })
    .click();
  const editor = page.getByRole("textbox", {
    name: "Your response",
    exact: true,
  });
  await expect(editor).toHaveValue(opening);
  await editor.fill(firstRevision);
  await continueWithoutReflection(page);
  const first = await completed(page, firstRevision);
  expect(first.retryOf).toBe(original.id);
  await compare(page, opening, firstRevision);

  await page
    .getByRole("button", { name: "Revise opening", exact: true })
    .click();
  await expect(editor).toHaveValue(firstRevision);
  await editor.fill(secondRevision);
  await continueWithoutReflection(page);
  const second = await completed(page, secondRevision);
  expect(second.retryOf).toBe(first.id);
  await compare(page, firstRevision, secondRevision);

  await reopenLatest(page);
  await compare(page, firstRevision, secondRevision);
  expect((await state(page)).attempts).toHaveLength(3);
  // Saved-attempt navigation uses a separate hydration path from in-session retry.
  await page
    .getByRole("button", { name: "Revise opening", exact: true })
    .click();
  await expect(editor).toHaveValue(secondRevision);
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
});
