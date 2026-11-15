import { expect, test } from "@playwright/test";

type SignalWindow = typeof window & {
  testMic: { setLevel: (level: number) => void; activeTracks: () => number };
};
const base = process.env.E2E_WEB_URL || "http://localhost:3002";
test.use({
  channel: "chrome",
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
});
for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test.describe(`live voice meter (${reducedMotion})`, () => {
    test.use({ reducedMotion });
    test("reacts to actual audio samples, rests in silence, and releases the microphone", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const sources: { gain: GainNode; stream: MediaStream }[] = [];
        let volume = 0;
        (window as SignalWindow).testMic = {
          setLevel: (level) => {
            volume = level;
            sources.forEach(({ gain }) => {
              gain.gain.value = level;
            });
          },
          activeTracks: () =>
            sources
              .flatMap(({ stream }) => stream.getTracks())
              .filter((track) => track.readyState === "live").length,
        };
        // Feed a controlled audio signal through Expo's real MediaRecorder/Analyser pipeline.
        navigator.mediaDevices.getUserMedia = async () => {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const destination = context.createMediaStreamDestination();
          oscillator.frequency.value = 440;
          gain.gain.value = volume;
          oscillator.connect(gain);
          gain.connect(destination);
          oscillator.start();
          await context.resume();
          sources.push({ gain, stream: destination.stream });
          return destination.stream;
        };
      });
      await page.goto(base);
      await page
        .getByRole("button", { name: "Try as guest", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "Your name", exact: true })
        .fill("Voice test");
      await page
        .getByRole("button", { name: "Grow my garden", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Read aloud", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Record the passage", exact: true })
        .click();
      const heights = () =>
        page
          .locator('[data-testid^="voice-bar-"]')
          .evaluateAll((bars) =>
            bars.map((bar) => bar.getBoundingClientRect().height),
          );
      await expect(page.getByTestId("live-voice-meter")).toBeVisible();
      expect((await heights()).every((height) => height === 5)).toBe(true);
      await page
        .getByRole("button", { name: "Record my response", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Pause recording", exact: true }),
      ).toBeVisible();
      await expect.poll(async () => Math.max(...(await heights()))).toBe(5);
      await page.evaluate(() =>
        (window as SignalWindow).testMic.setLevel(0.02),
      );
      await expect
        .poll(async () => (await heights()).at(-1)!)
        .toBeGreaterThan(10);
      const quiet = (await heights()).at(-1)!;
      await page.evaluate(() => (window as SignalWindow).testMic.setLevel(0.4));
      await expect
        .poll(async () => (await heights()).at(-1)!)
        .toBeGreaterThan(quiet + 10);
      await page
        .getByRole("button", { name: "Pause recording", exact: true })
        .click();
      expect((await heights()).every((height) => height === 5)).toBe(true);
      await page
        .getByRole("button", { name: "Resume recording", exact: true })
        .click();
      await expect
        .poll(async () => Math.max(...(await heights())))
        .toBeGreaterThan(30);
      await page.evaluate(() => (window as SignalWindow).testMic.setLevel(0));
      await expect.poll(async () => Math.max(...(await heights()))).toBe(5);
      await page
        .getByRole("button", { name: "Cancel recording", exact: true })
        .click();
      await expect(page.getByTestId("live-voice-meter")).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() => (window as SignalWindow).testMic.activeTracks()),
        )
        .toBe(0);
    });
  });
}
