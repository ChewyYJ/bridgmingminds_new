import { expect, test, type Page } from "@playwright/test";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 390, height: 844 },
  reducedMotion: "no-preference",
});
test.setTimeout(90_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || base;
const headers = { Origin: new URL(base).origin };
const categories = ["hair", "hat", "top", "jacket", "bottom", "shoes", "accessory"];

async function account(page: Page) {
  const health = await (await page.request.get(`${backend}/api/health`)).json();
  expect(health.provider, "Avatar tests must never call a paid provider").toBe("local");
  const guest = await page.request.post(`${backend}/api/auth/guest`, { headers, data: {} });
  expect(guest.ok(), await guest.text()).toBeTruthy();
  const response = await page.request.patch(`${backend}/api/me`, {
    headers,
    data: {
      displayName: "Avatar learner",
      interests: ["Science", "Society"],
      goal: "confidence",
      timezone: "UTC",
      onboardingComplete: true,
      reducedMotion: false,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function open(page: Page) {
  await page.goto(`${base}/avatar`);
  await expect(page.getByTestId("wardrobe-studio")).toBeVisible();
  await expect(page.getByTestId("layered-avatar-big")).toHaveCount(1);
  await expect.poll(async () => page.getByTestId("layered-avatar-big").locator("img").evaluateAll(
    (images) => images.length > 0 && images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
}

async function renderedFrames(page: Page, variant: "big" | "chibi" = "big", duration = 650) {
  return page.getByTestId(`layered-avatar-${variant}`).first().evaluate(async (element, waitMs) => {
    const signatures = new Set<string>();
    const capture = () => signatures.add(
      Array.from(element.querySelectorAll("img")).map((image) => `${image.getAttribute("src")}:${image.getAttribute("style")}:${image.parentElement?.getAttribute("style")}`).join("|"),
    );
    const observer = new MutationObserver(capture);
    observer.observe(element, { subtree: true, attributes: true, childList: true });
    capture();
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    capture();
    observer.disconnect();
    return signatures.size;
  }, duration);
}

test("mobile wardrobe has three gender-specific choices per category and saves an account-scoped look", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await account(page);
  await open(page);
  await page.getByTestId("collection-boy").click();
  const picked: Record<string, string> = {};
  for (const category of categories) {
    await page.getByTestId(`category-${category}`).click();
    const choices = page.locator('[data-testid^="wear-"]');
    await expect(choices).toHaveCount(3);
    const ids = await choices.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")!));
    expect(ids.every((id) => id.startsWith(`wear-boy-${category}-`))).toBe(true);
    picked[category] = ids[1];
    await page.getByTestId(picked[category]).click();
    await expect(page.getByTestId(picked[category])).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByTestId("food-bento").click();
  await expect(page.getByTestId("food-bento")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("save-avatar-look").click();
  await expect(page.getByTestId("avatar-save-notice")).toHaveText("Saved on this device.");
  const savedKeys = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) => entry.endsWith(":avatar-wardrobe-v1"));
    return key ? Object.keys(JSON.parse(localStorage.getItem(key)!)).sort() : [];
  });
  expect(savedKeys).toEqual(["accessory", "bottom", "collection", "eyeColor", "hair", "hairColor", "hat", "jacket", "shoes", "skin", "top"]);
  await open(page);
  await expect(page.getByTestId("food-ramen")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("collection-boy")).toHaveAttribute("aria-pressed", "true");
  for (const category of categories) {
    await page.getByTestId(`category-${category}`).click();
    await expect(page.getByTestId(picked[category])).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByTestId("collection-girl").click();
  for (const category of categories) {
    await page.getByTestId(`category-${category}`).click();
    const choices = page.locator('[data-testid^="wear-"]');
    await expect(choices).toHaveCount(3);
    const ids = await choices.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")!));
    expect(ids.every((id) => id.startsWith(`wear-girl-${category}-`))).toBe(true);
  }
  const layout = await page.evaluate(() => ({ viewport: window.innerWidth, page: document.documentElement.scrollWidth }));
  expect(layout.page).toBeLessThanOrEqual(layout.viewport);
  await page.screenshot({ path: 'artifacts/avatar-modular/app-studio-mobile.png', fullPage: true });

  // A second person on this device must not inherit the first person's saved boy outfit.
  await page.request.post(`${backend}/api/auth/logout`, { headers, data: {} });
  await account(page);
  await open(page);
  await expect(page.getByTestId("collection-girl")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("avatar-save-notice")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("adult movement and chibi reactions remain separate and respect reduced motion", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await account(page);
  await open(page);
  await page.getByTestId("animation-walk").click();
  await expect(page.getByTestId("animation-walk")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("layered-avatar-big")).toHaveAttribute("aria-label", /adult, walk,/);
  await expect(page.getByTestId("layered-avatar-chibi").first()).toHaveAttribute("aria-label", /chibi bust, idle,/);
  await expect(page.getByTestId("adult-action-label")).toHaveText("Walking");
  await expect(page.getByTestId("chibi-action-label")).toHaveText("Idle / blink");
  expect(await renderedFrames(page, "big"), "The adult avatar should walk").toBeGreaterThan(1);
  for (const animation of ["greet", "speak", "celebrate", "eat"]) {
    await page.getByTestId(`animation-${animation}`).click();
    await expect(page.getByTestId(`animation-${animation}`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("layered-avatar-big")).toHaveAttribute("aria-label", /adult, idle,/);
    await expect(page.getByTestId("layered-avatar-chibi").first()).toHaveAttribute("aria-label", new RegExp(`chibi bust, ${animation},`));
    await expect(page.getByTestId("adult-action-label")).toHaveText("Idle / blink");
    expect(await renderedFrames(page, "chibi"), `${animation} should change the chibi pose`).toBeGreaterThan(1);
  }
  await expect(page.locator('[data-testid^="animation-"]')).toHaveCount(6);
  const foods = [
    { id: "ramen", name: "Ramen", animation: "eat" },
    { id: "onigiri", name: "Onigiri", animation: "eatOnigiri" },
    { id: "bento", name: "Bento", animation: "eatBento" },
  ];
  for (const food of foods) {
    await page.getByTestId(`food-${food.id}`).click();
    await expect(page.getByTestId(`food-${food.id}`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("animation-eat")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("layered-avatar-big")).toHaveAttribute("aria-label", /adult, idle,/);
    await expect(page.getByTestId("layered-avatar-chibi").first()).toHaveAttribute("aria-label", new RegExp(`chibi bust, ${food.animation},`));
    await expect(page.getByTestId("chibi-action-label")).toHaveText(`Eating ${food.name}`);
    expect(await renderedFrames(page, "chibi"), `${food.name} should animate`).toBeGreaterThan(1);
  }
  // Returning to Eat retains the chosen preview food without changing the look.
  await page.getByTestId("animation-greet").click();
  await page.getByTestId("animation-eat").click();
  await expect(page.getByTestId("chibi-action-label")).toHaveText("Eating Bento");
  await page.getByRole("button", { name: "← Face left", exact: true }).click();
  await expect(page.getByTestId("layered-avatar-big")).toHaveAttribute("aria-label", /facing left$/);
  await expect(page.getByTestId("layered-avatar-big").locator(":scope > div")).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 0, 0)");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByText("Reduced motion is on. The preview shows a still pose.")).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await renderedFrames(page, "big"), "Reduced motion must freeze adult layers").toBe(1);
  expect(await renderedFrames(page, "chibi"), "Reduced motion must freeze chibi layers").toBe(1);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeDisabled();
  await page.getByTestId("food-onigiri").click();
  await expect(page.getByTestId("chibi-action-label")).toHaveText("Eating Onigiri");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await renderedFrames(page, "chibi"), "Changing food must respect reduced motion").toBe(1);
  // Equipping remains available even when animation is disabled.
  await page.getByTestId("category-hat").click();
  await page.locator('[data-testid^="wear-"]').nth(0).click();
  await expect(page.locator('[data-testid^="wear-"]').nth(0)).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Original preview", exact: true }).click();
  await expect(page.getByText("Debate Street", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
