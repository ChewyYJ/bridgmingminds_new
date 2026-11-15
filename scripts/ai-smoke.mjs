import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.argv.length > 2) {
  console.error(
    "Usage: npm run ai:smoke. This command has no live or paid-request mode.",
  );
  process.exitCode = 1;
} else {
  console.log(
    "Offline AI smoke: temporary databases, fake credentials, mocked provider transport. No external requests or changes to your account data.",
  );
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "tests/provider-readiness.test.mjs",
      "tests/provider.test.mjs",
      "tests/assessment.test.mjs",
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      // Deliberately do not inherit credentials, NODE_OPTIONS, endpoint overrides
      // or environment-file preload hooks. Tests block unmocked provider fetches.
      env: {
        NODE_ENV: "test",
        OPENAI_API_KEY: "",
        OPENAI_MODEL: "gpt-6-luna",
        OPENAI_TRANSCRIPTION_MODEL: "gpt-transcribe",
      },
      stdio: "inherit",
    },
  );
  if (result.error)
    console.error(
      "The offline smoke process could not start. Check Node.js 24 or later is installed.",
    );
  process.exitCode = result.status ?? 1;
}
