-- KeepXClean D1 Schema (keepxclean.com)
-- 1. Individual Block Reports (Deduplicated by target_uid + reporter_hash -> 1 X account = 1 vote)
CREATE TABLE IF NOT EXISTS block_reports (
  target_uid TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT 'other',
  weight INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (target_uid, reporter_hash)
);

CREATE INDEX IF NOT EXISTS idx_block_reports_reporter ON block_reports(reporter_hash, created_at);

-- 2. Aggregated Account Reputation Table
CREATE TABLE IF NOT EXISTS account_reputation (
  target_uid TEXT PRIMARY KEY,
  screen_name TEXT,
  display_name TEXT,
  followers_count INTEGER NOT NULL DEFAULT 0,
  block_count INTEGER NOT NULL DEFAULT 0,
  spam_count INTEGER NOT NULL DEFAULT 0,
  nsfw_count INTEGER NOT NULL DEFAULT 0,
  scam_count INTEGER NOT NULL DEFAULT 0,
  ad_count INTEGER NOT NULL DEFAULT 0,
  bot_count INTEGER NOT NULL DEFAULT 0,
  dominant_tag TEXT NOT NULL DEFAULT 'other',
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_reputation_block_count ON account_reputation(block_count DESC);

-- 3. Lightweight Sliding Window Rate Limit Table
CREATE TABLE IF NOT EXISTS rate_limits (
  actor_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
);

-- 4. Official Cloud Anti-Spam Keyword Rules
CREATE TABLE IF NOT EXISTS cloud_keywords (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  is_regex INTEGER NOT NULL DEFAULT 1,
  scopes TEXT NOT NULL,
  max_followers_exempt INTEGER DEFAULT 50000,
  note TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
