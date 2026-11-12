// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  matchLocaleCandidate,
  resolveSiteLocale,
  updateUrlQueryLang,
  STORAGE_KEY_LANG,
} from '../src/locales/resolve';
import {
  I18nProvider,
  useI18n,
  getDictionary,
} from '../src/locales';
import { PrivacyApp } from '../src/PrivacyApp';
import { SUPPORTED_LOCALES, type SupportedLocale } from '@keepxclean/shared';

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('EMPIRICAL CHALLENGER: Feature 21 & 22 Adversarial Stress Suite', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    document.title = 'Default Title';
    document.documentElement.lang = 'en';

    const existingMeta = document.querySelectorAll('meta[name="description"]');
    existingMeta.forEach((m) => m.remove());
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // =========================================================================
  // MISSION ITEM 1: Malformed Queries & Boundary Inputs for matchLocaleCandidate
  // =========================================================================
  describe('Mission Item 1.1: Malformed and Boundary Inputs for matchLocaleCandidate', () => {
    it('handles mandatory malformed query inputs explicitly specified in mission', () => {
      // 1. ?lang= (empty string)
      expect(matchLocaleCandidate('')).toBeNull();

      // 2. ?lang=??? (punctuation/symbols)
      expect(matchLocaleCandidate('???')).toBeNull();

      // 3. ?lang=ZH_cn (mixed case, underscore separator)
      expect(matchLocaleCandidate('ZH_cn')).toBe('zh-CN');

      // 4. ?lang=zh-Hant (Traditional script)
      expect(matchLocaleCandidate('zh-Hant')).toBe('zh-TW');

      // 5. ?lang=zh-HK (Hong Kong region)
      expect(matchLocaleCandidate('zh-HK')).toBe('zh-TW');

      // 6. ?lang=zh-MO (Macau region)
      expect(matchLocaleCandidate('zh-MO')).toBe('zh-TW');

      // 7. ?lang=pt-br (Portuguese Brazil, lowercase)
      expect(matchLocaleCandidate('pt-br')).toBe('pt');

      // 8. ?lang=fr-CA (French Canada, mixed case)
      expect(matchLocaleCandidate('fr-CA')).toBe('fr');

      // 9. ?lang=undefined (literal string "undefined")
      expect(matchLocaleCandidate('undefined')).toBeNull();

      // 10. ?lang=null (literal string "null")
      expect(matchLocaleCandidate('null')).toBeNull();
    });

    it('handles JS primitive edge cases (null, undefined, non-strings, whitespace)', () => {
      expect(matchLocaleCandidate(undefined)).toBeNull();
      expect(matchLocaleCandidate(null)).toBeNull();
      expect(matchLocaleCandidate('   ')).toBeNull();
      expect(matchLocaleCandidate('\t\r\n')).toBeNull();
      // @ts-ignore: adversarial type bypass
      expect(matchLocaleCandidate(12345)).toBeNull();
      // @ts-ignore: adversarial type bypass
      expect(matchLocaleCandidate({})).toBeNull();
      // @ts-ignore: adversarial type bypass
      expect(matchLocaleCandidate([])).toBeNull();
      // @ts-ignore: adversarial type bypass
      expect(matchLocaleCandidate(true)).toBeNull();
    });

    it('handles adversarial script injection, prototype tokens, and malformed tags', () => {
      expect(matchLocaleCandidate('<script>alert("xss")</script>')).toBeNull();
      expect(matchLocaleCandidate('[object Object]')).toBeNull();
      expect(matchLocaleCandidate('constructor')).toBeNull();
      expect(matchLocaleCandidate('__proto__')).toBeNull();
      expect(matchLocaleCandidate('toString')).toBeNull();
      expect(matchLocaleCandidate('NaN')).toBeNull();
      expect(matchLocaleCandidate('0')).toBeNull();
      expect(matchLocaleCandidate('true')).toBeNull();
      expect(matchLocaleCandidate('false')).toBeNull();
    });

    it('demonstrates prototype property bypass failure in 4-tier cascade (?lang=constructor + storage=ja)', () => {
      // Because 'constructor' is invalid, the cascade MUST fall through to Tier 2 (ja)
      const resolved = resolveSiteLocale({
        search: '?lang=constructor',
        storageLang: 'ja',
        navLang: 'de',
      });
      expect(resolved).toBe('ja');
    });

    it('demonstrates dictionary lookup vulnerability when called with prototype property ("constructor")', () => {
      // When an invalid locale key like 'constructor' is requested, getDictionary MUST fall back to 'en' dictionary
      // @ts-ignore: testing adversarial input
      const dict = getDictionary('constructor');
      expect(dict).toBeDefined();
      expect(dict.meta).toBeDefined();
      expect(typeof dict.meta.title).toBe('string');
      expect(dict.meta.title).toBe(getDictionary('en').meta.title);
    });

    it('robustly normalizes all Chinese dialect variants and script combinations', () => {
      // Traditional Chinese targets -> zh-TW
      const tradVariants = [
        'zh-tw',
        'zh-TW',
        'ZH-TW',
        'zh_tw',
        'ZH_TW',
        'zh-hk',
        'zh-HK',
        'zh_HK',
        'zh-mo',
        'zh-MO',
        'zh_MO',
        'zh-hant',
        'zh-Hant',
        'zh-HANT',
        'zh_hant',
        'zh-Hant-TW',
        'zh-Hant-HK',
        'zh-Hant-MO',
      ];
      for (const variant of tradVariants) {
        expect(matchLocaleCandidate(variant)).toBe('zh-TW');
      }

      // Simplified Chinese targets -> zh-CN
      const simpVariants = [
        'zh',
        'ZH',
        'zh-cn',
        'zh-CN',
        'ZH-CN',
        'zh_cn',
        'ZH_CN',
        'zh-sg',
        'zh-SG',
        'zh_SG',
        'zh-hans',
        'zh-Hans',
        'zh-HANS',
        'zh_hans',
        'zh-Hans-CN',
        'zh-Hans-SG',
      ];
      for (const variant of simpVariants) {
        expect(matchLocaleCandidate(variant)).toBe('zh-CN');
      }
    });

    it('robustly normalizes regional subtag variants for all western/asian supported languages', () => {
      const mappings: Array<[string[], SupportedLocale]> = [
        [['en', 'en-US', 'en-GB', 'en-CA', 'en-AU', 'en-NZ', 'EN-us', 'en_US'], 'en'],
        [['ja', 'ja-JP', 'JA', 'ja_JP', 'JA-jp'], 'ja'],
        [['ko', 'ko-KR', 'KO', 'ko_KR'], 'ko'],
        [['es', 'es-ES', 'es-MX', 'es-419', 'es-AR', 'es-CO', 'ES_es'], 'es'],
        [['pt', 'pt-BR', 'pt-PT', 'pt-AO', 'PT-br', 'pt_BR'], 'pt'],
        [['fr', 'fr-FR', 'fr-CA', 'fr-BE', 'fr-CH', 'FR_fr'], 'fr'],
        [['de', 'de-DE', 'de-AT', 'de-CH', 'de-LI', 'DE_de'], 'de'],
        [['ru', 'ru-RU', 'ru-BY', 'ru-KZ', 'ru-UA', 'RU_ru'], 'ru'],
      ];

      for (const [variants, expected] of mappings) {
        for (const variant of variants) {
          expect(
            matchLocaleCandidate(variant),
            `Variant "${variant}" should resolve to "${expected}"`
          ).toBe(expected);
        }
      }
    });

    it('rejects unsupported world languages cleanly with null', () => {
      const unsupported = ['it', 'nl', 'pl', 'tr', 'vi', 'th', 'ar', 'hi', 'sv', 'da', 'fi', 'el', 'he', 'id'];
      for (const lang of unsupported) {
        expect(matchLocaleCandidate(lang)).toBeNull();
        expect(matchLocaleCandidate(`${lang}-${lang.toUpperCase()}`)).toBeNull();
      }
    });
  });

  // =========================================================================
  // MISSION ITEM 1: 4-Tier Cascade Verification
  // =========================================================================
  describe('Mission Item 1.2: 4-Tier Resolution Cascade Verification', () => {
    it('Cascade Check 1: Tier 1 invalid (?lang=nonsense) + Tier 2 present (ja) -> MUST resolve to "ja", NOT "en"', () => {
      const resolved = resolveSiteLocale({
        search: '?lang=nonsense',
        storageLang: 'ja',
        navLang: 'en',
      });
      expect(resolved).toBe('ja');
    });

    it('Cascade Check 2: Tier 1 absent + Tier 2 invalid (unknown) + Tier 3 present (de-DE) -> MUST resolve to "de"', () => {
      const resolved = resolveSiteLocale({
        search: '',
        storageLang: 'unknown',
        navLang: 'de-DE',
      });
      expect(resolved).toBe('de');
    });

    it('Cascade Check 3: Tier 1, 2, 3 all invalid or absent -> MUST resolve to "en"', () => {
      const resolved = resolveSiteLocale({
        search: '?lang=completely_invalid',
        storageLang: 'bogus_storage',
        navLang: 'ar-EG', // unsupported language
      });
      expect(resolved).toBe('en');

      // Completely empty / absent
      expect(resolveSiteLocale({ search: '', storageLang: null, navLang: '' })).toBe('en');
    });

    it('Cascade Check 4: Tier 1 valid overrides Tier 2 and Tier 3 even when both are valid', () => {
      const resolved = resolveSiteLocale({
        search: '?lang=ru',
        storageLang: 'ja',
        navLang: 'de',
      });
      expect(resolved).toBe('ru');
    });

    it('Cascade Check 5: Tier 2 valid overrides Tier 3 when Tier 1 is absent', () => {
      const resolved = resolveSiteLocale({
        search: '',
        storageLang: 'ko',
        navLang: 'fr-FR',
      });
      expect(resolved).toBe('ko');
    });

    it('Cascade Check 6: complex URL search query parameter extraction', () => {
      // Query with multiple parameters and anchor encoding
      expect(
        resolveSiteLocale({
          search: '?utm_source=twitter&lang=zh-HK&ref=producthunt',
        })
      ).toBe('zh-TW');

      expect(
        resolveSiteLocale({
          search: '?tracking=abc&lang=pt-br',
        })
      ).toBe('pt');

      // Empty ?lang= falls through
      expect(
        resolveSiteLocale({
          search: '?lang=&other=1',
          storageLang: 'es',
        })
      ).toBe('es');

      // Malformed search string with question marks
      expect(
        resolveSiteLocale({
          search: '???&&&===',
          storageLang: 'fr',
        })
      ).toBe('fr');
    });

    it('Cascade Check 7: resilience against localStorage throwing SecurityError/QuotaExceededError', () => {
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = vi.fn(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      });

      // When localStorage throws, it must not crash and must fall through to Tier 3 navigator.language
      const resolved = resolveSiteLocale({
        search: '',
        navLang: 'ja-JP',
      });
      expect(resolved).toBe('ja');

      localStorage.getItem = originalGetItem;
    });
  });

  // =========================================================================
  // MISSION ITEM 2: DOM Meta Synchronization Stress Testing
  // =========================================================================
  describe('Mission Item 2.1: Dynamic DOM Meta Synchronization for All 10 Supported Locales', () => {
    it('verifies <html lang>, document.title, and <meta description> for all 10 locales', async () => {
      let setLocaleFn: (l: SupportedLocale) => void = () => {};

      function MetaTester() {
        const { locale, setLocale } = useI18n();
        setLocaleFn = setLocale;
        return <div data-testid="active-locale">{locale}</div>;
      }

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <I18nProvider initialLocale="en" syncDomMeta={true}>
            <MetaTester />
          </I18nProvider>
        );
        await Promise.resolve();
      });

      // Iterate through every single supported locale in the matrix
      for (const testLocale of SUPPORTED_LOCALES) {
        await act(async () => {
          setLocaleFn(testLocale);
          await Promise.resolve();
        });

        const dict = getDictionary(testLocale);

        // 1. Verify <html lang="...">
        expect(document.documentElement.lang).toBe(testLocale);

        // 2. Verify document.title matches dictionary title and is non-empty
        expect(document.title).toBe(dict.meta.title);
        expect(document.title.length).toBeGreaterThan(5);

        // 3. Verify <meta name="description"> matches dictionary description and is non-empty
        const metaDesc = document.querySelector('meta[name="description"]');
        expect(metaDesc).not.toBeNull();
        expect(metaDesc?.getAttribute('content')).toBe(dict.meta.description);
        expect(dict.meta.description.length).toBeGreaterThan(15);
      }

      await act(async () => {
        root.unmount();
      });
    });

    it('dynamically inserts <meta name="description"> if not present in initial HTML', async () => {
      // Ensure no description meta exists
      const initialMeta = document.querySelector('meta[name="description"]');
      if (initialMeta) initialMeta.remove();
      expect(document.querySelector('meta[name="description"]')).toBeNull();

      function Consumer() {
        const { locale } = useI18n();
        return <div>{locale}</div>;
      }

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <I18nProvider initialLocale="ja" syncDomMeta={true}>
            <Consumer />
          </I18nProvider>
        );
        await Promise.resolve();
      });

      const createdMeta = document.querySelector('meta[name="description"]');
      expect(createdMeta).not.toBeNull();
      expect(createdMeta?.getAttribute('name')).toBe('description');
      expect(createdMeta?.getAttribute('content')).toBe(getDictionary('ja').meta.description);

      await act(async () => {
        root.unmount();
      });
    });
  });

  describe('Mission Item 2.2: updateUrlQueryLang and replaceState behavior', () => {
    it('updates URL search param with replaceState without triggering page reload', () => {
      const replaceSpy = vi.spyOn(window.history, 'replaceState');
      const pushSpy = vi.spyOn(window.history, 'pushState');

      // Update to 'zh-CN' via replace (default)
      updateUrlQueryLang('zh-CN', 'replace');
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy).not.toHaveBeenCalled();

      // Verify the URL was updated
      const currentUrl = new URL(window.location.href);
      expect(currentUrl.searchParams.get('lang')).toBe('zh-CN');

      // Calling again with the same locale should be idempotent (no extra replaceState)
      replaceSpy.mockClear();
      updateUrlQueryLang('zh-CN', 'replace');
      expect(replaceSpy).not.toHaveBeenCalled();

      // Calling with 'push' mode uses pushState
      pushSpy.mockClear();
      updateUrlQueryLang('ja', 'push');
      expect(pushSpy).toHaveBeenCalledTimes(1);
      const pushedUrl = new URL(window.location.href);
      expect(pushedUrl.searchParams.get('lang')).toBe('ja');
    });

    it('preserves existing query parameters and hash when updating lang', () => {
      // Set initial URL with other query params and hash
      window.history.replaceState({}, '', '/?utm_campaign=launch&ref=hacker-news#demo');

      updateUrlQueryLang('fr', 'replace');

      const url = new URL(window.location.href);
      expect(url.searchParams.get('utm_campaign')).toBe('launch');
      expect(url.searchParams.get('ref')).toBe('hacker-news');
      expect(url.searchParams.get('lang')).toBe('fr');
      expect(url.hash).toBe('#demo');
    });
  });

  describe('Mission Item 2.3: /privacy/ Page Legal Bilingual Title Retention when syncDomMeta={false}', () => {
    it('preserves legal bilingual title on /privacy/ without being overwritten by homepage meta title', async () => {
      // Set initial state
      document.title = 'Initial Outer Title';

      const root = createRoot(container);
      await act(async () => {
        root.render(<PrivacyApp />);
        await Promise.resolve();
      });

      // Default privacy title in English environment
      // Should NOT be homepage title:
      // "KeepXClean — Open-Source Local-First X Cleaner"
      const homeEnTitle = getDictionary('en').meta.title;
      expect(document.title).not.toBe(homeEnTitle);
      expect(document.title).toBe('Privacy Policy — KeepXClean');

      // Click the Simplified Chinese button to toggle privacy policy language
      const zhBtn = container.querySelector('button[aria-pressed="false"]') as HTMLButtonElement;
      expect(zhBtn).not.toBeNull();

      await act(async () => {
        zhBtn.click();
        await Promise.resolve();
      });

      // Document title MUST become the legal bilingual title:
      // "隐私政策（Privacy Policy） — KeepXClean"
      const homeZhTitle = getDictionary('zh-CN').meta.title;
      expect(document.title).not.toBe(homeZhTitle);
      expect(document.title).toBe('隐私政策（Privacy Policy） — KeepXClean');
      expect(document.documentElement.lang).toBe('zh-CN');

      await act(async () => {
        root.unmount();
      });
    });

    it('isolates syncDomMeta={false} inside I18nProvider so custom document.title remains uncorrupted', async () => {
      document.title = 'Custom Pre-existing Legal Title';

      function TestPrivacyWrapper() {
        const { locale } = useI18n();
        return <div>Current Privacy Locale: {locale}</div>;
      }

      const root = createRoot(container);
      await act(async () => {
        root.render(
          <I18nProvider initialLocale="es" syncDomMeta={false}>
            <TestPrivacyWrapper />
          </I18nProvider>
        );
        await Promise.resolve();
      });

      // Since syncDomMeta is false, Spanish home meta title should NOT overwrite custom title
      expect(document.title).toBe('Custom Pre-existing Legal Title');

      await act(async () => {
        root.unmount();
      });
    });
  });
});
