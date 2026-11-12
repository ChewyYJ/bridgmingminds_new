-- Additive only: historical rewards and gardens are preserved. New daily
-- rewards must not run alongside legacy completion/quest rewards.
CREATE TABLE IF NOT EXISTS mindgarden.daily_attempt_receipts (
  attempt_id TEXT PRIMARY KEY REFERENCES mindgarden.attempts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('read_aloud','spin_speak')),
  local_date TEXT NOT NULL, timezone TEXT NOT NULL, received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mindgarden.daily_activity_completions (
  user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('read_aloud','spin_speak')),
  attempt_id TEXT NOT NULL REFERENCES mindgarden.attempts(id), timezone TEXT NOT NULL,
  completed_at TEXT NOT NULL, PRIMARY KEY(user_id,local_date,activity_type)
);
CREATE TABLE IF NOT EXISTS mindgarden.daily_workout_days (
  user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL, secured_at TEXT NOT NULL,
  PRIMARY KEY(user_id,local_date)
);
ALTER TABLE mindgarden.daily_attempt_receipts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS daily_receipt_days ON mindgarden.daily_attempt_receipts(user_id,local_date,received_at);
ALTER TABLE mindgarden.daily_activity_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindgarden.daily_workout_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.daily_attempt_receipts, mindgarden.daily_activity_completions,
  mindgarden.daily_workout_days FROM PUBLIC, anon, authenticated;
