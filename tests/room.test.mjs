import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { openDatabase } from '../server/database.mjs';
import { postgresSql } from '../server/postgres.mjs';
import { createGamificationService } from '../server/gamification.mjs';
import { createRoomService } from '../server/room.mjs';
import { ROOM_CATALOG, ROOM_SIZE, STARTER_ROOM_PLACEMENTS, validateRoomPlacements } from '../shared/room.mjs';

async function fixture(t, coins = 0) {
  const db = openDatabase(':memory:');
  const now = () => new Date('2026-11-16T08:00:00.000Z');
  const gamification = createGamificationService({ db, now });
  const room = createRoomService({ db, gamification, now });
  async function account(seeds = 0) {
    const uid = randomUUID();
    await db.prepare('INSERT INTO users(id,profile,wallet,plots,created_at) VALUES(?,?,?,?,?)')
      .run(uid, '{"timezone":"Asia/Singapore"}', JSON.stringify({ seeds, water: 0, sunlight: 0 }), '[]', now().toISOString());
    return uid;
  }
  const uid = await account(coins);
  t.after(() => db.close());
  return { db, uid, room, gamification, account };
}

test('room validation checks rotated footprints, ownership, unique copies, grid bounds and rug underlay', () => {
  assert.equal(ROOM_SIZE, 8);
  assert.equal(validateRoomPlacements(STARTER_ROOM_PLACEMENTS).valid, true);
  const place = (itemId, x, y, rotation = 0) => ({ itemId, x, y, rotation });
  assert.equal(validateRoomPlacements([place('oak-desk', 7, 6, 1)]).valid, true);
  assert.equal(validateRoomPlacements([place('oak-desk', 7, 6, 0)]).code, 'room_out_of_bounds');
  assert.equal(validateRoomPlacements([place('oak-desk', 0, 7, 1)]).code, 'room_out_of_bounds');
  assert.equal(validateRoomPlacements([place('oak-desk', 1.5, 1)]).code, 'room_invalid_placement');
  assert.equal(validateRoomPlacements([place('oak-desk', 1, 1, '0')]).code, 'room_invalid_placement');
  assert.equal(validateRoomPlacements([place('oak-desk', -1, 1)]).code, 'room_out_of_bounds');
  assert.equal(validateRoomPlacements([place('oak-desk', 0, 0), place('oak-desk', 5, 5)]).code, 'room_duplicate_item');
  assert.equal(validateRoomPlacements([place('oak-desk', 0, 0), place('linen-chair', 1, 0)]).code, 'room_overlap');
  assert.equal(validateRoomPlacements([place('woven-rug', 0, 0), place('oak-desk', 0, 0)]).valid, true);
  assert.equal(validateRoomPlacements([place('woven-rug', 0, 0), place('oak-desk', 0, 0), place('linen-chair', 1, 0)]).code, 'room_overlap');
  assert.equal(validateRoomPlacements([place('oatmeal-sofa', 0, 0)], ['oak-desk']).code, 'room_item_not_owned');
  assert.equal(validateRoomPlacements([{ ...place('oak-desk', 0, 0), price: 1 }]).valid, false);
  assert.equal(validateRoomPlacements([place('not-an-item', 0, 0)]).code, 'room_unknown_item');
  assert.equal(validateRoomPlacements([]).valid, true);
});

test('room starters are free, owner-isolated and never overwrite a saved or emptied layout', async t => {
  const f = await fixture(t, 17);
  const states = await Promise.all(Array.from({ length: 4 }, () => f.room.summary(f.uid)));
  for (const room of states) {
    assert.equal(room.version, 1); assert.equal(room.coins, 17);
    assert.deepEqual(room.placements, STARTER_ROOM_PLACEMENTS);
    assert.deepEqual(room.ownedItemIds, ROOM_CATALOG.filter(item => item.starter).map(item => item.id));
  }
  assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM room_inventory WHERE user_id=?').get(f.uid)).n, 5);
  assert.equal((await f.room.saveLayout(f.uid, { version: 1, placements: [] })).version, 2);
  assert.deepEqual((await f.room.summary(f.uid)).placements, []);
  assert.equal((await f.gamification.summary(f.uid)).coins, 17);
  const stranger = await f.account();
  assert.equal((await f.room.summary(stranger)).version, 1);
  assert.deepEqual((await f.room.summary(stranger)).placements, STARTER_ROOM_PLACEMENTS);
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM coin_ledger WHERE activity_type='room_purchase'").get()).n, 0);
});

test('concurrent layout edits admit one version and reject stale or unowned placements without changing state', async t => {
  const f = await fixture(t);
  await f.room.summary(f.uid);
  const edits = [0, 4].map(x => f.room.saveLayout(f.uid, { version: 1, placements: [{ itemId: 'oak-desk', x, y: 1, rotation: 0 }] }));
  const results = await Promise.allSettled(edits);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'room_version_conflict');
  const saved = await f.room.summary(f.uid);
  assert.equal(saved.version, 2);
  await assert.rejects(f.room.saveLayout(f.uid, { version: 2, placements: [{ itemId: 'oatmeal-sofa', x: 1, y: 1, rotation: 0 }] }), { code: 'room_item_not_owned' });
  assert.deepEqual(await f.room.summary(f.uid), saved);
  await assert.rejects(f.room.saveLayout(f.uid, { version: 2, placements: [], userId: 'somebody-else' }), { code: 'room_invalid_layout' });
});

test('room purchase charges once, preserves retry receipt and does not place furniture automatically', async t => {
  const f = await fixture(t, 100);
  const request = { itemId: 'ceramic-plant', requestId: 'stable-purchase' };
  const responses = await Promise.all(Array.from({ length: 5 }, () => f.room.purchase(f.uid, request)));
  for (const response of responses) { assert.equal(response.coinsSpent, 12); assert.equal(response.balanceAfter, 88); }
  const room = await f.room.summary(f.uid);
  assert.equal(room.coins, 88); assert.equal(room.version, 1);
  assert.deepEqual(room.placements, STARTER_ROOM_PLACEMENTS);
  assert.ok(room.ownedItemIds.includes('ceramic-plant'));
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM coin_ledger WHERE user_id=? AND activity_type='room_purchase'").get(f.uid)).n, 1);
  await assert.rejects(f.room.purchase(f.uid, { ...request, itemId: 'reading-lamp' }), { code: 'room_idempotency_conflict' });
  await f.room.purchase(f.uid, { itemId: 'reading-lamp', requestId: 'second-item' });
  const replay = await f.room.purchase(f.uid, request);
  assert.equal(replay.balanceAfter, 88); assert.equal(replay.room.coins, 58);
  const alreadyOwned = await f.room.purchase(f.uid, { itemId: 'ceramic-plant', requestId: 'new-key-owned' });
  assert.equal(alreadyOwned.coinsSpent, 0); assert.equal(alreadyOwned.balanceAfter, 58);
  await assert.rejects(f.room.purchase(f.uid, { itemId: 'side-table', requestId: 'new-key-owned' }), { code: 'room_idempotency_conflict' });
  const exported = await f.room.exportData(f.uid);
  assert.equal(exported.purchases.length, 3);
  assert.equal(exported.purchases.reduce((sum, row) => sum + row.coins_delta, 0), -42);
});

test('room and wardrobe purchases share the account lock and cannot overspend the same Coins', async t => {
  const f = await fixture(t, 150);
  const results = await Promise.allSettled([
    f.room.purchase(f.uid, { itemId: 'oatmeal-sofa', requestId: 'room-competing' }),
    f.gamification.purchaseItem(f.uid, { itemId: 'girl-hat-wool-beret', requestId: 'wardrobe-competing' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const economy = await f.gamification.summary(f.uid), room = await f.room.summary(f.uid);
  assert.equal(economy.coins, 30); assert.equal(room.coins, 30);
  assert.equal(Number(room.ownedItemIds.includes('oatmeal-sofa')) + Number(economy.avatar.ownedItemIds.includes('girl-hat-wool-beret')), 1);
});

test('ledger failure rolls back room ownership and Coin debit atomically', async t => {
  const f = await fixture(t, 100);
  const before = await f.room.summary(f.uid);
  await f.db.exec("CREATE TRIGGER room_failure BEFORE INSERT ON coin_ledger WHEN NEW.activity_type='room_purchase' BEGIN SELECT RAISE(ABORT,'room ledger failure'); END");
  await assert.rejects(f.room.purchase(f.uid, { itemId: 'reading-lamp', requestId: 'rollback-check' }), /room ledger failure/);
  assert.deepEqual(await f.room.summary(f.uid), before);
});

test('room schema supports cloud namespacing, private table access and owner deletion cascades', async t => {
  assert.equal(postgresSql('SELECT * FROM room_profiles WHERE user_id=?'), 'SELECT * FROM mindgarden.room_profiles WHERE user_id=$1');
  assert.equal(postgresSql('INSERT INTO room_inventory(user_id,item_id) VALUES(?,?)'), 'INSERT INTO mindgarden.room_inventory(user_id,item_id) VALUES($1,$2)');
  const migration = await readFile(new URL('../supabase/migrations/202611160001_rooms.sql', import.meta.url), 'utf8');
  for (const table of ['room_profiles', 'room_inventory']) {
    assert.ok(migration.includes(`ALTER TABLE mindgarden.${table} ENABLE ROW LEVEL SECURITY`));
    assert.ok(migration.includes(`REVOKE ALL ON mindgarden.${table} FROM PUBLIC, anon, authenticated`));
  }
  const f = await fixture(t, 100);
  await f.room.purchase(f.uid, { itemId: 'ceramic-plant', requestId: 'remove-owner' });
  await f.db.prepare('DELETE FROM users WHERE id=?').run(f.uid);
  for (const table of ['room_profiles', 'room_inventory', 'coin_ledger'])
    assert.equal((await f.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE user_id=?`).get(f.uid)).n, 0);
});
