import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openDatabase } from '../server/database.mjs';
import { createAIDebateService } from '../server/ai-debate.mjs';
import { validateDebateJudge, createDebateProvider } from '../server/debate-judge.mjs';
import { DEBATE_CRITERIA, DEBATE_STAGES, DEBATE_TOPICS, DEBATE_OPPONENTS, DEBATE_BOSS, SINGAPORE_DEBATE_TOPICS, decideDebateOutcome } from '../shared/debate.mjs';

const config = { apiKey: 'offline-test-key', textModel: 'gpt-6-luna', issues: [] };
const createInput = { requestId: 'create-request-1', mode: 'practice', topicId: 'school-gardens', opponentId: 'mina', position: 'for' };
const argumentsByStage = {
  opening: 'A shared garden gives students a practical reason to explain how plants grow. A small accessible raised bed could make this possible.',
  rebuttal: 'Your concern about maintaining the space is relevant. A voluntary class rota could share that work, while schools without space could choose containers.',
  closing: 'I still support a garden when the school can maintain an accessible space. The condition matters because a learning activity should be workable for its community.',
};
const singaporeArgumentsByStage = {
  opening: 'I support shared facilities when residents can reach and maintain them. A hypothetical common room could serve both older residents and students at different times.',
  rebuttal: 'The opportunity cost of land matters. I would start by sharing an existing room and publish a maintenance plan before proposing a new building.',
  closing: 'The priority should depend on resident needs, accessible routes and an affordable upkeep plan. A small trial would let residents compare this use with the strongest alternative.',
};
function judgeFixture(turns, { userScore = 3, aiScore = 2, uncertain = false, confidence = 'high' } = {}) {
  return { criteria: DEBATE_CRITERIA.map(({ key }) => ({ key, ...Object.fromEntries(['user', 'ai'].map(side => {
    const turn = turns.find(turn => turn.speaker === side && turn.stage === (key === 'rebuttal' ? 'rebuttal' : 'opening'));
    return [side, { score: side === 'user' ? userScore : aiScore, confidence, evidence: [{ turnId: turn.id, quote: turn.text.slice(0, 100) }],
      strength: 'The point can be identified in the saved exchange.', improvement: 'Explain the connection between this example and the claim.' }];
  })) })), uncertain, strengths: ['You address a practical concern.'], improvements: ['Explain why your condition resolves the concern.'] };
}
async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'debate-test-'));
  const path = join(directory, 'db.sqlite');
  let db = openDatabase(path), service, replyCalls = 0, judgeCalls = 0, awards = 0, failReply = false, failJudge = false, failReward = false, gate;
  const audio = new Map([['owned-audio', 'learner'], ['other-audio', 'other']]);
  const settings = { userScore: 3, aiScore: 2 };
  const rewardInputs = [], requests = [];
  const providerRequest = async (endpoint, request) => {
    assert.equal(endpoint, 'chat/completions');
    const body = JSON.parse(request.body), payload = JSON.parse(body.messages[1].content); requests.push(body);
    let raw;
    if (body.response_format.json_schema.name === 'bridgingminds_debate_reply_v1') {
      replyCalls++;
      if (gate) await gate;
      if (failReply) throw Object.assign(new Error('Offline simulated failure'), { status: 502, code: 'provider_unavailable' });
      raw = { text: `You argue that ${payload.latestTurn.text.slice(0, 90)}. My concern is whether that condition is workable for every school.`, respondsToQuote: payload.latestTurn.text.slice(0, 90) };
    } else {
      assert.match(body.messages[0].content, /SEPARATE neutral judge/);
      judgeCalls++;
      raw = judgeFixture(payload.turns, settings);
      if (failJudge) raw.criteria[0].user.evidence[0].quote = 'Fabricated quotation that was never said.';
    }
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] };
  };
  const createService = () => createAIDebateService({ db, providerConfig: options.local ? { ...config, apiKey: '' } : config,
    now: options.clock ?? (() => Date.parse('2026-11-15T10:00:00Z')), providerRequest,
    usage: { allowRequest: async () => {} },
    audioRoutes: { assertOwnAudio: async (id, uid) => { if (audio.get(id) !== uid) throw Object.assign(new Error('Recording not found'), { status: 404 }); return { id, user_id: uid }; } },
    awardValidatedCompletion: async (uid, input) => {
      awards++; rewardInputs.push(input);
      assert.equal(db.inTransaction(), true);
      await db.prepare('INSERT INTO reward_ledger(id,user_id,source_key,day,kind,data,created_at) VALUES(?,?,?,?,?,?,?)').run(`reward-${input.completionId}`, uid, input.eventId, '2026-11-15', 'ai_debate', JSON.stringify(input), input.completedAt);
      if (failReward) { failReward = false; throw new Error('Temporary reward failure'); }
      return { ledgerTransactionId: `reward-${input.completionId}`, coinsGranted: 3, xpGranted: 15, balance: 3, level: 1, streak: {}, unlockedItems: [], achievements: [], alreadyProcessed: false };
    },
  });
  for (const uid of ['learner', 'other']) await db.prepare('INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)').run(uid, JSON.stringify({ timezone: 'Asia/Singapore', consent: { recording: true } }), '{}', '[]', '2026-11-15T09:00:00Z');
  service = createService();
  t.after(async () => { await db.close(); rmSync(directory, { recursive: true, force: true }); });
  return { get service() { return service; }, get db() { return db; }, settings, rewardInputs, requests, audio,
    get calls() { return { replies: replyCalls, judges: judgeCalls, awards }; },
    setFailReply(value) { failReply = value; }, setFailJudge(value) { failJudge = value; }, setFailReward(value) { failReward = value; }, setGate(value) { gate = value; },
    async restart() { await db.close(); db = openDatabase(path); service = createService(); },
    async complete(session, responses = argumentsByStage) {
      for (const { id: stage } of DEBATE_STAGES) session = await service.submitTurn('learner', session.id, { requestId: `${session.id}-${stage}`, stage, text: responses[stage] });
      return service.finish('learner', session.id);
    },
  };
}

test('persistent three-stage debate responds to arguments, judges separately and awards once', async t => {
  const f = await fixture(t);
  let session = await f.service.create('learner', createInput);
  assert.equal(session.stage, 'opening'); assert.equal(session.internal, undefined);
  assert.equal((await f.service.create('learner', createInput)).id, session.id);
  await assert.rejects(f.service.create('learner', { ...createInput, position: 'against' }), { code: 'debate_request_conflict' });
  session = await f.complete(session);
  assert.equal(session.status, 'completed'); assert.equal(session.turns.length, 6);
  assert.equal(session.evaluation.outcome, 'win'); assert.equal(session.evaluation.criteria.length, 6);
  assert.equal(session.evaluation.totals.user, 18); assert.equal(session.reward.coinsGranted, 3);
  assert.ok(session.turns[1].text.includes(argumentsByStage.opening.slice(0, 90)));
  for (const criterion of session.evaluation.criteria) for (const side of ['user', 'ai']) for (const evidence of criterion[side].evidence) {
    const turn = session.turns.find(turn => turn.id === evidence.turnId);
    assert.equal(turn.speaker, side); assert.equal(turn.text.slice(evidence.start, evidence.end), evidence.quote);
  }
  assert.equal(f.rewardInputs[0].eligibleUnlockContext.judged, true);
  assert.equal(f.rewardInputs[0].amount, undefined); assert.equal(f.rewardInputs[0].coinsGranted, undefined);
  assert.match(f.rewardInputs[0].dedupeKey, /^debate:2026-11-15:school-gardens:mina$/);
  await f.restart();
  assert.deepEqual(await f.service.finish('learner', session.id), session);
  assert.deepEqual(f.calls, { replies: 3, judges: 1, awards: 1 });
  assert.equal((await f.service.history('learner')).sessions[0].id, session.id);
  assert.equal((await f.service.history('other')).sessions.length, 0);
});

test('owned audio, stage order, strict input and replay payloads are enforced', async t => {
  const f = await fixture(t), session = await f.service.create('learner', createInput);
  await assert.rejects(f.service.get('other', session.id), { status: 404 });
  await assert.rejects(f.service.submitTurn('other', session.id, { requestId: 'request-1', stage: 'opening', text: 'A useful point.' }), { status: 404 });
  await assert.rejects(f.service.create('learner', { ...createInput, coins: 1000 }), { status: 400 });
  for (const text of ['x', 'one two', 'same same same'])
    await assert.rejects(f.service.submitTurn('learner', session.id, { requestId: 'short-request', stage: 'opening', text }), { code: 'debate_input' });
  await assert.rejects(f.service.submitTurn('learner', session.id, { requestId: 'request-1', stage: 'closing', text: 'A useful point.' }), { code: 'debate_turn_order' });
  const input = { requestId: 'request-1', stage: 'opening', text: argumentsByStage.opening, audioId: 'other-audio' };
  await assert.rejects(f.service.submitTurn('learner', session.id, input), { status: 404 });
  assert.equal((await f.service.get('learner', session.id)).turns.length, 0);
  input.audioId = 'owned-audio';
  const saved = await f.service.submitTurn('learner', session.id, input);
  assert.equal(saved.turns[0].audioId, 'owned-audio');
  await assert.rejects(f.service.submitTurn('learner', session.id, { requestId: 'repeated-stage', stage: 'rebuttal', text: input.text.toUpperCase() }), { code: 'debate_response_repeated' });
  assert.deepEqual(await f.service.submitTurn('learner', session.id, input), saved);
  assert.equal(f.calls.replies, 1);
  await assert.rejects(f.service.submitTurn('learner', session.id, { ...input, text: 'Changed after replay.' }), { code: 'debate_request_conflict' });
  await assert.rejects(f.service.finish('learner', session.id), { code: 'debate_not_complete' });
});

test('provider failure preserves a turn across restart and only explicit recovery calls the provider again', async t => {
  const f = await fixture(t), session = await f.service.create('learner', createInput);
  const input = { requestId: 'opening-request', stage: 'opening', text: argumentsByStage.opening };
  f.setFailReply(true);
  await assert.rejects(f.service.submitTurn('learner', session.id, input), { code: 'provider_unavailable' });
  let saved = await f.service.get('learner', session.id);
  assert.equal(saved.status, 'awaiting_reply'); assert.equal(saved.turns.length, 1); assert.equal(saved.evaluation, null);
  await f.restart();
  saved = await f.service.submitTurn('learner', session.id, input);
  assert.equal(saved.turns.length, 1); assert.equal(f.calls.replies, 1);
  await assert.rejects(f.service.submitTurn('learner', session.id, { ...input, requestId: 'another-request' }), { code: 'debate_turn_order' });
  f.setFailReply(false);
  saved = await f.service.recover('learner', session.id);
  assert.equal(saved.stage, 'rebuttal'); assert.equal(saved.turns.length, 2); assert.equal(saved.recovery, null);
  await f.service.recover('learner', session.id); assert.equal(f.calls.replies, 2);
});

test('concurrent submissions admit one provider call and no duplicate learner turn', async t => {
  const f = await fixture(t), session = await f.service.create('learner', createInput);
  let release; f.setGate(new Promise(resolve => { release = resolve; }));
  const input = { requestId: 'opening-concurrent', stage: 'opening', text: argumentsByStage.opening };
  const first = f.service.submitTurn('learner', session.id, input);
  while (f.calls.replies === 0) await new Promise(resolve => setTimeout(resolve, 1));
  await assert.rejects(f.service.submitTurn('learner', session.id, input), { code: 'debate_busy' });
  release(); const result = await first;
  assert.equal(result.turns.length, 2); assert.equal(f.calls.replies, 1);
});

test('invalid judge evidence is recoverable and never creates an outcome or reward', async t => {
  const f = await fixture(t); let session = await f.service.create('learner', createInput);
  for (const { id: stage } of DEBATE_STAGES) session = await f.service.submitTurn('learner', session.id, { requestId: `turn-${stage}`, stage, text: argumentsByStage[stage] });
  f.setFailJudge(true);
  await assert.rejects(f.service.finish('learner', session.id), { code: 'debate_invalid_provider_response' });
  session = await f.service.get('learner', session.id);
  assert.equal(session.status, 'ready_to_judge'); assert.equal(session.evaluation, null); assert.equal(f.calls.awards, 0);
  f.setFailJudge(false); session = await f.service.finish('learner', session.id);
  assert.equal(session.status, 'completed'); assert.equal(f.calls.judges, 2); assert.equal(f.calls.awards, 1);
});

test('reward failure rolls back completion and reuses the saved validated judgement on retry', async t => {
  const f = await fixture(t); let session = await f.service.create('learner', createInput);
  for (const { id: stage } of DEBATE_STAGES) session = await f.service.submitTurn('learner', session.id, { requestId: `turn-${stage}`, stage, text: argumentsByStage[stage] });
  f.setFailReward(true);
  await assert.rejects(f.service.finish('learner', session.id), /Temporary reward failure/);
  assert.equal((await f.db.prepare('SELECT COUNT(*) count FROM reward_ledger').get()).count, 0);
  assert.equal((await f.service.get('learner', session.id)).status, 'ready_to_judge');
  await f.restart(); session = await f.service.finish('learner', session.id);
  assert.equal(session.status, 'completed'); assert.equal(f.calls.judges, 1);
  assert.equal((await f.db.prepare('SELECT COUNT(*) count FROM reward_ledger').get()).count, 1);
});

test('no-key local coaching is labelled, argument-aware, unscored and cannot start a competitive run', async t => {
  const f = await fixture(t, { local: true });
  assert.equal(f.service.catalog().tournamentAvailable, false);
  const session = await f.complete(await f.service.create('learner', createInput));
  assert.match(session.providerLabel, /Rule-based local/); assert.equal(session.evaluation.provider, 'local');
  assert.equal(session.evaluation.uncertain, true); assert.equal(session.evaluation.outcome, 'draw');
  assert.deepEqual(session.evaluation.totals, { user: null, ai: null });
  assert.match(session.evaluation.explanation, /rule-based local practice/);
  assert.match(session.evaluation.explanation, /No AI judge ran/);
  assert.doesNotMatch(session.evaluation.explanation, /uncertain draw|judge could not establish/);
  assert.ok(session.evaluation.criteria.every(item => item.user.score === null && item.ai.score === null));
  assert.ok(session.turns[1].text.includes(argumentsByStage.opening.slice(0, 100)));
  assert.equal(f.calls.replies, 0); assert.equal(f.calls.judges, 0);
  assert.equal(f.rewardInputs[0].eligibleUnlockContext.competitive, false);
  await assert.rejects(f.service.createTournament('learner', { requestId: 'tournament-1', topicId: 'school-gardens', position: 'for' }), { code: 'debate_tournament_unavailable' });
});

test('Singapore cup reaches the fictional final boss and completes only after a validated boss win', async t => {
  const f = await fixture(t), input = { requestId: 'tournament-1', topicId: 'sg-inclusive-housing', position: 'for' };
  let current = await f.service.createTournament('learner', input);
  assert.equal(current.run.title, 'Singapore Civic Cup');
  assert.deepEqual(current.run.bracket.map(opponent => opponent.id), ['mina', 'leo', 'chair-lin']);
  assert.equal((await f.service.createTournament('learner', input)).run.id, current.run.id);
  await assert.rejects(f.service.advance('learner', current.run.id, { requestId: 'early-advance' }), { code: 'debate_progression' });
  for (let round = 1; round <= 3; round++) {
    assert.equal(current.session.round, round);
    if (round === 3) {
      assert.equal(current.session.opponent.id, 'chair-lin');
      assert.equal(current.session.opponent.fictional, true);
      f.setFailJudge(true);
      await assert.rejects(f.complete(current.session, singaporeArgumentsByStage), { code: 'debate_invalid_provider_response' });
      assert.equal((await f.service.tournament('learner', current.run.id)).run.status, 'active');
      assert.equal(f.calls.awards, 2, 'an invalid boss judgement cannot complete or reward the final');
      f.setFailJudge(false);
      await f.service.finish('learner', current.session.id);
    } else await f.complete(current.session, singaporeArgumentsByStage);
    current = await f.service.tournament('learner', current.run.id);
    if (round < 3) {
      current = await f.service.advance('learner', current.run.id, { requestId: `advance-round-${round}` });
      const duplicate = await f.service.advance('learner', current.run.id, { requestId: `advance-round-${round}` });
      assert.equal(duplicate.session.id, current.session.id);
      await f.restart(); current = await f.service.tournament('learner', current.run.id);
    }
  }
  assert.equal(current.run.status, 'completed'); assert.equal(current.run.matches.length, 3); assert.equal(f.calls.awards, 3);
  assert.equal(current.run.matches[2].opponentId, 'chair-lin');
  const bossRequests = f.requests.filter(request => JSON.parse(request.messages[1].content).opponent?.boss);
  assert.equal(bossRequests.length, 3);
  assert.equal(JSON.parse(bossRequests[0].messages[1].content).topic.sources[0].url, current.run.topic.sources[0].url);
  assert.match(bossRequests[0].messages[0].content, /fictional, not a public official/);
  await f.restart();
  assert.equal((await f.service.finish('learner', current.session.id)).evaluation.outcome, 'win');
  assert.equal(f.calls.awards, 3);
  await assert.rejects(f.service.advance('learner', current.run.id, { requestId: 'advance-final' }), { code: 'debate_progression' });
});

test('draws replay the same round, uncertainty never eliminates, and a judged loss ends the run', async t => {
  const f = await fixture(t); f.settings.userScore = 3; f.settings.aiScore = 3;
  let current = await f.service.createTournament('learner', { requestId: 'draw-tournament', topicId: 'sg-inclusive-housing', position: 'against' });
  await f.complete(current.session);
  current = await f.service.advance('learner', current.run.id, { requestId: 'draw-replay-1' });
  assert.equal(current.run.round, 1); assert.equal(current.run.matches.length, 2);
  f.settings.confidence = 'low'; f.settings.userScore = 0; f.settings.aiScore = 4;
  let completed = await f.complete(current.session); assert.equal(completed.evaluation.outcome, 'draw'); assert.equal(completed.evaluation.uncertain, true);
  current = await f.service.advance('learner', current.run.id, { requestId: 'uncertain-replay' }); assert.equal(current.run.round, 1);
  f.settings.confidence = 'high'; completed = await f.complete(current.session);
  assert.equal(completed.evaluation.outcome, 'loss'); current = await f.service.tournament('learner', current.run.id);
  assert.equal(current.run.status, 'eliminated');
  await assert.rejects(f.service.advance('learner', current.run.id, { requestId: 'loss-advance' }), { code: 'debate_progression' });
});

test('catalog keeps street practice and adds sourced Singapore topics plus honest no-key boss practice', async t => {
  const f = await fixture(t, { local: true });
  const catalog = f.service.catalog();
  assert.deepEqual(catalog.opponents.map(opponent => opponent.id), ['mina', 'leo', 'ari']);
  assert.equal(catalog.tournamentTopics.length, 6);
  assert.equal(catalog.tournamentOpponents.at(-1).id, catalog.boss.id);
  assert.equal(catalog.boss.id, DEBATE_BOSS.id);
  for (const topic of catalog.tournamentTopics) {
    assert.equal(topic.region, 'Singapore');
    assert.equal(topic.contextReviewedAt, '2026-11-16');
    assert.ok(topic.sources.length);
    for (const source of topic.sources) {
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:');
      assert.ok(url.hostname.endsWith('.gov.sg'), 'briefing provenance must be an official Singapore source');
    }
  }
  const practice = await f.complete(await f.service.create('learner', {
    ...createInput, topicId: 'sg-inclusive-housing', opponentId: catalog.boss.id,
  }), singaporeArgumentsByStage);
  assert.equal(practice.opponent.boss, true);
  assert.equal(practice.evaluation.provider, 'local');
  assert.equal(practice.evaluation.uncertain, true);
  assert.deepEqual(practice.evaluation.totals, { user: null, ai: null });
  assert.match(practice.evaluation.explanation, /No AI judge ran/);
  assert.equal(f.rewardInputs[0].eligibleUnlockContext.competitive, false);
  assert.deepEqual(f.calls, { replies: 0, judges: 0, awards: 1 });
});

test('new cups require Singapore topics while saved legacy runs retain their title, topic and original final opponent', async t => {
  const f = await fixture(t);
  const input = { requestId: 'legacy-cup-request', topicId: 'school-gardens', position: 'for', proficiency: 'beginner' };
  await assert.rejects(f.service.createTournament('learner', input), { code: 'debate_tournament_topic' });
  const current = await f.service.createTournament('learner', { ...input, topicId: SINGAPORE_DEBATE_TOPICS[0].id });
  const run = JSON.parse((await f.db.prepare('SELECT data FROM sessions WHERE id=?').get(current.run.id)).data);
  // Persist a pre-Singapore-cup snapshot, including its original request hash.
  run.title = 'The Common Ground Cup';
  run.bracket = structuredClone(DEBATE_OPPONENTS);
  run.topic = { ...DEBATE_TOPICS.find(topic => topic.id === input.topicId), context: 'Historical topic context preserved in this saved run.' };
  run.internal.requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const match = JSON.parse((await f.db.prepare('SELECT data FROM sessions WHERE id=?').get(current.session.id)).data);
  match.topic = run.topic;
  await f.db.prepare('UPDATE sessions SET data=? WHERE id=?').run(JSON.stringify(run), run.id);
  await f.db.prepare('UPDATE sessions SET data=? WHERE id=?').run(JSON.stringify(match), match.id);
  await f.restart();
  let restored = await f.service.createTournament('learner', input);
  assert.equal(restored.run.id, run.id, 'retry returns the legacy run instead of rejecting its former topic');
  for (let round = 1; round <= 3; round++) {
    assert.equal(restored.session.opponent.id, DEBATE_OPPONENTS[round - 1].id);
    assert.deepEqual(restored.session.topic, run.topic);
    await f.complete(restored.session);
    if (round < 3) restored = await f.service.advance('learner', run.id, { requestId: `legacy-next-${round}` });
  }
  restored = await f.service.tournament('learner', run.id);
  assert.equal(restored.run.title, 'The Common Ground Cup');
  assert.equal(restored.run.status, 'completed');
  assert.equal(restored.run.matches.at(-1).opponentId, 'ari');
});

test('deletion is owner-scoped, deletes a whole run together and does not erase shared recordings', async t => {
  const f = await fixture(t), session = await f.service.create('learner', createInput);
  await assert.rejects(f.service.remove('other', session.id), { status: 404 });
  await f.service.remove('learner', session.id); await assert.rejects(f.service.get('learner', session.id), { status: 404 });
  const { run, session: match } = await f.service.createTournament('learner', { requestId: 'delete-tournament', topicId: 'sg-inclusive-housing', position: 'for' });
  await assert.rejects(f.service.remove('learner', match.id), { code: 'debate_delete_run' });
  await f.service.remove('learner', run.id, true); await assert.rejects(f.service.get('learner', match.id), { status: 404 });
  assert.equal(f.audio.get('owned-audio'), 'learner');
});

test('replay dedupe uses the same learner calendar day across UTC midnight and stance changes', async t => {
  let clock = Date.parse('2026-11-14T23:30:00Z');
  const f = await fixture(t, { clock: () => clock, local: true });
  await f.complete(await f.service.create('learner', createInput));
  clock = Date.parse('2026-11-15T01:00:00Z');
  await f.complete(await f.service.create('learner', { ...createInput, requestId: 'second-day-request', position: 'against' }));
  assert.equal(f.rewardInputs[0].localDate, '2026-11-15');
  assert.equal(f.rewardInputs[1].localDate, '2026-11-15');
  assert.equal(f.rewardInputs[0].dedupeKey, f.rewardInputs[1].dedupeKey);
});

test('deterministic ties and evidence validation do not accept missing, cross-side or opening-only rebuttal evidence', () => {
  const turns = DEBATE_STAGES.flatMap(({ id: stage }) => ['user', 'ai'].map(speaker => ({ id: `${speaker}-${stage}`, stage, speaker, text: `${speaker} offers a unique ${stage} explanation.` })));
  const session = { turns }, raw = judgeFixture(turns, { userScore: 3, aiScore: 3 });
  raw.criteria[0].user.score = 4; raw.criteria[1].user.score = 4;
  assert.equal(validateDebateJudge(raw, session).outcome, 'draw');
  raw.criteria[2].user.score = 4; assert.equal(validateDebateJudge(raw, session).outcome, 'win');
  raw.criteria[2].user.confidence = 'low'; assert.equal(validateDebateJudge(raw, session).uncertain, true);
  assert.equal(decideDebateOutcome([], false).uncertain, true);
  for (const mutate of [
    value => { value.criteria[1].key = value.criteria[0].key; },
    value => { value.criteria[0].user.score = 99; },
    value => { value.criteria[0].user.evidence = []; },
    value => { value.criteria[0].user.evidence = value.criteria[0].ai.evidence; },
    value => { value.criteria.find(item => item.key === 'rebuttal').user.evidence = [{ turnId: 'user-opening', quote: turns[0].text }]; },
  ]) { const invalid = structuredClone(raw); mutate(invalid); assert.throws(() => validateDebateJudge(invalid, session), { code: 'debate_invalid_provider_response' }); }
});

test('provider refusal, truncation and invented reply quotation fail closed', async () => {
  const session = { topic: {}, position: 'for', proficiency: 'beginner', opponent: { difficulty: 'beginner' }, turns: [] };
  const turn = { text: 'This is my actual argument.', stage: 'opening' };
  for (const response of [
    { choices: [{ finish_reason: 'stop', message: { refusal: 'Refused', content: '{}' } }] },
    { choices: [{ finish_reason: 'length', message: { content: '{}' } }] },
    { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: 'A reply.', respondsToQuote: 'Never supplied.' }) } }] },
  ]) {
    const provider = createDebateProvider(config, { request: async () => response });
    await assert.rejects(provider.reply(session, turn), { code: 'debate_invalid_provider_response' });
  }
});
