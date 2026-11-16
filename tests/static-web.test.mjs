import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import express from "express";
import { serveWeb } from "../server/static.mjs";

test("public web assets negotiate compression without changing API or private-file boundaries", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "bridgingminds-static-"));
  const root = join(dir, "dist");
  await mkdir(root);
  const name = "entry-0123456789abcdef0123456789abcdef.js";
  const script = "globalThis.webReady = true;";
  await Promise.all([
    writeFile(
      join(root, "index.html"),
      "<!doctype html><title>BridgingMinds</title>",
    ),
    writeFile(join(root, name), script),
    writeFile(join(root, `${name}.br`), brotliCompressSync(script)),
    writeFile(join(root, `${name}.gz`), gzipSync(script)),
    writeFile(join(root, ".hidden.js"), "private"),
    writeFile(join(dir, "secret.js"), "outside the public directory"),
  ]);
  const app = express();
  app.get("/api/state", (_req, res) => res.json({ private: true }));
  assert.equal(serveWeb(app, root), true);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [accept, expected] of [
    ["br, gzip", "br"],
    ["gzip, br;q=0", "gzip"],
    ["identity", null],
  ]) {
    const response = await fetch(`${base}/${name}`, {
      headers: { "Accept-Encoding": accept },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-encoding"), expected);
    assert.match(response.headers.get("content-type"), /javascript/);
    assert.match(response.headers.get("cache-control"), /immutable/);
    assert.equal(await response.text(), script);
  }
  const head = await fetch(`${base}/${name}`, {
    method: "HEAD",
    headers: { "Accept-Encoding": "gzip" },
  });
  assert.equal(head.headers.get("content-encoding"), "gzip");
  assert.equal(await head.text(), "");
  const api = await fetch(`${base}/api/state`);
  assert.equal(api.headers.get("content-encoding"), null);
  assert.deepEqual(await api.json(), { private: true });
  for (const pathname of [
    "/.hidden.js",
    "/%2e%2e/secret.js",
    "/%2e%2e%2fsecret.js",
  ]) {
    const response = await fetch(`${base}${pathname}`, {
      headers: { Accept: "application/javascript" },
    });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("content-encoding"), null);
  }
  const page = await fetch(`${base}/discover`, {
    headers: { Accept: "text/html" },
  });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(await page.text(), /BridgingMinds/);
});
