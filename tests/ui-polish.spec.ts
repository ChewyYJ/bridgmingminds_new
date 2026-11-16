import { expect, test, type Page } from "@playwright/test";

test.use({
  channel: "chrome",
  viewport: { width: 375, height: 900 },
  reducedMotion: "reduce",
});
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const headers = { Origin: new URL(base).origin };
async function onboard(page: Page) {
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Alex");
  await page
    .getByRole("button", { name: "Start learning", exact: true })
    .click();
  await expect(page.getByTestId("daily-hub")).toBeVisible();
}

test("appearance follows the device, keeps unsaved input, and persists an explicit choice", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: "light" });
  await onboard(page);
  await page.goto(`${base}/settings`);
  await page
    .getByRole("textbox", { name: "Display name", exact: true })
    .fill("Unsaved name");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("textbox", { name: "Display name", exact: true }),
  ).toHaveValue("Unsaved name");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "Dark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Use device", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const toggle = page.getByRole("switch", {
    name: "Reduce motion",
    exact: true,
  });
  await expect(toggle).toBeVisible();
  const bounds = (await toggle.boundingBox())!;
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "Dark", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();
  expect(
    await toggle.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe("solid");
  expect(errors).toEqual([]);
});

for (const scheme of ["light", "dark"] as const)
  for (const width of [375, 768, 1440]) {
    test(`${scheme} screens fit ${width}px and keep the learning actions available`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.request.post(`${base}/api/auth/guest`, { headers, data: {} });
      await page.request.patch(`${base}/api/me`, {
        headers,
        data: {
          displayName: "Alex",
          timezone: "UTC",
          onboardingComplete: true,
          reducedMotion: true,
        },
      });
      for (const route of [
        "",
        "/play",
        "/discover",
        "/profile",
        "/settings",
        "/debate",
      ]) {
        await page.goto(`${base}${route}`);
        await expect(page.getByTestId("shell-coin-balance")).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          scheme,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (route === "")
          await expect(
            page.getByRole("button", {
              name: "Start daily practice",
              exact: true,
            }),
          ).toBeVisible();
        if (route === "/profile")
          await expect(page.getByTestId("equip-avatar")).toBeVisible();
        if (route === "/settings")
          await expect(
            page.getByRole("button", { name: "Save profile", exact: true }),
          ).toBeVisible();
        await page.screenshot({
          path: `artifacts/ui-polish/${route.slice(1) || "home"}-${width}-${scheme}.png`,
        });
      }
      expect(errors).toEqual([]);
    });
  }
