import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { openDatabase, transaction } from "../server/database.mjs";
import { installFriends } from "../server/friends.mjs";

async function fixture(t, options = {}) {
  const db = openDatabase(":memory:");
  await db.ready;
  for (const id of ["host", "friend", "other"])
    await db
      .prepare(
        "INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        id,
        JSON.stringify({ displayName: id }),
        "{}",
        "[]",
        new Date().toISOString(),
      );
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = req.get("x-fixture-user");
    next();
  });
  const friends = installFriends(app, {
    db,
    wrap: (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next),
    limit: async () => {},
    getUser: async (id) => db.prepare("SELECT * FROM users WHERE id=?").get(id),
    assertOwnAudio: async () => {
      throw Object.assign(new Error("Audio does not belong to you."), {
        status: 404,
      });
    },
    ...options,
  });
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: error.message }),
  );
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  async function request(path, user = "host", body) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/friends${path}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: { "x-fixture-user": user, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return { status: response.status, data: await response.json() };
  }
  async function create(key = "create-cloud-room") {
    const result = await request("/rooms", "host", {
      position: "for",
      rounds: 2,
      idempotencyKey: key,
    });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data;
  }
  return { db, friends, request, create };
}

test("async friend storage serializes room creation, competing joins and duplicate turns", async (t) => {
  const f = await fixture(t);
  const rooms = await Promise.all([f.create(), f.create()]);
  assert.equal(rooms[0].id, rooms[1].id);
  const room = rooms[0];
  const joined = await Promise.all(
    ["friend", "other"].map((id) =>
      f.request("/join", id, { code: room.code }),
    ),
  );
  assert.deepEqual(joined.map((result) => result.status).sort(), [200, 409]);
  const winner = joined[0].status === 200 ? "friend" : "other";
  const turn = {
    expectedTurn: 0,
    text: "Here is a reason for this position.",
    idempotencyKey: "cloud-turn-first",
  };
  const sent = await Promise.all([
    f.request(`/rooms/${room.id}/turn`, "host", turn),
    f.request(`/rooms/${room.id}/turn`, "host", turn),
  ]);
  for (const result of sent) {
    assert.equal(result.status, 200);
    assert.equal(result.data.turns.length, 1);
    assert.equal(result.data.nextUserId, winner);
  }
  const outsider = winner === "friend" ? "other" : "friend";
  assert.equal((await f.request(`/rooms/${room.id}`, outsider)).status, 404);
  const listing = await f.friends.listForUser("host");
  assert.equal(listing[0].turns.length, 1);
  assert.equal(typeof listing[0].rounds, "number");
});

test("async audio ownership rejection rolls back a turn before saving it", async (t) => {
  const f = await fixture(t);
  const room = await f.create();
  await f.request("/join", "friend", { code: room.code });
  const result = await f.request(`/rooms/${room.id}/turn`, "host", {
    expectedTurn: 0,
    text: "This turn must not persist with someone else's audio.",
    audioId: randomUUID(),
    idempotencyKey: "invalid-audio-turn",
  });
  assert.equal(result.status, 404);
  assert.equal((await f.request(`/rooms/${room.id}`)).data.turns.length, 0);
});

test("account deletion closes rooms and removes authored content before another turn", async (t) => {
  const f = await fixture(t);
  const room = await f.create();
  await f.request("/join", "friend", { code: room.code });
  await f.request(`/rooms/${room.id}/turn`, "host", {
    expectedTurn: 0,
    text: "A private contribution that must be removed.",
    idempotencyKey: "removed-turn-key",
  });
  await transaction(f.db, async () => {
    await f.db.lockUser("host");
    await f.friends.removeUser("host");
    await f.db.prepare("DELETE FROM users WHERE id=?").run("host");
  });
  const saved = (await f.request(`/rooms/${room.id}`, "friend")).data;
  assert.equal(saved.closeReason, "participant_deleted");
  assert.equal(saved.status, "closed");
  assert.equal(saved.turns[0].text, "[Removed by author]");
  assert.match(saved.turns[0].userId, /^deleted:/);
  assert.equal(
    (
      await f.request(`/rooms/${room.id}/turn`, "friend", {
        expectedTurn: 1,
        text: "This reply arrives after the other account was removed.",
        idempotencyKey: "late-turn-request",
      })
    ).status,
    409,
  );
  assert.equal(await f.friends.canAccessAudio(randomUUID(), "friend"), false);
  assert.equal(
    (
      await f.request("/rooms", "host", {
        position: "for",
        rounds: 2,
        idempotencyKey: "deleted-user-room",
      })
    ).status,
    401,
  );
});

test("expired rooms are closed by asynchronous cleanup", async (t) => {
  const f = await fixture(t);
  const room = await f.create();
  await f.db
    .prepare("UPDATE friend_rooms SET expires_at=? WHERE id=?")
    .run("2000-01-01T00:00:00.000Z", room.id);
  assert.equal(
    (await f.request("/join", "friend", { code: room.code })).status,
    409,
  );
  const saved = (await f.request(`/rooms/${room.id}`)).data;
  assert.equal(saved.status, "closed");
  assert.equal(saved.closeReason, "expired");
});
