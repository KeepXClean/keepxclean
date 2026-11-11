export type FilterPresetId = 'light' | 'standard' | 'strict' | 'custom';

export type InterceptionMode = 'strip' | 'collapse';

export type TweetScene = 'timeline' | 'reply' | 'search' | 'profile';

export type KeywordMatchScope = 'text' | 'bio' | 'name' | 'url';

export type BlockReasonTag = 'spam' | 'nsfw' | 'scam' | 'ad' | 'bot' | 'other';

export const BLOCK_REASON_LABELS: Record<BlockReasonTag, string> = {
  spam: '水军/刷屏',
  nsfw: '黄推/引流',
  scam: '诈骗/钓鱼',
  ad: '软广/带货',
  bot: 'AI/机器人',
  other: '低质账号',
};

export interface KeywordRuleItem {
  id: string;
  pattern: string;
  isRegex: boolean;
  scopes: KeywordMatchScope[];
  /**
   * Optional: Exempt authors whose followers exceed this count
   * (prevents accidentally blocking normal discussions by established creators)
   */
  maxFollowersExempt?: number;
  note?: string;
  enabled: boolean;
}

export interface AccountListEntry {
  uid: string;
  screenName: string;
  name?: string;
  avatarUrl?: string;
  tag?: BlockReasonTag;
  reason?: string;
  addedAt: number;
}

export interface FilterRulesConfig {
  /**
   * 1. 高频发内容账号拦截 (Historical daily avg + Short-term sliding window)
   */
  highFrequency: {
    enabled: boolean;
    maxDailyTweets: number;
    slidingWindowEnabled: boolean;
    slidingWindowHours: number;
    slidingWindowMaxTweets: number;
  };
  /**
   * 2. 众包被拉黑人数超过 N 个的人 (Cloudflare Crowd-sourced Blocklist)
   */
  crowdBlock: {
    enabled: boolean;
    minBlockCount: number;
  };
  /**
   * 3. 多维关键词与正则屏蔽 (Tweet text, Author bio, Display name/handle, Expanded URLs)
   */
  keywords: {
    enabled: boolean;
    items: KeywordRuleItem[];
  };
  /**
   * 4. 评论区蓝标水军过滤 (Blue-verified low-follower / pure emoji / ultra-short replies)
   */
  blueReplySpam: {
    enabled: boolean;
    onlyInReplies: boolean;
    maxFollowers: number;
    blockPureEmojiOrShort: boolean;
    minReplyLength: number;
  };
  /**
   * 5. 币圈/标签刷屏过滤 (#Hashtag / $Cashtag spam)
   */
  tagSpam: {
    enabled: boolean;
    maxHashtags: number;
    maxCashtags: number;
  };
  /**
   * 6. 账号质量门槛 (New account age, default avatar, extreme follow/follower ratio)
   */
  accountQuality: {
    enabled: boolean;
    minAccountAgeDays: number;
    blockDefaultAvatarInReplies: boolean;
    maxFollowRatio: number;
    minFollowingForRatioCheck: number;
  };
  /**
   * 7. 原生广告与推广贴抹除 (Promoted tweets)
   */
  hidePromotedAds: {
    enabled: boolean;
  };
}

export interface FilterConfig {
  version: number;
  enabled: boolean;
  preset: FilterPresetId;
  interceptionMode: InterceptionMode;
  /**
   * Smart Scene Exemptions
   */
  exemptFollowing: boolean;
  profileSceneBadgeOnly: boolean;
  /**
   * Action & Cloud Privacy Settings
   */
  syncNativeXBlock: boolean;
  enableCrowdReport: boolean;
  enableCloudKeywords: boolean;
  customApiBaseUrl?: string;
  /**
   * Rule Configurations
   */
  rules: FilterRulesConfig;
  /**
   * Local Whitelist & Blocklist keyed by immutable numeric X rest_id
   */
  whitelistUids: Record<string, AccountListEntry>;
  localBlocklistUids: Record<string, AccountListEntry>;
}

export interface ExtractedAuthor {
  restId: string;
  screenName: string;
  name: string;
  bio: string;
  bioUrls: string[];
  createdAt: string;
  accountAgeDays: number;
  statusesCount: number;
  dailyTweetRate: number;
  followersCount: number;
  friendsCount: number;
  followRatio: number;
  mediaCount: number;
  favouritesCount: number;
  isBlueVerified: boolean;
  following: boolean;
  defaultProfileImage: boolean;
  avatarUrl?: string;
}

export interface ExtractedTweet {
  tweetId: string;
  text: string;
  quotedText?: string;
  urls: string[];
  hashtagCount: number;
  cashtagCount: number;
  isPromoted: boolean;
  isReply: boolean;
  inReplyToTweetId?: string;
  replyCount: number;
  favoriteCount: number;
  viewCount: number;
  scene: TweetScene;
  author: ExtractedAuthor;
  retweetedAuthor?: ExtractedAuthor;
}

export type TriggeredRuleId =
  | 'local_blocklist'
  | 'crowd_block'
  | 'high_frequency_daily'
  | 'high_frequency_window'
  | 'keyword'
  | 'cloud_keyword'
  | 'blue_reply_spam'
  | 'tag_spam'
  | 'account_quality'
  | 'promoted_ad';

export interface InterceptionDecision {
  blocked: boolean;
  action: 'allow' | 'strip' | 'collapse' | 'badge_only';
  ruleId?: TriggeredRuleId;
  reasonText?: string;
  riskBadges: string[];
  evidence?: RuleEvidence[];
}

/** Values captured at decision time, never reconstructed from today's settings. */
export interface RuleEvidence {
  label: string;
  value: string | number | boolean;
}

export interface InterceptionLogEntry {
  id: string;
  tweetId: string;
  authorUid: string;
  authorScreenName: string;
  authorName: string;
  authorAvatar?: string;
  tweetSnippet: string;
  scene: TweetScene;
  ruleId: TriggeredRuleId;
  reasonText: string;
  timestamp: number;
  evidence?: RuleEvidence[];
}

export interface CrowdAccountEntry {
  /** Number of unique verified reporters who blocked this account */
  c: number;
  /** Dominant reason tag */
  t?: BlockReasonTag;
  /** True if target has >= 50,000 followers (requires higher threshold to auto-block) */
  p?: boolean;
}

export interface CrowdBlockSnapshot {
  version: number;
  updatedAt: string;
  domain: string;
  totalAccounts: number;
  totalReports: number;
  counts: Record<string, CrowdAccountEntry>;
  cloudKeywords: KeywordRuleItem[];
}

export interface ViewerProfile {
  restId: string;
  screenName: string;
  accountAgeDays: number;
  followersCount: number;
  reporterHash: string;
}

export interface BlockReportPayload {
  targetUid: string;
  targetScreenName?: string;
  targetName?: string;
  targetFollowersCount?: number;
  tag?: BlockReasonTag;
  reporterUidHash: string;
  reporterAccountAgeDays: number;
  reporterFollowersCount?: number;
}

export interface BatchBlockImportPayload {
  targetUids: string[];
  reporterUidHash: string;
  reporterAccountAgeDays: number;
}
