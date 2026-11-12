import { describe, it, expect } from 'vitest';
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
} from '../src/locales';

function compareObjectKeys(
  refObj: Record<string, any>,
  targetObj: Record<string, any>,
  path: string,
  targetLocale: string
) {
  const refKeys = Object.keys(refObj).sort();
  const targetKeys = Object.keys(targetObj).sort();

  expect(
    targetKeys,
    `Key mismatch in locale '${targetLocale}' at path '${path}'`
  ).toEqual(refKeys);

  for (const key of refKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    const refVal = refObj[key];
    const targetVal = targetObj[key];

    expect(
      targetVal,
      `Value for '${currentPath}' in locale '${targetLocale}' must not be null/undefined`
    ).toBeDefined();

    if (Array.isArray(refVal)) {
      expect(
        Array.isArray(targetVal),
        `Expected array at '${currentPath}' in locale '${targetLocale}'`
      ).toBe(true);
      expect(
        targetVal.length,
        `Array at '${currentPath}' in locale '${targetLocale}' should match reference length`
      ).toBe(refVal.length);

      // Inspect array items (e.g. faq.items)
      for (let i = 0; i < refVal.length; i++) {
        if (typeof refVal[i] === 'object' && refVal[i] !== null) {
          compareObjectKeys(
            refVal[i],
            targetVal[i],
            `${currentPath}[${i}]`,
            targetLocale
          );
        }
      }
    } else if (typeof refVal === 'object' && refVal !== null) {
      expect(
        typeof targetVal,
        `Expected object at '${currentPath}' in locale '${targetLocale}'`
      ).toBe('object');
      compareObjectKeys(refVal, targetVal, currentPath, targetLocale);
    } else if (typeof refVal === 'string') {
      expect(
        typeof targetVal,
        `Expected string at '${currentPath}' in locale '${targetLocale}'`
      ).toBe('string');
      expect(
        targetVal.trim().length,
        `String at '${currentPath}' in locale '${targetLocale}' must not be empty`
      ).toBeGreaterThan(0);
      expect(
        targetVal,
        `String at '${currentPath}' in locale '${targetLocale}' must not contain literal 'undefined'`
      ).not.toContain('undefined');
    }
  }
}

describe('Feature 20: 10-Language Translation Matrix & Completeness', () => {
  it('DICTIONARIES exports all 10 supported locales', () => {
    for (const code of SUPPORTED_LOCALES) {
      expect(DICTIONARIES).toHaveProperty(code);
      expect(DICTIONARIES[code]).toBeDefined();
      expect(DICTIONARIES[code].locale).toBe(code);
    }
  });

  it('all 10 individual dictionary exports exist and match DICTIONARIES map', () => {
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

  it('getDictionary returns the correct dictionary and falls back to en for unknown locales', () => {
    expect(getDictionary('en').locale).toBe('en');
    expect(getDictionary('zh-CN').locale).toBe('zh-CN');
    expect(getDictionary('ja').locale).toBe('ja');
    expect(getDictionary('fr').locale).toBe('fr');
    expect(getDictionary('unknown' as any).locale).toBe('en');
  });

  it('all 10 locales have 100% key parity with reference en dictionary (zero missing keys)', () => {
    const reference = en;
    const locales: SupportedLocale[] = [
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
    ];

    for (const locale of locales) {
      const dict = DICTIONARIES[locale];
      compareObjectKeys(reference, dict, '', locale);
    }
  });

  it('contains at least 6 FAQ items in every language dictionary', () => {
    for (const code of SUPPORTED_LOCALES) {
      const dict = DICTIONARIES[code];
      expect(dict.faq.items.length).toBeGreaterThanOrEqual(6);
      for (const item of dict.faq.items) {
        expect(item.q.trim().length).toBeGreaterThan(5);
        expect(item.a.trim().length).toBeGreaterThan(10);
      }
    }
  });

  it('contains valid non-affiliation disclaimer in every language dictionary', () => {
    for (const code of SUPPORTED_LOCALES) {
      const dict = DICTIONARIES[code];
      expect(dict.footer.disclaimer.length).toBeGreaterThan(15);
      // Ensures X / Twitter trademark disclaimer is present
      expect(
        dict.footer.disclaimer.includes('X') ||
          dict.footer.disclaimer.includes('Twitter')
      ).toBe(true);
    }
  });

  it('contains valid CWS review badge and download strings in every language', () => {
    for (const code of SUPPORTED_LOCALES) {
      const dict = DICTIONARIES[code];
      expect(dict.nav.cwsReviewBadge.length).toBeGreaterThan(0);
      expect(dict.nav.downloadCta.length).toBeGreaterThan(0);
      expect(dict.hero.cwsReview.length).toBeGreaterThan(0);
      expect(dict.hero.ctaPrimary.length).toBeGreaterThan(0);
    }
  });
});
