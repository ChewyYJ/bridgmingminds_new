import { expect, test, type Page } from "@playwright/test";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
});
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || "http://localhost:3002";

async function account(page: Page, timezone = "UTC") {
  const headers = { Origin: new URL(base).origin };
  const created = await page.request.post(`${backend}/api/auth/guest`, {
    headers,
    data: {},
  });
  expect(created.ok()).toBe(true);
  const saved = await page.request.patch(`${backend}/api/me`, {
    headers,
    data: {
      displayName: "Returning reader",
      timezone,
      onboardingComplete: true,
    },
  });
  expect(saved.ok()).toBe(true);
  return (await page.request.get(`${backend}/api/state`)).json();
}

test("returning after local midnight refreshes weekly progress and quests without idle network polling", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-18T15:59:00Z") });
  const saved = await account(page, "Asia/Singapore");
  let day = "2026-10-18";
  let days = ["2026-10-12", "2026-10-14", "2026-10-18"];
  let requests = 0;
  // The API's date arithmetic is tested separately. These response fixtures
  // exercise client lifecycle and refresh behavior at a controlled local midnight.
  await page.route("**/api/state", (route) => {
    requests++;
    return route.fulfill({
      json: {
        ...saved,
        practiceWeek: { day, timezone: "Asia/Singapore", days, target: 3 },
        quests: saved.quests.map((quest: any) => ({
          ...quest,
          completed: day === "2026-10-18",
          progress: day === "2026-10-18" ? 1 : 0,
        })),
      },
    });
  });
  await page.goto(base);
  const progress = page.getByRole("progressbar", {
    name: "Practice days this week",
  });
  await expect(progress).toHaveAttribute("aria-valuenow", "3");
  await expect(
    page.getByText("Completed · review", { exact: true }),
  ).toHaveCount(4);
  expect(requests).toBe(1);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  day = "2026-10-19";
  days = [];
  await page.clock.fastForward(61_000);
  expect(requests).toBe(1); // A hidden app does not fetch for the calendar timer.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await expect(
    page.getByText("Completed · review", { exact: true }),
  ).toHaveCount(0);
  expect(requests).toBe(2);

  await page.clock.fastForward(120_000);
  expect(requests).toBe(2); // Same-day timer checks stay entirely local.
  days = ["2026-10-19"]; // Simulate a completed practice on another device.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  expect(requests).toBe(3);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(10_000);
  expect(requests).toBe(3); // A focus/visibility burst shares the cooldown.
});

test("a delayed foreground response cannot restore an account after sign out", async ({
  page,
}) => {
  await page.clock.install({ time: new Date() });
  const saved = await account(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/api/state", async (route) => {
    requests++;
    if (requests > 1) await gate;
    return route.fulfill({ json: saved });
  });
  const articlesLoaded = page.waitForResponse((response) =>
    response.url().endsWith("/api/articles"),
  );
  await page.goto(`${base}/settings`);
  await articlesLoaded;
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  try {
    await page.clock.fastForward(61_000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => requests).toBe(2);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Try as guest", exact: true }),
    ).toBeVisible();
    const lateResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/state"),
    );
    release();
    await lateResponse;
    await expect(
      page.getByRole("button", { name: "Try as guest", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toHaveCount(0);
    await page.clock.fastForward(120_000);
    await expect(
      page.getByRole("button", { name: "Try as guest", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("practice-week")).toHaveCount(0);
    expect(requests).toBe(2);
  } finally {
    release();
  }
});
