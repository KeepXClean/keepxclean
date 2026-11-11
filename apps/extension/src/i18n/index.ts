import { useEffect, useMemo } from 'react';
import type { SupportedLocale } from '@keepxclean/shared';
import { useApp } from '../state/store';
import {
  getActiveLocaleSetting,
  getI18n,
  type I18nContext,
} from './core';

export * from './types';
export * from './core';

export function useI18n(): I18nContext {
  const app = useApp();
  const setting = app.data?.config.locale ?? getActiveLocaleSetting();
  return useMemo(() => getI18n(setting), [setting]);
}

export function useDocumentLocale(title: string, locale: SupportedLocale) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = title;
  }, [title, locale]);
}
