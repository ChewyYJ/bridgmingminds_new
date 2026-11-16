import { expect, test, type Page } from "@playwright/test";

test.use({
  channel: "chrome",
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
test.setTimeout(120000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || base;
const notes =
  "A useful discovery\nCheck the evidence\nCompare another explanation";
const transcript =
  "I think this discovery is a useful starting point because scientists can compare evidence. For example, another observation could help them check their explanation. I would want to understand what remains uncertain before drawing a conclusion.";

async function openReflection(page: Page) {
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("button", { name: "Start learning", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Navigate to Discover", exact: true })
    .click();
  await page.getByRole("button", { name: "Science", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Read & respond",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Plan your response", exact: true })
    .click();
  await expect(
    page.getByLabel("60 seconds preparation time", { exact: true }),
  ).toBeVisible();
}

test("Read & Reflect preserves quick notes, records speech and submits notes with feedback", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () {
      void resume.call(this).catch(() => undefined);
      return Promise.resolve();
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const source = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      await context.resume();
      return destination.stream;
    };
  });
  // Only transcription is a fixture; audio, notes, attempts and evaluation use the test API.
  await page.route("**/api/attempts/*/transcribe", (route) =>
    route.fulfill({ json: { text: transcript } }),
  );
  await openReflection(page);
  await page
    .getByRole("textbox", { name: "Your ideas", exact: true })
    .fill(notes);
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole("textbox", { name: "Your ideas", exact: true }),
  ).toHaveValue(notes);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Your ideas", exact: true }),
  ).toHaveValue(notes);
  await page.getByRole("tab", { name: "Mind map", exact: true }).click();
  await page.getByRole("button", { name: "Box", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Selected idea", exact: true })
    .fill("Main idea");
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Selected idea", exact: true })
    .fill("Check another explanation");
  const dot = page.getByRole("button", {
    name: "Connect Main idea, top-right",
    exact: true,
  });
  await dot.scrollIntoViewIfNeeded();
  const startDot = (await dot.boundingBox())!;
  const endDot = (await page
    .getByRole("button", {
      name: "Connect Check another explanation, top-left",
      exact: true,
    })
    .boundingBox())!;
  await page.mouse.move(
    startDot.x + startDot.width / 2,
    startDot.y + startDot.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    endDot.x + endDot.width / 2,
    endDot.y + endDot.height / 2,
    { steps: 10 },
  );
  await expect(page.getByTestId("connection-preview")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.getByTestId("connection-preview")).toHaveCount(0);
  await expect(page.getByTestId("mind-map-link")).toHaveCount(1);
  const idea = page.getByRole("button", {
    name: "Idea: Main idea",
    exact: true,
  });
  const before = (await idea.boundingBox())!;
  const oldLineY = await page.getByTestId("mind-map-link").getAttribute("d");
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before.x + before.width / 2 + 12,
    before.y + before.height / 2 + 35,
    { steps: 5 },
  );
  await expect(page.getByTestId("mind-map-link")).not.toHaveAttribute(
    "d",
    oldLineY!,
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await idea.boundingBox())!.y)
    .toBeGreaterThan(before.y + 20);
  await idea.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await idea.boundingBox())!.x)
    .toBeGreaterThan(before.x + 16);
  await page.screenshot({
    path: info.outputPath("mind-map-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Draw", exact: true }).click();
  const canvas = page.getByTestId("drawing-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + 30, rect.y + 50);
  await page.mouse.down();
  await page.mouse.move(rect.x + 90, rect.y + 95, { steps: 8 });
  await page.mouse.move(rect.x + 150, rect.y + 50, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("drawing-stroke")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("drawing-stroke")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("drawing-stroke")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Keep drawing", exact: true }).click();
  await expect(page.getByTestId("drawing-stroke")).toHaveCount(1);
  await page.getByRole("tab", { name: "Notepad", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Your ideas", exact: true }),
  ).toHaveValue(notes);
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await page.goBack();
  await page.getByRole("tab", { name: "Mind map", exact: true }).click();
  await expect(page.getByTestId("mind-map-link")).toHaveCount(1);
  await page.getByRole("tab", { name: "Draw", exact: true }).click();
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await page.goBack();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Draw", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("drawing-stroke")).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("drawing-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Notepad", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("read-reflect-notes-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Ready to speak", exact: true })
    .click();
  await expect(page.getByTestId("speaking-notes")).toContainText(
    "Check the evidence",
  );
  await expect(
    page.getByRole("button", { name: "Write a response", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Write instead", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Allow private recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel recording", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your ideas", exact: true }),
  ).toHaveValue(notes);
  await page
    .getByRole("button", { name: "Ready to speak", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Use recording", exact: true })
    .click();
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  const state = await (await page.request.get(`${backend}/api/state`)).json();
  expect(state.attempts[0]).toMatchObject({
    mode: "read_reflect",
    responseType: "audio",
    planningNotes: notes + "\nMain idea\nCheck another explanation",
    planningBoard: { mode: "notepad", notepad: notes },
    text: transcript,
    status: "completed",
  });
  expect(state.attempts[0].audioId).toBeTruthy();
  expect(
    state.attempts[0].planningBoard.nodes.map((node: any) => node.shape),
  ).toEqual(["box", "circle"]);
  expect(state.attempts[0].planningBoard.links).toHaveLength(1);
  expect(state.attempts[0].planningBoard.links[0]).toMatchObject({
    fromPort: "top-right",
    toPort: "top-left",
  });
  expect(state.attempts[0].planningBoard.strokes).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("planning ends after one minute without starting the microphone", async ({
  page,
}) => {
  await openReflection(page);
  await page
    .getByRole("textbox", { name: "Your ideas", exact: true })
    .fill(notes);
  await page.clock.install();
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("textbox", { name: "Your ideas", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("speaking-notes")).toContainText(
    "Check the evidence",
  );
  await expect(
    page.getByRole("button", { name: "Allow private recording", exact: true }),
  ).toBeVisible();
});

test("mind map supports touch connections, editing, zooming and safe empty drops", async ({
  page,
}, info) => {
  await openReflection(page);
  await page.getByRole("tab", { name: "Mind map", exact: true }).click();
  await page.getByRole("button", { name: "Box", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Selected idea", exact: true })
    .fill("A useful discovery\nCompare what the observations show.");
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Selected idea", exact: true })
    .fill("What is uncertain?");
  const canvas = page.getByTestId("mind-map-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  async function touchDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [from],
    });
    for (let step = 1; step <= 8; step++)
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: from.x + ((to.x - from.x) * step) / 8,
            y: from.y + ((to.y - from.y) * step) / 8,
          },
        ],
      });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  const source = page.getByRole("button", {
    name: /Connect A useful discovery.*top-right/s,
  });
  const target = page.getByRole("button", {
    name: "Connect What is uncertain?, top-left",
    exact: true,
  });
  const center = async (locator: ReturnType<Page["getByRole"]>) => {
    const rect = (await locator.boundingBox())!;
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  };
  await touchDrag(await center(source), await center(target));
  await expect(page.getByTestId("mind-map-link")).toHaveCount(1);
  await touchDrag(await center(source), await center(target));
  await expect(page.getByTestId("mind-map-link")).toHaveCount(1);
  const bounds = (await canvas.boundingBox())!;
  await touchDrag(await center(source), {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height - 20,
  });
  await expect(page.getByTestId("mind-map-link")).toHaveCount(1);
  await expect(page.getByTestId("connection-preview")).toHaveCount(0);
  const node = page.getByRole("button", { name: /Idea: A useful discovery/ });
  const before = await center(node);
  await touchDrag(before, { x: before.x + 15, y: before.y + 40 });
  await expect
    .poll(async () => (await center(node)).y)
    .toBeGreaterThan(before.y + 25);
  await node.click();
  await page
    .getByRole("textbox", { name: "Edit idea", exact: true })
    .fill("My revised idea\nA clear point with one example.");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Reset zoom", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Idea: My revised idea/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reset zoom", exact: true }),
  ).toHaveText("125%");
  const zoomedNode = page.getByRole("button", {
    name: /Idea: My revised idea/,
  });
  const beforePan = await center(zoomedNode);
  const panBounds = (await canvas.boundingBox())!;
  await touchDrag(
    { x: panBounds.x + 25, y: panBounds.y + panBounds.height - 25 },
    { x: panBounds.x + 55, y: panBounds.y + panBounds.height - 25 },
  );
  await expect
    .poll(async () => (await center(zoomedNode)).x)
    .toBeGreaterThan(beforePan.x + 20);
  await page.getByRole("button", { name: "Reset zoom", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reset zoom", exact: true }),
  ).toHaveText("100%");
  await page.getByRole("button", { name: "Remove idea", exact: true }).click();
  await expect(page.getByTestId("mind-map-link")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Undo map change", exact: true })
    .click();
  await expect(page.getByTestId("mind-map-link")).toHaveCount(1);
  await page.getByRole("tab", { name: "Draw", exact: true }).click();
  const drawing = page.getByTestId("drawing-canvas");
  await drawing.scrollIntoViewIfNeeded();
  const drawingBounds = (await drawing.boundingBox())!;
  await touchDrag(
    { x: drawingBounds.x + 30, y: drawingBounds.y + 40 },
    { x: drawingBounds.x + 150, y: drawingBounds.y + 110 },
  );
  await expect(page.getByTestId("drawing-stroke")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear drawing", exact: true })
    .click();
  await expect(page.getByTestId("drawing-stroke")).toHaveCount(0);
  await page.getByRole("tab", { name: "Mind map", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await canvas.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("mind-map-desktop.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
