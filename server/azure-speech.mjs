import { createRequire } from "node:module";
import {
  normalizeSpeechResult,
  speechCapabilities,
} from "./speech-assessment.mjs";
import { validatePcm } from "./speech-audio.mjs";

const require = createRequire(import.meta.url);
const failure = (code, message, status = 503) =>
  Object.assign(new Error(message), { code, status });

export function createAzureSpeech({
  key = process.env.AZURE_SPEECH_KEY || "",
  region = process.env.AZURE_SPEECH_REGION || "",
  loadSdk = async () => require("microsoft-cognitiveservices-speech-sdk"),
  sdkVersion = require("microsoft-cognitiveservices-speech-sdk/package.json")
    .version,
  timeoutMs = 90000,
} = {}) {
  const configured = Boolean(key && /^[a-z][a-z0-9-]{1,40}$/.test(region));
  const capabilities = (locale) =>
    speechCapabilities({ configured, locale, continuous: true });
  async function assess({
    pcm,
    referenceText,
    locale,
    prosody = false,
    signal,
  }) {
    const supported = capabilities(locale);
    if (supported.status !== "available")
      throw failure(
        "speech_configuration",
        "Speech assessment is unavailable for this practice target. Self-review is still available.",
      );
    if (prosody && !supported.prosody)
      throw failure(
        "speech_locale",
        "Prosody assessment is unavailable for this practice target.",
        422,
      );
    if (
      typeof referenceText !== "string" ||
      !referenceText.trim() ||
      referenceText.length > 10000
    )
      throw failure(
        "invalid_speech_reference",
        "The reading reference is invalid.",
        422,
      );
    const { durationMs } = validatePcm(pcm);
    if (signal?.aborted)
      throw failure(
        "speech_cancelled",
        "Speech processing was cancelled.",
        409,
      );
    const sdk = await loadSdk();
    if (signal?.aborted)
      throw failure(
        "speech_cancelled",
        "Speech processing was cancelled.",
        409,
      );
    return new Promise((resolve, reject) => {
      let recognizer,
        audio,
        stream,
        config,
        timer,
        settled = false;
      const segments = [];
      let resultBytes = 0;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        // close() disposes the active connection even when start failed or an
        // SDK callback never arrives. No user audio is written to disk here.
        for (const resource of [recognizer, audio, stream, config]) {
          try {
            resource?.close();
          } catch {
            /* best effort after terminal result */
          }
        }
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) return reject(error);
        try {
          resolve(
            normalizeSpeechResult({
              segments,
              referenceText,
              locale,
              sdkVersion,
              audioDurationMs: durationMs,
              continuous: true,
              prosodyRequested: prosody,
            }),
          );
        } catch (error) {
          reject(error);
        }
      };
      const abort = () =>
        finish(
          failure("speech_cancelled", "Speech processing was cancelled.", 409),
        );
      timer = setTimeout(
        () =>
          finish(
            failure(
              "speech_timeout",
              "Speech assessment took too long. Your recording is saved; please retry.",
              504,
            ),
          ),
        timeoutMs,
      );
      signal?.addEventListener("abort", abort, { once: true });
      try {
        config = sdk.SpeechConfig.fromSubscription(key, region);
        config.speechRecognitionLanguage = locale;
        config.outputFormat = sdk.OutputFormat.Detailed;
        stream = sdk.AudioInputStream.createPushStream(
          sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1),
        );
        audio = sdk.AudioConfig.fromStreamInput(stream);
        recognizer = new sdk.SpeechRecognizer(config, audio);
        const assessment = new sdk.PronunciationAssessmentConfig(
          referenceText,
          sdk.PronunciationAssessmentGradingSystem.HundredMark,
          sdk.PronunciationAssessmentGranularity.Word,
          false,
        );
        if (prosody) assessment.enableProsodyAssessment = true;
        assessment.applyTo(recognizer);
        recognizer.recognized = (_sender, event) => {
          if (settled) return;
          try {
            if (event.result.reason === sdk.ResultReason.NoMatch) return;
            if (event.result.reason !== sdk.ResultReason.RecognizedSpeech)
              throw new Error();
            const json = event.result.properties.getProperty(
              sdk.PropertyId.SpeechServiceResponse_JsonResult,
            );
            if (typeof json === "string") resultBytes += Buffer.byteLength(json);
            if (
              typeof json !== "string" ||
              json.length > 1000000 ||
              resultBytes > 2000000 ||
              segments.length >= 300
            )
              throw new Error();
            segments.push(JSON.parse(json));
          } catch {
            finish(
              failure(
                "invalid_speech_result",
                "The speech result could not be validated. Please retry.",
                502,
              ),
            );
          }
        };
        recognizer.canceled = (_sender, event) => {
          if (event.reason === sdk.CancellationReason.EndOfStream) finish();
          else
            finish(
              failure(
                "speech_provider",
                "Speech assessment could not finish. Your recording is saved; please retry.",
                502,
              ),
            );
        };
        recognizer.sessionStopped = () => finish();
        recognizer.startContinuousRecognitionAsync(
          () => {
            if (settled) return;
            try {
              // ArrayBuffer must exclude unrelated Buffer slab bytes.
              stream.write(
                pcm.buffer.slice(
                  pcm.byteOffset,
                  pcm.byteOffset + pcm.byteLength,
                ),
              );
              stream.close();
            } catch {
              finish(
                failure(
                  "speech_provider",
                  "Speech assessment could not start. Please retry.",
                  502,
                ),
              );
            }
          },
          () =>
            finish(
              failure(
                "speech_provider",
                "Speech assessment could not start. Please retry.",
                502,
              ),
            ),
        );
      } catch {
        finish(
          failure(
            "speech_configuration",
            "Speech assessment is unavailable. Self-review is still available.",
          ),
        );
      }
    });
  }
  return { capabilities, assess };
}
