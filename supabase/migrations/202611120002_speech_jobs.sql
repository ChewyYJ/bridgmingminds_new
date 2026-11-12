-- Optional, explicitly consented acoustic analysis. No changes to daily rewards.
CREATE TABLE IF NOT EXISTS mindgarden.speech_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL UNIQUE REFERENCES mindgarden.attempts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed')),
  data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS speech_jobs_users ON mindgarden.speech_jobs(user_id,status);
ALTER TABLE mindgarden.speech_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.speech_jobs FROM PUBLIC, anon, authenticated;
