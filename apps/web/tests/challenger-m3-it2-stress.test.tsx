// @vitest-environment jsdom
// Set flag to support React act() environment
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
  zhCNSandboxData,
  zhTWSandboxData,
  enSandboxData,
  SAMPLE_DATASETS,
  getSandboxData,
} from '../src/components/HeroSandbox/sampleData';
import {
  formatHandle,
  isTweetIntercepted,
  type FilterState,
  type SandboxDatasetLocale,
  type SandboxTweet,
  type UndoOperation,
} from '../src/components/HeroSandbox/types';
import { HeroSandbox } from '../src/components/HeroSandbox/HeroSandbox';
import { UndoToast } from '../src/components/HeroSandbox/UndoToast';
import { TweetFeed } from '../src/components/HeroSandbox/TweetFeed';
import { TweetItem } from '../src/components/HeroSandbox/TweetItem';

describe('Empirical Challenger Iteration 2: Deep Stress & Adversarial Suite', () => {
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

  // ==========================================================================
  // SUITE 1: Rapid Replay Clicks in HeroSandbox.tsx
  // ==========================================================================
  describe('Suite 1: Rapid Replay Clicks Stress Testing', () => {
    it('10 rapid replay clicks spaced by 50ms: timers debounce cleanly and converge at t = lastClick + 900ms', () => {
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

      // Complete initial 900ms entrance
      act(() => {
        vi.advanceTimersByTime(900);
      });

      const masterCheckbox = container.querySelector('input[type="checkbox"][role="switch"]') as HTMLInputElement;
      expect(masterCheckbox.checked).toBe(true);

      const replayBtn = container.querySelector('.btn-replay-clean') as HTMLButtonElement;
      expect(replayBtn).not.toBeNull();

      // Click 10 times, 50ms apart (total elapsed click time = 9 * 50 = 450ms)
      for (let i = 0; i < 10; i++) {
        act(() => {
          replayBtn.click();
        });
        expect(masterCheckbox.checked).toBe(false);
        act(() => {
          vi.advanceTimersByTime(50);
        });
        expect(masterCheckbox.checked).toBe(false);
      }

      // Elapsed since last click (click 10) is currently 50ms.
      // Need 850ms more to reach 900ms from the 10th click.
      act(() => {
        vi.advanceTimersByTime(840);
      });
      // At 890ms after click 10: must still be raw (checked = false)
      expect(masterCheckbox.checked).toBe(false);

      // Advance remaining 60ms (reaches 950ms after click 10)
      act(() => {
        vi.advanceTimersByTime(60);
      });
      // Now master should be enabled
      expect(masterCheckbox.checked).toBe(true);
      const statusPill = container.querySelector('.sandbox-status-pill');
      expect(statusPill?.textContent).toContain('净空引擎已就绪');
    });

    it('50 synchronous burst clicks on Replay button execute without stack overflow or orphaned timers', () => {
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
        root!.render(<HeroSandbox locale="en" />);
      });

      act(() => {
        vi.advanceTimersByTime(900);
      });

      const replayBtn = container.querySelector('.btn-replay-clean') as HTMLButtonElement;
      const masterCheckbox = container.querySelector('input[type="checkbox"][role="switch"]') as HTMLInputElement;

      // 50 synchronous clicks without time passage
      act(() => {
        for (let i = 0; i < 50; i++) {
          replayBtn.click();
        }
      });

      expect(masterCheckbox.checked).toBe(false);

      // At t = 899ms: still false
      act(() => {
        vi.advanceTimersByTime(899);
      });
      expect(masterCheckbox.checked).toBe(false);

      // At t = 901ms: transitions to true
      act(() => {
        vi.advanceTimersByTime(2);
      });
      expect(masterCheckbox.checked).toBe(true);
    });

    it('unmounting HeroSandbox mid-flight during replay sequence cleans up timers without React error', () => {
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

      // Advance to 500ms into initial entrance animation
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Unmount while timer is pending
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      act(() => {
        root!.unmount();
        root = null;
      });

      // Advance time past the timer
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  // ==========================================================================
  // SUITE 2: Rapid Sequential Quick-Blocks in UndoToast.tsx & HeroSandbox.tsx
  // ==========================================================================
  describe('Suite 2: Rapid Sequential Quick-Blocks & Toast Lifecycle', () => {
    it('rapidly clicking Quick Clean across multiple tweets: previous dismissal timers are cancelled and new toast stays active', () => {
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

      // Set to mild preset so we have multiple visible tweets to click Quick Clean on
      const mildBtn = container.querySelectorAll('.segmented-group')[1].querySelectorAll('button')[0];
      act(() => {
        mildBtn.click();
      });

      // Find all visible "净空" quick clean buttons
      const cleanBtns = container.querySelectorAll('.btn-quick-clean');
      expect(cleanBtns.length).toBeGreaterThanOrEqual(2);

      // 1. Click Quick Clean on tweet 1
      act(() => {
        (cleanBtns[0] as HTMLButtonElement).click();
      });

      let toast = container.querySelector('.undo-toast');
      expect(toast).not.toBeNull();
      const firstHandle = toast?.querySelector('.undo-toast-label')?.textContent;
      expect(firstHandle).toMatch(/已拦截 @/);

      // Advance by 1000ms
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // 2. Click Quick Clean on tweet 2
      act(() => {
        const remainingCleanBtns = container.querySelectorAll('.btn-quick-clean');
        (remainingCleanBtns[0] as HTMLButtonElement).click();
      });

      toast = container.querySelector('.undo-toast');
      expect(toast).not.toBeNull();
      const secondHandle = toast?.querySelector('.undo-toast-label')?.textContent;
      expect(secondHandle).toMatch(/已拦截 @/);
      expect(secondHandle).not.toEqual(firstHandle);

      // Toast remaining duration resets back to ~4.5s
      expect(toast?.textContent).toMatch(/4\.[45]s/);

      // Advance by 3600ms (which would have expired the first operation at 4500ms, but NOT the second)
      act(() => {
        vi.advanceTimersByTime(3600);
      });

      // Toast must STILL be visible for the second tweet!
      toast = container.querySelector('.undo-toast');
      expect(toast).not.toBeNull();
      expect(toast?.classList.contains('exit')).toBe(false);
    });

    it('incoming operation during Dismiss (X) 150ms exit window cancels the dismissal and adopts the new operation', () => {
      const onDismiss = vi.fn();
      const onUndo = vi.fn();
      const now = 500000;
      vi.setSystemTime(now);

      const op1: UndoOperation = {
        id: 'op_1',
        tweetId: 'tweet_1',
        authorHandle: '@author_one',
        authorName: 'Author One',
        createdAt: now,
        undoUntil: now + 4500,
        durationMs: 4500,
        status: 'active',
      };

      root = createRoot(container);
      act(() => {
        root!.render(<UndoToast operation={op1} onUndo={onUndo} onDismiss={onDismiss} locale="zh-CN" />);
      });

      // Click dismiss (X button)
      const dismissBtn = container.querySelector('.btn-toast-dismiss') as HTMLButtonElement;
      expect(dismissBtn).not.toBeNull();

      act(() => {
        dismissBtn.click();
      });

      const toast = container.querySelector('.undo-toast');
      expect(toast?.classList.contains('exit')).toBe(true);

      // At t = 50ms into the 150ms exit timeout, a new operation arrives
      vi.setSystemTime(now + 50);
      const op2: UndoOperation = {
        id: 'op_2',
        tweetId: 'tweet_2',
        authorHandle: '@author_two',
        authorName: 'Author Two',
        createdAt: now + 50,
        undoUntil: now + 50 + 4500,
        durationMs: 4500,
        status: 'active',
      };

      act(() => {
        root!.render(<UndoToast operation={op2} onUndo={onUndo} onDismiss={onDismiss} locale="zh-CN" />);
      });

      // Advance past the 150ms exit timer of op1 (e.g. 200ms)
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // onDismiss must NOT have been called!
      expect(onDismiss).not.toHaveBeenCalled();

      // Toast must not be exiting anymore
      const currentToast = container.querySelector('.undo-toast');
      expect(currentToast).not.toBeNull();
      expect(currentToast?.classList.contains('exit')).toBe(false);
      expect(currentToast?.textContent).toContain('已拦截 @author_two');
    });

    it('incoming operation during natural expiration 200ms exit window cancels the dismissal', () => {
      const onDismiss = vi.fn();
      const onUndo = vi.fn();
      const now = 500000;
      vi.setSystemTime(now);

      const op1: UndoOperation = {
        id: 'op_1',
        tweetId: 'tweet_1',
        authorHandle: '@author_one',
        authorName: 'Author One',
        createdAt: now,
        undoUntil: now + 4500,
        durationMs: 4500,
        status: 'active',
      };

      root = createRoot(container);
      act(() => {
        root!.render(<UndoToast operation={op1} onUndo={onUndo} onDismiss={onDismiss} locale="zh-CN" />);
      });

      // Advance to natural expiration (4500ms)
      act(() => {
        vi.advanceTimersByTime(4500);
      });

      const toast = container.querySelector('.undo-toast');
      expect(toast?.classList.contains('exit')).toBe(true);

      // At t = 100ms into the 200ms natural exit window, new operation arrives
      vi.setSystemTime(now + 4600);
      const op2: UndoOperation = {
        id: 'op_2',
        tweetId: 'tweet_2',
        authorHandle: '@author_two',
        authorName: 'Author Two',
        createdAt: now + 4600,
        undoUntil: now + 4600 + 4500,
        durationMs: 4500,
        status: 'active',
      };

      act(() => {
        root!.render(<UndoToast operation={op2} onUndo={onUndo} onDismiss={onDismiss} locale="zh-CN" />);
      });

      // Advance past op1's natural 200ms exit timer
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // onDismiss must NOT have fired!
      expect(onDismiss).not.toHaveBeenCalled();

      // op2 is active and counting down
      const currentToast = container.querySelector('.undo-toast');
      expect(currentToast?.classList.contains('exit')).toBe(false);
      expect(currentToast?.textContent).toContain('已拦截 @author_two');
    });
  });

  // ==========================================================================
  // SUITE 3: Zero Double-`@` Verification Across All Locales and Views
  // ==========================================================================
  describe('Suite 3: Zero Double-`@` Strict Verification', () => {
    it('SSR rendered HTML of HeroSandbox across all 10 locales contains ZERO "@@" or "@<!-- -->@"', () => {
      const locales = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'pt', 'fr', 'de', 'ru'] as const;

      for (const loc of locales) {
        const html = renderToString(React.createElement(HeroSandbox, { locale: loc as any }));

        expect(html, `Double @@ found in SSR for locale ${loc}`).not.toContain('@@');
        expect(html, `@<!-- -->@ found in SSR for locale ${loc}`).not.toContain('@<!-- -->@');
      }
    });

    it('Client DOM rendered HeroSandbox contains ZERO "@@" in text nodes, attributes, or ARIA labels', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false, // master OFF so all tweets render
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

      const fullHtml = container.innerHTML;
      expect(fullHtml).not.toContain('@@');
      expect(fullHtml).not.toContain('@<!-- -->@');

      // Check all aria-labels
      const elementsWithAria = container.querySelectorAll('[aria-label]');
      elementsWithAria.forEach((el) => {
        const label = el.getAttribute('aria-label') || '';
        expect(label).not.toContain('@@');
        if (label.includes('@')) {
          expect(label).toMatch(/@[a-zA-Z0-9_]+/);
        }
      });

      // Check all tweet-author-handle elements
      const handleElements = container.querySelectorAll('.tweet-author-handle');
      expect(handleElements.length).toBeGreaterThan(0);
      handleElements.forEach((el) => {
        const text = el.textContent?.trim() || '';
        if (text.startsWith('@')) {
          expect(text).toMatch(/^@[a-zA-Z0-9_]+$/);
          expect(text).not.toContain('@@');
        }
      });
    });

    it('Folded and expanded tweet views contain ZERO "@@" in folded-author, tweet-author-handle, and aria-labels', () => {
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

      // Expand all folded bars
      const triggers = container.querySelectorAll('.collapse-trigger');
      expect(triggers.length).toBeGreaterThanOrEqual(4);

      triggers.forEach((btn) => {
        act(() => {
          (btn as HTMLButtonElement).click();
        });
      });

      const fullHtml = container.innerHTML;
      expect(fullHtml).not.toContain('@@');
      expect(fullHtml).not.toContain('@<!-- -->@');

      const foldedAuthors = container.querySelectorAll('.folded-author');
      foldedAuthors.forEach((el) => {
        const text = el.textContent?.trim() || '';
        expect(text).toMatch(/^@[a-zA-Z0-9_]+$/);
        expect(text).not.toContain('@@');
      });
    });

    it('formatHandle handles all adversarial inputs idempotently and safely', () => {
      // Normal cases
      expect(formatHandle('@keepxclean')).toBe('@keepxclean');
      expect(formatHandle('keepxclean')).toBe('@keepxclean');

      // Double, triple, multi-@
      expect(formatHandle('@@keepxclean')).toBe('@keepxclean');
      expect(formatHandle('@@@keepxclean')).toBe('@keepxclean');
      expect(formatHandle('@@@@@@@keepxclean')).toBe('@keepxclean');

      // Idempotency
      expect(formatHandle(formatHandle('keepxclean'))).toBe('@keepxclean');
      expect(formatHandle(formatHandle('@keepxclean'))).toBe('@keepxclean');
      expect(formatHandle(formatHandle('@@keepxclean'))).toBe('@keepxclean');

      // Empty / Nullish
      expect(formatHandle('')).toBe('');
      expect(formatHandle(null)).toBe('');
      expect(formatHandle(undefined)).toBe('');

      // Just '@' or '@@'
      expect(formatHandle('@')).toBe('@');
      expect(formatHandle('@@')).toBe('@');
    });

    it('UndoToast renders clean single-@ handle for any input format (no @, single @, double @)', () => {
      const now = 100000;
      const testCases = [
        { input: 'alexchen_arch', expected: '已拦截 @alexchen_arch' },
        { input: '@alexchen_arch', expected: '已拦截 @alexchen_arch' },
        { input: '@@alexchen_arch', expected: '已拦截 @alexchen_arch' },
        { input: '@@@alexchen_arch', expected: '已拦截 @alexchen_arch' },
      ];

      for (const { input, expected } of testCases) {
        const op: UndoOperation = {
          id: 'test_op',
          tweetId: 'tweet_test',
          authorHandle: input,
          authorName: 'Test',
          createdAt: now,
          undoUntil: now + 4500,
          durationMs: 4500,
          status: 'active',
        };

        const html = renderToString(
          React.createElement(UndoToast, {
            operation: op,
            onUndo: () => {},
            onDismiss: () => {},
            locale: 'zh-CN',
          })
        );

        expect(html).toContain(expected);
        expect(html).not.toContain('@@');
        expect(html).not.toContain('@<!-- -->@');
      }
    });
  });
});
