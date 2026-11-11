import {
  resolveLocale,
  type SupportedLocale,
  type UILocaleSetting,
} from '@keepxclean/shared';
import type { ExtensionMessages } from './types';
import { getActiveLocaleSetting } from './state';
import { en } from './locales/en';
import { zhCN } from './locales/zh-CN';
import { zhTW } from './locales/zh-TW';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { es } from './locales/es';
import { pt } from './locales/pt';
import { fr } from './locales/fr';
import { de } from './locales/de';
import { ru } from './locales/ru';

export { getActiveLocaleSetting, setActiveLocaleSetting } from './state';
export {
  ERROR_LOCALES,
  getActiveErrors,
  getErrors,
  type ErrorMessages,
} from './errors';

export const LOCALES: Record<SupportedLocale, ExtensionMessages> = {
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
};

export interface I18nContext {
  locale: SupportedLocale;
  m: ExtensionMessages;
  setting: UILocaleSetting;
}

export function getI18n(
  setting: UILocaleSetting = getActiveLocaleSetting()
): I18nContext {
  const locale = resolveLocale(setting);
  return {
    locale,
    m: LOCALES[locale] ?? LOCALES.en,
    setting,
  };
}

export function getActiveI18n(): I18nContext {
  return getI18n(getActiveLocaleSetting());
}

export function formatDateTime(
  value: number | string | undefined,
  locale: SupportedLocale,
  emptyText: string
): string {
  if (!value) return emptyText;
  const d = new Date(typeof value === 'number' ? value : Date.parse(value));
  if (Number.isNaN(d.getTime())) return emptyText;
  return d.toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCount(value: number, locale: SupportedLocale): string {
  return value.toLocaleString(locale);
}
