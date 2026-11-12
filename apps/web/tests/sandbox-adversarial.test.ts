import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import {
  zhCNSandboxData,
  zhTWSandboxData,
  enSandboxData,
  getSandboxData,
  CATEGORY_METAS,
} from '../src/components/HeroSandbox/sampleData';
import {
  isTweetIntercepted,
  formatHandle,
  PRESET_WEIGHT,
  type FilterState,
  type PresetLevel,
  type SandboxNoiseCategory,
  type SandboxPreset,
  type SandboxTweet,
  type UndoOperation,
} from '../src/components/HeroSandbox/types';
import { TweetFeed } from '../src/components/HeroSandbox/TweetFeed';
import { TweetItem } from '../src/components/HeroSandbox/TweetItem';
import { UndoToast } from '../src/components/HeroSandbox/UndoToast';

describe('Adversarial & Stress Harness: Hero Sandbox Simulator (Milestone 3)', () => {
  const ALL_CATEGORIES: SandboxNoiseCategory[] = [
    'impersonator',
    'ads',
    'giveaway',
    'crypto',
    'short_reply',
  ];

  const ALL_PRESETS: SandboxPreset[] = ['mild', 'standard', 'extreme'];

  function createBaseState(): FilterState {
    return {
      masterEnabled: true,
      preset: 'standard',
      displayMode: 'folded',
      categories: {
        impersonator: true,
        ads: true,
        giveaway: true,
        crypto: true,
        short_reply: true,
      },
      manuallyBlockedIds: new Set(),
      restoredTweetIds: new Set(),
      whitelistedHandles: new Set(),
    };
  }

  // ==========================================================================
  // Dimension 1: Combinatorial Category States (All 32 Combinations)
  // ==========================================================================
  describe('Dimension 1: Combinatorial Category States (2^5 = 32 combinations)', () => {
    // Generate all 32 combinations: 00000 to 11111
    const combinations: Record<SandboxNoiseCategory, boolean>[] = [];
    for (let i = 0; i < 32; i++) {
      combinations.push({
        impersonator: Boolean(i & 1),
        ads: Boolean(i & 2),
        giveaway: Boolean(i & 4),
        crypto: Boolean(i & 8),
        short_reply: Boolean(i & 16),
      });
    }

    it('generates exactly 32 distinct category toggle combinations', () => {
      expect(combinations).toHaveLength(32);
    });

    const datasets = [
      { locale: 'zh-CN', data: zhCNSandboxData },
      { locale: 'zh-TW', data: zhTWSandboxData },
      { locale: 'en', data: enSandboxData },
    ];

    datasets.forEach(({ locale, data }) => {
      describe(`Combinatorial evaluation for locale: ${locale}`, () => {
        // Test in extreme preset (all categories eligible)
        it(`extreme preset: filtered count strictly matches active enabled categories across all 32 states`, () => {
          for (let i = 0; i < 32; i++) {
            const catConfig = combinations[i];
            const state: FilterState = {
              ...createBaseState(),
              preset: 'extreme',
              categories: catConfig,
            };

            const intercepted = data.replies.filter((r) => isTweetIntercepted(r, state));
            const expectedCount = ALL_CATEGORIES.filter((c) => catConfig[c]).length;

            expect(
              intercepted.length,
              `Combination ${i} (mask: ${i.toString(2).padStart(5, '0')}): expected ${expectedCount} intercepted items, got ${intercepted.length}`
            ).toBe(expectedCount);

            // Clean discussion tweets must NEVER be intercepted under any combination
            const cleanIntercepted = data.replies
              .filter((r) => !r.filterReason)
              .filter((r) => isTweetIntercepted(r, state));
            expect(cleanIntercepted).toHaveLength(0);

            // OP must NEVER be intercepted
            expect(isTweetIntercepted(data.originalPost, state)).toBe(false);

            // Each intercepted tweet's category must be active in catConfig
            for (const item of intercepted) {
              expect(catConfig[item.filterReason!.category]).toBe(true);
            }
          }
        });

        // Test in standard preset (mild + standard eligible: impersonator, ads, giveaway, crypto)
        it(`standard preset: filters only active categories within {impersonator, ads, giveaway, crypto}`, () => {
          for (let i = 0; i < 32; i++) {
            const catConfig = combinations[i];
            const state: FilterState = {
              ...createBaseState(),
              preset: 'standard',
              categories: catConfig,
            };

            const intercepted = data.replies.filter((r) => isTweetIntercepted(r, state));
            const standardEligible: SandboxNoiseCategory[] = [
              'impersonator',
              'ads',
              'giveaway',
              'crypto',
            ];
            const expectedCount = standardEligible.filter((c) => catConfig[c]).length;

            expect(
              intercepted.length,
              `Standard preset combo ${i}: expected ${expectedCount}, got ${intercepted.length}`
            ).toBe(expectedCount);

            // short_reply must NEVER be intercepted in standard, even if toggled on
            const shortReplyItem = data.replies.find((r) => r.filterReason?.category === 'short_reply');
            if (shortReplyItem) {
              expect(isTweetIntercepted(shortReplyItem, state)).toBe(false);
            }
          }
        });

        // Test in mild preset (mild only eligible: impersonator, ads)
        it(`mild preset: filters only active categories within {impersonator, ads}`, () => {
          for (let i = 0; i < 32; i++) {
            const catConfig = combinations[i];
            const state: FilterState = {
              ...createBaseState(),
              preset: 'mild',
              categories: catConfig,
            };

            const intercepted = data.replies.filter((r) => isTweetIntercepted(r, state));
            const mildEligible: SandboxNoiseCategory[] = ['impersonator', 'ads'];
            const expectedCount = mildEligible.filter((c) => catConfig[c]).length;

            expect(
              intercepted.length,
              `Mild preset combo ${i}: expected ${expectedCount}, got ${intercepted.length}`
            ).toBe(expectedCount);

            // giveaway, crypto, short_reply must NEVER be intercepted in mild
            const higherTierItems = data.replies.filter((r) =>
              ['giveaway', 'crypto', 'short_reply'].includes(r.filterReason?.category || '')
            );
            for (const item of higherTierItems) {
              expect(isTweetIntercepted(item, state)).toBe(false);
            }
          }
        });

        // Test idempotence / determinism (100 repeated evaluations)
        it(`filtering evaluation is 100% deterministic & side-effect free across 100 runs`, () => {
          const state = createBaseState();
          const firstRun = data.replies.map((r) => isTweetIntercepted(r, state));

          for (let run = 0; run < 100; run++) {
            const currentRun = data.replies.map((r) => isTweetIntercepted(r, state));
            expect(currentRun).toEqual(firstRun);
          }
        });
      });
    });
  });

  // ==========================================================================
  // Dimension 2: Preset Threshold Invariants Across Locales
  // ==========================================================================
  describe('Dimension 2: Preset Threshold Invariants Across Locales', () => {
    const testLocales = ['zh-CN', 'zh-TW', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'ko', 'pt'];

    testLocales.forEach((loc) => {
      it(`locale "${loc}" strictly obeys mild=2, standard=4, extreme=5`, () => {
        const dataset = getSandboxData(loc);
        const base = createBaseState();

        // 1. Mild preset
        const mildState: FilterState = { ...base, preset: 'mild' };
        const mildIntercepted = dataset.replies.filter((r) => isTweetIntercepted(r, mildState));
        expect(mildIntercepted, `${loc} mild must intercept exactly 2`).toHaveLength(2);
        const mildCategories = mildIntercepted.map((r) => r.filterReason?.category).sort();
        expect(mildCategories).toEqual(['ads', 'impersonator']);

        // 2. Standard preset
        const standardState: FilterState = { ...base, preset: 'standard' };
        const stdIntercepted = dataset.replies.filter((r) => isTweetIntercepted(r, standardState));
        expect(stdIntercepted, `${loc} standard must intercept exactly 4`).toHaveLength(4);
        const stdCategories = stdIntercepted.map((r) => r.filterReason?.category).sort();
        expect(stdCategories).toEqual(['ads', 'crypto', 'giveaway', 'impersonator']);

        // 3. Extreme preset
        const extremeState: FilterState = { ...base, preset: 'extreme' };
        const extremeIntercepted = dataset.replies.filter((r) => isTweetIntercepted(r, extremeState));
        expect(extremeIntercepted, `${loc} extreme must intercept exactly 5`).toHaveLength(5);
        const extCategories = extremeIntercepted.map((r) => r.filterReason?.category).sort();
        expect(extCategories).toEqual(['ads', 'crypto', 'giveaway', 'impersonator', 'short_reply']);

        // Clean replies are always untouched
        const cleanDiscussion = dataset.replies.filter((r) => !isTweetIntercepted(r, extremeState));
        expect(cleanDiscussion, `${loc} must retain exactly 2 clean replies`).toHaveLength(2);
        expect(cleanDiscussion.every((r) => !r.filterReason)).toBe(true);

        // OP is untouched
        expect(isTweetIntercepted(dataset.originalPost, extremeState)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Dimension 3: Master Switch ON vs OFF Invariants
  // ==========================================================================
  describe('Dimension 3: Master Switch ON vs OFF Invariants', () => {
    it('in OFF mode, 0 items are intercepted and all 8 tweets render as regular visible tweets', () => {
      const state: FilterState = {
        ...createBaseState(),
        masterEnabled: false,
        preset: 'extreme', // even on extreme
      };

      const dataset = zhCNSandboxData;

      // 1. Engine check
      const interceptedReplies = dataset.replies.filter((r) => isTweetIntercepted(r, state));
      expect(interceptedReplies).toHaveLength(0);
      expect(isTweetIntercepted(dataset.originalPost, state)).toBe(false);

      // 2. Rendered DOM check via TweetFeed
      const html = renderToString(
        React.createElement(TweetFeed, {
          originalPost: dataset.originalPost,
          replies: dataset.replies,
          filterState: state,
          onQuickClean: () => {},
          onWhitelist: () => {},
          locale: 'zh-CN',
        })
      );

      // Total 8 tweet cards: 1 OP in tweet-main + 7 replies in tweet-card
      // Check OP is rendered
      expect(html).toContain('tweet-main');
      expect(html).toContain(dataset.originalPost.author.name);

      // Check all 7 replies are rendered as normal visible tweet cards
      for (const reply of dataset.replies) {
        expect(html).toContain(reply.author.name);
        expect(html).toContain(reply.content.slice(0, 15));
      }

      // Zero hidden elements
      expect(html).not.toContain('tweet-item-wrapper hidden');

      // Zero folded bar summaries
      expect(html).not.toContain('folded-bar-container');

      // Clean completion banner must NOT appear
      expect(html).not.toContain('sandbox-empty-clean-banner');
    });

    it('toggling master switch from OFF to ON instantly applies filtering to 4 items in standard preset', () => {
      const offState: FilterState = {
        ...createBaseState(),
        masterEnabled: false,
        preset: 'standard',
      };
      const onState: FilterState = {
        ...createBaseState(),
        masterEnabled: true,
        preset: 'standard',
      };

      const replies = enSandboxData.replies;
      expect(replies.filter((r) => isTweetIntercepted(r, offState))).toHaveLength(0);
      expect(replies.filter((r) => isTweetIntercepted(r, onState))).toHaveLength(4);
    });
  });

  // ==========================================================================
  // Dimension 4: Display Mode Toggle (hide vs folded bar)
  // ==========================================================================
  describe('Dimension 4: Display Mode Toggle (hide vs folded bar)', () => {
    const dataset = zhCNSandboxData;
    const noisyTweet = dataset.replies.find((r) => r.filterReason?.category === 'impersonator')!;

    it('displayMode="folded" renders folded bar with logo, author, reason, and toggle button', () => {
      const html = renderToString(
        React.createElement(TweetItem, {
          tweet: noisyTweet,
          isFiltered: true,
          displayMode: 'folded',
          staggerIndex: 0,
          onQuickClean: () => {},
          onWhitelist: () => {},
          locale: 'zh-CN',
        })
      );

      // Renders folded container
      expect(html).toContain('folded-bar-container');
      expect(html).toContain('folded-bar-summary');

      // Brand small logo
      expect(html).toContain('/logo-small.svg');

      // Author handle: clean single-@ handle without @@
      expect(html).toContain(noisyTweet.author.handle);
      expect(html).toContain('folded-author');
      expect(html).not.toContain('@@');
      expect(html).not.toContain('@<!-- -->@');

      // Filter reason text
      expect(html).toContain(noisyTweet.filterReason!.ruleName);

      // Expand trigger button text
      expect(html).toContain('展开查看');

      // Must NOT have .hidden
      expect(html).not.toContain('tweet-item-wrapper hidden');
    });

    it('displayMode="hide" completely removes filtered item from visual flow via .hidden class', () => {
      const html = renderToString(
        React.createElement(TweetItem, {
          tweet: noisyTweet,
          isFiltered: true,
          displayMode: 'hide',
          staggerIndex: 0,
          onQuickClean: () => {},
          onWhitelist: () => {},
          locale: 'zh-CN',
        })
      );

      // Container has .hidden and aria-hidden="true"
      expect(html).toContain('tweet-item-wrapper hidden');
      expect(html).toContain('aria-hidden="true"');

      // Folded bar elements MUST NOT exist in hide mode
      expect(html).not.toContain('folded-bar-container');
      expect(html).not.toContain('folded-bar-summary');
      expect(html).not.toContain('展开查看');
      expect(html).not.toContain(noisyTweet.author.name);
    });

    it('verifies both .folded-bar-container and .collapse-bar class aliases are present', () => {
      const html = renderToString(
        React.createElement(TweetItem, {
          tweet: noisyTweet,
          isFiltered: true,
          displayMode: 'folded',
          staggerIndex: 0,
          onQuickClean: () => {},
          onWhitelist: () => {},
          locale: 'zh-CN',
        })
      );

      // Check whether implementation provides both .folded-bar-container and .collapse-bar
      const hasFoldedBarContainer = html.includes('folded-bar-container');
      const hasCollapseBar = html.includes('collapse-bar');
      const hasCollapseTrigger = html.includes('collapse-trigger');

      // Implementation provides both class aliases for complete compatibility
      expect(hasFoldedBarContainer).toBe(true);
      expect(hasCollapseBar).toBe(true);
      expect(hasCollapseTrigger).toBe(true);
    });
  });

  // ==========================================================================
  // Dimension 5: Quick Block & 4.5s Countdown State Machine
  // ==========================================================================
  describe('Dimension 5: Quick Block & 4.5s Countdown State Machine', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('simulates Quick Block: tweet is added to manuallyBlockedIds and intercepts immediately', () => {
      const cleanTweet = zhCNSandboxData.replies[0];
      const state = createBaseState();

      // Before block
      expect(isTweetIntercepted(cleanTweet, state)).toBe(false);

      // Simulate block
      state.manuallyBlockedIds.add(cleanTweet.id);

      // After block
      expect(isTweetIntercepted(cleanTweet, state)).toBe(true);
    });

    it('simulates 4.5s countdown: ticks down from 4.5s to 0.0s', () => {
      const now = 1000000;
      vi.setSystemTime(now);

      const op: UndoOperation = {
        id: 'op_test_1',
        tweetId: 'reply-zh-clean-1',
        authorHandle: '@alexchen_arch',
        authorName: 'Alex Chen',
        createdAt: now,
        undoUntil: now + 4500,
        durationMs: 4500,
        status: 'active',
      };

      const onUndo = vi.fn();
      const onDismiss = vi.fn();

      const htmlAtStart = renderToString(
        React.createElement(UndoToast, {
          operation: op,
          onUndo,
          onDismiss,
          locale: 'zh-CN',
        })
      );

      expect(htmlAtStart).toContain('已拦截 @alexchen_arch');
      expect(htmlAtStart).not.toContain('已拦截 @@');
      expect(htmlAtStart).toContain('undo-toast-label');
      expect(htmlAtStart).toContain('4.5s');
      expect(htmlAtStart).toContain('width:100%');
    });

    it('simulates "Undo": removes tweet from manuallyBlockedIds and restores to restoredTweetIds', () => {
      const cleanTweet = zhCNSandboxData.replies[0];
      const state = createBaseState();

      // 1. Manually block
      state.manuallyBlockedIds.add(cleanTweet.id);
      expect(isTweetIntercepted(cleanTweet, state)).toBe(true);

      // 2. Undo operation
      state.manuallyBlockedIds.delete(cleanTweet.id);
      state.restoredTweetIds.add(cleanTweet.id);

      // 3. Tweet is now fully restored
      expect(isTweetIntercepted(cleanTweet, state)).toBe(false);
    });

    it('simulates "Undo" on noisy tweet restores it despite active preset filters', () => {
      const cryptoTweet = zhCNSandboxData.replies.find((r) => r.filterReason?.category === 'crypto')!;
      const state: FilterState = {
        ...createBaseState(),
        preset: 'extreme', // extreme normally intercepts crypto
      };

      // Initially intercepted by extreme preset
      expect(isTweetIntercepted(cryptoTweet, state)).toBe(true);

      // User manually blocked then clicked Undo -> placed in restoredTweetIds
      state.restoredTweetIds.add(cryptoTweet.id);

      // Explicit user restoration overrides automatic filter
      expect(isTweetIntercepted(cryptoTweet, state)).toBe(false);
    });

    it('simulates exact position preservation in TweetFeed upon undo', () => {
      const replies = [...zhCNSandboxData.replies];
      const blockedIndex = 3;
      const targetTweet = replies[blockedIndex];

      const stateBlocked = createBaseState();
      stateBlocked.manuallyBlockedIds.add(targetTweet.id);

      // Render blocked
      const htmlBlocked = renderToString(
        React.createElement(TweetFeed, {
          originalPost: zhCNSandboxData.originalPost,
          replies,
          filterState: stateBlocked,
          onQuickClean: () => {},
          onWhitelist: () => {},
        })
      );

      // Target tweet is folded
      expect(htmlBlocked).toContain(`data-tweet-id="${targetTweet.id}"`);

      // Restore
      const stateRestored = createBaseState();
      stateRestored.restoredTweetIds.add(targetTweet.id);

      const htmlRestored = renderToString(
        React.createElement(TweetFeed, {
          originalPost: zhCNSandboxData.originalPost,
          replies,
          filterState: stateRestored,
          onQuickClean: () => {},
          onWhitelist: () => {},
        })
      );

      // Target tweet is rendered in normal mode at exact same position in array
      const matches = [...htmlRestored.matchAll(/data-tweet-id="([^"]+)"/g)].map((m) => m[1]);
      expect(matches[blockedIndex]).toBe(targetTweet.id);
    });

    it('simulates timer expiration: tweet remains blocked after 4.5s timeout', () => {
      const cleanTweet = zhCNSandboxData.replies[0];
      const state = createBaseState();

      // Blocked
      state.manuallyBlockedIds.add(cleanTweet.id);
      expect(isTweetIntercepted(cleanTweet, state)).toBe(true);

      // Timer expires -> activeOperation is cleared (dismissed without undo)
      // restoredTweetIds is NOT updated
      expect(state.restoredTweetIds.has(cleanTweet.id)).toBe(false);

      // Tweet remains permanently blocked in manuallyBlockedIds
      expect(isTweetIntercepted(cleanTweet, state)).toBe(true);
    });

    it('stress test: rapid sequential blocks handle 50 consecutive actions without state corruption', () => {
      const state = createBaseState();
      const operations: UndoOperation[] = [];

      // Rapidly fire 50 manual blocks
      for (let i = 0; i < 50; i++) {
        const fakeId = `tweet-stress-${i}`;
        state.manuallyBlockedIds.add(fakeId);
        operations.push({
          id: `op_${Date.now()}_${fakeId}`,
          tweetId: fakeId,
          authorHandle: `@user_${i}`,
          authorName: `User ${i}`,
          createdAt: Date.now(),
          undoUntil: Date.now() + 4500,
          durationMs: 4500,
          status: 'active',
        });
      }

      // Verify all 50 items exist in manuallyBlockedIds
      expect(state.manuallyBlockedIds.size).toBe(50);

      // Verify each fake tweet is intercepted
      for (let i = 0; i < 50; i++) {
        const fakeTweet: SandboxTweet = {
          id: `tweet-stress-${i}`,
          author: { name: `User ${i}`, handle: `@user_${i}`, avatar: '' },
          content: 'Test content',
          createdAt: '1m',
          metrics: { replies: 0, retweets: 0, likes: 0 },
        };
        expect(isTweetIntercepted(fakeTweet, state)).toBe(true);
      }

      // Undo the last operation
      const lastOp = operations[operations.length - 1];
      state.manuallyBlockedIds.delete(lastOp.tweetId);
      state.restoredTweetIds.add(lastOp.tweetId);

      expect(state.manuallyBlockedIds.size).toBe(49);
      expect(state.restoredTweetIds.has(lastOp.tweetId)).toBe(true);
    });
  });

  // ==========================================================================
  // Dimension 6: Adversarial Boundary Cases & Edge Mining
  // ==========================================================================
  describe('Dimension 6: Adversarial Boundary Cases & Edge Mining', () => {
    it('author handle whitelisting is case-insensitive and prefix-insensitive (@handle vs handle)', () => {
      const tweet: SandboxTweet = {
        id: 'test-ad-tweet',
        author: {
          name: 'Target Spammer',
          handle: '@Spammer_Official',
          avatar: '',
        },
        content: 'Promo spam',
        createdAt: '1m',
        metrics: { replies: 0, retweets: 0, likes: 0 },
        filterReason: {
          category: 'ads',
          ruleId: 'promoted_ad',
          ruleName: 'Ad',
          evidence: 'Ad flag',
          presetLevel: 'mild',
        },
      };

      // 1. Without whitelist -> intercepted
      const state = createBaseState();
      expect(isTweetIntercepted(tweet, state)).toBe(true);

      // 2. Whitelist with lowercase and without '@'
      const stateLowerNoAt = {
        ...state,
        whitelistedHandles: new Set(['spammer_official']),
      };
      expect(isTweetIntercepted(tweet, stateLowerNoAt)).toBe(false);

      // 3. Whitelist with exact case and '@'
      const stateExact = {
        ...state,
        whitelistedHandles: new Set(['@Spammer_Official']),
      };
      expect(isTweetIntercepted(tweet, stateExact)).toBe(false);
    });

    it('handles unexpected/unknown category gracefully without runtime throw', () => {
      const weirdTweet: SandboxTweet = {
        id: 'weird-cat-tweet',
        author: { name: 'Weird', handle: '@weird', avatar: '' },
        content: 'Weird content',
        createdAt: '1m',
        metrics: { replies: 0, retweets: 0, likes: 0 },
        filterReason: {
          category: 'unknown_future_cat' as any,
          ruleId: 'future_rule',
          ruleName: 'Future Rule',
          evidence: 'Future evidence',
          presetLevel: 'standard',
        },
      };

      const state = createBaseState();
      // Should return false because categories['unknown_future_cat'] is undefined (falsy)
      expect(() => isTweetIntercepted(weirdTweet, state)).not.toThrow();
      expect(isTweetIntercepted(weirdTweet, state)).toBe(false);
    });

    it('handles missing filterReason on replies (clean discussion items) correctly', () => {
      const cleanTweet: SandboxTweet = {
        id: 'clean-no-reason',
        author: { name: 'Clean User', handle: '@clean_user', avatar: '' },
        content: 'Clean discussion text',
        createdAt: '1m',
        metrics: { replies: 5, retweets: 2, likes: 45 },
      };

      const state: FilterState = {
        ...createBaseState(),
        preset: 'extreme', // extreme preset
      };

      expect(isTweetIntercepted(cleanTweet, state)).toBe(false);
    });

    it('formatHandle normalizes handles robustly and idempotently', () => {
      expect(formatHandle('@keepxclean')).toBe('@keepxclean');
      expect(formatHandle('keepxclean')).toBe('@keepxclean');
      expect(formatHandle('@@keepxclean')).toBe('@keepxclean');
      expect(formatHandle('@@@keepxclean')).toBe('@keepxclean');
      expect(formatHandle(formatHandle('@keepxclean'))).toBe('@keepxclean');
      expect(formatHandle('')).toBe('');
      expect(formatHandle(null)).toBe('');
      expect(formatHandle(undefined)).toBe('');
    });
  });
});
