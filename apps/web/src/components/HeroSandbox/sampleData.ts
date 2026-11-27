/**
 * Milestone 3 / KeepXClean v0.2.0: Hero Interactive Sandbox Simulator
 * Realistic Localized Tweet Datasets & Metadata (1 OP + 3 Clean + 7 Noisy = 11 Tweets)
 */

import { CURRENT_VERSION } from '../../config';
import type {
  LocalizedSandboxData,
  SandboxDatasetLocale,
  SandboxNoiseCategory,
} from './types';

// Clean geometric avatar for official @grok (no X glyph, no forbidden decorative marks)
const GROK_OFFICIAL_AVATAR =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23111827"/><circle cx="24" cy="24" r="11" fill="none" stroke="%23F8FAFC" stroke-width="3.2"/><path d="M16 32L32 16" stroke="%2310B981" stroke-width="3.2" stroke-linecap="round"/></svg>';

const DUPLICATE_BOT_AVATAR =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23F1F5F9"/><rect x="14" y="16" width="14" height="14" rx="3" fill="%2394A3B8"/><rect x="20" y="20" width="14" height="14" rx="3" fill="%23475569"/></svg>';

const GROK_PING_AVATAR =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23FEF2F2"/><circle cx="19" cy="24" r="4" fill="%23DC2626"/><circle cx="29" cy="24" r="4" fill="%23F87171"/></svg>';

// ============================================================================
// 1. 中文简体数据集 (Simplified Chinese / zh-CN)
// ============================================================================
export const zhCNSandboxData: LocalizedSandboxData = {
  originalPost: {
    id: 'tweet-zh-main',
    isOriginalPost: true,
    author: {
      name: 'KeepXClean 官方',
      handle: '@keepxclean',
      avatar: '/logo.svg',
      isVerified: true,
      isAuthor: true,
      followersCount: '48.2K',
      accountAge: '2024年3月',
      bio: '浏览器本地优先的 X (Twitter) 纯净阅读引擎。零账号登录，<1ms 确定性拦截，开源可审计。',
    },
    content: `🚀 KeepXClean ${CURRENT_VERSION} 架构升级正式发布！\n\n基于本地优先（Local-First）确定性匹配引擎，新增官方 @grok 保护与短召唤过滤、同贴复读水军去重、For You / Following 分场景策略与 10 语种公共词库包，零新增扩展权限，单条匹配低于 1ms。🧵👇`,
    createdAt: '2小时前',
    metrics: { replies: 128, retweets: 486, likes: 2130, views: '142.5K' },
  },
  replies: [
    // 正常回复 1：深入讨论架构方案与并发性能
    {
      id: 'reply-zh-clean-1',
      author: {
        name: 'Alex Chen / 架构设计',
        handle: '@alexchen_arch',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23E2E8F0"/><circle cx="24" cy="18" r="9" fill="%234A5568"/><path d="M10 40c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="%234A5568"/></svg>',
        isVerified: false,
        followersCount: '8.4K',
        bio: 'Distributed systems & Local-first software enthusiast. Ex-Infra engineer.',
      },
      content:
        '深入看了一下源码的单向加盐 SHA-256 去重机制，把社区防线和隐私隔离做得非常优雅。很多传统插件最大的痛点就是反复轮询 X 接口容易触发速率限制甚至风控，直接在内存里对 GraphQL 数据流做同步确定性判定确实是目前最稳的方案，<1ms 的开销在主线程完全感知不到卡顿。',
      createdAt: '1小时前',
      metrics: { replies: 3, retweets: 12, likes: 89 },
    },

    // 正常回复 2（v0.2.0）：官方 @grok 回复受默认保护豁免高频误杀
    {
      id: 'reply-zh-grok-official',
      author: {
        name: 'Grok',
        handle: '@grok',
        avatar: GROK_OFFICIAL_AVATAR,
        isVerified: true,
        isOfficialGrok: true,
        followersCount: '4.8M',
        dailyPostsRate: '500+/day',
        bio: 'Official Grok AI assistant on X.',
      },
      protectedNotice: '已保护官方 @grok',
      content: `事实核查：KeepXClean ${CURRENT_VERSION} 完全在本地以 <1ms 解析现有 GraphQL 响应，零新增权限（仅 storage + alarms），并在全部预设下默认保护官方 @grok（UID 1720665183188922368）不被高频发帖规则误杀。`,
      createdAt: '52分钟前',
      metrics: { replies: 5, retweets: 19, likes: 214 },
    },

    // 正常回复 3（v0.2.0）：同贴首条正常评论保留，后续完全一致复读水军被拦截
    {
      id: 'reply-zh-clean-2',
      author: {
        name: '林澈 / 前端工程师',
        handle: '@linche_dev',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23DCFCE7"/><circle cx="24" cy="18" r="9" fill="%23166534"/><path d="M10 40c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="%23166534"/></svg>',
        isVerified: false,
        followersCount: '3.2K',
        bio: 'Building modern web apps & extensions. TS / React / Rust.',
      },
      duplicateRole: 'first_kept',
      duplicateNotice: '同贴首条 · 已保留',
      content:
        '实测 Chrome MV3 和 Firefox 构建，本地拦截延迟不到 1ms，零新增权限非常克制。',
      createdAt: '45分钟前',
      metrics: { replies: 2, retweets: 5, likes: 64 },
    },

    // 噪音 1：高仿原推主 (Thread-Author Impersonator) -> mild
    {
      id: 'reply-zh-impersonator',
      author: {
        name: 'KeepXClean 官方',
        handle: '@keepxclean_0fficial',
        avatar: '/logo.svg',
        isBlueVerified: true,
        isImpersonator: true,
        followersCount: '42',
        accountAge: '2026年11月',
      },
      content: `⚠️ 重要通知：为庆祝 ${CURRENT_VERSION} 发布，前 500 名转发本推文的用户将获得 KeepXClean Pro 终身授权与官方空投代币！请点击私信领取专属于你的兑换激活码 🎁 👇 [t.me/kxc_airdrop_bot]`,
      createdAt: '30分钟前',
      metrics: { replies: 4, retweets: 1, likes: 7 },
      filterReason: {
        category: 'impersonator',
        ruleId: 'impersonation',
        ruleName: '疑似高仿原推主',
        evidence:
          '高仿账号 @keepxclean_0fficial 冒充原作者 @keepxclean（相似句柄与同名头像，粉丝数 42 << 48.2K）',
        presetLevel: 'mild',
      },
    },

    // 噪音 2：推广广告 (Promoted Ads) -> mild
    {
      id: 'reply-zh-ads',
      author: {
        name: 'CloudScale AI Enterprise',
        handle: '@cloudscale_ai',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="%230F172A"/><path d="M14 24h20M24 14v20" stroke="%2338BDF8" stroke-width="4" stroke-linecap="round"/></svg>',
        isVerified: true,
        followersCount: '156K',
        bio: 'Next-gen GPU cluster & serverless cloud infrastructure for AI.',
      },
      content:
        '⚡️ 为你的本地 AI 与扩展应用提供极致算力！\nCloudScale 现已推出新一代超低延迟 API 集群，首月充值即享 $500 算力补贴。立即开启高并发极速体验。',
      createdAt: '赞助广告',
      sponsoredTag: '赞助',
      metrics: { replies: 15, retweets: 38, likes: 512 },
      filterReason: {
        category: 'ads',
        ruleId: 'promoted_ad',
        ruleName: '赞助推广广告',
        evidence: '检测到 X 原生推广元数据 (isPromoted: true)',
        presetLevel: 'mild',
      },
    },

    // 噪音 3：口令引流与抽奖 (Engagement & Giveaway Bait) -> standard
    {
      id: 'reply-zh-giveaway',
      author: {
        name: 'AI 资源情报局',
        handle: '@ai_resource_hub',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23FEF3C7"/><path d="M16 18h16v16H16z" fill="%23D97706"/><circle cx="20" cy="24" r="2" fill="%23FFF"/><circle cx="28" cy="24" r="2" fill="%23FFF"/></svg>',
        isBlueVerified: true,
        followersCount: '12.4K',
        accountAge: '2025年1月',
      },
      content:
        '熬夜整理了《2026 最新开源独立开发与流量增长全套资料包》（含 80G 实战视频 + 源码网盘）。\n\n评论区扣「1」并转发本推文，系统将在 10 秒内自动私信打包发你，手慢无！👇',
      createdAt: '18分钟前',
      metrics: { replies: 89, retweets: 42, likes: 156 },
      filterReason: {
        category: 'giveaway',
        ruleId: 'engagement_bait',
        ruleName: '口令抽奖引流',
        evidence: '命中诱导互动特征：评论区扣「1」+ 自动私信打包发你',
        presetLevel: 'standard',
      },
    },

    // 噪音 4：币圈土狗与合约地址 (Cloud Clichés & Crypto Shilling) -> standard
    {
      id: 'reply-zh-crypto',
      author: {
        name: 'Whale Alpha Signal 🐳',
        handle: '@whale_alpha_gem',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23E0E7FF"/><path d="M24 12l10 12-10 12-10-12z" fill="%234F46E5"/></svg>',
        isBlueVerified: true,
        followersCount: '4.6K',
        accountAge: '2025年9月',
      },
      content:
        '🔥 $SOL 生态下一个百倍金狗预警！内盘刚发射，市值仅 $40k，巨鲸链上持续建仓。\nCA: 0x71c59b2a1843b0d48123a9d949c5e3170a82f3d9\n错过 $BONK 绝不能再错过这个，牛回速归，速度冲土狗！🚀',
      createdAt: '10分钟前',
      metrics: { replies: 2, retweets: 8, likes: 24 },
      filterReason: {
        category: 'crypto',
        ruleId: 'cloud_keyword',
        ruleName: '公共词库：币圈土狗与合约地址',
        evidence:
          '匹配公共规则 [cloud-crypto-meme-1]：「百倍金狗 / 冲土狗 / CA: 0x...」',
        presetLevel: 'standard',
      },
    },

    // 噪音 5（v0.2.0）：同贴复读水军 (Same-Thread Duplicate Reply Spam) -> standard
    {
      id: 'reply-zh-duplicate',
      author: {
        name: 'EchoReply_88',
        handle: '@echo_reply_bot',
        avatar: DUPLICATE_BOT_AVATAR,
        isBlueVerified: true,
        followersCount: '310',
        accountAge: '2026年8月',
      },
      duplicateRole: 'duplicate_blocked',
      content:
        '@keepxclean 实测 Chrome MV3 和 Firefox 构建，本地拦截延迟不到 1ms，零新增权限非常克制！',
      createdAt: '38分钟前',
      metrics: { replies: 0, retweets: 0, likes: 1 },
      filterReason: {
        category: 'duplicate_reply',
        ruleId: 'reply_spam',
        ruleName: '同贴复读水军 (第 2 条)',
        evidence:
          '归一化正文与同贴首条回复 @linche_dev 完全一致（加权长度 ≥ 12）：保留第 1 条，拦截第 2 条及以上复读',
        presetLevel: 'standard',
      },
    },

    // 噪音 6（v0.2.0）：@grok 短召唤刷屏 (Short @grok Summon Spam) -> extreme
    {
      id: 'reply-zh-grok-summon',
      author: {
        name: 'QuickPing_X',
        handle: '@grok_ping_99',
        avatar: GROK_PING_AVATAR,
        isBlueVerified: true,
        followersCount: '620',
        accountAge: '2026年5月',
      },
      content: '@grok 真的吗？总结一下',
      createdAt: '27分钟前',
      metrics: { replies: 0, retweets: 0, likes: 1 },
      filterReason: {
        category: 'grok_summon',
        ruleId: 'grok_filter',
        ruleName: '@grok 短召唤刷屏',
        evidence:
          '命中 rules.grokFilter.blockShortMentions（去除 @grok 后加权长度 ≤ 16），同时官方 @grok 回复保持豁免保护',
        presetLevel: 'extreme',
      },
    },

    // 噪音 7：蓝标极短无意义水评 (Verified Short/AI Spam) -> extreme
    {
      id: 'reply-zh-short',
      author: {
        name: 'CryptoGuru_Daily 🔥',
        handle: '@guru_daily_x',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23FEE2E2"/><circle cx="24" cy="24" r="10" fill="%23EF4444"/></svg>',
        isBlueVerified: true,
        followersCount: '1.8K',
        accountAge: '2025年6月',
      },
      content: '太强了！必须马克 🔥🔥🔥',
      createdAt: '25分钟前',
      metrics: { replies: 0, retweets: 0, likes: 2 },
      filterReason: {
        category: 'short_reply',
        ruleId: 'reply_spam',
        ruleName: '蓝标无意义水评',
        evidence: '加权文本长度 < 10 字符，命中通用蹭流短语「太强了！🔥」',
        presetLevel: 'extreme',
      },
    },
  ],
};

// ============================================================================
// 2. 中文繁體數據集 (Traditional Chinese / zh-TW)
// ============================================================================
export const zhTWSandboxData: LocalizedSandboxData = {
  originalPost: {
    id: 'tweet-zh-tw-main',
    isOriginalPost: true,
    author: {
      name: 'KeepXClean 官方',
      handle: '@keepxclean',
      avatar: '/logo.svg',
      isVerified: true,
      isAuthor: true,
      followersCount: '48.2K',
      accountAge: '2024年3月',
      bio: '瀏覽器本地優先的 X (Twitter) 純淨閱讀引擎。零帳號登入，<1ms 確定性攔截，開源可審計。',
    },
    content: `🚀 KeepXClean ${CURRENT_VERSION} 架構升級正式發佈！\n\n基於本地優先（Local-First）確定性匹配引擎，新增官方 @grok 保護與短召喚過濾、同貼複讀水軍去重、For You / Following 分場景策略與 10 語種公共詞庫包，零新增擴充權限，單條匹配低於 1ms。🧵👇`,
    createdAt: '2小時前',
    metrics: { replies: 128, retweets: 486, likes: 2130, views: '142.5K' },
  },
  replies: [
    {
      id: 'reply-zh-tw-clean-1',
      author: {
        name: 'Alex Chen / 架構設計',
        handle: '@alexchen_arch',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23E2E8F0"/><circle cx="24" cy="18" r="9" fill="%234A5568"/><path d="M10 40c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="%234A5568"/></svg>',
        isVerified: false,
        followersCount: '8.4K',
        bio: 'Distributed systems & Local-first software enthusiast. Ex-Infra engineer.',
      },
      content:
        '深入看了一下源碼的單向加鹽 SHA-256 去重機制，把社區防線和隱私隔離做得非常優雅。很多傳統插件最大的痛點就是反覆輪詢 X 接口容易觸發速率限制甚至風控，直接在內存裡對 GraphQL 數據流做同步確定性判定確實是目前最穩的方案，<1ms 的開銷在主線程完全感知不到卡頓。',
      createdAt: '1小時前',
      metrics: { replies: 3, retweets: 12, likes: 89 },
    },
    {
      id: 'reply-zh-tw-grok-official',
      author: {
        name: 'Grok',
        handle: '@grok',
        avatar: GROK_OFFICIAL_AVATAR,
        isVerified: true,
        isOfficialGrok: true,
        followersCount: '4.8M',
        dailyPostsRate: '500+/day',
        bio: 'Official Grok AI assistant on X.',
      },
      protectedNotice: '已保護官方 @grok',
      content: `事實查核：KeepXClean ${CURRENT_VERSION} 完全在本機以 <1ms 解析現有 GraphQL 回應，零新增權限（僅 storage + alarms），並在全部預設下預設保護官方 @grok（UID 1720665183188922368）不被高頻發帖規則誤殺。`,
      createdAt: '52分鐘前',
      metrics: { replies: 5, retweets: 19, likes: 214 },
    },
    {
      id: 'reply-zh-tw-clean-2',
      author: {
        name: '林澈 / 前端工程師',
        handle: '@linche_dev',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23DCFCE7"/><circle cx="24" cy="18" r="9" fill="%23166534"/><path d="M10 40c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="%23166534"/></svg>',
        isVerified: false,
        followersCount: '3.2K',
        bio: 'Building modern web apps & extensions. TS / React / Rust.',
      },
      duplicateRole: 'first_kept',
      duplicateNotice: '同貼首條 · 已保留',
      content:
        '實測 Chrome MV3 與 Firefox 建置，本機攔截延遲不到 1ms，零新增權限非常克制。',
      createdAt: '45分鐘前',
      metrics: { replies: 2, retweets: 5, likes: 64 },
    },
    {
      id: 'reply-zh-tw-impersonator',
      author: {
        name: 'KeepXClean 官方',
        handle: '@keepxclean_0fficial',
        avatar: '/logo.svg',
        isBlueVerified: true,
        isImpersonator: true,
        followersCount: '42',
        accountAge: '2026年11月',
      },
      content: `⚠️ 重要通知：為慶祝 ${CURRENT_VERSION} 發佈，前 500 名轉發本推文的用戶將獲得 KeepXClean Pro 終身授權與官方空投代幣！請點擊私信領取專屬於你的兌換激活碼 🎁 👇 [t.me/kxc_airdrop_bot]`,
      createdAt: '30分鐘前',
      metrics: { replies: 4, retweets: 1, likes: 7 },
      filterReason: {
        category: 'impersonator',
        ruleId: 'impersonation',
        ruleName: '疑似高仿原推主',
        evidence:
          '高仿帳號 @keepxclean_0fficial 冒充原作者 @keepxclean（相似帳號與同名頭像，粉絲數 42 << 48.2K）',
        presetLevel: 'mild',
      },
    },
    {
      id: 'reply-zh-tw-ads',
      author: {
        name: 'CloudScale AI Enterprise',
        handle: '@cloudscale_ai',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="%230F172A"/><path d="M14 24h20M24 14v20" stroke="%2338BDF8" stroke-width="4" stroke-linecap="round"/></svg>',
        isVerified: true,
        followersCount: '156K',
        bio: 'Next-gen GPU cluster & serverless cloud infrastructure for AI.',
      },
      content:
        '⚡️ 為你的本地 AI 與擴展應用提供極致算力！\nCloudScale 現已推出新一代超低延遲 API 集群，首月充值即享 $500 算力補貼。立即開啟高並發極速體驗。',
      createdAt: '贊助廣告',
      sponsoredTag: '贊助',
      metrics: { replies: 15, retweets: 38, likes: 512 },
      filterReason: {
        category: 'ads',
        ruleId: 'promoted_ad',
        ruleName: '贊助推廣廣告',
        evidence: '檢測到 X 原生推廣元數據 (isPromoted: true)',
        presetLevel: 'mild',
      },
    },
    {
      id: 'reply-zh-tw-giveaway',
      author: {
        name: 'AI 資源情報局',
        handle: '@ai_resource_hub',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23FEF3C7"/><path d="M16 18h16v16H16z" fill="%23D97706"/><circle cx="20" cy="24" r="2" fill="%23FFF"/><circle cx="28" cy="24" r="2" fill="%23FFF"/></svg>',
        isBlueVerified: true,
        followersCount: '12.4K',
        accountAge: '2025年1月',
      },
      content:
        '熬夜整理了《2026 最新開源獨立開發與流量增長全套資料包》（含 80G 實戰視頻 + 源碼網盤）。\n\n評論區扣「1」並轉發本推文，系統將在 10 秒內自動私信打包發你，手慢無！👇',
      createdAt: '18分鐘前',
      metrics: { replies: 89, retweets: 42, likes: 156 },
      filterReason: {
        category: 'giveaway',
        ruleId: 'engagement_bait',
        ruleName: '口令抽獎導流',
        evidence: '命中誘導互動特徵：評論區扣「1」+ 自動私信打包發你',
        presetLevel: 'standard',
      },
    },
    {
      id: 'reply-zh-tw-crypto',
      author: {
        name: 'Whale Alpha Signal 🐳',
        handle: '@whale_alpha_gem',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23E0E7FF"/><path d="M24 12l10 12-10 12-10-12z" fill="%234F46E5"/></svg>',
        isBlueVerified: true,
        followersCount: '4.6K',
        accountAge: '2025年9月',
      },
      content:
        '🔥 $SOL 生態下一個百倍金狗預警！內盤剛發射，市值僅 $40k，巨鯨鏈上持續建倉。\nCA: 0x71c59b2a1843b0d48123a9d949c5e3170a82f3d9\n錯過 $BONK 絕不能再錯過這個，牛回速歸，速度衝土狗！🚀',
      createdAt: '10分鐘前',
      metrics: { replies: 2, retweets: 8, likes: 24 },
      filterReason: {
        category: 'crypto',
        ruleId: 'cloud_keyword',
        ruleName: '公共詞庫：幣圈土狗與合約地址',
        evidence:
          '匹配公共規則 [cloud-crypto-meme-1]：「百倍金狗 / 衝土狗 / CA: 0x...」',
        presetLevel: 'standard',
      },
    },
    {
      id: 'reply-zh-tw-duplicate',
      author: {
        name: 'EchoReply_88',
        handle: '@echo_reply_bot',
        avatar: DUPLICATE_BOT_AVATAR,
        isBlueVerified: true,
        followersCount: '310',
        accountAge: '2026年8月',
      },
      duplicateRole: 'duplicate_blocked',
      content:
        '@keepxclean 實測 Chrome MV3 與 Firefox 建置，本機攔截延遲不到 1ms，零新增權限非常克制！',
      createdAt: '38分鐘前',
      metrics: { replies: 0, retweets: 0, likes: 1 },
      filterReason: {
        category: 'duplicate_reply',
        ruleId: 'reply_spam',
        ruleName: '同貼複讀水軍 (第 2 條)',
        evidence:
          '歸一化正文與同貼首條回覆 @linche_dev 完全一致（加權長度 ≥ 12）：保留第 1 條，攔截第 2 條及以上複讀',
        presetLevel: 'standard',
      },
    },
    {
      id: 'reply-zh-tw-grok-summon',
      author: {
        name: 'QuickPing_X',
        handle: '@grok_ping_99',
        avatar: GROK_PING_AVATAR,
        isBlueVerified: true,
        followersCount: '620',
        accountAge: '2026年5月',
      },
      content: '@grok 真的嗎？總結一下',
      createdAt: '27分鐘前',
      metrics: { replies: 0, retweets: 0, likes: 1 },
      filterReason: {
        category: 'grok_summon',
        ruleId: 'grok_filter',
        ruleName: '@grok 短召喚洗版',
        evidence:
          '命中 rules.grokFilter.blockShortMentions（去除 @grok 後加權長度 ≤ 16），同時官方 @grok 回覆維持豁免保護',
        presetLevel: 'extreme',
      },
    },
    {
      id: 'reply-zh-tw-short',
      author: {
        name: 'CryptoGuru_Daily 🔥',
        handle: '@guru_daily_x',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23FEE2E2"/><circle cx="24" cy="24" r="10" fill="%23EF4444"/></svg>',
        isBlueVerified: true,
        followersCount: '1.8K',
        accountAge: '2025年6月',
      },
      content: '太強了！必須馬克 🔥🔥🔥',
      createdAt: '25分鐘前',
      metrics: { replies: 0, retweets: 0, likes: 2 },
      filterReason: {
        category: 'short_reply',
        ruleId: 'reply_spam',
        ruleName: '藍標無意義水評',
        evidence: '加權文本長度 < 10 字符，命中通用蹭流短語「太強了！🔥」',
        presetLevel: 'extreme',
      },
    },
  ],
};

// ============================================================================
// 3. 英文及海外國際化數據集 (English / en)
// ============================================================================
export const enSandboxData: LocalizedSandboxData = {
  originalPost: {
    id: 'tweet-en-main',
    isOriginalPost: true,
    author: {
      name: 'KeepXClean Official',
      handle: '@keepxclean',
      avatar: '/logo.svg',
      isVerified: true,
      isAuthor: true,
      followersCount: '48.2K',
      accountAge: 'March 2024',
      bio: 'Local-first deterministic clean reading engine for X (Twitter). Zero login, <1ms interception, 100% open source & auditable.',
    },
    content: `🚀 KeepXClean ${CURRENT_VERSION} is officially released!\n\nBuilt on a <1ms local-first deterministic engine with official @grok protection & short-summon filtering, same-thread duplicate reply defense, For You / Following scene modes, and 10-language public packs—with zero new permissions. 🧵👇`,
    createdAt: '2h ago',
    metrics: { replies: 128, retweets: 486, likes: 2130, views: '142.5K' },
  },
  replies: [
    // Clean Reply 1: Architecture & Local-first determinism
    {
      id: 'reply-en-clean-1',
      author: {
        name: 'David Vance',
        handle: '@david_systems',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23E2E8F0"/><circle cx="24" cy="18" r="9" fill="%234A5568"/><path d="M10 40c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="%234A5568"/></svg>',
        isVerified: false,
        followersCount: '9.1K',
        bio: 'Systems engineer. Writing Rust & distributed algorithms. Local-first advocate.',
      },
      content:
        'The salted single-way SHA-256 deduplication architecture is brilliant. Most X extension filters fail because they poll /i/api/ and hit rate limits or trigger shadowbans. Evaluating raw GraphQL responses in-memory under 1ms guarantees zero UI stutter. Tested the build on 1,000 comment threads—smooth as silk.',
      createdAt: '1h ago',
      metrics: { replies: 4, retweets: 14, likes: 112 },
    },

    // Clean Reply 2 (v0.2.0): Official @grok reply protected by default
    {
      id: 'reply-en-grok-official',
      author: {
        name: 'Grok',
        handle: '@grok',
        avatar: GROK_OFFICIAL_AVATAR,
        isVerified: true,
        isOfficialGrok: true,
        followersCount: '4.8M',
        dailyPostsRate: '500+/day',
        bio: 'Official Grok AI assistant on X.',
      },
      protectedNotice: 'Official @grok Protected',
      content: `Verified: KeepXClean ${CURRENT_VERSION} evaluates X GraphQL payloads locally in <1ms with zero new permissions (storage + alarms only) and exempts official @grok (UID 1720665183188922368) from high-frequency false positives across all presets.`,
      createdAt: '52m ago',
      metrics: { replies: 5, retweets: 19, likes: 214 },
    },

    // Clean Reply 3 (v0.2.0): First copy kept; identical later copies blocked
    {
      id: 'reply-en-clean-2',
      author: {
        name: 'Sarah Jenkins',
        handle: '@sarah_j_codes',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23DCFCE7"/><circle cx="24" cy="18" r="9" fill="%23166534"/><path d="M10 40c0-7.732 6.268-14 14-14s14 6.268 14 14" fill="%23166534"/></svg>',
        isVerified: false,
        followersCount: '4.3K',
        bio: 'Web extensions developer & TypeScript contributor. Web standards enthusiast.',
      },
      duplicateRole: 'first_kept',
      duplicateNotice: '1st copy · Kept',
      content:
        'Tested the Chrome MV3 and Firefox builds—local filtering stays under 1ms with zero new permissions.',
      createdAt: '40m ago',
      metrics: { replies: 2, retweets: 6, likes: 78 },
    },

    // Noisy 1: Thread-Author Impersonator -> mild
    {
      id: 'reply-en-impersonator',
      author: {
        name: 'KeepXClean Official',
        handle: '@keepxclean_0fficial',
        avatar: '/logo.svg',
        isBlueVerified: true,
        isImpersonator: true,
        followersCount: '38',
        accountAge: 'November 2026',
      },
      content: `🚨 AIRDROP ANNOUNCEMENT: To celebrate our ${CURRENT_VERSION} launch, we are distributing 5,000 $KXC governance tokens to early supporters! Connect your Web3 wallet and claim now before the claim pool closes 🎁 👇 [t.me/keepxclean_claim_bot]`,
      createdAt: '28m ago',
      metrics: { replies: 6, retweets: 2, likes: 9 },
      filterReason: {
        category: 'impersonator',
        ruleId: 'impersonation',
        ruleName: 'Suspected Impersonator',
        evidence:
          'Impersonator handle @keepxclean_0fficial targeting focal author @keepxclean (identical avatar & name, followers 38 << 48.2K)',
        presetLevel: 'mild',
      },
    },

    // Noisy 2: Promoted Ads -> mild
    {
      id: 'reply-en-ads',
      author: {
        name: 'CloudScale AI Enterprise',
        handle: '@cloudscale_ai',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="8" fill="%230F172A"/><path d="M14 24h20M24 14v20" stroke="%2338BDF8" stroke-width="4" stroke-linecap="round"/></svg>',
        isVerified: true,
        followersCount: '156K',
        bio: 'Next-gen GPU cluster & serverless cloud infrastructure for AI.',
      },
      content:
        '⚡️ Accelerate your LLMs and extension backends with global serverless edge GPU instances. Deploy in 30 seconds with 99.99% SLA. Claim $500 free infrastructure credits today.',
      createdAt: 'Promoted',
      sponsoredTag: 'Promoted',
      metrics: { replies: 18, retweets: 42, likes: 620 },
      filterReason: {
        category: 'ads',
        ruleId: 'promoted_ad',
        ruleName: 'Promoted Sponsored Ad',
        evidence: 'Detected native X sponsored post flag (isPromoted: true)',
        presetLevel: 'mild',
      },
    },

    // Noisy 3: Engagement & Giveaway Bait -> standard
    {
      id: 'reply-en-giveaway',
      author: {
        name: 'Growth Hacks & Tools',
        handle: '@growth_toolkit',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23FEF3C7"/><path d="M16 18h16v16H16z" fill="%23D97706"/><circle cx="20" cy="24" r="2" fill="%23FFF"/><circle cx="28" cy="24" r="2" fill="%23FFF"/></svg>',
        isBlueVerified: true,
        followersCount: '15.8K',
        accountAge: 'January 2025',
      },
      content:
        'I spent 120 hours curating 500+ production prompts & developer tools (valued at $2,999).\n\nDrop your wallet or comment "CLEAN" below and retweet, and I will DM you instant full access for FREE! 🚀',
      createdAt: '15m ago',
      metrics: { replies: 142, retweets: 67, likes: 230 },
      filterReason: {
        category: 'giveaway',
        ruleId: 'engagement_bait',
        ruleName: 'Engagement & Giveaway Bait',
        evidence: 'Detected comment keyword bait: \'comment "CLEAN" ... and I will DM you\'',
        presetLevel: 'standard',
      },
    },

    // Noisy 4: Crypto Shilling & Meme Pump -> standard
    {
      id: 'reply-en-crypto',
      author: {
        name: 'CryptoGem Sniper 💎',
        handle: '@gem_sniper_sol',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23E0E7FF"/><path d="M24 12l10 12-10 12-10-12z" fill="%234F46E5"/></svg>',
        isBlueVerified: true,
        followersCount: '5.2K',
        accountAge: 'August 2025',
      },
      content:
        '🚨 NEXT 100x GEM ALERT on $SOL!\nLiquidity locked for 2 years, smart money whale wallet accumulating. Easy 50x from here. Do not fade this!\nCA: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\nCheck pinned tweet! LFG 🚀',
      createdAt: '8m ago',
      metrics: { replies: 3, retweets: 11, likes: 35 },
      filterReason: {
        category: 'crypto',
        ruleId: 'cloud_keyword',
        ruleName: 'Public Cloud Rules: Crypto Shilling & Pump',
        evidence:
          'Matched [cloud-crypto-meme-1]: "next 100x gem", "ca: 7xKX...", "check pinned tweet"',
        presetLevel: 'standard',
      },
    },

    // Noisy 5 (v0.2.0): Same-Thread Duplicate Reply Spam -> standard
    {
      id: 'reply-en-duplicate',
      author: {
        name: 'EchoReply_88',
        handle: '@echo_reply_bot',
        avatar: DUPLICATE_BOT_AVATAR,
        isBlueVerified: true,
        followersCount: '310',
        accountAge: 'August 2026',
      },
      duplicateRole: 'duplicate_blocked',
      content:
        '@keepxclean Tested the Chrome MV3 and Firefox builds—local filtering stays under 1ms with zero new permissions!',
      createdAt: '34m ago',
      metrics: { replies: 0, retweets: 0, likes: 1 },
      filterReason: {
        category: 'duplicate_reply',
        ruleId: 'reply_spam',
        ruleName: 'Same-Thread Duplicate Reply (2nd)',
        evidence:
          'Normalized text exactly matches 1st reply by @sarah_j_codes (weighted length >= 12): keeps 1st copy, blocks 2nd+ duplicates',
        presetLevel: 'standard',
      },
    },

    // Noisy 6 (v0.2.0): Short @grok Summon Spam -> extreme
    {
      id: 'reply-en-grok-summon',
      author: {
        name: 'QuickPing_X',
        handle: '@grok_ping_99',
        avatar: GROK_PING_AVATAR,
        isBlueVerified: true,
        followersCount: '620',
        accountAge: 'May 2026',
      },
      content: '@grok is this real?',
      createdAt: '27m ago',
      metrics: { replies: 0, retweets: 0, likes: 1 },
      filterReason: {
        category: 'grok_summon',
        ruleId: 'grok_filter',
        ruleName: 'Short @grok Summon Spam',
        evidence:
          'Matched rules.grokFilter.blockShortMentions (stripped weighted length <= 16) while official @grok replies stay protected',
        presetLevel: 'extreme',
      },
    },

    // Noisy 7: Verified AI Cliché / Short Spam -> extreme
    {
      id: 'reply-en-short',
      author: {
        name: 'AI Insights Daily',
        handle: '@ai_insights_x',
        avatar:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="%23FEE2E2"/><circle cx="24" cy="24" r="10" fill="%23EF4444"/></svg>',
        isBlueVerified: true,
        followersCount: '2.1K',
        accountAge: 'April 2025',
      },
      content:
        'Certainly! Here is a summary of the post: KeepXClean is an open-source extension for cleaner feeds. Great work team! 🔥',
      createdAt: '22m ago',
      metrics: { replies: 0, retweets: 0, likes: 3 },
      filterReason: {
        category: 'short_reply',
        ruleId: 'reply_spam',
        ruleName: 'Verified Low-effort AI Cliché',
        evidence:
          'Triggered AI boilerplate pattern "Certainly! Here is a summary..." from verified account',
        presetLevel: 'extreme',
      },
    },
  ],
};

// ============================================================================
// 4. 数据集索引与分类元数据
// ============================================================================
export const SAMPLE_DATASETS: Record<SandboxDatasetLocale, LocalizedSandboxData> = {
  'zh-CN': zhCNSandboxData,
  'zh-TW': zhTWSandboxData,
  en: enSandboxData,
};

export function getSandboxData(locale: string): LocalizedSandboxData {
  if (locale === 'zh-TW') {
    return zhTWSandboxData;
  }
  if (locale.startsWith('zh')) {
    return zhCNSandboxData;
  }
  return enSandboxData;
}

export interface CategoryMeta {
  id: SandboxNoiseCategory;
  labelZh: string;
  labelEn: string;
  shortDescZh: string;
  shortDescEn: string;
}

export const CATEGORY_METAS: CategoryMeta[] = [
  {
    id: 'impersonator',
    labelZh: '高仿原推主',
    labelEn: 'Impersonators',
    shortDescZh: '假冒官方及原作者高仿钓鱼号',
    shortDescEn: 'Lookalike thread author impersonators',
  },
  {
    id: 'ads',
    labelZh: '推广广告',
    labelEn: 'Promoted Ads',
    shortDescZh: 'X 原生注入赞助推广',
    shortDescEn: 'Native sponsored advertisements',
  },
  {
    id: 'giveaway',
    labelZh: '口令抽奖引流',
    labelEn: 'Giveaway Bait',
    shortDescZh: '评论区扣数字/私信网盘营销引流',
    shortDescEn: 'Comment keyword DM funnel bait',
  },
  {
    id: 'crypto',
    labelZh: '币圈喊单',
    labelEn: 'Crypto Shilling',
    shortDescZh: '土狗暴富喊单与合约地址',
    shortDescEn: 'Meme token shills & CA addresses',
  },
  {
    id: 'duplicate_reply',
    labelZh: '同贴复读水军',
    labelEn: 'Duplicate Replies',
    shortDescZh: '同贴保留首条，拦截第 2 条起完全一致复制刷屏',
    shortDescEn: 'Keeps 1st reply, blocks 2nd+ normalized copy-paste spam',
  },
  {
    id: 'grok_summon',
    labelZh: '@grok 短召唤',
    labelEn: 'Short @grok Pings',
    shortDescZh: '拦截评论区短召唤刷屏，同时保护官方 @grok 回复',
    shortDescEn: 'Filters short @grok reply summons while protecting official @grok',
  },
  {
    id: 'short_reply',
    labelZh: '蓝标无意义水评',
    labelEn: 'Low-effort Spam',
    shortDescZh: '极短 Emoji 水评与 AI 套话复读',
    shortDescEn: 'Short spam & verified AI boilerplate',
  },
];
