export const SITE_DOMAIN = 'keepxclean.com';
export const SITE_URL = 'https://keepxclean.com';
export const API_BASE_URL = 'https://api.keepxclean.com';
export const CDN_SNAPSHOT_URL = 'https://cdn.keepxclean.com/v1/snapshot.json';
export const DEV_API_BASE_URL = 'http://localhost:8787';

/**
 * Anti-abuse & High-Follower Protection Constants
 */
export const MIN_REPORTER_ACCOUNT_AGE_DAYS = 30;
export const HIGH_FOLLOWER_PROTECT_THRESHOLD = 50_000;
export const HIGH_FOLLOWER_VOTE_MULTIPLIER = 5;

/**
 * Storage Keys for Browser Extension
 */
export const STORAGE_KEYS = {
  CONFIG: 'kxc_filter_config_v1',
  CROWD_SNAPSHOT: 'kxc_crowd_snapshot_v1',
  INTERCEPTION_LOGS: 'kxc_interception_logs_v1',
  STATS: 'kxc_stats_v1',
  VIEWER_PROFILE: 'kxc_viewer_profile_v1',
} as const;

export const MAX_INTERCEPTION_LOGS = 200;
