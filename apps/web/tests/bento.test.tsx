// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_CLOUD_KEYWORDS } from '@keepxclean/shared';
import { I18nProvider } from '../src/locales';
import { BentoGrid } from '../src/components/BentoGrid/BentoGrid';
import { CloudKeywordsCard, getCategoryForRule } from '../src/components/BentoGrid/CloudKeywordsCard';
import { HonestStatusCard } from '../src/components/BentoGrid/HonestStatusCard';
import { ProfileBadgeCard } from '../src/components/BentoGrid/ProfileBadgeCard';
import { LangFilterCard } from '../src/components/BentoGrid/LangFilterCard';

describe('Feature 24: Bento Card 1 - Cloud Keywords Preview', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
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
  });

  it('categorizes all 24 DEFAULT_CLOUD_KEYWORDS correctly into 5 categories', () => {
    expect(DEFAULT_CLOUD_KEYWORDS).toHaveLength(24);

    const counts: Record<string, number> = {
      cliche: 0,
      crypto: 0,
      follow: 0,
      nsfw: 0,
      scam: 0,
    };

    for (const rule of DEFAULT_CLOUD_KEYWORDS) {
      const cat = getCategoryForRule(rule.id);
      counts[cat] = (counts[cat] || 0) + 1;
    }

    expect(counts.cliche).toBe(9);
    expect(counts.crypto).toBe(5);
    expect(counts.follow).toBe(2);
    expect(counts.nsfw).toBe(2);
    expect(counts.scam).toBe(6);
    expect(counts.cliche + counts.crypto + counts.follow + counts.nsfw + counts.scam).toBe(24);
  });

  it('renders all 24 keyword items and category tabs in CloudKeywordsCard', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <CloudKeywordsCard />
        </I18nProvider>
      );
    });

    // Initial badge shows 24 / 24
    const badge = container.querySelector('[data-testid="keywords-active-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('24 / 24');

    // Category tabs exist
    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('.keywords-tab-btn'));
    expect(tabs.length).toBe(6); // All (24), Cliche (9), Crypto (5), Follow (2), Nsfw (2), Scam (6)

    // Category filter click: Crypto (5)
    const cryptoTab = tabs.find((t) => t.textContent?.includes('(5)'));
    expect(cryptoTab).toBeDefined();

    await act(async () => {
      cryptoTab!.click();
    });

    // Should now show 5 crypto rules
    const cryptoItems = container.querySelectorAll('.keyword-item');
    expect(cryptoItems.length).toBe(5);

    // Filter by Follow (2)
    const followTab = tabs.find(
      (t) => t.textContent?.includes('(2)') && t.textContent?.toLowerCase().includes('follow')
    );
    expect(followTab).toBeDefined();

    await act(async () => {
      followTab!.click();
    });

    const followItems = container.querySelectorAll('.keyword-item');
    expect(followItems.length).toBe(2);
  });

  it('toggles rule enable state and updates active counter', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <CloudKeywordsCard />
        </I18nProvider>
      );
    });

    const badge = container.querySelector('[data-testid="keywords-active-badge"]');
    expect(badge?.textContent).toContain('24 / 24');

    // Toggle the first rule off
    const firstRule = DEFAULT_CLOUD_KEYWORDS[0];
    const item = container.querySelector(`[data-testid="keyword-item-${firstRule.id}"]`);
    const checkbox = item?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    await act(async () => {
      checkbox.click();
    });

    expect(checkbox.checked).toBe(false);
    expect(badge?.textContent).toContain('23 / 24');

    // Toggle back on
    await act(async () => {
      checkbox.click();
    });

    expect(checkbox.checked).toBe(true);
    expect(badge?.textContent).toContain('24 / 24');
  });

  it('filters keywords via search input', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <CloudKeywordsCard />
        </I18nProvider>
      );
    });

    const searchInput = container.querySelector('.keywords-search-input') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    await act(async () => {
      // Simulate input change
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeSetter?.call(searchInput, 'airdrop');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const filtered = container.querySelectorAll('.keyword-item');
    expect(filtered.length).toBeGreaterThanOrEqual(1);
  });

  it('inspects regex pattern and triggers copy to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <CloudKeywordsCard />
        </I18nProvider>
      );
    });

    const firstRule = DEFAULT_CLOUD_KEYWORDS[0];
    const inspectBtn = container.querySelector(
      `button[aria-label="Inspect ${firstRule.id}"]`
    ) as HTMLButtonElement;
    expect(inspectBtn).not.toBeNull();

    await act(async () => {
      inspectBtn.click();
    });

    const drawer = container.querySelector('[data-testid="regex-inspect-drawer"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.textContent).toContain(firstRule.id);

    // Copy pattern
    const copyBtn = container.querySelector(
      `button[aria-label*="${firstRule.id}"][aria-label*="Copy"]`
    ) as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();

    await act(async () => {
      copyBtn.click();
    });

    expect(writeTextMock).toHaveBeenCalledWith(firstRule.pattern);
  });
});

describe('Feature 25: Bento Card 2 - 4.5s Honest Feedback Demonstration', () => {
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

  it('renders 3-phase flow nodes and handles undo rollback', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <HonestStatusCard />
        </I18nProvider>
      );
    });

    // 3 step items are present
    expect(container.querySelector('[data-testid="honest-step-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="honest-step-2"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="honest-step-3"]')).not.toBeNull();

    // Undo button is active in early phase
    const undoBtn = container.querySelector('[data-testid="honest-undo-btn"]') as HTMLButtonElement;
    expect(undoBtn).not.toBeNull();
    expect(undoBtn.disabled).toBe(false);

    // Click undo
    await act(async () => {
      undoBtn.click();
    });

    // Rollback feedback is displayed
    const card = container.querySelector('[data-testid="bento-card-honest"]');
    expect(card?.textContent).toContain('Rollback completed');
    expect(undoBtn.disabled).toBe(true);

    // Replay button restores simulation
    const replayBtn = container.querySelector('[data-testid="honest-replay-btn"]') as HTMLButtonElement;
    await act(async () => {
      replayBtn.click();
    });
    expect(undoBtn.disabled).toBe(false);
  });

  it('respects prefers-reduced-motion: reduce by immediately settling without animation', async () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
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

    const timerBadge = container.querySelector('.honest-timer-badge');
    expect(timerBadge?.textContent).toBe('0.0s');
    expect(container.textContent).toContain('Completed');
  });

  it('provides accessible aria-label on the progressbar element', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <HonestStatusCard />
        </I18nProvider>
      );
    });

    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar).not.toBeNull();
    expect(progressbar?.getAttribute('aria-label')).toBeTruthy();
    expect(progressbar?.getAttribute('aria-label')).toContain('4.5s Safety Undo');
  });
});

describe('Feature 26: Bento Card 3 - Profile Risk Badge Simulation', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
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
  });

  it('renders "mark, don\'t block" simulation with preserved timeline posts', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <ProfileBadgeCard />
        </I18nProvider>
      );
    });

    // Preserved tweets message
    const card = container.querySelector('[data-testid="bento-card-profile"]');
    expect(card?.textContent).toContain('Timeline visible: inspection & forensic evidence preserved');

    // Risk chips exist
    expect(container.querySelector('[data-testid="chip-age"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chip-rate"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chip-flags"]')).not.toBeNull();
  });

  it('toggles Following exemption', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <ProfileBadgeCard />
        </I18nProvider>
      );
    });

    const followingToggle = container.querySelector(
      '[data-testid="following-exemption-toggle"]'
    ) as HTMLInputElement;
    expect(followingToggle.checked).toBe(false);

    await act(async () => {
      followingToggle.click();
    });

    expect(followingToggle.checked).toBe(true);

    const bar = container.querySelector('[data-testid="profile-injected-bar"]');
    expect(bar?.className).toContain('exempt');
  });

  it('triggers 1-click Whitelist and Clean actions', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <ProfileBadgeCard />
        </I18nProvider>
      );
    });

    const whitelistBtn = container.querySelector(
      '[data-testid="profile-whitelist-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      whitelistBtn.click();
    });
    expect(container.querySelector('[data-testid="profile-injected-bar"]')?.textContent).toContain(
      'Whitelisted'
    );

    const cleanBtn = container.querySelector(
      '[data-testid="profile-clean-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      cleanBtn.click();
    });
    expect(container.querySelector('[data-testid="profile-injected-bar"]')?.textContent).toContain(
      'Locally Blocked'
    );

    // Undo clean
    const undoToastBtn = container.querySelector(
      '[data-testid="undo-clean-toast-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      undoToastBtn.click();
    });
    expect(container.querySelector('[data-testid="profile-injected-bar"]')?.textContent).not.toContain(
      'Locally Blocked'
    );
  });
});

describe('Feature 27: Bento Card 4 - Language & Media Exemption', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
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
  });

  it('switches between allow and block modes', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <LangFilterCard />
        </I18nProvider>
      );
    });

    const allowBtn = container.querySelector('[data-testid="lang-mode-allow"]') as HTMLButtonElement;
    const blockBtn = container.querySelector('[data-testid="lang-mode-block"]') as HTMLButtonElement;

    expect(allowBtn.getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      blockBtn.click();
    });
    expect(blockBtn.getAttribute('aria-checked')).toBe('true');
  });

  it('demonstrates media & universal content smart bypass', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <LangFilterCard />
        </I18nProvider>
      );
    });

    // Initially hasMedia is true -> status is bypassed
    const status = container.querySelector('[data-testid="lang-status-indicator"]');
    expect(status?.className).toContain('bypassed');
    expect(container.querySelector('[data-testid="lang-media-box"]')).not.toBeNull();

    // Toggle media off -> status becomes filtered
    const mediaToggle = container.querySelector(
      '[data-testid="media-exemption-toggle"]'
    ) as HTMLInputElement;

    await act(async () => {
      mediaToggle.click();
    });

    expect(status?.className).toContain('filtered');
    expect(container.querySelector('[data-testid="lang-media-box"]')).toBeNull();

    // Toggle media back on -> bypassed again
    await act(async () => {
      mediaToggle.click();
    });
    expect(status?.className).toContain('bypassed');
  });
});

describe('BentoGrid Master Container', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
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
  });

  it('renders all 4 cards simultaneously', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <BentoGrid />
        </I18nProvider>
      );
    });

    expect(container.querySelector('[data-testid="bento-container"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="bento-card-keywords"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="bento-card-honest"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="bento-card-profile"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="bento-card-lang"]')).not.toBeNull();
  });
});
