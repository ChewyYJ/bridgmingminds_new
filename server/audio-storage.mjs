import { mkdirSync } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const RECORDINGS_BUCKET = "recordings";
export const MAX_RECORDING_BYTES = 10 * 1024 * 1024;
export const RECORDING_MIME_TYPES = Object.freeze([
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "video/webm",
  "application/octet-stream",
]);

const failure = (status, message, code = "audio_storage") =>
  Object.assign(new Error(message), { status, code });
const unavailable = () =>
  failure(503, "Recording storage is unavailable. Please try again.");
const missingObject = (error) =>
  Number(error?.statusCode ?? error?.status) === 404 ||
  ["NoSuchKey", "NotFound", "not_found"].includes(error?.code);

function objectKey(key) {
  if (
    typeof key !== "string" ||
    key.length > 512 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(key) ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw failure(400, "Invalid recording path.", "audio_storage_path");
  return key;
}

function contentType(mime) {
  const value =
    typeof mime === "string" ? mime.split(";")[0].trim().toLowerCase() : "";
  if (!RECORDING_MIME_TYPES.includes(value))
    throw failure(415, "Use a WebM, MP4, M4A, MP3, WAV or Ogg recording.");
  return value;
}

function recordingBytes(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array))
    throw failure(400, "The recording could not be read.");
  if (bytes.byteLength > MAX_RECORDING_BYTES)
    throw failure(413, "Keep recordings under 10 MB.");
  return bytes;
}

async function storageClient({
  supabaseUrl,
  serviceRoleKey,
  fetch: transport,
}) {
  if (!supabaseUrl || !serviceRoleKey)
    throw failure(503, "Private recording storage is not configured.");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(transport ? { global: { fetch: transport } } : {}),
  });
}

function assertPrivateBucket(bucket) {
  const maxBytes = Number(bucket?.file_size_limit ?? bucket?.fileSizeLimit);
  const types = bucket?.allowed_mime_types ?? bucket?.allowedMimeTypes;
  if (
    bucket?.public !== false ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > MAX_RECORDING_BYTES ||
    !Array.isArray(types) ||
    !types.length ||
    types.some((mime) => !RECORDING_MIME_TYPES.includes(mime))
  )
    throw failure(
      503,
      "The recordings bucket needs private storage limits configured.",
    );
}

/** Explicit deployment setup only; request handlers never create or alter buckets. */
export async function setupPrivateBucket(options) {
  const client = await storageClient(options);
  let result = await client.storage.getBucket(RECORDINGS_BUCKET);
  if (result.error) {
    if (!missingObject(result.error) && result.error.code !== "NoSuchBucket")
      throw unavailable();
    const created = await client.storage.createBucket(RECORDINGS_BUCKET, {
      public: false,
      fileSizeLimit: MAX_RECORDING_BYTES,
      allowedMimeTypes: [...RECORDING_MIME_TYPES],
    });
    if (created.error) throw unavailable();
    result = await client.storage.getBucket(RECORDINGS_BUCKET);
  }
  if (result.error) throw unavailable();
  assertPrivateBucket(result.data);
  return { name: RECORDINGS_BUCKET, private: true };
}

/** Storage owns bytes only. Callers must check account ownership and retention first. */
export function createAudioStorage(options = {}) {
  if (!options.supabaseUrl && !options.serviceRoleKey) {
    const root = resolve(options.storageDir || "data/audio");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const filePath = (key) => {
      // Existing SQLite rows contain absolute paths inside this configured root.
      const path =
        typeof key === "string" && isAbsolute(key)
          ? key
          : resolve(root, objectKey(key));
      const within = relative(root, path);
      if (!within || within.startsWith(`..${sep}`) || isAbsolute(within))
        throw failure(400, "Invalid recording path.", "audio_storage_path");
      objectKey(within.split(sep).join("/"));
      return path;
    };
    const inspect = async (key) => {
      try {
        const info = await stat(filePath(key));
        return info.isFile() ? { size: info.size, mime: null } : null;
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    };
    return {
      kind: "local",
      ready: Promise.resolve(),
      async put(key, bytes, mime) {
        contentType(mime);
        recordingBytes(bytes);
        const path = filePath(key);
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
        return { path };
      },
      async read(key) {
        return readFile(filePath(key));
      },
      async delete(key) {
        try {
          await unlink(filePath(key));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      },
      inspect,
      async exists(key) {
        return Boolean(await inspect(key));
      },
      async signUpload() {
        throw failure(
          400,
          "Local recordings use the authenticated upload endpoint.",
        );
      },
      async signPlayback() {
        throw failure(
          400,
          "Local recordings use the authenticated playback endpoint.",
        );
      },
    };
  }

  let bucket;
  const ready = (async () => {
    const client = await storageClient(options);
    const result = await client.storage.getBucket(RECORDINGS_BUCKET);
    if (result.error) throw unavailable();
    assertPrivateBucket(result.data);
    bucket = client.storage.from(RECORDINGS_BUCKET);
  })();
  // A caller can await readiness later without an unhandled rejection at startup.
  void ready.catch(() => {});
  const inspect = async (key) => {
    objectKey(key);
    await ready;
    const { data, error } = await bucket.info(key);
    if (error) {
      if (missingObject(error)) return null;
      throw unavailable();
    }
    const size = Number(data?.size ?? data?.metadata?.size);
    const mime =
      data?.contentType ?? data?.content_type ?? data?.metadata?.mimetype;
    if (!Number.isSafeInteger(size) || size < 0 || typeof mime !== "string")
      throw unavailable();
    return { size, mime: mime.split(";")[0].trim().toLowerCase() };
  };
  return {
    kind: "supabase",
    ready,
    async put(key, bytes, mime) {
      objectKey(key);
      recordingBytes(bytes);
      const type = contentType(mime);
      await ready;
      const { error } = await bucket.upload(key, bytes, {
        contentType: type,
        cacheControl: "0",
        upsert: false,
      });
      if (error) throw unavailable();
      return { path: key };
    },
    async read(key) {
      objectKey(key);
      await ready;
      const { data, error } = await bucket.download(key);
      if (error) {
        if (missingObject(error)) throw failure(404, "Recording not found.");
        throw unavailable();
      }
      if (!data || data.size > MAX_RECORDING_BYTES) throw unavailable();
      return Buffer.from(await data.arrayBuffer());
    },
    async delete(key) {
      objectKey(key);
      await ready;
      const { error } = await bucket.remove([key]);
      if (error && !missingObject(error)) throw unavailable();
    },
    inspect,
    async exists(key) {
      return Boolean(await inspect(key));
    },
    async signUpload(key) {
      objectKey(key);
      await ready;
      const { data, error } = await bucket.createSignedUploadUrl(key, {
        upsert: false,
      });
      if (error || !data?.signedUrl || !data?.token) throw unavailable();
      return { signedUrl: data.signedUrl, token: data.token, path: key };
    },
    async signPlayback(key, seconds = 300) {
      objectKey(key);
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300)
        throw failure(400, "Recording links must expire within five minutes.");
      await ready;
      const { data, error } = await bucket.createSignedUrl(key, seconds);
      if (error || !data?.signedUrl) throw unavailable();
      return { signedUrl: data.signedUrl };
    },
  };
}
