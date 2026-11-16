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

test("Singapore tournament starts one Chair Lin challenge and preserves its validated victory", async ({ page }) => {
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
  await expect(page.getByTestId("tournament-current-boss")).toContainText("Chair Lin · Boss challenge");
  await expect(page.getByText("One boss · one match. Build your case through opening, rebuttal and closing.", { exact: true })).toBeVisible();
  await expect(page.getByText("1. Mina", { exact: true })).toHaveCount(0);
  await screenshot(page, "tournament-lobby-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot(page, "tournament-lobby-desktop");
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.getByRole("button", { name: "Read background", exact: true }).click();
  await expect(page.getByRole("link", { name: /URA/ })).toHaveAttribute("href", /ura\.gov\.sg/);
  await page.getByRole("button", { name: "Change match setup", exact: true }).click();
  await expect(page.getByRole("button", { name: "Argue for", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Argue against", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close match setup", exact: true }).click();
  const created = page.waitForResponse(response => response.url().endsWith("/api/debate/tournaments") && response.request().method() === "POST");
  await page.getByTestId("start-debate-tournament").click();
  const createdResponse = await created;
  expect(createdResponse.ok()).toBe(true);
  expect(createdResponse.request().postDataJSON().position).toBe("random");

  await expect(page.getByTestId("debate-preparation")).toBeVisible();
  const history = await get<{ sessions: DebateSession[]; tournaments: DebateTournament[] }>(page, "/debate/history");
  const run = history.tournaments[0];
  const runId = run.id;
  expect(run.round).toBe(1);
  expect(run.bracket.map(opponent => opponent.id)).toEqual(["chair-lin"]);
  const session = await get<DebateSession>(page, `/debate/sessions/${run.currentSessionId}`);
  expect(session.opponent.id).toBe("chair-lin");
  expect(session.topic.region).toBe("Singapore");
  expect(session.opponent.fictional).toBe(true);
  expect(["for", "against"]).toContain(session.position);
  expect(run.position).toBe(session.position);
  expect(session.preparation?.durationSeconds).toBe(300);
  expect(session.preparation?.completedAt).toBeNull();
  expect(session.turns).toHaveLength(0);
  await expect(page.getByTestId("assigned-debate-position")).toHaveText(`Argue ${session.position}`);
  await expect(page.getByTestId("debate-preparation")).toContainText("Chair Lin");
  const beforeBattle = await page.request.get(`${base}/__role3_boss/status`, { headers: { "X-Offline-Fixture": "role3-boss-browser-only" } });
  expect((await beforeBattle.json()).calls).toEqual({ replies: 0, judges: 0, bossReplies: 0 });
  await page.getByRole("textbox", { name: "Your ideas", exact: true }).fill("Consider access, maintenance and the opportunity cost of land.");
  await page.getByTestId("save-leave-preparation").click();
  await page.reload();
  await page.getByTestId("start-debate-tournament").click();
  await expect(page.getByTestId("assigned-debate-position")).toHaveText(`Argue ${session.position}`);
  await expect(page.getByRole("textbox", { name: "Your ideas", exact: true })).toHaveValue("Consider access, maintenance and the opportunity cost of land.");
  const resumed = await get<DebateSession>(page, `/debate/sessions/${session.id}`);
  expect(resumed.position).toBe(session.position);
  expect(resumed.preparation?.endsAt).toBe(session.preparation?.endsAt);
  await screenshot(page, "boss-preparation-mobile");
  await page.getByRole("button", { name: "Start battle", exact: true }).click();
  await expect(page.getByTestId("start-debate-opening")).toHaveCount(0);
  await expect(page.getByTestId("speaking-notes")).toContainText("Consider access, maintenance");
  for (const [stage, text] of Object.entries(answers)) {
    await expect(page.getByText(`Your turn · ${stage[0].toUpperCase()}${stage.slice(1)}`, { exact: true })).toBeVisible();
    const input = page.getByRole("textbox", { name: "Your argument", exact: true });
    await expect(input).toBeEditable();
    await input.fill(text);
    if (stage === "opening") await screenshot(page, "boss-match-mobile");
    await page.getByTestId("submit-debate-turn").click();
  }
  await page.getByTestId("finish-debate").click();
  await expect(page.getByTestId("debate-victory")).toBeVisible();
  await expect(page.getByText("Victory!", { exact: true })).toBeVisible();
  const finalSession = await get<DebateSession>(page, `/debate/sessions/${session.id}`);
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
  await expect(page.getByText("Singapore Civic Cup complete", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next match", exact: true })).toHaveCount(0);
  await screenshot(page, "boss-victory-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot(page, "boss-victory-desktop");
  const completed = await get<{ run: DebateTournament; session: DebateSession }>(page, `/debate/tournaments/${runId}`);
  expect(completed.run.status).toBe("completed");
  expect(completed.run.matches.map(match => match.outcome)).toEqual(["win"]);
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
  expect(await fixtureStatus.json()).toEqual({ fixture: "role3-boss-offline", network: "blocked", calls: { replies: 3, judges: 1, bossReplies: 3 }, unexpected: [] });
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
