import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Script } from "node:vm";
import ts from "typescript";
import { observePrivateFileOperations } from "./helpers/private-file-fixture.mjs";
import {
  createAudioStorage,
  setupPrivateBucket,
  MAX_RECORDING_BYTES,
  RECORDING_MIME_TYPES,
} from "../server/audio-storage.mjs";

const project = "https://recording-fixture.supabase.co";
const fakeKey = "test-service-role-not-a-real-key";
const key = "account-a/recording-a.webm";
const bytes = Buffer.from("a private recording with enough bytes");
const privateBucket = {
  id: "recordings",
  name: "recordings",
  public: false,
  file_size_limit: MAX_RECORDING_BYTES,
  allowed_mime_types: [...RECORDING_MIME_TYPES],
};

function cloudFixture(
  respond = () => {
    throw new Error("Unexpected storage request");
  },
  bucket = privateBucket,
) {
  const requests = [];
  const options = {
    supabaseUrl: project,
    serviceRoleKey: fakeKey,
    fetch: async (url, init) => {
      const request = {
        url: new URL(url),
        init,
        headers: new Headers(init.headers),
      };
      assert.equal(
        request.url.origin,
        project,
        "No unmocked outbound requests",
      );
      assert.equal(request.headers.get("apikey"), fakeKey);
      requests.push(request);
      if (request.url.pathname === "/storage/v1/bucket/recordings")
        return Response.json(bucket);
      return respond(request);
    },
  };
  return { options, requests, storage: createAudioStorage(options) };
}

test("local storage keeps old absolute paths and requests exclusive private file creation", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "garden-audio-storage-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const storage = createAudioStorage({ storageDir: dir });
  const fileOperations = observePrivateFileOperations(t);
  await storage.ready;
  assert.equal(storage.kind, "local");
  const result = await storage.put("original-id", bytes, "audio/webm");
  assert.equal(result.path, join(dir, "original-id"));
  assert.deepEqual(await storage.read(result.path), bytes);
  const write = fileOperations.writeFile.find(([path]) => path === result.path);
  assert.equal(write?.[2].mode, 0o600);
  assert.equal(write?.[2].flag, "wx");
  if (process.platform !== "win32")
    assert.equal(statSync(result.path).mode & 0o777, 0o600);
  assert.equal(await storage.exists(result.path), true);
  assert.equal((await storage.inspect(result.path)).size, bytes.length);
  await assert.rejects(storage.put("original-id", bytes, "audio/webm"), {
    code: "EEXIST",
  });
  await assert.rejects(storage.read(join(dir, "..", "outside")), {
    code: "audio_storage_path",
  });
  await storage.delete(result.path);
  await storage.delete(result.path);
  assert.equal(await storage.exists(result.path), false);
  assert.equal(await storage.inspect(result.path), null);
});

test("cloud storage checks a private bounded bucket without provisioning it", async () => {
  const f = cloudFixture();
  await f.storage.ready;
  assert.equal(f.storage.kind, "supabase");
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].init.method, "GET");
  for (const bad of [
    "../other",
    "/tmp/private",
    "account-a/../other",
    "account-a//other",
    "account-a/%2e%2e/other",
  ]) {
    await assert.rejects(f.storage.signUpload(bad), {
      code: "audio_storage_path",
    });
  }
  assert.equal(f.requests.length, 1, "Invalid keys must never reach storage");
});

for (const invalidBucket of [
  { ...privateBucket, public: true },
  { ...privateBucket, file_size_limit: null },
  { ...privateBucket, file_size_limit: MAX_RECORDING_BYTES + 1 },
  { ...privateBucket, allowed_mime_types: ["*/*"] },
]) {
  test(`cloud storage fails closed for unsafe bucket ${JSON.stringify({ public: invalidBucket.public, size: invalidBucket.file_size_limit, types: invalidBucket.allowed_mime_types.length })}`, async () => {
    const f = cloudFixture(undefined, invalidBucket);
    await assert.rejects(f.storage.ready, { status: 503 });
    await assert.rejects(f.storage.signUpload(key), { status: 503 });
    assert.equal(f.requests.length, 1);
  });
}

test("cloud binary storage uses non-overwriting private objects and bounded signed URLs", async () => {
  const f = cloudFixture((request) => {
    const { pathname } = request.url;
    if (pathname === `/storage/v1/object/recordings/${key}`) {
      if (request.init.method === "POST") {
        assert.equal(request.headers.get("x-upsert"), "false");
        assert.equal(request.headers.get("content-type"), "audio/webm");
        assert.deepEqual(request.init.body, bytes);
        return Response.json({ Key: `recordings/${key}` });
      }
      return new Response(bytes, { headers: { "content-type": "audio/webm" } });
    }
    if (pathname === `/storage/v1/object/upload/sign/recordings/${key}`) {
      assert.notEqual(request.headers.get("x-upsert"), "true");
      return Response.json({
        url: `/object/upload/sign/recordings/${key}?token=test-upload-token`,
      });
    }
    if (pathname === `/storage/v1/object/sign/recordings/${key}`) {
      assert.equal(JSON.parse(request.init.body).expiresIn, 120);
      return Response.json({
        signedURL: `/object/sign/recordings/${key}?token=test-playback-token`,
      });
    }
    throw new Error("Unexpected storage operation");
  });
  assert.deepEqual(await f.storage.put(key, bytes, "audio/webm"), {
    path: key,
  });
  assert.deepEqual(await f.storage.read(key), bytes);
  const upload = await f.storage.signUpload(key);
  assert.equal(upload.path, key);
  assert.equal(upload.token, "test-upload-token");
  assert.equal(
    upload.signedUrl,
    `${project}/storage/v1/object/upload/sign/recordings/${key}?token=test-upload-token`,
  );
  const playback = await f.storage.signPlayback(key, 120);
  assert.match(playback.signedUrl, /\/object\/sign\/recordings\//);
  await assert.rejects(f.storage.signPlayback(key, 301), { status: 400 });
  await assert.rejects(
    f.storage.put(key, Buffer.alloc(MAX_RECORDING_BYTES + 1), "audio/webm"),
    { status: 413 },
  );
  await assert.rejects(f.storage.put(key, bytes, "text/html"), { status: 415 });
});

test("cloud inspection uses actual stored metadata and distinguishes missing objects from outages", async () => {
  let mode = "found";
  const f = cloudFixture(({ url }) => {
    assert.equal(url.pathname, `/storage/v1/object/info/recordings/${key}`);
    if (mode === "missing")
      return Response.json(
        { message: "Object not found", statusCode: "404", code: "NoSuchKey" },
        { status: 404 },
      );
    if (mode === "outage")
      return Response.json(
        { message: "Do not leak provider diagnostics", statusCode: "503" },
        { status: 503 },
      );
    return Response.json({
      size: bytes.length,
      content_type: "audio/webm",
      metadata: { size: 1 },
    });
  });
  assert.deepEqual(await f.storage.inspect(key), {
    size: bytes.length,
    mime: "audio/webm",
  });
  mode = "missing";
  assert.equal(await f.storage.inspect(key), null);
  assert.equal(await f.storage.exists(key), false);
  mode = "outage";
  await assert.rejects(
    f.storage.exists(key),
    (error) => error.status === 503 && !error.message.includes("diagnostics"),
  );
});

test("cloud deletion is scoped to one object and remains safe to retry", async () => {
  let deleted = false;
  const f = cloudFixture(({ url, init }) => {
    assert.equal(url.pathname, "/storage/v1/object/recordings");
    assert.equal(init.method, "DELETE");
    assert.deepEqual(JSON.parse(init.body), { prefixes: [key] });
    const result = deleted ? [] : [{ name: key }];
    deleted = true;
    return Response.json(result);
  });
  await f.storage.delete(key);
  await f.storage.delete(key);
  assert.equal(deleted, true);
});

test("explicit setup creates only a missing private recordings bucket with limits", async () => {
  let created = false;
  const requests = [];
  const result = await setupPrivateBucket({
    supabaseUrl: project,
    serviceRoleKey: fakeKey,
    fetch: async (url, init) => {
      const path = new URL(url).pathname;
      requests.push([init.method, path]);
      if (path === "/storage/v1/bucket/recordings")
        return created
          ? Response.json(privateBucket)
          : Response.json(
              {
                message: "Bucket not found",
                statusCode: "404",
                code: "NoSuchBucket",
              },
              { status: 404 },
            );
      assert.equal(path, "/storage/v1/bucket");
      assert.equal(init.method, "POST");
      const body = JSON.parse(init.body);
      assert.equal(body.id, "recordings");
      assert.equal(body.public, false);
      assert.equal(body.file_size_limit, MAX_RECORDING_BYTES);
      assert.deepEqual(body.allowed_mime_types, [...RECORDING_MIME_TYPES]);
      created = true;
      return Response.json({ name: "recordings" });
    },
  });
  assert.deepEqual(result, { name: "recordings", private: true });
  assert.equal(requests.length, 3);
});

const compiledApi = ts.transpileModule(
  readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;

function clientFixture({ platform = "web", admission, upload, complete } = {}) {
  const calls = [];
  const blob = new Blob([bytes], { type: "audio/webm" });
  const exports = {};
  const dependencies = {
    "react-native": { Platform: { OS: platform } },
    "@react-native-async-storage/async-storage": {},
    "expo-secure-store": { setItemAsync: async () => {} },
    "expo-file-system": {
      File: class {
        size = blob.size;
        uri = "file:recording";
      },
    },
    "expo/fetch": {
      fetch: async (url, options) => {
        calls.push({ url, options });
        return upload
          ? upload(url, options)
          : new Response(null, { status: 200 });
      },
    },
  };
  new Script(compiledApi).runInNewContext({
    exports,
    URL,
    Error,
    process: { env: { EXPO_PUBLIC_API_URL: "https://garden.invalid" } },
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name));
      return dependencies[name];
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === "blob:recording") return { blob: async () => blob };
      if (url === "https://garden.invalid/api/health")
        return Response.json({ storage: "supabase" });
      if (url === "https://garden.invalid/api/audio/uploads")
        return admission
          ? admission(url, options)
          : Response.json({
              transport: "direct",
              id: "new-audio-id",
              signedUrl: `${project}/storage/v1/object/upload/sign/recordings/${key}?token=test-signed-token`,
            });
      if (
        url === "https://garden.invalid/api/audio/uploads/new-audio-id/complete"
      )
        return complete
          ? complete(url, options)
          : Response.json({ id: "new-audio-id" });
      throw new Error("Unexpected client network request");
    },
  });
  return { api: exports, calls, blob };
}

for (const platform of ["web", "ios"]) {
  test(`the ${platform} client sends binary audio only to signed storage, then finalizes with app auth`, async () => {
    const f = clientFixture({ platform });
    f.api.setDraftOwner("account-a");
    await f.api.storeToken("synthetic-app-token");
    await f.api.api("/health");
    const controller = new AbortController();
    assert.equal(
      (
        await f.api.uploadAudio("blob:recording", "audio/webm", {
          signal: controller.signal,
        })
      ).id,
      "new-audio-id",
    );
    const admission = f.calls.find((c) => c.url.endsWith("/audio/uploads"));
    assert.deepEqual(JSON.parse(admission.options.body), {
      mime: "audio/webm",
      size: bytes.length,
    });
    const direct = f.calls.find((c) => c.url.startsWith(project));
    assert.equal(direct.options.method, "PUT");
    assert.equal(direct.options.credentials, "omit");
    assert.equal(direct.options.headers.Authorization, undefined);
    assert.equal(direct.options.headers.apikey, undefined);
    assert.equal(direct.options.headers["Content-Type"], "audio/webm");
    assert.equal(direct.options.headers["x-upsert"], "false");
    assert.equal(direct.options.signal, controller.signal);
    assert.equal(direct.options.body.size, bytes.length);
    const finalize = f.calls.at(-1);
    assert.ok(finalize.url.endsWith("/complete"));
    assert.equal(finalize.options.credentials, "include");
    assert.equal(
      finalize.options.headers.Authorization,
      platform === "web" ? undefined : "Bearer synthetic-app-token",
    );
    assert.equal(
      f.calls.some((c) => c.url === "https://garden.invalid/api/audio"),
      false,
    );
  });
}

test("an account switch during admission stops storage upload even if the old account returns", async () => {
  let f;
  f = clientFixture({
    admission: () => {
      f.api.setDraftOwner("account-b");
      f.api.setDraftOwner("account-a");
      return Response.json({
        transport: "direct",
        id: "new-audio-id",
        signedUrl: `${project}/storage/v1/object/upload/sign/recordings/${key}?token=test-signed-token`,
      });
    },
  });
  f.api.setDraftOwner("account-a");
  await f.api.api("/health");
  await assert.rejects(
    f.api.uploadAudio("blob:recording"),
    /Your account changed/,
  );
  assert.equal(
    f.calls.some((c) => c.url.startsWith(project)),
    false,
  );
});

test("switching accounts after direct upload cannot finalize as the next account", async () => {
  let f;
  f = clientFixture({
    upload: () => {
      f.api.setDraftOwner("account-b");
      return new Response(null);
    },
  });
  f.api.setDraftOwner("account-a");
  await f.api.api("/health");
  await assert.rejects(
    f.api.uploadAudio("blob:recording"),
    /Your account changed/,
  );
  assert.equal(
    f.calls.some((c) => c.url.endsWith("/complete")),
    false,
  );
});

test("upload failure and cancellation never finalize a recording", async () => {
  const f = clientFixture({
    upload: () => new Response(null, { status: 503 }),
  });
  f.api.setDraftOwner("account-a");
  await f.api.api("/health");
  await assert.rejects(
    f.api.uploadAudio("blob:recording"),
    /Audio upload failed/,
  );
  assert.equal(
    f.calls.some((c) => c.url.endsWith("/complete")),
    false,
  );
  const count = f.calls.length;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    f.api.uploadAudio("blob:recording", "audio/webm", {
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
  assert.equal(f.calls.length, count);
});
