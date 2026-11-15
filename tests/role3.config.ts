import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const base = "http://127.0.0.1:3023";
process.env.E2E_WEB_URL = base;
process.env.E2E_API_URL = base;
export default defineConfig({
  testDir: ".", testMatch: "role3.spec.ts", workers: 1, reporter: "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure", launchOptions: { ...(process.env.AVATAR_BROWSER_PATH ? { executablePath: process.env.AVATAR_BROWSER_PATH } : {}), args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } },
  webServer: {
    command: "node tests/e2e-server.mjs", cwd: resolve(__dirname, ".."), url: `${base}/api/health`, timeout: 60_000, reuseExistingServer: false,
    env: { EXPO_NO_DOTENV: "1", PORT: "3023", NODE_ENV: "test", OPENAI_API_KEY: "", EXPO_PUBLIC_API_URL: "", DATABASE_PATH: "./data/role3-e2e.sqlite", AUDIO_DIR: "./data/role3-e2e-audio", ALLOWED_ORIGINS: base },
  },
});
