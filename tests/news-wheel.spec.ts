import { expect, test } from "@playwright/test";

test.use({ channel: "chrome", viewport: { width: 390, height: 844 } });
test.setTimeout(120000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";

test("news wheel changes the saved question, retains it on failure, and plans the selected story", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("News preview");
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  const initialResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sessions") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Spin and reflect", exact: true })
    .click();
  const initial = await (await initialResponse).json();
  expect(initial.newsSource).toBeTruthy();
  const question = page.getByTestId("daily-news-question");
  await expect(question).toContainText(initial.newsSource.title);
  const wheel = page.getByRole("button", {
    name: "Spin the wheel",
    exact: true,
  });
  const nextResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sessions") &&
      response.request().method() === "POST",
  );
  await wheel.click();
  await expect(wheel).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Start brainstorming", exact: true }),
  ).toBeDisabled();
  const next = await (await nextResponse).json();
  expect(next.newsSource.id).not.toBe(initial.newsSource.id);
  await expect(question).toContainText(next.newsSource.title);
  await expect(wheel).toBeEnabled();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({
      path: info.outputPath(`news-wheel-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.reload();
  await expect(question).toContainText(next.newsSource.title);
  const keys: string[] = [];
  let fail = true;
  await page.route("**/api/sessions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().postDataJSON().idempotencyKey);
    if (fail)
      return route.fulfill({
        status: 503,
        json: { error: "News is temporarily unavailable." },
      });
    return route.continue();
  });
  await wheel.click();
  await expect(page.getByRole("alert")).toContainText(
    "News is temporarily unavailable",
  );
  await expect(question).toContainText(next.newsSource.title);
  await expect(wheel).toBeEnabled();
  fail = false;
  await page.emulateMedia({ reducedMotion: "reduce" });
  const lastResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/sessions") &&
      response.request().method() === "POST",
  );
  await wheel.click();
  const last = await (await lastResponse).json();
  await expect(question).toContainText(last.newsSource.title);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page
    .getByRole("button", { name: "Start brainstorming", exact: true })
    .click();
  await expect(page.getByTestId("daily-screen-board")).toContainText(
    last.newsSource.title,
  );
  await expect(page.getByTestId("daily-screen-board")).toContainText("01:00");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(question).toContainText(last.newsSource.title);
  await expect(wheel).toHaveCount(0); // An existing board must not be attached to a new question.
  expect(errors).toEqual([]);
});
