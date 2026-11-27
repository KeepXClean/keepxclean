import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  isUILocaleSetting,
  isUIThemeSetting,
  STORAGE_KEYS,
  type FilterConfig,
  type InterceptionLogEntry,
  type RuleEvidence,
  type TweetScene,
} from '@keepxclean/shared';
import { getActiveErrors, getErrors } from '../i18n/errors';
import { setActiveLocaleSetting } from '../i18n/state';
import {
  defaultCloudSyncMeta,
  defaultParseHealth,
  defaultStats,
  digest,
  localDate,
  rollStats,
  UI_KEYS,
  type AppState,
  type CloudSyncMeta,
  type CloudSyncStatus,
  type ParseHealthState,
} from '../services/model';
import {
  CORE_GRAPHQL_OPS,
  normalizeParseHealth,
  PARSE_HEALTH_MAX_TOP_KEYS,
  PARSE_HEALTH_MIN_SPAN_MS,
  sanitizeParseHealthReport,
} from '../services/parse-health';
import { PROTO_POLLUTION_KEYS } from '../services/schema';
import { assert, validateConfig, validateSnapshot } from '../services/validation';
import { serialQueue } from './config';

export { rollStats };

const TWEET_ID_RE = /^\d{1,30}$/;
const RULE_ID_RE = /^[a-z0-9_]{1,64}$/;
const MAX_DATE_MS = 8_640_000_000_000_000;
const MAX_LOG_BATCH = 2000;
const MAX_LOG_EVIDENCE_ITEMS = 16;
const VALID_LOG_SCENES = new Set<TweetScene>([
  'timeline',
  'reply',
  'search',
  'profile',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (PROTO_POLLUTION_KEYS.has(key)) return false;
  }
  return true;
}

function readOwnData(obj: Record<string, unknown>, key: string): unknown {
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (
    !desc ||
    !('value' in desc) ||
    typeof desc.get === 'function' ||
    typeof desc.set === 'function'
  ) {
    return undefined;
  }
  return desc.value;
}

function sanitizeLogEvidence(raw: unknown): RuleEvidence[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: RuleEvidence[] = [];
  const limit = Math.min(raw.length, MAX_LOG_EVIDENCE_ITEMS);
  for (let i = 0; i < limit; i++) {
    const desc = Object.getOwnPropertyDescriptor(raw, i);
    if (
      !desc ||
      !('value' in desc) ||
      typeof desc.get === 'function' ||
      typeof desc.set === 'function'
    ) {
      continue;
    }
    const item = desc.value;
    if (!isPlainRecord(item)) continue;
    const label = readOwnData(item, 'label');
    const value = readOwnData(item, 'value');
    if (typeof label !== 'string') continue;
    let cleanValue: string | number | boolean;
    if (typeof value === 'string') {
      cleanValue = value.slice(0, 500);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      cleanValue = value;
    } else if (typeof value === 'boolean') {
      cleanValue = value;
    } else {
      continue;
    }
    const key = readOwnData(item, 'key');
    const entry: RuleEvidence = {
      label: label.slice(0, 200),
      value: cleanValue,
    };
    if (
      typeof key === 'string' &&
      key.length > 0 &&
      !PROTO_POLLUTION_KEYS.has(key)
    ) {
      entry.key = key.slice(0, 64);
    }
    out.push(entry);
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeLogEntry(raw: unknown): InterceptionLogEntry | null {
  if (!isPlainRecord(raw)) return null;
  const tweetId = readOwnData(raw, 'tweetId');
  const ruleId = readOwnData(raw, 'ruleId');
  const reasonText = readOwnData(raw, 'reasonText');
  const timestamp = readOwnData(raw, 'timestamp');
  if (
    typeof tweetId !== 'string' ||
    !TWEET_ID_RE.test(tweetId) ||
    typeof ruleId !== 'string' ||
    !RULE_ID_RE.test(ruleId) ||
    PROTO_POLLUTION_KEYS.has(ruleId) ||
    typeof reasonText !== 'string' ||
    typeof timestamp !== 'number' ||
    !Number.isFinite(timestamp) ||
    timestamp < 0 ||
    timestamp > MAX_DATE_MS
  ) {
    return null;
  }
  const rawScene = readOwnData(raw, 'scene');
  if (
    rawScene !== undefined &&
    (typeof rawScene !== 'string' ||
      !VALID_LOG_SCENES.has(rawScene as TweetScene))
  ) {
    return null;
  }
  const scene: TweetScene = (rawScene as TweetScene | undefined) ?? 'timeline';
  const rawId = readOwnData(raw, 'id');
  const rawAuthorUid = readOwnData(raw, 'authorUid');
  const rawScreenName = readOwnData(raw, 'authorScreenName');
  const rawAuthorName = readOwnData(raw, 'authorName');
  const rawAvatar = readOwnData(raw, 'authorAvatar');
  const rawSnippet = readOwnData(raw, 'tweetSnippet');
  const evidence = sanitizeLogEvidence(readOwnData(raw, 'evidence'));

  const clean: InterceptionLogEntry = {
    id:
      typeof rawId === 'string' && rawId.length > 0
        ? rawId.slice(0, 128)
        : `${tweetId}-${Math.floor(timestamp)}`,
    tweetId,
    authorUid:
      typeof rawAuthorUid === 'string' &&
      !PROTO_POLLUTION_KEYS.has(rawAuthorUid) &&
      !(rawAuthorUid in Object.prototype)
        ? rawAuthorUid.slice(0, 64)
        : '',
    authorScreenName:
      typeof rawScreenName === 'string' ? rawScreenName.slice(0, 100) : '',
    authorName:
      typeof rawAuthorName === 'string' ? rawAuthorName.slice(0, 200) : '',
    tweetSnippet:
      typeof rawSnippet === 'string' ? rawSnippet.slice(0, 500) : '',
    scene,
    ruleId: ruleId as InterceptionLogEntry['ruleId'],
    reasonText: reasonText.slice(0, 500),
    timestamp,
    ...(typeof rawAvatar === 'string' &&
    rawAvatar.length <= 2048 &&
    /^https:\/\//.test(rawAvatar)
      ? { authorAvatar: rawAvatar }
      : {}),
    ...(evidence ? { evidence } : {}),
  };
  return clean;
}

const CLOUD_SYNC_STATUSES = new Set<CloudSyncStatus>([
  'idle',
  'syncing',
  'synced',
  'conflict',
  'quota_exceeded',
  'error',
]);

let onConfigWrittenHook: ((config: FilterConfig) => void) | undefined;

export function setOnConfigWrittenHook(
  fn: ((config: FilterConfig) => void) | undefined
) {
  onConfigWrittenHook = fn;
}

export const enqueue = serialQueue();

export async function readConfig(): Promise<FilterConfig> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
  const config =
    data[STORAGE_KEYS.CONFIG] === undefined
      ? createDefaultConfig()
      : validateConfig(data[STORAGE_KEYS.CONFIG]);
  setActiveLocaleSetting(config.locale);
  return config;
}

export async function writeConfig(
  config: FilterConfig,
  options?: { skipCloudSync?: boolean }
): Promise<FilterConfig> {
  const validated = validateConfig(config);
  setActiveLocaleSetting(validated.locale);
  await chrome.storage.local.set({
    [STORAGE_KEYS.CONFIG]: validated,
  });
  if (!options?.skipCloudSync) {
    onConfigWrittenHook?.(validated);
  }
  return validated;
}

export function normalizeCloudSyncMeta(raw: unknown): CloudSyncMeta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultCloudSyncMeta();
  }
  const obj = raw as Record<string, unknown>;
  const status =
    typeof obj.status === 'string' &&
    CLOUD_SYNC_STATUSES.has(obj.status as CloudSyncStatus)
      ? (obj.status as CloudSyncStatus)
      : 'idle';
  const meta: CloudSyncMeta = {
    enabled: obj.enabled === true,
    status,
  };
  if (typeof obj.lastPushAt === 'number' && Number.isFinite(obj.lastPushAt)) {
    meta.lastPushAt = obj.lastPushAt;
  }
  if (typeof obj.lastPullAt === 'number' && Number.isFinite(obj.lastPullAt)) {
    meta.lastPullAt = obj.lastPullAt;
  }
  if (typeof obj.bytesUsed === 'number' && Number.isFinite(obj.bytesUsed)) {
    meta.bytesUsed = obj.bytesUsed;
  }
  if (typeof obj.chunkCount === 'number' && Number.isFinite(obj.chunkCount)) {
    meta.chunkCount = obj.chunkCount;
  }
  if (typeof obj.error === 'string' && obj.error) {
    meta.error = obj.error;
  }
  if (
    obj.pendingRemote &&
    typeof obj.pendingRemote === 'object' &&
    !Array.isArray(obj.pendingRemote)
  ) {
    meta.pendingRemote = obj.pendingRemote as CloudSyncMeta['pendingRemote'];
  }
  if (
    typeof obj.remoteUpdatedAt === 'number' &&
    Number.isFinite(obj.remoteUpdatedAt)
  ) {
    meta.remoteUpdatedAt = obj.remoteUpdatedAt;
  }
  if (typeof obj.deviceId === 'string' && obj.deviceId) {
    meta.deviceId = obj.deviceId;
  }
  if (typeof obj.lastSyncedSha256 === 'string' && obj.lastSyncedSha256) {
    meta.lastSyncedSha256 = obj.lastSyncedSha256;
  }
  return meta;
}

export async function readCloudSyncMeta(): Promise<CloudSyncMeta> {
  const data = await chrome.storage.local.get(UI_KEYS.cloudSync);
  return normalizeCloudSyncMeta(data[UI_KEYS.cloudSync]);
}

export async function writeCloudSyncMeta(meta: CloudSyncMeta): Promise<void> {
  await chrome.storage.local.set({
    [UI_KEYS.cloudSync]: normalizeCloudSyncMeta(meta),
  });
}

export { normalizeParseHealth };

export async function readParseHealth(): Promise<ParseHealthState> {
  const data = await chrome.storage.local.get(UI_KEYS.health);
  return normalizeParseHealth(data[UI_KEYS.health]);
}

export async function updateParseHealth(
  incoming: unknown
): Promise<ParseHealthState> {
  const report = sanitizeParseHealthReport(incoming);
  const data = await chrome.storage.local.get(UI_KEYS.health);
  const prev = normalizeParseHealth(data[UI_KEYS.health]);
  if (!report) {
    return prev;
  }
  if (report.status === 'ok') {
    if (
      prev.status === 'ok' &&
      prev.consecutiveZeroCount === 0 &&
      prev.dismissedAt === undefined
    ) {
      return prev;
    }
    const clean = defaultParseHealth();
    await chrome.storage.local.set({ [UI_KEYS.health]: clean });
    return clean;
  }

  let mergedFirst: number | undefined;
  let mergedLast: number | undefined;
  if (prev.status === 'degraded') {
    if (
      prev.firstFailureAt !== undefined &&
      prev.lastFailureAt !== undefined &&
      report.firstFailureAt !== undefined &&
      report.lastFailureAt !== undefined
    ) {
      mergedFirst = Math.min(prev.firstFailureAt, report.firstFailureAt);
      mergedLast = Math.max(
        prev.lastFailureAt,
        report.lastFailureAt,
        mergedFirst + PARSE_HEALTH_MIN_SPAN_MS
      );
    } else if (
      prev.firstFailureAt !== undefined &&
      prev.lastFailureAt !== undefined
    ) {
      mergedFirst = prev.firstFailureAt;
      mergedLast = prev.lastFailureAt;
    } else if (
      report.firstFailureAt !== undefined &&
      report.lastFailureAt !== undefined
    ) {
      mergedFirst = report.firstFailureAt;
      mergedLast = report.lastFailureAt;
    }
  } else if (
    report.firstFailureAt !== undefined &&
    report.lastFailureAt !== undefined
  ) {
    mergedFirst = report.firstFailureAt;
    mergedLast = report.lastFailureAt;
  }

  const next: ParseHealthState =
    prev.status === 'degraded'
      ? {
          status: 'degraded',
          consecutiveZeroCount: Math.max(
            prev.consecutiveZeroCount,
            report.consecutiveZeroCount
          ),
          ...(mergedFirst !== undefined && mergedLast !== undefined
            ? { firstFailureAt: mergedFirst, lastFailureAt: mergedLast }
            : {}),
          endpoints: [
            ...new Set([...prev.endpoints, ...report.endpoints]),
          ].slice(0, CORE_GRAPHQL_OPS.length),
          topKeys: [...new Set([...prev.topKeys, ...report.topKeys])].slice(
            0,
            PARSE_HEALTH_MAX_TOP_KEYS
          ),
          ...(prev.dismissedAt !== undefined
            ? { dismissedAt: prev.dismissedAt }
            : {}),
        }
      : {
          ...report,
          ...(mergedFirst !== undefined && mergedLast !== undefined
            ? { firstFailureAt: mergedFirst, lastFailureAt: mergedLast }
            : {}),
        };

  await chrome.storage.local.set({ [UI_KEYS.health]: next });
  return next;
}

export async function dismissParseHealth(): Promise<ParseHealthState> {
  const prev = await readParseHealth();
  if (prev.status !== 'degraded') return prev;
  const next: ParseHealthState = {
    ...prev,
    dismissedAt: Date.now(),
  };
  await chrome.storage.local.set({ [UI_KEYS.health]: next });
  return next;
}

export async function recoverConfig(expected: string) {
  const e = getActiveErrors();
  const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
  const rawConfig = data[STORAGE_KEYS.CONFIG];
  assert(digest(rawConfig) === expected, e.configChangedReload);
  const fresh = createDefaultConfig();
  if (
    rawConfig &&
    typeof rawConfig === 'object' &&
    !Array.isArray(rawConfig)
  ) {
    const raw = rawConfig as Record<string, unknown>;
    if (isUILocaleSetting(raw.locale)) {
      fresh.locale = raw.locale;
    }
    if (isUIThemeSetting(raw.theme)) {
      fresh.theme = raw.theme;
    }
  }
  setActiveLocaleSetting(fresh.locale);
  await chrome.storage.local.set({
    [UI_KEYS.backup]: {
      config: rawConfig,
      savedAt: Date.now(),
    },
    [STORAGE_KEYS.CONFIG]: fresh,
  });
}

export async function initializeStorage() {
  await enqueue(async () => {
    const data = await chrome.storage.local.get(null);
    const updates: Record<string, unknown> = {};
    if (data[STORAGE_KEYS.CONFIG] === undefined) {
      const fresh = createDefaultConfig();
      fresh.onboardingDismissed = false;
      setActiveLocaleSetting(fresh.locale);
      updates[STORAGE_KEYS.CONFIG] = fresh;
    } else {
      try {
        const cfg = validateConfig(data[STORAGE_KEYS.CONFIG]);
        setActiveLocaleSetting(cfg.locale);
      } catch {
        // Preserve corrupt config for recovery backup below
      }
      if (data[UI_KEYS.backup] === undefined)
        updates[UI_KEYS.backup] = {
          savedAt: Date.now(),
          config: data[STORAGE_KEYS.CONFIG],
        };
    }
    if (data[UI_KEYS.stats] === undefined) {
      const old = data[STORAGE_KEYS.STATS];
      updates[UI_KEYS.stats] = {
        ...defaultStats(),
        totalBlocked: Number.isFinite(old?.totalBlocked) ? old.totalBlocked : 0,
        byRule: old?.byRule ?? {},
        ...(old ? { partialDay: localDate() } : {}),
      };
    }
    if (data[UI_KEYS.sync] === undefined)
      updates[UI_KEYS.sync] = {
        status: 'idle',
        source: data[STORAGE_KEYS.CROWD_SNAPSHOT] ? 'cache' : 'builtin',
      };
    if (data[UI_KEYS.sync]?.status === 'syncing')
      updates[UI_KEYS.sync] = {
        ...data[UI_KEYS.sync],
        status: 'error',
        error: getActiveErrors().restartedSyncInterrupted,
      };
    if (data[UI_KEYS.cloudSync] === undefined) {
      updates[UI_KEYS.cloudSync] = defaultCloudSyncMeta();
    } else if (data[UI_KEYS.cloudSync]?.status === 'syncing') {
      updates[UI_KEYS.cloudSync] = {
        ...normalizeCloudSyncMeta(data[UI_KEYS.cloudSync]),
        status: 'idle',
      };
    }
    if (data[UI_KEYS.health] === undefined) {
      updates[UI_KEYS.health] = defaultParseHealth();
    }
    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
  });
}

export async function readState(): Promise<AppState> {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.CONFIG,
    STORAGE_KEYS.CROWD_SNAPSHOT,
    STORAGE_KEYS.INTERCEPTION_LOGS,
    ...Object.values(UI_KEYS),
  ]);
  const config =
    data[STORAGE_KEYS.CONFIG] === undefined
      ? createDefaultConfig()
      : validateConfig(data[STORAGE_KEYS.CONFIG]);
  setActiveLocaleSetting(config.locale);
  const e = getErrors(config.locale);
  let snapshot = createDefaultCrowdSnapshot();
  let sync = data[UI_KEYS.sync] ?? { status: 'idle', source: 'builtin' };
  if (data[STORAGE_KEYS.CROWD_SNAPSHOT]) {
    try {
      snapshot = validateSnapshot(data[STORAGE_KEYS.CROWD_SNAPSHOT]);
    } catch {
      sync = {
        ...sync,
        status: 'error',
        source: 'builtin',
        error: e.corruptSnapshotFallback,
      };
    }
  }
  return {
    config,
    snapshot,
    sync,
    cloudSync: normalizeCloudSyncMeta(data[UI_KEYS.cloudSync]),
    health: normalizeParseHealth(data[UI_KEYS.health]),
    stats: rollStats(data[UI_KEYS.stats] ?? defaultStats()),
    logs: data[STORAGE_KEYS.INTERCEPTION_LOGS] ?? [],
    operations: data[UI_KEYS.operations] ?? [],
    imports: data[UI_KEYS.imports] ?? [],
  };
}

export async function appendLogs(entries: InterceptionLogEntry[]) {
  if (!Array.isArray(entries)) return;
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.INTERCEPTION_LOGS,
    UI_KEYS.stats,
    UI_KEYS.seenTweets,
  ]);
  const old: InterceptionLogEntry[] = Array.isArray(
    data[STORAGE_KEYS.INTERCEPTION_LOGS]
  )
    ? data[STORAGE_KEYS.INTERCEPTION_LOGS]
    : [];
  // Keep deduplication independent of the 200 visible logs and manual clearing.
  // Only IDs are retained, bounded to the most recent 10,000 unique tweets.
  const seenRaw: unknown[] = Array.isArray(data[UI_KEYS.seenTweets])
    ? data[UI_KEYS.seenTweets]
    : [];
  const seen = new Set<string>([
    ...seenRaw.filter((id): id is string => typeof id === 'string'),
    ...old
      .map((x) => x?.tweetId)
      .filter((id): id is string => typeof id === 'string'),
  ]);
  const fresh: InterceptionLogEntry[] = [];
  const limit = Math.min(entries.length, MAX_LOG_BATCH);
  for (let i = 0; i < limit; i++) {
    const desc = Object.getOwnPropertyDescriptor(entries, i);
    if (
      !desc ||
      !('value' in desc) ||
      typeof desc.get === 'function' ||
      typeof desc.set === 'function'
    ) {
      continue;
    }
    const clean = sanitizeLogEntry(desc.value);
    if (!clean || seen.has(clean.tweetId)) continue;
    seen.add(clean.tweetId);
    fresh.push(clean);
  }
  const stats = rollStats(data[UI_KEYS.stats] ?? defaultStats());
  if (
    !stats.byRule ||
    typeof stats.byRule !== 'object' ||
    Array.isArray(stats.byRule)
  ) {
    stats.byRule = {};
  }
  const bucketByDate = new Map(
    (stats.dailyHistory ?? []).map((entry) => [entry.date, entry])
  );
  const nonAdFresh: InterceptionLogEntry[] = [];
  for (const entry of fresh) {
    const prevCount =
      Object.prototype.hasOwnProperty.call(stats.byRule, entry.ruleId) &&
      typeof stats.byRule[entry.ruleId] === 'number' &&
      Number.isFinite(stats.byRule[entry.ruleId])
        ? stats.byRule[entry.ruleId]
        : 0;
    stats.byRule[entry.ruleId] = prevCount + 1;
    const entryDate = localDate(new Date(entry.timestamp));
    const isToday = entryDate === stats.todayDate;
    const bucket = bucketByDate.get(entryDate);
    if (entry.ruleId === 'promoted_ad') {
      stats.totalAdsHidden = (stats.totalAdsHidden ?? 0) + 1;
      if (isToday) stats.todayAdsHidden = (stats.todayAdsHidden ?? 0) + 1;
      if (bucket) bucket.ads += 1;
    } else {
      stats.totalBlocked++;
      if (isToday) stats.todayBlocked++;
      if (bucket) bucket.blocked += 1;
      nonAdFresh.push(entry);
    }
  }
  await chrome.storage.local.set({
    [UI_KEYS.seenTweets]: [...seen].slice(-10000),
    [STORAGE_KEYS.INTERCEPTION_LOGS]: [...nonAdFresh, ...old].slice(0, 200),
    [UI_KEYS.stats]: stats,
  });
}
