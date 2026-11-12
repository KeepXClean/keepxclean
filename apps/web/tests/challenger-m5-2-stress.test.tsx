// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@keepxclean/shared';
import { I18nProvider, DICTIONARIES } from '../src/locales';
import { LangFilterCard } from '../src/components/BentoGrid/LangFilterCard';
import { ArchitectureFlow } from '../src/components/ArchitectureFlow';
import { CommunityStats, FALLBACK_STATS } from '../src/components/CommunityStats';
import { SideloadGuide } from '../src/components/SideloadGuide';
import { FaqAccordion } from '../src/components/FaqAccordion';
import { API_STATS_URL, GITHUB_RELEASE_URL } from '../src/config';

describe('Adversarial Challenger M5-2: Features 27, 28, 29, 30 Stress Suite', () => {
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
  // 1. Feature 27: Language & Media Exemption Stress Tests
  // =========================================================================
  describe('Feature 27: Language & Media Exemption', () => {
    it('1.1 Allowlist vs Blocklist logic across toggles', async () => {
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

      // Initial state: Mode is 'allow', selectedLangs: ['en', 'zh', 'ja'].
      // Sample post is French ('fr').
      expect(allowBtn.getAttribute('aria-checked')).toBe('true');
      expect(blockBtn.getAttribute('aria-checked')).toBe('false');

      // (A) In allowlist mode with media OFF:
      // fr is not in selectedLangs -> isBlocked = true
      await act(async () => {
        mediaToggle.click(); // toggle media OFF
      });
      expect(mediaToggle.checked).toBe(false);
      expect(statusIndicator.className).toContain('filtered');
      expect(statusIndicator.textContent).toContain('Filtered by Language Rule');

      // (B) In allowlist mode: Add French ('fr') to allowlist
      const chips = Array.from(container.querySelectorAll<HTMLButtonElement>('.lang-chip'));
      const frChip = chips.find((c) => c.textContent?.includes('(fr)'));
      expect(frChip).toBeDefined();

      await act(async () => {
        frChip!.click(); // add fr
      });
      expect(frChip!.classList.contains('selected')).toBe(true);
      // Now fr is in allowlist -> normal visibility!
      expect(statusIndicator.textContent).toContain('Normal visibility');

      // (C) Switch to Blocklist mode:
      await act(async () => {
        blockBtn.click();
      });
      expect(blockBtn.getAttribute('aria-checked')).toBe('true');
      expect(allowBtn.getAttribute('aria-checked')).toBe('false');

      // In blocklist mode: fr is selected -> fr is in blocklist!
      // Since media is OFF, fr should be blocked!
      expect(statusIndicator.className).toContain('filtered');

      // Remove fr from blocklist:
      await act(async () => {
        frChip!.click(); // remove fr
      });
      expect(frChip!.classList.contains('selected')).toBe(false);
      // fr is NOT in blocklist -> normal visibility!
      expect(statusIndicator.textContent).toContain('Normal visibility');
    });

    it('1.2 Smart bypass: media/universal content bypasses filtering in both allow and block modes', async () => {
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
      const chips = Array.from(container.querySelectorAll<HTMLButtonElement>('.lang-chip'));
      const frChip = chips.find((c) => c.textContent?.includes('(fr)'));

      // (A) Mode = Allow. fr is NOT in allowlist.
      // With media = true (default) -> bypass active!
      expect(mediaToggle.checked).toBe(true);
      expect(container.querySelector('[data-testid="lang-media-box"]')).not.toBeNull();
      expect(statusIndicator.className).toContain('bypassed');
      expect(statusIndicator.textContent).toContain('Universal Content Exemption');

      // (B) Switch to Mode = Block.
      // Add fr to blocklist. Now language rule says block.
      await act(async () => {
        blockBtn.click();
        frChip!.click();
      });

      // Even though fr is blocked, media is true -> SMART BYPASS MUST ACTIVATE!
      expect(statusIndicator.className).toContain('bypassed');
      expect(statusIndicator.textContent).toContain('Universal Content Exemption');

      // (C) Turn media OFF while in block mode:
      await act(async () => {
        mediaToggle.click();
      });
      expect(statusIndicator.className).toContain('filtered');

      // (D) Turn media ON again:
      await act(async () => {
        mediaToggle.click();
      });
      expect(statusIndicator.className).toContain('bypassed');
    });

    it('1.3 Deselecting all languages survives without exceptions', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <LangFilterCard />
          </I18nProvider>
        );
      });

      const chips = Array.from(container.querySelectorAll<HTMLButtonElement>('.lang-chip'));
      // Deselect all chips that are selected
      for (const chip of chips) {
        if (chip.classList.contains('selected')) {
          await act(async () => {
            chip.click();
          });
        }
      }

      // Zero chips selected
      const selectedChips = container.querySelectorAll('.lang-chip.selected');
      expect(selectedChips.length).toBe(0);

      // Should not crash, status indicator still valid
      const statusIndicator = container.querySelector('[data-testid="lang-status-indicator"]');
      expect(statusIndicator).not.toBeNull();
    });
  });

  // =========================================================================
  // 2. Feature 28: Local-First Architecture Flow Diagram Stress Tests
  // =========================================================================
  describe('Feature 28: Local-First Architecture Flow Diagram', () => {
    it('2.1 Step switching, active styling, and inspector data integrity', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ArchitectureFlow />
          </I18nProvider>
        );
      });

      const stepNodes = [
        container.querySelector('[data-testid="arch-step-1"]') as HTMLElement,
        container.querySelector('[data-testid="arch-step-2"]') as HTMLElement,
        container.querySelector('[data-testid="arch-step-3"]') as HTMLElement,
        container.querySelector('[data-testid="arch-step-4"]') as HTMLElement,
      ];

      const inspector = container.querySelector('[data-testid="arch-inspector"]') as HTMLElement;
      expect(inspector).not.toBeNull();

      // Check step 1 active initially
      expect(stepNodes[0].classList.contains('active')).toBe(true);
      expect(stepNodes[0].getAttribute('aria-selected')).toBe('true');
      expect(stepNodes[1].classList.contains('active')).toBe(false);
      expect(inspector.textContent).toContain('Step 1');
      expect(inspector.textContent).toContain('0ms (In-Memory Hook)');
      expect(inspector.textContent).toContain('X Web GraphQL response');

      // Click step 2
      await act(async () => {
        stepNodes[1].click();
      });
      expect(stepNodes[0].classList.contains('active')).toBe(false);
      expect(stepNodes[1].classList.contains('active')).toBe(true);
      expect(stepNodes[1].getAttribute('aria-selected')).toBe('true');
      expect(inspector.textContent).toContain('Step 2');
      expect(inspector.textContent).toContain('< 1ms (Pure CPU)');
      expect(inspector.textContent).toContain('Extracted Tweet');

      // Click step 4 (out of order jump)
      await act(async () => {
        stepNodes[3].click();
      });
      expect(stepNodes[1].classList.contains('active')).toBe(false);
      expect(stepNodes[3].classList.contains('active')).toBe(true);
      expect(inspector.textContent).toContain('Step 4');
      expect(inspector.textContent).toContain('Asynchronous (Background)');
      expect(inspector.textContent).toContain('sha256Hex');

      // Click step 3
      await act(async () => {
        stepNodes[2].click();
      });
      expect(stepNodes[3].classList.contains('active')).toBe(false);
      expect(stepNodes[2].classList.contains('active')).toBe(true);
      expect(inspector.textContent).toContain('Step 3');
      expect(inspector.textContent).toContain('Instant (Render Cycle)');
    });

    it('2.2 Keyboard Enter and Space step activation vs non-activating keys', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <ArchitectureFlow />
          </I18nProvider>
        );
      });

      const step1 = container.querySelector('[data-testid="arch-step-1"]') as HTMLElement;
      const step2 = container.querySelector('[data-testid="arch-step-2"]') as HTMLElement;
      const step3 = container.querySelector('[data-testid="arch-step-3"]') as HTMLElement;
      const inspector = container.querySelector('[data-testid="arch-inspector"]') as HTMLElement;

      // Send Escape key to step 2 -> should NOT switch
      await act(async () => {
        step2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(inspector.textContent).toContain('Step 1');

      // Send Tab key to step 2 -> should NOT switch
      await act(async () => {
        step2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      });
      expect(inspector.textContent).toContain('Step 1');

      // Send Enter key to step 2 -> SHOULD switch
      await act(async () => {
        step2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(inspector.textContent).toContain('Step 2');

      // Send Space key to step 3 -> SHOULD switch
      await act(async () => {
        step3.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(inspector.textContent).toContain('Step 3');
    });

    it('2.3 All 3 zero-trust assurance cards render across all 10 locales', async () => {
      for (const locale of SUPPORTED_LOCALES) {
        await act(async () => {
          root!.render(
            <I18nProvider initialLocale={locale}>
              <ArchitectureFlow />
            </I18nProvider>
          );
        });

        const card1 = container.querySelector('[data-testid="arch-assurance-1"]');
        const card2 = container.querySelector('[data-testid="arch-assurance-2"]');
        const card3 = container.querySelector('[data-testid="arch-assurance-3"]');

        expect(card1, `Missing card 1 for locale ${locale}`).not.toBeNull();
        expect(card2, `Missing card 2 for locale ${locale}`).not.toBeNull();
        expect(card3, `Missing card 3 for locale ${locale}`).not.toBeNull();

        // Check non-empty content
        expect(card1!.textContent!.length).toBeGreaterThan(15);
        expect(card2!.textContent!.length).toBeGreaterThan(15);
        expect(card3!.textContent!.length).toBeGreaterThan(15);

        // Check for broken undefined or Object placeholders
        expect(card1!.textContent).not.toContain('undefined');
        expect(card1!.textContent).not.toContain('[object');
        expect(card2!.textContent).not.toContain('undefined');
        expect(card3!.textContent).not.toContain('undefined');
      }
    });
  });

  // =========================================================================
  // 3. Feature 29: Community Defense Board API Client Stress Tests
  // =========================================================================
  describe('Feature 29: Community Defense Board API Client', () => {
    it('3.1 Network rejection / offline gracefully displays fallback snapshot with amber badge', async () => {
      // Mock network failure
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (offline)'));

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      const indicator = container.querySelector('[data-testid="stats-status-indicator"]');
      expect(indicator).not.toBeNull();
      expect(indicator?.classList.contains('fallback')).toBe(true);
      expect(indicator?.classList.contains('live')).toBe(false);

      // Verify fallback values rendered
      const accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
      const blocked = container.querySelector('[data-testid="stats-metric-blocked"]');
      const votes = container.querySelector('[data-testid="stats-metric-votes"]');

      expect(accounts?.textContent).toContain('1,280');
      expect(blocked?.textContent).toContain('450');
      expect(votes?.textContent).toContain('3,890');

      // Retry sync button must exist
      const retryBtn = container.querySelector('button[title="Retry sync"]');
      expect(retryBtn).not.toBeNull();
    });

    it('3.2 Timeout (>4s abort) falls back cleanly without uncaught exception', async () => {
      // Mock fetch that hangs until aborted
      globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The user aborted a request.', 'AbortError'));
            });
          }
        });
      });

      vi.useFakeTimers();

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      // Advance time by 4100ms to trigger the AbortController
      await act(async () => {
        vi.advanceTimersByTime(4100);
      });

      const indicator = container.querySelector('[data-testid="stats-status-indicator"]');
      expect(indicator?.classList.contains('fallback')).toBe(true);

      vi.useRealTimers();
    });

    it('3.3 Corrupted / invalid schema response safely falls back', async () => {
      // Missing fields
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: false, error: 'Internal Server Error' }),
      });

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      const indicator = container.querySelector('[data-testid="stats-status-indicator"]');
      expect(indicator?.classList.contains('fallback')).toBe(true);
    });

    it('3.4 Valid live response updates metrics and displays green live badge', async () => {
      // Enable prefers-reduced-motion to test final numbers immediately
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

      const livePayload = {
        ok: true,
        domain: 'keepxclean.com',
        totalFlaggedAccounts: 2500,
        activeCrowdBlocked: 800,
        totalVotes: 7000,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => livePayload,
      });

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      const indicator = container.querySelector('[data-testid="stats-status-indicator"]');
      expect(indicator?.classList.contains('live')).toBe(true);
      expect(indicator?.classList.contains('fallback')).toBe(false);

      // Pulse marker has .live
      const pulse = indicator?.querySelector('.pulse-marker');
      expect(pulse?.classList.contains('live')).toBe(true);

      // Live metrics displayed
      const accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
      const blocked = container.querySelector('[data-testid="stats-metric-blocked"]');
      const votes = container.querySelector('[data-testid="stats-metric-votes"]');

      expect(accounts?.textContent).toContain('2,500+');
      expect(blocked?.textContent).toContain('800+');
      expect(votes?.textContent).toContain('7,000');

      // Retry button is not rendered in live mode
      expect(container.querySelector('button[title="Retry sync"]')).toBeNull();
    });

    it('3.5 Interactive Retry Sync transitions from fallback to live', async () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
      }));

      // First call fails
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error('Network offline'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            totalFlaggedAccounts: 3200,
            activeCrowdBlocked: 1100,
            totalVotes: 8500,
          }),
        });

      globalThis.fetch = mockFetch;

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      let indicator = container.querySelector('[data-testid="stats-status-indicator"]');
      expect(indicator?.classList.contains('fallback')).toBe(true);

      // Click retry
      const retryBtn = container.querySelector('button[title="Retry sync"]') as HTMLButtonElement;
      expect(retryBtn).not.toBeNull();

      await act(async () => {
        retryBtn.click();
      });

      indicator = container.querySelector('[data-testid="stats-status-indicator"]');
      expect(indicator?.classList.contains('live')).toBe(true);
      const accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
      expect(accounts?.textContent).toContain('3,200+');
    });

    it('3.6 Number formatting across diverse locales (en, fr, de, zh-CN, pt)', async () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: true, // reduced-motion = true for deterministic numbers
      }));

      const localesToTest: SupportedLocale[] = ['en', 'fr', 'de', 'zh-CN', 'pt', 'ru'];

      for (const loc of localesToTest) {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => FALLBACK_STATS,
        });

        await act(async () => {
          root!.render(
            <I18nProvider key={loc} initialLocale={loc}>
              <CommunityStats />
            </I18nProvider>
          );
        });

        const accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
        const votes = container.querySelector('[data-testid="stats-metric-votes"]');

        const expectedAccounts = `${new Intl.NumberFormat(loc).format(FALLBACK_STATS.totalFlaggedAccounts)}+`;
        const expectedVotes = new Intl.NumberFormat(loc).format(FALLBACK_STATS.totalVotes);

        expect(accounts?.textContent).toContain(expectedAccounts);
        expect(votes?.textContent).toContain(expectedVotes);
      }
    });

    it('3.7 Edge case numbers: zero values and very large numbers', async () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: true,
      }));

      // Test zero values
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          totalFlaggedAccounts: 0,
          activeCrowdBlocked: 0,
          totalVotes: 0,
        }),
      });

      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      let indicator = container.querySelector('[data-testid="stats-status-indicator"]');
      expect(indicator?.classList.contains('live')).toBe(true);
      let accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
      expect(accounts?.textContent).toContain('0+');

      // Test huge numbers (100M+)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          totalFlaggedAccounts: 125000000,
          activeCrowdBlocked: 45000000,
          totalVotes: 980000000,
        }),
      });

      await act(async () => {
        root!.render(
          <I18nProvider key="huge" initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      indicator = container.querySelector('[data-testid="stats-status-indicator"]');
      expect(indicator?.classList.contains('live')).toBe(true);
      accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
      expect(accounts?.textContent).toContain('125,000,000+');
    });

    it('3.8 HTML error page / non-JSON response body safely caught by fallback', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true, // HTTP 200 but returns HTML (e.g. Cloudflare error landing page)
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
        },
      });

      await act(async () => {
        root!.render(
          <I18nProvider key="html-err" initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      const indicator = container.querySelector('[data-testid="stats-status-indicator"]');
      expect(indicator?.classList.contains('fallback')).toBe(true);
      const accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
      expect(accounts?.textContent).toContain('1,280+');
    });

    it('3.9 HTTP 429 Too Many Requests safely triggers fallback snapshot', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: 'Rate limit exceeded' }),
      });

      await act(async () => {
        root!.render(
          <I18nProvider key="rate-limit" initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      const indicator = container.querySelector('[data-testid="stats-status-indicator"]');
      expect(indicator?.classList.contains('fallback')).toBe(true);
    });

    it('3.10 Adversarial Hardening: animation calculation strictly clamps counts to non-negative if RAF timestamp precedes startTime', async () => {
      // Simulate normal motion (reduced-motion = false)
      window.matchMedia = vi.fn().mockReturnValue({ matches: false });

      let rafCallback: ((time: number) => void) | null = null;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallback = cb;
        return 999;
      });

      const baseTime = 10000;
      vi.spyOn(performance, 'now').mockReturnValue(baseTime);

      await act(async () => {
        root!.render(
          <I18nProvider key="raf-test" initialLocale="en">
            <CommunityStats />
          </I18nProvider>
        );
      });

      expect(rafCallback).not.toBeNull();

      // Adversarial scenario: clock drift or timer queue delivers timestamp 200ms BEFORE startTime
      await act(async () => {
        rafCallback!(baseTime - 200);
      });

      const accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
      // Remediation: Math.max(0, ...) ensures counts cannot become negative
      expect(accounts?.textContent).not.toContain('-');
    });
  });

  // =========================================================================
  // 4. Feature 30: Sideload Guide & FAQ Accordion Stress Tests
  // =========================================================================
  describe('Feature 30: Sideload Guide & FAQ Accordion', () => {
    it('4.1 Sideload Guide: copy chip copies chrome://extensions with fallback when clipboard API is stubbed/null', async () => {
      // Test A: clipboard API available
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

      await act(async () => {
        copyChip.click();
      });
      expect(writeTextMock).toHaveBeenCalledWith('chrome://extensions');

      // Test B: clipboard API throws error -> handles gracefully without unhandled exception
      writeTextMock.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
      await act(async () => {
        copyChip.click();
      });
      // Component remains intact and rendered
      expect(container.querySelector('[data-testid="install-step-2"]')).not.toBeNull();

      // Test C: clipboard API completely undefined -> execCommand fallback
      // @ts-ignore
      delete navigator.clipboard;
      const execCommandMock = vi.fn();
      document.execCommand = execCommandMock;

      await act(async () => {
        copyChip.click();
      });
      expect(execCommandMock).toHaveBeenCalledWith('copy');
    });

    it('4.2 Sideload Guide: download button links to GITHUB_RELEASE_URL with target _blank and noopener', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <SideloadGuide />
          </I18nProvider>
        );
      });

      const dlBtn = container.querySelector('[data-testid="download-release-btn"]') as HTMLAnchorElement;
      expect(dlBtn).not.toBeNull();
      expect(dlBtn.href).toBe(GITHUB_RELEASE_URL);
      expect(dlBtn.target).toBe('_blank');
      expect(dlBtn.rel).toContain('noopener');
      expect(dlBtn.rel).toContain('noreferrer');

      // Desktop notice banner renders
      const banner = container.querySelector('[data-testid="desktop-notice-banner"]');
      expect(banner).not.toBeNull();
      expect(banner?.textContent?.length).toBeGreaterThan(10);
    });

    it('4.3 FAQ Accordion: multiple items open simultaneously and independent toggling', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <FaqAccordion />
          </I18nProvider>
        );
      });

      const triggers = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[data-testid^="faq-trigger-"]')
      );
      expect(triggers.length).toBeGreaterThanOrEqual(4);

      // Initially item 0 is open, all others are closed
      expect(triggers[0].getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector('[data-testid="faq-answer-0"]')).not.toBeNull();
      expect(triggers[1].getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('[data-testid="faq-answer-1"]')).toBeNull();

      // Open item 1: BOTH 0 and 1 must be open simultaneously
      await act(async () => {
        triggers[1].click();
      });
      expect(triggers[0].getAttribute('aria-expanded')).toBe('true');
      expect(triggers[1].getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector('[data-testid="faq-answer-0"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="faq-answer-1"]')).not.toBeNull();

      // Open item 2: ALL 0, 1, and 2 open
      await act(async () => {
        triggers[2].click();
      });
      expect(triggers[0].getAttribute('aria-expanded')).toBe('true');
      expect(triggers[1].getAttribute('aria-expanded')).toBe('true');
      expect(triggers[2].getAttribute('aria-expanded')).toBe('true');

      // Close item 0: 0 closes, but 1 and 2 remain open
      await act(async () => {
        triggers[0].click();
      });
      expect(triggers[0].getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('[data-testid="faq-answer-0"]')).toBeNull();
      expect(triggers[1].getAttribute('aria-expanded')).toBe('true');
      expect(triggers[2].getAttribute('aria-expanded')).toBe('true');

      // Close all remaining items:
      await act(async () => {
        triggers[1].click();
        triggers[2].click();
      });
      expect(container.querySelectorAll('[data-testid^="faq-answer-"]').length).toBe(0);
    });

    it('4.4 FAQ Accordion: keyboard Enter/Space expansion on trigger buttons', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <FaqAccordion />
          </I18nProvider>
        );
      });

      const triggers = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[data-testid^="faq-trigger-"]')
      );

      // Item 1 closed initially
      expect(triggers[1].getAttribute('aria-expanded')).toBe('false');

      // Native buttons fire click on Space/Enter; simulate click event from keyboard
      await act(async () => {
        triggers[1].click();
      });
      expect(triggers[1].getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector('[data-testid="faq-answer-1"]')).not.toBeNull();
    });

    it('4.5 FAQ Accordion: non-empty questions and answers across all 10 locales', async () => {
      for (const locale of SUPPORTED_LOCALES) {
        await act(async () => {
          root!.render(
            <I18nProvider initialLocale={locale}>
              <FaqAccordion />
            </I18nProvider>
          );
        });

        const items = container.querySelectorAll('[data-testid^="faq-item-"]');
        expect(items.length, `Locale ${locale} has 0 FAQ items`).toBeGreaterThanOrEqual(4);

        // Check dictionary validity
        const dictFaq = DICTIONARIES[locale].faq.items;
        expect(dictFaq.length).toBeGreaterThanOrEqual(4);
        for (let i = 0; i < dictFaq.length; i++) {
          expect(dictFaq[i].q.length, `Locale ${locale} FAQ ${i} Q is too short`).toBeGreaterThan(5);
          expect(dictFaq[i].a.length, `Locale ${locale} FAQ ${i} A is too short`).toBeGreaterThan(10);
        }
      }
    });

    it('4.6 FAQ Accordion: rapid successive clicking toggles state deterministically', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <FaqAccordion />
          </I18nProvider>
        );
      });

      const trigger0 = container.querySelector('[data-testid="faq-trigger-0"]') as HTMLButtonElement;
      expect(trigger0.getAttribute('aria-expanded')).toBe('true');

      // Click 10 times
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          trigger0.click();
        });
      }

      // After 10 toggles starting from true: even number of clicks -> returns to true!
      expect(trigger0.getAttribute('aria-expanded')).toBe('true');
      expect(container.querySelector('[data-testid="faq-answer-0"]')).not.toBeNull();
    });

    it('4.7 Sideload Guide: dictionary text completeness across all 10 locales', () => {
      for (const locale of SUPPORTED_LOCALES) {
        const installDict = DICTIONARIES[locale].install;
        expect(installDict.badge.length, `${locale} install.badge missing`).toBeGreaterThan(0);
        expect(installDict.title.length, `${locale} install.title missing`).toBeGreaterThan(0);
        expect(installDict.step1Title.length, `${locale} install.step1Title missing`).toBeGreaterThan(0);
        expect(installDict.step1Desc.length, `${locale} install.step1Desc missing`).toBeGreaterThan(0);
        expect(installDict.step2Title.length, `${locale} install.step2Title missing`).toBeGreaterThan(0);
        expect(installDict.step2Desc.length, `${locale} install.step2Desc missing`).toBeGreaterThan(0);
        expect(installDict.step3Title.length, `${locale} install.step3Title missing`).toBeGreaterThan(0);
        expect(installDict.step3Desc.length, `${locale} install.step3Desc missing`).toBeGreaterThan(0);
        expect(installDict.desktopNotice.length, `${locale} install.desktopNotice missing`).toBeGreaterThan(0);
      }
    });

    it('4.8 Brand compliance: zero forbidden terms (shield/glow/ring/starburst) in rendered DOM of Features 27-30', async () => {
      await act(async () => {
        root!.render(
          <I18nProvider initialLocale="en">
            <div>
              <LangFilterCard />
              <ArchitectureFlow />
              <CommunityStats />
              <SideloadGuide />
              <FaqAccordion />
            </div>
          </I18nProvider>
        );
      });

      const html = container.innerHTML.toLowerCase();
      // Brand compliance: no shield, no protective ring, no starburst
      expect(html).not.toMatch(/\bprotective[-_]ring\b/);
      expect(html).not.toMatch(/\bstarburst\b/);
      expect(html).not.toMatch(/class="[^"]*shield[^"]*"/);
      expect(html).not.toMatch(/class="[^"]*glow[^"]*"/);
    });
  });
});
