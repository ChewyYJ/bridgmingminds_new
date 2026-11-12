-- Provisional reading observations, separate from self-report/productive use.
CREATE TABLE IF NOT EXISTS mindgarden.vocabulary_pronunciation (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  vocabulary_id TEXT NOT NULL REFERENCES mindgarden.user_vocabulary(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL REFERENCES mindgarden.attempts(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES mindgarden.sessions(id) ON DELETE CASCADE,
  locale TEXT NOT NULL, data TEXT NOT NULL, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('observed','insufficient_evidence')),
  UNIQUE(user_id,vocabulary_id,session_id,locale)
);
CREATE INDEX IF NOT EXISTS vocabulary_pronunciation_users ON mindgarden.vocabulary_pronunciation(user_id,vocabulary_id,locale,occurred_at);
ALTER TABLE mindgarden.vocabulary_pronunciation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.vocabulary_pronunciation FROM PUBLIC, anon, authenticated;
