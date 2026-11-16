import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';

test('room HTTP routes authenticate, isolate accounts, reject client prices and export/delete owned data', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bridgingminds-room-test-'));
  const service = createApp({ dbPath: join(directory, 'test.sqlite'), storageDir: join(directory, 'audio'), apiKey: '', disableWorker: true });
  await service.ready;
  const server = await new Promise(resolve => { const listener = service.app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await service.close(); await rm(directory, { recursive: true, force: true }); });
  async function request(path, token, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  for (const [path, method, body] of [['/room', 'GET'], ['/room/layout', 'PUT', { version: 1, placements: [] }], ['/room/purchase', 'POST', { itemId: 'ceramic-plant', requestId: 'private' }]])
    assert.equal((await request(path, null, method, body)).status, 401);
  const owner = (await request('/auth/guest', null, 'POST', {})).data;
  const stranger = (await request('/auth/guest', null, 'POST', {})).data;
  service.db.prepare('UPDATE users SET wallet=? WHERE id=?').run('{"seeds":50,"water":0,"sunlight":0}', owner.profile.id);
  const initial = await request('/room', owner.token);
  assert.equal(initial.status, 200); assert.equal(initial.data.coins, 50);
  for (const extra of [{ price: 1 }, { coinsSpent: 0 }, { userId: stranger.profile.id }])
    assert.equal((await request('/room/purchase', owner.token, 'POST', { itemId: 'ceramic-plant', requestId: 'safe-purchase', ...extra })).status, 400);
  const bought = await request('/room/purchase', owner.token, 'POST', { itemId: 'ceramic-plant', requestId: 'safe-purchase' });
  assert.equal(bought.status, 200); assert.equal(bought.data.room.coins, 38);
  assert.equal((await request('/room/purchase', stranger.token, 'POST', { itemId: 'ceramic-plant', requestId: 'safe-purchase' })).status, 409);
  assert.ok(!(await request('/room', stranger.token)).data.ownedItemIds.includes('ceramic-plant'));
  const placements = [{ itemId: 'ceramic-plant', x: 4, y: 4, rotation: 0 }];
  const saved = await request('/room/layout', owner.token, 'PUT', { version: 1, placements });
  assert.equal(saved.status, 200); assert.equal(saved.data.version, 2);
  const stale = await request('/room/layout', owner.token, 'PUT', { version: 1, placements: [] });
  assert.equal(stale.status, 409); assert.equal(stale.data.code, 'room_version_conflict');
  assert.deepEqual((await request('/room', owner.token)).data.placements, placements);
  const exported = await request('/account/export', owner.token);
  assert.deepEqual(exported.data.roomData.state.placements, placements);
  assert.equal(exported.data.roomData.purchases.length, 1);
  assert.equal((await request('/account', owner.token, 'DELETE')).status, 200);
  assert.equal(service.db.prepare('SELECT COUNT(*) n FROM room_inventory WHERE user_id=?').get(owner.profile.id).n, 0);
  assert.equal((await request('/room', stranger.token)).status, 200);
});
