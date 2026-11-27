import {
  CLOUD_KEYWORD_LANG_GROUPS,
  type CloudKeywordLangGroup,
  type CrowdBlockSnapshot,
  type FilterConfig,
  type FilterPresetId,
  type FilterRulesConfig,
  type KeywordRuleItem,
  type SupportedLocale,
} from './types';
import {
  DEFAULT_GROK_MAX_MENTION_WEIGHTED_LENGTH,
  SITE_DOMAIN,
} from './constants';
import { resolveLocale } from './i18n';

export interface PresetMetadata {
  id: Exclude<FilterPresetId, 'custom'>;
  rules: Omit<FilterRulesConfig, 'keywords' | 'languageFilter' | 'domainFilter'>;
}

export const DEFAULT_CLOUD_KEYWORDS: KeywordRuleItem[] = [
  // 1. 营销套话、引战钩子与洗稿水文 (Impression Farming & Clichés)
  {
    id: 'cloud-cliche-trivia-1',
    pattern: '(冷知识|热知识|涨知识了[：:!！]|每天一个.{0,6}小知识)',
    isRegex: true,
    scopes: ['text'],
    langGroup: 'zh',
    packCategory: 'cliche',
    note: '营销套话：「冷知识 / 热知识」伪科普起号帖',
    enabled: true,
  },
  {
    id: 'cloud-cliche-hottake-1',
    pattern:
      '(暴论|逆天言论|说句难听的|说句得罪人的话|说句不中听的|说句政治不正确的|不怕被骂也要说|又要被喷了|准备好被喷了)',
    isRegex: true,
    scopes: ['text'],
    langGroup: 'zh',
    packCategory: 'cliche',
    note: '引战套话：「暴论 / 说句得罪人的话」情绪挑拨帖',
    enabled: true,
  },
  {
    id: 'cloud-cliche-clickbait-1',
    pattern:
      '(9[09]%\\s*的人(?:都|还)?不知道|绝大多数人不知道|细思极恐|颠覆(?:你的)?认知|刷新(?:我的|你的)?三观|真相让人沉默|看完沉默了|删前速看|全网封杀|内部流出的?绝密)',
    isRegex: true,
    scopes: ['text'],
    langGroup: 'zh',
    packCategory: 'cliche',
    note: '震惊标题党：「99%的人不知道 / 细思极恐 / 删前速看」',
    enabled: true,
  },
  {
    id: 'cloud-cliche-breaking-1',
    pattern:
      '((?:^|\\n)\\s*(?:【)?(?:刚刚突发|重磅突发|突发重磅|大事发生|天塌了|炸裂了)[！!：:\\s】]|【突发】|\\bbreaking\\s*:\\s*🚨|🚨\\s*breaking\\b|\\bjust\\s+in\\s*:\\s*🚨)',
    isRegex: true,
    scopes: ['text'],
    langGroup: 'en',
    packCategory: 'cliche',
    note: '伪突发钩子：「刚刚突发 / 天塌了 / BREAKING 🚨」流量帖',
    enabled: true,
  },
  {
    id: 'cloud-cliche-guru-1',
    pattern:
      '((?:打破|靠|利用)信息差|认知变现|提升认知维度|普通人(?:如何)?翻身|搞钱思维|底层逻辑.{0,8}(?:顶层设计|闭环|抓手)|财富密码|阶层跃迁|年入百万的?秘密|副业刚需)',
    isRegex: true,
    scopes: ['text', 'bio'],
    langGroup: 'zh',
    packCategory: 'cliche',
    note: '焦虑割韭菜：「认知变现 / 打破信息差 / 搞钱思维」成功学',
    enabled: true,
  },
  {
    id: 'cloud-cliche-aislop-cn-1',
    pattern:
      '(熬夜整理了?|吐血整理|耗时\\s*\\d+\\s*(?:天|个小时)整理|强烈建议收藏|建议先码后看|先收藏再看|保姆级(?:教程|喂饭|攻略)|喂饭级教程|手把手教你白嫖)',
    isRegex: true,
    scopes: ['text'],
    langGroup: 'zh',
    packCategory: 'cliche',
    note: '洗稿干货党：「熬夜整理 / 保姆级喂饭 / 强烈建议收藏」',
    enabled: true,
  },
  {
    id: 'cloud-cliche-emotion-1',
    pattern:
      '(家人们谁懂啊|一整个(?:无语|大动作|破防)住|救命真的会谢|集美们避雷|纯纯大冤种|今天也是被.{1,10}气死的一天)',
    isRegex: true,
    scopes: ['text'],
    langGroup: 'zh',
    packCategory: 'cliche',
    note: '情绪口水帖：「家人们谁懂啊 / 集美们避雷 / 真的会谢」',
    enabled: true,
  },
  {
    id: 'cloud-cliche-aislop-en-1',
    pattern:
      "(feels?\\s+illegal\\s+to\\s+know|\\bunpopular\\s+opinion\\s*:|\\bhot\\s+take\\s*:|\\bharsh\\s+truth\\s*:|99%\\s+of\\s+people\\s+don['’]?t\\s+know|stop\\s+using\\s+chatgpt\\s+like|rip\\s+(?:chatgpt|claude|midjourney|cursor)\\b|bookmark\\s+this\\s+before\\s+it['’]?s\\s+deleted)",
    isRegex: true,
    scopes: ['text'],
    langGroup: 'en',
    packCategory: 'cliche',
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
    langGroup: 'universal',
    packCategory: 'cliche',
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
    langGroup: 'zh',
    packCategory: 'crypto',
    note: '币圈看盘：炒币黑话、永续合约与行情喊单',
    enabled: true,
  },
  {
    id: 'cloud-crypto-meme-1',
    pattern:
      '(冲土狗|打土狗|金狗预警|土狗币|百倍金狗|内盘发射|pump\\.fun/|gmgn\\.ai/|dexscreener\\.com/|dextools\\.io/|birdeye\\.so/|\\bca\\s*[:：]\\s*(?:0x[a-f0-9]{40}|[a-z0-9]{32,44}\\b)|合约地址\\s*[:：]\\s*(?:0x[a-f0-9]{16,}|[a-z0-9]{32,44}\\b)|\\bnext\\s+100x\\s+gem\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'url'],
    langGroup: 'universal',
    packCategory: 'crypto',
    note: '币圈土狗：Meme 冲狗、pump.fun 与合约地址刷屏',
    enabled: true,
  },
  {
    id: 'cloud-crypto-airdrop-1',
    pattern:
      '(撸毛(?!孩子|猫|狗)|被反撸|撸空投|零撸项目|按头撸|必撸(?:项目|空投)|大毛预警|空投交互|测试网领水|防女巫|银河任务|挂机挖矿|积分空投|\\bairdrop\\s+(?:farming|strategy|guide)\\b|\\bpotential\\s+airdrop\\b.{0,30}\\bcost\\s*:\\s*\\$0)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'zh',
    packCategory: 'crypto',
    note: '币圈撸毛：空投交互教程、测试网领水与防女巫',
    enabled: true,
  },
  {
    id: 'cloud-scam-crypto-1',
    pattern:
      '(airdrop.{0,20}claim|claim\\s+your\\s+\\$[a-z]{2,10}|free\\s+mint.{0,20}wallet|send\\s+(?:sol|eth|btc|usdt)\\s+to|百倍币|千倍币|合约带单|胜率\\s*9[0-9]%|老师带单|稳赚不赔|无损套利)',
    isRegex: true,
    scopes: ['text', 'bio'],
    langGroup: 'universal',
    packCategory: 'crypto',
    note: '币圈诈骗：假空投领币与「百倍币 / 胜率90%」带单盘',
    enabled: true,
  },
  {
    id: 'cloud-scam-rebate-1',
    pattern:
      '(手续费返佣|最高返佣|永久返佣|自动返佣|填邀请码.{0,12}(?:立减|返现|注册))',
    isRegex: true,
    scopes: ['text', 'bio'],
    langGroup: 'zh',
    packCategory: 'crypto',
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
    langGroup: 'zh',
    packCategory: 'follow',
    note: '互关增粉：「诚信互关 / 有粉必回 / 蓝标互助」涨粉党',
    enabled: true,
  },
  {
    id: 'cloud-follow-intl-1',
    pattern:
      "(\\bfollow\\s*(?:for|4)\\s*follow\\b|\\bf4f\\b|\\bfollow\\s*back\\s*100%|\\b100%\\s*follow\\s*back\\b|\\bi['’]?(?:ll\\s+)?follow\\s+back(?!\\s+up\\b)\\b|\\binstant\\s+follow\\s*back\\b|フォロバ\\s*100|相互フォロー|선팔맞팔|맞팔해요)",
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'en',
    packCategory: 'follow',
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
    langGroup: 'universal',
    packCategory: 'nsfw',
    note: '色情导流：OnlyFans / Fansly 等成人订阅平台链接',
    enabled: true,
  },
  {
    id: 'cloud-nsfw-bio-2',
    pattern:
      '(看私信有惊喜|点我头像看|置顶有福利|同城可约|全国空降|线下可约|免费看片|秘密基地在置顶|门槛福利|私信领福利|吃瓜合集|每日大赛|反差合集)',
    isRegex: true,
    scopes: ['bio', 'text', 'name'],
    langGroup: 'zh',
    packCategory: 'nsfw',
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
    langGroup: 'universal',
    packCategory: 'scam',
    note: '钓鱼客服：评论区假冒钱包或平台官方工单',
    enabled: true,
  },
  {
    id: 'cloud-scam-trojan-1',
    pattern:
      '((?:telegram|tg|电报|纸飞机).{0,10}(?:中文版|汉化包|中文语言包)|点击安装中文包|破解版免费下载)',
    isRegex: true,
    scopes: ['text', 'bio', 'url'],
    langGroup: 'universal',
    packCategory: 'scam',
    note: '木马钓鱼：假冒电报「中文汉化包」与破解软件毒链',
    enabled: true,
  },
  {
    id: 'cloud-spam-tg-1',
    pattern: '(t\\.me/\\+|t\\.me/joinchat|telegram\\.me/)',
    isRegex: true,
    scopes: ['bio', 'url'],
    langGroup: 'universal',
    packCategory: 'scam',
    note: '私域导流：简介挂私密电报群链接小号',
    enabled: true,
  },
  {
    id: 'cloud-scam-whatsapp-1',
    pattern:
      '(wa\\.me/\\d{6,}|api\\.whatsapp\\.com/send|chat\\.whatsapp\\.com/|line\\.me/ti/p/)',
    isRegex: true,
    scopes: ['text', 'bio', 'url'],
    langGroup: 'universal',
    packCategory: 'scam',
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
    langGroup: 'zh',
    packCategory: 'scam',
    note: '网络博彩：「注册送彩金 / 哈希竞猜 / AG真人」赌博引流',
    enabled: true,
  },
  {
    id: 'cloud-blackmarket-1',
    pattern:
      '(usdt\\s*跑分|跑分车队|承兑洗白|推特老号批发|蓝标号出售|实名认证代过|全球接码平台|社工库查询)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'zh',
    packCategory: 'scam',
    note: '黑灰产交易：USDT 跑分洗钱、接码与批发卖号',
    enabled: true,
  },

  // 7. 多语种分包规则 (ja, ko, es, pt, fr, de, ru)
  // Japanese (ja)
  {
    id: 'cloud-follow-ja-1',
    pattern:
      '(相互フォロー|フォロバ\\s*100|フォロバ絶対|リプでフォロバ|いいねでフォロバ|RTした人全員フォロー|拡散希望.{0,12}フォロバ|相互希望|フォロワー増やしたい)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'ja',
    packCategory: 'follow',
    note: 'Japanese follow pods: Mutual-follow & guaranteed follow-back ("相互フォロー / フォロバ100")',
    enabled: true,
  },
  {
    id: 'cloud-scam-ja-1',
    pattern:
      '(お金配り|現金配布|現金プレゼント.{0,12}(?:RT|リポスト|フォロー)|配布企画.{0,12}(?:参加条件|応募方法)|即日即金|スマホ1台で.{0,8}(?:稼げ|月収)|副業紹介.{0,8}(?:DM|プロフ)|LINE(?:追加|登録)で.{0,10}(?:無料|プレゼント|稼))',
    isRegex: true,
    scopes: ['text', 'bio'],
    langGroup: 'ja',
    packCategory: 'scam',
    note: 'Japanese giveaway & side-hustle scams: Cash-drop baits & LINE funnels',
    enabled: true,
  },
  {
    id: 'cloud-nsfw-ja-1',
    pattern:
      '(裏アカ女子|裏垢女子|えち動画|エロ動画.{0,10}(?:プロフ|固定|リンク)|パパ活募集|オフパコ募集|プロフのリンク.{0,10}(?:えち|エロ|裏垢|無修正|アダルト)|固ツイ.{0,8}(?:えち|エロ|裏垢|裏動画|無修正))',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'ja',
    packCategory: 'nsfw',
    note: 'Japanese NSFW funnels: Secret-account ("裏垢女子") & pinned-video adult bait',
    enabled: true,
  },

  // Korean (ko)
  {
    id: 'cloud-follow-ko-1',
    pattern:
      '(선팔맞팔|선팔하면\\s*맞팔|맞팔\\s*100%|100%\\s*맞팔|맞팔해요|맞팔환영|맞팔구함|팔로우\\s*반사|좋아요\\s*반사)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'ko',
    packCategory: 'follow',
    note: 'Korean follow pods: Mutual-follow & like-back tags ("선팔맞팔 / 맞팔환영")',
    enabled: true,
  },
  {
    id: 'cloud-scam-ko-1',
    pattern:
      '(무료\\s*리딩방|급등주\\s*(?:무료|추천|공개)|수익률\\s*보장|가입\\s*꽁머니|토토\\s*사이트\\s*추천|메이저\\s*놀이터|카지노\\s*가입\\s*머니|무료\\s*픽\\s*(?:공유|제공)|오픈채팅.{0,10}(?:수익|리딩|픽))',
    isRegex: true,
    scopes: ['text', 'bio'],
    langGroup: 'ko',
    packCategory: 'scam',
    note: 'Korean investment & gambling spam: Signal rooms, "free bonus" & betting promos',
    enabled: true,
  },
  {
    id: 'cloud-nsfw-ko-1',
    pattern:
      '(조건만남\\s*(?:문의|예약|라인|카톡|텔레)|출장\\s*(?:안마|마사지).{0,8}(?:문의|예약|후불)|오피\\s*예약|야동\\s*(?:링크|무료|공유)|풀영상.{0,10}(?:프로필|링크|텔레)|19금\\s*영상\\s*(?:링크|공유))',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'ko',
    packCategory: 'nsfw',
    note: 'Korean NSFW funnels: Escort ads & profile adult-video links',
    enabled: true,
  },

  // Spanish (es)
  {
    id: 'cloud-follow-es-1',
    pattern:
      '(\\bs[ií]gueme\\s+y\\s+te\\s+sigo\\b|\\bte\\s+sigo\\s+y\\s+me\\s+sigues\\b|\\bdevuelvo\\s+(?:follow|seguimiento)\\b|\\bsigo\\s+de\\s+vuelta\\b|\\bfollow\\s*x\\s*follow\\b|\\b100%\\s*sigo\\s+de\\s+vuelta\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'es',
    packCategory: 'follow',
    note: 'Spanish follow pods: "Sígueme y te sigo / Follow x Follow" mutual-follow spam',
    enabled: true,
  },
  {
    id: 'cloud-scam-es-1',
    pattern:
      '(\\bgana\\s+dinero\\s+(?:desde\\s+casa|f[aá]cil|r[aá]pido)\\b|\\bingresos\\s+pasivos\\s+diarios\\b|\\bganancias\\s+(?:diarias\\s+)?garantizadas\\b|\\bse[nñ]ales\\s+(?:cripto|crypto|forex)\\s*(?:vip|gratis)\\b|\\bmultiplica\\s+tu\\s+(?:dinero|inversi[oó]n)\\b|\\bcomenta\\s+["\'«]?info["\'»]?\\s+y\\s+te\\s+(?:env[ií]o|mando)\\b)',
    isRegex: true,
    scopes: ['text', 'bio'],
    langGroup: 'es',
    packCategory: 'scam',
    note: 'Spanish scam & hustle funnels: Guaranteed profit, VIP signals & "comment info" bait',
    enabled: true,
  },
  {
    id: 'cloud-nsfw-es-1',
    pattern:
      '(\\bcontenido\\s+(?:exclusivo|privado|\\+18)\\s+(?:en\\s+mi\\s+(?:bio|perfil|link)|por\\s+dm)\\b|\\bpacks?\\s+(?:disponibles?|privados?)\\s+(?:al|por)\\s+dm\\b|\\bvideos?\\s+sin\\s+censura\\s+(?:en\\s+(?:mi|el)\\s+(?:bio|perfil|link))\\b|\\bmi\\s+p[aá]gina\\s+azul\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'es',
    packCategory: 'nsfw',
    note: 'Spanish NSFW funnels: "Página azul", paid packs & exclusive bio-link bait',
    enabled: true,
  },

  // Portuguese (pt)
  {
    id: 'cloud-follow-pt-1',
    pattern:
      '(\\bsigo\\s+de\\s+volta\\b|\\bme\\s+segue\\s+que\\s+(?:eu\\s+)?sigo\\s+de\\s+volta\\b|\\btroco\\s+follows?\\b|\\bsdv\\s*100%|\\b100%\\s*sdv\\b|\\bsegue\\s+e\\s+retribuo\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'pt',
    packCategory: 'follow',
    note: 'Portuguese follow pods: "Sigo de volta / SDV 100%" mutual-follow spam',
    enabled: true,
  },
  {
    id: 'cloud-scam-pt-1',
    pattern:
      '(\\bganhe\\s+dinheiro\\s+(?:em\\s+casa|no\\s+pix|jogando)\\b|\\b(?:ganhe|receba|saque)\\s+pix\\s+(?:na\\s+hora|garantido|autom[aá]tico)\\b|\\bpix\\s+garantido\\s+(?:todo\\s+dia|na\\s+hora|no\\s+cadastro)\\b|\\bplataforma\\s+(?:nova\\s+)?pagando\\s+muito\\b|\\bhor[aá]rio\\s+pagante\\b|\\bsala\\s+de\\s+sinais\\s+(?:vip|gr[aá]tis)\\b|\\blucro\\s+(?:di[aá]rio\\s+)?garantido\\b)',
    isRegex: true,
    scopes: ['text', 'bio'],
    langGroup: 'pt',
    packCategory: 'scam',
    note: 'Portuguese scam & betting spam: Instant Pix baits, casino "paying hours" & VIP signals',
    enabled: true,
  },
  {
    id: 'cloud-nsfw-pt-1',
    pattern:
      '(\\bconte[uú]do\\s+(?:exclusivo|proibido|\\+18)\\s+(?:na\\s+bio|no\\s+link|no\\s+fixado)\\b|\\bpack(?:zinho)?s?\\s+(?:na|no|pela)\\s+dm\\b|\\bv[ií]deo\\s+completo\\s+no\\s+link\\s+da\\s+bio\\b|\\bmeu\\s+privacy\\s+(?:na\\s+bio|no\\s+fixado|no\\s+link)\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'pt',
    packCategory: 'nsfw',
    note: 'Portuguese NSFW funnels: Exclusive +18 bio links, Privacy & DM pack promos',
    enabled: true,
  },

  // French (fr)
  {
    id: 'cloud-follow-fr-1',
    pattern:
      '(\\bje\\s+rends\\s+(?:les\\s+)?follows?\\b|\\babonne[-\\s]?toi\\s*,?\\s*je\\s+rends\\b|\\bje\\s+follow\\s*back\\b|\\bfollow\\s+et\\s+je\\s+rends\\b|\\brt\\s*=\\s*follow\\b|\\bfollow\\s*100%\\s*rendu\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'fr',
    packCategory: 'follow',
    note: 'French follow pods: "Je rends les follows / Abonne-toi je rends" spam',
    enabled: true,
  },
  {
    id: 'cloud-scam-fr-1',
    pattern:
      '(\\bgagne[rz]?\\s+de\\s+l[\'’]argent\\s+(?:facilement|rapidement|depuis\\s+chez\\s+(?:toi|vous))\\b|\\bgains?\\s+(?:journaliers?\\s+)?garantis?\\b|\\bsignaux\\s+(?:crypto|trading|forex)\\s*(?:vip|gratuits?)\\b|\\bcommente\\s+["\'«]?[a-z0-9]{2,12}["\'»]?\\s+et\\s+je\\s+t[\'’]envoie\\b|\\brevenus?\\s+passifs?\\s+(?:par\\s+jour|garantis?)\\b)',
    isRegex: true,
    scopes: ['text', 'bio'],
    langGroup: 'fr',
    packCategory: 'scam',
    note: 'French scam & bait: Guaranteed profits, VIP trading signals & comment-to-DM funnels',
    enabled: true,
  },
  {
    id: 'cloud-nsfw-fr-1',
    pattern:
      '(\\bcontenu\\s+(?:exclusif|priv[eé]|\\+18)\\s+(?:en\\s+(?:bio|dm|mp)|dans\\s+ma\\s+bio)\\b|\\bmon\\s+(?:mym|onlyfans)\\s+(?:en\\s+bio|dans\\s+ma\\s+bio|en\\s+lien)\\b|\\bmes\\s+(?:nudes|m[eé]dias\\s+priv[eé]s)\\s+(?:en\\s+(?:dm|mp|bio))\\b|\\bvid[eé]o\\s+compl[eè]te\\s+(?:en\\s+bio|dans\\s+ma\\s+bio)\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'fr',
    packCategory: 'nsfw',
    note: 'French NSFW funnels: MYM/OnlyFans bio pointers & private-media DM bait',
    enabled: true,
  },

  // German (de)
  {
    id: 'cloud-follow-de-1',
    pattern:
      '(\\bich\\s+folge\\s+(?:jedem\\s+|allen\\s+|sofort\\s+)?zur[uü]ck\\b|\\bfolge\\s+100%\\s+zur[uü]ck\\b|\\bgegenseitig\\s+folgen\\b|\\bfollow\\s+f[uü]r\\s+follow\\b|\\bwer\\s+folgt\\s*,?\\s*kriegt\\s+ein\\s+follow\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'de',
    packCategory: 'follow',
    note: 'German follow pods: "Ich folge zurück / Gegenseitig folgen" mutual-follow spam',
    enabled: true,
  },
  {
    id: 'cloud-scam-de-1',
    pattern:
      '(\\bschnell(?:es)?\\s+geld\\s+verdienen\\b|\\bgarantierte\\s+(?:rendite|gewinne?)\\b|\\bkostenlose\\s+(?:krypto|crypto|trading)[-\\s]?signale\\b|\\bkomm\\s+in\\s+(?:die|meine)\\s+(?:vip|trading|krypto|crypto|signal|telegram)[-\\s]?gruppe\\b|\\bpassives\\s+einkommen\\s+(?:von\\s+zuhause|pro\\s+tag)\\b)',
    isRegex: true,
    scopes: ['text', 'bio'],
    langGroup: 'de',
    packCategory: 'scam',
    note: 'German scam & signal funnels: Guaranteed returns, fast-money & VIP Telegram groups',
    enabled: true,
  },
  {
    id: 'cloud-nsfw-de-1',
    pattern:
      '(\\bexklusive[rs]?\\s+(?:bilder|videos|content)\\s+in\\s+(?:meiner|der)\\s+bio\\b|\\bprivate[rs]?\\s+(?:nudes|videos)\\s+(?:per|in\\s+den)\\s+dm\\b|\\bmein\\s+(?:bestfans|onlyfans|fansly)\\s+(?:in\\s+der\\s+bio|im\\s+link)\\b|\\bungefilterte\\s+videos\\s+in\\s+(?:meiner|der)\\s+bio\\b)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'de',
    packCategory: 'nsfw',
    note: 'German NSFW funnels: Exclusive bio-link & BestFans/DM adult-media bait',
    enabled: true,
  },

  // Russian (ru)
  {
    id: 'cloud-follow-ru-1',
    pattern:
      '(взаимн(?:ая|ый)\\s+(?:подписка|фолловинг)|(?:подпишусь|фолловлю)\\s+взаимно|взаимно\\s+(?:подпишусь|подписываюсь|фолловлю)|подписка\\s+в\\s+ответ\\s*100%|взаимный\\s+фоллоубэк)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'ru',
    packCategory: 'follow',
    note: 'Russian follow pods: Mutual-follow & guaranteed follow-back ("Взаимная подписка")',
    enabled: true,
  },
  {
    id: 'cloud-scam-ru-1',
    pattern:
      '(заработок\\s+(?:без\\s+вложений|в\\s+крипте\\s+от\\s+\\d+)|гарантированн(?:ый|ая)\\s+(?:доход|прибыль)|раскрутк[ау]\\s+сч[её]та|бесплатн(?:ые|ый)\\s+(?:крипто|торгов(?:ые|ый))\\s*сигнал|(?:продам|куплю|бесплатн(?:ый|ые)|100%|жб)\\s+договорн(?:ые|ой)\\s+матч|договорн(?:ые|ой)\\s+матч.{0,16}(?:(?:^|[\\s,.:;!?()«»"\'-])(?:тг|лс)(?=$|[\\s,.:;!?()«»"\'-])|телеграм|кэф|коэф|проход)|казино\\s+бонус\\s+за\\s+регистрацию|пиши\\s+в\\s+лс\\s+(?:слово|за\\s+схемой))',
    isRegex: true,
    scopes: ['text', 'bio'],
    langGroup: 'ru',
    packCategory: 'scam',
    note: 'Russian scam & betting spam: Account-pumping, guaranteed income, fixed matches & casino promos',
    enabled: true,
  },
  {
    id: 'cloud-nsfw-ru-1',
    pattern:
      '(фулл\\s+(?:в\\s+(?:био|профиле|закрепе|тг)|по\\s+ссылке\\s+в\\s+био)|приватн(?:ый|ые)\\s+(?:канал|фото|видео)\\s+(?:в\\s+(?:био|шапке|закрепе|лс)|по\\s+ссылке)|слив(?:ы)?\\s+(?:18\\+|в\\s+био|в\\s+закрепе)|горячий\\s+контент\\s+(?:в\\s+био|по\\s+ссылке)|интим\\s*(?:фото|видео)\\s+в\\s+лс)',
    isRegex: true,
    scopes: ['text', 'bio', 'name'],
    langGroup: 'ru',
    packCategory: 'nsfw',
    note: 'Russian NSFW funnels: "Full in bio", private-channel & adult-media DM bait',
    enabled: true,
  },
];

const BUILTIN_CLOUD_IDS = new Set(DEFAULT_CLOUD_KEYWORDS.map((item) => item.id));
const VALID_CLOUD_LANG_GROUP_SET = new Set<string>(CLOUD_KEYWORD_LANG_GROUPS);

export function isCloudKeywordLangGroup(
  value: unknown
): value is CloudKeywordLangGroup {
  return typeof value === 'string' && VALID_CLOUD_LANG_GROUP_SET.has(value);
}

export function localeToCloudLangGroup(
  locale: SupportedLocale
): Exclude<CloudKeywordLangGroup, 'universal'> {
  if (locale === 'zh-CN' || locale === 'zh-TW') return 'zh';
  if (
    locale === 'en' ||
    locale === 'ja' ||
    locale === 'ko' ||
    locale === 'es' ||
    locale === 'pt' ||
    locale === 'fr' ||
    locale === 'de' ||
    locale === 'ru'
  ) {
    return locale;
  }
  return 'en';
}

export function resolveEnabledCloudLangGroups(
  config: Pick<FilterConfig, 'locale' | 'enabledCloudLangGroups'>,
  envLang?: string
): CloudKeywordLangGroup[] {
  if (Array.isArray(config.enabledCloudLangGroups)) {
    const seen = new Set<CloudKeywordLangGroup>();
    for (const group of config.enabledCloudLangGroups) {
      if (isCloudKeywordLangGroup(group)) {
        seen.add(group);
      }
    }
    return [...seen];
  }
  const uiGroup = localeToCloudLangGroup(resolveLocale(config.locale, envLang));
  const defaults: CloudKeywordLangGroup[] = ['universal', 'en'];
  if (!defaults.includes(uiGroup)) {
    defaults.push(uiGroup);
  }
  return defaults;
}

/**
 * Merges remote snapshot `cloudKeywords` with built-in `DEFAULT_CLOUD_KEYWORDS` so:
 * - Newly shipped built-in packs immediately appear even when a cached/older snapshot is present;
 * - Remote emergency pauses (`enabled: false`) on built-in IDs are honored while keeping built-in `langGroup` / `packCategory`;
 * - Server-pushed hotfix rules (new IDs not in built-in) are appended dynamically (defaulting missing `langGroup` to `'universal'`).
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
      const copy = clone ? structuredClone(remote) : { ...remote };
      copy.langGroup = isCloudKeywordLangGroup(remote.langGroup)
        ? remote.langGroup
        : 'universal';
      merged.push(copy);
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
        blockDuplicateReplies: false,
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
      grokFilter: {
        enabled: true,
        protectOfficialGrok: true,
        blockShortMentions: false,
        maxMentionWeightedLength: DEFAULT_GROK_MAX_MENTION_WEIGHTED_LENGTH,
        hideGrokReplies: false,
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
        blockDuplicateReplies: true,
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
      grokFilter: {
        enabled: true,
        protectOfficialGrok: true,
        blockShortMentions: false,
        maxMentionWeightedLength: DEFAULT_GROK_MAX_MENTION_WEIGHTED_LENGTH,
        hideGrokReplies: false,
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
        blockDuplicateReplies: true,
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
      grokFilter: {
        enabled: true,
        protectOfficialGrok: true,
        blockShortMentions: true,
        maxMentionWeightedLength: DEFAULT_GROK_MAX_MENTION_WEIGHTED_LENGTH,
        hideGrokReplies: false,
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
    theme: 'light',
    preset,
    interceptionMode: 'collapse',
    sceneModes: {
      for_you: 'inherit',
      following: 'inherit',
      reply: 'inherit',
      search: 'inherit',
    },
    exemptFollowing: true,
    profileSceneBadgeOnly: true,
    syncNativeXBlock: false,
    enableCrowdReport: false,
    enableCloudKeywords: true,
    disabledCloudKeywordIds: [],
    onboardingDismissed: true,
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
      domainFilter: {
        enabled: true,
        items: [],
      },
    },
    installedPacks: [],
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
      domainFilter: current.rules.domainFilter ?? {
        enabled: true,
        items: [],
      },
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
