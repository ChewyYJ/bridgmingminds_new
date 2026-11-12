import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../server/app.mjs";
import { createAudioStorage } from "../server/audio-storage.mjs";

// Explicit opt-in: this test creates synthetic guest accounts and one private
// object in the configured cloud project, then deletes those accounts/objects.
// It deliberately leaves the upload-replay tombstone until normal maintenance.
// No AI request is made. Never run against a different project by inference.
test(
  "live cloud audio: private direct upload, owner playback and account deletion",
  {
    skip: process.env.RUN_CLOUD_AUDIO_TESTS !== "1",
    timeout: 120000,
  },
  async () => {
    assert.ok(process.env.POSTGRES_URL, "A cloud database must be configured.");
    assert.ok(process.env.SUPABASE_URL, "Cloud storage must be configured.");
    assert.ok(
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Server storage credentials must be configured.",
    );
    const service = createApp({
      apiKey: "",
      databaseUrl: process.env.POSTGRES_URL,
    });
    const storage = createAudioStorage({
      supabaseUrl: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
    const accounts = [];
    let server;
    let objectKey;
    let audioId;
    let request;
    try {
      await Promise.all([service.ready, storage.ready]);
      server = service.app.listen(0, "127.0.0.1");
      await once(server, "listening");
      const origin = `http://127.0.0.1:${server.address().port}`;
      request = async (path, { method = "GET", token, body } = {}) => {
        const response = await fetch(`${origin}/api${path}`, {
          method,
          redirect: "manual",
          headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(body !== undefined
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const data = response.headers.get("content-type")?.includes("json")
          ? await response.json()
          : null;
        return { status: response.status, data, headers: response.headers };
      };
      const health = await request("/health");
      assert.equal(health.status, 200);
      assert.equal(health.data.storage, "supabase");
      assert.equal(health.data.provider, "local", "AI must stay disabled.");
      for (let index = 0; index < 2; index++) {
        const guest = await request("/auth/guest", {
          method: "POST",
          body: {},
        });
        assert.equal(
          guest.status,
          200,
          "Synthetic guest creation must succeed.",
        );
        assert.ok(guest.data.profile?.id && guest.data.token);
        accounts.push({ id: guest.data.profile.id, token: guest.data.token });
      }
      const [owner, other] = accounts;
      for (const account of accounts) {
        const consent = await request("/me", {
          method: "PATCH",
          token: account.token,
          body: { consent: { recording: true } },
        });
        assert.equal(consent.status, 200);
      }
      const bytes = Buffer.from(
        "synthetic private recording - cloud protocol test",
      );
      const admission = await request("/audio/uploads", {
        method: "POST",
        token: owner.token,
        body: { mime: "audio/webm", size: bytes.length },
      });
      assert.equal(
        admission.status,
        201,
        "Direct upload admission must succeed.",
      );
      assert.equal(admission.data.transport, "direct");
      audioId = admission.data.id;
      objectKey = admission.data.path;
      assert.ok(objectKey?.startsWith(`${owner.id}/`));
      const signed = new URL(admission.data.signedUrl);
      assert.equal(signed.protocol, "https:");
      assert.ok(signed.hostname === new URL(process.env.SUPABASE_URL).hostname);
      const pending = await request(`/audio/${audioId}/url`, {
        token: owner.token,
      });
      assert.equal(pending.status, 404, "Pending uploads cannot be played.");
      const upload = await fetch(signed, {
        method: "PUT",
        headers: {
          "content-type": "audio/webm",
          "cache-control": "max-age=0",
          "x-upsert": "false",
        },
        body: bytes,
      });
      await upload.arrayBuffer();
      assert.equal(
        upload.status,
        200,
        "The provider must accept the signed raw PUT.",
      );
      const complete = await request(`/audio/uploads/${audioId}/complete`, {
        method: "POST",
        token: owner.token,
        body: {},
      });
      assert.equal(
        complete.status,
        200,
        "Uploaded metadata must pass finalization.",
      );
      assert.equal(complete.data.id, audioId);
      const ready = await service.persistence
        .prepare(
          "SELECT status,size_bytes,mime FROM audio WHERE id=? AND user_id=?",
        )
        .get(audioId, owner.id);
      assert.equal(ready.status, "ready");
      assert.equal(ready.size_bytes, bytes.length);
      assert.equal(ready.mime, "audio/webm");
      const playback = await request(`/audio/${audioId}/url`, {
        token: owner.token,
      });
      assert.equal(playback.status, 200);
      const playbackResponse = await fetch(playback.data.url);
      assert.equal(
        playbackResponse.status,
        200,
        "Owner's signed playback must work.",
      );
      assert.deepEqual(
        Buffer.from(await playbackResponse.arrayBuffer()),
        bytes,
      );
      assert.equal(
        (await request(`/audio/${audioId}/url`, { token: other.token })).status,
        404,
        "Another account must not obtain a playback capability.",
      );
      assert.equal(
        (
          await request(`/audio/uploads/${audioId}/complete`, {
            method: "POST",
            token: other.token,
            body: {},
          })
        ).status,
        404,
        "Another account must not finalize the upload.",
      );
      const deleted = await request("/account", {
        method: "DELETE",
        token: owner.token,
      });
      assert.equal(
        deleted.status,
        200,
        "Synthetic owner deletion must succeed.",
      );
      owner.deleted = true;
      assert.equal(
        await storage.inspect(objectKey),
        null,
        "Deleted recording must be absent.",
      );
      assert.equal(
        await service.persistence
          .prepare("SELECT id FROM audio WHERE id=?")
          .get(audioId),
        undefined,
      );
      const tombstone = await service.persistence
        .prepare(
          "SELECT user_id,status,attempts FROM deletion_outbox WHERE id=?",
        )
        .get(`audio:${audioId}`);
      assert.equal(tombstone.user_id, owner.id);
      assert.equal(tombstone.status, "pending");
      assert.ok(
        tombstone.attempts >= 1,
        "The replay tombstone must survive successful deletion.",
      );
      assert.equal((await request("/me", { token: owner.token })).status, 401);
    } finally {
      // Cleanup targets only identities and the object created in this test.
      for (const account of accounts) {
        if (!account.deleted && request) {
          const result = await request("/account", {
            method: "DELETE",
            token: account.token,
          });
          assert.equal(
            result.status,
            200,
            "Synthetic account cleanup must succeed.",
          );
        }
      }
      if (objectKey) await storage.delete(objectKey);
      if (server)
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      await service.close();
    }
  },
);
