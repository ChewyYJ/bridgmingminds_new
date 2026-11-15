// Isolated competitive UI fixture: actual persistence/judging validation/rewards,
// with a synthetic transport that has no path to a paid provider.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.mjs';
import { serveWeb } from '../server/static.mjs';
import { DEFAULT_TEXT_MODEL, DEFAULT_TRANSCRIPTION_MODEL } from '../server/provider.mjs';
import { DEBATE_CRITERIA } from '../shared/debate.mjs';

if (process.env.NODE_ENV !== 'test') throw new Error('The boss browser fixture requires NODE_ENV=test.');
if (process.env.PORT && process.env.PORT !== '3026') throw new Error('The boss browser fixture only listens on port 3026.');

const directory = await mkdtemp(join(tmpdir(), 'role3-boss-browser-'));
const calls = { replies: 0, judges: 0, bossReplies: 0 };
const unexpected = [];
globalThis.fetch = async input => {
  unexpected.push(String(input));
  throw new Error('Outbound network is disabled in the boss browser fixture.');
};
const service = createApp({
  apiKey: 'role3-boss-offline-fixture-not-a-real-key',
  model: DEFAULT_TEXT_MODEL,
  transcriptionModel: DEFAULT_TRANSCRIPTION_MODEL,
  databaseUrl: '',
  dbPath: join(directory, 'boss.sqlite'),
  storageDir: join(directory, 'audio'),
  disableWorker: true,
  enforceUsageLimits: true,
  newsService: { getFeed: async () => ({ status: 'unavailable', articles: [], message: 'News is disabled in this isolated browser fixture.' }) },
  debateProviderRequest: async (endpoint, request) => {
    assert.equal(endpoint, 'chat/completions');
    const body = JSON.parse(request.body);
    const payload = JSON.parse(body.messages[1].content);
    const name = body.response_format.json_schema.name;
    let result;
    if (name === 'bridgingminds_debate_reply_v1') {
      calls.replies++;
      if (payload.opponent?.boss) calls.bossReplies++;
      const quote = payload.latestTurn.text.slice(0, 90);
      const challenge = payload.stage === 'opening'
        ? 'A shared facility still competes with other uses of limited space. What would show that residents prefer this option?'
        : payload.stage === 'rebuttal'
          ? 'A trial can be useful, but its participants may not represent everyone affected. How would you include people who cannot attend?'
          : 'I would retain flexibility until the proposal has a clear maintenance plan and a fair comparison with alternative uses.';
      result = { text: `You said, “${quote}”. ${challenge}`, respondsToQuote: quote };
    } else {
      assert.equal(name, 'bridgingminds_debate_judge_v1');
      assert.match(body.messages[0].content, /SEPARATE neutral judge/);
      calls.judges++;
      result = {
        criteria: DEBATE_CRITERIA.map(({ key }) => ({ key, ...Object.fromEntries(['user', 'ai'].map(side => {
          const turn = payload.turns.find(turn => turn.speaker === side && turn.stage === (key === 'rebuttal' ? 'rebuttal' : 'opening'));
          assert.ok(turn, 'the real saved exchange must contain both sides');
          return [side, {
            score: side === 'user' ? 3 : 2, confidence: 'high',
            evidence: [{ turnId: turn.id, quote: turn.text.slice(0, 100) }],
            strength: side === 'user' ? 'You connect the proposal to a practical condition.' : 'The opposing case identifies a competing use of resources.',
            improvement: 'Explain how the proposed trial would compare the strongest alternative.',
          }];
        })) })),
        uncertain: false,
        strengths: ['You weighed a practical trade-off and gave a workable condition.'],
        improvements: ['Explain how the trial would include people who cannot attend a meeting.'],
      };
    }
    // The fixture supplies scores and quotes, never an outcome or reward amount.
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] };
  },
});
await service.ready;
service.app.get('/__role3_boss/status', (req, res) => {
  if (req.get('X-Offline-Fixture') !== 'role3-boss-browser-only') return res.sendStatus(403);
  res.json({ fixture: 'role3-boss-offline', network: 'blocked', calls, unexpected });
});
if (!serveWeb(service.app)) {
  await service.close();
  await rm(directory, { recursive: true, force: true });
  throw new Error('Build the reviewed web export before running the boss browser gate.');
}
const server = service.app.listen(3026, '127.0.0.1', () => {
  console.log('Role 3 boss browser fixture ready on 127.0.0.1:3026; every provider request is mocked.');
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await new Promise(resolve => server.close(resolve));
  await service.close();
  await rm(directory, { recursive: true, force: true });
  process.exitCode = unexpected.length ? 1 : 0;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void stop());

