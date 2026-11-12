// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '../src/locales';
import { SideloadGuide } from '../src/components/SideloadGuide';
import { FaqAccordion } from '../src/components/FaqAccordion';
import { GITHUB_RELEASE_URL } from '../src/config';

describe('Feature 30 Part A: 3-Step Sideload Installation Walkthrough', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
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

  it('renders all 3 steps with release link and desktop notice', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <SideloadGuide />
        </I18nProvider>
      );
    });

    expect(container.querySelector('[data-testid="install-step-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="install-step-2"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="install-step-3"]')).not.toBeNull();

    // Download button links to GITHUB_RELEASE_URL
    const downloadBtn = container.querySelector(
      '[data-testid="download-release-btn"]'
    ) as HTMLAnchorElement;
    expect(downloadBtn.href).toBe(GITHUB_RELEASE_URL);

    // Desktop notice banner
    expect(container.querySelector('[data-testid="desktop-notice-banner"]')).not.toBeNull();
  });

  it('copies chrome://extensions when clicking step 2 chip', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <SideloadGuide />
        </I18nProvider>
      );
    });

    const copyChip = container.querySelector(
      '[data-testid="copy-chrome-extensions-chip"]'
    ) as HTMLButtonElement;
    expect(copyChip).not.toBeNull();

    await act(async () => {
      copyChip.click();
    });

    expect(writeTextMock).toHaveBeenCalledWith('chrome://extensions');
  });
});

describe('Feature 30 Part B: Collapsible FAQ Accordion', () => {
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

  it('renders all FAQ items and toggles open state with accessible attributes', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <FaqAccordion />
        </I18nProvider>
      );
    });

    // First item is open by default
    const firstTrigger = container.querySelector('[data-testid="faq-trigger-0"]') as HTMLButtonElement;
    expect(firstTrigger).not.toBeNull();
    expect(firstTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-testid="faq-answer-0"]')).not.toBeNull();

    // Second item is closed initially
    const secondTrigger = container.querySelector('[data-testid="faq-trigger-1"]') as HTMLButtonElement;
    expect(secondTrigger).not.toBeNull();
    expect(secondTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-testid="faq-answer-1"]')).toBeNull();

    // Click second trigger to open
    await act(async () => {
      secondTrigger.click();
    });
    expect(secondTrigger.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-testid="faq-answer-1"]')).not.toBeNull();

    // Click first trigger to close
    await act(async () => {
      firstTrigger.click();
    });
    expect(firstTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-testid="faq-answer-0"]')).toBeNull();
  });
});
