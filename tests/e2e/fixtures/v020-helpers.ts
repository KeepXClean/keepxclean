/**
 * KeepXClean v0.2.0 Shared E2E Helpers & Fixtures
 *
 * Vitest-free, zero-top-level-await, offline-deterministic infrastructure for
 * Tiers 1–4 v0.2.0 opaque-box E2E tests:
 *   1. Parallel-safe contract loaders (requireExport / requireModule / requireFile)
 *   2. Direct engine factories & X GraphQL payload builders
 *   3. Vitest-free Chrome MV3 local+sync quota mock, JSDOM global mounter,
 *      background/page-interceptor/React-component harnesses
 *   4. In-memory Node 22 `node:sqlite` D1Database adapter & server migration runner
 *   5. Canvas 2D mock recorder + auto-loading Image shim (PNG magic header)
 *   6. Safe offline `tsx` CLI subprocess runner (spawn + detached process group, zero shell interpolation)
 *   7. Canonical v0.2.0 fixtures (legacy 24 IDs, Grok authors, v0.1.2 config, kxc-pack-v1)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { AssertionError, expect } from '../harness';
import {
  createVirtualBrowser,
  type VirtualBrowserInstance,
} from './browser-env';
import type {
  AccountListEntry,
  ExtractedAuthor,
  ExtractedTweet,
  FocalTweetAuthor,
  KeywordRuleItem,
  TweetScene,
} from '../../../packages/shared/src/types';

// ============================================================================
// Section 1: Repo Paths & Parallel-Safe Contract Loaders
// ============================================================================

export const REPO_ROOT = path.resolve(__dirname, '../../../');

export function requireExport<T>(
  mod: Record<string, unknown> | null | undefined,
  name: string,
  label?: string
): T {
  if (!mod || typeof mod !== 'object' || !(name in mod) || mod[name] === undefined) {
    throw new AssertionError(
      `[v0.2.0 Contract Missing] Expected export "${name}"${label ? ` from ${label}` : ''} to be defined`,
      `defined export "${name}"`,
      mod && typeof mod === 'object' ? mod[name] : mod
    );
  }
  return mod[name] as T;
}

export async function requireModule<T = Record<string, unknown>>(
  repoRelPath: string,
  label?: string
): Promise<T> {
  const abs = path.resolve(REPO_ROOT, repoRelPath);
  if (!fs.existsSync(abs)) {
    throw new AssertionError(
      `[v0.2.0 Contract Missing] Missing module "${repoRelPath}"${label ? ` (${label})` : ''}`,
      abs,
      'ENOENT'
    );
  }
  return (await import(pathToFileURL(abs).href)) as T;
}

export function requireFile(repoRelPath: string, label?: string): string {
  const abs = path.resolve(REPO_ROOT, repoRelPath);
  if (!fs.existsSync(abs)) {
    throw new AssertionError(
      `[v0.2.0 Contract Missing] Missing file "${repoRelPath}"${label ? ` (${label})` : ''}`,
      abs,
      'ENOENT'
    );
  }
  return fs.readFileSync(abs, 'utf8');
}

export function fileExists(repoRelPath: string): boolean {
  return fs.existsSync(path.resolve(REPO_ROOT, repoRelPath));
}

// ============================================================================
// Section 2: Direct Engine Factories & X GraphQL Payload Builders
// ============================================================================

export const GRAPHQL_URLS = {
  forYou: 'https://x.com/i/api/graphql/kxcForYou01/HomeTimeline',
  following: 'https://x.com/i/api/graphql/kxcFollow02/HomeLatestTimeline',
  tweetDetail: 'https://x.com/i/api/graphql/kxcDetail03/TweetDetail',
  search: 'https://x.com/i/api/graphql/kxcSearch04/SearchTimeline',
} as const;

export function makeExtractedAuthor(
  overrides: Partial<ExtractedAuthor> = {}
): ExtractedAuthor {
  const accountAgeDays = overrides.accountAgeDays ?? 365;
  const statusesCount =
    overrides.statusesCount ??
    (overrides.dailyTweetRate !== undefined
      ? Math.round(overrides.dailyTweetRate * Math.max(1, accountAgeDays))
      : 120);
  const dailyTweetRate =
    overrides.dailyTweetRate ?? statusesCount / Math.max(1, accountAgeDays);
  const followersCount = overrides.followersCount ?? 1500;
  const friendsCount = overrides.friendsCount ?? 300;
  const followRatio =
    overrides.followRatio ?? friendsCount / Math.max(1, followersCount);

  return {
    restId: overrides.restId ?? '1000000001',
    screenName: overrides.screenName ?? 'normal_user',
    name: overrides.name ?? 'Normal User',
    bio: overrides.bio ?? 'Software engineer sharing technical notes.',
    bioUrls: overrides.bioUrls ? [...overrides.bioUrls] : [],
    createdAt:
      overrides.createdAt ??
      new Date(Date.now() - accountAgeDays * 86_400_000).toUTCString(),
    accountAgeDays,
    statusesCount,
    dailyTweetRate,
    followersCount,
    friendsCount,
    followRatio,
    mediaCount: overrides.mediaCount ?? 25,
    favouritesCount: overrides.favouritesCount ?? 500,
    isBlueVerified: overrides.isBlueVerified ?? false,
    following: overrides.following ?? false,
    defaultProfileImage: overrides.defaultProfileImage ?? false,
    avatarUrl: overrides.avatarUrl,
  };
}

export const makeAuthor = makeExtractedAuthor;

export interface V020ExtractedTweetInput extends Partial<ExtractedTweet> {
  quotedUrls?: string[];
  focalTweetId?: string;
  timelineFeed?: 'for_you' | 'following';
}

export function makeExtractedTweet(
  overrides: V020ExtractedTweetInput = {}
): ExtractedTweet & {
  quotedUrls?: string[];
  focalTweetId?: string;
  timelineFeed?: 'for_you' | 'following';
} {
  const base: ExtractedTweet & {
    quotedUrls?: string[];
    focalTweetId?: string;
    timelineFeed?: 'for_you' | 'following';
  } = {
    tweetId: overrides.tweetId ?? '9000000000001',
    text:
      overrides.text ??
      'Here is a detailed technical write-up about compiler optimizations and runtime profiling.',
    lang: overrides.lang ?? 'en',
    hasMedia: overrides.hasMedia ?? false,
    urls: overrides.urls ? [...overrides.urls] : [],
    hashtagCount: overrides.hashtagCount ?? 0,
    cashtagCount: overrides.cashtagCount ?? 0,
    isPromoted: overrides.isPromoted ?? false,
    isReply: overrides.isReply ?? false,
    replyCount: overrides.replyCount ?? 2,
    favoriteCount: overrides.favoriteCount ?? 15,
    viewCount: overrides.viewCount ?? 500,
    scene: (overrides.scene ?? 'timeline') as TweetScene,
    author: overrides.author ?? makeExtractedAuthor(),
  };

  if (overrides.quotedText !== undefined) base.quotedText = overrides.quotedText;
  if (overrides.quotedUrls !== undefined) base.quotedUrls = [...overrides.quotedUrls];
  if (overrides.inReplyToTweetId !== undefined) {
    base.inReplyToTweetId = overrides.inReplyToTweetId;
  }
  if (overrides.focalTweetId !== undefined) base.focalTweetId = overrides.focalTweetId;
  if (overrides.timelineFeed !== undefined) base.timelineFeed = overrides.timelineFeed;
  if (overrides.retweetedAuthor !== undefined) {
    base.retweetedAuthor = overrides.retweetedAuthor;
  }
  if (overrides.quotedAuthor !== undefined) base.quotedAuthor = overrides.quotedAuthor;
  if (overrides.focalAuthor !== undefined) {
    base.focalAuthor = overrides.focalAuthor as FocalTweetAuthor;
  }

  return base;
}

export const makeTweet = makeExtractedTweet;

export interface GraphqlAuthorInput {
  restId: string;
  screenName: string;
  name?: string;
  bio?: string;
  bioUrls?: string[];
  profileUrl?: string;
  followersCount?: number;
  friendsCount?: number;
  following?: boolean;
  statusesCount?: number;
  dailyTweetRate?: number;
  accountAgeDays?: number;
  createdAt?: string;
  isBlueVerified?: boolean;
  defaultProfileImage?: boolean;
  avatarUrl?: string;
  mediaCount?: number;
  favouritesCount?: number;
}

export interface GraphqlTweetInput {
  tweetId: string;
  text: string;
  author: GraphqlAuthorInput;
  lang?: string;
  urls?: string[];
  hashtags?: string[];
  cashtags?: string[];
  hasMedia?: boolean;
  isPromoted?: boolean;
  inReplyToTweetId?: string;
  inReplyToUserId?: string;
  replyCount?: number;
  favoriteCount?: number;
  viewCount?: number;
  quotedTweet?: GraphqlTweetInput;
  retweetedTweet?: GraphqlTweetInput;
  wrapVisibility?: boolean;
  entryId?: string;
}

function buildGraphqlUserResult(author: GraphqlAuthorInput): Record<string, unknown> {
  const accountAgeDays = author.accountAgeDays ?? 365;
  const statusesCount =
    author.statusesCount ??
    (author.dailyTweetRate !== undefined
      ? Math.round(author.dailyTweetRate * Math.max(1, accountAgeDays))
      : 120);
  const createdAt =
    author.createdAt ??
    new Date(Date.now() - accountAgeDays * 86_400_000).toUTCString();

  const descriptionUrls = (author.bioUrls ?? []).map((u) => ({
    expanded_url: u,
    url: 'https://t.co/mockbio',
    display_url: u,
  }));
  const profileUrls = author.profileUrl
    ? [
        {
          expanded_url: author.profileUrl,
          url: 'https://t.co/mockurl',
          display_url: author.profileUrl,
        },
      ]
    : [];

  return {
    __typename: 'User',
    rest_id: author.restId,
    is_blue_verified: author.isBlueVerified ?? false,
    legacy: {
      screen_name: author.screenName,
      name: author.name ?? author.screenName,
      description: author.bio ?? '',
      created_at: createdAt,
      statuses_count: statusesCount,
      followers_count: author.followersCount ?? 1500,
      friends_count: author.friendsCount ?? 300,
      media_count: author.mediaCount ?? 20,
      favourites_count: author.favouritesCount ?? 400,
      following: author.following ?? false,
      default_profile_image: author.defaultProfileImage ?? false,
      profile_image_url_https:
        author.avatarUrl ??
        `https://pbs.twimg.com/profile_images/${author.restId}/avatar_normal.jpg`,
      entities: {
        description: { urls: descriptionUrls },
        ...(profileUrls.length > 0 ? { url: { urls: profileUrls } } : {}),
      },
    },
  };
}

export function buildGraphqlTweetResult(
  opts: GraphqlTweetInput
): Record<string, unknown> {
  // CRITICAL: OMIT legacy.entities.hashtags and legacy.entities.symbols unless
  // explicitly provided so graphql-parser's countTweetTags text fallback works!
  const entities: Record<string, unknown> = {
    urls: (opts.urls ?? []).map((u) => ({
      expanded_url: u,
      url: 'https://t.co/mock',
      display_url: u,
    })),
  };
  if (opts.hashtags !== undefined) {
    entities.hashtags = opts.hashtags.map((text) => ({ text }));
  }
  if (opts.cashtags !== undefined) {
    entities.symbols = opts.cashtags.map((text) => ({ text }));
  }

  const legacy: Record<string, unknown> = {
    id_str: opts.tweetId,
    full_text: opts.text,
    lang: opts.lang ?? 'en',
    reply_count: opts.replyCount ?? 1,
    favorite_count: opts.favoriteCount ?? 10,
    entities,
  };

  if (opts.hasMedia) {
    legacy.extended_entities = {
      media: [{ id_str: `media-${opts.tweetId}`, type: 'photo' }],
    };
  }
  if (opts.inReplyToTweetId !== undefined) {
    legacy.in_reply_to_status_id_str = opts.inReplyToTweetId;
  }
  if (opts.inReplyToUserId !== undefined) {
    legacy.in_reply_to_user_id_str = opts.inReplyToUserId;
  }
  if (opts.retweetedTweet) {
    legacy.retweeted_status_result = {
      result: buildGraphqlTweetResult(opts.retweetedTweet),
    };
  }

  const tweetNode: Record<string, unknown> = {
    __typename: 'Tweet',
    rest_id: opts.tweetId,
    views: { count: String(opts.viewCount ?? 500) },
    core: {
      user_results: {
        result: buildGraphqlUserResult(opts.author),
      },
    },
    legacy,
  };

  if (opts.quotedTweet) {
    tweetNode.quoted_status_result = {
      result: buildGraphqlTweetResult(opts.quotedTweet),
    };
  }

  if (opts.wrapVisibility) {
    return {
      __typename: 'TweetWithVisibilityResults',
      tweet: tweetNode,
    };
  }
  return tweetNode;
}

export function buildGraphqlTweetEntry(
  opts: GraphqlTweetInput
): Record<string, unknown> {
  const itemContent: Record<string, unknown> = {
    itemType: 'TimelineTweet',
    tweet_results: {
      result: buildGraphqlTweetResult(opts),
    },
  };
  if (opts.isPromoted) {
    itemContent.promotedMetadata = {
      impressionId: `imp-${opts.tweetId}`,
      advertiser_results: { result: { rest_id: opts.author.restId } },
    };
  }
  return {
    entryId: opts.entryId ?? `tweet-${opts.tweetId}`,
    content: {
      entryType: 'TimelineTimelineItem',
      itemContent,
    },
  };
}

function isGraphqlTweetInput(
  entry: Record<string, unknown> | GraphqlTweetInput
): entry is GraphqlTweetInput {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'tweetId' in entry &&
    'author' in entry &&
    !('content' in entry)
  );
}

function normalizeEntries(
  entries: Array<Record<string, unknown> | GraphqlTweetInput>
): Array<Record<string, unknown>> {
  return entries.map((e) =>
    isGraphqlTweetInput(e) ? buildGraphqlTweetEntry(e) : e
  );
}

export function buildHomeTimelinePayload(
  entries: Array<Record<string, unknown> | GraphqlTweetInput>,
  _feed: 'for_you' | 'following' = 'for_you'
): Record<string, unknown> {
  return {
    data: {
      home: {
        home_timeline_urt: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: normalizeEntries(entries),
            },
          ],
        },
      },
    },
  };
}

export function buildTweetDetailPayload(
  focalTweet: GraphqlTweetInput,
  replies: GraphqlTweetInput[],
  opts: { layout?: 'module' | 'flat' | 'addToModule' } = {}
): Record<string, unknown> {
  const layout = opts.layout ?? 'module';
  const focalEntry = buildGraphqlTweetEntry(focalTweet);

  if (layout === 'flat') {
    const replyEntries = replies.map((r) =>
      buildGraphqlTweetEntry({
        ...r,
        inReplyToTweetId: r.inReplyToTweetId ?? focalTweet.tweetId,
        inReplyToUserId: r.inReplyToUserId ?? focalTweet.author.restId,
      })
    );
    return {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [focalEntry, ...replyEntries],
            },
          ],
        },
      },
    };
  }

  if (layout === 'addToModule') {
    const moduleItems = replies.map((r) => ({
      entryId: `conversationthread-${r.tweetId}-tweet-${r.tweetId}`,
      item: {
        itemContent: {
          itemType: 'TimelineTweet',
          tweet_results: {
            result: buildGraphqlTweetResult({
              ...r,
              inReplyToTweetId: r.inReplyToTweetId ?? focalTweet.tweetId,
              inReplyToUserId: r.inReplyToUserId ?? focalTweet.author.restId,
            }),
          },
        },
      },
    }));
    return {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            { type: 'TimelineAddEntries', entries: [focalEntry] },
            { type: 'TimelineAddToModule', moduleItems },
          ],
        },
      },
    };
  }

  const replyModules = replies.map((r) => ({
    entryId: `conversationthread-${r.tweetId}`,
    content: {
      entryType: 'TimelineTimelineModule',
      items: [
        {
          entryId: `conversationthread-${r.tweetId}-tweet-${r.tweetId}`,
          item: {
            itemContent: {
              itemType: 'TimelineTweet',
              tweet_results: {
                result: buildGraphqlTweetResult({
                  ...r,
                  inReplyToTweetId: r.inReplyToTweetId ?? focalTweet.tweetId,
                  inReplyToUserId: r.inReplyToUserId ?? focalTweet.author.restId,
                }),
              },
            },
          },
        },
      ],
    },
  }));

  return {
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [
          {
            type: 'TimelineAddEntries',
            entries: [focalEntry, ...replyModules],
          },
        ],
      },
    },
  };
}

export function buildSearchTimelinePayload(
  entries: Array<Record<string, unknown> | GraphqlTweetInput>
): Record<string, unknown> {
  return {
    data: {
      search_by_raw_query: {
        search_timeline: {
          timeline: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: normalizeEntries(entries),
              },
            ],
          },
        },
      },
    },
  };
}

export function buildEmptyCoreGraphqlPayload(
  opName: string,
  topLevelData?: Record<string, unknown>
): Record<string, unknown> {
  if (topLevelData) {
    return { data: topLevelData };
  }
  switch (opName) {
    case 'HomeTimeline':
      return { data: { home_v2_renamed: { timeline_entries: [] } } };
    case 'HomeLatestTimeline':
      return { data: { home_latest_v2_renamed: { timeline_entries: [] } } };
    case 'TweetDetail':
      return { data: { conversation_v3_renamed: { thread_items: [] } } };
    case 'SearchTimeline':
      return { data: { search_v2_renamed: { result_nodes: [] } } };
    default:
      return { data: { renamed_root: { opName, nodes: [] } } };
  }
}

// ============================================================================
// Section 3: Vitest-Free Mock Chrome Env, DOM Globals & Extension Harnesses
// ============================================================================

export const CHROME_SYNC_QUOTA_BYTES = 102400;
export const CHROME_SYNC_QUOTA_BYTES_PER_ITEM = 8192;
export const CHROME_SYNC_MAX_ITEMS = 512;
export const CHROME_SYNC_MAX_WRITES_PER_HOUR = 1800;
export const CHROME_SYNC_MAX_WRITES_PER_MINUTE = 120;

export function computeChromeStorageItemBytes(key: string, value: unknown): number {
  const serialized = JSON.stringify(value);
  return Buffer.byteLength(key, 'utf8') + Buffer.byteLength(serialized ?? 'null', 'utf8');
}

export interface MockChromeTab {
  id: number;
  active?: boolean;
  url?: string;
  title?: string;
}

export interface MockChromeEnvOptions {
  local?: Record<string, unknown>;
  sync?: Record<string, unknown>;
  manifestVersion?: string;
  uiLanguage?: string;
  extensionId?: string;
  tabs?: MockChromeTab[];
  permissionsGranted?: boolean;
  syncQuota?: {
    quotaBytes?: number;
    quotaBytesPerItem?: number;
    maxItems?: number;
  };
  onRuntimeSendMessage?: (message: unknown) => unknown | Promise<unknown>;
  onTabSendMessage?: (tabId: number, message: unknown) => unknown | Promise<unknown>;
}

type StorageChangeRecord = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type StorageChangeListener = (changes: StorageChangeRecord, areaName: string) => void;
type AreaChangeListener = (changes: StorageChangeRecord) => void;
type RuntimeMessageListener = (
  message: unknown,
  sender: Record<string, unknown>,
  sendResponse: (response?: unknown) => void
) => unknown;

function cloneValue<T>(val: T, jsonSafe: boolean): T {
  if (val === undefined) return val;
  if (jsonSafe) {
    const serialized = JSON.stringify(val);
    if (serialized === undefined) {
      throw new TypeError(`Value of type "${typeof val}" is not JSON-serializable`);
    }
    return JSON.parse(serialized) as T;
  }
  return structuredClone(val);
}

export interface MockChromeEnv {
  chrome: Record<string, any>;
  localStore: Record<string, unknown>;
  syncStore: Record<string, unknown>;
  createdTabs: Array<MockChromeTab & Record<string, unknown>>;
  updatedTabs: Array<{ tabId: number; props: Record<string, unknown> }>;
  reloadedTabs: number[];
  sentTabMessages: Array<{ tabId: number; message: unknown }>;
  badgeState: { text: string; color: string };
  counters: {
    localSetCalls: number;
    localRemoveCalls: number;
    syncSetCalls: number;
    syncRemoveCalls: number;
  };
  setAreaError: (area: 'local' | 'sync', err: Error | null) => void;
  setPermissionsGranted: (granted: boolean) => void;
  simulateRemoteSyncWrite: (
    patch: Record<string, unknown>,
    opts?: { removeKeys?: string[]; skipQuota?: boolean }
  ) => void;
  triggerAlarm: (name: string) => void;
  triggerInstalled: (reason?: 'install' | 'update' | 'chrome_update') => void;
  triggerStartup: () => void;
  install: () => void;
  restore: () => void;
}

export function createMockChromeEnv(
  options: MockChromeEnvOptions = {}
): MockChromeEnv {
  const localStore: Record<string, unknown> = options.local
    ? cloneValue(options.local, false)
    : {};
  const syncStore: Record<string, unknown> = options.sync
    ? cloneValue(options.sync, true)
    : {};

  const extensionId = options.extensionId ?? 'kxc-e2e-extension';
  const manifestVersion = options.manifestVersion ?? '0.2.0';
  const uiLanguage = options.uiLanguage ?? 'en';

  const quotaBytes = options.syncQuota?.quotaBytes ?? CHROME_SYNC_QUOTA_BYTES;
  const quotaBytesPerItem =
    options.syncQuota?.quotaBytesPerItem ?? CHROME_SYNC_QUOTA_BYTES_PER_ITEM;
  const maxItems = options.syncQuota?.maxItems ?? CHROME_SYNC_MAX_ITEMS;

  let permissionsGranted = options.permissionsGranted ?? true;
  const injectedErrors: { local: Error | null; sync: Error | null } = {
    local: null,
    sync: null,
  };

  const globalStorageListeners = new Set<StorageChangeListener>();
  const localAreaListeners = new Set<AreaChangeListener>();
  const syncAreaListeners = new Set<AreaChangeListener>();
  const runtimeMessageListeners = new Set<RuntimeMessageListener>();
  const installedListeners = new Set<(details: { reason: string }) => void>();
  const startupListeners = new Set<() => void>();
  const alarmListeners = new Set<(alarm: { name: string }) => void>();
  const tabRemovedListeners = new Set<(tabId: number) => void>();

  const alarmsMap = new Map<string, { name: string; periodInMinutes?: number; when?: number }>();
  const tabs: MockChromeTab[] = options.tabs
    ? options.tabs.map((t) => ({ ...t }))
    : [{ id: 7, active: true, url: 'https://x.com/home', title: 'Home / X' }];
  let nextTabId = tabs.reduce((m, t) => Math.max(m, t.id), 10) + 1;

  const createdTabs: Array<MockChromeTab & Record<string, unknown>> = [];
  const updatedTabs: Array<{ tabId: number; props: Record<string, unknown> }> = [];
  const reloadedTabs: number[] = [];
  const sentTabMessages: Array<{ tabId: number; message: unknown }> = [];
  const badgeState = { text: '', color: '' };
  const counters = {
    localSetCalls: 0,
    localRemoveCalls: 0,
    syncSetCalls: 0,
    syncRemoveCalls: 0,
  };

  function emitStorageChanges(area: 'local' | 'sync', changes: StorageChangeRecord) {
    if (Object.keys(changes).length === 0) return;
    const areaSet = area === 'local' ? localAreaListeners : syncAreaListeners;
    for (const listener of [...areaSet]) {
      listener(cloneValue(changes, area === 'sync'));
    }
    for (const listener of [...globalStorageListeners]) {
      listener(cloneValue(changes, area === 'sync'), area);
    }
  }

  function makeStorageArea(
    areaName: 'local' | 'sync',
    store: Record<string, unknown>,
    enforceSyncQuota: boolean
  ) {
    const areaListeners = areaName === 'local' ? localAreaListeners : syncAreaListeners;

    const areaApi: Record<string, unknown> = {
      async get(
        keys?: null | string | string[] | Record<string, unknown>,
        callback?: (items: Record<string, unknown>) => void
      ): Promise<Record<string, unknown>> {
        const result: Record<string, unknown> = {};
        if (keys === null || keys === undefined) {
          for (const [k, v] of Object.entries(store)) {
            result[k] = cloneValue(v, enforceSyncQuota);
          }
        } else if (typeof keys === 'string') {
          if (Object.prototype.hasOwnProperty.call(store, keys)) {
            result[keys] = cloneValue(store[keys], enforceSyncQuota);
          }
        } else if (Array.isArray(keys)) {
          for (const k of keys) {
            if (Object.prototype.hasOwnProperty.call(store, k)) {
              result[k] = cloneValue(store[k], enforceSyncQuota);
            }
          }
        } else if (typeof keys === 'object') {
          for (const [k, defaultVal] of Object.entries(keys)) {
            result[k] = Object.prototype.hasOwnProperty.call(store, k)
              ? cloneValue(store[k], enforceSyncQuota)
              : cloneValue(defaultVal, enforceSyncQuota);
          }
        }
        callback?.(result);
        return result;
      },

      async set(
        patch: Record<string, unknown>,
        callback?: () => void
      ): Promise<void> {
        if (areaName === 'local') counters.localSetCalls++;
        else counters.syncSetCalls++;

        const failWithError = (err: Error): void => {
          if (callback) {
            chromeObj.runtime.lastError = { message: err.message };
            try {
              callback();
            } finally {
              chromeObj.runtime.lastError = undefined;
            }
            return;
          }
          throw err;
        };

        const injectedErr = injectedErrors[areaName];
        if (injectedErr) {
          return failWithError(injectedErr);
        }

        // Atomic staging: serialize/clone EVERY entry before quota check or store mutation
        const staged = new Map<string, unknown>();
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) continue;
          let cloned: unknown;
          try {
            cloned = cloneValue(v, enforceSyncQuota);
          } catch (cloneErr) {
            const err =
              cloneErr instanceof Error
                ? cloneErr
                : new Error(`Failed to serialize storage value for key "${k}"`);
            return failWithError(err);
          }
          staged.set(k, cloned);
        }

        if (enforceSyncQuota) {
          // Atomic pre-check against exact staged values: per-item bytes, max items, total bytes
          const prospective: Record<string, unknown> = { ...store };
          for (const [k, v] of staged.entries()) {
            const itemBytes = computeChromeStorageItemBytes(k, v);
            if (itemBytes > quotaBytesPerItem) {
              return failWithError(
                new Error(
                  `QUOTA_BYTES_PER_ITEM quota exceeded for key "${k}" (${itemBytes} > ${quotaBytesPerItem})`
                )
              );
            }
            prospective[k] = v;
          }
          const prospectiveKeys = Object.keys(prospective);
          if (prospectiveKeys.length > maxItems) {
            return failWithError(
              new Error(
                `MAX_ITEMS quota exceeded (${prospectiveKeys.length} > ${maxItems})`
              )
            );
          }
          let totalBytes = 0;
          for (const k of prospectiveKeys) {
            totalBytes += computeChromeStorageItemBytes(k, prospective[k]);
          }
          if (totalBytes > quotaBytes) {
            return failWithError(
              new Error(
                `QUOTA_BYTES quota exceeded (${totalBytes} > ${quotaBytes})`
              )
            );
          }
        }

        const changes: StorageChangeRecord = {};
        for (const [k, newValue] of staged.entries()) {
          const hadKey = Object.prototype.hasOwnProperty.call(store, k);
          const oldValue = hadKey ? cloneValue(store[k], enforceSyncQuota) : undefined;
          store[k] = newValue;
          changes[k] = hadKey ? { oldValue, newValue } : { newValue };
        }
        emitStorageChanges(areaName, changes);
        callback?.();
      },

      async remove(
        keys: string | string[],
        callback?: () => void
      ): Promise<void> {
        if (areaName === 'local') counters.localRemoveCalls++;
        else counters.syncRemoveCalls++;

        const keyList = Array.isArray(keys) ? keys : [keys];
        const changes: StorageChangeRecord = {};
        for (const k of keyList) {
          if (Object.prototype.hasOwnProperty.call(store, k)) {
            changes[k] = { oldValue: cloneValue(store[k], enforceSyncQuota) };
            delete store[k];
          }
        }
        emitStorageChanges(areaName, changes);
        callback?.();
      },

      async clear(callback?: () => void): Promise<void> {
        const changes: StorageChangeRecord = {};
        for (const k of Object.keys(store)) {
          changes[k] = { oldValue: cloneValue(store[k], enforceSyncQuota) };
          delete store[k];
        }
        emitStorageChanges(areaName, changes);
        callback?.();
      },

      async getBytesInUse(
        keys?: null | string | string[],
        callback?: (bytes: number) => void
      ): Promise<number> {
        let keyList: string[];
        if (keys === null || keys === undefined) {
          keyList = Object.keys(store);
        } else if (typeof keys === 'string') {
          keyList = [keys];
        } else {
          keyList = keys;
        }
        let total = 0;
        for (const k of keyList) {
          if (Object.prototype.hasOwnProperty.call(store, k)) {
            total += computeChromeStorageItemBytes(k, store[k]);
          }
        }
        callback?.(total);
        return total;
      },

      onChanged: {
        addListener: (fn: AreaChangeListener) => areaListeners.add(fn),
        removeListener: (fn: AreaChangeListener) => areaListeners.delete(fn),
        hasListener: (fn: AreaChangeListener) => areaListeners.has(fn),
      },
    };

    if (enforceSyncQuota) {
      areaApi.QUOTA_BYTES = quotaBytes;
      areaApi.QUOTA_BYTES_PER_ITEM = quotaBytesPerItem;
      areaApi.MAX_ITEMS = maxItems;
      areaApi.MAX_WRITE_OPERATIONS_PER_HOUR = CHROME_SYNC_MAX_WRITES_PER_HOUR;
      areaApi.MAX_WRITE_OPERATIONS_PER_MINUTE = CHROME_SYNC_MAX_WRITES_PER_MINUTE;
    }

    return areaApi;
  }

  const chromeObj: Record<string, any> = {
    storage: {
      local: makeStorageArea('local', localStore, false),
      sync: makeStorageArea('sync', syncStore, true),
      onChanged: {
        addListener: (fn: StorageChangeListener) => globalStorageListeners.add(fn),
        removeListener: (fn: StorageChangeListener) => globalStorageListeners.delete(fn),
        hasListener: (fn: StorageChangeListener) => globalStorageListeners.has(fn),
      },
    },
    runtime: {
      id: extensionId,
      lastError: undefined as { message: string } | undefined,
      getManifest: () => ({
        manifest_version: 3,
        name: 'KeepXClean',
        version: manifestVersion,
      }),
      getURL: (relPath: string) =>
        `chrome-extension://${extensionId}/${relPath.replace(/^\/+/, '')}`,
      async sendMessage(message: unknown): Promise<unknown> {
        if (options.onRuntimeSendMessage) {
          return await options.onRuntimeSendMessage(message);
        }
        for (const listener of [...runtimeMessageListeners]) {
          let responded = false;
          let syncResponse: unknown;
          let resolveAsync!: (val: unknown) => void;
          const asyncPromise = new Promise<unknown>((resolve) => {
            resolveAsync = resolve;
          });
          const ret = listener(message, { id: extensionId }, (resp?: unknown) => {
            responded = true;
            syncResponse = resp;
            resolveAsync(resp);
          });
          if (responded) {
            return syncResponse;
          }
          if (ret === true) {
            return await asyncPromise;
          }
          if (ret && typeof (ret as Promise<unknown>).then === 'function') {
            return await (ret as Promise<unknown>);
          }
        }
        return undefined;
      },
      onMessage: {
        addListener: (fn: RuntimeMessageListener) => runtimeMessageListeners.add(fn),
        removeListener: (fn: RuntimeMessageListener) =>
          runtimeMessageListeners.delete(fn),
        hasListener: (fn: RuntimeMessageListener) => runtimeMessageListeners.has(fn),
      },
      onInstalled: {
        addListener: (fn: (details: { reason: string }) => void) =>
          installedListeners.add(fn),
        removeListener: (fn: (details: { reason: string }) => void) =>
          installedListeners.delete(fn),
      },
      onStartup: {
        addListener: (fn: () => void) => startupListeners.add(fn),
        removeListener: (fn: () => void) => startupListeners.delete(fn),
      },
    },
    alarms: {
      async create(name: string, info: { periodInMinutes?: number; when?: number } = {}) {
        alarmsMap.set(name, { name, ...info });
      },
      async get(name: string) {
        return alarmsMap.get(name);
      },
      async getAll() {
        return [...alarmsMap.values()];
      },
      async clear(name: string) {
        return alarmsMap.delete(name);
      },
      async clearAll() {
        alarmsMap.clear();
        return true;
      },
      onAlarm: {
        addListener: (fn: (alarm: { name: string }) => void) => alarmListeners.add(fn),
        removeListener: (fn: (alarm: { name: string }) => void) =>
          alarmListeners.delete(fn),
      },
    },
    tabs: {
      async query(queryInfo: { url?: string | string[]; active?: boolean } = {}) {
        return tabs.filter((tab) => {
          if (queryInfo.active !== undefined && Boolean(tab.active) !== queryInfo.active) {
            return false;
          }
          if (queryInfo.url) {
            const patterns = Array.isArray(queryInfo.url)
              ? queryInfo.url
              : [queryInfo.url];
            const url = tab.url ?? '';
            return patterns.some((pat) => {
              const escaped = pat
                .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*');
              return new RegExp(`^${escaped}$`).test(url);
            });
          }
          return true;
        });
      },
      async create(props: Record<string, unknown>) {
        const created: MockChromeTab & Record<string, unknown> = {
          id: nextTabId++,
          active: true,
          ...props,
        };
        tabs.push(created);
        createdTabs.push(created);
        return created;
      },
      async update(tabId: number, props: Record<string, unknown>) {
        updatedTabs.push({ tabId, props: { ...props } });
        const found = tabs.find((t) => t.id === tabId);
        if (found) {
          Object.assign(found, props);
          return found;
        }
        return { id: tabId, ...props };
      },
      async reload(tabId: number) {
        reloadedTabs.push(tabId);
      },
      async sendMessage(tabId: number, message: unknown) {
        sentTabMessages.push({ tabId, message });
        if (options.onTabSendMessage) {
          return await options.onTabSendMessage(tabId, message);
        }
        return { ok: true };
      },
      onRemoved: {
        addListener: (fn: (tabId: number) => void) => tabRemovedListeners.add(fn),
        removeListener: (fn: (tabId: number) => void) => tabRemovedListeners.delete(fn),
      },
    },
    permissions: {
      async contains() {
        return permissionsGranted;
      },
      async request() {
        return permissionsGranted;
      },
      async remove() {
        return true;
      },
      async getAll() {
        return { permissions: ['storage', 'alarms'], origins: [] };
      },
    },
    action: {
      async setBadgeText(details: { text?: string }) {
        badgeState.text = details.text ?? '';
      },
      async getBadgeText() {
        return badgeState.text;
      },
      async setBadgeBackgroundColor(details: { color?: string }) {
        badgeState.color = details.color ?? '';
      },
      async getBadgeBackgroundColor() {
        return badgeState.color;
      },
    },
    i18n: {
      getUILanguage: () => uiLanguage,
    },
  };

  let installed = false;
  let prevChromeDesc: PropertyDescriptor | undefined;

  return {
    chrome: chromeObj,
    localStore,
    syncStore,
    createdTabs,
    updatedTabs,
    reloadedTabs,
    sentTabMessages,
    badgeState,
    counters,
    setAreaError(area, err) {
      injectedErrors[area] = err;
    },
    setPermissionsGranted(granted) {
      permissionsGranted = granted;
    },
    simulateRemoteSyncWrite(patch, opts = {}) {
      // Stage & validate every entry before mutating syncStore
      const staged = new Map<string, unknown>();
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        staged.set(k, cloneValue(v, true));
      }
      if (!opts.skipQuota) {
        const prospective: Record<string, unknown> = { ...syncStore };
        for (const rk of opts.removeKeys ?? []) {
          delete prospective[rk];
        }
        for (const [k, v] of staged.entries()) {
          const itemBytes = computeChromeStorageItemBytes(k, v);
          if (itemBytes > quotaBytesPerItem) {
            throw new Error(`QUOTA_BYTES_PER_ITEM exceeded for "${k}"`);
          }
          prospective[k] = v;
        }
        const keys = Object.keys(prospective);
        if (keys.length > maxItems) {
          throw new Error(`MAX_ITEMS exceeded (${keys.length} > ${maxItems})`);
        }
        let total = 0;
        for (const k of keys) {
          total += computeChromeStorageItemBytes(k, prospective[k]);
        }
        if (total > quotaBytes) {
          throw new Error(`QUOTA_BYTES exceeded (${total} > ${quotaBytes})`);
        }
      }
      const changes: StorageChangeRecord = {};
      for (const rk of opts.removeKeys ?? []) {
        if (Object.prototype.hasOwnProperty.call(syncStore, rk)) {
          changes[rk] = { oldValue: cloneValue(syncStore[rk], true) };
          delete syncStore[rk];
        }
      }
      for (const [k, newValue] of staged.entries()) {
        const hadKeyBeforePatch = Object.prototype.hasOwnProperty.call(syncStore, k);
        const hadKeyBeforeRemove = Object.prototype.hasOwnProperty.call(changes, k);
        const hadKey = hadKeyBeforePatch || hadKeyBeforeRemove;
        const oldValue = hadKeyBeforePatch
          ? cloneValue(syncStore[k], true)
          : hadKeyBeforeRemove
            ? changes[k].oldValue
            : undefined;
        syncStore[k] = newValue;
        changes[k] = hadKey ? { oldValue, newValue } : { newValue };
      }
      emitStorageChanges('sync', changes);
    },
    triggerAlarm(name) {
      for (const fn of [...alarmListeners]) {
        fn({ name });
      }
    },
    triggerInstalled(reason = 'install') {
      for (const fn of [...installedListeners]) {
        fn({ reason });
      }
    },
    triggerStartup() {
      for (const fn of [...startupListeners]) {
        fn();
      }
    },
    install() {
      if (installed) return;
      prevChromeDesc = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
      Object.defineProperty(globalThis, 'chrome', {
        value: chromeObj,
        configurable: true,
        writable: true,
        enumerable: true,
      });
      installed = true;
    },
    restore() {
      if (!installed) return;
      if (prevChromeDesc) {
        Object.defineProperty(globalThis, 'chrome', prevChromeDesc);
      } else {
        delete (globalThis as Record<string, unknown>).chrome;
      }
      prevChromeDesc = undefined;
      installed = false;
    },
  };
}

const VIRTUAL_DOM_GLOBAL_KEYS = [
  'window',
  'document',
  'location',
  'history',
  'navigator',
  'localStorage',
  'matchMedia',
  'HTMLElement',
  'Element',
  'Node',
  'HTMLCanvasElement',
  'Image',
  'MutationObserver',
  'CustomEvent',
  'Event',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
] as const;

export function installVirtualDomGlobals(
  vb: VirtualBrowserInstance
): () => void {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const win = vb.window as Record<string, unknown>;

  for (const key of VIRTUAL_DOM_GLOBAL_KEYS) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    let value: unknown;
    if (key === 'window') {
      value = win;
    } else if (key === 'requestAnimationFrame') {
      value =
        win.requestAnimationFrame ??
        ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0));
    } else if (key === 'cancelAnimationFrame') {
      value =
        win.cancelAnimationFrame ?? ((id: number) => clearTimeout(id));
    } else {
      value = win[key];
    }
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const key of VIRTUAL_DOM_GLOBAL_KEYS) {
      const prev = saved.get(key);
      if (prev) {
        Object.defineProperty(globalThis, key, prev);
      } else {
        delete (globalThis as Record<string, unknown>)[key];
      }
    }
  };
}

export interface BackgroundHarness {
  chromeEnv: MockChromeEnv;
  sendCommand: <T = unknown>(
    action: Record<string, unknown>
  ) => Promise<{ ok: boolean; data?: T; error?: string; code?: string }>;
  fireInstalled: (reason?: 'install' | 'update' | 'chrome_update') => Promise<void>;
  fireStartup: () => Promise<void>;
  flush: (ms?: number) => Promise<void>;
  cleanup: () => Promise<void>;
}

export async function bootBackgroundHarness(
  options: MockChromeEnvOptions & { skipInitialFlush?: boolean } = {}
): Promise<BackgroundHarness> {
  const chromeEnv = createMockChromeEnv(options);
  chromeEnv.install();

  const prevDefineBgDesc = Object.getOwnPropertyDescriptor(
    globalThis,
    'defineBackground'
  );
  Object.defineProperty(globalThis, 'defineBackground', {
    value: (fn: () => void) => fn,
    configurable: true,
    writable: true,
  });

  try {
    const bgMod = await requireModule<{ default: () => void }>(
      'apps/extension/entrypoints/background.ts',
      'extension background entrypoint'
    );
    bgMod.default();
  } catch (err) {
    if (prevDefineBgDesc) {
      Object.defineProperty(globalThis, 'defineBackground', prevDefineBgDesc);
    } else {
      delete (globalThis as Record<string, unknown>).defineBackground;
    }
    chromeEnv.restore();
    throw err;
  }

  const flush = async (ms = 20) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  };

  if (!options.skipInitialFlush) {
    await flush(20);
  }

  let cleaned = false;
  return {
    chromeEnv,
    async sendCommand<T = unknown>(action: Record<string, unknown>) {
      const resp = (await chromeEnv.chrome.runtime.sendMessage({
        type: 'KXC_COMMAND',
        action,
      })) as { ok: boolean; data?: T; error?: string; code?: string };
      return resp;
    },
    async fireInstalled(reason = 'install') {
      chromeEnv.triggerInstalled(reason);
      await flush(20);
    },
    async fireStartup() {
      chromeEnv.triggerStartup();
      await flush(20);
    },
    flush,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      // Best-effort cloudSync.disable so M3 1.5s push debounce timers never fire after restore()
      const syncMeta = chromeEnv.localStore.kxc_cloud_sync_v1 as
        | { enabled?: boolean }
        | undefined;
      if (syncMeta?.enabled) {
        chromeEnv.setAreaError('local', null);
        chromeEnv.setAreaError('sync', null);
        try {
          await chromeEnv.chrome.runtime.sendMessage({
            type: 'KXC_COMMAND',
            action: { type: 'cloudSync.disable' },
          });
        } catch {
          // Ignore if M3 cloudSync.disable is not yet implemented or fails
        }
      }
      await flush(10);
      try {
        const i18nState = await import(
          pathToFileURL(
            path.resolve(REPO_ROOT, 'apps/extension/src/i18n/state.ts')
          ).href
        );
        i18nState.setActiveLocaleSetting?.('auto');
      } catch {
        // Ignore if i18n state not loaded
      }
      if (prevDefineBgDesc) {
        Object.defineProperty(globalThis, 'defineBackground', prevDefineBgDesc);
      } else {
        delete (globalThis as Record<string, unknown>).defineBackground;
      }
      chromeEnv.restore();
    },
  };
}

export interface PageInterceptorHarness {
  browser: VirtualBrowserInstance;
  processedEvents: Array<Record<string, unknown>>;
  healthEvents: Array<Record<string, unknown>>;
  setNow: (ms: number) => void;
  advanceNow: (deltaMs: number) => void;
  syncState: (config: unknown, crowdSnapshot?: unknown) => void;
  sendGraphqlFetch: (
    url: string,
    body: unknown,
    opts?: { status?: number; rawText?: boolean }
  ) => Promise<{ status: number; text: string }>;
  cleanup: () => void;
}

export async function bootPageInterceptorHarness(
  options: {
    url?: string;
    startTimeMs?: number;
    config?: unknown;
    crowdSnapshot?: unknown;
  } = {}
): Promise<PageInterceptorHarness> {
  const initialStorage: Record<string, string> = {};
  if (options.config || options.crowdSnapshot) {
    initialStorage.__kxc_fast_boot_cache_v1__ = JSON.stringify({
      ...(options.config ? { config: options.config } : {}),
      ...(options.crowdSnapshot ? { crowdSnapshot: options.crowdSnapshot } : {}),
    });
  }

  const browser = createVirtualBrowser({
    url: options.url ?? 'https://x.com/home',
    storage: initialStorage,
  });

  const restoreDomGlobals = installVirtualDomGlobals(browser);

  const prevDefineCsDesc = Object.getOwnPropertyDescriptor(
    globalThis,
    'defineContentScript'
  );
  Object.defineProperty(globalThis, 'defineContentScript', {
    value: (def: unknown) => def,
    configurable: true,
    writable: true,
  });

  let nowMs = options.startTimeMs ?? 1_700_000_000_000;
  const origDateNow = Date.now;
  Date.now = () => nowMs;
  browser.window.Date.now = () => nowMs;

  const responseQueue: Array<{ text: string; status: number }> = [];
  browser.window.fetch = async (
    _input: unknown,
    _init?: unknown
  ): Promise<Response> => {
    const next = responseQueue.shift() ?? { text: '{}', status: 200 };
    return new Response(next.text, {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    });
  };

  const processedEvents: Array<Record<string, unknown>> = [];
  const healthEvents: Array<Record<string, unknown>> = [];

  browser.window.addEventListener('KXC_GRAPHQL_PROCESSED', (ev: CustomEvent) => {
    processedEvents.push((ev.detail ?? {}) as Record<string, unknown>);
  });
  browser.window.addEventListener('KXC_PARSE_HEALTH', (ev: CustomEvent) => {
    healthEvents.push((ev.detail ?? {}) as Record<string, unknown>);
  });

  try {
    const piMod = await requireModule<{ default: { main: () => void } }>(
      'apps/extension/entrypoints/page-interceptor.content.ts',
      'MAIN-world page-interceptor entrypoint'
    );
    piMod.default.main();
  } catch (err) {
    Date.now = origDateNow;
    if (prevDefineCsDesc) {
      Object.defineProperty(globalThis, 'defineContentScript', prevDefineCsDesc);
    } else {
      delete (globalThis as Record<string, unknown>).defineContentScript;
    }
    restoreDomGlobals();
    browser.cleanup();
    throw err;
  }

  let cleaned = false;
  return {
    browser,
    processedEvents,
    healthEvents,
    setNow(ms: number) {
      nowMs = ms;
    },
    advanceNow(deltaMs: number) {
      nowMs += deltaMs;
    },
    syncState(config: unknown, crowdSnapshot?: unknown) {
      browser.window.dispatchEvent(
        new browser.window.CustomEvent('KXC_SYNC_STATE', {
          detail: {
            config,
            ...(crowdSnapshot ? { crowdSnapshot } : {}),
          },
        })
      );
    },
    async sendGraphqlFetch(url, body, opts = {}) {
      const text =
        opts.rawText || typeof body === 'string'
          ? String(body)
          : JSON.stringify(body);
      responseQueue.push({ text, status: opts.status ?? 200 });
      const res: Response = await browser.window.fetch(url);
      const outText = await res.text();
      return { status: res.status, text: outText };
    },
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      Date.now = origDateNow;
      if (prevDefineCsDesc) {
        Object.defineProperty(globalThis, 'defineContentScript', prevDefineCsDesc);
      } else {
        delete (globalThis as Record<string, unknown>).defineContentScript;
      }
      restoreDomGlobals();
      browser.cleanup();
    },
  };
}

export function installDialogModalPolyfill(win: any): () => void {
  const prevShadowRoot = Object.getOwnPropertyDescriptor(
    globalThis,
    'ShadowRoot'
  );
  const prevHtmlDialog = Object.getOwnPropertyDescriptor(
    globalThis,
    'HTMLDialogElement'
  );
  let installedShadowRoot = false;
  let installedHtmlDialog = false;

  if (
    typeof (globalThis as Record<string, unknown>).ShadowRoot === 'undefined'
  ) {
    Object.defineProperty(globalThis, 'ShadowRoot', {
      value: win.ShadowRoot ?? class MockShadowRoot {},
      configurable: true,
      writable: true,
    });
    installedShadowRoot = true;
  }
  if (
    typeof (globalThis as Record<string, unknown>).HTMLDialogElement ===
      'undefined' &&
    win.HTMLDialogElement
  ) {
    Object.defineProperty(globalThis, 'HTMLDialogElement', {
      value: win.HTMLDialogElement,
      configurable: true,
      writable: true,
    });
    installedHtmlDialog = true;
  }

  let dialogProto: any = null;
  let prevShowModal: PropertyDescriptor | undefined;
  let prevClose: PropertyDescriptor | undefined;
  let installedShowModal = false;
  let installedClose = false;

  try {
    const probeDialog = win.document.createElement('dialog');
    dialogProto = Object.getPrototypeOf(probeDialog);
    prevShowModal = Object.getOwnPropertyDescriptor(dialogProto, 'showModal');
    prevClose = Object.getOwnPropertyDescriptor(dialogProto, 'close');

    if (typeof dialogProto.showModal !== 'function') {
      Object.defineProperty(dialogProto, 'showModal', {
        value: function showModal(this: any) {
          this.open = true;
          this.setAttribute('open', '');
        },
        configurable: true,
        writable: true,
      });
      installedShowModal = true;
    }
    if (typeof dialogProto.close !== 'function') {
      Object.defineProperty(dialogProto, 'close', {
        value: function close(this: any, returnValue?: string) {
          const wasOpen = Boolean(this.open || this.hasAttribute?.('open'));
          this.open = false;
          this.removeAttribute('open');
          if (returnValue !== undefined) {
            this.returnValue = String(returnValue);
          }
          if (wasOpen) {
            this.dispatchEvent(new win.Event('close'));
          }
        },
        configurable: true,
        writable: true,
      });
      installedClose = true;
    }
  } catch (err) {
    if (installedClose && dialogProto) {
      if (prevClose) Object.defineProperty(dialogProto, 'close', prevClose);
      else delete dialogProto.close;
    }
    if (installedShowModal && dialogProto) {
      if (prevShowModal) {
        Object.defineProperty(dialogProto, 'showModal', prevShowModal);
      } else {
        delete dialogProto.showModal;
      }
    }
    if (installedHtmlDialog) {
      if (prevHtmlDialog) {
        Object.defineProperty(globalThis, 'HTMLDialogElement', prevHtmlDialog);
      } else {
        delete (globalThis as Record<string, unknown>).HTMLDialogElement;
      }
    }
    if (installedShadowRoot) {
      if (prevShadowRoot) {
        Object.defineProperty(globalThis, 'ShadowRoot', prevShadowRoot);
      } else {
        delete (globalThis as Record<string, unknown>).ShadowRoot;
      }
    }
    throw err;
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (installedClose && dialogProto) {
      if (prevClose) {
        Object.defineProperty(dialogProto, 'close', prevClose);
      } else {
        delete dialogProto.close;
      }
    }
    if (installedShowModal && dialogProto) {
      if (prevShowModal) {
        Object.defineProperty(dialogProto, 'showModal', prevShowModal);
      } else {
        delete dialogProto.showModal;
      }
    }
    if (installedHtmlDialog) {
      if (prevHtmlDialog) {
        Object.defineProperty(globalThis, 'HTMLDialogElement', prevHtmlDialog);
      } else {
        delete (globalThis as Record<string, unknown>).HTMLDialogElement;
      }
    }
    if (installedShadowRoot) {
      if (prevShadowRoot) {
        Object.defineProperty(globalThis, 'ShadowRoot', prevShadowRoot);
      } else {
        delete (globalThis as Record<string, unknown>).ShadowRoot;
      }
    }
  };
}

export interface MountedExtensionComponent {
  container: HTMLElement;
  document: Document;
  window: any;
  chromeEnv: MockChromeEnv;
  canvasRecorder: MockCanvas2DRecorder;
  sentCommands: Array<Record<string, unknown>>;
  clipboardWrites: unknown[];
  objectUrls: string[];
  createdObjectUrls: Array<{ url: string; obj: unknown }>;
  act: (fn: () => void | Promise<void>) => Promise<void>;
  click: (el: Element) => Promise<void>;
  cleanup: () => Promise<void>;
}

export async function mountExtensionComponent(
  componentLoader: () => Promise<React.ComponentType<any>>,
  initialState: Record<string, unknown>,
  options: {
    url?: string;
    onCommand?: (
      action: Record<string, unknown>,
      state: Record<string, unknown>
    ) => unknown | Promise<unknown>;
  } = {}
): Promise<MountedExtensionComponent> {
  const extRequire = createRequire(
    path.resolve(REPO_ROOT, 'apps/extension/package.json')
  );
  const React = extRequire('react') as typeof import('react') & {
    act: (cb: () => void | Promise<void>) => Promise<void>;
  };
  const ReactDOMClient = extRequire('react-dom/client') as {
    createRoot: (container: Element) => {
      render: (node: unknown) => void;
      unmount: () => void;
    };
  };

  const currentState = structuredClone(initialState);

  const browser = createVirtualBrowser({
    url: options.url ?? 'chrome-extension://kxc-e2e-extension/options.html',
  });
  const restoreDomGlobals = installVirtualDomGlobals(browser);
  let restoreDialogModal: () => void;
  try {
    restoreDialogModal = installDialogModalPolyfill(browser.window);
  } catch (err) {
    restoreDomGlobals();
    browser.cleanup();
    throw err;
  }
  let canvasRecorder: MockCanvas2DRecorder;
  try {
    canvasRecorder = installMockCanvas2D(browser.window, {
      autoLoadImages: true,
    });
  } catch (err) {
    restoreDialogModal();
    restoreDomGlobals();
    browser.cleanup();
    throw err;
  }

  const clipboardWrites: unknown[] = [];
  const objectUrls: string[] = [];
  const createdObjectUrls: Array<{ url: string; obj: unknown }> = [];

  const prevReactDesc = Object.getOwnPropertyDescriptor(globalThis, 'React');
  const prevActEnvDesc = Object.getOwnPropertyDescriptor(
    globalThis,
    'IS_REACT_ACT_ENVIRONMENT'
  );
  const prevClipboardItemDesc = Object.getOwnPropertyDescriptor(
    globalThis,
    'ClipboardItem'
  );
  const prevCreateObjUrl = URL.createObjectURL;
  const prevRevokeObjUrl = URL.revokeObjectURL;

  Object.defineProperty(globalThis, 'React', {
    value: React,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    value: true,
    configurable: true,
    writable: true,
  });

  class MockClipboardItem {
    items: Record<string, unknown>;
    types: string[];
    constructor(items: Record<string, unknown>) {
      this.items = items;
      this.types = Object.keys(items);
    }
    async getType(type: string): Promise<unknown> {
      const item = this.items[type];
      return typeof (item as PromiseLike<unknown>)?.then === 'function'
        ? await item
        : item;
    }
  }
  Object.defineProperty(globalThis, 'ClipboardItem', {
    value: MockClipboardItem,
    configurable: true,
    writable: true,
  });
  browser.window.ClipboardItem = MockClipboardItem;

  Object.defineProperty(browser.window.navigator, 'clipboard', {
    value: {
      write: async (items: unknown[]) => {
        clipboardWrites.push(items);
      },
      writeText: async (text: string) => {
        clipboardWrites.push(text);
      },
    },
    configurable: true,
  });

  const mockCreateObjectUrl = (obj: unknown) => {
    const url = `blob:kxc-e2e-${objectUrls.length + 1}`;
    objectUrls.push(url);
    createdObjectUrls.push({ url, obj });
    return url;
  };
  const mockRevokeObjectUrl = (_url: string) => {};
  URL.createObjectURL = mockCreateObjectUrl as typeof URL.createObjectURL;
  URL.revokeObjectURL = mockRevokeObjectUrl;
  if (browser.window.URL) {
    browser.window.URL.createObjectURL = mockCreateObjectUrl;
    browser.window.URL.revokeObjectURL = mockRevokeObjectUrl;
  }

  // Prevent JSDOM "Not implemented: navigation" on <a download> click
  const origAnchorClick = browser.window.HTMLAnchorElement?.prototype?.click;
  if (browser.window.HTMLAnchorElement?.prototype) {
    browser.window.HTMLAnchorElement.prototype.click = function () {};
  }

  const sentCommands: Array<Record<string, unknown>> = [];

  const chromeEnv = createMockChromeEnv({
    onRuntimeSendMessage: async (msg: unknown) => {
      const m = msg as { type?: string; action?: Record<string, unknown> };
      if (m?.type === 'KXC_COMMAND' && m.action) {
        sentCommands.push(m.action);
        if (m.action.type === 'state.get') {
          return { ok: true, data: structuredClone(currentState) };
        }
        if (options.onCommand) {
          const data = await options.onCommand(m.action, currentState);
          return { ok: true, data };
        }
        return { ok: true, data: undefined };
      }
      return { ok: true, data: undefined };
    },
  });
  chromeEnv.install();

  let root: {
    render: (node: unknown) => void;
    unmount: () => void;
  } | null = null;
  let cleaned = false;

  const cleanupInternal = async () => {
    if (cleaned) return;
    cleaned = true;
    if (root) {
      try {
        await React.act(async () => {
          root!.unmount();
        });
      } catch {
        // Best-effort unmount
      }
      root = null;
    }
    if (browser.window.HTMLAnchorElement?.prototype && origAnchorClick) {
      browser.window.HTMLAnchorElement.prototype.click = origAnchorClick;
    }
    URL.createObjectURL = prevCreateObjUrl;
    URL.revokeObjectURL = prevRevokeObjUrl;
    if (prevClipboardItemDesc) {
      Object.defineProperty(globalThis, 'ClipboardItem', prevClipboardItemDesc);
    } else {
      delete (globalThis as Record<string, unknown>).ClipboardItem;
    }
    if (prevReactDesc) {
      Object.defineProperty(globalThis, 'React', prevReactDesc);
    } else {
      delete (globalThis as Record<string, unknown>).React;
    }
    if (prevActEnvDesc) {
      Object.defineProperty(
        globalThis,
        'IS_REACT_ACT_ENVIRONMENT',
        prevActEnvDesc
      );
    } else {
      delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
    }
    try {
      const i18nState = await import(
        pathToFileURL(
          path.resolve(REPO_ROOT, 'apps/extension/src/i18n/state.ts')
        ).href
      );
      i18nState.setActiveLocaleSetting?.('auto');
    } catch {
      // Ignore
    }
    canvasRecorder.restore();
    restoreDialogModal();
    chromeEnv.restore();
    restoreDomGlobals();
    browser.cleanup();
  };

  let container: HTMLElement;
  try {
    const storeMod = await requireModule<{
      reload: () => Promise<void>;
    }>('apps/extension/src/state/store.ts', 'extension UI store');

    const Component = await componentLoader();
    container = browser.document.getElementById('root') as HTMLElement;
    root = ReactDOMClient.createRoot(container);

    await React.act(async () => {
      await storeMod.reload();
      root!.render(React.createElement(Component));
    });
    // Flush any post-mount effects / reload subscribers
    await React.act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
  } catch (err) {
    await cleanupInternal();
    throw err;
  }

  return {
    container,
    document: browser.document,
    window: browser.window,
    chromeEnv,
    canvasRecorder,
    sentCommands,
    clipboardWrites,
    objectUrls,
    createdObjectUrls,
    async act(fn) {
      await React.act(async () => {
        await fn();
      });
    },
    async click(el) {
      await React.act(async () => {
        el.dispatchEvent(
          new browser.window.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
          })
        );
        await new Promise((r) => setTimeout(r, 25));
      });
    },
    cleanup: cleanupInternal,
  };
}

// ============================================================================
// Section 4: Fast In-Memory SQLite D1 Adapter (Lazy `node:sqlite`)
// ============================================================================

export interface SqliteD1Meta {
  duration: number;
  changes: number;
  last_row_id: number;
  changed_db: boolean;
  size_after: number;
  rows_read: number;
  rows_written: number;
}

export interface SqliteD1Result<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta: SqliteD1Meta;
}

export interface SqliteD1PreparedStatement {
  bind: (...values: unknown[]) => SqliteD1PreparedStatement;
  first: <T = Record<string, unknown>>(colName?: string) => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<SqliteD1Result<T>>;
  run: () => Promise<SqliteD1Result<never>>;
  raw: <T = unknown[]>(options?: { columnNames?: boolean }) => Promise<T[]>;
  _sql: string;
  _params: unknown[];
}

export interface SqliteD1Adapter {
  prepare: (sql: string) => SqliteD1PreparedStatement;
  batch: <T = Record<string, unknown>>(
    statements: SqliteD1PreparedStatement[]
  ) => Promise<Array<SqliteD1Result<T>>>;
  exec: (sql: string) => Promise<{ count: number; duration: number }>;
  close: () => void;
}

function normalizeSqlParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

type SqlStatementKind = 'read' | 'write' | 'write_returning';

function stripSqlLiteralsAndComments(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    // Line comment: -- ...\n
    if (ch === '-' && sql[i + 1] === '-') {
      i += 2;
      while (i < n && sql[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    // Block comment: /* ... */
    if (ch === '/' && sql[i + 1] === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    // Single-quoted SQL string literal: '...' with '' escape
    if (ch === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += ' ';
      continue;
    }
    // Quoted SQL identifiers ("...", `...`, [...]) -> safe placeholder token
    // (never matches keywords like RETURNING, yet preserves CTE name slots after WITH)
    if (ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < n) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out += ' _id_ ';
      continue;
    }
    if (ch === '[') {
      i++;
      while (i < n && sql[i] !== ']') i++;
      if (i < n) i++;
      out += ' _id_ ';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function extractTopLevelSql(sanitized: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < sanitized.length; i++) {
    const ch = sanitized[i];
    if (ch === '(') {
      depth++;
      out += ' ';
    } else if (ch === ')') {
      if (depth > 0) depth--;
      out += ' ';
    } else if (depth === 0) {
      out += ch;
    }
  }
  return out;
}

function findMainSqlVerbAfterWith(sanitized: string): string {
  let pos = 0;
  const n = sanitized.length;
  const skipWs = () => {
    while (pos < n && /\s/.test(sanitized[pos])) pos++;
  };
  const readWord = (): string => {
    skipWs();
    const start = pos;
    while (pos < n && /[A-Za-z0-9_$]/.test(sanitized[pos])) pos++;
    return sanitized.slice(start, pos).toUpperCase();
  };
  const skipBalancedParens = (): boolean => {
    skipWs();
    if (sanitized[pos] !== '(') return false;
    let depth = 0;
    while (pos < n) {
      if (sanitized[pos] === '(') depth++;
      else if (sanitized[pos] === ')') {
        depth--;
        if (depth === 0) {
          pos++;
          return true;
        }
      }
      pos++;
    }
    return false;
  };

  if (readWord() !== 'WITH') return '';
  skipWs();
  const saveRecPos = pos;
  if (readWord() !== 'RECURSIVE') pos = saveRecPos;

  while (pos < n) {
    if (!readWord()) return '';
    skipWs();
    if (sanitized[pos] === '(') {
      if (!skipBalancedParens()) return '';
    }
    if (readWord() !== 'AS') return '';
    skipWs();
    const saveMatPos = pos;
    let nextW = readWord();
    if (nextW === 'NOT') {
      nextW = readWord();
    }
    if (nextW !== 'MATERIALIZED') {
      pos = saveMatPos;
    }
    if (!skipBalancedParens()) return '';
    skipWs();
    if (sanitized[pos] === ',') {
      pos++;
      continue;
    }
    break;
  }
  return readWord();
}

function classifySqlStatement(sql: string): SqlStatementKind {
  const sanitized = stripSqlLiteralsAndComments(sql).trim();
  const leadMatch = sanitized.match(/^([A-Za-z]+)/);
  const leadVerb = leadMatch ? leadMatch[1].toUpperCase() : '';
  const mainVerb =
    leadVerb === 'WITH' ? findMainSqlVerbAfterWith(sanitized) : leadVerb;

  if (
    mainVerb === 'SELECT' ||
    mainVerb === 'PRAGMA' ||
    mainVerb === 'EXPLAIN' ||
    mainVerb === 'VALUES'
  ) {
    return 'read';
  }
  const topLevel = extractTopLevelSql(sanitized);
  if (/\bRETURNING\b/i.test(topLevel)) {
    return 'write_returning';
  }
  return 'write';
}

function toPlainRow<T>(row: unknown): T {
  if (row && typeof row === 'object') {
    return { ...(row as Record<string, unknown>) } as T;
  }
  return row as T;
}

export function createSqliteD1Adapter(): SqliteD1Adapter {
  const localRequire = createRequire(__filename);
  const { DatabaseSync } = localRequire('node:sqlite') as {
    DatabaseSync: new (location: string) => {
      prepare: (sql: string) => {
        get: (...params: unknown[]) => unknown;
        all: (...params: unknown[]) => unknown[];
        run: (...params: unknown[]) => {
          changes?: number | bigint;
          lastInsertRowid?: number | bigint;
        };
      };
      exec: (sql: string) => void;
      close: () => void;
    };
  };

  const db = new DatabaseSync(':memory:');

  function executeStatementSync<T = Record<string, unknown>>(
    sql: string,
    params: unknown[]
  ): SqliteD1Result<T> {
    const start = Date.now();
    const stmt = db.prepare(sql);
    const bound = params.map(normalizeSqlParam);
    const kind = classifySqlStatement(sql);

    if (kind === 'read') {
      const rawRows = stmt.all(...bound);
      const rows = rawRows.map((r) => toPlainRow<T>(r));
      return {
        success: true,
        results: rows,
        meta: {
          duration: Date.now() - start,
          changes: 0,
          last_row_id: 0,
          changed_db: false,
          size_after: 0,
          rows_read: rows.length,
          rows_written: 0,
        },
      };
    }

    if (kind === 'write_returning') {
      const rawRows = stmt.all(...bound);
      const rows = rawRows.map((r) => toPlainRow<T>(r));
      const writeStats = db
        .prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id')
        .get() as { changes?: number | bigint; last_row_id?: number | bigint } | undefined;
      const changes = Number(writeStats?.changes ?? 0);
      const lastRowId = Number(writeStats?.last_row_id ?? 0);
      return {
        success: true,
        results: rows,
        meta: {
          duration: Date.now() - start,
          changes,
          last_row_id: lastRowId,
          changed_db: changes > 0,
          size_after: 0,
          rows_read: rows.length,
          rows_written: changes,
        },
      };
    }

    const res = stmt.run(...bound);
    const changes = Number(res.changes ?? 0);
    return {
      success: true,
      results: [],
      meta: {
        duration: Date.now() - start,
        changes,
        last_row_id: Number(res.lastInsertRowid ?? 0),
        changed_db: changes > 0,
        size_after: 0,
        rows_read: 0,
        rows_written: changes,
      },
    };
  }

  function makePrepared(
    sql: string,
    params: unknown[] = []
  ): SqliteD1PreparedStatement {
    return {
      _sql: sql,
      _params: params,
      bind(...values: unknown[]) {
        return makePrepared(sql, [...values]);
      },
      async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
        const stmt = db.prepare(sql);
        const bound = params.map(normalizeSqlParam);
        const raw = stmt.get(...bound);
        if (raw === undefined || raw === null) return null;
        const plain = toPlainRow<Record<string, unknown>>(raw);
        if (colName !== undefined) {
          return (plain[colName] ?? null) as T | null;
        }
        return plain as T;
      },
      async all<T = Record<string, unknown>>(): Promise<SqliteD1Result<T>> {
        return executeStatementSync<T>(sql, params);
      },
      async run(): Promise<SqliteD1Result<never>> {
        return executeStatementSync<never>(sql, params);
      },
      async raw<T = unknown[]>(
        options: { columnNames?: boolean } = {}
      ): Promise<T[]> {
        const stmt = db.prepare(sql);
        const bound = params.map(normalizeSqlParam);
        const rows = stmt
          .all(...bound)
          .map((r) => toPlainRow<Record<string, unknown>>(r));
        if (rows.length === 0) return [];
        const cols = Object.keys(rows[0]);
        const matrix: unknown[][] = rows.map((r) => cols.map((c) => r[c]));
        if (options.columnNames) {
          matrix.unshift(cols);
        }
        return matrix as T[];
      },
    };
  }

  return {
    prepare(sql: string) {
      return makePrepared(sql, []);
    },
    async batch<T = Record<string, unknown>>(
      statements: SqliteD1PreparedStatement[]
    ): Promise<Array<SqliteD1Result<T>>> {
      const results: Array<SqliteD1Result<T>> = [];
      db.exec('BEGIN');
      try {
        for (const stmt of statements) {
          results.push(executeStatementSync<T>(stmt._sql, stmt._params));
        }
        db.exec('COMMIT');
        return results;
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // Ignore rollback failure
        }
        throw err;
      }
    },
    async exec(sql: string) {
      const start = Date.now();
      db.exec(sql);
      const count = sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean).length;
      return { count, duration: Date.now() - start };
    },
    close() {
      db.close();
    },
  };
}

export async function applyServerMigrations(
  d1: SqliteD1Adapter,
  opts: {
    requireMigration0004?: boolean;
    upToPrefix?: string;
    fromPrefix?: string;
  } = {}
): Promise<string[]> {
  const migrationsDir = path.resolve(REPO_ROOT, 'apps/server/migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new AssertionError(
      '[v0.2.0 Contract Missing] Missing apps/server/migrations directory',
      migrationsDir,
      'ENOENT'
    );
  }
  const allFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (
    opts.requireMigration0004 &&
    !allFiles.some((f) => f.startsWith('0004'))
  ) {
    throw new AssertionError(
      '[v0.2.0 Contract Missing] Missing D1 migration 0004_cloud_keywords_lang_group.sql',
      '0004_cloud_keywords_lang_group.sql',
      allFiles
    );
  }

  const selected = allFiles.filter((f) => {
    if (opts.fromPrefix && f < opts.fromPrefix) return false;
    if (opts.upToPrefix && f > `${opts.upToPrefix}\uffff`) return false;
    return true;
  });

  for (const file of selected) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await d1.exec(sql);
  }
  return selected;
}

// ============================================================================
// Section 5: Canvas 2D Mock Recorder & Auto-Loading Image Shim
// ============================================================================

export const VALID_MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
export const PNG_MAGIC_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export interface MockCanvas2DRecorder {
  canvases: Array<{ width: number; height: number }>;
  fillStyles: string[];
  strokeStyles: string[];
  texts: Array<{ text: string; x: number; y: number; font: string; fillStyle: string }>;
  readonly allText: string;
  drawImages: Array<{ src: string; args: unknown[] }>;
  rects: Array<{ kind: 'fill' | 'stroke' | 'round' | 'clear'; x: number; y: number; w: number; h: number; style: string }>;
  calls: Array<{ method: string; args: unknown[] }>;
  toDataUrlCalls: Array<{
    type: string;
    width: number;
    height: number;
    dataUrl: string;
  }>;
  toBlobCalls: Array<{
    type: string;
    width: number;
    height: number;
    blob: Blob;
    bytes: Uint8Array;
  }>;
  pngMagicBytes: readonly number[];
  reset: () => void;
  restore: () => void;
}

export function installMockCanvas2D(
  win: any,
  opts: { autoLoadImages?: boolean } = {}
): MockCanvas2DRecorder {
  const proto = win.HTMLCanvasElement?.prototype;
  const origGetContextDesc = proto
    ? Object.getOwnPropertyDescriptor(proto, 'getContext')
    : undefined;
  const origToDataURLDesc = proto
    ? Object.getOwnPropertyDescriptor(proto, 'toDataURL')
    : undefined;
  const origToBlobDesc = proto
    ? Object.getOwnPropertyDescriptor(proto, 'toBlob')
    : undefined;
  const hadWinImage = Object.prototype.hasOwnProperty.call(win, 'Image');
  const origWinImageDesc = Object.getOwnPropertyDescriptor(win, 'Image');
  const origImage = win.Image;
  const prevGlobalImageDesc = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const hadWinCreateImageBitmap = Object.prototype.hasOwnProperty.call(
    win,
    'createImageBitmap'
  );
  const origWinCreateImageBitmapDesc = Object.getOwnPropertyDescriptor(
    win,
    'createImageBitmap'
  );
  let patchedGlobalImage = false;
  let patchedWinCreateImageBitmap = false;

  const pngBytes = Uint8Array.from(Buffer.from(VALID_MINIMAL_PNG_BASE64, 'base64'));
  const contextMap = new WeakMap<object, Record<string, unknown>>();

  const canvases: MockCanvas2DRecorder['canvases'] = [];
  const fillStyles: string[] = [];
  const strokeStyles: string[] = [];
  const texts: MockCanvas2DRecorder['texts'] = [];
  const drawImages: MockCanvas2DRecorder['drawImages'] = [];
  const rects: MockCanvas2DRecorder['rects'] = [];
  const calls: MockCanvas2DRecorder['calls'] = [];
  const toDataUrlCalls: MockCanvas2DRecorder['toDataUrlCalls'] = [];
  const toBlobCalls: MockCanvas2DRecorder['toBlobCalls'] = [];

  function formatCanvasStyle(style: unknown): string {
    if (typeof style === 'string') return style;
    if (
      style &&
      typeof style === 'object' &&
      Array.isArray((style as { _stops?: unknown })._stops)
    ) {
      const stops = (style as { _stops: string[] })._stops;
      return stops.length > 0 ? `gradient(${stops.join(',')})` : '[gradient]';
    }
    return '[gradient]';
  }

  function createGradient() {
    const stops: string[] = [];
    return {
      _stops: stops,
      addColorStop(_offset: number, color: string) {
        if (typeof color === 'string') {
          stops.push(color);
          fillStyles.push(color);
        }
      },
    };
  }

  function createContext(canvas: any) {
    let currentFillStyle: unknown = '#000000';
    let currentStrokeStyle: unknown = '#000000';
    let currentFont = '14px sans-serif';
    let currentLineDash: number[] = [];
    let pendingPathRects: Array<{
      shape: 'rect' | 'roundRect';
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];
    const stack: Array<{
      fillStyle: unknown;
      strokeStyle: unknown;
      font: string;
      lineWidth: number;
      globalAlpha: number;
      textAlign: string;
      textBaseline: string;
      lineDash: number[];
    }> = [];

    const ctx: Record<string, any> = {
      canvas,
      textAlign: 'start',
      textBaseline: 'alphabetic',
      direction: 'inherit',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      lineDashOffset: 0,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: 'rgba(0, 0, 0, 0)',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low',
      letterSpacing: '0px',
      filter: 'none',

      get fillStyle() {
        return currentFillStyle;
      },
      set fillStyle(val: unknown) {
        currentFillStyle = val;
        if (typeof val === 'string') fillStyles.push(val);
      },
      get strokeStyle() {
        return currentStrokeStyle;
      },
      set strokeStyle(val: unknown) {
        currentStrokeStyle = val;
        if (typeof val === 'string') strokeStyles.push(val);
      },
      get font() {
        return currentFont;
      },
      set font(val: string) {
        currentFont = String(val);
      },

      save() {
        calls.push({ method: 'save', args: [] });
        stack.push({
          fillStyle: currentFillStyle,
          strokeStyle: currentStrokeStyle,
          font: currentFont,
          lineWidth: ctx.lineWidth,
          globalAlpha: ctx.globalAlpha,
          textAlign: ctx.textAlign,
          textBaseline: ctx.textBaseline,
          lineDash: [...currentLineDash],
        });
      },
      restore() {
        calls.push({ method: 'restore', args: [] });
        const prev = stack.pop();
        if (prev) {
          currentFillStyle = prev.fillStyle;
          currentStrokeStyle = prev.strokeStyle;
          currentFont = prev.font;
          ctx.lineWidth = prev.lineWidth;
          ctx.globalAlpha = prev.globalAlpha;
          ctx.textAlign = prev.textAlign;
          ctx.textBaseline = prev.textBaseline;
          currentLineDash = prev.lineDash;
        }
      },
      fillRect(x: number, y: number, w: number, h: number) {
        calls.push({ method: 'fillRect', args: [x, y, w, h] });
        rects.push({
          kind: 'fill',
          x,
          y,
          w,
          h,
          style: formatCanvasStyle(currentFillStyle),
        });
      },
      strokeRect(x: number, y: number, w: number, h: number) {
        calls.push({ method: 'strokeRect', args: [x, y, w, h] });
        rects.push({
          kind: 'stroke',
          x,
          y,
          w,
          h,
          style: formatCanvasStyle(currentStrokeStyle),
        });
      },
      clearRect(x: number, y: number, w: number, h: number) {
        calls.push({ method: 'clearRect', args: [x, y, w, h] });
        rects.push({ kind: 'clear', x, y, w, h, style: 'clear' });
      },
      rect(x: number, y: number, w: number, h: number) {
        calls.push({ method: 'rect', args: [x, y, w, h] });
        pendingPathRects.push({ shape: 'rect', x, y, w, h });
      },
      roundRect(x: number, y: number, w: number, h: number, r?: unknown) {
        calls.push({ method: 'roundRect', args: [x, y, w, h, r] });
        pendingPathRects.push({ shape: 'roundRect', x, y, w, h });
      },
      beginPath() {
        calls.push({ method: 'beginPath', args: [] });
        pendingPathRects = [];
      },
      closePath() {
        calls.push({ method: 'closePath', args: [] });
      },
      moveTo(x: number, y: number) {
        calls.push({ method: 'moveTo', args: [x, y] });
      },
      lineTo(x: number, y: number) {
        calls.push({ method: 'lineTo', args: [x, y] });
      },
      arc(...args: unknown[]) {
        calls.push({ method: 'arc', args });
      },
      arcTo(...args: unknown[]) {
        calls.push({ method: 'arcTo', args });
      },
      ellipse(...args: unknown[]) {
        calls.push({ method: 'ellipse', args });
      },
      quadraticCurveTo(...args: unknown[]) {
        calls.push({ method: 'quadraticCurveTo', args });
      },
      bezierCurveTo(...args: unknown[]) {
        calls.push({ method: 'bezierCurveTo', args });
      },
      fill(...args: unknown[]) {
        calls.push({ method: 'fill', args });
        if (typeof currentFillStyle === 'string') fillStyles.push(currentFillStyle);
        const resolvedStyle = formatCanvasStyle(currentFillStyle);
        for (const pr of pendingPathRects) {
          rects.push({
            kind: pr.shape === 'roundRect' ? 'round' : 'fill',
            x: pr.x,
            y: pr.y,
            w: pr.w,
            h: pr.h,
            style: resolvedStyle,
          });
        }
      },
      stroke(...args: unknown[]) {
        calls.push({ method: 'stroke', args });
        if (typeof currentStrokeStyle === 'string') strokeStyles.push(currentStrokeStyle);
        const resolvedStyle = formatCanvasStyle(currentStrokeStyle);
        for (const pr of pendingPathRects) {
          rects.push({
            kind: 'stroke',
            x: pr.x,
            y: pr.y,
            w: pr.w,
            h: pr.h,
            style: resolvedStyle,
          });
        }
      },
      clip(...args: unknown[]) {
        calls.push({ method: 'clip', args });
      },
      isPointInPath: () => false,
      isPointInStroke: () => false,
      fillText(text: string, x: number, y: number, maxWidth?: number) {
        const str = String(text);
        calls.push({ method: 'fillText', args: [str, x, y, maxWidth] });
        texts.push({
          text: str,
          x,
          y,
          font: currentFont,
          fillStyle: formatCanvasStyle(currentFillStyle),
        });
      },
      strokeText(text: string, x: number, y: number, maxWidth?: number) {
        const str = String(text);
        calls.push({ method: 'strokeText', args: [str, x, y, maxWidth] });
        texts.push({
          text: str,
          x,
          y,
          font: currentFont,
          fillStyle: formatCanvasStyle(currentStrokeStyle),
        });
      },
      measureText(text: string) {
        const str = String(text);
        const pxMatch = currentFont.match(/(\d+(?:\.\d+)?)px/);
        const fontPx = pxMatch ? Number(pxMatch[1]) : 14;
        return {
          width: str.length * fontPx * 0.58,
          actualBoundingBoxAscent: fontPx * 0.8,
          actualBoundingBoxDescent: fontPx * 0.2,
          fontBoundingBoxAscent: fontPx * 0.9,
          fontBoundingBoxDescent: fontPx * 0.25,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: str.length * fontPx * 0.58,
        };
      },
      drawImage(img: any, ...rest: unknown[]) {
        const src = String(img?.src ?? img?.currentSrc ?? '');
        calls.push({ method: 'drawImage', args: [src, ...rest] });
        drawImages.push({ src, args: rest });
      },
      scale(...args: unknown[]) {
        calls.push({ method: 'scale', args });
      },
      rotate(angle: number) {
        calls.push({ method: 'rotate', args: [angle] });
      },
      translate(x: number, y: number) {
        calls.push({ method: 'translate', args: [x, y] });
      },
      transform(...args: unknown[]) {
        calls.push({ method: 'transform', args });
      },
      setTransform(...args: unknown[]) {
        calls.push({ method: 'setTransform', args });
      },
      resetTransform() {
        calls.push({ method: 'resetTransform', args: [] });
      },
      getTransform() {
        return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      },
      createLinearGradient: () => createGradient(),
      createRadialGradient: () => createGradient(),
      createConicGradient: () => createGradient(),
      createPattern: () => ({}),
      setLineDash(segments: number[]) {
        currentLineDash = [...segments];
      },
      getLineDash() {
        return [...currentLineDash];
      },
      createImageData(w: number, h: number) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      getImageData(x: number, y: number, w: number, h: number) {
        calls.push({ method: 'getImageData', args: [x, y, w, h] });
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData(...args: unknown[]) {
        calls.push({ method: 'putImageData', args });
      },
    };
    return ctx;
  }

  function encodeMockCanvasBytes(mime: string): {
    outBytes: Uint8Array;
    dataUrl: string;
  } {
    const lower = mime.toLowerCase();
    if (lower === 'image/png') {
      return {
        outBytes: new Uint8Array(pngBytes),
        dataUrl: `data:${mime};base64,${VALID_MINIMAL_PNG_BASE64}`,
      };
    }
    // Non-PNG MIME requests emit distinct non-PNG headers so PNG assertions catch wrong MIME exports
    const stub =
      lower === 'image/jpeg'
        ? new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
        : new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    return {
      outBytes: stub,
      dataUrl: `data:${mime};base64,${Buffer.from(stub).toString('base64')}`,
    };
  }

  function resolveCanvasDim(val: unknown, fallback: number): number {
    if (val === undefined || val === null || val === '') return fallback;
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  if (proto) {
    proto.getContext = function (type: string) {
      if (type !== '2d') return null;
      let existing = contextMap.get(this);
      if (!existing) {
        existing = createContext(this);
        contextMap.set(this, existing);
        canvases.push({
          width: resolveCanvasDim(this.width, 300),
          height: resolveCanvasDim(this.height, 150),
        });
      }
      return existing;
    };

    proto.toDataURL = function (type = 'image/png') {
      const mime = typeof type === 'string' && type.length > 0 ? type : 'image/png';
      const { dataUrl } = encodeMockCanvasBytes(mime);
      toDataUrlCalls.push({
        type: mime,
        width: resolveCanvasDim(this.width, 300),
        height: resolveCanvasDim(this.height, 150),
        dataUrl,
      });
      return dataUrl;
    };

    proto.toBlob = function (
      callback: (blob: Blob | null) => void,
      type = 'image/png'
    ) {
      const mime = typeof type === 'string' && type.length > 0 ? type : 'image/png';
      const { outBytes } = encodeMockCanvasBytes(mime);
      const BlobCtor = globalThis.Blob ?? win.Blob;
      const blob = new BlobCtor([outBytes], { type: mime });
      toBlobCalls.push({
        type: mime,
        width: resolveCanvasDim(this.width, 300),
        height: resolveCanvasDim(this.height, 150),
        blob,
        bytes: new Uint8Array(outBytes),
      });
      queueMicrotask(() => callback(blob));
    };
  }

  if (opts.autoLoadImages !== false) {
    class MockImage {
      private _src = '';
      width = 128;
      height = 128;
      naturalWidth = 128;
      naturalHeight = 128;
      complete = false;
      crossOrigin: string | null = null;
      onload: ((ev?: unknown) => void) | null = null;
      onerror: ((ev?: unknown) => void) | null = null;
      private listeners = new Map<string, Set<() => void>>();

      addEventListener(type: string, fn: () => void) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)!.add(fn);
      }
      removeEventListener(type: string, fn: () => void) {
        this.listeners.get(type)?.delete(fn);
      }
      get src() {
        return this._src;
      }
      set src(val: string) {
        this._src = String(val ?? '');
        if (!this._src) return;
        queueMicrotask(() => {
          this.complete = true;
          this.onload?.({});
          for (const fn of [...(this.listeners.get('load') ?? [])]) {
            fn();
          }
        });
      }
      async decode() {
        this.complete = true;
      }
    }
    win.Image = MockImage;
    if (typeof globalThis.Image === 'undefined' || globalThis.Image === origImage) {
      Object.defineProperty(globalThis, 'Image', {
        value: MockImage,
        configurable: true,
        writable: true,
      });
      patchedGlobalImage = true;
    }
    if (!win.createImageBitmap) {
      win.createImageBitmap = async (src: unknown) => ({
        width: 128,
        height: 128,
        src,
        close: () => {},
      });
      patchedWinCreateImageBitmap = true;
    }
  }

  let restored = false;
  return {
    canvases,
    fillStyles,
    strokeStyles,
    texts,
    get allText() {
      return texts.map((t) => t.text).join('\n');
    },
    drawImages,
    rects,
    calls,
    toDataUrlCalls,
    toBlobCalls,
    pngMagicBytes: PNG_MAGIC_BYTES,
    reset() {
      canvases.length = 0;
      fillStyles.length = 0;
      strokeStyles.length = 0;
      texts.length = 0;
      drawImages.length = 0;
      rects.length = 0;
      calls.length = 0;
      toDataUrlCalls.length = 0;
      toBlobCalls.length = 0;
    },
    restore() {
      if (restored) return;
      restored = true;
      if (proto) {
        if (origGetContextDesc) {
          Object.defineProperty(proto, 'getContext', origGetContextDesc);
        } else {
          delete proto.getContext;
        }
        if (origToDataURLDesc) {
          Object.defineProperty(proto, 'toDataURL', origToDataURLDesc);
        } else {
          delete proto.toDataURL;
        }
        if (origToBlobDesc) {
          Object.defineProperty(proto, 'toBlob', origToBlobDesc);
        } else {
          delete proto.toBlob;
        }
      }
      if (opts.autoLoadImages !== false) {
        if (hadWinImage && origWinImageDesc) {
          Object.defineProperty(win, 'Image', origWinImageDesc);
        } else {
          delete win.Image;
        }
        if (patchedGlobalImage) {
          if (prevGlobalImageDesc) {
            Object.defineProperty(globalThis, 'Image', prevGlobalImageDesc);
          } else {
            delete (globalThis as Record<string, unknown>).Image;
          }
        }
        if (patchedWinCreateImageBitmap) {
          if (hadWinCreateImageBitmap && origWinCreateImageBitmapDesc) {
            Object.defineProperty(
              win,
              'createImageBitmap',
              origWinCreateImageBitmapDesc
            );
          } else {
            delete win.createImageBitmap;
          }
        }
      }
    },
  };
}

// ============================================================================
// Section 6: Safe Offline CLI Runner (`runTsxCli`)
// ============================================================================

export interface TsxCliOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  allowMissingScript?: boolean;
}

export interface TsxCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal: NodeJS.Signals | null;
}

export async function runTsxCli(
  scriptRelPath: string,
  args: string[] = [],
  opts: TsxCliOptions = {}
): Promise<TsxCliResult> {
  const scriptAbs = path.resolve(REPO_ROOT, scriptRelPath);
  if (!opts.allowMissingScript && !fs.existsSync(scriptAbs)) {
    throw new AssertionError(
      `[v0.2.0 Contract Missing] Missing CLI script "${scriptRelPath}"`,
      scriptAbs,
      'ENOENT'
    );
  }
  const tsxBin = path.resolve(
    REPO_ROOT,
    'node_modules/.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  );

  const MAX_BUFFER = 4 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const isPosix = process.platform !== 'win32';

  return await new Promise<TsxCliResult>((resolve) => {
    let settled = false;
    let didTimeout = false;
    let maxBufferExceeded = false;
    let killEscalationArmed = false;
    let sigkillSent = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let destroyTimer: ReturnType<typeof setTimeout> | undefined;
    let reapTimer: ReturnType<typeof setTimeout> | undefined;

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;

    const child = spawn(tsxBin, [scriptAbs, ...args], {
      cwd: opts.cwd ?? REPO_ROOT,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: isPosix,
      shell: false,
    });

    const killProcessTree = (sig: NodeJS.Signals) => {
      if (sig === 'SIGKILL') sigkillSent = true;
      if (isPosix && typeof child.pid === 'number' && child.pid > 0) {
        try {
          process.kill(-child.pid, sig);
          return;
        } catch {
          // Process group may already have exited; fall back to direct child kill
        }
      }
      try {
        child.kill(sig);
      } catch {
        // Process already exited
      }
    };

    const cleanupTimers = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (killTimer !== undefined) {
        clearTimeout(killTimer);
        killTimer = undefined;
      }
      if (destroyTimer !== undefined) {
        clearTimeout(destroyTimer);
        destroyTimer = undefined;
      }
      if (reapTimer !== undefined) {
        clearTimeout(reapTimer);
        reapTimer = undefined;
      }
    };

    const finish = (result: TsxCliResult) => {
      if (settled) return;
      settled = true;
      cleanupTimers();
      resolve(result);
    };

    const waitForProcessGroupReaped = (pgid: number, done: () => void) => {
      const deadline = Date.now() + 250;
      const poll = () => {
        reapTimer = undefined;
        try {
          process.kill(-pgid, 0);
        } catch {
          done();
          return;
        }
        if (Date.now() >= deadline) {
          done();
          return;
        }
        // Keep reffed (hard-bounded to <= 250ms) so Node's event loop does not
        // drain and exit 0 after child.on('close') before finish() resolves.
        reapTimer = setTimeout(poll, 5);
      };
      poll();
    };

    const armKillEscalation = () => {
      if (killEscalationArmed) return;
      killEscalationArmed = true;
      killTimer = setTimeout(() => {
        killProcessTree('SIGKILL');
        // Fallback: if any descendant escaped the process group while keeping
        // inherited stdio pipes open, destroy stdio promptly so 'close' fires.
        destroyTimer = setTimeout(() => {
          if (child.stdout && !child.stdout.destroyed) child.stdout.destroy();
          if (child.stderr && !child.stderr.destroyed) child.stderr.destroy();
        }, 150);
        destroyTimer.unref?.();
      }, 1_000);
      killTimer.unref?.();
    };

    const triggerMaxBufferKill = () => {
      if (maxBufferExceeded) return;
      maxBufferExceeded = true;
      if (!didTimeout && timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      killProcessTree('SIGTERM');
      armKillEscalation();
    };

    const appendStreamChunk = (
      chunks: Buffer[],
      currentBytes: number,
      raw: Buffer | string
    ): number => {
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      if (buf.length === 0) return currentBytes;
      if (currentBytes + buf.length > MAX_BUFFER) {
        const remaining = MAX_BUFFER - currentBytes;
        if (remaining > 0) {
          chunks.push(buf.subarray(0, remaining));
        }
        triggerMaxBufferKill();
        return MAX_BUFFER;
      }
      chunks.push(buf);
      return currentBytes + buf.length;
    };

    child.stdout?.on('error', () => {});
    child.stderr?.on('error', () => {});

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdoutBytes = appendStreamChunk(stdoutChunks, stdoutBytes, chunk);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrBytes = appendStreamChunk(stderrChunks, stderrBytes, chunk);
    });

    child.on('error', (err) => {
      const errText = err instanceof Error ? err.message : String(err);
      const existingStderr = Buffer.concat(stderrChunks).toString('utf8');
      finish({
        exitCode: 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: existingStderr ? `${existingStderr}\n${errText}` : errText,
        timedOut: didTimeout,
        signal: null,
      });
    });

    child.on('close', (code, signal) => {
      cleanupTimers();
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      const resolvedSignal: NodeJS.Signals | null = signal ?? null;
      const timedOut = Boolean(
        didTimeout ||
          (!maxBufferExceeded &&
            (resolvedSignal === 'SIGTERM' || resolvedSignal === 'SIGKILL'))
      );
      let exitCode: number;
      if (maxBufferExceeded) {
        exitCode = 1;
      } else if (typeof code === 'number') {
        exitCode = code;
      } else if (resolvedSignal) {
        exitCode = 1;
      } else {
        exitCode = 0;
      }
      const result: TsxCliResult = {
        exitCode,
        stdout,
        stderr,
        timedOut,
        signal: resolvedSignal,
      };
      if (
        (didTimeout || maxBufferExceeded) &&
        isPosix &&
        typeof child.pid === 'number' &&
        child.pid > 0
      ) {
        if (!sigkillSent) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            // Process group already exited cleanly
          }
        }
        waitForProcessGroupReaped(child.pid, () => finish(result));
        return;
      }
      finish(result);
    });

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        didTimeout = true;
        killProcessTree('SIGTERM');
        armKillEscalation();
      }, timeoutMs);
      timer.unref?.();
    }
  });
}

// ============================================================================
// Section 7: Canonical v0.2.0 Fixtures
// ============================================================================

export const LEGACY_24_CLOUD_KEYWORD_IDS = [
  'cloud-cliche-trivia-1',
  'cloud-cliche-hottake-1',
  'cloud-cliche-clickbait-1',
  'cloud-cliche-breaking-1',
  'cloud-cliche-guru-1',
  'cloud-cliche-aislop-cn-1',
  'cloud-cliche-emotion-1',
  'cloud-cliche-aislop-en-1',
  'cloud-cliche-ai-reply-1',
  'cloud-crypto-trading-1',
  'cloud-crypto-meme-1',
  'cloud-crypto-airdrop-1',
  'cloud-scam-crypto-1',
  'cloud-scam-rebate-1',
  'cloud-follow-cn-1',
  'cloud-follow-intl-1',
  'cloud-nsfw-bio-1',
  'cloud-nsfw-bio-2',
  'cloud-scam-support-1',
  'cloud-scam-trojan-1',
  'cloud-spam-tg-1',
  'cloud-scam-whatsapp-1',
  'cloud-gambling-cn-1',
  'cloud-blackmarket-1',
] as const;

export function makeOfficialGrokAuthor(
  overrides: Partial<ExtractedAuthor> = {}
): ExtractedAuthor {
  return makeExtractedAuthor({
    restId: '1720665183188922368',
    screenName: 'grok',
    name: 'Grok',
    bio: 'AI assistant by xAI',
    accountAgeDays: 365,
    statusesCount: 730_000,
    dailyTweetRate: 2000,
    followersCount: 5_000_000,
    friendsCount: 10,
    isBlueVerified: true,
    following: false,
    ...overrides,
  });
}

export const OFFICIAL_GROK_AUTHOR: ExtractedAuthor = Object.freeze(
  makeOfficialGrokAuthor()
);

export function makeLookalikeGrokAuthor(
  overrides: Partial<ExtractedAuthor> = {}
): ExtractedAuthor {
  return makeExtractedAuthor({
    restId: '999888777666555',
    screenName: 'grok_official',
    name: 'Grok AI Bot',
    bio: 'Unofficial Grok bot',
    accountAgeDays: 100,
    statusesCount: 20_000,
    dailyTweetRate: 200,
    followersCount: 80,
    friendsCount: 1000,
    isBlueVerified: false,
    following: false,
    ...overrides,
  });
}

export const LOOKALIKE_GROK_AUTHOR: ExtractedAuthor = Object.freeze(
  makeLookalikeGrokAuthor()
);

export function createLegacyV012ConfigFixture(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    version: 1,
    enabled: true,
    locale: 'zh-CN',
    theme: 'light',
    preset: 'standard',
    interceptionMode: 'collapse',
    exemptFollowing: true,
    profileSceneBadgeOnly: true,
    syncNativeXBlock: true,
    enableCrowdReport: true,
    enableCloudKeywords: true,
    disabledCloudKeywordIds: ['cloud-cliche-trivia-1'],
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
      keywords: {
        enabled: true,
        items: [
          {
            id: 'legacy-kw-1',
            pattern: 'legacy_custom_spam_token',
            isRegex: false,
            scopes: ['text'],
            enabled: true,
            note: 'Legacy user custom rule',
          },
        ],
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
      languageFilter: {
        enabled: false,
        mode: 'allow',
        languages: ['zh', 'en', 'ja'],
      },
      hidePromotedAds: {
        enabled: true,
      },
    },
    whitelistUids: {
      '1122334455': {
        uid: '1122334455',
        screenName: 'trusted_friend',
        name: 'Trusted Friend',
        addedAt: 1_700_000_000_000,
      },
    },
    localBlocklistUids: {
      '5544332211': {
        uid: '5544332211',
        screenName: 'legacy_blocked_spammer',
        name: 'Legacy Spammer',
        tag: 'spam',
        addedAt: 1_700_000_000_000,
      },
    },
    ...overrides,
  };
}

export const LEGACY_V012_CONFIG_FIXTURE = Object.freeze(
  createLegacyV012ConfigFixture()
);

export interface V020DomainRuleItem {
  id: string;
  domain: string;
  onlyInReplies?: boolean;
  maxFollowersExempt?: number;
  note?: string;
  enabled: boolean;
}

export interface V020RulePackPayload {
  format: 'kxc-pack-v1';
  id: string;
  name: string;
  description: string;
  author?: string;
  version: string;
  locale?: string;
  updatedAt: string;
  keywords?: KeywordRuleItem[];
  domains?: V020DomainRuleItem[];
  blockedUids?: AccountListEntry[];
}

export function createValidKxcPackV1(
  overrides: Partial<V020RulePackPayload> = {}
): V020RulePackPayload {
  return {
    format: 'kxc-pack-v1',
    id: 'pack-crypto-shield',
    name: 'Crypto Noise Shield',
    description: 'Community offline rule pack for memecoin and funnel spam.',
    author: 'KeepXClean Community',
    version: '1.0.0',
    locale: 'universal',
    updatedAt: '2026-11-25T00:00:00.000Z',
    keywords: [
      {
        id: 'pk-kw-1',
        pattern: 'guaranteed 1000x moonshot',
        isRegex: false,
        scopes: ['text', 'bio'],
        enabled: true,
        note: 'Memecoin shilling phrase',
      },
      {
        id: 'pk-kw-2',
        pattern: 'claim\\s+free\\s+airdrop\\s+now',
        isRegex: true,
        scopes: ['text'],
        enabled: true,
        note: 'Airdrop scam regex',
      },
    ],
    domains: [
      {
        id: 'pk-dom-1',
        domain: 'pump-scam.example',
        enabled: true,
        note: 'Scam launchpad domain',
      },
    ],
    blockedUids: [
      {
        uid: '8877665544',
        screenName: 'pack_spam_bot',
        name: 'Pack Spam Bot',
        tag: 'spam',
        addedAt: 1_700_000_000_000,
      },
    ],
    ...overrides,
  };
}

export const VALID_KXC_PACK_V1 = Object.freeze(createValidKxcPackV1());

export const INVALID_KXC_PACK_CASES = {
  wrongFormat: () => ({
    ...createValidKxcPackV1(),
    format: 'kxc-pack-v2',
  }),
  emptyFormat: () => ({
    ...createValidKxcPackV1(),
    format: '',
  }),
  missingMetadata: () => ({
    format: 'kxc-pack-v1',
    id: '',
    name: '',
    description: '',
    version: '',
    updatedAt: '',
  }),
  forbiddenWhitelistUids: () => ({
    ...createValidKxcPackV1(),
    whitelistUids: { '12345': { uid: '12345', screenName: 'vip', addedAt: 1 } },
  }),
  forbiddenCustomApiBaseUrl: () => ({
    ...createValidKxcPackV1(),
    customApiBaseUrl: 'https://evil.example.com',
  }),
  forbiddenSyncNativeXBlock: () => ({
    ...createValidKxcPackV1(),
    syncNativeXBlock: true,
  }),
  forbiddenEnableCrowdReport: () => ({
    ...createValidKxcPackV1(),
    enableCrowdReport: true,
  }),
  invalidRegexSyntax: () =>
    createValidKxcPackV1({
      keywords: [
        {
          id: 'bad-regex-1',
          pattern: '[unclosed_group',
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        },
      ],
    }),
  redosRegexPattern: () =>
    createValidKxcPackV1({
      keywords: [
        {
          id: 'redos-regex-1',
          pattern: '(a+)+$',
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        },
      ],
    }),
  oversizedRegexPattern: () =>
    createValidKxcPackV1({
      keywords: [
        {
          id: 'huge-regex-1',
          pattern: 'a'.repeat(1200),
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        },
      ],
    }),
  invalidDomain: () =>
    createValidKxcPackV1({
      domains: [
        {
          id: 'bad-dom-1',
          domain: '*.not a valid domain',
          enabled: true,
        },
      ],
    }),
  invalidUid: () =>
    createValidKxcPackV1({
      blockedUids: [
        {
          uid: '@not_numeric_uid',
          screenName: 'bad',
          addedAt: 1_700_000_000_000,
        },
      ],
    }),
  tooManyKeywords: () =>
    createValidKxcPackV1({
      keywords: Array.from({ length: 505 }, (_, i) => ({
        id: `kw-overflow-${i}`,
        pattern: `spam_token_${i}`,
        isRegex: false,
        scopes: ['text'] as const,
        enabled: true,
      })),
    }),
  tooManyDomains: () =>
    createValidKxcPackV1({
      domains: Array.from({ length: 505 }, (_, i) => ({
        id: `dom-overflow-${i}`,
        domain: `spam${i}.example.com`,
        enabled: true,
      })),
    }),
  tooManyBlockedUids: () =>
    createValidKxcPackV1({
      blockedUids: Array.from({ length: 2505 }, (_, i) => ({
        uid: String(9000000000 + i),
        screenName: `bot_${i}`,
        addedAt: 1_700_000_000_000,
      })),
    }),
};

// ============================================================================
// Section 8: Canonical Battle Report DOM Trigger & AST Version-Test Validator
// ============================================================================

const BATTLE_REPORT_EXPLICIT_TESTID_RE = /battle[-_]?report|clean[-_]?report/i;
const BATTLE_REPORT_PASS1_RE =
  /(battle[\s_-]*report|clean[\s_-]*report|generate[\s_-]+(?:\w+[\s_-]+){0,2}report|share[\s_-]+(?:\w+[\s_-]+){0,2}report|report[\s_-]*(?:card|png)|战报|戰報)/i;
const BATTLE_REPORT_PASS2_RE = /(report|share|battle|png|战报|戰報)/i;
const BATTLE_REPORT_EXPORT_RE =
  /(download|save|copy|export|png|下载|下載|导出|導出|保存|复制|複製)/i;
const BATTLE_REPORT_DISMISS_RE = /^(?:close|dismiss|cancel|关闭|取消|關閉)$/i;

function getBattleReportButtonLabel(b: Element): string {
  return [
    b.textContent ?? '',
    b.getAttribute('aria-label') ?? '',
    b.getAttribute('title') ?? '',
    b.getAttribute('data-testid') ?? '',
  ].join(' ');
}

function isDismissDialogButton(b: Element): boolean {
  const texts = [
    (b.textContent ?? '').trim(),
    (b.getAttribute('aria-label') ?? '').trim(),
    (b.getAttribute('title') ?? '').trim(),
  ];
  return texts.some((t) => t.length > 0 && BATTLE_REPORT_DISMISS_RE.test(t));
}

/**
 * Canonical 3-tier Battle Report button resolver shared across Tiers 1–4.
 * Excludes table, native `<dialog>`, ARIA `[role="dialog"]`, and rule-filter bar buttons.
 */
export function findBattleReportButton(
  doc: Document
): HTMLButtonElement | undefined {
  const candidates = [...doc.querySelectorAll<HTMLButtonElement>('button')].filter(
    (b) =>
      !b.closest('table, dialog, [role="dialog"]') &&
      !b.hasAttribute('data-rule') &&
      !b.hasAttribute('data-rule-id') &&
      !/rule[-_]/i.test(b.getAttribute('data-testid') ?? '')
  );

  // Tier 1: explicit contract attributes
  const explicitMatch = candidates.find(
    (b) =>
      b.hasAttribute('data-kxc-report-btn') ||
      BATTLE_REPORT_EXPLICIT_TESTID_RE.test(b.getAttribute('data-testid') ?? '')
  );
  if (explicitMatch) return explicitMatch;

  // Tier 2: multi-word Battle/Clean Report trigger labels (avoids "Rule card report")
  const pass1Match = candidates.find((b) =>
    BATTLE_REPORT_PASS1_RE.test(getBattleReportButtonLabel(b))
  );
  if (pass1Match) return pass1Match;

  // Tier 3: narrow fallback (deliberately excludes generic "card")
  return candidates.find((b) =>
    BATTLE_REPORT_PASS2_RE.test(getBattleReportButtonLabel(b))
  );
}

/**
 * Resolves the secondary export button inside an opened Battle Report preview modal.
 * Strictly prioritizes open/rendered dialogs before any non-table page fallback.
 */
export function findBattleReportModalExportButton(
  doc: Document,
  excludeBtn?: Element
): HTMLButtonElement | undefined {
  const isExportCandidate = (b: HTMLButtonElement): boolean =>
    b !== excludeBtn &&
    !isDismissDialogButton(b) &&
    BATTLE_REPORT_EXPORT_RE.test(getBattleReportButtonLabel(b));

  const openDialogBtns = [
    ...doc.querySelectorAll<HTMLButtonElement>(
      'dialog[open] button, [role="dialog"]:not([aria-hidden="true"]) button'
    ),
  ];
  const openMatch = openDialogBtns.find(isExportCandidate);
  if (openMatch) return openMatch;

  const anyDialogBtns = [
    ...doc.querySelectorAll<HTMLButtonElement>(
      'dialog button, [role="dialog"] button'
    ),
  ];
  if (anyDialogBtns.length > 0) {
    return anyDialogBtns.find(isExportCandidate);
  }

  const fallbackBtns = [...doc.querySelectorAll<HTMLButtonElement>('button')].filter(
    (b) => !b.closest('table')
  );
  return fallbackBtns.find(isExportCandidate);
}

export interface BattleReportRecorderLike {
  toBlobCalls: unknown[];
  toDataUrlCalls: unknown[];
  texts?: unknown[];
}

export interface BattleReportTriggerHost {
  document: Document;
  canvasRecorder?: BattleReportRecorderLike;
  click: (el: Element) => Promise<void>;
}

/**
 * Canonical Battle Report trigger shared across Tiers 1–4.
 * Finds and clicks the primary Battle Report trigger, and if clicking opened a
 * preview modal without yet exporting PNG / drawing text, clicks the scoped modal export button.
 */
export async function triggerBattleReportRender(
  mounted: BattleReportTriggerHost,
  recorder: BattleReportRecorderLike | undefined = mounted.canvasRecorder
): Promise<HTMLButtonElement> {
  const reportBtn = findBattleReportButton(mounted.document);
  expect(reportBtn).toBeDefined();
  await mounted.click(reportBtn!);

  const hasExport =
    Boolean(recorder) &&
    recorder!.toBlobCalls.length + recorder!.toDataUrlCalls.length > 0;
  const hasText =
    !recorder || !Array.isArray(recorder.texts) || recorder.texts.length > 0;

  if (!hasExport || !hasText) {
    const modalExportBtn = findBattleReportModalExportButton(
      mounted.document,
      reportBtn
    );
    if (modalExportBtn) {
      await mounted.click(modalExportBtn);
    }
  }

  return reportBtn!;
}

// --- TypeScript AST Validator for apps/web/tests/config.test.ts ---

const STALE_012_AST_RE =
  /(?:^|[^0-9.])0(?:\\*\.|\[\\?\.\])1(?:\\*\.|\[\\?\.\])2(?![0-9])/;
const POSITIVE_EQUALITY_MATCHERS = new Set([
  'toBe',
  'toEqual',
  'toStrictEqual',
]);

function unwrapTsExpr(expr: ts.Expression): ts.Expression {
  let cur = expr;
  while (true) {
    if (
      ts.isParenthesizedExpression(cur) ||
      ts.isAsExpression(cur) ||
      ts.isSatisfiesExpression(cur) ||
      ts.isNonNullExpression(cur)
    ) {
      cur = cur.expression;
    } else {
      break;
    }
  }
  return cur;
}

function isExpectRootCallee(expr: ts.Expression): boolean {
  const unwrapped = unwrapTsExpr(expr);
  if (ts.isIdentifier(unwrapped) && unwrapped.text === 'expect') {
    return true;
  }
  if (ts.isPropertyAccessExpression(unwrapped)) {
    const base = unwrapTsExpr(unwrapped.expression);
    if (
      ts.isIdentifier(base) &&
      base.text === 'expect' &&
      (unwrapped.name.text === 'soft' || unwrapped.name.text === 'poll')
    ) {
      return true;
    }
  }
  return false;
}

function inspectExpectCallChain(callExpr: ts.CallExpression): {
  expectCall: ts.CallExpression;
  matcherName: string;
  notCount: number;
} | null {
  const callee = unwrapTsExpr(callExpr.expression);
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const matcherName = callee.name.text;

  let cur: ts.Expression = unwrapTsExpr(callee.expression);
  let notCount = 0;
  while (
    ts.isPropertyAccessExpression(cur) &&
    (cur.name.text === 'not' ||
      cur.name.text === 'resolves' ||
      cur.name.text === 'rejects')
  ) {
    if (cur.name.text === 'not') notCount++;
    cur = unwrapTsExpr(cur.expression);
  }

  if (ts.isCallExpression(cur) && isExpectRootCallee(cur.expression)) {
    return { expectCall: cur, matcherName, notCount };
  }
  return null;
}

function isSkippedTestCall(callExpr: ts.CallExpression): boolean {
  const callee = unwrapTsExpr(callExpr.expression);
  if (
    ts.isIdentifier(callee) &&
    (callee.text === 'xit' ||
      callee.text === 'xtest' ||
      callee.text === 'xdescribe')
  ) {
    return true;
  }
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'skip') {
    const base = unwrapTsExpr(callee.expression);
    if (
      ts.isIdentifier(base) &&
      (base.text === 'it' || base.text === 'test' || base.text === 'describe')
    ) {
      return true;
    }
  }
  return false;
}

export interface VersionTestValidationResult {
  valid: boolean;
  hasPositiveV020Assertion: boolean;
  staleHits: string[];
}

/**
 * AST-based validator for `apps/web/tests/config.test.ts` (T2-V2-M12-01).
 * 1. Requires a genuine, non-negated, non-commented, non-skipped
 *    `expect(CURRENT_VERSION, ...).toBe|toEqual|toStrictEqual('v0.2.0')` assertion.
 * 2. Allows `0.1.2` / `v0.1.2` literals ONLY inside genuine single-negated
 *    `expect(...).not.<matcher>(...)` anti-regression guards, while catching every
 *    other string, template, or regex literal referencing `0.1.2`.
 */
export function validateVersionTestFileNoStale012(
  src: string,
  fileName = 'config.test.ts'
): VersionTestValidationResult {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true);
  let hasPositiveV020Assertion = false;
  const staleHits: string[] = [];

  const checkLiteralTexts = (
    node: ts.Node,
    texts: Array<string | undefined>
  ): void => {
    if (texts.some((t) => typeof t === 'string' && STALE_012_AST_RE.test(t))) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      staleHits.push(`L${line + 1}: ${node.getText(sf).trim()}`);
    }
  };

  const visitNestedUnsafeInNegativeGuard = (
    node: ts.Node,
    outerGuardCall: ts.CallExpression,
    innerExpectCall: ts.CallExpression,
    inSkipped: boolean
  ): void => {
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isFunctionDeclaration(node)
    ) {
      visit(node.body, inSkipped);
      return;
    }
    if (
      ts.isCallExpression(node) &&
      node !== outerGuardCall &&
      node !== innerExpectCall &&
      inspectExpectCallChain(node) !== null
    ) {
      visit(node, inSkipped);
      return;
    }
    ts.forEachChild(node, (child) =>
      visitNestedUnsafeInNegativeGuard(
        child,
        outerGuardCall,
        innerExpectCall,
        inSkipped
      )
    );
  };

  const visit = (node: ts.Node, inSkipped: boolean): void => {
    if (ts.isCallExpression(node)) {
      const nextSkipped = inSkipped || isSkippedTestCall(node);
      const chain = inspectExpectCallChain(node);

      if (
        !nextSkipped &&
        chain &&
        chain.notCount === 0 &&
        POSITIVE_EQUALITY_MATCHERS.has(chain.matcherName) &&
        chain.expectCall.arguments.length >= 1 &&
        node.arguments.length >= 1
      ) {
        const subject = unwrapTsExpr(chain.expectCall.arguments[0]);
        const expected = unwrapTsExpr(node.arguments[0]);
        const isCurrentVersion =
          ts.isIdentifier(subject) && subject.text === 'CURRENT_VERSION';
        const expectedStr =
          ts.isStringLiteral(expected) ||
          ts.isNoSubstitutionTemplateLiteral(expected)
            ? expected.text
            : null;
        if (isCurrentVersion && expectedStr === 'v0.2.0') {
          hasPositiveV020Assertion = true;
        }
      }

      if (chain && chain.notCount === 1) {
        visitNestedUnsafeInNegativeGuard(
          node,
          node,
          chain.expectCall,
          nextSkipped
        );
        return;
      }

      ts.forEachChild(node, (child) => visit(child, nextSkipped));
      return;
    }

    if (ts.isStringLiteral(node)) {
      checkLiteralTexts(node, [node.text]);
    } else if (
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      checkLiteralTexts(node, [node.text, node.rawText]);
    } else if (ts.isRegularExpressionLiteral(node)) {
      checkLiteralTexts(node, [node.text]);
    }

    ts.forEachChild(node, (child) => visit(child, inSkipped));
  };

  visit(sf, false);

  return {
    valid: hasPositiveV020Assertion && staleHits.length === 0,
    hasPositiveV020Assertion,
    staleHits,
  };
}
