import { resolve } from "node:path";
import { createApp } from "../server/app.mjs";
import { serveWeb } from "../server/static.mjs";

if (process.env.NODE_ENV !== "test")
  throw new Error("The browser-test server requires NODE_ENV=test.");

// All synthetic browser users share loopback. Keep their aggregate allowance
// separate from production without changing any authentication or user limit.
const service = createApp({
  requestLimitPerMinute: 3000,
  // Many independent test learners share loopback. Test guest-abuse limits
  // separately instead of letting one browser story exhaust another's budget.
  guestLimitPerHour: 3000,
  apiKey: "",
  dbPath: process.env.DATABASE_PATH || resolve("data/e2e.sqlite"),
  storageDir: process.env.AUDIO_DIR || resolve("data/e2e-audio"),
});
const webReady = serveWeb(service.app);
const port = Number(process.env.PORT || 3002);
if (!webReady)
  console.log(
    "No exported web bundle yet. Run npm run build:web before browser tests.",
  );
const server = service.app.listen(port, "127.0.0.1", () =>
  console.log(
    `MindGarden browser-test server is ready at http://localhost:${port} (local practice coach)`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      service.close();
      process.exit(0);
    }),
  );
