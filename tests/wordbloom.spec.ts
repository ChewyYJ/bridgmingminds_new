import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { continueWithoutReflection } from "./helpers/self-reflection";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
test.setTimeout(120000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || "http://localhost:3002";
const answer =
  "We could work together on a shared garden. Each neighbour could suggest a plant and explain what it needs.";
const notes =
  "I practised the final phrase and noticed a comfortable place to pause.";
async function state(page: Page) {
  return (await page.request.get(`${backend}/api/state`)).json();
}
async function summary(page: Page) {
  return (await page.request.get(`${backend}/api/wordbloom/summary`)).json();
}
async function onboard(page: Page) {
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("WordBloom Learner");
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start my daily workout", exact: true })
    .click();
  await expect(page.getByTestId("daily-progress")).toHaveText("0/2");
}
async function speak(page: Page, text = answer) {
  await page.getByRole("button", { name: "Spin & Speak", exact: true }).click();
  await page
    .getByRole("button", { name: "Spin a prompt", exact: true })
    .click();
  await page.getByRole("button", { name: "Skip prep", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(text);
  await continueWithoutReflection(page);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible({ timeout: 25000 });
}
async function finishReading(page: Page) {
  await page
    .getByRole("textbox", { name: "Your reading observation", exact: true })
    .fill(notes);
  await page
    .getByRole("checkbox", {
      name: "I practised this passage and reviewed my reading",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your reading feedback", exact: true }),
  ).toBeVisible();
}
async function capture(page: Page, file: string) {
  const folder = join(process.cwd(), "docs/screenshots/wordbloom");
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: join(folder, file), fullPage: true });
}

test("WordBloom travels from a real speaking response into reading without a third activity", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await onboard(page);
  await speak(page);
  await expect(page.getByTestId("wordbloom-preview")).toContainText(
    "collaborate",
  );
  expect((await summary(page)).words[0].source.kind).toBe("curated_match");
  await capture(page, "suggestion-mobile.png");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByTestId("daily-progress")).toHaveText("1/2");
  await page.getByRole("button", { name: "Read Aloud", exact: true }).click();
  await expect(page.getByTestId("wordbloom-highlight-collaborate")).toHaveText(
    "collaborate",
  );
  await page
    .getByRole("button", { name: "Meaning of collaborate", exact: true })
    .click();
  await expect(page.getByTestId("wordbloom-definition")).toContainText(
    "Work with others towards a shared goal",
  );
  await page
    .getByRole("button", { name: "Practise collaborate again", exact: true })
    .click();
  await capture(page, "reading-word-mobile.png");
  await finishReading(page);
  let word = (await summary(page)).words[0];
  expect(word.exposureCount).toBe(1);
  expect(word.intervalDays).toBe(1);
  expect(word.productiveUseCandidates).toBe(0);
  await page
    .getByRole("button", { name: "Return to daily workout", exact: true })
    .click();
  await expect(page.getByTestId("daily-progress")).toHaveText("2/2");
  expect((await state(page)).xp).toBe(25);
  await speak(
    page,
    "Neighbours can collaborate on a small garden. Each person can share one practical idea.",
  );
  expect((await summary(page)).words[0].productiveUseCandidates).toBe(1);
  expect((await state(page)).xp).toBe(25);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Navigate to Profile", exact: true })
    .click();
  await expect(page.getByTestId("wordbloom-progress")).toContainText(
    "1 reading exposures",
  );
  await expect(page.getByTestId("wordbloom-progress")).toContainText(
    "1 provisional later-use candidates",
  );
  await page
    .getByRole("button", { name: "Pause WordBloom", exact: true })
    .click();
  await expect(page.getByTestId("wordbloom-progress")).toContainText(
    "WordBloom is paused",
  );
  await page
    .getByRole("button", { name: "Resume WordBloom", exact: true })
    .click();
  await page
    .getByRole("button", { name: "I know collaborate", exact: true })
    .click();
  await expect(page.getByTestId("wordbloom-status-collaborate")).toContainText(
    "Marked familiar by you",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(page, "progress-desktop.png");
  word = (await summary(page)).words[0];
  expect(word.familiaritySource).toBe("self_report");
  expect(errors).toEqual([]);
});

test("reading-first content remains immutable after a word is scheduled", async ({
  page,
}) => {
  await onboard(page);
  await page.getByRole("button", { name: "Read Aloud", exact: true }).click();
  await expect(page.getByTestId("reading-passage")).toBeVisible();
  const first = await (
    await page.request.get(`${backend}/api/read-aloud/assignment`)
  ).json();
  expect(first.wordbloom.words).toEqual([]);
  await finishReading(page);
  await page
    .getByRole("button", { name: "Return to daily workout", exact: true })
    .click();
  await speak(page);
  await expect(page.getByTestId("wordbloom-preview")).toContainText(
    "collaborate",
  );
  const same = await (
    await page.request.get(`${backend}/api/read-aloud/assignment`)
  ).json();
  expect(same.id).toBe(first.id);
  expect(same.passage).toEqual(first.passage);
  expect(same.wordbloom).toEqual(first.wordbloom);
  expect((await state(page)).xp).toBe(25);
});

test("a lost dismissal response recovers without resurfacing the word or blocking daily completion", async ({
  page,
}) => {
  await onboard(page);
  await speak(page);
  await expect(page.getByTestId("wordbloom-preview")).toContainText(
    "collaborate",
  );
  const word = (await summary(page)).words[0];
  await page.route(
    `**/api/wordbloom/${word.id}`,
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Dismiss collaborate", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss collaborate", exact: true })
    .click();
  await expect(page.getByTestId("wordbloom-status-collaborate")).toContainText(
    "Dismissed",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Read Aloud", exact: true }).click();
  await expect(page.getByTestId("reading-passage")).toBeVisible();
  await expect(page.getByTestId("wordbloom-highlight-collaborate")).toHaveCount(
    0,
  );
  await finishReading(page);
  expect((await state(page)).xp).toBe(25);
  expect((await summary(page)).words[0].status).toBe("dismissed");
});
