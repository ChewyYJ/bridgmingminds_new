import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../server/database.mjs';
import { postgresSql } from '../server/postgres.mjs';
import { createGamificationService } from '../server/gamification.mjs';
import { GAMIFICATION_CONFIG, ITEM_CATALOG, FOODS, AVATAR_PALETTES, defaultEquipment } from '../shared/gamification.mjs';

async function fixture(t, { seeds = 0, xp = 0, timezone = 'Asia/Singapore' } = {}) {
  const db = openDatabase(':memory:'), uid = randomUUID();
  let time = '2026-11-15T04:00:00.000Z';
  await db.prepare('INSERT INTO users(id,profile,wallet,plots,xp,created_at) VALUES(?,?,?,?,?,?)')
    .run(uid, JSON.stringify({ timezone }), JSON.stringify({ seeds, water: 6, sunlight: 7 }), '[]', xp, time);
  const service = createGamificationService({ db, now: () => new Date(time) });
  t.after(() => db.close());
  return { db, uid, service, setTime(value) { time = value; },
    async timezone(value) { await db.prepare('UPDATE users SET profile=? WHERE id=?').run(JSON.stringify({ timezone: value }), uid); },
    async award(activityType = 'daily_practice', options = {}) {
      const completionId = randomUUID();
      return service.awardValidatedCompletion(uid, { activityType, completionId, eventId: `test:${completionId}`, completedAt: time, ...options });
    },
    async attempt(mode = 'spin_speak', overrides = {}) {
      const sid = randomUUID(), id = randomUUID();
      await db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(sid, uid, mode, JSON.stringify({ prompt: { id: 'same-editorial-prompt' } }), time);
      await db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?)').run(id, uid, sid, JSON.stringify({ id, mode, status: 'completed',
        completedAt: time, text: 'Public parks provide a place for neighbours to meet.', evaluation: {}, ...overrides }), time);
      return id;
    },
  };
}

test('approved conversion preserves the complete legacy wallet and XP exactly once', async t => {
  const f = await fixture(t, { seeds: 9, xp: 235 });
  const states = await Promise.all(Array.from({ length: 8 }, () => f.service.summary(f.uid)));
  for (const state of states) { assert.equal(state.coins, 9); assert.equal(state.xp, 235); assert.equal(state.level, 3); }
  const archived = await f.db.prepare('SELECT * FROM legacy_currency_archives WHERE user_id=?').get(f.uid);
  assert.deepEqual(JSON.parse(archived.wallet), { seeds: 9, water: 6, sunlight: 7 });
  assert.equal(archived.xp, 235);
  assert.equal(archived.status, 'seeds-to-coins-1-to-1-v1');
  assert.equal((await f.db.prepare("SELECT COUNT(*) count FROM coin_ledger WHERE activity_type='legacy_conversion'").get()).count, 1);
  await f.db.prepare('UPDATE users SET wallet=? WHERE id=?').run('{"seeds":1000}', f.uid);
  assert.equal((await f.service.summary(f.uid)).coins, 9);
});

test('daily pair funds one 5-Coin food and Read Aloud grants no new XP', async t => {
  const f = await fixture(t);
  assert.equal((await f.award()).coinsGranted, 2);
  const reading = await f.award('read_aloud');
  assert.equal(reading.coinsGranted, 3); assert.equal(reading.xpGranted, 0);
  const purchase = await f.service.purchaseFood(f.uid, { foodId: 'ramen', requestId: 'meal-001' });
  assert.equal(purchase.coinsSpent, 5); assert.equal(purchase.balance, 0);
  assert.equal(purchase.fullness, 100); assert.equal(purchase.fullnessRestored, 25);
  assert.equal(purchase.food.animation, 'eat');
  assert.equal(purchase.state.xp, 15);
  assert.deepEqual(purchase.state.streak, { current: 1, longest: 1, securedToday: true });
});

test('trusted legacy secured days preserve timezone streak history without retroactive rewards', async t => {
  const f = await fixture(t, { seeds: 4, xp: 80, timezone: 'Pacific/Auckland' });
  for (const day of ['2026-11-13','2026-11-14','2026-11-15']) {
    const attemptId = await f.attempt();
    await f.db.prepare('INSERT INTO daily_activity_completions VALUES(?,?,?,?,?,?)')
      .run(f.uid, day, 'spin_speak', attemptId, 'Asia/Singapore', `${day}T04:00:00Z`);
    await f.db.prepare('INSERT INTO daily_workout_days VALUES(?,?,?)').run(f.uid, day, `${day}T04:00:00Z`);
  }
  // An old successful attempt without a secured-day record is not enough.
  await f.attempt('spin_speak', { completedAt: '2026-11-12T04:00:00Z' });
  const migrated = await f.service.summary(f.uid);
  assert.deepEqual(migrated.streak, { current: 3, longest: 3, securedToday: true });
  assert.equal(migrated.coins, 4); assert.equal(migrated.xp, 80);
  const days = await f.db.prepare('SELECT * FROM economy_streak_days WHERE user_id=? ORDER BY local_date').all(f.uid);
  assert.equal(days.length, 3);
  assert.ok(days.every(day => day.timezone === 'Asia/Singapore' && day.event_id.startsWith('legacy-secured-day:')));
  assert.equal(days[0].created_at, '2026-11-13T04:00:00Z');
  const baseline = await f.db.prepare("SELECT * FROM coin_ledger WHERE user_id=? AND event_id='streak-milestone:3'").get(f.uid);
  assert.equal(baseline.coins_delta, 0); assert.equal(baseline.xp_delta, 0);
  f.setTime('2026-11-16T04:00:00Z');
  assert.equal((await f.award()).coinsGranted, 2);
  const after = await f.service.summary(f.uid);
  assert.equal(after.streak.current, 4); assert.equal(after.coins, 6); assert.equal(after.xp, 95);
  assert.equal((await f.db.prepare('SELECT COUNT(*) count FROM economy_streak_days WHERE user_id=?').get(f.uid)).count, 4);
});

test('concurrent duplicate events and aliases mint only one reward', async t => {
  const f = await fixture(t), completionId = randomUUID();
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => f.award('daily_practice', { completionId, eventId: i < 6 ? 'event-original' : `alias-${i}` })));
  assert.equal(results.filter(result => !result.alreadyProcessed).length, 1);
  assert.equal(new Set(results.map(result => result.ledgerTransactionId)).size, 1);
  assert.equal((await f.service.summary(f.uid)).coins, 2);
  await assert.rejects(f.award('daily_practice', { eventId: 'event-original' }), error => error.code === 'idempotency_conflict');
});

test('daily caps and trusted content dedupe allow practice without farming', async t => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 10 }, () => f.award('daily_practice')));
  assert.equal(results.reduce((total, row) => total + row.coinsGranted, 0), 2);
  const first = await f.award('ai_debate', { dedupeKey: 'opponent-topic-slot' });
  const replay = await f.award('ai_debate', { dedupeKey: 'opponent-topic-slot' });
  assert.equal(first.coinsGranted, 3); assert.equal(replay.coinsGranted, 0);
  assert.equal(replay.eligible, false);
  const reflection = await f.attempt('read_reflect');
  const repeat = await f.attempt('read_reflect');
  assert.equal((await f.service.awardCompletion(f.uid, { completionId: reflection })).coinsGranted, 3);
  assert.equal((await f.service.awardCompletion(f.uid, { completionId: repeat })).coinsGranted, 0);
});

test('vocabulary review preserves Person 2 XP through the ledger once per day', async t => {
  const f = await fixture(t, { xp: 97 });
  const results = await Promise.all(Array.from({ length: 6 }, () => f.award('vocabulary_review')));
  assert.equal(results.reduce((sum, row) => sum + row.xpGranted, 0), 5);
  const state = await f.service.summary(f.uid);
  assert.equal(state.coins, 0); assert.equal(state.xp, 102); assert.equal(state.level, 2);
  assert.equal((await f.db.prepare('SELECT xp FROM users WHERE id=?').get(f.uid)).xp, 102);
});

test('concurrent purchases cannot overspend and duplicate clicks reuse one transaction', async t => {
  const f = await fixture(t, { seeds: 10 });
  await f.service.summary(f.uid);
  // Leave capacity for all requests so this test isolates the wallet limit.
  await f.db.prepare('UPDATE economy_accounts SET fullness=0 WHERE user_id=?').run(f.uid);
  const purchases = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => f.service.purchaseFood(f.uid, { foodId: 'onigiri', requestId: `buy-${i}` })));
  assert.equal(purchases.filter(result => result.status === 'fulfilled').length, 2);
  assert.equal(purchases.filter(result => result.status === 'rejected' && result.reason.code === 'insufficient_coins').length, 18);
  assert.equal((await f.service.summary(f.uid)).coins, 0);
  const repeats = await Promise.all(Array.from({ length: 10 }, () => f.service.purchaseFood(f.uid, { foodId: 'onigiri', requestId: 'buy-0' })));
  assert.ok(repeats.every(result => result.alreadyProcessed));
  assert.equal(new Set(repeats.map(result => result.transactionId)).size, 1);
  await assert.rejects(f.service.purchaseFood(f.uid, { foodId: 'bento', requestId: 'buy-0' }), error => error.code === 'idempotency_conflict');
  assert.equal((await f.db.prepare('SELECT COUNT(*) count FROM food_transactions').get()).count, 2);
});

test('fullness rejects wasted spending while saved purchase retries still return their receipt', async t => {
  const f = await fixture(t, { seeds: 10 });
  const before = await f.service.summary(f.uid);
  assert.equal(before.fullness.careEnabled, false); // Manual care still works without decay.
  const results = await Promise.allSettled(['first-feed','competing-feed'].map(requestId =>
    f.service.purchaseFood(f.uid, { foodId: 'ramen', requestId })));
  const succeeded = results.filter(result => result.status === 'fulfilled');
  const rejected = results.filter(result => result.status === 'rejected');
  assert.equal(succeeded.length, 1); assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.status, 409); assert.equal(rejected[0].reason.code, 'avatar_full');
  const filled = await f.service.summary(f.uid);
  assert.equal(filled.coins, 5); assert.equal(filled.fullness.value, 100);
  await assert.rejects(f.service.purchaseFood(f.uid, { foodId: 'onigiri', requestId: 'already-full' }), error => error.code === 'avatar_full');
  assert.equal((await f.service.summary(f.uid)).coins, 5);
  const winningIndex = results.findIndex(result => result.status === 'fulfilled');
  const replay = await f.service.purchaseFood(f.uid, { foodId: 'ramen', requestId: ['first-feed','competing-feed'][winningIndex] });
  assert.equal(replay.alreadyProcessed, true);
  assert.equal(replay.transactionId, succeeded[0].value.transactionId);
  assert.equal(replay.state.coins, 5);
  assert.equal((await f.db.prepare('SELECT COUNT(*) count FROM food_transactions WHERE user_id=?').get(f.uid)).count, 1);
  assert.equal((await f.db.prepare("SELECT COUNT(*) count FROM coin_ledger WHERE user_id=? AND activity_type='food_purchase'").get(f.uid)).count, 1);
});

test('failure after debit rolls back balance, fullness and purchase ledger', async t => {
  const f = await fixture(t, { seeds: 5 });
  const before = await f.service.summary(f.uid);
  await f.db.exec("CREATE TRIGGER reject_food BEFORE INSERT ON food_transactions BEGIN SELECT RAISE(ABORT,'simulated persistence failure'); END;");
  await assert.rejects(f.service.purchaseFood(f.uid, { foodId: 'bento', requestId: 'safe-retry' }), /simulated persistence failure/);
  const after = await f.service.summary(f.uid);
  assert.equal(after.coins, before.coins); assert.deepEqual(after.fullness, before.fullness);
  assert.equal((await f.db.prepare("SELECT COUNT(*) count FROM coin_ledger WHERE activity_type='food_purchase'").get()).count, 0);
  await f.db.exec('DROP TRIGGER reject_food');
  assert.equal((await f.service.purchaseFood(f.uid, { foodId: 'bento', requestId: 'safe-retry' })).balance, 0);
});

test('timezone calendar boundaries and DST count each learning day once', async t => {
  const f = await fixture(t, { timezone: 'America/New_York' });
  f.setTime('2026-03-08T06:55:00Z');
  assert.equal((await f.award()).localDate, '2026-03-08');
  await f.award('read_aloud');
  f.setTime('2026-03-09T04:05:00Z');
  const next = await f.award();
  assert.equal(next.localDate, '2026-03-09'); assert.equal(next.streak.current, 2);
  assert.equal((await f.db.prepare('SELECT COUNT(*) count FROM economy_streak_days').get()).count, 2);
});

test('late receipts retain their original local date across timezone edits', async t => {
  const f = await fixture(t);
  f.setTime('2026-11-15T15:59:59Z');
  const completionId = await f.attempt();
  await f.db.prepare('INSERT INTO daily_attempt_receipts VALUES(?,?,?,?,?,?)').run(completionId, f.uid, 'spin_speak', '2026-11-15', 'Asia/Singapore', '2026-11-15T15:59:59Z');
  f.setTime('2026-11-15T16:10:00Z'); await f.timezone('Pacific/Auckland');
  const result = await f.service.awardCompletion(f.uid, { completionId });
  assert.equal(result.localDate, '2026-11-15');
  const ledger = await f.db.prepare('SELECT * FROM coin_ledger WHERE id=?').get(result.ledgerTransactionId);
  assert.equal(ledger.timezone, 'Asia/Singapore');
});

test('out-of-order completion recovery grants streak milestones only once', async t => {
  const f = await fixture(t);
  f.setTime('2026-11-17T04:00:00Z');
  await f.award('daily_practice', { completedAt: '2026-11-15T04:00:00Z' });
  await f.award('daily_practice', { completedAt: '2026-11-17T04:00:00Z' });
  const late = await f.award('daily_practice', { completedAt: '2026-11-16T04:00:00Z' });
  assert.equal(late.coinsGranted, 4); assert.equal(late.streak.current, 3);
  assert.ok(late.achievements.includes('streak-3'));
  await f.award('read_aloud', { completedAt: '2026-11-16T04:00:00Z' });
  assert.equal((await f.db.prepare("SELECT COUNT(*) count FROM coin_ledger WHERE activity_type='streak_milestone'").get()).count, 1);
  f.setTime('2026-11-20T04:00:00Z');
  const state = await f.service.summary(f.uid);
  assert.equal(state.streak.current, 0); assert.equal(state.streak.longest, 3);
  assert.equal(state.achievements.find(a => a.id === 'streak-3').progress, 3);
});

test('ownership and category/collection checks reject forged equipment atomically', async t => {
  const f = await fixture(t), initial = await f.service.summary(f.uid), selection = defaultEquipment('girl');
  await assert.rejects(f.service.equip(f.uid, { ...selection, hat: 'girl-hat-wool-beret' }), error => error.code === 'item_not_owned');
  await assert.rejects(f.service.equip(f.uid, { ...selection, top: 'boy-top-everyday-tee' }), error => error.code === 'invalid_equipment');
  await assert.rejects(f.service.equip(f.uid, { ...selection, hair: selection.top }), error => error.code === 'invalid_equipment');
  await assert.rejects(f.service.equip(f.uid, { ...selection, skin: 'forged' }), error => error.code === 'invalid_equipment');
  assert.deepEqual((await f.service.summary(f.uid)).avatar.selection, initial.avatar.selection);
  const saved = await f.service.equip(f.uid, { ...defaultEquipment('boy'), jacket: null, hair: 'boy-hair-curls' });
  assert.equal(saved.avatar.selection.collection, 'boy'); assert.equal(saved.avatar.selection.jacket, null);
});

test('real activity progress unlocks items once; uncertain or local wins do not unlock performance items', async t => {
  const f = await fixture(t);
  const reflection = await f.award('read_reflect');
  assert.ok(reflection.unlockedItems.includes('girl-hat-wool-beret'));
  assert.ok(reflection.unlockedItems.includes('boy-hat-field-cap'));
  await f.service.equip(f.uid, { ...defaultEquipment(), hat: 'girl-hat-wool-beret' });
  await f.award('ai_debate', { eligibleUnlockContext: { outcome: 'win', judged: false, competitive: false } });
  let state = await f.service.summary(f.uid);
  assert.equal(state.avatar.ownedItemIds.includes('girl-jacket-sage-cropped'), false);
  const win = await f.award('ai_debate', { eligibleUnlockContext: { outcome: 'win', judged: true, competitive: true } });
  assert.ok(win.unlockedItems.includes('girl-jacket-sage-cropped'));
  assert.ok(win.achievements.includes('first-debate-win'));
  state = await f.service.summary(f.uid);
  assert.equal(new Set(state.avatar.ownedItemIds).size, state.avatar.ownedItemIds.length);
});

test('completion validation enforces ownership, successful status and real reading completion', async t => {
  const f = await fixture(t), completionId = await f.attempt();
  await assert.rejects(f.service.awardCompletion('another-user', { completionId }), error => error.status === 404);
  const draft = await f.attempt('spin_speak', { status: 'draft' });
  await assert.rejects(f.service.awardCompletion(f.uid, { completionId: draft }), error => error.code === 'completion_not_eligible');
  const fabricatedReading = await f.attempt('read_aloud');
  await assert.rejects(f.service.awardCompletion(f.uid, { completionId: fabricatedReading }), error => error.code === 'completion_not_eligible');
  const reading = await f.attempt('read_aloud', { completionPolicy: 'read-aloud-self-review-v1', selfReviewConfirmed: true });
  assert.equal((await f.service.awardCompletion(f.uid, { completionId: reading })).coinsGranted, 3);
  const retry = await f.attempt('spin_speak', { retryOf: completionId });
  assert.equal((await f.service.awardCompletion(f.uid, { completionId: retry })).coinsGranted, 0);
});

test('care is optional, decay is bounded, paused time does not accumulate, learning remains available', async t => {
  const f = await fixture(t);
  assert.equal((await f.service.summary(f.uid)).fullness.careEnabled, false);
  f.setTime('2026-11-20T04:00:00Z');
  assert.equal((await f.service.summary(f.uid)).fullness.value, 75);
  await f.service.updateSettings(f.uid, { careEnabled: true, remindersEnabled: false });
  f.setTime('2026-11-21T04:00:00Z');
  assert.equal((await f.service.summary(f.uid)).fullness.value, 69);
  await f.service.updateSettings(f.uid, { careEnabled: false });
  f.setTime('2027-01-01T04:00:00Z');
  assert.equal((await f.service.updateSettings(f.uid, { careEnabled: true })).fullness.value, 69);
  f.setTime('2027-03-01T04:00:00Z');
  assert.equal((await f.service.summary(f.uid)).fullness.value, 0);
  assert.equal((await f.award()).coinsGranted, 2);
});

test('catalog IDs exactly match the 42 shipped assets; schema maps to private PostgreSQL tables', () => {
  const pack = JSON.parse(readFileSync(new URL('../assets/avatar/illustrated-v2/manifest.json', import.meta.url)));
  const ids = Object.values(pack.catalog).flatMap(categories => Object.values(categories).flat().map(item => item.id)).sort();
  assert.deepEqual(ITEM_CATALOG.map(item => item.itemId).sort(), ids); assert.equal(ids.length, 42);
  for (const [selectionKey, manifestKey] of [['skin','skin'],['hairColor','hair'],['eyeColor','eyes']])
    assert.deepEqual(AVATAR_PALETTES[selectionKey], pack.palettes[manifestKey].map(palette => palette.id));
  assert.ok(FOODS.every(food => food.cost === 5)); assert.equal(GAMIFICATION_CONFIG.approvalStatus, 'approved');
  const tables = ['economy_accounts','legacy_currency_archives','coin_ledger','economy_streak_days','avatar_item_catalog','avatar_profiles','avatar_inventory','achievement_grants','food_transactions'];
  const migration = readFileSync(new URL('../supabase/migrations/202611150002_gamification.sql', import.meta.url), 'utf8');
  for (const table of tables) {
    assert.match(postgresSql(`SELECT * FROM ${table} WHERE user_id=?`), new RegExp(`FROM mindgarden\\.${table} WHERE user_id=\\$1`));
    assert.ok(migration.includes(`ALTER TABLE mindgarden.${table} ENABLE ROW LEVEL SECURITY`));
    assert.ok(migration.includes(`REVOKE ALL ON mindgarden.${table} FROM PUBLIC, anon, authenticated`));
  }
});

test('export includes audited economy data and account deletion cascades', async t => {
  const f = await fixture(t, { seeds: 5 });
  await f.award(); await f.service.purchaseFood(f.uid, { foodId: 'bento', requestId: 'export-food' });
  const exported = await f.service.exportData(f.uid);
  assert.equal(exported.ledger.length, 3); assert.equal(exported.foodTransactions.length, 1);
  assert.equal(JSON.parse(exported.legacyArchive[0].wallet).seeds, 5);
  await f.db.prepare('DELETE FROM users WHERE id=?').run(f.uid);
  for (const table of ['coin_ledger','food_transactions','economy_accounts','avatar_profiles','avatar_inventory','achievement_grants','legacy_currency_archives'])
    assert.equal((await f.db.prepare(`SELECT COUNT(*) count FROM ${table}`).get()).count, 0);
});

test('nonstarter cosmetics have substantial category prices while food and earnings stay unchanged', () => {
  const paid = ITEM_CATALOG.filter(item => item.purchasable);
  assert.equal(paid.length, 28);
  assert.ok(paid.every(item => Number.isInteger(item.price) && item.price >= 120 && item.price <= 400 && item.unlockRule.type === 'activity'));
  assert.ok(ITEM_CATALOG.filter(item => !item.purchasable).every(item => item.price === null && item.unlockRule.type === 'starter'));
  for (const item of paid) assert.equal(item.price, ITEM_CATALOG.find(other => other.collection !== item.collection && other.category === item.category && other.index === item.index).price);
  assert.ok(FOODS.every(food => food.cost === 5));
  assert.deepEqual(GAMIFICATION_CONFIG.rewards.daily_practice, { coins: 2, xp: 15, dailyCap: 1 });
  assert.deepEqual(GAMIFICATION_CONFIG.rewards.read_aloud, { coins: 3, xp: 0, dailyCap: 1 });
});

test('a wardrobe purchase atomically grants ownership without changing equipment, XP, fullness or achievements', async t => {
  const f = await fixture(t, { seeds: 500, xp: 35 });
  const before = await f.service.summary(f.uid), itemId = 'girl-jacket-sage-cropped';
  const result = await f.service.purchaseItem(f.uid, { itemId, requestId: 'jacket-purchase' });
  assert.equal(result.coinsSpent, 400); assert.equal(result.state.coins, 100); assert.equal(result.alreadyProcessed, false);
  assert.deepEqual(result.item, { id: itemId, name: 'Sage cropped jacket' });
  assert.ok(result.state.avatar.ownedItemIds.includes(itemId));
  assert.deepEqual(result.state.avatar.selection, before.avatar.selection);
  assert.equal(result.state.xp, before.xp); assert.deepEqual(result.state.fullness, before.fullness);
  assert.deepEqual(result.state.achievements, before.achievements); assert.deepEqual(result.state.streak, before.streak);
  assert.equal((await f.service.equip(f.uid, { ...before.avatar.selection, jacket: itemId })).avatar.selection.jacket, itemId);
  const ledger = await f.db.prepare('SELECT * FROM coin_ledger WHERE id=?').get(result.transactionId);
  assert.equal(ledger.coins_delta, -400); assert.equal(ledger.xp_delta, 0); assert.equal(ledger.activity_type, 'avatar_purchase');
  assert.equal(JSON.parse(ledger.data).price, 400);
  assert.ok((await f.service.exportData(f.uid)).ledger.some(row => row.id === result.transactionId));
});

test('purchase prices cannot be supplied by callers and insufficient funds create no ownership or receipt', async t => {
  const f = await fixture(t), itemId = 'girl-hat-wool-beret';
  for (const extra of [{ price: 0 }, { coins: 500 }, { coinsSpent: 0 }, { userId: 'another-user' }])
    await assert.rejects(f.service.purchaseItem(f.uid, { itemId, requestId: 'tamper', ...extra }), error => error.status === 400);
  await assert.rejects(f.service.purchaseItem(f.uid, { itemId, requestId: 'no-funds' }), error => error.code === 'insufficient_coins');
  for (const invalidItem of ['not-an-item','girl-hair-waves'])
    await assert.rejects(f.service.purchaseItem(f.uid, { itemId: invalidItem, requestId: 'invalid' }), error => error.code === 'item_not_purchasable');
  const state = await f.service.summary(f.uid);
  assert.equal(state.coins, 0); assert.equal(state.avatar.ownedItemIds.includes(itemId), false);
  assert.equal((await f.db.prepare("SELECT COUNT(*) count FROM coin_ledger WHERE activity_type='avatar_purchase'").get()).count, 0);
});

test('same-item competing requests charge once and reserve every request key against item substitution', async t => {
  const f = await fixture(t, { seeds: 500 }), itemId = 'girl-hat-wool-beret';
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => f.service.purchaseItem(f.uid, { itemId, requestId: `buy-hat-${i}` })));
  assert.equal(results.filter(result => !result.alreadyProcessed).length, 1);
  assert.equal(results.reduce((sum, result) => sum + result.coinsSpent, 0), 120);
  assert.equal((await f.service.summary(f.uid)).coins, 380);
  assert.equal((await f.db.prepare('SELECT COUNT(*) count FROM avatar_inventory WHERE user_id=? AND item_id=?').get(f.uid, itemId)).count, 1);
  const repeat = await f.service.purchaseItem(f.uid, { itemId, requestId: 'buy-hat-0' });
  assert.equal(repeat.alreadyProcessed, true); assert.equal(repeat.transactionId, results[0].transactionId);
  assert.equal(repeat.coinsSpent, results[0].coinsSpent);
  for (const requestId of ['buy-hat-0','buy-hat-11'])
    await assert.rejects(f.service.purchaseItem(f.uid, { itemId: 'girl-accessory-round-glasses', requestId }), error => error.code === 'idempotency_conflict');
  assert.equal((await f.db.prepare("SELECT COUNT(*) count FROM coin_ledger WHERE activity_type='avatar_purchase' AND coins_delta<0").get()).count, 1);
});

test('different cosmetics competing for a limited wallet cannot overdraw it', async t => {
  const f = await fixture(t, { seeds: 200 });
  const itemIds = ['boy-hat-field-cap','boy-accessory-square-glasses'];
  const results = await Promise.allSettled(itemIds.map((itemId, i) => f.service.purchaseItem(f.uid, { itemId, requestId: `limited-${i}` })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === 'insufficient_coins').length, 1);
  const purchase = results.find(result => result.status === 'fulfilled').value;
  const state = await f.service.summary(f.uid);
  assert.equal(state.coins, 200 - purchase.coinsSpent);
  assert.equal(itemIds.filter(itemId => state.avatar.ownedItemIds.includes(itemId)).length, 1);
});

test('wardrobe receipt failure rolls back both debit and inventory, then the same request can recover', async t => {
  const f = await fixture(t, { seeds: 500 }), itemId = 'boy-jacket-slate-denim';
  const before = await f.service.summary(f.uid);
  await f.db.exec("CREATE TRIGGER fail_avatar_receipt BEFORE INSERT ON coin_ledger WHEN NEW.activity_type='avatar_purchase' BEGIN SELECT RAISE(ABORT,'purchase receipt failure'); END;");
  await assert.rejects(f.service.purchaseItem(f.uid, { itemId, requestId: 'recover-purchase' }), /purchase receipt failure/);
  const after = await f.service.summary(f.uid);
  assert.deepEqual(after.avatar, before.avatar); assert.equal(after.coins, before.coins);
  assert.equal((await f.db.prepare("SELECT COUNT(*) count FROM coin_ledger WHERE activity_type='avatar_purchase'").get()).count, 0);
  await f.db.exec('DROP TRIGGER fail_avatar_receipt');
  assert.equal((await f.service.purchaseItem(f.uid, { itemId, requestId: 'recover-purchase' })).coinsSpent, 400);
});

test('catalog v2 upgrades preserve existing owners and conversion while earned unlocks remain an alternative', async t => {
  const f = await fixture(t, { seeds: 500 });
  await f.award('read_reflect');
  const before = await f.service.summary(f.uid);
  const rows = await f.db.prepare('SELECT * FROM avatar_item_catalog').all();
  for (const row of rows) {
    const item = JSON.parse(row.data); delete item.price; item.purchasable = false;
    await f.db.prepare('UPDATE avatar_item_catalog SET version=1,data=? WHERE item_id=?').run(JSON.stringify(item), row.item_id);
  }
  const migrated = await f.service.summary(f.uid);
  assert.deepEqual(migrated.avatar, before.avatar); assert.equal(migrated.coins, before.coins); assert.equal(migrated.xp, before.xp);
  assert.equal((await f.db.prepare('SELECT COUNT(*) count FROM avatar_item_catalog WHERE version=2').get()).count, 42);
  assert.equal((await f.db.prepare("SELECT COUNT(*) count FROM coin_ledger WHERE activity_type='legacy_conversion'").get()).count, 1);
  const earned = await f.service.purchaseItem(f.uid, { itemId: 'girl-hat-wool-beret', requestId: 'already-earned' });
  assert.equal(earned.coinsSpent, 0); assert.equal(earned.alreadyProcessed, true); assert.equal(earned.state.coins, before.coins);
  await f.service.purchaseItem(f.uid, { itemId: 'girl-accessory-round-glasses', requestId: 'buy-before-earning' });
  const debate = await f.award('ai_debate');
  assert.equal(debate.unlockedItems.includes('girl-accessory-round-glasses'), false);
  assert.ok(debate.unlockedItems.includes('boy-accessory-square-glasses'));
  assert.equal((await f.db.prepare('SELECT COUNT(*) count FROM avatar_inventory WHERE user_id=? AND item_id=?').get(f.uid, 'girl-accessory-round-glasses')).count, 1);
});
