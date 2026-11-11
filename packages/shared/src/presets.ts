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
  rules: Omit<FilterRulesConfig, 'keywords' | 'languageFilter'>;
}

export const DEFAULT_CLOUD_KEYWORDS: KeywordRuleItem[] = [
  // 1. 营销套话、引战钩子与洗稿水文 (Impression Farming & Clichés)
  {
    id: 'cloud-cliche-trivia-1',
    pattern: '(冷知识|热知识|涨知识了[：:!！]|每天一个.{0,6}小知识)',
    isRegex: true,
    scopes: ['text'],
    note: '营销套话：「冷知识 / 热知识」伪科普起号帖',
    enabled: true,
  },
  {
    id: 'cloud-cliche-hottake-1',
    pattern:
      '(暴论|逆天言论|说句难听的|说句得罪人的话|说句不中听的|说句政治不正确的|不怕被骂也要说|又要被喷了|准备好被喷了)',
    isRegex: true,
    scopes: ['text'],
    note: '引战套话：「暴论 / 说句得罪人的话」情绪挑拨帖',
    enabled: true,
  },
  {
    id: 'cloud-cliche-clickbait-1',
    pattern:
      '(9[09]%\\s*的人(?:都|还)?不知道|绝大多数人不知道|细思极恐|颠覆(?:你的)?认知|刷新(?:我的|你的)?三观|真相让人沉默|看完沉默了|删前速看|全网封杀|内部流出的?绝密)',
    isRegex: true,
    scopes: ['text'],
    note: '震惊标题党：「99%的人不知道 / 细思极恐 / 删前速看」',
    enabled: true,
  },
  {
    id: 'cloud-cliche-breaking-1',
    pattern:
      '((?:^|\\n)\\s*(?:【)?(?:刚刚突发|重磅突发|突发重磅|大事发生|天塌了|炸裂了)[！!：:\\s】]|【突发】|\\bbreaking\\s*:\\s*🚨|🚨\\s*breaking\\b|\\bjust\\s+in\\s*:\\s*🚨)',
    isRegex: true,
    scopes: ['text'],
    note: '伪突发钩子：「刚刚突发 / 天塌了 / BREAKING 🚨」流量帖',
    enabled: true,
  },
  {
    id: 'cloud-cliche-guru-1',
    pattern:
      '((?:打破|靠|利用)信息差|认知变现|提升认知维度|普通人(?:如何)?翻身|搞钱思维|底层逻辑.{0,8}(?:顶层设计|闭环|抓手)|财富密码|阶层跃迁|年入百万的?秘密|副业刚需)',
    isRegex: true,
    scopes: ['text', 'bio'],
    note: '焦虑割韭菜：「认知变现 / 打破信息差 / 搞钱思维」成功学',
    enabled: true,
  },
  {
    id: 'cloud-cliche-aislop-cn-1',
    pattern:
      '(熬夜整理了?|吐血整理|耗时\\s*\\d+\\s*(?:天|个小时)整理|强烈建议收藏|建议先码后看|先收藏再看|保姆级(?:教程|喂饭|攻略)|喂饭级教程|手把手教你白嫖)',
    isRegex: true,
    scopes: ['text'],
    note: '洗稿干货党：「熬夜整理 / 保姆级喂饭 / 强烈建议收藏」',
    enabled: true,
  },
  {
    id: 'cloud-cliche-emotion-1',
    pattern:
      '(家人们谁懂啊|一整个(?:无语|大动作|破防)住|救命真的会谢|集美们避雷|纯纯大冤种|今天也是被.{1,10}气死的一天)',
    isRegex: true,
    scopes: ['text'],
    note: '情绪口水帖：「家人们谁懂啊 / 集美们避雷 / 真的会谢」',
    enabled: true,
  },
  {
    id: 'cloud-cliche-aislop-en-1',
    pattern:
      "(feels?\\s+illegal\\s+to\\s+know|\\bunpopular\\s+opinion\\s*:|\\bhot\\s+take\\s*:|\\bharsh\\s+truth\\s*:|99%\\s+of\\s+people\\s+don['’]?t\\s+know|stop\\s+using\\s+chatgpt\\s+like|rip\\s+(?:chatgpt|claude|midjourney|cursor)\\b|bookmark\\s+this\\s+before\\s+it['’]?s\\s+deleted)",
    isRegex: true,
    scopes: ['text'],
    note: '英文水贴：「Hot take / Unpopular opinion / Illegal to know」',
    enabled: true,
  },
  {
    id: 'cloud-cliche-ai-reply-1',
    pattern:
      "(as\\s+an\\s+ai\\s+language\\s+model|certainly!\\s+here['’]?s\\s+a|作为一个人工智能语言模型|请提供你需要我回复的推文|来我主页置顶看|看我主页置顶|check\\s+my\\s+pinned\\s+tweet|check\\s+out\\s+my\\s+bio\\s+for)",
    isRegex: true,
    scopes: ['text'],
    onlyInReplies: true,
    note: '评论区水军：AI 提示词穿帮与主页导流套话',
    enabled: true,
  },

  // 2. 币圈噪音、土狗喊单与撸毛党 (Crypto Noise, Meme Shilling & Airdrop Farming)
  {
    id: 'cloud-crypto-trading-1',
    pattern:
      '(炒币|屯币|囤币|币圈|(?:大饼|二饼)\\s*(?:突破|跌破|插针|横盘|回调|看涨|看跌|\\d+\\s*[wu万刀])|山寨币|山寨季|牛回速归|狗庄.{0,8}(?:砸盘|拉盘|洗盘|出货)|多空双爆|合约爆仓|永续合约|链上巨鲸|巨鲸地址|\\baltseason\\b|\\$(?:btc|eth|sol)\\b.{0,24}\\$(?:btc|eth|sol|bnb|xrp)\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    note: '币圈看盘：炒币黑话、永续合约与行情喊单',
    enabled: true,
  },
  {
    id: 'cloud-crypto-meme-1',
    pattern:
      '(冲土狗|打土狗|金狗预警|土狗币|百倍金狗|内盘发射|pump\\.fun/|gmgn\\.ai/|dexscreener\\.com/|dextools\\.io/|birdeye\\.so/|\\bca\\s*[:：]\\s*(?:0x[a-f0-9]{40}|[a-z0-9]{32,44}\\b)|合约地址\\s*[:：]\\s*(?:0x[a-f0-9]{16,}|[a-z0-9]{32,44}\\b)|\\bnext\\s+100x\\s+gem\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'url'],
    note: '币圈土狗：Meme 冲狗、pump.fun 与合约地址刷屏',
    enabled: true,
  },
  {
    id: 'cloud-crypto-airdrop-1',
    pattern:
      '(撸毛(?!孩子|猫|狗)|被反撸|撸空投|零撸项目|按头撸|必撸(?:项目|空投)|大毛预警|空投交互|测试网领水|防女巫|银河任务|挂机挖矿|积分空投|\\bairdrop\\s+(?:farming|strategy|guide)\\b|\\bpotential\\s+airdrop\\b.{0,30}\\bcost\\s*:\\s*\\$0)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    note: '币圈撸毛：空投交互教程、测试网领水与防女巫',
    enabled: true,
  },
  {
    id: 'cloud-scam-crypto-1',
    pattern:
      '(airdrop.{0,20}claim|claim\\s+your\\s+\\$[a-z]{2,10}|free\\s+mint.{0,20}wallet|send\\s+(?:sol|eth|btc|usdt)\\s+to|百倍币|千倍币|合约带单|胜率\\s*9[0-9]%|老师带单|稳赚不赔|无损套利)',
    isRegex: true,
    scopes: ['text', 'bio'],
    note: '币圈诈骗：假空投领币与「百倍币 / 胜率90%」带单盘',
    enabled: true,
  },
  {
    id: 'cloud-scam-rebate-1',
    pattern:
      '(手续费返佣|最高返佣|永久返佣|自动返佣|填邀请码.{0,12}(?:立减|返现|注册))',
    isRegex: true,
    scopes: ['text', 'bio'],
    note: '币圈拉新：交易所高额手续费返佣与邀请码刷屏',
    enabled: true,
  },

  // 3. 互关增粉与抱团互助 (Mutual Follow & Engagement Pods)
  {
    id: 'cloud-follow-cn-1',
    pattern:
      '(诚信互关|蓝标互关|万粉互关|活跃互关|互关互赞|互关互评|互粉互赞|互关必回|互关秒回|求互关|来互关|互关一波|评论区互关|有粉必回|有关注必回|看到必回关|关注必回|秒回关|100%\\s*回关|蓝[v标]互助|互赞互转|互刷浏览|涨粉互助|抱团涨粉)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    note: '互关增粉：「诚信互关 / 有粉必回 / 蓝标互助」涨粉党',
    enabled: true,
  },
  {
    id: 'cloud-follow-intl-1',
    pattern:
      "(\\bfollow\\s*(?:for|4)\\s*follow\\b|\\bf4f\\b|\\bfollow\\s*back\\s*100%|\\b100%\\s*follow\\s*back\\b|\\bi['’]?(?:ll\\s+)?follow\\s+back(?!\\s+up\\b)\\b|\\binstant\\s+follow\\s*back\\b|フォロバ\\s*100|相互フォロー|선팔맞팔|맞팔해요)",
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    note: '海外互关：「F4F / Follow Back / 相互フォロー」互粉党',
    enabled: true,
  },

  // 4. 色情与擦边导流 (NSFW & Adult Funneling)
  {
    id: 'cloud-nsfw-bio-1',
    pattern:
      '(onlyfans\\.com|fansly\\.com|mym\\.fans|candfans|fantia\\.jp/fanclubs|stripchat\\.com|chaturbate\\.com)',
    isRegex: true,
    scopes: ['bio', 'url', 'text'],
    note: '色情导流：OnlyFans / Fansly 等成人订阅平台链接',
    enabled: true,
  },
  {
    id: 'cloud-nsfw-bio-2',
    pattern:
      '(看私信有惊喜|点我头像看|置顶有福利|同城可约|全国空降|线下可约|免费看片|秘密基地在置顶|门槛福利|私信领福利|吃瓜合集|每日大赛|反差合集)',
    isRegex: true,
    scopes: ['bio', 'text', 'name'],
    note: '色情导流：「置顶有福利 / 同城可约 / 吃瓜合集」擦边话术',
    enabled: true,
  },

  // 5. 钓鱼木马与私域导流 (Phishing, Malware & Private Funneling)
  {
    id: 'cloud-scam-support-1',
    pattern:
      '((?:metamask|phantom|ledger|trust\\s*wallet|coinbase|uniswap|rabby|okx|binance).{0,24}(?:support|help\\s*desk|ticket|recovery\\s+form)|official\\s+support\\s+team.{0,20}dm|提交工单.{0,12}恢复钱包)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    onlyInReplies: true,
    note: '钓鱼客服：评论区假冒钱包或平台官方工单',
    enabled: true,
  },
  {
    id: 'cloud-scam-trojan-1',
    pattern:
      '((?:telegram|tg|电报|纸飞机).{0,10}(?:中文版|汉化包|中文语言包)|点击安装中文包|破解版免费下载)',
    isRegex: true,
    scopes: ['text', 'bio', 'url'],
    note: '木马钓鱼：假冒电报「中文汉化包」与破解软件毒链',
    enabled: true,
  },
  {
    id: 'cloud-spam-tg-1',
    pattern: '(t\\.me/\\+|t\\.me/joinchat|telegram\\.me/)',
    isRegex: true,
    scopes: ['bio', 'url'],
    note: '私域导流：简介挂私密电报群链接小号',
    enabled: true,
  },
  {
    id: 'cloud-scam-whatsapp-1',
    pattern:
      '(wa\\.me/\\d{6,}|api\\.whatsapp\\.com/send|chat\\.whatsapp\\.com/|line\\.me/ti/p/)',
    isRegex: true,
    scopes: ['text', 'bio', 'url'],
    note: '杀猪盘导流：WhatsApp / LINE 私聊跳转链接',
    enabled: true,
  },

  // 6. 博彩与黑灰产 (Gambling & Black Market)
  {
    id: 'cloud-gambling-cn-1',
    pattern:
      '(博彩平台|注册送彩金|首充送|威尼斯人娱乐|AG真人|哈希竞猜|开云体育|江南体育)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    note: '网络博彩：「注册送彩金 / 哈希竞猜 / AG真人」赌博引流',
    enabled: true,
  },
  {
    id: 'cloud-blackmarket-1',
    pattern:
      '(usdt\\s*跑分|跑分车队|承兑洗白|推特老号批发|蓝标号出售|实名认证代过|全球接码平台|社工库查询)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    note: '黑灰产交易：USDT 跑分洗钱、接码与批发卖号',
    enabled: true,
  },
];

const BUILTIN_CLOUD_IDS = new Set(DEFAULT_CLOUD_KEYWORDS.map((item) => item.id));

/**
 * Merges remote snapshot `cloudKeywords` with built-in `DEFAULT_CLOUD_KEYWORDS` so:
 * - Newly shipped built-in packs immediately appear even when a cached/older snapshot is present;
 * - Remote emergency pauses (`enabled: false`) on built-in IDs are honored;
 * - Server-pushed hotfix rules (new IDs not in built-in) are appended dynamically.
 */
export function mergeCloudKeywords(
  remoteKeywords?: KeywordRuleItem[],
  clone = false
): KeywordRuleItem[] {
  if (!remoteKeywords || remoteKeywords.length === 0) {
    return clone
      ? structuredClone(DEFAULT_CLOUD_KEYWORDS)
      : DEFAULT_CLOUD_KEYWORDS;
  }
  const remoteById = new Map(remoteKeywords.map((item) => [item.id, item]));
  const merged: KeywordRuleItem[] = DEFAULT_CLOUD_KEYWORDS.map((builtin) => {
    const remote = remoteById.get(builtin.id);
    const base = clone ? structuredClone(builtin) : builtin;
    if (remote && !remote.enabled) {
      return { ...base, enabled: false };
    }
    return base;
  });

  for (const remote of remoteKeywords) {
    if (!BUILTIN_CLOUD_IDS.has(remote.id) && remote.enabled) {
      merged.push(clone ? structuredClone(remote) : remote);
    }
  }
  return merged;
}

export const PRESET_DEFINITIONS: Record<
  Exclude<FilterPresetId, 'custom'>,
  PresetMetadata
> = {
  light: {
    id: 'light',
    rules: {
      replySpam: {
        enabled: true,
        blockShortOrEmoji: true,
        minWeightedLength: 4,
        detectImpersonation: true,
        blockBioLinkSpam: false,
        bioLinkMaxFollowers: 500,
        blockPureMediaReplies: false,
      },
      engagementBait: {
        enabled: false,
        blockCommentGiveaway: true,
        blockFollowBack: true,
      },
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
      tagSpam: {
        enabled: true,
        maxHashtags: 7,
        maxCashtags: 4,
      },
      accountQuality: {
        enabled: true,
        minAccountAgeDays: 0,
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
    rules: {
      replySpam: {
        enabled: true,
        blockShortOrEmoji: true,
        minWeightedLength: 6,
        detectImpersonation: true,
        blockBioLinkSpam: true,
        bioLinkMaxFollowers: 1000,
        blockPureMediaReplies: false,
      },
      engagementBait: {
        enabled: true,
        blockCommentGiveaway: true,
        blockFollowBack: true,
      },
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
    rules: {
      replySpam: {
        enabled: true,
        blockShortOrEmoji: true,
        minWeightedLength: 10,
        detectImpersonation: true,
        blockBioLinkSpam: true,
        bioLinkMaxFollowers: 2000,
        blockPureMediaReplies: true,
      },
      engagementBait: {
        enabled: true,
        blockCommentGiveaway: true,
        blockFollowBack: true,
      },
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
    locale: 'auto',
    preset,
    interceptionMode: 'strip',
    exemptFollowing: true,
    profileSceneBadgeOnly: true,
    syncNativeXBlock: true,
    enableCrowdReport: true,
    enableCloudKeywords: true,
    disabledCloudKeywordIds: [],
    rules: {
      ...structuredClone(presetDef.rules),
      keywords: {
        enabled: true,
        items: [],
      },
      languageFilter: {
        enabled: false,
        mode: 'allow',
        languages: ['zh', 'en', 'ja'],
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
      languageFilter: current.rules.languageFilter,
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
