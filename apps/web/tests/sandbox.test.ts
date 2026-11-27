import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeReplyForDedup } from '@keepxclean/shared';
import { CURRENT_VERSION } from '../src/config';
import {
  zhCNSandboxData,
  zhTWSandboxData,
  enSandboxData,
  getSandboxData,
  CATEGORY_METAS,
} from '../src/components/HeroSandbox/sampleData';
import {
  isTweetIntercepted,
  normalizeSandboxHandle,
  PRESET_WEIGHT,
  type FilterState,
  type SandboxNoiseCategory,
  type SandboxTweet,
} from '../src/components/HeroSandbox/types';

describe('Hero Interactive Sandbox Simulator (Milestone 3)', () => {
  const sandboxCssPath = resolve(__dirname, '../src/styles/sandbox.css');

  // ==========================================================================
  // 1. Dataset Integrity & Localized Tweet Samples (Feature 11 & 19)
  // ==========================================================================
  describe('Dataset Integrity & Localization (Features 11 & 19)', () => {
    it('all datasets provide 1 original tweet + 3 clean replies + 7 noisy replies with v0.2.0 parity', () => {
      const datasets = [
        { name: 'zh-CN', data: zhCNSandboxData },
        { name: 'zh-TW', data: zhTWSandboxData },
        { name: 'en', data: enSandboxData },
      ];

      for (const { name, data } of datasets) {
        // 1 original main tweet referencing CURRENT_VERSION (v0.2.0) and zero stale previous versions
        expect(data.originalPost, `${name} missing originalPost`).toBeDefined();
        expect(data.originalPost.isOriginalPost).toBe(true);
        expect(data.originalPost.filterReason).toBeUndefined();
        expect(data.originalPost.content).toContain(CURRENT_VERSION);
        expect(JSON.stringify(data)).not.toMatch(new RegExp(`0\\.${1}\\.${2}`));

        // Exactly 10 replies: 3 clean + 7 noisy
        expect(data.replies).toHaveLength(10);

        const cleanReplies = data.replies.filter((r) => !r.filterReason);
        expect(cleanReplies, `${name} should have 3 clean replies`).toHaveLength(3);

        const noisyReplies = data.replies.filter((r) => Boolean(r.filterReason));
        expect(noisyReplies, `${name} should have 7 noisy replies`).toHaveLength(7);

        // Exactly 7 distinct categories in consistent order
        const categories = noisyReplies.map((r) => r.filterReason!.category);
        expect(categories).toEqual([
          'impersonator',
          'ads',
          'giveaway',
          'crypto',
          'duplicate_reply',
          'grok_summon',
          'short_reply',
        ]);
      }
    });

    it('getSandboxData correctly resolves locale prefixes', () => {
      expect(getSandboxData('zh-CN')).toBe(zhCNSandboxData);
      expect(getSandboxData('zh-SG')).toBe(zhCNSandboxData);
      expect(getSandboxData('zh-TW')).toBe(zhTWSandboxData);
      expect(getSandboxData('zh-HK')).toBe(zhCNSandboxData); // default zh startsWith
      expect(getSandboxData('en')).toBe(enSandboxData);
      expect(getSandboxData('ja')).toBe(enSandboxData); // fallback to en
      expect(getSandboxData('fr')).toBe(enSandboxData);
    });

    it('category metadata lists all 7 noise categories with bilingual descriptions', () => {
      expect(CATEGORY_METAS).toHaveLength(7);
      const ids = CATEGORY_METAS.map((c) => c.id);
      expect(ids).toEqual([
        'impersonator',
        'ads',
        'giveaway',
        'crypto',
        'duplicate_reply',
        'grok_summon',
        'short_reply',
      ]);

      for (const meta of CATEGORY_METAS) {
        expect(meta.labelZh).toBeTruthy();
        expect(meta.labelEn).toBeTruthy();
        expect(meta.shortDescZh).toBeTruthy();
        expect(meta.shortDescEn).toBeTruthy();
      }
    });

    it('v0.2.0 duplicate reply samples match 1st kept replies via real normalizeReplyForDedup with weightedLength >= 12', () => {
      for (const data of [zhCNSandboxData, zhTWSandboxData, enSandboxData]) {
        const firstKept = data.replies.find((r) => r.duplicateRole === 'first_kept')!;
        const duplicate = data.replies.find((r) => r.filterReason?.category === 'duplicate_reply')!;
        expect(firstKept).toBeDefined();
        expect(duplicate).toBeDefined();
        expect(firstKept.filterReason).toBeUndefined();

        const normFirst = normalizeReplyForDedup(firstKept.content);
        const normDup = normalizeReplyForDedup(duplicate.content);
        expect(normFirst.weightedLength).toBeGreaterThanOrEqual(12);
        expect(normDup.normalized).toBe(normFirst.normalized);
      }
    });
  });

  // ==========================================================================
  // 2. Preset Filtering Hierarchy & v0.2.0 Grok / Duplicate / Scene Semantics
  // ==========================================================================
  describe('Preset Filtering Hierarchy (Feature 14 & v0.2.0)', () => {
    const allCategories: Record<SandboxNoiseCategory, boolean> = {
      impersonator: true,
      ads: true,
      giveaway: true,
      crypto: true,
      duplicate_reply: true,
      grok_summon: true,
      short_reply: true,
    };

    const baseState: FilterState = {
      masterEnabled: true,
      preset: 'standard',
      displayMode: 'folded',
      scene: 'for_you',
      categories: allCategories,
      manuallyBlockedIds: new Set(),
      restoredTweetIds: new Set(),
      whitelistedHandles: new Set(),
    };

    it('preset weights are strictly ordered: mild < standard < extreme', () => {
      expect(PRESET_WEIGHT.mild).toBe(1);
      expect(PRESET_WEIGHT.standard).toBe(2);
      expect(PRESET_WEIGHT.extreme).toBe(3);
    });

    it('mild (light) preset filters exactly 2 items: ads + impersonator', () => {
      const state: FilterState = { ...baseState, preset: 'mild' };
      const replies = zhCNSandboxData.replies;

      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(2);

      const filteredCategories = filtered.map((r) => r.filterReason?.category);
      expect(filteredCategories).toContain('ads');
      expect(filteredCategories).toContain('impersonator');
      expect(filteredCategories).not.toContain('giveaway');
      expect(filteredCategories).not.toContain('crypto');
      expect(filteredCategories).not.toContain('duplicate_reply');
      expect(filteredCategories).not.toContain('grok_summon');
      expect(filteredCategories).not.toContain('short_reply');
    });

    it('standard preset filters exactly 5 items: ads + impersonator + giveaway + crypto + duplicate_reply', () => {
      const state: FilterState = { ...baseState, preset: 'standard' };
      const replies = zhCNSandboxData.replies;

      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(5);

      const filteredCategories = filtered.map((r) => r.filterReason?.category);
      expect(filteredCategories).toContain('ads');
      expect(filteredCategories).toContain('impersonator');
      expect(filteredCategories).toContain('giveaway');
      expect(filteredCategories).toContain('crypto');
      expect(filteredCategories).toContain('duplicate_reply');
      expect(filteredCategories).not.toContain('grok_summon');
      expect(filteredCategories).not.toContain('short_reply');
    });

    it('extreme (strict) preset filters all 7 noise items while keeping 3 clean replies including official @grok and 1st kept reply', () => {
      const state: FilterState = { ...baseState, preset: 'extreme' };
      const replies = zhCNSandboxData.replies;

      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(7);

      const cleanDiscussion = replies.filter((r) => !isTweetIntercepted(r, state));
      expect(cleanDiscussion).toHaveLength(3);
      expect(cleanDiscussion.every((r) => !r.filterReason)).toBe(true);
      expect(cleanDiscussion.some((r) => r.author.isOfficialGrok)).toBe(true);
      expect(cleanDiscussion.some((r) => r.duplicateRole === 'first_kept')).toBe(true);
    });

    it('official @grok is never auto-intercepted across presets while short @grok summon is intercepted in extreme', () => {
      for (const data of [zhCNSandboxData, zhTWSandboxData, enSandboxData]) {
        const officialGrok = data.replies.find((r) => r.author.isOfficialGrok)!;
        const grokSummon = data.replies.find((r) => r.filterReason?.category === 'grok_summon')!;
        expect(officialGrok).toBeDefined();
        expect(grokSummon).toBeDefined();

        for (const preset of ['mild', 'standard', 'extreme'] as const) {
          expect(isTweetIntercepted(officialGrok, { ...baseState, preset })).toBe(false);
        }
        expect(isTweetIntercepted(grokSummon, { ...baseState, preset: 'mild' })).toBe(false);
        expect(isTweetIntercepted(grokSummon, { ...baseState, preset: 'standard' })).toBe(false);
        expect(isTweetIntercepted(grokSummon, { ...baseState, preset: 'extreme' })).toBe(true);
      }
    });

    it('Following scene bypass skips heuristic categories while still intercepting promoted ads and manuallyBlockedIds', () => {
      const replies = enSandboxData.replies;
      const cleanReply = replies.find((r) => !r.filterReason)!;
      const followingState: FilterState = {
        ...baseState,
        preset: 'extreme',
        scene: 'following',
      };

      const filtered = replies.filter((r) => isTweetIntercepted(r, followingState));
      expect(filtered).toHaveLength(1);
      expect(filtered[0].filterReason?.category).toBe('ads');

      const withManualBlock: FilterState = {
        ...followingState,
        manuallyBlockedIds: new Set([cleanReply.id]),
      };
      expect(isTweetIntercepted(cleanReply, withManualBlock)).toBe(true);
    });

    it('original post is never intercepted regardless of preset or state', () => {
      const op = zhCNSandboxData.originalPost;
      expect(isTweetIntercepted(op, { ...baseState, preset: 'extreme' })).toBe(false);
      expect(isTweetIntercepted(op, { ...baseState, preset: 'standard' })).toBe(false);
      expect(isTweetIntercepted(op, { ...baseState, preset: 'mild' })).toBe(false);
    });
  });

  // ==========================================================================
  // 3. Master Toggle ON/OFF (Feature 13)
  // ==========================================================================
  describe('Master Toggle ON/OFF (Feature 13)', () => {
    const allCategories: Record<SandboxNoiseCategory, boolean> = {
      impersonator: true,
      ads: true,
      giveaway: true,
      crypto: true,
      duplicate_reply: true,
      grok_summon: true,
      short_reply: true,
    };

    it('when master toggle is OFF, zero automatic items are intercepted', () => {
      const state: FilterState = {
        masterEnabled: false,
        preset: 'extreme',
        displayMode: 'folded',
        categories: allCategories,
        manuallyBlockedIds: new Set(),
        restoredTweetIds: new Set(),
        whitelistedHandles: new Set(),
      };

      const replies = enSandboxData.replies;
      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(0); // All 10 replies visible in raw timeline!
    });

    it('when master toggle is toggled ON, preset filtering is applied immediately', () => {
      const state: FilterState = {
        masterEnabled: true,
        preset: 'standard',
        displayMode: 'folded',
        categories: allCategories,
        manuallyBlockedIds: new Set(),
        restoredTweetIds: new Set(),
        whitelistedHandles: new Set(),
      };

      const replies = enSandboxData.replies;
      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(5);
    });
  });

  // ==========================================================================
  // 4. Independent Category Toggles (Feature 16)
  // ==========================================================================
  describe('Independent Category Toggles (Feature 16)', () => {
    const defaultCategories: Record<SandboxNoiseCategory, boolean> = {
      impersonator: true,
      ads: true,
      giveaway: true,
      crypto: true,
      duplicate_reply: true,
      grok_summon: true,
      short_reply: true,
    };

    it('disabling impersonator category restores impersonator tweet only', () => {
      const state: FilterState = {
        masterEnabled: true,
        preset: 'extreme',
        displayMode: 'folded',
        categories: { ...defaultCategories, impersonator: false },
        manuallyBlockedIds: new Set(),
        restoredTweetIds: new Set(),
        whitelistedHandles: new Set(),
      };

      const replies = zhCNSandboxData.replies;
      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(6); // 7 - 1 = 6

      const filteredCategories = filtered.map((r) => r.filterReason?.category);
      expect(filteredCategories).not.toContain('impersonator');
      expect(filteredCategories).toContain('ads');
      expect(filteredCategories).toContain('giveaway');
      expect(filteredCategories).toContain('crypto');
      expect(filteredCategories).toContain('duplicate_reply');
      expect(filteredCategories).toContain('grok_summon');
      expect(filteredCategories).toContain('short_reply');
    });

    it('disabling ads category restores promoted ad tweet only', () => {
      const state: FilterState = {
        masterEnabled: true,
        preset: 'standard',
        displayMode: 'folded',
        categories: { ...defaultCategories, ads: false },
        manuallyBlockedIds: new Set(),
        restoredTweetIds: new Set(),
        whitelistedHandles: new Set(),
      };

      const replies = zhCNSandboxData.replies;
      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(4); // standard was 5, now 4
      const filteredCategories = filtered.map((r) => r.filterReason?.category);
      expect(filteredCategories).not.toContain('ads');
    });

    it('disabling multiple categories dynamically recalculates filtered tweets', () => {
      const state: FilterState = {
        masterEnabled: true,
        preset: 'extreme',
        displayMode: 'folded',
        categories: {
          impersonator: false,
          ads: false,
          giveaway: false,
          crypto: true,
          duplicate_reply: false,
          grok_summon: false,
          short_reply: true,
        },
        manuallyBlockedIds: new Set(),
        restoredTweetIds: new Set(),
        whitelistedHandles: new Set(),
      };

      const replies = zhCNSandboxData.replies;
      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(2); // only crypto + short_reply
      const filteredCategories = filtered.map((r) => r.filterReason?.category);
      expect(filteredCategories).toEqual(['crypto', 'short_reply']);
    });

    it('legacy 5-category partial isolation intercepts only enabled legacy categories without leaking v0.2.0 keys', () => {
      const replies = enSandboxData.replies;

      // 1. Legacy 5-key all-true preserves v0.2.0 counts (mild=2, standard=5, extreme=7)
      const legacyAllTrue = {
        impersonator: true,
        ads: true,
        giveaway: true,
        crypto: true,
        short_reply: true,
      } as unknown as Record<SandboxNoiseCategory, boolean>;

      const baseLegacy: Omit<FilterState, 'preset' | 'categories'> = {
        masterEnabled: true,
        displayMode: 'folded',
        scene: 'for_you',
        manuallyBlockedIds: new Set(),
        restoredTweetIds: new Set(),
        whitelistedHandles: new Set(),
      };

      expect(
        replies.filter((r) => isTweetIntercepted(r, { ...baseLegacy, preset: 'mild', categories: legacyAllTrue }))
      ).toHaveLength(2);
      expect(
        replies.filter((r) => isTweetIntercepted(r, { ...baseLegacy, preset: 'standard', categories: legacyAllTrue }))
      ).toHaveLength(5);
      expect(
        replies.filter((r) => isTweetIntercepted(r, { ...baseLegacy, preset: 'extreme', categories: legacyAllTrue }))
      ).toHaveLength(7);

      // 2. Legacy 5-key all-false and empty {} intercept 0
      const legacyAllFalse = {
        impersonator: false,
        ads: false,
        giveaway: false,
        crypto: false,
        short_reply: false,
      } as unknown as Record<SandboxNoiseCategory, boolean>;
      expect(
        replies.filter((r) => isTweetIntercepted(r, { ...baseLegacy, preset: 'extreme', categories: legacyAllFalse }))
      ).toHaveLength(0);
      expect(
        replies.filter((r) =>
          isTweetIntercepted(r, {
            ...baseLegacy,
            preset: 'extreme',
            categories: {} as unknown as Record<SandboxNoiseCategory, boolean>,
          })
        )
      ).toHaveLength(0);

      // 3. Partial legacy 5-key isolation: ONLY ads enabled -> must NOT leak duplicate_reply or grok_summon
      const legacyOnlyAds = {
        impersonator: false,
        ads: true,
        giveaway: false,
        crypto: false,
        short_reply: false,
      } as unknown as Record<SandboxNoiseCategory, boolean>;
      const partialIntercepted = replies.filter((r) =>
        isTweetIntercepted(r, { ...baseLegacy, preset: 'extreme', categories: legacyOnlyAds })
      );
      expect(partialIntercepted.map((r) => r.filterReason?.category)).toEqual(['ads']);
    });

    it('category lookup uses own properties only and ignores inherited prototype properties', () => {
      const replies = enSandboxData.replies;
      const baseState: Omit<FilterState, 'categories'> = {
        masterEnabled: true,
        preset: 'extreme',
        displayMode: 'folded',
        scene: 'for_you',
        manuallyBlockedIds: new Set(),
        restoredTweetIds: new Set(),
        whitelistedHandles: new Set(),
      };

      // Inherited duplicate_reply: false must NOT override own all-true 5-key state
      const protoFalseCategories = Object.assign(
        Object.create({ duplicate_reply: false }),
        {
          impersonator: true,
          ads: true,
          giveaway: true,
          crypto: true,
          short_reply: true,
        }
      ) as Record<SandboxNoiseCategory, boolean>;

      const interceptedProtoFalse = replies.filter((r) =>
        isTweetIntercepted(r, { ...baseState, categories: protoFalseCategories })
      );
      expect(interceptedProtoFalse).toHaveLength(7);
      expect(interceptedProtoFalse.map((r) => r.filterReason?.category)).toContain('duplicate_reply');

      // Inherited duplicate_reply: true must NOT leak into partial legacy 5-key isolation
      const protoTrueCategories = Object.assign(
        Object.create({ duplicate_reply: true }),
        {
          impersonator: false,
          ads: true,
          giveaway: false,
          crypto: false,
          short_reply: false,
        }
      ) as Record<SandboxNoiseCategory, boolean>;
      const interceptedProtoTrue = replies.filter((r) =>
        isTweetIntercepted(r, { ...baseState, categories: protoTrueCategories })
      );
      expect(interceptedProtoTrue.map((r) => r.filterReason?.category)).toEqual(['ads']);

      // Null-prototype object works safely without throwing
      const nullProtoCategories = Object.assign(Object.create(null), {
        impersonator: false,
        ads: true,
        giveaway: false,
        crypto: false,
        short_reply: false,
      }) as Record<SandboxNoiseCategory, boolean>;
      const interceptedNullProto = replies.filter((r) =>
        isTweetIntercepted(r, { ...baseState, categories: nullProtoCategories })
      );
      expect(interceptedNullProto.map((r) => r.filterReason?.category)).toEqual(['ads']);
    });
  });

  // ==========================================================================
  // 5. Whitelist, Manual Clean & 4.5s Undo (Features 17 & 18)
  // ==========================================================================
  describe('Whitelist, Manual Clean & Undo Flow (Features 17 & 18)', () => {
    const allCategories: Record<SandboxNoiseCategory, boolean> = {
      impersonator: true,
      ads: true,
      giveaway: true,
      crypto: true,
      duplicate_reply: true,
      grok_summon: true,
      short_reply: true,
    };

    it('manual clean forces interception even when master is OFF', () => {
      const targetTweet = zhCNSandboxData.replies[0]; // a clean tweet
      const state: FilterState = {
        masterEnabled: false,
        preset: 'mild',
        displayMode: 'folded',
        categories: allCategories,
        manuallyBlockedIds: new Set([targetTweet.id]),
        restoredTweetIds: new Set(),
        whitelistedHandles: new Set(),
      };

      expect(isTweetIntercepted(targetTweet, state)).toBe(true);
    });

    it('undo restores a manually blocked tweet into restoredTweetIds', () => {
      const targetTweet = zhCNSandboxData.replies.find((r) => r.filterReason?.category === 'crypto')!;
      const state: FilterState = {
        masterEnabled: true,
        preset: 'standard',
        displayMode: 'folded',
        categories: allCategories,
        manuallyBlockedIds: new Set(), // removed on undo
        restoredTweetIds: new Set([targetTweet.id]), // restored by user
        whitelistedHandles: new Set(),
      };

      // Despite being standard crypto spam, user explicit restoration bypasses filtering
      expect(isTweetIntercepted(targetTweet, state)).toBe(false);
    });

    it('whitelisting author handle bypasses filter for all tweets by that author', () => {
      const spamTweet = zhCNSandboxData.replies.find((r) => r.filterReason?.category === 'giveaway')!;
      const state: FilterState = {
        masterEnabled: true,
        preset: 'extreme',
        displayMode: 'folded',
        categories: allCategories,
        manuallyBlockedIds: new Set(),
        restoredTweetIds: new Set(),
        whitelistedHandles: new Set([spamTweet.author.handle]),
      };

      expect(isTweetIntercepted(spamTweet, state)).toBe(false);
    });

    it('normalizeSandboxHandle & isTweetIntercepted handle all whitelist normalization edge cases safely', () => {
      expect(normalizeSandboxHandle('  @@@Spammer_Official  ')).toBe('spammer_official');
      expect(normalizeSandboxHandle('@Üser_Test')).toBe('üser_test');
      expect(normalizeSandboxHandle('')).toBe('');
      expect(normalizeSandboxHandle('@')).toBe('');
      expect(normalizeSandboxHandle('   @@   ')).toBe('');

      const makeSpamTweet = (handle: string): SandboxTweet => ({
        id: `wl-test-${handle}`,
        author: { name: 'Target', handle, avatar: '' },
        content: 'Promoted test',
        createdAt: '1m',
        metrics: { replies: 0, retweets: 0, likes: 0 },
        filterReason: {
          category: 'ads',
          ruleId: 'promoted_ad',
          ruleName: 'Ad',
          evidence: 'Ad flag',
          presetLevel: 'mild',
        },
      });

      const cases: Array<{
        label: string;
        tweetHandle: string;
        whitelist: string[];
        expectedIntercepted: boolean;
      }> = [
        {
          label: 'exact match',
          tweetHandle: '@Spammer_Official',
          whitelist: ['@Spammer_Official'],
          expectedIntercepted: false,
        },
        {
          label: 'clean lowercase in set vs mixed tweet',
          tweetHandle: '@Spammer_Official',
          whitelist: ['spammer_official'],
          expectedIntercepted: false,
        },
        {
          label: 'lower with @ in set vs mixed tweet',
          tweetHandle: '@Spammer_Official',
          whitelist: ['@spammer_official'],
          expectedIntercepted: false,
        },
        {
          label: 'mixed no-@ in set vs lower tweet',
          tweetHandle: '@spammer_official',
          whitelist: ['Spammer_Official'],
          expectedIntercepted: false,
        },
        {
          label: 'upper tweet vs mixed @ in set',
          tweetHandle: '@SPAMMER_OFFICIAL',
          whitelist: ['@Spammer_Official'],
          expectedIntercepted: false,
        },
        {
          label: 'missing @ on tweet vs @ in set',
          tweetHandle: 'spammer_official',
          whitelist: ['@spammer_official'],
          expectedIntercepted: false,
        },
        {
          label: 'extra @@ on tweet vs clean set',
          tweetHandle: '@@spammer_official',
          whitelist: ['spammer_official'],
          expectedIntercepted: false,
        },
        {
          label: 'extra @@ in set vs @ tweet',
          tweetHandle: '@spammer_official',
          whitelist: ['@@spammer_official'],
          expectedIntercepted: false,
        },
        {
          label: 'whitespace-padded mixed handle in set',
          tweetHandle: '@spammer_official',
          whitelist: [' @Spammer_Official '],
          expectedIntercepted: false,
        },
        {
          label: 'Unicode case-folding',
          tweetHandle: '@Üser_Test',
          whitelist: ['@üser_test'],
          expectedIntercepted: false,
        },
        {
          label: 'Cyrillic homoglyph does not falsely match Latin',
          tweetHandle: '@spammer_official',
          whitelist: ['@sp\u0430mmer_official'],
          expectedIntercepted: true,
        },
        {
          label: 'empty handle does not falsely match empty whitelist entry',
          tweetHandle: '',
          whitelist: ['', '@'],
          expectedIntercepted: true,
        },
        {
          label: 'bare @ handle does not falsely match bare @ whitelist entry',
          tweetHandle: '@',
          whitelist: ['', '@', '@@', ' @ '],
          expectedIntercepted: true,
        },
      ];

      for (const tc of cases) {
        const state: FilterState = {
          masterEnabled: true,
          preset: 'extreme',
          displayMode: 'folded',
          scene: 'for_you',
          categories: allCategories,
          manuallyBlockedIds: new Set(),
          restoredTweetIds: new Set(),
          whitelistedHandles: new Set(tc.whitelist),
        };
        expect(isTweetIntercepted(makeSpamTweet(tc.tweetHandle), state), tc.label).toBe(
          tc.expectedIntercepted
        );
      }
    });
  });

  // ==========================================================================
  // 6. Brand Guidelines & Design Tokens Compliance (AGENTS.md)
  // ==========================================================================
  describe('Brand Guidelines & Design Tokens Compliance (AGENTS.md)', () => {
    it('sandbox.css strictly complies with light theme palette and zero forbidden terms', () => {
      expect(existsSync(sandboxCssPath)).toBe(true);
      const css = readFileSync(sandboxCssPath, 'utf-8');

      // Light background tokens
      expect(css).toContain('var(--surface)');
      expect(css).toContain('var(--border)');
      expect(css).toContain('var(--green)');
      expect(css).toContain('var(--selected)');

      // Prohibitions: zero shield, zero protective ring, zero glow, zero starburst
      expect(css).not.toMatch(/\bshield\b/i);
      expect(css).not.toMatch(/\bprotective[-_]ring\b/i);
      expect(css).not.toMatch(/\bglow\b/i);
      expect(css).not.toMatch(/\bstarburst\b/i);
    });

    it('sandbox.css defines responsive viewports, toast keyframes, and reduced motion overrides', () => {
      const css = readFileSync(sandboxCssPath, 'utf-8');

      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('@media (max-width: 768px)');
      expect(css).toContain('@media (max-width: 480px)');
      expect(css).toContain('.undo-toast-portal');
      expect(css).toContain('.folded-bar-container');
      expect(css).toContain('.stagger-1');
      expect(css).toContain('.stagger-5');
    });
  });
});
