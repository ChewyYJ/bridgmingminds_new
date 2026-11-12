// Request profiles checked against official OpenAI documentation on 2026-10-30.
// No network activity occurs when reading or checking configuration.
export const DEFAULT_TEXT_MODEL = "gpt-6-luna";
export const DEFAULT_TRANSCRIPTION_MODEL = "gpt-transcribe";
const textModels = new Set([
  "gpt-6-luna",
  "gpt-6-sol",
  "gpt-4.1-mini",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4.1",
  "gpt-4.1-2025-04-14",
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",
]);
const transcriptionModels = new Set([
  "gpt-transcribe",
  "gpt-4o-mini-transcribe",
  "gpt-4o-mini-transcribe-2025-12-15",
  "gpt-4o-transcribe",
  "whisper-1",
]);

export function readProviderConfig(options = {}, env = process.env) {
  const rawKey = options.apiKey ?? env.OPENAI_API_KEY ?? "";
  const apiKey = typeof rawKey === "string" ? rawKey.trim() : "";
  const textModel =
    options.model ?? env.OPENAI_MODEL?.trim() ?? DEFAULT_TEXT_MODEL;
  const transcriptionModel =
    options.transcriptionModel ??
    env.OPENAI_TRANSCRIPTION_MODEL?.trim() ??
    DEFAULT_TRANSCRIPTION_MODEL;
  const config = {
    apiKey,
    textModel: textModel || DEFAULT_TEXT_MODEL,
    transcriptionModel: transcriptionModel || DEFAULT_TRANSCRIPTION_MODEL,
    issues: [],
    warnings: [],
  };
  if (
    typeof rawKey !== "string" ||
    (apiKey &&
      (/\s/.test(apiKey) ||
        /^(your[-_ ]?(api[-_ ]?)?key|replace[-_]?me|changeme|<.*>)$/i.test(
          apiKey,
        )))
  )
    config.issues.push(
      "OPENAI_API_KEY is a placeholder or has invalid whitespace. Set a server-side API key, or leave it empty for local coaching.",
    );
  if (!textModels.has(config.textModel))
    config.issues.push(
      "OPENAI_MODEL has no supported request profile. Use gpt-6-luna, gpt-6-sol or a documented legacy override in docs/ai-setup.md.",
    );
  if (!transcriptionModels.has(config.transcriptionModel))
    config.issues.push(
      "OPENAI_TRANSCRIPTION_MODEL is unsupported by this integration. Use gpt-transcribe or a documented legacy override in docs/ai-setup.md.",
    );
  if (
    typeof env.EXPO_PUBLIC_OPENAI_API_KEY === "string" &&
    env.EXPO_PUBLIC_OPENAI_API_KEY.trim()
  )
    config.issues.push(
      "Remove EXPO_PUBLIC_OPENAI_API_KEY from the client environment; put the key only in OPENAI_API_KEY. Rotate any key included in a client bundle.",
    );
  if (textModels.has(config.textModel) && config.textModel.startsWith("gpt-4"))
    config.warnings.push(
      "The configured legacy text model is scheduled to shut down on 2027-01-14. Prefer gpt-6-luna after checking account access.",
    );
  if (
    transcriptionModels.has(config.transcriptionModel) &&
    config.transcriptionModel !== DEFAULT_TRANSCRIPTION_MODEL
  )
    config.warnings.push(
      "The configured legacy transcription model is scheduled to shut down on 2027-02-26. Prefer gpt-transcribe after checking account access.",
    );
  return config;
}

export function providerStatus(config) {
  return {
    mode: config.issues.length
      ? "configuration_error"
      : config.apiKey
        ? "openai"
        : "local",
    configured: Boolean(config.apiKey),
    configValid: config.issues.length === 0,
    liveVerified: false,
    models: {
      text: textModels.has(config.textModel) ? config.textModel : null,
      transcription: transcriptionModels.has(config.transcriptionModel)
        ? config.transcriptionModel
        : null,
    },
    issues: [...config.issues],
    warnings: [...config.warnings],
  };
}

export function requireProviderConfig(config) {
  if (config.issues.length)
    throw Object.assign(
      new Error(`${config.issues[0]} Your saved work is safe.`),
      { status: 503, code: "provider_configuration" },
    );
}

export function chatParameters(config, maxTokens, temperature) {
  return {
    model: config.textModel,
    max_completion_tokens: maxTokens,
    temperature,
    ...(config.textModel.startsWith("gpt-6-")
      ? { reasoning_effort: "none" }
      : {}),
  };
}

function providerError(code, detail, status = 502) {
  return Object.assign(
    new Error(
      `${detail} Your saved work is safe; retry after resolving the issue.`,
    ),
    { status, code },
  );
}

// Never expose provider bodies, raw transport messages or authorization headers.
// No automatic retries: a timeout may already have incurred provider charges.
export async function providerJson(path, request, config, timeoutMs = 35000) {
  requireProviderConfig(config);
  if (!config.apiKey)
    throw providerError(
      "provider_unconfigured",
      "Automatic AI processing requires a server-side key.",
      503,
    );
  if (!["chat/completions", "audio/transcriptions"].includes(path))
    throw providerError(
      "provider_configuration",
      "The provider endpoint is unsupported.",
      503,
    );
  let response;
  try {
    response = await fetch(`https://api.openai.com/v1/${path}`, {
      ...request,
      method: "POST",
      headers: { ...request.headers, Authorization: `Bearer ${config.apiKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (["TimeoutError", "AbortError"].includes(error?.name))
      throw providerError(
        "provider_timeout",
        "The AI provider took too long to respond.",
        504,
      );
    throw providerError(
      "provider_connection",
      "The AI provider could not be reached. Check the server's internet connection.",
    );
  }
  if (!response.ok) {
    const status = response.status;
    let code;
    try {
      code = (await response.json())?.error?.code;
    } catch {
      /* Bodies are never displayed. */
    }
    if (status === 401)
      throw providerError(
        "provider_authentication",
        "OpenAI rejected the server key (401). Check the key and project access in .env.local, then restart the API.",
      );
    if (status === 403)
      throw providerError(
        "provider_access",
        "OpenAI denied access (403). Check the project's permissions, network restrictions and regional availability.",
      );
    if (
      [
        "insufficient_quota",
        "credit_balance_exhausted",
        "billing_hard_limit_reached",
      ].includes(code)
    )
      throw providerError(
        "provider_quota",
        "OpenAI credits or spending limits prevent this request. Check the API project's billing and limits.",
      );
    if (status === 429)
      throw providerError(
        "provider_rate_limit",
        "OpenAI is rate limiting requests (429). Wait before retrying; check API project limits if it continues.",
      );
    if (status === 404 || code === "model_not_found")
      throw providerError(
        "provider_model_access",
        "The configured model is unavailable to this API project. Check model access or set a supported OPENAI_MODEL / OPENAI_TRANSCRIPTION_MODEL override and restart the API.",
      );
    if (status === 400)
      throw providerError(
        "provider_request",
        "OpenAI rejected the request (400). Check the configured model and recording format; see docs/ai-setup.md.",
      );
    throw providerError(
      "provider_unavailable",
      `The AI provider is unavailable (${status}).`,
    );
  }
  try {
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Invalid envelope");
    return data;
  } catch {
    throw providerError(
      "provider_invalid_response",
      "The AI provider returned an unreadable response.",
    );
  }
}
