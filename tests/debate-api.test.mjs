import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'debate-api-'));
  const app = createApp({ dbPath: join(directory, 'test.sqlite'), storageDir: join(directory, 'audio'), disableWorker: true, apiKey: '' });
  const server = await new Promise(resolve => { const server = app.app.listen(0, '127.0.0.1', () => resolve(server)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.close(); rmSync(directory, { recursive: true, force: true }); });
  async function request(path, token, body, method = body === undefined ? 'GET' : 'POST') {
    const audio = Buffer.isBuffer(body);
    const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': audio ? 'audio/wav' : 'application/json' }) }, body: body === undefined ? undefined : audio ? body : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  async function ok(...args) { const result = await request(...args); assert.ok(result.status < 300, JSON.stringify(result)); return result.body; }
  async function guest() { const { token } = await ok('/auth/guest', null, {}); await ok('/me', token, { timezone: 'Asia/Singapore', consent: { recording: true } }, 'PATCH'); return token; }
  return { app, request, ok, guest };
}

test('practice preparation route saves the rolled stance, validates notes and enforces ownership', async t => {
  const f = await fixture(t), token = await f.guest(), other = await f.guest();
  const input = { requestId: 'api-random-position', topicId: 'school-gardens', opponentId: 'ari', position: 'random' };
  const session = await f.ok('/debate/sessions', token, input);
  const path = `/debate/sessions/${session.id}/preparation`;
  assert.equal((await f.request(path, undefined, { action: 'reveal' })).status, 401);
  assert.equal((await f.request(path, other, { action: 'reveal' })).status, 404);
  const revealed = await f.ok(path, token, { action: 'reveal' });
  assert.equal((await f.ok('/debate/sessions', token, input)).position, session.position);
  assert.equal((await f.ok(path, token, { action: 'reveal' })).preparation.endsAt, revealed.preparation.endsAt);
  assert.equal((await f.request(path, token, { action: 'save', position: 'for' })).status, 400);
  const board = { version: 1, mode: 'notepad', notepad: 'A reason and an example', nodes: [], links: [], strokes: [] };
  const begun = await f.ok(path, token, { action: 'begin', planningBoard: board });
  assert.ok(begun.preparation.completedAt);
  assert.deepEqual((await f.ok(`/debate/sessions/${session.id}`, token)).preparation.planningBoard, board);
});

test('installed debate routes require authentication and keep sessions, audio and results owner-scoped', async t => {
  const f = await fixture(t), token = await f.guest(), other = await f.guest();
  assert.equal((await f.request('/debate/catalog')).status, 401);
  assert.equal((await f.request('/debate/history')).status, 401);
  const catalog = await f.ok('/debate/catalog', token);
  assert.equal(catalog.providerMode, 'local'); assert.equal(catalog.tournamentAvailable, false);
  assert.equal(catalog.stages.length, 3); assert.equal(catalog.opponents.length, 6);
  assert.equal(catalog.tournamentTopics.length, 6);
  assert.deepEqual(catalog.tournamentOpponents.map(opponent => opponent.id), [catalog.boss.id]);
  assert.equal(catalog.rules.rounds, 1);
  assert.equal(catalog.boss.fictional, true);
  const session = await f.ok('/debate/sessions', token, { requestId: 'api-create-1', mode: 'practice', topicId: catalog.topics[0].id, opponentId: catalog.opponents[0].id, position: 'for' });
  assert.equal((await f.request(`/debate/sessions/${session.id}`, other)).status, 404);
  assert.equal((await f.request(`/debate/sessions/${session.id}`, other, undefined, 'DELETE')).status, 404);
  assert.equal((await f.request('/debate/sessions', token, { requestId: 'forged-create', mode: 'practice', topicId: catalog.topics[0].id, opponentId: catalog.opponents[0].id, position: 'for', reward: 500 })).status, 400);
  const recording = await f.ok('/audio', token, Buffer.alloc(100, 1));
  const transcription = await f.ok(`/audio/${recording.id}/transcribe`, token, {});
  assert.equal(transcription.requiresManualTranscription, true);
  const otherRecording = await f.ok('/audio', other, Buffer.alloc(100, 1));
  const opening = { requestId: 'api-opening-1', stage: 'opening', text: 'A school garden can support practical learning when the space is accessible.', audioId: otherRecording.id };
  assert.equal((await f.request(`/debate/sessions/${session.id}/turns`, token, opening)).status, 404);
  opening.audioId = recording.id;
  let saved = await f.ok(`/debate/sessions/${session.id}/turns`, token, opening);
  assert.equal(saved.turns[0].audioId, recording.id); assert.equal(saved.turns[0].requestHash, undefined);
  assert.equal((await f.ok(`/debate/sessions/${session.id}/turns`, token, opening)).turns.length, 2);
  saved = await f.ok(`/debate/sessions/${session.id}/turns`, token, { requestId: 'api-rebuttal-1', stage: 'rebuttal', text: 'Your concern about maintenance matters. A voluntary rota could share that work without requiring every student to participate.' });
  saved = await f.ok(`/debate/sessions/${session.id}/turns`, token, { requestId: 'api-closing-1', stage: 'closing', text: 'I support this option where a school can maintain access and share the work fairly.' });
  assert.equal(saved.status, 'ready_to_judge');
  const before = await f.ok('/gamification', token);
  const completed = await f.ok(`/debate/sessions/${session.id}/finish`, token, {});
  assert.equal(completed.evaluation.provider, 'local'); assert.equal(completed.evaluation.uncertain, true);
  assert.equal(completed.evaluation.outcome, 'draw'); assert.equal(completed.reward.coinsGranted, 3);
  assert.deepEqual(completed.evaluation.totals, { user: null, ai: null });
  assert.match(completed.evaluation.explanation, /No AI judge ran/);
  assert.match(completed.evaluation.explanation, /unscored/);
  assert.doesNotMatch(completed.evaluation.explanation, /uncertain draw/);
  const repeated = await f.ok(`/debate/sessions/${session.id}/finish`, token, {});
  assert.equal(repeated.reward.ledgerTransactionId, completed.reward.ledgerTransactionId);
  const after = await f.ok('/gamification', token);
  assert.equal(after.coins - before.coins, 3);
  assert.equal((await f.ok('/debate/history', other)).sessions.length, 0);
  assert.equal((await f.ok('/debate/history', token)).sessions[0].evaluation.provider, 'local');
  assert.equal((await f.ok('/debate/history', token)).sessions[0].evaluation.explanation, completed.evaluation.explanation);
  assert.equal((await f.request('/debate/tournaments', token, { requestId: 'api-tournament', topicId: catalog.topics[0].id, position: 'for' })).status, 503);
  await f.ok(`/debate/sessions/${session.id}`, token, undefined, 'DELETE');
  assert.equal((await f.request(`/debate/sessions/${session.id}`, token)).status, 404);
});
