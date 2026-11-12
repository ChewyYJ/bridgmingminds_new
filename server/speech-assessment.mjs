// Azure result boundary, independent of transport. Never derives acoustic scores
// from a transcript or averages utterance scores into an invented overall score.
export const SPEECH_RESULT_VERSION = "azure-reading-v1";
const invalid = () =>
  Object.assign(
    new Error(
      "The speech result could not be validated. Your recording is unchanged.",
    ),
    { code: "invalid_speech_result", status: 502 },
  );
const score = (value) => {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  )
    throw invalid();
  return value;
};
const ticks = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) throw invalid();
  return value / 10000;
};
const text = (value, max = 10000) => {
  if (typeof value !== "string" || value.length > max) throw invalid();
  return value;
};
const key = (value) =>
  value.normalize("NFKC").toLocaleLowerCase("en").replace(/[’']/gu, "'");
const tokens = (value) =>
  [...value.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));

export function speechCapabilities({
  configured = false,
  locale = "en-US",
  continuous = true,
} = {}) {
  // Explicit initial allowlist, not an assumption that STT locales all support PA.
  const supported = ["en-US", "en-GB"].includes(locale);
  return {
    version: SPEECH_RESULT_VERSION,
    provider: "azure",
    locale,
    status: configured && supported ? "available" : "unavailable",
    reason: !configured
      ? "not_configured"
      : !supported
        ? "unsupported_locale"
        : null,
    mode: continuous ? "continuous" : "single_utterance",
    maximumSeconds: continuous ? 180 : 30,
    accuracy: supported,
    fluency: supported,
    prosody: supported && locale === "en-US",
    // Continuous SDK results do not support EnableMiscue; do not fabricate it.
    providerMiscues: supported && !continuous,
    intelligibility: false,
  };
}

export function normalizeSpeechResult({
  segments,
  referenceText,
  locale,
  sdkVersion,
  audioDurationMs,
  continuous = true,
  prosodyRequested = false,
}) {
  const capabilities = speechCapabilities({
    configured: true,
    locale,
    continuous,
  });
  if (
    capabilities.status !== "available" ||
    (prosodyRequested && !capabilities.prosody)
  )
    throw invalid();
  text(referenceText);
  if (
    !referenceText.trim() ||
    !Number.isFinite(audioDurationMs) ||
    audioDurationMs <= 0 ||
    audioDurationMs > capabilities.maximumSeconds * 1000
  )
    throw invalid();
  text(sdkVersion, 100);
  if (!sdkVersion.trim() || !Array.isArray(segments) || segments.length > 300)
    throw invalid();
  const reference = tokens(referenceText);
  let cursor = 0,
    lastOffset = -1,
    lastWordEnd = -1;
  const utterances = [],
    words = [];
  for (const raw of segments) {
    if (!raw || typeof raw !== "object") throw invalid();
    // NoMatch is an explicit no-speech result; cancellation/errors belong to the
    // transport failure path and must not be silently treated as successful.
    if (
      raw.RecognitionStatus === "NoMatch" ||
      raw.RecognitionStatus === "InitialSilenceTimeout" ||
      raw.RecognitionStatus === "BabbleTimeout"
    )
      continue;
    if (raw.RecognitionStatus !== "Success" && raw.RecognitionStatus !== 0)
      throw invalid();
    const startMs = ticks(raw.Offset),
      durationMs = ticks(raw.Duration);
    if (
      startMs < lastOffset ||
      durationMs <= 0 ||
      startMs + durationMs > audioDurationMs + 250
    )
      throw invalid();
    lastOffset = startMs;
    const best = raw.NBest?.[0];
    if (!best || !Array.isArray(best.Words) || best.Words.length > 1000)
      throw invalid();
    const confidence = best.Confidence;
    if (
      confidence !== undefined &&
      (typeof confidence !== "number" ||
        !Number.isFinite(confidence) ||
        confidence < 0 ||
        confidence > 1)
    )
      throw invalid();
    const assessment = best.PronunciationAssessment || {};
    const metrics = {
      accuracy: score(assessment.AccuracyScore),
      fluency: score(assessment.FluencyScore),
      completeness: continuous ? null : score(assessment.CompletenessScore),
      pronunciation: score(assessment.PronScore),
      prosody:
        prosodyRequested && capabilities.prosody
          ? score(assessment.ProsodyScore)
          : null,
      intelligibility: null,
    };
    utterances.push({
      startMs,
      durationMs,
      transcript: text(best.Display ?? best.Lexical ?? ""),
      recognitionConfidence: confidence ?? null,
      metrics,
    });
    for (const item of best.Words) {
      const word = text(item.Word, 200),
        at = ticks(item.Offset),
        length = ticks(item.Duration);
      if (
        !word.trim() ||
        at < startMs ||
        at < lastWordEnd ||
        at + length > startMs + durationMs + 250 ||
        at + length > audioDurationMs + 250
      )
        throw invalid();
      lastWordEnd = at + length;
      const detail = item.PronunciationAssessment || {};
      const errorType = detail.ErrorType ?? "not_reported";
      if (
        ![
          "None",
          "Mispronunciation",
          "Omission",
          "Insertion",
          "not_reported",
        ].includes(errorType)
      )
        throw invalid();
      if (continuous && ["Omission", "Insertion"].includes(errorType))
        throw invalid();
      // Anchor only an ordered exact token match. An unmatched or inserted word
      // remains visible with no reference highlight; never invent offsets.
      const matchIndex =
        errorType === "Insertion"
          ? -1
          : reference.findIndex(
              (candidate, index) =>
                index >= cursor && key(candidate.text) === key(word),
            );
      const sourceSpan = matchIndex < 0 ? null : { ...reference[matchIndex] };
      if (sourceSpan) cursor = matchIndex + 1;
      words.push({
        word,
        startMs: at,
        durationMs: length,
        sourceSpan,
        accuracy: score(detail.AccuracyScore),
        providerErrorType: errorType,
        certainty: "provider_observation",
        recognitionConfidence: confidence ?? null,
      });
      if (words.length > 3000) throw invalid();
    }
  }
  const hasScores = utterances.some((item) =>
    Object.values(item.metrics).some((value) => value !== null),
  );
  return {
    version: SPEECH_RESULT_VERSION,
    provider: "azure",
    sdkVersion,
    locale,
    mode: capabilities.mode,
    validationStatus: "unvalidated",
    audioDurationMs,
    status: !words.length ? "no_speech" : hasScores ? "assessed" : "partial",
    // Metrics remain attached to their provider utterance; no synthetic total.
    metrics: null,
    utterances,
    words,
    limitations: [
      "Provider scores are provisional, not objective ability or accent judgments.",
      "Recognition confidence is not pronunciation confidence.",
      ...(continuous
        ? [
            "Completeness and omission/insertion are not assessed in continuous mode.",
          ]
        : []),
      ...(!prosodyRequested
        ? ["Prosody was not requested and is not assessed."]
        : []),
    ],
  };
}
