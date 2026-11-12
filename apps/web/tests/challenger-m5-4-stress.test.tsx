// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@keepxclean/shared';
import { I18nProvider, DICTIONARIES } from '../src/locales';
import { CommunityStats, FALLBACK_STATS } from '../src/components/CommunityStats';
import { ArchitectureFlow } from '../src/components/ArchitectureFlow';
import { SideloadGuide } from '../src/components/SideloadGuide';
import { FaqAccordion } from '../src/components/FaqAccordion';
import { LangFilterCard } from '../src/components/BentoGrid/LangFilterCard';
import { GITHUB_RELEASE_URL } from '../src/config';

describe('Adversarial Challenger M5-4: Deep Verification & Stress Suite', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const originalFetch = globalThis.fetch;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.restoreAllMocks();
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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
    globalThis.fetch = originalFetch;
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SECTION 1: CommunityStats Clock Skew & Numerical Underflow Clamping
  // =========================================================================
  describe('1. CommunityStats: Extreme Clock Skew & Animation Clamping', () => {
    it('1.1 Extreme negative clock skew (now << startTime) clamps elapsed to 0 and counts to non-negative', async () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });

      let rafCallback: ((time: number) => void) | null = null;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallback = cb;
        return 1001;
      });

      const baseTime = 50000;
      vi.spyOn(performance, 'now').mockReturnValue(baseTime);

      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // pending

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      expect(rafCallback).not.toBeNull();

      // Extreme clock skew backwards: 1,000,000ms into the past
      await act(async () => {
        rafCallback!(baseTime - 1_000_000);
      });

      const accountsCard = container.querySelector('[data-testid="stats-metric-accounts"]');
      const blockedCard = container.querySelector('[data-testid="stats-metric-blocked"]');
      const votesCard = container.querySelector('[data-testid="stats-metric-votes"]');

      expect(accountsCard?.textContent).not.toContain('-');
      expect(blockedCard?.textContent).not.toContain('-');
      expect(votesCard?.textContent).not.toContain('-');

      // Specifically, elapsed clamped to 0 means eased is 0 -> counts are 0
      expect(accountsCard?.textContent).toContain('0+');
      expect(blockedCard?.textContent).toContain('0+');
      expect(votesCard?.textContent).toContain('0');
    });

    it('1.2 Successive negative time frames followed by normal progression monotonically advance without glitch', async () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });

      let rafCallback: ((time: number) => void) | null = null;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallback = cb;
        return 1002;
      });

      const baseTime = 10000;
      vi.spyOn(performance, 'now').mockReturnValue(baseTime);

      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      expect(rafCallback).not.toBeNull();

      // Sequence of chaotic timestamps: backwards, same, forward, backwards, then complete
      const timestamps = [
        baseTime - 500, // skew past
        baseTime - 200, // still past
        baseTime - 1,   // sub-millisecond past
        baseTime,       // exact start
        baseTime + 200, // 25% duration (duration = 800)
        baseTime + 150, // backwards jitter mid-flight
        baseTime + 400, // 50% duration
        baseTime + 800, // 100% duration
        baseTime + 2000 // post-duration
      ];

      for (const ts of timestamps) {
        await act(async () => {
          rafCallback!(ts);
        });

        const accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
        const blocked = container.querySelector('[data-testid="stats-metric-blocked"]');
        const votes = container.querySelector('[data-testid="stats-metric-votes"]');

        expect(accounts?.textContent).not.toContain('-');
        expect(blocked?.textContent).not.toContain('-');
        expect(votes?.textContent).not.toContain('-');
      }

      // At end of duration, values match target FALLBACK_STATS
      const accountsFinal = container.querySelector('[data-testid="stats-metric-accounts"]');
      const votesFinal = container.querySelector('[data-testid="stats-metric-votes"]');
      expect(accountsFinal?.textContent).toContain('1,280+');
      expect(votesFinal?.textContent).toContain('3,890');
    });

    it('1.3 High-value numbers under clock skew never overflow or become negative', async () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });

      let rafCallback: ((time: number) => void) | null = null;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallback = cb;
        return 1003;
      });

      const baseTime = 20000;
      vi.spyOn(performance, 'now').mockReturnValue(baseTime);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          totalFlaggedAccounts: 987654321,
          activeCrowdBlocked: 123456789,
          totalVotes: 555555555,
        }),
      });

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      // Deliver negative skew frame
      await act(async () => {
        rafCallback!(baseTime - 5000);
      });

      const accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
      expect(accounts?.textContent).not.toContain('-');
      expect(accounts?.textContent).toContain('0+');

      // Complete animation
      await act(async () => {
        rafCallback!(baseTime + 800);
      });

      const accountsFinished = container.querySelector('[data-testid="stats-metric-accounts"]');
      expect(accountsFinished?.textContent).toContain('987,654,321+');
    });

    it('1.4 Component unmount during slow fetch cleanly aborts AbortController and cancels animation', async () => {
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });

      const abortSpy = vi.fn();
      let capturedSignal: AbortSignal | null = null;

      globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
        capturedSignal = options?.signal;
        if (capturedSignal) {
          capturedSignal.addEventListener('abort', abortSpy);
        }
        return new Promise(() => {}); // never resolves
      });

      const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame');

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      expect(abortSpy).not.toHaveBeenCalled();

      // Unmount component
      act(() => {
        root!.unmount();
        root = null;
      });

      // Verify fetch was aborted on unmount
      expect(abortSpy).toHaveBeenCalled();
      expect(cancelRafSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // SECTION 2: ArchitectureFlow Accessibility & Keyboard Navigation
  // =========================================================================
  describe('2. ArchitectureFlow: Accessibility & Keyboard Navigation', () => {
    it('2.1 Full ARIA tablist / tab / tabpanel roles, IDs, and cross-references', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ArchitectureFlow />
          </I18nProvider>
        );
      });

      // 1. Tablist role
      const tablist = container.querySelector('[role="tablist"]');
      expect(tablist).not.toBeNull();
      expect(tablist?.getAttribute('aria-label')).toBe('Architecture Flow Steps');

      // 2. Tab roles
      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs.length).toBe(4);

      tabs.forEach((tab, index) => {
        const stepNum = index + 1;
        expect(tab.id).toBe(`arch-step-${stepNum}`);
        expect(tab.getAttribute('aria-controls')).toBe('arch-inspector-panel');
        expect(tab.getAttribute('tabindex')).toBe('0');
      });

      // 3. Tabpanel role
      const panel = container.querySelector('[role="tabpanel"]');
      expect(panel).not.toBeNull();
      expect(panel?.id).toBe('arch-inspector-panel');
      expect(panel?.getAttribute('aria-labelledby')).toBe('arch-step-1');

      // 4. Initial active state
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(tabs[1].getAttribute('aria-selected')).toBe('false');
      expect(tabs[2].getAttribute('aria-selected')).toBe('false');
      expect(tabs[3].getAttribute('aria-selected')).toBe('false');
    });

    it('2.2 Keyboard Enter and Space activation updates active tab and inspector panel', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ArchitectureFlow />
          </I18nProvider>
        );
      });

      const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
      const panel = container.querySelector('[role="tabpanel"]');

      // Test activating step 2 via 'Enter'
      await act(async () => {
        tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(tabs[1].getAttribute('aria-selected')).toBe('true');
      expect(tabs[0].getAttribute('aria-selected')).toBe('false');
      expect(panel?.getAttribute('aria-labelledby')).toBe('arch-step-2');
      expect(panel?.textContent).toContain('Step 2:');

      // Test activating step 4 via ' ' (Space)
      await act(async () => {
        tabs[3].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(tabs[3].getAttribute('aria-selected')).toBe('true');
      expect(tabs[1].getAttribute('aria-selected')).toBe('false');
      expect(panel?.getAttribute('aria-labelledby')).toBe('arch-step-4');
      expect(panel?.textContent).toContain('Step 4:');

      // Test activating step 3 via 'Enter'
      await act(async () => {
        tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(tabs[2].getAttribute('aria-selected')).toBe('true');
      expect(panel?.getAttribute('aria-labelledby')).toBe('arch-step-3');

      // Test activating step 1 via ' ' (Space)
      await act(async () => {
        tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(panel?.getAttribute('aria-labelledby')).toBe('arch-step-1');
    });

    it('2.3 Non-activation keys do not trigger step mutation', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ArchitectureFlow />
          </I18nProvider>
        );
      });

      const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');

      const nonActivatingKeys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Tab', 'Escape', 'Shift', 'Backspace'];

      for (const key of nonActivatingKeys) {
        await act(async () => {
          tabs[2].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        });
        // Still step 1 active
        expect(tabs[0].getAttribute('aria-selected')).toBe('true');
        expect(tabs[2].getAttribute('aria-selected')).toBe('false');
      }
    });

    it('2.4 Tabpanel aria-labelledby stays synchronized across all step transitions', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ArchitectureFlow />
          </I18nProvider>
        );
      });

      const tabs = container.querySelectorAll<HTMLElement>('[role="tab"]');
      const panel = container.querySelector('[role="tabpanel"]');

      for (let i = 0; i < 4; i++) {
        await act(async () => {
          tabs[i].click();
        });
        expect(panel?.getAttribute('aria-labelledby')).toBe(`arch-step-${i + 1}`);
        expect(tabs[i].getAttribute('aria-selected')).toBe('true');
        for (let j = 0; j < 4; j++) {
          if (j !== i) {
            expect(tabs[j].getAttribute('aria-selected')).toBe('false');
          }
        }
      }
    });
  });

  // =========================================================================
  // SECTION 3: Sideload Guide Clipboard Fallbacks
  // =========================================================================
  describe('3. Sideload Guide: Clipboard Fallbacks & Error Resilience', () => {
    it('3.1 Primary clipboard API: copies exact URL and shows feedback then resets', async () => {
      vi.useFakeTimers();

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <SideloadGuide />
          </I18nProvider>
        );
      });

      const copyChip = container.querySelector('[data-testid="copy-chrome-extensions-chip"]') as HTMLButtonElement;
      expect(copyChip).not.toBeNull();

      // Check initial state: no green checkmark
      expect(copyChip.querySelector('.text-green')).toBeNull();

      await act(async () => {
        copyChip.click();
      });

      expect(writeTextMock).toHaveBeenCalledWith('chrome://extensions');
      // Green checkmark active
      expect(copyChip.querySelector('.text-green')).not.toBeNull();

      // Advance timers by 2000ms
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Checkmark reverted
      expect(copyChip.querySelector('.text-green')).toBeNull();

      vi.useRealTimers();
    });

    it('3.2 Clipboard API rejection (NotAllowedError) handles safely without throwing unhandled rejection', async () => {
      vi.useFakeTimers();

      const notAllowedErr = new DOMException('Permission denied', 'NotAllowedError');
      const writeTextMock = vi.fn().mockRejectedValue(notAllowedErr);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <SideloadGuide />
          </I18nProvider>
        );
      });

      const copyChip = container.querySelector('[data-testid="copy-chrome-extensions-chip"]') as HTMLButtonElement;

      // Click should not throw uncaught error
      await act(async () => {
        copyChip.click();
      });

      expect(writeTextMock).toHaveBeenCalledWith('chrome://extensions');
      // Still provides feedback gracefully
      expect(copyChip.querySelector('.text-green')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(copyChip.querySelector('.text-green')).toBeNull();

      vi.useRealTimers();
    });

    it('3.3 Fallback to textarea + document.execCommand when navigator.clipboard is undefined', async () => {
      vi.useFakeTimers();

      // Remove navigator.clipboard
      // @ts-ignore
      delete navigator.clipboard;

      const execCommandSpy = vi.fn().mockReturnValue(true);
      document.execCommand = execCommandSpy;

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <SideloadGuide />
          </I18nProvider>
        );
      });

      const copyChip = container.querySelector('[data-testid="copy-chrome-extensions-chip"]') as HTMLButtonElement;

      await act(async () => {
        copyChip.click();
      });

      // execCommand was invoked with 'copy'
      expect(execCommandSpy).toHaveBeenCalledWith('copy');

      // Verify temporary textarea was removed from document body (no DOM leak)
      expect(document.body.querySelector('textarea')).toBeNull();

      // Feedback shows
      expect(copyChip.querySelector('.text-green')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(copyChip.querySelector('.text-green')).toBeNull();

      vi.useRealTimers();
    });

    it('3.4 Fallback executes cleanly even if document.execCommand throws', async () => {
      vi.useFakeTimers();

      // @ts-ignore
      delete navigator.clipboard;

      document.execCommand = vi.fn().mockImplementation(() => {
        throw new Error('execCommand disabled in environment');
      });

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <SideloadGuide />
          </I18nProvider>
        );
      });

      const copyChip = container.querySelector('[data-testid="copy-chrome-extensions-chip"]') as HTMLButtonElement;

      // Should not throw unhandled exception
      await act(async () => {
        copyChip.click();
      });

      expect(copyChip.querySelector('.text-green')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(copyChip.querySelector('.text-green')).toBeNull();

      vi.useRealTimers();
    });

    it('3.5 Rapid successive clicks on copy chip do not break state or leak DOM elements', async () => {
      vi.useFakeTimers();

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <SideloadGuide />
          </I18nProvider>
        );
      });

      const copyChip = container.querySelector('[data-testid="copy-chrome-extensions-chip"]') as HTMLButtonElement;

      // Click 10 times in rapid succession
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          copyChip.click();
        });
      }

      expect(writeTextMock).toHaveBeenCalledTimes(10);
      expect(copyChip.querySelector('.text-green')).not.toBeNull();

      // After 2000ms, reverts cleanly
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(copyChip.querySelector('.text-green')).toBeNull();

      vi.useRealTimers();
    });

    it('3.6 Step 1 link attributes strictly adhere to security standards', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <SideloadGuide />
          </I18nProvider>
        );
      });

      const downloadLink = container.querySelector('[data-testid="download-release-btn"]') as HTMLAnchorElement;
      expect(downloadLink).not.toBeNull();
      expect(downloadLink.getAttribute('href')).toBe(GITHUB_RELEASE_URL);
      expect(downloadLink.getAttribute('target')).toBe('_blank');
      expect(downloadLink.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });

  // =========================================================================
  // SECTION 4: FAQ Accordion State Machine & ARIA Specifications
  // =========================================================================
  describe('4. FAQ Accordion: State Machine & ARIA Integrity', () => {
    it('4.1 Initial state: strictly Item 0 is open, all others closed with proper ARIA attributes', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <FaqAccordion />
          </I18nProvider>
        );
      });

      const triggers = container.querySelectorAll<HTMLButtonElement>('.faq-trigger-btn');
      expect(triggers.length).toBeGreaterThan(0);

      triggers.forEach((trigger, idx) => {
        const isOpen = idx === 0;
        expect(trigger.id).toBe(`faq-trigger-${idx}`);
        expect(trigger.getAttribute('aria-controls')).toBe(`faq-panel-${idx}`);
        expect(trigger.getAttribute('aria-expanded')).toBe(String(isOpen));

        const panel = container.querySelector(`#faq-panel-${idx}`);
        if (isOpen) {
          expect(panel).not.toBeNull();
          expect(panel?.getAttribute('role')).toBe('region');
          expect(panel?.getAttribute('aria-labelledby')).toBe(`faq-trigger-${idx}`);
        } else {
          expect(panel).toBeNull();
        }
      });
    });

    it('4.2 Multi-open capability: opening arbitrary combinations keeps existing open items intact', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <FaqAccordion />
          </I18nProvider>
        );
      });

      const triggers = container.querySelectorAll<HTMLButtonElement>('.faq-trigger-btn');
      expect(triggers.length).toBeGreaterThanOrEqual(4);

      // Open Item 1 (Item 0 should remain open)
      await act(async () => {
        triggers[1].click();
      });
      expect(triggers[0].getAttribute('aria-expanded')).toBe('true');
      expect(triggers[1].getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector('#faq-panel-0')).not.toBeNull();
      expect(container.querySelector('#faq-panel-1')).not.toBeNull();

      // Open Item 3
      await act(async () => {
        triggers[3].click();
      });
      expect(triggers[0].getAttribute('aria-expanded')).toBe('true');
      expect(triggers[1].getAttribute('aria-expanded')).toBe('true');
      expect(triggers[3].getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector('#faq-panel-3')).not.toBeNull();

      // Close Item 1 (Items 0 and 3 should remain open)
      await act(async () => {
        triggers[1].click();
      });
      expect(triggers[0].getAttribute('aria-expanded')).toBe('true');
      expect(triggers[1].getAttribute('aria-expanded')).toBe('false');
      expect(triggers[3].getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector('#faq-panel-1')).toBeNull();
      expect(container.querySelector('#faq-panel-0')).not.toBeNull();
      expect(container.querySelector('#faq-panel-3')).not.toBeNull();
    });

    it('4.3 All items closed (zero open items) is a valid reachable state', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <FaqAccordion />
          </I18nProvider>
        );
      });

      const triggers = container.querySelectorAll<HTMLButtonElement>('.faq-trigger-btn');

      // Close item 0 (initial open item)
      await act(async () => {
        triggers[0].click();
      });

      triggers.forEach((trigger, idx) => {
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(container.querySelector(`#faq-panel-${idx}`)).toBeNull();
      });
    });

    it('4.4 All items open concurrently is supported', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <FaqAccordion />
          </I18nProvider>
        );
      });

      const triggers = container.querySelectorAll<HTMLButtonElement>('.faq-trigger-btn');

      // Open every trigger
      for (let i = 1; i < triggers.length; i++) {
        await act(async () => {
          triggers[i].click();
        });
      }

      triggers.forEach((trigger, idx) => {
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(container.querySelector(`#faq-panel-${idx}`)).not.toBeNull();
      });
    });

    it('4.5 Inversion / Reversibility property: toggle(i) followed by toggle(i) restores exact prior state', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <FaqAccordion />
          </I18nProvider>
        );
      });

      const triggers = container.querySelectorAll<HTMLButtonElement>('.faq-trigger-btn');
      const testIndices = [0, 1, 2, 3, 4];

      for (const idx of testIndices) {
        if (idx >= triggers.length) continue;

        // Snapshot state of all items
        const beforeState = Array.from(triggers).map((t) => t.getAttribute('aria-expanded'));

        // Toggle twice
        await act(async () => {
          triggers[idx].click();
        });
        await act(async () => {
          triggers[idx].click();
        });

        // Snapshot state after double toggle
        const afterState = Array.from(triggers).map((t) => t.getAttribute('aria-expanded'));

        expect(afterState).toEqual(beforeState);
      }
    });

    it('4.6 High-frequency randomized stress test against mathematical state machine oracle', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <FaqAccordion />
          </I18nProvider>
        );
      });

      const triggers = container.querySelectorAll<HTMLButtonElement>('.faq-trigger-btn');
      const count = triggers.length;

      // Mathematical oracle: Set of open indices
      const oracle = new Set<number>([0]);

      // Seeded deterministic pseudo-random sequence (LCG)
      let seed = 42;
      const pseudoRandom = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      // Perform 60 randomized toggles
      for (let step = 0; step < 60; step++) {
        const targetIdx = Math.floor(pseudoRandom() * count);

        // Update oracle
        if (oracle.has(targetIdx)) {
          oracle.delete(targetIdx);
        } else {
          oracle.add(targetIdx);
        }

        // Action on component
        await act(async () => {
          triggers[targetIdx].click();
        });

        // Verify component state against oracle
        for (let i = 0; i < count; i++) {
          const shouldBeOpen = oracle.has(i);
          const actualExpanded = triggers[i].getAttribute('aria-expanded');
          expect(actualExpanded).toBe(String(shouldBeOpen));

          const panel = container.querySelector(`#faq-panel-${i}`);
          if (shouldBeOpen) {
            expect(panel).not.toBeNull();
          } else {
            expect(panel).toBeNull();
          }
        }
      }
    });
  });

  // =========================================================================
  // SECTION 5: Feature 27 Language & Media Exemption Deep Stress
  // =========================================================================
  describe('5. Feature 27: Language & Media Exemption Edge Conditions', () => {
    it('5.1 Mode flipping under diverse language selections maintains deterministic visibility', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <LangFilterCard />
          </I18nProvider>
        );
      });

      const allowBtn = container.querySelector('[data-testid="lang-mode-allow"]') as HTMLButtonElement;
      const blockBtn = container.querySelector('[data-testid="lang-mode-block"]') as HTMLButtonElement;
      const mediaToggle = container.querySelector('[data-testid="media-exemption-toggle"]') as HTMLInputElement;
      const statusIndicator = container.querySelector('[data-testid="lang-status-indicator"]') as HTMLElement;

      // Turn OFF media exemption
      await act(async () => {
        mediaToggle.click();
      });
      expect(mediaToggle.checked).toBe(false);

      // In allow mode, fr is not selected -> filtered
      expect(statusIndicator.className).toContain('filtered');

      // Flip between allow and block 10 times rapidly
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          blockBtn.click();
        });
        // In block mode, fr is NOT selected in blocklist -> normal visibility!
        expect(statusIndicator.className).toContain('bypassed');

        await act(async () => {
          allowBtn.click();
        });
        // In allow mode, fr is NOT in allowlist -> filtered!
        expect(statusIndicator.className).toContain('filtered');
      }
    });

    it('5.2 Media toggle with all language chips deselected', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <LangFilterCard />
          </I18nProvider>
        );
      });

      const chips = Array.from(container.querySelectorAll<HTMLButtonElement>('.lang-chip'));
      // Deselect all selected chips
      for (const chip of chips) {
        if (chip.classList.contains('selected')) {
          await act(async () => {
            chip.click();
          });
        }
      }

      const mediaToggle = container.querySelector('[data-testid="media-exemption-toggle"]') as HTMLInputElement;
      const statusIndicator = container.querySelector('[data-testid="lang-status-indicator"]') as HTMLElement;

      // Media is ON -> bypassed
      expect(mediaToggle.checked).toBe(true);
      expect(statusIndicator.className).toContain('bypassed');

      // Turn media OFF
      await act(async () => {
        mediaToggle.click();
      });
      expect(mediaToggle.checked).toBe(false);
      // In allow mode with empty allowlist -> fr is blocked
      expect(statusIndicator.className).toContain('filtered');

      // Turn media back ON -> immediately restored to bypassed
      await act(async () => {
        mediaToggle.click();
      });
      expect(mediaToggle.checked).toBe(true);
      expect(statusIndicator.className).toContain('bypassed');
    });
  });
});
