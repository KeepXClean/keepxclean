import {
  HIGH_FOLLOWER_PROTECT_THRESHOLD,
  HIGH_FOLLOWER_VOTE_MULTIPLIER,
} from './constants';
import {
  getBlockReasonLabels,
  getCloudKeywordNote,
  getEngineMessages,
  getTweetLanguageLabel,
  resolveLocale,
} from './i18n';
import { mergeCloudKeywords } from './presets';
import {
  type CrowdBlockSnapshot,
  type ExtractedAuthor,
  type ExtractedTweet,
  type FilterConfig,
  type FocalTweetAuthor,
  type InterceptionDecision,
  type KeywordMatchScope,
  type KeywordRuleItem,
  type RuleEvidence,
  type TriggeredRuleId,
} from './types';

const regexCache = new Map<string, RegExp | null>();

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

const LOW_EFFORT_REPLY_RE =
  /^(?:this|so\s+true|true|agreed|facts|real|nice|great(?:\s+post)?|good\s+project|lfg|gm|gn|bullish|interesting|wow|amazing|100%|exact(?:ly)?|well\s+said|spot\s+on|沙发|顶|好贴|好文|太强了|牛逼|支持|码住|mark|插眼|同感|确实|学到了)[.!~?！？。，、\s\p{Extended_Pictographic}]*$/iu;

const FUNNEL_BIO_LINK_RE =
  /(?:t\.me\/|telegram\.me\/|wa\.me\/|whatsapp\.com\/|linktr\.ee\/|beacons\.ai\/|allmylinks\.com\/|solo\.to\/|lit\.link\/|onlyfans\.com|fansly\.com|mym\.fans|candfans|stripchat|chaturbate|line\.me\/ti\/)/i;

const COMMENT_GIVEAWAY_BAIT_RE =
  /(?:\b(?:comment|reply|drop)\s+["'“「『【]?[a-z0-9_+-]{1,15}["'”」』】]?\s+(?:and\s+|to\s+|&\s*)?(?:i['’]?ll|i\s+will|we['’]?ll)?\s*(?:send|dm|share)\b|\b(?:like\s*(?:&|and|\+)\s*(?:rt|retweet)|(?:rt|retweet)\s*(?:&|and|\+)\s*(?:follow|like|reply)).{0,45}\b(?:dm|send|giveaway|win|airdrop|free)\b|\bmust\s+be\s+following\s+(?:me\s+)?(?:so\s+i\s+can\s+dm|to\s+receive)\b|(?:评论区?|下方)?(?:回复|扣|留|打|评论)\s*[「『“"【]?\s*[a-z0-9\u4e00-\u9fa5]{1,10}\s*[」』”"】]?\s*(?:即可|免费|自动|我?发你|私信发|领取|送你|打包发)|(?:转赞评|转发\s*[+＋与和及]\s*关注|点赞\s*[+＋与和及]\s*转发).{0,25}(?:抽\s*\d+|送出?|瓜分|领\s*\d+|空投))/i;

const FOLLOW_BACK_BAIT_RE =
  /(?:互关互赞|互粉互赞|有粉必回|诚信互关|蓝标互关|万粉互关|\blet['’]?s\s+connect\b[\s\S]{0,45}\bdrop\s+your\s+(?:x\s+|twitter\s+)?(?:handle|profile|account)\b|\bfollow\s+everyone\s+who\s+(?:likes|retweets|replies)\b|\bif\s+you\s+have\s+under\s+\d+k?\s+followers.{0,45}connect\b)/i;

function getCompiledRegex(pattern: string, isRegex: boolean): RegExp | null {
  const key = `${isRegex ? 'R' : 'L'}:${pattern}`;
  if (regexCache.has(key)) {
    return regexCache.get(key) ?? null;
  }
  try {
    const escaped = isRegex
      ? pattern
      : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    if (regexCache.size > 500) {
      regexCache.clear();
    }
    regexCache.set(key, regex);
    return regex;
  } catch {
    regexCache.set(key, null);
    return null;
  }
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

function matchKeywordList(
  items: KeywordRuleItem[],
  tweet: ExtractedTweet,
  secondaryAuthorsOverride?: ExtractedAuthor[],
  whitelistUids?: Record<string, unknown>
): {
  item: KeywordRuleItem;
  matchedScope: KeywordMatchScope;
  matchedAuthor: ExtractedAuthor;
} | null {
  const { author, retweetedAuthor, quotedAuthor } = tweet;
  const isThirdPartyReplyContext =
    (tweet.scene === 'reply' || tweet.isReply) &&
    !(tweet.focalAuthor?.restId && author.restId === tweet.focalAuthor.restId);
  const secondaryOnly = Array.isArray(secondaryAuthorsOverride);
  const secondaryAuthors = secondaryOnly
    ? secondaryAuthorsOverride
    : ([retweetedAuthor, quotedAuthor].filter(
        (u): u is ExtractedAuthor =>
          Boolean(u && (!u.restId || !whitelistUids?.[u.restId]))
      ));

  if (secondaryOnly && secondaryAuthors.length === 0) {
    return null;
  }

  const candidates: Array<{
    author: ExtractedAuthor;
    targets: Record<KeywordMatchScope, string>;
  }> = [];

  if (!secondaryOnly) {
    candidates.push({
      author,
      targets: {
        text:
          secondaryAuthors.length === 0 && tweet.quotedText
            ? `${tweet.text}\n${tweet.quotedText}`
            : tweet.text,
        bio: author.bio,
        name: `${author.name} @${author.screenName}`,
        url: [...tweet.urls, ...author.bioUrls].join(' '),
      },
    });
  }

  for (const sec of secondaryAuthors) {
    candidates.push({
      author: sec,
      targets: {
        text: tweet.quotedText ?? '',
        bio: sec.bio,
        name: `${sec.name} @${sec.screenName}`,
        url: [
          ...(sec === retweetedAuthor ? tweet.urls : []),
          ...sec.bioUrls,
        ].join(' '),
      },
    });
  }

  for (const item of items) {
    if (!item.enabled || !item.pattern.trim()) continue;
    if (item.onlyInReplies && !isThirdPartyReplyContext) continue;

    const regex = getCompiledRegex(item.pattern.trim(), item.isRegex);
    if (!regex) continue;

    for (const cand of candidates) {
      if (
        item.maxFollowersExempt &&
        cand.author.followersCount >= item.maxFollowersExempt
      ) {
        continue;
      }
      for (const scope of item.scopes) {
        const target = cand.targets[scope];
        if (target && regex.test(target)) {
          return {
            item,
            matchedScope: scope,
            matchedAuthor: cand.author,
          };
        }
      }
    }
  }
  return null;
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
  return !/[\p{L}\p{N}]/u.test(cleanedText);
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
    if (
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(
        ch
      )
    ) {
      weight += 2;
    } else if (/[\p{L}\p{N}]/u.test(ch)) {
      weight += 1;
    }
  }
  return weight;
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

  if (!config.enabled || config.whitelistUids[author.restId]) {
    return { riskBadges: [], hasCrowdBadge: false };
  }

  const locale = resolveLocale(config.locale);
  const msg = getEngineMessages(locale);
  const reasonLabels = getBlockReasonLabels(locale);

  // 1. Local blocklist
  if (config.localBlocklistUids[author.restId]) {
    const entry = config.localBlocklistUids[author.restId];
    const tagLabel = entry.tag ? reasonLabels[entry.tag] : undefined;
    recordRisk('local_blocklist', msg.localBlockBadge(tagLabel));
  }

  // 2. Crowd-sourced block count
  const crowdEntry = crowdSnapshot?.counts?.[author.restId];
  if (config.rules.crowdBlock.enabled && crowdEntry && crowdEntry.c > 0) {
    const isHighFollower =
      crowdEntry.p === true ||
      author.followersCount >= HIGH_FOLLOWER_PROTECT_THRESHOLD;
    const minRequired = isHighFollower
      ? config.rules.crowdBlock.minBlockCount * HIGH_FOLLOWER_VOTE_MULTIPLIER
      : config.rules.crowdBlock.minBlockCount;
    const tagLabel = crowdEntry.t ? reasonLabels[crowdEntry.t] : undefined;
    if (crowdEntry.c >= minRequired) {
      hasCrowdBadge = true;
      recordRisk('crowd_block', msg.crowdBadge(crowdEntry.c, tagLabel));
    } else if (crowdEntry.c >= 2) {
      hasCrowdBadge = true;
      riskBadges.push(msg.crowdBadge(crowdEntry.c, tagLabel));
    }
  }

  // 3. High-frequency daily posting
  if (
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

/**
 * Evaluates a single tweet against all active rules in FilterConfig.
 */
export function evaluateTweet(
  tweet: ExtractedTweet,
  config: FilterConfig,
  crowdSnapshot?: CrowdBlockSnapshot | null,
  windowTracker?: SlidingWindowTracker,
  recordObservation = true
): InterceptionDecision {
  if (!config.enabled) {
    return { blocked: false, action: 'allow', riskBadges: [] };
  }

  const locale = resolveLocale(config.locale);
  const msg = getEngineMessages(locale);
  const reasonLabels = getBlockReasonLabels(locale);
  const { author } = tweet;

  // 0. Always strip Promoted Ads silently (never leave collapsed ad placeholders)
  if (tweet.isPromoted && config.rules.hidePromotedAds.enabled) {
    return {
      blocked: true,
      action: 'strip',
      ruleId: 'promoted_ad',
      reasonText: msg.promotedAdReason,
      riskBadges: [msg.promotedAdBadge],
    };
  }

  // 1. Explicit Whitelist overrides all rules
  if (author.restId && config.whitelistUids[author.restId]) {
    return { blocked: false, action: 'allow', riskBadges: [] };
  }

  // 2. Explicit Local Blocklist overrides "exemptFollowing" (checks author, retweetedAuthor, and quotedAuthor)
  const localCandidates = [author, tweet.retweetedAuthor, tweet.quotedAuthor];
  const blockedLocalTarget = localCandidates.find(
    (u) =>
      u?.restId &&
      (u === author || !config.whitelistUids[u.restId]) &&
      Boolean(config.localBlocklistUids[u.restId])
  );

  if (blockedLocalTarget) {
    const entry = config.localBlocklistUids[blockedLocalTarget.restId]!;
    const tagLabel = entry.tag ? reasonLabels[entry.tag] : undefined;
    const reasonText = msg.localBlockReason(tagLabel);
    const evidence: RuleEvidence[] = [
      {
        key: 'hit_uid',
        label: msg.evidence.matchedUid,
        value: blockedLocalTarget.restId,
      },
    ];
    if (tweet.scene === 'profile' && config.profileSceneBadgeOnly) {
      return {
        blocked: false,
        action: 'badge_only',
        ruleId: 'local_blocklist',
        reasonText,
        riskBadges: [reasonText],
        evidence,
      };
    }
    return {
      blocked: true,
      action: config.interceptionMode,
      ruleId: 'local_blocklist',
      reasonText,
      riskBadges: [reasonText],
      evidence,
    };
  }

  const isFollowedAuthor = Boolean(config.exemptFollowing && author.following);
  const isFocalThreadAuthor = Boolean(
    tweet.focalAuthor?.restId && author.restId === tweet.focalAuthor.restId
  );
  const secondaryCandidates = [
    tweet.retweetedAuthor,
    tweet.quotedAuthor,
  ].filter(
    (u): u is ExtractedAuthor =>
      Boolean(
        u?.restId &&
          !config.whitelistUids[u.restId] &&
          !(config.exemptFollowing && u.following)
      )
  );

  const profileEval = isFollowedAuthor
    ? { riskBadges: [] as string[] }
    : evaluateAuthorProfile(author, config, crowdSnapshot);
  const riskBadges = [...profileEval.riskBadges];

  let triggeredRuleId: TriggeredRuleId | undefined;
  let reasonText: string | undefined;
  let evidence: RuleEvidence[] = [];

  const trigger = (
    ruleId: TriggeredRuleId,
    reason: string,
    values?: RuleEvidence[]
  ) => {
    if (!triggeredRuleId) {
      triggeredRuleId = ruleId;
      reasonText = reason;
      evidence = values ?? [{ label: msg.evidence.matchedReason, value: reason }];
    }
    if (!riskBadges.includes(reason)) {
      riskBadges.push(reason);
    }
  };

  // Rule A: Crowd-sourced Blocklist (penetrates unfollowed retweeted/quoted authors even when retweeter is followed)
  if (config.rules.crowdBlock.enabled) {
    const candidates = isFollowedAuthor
      ? secondaryCandidates
      : [author, ...secondaryCandidates];
    for (const cand of candidates) {
      if (!cand.restId) continue;
      const crowdEntry = crowdSnapshot?.counts?.[cand.restId];
      if (crowdEntry && crowdEntry.c > 0) {
        const isHighFollower =
          crowdEntry.p === true ||
          cand.followersCount >= HIGH_FOLLOWER_PROTECT_THRESHOLD;
        const requiredCount = isHighFollower
          ? config.rules.crowdBlock.minBlockCount *
            HIGH_FOLLOWER_VOTE_MULTIPLIER
          : config.rules.crowdBlock.minBlockCount;

        if (crowdEntry.c >= requiredCount) {
          const tagLabel = crowdEntry.t ? reasonLabels[crowdEntry.t] : undefined;
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
  if (!triggeredRuleId && !isFollowedAuthor && config.rules.highFrequency.enabled) {
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
  if (!triggeredRuleId && config.rules.keywords.enabled) {
    const userHit = matchKeywordList(
      config.rules.keywords.items,
      tweet,
      undefined,
      config.whitelistUids
    );
    if (userHit) {
      const displayPattern =
        userHit.item.pattern.length > 18
          ? `${userHit.item.pattern.slice(0, 18)}…`
          : userHit.item.pattern;
      const scopeLabel = msg.scopes[userHit.matchedScope];
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
          : undefined
      );
    }
  }

  // 2) Engagement Bait & Comment-Keyword Giveaways (checked before public keyword packs so dedicated rule attribution stays accurate)
  if (
    !triggeredRuleId &&
    !isFollowedAuthor &&
    config.rules.engagementBait.enabled &&
    author.followersCount < 100_000
  ) {
    const combinedText = tweet.quotedText
      ? `${tweet.text}\n${tweet.quotedText}`
      : tweet.text;
    if (
      config.rules.engagementBait.blockCommentGiveaway &&
      COMMENT_GIVEAWAY_BAIT_RE.test(combinedText)
    ) {
      trigger('engagement_bait', msg.engagementGiveawayReason);
    } else if (
      config.rules.engagementBait.blockFollowBack &&
      FOLLOW_BACK_BAIT_RE.test(combinedText)
    ) {
      trigger('engagement_bait', msg.engagementFollowReason);
    }
  }

  // 3) Official Public Keyword Packs (checks full tweet for strangers, or secondary content when retweeter is followed)
  if (
    !triggeredRuleId &&
    config.enableCloudKeywords &&
    (!isFollowedAuthor || secondaryCandidates.length > 0)
  ) {
    const rawCloudList = mergeCloudKeywords(crowdSnapshot?.cloudKeywords);
    const disabledCloudIds =
      config.disabledCloudKeywordIds?.length > 0
        ? new Set(config.disabledCloudKeywordIds)
        : null;
    const cloudList = disabledCloudIds
      ? rawCloudList.filter((item) => !disabledCloudIds.has(item.id))
      : rawCloudList;
    const cloudHit = matchKeywordList(
      cloudList,
      tweet,
      isFollowedAuthor ? secondaryCandidates : undefined,
      config.whitelistUids
    );
    if (cloudHit) {
      const secondaryHit =
        cloudHit.matchedAuthor.restId &&
        cloudHit.matchedAuthor.restId !== author.restId
          ? cloudHit.matchedAuthor
          : undefined;
      const scopeLabel = msg.scopes[cloudHit.matchedScope];
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
          : undefined
      );
    }
  }

  // Rule D: Behavior-based Reply Spam & Impersonator Detection
  const isReplyContext = tweet.scene === 'reply' || tweet.isReply;
  if (
    !triggeredRuleId &&
    !isFollowedAuthor &&
    !isFocalThreadAuthor &&
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
    } else if (r.blockShortOrEmoji && cleanedReply.length > 0) {
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
  const unfollowedRetweetTarget =
    tweet.retweetedAuthor &&
    secondaryCandidates.includes(tweet.retweetedAuthor)
      ? tweet.retweetedAuthor
      : undefined;
  if (
    !triggeredRuleId &&
    (!isFollowedAuthor || Boolean(unfollowedRetweetTarget)) &&
    config.rules.tagSpam.enabled
  ) {
    const tagEvidence: RuleEvidence[] | undefined =
      isFollowedAuthor && unfollowedRetweetTarget
        ? [
            {
              key: 'hit_uid',
              label: msg.evidence.matchedUid,
              value: unfollowedRetweetTarget.restId,
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
    };
  }

  return {
    blocked: true,
    action: config.interceptionMode,
    ruleId: triggeredRuleId,
    reasonText,
    riskBadges,
    evidence,
  };
}
