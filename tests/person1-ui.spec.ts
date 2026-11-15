import { expect, test } from "@playwright/test";
import type { Attempt } from "../src/types";

test.use({
  channel: "chrome",
  viewport: { width: 390, height: 844 },
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
});
test.setTimeout(180000);
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
const text =
  "AI can help students learn when it offers personalised support. Teachers should check the advice, because mistakes can lead to confusion. For example, a student could ask for a hint and then explain the solution in their own words.";

test("daily reference UI: board persistence, recording, feedback tabs, optional script and rewards", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Supply browser audio samples without depending on a physical input device.
  await page.addInitScript(() => {
    // UI coverage should not wait on the host's audio-output activation. The
    // separate live-voice-meter spec verifies actual signal-level behaviour.
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () {
      void resume.call(this).catch(() => undefined);
      return Promise.resolve();
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const source = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      source.connect(destination);
      source.start();
      await context.resume();
      return destination.stream;
    };
  });
  // AI responses are deterministic fixtures; session, board and audio storage use the real local API.
  let completed: Attempt | undefined;
  await page.route("**/api/attempts/*/transcribe", async (route) => {
    await expect(page.getByTestId("daily-screen-processing")).toBeVisible();
    await page.screenshot({ path: info.outputPath("04-processing.png") });
    await route.fulfill({ json: { text } });
  });
  await page.route("**/api/attempts/*/evaluate", async (route) => {
    const id = route.request().url().split("/").at(-2)!;
    const saved = await page.request.get(
      route.request().url().replace("/evaluate", ""),
    );
    completed = {
      ...(await saved.json()),
      text,
      status: "completed",
      rewards: { xp: 15, seeds: 0, reason: "Fixture participation reward" },
      evaluation: {
        attempt_id: id,
        mode: "spin_speak",
        provider: "openai",
        rubric_version: "bridge-v1",
        model_version: "ui-fixture",
        prompt_template_version: "fixture",
        overall_score: null,
        key_takeaway: "Clear stance and a relevant example.",
        retry_prompt: "Explore a possible concern.",
        verification_flags: [],
        needs_review: false,
        dimensions: [
          {
            key: "R",
            label: "Reasoning",
            level: 3,
            confidence: "medium",
            evidence_spans: [],
            strength: "You connect your reason to your view.",
            improvement: "Explore another perspective.",
          },
        ],
        feedback: {
          strength: "Clear stance and a relevant example.",
          priority_gap: "Explain how a teacher can check the advice.",
          next_question: "What risks should schools consider?",
          evidence_spans: [],
        },
      },
    };
    await route.fulfill({
      json: { id: "fixture-job", status: "queued", attemptId: id },
    });
  });
  await page.route(/\/api\/attempts\/[^/]+$/, async (route) => {
    if (
      route.request().method() === "GET" &&
      completed?.id === route.request().url().split("/").at(-1)
    )
      await route.fulfill({ json: completed });
    else await route.continue();
  });
  await page.route("**/api/attempts/*/guided-response", async (route) => {
    const draft =
      "AI can adapt support to students. Teachers should examine the evidence before trusting its advice.";
    const quotes = ["AI can adapt support", "Teachers should examine"];
    await route.fulfill({
      json: {
        text: draft,
        provider: "openai",
        model: "ui-fixture",
        createdAt: new Date().toISOString(),
        vocabulary: ["adapt", "evidence"].map((word) => ({
          wordId: word,
          word,
          meaning:
            word === "adapt"
              ? "Change to suit different needs."
              : "Information supporting a claim.",
          spans: [
            {
              start: draft.indexOf(word),
              end: draft.indexOf(word) + word.length,
            },
          ],
        })),
        annotations: quotes.map((quote, i) => ({
          start: draft.indexOf(quote),
          end: draft.indexOf(quote) + quote.length,
          quote,
          label: i ? "Qualification" : "Reason",
          explanation: "Connects the learner’s own ideas.",
        })),
      },
    });
  });
  await page.route("**/api/attempts/*/guiding-answer", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      index: 0,
      answer: "Schools should check AI advice before students rely on it.",
    });
    await route.fulfill({
      json: {
        status: "answered",
        feedback: "You answered the question with a clear precaution.",
        next_step: "Explain how teachers could check it.",
        evidence_quote: "Schools should check AI advice",
      },
    });
  });
  let savedWords: string[] = [];
  await page.route("**/api/attempts/*/vocabulary", async (route) => {
    savedWords = route.request().postDataJSON().wordIds;
    await route.fulfill({
      json: { words: savedWords.map((wordId) => ({ wordId })) },
    });
  });
  await page.goto(base);
  await page.getByRole("button", { name: "Try as guest", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("YeeJing");
  await page
    .getByRole("button", { name: "Grow my garden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Spin and reflect", exact: true })
    .click();
  await expect(page.getByTestId("daily-screen-entry")).toBeVisible();
  await expect(page.getByText("Loading today’s question…")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("01-entry.png") });
  await page
    .getByRole("button", { name: "Start brainstorming", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Benefits note", exact: true })
    .fill("Personalised support");
  const synced = page.waitForResponse(
    (res) =>
      res.url().includes("/brainstorm") &&
      res.request().method() === "PUT" &&
      res.ok(),
  );
  await synced;
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Benefits note", exact: true }),
  ).toHaveValue("Personalised support");
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  const canvas = (await page.getByTestId("daily-board-canvas").boundingBox())!;
  const drawingSaved = page.waitForResponse(
    (res) =>
      res.url().includes("/brainstorm") &&
      res.request().postDataJSON()?.strokes?.length === 1 &&
      res.ok(),
  );
  await page.mouse.move(canvas.x + 15, canvas.y + 150);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 60, canvas.y + 180, { steps: 8 });
  await page.mouse.up();
  await drawingSaved;
  await page
    .getByRole("button", { name: "Undo board change", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Redo board change", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit notes", exact: true }).click();
  await page.screenshot({ path: info.outputPath("02-board.png") });
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Benefits note", exact: true }),
  ).toHaveValue("Personalised support");
  await page
    .getByRole("button", { name: "Done brainstorming", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Allow Private Recording", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("03-speak.png") });
  await expect(
    page.getByRole("button", { name: "Write instead", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Record my response", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  await page
    .getByRole("button", { name: "Pause recording", exact: true })
    .click();
  await expect(page.getByText("Recording paused", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use recording", exact: true })
    .click();
  await expect(page.getByTestId("daily-screen-feedback")).toBeVisible();
  await page.screenshot({ path: info.outputPath("05-feedback.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath("05-feedback-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Strengths", exact: true }).click();
  await expect(
    page.getByText("Reasoning: You connect your reason to your view."),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Areas to Improve", exact: true })
    .click();
  await expect(
    page.getByText("Reasoning: Explore another perspective."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Skip practice", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Skip and finish", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Challenge Complete!", exact: true }),
  ).toBeVisible();
  expect(savedWords).toEqual([]);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Practise guiding questions",
      exact: true,
    })
    .click();
  await page.screenshot({ path: info.outputPath("06-guide.png") });
  await page
    .getByRole("button", { name: "Practise question 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Type instead", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Answer question 1", exact: true })
    .fill("Schools should check AI advice before students rely on it.");
  await page
    .getByRole("button", { name: "Check my answer", exact: true })
    .click();
  await expect(
    page.getByText("You answered the question with a clear precaution."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "View sample script", exact: true })
    .click();
  await expect(
    page.getByText(
      "AI can adapt support to students. Teachers should examine the evidence before trusting its advice.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("07-script.png") });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: info.outputPath("07-script-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", {
      name: "Save selected words",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: "Save adapt", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Save adapt", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Save selected words", exact: true })
    .click();
  await expect.poll(() => savedWords).toEqual(["adapt"]);
  await expect(
    page.getByRole("heading", { name: "Challenge Complete!", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("08-rewards.png") });
  await expect(page.getByText("+15", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
