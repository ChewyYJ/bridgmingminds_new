import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const base = "http://127.0.0.1:3031";
process.env.E2E_WEB_URL = base;
process.env.E2E_API_URL = base;
export default defineConfig({
  testDir: ".", testMatch: "debate-preparation.spec.ts", workers: 1, reporter: "list",
  outputDir: "../artifacts/debate-preparation/test-results",
  use: {
    trace: "retain-on-failure", screenshot: "only-on-failure",
    launchOptions: process.env.AVATAR_BROWSER_PATH ? { executablePath: process.env.AVATAR_BROWSER_PATH } : {},
  },
  webServer: {
    command: `"${process.execPath}" tests/e2e-server.mjs`, cwd: resolve(__dirname, ".."),
    url: `${base}/api/health`, timeout: 60_000, reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    env: { EXPO_NO_DOTENV: "1", PORT: "3031", NODE_ENV: "test", OPENAI_API_KEY: "", EXPO_PUBLIC_API_URL: "",
      DATABASE_PATH: "./data/debate-preparation-e2e.sqlite", AUDIO_DIR: "./data/debate-preparation-e2e-audio", ALLOWED_ORIGINS: base },
  },
});
