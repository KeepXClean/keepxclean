-- KeepXClean D1 Snapshot Cache (used when R2 is not bound or as secondary cache)
CREATE TABLE IF NOT EXISTS snapshot_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
