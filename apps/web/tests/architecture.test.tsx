// @vitest-environment jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { I18nProvider } from '../src/locales';
import { ArchitectureFlow } from '../src/components/ArchitectureFlow';

describe('Feature 28: Local-First Architecture Flow Diagram', () => {
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

  it('renders all 4 flow steps and inspector details', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <ArchitectureFlow />
        </I18nProvider>
      );
    });

    // 4 step tabs
    const step1 = container.querySelector('[data-testid="arch-step-1"]') as HTMLElement;
    const step2 = container.querySelector('[data-testid="arch-step-2"]') as HTMLElement;
    const step3 = container.querySelector('[data-testid="arch-step-3"]') as HTMLElement;
    const step4 = container.querySelector('[data-testid="arch-step-4"]') as HTMLElement;

    expect(step1).not.toBeNull();
    expect(step2).not.toBeNull();
    expect(step3).not.toBeNull();
    expect(step4).not.toBeNull();

    // Default active step is 1
    const inspector = container.querySelector('[data-testid="arch-inspector"]');
    expect(inspector?.textContent).toContain('Step 1');

    // Click step 2
    await act(async () => {
      step2.click();
    });
    expect(inspector?.textContent).toContain('Step 2');
    expect(inspector?.textContent).toContain('< 1ms (Pure CPU)');

    // Click step 3
    await act(async () => {
      step3.click();
    });
    expect(inspector?.textContent).toContain('Step 3');

    // Click step 4
    await act(async () => {
      step4.click();
    });
    expect(inspector?.textContent).toContain('Step 4');
    expect(inspector?.textContent).toContain('sha256Hex');
  });

  it('supports keyboard navigation across step nodes', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <ArchitectureFlow />
        </I18nProvider>
      );
    });

    const step2 = container.querySelector('[data-testid="arch-step-2"]') as HTMLElement;
    await act(async () => {
      step2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    const inspector = container.querySelector('[data-testid="arch-inspector"]');
    expect(inspector?.textContent).toContain('Step 2');
  });

  it('renders 3 Zero-Trust Engineering Assurances', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <ArchitectureFlow />
        </I18nProvider>
      );
    });

    expect(container.querySelector('[data-testid="arch-assurance-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="arch-assurance-2"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="arch-assurance-3"]')).not.toBeNull();
  });

  it('provides accessible tabpanel roles and controls attributes', async () => {
    await act(async () => {
      root!.render(
        <I18nProvider initialLocale="en">
          <ArchitectureFlow />
        </I18nProvider>
      );
    });

    const inspector = container.querySelector('[data-testid="arch-inspector"]');
    expect(inspector?.getAttribute('role')).toBe('tabpanel');
    expect(inspector?.getAttribute('id')).toBe('arch-inspector-panel');
    expect(inspector?.getAttribute('aria-labelledby')).toBe('arch-step-1');

    const step1 = container.querySelector('[data-testid="arch-step-1"]');
    expect(step1?.getAttribute('role')).toBe('tab');
    expect(step1?.getAttribute('aria-controls')).toBe('arch-inspector-panel');

    const step2 = container.querySelector('[data-testid="arch-step-2"]') as HTMLElement;
    await act(async () => {
      step2.click();
    });
    expect(inspector?.getAttribute('aria-labelledby')).toBe('arch-step-2');
  });
});
