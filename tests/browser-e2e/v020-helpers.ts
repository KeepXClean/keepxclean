/**
 * Reusable Real-Chromium MV3 E2E helpers, fixtures, and resilient 4-tier locators
 * for KeepXClean v0.2.0 (`tests/browser-e2e/extension.smoke.ts`).
 *
 * Strictly typed and ESLint-10-clean (no `use*` helpers, `{ cause }` on rethrows,
 * zero `@ts-ignore` / `eslint-disable`).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BrowserContext, FileChooser, Locator, Page, Worker } from 'playwright-core';

// ---------------------------------------------------------------------------
// Typed Storage, Window & Manifest Contracts
// ---------------------------------------------------------------------------

export interface KxcE2eWindow extends Window {
  __kxcSetClockOffsetMs?: (ms: number) => void;
  __kxcCopiedDiagnostic?: string;
  __kxcClipboardCalls?: string[];
  __kxcCanvasTexts?: string[];
}

export interface StoredKeywordRuleItem {
  id: string;
  pattern: string;
  isRegex: boolean;
  scopes: string[];
  onlyInReplies?: boolean;
  maxFollowersExempt?: number;
  note?: string;
  enabled: boolean;
}

export interface StoredDomainRuleItem {
  id: string;
  domain: string;
  onlyInReplies?: boolean;
  maxFollowersExempt?: number;
  note?: string;
  enabled: boolean;
}

export interface StoredAccountListEntry {
  uid: string;
  screenName: string;
  name?: string;
  reason?: string;
  addedAt: number;
}

export interface RulePackPayloadV1 {
  format: 'kxc-pack-v1';
  id: string;
  name: string;
  description: string;
  author?: string;
  version: string;
  locale?: string;
  updatedAt: string;
  keywords?: StoredKeywordRuleItem[];
  domains?: StoredDomainRuleItem[];
  blockedUids?: StoredAccountListEntry[];
}

export interface StoredInstalledRulePack extends RulePackPayloadV1 {
  enabled: boolean;
  installedAt: number;
  disabledItemIds?: string[];
}

export interface StoredFilterConfig {
  version?: number;
  enabled?: boolean;
  preset?: string;
  interceptionMode?: string;
  exemptFollowing?: boolean;
  syncNativeXBlock?: boolean;
  enableCrowdReport?: boolean;
  onboardingDismissed?: boolean;
  theme?: string;
  localBlocklistUids?: Record<string, unknown>;
  whitelistUids?: Record<string, unknown>;
  installedPacks?: StoredInstalledRulePack[];
  rules?: {
    keywords?: {
      enabled?: boolean;
      items?: StoredKeywordRuleItem[];
    };
    domainFilter?: {
      enabled?: boolean;
      items?: StoredDomainRuleItem[];
    };
    grokFilter?: {
      enabled?: boolean;
      protectOfficialGrok?: boolean;
      blockShortMentions?: boolean;
      maxMentionWeightedLength?: number;
      hideGrokReplies?: boolean;
    };
  };
}

export interface StoredInterceptionLogEntry {
  id: string;
  tweetId: string;
  authorUid: string;
  authorScreenName: string;
  authorName: string;
  authorAvatar?: string;
  tweetSnippet: string;
  scene: 'timeline' | 'reply' | 'search' | 'profile';
  ruleId: string;
  reasonText: string;
  timestamp: number;
  evidence?: Array<{ key?: string; label: string; value: string | number | boolean }>;
}

export interface StoredStats {
  todayDate?: string;
  todayBlocked?: number;
  totalBlocked?: number;
  todayAdsHidden?: number;
  totalAdsHidden?: number;
  byRule?: Record<string, number>;
  partialDay?: string;
  dailyHistory?: Array<{ date: string; blocked: number; ads: number }>;
}

export interface StoredParseHealthState {
  status?: 'ok' | 'degraded';
  consecutiveZeroCount?: number;
  firstFailureAt?: number;
  lastFailureAt?: number;
  endpoints?: string[];
  topKeys?: string[];
  dismissedAt?: number;
}

interface BuiltManifest {
  manifest_version?: unknown;
  version?: unknown;
  permissions?: unknown;
  background?: {
    service_worker?: unknown;
    scripts?: unknown;
  };
  browser_specific_settings?: {
    gecko?: {
      id?: unknown;
      strict_min_version?: unknown;
    };
  };
}

export interface VerifiedManifestsResult {
  chromeManifestPath: string;
  firefoxManifestPath: string;
  version: string;
}

export interface MockTweetEntryOptions {
  restId: string;
  authorRestId: string;
  screenName: string;
  name: string;
  text: string;
  createdAt?: string;
  statusesCount?: number;
  followersCount?: number;
  friendsCount?: number;
  following?: boolean;
  defaultProfileImage?: boolean;
  description?: string;
  inReplyToStatusId?: string;
  inReplyToUserId?: string;
  lang?: string;
  isBlueVerified?: boolean;
  urls?: Array<{ expanded_url: string; display_url?: string; url?: string }>;
}

export interface MockXHtmlCell {
  cellId: string;
  screenName: string;
  displayName: string;
  tweetId: string;
  text: string;
  timeLabel?: string;
}

export interface BattleReportMetrics {
  width: number;
  height: number;
  decodedBytes: number;
  opaqueRatio: number;
  distinctColorBuckets: number;
  highContrastRatio: number;
  avgCornerLuminance: number;
  paintedTextCount: number;
}

// ---------------------------------------------------------------------------
// Core Assertion & Async Polling Primitives
// ---------------------------------------------------------------------------

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPageTarget(target: Page | Worker): target is Page {
  return 'locator' in target;
}

/**
 * Reads a key from `chrome.storage.local` via either a Playwright `Page` (extension origin)
 * or MV3 `Worker` (service worker). Explicitly narrows `Page | Worker` before `.evaluate()`
 * to satisfy TypeScript 5.9 strict overload resolution.
 */
export async function getStorageLocal<T>(
  target: Page | Worker,
  key: string
): Promise<T | undefined> {
  if (isPageTarget(target)) {
    return target.evaluate(async (storageKey: string) => {
      const data = await chrome.storage.local.get(storageKey);
      return data[storageKey] as T | undefined;
    }, key);
  }
  return target.evaluate(async (storageKey: string) => {
    const data = await chrome.storage.local.get(storageKey);
    return data[storageKey] as T | undefined;
  }, key);
}

/**
 * Polls `chrome.storage.local` from Node via the MV3 Service Worker without opening any
 * extension UI tab (essential for fresh-install / zero-auto-tab assertions).
 */
export async function waitForStorageLocalInWorker<T>(
  worker: Worker,
  key: string,
  predicate: (val: T | undefined) => boolean,
  timeoutMs = 10_000,
  label = key
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  let lastVal: T | undefined;
  while (Date.now() < deadline) {
    lastVal = await getStorageLocal<T>(worker, key);
    if (predicate(lastVal)) {
      return lastVal;
    }
    await sleep(50);
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for storage "${key}" (${label}). Last value: ${JSON.stringify(lastVal)}`
  );
}

/**
 * Sends a typed `KXC_COMMAND` message from an extension page (`popup.html` or `options.html`)
 * to the MV3 Service Worker and validates `{ ok: true }`.
 */
export async function sendKxcCommand<T = unknown>(
  extPage: Page,
  action: Record<string, unknown>
): Promise<T> {
  const result = await extPage.evaluate(async (payload: Record<string, unknown>) => {
    return new Promise<{ ok: boolean; data?: unknown; error?: string }>((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'KXC_COMMAND', action: payload },
        (res?: { ok?: boolean; data?: unknown; error?: string }) => {
          const runtimeError = chrome.runtime.lastError?.message;
          if (runtimeError) {
            resolve({ ok: false, error: runtimeError });
            return;
          }
          if (!res || res.ok !== true) {
            resolve({ ok: false, error: res?.error ?? 'KXC_COMMAND failed without error message' });
            return;
          }
          resolve({ ok: true, data: res.data });
        }
      );
    });
  }, action);

  assert(
    result.ok,
    `KXC_COMMAND (${String(action.type ?? 'unknown')}) failed: ${result.error ?? 'unknown error'}`
  );
  return result.data as T;
}

/**
 * Hardened MAIN + ISOLATED content-script sync barrier on simulated `x.com` pages.
 * Requires BOTH:
 * 1. `document.querySelector('kxc-main-ui') !== null` (proves ISOLATED `content.ts`
 *    event listeners & `DomController` are mounted — immune to stale `localStorage` from
 *    earlier scenarios in the same persistent `BrowserContext`), AND
 * 2. `JSON.parse(localStorage.getItem('__kxc_fast_boot_cache_v1__') || 'null')?.config`
 *    satisfies `predicate` (proves MAIN `page-interceptor.content.ts` ingested the config).
 */
export async function waitForMainConfigSync(
  xPage: Page,
  predicate: (config: StoredFilterConfig) => boolean,
  timeoutMs = 10_000,
  label = 'MAIN/ISOLATED config sync'
): Promise<StoredFilterConfig> {
  const deadline = Date.now() + timeoutMs;
  let lastMainUiMounted = false;
  let lastConfig: StoredFilterConfig | null = null;

  while (Date.now() < deadline) {
    const snapshot = await xPage.evaluate(() => {
      const mainUiMounted = document.querySelector('kxc-main-ui') !== null;
      const raw = window.localStorage.getItem('__kxc_fast_boot_cache_v1__');
      let config: StoredFilterConfig | null = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { config?: StoredFilterConfig } | null;
          if (parsed && typeof parsed.config === 'object' && parsed.config !== null) {
            config = parsed.config;
          }
        } catch {
          config = null;
        }
      }
      return { mainUiMounted, config };
    });

    lastMainUiMounted = snapshot.mainUiMounted;
    lastConfig = snapshot.config;

    if (snapshot.mainUiMounted && snapshot.config && predicate(snapshot.config)) {
      return snapshot.config;
    }
    await sleep(50);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${label} (kxc-main-ui mounted=${String(lastMainUiMounted)}, cached config=${JSON.stringify(lastConfig)})`
  );
}

/**
 * Closes all open `chrome-extension://${extensionId}/` tabs cleanly before deep-link
 * verification so `context.waitForEvent('page')` reliably captures newly created tabs.
 */
export async function closeExtensionPages(
  context: BrowserContext,
  extensionId: string
): Promise<void> {
  const prefix = `chrome-extension://${extensionId}/`;
  for (const page of context.pages()) {
    if (!page.isClosed() && page.url().startsWith(prefix)) {
      await page.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Typed GraphQL, HTML & Rule Pack Builders
// ---------------------------------------------------------------------------

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildMockTweetEntry(opts: MockTweetEntryOptions): Record<string, unknown> {
  const following = Boolean(opts.following);
  const tweetLegacy: Record<string, unknown> = {
    id_str: opts.restId,
    full_text: opts.text,
    lang: opts.lang ?? 'en',
    entities: {
      hashtags: [],
      symbols: [],
      urls: opts.urls ?? [],
    },
  };
  if (opts.inReplyToStatusId !== undefined) {
    tweetLegacy.in_reply_to_status_id_str = opts.inReplyToStatusId;
  }
  if (opts.inReplyToUserId !== undefined) {
    tweetLegacy.in_reply_to_user_id_str = opts.inReplyToUserId;
  }

  return {
    entryId: `tweet-${opts.restId}`,
    content: {
      entryType: 'TimelineTimelineItem',
      itemContent: {
        itemType: 'TimelineTweet',
        tweet_results: {
          result: {
            __typename: 'Tweet',
            rest_id: opts.restId,
            legacy: tweetLegacy,
            core: {
              user_results: {
                result: {
                  rest_id: opts.authorRestId,
                  is_blue_verified: Boolean(opts.isBlueVerified),
                  relationship_perspectives: {
                    following,
                  },
                  legacy: {
                    screen_name: opts.screenName,
                    name: opts.name,
                    description: opts.description ?? 'Software engineer and open-source contributor.',
                    created_at: opts.createdAt ?? 'Mon Jan 01 00:00:00 +0000 2020',
                    statuses_count: opts.statusesCount ?? 350,
                    followers_count: opts.followersCount ?? 1800,
                    friends_count: opts.friendsCount ?? 240,
                    following,
                    default_profile_image: Boolean(opts.defaultProfileImage),
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function buildMockHomeTimelinePayload(entries: unknown[]): Record<string, unknown> {
  return {
    data: {
      home: {
        home_timeline_urt: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries,
            },
          ],
        },
      },
    },
  };
}

export function buildMockTweetDetailPayload(entries: unknown[]): Record<string, unknown> {
  return {
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [
          {
            type: 'TimelineAddEntries',
            entries,
          },
        ],
      },
    },
  };
}

export function buildMockXHtml(cells: MockXHtmlCell[], title = 'Home / X'): string {
  const cellsMarkup = cells
    .map(
      (cell) => `    <div data-testid="cellInnerDiv" id="${escapeHtml(cell.cellId)}">
      <article data-testid="tweet">
        <div data-testid="User-Name">
          <span>${escapeHtml(cell.displayName)}</span>
          <a href="/${escapeHtml(cell.screenName)}/status/${escapeHtml(cell.tweetId)}"><time>${escapeHtml(cell.timeLabel ?? '1m')}</time></a>
        </div>
        <button data-testid="caret" aria-label="More">...</button>
        <div data-testid="tweetText">${escapeHtml(cell.text)}</div>
      </article>
    </div>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en" style="color-scheme: light;">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="background-color: rgb(255, 255, 255);">
  <main>
${cellsMarkup}
  </main>
</body>
</html>`;
}

export function buildBrokenHomeTimelinePayload(): Record<string, unknown> {
  return {
    data: {
      home_v99_renamed: {
        new_timeline_container: {
          items_v2: [],
          secret_user_text: 'DO_NOT_LEAK_PII_TOKEN_888',
          author_handle: '@secret_health_user',
          cookie_canary: 'ct0=secret_csrf_123; twid=u%3D999888',
        },
      },
    },
  };
}

export function buildValidRulePackV1(): RulePackPayloadV1 {
  return {
    format: 'kxc-pack-v1',
    id: 'e2e-topic-pack-1',
    name: 'E2E Anti-Scam Pack',
    description: 'Offline shareable rule pack for KeepXClean v0.2.0 browser E2E verification.',
    author: 'KeepXClean E2E',
    version: '1.0.0',
    locale: 'en',
    updatedAt: '2026-11-25T00:00:00.000Z',
    keywords: [
      {
        id: 'pack-kw-1',
        pattern: 'quantum-rugpull-token',
        isRegex: false,
        scopes: ['text'],
        note: 'E2E pack keyword rule',
        enabled: true,
      },
    ],
    domains: [
      {
        id: 'pack-dom-1',
        domain: 'scam-pack-demo.example',
        note: 'E2E pack domain rule',
        enabled: true,
      },
    ],
    blockedUids: [
      {
        uid: '999888777666',
        screenName: 'scam_pack_demo_bot',
        name: 'Scam Pack Demo Bot',
        reason: 'E2E pack blocked account',
        addedAt: 1764028800000,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenario 7: Built Chrome & Firefox MV3 Manifest Verification
// ---------------------------------------------------------------------------

function readJsonManifest(filePath: string, targetLabel: string, rebuildHint: string): BuiltManifest {
  assert(
    fs.existsSync(filePath),
    `Built ${targetLabel} MV3 manifest not found at ${filePath}. Run ${rebuildHint} first.`
  );
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    const parsed: unknown = JSON.parse(raw);
    assert(
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed),
      `Expected JSON object in ${targetLabel} manifest at ${filePath}`
    );
    return parsed as BuiltManifest;
  } catch (err) {
    throw new Error(`Invalid JSON in ${targetLabel} manifest at ${filePath}`, { cause: err });
  }
}

function assertSharedManifestContract(manifest: BuiltManifest, targetLabel: string): void {
  assert(
    manifest.manifest_version === 3,
    `Expected ${targetLabel} manifest_version to be 3, got ${JSON.stringify(manifest.manifest_version)}`
  );
  assert(
    manifest.version === '0.2.0',
    `Expected ${targetLabel} MV3 manifest version to be "0.2.0", got "${String(manifest.version)}". Bump apps/extension/package.json to "0.2.0" and rebuild with "pnpm --filter @keepxclean/extension zip" and "pnpm --filter @keepxclean/extension build:firefox".`
  );
  assert(
    Array.isArray(manifest.permissions) &&
      manifest.permissions.every((p): p is string => typeof p === 'string'),
    `Expected ${targetLabel} MV3 manifest permissions to be a string array, got ${JSON.stringify(manifest.permissions)}`
  );
  const sortedPermissions = [...manifest.permissions].sort();
  assert(
    sortedPermissions.length === 2 &&
      sortedPermissions[0] === 'alarms' &&
      sortedPermissions[1] === 'storage',
    `Expected ${targetLabel} MV3 permissions strictly ["alarms","storage"], got ${JSON.stringify(sortedPermissions)}`
  );
}

/**
 * Verifies both Chrome MV3 and Firefox MV3 built manifests BEFORE launching Chromium.
 * Enforces strict v0.2.0 version, MV3 format, zero-extra-permissions (`['alarms', 'storage']`),
 * Chrome background service worker, and Firefox Gecko ID / min version / scripts.
 */
export function verifyBuiltManifests(rootDir: string): VerifiedManifestsResult {
  const chromeManifestPath = path.join(rootDir, 'apps/extension/.output/chrome-mv3/manifest.json');
  const firefoxManifestPath = path.join(rootDir, 'apps/extension/.output/firefox-mv3/manifest.json');

  const chromeManifest = readJsonManifest(
    chromeManifestPath,
    'Chrome',
    '"pnpm --filter @keepxclean/extension zip" (or "pnpm --filter @keepxclean/extension build")'
  );
  const firefoxManifest = readJsonManifest(
    firefoxManifestPath,
    'Firefox',
    '"pnpm --filter @keepxclean/extension build:firefox"'
  );

  assertSharedManifestContract(chromeManifest, 'Chrome');
  assertSharedManifestContract(firefoxManifest, 'Firefox');

  assert(
    chromeManifest.background?.service_worker === 'background.js',
    `Expected Chrome MV3 background.service_worker === "background.js", got ${JSON.stringify(chromeManifest.background)}`
  );

  const gecko = firefoxManifest.browser_specific_settings?.gecko;
  assert(
    gecko?.id === 'keepxclean@keepxclean.com',
    `Expected Firefox MV3 browser_specific_settings.gecko.id === "keepxclean@keepxclean.com", got ${JSON.stringify(gecko)}`
  );
  assert(
    typeof gecko.strict_min_version === 'string' && gecko.strict_min_version.trim().length > 0,
    `Expected non-empty Firefox MV3 browser_specific_settings.gecko.strict_min_version, got ${JSON.stringify(gecko.strict_min_version)}`
  );
  assert(
    Array.isArray(firefoxManifest.background?.scripts) &&
      firefoxManifest.background.scripts.includes('background.js'),
    `Expected Firefox MV3 background.scripts to include "background.js", got ${JSON.stringify(firefoxManifest.background)}`
  );

  return {
    chromeManifestPath,
    firefoxManifestPath,
    version: '0.2.0',
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Popup Onboarding Card 4-Tier Locators
// ---------------------------------------------------------------------------

/**
 * Pure non-mutating check for whether the fresh-install Onboarding Card is currently
 * visible inside `.popup-body` (strictly excluding `QuickControls` landmarks while
 * allowing either `.popup-body` sibling or first-child-of-`.compact.stack` placement).
 */
export async function hasOnboardingCard(popupPage: Page): Promise<boolean> {
  return popupPage.evaluate(() => {
    const body = document.querySelector('.popup-body');
    if (!body) return false;

    const explicitEls = body.querySelectorAll<HTMLElement>(
      '[data-kxc-onboarding], [data-testid="onboarding-card"], .onboarding-card'
    );
    for (const explicit of explicitEls) {
      const explicitRect = explicit.getBoundingClientRect();
      let explicitVisible = explicitRect.width > 0 && explicitRect.height > 0;
      for (
        let cur: HTMLElement | null = explicit;
        explicitVisible && cur;
        cur = cur.parentElement
      ) {
        const cs = window.getComputedStyle(cur);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          explicitVisible = false;
        }
      }
      if (explicitVisible) {
        return true;
      }
    }

    const candidates = [
      ...body.querySelectorAll<HTMLElement>('section, article, .panel, .banner, div'),
    ];
    const importRe = /import/i;
    const dismissRe = /dismiss|skip|got it|done|close|finish/i;
    const lightRe = /light/i;
    const strictRe = /strict/i;
    const collapseRe = /collapse/i;
    const hideRe = /hide|strip/i;

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      let elVisible = rect.width > 0 && rect.height > 0;
      for (let cur: HTMLElement | null = el; elVisible && cur; cur = cur.parentElement) {
        const cs = window.getComputedStyle(cur);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          elVisible = false;
        }
      }
      if (!elVisible) {
        continue;
      }
      if (
        el.classList.contains('compact') ||
        el.querySelector('.stats-strip, form, .recent-list') ||
        el.closest('.stats-strip, form, .recent-list')
      ) {
        continue;
      }

      let hasImport = false;
      let hasDismiss = false;
      let hasLight = false;
      let hasStrict = false;
      let hasCollapse = false;
      let hasHide = false;

      for (const ctrl of el.querySelectorAll<HTMLElement>('button, a')) {
        let ctrlVisible = true;
        for (let p: HTMLElement | null = ctrl; ctrlVisible && p && p !== el; p = p.parentElement) {
          const pcs = window.getComputedStyle(p);
          if (
            pcs.display === 'none' ||
            pcs.visibility === 'hidden' ||
            !(Number.parseFloat(pcs.opacity) > 0)
          ) {
            ctrlVisible = false;
          }
        }
        if (!ctrlVisible) continue;
        const desc = `${ctrl.textContent ?? ''} ${ctrl.getAttribute('aria-label') ?? ''} ${ctrl.getAttribute('title') ?? ''}`.trim();
        if (importRe.test(desc)) hasImport = true;
        if (ctrl.tagName === 'BUTTON') {
          if (dismissRe.test(desc)) hasDismiss = true;
          if (lightRe.test(desc)) hasLight = true;
          if (strictRe.test(desc)) hasStrict = true;
          if (collapseRe.test(desc)) hasCollapse = true;
          if (hideRe.test(desc)) hasHide = true;
        }
      }

      if (hasImport && hasDismiss && hasLight && hasStrict && hasCollapse && hasHide) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Locates the tightest visible Onboarding Card container strictly inside `.popup-body`,
 * requiring all 4 onboarding step signals (presets, display mode, import, dismiss) so an
 * inner footer row cannot hijack selection, while supporting both `.popup-body` sibling
 * and first-child-of-`.compact.stack` placement.
 */
export async function locateOnboardingCard(popupPage: Page): Promise<Locator> {
  const stamped = await popupPage.evaluate(() => {
    const body = document.querySelector('.popup-body');
    if (!body) return false;

    for (const prev of document.querySelectorAll('[data-e2e-onboarding-card]')) {
      prev.removeAttribute('data-e2e-onboarding-card');
    }

    const explicitEls = body.querySelectorAll<HTMLElement>(
      '[data-kxc-onboarding], [data-testid="onboarding-card"], .onboarding-card'
    );
    for (const explicit of explicitEls) {
      const explicitRect = explicit.getBoundingClientRect();
      let explicitVisible = explicitRect.width > 0 && explicitRect.height > 0;
      for (
        let cur: HTMLElement | null = explicit;
        explicitVisible && cur;
        cur = cur.parentElement
      ) {
        const cs = window.getComputedStyle(cur);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          explicitVisible = false;
        }
      }
      if (explicitVisible) {
        explicit.setAttribute('data-e2e-onboarding-card', 'true');
        return true;
      }
    }

    const candidates = [
      ...body.querySelectorAll<HTMLElement>('section, article, .panel, .banner, div'),
    ];
    const importRe = /import/i;
    const dismissRe = /dismiss|skip|got it|done|close|finish/i;
    const lightRe = /light/i;
    const strictRe = /strict/i;
    const collapseRe = /collapse/i;
    const hideRe = /hide|strip/i;

    let best: HTMLElement | null = null;
    let bestDepth = -1;
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      let elVisible = rect.width > 0 && rect.height > 0;
      for (let cur: HTMLElement | null = el; elVisible && cur; cur = cur.parentElement) {
        const cs = window.getComputedStyle(cur);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          elVisible = false;
        }
      }
      if (!elVisible) {
        continue;
      }
      if (
        el.classList.contains('compact') ||
        el.querySelector('.stats-strip, form, .recent-list') ||
        el.closest('.stats-strip, form, .recent-list')
      ) {
        continue;
      }

      let hasImport = false;
      let hasDismiss = false;
      let hasLight = false;
      let hasStrict = false;
      let hasCollapse = false;
      let hasHide = false;

      for (const ctrl of el.querySelectorAll<HTMLElement>('button, a')) {
        let ctrlVisible = true;
        for (let p: HTMLElement | null = ctrl; ctrlVisible && p && p !== el; p = p.parentElement) {
          const pcs = window.getComputedStyle(p);
          if (
            pcs.display === 'none' ||
            pcs.visibility === 'hidden' ||
            !(Number.parseFloat(pcs.opacity) > 0)
          ) {
            ctrlVisible = false;
          }
        }
        if (!ctrlVisible) continue;
        const desc = `${ctrl.textContent ?? ''} ${ctrl.getAttribute('aria-label') ?? ''} ${ctrl.getAttribute('title') ?? ''}`.trim();
        if (importRe.test(desc)) hasImport = true;
        if (ctrl.tagName === 'BUTTON') {
          if (dismissRe.test(desc)) hasDismiss = true;
          if (lightRe.test(desc)) hasLight = true;
          if (strictRe.test(desc)) hasStrict = true;
          if (collapseRe.test(desc)) hasCollapse = true;
          if (hideRe.test(desc)) hasHide = true;
        }
      }

      if (!hasImport || !hasDismiss || !hasLight || !hasStrict || !hasCollapse || !hasHide) {
        continue;
      }

      let depth = 0;
      for (let p: HTMLElement | null = el; p && p !== body; p = p.parentElement) {
        depth += 1;
      }
      if (depth > bestDepth) {
        bestDepth = depth;
        best = el;
      }
    }

    if (!best) return false;
    best.setAttribute('data-e2e-onboarding-card', 'true');
    return true;
  });

  assert(
    stamped,
    'Onboarding card not found inside .popup-body (expected dedicated card containing preset + display mode + Import + Dismiss controls, strictly separate from QuickControls)'
  );
  return popupPage.locator('[data-e2e-onboarding-card="true"]').first();
}

// ---------------------------------------------------------------------------
// Scenario 3: Collapse-Bar Shadow DOM Action Helpers & Deep-Link Highlight Check
// ---------------------------------------------------------------------------

/**
 * Inspects `.collapse-bar[data-expanded="true"] .collapse-actions button` strictly
 * inside `#${cellId} kxc-inline[data-kxc-kind="collapse"]`'s ShadowRoot.
 * NEVER touches `.collapse-summary`!
 */
export async function findCollapseActionButton(
  xPage: Page,
  cellId: string,
  action: 'adjust' | 'disable'
): Promise<{ found: boolean; label: string; availableLabels: string[] }> {
  return xPage.evaluate(
    ({ cid, act }) => {
      const host = document.querySelector(`#${cid} kxc-inline[data-kxc-kind="collapse"]`);
      const actionsBar = host?.shadowRoot?.querySelector(
        '.collapse-bar[data-expanded="true"] .collapse-actions'
      );
      if (!actionsBar) {
        return { found: false, label: '', availableLabels: [] };
      }

      const buttons = [...actionsBar.querySelectorAll<HTMLButtonElement>('button')];
      const availableLabels: string[] = [];
      for (const b of buttons) {
        availableLabels.push(
          `${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''}`.trim()
        );
      }

      const explicitSel =
        act === 'adjust'
          ? '[data-kxc-action="adjust"], [data-testid="collapse-adjust-rule"]'
          : '[data-kxc-action="disable"], [data-testid="collapse-disable-item"]';
      const explicit = actionsBar.querySelector<HTMLButtonElement>(explicitSel);
      if (explicit) {
        const explicitLabel =
          `${explicit.textContent ?? ''} ${explicit.getAttribute('aria-label') ?? ''} ${explicit.getAttribute('title') ?? ''}`.trim();
        return { found: true, label: explicitLabel, availableLabels };
      }

      for (let i = 0; i < buttons.length; i += 1) {
        const d = availableLabels[i];
        if (/^(hide|collapse|allow|whitelist|block|unblock)\b/i.test(d)) continue;
        if (act === 'adjust') {
          if (/disable|turn off|mute off|deactivate|pause/i.test(d)) continue;
          if (/adjust|edit rule|tune|manage rule|rule settings|open rule|settings|\brule\b/i.test(d)) {
            return { found: true, label: d, availableLabels };
          }
        } else if (
          /disable|turn off|mute off|deactivate|pause (this )?(item|keyword|rule|term)/i.test(d)
        ) {
          return { found: true, label: d, availableLabels };
        }
      }

      return { found: false, label: '', availableLabels };
    },
    { cid: cellId, act: action }
  );
}

/**
 * Clicks the matched action button (`'adjust'` or `'disable'`) strictly inside
 * `.collapse-bar[data-expanded="true"] .collapse-actions` in Shadow DOM.
 */
export async function clickCollapseActionButton(
  xPage: Page,
  cellId: string,
  action: 'adjust' | 'disable'
): Promise<string> {
  const result = await xPage.evaluate(
    ({ cid, act }) => {
      const host = document.querySelector(`#${cid} kxc-inline[data-kxc-kind="collapse"]`);
      const actionsBar = host?.shadowRoot?.querySelector(
        '.collapse-bar[data-expanded="true"] .collapse-actions'
      );
      if (!actionsBar) {
        return { clicked: false, label: '', availableLabels: [] as string[] };
      }

      const buttons = [...actionsBar.querySelectorAll<HTMLButtonElement>('button')];
      const availableLabels: string[] = [];
      for (const b of buttons) {
        availableLabels.push(
          `${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''}`.trim()
        );
      }

      const explicitSel =
        act === 'adjust'
          ? '[data-kxc-action="adjust"], [data-testid="collapse-adjust-rule"]'
          : '[data-kxc-action="disable"], [data-testid="collapse-disable-item"]';
      let target = actionsBar.querySelector<HTMLButtonElement>(explicitSel);
      let targetLabel = target
        ? `${target.textContent ?? ''} ${target.getAttribute('aria-label') ?? ''} ${target.getAttribute('title') ?? ''}`.trim()
        : '';

      if (!target) {
        for (let i = 0; i < buttons.length; i += 1) {
          const d = availableLabels[i];
          if (/^(hide|collapse|allow|whitelist|block|unblock)\b/i.test(d)) continue;
          if (act === 'adjust') {
            if (/disable|turn off|mute off|deactivate|pause/i.test(d)) continue;
            if (
              /adjust|edit rule|tune|manage rule|rule settings|open rule|settings|\brule\b/i.test(d)
            ) {
              target = buttons[i];
              targetLabel = d;
              break;
            }
          } else if (
            /disable|turn off|mute off|deactivate|pause (this )?(item|keyword|rule|term)/i.test(d)
          ) {
            target = buttons[i];
            targetLabel = d;
            break;
          }
        }
      }

      if (!target) {
        return { clicked: false, label: '', availableLabels };
      }

      target.click();
      return { clicked: true, label: targetLabel, availableLabels };
    },
    { cid: cellId, act: action }
  );

  assert(
    result.clicked,
    `Failed to click "${action}" action button in #${cellId} expanded collapse bar. Available .collapse-actions buttons: ${JSON.stringify(result.availableLabels)}`
  );
  return result.label;
}

/**
 * Immediately polls up to `timeoutMs` (default 2500ms) for the deep-linked keyword row
 * to be visible inside the viewport AND exhibit at least 1 of 6 genuine focus/highlight
 * signals (explicit data-focused/data-highlighted attribute, descendant attribute,
 * focus/highlight/pulse class, active CSS animation on row or cell, DOM focus, or inline
 * background/outline/box-shadow highlight).
 */
export async function waitForFocusedKeywordRow(
  deepLinkPage: Page,
  itemId: string,
  patternText: string,
  timeoutMs = 2_500
): Promise<{ signal: string; className: string; animationName: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot: Record<string, unknown> = { found: false };

  while (Date.now() < deadline) {
    const snap = await deepLinkPage.evaluate(
      ({ id, pattern }) => {
        const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id;
        const explicitRow = document.querySelector<HTMLElement>(
          `tr[data-item-id="${escapedId}"], tr[data-focus-id="${escapedId}"], tr[data-keyword-id="${escapedId}"], [data-item-id="${escapedId}"], [data-focus-id="${escapedId}"]`
        );
        const row =
          explicitRow ??
          [...document.querySelectorAll<HTMLElement>('tbody tr')].find((tr) =>
            (tr.textContent ?? '').includes(pattern)
          ) ??
          null;

        if (!row) {
          return { found: false, inViewport: false, signal: '', className: '', animationName: '' };
        }

        const style = window.getComputedStyle(row);
        const rect = row.getBoundingClientRect();
        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0;
        const inViewport =
          visible && rect.top >= -2 && rect.bottom <= window.innerHeight + 2;

        const tdAnimations = [...row.querySelectorAll<HTMLElement>('td')]
          .map((td) => window.getComputedStyle(td).animationName)
          .filter((name) => name && name !== 'none');

        let signal = '';
        if (row.matches('[data-focused="true"], [data-highlighted="true"], [data-focus="true"]')) {
          signal = 'data-focused-attr';
        } else if (
          row.querySelector('[data-focused="true"], [data-highlighted="true"], [data-focus="true"]')
        ) {
          signal = 'descendant-focused-attr';
        } else if (/focus|highlight|pulse|flash|target/i.test(row.className)) {
          signal = 'focus-class';
        } else if (style.animationName && style.animationName !== 'none') {
          signal = `row-animation:${style.animationName}`;
        } else if (tdAnimations.length > 0) {
          signal = `cell-animation:${tdAnimations[0]}`;
        } else if (row.contains(document.activeElement)) {
          signal = 'dom-active-element';
        } else if (/(background|outline|box-shadow)/i.test(row.getAttribute('style') ?? '')) {
          signal = 'inline-highlight-style';
        }

        return {
          found: true,
          inViewport,
          signal,
          className: row.className,
          animationName: style.animationName,
          rectTop: Math.round(rect.top),
          rectBottom: Math.round(rect.bottom),
          viewportHeight: window.innerHeight,
        };
      },
      { id: itemId, pattern: patternText }
    );

    lastSnapshot = snap;
    if (snap.found && snap.inViewport && snap.signal) {
      return {
        signal: snap.signal,
        className: snap.className,
        animationName: snap.animationName,
      };
    }
    await sleep(50);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for deep-linked keyword row "${itemId}" ("${patternText}") to be in viewport and focused/highlighted. Last state: ${JSON.stringify(lastSnapshot)}`
  );
}

// ---------------------------------------------------------------------------
// Scenario 4: Rule Packs Tab & 4-Branch Import / Container Helpers
// ---------------------------------------------------------------------------

/**
 * Locates the offline Rule Packs tab on `#/keywords`, explicitly excluding
 * `/public|cloud|community|built-?in/i` so it never collides with `"Public Packs"`.
 */
export async function locateRulePacksTab(optionsPage: Page): Promise<Locator> {
  const explicit = optionsPage
    .locator(
      '[role="tablist"] button[role="tab"][data-tab="packs"], [role="tablist"] button[role="tab"][data-value="packs"], [role="tablist"] button[role="tab"][data-kxc-tab="packs"]'
    )
    .first();
  if ((await explicit.count()) > 0) {
    return explicit;
  }

  const specific = optionsPage
    .locator('[role="tablist"] button[role="tab"]')
    .filter({ hasText: /rule pack|topic pack|installed pack|shareable pack|shared pack/i })
    .filter({ hasNotText: /public|cloud|community|built-?in/i })
    .first();
  if ((await specific.count()) > 0) {
    return specific;
  }

  const generic = optionsPage
    .locator('[role="tablist"] button[role="tab"]')
    .filter({ hasText: /pack/i })
    .filter({ hasNotText: /public|cloud|community|built-?in/i })
    .first();
  if ((await generic.count()) > 0) {
    return generic;
  }

  const allTabs = await optionsPage
    .locator('[role="tablist"] button[role="tab"]')
    .allTextContents();
  throw new Error(
    `Rule Packs tab not found on #/keywords (excluded /public|cloud|community|built-?in/i). Visible tabs: ${JSON.stringify(allTabs)}`
  );
}

/**
 * Imports a `kxc-pack-v1` JSON payload through the `#/keywords?tab=packs` UI across all
 * 4 supported M4 UI branches (hidden `main.page input[type="file"]`, dialog `<input type="file">`,
 * dialog `<textarea>` paste + optional Preview/Parse, ephemeral `filechooser`) while strictly
 * asserting the preview `<dialog open>` confirmation gate BEFORE storage write.
 */
export async function importRulePackViaUi(
  optionsPage: Page,
  packJson: string,
  packName: string
): Promise<void> {
  let packId = '';
  try {
    const parsed = JSON.parse(packJson) as { id?: unknown };
    if (typeof parsed.id === 'string') {
      packId = parsed.id;
    }
  } catch (err) {
    throw new Error('importRulePackViaUi received invalid JSON pack payload', { cause: err });
  }
  assert(packId.length > 0, 'importRulePackViaUi requires pack JSON with non-empty string "id"');

  const packFilePayload = {
    name: 'e2e-topic-pack.kxc-pack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(packJson, 'utf-8'),
  };

  // Branch A: Hidden <input type="file"> already mounted directly on main.page
  // (strictly excluding file inputs nested inside a pre-mounted closed <dialog>)
  const hasPageFileInput = await optionsPage.evaluate(() => {
    for (const prev of document.querySelectorAll('[data-e2e-page-file-input]')) {
      prev.removeAttribute('data-e2e-page-file-input');
    }
    for (const el of document.querySelectorAll('main.page input[type="file"]')) {
      if (!el.closest('dialog:not([open])')) {
        el.setAttribute('data-e2e-page-file-input', 'true');
        return true;
      }
    }
    return false;
  });
  if (hasPageFileInput) {
    await optionsPage
      .locator('[data-e2e-page-file-input="true"]')
      .first()
      .setInputFiles(packFilePayload);
  } else {
    // Branch B / C / D: Click Import Pack CTA (excluding Export!) with armed filechooser listener
    const importBtn = optionsPage
      .locator(
        'main.page [data-kxc-pack-import]:visible, main.page [data-testid="import-pack-btn"]:visible'
      )
      .or(
        optionsPage
          .locator('main.page button:visible')
          .filter({ hasText: /import|install pack|add pack/i })
          .filter({ hasNotText: /export/i })
      )
      .first();
    await importBtn.waitFor({ state: 'visible', timeout: 5_000 });

    let chooserHandled = false;
    let chooserPromise: Promise<void> | undefined;
    const onChooser = (chooser: FileChooser) => {
      chooserHandled = true;
      chooserPromise = chooser.setFiles(packFilePayload);
    };
    optionsPage.once('filechooser', onChooser);
    await importBtn.click();

    await optionsPage
      .waitForFunction(
        () =>
          Boolean(document.querySelector('dialog[open]')) ||
          [...document.querySelectorAll('main.page input[type="file"]')].some(
            (el) => !el.closest('dialog:not([open])')
          ),
        { timeout: 5_000 }
      )
      .catch(() => undefined);
    optionsPage.off('filechooser', onChooser);
    if (chooserPromise) {
      await chooserPromise;
    }

    if (!chooserHandled) {
      const dlg = optionsPage.locator('dialog[open]').last();
      if ((await dlg.count()) > 0) {
        const dlgFile = dlg.locator('input[type="file"]').first();
        const dlgText = dlg.locator('textarea').first();
        if ((await dlgFile.count()) > 0) {
          await dlgFile.setInputFiles(packFilePayload);
          const autoRendered = await optionsPage
            .waitForFunction(
              (expectedName: string) =>
                [...document.querySelectorAll('dialog[open]')].some((d) =>
                  (d.textContent ?? '').includes(expectedName)
                ),
              packName,
              { timeout: 600 }
            )
            .then(() => true)
            .catch(() => false);
          if (!autoRendered) {
            const primaryParseBtn = dlg
              .locator('button:not([disabled])')
              .filter({ hasText: /preview|parse|validate|next/i })
              .filter({ hasNotText: /cancel|close|file|upload|browse|choose/i })
              .first();
            const fallbackParseBtn = dlg
              .locator('button:not([disabled])')
              .filter({ hasText: /load/i })
              .filter({ hasNotText: /cancel|close|file|upload|browse|choose/i })
              .first();
            if ((await primaryParseBtn.count()) > 0) {
              await primaryParseBtn.click();
            } else if ((await fallbackParseBtn.count()) > 0) {
              await fallbackParseBtn.click();
            }
          }
        } else if ((await dlgText.count()) > 0) {
          await dlgText.fill(packJson);
          const hasPreviewNow = await optionsPage.evaluate(
            (expectedName: string) =>
              [...document.querySelectorAll('dialog[open]')].some((d) =>
                (d.textContent ?? '').includes(expectedName)
              ),
            packName
          );
          if (!hasPreviewNow) {
            const primaryParseBtn = dlg
              .locator('button:not([disabled])')
              .filter({ hasText: /preview|parse|validate|next/i })
              .filter({ hasNotText: /cancel|close|file|upload|browse|choose/i })
              .first();
            const fallbackParseBtn = dlg
              .locator('button:not([disabled])')
              .filter({ hasText: /load/i })
              .filter({ hasNotText: /cancel|close|file|upload|browse|choose/i })
              .first();
            if ((await primaryParseBtn.count()) > 0) {
              await primaryParseBtn.click();
            } else if ((await fallbackParseBtn.count()) > 0) {
              await fallbackParseBtn.click();
            }
          }
        }
      } else {
        const hasLatePageFileInput = await optionsPage.evaluate(() => {
          for (const prev of document.querySelectorAll('[data-e2e-page-file-input]')) {
            prev.removeAttribute('data-e2e-page-file-input');
          }
          for (const el of document.querySelectorAll('main.page input[type="file"]')) {
            if (!el.closest('dialog:not([open])')) {
              el.setAttribute('data-e2e-page-file-input', 'true');
              return true;
            }
          }
          return false;
        });
        if (hasLatePageFileInput) {
          await optionsPage
            .locator('[data-e2e-page-file-input="true"]')
            .first()
            .setInputFiles(packFilePayload);
        }
      }
    }
  }

  // Mandatory Preview Gate: an open <dialog open> MUST render packName BEFORE writing to storage!
  await optionsPage.waitForFunction(
    (expectedName: string) =>
      [...document.querySelectorAll('dialog[open]')].some((d) =>
        (d.textContent ?? '').includes(expectedName)
      ),
    packName,
    { timeout: 8_000 }
  );

  const previewDialog = optionsPage.locator('dialog[open]').filter({ hasText: packName }).last();
  await previewDialog.waitFor({ state: 'visible', timeout: 5_000 });

  const preConfirmConfig = await getStorageLocal<StoredFilterConfig>(
    optionsPage,
    'kxc_filter_config_v1'
  );
  const alreadyInstalled = (preConfirmConfig?.installedPacks ?? []).some((p) => p.id === packId);
  assert(
    !alreadyInstalled,
    `Rule pack "${packId}" was written to chrome.storage.local BEFORE confirming the preview dialog`
  );

  const primaryConfirm = previewDialog.locator('.dialog-foot button.primary:not([disabled])').first();
  const fallbackConfirm = previewDialog
    .locator('button:not([disabled])')
    .filter({ hasText: /install|import|confirm|add/i })
    .filter({ hasNotText: /cancel|close|preview|parse|validate|file|upload|browse|choose/i })
    .first();

  const confirmBtn = (await primaryConfirm.count()) > 0 ? primaryConfirm : fallbackConfirm;
  await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
  await confirmBtn.click();
  await previewDialog.waitFor({ state: 'detached', timeout: 8_000 });
}

/**
 * Locates the tightest visible container inside `main.page` holding an installed rule pack's
 * explicit pack ID attribute or visible name, its visible `button[role="switch"]`, and (in
 * heuristic mode) its visible uninstall/remove/delete button, strictly skipping hidden or
 * closed-dialog clones.
 */
export async function locateInstalledPackContainer(
  optionsPage: Page,
  packId: string,
  packName: string
): Promise<Locator> {
  const stamped = await optionsPage.evaluate(
    ({ targetPackId, name }) => {
      for (const prev of document.querySelectorAll('[data-e2e-pack-container]')) {
        prev.removeAttribute('data-e2e-pack-container');
      }

      const main = document.querySelector('main.page');
      if (!main) return false;

      const escapedPackId =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(targetPackId)
          : targetPackId;

      for (const el of main.querySelectorAll<HTMLElement>(
        `[data-pack-id="${escapedPackId}"], [data-kxc-pack-id="${escapedPackId}"], [data-item-id="${escapedPackId}"]`
      )) {
        if (el.closest('dialog:not([open])')) continue;
        const rect = el.getBoundingClientRect();
        let visible = rect.width > 0 && rect.height > 0;
        for (let p: Element | null = el; visible && p; p = p.parentElement) {
          const cs = window.getComputedStyle(p);
          if (
            cs.display === 'none' ||
            cs.visibility === 'hidden' ||
            !(Number.parseFloat(cs.opacity) > 0)
          ) {
            visible = false;
          }
        }
        if (!visible) continue;

        let hasVisibleSwitch = false;
        for (const sw of el.querySelectorAll<HTMLElement>('button[role="switch"]')) {
          if (sw.closest('dialog:not([open])')) continue;
          const swRect = sw.getBoundingClientRect();
          let swVisible = swRect.width > 0 && swRect.height > 0;
          for (let p: Element | null = sw; swVisible && p && p !== el; p = p.parentElement) {
            const pcs = window.getComputedStyle(p);
            if (
              pcs.display === 'none' ||
              pcs.visibility === 'hidden' ||
              !(Number.parseFloat(pcs.opacity) > 0)
            ) {
              swVisible = false;
            }
          }
          if (swVisible) {
            hasVisibleSwitch = true;
            break;
          }
        }
        if (hasVisibleSwitch) {
          el.setAttribute('data-e2e-pack-container', 'true');
          return true;
        }
      }

      const candidates = [
        ...main.querySelectorAll<HTMLElement>('section, article, li, tr, .panel, .setting, div'),
      ];
      const uninstallRe = /uninstall|remove|delete/i;

      let best: HTMLElement | null = null;
      let bestDepth = -1;
      for (const el of candidates) {
        if (
          el.closest('dialog:not([open])') ||
          el.closest('[role="tablist"]') ||
          el.querySelector('[role="tablist"]') ||
          el.querySelector('h1')
        ) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        let visible = rect.width > 0 && rect.height > 0;
        for (let p: Element | null = el; visible && p; p = p.parentElement) {
          const cs = window.getComputedStyle(p);
          if (
            cs.display === 'none' ||
            cs.visibility === 'hidden' ||
            !(Number.parseFloat(cs.opacity) > 0)
          ) {
            visible = false;
          }
        }
        if (!visible) continue;
        if (!(el.textContent ?? '').includes(name)) continue;

        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let visibleText = '';
        let textNode: Node | null = walker.nextNode();
        while (textNode) {
          const parentEl = textNode.parentElement;
          if (parentEl && !parentEl.closest('dialog:not([open])')) {
            let textVisible = true;
            for (
              let p: Element | null = parentEl;
              textVisible && p && p !== el;
              p = p.parentElement
            ) {
              const pcs = window.getComputedStyle(p);
              if (
                pcs.display === 'none' ||
                pcs.visibility === 'hidden' ||
                !(Number.parseFloat(pcs.opacity) > 0)
              ) {
                textVisible = false;
              }
            }
            if (textVisible) {
              visibleText += textNode.nodeValue ?? '';
            }
          }
          textNode = walker.nextNode();
        }
        if (!visibleText.includes(name)) continue;

        let hasVisibleSwitch = false;
        for (const sw of el.querySelectorAll<HTMLElement>('button[role="switch"]')) {
          if (sw.closest('dialog:not([open])')) continue;
          const swRect = sw.getBoundingClientRect();
          let swVisible = swRect.width > 0 && swRect.height > 0;
          for (let p: Element | null = sw; swVisible && p && p !== el; p = p.parentElement) {
            const pcs = window.getComputedStyle(p);
            if (
              pcs.display === 'none' ||
              pcs.visibility === 'hidden' ||
              !(Number.parseFloat(pcs.opacity) > 0)
            ) {
              swVisible = false;
            }
          }
          if (swVisible) {
            hasVisibleSwitch = true;
            break;
          }
        }
        if (!hasVisibleSwitch) continue;

        let hasUninstall = false;
        for (const b of el.querySelectorAll<HTMLElement>('button')) {
          if (b.closest('dialog:not([open])')) continue;
          const bRect = b.getBoundingClientRect();
          let bVisible = bRect.width > 0 && bRect.height > 0;
          for (let p: Element | null = b; bVisible && p && p !== el; p = p.parentElement) {
            const pcs = window.getComputedStyle(p);
            if (
              pcs.display === 'none' ||
              pcs.visibility === 'hidden' ||
              !(Number.parseFloat(pcs.opacity) > 0)
            ) {
              bVisible = false;
            }
          }
          if (!bVisible) continue;
          const desc = `${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''}`.trim();
          if (uninstallRe.test(desc)) {
            hasUninstall = true;
            break;
          }
        }
        if (!hasUninstall) continue;

        let depth = 0;
        for (let p: HTMLElement | null = el; p && p !== main; p = p.parentElement) {
          depth += 1;
        }
        if (depth > bestDepth) {
          bestDepth = depth;
          best = el;
        }
      }

      if (!best) return false;
      best.setAttribute('data-e2e-pack-container', 'true');
      return true;
    },
    { targetPackId: packId, name: packName }
  );

  assert(
    stamped,
    `Installed rule pack container for "${packName}" (${packId}) not found inside main.page (expected visible container with name + switch + uninstall button)`
  );
  return optionsPage.locator('[data-e2e-pack-container="true"]').first();
}

// ---------------------------------------------------------------------------
// Scenario 5: History Rule Breakdown, 7-Day Trend & Canvas 2D Battle Report PNG
// ---------------------------------------------------------------------------

/**
 * Installs a passive `addInitScript` spying on `CanvasRenderingContext2D.prototype.{fillText,strokeText}`
 * (and `OffscreenCanvasRenderingContext2D` when present) without modifying rendering output.
 */
export async function installCanvasTextSpy(page: Page): Promise<void> {
  await page.addInitScript(`(() => {
    window.__kxcCanvasTexts = [];
    function recordText(value) {
      if (!Array.isArray(window.__kxcCanvasTexts)) {
        window.__kxcCanvasTexts = [];
      }
      window.__kxcCanvasTexts.push(String(value));
    }

    if (typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype) {
      const origFill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        recordText(text);
        if (maxWidth === undefined) {
          return origFill.call(this, text, x, y);
        }
        return origFill.call(this, text, x, y, maxWidth);
      };

      const origStroke = CanvasRenderingContext2D.prototype.strokeText;
      CanvasRenderingContext2D.prototype.strokeText = function (text, x, y, maxWidth) {
        recordText(text);
        if (maxWidth === undefined) {
          return origStroke.call(this, text, x, y);
        }
        return origStroke.call(this, text, x, y, maxWidth);
      };
    }

    if (
      typeof OffscreenCanvasRenderingContext2D !== 'undefined' &&
      OffscreenCanvasRenderingContext2D.prototype
    ) {
      const origOffFill = OffscreenCanvasRenderingContext2D.prototype.fillText;
      OffscreenCanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        recordText(text);
        if (maxWidth === undefined) {
          return origOffFill.call(this, text, x, y);
        }
        return origOffFill.call(this, text, x, y, maxWidth);
      };

      const origOffStroke = OffscreenCanvasRenderingContext2D.prototype.strokeText;
      OffscreenCanvasRenderingContext2D.prototype.strokeText = function (text, x, y, maxWidth) {
        recordText(text);
        if (maxWidth === undefined) {
          return origOffStroke.call(this, text, x, y);
        }
        return origOffStroke.call(this, text, x, y, maxWidth);
      };
    }
  })();`);
}

/**
 * Locates a visible clickable rule breakdown bar on `#/history` strictly outside `<table>`,
 * `<dialog>`, and `<select>` (both explicit and semantic tiers exclude `table`/`dialog`/`select`
 * and verify ancestor visibility + non-zero bounding rect).
 */
export async function locateRuleBreakdownBar(
  historyPage: Page,
  ruleId: string,
  labelRegex: RegExp
): Promise<Locator> {
  const stamped = await historyPage.evaluate(
    ({ targetRuleId, patternSource, patternFlags }) => {
      for (const prev of document.querySelectorAll('[data-e2e-rule-bar]')) {
        prev.removeAttribute('data-e2e-rule-bar');
      }

      const main = document.querySelector('main.page');
      if (!main) return false;

      const escapedRuleId =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(targetRuleId)
          : targetRuleId;

      const explicitCandidates = [
        ...main.querySelectorAll<HTMLElement>(
          `[data-rule-id="${escapedRuleId}"], [data-kxc-rule-bar="${escapedRuleId}"], [data-rule="${escapedRuleId}"]`
        ),
      ];
      for (const el of explicitCandidates) {
        if (el.tagName === 'OPTION' || el.closest('table, dialog, select')) continue;
        const rect = el.getBoundingClientRect();
        let visible = rect.width > 0 && rect.height > 0;
        for (let p: Element | null = el; visible && p; p = p.parentElement) {
          const cs = window.getComputedStyle(p);
          if (
            cs.display === 'none' ||
            cs.visibility === 'hidden' ||
            !(Number.parseFloat(cs.opacity) > 0)
          ) {
            visible = false;
          }
        }
        if (!visible) continue;
        el.setAttribute('data-e2e-rule-bar', 'true');
        return true;
      }

      const re = new RegExp(patternSource, patternFlags);
      const clickables = [...main.querySelectorAll<HTMLElement>('button, [role="button"]')];
      for (const el of clickables) {
        if (el.closest('table, dialog, select')) continue;
        const rect = el.getBoundingClientRect();
        let visible = rect.width > 0 && rect.height > 0;
        for (let p: Element | null = el; visible && p; p = p.parentElement) {
          const cs = window.getComputedStyle(p);
          if (
            cs.display === 'none' ||
            cs.visibility === 'hidden' ||
            !(Number.parseFloat(cs.opacity) > 0)
          ) {
            visible = false;
          }
        }
        if (!visible) continue;
        const desc = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''}`.trim();
        if (re.test(desc)) {
          el.setAttribute('data-e2e-rule-bar', 'true');
          return true;
        }
      }
      return false;
    },
    { targetRuleId: ruleId, patternSource: labelRegex.source, patternFlags: labelRegex.flags }
  );

  assert(
    stamped,
    `Clickable rule breakdown bar for "${ruleId}" (${labelRegex.toString()}) not found on #/history outside table/dialog/select`
  );
  return historyPage.locator('[data-e2e-rule-bar="true"]').first();
}

/**
 * Verifies that `#/history` renders a genuine, visible 7-day trend visualization (outside `table`
 * and `dialog`, never matching small Lucide icons, hidden `<canvas>`, hidden date nodes, or
 * `opacity: 0` elements).
 */
export async function hasSevenDayTrendChart(historyPage: Page): Promise<boolean> {
  return historyPage.evaluate(() => {
    const main = document.querySelector('main.page');
    if (!main) return false;

    for (const explicit of main.querySelectorAll<Element>(
      '[data-kxc-trend], [data-testid="trend-chart"], [data-chart="daily-trend"]'
    )) {
      if (explicit.closest('table, dialog')) continue;
      const r = explicit.getBoundingClientRect();
      let visible = r.width >= 40 && r.height >= 20;
      for (let p: Element | null = explicit; visible && p; p = p.parentElement) {
        const cs = window.getComputedStyle(p);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          visible = false;
        }
      }
      if (visible) return true;
    }

    for (const svg of main.querySelectorAll<SVGSVGElement>('svg')) {
      if (
        svg.classList.contains('lucide') ||
        svg.closest('table, dialog, button, a, .empty-symbol')
      ) {
        continue;
      }
      const r = svg.getBoundingClientRect();
      const shapes = svg.querySelectorAll('rect, path, line, polygon, circle').length;
      if (r.width < 80 || r.height < 24 || shapes < 3) {
        continue;
      }
      let visible = true;
      for (let p: Element | null = svg; visible && p; p = p.parentElement) {
        const cs = window.getComputedStyle(p);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          visible = false;
        }
      }
      if (visible) {
        return true;
      }
    }

    for (const canvas of main.querySelectorAll<HTMLCanvasElement>('canvas')) {
      if (canvas.closest('table, dialog')) continue;
      const r = canvas.getBoundingClientRect();
      if (canvas.width < 80 || canvas.height < 24 || r.width < 80 || r.height < 24) {
        continue;
      }
      let visible = true;
      for (let p: Element | null = canvas; visible && p; p = p.parentElement) {
        const cs = window.getComputedStyle(p);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          visible = false;
        }
      }
      if (visible) {
        return true;
      }
    }

    // CSS bar chart fallback: 7 visible day nodes carrying date/day attributes or date titles
    let visibleDateNodeCount = 0;
    for (const el of main.querySelectorAll<HTMLElement>('[data-date], [data-day], [title]')) {
      if (el.closest('table, dialog, select')) continue;
      const attrVal = `${el.getAttribute('data-date') ?? ''} ${el.getAttribute('data-day') ?? ''} ${el.getAttribute('title') ?? ''}`;
      if (!/\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}/.test(attrVal)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      let visible = true;
      for (let p: Element | null = el; visible && p; p = p.parentElement) {
        const cs = window.getComputedStyle(p);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          visible = false;
        }
      }
      if (visible) {
        visibleDateNodeCount += 1;
        if (visibleDateNodeCount >= 7) {
          return true;
        }
      }
    }

    return false;
  });
}

/**
 * Locates the visible Battle Report trigger button on `#/history` strictly outside `<table>`
 * and `<dialog>` (both explicit and semantic tiers enforce ancestor visibility + non-zero rect).
 */
export async function locateBattleReportButton(historyPage: Page): Promise<Locator> {
  const stamped = await historyPage.evaluate(() => {
    for (const prev of document.querySelectorAll('[data-e2e-battle-report-btn]')) {
      prev.removeAttribute('data-e2e-battle-report-btn');
    }

    const main = document.querySelector('main.page');
    if (!main) return false;

    for (const el of main.querySelectorAll<HTMLElement>(
      '[data-kxc-report-btn], [data-testid="battle-report-btn"]'
    )) {
      if (el.closest('table, dialog')) continue;
      const rect = el.getBoundingClientRect();
      let visible = rect.width > 0 && rect.height > 0;
      for (let p: Element | null = el; visible && p; p = p.parentElement) {
        const cs = window.getComputedStyle(p);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          visible = false;
        }
      }
      if (visible) {
        el.setAttribute('data-e2e-battle-report-btn', 'true');
        return true;
      }
    }

    const re = /report|share card|battle|poster|summary card|share stats/i;
    for (const btn of main.querySelectorAll<HTMLButtonElement>('button')) {
      if (btn.closest('table, dialog')) continue;
      const rect = btn.getBoundingClientRect();
      let visible = rect.width > 0 && rect.height > 0;
      for (let p: Element | null = btn; visible && p; p = p.parentElement) {
        const cs = window.getComputedStyle(p);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          visible = false;
        }
      }
      if (!visible) continue;
      const desc = `${btn.textContent ?? ''} ${btn.getAttribute('aria-label') ?? ''} ${btn.getAttribute('title') ?? ''}`.trim();
      if (re.test(desc)) {
        btn.setAttribute('data-e2e-battle-report-btn', 'true');
        return true;
      }
    }
    return false;
  });

  assert(
    stamped,
    'Battle Report trigger button not found on #/history outside table/dialog'
  );
  return historyPage.locator('[data-e2e-battle-report-btn="true"]').first();
}

/**
 * Verifies the local Canvas 2D Battle Report PNG modal on `#/history`:
 * - Waits past async icon drawing for non-blank rendered `<canvas>` (or offscreen `<img>`),
 * - Enforces dimensions (`>= 400x200`), `opaqueRatio > 0.90`, `distinctColorBuckets >= 5`,
 *   `highContrastRatio >= 0.015` (Manhattan RGB distance > 45 from inset bg),
 *   decoded PNG bytes `> 4000`, light-theme 4 inset corners average luminance `>= 220`,
 * - Verifies export button present, zero PII in dialog DOM & Canvas painted text,
 *   and `keepxclean.com` painted in Canvas text.
 */
export async function verifyBattleReportCanvas(
  historyPage: Page,
  piiCanaries: readonly string[],
  timeoutMs = 10_000
): Promise<BattleReportMetrics> {
  const dialog = historyPage.locator('dialog[open]').last();
  await dialog.waitFor({ state: 'visible', timeout: 8_000 });

  const deadline = Date.now() + timeoutMs;
  let lastEval: Record<string, unknown> = { ready: false };

  while (Date.now() < deadline) {
    const evalResult = await historyPage.evaluate(() => {
      const openDialogs = [...document.querySelectorAll('dialog[open]')];
      const dlg = openDialogs.length > 0 ? openDialogs[openDialogs.length - 1] : null;
      if (!dlg) return { ready: false, pixelsReady: false, hasWatermark: false, reason: 'no open dialog' };

      const directCanvas = dlg.querySelector<HTMLCanvasElement>('canvas');
      let workCanvas: HTMLCanvasElement | null = directCanvas;

      if (!workCanvas) {
        const imgCandidates = [
          ...dlg.querySelectorAll<HTMLImageElement>(
            'img[src^="data:image/png"], img[src^="blob:"]'
          ),
        ];
        let img: HTMLImageElement | null = null;
        let largestImg: HTMLImageElement | null = null;
        let largestArea = -1;
        for (const candidate of imgCandidates) {
          const area = candidate.naturalWidth * candidate.naturalHeight;
          if (area > largestArea) {
            largestArea = area;
            largestImg = candidate;
          }
          if (
            !img &&
            candidate.complete &&
            candidate.naturalWidth >= 400 &&
            candidate.naturalHeight >= 200
          ) {
            img = candidate;
          }
        }
        if (!img) {
          const fallbackImg = largestImg ?? imgCandidates[0] ?? null;
          return {
            ready: false,
            pixelsReady: false,
            hasWatermark: false,
            reason: 'waiting for canvas or loaded PNG img',
            imgCount: imgCandidates.length,
            imgComplete: fallbackImg?.complete ?? false,
            imgW: fallbackImg?.naturalWidth ?? 0,
            imgH: fallbackImg?.naturalHeight ?? 0,
          };
        }
        const off = document.createElement('canvas');
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const offCtx = off.getContext('2d');
        if (!offCtx) {
          return { ready: false, pixelsReady: false, hasWatermark: false, reason: '2d context unavailable' };
        }
        offCtx.drawImage(img, 0, 0);
        workCanvas = off;
      }

      const width = workCanvas.width;
      const height = workCanvas.height;
      if (width < 400 || height < 200) {
        return {
          ready: false,
          pixelsReady: false,
          hasWatermark: false,
          reason: `canvas too small: ${width}x${height}`,
          width,
          height,
        };
      }

      const ctx = workCanvas.getContext('2d');
      if (!ctx) {
        return {
          ready: false,
          pixelsReady: false,
          hasWatermark: false,
          reason: 'canvas 2d context unavailable',
        };
      }

      const imgData = ctx.getImageData(0, 0, width, height).data;

      // Resolve reference inset background pixel (avoids rounded transparent outer corners & faint drop-shadows)
      let bgR = 0;
      let bgG = 0;
      let bgB = 0;
      for (const inset of [12, 24, 36, 48]) {
        if (inset >= width || inset >= height) continue;
        const cx = Math.max(0, Math.min(width - 1, inset));
        const cy = Math.max(0, Math.min(height - 1, inset));
        const idx = (cy * width + cx) * 4;
        if (imgData[idx + 3] >= 200) {
          bgR = imgData[idx];
          bgG = imgData[idx + 1];
          bgB = imgData[idx + 2];
          break;
        }
      }

      let sampled = 0;
      let opaque = 0;
      let highContrast = 0;
      const buckets = new Set<number>();

      for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
          sampled += 1;
          const idx = (y * width + x) * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];
          const a = imgData[idx + 3];
          if (a > 0) {
            opaque += 1;
            buckets.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
            const manhattan = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
            if (manhattan > 45) {
              highContrast += 1;
            }
          }
        }
      }

      const opaqueRatio = sampled > 0 ? opaque / sampled : 0;
      const highContrastRatio = opaque > 0 ? highContrast / opaque : 0;
      const distinctColorBuckets = buckets.size;

      const dataUrl = workCanvas.toDataURL('image/png');
      const pngPrefix = 'data:image/png;base64,';
      const hasPngPrefix = dataUrl.startsWith(pngPrefix);
      const base64Body = hasPngPrefix ? dataUrl.slice(pngPrefix.length) : '';
      const decodedBytes = Math.floor((base64Body.length * 3) / 4);

      // 4 inset corners average luminance (step inward past transparent rounded corners & faint drop-shadows)
      const cornerOffsets = [12, 24, 36, 48];
      const cornerLums: number[] = [];
      for (let corner = 0; corner < 4; corner += 1) {
        for (const inset of cornerOffsets) {
          if (inset >= width || inset >= height) continue;
          const rawX = corner === 0 || corner === 2 ? inset : width - inset;
          const rawY = corner === 0 || corner === 1 ? inset : height - inset;
          const cx = Math.max(0, Math.min(width - 1, Math.floor(rawX)));
          const cy = Math.max(0, Math.min(height - 1, Math.floor(rawY)));
          const idx = (cy * width + cx) * 4;
          if (imgData[idx + 3] >= 200) {
            cornerLums.push(
              0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2]
            );
            break;
          }
        }
      }
      const avgCornerLuminance =
        cornerLums.length > 0
          ? cornerLums.reduce((sum, v) => sum + v, 0) / cornerLums.length
          : 0;

      const w = window as unknown as KxcE2eWindow;
      const paintedTexts = w.__kxcCanvasTexts ?? [];
      const hasWatermark = paintedTexts.some((t) => /keepxclean\.com/i.test(t));

      const pixelsReady =
        hasPngPrefix &&
        decodedBytes > 4_000 &&
        opaqueRatio > 0.9 &&
        distinctColorBuckets >= 5 &&
        highContrastRatio >= 0.015;
      const ready = pixelsReady && hasWatermark;

      return {
        ready,
        pixelsReady,
        hasWatermark,
        paintedTextCount: paintedTexts.length,
        width,
        height,
        hasPngPrefix,
        decodedBytes,
        opaqueRatio,
        distinctColorBuckets,
        highContrastRatio,
        avgCornerLuminance,
      };
    });

    lastEval = evalResult;
    if (evalResult.ready) {
      break;
    }
    await sleep(100);
  }

  assert(
    lastEval.pixelsReady === true,
    `Battle Report Canvas PNG did not reach non-blank ready state within ${timeoutMs}ms. Last metrics: ${JSON.stringify(lastEval)}`
  );
  assert(
    lastEval.hasWatermark === true,
    `Battle Report Canvas PNG did not paint "keepxclean.com" watermark within ${timeoutMs}ms. Last metrics: ${JSON.stringify(lastEval)}`
  );

  const avgCornerLuminance = Number(lastEval.avgCornerLuminance ?? 0);
  assert(
    avgCornerLuminance >= 220,
    `Expected light-theme Battle Report PNG (4 inset corners avg luminance >= 220), got ${avgCornerLuminance.toFixed(1)}`
  );

  // Verify at least one export CTA button exists inside the Battle Report modal
  const exportBtn = dialog
    .locator('button')
    .filter({ hasText: /download|save|copy/i })
    .first();
  await exportBtn.waitFor({ state: 'visible', timeout: 5_000 });

  // Zero-PII check across dialog DOM text, attributes, AND Canvas painted text
  const textAudit = await historyPage.evaluate(() => {
    const openDialogs = [...document.querySelectorAll('dialog[open]')];
    const dlg = openDialogs.length > 0 ? openDialogs[openDialogs.length - 1] : null;
    const domText = dlg?.textContent ?? '';
    const attrParts: string[] = [];
    if (dlg) {
      for (const el of [dlg, ...dlg.querySelectorAll('[aria-label], [title], [alt]')]) {
        const aria = el.getAttribute('aria-label');
        const title = el.getAttribute('title');
        const alt = el.getAttribute('alt');
        if (aria) attrParts.push(aria);
        if (title) attrParts.push(title);
        if (alt) attrParts.push(alt);
      }
    }
    const w = window as unknown as KxcE2eWindow;
    const painted = w.__kxcCanvasTexts ?? [];
    return {
      domCorpus: `${domText} ${attrParts.join(' ')}`,
      paintedText: painted.join(' '),
      paintedTextCount: painted.length,
    };
  });

  const lowerDom = textAudit.domCorpus.toLowerCase();
  const lowerPainted = textAudit.paintedText.toLowerCase();
  for (const canary of piiCanaries) {
    const lowerCanary = canary.toLowerCase();
    assert(
      !lowerDom.includes(lowerCanary),
      `Battle Report dialog DOM leaked PII canary "${canary}"`
    );
    assert(
      !lowerPainted.includes(lowerCanary),
      `Battle Report Canvas painted text leaked PII canary "${canary}"`
    );
  }

  assert(
    textAudit.paintedTextCount > 0 && /keepxclean\.com/i.test(textAudit.paintedText),
    `Expected Battle Report Canvas painted text to include "keepxclean.com" watermark, captured ${textAudit.paintedTextCount} text calls: ${JSON.stringify(textAudit.paintedText.slice(0, 300))}`
  );

  return {
    width: Number(lastEval.width),
    height: Number(lastEval.height),
    decodedBytes: Number(lastEval.decodedBytes),
    opaqueRatio: Number(lastEval.opaqueRatio),
    distinctColorBuckets: Number(lastEval.distinctColorBuckets),
    highContrastRatio: Number(lastEval.highContrastRatio),
    avgCornerLuminance,
    paintedTextCount: textAudit.paintedTextCount,
  };
}

// ---------------------------------------------------------------------------
// Scenario 6: Safe Negative-Offset Clock, Clipboard Spy & Health Banner
// ---------------------------------------------------------------------------

/**
 * Installs a safe clock `addInitScript` with `BASE_OFFSET_MS = -20_000`:
 * - `Date.now()` stays `<= realNow` (preventing future-timestamp skew with Service Worker),
 * - `performance.now()` shifts monotonically by `(offsetMs - BASE_OFFSET_MS)` so it is
 *   ALWAYS `>= 0` and never jumps backward,
 * - `setTimeout`/`setInterval`/`requestAnimationFrame` remain untouched.
 */
export async function installNegativeOffsetClock(page: Page): Promise<void> {
  await page.addInitScript(`(() => {
    const BASE_OFFSET_MS = -20000;
    const origDateNow = Date.now.bind(Date);
    const origPerfNow = performance.now.bind(performance);
    let offsetMs = BASE_OFFSET_MS;
    Object.defineProperty(window, '__kxcSetClockOffsetMs', {
      value: function (ms) {
        offsetMs = Number(ms);
      },
      configurable: true,
    });
    Date.now = function () {
      return origDateNow() + offsetMs;
    };
    performance.now = function () {
      return origPerfNow() + (offsetMs - BASE_OFFSET_MS);
    };
  })();`);
}

export async function setClockOffsetMs(page: Page, offsetMs: number): Promise<void> {
  const applied = await page.evaluate((ms: number) => {
    const setter = (window as unknown as KxcE2eWindow).__kxcSetClockOffsetMs;
    if (typeof setter !== 'function') return false;
    setter(ms);
    return true;
  }, offsetMs);
  assert(applied, 'installNegativeOffsetClock() must be installed before calling setClockOffsetMs()');
}

/**
 * Triple-layer extension-origin clipboard spy (`Clipboard.prototype.writeText` +
 * `navigator.clipboard` getter + `document.execCommand('copy')`) for deterministic
 * headless Linux Chromium clipboard verification with zero extra permissions.
 */
export async function installClipboardSpy(page: Page): Promise<void> {
  await page.addInitScript(`(() => {
    window.__kxcClipboardCalls = [];
    function record(text) {
      const value = String(text);
      window.__kxcCopiedDiagnostic = value;
      if (!Array.isArray(window.__kxcClipboardCalls)) {
        window.__kxcClipboardCalls = [];
      }
      window.__kxcClipboardCalls.push(value);
    }

    if (typeof Clipboard !== 'undefined' && Clipboard.prototype) {
      try {
        Object.defineProperty(Clipboard.prototype, 'writeText', {
          configurable: true,
          writable: true,
          value: async function (text) {
            record(text);
          },
        });
      } catch (_err) {
        // Fall through to Layer 2
      }
    }

    try {
      const fakeClipboard = {
        writeText: async function (text) {
          record(text);
        },
        readText: async function () {
          return window.__kxcCopiedDiagnostic || '';
        },
      };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        get: function () {
          return fakeClipboard;
        },
      });
    } catch (_err) {
      // Layer 1 already installed
    }

    const origExec = typeof document.execCommand === 'function'
      ? document.execCommand.bind(document)
      : null;
    if (origExec) {
      document.execCommand = function (cmd, showUI, value) {
        if (String(cmd).toLowerCase() === 'copy') {
          const active = document.activeElement;
          const activeVal = active && 'value' in active ? active.value : '';
          const sel = window.getSelection ? window.getSelection() : null;
          const text = (sel ? sel.toString() : '') || activeVal || '';
          if (text) {
            record(text);
          }
          return true;
        }
        return origExec(cmd, showUI, value);
      };
    }
  })();`);
}

/**
 * Non-mutating check for whether the degraded Parse Health banner is currently visible
 * inside `.popup-body` (avoiding `SaveStatus`, `SyncStatus`, paused banner, and `QuickControls`
 * landmarks while supporting both `.popup-body` sibling and `.compact.stack` child placement).
 */
export async function hasVisibleHealthBanner(popupPage: Page): Promise<boolean> {
  return popupPage.evaluate(() => {
    const body = document.querySelector('.popup-body');
    if (!body) return false;

    const explicitEls = body.querySelectorAll<HTMLElement>(
      '[data-kxc-health-banner], [data-testid="health-banner"], .health-banner'
    );
    for (const explicit of explicitEls) {
      const explicitRect = explicit.getBoundingClientRect();
      let explicitVisible = explicitRect.width > 0 && explicitRect.height > 0;
      for (
        let cur: HTMLElement | null = explicit;
        explicitVisible && cur;
        cur = cur.parentElement
      ) {
        const cs = window.getComputedStyle(cur);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          explicitVisible = false;
        }
      }
      if (explicitVisible) {
        return true;
      }
    }

    const candidates = [
      ...body.querySelectorAll<HTMLElement>(
        '.banner, [role="status"], [role="alert"], section.panel, article, div'
      ),
    ];
    const copyRe = /copy|diagnostic/i;
    const healthTextRe = /parse|diagnostic|changed|health|structure|issue|detect|layout/i;

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      let elVisible = rect.width > 0 && rect.height > 0;
      for (let cur: HTMLElement | null = el; elVisible && cur; cur = cur.parentElement) {
        const cs = window.getComputedStyle(cur);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          elVisible = false;
        }
      }
      if (!elVisible) {
        continue;
      }
      if (
        el.classList.contains('compact') ||
        el.querySelector('.stats-strip, form, .recent-list') ||
        el.closest('.stats-strip, form, .recent-list')
      ) {
        continue;
      }

      let hasCopyDiagnostic = false;
      let hasGithubLink = false;
      for (const ctrl of el.querySelectorAll<HTMLElement>('button, a')) {
        let ctrlVisible = true;
        for (let p: HTMLElement | null = ctrl; ctrlVisible && p && p !== el; p = p.parentElement) {
          const pcs = window.getComputedStyle(p);
          if (
            pcs.display === 'none' ||
            pcs.visibility === 'hidden' ||
            !(Number.parseFloat(pcs.opacity) > 0)
          ) {
            ctrlVisible = false;
          }
        }
        if (!ctrlVisible) continue;
        const desc = `${ctrl.textContent ?? ''} ${ctrl.getAttribute('aria-label') ?? ''} ${ctrl.getAttribute('title') ?? ''}`.trim();
        if (ctrl.tagName === 'BUTTON' && copyRe.test(desc)) {
          hasCopyDiagnostic = true;
        }
        if (ctrl.tagName === 'A' && (ctrl.getAttribute('href') ?? '').includes('github.com')) {
          hasGithubLink = true;
        }
      }
      const matchesHealthText = healthTextRe.test(el.textContent ?? '');
      if (hasCopyDiagnostic || (hasGithubLink && matchesHealthText)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Locates the degraded Parse Health banner strictly inside `.popup-body` using 2-tier
 * priority selection so KeepXClean `<Banner>` inner `<div class="grow">` or action
 * `<div class="row">` wrappers never hijack selection away from `.banner.warning`.
 */
export async function locateHealthBanner(popupPage: Page): Promise<Locator> {
  const stamped = await popupPage.evaluate(() => {
    const body = document.querySelector('.popup-body');
    if (!body) return false;

    for (const prev of document.querySelectorAll('[data-e2e-health-banner]')) {
      prev.removeAttribute('data-e2e-health-banner');
    }

    const explicitEls = body.querySelectorAll<HTMLElement>(
      '[data-kxc-health-banner], [data-testid="health-banner"], .health-banner'
    );
    for (const explicit of explicitEls) {
      const explicitRect = explicit.getBoundingClientRect();
      let explicitVisible = explicitRect.width > 0 && explicitRect.height > 0;
      for (
        let cur: HTMLElement | null = explicit;
        explicitVisible && cur;
        cur = cur.parentElement
      ) {
        const cs = window.getComputedStyle(cur);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          explicitVisible = false;
        }
      }
      if (explicitVisible) {
        explicit.setAttribute('data-e2e-health-banner', 'true');
        return true;
      }
    }

    const candidates = [
      ...body.querySelectorAll<HTMLElement>(
        '.banner, [role="status"], [role="alert"], section.panel, article, div'
      ),
    ];
    const copyRe = /copy|diagnostic/i;
    const issueActionRe = /github|issue|report/i;
    const healthTextRe = /parse|diagnostic|changed|health|structure|issue|detect|layout/i;

    let bestSemanticTierA: HTMLElement | null = null;
    let bestSemanticTierADepth = -1;
    let bestAnyTierA: HTMLElement | null = null;
    let bestAnyTierADepth = -1;
    let bestTierB: HTMLElement | null = null;
    let bestTierBDepth = -1;

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      let elVisible = rect.width > 0 && rect.height > 0;
      for (let cur: HTMLElement | null = el; elVisible && cur; cur = cur.parentElement) {
        const cs = window.getComputedStyle(cur);
        if (
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          !(Number.parseFloat(cs.opacity) > 0)
        ) {
          elVisible = false;
        }
      }
      if (!elVisible) {
        continue;
      }
      if (
        el.classList.contains('compact') ||
        el.querySelector('.stats-strip, form, .recent-list') ||
        el.closest('.stats-strip, form, .recent-list')
      ) {
        continue;
      }

      let hasCopyDiagnostic = false;
      let hasIssueAction = false;
      let hasGithubLink = false;
      for (const ctrl of el.querySelectorAll<HTMLElement>('button, a')) {
        let ctrlVisible = true;
        for (let p: HTMLElement | null = ctrl; ctrlVisible && p && p !== el; p = p.parentElement) {
          const pcs = window.getComputedStyle(p);
          if (
            pcs.display === 'none' ||
            pcs.visibility === 'hidden' ||
            !(Number.parseFloat(pcs.opacity) > 0)
          ) {
            ctrlVisible = false;
          }
        }
        if (!ctrlVisible) continue;
        const desc = `${ctrl.textContent ?? ''} ${ctrl.getAttribute('aria-label') ?? ''} ${ctrl.getAttribute('title') ?? ''}`.trim();
        const isCopyBtn = ctrl.tagName === 'BUTTON' && copyRe.test(desc);
        if (isCopyBtn) {
          hasCopyDiagnostic = true;
        }
        if (issueActionRe.test(desc) && !isCopyBtn) {
          hasIssueAction = true;
        }
        if (ctrl.tagName === 'A' && (ctrl.getAttribute('href') ?? '').includes('github.com')) {
          hasGithubLink = true;
        }
      }
      const matchesHealthText = healthTextRe.test(el.textContent ?? '');

      let depth = 0;
      for (let p: HTMLElement | null = el; p && p !== body; p = p.parentElement) {
        depth += 1;
      }

      const isSemanticContainer = el.matches(
        '.banner, [role="status"], [role="alert"], section.panel, article'
      );

      // Tier A (preferred): deepest visible container holding BOTH Copy Diagnostic AND GitHub/Issue action,
      // preferring semantic banner containers over bare div wrappers (e.g., <div class="row">)
      if (hasCopyDiagnostic && (hasGithubLink || hasIssueAction)) {
        if (isSemanticContainer) {
          if (depth > bestSemanticTierADepth) {
            bestSemanticTierADepth = depth;
            bestSemanticTierA = el;
          }
        } else if (depth > bestAnyTierADepth) {
          bestAnyTierADepth = depth;
          bestAnyTierA = el;
        }
        continue;
      }

      // Tier B (fallback only if Tier A finds nothing): semantic banner containers only (strictly excludes bare div)
      if (isSemanticContainer && (hasCopyDiagnostic || (hasGithubLink && matchesHealthText))) {
        if (depth > bestTierBDepth) {
          bestTierBDepth = depth;
          bestTierB = el;
        }
      }
    }

    const best = bestSemanticTierA ?? bestAnyTierA ?? bestTierB;
    if (!best) return false;
    best.setAttribute('data-e2e-health-banner', 'true');
    return true;
  });

  assert(
    stamped,
    'Degraded Parse Health banner not found inside .popup-body (expected copy diagnostic button / GitHub issue link)'
  );
  return popupPage.locator('[data-e2e-health-banner="true"]').first();
}
