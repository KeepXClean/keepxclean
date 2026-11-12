// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '../src/locales';
import { CommunityStats, FALLBACK_STATS } from '../src/components/CommunityStats';

describe('Feature 29: Real-time Community Defense Board', () => {
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

  it('fetches live stats and displays synchronized status', async () => {
    const mockData = {
      ok: true,
      domain: 'keepxclean.com',
      totalFlaggedAccounts: 2500,
      activeCrowdBlocked: 800,
      totalVotes: 6400,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <CommunityStats />
        </I18nProvider>
      );
    });

    const statusIndicator = container.querySelector('[data-testid="stats-status-indicator"]');
    expect(statusIndicator?.className).toContain('live');
    expect(container.querySelector('[data-testid="stats-metric-accounts"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="stats-metric-blocked"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="stats-metric-votes"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="stats-metric-languages"]')).not.toBeNull();
  });

  it('falls back gracefully to fixture when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error / offline'));

    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <CommunityStats />
        </I18nProvider>
      );
    });

    const statusIndicator = container.querySelector('[data-testid="stats-status-indicator"]');
    expect(statusIndicator?.className).toContain('fallback');

    // Numbers display fallback values
    const accounts = container.querySelector('[data-testid="stats-metric-accounts"]');
    expect(accounts?.textContent).toContain('1,280');
  });

  it('formats numbers using Intl.NumberFormat according to active locale', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FALLBACK_STATS,
    });

    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <CommunityStats />
        </I18nProvider>
      );
    });

    const votes = container.querySelector('[data-testid="stats-metric-votes"]');
    expect(votes?.textContent).toContain('3,890');
  });

  it('provides accessible role="status" and aria-live="polite" on the status pill', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FALLBACK_STATS,
    });

    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <CommunityStats />
        </I18nProvider>
      );
    });

    const indicator = container.querySelector('[data-testid="stats-status-indicator"]');
    expect(indicator?.getAttribute('role')).toBe('status');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');
  });
});
