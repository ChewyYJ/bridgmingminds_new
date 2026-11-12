import { expect, test, type Page } from "@playwright/test";
import type { Attempt } from "../src/types";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
});
test.setTimeout(60_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || base;
const headers = { Origin: new URL(base).origin };

async function seed(page: Page) {
  const health = await (await page.request.get(`${backend}/api/health`)).json();
  expect(health.provider, "Motion tests must not call a paid provider").toBe(
    "local",
  );
  const guest = await page.request.post(`${backend}/api/auth/guest`, {
    headers,
    data: {},
  });
  expect(guest.ok(), `Create guest (${guest.status()}): ${await guest.text()}`)
    .toBeTruthy();
  const profile = await page.request.patch(`${backend}/api/me`, {
    headers,
    data: {
      displayName: "Motion gardener",
      interests: ["Science", "Society"],
      goal: "reasoning",
      timezone: "UTC",
      onboardingComplete: true,
      reducedMotion: false,
    },
  });
  expect(
    profile.ok(),
    `Complete profile (${profile.status()}): ${await profile.text()}`,
  ).toBeTruthy();
}

async function savedFeedback(page: Page): Promise<Attempt> {
  const sessionResponse = await page.request.post(`${backend}/api/sessions`, {
    headers,
    data: { mode: "spin_speak" },
  });
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  const created = await page.request.post(`${backend}/api/attempts`, {
    headers,
    data: {
      sessionId: session.id,
      text: "A small trial can help a community compare results before making a wider change. The results may not represent every setting, so the trial should have a clear scope.",
      responseType: "text",
    },
  });
  expect(created.ok()).toBeTruthy();
  const attempt = await created.json();
  expect(
    (
      await page.request.post(
        `${backend}/api/attempts/${attempt.id}/evaluate`,
        { headers, data: {} },
      )
    ).ok(),
  ).toBeTruthy();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`${backend}/api/attempts/${attempt.id}`)
          ).json()
        ).status,
    )
    .toBe("completed");
  return (
    await page.request.get(`${backend}/api/attempts/${attempt.id}`)
  ).json();
}

// Observe real browser style changes rather than requiring a particular frame
// to land between two Playwright calls. No production animation test switch.
async function openAndObserve(page: Page, key: string) {
  return page.evaluate(async (dimension) => {
    const samples: { opacity: number; y: number }[] = [];
    const sample = () => {
      const element = document.querySelector(
        `[data-testid="grow-detail-${dimension}"]`,
      );
      if (!element) return;
      const style = getComputedStyle(element);
      const matrix =
        style.transform === "none"
          ? new DOMMatrix()
          : new DOMMatrix(style.transform);
      samples.push({ opacity: Number(style.opacity), y: matrix.m42 });
    };
    const observer = new MutationObserver(sample);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    const button = document.querySelector<HTMLElement>(
      `[data-testid="grow-dimension-${dimension}"]`,
    );
    if (!button) throw new Error("Feedback control missing");
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 450));
    sample();
    observer.disconnect();
    return samples;
  }, key);
}

test("feedback reveals remain usable, follow live system motion preference, and honour saved Reduce motion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  const attempt = await savedFeedback(page);
  await page.goto(`${base}/attempt?id=${attempt.id}`);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  const normal = await openAndObserve(page, "grounded");
  expect(normal.length).toBeGreaterThan(0);
  expect(
    normal.some((frame) => frame.opacity < 0.99 || frame.y > 0.1),
    "Normal mode should include a finite reveal",
  ).toBeTruthy();
  expect(normal.at(-1)!.opacity).toBe(1);
  expect(normal.at(-1)!.y).toBeCloseTo(0, 3);
  const quote = attempt.evaluation!.dimensions.find(
    (d) => d.key === "grounded",
  )!.evidence_spans[0].quote;
  await expect(page.getByTestId("grow-evidence-grounded-0")).toHaveText(
    `“${quote}”`,
  );
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled();

  // The preference changes while this screen stays mounted.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const reduced = await openAndObserve(page, "reasoned");
  expect(reduced.length).toBeGreaterThan(0);
  expect(
    reduced.every((frame) => frame.opacity === 1 && Math.abs(frame.y) < 0.001),
  ).toBeTruthy();
  await expect(page.getByTestId("grow-dimension-reasoned")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByTestId("grow-dimension-reasoned").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("grow-detail-reasoned")).toHaveCount(0);

  // An in-app preference also suppresses motion when the OS allows it.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${base}/settings`);
  await page
    .getByRole("switch", { name: "Reduce motion", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${backend}/api/state`)).json()).profile
          .reducedMotion,
    )
    .toBe(true);
  await page.goto(`${base}/attempt?id=${attempt.id}`);
  await expect(page.getByTestId("grow-dimension-organised")).toBeVisible();
  const saved = await openAndObserve(page, "organised");
  expect(saved.length).toBeGreaterThan(0);
  expect(
    saved.every((frame) => frame.opacity === 1 && Math.abs(frame.y) < 0.001),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test("turning on reduced motion during a spin settles the selected prompt without waiting for animation time", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  await page.goto(`${base}/practice?mode=spin_speak`);
  const spin = page.getByRole("button", {
    name: "Spin flower wheel to choose a challenge",
    exact: true,
  });
  await expect(spin).toBeVisible();
  await page.clock.install();
  await page.clock.pauseAt(
    new Date((await page.evaluate(() => Date.now())) + 1000),
  );
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sessions") &&
      response.request().method() === "POST",
  );
  await spin.click({ force: true });
  const session = await (await created).json();
  // Animation frames are frozen: an implementation that only lets the spin
  // finish will remain stuck here. A live preference must cancel and resolve it.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const skip = page.getByRole("button", { name: "Skip prep", exact: true });
  await expect(skip).toBeVisible();
  await expect(
    page.getByText(session.prompt.question, { exact: true }),
  ).toBeVisible();
  await skip.click({ force: true });
  await expect(
    page.getByRole("textbox", { name: "Your response", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save & close", exact: true }),
  ).toBeEnabled();
  await page.clock.resume();
  expect(errors).toEqual([]);
});
