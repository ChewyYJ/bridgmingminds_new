# Coins, avatar progression and care

This document replaces the active garden economy in `gamification.md`. The user requested Coins-only gameplay and delegated economy decisions. The chosen migration converts existing Seeds to Coins at 1:1. Water, Sunlight and the original wallet remain historical data; they are not active rewards or prices.

`shared/gamification.mjs` is the versioned source of truth. Current configuration ID: `economy-cosmetic-purchases-v2`. Version 2 adds Coin-priced cosmetics; learning rewards, food prices and the original conversion policy are unchanged.

| Eligible completion | Coins | XP | Daily rewarded limit |
| --- | ---: | ---: | ---: |
| Daily Practice | 2 | 15 | 1 |
| Read Aloud | 3 | 0 | 1 |
| Read & Reflect | 3 | 15 | 1 |
| AI Debate | 3 | 15 | 2 |
| Vocabulary review | 0 | 5 | 1 |

Two daily activities fund one food purchase. Every food costs exactly 5 Coins: ramen restores 30 fullness, onigiri 20, bento 35, capped at 100. Purchase and feeding occur in one transaction. A repeated request ID returns the saved receipt; changing its food is rejected. Each food has its own shipped eating animation.

XP is never spent. Existing `users.xp` becomes the progression baseline and is retained in the archive. Levels advance every 100 XP. The first three-day streak awards 2 Coins; the first seven-day streak awards 5 Coins and 10 XP. Milestones occur once per account. A qualifying learning completion records one local calendar day; repeats on that day cannot increase the streak. Calendar arithmetic handles DST. Existing trusted Daily Workout receipts retain their original timezone/day even when evaluation is delayed or the profile timezone changes. Current streak may lapse, but longest streak, achievements and earned items remain.

Care is opt-in and reminders default off. Fullness begins at 75 and, while care is enabled, declines by 0.25 per elapsed hour (6/day). Disabling care pauses decay and re-enabling does not charge paused time. Fullness stays within 0–100 and never blocks learning or removes progress.

All 42 catalog IDs match the existing illustrated avatar assets. Boy and girl collections remain separate when equipping, as explicitly requested by the user. The 14 starter items include all hair choices and a complete basic outfit for both collections. The other 28 items can be bought with earned Coins or unlocked through recorded, rewarded reflection/debate completions. The performance unlock path requires a validated competitive debate win; local or uncertain judging cannot grant it. Catalog rules retain user-facing descriptions and progress targets for the free earned path.

Cosmetics use the same category/tier prices in both collections. Starter items have `price: null` and `purchasable: false`; every nonstarter item has an integer Coin price and `purchasable: true`. Prices do not imply real-money purchases.

| Category | First design | Second design | Third design |
| --- | ---: | ---: | ---: |
| Hair | Starter | Starter | Starter |
| Hats | 120 | 180 | 240 |
| Tops | Starter | 160 | 220 |
| Jackets | Starter | 280 | 400 |
| Bottoms | Starter | 180 | 240 |
| Shoes | Starter | 200 | 280 |
| Accessories | 140 | 300 | 360 |

Buying grants ownership without equipping the item or changing XP, learning progress or achievements. Already-owned items remain owned, including items previously earned. Ownership is persisted independently from equipment; server validation rejects unowned items, wrong categories, mixed collections and invalid palettes. Optional hat, jacket and accessory slots support `null`.

## Transactions and integration

`createGamificationService({db, now})` uses `db.transaction` and the existing `db.lockUser` convention. It exposes `summary`, `equip`, `purchaseItem`, `purchaseFood`, `updateSettings`, `exportData`, `rewardPreview`, and two internal reward adapters:

- `awardCompletion(userId, {completionId, eventId?, activityType?})` reads owned persisted attempts, successful outcome, meaningful response, reading assessment/self-review and trusted daily receipts. Linked practice replays are not rewarded.
- `awardValidatedCompletion(userId, {eventId, activityType, completionId, completedAt, localDate?, timezone?, dedupeKey?, eligibleUnlockContext?})` is exclusively for server modules that have already validated and persisted their completion. Call inside the same outer transaction. There is no public reward-minting route and no client-provided reward amount.

For debate performance, `eligibleUnlockContext` must contain `outcome: 'win'`, `judged: true`, and `competitive: true`. Completion rewards do not depend on agreeing with an opponent. Duplicate event/completion IDs return the original receipt with `alreadyProcessed: true`; its amounts describe the original grant, not another grant. Reusing an event ID for another completion is rejected. Daily caps and trusted content keys limit farming. Ledger entries with zero amounts explain extra practice. Ledger events include source, local date/timezone, amount, reason, configuration ID and timestamp. Purchase rollback restores all state if any write fails.

`POST /api/avatar/purchase` accepts only `{itemId, requestId}` and returns `{state, item: {id, name}, coinsSpent, alreadyProcessed, transactionId}`. The authenticated account and current server catalog determine ownership and price; caller-provided prices, balances or user IDs are rejected. Debit, inventory grant and the `avatar_purchase` ledger receipt commit together. Insufficient Coins return `409 insufficient_coins` without charging or reserving the request ID. Invalid or starter items return `400 item_not_purchasable`.

Replaying a saved request returns its original transaction ID and `coinsSpent`, `alreadyProcessed: true`, and current state; it never charges again. Reusing that request ID for another item returns `409 idempotency_conflict`. Competing requests for the same item serialize under the account lock: only the first can charge, while later requests record zero-cost receipts for existing ownership. Those zero-cost receipts also bind each request ID to the item. A failed transaction rolls back both inventory and debit, allowing a safe retry. This uses the existing ledger uniqueness constraints and requires no new table.

## Migration and data lifecycle

SQLite installs additive tables from `server/gamification-schema.mjs`. PostgreSQL migration `202611150002_gamification.sql` creates matching private, RLS-enabled tables and revokes direct public/authenticated-client access. No live cloud migration was performed by this change.

Catalog metadata is upgraded in place to version 2 on service access. The update preserves catalog IDs, inventory grants, equipped items, balances and conversion receipts, and never downgrades a newer catalog row. An existing owner is not charged to retain an item. Purchase receipts appear in the normal account-export ledger and are deleted with the account through its existing foreign key.

On first service access, one locked transaction snapshots the complete legacy wallet and XP, initializes Coins from nonnegative integer Seeds at 1:1, preserves the XP baseline and writes one conversion ledger event with policy ID `seeds-to-coins-1-to-1-v1`. Original user wallet JSON is not overwritten. Repeat access cannot convert it again. New accounts with a zero legacy wallet start at zero Coins. Invalid legacy balances stop conversion for review instead of losing value. Account export includes state, ledger, inventory, achievements, food receipts, streak days and legacy archive. Foreign keys delete account-owned records when the account is deleted.

Trusted historical `daily_workout_days` are copied into the shared streak without changing their local date. A matching daily completion supplies the original timezone; older rows without that snapshot use the saved profile timezone as metadata. Arbitrary old attempt history is not inferred to be secured days. Migration grants no streak rewards. Previously crossed milestones receive explicit zero-value historical markers, preventing a retroactive payout on the next completion; later newly reached milestones remain eligible.

Core tests exercise duplicate/concurrent completions, food and cosmetic purchase races, conflicting request IDs, price tampering, rollback after debit/inventory writes, exact food cost, existing-owner catalog upgrades, legacy preservation, vocabulary XP, receipt timezone pinning, DST, late milestone recovery, inventory validation, judged unlocks, optional care, catalog parity, PostgreSQL schema mapping and deletion/export. The HTTP purchase test verifies authentication, owner isolation, validation, receipts and export. PostgreSQL transaction behavior still depends on the existing adapter and requires the normal cloud deployment validation; local tests use SQLite.
