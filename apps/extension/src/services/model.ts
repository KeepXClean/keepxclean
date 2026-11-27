import type {
  AccountListEntry,
  BlockReasonTag,
  CloudKeywordLangGroup,
  CrowdBlockSnapshot,
  DomainRuleItem,
  FilterConfig,
  FilterRulesConfig,
  InterceptionLogEntry,
  KeywordRuleItem,
  MatchedTarget,
  ViewerProfile,
} from '@keepxclean/shared';
import {
  defaultParseHealth,
  type ParseHealthReport,
  type ParseHealthState,
  type ParseHealthStatus,
} from './parse-health';

export {
  defaultParseHealth,
  type ParseHealthReport,
  type ParseHealthState,
  type ParseHealthStatus,
};

export const UI_KEYS = {
  seenTweets: 'kxc_seen_tweets_v1',
  stats: 'kxc_stats_v2',
  sync: 'kxc_sync_v1',
  operations: 'kxc_operations_v1',
  imports: 'kxc_imports_v1',
  backup: 'kxc_pre_ui_config_backup',
  viewers: 'kxc_tab_viewers_v1',
  cloudSync: 'kxc_cloud_sync_v1',
  health: 'kxc_health_v1',
} as const;
export interface DailyStatEntry {
  date: string;
  blocked: number;
  ads: number;
}
export interface Stats {
  todayDate: string;
  todayBlocked: number;
  totalBlocked: number;
  todayAdsHidden?: number;
  totalAdsHidden?: number;
  byRule: Record<string, number>;
  partialDay?: string;
  dailyHistory?: DailyStatEntry[];
}
export interface ResolvedAccount {
  uid: string;
  screenName: string;
  name?: string;
  avatarUrl?: string;
}
export interface SyncMeta {
  status: 'idle' | 'syncing' | 'success' | 'error';
  source: 'builtin' | 'cache' | 'network';
  lastAttempt?: number;
  lastSuccess?: number;
  origin?: string;
  error?: string;
}
export type SyncedConfigFields = Pick<
  FilterConfig,
  | 'enabled'
  | 'preset'
  | 'interceptionMode'
  | 'sceneModes'
  | 'exemptFollowing'
  | 'profileSceneBadgeOnly'
  | 'locale'
  | 'theme'
  | 'enableCloudKeywords'
  | 'enabledCloudLangGroups'
  | 'disabledCloudKeywordIds'
  | 'rules'
  | 'installedPacks'
>;
export type SyncedConfigPayload = { version: 1 } & SyncedConfigFields;
export type CloudSyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'conflict'
  | 'quota_exceeded'
  | 'error';
export type CloudSyncStrategy = 'local' | 'remote' | 'merge';
export interface CloudSyncMeta {
  enabled: boolean;
  status: CloudSyncStatus;
  lastPushAt?: number;
  lastPullAt?: number;
  bytesUsed?: number;
  chunkCount?: number;
  error?: string;
  pendingRemote?: SyncedConfigPayload;
  remoteUpdatedAt?: number;
  deviceId?: string;
  lastSyncedSha256?: string;
}
export type Stage =
  | 'not_requested'
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'not_counted'
  | 'failed'
  | 'unknown'
  | 'cancelled';
export interface Operation {
  id: string;
  entry: AccountListEntry;
  createdAt: number;
  undoUntil: number;
  tabId?: number;
  viewerUid?: string;
  followers?: number;
  local: Stage;
  nativeX: Stage;
  community: Stage;
  errors: Partial<Record<'nativeX' | 'community', string>>;
  previousBlack?: AccountListEntry;
  previousWhite?: AccountListEntry;
  savedEntry?: AccountListEntry;
  cancelled?: boolean;
}
export interface ImportJob {
  id: string;
  tabId: number;
  viewerUid?: string;
  createdAt: number;
  status:
    | 'reading'
    | 'preview'
    | 'saving'
    | 'sharing'
    | 'done'
    | 'error'
    | 'cancelled';
  ids: string[];
  invalid: number;
  pages: number;
  error?: string;
  localAdded: number;
  skipped: number;
  communityAdded: number;
  communityNotCounted: number;
  failedBatches: string[][];
  completedBatches: number;
  cancelRequested?: boolean;
}
export interface AppState {
  config: FilterConfig;
  snapshot: CrowdBlockSnapshot;
  stats: Stats;
  sync: SyncMeta;
  cloudSync: CloudSyncMeta;
  health: ParseHealthState;
  logs: InterceptionLogEntry[];
  operations: Operation[];
  imports: ImportJob[];
}
export type ConfigPatch = Partial<
  Pick<
    FilterConfig,
    | 'locale'
    | 'theme'
    | 'enabled'
    | 'interceptionMode'
    | 'sceneModes'
    | 'exemptFollowing'
    | 'profileSceneBadgeOnly'
    | 'syncNativeXBlock'
    | 'enableCrowdReport'
    | 'enableCloudKeywords'
    | 'enabledCloudLangGroups'
    | 'disabledCloudKeywordIds'
    | 'customApiBaseUrl'
    | 'onboardingDismissed'
  >
> & {
  rules?: {
    [K in keyof FilterRulesConfig]?: Partial<
      Omit<FilterRulesConfig[K], 'items'>
    >;
  };
};
export type Command =
  | { type: 'state.get' }
  | { type: 'config.patch'; patch: ConfigPatch }
  | { type: 'config.preset'; preset: 'light' | 'standard' | 'strict' }
  | { type: 'config.replace'; config: unknown; expected: string }
  | { type: 'config.reset'; expected: string }
  | { type: 'config.recover'; expected: string }
  | { type: 'keyword.save'; item: KeywordRuleItem; expected?: string }
  | { type: 'keyword.delete'; id: string; expected: string }
  | { type: 'domain.save'; item: DomainRuleItem; expected?: string }
  | { type: 'domain.delete'; id: string; expected: string }
  | { type: 'cloudKeyword.toggle'; id: string; enabled: boolean }
  | {
      type: 'cloudKeyword.customize';
      sourceId: string;
      item: KeywordRuleItem;
    }
  | {
      type: 'cloudLangGroup.toggle';
      group: CloudKeywordLangGroup;
      enabled: boolean;
    }
  | { type: 'target.disable'; target: MatchedTarget }
  | { type: 'pack.install'; pack: unknown }
  | { type: 'pack.toggle'; id: string; enabled: boolean }
  | { type: 'pack.uninstall'; id: string }
  | { type: 'cloudSync.enable' }
  | { type: 'cloudSync.resolve'; strategy: CloudSyncStrategy }
  | { type: 'cloudSync.disable' }
  | { type: 'cloudSync.pushNow' }
  | { type: 'health.update'; report: ParseHealthReport }
  | { type: 'health.dismiss' }
  | { type: 'account.save'; list: 'black' | 'white'; entry: AccountListEntry }
  | { type: 'account.delete'; list: 'black' | 'white'; uid: string }
  | { type: 'account.resolve'; query: string }
  | { type: 'logs.clear' }
  | { type: 'logs.append'; entries: InterceptionLogEntry[] }
  | { type: 'snapshot.refresh' }
  | { type: 'viewer.set'; viewer: ViewerProfile }
  | { type: 'tabs.list' }
  | { type: 'tabs.reloadX' }
  | { type: 'options.open'; page?: string; query?: Record<string, string> }
  | {
      type: 'block.start';
      entry: AccountListEntry;
      followers?: number;
      nativeAlreadyDone?: boolean;
    }
  | { type: 'block.reason'; id: string; tag: BlockReasonTag }
  | { type: 'block.undo'; id: string }
  | { type: 'block.retry'; id: string; stage: 'nativeX' | 'community' }
  | { type: 'import.read'; tabId: number }
  | { type: 'import.apply'; id: string; share: boolean; moveConflicts: boolean }
  | { type: 'import.cancel'; id: string }
  | { type: 'import.retry'; id: string };
export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };
export interface NativeResult {
  ok: boolean;
  error?: string;
  code?: string;
  ids?: string[];
  nextCursor?: string;
  viewerUid?: string;
  user?: ResolvedAccount;
}
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function trailingLocalDates(days = 7, now = new Date()): string[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    // Local noon avoids DST spring-forward / fall-back midnight edge cases.
    dates.push(localDate(new Date(year, month, day - i, 12, 0, 0, 0)));
  }
  return dates;
}
export function defaultStats(now = new Date()): Stats {
  return {
    todayDate: localDate(now),
    todayBlocked: 0,
    totalBlocked: 0,
    todayAdsHidden: 0,
    totalAdsHidden: 0,
    byRule: {},
    dailyHistory: trailingLocalDates(7, now).map((date) => ({
      date,
      blocked: 0,
      ads: 0,
    })),
  };
}
export function rollStats(stats: Stats, now = new Date()): Stats {
  const today = localDate(now);
  const windowDates = trailingLocalDates(7, now);
  const byDate = new Map<string, DailyStatEntry>();

  if (Array.isArray(stats.dailyHistory)) {
    for (const item of stats.dailyHistory) {
      if (
        !item ||
        typeof item.date !== 'string' ||
        !LOCAL_DATE_RE.test(item.date)
      ) {
        continue;
      }
      const blocked =
        typeof item.blocked === 'number' &&
        Number.isFinite(item.blocked) &&
        item.blocked > 0
          ? Math.floor(item.blocked)
          : 0;
      const ads =
        typeof item.ads === 'number' &&
        Number.isFinite(item.ads) &&
        item.ads > 0
          ? Math.floor(item.ads)
          : 0;
      const prev = byDate.get(item.date);
      byDate.set(item.date, {
        date: item.date,
        blocked: (prev?.blocked ?? 0) + blocked,
        ads: (prev?.ads ?? 0) + ads,
      });
    }
  }

  // Hydrate v0.1.2 stats that lack dailyHistory by seeding todayDate's bucket.
  if (
    typeof stats.todayDate === 'string' &&
    LOCAL_DATE_RE.test(stats.todayDate) &&
    !byDate.has(stats.todayDate)
  ) {
    const seedBlocked =
      typeof stats.todayBlocked === 'number' &&
      Number.isFinite(stats.todayBlocked) &&
      stats.todayBlocked > 0
        ? Math.floor(stats.todayBlocked)
        : 0;
    const seedAds =
      typeof stats.todayAdsHidden === 'number' &&
      Number.isFinite(stats.todayAdsHidden) &&
      stats.todayAdsHidden > 0
        ? Math.floor(stats.todayAdsHidden)
        : 0;
    if (seedBlocked > 0 || seedAds > 0) {
      byDate.set(stats.todayDate, {
        date: stats.todayDate,
        blocked: seedBlocked,
        ads: seedAds,
      });
    }
  }

  const dailyHistory: DailyStatEntry[] = windowDates.map((date) => {
    const existing = byDate.get(date);
    return existing
      ? { date, blocked: existing.blocked, ads: existing.ads }
      : { date, blocked: 0, ads: 0 };
  });

  if (stats.todayDate === today) {
    return { ...stats, dailyHistory };
  }

  return {
    ...stats,
    todayDate: today,
    todayBlocked: 0,
    todayAdsHidden: 0,
    partialDay: undefined,
    dailyHistory,
  };
}
export function defaultCloudSyncMeta(): CloudSyncMeta {
  return {
    enabled: false,
    status: 'idle',
  };
}
export function digest(value: unknown): string {
  return JSON.stringify(value);
}
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function unconfirmedError(
  message: string
): Error & { unconfirmed: true } {
  return Object.assign(new Error(message), { unconfirmed: true as const });
}
export function isUnconfirmedError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as { unconfirmed?: boolean }).unconfirmed === true
  );
}
export function notFoundError(message: string): Error & { notFound: true } {
  return Object.assign(new Error(message), { notFound: true as const });
}
export function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as { notFound?: boolean }).notFound === true
  );
}
