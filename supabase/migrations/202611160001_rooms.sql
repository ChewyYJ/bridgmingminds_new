-- Additive, owner-scoped room state. Purchases use the existing Coin ledger.
CREATE TABLE IF NOT EXISTS mindgarden.room_profiles (
 user_id TEXT PRIMARY KEY REFERENCES mindgarden.users(id) ON DELETE CASCADE,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), data TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.room_inventory (
 user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
 item_id TEXT NOT NULL, source_event_id TEXT NOT NULL, granted_at TEXT NOT NULL,
 PRIMARY KEY(user_id,item_id)
);
ALTER TABLE mindgarden.room_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.room_profiles FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.room_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.room_inventory FROM PUBLIC, anon, authenticated;
