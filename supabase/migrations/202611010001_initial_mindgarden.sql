-- Cloud storage is deliberately separate from the existing local SQLite data.
-- Domain payloads remain TEXT in this first migration so exact transcript CAS
-- and existing API serialization retain their current behavior.
CREATE SCHEMA IF NOT EXISTS mindgarden;
REVOKE ALL ON SCHEMA mindgarden FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS mindgarden.users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT,
  profile TEXT NOT NULL, wallet TEXT NOT NULL, plots TEXT NOT NULL,
  decorations TEXT NOT NULL DEFAULT '[]', xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, supabase_user_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS mindgarden.auth_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.attempts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES mindgarden.sessions(id) ON DELETE CASCADE,
  data TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.jobs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES mindgarden.attempts(id) ON DELETE CASCADE,
  status TEXT NOT NULL, error TEXT, retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  lease_owner TEXT, lease_token TEXT, lease_until BIGINT
);
CREATE TABLE IF NOT EXISTS mindgarden.audio (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready', expected_size BIGINT, size_bytes BIGINT, expires_at TEXT
);
CREATE TABLE IF NOT EXISTS mindgarden.journal (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES mindgarden.attempts(id) ON DELETE CASCADE, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.reward_ledger (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL,
  data TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,source_key)
);
CREATE TABLE IF NOT EXISTS mindgarden.reports (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL REFERENCES mindgarden.attempts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.garden_archives (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  data TEXT NOT NULL, archived_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.garden_operations (
  user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL, request_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS mindgarden.friend_rooms (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE,
  creator_id TEXT REFERENCES mindgarden.users(id) ON DELETE SET NULL,
  create_key TEXT NOT NULL, prompt TEXT NOT NULL,
  rounds INTEGER NOT NULL CHECK(rounds IN (2,3)),
  status TEXT NOT NULL CHECK(status IN ('waiting','active','completed','closed')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  close_reason TEXT, UNIQUE(creator_id,create_key)
);
CREATE TABLE IF NOT EXISTS mindgarden.friend_members (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES mindgarden.friend_rooms(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES mindgarden.users(id) ON DELETE SET NULL,
  position TEXT NOT NULL CHECK(position IN ('for','against')),
  seat INTEGER NOT NULL CHECK(seat IN (0,1)), UNIQUE(room_id,user_id), UNIQUE(room_id,seat)
);
CREATE TABLE IF NOT EXISTS mindgarden.friend_turns (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES mindgarden.friend_rooms(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES mindgarden.friend_members(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES mindgarden.users(id) ON DELETE SET NULL,
  turn_index INTEGER NOT NULL, text TEXT NOT NULL,
  audio_id TEXT REFERENCES mindgarden.audio(id) ON DELETE SET NULL,
  request_key TEXT, created_at TEXT NOT NULL,
  UNIQUE(room_id,turn_index), UNIQUE(room_id,user_id,request_key)
);
CREATE TABLE IF NOT EXISTS mindgarden.named_locks (
  name TEXT PRIMARY KEY, owner TEXT NOT NULL, token TEXT NOT NULL UNIQUE, expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, window_end BIGINT NOT NULL
);
-- No user foreign key: deletion work must survive cascading account deletion.
CREATE TABLE IF NOT EXISTS mindgarden.deletion_outbox (
  id TEXT PRIMARY KEY, object_key TEXT NOT NULL, user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at BIGINT NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.practice_usage (
  user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES mindgarden.sessions(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,session_id)
);

CREATE INDEX IF NOT EXISTS friend_members_users ON mindgarden.friend_members(user_id,room_id);
CREATE INDEX IF NOT EXISTS friend_turns_audio ON mindgarden.friend_turns(audio_id,room_id);
CREATE INDEX IF NOT EXISTS friend_rooms_status ON mindgarden.friend_rooms(status,expires_at);
CREATE INDEX IF NOT EXISTS auth_users ON mindgarden.auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS session_users ON mindgarden.sessions(user_id,created_at);
CREATE INDEX IF NOT EXISTS attempt_users ON mindgarden.attempts(user_id,created_at);
CREATE INDEX IF NOT EXISTS jobs_users ON mindgarden.jobs(user_id,status);
CREATE INDEX IF NOT EXISTS jobs_leases ON mindgarden.jobs(status,lease_until);
CREATE INDEX IF NOT EXISTS audio_users ON mindgarden.audio(user_id);
CREATE INDEX IF NOT EXISTS ledger_users ON mindgarden.reward_ledger(user_id,day,kind);
CREATE INDEX IF NOT EXISTS journal_users ON mindgarden.journal(user_id);
CREATE INDEX IF NOT EXISTS reports_users ON mindgarden.reports(user_id);
CREATE INDEX IF NOT EXISTS garden_archives_users ON mindgarden.garden_archives(user_id,archived_at);
CREATE INDEX IF NOT EXISTS named_locks_expiry ON mindgarden.named_locks(expires_at);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON mindgarden.rate_limits(window_end);
CREATE INDEX IF NOT EXISTS deletion_outbox_pending ON mindgarden.deletion_outbox(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS practice_usage_week ON mindgarden.practice_usage(user_id,week_start);

-- Express authorizes every request; anonymous/browser Data API roles get no
-- direct table access. RLS adds default-deny protection if schema exposure
-- is changed later. Server credentials must remain on the server.
DO $migration$
DECLARE entry RECORD;
BEGIN
  FOR entry IN SELECT tablename FROM pg_tables WHERE schemaname = 'mindgarden'
  LOOP
    EXECUTE format('ALTER TABLE mindgarden.%I ENABLE ROW LEVEL SECURITY', entry.tablename);
  END LOOP;
END
$migration$;
REVOKE ALL ON ALL TABLES IN SCHEMA mindgarden FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA mindgarden FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mindgarden REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mindgarden REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
