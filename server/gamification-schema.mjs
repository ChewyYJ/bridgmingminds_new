// Portable additive migration. Legacy resources remain in users and a one-time
// archive; no currency conversion is performed by this schema.
export const GAMIFICATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS economy_accounts (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 coins INTEGER NOT NULL DEFAULT 0 CHECK(coins>=0), xp INTEGER NOT NULL CHECK(xp>=0),
 fullness REAL NOT NULL DEFAULT 75 CHECK(fullness>=0 AND fullness<=100),
 fullness_updated_at TEXT NOT NULL, care_enabled INTEGER NOT NULL DEFAULT 0 CHECK(care_enabled IN (0,1)),
 reminders_enabled INTEGER NOT NULL DEFAULT 0 CHECK(reminders_enabled IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS legacy_currency_archives (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 wallet TEXT NOT NULL, xp INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending_conversion', archived_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS coin_ledger (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL, activity_type TEXT NOT NULL, completion_id TEXT NOT NULL,
 source_key TEXT NOT NULL, local_date TEXT NOT NULL, timezone TEXT NOT NULL,
 coins_delta INTEGER NOT NULL, xp_delta INTEGER NOT NULL CHECK(xp_delta>=0),
 reason TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(user_id,event_id), UNIQUE(user_id,activity_type,completion_id)
);
CREATE INDEX IF NOT EXISTS coin_ledger_activity ON coin_ledger(user_id,local_date,activity_type);
CREATE INDEX IF NOT EXISTS coin_ledger_source ON coin_ledger(user_id,source_key);
CREATE TABLE IF NOT EXISTS economy_streak_days (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, local_date TEXT NOT NULL,
 timezone TEXT NOT NULL, event_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,local_date)
);
CREATE TABLE IF NOT EXISTS avatar_item_catalog (
 item_id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS avatar_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS avatar_inventory (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 item_id TEXT NOT NULL REFERENCES avatar_item_catalog(item_id), source_event_id TEXT NOT NULL, granted_at TEXT NOT NULL,
 PRIMARY KEY(user_id,item_id)
);
CREATE TABLE IF NOT EXISTS achievement_grants (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, achievement_id TEXT NOT NULL,
 data TEXT NOT NULL, earned_at TEXT NOT NULL, PRIMARY KEY(user_id,achievement_id)
);
CREATE TABLE IF NOT EXISTS food_transactions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL, request_hash TEXT NOT NULL, food_id TEXT NOT NULL,
 coins_spent INTEGER NOT NULL CHECK(coins_spent=5), fullness_restored REAL NOT NULL,
 data TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,request_id)
);
`;
