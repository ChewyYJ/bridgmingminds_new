import { createApp } from "../server/app.mjs";

// Begin database/storage I/O during an invocation, not module prewarming, when
// the platform may suspend unfinished connections. Share one pool per instance.
let initialization;
function initialize() {
  if (!initialization) {
    const service = createApp({ disableWorker: true });
    initialization = service.ready.then(() => service).catch(async (error) => {
      await service.close().catch(() => {});
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

export default async function handler(req, res) {
  if (/^\/health\/?(?:\?|$)/.test(req.url || "")) {
    req.url = req.url.replace(/^\/health\/?/, "/api/health");
  }
  try {
    const service = await initialize();
    return service.app(req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({error: "The garden is starting up. Please try again in a moment."}));
  }
}
