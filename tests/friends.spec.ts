import { expect, test, type Page } from "@playwright/test";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test.setTimeout(180_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || "http://localhost:3002";
const opening =
  "I support a careful trial because students can learn to explain where a tool helped them and where their own reasoning matters. For example, a teacher could ask them to defend each step.";
const voice =
  "I see that benefit, but I oppose unrestricted use because it can hide misunderstandings. A student might repeat a convincing answer without knowing why it works. We need independent checks.";
test.beforeEach(async ({ page }) => {
  expect(
    new URL(backend).port,
    "Use only the isolated friend-test server",
  ).toBe("3002");
  const health = await (await page.request.get(`${backend}/api/health`)).json();
  expect(
    health.provider,
    "Friend tests must not contact a live AI provider",
  ).toBe("local");
});
async function onboard(page: Page, name: string) {
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill(name);
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Debate with friends", exact: true })
    .click();
  await expect(
    page.getByText("Take opposite sides and alternate turns.", { exact: true }),
  ).toBeVisible();
}

test("two friends invite, alternate text and voice, resume drafts, and retain their conversation", async ({
  page: host,
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    permissions: ["microphone"],
  });
  const guest = await context.newPage();
  const outside = await browser.newContext();
  const runtimeErrors: string[] = [];
  host.on("pageerror", (error) => runtimeErrors.push(error.message));
  guest.on("pageerror", (error) => runtimeErrors.push(error.message));
  try {
    await onboard(host, "Avery");
    await onboard(guest, "Riley");
    const hostBefore = await (
      await host.request.get(`${backend}/api/state`)
    ).json();
    const guestBefore = await (
      await guest.request.get(`${backend}/api/state`)
    ).json();
    expect(
      (
        await outside.request.post(`${backend}/api/auth/guest`, {
          headers: { Origin: new URL(base).origin },
          data: {},
        })
      ).ok(),
    ).toBeTruthy();
    const created = host.waitForResponse(
      (response) =>
        response.url().endsWith("/api/friends/rooms") &&
        response.request().method() === "POST",
    );
    await host
      .getByRole("button", { name: "Create invite", exact: true })
      .click();
    const room = await (await created).json();
    expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(room.rounds).toBe(2);
    await expect(
      host.getByLabel(`Invite code ${room.code}`, { exact: true }),
    ).toBeVisible();
    await expect(
      host.getByText("WAITING FOR FRIEND", { exact: true }),
    ).toBeVisible();
    await host
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await host.bringToFront();
    await host
      .getByRole("button", { name: "Copy invite code", exact: true })
      .click();
    expect(await host.evaluate(() => navigator.clipboard.readText())).toBe(
      room.code,
    );
    await guest
      .getByRole("textbox", { name: "Six-character invite code", exact: true })
      .fill(room.code);
    await guest
      .getByRole("button", { name: "Join debate", exact: true })
      .click();
    await expect(host.getByText("Your turn", { exact: true })).toBeVisible();
    await expect(
      guest.getByText("Your friend’s turn", { exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByRole("textbox", {
        name: "Your argument to your friend",
        exact: true,
      }),
    ).toHaveCount(0);
    const joined = await (
      await host.request.get(`${backend}/api/friends/rooms/${room.id}`)
    ).json();
    expect(
      joined.participants.map((person: any) => [person.id, person.position]),
    ).toEqual([
      [hostBefore.profile.id, "for"],
      [guestBefore.profile.id, "against"],
    ]);
    expect(
      (
        await outside.request.get(`${backend}/api/friends/rooms/${room.id}`)
      ).status(),
    ).toBe(404);
    expect(
      await (await outside.request.get(`${backend}/api/friends/rooms`)).json(),
    ).toEqual([]);
    expect(
      (
        await outside.request.post(`${backend}/api/friends/join`, {
          headers: { Origin: new URL(base).origin },
          data: { code: room.code },
        })
      ).status(),
    ).toBe(409);

    await host
      .getByRole("textbox", {
        name: "Your argument to your friend",
        exact: true,
      })
      .fill(opening);
    await host
      .getByRole("button", { name: "Save & close", exact: true })
      .click();
    await host.reload();
    await host
      .getByRole("button", { name: "Debate with friends", exact: true })
      .click();
    await expect(
      host.getByRole("textbox", {
        name: "Your argument to your friend",
        exact: true,
      }),
    ).toHaveValue(opening);
    const turnUrl = `**/api/friends/rooms/${room.id}/turn`;
    await host.route(turnUrl, (route) => route.abort("failed"));
    await host
      .getByRole("button", { name: "Send my turn", exact: true })
      .click();
    await expect(host.getByRole("alert")).toBeVisible();
    await expect(host.getByText(opening, { exact: true })).toBeVisible();
    await host.unroute(turnUrl);
    // Lose the response after the server commits and also fail recovery reads.
    // Once reads reconnect, polling must reconcile the saved request, preventing
    // an old idempotency key from getting stuck when the speaker's next turn comes.
    const roomUrl = `**/api/friends/rooms/${room.id}`;
    await host.route(roomUrl, (route) => route.abort("failed"));
    await host.route(turnUrl, async (route) => {
      await route.fetch();
      await route.abort("failed");
    });
    const lostResponse = host.waitForEvent("requestfailed", {
      predicate: (request) =>
        request.url().endsWith(`/friends/rooms/${room.id}/turn`),
    });
    await host
      .getByRole("button", { name: "Retry saved turn", exact: true })
      .click();
    await lostResponse;
    await expect(
      host.getByRole("button", { name: "Retry saved turn", exact: true }),
    ).toBeEnabled();
    await host.unroute(roomUrl);
    await expect(
      host.getByText("Your friend’s turn", { exact: true }),
    ).toBeVisible();
    await host.unroute(turnUrl);
    await expect(guest.getByText(opening, { exact: true })).toBeVisible();
    const firstRound = await (
      await host.request.get(`${backend}/api/friends/rooms/${room.id}`)
    ).json();
    expect(firstRound.turns).toHaveLength(1);
    await guest
      .getByRole("button", { name: "All debates", exact: true })
      .click();
    await guest
      .getByRole("textbox", { name: "Six-character invite code", exact: true })
      .fill(room.code);
    await guest
      .getByRole("button", { name: "Join debate", exact: true })
      .click();
    await expect(guest.getByText("Your turn", { exact: true })).toBeVisible();

    await guest
      .getByRole("button", { name: "Record my turn", exact: true })
      .click();
    await expect(
      guest.getByText(/Sending shares your audio and corrected transcript/),
    ).toBeVisible();
    await guest
      .getByRole("button", { name: "Allow voice recording", exact: true })
      .click();
    await guest.bringToFront();
    await guest
      .getByRole("button", { name: "Record my response", exact: true })
      .click();
    // Device preparation and the recorder's first elapsed-second update can
    // exceed the usual assertion budget on a busy browser; still await readiness.
    await expect(
      guest.getByRole("button", { name: "Finish recording", exact: true }),
    ).toBeEnabled({ timeout: 30_000 });
    await expect(guest.getByLabel(/5[0-7] seconds remaining/)).toBeVisible();
    await guest
      .getByRole("button", { name: "Finish recording", exact: true })
      .click();
    const upload = guest.waitForResponse(
      (response) =>
        response.url().endsWith("/api/audio") &&
        response.request().method() === "POST",
    );
    let transcriptionPending = false;
    let releaseTranscription!: () => void;
    const transcriptionGate = new Promise<void>((resolve) => {
      releaseTranscription = resolve;
    });
    const transcriptionRoute = "**/api/audio/*/transcribe";
    await guest.route(transcriptionRoute, async (route) => {
      transcriptionPending = true;
      await transcriptionGate;
      await route.continue();
    });
    await guest
      .getByRole("button", { name: "Use recording", exact: true })
      .click();
    const audio = await (await upload).json();
    try {
      await expect.poll(() => transcriptionPending).toBe(true);
      await expect(
        guest.getByRole("textbox", {
          name: "Transcript to share",
          exact: true,
        }),
      ).not.toBeEditable();
      await expect(
        guest.getByRole("button", { name: "Save & close", exact: true }),
      ).toBeDisabled();
    } finally {
      releaseTranscription();
    }
    const beforeSharing = await host.request.get(
      `${backend}/api/audio/${audio.id}/url`,
    );
    expect(beforeSharing.status()).toBe(404);
    await expect(
      guest.getByText(/Automatic transcription is unavailable/),
    ).toBeVisible();
    await guest.unroute(transcriptionRoute);
    await guest
      .getByRole("textbox", { name: "Transcript to share", exact: true })
      .fill(voice);
    // No Save & close delay: each correction and the attachment must survive an
    // immediate reload, without sharing audio or starting transcription again.
    await guest.reload();
    await expect(
      guest.getByRole("textbox", { name: "Transcript to share", exact: true }),
    ).toHaveValue(voice);
    await expect(
      guest.getByRole("button", { name: "Play recording", exact: true }),
    ).toBeVisible();
    expect(
      (await host.request.get(`${backend}/api/audio/${audio.id}/url`)).status(),
    ).toBe(404);
    await guest
      .getByRole("button", { name: "Send voice & text", exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await guest.screenshot({
      path: testInfo.outputPath("friends-voice-draft-390.png"),
    });
    await guest.setViewportSize({ width: 320, height: 844 });
    await guest
      .getByRole("button", { name: "Send voice & text", exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await guest.screenshot({
      path: testInfo.outputPath("friends-voice-draft-320.png"),
    });
    await guest.setViewportSize({ width: 390, height: 844 });
    await guest
      .getByRole("button", { name: "Send voice & text", exact: true })
      .click();
    await expect(host.getByText(voice, { exact: true })).toBeVisible();
    expect(
      (
        await outside.request.get(`${backend}/api/audio/${audio.id}/url`)
      ).status(),
    ).toBe(404);
    expect(
      (await outside.request.get(`${backend}/api/audio/${audio.id}`)).status(),
    ).toBe(404);
    expect(
      (await host.request.get(`${backend}/api/audio/${audio.id}/url`)).ok(),
    ).toBeTruthy();
    await host.bringToFront();
    await host
      .getByRole("button", { name: "Listen to voice message", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Play recording", exact: true })
      .click();
    await expect(
      host.getByRole("button", { name: "Pause playback", exact: true }),
    ).toBeVisible();
    await expect(
      host.getByRole("button", { name: "Refresh voice playback", exact: true }),
    ).toBeVisible();

    await host
      .getByRole("textbox", {
        name: "Your argument to your friend",
        exact: true,
      })
      .fill(
        "That concern is fair. I would require an explanation without the tool as well, because a careful trial should measure independent understanding rather than just completed homework.",
      );
    await host
      .getByRole("button", { name: "Send my turn", exact: true })
      .click();
    await expect(
      guest.getByRole("textbox", {
        name: "Your argument to your friend",
        exact: true,
      }),
    ).toBeVisible();
    await guest
      .getByRole("textbox", {
        name: "Your argument to your friend",
        exact: true,
      })
      .fill(
        "I could support a limited trial with that independent check. My remaining question is how we would ensure that every student has equal access and can explain their work.",
      );
    await guest
      .getByRole("button", { name: "Send my turn", exact: true })
      .click();
    await expect(host.getByText("COMPLETE", { exact: true })).toBeVisible();
    await expect(guest.getByText("COMPLETE", { exact: true })).toBeVisible();
    const complete = await (
      await host.request.get(`${backend}/api/friends/rooms/${room.id}`)
    ).json();
    expect(complete.turns).toHaveLength(4);
    expect(complete.status).toBe("completed");
    expect(complete.nextUserId).toBeNull();
    expect(complete.turns.map((turn: any) => turn.userId)).toEqual([
      complete.participants[0].id,
      complete.participants[1].id,
      complete.participants[0].id,
      complete.participants[1].id,
    ]);
    await host.reload();
    await expect(host.getByText("COMPLETE", { exact: true })).toBeVisible();
    await expect(host.getByText(opening, { exact: true })).toBeVisible();
    await host
      .getByText("Debate complete", { exact: true })
      .scrollIntoViewIfNeeded();
    await host.screenshot({
      path: testInfo.outputPath("desktop-friends-complete.png"),
    });
    await guest
      .getByText("Debate complete", { exact: true })
      .scrollIntoViewIfNeeded();
    await guest.screenshot({
      path: testInfo.outputPath("mobile-friends-complete.png"),
    });

    await host.getByRole("button", { name: "New debate", exact: true }).click();
    const nextCreated = host.waitForResponse(
      (response) =>
        response.url().endsWith("/api/friends/rooms") &&
        response.request().method() === "POST",
    );
    await host
      .getByRole("button", { name: "Create invite", exact: true })
      .click();
    const secondRoom = await (await nextCreated).json();
    await host
      .getByRole("button", { name: "Close conversation", exact: true })
      .click();
    await host
      .getByRole("button", { name: "Yes, close conversation", exact: true })
      .click();
    await expect(host.getByText("CLOSED", { exact: true })).toBeVisible();
    await guest
      .getByRole("button", { name: "New debate", exact: true })
      .click();
    await guest
      .getByRole("textbox", { name: "Six-character invite code", exact: true })
      .fill(secondRoom.code);
    await guest
      .getByRole("button", { name: "Join debate", exact: true })
      .click();
    await expect(guest.getByRole("alert")).toBeVisible();
    const state = await (await host.request.get(`${backend}/api/state`)).json();
    expect(state.attempts).toHaveLength(0);
    expect(state.wallet).toEqual(hostBefore.wallet);
    expect(state.xp).toBe(hostBefore.xp);
    const guestAfter = await (
      await guest.request.get(`${backend}/api/state`)
    ).json();
    expect(guestAfter.attempts).toHaveLength(0);
    expect(guestAfter.wallet).toEqual(guestBefore.wallet);
    expect(guestAfter.xp).toBe(guestBefore.xp);
    expect(runtimeErrors).toEqual([]);
  } finally {
    await context.close();
    await outside.close();
  }
});

test("rejected friend turns stay editable, Unicode limits match the API, and uncertain errors preserve a retry", async ({
  page: host,
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const guest = await context.newPage();
  try {
    await onboard(host, "Harper");
    await onboard(guest, "Morgan");
    const created = host.waitForResponse(
      (response) =>
        response.url().endsWith("/api/friends/rooms") &&
        response.request().method() === "POST",
    );
    await host
      .getByRole("button", { name: "Create invite", exact: true })
      .click();
    const room = await (await created).json();
    await guest
      .getByRole("textbox", { name: "Six-character invite code", exact: true })
      .fill(room.code);
    await guest
      .getByRole("button", { name: "Join debate", exact: true })
      .click();
    const input = host.getByRole("textbox", {
      name: "Your argument to your friend",
      exact: true,
    });
    await expect(input).toBeVisible();
    await input.fill("🌱".repeat(5));
    await expect(
      host.getByRole("button", { name: "Send my turn", exact: true }),
    ).toBeDisabled();
    await expect(
      host.getByText("5/5,000 characters · at least 10 to send", {
        exact: true,
      }),
    ).toBeVisible();
    await input.fill("🌱".repeat(10));
    await expect(
      host.getByRole("button", { name: "Send my turn", exact: true }),
    ).toBeEnabled();

    const turnUrl = `**/api/friends/rooms/${room.id}/turn`;
    let submittedText = "";
    for (const status of [400, 404, 409]) {
      submittedText = `My argument should remain editable after a rejected ${status} request because correction must be possible.`;
      await input.fill(submittedText);
      await host.route(turnUrl, (route) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({
            error: `Rejected test request ${status}. Please correct your draft.`,
          }),
        }),
      );
      await host
        .getByRole("button", { name: "Send my turn", exact: true })
        .click();
      await expect(host.getByRole("alert")).toContainText(
        `Rejected test request ${status}`,
      );
      await expect(input).toBeEditable();
      await expect(input).toHaveValue(submittedText);
      await expect(
        host.getByRole("button", { name: "Retry saved turn", exact: true }),
      ).toHaveCount(0);
      await host.unroute(turnUrl);
    }
    await host
      .getByRole("button", { name: "Save & close", exact: true })
      .click();
    await host.reload();
    await host
      .getByRole("button", { name: "Debate with friends", exact: true })
      .click();
    await expect(input).toBeEditable();
    await expect(input).toHaveValue(submittedText);

    for (const [index, status] of [429, 503].entries()) {
      await host.route(turnUrl, (route) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ error: `Temporary test failure ${status}.` }),
        }),
      );
      await host
        .getByRole("button", {
          name: index === 0 ? "Send my turn" : "Retry saved turn",
          exact: true,
        })
        .click();
      await expect(host.getByRole("alert")).toContainText(
        `Temporary test failure ${status}`,
      );
      await expect(
        host.getByRole("button", { name: "Retry saved turn", exact: true }),
      ).toBeEnabled();
      await expect(input).toHaveCount(0);
      await expect(
        host.getByText(submittedText, { exact: true }),
      ).toBeVisible();
      await host.unroute(turnUrl);
    }
    await host
      .getByRole("button", { name: "Retry saved turn", exact: true })
      .click();
    await expect(guest.getByText(submittedText, { exact: true })).toBeVisible();
    const saved = await (
      await host.request.get(`${backend}/api/friends/rooms/${room.id}`)
    ).json();
    expect(saved.turns).toHaveLength(1);
    expect(saved.turns[0].text).toBe(submittedText);
  } finally {
    await context.close();
  }
});

test("three-round invitations recover their settings and isolate unsent drafts across rooms and accounts", async ({
  page: host,
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 },
    reducedMotion: "reduce",
  });
  const guest = await context.newPage();
  const errors: string[] = [];
  host.on("pageerror", (error) => errors.push(error.message));
  guest.on("pageerror", (error) => errors.push(error.message));
  const headers = { Origin: new URL(base).origin };
  const readRoom = async (id: string) =>
    (await host.request.get(`${backend}/api/friends/rooms/${id}`)).json();
  const input = (page: Page) =>
    page.getByRole("textbox", {
      name: "Your argument to your friend",
      exact: true,
    });
  const join = async (code: string) => {
    await guest
      .getByRole("textbox", { name: "Six-character invite code", exact: true })
      .fill(code);
    await guest
      .getByRole("button", { name: "Join debate", exact: true })
      .click();
    await expect(
      guest.getByText("Your friend’s turn", { exact: true }),
    ).toBeVisible();
  };
  const open = async (page: Page, question: string) => {
    await page
      .getByRole("button", { name: "All debates", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `Open friend debate: ${question}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: question, exact: true }),
    ).toBeVisible();
  };
  try {
    await onboard(host, "Jordan");
    await onboard(guest, "Sam");
    const initial = await (
      await host.request.get(`${backend}/api/state`)
    ).json();
    const prompts = await (
      await host.request.get(`${backend}/api/prompts?mode=debate`)
    ).json();
    await host.getByRole("radio").nth(1).click();
    await host
      .getByRole("button", { name: "Against the proposition", exact: true })
      .click();
    await host.getByRole("button", { name: "3 rounds", exact: true }).click();
    const createUrl = `${backend}/api/friends/rooms`;
    let firstPayload: any;
    let firstRoom: any;
    await host.route(createUrl, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      firstPayload = route.request().postDataJSON();
      const committed = await route.fetch();
      expect(committed.status()).toBe(201);
      firstRoom = await committed.json();
      await route.abort("connectionfailed");
    });
    await host
      .getByRole("button", { name: "Create invite", exact: true })
      .click();
    await expect(host.getByRole("alert")).toBeVisible();
    expect(firstPayload).toMatchObject({
      promptId: prompts[1].id,
      position: "against",
      rounds: 3,
    });
    await expect(
      host.getByRole("button", { name: "For the proposition", exact: true }),
    ).toBeDisabled();
    await expect(
      host.getByRole("button", { name: "2 rounds", exact: true }),
    ).toBeDisabled();
    await host.unroute(createUrl);
    await host.reload();
    await expect(
      host.getByRole("button", { name: "For the proposition", exact: true }),
    ).toBeDisabled();
    const retryRequest = host.waitForRequest(
      (request) => request.url() === createUrl && request.method() === "POST",
    );
    await host
      .getByRole("button", { name: "Create invite", exact: true })
      .click();
    expect((await retryRequest).postDataJSON()).toEqual(firstPayload);
    await expect(
      host.getByLabel(`Invite code ${firstRoom.code}`, { exact: true }),
    ).toBeVisible();
    expect(await (await host.request.get(createUrl)).json()).toHaveLength(1);
    await join(firstRoom.code);
    const active = await readRoom(firstRoom.id);
    expect(active.rounds).toBe(3);
    expect(active.participants.map((person: any) => person.position)).toEqual([
      "against",
      "for",
    ]);
    await expect(
      guest.getByText("For the proposition", { exact: true }),
    ).toBeVisible();
    const firstDraft =
      "I would challenge this proposal until we compare evidence from people with different circumstances.";
    await input(host).fill(firstDraft);
    await host.reload();
    await expect(input(host)).toHaveValue(firstDraft);

    await host
      .getByRole("button", { name: "All debates", exact: true })
      .click();
    await expect(
      host.getByRole("button", { name: "For the proposition", exact: true }),
    ).toBeEnabled();
    await host.getByRole("radio").first().click();
    await host
      .getByRole("button", { name: "For the proposition", exact: true })
      .click();
    await host.getByRole("button", { name: "2 rounds", exact: true }).click();
    const secondCreated = host.waitForResponse(
      (response) =>
        response.url() === createUrl && response.request().method() === "POST",
    );
    await host
      .getByRole("button", { name: "Create invite", exact: true })
      .click();
    const secondRoom = await (await secondCreated).json();
    expect(secondRoom.id).not.toBe(firstRoom.id);
    expect(secondRoom.prompt.id).toBe(prompts[0].id);
    expect(secondRoom.rounds).toBe(2);
    await guest
      .getByRole("button", { name: "All debates", exact: true })
      .click();
    await join(secondRoom.code);
    const secondDraft =
      "PRIVATE_FRIEND_DRAFT_ONLY: This unfinished argument belongs only to this account and this second room.";
    await input(host).fill(secondDraft);
    await host.reload();
    await expect(input(host)).toHaveValue(secondDraft);
    await open(host, firstRoom.prompt.question);
    await expect(input(host)).toHaveValue(firstDraft);
    await open(guest, firstRoom.prompt.question);
    await expect(
      guest.getByText("Your friend’s turn", { exact: true }),
    ).toBeVisible();
    const spoken: string[] = [];
    for (let turn = 0; turn < 6; turn++) {
      const speaker = turn % 2 === 0 ? host : guest;
      const listener = turn % 2 === 0 ? guest : host;
      const text =
        turn === 0
          ? firstDraft
          : `Turn ${turn + 1}: I would weigh that point against an independent example, and explain what could change this view.`;
      spoken.push(text);
      await expect(input(speaker)).toBeVisible();
      await input(speaker).fill(text);
      await speaker
        .getByRole("button", { name: "Send my turn", exact: true })
        .click();
      await expect(listener.getByText(text, { exact: true })).toBeVisible();
    }
    await expect(host.getByText("COMPLETE", { exact: true })).toBeVisible();
    await expect(guest.getByText("COMPLETE", { exact: true })).toBeVisible();
    const complete = await readRoom(firstRoom.id);
    expect(complete.turns.map((turn: any) => turn.text)).toEqual(spoken);
    expect(complete.turns.map((turn: any) => turn.round)).toEqual([
      1, 1, 2, 2, 3, 3,
    ]);
    expect(complete.nextUserId).toBeNull();
    await guest.reload();
    await expect(guest.getByText("COMPLETE", { exact: true })).toBeVisible();
    await guest
      .getByText("Debate complete", { exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await guest.screenshot({
      path: testInfo.outputPath("friends-three-rounds-320.png"),
    });

    await open(host, secondRoom.prompt.question);
    await expect(input(host)).toHaveValue(secondDraft);
    await open(guest, secondRoom.prompt.question);
    await guest
      .getByRole("button", { name: "Close conversation", exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Keep talking", exact: true })
      .click();
    expect((await readRoom(secondRoom.id)).status).toBe("active");
    await guest
      .getByRole("button", { name: "Close conversation", exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Yes, close conversation", exact: true })
      .click();
    await expect(host.getByText("CLOSED", { exact: true })).toBeVisible();
    await expect(input(host)).toHaveCount(0);
    expect((await readRoom(secondRoom.id)).turns).toHaveLength(0);
    await host.reload();
    await expect(host.getByText("CLOSED", { exact: true })).toBeVisible();
    const cacheKey = `mind-garden-draft:${initial.profile.id}:friends:room:${secondRoom.id}`;
    expect(
      await host.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.text,
        cacheKey,
      ),
    ).toBe(secondDraft);
    const finished = await (
      await host.request.get(`${backend}/api/state`)
    ).json();
    expect(finished.wallet).toEqual(initial.wallet);
    expect(finished.xp).toBe(initial.xp);
    expect(finished.attempts).toHaveLength(0);

    // Deliberately retain device storage while replacing the real auth session;
    // neither old room selection nor an unsent draft may cross the account boundary.
    expect(
      (
        await host.request.post(`${backend}/api/auth/logout`, {
          headers,
          data: {},
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await host.request.post(`${backend}/api/auth/guest`, {
          headers,
          data: {},
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await host.request.patch(`${backend}/api/me`, {
          headers,
          data: { displayName: "New account", onboardingComplete: true },
        })
      ).ok(),
    ).toBeTruthy();
    await host.goto(base);
    await host
      .getByRole("button", { name: "Debate with friends", exact: true })
      .click();
    await expect(
      host.getByText("Your invitations and debates appear here.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(host.getByText(secondDraft, { exact: true })).toHaveCount(0);
    expect(await (await host.request.get(createUrl)).json()).toEqual([]);
    expect(
      (
        await host.request.get(`${backend}/api/friends/rooms/${secondRoom.id}`)
      ).status(),
    ).toBe(404);
    expect(
      await host.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) || "null")?.text,
        cacheKey,
      ),
    ).toBe(secondDraft);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
