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

test("mobile learner equips owned items, completes a recoverable local debate, and buys a confirmed onigiri meal", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await account(page); await page.goto(base);
  await expect(page.getByTestId("gamification-home")).toBeVisible();
  await expect(page.getByRole("button", { name: "Daily Practice", exact: true })).toBeVisible();
  await screenshot(page, "home-mobile"); await noOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 }); await screenshot(page, "home-desktop"); await page.setViewportSize({ width: 390, height: 1000 });

  await page.goto(`${base}/avatar`); await expect(page.getByTestId("avatar-wardrobe-screen")).toBeVisible();
  await screenshot(page, "avatar-mobile");
  await page.getByTestId("wardrobe-category-hair").click();
  await page.getByTestId("inventory-girl-hair-bob").click();
  await page.getByTestId("equip-avatar").click();
  await expect(page.getByText("Your look is equipped.")).toBeVisible();
  await page.getByRole("button", { name: "Hats", exact: true }).click();
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
  await expect(page.getByText(/Local practice mode · rule-based/)).toBeVisible();
  await page.getByTestId("street-walk-right").click(); await page.getByTestId("street-walk-left").click();
  await expect(page.getByText(/Reduced motion is on; movement is shown as still positions/)).toBeVisible();
  await screenshot(page, "street-mobile"); await noOverflow(page);
  await page.getByRole("button", { name: "Meet Mina", exact: true }).click();
  await page.getByRole("button", { name: "Debate with Mina", exact: true }).click();
  await page.getByRole("button", { name: "Students should choose between different homework formats.", exact: true }).click();
  await screenshot(page, "challenger-mobile");
  await page.getByTestId("start-debate-practice").click(); await expect(page.getByTestId("debate-match")).toBeVisible();
  await expect(page.getByTestId("debate-preparation")).toBeVisible(); await screenshot(page, "preparation-mobile");
  await page.getByTestId("start-debate-opening").click();
  const argument = page.getByRole("textbox", { name: "Your argument", exact: true });
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
  await page.getByTestId("buy-food-onigiri").click();
  const calls: string[] = []; page.on("request", request => { if (request.url().endsWith("/api/food/purchase")) calls.push(request.postData() || ""); });
  await page.getByTestId("confirm-food-purchase").click();
  await expect(page.getByTestId("food-purchase-result")).toContainText("Onigiri served");
  await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", "Onigiri eating preview");
  const after = await (await page.request.get(`${base}/api/gamification`)).json(); expect(after.coins).toBe(before.coins - 5); expect(after.fullness.value).toBe(Math.min(100, before.fullness.value + 20)); expect(calls).toHaveLength(1);
  await screenshot(page, "food-mobile"); await noOverflow(page);
  await page.goto(`${base}/tournament`); await expect(page.getByTestId("tournament-lobby")).toBeVisible();
  await expect(page.getByTestId("start-debate-tournament")).toBeDisabled();
  await screenshot(page, "lobby-mobile"); await noOverflow(page);
  await page.getByRole("button", { name: "Rounds", exact: true }).click();
  for (const name of ["1. Mina", "2. Leo", "3. Chair Lin · Boss"]) await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.goto(`${base}/achievements`); await expect(page.getByTestId("achievements-screen")).toBeVisible(); await page.getByRole("button", { name: "Earned", exact: true }).click(); await expect(page.getByText("Make your case", { exact: true })).toBeVisible();
  await screenshot(page, "achievements-mobile");
  const savedHistory = await (await page.request.get(`${base}/api/debate/history`)).json();
  await page.goto(`${base}/debate-street`); await page.getByRole("button", { name: "My record", exact: true }).click();
  await page.getByRole("button", { name: "Delete match record", exact: true }).first().click();
  await page.getByRole("button", { name: "Confirm delete record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm delete record", exact: true })).toHaveCount(0);
  expect((await (await page.request.get(`${base}/api/debate/history`)).json()).sessions).toHaveLength(savedHistory.sessions.length - 1);
  expect((await (await page.request.get(`${base}/api/gamification`)).json()).coins).toBe(after.coins);
  await page.goto(`${base}/profile`);
  await expect(page.getByText("Milestones", { exact: true })).toBeVisible();
  for (const achievement of after.achievements) await expect(page.getByText(achievement.title, { exact: true })).toBeVisible();
  await expect(page.getByText("First seed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Fully grown", { exact: true })).toHaveCount(0);
  await page.getByText("Milestones", { exact: true }).scrollIntoViewIfNeeded();
  await page.getByText("Milestones", { exact: true }).locator("..").screenshot({ path: "artifacts/role3/profile-milestones-mobile.png" });
  expect(errors).toEqual([]);
});

for (const food of [{ id: "ramen", animation: "eat", name: "Ramen" }, { id: "bento", animation: "eatBento", name: "Bento" }]) {
  test(`${food.name} purchase uses its matching eating action and the server price`, async ({ page }) => {
    await account(page); await completePractice(page); await completePractice(page, "library-spaces");
    const before = await (await page.request.get(`${base}/api/gamification`)).json();
    await page.goto(`${base}/food`); await page.getByTestId(`buy-food-${food.id}`).click();
    await page.getByTestId("confirm-food-purchase").click(); await expect(page.getByTestId("food-purchase-result")).toContainText(`${food.name} served`);
    await expect(page.getByTestId("layered-avatar-chibi")).toHaveAttribute("aria-label", `${food.name} eating preview`);
    expect((await (await page.request.get(`${base}/api/gamification`)).json()).coins).toBe(before.coins - 5);
    await expect(page.getByTestId("confirm-food-purchase")).toBeDisabled();
  });
}

test("spoken debate turn keeps its private recording when local transcription requires a reviewed text", async ({ page, context }) => {
  await account(page); await context.grantPermissions(["microphone"], { origin: base });
  await page.goto(`${base}/debate-street`); await page.getByRole("button", { name: "Tournament lobby", exact: true }).click();
  await page.getByTestId("start-debate-practice").click();
  await page.getByTestId("start-debate-opening").click();
  await page.getByRole("button", { name: "Speak", exact: true }).click();
  await page.getByRole("button", { name: "Allow private recording", exact: true }).click();
  await page.getByRole("button", { name: "Record my response", exact: true }).click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Done", exact: true }).click();
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
  await page.goto(`${base}/avatar`); await page.getByTestId("wardrobe-category-hat").click();
  await page.getByTestId(`inventory-${item.id}`).click();
  await expect(page.getByTestId(`item-art-${item.id}`).locator("img").first()).toBeVisible();
  await expect(page.getByTestId("equip-avatar")).toBeDisabled();
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
  await page.reload(); await page.getByTestId("wardrobe-category-hat").click();
  await expect(page.getByTestId(`inventory-${item.id}`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("buy-avatar-item")).toHaveCount(0);
  await noOverflow(page);
});
