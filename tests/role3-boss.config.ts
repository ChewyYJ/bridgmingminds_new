import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const baseURL = "http://127.0.0.1:3026";
export default defineConfig({
  testDir: ".",
  testMatch: "role3-boss.spec.ts",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: "../artifacts/role3/boss-test-results",
  use: {
    baseURL,
    viewport: { width: 390, height: 1000 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.AVATAR_BROWSER_PATH ? { executablePath: process.env.AVATAR_BROWSER_PATH } : {},
  },
  webServer: {
    command: `"${process.execPath}" tests/role3-boss-server.mjs`,
    cwd: resolve(__dirname, ".."),
    url: `${baseURL}/api/health`,
    timeout: 60_000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    env: {
      NODE_ENV: "test", PORT: "3026", EXPO_NO_DOTENV: "1",
      OPENAI_API_KEY: "", EXPO_PUBLIC_OPENAI_API_KEY: "", EXPO_PUBLIC_API_URL: "",
      ALLOWED_ORIGINS: baseURL,
    },
  },
});

