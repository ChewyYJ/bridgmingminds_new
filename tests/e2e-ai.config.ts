import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Build separately so this suite uses the same reviewed bundle as local-mode
// tests. It verifies an offline transport contract, never a paid live provider.
export default defineConfig({
  testDir: ".",
  testMatch: "provider-flow.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: join(tmpdir(), "mindgarden-provider-browser-results"),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  metadata: { providerFixture: true },
  use: {
    baseURL: "http://localhost:3003",
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    command: "node tests/e2e-ai-server.mjs",
    cwd: resolve(__dirname, ".."),
    url: "http://localhost:3003/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    env: {
      PORT: "3003",
      NODE_ENV: "test",
      OPENAI_API_KEY: "",
      EXPO_PUBLIC_OPENAI_API_KEY: "",
      EXPO_PUBLIC_API_URL: "",
      ALLOWED_ORIGINS: "http://localhost:3003",
    },
  },
});
