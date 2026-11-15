import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import type { DebateSession, DebateTournament } from "../shared/debate.mjs";

const base = "http://127.0.0.1:3026";
const headers = { Origin: base };
const answers = {
  opening: "I support shared facilities when residents can reach and maintain them. A hypothetical common room could serve both older residents and students at different times.",
  rebuttal: "The opportunity cost of land matters. I would start by sharing an existing room and publish a maintenance plan before proposing a new building. Residents could also respond by phone or writing if they cannot attend a meeting.",
  closing: "The priority should depend on resident needs, accessible routes and an affordable upkeep plan. A small trial would let residents compare this use with the strongest alternative before a permanent decision.",
};
async function get<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`${base}/api${path}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function screenshot(page: Page, name: string) {
  await mkdir("artifacts/role3/boss", { recursive: true });
  await page.evaluate(async () => {
    for (const element of document.querySelectorAll<HTMLElement>("*")) {
      if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY)) element.scrollTop = 0;
    }
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect.poll(() => page.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: `artifacts/role3/boss/${name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("Singapore tournament uses real validated victories, advances to Chair Lin and preserves the completed boss result", async ({ page }) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== base) externalRequests.push(new URL(request.url()).origin);
  });
  const status = await page.request.get(`${base}/__role3_boss/status`, { headers: { "X-Offline-Fixture": "role3-boss-browser-only" } });
  expect((await status.json()).fixture).toBe("role3-boss-offline");
  const guest = await page.request.post(`${base}/api/auth/guest`, { headers, data: {} });
  expect(guest.ok(), await guest.text()).toBeTruthy();
  const profile = await page.request.patch(`${base}/api/me`, { headers, data: { displayName: "Civic Cup learner", onboardingComplete: true, timezone: "Asia/Singapore", reducedMotion: true } });
  expect(profile.ok(), await profile.text()).toBeTruthy();
  await page.goto("/tournament");
  await expect(page.getByTestId("tournament-lobby")).toBeVisible();
  await expect(page.getByText("Choose a topic", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("start-debate-tournament")).toBeEnabled();
  await expect(page.getByText("Singapore Civic Cup", { exact: true })).toBeVisible();
  await screenshot(page, "tournament-lobby-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot(page, "tournament-lobby-desktop");
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.getByRole("button", { name: "Topic & difficulty", exact: true }).click();
  await expect(page.getByRole("link", { name: /URA/ })).toHaveAttribute("href", /ura\.gov\.sg/);
  await page.getByRole("button", { name: "Close match setup", exact: true }).click();
  await page.getByTestId("start-debate-tournament").click();

  let runId = "";
  let finalSession: DebateSession | undefined;
  for (let round = 1; round <= 3; round++) {
    await expect(page.getByTestId("debate-preparation")).toBeVisible();
    const history = await get<{ sessions: DebateSession[]; tournaments: DebateTournament[] }>(page, "/debate/history");
    const run = history.tournaments[0];
    runId = run.id;
    expect(run.round).toBe(round);
    const session = await get<DebateSession>(page, `/debate/sessions/${run.currentSessionId}`);
    expect(session.opponent.id).toBe(["mina", "leo", "chair-lin"][round - 1]);
    expect(session.topic.region).toBe("Singapore");
    if (round === 3) {
      expect(session.opponent.fictional).toBe(true);
      await expect(page.getByText("Chair Lin", { exact: true }).first()).toBeVisible();
      await screenshot(page, "boss-preparation-mobile");
    }
    await page.getByTestId("start-debate-opening").click();
    for (const [stage, text] of Object.entries(answers)) {
      await expect(page.getByText(`Your turn · ${stage[0].toUpperCase()}${stage.slice(1)}`, { exact: true })).toBeVisible();
      const input = page.getByRole("textbox", { name: "Your argument", exact: true });
      await expect(input).toBeEditable();
      await input.fill(text);
      if (round === 3 && stage === "opening") await screenshot(page, "boss-match-mobile");
      await page.getByTestId("submit-debate-turn").click();
    }
    await page.getByTestId("finish-debate").click();
    await expect(page.getByTestId("debate-victory")).toBeVisible();
    await expect(page.getByText("Victory!", { exact: true })).toBeVisible();
    finalSession = await get<DebateSession>(page, `/debate/sessions/${session.id}`);
    expect(finalSession.evaluation?.provider).toBe("openai");
    expect(finalSession.evaluation?.uncertain).toBe(false);
    expect(finalSession.evaluation?.outcome).toBe("win");
    expect(finalSession.evaluation?.totals).toEqual({ user: 18, ai: 12 });
    for (const criterion of finalSession.evaluation!.criteria) for (const side of ["user", "ai"] as const) {
      for (const evidence of criterion[side].evidence) {
        const turn = finalSession.turns.find(turn => turn.id === evidence.turnId);
        expect(turn?.speaker).toBe(side);
        expect(turn?.text.slice(evidence.start, evidence.end)).toBe(evidence.quote);
      }
    }
    if (round < 3) {
      await expect(page.getByRole("button", { name: "Next match", exact: true })).toBeVisible();
      if (round === 1) await screenshot(page, "victory-mobile");
      await page.getByRole("button", { name: "Next match", exact: true }).click();
    }
  }
  await expect(page.getByText("🏆 Singapore Civic Cup completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next match", exact: true })).toHaveCount(0);
  await screenshot(page, "boss-victory-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot(page, "boss-victory-desktop");
  const completed = await get<{ run: DebateTournament; session: DebateSession }>(page, `/debate/tournaments/${runId}`);
  expect(completed.run.status).toBe("completed");
  expect(completed.run.matches.map(match => match.outcome)).toEqual(["win", "win", "win"]);
  expect(completed.run.matches.at(-1)?.opponentId).toBe("chair-lin");
  const before = await get<{ coins: number; xp: number }>(page, "/gamification");
  const repeat = await page.request.post(`${base}/api/debate/sessions/${finalSession!.id}/finish`, { headers, data: {} });
  expect(repeat.ok(), await repeat.text()).toBeTruthy();
  expect((await repeat.json()).reward.ledgerTransactionId).toBe(finalSession!.reward?.ledgerTransactionId);
  const after = await get<{ coins: number; xp: number }>(page, "/gamification");
  expect({ coins: after.coins, xp: after.xp }).toEqual({ coins: before.coins, xp: before.xp });
  await page.reload();
  await page.getByRole("button", { name: "My record", exact: true }).first().click();
  await page.getByRole("button", { name: "View result", exact: true }).first().click();
  await expect(page.getByTestId("debate-victory")).toBeVisible();
  const fixtureStatus = await page.request.get(`${base}/__role3_boss/status`, { headers: { "X-Offline-Fixture": "role3-boss-browser-only" } });
  expect(await fixtureStatus.json()).toEqual({ fixture: "role3-boss-offline", network: "blocked", calls: { replies: 9, judges: 3, bossReplies: 3 }, unexpected: [] });
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
