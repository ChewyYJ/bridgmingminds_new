import {
  continueWithoutReflection,
  skipSelfReflection,
} from "./helpers/self-reflection";
import { expect, test } from "@playwright/test";

test.use({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test.setTimeout(120_000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const backend = process.env.E2E_API_URL || "http://localhost:3002";
const transcript =
  "I think a small trial helps us learn because we can examine the result before changing everything. For example, we could compare two approaches and ask the people affected. However, a small trial has limits, so I would be cautious about claiming it works for everyone.";
const reflectionNote =
  "Next time, I could use one specific example and pause before the conclusion.";

test("record, pause, restart, cancel, replay, correct, and persist a private spoken response", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    (window as any).microphoneRequests = 0;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      (window as any).microphoneRequests += 1;
      return original(constraints);
    };
  });
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Voice Gardener");
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await page.getByRole("button", { name: "Spin & Speak", exact: true }).click();
  await page
    .getByRole("button", { name: "Spin a prompt", exact: true })
    .click();
  await page.getByRole("button", { name: "Skip prep", exact: true }).click();
  await page
    .getByRole("button", { name: "Speak a response", exact: true })
    .click();
  await expect(
    page.getByText("Private recording", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).microphoneRequests)).toBe(0);
  await page
    .getByRole("button", { name: "Allow private recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Record my response", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).microphoneRequests)).toBe(0);

  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: "Finish recording", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: "Save & close", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => (window as any).microphoneRequests),
  ).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("PAUSED", { exact: true })).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/mobile-recording.png" });
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel recording", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your response", exact: true }),
  ).toBeVisible();
  const cancelledState = await (
    await page.request.get(`${backend}/api/state`)
  ).json();
  expect(cancelledState.attempts).toHaveLength(0);

  await page
    .getByRole("button", { name: "Speak a response", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finish recording", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page
    .getByRole("button", { name: "Finish recording", exact: true })
    .click();
  await expect(
    page.getByText("Your recording is ready", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause playback", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use recording", exact: true })
    .click();
  await expect(page.getByTestId("self-reflection")).toBeVisible();
  await expect(page.getByTestId("self-reflection-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(
    page.getByRole("textbox", { name: "Your reflection", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Automatic transcription isn’t enabled. Type what you said below.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByTestId("original-response-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(
    page.getByRole("textbox", { name: "Transcript", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Generate transcript", exact: true })
    .click();
  await expect(
    page.getByText(
      "Automatic transcription isn’t enabled. Type what you said below.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Transcript", exact: true }),
  ).toBeEditable();
  await expect(
    page.getByRole("textbox", { name: "Transcript", exact: true }),
  ).toHaveValue("");
  await page.getByTestId("original-response-toggle").click();
  // Direct feedback still needs the original transcript, even when the
  // optional reflection section has never been opened.
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Add a transcript of your recording to get feedback.",
  );
  await expect(page.getByTestId("self-reflection-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByTestId("original-response-toggle").click();
  await page
    .getByRole("button", { name: "Reflection (optional)", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your reflection", exact: true })
    .fill(reflectionNote);
  const beforeMissingTranscript = await (
    await page.request.get(`${backend}/api/state`)
  ).json();
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Add a transcript of your recording to get feedback. Your reflection is optional.",
  );
  await expect(page.getByTestId("original-response-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const blocked = await (await page.request.get(`${backend}/api/state`)).json();
  expect(blocked.attempts).toHaveLength(1);
  expect(blocked.attempts[0].status).toBe("draft");
  expect(blocked.attempts[0].text).toBe("");
  expect(blocked.attempts[0].evaluation).toBeFalsy();
  expect(blocked.wallet).toEqual(beforeMissingTranscript.wallet);
  await page
    .getByRole("textbox", {
      name: "Transcript",
      exact: true,
    })
    .fill(transcript);
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await page.reload();
  // A server audio draft has a blank transcript until submission; Home must
  // resume the editor's local corrections, not create a retry of that draft.
  const draftState = await (
    await page.request.get(`${backend}/api/state`)
  ).json();
  expect(draftState.attempts).toHaveLength(1);
  expect(draftState.attempts[0].status).toBe("draft");
  expect(draftState.attempts[0].text).toBe("");
  await page
    .getByRole("button", { name: "Continue response", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue this response", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your reflection", exact: true }),
  ).toHaveValue(reflectionNote);
  await expect(page.getByTestId("original-response-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page
    .getByRole("button", { name: "Review transcript", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "Transcript",
      exact: true,
    }),
  ).toHaveValue(transcript);
  await page
    .getByRole("button", { name: "Play recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause playback", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Delivery", { exact: true })).toBeVisible();
  const final = await (await page.request.get(`${backend}/api/state`)).json();
  expect(final.profile.consent.recording).toBe(true);
  expect(final.attempts).toHaveLength(1);
  expect(final.attempts[0].id).toBe(draftState.attempts[0].id);
  expect(final.attempts[0].retryOf).toBeFalsy();
  expect(final.attempts[0].text).toBe(transcript);
  expect(final.attempts[0].selfReflection).toBe(reflectionNote);
  expect(final.attempts[0].responseType).toBe("audio");
  expect(
    final.attempts[0].evaluation.dimensions.find(
      (item: any) => item.key === "delivery",
    ).level,
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        key.includes("practice:spin_speak::"),
      ),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Navigate to Profile", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^View practice:/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your response", exact: true })
    .fill(
      `${transcript} I would ask what observation would change my conclusion.`,
    );
  await continueWithoutReflection(page);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  // Regression: a root refresh used to rehydrate an externally opened retry and
  // replace the completed result with its editor when the prop object changed.
  await page.waitForTimeout(3000);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  const retried = await (await page.request.get(`${backend}/api/state`)).json();
  expect(retried.attempts).toHaveLength(2);
  expect(retried.attempts.find((item: any) => item.retryOf)?.retryOf).toBe(
    final.attempts[0].id,
  );
  expect(errors).toEqual([]);
});

test("a spoken reflection stops at the 60-second limit and remains editable", async ({
  page,
}) => {
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Navigate to Discover", exact: true })
    .click();
  await page.getByRole("button", { name: "Science", exact: true }).click();
  await page
    .getByRole("button", {
      name: "What can a distant planet teach us about evidence?",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Start reflection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Speak a response", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Allow private recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finish recording", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });
  await page.clock.install();
  await page.clock.fastForward(61_000);
  await expect(
    page.getByText("Your recording is ready", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use recording", exact: true })
    .click();
  await expect(
    page.getByText(
      "Automatic transcription isn’t enabled. Type what you said below.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Type transcript", exact: true })
    .click();
  await page
    .getByRole("textbox", {
      name: "Transcript",
      exact: true,
    })
    .fill(transcript);
  await expect(page.getByTestId("self-reflection-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByTestId("self-reflection-note")).toHaveCount(0);
  await skipSelfReflection(page);
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  const saved = await (await page.request.get(`${backend}/api/state`)).json();
  expect(saved.attempts[0].mode).toBe("read_reflect");
  expect(saved.attempts[0].responseType).toBe("audio");
  expect(saved.attempts[0].text).toBe(transcript);
  // Exercise a server-saved audio debate draft without retryOf. Such a draft
  // must provide an editable transcript, not the read-only full-debate view.
  // Reuse this user's real recorded fixture audio; no user database is touched.
  const headers = { Origin: new URL(base).origin };
  const debateSession = await page.request.post(`${backend}/api/sessions`, {
    headers,
    data: { mode: "debate" },
  });
  expect(debateSession.ok()).toBeTruthy();
  const session = await debateSession.json();
  const debateDraft = await page.request.post(`${backend}/api/attempts`, {
    headers,
    data: {
      sessionId: session.id,
      responseType: "audio",
      audioId: saved.attempts[0].audioId,
      text: "",
      selfReflection: reflectionNote,
    },
  });
  expect(debateDraft.status()).toBe(201);
  const draft = await debateDraft.json();
  expect(draft.retryOf).toBeFalsy();
  await page.goto(`${base}/practice?mode=debate&retry=${draft.id}`);
  await expect(
    page.getByRole("textbox", { name: "Your reflection", exact: true }),
  ).toHaveValue(reflectionNote);
  await page
    .getByRole("button", { name: "Type transcript", exact: true })
    .click();
  const debateTranscript = page.getByRole("textbox", {
    name: "Transcript",
    exact: true,
  });
  await expect(debateTranscript).toBeEditable();
  await debateTranscript.fill(transcript);
  await page
    .getByRole("button", { name: "Save & get feedback", exact: true })
    .click();
  await expect(
    page.getByText("Practice complete", { exact: true }),
  ).toBeVisible();
  const final = await (await page.request.get(`${backend}/api/state`)).json();
  expect(
    final.attempts.find((item: { id: string }) => item.id === draft.id),
  ).toMatchObject({
    mode: "debate",
    responseType: "audio",
    text: transcript,
    selfReflection: reflectionNote,
    status: "completed",
  });
});

test("denied microphone access preserves the write alternative", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await page.getByRole("button", { name: "Spin & Speak", exact: true }).click();
  await page
    .getByRole("button", { name: "Spin a prompt", exact: true })
    .click();
  await page.getByRole("button", { name: "Skip prep", exact: true }).click();
  await page
    .getByRole("button", { name: "Speak a response", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Allow private recording", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Write instead", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your response", exact: true }),
  ).toBeVisible();
});
