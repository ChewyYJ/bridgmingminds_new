import { defineConfig } from "@playwright/test";

// Browser checks run against the optimized export and a separate local test database.
const external = Boolean(process.env.E2E_WEB_URL);
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/provider-flow.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: external
    ? undefined
    : {
        command: "npm run build:web && node tests/e2e-server.mjs",
        url: "http://localhost:3002/api/health",
        timeout: 180_000,
        reuseExistingServer: false,
        env: {
          PORT: "3002",
          NODE_ENV: "test",
          OPENAI_API_KEY: "",
          EXPO_PUBLIC_API_URL: "",
          DATABASE_PATH: "./data/e2e.sqlite",
          AUDIO_DIR: "./data/e2e-audio",
          ALLOWED_ORIGINS: "http://localhost:3002",
        },
      },
});
