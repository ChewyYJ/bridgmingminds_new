-- Evidence-backed practice suggestions. No automatic mastery or rewards.
CREATE TABLE IF NOT EXISTS mindgarden.skill_observations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL REFERENCES mindgarden.attempts(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES mindgarden.sessions(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL, dimension TEXT NOT NULL CHECK(dimension IN ('B','R','I','D','G','E')),
  data TEXT NOT NULL, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(user_id,attempt_id,dimension)
);
CREATE INDEX IF NOT EXISTS skill_observation_users ON mindgarden.skill_observations(user_id,occurred_at);
ALTER TABLE mindgarden.skill_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.skill_observations FROM PUBLIC, anon, authenticated;
