/**
 * Milestone 3: Hero Interactive Sandbox Simulator
 * TypeScript Type Definitions
 */

export type SandboxPreset = 'mild' | 'standard' | 'extreme';
export type PresetLevel = 'mild' | 'standard' | 'extreme';
export type SandboxDisplayMode = 'folded' | 'hide';
export type SandboxScene = 'for_you' | 'following';

export type SandboxNoiseCategory =
  | 'impersonator'    // Thread-Author Impersonator / 高仿原推主 (mild)
  | 'ads'             // Promoted Ads / 赞助广告 (mild; active in Following bypass)
  | 'giveaway'        // Engagement & Giveaway Bait / 口令抽奖引流 (standard)
  | 'crypto'          // Cloud Clichés & Crypto Shilling / 币圈土狗喊单 (standard)
  | 'duplicate_reply' // Same-Thread Duplicate Reply Spam / 同贴复读水军 (standard, v0.2.0)
  | 'grok_summon'     // Short @grok Summon Spam / @grok 短召唤刷屏 (extreme, v0.2.0)
  | 'short_reply';    // Verified Short/AI Spam / 蓝标无意义水评 (extreme)

export interface TweetAuthor {
  name: string;
  handle: string;
  avatar: string;
  isVerified?: boolean;
  isBlueVerified?: boolean;
  isAuthor?: boolean;
  isImpersonator?: boolean;
  isOfficialGrok?: boolean;
  dailyPostsRate?: string;
  followersCount?: string;
  accountAge?: string;
  bio?: string;
}

export interface TweetMetrics {
  replies: number;
  retweets: number;
  likes: number;
  views?: string;
}

export interface TweetFilterReason {
  category: SandboxNoiseCategory;
  ruleId: string;
  ruleName: string;
  evidence: string;
  presetLevel: PresetLevel;
}

export interface SandboxTweet {
  id: string;
  author: TweetAuthor;
  content: string;
  createdAt: string;
  metrics: TweetMetrics;
  isOriginalPost?: boolean;
  isReplyTo?: string;
  filterReason?: TweetFilterReason;
  sponsoredTag?: string;
  protectedNotice?: string;
  duplicateRole?: 'first_kept' | 'duplicate_blocked';
  duplicateNotice?: string;
}

export interface LocalizedSandboxData {
  originalPost: SandboxTweet;
  replies: SandboxTweet[];
}

export type SandboxDatasetLocale = 'zh-CN' | 'zh-TW' | 'en';

export interface UndoOperation {
  id: string;
  tweetId: string;
  authorHandle: string;
  authorName: string;
  createdAt: number;
  undoUntil: number; // Date.now() + 4500
  durationMs: number;
  status: 'active' | 'restored' | 'expired';
}

export interface FilterState {
  masterEnabled: boolean;
  preset: SandboxPreset;
  displayMode: SandboxDisplayMode;
  scene?: SandboxScene;
  categories: Record<SandboxNoiseCategory, boolean>;
  manuallyBlockedIds: Set<string>;
  restoredTweetIds: Set<string>;
  whitelistedHandles: Set<string>;
}

export const PRESET_WEIGHT: Record<PresetLevel, number> = {
  mild: 1,
  standard: 2,
  extreme: 3,
};

/**
 * Normalizes an author handle to guarantee exactly one leading '@' symbol.
 * Idempotent: formatHandle(formatHandle(h)) === formatHandle(h).
 * Handles:
 *  - '@keepxclean'  -> '@keepxclean'
 *  - 'keepxclean'   -> '@keepxclean'
 *  - '@@keepxclean' -> '@keepxclean'
 *  - '' | null | undefined -> ''
 */
export function formatHandle(handle?: string | null): string {
  if (!handle) return '';
  const clean = handle.replace(/^@+/, '');
  return clean ? `@${clean}` : '@';
}

/**
 * Normalizes an author handle for case-insensitive, '@' prefix-insensitive comparison.
 */
export function normalizeSandboxHandle(handle: string): string {
  return handle.trim().replace(/^@+/, '').toLowerCase();
}

const KNOWN_SANDBOX_CATEGORIES = new Set<string>([
  'impersonator',
  'ads',
  'giveaway',
  'crypto',
  'duplicate_reply',
  'grok_summon',
  'short_reply',
]);

/**
 * Pure evaluation function to determine if a tweet should be intercepted.
 */
export function isTweetIntercepted(
  tweet: SandboxTweet,
  state: FilterState
): boolean {
  // 1. Manually blocked tweets are always intercepted (even in Following bypass or master OFF)
  if (state.manuallyBlockedIds.has(tweet.id)) {
    return true;
  }

  // 2. Master toggle OFF allows all (except manual blocks)
  if (!state.masterEnabled) {
    return false;
  }

  // 3. Original post is never intercepted
  if (tweet.isOriginalPost) {
    return false;
  }

  // 4. Whitelisted author handles bypass filtering
  const cleanHandle = normalizeSandboxHandle(tweet.author.handle);
  if (cleanHandle.length > 0) {
    if (
      state.whitelistedHandles.has(cleanHandle) ||
      state.whitelistedHandles.has(tweet.author.handle)
    ) {
      return false;
    }
    for (const whitelisted of state.whitelistedHandles) {
      if (normalizeSandboxHandle(whitelisted) === cleanHandle) {
        return false;
      }
    }
  }

  // 5. Restored tweets bypass automatic filtering
  if (state.restoredTweetIds.has(tweet.id)) {
    return false;
  }

  // 6. Clean discussion tweets (including protected official @grok & 1st kept replies) have no filterReason
  if (!tweet.filterReason) {
    return false;
  }

  const { category, presetLevel } = tweet.filterReason;

  // 6.5. v0.2.0 Following scene bypass: skip automatic heuristic rules while keeping promoted ads & manual blocks
  const effectiveScene: SandboxScene = state.scene ?? 'for_you';
  if (effectiveScene === 'following' && category !== 'ads') {
    return false;
  }

  // 7. Check category toggle (reject unknown categories; use own-property lookup;
  //    default omitted v0.2.0 keys ON for legacy 5-key callers only when all provided keys are enabled)
  if (!KNOWN_SANDBOX_CATEGORIES.has(category)) {
    return false;
  }
  const categoryEntries = Object.entries(state.categories);
  if (categoryEntries.length === 0) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(state.categories, category)) {
    if (!state.categories[category]) {
      return false;
    }
  } else if (!categoryEntries.every(([, enabled]) => Boolean(enabled))) {
    return false;
  }

  // 8. Check preset threshold
  return PRESET_WEIGHT[state.preset] >= PRESET_WEIGHT[presetLevel];
}
