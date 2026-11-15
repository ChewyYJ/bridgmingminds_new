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
    await service.close();
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


// The garden is retired. These tests protect retained history, account scope,
// and rejection of every old spending/mutation endpoint instead of exercising
// a lifecycle that the product no longer offers.
test("historical layout helpers retain valid positions for exported garden data", () => {
  assert.equal(DEFAULT_POSITIONS.length, 12);
  for (const [index, position] of DEFAULT_POSITIONS.entries()) {
    assert.ok(isPlantablePosition(position));
    assert.ok(hasPlantSpace(DEFAULT_POSITIONS.filter((_, i) => i !== index).map((p, i) => ({ id: String(i), plantType: 'daisy', position: p })), position));
  }
});

test("legacy gardens remain byte-for-byte historical while only Seeds convert once", async t => {
  const f = await setup(t), user = await f.guest();
  const plots = [{ id: 'plot-1', plantId: 'saved-plant', plantType: 'lavender', growth: 3,
    plantedAt: '2026-01-01T00:00:00Z', lastWateredAt: '2026-01-02T00:00:00Z' }];
  f.service.db.prepare('UPDATE users SET plots=?,wallet=?,xp=? WHERE id=?').run(JSON.stringify(plots), JSON.stringify({ seeds: 7, water: 8, sunlight: 9 }), 123, user.id);
  const state = (await f.request('/state', user)).data;
  assert.deepEqual(state.plots, plots); assert.deepEqual(state.wallet, { coins: 7 }); assert.equal(state.xp, 123);
  const archive = f.service.db.prepare('SELECT * FROM legacy_currency_archives WHERE user_id=?').get(user.id);
  assert.deepEqual(JSON.parse(archive.wallet), { seeds: 7, water: 8, sunlight: 9 });
  assert.equal(archive.xp, 123);
  await f.restart();
  const after = (await f.request('/state', user)).data;
  assert.deepEqual(after.plots, plots); assert.deepEqual(after.wallet, state.wallet);
  assert.equal(f.service.db.prepare("SELECT COUNT(*) n FROM coin_ledger WHERE user_id=? AND activity_type='legacy_conversion'").get(user.id).n, 1);
});

for (const action of ['plant','move','water','decorate','archive','restore','clear','replant'])
  test('retired garden '+action+' rejects owner, stranger and duplicate mutations without spending', async t => {
    const f = await setup(t), owner = await f.guest(), stranger = await f.guest();
    f.fund(owner, 8, 90); f.fund(stranger, 3, 10);
    const plots = [{ id:'plot-1',plantId:'saved-owned-plant',plantType:'daisy',growth:3,position:DEFAULT_POSITIONS[0] }];
    f.service.db.prepare('UPDATE users SET plots=? WHERE id=?').run(JSON.stringify(plots), owner.id);
    const before = (await f.request('/state',owner)).data, other = (await f.request('/state',stranger)).data;
    const body = { plotId:'plot-1',plantId:'saved-owned-plant',plantType:'tulip',archiveId:'saved-owned-plant',decoration:'birdbath',position:DEFAULT_POSITIONS[1],idempotencyKey:'old-device-retry' };
    const responses = await Promise.all([f.request('/garden/'+action,owner,'POST',body),f.request('/garden/'+action,owner,'POST',body),f.request('/garden/'+action,stranger,'POST',body)]);
    assert.ok(responses.every(r=>r.status===410));
    assert.equal((await f.request('/garden/'+action,null,'POST',body)).status,401);
    const after = (await f.request('/state',owner)).data;
    assert.deepEqual(after.plots,before.plots);assert.deepEqual(after.wallet,before.wallet);assert.equal(after.xp,before.xp);
    assert.deepEqual((await f.request('/state',stranger)).data.wallet,other.wallet);
    assert.equal(f.service.db.prepare('SELECT COUNT(*) n FROM garden_operations').get().n,0);
  });

test("retirement rejects malformed and maximum legacy drawings without saving or spending", async t => {
  const f=await setup(t), user=await f.guest(); f.fund(user);
  const before=(await f.request('/state',user)).data;
  for(const doodle of [null,{},basicDrawing,{strokes:[{color:'unknown',points:[{x:99,y:-1}]}]}]) {
    const result=await f.request('/garden/plant',user,'POST',{plotId:'plot-1',plantType:'doodle',doodle});
    assert.equal(result.status,410);
  }
  const after=(await f.request('/state',user)).data;
  assert.deepEqual(after.plots,before.plots);assert.deepEqual(after.wallet,before.wallet);
});

test("saved artwork and positions survive account export and remain private across login",async t=>{
  const f=await setup(t),owner=await f.guest(),other=await f.guest();
  const plots=[{id:'plot-1',plantId:'private-drawing',plantType:'doodle',doodle:basicDrawing,growth:2,position:DEFAULT_POSITIONS[3]}];
  f.service.db.prepare('UPDATE users SET plots=?,decorations=? WHERE id=?').run(JSON.stringify(plots),'["birdbath"]',owner.id);
  const exported=(await f.request('/export',owner)).data;
  assert.deepEqual(exported.plots,plots);assert.deepEqual(exported.decorations,['birdbath']);
  assert.ok(!JSON.stringify((await f.request('/export',other)).data).includes('private-drawing'));
  assert.equal((await f.request('/export',null)).status,401);
  await f.restart(); assert.deepEqual((await f.request('/export',owner)).data.plots,plots);
});
