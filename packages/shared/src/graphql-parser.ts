import {
  evaluateAuthorProfile,
  evaluateTweet,
  SlidingWindowTracker,
  ThreadDuplicateTracker,
} from './engine';
import type {
  CrowdBlockSnapshot,
  ExtractedAuthor,
  ExtractedTweet,
  FilterConfig,
  FocalTweetAuthor,
  InterceptionDecision,
  InterceptionLogEntry,
  TimelineFeed,
  TweetScene,
} from './types';

export const RESERVED_X_PATHS = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'bookmarks',
  'settings',
  'search',
  'i',
  'compose',
  'intent',
  'tos',
  'privacy',
  'jobs',
  'lists',
  'communities',
  'grok',
]);

/**
 * Determines the TweetScene from a GraphQL request URL and current page pathname.
 */
export function detectSceneFromUrl(
  graphqlUrl: string,
  pagePathname = '/'
): TweetScene {
  const pathPart = graphqlUrl.split(/[?#]/, 1)[0] ?? graphqlUrl;
  if (/TweetDetail/i.test(pathPart) || /\/status\/\d+/.test(pagePathname)) {
    return 'reply';
  }
  if (
    /SearchTimeline/i.test(pathPart) ||
    pagePathname.startsWith('/search')
  ) {
    return 'search';
  }
  const profileHandle = pagePathname
    .match(
      /^\/([a-zA-Z0-9_]{1,15})(?:\/(?:with_replies|media|highlights|likes))?\/?$/
    )?.[1]
    ?.toLowerCase();
  if (profileHandle && !RESERVED_X_PATHS.has(profileHandle)) {
    return 'profile';
  }
  if (/UserTweets|UserMedia/i.test(pathPart)) {
    return 'profile';
  }
  return 'timeline';
}

/**
 * Distinguishes Home "Following" (`HomeLatestTimeline`) vs "For You" (`HomeTimeline`) feeds.
 * Always tests `/HomeLatestTimeline/i` before `/HomeTimeline/i`.
 */
export function detectTimelineFeedFromUrl(
  graphqlUrl: string
): TimelineFeed | undefined {
  const pathPart = graphqlUrl.split(/[?#]/, 1)[0] ?? graphqlUrl;
  if (/HomeLatestTimeline/i.test(pathPart)) {
    return 'following';
  }
  if (/HomeTimeline/i.test(pathPart)) {
    return 'for_you';
  }
  return undefined;
}

export function normalizeTweetLang(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const lower = raw.trim().toLowerCase();
  if (lower.startsWith('zh')) return 'zh';
  if (lower === 'in') return 'id';
  if (lower === 'iw') return 'he';
  return lower.split('-')[0];
}

const TWITTER_SNOWFLAKE_EPOCH = 1288834974657n;
const TWITTER_FOUNDING_MS = 1142908800000; // March 2006
const TWITTER_SNOWFLAKE_START_MS = 1288834974657; // Nov 2010
const TWITTER_USER_SNOWFLAKE_START_MS = 1455000000000; // Feb 2016

/**
 * Derives an X account's age in days strictly from its numeric `rest_id`
 * (supports 2006–2016 sequential IDs and 2016+ 64-bit Snowflake IDs).
 * Returns `null` when `restId` is outside valid X user ID ranges or in the future.
 */
export function deriveAccountAgeDaysFromRestId(
  restId: string | undefined,
  nowMs = Date.now()
): number | null {
  if (!restId || !/^\d+$/.test(restId)) return null;
  try {
    const idBig = BigInt(restId);
    if (idBig >= 100_000_000_000_000n) {
      const snowMs = Number((idBig >> 22n) + TWITTER_SNOWFLAKE_EPOCH);
      if (snowMs > TWITTER_SNOWFLAKE_START_MS && snowMs <= nowMs + 60_000) {
        return Math.max(0.2, (nowMs - Math.min(snowMs, nowMs)) / 86400_000);
      }
      return null;
    }
    if (idBig > 250_000_000n && idBig <= 5_000_000_000n) {
      const ratio = Number(idBig - 250_000_000n) / 4_750_000_000;
      const estMs =
        TWITTER_SNOWFLAKE_START_MS +
        ratio * (TWITTER_USER_SNOWFLAKE_START_MS - TWITTER_SNOWFLAKE_START_MS);
      return estMs <= nowMs ? Math.max(0.2, (nowMs - estMs) / 86400_000) : null;
    }
    if (idBig > 0n && idBig <= 250_000_000n) {
      const ratio = Number(idBig) / 250_000_000;
      const estMs =
        TWITTER_FOUNDING_MS +
        ratio * (TWITTER_SNOWFLAKE_START_MS - TWITTER_FOUNDING_MS);
      return estMs <= nowMs ? Math.max(0.2, (nowMs - estMs) / 86400_000) : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function computeAccountAgeDays(
  createdAtStr: string | undefined,
  nowMs = Date.now(),
  createdAtMs?: number,
  restId?: string
): number {
  if (
    typeof createdAtMs === 'number' &&
    !Number.isNaN(createdAtMs) &&
    createdAtMs > 1100000000000 &&
    createdAtMs <= nowMs
  ) {
    return Math.max(0.2, (nowMs - createdAtMs) / 86400_000);
  }

  if (createdAtStr) {
    const parsed = Date.parse(createdAtStr);
    if (!Number.isNaN(parsed) && parsed <= nowMs) {
      return Math.max(0.2, (nowMs - parsed) / 86400_000);
    }
  }

  return deriveAccountAgeDaysFromRestId(restId, nowMs) ?? 365;
}

/**
 * Merges two ExtractedAuthor snapshots for the same user so a partial stub never overwrites rich metrics.
 */
export function mergeAuthors(
  existing: ExtractedAuthor,
  incoming: ExtractedAuthor
): ExtractedAuthor {
  const statusesCount =
    incoming.statusesCount > 0
      ? incoming.statusesCount
      : existing.statusesCount;
  const createdAt = incoming.createdAt || existing.createdAt;
  const accountAgeDays =
    incoming.createdAt || existing.accountAgeDays === 365
      ? incoming.accountAgeDays
      : existing.accountAgeDays;
  const dailyTweetRate = statusesCount / Math.max(1, accountAgeDays);

  return {
    restId: incoming.restId || existing.restId,
    screenName: incoming.screenName || existing.screenName,
    name: incoming.name || existing.name,
    bio: incoming.bio || existing.bio,
    bioUrls:
      Array.isArray(incoming.bioUrls) && incoming.bioUrls.length > 0
        ? incoming.bioUrls
        : Array.isArray(existing.bioUrls)
          ? existing.bioUrls
          : [],
    createdAt,
    accountAgeDays,
    statusesCount,
    dailyTweetRate,
    followersCount:
      incoming.followersCount > 0
        ? incoming.followersCount
        : existing.followersCount,
    friendsCount:
      incoming.friendsCount > 0 ? incoming.friendsCount : existing.friendsCount,
    followRatio:
      incoming.followersCount > 0 || incoming.friendsCount > 0
        ? incoming.followRatio
        : existing.followRatio,
    mediaCount:
      incoming.mediaCount > 0 ? incoming.mediaCount : existing.mediaCount,
    favouritesCount:
      incoming.favouritesCount > 0
        ? incoming.favouritesCount
        : existing.favouritesCount,
    isBlueVerified: incoming.isBlueVerified || existing.isBlueVerified,
    following: incoming.following || existing.following,
    defaultProfileImage:
      incoming.defaultProfileImage || existing.defaultProfileImage,
    avatarUrl: incoming.avatarUrl || existing.avatarUrl,
  };
}

/**
 * Unwraps X's `TweetWithVisibilityResults` or nested tweet result wrappers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unwrapTweetResult(rawResult: any): any {
  if (!rawResult || typeof rawResult !== 'object') return null;
  if (
    rawResult.__typename === 'TweetWithVisibilityResults' &&
    rawResult.tweet
  ) {
    return rawResult.tweet;
  }
  if (
    rawResult.__typename === 'TweetTombstone' ||
    rawResult.__typename === 'TweetUnavailable'
  ) {
    return null;
  }
  return rawResult;
}

/**
 * Extracts normalized ExtractedAuthor from an X GraphQL user result object
 * (supports both X 2026 schema `tweet_counts`/`relationship_counts`/`verification` and `legacy` schema).
 */
export function extractAuthorFromUserResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawUserResult: any
): ExtractedAuthor | null {
  if (!rawUserResult || typeof rawUserResult !== 'object') return null;
  const userResult =
    rawUserResult.__typename === 'UserResults' && rawUserResult.result
      ? rawUserResult.result
      : rawUserResult;

  const legacy = userResult.legacy ?? {};
  const core = userResult.core ?? {};
  const tweetCounts = userResult.tweet_counts ?? {};
  const relCounts = userResult.relationship_counts ?? {};

  const restId = String(
    userResult.rest_id ?? userResult.id_str ?? legacy.id_str ?? ''
  );
  const screenName = String(core.screen_name ?? legacy.screen_name ?? '');
  if (!restId && !screenName) return null;

  const name = String(core.name ?? legacy.name ?? screenName);
  const bio = String(
    userResult.profile_bio?.description ?? legacy.description ?? ''
  );
  const createdAt = String(core.created_at ?? legacy.created_at ?? '');
  const createdAtMs =
    typeof core.created_at_ms === 'number'
      ? core.created_at_ms
      : typeof userResult.created_at_ms === 'number'
        ? userResult.created_at_ms
        : undefined;

  const accountAgeDays = computeAccountAgeDays(
    createdAt,
    Date.now(),
    createdAtMs,
    restId
  );

  const statusesCount = Number(
    tweetCounts.tweets ?? legacy.statuses_count ?? 0
  );
  const dailyTweetRate = statusesCount / Math.max(1, accountAgeDays);
  const followersCount = Number(
    relCounts.followers ?? legacy.followers_count ?? 0
  );
  const friendsCount = Number(relCounts.following ?? legacy.friends_count ?? 0);
  const followRatio = friendsCount / Math.max(1, followersCount);
  const mediaCount = Number(
    tweetCounts.media_tweets ?? legacy.media_count ?? 0
  );
  const favouritesCount = Number(
    userResult.action_counts?.favorites_count ?? legacy.favourites_count ?? 0
  );

  const isBlueVerified = Boolean(
    userResult.verification?.is_blue_verified ??
      userResult.is_blue_verified ??
      legacy.verified ??
      false
  );
  const following = Boolean(
    userResult.relationship_perspectives?.following ?? legacy.following ?? false
  );
  const avatarUrl =
    userResult.avatar?.image_url ?? legacy.profile_image_url_https ?? undefined;
  const defaultProfileImage = Boolean(
    legacy.default_profile_image ??
      (typeof avatarUrl === 'string' && avatarUrl.includes('default_profile'))
  );

  const bioUrls: string[] = [];
  const urlSources = [
    userResult.profile_bio?.entities?.description?.urls,
    userResult.profile_bio?.entities?.url?.urls,
    legacy.entities?.description?.urls,
    legacy.entities?.url?.urls,
  ];
  for (const list of urlSources) {
    if (Array.isArray(list)) {
      for (const u of list) {
        for (const rawUrl of [u?.expanded_url, u?.unwound_url]) {
          if (typeof rawUrl === 'string') {
            const trimmed = rawUrl.trim();
            if (trimmed && !bioUrls.includes(trimmed)) {
              bioUrls.push(trimmed);
            }
          }
        }
      }
    }
  }

  return {
    restId,
    screenName,
    name,
    bio,
    bioUrls,
    createdAt:
      createdAt || (createdAtMs ? new Date(createdAtMs).toISOString() : ''),
    accountAgeDays,
    statusesCount,
    dailyTweetRate,
    followersCount,
    friendsCount,
    followRatio,
    mediaCount,
    favouritesCount,
    isBlueVerified,
    following,
    defaultProfileImage,
    avatarUrl,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countTweetTags(rawTweet: any, fallbackText: string): {
  hashtags: number;
  cashtags: number;
} {
  if (!rawTweet || typeof rawTweet !== 'object') {
    return { hashtags: 0, cashtags: 0 };
  }
  const legacy = rawTweet.legacy ?? {};
  const details = rawTweet.details ?? {};
  const hashtagEntities = details.hashtag_entities ?? legacy.entities?.hashtags;
  const hashtags = Array.isArray(hashtagEntities)
    ? hashtagEntities.length
    : (fallbackText.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;

  const cashtagEntities =
    details.cashtag_entities ??
    rawTweet.cashtag_attachments ??
    legacy.entities?.symbols;
  const cashtags = Array.isArray(cashtagEntities)
    ? cashtagEntities.length
    : (fallbackText.match(/\$[A-Za-z]{2,10}\b/g) ?? []).length;

  return { hashtags, cashtags };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractExpandedUrls(...rawTweets: any[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const rt of rawTweets) {
    if (!rt || typeof rt !== 'object') continue;
    const rawUrlLists = [
      rt.url_entities,
      rt.details?.url_entities,
      rt.legacy?.entities?.urls,
      rt.note_tweet?.note_tweet_results?.result?.entity_set?.urls,
    ];
    for (const list of rawUrlLists) {
      if (!Array.isArray(list)) continue;
      for (const u of list) {
        for (const rawUrl of [u?.expanded_url, u?.unwound_url]) {
          if (typeof rawUrl === 'string') {
            const trimmed = rawUrl.trim();
            if (trimmed && !seen.has(trimmed)) {
              seen.add(trimmed);
              urls.push(trimmed);
            }
          }
        }
      }
    }
  }
  return urls;
}

/**
 * Extracts normalized ExtractedTweet from an X GraphQL timeline itemContent object
 * (supports both 2026 `details`/`counts`/`content` schema and `legacy` schema).
 */
export function extractTweetFromItemContent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itemContent: any,
  scene: TweetScene,
  focalTweetId?: string,
  focalAuthor?: FocalTweetAuthor,
  timelineFeed?: TimelineFeed
): ExtractedTweet | null {
  if (!itemContent || typeof itemContent !== 'object') return null;

  const rawTweet = unwrapTweetResult(itemContent.tweet_results?.result);
  if (!rawTweet) return null;

  const legacy = rawTweet.legacy ?? {};
  const details = rawTweet.details ?? {};
  const counts = rawTweet.counts ?? {};

  const tweetId = String(rawTweet.rest_id ?? legacy.id_str ?? '');
  if (!tweetId) return null;

  // Never filter the main focal tweet that the user clicked on in TweetDetail!
  if (focalTweetId && tweetId === focalTweetId) {
    return null;
  }

  const userResult =
    rawTweet.core?.user_results?.result ?? rawTweet.core?.user_result?.result;
  const author = extractAuthorFromUserResult(userResult);
  if (!author) return null;

  // Full text (handles NoteTweet, 2026 details.full_text, and legacy.full_text)
  const noteTweetText = rawTweet.note_tweet?.note_tweet_results?.result?.text;
  const text = String(
    noteTweetText ?? details.full_text ?? legacy.full_text ?? legacy.text ?? ''
  );

  // Unwrap Retweet before Quote so Retweet-of-Quote also captures quotedRaw
  const retweetedRaw = unwrapTweetResult(
    legacy.retweeted_status_result?.result ??
      rawTweet.retweeted_status_result?.result
  );
  const quotedRaw = unwrapTweetResult(
    rawTweet.quoted_status_result?.result ??
      rawTweet.quoted_tweet_results?.result ??
      retweetedRaw?.quoted_status_result?.result ??
      retweetedRaw?.quoted_tweet_results?.result
  );
  const quotedAuthor = quotedRaw
    ? (extractAuthorFromUserResult(
        quotedRaw.core?.user_results?.result ??
          quotedRaw.core?.user_result?.result
      ) ?? undefined)
    : undefined;
  const retweetedAuthor = retweetedRaw
    ? (extractAuthorFromUserResult(
        retweetedRaw.core?.user_results?.result ??
          retweetedRaw.core?.user_result?.result
      ) ?? undefined)
    : undefined;

  const rawQuotedText =
    quotedRaw?.note_tweet?.note_tweet_results?.result?.text ??
    quotedRaw?.details?.full_text ??
    quotedRaw?.legacy?.full_text ??
    quotedRaw?.legacy?.text;
  const quotedText =
    rawQuotedText !== undefined &&
    rawQuotedText !== null &&
    String(rawQuotedText).length > 0
      ? String(rawQuotedText)
      : undefined;

  const rawRetweetedText =
    retweetedRaw?.note_tweet?.note_tweet_results?.result?.text ??
    retweetedRaw?.details?.full_text ??
    retweetedRaw?.legacy?.full_text ??
    retweetedRaw?.legacy?.text;
  const retweetedText = retweetedRaw
    ? rawRetweetedText !== undefined && rawRetweetedText !== null
      ? String(rawRetweetedText)
      : ''
    : undefined;

  // On a pure Retweet, outer rawTweet only echoes retweetedRaw's entities (sometimes with
  // trailing-slash normalization differences), so keep all RT URLs strictly under retweetedUrls.
  const rtUrls = retweetedRaw
    ? extractExpandedUrls(retweetedRaw, rawTweet)
    : [];
  const urls = retweetedRaw ? [] : extractExpandedUrls(rawTweet);
  const quotedUrls = quotedRaw ? extractExpandedUrls(quotedRaw) : [];

  const outerTags = countTweetTags(rawTweet, text);
  const rtTags = retweetedRaw
    ? countTweetTags(retweetedRaw, retweetedText ?? '')
    : { hashtags: 0, cashtags: 0 };
  const hashtagCount = Math.max(outerTags.hashtags, rtTags.hashtags);
  const cashtagCount = Math.max(outerTags.cashtags, rtTags.cashtags);

  const mediaLists = [
    rawTweet.media_entities,
    details.media_entities,
    legacy.extended_entities?.media,
    legacy.entities?.media,
  ];
  const hasMedia = mediaLists.some((m) => Array.isArray(m) && m.length > 0);

  const lang = normalizeTweetLang(
    details.lang ??
      rawTweet.lang ??
      legacy.lang ??
      retweetedRaw?.details?.lang ??
      retweetedRaw?.legacy?.lang
  );

  const isPromoted = Boolean(
    itemContent.promotedMetadata ||
      itemContent.promoted_metadata ||
      itemContent.TweetPromotedMetadata
  );

  const inReplyToTweetId =
    details.in_reply_to_status_id_str ??
    rawTweet.in_reply_to_status_id_str ??
    legacy.in_reply_to_status_id_str;
  const inReplyToUserId =
    details.in_reply_to_user_id_str ??
    rawTweet.in_reply_to_user_id_str ??
    legacy.in_reply_to_user_id_str;
  const isReply = Boolean(inReplyToTweetId || scene === 'reply');

  let resolvedFocal = focalAuthor;
  if (
    !resolvedFocal &&
    focalTweetId &&
    inReplyToTweetId &&
    String(inReplyToTweetId) === focalTweetId &&
    inReplyToUserId
  ) {
    resolvedFocal = {
      restId: String(inReplyToUserId),
      screenName: '',
      name: '',
      followersCount: 0,
    };
  }

  const replyCount = Number(counts.reply_count ?? legacy.reply_count ?? 0);
  const favoriteCount = Number(
    counts.favorite_count ?? legacy.favorite_count ?? 0
  );
  const viewCount = Number(rawTweet.views?.count ?? 0);

  return {
    tweetId,
    text,
    ...(retweetedText !== undefined ? { retweetedText } : {}),
    quotedText,
    lang,
    hasMedia,
    urls,
    ...(rtUrls.length > 0 ? { retweetedUrls: rtUrls } : {}),
    ...(quotedUrls.length > 0 ? { quotedUrls } : {}),
    hashtagCount,
    cashtagCount,
    isPromoted,
    isReply,
    inReplyToTweetId: inReplyToTweetId ? String(inReplyToTweetId) : undefined,
    ...(focalTweetId ? { focalTweetId } : {}),
    replyCount,
    favoriteCount,
    viewCount,
    scene,
    ...(timelineFeed ? { timelineFeed } : {}),
    author,
    retweetedAuthor,
    quotedAuthor,
    focalAuthor: resolvedFocal,
  };
}

export interface GraphqlProcessResult {
  modified: boolean;
  interceptedLogs: InterceptionLogEntry[];
  decisionsByTweetId: Record<
    string,
    {
      decision: InterceptionDecision;
      tweet: ExtractedTweet;
    }
  >;
  authorsByScreenName: Record<
    string,
    {
      author: ExtractedAuthor;
      riskBadges: string[];
    }
  >;
  extractedTweetCount: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function locateFocalAuthor(node: any, focalTweetId: string, depth = 0): ExtractedAuthor | undefined {
  if (!node || typeof node !== 'object' || depth > 14) return undefined;
  const rawTweet = unwrapTweetResult(node.tweet_results?.result);
  if (rawTweet) {
    const id = String(rawTweet.rest_id ?? rawTweet.legacy?.id_str ?? '');
    if (id === focalTweetId) {
      const userRes =
        rawTweet.core?.user_results?.result ??
        rawTweet.core?.user_result?.result;
      return extractAuthorFromUserResult(userRes) ?? undefined;
    }
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = locateFocalAuthor(child, focalTweetId, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  for (const key of Object.keys(node)) {
    const found = locateFocalAuthor(node[key], focalTweetId, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * Recursively traverses an X GraphQL / Relay response payload:
 * - Extracts UserByScreenName / user_result_by_screen_name / timeline author metadata
 * - Evaluates every tweet against FilterConfig
 * - In `strip` mode, mutates `instructions` in-place to remove blocked tweets before React renders
 * - In `collapse` or `badge_only` mode, keeps the entries and returns `decisionsByTweetId` for DOM rendering
 */
export function processGraphqlResponsePayload(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  graphqlUrl: string,
  pagePathname: string,
  config: FilterConfig,
  crowdSnapshot?: CrowdBlockSnapshot | null,
  windowTracker?: SlidingWindowTracker,
  duplicateTracker?: ThreadDuplicateTracker
): GraphqlProcessResult {
  const result: GraphqlProcessResult = {
    modified: false,
    interceptedLogs: [],
    decisionsByTweetId: {},
    authorsByScreenName: {},
    extractedTweetCount: 0,
  };

  if (!payload || typeof payload !== 'object') {
    return result;
  }

  const scene = detectSceneFromUrl(graphqlUrl, pagePathname);
  const timelineFeed =
    scene === 'timeline' ? detectTimelineFeedFromUrl(graphqlUrl) : undefined;
  const statusMatch = pagePathname.match(
    /\/(?:([a-zA-Z0-9_]{1,15})\/)?status\/(\d+)/
  );
  const graphqlPathPart = graphqlUrl.split(/[?#]/, 1)[0] ?? graphqlUrl;
  const urlFocalMatch = /TweetDetail/i.test(graphqlPathPart)
    ? graphqlUrl.match(
        /focalTweetId(?:%22|")(?:\s|%20|\+)*(?::|%3A)(?:\s|%20|\+)*(?:%22|")(\d+)/i
      )
    : null;
  const focalTweetId = urlFocalMatch?.[1] ?? statusMatch?.[2];
  const focalHandleFromPath =
    !urlFocalMatch || statusMatch?.[2] === focalTweetId
      ? (statusMatch?.[1] ?? '')
      : '';
  const activeDuplicateTracker =
    duplicateTracker ??
    (scene === 'reply' ? new ThreadDuplicateTracker() : undefined);
  const seenExtractedTweetIds = new Set<string>();

  const recordAuthor = (author: ExtractedAuthor) => {
    if (!author.screenName) return;
    const key = author.screenName.toLowerCase();
    const prev = Object.prototype.hasOwnProperty.call(
      result.authorsByScreenName,
      key
    )
      ? result.authorsByScreenName[key]?.author
      : undefined;
    const merged = prev ? mergeAuthors(prev, author) : author;
    const profileEval = evaluateAuthorProfile(merged, config, crowdSnapshot);
    Object.defineProperty(result.authorsByScreenName, key, {
      value: {
        author: merged,
        riskBadges: profileEval.riskBadges,
      },
      enumerable: true,
      writable: true,
      configurable: true,
    });
  };

  let focalAuthor: FocalTweetAuthor | undefined;
  if (focalTweetId) {
    const located = locateFocalAuthor(payload, focalTweetId);
    if (located) {
      recordAuthor(located);
      focalAuthor = {
        restId: located.restId,
        screenName: located.screenName || focalHandleFromPath,
        name: located.name,
        followersCount: located.followersCount,
      };
    }
  }

  // Check if this is a UserByScreenName / user_result_by_screen_name response
  const topUserCandidates = [
    payload?.data?.user?.result,
    payload?.data?.user_result_by_screen_name?.result,
    payload?.data?.user_results?.result,
  ];
  for (const candidate of topUserCandidates) {
    if (candidate) {
      const profileAuthor = extractAuthorFromUserResult(candidate);
      if (profileAuthor && profileAuthor.screenName) {
        recordAuthor(profileAuthor);
      }
    }
  }

  // Helper to evaluate an itemContent and decide whether to strip it from the array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleItemContent = (itemContent: any): boolean => {
    const tweet = extractTweetFromItemContent(
      itemContent,
      scene,
      focalTweetId,
      focalAuthor,
      timelineFeed
    );
    if (!tweet) {
      // Valid focal tweet inside instructions is intentionally skipped from filtering,
      // but MUST still count as extracted so zero-reply TweetDetail pages do not
      // false-trigger parse health alerts while broken instructions still report 0.
      if (focalTweetId) {
        const rawFocal = unwrapTweetResult(itemContent?.tweet_results?.result);
        const rawFocalId = rawFocal
          ? String(rawFocal.rest_id ?? rawFocal.legacy?.id_str ?? '')
          : '';
        if (rawFocalId === focalTweetId) {
          const focalUser = extractAuthorFromUserResult(
            rawFocal.core?.user_results?.result ??
              rawFocal.core?.user_result?.result
          );
          if (focalUser) {
            seenExtractedTweetIds.add(rawFocalId);
          }
        }
      }
      return false;
    }

    seenExtractedTweetIds.add(tweet.tweetId);

    recordAuthor(tweet.author);
    if (tweet.retweetedAuthor) {
      recordAuthor(tweet.retweetedAuthor);
    }
    if (tweet.quotedAuthor) {
      recordAuthor(tweet.quotedAuthor);
    }

    const decision = evaluateTweet(
      tweet,
      config,
      crowdSnapshot,
      windowTracker,
      true,
      activeDuplicateTracker
    );

    Object.defineProperty(result.decisionsByTweetId, tweet.tweetId, {
      value: { decision, tweet },
      enumerable: true,
      writable: true,
      configurable: true,
    });

    if (decision.blocked && decision.ruleId && decision.reasonText) {
      const hitUid = decision.evidence?.find(
        (ev) => ev.key === 'hit_uid'
      )?.value;
      const secondaryHit = [tweet.retweetedAuthor, tweet.quotedAuthor].find(
        (u) =>
          u?.restId &&
          u.restId !== tweet.author.restId &&
          hitUid !== undefined &&
          String(hitUid) === u.restId
      );
      const logAuthor = secondaryHit ?? tweet.author;
      const snippetSource =
        secondaryHit === tweet.quotedAuthor && tweet.quotedText
          ? tweet.quotedText
          : secondaryHit === tweet.retweetedAuthor && tweet.retweetedText
            ? tweet.retweetedText
            : secondaryHit && tweet.quotedText
              ? tweet.quotedText
              : tweet.text;

      result.interceptedLogs.push({
        id: `${tweet.tweetId}-${Date.now()}`,
        tweetId: tweet.tweetId,
        authorUid: logAuthor.restId,
        authorScreenName: logAuthor.screenName,
        authorName: logAuthor.name,
        authorAvatar: logAuthor.avatarUrl,
        tweetSnippet: snippetSource.slice(0, 140),
        scene: tweet.scene,
        ruleId: decision.ruleId,
        reasonText: decision.reasonText,
        timestamp: Date.now(),
        evidence: decision.evidence,
      });

      if (decision.action === 'strip') {
        return true; // Strip this entry from GraphQL JSON!
      }
    }

    return false;
  };

  // Recursively find all `instructions` arrays inside payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const walkObject = (node: any, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 14) return;

    if (Array.isArray(node.instructions)) {
      for (const instruction of node.instructions) {
        if (!instruction || typeof instruction !== 'object') continue;

        // 1. TimelineAddEntries (entries array)
        if (Array.isArray(instruction.entries)) {
          const originalLen = instruction.entries.length;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          instruction.entries = instruction.entries.filter((entry: any) => {
            if (!entry?.content) return true;
            const content = entry.content;

            // Single tweet item (supports both `itemContent` and 2026 `content`)
            const singleItemContent = content.itemContent ?? content.content;
            if (singleItemContent?.tweet_results) {
              const shouldStrip = handleItemContent(singleItemContent);
              return !shouldStrip;
            }

            // Conversation module / thread module (e.g. replies in TweetDetail)
            if (Array.isArray(content.items)) {
              const origItemsLen = content.items.length;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content.items = content.items.filter((sub: any) => {
                const subItemContent =
                  sub?.item?.itemContent ?? sub?.item?.content;
                if (!subItemContent) return true;
                const shouldStrip = handleItemContent(subItemContent);
                return !shouldStrip;
              });
              if (content.items.length !== origItemsLen) {
                result.modified = true;
              }
              return content.items.length > 0;
            }

            return true;
          });

          if (instruction.entries.length !== originalLen) {
            result.modified = true;
          }
        }

        // 2. TimelineAddToModule (moduleItems array)
        if (Array.isArray(instruction.moduleItems)) {
          const originalLen = instruction.moduleItems.length;
          instruction.moduleItems = instruction.moduleItems.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (modItem: any) => {
              const subItemContent =
                modItem?.item?.itemContent ?? modItem?.item?.content;
              if (!subItemContent) return true;
              const shouldStrip = handleItemContent(subItemContent);
              return !shouldStrip;
            }
          );
          if (instruction.moduleItems.length !== originalLen) {
            result.modified = true;
          }
        }

        // 3. TimelinePinEntry / TimelineReplaceEntry (singular entry)
        const pinItemContent =
          instruction.entry?.content?.itemContent ??
          instruction.entry?.content?.content;
        if (pinItemContent?.tweet_results) {
          const shouldStrip = handleItemContent(pinItemContent);
          if (shouldStrip) {
            delete instruction.entry;
            result.modified = true;
          }
        }
      }
      return;
    }

    for (const key of Object.keys(node)) {
      const child = node[key];
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        walkObject(child, depth + 1);
      }
    }
  };

  walkObject(payload, 0);
  result.extractedTweetCount = seenExtractedTweetIds.size;
  return result;
}
