import {
  type SupportedLocale,
  SUPPORTED_LOCALES,
  isSupportedLocale,
} from '@keepxclean/shared';

export const STORAGE_KEY_LANG = 'kxc_site_lang';

const CANONICAL_LOCALE_MAP: Readonly<Record<string, SupportedLocale>> = Object.freeze(
  Object.assign(Object.create(null), {
    en: 'en',
    'zh-cn': 'zh-CN',
    'zh-tw': 'zh-TW',
    ja: 'ja',
    ko: 'ko',
    es: 'es',
    pt: 'pt',
    fr: 'fr',
    de: 'de',
    ru: 'ru',
  })
);

/**
 * Normalizes any candidate string to a SupportedLocale, or returns null if unrecognized.
 */
export function matchLocaleCandidate(rawInput?: string | null): SupportedLocale | null {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const clean = rawInput.trim().replace(/_/g, '-').toLowerCase();
  if (!clean) return null;

  // Exact lowercase match against canonical set (hardened against prototype property lookup)
  if (Object.prototype.hasOwnProperty.call(CANONICAL_LOCALE_MAP, clean)) {
    const candidate = CANONICAL_LOCALE_MAP[clean];
    if (isSupportedLocale(candidate)) {
      return candidate;
    }
  }

  // Dialect / subtag prefix mappings
  if (clean === 'en' || clean.startsWith('en-')) return 'en';
  if (clean === 'zh' || clean.startsWith('zh-')) {
    if (
      clean.includes('tw') ||
      clean.includes('hk') ||
      clean.includes('mo') ||
      clean.includes('hant')
    ) {
      return 'zh-TW';
    }
    return 'zh-CN';
  }
  if (clean === 'ja' || clean.startsWith('ja-')) return 'ja';
  if (clean === 'ko' || clean.startsWith('ko-')) return 'ko';
  if (clean === 'es' || clean.startsWith('es-')) return 'es';
  if (clean === 'pt' || clean.startsWith('pt-')) return 'pt';
  if (clean === 'fr' || clean.startsWith('fr-')) return 'fr';
  if (clean === 'de' || clean.startsWith('de-')) return 'de';
  if (clean === 'ru' || clean.startsWith('ru-')) return 'ru';

  return null;
}

export interface ResolveLocaleOptions {
  search?: string;
  storageLang?: string | null;
  navLang?: string;
}

/**
 * 4-Tier Language Resolution:
 * Tier 1: URL ?lang=
 * Tier 2: localStorage (kxc_site_lang)
 * Tier 3: navigator.language
 * Tier 4: 'en' default fallback
 */
export function resolveSiteLocale(options?: ResolveLocaleOptions): SupportedLocale {
  // Tier 1: URL ?lang=
  let searchStr = options?.search;
  if (searchStr === undefined && typeof window !== 'undefined') {
    searchStr = window.location.search;
  }
  if (searchStr) {
    try {
      const params = new URLSearchParams(searchStr);
      const queryLang = params.get('lang');
      const candidate = matchLocaleCandidate(queryLang);
      if (candidate) return candidate;
    } catch (_) {}
  }

  // Tier 2: localStorage ('kxc_site_lang')
  let storageVal = options?.storageLang;
  if (storageVal === undefined && typeof window !== 'undefined') {
    try {
      storageVal = localStorage.getItem(STORAGE_KEY_LANG);
    } catch (_) {}
  }
  if (storageVal) {
    const candidate = matchLocaleCandidate(storageVal);
    if (candidate) return candidate;
  }

  // Tier 3: navigator.language
  let navVal = options?.navLang;
  if (navVal === undefined && typeof navigator !== 'undefined') {
    navVal = navigator.language;
  }
  if (navVal) {
    const candidate = matchLocaleCandidate(navVal);
    if (candidate) return candidate;
  }

  // Tier 4: Fallback
  return 'en';
}

/**
 * Update URL query param ?lang= without full page reload.
 */
export function updateUrlQueryLang(
  locale: SupportedLocale,
  mode: 'replace' | 'push' = 'replace'
): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('lang') !== locale) {
      url.searchParams.set('lang', locale);
      if (mode === 'push') {
        window.history.pushState({}, '', url.toString());
      } else {
        window.history.replaceState({}, '', url.toString());
      }
    }
  } catch (_) {}
}
