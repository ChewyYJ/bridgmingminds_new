import { expect, test } from "@playwright/test";
import { continueWithoutReflection } from "./helpers/self-reflection";
const origin = "http://localhost:3003";
const answer =
  "A small trial can test an idea. It gives people a chance to compare outcomes before a wider change.";
const headers = { "X-Offline-Fixture": "mindgarden-offline-fixture-only" };

test("exhausted optional allowance cannot block the two required daily activities", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Daily Access Learner");
  await page
    .getByRole("button", { name: "Start learning", exact: true })
    .click();
  const state = async () =>
    (await page.request.get(`${origin}/api/state`)).json();
  expect((await state()).usage.enabled).toBe(true);
  async function create(mode = "spin_speak") {
    const sessionResponse = await page.request.post(`${origin}/api/sessions`, {
      headers: { Origin: origin },
      data: { mode },
    });
    expect(sessionResponse.ok(), await sessionResponse.text()).toBeTruthy();
    const session = await sessionResponse.json();
    const response = await page.request.post(`${origin}/api/attempts`, {
      headers: { Origin: origin },
      data: { sessionId: session.id, text: answer },
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
  for (let index = 0; index < 5; index++) {
    const attempt = await create();
    const response = await page.request.post(
      `${origin}/api/attempts/${attempt.id}/evaluate`,
      { headers: { Origin: origin }, data: {} },
    );
    expect(response.ok()).toBeTruthy();
    const job = await response.json();
    await expect
      .poll(async () => {
        const current = await (
          await page.request.get(`${origin}/api/jobs/${job.id}`)
        ).json();
        return current.status;
      })
      .toBe("completed");
  }
  expect((await state()).usage.remaining).toBe(0);
  const blocked = await create();
  expect(
    (
      await page.request.post(`${origin}/api/attempts/${blocked.id}/evaluate`, {
        headers: { Origin: origin },
        data: {},
      })
    ).status(),
  ).toBe(429);
  const baseline = (await state()).xp;
  await page
    .getByRole("button", { name: "Start my daily workout", exact: true })
    .click();
  await expect(page.getByTestId("daily-progress")).toHaveText("0/2");
  await page.getByRole("button", { name: "Read Aloud", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your reading observation", exact: true })
    .fill("I practised the final phrase and noticed a comfortable pause.");
  await page
    .getByRole("checkbox", {
      name: "I practised this passage and reviewed my reading",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Save reading self-review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reading practice saved", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to daily workout", exact: true })
    .click();
  await expect(page.getByTestId("daily-progress")).toHaveText("1/2");
  await page.getByRole("button", { name: "Spin & Speak", exact: true }).click();
  await page
    .getByRole("button", { name: "Spin a prompt", exact: true })
    .click();
  await page.getByRole("button", { name: "Skip prep", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(answer);
  await continueWithoutReflection(page);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  const completed = await state();
  expect(completed.xp).toBe(baseline + 25);
  expect(completed.dailyWorkout.xp).toBe(25);
  expect(completed.usage.remaining).toBe(0);
  expect(completed.usage.dailySpeakingIncluded).toBe(true);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByTestId("daily-progress")).toHaveText("2/2");
  await page.reload();
  await expect(page.getByTestId("daily-progress")).toHaveText("2/2");
  const optional = await create("debate");
  expect(
    (
      await page.request.post(
        `${origin}/api/attempts/${optional.id}/evaluate`,
        { headers: { Origin: origin }, data: {} },
      )
    ).status(),
  ).toBe(429);
  await page.screenshot({
    path: "docs/screenshots/daily-workout/optional-quota-exhausted-daily-complete.png",
  });
  const status = await (
    await page.request.get(`${origin}/__offline_ai/status`, { headers })
  ).json();
  expect(status.network).toBe("blocked");
  expect(status.unexpected).toEqual([]);
});
