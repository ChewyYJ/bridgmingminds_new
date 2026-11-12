import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MAX_RECORDING_BYTES } from "./audio-storage.mjs";

export const PCM_BYTES_PER_SECOND = 32000;
export const MAX_SPEECH_SECONDS = 180;
const failure = (code, message, status = 422) =>
  Object.assign(new Error(message), { code, status });
const formats = {
  "audio/webm": "matroska",
  "video/webm": "matroska",
  "audio/mp4": "mov",
  "audio/m4a": "mov",
  "audio/x-m4a": "mov",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};
const scratchRoot = () =>
  process.env.SPEECH_TMP_DIR || join(tmpdir(), "bridgingminds-speech");
async function checkScratch(root, create = false) {
  if (create) await mkdir(root, { recursive: true, mode: 0o700 });
  const entry = await lstat(root);
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    (typeof process.getuid === "function" && entry.uid !== process.getuid())
  )
    throw failure(
      "speech_scratch_unavailable",
      "Private audio conversion storage is unavailable.",
      503,
    );
  if (create) await chmod(root, 0o700);
}
export async function cleanupSpeechScratch({
  root = scratchRoot(),
  now = Date.now(),
} = {}) {
  try {
    await checkScratch(root);
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }
  let removed = 0;
  for (const name of (await readdir(root)).slice(0, 500)) {
    if (!/^decode-[A-Za-z0-9]+$/.test(name)) continue;
    const path = join(root, name);
    try {
      const entry = await lstat(path);
      // Every decoder is bounded to seconds. One hour leaves a generous margin
      // for active workers; stale crash copies are never treated as recordings.
      if (
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        entry.mtimeMs < now - 3600000
      ) {
        await rm(path, { recursive: true, force: true });
        removed++;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return removed;
}

export function validatePcm(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < PCM_BYTES_PER_SECOND / 4 ||
    bytes.length % 2 ||
    bytes.length > PCM_BYTES_PER_SECOND * MAX_SPEECH_SECONDS
  )
    throw failure(
      "invalid_speech_audio",
      "Use a recording between a quarter second and three minutes long.",
    );
  return {
    pcm: bytes,
    durationMs: (bytes.length / PCM_BYTES_PER_SECOND) * 1000,
  };
}

// Strict RIFF PCM fast path. Other WAV variants go through the same bounded
// decoder as compressed media, not a guessed sample format.
export function pcmFromWave(bytes) {
  if (
    bytes.length < 12 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  )
    return null;
  if (bytes.readUInt32LE(4) + 8 !== bytes.length)
    throw failure("invalid_speech_audio", "The WAV recording is incomplete.");
  let format, data;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const name = bytes.toString("ascii", offset, offset + 4),
      size = bytes.readUInt32LE(offset + 4),
      start = offset + 8;
    if (start + size > bytes.length)
      throw failure("invalid_speech_audio", "The WAV recording is incomplete.");
    if (name === "fmt ") {
      if (format || size < 16)
        throw failure("invalid_speech_audio", "The WAV format is invalid.");
      format = {
        codec: bytes.readUInt16LE(start),
        channels: bytes.readUInt16LE(start + 2),
        rate: bytes.readUInt32LE(start + 4),
        byteRate: bytes.readUInt32LE(start + 8),
        alignment: bytes.readUInt16LE(start + 12),
        bits: bytes.readUInt16LE(start + 14),
      };
    }
    if (name === "data") {
      if (data)
        throw failure(
          "invalid_speech_audio",
          "The WAV recording has ambiguous audio data.",
        );
      data = bytes.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!format || !data)
    throw failure(
      "invalid_speech_audio",
      "The WAV recording has no readable audio.",
    );
  if (
    format.codec !== 1 ||
    format.channels !== 1 ||
    format.rate !== 16000 ||
    format.bits !== 16
  )
    return null;
  if (format.byteRate !== PCM_BYTES_PER_SECOND || format.alignment !== 2)
    throw failure("invalid_speech_audio", "The WAV sample format is invalid.");
  return validatePcm(data);
}

export async function decodeSpeechAudio(
  bytes,
  mime,
  {
    executable = process.env.FFMPEG_PATH || "ffmpeg",
    timeoutMs = 20000,
    signal,
    temporaryRoot = scratchRoot(),
  } = {},
) {
  if (signal?.aborted)
    throw failure("speech_cancelled", "Speech processing was cancelled.", 409);
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes.length ||
    bytes.length > MAX_RECORDING_BYTES
  )
    throw failure("invalid_speech_audio", "Use a recording under 10 MB.");
  const format = formats[String(mime).split(";")[0].trim().toLowerCase()];
  if (!format)
    throw failure(
      "unsupported_speech_audio",
      "This recording format cannot be assessed.",
      415,
    );
  if (format === "wav") {
    const direct = pcmFromWave(bytes);
    if (direct) return direct;
  }
  if (signal?.aborted)
    throw failure("speech_cancelled", "Speech processing was cancelled.", 409);
  // Ordinary M4A has seek-dependent metadata. Pipes cannot decode it reliably.
  // Use a unique owner-only file only for that demuxer, and remove it in finally.
  let directory;
  let input = "pipe:0";
  try {
    if (format === "mov") {
      await checkScratch(temporaryRoot, true);
      await cleanupSpeechScratch({ root: temporaryRoot });
      directory = await mkdtemp(join(temporaryRoot, "decode-"));
      await chmod(directory, 0o700);
      input = join(directory, "input.m4a");
      await writeFile(input, bytes, { mode: 0o600, flag: "wx" });
    }
    if (signal?.aborted)
      throw failure(
        "speech_cancelled",
        "Speech processing was cancelled.",
        409,
      );
    // No shell or remote protocols. Decode one extra second so overlong media
    // is rejected rather than silently truncated. Disable MOV external refs.
    return await new Promise((resolve, reject) => {
      const child = spawn(
        executable,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-protocol_whitelist",
          format === "mov" ? "file,pipe" : "pipe",
          ...(format === "mov"
            ? ["-enable_drefs", "0", "-use_absolute_path", "0"]
            : []),
          "-f",
          format,
          "-i",
          input,
          "-map",
          "0:a:0",
          "-vn",
          "-ac",
          "1",
          "-ar",
          "16000",
          "-t",
          "181",
          "-f",
          "s16le",
          "pipe:1",
        ],
        { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
      );
      const chunks = [];
      let size = 0,
        settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (error) {
          child.kill("SIGKILL");
          reject(error);
        } else resolve(value);
      };
      const abort = () =>
        finish(
          failure("speech_cancelled", "Speech processing was cancelled.", 409),
        );
      const timer = setTimeout(
        () =>
          finish(
            failure(
              "speech_decode_timeout",
              "The recording took too long to decode. Please try a shorter take.",
              504,
            ),
          ),
        timeoutMs,
      );
      signal?.addEventListener("abort", abort, { once: true });
      child.on("error", () =>
        finish(
          failure(
            "speech_decoder_unavailable",
            "The audio decoder is unavailable. Self-review is still available.",
            503,
          ),
        ),
      );
      child.stdin.on("error", () => {});
      child.stderr.resume(); // Never expose decoder paths, media data or diagnostics.
      child.stdout.on("data", (chunk) => {
        size += chunk.length;
        if (size > PCM_BYTES_PER_SECOND * MAX_SPEECH_SECONDS)
          return finish(
            failure(
              "invalid_speech_audio",
              "Keep recordings within three minutes.",
            ),
          );
        chunks.push(chunk);
      });
      child.on("close", (code) => {
        if (settled) return;
        if (code !== 0)
          return finish(
            failure(
              "invalid_speech_audio",
              "The recording could not be decoded. Try another take.",
            ),
          );
        try {
          finish(null, validatePcm(Buffer.concat(chunks, size)));
        } catch (error) {
          finish(error);
        }
      });
      child.stdin.end(format === "mov" ? undefined : bytes);
    });
  } finally {
    if (directory) {
      try {
        await rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      } catch {
        throw failure(
          "speech_scratch_cleanup",
          "Private audio conversion cleanup could not finish. Please try again later.",
          503,
        );
      }
    }
  }
}
