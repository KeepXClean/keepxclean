/**
 * KeepXClean In-Memory Browser Environment & Verification Fixtures
 *
 * Implements:
 * - High performance virtual DOM environment using JSDOM
 * - Deterministic timer advancement (advanceTimersByTime)
 * - prefers-reduced-motion simulator
 * - Brand asset validator (square embedded PNG, no scripts, remote images or stale X paths)
 * - CSS tokens validator (#F7F9F8, #FFFFFF, #EAF6EF, #13865F)
 * - In-memory Fetch interceptor (MockFetch)
 */

import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

export interface VirtualBrowserOptions {
  url?: string;
  html?: string;
  reducedMotion?: boolean;
  language?: string;
  storage?: Record<string, string>;
}

export interface VirtualBrowserInstance {
  dom: JSDOM;
  window: any;
  document: Document;
  clock: VirtualClock;
  advanceTimersByTime: (ms: number) => void;
  advanceTimersByTimeAsync: (ms: number) => Promise<void>;
  setReducedMotion: (reduce: boolean) => void;
  setLanguage: (lang: string) => void;
  cleanup: () => void;
}

export interface VirtualTimer {
  id: number;
  fn: () => void;
  runAt: number;
  interval?: number;
  isInterval?: boolean;
}

export class VirtualClock {
  private currentTime = 0;
  private timerSeq = 1;
  private timers = new Map<number, VirtualTimer>();

  get now(): number {
    return this.currentTime;
  }

  setTimeout(fn: () => void, delayMs = 0): number {
    const id = this.timerSeq++;
    this.timers.set(id, {
      id,
      fn,
      runAt: this.currentTime + Math.max(0, delayMs),
      isInterval: false,
    });
    return id;
  }

  clearTimeout(id: number): void {
    this.timers.delete(id);
  }

  setInterval(fn: () => void, intervalMs = 0): number {
    const id = this.timerSeq++;
    const interval = Math.max(1, intervalMs);
    this.timers.set(id, {
      id,
      fn,
      runAt: this.currentTime + interval,
      interval,
      isInterval: true,
    });
    return id;
  }

  clearInterval(id: number): void {
    this.timers.delete(id);
  }

  advanceByTime(ms: number): void {
    const targetTime = this.currentTime + ms;

    while (true) {
      let nextTimer: VirtualTimer | null = null;
      for (const timer of this.timers.values()) {
        if (timer.runAt <= targetTime) {
          if (!nextTimer || timer.runAt < nextTimer.runAt) {
            nextTimer = timer;
          }
        }
      }

      if (!nextTimer) {
        break;
      }

      this.currentTime = nextTimer.runAt;

      if (nextTimer.isInterval) {
        nextTimer.runAt = this.currentTime + (nextTimer.interval ?? 1);
        try {
          nextTimer.fn();
        } catch (e) {
          console.error('VirtualClock setInterval callback error:', e);
        }
      } else {
        this.timers.delete(nextTimer.id);
        try {
          nextTimer.fn();
        } catch (e) {
          console.error('VirtualClock setTimeout callback error:', e);
        }
      }
    }

    this.currentTime = targetTime;
  }

  async advanceByTimeAsync(ms: number): Promise<void> {
    this.advanceByTime(ms);
    await new Promise((resolve) => process.nextTick(resolve));
  }

  reset(): void {
    this.timers.clear();
    this.currentTime = 0;
  }
}

export function createVirtualBrowser(options: VirtualBrowserOptions = {}): VirtualBrowserInstance {
  const initialHtml = options.html ?? `
<!DOCTYPE html>
<html lang="${options.language ?? 'en'}">
<head>
  <meta charset="UTF-8">
  <title>KeepXClean — Official Site</title>
  <meta name="description" content="High signal-to-noise ratio filter extension for X">
</head>
<body>
  <div id="root"></div>
</body>
</html>
`;

  const dom = new JSDOM(initialHtml, {
    url: options.url ?? 'https://keepxclean.com/',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });

  const win = dom.window as any;
  const clock = new VirtualClock();

  // Mock localStorage
  const storageMap = new Map<string, string>(Object.entries(options.storage ?? {}));
  const mockStorage: Storage = {
    length: storageMap.size,
    clear: () => storageMap.clear(),
    getItem: (key: string) => storageMap.get(key) ?? null,
    key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
    removeItem: (key: string) => {
      storageMap.delete(key);
    },
    setItem: (key: string, value: string) => {
      storageMap.set(key, String(value));
    },
  };

  Object.defineProperty(win, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });

  // Mock matchMedia
  let isReducedMotion = Boolean(options.reducedMotion);
  win.matchMedia = (query: string) => {
    const isMotionQuery = query.includes('prefers-reduced-motion');
    return {
      matches: isMotionQuery ? isReducedMotion : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  };

  // Mock navigator.language
  let navLang = options.language ?? 'en';
  Object.defineProperty(win.navigator, 'language', {
    get: () => navLang,
    configurable: true,
  });

  // Connect virtual clock
  win.setTimeout = (fn: () => void, ms?: number) => clock.setTimeout(fn, ms);
  win.clearTimeout = (id: number) => clock.clearTimeout(id);
  win.setInterval = (fn: () => void, ms?: number) => clock.setInterval(fn, ms);
  win.clearInterval = (id: number) => clock.clearInterval(id);
  win.Date.now = () => clock.now;

  return {
    dom,
    window: win,
    document: win.document,
    clock,
    advanceTimersByTime: (ms: number) => clock.advanceByTime(ms),
    advanceTimersByTimeAsync: async (ms: number) => clock.advanceByTimeAsync(ms),
    setReducedMotion: (reduce: boolean) => {
      isReducedMotion = reduce;
    },
    setLanguage: (lang: string) => {
      navLang = lang;
      win.document.documentElement.lang = lang;
    },
    cleanup: () => {
      clock.reset();
      dom.window.close();
    },
  };
}

// The approved imagegen artwork is embedded losslessly in standalone SVG wrappers.
// Geometry and color are visually reviewed; these checks validate the actual asset contract.
export interface SvgValidationResult {
  valid: boolean;
  width: number;
  height: number;
  hasEmbeddedPng: boolean;
  embeddedPng: Buffer;
  forbiddenElementsFound: string[];
  errors: string[];
}

export function validateBrandLogoSvg(svgString: string): SvgValidationResult {
  const errors: string[] = [];
  const forbidden: string[] = [];
  const width = Number(svgString.match(/width=["'](\d+)["']/)?.[1] ?? 0);
  const height = Number(svgString.match(/height=["'](\d+)["']/)?.[1] ?? 0);
  const data = svgString.match(/href=["']data:image\/png;base64,([^"']+)["']/)?.[1];
  const embeddedPng = Buffer.from(data ?? '', 'base64');
  const hasEmbeddedPng = embeddedPng.length >= 24 &&
    embeddedPng.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!hasEmbeddedPng) errors.push('Missing valid embedded PNG');
  if (width <= 0 || width !== height) errors.push('Icon must have square nonzero dimensions');
  if (hasEmbeddedPng && (embeddedPng.readUInt32BE(16) !== width || embeddedPng.readUInt32BE(20) !== height)) {
    errors.push('PNG dimensions differ from SVG dimensions');
  }
  if (!svgString.includes('aria-label="KeepXClean shield and x"')) errors.push('Missing approved brand label');
  // Inspect markup, excluding binary data, for executable or remote content.
  const markup = svgString.replace(/data:image\/png;base64,[^"']+/g, '');
  for (const [name, pattern] of [
    ['script', /<script|onload=|onerror=/i],
    ['remote_image', /(?:href|src)=["']https?:/i],
    ['glow_filter', /<filter|<feGaussianBlur|drop-shadow/i],
    ['old_vector_mark', /<path/i],
  ] as const) {
    if (pattern.test(markup)) { forbidden.push(name); errors.push(`Disallowed SVG content: ${name}`); }
  }
  return { valid: errors.length === 0, width, height, hasEmbeddedPng, embeddedPng, forbiddenElementsFound: forbidden, errors };
}

// Brand CSS Tokens Validator
export interface CssTokensValidationResult {
  valid: boolean;
  errors: string[];
  tokensFound: Record<string, string>;
}

export function validateBrandTokens(cssContent: string): CssTokensValidationResult {
  const errors: string[] = [];
  const tokensFound: Record<string, string> = {};

  const expectedTokens: Record<string, string> = {
    '--canvas': '#f7f9f8',
    '--surface': '#fff',
    '--border': '#e1e7e3',
    '--green': '#13865f',
    '--green-hover': '#0f6e4e',
    '--selected': '#eaf6ef',
  };

  for (const [token, expectedVal] of Object.entries(expectedTokens)) {
    const regex = new RegExp(`${token}\\s*:\\s*([^;]+);`, 'i');
    const match = cssContent.match(regex);
    if (!match) {
      errors.push(`Missing brand token: ${token}`);
    } else {
      const val = match[1].trim().toLowerCase();
      tokensFound[token] = val;
      const normalizedExpected = expectedVal === '#fff' ? '#fff' : expectedVal;
      const normalizedVal = val === '#ffffff' ? '#fff' : val;
      if (normalizedVal !== normalizedExpected) {
        errors.push(`Token ${token} has value '${val}', expected '${expectedVal}'`);
      }
    }
  }

  // Check color-scheme light
  if (!cssContent.includes('color-scheme: light') && !cssContent.includes('color-scheme:light')) {
    errors.push('Missing color-scheme: light declaration');
  }

  return {
    valid: errors.length === 0,
    errors,
    tokensFound,
  };
}

// Fetch Interceptor for deterministic network testing
export interface MockRoute {
  url: string | RegExp;
  method?: string;
  response: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body: unknown;
  } | ((request: Request) => Promise<{ status?: number; body: unknown }>);
  networkError?: Error;
}

export class FetchMock {
  private routes: MockRoute[] = [];
  private originalFetch: typeof fetch | null = null;

  install(): void {
    if (!this.originalFetch) {
      this.originalFetch = globalThis.fetch;
    }
    globalThis.fetch = this.handleFetch.bind(this) as typeof fetch;
  }

  restore(): void {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    this.routes = [];
  }

  mock(route: MockRoute): void {
    this.routes.unshift(route); // Prepend to allow overrides
  }

  mockStats(data?: Partial<{ totalFlaggedAccounts: number; activeCrowdBlocked: number; totalVotes: number }>): void {
    this.mock({
      url: 'https://api.keepxclean.com/v1/stats',
      response: {
        status: 200,
        body: {
          ok: true,
          domain: 'keepxclean.com',
          totalFlaggedAccounts: data?.totalFlaggedAccounts ?? 1280,
          activeCrowdBlocked: data?.activeCrowdBlocked ?? 450,
          totalVotes: data?.totalVotes ?? 3890,
        },
      },
    });
  }

  mockStats500(): void {
    this.mock({
      url: 'https://api.keepxclean.com/v1/stats',
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        body: { ok: false, error: 'Database service unreachable' },
      },
    });
  }

  mockStatsNetworkError(): void {
    this.mock({
      url: 'https://api.keepxclean.com/v1/stats',
      networkError: new TypeError('Failed to fetch: Connection refused'),
      response: { status: 0, body: null },
    });
  }

  private async handleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

    const matched = this.routes.find((r) => {
      const matchUrl = typeof r.url === 'string' ? r.url === urlStr : r.url.test(urlStr);
      const matchMethod = !r.method || r.method.toUpperCase() === method.toUpperCase();
      return matchUrl && matchMethod;
    });

    if (!matched) {
      if (urlStr.includes('/v1/stats')) {
        return new Response(JSON.stringify({
          ok: true,
          domain: 'keepxclean.com',
          totalFlaggedAccounts: 1280,
          activeCrowdBlocked: 450,
          totalVotes: 3890,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false, error: 'Unmocked route' }), { status: 404 });
    }

    if (matched.networkError) {
      throw matched.networkError;
    }

    const resDef = typeof matched.response === 'function'
      ? await matched.response(new Request(urlStr, init))
      : matched.response;

    return new Response(JSON.stringify(resDef.body), {
      status: resDef.status ?? 200,
      statusText: resDef.statusText ?? 'OK',
      headers: { 'Content-Type': 'application/json', ...(resDef.headers ?? {}) },
    });
  }
}
