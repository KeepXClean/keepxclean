import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  isUILocaleSetting,
  STORAGE_KEYS,
  type FilterConfig,
  type InterceptionLogEntry,
} from '@keepxclean/shared';
import { getActiveErrors, getErrors } from '../i18n/errors';
import { setActiveLocaleSetting } from '../i18n/state';
import {
  defaultStats,
  digest,
  localDate,
  UI_KEYS,
  type AppState,
  type Stats,
} from '../services/model';
import { assert, validateConfig, validateSnapshot } from '../services/validation';
import { serialQueue } from './config';

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
export async function writeConfig(config: FilterConfig) {
  const validated = validateConfig(config);
  setActiveLocaleSetting(validated.locale);
  await chrome.storage.local.set({
    [STORAGE_KEYS.CONFIG]: validated,
  });
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
    !Array.isArray(rawConfig) &&
    isUILocaleSetting((rawConfig as Record<string, unknown>).locale)
  ) {
    fresh.locale = (rawConfig as { locale: typeof fresh.locale }).locale;
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
export function rollStats(stats: Stats): Stats {
  return stats.todayDate === localDate()
    ? stats
    : {
        ...stats,
        todayDate: localDate(),
        todayBlocked: 0,
        todayAdsHidden: 0,
        partialDay: undefined,
      };
}
export async function initializeStorage() {
  await enqueue(async () => {
    const data = await chrome.storage.local.get(null);
    const updates: Record<string, unknown> = {};
    if (data[STORAGE_KEYS.CONFIG] === undefined) {
      const fresh = createDefaultConfig();
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
    stats: rollStats(data[UI_KEYS.stats] ?? defaultStats()),
    logs: data[STORAGE_KEYS.INTERCEPTION_LOGS] ?? [],
    operations: data[UI_KEYS.operations] ?? [],
    imports: data[UI_KEYS.imports] ?? [],
  };
}
export async function appendLogs(entries: InterceptionLogEntry[]) {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.INTERCEPTION_LOGS,
    UI_KEYS.stats,
    UI_KEYS.seenTweets,
  ]);
  const old: InterceptionLogEntry[] =
    data[STORAGE_KEYS.INTERCEPTION_LOGS] ?? [];
  // Keep deduplication independent of the 200 visible logs and manual clearing.
  // Only IDs are retained, bounded to the most recent 10,000 unique tweets.
  const seen = new Set<string>([
    ...(data[UI_KEYS.seenTweets] ?? []),
    ...old.map((x) => x.tweetId),
  ]);
  const fresh = entries.filter(
    (x) =>
      x &&
      /^\d+$/.test(x.tweetId) &&
      typeof x.reasonText === 'string' &&
      Number.isFinite(x.timestamp) &&
      !seen.has(x.tweetId) &&
      !!seen.add(x.tweetId)
  );
  const stats = rollStats(data[UI_KEYS.stats] ?? defaultStats());
  const nonAdFresh: InterceptionLogEntry[] = [];
  for (const entry of fresh) {
    stats.byRule[entry.ruleId] = (stats.byRule[entry.ruleId] ?? 0) + 1;
    const isToday = localDate(new Date(entry.timestamp)) === stats.todayDate;
    if (entry.ruleId === 'promoted_ad') {
      stats.totalAdsHidden = (stats.totalAdsHidden ?? 0) + 1;
      if (isToday) stats.todayAdsHidden = (stats.todayAdsHidden ?? 0) + 1;
    } else {
      stats.totalBlocked++;
      if (isToday) stats.todayBlocked++;
      nonAdFresh.push(entry);
    }
  }
  await chrome.storage.local.set({
    [UI_KEYS.seenTweets]: [...seen].slice(-10000),
    [STORAGE_KEYS.INTERCEPTION_LOGS]: [...nonAdFresh, ...old].slice(0, 200),
    [UI_KEYS.stats]: stats,
  });
}
