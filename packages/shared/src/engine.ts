import {
  HIGH_FOLLOWER_PROTECT_THRESHOLD,
  HIGH_FOLLOWER_VOTE_MULTIPLIER,
} from './constants';
import { DEFAULT_CLOUD_KEYWORDS } from './presets';
import {
  BLOCK_REASON_LABELS,
  type CrowdBlockSnapshot,
  type ExtractedAuthor,
  type ExtractedTweet,
  type FilterConfig,
  type InterceptionDecision,
  type KeywordRuleItem,
  type RuleEvidence,
  type TriggeredRuleId,
} from './types';

const regexCache = new Map<string, RegExp | null>();

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

    // Periodically prune map if too many authors tracked
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

const SCOPE_LABELS: Record<string, string> = {
  text: '正文',
  bio: '简介',
  name: '昵称',
  url: '链接',
};

function matchKeywordList(
  items: KeywordRuleItem[],
  tweet: ExtractedTweet
): { item: KeywordRuleItem; matchedScope: string } | null {
  const { author, retweetedAuthor } = tweet;
  const fullText = tweet.quotedText
    ? `${tweet.text}\n${tweet.quotedText}`
    : tweet.text;
  const fullBio = retweetedAuthor
    ? `${author.bio}\n${retweetedAuthor.bio}`
    : author.bio;
  const fullName = retweetedAuthor
    ? `${author.name} @${author.screenName} ${retweetedAuthor.name} @${retweetedAuthor.screenName}`
    : `${author.name} @${author.screenName}`;
  const fullUrls = [
    ...tweet.urls,
    ...author.bioUrls,
    ...(retweetedAuthor?.bioUrls ?? []),
  ].join(' ');

  for (const item of items) {
    if (!item.enabled || !item.pattern.trim()) continue;
    if (
      item.maxFollowersExempt &&
      author.followersCount >= item.maxFollowersExempt &&
      (!retweetedAuthor ||
        retweetedAuthor.followersCount >= item.maxFollowersExempt)
    ) {
      continue;
    }

    const regex = getCompiledRegex(item.pattern.trim(), item.isRegex);
    if (!regex) continue;

    for (const scope of item.scopes) {
      let target = '';
      if (scope === 'text') target = fullText;
      else if (scope === 'bio') target = fullBio;
      else if (scope === 'name') target = fullName;
      else if (scope === 'url') target = fullUrls;

      if (target && regex.test(target)) {
        return { item, matchedScope: SCOPE_LABELS[scope] ?? scope };
      }
    }
  }
  return null;
}

/**
 * Strips leading @mentions, URLs, and whitespace from a tweet to inspect its actual substantive reply text.
 */
export function stripMentionsAndUrls(rawText: string): string {
  return rawText
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/(^|\s)@[a-zA-Z0-9_]+/g, ' ')
    .trim();
}

/**
 * Checks whether a string consists strictly of emojis, symbols, or punctuation with no letters/CJK/numbers.
 */
export function isPureEmojiOrSymbol(cleanedText: string): boolean {
  if (!cleanedText) return true;
  // Check if there is at least one letter (Latin, CJK, Kana, Cyrillic, etc.) or digit
  return !/[\p{L}\p{N}]/u.test(cleanedText);
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
} {
  const riskBadges: string[] = [];
  let primaryReason: string | undefined;
  let primaryRuleId: TriggeredRuleId | undefined;

  const recordRisk = (ruleId: TriggeredRuleId, badge: string) => {
    riskBadges.push(badge);
    if (!primaryReason) {
      primaryReason = badge;
      primaryRuleId = ruleId;
    }
  };

  if (!config.enabled || config.whitelistUids[author.restId]) {
    return { riskBadges: [] };
  }

  // 1. Local blocklist
  if (config.localBlocklistUids[author.restId]) {
    const entry = config.localBlocklistUids[author.restId];
    const tagLabel = entry.tag ? ` [${BLOCK_REASON_LABELS[entry.tag]}]` : '';
    recordRisk('local_blocklist', `本地已拉黑${tagLabel}`);
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
    const tagStr = crowdEntry.t ? `·${BLOCK_REASON_LABELS[crowdEntry.t]}` : '';
    if (crowdEntry.c >= minRequired) {
      recordRisk('crowd_block', `社区快照记录 ${crowdEntry.c} 次${tagStr}`);
    } else if (crowdEntry.c >= 2) {
      riskBadges.push(`社区快照记录 ${crowdEntry.c} 次${tagStr}`);
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
      `历史日均 ${Math.round(author.dailyTweetRate)} 条`
    );
  }

  // 4. Account quality risks
  if (
    config.rules.accountQuality.enabled &&
    author.accountAgeDays > 0 &&
    author.accountAgeDays < config.rules.accountQuality.minAccountAgeDays &&
    author.followersCount < 500
  ) {
    recordRisk(
      'account_quality',
      `新注册小号 (${Math.max(1, Math.floor(author.accountAgeDays))}天)`
    );
  }

  if (
    config.rules.accountQuality.enabled &&
    author.friendsCount >=
      config.rules.accountQuality.minFollowingForRatioCheck &&
    author.followRatio > config.rules.accountQuality.maxFollowRatio
  ) {
    recordRisk(
      'account_quality',
      `关注比异常 (${author.friendsCount}关注/${author.followersCount}粉)`
    );
  }

  return { riskBadges, primaryReason, primaryRuleId };
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

  const { author } = tweet;

  // 0. Always check Promoted Ads first (even if author is followed/whitelisted, ads are ads)
  if (tweet.isPromoted && config.rules.hidePromotedAds.enabled) {
    return {
      blocked: true,
      action: config.interceptionMode,
      ruleId: 'promoted_ad',
      reasonText: '原生推广广告',
      riskBadges: ['推广广告'],
    };
  }

  // 1. Explicit Whitelist overrides all rules
  if (author.restId && config.whitelistUids[author.restId]) {
    return { blocked: false, action: 'allow', riskBadges: [] };
  }

  // 2. Explicit Local Blocklist overrides "exemptFollowing" (checks both author and retweetedAuthor)
  const blockedLocalTarget =
    (author.restId && config.localBlocklistUids[author.restId]) ||
    (tweet.retweetedAuthor?.restId &&
      !config.whitelistUids[tweet.retweetedAuthor.restId] &&
      config.localBlocklistUids[tweet.retweetedAuthor.restId]);

  if (blockedLocalTarget) {
    const tagLabel = blockedLocalTarget.tag
      ? ` (${BLOCK_REASON_LABELS[blockedLocalTarget.tag]})`
      : '';
    const reasonText = `本地黑名单${tagLabel}`;
    if (tweet.scene === 'profile' && config.profileSceneBadgeOnly) {
      return {
        blocked: false,
        action: 'badge_only',
        ruleId: 'local_blocklist',
        reasonText,
        riskBadges: [reasonText],
      };
    }
    return {
      blocked: true,
      action: config.interceptionMode,
      ruleId: 'local_blocklist',
      reasonText,
      riskBadges: [reasonText],
    };
  }

  // 3. Auto-exempt accounts the user already follows
  if (config.exemptFollowing && author.following) {
    return { blocked: false, action: 'allow', riskBadges: [] };
  }

  const profileEval = evaluateAuthorProfile(author, config, crowdSnapshot);
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
      evidence = values ?? [{ label: '命中时原因', value: reason }];
    }
    if (!riskBadges.includes(reason)) {
      riskBadges.push(reason);
    }
  };

  // Rule A: Crowd-sourced Blocklist (被超过 N 人拉黑 - checks both author and retweetedAuthor)
  if (config.rules.crowdBlock.enabled) {
    const candidates = [author];
    if (
      tweet.retweetedAuthor &&
      !config.whitelistUids[tweet.retweetedAuthor.restId]
    ) {
      candidates.push(tweet.retweetedAuthor);
    }
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
          const tagStr = crowdEntry.t
            ? ` [${BLOCK_REASON_LABELS[crowdEntry.t]}]`
            : '';
          trigger('crowd_block', `社区快照记录 ${crowdEntry.c} 次${tagStr}`, [
            { label: '命中账号 UID', value: cand.restId },
            { label: '快照记录数', value: crowdEntry.c },
            { label: '实际触发门槛', value: requiredCount },
            {
              label: '高粉保护',
              value: isHighFollower ? '启用（5 倍门槛）' : '未触发',
            },
          ]);
          break;
        }
      }
    }
  }

  // Rule B: High-Frequency Posting (高频发内容账号: 历史日均 + 短期滑动窗口)
  if (!triggeredRuleId && config.rules.highFrequency.enabled) {
    if (
      author.statusesCount >= 30 &&
      author.dailyTweetRate > config.rules.highFrequency.maxDailyTweets
    ) {
      trigger(
        'high_frequency_daily',
        `高频账号: 历史日均 ${Math.round(author.dailyTweetRate)} 条 (>${config.rules.highFrequency.maxDailyTweets})`,
        [
          {
            label: '历史日均',
            value: Math.round(author.dailyTweetRate * 10) / 10,
          },
          {
            label: '日均上限',
            value: config.rules.highFrequency.maxDailyTweets,
          },
          { label: '总推文数', value: author.statusesCount },
        ]
      );
    } else if (
      config.rules.highFrequency.slidingWindowEnabled &&
      windowTracker &&
      tweet.scene !== 'profile' &&
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
          `短期刷屏: ${config.rules.highFrequency.slidingWindowHours}h 内刷到 ${seenCount} 条`,
          [
            {
              label: '窗口小时数',
              value: config.rules.highFrequency.slidingWindowHours,
            },
            { label: '本浏览器观察数量', value: seenCount },
            {
              label: '窗口上限',
              value: config.rules.highFrequency.slidingWindowMaxTweets,
            },
          ]
        );
      }
    }
  }

  // Rule C: Multi-scope Keywords & Regex (User rules + Official Cloud Dictionary)
  if (!triggeredRuleId && config.rules.keywords.enabled) {
    const userHit = matchKeywordList(config.rules.keywords.items, tweet);
    if (userHit) {
      const displayPattern =
        userHit.item.pattern.length > 18
          ? `${userHit.item.pattern.slice(0, 18)}…`
          : userHit.item.pattern;
      trigger(
        'keyword',
        `${userHit.matchedScope}命中关键词「${displayPattern}」`
      );
    }
  }

  if (!triggeredRuleId && config.enableCloudKeywords) {
    const cloudList =
      crowdSnapshot?.cloudKeywords && crowdSnapshot.cloudKeywords.length > 0
        ? crowdSnapshot.cloudKeywords
        : DEFAULT_CLOUD_KEYWORDS;
    const cloudHit = matchKeywordList(cloudList, tweet);
    if (cloudHit) {
      trigger(
        'cloud_keyword',
        `${cloudHit.matchedScope}命中云端防垃圾规则 (${cloudHit.item.note ?? cloudHit.item.id})`
      );
    }
  }

  // Rule D: Blue-verified Reply Spammers (评论区蓝标水军)
  if (!triggeredRuleId && config.rules.blueReplySpam.enabled) {
    const isReplyContext = tweet.scene === 'reply' || tweet.isReply;
    const shouldCheckScene = config.rules.blueReplySpam.onlyInReplies
      ? isReplyContext
      : true;

    if (shouldCheckScene && author.isBlueVerified) {
      const cleanedReply = stripMentionsAndUrls(tweet.text);
      if (author.followersCount < config.rules.blueReplySpam.maxFollowers) {
        trigger(
          'blue_reply_spam',
          `蓝标低粉水军 (${author.followersCount} 粉 < ${config.rules.blueReplySpam.maxFollowers})`
        );
      } else if (
        config.rules.blueReplySpam.blockPureEmojiOrShort &&
        isReplyContext &&
        author.followersCount < config.rules.blueReplySpam.maxFollowers * 4 &&
        (isPureEmojiOrSymbol(cleanedReply) ||
          cleanedReply.length < config.rules.blueReplySpam.minReplyLength)
      ) {
        trigger(
          'blue_reply_spam',
          `评论区蓝标水评 (${isPureEmojiOrSymbol(cleanedReply) ? '纯表情/符号' : '极短灌水'})`
        );
      }
    }
  }

  // Rule E: Hashtag / Crypto Cashtag Spam
  if (!triggeredRuleId && config.rules.tagSpam.enabled) {
    if (tweet.hashtagCount > config.rules.tagSpam.maxHashtags) {
      trigger('tag_spam', `标签堆砌: 含 ${tweet.hashtagCount} 个 #Hashtag`);
    } else if (tweet.cashtagCount > config.rules.tagSpam.maxCashtags) {
      trigger('tag_spam', `币圈标签刷屏: 含 ${tweet.cashtagCount} 个 $Cashtag`);
    }
  }

  // Rule F: Account Quality Thresholds
  if (!triggeredRuleId && config.rules.accountQuality.enabled) {
    const isReplyContext = tweet.scene === 'reply' || tweet.isReply;
    if (
      author.accountAgeDays > 0 &&
      author.accountAgeDays < config.rules.accountQuality.minAccountAgeDays &&
      author.followersCount < 500
    ) {
      trigger(
        'account_quality',
        `新注册小号: 注册仅 ${Math.max(1, Math.floor(author.accountAgeDays))} 天`
      );
    } else if (
      config.rules.accountQuality.blockDefaultAvatarInReplies &&
      isReplyContext &&
      author.defaultProfileImage &&
      author.followersCount < 200
    ) {
      trigger('account_quality', '三无默认头像小号回复');
    } else if (
      author.friendsCount >=
        config.rules.accountQuality.minFollowingForRatioCheck &&
      author.followRatio > config.rules.accountQuality.maxFollowRatio
    ) {
      trigger(
        'account_quality',
        `关注/粉丝比畸形 (${author.friendsCount}关注 / ${author.followersCount}粉)`
      );
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
