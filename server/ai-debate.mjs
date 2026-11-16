import { createHash, randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transaction } from './database.mjs';
import { createDebateProvider, LOCAL_PRACTICE_EXPLANATION } from './debate-judge.mjs';
import { requireProviderConfig } from './provider.mjs';
import { localDay } from './daily-workout.mjs';
import { planningBoardSchema } from './planning-board-schema.mjs';
import { DEBATE_VERSION, DEBATE_STAGES, DEBATE_TOPICS, DEBATE_OPPONENTS, DEBATE_BOSS, SINGAPORE_DEBATE_TOPICS, TOURNAMENT_OPPONENTS, DEBATE_RULES, decideDebateOutcome } from '../shared/debate.mjs';

const MATCH_MODE = 'ai_debate_v1', RUN_MODE = 'debate_tournament_v1';
const allOpponents = [...DEBATE_OPPONENTS, DEBATE_BOSS];
const requestId = z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/);
const briefing = { topicId: z.enum(DEBATE_TOPICS.map(item => item.id)), position: z.enum(['for', 'against']), proficiency: z.enum(['beginner', 'developing', 'confident']).default('beginner') };
const createSchema = z.strictObject({ requestId, mode: z.literal('practice').default('practice'), opponentId: z.enum(allOpponents.map(item => item.id)), ...briefing, position: z.enum(['for', 'against', 'random']) });
const preparationSchema = z.strictObject({ action: z.enum(['reveal', 'save', 'begin']), planningBoard: planningBoardSchema.optional() });
const tournamentSchema = z.strictObject({ requestId, ...briefing, position: z.enum(['for', 'against', 'random']) });
const wordTokens = text => text.toLocaleLowerCase('en').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? [];
const substantive = text => { const words = wordTokens(text); return words.length >= 3 && new Set(words).size >= 2; };
const normalizedArgument = text => wordTokens(text).join(' ');
const turnSchema = z.strictObject({ requestId, stage: z.enum(DEBATE_STAGES.map(item => item.id)), text: z.string().trim().min(1).max(6000).refine(substantive), audioId: z.string().min(1).max(100).optional() });
const advanceSchema = z.strictObject({ requestId });
const emptySchema = z.strictObject({});
const error = (status, code, message) => Object.assign(new Error(message), { status, code });
const parse = (schema, value) => { const parsed = schema.safeParse(value); if (!parsed.success) throw error(400, 'debate_input', 'Check the debate choices. Each argument needs at least three words, including two different words, and at most 6,000 characters.'); return parsed.data; };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const deterministicId = (kind, uid, key) => `${kind}_${digest([uid, key]).slice(0, 32)}`;
const publicData = data => { const result = structuredClone(data); delete result.internal; for (const turn of result.turns ?? []) delete turn.requestHash; return result; };

export function createAIDebateService({ db, providerConfig, usage, audioRoutes, awardValidatedCompletion, rewardPreview = null, now = Date.now, providerRequest }) {
  const provider = createDebateProvider(providerConfig, { request: providerRequest });
  const instant = () => new Date(now()).toISOString();
  async function owned(uid, id, mode = MATCH_MODE) {
    const row = await db.prepare('SELECT data FROM sessions WHERE id=? AND user_id=? AND mode=?').get(id, uid, mode);
    if (!row) throw error(404, 'debate_not_found', 'Debate not found.');
    return JSON.parse(row.data);
  }
  const save = (uid, value) => db.prepare('UPDATE sessions SET data=? WHERE id=? AND user_id=?').run(JSON.stringify(value), value.id, uid);
  const insert = (uid, mode, value) => db.prepare('INSERT INTO sessions(id,user_id,mode,data,created_at) VALUES(?,?,?,?,?)').run(value.id, uid, mode, JSON.stringify(value), value.createdAt);
  async function lockUser(uid) { if (!(await db.lockUser(uid))) throw error(401, 'debate_account_missing', 'Please sign in again.'); }
  const modeCheck = session => {
    requireProviderConfig(providerConfig);
    if (session.providerMode !== provider.mode) throw error(409, 'debate_provider_changed', 'The coaching service changed since this match began. Your turns are saved. Restore the previous service or start a new match.');
  };
  async function checkAudio(uid, session) {
    for (const turn of session.turns) if (turn.audioId) await audioRoutes.assertOwnAudio(turn.audioId, uid);
  }
  function newSession(uid, input, id, tournamentId, round = 1, snapshot = {}) {
    return { version: DEBATE_VERSION, id, mode: tournamentId ? 'tournament' : 'practice',
      topic: snapshot.topic ?? DEBATE_TOPICS.find(item => item.id === input.topicId), opponent: snapshot.opponent ?? allOpponents.find(item => item.id === input.opponentId),
      position: input.position === 'random' ? (randomInt(2) === 0 ? 'for' : 'against') : input.position, proficiency: input.proficiency, providerMode: provider.mode,
      ...(input.position === 'random' ? { preparation: { durationSeconds: 300, startedAt: null, endsAt: null, completedAt: null } } : {}),
      providerLabel: provider.mode === 'local' ? 'Rule-based local practice — no AI judging' : 'AI opponent · separate evidence-based judge',
      stage: 'opening', status: 'ready', turns: [], evaluation: null, reward: null, ...(tournamentId ? { tournamentId } : {}), round,
      createdAt: instant(), updatedAt: instant(), recovery: null, internal: { requestHash: digest(input), requestId: input.requestId } };
  }
  async function create(uid, body) {
    const input = parse(createSchema, body); requireProviderConfig(providerConfig);
    return transaction(db, async () => {
      await lockUser(uid);
      const id = deterministicId('debate', uid, input.requestId);
      const existing = await db.prepare('SELECT data FROM sessions WHERE id=? AND user_id=?').get(id, uid);
      if (existing) { const saved = JSON.parse(existing.data); if (saved.internal.requestHash !== digest(input)) throw error(409, 'debate_request_conflict', 'This request ID belongs to different debate choices.'); return publicData(saved); }
      const session = newSession(uid, input, id); await insert(uid, MATCH_MODE, session); return publicData(session);
    });
  }
  async function withLease(uid, sid, work) {
    // Verify ownership before exposing lease state or consuming a provider call.
    await owned(uid, sid);
    const name = `ai-debate:${sid}`, lease = await db.acquireLease(name, randomUUID(), 180000);
    if (!lease) throw error(409, 'debate_busy', 'This match is still processing a saved request. Reopen it or retry shortly.');
    const assertLease = async () => { if (!(await db.ownsLease(name, lease.token))) throw error(409, 'debate_lease_lost', 'The saved match is being recovered elsewhere. Reopen it to continue.'); };
    try { return await work(assertLease); } finally { await db.releaseLease(name, lease.token); }
  }
  async function preparation(uid, sid, body) {
    const input = parse(preparationSchema, body);
    return transaction(db, async () => {
      await lockUser(uid); await db.lockSession(sid);
      const session = await owned(uid, sid), plan = session.preparation;
      if (!plan) throw error(409, 'debate_preparation_missing', 'This match does not have a position roll.');
      // Retries never reroll, reset the deadline, or replace notes after battle starts.
      if (plan.completedAt) return publicData(session);
      if (input.action === 'reveal' && !plan.startedAt) {
        const start = now();
        plan.startedAt = new Date(start).toISOString();
        plan.endsAt = new Date(start + plan.durationSeconds * 1000).toISOString();
      }
      if (!plan.startedAt) throw error(409, 'debate_position_unrevealed', 'Reveal your position before preparing.');
      if (input.planningBoard) plan.planningBoard = input.planningBoard;
      if (input.action === 'begin') plan.completedAt = instant();
      session.updatedAt = instant(); await save(uid, session);
      return publicData(session);
    });
  }
  async function storeRecovery(uid, sid, cause) {
    await transaction(db, async () => {
      if (!(await db.lockUser(uid))) return;
      const row = await db.prepare('SELECT data FROM sessions WHERE id=? AND user_id=? AND mode=?').get(sid, uid, MATCH_MODE);
      if (!row) return;
      const session = JSON.parse(row.data);
      if (session.status === 'completed') return;
      session.recovery = { code: typeof cause.code === 'string' ? cause.code : 'debate_processing_failed',
        message: 'Your saved turns are unchanged. Retry the pending step when the service is available; no win or loss has been recorded.' };
      session.updatedAt = instant(); await save(uid, session);
    });
  }
  async function answerPending(uid, sid, assertLease, authorize) {
    const session = await owned(uid, sid); modeCheck(session);
    if (session.status !== 'awaiting_reply') return publicData(session);
    const turn = session.turns.find(turn => turn.speaker === 'user' && !session.turns.some(reply => reply.speaker === 'ai' && reply.stage === turn.stage));
    if (!turn) throw error(409, 'debate_pending_missing', 'Reopen this match to recover its saved state.');
    try {
      await checkAudio(uid, session);
      if (provider.mode === 'openai') await usage?.allowRequest(uid, { sessionId: sid });
      const reply = await provider.reply(session, turn);
      if (authorize) await authorize();
      return await transaction(db, async () => {
        await lockUser(uid); await db.lockSession(sid); await assertLease();
        const latest = await owned(uid, sid);
        if (latest.turns.some(item => item.speaker === 'ai' && item.stage === turn.stage)) return publicData(latest);
        await checkAudio(uid, latest);
        latest.turns.push({ id: randomUUID(), speaker: 'ai', stage: turn.stage, text: reply.text, provider: reply.provider, createdAt: instant() });
        const next = DEBATE_STAGES.findIndex(item => item.id === turn.stage) + 1;
        latest.stage = DEBATE_STAGES[next]?.id ?? 'complete'; latest.status = next === 3 ? 'ready_to_judge' : 'ready'; latest.recovery = null; latest.updatedAt = instant();
        await save(uid, latest); return publicData(latest);
      });
    } catch (cause) { await storeRecovery(uid, sid, cause); throw cause; }
  }
  async function submitTurn(uid, sid, body, authorize) {
    const input = parse(turnSchema, body);
    return withLease(uid, sid, async assertLease => {
      const prepared = await transaction(db, async () => {
        await lockUser(uid); await db.lockSession(sid); await assertLease();
        const session = await owned(uid, sid), hash = digest(input);
        if (session.preparation && !session.preparation.completedAt) throw error(409, 'debate_preparing', 'Finish preparing before starting your opening.');
        const previous = session.turns.find(turn => turn.speaker === 'user' && turn.requestId === input.requestId);
        if (previous) {
          if (previous.requestHash !== hash) throw error(409, 'debate_request_conflict', 'Retry with the same saved argument, stage and recording.');
          // A duplicate submission never triggers another billable request.
          // Explicit recover is the retry operation after a provider failure.
          return { duplicate: publicData(session) };
        }
        modeCheck(session);
        if (session.status !== 'ready' || session.stage !== input.stage) throw error(409, 'debate_turn_order', 'Finish or recover the current stage before submitting another turn.');
        if (session.turns.some(turn => turn.speaker === 'user' && normalizedArgument(turn.text) === normalizedArgument(input.text)))
          throw error(400, 'debate_response_repeated', 'Add a response for this stage rather than repeating your earlier argument word for word.');
        if (input.audioId) await audioRoutes.assertOwnAudio(input.audioId, uid);
        session.turns.push({ id: randomUUID(), speaker: 'user', stage: input.stage, text: input.text, ...(input.audioId ? { audioId: input.audioId } : {}),
          provider: 'learner', requestId: input.requestId, requestHash: hash, createdAt: instant() });
        session.status = 'awaiting_reply'; session.recovery = null; session.updatedAt = instant(); await save(uid, session);
        return { duplicate: null };
      });
      return prepared.duplicate ?? answerPending(uid, sid, assertLease, authorize);
    });
  }
  async function recover(uid, sid, authorize) {
    return withLease(uid, sid, assertLease => answerPending(uid, sid, assertLease, authorize));
  }
  async function finish(uid, sid, authorize) {
    return withLease(uid, sid, async assertLease => {
      const session = await owned(uid, sid);
      if (session.status === 'completed') return publicData(session);
      modeCheck(session);
      if (session.status !== 'ready_to_judge' || session.turns.length !== 6 || !DEBATE_STAGES.every(stage => ['user', 'ai'].every(speaker => session.turns.some(turn => turn.stage === stage.id && turn.speaker === speaker))))
        throw error(409, 'debate_not_complete', 'Complete and recover all three stages before judging.');
      const learnerTurns = session.turns.filter(turn => turn.speaker === 'user');
      if (!learnerTurns.every(turn => substantive(turn.text)) || new Set(learnerTurns.map(turn => normalizedArgument(turn.text))).size !== 3)
        throw error(409, 'debate_completion_ineligible', 'Each stage needs its own meaningful response before completion.');
      try {
        await checkAudio(uid, session);
        let evaluation = session.internal.pendingEvaluation;
        if (!evaluation) {
          if (provider.mode === 'openai') await usage?.allowRequest(uid, { sessionId: sid });
          evaluation = await provider.judge(session, now());
          if (authorize) await authorize();
          // Keep a validated judgement across a temporary reward/DB integration
          // failure. Retrying completion must not purchase another judgement.
          await transaction(db, async () => {
            await lockUser(uid); await db.lockSession(sid); await assertLease();
            const latest = await owned(uid, sid); await checkAudio(uid, latest);
            latest.internal.pendingEvaluation = evaluation; await save(uid, latest);
          });
        }
        if (authorize) await authorize();
        return await transaction(db, async () => {
          await lockUser(uid); await db.lockSession(sid); await assertLease();
          const latest = await owned(uid, sid);
          if (latest.status === 'completed') return publicData(latest);
          await checkAudio(uid, latest);
          // Recompute deterministic outcomes here; no provider/client outcome
          // or reward amount is accepted by the persistence boundary.
          latest.evaluation = { ...evaluation, ...decideDebateOutcome(evaluation.criteria, evaluation.uncertain) };
          if (evaluation.provider === 'local') latest.evaluation.explanation = LOCAL_PRACTICE_EXPLANATION;
          latest.status = 'completed'; latest.completedAt = instant(); latest.updatedAt = instant(); latest.recovery = null;
          delete latest.internal.pendingEvaluation;
          await save(uid, latest);
          if (awardValidatedCompletion) {
            const owner = await db.prepare('SELECT profile FROM users WHERE id=?').get(uid);
            const timezone = JSON.parse(owner.profile).timezone || 'UTC';
            const rewardDay = localDay(latest.completedAt, timezone);
            latest.reward = await awardValidatedCompletion(uid, {
              eventId: `debate:${sid}`, activityType: 'ai_debate', completionId: sid, completedAt: latest.completedAt,
              timezone, localDate: rewardDay,
              dedupeKey: `debate:${rewardDay}:${latest.topic.id}:${latest.opponent.id}`,
              eligibleUnlockContext: { outcome: latest.evaluation.outcome, judged: !latest.evaluation.uncertain && latest.evaluation.provider === 'openai',
                competitive: !latest.evaluation.uncertain && latest.evaluation.provider === 'openai', tournamentId: latest.tournamentId ?? null,
                round: latest.round, topicId: latest.topic.id, opponentId: latest.opponent.id },
            });
          }
          if (latest.tournamentId) {
            const run = await owned(uid, latest.tournamentId, RUN_MODE);
            const match = run.matches.find(item => item.sessionId === sid);
            if (match) { match.outcome = latest.evaluation.outcome; match.uncertain = latest.evaluation.uncertain; }
            if (!latest.evaluation.uncertain && latest.evaluation.outcome === 'loss') run.status = 'eliminated';
            if (!latest.evaluation.uncertain && latest.evaluation.outcome === 'win' && latest.round === run.bracket.length) run.status = 'completed';
            run.updatedAt = instant(); await save(uid, run);
          }
          await save(uid, latest); return publicData(latest);
        });
      } catch (cause) { await storeRecovery(uid, sid, cause); throw cause; }
    });
  }
  async function createTournament(uid, body) {
    const input = parse(tournamentSchema, body); requireProviderConfig(providerConfig);
    if (provider.mode !== 'openai') throw error(503, 'debate_tournament_unavailable', 'Tournament judging needs the configured AI service. Rule-based local practice remains available.');
    return transaction(db, async () => {
      await lockUser(uid);
      const id = deterministicId('tournament', uid, input.requestId);
      const previous = await db.prepare('SELECT data FROM sessions WHERE id=? AND user_id=?').get(id, uid);
      if (previous) {
        const run = JSON.parse(previous.data);
        if (run.internal.requestHash !== digest(input)) throw error(409, 'debate_request_conflict', 'This request ID belongs to a different tournament.');
        return { run: publicData(run), session: publicData(await owned(uid, run.currentSessionId)) };
      }
      // Old request IDs return their saved run above. Only newly created cups
      // use the single-boss bracket; saved topics and brackets stay immutable.
      if (!SINGAPORE_DEBATE_TOPICS.some(topic => topic.id === input.topicId))
        throw error(400, 'debate_tournament_topic', 'Choose a Singapore topic for this tournament. Other topics remain available in street practice.');
      const session = newSession(uid, { ...input, opponentId: TOURNAMENT_OPPONENTS[0].id }, deterministicId('debate', uid, `${id}:1`), id);
      const run = { version: DEBATE_VERSION, id, title: DEBATE_RULES.title, status: 'active', topic: session.topic, position: session.position,
        proficiency: input.proficiency, round: 1, currentSessionId: session.id, matches: [{ sessionId: session.id, round: 1, opponentId: session.opponent.id, outcome: null, uncertain: null }],
        bracket: TOURNAMENT_OPPONENTS, createdAt: instant(), updatedAt: instant(), internal: { requestHash: digest(input), operations: {} } };
      await insert(uid, RUN_MODE, run); await insert(uid, MATCH_MODE, session);
      return { run: publicData(run), session: publicData(session) };
    });
  }
  async function tournament(uid, id) { const run = await owned(uid, id, RUN_MODE); return { run: publicData(run), session: publicData(await owned(uid, run.currentSessionId)) }; }
  async function advance(uid, id, body) {
    const input = parse(advanceSchema, body);
    return transaction(db, async () => {
      await lockUser(uid); await db.lockSession(id);
      const run = await owned(uid, id, RUN_MODE), current = await owned(uid, run.currentSessionId);
      if (run.internal.operations[input.requestId]) return { run: publicData(run), session: publicData(current) };
      modeCheck(current);
      if (run.status !== 'active' || current.status !== 'completed') throw error(409, 'debate_progression', 'Finish this round first. A completed or lost run cannot advance.');
      if (run.matches.length >= 24) throw error(409, 'debate_retry_limit', 'This run has reached its replay limit. Start a new run to continue practising.');
      const nextRound = !current.evaluation.uncertain && current.evaluation.outcome === 'win' ? run.round + 1 : run.round;
      const opponent = run.bracket[nextRound - 1];
      if (!opponent) throw error(409, 'debate_progression', 'This saved tournament has no further round. Reopen its result.');
      const session = newSession(uid, { requestId: input.requestId, topicId: run.topic.id, position: run.position, proficiency: run.proficiency,
        opponentId: opponent.id }, deterministicId('debate', uid, `${id}:${input.requestId}`), id, nextRound, { topic: run.topic, opponent });
      modeCheck(session);
      run.round = nextRound; run.currentSessionId = session.id; run.updatedAt = instant(); run.internal.operations[input.requestId] = session.id;
      run.matches.push({ sessionId: session.id, round: nextRound, opponentId: session.opponent.id, outcome: null, uncertain: null });
      await insert(uid, MATCH_MODE, session); await save(uid, run);
      return { run: publicData(run), session: publicData(session) };
    });
  }
  async function history(uid, { limit = 30, offset = 0 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw error(400, 'debate_history_page', 'Use a valid history page.');
    const matches = await db.prepare('SELECT data FROM sessions WHERE user_id=? AND mode=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').all(uid, MATCH_MODE, limit + 1, offset);
    const runs = await db.prepare('SELECT data FROM sessions WHERE user_id=? AND mode=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').all(uid, RUN_MODE, limit, offset);
    return { sessions: matches.slice(0, limit).map(row => publicData(JSON.parse(row.data))), tournaments: runs.map(row => publicData(JSON.parse(row.data))), hasMore: matches.length > limit, nextOffset: matches.length > limit ? offset + limit : null };
  }
  async function remove(uid, id, isRun = false) {
    return transaction(db, async () => {
      await lockUser(uid);
      const record = await owned(uid, id, isRun ? RUN_MODE : MATCH_MODE);
      if (!isRun && record.tournamentId) throw error(409, 'debate_delete_run', 'Delete the tournament to remove its linked matches together.');
      if (isRun) for (const match of record.matches) await db.prepare('DELETE FROM sessions WHERE id=? AND user_id=? AND mode=?').run(match.sessionId, uid, MATCH_MODE);
      await db.prepare('DELETE FROM sessions WHERE id=? AND user_id=?').run(id, uid);
      return { deleted: true, audioNotice: 'Recordings remain available through your private audio controls until deleted or their 30-day retention ends. Deleting a match does not remove recordings used in other activities.' };
    });
  }
  return { create, preparation, get: async (uid, id) => publicData(await owned(uid, id)), submitTurn, recover, finish, createTournament, tournament, advance, history, remove,
    catalog: () => ({ version: DEBATE_VERSION, providerMode: provider.mode, tournamentAvailable: provider.mode === 'openai' && !providerConfig.issues.length,
      topics: DEBATE_TOPICS, opponents: DEBATE_OPPONENTS, stages: DEBATE_STAGES, rules: DEBATE_RULES,
      tournamentTopics: SINGAPORE_DEBATE_TOPICS, tournamentOpponents: TOURNAMENT_OPPONENTS, boss: DEBATE_BOSS,
      rewardPreview: typeof rewardPreview === 'function' ? rewardPreview('ai_debate') : rewardPreview }) };
}

export function installAIDebate({ app, wrap, resolveAuth, ...options }) {
  const service = createAIDebateService(options);
  const authorize = req => async () => { if (resolveAuth && await resolveAuth(req) !== req.userId) throw error(401, 'debate_auth_expired', 'Please sign in again. Your saved turn is unchanged.'); };
  app.get('/api/debate/catalog', wrap(async (_req, res) => res.json(service.catalog())));
  app.get('/api/debate/history', wrap(async (req, res) => res.json(await service.history(req.userId, { limit: req.query.limit === undefined ? 30 : Number(req.query.limit), offset: req.query.offset === undefined ? 0 : Number(req.query.offset) }))));
  app.post('/api/debate/sessions', wrap(async (req, res) => res.status(201).json(await service.create(req.userId, req.body))));
  app.get('/api/debate/sessions/:id', wrap(async (req, res) => res.json(await service.get(req.userId, req.params.id))));
  app.post('/api/debate/sessions/:id/preparation', wrap(async (req, res) => res.json(await service.preparation(req.userId, req.params.id, req.body))));
  app.post('/api/debate/sessions/:id/turns', wrap(async (req, res) => res.json(await service.submitTurn(req.userId, req.params.id, req.body, authorize(req)))));
  app.post('/api/debate/sessions/:id/recover', wrap(async (req, res) => { parse(emptySchema, req.body); res.json(await service.recover(req.userId, req.params.id, authorize(req))); }));
  app.post('/api/debate/sessions/:id/finish', wrap(async (req, res) => { parse(emptySchema, req.body); res.json(await service.finish(req.userId, req.params.id, authorize(req))); }));
  app.delete('/api/debate/sessions/:id', wrap(async (req, res) => res.json(await service.remove(req.userId, req.params.id))));
  app.post('/api/debate/tournaments', wrap(async (req, res) => res.status(201).json(await service.createTournament(req.userId, req.body))));
  app.get('/api/debate/tournaments/:id', wrap(async (req, res) => res.json(await service.tournament(req.userId, req.params.id))));
  app.post('/api/debate/tournaments/:id/advance', wrap(async (req, res) => res.json(await service.advance(req.userId, req.params.id, req.body))));
  app.delete('/api/debate/tournaments/:id', wrap(async (req, res) => res.json(await service.remove(req.userId, req.params.id, true))));
  return service;
}
