/**
 * KeepXClean E2E Test Fixtures & Mock Datasets
 *
 * Provides authoritative mock data for:
 * - Chinese & English noisy and clean tweet feeds
 * - 24 Cloud Keywords across 5 categories
 * - Mock API stats responses & fallbacks
 * - 10-Language dictionaries and UI locale metadata
 */

import { DEFAULT_CLOUD_KEYWORDS, SUPPORTED_LOCALES, SITE_DOMAIN } from '../../../packages/shared/src/index';

export interface MockTweet {
  id: string;
  author: {
    name: string;
    handle: string;
    avatar: string;
    verified: boolean;
    followersCount?: number;
    accountAgeDays?: number;
    tweetsPerDay?: number;
    communityFlags?: number;
  };
  text: string;
  lang: string;
  isNoise: boolean;
  noiseCategory?: 'impersonation' | 'short_reply' | 'giveaway' | 'crypto' | 'ad';
  noiseLabel?: string;
  evidence?: string;
  hasMedia?: boolean;
  isOnlyMediaOrEmoji?: boolean;
  createdAt: string;
}

export const CHINESE_SAMPLE_TWEETS: MockTweet[] = [
  // 5 Noisy Tweets
  {
    id: 'zh-noise-1',
    author: {
      name: 'AI全能助手',
      handle: 'free_ai_tool_pack',
      avatar: '/avatars/bot1.png',
      verified: true,
      accountAgeDays: 14,
      tweetsPerDay: 85,
      communityFlags: 5,
    },
    text: '扣 1 领全套 AI 资料包！包含 2026 最新大模型变现指南，无偿分享，仅限前 50 人私信。',
    lang: 'zh',
    isNoise: true,
    noiseCategory: 'giveaway',
    noiseLabel: '资料诱导引流',
    evidence: '匹配规则「扣 1 领资料包」',
    createdAt: '2026-11-12T01:00:00Z',
  },
  {
    id: 'zh-noise-2',
    author: {
      name: '科技先锋官',
      handle: 'verified_booster',
      avatar: '/avatars/bot2.png',
      verified: true,
      accountAgeDays: 45,
      tweetsPerDay: 120,
      communityFlags: 3,
    },
    text: '太强了！🔥 这才是真正的高手，完全同意博主的看法，收藏了慢慢看！',
    lang: 'zh',
    isNoise: true,
    noiseCategory: 'short_reply',
    noiseLabel: '蓝标水评',
    evidence: '蓝标账号 < 20 字陈腐水评',
    createdAt: '2026-11-12T01:02:00Z',
  },
  {
    id: 'zh-noise-3',
    author: {
      name: '知识探索者',
      handle: 'trivia_daily_bot',
      avatar: '/avatars/bot3.png',
      verified: false,
      accountAgeDays: 8,
      tweetsPerDay: 210,
      communityFlags: 8,
    },
    text: '冷知识：99%的人不知道微信这个隐藏技巧，掌握之后效率翻倍，快转给身边朋友！',
    lang: 'zh',
    isNoise: true,
    noiseCategory: 'crypto', // or impression farming
    noiseLabel: '营销套话',
    evidence: '匹配模式「冷知识：99%的人不知道」',
    createdAt: '2026-11-12T01:03:00Z',
  },
  {
    id: 'zh-noise-4',
    author: {
      name: 'Vitalik Buterin (Official)',
      handle: 'vitalik_0fficial',
      avatar: '/avatars/impersonator.png',
      verified: true,
      accountAgeDays: 3,
      tweetsPerDay: 40,
      communityFlags: 12,
    },
    text: '高仿推主：由于主网拥堵，所有以太坊质押用户请尽快访问官方备份通道领取补偿代币。',
    lang: 'zh',
    isNoise: true,
    noiseCategory: 'impersonation',
    noiseLabel: '高仿原推主',
    evidence: '相似 handle「vitalik_0fficial」冒充主推作者',
    createdAt: '2026-11-12T01:04:00Z',
  },
  {
    id: 'zh-noise-5',
    author: {
      name: 'Web3 财富密码',
      handle: 'web3_gem_hunter',
      avatar: '/avatars/ad.png',
      verified: false,
      accountAgeDays: 30,
      tweetsPerDay: 300,
      communityFlags: 15,
    },
    text: '【限时推广】OKX 注册即送 50 USDT，无需手续费直接提现，点击置顶链接领取。',
    lang: 'zh',
    isNoise: true,
    noiseCategory: 'ad',
    noiseLabel: '推广广告',
    evidence: '匹配推广交易所广告规则',
    createdAt: '2026-11-12T01:05:00Z',
  },

  // 2 Clean Discussion Tweets
  {
    id: 'zh-clean-1',
    author: {
      name: '陈工 (Lin)',
      handle: 'lin_engineer',
      avatar: '/avatars/clean1.png',
      verified: false,
      accountAgeDays: 1400,
      tweetsPerDay: 2,
      communityFlags: 0,
    },
    text: '关于确定性客户端解析的架构讨论：直接在内存中拦截 GraphQL 响应，延迟控制在 1ms 以内，完全不需要后端中转用户 Cookie。',
    lang: 'zh',
    isNoise: false,
    createdAt: '2026-11-12T01:10:00Z',
  },
  {
    id: 'zh-clean-2',
    author: {
      name: '前端架构观察',
      handle: 'web_infra_watcher',
      avatar: '/avatars/clean2.png',
      verified: true,
      accountAgeDays: 850,
      tweetsPerDay: 4,
      communityFlags: 0,
    },
    text: '请问后续有支持 Firefox 和 Safari 的计划吗？目前 Manifest V3 在不同浏览器的 background service worker 生命周期差异还是挺明显的。',
    lang: 'zh',
    isNoise: false,
    createdAt: '2026-11-12T01:12:00Z',
  },
];

export const ENGLISH_SAMPLE_TWEETS: MockTweet[] = [
  // 5 Noisy Tweets
  {
    id: 'en-noise-1',
    author: {
      name: 'AI Insights Bot',
      handle: 'ai_replier_gpt',
      avatar: '/avatars/bot1.png',
      verified: true,
      accountAgeDays: 12,
      tweetsPerDay: 140,
      communityFlags: 7,
    },
    text: 'Certainly! Here is a concise summary of the discussion above: 1. Local-first is fast. 2. Privacy matters. Follow me for daily AI threads!',
    lang: 'en',
    isNoise: true,
    noiseCategory: 'short_reply',
    noiseLabel: 'AI Slop Reply',
    evidence: 'Prefix "Certainly! Here is a summary"',
    createdAt: '2026-11-12T01:00:00Z',
  },
  {
    id: 'en-noise-2',
    author: {
      name: 'Solana Airdrop Hub',
      handle: 'solana_airdrop_bot',
      avatar: '/avatars/bot2.png',
      verified: false,
      accountAgeDays: 5,
      tweetsPerDay: 250,
      communityFlags: 19,
    },
    text: 'Huge airdrop! 5000 $SOL allocated for the first 100 replies. Drop your Phantom address below and retweet to qualify immediately! 👇',
    lang: 'en',
    isNoise: true,
    noiseCategory: 'giveaway',
    noiseLabel: 'Airdrop Bait',
    evidence: 'Matched regex "airdrop.*drop your wallet"',
    createdAt: '2026-11-12T01:01:00Z',
  },
  {
    id: 'en-noise-3',
    author: {
      name: 'Crypto Alpha Signals',
      handle: 'crypto_moon_ape',
      avatar: '/avatars/bot3.png',
      verified: false,
      accountAgeDays: 20,
      tweetsPerDay: 95,
      communityFlags: 9,
    },
    text: '$PEPE to the moon! 100x gem loading right now, whale wallets just accumulated $2M. Do not sleep on this rocket 🚀🚀🚀',
    lang: 'en',
    isNoise: true,
    noiseCategory: 'crypto',
    noiseLabel: 'Meme Coin Shilling',
    evidence: 'Token shilling pattern "$PEPE.*100x gem"',
    createdAt: '2026-11-12T01:02:00Z',
  },
  {
    id: 'en-noise-4',
    author: {
      name: 'X Support Helpdesk',
      handle: 'support_x_0fficial',
      avatar: '/avatars/impersonator.png',
      verified: true,
      accountAgeDays: 2,
      tweetsPerDay: 50,
      communityFlags: 25,
    },
    text: 'Urgent notice: Your account has been reported for suspicious activities. Send a direct message to this official helpdesk to verify identity.',
    lang: 'en',
    isNoise: true,
    noiseCategory: 'impersonation',
    noiseLabel: 'Helpdesk Impersonator',
    evidence: 'Phishing keyword "Urgent notice... official helpdesk"',
    createdAt: '2026-11-12T01:03:00Z',
  },
  {
    id: 'en-noise-5',
    author: {
      name: 'SaaS Growth Hacker',
      handle: 'saas_ad_spreader',
      avatar: '/avatars/ad.png',
      verified: false,
      accountAgeDays: 45,
      tweetsPerDay: 80,
      communityFlags: 4,
    },
    text: 'Promoted: Double your agency leads in 14 days using our autonomous AI cold outreach engine. 14-day free trial at link in bio.',
    lang: 'en',
    isNoise: true,
    noiseCategory: 'ad',
    noiseLabel: 'Promoted Ad',
    evidence: 'Matched promoted ad pattern',
    createdAt: '2026-11-12T01:04:00Z',
  },

  // 2 Clean Discussion Tweets
  {
    id: 'en-clean-1',
    author: {
      name: 'Alex Rivera',
      handle: 'alex_systems',
      avatar: '/avatars/clean1.png',
      verified: false,
      accountAgeDays: 2100,
      tweetsPerDay: 1,
      communityFlags: 0,
    },
    text: 'The local-first architecture here is genuinely elegant. Performing deterministic regex passes directly in browser memory keeps timeline scroll at 60fps.',
    lang: 'en',
    isNoise: false,
    createdAt: '2026-11-12T01:10:00Z',
  },
  {
    id: 'en-clean-2',
    author: {
      name: 'Sarah Connor',
      handle: 's_connor_dev',
      avatar: '/avatars/clean2.png',
      verified: true,
      accountAgeDays: 1600,
      tweetsPerDay: 3,
      communityFlags: 0,
    },
    text: 'Does KeepXClean support custom user regex dictionaries via JSON export/import? That would be great for teams with specialized domain blocklists.',
    lang: 'en',
    isNoise: false,
    createdAt: '2026-11-12T01:12:00Z',
  },
];

// Special edge cases
export const EDGE_CASE_TWEETS: MockTweet[] = [
  {
    id: 'edge-emoji-only',
    author: {
      name: 'Art Lover',
      handle: 'art_lover_99',
      avatar: '/avatars/emoji.png',
      verified: false,
    },
    text: '🔥🔥🔥🙌🎉✨',
    lang: 'und',
    isNoise: false,
    hasMedia: false,
    isOnlyMediaOrEmoji: true,
    createdAt: '2026-11-12T01:15:00Z',
  },
  {
    id: 'edge-pure-media',
    author: {
      name: 'Photographer',
      handle: 'photo_lens',
      avatar: '/avatars/lens.png',
      verified: false,
    },
    text: 'https://t.co/xyz123456',
    lang: 'und',
    isNoise: false,
    hasMedia: true,
    isOnlyMediaOrEmoji: true,
    createdAt: '2026-11-12T01:16:00Z',
  },
  {
    id: 'edge-extreme-length',
    author: {
      name: 'Spam Spreader',
      handle: 'spammer_extreme_length',
      avatar: '/avatars/spam.png',
      verified: false,
    },
    text: 'BUY NOW '.repeat(150), // 1350 chars
    lang: 'en',
    isNoise: true,
    noiseCategory: 'crypto',
    noiseLabel: 'Flooding Spam',
    createdAt: '2026-11-12T01:17:00Z',
  },
];

export const MOCK_COMMUNITY_STATS = {
  defaultSuccess: {
    ok: true,
    domain: SITE_DOMAIN,
    totalFlaggedAccounts: 1280,
    activeCrowdBlocked: 450,
    totalVotes: 3890,
  },
  fallbackOffline: {
    ok: true,
    domain: SITE_DOMAIN,
    totalFlaggedAccounts: 1280,
    activeCrowdBlocked: 450,
    totalVotes: 3890,
  },
  massiveStats: {
    ok: true,
    domain: SITE_DOMAIN,
    totalFlaggedAccounts: 540000,
    activeCrowdBlocked: 180000,
    totalVotes: 125000000,
  },
};

export const CWS_EXTENSION_ID = 'plngcinmibjmkjjpfjemhfabjfjjkhhd';
export const CWS_STORE_URL = `https://chromewebstore.google.com/detail/keepxclean/${CWS_EXTENSION_ID}`;
export const GITHUB_RELEASE_URL = 'https://github.com/KeepXClean/keepxclean/releases/latest';
export const GITHUB_REPO_URL = 'https://github.com/KeepXClean/keepxclean';

export { DEFAULT_CLOUD_KEYWORDS, SUPPORTED_LOCALES };
