import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import {
  DEFAULT_POSITIONS,
  isPlantablePosition,
  hasPlantSpace,
} from "../shared/garden-layout.mjs";
import {
  CARE_DURATION_MS,
  THIRSTY_AFTER_MS,
  careRemainingMs,
  plantCareStatus,
} from "../shared/garden-care.mjs";

const hour = 60 * 60 * 1000;
const start = Date.parse("2026-11-01T06:00:00.000Z");
const plotAt = (state, id = "plot-1") =>
  state.plots.find((plot) => plot.id === id);
const drawing = {
  strokes: [
    {
      color: "#79AEC8",
      points: [
        { x: 0.2, y: 0.3 },
        { x: 0.6, y: 0.8 },
      ],
    },
  ],
};
const plantAction = (plot, key = randomUUID()) => ({
  plotId: plot.id,
  plantId: plot.plantId,
  idempotencyKey: key,
});

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "garden-care-"));
  let clock = start;
  let service, server, base;
  const options = {
    dbPath: join(directory, "data.sqlite"),
    storageDir: join(directory, "audio"),
    apiKey: "",
    disableWorker: true,
    gardenNow: () => clock,
  };
  async function boot() {
    service = createApp(options);
    server = await new Promise((resolve) => {
      const listening = service.app.listen(0, "127.0.0.1", () =>
        resolve(listening),
      );
    });
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    service.close();
  }
  await boot();
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(path, user, method = "GET", body) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  async function post(path, user, body, expected = 200) {
    const result = await request(path, user, "POST", body);
    assert.equal(
      result.status,
      expected,
      `${path}: ${JSON.stringify(result.data)}`,
    );
    return result.data;
  }
  return {
    request,
    post,
    state: async (user) => (await request("/state", user)).data,
    async guest() {
      const result = await post("/auth/guest", null, {});
      return { token: result.token, id: result.profile.id };
    },
    fund(user, seeds = 5, water = 5, xp = 90) {
      service.db
        .prepare("UPDATE users SET wallet=?,xp=? WHERE id=?")
        .run(JSON.stringify({ seeds, water, sunlight: 3 }), xp, user.id);
    },
    setPlots(user, plots) {
      service.db
        .prepare("UPDATE users SET plots=? WHERE id=?")
        .run(JSON.stringify(plots), user.id);
    },
    async plant(user, payload = {}) {
      return post("/garden/plant", user, {
        plotId: "plot-1",
        plantType: "fern",
        idempotencyKey: randomUUID(),
        ...payload,
      });
    },
    get db() {
      return service.db;
    },
    get time() {
      return clock;
    },
    setTime(value) {
      clock = value;
    },
    advance(value) {
      clock += value;
    },
    async restart() {
      await stop();
      await boot();
    },
  };
}

test("care helpers use exact elapsed-time thresholds, including a daylight-saving boundary", () => {
  assert.equal(CARE_DURATION_MS, 48 * hour);
  assert.equal(THIRSTY_AFTER_MS, 24 * hour);
  const plot = {
    plantType: "fern",
    waterDueAt: new Date(start + CARE_DURATION_MS).toISOString(),
  };
  assert.equal(plantCareStatus({ plantType: null }, start), "empty");
  assert.equal(careRemainingMs({ plantType: null }, start), 0);
  assert.equal(plantCareStatus(plot, start + 24 * hour - 1), "healthy");
  assert.equal(plantCareStatus(plot, start + 24 * hour), "thirsty");
  assert.equal(plantCareStatus(plot, start + 48 * hour - 1), "thirsty");
  assert.equal(careRemainingMs(plot, start + 48 * hour - 1), 1);
  assert.equal(plantCareStatus(plot, new Date(start + 48 * hour)), "dead");
  assert.equal(careRemainingMs(plot, start + 90 * hour), 0);
  assert.equal(careRemainingMs(plot, start - hour), CARE_DURATION_MS);
  assert.equal(plantCareStatus({ plantType: "daisy" }, start), "healthy");
});

test("plant deadlines survive offline expiry and restart; dead plants cannot be watered or archived", async (t) => {
  const f = await fixture(t),
    user = await f.guest();
  f.fund(user);
  const initial = await f.plant(user);
  const plant = plotAt(initial);
  assert.match(plant.plantId, /^[0-9a-f-]{36}$/);
  assert.equal(plant.plantedAt, new Date(start).toISOString());
  assert.equal(plant.waterDueAt, new Date(start + 48 * hour).toISOString());
  await f.post("/garden/clear", user, plantAction(plant), 409);
  await f.post("/garden/replant", user, plantAction(plant), 409);
  f.advance(48 * hour);
  await f.restart();
  const expired = await f.state(user);
  assert.deepEqual(plotAt(expired), plant);
  assert.equal(plantCareStatus(plotAt(expired), f.time), "dead");
  await f.post("/garden/water", user, plantAction(plant), 409);
  await f.post("/garden/archive", user, plantAction(plant), 409);
  assert.deepEqual((await f.state(user)).wallet, initial.wallet);
  assert.deepEqual((await f.state(user)).archivedPlants, []);
});

test("legacy plants receive one persisted grace period and old retry keys survive lifecycle changes", async (t) => {
  const f = await fixture(t),
    user = await f.guest();
  f.fund(user);
  const state = await f.state(user);
  const payload = { plotId: "plot-1", plantType: "tulip" };
  const legacy = {
    ...plotAt(state),
    plantType: "tulip",
    growth: 3,
    plantedAt: "2025-01-01T00:00:00Z",
    lastWateredAt: "2025-01-02T00:00:00Z",
    plantingKey: "legacy-planting-key",
    plantingRequestHash: createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex"),
    lastWateringKey: "legacy-watering-key",
  };
  state.plots[0] = legacy;
  f.setPlots(user, state.plots);
  // Simulate the previous schema: no lifecycle tables, while keeping user data.
  f.db.exec("DROP TABLE garden_archives; DROP TABLE garden_operations;");
  await f.restart();
  const migrated = await f.state(user);
  const plant = plotAt(migrated);
  assert.equal(plant.waterDueAt, new Date(start + 48 * hour).toISOString());
  assert.equal(plant.plantedAt, legacy.plantedAt);
  assert.equal(plant.lastWateredAt, legacy.lastWateredAt);
  assert.equal(plant.growth, 3);
  assert.deepEqual(migrated.wallet, state.wallet);
  f.advance(25 * hour);
  await f.restart();
  assert.deepEqual(plotAt(await f.state(user)), plant);
  const archived = await f.post("/garden/archive", user, plantAction(plant));
  await f.post("/garden/plant", user, {
    ...payload,
    idempotencyKey: legacy.plantingKey,
  });
  await f.post("/garden/water", user, {
    plotId: "plot-1",
    idempotencyKey: legacy.lastWateringKey,
  });
  const replayed = await f.state(user);
  assert.deepEqual(replayed.plots, archived.plots);
  assert.deepEqual(replayed.archivedPlants, archived.archivedPlants);
  assert.deepEqual(replayed.wallet, archived.wallet);
});

test("watering costs once per request, supports mature plants, resets the deadline and never exceeds growth three", async (t) => {
  const f = await fixture(t),
    user = await f.guest();
  f.fund(user, 1, 5);
  let state = await f.plant(user);
  const plant = plotAt(state);
  for (let index = 1; index <= 3; index++) {
    state = await f.post("/garden/water", user, plantAction(plotAt(state)));
    assert.equal(plotAt(state).growth, index);
  }
  f.advance(48 * hour - 1);
  const payload = plantAction(plotAt(state));
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.post("/garden/water", user, payload)),
  );
  assert.ok(results.every((result) => result.wallet.water === 1));
  state = await f.state(user);
  assert.equal(plotAt(state).growth, 3);
  assert.equal(plotAt(state).plantId, plant.plantId);
  assert.equal(
    plotAt(state).waterDueAt,
    new Date(f.time + 48 * hour).toISOString(),
  );
  assert.equal(plotAt(state).lastWateredAt, new Date(f.time).toISOString());
  f.advance(2 * hour);
  await f.restart();
  const retry = await f.post("/garden/water", user, payload);
  assert.deepEqual(plotAt(retry), plotAt(state));
  assert.deepEqual(retry.wallet, state.wallet);
  f.fund(user, 0, 0);
  await f.post("/garden/water", user, plantAction(plant), 409);
  assert.equal(
    plotAt(await f.state(user)).waterDueAt,
    plotAt(state).waterDueAt,
  );
});

test("archiving pauses exact remaining care time and restores a drawing for free after a long absence", async (t) => {
  const f = await fixture(t),
    user = await f.guest();
  f.fund(user, 2, 4);
  const plantPayload = {
    plotId: "plot-1",
    plantType: "doodle",
    doodle: drawing,
    idempotencyKey: "archive-drawing-plant",
  };
  let state = await f.plant(user, plantPayload);
  state = await f.post("/garden/water", user, plantAction(plotAt(state)));
  state = await f.post("/garden/water", user, plantAction(plotAt(state)));
  const before = plotAt(state),
    wallet = state.wallet;
  f.advance(30 * hour);
  const archivePayload = plantAction(before);
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      f.post("/garden/archive", user, archivePayload),
    ),
  );
  state = results[0];
  assert.equal(state.archivedPlants.length, 1);
  const archived = state.archivedPlants[0];
  assert.equal(archived.id, before.plantId);
  assert.equal(archived.plantId, before.plantId);
  assert.equal(archived.careRemainingMs, 18 * hour);
  assert.equal(archived.archivedAt, new Date(f.time).toISOString());
  assert.equal(archived.waterDueAt, undefined);
  assert.deepEqual(archived.doodle, drawing);
  assert.deepEqual(plotAt(state), {
    id: "plot-1",
    plantType: null,
    growth: 0,
    position: before.position,
  });
  assert.deepEqual(state.wallet, wallet);
  assert.deepEqual((await f.request("/export", user)).data.archivedPlants, [
    archived,
  ]);
  f.advance(180 * 24 * hour);
  await f.restart();
  assert.deepEqual((await f.state(user)).archivedPlants, [archived]);
  await f.post("/garden/plant", user, plantPayload);
  assert.equal(plotAt(await f.state(user)).plantType, null);
  const restorePayload = {
    archiveId: archived.id,
    plotId: "plot-2",
    idempotencyKey: randomUUID(),
  };
  state = await f.post("/garden/restore", user, restorePayload);
  const restored = plotAt(state, "plot-2");
  assert.equal(restored.plantId, before.plantId);
  assert.equal(restored.plantType, before.plantType);
  assert.equal(restored.growth, before.growth);
  assert.equal(restored.plantedAt, before.plantedAt);
  assert.equal(restored.lastWateredAt, before.lastWateredAt);
  assert.deepEqual(restored.doodle, before.doodle);
  assert.equal(restored.waterDueAt, new Date(f.time + 18 * hour).toISOString());
  assert.equal(restored.archivedAt, undefined);
  assert.equal(restored.careRemainingMs, undefined);
  assert.equal(plantCareStatus(restored, f.time), "thirsty");
  assert.deepEqual(state.archivedPlants, []);
  assert.deepEqual(state.wallet, wallet);
  f.advance(3 * hour);
  await f.restart();
  await f.post("/garden/restore", user, restorePayload);
  await f.post("/garden/archive", user, archivePayload);
  const replayed = await f.state(user);
  assert.deepEqual(replayed.plots, state.plots);
  assert.deepEqual(replayed.archivedPlants, []);
  assert.deepEqual(replayed.wallet, wallet);
  f.advance(15 * hour);
  await f.post("/garden/water", user, plantAction(restored), 409);
});

test("restore validates explicit positions and ownership, but finds a free position when an empty plot's old spot is occupied", async (t) => {
  const f = await fixture(t),
    user = await f.guest(),
    stranger = await f.guest();
  f.fund(user);
  let state = await f.plant(user, { plantType: "tulip" });
  state = await f.post("/garden/archive", user, plantAction(plotAt(state)));
  const archiveId = state.archivedPlants[0].id;
  state = await f.plant(user, { plotId: "plot-2" });
  const other = plotAt(state, "plot-2");
  state = await f.post("/garden/move", user, {
    plotId: other.id,
    plantId: other.plantId,
    position: DEFAULT_POSITIONS[0],
  });
  const before = state;
  const payload = { archiveId, plotId: "plot-1", idempotencyKey: randomUUID() };
  await f.post("/garden/restore", stranger, payload, 404);
  await f.post("/garden/restore", user, { ...payload, plotId: "plot-2" }, 409);
  await f.post(
    "/garden/restore",
    user,
    { ...payload, position: { x: 0.01, y: 0.01 } },
    400,
  );
  await f.post(
    "/garden/restore",
    user,
    { ...payload, position: DEFAULT_POSITIONS[0] },
    409,
  );
  const unchanged = await f.state(user);
  assert.deepEqual(unchanged.plots, before.plots);
  assert.deepEqual(unchanged.archivedPlants, before.archivedPlants);
  assert.deepEqual(unchanged.wallet, before.wallet);
  // Restoring an owned plant does not require re-earning its unlock or a seed.
  f.fund(user, 0, 0, 0);
  state = await f.post("/garden/restore", user, payload);
  const restored = plotAt(state);
  assert.equal(restored.plantType, "tulip");
  assert.notDeepEqual(restored.position, DEFAULT_POSITIONS[0]);
  assert.equal(isPlantablePosition(restored.position), true);
  assert.equal(
    hasPlantSpace(state.plots, restored.position, restored.id),
    true,
  );
  assert.equal(state.wallet.seeds, 0);
  assert.equal(state.wallet.water, 0);
  await f.post("/garden/restore", user, { ...payload, plotId: "plot-3" }, 409);
  assert.deepEqual((await f.state(user)).plots, state.plots);
});

test("competing restores preserve the unplaced archive and never overwrite an occupied plot", async (t) => {
  const f = await fixture(t),
    user = await f.guest();
  f.fund(user);
  let state = await f.plant(user);
  state = await f.post("/garden/archive", user, plantAction(plotAt(state)));
  state = await f.plant(user, { plantType: "cactus" });
  state = await f.post("/garden/archive", user, plantAction(plotAt(state)));
  const before = state;
  const results = await Promise.all(
    state.archivedPlants.map((plant) =>
      f.request("/garden/restore", user, "POST", {
        archiveId: plant.id,
        plotId: "plot-3",
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  state = await f.state(user);
  assert.equal(state.archivedPlants.length, 1);
  assert.equal(state.plots.filter((plot) => plot.plantType).length, 1);
  assert.equal(
    new Set([state.archivedPlants[0].plantId, plotAt(state, "plot-3").plantId])
      .size,
    2,
  );
  assert.deepEqual(state.wallet, before.wallet);
});

test("clearing is free and stale actions cannot affect a replacement plant", async (t) => {
  const f = await fixture(t),
    user = await f.guest();
  f.fund(user, 2, 2);
  let state = await f.plant(user, { plantType: "doodle", doodle: drawing });
  const old = plotAt(state);
  f.advance(48 * hour);
  const clearPayload = plantAction(old);
  state = await f.post("/garden/clear", user, clearPayload);
  assert.deepEqual(plotAt(state), {
    id: old.id,
    plantType: null,
    growth: 0,
    position: old.position,
  });
  assert.equal(state.wallet.seeds, 1);
  state = await f.plant(user, { plantType: "cactus" });
  const replacement = plotAt(state),
    before = state;
  assert.notEqual(replacement.plantId, old.plantId);
  await f.post("/garden/clear", user, clearPayload);
  await f.post("/garden/clear", user, plantAction(old), 409);
  await f.post("/garden/replant", user, plantAction(old), 409);
  await f.post("/garden/archive", user, plantAction(old), 409);
  await f.post("/garden/water", user, plantAction(old), 409);
  await f.post(
    "/garden/move",
    user,
    { plotId: old.id, plantId: old.plantId, position: DEFAULT_POSITIONS[4] },
    409,
  );
  state = await f.state(user);
  assert.deepEqual(state.plots, before.plots);
  assert.deepEqual(state.wallet, before.wallet);
  f.advance(48 * hour);
  f.fund(user, 0, 0);
  state = await f.post("/garden/clear", user, plantAction(replacement));
  assert.equal(plotAt(state).plantType, null);
  assert.equal(state.wallet.seeds, 0);
});

test("replanting requires one seed, creates a fresh instance, and preserves species, artwork and position once", async (t) => {
  const f = await fixture(t),
    user = await f.guest();
  f.fund(user, 1, 3);
  let state = await f.plant(user, {
    plantType: "doodle",
    doodle: drawing,
    position: DEFAULT_POSITIONS[5],
  });
  for (let index = 0; index < 3; index++)
    state = await f.post("/garden/water", user, plantAction(plotAt(state)));
  const old = plotAt(state);
  f.advance(48 * hour);
  const payload = plantAction(old);
  await f.post("/garden/replant", user, payload, 409);
  assert.deepEqual(plotAt(await f.state(user)), old);
  f.fund(user, 1, 0);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.post("/garden/replant", user, payload)),
  );
  assert.ok(results.every((result) => result.wallet.seeds === 0));
  state = await f.state(user);
  const replacement = plotAt(state);
  assert.notEqual(replacement.plantId, old.plantId);
  assert.equal(replacement.plantType, old.plantType);
  assert.deepEqual(replacement.doodle, old.doodle);
  assert.deepEqual(replacement.position, old.position);
  assert.equal(replacement.growth, 0);
  assert.equal(replacement.lastWateredAt, undefined);
  assert.equal(replacement.plantedAt, new Date(f.time).toISOString());
  assert.equal(
    replacement.waterDueAt,
    new Date(f.time + 48 * hour).toISOString(),
  );
  await f.post("/garden/replant", user, plantAction(old), 409);
  f.advance(hour);
  await f.restart();
  const replayed = await f.post("/garden/replant", user, payload);
  assert.deepEqual(replayed.plots, state.plots);
  assert.deepEqual(replayed.wallet, state.wallet);
});

test("archive access and mutations are user scoped; export includes paused plants and deletion cascades lifecycle records", async (t) => {
  const f = await fixture(t),
    owner = await f.guest(),
    stranger = await f.guest();
  f.fund(owner);
  f.fund(stranger);
  const owned = await f.plant(owner);
  const foreign = await f.plant(stranger, { plantType: "cactus" });
  const plant = plotAt(owned),
    otherPlant = plotAt(foreign);
  for (const action of ["archive", "clear", "replant", "water"]) {
    await f.post(`/garden/${action}`, stranger, plantAction(plant), 409);
    await f.post(`/garden/${action}`, null, plantAction(plant), 401);
  }
  await f.post(
    "/garden/move",
    stranger,
    {
      plotId: plant.id,
      plantId: plant.plantId,
      position: DEFAULT_POSITIONS[4],
    },
    409,
  );
  await f.post(
    "/garden/archive",
    owner,
    { ...plantAction(plant), userId: stranger.id },
    400,
  );
  const archived = await f.post("/garden/archive", owner, plantAction(plant));
  assert.deepEqual((await f.state(stranger)).archivedPlants, []);
  await f.post(
    "/garden/restore",
    stranger,
    {
      archiveId: plant.plantId,
      plotId: "plot-2",
      idempotencyKey: randomUUID(),
    },
    404,
  );
  assert.deepEqual(
    (await f.request("/export", owner)).data.archivedPlants,
    archived.archivedPlants,
  );
  assert.equal(
    f.db
      .prepare("SELECT COUNT(*) n FROM garden_operations WHERE user_id=?")
      .get(owner.id).n,
    2,
  );
  assert.equal((await f.request("/account", owner, "DELETE")).status, 200);
  assert.equal(
    f.db
      .prepare("SELECT COUNT(*) n FROM garden_archives WHERE user_id=?")
      .get(owner.id).n,
    0,
  );
  assert.equal(
    f.db
      .prepare("SELECT COUNT(*) n FROM garden_operations WHERE user_id=?")
      .get(owner.id).n,
    0,
  );
  assert.equal((await f.request("/state", owner)).status, 401);
  assert.deepEqual(plotAt(await f.state(stranger)), otherPlant);
});
