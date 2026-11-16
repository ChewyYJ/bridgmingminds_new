import { randomUUID } from 'node:crypto';
import { ROOM_CATALOG, STARTER_ROOM_PLACEMENTS, validateRoomPlacements } from '../shared/room.mjs';
import { localDay } from './daily-workout.mjs';

const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100 && !/[\u0000-\u001f]/.test(value);

/** Room and wardrobe share the same account row lock, balance and Coin ledger. */
export function createRoomService({ db, gamification, now = () => new Date() }) {
  const instant = () => new Date(now()).toISOString();
  async function context(uid) {
    if (!(await db.lockUser(uid))) throw fail(404, 'Account not found.', 'room_account_missing');
    const owner = await db.prepare('SELECT profile FROM users WHERE id=?').get(uid);
    let account = await db.prepare('SELECT coins FROM economy_accounts WHERE user_id=?').get(uid);
    // Reuse the existing one-time currency migration, never initialise a second wallet.
    if (!account) {
      await gamification.summary(uid);
      account = await db.prepare('SELECT coins FROM economy_accounts WHERE user_id=?').get(uid);
    }
    const at = instant();
    const created = await db.prepare('INSERT INTO room_profiles(user_id,version,data,created_at,updated_at) VALUES(?,1,?,?,?) ON CONFLICT(user_id) DO NOTHING')
      .run(uid, JSON.stringify(STARTER_ROOM_PLACEMENTS), at, at);
    for (const item of created.changes ? ROOM_CATALOG.filter(entry => entry.starter) : [])
      await db.prepare('INSERT INTO room_inventory(user_id,item_id,source_event_id,granted_at) VALUES(?,?,?,?) ON CONFLICT(user_id,item_id) DO NOTHING')
        .run(uid, item.id, 'room-starter-v1', at);
    return { coins: Number(account.coins), timezone: JSON.parse(owner.profile).timezone || 'UTC', at };
  }
  async function state(uid, coins) {
    const profile = await db.prepare('SELECT version,data FROM room_profiles WHERE user_id=?').get(uid);
    const owned = new Set((await db.prepare('SELECT item_id FROM room_inventory WHERE user_id=?').all(uid)).map(row => row.item_id));
    return { version: Number(profile.version), coins, catalog: ROOM_CATALOG,
      ownedItemIds: ROOM_CATALOG.filter(item => owned.has(item.id)).map(item => item.id), placements: JSON.parse(profile.data) };
  }
  async function summary(uid) {
    return db.transaction(async () => {
      const current = await context(uid);
      return state(uid, current.coins);
    });
  }
  async function saveLayout(uid, input) {
    if (!exactKeys(input, ['version', 'placements']) || !Number.isSafeInteger(input.version) || input.version < 1)
      throw fail(400, 'Send the room version and its placements.', 'room_invalid_layout');
    return db.transaction(async () => {
      const current = await context(uid), room = await state(uid, current.coins);
      if (room.version !== input.version)
        throw fail(409, 'Your room changed in another window. Reload the latest room before saving.', 'room_version_conflict');
      const checked = validateRoomPlacements(input.placements, room.ownedItemIds);
      if (!checked.valid) throw fail(checked.code === 'room_item_not_owned' ? 403 : 400, checked.error, checked.code);
      const changed = await db.prepare('UPDATE room_profiles SET version=version+1,data=?,updated_at=? WHERE user_id=? AND version=?')
        .run(JSON.stringify(checked.placements), current.at, uid, input.version);
      if (changed.changes !== 1) throw fail(409, 'Reload the latest room before saving.', 'room_version_conflict');
      return { ...room, version: room.version + 1, placements: checked.placements };
    });
  }
  async function purchase(uid, input) {
    if (!exactKeys(input, ['itemId', 'requestId']) || !validId(input.itemId) || !validId(input.requestId))
      throw fail(400, 'Choose a listed item and a purchase request ID. Prices are set by the server.', 'room_invalid_purchase');
    return db.transaction(async () => {
      const current = await context(uid);
      const existing = await db.prepare("SELECT data FROM coin_ledger WHERE user_id=? AND activity_type='room_purchase' AND completion_id=?")
        .get(uid, input.requestId);
      if (existing) {
        const receipt = JSON.parse(existing.data);
        if (receipt.itemId !== input.itemId) throw fail(409, 'This purchase request belongs to another item.', 'room_idempotency_conflict');
        return { ...receipt, room: await state(uid, current.coins) };
      }
      const item = ROOM_CATALOG.find(entry => entry.id === input.itemId);
      if (!item || item.starter || !Number.isSafeInteger(item.price) || item.price <= 0)
        throw fail(400, 'Choose a listed shop item.', 'room_item_not_purchasable');
      const owned = await db.prepare('SELECT item_id FROM room_inventory WHERE user_id=? AND item_id=?').get(uid, item.id);
      const coinsSpent = owned ? 0 : item.price, balanceAfter = current.coins - coinsSpent;
      if (balanceAfter < 0) throw fail(409, `You need ${item.price} Coins for this item.`, 'room_insufficient_coins');
      const eventId = `room-purchase:${input.requestId}`;
      if (!owned) {
        const debited = await db.prepare('UPDATE economy_accounts SET coins=coins-?,updated_at=? WHERE user_id=? AND coins>=?')
          .run(coinsSpent, current.at, uid, coinsSpent);
        if (debited.changes !== 1) throw fail(409, `You need ${item.price} Coins for this item.`, 'room_insufficient_coins');
        await db.prepare('INSERT INTO room_inventory(user_id,item_id,source_event_id,granted_at) VALUES(?,?,?,?)')
          .run(uid, item.id, eventId, current.at);
      }
      const receipt = { itemId: item.id, coinsSpent, balanceAfter };
      await db.prepare(`INSERT INTO coin_ledger(id,user_id,event_id,activity_type,completion_id,source_key,local_date,timezone,coins_delta,xp_delta,reason,data,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,0,?,?,?)`).run(randomUUID(), uid, eventId, 'room_purchase', input.requestId, `room-item:${item.id}`,
          localDay(current.at, current.timezone), current.timezone, -coinsSpent,
          owned ? 'Room item already owned: no Coins charged' : `Bought ${item.name}`, JSON.stringify(receipt), current.at);
      return { ...receipt, room: await state(uid, balanceAfter) };
    });
  }
  async function exportData(uid) {
    return db.transaction(async () => {
      const current = await context(uid);
      return { state: await state(uid, current.coins),
        inventory: await db.prepare('SELECT * FROM room_inventory WHERE user_id=?').all(uid),
        purchases: await db.prepare("SELECT * FROM coin_ledger WHERE user_id=? AND activity_type='room_purchase'").all(uid) };
    });
  }
  return { summary, saveLayout, purchase, exportData };
}
