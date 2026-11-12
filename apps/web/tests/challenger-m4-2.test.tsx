// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@keepxclean/shared';
import {
  DICTIONARIES,
  getDictionary,
  en,
  zhCN,
  zhTW,
  ja,
  ko,
  es,
  pt,
  fr,
  de,
  ru,
  I18nProvider,
  useI18n,
  useCta,
  resolveSiteLocale,
  matchLocaleCandidate,
} from '../src/locales';
import {
  CWS_EXTENSION_ID,
  CWS_LIVE,
  CWS_STORE_URL,
  GITHUB_RELEASE_URL,
  GITHUB_REPO_URL,
  getActiveCtaConfig,
} from '../src/config';
import { Header } from '../src/components/Header';

// Enable React act() environment in jsdom
// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Helper to recursively extract all key-value leaves from a translation dictionary
 */
function extractLeafNodes(obj: any, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(val)) {
      val.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(result, extractLeafNodes(item, `${fullPath}[${index}]`));
        } else {
          result[`${fullPath}[${index}]`] = String(item);
        }
      });
    } else if (typeof val === 'object' && val !== null) {
      Object.assign(result, extractLeafNodes(val, fullPath));
    } else {
      result[fullPath] = String(val);
    }
  }
  return result;
}

describe('M4 Challenger 2: Exhaustive Dictionary Parity & Completeness (Feature 20)', () => {
  const referenceLeaves = extractLeafNodes(en);
  const referenceKeys = Object.keys(referenceLeaves).sort();

  it('all 10 supported locales exist in DICTIONARIES map and individual exports', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(10);
    expect(SUPPORTED_LOCALES).toEqual([
      'en',
      'zh-CN',
      'zh-TW',
      'ja',
      'ko',
      'es',
      'pt',
      'fr',
      'de',
      'ru',
    ]);

    expect(DICTIONARIES.en).toBe(en);
    expect(DICTIONARIES['zh-CN']).toBe(zhCN);
    expect(DICTIONARIES['zh-TW']).toBe(zhTW);
    expect(DICTIONARIES.ja).toBe(ja);
    expect(DICTIONARIES.ko).toBe(ko);
    expect(DICTIONARIES.es).toBe(es);
    expect(DICTIONARIES.pt).toBe(pt);
    expect(DICTIONARIES.fr).toBe(fr);
    expect(DICTIONARIES.de).toBe(de);
    expect(DICTIONARIES.ru).toBe(ru);
  });

  it('verifies 100% key parity with reference dictionary "en" across all 10 locales', () => {
    expect(referenceKeys.length).toBeGreaterThanOrEqual(200);

    for (const locale of SUPPORTED_LOCALES) {
      const dict = DICTIONARIES[locale];
      expect(dict, `Dictionary for locale ${locale} must be defined`).toBeDefined();
      expect(dict.locale).toBe(locale);

      const dictLeaves = extractLeafNodes(dict);
      const dictKeys = Object.keys(dictLeaves).sort();

      // Check missing keys
      const missingKeys = referenceKeys.filter((k) => !dictKeys.includes(k));
      expect(
        missingKeys,
        `Locale '${locale}' is missing keys: ${missingKeys.join(', ')}`
      ).toEqual([]);

      // Check unexpected extra keys
      const extraKeys = dictKeys.filter((k) => !referenceKeys.includes(k));
      expect(
        extraKeys,
        `Locale '${locale}' has unexpected extra keys: ${extraKeys.join(', ')}`
      ).toEqual([]);

      // Total leaf count parity
      expect(dictKeys.length).toBe(referenceKeys.length);
    }
  });

  it('asserts zero undefined, zero null, and zero empty strings across all 10 locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const dict = DICTIONARIES[locale];
      const leaves = extractLeafNodes(dict);

      for (const [keyPath, value] of Object.entries(leaves)) {
        // Assert not undefined or null
        expect(
          value,
          `Key '${keyPath}' in locale '${locale}' must not be undefined or null`
        ).toBeDefined();

        // Assert not empty or whitespace only
        expect(
          value.trim().length,
          `Key '${keyPath}' in locale '${locale}' must not be empty or whitespace only`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('asserts zero placeholder strings (TODO, TBD, dummy, mock, FIXME) across all 10 locales', () => {
    // Prohibited placeholders: TODO, TBD, FIXME, dummy, mock, lorem ipsum, WIP, [object Object]
    // Note: In Spanish and Portuguese, "Todo" / "todo" means "All/Every" (e.g. "Todo el código"),
    // which is valid natural language, so we match uppercase TODO or placeholder phrases.
    const placeholderRegex = /\b(TODO|TBD|FIXME|dummy|mock|lorem ipsum|WIP|TEMP)\b/;

    for (const locale of SUPPORTED_LOCALES) {
      const dict = DICTIONARIES[locale];
      const leaves = extractLeafNodes(dict);

      for (const [keyPath, value] of Object.entries(leaves)) {
        // Check for placeholder tokens
        const match = placeholderRegex.exec(value);
        if (match) {
          // If match is "TODO", verify it is not the Spanish/Portuguese word "Todo"
          const isSpanishOrPtNaturalWord =
            (locale === 'es' || locale === 'pt') &&
            match[0] === 'Todo' &&
            /\bTodo (el|o|lo)\b/i.test(value);

          expect(
            isSpanishOrPtNaturalWord,
            `Locale '${locale}' at '${keyPath}' contains placeholder '${match[0]}': "${value}"`
          ).toBe(true);
        }

        // Check for literal "undefined", "null", or "[object Object]"
        expect(
          value.includes('undefined'),
          `Locale '${locale}' at '${keyPath}' contains literal 'undefined'`
        ).toBe(false);
        expect(
          value.includes('[object Object]'),
          `Locale '${locale}' at '${keyPath}' contains literal '[object Object]'`
        ).toBe(false);
      }
    }
  });

  it('verifies every locale has at least 6 detailed FAQ items with non-empty Q and A fields', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const dict = DICTIONARIES[locale];
      expect(
        dict.faq.items.length,
        `Locale '${locale}' must have at least 6 FAQ items`
      ).toBeGreaterThanOrEqual(6);

      dict.faq.items.forEach((faqItem, idx) => {
        expect(
          faqItem.q.trim().length,
          `Locale '${locale}' FAQ item ${idx + 1} question is too short: "${faqItem.q}"`
        ).toBeGreaterThanOrEqual(10);

        expect(
          faqItem.a.trim().length,
          `Locale '${locale}' FAQ item ${idx + 1} answer is too short: "${faqItem.a}"`
        ).toBeGreaterThanOrEqual(25);
      });
    }
  });

  it('verifies all 10 locales include the official Chrome Web Store ID in FAQ item 3', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const dict = DICTIONARIES[locale];
      const faqItem3 = dict.faq.items[2];
      expect(
        faqItem3.a,
        `Locale '${locale}' FAQ item 3 must reference CWS ID '${CWS_EXTENSION_ID}'`
      ).toContain(CWS_EXTENSION_ID);
    }
  });

  it('verifies authentic non-affiliation legal disclaimer in all 10 locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const disclaimer = DICTIONARIES[locale].footer.disclaimer;
      expect(
        disclaimer.length,
        `Locale '${locale}' disclaimer is too short: "${disclaimer}"`
      ).toBeGreaterThanOrEqual(30);

      // Must explicitly mention both "X" and "Twitter"
      expect(
        disclaimer,
        `Locale '${locale}' disclaimer must mention 'X'`
      ).toContain('X');
      expect(
        disclaimer,
        `Locale '${locale}' disclaimer must mention 'Twitter'`
      ).toContain('Twitter');

      // Check locale-specific authentic disclaimer phrases
      switch (locale) {
        case 'en':
          expect(disclaimer).toContain('independent open-source project');
          expect(disclaimer).toContain('not affiliated with');
          break;
        case 'zh-CN':
          expect(disclaimer).toContain('独立开源项目');
          expect(disclaimer).toContain('无任何隶属');
          break;
        case 'zh-TW':
          expect(disclaimer).toContain('獨立開源專案');
          expect(disclaimer).toContain('無任何隸屬');
          break;
        case 'ja':
          expect(disclaimer).toContain('独立したオープンソースプロジェクト');
          expect(disclaimer).toContain('提携');
          break;
        case 'ko':
          expect(disclaimer).toContain('독립적인 오픈 소스 프로젝트');
          expect(disclaimer).toContain('제휴');
          break;
        case 'es':
          expect(disclaimer).toContain('proyecto independiente de código abierto');
          expect(disclaimer).toContain('no está afiliado');
          break;
        case 'pt':
          expect(disclaimer).toContain('projeto de código aberto independente');
          expect(disclaimer).toContain('não possui vínculo');
          break;
        case 'fr':
          expect(disclaimer).toContain('projet open source indépendant');
          expect(disclaimer).toContain('ni affilié');
          break;
        case 'de':
          expect(disclaimer).toContain('unabhängiges Open-Source-Projekt');
          expect(disclaimer).toContain('keiner Verbindung');
          break;
        case 'ru':
          expect(disclaimer).toContain('независимый проект с открытым исходным кодом');
          expect(disclaimer).toContain('не связанный');
          break;
      }
    }
  });
});

describe('M4 Challenger 2: Feature 23 Config & CTA Behavior Stress-Test', () => {
  it('CWS_EXTENSION_ID matches official ID "plngcinmibjmkjjpfjemhfabjfjjkhhd"', () => {
    expect(CWS_EXTENSION_ID).toBe('plngcinmibjmkjjpfjemhfabjfjjkhhd');
    expect(CWS_EXTENSION_ID).toHaveLength(32);
    expect(/^[a-p]{32}$/.test(CWS_EXTENSION_ID)).toBe(true);
  });

  it('CWS_LIVE is true by default in production config now that Chrome Web Store is approved', () => {
    expect(CWS_LIVE).toBe(true);
  });

  it('CWS_STORE_URL and GITHUB_RELEASE_URL are correctly constructed', () => {
    expect(CWS_STORE_URL).toBe(
      'https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd'
    );
    expect(GITHUB_RELEASE_URL).toBe(
      'https://github.com/KeepXClean/keepxclean/releases/latest'
    );
    expect(GITHUB_REPO_URL).toBe('https://github.com/KeepXClean/keepxclean');
  });

  it('getActiveCtaConfig() returns CWS store URL and isStore=true by default', () => {
    const config = getActiveCtaConfig();
    expect(config.cwsLive).toBe(true);
    expect(config.primaryUrl).toBe(
      'https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd'
    );
    expect(config.secondaryUrl).toBe('https://github.com/KeepXClean/keepxclean');
    expect(config.isStore).toBe(true);
    expect(config.cwsExtensionId).toBe('plngcinmibjmkjjpfjemhfabjfjjkhhd');
  });

  it('getActiveCtaConfig(false) fallback returns GitHub release URL and isStore=false', () => {
    const fallback = getActiveCtaConfig(false);
    expect(fallback.cwsLive).toBe(false);
    expect(fallback.primaryUrl).toBe(
      'https://github.com/KeepXClean/keepxclean/releases/latest'
    );
    expect(fallback.secondaryUrl).toBe('https://github.com/KeepXClean/keepxclean');
    expect(fallback.isStore).toBe(false);
  });

  it('useCta hook exposes review badge when cwsLive is false, and hides it when cwsLive is true', () => {
    let defaultCta: ReturnType<typeof useCta> | null = null;
    let liveCta: ReturnType<typeof useCta> | null = null;

    function TestComponent() {
      defaultCta = useCta(false);
      liveCta = useCta(true);
      return <div>CtaTest</div>;
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => {
      root.render(
        <I18nProvider initialLocale="en">
          <TestComponent />
        </I18nProvider>
      );
    });

    // Default state: review badge is active, primary URL is GitHub release
    expect(defaultCta).not.toBeNull();
    expect(defaultCta!.cwsLive).toBe(false);
    expect(defaultCta!.isStore).toBe(false);
    expect(defaultCta!.primaryUrl).toBe(GITHUB_RELEASE_URL);
    expect(defaultCta!.badgeText).toBeDefined();
    expect(defaultCta!.badgeText!.length).toBeGreaterThan(0);
    expect(defaultCta!.headerBadgeText).toBeDefined();
    expect(defaultCta!.headerBadgeText!.length).toBeGreaterThan(0);

    // Live state: review badge is hidden (undefined), primary URL is CWS store URL
    expect(liveCta).not.toBeNull();
    expect(liveCta!.cwsLive).toBe(true);
    expect(liveCta!.isStore).toBe(true);
    expect(liveCta!.primaryUrl).toBe(CWS_STORE_URL);
    expect(liveCta!.badgeText).toBeUndefined();
    expect(liveCta!.headerBadgeText).toBeUndefined();

    act(() => {
      root.unmount();
    });
  });
});

describe('M4 Challenger 2: DOM Component & Header Toggle Empirical Verification', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = '';
  });

  it('Header component hides CWS review badge and links to Chrome Web Store by default, and supports cwsLive=false fallback', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider initialLocale="en">
          <Header currentPage="home" />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    // Default (CWS_LIVE = true): no review badge, CTA links directly to CWS
    expect(container.querySelector('.header-cws-badge')).toBeNull();
    const liveBtn = container.querySelector('.btn-header-cta');
    expect(liveBtn?.getAttribute('href')).toBe(CWS_STORE_URL);
    expect(liveBtn?.textContent).toContain(en.nav.addToChrome);

    // Fallback (cwsLive = false): review badge + GitHub release CTA
    await act(async () => {
      root.render(
        <I18nProvider initialLocale="en">
          <Header currentPage="home" cwsLive={false} />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    const badge = container.querySelector('.header-cws-badge');
    expect(badge, 'CWS review badge must exist when cwsLive is false').not.toBeNull();
    expect(badge?.textContent).toContain(en.nav.cwsReviewBadge);

    const pulseDot = badge?.querySelector('.status-dot-pulse');
    expect(pulseDot, 'Pulsing dot must exist inside review badge').not.toBeNull();

    const ctaBtn = container.querySelector('.btn-header-cta');
    expect(ctaBtn).not.toBeNull();
    expect(ctaBtn?.getAttribute('href')).toBe(GITHUB_RELEASE_URL);
    expect(ctaBtn?.textContent).toContain(en.nav.downloadCta);

    await act(async () => {
      root.unmount();
    });
  });

  it('Header renders localized Chrome Web Store CTA labels across all 10 locales (and review badges when cwsLive=false)', async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <I18nProvider initialLocale={locale}>
            <Header currentPage="home" />
          </I18nProvider>
        );
        await Promise.resolve();
      });

      const dict = DICTIONARIES[locale];
      expect(container.querySelector('.header-cws-badge')).toBeNull();
      const liveBtn = container.querySelector('.btn-header-cta');
      expect(liveBtn?.getAttribute('href')).toBe(CWS_STORE_URL);
      expect(liveBtn?.textContent).toContain(dict.nav.addToChrome);

      await act(async () => {
        root.render(
          <I18nProvider initialLocale={locale}>
            <Header currentPage="home" cwsLive={false} />
          </I18nProvider>
        );
        await Promise.resolve();
      });

      const badge = container.querySelector('.header-cws-badge');
      expect(
        badge?.textContent,
        `Locale '${locale}' Header badge text mismatch`
      ).toContain(dict.nav.cwsReviewBadge);

      const ctaBtn = container.querySelector('.btn-header-cta');
      expect(
        ctaBtn?.textContent,
        `Locale '${locale}' Header CTA button text mismatch`
      ).toContain(dict.nav.downloadCta);

      await act(async () => {
        root.unmount();
      });
    }
  });

  it('Header and useI18n fall back safely to English when rendered outside I18nProvider', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Header currentPage="home" />);
      await Promise.resolve();
    });

    const badge = container.querySelector('.header-cws-badge');
    expect(badge).toBeNull();

    const ctaBtn = container.querySelector('.btn-header-cta');
    expect(ctaBtn?.getAttribute('href')).toBe(CWS_STORE_URL);
    expect(ctaBtn?.textContent).toContain(en.nav.addToChrome);

    await act(async () => {
      root.unmount();
    });
  });
});

describe('M4 Challenger 2: Adversarial Security & Resolution Edge Cases', () => {
  it('audits getDictionary security and exposes prototype property vulnerability', () => {
    // 1. Regular unrecognized locales correctly fall back to en
    const unknownDict = getDictionary('unsupported-locale' as any);
    expect(unknownDict).toBeDefined();
    expect(unknownDict.locale).toBe('en');
    expect(unknownDict.nav.features).toBeDefined();

    // 2. Malformed string inputs correctly fall back to en
    const scriptDict = getDictionary('<script>alert(1)</script>' as any);
    expect(scriptDict.locale).toBe('en');

    // 3. Vulnerability demonstration: 'constructor' accesses Object.prototype.constructor
    // If not properly defended with hasOwnProperty, dict is [Function: Object], causing TypeError on dict.nav.features
    const protoDict = getDictionary('constructor' as any);
    expect(
      protoDict.locale,
      'CRITICAL: getDictionary("constructor") must return en dictionary, but returned prototype function/object'
    ).toBe('en');
    expect(protoDict.nav).toBeDefined();
  });
});
