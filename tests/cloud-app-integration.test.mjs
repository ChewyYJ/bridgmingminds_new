import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Requires an already-provisioned cloud project. All identities and content are
// synthetic, AI credentials are explicitly disabled, and owned rows are removed.
const enabled = process.env.MINDGARDEN_CLOUD_APP_TEST === "1";

test("two app instances share private accounts, garden, evaluation and friend debates", { skip: !enabled, timeout: 180000 }, async () => {
  const { createApp } = await import("../server/app.mjs");
  const databaseUrl = process.env.TEST_CLOUD_DATABASE_URL || process.env.POSTGRES_URL;
  assert.ok(databaseUrl, "A cloud test database URL must be provided securely.");
  const services = [];
  const servers = [];
  const users = [];
  const rooms = [];
  const request = async (base, path, user, method = "GET", body) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const bases = [];
    for (let index = 0; index < 2; index++) {
      const service = createApp({ databaseUrl, apiKey: "", disableWorker: true });
      services.push(service);
      await service.ready;
      const server = await new Promise((resolve, reject) => {
        const running = service.app.listen(0, "127.0.0.1", () => resolve(running));
        running.once("error", reject);
      });
      servers.push(server);
      bases.push(`http://127.0.0.1:${server.address().port}`);
    }
    const [one, two] = bases;
    assert.equal((await request(one, "/state")).status, 401);
    for (let index = 0; index < 3; index++) {
      const result = await request(one, "/auth/guest", null, "POST");
      assert.equal(result.status, 200, "Synthetic guest creation failed.");
      users.push({ id: result.data.profile.id, token: result.data.token });
    }
    const [author, partner, outsider] = users;
    assert.equal((await request(two, "/me", author)).data.id, author.id);
    await request(one, "/me", author, "PATCH", { displayName: "Synthetic cloud test", timezone: "Asia/Singapore" });
    assert.equal((await request(two, "/me", author)).data.displayName, "Synthetic cloud test");

    const plant = { plotId: "plot-1", plantType: "fern", idempotencyKey: randomUUID() };
    const plantResults = await Promise.all([request(one, "/garden/plant", author, "POST", plant), request(two, "/garden/plant", author, "POST", plant)]);
    assert.deepEqual(plantResults.map((result) => result.status), [200, 200]);
    const plantedState = (await request(two, "/state", author)).data;
    assert.equal(plantedState.wallet.seeds, 0);
    assert.equal(plantedState.plots.filter((plot) => plot.plantType).length, 1);

    const session = await request(one, "/sessions", author, "POST", { mode: "spin_speak" });
    assert.equal(session.status, 201);
    const attempt = await request(two, "/attempts", author, "POST", {
      sessionId: session.data.id,
      responseType: "text",
      text: "I think public libraries help people learn because they provide accessible resources. For example, a student can borrow a reference book. However, opening hours can limit access.",
    });
    assert.equal(attempt.status, 201);
    assert.equal((await request(one, `/attempts/${attempt.data.id}`, outsider)).status, 404);
    const queued = await Promise.all([request(one, `/attempts/${attempt.data.id}/evaluate`, author, "POST", {}), request(two, `/attempts/${attempt.data.id}/evaluate`, author, "POST", {})]);
    assert.deepEqual(queued.map((result) => result.status), [202, 202]);
    assert.equal(queued[0].data.id, queued[1].data.id);
    await Promise.all(services.map((service) => service.runJob(queued[0].data.id)));
    const complete = await request(two, `/attempts/${attempt.data.id}`, author);
    assert.equal(complete.status, 200);
    assert.equal(complete.data.status, "completed");
    assert.equal(complete.data.evaluation.provider, "local");
    const rewardBefore = (await request(one, "/state", author)).data;
    await Promise.all(services.map((service) => service.runJob(queued[0].data.id)));
    const rewardAfter = (await request(two, "/state", author)).data;
    assert.deepEqual(rewardAfter.wallet, rewardBefore.wallet);
    assert.equal(rewardAfter.xp, rewardBefore.xp);
    assert.ok(rewardAfter.xp > 0);
    const ledger = await services[0].persistence.prepare("SELECT COUNT(*) count FROM reward_ledger WHERE user_id=? AND kind='completion'").get(author.id);
    assert.equal(ledger.count, 1);

    const created = await request(one, "/friends/rooms", author, "POST", { position: "for", rounds: 2, idempotencyKey: randomUUID() });
    assert.equal(created.status, 201);
    const room = created.data;
    rooms.push(room.id);
    assert.equal((await request(two, `/friends/rooms/${room.id}`, outsider)).status, 404);
    assert.equal((await request(two, "/friends/join", partner, "POST", { code: room.code })).status, 200);
    const firstTurn = { text: "Libraries can provide useful shared resources for students.", expectedTurn: 0, idempotencyKey: randomUUID() };
    const turnResults = await Promise.all([request(one, `/friends/rooms/${room.id}/turn`, author, "POST", firstTurn), request(two, `/friends/rooms/${room.id}/turn`, author, "POST", firstTurn)]);
    assert.deepEqual(turnResults.map((result) => result.status), [200, 200]);
    for (let index = 1; index < 4; index++) {
      const result = await request(index % 2 ? two : one, `/friends/rooms/${room.id}/turn`, index % 2 ? partner : author, "POST", { text: `Synthetic debate response ${index}: access also depends on time and location.`, expectedTurn: index, idempotencyKey: randomUUID() });
      assert.equal(result.status, 200);
    }
    const finished = (await request(one, `/friends/rooms/${room.id}`, author)).data;
    assert.equal(finished.status, "completed");
    assert.equal(finished.turns.length, 4);

    assert.equal((await request(one, "/auth/logout", outsider, "POST", {})).status, 200);
    assert.equal((await request(two, "/me", outsider)).status, 401);
    assert.equal((await request(two, "/account", author, "DELETE")).status, 200);
    assert.equal((await request(one, "/me", author)).status, 401);
  } finally {
    if (services[0]) {
      for (const id of rooms) await services[0].persistence.prepare("DELETE FROM friend_rooms WHERE id=?").run(id);
      for (const user of users) {
        await services[0].persistence.prepare("DELETE FROM users WHERE id=?").run(user.id);
        // Shared request counters have no user foreign key; remove only keys
        // containing one of this test's newly generated UUIDs.
        await services[0].persistence.prepare("DELETE FROM rate_limits WHERE key LIKE ?").run(`%${user.id}%`);
      }
    }
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    await Promise.all(services.map((service) => service.close()));
  }
});
