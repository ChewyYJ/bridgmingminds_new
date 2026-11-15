import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { silentWav } from './helpers/silent-wav.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'role3-learning-'));
  const service = createApp({ dbPath: join(directory, 'test.sqlite'), storageDir: join(directory, 'audio'), apiKey: '', disableWorker: true });
  await service.ready;
  const server = await new Promise(resolve => { const listener = service.app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await service.close(); await rm(directory, { recursive: true, force: true }); });
  async function request(path, token, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  async function ok(...args) { const result = await request(...args); assert.ok(result.status < 300, JSON.stringify(result)); return result.data; }
  async function guest() {
    const { token } = await ok('/auth/guest', null, {});
    await ok('/me', token, { timezone: 'Asia/Singapore', onboardingComplete: true, consent: { recording: true, analytics: false } }, 'PATCH');
    await ok('/daily-workout/enroll', token, {});
    return token;
  }
  async function recording(token) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/audio`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav' }, body: silentWav(),
    });
    assert.equal(response.status, 201); return response.json();
  }
  return { service, request, ok, guest, recording, base: `http://127.0.0.1:${server.address().port}` };
}

test('updated learning flows fund one meal, retire old rewards and keep repeat requests atomic', async t => {
  const f = await fixture(t), token = await f.guest();
  assert.equal((await f.ok('/gamification', token)).coins, 0);
  const session = await f.ok('/sessions', token, { mode: 'spin_speak' });
  const audio = await f.recording(token);
  const attempt = await f.ok('/attempts', token, { sessionId: session.id, responseType: 'audio', audioId: audio.id, text: 'Parks help neighbours meet because shared spaces give people a chance to exchange ideas. For example, a weekly walk can help new residents feel welcome.', idempotencyKey: randomUUID() });
  await f.ok(`/attempts/${attempt.id}/evaluate`, token, {});
  await f.service.runJobs();
  const finished = await f.ok(`/attempts/${attempt.id}`, token);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.rewards.coins, 2);
  assert.equal(finished.rewards.xp, 15);
  const assignment = await f.ok('/read-aloud/assignment', token);
  const body = { idempotencyKey: randomUUID(), notes: 'I practised the final phrase and found a comfortable place to pause.', selfReviewConfirmed: true };
  const reading = await f.ok(`/read-aloud/assignments/${assignment.id}/submit`, token, body);
  assert.equal(reading.rewards.coins, 3);
  assert.equal(reading.rewards.xp, 0);
  await f.ok(`/read-aloud/assignments/${assignment.id}/submit`, token, body);
  const state = await f.ok('/state', token);
  assert.deepEqual(state.wallet, { coins: 5 });
  assert.equal(state.xp, 15);
  assert.equal(state.streak, 1);
  assert.ok(!('seeds' in finished.rewards));
  assert.equal(f.service.db.prepare('SELECT COUNT(*) n FROM reward_ledger').get().n, 0);
  assert.equal((await f.request('/garden/plant', token, { plotId: 'plot-1', plantType: 'daisy' })).status, 410);
  await f.ok('/avatar/care', token, { careEnabled: true }, 'PATCH');
  const purchase = { foodId: 'ramen', requestId: randomUUID() };
  const receipts = await Promise.all([f.ok('/food/purchase', token, purchase), f.ok('/food/purchase', token, purchase)]);
  assert.equal(receipts.filter(item => item.alreadyProcessed).length, 1);
  assert.equal(receipts[0].state.coins, 0);
  assert.equal(receipts[0].food.animation, 'eat');
  assert.equal((await f.ok('/state', token)).wallet.coins, 0);
  assert.equal((await f.request('/food/purchase', token, { foodId: 'bento', requestId: randomUUID() })).status, 409);
  const exported = await f.ok('/account/export', token);
  assert.ok(exported.gamificationData);
});

test('Role 3 HTTP mutations reject anonymous requests, unknown equipment and caller-chosen reward amounts', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/gamification')).status, 401);
  assert.equal((await f.request('/food/purchase', null, { foodId: 'ramen', requestId: randomUUID() })).status, 401);
  const token = await f.guest(), state = await f.ok('/gamification', token);
  assert.equal(state.catalog.length, 42);
  const locked = state.catalog.find(item => item.collection === state.avatar.selection.collection && !item.owned);
  const changed = { ...state.avatar.selection, [locked.category]: locked.id };
  assert.equal((await f.request('/avatar/equipment', token, { selection: changed }, 'PUT')).status, 403);
  const saved = await f.ok('/avatar/equipment', token, { selection: state.avatar.selection }, 'PUT');
  assert.deepEqual(saved.avatar.selection, state.avatar.selection);
  assert.equal((await f.request('/food/purchase', token, { foodId: 'ramen', requestId: randomUUID(), coins: 100 })).status, 400);
  assert.equal((await f.request('/gamification/rewards', token, { amount: 500 })).status, 404);
});

test('allowed cross-origin Expo web clients can preflight the avatar equipment PUT', async t => {
  const f = await fixture(t);
  const response = await fetch(`${f.base}/api/avatar/equipment`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type,authorization' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:8081');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.ok(response.headers.get('access-control-allow-methods').split(/,\s*/).includes('PUT'));
  const rejected = await fetch(`${f.base}/api/avatar/equipment`, {
    method: 'OPTIONS', headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'PUT' },
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});
