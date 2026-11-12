import { continueWithoutReflection } from "./helpers/self-reflection";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AppState, Attempt } from "../src/types";
import { getThoughtGuide } from "../shared/thought-guide.mjs";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
test.setTimeout(90_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || base;
const headers = { Origin: new URL(base).origin };
const answer =
  "I think a small trial helps people learn because they can compare results before making a wider change. For example, a community could test two approaches. However, one small trial may not represent everybody.";

async function state(page: Page): Promise<AppState> {
  const result = await page.request.get(`${backend}/api/state`);
  expect(result.ok()).toBeTruthy();
  return result.json();
}

async function seedUser(page: Page, displayName: string) {
  page.setDefaultTimeout(15_000);
  const health = await (await page.request.get(`${backend}/api/health`)).json();
  expect(
    health.provider,
    "Browser checks must not make paid provider calls",
  ).toBe("local");
  const guest = await page.request.post(`${backend}/api/auth/guest`, {
    headers,
    data: {},
  });
  expect(guest.ok()).toBeTruthy();
  const profile = await page.request.patch(`${backend}/api/me`, {
    headers,
    data: {
      displayName,
      interests: ["Science", "Society"],
      goal: "reasoning",
      timezone: "UTC",
      onboardingComplete: true,
    },
  });
  expect(profile.ok()).toBeTruthy();
  return state(page);
}

async function nav(page: Page, name: string) {
  await page
    .getByRole("button", { name: `Navigate to ${name}`, exact: true })
    .or(page.getByRole("button", { name, exact: true }))
    .or(page.getByRole("link", { name, exact: true }))
    .or(page.getByRole("tab", { name, exact: true }))
    .first()
    .click();
}

async function capture(page: Page, name: string) {
  const directory = path.join(process.cwd(), "docs", "screenshots");
  await mkdir(directory, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: path.join(directory, name), fullPage: true });
}

async function completeViaApi(page: Page, sessionId: string, retryOf?: string) {
  const created = await page.request.post(`${backend}/api/attempts`, {
    headers,
    data: {
      sessionId,
      responseType: "text",
      text: answer,
      ...(retryOf ? { retryOf } : {}),
    },
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

test("a small daily practice earns its quest, unlocks a plant, and offers a useful return visit", async ({
  page,
}) => {
  const before = await seedUser(page, "Returning Gardener");
  await page.goto(base);
  const progress = page.getByTestId("practice-week-progress");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await expect(progress).toHaveAttribute("aria-valuemax", "3");
  const morning = page.getByRole("button", {
    name: "Morning Bloom",
    exact: true,
  });
  await expect(morning).toContainText("Bonus: +1 water · +1 sunlight · +10 XP");
  await nav(page, "Garden");
  await expect(page.getByTestId("garden-unlock-progress")).toContainText(
    "0 / 30 XP",
  );
  await expect(page.getByTestId("seed-packet-monstera")).toBeDisabled();
  await nav(page, "Home");
  await page.getByRole("button", { name: "Spin & Speak", exact: true }).click();
  await page
    .getByRole("button", { name: "Spin a prompt", exact: true })
    .click();
  await page.getByRole("button", { name: "Skip prep", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(answer);
  await continueWithoutReflection(page);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeInViewport();
  await expect
    .poll(async () => (await state(page)).attempts[0]?.status)
    .toBe("completed");
  const completed = await state(page);
  const original = completed.attempts[0];
  expect(completed.wallet).toEqual({
    seeds: before.wallet.seeds + 1,
    water: before.wallet.water + 3,
    sunlight: before.wallet.sunlight + 1,
  });
  expect(completed.xp - before.xp).toBe(30);
  expect(
    completed.quests.find((quest) => quest.id === "morning-bloom")?.completed,
  ).toBe(true);
  expect(completed.practiceWeek.days).toEqual([completed.practiceWeek.day]);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await nav(page, "Home");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  await expect(morning).toContainText(
    "Earned: +1 water · +1 sunlight · +10 XP",
  );
  await expect(morning).toContainText("Completed · review");
  await morning.click();
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  expect((await state(page)).wallet).toEqual(completed.wallet);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await nav(page, "Home");
  await page.getByTestId("practice-week").scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await capture(page, "returning-home-mobile.png");
  await page
    .getByTestId("home-next-action")
    .getByRole("button", { name: "Open garden", exact: true })
    .click();
  await expect(page.getByTestId("garden-unlock-progress")).toContainText(
    "30 / 60 XP",
  );
  await expect(page.getByTestId("seed-packet-monstera")).toBeEnabled();
  await page.getByTestId("seed-packet-monstera").click();
  await page
    .getByRole("button", { name: "Plot 1, empty", exact: true })
    .click();
  await expect
    .poll(async () => (await state(page)).plots[0].plantType)
    .toBe("monstera");
  const planted = await state(page);
  expect(planted.plots.filter((plot) => plot.plantType)).toHaveLength(1);
  expect(planted.wallet.seeds).toBe(completed.wallet.seeds - 1);

  // The public API cannot backdate practice. Project only the Home calendar
  // presentation to tomorrow to exercise its return action. Server calendar
  // boundaries and retry-only practice days are covered by backend tests.
  const tomorrow = new Date(`${completed.practiceWeek.day}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const weekStart = new Date(tomorrow);
  weekStart.setUTCDate(
    weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7),
  );
  const monday = weekStart.toISOString().slice(0, 10);
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    const actual = await response.json();
    await route.fulfill({
      response,
      json: {
        ...actual,
        practiceWeek: {
          ...actual.practiceWeek,
          day: tomorrow.toISOString().slice(0, 10),
          days: actual.practiceWeek.days.filter((day: string) => day >= monday),
        },
      },
    });
  });
  await page.goto(base);
  await expect(
    page.getByText(
      getThoughtGuide(original.mode, original.evaluation)[0].question,
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await page
    .getByTestId("home-next-action")
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your response", exact: true }),
  ).toHaveValue(answer);
  await page.unroute("**/api/state");
  const revised = `${answer} I would ask which result would change the conclusion.`;
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(revised);
  await continueWithoutReflection(page);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  const retried = await state(page);
  expect(retried.attempts).toHaveLength(2);
  expect(retried.attempts[0].retryOf).toBe(original.id);
  expect(retried.attempts[0].text).toBe(revised);
  expect(retried.wallet.sunlight).toBe(completed.wallet.sunlight + 3);
  expect(retried.practiceWeek.days).toEqual([retried.practiceWeek.day]);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await nav(page, "Home");
  await expect(
    page
      .getByTestId("home-next-action")
      .getByRole("button", { name: "Open garden", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("practice-week-progress")).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
});

test("feedback and profile preserve legacy comparisons but exclude changed contexts and new unvalidated ratings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedUser(page, "Comparison Gardener");
  const created = await page.request.post(`${backend}/api/sessions`, {
    headers,
    data: { mode: "spin_speak" },
  });
  expect(created.status()).toBe(201);
  const session = await created.json();
  const original = await completeViaApi(page, session.id);
  const second = await completeViaApi(page, session.id, original.id);
  const latest = await completeViaApi(page, session.id, original.id);
  const known = [original.id, second.id, latest.id];
  let mismatch:
    "none" | "prompt_template_version" | "model_version" | "unvalidated" =
    "none";

  // Explicit display fixture: actual authenticated attempts/retry links persist
  // through the local API. Only evaluation metadata/levels are projected here
  // to test provider comparisons without configuring or calling a paid model.
  const project = (attempt: Attempt): Attempt => {
    if (!known.includes(attempt.id) || !attempt.evaluation) return attempt;
    const rank = known.indexOf(attempt.id) + 1;
    return {
      ...attempt,
      evaluation: {
        ...attempt.evaluation,
        assessment:
          mismatch === "unvalidated"
            ? attempt.evaluation.assessment
            : undefined,
        rubric_version:
          mismatch === "unvalidated"
            ? attempt.evaluation.rubric_version
            : "grow-v1",
        provider: "openai",
        model_version:
          mismatch === "model_version" && attempt.id === original.id
            ? "fixture-older-model"
            : "fixture-model",
        prompt_template_version:
          mismatch === "prompt_template_version" && attempt.id === original.id
            ? "fixture-older-template"
            : "fixture-template",
        dimensions: attempt.evaluation.dimensions.map((dimension) => ({
          ...dimension,
          level: dimension.key === "delivery" ? null : rank,
        })),
      },
    };
  };
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    const actual = await response.json();
    await route.fulfill({
      response,
      json: { ...actual, attempts: actual.attempts.map(project) },
    });
  });
  await page.route("**/api/attempts/*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, json: project(await response.json()) });
  });

  for (const version of [
    "none",
    "prompt_template_version",
    "model_version",
    "unvalidated",
  ] as const) {
    mismatch = version;
    await page.goto(`${base}/profile`);
    const chartCaption = page.getByText(
      /^Legacy ratings · same prompt, evaluator and coaching template · 3 comparable attempts$/,
    );
    if (version === "none") await expect(chartCaption).toBeVisible();
    else {
      await expect(
        page.getByText(
          /^New provisional ratings and local coaching are excluded from/,
        ),
      ).toBeVisible();
      await expect(chartCaption).toHaveCount(0);
      await expect(
        page.getByLabel(
          "Legacy GROW practice ratings across comparable attempts, not a measure of ability",
          {
            exact: true,
          },
        ),
      ).toHaveCount(0);
    }
    const previous = page.waitForResponse((response) =>
      response.url().endsWith(`/api/attempts/${original.id}`),
    );
    await page
      .getByRole("button", { name: /^View practice:/ })
      .first()
      .click();
    await previous;
    await page.getByTestId("grow-dimension-grounded").click();
    const comparison = page.getByText(
      /^Previous attempt: 1\/4 → this attempt: 3\/4$/,
    );
    if (version === "none") await expect(comparison).toBeVisible();
    else {
      await expect(page.getByTestId("grow-detail-grounded")).toBeVisible();
      await expect(page.getByText(/^Previous attempt:/)).toHaveCount(0);
    }
  }
});
