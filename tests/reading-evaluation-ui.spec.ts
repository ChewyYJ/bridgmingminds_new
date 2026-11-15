import { expect, test } from "@playwright/test";
import { READING_CRITERIA } from "../shared/reading-rubric.mjs";
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
test.use({
  channel: "chrome",
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
});
test.setTimeout(180000);
test("Read Aloud Done evaluates audio without a written review; five cards, playback and reload fit mobile and desktop", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(),
        source = context.createOscillator(),
        target = context.createMediaStreamDestination();
      source.connect(target);
      source.start();
      void context.resume();
      return target.stream;
    };
  });
  let assignment: any, attempt: any;
  let sampleRequests = 0,
    sampleAvailable = true;
  // Sample playback uses the recorded test tone; ElevenLabs itself is tested separately.
  await page.route("**/api/read-aloud/attempts/*/sample", async (route) => {
    if (route.request().method() === "POST") {
      sampleRequests++;
      return route.fulfill({
        json: { audioId: attempt.audioId, provider: "elevenlabs" },
      });
    }
    return route.fulfill({
      json: { available: sampleAvailable, sample: null },
    });
  });
  const evaluation = {
    rubricVersion: "reading-evaluation-v1",
    summary: "Your words were easy to follow.",
    nextStep: "Give each sentence a gentle ending.",
    transcript: "A small garden can help people learn together.",
    measurements: {
      durationSeconds: 4,
      estimatedWordsPerMinute: 120,
      quietPauses: 0,
      spokenWords: 8,
      referenceWords: 85,
      matchedWords: 8,
      transcriptCoveragePercent: 9,
    },
    criteria: READING_CRITERIA.map(({ key }) => ({
      key,
      status: key === "intonation" ? "practice" : "strength",
      observation: "Your phrase was clearly audible.",
      nextStep: "Read the phrase once more at a comfortable pace.",
      evidence: { startSeconds: 0, endSeconds: 2, referenceQuote: "" },
    })),
  };
  await page.route("**/api/read-aloud/assignment", async (route) => {
    if (!assignment) assignment = await (await route.fetch()).json();
    await route.fulfill({
      json: { ...assignment, ...(attempt ? { latestAttempt: attempt } : {}) },
    });
  });
  await page.route("**/api/read-aloud/assignments/*/submit", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.notes).toBeUndefined();
    expect(body.selfReviewConfirmed).toBeUndefined();
    expect(body.processingConsent).toBe(true);
    expect(body.evaluateRecording).toBe(true);
    expect(body.audioId).toBeTruthy();
    attempt = {
      id: "fixture-reading",
      sessionId: assignment.id,
      mode: "read_aloud",
      text: evaluation.transcript,
      audioId: body.audioId,
      speechJobId: "fixture-reading-job",
      passage: assignment.passage,
      evaluation: { speech: { status: "assessed", metrics: null } },
      rewards: { xp: 10, seeds: 0 },
      speechAssessment: {
        status: "assessed",
        provider: "openai",
        metrics: null,
        words: [],
        utterances: [],
        readingEvaluation: evaluation,
      },
    };
    await route.fulfill({ status: 201, json: attempt });
  });
  await page.route("**/api/read-aloud/attempts/*/speech-assessment", (route) =>
    route.fulfill({
      json: {
        id: "fixture-reading-job",
        status: "completed",
        locale: "en-GB",
        prosody: false,
        retries: 0,
        result: attempt.speechAssessment,
        error: null,
      },
    }),
  );
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Reading UI check");
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await expect(page.getByTestId("reading-sample")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Record the passage", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("reading-ready-phone.png") });
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(page.getByLabel(/seconds remaining/)).toContainText(
    /00:5[0-6]/,
    { timeout: 30000 },
  );
  await page
    .getByRole("button", { name: "Pause recording", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("reading-paused-phone.png") });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("textbox", {
      name: "Your reading observation",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByTestId("reading-evaluation")).toBeVisible();
  await expect(page.locator('[data-testid^="reading-criterion-"]')).toHaveCount(
    5,
  );
  await page.getByTestId("reading-criterion-fluency").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("reading-criteria-phone.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTestId("reading-evaluation").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("reading-feedback-desktop.png"),
  });
  expect(sampleRequests).toBe(0);
  const sample = page.getByTestId("reading-sample");
  await sample
    .getByRole("button", { name: "Listen to a sample", exact: true })
    .click();
  await sample
    .getByRole("button", { name: "Play sample", exact: true })
    .click();
  await expect(
    sample.getByRole("button", { name: "Pause playback", exact: true }),
  ).toBeVisible();
  await sample
    .getByRole("button", { name: "Pause playback", exact: true })
    .click();
  await expect(sample).toContainText(assignment.passage.text);
  expect(sampleRequests).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await sample.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("sample-reader-phone.png") });
  sampleAvailable = false;
  await page.reload();
  await expect(page.getByTestId("reading-evaluation")).toBeVisible();
  await expect(
    sample.getByRole("button", { name: "Listen to a sample", exact: true }),
  ).toBeDisabled();
  await expect(sample).toContainText("Sample audio isn’t available yet");
  await page
    .getByRole("button", { name: "Play recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause playback", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
