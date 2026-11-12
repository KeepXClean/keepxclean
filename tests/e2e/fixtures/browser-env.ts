/**
 * KeepXClean In-Memory Browser Environment & Verification Fixtures
 *
 * Implements:
 * - High performance virtual DOM environment using JSDOM
 * - Deterministic timer advancement (advanceTimersByTime)
 * - prefers-reduced-motion simulator
 * - Brand SVG geometric validator (512x512, rx=21.875% = 112, black titanium, 0 shield/glow/ring)
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

// Brand SVG Geometric Validator
export interface SvgValidationResult {
  valid: boolean;
  rxRatio: number;
  width: number;
  height: number;
  hasTitaniumGradient: boolean;
  hasSilverEdge: boolean;
  forbiddenElementsFound: string[];
  errors: string[];
}

export function validateBrandLogoSvg(svgString: string): SvgValidationResult {
  const errors: string[] = [];
  const forbidden: string[] = [];

  // Check dimensions and viewBox
  const viewBoxMatch = svgString.match(/viewBox=["']0 0 (\d+) (\d+)["']/i);
  const widthMatch = svgString.match(/width=["'](\d+)["']/i);
  const heightMatch = svgString.match(/height=["'](\d+)["']/i);

  const width = widthMatch ? parseInt(widthMatch[1], 10) : viewBoxMatch ? parseInt(viewBoxMatch[1], 10) : 512;
  const height = heightMatch ? parseInt(heightMatch[1], 10) : viewBoxMatch ? parseInt(viewBoxMatch[2], 10) : 512;

  // Background rect corner radius check
  // Looking for <rect width="512" height="512" rx="112" fill="#EAF6EF"/>
  const rectMatch = svgString.match(/<rect[^>]*width=["'](\d+)["'][^>]*rx=["'](\d+)["'][^>]*fill=["']([^"']+)["']/i) ||
                    svgString.match(/<rect[^>]*rx=["'](\d+)["'][^>]*fill=["']([^"']+)["']/i);

  let rxRatio = 0;
  if (rectMatch) {
    const rx = parseFloat(rectMatch[1] === '512' ? rectMatch[2] : rectMatch[1]);
    rxRatio = rx / width;
    // Expected: 112 / 512 = 0.21875 (21.875%)
    if (Math.abs(rxRatio - 0.21875) > 0.001) {
      errors.push(`Corner radius ratio rx/width is ${rxRatio.toFixed(5)}, expected exactly 0.21875 (21.875%)`);
    }

    const fill = (rectMatch[3] ?? rectMatch[2]).toUpperCase();
    if (fill !== '#EAF6EF') {
      errors.push(`Background rect fill is ${fill}, expected solid #EAF6EF`);
    }
  } else {
    // Check fallback pattern
    if (svgString.includes('rx="112"')) {
      rxRatio = 112 / width;
    } else {
      errors.push('Background rect with rx and fill not found');
    }
  }

  // Titanium Gradient check
  const hasTitaniumGradient = (
    svgString.includes('id="titanium"') || svgString.includes("id='titanium'")
  ) && (
    svgString.includes('#6B7577') || svgString.includes('#3D4547') || svgString.includes('#090D0E')
  );
  if (!hasTitaniumGradient) {
    errors.push('Missing official black titanium gradient definition');
  }

  // Silver edge highlight gradient check
  const hasSilverEdge = (
    svgString.includes('id="edge"') || svgString.includes("id='edge'")
  ) && (
    svgString.includes('#CDD6D5') || svgString.includes('#849091') || svgString.includes('#0A0F10')
  );
  if (!hasSilverEdge) {
    errors.push('Missing official silver edge highlight gradient definition');
  }

  // Prohibitions: No shield, no circular ring, no glow filter, no starbursts
  const forbiddenPatterns = [
    { name: 'shield', regex: /shield|d="[^"]*shield/i },
    { name: 'circle_ring', regex: /<circle|<ellipse/i },
    { name: 'glow_filter', regex: /<filter|<feGaussianBlur|drop-shadow/i },
    { name: 'starburst', regex: /starburst|sparkle/i },
  ];

  for (const p of forbiddenPatterns) {
    if (p.regex.test(svgString)) {
      forbidden.push(p.name);
      errors.push(`Brand violation: forbidden element detected (${p.name})`);
    }
  }

  return {
    valid: errors.length === 0,
    rxRatio,
    width,
    height,
    hasTitaniumGradient,
    hasSilverEdge,
    forbiddenElementsFound: forbidden,
    errors,
  };
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
