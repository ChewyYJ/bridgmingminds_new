import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.use({ channel: "chrome", viewport: { width: 390, height: 920 } });
test.setTimeout(90_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const headers = { Origin: new URL(base).origin };

async function setup(page: Page, reducedMotion: boolean) {
  const health = await (await page.request.get(`${base}/api/health`)).json();
  expect(health.provider).toBe("local");
  await page.request.post(`${base}/api/auth/guest`, { headers, data: {} });
  const profile = await page.request.patch(`${base}/api/me`, {
    headers,
    data: {
      displayName: "Preparation learner",
      timezone: "UTC",
      onboardingComplete: true,
      reducedMotion,
    },
  });
  expect(profile.ok()).toBeTruthy();
  await page.emulateMedia({
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  await page.goto(`${base}/debate-street`);
  await page.getByRole("button", { name: /^Walk to Ari,/ }).click();
  await page
    .getByRole("button", { name: "Practise with Ari", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Argue for", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Argue against", exact: true }),
  ).toHaveCount(0);
}

async function roll(page: Page) {
  const response = page.waitForResponse(
    (res) =>
      res.url().endsWith("/api/debate/sessions") &&
      res.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Roll my position", exact: true })
    .click();
  const session = await (await response).json();
  expect(["for", "against"]).toContain(session.position);
  return session;
}

async function snapshot(page: Page, name: string) {
  await mkdir("artifacts/debate-preparation", { recursive: true });
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>("*")) {
      if (/auto|scroll/.test(getComputedStyle(element).overflowY))
        element.scrollTop = 0;
    }
  });
  await page.screenshot({ path: `artifacts/debate-preparation/${name}.png` });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("mobile random practice preserves stance, countdown and notes across refresh and starts early", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setup(page, true);
  const rolled = await roll(page);
  await expect(page.getByTestId("debate-preparation")).toBeVisible();
  await expect(page.getByTestId("assigned-debate-position")).toHaveText(
    `Argue ${rolled.position}`,
  );
  await expect(page.getByTestId("debate-preparation-timer")).toHaveText(
    /0[45]:[0-5]\d/,
  );
  const revealed = await (
    await page.request.get(`${base}/api/debate/sessions/${rolled.id}`)
  ).json();
  expect(
    Date.parse(revealed.preparation.endsAt) -
      Date.parse(revealed.preparation.startedAt),
  ).toBe(300000);
  await page
    .getByRole("textbox", { name: "Your ideas", exact: true })
    .fill(
      "Claim: access matters. Reason: practical learning. Example: raised beds.",
    );
  await snapshot(page, "mobile-preparation");
  await page.clock.install();
  await page.clock.fastForward(31000);
  await expect(page.getByTestId("debate-preparation-timer")).toHaveText(
    /04:2\d/,
  );
  await page.reload();
  await expect(page.getByTestId("debate-preparation")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Your ideas", exact: true }),
  ).toHaveValue(/Claim: access matters/);
  await expect(page.getByTestId("assigned-debate-position")).toHaveText(
    `Argue ${rolled.position}`,
  );
  await expect(page.getByTestId("debate-preparation-timer")).toHaveText(
    /04:2\d/,
  );
  await page.getByTestId("save-leave-preparation").click();
  await expect(page.getByTestId("debate-street")).toBeVisible();
  await page
    .getByRole("button", { name: "Resume preparation with Ari", exact: true })
    .click();
  await page.getByRole("button", { name: "Start battle", exact: true }).click();
  await expect(
    page.getByText("Your turn · Opening", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("speaking-notes")).toContainText(
    "Claim: access matters",
  );
  await expect(page.getByTestId("start-debate-opening")).toHaveCount(0);
  const saved = await (
    await page.request.get(`${base}/api/debate/sessions/${rolled.id}`)
  ).json();
  expect(saved.preparation.endsAt).toBe(revealed.preparation.endsAt);
  expect(saved.position).toBe(rolled.position);
  expect(saved.preparation.completedAt).toBeTruthy();
  await page
    .getByRole("textbox", { name: "Your argument", exact: true })
    .fill(
      "Access should shape this decision because schools have different spaces. A raised bed could make practical learning possible for more students.",
    );
  await page.getByTestId("submit-debate-turn").click();
  await expect(
    page.getByText("Your turn · Rebuttal", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("desktop roll animates and five-minute expiry opens battle automatically", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page, false);
  const rolled = await roll(page);
  await expect(page.getByTestId("debate-position-roll")).toBeVisible();
  await snapshot(page, "desktop-roll");
  await expect(page.getByTestId("debate-preparation")).toBeVisible();
  await expect(page.getByTestId("assigned-debate-position")).toHaveText(
    `Argue ${rolled.position}`,
  );
  await page.getByRole("tab", { name: "Mind map", exact: true }).click();
  await page.getByRole("button", { name: "Box", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Selected idea", exact: true })
    .fill("One clear claim");
  await snapshot(page, "desktop-mindmap");
  await page.clock.install();
  await page.clock.fastForward(301000);
  await expect(
    page.getByText("Your turn · Opening", { exact: true }),
  ).toBeVisible();
  const saved = await (
    await page.request.get(`${base}/api/debate/sessions/${rolled.id}`)
  ).json();
  expect(saved.preparation.completedAt).toBeTruthy();
  expect(saved.preparation.planningBoard.nodes[0].text).toBe("One clear claim");
  expect(saved.turns).toHaveLength(0);
  expect(saved.reward).toBeNull();
});

test("failed automatic start keeps the notes and retries without rerolling", async ({
  page,
}) => {
  await setup(page, true);
  const rolled = await roll(page);
  await expect(page.getByTestId("debate-preparation")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Your ideas", exact: true })
    .fill("My saved opening idea");
  let attempts = 0;
  await page.route(
    `**/api/debate/sessions/${rolled.id}/preparation`,
    async (route) => {
      if (
        route.request().postDataJSON().action === "begin" &&
        ++attempts === 1
      ) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Connection interrupted. Please try again.",
          }),
        });
      } else await route.continue();
    },
  );
  await page.clock.install();
  await page.clock.fastForward(301000);
  await expect(
    page.getByText("Connection interrupted. Please try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Your ideas", exact: true }),
  ).toHaveValue("My saved opening idea");
  expect(attempts).toBe(1);
  await page.getByRole("button", { name: "Start battle", exact: true }).click();
  await expect(
    page.getByText("Your turn · Opening", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("speaking-notes")).toContainText(
    "My saved opening idea",
  );
  expect(attempts).toBe(2);
});
