import { randomUUID, createHash } from 'node:crypto';
import { GAMIFICATION_CONFIG as CONFIG, FOODS, ITEM_CATALOG, ACHIEVEMENTS, AVATAR_PALETTES,
  EQUIPMENT_CATEGORIES, OPTIONAL_EQUIPMENT, defaultEquipment, levelProgress } from '../shared/gamification.mjs';
import { localDay, workoutStreak } from './daily-workout.mjs';

const json = JSON.stringify;
const parse = value => JSON.parse(value);
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const textId = (value, label, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value))
    throw fail(400, `Invalid ${label}.`, 'invalid_input');
  return value;
};
function timezone(value) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return value; }
  catch { throw fail(400, 'Choose a valid timezone.', 'invalid_timezone'); }
}
function iso(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw fail(400, 'Invalid completion timestamp.', 'invalid_timestamp');
  return date.toISOString();
}
function dateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || iso(`${value}T12:00:00Z`).slice(0, 10) !== value)
    throw fail(400, 'Invalid local completion date.', 'invalid_date');
  return value;
}

/** No HTTP reward minting API. Completion methods are internal domain adapters;
 * callers must persist an owned, validated completion in the same transaction.
 * All mutations take the users row lock, shared with the existing server.
 */
export function createGamificationService({ db, now = () => new Date(), validateCompletion } = {}) {
  const instant = () => iso(now());
  async function locked(uid) {
    if (!(await db.lockUser(uid))) throw fail(404, 'Account not found.', 'not_found');
    return db.prepare('SELECT * FROM users WHERE id=?').get(uid);
  }
  async function syncCatalog() {
    const versions = new Map((await db.prepare('SELECT item_id,version FROM avatar_item_catalog').all())
      .map(row => [row.item_id, Number(row.version)]));
    for (const item of ITEM_CATALOG) if ((versions.get(item.itemId) || 0) < CONFIG.version)
      await db.prepare(`INSERT INTO avatar_item_catalog(item_id,version,data) VALUES(?,?,?)
        ON CONFLICT(item_id) DO UPDATE SET version=excluded.version,data=excluded.data
        WHERE avatar_item_catalog.version<excluded.version`).run(item.itemId, CONFIG.version, json(item));
  }
  async function ensure(uid, owner, at) {
    const existing = await db.prepare('SELECT * FROM economy_accounts WHERE user_id=?').get(uid);
    // Additive metadata upgrade only: ownership, equipment, balances and the
    // original conversion receipt are untouched for existing accounts.
    await syncCatalog();
    if (existing) return existing;
    // Snapshot before conversion. The explicitly approved 1:1 policy touches
    // only Seeds; Water/Sunlight and the original wallet remain historical.
    const baselineXp = Math.max(0, Number(owner.xp) || 0);
    const seeds = parse(owner.wallet).seeds || 0;
    if (!Number.isSafeInteger(seeds) || seeds < 0 || !Number.isSafeInteger(baselineXp))
      throw fail(409, 'Legacy balance requires review before conversion.', 'legacy_balance_invalid');
    const initialCoins = seeds * CONFIG.legacyConversion.coinsPerSeed;
    await db.prepare('INSERT INTO legacy_currency_archives(user_id,wallet,xp,status,archived_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING')
      .run(uid, owner.wallet, baselineXp, CONFIG.legacyConversion.policyId, at);
    await db.prepare(`INSERT INTO economy_accounts(user_id,coins,xp,fullness,fullness_updated_at,care_enabled,reminders_enabled,created_at,updated_at)
      VALUES(?,?,?,?,?,0,0,?,?)`).run(uid, initialCoins, baselineXp, CONFIG.initialFullness, at, at, at);
    const tz = timezone(parse(owner.profile).timezone || 'UTC');
    await db.prepare(`INSERT INTO coin_ledger(id,user_id,event_id,activity_type,completion_id,source_key,local_date,timezone,coins_delta,xp_delta,reason,data,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), uid, 'legacy-conversion-v1', 'legacy_conversion', CONFIG.legacyConversion.policyId,
        'legacy-conversion-v1', localDay(at, tz), tz, initialCoins, 0, 'Approved Seeds-to-Coins conversion, 1:1',
        json({ policyId: CONFIG.legacyConversion.policyId, seeds, preservedXp: baselineXp }), at);
    // Only previously secured, server-validated days are migration evidence.
    // Keep date keys rather than recomputing them in the user's current zone.
    const legacyDays = await db.prepare('SELECT local_date,secured_at FROM daily_workout_days WHERE user_id=? ORDER BY local_date').all(uid);
    for (const day of legacyDays) {
      const snapshot = await db.prepare('SELECT timezone FROM daily_activity_completions WHERE user_id=? AND local_date=? ORDER BY completed_at LIMIT 1')
        .get(uid, day.local_date);
      await db.prepare('INSERT INTO economy_streak_days(user_id,local_date,timezone,event_id,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,local_date) DO NOTHING')
        .run(uid, day.local_date, snapshot?.timezone || tz, `legacy-secured-day:${day.local_date}`, day.secured_at);
    }
    const baselineStreak = await streak(uid, localDay(at, tz));
    for (const milestone of CONFIG.streakMilestones) if (baselineStreak.longest >= milestone.days) {
      const key = `streak-milestone:${milestone.days}`;
      await db.prepare(`INSERT INTO coin_ledger(id,user_id,event_id,activity_type,completion_id,source_key,local_date,timezone,coins_delta,xp_delta,reason,data,created_at)
        VALUES(?,?,?,?,?,?,?,?,0,0,?,?,?) ON CONFLICT(user_id,event_id) DO NOTHING`)
        .run(randomUUID(), uid, key, 'streak_milestone', String(milestone.days), key, localDay(at, tz), tz,
          'Historical streak milestone preserved without retroactive reward', json({ configId: CONFIG.id, historicalBaseline: true }), at);
    }
    for (const item of ITEM_CATALOG) {
      if (item.unlockRule.type === 'starter') await db.prepare('INSERT INTO avatar_inventory(user_id,item_id,source_event_id,granted_at) VALUES(?,?,?,?) ON CONFLICT(user_id,item_id) DO NOTHING')
        .run(uid, item.itemId, 'starter-v1', at);
    }
    await db.prepare('INSERT INTO avatar_profiles(user_id,data,updated_at) VALUES(?,?,?)').run(uid, json(defaultEquipment()), at);
    return db.prepare('SELECT * FROM economy_accounts WHERE user_id=?').get(uid);
  }
  function fullness(account, at) {
    const elapsed = Math.max(0, Date.parse(at) - Date.parse(account.fullness_updated_at)) / 3600000;
    return Math.max(0, Math.min(CONFIG.fullnessMaximum,
      Number(account.fullness) - (account.care_enabled ? elapsed * CONFIG.fullnessDecayPerHour : 0)));
  }
  async function streak(uid, day) {
    const days = await db.prepare('SELECT local_date FROM economy_streak_days WHERE user_id=? AND local_date<=? ORDER BY local_date').all(uid, day);
    return workoutStreak(days.map(row => row.local_date), day);
  }
  async function metrics(uid, currentStreak) {
    const rows = await db.prepare("SELECT activity_type,data FROM coin_ledger WHERE user_id=? AND coins_delta>0 AND activity_type IN ('daily_practice','read_aloud','ai_debate','read_reflect')").all(uid);
    const result = { starter: 0, practices: 0, readings: 0, reflections: 0, debates: 0, debateWins: 0, longestStreak: currentStreak.longest };
    for (const row of rows) {
      const metric = { daily_practice: 'practices', read_aloud: 'readings', read_reflect: 'reflections', ai_debate: 'debates' }[row.activity_type];
      result[metric]++;
      const context = parse(row.data).eligibleUnlockContext;
      if (row.activity_type === 'ai_debate' && context?.outcome === 'win' && context.judged === true && context.competitive === true) result.debateWins++;
    }
    return result;
  }
  async function grantProgress(uid, eventId, at, progress) {
    const unlockedItems = [], achievements = [];
    for (const item of ITEM_CATALOG) {
      const rule = item.unlockRule;
      if (rule.type !== 'starter' && progress[rule.metric] >= rule.target) {
        const result = await db.prepare('INSERT INTO avatar_inventory(user_id,item_id,source_event_id,granted_at) VALUES(?,?,?,?) ON CONFLICT(user_id,item_id) DO NOTHING')
          .run(uid, item.itemId, eventId, at);
        if (result.changes) unlockedItems.push(item.itemId);
      }
    }
    for (const achievement of ACHIEVEMENTS) if (progress[achievement.metric] >= achievement.target) {
      const result = await db.prepare('INSERT INTO achievement_grants(user_id,achievement_id,data,earned_at) VALUES(?,?,?,?) ON CONFLICT(user_id,achievement_id) DO NOTHING')
        .run(uid, achievement.id, json({ eventId, configId: CONFIG.id }), at);
      if (result.changes) achievements.push(achievement.id);
    }
    return { unlockedItems, achievements };
  }
  async function state(uid, owner, account, at) {
    const tz = timezone(parse(owner.profile).timezone || 'UTC'), day = localDay(at, tz);
    const currentStreak = await streak(uid, day), progress = await metrics(uid, currentStreak);
    const owned = await db.prepare('SELECT item_id FROM avatar_inventory WHERE user_id=?').all(uid);
    const ownedItemIds = owned.map(row => row.item_id), ownedSet = new Set(ownedItemIds);
    const grants = await db.prepare('SELECT achievement_id,earned_at FROM achievement_grants WHERE user_id=?').all(uid);
    const profile = await db.prepare('SELECT data FROM avatar_profiles WHERE user_id=?').get(uid);
    const legacy = await db.prepare('SELECT status,archived_at FROM legacy_currency_archives WHERE user_id=?').get(uid);
    const level = levelProgress(Number(account.xp));
    return { version: 1, coins: Number(account.coins), xp: Number(account.xp), level: level.level,
      levelProgress: { current: level.current, required: level.required }, streak: currentStreak, timezone: tz,
      avatar: { selection: parse(profile.data), ownedItemIds },
      catalog: ITEM_CATALOG.map(item => ({ ...item, owned: ownedSet.has(item.itemId),
        progress: Math.min(item.unlockRule.target, progress[item.unlockRule.metric] || 0) })),
      foods: FOODS, fullness: { value: Math.floor(fullness(account, at)), max: CONFIG.fullnessMaximum,
        careEnabled: Boolean(account.care_enabled), remindersEnabled: Boolean(account.reminders_enabled) },
      achievements: ACHIEVEMENTS.map(achievement => ({ ...achievement, progress: Math.min(achievement.target, progress[achievement.metric]),
        earnedAt: grants.find(grant => grant.achievement_id === achievement.id)?.earned_at || null })),
      legacy: { status: legacy.status, archivedAt: legacy.archived_at, message: 'Previous Seeds became Coins at 1:1. Your original wallet and XP baseline remain archived.' },
      config: CONFIG };
  }
  async function summary(uid) {
    return db.transaction(async () => {
      const owner = await locked(uid), at = instant(), account = await ensure(uid, owner, at);
      return state(uid, owner, account, at);
    });
  }
  async function duplicate(uid, input) {
    const sameEvent = await db.prepare('SELECT * FROM coin_ledger WHERE user_id=? AND event_id=?').get(uid, input.eventId);
    if (sameEvent && (sameEvent.activity_type !== input.activityType || sameEvent.completion_id !== input.completionId))
      throw fail(409, 'This event ID already belongs to another completion.', 'idempotency_conflict');
    const row = sameEvent || await db.prepare('SELECT * FROM coin_ledger WHERE user_id=? AND activity_type=? AND completion_id=?')
      .get(uid, input.activityType, input.completionId);
    return row ? { ...parse(row.data).receipt, alreadyProcessed: true } : null;
  }
  async function awardValidatedCompletion(uid, input) {
    textId(input?.eventId, 'event ID'); textId(input?.completionId, 'completion ID');
    if (!Object.hasOwn(CONFIG.rewards, input.activityType)) throw fail(400, 'Unknown activity type.', 'invalid_activity');
    return db.transaction(async () => {
      const owner = await locked(uid), at = instant(), account = await ensure(uid, owner, at);
      const prior = await duplicate(uid, input); if (prior) return prior;
      const tz = timezone(input.timezone || parse(owner.profile).timezone || 'UTC');
      const completedAt = iso(input.completedAt || at);
      if (Date.parse(completedAt) > Date.parse(at) + 300000) throw fail(400, 'Completion is in the future.', 'invalid_timestamp');
      const day = input.localDate ? dateKey(input.localDate) : localDay(completedAt, tz);
      const sourceKey = textId(input.dedupeKey || `${input.activityType}:${input.completionId}`, 'completion source', 400);
      const seenSource = await db.prepare('SELECT id FROM coin_ledger WHERE user_id=? AND source_key=?').get(uid, sourceKey);
      const count = await db.prepare('SELECT COUNT(*) count FROM coin_ledger WHERE user_id=? AND activity_type=? AND local_date=? AND (coins_delta>0 OR xp_delta>0)')
        .get(uid, input.activityType, day);
      const rule = CONFIG.rewards[input.activityType], eligible = input.eligible !== false && !seenSource && Number(count.count) < rule.dailyCap;
      let coins = eligible ? rule.coins : 0, xp = eligible ? rule.xp : 0;
      const ledgerId = randomUUID(), reason = eligible ? 'Validated learning completion' : seenSource || input.eligible === false ? 'Extra practice: completion already rewarded' : 'Extra practice: daily reward limit reached';
      const data = { configId: CONFIG.id, eligibleUnlockContext: input.eligibleUnlockContext || {}, completedAt };
      await db.prepare(`INSERT INTO coin_ledger(id,user_id,event_id,activity_type,completion_id,source_key,local_date,timezone,coins_delta,xp_delta,reason,data,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ledgerId, uid, input.eventId, input.activityType, input.completionId, sourceKey, day, tz, coins, xp, reason, json(data), at);
      if (eligible) await db.prepare('INSERT INTO economy_streak_days(user_id,local_date,timezone,event_id,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,local_date) DO NOTHING')
        .run(uid, day, tz, input.eventId, at);
      const currentDay = localDay(at, timezone(parse(owner.profile).timezone || 'UTC'));
      const currentStreak = await streak(uid, currentDay), progress = await metrics(uid, currentStreak);
      const grants = await grantProgress(uid, input.eventId, at, progress);
      // Milestones are once per account, including late completion recovery.
      for (const milestone of CONFIG.streakMilestones) if (eligible && currentStreak.longest >= milestone.days) {
        const key = `streak-milestone:${milestone.days}`;
        const inserted = await db.prepare(`INSERT INTO coin_ledger(id,user_id,event_id,activity_type,completion_id,source_key,local_date,timezone,coins_delta,xp_delta,reason,data,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,event_id) DO NOTHING`)
          .run(randomUUID(), uid, key, 'streak_milestone', String(milestone.days), key, day, tz, milestone.coins, milestone.xp, `${milestone.days} day streak milestone`, json({ configId: CONFIG.id }), at);
        if (inserted.changes) { coins += milestone.coins; xp += milestone.xp; }
      }
      const balance = Number(account.coins) + coins, totalXp = Number(account.xp) + xp;
      await db.prepare('UPDATE economy_accounts SET coins=?,xp=?,updated_at=? WHERE user_id=?').run(balance, totalXp, at, uid);
      await db.prepare('UPDATE users SET xp=? WHERE id=?').run(totalXp, uid);
      const receipt = { ledgerTransactionId: ledgerId, eventId: input.eventId, activityType: input.activityType,
        coinsGranted: coins, xpGranted: xp, balance, level: levelProgress(totalXp).level,
        streak: currentStreak, ...grants, alreadyProcessed: false, eligible, reason, localDate: day };
      await db.prepare('UPDATE coin_ledger SET data=? WHERE id=?').run(json({ ...data, receipt }), ledgerId);
      return receipt;
    });
  }
  async function persistedCompletion(uid, input) {
    const row = await db.prepare('SELECT * FROM attempts WHERE id=? AND user_id=?').get(input.completionId, uid);
    if (!row) throw fail(404, 'Completion not found.', 'not_found');
    const attempt = parse(row.data), sessionRow = await db.prepare('SELECT * FROM sessions WHERE id=? AND user_id=?').get(row.session_id, uid);
    const activityType = { spin_speak: 'daily_practice', read_aloud: 'read_aloud', debate: 'ai_debate', read_reflect: 'read_reflect' }[attempt.mode];
    if (!sessionRow || attempt.status !== 'completed' || !attempt.evaluation || !activityType || input.activityType && activityType !== input.activityType)
      throw fail(409, 'Only a validated completed activity can earn a reward.', 'completion_not_eligible');
    const words = attempt.text?.match(/[\p{L}\p{N}]+/gu) || [];
    if (words.length < 3 || new Set(words.map(word => word.toLowerCase())).size < 2)
      throw fail(409, 'A meaningful completed response is required.', 'completion_not_eligible');
    if (activityType === 'read_aloud' && !(attempt.completionPolicy === 'read-aloud-self-review-v1' && attempt.selfReviewConfirmed === true) &&
      !(attempt.audioId && attempt.evaluation.speech?.status === 'assessed'))
      throw fail(409, 'Finish the reading assessment or self-review first.', 'completion_not_eligible');
    const owner = await db.prepare('SELECT profile FROM users WHERE id=?').get(uid);
    const tz = timezone(parse(owner.profile).timezone || 'UTC');
    const receipt = await db.prepare('SELECT * FROM daily_attempt_receipts WHERE attempt_id=? AND user_id=?').get(input.completionId, uid);
    const completedAt = attempt.completedAt || row.created_at;
    const day = receipt?.local_date || localDay(completedAt, tz), session = parse(sessionRow.data);
    const content = session.newsSource?.id || session.prompt?.id || row.session_id;
    return { eventId: input.eventId || `attempt:${input.completionId}`, activityType, completionId: input.completionId,
      completedAt, timezone: receipt?.timezone || tz, localDate: day,
      dedupeKey: receipt ? `daily:${day}:${receipt.activity_type}` : `${activityType}:${day}:${content}`,
      eligible: !attempt.retryOf, eligibleUnlockContext: {} };
  }
  async function awardCompletion(uid, input) {
    textId(input?.completionId, 'completion ID');
    return db.transaction(async () => {
      await locked(uid);
      const validated = validateCompletion ? await validateCompletion(uid, input, db) : await persistedCompletion(uid, input);
      if (!validated) throw fail(409, 'Completion is not eligible.', 'completion_not_eligible');
      return awardValidatedCompletion(uid, validated);
    });
  }
  async function equip(uid, selection) {
    return db.transaction(async () => {
      const owner = await locked(uid), at = instant(), account = await ensure(uid, owner, at);
      if (!selection || typeof selection !== 'object' || Array.isArray(selection) || !['boy','girl'].includes(selection.collection))
        throw fail(400, 'Choose a valid avatar collection.', 'invalid_equipment');
      const allowed = new Set(['collection', ...Object.keys(AVATAR_PALETTES), ...EQUIPMENT_CATEGORIES]);
      if (Object.keys(selection).some(key => !allowed.has(key))) throw fail(400, 'Unknown avatar setting.', 'invalid_equipment');
      const clean = { collection: selection.collection };
      for (const [key, values] of Object.entries(AVATAR_PALETTES)) {
        if (!values.includes(selection[key])) throw fail(400, `Choose a valid ${key}.`, 'invalid_equipment');
        clean[key] = selection[key];
      }
      const inventory = new Set((await db.prepare('SELECT item_id FROM avatar_inventory WHERE user_id=?').all(uid)).map(row => row.item_id));
      for (const category of EQUIPMENT_CATEGORIES) {
        const itemId = selection[category];
        if (itemId === null && OPTIONAL_EQUIPMENT.includes(category)) { clean[category] = null; continue; }
        const item = ITEM_CATALOG.find(entry => entry.itemId === itemId);
        if (!item || item.collection !== selection.collection || item.category !== category)
          throw fail(400, 'Choose an item from the selected collection and category.', 'invalid_equipment');
        if (!inventory.has(itemId)) throw fail(403, 'Earn or buy this item before equipping it.', 'item_not_owned');
        clean[category] = itemId;
      }
      await db.prepare('UPDATE avatar_profiles SET data=?,updated_at=? WHERE user_id=?').run(json(clean), at, uid);
      return state(uid, owner, account, at);
    });
  }
  async function purchaseItem(uid, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['itemId','requestId'].includes(key)))
      throw fail(400, 'Choose an item and a purchase request ID. Prices are set by the server.', 'invalid_purchase');
    const itemId = textId(input.itemId, 'item ID'), requestId = textId(input.requestId, 'purchase request ID', 100);
    return db.transaction(async () => {
      const owner = await locked(uid), at = instant(), account = await ensure(uid, owner, at);
      const existing = await db.prepare("SELECT data FROM coin_ledger WHERE user_id=? AND activity_type='avatar_purchase' AND completion_id=?")
        .get(uid, requestId);
      if (existing) {
        const data = parse(existing.data);
        if (data.itemId !== itemId) throw fail(409, 'This purchase request belongs to another item.', 'idempotency_conflict');
        return { ...data.receipt, alreadyProcessed: true, state: await state(uid, owner, account, at) };
      }
      const item = ITEM_CATALOG.find(entry => entry.itemId === itemId);
      if (!item || !item.purchasable || !Number.isSafeInteger(item.price) || item.price <= 0)
        throw fail(400, 'Choose a listed purchasable wardrobe item.', 'item_not_purchasable');
      const owned = await db.prepare('SELECT item_id FROM avatar_inventory WHERE user_id=? AND item_id=?').get(uid, itemId);
      const coinsSpent = owned ? 0 : item.price;
      if (Number(account.coins) < coinsSpent) throw fail(409, `You need ${item.price} Coins for this item.`, 'insufficient_coins');
      const balance = Number(account.coins) - coinsSpent, transactionId = randomUUID(), eventId = `avatar-purchase:${requestId}`;
      if (!owned) {
        await db.prepare('UPDATE economy_accounts SET coins=?,updated_at=? WHERE user_id=?').run(balance, at, uid);
        await db.prepare('INSERT INTO avatar_inventory(user_id,item_id,source_event_id,granted_at) VALUES(?,?,?,?)')
          .run(uid, itemId, eventId, at);
      }
      // Zero-value receipts also reserve a request key for already-owned items.
      // A competing request can never buy the same item twice or reuse its key
      // to purchase something else later.
      const receipt = { transactionId, item: { id: itemId, name: item.name }, coinsSpent, alreadyProcessed: Boolean(owned) };
      const tz = timezone(parse(owner.profile).timezone || 'UTC');
      await db.prepare(`INSERT INTO coin_ledger(id,user_id,event_id,activity_type,completion_id,source_key,local_date,timezone,coins_delta,xp_delta,reason,data,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,0,?,?,?)`).run(transactionId, uid, eventId, 'avatar_purchase', requestId, `avatar-item:${itemId}`,
          localDay(at, tz), tz, -coinsSpent, owned ? 'Already owned: no Coins charged' : `Bought ${item.name}`,
          json({ configId: CONFIG.id, itemId, price: item.price, receipt }), at);
      return { ...receipt, state: await state(uid, owner, { ...account, coins: balance }, at) };
    });
  }
  async function purchaseFood(uid, input) {
    const requestId = textId(input?.requestId, 'purchase request ID', 100);
    const food = FOODS.find(item => item.id === input.foodId);
    if (!food || Object.keys(input).some(key => !['requestId','foodId'].includes(key))) throw fail(400, 'Choose a listed food.', 'invalid_food');
    const hash = createHash('sha256').update(food.id).digest('hex');
    return db.transaction(async () => {
      const owner = await locked(uid), at = instant(), account = await ensure(uid, owner, at);
      const existing = await db.prepare('SELECT * FROM food_transactions WHERE user_id=? AND request_id=?').get(uid, requestId);
      if (existing) {
        if (existing.request_hash !== hash) throw fail(409, 'This purchase request has different food.', 'idempotency_conflict');
        return { ...parse(existing.data), alreadyProcessed: true, state: await state(uid, owner, account, at) };
      }
      const current = fullness(account, at);
      if (current >= CONFIG.fullnessMaximum) throw fail(409, 'Your avatar is full. You can feed them later.', 'avatar_full');
      if (Number(account.coins) < CONFIG.foodCost) throw fail(409, 'You need 5 Coins for this food.', 'insufficient_coins');
      const next = Math.min(CONFIG.fullnessMaximum, current + food.fullness);
      const balance = Number(account.coins) - CONFIG.foodCost, id = randomUUID();
      await db.prepare('UPDATE economy_accounts SET coins=?,fullness=?,fullness_updated_at=?,updated_at=? WHERE user_id=?')
        .run(balance, next, at, at, uid);
      const tz = timezone(parse(owner.profile).timezone || 'UTC');
      await db.prepare(`INSERT INTO coin_ledger(id,user_id,event_id,activity_type,completion_id,source_key,local_date,timezone,coins_delta,xp_delta,reason,data,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), uid, `food:${requestId}`, 'food_purchase', requestId, `food:${requestId}`,
        localDay(at, tz), tz, -CONFIG.foodCost, 0, `Bought and fed ${food.name}`, json({ foodId: food.id, transactionId: id }), at);
      const receipt = { transactionId: id, foodId: food.id, food: { id: food.id, name: food.name, animation: food.animation }, coinsSpent: CONFIG.foodCost, balance,
        fullness: Math.floor(next), fullnessRestored: next - current, animation: food.animation, alreadyProcessed: false };
      await db.prepare('INSERT INTO food_transactions(id,user_id,request_id,request_hash,food_id,coins_spent,fullness_restored,data,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, uid, requestId, hash, food.id, CONFIG.foodCost, next - current, json(receipt), at);
      return { ...receipt, state: await state(uid, owner, { ...account, coins: balance, fullness: next, fullness_updated_at: at }, at) };
    });
  }
  async function updateSettings(uid, settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || !Object.keys(settings).length ||
      Object.entries(settings).some(([key,value]) => !['careEnabled','remindersEnabled'].includes(key) || typeof value !== 'boolean'))
      throw fail(400, 'Choose valid care settings.', 'invalid_settings');
    return db.transaction(async () => {
      const owner = await locked(uid), at = instant(), account = await ensure(uid, owner, at);
      const updated = { ...account, fullness: fullness(account, at), fullness_updated_at: at,
        care_enabled: Number(settings.careEnabled ?? Boolean(account.care_enabled)),
        reminders_enabled: Number(settings.remindersEnabled ?? Boolean(account.reminders_enabled)) };
      await db.prepare('UPDATE economy_accounts SET fullness=?,fullness_updated_at=?,care_enabled=?,reminders_enabled=?,updated_at=? WHERE user_id=?')
        .run(updated.fullness, at, updated.care_enabled, updated.reminders_enabled, at, uid);
      return state(uid, owner, updated, at);
    });
  }
  async function exportData(uid) {
    return db.transaction(async () => {
      const owner = await locked(uid), at = instant(), account = await ensure(uid, owner, at);
      const rows = async table => db.prepare(`SELECT * FROM ${table} WHERE user_id=?`).all(uid);
      return { version: 1, state: await state(uid, owner, account, at),
        ledger: await rows('coin_ledger'), inventory: await rows('avatar_inventory'),
        achievements: await rows('achievement_grants'), foodTransactions: await rows('food_transactions'),
        streakDays: await rows('economy_streak_days'), legacyArchive: await rows('legacy_currency_archives') };
    });
  }
  function rewardPreview(activityType) {
    const reward = CONFIG.rewards[activityType];
    if (!reward) throw fail(400, 'Unknown activity type.', 'invalid_activity');
    return { ...reward, configId: CONFIG.id,
      unlockNote: activityType === 'ai_debate' ? 'Eligible completions unlock wardrobe items. A judged competitive win unlocks performance items.'
        : activityType === 'read_reflect' ? 'Eligible reflections unlock wardrobe items.' : null };
  }
  return { summary, awardCompletion, awardValidatedCompletion, equip, purchaseItem, purchaseFood, updateSettings, exportData, rewardPreview };
}
