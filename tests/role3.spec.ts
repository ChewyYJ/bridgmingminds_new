import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

test.use({ viewport: { width: 390, height: 1000 }, reducedMotion: "reduce" });
test.setTimeout(180_000);
const base = process.env.E2E_WEB_URL || "http://127.0.0.1:3023";
const headers = { Origin: new URL(base).origin };
const opening = "Students should choose homework formats because a spoken explanation can show the same understanding as a written response. For example, both could explain why a scientific result happened.";
const rebuttal = "A shared standard can still be fair across different formats. We could use the same reasoning criteria while allowing students to choose how they explain their example.";
const closing = "Choice is useful when the learning goal remains clear. A small trial with a common rubric could reveal which formats work and where extra support is needed.";

async function account(page: Page, displayName = "Role 3 learner") {
  const health = await (await page.request.get(`${base}/api/health`)).json();
  expect(health.provider, "These tests must use only the local provider").toBe("local");
  const guest = await page.request.post(`${base}/api/auth/guest`, { headers, data: {} }); expect(guest.ok(), await guest.text()).toBeTruthy();
  const response = await page.request.patch(`${base}/api/me`, { headers, data: { displayName, interests: ["Science", "Society"], goal: "confidence", timezone: "UTC", onboardingComplete: true, reducedMotion: true } });
  expect(response.ok(), await response.text()).toBeTruthy();
}
async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(`${base}/api${path}`, { headers, data });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
}
async function completePractice(page: Page, topicId = "repair-devices") {
  let session = await post(page, "/debate/sessions", { requestId: randomUUID(), mode: "practice", topicId, opponentId: "mina", position: "for", proficiency: "beginner" });
  const turns = topicId === "repair-devices" ? {
    opening: "Devices should be easier to repair because replacing one worn battery can extend their useful life. For example, a repairable school tablet could remain useful for another class.",
    rebuttal: "Safety matters, so repair information should identify which work needs a trained technician. Easier access does not mean every repair should be attempted without knowledge.",
    closing: "Clear repair information and replaceable parts could reduce waste while preserving safety limits. A small repair programme would help test the practical costs.",
  } : {
    opening: "Libraries should offer group learning spaces because some learners have no quiet shared workspace at home. A separate room could support discussions without taking away every reading desk.",
    rebuttal: "Quiet readers also need protection, so group spaces should have clear boundaries and booking rules. The library could compare usage before changing the permanent layout.",
    closing: "A balanced trial could support group learning while preserving silent study. Visitor feedback would help the library decide whether the arrangement serves its community.",
  };
  for (const [stage, text] of Object.entries(turns)) session = await post(page, `/debate/sessions/${session.id}/turns`, { requestId: randomUUID(), stage, text });
  return post(page, `/debate/sessions/${session.id}/finish`, {});
}
async function screenshot(page: Page, name: string) {
  await mkdir("artifacts/role3", { recursive: true });
  await page.evaluate(async () => {
    for (const element of document.querySelectorAll<HTMLElement>("*")) {
      if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY)) element.scrollTop = 0;
    }
    await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.screenshot({ path: `artifacts/role3/${name}.png` });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function wardrobeCategory(page: Page, category: string) {
  const target = page.getByTestId(`wardrobe-category-${category}`);
  if (!await target.isVisible()) await page.getByTestId("wardrobe-more-categories").click();
  await target.click();
}

test("mobile learner equips owned items, completes a recoverable local debate, and buys a confirmed onigiri meal", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await account(page); await page.goto(base);
  await expect(page.getByTestId("home-avatar-card")).toBeVisible();
  await expect(page.getByTestId("daily-hub")).toBeVisible();
  await expect(page.getByRole("button", { name: "Read aloud", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Spin & Speak", exact: true })).toBeVisible();
  await screenshot(page, "home-mobile"); await noOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 }); await screenshot(page, "home-desktop"); await page.setViewportSize({ width: 390, height: 1000 });

  await page.goto(`${base}/avatar`); await expect(page.getByTestId("avatar-wardrobe-screen")).toBeVisible();
  await screenshot(page, "avatar-mobile");
  await page.getByTestId("wardrobe-category-hair").click();
  await page.getByTestId("inventory-girl-hair-bob").click();
  await page.getByTestId("equip-avatar").click();
  await expect(page.getByText("Your look is equipped.")).toBeVisible();
  await wardrobeCategory(page, "hat");
  await expect(page.getByText("No owned hats yet.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Shop", exact: true }).click();
  await page.getByTestId("inventory-girl-hat-wool-beret").click();
  await expect(page.getByTestId("buy-avatar-item")).toBeDisabled();
  await expect(page.getByTestId("equip-avatar")).toBeDisabled();
  await page.getByRole("button", { name: "Restore equipped look", exact: true }).click();
  await noOverflow(page);
  await page.reload();
  await page.getByTestId("wardrobe-category-hair").click();
  await expect(page.getByTestId("inventory-girl-hair-bob")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Boy styles", exact: true }).click();
  expect(await page.locator('[data-testid^="inventory-"]').evaluateAll(nodes => nodes.every(node => node.getAttribute("data-testid")!.startsWith("inventory-boy-")))).toBe(true);

  await page.goto(`${base}/debate-street`); await expect(page.getByTestId("debate-street")).toBeVisible();
  await expect(page.getByText("Practice · unscored", { exact: true })).toBeVisible();
  await page.getByTestId("street-walk-right").click(); await page.getByTestId("street-walk-left").click();
  await expect(page.getByText(/Reduced motion is on; movement is shown as still positions/)).toBeVisible();
  await screenshot(page, "street-mobile"); await noOverflow(page);
  await page.getByRole("button", { name: /^Walk to Mina,/ }).click();
  await page.getByRole("button", { name: "Practise with Mina", exact: true }).click();
  await page.getByRole("button", { name: "Change topic", exact: true }).click();
  await page.getByRole("button", { name: "Students should choose between different homework formats.", exact: true }).click();
  await screenshot(page, "challenger-mobile");
  await page.getByTestId("start-debate-practice").click(); await expect(page.getByTestId("debate-match")).toBeVisible();
  await expect(page.getByTestId("debate-preparation")).toBeVisible(); await screenshot(page, "preparation-mobile");
  await page.getByTestId("start-debate-opening").click();
  const argument = page.getByRole("textbox", { name: "Your argument", exact: true });
  // Explicit exit flushes an edited draft without waiting for autosave.
  await expect(page.getByRole("button", { name: "Navigate to Home", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("shell-coin-balance")).toHaveCount(0);
  await argument.fill("My unfinished opening is saved immediately when I leave.");
  await page.getByTestId("save-leave-debate").click();
  await expect(page.getByTestId("debate-street")).toBeVisible();
  await expect(page.getByRole("button", { name: "Navigate to Home", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume opening with Mina", exact: true }).click();
  await expect(argument).toHaveValue("My unfinished opening is saved immediately when I leave.");
  await argument.fill("yes"); await page.getByTestId("submit-debate-turn").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(argument).toBeEditable();
  await argument.fill(opening); await screenshot(page, "match-mobile"); await page.getByTestId("submit-debate-turn").click();
  await expect(page.getByText("Your turn · Rebuttal", { exact: true })).toBeVisible();
  // A page reload must recover the accepted first turn through the account history.
  await page.reload(); await expect(page.getByTestId("debate-street")).toBeVisible();
  await page.getByRole("button", { name: "Resume rebuttal with Mina", exact: true }).click();
  await page.getByRole("button", { name: "Earlier turns", exact: true }).click();
  await expect(page.getByText(opening, { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Your argument", exact: true }).fill(rebuttal); await page.getByTestId("submit-debate-turn").click();
  await expect(page.getByText("Your turn · Closing", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Your argument", exact: true }).fill(closing); await page.getByTestId("submit-debate-turn").click();
  await page.getByTestId("finish-debate").click(); await expect(page.getByTestId("debate-results")).toBeVisible();
  await expect(page.getByText("Practice complete", { exact: true })).toBeVisible();
  await expect(page.getByText(/\+3 Coins/)).toBeVisible();
  await screenshot(page, "results-mobile"); await noOverflow(page);
  await page.getByTestId("view-debate-feedback").click(); await expect(page.getByText("What worked", { exact: true })).toBeVisible();
  const firstBalance = (await (await page.request.get(`${base}/api/gamification`)).json()).coins;
  await page.reload(); await page.getByRole("button", { name: "My record", exact: true }).click();
  await page.getByRole("button", { name: "View result", exact: true }).first().click();
  expect((await (await page.request.get(`${base}/api/gamification`)).json()).coins).toBe(firstBalance);

  await completePractice(page);
  const before = await (await page.request.get(`${base}/api/gamification`)).json(); expect(before.coins).toBeGreaterThanOrEqual(5);
  await page.goto(`${base}/food`); await expect(page.getByTestId("food-care-screen")).toBeVisible();
  const calls: string[] = []; page.on("request", request => { if (request.url().endsWith("/api/food/purchase")) calls.push(request.postData() || ""); });
  await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", "Your avatar, idle");
  await page.getByTestId("buy-food-onigiri").click();
  await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", "Your avatar, idle");
  await expect(page.getByTestId("food-purchase-result")).toHaveCount(0);
  await page.getByTestId("preview-food-animation").click();
  await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", "Onigiri animation preview");
  await expect(page.getByText("Animation preview · no Coins spent", { exact: true })).toBeVisible();
  expect(calls).toHaveLength(0);
  const previewState = await (await page.request.get(`${base}/api/gamification`)).json();
  expect(previewState.coins).toBe(before.coins); expect(previewState.fullness.value).toBe(before.fullness.value);
  await screenshot(page, "food-preview-mobile");
  await page.getByTestId("preview-food-animation").click();
  await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", "Your avatar, idle");
  await page.getByTestId("confirm-food-purchase").click();
  await expect(page.getByTestId("food-purchase-result")).toContainText("Onigiri served");
  await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", "Onigiri served");
  await expect(page.getByText("+20 fullness · −5 Coins", { exact: true })).toBeVisible();
  const after = await (await page.request.get(`${base}/api/gamification`)).json(); expect(after.coins).toBe(before.coins - 5); expect(after.fullness.value).toBe(Math.min(100, before.fullness.value + 20)); expect(calls).toHaveLength(1);
  await screenshot(page, "food-mobile"); await noOverflow(page);
  await page.setViewportSize({ width: 320, height: 900 }); await screenshot(page, "food-served-320"); await noOverflow(page); await page.setViewportSize({ width: 390, height: 1000 });
  await page.getByTestId("food-done").click(); await expect(page.getByTestId("avatar-wardrobe-screen")).toBeVisible();
  await page.goto(`${base}/tournament`); await expect(page.getByTestId("tournament-lobby")).toBeVisible();
  await expect(page.getByTestId("start-debate-tournament")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Practise with Chair Lin", exact: true })).toBeEnabled();
  await screenshot(page, "lobby-mobile"); await noOverflow(page);
  for (const name of ["1. Mina", "2. Leo", "3. Chair Lin"]) await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.goto(`${base}/achievements`); await expect(page.getByTestId("achievements-screen")).toBeVisible(); await page.getByRole("button", { name: "Earned", exact: true }).click(); await expect(page.getByText("Make your case", { exact: true })).toBeVisible();
  await screenshot(page, "achievements-mobile");
  const savedHistory = await (await page.request.get(`${base}/api/debate/history`)).json();
  await page.goto(`${base}/debate-street`); await page.getByRole("button", { name: "My record", exact: true }).click();
  await page.getByRole("button", { name: "Delete match record", exact: true }).first().click();
  await page.getByRole("button", { name: "Confirm delete record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm delete record", exact: true })).toHaveCount(0);
  expect((await (await page.request.get(`${base}/api/debate/history`)).json()).sessions).toHaveLength(savedHistory.sessions.length - 1);
  expect((await (await page.request.get(`${base}/api/gamification`)).json()).coins).toBe(after.coins);
  await page.goto(`${base}/progress`);
  await expect(page.getByText("Milestones", { exact: true })).toBeVisible();
  for (const achievement of after.achievements) await expect(page.getByText(achievement.title, { exact: true })).toBeVisible();
  await expect(page.getByText("First seed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Fully grown", { exact: true })).toHaveCount(0);
  await page.getByText("Milestones", { exact: true }).scrollIntoViewIfNeeded();
  await page.getByText("Milestones", { exact: true }).locator("..").screenshot({ path: "artifacts/role3/profile-milestones-mobile.png" });
  expect(errors).toEqual([]);
});

for (const viewport of [{ name: "mobile", width: 390, height: 1000 }, { name: "desktop", width: 1440, height: 1000 }]) {
  test(`${viewport.name} five-tab navigation preserves daily learning, discovery and profile wardrobe`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await account(page, `Navigation ${viewport.name}`);
    await page.goto(base);
    const tabNames = ["Home", "Play", "Discover", "Debate", "Profile"];
    async function shell() {
      for (const name of tabNames) await expect(page.getByRole("button", { name: `Navigate to ${name}`, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Navigate to (Homeland|Garden|Avatar|Progress)$/ })).toHaveCount(0);
      await expect(page.getByTestId("shell-coin-balance")).toBeVisible();
      await expect(page.getByTestId("shell-coin-balance")).toContainText("Coins");
      await expect(page.getByTestId("shell-coin-balance")).not.toContainText(/seeds|water|sunlight/i);
      await noOverflow(page);
    }
    async function navigate(name: string, path: string) {
      await page.getByRole("button", { name: `Navigate to ${name}`, exact: true }).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(path);
      await shell();
    }
    await shell();
    await expect(page.getByRole("heading", { name: "A little practice today.", exact: true })).toBeVisible();
    await expect(page.getByTestId("home-avatar-card")).toBeVisible();
    await expect(page.getByTestId("home-avatar-card").getByTestId("layered-avatar-chibi")).toBeVisible();
    await expect.poll(async () => {
      const card = await page.getByTestId("home-avatar-card").boundingBox();
      const scene = await page.getByTestId("pixel-scene-skyline").boundingBox();
      return !!card && !!scene && Math.abs(card.width - scene.width) < 3 && Math.abs(card.height - scene.height) < 3;
    }).toBe(true);
    await expect(page.getByTestId("daily-progress")).toHaveText("0 of 2 complete");
    await page.getByRole("button", { name: "Start daily practice", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/read-aloud");
    await expect(page.getByTestId("reading-passage")).toBeVisible();
    await page.goto(base);
    // Choosing the first daily activity enrolls a new learner; opening it alone earns nothing.
    await expect(page.getByTestId("daily-progress")).toHaveText("0 of 2 complete");
    await expect(page.getByRole("button", { name: "Continue practice", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Spin & Speak", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("mode")).toBe("spin_speak");
    await expect(page.getByTestId("daily-screen-entry")).toBeVisible();
    await page.getByRole("button", { name: "Start brainstorming", exact: true }).click();
    await expect(page.getByTestId("daily-screen-board")).toBeVisible();
    const enrolled = await (await page.request.get(`${base}/api/state`)).json();
    const draftKey = `mind-garden-draft:${enrolled.profile.id}:daily-speaking-v2:${enrolled.dailyWorkout.day}:new`;
    await expect.poll(() => page.evaluate(key => {
      const raw = localStorage.getItem(key); return raw ? JSON.parse(raw).step : null;
    }, draftKey)).toBe("board");
    await page.goto(base);
    await expect(page.getByText("Your saved plan · resume", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue practice", exact: true }).click();
    await expect(page.getByTestId("daily-screen-board")).toBeVisible();
    await page.goto(base);
    await navigate("Play", "/play");
    await expect(page.getByText("Spin & Speak", { exact: true })).toBeVisible();
    await expect(page.getByText("AI Debate", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start practice", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Debate with friends", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Read aloud", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Word review", exact: true })).toBeVisible();
    await screenshot(page, `navigation-play-${viewport.name}`);
    await page.getByRole("button", { name: "Word review", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/vocabulary-review");
    await expect(page.getByRole("heading", { name: "Word review", exact: true })).toBeVisible();
    await expect(page.getByText("You’re caught up", { exact: true })).toBeVisible();
    await page.goto(`${base}/play`);
    await page.getByRole("button", { name: "Explore a topic in Discover", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/discover");
    await shell();
    await expect(page.getByRole("heading", { name: "Something to think about.", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Practice reads", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Today’s news", exact: true })).toBeVisible();
    await expect(page.getByText("Curated summaries for practice · read, then share your view.", { exact: true })).toBeVisible();
    const categoryChips = page.getByLabel("Reading categories", { exact: true }).getByRole("button");
    expect(await categoryChips.evaluateAll(nodes => new Set(nodes.map(node => Math.round(node.getBoundingClientRect().top))).size)).toBe(1);
    expect(await categoryChips.evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 44))).toBe(true);
    const response = await page.request.get(`${base}/api/articles`);
    expect(response.ok()).toBeTruthy();
    const feed = await response.json(); const articles = Array.isArray(feed) ? feed : feed.articles;
    expect(articles.length).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: articles[0].title, exact: true })).toBeVisible();
    await screenshot(page, `navigation-discover-${viewport.name}`);
    await page.route("**/api/news", route => route.fulfill({ json: { articles: [], status: "unavailable", message: "News is unavailable in this offline browser test.", fetchedAt: null, day: new Date().toISOString().slice(0, 10), timezone: "UTC" } }));
    await page.getByRole("tab", { name: "Today’s news", exact: true }).click();
    await expect(page.getByText("Headlines from publishers. Open a source to read the full story.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Read & respond", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Practice reads", exact: true }).click();
    await page.getByRole("button", { name: "Read & respond", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("mode")).toBe("read_reflect");
    await expect.poll(() => new URL(page.url()).searchParams.get("article")).toBe(articles[0].id);
    await page.goto(base);
    await navigate("Debate", "/debate");
    await expect(page.getByTestId("debate-street")).toBeVisible();
    await navigate("Profile", "/profile");
    await expect(page.getByTestId("avatar-wardrobe-screen")).toBeVisible();
    await page.getByRole("button", { name: "Progress", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/progress");
    await expect(page.getByText("Your progress", { exact: true })).toBeVisible();
    await expect(page.getByTestId("wordbloom-progress")).toBeVisible();
    await shell();
    await navigate("Profile", "/profile");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/settings");
    await expect(page.getByRole("textbox", { name: "Display name", exact: true })).toBeVisible();
    await shell();
    // Old bookmarked URLs must continue to reach their replacement feature.
    await page.goto(`${base}/avatar`);
    await expect(page.getByTestId("avatar-wardrobe-screen")).toBeVisible();
    await shell();
    for (const path of ["garden", "homeland", "debate-street"]) {
      await page.goto(`${base}/${path}`);
      await expect(page.getByTestId("debate-street")).toBeVisible();
      await shell();
    }
    await navigate("Home", "/");
    await expect(page.getByTestId("daily-hub")).toBeVisible();
    await expect(page.getByTestId("home-avatar-card")).toBeVisible();
    await screenshot(page, `navigation-home-${viewport.name}`);
    expect(errors).toEqual([]);
  });
}

test("320px Home keeps the Coins header, daily choices and companion card within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await account(page, "Small phone learner"); await page.goto(base);
  await expect(page.getByTestId("daily-hub")).toBeVisible();
  await expect(page.getByTestId("home-avatar-card").getByTestId("layered-avatar-chibi")).toBeVisible();
  for (const target of [page.getByTestId("shell-coin-balance"), page.getByTestId("home-avatar-card"),
    page.getByRole("button", { name: "Read aloud", exact: true }), page.getByRole("button", { name: "Spin & Speak", exact: true })]) {
    const box = await target.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  for (const name of ["Home", "Play", "Discover", "Debate", "Profile"])
    await expect(page.getByRole("button", { name: `Navigate to ${name}`, exact: true })).toBeVisible();
  await noOverflow(page); await screenshot(page, "navigation-home-320");
  await page.getByTestId("home-avatar-card").screenshot({ path: "artifacts/role3/home-avatar-320.png" });
});

for (const food of [{ id: "ramen", animation: "eat", name: "Ramen" }, { id: "bento", animation: "eatBento", name: "Bento" }]) {
  test(`${food.name} purchase uses its matching eating action and the server price`, async ({ page }) => {
    await account(page); await completePractice(page); await completePractice(page, "library-spaces");
    const before = await (await page.request.get(`${base}/api/gamification`)).json();
    await page.goto(`${base}/food`); await page.getByTestId(`buy-food-${food.id}`).click();
    await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", "Your avatar, idle");
    await page.getByTestId("preview-food-animation").click();
    await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", `${food.name} animation preview`);
    expect((await (await page.request.get(`${base}/api/gamification`)).json()).coins).toBe(before.coins);
    await page.getByTestId("confirm-food-purchase").click(); await expect(page.getByTestId("food-purchase-result")).toContainText(`${food.name} served`);
    await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", `${food.name} served`);
    expect((await (await page.request.get(`${base}/api/gamification`)).json()).coins).toBe(before.coins - 5);
    await expect(page.getByTestId("confirm-food-purchase")).toHaveCount(0);
    await page.getByTestId("food-done").click(); await expect(page.getByTestId("avatar-wardrobe-screen")).toBeVisible();
    await page.goto(`${base}/food`);
    await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", "Your avatar, idle");
    await expect(page.getByText("Your avatar is full. Save this meal for later.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("confirm-food-purchase")).toBeDisabled();
  });
}

test("spoken debate turn keeps its private recording when local transcription requires a reviewed text", async ({ page, context }) => {
  await account(page); await context.grantPermissions(["microphone"], { origin: base });
  await page.goto(`${base}/debate-street`); await page.getByRole("button", { name: "Tournament", exact: true }).click();
  await page.getByTestId("start-debate-practice").click();
  await page.getByTestId("start-debate-opening").click();
  await page.getByTestId("debate-input-record").click();
  await page.getByRole("button", { name: "Allow private recording", exact: true }).click();
  await page.getByRole("button", { name: "Record my response", exact: true }).click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
  await page.getByTestId("save-leave-debate").click();
  await expect(page.getByTestId("debate-match")).toBeVisible();
  await expect(page.getByText("Finish and save your recording, or cancel it explicitly, before leaving.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByTestId("save-leave-debate").click();
  await expect(page.getByRole("button", { name: "Save and transcribe", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save and transcribe", exact: true }).click();
  await expect(page.getByText("Your recording is saved. Transcription is unavailable here; type what you said before submitting.", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Review your transcript", exact: true }).fill(opening);
  await page.getByTestId("submit-debate-turn").click(); await expect(page.getByText("Your turn · Rebuttal", { exact: true })).toBeVisible();
  const history = await (await page.request.get(`${base}/api/debate/history`)).json();
  const turn = history.sessions[0].turns.find((entry: { speaker: string }) => entry.speaker === "user");
  expect(turn.text).toBe(opening); expect(typeof turn.audioId).toBe("string");
  expect((await page.request.get(`${base}/api/audio/${encodeURIComponent(turn.audioId)}/url`)).ok()).toBeTruthy();
});

test("wardrobe purchase confirms its price, retries a lost receipt once, and equips only on request", async ({ page }) => {
  // This fixture touches only the named local browser-test database and this new guest.
  expect(base).toBe("http://127.0.0.1:3023");
  await account(page, "Wardrobe purchase fixture");
  await page.request.get(`${base}/api/gamification`);
  const state = await (await page.request.get(`${base}/api/state`)).json();
  expect(state.profile.displayName).toBe("Wardrobe purchase fixture");
  const db = new DatabaseSync(resolve("data/role3-e2e.sqlite"));
  try {
    db.exec("PRAGMA busy_timeout=5000");
    expect(Number(db.prepare("UPDATE economy_accounts SET coins=1000 WHERE user_id=?").run(state.profile.id).changes)).toBe(1);
  } finally { db.close(); }
  const before = await (await page.request.get(`${base}/api/gamification`)).json();
  const item = before.catalog.find((entry: { id: string }) => entry.id === "girl-hat-wool-beret");
  expect(item.owned).toBe(false); expect(item.price).toBeGreaterThanOrEqual(120);
  const requests: { itemId: string; requestId: string }[] = [];
  await page.route("**/api/avatar/purchase", async route => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      const committed = await route.fetch(); expect(committed.ok()).toBeTruthy();
      await route.abort("failed"); // Payment committed, response lost; retry must use the same key.
    } else await route.continue();
  });
  await page.goto(`${base}/avatar`); await wardrobeCategory(page, "hat");
  await page.getByRole("button", { name: "Shop", exact: true }).click();
  await page.getByTestId(`inventory-${item.id}`).click();
  await expect(page.getByTestId(`item-art-${item.id}`).locator("img").first()).toBeVisible();
  await expect(page.getByTestId("equip-avatar")).toBeDisabled();
  await expect(page.getByText(item.unlockRule.description, { exact: true })).toBeVisible();
  await page.getByTestId("buy-avatar-item").click();
  await expect(page.getByTestId("wardrobe-purchase-confirmation")).toContainText(`for ${item.price} Coins`);
  await page.getByRole("button", { name: "Cancel purchase", exact: true }).click();
  expect(requests).toHaveLength(0);
  await page.getByTestId("buy-avatar-item").click();
  await page.getByTestId("confirm-avatar-purchase").click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await (await page.request.get(`${base}/api/gamification`)).json()).coins).toBe(1000 - item.price);
  await page.getByTestId("confirm-avatar-purchase").click();
  await expect(page.getByTestId("wardrobe-result")).toContainText("added to your wardrobe");
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  const purchased = await (await page.request.get(`${base}/api/gamification`)).json();
  expect(purchased.coins).toBe(1000 - item.price);
  expect(purchased.avatar.selection).toEqual(before.avatar.selection);
  expect(purchased.avatar.ownedItemIds).toContain(item.id);
  await expect(page.getByTestId("equip-avatar")).toBeEnabled();
  await page.getByTestId("equip-avatar").click();
  await expect(page.getByTestId("wardrobe-result")).toHaveText("Your look is equipped.");
  expect((await (await page.request.get(`${base}/api/gamification`)).json()).avatar.selection.hat).toBe(item.id);
  await screenshot(page, "wardrobe-purchased-mobile");
  await page.setViewportSize({ width: 320, height: 900 }); await screenshot(page, "wardrobe-purchased-320"); await noOverflow(page); await page.setViewportSize({ width: 390, height: 1000 });
  await page.reload(); await wardrobeCategory(page, "hat");
  await expect(page.getByTestId(`inventory-${item.id}`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("buy-avatar-item")).toHaveCount(0);
  await noOverflow(page);
});
