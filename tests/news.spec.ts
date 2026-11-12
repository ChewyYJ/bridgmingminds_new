import { expect, test } from "@playwright/test";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || "http://localhost:3002";

test("Today's news shows dated publisher links and recovers from unavailable feeds", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-13T03:00:00Z") });
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const origin = new URL(base).origin;
  await page.request.post(`${backend}/api/auth/guest`, {
    data: {},
    headers: { Origin: origin },
  });
  await page.request.patch(`${backend}/api/me`, {
    data: {
      displayName: "News reader",
      timezone: "Asia/Singapore",
      onboardingComplete: true,
    },
    headers: { Origin: origin },
  });
  // Fixtures keep UI assertions independent of publishers and wall-clock changes.
  let status = "ok";
  await page.route("**/api/news", async (route) => {
    if (status === "network") return route.abort("failed");
    return route.fulfill({
      json: {
        status: status === "empty" ? "ok" : status,
        day: "2026-10-13",
        timezone: "Asia/Singapore",
        fetchedAt: "2026-10-13T03:00:00Z",
        articles:
          status === "unavailable" || status === "empty"
            ? []
            : [
                ...(status === "cna-unavailable"
                  ? []
                  : [
                      {
                        id: "news-cna-fixture",
                        title: "A new community garden opens in Singapore",
                        category: "News",
                        source: "CNA",
                        sourceUrl:
                          "https://www.channelnewsasia.com/singapore/community-garden-fixture",
                        publishedAt: "2026-10-13T02:30:00Z",
                      },
                    ]),
                {
                  id: "news-fixture",
                  title: "A new perspective from space",
                  category: "Science",
                  source: "NASA",
                  sourceUrl: "https://www.nasa.gov/news/",
                  publishedAt: "2026-10-13T02:00:00Z",
                },
              ],
        ...(status === "cna-unavailable"
          ? {
              status: "stale",
              message:
                "Could not refresh CNA. Showing available headlines published today.",
            }
          : status === "stale"
            ? {
                message:
                  "Showing cached headlines while a publisher is unavailable.",
              }
            : {}),
      },
    });
  });
  await page.goto(`${base}/discover`);
  await expect(
    page.getByText(/Curated reading · Summaries for practice/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Today's news", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
  await expect(page.getByText("Oct 13, 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("Time zone: Asia/Singapore")).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Read A new perspective from space at NASA",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Curated reading · Summaries for practice/),
  ).toHaveCount(0);
  const cna = page.getByRole("button", { name: "CNA", exact: true });
  const cnaStory = page.getByRole("link", {
    name: "Read A new community garden opens in Singapore at CNA",
  });
  await expect(cnaStory).toBeVisible();
  await cna.click();
  await expect(cna).toHaveAttribute("aria-pressed", "true");
  await expect(cnaStory).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Read A new perspective/ }),
  ).toHaveCount(0);
  await page.screenshot({ path: "docs/screenshots/cna-news-mobile.png" });
  // Keep the external destination deterministic and avoid a publisher network dependency.
  await page
    .context()
    .route("https://www.channelnewsasia.com/**", (route) =>
      route.fulfill({ body: "CNA destination fixture" }),
    );
  const cnaPopupPromise = page.waitForEvent("popup");
  await cnaStory.click();
  const cnaPopup = await cnaPopupPromise;
  await expect
    .poll(() => cnaPopup.url())
    .toBe("https://www.channelnewsasia.com/singapore/community-garden-fixture");
  await cnaPopup.close();
  status = "cna-unavailable";
  await page.getByRole("button", { name: "Refresh news", exact: true }).click();
  await expect(page.getByText(/Could not refresh CNA/)).toBeVisible();
  await expect(page.getByText("No CNA headlines today.")).toBeVisible();
  await expect(cnaStory).toHaveCount(0);
  await page.getByRole("button", { name: "All sources", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Read A new perspective/ }),
  ).toBeVisible();
  status = "ok";
  await page.getByRole("button", { name: "Refresh news", exact: true }).click();
  await expect(cnaStory).toBeVisible();
  await page.context().route("https://www.nasa.gov/**", (route) =>
    route.fulfill({ body: "NASA destination fixture" }),
  );
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("link", { name: "Read A new perspective from space at NASA" })
    .click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url()).toMatch(/^https:\/\/www.nasa.gov\/news/);
  await popup.close();
  status = "stale";
  await page.getByRole("button", { name: "Refresh news", exact: true }).click();
  await expect(page.getByText(/Showing cached headlines/)).toBeVisible();
  await expect(page.getByText(/Last successful update/)).toBeVisible();
  status = "unavailable";
  await page.getByRole("button", { name: "Refresh news", exact: true }).click();
  await expect(page.getByText("News unavailable.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Read A new perspective/ }),
  ).toHaveCount(0);
  status = "empty";
  await page.getByRole("button", { name: "Refresh news", exact: true }).click();
  await expect(page.getByText("No headlines today.")).toBeVisible();
  status = "network";
  await page.getByRole("button", { name: "Refresh news", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  status = "ok";
  await page.getByRole("button", { name: "Refresh news", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Read A new perspective/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Science", exact: true }).click();
  await expect(
    page.getByText(/Curated reading · Summaries for practice/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "What can a distant planet teach us about evidence?",
    }),
  ).toBeVisible();
  expect(runtimeErrors).toEqual([]);
  await page.request.delete(`${backend}/api/account`, {
    headers: { Origin: origin },
  });
});

test("news refreshes every ten minutes and hides yesterday at the feed timezone’s midnight", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  // Singapore's midnight is 16:00 UTC, independent of the browser's timezone.
  await page.clock.install({ time: new Date("2026-10-13T15:49:00Z") });
  const headers = { Origin: new URL(base).origin };
  await page.request.post(`${backend}/api/auth/guest`, { data: {}, headers });
  await page.request.patch(`${backend}/api/me`, {
    data: {
      displayName: "Night reader",
      timezone: "Asia/Singapore",
      onboardingComplete: true,
    },
    headers,
  });
  let requests = 0;
  let nextDay = false;
  let failAtMidnight = false;
  let releaseFailure = () => {};
  await page.route("**/api/news", async (route) => {
    requests += 1;
    if (failAtMidnight) {
      await new Promise<void>((resolve) => {
        releaseFailure = resolve;
      });
      return route.abort("failed");
    }
    return route.fulfill({
      json: {
        status: "ok",
        day: nextDay ? "2026-10-14" : "2026-10-13",
        timezone: "Asia/Singapore",
        fetchedAt: nextDay ? "2026-10-13T16:00:01Z" : "2026-10-13T15:49:00Z",
        articles: [
          {
            id: nextDay ? "morning" : "evening",
            title: nextDay
              ? "A fresh morning perspective"
              : "An evening perspective",
            source: "NASA",
            sourceUrl: "https://www.nasa.gov/news/",
            category: "Science",
            publishedAt: nextDay
              ? "2026-10-13T16:00:01Z"
              : "2026-10-13T15:00:00Z",
          },
        ],
      },
    });
  });
  await page.goto(`${base}/discover`);
  await page.getByRole("button", { name: "Today's news", exact: true }).click();
  const evening = page.getByRole("link", {
    name: "Read An evening perspective at NASA",
  });
  await expect(evening).toBeVisible();
  await page.clock.pauseAt(new Date("2026-10-13T15:49:10Z"));
  expect(requests).toBe(1);
  await page.clock.fastForward(9 * 60 * 1000);
  expect(requests).toBe(1);
  await page.clock.fastForward(60 * 1000);
  await expect.poll(() => requests).toBe(2);
  await expect(
    page.getByRole("button", { name: "Refresh news", exact: true }),
  ).toBeEnabled();

  failAtMidnight = true;
  await page.clock.fastForward(50 * 1000);
  await expect.poll(() => requests).toBe(3);
  // Hide old headlines immediately, before the next request can finish or fail.
  await expect(evening).toHaveCount(0);
  await expect(page.getByText("Oct 14, 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("Updating headlines…")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh news", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(5_000);
  expect(requests).toBe(3);
  releaseFailure();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(evening).toHaveCount(0);
  await expect(page.getByText("No headlines for today yet.")).toBeVisible();

  nextDay = true;
  failAtMidnight = false;
  await page.getByRole("button", { name: "Refresh news", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: "Read A fresh morning perspective at NASA",
    }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(requests).toBe(4);
  await page.getByRole("button", { name: "Science", exact: true }).click();
  await page.clock.fastForward(20 * 60 * 1000);
  expect(requests).toBe(4);
  expect(runtimeErrors).toEqual([]);
  await page.request.delete(`${backend}/api/account`, { headers });
});
