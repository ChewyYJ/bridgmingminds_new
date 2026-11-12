import { createApp } from "./app.mjs";
import { serveWeb } from "./static.mjs";
const service = createApp();
await service.ready;
const webReady = serveWeb(service.app);
const port = Number(process.env.PORT || 3001);
if (!webReady)
  console.log(
    "No exported web bundle yet. Use npm run dev, or npm run build:web before npm start.",
  );
const server = service.app.listen(port, "0.0.0.0", () =>
  console.log(
    `MindGarden API is ready at http://localhost:${port} (${service.providerStatus.mode === "openai" ? "AI configured; live access not checked" : service.providerStatus.mode === "local" ? "local practice coach" : "AI configuration needs attention; run npm run ai:check"})`,
  ),
);
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close(async (error) => {
      try {
        await service.close();
        process.exitCode = error ? 1 : 0;
      } catch (closeError) {
        console.error("[garden-shutdown]", closeError.code || closeError.name);
        process.exitCode = 1;
      }
    });
  });
