CREATE TABLE IF NOT EXISTS mindgarden.vocabulary_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES mindgarden.users(id) ON DELETE CASCADE,
  vocabulary_id TEXT NOT NULL REFERENCES mindgarden.user_vocabulary(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL,
  data TEXT NOT NULL,
  UNIQUE(user_id,vocabulary_id,scheduled_at)
);
CREATE INDEX IF NOT EXISTS vocabulary_review_users ON mindgarden.vocabulary_reviews(user_id);
ALTER TABLE mindgarden.vocabulary_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mindgarden.vocabulary_reviews FROM PUBLIC, anon, authenticated;
