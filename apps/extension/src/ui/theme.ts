import { useEffect, useSyncExternalStore } from 'react';
import { isUIThemeSetting, type UIThemeSetting } from '@keepxclean/shared';

export type ResolvedTheme = 'light' | 'dark';

export const THEME_CACHE_KEY = 'kxc_theme_cache';

function isXHost(): boolean {
  if (typeof location === 'undefined') return false;
  const h = location.hostname.toLowerCase();
  return (
    h === 'x.com' ||
    h.endsWith('.x.com') ||
    h === 'twitter.com' ||
    h.endsWith('.twitter.com')
  );
}

export function cacheThemeSetting(setting: UIThemeSetting): void {
  if (isXHost()) return;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_CACHE_KEY, setting);
    }
  } catch {
    // Ignore storage access errors in restricted/test contexts
  }
}

export function readCachedThemeSetting(): UIThemeSetting {
  if (isXHost()) return 'light';
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(THEME_CACHE_KEY);
      if (isUIThemeSetting(raw)) return raw;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'light';
}

export function detectSystemDark(): boolean {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
    ) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch {
    // Ignore unsupported matchMedia environments
  }
  return false;
}

function parseOpaqueRgb(
  cssColor: string | null | undefined
): [number, number, number] | null {
  if (!cssColor) return null;
  const match = cssColor.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (!match) return null;
  const alpha = match[4] !== undefined ? Number(match[4]) : 1;
  if (!Number.isFinite(alpha) || alpha <= 0.05) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function detectXPageDark(
  doc: Document | undefined = typeof document !== 'undefined'
    ? document
    : undefined
): boolean {
  if (!doc) return false;
  try {
    if (typeof getComputedStyle === 'function') {
      for (const el of [doc.body, doc.documentElement]) {
        if (!el) continue;
        const rgb = parseOpaqueRgb(getComputedStyle(el).backgroundColor);
        if (rgb) {
          const luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
          return luminance < 128;
        }
      }
    }
    const html = doc.documentElement;
    if (!html) return false;
    if (html.dataset?.theme === 'dark') return true;
    if (html.dataset?.theme === 'light') return false;
    const inlineStyle = html.getAttribute('style') ?? '';
    if (/color-scheme\s*:\s*dark/i.test(inlineStyle)) return true;
    if (/color-scheme\s*:\s*light/i.test(inlineStyle)) return false;
  } catch {
    // Ignore DOM inspection errors
  }
  return false;
}

export function resolveThemeSetting(
  setting: UIThemeSetting | undefined,
  ambientDark: boolean
): ResolvedTheme {
  if (setting === 'dark') return 'dark';
  if (setting === 'system') return ambientDark ? 'dark' : 'light';
  return 'light';
}

export function nextThemeSetting(current: UIThemeSetting): UIThemeSetting {
  if (current === 'light') return 'dark';
  if (current === 'dark') return 'system';
  return 'light';
}

export function bootDocumentTheme(): ResolvedTheme {
  const cached = readCachedThemeSetting();
  const resolved = resolveThemeSetting(cached, detectSystemDark());
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.dataset.theme = resolved;
  }
  return resolved;
}

function subscribeSystemDark(onChange: () => void): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => {};
  }
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  return () => {};
}

export function useSystemDark(): boolean {
  return useSyncExternalStore(
    subscribeSystemDark,
    detectSystemDark,
    () => false
  );
}

export function useDocumentTheme(
  setting: UIThemeSetting | undefined
): ResolvedTheme {
  const systemDark = useSystemDark();
  const effectiveSetting = setting ?? readCachedThemeSetting();
  const resolved = resolveThemeSetting(effectiveSetting, systemDark);

  useEffect(() => {
    if (setting !== undefined) {
      cacheThemeSetting(setting);
    }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.dataset.theme = resolved;
    }
  }, [setting, resolved]);

  return resolved;
}
