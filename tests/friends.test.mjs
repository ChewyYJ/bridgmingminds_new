import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";

async function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), "garden-friends-"));
  const options = {
    dbPath: join(directory, "data.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: "",
    disableWorker: true,
  };
  let service, server, base;
  async function start() {
    service = createApp(options);
    server = await new Promise((resolve) => {
      const s = service.app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  }
  await start();
  async function request(path, user, method = "GET", body, extra = {}) {
    const response = await fetch(
      base + (path.startsWith("/api") ? path : "/api" + path),
      {
        method,
        headers: {
          ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...extra.headers,
        },
        body:
          extra.raw || (body === undefined ? undefined : JSON.stringify(body)),
      },
    );
    const data = response.headers.get("content-type")?.includes("json")
      ? await response.json()
      : await response.text();
    return { status: response.status, data };
  }
  async function guest(name) {
    const result = await request("/auth/guest", null, "POST");
    assert.equal(result.status, 200);
    const user = { token: result.data.token, id: result.data.profile.id };
    await request("/me", user, "PATCH", { displayName: name });
    return user;
  }
  async function room(user, more = {}) {
    const result = await request("/friends/rooms", user, "POST", {
      position: "for",
      rounds: 2,
      idempotencyKey: "create-this-room",
      ...more,
    });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data;
  }
  async function upload(user) {
    await request("/me", user, "PATCH", { consent: { recording: true } });
    const result = await request("/audio", user, "POST", undefined, {
      raw: Buffer.alloc(32, 1),
      headers: { "Content-Type": "audio/webm" },
    });
    assert.equal(result.status, 201);
    return result.data.id;
  }
  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
  }
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    request,
    guest,
    room,
    upload,
    get service() {
      return service;
    },
    async restart() {
      await stop();
      await start();
    },
  };
}

test("two real users join a private room, alternate all rounds and keep a shared conversation", async (t) => {
  const f = await setup(t),
    a = await f.guest("Asha"),
    b = await f.guest("Ben"),
    outsider = await f.guest("Outside");
  assert.equal((await f.request("/friends/rooms")).status, 401);
  const room = await f.room(a, {
    promptId: "debate-ai",
    rounds: 3,
    position: "against",
  });
  assert.match(room.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(room.status, "waiting");
  assert.equal(room.nextUserId, null);
  assert.equal(room.participants[0].position, "against");
  assert.equal(
    (await f.request(`/friends/rooms/${room.id}`, outsider)).status,
    404,
  );
  assert.deepEqual((await f.request("/friends/rooms", outsider)).data, []);
  assert.equal(
    (
      await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
        text: "I want to start before anyone joins.",
        expectedTurn: 0,
        idempotencyKey: "too-early-turn",
      })
    ).status,
    409,
  );
  const joined = await f.request("/friends/join", b, "POST", {
    code: room.code.toLowerCase(),
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.status, "active");
  assert.equal(joined.data.nextUserId, a.id);
  assert.deepEqual(
    joined.data.participants.map((p) => p.displayName),
    ["Asha", "Ben"],
  );
  assert.equal(joined.data.participants[1].position, "for");
  assert.equal(
    (await f.request("/friends/join", outsider, "POST", { code: room.code }))
      .status,
    409,
  );
  assert.equal(
    (await f.request(`/friends/rooms/${room.id}/close`, outsider, "POST", {}))
      .status,
    404,
  );
  for (let i = 0; i < 6; i++) {
    const sender = i % 2 ? b : a;
    const response = await f.request(
      `/friends/rooms/${room.id}/turn`,
      sender,
      "POST",
      {
        text: `This is the real participant argument in turn ${i + 1}, because both sides deserve a hearing.`,
        expectedTurn: i,
        idempotencyKey: `unique-turn-${i}`,
      },
    );
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.turns.length, i + 1);
    assert.equal(response.data.turns[i].userId, sender.id);
    assert.equal(response.data.turns[i].round, Math.floor(i / 2) + 1);
    assert.equal(response.data.status, i === 5 ? "completed" : "active");
    assert.equal(
      response.data.nextUserId,
      i === 5 ? null : i % 2 ? a.id : b.id,
    );
  }
  const forA = (await f.request(`/friends/rooms/${room.id}`, a)).data;
  assert.deepEqual(
    (await f.request(`/friends/rooms/${room.id}`, b)).data,
    forA,
  );
  assert.equal(forA.turns.length, 6);
  assert.ok(forA.turns.every((turn) => [a.id, b.id].includes(turn.userId)));
  assert.equal((await f.request("/state", a)).data.attempts.length, 0);
  assert.deepEqual((await f.request("/state", a)).data.wallet, {
    coins: 0,
  });
  assert.equal((await f.request("/export", a)).data.friendRooms[0].id, room.id);
});

test("concurrent joins choose one participant and duplicated/stale turns cannot skip the turn order", async (t) => {
  const f = await setup(t),
    a = await f.guest("Creator"),
    b = await f.guest("B"),
    c = await f.guest("C");
  const creations = await Promise.all(
    Array.from({ length: 4 }, () => f.room(a)),
  );
  assert.equal(new Set(creations.map((r) => r.id)).size, 1);
  const room = creations[0];
  const joins = await Promise.all(
    [b, c].map((user) =>
      f.request("/friends/join", user, "POST", { code: room.code }),
    ),
  );
  assert.equal(joins.filter((r) => r.status === 200).length, 1);
  const friend = joins[0].status === 200 ? b : c;
  assert.equal(
    (await f.request("/friends/join", friend, "POST", { code: room.code }))
      .status,
    200,
  );
  const first = {
    text: "My first case supports trying this with careful evidence.",
    expectedTurn: 0,
    idempotencyKey: "same-first-turn",
  };
  assert.equal(
    (await f.request(`/friends/rooms/${room.id}/turn`, friend, "POST", first))
      .status,
    409,
  );
  const duplicates = await Promise.all(
    Array.from({ length: 5 }, () =>
      f.request(`/friends/rooms/${room.id}/turn`, a, "POST", first),
    ),
  );
  assert.ok(duplicates.every((r) => r.status === 200));
  assert.ok(duplicates.every((r) => r.data.turns.length === 1));
  assert.equal(
    (
      await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
        ...first,
        text: "Changed content cannot reuse the same request key.",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request(`/friends/rooms/${room.id}/turn`, friend, "POST", {
        ...first,
        idempotencyKey: "stale-request-key",
      })
    ).status,
    409,
  );
  for (let i = 1; i < 4; i++)
    assert.equal(
      (
        await f.request(
          `/friends/rooms/${room.id}/turn`,
          i % 2 ? friend : a,
          "POST",
          {
            text: `My next response considers a tradeoff, turn ${i}.`,
            expectedTurn: i,
            idempotencyKey: `continue-turn-${i}`,
          },
        )
      ).status,
      200,
    );
  assert.equal(
    (await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", first))
      .status,
    200,
  );
  assert.equal(
    (
      await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
        ...first,
        expectedTurn: 4,
        idempotencyKey: "extra-turn-key",
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.request(`/friends/rooms/${room.id}`, friend)).data.turns.length,
    4,
  );
});

test("only explicitly shared recordings become playable by the other participant", async (t) => {
  const f = await setup(t),
    a = await f.guest("A"),
    b = await f.guest("B"),
    c = await f.guest("Outside");
  const room = await f.room(a);
  await f.request("/friends/join", b, "POST", { code: room.code });
  const shared = await f.upload(a),
    privateAudio = await f.upload(a),
    otherAudio = await f.upload(b);
  assert.equal((await f.request(`/audio/${shared}/url`, b)).status, 404);
  assert.equal(
    (
      await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
        text: "This attempt cannot attach another participant’s audio.",
        audioId: otherAudio,
        expectedTurn: 0,
        idempotencyKey: "bad-audio-attach",
      })
    ).status,
    404,
  );
  const turn = await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
    text: "Here is the transcript of the recording I chose to share.",
    audioId: shared,
    expectedTurn: 0,
    idempotencyKey: "share-my-recording",
  });
  assert.equal(turn.status, 200);
  const signed = await f.request(`/audio/${shared}/url`, b);
  assert.equal(signed.status, 200);
  assert.equal((await f.request(signed.data.url)).status, 200);
  assert.equal((await f.request(`/audio/${shared}`, b)).status, 200);
  assert.equal((await f.request(`/audio/${shared}/url`, c)).status, 404);
  assert.equal((await f.request(`/audio/${privateAudio}/url`, b)).status, 404);
  assert.equal(
    (await f.request(`/audio/${shared}/transcribe`, b, "POST", {})).status,
    404,
  );
  assert.equal(
    (
      await f.request(`/friends/rooms/${room.id}/turn`, b, "POST", {
        text: "I cannot reuse your shared recording as one of my uploads.",
        audioId: shared,
        expectedTurn: 1,
        idempotencyKey: "reuse-friend-audio",
      })
    ).status,
    404,
  );
  await f.request("/account", a, "DELETE");
  assert.equal((await f.request(signed.data.url)).status, 404);
});

test("deleting an account erases its shared contributions, closes rooms and preserves the friend’s own text", async (t) => {
  const f = await setup(t),
    a = await f.guest("KeepMe"),
    b = await f.guest("RemoveMe");
  const room = await f.room(a);
  await f.request("/friends/join", b, "POST", { code: room.code });
  await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
    text: "This text belongs to the remaining participant.",
    expectedTurn: 0,
    idempotencyKey: "retained-message",
  });
  await f.request(`/friends/rooms/${room.id}/turn`, b, "POST", {
    text: "PRIVATE SENTENCE THAT MUST BE ERASED ON DELETION.",
    expectedTurn: 1,
    idempotencyKey: "removed-message",
  });
  assert.equal((await f.request("/account", b, "DELETE")).status, 200);
  const saved = (await f.request(`/friends/rooms/${room.id}`, a)).data;
  assert.equal(saved.status, "closed");
  assert.equal(saved.closeReason, "participant_deleted");
  assert.equal(
    saved.turns[0].text,
    "This text belongs to the remaining participant.",
  );
  assert.equal(saved.turns[1].text, "[Removed by author]");
  assert.equal(saved.participants[1].displayName, "Deleted gardener");
  assert.ok(!JSON.stringify(saved).includes(b.id));
  assert.ok(!JSON.stringify(saved).includes("RemoveMe"));
  assert.ok(!JSON.stringify(saved).includes("PRIVATE SENTENCE"));
  assert.equal((await f.request("/friends/rooms", b)).status, 401);
  const exported = (await f.request("/export", a)).data;
  assert.equal(exported.friendRooms[0].status, "closed");
  assert.equal(
    f.service.db
      .prepare("SELECT COUNT(*) n FROM friend_turns WHERE user_id=?")
      .get(b.id).n,
    0,
  );
});

test("rooms survive restart, either participant can close, and waiting/active invitations expire", async (t) => {
  const f = await setup(t),
    a = await f.guest("A"),
    b = await f.guest("B");
  const original = await f.room(a);
  await f.restart();
  assert.equal(
    (await f.request("/friends/rooms", a)).data[0].code,
    original.code,
  );
  const joined = await f.request("/friends/join", b, "POST", {
    code: original.code,
  });
  assert.equal(joined.status, 200);
  await f.restart();
  assert.equal(
    (await f.request(`/friends/rooms/${original.id}`, b)).data.status,
    "active",
  );
  const closed = await f.request(
    `/friends/rooms/${original.id}/close`,
    b,
    "POST",
    {},
  );
  assert.equal(closed.status, 200);
  assert.equal(closed.data.status, "closed");
  assert.equal(
    (await f.request(`/friends/rooms/${original.id}/close`, a, "POST", {})).data
      .status,
    "closed",
  );
  const waiting = await f.room(a, { idempotencyKey: "waiting-to-expire" });
  f.service.db
    .prepare(
      "UPDATE friend_rooms SET expires_at='2000-01-01T00:00:00Z' WHERE id=?",
    )
    .run(waiting.id);
  assert.equal(
    (await f.request("/friends/join", b, "POST", { code: waiting.code }))
      .status,
    409,
  );
  assert.equal(
    (await f.request(`/friends/rooms/${waiting.id}`, a)).data.closeReason,
    "expired",
  );
  const active = await f.room(a, { idempotencyKey: "active-to-expire" });
  await f.request("/friends/join", b, "POST", { code: active.code });
  f.service.db
    .prepare(
      "UPDATE friend_rooms SET expires_at='2000-01-01T00:00:00Z' WHERE id=?",
    )
    .run(active.id);
  assert.equal(
    (await f.request(`/friends/rooms/${active.id}`, b)).data.status,
    "closed",
  );
  assert.equal(
    (
      await f.request(`/friends/rooms/${active.id}/turn`, a, "POST", {
        text: "An expired room must not accept another argument.",
        expectedTurn: 0,
        idempotencyKey: "expired-room-turn",
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.request(`/friends/rooms/${active.id}`, b)).data.turns.length,
    0,
  );
});

test("invite guesses are bounded and bad input never creates rooms or turns", async (t) => {
  const f = await setup(t),
    a = await f.guest("A");
  assert.equal(
    (
      await f.request("/friends/rooms", a, "POST", {
        rounds: 99,
        position: "for",
        idempotencyKey: "invalid-rounds",
      })
    ).status,
    400,
  );
  assert.deepEqual((await f.request("/friends/rooms", a)).data, []);
  const codes = [];
  for (let i = 0; i < 13; i++)
    codes.push(await f.request("/friends/join", a, "POST", { code: "ZZZZZZ" }));
  assert.ok(codes.slice(0, 12).every((r) => r.status === 404));
  assert.equal(codes[12].status, 429);
  // Creating another account cannot bypass the shared-IP guessing budget.
  const b = await f.guest("B"),
    c = await f.guest("C");
  for (let i = 0; i < 12; i++)
    assert.equal(
      (await f.request("/friends/join", b, "POST", { code: "ZZZZZZ" }))
        .status,
      404,
    );
  for (let i = 0; i < 6; i++)
    assert.equal(
      (await f.request("/friends/join", c, "POST", { code: "ZZZZZZ" }))
        .status,
      404,
    );
  assert.equal(
    (await f.request("/friends/join", c, "POST", { code: "ZZZZZZ" })).status,
    429,
  );
});

test("malformed invite bodies are rejected without a server error or membership changes", async (t) => {
  const f = await setup(t),
    a = await f.guest("Creator"),
    b = await f.guest("Friend");
  const room = await f.room(a);
  for (const body of [
    undefined,
    null,
    [],
    {},
    { code: null },
    { code: room.code, userId: a.id },
  ]) {
    const response = await f.request("/friends/join", b, "POST", body);
    assert.equal(response.status, 400, JSON.stringify(response.data));
  }
  assert.deepEqual((await f.request("/friends/rooms", b)).data, []);
  assert.equal(
    (await f.request(`/friends/rooms/${room.id}`, a)).data.status,
    "waiting",
  );
  const joined = await f.request("/friends/join", b, "POST", {
    code: ` ${room.code.toLowerCase()} `,
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.participants.length, 2);
  assert.equal(
    (
      await f.request("/friends/rooms", b, "POST", {
        position: "for",
        rounds: 2,
        idempotencyKey: "malformed-key-\ud800",
      })
    ).status,
    400,
  );
});

test("turn text uses the same Unicode character boundaries as the editor and rejects malformed Unicode", async (t) => {
  const f = await setup(t),
    a = await f.guest("Creator"),
    b = await f.guest("Friend");
  const room = await f.room(a);
  await f.request("/friends/join", b, "POST", { code: room.code });
  for (const text of [
    "😀".repeat(5),
    "😀".repeat(5001),
    "Valid text followed by a split surrogate: \ud800",
    "Valid text followed by a split surrogate: \udfff",
    "  \n\t  ",
  ]) {
    const response = await f.request(
      `/friends/rooms/${room.id}/turn`,
      a,
      "POST",
      {
        text,
        expectedTurn: 0,
        idempotencyKey: "invalid-text-same-key",
      },
    );
    assert.equal(response.status, 400, JSON.stringify(response.data));
    assert.equal(
      (await f.request(`/friends/rooms/${room.id}`, a)).data.turns.length,
      0,
    );
  }
  const largest = "😀".repeat(5000);
  assert.equal(
    (
      await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
        text: "A valid message must still have a well-formed request key.",
        expectedTurn: 0,
        idempotencyKey: "malformed-key-\ud800",
      })
    ).status,
    400,
  );
  const sent = await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
    text: ` ${largest}\n`,
    expectedTurn: 0,
    idempotencyKey: "largest-valid-unicode",
  });
  assert.equal(sent.status, 200);
  assert.equal(sent.data.turns[0].text, largest);
  const shortest = "😀".repeat(10);
  const reply = await f.request(`/friends/rooms/${room.id}/turn`, b, "POST", {
    text: shortest,
    expectedTurn: 1,
    idempotencyKey: "shortest-valid-unicode",
  });
  assert.equal(reply.status, 200);
  await f.restart();
  assert.deepEqual(
    (await f.request(`/friends/rooms/${room.id}`, b)).data.turns.map(
      (turn) => turn.text,
    ),
    [largest, shortest],
  );
});

test("distinct simultaneous turn keys and closing cannot create extra turns", async (t) => {
  const f = await setup(t),
    a = await f.guest("Creator"),
    b = await f.guest("Friend"),
    outside = await f.guest("Outside");
  const room = await f.room(a);
  assert.ok(
    Math.abs(
      Date.parse(room.expiresAt) - Date.parse(room.createdAt) - 24 * 3600000,
    ) < 1000,
  );
  // Re-entering your own invite must not activate a one-person debate.
  const ownJoin = await f.request("/friends/join", a, "POST", {
    code: room.code,
  });
  assert.equal(ownJoin.data.status, "waiting");
  assert.equal(ownJoin.data.participants.length, 1);
  const joined = (
    await f.request("/friends/join", b, "POST", { code: room.code })
  ).data;
  assert.ok(
    Math.abs(
      Date.parse(joined.expiresAt) -
        Date.parse(joined.updatedAt) -
        168 * 3600000,
    ) < 1000,
  );
  const body = {
    text: "This is the first argument from the correct participant.",
    expectedTurn: 0,
    idempotencyKey: "outsider-turn-key",
  };
  assert.equal(
    (await f.request(`/friends/rooms/${room.id}/turn`, outside, "POST", body))
      .status,
    404,
  );
  const raced = await Promise.all(
    ["first-racing-key", "second-racing-key"].map((idempotencyKey) =>
      f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
        ...body,
        idempotencyKey,
      }),
    ),
  );
  assert.deepEqual(raced.map((response) => response.status).sort(), [200, 409]);
  await f.restart();
  assert.equal(
    (await f.request(`/friends/rooms/${room.id}`, b)).data.turns.length,
    1,
  );
  const closure = await Promise.all([
    f.request(`/friends/rooms/${room.id}/close`, a, "POST", {}),
    f.request(`/friends/rooms/${room.id}/turn`, b, "POST", {
      ...body,
      expectedTurn: 1,
      idempotencyKey: "reply-races-with-close",
    }),
  ]);
  assert.equal(closure[0].status, 200);
  assert.ok([200, 409].includes(closure[1].status));
  const saved = (await f.request(`/friends/rooms/${room.id}`, b)).data;
  assert.equal(saved.status, "closed");
  assert.equal(saved.nextUserId, null);
  assert.equal(saved.turns.length, closure[1].status === 200 ? 2 : 1);
  assert.equal(
    (
      await f.request(`/friends/rooms/${room.id}/turn`, b, "POST", {
        ...body,
        expectedTurn: saved.turns.length,
        idempotencyKey: "cannot-send-after-close",
      })
    ).status,
    409,
  );
});

test("shared audio capabilities are narrow, expire and can be refreshed after restart without losing text", async (t) => {
  const f = await setup(t),
    a = await f.guest("Creator"),
    b = await f.guest("Friend");
  const room = await f.room(a);
  await f.request("/friends/join", b, "POST", { code: room.code });
  const audioId = await f.upload(a);
  const text = "This transcript remains readable after its recording expires.";
  await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
    text,
    audioId,
    expectedTurn: 0,
    idempotencyKey: "voice-capability-turn",
  });
  const signed = (await f.request(`/audio/${audioId}/url`, b)).data;
  assert.equal((await f.request(signed.url)).status, 200);
  assert.equal((await f.request(signed.url, null, "POST", {})).status, 401);
  const capability = new URL(signed.url, "http://localhost").searchParams.get(
    "access",
  );
  assert.equal(
    (await f.request(`/friends/rooms/${room.id}?access=${capability}`)).status,
    401,
  );
  assert.equal((await f.request(`${signed.url.slice(0, -1)}!`)).status, 401);
  const clock = t.mock.method(
    Date,
    "now",
    () => Date.parse(signed.expiresAt) + 1,
  );
  try {
    assert.equal((await f.request(signed.url)).status, 401);
  } finally {
    clock.mock.restore();
  }
  await f.restart();
  assert.equal((await f.request(signed.url)).status, 401);
  const refreshed = (await f.request(`/audio/${audioId}/url`, b)).data;
  assert.equal((await f.request(refreshed.url)).status, 200);
  const recording = f.service.db
    .prepare("SELECT path FROM audio WHERE id=?")
    .get(audioId);
  assert.ok(existsSync(recording.path));
  f.service.db
    .prepare(
      "UPDATE audio SET created_at='2000-01-01T00:00:00.000Z' WHERE id=?",
    )
    .run(audioId);
  assert.equal((await f.request(refreshed.url)).status, 404);
  assert.equal(existsSync(recording.path), false);
  assert.equal(
    f.service.db.prepare("SELECT id FROM audio WHERE id=?").get(audioId),
    undefined,
  );
  const saved = (await f.request(`/friends/rooms/${room.id}`, b)).data;
  assert.equal(saved.turns[0].text, text);
  assert.equal(saved.turns[0].audioId, undefined);
});

test("guest upgrade and a new login retain friend access while creator deletion closes and anonymizes the room", async (t) => {
  const f = await setup(t),
    a = await f.guest("Creator"),
    b = await f.guest("Friend");
  const room = await f.room(a, {
    promptId: "debate-repair",
    position: "against",
    rounds: 3,
  });
  await f.request("/friends/join", b, "POST", { code: room.code });
  await f.request(`/friends/rooms/${room.id}/turn`, a, "POST", {
    text: "The creator’s contribution will be removed when their account is deleted.",
    expectedTurn: 0,
    idempotencyKey: "creator-account-turn",
  });
  const friendAudio = await f.upload(b);
  await f.request(`/friends/rooms/${room.id}/turn`, b, "POST", {
    text: "My contribution and my recording belong to the remaining participant.",
    audioId: friendAudio,
    expectedTurn: 1,
    idempotencyKey: "remaining-account-turn",
  });
  const credentials = {
    email: "friend-lifecycle@example.test",
    password: "Temporary-fixture-only-9387",
  };
  const registered = await f.request("/auth/register", a, "POST", credentials);
  assert.equal(registered.status, 200);
  assert.equal(registered.data.profile.id, a.id);
  const upgraded = { id: a.id, token: registered.data.token };
  await f.request("/auth/logout", upgraded, "POST", {});
  assert.equal(
    (await f.request(`/friends/rooms/${room.id}`, upgraded)).status,
    401,
  );
  await f.restart();
  const login = await f.request("/auth/login", null, "POST", credentials);
  assert.equal(login.status, 200);
  const returned = { id: login.data.profile.id, token: login.data.token };
  const recovered = (await f.request(`/friends/rooms/${room.id}`, returned))
    .data;
  assert.equal(recovered.turns.length, 2);
  assert.equal(recovered.nextUserId, a.id);
  // Legacy clients store only the creation key; changing the form after reload
  // must still recover the original room, not create a second one.
  const creationRetry = await f.room(returned, {
    promptId: "debate-ai",
    position: "for",
    rounds: 2,
  });
  assert.equal(creationRetry.id, room.id);
  assert.equal(creationRetry.prompt.id, "debate-repair");
  assert.equal(creationRetry.rounds, 3);
  const creatorPlayback = (
    await f.request(`/audio/${friendAudio}/url`, returned)
  ).data.url;
  assert.equal((await f.request(creatorPlayback)).status, 200);
  assert.equal((await f.request("/account", returned, "DELETE")).status, 200);
  assert.equal((await f.request(creatorPlayback)).status, 401);
  const kept = (await f.request(`/friends/rooms/${room.id}`, b)).data;
  assert.equal(kept.status, "closed");
  assert.equal(kept.closeReason, "participant_deleted");
  assert.equal(kept.participants[0].displayName, "Deleted gardener");
  assert.equal(kept.turns[0].text, "[Removed by author]");
  assert.equal(kept.turns[1].audioId, friendAudio);
  assert.equal((await f.request(`/audio/${friendAudio}`, b)).status, 200);
  const exported = (await f.request("/export", b)).data;
  assert.equal(exported.friendRooms[0].turns[0].text, "[Removed by author]");
  assert.ok(!JSON.stringify(exported.friendRooms).includes(a.id));
  const outsider = await f.guest("New account");
  assert.equal(
    (await f.request("/friends/join", outsider, "POST", { code: room.code }))
      .status,
    409,
  );
});
