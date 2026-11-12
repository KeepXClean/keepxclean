/**
 * Milestone 3: Hero Interactive Sandbox Simulator
 * TypeScript Type Definitions
 */

export type SandboxPreset = 'mild' | 'standard' | 'extreme';
export type PresetLevel = 'mild' | 'standard' | 'extreme';
export type SandboxDisplayMode = 'folded' | 'hide';

export type SandboxNoiseCategory =
  | 'impersonator'  // Thread-Author Impersonator / 高仿原推主
  | 'short_reply'   // Verified Short/AI Spam / 蓝标无意义水评
  | 'giveaway'      // Engagement & Giveaway Bait / 口令抽奖引流
  | 'crypto'        // Cloud Clichés & Crypto Shilling / 币圈土狗喊单
  | 'ads';          // Promoted Ads / 赞助广告

export interface TweetAuthor {
  name: string;
  handle: string;
  avatar: string;
  isVerified?: boolean;
  isBlueVerified?: boolean;
  isAuthor?: boolean;
  isImpersonator?: boolean;
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
 * Pure evaluation function to determine if a tweet should be intercepted.
 */
export function isTweetIntercepted(
  tweet: SandboxTweet,
  state: FilterState
): boolean {
  // 1. Manually blocked tweets are always intercepted
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
  const cleanHandle = tweet.author.handle.replace(/^@/, '').toLowerCase();
  if (state.whitelistedHandles.has(cleanHandle) || state.whitelistedHandles.has(tweet.author.handle)) {
    return false;
  }

  // 5. Restored tweets bypass automatic filtering
  if (state.restoredTweetIds.has(tweet.id)) {
    return false;
  }

  // 6. Clean discussion tweets have no filterReason
  if (!tweet.filterReason) {
    return false;
  }

  const { category, presetLevel } = tweet.filterReason;

  // 7. Check category toggle
  if (!state.categories[category]) {
    return false;
  }

  // 8. Check preset threshold
  return PRESET_WEIGHT[state.preset] >= PRESET_WEIGHT[presetLevel];
}
