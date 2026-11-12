import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import provider from "./e2e-ai.config";

const server = Array.isArray(provider.webServer)
  ? provider.webServer[0]
  : provider.webServer!;
// Force hosted-style admission on real SQLite/Express with an offline transport.
// This gate never inherits a paid provider and does not relax the production cap.
export default defineConfig({
  ...provider,
  testMatch: "daily-access.browser.ts",
  outputDir: join(tmpdir(), "mindgarden-daily-access-browser-results"),
  webServer: {
    ...server,
    env: { ...server.env, E2E_ENFORCE_USAGE_LIMITS: "1" },
  },
});
