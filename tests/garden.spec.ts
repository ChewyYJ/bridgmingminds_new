import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_POSITIONS } from "../shared/garden-layout.mjs";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
test.setTimeout(90_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || base;
const headers = { Origin: new URL(base).origin };
const screenshotDirectory = path.join(process.cwd(), "docs", "screenshots");

async function readState(page: Page) {
  const response = await page.request.get(`${backend}/api/state`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function goToGarden(page: Page) {
  await page
    .getByRole("button", { name: "Navigate to Homeland", exact: true })
    .or(page.getByRole("button", { name: "Garden", exact: true }))
    .or(page.getByRole("link", { name: "Garden", exact: true }))
    .or(page.getByRole("tab", { name: "Garden", exact: true }))
    .first()
    .click();
  await expect(page.getByTestId("garden-canvas")).toBeVisible();
}
async function startGarden(page: Page, name: string) {
  page.setDefaultTimeout(15_000);
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill(name);
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await goToGarden(page);
}
async function canvasPoint(page: Page, position: { x: number; y: number }) {
  const rect = await page.getByTestId("garden-canvas").boundingBox();
  expect(rect).toBeTruthy();
  return {
    x: rect!.x + rect!.width * position.x,
    y: rect!.y + rect!.height * position.y,
  };
}
async function drag(
  page: Page,
  source: Locator,
  destination: { x: number; y: number },
) {
  const rect = await source.boundingBox();
  expect(rect).toBeTruthy();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 24 });
  await page.mouse.up();
}
async function draw(page: Page, fraction = 0.3) {
  const rect = await page.getByTestId("plant-drawing-canvas").boundingBox();
  expect(rect).toBeTruthy();
  await page.mouse.move(
    rect!.x + rect!.width * fraction,
    rect!.y + rect!.height * 0.25,
  );
  await page.mouse.down();
  await page.mouse.move(
    rect!.x + rect!.width * 0.65,
    rect!.y + rect!.height * 0.45,
    { steps: 18 },
  );
  await page.mouse.move(
    rect!.x + rect!.width * 0.45,
    rect!.y + rect!.height * 0.75,
    { steps: 18 },
  );
  await page.mouse.up();
}
async function earnSeed(page: Page) {
  const before = await readState(page);
  const sessionResponse = await page.request.post(`${backend}/api/sessions`, {
    headers,
    data: { mode: "spin_speak" },
  });
  expect(sessionResponse.status()).toBe(201);
  const session = await sessionResponse.json();
  const attemptResponse = await page.request.post(`${backend}/api/attempts`, {
    headers,
    data: {
      sessionId: session.id,
      responseType: "text",
      text: "I think a small shared garden helps neighbors connect because it creates something they can care for together. For example, people could take turns watering. However, the schedule should be flexible so people with less free time can still participate fairly.",
    },
  });
  expect(attemptResponse.ok()).toBeTruthy();
  const attempt = await attemptResponse.json();
  const result = await page.request.post(
    `${backend}/api/attempts/${attempt.id}/evaluate`,
    { headers, data: {} },
  );
  expect(result.status()).toBe(202);
  await expect
    .poll(async () => (await readState(page)).wallet.seeds)
    .toBe(before.wallet.seeds + 1);
}
async function screenshot(page: Page, name: string) {
  await mkdir(screenshotDirectory, { recursive: true });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({
    path: path.join(screenshotDirectory, name),
    fullPage: true,
  });
}

// The browser performs the planting, drawing, and moving gestures. API access
// below observes persisted state and earns one additional seed via normal practice.
test("drag flowers onto the island, preserve placement and plant a personal drawing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await startGarden(page, "Island Tester");
  await page.getByRole("button", { name: "Flowers", exact: true }).click();
  const initial = await readState(page);
  expect(initial.wallet.seeds).toBe(1);
  const daisy = page.getByTestId("seed-packet-daisy");
  await expect(page.getByTestId("seed-packet-sunflower")).toBeDisabled();
  await expect(page.getByTestId("seed-packet-lavender")).toBeDisabled();
  await expect(page.getByTestId("seed-packet-tulip")).toBeDisabled();

  await test.step("Escape cancels a gesture without planting", async () => {
    await daisy.focus();
    const source = await daisy.boundingBox();
    const destination = await canvasPoint(page, DEFAULT_POSITIONS[0]);
    await page.mouse.move(
      source!.x + source!.width / 2,
      source!.y + source!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(destination.x, destination.y, { steps: 12 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect((await readState(page)).wallet.seeds).toBe(1);
    expect(
      (await readState(page)).plots.filter((plot: any) => plot.plantType),
    ).toHaveLength(0);
  });

  await test.step("dropping outside the island does not spend a seed", async () => {
    await drag(page, daisy, await canvasPoint(page, { x: 0.04, y: 0.08 }));
    await expect(page.getByText(/Drop onto the grass/)).toBeVisible();
    await expect.poll(async () => (await readState(page)).wallet.seeds).toBe(1);
    expect(
      (await readState(page)).plots.filter((plot: any) => plot.plantType),
    ).toHaveLength(0);
  });

  let flowerId = "";
  await test.step("drag a flower to the grass and restore its exact position", async () => {
    await drag(page, daisy, await canvasPoint(page, DEFAULT_POSITIONS[0]));
    await expect.poll(async () => (await readState(page)).wallet.seeds).toBe(0);
    await expect(daisy).toBeDisabled();
    const state = await readState(page);
    const flower = state.plots.find((plot: any) => plot.plantType === "daisy");
    expect(flower.position.x).toBeCloseTo(DEFAULT_POSITIONS[0].x, 2);
    expect(flower.position.y).toBeCloseTo(DEFAULT_POSITIONS[0].y, 2);
    flowerId = flower.id;
    await page.reload();
    await expect(page.getByTestId(`garden-plant-${flowerId}`)).toBeVisible();
    expect(
      (await readState(page)).plots.find((plot: any) => plot.id === flowerId)
        .position,
    ).toEqual(flower.position);
  });

  await test.step("moving an existing flower is free, including with no seeds", async () => {
    const before = await readState(page);
    await drag(
      page,
      page.getByTestId(`garden-plant-${flowerId}`),
      await canvasPoint(page, DEFAULT_POSITIONS[1]),
    );
    await expect
      .poll(
        async () =>
          (await readState(page)).plots.find(
            (plot: any) => plot.id === flowerId,
          ).position.x,
      )
      .toBeCloseTo(DEFAULT_POSITIONS[1].x, 2);
    expect((await readState(page)).wallet).toEqual(before.wallet);
  });

  await earnSeed(page);
  await page.reload();
  await page.getByRole("button", { name: "Flowers", exact: true }).click();
  await expect(daisy).toBeVisible();
  await test.step("colliding with a planted flower never spends a seed", async () => {
    await drag(page, daisy, await canvasPoint(page, DEFAULT_POSITIONS[1]));
    await expect(
      page.getByText(/Choose an open spot between plants/),
    ).toBeVisible();
    expect((await readState(page)).wallet.seeds).toBe(1);
    expect(
      (await readState(page)).plots.filter((plot: any) => plot.plantType),
    ).toHaveLength(1);
  });

  await test.step("draw, undo, clear, and plant a custom drawing", async () => {
    await page.getByRole("tab", { name: "Draw", exact: true }).click();
    const canvas = page.getByTestId("plant-drawing-canvas");
    await expect(canvas).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Undo stroke", exact: true }),
    ).toBeDisabled();
    await draw(page);
    await expect(canvas.locator("svg path")).toHaveCount(1);
    await page.getByRole("button", { name: "Green ink", exact: true }).click();
    await draw(page, 0.4);
    await expect(canvas.locator("svg path")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Undo stroke", exact: true })
      .click();
    await expect(canvas.locator("svg path")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Clear drawing", exact: true })
      .click();
    await expect(canvas.locator("svg path")).toHaveCount(0);
    await page.getByRole("button", { name: "Pink ink", exact: true }).click();
    await draw(page);
    await screenshot(page, "garden-drawing-desktop.png");
    await drag(
      page,
      page.getByTestId("doodle-packet"),
      await canvasPoint(page, DEFAULT_POSITIONS[4]),
    );
    await expect
      .poll(
        async () =>
          (await readState(page)).plots.filter(
            (plot: any) => plot.plantType === "doodle",
          ).length,
      )
      .toBe(1);
    const saved = await readState(page);
    const doodle = saved.plots.find((plot: any) => plot.plantType === "doodle");
    expect(doodle.doodle.strokes).toHaveLength(1);
    expect(doodle.doodle.strokes[0].color).toBe("#D95D87");
    expect(doodle.doodle.strokes[0].points.length).toBeGreaterThan(2);
    for (const point of doodle.doodle.strokes[0].points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
    expect(saved.wallet.seeds).toBe(0);
    await page.reload();
    await expect(page.getByTestId(`garden-plant-${doodle.id}`)).toBeVisible();
    expect(
      (await readState(page)).plots.find((plot: any) => plot.id === doodle.id)
        .doodle,
    ).toEqual(doodle.doodle);
    await screenshot(page, "garden-island-desktop.png");
  });
  expect(errors).toEqual([]);
});

test("plant with a touch drag on a phone-sized screen", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await startGarden(page, "Touch Tester");
    await page.getByRole("button", { name: "Flowers", exact: true }).click();
    const source = await page.getByTestId("seed-packet-daisy").boundingBox();
    expect(source).toBeTruthy();
    const start = {
      x: source!.x + source!.width / 2,
      y: source!.y + source!.height / 2,
    };
    const end = await canvasPoint(page, DEFAULT_POSITIONS[2]);
    const client = await context.newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...start, id: 0 }],
    });
    for (let step = 1; step <= 24; step += 1) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * step) / 24,
            y: start.y + ((end.y - start.y) * step) / 24,
            id: 0,
          },
        ],
      });
    }
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect.poll(async () => (await readState(page)).wallet.seeds).toBe(0);
    const flower = (await readState(page)).plots.find(
      (plot: any) => plot.plantType === "daisy",
    );
    expect(flower.position.x).toBeCloseTo(DEFAULT_POSITIONS[2].x, 2);
    expect(flower.position.y).toBeCloseTo(DEFAULT_POSITIONS[2].y, 2);
    await screenshot(page, "garden-island-mobile.png");
    await page.reload();
    await expect(page.getByTestId(`garden-plant-${flower.id}`)).toBeVisible();
  } finally {
    await context.close();
  }
});

test("grow greenery, keep watering progress and move a plant without spending resources", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await startGarden(page, "Greenery Tester");
  await expect(
    page.getByRole("tab", { name: "Plants", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("seed-packet-fern")).toBeEnabled();
  await expect(page.getByTestId("seed-packet-cactus")).toBeEnabled();
  await expect(page.getByTestId("seed-packet-monstera")).toBeDisabled();
  await expect(page.getByTestId("seed-packet-bamboo")).toBeDisabled();

  await drag(
    page,
    page.getByTestId("seed-packet-fern"),
    await canvasPoint(page, DEFAULT_POSITIONS[2]),
  );
  await expect.poll(async () => (await readState(page)).wallet.seeds).toBe(0);
  const fern = (await readState(page)).plots.find(
    (plot: any) => plot.plantType === "fern",
  );
  expect(fern).toBeTruthy();
  await page.getByTestId(`garden-plant-${fern.id}`).click();
  for (const growth of [1, 2]) {
    await page
      .getByRole("button", { name: "Water · 1 water", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await readState(page)).plots.find((plot: any) => plot.id === fern.id)
            .growth,
      )
      .toBe(growth);
  }
  await expect(
    page.getByRole("button", { name: "Water · 1 water", exact: true }),
  ).toBeDisabled();
  await earnSeed(page);
  await page.reload();
  await expect(page.getByTestId(`garden-plant-${fern.id}`)).toBeVisible();
  const restoredFern = (await readState(page)).plots.find(
    (plot: any) => plot.id === fern.id,
  );
  expect(restoredFern.growth).toBe(2);
  expect(restoredFern.position).toEqual(fern.position);
  await expect(page.getByTestId("seed-packet-monstera")).toBeEnabled();
  await expect(page.getByTestId("seed-packet-bamboo")).toBeDisabled();

  await drag(
    page,
    page.getByTestId("seed-packet-cactus"),
    await canvasPoint(page, DEFAULT_POSITIONS[6]),
  );
  await expect
    .poll(
      async () =>
        (await readState(page)).plots.filter(
          (plot: any) => plot.plantType === "cactus",
        ).length,
    )
    .toBe(1);
  const cactus = (await readState(page)).plots.find(
    (plot: any) => plot.plantType === "cactus",
  );
  await page.getByTestId(`garden-plant-${cactus.id}`).click();
  for (const growth of [1, 2, 3]) {
    await page
      .getByRole("button", { name: "Water · 1 water", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await readState(page)).plots.find(
            (plot: any) => plot.id === cactus.id,
          ).growth,
      )
      .toBe(growth);
  }
  await expect(page.getByTestId(`garden-plant-${cactus.id}`)).toHaveAttribute(
    "aria-label",
    /cactus, mature/,
  );

  // Reload restores the board near the top after the care controls scrolled into view.
  await page.reload();
  await expect(page.getByTestId(`garden-plant-${fern.id}`)).toBeVisible();
  const beforeMove = await readState(page);
  await drag(
    page,
    page.getByTestId(`garden-plant-${fern.id}`),
    await canvasPoint(page, DEFAULT_POSITIONS[0]),
  );
  await expect
    .poll(
      async () =>
        (await readState(page)).plots.find((plot: any) => plot.id === fern.id)
          .position.x,
    )
    .toBeCloseTo(DEFAULT_POSITIONS[0].x, 2);
  const afterMove = await readState(page);
  expect(afterMove.wallet).toEqual(beforeMove.wallet);
  expect(afterMove.plots.find((plot: any) => plot.id === fern.id).growth).toBe(
    2,
  );
  expect(
    afterMove.plots.find((plot: any) => plot.id === fern.id).lastWateredAt,
  ).toBe(
    beforeMove.plots.find((plot: any) => plot.id === fern.id).lastWateredAt,
  );
  await page.reload();
  await expect(page.getByTestId(`garden-plant-${cactus.id}`)).toBeVisible();
  const persisted = await readState(page);
  expect(
    persisted.plots
      .filter((plot: any) => plot.plantType)
      .map((plot: any) => ({
        id: plot.id,
        plantType: plot.plantType,
        growth: plot.growth,
        position: plot.position,
      })),
  ).toEqual(
    afterMove.plots
      .filter((plot: any) => plot.plantType)
      .map((plot: any) => ({
        id: plot.id,
        plantType: plot.plantType,
        growth: plot.growth,
        position: plot.position,
      })),
  );
  await screenshot(page, "garden-greenery-desktop.png");

  const mobile = await browser.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  try {
    const phone = await mobile.newPage();
    phone.setDefaultTimeout(15_000);
    await phone.goto(base);
    await goToGarden(phone);
    await expect(phone.getByTestId("seed-packet-fern")).toBeVisible();
    await expect(
      phone.getByTestId(`garden-plant-${cactus.id}`),
    ).toHaveAttribute("aria-label", /cactus, mature/);
    await screenshot(phone, "garden-greenery-mobile.png");
  } finally {
    await mobile.close();
  }
  expect(errors).toEqual([]);
});
