import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readProviderConfig, providerStatus } from "../server/provider.mjs";

export function checkReadiness(
  env = process.env,
  nodeVersion = process.versions.node,
) {
  const ai = providerStatus(readProviderConfig({}, env));
  const runtimeReady = Number(nodeVersion.split(".")[0]) >= 24;
  return {
    ok: runtimeReady && ai.configValid,
    runtime: { node24OrLater: runtimeReady },
    ai,
    checks: "offline_configuration_only",
    networkRequests: 0,
    note: "No credentials are printed and no provider calls are made. Model access, billing, network availability and feedback quality remain unverified. Run npm run ai:smoke for isolated offline contract tests.",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length > 2) {
    console.error(
      "Usage: npm run ai:check. This command has no live or paid-request mode.",
    );
    process.exitCode = 1;
  } else {
    const result = checkReadiness();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  }
}
