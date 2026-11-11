import type {
  AccountListEntry,
  BlockReasonTag,
  CrowdBlockSnapshot,
  FilterConfig,
  FilterRulesConfig,
  InterceptionLogEntry,
  KeywordRuleItem,
  ViewerProfile,
} from '@keepxclean/shared';

export const UI_KEYS = {
  seenTweets: 'kxc_seen_tweets_v1',
  stats: 'kxc_stats_v2',
  sync: 'kxc_sync_v1',
  operations: 'kxc_operations_v1',
  imports: 'kxc_imports_v1',
  backup: 'kxc_pre_ui_config_backup',
  viewers: 'kxc_tab_viewers_v1',
} as const;
export interface Stats {
  todayDate: string;
  todayBlocked: number;
  totalBlocked: number;
  byRule: Record<string, number>;
  partialDay?: string;
}
export interface SyncMeta {
  status: 'idle' | 'syncing' | 'success' | 'error';
  source: 'builtin' | 'cache' | 'network';
  lastAttempt?: number;
  lastSuccess?: number;
  origin?: string;
  error?: string;
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
  logs: InterceptionLogEntry[];
  operations: Operation[];
  imports: ImportJob[];
}
export type ConfigPatch = Partial<
  Pick<
    FilterConfig,
    | 'enabled'
    | 'interceptionMode'
    | 'exemptFollowing'
    | 'profileSceneBadgeOnly'
    | 'syncNativeXBlock'
    | 'enableCrowdReport'
    | 'enableCloudKeywords'
    | 'customApiBaseUrl'
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
  | { type: 'account.save'; list: 'black' | 'white'; entry: AccountListEntry }
  | { type: 'account.delete'; list: 'black' | 'white'; uid: string }
  | { type: 'logs.clear' }
  | { type: 'logs.append'; entries: InterceptionLogEntry[] }
  | { type: 'snapshot.refresh' }
  | { type: 'viewer.set'; viewer: ViewerProfile }
  | { type: 'tabs.list' }
  | { type: 'options.open'; page?: string }
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
}
export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function defaultStats(): Stats {
  return {
    todayDate: localDate(),
    todayBlocked: 0,
    totalBlocked: 0,
    byRule: {},
  };
}
export function digest(value: unknown): string {
  return JSON.stringify(value);
}
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
