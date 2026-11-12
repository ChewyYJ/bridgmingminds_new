-- Additive WordBloom scheduling and private evidence. No historical re-scoring.
CREATE TABLE IF NOT EXISTS mindgarden.wordbloom_processed_attempts (
  attempt_id TEXT PRIMARY KEY REFERENCES mindgarden.attempts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE, data TEXT NOT NULL, processed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS wordbloom_processed_users ON mindgarden.wordbloom_processed_attempts(user_id);
ALTER TABLE mindgarden.wordbloom_processed_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.wordbloom_processed_attempts FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS mindgarden.user_vocabulary (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL, source_attempt_id TEXT NOT NULL REFERENCES mindgarden.attempts(id) ON DELETE CASCADE,
  source_day TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('scheduled','introduced','review_due','familiar','dismissed')),
  data TEXT NOT NULL, due_at TEXT NOT NULL, interval_days REAL NOT NULL DEFAULT 3,
  exposure_count INTEGER NOT NULL DEFAULT 0, productive_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,word_id)
);
CREATE TABLE IF NOT EXISTS mindgarden.vocabulary_exposures (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  vocabulary_id TEXT NOT NULL REFERENCES mindgarden.user_vocabulary(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES mindgarden.sessions(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL, completed_at TEXT, outcome TEXT,
  UNIQUE(user_id,vocabulary_id,session_id)
);
CREATE TABLE IF NOT EXISTS mindgarden.vocabulary_observations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  vocabulary_id TEXT NOT NULL REFERENCES mindgarden.user_vocabulary(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL REFERENCES mindgarden.attempts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('suggestion','reading_self_review','productive_use_candidate')),
  data TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,vocabulary_id,attempt_id,kind)
);
CREATE INDEX IF NOT EXISTS vocabulary_due ON mindgarden.user_vocabulary(user_id,status,due_at);
CREATE INDEX IF NOT EXISTS vocabulary_exposure_users ON mindgarden.vocabulary_exposures(user_id,assigned_at);
CREATE INDEX IF NOT EXISTS vocabulary_observation_users ON mindgarden.vocabulary_observations(user_id,created_at);

ALTER TABLE mindgarden.user_vocabulary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.user_vocabulary FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.vocabulary_exposures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.vocabulary_exposures FROM PUBLIC, anon, authenticated;
ALTER TABLE mindgarden.vocabulary_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.vocabulary_observations FROM PUBLIC, anon, authenticated;
