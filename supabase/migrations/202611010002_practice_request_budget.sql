-- A practice's request allowance never renews merely because time has passed.
ALTER TABLE mindgarden.practice_usage ADD COLUMN IF NOT EXISTS request_count INTEGER NOT NULL DEFAULT 0;
