// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_CLOUD_KEYWORDS } from '@keepxclean/shared';
import { I18nProvider } from '../src/locales';
import { HonestStatusCard } from '../src/components/BentoGrid/HonestStatusCard';
import { ProfileBadgeCard } from '../src/components/BentoGrid/ProfileBadgeCard';
import { CloudKeywordsCard } from '../src/components/BentoGrid/CloudKeywordsCard';

describe('Adversarial Challenger Iteration 2: M5 Stress & Robustness Suite', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let uncaughtErrors: Error[] = [];
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    vi.useFakeTimers();
    uncaughtErrors = [];
    originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      // Capture React state update warnings or uncaught errors
      const msg = args.join(' ');
      if (
        msg.includes('Can\'t perform a React state update on an unmounted component') ||
        msg.includes('Error:') ||
        msg.includes('Uncaught')
      ) {
        uncaughtErrors.push(new Error(msg));
      }
      originalConsoleError(...args);
    };

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
    console.error = originalConsoleError;
    vi.useRealTimers();
    expect(uncaughtErrors).toHaveLength(0);
  });

  // =========================================================================
  // SUITE 1: Feature 25 HonestStatusCard State Machine Mid-Cycle Replay
  // =========================================================================

  describe('Feature 25: Mid-Cycle Replay Rigorous Proof Matrix', () => {
    const testOffsets = [
      { label: 't = 100ms (early phase 1)', offset: 100 },
      { label: 't = 1000ms (mid phase 1)', offset: 1000 },
      { label: 't = 1490ms (phase 1 right before transition)', offset: 1490 },
      { label: 't = 1500ms (exact boundary phase 1 -> 2)', offset: 1500 },
      { label: 't = 2000ms (mid phase 2)', offset: 2000 },
      { label: 't = 3490ms (phase 2 right before transition)', offset: 3490 },
      { label: 't = 3500ms (exact boundary phase 2 -> 3)', offset: 3500 },
      { label: 't = 4000ms (mid phase 3)', offset: 4000 },
      { label: 't = 4490ms (phase 3 right before completion)', offset: 4490 },
      { label: 't = 4500ms (exact settled boundary)', offset: 4500 },
      { label: 't = 6000ms (post settled)', offset: 6000 },
    ];

    for (const { label, offset } of testOffsets) {
      it(`proves mid-cycle replay at ${label} reliably restarts countdown without freezing`, async () => {
        await act(async () => {
          root!.render(
            <I18nProvider initialLocale="en">
              <HonestStatusCard />
            </I18nProvider>
          );
        });

        // 1. Advance to test offset
        await act(async () => {
          vi.advanceTimersByTime(offset);
        });

        const replayBtn = container.querySelector('[data-testid="honest-replay-btn"]') as HTMLButtonElement;
        const timerBadge = container.querySelector('.honest-timer-badge');
        expect(replayBtn).not.toBeNull();

        // 2. Click Replay
        await act(async () => {
          replayBtn.click();
        });

        // 3. Immediately after replay, timer badge must reset to 4.5s
        expect(timerBadge?.textContent).toBe('4.5s');

        // 4. Advance 500ms: timer MUST advance and not be frozen at 4.5s
        await act(async () => {
          vi.advanceTimersByTime(500);
        });
        expect(timerBadge?.textContent).not.toBe('4.5s');
        const remainingAfter500 = Number(timerBadge?.textContent?.replace('s', ''));
        expect(remainingAfter500).toBeLessThanOrEqual(4.1);
        expect(remainingAfter500).toBeGreaterThanOrEqual(3.9);

        // 5. Advance to 2000ms total (+1500ms): should be in Phase 2
        await act(async () => {
          vi.advanceTimersByTime(1500);
        });
        const step2 = container.querySelector('[data-testid="honest-step-2"]');
        expect(step2?.className).toContain('active');

        // 6. Advance to 4000ms total (+2000ms): should be in Phase 3
        await act(async () => {
          vi.advanceTimersByTime(2000);
        });
        const step3 = container.querySelector('[data-testid="honest-step-3"]');
        expect(step3?.className).toContain('active');

        // 7. Advance to full completion (+600ms): should settle completely
        await act(async () => {
          vi.advanceTimersByTime(600);
        });
        expect(timerBadge?.textContent).toBe('0.0s');
        expect(container.textContent).toContain('Completed');
      });
    }

    it('survives rapid consecutive clicks on Replay button mid-cycle without desyncing or freezing', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      // Advance 1200ms
      await act(async () => {
        vi.advanceTimersByTime(1200);
      });

      const replayBtn = container.querySelector('[data-testid="honest-replay-btn"]') as HTMLButtonElement;
      const timerBadge = container.querySelector('.honest-timer-badge');

      // Rapidly trigger 25 replay clicks
      await act(async () => {
        for (let i = 0; i < 25; i++) {
          replayBtn.click();
        }
      });

      // Must be at 4.5s
      expect(timerBadge?.textContent).toBe('4.5s');

      // Now advance 600ms -> timer must advance smoothly
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(timerBadge?.textContent).not.toBe('4.5s');
      const remaining = Number(timerBadge?.textContent?.replace('s', ''));
      expect(remaining).toBeLessThanOrEqual(4.0);
      expect(remaining).toBeGreaterThanOrEqual(3.8);

      // Advance to full completion
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });
      expect(timerBadge?.textContent).toBe('0.0s');
      expect(container.textContent).toContain('Completed');
    });

    it('survives rapid alternating between Replay and Undo 20 times in sequence', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      const replayBtn = container.querySelector('[data-testid="honest-replay-btn"]') as HTMLButtonElement;
      const undoBtn = container.querySelector('[data-testid="honest-undo-btn"]') as HTMLButtonElement;

      for (let i = 0; i < 20; i++) {
        // Advance 200ms
        await act(async () => {
          vi.advanceTimersByTime(200);
        });

        // Click Undo
        await act(async () => {
          undoBtn.click();
        });
        expect(container.textContent).toContain('Rollback completed');

        // Click Replay
        await act(async () => {
          replayBtn.click();
        });
        expect(container.textContent).not.toContain('Rollback completed');
      }

      // After 20 alternations, advance to completion
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      expect(container.textContent).toContain('Completed');
    });

    it('verifies clicking disabled Undo button during Phase 3 does NOT trigger rollback', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      // Advance to Phase 3 (3600ms)
      await act(async () => {
        vi.advanceTimersByTime(3600);
      });

      const undoBtn = container.querySelector('[data-testid="honest-undo-btn"]') as HTMLButtonElement;
      expect(undoBtn.disabled).toBe(true);

      // Attempt to click disabled button
      await act(async () => {
        undoBtn.click();
      });

      // Must NOT be rolled back
      expect(container.textContent).not.toContain('Rollback completed');

      // Finish simulation
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(container.textContent).toContain('Completed');
    });

    it('supports prefers-reduced-motion: reduce without animation loop freeze on subsequent replay', async () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      // Immediate settled state due to reduced motion preference
      const timerBadge = container.querySelector('.honest-timer-badge');
      expect(timerBadge?.textContent).toBe('0.0s');
      expect(container.textContent).toContain('Completed');

      // Clicking replay with reduced motion should immediately settle
      const replayBtn = container.querySelector('[data-testid="honest-replay-btn"]') as HTMLButtonElement;
      await act(async () => {
        replayBtn.click();
      });
      expect(timerBadge?.textContent).toBe('0.0s');
      expect(container.textContent).toContain('Completed');

      window.matchMedia = originalMatchMedia;
    });
  });

  // =========================================================================
  // SUITE 2: Feature 26 ProfileBadgeCard Stress Testing
  // =========================================================================

  describe('Feature 26: ProfileBadgeCard Rapid Interaction Stress', () => {
    it('survives rapid interleaved clicking of Whitelist and Clean 50 times', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ProfileBadgeCard />
          </I18nProvider>
        );
      });

      const whitelistBtn = container.querySelector('[data-testid="profile-whitelist-btn"]') as HTMLButtonElement;
      const cleanBtn = container.querySelector('[data-testid="profile-clean-btn"]') as HTMLButtonElement;
      const injectedBar = container.querySelector('[data-testid="profile-injected-bar"]');

      await act(async () => {
        for (let i = 0; i < 25; i++) {
          cleanBtn.click();
          whitelistBtn.click();
        }
      });

      // Final state: Whitelisted
      expect(injectedBar?.textContent).toContain('Whitelisted');
      expect(injectedBar?.className).toContain('exempt');
      expect(container.querySelector('[data-testid="undo-clean-toast-btn"]')).toBeNull();

      // Click Clean one more time
      await act(async () => {
        cleanBtn.click();
      });
      expect(injectedBar?.textContent).toContain('Locally Blocked');
      expect(container.querySelector('[data-testid="undo-clean-toast-btn"]')).not.toBeNull();
    });

    it('survives rapid clicking of Undo Clean toast 30 times', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ProfileBadgeCard />
          </I18nProvider>
        );
      });

      const cleanBtn = container.querySelector('[data-testid="profile-clean-btn"]') as HTMLButtonElement;

      for (let i = 0; i < 15; i++) {
        await act(async () => {
          cleanBtn.click();
        });
        const undoCleanBtn = container.querySelector('[data-testid="undo-clean-toast-btn"]') as HTMLButtonElement;
        expect(undoCleanBtn).not.toBeNull();

        await act(async () => {
          undoCleanBtn.click();
        });
        expect(container.querySelector('[data-testid="undo-clean-toast-btn"]')).toBeNull();
      }

      // Timeline is visible and inspection metrics are present
      expect(container.querySelector('[data-testid="chip-age"]')).not.toBeNull();
    });

    it('survives rapid toggling of Following Exemption 50 times', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ProfileBadgeCard />
          </I18nProvider>
        );
      });

      const toggle = container.querySelector('[data-testid="following-exemption-toggle"]') as HTMLInputElement;
      expect(toggle.checked).toBe(false);

      await act(async () => {
        for (let i = 0; i < 50; i++) {
          toggle.click();
        }
      });

      // 50 toggles returns to unchecked
      expect(toggle.checked).toBe(false);
      expect(container.querySelector('[data-testid="chip-age"]')).not.toBeNull();

      // 51st toggle sets to checked
      await act(async () => {
        toggle.click();
      });
      expect(toggle.checked).toBe(true);
      expect(container.querySelector('[data-testid="chip-age"]')).toBeNull();
      expect(container.textContent).toContain('Following Exemption');
    });
  });

  // =========================================================================
  // SUITE 3: Feature 24 CloudKeywordsCard Stress Testing
  // =========================================================================

  describe('Feature 24: CloudKeywordsCard High-Frequency Stress', () => {
    it('survives toggling all 24 switches in rapid successive loops 5 times without mutating defaults', async () => {
      const initialSnapshot = JSON.parse(JSON.stringify(DEFAULT_CLOUD_KEYWORDS));

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CloudKeywordsCard />
          </I18nProvider>
        );
      });

      const badge = container.querySelector('[data-testid="keywords-active-badge"]');
      expect(badge?.textContent).toContain('24 / 24');

      const checkboxes = Array.from(
        container.querySelectorAll<HTMLInputElement>('.keyword-item input[type="checkbox"]')
      );
      expect(checkboxes.length).toBe(24);

      // Perform 5 full passes over all 24 switches
      await act(async () => {
        for (let pass = 0; pass < 5; pass++) {
          for (const cb of checkboxes) {
            cb.click();
          }
        }
      });

      // 5 toggles = odd number of toggles -> all should be disabled (0 / 24)
      expect(badge?.textContent).toContain('0 / 24');

      // One more pass -> 6 toggles = all re-enabled (24 / 24)
      await act(async () => {
        for (const cb of checkboxes) {
          cb.click();
        }
      });
      expect(badge?.textContent).toContain('24 / 24');

      // Verify immutable global default
      expect(DEFAULT_CLOUD_KEYWORDS).toEqual(initialSnapshot);
    });

    it('survives rapid category tab cycling interleaved with search inputs', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CloudKeywordsCard />
          </I18nProvider>
        );
      });

      const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('.keywords-tab-btn'));
      const searchInput = container.querySelector('.keywords-search-input') as HTMLInputElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;

      const queries = ['crypto', 'bot', 'free', 'telegram', 'solana', '100%'];

      await act(async () => {
        for (let i = 0; i < 30; i++) {
          const tab = tabs[i % tabs.length];
          tab.click();

          const query = queries[i % queries.length];
          nativeSetter?.call(searchInput, query);
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Reset search
        nativeSetter?.call(searchInput, '');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        tabs[0].click(); // All tab
      });

      expect(container.querySelectorAll('.keyword-item').length).toBe(24);
    });

    it('handles clipboard copy with modern API, fallback execCommand, and rejection error', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CloudKeywordsCard />
          </I18nProvider>
        );
      });

      const copyBtn = container.querySelectorAll<HTMLButtonElement>('.keyword-item-actions .btn-icon-subtle')[0];

      // Test 1: Modern navigator.clipboard.writeText
      const originalClipboard = navigator.clipboard;
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        configurable: true,
      });

      await act(async () => {
        copyBtn.click();
      });
      expect(writeTextMock).toHaveBeenCalled();
      expect(copyBtn.className).toContain('copied');

      // Fast-forward 2000ms -> feedback resets
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(copyBtn.className).not.toContain('copied');

      // Test 2: Fallback when clipboard is undefined
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
      });
      const originalExecCommand = (document as any).execCommand;
      const execCommandMock = vi.fn().mockReturnValue(true);
      (document as any).execCommand = execCommandMock;

      await act(async () => {
        copyBtn.click();
      });
      expect(execCommandMock).toHaveBeenCalledWith('copy');
      expect(copyBtn.className).toContain('copied');

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(copyBtn.className).not.toContain('copied');

      (document as any).execCommand = originalExecCommand;

      // Test 3: writeText throws exception -> gracefully shows copied feedback without crashing
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
        configurable: true,
      });

      await act(async () => {
        copyBtn.click();
      });
      expect(copyBtn.className).toContain('copied');

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(copyBtn.className).not.toContain('copied');

      // Restore clipboard
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true,
      });
    });

    it('handles rapid inspection drawer toggling and unmounting while drawer is open', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CloudKeywordsCard />
          </I18nProvider>
        );
      });

      const eyeButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>('.keyword-item-actions button[title="Inspect regex"]')
      );
      expect(eyeButtons.length).toBeGreaterThan(0);

      // Rapidly toggle inspection drawer on multiple rules
      await act(async () => {
        for (let i = 0; i < 10; i++) {
          eyeButtons[i % eyeButtons.length].click();
        }
      });

      // Drawer should be open
      expect(container.querySelector('[data-testid="regex-inspect-drawer"]')).not.toBeNull();

      // Unmount while open
      await act(async () => {
        root?.unmount();
        root = null;
      });

      expect(container.innerHTML).toBe('');
    });
  });

  // =========================================================================
  // SUITE 4: Zero Memory Leaks & Lifecycle Integrity
  // =========================================================================

  describe('Zero Memory Leaks & Unmount Stress', () => {
    it('survives 30 mount/unmount cycles of HonestStatusCard mid-cycle with zero dangling timer callbacks', async () => {
      for (let cycle = 0; cycle < 30; cycle++) {
        await act(async () => {
          root!.render(
            <I18nProvider initialLocale="en">
              <HonestStatusCard />
            </I18nProvider>
          );
        });

        // Run partial simulation
        await act(async () => {
          vi.advanceTimersByTime(700 + (cycle % 3) * 500);
        });

        // Unmount mid-simulation
        await act(async () => {
          root?.unmount();
          root = createRoot(container);
        });
      }

      // Advance timers by 60 seconds into the future
      await act(async () => {
        vi.advanceTimersByTime(60000);
      });

      // No uncaught errors or unmounted state update warnings
      expect(uncaughtErrors).toHaveLength(0);
    });

    it('survives 30 mount/unmount cycles of ProfileBadgeCard under active dirty state', async () => {
      for (let cycle = 0; cycle < 30; cycle++) {
        await act(async () => {
          root!.render(
            <I18nProvider initialLocale="en">
              <ProfileBadgeCard />
            </I18nProvider>
          );
        });

        // Trigger clean action
        const cleanBtn = container.querySelector('[data-testid="profile-clean-btn"]') as HTMLButtonElement;
        await act(async () => {
          cleanBtn.click();
        });

        // Unmount while undo toast is active
        await act(async () => {
          root?.unmount();
          root = createRoot(container);
        });
      }

      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      expect(uncaughtErrors).toHaveLength(0);
    });
  });
});
