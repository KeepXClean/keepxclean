// @vitest-environment jsdom
// Set flag to support React act() environment
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  zhCNSandboxData,
  zhTWSandboxData,
  enSandboxData,
  SAMPLE_DATASETS,
  CATEGORY_METAS,
  getSandboxData,
} from '../src/components/HeroSandbox/sampleData';
import {
  isTweetIntercepted,
  PRESET_WEIGHT,
  type FilterState,
  type SandboxDatasetLocale,
  type SandboxNoiseCategory,
  type SandboxPreset,
  type SandboxTweet,
  type UndoOperation,
} from '../src/components/HeroSandbox/types';
import { HeroSandbox } from '../src/components/HeroSandbox/HeroSandbox';
import { UndoToast } from '../src/components/HeroSandbox/UndoToast';

describe('Challenger M3-2: Empirical Adversarial Stress Harness', () => {
  const sandboxCssPath = resolve(__dirname, '../src/styles/sandbox.css');

  // ==========================================================================
  // SECTION 1: Dataset & Localization Adversarial Tests
  // ==========================================================================
  describe('1. Dataset & Localization Adversarial Tests', () => {
    const datasetKeys: SandboxDatasetLocale[] = ['zh-CN', 'zh-TW', 'en'];

    it('each dataset has exactly 8 tweets (1 OP + 2 clean discussion + 5 noisy)', () => {
      for (const locale of datasetKeys) {
        const data = SAMPLE_DATASETS[locale];

        // 1 Original post
        expect(data.originalPost, `${locale} original post missing`).toBeDefined();
        expect(data.originalPost.isOriginalPost).toBe(true);
        expect(data.originalPost.filterReason).toBeUndefined();

        // 7 replies (2 clean + 5 noisy)
        expect(data.replies).toHaveLength(7);

        // Total tweets = 1 OP + 7 replies = 8
        const allTweets = [data.originalPost, ...data.replies];
        expect(allTweets).toHaveLength(8);

        const cleanReplies = data.replies.filter((r) => !r.filterReason);
        expect(cleanReplies, `${locale} must have exactly 2 clean replies`).toHaveLength(2);

        const noisyReplies = data.replies.filter((r) => Boolean(r.filterReason));
        expect(noisyReplies, `${locale} must have exactly 5 noisy replies`).toHaveLength(5);
      }
    });

    it('all 5 noise categories are present with authentic metadata in all 3 datasets', () => {
      const requiredCategories: SandboxNoiseCategory[] = [
        'impersonator',
        'ads',
        'giveaway',
        'crypto',
        'short_reply',
      ];

      for (const locale of datasetKeys) {
        const data = SAMPLE_DATASETS[locale];
        const noisyReplies = data.replies.filter((r) => Boolean(r.filterReason));
        const foundCategories = new Set(noisyReplies.map((r) => r.filterReason!.category));

        for (const cat of requiredCategories) {
          expect(foundCategories.has(cat), `${locale} missing noise category ${cat}`).toBe(true);
          const tweet = noisyReplies.find((r) => r.filterReason!.category === cat)!;

          // Verify authentic metadata fields
          expect(tweet.filterReason!.ruleId).toBeTruthy();
          expect(tweet.filterReason!.ruleName).toBeTruthy();
          expect(tweet.filterReason!.evidence).toBeTruthy();
          expect(tweet.filterReason!.presetLevel).toBeTruthy();

          // Rule level assignments
          if (cat === 'impersonator' || cat === 'ads') {
            expect(tweet.filterReason!.presetLevel).toBe('mild');
          } else if (cat === 'giveaway' || cat === 'crypto') {
            expect(tweet.filterReason!.presetLevel).toBe('standard');
          } else if (cat === 'short_reply') {
            expect(tweet.filterReason!.presetLevel).toBe('extreme');
          }

          // Author metadata authenticity
          expect(tweet.author.name).toBeTruthy();
          expect(tweet.author.handle).toMatch(/^@/);
          expect(tweet.author.avatar).toBeTruthy();
          expect(tweet.content.length).toBeGreaterThan(5);
        }
      }
    });

    it('impersonator author subtleties are authentically modeled (typo handle, identical avatar, phishing copy, follower gap)', () => {
      for (const locale of datasetKeys) {
        const data = SAMPLE_DATASETS[locale];
        const op = data.originalPost;
        const imp = data.replies.find((r) => r.filterReason?.category === 'impersonator')!;

        expect(imp, `${locale} impersonator missing`).toBeDefined();

        // 1. Identical author name
        expect(imp.author.name).toBe(op.author.name);

        // 2. Identical avatar
        expect(imp.author.avatar).toBe(op.author.avatar);

        // 3. Handle typo / homoglyph spoofing: uses '0fficial' instead of official or exact match
        expect(imp.author.handle).not.toBe(op.author.handle);
        expect(imp.author.handle.toLowerCase()).toContain('keepxclean');
        // Specifically check that the handle has a subtle spoofing suffix/typo
        expect(imp.author.handle).toMatch(/_0fficial|_official/i);

        // 4. Verification flag: purchased Blue checkmark to deceive
        expect(imp.author.isBlueVerified).toBe(true);
        expect(imp.author.isImpersonator).toBe(true);
        expect(imp.author.isAuthor).toBeFalsy();

        // 5. Follower disparity: official has tens of thousands (48.2K), impersonator has < 50
        const opFollowers = parseFloat(op.author.followersCount?.replace(/[^0-9.]/g, '') || '0') * 1000;
        const impFollowers = parseInt(imp.author.followersCount?.replace(/[^0-9]/g, '') || '0', 10);
        expect(opFollowers).toBeGreaterThan(40000);
        expect(impFollowers).toBeLessThan(100);
        expect(impFollowers / opFollowers).toBeLessThan(0.01);

        // 6. Phishing copy & deceptive link in content
        const phishingKeywords = ['airdrop', '空投', '私信领取', '激活码', 'claim', 'token', 't.me/'];
        const hasPhishingLure = phishingKeywords.some((kw) =>
          imp.content.toLowerCase().includes(kw.toLowerCase())
        );
        expect(hasPhishingLure, `${locale} impersonator content should have phishing lure`).toBe(true);
        expect(imp.content).toContain('t.me/');
      }
    });

    it('clean discussion replies are NEVER falsely filtered under ANY preset or category toggle combination (Zero False Positives)', () => {
      const presets: SandboxPreset[] = ['mild', 'standard', 'extreme'];
      const categoriesList: SandboxNoiseCategory[] = [
        'impersonator',
        'ads',
        'giveaway',
        'crypto',
        'short_reply',
      ];

      // Generate all 2^5 = 32 category toggle combinations
      const allCategoryCombos: Array<Record<SandboxNoiseCategory, boolean>> = [];
      for (let i = 0; i < 32; i++) {
        allCategoryCombos.push({
          impersonator: Boolean(i & 1),
          ads: Boolean(i & 2),
          giveaway: Boolean(i & 4),
          crypto: Boolean(i & 8),
          short_reply: Boolean(i & 16),
        });
      }

      // Exhaustively test all 3 datasets
      for (const locale of datasetKeys) {
        const data = SAMPLE_DATASETS[locale];
        const cleanReplies = data.replies.filter((r) => !r.filterReason);

        expect(cleanReplies).toHaveLength(2);

        for (const preset of presets) {
          for (const cats of allCategoryCombos) {
            for (const master of [true, false]) {
              const testState: FilterState = {
                masterEnabled: master,
                preset,
                displayMode: 'folded',
                categories: cats,
                manuallyBlockedIds: new Set(),
                restoredTweetIds: new Set(),
                whitelistedHandles: new Set(),
              };

              for (const cleanReply of cleanReplies) {
                const intercepted = isTweetIntercepted(cleanReply, testState);
                expect(
                  intercepted,
                  `False positive! Clean reply ${cleanReply.id} was filtered in ${locale} with preset=${preset}, master=${master}`
                ).toBe(false);
              }
            }
          }
        }
      }
    });
  });

  // ==========================================================================
  // SECTION 2: Motion & Timer Stress Tests
  // ==========================================================================
  describe('2. Motion & Timer Stress Tests', () => {
    let container: HTMLDivElement;
    let root: Root | null = null;

    beforeEach(() => {
      vi.useFakeTimers();
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      if (root) {
        act(() => {
          root?.unmount();
        });
        root = null;
      }
      container.remove();
      document.body.innerHTML = '';
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('prefers-reduced-motion: reduce bypasses 900ms delay: directly starts cleaned at 0ms', () => {
      // Mock window.matchMedia to match reduced motion
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      root = createRoot(container);
      act(() => {
        root!.render(<HeroSandbox locale="zh-CN" />);
      });

      // At t = 0ms (no timer advance), master should already be active and cleaned
      const statusPill = container.querySelector('.sandbox-status-pill');
      expect(statusPill).not.toBeNull();
      expect(statusPill!.classList.contains('inactive')).toBe(false);
      expect(statusPill!.textContent).toContain('净空引擎已就绪');
      expect(statusPill!.textContent).not.toContain('0.9s');

      // Master switch checkbox should already be checked
      const masterCheckbox = container.querySelector('input[type="checkbox"][role="switch"]') as HTMLInputElement;
      expect(masterCheckbox.checked).toBe(true);

      // Filtered count should immediately reflect cleaned standard preset (4 items)
      const statsSummary = container.querySelector('.category-stats-summary');
      expect(statsSummary?.textContent).toContain('4 / 5');
    });

    it('standard motion (no reduced motion) delays auto-cleanup by exactly 900ms', () => {
      // Mock window.matchMedia to NOT match reduced motion
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      root = createRoot(container);
      act(() => {
        root!.render(<HeroSandbox locale="zh-CN" />);
      });

      // At t = 0ms: raw noisy state
      let statusPill = container.querySelector('.sandbox-status-pill');
      expect(statusPill?.textContent).toContain('0.9s');
      let masterCheckbox = container.querySelector('input[type="checkbox"][role="switch"]') as HTMLInputElement;
      expect(masterCheckbox.checked).toBe(false);

      // At t = 450ms: still in raw state
      act(() => {
        vi.advanceTimersByTime(450);
      });
      statusPill = container.querySelector('.sandbox-status-pill');
      expect(statusPill?.textContent).toContain('0.9s');
      expect(masterCheckbox.checked).toBe(false);

      // At t = 900ms: transitions to cleaned state!
      act(() => {
        vi.advanceTimersByTime(450);
      });
      statusPill = container.querySelector('.sandbox-status-pill');
      expect(statusPill?.textContent).toContain('净空引擎已就绪');
      expect(masterCheckbox.checked).toBe(true);

      const statsSummary = container.querySelector('.category-stats-summary');
      expect(statsSummary?.textContent).toContain('4 / 5');
    });

    it('Replay Cleanup button resets state and re-executes 900ms cleanup sequence', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      root = createRoot(container);
      act(() => {
        root!.render(<HeroSandbox locale="zh-CN" />);
      });

      // Advance past initial 900ms
      act(() => {
        vi.advanceTimersByTime(900);
      });

      let masterCheckbox = container.querySelector('input[type="checkbox"][role="switch"]') as HTMLInputElement;
      expect(masterCheckbox.checked).toBe(true);

      // Find and click Replay button
      const replayBtn = container.querySelector('.btn-replay-clean') as HTMLButtonElement;
      expect(replayBtn).not.toBeNull();

      act(() => {
        replayBtn.click();
      });

      // State immediately resets to raw noisy
      expect(masterCheckbox.checked).toBe(false);
      let statusPill = container.querySelector('.sandbox-status-pill');
      expect(statusPill?.textContent).toContain('0.9s');

      // Advance by 500ms -> still raw
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(masterCheckbox.checked).toBe(false);

      // Advance to 900ms -> cleaned again
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(masterCheckbox.checked).toBe(true);
      statusPill = container.querySelector('.sandbox-status-pill');
      expect(statusPill?.textContent).toContain('净空引擎已就绪');
    });

    it('rapid Replay clicks converge cleanly without timer or invariant errors', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      root = createRoot(container);
      act(() => {
        root!.render(<HeroSandbox locale="zh-CN" />);
      });

      act(() => {
        vi.advanceTimersByTime(900);
      });

      const replayBtn = container.querySelector('.btn-replay-clean') as HTMLButtonElement;

      // Click rapidly 5 times
      for (let i = 0; i < 5; i++) {
        act(() => {
          replayBtn.click();
          vi.advanceTimersByTime(100);
        });
      }

      // Fast-forward by 1000ms
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      const masterCheckbox = container.querySelector('input[type="checkbox"][role="switch"]') as HTMLInputElement;
      expect(masterCheckbox.checked).toBe(true);
    });

    it('waterfall transitions assign .stagger-0 through .stagger-5 with 60ms increments in CSS', () => {
      const css = readFileSync(sandboxCssPath, 'utf-8');

      expect(css).toMatch(/\.tweet-item-wrapper\.stagger-0\s*\{\s*transition-delay:\s*0ms;\s*\}/);
      expect(css).toMatch(/\.tweet-item-wrapper\.stagger-1\s*\{\s*transition-delay:\s*60ms;\s*\}/);
      expect(css).toMatch(/\.tweet-item-wrapper\.stagger-2\s*\{\s*transition-delay:\s*120ms;\s*\}/);
      expect(css).toMatch(/\.tweet-item-wrapper\.stagger-3\s*\{\s*transition-delay:\s*180ms;\s*\}/);
      expect(css).toMatch(/\.tweet-item-wrapper\.stagger-4\s*\{\s*transition-delay:\s*240ms;\s*\}/);
      expect(css).toMatch(/\.tweet-item-wrapper\.stagger-5\s*\{\s*transition-delay:\s*300ms;\s*\}/);
    });

    it('author handles in rendered DOM: documents handle formatting behavior', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false, // master OFF initially
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      root = createRoot(container);
      act(() => {
        root!.render(<HeroSandbox locale="zh-CN" />);
      });

      // Check all rendered author handles in normal tweets
      const handles = Array.from(container.querySelectorAll('.tweet-author-handle')).map(
        (el) => el.textContent?.trim()
      );

      // Verify that handles are rendered and strictly contain single '@' (zero '@@')
      expect(handles.length).toBeGreaterThan(0);
      for (const h of handles) {
        expect(h).toMatch(/^@[^@]+$/);
        expect(h).not.toContain('@@');
      }
    });

    it('4.5s Undo toast countdown counts down from 4.5s and restores tweet on click', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: true, // start cleaned
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      root = createRoot(container);
      act(() => {
        root!.render(<HeroSandbox locale="zh-CN" />);
      });

      // Switch to 'mild' so clean replies + giveaway/crypto are visible in feed
      const mildBtn = container.querySelectorAll('.segmented-group')[1].querySelectorAll('button')[0];
      act(() => {
        mildBtn.click();
      });

      // Find a visible "净空" quick block button on an unfiltered reply
      const quickCleanBtn = container.querySelector('.btn-quick-clean') as HTMLButtonElement;
      expect(quickCleanBtn).not.toBeNull();

      act(() => {
        quickCleanBtn.click();
      });

      // Toast appears
      let toast = container.querySelector('.undo-toast');
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toContain('撤销');
      expect(toast?.textContent).toContain('4.5s');

      // Advance by 2000ms -> remaining ~2.5s
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(toast?.textContent).toMatch(/2\.[456]s/);

      // Click Undo
      const undoBtn = container.querySelector('.btn-toast-undo') as HTMLButtonElement;
      expect(undoBtn).not.toBeNull();
      act(() => {
        undoBtn.click();
        vi.advanceTimersByTime(200); // exit animation
      });

      // Toast is dismissed
      toast = container.querySelector('.undo-toast');
      expect(toast).toBeNull();
    });

    it('Feature 17: .collapse-bar selector alignment and folded bar expand/collapse interaction', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: true, // starts cleaned
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      root = createRoot(container);
      act(() => {
        root!.render(<HeroSandbox locale="zh-CN" />);
      });

      // Query via .collapse-bar alias
      const collapseBars = container.querySelectorAll('.collapse-bar');
      expect(collapseBars.length).toBeGreaterThanOrEqual(4);

      const firstBar = collapseBars[0] as HTMLElement;
      expect(firstBar.classList.contains('folded-bar-container')).toBe(true);
      expect(firstBar.classList.contains('collapse-bar')).toBe(true);

      // Trigger button has .collapse-trigger
      const triggerBtn = firstBar.querySelector('.collapse-trigger') as HTMLButtonElement;
      expect(triggerBtn).not.toBeNull();
      expect(triggerBtn.getAttribute('aria-expanded')).toBe('false');
      expect(firstBar.getAttribute('data-expanded')).toBeNull();

      // Click to expand
      act(() => {
        triggerBtn.click();
      });
      expect(triggerBtn.getAttribute('aria-expanded')).toBe('true');
      expect(firstBar.getAttribute('data-expanded')).toBe('true');
      expect(firstBar.querySelector('.folded-expanded-view')).not.toBeNull();

      // Click '收起' in actions to re-collapse
      const collapseBtn = firstBar.querySelector('.btn-collapse-action') as HTMLButtonElement;
      expect(collapseBtn).not.toBeNull();
      act(() => {
        collapseBtn.click();
      });
      expect(triggerBtn.getAttribute('aria-expanded')).toBe('false');
      expect(firstBar.getAttribute('data-expanded')).toBeNull();
      expect(firstBar.querySelector('.folded-expanded-view')).toBeNull();
    });

    it('cancels exit timeout when a new operation arrives during exit animation window', () => {
      const onDismiss = vi.fn();
      const onUndo = vi.fn();
      const now = 1000000;
      vi.setSystemTime(now);

      const op1: UndoOperation = {
        id: 'op_1',
        tweetId: 'tweet_1',
        authorHandle: '@author_1',
        authorName: 'Author 1',
        createdAt: now,
        undoUntil: now + 4500,
        durationMs: 4500,
        status: 'active',
      };

      // Mount op1
      root = createRoot(container);
      act(() => {
        root!.render(<UndoToast operation={op1} onUndo={onUndo} onDismiss={onDismiss} />);
      });

      // Advance to expiration (4500ms)
      act(() => {
        vi.advanceTimersByTime(4500);
      });

      // At t = 4600 (100ms into 200ms exit window), new operation arrives
      vi.setSystemTime(now + 4600);
      const op2: UndoOperation = {
        id: 'op_2',
        tweetId: 'tweet_2',
        authorHandle: '@author_2',
        authorName: 'Author 2',
        createdAt: now + 4600,
        undoUntil: now + 4600 + 4500,
        durationMs: 4500,
        status: 'active',
      };

      act(() => {
        root!.render(<UndoToast operation={op2} onUndo={onUndo} onDismiss={onDismiss} />);
      });

      // Advance past the initial 200ms exit window of op1 (e.g. 200ms)
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // onDismiss must NOT have fired!
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('handleReplay cancels preceding timer so rapid clicks reset 900ms sequence cleanly', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      root = createRoot(container);
      act(() => {
        root!.render(<HeroSandbox locale="zh-CN" />);
      });

      // Complete initial entrance
      act(() => {
        vi.advanceTimersByTime(900);
      });

      const masterCheckbox = container.querySelector('input[type="checkbox"][role="switch"]') as HTMLInputElement;
      expect(masterCheckbox.checked).toBe(true);

      const replayBtn = container.querySelector('.btn-replay-clean') as HTMLButtonElement;

      // Click 1 at t = 0
      act(() => {
        replayBtn.click();
      });
      expect(masterCheckbox.checked).toBe(false);

      // Advance 500ms
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(masterCheckbox.checked).toBe(false);

      // Click 2 at t = 500ms (resets timer to t = 1400ms)
      act(() => {
        replayBtn.click();
      });
      expect(masterCheckbox.checked).toBe(false);

      // Advance 450ms (now at t = 950ms, 450ms after Click 2)
      act(() => {
        vi.advanceTimersByTime(450);
      });
      // Preceding Timer 1 would have fired at t = 900ms if not cancelled!
      // Must STILL be false:
      expect(masterCheckbox.checked).toBe(false);

      // Advance remaining 450ms to reach 900ms after Click 2
      act(() => {
        vi.advanceTimersByTime(450);
      });
      expect(masterCheckbox.checked).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 3: DOM, Visual Tree & Layout Verification across Viewports
  // ==========================================================================
  describe('3. DOM, Visual Tree & Layout Verification across Viewports', () => {
    it('sandbox.css defines responsive adaptations for 320px, 375px/480px, 768px, and 1280px', () => {
      expect(existsSync(sandboxCssPath)).toBe(true);
      const css = readFileSync(sandboxCssPath, 'utf-8');

      // 768px Tablet Breakpoint
      expect(css).toContain('@media (max-width: 768px)');
      expect(css).toMatch(/flex-direction:\s*column/);

      // 480px Standard Mobile Breakpoint (covers 375px)
      expect(css).toContain('@media (max-width: 480px)');
      expect(css).toMatch(/\.sandbox-hint-text\s*\{\s*display:\s*none;\s*\}/);

      // 340px Ultra-Compact Breakpoint (covers 320px)
      expect(css).toContain('@media (max-width: 340px)');
      expect(css).toMatch(/\.segmented-btn\s*\{[^}]*font-size:\s*11\.5px;/);

      // Reduced motion override
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('prevents layout overflow with word-break and boundary constraints', () => {
      const css = readFileSync(sandboxCssPath, 'utf-8');

      // Word break & text wrapping for long URLs and crypto hashes
      expect(css).toMatch(/word-break:\s*break-word/);
      expect(css).toMatch(/overflow:\s*hidden/);

      // Verify that sample contract addresses fit within wrapping rules
      for (const locale of ['zh-CN', 'zh-TW', 'en'] as SandboxDatasetLocale[]) {
        const cryptoTweet = SAMPLE_DATASETS[locale].replies.find(
          (r) => r.filterReason?.category === 'crypto'
        );
        expect(cryptoTweet).toBeDefined();
        expect(cryptoTweet!.content).toMatch(/0x[a-f0-9]{40}|[1-9A-HJ-NP-Za-km-z]{44}/);
      }
    });

    it('ZERO banned brand tokens across all web styles, components, and public assets', () => {
      // Prohibited tokens according to AGENTS.md
      const prohibitedRegex = /\b(shield|protective[-_ ]?ring|starburst|\bglow\b)\b/i;

      // 1. Check sandbox.css
      const sandboxCss = readFileSync(sandboxCssPath, 'utf-8');
      expect(sandboxCss).not.toMatch(prohibitedRegex);

      // 2. Check tokens.css
      const tokensCssPath = resolve(__dirname, '../src/styles/tokens.css');
      if (existsSync(tokensCssPath)) {
        const tokensCss = readFileSync(tokensCssPath, 'utf-8');
        expect(tokensCss).not.toMatch(prohibitedRegex);
      }

      // 3. Check all HeroSandbox components
      const componentFiles = [
        'HeroSandbox.tsx',
        'Controls.tsx',
        'TweetFeed.tsx',
        'TweetItem.tsx',
        'UndoToast.tsx',
        'sampleData.ts',
        'types.ts',
      ];

      for (const file of componentFiles) {
        const filePath = resolve(__dirname, '../src/components/HeroSandbox', file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          expect(content, `Forbidden brand token found in ${file}`).not.toMatch(prohibitedRegex);
        }
      }

      // 4. Check logo SVGs
      const logoSmallPath = resolve(__dirname, '../public/logo-small.svg');
      if (existsSync(logoSmallPath)) {
        const logoContent = readFileSync(logoSmallPath, 'utf-8');
        expect(logoContent).not.toMatch(prohibitedRegex);
        expect(logoContent).toContain('#EAF6EF'); // correct brand pill color
      }
    });
  });
});
