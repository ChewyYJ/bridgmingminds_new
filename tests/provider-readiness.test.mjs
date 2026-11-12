import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readProviderConfig,
  providerStatus,
  chatParameters,
  providerJson,
} from "../server/provider.mjs";
import { checkReadiness } from "../scripts/ai-check.mjs";

const fakeKey = "fixture-credential-never-display";
const config = (env = {}) =>
  readProviderConfig({}, { OPENAI_API_KEY: fakeKey, ...env });

test("one server key selects current compatible request profiles; empty values retain local coaching", () => {
  const local = checkReadiness({
    OPENAI_API_KEY: "  ",
    OPENAI_MODEL: "",
    OPENAI_TRANSCRIPTION_MODEL: "",
  });
  assert.equal(local.ok, true);
  assert.equal(local.ai.mode, "local");
  assert.equal(local.ai.configured, false);
  assert.equal(local.networkRequests, 0);
  const configured = checkReadiness({ OPENAI_API_KEY: fakeKey });
  assert.equal(configured.ok, true);
  assert.equal(configured.ai.mode, "openai");
  assert.equal(configured.ai.liveVerified, false);
  assert.deepEqual(configured.ai.models, {
    text: "gpt-6-luna",
    transcription: "gpt-transcribe",
  });
  assert.equal(JSON.stringify(configured).includes(fakeKey), false);
  assert.deepEqual(chatParameters(config(), 3200, 0), {
    model: "gpt-6-luna",
    reasoning_effort: "none",
    temperature: 0,
    max_completion_tokens: 3200,
  });
  assert.equal(checkReadiness({}, "22.13.0").ok, false);
});

test("legacy profiles keep compatible parameters and disclose shutdown dates", () => {
  const legacy = config({
    OPENAI_MODEL: "gpt-4.1-mini",
    OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-mini-transcribe",
  });
  assert.equal(providerStatus(legacy).configValid, true);
  assert.deepEqual(chatParameters(legacy, 450, 0.5), {
    model: "gpt-4.1-mini",
    max_completion_tokens: 450,
    temperature: 0.5,
  });
  assert.match(legacy.warnings.join(" "), /2027-01-14/);
  assert.match(legacy.warnings.join(" "), /2027-02-26/);
});

test("invalid model, leaked public-key setting and placeholder diagnostics never echo values", () => {
  for (const env of [
    { OPENAI_API_KEY: "your-key" },
    { OPENAI_API_KEY: "secret invalid whitespace" },
    { OPENAI_MODEL: fakeKey },
    { OPENAI_MODEL: "gpt-6-astra" }, // Different reasoning/temperature profile; do not silently guess.
    { OPENAI_TRANSCRIPTION_MODEL: "gpt-6-luna" },
    { EXPO_PUBLIC_OPENAI_API_KEY: fakeKey },
  ]) {
    const result = checkReadiness({ OPENAI_API_KEY: fakeKey, ...env });
    assert.equal(result.ok, false);
    assert.equal(result.ai.mode, "configuration_error");
    assert.equal(result.ai.issues.length > 0, true);
    assert.equal(JSON.stringify(result).includes(fakeKey), false);
    assert.equal(
      JSON.stringify(result).includes("secret invalid whitespace"),
      false,
    );
  }
});

test("invalid configuration blocks the request before transport and never retries", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw new Error("must not fetch");
  });
  await assert.rejects(
    providerJson(
      "chat/completions",
      {},
      config({ OPENAI_MODEL: "unsupported" }),
    ),
    { code: "provider_configuration", status: 503 },
  );
  await assert.rejects(
    providerJson("chat/completions", {}, readProviderConfig({}, {})),
    { code: "provider_unconfigured" },
  );
  assert.equal(requests, 0);
});

test("provider errors have actionable categories without leaking transport or provider payloads", async (t) => {
  const cases = [
    [401, "invalid_api_key", "provider_authentication", /key/i],
    [403, "forbidden", "provider_access", /permissions/],
    [404, "model_not_found", "provider_model_access", /model access/],
    [400, "model_not_found", "provider_model_access", /model access/],
    [429, "rate_limit_exceeded", "provider_rate_limit", /Wait/],
    [429, "insufficient_quota", "provider_quota", /billing/],
    [429, "credit_balance_exhausted", "provider_quota", /billing/],
    [400, "invalid_request", "provider_request", /recording format/],
    [503, "unavailable", "provider_unavailable", /503/],
  ];
  let current;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, request) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal(request.redirect, "error");
    assert.equal(request.headers.Authorization, `Bearer ${fakeKey}`);
    return Response.json(
      { error: { code: current[1], message: fakeKey } },
      { status: current[0] },
    );
  });
  for (current of cases) {
    await assert.rejects(
      providerJson("chat/completions", { body: "{}" }, config()),
      (error) => {
        assert.equal(error.code, current[2]);
        assert.equal(error.status, 502);
        assert.match(error.message, current[3]);
        assert.match(error.message, /saved/);
        assert.equal(error.message.includes(fakeKey), false);
        return true;
      },
    );
  }
  assert.equal(calls, cases.length);
});

test("timeouts, connection failures and unreadable JSON preserve safe retry messages", async (t) => {
  let kind = "timeout";
  t.mock.method(globalThis, "fetch", async () => {
    if (kind === "timeout") throw new DOMException(fakeKey, "TimeoutError");
    if (kind === "connection") throw new TypeError(fakeKey);
    return kind === "null"
      ? Response.json(null)
      : new Response(fakeKey, { status: 200 });
  });
  for (const [value, code, status] of [
    ["timeout", "provider_timeout", 504],
    ["connection", "provider_connection", 502],
    ["json", "provider_invalid_response", 502],
    ["null", "provider_invalid_response", 502],
  ]) {
    kind = value;
    await assert.rejects(
      providerJson("audio/transcriptions", {}, config()),
      (error) => {
        assert.equal(error.code, code);
        assert.equal(error.status, status);
        assert.equal(error.message.includes(fakeKey), false);
        return true;
      },
    );
  }
});

test("offline readiness CLI prints only safe status and refuses any live flag", () => {
  const script = fileURLToPath(
    new URL("../scripts/ai-check.mjs", import.meta.url),
  );
  const env = { OPENAI_API_KEY: fakeKey };
  const result = spawnSync(process.execPath, [script], {
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes(fakeKey), false);
  assert.equal(JSON.parse(result.stdout).networkRequests, 0);
  const invalid = spawnSync(process.execPath, [script], {
    env: { ...env, OPENAI_MODEL: fakeKey },
    encoding: "utf8",
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout.includes(fakeKey), false);
  for (const file of ["ai-check.mjs", "ai-smoke.mjs"]) {
    const flag = spawnSync(
      process.execPath,
      [fileURLToPath(new URL(`../scripts/${file}`, import.meta.url)), "--live"],
      { env, encoding: "utf8" },
    );
    assert.equal(flag.status, 1);
    assert.match(flag.stderr, /no live or paid-request mode/);
    assert.equal(flag.stdout.includes(fakeKey), false);
  }
});
