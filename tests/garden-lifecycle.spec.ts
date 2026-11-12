import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_POSITIONS } from "../shared/garden-layout.mjs";
import type { AppState, Doodle, Plot, Wallet } from "../src/types";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
test.setTimeout(90_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || base;
const headers = { Origin: new URL(base).origin };
const hour = 60 * 60 * 1000;

async function state(page: Page): Promise<AppState> {
  const response = await page.request.get(`${backend}/api/state`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function seedUser(page: Page, name: string) {
  page.setDefaultTimeout(15_000);
  const health = await (await page.request.get(`${backend}/api/health`)).json();
  expect(health.provider, "No paid provider calls in browser tests").toBe(
    "local",
  );
  const guest = await page.request.post(`${backend}/api/auth/guest`, {
    headers,
    data: {},
  });
  expect(guest.ok()).toBeTruthy();
  const profile = await page.request.patch(`${backend}/api/me`, {
    headers,
    data: {
      displayName: `Lifecycle ${name}`,
      interests: ["Science", "Society"],
      goal: "reasoning",
      timezone: "UTC",
      onboardingComplete: true,
    },
  });
  expect(profile.ok()).toBeTruthy();
  return state(page);
}

// Time/resource fixtures are confined to this newly created synthetic user in
// the isolated browser-test database. This deliberately does not simulate 48
// hours of browser wall time or claim to verify a live notification service.
function fixture(
  userId: string,
  change: (data: { plots: Plot[]; wallet: Wallet }) => void,
) {
  const url = new URL(backend);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
  expect(url.port, "Lifecycle fixtures require the isolated test server").toBe(
    "3002",
  );
  const requested = path.resolve(
    process.env.E2E_DATABASE_PATH || "data/e2e.sqlite",
  );
  expect(
    existsSync(requested),
    "Start the isolated browser-test server first",
  ).toBeTruthy();
  const database = realpathSync(requested);
  expect(
    path.basename(database),
    "Never open the user's application database",
  ).toMatch(/^e2e(?:[-_.].*)?\.sqlite$/);
  const db = new DatabaseSync(database);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    const row = db
      .prepare("SELECT profile, plots, wallet FROM users WHERE id=?")
      .get(userId) as
      { profile: string; plots: string; wallet: string } | undefined;
    expect(
      row,
      "E2E_DATABASE_PATH must name the server's isolated database",
    ).toBeTruthy();
    expect(JSON.parse(row!.profile).displayName).toMatch(/^Lifecycle /);
    const data = {
      plots: JSON.parse(row!.plots) as Plot[],
      wallet: JSON.parse(row!.wallet) as Wallet,
    };
    change(data);
    const updated = db
      .prepare("UPDATE users SET plots=?, wallet=? WHERE id=?")
      .run(JSON.stringify(data.plots), JSON.stringify(data.wallet), userId);
    expect(updated.changes).toBe(1);
  } finally {
    db.close();
  }
}

async function nav(page: Page, name: "Home" | "Garden") {
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

async function noOverflow(page: Page) {
  const width = page.viewportSize()!.width;
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
}

async function previewPosition(page: Page, plot: Plot) {
  const board = await page.getByTestId("garden-preview-board").boundingBox();
  const plant = await page
    .getByTestId(`garden-preview-plant-${plot.id}`)
    .boundingBox();
  expect(board).toBeTruthy();
  expect(plant).toBeTruthy();
  expect((plant!.x + plant!.width / 2 - board!.x) / board!.width).toBeCloseTo(
    plot.position!.x,
    2,
  );
  expect(
    (plant!.y + plant!.height * 0.94 - board!.y) / board!.height,
  ).toBeCloseTo(plot.position!.y, 2);
}

test("archive and restore a mature plant without losing care, resources, or the real Home preview", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const user = await seedUser(page, "Archive");
  fixture(user.profile.id, ({ wallet }) => {
    wallet.water = 4;
  });
  await page.goto(`${base}/garden`);
  await page.getByTestId("seed-packet-fern").click();
  await page
    .getByRole("button", { name: "Plot 3, empty", exact: true })
    .click();
  await expect.poll(async () => (await state(page)).wallet.seeds).toBe(0);
  const planted = (await state(page)).plots.find(
    (plot) => plot.plantType === "fern",
  )!;
  await page.getByTestId(`garden-plant-${planted.id}`).click();
  for (const growth of [1, 2, 3]) {
    await page
      .getByRole("button", { name: "Water · 1 water", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await state(page)).plots.find((plot) => plot.id === planted.id)
            ?.growth,
      )
      .toBe(growth);
  }

  // Mature plants still need care; watering renews the deadline without a
  // fourth growth stage. Deadline fixtures avoid waiting two actual days.
  fixture(user.profile.id, ({ plots }) => {
    plots.find((plot) => plot.id === planted.id)!.waterDueAt = new Date(
      Date.now() + 12 * hour,
    ).toISOString();
  });
  await page.reload();
  await page.getByTestId(`garden-plant-${planted.id}`).click();
  await expect(page.getByTestId("garden-selected-care")).toContainText(
    "Needs water",
  );
  await page
    .getByRole("button", { name: "Water · 1 water", exact: true })
    .click();
  await expect.poll(async () => (await state(page)).wallet.water).toBe(0);
  const watered = (await state(page)).plots.find(
    (plot) => plot.id === planted.id,
  )!;
  expect(watered.growth).toBe(3);
  expect(Date.parse(watered.waterDueAt!) - Date.now()).toBeGreaterThan(
    47 * hour,
  );
  await expect(
    page.getByRole("button", { name: "Water · 1 water", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Earn water", exact: true }),
  ).toBeEnabled();

  await nav(page, "Home");
  await expect(page.getByTestId("garden-preview")).toBeVisible();
  await expect(
    page.getByTestId(`garden-preview-plant-${planted.id}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`garden-preview-plant-${planted.id}`),
  ).toHaveAttribute("aria-label", "Fern, growth 3 of 3, healthy");
  await previewPosition(page, watered);
  await page.getByTestId("garden-preview").scrollIntoViewIfNeeded();
  await capture(page, "garden-lifecycle-home-desktop.png");

  fixture(user.profile.id, ({ plots }) => {
    plots.find((plot) => plot.id === planted.id)!.waterDueAt = new Date(
      Date.now() + 12 * hour,
    ).toISOString();
  });
  await page.reload();
  await nav(page, "Garden");
  await page.getByTestId(`garden-plant-${planted.id}`).click();
  const beforeArchive = await state(page);
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect
    .poll(async () => (await state(page)).archivedPlants.length)
    .toBe(1);
  const archivedState = await state(page);
  const archived = archivedState.archivedPlants[0];
  expect(
    archivedState.plots.find((plot) => plot.id === planted.id)?.plantType,
  ).toBeNull();
  expect(archivedState.wallet).toEqual(beforeArchive.wallet);
  expect(archived.plantId).toBe(planted.plantId);
  expect(archived.growth).toBe(3);
  expect(archived.careRemainingMs).toBeGreaterThan(11 * hour);
  expect(archived.careRemainingMs).toBeLessThanOrEqual(12 * hour);
  expect(archived.waterDueAt).toBeUndefined();
  await page.reload();
  expect((await state(page)).archivedPlants[0].careRemainingMs).toBe(
    archived.careRemainingMs,
  );
  await nav(page, "Home");
  await expect(
    page.getByTestId(`garden-preview-plant-${planted.id}`),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await nav(page, "Garden");
  await page.getByRole("button", { name: "Archive (1)", exact: true }).click();
  const archivePanel = page.getByTestId("garden-archive");
  await expect(archivePanel).toBeVisible();
  await noOverflow(page);
  await archivePanel.scrollIntoViewIfNeeded();
  await capture(page, "garden-archive-mobile.png");
  const restoreStart = Date.now();
  await archivePanel
    .getByRole("button", { name: "Return to garden", exact: true })
    .click();
  await expect
    .poll(async () => (await state(page)).archivedPlants.length)
    .toBe(0);
  const restoredState = await state(page);
  const restored = restoredState.plots.find(
    (plot) => plot.plantId === planted.plantId,
  )!;
  expect(restored.plantType).toBe("fern");
  expect(restored.growth).toBe(3);
  expect(restored.plantedAt).toBe(archived.plantedAt);
  expect(restored.lastWateredAt).toBe(archived.lastWateredAt);
  expect(restoredState.wallet).toEqual(beforeArchive.wallet);
  expect(Date.parse(restored.waterDueAt!)).toBeGreaterThanOrEqual(
    restoreStart + archived.careRemainingMs - 1000,
  );
  expect(Date.parse(restored.waterDueAt!)).toBeLessThanOrEqual(
    Date.now() + archived.careRemainingMs + 1000,
  );
  await page.reload();
  await nav(page, "Home");
  await expect(
    page.getByTestId(`garden-preview-plant-${restored.id}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`garden-preview-plant-${restored.id}`),
  ).toHaveAttribute("aria-label", "Fern, growth 3 of 3, needs water");
  await previewPosition(page, restored);
  await noOverflow(page);
  await page.getByTestId("garden-preview").scrollIntoViewIfNeeded();
  await capture(page, "garden-lifecycle-home-mobile.png");
  expect(errors).toEqual([]);
});

test("a dead drawing can be replanted for one seed or cleared, with a usable zero-water path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const user = await seedUser(page, "Recovery");
  fixture(user.profile.id, ({ wallet }) => {
    wallet.seeds = 2;
    wallet.water = 0;
  });
  const doodle: Doodle = {
    strokes: [
      {
        color: "#D95D87",
        points: [
          { x: 0.2, y: 0.3 },
          { x: 0.5, y: 0.7 },
        ],
      },
    ],
  };
  const plotId = user.plots[4].id;
  const planted = await page.request.post(`${backend}/api/garden/plant`, {
    headers,
    data: {
      plotId,
      plantType: "doodle",
      doodle,
      position: DEFAULT_POSITIONS[4],
      idempotencyKey: randomUUID(),
    },
  });
  expect(planted.ok()).toBeTruthy();
  const before = (await state(page)).plots.find((plot) => plot.id === plotId)!;
  await page.clock.install();
  fixture(user.profile.id, ({ plots }) => {
    const plot = plots.find((item) => item.id === plotId)!;
    plot.growth = 3;
    plot.waterDueAt = new Date(Date.now() + 60_000).toISOString();
  });
  await page.goto(base);
  await expect(
    page.getByTestId(`garden-preview-plant-${plotId}`),
  ).toHaveAttribute("aria-label", "Doodle, growth 3 of 3, needs water");
  await nav(page, "Garden");
  await page.getByTestId(`garden-plant-${plotId}`).click();
  await expect(page.getByTestId("garden-selected-care")).toContainText(
    "Needs water",
  );
  // Only the browser clock moves here. The visible care state must update on
  // the open screen without a reload or a response from a time-travelled API.
  await page.clock.fastForward(91_000);
  await expect(page.getByTestId("garden-selected-care")).toContainText("Dead");
  fixture(user.profile.id, ({ plots }) => {
    plots.find((plot) => plot.id === plotId)!.waterDueAt = new Date(
      Date.now() - 1000,
    ).toISOString();
  });
  await nav(page, "Home");
  await expect(
    page.getByTestId(`garden-preview-plant-${plotId}`),
  ).toHaveAttribute("aria-label", "Doodle, growth 3 of 3, dead");
  await nav(page, "Garden");
  await page.getByTestId(`garden-plant-${plotId}`).click();
  await expect(
    page.getByRole("button", { name: "Water · 1 water", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Archive", exact: true }),
  ).toHaveCount(0);
  await noOverflow(page);
  await page.getByTestId("garden-selected-care").scrollIntoViewIfNeeded();
  await capture(page, "garden-dead-mobile.png");
  await page
    .getByRole("button", { name: "Replant · 1 seed", exact: true })
    .click();
  await expect.poll(async () => (await state(page)).wallet.seeds).toBe(0);
  const replanted = (await state(page)).plots.find(
    (plot) => plot.id === plotId,
  )!;
  expect(replanted.plantId).not.toBe(before.plantId);
  expect(replanted.plantType).toBe("doodle");
  expect(replanted.doodle).toEqual(doodle);
  expect(replanted.position).toEqual(before.position);
  expect(replanted.growth).toBe(0);
  expect(Date.parse(replanted.waterDueAt!) - Date.now()).toBeGreaterThan(
    47 * hour,
  );
  await expect(
    page.getByRole("button", { name: "Water · 1 water", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Earn water", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Practice", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Let’s spin", exact: true }),
  ).toBeEnabled();

  fixture(user.profile.id, ({ plots }) => {
    plots.find((plot) => plot.id === plotId)!.waterDueAt = new Date(
      Date.now() - 1000,
    ).toISOString();
  });
  await page.goto(`${base}/garden`);
  await page.getByTestId(`garden-plant-${plotId}`).click();
  await expect(
    page.getByRole("button", { name: "Replant · 1 seed", exact: true }),
  ).toBeDisabled();
  const beforeClear = await state(page);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await state(page)).plots.find((plot) => plot.id === plotId)?.plantType,
    )
    .toBeNull();
  expect((await state(page)).wallet).toEqual(beforeClear.wallet);
  await page.reload();
  await expect(page.getByTestId(`garden-plant-${plotId}`)).toHaveCount(0);
  await nav(page, "Home");
  await expect(page.getByTestId(`garden-preview-plant-${plotId}`)).toHaveCount(
    0,
  );
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("a saved garden mutation survives a failed refresh and yields to later fresh state", async ({
  page,
}) => {
  const user = await seedUser(page, "Refresh");
  const plotId = user.plots[0].id;
  const response = await page.request.post(`${backend}/api/garden/plant`, {
    headers,
    data: {
      plotId,
      plantType: "fern",
      position: DEFAULT_POSITIONS[0],
      idempotencyKey: randomUUID(),
    },
  });
  expect(response.ok()).toBeTruthy();
  const planted = (await state(page)).plots.find((plot) => plot.id === plotId)!;
  await page.clock.install();
  await page.goto(`${base}/garden`);
  const plant = page.getByTestId(`garden-plant-${plotId}`);
  await expect(plant).toHaveAttribute("aria-label", /fern, seed/);
  await plant.click();

  // Fail only the read after a successful water write. The POST and all later
  // responses remain real, so the fallback must display the committed result.
  let failedReads = 0;
  await page.route(
    "**/api/state",
    async (route) => {
      failedReads++;
      await route.abort("failed");
    },
    { times: 1 },
  );
  const water = page.getByRole("button", {
    name: "Water · 1 water",
    exact: true,
  });
  await water.click();
  await expect.poll(() => failedReads).toBe(1);
  await expect(plant).toHaveAttribute("aria-label", /fern, sprout/);
  await expect(water).toBeEnabled();
  const fallback = await state(page);
  expect(fallback.plots.find((plot) => plot.id === plotId)?.growth).toBe(1);
  expect(fallback.wallet.water).toBe(1);

  // A second device's care is represented by a real authenticated API write.
  // Without leaving Garden, a foreground refresh must replace the fallback.
  const otherDevice = await page.request.post(`${backend}/api/garden/water`, {
    headers,
    data: { plotId, plantId: planted.plantId, idempotencyKey: randomUUID() },
  });
  expect(otherDevice.ok()).toBeTruthy();
  const fresh = (await otherDevice.json()) as AppState;
  expect(fresh.plots.find((plot) => plot.id === plotId)?.growth).toBe(2);
  expect(fresh.wallet.water).toBe(0);
  await expect(plant).toHaveAttribute("aria-label", /fern, sprout/);
  await page.clock.fastForward(61_000);
  const refreshed = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === "/api/state" &&
      result.request().method() === "GET" &&
      result.status() === 200,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshed;
  await expect(plant).toHaveAttribute("aria-label", /fern, growing/);
  await expect(water).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Earn water", exact: true }),
  ).toBeEnabled();
  expect(failedReads).toBe(1);
});
