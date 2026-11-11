import {
  evaluateAuthorProfile,
  evaluateTweet,
  SlidingWindowTracker,
} from './engine';
import type {
  CrowdBlockSnapshot,
  ExtractedAuthor,
  ExtractedTweet,
  FilterConfig,
  FocalTweetAuthor,
  InterceptionDecision,
  InterceptionLogEntry,
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
  if (/TweetDetail/i.test(graphqlUrl) || /\/status\/\d+/.test(pagePathname)) {
    return 'reply';
  }
  if (
    /SearchTimeline/i.test(graphqlUrl) ||
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
  if (/UserTweets|UserMedia/i.test(graphqlUrl)) {
    return 'profile';
  }
  return 'timeline';
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
    bioUrls: incoming.bioUrls.length > 0 ? incoming.bioUrls : existing.bioUrls,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractAuthorFromUserResult(
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
        if (u?.expanded_url && !bioUrls.includes(String(u.expanded_url))) {
          bioUrls.push(String(u.expanded_url));
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

/**
 * Extracts normalized ExtractedTweet from an X GraphQL timeline itemContent object
 * (supports both 2026 `details`/`counts`/`content` schema and `legacy` schema).
 */
export function extractTweetFromItemContent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itemContent: any,
  scene: TweetScene,
  focalTweetId?: string,
  focalAuthor?: FocalTweetAuthor
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

  // Quoted or Retweeted text & author
  const quotedRaw = unwrapTweetResult(
    rawTweet.quoted_status_result?.result ??
      rawTweet.quoted_tweet_results?.result
  );
  const retweetedRaw = unwrapTweetResult(
    legacy.retweeted_status_result?.result ??
      rawTweet.retweeted_status_result?.result
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

  const secondaryTextParts: string[] = [];
  const quotedText =
    quotedRaw?.details?.full_text ?? quotedRaw?.legacy?.full_text;
  if (quotedText) {
    secondaryTextParts.push(String(quotedText));
  }
  const retweetedText =
    retweetedRaw?.details?.full_text ?? retweetedRaw?.legacy?.full_text;
  if (retweetedText) {
    secondaryTextParts.push(String(retweetedText));
  }

  const urls: string[] = [];
  const rawUrlLists = [
    rawTweet.url_entities,
    details.url_entities,
    legacy.entities?.urls,
    retweetedRaw?.url_entities,
    retweetedRaw?.details?.url_entities,
    retweetedRaw?.legacy?.entities?.urls,
  ];
  for (const list of rawUrlLists) {
    if (Array.isArray(list)) {
      for (const u of list) {
        if (u?.expanded_url && !urls.includes(String(u.expanded_url))) {
          urls.push(String(u.expanded_url));
        }
      }
    }
  }

  const outerTags = countTweetTags(rawTweet, text);
  const rtTags = retweetedRaw
    ? countTweetTags(retweetedRaw, String(retweetedText ?? ''))
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
    quotedText:
      secondaryTextParts.length > 0 ? secondaryTextParts.join('\n') : undefined,
    lang,
    hasMedia,
    urls,
    hashtagCount,
    cashtagCount,
    isPromoted,
    isReply,
    inReplyToTweetId: inReplyToTweetId ? String(inReplyToTweetId) : undefined,
    replyCount,
    favoriteCount,
    viewCount,
    scene,
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
  windowTracker?: SlidingWindowTracker
): GraphqlProcessResult {
  const result: GraphqlProcessResult = {
    modified: false,
    interceptedLogs: [],
    decisionsByTweetId: {},
    authorsByScreenName: {},
  };

  if (!payload || typeof payload !== 'object') {
    return result;
  }

  const scene = detectSceneFromUrl(graphqlUrl, pagePathname);
  const statusMatch = pagePathname.match(/\/(?:([a-zA-Z0-9_]{1,15})\/)?status\/(\d+)/);
  const focalHandleFromPath = statusMatch?.[1] ?? '';
  const focalTweetId = statusMatch?.[2];

  const recordAuthor = (author: ExtractedAuthor) => {
    if (!author.screenName) return;
    const key = author.screenName.toLowerCase();
    const prev = result.authorsByScreenName[key]?.author;
    const merged = prev ? mergeAuthors(prev, author) : author;
    const profileEval = evaluateAuthorProfile(merged, config, crowdSnapshot);
    result.authorsByScreenName[key] = {
      author: merged,
      riskBadges: profileEval.riskBadges,
    };
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
      focalAuthor
    );
    if (!tweet) return false;

    recordAuthor(tweet.author);
    if (tweet.retweetedAuthor) {
      recordAuthor(tweet.retweetedAuthor);
    }
    if (tweet.quotedAuthor) {
      recordAuthor(tweet.quotedAuthor);
    }

    const decision = evaluateTweet(tweet, config, crowdSnapshot, windowTracker);

    result.decisionsByTweetId[tweet.tweetId] = { decision, tweet };

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
        secondaryHit && tweet.quotedText ? tweet.quotedText : tweet.text;

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
  return result;
}
