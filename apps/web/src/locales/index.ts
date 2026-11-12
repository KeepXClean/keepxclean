import { isSupportedLocale, type SupportedLocale } from '@keepxclean/shared';
import type { TranslationDictionary } from './types';

import { en } from './en';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';
import { ja } from './ja';
import { ko } from './ko';
import { es } from './es';
import { pt } from './pt';
import { fr } from './fr';
import { de } from './de';
import { ru } from './ru';

export const DICTIONARIES: Record<SupportedLocale, TranslationDictionary> = Object.freeze(
  Object.assign(Object.create(null), {
    en,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    ja,
    ko,
    es,
    pt,
    fr,
    de,
    ru,
  })
);

/**
 * Returns the typed dictionary for the given locale with fallback to 'en'.
 * Hardened against prototype property lookups and malformed input strings.
 */
export function getDictionary(locale: SupportedLocale): TranslationDictionary {
  if (isSupportedLocale(locale) && Object.prototype.hasOwnProperty.call(DICTIONARIES, locale)) {
    return DICTIONARIES[locale];
  }
  return DICTIONARIES.en;
}

export { en, zhCN, zhTW, ja, ko, es, pt, fr, de, ru };
export * from './types';
export * from './resolve';
export * from './I18nContext';
export * from './useCta';
