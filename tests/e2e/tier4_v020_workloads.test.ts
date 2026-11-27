/**
 * Tier 4 (v0.2.0): Real-World Multi-Feature User Journeys E2E Test Suite (10 Journeys)
 *
 * 10 genuine, opaque-box, end-to-end application workloads (`T4-V2-01`..`T4-V2-10`)
 * matching TEST_INFRA.md §4 and derived strictly from ORIGINAL_REQUEST.md, PROJECT.md,
 * v0.2.0_plan.md, and AGENTS.md.
 *
 * Rules upheld:
 * - Zero vitest imports, zero top-level await, zero top-level contract crashes.
 * - Zero unpinned internal filenames (driven strictly via public harnesses and exports).
 * - Zero tautologies, relative local-noon dates, full try/finally cleanup (with
 *   deterministic `cloudSync.disable` before `bg.cleanup()`).
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as Shared from '@keepxclean/shared';
import { describe, it, expect, setTestTier } from './harness';
import {
  createVirtualBrowser,
  validateBrandLogoSvg,
  validateBrandTokens,
} from './fixtures/browser-env';
import {
  REPO_ROOT,
  GRAPHQL_URLS,
  CHROME_SYNC_QUOTA_BYTES_PER_ITEM,
  PNG_MAGIC_BYTES,
  requireExport,
  requireModule,
  requireFile,
  computeChromeStorageItemBytes,
  makeExtractedAuthor,
  makeExtractedTweet,
  makeOfficialGrokAuthor,
  buildGraphqlTweetEntry,
  buildHomeTimelinePayload,
  buildTweetDetailPayload,
  buildSearchTimelinePayload,
  buildEmptyCoreGraphqlPayload,
  installVirtualDomGlobals,
  bootBackgroundHarness,
  bootPageInterceptorHarness,
  mountExtensionComponent,
  createSqliteD1Adapter,
  applyServerMigrations,
  runTsxCli,
  createLegacyV012ConfigFixture,
  createValidKxcPackV1,
  triggerBattleReportRender,
  type BackgroundHarness,
  type MountedExtensionComponent,
} from './fixtures/v020-helpers';

setTestTier(4);

const sharedMod = Shared as unknown as Record<string, unknown>;

// ============================================================================
// Pure Local Utilities (Zero Side Effects)
// ============================================================================

async function cleanupBg(bg: BackgroundHarness): Promise<void> {
  try {
    await bg.sendCommand({ type: 'cloudSync.disable' });
  } catch {
    // Best-effort debounce timer cancellation before tearing down harness
  } finally {
    await bg.cleanup();
  }
}

function formatLocalDateOffset(daysAgo: number): string {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const d = new Date(noon.getTime() - daysAgo * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localTimestampForOffset(daysAgo: number, extraMs = 0): number {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  return noon.getTime() - daysAgo * 86_400_000 + extraMs;
}

function reconstructSyncedPayload(
  syncStore: Record<string, unknown>
): { meta: Record<string, any>; payload: Record<string, any> } {
  const meta = syncStore['kxc_sync_meta_v1'] as Record<string, any> | undefined;
  expect(meta).toBeDefined();
  expect(meta!.v).toBe(1);
  expect(typeof meta!.chunks).toBe('number');
  expect(meta!.chunks).toBeGreaterThanOrEqual(1);
  expect(typeof meta!.sha256).toBe('string');
  expect(meta!.sha256).toMatch(/^[0-9a-f]{64}$/i);

  let joined = '';
  for (let i = 0; i < meta!.chunks; i++) {
    const chunk = syncStore[`kxc_sync_chunk_${i}`];
    expect(typeof chunk).toBe('string');
    joined += chunk as string;
  }
  expect(crypto.createHash('sha256').update(joined, 'utf8').digest('hex')).toBe(
    meta!.sha256.toLowerCase()
  );
  return { meta: meta!, payload: JSON.parse(joined) as Record<string, any> };
}

function isLightCanvasStyle(style: string): boolean {
  const s = style.trim().toLowerCase();
  if (!s) return false;
  const luminances: number[] = [];

  for (const m of s.matchAll(/#([0-9a-f]{3,8})\b/g)) {
    const hex = m[1];
    let r: number;
    let g: number;
    let b: number;
    if (hex.length === 3 || hex.length === 4) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      continue;
    }
    luminances.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  for (const m of s.matchAll(
    /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/g
  )) {
    luminances.push(0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]));
  }
  for (const m of s.matchAll(/hsla?\([^,]+,[^,]+,\s*(\d+(?:\.\d+)?)%/g)) {
    luminances.push((Number(m[1]) / 100) * 255);
  }
  if (/\bwhite\b/.test(s)) luminances.push(255);
  if (/\bblack\b/.test(s)) luminances.push(0);

  return luminances.length > 0 && luminances.every((l) => l >= 200);
}

async function verifyEmittedPngExport(mounted: MountedExtensionComponent): Promise<void> {
  const blobCalls = mounted.canvasRecorder.toBlobCalls;
  const dataUrlCalls = mounted.canvasRecorder.toDataUrlCalls;
  expect(blobCalls.length + dataUrlCalls.length).toBeGreaterThanOrEqual(1);

  for (const call of [...blobCalls, ...dataUrlCalls]) {
    expect(call.type).toBe('image/png');
    expect(call.width).toBeGreaterThan(0);
    expect(call.height).toBeGreaterThan(0);
  }

  let verifiedEmittedPng = false;
  if (blobCalls.length > 0) {
    const deliveredUrlBlob = mounted.createdObjectUrls
      .map((e) => e.obj)
      .find((b): b is Blob => Boolean(b && typeof (b as Blob).arrayBuffer === 'function'));

    let deliveredClipboardBlob: Blob | undefined;
    for (const entry of mounted.clipboardWrites) {
      const items = Array.isArray(entry) ? entry : [entry];
      for (const item of items as Array<any>) {
        const candidate =
          typeof item?.getType === 'function'
            ? await item.getType('image/png')
            : item?.items?.['image/png'];
        if (candidate && typeof candidate.arrayBuffer === 'function') {
          deliveredClipboardBlob = candidate as Blob;
          break;
        }
      }
      if (deliveredClipboardBlob) break;
    }

    const emittedBlob = deliveredUrlBlob ?? deliveredClipboardBlob ?? blobCalls[0].blob;
    expect(emittedBlob).toBeDefined();
    expect(emittedBlob!.type).toBe('image/png');
    const bytes = new Uint8Array(await emittedBlob!.arrayBuffer());
    expect([...bytes.subarray(0, 8)]).toEqual([...PNG_MAGIC_BYTES]);
    verifiedEmittedPng = true;
  }

  if (dataUrlCalls.length > 0) {
    const dataUrl = dataUrlCalls[0].dataUrl;
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
    expect([...buf.subarray(0, 8)]).toEqual([...PNG_MAGIC_BYTES]);
    verifiedEmittedPng = true;
  }

  expect(verifiedEmittedPng).toBe(true);
}

function parseCliPushBaseArgs(pkgScripts: Record<string, string>): string[] {
  const raw = pkgScripts['cloud-rules:push'] ?? '';
  const idx = raw.indexOf('cloud-rules.ts');
  if (idx === -1) return [];
  const tail = raw.slice(idx + 'cloud-rules.ts'.length).trim();
  return tail ? tail.split(/\s+/).filter(Boolean) : [];
}

function collectAllKeys(obj: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [subK, subT] of collectAllKeys(v, full)) {
        out.set(subK, subT);
      }
    } else {
      out.set(full, typeof v);
    }
  }
  return out;
}

function walkFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

// ============================================================================
// Tier 4 (v0.2.0): Real-World Multi-Feature User Journeys (10 Journeys)
// ============================================================================

describe('Tier 4 (v0.2.0): Real-World Multi-Feature User Journeys (10 Journeys)', () => {
  // -------------------------------------------------------------------------
  // T4-V2-01: Fresh-Install Onboarding & Grok Control
  // -------------------------------------------------------------------------
  it(
    'T4-V2-01: Fresh-Install Onboarding & Grok Control',
    async () => {
      const OFFICIAL_GROK_UID = requireExport<string>(
        sharedMod,
        'OFFICIAL_GROK_UID',
        '@keepxclean/shared'
      );
      const loadPopup = async () => {
        const mod = await requireModule<{ App?: any; default?: any }>(
          'apps/extension/entrypoints/popup/App.tsx',
          'Popup App'
        );
        return mod.App ?? mod.default;
      };

      const bg = await bootBackgroundHarness();
      try {
        // (1) Fresh install: zero auto-opened tabs, onboarding visible, privacy defaults false
        await bg.fireInstalled('install');
        expect(bg.chromeEnv.createdTabs).toHaveLength(0);

        const stFresh = await bg.sendCommand<any>({ type: 'state.get' });
        expect(stFresh.ok).toBe(true);
        expect(stFresh.data.config.onboardingDismissed).toBe(false);
        expect(stFresh.data.config.syncNativeXBlock).toBe(false);
        expect(stFresh.data.config.enableCrowdReport).toBe(false);

        // (2) Mount Popup verifying header switch first & onboarding card visible inside .popup-body
        let openBodyBtns = 0;
        let openBodyTextLen = 0;
        const mountedOpen = await mountExtensionComponent(
          loadPopup,
          structuredClone(stFresh.data),
          { url: 'chrome-extension://kxc-e2e-extension/popup.html' }
        );
        try {
          const header = mountedOpen.document.querySelector('.popup-header');
          const body = mountedOpen.document.querySelector('.popup-body');
          expect(header).not.toBeNull();
          expect(body).not.toBeNull();

          const allSwitches = mountedOpen.document.querySelectorAll('button[role="switch"]');
          const headerSwitch = header!.querySelector('button[role="switch"]');
          expect(headerSwitch).not.toBeNull();
          expect(allSwitches[0]).toBe(headerSwitch);

          openBodyBtns = body!.querySelectorAll('button').length;
          openBodyTextLen = (body!.textContent ?? '').trim().length;
        } finally {
          await mountedOpen.cleanup();
        }

        // (3) User picks strict preset, collapse mode, and dismisses onboarding
        expect((await bg.sendCommand({ type: 'config.preset', preset: 'strict' })).ok).toBe(true);
        expect(
          (
            await bg.sendCommand({
              type: 'config.patch',
              patch: { interceptionMode: 'collapse', onboardingDismissed: true },
            })
          ).ok
        ).toBe(true);

        const stStrict = await bg.sendCommand<any>({ type: 'state.get' });
        expect(stStrict.data.config.preset).toBe('strict');
        expect(stStrict.data.config.interceptionMode).toBe('collapse');
        expect(stStrict.data.config.onboardingDismissed).toBe(true);
        expect(stStrict.data.config.syncNativeXBlock).toBe(false);
        expect(stStrict.data.config.enableCrowdReport).toBe(false);

        // Verify Popup onboarding card disappears after dismissal
        const mountedDismissed = await mountExtensionComponent(
          loadPopup,
          structuredClone(stStrict.data),
          { url: 'chrome-extension://kxc-e2e-extension/popup.html' }
        );
        try {
          const body = mountedDismissed.document.querySelector('.popup-body')!;
          expect(openBodyBtns).toBeGreaterThan(body.querySelectorAll('button').length);
          expect(openBodyTextLen).toBeGreaterThan((body.textContent ?? '').trim().length);
        } finally {
          await mountedDismissed.cleanup();
        }

        // (4) Process TweetDetail thread with 5 realistic replies
        const opAuthor = { restId: '410000', screenName: 'thread_author_1', followersCount: 8000 };
        const grokAuthor = makeOfficialGrokAuthor({
          followersCount: 100,
          dailyTweetRate: 2000,
          statusesCount: 730_000,
        });

        const buildThread = () =>
          buildTweetDetailPayload(
            {
              tweetId: '41000',
              text: 'Discussing Manifest V3 alarm scheduling limits in Chromium.',
              author: opAuthor,
            },
            [
              {
                tweetId: '41001',
                text: 'Manifest V3 alarms enforce a 30-second minimum period in packed builds.',
                author: {
                  restId: grokAuthor.restId,
                  screenName: grokAuthor.screenName,
                  followersCount: 100,
                  dailyTweetRate: 2000,
                  statusesCount: 730_000,
                },
              },
              {
                tweetId: '41002',
                text: '@grok explain',
                author: { restId: '410002', screenName: 'stranger_short', followersCount: 6000 },
              },
              {
                tweetId: '41003',
                text: '@grok verify',
                author: opAuthor,
              },
              {
                tweetId: '41004',
                text: '@grok check',
                author: {
                  restId: '410004',
                  screenName: 'followed_peer',
                  followersCount: 6000,
                  following: true,
                },
              },
              {
                tweetId: '41005',
                text: '@grok please explain how MV3 alarms work in detail',
                author: { restId: '410005', screenName: 'stranger_detailed', followersCount: 6000 },
              },
            ]
          );

        const res1 = Shared.processGraphqlResponsePayload(
          buildThread(),
          GRAPHQL_URLS.tweetDetail,
          '/thread_author_1/status/41000',
          stStrict.data.config
        );
        expect(res1.decisionsByTweetId['41001']?.decision?.blocked).toBe(false); // official @grok protected!
        expect(res1.decisionsByTweetId['41002']?.decision?.blocked).toBe(true); // stranger short summon
        expect(res1.decisionsByTweetId['41002']?.decision?.ruleId).toBe('grok_filter');
        expect(res1.decisionsByTweetId['41002']?.decision?.action).toBe('collapse');
        expect(res1.decisionsByTweetId['41003']?.decision?.blocked).toBe(false); // OP exempt
        expect(res1.decisionsByTweetId['41004']?.decision?.blocked).toBe(false); // followed exempt
        expect(res1.decisionsByTweetId['41005']?.decision?.blocked).toBe(false); // >16 weighted len

        // (5) User opts into hideGrokReplies: true -> @grok collapsed; whitelisting restores it
        const hideRes = await bg.sendCommand({
          type: 'config.patch',
          patch: {
            rules: {
              grokFilter: {
                hideGrokReplies: true,
              },
            },
          },
        });
        expect(hideRes.ok).toBe(true);
        const stHideGrok = await bg.sendCommand<any>({ type: 'state.get' });
        expect(stHideGrok.data.config.rules.grokFilter.hideGrokReplies).toBe(true);
        expect(stHideGrok.data.config.rules.grokFilter.protectOfficialGrok).toBe(true);
        const res2 = Shared.processGraphqlResponsePayload(
          buildThread(),
          GRAPHQL_URLS.tweetDetail,
          '/thread_author_1/status/41000',
          stHideGrok.data.config
        );
        expect(res2.decisionsByTweetId['41001']?.decision?.blocked).toBe(true);
        expect(res2.decisionsByTweetId['41001']?.decision?.ruleId).toBe('grok_filter');
        expect(res2.decisionsByTweetId['41001']?.decision?.action).toBe('collapse');

        expect(
          (
            await bg.sendCommand({
              type: 'account.save',
              list: 'white',
              entry: {
                uid: OFFICIAL_GROK_UID,
                screenName: 'grok',
                addedAt: 1_700_000_000_000,
              },
            })
          ).ok
        ).toBe(true);
        const stWlGrok = await bg.sendCommand<any>({ type: 'state.get' });
        const res3 = Shared.processGraphqlResponsePayload(
          buildThread(),
          GRAPHQL_URLS.tweetDetail,
          '/thread_author_1/status/41000',
          stWlGrok.data.config
        );
        expect(res3.decisionsByTweetId['41001']?.decision?.blocked).toBe(false);
        expect(res3.decisionsByTweetId['41001']?.decision?.action).toBe('allow');
      } finally {
        await cleanupBg(bg);
      }
    },
    { timeout: 15000 }
  );

  // -------------------------------------------------------------------------
  // T4-V2-02: v0.1.2 Power-User Upgrade + Water-Army Dedup & Domain Filter
  // -------------------------------------------------------------------------
  it('T4-V2-02: v0.1.2 Power-User Upgrade + Water-Army Dedup & Domain Filter', async () => {
    const ThreadDuplicateTracker = requireExport<new () => any>(
      sharedMod,
      'ThreadDuplicateTracker',
      '@keepxclean/shared'
    );
    const resolveEnabledCloudLangGroups = requireExport<(cfg: any) => string[]>(
      sharedMod,
      'resolveEnabledCloudLangGroups',
      '@keepxclean/shared'
    );

    const legacy = createLegacyV012ConfigFixture({
      locale: 'zh-CN',
      syncNativeXBlock: true,
      enableCrowdReport: true,
    });
    const bg = await bootBackgroundHarness({
      local: { [Shared.STORAGE_KEYS.CONFIG]: legacy },
    });
    try {
      // (1) Verify seamless v0.1.2 upgrade hydration
      const st0 = await bg.sendCommand<any>({ type: 'state.get' });
      expect(st0.ok).toBe(true);
      const cfg0 = st0.data.config;
      expect(cfg0.version).toBe(1);
      expect(cfg0.onboardingDismissed).toBe(true);
      expect(cfg0.syncNativeXBlock).toBe(true);
      expect(cfg0.enableCrowdReport).toBe(true);
      expect(cfg0.rules.replySpam.blockDuplicateReplies).toBe(true);
      expect(cfg0.rules.grokFilter.protectOfficialGrok).toBe(true);
      expect(resolveEnabledCloudLangGroups(cfg0)).toContain('zh');

      // (2) User saves raw URL/domain inputs -> normalized to root domains
      expect(
        (
          await bg.sendCommand({
            type: 'domain.save',
            item: { id: 'dom-pump', domain: 'https://www.Pump.Fun/coin', enabled: true },
          })
        ).ok
      ).toBe(true);
      expect(
        (
          await bg.sendCommand({
            type: 'domain.save',
            item: { id: 'dom-tme', domain: 't.me', enabled: true },
          })
        ).ok
      ).toBe(true);

      const st1 = await bg.sendCommand<any>({ type: 'state.get' });
      const savedDomains = st1.data.config.rules.domainFilter.items.map((d: any) => d.domain);
      expect(savedDomains).toContain('pump.fun');
      expect(savedDomains).toContain('t.me');

      // (3) Process TweetDetail with 4 water-army bots + OP + followed + QT pump.fun + safe not-t.me
      const opAuthor = { restId: '420000', screenName: 'power_op', followersCount: 9000 };
      const payload = buildTweetDetailPayload(
        {
          tweetId: '42000',
          text: 'Sharing our v0.2.0 deterministic filtering notes.',
          author: opAuthor,
        },
        [
          {
            tweetId: '42001',
            text: 'Check out my pinned channel for exclusive alpha drops today!',
            author: { restId: '420001', screenName: 'water_bot_1', followersCount: 6000 },
          },
          {
            tweetId: '42002',
            text: '@power_op CHECK OUT MY PINNED CHANNEL FOR EXCLUSIVE ALPHA DROPS TODAY!!! https://t.co/a',
            author: { restId: '420002', screenName: 'water_bot_2', followersCount: 6000 },
          },
          {
            tweetId: '42003',
            text: '@water_bot_1 check out my pinned channel for exclusive alpha drops today.',
            author: { restId: '420003', screenName: 'water_bot_3', followersCount: 6000 },
          },
          {
            tweetId: '42004',
            text: 'Check out my pinned channel for exclusive alpha drops today! https://example.org/x',
            author: { restId: '420004', screenName: 'water_bot_4', followersCount: 6000 },
          },
          {
            tweetId: '42005',
            text: 'Check out my pinned channel for exclusive alpha drops today!',
            author: opAuthor,
          },
          {
            tweetId: '42006',
            text: 'Check out my pinned channel for exclusive alpha drops today!',
            author: {
              restId: '420006',
              screenName: 'followed_buddy',
              followersCount: 6000,
              following: true,
            },
          },
          {
            tweetId: '42007',
            text: 'Look at this coin thread.',
            author: { restId: '420007', screenName: 'qt_poster', followersCount: 6000 },
            quotedTweet: {
              tweetId: '420079',
              text: 'Launch happening live now.',
              urls: ['https://app.pump.fun/launch'],
              author: { restId: '420099', screenName: 'pump_scammer', followersCount: 300 },
            },
          },
          {
            tweetId: '42008',
            text: 'Reading an article on an unrelated host.',
            urls: ['https://not-t.me/safe'],
            author: { restId: '420008', screenName: 'clean_reader', followersCount: 6000 },
          },
        ]
      );

      const tracker = new ThreadDuplicateTracker();
      const processed = Shared.processGraphqlResponsePayload(
        payload,
        GRAPHQL_URLS.tweetDetail,
        '/power_op/status/42000',
        st1.data.config,
        null,
        undefined,
        tracker
      );

      // 1st bot kept; 2nd-4th blocked as reply_spam
      expect(processed.decisionsByTweetId['42001']?.decision?.blocked).toBe(false);
      for (const dupId of ['42002', '42003', '42004']) {
        expect(processed.decisionsByTweetId[dupId]?.decision?.blocked).toBe(true);
        expect(processed.decisionsByTweetId[dupId]?.decision?.ruleId).toBe('reply_spam');
      }

      // OP & followed exempted
      expect(processed.decisionsByTweetId['42005']?.decision?.blocked).toBe(false);
      expect(processed.decisionsByTweetId['42006']?.decision?.blocked).toBe(false);

      // QT domain_filter penetration with hit_uid on quoted author
      const qtDec = processed.decisionsByTweetId['42007']?.decision as any;
      expect(qtDec.blocked).toBe(true);
      expect(qtDec.ruleId).toBe('domain_filter');
      expect(qtDec.evidence.find((e: any) => e.key === 'hit_uid')?.value).toBe('420099');
      const qtLog = processed.interceptedLogs.find((l) => l.tweetId === '42007');
      expect(qtLog?.authorUid).toBe('420099');

      // Non-subdomain not-t.me allowed
      expect(processed.decisionsByTweetId['42008']?.decision?.blocked).toBe(false);
    } finally {
      await cleanupBg(bg);
    }
  });

  // -------------------------------------------------------------------------
  // T4-V2-03: Multilingual User (JA/ES) Packs + Collapse-Bar One-Click Restore
  // -------------------------------------------------------------------------
  it('T4-V2-03: Multilingual User (JA/ES) Packs + Collapse-Bar One-Click Live Restore', async () => {
    const resolveEnabledCloudLangGroups = requireExport<(cfg: any) => string[]>(
      sharedMod,
      'resolveEnabledCloudLangGroups',
      '@keepxclean/shared'
    );
    const { DomController } = await requireModule<{ DomController: new (css: string) => any }>(
      'apps/extension/src/content/dom-controller.ts',
      'DomController'
    );

    const bg = await bootBackgroundHarness();
    let vb: ReturnType<typeof createVirtualBrowser> | undefined;
    let restoreDom: (() => void) | undefined;
    let controller: any;
    try {
      vb = createVirtualBrowser({
        url: 'https://x.com/home',
        html: `<!DOCTYPE html><html><body>
          <main>
            <div data-testid="cellInnerDiv">
              <article data-testid="tweet" id="art-ja-follow">
                <a href="/ja_pod_acct/status/43001"><time datetime="2026-11-25T00:01:00Z">1m</time></a>
              </article>
            </div>
          </main>
        </body></html>`,
      });
      restoreDom = installVirtualDomGlobals(vb);
      // (1) Switch locale to 'ja' -> universal + en + ja active (NOT es)
      expect((await bg.sendCommand({ type: 'config.patch', patch: { locale: 'ja' } })).ok).toBe(
        true
      );
      const stJa = await bg.sendCommand<any>({ type: 'state.get' });
      const activeGroups = resolveEnabledCloudLangGroups(stJa.data.config);
      expect(activeGroups).toContain('universal');
      expect(activeGroups).toContain('en');
      expect(activeGroups).toContain('ja');
      expect(activeGroups).not.toContain('es');

      const jaFollowTweet = makeExtractedTweet({
        tweetId: '43001',
        text: 'リプでフォロバします 相互希望です',
        scene: 'reply',
        isReply: true,
        author: makeExtractedAuthor({ restId: '43101', screenName: 'ja_pod_acct' }),
      });
      const jaScamTweet = makeExtractedTweet({
        tweetId: '43002',
        text: 'お金配り 現金配布 実施中です',
        scene: 'reply',
        isReply: true,
        author: makeExtractedAuthor({ restId: '43102', screenName: 'ja_scam_acct' }),
      });
      const esFollowTweet = makeExtractedTweet({
        tweetId: '43003',
        text: 'Sígueme y te sigo 100% ahora',
        scene: 'reply',
        isReply: true,
        author: makeExtractedAuthor({ restId: '43103', screenName: 'es_pod_acct' }),
      });

      // (2) JA hits cloud-follow-ja-1; ES allowed while 'es' pack is off
      const dJa = Shared.evaluateTweet(jaFollowTweet, stJa.data.config, stJa.data.snapshot) as any;
      expect(dJa.blocked).toBe(true);
      expect(dJa.ruleId).toBe('cloud_keyword');
      expect(dJa.matchedTarget).toEqual({ kind: 'cloud_keyword', id: 'cloud-follow-ja-1' });
      expect(
        Shared.evaluateTweet(esFollowTweet, stJa.data.config, stJa.data.snapshot).blocked
      ).toBe(false);

      // (3) Mount DomController -> JA article collapsed
      controller = new DomController('');
      controller.update(stJa.data.config, stJa.data.snapshot);
      controller.ingest(
        { '43001': { tweet: jaFollowTweet } },
        { ja_pod_acct: { author: jaFollowTweet.author } }
      );
      const art = vb.document.getElementById('art-ja-follow')!;
      expect(art.getAttribute('data-kxc-hidden')).toBe('true');
      expect(
        controller.getSnapshot().filter((i: { kind: string }) => i.kind === 'collapse')
      ).toHaveLength(1);

      // (4) One-click target.disable restores JA article live while sibling cloud-scam-ja-1 stays active
      expect(
        (await bg.sendCommand({ type: 'target.disable', target: dJa.matchedTarget })).ok
      ).toBe(true);
      const stAfterDisable = await bg.sendCommand<any>({ type: 'state.get' });
      controller.update(stAfterDisable.data.config, stAfterDisable.data.snapshot);
      expect(art.getAttribute('data-kxc-hidden')).toBeNull();
      expect(
        controller.getSnapshot().filter((i: { kind: string }) => i.kind === 'collapse')
      ).toHaveLength(0);

      const dJaSibling = Shared.evaluateTweet(
        jaScamTweet,
        stAfterDisable.data.config,
        stAfterDisable.data.snapshot
      ) as any;
      expect(dJaSibling.blocked).toBe(true);
      expect(dJaSibling.matchedTarget).toEqual({ kind: 'cloud_keyword', id: 'cloud-scam-ja-1' });

      // (5) Toggle 'es' pack ON -> Spanish spam now intercepted
      expect(
        (await bg.sendCommand({ type: 'cloudLangGroup.toggle', group: 'es', enabled: true })).ok
      ).toBe(true);
      const stEs = await bg.sendCommand<any>({ type: 'state.get' });
      const dEs = Shared.evaluateTweet(esFollowTweet, stEs.data.config, stEs.data.snapshot) as any;
      expect(dEs.blocked).toBe(true);
      expect(dEs.ruleId).toBe('cloud_keyword');
      expect(dEs.matchedTarget).toEqual({ kind: 'cloud_keyword', id: 'cloud-follow-es-1' });
    } finally {
      controller?.dispose();
      restoreDom?.();
      vb?.cleanup();
      await cleanupBg(bg);
    }
  });

  // -------------------------------------------------------------------------
  // T4-V2-04: For You vs Following Scene Strategy Across Home & Search Feeds
  // -------------------------------------------------------------------------
  it('T4-V2-04: For You vs Following Scene Strategy Across Home & Search Feeds', async () => {
    const bg = await bootBackgroundHarness();
    try {
      expect(
        (
          await bg.sendCommand({
            type: 'config.patch',
            patch: {
              interceptionMode: 'collapse',
              sceneModes: { for_you: 'strip', following: 'bypass', search: 'collapse' },
            },
          })
        ).ok
      ).toBe(true);
      expect(
        (
          await bg.sendCommand({
            type: 'keyword.save',
            item: {
              id: 'kw-scene-j',
              pattern: 'scene_journey_noise',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
            },
          })
        ).ok
      ).toBe(true);
      expect(
        (
          await bg.sendCommand({
            type: 'account.save',
            list: 'black',
            entry: { uid: '40401', screenName: 'blocked_in_following', addedAt: 1_700_000_000_000 },
          })
        ).ok
      ).toBe(true);

      const st = await bg.sendCommand<any>({ type: 'state.get' });
      const cfg = st.data.config;

      // (2) HomeTimeline (for_you: 'strip') -> noise stripped, clean kept
      const fyPayload = buildHomeTimelinePayload(
        [
          buildGraphqlTweetEntry({
            tweetId: '44001',
            text: 'Check out scene_journey_noise right now!',
            author: { restId: '44101', screenName: 'fy_spam' },
          }),
          buildGraphqlTweetEntry({
            tweetId: '44002',
            text: 'Insightful systems engineering write-up.',
            author: { restId: '44102', screenName: 'fy_clean' },
          }),
        ],
        'for_you'
      );
      const fyRes = Shared.processGraphqlResponsePayload(fyPayload, GRAPHQL_URLS.forYou, '/home', cfg);
      expect(fyRes.modified).toBe(true);
      expect(fyRes.decisionsByTweetId['44001']?.decision?.action).toBe('strip');
      const fyEntries = (fyPayload as any).data.home.home_timeline_urt.instructions[0].entries;
      expect(fyEntries.map((e: any) => e.entryId)).toEqual(['tweet-44002']);

      // (3) HomeLatestTimeline (following: 'bypass') -> noise bypassed, local blocklist collapsed, ad stripped
      const flPayload = buildHomeTimelinePayload(
        [
          buildGraphqlTweetEntry({
            tweetId: '44003',
            text: 'Talking about scene_journey_noise in Following.',
            author: { restId: '44103', screenName: 'following_peer' },
          }),
          buildGraphqlTweetEntry({
            tweetId: '44004',
            text: 'Normal post from blocked user 40401.',
            author: { restId: '40401', screenName: 'blocked_in_following' },
          }),
          buildGraphqlTweetEntry({
            tweetId: '44005',
            text: 'Promoted ad in Following feed.',
            isPromoted: true,
            author: { restId: '44105', screenName: 'ad_brand_4' },
          }),
        ],
        'following'
      );
      const flRes = Shared.processGraphqlResponsePayload(
        flPayload,
        GRAPHQL_URLS.following,
        '/home',
        cfg
      );
      expect(flRes.decisionsByTweetId['44003']?.decision?.blocked).toBe(false);
      expect(flRes.decisionsByTweetId['44004']?.decision?.blocked).toBe(true);
      expect(flRes.decisionsByTweetId['44004']?.decision?.ruleId).toBe('local_blocklist');
      expect(flRes.decisionsByTweetId['44004']?.decision?.action).toBe('collapse');
      expect(flRes.decisionsByTweetId['44005']?.decision?.blocked).toBe(true);
      expect(flRes.decisionsByTweetId['44005']?.decision?.ruleId).toBe('promoted_ad');
      expect(flRes.decisionsByTweetId['44005']?.decision?.action).toBe('strip');
      const flIds = (flPayload as any).data.home.home_timeline_urt.instructions[0].entries.map(
        (e: any) => e.entryId
      );
      expect(flIds).toContain('tweet-44003');
      expect(flIds).toContain('tweet-44004');
      expect(flIds).not.toContain('tweet-44005');

      // (4) SearchTimeline (search: 'collapse') -> noise collapsed & kept in entries
      const searchPayload = buildSearchTimelinePayload([
        buildGraphqlTweetEntry({
          tweetId: '44006',
          text: 'Search result with scene_journey_noise.',
          author: { restId: '44106', screenName: 'search_spam' },
        }),
      ]);
      const searchRes = Shared.processGraphqlResponsePayload(
        searchPayload,
        GRAPHQL_URLS.search,
        '/search',
        cfg
      );
      expect(searchRes.decisionsByTweetId['44006']?.decision?.blocked).toBe(true);
      expect(searchRes.decisionsByTweetId['44006']?.decision?.action).toBe('collapse');
      const searchIds = (
        searchPayload as any
      ).data.search_by_raw_query.search_timeline.timeline.instructions[0].entries.map(
        (e: any) => e.entryId
      );
      expect(searchIds).toContain('tweet-44006');
    } finally {
      await cleanupBg(bg);
    }
  });

  // -------------------------------------------------------------------------
  // T4-V2-05: Offline Topic Rule Pack Author → Consumer Lifecycle
  // -------------------------------------------------------------------------
  it('T4-V2-05: Offline Topic Rule Pack Author → Consumer Lifecycle', async () => {
    await requireModule('packages/shared/src/packs.ts', 'shared packs');
    const validateRulePack = requireExport<(input: unknown) => any>(
      sharedMod,
      'validateRulePack',
      '@keepxclean/shared'
    );
    const serializeRulePack = requireExport<(pack: any) => string>(
      sharedMod,
      'serializeRulePack',
      '@keepxclean/shared'
    );

    // (1) Author creates & exports offline .kxc-pack.json with zero private fields
    const draftPack = createValidKxcPackV1({ id: 'pack-author-t4' });
    const exportedJson = serializeRulePack(draftPack);
    for (const forbidden of [
      'whitelistUids',
      'localBlocklistUids',
      'customApiBaseUrl',
      'syncNativeXBlock',
      'enableCrowdReport',
    ]) {
      expect(exportedJson).not.toContain(forbidden);
    }
    const parsedPack = validateRulePack(JSON.parse(exportedJson));
    expect(parsedPack.id).toBe('pack-author-t4');

    // (2) Consumer has personal rules/lists and installs exported offline pack
    const bg = await bootBackgroundHarness();
    try {
      expect(
        (
          await bg.sendCommand({
            type: 'keyword.save',
            item: {
              id: 'pers-kw-t4',
              pattern: 'consumer_personal_kw',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
            },
          })
        ).ok
      ).toBe(true);
      expect(
        (
          await bg.sendCommand({
            type: 'domain.save',
            item: { id: 'pers-dom-t4', domain: 'consumer-personal.example', enabled: true },
          })
        ).ok
      ).toBe(true);
      expect(
        (
          await bg.sendCommand({
            type: 'account.save',
            list: 'black',
            entry: { uid: '45001', screenName: 'consumer_blocked', addedAt: 1_700_000_000_000 },
          })
        ).ok
      ).toBe(true);

      expect((await bg.sendCommand({ type: 'pack.install', pack: parsedPack })).ok).toBe(true);
      const st1 = await bg.sendCommand<any>({ type: 'state.get' });

      const kwTweet = makeExtractedTweet({
        tweetId: '45011',
        text: 'Guaranteed 1000x moonshot alpha.',
        author: makeExtractedAuthor({ restId: '45111', screenName: 'u_pk_kw' }),
      });
      const domTweet = makeExtractedTweet({
        tweetId: '45012',
        text: 'Join the token launch.',
        urls: ['https://app.pump-scam.example/join'],
        author: makeExtractedAuthor({ restId: '45112', screenName: 'u_pk_dom' }),
      });
      const uidTweet = makeExtractedTweet({
        tweetId: '45013',
        text: 'Ordinary message from pack-blocked bot.',
        author: makeExtractedAuthor({ restId: '8877665544', screenName: 'pack_spam_bot' }),
      });
      const persTweet = makeExtractedTweet({
        tweetId: '45014',
        text: 'Contains consumer_personal_kw token.',
        author: makeExtractedAuthor({ restId: '45114', screenName: 'u_pers' }),
      });

      // (3) All 3 pack triggers intercept with exact matchedTarget
      for (const [tw, itemId] of [
        [kwTweet, 'pk-kw-1'],
        [domTweet, 'pk-dom-1'],
        [uidTweet, '8877665544'],
      ] as const) {
        const d = Shared.evaluateTweet(tw, st1.data.config) as any;
        expect(d.blocked).toBe(true);
        expect(d.ruleId).toBe('rule_pack');
        expect(d.matchedTarget).toEqual({
          kind: 'pack_item',
          id: itemId,
          packId: 'pack-author-t4',
        });
      }

      // (4) Disable single item pk-kw-1 -> kwTweet restores while pk-dom-1 & blockedUid stay active
      expect(
        (
          await bg.sendCommand({
            type: 'target.disable',
            target: { kind: 'pack_item', id: 'pk-kw-1', packId: 'pack-author-t4' },
          })
        ).ok
      ).toBe(true);
      const st2 = await bg.sendCommand<any>({ type: 'state.get' });
      expect(Shared.evaluateTweet(kwTweet, st2.data.config).blocked).toBe(false);
      expect(Shared.evaluateTweet(domTweet, st2.data.config).ruleId).toBe('rule_pack');
      expect(Shared.evaluateTweet(uidTweet, st2.data.config).ruleId).toBe('rule_pack');

      // (5) Toggle pack OFF -> ON -> Uninstall cleanly with zero residue
      expect(
        (await bg.sendCommand({ type: 'pack.toggle', id: 'pack-author-t4', enabled: false })).ok
      ).toBe(true);
      const stOff = await bg.sendCommand<any>({ type: 'state.get' });
      expect(Shared.evaluateTweet(domTweet, stOff.data.config).blocked).toBe(false);
      expect(Shared.evaluateTweet(uidTweet, stOff.data.config).blocked).toBe(false);

      expect(
        (await bg.sendCommand({ type: 'pack.toggle', id: 'pack-author-t4', enabled: true })).ok
      ).toBe(true);
      const stOn = await bg.sendCommand<any>({ type: 'state.get' });
      expect(Shared.evaluateTweet(domTweet, stOn.data.config).ruleId).toBe('rule_pack');
      expect(Shared.evaluateTweet(kwTweet, stOn.data.config).blocked).toBe(false); // disabled item preserved!

      expect((await bg.sendCommand({ type: 'pack.uninstall', id: 'pack-author-t4' })).ok).toBe(
        true
      );
      const stUninstalled = await bg.sendCommand<any>({ type: 'state.get' });
      expect(stUninstalled.data.config.installedPacks).toHaveLength(0);
      expect(stUninstalled.data.config.rules.keywords.items).toHaveLength(1);
      expect(stUninstalled.data.config.rules.domainFilter.items).toHaveLength(1);
      expect(Object.keys(stUninstalled.data.config.localBlocklistUids)).toEqual(['45001']);
      expect(Shared.evaluateTweet(persTweet, stUninstalled.data.config).ruleId).toBe('keyword');
    } finally {
      await cleanupBg(bg);
    }
  });

  // -------------------------------------------------------------------------
  // T4-V2-06: Two-Device Cross-Device Sync + Conflict Merge + Quota Resilience
  // -------------------------------------------------------------------------
  it(
    'T4-V2-06: Two-Device Cross-Device Sync + Conflict Merge + Quota Resilience',
    async () => {
      // (1) Device A configures strict + sceneModes + keyword + domain + pack + local blocklist
      let remoteDump: Record<string, unknown> = {};
      const bgA = await bootBackgroundHarness();
      try {
        expect((await bgA.sendCommand({ type: 'config.preset', preset: 'strict' })).ok).toBe(true);
        expect(
          (
            await bgA.sendCommand({
              type: 'config.patch',
              patch: { sceneModes: { for_you: 'strip' } },
            })
          ).ok
        ).toBe(true);
        expect(
          (
            await bgA.sendCommand({
              type: 'keyword.save',
              item: {
                id: 'kw-dev-a',
                pattern: 'dev_a_sync_pat',
                isRegex: false,
                scopes: ['text'],
                enabled: true,
              },
            })
          ).ok
        ).toBe(true);
        expect(
          (
            await bgA.sendCommand({
              type: 'domain.save',
              item: { id: 'dom-dev-a', domain: 'dev-a.example', enabled: true },
            })
          ).ok
        ).toBe(true);
        expect(
          (
            await bgA.sendCommand({
              type: 'pack.install',
              pack: createValidKxcPackV1({ id: 'pack-dev-a' }),
            })
          ).ok
        ).toBe(true);
        expect(
          (
            await bgA.sendCommand({
              type: 'account.save',
              list: 'black',
              entry: { uid: '11111', screenName: 'dev_a_local_only', addedAt: 1_700_000_000_000 },
            })
          ).ok
        ).toBe(true);

        expect((await bgA.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);
        const { meta, payload } = reconstructSyncedPayload(bgA.chromeEnv.syncStore);
        for (let i = 0; i < meta.chunks; i++) {
          const key = `kxc_sync_chunk_${i}`;
          const val = String(bgA.chromeEnv.syncStore[key]);
          expect(Buffer.byteLength(val, 'utf8')).toBeLessThanOrEqual(6144);
          expect(computeChromeStorageItemBytes(key, val)).toBeLessThanOrEqual(
            CHROME_SYNC_QUOTA_BYTES_PER_ITEM
          );
        }
        const syncedA = (payload.config ?? payload) as Record<string, unknown>;
        expect('localBlocklistUids' in syncedA).toBe(false);
        expect(JSON.stringify(bgA.chromeEnv.syncStore)).not.toContain('11111');
        remoteDump = structuredClone(bgA.chromeEnv.syncStore);
      } finally {
        await cleanupBg(bgA);
      }

      // (2) Device B boots with remote sync data + local kw-dev-b + 500 local blocklist UIDs + whitelist
      const localBlocklist500: Record<
        string,
        { uid: string; screenName: string; addedAt: number }
      > = {};
      for (let i = 0; i < 500; i++) {
        const uid = String(600000 + i);
        localBlocklist500[uid] = {
          uid,
          screenName: `local_spam_${i}`,
          addedAt: 1_700_000_000_000,
        };
      }
      const seededDeviceBCfg = {
        ...(Shared.createDefaultConfig('standard') as unknown as Record<string, any>),
        localBlocklistUids: localBlocklist500,
        whitelistUids: {
          '77777': { uid: '77777', screenName: 'device_b_friend', addedAt: 1_700_000_000_000 },
        },
      };
      seededDeviceBCfg.rules.keywords.items = [
        {
          id: 'kw-dev-b',
          pattern: 'dev_b_sync_pat',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        },
      ];

      const bgB = await bootBackgroundHarness({
        local: { [Shared.STORAGE_KEYS.CONFIG]: seededDeviceBCfg },
        sync: remoteDump,
      });
      try {
        // (3) Enable sync -> detects conflict -> resolve 'merge'
        expect((await bgB.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);
        const stConflict = await bgB.sendCommand<any>({ type: 'state.get' });
        expect(stConflict.data.cloudSync.status).toBe('conflict');
        expect(stConflict.data.cloudSync.pendingRemote).toBeDefined();

        expect(
          (await bgB.sendCommand({ type: 'cloudSync.resolve', strategy: 'merge' })).ok
        ).toBe(true);

        const stMerged = await bgB.sendCommand<any>({ type: 'state.get' });
        const mergedKwIds = stMerged.data.config.rules.keywords.items.map((k: any) => k.id);
        expect(mergedKwIds).toContain('kw-dev-a');
        expect(mergedKwIds).toContain('kw-dev-b');
        expect(stMerged.data.config.rules.domainFilter.items[0]?.domain).toBe('dev-a.example');
        expect(stMerged.data.config.installedPacks.map((p: any) => p.id)).toContain('pack-dev-a');
        expect(Object.keys(stMerged.data.config.localBlocklistUids)).toHaveLength(500);
        expect(stMerged.data.config.whitelistUids['77777']).toBeDefined();

        // Sync store must contain ZERO of Device B's 500 local blocklist UIDs or whitelist
        const rawSyncAfterMerge = JSON.stringify(bgB.chromeEnv.syncStore);
        expect(rawSyncAfterMerge).not.toContain('600000');
        expect(rawSyncAfterMerge).not.toContain('600499');
        expect(rawSyncAfterMerge).not.toContain('77777');

        // (4) Quota overflow (>90 KB) degrades gracefully while preserving all 500 local UIDs & 65 keywords
        const syncSnapshotBeforeOverflow = structuredClone(bgB.chromeEnv.syncStore);
        const oversizedCfg = structuredClone(stMerged.data.config);
        oversizedCfg.rules.keywords.items = Array.from({ length: 65 }, (_, i) => ({
          id: `kw-quota-${i}`,
          pattern: `quota_pat_${i}_${'q'.repeat(950)}`,
          isRegex: false,
          scopes: ['text'],
          note: `quota_note_${i}_${'r'.repeat(550)}`,
          enabled: true,
        }));
        expect(
          (
            await bgB.sendCommand({
              type: 'config.replace',
              config: oversizedCfg,
              expected: JSON.stringify(stMerged.data.config),
            })
          ).ok
        ).toBe(true);

        await bgB.sendCommand({ type: 'cloudSync.pushNow' });
        const stQuota = await bgB.sendCommand<any>({ type: 'state.get' });
        expect(stQuota.data.cloudSync?.status).toBe('quota_exceeded');
        expect(typeof stQuota.data.cloudSync?.error).toBe('string');
        expect((stQuota.data.cloudSync?.error ?? '').length).toBeGreaterThan(0);
        // Pre-overflow remote sync snapshot was NOT corrupted by failed oversized write
        expect(bgB.chromeEnv.syncStore).toEqual(syncSnapshotBeforeOverflow);
        expect(Object.keys(stQuota.data.config.localBlocklistUids)).toHaveLength(500);
        expect(stQuota.data.config.rules.keywords.items).toHaveLength(65);
      } finally {
        await cleanupBg(bgB);
      }
    },
    { timeout: 15000 }
  );

  // -------------------------------------------------------------------------
  // T4-V2-07: 7-Day History Analytics Rollover, Rule-Bar Cross-Filter & PNG
  // -------------------------------------------------------------------------
  it(
    'T4-V2-07: 7-Day History Analytics Rollover, Rule-Bar Cross-Filter & Zero-PII Battle Report PNG',
    async () => {
      const loadHistory = async () => {
        const mod = await requireModule<{ HistoryPage: any }>(
          'apps/extension/src/features/history/HistoryPage.tsx',
          'HistoryPage'
        );
        return mod.HistoryPage;
      };

      const bg = await bootBackgroundHarness();
      try {
        const ruleSequence = [
          'grok_filter',
          'domain_filter',
          'rule_pack',
          'cloud_keyword',
          'reply_spam',
        ] as const;

        // (1) Append logs spanning 10 relative local calendar days (daysAgo = 9..0)
        for (let offset = 9; offset >= 0; offset--) {
          const ruleId = ruleSequence[(9 - offset) % ruleSequence.length];
          expect(
            (
              await bg.sendCommand({
                type: 'logs.append',
                entries: [
                  {
                    id: `t4-h-${offset}`,
                    tweetId: String(940000 + offset),
                    authorUid: offset === 0 ? '88776655443322' : String(4700 + offset),
                    authorScreenName: offset === 0 ? 'secret_user_t4' : `spammer_${offset}`,
                    authorName: offset === 0 ? 'Secret User T4' : `Spammer ${offset}`,
                    tweetSnippet:
                      offset === 0 ? 'SECRET_SNIPPET_T4 leak' : `Spam content day -${offset}`,
                    scene: 'reply',
                    ruleId,
                    reasonText: `Triggered ${ruleId}`,
                    timestamp: localTimestampForOffset(offset, 1000),
                  },
                ],
              })
            ).ok
          ).toBe(true);
        }

        // Add promoted_ad today + replay duplicate tweetId '940000'
        expect(
          (
            await bg.sendCommand({
              type: 'logs.append',
              entries: [
                {
                  id: 't4-ad-1',
                  tweetId: '940101',
                  authorUid: '47101',
                  authorScreenName: 'promoted_corp',
                  authorName: 'Promoted Corp',
                  tweetSnippet: 'Buy enterprise cloud',
                  scene: 'timeline',
                  ruleId: 'promoted_ad',
                  reasonText: 'Promoted ad',
                  timestamp: localTimestampForOffset(0, 2000),
                },
                {
                  id: 't4-dup-replay',
                  tweetId: '940000',
                  authorUid: '88776655443322',
                  authorScreenName: 'secret_user_t4',
                  authorName: 'Secret User T4',
                  tweetSnippet: 'SECRET_SNIPPET_T4 leak',
                  scene: 'reply',
                  ruleId: 'reply_spam',
                  reasonText: 'Duplicate replay',
                  timestamp: localTimestampForOffset(0, 3000),
                },
              ],
            })
          ).ok
        ).toBe(true);

        const stBeforeClear = await bg.sendCommand<any>({ type: 'state.get' });
        const stats = stBeforeClear.data.stats;
        expect(stats.totalBlocked).toBe(10);
        expect(stats.totalAdsHidden).toBe(1);
        expect(stats.byRule.grok_filter).toBe(2);
        expect(stats.byRule.domain_filter).toBe(2);
        expect(stats.byRule.rule_pack).toBe(2);
        expect(stats.byRule.cloud_keyword).toBe(2);
        expect(stats.byRule.reply_spam).toBe(2);

        const hist = stats.dailyHistory as Array<{ date: string; blocked: number; ads: number }>;
        expect(hist).toHaveLength(7);
        for (let i = 1; i < hist.length; i++) {
          expect(hist[i].date > hist[i - 1].date).toBe(true);
        }
        for (const prunedDay of [9, 8, 7]) {
          expect(hist.some((h) => h.date === formatLocalDateOffset(prunedDay))).toBe(false);
        }
        expect(hist[hist.length - 1]).toEqual({
          date: formatLocalDateOffset(0),
          blocked: 1,
          ads: 1,
        });

        // (2) Mount real HistoryPage: click reply_spam breakdown bar -> cross-filters select & tbody
        const mountState = structuredClone(stBeforeClear.data);
        mountState.config.locale = 'en';
        const mounted = await mountExtensionComponent(loadHistory, mountState);
        try {
          const selects = [...mounted.document.querySelectorAll('select')];
          const ruleSelect = selects.find((s) =>
            [...s.options].some((o) => o.value === 'reply_spam')
          );
          expect(ruleSelect).toBeDefined();
          expect(mounted.document.querySelectorAll('tbody tr').length).toBe(10);

          const barCandidates = [
            ...mounted.document.querySelectorAll('button, [role="button"]'),
          ].filter((el) => !el.closest('table'));
          const barAttr = (el: Element) =>
            [
              el.getAttribute('data-rule') ?? '',
              el.getAttribute('data-rule-id') ?? '',
              el.getAttribute('data-testid') ?? '',
              el.getAttribute('aria-label') ?? '',
            ]
              .join(' ')
              .toLowerCase();
          const replyBarBtn =
            barCandidates.find((el) => barAttr(el).includes('reply_spam')) ??
            barCandidates.find((el) => {
              const txt = (el.textContent ?? '').toLowerCase();
              return txt.includes('2') && txt.includes('reply') && txt.includes('spam');
            });
          expect(replyBarBtn).toBeDefined();

          await mounted.click(replyBarBtn!);
          expect(ruleSelect!.value).toBe('reply_spam');
          expect(mounted.document.querySelectorAll('tbody tr').length).toBe(2);

          // (3) Trigger local Canvas 2D Battle Report PNG -> light theme, zero PII, real PNG magic bytes
          await triggerBattleReportRender(mounted);
          expect(mounted.canvasRecorder.canvases.length).toBeGreaterThanOrEqual(1);

          const filledRects = mounted.canvasRecorder.rects.filter(
            (r) => (r.kind === 'fill' || r.kind === 'round') && r.w > 0 && r.h > 0
          );
          const largeBgRects = filledRects.filter((r) => r.w >= 300 && r.h >= 200);
          if (largeBgRects.length > 0) {
            const largestBgRect = largeBgRects.reduce((best, cur) =>
              cur.w * cur.h > best.w * best.h ? cur : best
            );
            expect(largestBgRect.w).toBeGreaterThanOrEqual(300);
            expect(largestBgRect.h).toBeGreaterThanOrEqual(200);
            expect(isLightCanvasStyle(largestBgRect.style)).toBe(true);
          } else {
            expect(mounted.canvasRecorder.calls.some((c) => c.method === 'fill')).toBe(true);
            expect(mounted.canvasRecorder.fillStyles.length).toBeGreaterThan(0);
            expect(isLightCanvasStyle(mounted.canvasRecorder.fillStyles[0])).toBe(true);
          }

          const allText = mounted.canvasRecorder.allText;
          expect(allText.toLowerCase()).toContain('keepxclean.com');
          expect(allText).toContain('10');
          expect(allText).not.toContain('NaN');
          expect(allText).not.toContain('secret_user_t4');
          expect(allText).not.toContain('Secret User T4');
          expect(allText).not.toContain('88776655443322');
          expect(allText).not.toContain('SECRET_SNIPPET_T4');

          await verifyEmittedPngExport(mounted);
        } finally {
          await mounted.cleanup();
        }

        // (4) logs.clear clears visible log table while preserving aggregate stats & 7-day history
        expect((await bg.sendCommand({ type: 'logs.clear' })).ok).toBe(true);
        const stCleared = await bg.sendCommand<any>({ type: 'state.get' });
        expect(stCleared.data.logs).toHaveLength(0);
        expect(stCleared.data.stats.totalBlocked).toBe(10);
        expect(stCleared.data.stats.byRule.reply_spam).toBe(2);
        expect(stCleared.data.stats.dailyHistory).toHaveLength(7);
      } finally {
        await cleanupBg(bg);
      }
    },
    { timeout: 15000 }
  );

  // -------------------------------------------------------------------------
  // T4-V2-08: X GraphQL Parse Health Self-Check, Popup Banner & Auto-Recovery
  // -------------------------------------------------------------------------
  it(
    'T4-V2-08: X GraphQL Parse Health Self-Check, Popup Diagnostic Banner & Auto-Recovery',
    async () => {
      const loadPopup = async () => {
        const mod = await requireModule<{ App?: any; default?: any }>(
          'apps/extension/entrypoints/popup/App.tsx',
          'Popup App'
        );
        return mod.App ?? mod.default;
      };

      const pi = await bootPageInterceptorHarness({ startTimeMs: 1_700_000_000_000 });
      let bg: BackgroundHarness | undefined;
      try {
        bg = await bootBackgroundHarness();
        expect(
          (await bg.sendCommand({ type: 'config.patch', patch: { onboardingDismissed: true, locale: 'en' } }))
            .ok
        ).toBe(true);

        // (1-2) Feed 5 consecutive empty core payloads across HomeTimeline & TweetDetail over 20s with PII canaries
        const emptySeq = [
          {
            url: `${GRAPHQL_URLS.forYou}?ct0=SECRET_T4_COOKIE`,
            body: buildEmptyCoreGraphqlPayload('HomeTimeline', {
              home_renamed_v4: {
                handle: '@secret_canary_t4',
                dmBody: 'SECRET_T4_DM_BODY',
              },
            }),
          },
          {
            url: `${GRAPHQL_URLS.tweetDetail}?auth=Bearer+SECRET_T4_TOKEN`,
            body: buildEmptyCoreGraphqlPayload('TweetDetail', {
              threaded_v4: {
                handle: '@secret_canary_t4',
              },
            }),
          },
          {
            url: GRAPHQL_URLS.forYou,
            body: buildEmptyCoreGraphqlPayload('HomeTimeline', { home_renamed_v4: {} }),
          },
          {
            url: GRAPHQL_URLS.tweetDetail,
            body: buildEmptyCoreGraphqlPayload('TweetDetail', { threaded_v4: {} }),
          },
          {
            url: GRAPHQL_URLS.forYou,
            body: buildEmptyCoreGraphqlPayload('HomeTimeline', { home_renamed_v4: {} }),
          },
        ];

        for (let i = 0; i < emptySeq.length; i++) {
          if (i > 0) pi.advanceNow(5000); // 0s, 5s, 10s, 15s, 20s
          await pi.sendGraphqlFetch(emptySeq[i].url, emptySeq[i].body);
        }

        // (3) Verify degraded event has zero PII canaries & forward via health.update (`report` field!)
        const degraded = pi.healthEvents.find((e) => e.status === 'degraded');
        expect(degraded).toBeDefined();
        const degradedRaw = JSON.stringify(degraded);
        expect(degradedRaw).not.toContain('secret_canary_t4');
        expect(degradedRaw).not.toContain('SECRET_T4_COOKIE');
        expect(degradedRaw).not.toContain('SECRET_T4_TOKEN');
        expect(degradedRaw).not.toContain('SECRET_T4_DM_BODY');

        expect((await bg.sendCommand({ type: 'health.update', report: degraded })).ok).toBe(true);
        const stDegraded = await bg.sendCommand<any>({ type: 'state.get' });
        expect(stDegraded.data.health.status).toBe('degraded');

        const findDiagnosticCopyBtn = (root: Element) => {
          const btnLabel = (b: Element) =>
            `${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''} ${b.getAttribute('data-testid') ?? ''}`;
          const candidates = [...root.querySelectorAll('button')].filter(
            (b) => !/(dismiss|close|关闭|忽略)/i.test(btnLabel(b))
          );
          return (
            candidates.find((b) => /(copy|复制)/i.test(btnLabel(b))) ??
            candidates.find((b) => /(diagnostic|summary|诊断|摘要)/i.test(btnLabel(b)))
          );
        };

        // (4) Mount Popup in degraded state -> header switch first + copy diagnostic summary with zero PII
        let degradedBodyTextLen = 0;
        const mountedDegraded = await mountExtensionComponent(
          loadPopup,
          structuredClone(stDegraded.data),
          { url: 'chrome-extension://kxc-e2e-extension/popup.html' }
        );
        try {
          const header = mountedDegraded.document.querySelector('.popup-header');
          const body = mountedDegraded.document.querySelector('.popup-body');
          expect(header).not.toBeNull();
          expect(body).not.toBeNull();

          const allSwitches = mountedDegraded.document.querySelectorAll('button[role="switch"]');
          const headerSwitch = header!.querySelector('button[role="switch"]');
          expect(allSwitches[0]).toBe(headerSwitch);

          degradedBodyTextLen = (body!.textContent ?? '').trim().length;
          const copyBtn = findDiagnosticCopyBtn(body!);
          expect(copyBtn).toBeDefined();

          await mountedDegraded.click(copyBtn!);
          expect(mountedDegraded.clipboardWrites.length).toBeGreaterThanOrEqual(1);
          const copiedSummary = String(
            mountedDegraded.clipboardWrites[mountedDegraded.clipboardWrites.length - 1]
          );
          expect(copiedSummary).toContain('0.2.0');
          expect(/HomeTimeline|TweetDetail/.test(copiedSummary)).toBe(true);
          expect(/home_renamed_v4|threaded_v4/.test(copiedSummary)).toBe(true);
          expect(copiedSummary).not.toContain('secret_canary_t4');
          expect(copiedSummary).not.toContain('SECRET_T4_COOKIE');
          expect(copiedSummary).not.toContain('SECRET_T4_TOKEN');
          expect(copiedSummary).not.toContain('SECRET_T4_DM_BODY');
        } finally {
          await mountedDegraded.cleanup();
        }

        // (5) Feed 1 valid HomeTimeline tweet -> auto-recovers to 'ok' & Popup diagnostic banner disappears
        pi.advanceNow(2000);
        await pi.sendGraphqlFetch(
          GRAPHQL_URLS.forYou,
          buildHomeTimelinePayload([
            buildGraphqlTweetEntry({
              tweetId: '48001',
              text: 'Valid tweet after X schema recovery.',
              author: { restId: '48101', screenName: 'recovery_author' },
            }),
          ])
        );
        const okEvent = pi.healthEvents[pi.healthEvents.length - 1];
        expect(okEvent?.status).toBe('ok');
        expect(okEvent?.consecutiveZeroCount).toBe(0);

        expect((await bg.sendCommand({ type: 'health.update', report: okEvent })).ok).toBe(true);
        const stOk = await bg.sendCommand<any>({ type: 'state.get' });
        expect(stOk.data.health.status).toBe('ok');
        expect(stOk.data.health.consecutiveZeroCount).toBe(0);

        const mountedOk = await mountExtensionComponent(loadPopup, structuredClone(stOk.data), {
          url: 'chrome-extension://kxc-e2e-extension/popup.html',
        });
        try {
          const bodyOk = mountedOk.document.querySelector('.popup-body')!;
          const copyBtnAfter = findDiagnosticCopyBtn(bodyOk);
          expect(copyBtnAfter).toBeUndefined();
          expect((bodyOk.textContent ?? '').trim().length).toBeLessThan(degradedBodyTextLen);
        } finally {
          await mountedOk.cleanup();
        }
      } finally {
        pi.cleanup();
        if (bg) {
          await cleanupBg(bg);
        }
      }
    },
    { timeout: 15000 }
  );

  // -------------------------------------------------------------------------
  // T4-V2-09: Maintainer Cloud Hotfix Pipeline (CLI -> D1 0004 -> Snapshot -> Engine)
  // -------------------------------------------------------------------------
  it(
    'T4-V2-09: Maintainer Cloud Hotfix Pipeline (CLI → D1 0004 → Snapshot → Live Engine)',
    async () => {
      requireFile('apps/server/scripts/cloud-rules.ts', 'maintainer cloud-rules CLI');
      requireFile('apps/server/cloud-rules.json', 'cloud-rules manifest');
      const rootPkg = JSON.parse(requireFile('package.json')) as {
        scripts?: Record<string, string>;
      };
      const baseArgs = parseCliPushBaseArgs(rootPkg.scripts ?? {});
      const dryRunBase = baseArgs.includes('--dry-run') ? baseArgs : [...baseArgs, '--dry-run'];

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kxc-t4-cli-'));
      const d1 = createSqliteD1Adapter();
      try {
        // (1) CLI --dry-run on real manifest + valid --file positive control + 3 invalid fixtures
        const realDryRes = await runTsxCli('apps/server/scripts/cloud-rules.ts', dryRunBase, {
          timeoutMs: 12_000,
        });
        expect(realDryRes.timedOut).toBe(false);
        expect(realDryRes.exitCode).toBe(0);

        const validFp = path.join(tmpDir, 'valid.json');
        fs.writeFileSync(
          validFp,
          JSON.stringify(
            {
              version: 1,
              rules: [
                {
                  id: 'cloud-fr-hotfix-t4',
                  pattern: 'gagnez_crypto_maintenant',
                  isRegex: false,
                  scopes: ['text'],
                  langGroup: 'fr',
                  note: 'French hotfix probe',
                  enabled: true,
                },
              ],
            },
            null,
            2
          ),
          'utf8'
        );
        const validFileRes = await runTsxCli(
          'apps/server/scripts/cloud-rules.ts',
          [...dryRunBase, '--file', validFp],
          { timeoutMs: 12_000 }
        );
        expect(validFileRes.timedOut).toBe(false);
        expect(validFileRes.exitCode).toBe(0);

        const invalidFixtures: Array<{ name: string; content: unknown; errorRe: RegExp }> = [
          {
            name: 'invalid-regex.json',
            errorRe: /(regex|regexp|pattern|syntax|invalid)/i,
            content: {
              version: 1,
              rules: [
                {
                  id: 't4-bad-rx',
                  pattern: '(unclosed',
                  isRegex: true,
                  scopes: ['text'],
                  langGroup: 'fr',
                  enabled: true,
                },
              ],
            },
          },
          {
            name: 'dup-id.json',
            errorRe: /(duplicate|t4-dup|unique|already)/i,
            content: {
              version: 1,
              rules: [
                {
                  id: 't4-dup',
                  pattern: 'x1',
                  isRegex: false,
                  scopes: ['text'],
                  langGroup: 'en',
                  enabled: true,
                },
                {
                  id: 't4-dup',
                  pattern: 'x2',
                  isRegex: false,
                  scopes: ['text'],
                  langGroup: 'en',
                  enabled: true,
                },
              ],
            },
          },
          {
            name: 'invalid-lang.json',
            errorRe: /(langgroup|lang_group|lang|group|\bklingon\b|unsupported|invalid)/i,
            content: {
              version: 1,
              rules: [
                {
                  id: 't4-bad-lang',
                  pattern: 'x3',
                  isRegex: false,
                  scopes: ['text'],
                  langGroup: 'klingon',
                  enabled: true,
                },
              ],
            },
          },
        ];
        for (const fx of invalidFixtures) {
          const fp = path.join(tmpDir, fx.name);
          fs.writeFileSync(fp, JSON.stringify(fx.content, null, 2), 'utf8');
          const res = await runTsxCli(
            'apps/server/scripts/cloud-rules.ts',
            [...dryRunBase, '--file', fp],
            { timeoutMs: 12_000 }
          );
          expect(res.timedOut).toBe(false);
          expect(res.exitCode).not.toBe(0);
          const out = `${res.stderr}\n${res.stdout}`.trim();
          expect(out.length).toBeGreaterThan(0);
          expect(out).not.toMatch(/unknown\s+(option|flag)|ENOENT|no such file/i);
          expect(out).toMatch(fx.errorRe);
        }

        // (2) Apply 0001-0003, seed pre-0004 legacy row, then apply 0004 and verify 'universal' backfill
        await applyServerMigrations(d1, { upToPrefix: '0003' });
        const now = Date.now();
        await d1
          .prepare(
            `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, note, enabled, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            'legacy-pre-0004-row',
            'legacy_pre_0004_tok',
            0,
            JSON.stringify(['text']),
            'Legacy pre-0004 row',
            1,
            now
          )
          .run();

        await applyServerMigrations(d1, { fromPrefix: '0004', requireMigration0004: true });
        const backfilled = await d1
          .prepare('SELECT id, lang_group FROM cloud_keywords WHERE id = ?')
          .bind('legacy-pre-0004-row')
          .first<{ id: string; lang_group: string }>();
        expect(backfilled?.lang_group).toBe('universal');

        // (3) Insert hotfix 'fr' rule + emergency pause on cloud-nsfw-bio-1
        await d1
          .prepare(
            `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, note, enabled, lang_group, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            'cloud-fr-hotfix-t4',
            'gagnez_crypto_maintenant',
            0,
            JSON.stringify(['text']),
            'French hotfix spam',
            1,
            'fr',
            now
          )
          .run();
        await d1
          .prepare(
            `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, note, enabled, lang_group, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            'cloud-nsfw-bio-1',
            '(onlyfans\\.com)',
            1,
            JSON.stringify(['bio', 'text']),
            'Emergency pause',
            0,
            'universal',
            now
          )
          .run();

        const serverMod = await requireModule<{ app: any }>(
          'apps/server/src/index.ts',
          'Cloudflare Worker server'
        );

        // (4) Zero public admin HTTP routes
        for (const adminPath of ['/admin', '/v1/admin/cloud-keywords', '/v1/cloud-keywords']) {
          const r = await serverMod.app.request(
            `https://api.keepxclean.com${adminPath}`,
            { method: 'POST', body: JSON.stringify({}), headers: { 'content-type': 'application/json' } },
            { DB: d1 }
          );
          expect(r.status).toBe(404);
        }

        // (5) GET /v1/snapshot.json?fresh=1 emits hotfix 'fr' rule & paused rule
        const snapRes = await serverMod.app.request(
          'https://api.keepxclean.com/v1/snapshot.json?fresh=1',
          { method: 'GET' },
          { DB: d1 }
        );
        expect(snapRes.status).toBe(200);
        const snapshot = (await snapRes.json()) as any;

        const frRule = snapshot.cloudKeywords.find((k: any) => k.id === 'cloud-fr-hotfix-t4');
        expect(frRule).toBeDefined();
        expect(frRule.langGroup).toBe('fr');
        expect(frRule.enabled).toBe(true);

        const pausedRule = snapshot.cloudKeywords.find((k: any) => k.id === 'cloud-nsfw-bio-1');
        expect(pausedRule).toBeDefined();
        expect(pausedRule.enabled).toBe(false);

        // (6) Feed live snapshot into evaluateTweet()
        const frSpamTweet = makeExtractedTweet({
          tweetId: '49001',
          text: 'Cliquez ici: gagnez_crypto_maintenant!',
          author: makeExtractedAuthor({ restId: '49101', screenName: 'fr_scammer' }),
        });
        const ofBioTweet = makeExtractedTweet({
          tweetId: '49002',
          text: 'Regular timeline message.',
          author: makeExtractedAuthor({
            restId: '49102',
            screenName: 'of_paused_user',
            bio: 'onlyfans.com/hotfix_paused',
          }),
        });

        const frCfg = Shared.createDefaultConfig('standard') as any;
        frCfg.locale = 'fr';
        const frDec = Shared.evaluateTweet(frSpamTweet, frCfg, snapshot) as any;
        expect(frDec.blocked).toBe(true);
        expect(frDec.ruleId).toBe('cloud_keyword');
        expect(frDec.matchedTarget).toEqual({ kind: 'cloud_keyword', id: 'cloud-fr-hotfix-t4' });
        // Paused cloud-nsfw-bio-1 allowed with snapshot, blocked without snapshot (positive control)
        expect(Shared.evaluateTweet(ofBioTweet, frCfg, null).blocked).toBe(true);
        expect(Shared.evaluateTweet(ofBioTweet, frCfg, snapshot).blocked).toBe(false);

        const enCfg = Shared.createDefaultConfig('standard') as any;
        enCfg.locale = 'en';
        expect(Shared.evaluateTweet(frSpamTweet, enCfg, snapshot).blocked).toBe(false);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        d1.close();
      }
    },
    { timeout: 30000 }
  );

  // -------------------------------------------------------------------------
  // T4-V2-10: Release & CWS Auditor Compliance Walkthrough
  // -------------------------------------------------------------------------
  it('T4-V2-10: Release & CWS Auditor Compliance Walkthrough', async () => {
    // (1) All 5 workspace package.json files === '0.2.0', CHANGELOG.md & web CURRENT_VERSION === 'v0.2.0'
    for (const pkgRel of [
      'package.json',
      'packages/shared/package.json',
      'apps/extension/package.json',
      'apps/server/package.json',
      'apps/web/package.json',
    ]) {
      const pkg = JSON.parse(requireFile(pkgRel)) as { version?: string };
      expect({ pkgRel, version: pkg.version }).toEqual({ pkgRel, version: '0.2.0' });
    }
    const changelog = requireFile('CHANGELOG.md', 'root CHANGELOG.md');
    expect(changelog).toContain('0.2.0');

    const webCfg = await requireModule<{ CURRENT_VERSION?: string }>(
      'apps/web/src/config.ts',
      'web config'
    );
    expect(webCfg.CURRENT_VERSION).toBe('v0.2.0');

    // (2) 10 web locales 100% key parity, '0.2.0' present, 0 stale '0.1.2', distinct localization
    const webLocales = await requireModule<{ getDictionary: (loc: string) => Record<string, any> }>(
      'apps/web/src/locales/index.ts',
      'web locales'
    );
    const enDict = webLocales.getDictionary('en');
    const enKeys = collectAllKeys(enDict);
    for (const loc of Shared.SUPPORTED_LOCALES) {
      const dict = webLocales.getDictionary(loc);
      expect(collectAllKeys(dict)).toEqual(enKeys);
      expect(String(dict.nav?.downloadCta ?? '')).toContain('0.2.0');
      const src = requireFile(`apps/web/src/locales/${loc}.ts`);
      expect(src).not.toMatch(/(?:^|[^0-9.])0\.1\.2(?![0-9])/);
    }
    expect(webLocales.getDictionary('zh-CN').hero.headline).not.toBe(enDict.hero.headline);
    expect(webLocales.getDictionary('ja').hero.headline).not.toBe(enDict.hero.headline);

    // (3) All 10 Chrome MV3 _locales messages.json descriptions non-empty & <= 132 chars
    for (const dir of ['en', 'zh_CN', 'zh_TW', 'ja', 'ko', 'es', 'pt_BR', 'fr', 'de', 'ru']) {
      const bundle = JSON.parse(
        requireFile(`apps/extension/public/_locales/${dir}/messages.json`)
      ) as Record<string, { message?: string }>;
      const desc = bundle.extDescription?.message ?? '';
      expect(desc.trim().length).toBeGreaterThan(0);
      expect(desc.length).toBeLessThanOrEqual(132);
    }

    // (4) privacyContent.ts exact 5-row sec4Rows + storage.sync (local retention) & parse health
    const privacyMod = await requireModule<{ PRIVACY_CONTENT: Record<string, any> }>(
      'apps/web/src/data/privacyContent.ts',
      'web privacy content'
    );
    for (const lang of ['en', 'zh-CN'] as const) {
      const content = privacyMod.PRIVACY_CONTENT[lang];
      expect(content.sec4Rows).toHaveLength(5);
      const full = JSON.stringify(content);
      expect(/storage\.sync/i.test(full)).toBe(true);
      expect(/(local|device|本机|本地)/i.test(full)).toBe(true);
      expect(/(health|parse|self-check|自检|解析|健康|诊断)/i.test(full)).toBe(true);
    }

    // (5) Dynamic HeroSandbox v0.2.0 flow
    const sampleSrc = requireFile('apps/web/src/components/HeroSandbox/sampleData.ts');
    const sandboxSrc = requireFile('apps/web/src/components/HeroSandbox/HeroSandbox.tsx');
    const typesSrc = requireFile('apps/web/src/components/HeroSandbox/types.ts');
    const combinedSandbox = `${sampleSrc}\n${sandboxSrc}\n${typesSrc}`;

    const { getSandboxData } = await requireModule<{ getSandboxData: (loc: string) => any }>(
      'apps/web/src/components/HeroSandbox/sampleData.ts',
      'HeroSandbox sampleData'
    );
    const { isTweetIntercepted, PRESET_WEIGHT } = await requireModule<{
      isTweetIntercepted: (tweet: any, state: any) => boolean;
      PRESET_WEIGHT: Record<string, number>;
    }>('apps/web/src/components/HeroSandbox/types.ts', 'HeroSandbox types');

    const sandbox = getSandboxData('en');
    expect(sandbox.originalPost.content).toContain('v0.2.0');
    expect(/grok/i.test(combinedSandbox)).toBe(true);
    expect(/(duplicate|复读|重复|dup)/i.test(combinedSandbox)).toBe(true);
    expect(/(for[_\s-]?you|following|推荐|关注)/i.test(combinedSandbox)).toBe(true);
    const allCategories: Record<string, boolean> = {};
    for (const r of sandbox.replies) {
      if (r.filterReason?.category) allCategories[r.filterReason.category] = true;
    }
    const baseState = {
      masterEnabled: true,
      preset: 'standard' as 'mild' | 'standard' | 'extreme',
      displayMode: 'folded' as const,
      categories: allCategories,
      manuallyBlockedIds: new Set<string>(),
      restoredTweetIds: new Set<string>(),
      whitelistedHandles: new Set<string>(),
    };
    const mildCount = sandbox.replies.filter((r: any) =>
      isTweetIntercepted(r, { ...baseState, preset: 'mild' })
    ).length;
    const stdCount = sandbox.replies.filter((r: any) =>
      isTweetIntercepted(r, { ...baseState, preset: 'standard' })
    ).length;
    const extCount = sandbox.replies.filter((r: any) =>
      isTweetIntercepted(r, { ...baseState, preset: 'extreme' })
    ).length;
    expect(mildCount).toBeLessThanOrEqual(stdCount);
    expect(stdCount).toBeLessThanOrEqual(extCount);
    expect(extCount).toBe(
      sandbox.replies.filter(
        (r: any) =>
          !r.isOriginalPost &&
          Boolean(r.filterReason) &&
          PRESET_WEIGHT.extreme >= PRESET_WEIGHT[r.filterReason.presetLevel]
      ).length
    );

    const cleanTweet = sandbox.replies.find((r: any) => !r.filterReason && !r.isOriginalPost)!;
    const noiseTweet = sandbox.replies.find(
      (r: any) => Boolean(r.filterReason) && r.filterReason.presetLevel !== 'extreme'
    )!;
    expect(isTweetIntercepted(noiseTweet, { ...baseState, masterEnabled: false })).toBe(false);
    expect(
      isTweetIntercepted(cleanTweet, {
        ...baseState,
        manuallyBlockedIds: new Set([cleanTweet.id]),
      })
    ).toBe(true);
    expect(
      isTweetIntercepted(noiseTweet, {
        ...baseState,
        restoredTweetIds: new Set([noiseTweet.id]),
      })
    ).toBe(false);

    // (6) AGENTS.md brand compliance
    const logoVal = validateBrandLogoSvg(requireFile('apps/web/public/logo.svg'));
    expect(logoVal.valid).toBe(true);
    expect(logoVal.width).toBe(512);
    expect(logoVal.height).toBe(512);
    expect(validateBrandTokens(requireFile('apps/web/src/styles/tokens.css')).valid).toBe(true);

    const webSrcDir = path.resolve(REPO_ROOT, 'apps/web/src');
    for (const tsFile of walkFiles(webSrcDir, ['.ts', '.tsx'])) {
      const content = fs.readFileSync(tsFile, 'utf8');
      expect(content).not.toMatch(
        /import\s*\{[^}]*\bShield\w*[^}]*\}\s*from\s*['"]lucide-react['"]/
      );
    }
    for (const cssFile of walkFiles(webSrcDir, ['.css'])) {
      const content = fs.readFileSync(cssFile, 'utf8');
      expect(content).not.toMatch(/\bshield\b|\bprotective[-_]ring\b|\bglow\b|\bstarburst\b/i);
    }

    // (7) Strictly ['alarms', 'storage'] permissions + Gecko ID + privacy defaults false
    const wxtSrc = requireFile('apps/extension/wxt.config.ts');
    const permMatch = wxtSrc.match(/permissions\s*:\s*\[([^\]]*)\]/);
    expect(permMatch).not.toBeNull();
    const perms = [...permMatch![1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
    expect(perms).toEqual(['alarms', 'storage']);
    expect(wxtSrc).not.toMatch(/clipboardWrite|['"]tabs['"]|['"]scripting['"]/);
    expect(wxtSrc).toContain('keepxclean@keepxclean.com');

    for (const preset of ['light', 'standard', 'strict'] as const) {
      const defCfg = Shared.createDefaultConfig(preset);
      expect(defCfg.syncNativeXBlock).toBe(false);
      expect(defCfg.enableCrowdReport).toBe(false);
    }
  });
});
