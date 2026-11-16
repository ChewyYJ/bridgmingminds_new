export const ROOM_SCHEMA = `
CREATE TABLE IF NOT EXISTS room_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1), data TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS room_inventory (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 item_id TEXT NOT NULL, source_event_id TEXT NOT NULL, granted_at TEXT NOT NULL,
 PRIMARY KEY(user_id,item_id)
);
`;
