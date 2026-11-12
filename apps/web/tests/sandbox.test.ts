import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  zhCNSandboxData,
  zhTWSandboxData,
  enSandboxData,
  getSandboxData,
  CATEGORY_METAS,
} from '../src/components/HeroSandbox/sampleData';
import {
  isTweetIntercepted,
  PRESET_WEIGHT,
  type FilterState,
  type SandboxNoiseCategory,
} from '../src/components/HeroSandbox/types';

describe('Hero Interactive Sandbox Simulator (Milestone 3)', () => {
  const sandboxCssPath = resolve(__dirname, '../src/styles/sandbox.css');

  // ==========================================================================
  // 1. Dataset Integrity & Localized Tweet Samples (Feature 11 & 19)
  // ==========================================================================
  describe('Dataset Integrity & Localization (Features 11 & 19)', () => {
    it('all datasets provide 1 original tweet + 2 clean replies + 5 noisy replies', () => {
      const datasets = [
        { name: 'zh-CN', data: zhCNSandboxData },
        { name: 'zh-TW', data: zhTWSandboxData },
        { name: 'en', data: enSandboxData },
      ];

      for (const { name, data } of datasets) {
        // 1 original main tweet
        expect(data.originalPost, `${name} missing originalPost`).toBeDefined();
        expect(data.originalPost.isOriginalPost).toBe(true);
        expect(data.originalPost.filterReason).toBeUndefined();

        // Exactly 7 replies: 2 clean + 5 noisy
        expect(data.replies).toHaveLength(7);

        const cleanReplies = data.replies.filter((r) => !r.filterReason);
        expect(cleanReplies, `${name} should have 2 clean replies`).toHaveLength(2);

        const noisyReplies = data.replies.filter((r) => Boolean(r.filterReason));
        expect(noisyReplies, `${name} should have 5 noisy replies`).toHaveLength(5);

        // Exactly 5 distinct categories
        const categories = noisyReplies.map((r) => r.filterReason!.category);
        const uniqueCategories = new Set(categories);
        expect(uniqueCategories.size).toBe(5);
        expect(uniqueCategories.has('impersonator')).toBe(true);
        expect(uniqueCategories.has('ads')).toBe(true);
        expect(uniqueCategories.has('giveaway')).toBe(true);
        expect(uniqueCategories.has('crypto')).toBe(true);
        expect(uniqueCategories.has('short_reply')).toBe(true);
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

    it('category metadata lists all 5 noise categories with bilingual descriptions', () => {
      expect(CATEGORY_METAS).toHaveLength(5);
      const ids = CATEGORY_METAS.map((c) => c.id);
      expect(ids).toEqual(['impersonator', 'ads', 'giveaway', 'crypto', 'short_reply']);

      for (const meta of CATEGORY_METAS) {
        expect(meta.labelZh).toBeTruthy();
        expect(meta.labelEn).toBeTruthy();
        expect(meta.shortDescZh).toBeTruthy();
        expect(meta.shortDescEn).toBeTruthy();
      }
    });
  });

  // ==========================================================================
  // 2. Preset Filtering Hierarchy (Feature 14)
  // ==========================================================================
  describe('Preset Filtering Hierarchy (Feature 14)', () => {
    const baseState: FilterState = {
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
      expect(filteredCategories).not.toContain('short_reply');
    });

    it('standard preset filters exactly 4 items: ads + impersonator + giveaway + crypto', () => {
      const state: FilterState = { ...baseState, preset: 'standard' };
      const replies = zhCNSandboxData.replies;

      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(4);

      const filteredCategories = filtered.map((r) => r.filterReason?.category);
      expect(filteredCategories).toContain('ads');
      expect(filteredCategories).toContain('impersonator');
      expect(filteredCategories).toContain('giveaway');
      expect(filteredCategories).toContain('crypto');
      expect(filteredCategories).not.toContain('short_reply'); // short_reply is extreme-only
    });

    it('extreme (strict) preset filters all 5 noise items', () => {
      const state: FilterState = { ...baseState, preset: 'extreme' };
      const replies = zhCNSandboxData.replies;

      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(5);

      const cleanDiscussion = replies.filter((r) => !isTweetIntercepted(r, state));
      expect(cleanDiscussion).toHaveLength(2);
      expect(cleanDiscussion.every((r) => !r.filterReason)).toBe(true);
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
    it('when master toggle is OFF, zero automatic items are intercepted', () => {
      const state: FilterState = {
        masterEnabled: false,
        preset: 'extreme',
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

      const replies = enSandboxData.replies;
      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(0); // All 7 visible in raw timeline!
    });

    it('when master toggle is toggled ON, preset filtering is applied immediately', () => {
      const state: FilterState = {
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

      const replies = enSandboxData.replies;
      const filtered = replies.filter((r) => isTweetIntercepted(r, state));
      expect(filtered).toHaveLength(4);
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
      expect(filtered).toHaveLength(4); // 5 - 1 = 4

      const filteredCategories = filtered.map((r) => r.filterReason?.category);
      expect(filteredCategories).not.toContain('impersonator');
      expect(filteredCategories).toContain('ads');
      expect(filteredCategories).toContain('giveaway');
      expect(filteredCategories).toContain('crypto');
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
      expect(filtered).toHaveLength(3); // standard was 4, now 3
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
  });

  // ==========================================================================
  // 5. Whitelist, Manual Clean & 4.5s Undo (Features 17 & 18)
  // ==========================================================================
  describe('Whitelist, Manual Clean & Undo Flow (Features 17 & 18)', () => {
    it('manual clean forces interception even when master is OFF', () => {
      const targetTweet = zhCNSandboxData.replies[0]; // a clean tweet
      const state: FilterState = {
        masterEnabled: false,
        preset: 'mild',
        displayMode: 'folded',
        categories: {
          impersonator: true,
          ads: true,
          giveaway: true,
          crypto: true,
          short_reply: true,
        },
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
        categories: {
          impersonator: true,
          ads: true,
          giveaway: true,
          crypto: true,
          short_reply: true,
        },
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
        categories: {
          impersonator: true,
          ads: true,
          giveaway: true,
          crypto: true,
          short_reply: true,
        },
        manuallyBlockedIds: new Set(),
        restoredTweetIds: new Set(),
        whitelistedHandles: new Set([spamTweet.author.handle]),
      };

      expect(isTweetIntercepted(spamTweet, state)).toBe(false);
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
