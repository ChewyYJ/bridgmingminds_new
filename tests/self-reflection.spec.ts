import { expect, test, type Page } from "@playwright/test";
import type { AppState } from "../src/types";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
test.setTimeout(90_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || "http://localhost:3002";
const answer =
  "A small trial could help us compare outcomes before making a wider change. We should ask the people affected and describe the limits, because one result may not apply in every setting.";
const note =
  "Next time, I could give a more specific example and ask what would change my view.";

async function state(page: Page): Promise<AppState> {
  const response = await page.request.get(`${backend}/api/state`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("reflection drafts resume separately, and Skip clears a saved note without changing the response", async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(15_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const health = await (await page.request.get(`${backend}/api/health`)).json();
  expect(
    health.provider,
    "Reflection workflow must not call a paid provider",
  ).toBe("local");
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Reflecting Gardener");
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await page.getByRole("button", { name: "Spin & Speak", exact: true }).click();
  await page
    .getByRole("button", { name: "Spin a prompt", exact: true })
    .click();
  await page.getByRole("button", { name: "Skip prep", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(answer);
  await expect(
    page.getByRole("button", { name: "Get feedback", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("self-reflection")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Get feedback", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("direct-feedback-mobile.png"),
  });
  await page
    .getByRole("button", { name: "Reflect first", exact: true })
    .click();
  await expect(page.getByTestId("self-reflection-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "What could be better?", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("original-response-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByTestId("original-response-details")).toHaveCount(0);
  const noteEditor = page.getByRole("textbox", {
    name: "Your reflection",
    exact: true,
  });
  await expect(noteEditor).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Get feedback", exact: true }),
  ).toBeEnabled();
  await noteEditor.fill(note);
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Spin & Speak", exact: true }).click();
  await expect(noteEditor).toHaveValue(note);
  await page.getByTestId("original-response-toggle").click();
  await expect(
    page.getByRole("textbox", { name: "Your response", exact: true }),
  ).toHaveValue(answer);
  await page.getByTestId("original-response-toggle").click();
  const before = await state(page);
  expect(before.attempts).toHaveLength(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByTestId("self-reflection").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("self-reflection-mobile.png"),
  });
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible({ timeout: 25_000 });
  const firstState = await state(page);
  expect(firstState.attempts).toHaveLength(1);
  const first = firstState.attempts[0];
  expect(first.text).toBe(answer);
  expect(first.selfReflection).toBe(note);
  expect(first.status).toBe("completed");
  for (const dimension of first.evaluation!.dimensions) {
    for (const span of dimension.evidence_spans) {
      expect(answer.slice(span.start, span.end)).toBe(span.quote);
      expect(span.quote).not.toContain(note);
    }
  }
  await page
    .getByRole("button", { name: "Review my saved response", exact: true })
    .click();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const revision = `${answer} A result from a different community could challenge my initial conclusion.`;
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(revision);
  await page
    .getByRole("button", { name: "Reflect first", exact: true })
    .click();
  await expect(noteEditor).toHaveValue("");
  const discardedNote = "This note should be discarded when I choose Skip.";
  await noteEditor.fill(discardedNote);
  // Save the real response and note, then fail only queuing. Skip must clear
  // an already persisted note on this same draft, not just an unsent field.
  const evaluateUrl = /\/api\/attempts\/[^/]+\/evaluate$/;
  await page.route(evaluateUrl, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      json: { error: "Test connection interrupted before evaluation." },
    }),
  );
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Test connection interrupted",
  );
  const waiting = await state(page);
  const draft = waiting.attempts.find(
    (attempt) => attempt.retryOf === first.id,
  )!;
  expect(draft.status).toBe("draft");
  expect(draft.selfReflection).toBe(discardedNote);
  expect(draft.text).toBe(revision);
  expect(waiting.wallet).toEqual(firstState.wallet);
  await page.unroute(evaluateUrl);
  await page
    .getByRole("button", { name: "Skip reflection", exact: true })
    .click();
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible({ timeout: 25_000 });
  const final = await state(page);
  expect(final.attempts).toHaveLength(2);
  const retried = final.attempts.find((attempt) => attempt.id === draft.id)!;
  expect(retried.status).toBe("completed");
  expect(retried.selfReflection).toBe("");
  expect(retried.text).toBe(revision);
  expect(
    final.attempts.find((attempt) => attempt.id === first.id)?.selfReflection,
  ).toBe(note);
  await page
    .getByRole("button", { name: "Review my saved response", exact: true })
    .click();
  await expect(page.getByText(discardedNote, { exact: true })).toHaveCount(0);
  await expect(page.getByText(revision, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
