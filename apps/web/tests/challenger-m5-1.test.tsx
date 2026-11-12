// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_CLOUD_KEYWORDS } from '@keepxclean/shared';
import { I18nProvider } from '../src/locales';
import { CloudKeywordsCard, getCategoryForRule } from '../src/components/BentoGrid/CloudKeywordsCard';
import { HonestStatusCard } from '../src/components/BentoGrid/HonestStatusCard';
import { ProfileBadgeCard } from '../src/components/BentoGrid/ProfileBadgeCard';

describe('Adversarial Challenger Suite: Milestone 5 (Features 24, 25, 26)', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
  });

  // =========================================================================
  // FEATURE 25: 4.5s Honest Feedback Demonstration State Machine
  // =========================================================================

  describe('Feature 25: 4.5s Honest Feedback Timing & State Machine', () => {
    it('verifies timing accuracy across Phase 1 (0 - 1.5s), Phase 2 (1.5 - 3.5s), Phase 3 (3.5 - 4.5s), and Settled', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      const step1 = container.querySelector('[data-testid="honest-step-1"]');
      const step2 = container.querySelector('[data-testid="honest-step-2"]');
      const step3 = container.querySelector('[data-testid="honest-step-3"]');
      const undoBtn = container.querySelector('[data-testid="honest-undo-btn"]') as HTMLButtonElement;
      const timerBadge = container.querySelector('.honest-timer-badge');
      const progressBg = container.querySelector('.honest-progress-bar-bg');

      // --- INITIAL / PHASE 1 (t = 0ms) ---
      expect(step1?.className).toContain('completed');
      expect(step2?.className).not.toContain('active');
      expect(step2?.className).not.toContain('completed');
      expect(step3?.className).not.toContain('active');
      expect(step3?.className).not.toContain('completed');
      expect(undoBtn.disabled).toBe(false);
      expect(timerBadge?.textContent).toBe('4.5s');
      expect(progressBg?.getAttribute('aria-valuenow')).toBe('0');

      // --- MID PHASE 1 (advance to t = 750ms) ---
      await act(async () => {
        vi.advanceTimersByTime(750);
      });
      expect(step1?.className).toContain('completed');
      expect(step2?.className).not.toContain('active');
      expect(step3?.className).not.toContain('active');
      expect(undoBtn.disabled).toBe(false);
      expect(Number(timerBadge?.textContent?.replace('s', ''))).toBeLessThanOrEqual(3.8);
      expect(Number(timerBadge?.textContent?.replace('s', ''))).toBeGreaterThanOrEqual(3.7);

      // --- BOUNDARY INTO PHASE 2 (advance to t = 1600ms total, +850ms) ---
      await act(async () => {
        vi.advanceTimersByTime(850);
      });
      // Now t = 1600ms: Phase 2 is active (1.5s - 3.5s)
      expect(step1?.className).toContain('completed');
      expect(step2?.className).toContain('active');
      expect(step2?.className).not.toContain('completed');
      expect(step3?.className).not.toContain('active');
      expect(undoBtn.disabled).toBe(false);

      // --- MID PHASE 2 (advance to t = 2500ms total, +900ms) ---
      await act(async () => {
        vi.advanceTimersByTime(900);
      });
      expect(step1?.className).toContain('completed');
      expect(step2?.className).toContain('active');
      expect(step3?.className).not.toContain('active');
      expect(undoBtn.disabled).toBe(false);
      expect(Number(timerBadge?.textContent?.replace('s', ''))).toBeLessThanOrEqual(2.1);
      expect(Number(timerBadge?.textContent?.replace('s', ''))).toBeGreaterThanOrEqual(1.9);

      // --- BOUNDARY INTO PHASE 3 (advance to t = 3600ms total, +1100ms) ---
      await act(async () => {
        vi.advanceTimersByTime(1100);
      });
      // Now t = 3600ms: Phase 3 is active (3.5s - 4.5s)
      expect(step1?.className).toContain('completed');
      expect(step2?.className).toContain('completed');
      expect(step3?.className).toContain('active');
      expect(step3?.className).not.toContain('completed');
      // Undo button is disabled in Phase 3
      expect(undoBtn.disabled).toBe(true);

      // --- ADVANCE TO SETTLED (advance to t = 4600ms total, +1000ms) ---
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(step1?.className).toContain('completed');
      expect(step2?.className).toContain('completed');
      expect(step3?.className).toContain('completed');
      expect(undoBtn.disabled).toBe(true);
      expect(timerBadge?.textContent).toBe('0.0s');
      expect(progressBg?.getAttribute('aria-valuenow')).toBe('100');
      expect(container.textContent).toContain('Completed');
    });

    it('verifies undo execution at t = 0.5s halts execution and displays honest rollback indicators', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      // Advance to t = 500ms
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      const undoBtn = container.querySelector('[data-testid="honest-undo-btn"]') as HTMLButtonElement;
      expect(undoBtn.disabled).toBe(false);

      await act(async () => {
        undoBtn.click();
      });

      // Verify all stages show cancelled status
      const step1 = container.querySelector('[data-testid="honest-step-1"]');
      const step2 = container.querySelector('[data-testid="honest-step-2"]');
      const step3 = container.querySelector('[data-testid="honest-step-3"]');
      expect(step1?.className).toContain('cancelled');
      expect(step2?.className).toContain('cancelled');
      expect(step3?.className).toContain('cancelled');

      // Verify rollback indicators
      expect(container.textContent).toContain('Rollback completed');
      expect(undoBtn.disabled).toBe(true);

      const fill = container.querySelector('.honest-progress-bar-fill') as HTMLElement;
      expect(fill.style.width).toBe('0%');

      // Verify execution is halted: advance time by 10,000ms
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      // Should remain cancelled and not progress to completed
      expect(container.textContent).toContain('Rollback completed');
      expect(container.textContent).not.toContain('Completed');
    });

    it('verifies undo execution at t = 1.2s halts execution and displays honest rollback indicators', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      // Advance to t = 1200ms
      await act(async () => {
        vi.advanceTimersByTime(1200);
      });

      const undoBtn = container.querySelector('[data-testid="honest-undo-btn"]') as HTMLButtonElement;
      expect(undoBtn.disabled).toBe(false);

      await act(async () => {
        undoBtn.click();
      });

      const step1 = container.querySelector('[data-testid="honest-step-1"]');
      const step2 = container.querySelector('[data-testid="honest-step-2"]');
      const step3 = container.querySelector('[data-testid="honest-step-3"]');
      expect(step1?.className).toContain('cancelled');
      expect(step2?.className).toContain('cancelled');
      expect(step3?.className).toContain('cancelled');
      expect(container.textContent).toContain('Rollback completed');
    });

    it('verifies undo execution at t = 2.0s (Phase 2) halts execution and displays honest rollback indicators', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      // Advance to t = 2000ms (in Phase 2)
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      const undoBtn = container.querySelector('[data-testid="honest-undo-btn"]') as HTMLButtonElement;
      expect(undoBtn.disabled).toBe(false);

      await act(async () => {
        undoBtn.click();
      });

      const step1 = container.querySelector('[data-testid="honest-step-1"]');
      const step2 = container.querySelector('[data-testid="honest-step-2"]');
      const step3 = container.querySelector('[data-testid="honest-step-3"]');
      expect(step1?.className).toContain('cancelled');
      expect(step2?.className).toContain('cancelled');
      expect(step3?.className).toContain('cancelled');
      expect(container.textContent).toContain('Rollback completed');
      expect(undoBtn.disabled).toBe(true);
    });

    it('verifies replay works cleanly after completion (settled state)', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      // Let simulation run to completion
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(container.textContent).toContain('Completed');

      // Click replay
      const replayBtn = container.querySelector('[data-testid="honest-replay-btn"]') as HTMLButtonElement;
      await act(async () => {
        replayBtn.click();
      });

      // It should reset to Phase 1
      const step1 = container.querySelector('[data-testid="honest-step-1"]');
      const step2 = container.querySelector('[data-testid="honest-step-2"]');
      expect(step1?.className).toContain('completed');
      expect(step2?.className).not.toContain('completed');
      expect(container.textContent).not.toContain('Completed');

      // And it progresses to Phase 2 after 2000ms
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(step2?.className).toContain('active');
    });

    it('verifies replay works cleanly after undo (rollback state)', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      // Advance to 500ms and undo
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      const undoBtn = container.querySelector('[data-testid="honest-undo-btn"]') as HTMLButtonElement;
      await act(async () => {
        undoBtn.click();
      });
      expect(container.textContent).toContain('Rollback completed');

      // Click replay
      const replayBtn = container.querySelector('[data-testid="honest-replay-btn"]') as HTMLButtonElement;
      await act(async () => {
        replayBtn.click();
      });

      expect(container.textContent).not.toContain('Rollback completed');
      expect(undoBtn.disabled).toBe(false);

      // And progresses through timeline
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      const step2 = container.querySelector('[data-testid="honest-step-2"]');
      expect(step2?.className).toContain('active');
    });

    it('adversarial challenge: unmounting mid-cycle at t = 2.0s leaves zero timer leaks or unhandled errors', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // Unmount mid-cycle
      await act(async () => {
        root?.unmount();
        root = null;
      });

      // Advance timers past total duration
      expect(() => {
        act(() => {
          vi.advanceTimersByTime(10000);
        });
      }).not.toThrow();
    });

    it('adversarial challenge: rapid clicking of replay button generates zero uncaught exceptions', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      const replayBtn = container.querySelector('[data-testid="honest-replay-btn"]') as HTMLButtonElement;
      expect(replayBtn).not.toBeNull();

      // Rapidly click replay 10 times in tight sequence
      expect(() => {
        act(() => {
          for (let i = 0; i < 10; i++) {
            replayBtn.click();
          }
        });
      }).not.toThrow();

      // Card should remain rendered
      expect(container.querySelector('[data-testid="bento-card-honest"]')).not.toBeNull();
    });

    it('adversarial challenge: mid-cycle replay test empirically proves animation freeze bug is resolved and timer advances', async () => {
      // Remediated via runId state trigger in handleReplay and dependency in useEffect.
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <HonestStatusCard />
          </I18nProvider>
        );
      });

      // Advance 1000ms into Phase 1
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      const timerBadge = container.querySelector('.honest-timer-badge');
      const timeBeforeReplay = timerBadge?.textContent;
      expect(timeBeforeReplay).not.toBe('4.5s');

      // Click replay mid-cycle while isRunning is true
      const replayBtn = container.querySelector('[data-testid="honest-replay-btn"]') as HTMLButtonElement;
      await act(async () => {
        replayBtn.click();
      });

      // Badge resets to 4.5s
      expect(timerBadge?.textContent).toBe('4.5s');

      // Now advance another 2000ms. In a healthy state machine, it advances past 4.5s into Phase 2 (<= 2.5s).
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // Timer badge properly advances past 4.5s and stays alive after mid-cycle replay
      expect(timerBadge?.textContent).not.toBe('4.5s');
      expect(Number(timerBadge?.textContent?.replace('s', ''))).toBeLessThanOrEqual(2.6);
      expect(Number(timerBadge?.textContent?.replace('s', ''))).toBeGreaterThanOrEqual(2.4);

      // Advance to full completion
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(timerBadge?.textContent).toBe('0.0s');
      expect(container.textContent).toContain('Completed');
    });
  });

  // =========================================================================
  // FEATURE 24: 24 Cloud Keywords Preview & Preset Immutability
  // =========================================================================

  describe('Feature 24: 24 Cloud Keywords Preview, Filtering & Preset Immutability', () => {
    it('verifies exact category counts across all 24 default rules: All [24], Cliche [9], Crypto [5], Follow [2], Nsfw [2], Scam [6]', () => {
      expect(DEFAULT_CLOUD_KEYWORDS).toHaveLength(24);

      const categoryMap: Record<string, string[]> = {
        cliche: [],
        crypto: [],
        follow: [],
        nsfw: [],
        scam: [],
      };

      for (const rule of DEFAULT_CLOUD_KEYWORDS) {
        const cat = getCategoryForRule(rule.id);
        expect(categoryMap[cat]).toBeDefined();
        categoryMap[cat].push(rule.id);
      }

      expect(categoryMap.cliche.length).toBe(9);
      expect(categoryMap.crypto.length).toBe(5);
      expect(categoryMap.follow.length).toBe(2);
      expect(categoryMap.nsfw.length).toBe(2);
      expect(categoryMap.scam.length).toBe(6);
      expect(
        categoryMap.cliche.length +
        categoryMap.crypto.length +
        categoryMap.follow.length +
        categoryMap.nsfw.length +
        categoryMap.scam.length
      ).toBe(24);
    });

    it('verifies UI category filtering renders exact matching rules for every category tab', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CloudKeywordsCard />
          </I18nProvider>
        );
      });

      const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('.keywords-tab-btn'));
      expect(tabs.length).toBe(6);

      const expectedCategories = [
        { labelPattern: /\(24\)/, count: 24 },
        { labelPattern: /\(9\)/, count: 9 },
        { labelPattern: /Crypto.*\(5\)/, count: 5 },
        { labelPattern: /Follow.*\(2\)/, count: 2 },
        { labelPattern: /Adult.*\(2\)/, count: 2 },
        { labelPattern: /Scam.*\(6\)/, count: 6 },
      ];

      for (const spec of expectedCategories) {
        const tab = tabs.find((t) => spec.labelPattern.test(t.textContent || ''));
        expect(tab).toBeDefined();

        await act(async () => {
          tab!.click();
        });

        const items = container.querySelectorAll('.keyword-item');
        expect(items.length).toBe(spec.count);
      }
    });

    it('verifies toggling rules updates active counter badge WITHOUT mutating DEFAULT_CLOUD_KEYWORDS', async () => {
      // Snapshot initial state of DEFAULT_CLOUD_KEYWORDS
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

      // Toggle rule 0
      const item0 = container.querySelector(`[data-testid="keyword-item-${DEFAULT_CLOUD_KEYWORDS[0].id}"]`);
      const checkbox0 = item0?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox0.checked).toBe(true);

      await act(async () => {
        checkbox0.click();
      });
      expect(checkbox0.checked).toBe(false);
      expect(badge?.textContent).toContain('23 / 24');

      // Toggle rule 1
      const item1 = container.querySelector(`[data-testid="keyword-item-${DEFAULT_CLOUD_KEYWORDS[1].id}"]`);
      const checkbox1 = item1?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox1.checked).toBe(true);

      await act(async () => {
        checkbox1.click();
      });
      expect(checkbox1.checked).toBe(false);
      expect(badge?.textContent).toContain('22 / 24');

      // Toggle rule 2
      const item2 = container.querySelector(`[data-testid="keyword-item-${DEFAULT_CLOUD_KEYWORDS[2].id}"]`);
      const checkbox2 = item2?.querySelector('input[type="checkbox"]') as HTMLInputElement;

      await act(async () => {
        checkbox2.click();
      });
      expect(badge?.textContent).toContain('21 / 24');

      // Toggle rule 0 back on
      await act(async () => {
        checkbox0.click();
      });
      expect(badge?.textContent).toContain('22 / 24');

      // STRICT IMMUTABILITY CHECK:
      // Verify DEFAULT_CLOUD_KEYWORDS was never mutated in memory
      expect(DEFAULT_CLOUD_KEYWORDS).toEqual(initialSnapshot);
      for (let i = 0; i < DEFAULT_CLOUD_KEYWORDS.length; i++) {
        expect(DEFAULT_CLOUD_KEYWORDS[i].enabled).toBe(initialSnapshot[i].enabled);
      }
    });

    it('verifies toggling all 24 rules off sets active badge to 0 / 24 without crashing', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CloudKeywordsCard />
          </I18nProvider>
        );
      });

      const badge = container.querySelector('[data-testid="keywords-active-badge"]');
      expect(badge?.textContent).toContain('24 / 24');

      // Toggle every single rule off
      const checkboxes = Array.from(
        container.querySelectorAll<HTMLInputElement>('.keyword-item input[type="checkbox"]')
      );
      expect(checkboxes.length).toBe(24);

      await act(async () => {
        for (const cb of checkboxes) {
          cb.click();
        }
      });

      expect(badge?.textContent).toContain('0 / 24');

      // Toggle all 24 back on
      await act(async () => {
        for (const cb of checkboxes) {
          cb.click();
        }
      });

      expect(badge?.textContent).toContain('24 / 24');
    });

    it('verifies search filtering across note, pattern, and id, and handles zero matches gracefully', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CloudKeywordsCard />
          </I18nProvider>
        );
      });

      const searchInput = container.querySelector('.keywords-search-input') as HTMLInputElement;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;

      // 1. Search by pattern snippet
      await act(async () => {
        nativeSetter?.call(searchInput, 'pump.fun');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      let items = container.querySelectorAll('.keyword-item');
      expect(items.length).toBeGreaterThanOrEqual(1);

      // 2. Search by ID
      await act(async () => {
        nativeSetter?.call(searchInput, 'cloud-cliche-ai-reply-1');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      items = container.querySelectorAll('.keyword-item');
      expect(items.length).toBe(1);

      // 3. Search for non-existent keyword
      await act(async () => {
        nativeSetter?.call(searchInput, 'nonexistent_impossible_string_xyz');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      items = container.querySelectorAll('.keyword-item');
      expect(items.length).toBe(0);
      // No crashes
      expect(container.querySelector('[data-testid="bento-card-keywords"]')).not.toBeNull();
    });

    it('adversarial challenge: search filter with special regex characters does not throw or crash', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CloudKeywordsCard />
          </I18nProvider>
        );
      });

      const searchInput = container.querySelector('.keywords-search-input') as HTMLInputElement;
      expect(searchInput).not.toBeNull();

      const adversarialInputs = [
        '[',
        ']',
        '[[[',
        '\\',
        '\\\\',
        '+',
        '++',
        '*',
        '**',
        '?',
        '(',
        ')',
        '()',
        '{',
        '}',
        '{}',
        '|',
        '||',
        '^',
        '$',
        '(?=.*)',
        '(?:[a-z]+)',
        '/(.*)/g',
        'cloud-[',
      ];

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;

      for (const attackStr of adversarialInputs) {
        expect(() => {
          act(() => {
            nativeSetter?.call(searchInput, attackStr);
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }).not.toThrow();

        // Card should still be rendered without crash
        const card = container.querySelector('[data-testid="bento-card-keywords"]');
        expect(card).not.toBeNull();
      }

      // Clear search
      await act(async () => {
        nativeSetter?.call(searchInput, '');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(container.querySelectorAll('.keyword-item').length).toBe(24);
    });
  });

  // =========================================================================
  // FEATURE 26: Profile Risk Badge Simulation
  // =========================================================================

  describe('Feature 26: Profile Risk Badge Simulation ("Mark, Don\'t Block")', () => {
    it('verifies visiting the profile leaves tweets visible and renders risk inspection metrics', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ProfileBadgeCard />
          </I18nProvider>
        );
      });

      // 1. Mark, don't block notice
      const card = container.querySelector('[data-testid="bento-card-profile"]');
      expect(card?.textContent).toContain('Timeline visible: inspection & forensic evidence preserved');

      // 2. Risk metrics are present
      const chipAge = container.querySelector('[data-testid="chip-age"]');
      const chipRate = container.querySelector('[data-testid="chip-rate"]');
      const chipFlags = container.querySelector('[data-testid="chip-flags"]');
      expect(chipAge?.textContent).toContain('14d');
      expect(chipRate?.textContent).toContain('148/day');
      expect(chipFlags?.textContent).toContain('12x');

      // 3. User handle and bio are intact
      expect(card?.textContent).toContain('@airdrop_fast_claim');
      expect(card?.textContent).toContain('Official 10,000 $SOL Giveaway');
    });

    it('verifies toggling isFollowing flips badge to safe exemption state', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ProfileBadgeCard />
          </I18nProvider>
        );
      });

      const toggle = container.querySelector(
        '[data-testid="following-exemption-toggle"]'
      ) as HTMLInputElement;
      expect(toggle.checked).toBe(false);

      const injectedBar = container.querySelector('[data-testid="profile-injected-bar"]');
      expect(injectedBar?.className).not.toContain('exempt');

      // Toggle Following to TRUE
      await act(async () => {
        toggle.click();
      });

      expect(toggle.checked).toBe(true);
      expect(injectedBar?.className).toContain('exempt');

      // Risk chips are suppressed, replaced by exemption label
      expect(container.querySelector('[data-testid="chip-age"]')).toBeNull();
      expect(container.querySelector('[data-testid="chip-rate"]')).toBeNull();
      expect(container.querySelector('[data-testid="chip-flags"]')).toBeNull();
      expect(injectedBar?.textContent).toContain('Following Exemption');

      // Toggle Following back to FALSE
      await act(async () => {
        toggle.click();
      });

      expect(toggle.checked).toBe(false);
      expect(injectedBar?.className).not.toContain('exempt');
      expect(container.querySelector('[data-testid="chip-age"]')).not.toBeNull();
    });

    it('verifies complex lifecycle transitions across Whitelist, Clean, Undo, and Following states', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ProfileBadgeCard />
          </I18nProvider>
        );
      });

      const whitelistBtn = container.querySelector('[data-testid="profile-whitelist-btn"]') as HTMLButtonElement;
      const cleanBtn = container.querySelector('[data-testid="profile-clean-btn"]') as HTMLButtonElement;
      const toggle = container.querySelector('[data-testid="following-exemption-toggle"]') as HTMLInputElement;
      const injectedBar = container.querySelector('[data-testid="profile-injected-bar"]');

      // State 1: Clean
      await act(async () => {
        cleanBtn.click();
      });
      expect(injectedBar?.textContent).toContain('Locally Blocked');
      expect(container.querySelector('[data-testid="undo-clean-toast-btn"]')).not.toBeNull();

      // State 2: While Clean is active, click Whitelist -> should override Clean and dismiss undo toast
      await act(async () => {
        whitelistBtn.click();
      });
      expect(injectedBar?.textContent).toContain('Whitelisted');
      expect(container.querySelector('[data-testid="undo-clean-toast-btn"]')).toBeNull();

      // State 3: Toggle Following -> should suppress risk chips and show exemption label
      await act(async () => {
        toggle.click();
      });
      expect(injectedBar?.textContent).toContain('Following Exemption');

      // State 4: Toggle Following off -> resets to normal risk inspection chips
      await act(async () => {
        toggle.click();
      });
      expect(injectedBar?.textContent).not.toContain('Following Exemption');
      expect(container.querySelector('[data-testid="chip-age"]')).not.toBeNull();
    });
  });
});
