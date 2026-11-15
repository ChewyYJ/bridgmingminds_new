import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';

test('wardrobe purchase HTTP boundary authenticates, rejects prices and saves an owned item once', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'wardrobe-purchase-'));
  const service = createApp({ dbPath: join(directory, 'test.sqlite'), storageDir: join(directory, 'audio'), apiKey: '', disableWorker: true });
  await service.ready;
  const server = await new Promise(resolve => { const listener = service.app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await service.close(); await rm(directory, { recursive: true, force: true }); });
  async function request(path, token, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  const payload = { itemId: 'girl-jacket-sage-cropped', requestId: 'http-purchase' };
  assert.equal((await request('/avatar/purchase', null, payload)).status, 401);
  const owner = (await request('/auth/guest', null, {})).data;
  service.db.prepare('UPDATE users SET wallet=? WHERE id=?').run('{"seeds":500,"water":0,"sunlight":0}', owner.profile.id);
  const before = (await request('/gamification', owner.token)).data;
  assert.equal(before.catalog.find(item => item.id === payload.itemId).price, 400);
  for (const extra of [{ price: 1 }, { coinsSpent: 0 }, { userId: 'foreign-owner' }])
    assert.equal((await request('/avatar/purchase', owner.token, { ...payload, ...extra })).status, 400);
  const results = await Promise.all([request('/avatar/purchase', owner.token, payload), request('/avatar/purchase', owner.token, payload)]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(results.filter(result => !result.data.alreadyProcessed).length, 1);
  assert.equal(new Set(results.map(result => result.data.transactionId)).size, 1);
  assert.ok(results.every(result => result.data.state.coins === 100 && result.data.state.avatar.ownedItemIds.includes(payload.itemId)));
  assert.deepEqual(results[0].data.state.avatar.selection, before.avatar.selection);
  assert.equal((await request('/avatar/purchase', owner.token, { ...payload, itemId: 'girl-hat-wool-beret' })).status, 409);
  assert.equal((await request('/avatar/purchase', owner.token, { itemId: 'girl-hat-wool-beret', requestId: 'cannot-afford' })).status, 409);
  const stranger = (await request('/auth/guest', null, {})).data;
  assert.equal((await request('/avatar/purchase', stranger.token, payload)).status, 409);
  assert.equal((await request('/gamification', stranger.token)).data.avatar.ownedItemIds.includes(payload.itemId), false);
  const exported = (await request('/account/export', owner.token)).data;
  assert.equal(exported.gamificationData.ledger.filter(row => row.activity_type === 'avatar_purchase' && row.coins_delta < 0).length, 1);
});
