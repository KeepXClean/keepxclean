// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, useI18n, getDictionary } from '../src/locales';

// Enable React act() environment in jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Feature 22: Dynamic HTML Lang & DOM Meta Synchronization', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    document.title = 'Default Title';
    document.documentElement.lang = 'en';

    // Remove any existing description meta tag
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.remove();
    }
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = '';
  });

  it('updates <html lang>, document.title, and <meta name="description"> on mount with default locale', async () => {
    let capturedLocale: string = '';

    function Consumer() {
      const { locale } = useI18n();
      capturedLocale = locale;
      return <div>Locale: {locale}</div>;
    }

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider initialLocale="en" syncDomMeta={true}>
          <Consumer />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    const enDict = getDictionary('en');
    expect(capturedLocale).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe(enDict.meta.title);

    const meta = document.querySelector('meta[name="description"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute('content')).toBe(enDict.meta.description);

    await act(async () => {
      root.unmount();
    });
  });

  it('dynamically synchronizes DOM meta when locale changes via setLocale without reload', async () => {
    let setLocaleFn: (l: any) => void = () => {};

    function Consumer() {
      const { locale, setLocale } = useI18n();
      setLocaleFn = setLocale;
      return <div>Current: {locale}</div>;
    }

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider initialLocale="en" syncDomMeta={true}>
          <Consumer />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    // Initial check (en)
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe(getDictionary('en').meta.title);

    // Switch to zh-CN
    await act(async () => {
      setLocaleFn('zh-CN');
      await Promise.resolve();
    });

    const zhDict = getDictionary('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.title).toBe(zhDict.meta.title);

    let meta = document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')).toBe(zhDict.meta.description);

    // Switch to ja
    await act(async () => {
      setLocaleFn('ja');
      await Promise.resolve();
    });

    const jaDict = getDictionary('ja');
    expect(document.documentElement.lang).toBe('ja');
    expect(document.title).toBe(jaDict.meta.title);

    meta = document.querySelector('meta[name="description"]');
    expect(meta?.getAttribute('content')).toBe(jaDict.meta.description);

    await act(async () => {
      root.unmount();
    });
  });

  it('respects syncDomMeta=false by preserving existing title and meta (for privacy page)', async () => {
    document.title = 'Bilingual Privacy Policy — KeepXClean';
    document.documentElement.lang = 'en';

    function Consumer() {
      const { locale } = useI18n();
      return <div>Privacy: {locale}</div>;
    }

    const root = createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider initialLocale="ja" syncDomMeta={false}>
          <Consumer />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    // document.title should NOT be replaced by the Japanese home title
    expect(document.title).toBe('Bilingual Privacy Policy — KeepXClean');

    await act(async () => {
      root.unmount();
    });
  });

  it('useI18n provides safe fallback outside Provider without throwing', async () => {
    function FallbackConsumer() {
      const { locale, t, availableLocales } = useI18n();
      return (
        <div>
          {locale} - {availableLocales.length} - {t.nav.downloadCta}
        </div>
      );
    }

    const root = createRoot(container);
    await act(async () => {
      root.render(<FallbackConsumer />);
      await Promise.resolve();
    });

    await act(async () => {
      root.unmount();
    });
  });
});
