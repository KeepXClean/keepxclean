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

/**
 * Official @grok Account & Engine v2 Rule Constants
 */
export const OFFICIAL_GROK_UID = '1720665183188922368';
export const OFFICIAL_GROK_SCREEN_NAME = 'grok';
export const DEFAULT_GROK_MAX_MENTION_WEIGHTED_LENGTH = 16;
export const MIN_DUPLICATE_REPLY_WEIGHTED_LENGTH = 12;

/**
 * Offline Rule Pack (kxc-pack-v1) Security Limits
 */
export const MAX_RULE_PACK_BYTES = 2 * 1024 * 1024;
export const MAX_RULE_PACK_KEYWORDS = 200;
export const MAX_RULE_PACK_DOMAINS = 200;
export const MAX_RULE_PACK_BLOCKED_UIDS = 2000;
export const MAX_RULE_PACK_REGEX_LENGTH = 500;
