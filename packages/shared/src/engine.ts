import {
  DEFAULT_GROK_MAX_MENTION_WEIGHTED_LENGTH,
  HIGH_FOLLOWER_PROTECT_THRESHOLD,
  HIGH_FOLLOWER_VOTE_MULTIPLIER,
  MIN_DUPLICATE_REPLY_WEIGHTED_LENGTH,
  OFFICIAL_GROK_SCREEN_NAME,
  OFFICIAL_GROK_UID,
} from './constants';
import {
  getBlockReasonLabels,
  getCloudKeywordNote,
  getEngineMessages,
  getTweetLanguageLabel,
  resolveLocale,
  type EngineMessages,
} from './i18n';
import {
  DEFAULT_CLOUD_KEYWORDS,
  localeToCloudLangGroup,
  mergeCloudKeywords,
  resolveEnabledCloudLangGroups,
} from './presets';
import {
  type AccountListEntry,
  type CloudKeywordLangGroup,
  type CrowdBlockSnapshot,
  type DomainRuleItem,
  type ExtractedAuthor,
  type ExtractedTweet,
  type FilterConfig,
  type FocalTweetAuthor,
  type InterceptionDecision,
  type InterceptionMode,
  type KeywordMatchScope,
  type KeywordRuleItem,
  type MatchedTarget,
  type RuleEvidence,
  type SceneModeKey,
  type SceneModeOverride,
  type SupportedLocale,
  type TriggeredRuleId,
} from './types';

const MAX_REGEX_CACHE_ENTRIES = 2000;
const MAX_DOMAIN_CACHE_ENTRIES = 2000;
const regexCache = new Map<string, RegExp | null>();
const validDomainRuleCache = new Map<string, string | null>();
const hostnameCache = new Map<string, string | null>();

interface CachedBlockedUidIndex {
  refs: AccountListEntry[];
  uids: string[];
  map: Map<string, AccountListEntry>;
}
const packBlockedUidIndexCache = new WeakMap<
  AccountListEntry[],
  CachedBlockedUidIndex
>();

interface CachedStringSet {
  snapshot: string[];
  set: Set<string>;
}
const stringSetCache = new WeakMap<string[], CachedStringSet>();

const defaultLangGroupSetByLocale = new Map<
  SupportedLocale,
  Set<CloudKeywordLangGroup>
>();

interface CachedLangGroupSet {
  snapshot: unknown[];
  set: Set<CloudKeywordLangGroup>;
}
const enabledLangGroupSetCache = new WeakMap<
  CloudKeywordLangGroup[],
  CachedLangGroupSet
>();

interface CachedMergedCloudSnapshot {
  ref: KeywordRuleItem;
  id: string;
  enabled: boolean;
  pattern: string;
  isRegex: boolean;
  langGroup: CloudKeywordLangGroup | undefined;
  packCategory: string | undefined;
  note: string | undefined;
  scopesRef: KeywordMatchScope[];
  scopesTuple: KeywordMatchScope[];
  onlyInReplies: boolean;
  maxFollowersExempt: number;
}
interface CachedMergedCloud {
  snapshots: CachedMergedCloudSnapshot[];
  merged: KeywordRuleItem[];
}
const mergedCloudKeywordsCache = new WeakMap<
  KeywordRuleItem[],
  CachedMergedCloud
>();

const SCOPE_INDEX: Record<KeywordMatchScope, number> = {
  text: 0,
  bio: 1,
  name: 2,
  url: 3,
};
const ALL_SCOPES: readonly KeywordMatchScope[] = ['text', 'bio', 'name', 'url'];
const HAS_REGEX_BACKREF_OR_NAMED_GROUP_RE =
  /(?:^|[^\\])(?:\\\\)*(?:\\(?:[1-9]|k<)|\(\?<(?![=!]))/;
const COMBINED_CHUNK_MAX_PATTERNS = 48;
const COMBINED_CHUNK_MAX_CHARS = 4096;
const COMBINED_PREFILTER_MIN_ACTIVE = 7;

interface CompiledKeywordEntry {
  itemRef: KeywordRuleItem;
  id: string;
  rawPattern: string;
  trimmedPattern: string;
  isRegex: boolean;
  regex: RegExp | null;
  enabled: boolean;
  scopesRef: KeywordMatchScope[];
  rawScopesTuple: KeywordMatchScope[];
  scopesTuple: KeywordMatchScope[];
  onlyInReplies: boolean;
  maxFollowersExempt: number;
  langGroup: CloudKeywordLangGroup;
  chunkIdByScope: [number, number, number, number];
}

interface KeywordPreFilterChunk {
  id: number;
  scopeIdx: number;
  langGroup: CloudKeywordLangGroup | null;
  regex: RegExp;
}

interface CompiledKeywordList {
  entries: CompiledKeywordEntry[];
  activeEntries: CompiledKeywordEntry[];
  chunksByScope: [
    KeywordPreFilterChunk[],
    KeywordPreFilterChunk[],
    KeywordPreFilterChunk[],
    KeywordPreFilterChunk[],
  ];
  totalChunks: number;
  hasDirectOnly: boolean;
  usePreFilter: boolean;
}

const compiledKeywordListCache = new WeakMap<
  KeywordRuleItem[],
  CompiledKeywordList
>();

interface CompiledDomainEntry {
  index: number;
  itemRef: DomainRuleItem;
  id: string;
  rawDomain: string;
  ruleDomain: string | null;
  enabled: boolean;
  onlyInReplies: boolean;
  maxFollowersExempt: number;
}

interface CompiledDomainIndex {
  entries: CompiledDomainEntry[];
  byDomain: Map<string, CompiledDomainEntry[]>;
  activeCount: number;
}

const compiledDomainIndexCache = new WeakMap<
  DomainRuleItem[],
  CompiledDomainIndex
>();

const NON_LINGUISTIC_LANGS = new Set([
  '',
  'und',
  'qme',
  'qam',
  'qht',
  'qct',
  'zxx',
  'art',
]);

const CJK_CHAR_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const ALNUM_CHAR_RE = /[\p{L}\p{N}]/u;

const LOW_EFFORT_REPLY_RE =
  /^(?:this|so\s+true|true|agreed|facts|real|nice|great(?:\s+post)?|good\s+project|lfg|gm|gn|bullish|interesting|wow|amazing|100%|exact(?:ly)?|well\s+said|spot\s+on|沙发|顶|好贴|好文|太强了|牛逼|支持|码住|mark|插眼|同感|确实|学到了)[.!~?！？。，、\s\p{Extended_Pictographic}]*$/iu;

const FUNNEL_BIO_LINK_RE =
  /(?:t\.me\/|telegram\.me\/|wa\.me\/|whatsapp\.com\/|linktr\.ee\/|beacons\.ai\/|allmylinks\.com\/|solo\.to\/|lit\.link\/|onlyfans\.com|fansly\.com|mym\.fans|candfans|stripchat|chaturbate|line\.me\/ti\/)/i;

const COMMENT_GIVEAWAY_BAIT_RE =
  /(?:\b(?:comment|reply|drop)\s+["'“「『【]?[a-z0-9_+-]{1,15}["'”」』】]?\s+(?:and\s+|to\s+|&\s*)?(?:i['’]?ll|i\s+will|we['’]?ll)?\s*(?:send|dm|share)\b|\b(?:like\s*(?:&|and|\+)\s*(?:rt|retweet)|(?:rt|retweet)\s*(?:&|and|\+)\s*(?:follow|like|reply)).{0,45}\b(?:dm|send|giveaway|win|airdrop|free)\b|\bmust\s+be\s+following\s+(?:me\s+)?(?:so\s+i\s+can\s+dm|to\s+receive)\b|(?:评论区?|下方)?(?:回复|扣|留|打|评论)\s*[「『“"【]?\s*[a-z0-9\u4e00-\u9fa5]{1,10}\s*[」』”"】]?\s*(?:即可|免费|自动|我?发你|私信发|领取|送你|打包发)|(?:转赞评|转发\s*[+＋与和及]\s*关注|点赞\s*[+＋与和及]\s*转发).{0,25}(?:抽\s*\d+|送出?|瓜分|领\s*\d+|空投))/i;

const FOLLOW_BACK_BAIT_RE =
  /(?:互关互赞|互粉互赞|有粉必回|诚信互关|蓝标互关|万粉互关|\blet['’]?s\s+connect\b[\s\S]{0,45}\bdrop\s+your\s+(?:x\s+|twitter\s+)?(?:handle|profile|account)\b|\bfollow\s+everyone\s+who\s+(?:likes|retweets|replies)\b|\bif\s+you\s+have\s+under\s+\d+k?\s+followers.{0,45}connect\b)/i;

const GROK_MENTION_RE = /(?:^|[^\w.+/-])@grok(?![\w]|\.[a-z]{2,}\b)/i;
const STRIP_GROK_MENTION_RE = /(^|[^\w.+/-])@grok(?![\w]|\.[a-z]{2,}\b)/gi;

const DOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;
const DOUBLE_TRAILING_DOT_RE = /[.。\uFF0E\uFF61]{2}$/;
const EXPLICIT_NON_HTTP_SCHEME_RE =
  /^(?:mailto|javascript|data|vbscript|file|blob|ftp|ftps|tel|about|ws|wss|chrome|edge|moz-extension|view-source|intent|sms|urn|magnet|geo|sip|sips|xmpp|irc|ircs|ssh|git|svn|news|nntp):/i;
const SCHEMELESS_HOST_PORT_RE = /^[^/?#\\:@]+\.[^/?#\\:@]+:\d+(?:[/?#\\]|$)/;
const SCHEMELESS_USERINFO_HOST_RE =
  /^[^/?#\\@]+:[^/?#\\@]*@[^/?#\\:@]+\.[^/?#\\:@]+(?:[:/?#\\]|$)/;

const DEFAULT_RULE_TARGET_ID: Record<TriggeredRuleId, string> = {
  local_blocklist: 'local_blocklist',
  crowd_block: 'crowdBlock',
  high_frequency_daily: 'highFrequency',
  high_frequency_window: 'highFrequency',
  keyword: 'keywords',
  cloud_keyword: 'keywords',
  reply_spam: 'replySpam',
  impersonation: 'replySpam',
  engagement_bait: 'engagementBait',
  tag_spam: 'tagSpam',
  account_quality: 'accountQuality',
  language_filter: 'languageFilter',
  promoted_ad: 'hidePromotedAds',
  grok_filter: 'grokFilter',
  domain_filter: 'domainFilter',
  rule_pack: 'rule_pack',
};

function hasOwn(
  obj: object | null | undefined,
  key: string | undefined
): boolean {
  return Boolean(
    obj &&
      typeof key === 'string' &&
      Object.prototype.hasOwnProperty.call(obj, key)
  );
}

function getOwnValue<T extends object>(
  record: T | null | undefined,
  key: string | undefined
): T[keyof T] | undefined {
  if (!hasOwn(record, key)) return undefined;
  return (record as Record<string, T[keyof T]>)[key!];
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchEngagementBaitReason(
  text: string,
  blockCommentGiveaway: boolean,
  blockFollowBack: boolean,
  msg: EngineMessages
): string | undefined {
  if (blockCommentGiveaway && COMMENT_GIVEAWAY_BAIT_RE.test(text)) {
    return msg.engagementGiveawayReason;
  }
  if (blockFollowBack && FOLLOW_BACK_BAIT_RE.test(text)) {
    return msg.engagementFollowReason;
  }
  return undefined;
}

function getCompiledRegex(pattern: string, isRegex: boolean): RegExp | null {
  const key = `${isRegex ? 'R' : 'L'}:${pattern}`;
  if (regexCache.has(key)) {
    return regexCache.get(key) ?? null;
  }
  try {
    const escaped = isRegex ? pattern : escapeRegExpLiteral(pattern);
    const regex = new RegExp(escaped, 'i');
    if (regexCache.size >= MAX_REGEX_CACHE_ENTRIES) {
      const oldestKey = regexCache.keys().next().value;
      if (oldestKey !== undefined) {
        regexCache.delete(oldestKey);
      }
    }
    regexCache.set(key, regex);
    return regex;
  } catch {
    if (regexCache.size >= MAX_REGEX_CACHE_ENTRIES) {
      const oldestKey = regexCache.keys().next().value;
      if (oldestKey !== undefined) {
        regexCache.delete(oldestKey);
      }
    }
    regexCache.set(key, null);
    return null;
  }
}

function getPackBlockedUidMap(
  entries: AccountListEntry[]
): Map<string, AccountListEntry> {
  const cached = packBlockedUidIndexCache.get(entries);
  if (cached && cached.refs.length === entries.length) {
    let valid = true;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry !== cached.refs[i] || (entry?.uid ?? '') !== cached.uids[i]) {
        valid = false;
        break;
      }
    }
    if (valid) return cached.map;
  }

  const len = entries.length;
  const refs = new Array<AccountListEntry>(len);
  const uids = new Array<string>(len);
  const map = new Map<string, AccountListEntry>();
  for (let i = 0; i < len; i++) {
    const entry = entries[i];
    refs[i] = entry!;
    const uid = entry?.uid ?? '';
    uids[i] = uid;
    if (uid) {
      map.set(uid, entry!);
    }
  }
  packBlockedUidIndexCache.set(entries, { refs, uids, map });
  return map;
}

function getCachedStringSet(arr?: string[]): Set<string> | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const cached = stringSetCache.get(arr);
  if (cached && cached.snapshot.length === arr.length) {
    let valid = true;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== cached.snapshot[i]) {
        valid = false;
        break;
      }
    }
    if (valid) return cached.set;
  }
  const snapshot = arr.slice();
  const set = new Set<string>(snapshot);
  stringSetCache.set(arr, { snapshot, set });
  return set;
}

function getEnabledCloudLangGroupSet(
  config: FilterConfig,
  locale: SupportedLocale
): Set<CloudKeywordLangGroup> {
  if (Array.isArray(config.enabledCloudLangGroups)) {
    const arr = config.enabledCloudLangGroups;
    const cached = enabledLangGroupSetCache.get(arr);
    if (cached && cached.snapshot.length === arr.length) {
      let valid = true;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] !== cached.snapshot[i]) {
          valid = false;
          break;
        }
      }
      if (valid) return cached.set;
    }
    const resolved = resolveEnabledCloudLangGroups(config);
    const set = new Set<CloudKeywordLangGroup>(resolved);
    enabledLangGroupSetCache.set(arr, { snapshot: arr.slice(), set });
    return set;
  }

  let defaultSet = defaultLangGroupSetByLocale.get(locale);
  if (!defaultSet) {
    const uiGroup = localeToCloudLangGroup(locale);
    defaultSet = new Set<CloudKeywordLangGroup>(['universal', 'en', uiGroup]);
    defaultLangGroupSetByLocale.set(locale, defaultSet);
  }
  return defaultSet;
}

function scopesEqual(
  a: KeywordMatchScope[] | undefined,
  b: KeywordMatchScope[]
): boolean {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function getMergedCloudKeywords(
  remoteKeywords?: KeywordRuleItem[]
): KeywordRuleItem[] {
  if (!Array.isArray(remoteKeywords) || remoteKeywords.length === 0) {
    return DEFAULT_CLOUD_KEYWORDS;
  }
  const cached = mergedCloudKeywordsCache.get(remoteKeywords);
  if (cached && cached.snapshots.length === remoteKeywords.length) {
    let valid = true;
    for (let i = 0; i < remoteKeywords.length; i++) {
      const item = remoteKeywords[i];
      const s = cached.snapshots[i]!;
      if (
        !item ||
        item !== s.ref ||
        item.id !== s.id ||
        item.enabled !== s.enabled ||
        item.pattern !== s.pattern ||
        item.isRegex !== s.isRegex ||
        item.langGroup !== s.langGroup ||
        item.packCategory !== s.packCategory ||
        item.note !== s.note ||
        item.scopes !== s.scopesRef ||
        !scopesEqual(item.scopes, s.scopesTuple) ||
        Boolean(item.onlyInReplies) !== s.onlyInReplies ||
        (item.maxFollowersExempt ?? 0) !== s.maxFollowersExempt
      ) {
        valid = false;
        break;
      }
    }
    if (valid) return cached.merged;
  }

  const merged = mergeCloudKeywords(remoteKeywords, false);
  const snapshots: CachedMergedCloudSnapshot[] = new Array(remoteKeywords.length);
  for (let i = 0; i < remoteKeywords.length; i++) {
    const item = remoteKeywords[i]!;
    snapshots[i] = {
      ref: item,
      id: item?.id ?? '',
      enabled: Boolean(item?.enabled),
      pattern: item?.pattern ?? '',
      isRegex: Boolean(item?.isRegex),
      langGroup: item?.langGroup,
      packCategory: item?.packCategory,
      note: item?.note,
      scopesRef: item?.scopes,
      scopesTuple: Array.isArray(item?.scopes) ? item.scopes.slice() : [],
      onlyInReplies: Boolean(item?.onlyInReplies),
      maxFollowersExempt: item?.maxFollowersExempt ?? 0,
    };
  }
  mergedCloudKeywordsCache.set(remoteKeywords, { snapshots, merged });
  return merged;
}

function getCompiledKeywordList(items: KeywordRuleItem[]): CompiledKeywordList {
  const cached = compiledKeywordListCache.get(items);
  if (cached && cached.entries.length === items.length) {
    let valid = true;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const e = cached.entries[i]!;
      if (
        !item ||
        item !== e.itemRef ||
        item.enabled !== e.enabled ||
        item.pattern !== e.rawPattern ||
        item.isRegex !== e.isRegex ||
        item.id !== e.id ||
        item.scopes !== e.scopesRef ||
        !scopesEqual(item.scopes, e.rawScopesTuple) ||
        Boolean(item.onlyInReplies) !== e.onlyInReplies ||
        (item.maxFollowersExempt ?? 0) !== e.maxFollowersExempt ||
        (item.langGroup ?? 'universal') !== e.langGroup
      ) {
        valid = false;
        break;
      }
    }
    if (valid) return cached;
  }

  const entries: CompiledKeywordEntry[] = new Array(items.length);
  const activeEntries: CompiledKeywordEntry[] = [];
  const distinctLangGroups = new Set<CloudKeywordLangGroup>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const rawPattern = typeof item?.pattern === 'string' ? item.pattern : '';
    const trimmedPattern = rawPattern.trim();
    const enabled = Boolean(item?.enabled);
    const isRegex = Boolean(item?.isRegex);
    const rawScopesTuple = Array.isArray(item?.scopes)
      ? item.scopes.slice()
      : [];
    const scopesTuple: KeywordMatchScope[] = [];
    for (let s = 0; s < rawScopesTuple.length; s++) {
      const scope = rawScopesTuple[s];
      if (hasOwn(SCOPE_INDEX, scope) && !scopesTuple.includes(scope)) {
        scopesTuple.push(scope);
      }
    }
    const langGroup: CloudKeywordLangGroup = item?.langGroup ?? 'universal';
    const regex =
      enabled && trimmedPattern
        ? getCompiledRegex(trimmedPattern, isRegex)
        : null;

    const entry: CompiledKeywordEntry = {
      itemRef: item,
      id: item?.id ?? '',
      rawPattern,
      trimmedPattern,
      isRegex,
      regex,
      enabled,
      scopesRef: item?.scopes,
      rawScopesTuple,
      scopesTuple,
      onlyInReplies: Boolean(item?.onlyInReplies),
      maxFollowersExempt: item?.maxFollowersExempt ?? 0,
      langGroup,
      chunkIdByScope: [-2, -2, -2, -2],
    };
    entries[i] = entry;
    if (enabled && regex && scopesTuple.length > 0) {
      activeEntries.push(entry);
      distinctLangGroups.add(langGroup);
    }
  }

  const chunksByScope: [
    KeywordPreFilterChunk[],
    KeywordPreFilterChunk[],
    KeywordPreFilterChunk[],
    KeywordPreFilterChunk[],
  ] = [[], [], [], []];
  let totalChunks = 0;
  let hasDirectOnly = false;
  const groupByLang = distinctLangGroups.size >= 2;

  if (activeEntries.length >= COMBINED_PREFILTER_MIN_ACTIVE) {
    type BucketItem = { entry: CompiledKeywordEntry; wrapped: string };
    const bucketsByScope: Array<Map<string, BucketItem[]>> = [
      new Map(),
      new Map(),
      new Map(),
      new Map(),
    ];

    for (const entry of activeEntries) {
      const canCombine =
        !entry.isRegex ||
        !HAS_REGEX_BACKREF_OR_NAMED_GROUP_RE.test(entry.trimmedPattern);
      const source = entry.isRegex
        ? entry.trimmedPattern
        : escapeRegExpLiteral(entry.trimmedPattern);
      const wrapped = `(?:${source})`;
      const bucketKey = groupByLang ? entry.langGroup : '__all__';

      for (const scope of entry.scopesTuple) {
        const sIdx = getOwnValue(SCOPE_INDEX, scope);
        if (sIdx === undefined) continue;
        if (!canCombine || wrapped.length > COMBINED_CHUNK_MAX_CHARS) {
          entry.chunkIdByScope[sIdx] = -1;
          hasDirectOnly = true;
          continue;
        }
        const scopeMap = bucketsByScope[sIdx]!;
        let bucket = scopeMap.get(bucketKey);
        if (!bucket) {
          bucket = [];
          scopeMap.set(bucketKey, bucket);
        }
        bucket.push({ entry, wrapped });
      }
    }

    const flushChunk = (
      scopeIdx: number,
      langGroup: CloudKeywordLangGroup | null,
      group: BucketItem[]
    ) => {
      if (group.length === 0) return;
      try {
        const combined = new RegExp(
          group.map((g) => g.wrapped).join('|'),
          'i'
        );
        const id = totalChunks++;
        for (const g of group) {
          g.entry.chunkIdByScope[scopeIdx] = id;
        }
        chunksByScope[scopeIdx]!.push({
          id,
          scopeIdx,
          langGroup,
          regex: combined,
        });
      } catch {
        for (const g of group) {
          g.entry.chunkIdByScope[scopeIdx] = -1;
        }
        hasDirectOnly = true;
      }
    };

    for (let sIdx = 0; sIdx < 4; sIdx++) {
      const scopeMap = bucketsByScope[sIdx]!;
      for (const [bucketKey, bucketItems] of scopeMap.entries()) {
        const chunkLang = groupByLang
          ? (bucketKey as CloudKeywordLangGroup)
          : null;
        let currentGroup: BucketItem[] = [];
        let currentChars = 0;
        for (const bi of bucketItems) {
          if (
            currentGroup.length > 0 &&
            (currentGroup.length >= COMBINED_CHUNK_MAX_PATTERNS ||
              currentChars + bi.wrapped.length + 1 > COMBINED_CHUNK_MAX_CHARS)
          ) {
            flushChunk(sIdx, chunkLang, currentGroup);
            currentGroup = [];
            currentChars = 0;
          }
          currentGroup.push(bi);
          currentChars += bi.wrapped.length + 1;
        }
        flushChunk(sIdx, chunkLang, currentGroup);
      }
    }
  }

  const compiled: CompiledKeywordList = {
    entries,
    activeEntries,
    chunksByScope,
    totalChunks,
    hasDirectOnly,
    usePreFilter:
      activeEntries.length >= COMBINED_PREFILTER_MIN_ACTIVE && totalChunks > 0,
  };
  compiledKeywordListCache.set(items, compiled);
  return compiled;
}

function getCompiledDomainIndex(items: DomainRuleItem[]): CompiledDomainIndex {
  const cached = compiledDomainIndexCache.get(items);
  if (cached && cached.entries.length === items.length) {
    let valid = true;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const e = cached.entries[i]!;
      if (
        !item ||
        item !== e.itemRef ||
        item.enabled !== e.enabled ||
        item.domain !== e.rawDomain ||
        item.id !== e.id ||
        Boolean(item.onlyInReplies) !== e.onlyInReplies ||
        (item.maxFollowersExempt ?? 0) !== e.maxFollowersExempt
      ) {
        valid = false;
        break;
      }
    }
    if (valid) return cached;
  }

  const entries: CompiledDomainEntry[] = new Array(items.length);
  const byDomain = new Map<string, CompiledDomainEntry[]>();
  let activeCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const rawDomain = typeof item?.domain === 'string' ? item.domain : '';
    const enabled = Boolean(item?.enabled);
    const ruleDomain = enabled ? getValidNormalizedDomain(rawDomain) : null;
    const entry: CompiledDomainEntry = {
      index: i,
      itemRef: item,
      id: item?.id ?? '',
      rawDomain,
      ruleDomain,
      enabled,
      onlyInReplies: Boolean(item?.onlyInReplies),
      maxFollowersExempt: item?.maxFollowersExempt ?? 0,
    };
    entries[i] = entry;
    if (enabled && ruleDomain) {
      activeCount++;
      let bucket = byDomain.get(ruleDomain);
      if (!bucket) {
        bucket = [];
        byDomain.set(ruleDomain, bucket);
      }
      bucket.push(entry);
    }
  }

  const compiled: CompiledDomainIndex = { entries, byDomain, activeCount };
  compiledDomainIndexCache.set(items, compiled);
  return compiled;
}

/**
 * Identifies the official @grok account strictly by immutable restId or exact case-insensitive handle.
 * Display names and lookalike handles (e.g. @grok_bot, @grok123) are never treated as official.
 */
export function isOfficialGrokAuthor(
  author?: Pick<ExtractedAuthor, 'restId' | 'screenName'> | null
): boolean {
  if (!author) return false;
  if (author.restId === OFFICIAL_GROK_UID) return true;
  return (author.screenName ?? '').toLowerCase() === OFFICIAL_GROK_SCREEN_NAME;
}

function isProtectedOfficialGrok(
  author: Pick<ExtractedAuthor, 'restId' | 'screenName'>,
  config: FilterConfig
): boolean {
  if (!isOfficialGrokAuthor(author)) return false;
  const grokCfg = config.rules.grokFilter;
  return grokCfg ? Boolean(grokCfg.enabled && grokCfg.protectOfficialGrok) : true;
}

function hasNonAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0x7f) return true;
  }
  return false;
}

/**
 * Normalizes a user-supplied domain rule (strips scheme, auth, port, path, query, fragment, leading `*./www.`, trailing dots, and converts IDN to ASCII punycode).
 */
export function normalizeDomainRule(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (!s) return '';
  if (EXPLICIT_NON_HTTP_SCHEME_RE.test(s)) {
    return '';
  }
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/\//, '');
  const cut = s.search(/[/?#\\]/);
  if (cut !== -1) s = s.slice(0, cut);
  const atIdx = s.lastIndexOf('@');
  if (atIdx !== -1) s = s.slice(atIdx + 1);
  if (!s.startsWith('[')) {
    const colonIdx = s.indexOf(':');
    if (colonIdx !== -1) s = s.slice(0, colonIdx);
  }
  s = s.replace(/^(?:\*\.)+/, '').replace(/^\.+/, '');
  if (DOUBLE_TRAILING_DOT_RE.test(s)) {
    return s;
  }
  if (hasNonAscii(s)) {
    try {
      const parsed = new URL(`https://${s}`);
      if (
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash ||
        parsed.port ||
        parsed.username ||
        parsed.password
      ) {
        return s;
      }
      s = parsed.hostname.toLowerCase();
    } catch {
      return s;
    }
  }
  s = s.replace(/\.$/, '');
  if (s.endsWith('.')) {
    return s;
  }
  s = s.replace(/^www\.(?=[^.]+\.)/, '');
  return s;
}

/**
 * Validates a normalized hostname rule (requires >= 2 DNS labels, valid ASCII/punycode TLD, rejects IPs/localhost/wildcards).
 */
export function isValidDomainRule(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!DOMAIN_LABEL_RE.test(label)) return false;
  }
  return DOMAIN_TLD_RE.test(labels[labels.length - 1]!);
}

function getValidNormalizedDomain(rawDomain: string): string | null {
  if (validDomainRuleCache.has(rawDomain)) {
    return validDomainRuleCache.get(rawDomain) ?? null;
  }
  const normalized = normalizeDomainRule(rawDomain);
  const valid = isValidDomainRule(normalized) ? normalized : null;
  if (validDomainRuleCache.size >= MAX_DOMAIN_CACHE_ENTRIES) {
    const oldestKey = validDomainRuleCache.keys().next().value;
    if (oldestKey !== undefined) {
      validDomainRuleCache.delete(oldestKey);
    }
  }
  validDomainRuleCache.set(rawDomain, valid);
  return valid;
}

/**
 * Extracts lowercase hostname (without trailing dot) from an http(s) or scheme-less URL.
 * Rejects non-http(s) schemes (javascript:, mailto:, data:, etc.) and malformed double trailing dots.
 */
export function extractHostnameFromUrl(rawUrl: string): string | null {
  if (hostnameCache.has(rawUrl)) {
    return hostnameCache.get(rawUrl) ?? null;
  }
  const trimmed = rawUrl.trim();
  let result: string | null = null;
  if (trimmed && !/\s/.test(trimmed)) {
    let candidate: string | null = null;
    if (/^https?:\/\//i.test(trimmed)) {
      candidate = trimmed;
    } else if (/^\/\//.test(trimmed)) {
      candidate = `https:${trimmed}`;
    } else if (
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ||
      EXPLICIT_NON_HTTP_SCHEME_RE.test(trimmed)
    ) {
      candidate = null;
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      if (
        SCHEMELESS_HOST_PORT_RE.test(trimmed) ||
        SCHEMELESS_USERINFO_HOST_RE.test(trimmed)
      ) {
        candidate = `https://${trimmed}`;
      }
    } else if (trimmed.includes('.')) {
      candidate = `https://${trimmed}`;
    }
    if (candidate) {
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
          result = host && !host.endsWith('.') ? host : null;
        }
      } catch {
        result = null;
      }
    }
  }
  if (hostnameCache.size >= MAX_DOMAIN_CACHE_ENTRIES) {
    const oldestKey = hostnameCache.keys().next().value;
    if (oldestKey !== undefined) {
      hostnameCache.delete(oldestKey);
    }
  }
  hostnameCache.set(rawUrl, result);
  return result;
}

/**
 * Matches a hostname strictly against an exact root domain or its subdomains (never arbitrary substring matches).
 */
export function matchesDomainRule(host: string, ruleDomain: string): boolean {
  if (!host || /[/?#\\@:\s]/.test(host) || DOUBLE_TRAILING_DOT_RE.test(host)) {
    return false;
  }
  let h = host.toLowerCase();
  if (hasNonAscii(h)) {
    try {
      const parsed = new URL(`https://${h}`);
      if (
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash ||
        parsed.port ||
        parsed.username ||
        parsed.password
      ) {
        return false;
      }
      h = parsed.hostname.toLowerCase();
    } catch {
      return false;
    }
  }
  h = h.replace(/\.$/, '');
  const d = getValidNormalizedDomain(ruleDomain);
  if (!h || h.startsWith('.') || h.endsWith('.') || h.includes('..') || !d) {
    return false;
  }
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Tracks how many distinct tweets by each author have appeared in the user's stream
 * within a configurable sliding window (e.g. 1 hour).
 */
export class SlidingWindowTracker {
  private history = new Map<string, Map<string, number>>();

  public recordAndCount(
    authorUid: string,
    tweetId: string,
    windowHours: number,
    now = Date.now()
  ): number {
    if (!authorUid || !tweetId) return 1;
    const windowMs = Math.max(0.1, windowHours) * 3600_000;
    const cutoff = now - windowMs;

    let authorTweets = this.history.get(authorUid);
    if (!authorTweets) {
      authorTweets = new Map<string, number>();
      this.history.set(authorUid, authorTweets);
    }

    for (const [id, ts] of authorTweets.entries()) {
      if (ts < cutoff) {
        authorTweets.delete(id);
      }
    }

    if (!authorTweets.has(tweetId)) {
      authorTweets.set(tweetId, now);
    }

    if (this.history.size > 3000) {
      for (const [uid, map] of this.history.entries()) {
        if (map.size === 0) this.history.delete(uid);
      }
    }

    return authorTweets.size;
  }

  public clear(): void {
    this.history.clear();
  }

  public count(
    authorUid: string,
    windowHours: number,
    now = Date.now()
  ): number {
    const cutoff = now - Math.max(0.1, windowHours) * 3600_000;
    return [...(this.history.get(authorUid)?.values() ?? [])].filter(
      (ts) => ts >= cutoff
    ).length;
  }
}

interface DuplicateOrigin {
  firstTweetId: string;
  firstAuthorUid: string;
  seenTweetIds: Set<string>;
}

const MAX_TRACKED_THREADS = 200;
const MAX_SIGNATURES_PER_THREAD = 500;
const MAX_SEEN_TWEETS_PER_SIGNATURE = 1000;

/**
 * Bounded-memory tracker detecting identical copy-paste replies posted by different accounts
 * within the same thread (keyed by focalTweetId / inReplyToTweetId).
 */
export class ThreadDuplicateTracker {
  private threads = new Map<string, Map<string, DuplicateOrigin>>();

  public recordAndCheck(
    threadKey: string,
    tweetId: string,
    authorUid: string,
    normalized: string
  ): boolean {
    if (!threadKey || !tweetId || !authorUid || !normalized) return false;

    let sigs = this.threads.get(threadKey);
    if (sigs) {
      // Touch for LRU recency so the active thread is not evicted
      this.threads.delete(threadKey);
      this.threads.set(threadKey, sigs);
    } else {
      if (this.threads.size >= MAX_TRACKED_THREADS) {
        const oldestKey = this.threads.keys().next().value;
        if (oldestKey !== undefined) this.threads.delete(oldestKey);
      }
      sigs = new Map<string, DuplicateOrigin>();
      this.threads.set(threadKey, sigs);
    }

    const existing = sigs.get(normalized);
    if (!existing) {
      if (sigs.size >= MAX_SIGNATURES_PER_THREAD) {
        const oldestSig = sigs.keys().next().value;
        if (oldestSig !== undefined) sigs.delete(oldestSig);
      }
      sigs.set(normalized, {
        firstTweetId: tweetId,
        firstAuthorUid: authorUid,
        seenTweetIds: new Set([tweetId]),
      });
      return false;
    }

    // Touch for LRU recency so actively repeating spam templates stay tracked under viral-thread churn
    sigs.delete(normalized);
    sigs.set(normalized, existing);

    if (existing.firstTweetId === tweetId) return false;
    if (existing.firstAuthorUid === authorUid) return false;

    if (existing.seenTweetIds.size < MAX_SEEN_TWEETS_PER_SIGNATURE) {
      existing.seenTweetIds.add(tweetId);
    }
    return true;
  }

  public isDuplicate(
    threadKey: string,
    tweetId: string,
    authorUid: string,
    normalized: string
  ): boolean {
    if (!threadKey || !tweetId || !authorUid || !normalized) return false;
    const existing = this.threads.get(threadKey)?.get(normalized);
    if (!existing || existing.firstTweetId === tweetId) return false;
    return existing.firstAuthorUid !== authorUid;
  }

  public getDuplicateCount(threadKey: string, normalized: string): number {
    if (!threadKey || !normalized) return 0;
    const existing = this.threads.get(threadKey)?.get(normalized);
    return existing ? existing.seenTweetIds.size : 0;
  }

  public clear(): void {
    this.threads.clear();
  }
}

interface KeywordCandidate {
  author: ExtractedAuthor;
  targets: Record<KeywordMatchScope, string>;
}

interface DomainCandidate {
  author: ExtractedAuthor;
  hosts: Array<{ host: string; scope: 'url' | 'bio' }>;
}

type AuthorSlot = 'primary' | 'rt' | 'qt';

function extractCandidateHosts(
  urlList: string[],
  bioUrlList: string[]
): Array<{ host: string; scope: 'url' | 'bio' }> {
  if (urlList.length === 0 && bioUrlList.length === 0) return [];
  const hosts: Array<{ host: string; scope: 'url' | 'bio' }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < urlList.length; i++) {
    const host = extractHostnameFromUrl(urlList[i]!);
    if (host && !seen.has(`u:${host}`)) {
      seen.add(`u:${host}`);
      hosts.push({ host, scope: 'url' });
    }
  }
  for (let i = 0; i < bioUrlList.length; i++) {
    const host = extractHostnameFromUrl(bioUrlList[i]!);
    if (host && !seen.has(`b:${host}`)) {
      seen.add(`b:${host}`);
      hosts.push({ host, scope: 'bio' });
    }
  }
  return hosts;
}

class TweetMatchContext {
  public readonly isThirdPartyReplyContext: boolean;
  private kwPrimary?: KeywordCandidate;
  private kwRt?: KeywordCandidate | null;
  private kwQt?: KeywordCandidate | null;
  private domPrimary?: DomainCandidate | null;
  private domRt?: DomainCandidate | null;
  private domQt?: DomainCandidate | null;

  constructor(private readonly tweet: ExtractedTweet) {
    this.isThirdPartyReplyContext =
      (tweet.scene === 'reply' || tweet.isReply) &&
      !(
        tweet.focalAuthor?.restId &&
        tweet.author.restId === tweet.focalAuthor.restId
      );
  }

  private getPrimaryUrls(): string[] {
    const { tweet } = this;
    const includeQt = Boolean(!tweet.quotedAuthor && tweet.quotedUrls?.length);
    const includeRt = Boolean(
      !tweet.retweetedAuthor && tweet.retweetedUrls?.length
    );
    if (!includeQt && !includeRt) return tweet.urls;
    return [
      ...tweet.urls,
      ...(includeQt ? tweet.quotedUrls! : []),
      ...(includeRt ? tweet.retweetedUrls! : []),
    ];
  }

  private getRtUrls(): string[] {
    const { tweet } = this;
    return tweet.retweetedUrls !== undefined ? tweet.retweetedUrls : tweet.urls;
  }

  private getQtUrls(): string[] {
    return this.tweet.quotedUrls ?? [];
  }

  public getKeywordCandidate(slot: AuthorSlot): KeywordCandidate | null {
    const { tweet } = this;
    if (slot === 'primary') {
      if (!this.kwPrimary) {
        const { author } = tweet;
        const isSeparatedRetweet = Boolean(
          tweet.retweetedAuthor && tweet.retweetedText !== undefined
        );
        let text = isSeparatedRetweet ? '' : tweet.text;
        if (!tweet.quotedAuthor && !tweet.retweetedAuthor) {
          if (tweet.retweetedText && tweet.quotedText) {
            text = `${tweet.text}\n${tweet.retweetedText}\n${tweet.quotedText}`;
          } else if (tweet.retweetedText) {
            text = `${tweet.text}\n${tweet.retweetedText}`;
          } else if (tweet.quotedText) {
            text = `${tweet.text}\n${tweet.quotedText}`;
          }
        }
        const primaryUrls = this.getPrimaryUrls();
        const urlStr =
          primaryUrls.length === 0 && author.bioUrls.length === 0
            ? ''
            : [...primaryUrls, ...author.bioUrls].join(' ');
        this.kwPrimary = {
          author,
          targets: {
            text,
            bio: author.bio,
            name: `${author.name} @${author.screenName}`,
            url: urlStr,
          },
        };
      }
      return this.kwPrimary;
    }

    if (slot === 'rt') {
      if (this.kwRt === undefined) {
        const rt = tweet.retweetedAuthor;
        if (!rt) {
          this.kwRt = null;
        } else {
          const rtText =
            tweet.retweetedText ??
            (!tweet.quotedAuthor ? (tweet.quotedText ?? '') : '');
          const rtUrls = this.getRtUrls();
          const urlStr =
            rtUrls.length === 0 && rt.bioUrls.length === 0
              ? ''
              : [...rtUrls, ...rt.bioUrls].join(' ');
          this.kwRt = {
            author: rt,
            targets: {
              text: rtText,
              bio: rt.bio,
              name: `${rt.name} @${rt.screenName}`,
              url: urlStr,
            },
          };
        }
      }
      return this.kwRt;
    }

    if (this.kwQt === undefined) {
      const qt = tweet.quotedAuthor;
      if (!qt) {
        this.kwQt = null;
      } else {
        const qtUrls = this.getQtUrls();
        const urlStr =
          qtUrls.length === 0 && qt.bioUrls.length === 0
            ? ''
            : [...qtUrls, ...qt.bioUrls].join(' ');
        this.kwQt = {
          author: qt,
          targets: {
            text: tweet.quotedText ?? '',
            bio: qt.bio,
            name: `${qt.name} @${qt.screenName}`,
            url: urlStr,
          },
        };
      }
    }
    return this.kwQt;
  }

  public getDomainCandidate(slot: AuthorSlot): DomainCandidate | null {
    const { tweet } = this;
    if (slot === 'primary') {
      if (this.domPrimary === undefined) {
        const hosts = extractCandidateHosts(
          this.getPrimaryUrls(),
          tweet.author.bioUrls
        );
        this.domPrimary =
          hosts.length > 0 ? { author: tweet.author, hosts } : null;
      }
      return this.domPrimary;
    }

    if (slot === 'rt') {
      if (this.domRt === undefined) {
        const rt = tweet.retweetedAuthor;
        if (!rt) {
          this.domRt = null;
        } else {
          const hosts = extractCandidateHosts(this.getRtUrls(), rt.bioUrls);
          this.domRt = hosts.length > 0 ? { author: rt, hosts } : null;
        }
      }
      return this.domRt;
    }

    if (this.domQt === undefined) {
      const qt = tweet.quotedAuthor;
      if (!qt) {
        this.domQt = null;
      } else {
        const hosts = extractCandidateHosts(this.getQtUrls(), qt.bioUrls);
        this.domQt = hosts.length > 0 ? { author: qt, hosts } : null;
      }
    }
    return this.domQt;
  }

  public getKeywordCandidates(
    includePrimary: boolean,
    includeRt: boolean,
    includeQt: boolean
  ): KeywordCandidate[] {
    const out: KeywordCandidate[] = [];
    if (includePrimary) {
      const c = this.getKeywordCandidate('primary');
      if (c) out.push(c);
    }
    if (includeRt) {
      const c = this.getKeywordCandidate('rt');
      if (c) out.push(c);
    }
    if (includeQt) {
      const c = this.getKeywordCandidate('qt');
      if (c) out.push(c);
    }
    return out;
  }

  public getDomainCandidates(
    includePrimary: boolean,
    includeRt: boolean,
    includeQt: boolean
  ): DomainCandidate[] {
    const out: DomainCandidate[] = [];
    if (includePrimary) {
      const c = this.getDomainCandidate('primary');
      if (c) out.push(c);
    }
    if (includeRt) {
      const c = this.getDomainCandidate('rt');
      if (c) out.push(c);
    }
    if (includeQt) {
      const c = this.getDomainCandidate('qt');
      if (c) out.push(c);
    }
    return out;
  }
}

interface MatchListOptions {
  includePrimary: boolean;
  includeRt: boolean;
  includeQt: boolean;
  disabledIds?: Set<string> | null;
  enabledLangGroups?: Set<CloudKeywordLangGroup> | null;
}

function matchKeywordList(
  items: KeywordRuleItem[],
  ctx: TweetMatchContext,
  options: MatchListOptions
): {
  item: KeywordRuleItem;
  matchedScope: KeywordMatchScope;
  matchedAuthor: ExtractedAuthor;
} | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const candidates = ctx.getKeywordCandidates(
    options.includePrimary,
    options.includeRt,
    options.includeQt
  );
  if (candidates.length === 0) return null;

  const compiled = getCompiledKeywordList(items);
  const activeEntries = compiled.activeEntries;
  if (activeEntries.length === 0) return null;

  const { disabledIds, enabledLangGroups } = options;
  const isThirdPartyReplyContext = ctx.isThirdPartyReplyContext;

  if (compiled.usePreFilter) {
    const hitChunks = new Uint8Array(compiled.totalChunks);
    let anyChunkHit = false;

    for (let sIdx = 0; sIdx < 4; sIdx++) {
      const scopeChunks = compiled.chunksByScope[sIdx]!;
      if (scopeChunks.length === 0) continue;
      const scope = ALL_SCOPES[sIdx]!;

      let hasNonEmptyTarget = false;
      for (let c = 0; c < candidates.length; c++) {
        if (candidates[c]!.targets[scope]) {
          hasNonEmptyTarget = true;
          break;
        }
      }
      if (!hasNonEmptyTarget) continue;

      for (let k = 0; k < scopeChunks.length; k++) {
        const chunk = scopeChunks[k]!;
        if (
          enabledLangGroups &&
          chunk.langGroup !== null &&
          !enabledLangGroups.has(chunk.langGroup)
        ) {
          continue;
        }
        for (let c = 0; c < candidates.length; c++) {
          const target = candidates[c]!.targets[scope];
          if (target && chunk.regex.test(target)) {
            hitChunks[chunk.id] = 1;
            anyChunkHit = true;
            break;
          }
        }
      }
    }

    if (!anyChunkHit && !compiled.hasDirectOnly) {
      return null;
    }

    for (let i = 0; i < activeEntries.length; i++) {
      const entry = activeEntries[i]!;
      if (disabledIds?.has(entry.id)) continue;
      if (enabledLangGroups && !enabledLangGroups.has(entry.langGroup)) continue;
      if (entry.onlyInReplies && !isThirdPartyReplyContext) continue;

      let entryMayMatch = false;
      for (let s = 0; s < entry.scopesTuple.length; s++) {
        const sIdx = getOwnValue(SCOPE_INDEX, entry.scopesTuple[s]);
        if (sIdx === undefined) continue;
        const cid = entry.chunkIdByScope[sIdx];
        if (cid === -1 || (cid >= 0 && hitChunks[cid] === 1)) {
          entryMayMatch = true;
          break;
        }
      }
      if (!entryMayMatch) continue;

      for (let c = 0; c < candidates.length; c++) {
        const cand = candidates[c]!;
        if (
          entry.maxFollowersExempt &&
          cand.author.followersCount >= entry.maxFollowersExempt
        ) {
          continue;
        }
        for (let s = 0; s < entry.scopesTuple.length; s++) {
          const scope = entry.scopesTuple[s]!;
          const sIdx = getOwnValue(SCOPE_INDEX, scope);
          if (sIdx === undefined) continue;
          const cid = entry.chunkIdByScope[sIdx];
          if (cid >= 0 && hitChunks[cid] === 0) continue;
          const target = getOwnValue(cand.targets, scope);
          if (target && entry.regex!.test(target)) {
            return {
              item: entry.itemRef,
              matchedScope: scope,
              matchedAuthor: cand.author,
            };
          }
        }
      }
    }
    return null;
  }

  for (let i = 0; i < activeEntries.length; i++) {
    const entry = activeEntries[i]!;
    if (disabledIds?.has(entry.id)) continue;
    if (enabledLangGroups && !enabledLangGroups.has(entry.langGroup)) continue;
    if (entry.onlyInReplies && !isThirdPartyReplyContext) continue;

    for (let c = 0; c < candidates.length; c++) {
      const cand = candidates[c]!;
      if (
        entry.maxFollowersExempt &&
        cand.author.followersCount >= entry.maxFollowersExempt
      ) {
        continue;
      }
      for (let s = 0; s < entry.scopesTuple.length; s++) {
        const scope = entry.scopesTuple[s]!;
        const target = getOwnValue(cand.targets, scope);
        if (target && entry.regex!.test(target)) {
          return {
            item: entry.itemRef,
            matchedScope: scope,
            matchedAuthor: cand.author,
          };
        }
      }
    }
  }
  return null;
}

function matchDomainList(
  items: DomainRuleItem[],
  ctx: TweetMatchContext,
  options: MatchListOptions
): {
  item: DomainRuleItem;
  ruleDomain: string;
  matchedHost: string;
  matchedScope: 'url' | 'bio';
  matchedAuthor: ExtractedAuthor;
} | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const candidates = ctx.getDomainCandidates(
    options.includePrimary,
    options.includeRt,
    options.includeQt
  );
  if (candidates.length === 0) return null;

  const compiled = getCompiledDomainIndex(items);
  if (compiled.activeCount === 0) return null;

  const { disabledIds } = options;
  const isThirdPartyReplyContext = ctx.isThirdPartyReplyContext;

  let best: {
    itemIndex: number;
    item: DomainRuleItem;
    ruleDomain: string;
    matchedHost: string;
    matchedScope: 'url' | 'bio';
    matchedAuthor: ExtractedAuthor;
  } | null = null;

  for (let c = 0; c < candidates.length; c++) {
    const cand = candidates[c]!;
    const hosts = cand.hosts;
    for (let h = 0; h < hosts.length; h++) {
      const hostEntry = hosts[h]!;
      let suffix = hostEntry.host;
      while (true) {
        const bucket = compiled.byDomain.get(suffix);
        if (bucket) {
          for (let b = 0; b < bucket.length; b++) {
            const rule = bucket[b]!;
            if (best && rule.index >= best.itemIndex) break;
            if (disabledIds?.has(rule.id)) continue;
            if (rule.onlyInReplies && !isThirdPartyReplyContext) continue;
            if (
              rule.maxFollowersExempt &&
              cand.author.followersCount >= rule.maxFollowersExempt
            ) {
              continue;
            }
            best = {
              itemIndex: rule.index,
              item: rule.itemRef,
              ruleDomain: rule.ruleDomain!,
              matchedHost: hostEntry.host,
              matchedScope: hostEntry.scope,
              matchedAuthor: cand.author,
            };
            break;
          }
        }
        const dotIdx = suffix.indexOf('.');
        if (dotIdx === -1) break;
        suffix = suffix.slice(dotIdx + 1);
      }
    }
  }

  if (!best) return null;
  return {
    item: best.item,
    ruleDomain: best.ruleDomain,
    matchedHost: best.matchedHost,
    matchedScope: best.matchedScope,
    matchedAuthor: best.matchedAuthor,
  };
}

/**
 * Strips leading/inline @mentions, URLs, and whitespace from a tweet to inspect its substantive text.
 */
export function stripMentionsAndUrls(rawText: string): string {
  return rawText
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/(^|\s)@[a-zA-Z0-9_]+/g, ' ')
    .trim();
}

/**
 * Checks whether a non-empty string consists strictly of emojis, symbols, or punctuation with no letters/CJK/numbers.
 */
export function isPureEmojiOrSymbol(cleanedText: string): boolean {
  if (!cleanedText) return false;
  return !ALNUM_CHAR_RE.test(cleanedText);
}

/**
 * Computes information-weighted text length:
 * - CJK / Hiragana / Katakana / Hangul characters count as 2
 * - Other letters and digits count as 1
 * - Punctuation, spaces, and emojis count as 0
 */
export function computeWeightedTextLength(cleanedText: string): number {
  let weight = 0;
  for (const ch of cleanedText) {
    const code = ch.charCodeAt(0);
    if (code < 128) {
      if (
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122)
      ) {
        weight += 1;
      }
    } else if (CJK_CHAR_RE.test(ch)) {
      weight += 2;
    } else if (ALNUM_CHAR_RE.test(ch)) {
      weight += 1;
    }
  }
  return weight;
}

/**
 * Normalizes a reply for deterministic exact duplicate matching:
 * strips @mentions and URLs, NFKC-lowercases and removes punctuation/whitespace, then computes NFKC-invariant weighted length.
 */
export function normalizeReplyForDedup(rawText: string): {
  normalized: string;
  weightedLength: number;
} {
  const stripped = stripMentionsAndUrls(rawText);
  const normalized = stripped
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  const weightedLength = computeWeightedTextLength(normalized);
  return { normalized, weightedLength };
}

function editDistanceAtMost2(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
      if (dp[j] < rowMin) rowMin = dp[j];
    }
    if (rowMin > 2) return 3;
  }
  return dp[b.length];
}

function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a[i] === b[i]) i++;
  return i;
}

export function isLikelyImpersonator(
  author: ExtractedAuthor,
  focal: FocalTweetAuthor
): boolean {
  if (!author.restId || !focal.restId || author.restId === focal.restId) {
    return false;
  }
  if (author.following || focal.followersCount < 1000) {
    return false;
  }
  if (author.followersCount >= Math.max(1000, focal.followersCount * 0.08)) {
    return false;
  }

  const aHandle = author.screenName.toLowerCase().replace(/_/g, '');
  const fHandle = focal.screenName.toLowerCase().replace(/_/g, '');
  if (
    fHandle.length >= 4 &&
    aHandle.length >= 4 &&
    author.followersCount < focal.followersCount * 0.05 &&
    (editDistanceAtMost2(aHandle, fHandle) <= 2 ||
      (aHandle.includes(fHandle) && aHandle.length <= fHandle.length + 5))
  ) {
    return true;
  }

  const normName = (s: string) =>
    s
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '');
  const aName = normName(author.name);
  const fName = normName(focal.name);
  if (
    aName.length >= 2 &&
    aName === fName &&
    author.followersCount < Math.max(500, focal.followersCount * 0.02) &&
    (fName.length >= 5 ||
      author.accountAgeDays < 60 ||
      author.followersCount < 150 ||
      commonPrefixLength(aHandle, fHandle) >= 3)
  ) {
    return true;
  }

  return false;
}

/**
 * Evaluates an author's profile to generate risk badges (used on User Profile pages and tooltips).
 */
export function evaluateAuthorProfile(
  author: ExtractedAuthor,
  config: FilterConfig,
  crowdSnapshot?: CrowdBlockSnapshot | null
): {
  riskBadges: string[];
  primaryReason?: string;
  primaryRuleId?: TriggeredRuleId;
  hasCrowdBadge?: boolean;
} {
  const riskBadges: string[] = [];
  let primaryReason: string | undefined;
  let primaryRuleId: TriggeredRuleId | undefined;
  let hasCrowdBadge = false;

  const recordRisk = (ruleId: TriggeredRuleId, badge: string) => {
    riskBadges.push(badge);
    if (!primaryReason) {
      primaryReason = badge;
      primaryRuleId = ruleId;
    }
  };

  if (
    !config.enabled ||
    (author.restId && getOwnValue(config.whitelistUids, author.restId))
  ) {
    return { riskBadges: [], hasCrowdBadge: false };
  }

  const locale = resolveLocale(config.locale);
  const msg = getEngineMessages(locale);
  const reasonLabels = getBlockReasonLabels(locale);

  // 1. Local blocklist
  const localEntry = author.restId
    ? getOwnValue(config.localBlocklistUids, author.restId)
    : undefined;
  if (localEntry) {
    const tagLabel = localEntry.tag
      ? getOwnValue(reasonLabels, localEntry.tag)
      : undefined;
    recordRisk('local_blocklist', msg.localBlockBadge(tagLabel));
  }

  // 2. Crowd-sourced block count
  const crowdEntry = author.restId
    ? getOwnValue(crowdSnapshot?.counts, author.restId)
    : undefined;
  if (config.rules.crowdBlock.enabled && crowdEntry && crowdEntry.c > 0) {
    const isHighFollower =
      crowdEntry.p === true ||
      author.followersCount >= HIGH_FOLLOWER_PROTECT_THRESHOLD;
    const minRequired = isHighFollower
      ? config.rules.crowdBlock.minBlockCount * HIGH_FOLLOWER_VOTE_MULTIPLIER
      : config.rules.crowdBlock.minBlockCount;
    const tagLabel = crowdEntry.t
      ? getOwnValue(reasonLabels, crowdEntry.t)
      : undefined;
    if (crowdEntry.c >= minRequired) {
      hasCrowdBadge = true;
      recordRisk('crowd_block', msg.crowdBadge(crowdEntry.c, tagLabel));
    } else if (crowdEntry.c >= 2) {
      hasCrowdBadge = true;
      riskBadges.push(msg.crowdBadge(crowdEntry.c, tagLabel));
    }
  }

  // 3. High-frequency daily posting (official @grok is exempted when protectOfficialGrok is active)
  const grokProtected = isProtectedOfficialGrok(author, config);
  if (
    !grokProtected &&
    config.rules.highFrequency.enabled &&
    author.statusesCount >= 30 &&
    author.dailyTweetRate > config.rules.highFrequency.maxDailyTweets
  ) {
    recordRisk(
      'high_frequency_daily',
      msg.highFreqDailyBadge(Math.round(author.dailyTweetRate))
    );
  }

  // 4. Account quality risks
  if (
    config.rules.accountQuality.enabled &&
    config.rules.accountQuality.minAccountAgeDays > 0 &&
    author.accountAgeDays > 0 &&
    author.accountAgeDays < config.rules.accountQuality.minAccountAgeDays &&
    author.followersCount < 500
  ) {
    recordRisk(
      'account_quality',
      msg.youngAccountBadge(Math.max(1, Math.floor(author.accountAgeDays)))
    );
  }

  if (
    config.rules.accountQuality.enabled &&
    author.followersCount < 1000 &&
    author.friendsCount >=
      config.rules.accountQuality.minFollowingForRatioCheck &&
    author.followRatio > config.rules.accountQuality.maxFollowRatio
  ) {
    recordRisk(
      'account_quality',
      msg.followRatioBadge(author.friendsCount, author.followersCount)
    );
  }

  return { riskBadges, primaryReason, primaryRuleId, hasCrowdBadge };
}

function resolveSceneModeKey(tweet: ExtractedTweet): SceneModeKey | undefined {
  if (tweet.scene === 'reply') return 'reply';
  if (tweet.scene === 'search') return 'search';
  if (tweet.scene === 'timeline') {
    if (tweet.timelineFeed === 'for_you' || tweet.timelineFeed === 'following') {
      return tweet.timelineFeed;
    }
  }
  return undefined;
}

/**
 * Evaluates a single tweet against all active rules in FilterConfig.
 */
export function evaluateTweet(
  tweet: ExtractedTweet,
  config: FilterConfig,
  crowdSnapshot?: CrowdBlockSnapshot | null,
  windowTracker?: SlidingWindowTracker,
  recordObservation = true,
  duplicateTracker?: ThreadDuplicateTracker
): InterceptionDecision {
  if (!config.enabled) {
    return { blocked: false, action: 'allow', riskBadges: [] };
  }

  const locale = resolveLocale(config.locale);
  const msg = getEngineMessages(locale);
  const reasonLabels = getBlockReasonLabels(locale);
  const { author } = tweet;

  const sceneKey = resolveSceneModeKey(tweet);
  const sceneOverride: SceneModeOverride = sceneKey
    ? (getOwnValue(config.sceneModes, sceneKey) ?? 'inherit')
    : 'inherit';
  const effectiveAction: InterceptionMode =
    sceneOverride === 'collapse' || sceneOverride === 'strip'
      ? sceneOverride
      : config.interceptionMode;

  // 0. Always strip Promoted Ads silently (never leave collapsed ad placeholders; always enforced even on scene bypass)
  if (tweet.isPromoted && config.rules.hidePromotedAds.enabled) {
    return {
      blocked: true,
      action: 'strip',
      ruleId: 'promoted_ad',
      reasonText: msg.promotedAdReason,
      riskBadges: [msg.promotedAdBadge],
      matchedTarget: { kind: 'rule', id: 'hidePromotedAds' },
    };
  }

  // 1. Explicit Whitelist overrides all rules
  if (author.restId && getOwnValue(config.whitelistUids, author.restId)) {
    return { blocked: false, action: 'allow', riskBadges: [] };
  }

  // 2. Explicit Local Blocklist overrides "exemptFollowing" and scene bypass (checks author, retweetedAuthor, and quotedAuthor)
  const localCandidates = [author, tweet.retweetedAuthor, tweet.quotedAuthor];
  const blockedLocalTarget = localCandidates.find(
    (u) =>
      u?.restId &&
      (u === author || !getOwnValue(config.whitelistUids, u.restId)) &&
      Boolean(getOwnValue(config.localBlocklistUids, u.restId))
  );

  if (blockedLocalTarget) {
    const entry = getOwnValue(
      config.localBlocklistUids,
      blockedLocalTarget.restId
    )!;
    const tagLabel = entry.tag
      ? getOwnValue(reasonLabels, entry.tag)
      : undefined;
    const reasonText = msg.localBlockReason(tagLabel);
    const evidence: RuleEvidence[] = [
      {
        key: 'hit_uid',
        label: msg.evidence.matchedUid,
        value: blockedLocalTarget.restId,
      },
    ];
    const matchedTarget: MatchedTarget = {
      kind: 'rule',
      id: 'local_blocklist',
    };
    if (tweet.scene === 'profile' && config.profileSceneBadgeOnly) {
      return {
        blocked: false,
        action: 'badge_only',
        ruleId: 'local_blocklist',
        reasonText,
        riskBadges: [reasonText],
        evidence,
        matchedTarget,
      };
    }
    return {
      blocked: true,
      action: effectiveAction,
      ruleId: 'local_blocklist',
      reasonText,
      riskBadges: [reasonText],
      evidence,
      matchedTarget,
    };
  }

  // Scene bypass: skips all automatic, keyword, domain, cloud, pack, and Grok rules while respecting Rules 0–2
  if (sceneOverride === 'bypass') {
    return { blocked: false, action: 'allow', riskBadges: [] };
  }

  const isFollowedAuthor = Boolean(config.exemptFollowing && author.following);
  const isFocalThreadAuthor = Boolean(
    tweet.focalAuthor?.restId && author.restId === tweet.focalAuthor.restId
  );
  const isReplyContext = tweet.scene === 'reply' || tweet.isReply;
  const isOfficialGrok = isOfficialGrokAuthor(author);
  const grokProtected = isProtectedOfficialGrok(author, config);

  const includeCustomRt = Boolean(
    tweet.retweetedAuthor &&
      (!tweet.retweetedAuthor.restId ||
        !getOwnValue(config.whitelistUids, tweet.retweetedAuthor.restId))
  );
  const includeCustomQt = Boolean(
    tweet.quotedAuthor &&
      (!tweet.quotedAuthor.restId ||
        !getOwnValue(config.whitelistUids, tweet.quotedAuthor.restId))
  );
  const includeAutoRt = Boolean(
    includeCustomRt &&
      !(config.exemptFollowing && tweet.retweetedAuthor?.following)
  );
  const includeAutoQt = Boolean(
    includeCustomQt &&
      !(config.exemptFollowing && tweet.quotedAuthor?.following)
  );

  const secondaryCandidates: ExtractedAuthor[] = [];
  if (includeAutoRt && tweet.retweetedAuthor?.restId) {
    secondaryCandidates.push(tweet.retweetedAuthor);
  }
  if (includeAutoQt && tweet.quotedAuthor?.restId) {
    secondaryCandidates.push(tweet.quotedAuthor);
  }

  const matchCtx = new TweetMatchContext(tweet);

  const profileEval = isFollowedAuthor
    ? { riskBadges: [] as string[] }
    : evaluateAuthorProfile(author, config, crowdSnapshot);
  const riskBadges = [...profileEval.riskBadges];

  let triggeredRuleId: TriggeredRuleId | undefined;
  let reasonText: string | undefined;
  let evidence: RuleEvidence[] = [];
  let matchedTarget: MatchedTarget | undefined;

  const trigger = (
    ruleId: TriggeredRuleId,
    reason: string,
    values?: RuleEvidence[],
    target?: MatchedTarget
  ) => {
    if (!triggeredRuleId) {
      triggeredRuleId = ruleId;
      reasonText = reason;
      evidence = values ?? [{ label: msg.evidence.matchedReason, value: reason }];
      matchedTarget = target ?? {
        kind: 'rule',
        id: getOwnValue(DEFAULT_RULE_TARGET_ID, ruleId) ?? ruleId,
      };
    }
    if (!riskBadges.includes(reason)) {
      riskBadges.push(reason);
    }
  };

  // Rule G0: Opt-in Hide Official @grok Replies (overrides protectOfficialGrok in reply context)
  if (
    !triggeredRuleId &&
    config.rules.grokFilter?.enabled &&
    config.rules.grokFilter.hideGrokReplies &&
    isOfficialGrok &&
    isReplyContext &&
    !isFocalThreadAuthor
  ) {
    trigger('grok_filter', msg.grokHiddenReplyReason, undefined, {
      kind: 'rule',
      id: 'grokFilter',
    });
  }

  // Rule A: Crowd-sourced Blocklist (penetrates unfollowed retweeted/quoted authors even when retweeter is followed)
  if (!triggeredRuleId && config.rules.crowdBlock.enabled) {
    const candidates = isFollowedAuthor
      ? secondaryCandidates
      : [author, ...secondaryCandidates];
    for (const cand of candidates) {
      if (!cand.restId) continue;
      const crowdEntry = getOwnValue(crowdSnapshot?.counts, cand.restId);
      if (crowdEntry && crowdEntry.c > 0) {
        const isHighFollower =
          crowdEntry.p === true ||
          cand.followersCount >= HIGH_FOLLOWER_PROTECT_THRESHOLD;
        const requiredCount = isHighFollower
          ? config.rules.crowdBlock.minBlockCount *
            HIGH_FOLLOWER_VOTE_MULTIPLIER
          : config.rules.crowdBlock.minBlockCount;

        if (crowdEntry.c >= requiredCount) {
          const tagLabel = crowdEntry.t
            ? getOwnValue(reasonLabels, crowdEntry.t)
            : undefined;
          trigger('crowd_block', msg.crowdReason(crowdEntry.c, tagLabel), [
            {
              key: 'hit_uid',
              label: msg.evidence.matchedUid,
              value: cand.restId,
            },
            { label: msg.evidence.crowdCount, value: crowdEntry.c },
            { label: msg.evidence.effectiveThreshold, value: requiredCount },
            {
              label: msg.evidence.highFollowerProtect,
              value: isHighFollower
                ? msg.evidence.highFollowerEnabled
                : msg.evidence.highFollowerNotTriggered,
            },
          ]);
          break;
        }
      }
    }
  }

  // Rule B: High-Frequency Posting (Historical daily avg + Timeline/Search sliding window)
  if (
    !triggeredRuleId &&
    !isFollowedAuthor &&
    !grokProtected &&
    config.rules.highFrequency.enabled
  ) {
    if (
      !isFocalThreadAuthor &&
      author.statusesCount >= 30 &&
      author.dailyTweetRate > config.rules.highFrequency.maxDailyTweets
    ) {
      trigger(
        'high_frequency_daily',
        msg.highFreqDailyReason(
          Math.round(author.dailyTweetRate),
          config.rules.highFrequency.maxDailyTweets
        ),
        [
          {
            label: msg.evidence.dailyRate,
            value: Math.round(author.dailyTweetRate * 10) / 10,
          },
          {
            label: msg.evidence.dailyMax,
            value: config.rules.highFrequency.maxDailyTweets,
          },
          { label: msg.evidence.totalTweets, value: author.statusesCount },
        ]
      );
    } else if (
      config.rules.highFrequency.slidingWindowEnabled &&
      windowTracker &&
      (tweet.scene === 'timeline' || tweet.scene === 'search') &&
      author.restId &&
      tweet.tweetId
    ) {
      const seenCount = recordObservation
        ? windowTracker.recordAndCount(
            author.restId,
            tweet.tweetId,
            config.rules.highFrequency.slidingWindowHours
          )
        : windowTracker.count(
            author.restId,
            config.rules.highFrequency.slidingWindowHours
          );
      if (seenCount > config.rules.highFrequency.slidingWindowMaxTweets) {
        trigger(
          'high_frequency_window',
          msg.highFreqWindowReason(
            config.rules.highFrequency.slidingWindowHours,
            seenCount
          ),
          [
            {
              label: msg.evidence.windowHours,
              value: config.rules.highFrequency.slidingWindowHours,
            },
            { label: msg.evidence.windowSeen, value: seenCount },
            {
              label: msg.evidence.windowMax,
              value: config.rules.highFrequency.slidingWindowMaxTweets,
            },
          ]
        );
      }
    }
  }

  // Rule C: Multi-scope Keywords & Regex
  // 1) User's explicit custom keywords ALWAYS apply (even to followed authors, unless exempted by follower count)
  if (
    !triggeredRuleId &&
    config.rules.keywords.enabled &&
    Array.isArray(config.rules.keywords.items) &&
    config.rules.keywords.items.length > 0
  ) {
    const userHit = matchKeywordList(config.rules.keywords.items, matchCtx, {
      includePrimary: true,
      includeRt: includeCustomRt,
      includeQt: includeCustomQt,
    });
    if (userHit) {
      const displayPattern =
        userHit.item.pattern.length > 18
          ? `${userHit.item.pattern.slice(0, 18)}…`
          : userHit.item.pattern;
      const scopeLabel =
        getOwnValue(msg.scopes, userHit.matchedScope) ?? msg.scopes.text;
      const secondaryHit =
        userHit.matchedAuthor.restId &&
        userHit.matchedAuthor.restId !== author.restId
          ? userHit.matchedAuthor
          : undefined;
      trigger(
        'keyword',
        msg.keywordReason(scopeLabel, displayPattern),
        secondaryHit
          ? [
              {
                key: 'hit_uid',
                label: msg.evidence.matchedUid,
                value: secondaryHit.restId,
              },
              { label: msg.evidence.matchedScope, value: scopeLabel },
            ]
          : undefined,
        { kind: 'keyword', id: userHit.item.id }
      );
    }
  }

  // 1.5) Structured External Domain Filter (user's explicit domain rules always apply, with RT/QT & bio URL penetration)
  if (
    !triggeredRuleId &&
    config.rules.domainFilter?.enabled &&
    Array.isArray(config.rules.domainFilter.items) &&
    config.rules.domainFilter.items.length > 0
  ) {
    const domainHit = matchDomainList(
      config.rules.domainFilter.items,
      matchCtx,
      {
        includePrimary: true,
        includeRt: includeCustomRt,
        includeQt: includeCustomQt,
      }
    );
    if (domainHit) {
      const scopeLabel =
        getOwnValue(msg.scopes, domainHit.matchedScope) ?? msg.scopes.url;
      const secondaryHit =
        domainHit.matchedAuthor.restId &&
        domainHit.matchedAuthor.restId !== author.restId
          ? domainHit.matchedAuthor
          : undefined;
      const domainEvidence: RuleEvidence[] = [
        ...(secondaryHit
          ? [
              {
                key: 'hit_uid',
                label: msg.evidence.matchedUid,
                value: secondaryHit.restId,
              },
            ]
          : []),
        { label: msg.evidence.matchedDomain, value: domainHit.ruleDomain },
        { label: msg.evidence.matchedHost, value: domainHit.matchedHost },
      ];
      trigger(
        'domain_filter',
        msg.domainFilterReason(scopeLabel, domainHit.ruleDomain),
        domainEvidence,
        { kind: 'domain', id: domainHit.item.id }
      );
    }
  }

  // 2) Engagement Bait & Comment-Keyword Giveaways (checked before public keyword packs so dedicated rule attribution stays accurate)
  if (!triggeredRuleId && config.rules.engagementBait.enabled) {
    const { blockCommentGiveaway, blockFollowBack } =
      config.rules.engagementBait;
    const isSeparatedRetweet = Boolean(
      tweet.retweetedAuthor && tweet.retweetedText !== undefined
    );
    let matchedBaitReason: string | undefined;
    let matchedBaitHitUid: string | undefined;

    if (
      !isSeparatedRetweet &&
      !isFollowedAuthor &&
      author.followersCount < 100_000
    ) {
      let primaryBaitText = tweet.text;
      if (!tweet.retweetedAuthor && tweet.retweetedText) {
        primaryBaitText = `${primaryBaitText}\n${tweet.retweetedText}`;
      }
      if (!tweet.quotedAuthor && tweet.quotedText) {
        primaryBaitText = `${primaryBaitText}\n${tweet.quotedText}`;
      }
      if (primaryBaitText) {
        matchedBaitReason = matchEngagementBaitReason(
          primaryBaitText,
          blockCommentGiveaway,
          blockFollowBack,
          msg
        );
      }
    }
    if (
      !matchedBaitReason &&
      tweet.retweetedText &&
      includeAutoRt &&
      (tweet.retweetedAuthor?.followersCount ?? 0) < 100_000
    ) {
      matchedBaitReason = matchEngagementBaitReason(
        tweet.retweetedText,
        blockCommentGiveaway,
        blockFollowBack,
        msg
      );
      if (matchedBaitReason) {
        const rtUid = tweet.retweetedAuthor?.restId;
        matchedBaitHitUid = rtUid && rtUid !== author.restId ? rtUid : undefined;
      }
    }
    if (
      !matchedBaitReason &&
      tweet.quotedText &&
      includeAutoQt &&
      (tweet.quotedAuthor?.followersCount ?? 0) < 100_000
    ) {
      matchedBaitReason = matchEngagementBaitReason(
        tweet.quotedText,
        blockCommentGiveaway,
        blockFollowBack,
        msg
      );
      if (matchedBaitReason) {
        const qtUid = tweet.quotedAuthor?.restId;
        matchedBaitHitUid = qtUid && qtUid !== author.restId ? qtUid : undefined;
      }
    }
    if (matchedBaitReason) {
      const baitEvidence: RuleEvidence[] | undefined = matchedBaitHitUid
        ? [
            {
              key: 'hit_uid',
              label: msg.evidence.matchedUid,
              value: matchedBaitHitUid,
            },
            {
              label: msg.evidence.matchedReason,
              value: matchedBaitReason,
            },
          ]
        : undefined;
      trigger('engagement_bait', matchedBaitReason, baitEvidence);
    }
  }

  const hasAutoTargets = !isFollowedAuthor || includeAutoRt || includeAutoQt;

  // 2.5) Installed Offline Shareable Rule Packs (respects whitelistUids & exemptFollowing consistently across primary & RT/QT)
  if (
    !triggeredRuleId &&
    Array.isArray(config.installedPacks) &&
    config.installedPacks.length > 0 &&
    hasAutoTargets
  ) {
    const packAccountCandidates = isFollowedAuthor
      ? secondaryCandidates
      : [author, ...secondaryCandidates];

    for (let pIdx = 0; pIdx < config.installedPacks.length; pIdx++) {
      const pack = config.installedPacks[pIdx]!;
      if (!pack.enabled) continue;
      const disabledSet = getCachedStringSet(pack.disabledItemIds);

      // 2.5a) Pack blockedUids (mutation-safe O(1) lookup via WeakMap)
      if (Array.isArray(pack.blockedUids) && pack.blockedUids.length > 0) {
        const uidMap = getPackBlockedUidMap(pack.blockedUids);
        for (let c = 0; c < packAccountCandidates.length; c++) {
          const cand = packAccountCandidates[c]!;
          if (!cand.restId) continue;
          const entry = uidMap.get(cand.restId);
          if (entry && !disabledSet?.has(entry.uid)) {
            trigger(
              'rule_pack',
              msg.rulePackAccountReason(pack.name),
              [
                {
                  key: 'hit_uid',
                  label: msg.evidence.matchedUid,
                  value: cand.restId,
                },
                { label: msg.evidence.rulePack, value: pack.name },
              ],
              { kind: 'pack_item', id: entry.uid, packId: pack.id }
            );
            break;
          }
        }
        if (triggeredRuleId) break;
      }

      // 2.5b) Pack domains
      if (Array.isArray(pack.domains) && pack.domains.length > 0) {
        const packDomainHit = matchDomainList(pack.domains, matchCtx, {
          includePrimary: !isFollowedAuthor,
          includeRt: includeAutoRt,
          includeQt: includeAutoQt,
          disabledIds: disabledSet,
        });
        if (packDomainHit) {
          const scopeLabel =
            getOwnValue(msg.scopes, packDomainHit.matchedScope) ??
            msg.scopes.url;
          const secondaryHit =
            packDomainHit.matchedAuthor.restId &&
            packDomainHit.matchedAuthor.restId !== author.restId
              ? packDomainHit.matchedAuthor
              : undefined;
          trigger(
            'rule_pack',
            msg.rulePackDomainReason(
              pack.name,
              scopeLabel,
              packDomainHit.ruleDomain
            ),
            [
              ...(secondaryHit
                ? [
                    {
                      key: 'hit_uid',
                      label: msg.evidence.matchedUid,
                      value: secondaryHit.restId,
                    },
                  ]
                : []),
              { label: msg.evidence.rulePack, value: pack.name },
              {
                label: msg.evidence.matchedDomain,
                value: packDomainHit.ruleDomain,
              },
              {
                label: msg.evidence.matchedHost,
                value: packDomainHit.matchedHost,
              },
            ],
            { kind: 'pack_item', id: packDomainHit.item.id, packId: pack.id }
          );
          break;
        }
      }

      // 2.5c) Pack keywords
      if (Array.isArray(pack.keywords) && pack.keywords.length > 0) {
        const packKwHit = matchKeywordList(pack.keywords, matchCtx, {
          includePrimary: !isFollowedAuthor,
          includeRt: includeAutoRt,
          includeQt: includeAutoQt,
          disabledIds: disabledSet,
        });
        if (packKwHit) {
          const displayPattern =
            packKwHit.item.pattern.length > 18
              ? `${packKwHit.item.pattern.slice(0, 18)}…`
              : packKwHit.item.pattern;
          const scopeLabel =
            getOwnValue(msg.scopes, packKwHit.matchedScope) ?? msg.scopes.text;
          const secondaryHit =
            packKwHit.matchedAuthor.restId &&
            packKwHit.matchedAuthor.restId !== author.restId
              ? packKwHit.matchedAuthor
              : undefined;
          trigger(
            'rule_pack',
            msg.rulePackKeywordReason(pack.name, scopeLabel, displayPattern),
            [
              ...(secondaryHit
                ? [
                    {
                      key: 'hit_uid',
                      label: msg.evidence.matchedUid,
                      value: secondaryHit.restId,
                    },
                  ]
                : []),
              { label: msg.evidence.rulePack, value: pack.name },
              { label: msg.evidence.matchedScope, value: scopeLabel },
            ],
            { kind: 'pack_item', id: packKwHit.item.id, packId: pack.id }
          );
          break;
        }
      }
    }
  }

  // 3) Official Public Keyword Packs (filtered by enabled language packs & disabledCloudKeywordIds)
  if (!triggeredRuleId && config.enableCloudKeywords && hasAutoTargets) {
    const enabledLangGroups = getEnabledCloudLangGroupSet(config, locale);
    if (enabledLangGroups.size > 0) {
      const mergedCloudList = getMergedCloudKeywords(
        crowdSnapshot?.cloudKeywords
      );
      const disabledCloudIds = getCachedStringSet(
        config.disabledCloudKeywordIds
      );
      const cloudHit = matchKeywordList(mergedCloudList, matchCtx, {
        includePrimary: !isFollowedAuthor,
        includeRt: includeAutoRt,
        includeQt: includeAutoQt,
        disabledIds: disabledCloudIds,
        enabledLangGroups,
      });
      if (cloudHit) {
        const secondaryHit =
          cloudHit.matchedAuthor.restId &&
          cloudHit.matchedAuthor.restId !== author.restId
            ? cloudHit.matchedAuthor
            : undefined;
        const scopeLabel =
          getOwnValue(msg.scopes, cloudHit.matchedScope) ?? msg.scopes.text;
        const packLabel = getCloudKeywordNote(cloudHit.item, locale);
        trigger(
          'cloud_keyword',
          msg.cloudKeywordReason(scopeLabel, packLabel),
          secondaryHit
            ? [
                {
                  key: 'hit_uid',
                  label: msg.evidence.matchedUid,
                  value: secondaryHit.restId,
                },
                { label: msg.evidence.matchedScope, value: scopeLabel },
              ]
            : undefined,
          { kind: 'cloud_keyword', id: cloudHit.item.id }
        );
      }
    }
  }

  // Rule D0: Short @grok Summon Replies (evaluated BEFORE replySpam so attribution stays 'grok_filter')
  if (
    !triggeredRuleId &&
    !isFollowedAuthor &&
    !isFocalThreadAuthor &&
    !isOfficialGrok &&
    isReplyContext &&
    config.rules.grokFilter?.enabled &&
    config.rules.grokFilter.blockShortMentions
  ) {
    const textWithoutUrls = tweet.text.replace(/https?:\/\/\S+/gi, ' ');
    if (GROK_MENTION_RE.test(textWithoutUrls)) {
      const cleaned = stripMentionsAndUrls(tweet.text)
        .replace(STRIP_GROK_MENTION_RE, '$1 ')
        .trim();
      const weightedLen = computeWeightedTextLength(cleaned);
      const maxLen =
        config.rules.grokFilter.maxMentionWeightedLength ??
        DEFAULT_GROK_MAX_MENTION_WEIGHTED_LENGTH;
      if (weightedLen <= maxLen) {
        trigger(
          'grok_filter',
          msg.grokShortMentionReason,
          [
            { label: msg.evidence.weightedLength, value: weightedLen },
            { label: msg.evidence.maxThreshold, value: maxLen },
          ],
          { kind: 'rule', id: 'grokFilter' }
        );
      }
    }
  }

  // Rule D: Behavior-based Reply Spam & Impersonator Detection
  if (
    !triggeredRuleId &&
    !isFollowedAuthor &&
    !isFocalThreadAuthor &&
    !grokProtected &&
    isReplyContext &&
    config.rules.replySpam.enabled
  ) {
    const r = config.rules.replySpam;
    const cleanedReply = stripMentionsAndUrls(tweet.text);

    if (
      r.detectImpersonation &&
      tweet.focalAuthor &&
      isLikelyImpersonator(author, tweet.focalAuthor)
    ) {
      trigger(
        'impersonation',
        msg.impersonationReason(tweet.focalAuthor.screenName),
        [
          {
            label: msg.evidence.focalAuthor,
            value: `${tweet.focalAuthor.name} (@${tweet.focalAuthor.screenName})`,
          },
          { label: msg.evidence.authorFollowers, value: author.followersCount },
        ]
      );
    } else if (
      r.blockBioLinkSpam &&
      author.followersCount < r.bioLinkMaxFollowers &&
      FUNNEL_BIO_LINK_RE.test(`${author.bio} ${author.bioUrls.join(' ')}`)
    ) {
      trigger('reply_spam', msg.replyBioLinkReason, [
        { label: msg.evidence.followers, value: author.followersCount },
        { label: msg.evidence.bioLinkThreshold, value: r.bioLinkMaxFollowers },
      ]);
    } else if (
      r.blockPureMediaReplies &&
      cleanedReply.length === 0 &&
      Boolean(tweet.hasMedia) &&
      tweet.urls.length === 0 &&
      author.followersCount < 2000
    ) {
      trigger('reply_spam', msg.replyPureMediaReason);
    }

    if (
      !triggeredRuleId &&
      tweet.scene === 'reply' &&
      Boolean(r.blockDuplicateReplies) &&
      duplicateTracker
    ) {
      const threadKey = tweet.focalTweetId || tweet.inReplyToTweetId;
      if (threadKey) {
        const dedup = normalizeReplyForDedup(tweet.text);
        if (
          dedup.weightedLength >= MIN_DUPLICATE_REPLY_WEIGHTED_LENGTH &&
          dedup.normalized
        ) {
          const isDup = recordObservation
            ? duplicateTracker.recordAndCheck(
                threadKey,
                tweet.tweetId,
                author.restId,
                dedup.normalized
              )
            : duplicateTracker.isDuplicate(
                threadKey,
                tweet.tweetId,
                author.restId,
                dedup.normalized
              );
          if (isDup) {
            const dupCount = Math.max(
              2,
              duplicateTracker.getDuplicateCount(threadKey, dedup.normalized)
            );
            trigger('reply_spam', msg.replyDuplicateReason, [
              { label: msg.evidence.duplicateCount, value: dupCount },
              {
                label: msg.evidence.weightedLength,
                value: dedup.weightedLength,
              },
            ]);
          }
        }
      }
    }

    if (!triggeredRuleId && r.blockShortOrEmoji && cleanedReply.length > 0) {
      if (isPureEmojiOrSymbol(cleanedReply) && author.followersCount < 10_000) {
        trigger('reply_spam', msg.replyEmojiReason);
      } else if (author.followersCount < 5000) {
        const weightedLen = computeWeightedTextLength(cleanedReply);
        if (
          weightedLen < r.minWeightedLength ||
          LOW_EFFORT_REPLY_RE.test(cleanedReply)
        ) {
          trigger('reply_spam', msg.replyShortReason, [
            { label: msg.evidence.weightedLength, value: weightedLen },
            { label: msg.evidence.minThreshold, value: r.minWeightedLength },
          ]);
        }
      }
    }
  }

  // Rule F: Hashtag / Crypto Cashtag Spam
  const shouldEvalTagSpam = tweet.retweetedAuthor
    ? includeAutoRt
    : !isFollowedAuthor;
  if (!triggeredRuleId && shouldEvalTagSpam && config.rules.tagSpam.enabled) {
    const rtTarget = tweet.retweetedAuthor;
    const tagEvidence: RuleEvidence[] | undefined =
      rtTarget?.restId && rtTarget.restId !== author.restId
        ? [
            {
              key: 'hit_uid',
              label: msg.evidence.matchedUid,
              value: rtTarget.restId,
            },
          ]
        : undefined;
    if (tweet.hashtagCount > config.rules.tagSpam.maxHashtags) {
      trigger(
        'tag_spam',
        msg.hashtagSpamReason(tweet.hashtagCount),
        tagEvidence
      );
    } else if (tweet.cashtagCount > config.rules.tagSpam.maxCashtags) {
      trigger(
        'tag_spam',
        msg.cashtagSpamReason(tweet.cashtagCount),
        tagEvidence
      );
    }
  }

  // Rule G: Account Quality Thresholds
  if (
    !triggeredRuleId &&
    !isFollowedAuthor &&
    !isFocalThreadAuthor &&
    config.rules.accountQuality.enabled
  ) {
    const q = config.rules.accountQuality;
    if (
      q.minAccountAgeDays > 0 &&
      author.accountAgeDays > 0 &&
      author.accountAgeDays < q.minAccountAgeDays &&
      author.followersCount < 500
    ) {
      trigger(
        'account_quality',
        msg.youngAccountReason(Math.max(1, Math.floor(author.accountAgeDays)))
      );
    } else if (
      q.blockDefaultAvatarInReplies &&
      isReplyContext &&
      author.defaultProfileImage &&
      author.followersCount < 200
    ) {
      trigger('account_quality', msg.defaultAvatarReplyReason);
    } else if (
      author.followersCount < 1000 &&
      author.friendsCount >= q.minFollowingForRatioCheck &&
      author.followRatio > q.maxFollowRatio
    ) {
      trigger(
        'account_quality',
        msg.followRatioReason(author.friendsCount, author.followersCount)
      );
    }
  }

  // Rule H: Tweet Language Filter
  if (
    !triggeredRuleId &&
    !isFollowedAuthor &&
    !isFocalThreadAuthor &&
    config.rules.languageFilter.enabled &&
    config.rules.languageFilter.languages.length > 0
  ) {
    const lang = (tweet.lang ?? '').toLowerCase().trim();
    if (lang && !NON_LINGUISTIC_LANGS.has(lang)) {
      const selected = config.rules.languageFilter.languages;
      const langLabel = getTweetLanguageLabel(lang, locale);
      if (config.rules.languageFilter.mode === 'allow' && !selected.includes(lang)) {
        trigger('language_filter', msg.langAllowReason(langLabel));
      } else if (
        config.rules.languageFilter.mode === 'block' &&
        selected.includes(lang)
      ) {
        trigger('language_filter', msg.langBlockReason(langLabel));
      }
    }
  }

  if (!triggeredRuleId || !reasonText) {
    return {
      blocked: false,
      action: 'allow',
      riskBadges,
    };
  }

  // Smart Profile Scene Exemption: when visiting someone's profile page, only show risk badge instead of hiding their tweets
  if (tweet.scene === 'profile' && config.profileSceneBadgeOnly) {
    return {
      blocked: false,
      action: 'badge_only',
      ruleId: triggeredRuleId,
      reasonText,
      riskBadges,
      evidence,
      matchedTarget,
    };
  }

  return {
    blocked: true,
    action: effectiveAction,
    ruleId: triggeredRuleId,
    reasonText,
    riskBadges,
    evidence,
    matchedTarget,
  };
}
