import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import {
  DEFAULT_POSITIONS,
  GARDEN_BOUNDARY,
  isPlantablePosition,
  hasPlantSpace,
} from "../shared/garden-layout.mjs";

const basicDrawing = {
  strokes: [
    {
      color: "#D95D87",
      points: [
        { x: 0.2, y: 0.3 },
        { x: 0.5, y: 0.7 },
      ],
    },
  ],
};
async function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), "garden-placement-"));
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
  async function request(path, user, method = "GET", body) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  async function guest() {
    const result = await request("/auth/guest", null, "POST");
    return { token: result.data.token, id: result.data.profile.id };
  }
  function fund(user, seeds = 5, xp = 0) {
    service.db
      .prepare("UPDATE users SET wallet=?,xp=? WHERE id=?")
      .run(JSON.stringify({ seeds, water: 5, sunlight: 4 }), xp, user.id);
  }
  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    service.close();
  }
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    request,
    guest,
    fund,
    get service() {
      return service;
    },
    async restart() {
      await stop();
      await start();
    },
  };
}

test("all twelve default positions are safely inside the shared island and mutually spaced", async (t) => {
  const f = await setup(t),
    user = await f.guest();
  const state = (await f.request("/state", user)).data;
  assert.equal(state.plots.length, 12);
  assert.equal(DEFAULT_POSITIONS.length, 12);
  for (const [index, plot] of state.plots.entries()) {
    assert.deepEqual(plot.position, DEFAULT_POSITIONS[index]);
    assert.equal(isPlantablePosition(plot.position), true);
    const others = state.plots
      .filter((p) => p.id !== plot.id)
      .map((p) => ({ ...p, plantType: "daisy" }));
    assert.equal(hasPlantSpace(others, plot.position), true);
  }
  const planted = await f.request("/garden/plant", user, "POST", {
    plotId: "plot-1",
    plantType: "daisy",
  });
  assert.equal(planted.status, 200);
  assert.deepEqual(planted.data.plots[0].position, DEFAULT_POSITIONS[0]);
  assert.equal(planted.data.wallet.seeds, 0);
});

test("legacy gardens acquire twelve positions without losing plants, currency, growth or dates", async (t) => {
  const f = await setup(t),
    user = await f.guest();
  const oldPlots = Array.from({ length: 6 }, (_, i) => ({
    id: `plot-${i + 1}`,
    plantType: i === 0 ? "lavender" : null,
    growth: i === 0 ? 3 : 0,
    ...(i === 0
      ? {
          plantedAt: "2026-01-01T00:00:00Z",
          lastWateredAt: "2026-01-02T00:00:00Z",
        }
      : {}),
  }));
  f.service.db
    .prepare("UPDATE users SET plots=?,wallet=?,xp=? WHERE id=?")
    .run(
      JSON.stringify(oldPlots),
      JSON.stringify({ seeds: 7, water: 8, sunlight: 9 }),
      123,
      user.id,
    );
  const state = (await f.request("/state", user)).data;
  assert.equal(state.plots.length, 12);
  assert.equal(state.plots[0].plantType, "lavender");
  assert.equal(state.plots[0].growth, 3);
  assert.equal(state.plots[0].lastWateredAt, oldPlots[0].lastWateredAt);
  assert.deepEqual(state.wallet, { seeds: 7, water: 8, sunlight: 9 });
  assert.equal(state.xp, 123);
  const persisted = JSON.parse(
    f.service.db.prepare("SELECT plots FROM users WHERE id=?").get(user.id)
      .plots,
  );
  assert.deepEqual(persisted, state.plots);
  await f.restart();
  assert.deepEqual((await f.request("/state", user)).data.plots, state.plots);
});

test("custom placement and free movement persist, preserve growth and survive exports and restart", async (t) => {
  const f = await setup(t),
    user = await f.guest();
  f.fund(user, 2);
  const position = { x: 0.54, y: 0.3 };
  const planted = await f.request("/garden/plant", user, "POST", {
    plotId: "plot-1",
    plantType: "daisy",
    position,
  });
  assert.equal(planted.status, 200);
  assert.deepEqual(planted.data.plots[0].position, position);
  const watered = await f.request("/garden/water", user, "POST", {
    plotId: "plot-1",
    idempotencyKey: "water-before-moving",
  });
  assert.equal(watered.status, 200);
  const destination = { x: 0.67, y: 0.72 };
  assert.equal(isPlantablePosition(destination), true);
  const moved = await f.request("/garden/move", user, "POST", {
    plotId: "plot-1",
    position: destination,
  });
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.data.wallet, watered.data.wallet);
  assert.equal(moved.data.plots[0].growth, 1);
  assert.equal(moved.data.plots[0].plantedAt, planted.data.plots[0].plantedAt);
  assert.deepEqual(moved.data.plots[0].position, destination);
  assert.equal(
    (
      await f.request("/garden/move", user, "POST", {
        plotId: "plot-1",
        position: destination,
      })
    ).status,
    200,
  );
  await f.restart();
  assert.deepEqual(
    (await f.request("/state", user)).data.plots[0].position,
    destination,
  );
  assert.deepEqual(
    (await f.request("/export", user)).data.plots[0].position,
    destination,
  );
});

test("island edges, gaps, collisions and empty plots are rejected atomically without spending resources", async (t) => {
  const f = await setup(t),
    user = await f.guest();
  f.fund(user, 5);
  const initial = (await f.request("/state", user)).data;
  for (const position of [
    { x: 0.01, y: 0.01 },
    { x: 0.25, y: 0.5 },
    { x: GARDEN_BOUNDARY[0][0], y: GARDEN_BOUNDARY[0][1] },
    { x: -0.1, y: 0.5 },
    { x: 0.5, y: 1.1 },
    { x: null, y: 0.5 },
  ]) {
    const invalid = await f.request("/garden/plant", user, "POST", {
      plotId: "plot-1",
      plantType: "daisy",
      position,
    });
    assert.equal(invalid.status, 400, JSON.stringify(invalid.data));
    assert.deepEqual(
      (await f.request("/state", user)).data.wallet,
      initial.wallet,
    );
  }
  const planted = await f.request("/garden/plant", user, "POST", {
    plotId: "plot-1",
    plantType: "daisy",
    position: DEFAULT_POSITIONS[0],
  });
  assert.equal(planted.status, 200);
  assert.equal(
    (
      await f.request("/garden/plant", user, "POST", {
        plotId: "plot-2",
        plantType: "daisy",
        position: {
          x: DEFAULT_POSITIONS[0].x + 0.02,
          y: DEFAULT_POSITIONS[0].y,
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/garden/move", user, "POST", {
        plotId: "plot-2",
        position: DEFAULT_POSITIONS[2],
      })
    ).status,
    400,
  );
  await f.request("/garden/plant", user, "POST", {
    plotId: "plot-2",
    plantType: "daisy",
  });
  const beforeMove = (await f.request("/state", user)).data;
  assert.equal(
    (
      await f.request("/garden/move", user, "POST", {
        plotId: "plot-2",
        position: DEFAULT_POSITIONS[0],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/garden/move", user, "POST", {
        plotId: "plot-1",
        position: { x: 0.25, y: 0.5 },
      })
    ).status,
    400,
  );
  const afterMove = (await f.request("/state", user)).data;
  assert.deepEqual(afterMove.wallet, beforeMove.wallet);
  assert.deepEqual(afterMove.plots, beforeMove.plots);
});

test("planting retries, concurrent collisions, seed and unlock gates are enforced per account", async (t) => {
  const f = await setup(t),
    user = await f.guest(),
    stranger = await f.guest();
  f.fund(user, 4);
  const payload = {
    plotId: "plot-1",
    plantType: "doodle",
    position: DEFAULT_POSITIONS[0],
    doodle: basicDrawing,
    idempotencyKey: "one-doodle-plant",
  };
  const attempts = await Promise.all(
    Array.from({ length: 5 }, () =>
      f.request("/garden/plant", user, "POST", payload),
    ),
  );
  assert.ok(attempts.every((a) => a.status === 200));
  assert.equal((await f.request("/state", user)).data.wallet.seeds, 3);
  assert.equal(
    (
      await f.request("/garden/plant", user, "POST", {
        ...payload,
        plotId: "plot-2",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/garden/plant", user, "POST", {
        ...payload,
        position: DEFAULT_POSITIONS[2],
      })
    ).status,
    409,
  );
  await f.request("/garden/move", user, "POST", {
    plotId: "plot-1",
    position: DEFAULT_POSITIONS[1],
  });
  const retriedAfterMove = await f.request(
    "/garden/plant",
    user,
    "POST",
    payload,
  );
  assert.equal(retriedAfterMove.status, 200);
  assert.deepEqual(
    retriedAfterMove.data.plots[0].position,
    DEFAULT_POSITIONS[1],
  );
  assert.equal(retriedAfterMove.data.wallet.seeds, 3);
  assert.equal(
    (
      await f.request("/garden/plant", user, "POST", {
        plotId: "plot-2",
        plantType: "sunflower",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/garden/move", stranger, "POST", {
        plotId: "plot-1",
        position: DEFAULT_POSITIONS[3],
      })
    ).status,
    400,
  );
  assert.deepEqual(
    (await f.request("/state", user)).data.plots[0].position,
    DEFAULT_POSITIONS[1],
  );
  assert.equal(
    (
      await f.request("/garden/plant", user, "POST", {
        plotId: "plot-2",
        plantType: "daisy",
        userId: stranger.id,
      })
    ).status,
    400,
  );
  const concurrent = await Promise.all(
    ["plot-2", "plot-3"].map((plotId) =>
      f.request("/garden/plant", user, "POST", {
        plotId,
        plantType: "daisy",
        position: DEFAULT_POSITIONS[3],
      }),
    ),
  );
  assert.equal(concurrent.filter((r) => r.status === 200).length, 1);
  assert.equal(concurrent.filter((r) => r.status === 409).length, 1);
  f.fund(user, 0, 90);
  assert.equal(
    (
      await f.request("/garden/plant", user, "POST", {
        plotId: "plot-4",
        plantType: "tulip",
        position: DEFAULT_POSITIONS[5],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/garden/move", null, "POST", {
        plotId: "plot-1",
        position: DEFAULT_POSITIONS[4],
      })
    ).status,
    401,
  );
});

test("foliage plants retain seed costs, exact XP gates, growth and positions across restart", async (t) => {
  const f = await setup(t),
    user = await f.guest();
  f.fund(user, 4);
  for (const [index, plantType] of ["fern", "cactus"].entries()) {
    const planted = await f.request("/garden/plant", user, "POST", {
      plotId: `plot-${index + 1}`,
      plantType,
      idempotencyKey: `plant-foliage-${plantType}`,
    });
    assert.equal(planted.status, 200, JSON.stringify(planted.data));
    assert.equal(planted.data.plots[index].plantType, plantType);
    assert.equal(planted.data.wallet.seeds, 3 - index);
  }
  for (const [index, plantType, xp] of [
    [2, "monstera", 30],
    [3, "bamboo", 60],
  ]) {
    f.fund(user, 4 - index, xp - 1);
    const before = (await f.request("/state", user)).data;
    const payload = {
      plotId: `plot-${index + 1}`,
      plantType,
      idempotencyKey: `plant-foliage-${plantType}`,
    };
    const locked = await f.request("/garden/plant", user, "POST", payload);
    assert.equal(locked.status, 409);
    assert.match(locked.data.error, new RegExp(`${xp} XP`));
    const after = (await f.request("/state", user)).data;
    assert.deepEqual(after.wallet, before.wallet);
    assert.deepEqual(after.plots, before.plots);
    f.fund(user, 4 - index, xp);
    const planted = await f.request("/garden/plant", user, "POST", payload);
    assert.equal(planted.status, 200, JSON.stringify(planted.data));
    assert.equal(planted.data.wallet.seeds, 3 - index);
    assert.equal(planted.data.plots[index].plantType, plantType);
    const retry = await f.request("/garden/plant", user, "POST", payload);
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.data.wallet, planted.data.wallet);
  }
  for (let i = 1; i <= 4; i++) {
    const watered = await f.request("/garden/water", user, "POST", {
      plotId: `plot-${i}`,
    });
    assert.equal(watered.status, 200);
    assert.equal(watered.data.plots[i - 1].growth, 1);
    assert.equal(watered.data.wallet.water, 5 - i);
  }
  const beforeMove = (await f.request("/state", user)).data;
  const moved = await f.request("/garden/move", user, "POST", {
    plotId: "plot-1",
    position: DEFAULT_POSITIONS[8],
  });
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.data.wallet, beforeMove.wallet);
  assert.equal(moved.data.plots[0].growth, 1);
  assert.deepEqual(moved.data.plots[0].position, DEFAULT_POSITIONS[8]);
  assert.equal(
    (
      await f.request("/garden/plant", user, "POST", {
        plotId: "plot-5",
        plantType: "fern",
      })
    ).status,
    409,
  );
  await f.restart();
  const saved = (await f.request("/state", user)).data;
  assert.deepEqual(saved.plots, moved.data.plots);
  assert.deepEqual(saved.wallet, moved.data.wallet);
  assert.deepEqual((await f.request("/export", user)).data.plots, saved.plots);
});

test("foliage planting and unlocks stay scoped to the authenticated garden", async (t) => {
  const f = await setup(t),
    owner = await f.guest(),
    stranger = await f.guest();
  f.fund(owner, 2, 60);
  const payload = {
    plotId: "plot-1",
    plantType: "bamboo",
    idempotencyKey: "shared-foliage-key",
  };
  assert.equal(
    (await f.request("/garden/plant", owner, "POST", payload)).status,
    200,
  );
  const ownerBefore = (await f.request("/state", owner)).data;
  assert.equal(
    (await f.request("/garden/plant", stranger, "POST", payload)).status,
    409,
  );
  assert.equal(
    (
      await f.request("/garden/plant", stranger, "POST", {
        ...payload,
        userId: owner.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request("/garden/move", stranger, "POST", {
        plotId: "plot-1",
        position: DEFAULT_POSITIONS[8],
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.request("/garden/water", stranger, "POST", { plotId: "plot-1" }))
      .status,
    400,
  );
  assert.equal(
    (
      await f.request("/garden/plant", null, "POST", {
        ...payload,
        plantType: "fern",
      })
    ).status,
    401,
  );
  const ownPlant = await f.request("/garden/plant", stranger, "POST", {
    ...payload,
    plantType: "cactus",
  });
  assert.equal(ownPlant.status, 200);
  assert.equal(ownPlant.data.plots[0].plantType, "cactus");
  assert.equal(ownPlant.data.wallet.seeds, 0);
  const ownerAfter = (await f.request("/state", owner)).data;
  assert.deepEqual(ownerAfter.plots, ownerBefore.plots);
  assert.deepEqual(ownerAfter.wallet, ownerBefore.wallet);
});

test("drawing bounds reject malformed or excessive data and valid maximum drawings remain editable plants", async (t) => {
  const f = await setup(t),
    user = await f.guest();
  f.fund(user, 3);
  const stroke = basicDrawing.strokes[0];
  const bad = [
    undefined,
    { strokes: [] },
    { strokes: Array.from({ length: 25 }, () => stroke) },
    { strokes: [{ ...stroke, points: [stroke.points[0]] }] },
    { strokes: [{ ...stroke, color: "#000000" }] },
    { strokes: [{ ...stroke, width: 20 }] },
    {
      strokes: [
        {
          ...stroke,
          points: [
            { x: -0.1, y: 0.2 },
            { x: 0.5, y: 0.5 },
          ],
        },
      ],
    },
    {
      strokes: [
        {
          ...stroke,
          points: Array.from({ length: 121 }, () => ({ x: 0.5, y: 0.5 })),
        },
      ],
    },
    {
      strokes: Array.from({ length: 11 }, () => ({
        ...stroke,
        points: Array.from({ length: 120 }, () => ({ x: 0.5, y: 0.5 })),
      })),
    },
  ];
  for (const doodle of bad) {
    const result = await f.request("/garden/plant", user, "POST", {
      plotId: "plot-1",
      plantType: "doodle",
      doodle,
    });
    assert.equal(result.status, 400, JSON.stringify(result.data));
    assert.equal((await f.request("/state", user)).data.wallet.seeds, 3);
  }
  const largest = {
    strokes: Array.from({ length: 10 }, (_, j) => ({
      color: "#9B83BA",
      points: Array.from({ length: 120 }, (_, i) => ({
        x: (i + 1) / 121,
        y: (j + 1) / 11,
      })),
    })),
  };
  assert.ok(
    JSON.stringify(largest).length > 48000,
    "Exercise the drawing-specific JSON body limit",
  );
  const planted = await f.request("/garden/plant", user, "POST", {
    plotId: "plot-1",
    plantType: "doodle",
    doodle: largest,
    idempotencyKey: "largest-valid-drawing",
  });
  assert.equal(planted.status, 200, JSON.stringify(planted.data));
  assert.deepEqual(planted.data.plots[0].doodle, largest);
  assert.equal(planted.data.wallet.seeds, 2);
  const moved = await f.request("/garden/move", user, "POST", {
    plotId: "plot-1",
    position: DEFAULT_POSITIONS[8],
  });
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.data.plots[0].doodle, largest);
  const watered = await f.request("/garden/water", user, "POST", {
    plotId: "plot-1",
    idempotencyKey: "water-custom-flower",
  });
  assert.equal(watered.data.plots[0].growth, 1);
  await f.restart();
  assert.deepEqual(
    (await f.request("/export", user)).data.plots[0].doodle,
    largest,
  );
});
