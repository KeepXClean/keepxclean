-- Upgrade cloud_keywords table to add only_in_replies and default max_followers_exempt to NULL
CREATE TABLE cloud_keywords_v2 (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  is_regex INTEGER NOT NULL DEFAULT 1,
  scopes TEXT NOT NULL,
  only_in_replies INTEGER NOT NULL DEFAULT 0,
  max_followers_exempt INTEGER DEFAULT NULL,
  note TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

INSERT INTO cloud_keywords_v2 (
  id,
  pattern,
  is_regex,
  scopes,
  max_followers_exempt,
  note,
  enabled,
  updated_at
)
SELECT
  id,
  pattern,
  is_regex,
  scopes,
  max_followers_exempt,
  note,
  enabled,
  updated_at
FROM cloud_keywords;

DROP TABLE cloud_keywords;

ALTER TABLE cloud_keywords_v2 RENAME TO cloud_keywords;
