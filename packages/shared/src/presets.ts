import type {
  CrowdBlockSnapshot,
  FilterConfig,
  FilterPresetId,
  FilterRulesConfig,
  KeywordRuleItem,
} from './types';
import { SITE_DOMAIN } from './constants';

export interface PresetMetadata {
  id: Exclude<FilterPresetId, 'custom'>;
  name: string;
  badge: string;
  description: string;
  rules: Omit<FilterRulesConfig, 'keywords'>;
}

export const DEFAULT_CLOUD_KEYWORDS: KeywordRuleItem[] = [
  {
    id: 'cloud-nsfw-bio-1',
    pattern: '(onlyfans\\.com|fansly\\.com|mym\\.fans|candFans)',
    isRegex: true,
    scopes: ['bio', 'url', 'text'],
    maxFollowersExempt: 100_000,
    note: '官方防黄推：成人订阅平台引流链接',
    enabled: true,
  },
  {
    id: 'cloud-nsfw-bio-2',
    pattern: '(看私信|点我头像|置顶有福利|同城可约|免费看片|秘密基地在置顶|门槛福利)',
    isRegex: true,
    scopes: ['bio', 'text', 'name'],
    maxFollowersExempt: 50_000,
    note: '官方防黄推：中文色情引流高频话术',
    enabled: true,
  },
  {
    id: 'cloud-scam-crypto-1',
    pattern: '(airdrop.*claim|free\\s+mint.*wallet|send\\s+sol\\s+to|百倍币|合约带单|胜率9[0-9]%|老师带单)',
    isRegex: true,
    scopes: ['text', 'bio'],
    maxFollowersExempt: 50_000,
    note: '官方防诈骗：币圈假空投/带单杀猪盘话术',
    enabled: true,
  },
  {
    id: 'cloud-spam-tg-1',
    pattern: '(t\\.me/\\+|t\\.me/joinchat|telegram\\.me/)',
    isRegex: true,
    scopes: ['bio', 'url'],
    maxFollowersExempt: 20_000,
    note: '官方防引流：简介挂私密电报群引流小号',
    enabled: true,
  },
];

export const DEFAULT_USER_KEYWORDS: KeywordRuleItem[] = [
  {
    id: 'user-kw-1',
    pattern: '领福利|约炮|看置顶|资源群',
    isRegex: true,
    scopes: ['text', 'bio'],
    maxFollowersExempt: 20_000,
    note: '示例规则：常见垃圾引流词',
    enabled: true,
  },
];

export const PRESET_DEFINITIONS: Record<Exclude<FilterPresetId, 'custom'>, PresetMetadata> = {
  light: {
    id: 'light',
    name: '轻度降噪',
    badge: '🌱 温和',
    description: '仅拦截极端高频机器号、公认诈骗/黄推账号与原生广告，最大限度保留多元内容',
    rules: {
      highFrequency: {
        enabled: true,
        maxDailyTweets: 80,
        slidingWindowEnabled: true,
        slidingWindowHours: 1,
        slidingWindowMaxTweets: 12,
      },
      crowdBlock: {
        enabled: true,
        minBlockCount: 5,
      },
      blueReplySpam: {
        enabled: true,
        onlyInReplies: true,
        maxFollowers: 200,
        blockPureEmojiOrShort: true,
        minReplyLength: 3,
      },
      tagSpam: {
        enabled: true,
        maxHashtags: 7,
        maxCashtags: 4,
      },
      accountQuality: {
        enabled: false,
        minAccountAgeDays: 3,
        blockDefaultAvatarInReplies: true,
        maxFollowRatio: 30,
        minFollowingForRatioCheck: 800,
      },
      hidePromotedAds: {
        enabled: true,
      },
    },
  },
  standard: {
    id: 'standard',
    name: '标准高信噪比',
    badge: '🛡️ 推荐',
    description: '均衡过滤日均 >45 推的营销号、被 ≥3 人拉黑的账号及评论区蓝标水军，日常刷推首选',
    rules: {
      highFrequency: {
        enabled: true,
        maxDailyTweets: 45,
        slidingWindowEnabled: true,
        slidingWindowHours: 1,
        slidingWindowMaxTweets: 8,
      },
      crowdBlock: {
        enabled: true,
        minBlockCount: 3,
      },
      blueReplySpam: {
        enabled: true,
        onlyInReplies: true,
        maxFollowers: 500,
        blockPureEmojiOrShort: true,
        minReplyLength: 5,
      },
      tagSpam: {
        enabled: true,
        maxHashtags: 5,
        maxCashtags: 3,
      },
      accountQuality: {
        enabled: true,
        minAccountAgeDays: 7,
        blockDefaultAvatarInReplies: true,
        maxFollowRatio: 15,
        minFollowingForRatioCheck: 500,
      },
      hidePromotedAds: {
        enabled: true,
      },
    },
  },
  strict: {
    id: 'strict',
    name: '极致净空',
    badge: '🔥 强力',
    description: '严苛拦截日均 >25 推的话痨/搬运号、被 ≥2 人拉黑的账号及一切低质评论水军',
    rules: {
      highFrequency: {
        enabled: true,
        maxDailyTweets: 25,
        slidingWindowEnabled: true,
        slidingWindowHours: 2,
        slidingWindowMaxTweets: 6,
      },
      crowdBlock: {
        enabled: true,
        minBlockCount: 2,
      },
      blueReplySpam: {
        enabled: true,
        onlyInReplies: true,
        maxFollowers: 1500,
        blockPureEmojiOrShort: true,
        minReplyLength: 8,
      },
      tagSpam: {
        enabled: true,
        maxHashtags: 3,
        maxCashtags: 2,
      },
      accountQuality: {
        enabled: true,
        minAccountAgeDays: 14,
        blockDefaultAvatarInReplies: true,
        maxFollowRatio: 8,
        minFollowingForRatioCheck: 300,
      },
      hidePromotedAds: {
        enabled: true,
      },
    },
  },
};

export function createDefaultConfig(
  preset: Exclude<FilterPresetId, 'custom'> = 'standard'
): FilterConfig {
  const presetDef = PRESET_DEFINITIONS[preset];
  return {
    version: 1,
    enabled: true,
    preset,
    interceptionMode: 'strip',
    exemptFollowing: true,
    profileSceneBadgeOnly: true,
    syncNativeXBlock: true,
    enableCrowdReport: true,
    enableCloudKeywords: true,
    rules: {
      ...structuredClone(presetDef.rules),
      keywords: {
        enabled: true,
        items: structuredClone(DEFAULT_USER_KEYWORDS),
      },
    },
    whitelistUids: {},
    localBlocklistUids: {},
  };
}

export function applyPresetToConfig(
  current: FilterConfig,
  preset: Exclude<FilterPresetId, 'custom'>
): FilterConfig {
  const presetDef = PRESET_DEFINITIONS[preset];
  return {
    ...current,
    preset,
    rules: {
      ...structuredClone(presetDef.rules),
      keywords: current.rules.keywords,
    },
  };
}

export function createDefaultCrowdSnapshot(): CrowdBlockSnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    domain: SITE_DOMAIN,
    totalAccounts: 0,
    totalReports: 0,
    counts: {},
    cloudKeywords: structuredClone(DEFAULT_CLOUD_KEYWORDS),
  };
}
