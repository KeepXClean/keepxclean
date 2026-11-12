import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import {
  type SupportedLocale,
  UI_LOCALE_OPTIONS,
  type UILocaleOption,
} from '@keepxclean/shared';
import type { TranslationDictionary } from './types';
import { getDictionary } from './index';
import {
  resolveSiteLocale,
  updateUrlQueryLang,
  STORAGE_KEY_LANG,
  matchLocaleCandidate,
} from './resolve';

export interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (nextLocale: SupportedLocale) => void;
  t: TranslationDictionary;
  dict: TranslationDictionary;
  dir: 'ltr' | 'rtl';
  availableLocales: readonly UILocaleOption[];
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: SupportedLocale;
  syncDomMeta?: boolean;
}

export function I18nProvider({
  children,
  initialLocale,
  syncDomMeta = true,
}: I18nProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    return initialLocale ?? resolveSiteLocale();
  });

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
    try {
      localStorage.setItem(STORAGE_KEY_LANG, nextLocale);
    } catch (_) {}
    updateUrlQueryLang(nextLocale, 'replace');
  }, []);

  // Listen to browser Back / Forward (popstate)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const resolved = resolveSiteLocale();
      setLocaleState(resolved);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Listen to multi-tab storage changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_LANG && e.newValue) {
        const candidate = matchLocaleCandidate(e.newValue);
        if (candidate) setLocaleState(candidate);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const t = useMemo(() => getDictionary(locale), [locale]);

  // Synchronize dynamic DOM Meta (Feature 22)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!syncDomMeta) return;

    // 1. <html lang="...">
    document.documentElement.lang = locale;

    // 2. document.title
    if (t?.meta?.title) {
      document.title = t.meta.title;
    }

    // 3. <meta name="description">
    if (t?.meta?.description) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'description');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', t.meta.description);
    }
  }, [locale, t, syncDomMeta]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      dict: t,
      dir: 'ltr',
      availableLocales: UI_LOCALE_OPTIONS,
    }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    const defaultDict = getDictionary('en');
    return {
      locale: 'en',
      setLocale: () => {},
      t: defaultDict,
      dict: defaultDict,
      dir: 'ltr',
      availableLocales: UI_LOCALE_OPTIONS,
    };
  }
  return context;
}
