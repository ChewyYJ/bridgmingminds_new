import test from "node:test";
import assert from "node:assert/strict";
import { Blob } from "node:buffer";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";

// Execute the actual client module with its platform/transport dependencies
// replaced. No Expo runtime, browser cookies, real files or network are used.
const filename = new URL("../src/lib/api.ts", import.meta.url);
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture() {
  const reading = deferred();
  const bytes = deferred();
  const downloads = [];
  const uploads = [];
  const exports = {};
  const unused = () => {
    throw new Error("Unexpected platform or storage operation");
  };
  const dependencies = {
    "react-native": { Platform: { OS: "web" } },
    "@react-native-async-storage/async-storage": {},
    "expo-secure-store": {},
    "expo-file-system": { File: unused },
    "expo/fetch": {
      fetch: async (url, options) => {
        uploads.push({ url, options });
        return { ok: true, json: async () => ({ id: "saved-recording" }) };
      },
    },
  };
  new Script(compiled, { filename: filename.pathname }).runInNewContext({
    exports,
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`);
      return dependencies[name];
    },
    process: { env: { EXPO_PUBLIC_API_URL: "https://upload-fixture.invalid" } },
    fetch: async (uri) => {
      downloads.push(uri);
      assert.equal(uri, "blob:private-recording");
      return {
        blob: () => {
          reading.resolve();
          return bytes.promise;
        },
      };
    },
  });
  return { api: exports, reading, bytes, downloads, uploads };
}

for (const nextOwner of ["account-b", "guest"]) {
  test(`a delayed recording read cannot upload after switching to ${nextOwner}`, async () => {
    const f = fixture();
    f.api.setDraftOwner("account-a");
    const pending = f.api.uploadAudio("blob:private-recording", "audio/webm");
    await f.reading.promise;
    assert.equal(f.uploads.length, 0);
    f.api.setDraftOwner(nextOwner);
    f.bytes.resolve(new Blob(["private audio from account A"]));
    await assert.rejects(
      pending,
      /Your account changed\. Please record again in this account\./,
    );
    assert.deepEqual(f.downloads, ["blob:private-recording"]);
    assert.equal(f.uploads.length, 0, "No authenticated POST may cross owners");
  });
}

test("a delayed recording read still uploads exactly once when its owner is unchanged", async () => {
  const f = fixture();
  f.api.setDraftOwner("account-a");
  await f.api.storeToken("synthetic-token-not-used-on-web");
  const pending = f.api.uploadAudio("blob:private-recording", "audio/ogg");
  await f.reading.promise;
  assert.equal(f.uploads.length, 0);
  // A harmless owner refresh must not invalidate the operation.
  f.api.setDraftOwner("account-a");
  const blob = new Blob(["private audio from account A"], { type: "audio/ogg" });
  f.bytes.resolve(blob);
  const result = await pending;
  assert.equal(result.id, "saved-recording");
  assert.equal(f.uploads.length, 1);
  const { url, options } = f.uploads[0];
  assert.equal(url, "https://upload-fixture.invalid/api/audio");
  assert.equal(options.method, "POST");
  assert.equal(options.credentials, "include");
  assert.equal(options.headers["Content-Type"], "audio/ogg");
  assert.equal(options.headers.Authorization, undefined);
  assert.equal(options.body, blob);
});
