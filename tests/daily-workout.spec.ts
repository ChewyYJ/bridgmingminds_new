import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test.setTimeout(120_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || "http://localhost:3002";
const notes =
  "I practised the final sentence and noticed that pausing at the comma made it easier to follow.";
const answer =
  "A shared garden can help neighbours meet because it gives them something to look after together. For example, they could discuss where to place a new plant and explain what it needs. A small trial would show which ideas work in that space.";

async function state(page: Page) {
  const response = await page.request.get(`${backend}/api/state`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function onboard(page: Page) {
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Daily Learner");
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Read aloud", exact: true })
    .click();
  await page.getByRole("button", { name: "Daily challenge", exact: true }).click();
  await expect(page.getByTestId("daily-progress")).toHaveText("0/2");
}
async function read(page: Page) {
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await expect(page.getByTestId("reading-passage")).toBeVisible();
  await page.getByRole("button", { name: "Done reading", exact: true }).click();
  await expect(
    page.getByText("Self-review · no speech scores", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Your reading observation", exact: true })
    .fill(notes);
  await expect(
    page.getByRole("button", { name: "Save reading self-review", exact: true }),
  ).toBeDisabled();
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
  await expect(page.getByTestId("reading-reward")).toHaveText("+10 XP");
  await page
    .getByRole("button", { name: "Return to daily workout", exact: true })
    .click();
}
async function speak(page: Page) {
  await page.getByRole("button", { name: "Spin and reflect", exact: true }).click();
  await page.getByRole("button", { name: "Start brainstorming", exact: true }).click();
  await page.getByRole("button", { name: "Done brainstorming", exact: true }).click();
  const consent = page.getByRole("button", { name: "Allow Private Recording", exact: true });
  if (await consent.count()) await consent.click();
  await page.getByRole("button", { name: "Record my response", exact: true }).click();
  await expect(page.getByRole("button", { name: "Finish recording", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Finish recording", exact: true }).click();
  await page.getByRole("button", { name: "Use recording", exact: true }).click();
  await page.getByRole("textbox", { name: "Transcript", exact: true }).fill(answer);
  await page.getByRole("button", { name: "Get Feedback", exact: true }).click();
  await expect(page.getByTestId("daily-screen-feedback")).toBeVisible();
  await page.getByRole("button", { name: "Finish practice", exact: true }).click();
  await expect(page.getByText("+15", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
async function screenshot(page: Page, file: string) {
  const directory = join(process.cwd(), "docs/screenshots/daily-workout");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, file), fullPage: true });
}

for (const order of ["reading-first", "speaking-first"])
  test(`daily workout ${order}: real UI → API → persistence → 2/2`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await onboard(page);
    const initial = await state(page);
    await screenshot(page, `${order}-0-of-2-mobile.png`);
    if (order === "reading-first") await read(page);
    else await speak(page);
    await expect(page.getByTestId("daily-progress")).toHaveText("1/2");
    await expect(page.getByTestId("daily-streak-status")).toContainText(
      "choose where to start",
    );
    let saved = await state(page);
    expect(saved.dailyWorkout.streak.securedToday).toBe(false);
    expect(saved.xp).toBe(order === "reading-first" ? 10 : 15);
    await page.reload();
    await expect(page.getByTestId("daily-progress")).toHaveText("1/2");
    await screenshot(page, `${order}-1-of-2-mobile.png`);
    if (order === "reading-first") await speak(page);
    else await read(page);
    await expect(page.getByTestId("daily-progress")).toHaveText("2/2");
    await expect(page.getByTestId("daily-streak-status")).toContainText(
      "Both done",
    );
    saved = await state(page);
    expect(saved.xp).toBe(25);
    expect(saved.wallet.seeds).toBe(initial.wallet.seeds + 1);
    expect(saved.streak).toBe(1);
    expect(saved.readAloudAttempts[0].evaluation.speech.metrics).toBeNull();
    await page.reload();
    await expect(page.getByTestId("daily-progress")).toHaveText("2/2");
    await screenshot(page, `${order}-2-of-2-mobile.png`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await screenshot(page, `${order}-2-of-2-desktop.png`);
    await page.getByRole("button", { name: "Read aloud", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Reading practice saved",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(notes, { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Read again for practice", exact: true })
      .click();
    await page.getByRole("button", { name: "Done reading", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Your reading observation", exact: true })
      .fill("I practised a second phrase and tried a shorter pause this time.");
    await page
      .getByRole("checkbox", {
        name: "I practised this passage and reviewed my reading",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Save reading self-review", exact: true })
      .click();
    await expect(page.getByTestId("reading-reward")).toContainText(
      "no duplicate XP",
    );
    expect((await state(page)).xp).toBe(25);
    expect(errors).toEqual([]);
  });

test("reading handles a lost submission response, draft reload and denied microphone", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await onboard(page);
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await page
    .getByRole("button", { name: "Record the passage", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel recording", exact: true })
    .click();
  await page.getByRole("button", { name: "Done reading", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your reading observation", exact: true })
    .fill(notes);
  await page.reload();
  await expect(
    page.getByRole("textbox", {
      name: "Your reading observation",
      exact: true,
    }),
  ).toHaveValue(notes);
  await page
    .getByRole("checkbox", {
      name: "I practised this passage and reviewed my reading",
      exact: true,
    })
    .click();
  await page.route(
    "**/api/read-aloud/assignments/*/submit",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Save reading self-review", exact: true })
    .click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  expect((await state(page)).xp).toBe(10);
  await page
    .getByRole("button", { name: "Save reading self-review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reading practice saved", exact: true }),
  ).toBeVisible();
  expect((await state(page)).xp).toBe(10);
});

test("Read Aloud records, uploads privately, replays and restores a saved take", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await onboard(page);
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await page
    .getByRole("button", { name: "Record the passage", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(page.getByText(/^00:5[0-6]$/, { exact: false })).toBeVisible({
    timeout: 15000,
  });
  await page
    .getByRole("button", { name: "Finish recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Play recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Record another take", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done reading", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your reading observation", exact: true })
    .fill(notes);
  await page
    .getByRole("checkbox", {
      name: "I practised this passage and reviewed my reading",
      exact: true,
    })
    .click();
  await screenshot(page, "read-aloud-recorded-mobile.png");
  await page
    .getByRole("button", { name: "Save reading self-review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reading practice saved", exact: true }),
  ).toBeVisible();
  const saved = await state(page);
  const attempt = saved.readAloudAttempts[0];
  expect(attempt.audioId).toBeTruthy();
  expect(attempt.evaluation.speech.metrics).toBeNull();
  const exported = await (
    await page.request.get(`${backend}/api/export`)
  ).json();
  expect(
    exported.recordings.some(
      (item: { id: string }) => item.id === attempt.audioId,
    ),
  ).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Open saved recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Play recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause playback", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("local BRIDGE shows six criteria and a clearly separate interactive sample map", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await onboard(page);
  await speak(page);
  const completed = await state(page);
  const attempt = completed.attempts[0];
  expect(attempt.evaluation.rubric_version).toBe("bridge-v1");
  expect(attempt.evaluation.dimensions).toHaveLength(6);
  expect(
    attempt.evaluation.dimensions.every(
      (dimension: { level: number | null }) => dimension.level === null,
    ),
  ).toBe(true);
  expect(attempt.evaluation.thought_map.nodes).toEqual([]);
  await page.goto(`${base}/attempt?id=${attempt.id}`);
  await expect(
    page.getByText("Thought Map not assessed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "See full BRIDGE breakdown", exact: true })
    .click();
  await expect(page.getByTestId("bridge-dimension-B")).toContainText(
    "Big Idea",
  );
  await expect(page.getByTestId("bridge-dimension-E")).toContainText(
    "Expression",
  );
  await expect(page.getByTestId("bridge-dimension-D")).toContainText(
    "Not assessed",
  );
  await page
    .getByRole("button", { name: "View sample map", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sample Thought Map", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Demonstration only. This map is not an assessment of your response and earns no progress.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Text outline", exact: true }).click();
  await page.getByTestId("thought-map-outline-claim").click();
  await expect(page.getByTestId("thought-map-source")).toContainText(
    "A shared garden can help neighbours meet.",
  );
  await page.getByTestId("thought-map-outline-link").click();
  await expect(page.getByTestId("thought-map-selected")).toContainText(
    "No learner quotation",
  );
  await expect(page.getByTestId("thought-map-source")).toHaveCount(0);
  await page.getByRole("button", { name: "Map view", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.getByText(/Scroll to explore · 125%/)).toBeVisible();
  await screenshot(page, "bridge-sample-map-mobile.png");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTestId("thought-map-node-claim").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("thought-map-source")).toBeVisible();
  await screenshot(page, "bridge-sample-map-desktop.png");
  await page
    .getByRole("button", { name: "Review my saved response", exact: true })
    .click();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  expect((await state(page)).xp).toBe(15);
  expect((await state(page)).attempts[0].evaluation.thought_map.nodes).toEqual(
    [],
  );
  await page
    .getByRole("button", { name: "Report a feedback concern", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your feedback concern", exact: true })
    .fill("Please review the reasoning link in this response.");
  const reportSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/reports") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Send feedback report", exact: true })
    .click();
  expect((await reportSaved).ok()).toBe(true);
  await expect(
    page.getByRole("button", { name: "Feedback reported", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
