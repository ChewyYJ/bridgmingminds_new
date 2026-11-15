-- Additive schema only. Per-user conversion occurs once under the account lock.

CREATE TABLE IF NOT EXISTS mindgarden.economy_accounts (
 user_id TEXT PRIMARY KEY REFERENCES mindgarden.users(id) ON DELETE CASCADE,
 coins INTEGER NOT NULL DEFAULT 0 CHECK(coins>=0), xp INTEGER NOT NULL CHECK(xp>=0),
 fullness REAL NOT NULL DEFAULT 75 CHECK(fullness>=0 AND fullness<=100),
 fullness_updated_at TEXT NOT NULL, care_enabled INTEGER NOT NULL DEFAULT 0 CHECK(care_enabled IN (0,1)),
 reminders_enabled INTEGER NOT NULL DEFAULT 0 CHECK(reminders_enabled IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.legacy_currency_archives (
 user_id TEXT PRIMARY KEY REFERENCES mindgarden.users(id) ON DELETE CASCADE,
 wallet TEXT NOT NULL, xp INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending_conversion', archived_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.coin_ledger (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL, activity_type TEXT NOT NULL, completion_id TEXT NOT NULL,
 source_key TEXT NOT NULL, local_date TEXT NOT NULL, timezone TEXT NOT NULL,
 coins_delta INTEGER NOT NULL, xp_delta INTEGER NOT NULL CHECK(xp_delta>=0),
 reason TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(user_id,event_id), UNIQUE(user_id,activity_type,completion_id)
);
CREATE INDEX IF NOT EXISTS coin_ledger_activity ON mindgarden.coin_ledger(user_id,local_date,activity_type);
CREATE INDEX IF NOT EXISTS coin_ledger_source ON mindgarden.coin_ledger(user_id,source_key);
CREATE TABLE IF NOT EXISTS mindgarden.economy_streak_days (
 user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE, local_date TEXT NOT NULL,
 timezone TEXT NOT NULL, event_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,local_date)
);
CREATE TABLE IF NOT EXISTS mindgarden.avatar_item_catalog (
 item_id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.avatar_profiles (
 user_id TEXT PRIMARY KEY REFERENCES mindgarden.users(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.avatar_inventory (
 user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
 item_id TEXT NOT NULL REFERENCES mindgarden.avatar_item_catalog(item_id), source_event_id TEXT NOT NULL, granted_at TEXT NOT NULL,
 PRIMARY KEY(user_id,item_id)
);
CREATE TABLE IF NOT EXISTS mindgarden.achievement_grants (
 user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE, achievement_id TEXT NOT NULL,
 data TEXT NOT NULL, earned_at TEXT NOT NULL, PRIMARY KEY(user_id,achievement_id)
);
CREATE TABLE IF NOT EXISTS mindgarden.food_transactions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL, request_hash TEXT NOT NULL, food_id TEXT NOT NULL,
 coins_spent INTEGER NOT NULL CHECK(coins_spent=5), fullness_restored REAL NOT NULL,
 data TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,request_id)
);

ALTER TABLE mindgarden.economy_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.economy_accounts FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.legacy_currency_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.legacy_currency_archives FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.coin_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.coin_ledger FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.economy_streak_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.economy_streak_days FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.avatar_item_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.avatar_item_catalog FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.avatar_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.avatar_profiles FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.avatar_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.avatar_inventory FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.achievement_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.achievement_grants FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.food_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.food_transactions FROM PUBLIC, anon, authenticated;
