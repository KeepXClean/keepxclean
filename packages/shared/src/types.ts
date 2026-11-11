export type FilterPresetId = 'light' | 'standard' | 'strict' | 'custom';

export type SupportedLocale =
  | 'en'
  | 'zh-CN'
  | 'zh-TW'
  | 'ja'
  | 'ko'
  | 'es'
  | 'pt'
  | 'fr'
  | 'de'
  | 'ru';

export type UILocaleSetting = 'auto' | SupportedLocale;

export type InterceptionMode = 'strip' | 'collapse';

export type TweetScene = 'timeline' | 'reply' | 'search' | 'profile';

export type KeywordMatchScope = 'text' | 'bio' | 'name' | 'url';

export type LanguageFilterMode = 'allow' | 'block';

export type BlockReasonTag = 'spam' | 'nsfw' | 'scam' | 'ad' | 'bot' | 'other';

export const TWEET_LANGUAGE_CODES = [
  'zh',
  'en',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
  'pt',
  'ru',
  'ar',
  'hi',
  'th',
  'vi',
  'id',
  'tr',
] as const;

export interface KeywordRuleItem {
  id: string;
  pattern: string;
  isRegex: boolean;
  scopes: KeywordMatchScope[];
  /**
   * Optional: Only evaluate this keyword in reply / TweetDetail contexts
   */
  onlyInReplies?: boolean;
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
   * 1. 评论区水评与高仿过滤 (Behavior-based reply spam & impersonator detection)
   */
  replySpam: {
    enabled: boolean;
    blockShortOrEmoji: boolean;
    minWeightedLength: number;
    detectImpersonation: boolean;
    blockBioLinkSpam: boolean;
    bioLinkMaxFollowers: number;
    blockPureMediaReplies: boolean;
  };
  /**
   * 2. 诱导互动与口令引流过滤 (DM-keyword bait, RT+Follow giveaways, follow-for-follow)
   */
  engagementBait: {
    enabled: boolean;
    blockCommentGiveaway: boolean;
    blockFollowBack: boolean;
  };
  /**
   * 3. 高频发内容账号拦截 (Historical daily avg + Short-term sliding window)
   */
  highFrequency: {
    enabled: boolean;
    maxDailyTweets: number;
    slidingWindowEnabled: boolean;
    slidingWindowHours: number;
    slidingWindowMaxTweets: number;
  };
  /**
   * 4. 众包被拉黑人数超过 N 个的人 (Cloudflare Crowd-sourced Blocklist)
   */
  crowdBlock: {
    enabled: boolean;
    minBlockCount: number;
  };
  /**
   * 5. 多维关键词与正则屏蔽 (Tweet text, Author bio, Display name/handle, Expanded URLs)
   */
  keywords: {
    enabled: boolean;
    items: KeywordRuleItem[];
  };
  /**
   * 6. 币圈/标签刷屏过滤 (#Hashtag / $Cashtag spam)
   */
  tagSpam: {
    enabled: boolean;
    maxHashtags: number;
    maxCashtags: number;
  };
  /**
   * 7. 账号质量门槛 (New account age, default avatar, extreme follow/follower ratio)
   */
  accountQuality: {
    enabled: boolean;
    minAccountAgeDays: number;
    blockDefaultAvatarInReplies: boolean;
    maxFollowRatio: number;
    minFollowingForRatioCheck: number;
  };
  /**
   * 8. 推文语种过滤 (Native X lang code allowlist / blocklist)
   */
  languageFilter: {
    enabled: boolean;
    mode: LanguageFilterMode;
    languages: string[];
  };
  /**
   * 9. 原生广告与推广贴静默抹除 (Promoted tweets)
   */
  hidePromotedAds: {
    enabled: boolean;
  };
}

export interface FilterConfig {
  version: number;
  enabled: boolean;
  locale: UILocaleSetting;
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
  disabledCloudKeywordIds: string[];
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

export interface FocalTweetAuthor {
  restId: string;
  screenName: string;
  name: string;
  followersCount: number;
}

export interface ExtractedTweet {
  tweetId: string;
  text: string;
  quotedText?: string;
  lang?: string;
  hasMedia?: boolean;
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
  quotedAuthor?: ExtractedAuthor;
  focalAuthor?: FocalTweetAuthor;
}

export type TriggeredRuleId =
  | 'local_blocklist'
  | 'crowd_block'
  | 'high_frequency_daily'
  | 'high_frequency_window'
  | 'keyword'
  | 'cloud_keyword'
  | 'reply_spam'
  | 'impersonation'
  | 'engagement_bait'
  | 'tag_spam'
  | 'account_quality'
  | 'language_filter'
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
  key?: string;
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
