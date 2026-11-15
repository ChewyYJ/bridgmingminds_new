import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
    await service.close();
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


// Retirement must not keep applying the old 48-hour mutation/grace-period
// rules to historical gardens. Their deadlines and paused care stay archival.
test("historical expired plants retain deadlines and artwork across a long absence and restart",async t=>{
  const f=await fixture(t),user=await f.guest();f.fund(user,8,6,90);
  const plot={id:'plot-1',plantId:randomUUID(),plantType:'doodle',doodle:drawing,growth:3,
    position:DEFAULT_POSITIONS[0],plantedAt:new Date(start-hour).toISOString(),waterDueAt:new Date(start+47*hour).toISOString()};
  f.setPlots(user,[plot]); const before=await f.state(user);
  f.advance(400*hour);await f.restart();const after=await f.state(user);
  assert.deepEqual(after.plots,[plot]);assert.deepEqual(after.wallet,before.wallet);assert.equal(after.xp,before.xp);
  assert.equal(plantCareStatus(after.plots[0],f.time),'dead');
  for(const action of ['water','clear','replant','archive'])await f.post('/garden/'+action,user,plantAction(plot),410);
  assert.deepEqual((await f.state(user)).plots,[plot]);
});

test("old plants without a deadline are preserved without a new automatic care period",async t=>{
  const f=await fixture(t),user=await f.guest();
  const plot={id:'plot-1',plantId:randomUUID(),plantType:'tulip',growth:2,position:DEFAULT_POSITIONS[4]};
  f.setPlots(user,[plot]);
  const first=await f.state(user);assert.deepEqual(first.plots,[plot]);
  f.advance(1000*hour);await f.restart();assert.deepEqual((await f.state(user)).plots,[plot]);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM garden_operations').get().n,0);
});

test("paused archives cannot be restored, duplicated or deleted by old clients",async t=>{
  const f=await fixture(t),owner=await f.guest(),stranger=await f.guest();
  const id=randomUUID(),archived={id,plantId:id,plantType:'doodle',doodle:drawing,growth:3,remainingCareMs:17*hour,position:DEFAULT_POSITIONS[2]};
  f.db.prepare('INSERT INTO garden_archives VALUES(?,?,?,?)').run(id,owner.id,JSON.stringify(archived),new Date(start).toISOString());
  const before=await f.state(owner);f.advance(1000*hour);await f.restart();
  const body={archiveId:id,plotId:'plot-3',idempotencyKey:'old-restore-key'};
  const responses=await Promise.all([f.request('/garden/restore',owner,'POST',body),f.request('/garden/restore',owner,'POST',body),f.request('/garden/restore',stranger,'POST',body)]);
  assert.ok(responses.every(r=>r.status===410));
  const after=await f.state(owner);assert.deepEqual(after.archivedPlants,[archived]);assert.deepEqual(after.plots,before.plots);assert.deepEqual(after.wallet,before.wallet);
  assert.deepEqual((await f.state(stranger)).archivedPlants,[]);
});

test("legacy watering request receipts remain historical and never replay against Coins",async t=>{
  const f=await fixture(t),user=await f.guest();f.fund(user,5,4,30);
  const key='old-water-request',hash='historical-request-hash';
  f.db.prepare('INSERT INTO garden_operations VALUES(?,?,?,?)').run(user.id,key,hash,new Date(start).toISOString());
  const before=await f.state(user);
  for(const action of ['water','replant','clear'])await f.post('/garden/'+action,user,{plotId:'plot-1',plantId:randomUUID(),idempotencyKey:key},410);
  const receipt=f.db.prepare('SELECT * FROM garden_operations WHERE user_id=? AND request_key=?').get(user.id,key);
  assert.equal(receipt.request_hash,hash);assert.deepEqual((await f.state(user)).wallet,before.wallet);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM coin_ledger WHERE user_id=? AND activity_type!='legacy_conversion'").get(user.id).n,0);
});

test("legacy lifecycle exports are owned and account deletion cascades archived private records",async t=>{
  const f=await fixture(t),owner=await f.guest(),stranger=await f.guest();
  const id=randomUUID(),archive={id,plantId:id,plantType:'doodle',doodle:drawing,remainingCareMs:10*hour};
  f.db.prepare('INSERT INTO garden_archives VALUES(?,?,?,?)').run(id,owner.id,JSON.stringify(archive),new Date(start).toISOString());
  f.db.prepare('INSERT INTO garden_operations VALUES(?,?,?,?)').run(owner.id,'old-key','old-hash',new Date(start).toISOString());
  const exported=(await f.request('/export',owner)).data;assert.deepEqual(exported.archivedPlants,[archive]);
  assert.deepEqual((await f.request('/export',stranger)).data.archivedPlants,[]);
  assert.equal((await f.request('/export',null)).status,401);
  assert.equal((await f.request('/account',owner,'DELETE')).status,200);
  for(const table of ['garden_archives','garden_operations','legacy_currency_archives','economy_accounts'])
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE user_id=?').get(owner.id).n,0);
  assert.equal((await f.request('/state',owner)).status,401);assert.equal((await f.request('/state',stranger)).status,200);
});
