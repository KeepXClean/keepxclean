/**
 * Tier 3 (v0.2.0): Pairwise Cross-Feature Combinations E2E Test Suite (30 Tests)
 *
 * 30 genuine, opaque-box, requirement-driven pairwise interaction tests (`T3-V2-01`..`T3-V2-30`)
 * derived strictly from ORIGINAL_REQUEST.md, PROJECT.md, TEST_INFRA.md, v0.2.0_plan.md,
 * and AGENTS.md.
 *
 * Rules upheld:
 * - Zero vitest imports, zero top-level await, zero top-level contract crashes.
 * - Zero unpinned internal filenames (all sync & parse-health flows driven via public harnesses).
 * - Zero tautologies, zero silent passes, relative local-noon dates, full try/finally cleanup
 *   (including deterministic `cloudSync.disable` before `bg.cleanup()` to cancel debounce timers).
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
  LEGACY_24_CLOUD_KEYWORD_IDS,
  requireExport,
  requireModule,
  requireFile,
  fileExists,
  computeChromeStorageItemBytes,
  makeExtractedAuthor,
  makeExtractedTweet,
  makeOfficialGrokAuthor,
  makeLookalikeGrokAuthor,
  buildGraphqlTweetEntry,
  buildHomeTimelinePayload,
  buildTweetDetailPayload,
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
  INVALID_KXC_PACK_CASES,
  triggerBattleReportRender,
  type BackgroundHarness,
  type MockChromeEnv,
  type MountedExtensionComponent,
} from './fixtures/v020-helpers';

setTestTier(3);

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
  expect(typeof meta!.deviceId).toBe('string');
  expect(meta!.deviceId.length).toBeGreaterThan(0);

  let joined = '';
  for (let i = 0; i < meta!.chunks; i++) {
    const chunkKey = `kxc_sync_chunk_${i}`;
    const chunk = syncStore[chunkKey];
    expect(typeof chunk).toBe('string');
    joined += chunk as string;
  }
  expect(crypto.createHash('sha256').update(joined, 'utf8').digest('hex')).toBe(
    meta!.sha256.toLowerCase()
  );
  return { meta: meta!, payload: JSON.parse(joined) as Record<string, any> };
}

function extractLastOptionsUrl(
  chromeEnv: MockChromeEnv,
  prevCreatedLen: number,
  prevUpdatedLen: number
): string {
  const updated = chromeEnv.updatedTabs.slice(prevUpdatedLen);
  for (let i = updated.length - 1; i >= 0; i--) {
    const url = updated[i]?.props?.url;
    if (typeof url === 'string' && url.length > 0) {
      return url;
    }
  }
  const created = chromeEnv.createdTabs.slice(prevCreatedLen);
  for (let i = created.length - 1; i >= 0; i--) {
    const url = created[i]?.url;
    if (typeof url === 'string' && url.length > 0) {
      return url;
    }
  }
  throw new Error('Expected options.open to create or update a tab with a non-empty URL');
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

function sha256Hex(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ============================================================================
// Tier 3 (v0.2.0): Pairwise Cross-Feature Combinations (30 Tests)
// ============================================================================

describe('Tier 3 (v0.2.0): Pairwise Cross-Feature Combinations (30 Tests)', () => {
  // -------------------------------------------------------------------------
  // T3-V2-01: F01 Grok Protect × highFrequency (daily + window) × evaluateAuthorProfile
  // -------------------------------------------------------------------------
  it('T3-V2-01: F01 Grok Protect × highFrequency (daily + sliding window) × evaluateAuthorProfile', () => {
    const OFFICIAL_GROK_UID = requireExport<string>(
      sharedMod,
      'OFFICIAL_GROK_UID',
      '@keepxclean/shared'
    );
    expect(OFFICIAL_GROK_UID).toBe('1720665183188922368');

    const config = Shared.createDefaultConfig('strict') as any;
    expect(config.rules.grokFilter?.protectOfficialGrok).toBe(true);

    // Followers kept low (100) so maxFollowersExempt cannot mask Grok protection
    const grokAuthor = makeOfficialGrokAuthor({
      followersCount: 100,
      dailyTweetRate: 2000,
      statusesCount: 730_000,
    });

    const tracker = new Shared.SlidingWindowTracker();
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      tracker.recordAndCount(grokAuthor.restId, String(301000 + i), 3, now);
    }

    const grokTweet = makeExtractedTweet({
      tweetId: '301050',
      text: 'Detailed factual answer on distributed systems consensus.',
      scene: 'timeline',
      author: grokAuthor,
    });
    const grokDec = Shared.evaluateTweet(grokTweet, config, null, tracker);
    expect(grokDec.blocked).toBe(false);
    expect(grokDec.action).toBe('allow');

    const grokProfile = Shared.evaluateAuthorProfile(grokAuthor, config, null, tracker);
    expect(grokProfile.riskBadges).toEqual([]);
    expect(grokProfile.primaryRuleId).toBeUndefined();

    // Positive control 1: Lookalike with identical high daily rate -> blocked & profile flagged
    const lookalikeDaily = makeLookalikeGrokAuthor({
      followersCount: 100,
      dailyTweetRate: 2000,
      statusesCount: 730_000,
    });
    const lookalikeDailyDec = Shared.evaluateTweet(
      makeExtractedTweet({
        tweetId: '301051',
        text: 'Detailed factual answer on distributed systems consensus.',
        scene: 'timeline',
        author: lookalikeDaily,
      }),
      config,
      null,
      tracker
    );
    expect(lookalikeDailyDec.blocked).toBe(true);
    expect(lookalikeDailyDec.ruleId).toBe('high_frequency_daily');

    const lookalikeProfile = Shared.evaluateAuthorProfile(lookalikeDaily, config, null, tracker);
    expect(lookalikeProfile.primaryRuleId).toBe('high_frequency_daily');

    // Positive control 2: Low-daily-rate lookalike hitting sliding window burst
    const lookalikeBurst = makeLookalikeGrokAuthor({
      restId: '999888777666556',
      screenName: 'grok_helper_bot',
      followersCount: 100,
      dailyTweetRate: 10,
      statusesCount: 3650,
    });
    for (let i = 0; i < 10; i++) {
      tracker.recordAndCount(lookalikeBurst.restId, String(301100 + i), 3, now);
    }
    const burstDec = Shared.evaluateTweet(
      makeExtractedTweet({
        tweetId: '301120',
        text: 'Posting rapidly within a 3 hour sliding window.',
        scene: 'timeline',
        author: lookalikeBurst,
      }),
      config,
      null,
      tracker
    );
    expect(burstDec.blocked).toBe(true);
    expect(burstDec.ruleId).toBe('high_frequency_window');

    // Inversion: disabling protectOfficialGrok blocks the exact same official @grok
    const unprotectedConfig = structuredClone(config);
    unprotectedConfig.rules.grokFilter.protectOfficialGrok = false;
    const unprotectedDec = Shared.evaluateTweet(grokTweet, unprotectedConfig, null, tracker);
    expect(unprotectedDec.blocked).toBe(true);
    expect(unprotectedDec.ruleId).toBe('high_frequency_daily');
  });

  // -------------------------------------------------------------------------
  // T3-V2-02: F01 protectOfficialGrok × F03 hideGrokReplies × whitelistUids
  // -------------------------------------------------------------------------
  it('T3-V2-02: F01 protectOfficialGrok × F03 hideGrokReplies × whitelistUids', () => {
    const OFFICIAL_GROK_UID = requireExport<string>(
      sharedMod,
      'OFFICIAL_GROK_UID',
      '@keepxclean/shared'
    );

    const lowRateGrok = makeOfficialGrokAuthor({
      dailyTweetRate: 2,
      statusesCount: 730,
      followersCount: 5_000_000,
    });
    const grokReply = makeExtractedTweet({
      tweetId: '30201',
      text: 'Here is the context behind that benchmark chart.',
      scene: 'reply',
      isReply: true,
      focalTweetId: '20200',
      inReplyToTweetId: '20200',
      author: lowRateGrok,
    });

    // (1) hideGrokReplies=false + protectOfficialGrok=true -> allowed
    const baseCfg = Shared.createDefaultConfig('standard') as any;
    expect(baseCfg.rules.grokFilter.protectOfficialGrok).toBe(true);
    expect(baseCfg.rules.grokFilter.hideGrokReplies).toBe(false);
    expect(Shared.evaluateTweet(grokReply, baseCfg).blocked).toBe(false);

    // (2) hideGrokReplies=true overrides protectOfficialGrok in replies
    const hideCfg = structuredClone(baseCfg);
    hideCfg.rules.grokFilter.hideGrokReplies = true;
    const hideDec = Shared.evaluateTweet(grokReply, hideCfg) as any;
    expect(hideDec.blocked).toBe(true);
    expect(hideDec.ruleId).toBe('grok_filter');
    expect(hideDec.matchedTarget).toEqual({ kind: 'rule', id: 'grokFilter' });

    // (3) Non-reply timeline post from @grok is NOT hidden by hideGrokReplies
    const grokTimelinePost = makeExtractedTweet({
      tweetId: '30202',
      text: 'Announcing a new model reasoning upgrade today.',
      scene: 'timeline',
      isReply: false,
      author: lowRateGrok,
    });
    expect(Shared.evaluateTweet(grokTimelinePost, hideCfg).blocked).toBe(false);

    // (4) whitelistUids overrides hideGrokReplies
    const wlCfg = structuredClone(hideCfg);
    wlCfg.whitelistUids = {
      [OFFICIAL_GROK_UID]: {
        uid: OFFICIAL_GROK_UID,
        screenName: 'grok',
        addedAt: 1_700_000_000_000,
      },
    };
    const wlDec = Shared.evaluateTweet(grokReply, wlCfg);
    expect(wlDec.blocked).toBe(false);
    expect(wlDec.action).toBe('allow');
  });

  // -------------------------------------------------------------------------
  // T3-V2-03: F02 blockShortMentions × scene × OP × exemptFollowing × weighted len
  // -------------------------------------------------------------------------
  it('T3-V2-03: F02 blockShortMentions × scene × focalAuthor OP × exemptFollowing × weighted length', () => {
    const config = Shared.createDefaultConfig('strict') as any;
    expect(config.rules.grokFilter.blockShortMentions).toBe(true);
    expect(config.rules.grokFilter.maxMentionWeightedLength).toBe(16);

    // followersCount: 6000 avoids blockShortOrEmoji (<5000) masking
    const stranger = makeExtractedAuthor({
      restId: '303001',
      screenName: 'stranger_summoner',
      followersCount: 6000,
      following: false,
    });
    const opAuthor = makeExtractedAuthor({
      restId: '303000',
      screenName: 'thread_op',
      followersCount: 6000,
      following: false,
    });
    const followedAuthor = makeExtractedAuthor({
      restId: '303002',
      screenName: 'followed_friend',
      followersCount: 6000,
      following: true,
    });

    // (1) Stranger short reply <= 16 weighted chars -> blocked by grok_filter
    const strangerReply = makeExtractedTweet({
      tweetId: '30310',
      text: '@grok explain this',
      scene: 'reply',
      isReply: true,
      focalTweetId: '30300',
      inReplyToTweetId: '30300',
      focalAuthor: {
        restId: opAuthor.restId,
        screenName: opAuthor.screenName,
        name: opAuthor.name,
        followersCount: opAuthor.followersCount,
      },
      author: stranger,
    });
    const dec1 = Shared.evaluateTweet(strangerReply, config) as any;
    expect(dec1.blocked).toBe(true);
    expect(dec1.ruleId).toBe('grok_filter');
    expect(dec1.matchedTarget).toEqual({ kind: 'rule', id: 'grokFilter' });

    // Exact 16-char boundary -> blocked
    const boundary16 = makeExtractedTweet({
      ...strangerReply,
      tweetId: '30311',
      text: '@grok abcdefghijklmnop',
    });
    expect(Shared.evaluateTweet(boundary16, config).ruleId).toBe('grok_filter');

    // (2) Same short mention in timeline (non-reply) -> allowed
    const timelineTweet = makeExtractedTweet({
      tweetId: '30312',
      text: '@grok explain this',
      scene: 'timeline',
      isReply: false,
      author: stranger,
    });
    expect(Shared.evaluateTweet(timelineTweet, config).blocked).toBe(false);

    // (3) Same short mention in reply from focalAuthor OP -> allowed
    const opReply = makeExtractedTweet({
      ...strangerReply,
      tweetId: '30313',
      author: opAuthor,
    });
    expect(Shared.evaluateTweet(opReply, config).blocked).toBe(false);

    // (4) Followed account exempt when exemptFollowing=true, blocked when false
    const followedReply = makeExtractedTweet({
      ...strangerReply,
      tweetId: '30314',
      author: followedAuthor,
    });
    expect(Shared.evaluateTweet(followedReply, config).blocked).toBe(false);

    const noExemptCfg = structuredClone(config);
    noExemptCfg.exemptFollowing = false;
    const followedBlocked = Shared.evaluateTweet(followedReply, noExemptCfg);
    expect(followedBlocked.blocked).toBe(true);
    expect(followedBlocked.ruleId).toBe('grok_filter');

    // (5) Exact 17-weighted-char boundary -> allowed
    const boundary17 = makeExtractedTweet({
      ...strangerReply,
      tweetId: '30315',
      text: '@grok abcdefghijklmnopq',
    });
    expect(Shared.evaluateTweet(boundary17, config).blocked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // T3-V2-04: F02 blockShortMentions × F08 sceneModes (inherit/strip/bypass)
  // -------------------------------------------------------------------------
  it('T3-V2-04: F02 blockShortMentions × F08 sceneModes (inherit/strip/bypass)', () => {
    const stranger = makeExtractedAuthor({
      restId: '304001',
      screenName: 'summoner_4',
      followersCount: 6000,
    });
    const reply = makeExtractedTweet({
      tweetId: '30410',
      text: '@grok explain this',
      scene: 'reply',
      isReply: true,
      focalTweetId: '30400',
      inReplyToTweetId: '30400',
      author: stranger,
    });

    const baseCfg = Shared.createDefaultConfig('strict') as any;
    baseCfg.interceptionMode = 'collapse';

    // (1) reply: inherit -> collapse
    const inheritCfg = structuredClone(baseCfg);
    inheritCfg.sceneModes = { reply: 'inherit' };
    const decInherit = Shared.evaluateTweet(reply, inheritCfg);
    expect(decInherit.blocked).toBe(true);
    expect(decInherit.action).toBe('collapse');
    expect(decInherit.ruleId).toBe('grok_filter');

    // (2) reply: strip -> strip
    const stripCfg = structuredClone(baseCfg);
    stripCfg.sceneModes = { reply: 'strip' };
    const decStrip = Shared.evaluateTweet(reply, stripCfg);
    expect(decStrip.blocked).toBe(true);
    expect(decStrip.action).toBe('strip');
    expect(decStrip.ruleId).toBe('grok_filter');

    // (3) reply: bypass -> allow
    const bypassCfg = structuredClone(baseCfg);
    bypassCfg.sceneModes = { reply: 'bypass' };
    const decBypass = Shared.evaluateTweet(reply, bypassCfg);
    expect(decBypass.blocked).toBe(false);
    expect(decBypass.action).toBe('allow');

    // (4) Cross-scene isolation: for_you: bypass does NOT bypass reply scene
    const isolatedCfg = structuredClone(baseCfg);
    isolatedCfg.sceneModes = { for_you: 'bypass', reply: 'inherit' };
    const decIsolated = Shared.evaluateTweet(reply, isolatedCfg);
    expect(decIsolated.blocked).toBe(true);
    expect(decIsolated.action).toBe('collapse');
    expect(decIsolated.ruleId).toBe('grok_filter');
  });

  // -------------------------------------------------------------------------
  // T3-V2-05: F03 hideGrokReplies × profileSceneBadgeOnly
  // -------------------------------------------------------------------------
  it('T3-V2-05: F03 hideGrokReplies × profileSceneBadgeOnly', () => {
    const lowRateGrok = makeOfficialGrokAuthor({
      dailyTweetRate: 2,
      statusesCount: 730,
      followersCount: 5_000_000,
    });

    const cfg = Shared.createDefaultConfig('standard') as any;
    cfg.interceptionMode = 'collapse';
    cfg.profileSceneBadgeOnly = true;
    cfg.rules.grokFilter.hideGrokReplies = true;

    // (1) reply scene -> collapsed with grok_filter
    const replyDec = Shared.evaluateTweet(
      makeExtractedTweet({
        tweetId: '30501',
        text: 'Answer in thread.',
        scene: 'reply',
        isReply: true,
        focalTweetId: '30500',
        inReplyToTweetId: '30500',
        author: lowRateGrok,
      }),
      cfg
    );
    expect(replyDec.blocked).toBe(true);
    expect(replyDec.action).toBe('collapse');
    expect(replyDec.ruleId).toBe('grok_filter');

    // (2) profile scene with profileSceneBadgeOnly=true -> badge_only
    const profileReply = makeExtractedTweet({
      tweetId: '30502',
      text: 'Answer shown on profile Replies tab.',
      scene: 'profile',
      isReply: true,
      inReplyToTweetId: '30500',
      author: lowRateGrok,
    });
    const profileDec = Shared.evaluateTweet(profileReply, cfg);
    expect(profileDec.blocked).toBe(false);
    expect(profileDec.action).toBe('badge_only');
    expect(profileDec.ruleId).toBe('grok_filter');
    expect(profileDec.riskBadges.length).toBeGreaterThan(0);

    // (3) Inversion: profileSceneBadgeOnly=false collapses on profile scene
    const strictProfileCfg = structuredClone(cfg);
    strictProfileCfg.profileSceneBadgeOnly = false;
    const invertedDec = Shared.evaluateTweet(profileReply, strictProfileCfg);
    expect(invertedDec.blocked).toBe(true);
    expect(invertedDec.action).toBe('collapse');
    expect(invertedDec.ruleId).toBe('grok_filter');
  });

  // -------------------------------------------------------------------------
  // T3-V2-06: F04 blockDuplicateReplies × F08 sceneModes × scene isolation
  // -------------------------------------------------------------------------
  it('T3-V2-06: F04 blockDuplicateReplies × F08 sceneModes × scene isolation', () => {
    const ThreadDuplicateTracker = requireExport<new () => any>(
      sharedMod,
      'ThreadDuplicateTracker',
      '@keepxclean/shared'
    );

    const a1 = makeExtractedAuthor({ restId: '601', screenName: 'dup_u1', followersCount: 6000 });
    const a2 = makeExtractedAuthor({ restId: '602', screenName: 'dup_u2', followersCount: 6000 });
    const dupText = 'Join our verified research newsletter today for weekly updates!';

    const cfg = Shared.createDefaultConfig('standard') as any;
    expect(cfg.rules.replySpam.blockDuplicateReplies).toBe(true);

    // (1) scene: timeline (even with isReply + inReplyToTweetId) -> both allowed
    const tlTracker = new ThreadDuplicateTracker();
    const tl1 = makeExtractedTweet({
      tweetId: '30601',
      text: dupText,
      scene: 'timeline',
      isReply: true,
      inReplyToTweetId: '600',
      focalTweetId: '600',
      author: a1,
    });
    const tl2 = makeExtractedTweet({
      tweetId: '30602',
      text: dupText,
      scene: 'timeline',
      isReply: true,
      inReplyToTweetId: '600',
      focalTweetId: '600',
      author: a2,
    });
    expect(Shared.evaluateTweet(tl1, cfg, null, undefined, true, tlTracker).blocked).toBe(false);
    expect(Shared.evaluateTweet(tl2, cfg, null, undefined, true, tlTracker).blocked).toBe(false);

    // (2) scene: reply with sceneModes.reply = 'bypass' -> both allowed
    const bypassCfg = structuredClone(cfg);
    bypassCfg.sceneModes = { reply: 'bypass' };
    const bypassTracker = new ThreadDuplicateTracker();
    const r1 = makeExtractedTweet({
      tweetId: '30603',
      text: dupText,
      scene: 'reply',
      isReply: true,
      inReplyToTweetId: '600',
      focalTweetId: '600',
      author: a1,
    });
    const r2 = makeExtractedTweet({
      tweetId: '30604',
      text: dupText,
      scene: 'reply',
      isReply: true,
      inReplyToTweetId: '600',
      focalTweetId: '600',
      author: a2,
    });
    expect(Shared.evaluateTweet(r1, bypassCfg, null, undefined, true, bypassTracker).blocked).toBe(
      false
    );
    expect(Shared.evaluateTweet(r2, bypassCfg, null, undefined, true, bypassTracker).blocked).toBe(
      false
    );

    // (3) scene: reply with sceneModes.reply = 'strip' -> 1st allowed, 2nd stripped
    const stripCfg = structuredClone(cfg);
    stripCfg.sceneModes = { reply: 'strip' };
    const stripTracker = new ThreadDuplicateTracker();
    const d1 = Shared.evaluateTweet(r1, stripCfg, null, undefined, true, stripTracker);
    const d2 = Shared.evaluateTweet(r2, stripCfg, null, undefined, true, stripTracker);
    expect(d1.blocked).toBe(false);
    expect(d2.blocked).toBe(true);
    expect(d2.action).toBe('strip');
    expect(d2.ruleId).toBe('reply_spam');

    // (4) light preset (blockDuplicateReplies: false) -> both allowed
    const lightCfg = Shared.createDefaultConfig('light') as any;
    expect(lightCfg.rules.replySpam.blockDuplicateReplies).toBe(false);
    const lightTracker = new ThreadDuplicateTracker();
    expect(Shared.evaluateTweet(r1, lightCfg, null, undefined, true, lightTracker).blocked).toBe(
      false
    );
    expect(Shared.evaluateTweet(r2, lightCfg, null, undefined, true, lightTracker).blocked).toBe(
      false
    );
  });

  // -------------------------------------------------------------------------
  // T3-V2-07: F04 dedup normalization × OP/following/whitelist × idempotency × len
  // -------------------------------------------------------------------------
  it('T3-V2-07: F04 dedup normalization × OP/following/whitelist × idempotency × length boundary', () => {
    const ThreadDuplicateTracker = requireExport<new () => any>(
      sharedMod,
      'ThreadDuplicateTracker',
      '@keepxclean/shared'
    );
    const normalizeReplyForDedup = requireExport<
      (raw: string) => { normalized: string; weightedLength: number }
    >(sharedMod, 'normalizeReplyForDedup', '@keepxclean/shared');

    const normA = normalizeReplyForDedup(
      '@op_700 Check out this project right now! https://t.co/a1'
    );
    const normB = normalizeReplyForDedup(
      '@other  CHECK OUT THIS PROJECT RIGHT NOW!!!  https://example.com/z'
    );
    expect(normA.normalized).toBe(normB.normalized);
    expect(normA.weightedLength).toBeGreaterThanOrEqual(12);

    const cfg = Shared.createDefaultConfig('standard') as any;
    cfg.whitelistUids = {
      '705': { uid: '705', screenName: 'wl_friend', addedAt: 1_700_000_000_000 },
    };

    const op = makeExtractedAuthor({ restId: '7000', screenName: 'op_700', followersCount: 6000 });
    const u1 = makeExtractedAuthor({ restId: '701', screenName: 'bot_701', followersCount: 6000 });
    const u2 = makeExtractedAuthor({ restId: '702', screenName: 'bot_702', followersCount: 6000 });
    const followed = makeExtractedAuthor({
      restId: '704',
      screenName: 'followed_704',
      followersCount: 6000,
      following: true,
    });
    const whitelisted = makeExtractedAuthor({
      restId: '705',
      screenName: 'wl_friend',
      followersCount: 6000,
    });

    const tracker = new ThreadDuplicateTracker();
    const baseReply = {
      scene: 'reply' as const,
      isReply: true,
      focalTweetId: '700',
      inReplyToTweetId: '700',
      focalAuthor: {
        restId: op.restId,
        screenName: op.screenName,
        name: op.name,
        followersCount: op.followersCount,
      },
    };

    // (1) First reply allowed
    const r1 = makeExtractedTweet({
      ...baseReply,
      tweetId: '701',
      text: '@op_700 Check out this project right now! https://t.co/a1',
      author: u1,
    });
    expect(Shared.evaluateTweet(r1, cfg, null, undefined, true, tracker).blocked).toBe(false);

    // (2) Re-evaluating identical tweetId '701' is idempotent (allowed)
    expect(Shared.evaluateTweet(r1, cfg, null, undefined, true, tracker).blocked).toBe(false);

    // (3) Same author '701' posting a second tweet '701b' with same text -> allowed
    const r1SameAuthor = makeExtractedTweet({
      ...baseReply,
      tweetId: '701b',
      text: '@op_700 Check out this project right now! https://t.co/a2',
      author: u1,
    });
    expect(Shared.evaluateTweet(r1SameAuthor, cfg, null, undefined, true, tracker).blocked).toBe(
      false
    );

    // (4) Different author '702' with case/mention/punct/URL variant -> blocked reply_spam
    const r2 = makeExtractedTweet({
      ...baseReply,
      tweetId: '702',
      text: '@other  CHECK OUT THIS PROJECT RIGHT NOW!!!  https://example.com/z',
      author: u2,
    });
    const d2 = Shared.evaluateTweet(r2, cfg, null, undefined, true, tracker);
    expect(d2.blocked).toBe(true);
    expect(d2.ruleId).toBe('reply_spam');

    // (5) OP, followed, and whitelisted authors exempted
    for (const [tid, author] of [
      ['703', op],
      ['704', followed],
      ['705', whitelisted],
    ] as const) {
      const exemptReply = makeExtractedTweet({
        ...baseReply,
        tweetId: tid,
        text: '@op_700 Check out this project right now! https://t.co/ok',
        author,
      });
      expect(Shared.evaluateTweet(exemptReply, cfg, null, undefined, true, tracker).blocked).toBe(
        false
      );
    }

    // (6) Boundary < 12 weighted chars ('check123456' = 11) -> both allowed
    expect(normalizeReplyForDedup('check123456').weightedLength).toBe(11);
    const shortTracker = new ThreadDuplicateTracker();
    const s1 = makeExtractedTweet({
      ...baseReply,
      tweetId: '711',
      text: 'check123456',
      author: u1,
    });
    const s2 = makeExtractedTweet({
      ...baseReply,
      tweetId: '712',
      text: 'check123456',
      author: u2,
    });
    expect(Shared.evaluateTweet(s1, cfg, null, undefined, true, shortTracker).blocked).toBe(false);
    expect(Shared.evaluateTweet(s2, cfg, null, undefined, true, shortTracker).blocked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // T3-V2-08: F04 MAIN parser × ISOLATED DomController duplicate-reply parity
  // -------------------------------------------------------------------------
  it('T3-V2-08: F04 MAIN parser × ISOLATED DomController duplicate-reply parity', async () => {
    const ThreadDuplicateTracker = requireExport<new () => any>(
      sharedMod,
      'ThreadDuplicateTracker',
      '@keepxclean/shared'
    );
    const { DomController } = await requireModule<{ DomController: new (css: string) => any }>(
      'apps/extension/src/content/dom-controller.ts',
      'DomController'
    );

    const cfg = Shared.createDefaultConfig('standard') as any;
    cfg.interceptionMode = 'collapse';
    expect(cfg.rules.replySpam.blockDuplicateReplies).toBe(true);

    const opAuthor = { restId: '800000', screenName: 'op_user', followersCount: 8000 };
    const payload = buildTweetDetailPayload(
      {
        tweetId: '80000',
        text: 'Sharing our quarterly engineering retrospective today.',
        author: opAuthor,
      },
      [
        {
          tweetId: '80001',
          text: 'Check out this amazing giveaway link in my pinned post now!',
          author: { restId: '800001', screenName: 'army_a', followersCount: 6000 },
        },
        {
          tweetId: '80002',
          text: '@op_user  CHECK OUT THIS AMAZING GIVEAWAY LINK IN MY PINNED POST NOW!!! https://t.co/xyz',
          author: { restId: '800002', screenName: 'army_b', followersCount: 6000 },
        },
        {
          tweetId: '80003',
          text: 'Check out this amazing giveaway link in my pinned post now!',
          author: opAuthor,
        },
      ]
    );

    const mainTracker = new ThreadDuplicateTracker();
    const processed = Shared.processGraphqlResponsePayload(
      payload,
      GRAPHQL_URLS.tweetDetail,
      '/op_user/status/80000',
      cfg,
      null,
      undefined,
      mainTracker
    );

    expect(processed.decisionsByTweetId['80001']?.decision?.blocked).toBe(false);
    expect(processed.decisionsByTweetId['80002']?.decision?.blocked).toBe(true);
    expect(processed.decisionsByTweetId['80002']?.decision?.ruleId).toBe('reply_spam');
    expect(processed.decisionsByTweetId['80002']?.decision?.action).toBe('collapse');
    expect(processed.decisionsByTweetId['80003']?.decision?.blocked).toBe(false);

    const vb = createVirtualBrowser({
      url: 'https://x.com/op_user/status/80000',
      html: `<!DOCTYPE html><html><body>
        <main>
          <div data-testid="cellInnerDiv">
            <article data-testid="tweet" id="art-80001">
              <a href="/army_a/status/80001"><time datetime="2026-11-25T00:01:00Z">1m</time></a>
            </article>
          </div>
          <div data-testid="cellInnerDiv">
            <article data-testid="tweet" id="art-80002">
              <a href="/army_b/status/80002"><time datetime="2026-11-25T00:02:00Z">2m</time></a>
            </article>
          </div>
          <div data-testid="cellInnerDiv">
            <article data-testid="tweet" id="art-80003">
              <a href="/op_user/status/80003"><time datetime="2026-11-25T00:03:00Z">3m</time></a>
            </article>
          </div>
        </main>
      </body></html>`,
    });
    let restoreDom: (() => void) | undefined;
    let controller: any;
    try {
      restoreDom = installVirtualDomGlobals(vb);
      controller = new DomController('');
      controller.update(cfg, Shared.createDefaultCrowdSnapshot());
      controller.ingest(processed.decisionsByTweetId, processed.authorsByScreenName);

      const art1 = vb.document.getElementById('art-80001')!;
      const art2 = vb.document.getElementById('art-80002')!;
      const art3 = vb.document.getElementById('art-80003')!;

      expect(art1.getAttribute('data-kxc-hidden')).toBeNull();
      expect(art2.getAttribute('data-kxc-hidden')).toBe('true');
      expect(art3.getAttribute('data-kxc-hidden')).toBeNull();

      const collapseItems = controller
        .getSnapshot()
        .filter((i: { kind: string }) => i.kind === 'collapse');
      expect(collapseItems).toHaveLength(1);
      expect(collapseItems[0].decision?.ruleId).toBe('reply_spam');

      // Re-scanning twice must NOT self-collide with art-80001
      controller.scan();
      controller.scan();
      expect(art1.getAttribute('data-kxc-hidden')).toBeNull();
      expect(art2.getAttribute('data-kxc-hidden')).toBe('true');

      // Toggling blockDuplicateReplies OFF immediately restores art-80002
      const disabledCfg = structuredClone(cfg);
      disabledCfg.rules.replySpam.blockDuplicateReplies = false;
      controller.update(disabledCfg, Shared.createDefaultCrowdSnapshot());
      expect(art2.getAttribute('data-kxc-hidden')).toBeNull();
      expect(
        controller.getSnapshot().filter((i: { kind: string }) => i.kind === 'collapse')
      ).toHaveLength(0);
    } finally {
      controller?.dispose();
      restoreDom?.();
      vb.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-09: F05 domainFilter × QT/RT penetration × hit_uid × secondary whitelist
  // -------------------------------------------------------------------------
  it('T3-V2-09: F05 domainFilter × QT/RT penetration × hit_uid × secondary whitelist', () => {
    const cfg = Shared.createDefaultConfig('standard') as any;
    cfg.rules.domainFilter = {
      enabled: true,
      items: [{ id: 'dom-tme', domain: 't.me', enabled: true }],
    };

    // (1) GraphQL QT where quoted tweet links to https://sub.t.me/vip
    const qtPayload = buildHomeTimelinePayload([
      buildGraphqlTweetEntry({
        tweetId: '9001',
        text: 'Look at what this account just shared.',
        author: { restId: '90010', screenName: 'quoter_9001', followersCount: 4000 },
        quotedTweet: {
          tweetId: '9002',
          text: 'Join our private VIP channel right now.',
          urls: ['https://sub.t.me/vip'],
          author: { restId: '9002', screenName: 'quoted_scammer', followersCount: 200 },
        },
      }),
    ]);

    const res = Shared.processGraphqlResponsePayload(
      qtPayload,
      GRAPHQL_URLS.forYou,
      '/home',
      cfg
    );
    const entry9001 = res.decisionsByTweetId['9001'] as any;
    expect(entry9001).toBeDefined();
    expect(entry9001.tweet.quotedUrls).toContain('https://sub.t.me/vip');
    expect(entry9001.decision.blocked).toBe(true);
    expect(entry9001.decision.ruleId).toBe('domain_filter');
    expect(entry9001.decision.matchedTarget).toEqual({ kind: 'domain', id: 'dom-tme' });
    const hitEvidence = (entry9001.decision.evidence ?? []).find(
      (ev: any) => ev.key === 'hit_uid'
    );
    expect(hitEvidence?.value).toBe('9002');
    expect(res.interceptedLogs).toHaveLength(1);
    expect(res.interceptedLogs[0].authorUid).toBe('9002');

    // (2) Quoted author bioUrls penetration
    const bioQtTweet = makeExtractedTweet({
      tweetId: '9003',
      text: 'Interesting commentary here.',
      author: makeExtractedAuthor({ restId: '90011', screenName: 'clean_quoter' }),
      quotedAuthor: makeExtractedAuthor({
        restId: '9003',
        screenName: 'bio_link_scammer',
        bioUrls: ['https://join.t.me/group'],
      }),
    });
    const bioDec = Shared.evaluateTweet(bioQtTweet, cfg) as any;
    expect(bioDec.blocked).toBe(true);
    expect(bioDec.ruleId).toBe('domain_filter');
    expect(bioDec.evidence.find((ev: any) => ev.key === 'hit_uid')?.value).toBe('9003');

    // (3) Retweet (RT) penetration via retweetedTweet (retweetedAuthor bioUrls + tweet URL)
    const rtPayload = buildHomeTimelinePayload([
      buildGraphqlTweetEntry({
        tweetId: '9005',
        text: 'RT @rt_scammer: Check out our private channel',
        author: { restId: '90015', screenName: 'retweeter_9005', followersCount: 4000 },
        retweetedTweet: {
          tweetId: '9006',
          text: 'Check out our private channel',
          urls: ['https://promo.t.me/channel'],
          author: {
            restId: '9004',
            screenName: 'rt_scammer',
            followersCount: 300,
            bioUrls: ['https://promo.t.me/channel'],
          },
        },
      }),
    ]);
    const rtRes = Shared.processGraphqlResponsePayload(
      rtPayload,
      GRAPHQL_URLS.forYou,
      '/home',
      cfg
    );
    const entry9005 = rtRes.decisionsByTweetId['9005'] as any;
    expect(entry9005).toBeDefined();
    expect(entry9005.decision.blocked).toBe(true);
    expect(entry9005.decision.ruleId).toBe('domain_filter');
    expect(entry9005.decision.matchedTarget).toEqual({ kind: 'domain', id: 'dom-tme' });
    const rtHitEvidence = (entry9005.decision.evidence ?? []).find(
      (ev: any) => ev.key === 'hit_uid'
    );
    expect(rtHitEvidence?.value).toBe('9004');
    expect(rtRes.interceptedLogs).toHaveLength(1);
    expect(rtRes.interceptedLogs[0].authorUid).toBe('9004');

    // (4) Non-subdomain negatives (not-t.me & query param ?r=t.me) must NOT match
    const negHost = makeExtractedTweet({
      tweetId: '9004',
      text: 'Checking a different domain.',
      urls: ['https://not-t.me/a', 'https://safe.example/?r=t.me'],
      author: makeExtractedAuthor({ restId: '90012', screenName: 'safe_user' }),
    });
    expect(Shared.evaluateTweet(negHost, cfg).blocked).toBe(false);

    // (5) Secondary whitelist on quotedAuthor ('9002') exempts QT penetration
    const wlCfg = structuredClone(cfg);
    wlCfg.whitelistUids = {
      '9002': { uid: '9002', screenName: 'quoted_scammer', addedAt: 1_700_000_000_000 },
    };
    const wlRes = Shared.processGraphqlResponsePayload(
      buildHomeTimelinePayload([
        buildGraphqlTweetEntry({
          tweetId: '9001',
          text: 'Look at what this account just shared.',
          author: { restId: '90010', screenName: 'quoter_9001', followersCount: 4000 },
          quotedTweet: {
            tweetId: '9002',
            text: 'Join our private VIP channel right now.',
            urls: ['https://sub.t.me/vip'],
            author: { restId: '9002', screenName: 'quoted_scammer', followersCount: 200 },
          },
        }),
      ]),
      GRAPHQL_URLS.forYou,
      '/home',
      wlCfg
    );
    expect(wlRes.decisionsByTweetId['9001']?.decision?.blocked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // T3-V2-10: F05 domainFilter × onlyInReplies/maxFollowersExempt × applyPresetToConfig
  // -------------------------------------------------------------------------
  it('T3-V2-10: F05 domainFilter × onlyInReplies/maxFollowersExempt × applyPresetToConfig preservation', () => {
    const baseCfg = Shared.createDefaultConfig('light') as any;
    baseCfg.rules.domainFilter = {
      enabled: true,
      items: [
        {
          id: 'dom-c',
          domain: 'promo-hub.example',
          onlyInReplies: true,
          maxFollowersExempt: 10_000,
          enabled: true,
        },
        {
          id: 'dom-all',
          domain: 'spam-all.example',
          enabled: true,
        },
      ],
    };

    const lowFollowerReply = makeExtractedTweet({
      tweetId: '31001',
      text: 'Check out our site here.',
      scene: 'reply',
      isReply: true,
      urls: ['https://app.promo-hub.example/offer'],
      author: makeExtractedAuthor({ restId: '3101', screenName: 'low_f', followersCount: 500 }),
    });
    const lowFollowerTimeline = makeExtractedTweet({
      ...lowFollowerReply,
      tweetId: '31002',
      scene: 'timeline',
      isReply: false,
    });
    const highFollowerReply = makeExtractedTweet({
      ...lowFollowerReply,
      tweetId: '31003',
      author: makeExtractedAuthor({ restId: '3102', screenName: 'high_f', followersCount: 50_000 }),
    });

    // (1) Low-follower reply -> blocked
    const dec1 = Shared.evaluateTweet(lowFollowerReply, baseCfg);
    expect(dec1.blocked).toBe(true);
    expect(dec1.ruleId).toBe('domain_filter');

    // (2) Low-follower timeline tweet -> allowed (onlyInReplies)
    expect(Shared.evaluateTweet(lowFollowerTimeline, baseCfg).blocked).toBe(false);

    // (3) High-follower reply -> allowed (maxFollowersExempt)
    expect(Shared.evaluateTweet(highFollowerReply, baseCfg).blocked).toBe(false);

    // (4) Preserved across preset transitions light -> strict -> standard
    const strictCfg = Shared.applyPresetToConfig(baseCfg, 'strict') as any;
    const standardCfg = Shared.applyPresetToConfig(strictCfg, 'standard') as any;
    expect(standardCfg.rules.domainFilter.enabled).toBe(true);
    expect(standardCfg.rules.domainFilter.items).toHaveLength(2);
    expect(standardCfg.rules.domainFilter.items[0].onlyInReplies).toBe(true);
    expect(standardCfg.rules.domainFilter.items[0].maxFollowersExempt).toBe(10_000);

    expect(Shared.evaluateTweet(lowFollowerReply, standardCfg).ruleId).toBe('domain_filter');
    expect(Shared.evaluateTweet(lowFollowerTimeline, standardCfg).blocked).toBe(false);
    expect(Shared.evaluateTweet(highFollowerReply, standardCfg).blocked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // T3-V2-11: F06 10-lang cloud packs × locale resolution × disabledCloudKeywordIds × override
  // -------------------------------------------------------------------------
  it('T3-V2-11: F06 10-lang cloud packs × locale resolution × disabledCloudKeywordIds × explicit override', () => {
    const resolveEnabledCloudLangGroups = requireExport<(cfg: any) => string[]>(
      sharedMod,
      'resolveEnabledCloudLangGroups',
      '@keepxclean/shared'
    );

    const cfg = Shared.createDefaultConfig('standard') as any;
    cfg.locale = 'ja';
    delete cfg.enabledCloudLangGroups;

    // (1) locale: 'ja' activates universal + en + ja, NOT ru
    const groups = resolveEnabledCloudLangGroups(cfg);
    expect(groups).toContain('universal');
    expect(groups).toContain('en');
    expect(groups).toContain('ja');
    expect(groups).not.toContain('ru');

    const jaFollowTweet = makeExtractedTweet({
      tweetId: '31101',
      text: 'リプでフォロバします 相互希望です',
      author: makeExtractedAuthor({ restId: '3111', screenName: 'ja_pod' }),
    });
    const jaScamTweet = makeExtractedTweet({
      tweetId: '31102',
      text: 'お金配り 現金配布 実施中です',
      author: makeExtractedAuthor({ restId: '3112', screenName: 'ja_scam' }),
    });
    const ruFollowTweet = makeExtractedTweet({
      tweetId: '31103',
      text: 'Взаимная подписка 100%',
      author: makeExtractedAuthor({ restId: '3113', screenName: 'ru_pod' }),
    });

    const dJaFollow = Shared.evaluateTweet(jaFollowTweet, cfg) as any;
    expect(dJaFollow.blocked).toBe(true);
    expect(dJaFollow.ruleId).toBe('cloud_keyword');
    expect(dJaFollow.matchedTarget).toEqual({ kind: 'cloud_keyword', id: 'cloud-follow-ja-1' });
    expect(Shared.evaluateTweet(ruFollowTweet, cfg).blocked).toBe(false);

    // (2) Disabling cloud-follow-ja-1 preserves sibling cloud-scam-ja-1
    const partialDisableCfg = structuredClone(cfg);
    partialDisableCfg.disabledCloudKeywordIds = ['cloud-follow-ja-1'];
    expect(Shared.evaluateTweet(jaFollowTweet, partialDisableCfg).blocked).toBe(false);
    const dJaScam = Shared.evaluateTweet(jaScamTweet, partialDisableCfg) as any;
    expect(dJaScam.blocked).toBe(true);
    expect(dJaScam.matchedTarget).toEqual({ kind: 'cloud_keyword', id: 'cloud-scam-ja-1' });

    // (3) Explicit enabledCloudLangGroups overrides locale auto-resolution
    const overrideCfg = structuredClone(cfg);
    overrideCfg.enabledCloudLangGroups = ['universal', 'ru'];
    const dRu = Shared.evaluateTweet(ruFollowTweet, overrideCfg) as any;
    expect(dRu.blocked).toBe(true);
    expect(dRu.matchedTarget).toEqual({ kind: 'cloud_keyword', id: 'cloud-follow-ru-1' });
    expect(Shared.evaluateTweet(jaScamTweet, overrideCfg).blocked).toBe(false);
  });

  // -------------------------------------------------------------------------
  // T3-V2-12: F06 × F07 D1 0004 snapshot merge × remote emergency pause × evaluateTweet
  // -------------------------------------------------------------------------
  it('T3-V2-12: F06 × F07 D1 0004 snapshot merge × remote emergency pause × live evaluateTweet', async () => {
    const d1 = createSqliteD1Adapter();
    try {
      await applyServerMigrations(d1, { requireMigration0004: true });
      const serverMod = await requireModule<{ app: any }>(
        'apps/server/src/index.ts',
        'Cloudflare Worker server'
      );

      const now = Date.now();
      await d1
        .prepare(
          `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, note, enabled, lang_group, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          'cloud-ko-pair-1',
          '특가코인에어드랍',
          0,
          JSON.stringify(['text']),
          'Korean hotfix scam token',
          1,
          'ko',
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

      const res = await serverMod.app.request(
        'https://api.keepxclean.com/v1/snapshot.json?fresh=1',
        { method: 'GET' },
        { DB: d1 }
      );
      expect(res.status).toBe(200);
      const snapshot = (await res.json()) as any;
      expect(Array.isArray(snapshot.cloudKeywords)).toBe(true);

      const koRule = snapshot.cloudKeywords.find((k: any) => k.id === 'cloud-ko-pair-1');
      expect(koRule).toBeDefined();
      expect(koRule.langGroup).toBe('ko');
      expect(koRule.enabled).toBe(true);

      const pausedRule = snapshot.cloudKeywords.find((k: any) => k.id === 'cloud-nsfw-bio-1');
      expect(pausedRule).toBeDefined();
      expect(pausedRule.enabled).toBe(false);

      const koTweet = makeExtractedTweet({
        tweetId: '31201',
        text: '지금 바로 특가코인에어드랍 참여하세요',
        author: makeExtractedAuthor({ restId: '3121', screenName: 'ko_scammer' }),
      });
      const nsfwTweet = makeExtractedTweet({
        tweetId: '31202',
        text: 'Check out my updates.',
        author: makeExtractedAuthor({
          restId: '3122',
          screenName: 'of_account',
          bio: 'onlyfans.com/paused_test',
        }),
      });

      // (1) locale: 'ko' blocks Korean hotfix rule
      const koCfg = Shared.createDefaultConfig('standard') as any;
      koCfg.locale = 'ko';
      const decKo = Shared.evaluateTweet(koTweet, koCfg, snapshot) as any;
      expect(decKo.blocked).toBe(true);
      expect(decKo.ruleId).toBe('cloud_keyword');
      expect(decKo.matchedTarget).toEqual({ kind: 'cloud_keyword', id: 'cloud-ko-pair-1' });

      // (2) locale: 'en' does NOT activate 'ko' pack
      const enCfg = Shared.createDefaultConfig('standard') as any;
      enCfg.locale = 'en';
      expect(Shared.evaluateTweet(koTweet, enCfg, snapshot).blocked).toBe(false);

      // (3) Remote emergency pause disables cloud-nsfw-bio-1 (positive control: null snapshot blocks it!)
      expect(Shared.evaluateTweet(nsfwTweet, enCfg, null).blocked).toBe(true);
      expect(Shared.evaluateTweet(nsfwTweet, enCfg, snapshot).blocked).toBe(false);
    } finally {
      d1.close();
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-13: F08 HomeTimeline/HomeLatestTimeline × sceneModes × blocklist × ads
  // -------------------------------------------------------------------------
  it('T3-V2-13: F08 HomeTimeline/HomeLatestTimeline × sceneModes × localBlocklistUids × hidePromotedAds', () => {
    const cfg = Shared.createDefaultConfig('standard') as any;
    cfg.interceptionMode = 'collapse';
    cfg.sceneModes = { for_you: 'strip', following: 'bypass' };
    cfg.rules.keywords.items = [
      {
        id: 'kw-scene-combo',
        pattern: 'scene_combo_spam',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
    ];
    cfg.localBlocklistUids = {
      '91301': { uid: '91301', screenName: 'blocked_user_13', addedAt: 1_700_000_000_000 },
    };
    cfg.rules.hidePromotedAds.enabled = true;

    // (1) HomeTimeline (for_you: 'strip') -> heuristic spam stripped, clean kept
    const forYouPayload = buildHomeTimelinePayload(
      [
        buildGraphqlTweetEntry({
          tweetId: '13001',
          text: 'Buy now scene_combo_spam special deal.',
          author: { restId: '91310', screenName: 'spammer_fy' },
        }),
        buildGraphqlTweetEntry({
          tweetId: '13002',
          text: 'Normal architecture discussion post.',
          author: { restId: '91311', screenName: 'clean_fy' },
        }),
      ],
      'for_you'
    );
    const fyRes = Shared.processGraphqlResponsePayload(
      forYouPayload,
      GRAPHQL_URLS.forYou,
      '/home',
      cfg
    );
    expect((fyRes.decisionsByTweetId['13001']?.tweet as any)?.timelineFeed).toBe('for_you');
    expect(fyRes.decisionsByTweetId['13001']?.decision?.action).toBe('strip');
    expect(fyRes.modified).toBe(true);
    const fyEntries = (forYouPayload as any).data.home.home_timeline_urt.instructions[0].entries;
    expect(fyEntries.map((e: any) => e.entryId)).toEqual(['tweet-13002']);

    // (2) HomeLatestTimeline (following: 'bypass') -> heuristic spam bypassed,
    //     while localBlocklistUids (collapse) and hidePromotedAds (strip) STILL fire!
    const followingPayload = buildHomeTimelinePayload(
      [
        buildGraphqlTweetEntry({
          tweetId: '13003',
          text: 'Mentioning scene_combo_spam in Following feed.',
          author: { restId: '91312', screenName: 'followed_writer' },
        }),
        buildGraphqlTweetEntry({
          tweetId: '13004',
          text: 'Regular text from locally blocked account.',
          author: { restId: '91301', screenName: 'blocked_user_13' },
        }),
        buildGraphqlTweetEntry({
          tweetId: '13005',
          text: 'Sponsored enterprise product launch.',
          isPromoted: true,
          author: { restId: '91313', screenName: 'ad_brand' },
        }),
      ],
      'following'
    );
    const flRes = Shared.processGraphqlResponsePayload(
      followingPayload,
      GRAPHQL_URLS.following,
      '/home',
      cfg
    );
    expect((flRes.decisionsByTweetId['13003']?.tweet as any)?.timelineFeed).toBe('following');
    expect(flRes.decisionsByTweetId['13003']?.decision?.blocked).toBe(false);
    expect(flRes.decisionsByTweetId['13003']?.decision?.action).toBe('allow');

    expect(flRes.decisionsByTweetId['13004']?.decision?.blocked).toBe(true);
    expect(flRes.decisionsByTweetId['13004']?.decision?.ruleId).toBe('local_blocklist');
    expect(flRes.decisionsByTweetId['13004']?.decision?.action).toBe('collapse');

    expect(flRes.decisionsByTweetId['13005']?.decision?.blocked).toBe(true);
    expect(flRes.decisionsByTweetId['13005']?.decision?.ruleId).toBe('promoted_ad');
    expect(flRes.decisionsByTweetId['13005']?.decision?.action).toBe('strip');

    const flEntries = (followingPayload as any).data.home.home_timeline_urt.instructions[0].entries;
    const flEntryIds = flEntries.map((e: any) => e.entryId);
    expect(flEntryIds).toContain('tweet-13003');
    expect(flEntryIds).toContain('tweet-13004');
    expect(flEntryIds).not.toContain('tweet-13005');
  });

  // -------------------------------------------------------------------------
  // T3-V2-14: F09 matchedTarget × target.disable × live DomController restore
  // -------------------------------------------------------------------------
  it('T3-V2-14: F09 matchedTarget × target.disable × live DomController restore (all 4 disableable kinds)', async () => {
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
              <article data-testid="tweet" id="art-kw">
                <a href="/u_kw/status/14001"><time datetime="2026-11-25T00:01:00Z">1m</time></a>
              </article>
            </div>
            <div data-testid="cellInnerDiv">
              <article data-testid="tweet" id="art-cloud">
                <a href="/u_cloud/status/14002"><time datetime="2026-11-25T00:02:00Z">2m</time></a>
              </article>
            </div>
            <div data-testid="cellInnerDiv">
              <article data-testid="tweet" id="art-dom">
                <a href="/u_dom/status/14003"><time datetime="2026-11-25T00:03:00Z">3m</time></a>
              </article>
            </div>
            <div data-testid="cellInnerDiv">
              <article data-testid="tweet" id="art-pack">
                <a href="/u_pack/status/14004"><time datetime="2026-11-25T00:04:00Z">4m</time></a>
              </article>
            </div>
          </main>
        </body></html>`,
      });
      restoreDom = installVirtualDomGlobals(vb);
      expect(
        (
          await bg.sendCommand({
            type: 'keyword.save',
            item: {
              id: 'kw-live-1',
              pattern: 'live_kw_disable_tok',
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
            item: { id: 'dom-live-1', domain: 'live-dom.example', enabled: true },
          })
        ).ok
      ).toBe(true);
      const pack = createValidKxcPackV1({ id: 'pack-live-1' });
      expect((await bg.sendCommand({ type: 'pack.install', pack })).ok).toBe(true);

      const st0 = await bg.sendCommand<any>({ type: 'state.get' });
      const tKw = makeExtractedTweet({
        tweetId: '14001',
        text: 'Post with live_kw_disable_tok here.',
        author: makeExtractedAuthor({ restId: '14101', screenName: 'u_kw' }),
      });
      const tCloud = makeExtractedTweet({
        tweetId: '14002',
        text: 'Normal text with bio pointer.',
        author: makeExtractedAuthor({
          restId: '14102',
          screenName: 'u_cloud',
          bio: 'onlyfans.com/live_restore_test',
        }),
      });
      const tDom = makeExtractedTweet({
        tweetId: '14003',
        text: 'Visit our new app site.',
        urls: ['https://app.live-dom.example/go'],
        author: makeExtractedAuthor({ restId: '14103', screenName: 'u_dom' }),
      });
      const tPack = makeExtractedTweet({
        tweetId: '14004',
        text: 'Guaranteed 1000x moonshot alpha link.',
        author: makeExtractedAuthor({ restId: '14104', screenName: 'u_pack' }),
      });

      const dKw = Shared.evaluateTweet(tKw, st0.data.config, st0.data.snapshot) as any;
      const dCloud = Shared.evaluateTweet(tCloud, st0.data.config, st0.data.snapshot) as any;
      const dDom = Shared.evaluateTweet(tDom, st0.data.config, st0.data.snapshot) as any;
      const dPack = Shared.evaluateTweet(tPack, st0.data.config, st0.data.snapshot) as any;

      expect(dKw.matchedTarget).toEqual({ kind: 'keyword', id: 'kw-live-1' });
      expect(dCloud.matchedTarget).toEqual({ kind: 'cloud_keyword', id: 'cloud-nsfw-bio-1' });
      expect(dDom.matchedTarget).toEqual({ kind: 'domain', id: 'dom-live-1' });
      expect(dPack.matchedTarget).toEqual({
        kind: 'pack_item',
        id: 'pk-kw-1',
        packId: 'pack-live-1',
      });

      controller = new DomController('');
      controller.update(st0.data.config, st0.data.snapshot);
      controller.ingest(
        {
          '14001': { tweet: tKw },
          '14002': { tweet: tCloud },
          '14003': { tweet: tDom },
          '14004': { tweet: tPack },
        },
        {
          u_kw: { author: tKw.author },
          u_cloud: { author: tCloud.author },
          u_dom: { author: tDom.author },
          u_pack: { author: tPack.author },
        }
      );

      const arts = [
        { el: vb.document.getElementById('art-kw')!, target: dKw.matchedTarget },
        { el: vb.document.getElementById('art-cloud')!, target: dCloud.matchedTarget },
        { el: vb.document.getElementById('art-dom')!, target: dDom.matchedTarget },
        { el: vb.document.getElementById('art-pack')!, target: dPack.matchedTarget },
      ];
      for (const a of arts) {
        expect(a.el.getAttribute('data-kxc-hidden')).toBe('true');
      }

      // Disable each matchedTarget sequentially and confirm selective live DOM restoration
      for (let i = 0; i < arts.length; i++) {
        const res = await bg.sendCommand({ type: 'target.disable', target: arts[i].target });
        expect(res.ok).toBe(true);
        const stNext = await bg.sendCommand<any>({ type: 'state.get' });
        controller.update(stNext.data.config, stNext.data.snapshot);

        for (let j = 0; j < arts.length; j++) {
          if (j <= i) {
            expect(arts[j].el.getAttribute('data-kxc-hidden')).toBeNull();
          } else {
            expect(arts[j].el.getAttribute('data-kxc-hidden')).toBe('true');
          }
        }
      }

      // Sibling pack domain (pk-dom-1) MUST still block after disabling pk-kw-1
      const finalState = await bg.sendCommand<any>({ type: 'state.get' });
      const siblingPackTweet = makeExtractedTweet({
        tweetId: '14005',
        text: 'Normal text linking pack domain.',
        urls: ['https://launch.pump-scam.example/go'],
        author: makeExtractedAuthor({ restId: '14105', screenName: 'u_pack_dom' }),
      });
      const siblingDec = Shared.evaluateTweet(
        siblingPackTweet,
        finalState.data.config,
        finalState.data.snapshot
      ) as any;
      expect(siblingDec.blocked).toBe(true);
      expect(siblingDec.ruleId).toBe('rule_pack');
      expect(siblingDec.matchedTarget).toEqual({
        kind: 'pack_item',
        id: 'pk-dom-1',
        packId: 'pack-live-1',
      });
    } finally {
      controller?.dispose();
      restoreDom?.();
      vb?.cleanup();
      await cleanupBg(bg);
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-15: F09 options.open deep-link encoding × tab reuse × allowlist
  // -------------------------------------------------------------------------
  it('T3-V2-15: F09 options.open deep-link encoding × tab reuse × allowlist sanitization', async () => {
    const bg = await bootBackgroundHarness();
    try {
      const validCases: Array<{
        page: string;
        query: Record<string, string>;
        expectedHash: string;
        expectedParams: Array<[string, string]>;
      }> = [
        {
          page: 'rules',
          query: { focus: 'grokFilter' },
          expectedHash: '#/rules?',
          expectedParams: [['focus', 'grokFilter']],
        },
        {
          page: 'keywords',
          query: { tab: 'domains', focus: 'dom-1' },
          expectedHash: '#/keywords?',
          expectedParams: [
            ['tab', 'domains'],
            ['focus', 'dom-1'],
          ],
        },
        {
          page: 'accounts',
          query: { action: 'import' },
          expectedHash: '#/accounts?',
          expectedParams: [['action', 'import']],
        },
        {
          page: 'rules',
          query: { rule: 'replySpam' },
          expectedHash: '#/rules?',
          expectedParams: [['rule', 'replySpam']],
        },
      ];

      for (const vc of validCases) {
        const createdBefore = bg.chromeEnv.createdTabs.length;
        const updatedBefore = bg.chromeEnv.updatedTabs.length;
        const res = await bg.sendCommand({
          type: 'options.open',
          page: vc.page,
          query: vc.query,
        });
        expect(res.ok).toBe(true);

        const openedUrl = extractLastOptionsUrl(bg.chromeEnv, createdBefore, updatedBefore);
        expect(openedUrl).toContain('options.html');
        expect(openedUrl).toContain(vc.expectedHash);
        const hashQuery = openedUrl.split('?')[1] ?? '';
        const params = new URLSearchParams(hashQuery);
        for (const [k, v] of vc.expectedParams) {
          expect(params.get(k)).toBe(v);
        }
      }

      // Reuse existing options tab across repeated valid calls
      expect(bg.chromeEnv.createdTabs.length).toBe(1);
      expect(bg.chromeEnv.updatedTabs.length).toBeGreaterThanOrEqual(3);

      // Hostile deep-link payloads MUST be rejected with 0 tab mutations
      const hostileCases: Array<{ page?: string; query?: Record<string, string> }> = [
        { page: '../evil' },
        { page: 'javascript:alert(1)' },
        { page: 'unknown' },
        { page: 'rules', query: { focus: '<script>1</script>' } },
        { page: 'rules', query: { redirect: 'https://evil.example' } },
        { page: 'rules', query: { focus: '../secret' } },
      ];
      for (const hc of hostileCases) {
        const createdBefore = bg.chromeEnv.createdTabs.length;
        const updatedBefore = bg.chromeEnv.updatedTabs.length;
        const res = await bg.sendCommand({ type: 'options.open', ...hc });
        expect(res.ok).toBe(false);
        expect(bg.chromeEnv.createdTabs.length).toBe(createdBefore);
        expect(bg.chromeEnv.updatedTabs.length).toBe(updatedBefore);
      }
    } finally {
      await cleanupBg(bg);
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-16: F10 privacy defaults × F11 onboarding × M00.6 v0.1.2 upgrade × Popup
  // -------------------------------------------------------------------------
  it(
    'T3-V2-16: F10 privacy defaults × F11 onboarding × M00.6 v0.1.2 upgrade × Popup mount',
    async () => {
      const resolveEnabledCloudLangGroups = requireExport<(cfg: any) => string[]>(
        sharedMod,
        'resolveEnabledCloudLangGroups',
        '@keepxclean/shared'
      );
      const loadPopup = async () => {
        const mod = await requireModule<{ App?: any; default?: any }>(
          'apps/extension/entrypoints/popup/App.tsx',
          'Popup App'
        );
        return mod.App ?? mod.default;
      };

      // (1) Fresh install
      let freshStateData: Record<string, unknown>;
      const bgFresh = await bootBackgroundHarness();
      try {
        await bgFresh.fireInstalled('install');
        expect(bgFresh.chromeEnv.createdTabs).toHaveLength(0);

        const st = await bgFresh.sendCommand<any>({ type: 'state.get' });
        expect(st.ok).toBe(true);
        expect(st.data.config.version).toBe(1);
        expect(st.data.config.onboardingDismissed).toBe(false);
        expect(st.data.config.syncNativeXBlock).toBe(false);
        expect(st.data.config.enableCrowdReport).toBe(false);
        freshStateData = structuredClone(st.data);
      } finally {
        await cleanupBg(bgFresh);
      }

      // (2) Upgrade from v0.1.2 preserving true privacy flags & marking onboardingDismissed: true
      let upgradedStateData: Record<string, unknown>;
      const legacyCfg = createLegacyV012ConfigFixture({
        syncNativeXBlock: true,
        enableCrowdReport: true,
      });
      const bgUpgrade = await bootBackgroundHarness({
        local: { [Shared.STORAGE_KEYS.CONFIG]: legacyCfg },
      });
      try {
        await bgUpgrade.fireInstalled('update');
        expect(bgUpgrade.chromeEnv.createdTabs).toHaveLength(0);

        const st = await bgUpgrade.sendCommand<any>({ type: 'state.get' });
        expect(st.ok).toBe(true);
        const cfg = st.data.config;
        expect(cfg.version).toBe(1);
        expect(cfg.onboardingDismissed).toBe(true);
        expect(cfg.syncNativeXBlock).toBe(true);
        expect(cfg.enableCrowdReport).toBe(true);
        expect(cfg.rules.grokFilter.protectOfficialGrok).toBe(true);
        expect(cfg.rules.domainFilter.enabled).toBe(true);
        expect(cfg.rules.replySpam.blockDuplicateReplies).toBe(true);
        expect(resolveEnabledCloudLangGroups(cfg)).toContain('zh');
        expect(cfg.rules.keywords.items).toHaveLength(1);
        expect(cfg.localBlocklistUids['5544332211']).toBeDefined();
        expect(cfg.whitelistUids['1122334455']).toBeDefined();
        upgradedStateData = structuredClone(st.data);
      } finally {
        await cleanupBg(bgUpgrade);
      }

      // (3) Mount Popup with fresh vs upgraded state normalized to identical 'en' locale
      // (eliminates cross-script text-length confound after verifying 'zh-CN' hydration above)
      const freshMountState = structuredClone(freshStateData) as any;
      freshMountState.config.locale = 'en';
      const upgradedMountState = structuredClone(upgradedStateData) as any;
      upgradedMountState.config.locale = 'en';

      let freshBtns = 0;
      let freshTextLen = 0;
      const mountedFresh = await mountExtensionComponent(loadPopup, freshMountState, {
        url: 'chrome-extension://kxc-e2e-extension/popup.html',
      });
      try {
        const header = mountedFresh.document.querySelector('.popup-header');
        const body = mountedFresh.document.querySelector('.popup-body');
        expect(header).not.toBeNull();
        expect(body).not.toBeNull();

        const allSwitches = mountedFresh.document.querySelectorAll('button[role="switch"]');
        const headerSwitch = header!.querySelector('button[role="switch"]');
        expect(headerSwitch).not.toBeNull();
        expect(allSwitches[0]).toBe(headerSwitch);

        freshBtns = body!.querySelectorAll('button').length;
        freshTextLen = (body!.textContent ?? '').trim().length;
      } finally {
        await mountedFresh.cleanup();
      }

      const mountedUpgraded = await mountExtensionComponent(loadPopup, upgradedMountState, {
        url: 'chrome-extension://kxc-e2e-extension/popup.html',
      });
      try {
        const body = mountedUpgraded.document.querySelector('.popup-body')!;
        const upgradedBtns = body.querySelectorAll('button').length;
        const upgradedTextLen = (body.textContent ?? '').trim().length;
        expect(freshBtns).toBeGreaterThan(upgradedBtns);
        expect(freshTextLen).toBeGreaterThan(upgradedTextLen);
      } finally {
        await mountedUpgraded.cleanup();
      }
    },
    { timeout: 15000 }
  );

  // -------------------------------------------------------------------------
  // T3-V2-17: F12 kxc-pack-v1 × evaluation × pack.toggle × zero-residue uninstall
  // -------------------------------------------------------------------------
  it('T3-V2-17: F12 kxc-pack-v1 × evaluation × pack.toggle × zero-residue pack.uninstall', async () => {
    const bg = await bootBackgroundHarness();
    try {
      expect(
        (
          await bg.sendCommand({
            type: 'keyword.save',
            item: {
              id: 'pers-kw',
              pattern: 'my_personal_kw_17',
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
            item: { id: 'pers-dom', domain: 'personal-17.example', enabled: true },
          })
        ).ok
      ).toBe(true);
      expect(
        (
          await bg.sendCommand({
            type: 'account.save',
            list: 'black',
            entry: { uid: '40171', screenName: 'personal_blocked_17', addedAt: 1_700_000_000_000 },
          })
        ).ok
      ).toBe(true);

      const pack = createValidKxcPackV1({ id: 'pack-pair-17' });
      expect((await bg.sendCommand({ type: 'pack.install', pack })).ok).toBe(true);

      const st1 = await bg.sendCommand<any>({ type: 'state.get' });
      expect(st1.data.config.rules.keywords.items).toHaveLength(1);
      expect(st1.data.config.rules.domainFilter.items).toHaveLength(1);
      expect(Object.keys(st1.data.config.localBlocklistUids)).toHaveLength(1);

      const packKwTweet = makeExtractedTweet({
        tweetId: '17001',
        text: 'Guaranteed 1000x moonshot alpha.',
        author: makeExtractedAuthor({ restId: '17101', screenName: 'pk_u1' }),
      });
      const packDomTweet = makeExtractedTweet({
        tweetId: '17002',
        text: 'Check this link.',
        urls: ['https://app.pump-scam.example/go'],
        author: makeExtractedAuthor({ restId: '17102', screenName: 'pk_u2' }),
      });
      const packUidTweet = makeExtractedTweet({
        tweetId: '17003',
        text: 'Innocent looking tweet from pack blocked UID.',
        author: makeExtractedAuthor({ restId: '8877665544', screenName: 'pack_spam_bot' }),
      });
      const persKwTweet = makeExtractedTweet({
        tweetId: '17004',
        text: 'Contains my_personal_kw_17 token.',
        author: makeExtractedAuthor({ restId: '17104', screenName: 'pers_u1' }),
      });
      const persDomTweet = makeExtractedTweet({
        tweetId: '17005',
        text: 'Links personal domain.',
        urls: ['https://sub.personal-17.example/x'],
        author: makeExtractedAuthor({ restId: '17105', screenName: 'pers_u2' }),
      });
      const persUidTweet = makeExtractedTweet({
        tweetId: '17006',
        text: 'From personal blocked UID.',
        author: makeExtractedAuthor({ restId: '40171', screenName: 'personal_blocked_17' }),
      });

      // (1) All 3 pack triggers block as rule_pack with exact matchedTarget
      for (const [tweet, expectedId] of [
        [packKwTweet, 'pk-kw-1'],
        [packDomTweet, 'pk-dom-1'],
        [packUidTweet, '8877665544'],
      ] as const) {
        const d = Shared.evaluateTweet(tweet, st1.data.config) as any;
        expect(d.blocked).toBe(true);
        expect(d.ruleId).toBe('rule_pack');
        expect(d.matchedTarget).toEqual({
          kind: 'pack_item',
          id: expectedId,
          packId: 'pack-pair-17',
        });
      }

      // (2) pack.toggle(false) suspends all 3 pack triggers while personal rules still fire
      expect(
        (await bg.sendCommand({ type: 'pack.toggle', id: 'pack-pair-17', enabled: false })).ok
      ).toBe(true);
      const st2 = await bg.sendCommand<any>({ type: 'state.get' });
      expect(Shared.evaluateTweet(packKwTweet, st2.data.config).blocked).toBe(false);
      expect(Shared.evaluateTweet(packDomTweet, st2.data.config).blocked).toBe(false);
      expect(Shared.evaluateTweet(packUidTweet, st2.data.config).blocked).toBe(false);
      expect(Shared.evaluateTweet(persKwTweet, st2.data.config).ruleId).toBe('keyword');
      expect(Shared.evaluateTweet(persDomTweet, st2.data.config).ruleId).toBe('domain_filter');
      expect(Shared.evaluateTweet(persUidTweet, st2.data.config).ruleId).toBe('local_blocklist');

      // (3) pack.uninstall removes pack cleanly with zero residue in personal rules/lists
      expect((await bg.sendCommand({ type: 'pack.uninstall', id: 'pack-pair-17' })).ok).toBe(true);
      const st3 = await bg.sendCommand<any>({ type: 'state.get' });
      expect(st3.data.config.installedPacks).toHaveLength(0);
      expect(st3.data.config.rules.keywords.items).toHaveLength(1);
      expect(st3.data.config.rules.domainFilter.items).toHaveLength(1);
      expect(Object.keys(st3.data.config.localBlocklistUids)).toEqual(['40171']);
      expect(Shared.evaluateTweet(persKwTweet, st3.data.config).ruleId).toBe('keyword');
      expect(Shared.evaluateTweet(persDomTweet, st3.data.config).ruleId).toBe('domain_filter');
      expect(Shared.evaluateTweet(persUidTweet, st3.data.config).ruleId).toBe('local_blocklist');
    } finally {
      await cleanupBg(bg);
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-18: F12 security boundary (validateRulePack & pack.install) × whitelist
  // -------------------------------------------------------------------------
  it('T3-V2-18: F12 security boundary (validateRulePack, ReDoS & pack.install) × whitelistUids precedence', async () => {
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

    // (1) Positive control: valid pack validates & serializes with zero forbidden keys
    const valid = validateRulePack(createValidKxcPackV1());
    expect(valid.format).toBe('kxc-pack-v1');
    const jsonText = serializeRulePack(valid);
    for (const forbidden of [
      'whitelistUids',
      'customApiBaseUrl',
      'syncNativeXBlock',
      'enableCrowdReport',
    ]) {
      expect(jsonText).not.toContain(forbidden);
    }

    // (2) Security rejections including forbidden keys, invalid regex, ReDoS, limits, __proto__
    const negativeCases = [
      INVALID_KXC_PACK_CASES.forbiddenWhitelistUids(),
      INVALID_KXC_PACK_CASES.forbiddenCustomApiBaseUrl(),
      INVALID_KXC_PACK_CASES.forbiddenSyncNativeXBlock(),
      INVALID_KXC_PACK_CASES.forbiddenEnableCrowdReport(),
      INVALID_KXC_PACK_CASES.invalidRegexSyntax(),
      INVALID_KXC_PACK_CASES.redosRegexPattern(),
      INVALID_KXC_PACK_CASES.oversizedRegexPattern(),
      INVALID_KXC_PACK_CASES.invalidDomain(),
      INVALID_KXC_PACK_CASES.invalidUid(),
      INVALID_KXC_PACK_CASES.tooManyKeywords(),
      INVALID_KXC_PACK_CASES.tooManyDomains(),
      INVALID_KXC_PACK_CASES.tooManyBlockedUids(),
      JSON.parse('{"format":"kxc-pack-v1","__proto__":{"polluted":true}}'),
    ];
    for (const badPack of negativeCases) {
      expect(() => validateRulePack(badPack)).toThrow();
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    // (3) pack.install RPC rejects forbidden pack leaving 0 installed packs
    const bg = await bootBackgroundHarness();
    try {
      const badRes = await bg.sendCommand({
        type: 'pack.install',
        pack: INVALID_KXC_PACK_CASES.forbiddenWhitelistUids(),
      });
      expect(badRes.ok).toBe(false);
      const st = await bg.sendCommand<any>({ type: 'state.get' });
      expect(st.data.config.installedPacks).toHaveLength(0);
    } finally {
      await cleanupBg(bg);
    }

    // (4) Runtime whitelistUids precedence over all 3 pack triggers simultaneously
    const cfg = Shared.createDefaultConfig('standard') as any;
    cfg.installedPacks = [
      {
        ...createValidKxcPackV1({ id: 'pack-sec-18' }),
        enabled: true,
        installedAt: 1_700_000_000_000,
      },
    ];
    const tripleHitTweet = makeExtractedTweet({
      tweetId: '18001',
      text: 'Guaranteed 1000x moonshot alpha link.',
      urls: ['https://pump-scam.example/join'],
      author: makeExtractedAuthor({ restId: '8877665544', screenName: 'pack_spam_bot' }),
    });
    expect(Shared.evaluateTweet(tripleHitTweet, cfg).ruleId).toBe('rule_pack');

    cfg.whitelistUids = {
      '8877665544': { uid: '8877665544', screenName: 'pack_spam_bot', addedAt: 1_700_000_000_000 },
    };
    const allowed = Shared.evaluateTweet(tripleHitTweet, cfg);
    expect(allowed.blocked).toBe(false);
    expect(allowed.action).toBe('allow');
  });

  // -------------------------------------------------------------------------
  // T3-V2-19: F12 rule packs × F13 chrome.storage.sync allowlist vs local-only
  // -------------------------------------------------------------------------
  it('T3-V2-19: F12 rule packs × F13 chrome.storage.sync allowlist vs local-only exclusion', async () => {
    const seeded = createLegacyV012ConfigFixture({
      syncNativeXBlock: true,
      enableCrowdReport: true,
      customApiBaseUrl: 'https://private.selfhost.example',
      onboardingDismissed: false,
    });
    const bg = await bootBackgroundHarness({
      local: { [Shared.STORAGE_KEYS.CONFIG]: seeded },
    });
    try {
      expect(
        (
          await bg.sendCommand({
            type: 'domain.save',
            item: { id: 'dom-sync-19', domain: 'sync-19.example', enabled: true },
          })
        ).ok
      ).toBe(true);
      expect(
        (
          await bg.sendCommand({
            type: 'pack.install',
            pack: createValidKxcPackV1({ id: 'pack-sync-19' }),
          })
        ).ok
      ).toBe(true);
      expect(
        (
          await bg.sendCommand({
            type: 'config.patch',
            patch: {
              sceneModes: { for_you: 'strip', following: 'bypass' },
              locale: 'ja',
              theme: 'dark',
            },
          })
        ).ok
      ).toBe(true);
      expect(
        (await bg.sendCommand({ type: 'cloudLangGroup.toggle', group: 'ja', enabled: true })).ok
      ).toBe(true);
      expect((await bg.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);

      const { payload } = reconstructSyncedPayload(bg.chromeEnv.syncStore);
      const synced = (payload.config ?? payload) as Record<string, any>;

      // Allowlisted fields MUST be present
      expect(synced.installedPacks).toHaveLength(1);
      expect(synced.installedPacks[0].id).toBe('pack-sync-19');
      expect(synced.rules.domainFilter.items).toHaveLength(1);
      expect(synced.rules.domainFilter.items[0].domain).toBe('sync-19.example');
      expect(synced.sceneModes).toEqual({
        for_you: 'strip',
        following: 'bypass',
        reply: 'inherit',
        search: 'inherit',
      });
      expect(synced.enabledCloudLangGroups).toContain('ja');
      expect(synced.rules.grokFilter).toBeDefined();
      expect(synced.locale).toBe('ja');
      expect(synced.theme).toBe('dark');

      // Device-local sensitive fields MUST NEVER enter chrome.storage.sync
      for (const localOnlyKey of [
        'localBlocklistUids',
        'whitelistUids',
        'syncNativeXBlock',
        'enableCrowdReport',
        'customApiBaseUrl',
        'onboardingDismissed',
      ]) {
        expect(localOnlyKey in synced).toBe(false);
      }
      const rawSyncJson = JSON.stringify(bg.chromeEnv.syncStore);
      expect(rawSyncJson).not.toContain('private.selfhost.example');
      expect(rawSyncJson).not.toContain('5544332211');
      expect(rawSyncJson).not.toContain('1122334455');
    } finally {
      await cleanupBg(bg);
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-20: F13 sync UTF-8 chunking (<=6144 B) × stale cleanup × >90 KB quota
  // -------------------------------------------------------------------------
  it(
    'T3-V2-20: F13 sync UTF-8 chunking (<=6144 B) × stale chunk cleanup × >90 KB quota degradation',
    async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect((await bg.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);

        // (1) Write 95 CJK+emoji keywords (~18 KB) -> >= 3 chunks each <= 6144 UTF-8 B
        for (let i = 0; i < 95; i++) {
          const r = await bg.sendCommand({
            type: 'keyword.save',
            item: {
              id: `kw-chunk-${i}`,
              pattern: `同步分片测试🔥_${i}_${'垃圾词条内容'.repeat(8)}`,
              isRegex: false,
              scopes: ['text'],
              enabled: true,
            },
          });
          expect(r.ok).toBe(true);
        }
        expect((await bg.sendCommand({ type: 'cloudSync.pushNow' })).ok).toBe(true);

        const { meta } = reconstructSyncedPayload(bg.chromeEnv.syncStore);
        expect(meta.chunks).toBeGreaterThanOrEqual(3);
        for (let i = 0; i < meta.chunks; i++) {
          const key = `kxc_sync_chunk_${i}`;
          const chunk = String(bg.chromeEnv.syncStore[key]);
          expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThanOrEqual(6144);
          expect(computeChromeStorageItemBytes(key, chunk)).toBeLessThanOrEqual(
            CHROME_SYNC_QUOTA_BYTES_PER_ITEM
          );
        }

        // (2) Shrink to 1 keyword via config.replace -> 1 chunk & stale chunks 1+ deleted
        const stMid = await bg.sendCommand<any>({ type: 'state.get' });
        const shrunkCfg = structuredClone(stMid.data.config);
        shrunkCfg.rules.keywords.items = [shrunkCfg.rules.keywords.items[0]];
        expect(
          (
            await bg.sendCommand({
              type: 'config.replace',
              config: shrunkCfg,
              expected: JSON.stringify(stMid.data.config),
            })
          ).ok
        ).toBe(true);
        expect((await bg.sendCommand({ type: 'cloudSync.pushNow' })).ok).toBe(true);

        const shrunkMeta = bg.chromeEnv.syncStore['kxc_sync_meta_v1'] as any;
        expect(shrunkMeta.chunks).toBe(1);
        expect(bg.chromeEnv.syncStore['kxc_sync_chunk_0']).toBeDefined();
        expect(bg.chromeEnv.syncStore['kxc_sync_chunk_1']).toBeUndefined();
        expect(bg.chromeEnv.syncStore['kxc_sync_chunk_2']).toBeUndefined();

        // (3) Exceed 90 KB cap (65 keywords × ~1550 B ≈ 100 KB) -> graceful degradation, local intact
        const syncSnapshotBeforeOverflow = structuredClone(bg.chromeEnv.syncStore);
        const stBeforeBig = await bg.sendCommand<any>({ type: 'state.get' });
        const bigCfg = structuredClone(stBeforeBig.data.config);
        bigCfg.rules.keywords.items = Array.from({ length: 65 }, (_, i) => ({
          id: `kw-over-${i}`,
          pattern: `over_pat_${i}_${'a'.repeat(950)}`,
          isRegex: false,
          scopes: ['text'],
          note: `over_note_${i}_${'b'.repeat(550)}`,
          enabled: true,
        }));
        expect(
          (
            await bg.sendCommand({
              type: 'config.replace',
              config: bigCfg,
              expected: JSON.stringify(stBeforeBig.data.config),
            })
          ).ok
        ).toBe(true);

        await bg.sendCommand({ type: 'cloudSync.pushNow' });
        const stQuota = await bg.sendCommand<any>({ type: 'state.get' });
        expect(stQuota.data.cloudSync?.status).toBe('quota_exceeded');
        expect(typeof stQuota.data.cloudSync?.error).toBe('string');
        expect((stQuota.data.cloudSync?.error ?? '').length).toBeGreaterThan(0);
        // Pre-overflow remote sync snapshot was NOT corrupted by failed oversized write
        expect(bg.chromeEnv.syncStore).toEqual(syncSnapshotBeforeOverflow);
        expect(stQuota.data.config.rules.keywords.items).toHaveLength(65);
      } finally {
        await cleanupBg(bg);
      }
    },
    { timeout: 15000 }
  );

  // -------------------------------------------------------------------------
  // T3-V2-21: F13 3-way conflict (local/remote/merge) × echo suppression × pull
  // -------------------------------------------------------------------------
  it(
    'T3-V2-21: F13 3-way conflict resolution (local/remote/merge) × echo suppression × remote pull',
    async () => {
      // Device A prepares remote cloud snapshot
      let remoteDump: Record<string, unknown> = {};
      const bgA = await bootBackgroundHarness();
      try {
        expect((await bgA.sendCommand({ type: 'config.preset', preset: 'strict' })).ok).toBe(true);
        expect(
          (
            await bgA.sendCommand({
              type: 'keyword.save',
              item: {
                id: 'kw-dev-a',
                pattern: 'device_a_token',
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
              type: 'config.patch',
              patch: { sceneModes: { for_you: 'strip' } },
            })
          ).ok
        ).toBe(true);
        expect((await bgA.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);
        remoteDump = structuredClone(bgA.chromeEnv.syncStore);
      } finally {
        await cleanupBg(bgA);
      }

      const seedDeviceB = async (): Promise<BackgroundHarness> => {
        const bgB = await bootBackgroundHarness({ sync: structuredClone(remoteDump) });
        try {
          expect(
            (
              await bgB.sendCommand({
                type: 'keyword.save',
                item: {
                  id: 'kw-dev-b',
                  pattern: 'device_b_token',
                  isRegex: false,
                  scopes: ['text'],
                  enabled: true,
                },
              })
            ).ok
          ).toBe(true);
          expect(
            (
              await bgB.sendCommand({
                type: 'account.save',
                list: 'black',
                entry: { uid: '777', screenName: 'local_blk_777', addedAt: 1_700_000_000_000 },
              })
            ).ok
          ).toBe(true);
          expect(
            (
              await bgB.sendCommand({
                type: 'account.save',
                list: 'white',
                entry: { uid: '888', screenName: 'local_wl_888', addedAt: 1_700_000_000_000 },
              })
            ).ok
          ).toBe(true);
          expect(
            (
              await bgB.sendCommand({
                type: 'config.patch',
                patch: { syncNativeXBlock: true },
              })
            ).ok
          ).toBe(true);
          const enableRes = await bgB.sendCommand({ type: 'cloudSync.enable' });
          expect(enableRes.ok).toBe(true);
          const conflictState = await bgB.sendCommand<any>({ type: 'state.get' });
          expect(conflictState.data.cloudSync.status).toBe('conflict');
          expect(conflictState.data.cloudSync.pendingRemote).toBeDefined();
          return bgB;
        } catch (err) {
          await cleanupBg(bgB);
          throw err;
        }
      };

      // (1) Strategy 'local' -> remote overwritten with kw-dev-b only, local-only excluded
      const bgLocal = await seedDeviceB();
      try {
        expect(
          (await bgLocal.sendCommand({ type: 'cloudSync.resolve', strategy: 'local' })).ok
        ).toBe(true);
        const { payload } = reconstructSyncedPayload(bgLocal.chromeEnv.syncStore);
        const synced = (payload.config ?? payload) as any;
        const kwIds = synced.rules.keywords.items.map((k: any) => k.id);
        expect(kwIds).toContain('kw-dev-b');
        expect(kwIds).not.toContain('kw-dev-a');
        expect('localBlocklistUids' in synced).toBe(false);
        expect('whitelistUids' in synced).toBe(false);
      } finally {
        await cleanupBg(bgLocal);
      }

      // (2) Strategy 'remote' -> Device B gets A's rules & preserves local-only lists/flags
      const bgRemote = await seedDeviceB();
      try {
        expect(
          (await bgRemote.sendCommand({ type: 'cloudSync.resolve', strategy: 'remote' })).ok
        ).toBe(true);
        const st = await bgRemote.sendCommand<any>({ type: 'state.get' });
        const kwIds = st.data.config.rules.keywords.items.map((k: any) => k.id);
        expect(kwIds).toContain('kw-dev-a');
        expect(st.data.config.rules.domainFilter.items[0]?.domain).toBe('dev-a.example');
        expect(st.data.config.sceneModes?.for_you).toBe('strip');
        expect(st.data.config.localBlocklistUids['777']).toBeDefined();
        expect(st.data.config.whitelistUids['888']).toBeDefined();
        expect(st.data.config.syncNativeXBlock).toBe(true);
      } finally {
        await cleanupBg(bgRemote);
      }

      // (3) Strategy 'merge' -> both A & B rules converged, plus (4) echo suppression & (5) remote pull
      const bgMerge = await seedDeviceB();
      try {
        expect(
          (await bgMerge.sendCommand({ type: 'cloudSync.resolve', strategy: 'merge' })).ok
        ).toBe(true);
        await bgMerge.flush(30);

        const stMerged = await bgMerge.sendCommand<any>({ type: 'state.get' });
        const localKwIds = stMerged.data.config.rules.keywords.items.map((k: any) => k.id);
        expect(localKwIds).toContain('kw-dev-a');
        expect(localKwIds).toContain('kw-dev-b');
        expect(stMerged.data.config.localBlocklistUids['777']).toBeDefined();
        expect(stMerged.data.config.whitelistUids['888']).toBeDefined();

        const { meta: convergedMeta, payload: convergedPayload } = reconstructSyncedPayload(
          bgMerge.chromeEnv.syncStore
        );
        const remoteKwIds = (convergedPayload.config ?? convergedPayload).rules.keywords.items.map(
          (k: any) => k.id
        );
        expect(remoteKwIds).toContain('kw-dev-a');
        expect(remoteKwIds).toContain('kw-dev-b');
        expect('localBlocklistUids' in (convergedPayload.config ?? convergedPayload)).toBe(false);

        // (4) Echo suppression: re-emitting same meta triggers 0 localSet & 0 syncSet
        const localBefore = bgMerge.chromeEnv.counters.localSetCalls;
        const syncBefore = bgMerge.chromeEnv.counters.syncSetCalls;
        bgMerge.chromeEnv.simulateRemoteSyncWrite({
          kxc_sync_meta_v1: structuredClone(convergedMeta),
        });
        await bgMerge.flush(40);
        expect(bgMerge.chromeEnv.counters.localSetCalls).toBe(localBefore);
        expect(bgMerge.chromeEnv.counters.syncSetCalls).toBe(syncBefore);

        // (5) Positive control: genuine remote write from Device C pulls theme: 'dark' with 0 sync echo pushes
        const remoteUpdate = structuredClone(convergedPayload);
        if (remoteUpdate.config) {
          remoteUpdate.config.theme = 'dark';
        } else {
          remoteUpdate.theme = 'dark';
        }
        const serialized = JSON.stringify(remoteUpdate);
        const newMeta = {
          v: 1,
          chunks: 1,
          sha256: sha256Hex(serialized),
          updatedAt: Date.now() + 5000,
          deviceId: 'device-c-remote',
        };
        const syncCallsBeforePull = bgMerge.chromeEnv.counters.syncSetCalls;
        bgMerge.chromeEnv.simulateRemoteSyncWrite({
          kxc_sync_chunk_0: serialized,
          kxc_sync_meta_v1: newMeta,
        });
        await bgMerge.flush(50);

        const stAfterPull = await bgMerge.sendCommand<any>({ type: 'state.get' });
        expect(stAfterPull.data.config.theme).toBe('dark');
        expect(bgMerge.chromeEnv.counters.syncSetCalls).toBe(syncCallsBeforePull);
      } finally {
        await cleanupBg(bgMerge);
      }
    },
    { timeout: 15000 }
  );

  // -------------------------------------------------------------------------
  // T3-V2-22: F14 stats.byRule × 7-day dailyHistory × seenTweets × Battle Report
  // -------------------------------------------------------------------------
  it(
    'T3-V2-22: F14 stats.byRule × 7-day dailyHistory × seenTweets dedup × Canvas 2D Battle Report PNG',
    async () => {
      const loadHistory = async () => {
        const mod = await requireModule<{ HistoryPage: any }>(
          'apps/extension/src/features/history/HistoryPage.tsx',
          'HistoryPage'
        );
        return mod.HistoryPage;
      };

      let liveStateForMount: Record<string, unknown>;
      const bg = await bootBackgroundHarness();
      try {
        const rulesCycle = [
          'grok_filter',
          'domain_filter',
          'rule_pack',
          'cloud_keyword',
          'reply_spam',
        ] as const;

        // Append logs across 9 relative local calendar days (daysAgo = 8..0)
        for (let offset = 8; offset >= 0; offset--) {
          const ruleId = rulesCycle[(8 - offset) % rulesCycle.length];
          const ts = localTimestampForOffset(offset, 1000);
          expect(
            (
              await bg.sendCommand({
                type: 'logs.append',
                entries: [
                  {
                    id: `t3-log-${offset}`,
                    tweetId: String(930000 + offset),
                    authorUid: offset === 0 ? '99112233445566' : String(9300 + offset),
                    authorScreenName: offset === 0 ? 'secret_canary_t3' : `bot_${offset}`,
                    authorName: offset === 0 ? 'Secret Canary T3' : `Bot ${offset}`,
                    tweetSnippet:
                      offset === 0 ? 'CANARY_DM_T3 private leak' : `Filtered noise day -${offset}`,
                    scene: 'reply',
                    ruleId,
                    reasonText: `Matched ${ruleId}`,
                    timestamp: ts,
                  },
                ],
              })
            ).ok
          ).toBe(true);
        }

        // Also append 2 promoted_ad entries today
        expect(
          (
            await bg.sendCommand({
              type: 'logs.append',
              entries: [
                {
                  id: 't3-ad-1',
                  tweetId: '930101',
                  authorUid: '93101',
                  authorScreenName: 'ad_brand_1',
                  authorName: 'Ad Brand 1',
                  tweetSnippet: 'Promoted 1',
                  scene: 'timeline',
                  ruleId: 'promoted_ad',
                  reasonText: 'Promoted ad',
                  timestamp: localTimestampForOffset(0, 2000),
                },
                {
                  id: 't3-ad-2',
                  tweetId: '930102',
                  authorUid: '93102',
                  authorScreenName: 'ad_brand_2',
                  authorName: 'Ad Brand 2',
                  tweetSnippet: 'Promoted 2',
                  scene: 'timeline',
                  ruleId: 'promoted_ad',
                  reasonText: 'Promoted ad',
                  timestamp: localTimestampForOffset(0, 3000),
                },
              ],
            })
          ).ok
        ).toBe(true);

        // Replay duplicate tweetId '930000' -> must NOT double-count
        expect(
          (
            await bg.sendCommand({
              type: 'logs.append',
              entries: [
                {
                  id: 't3-dup-replay-1',
                  tweetId: '930000',
                  authorUid: '99112233445566',
                  authorScreenName: 'secret_canary_t3',
                  authorName: 'Secret Canary T3',
                  tweetSnippet: 'CANARY_DM_T3 private leak',
                  scene: 'reply',
                  ruleId: 'reply_spam',
                  reasonText: 'Duplicate replay',
                  timestamp: localTimestampForOffset(0, 4000),
                },
              ],
            })
          ).ok
        ).toBe(true);

        const stBeforeClear = await bg.sendCommand<any>({ type: 'state.get' });
        const stats = stBeforeClear.data.stats;
        expect(stats.totalBlocked).toBe(9);
        expect(stats.totalAdsHidden).toBe(2);
        expect(stats.byRule.grok_filter).toBe(2);
        expect(stats.byRule.domain_filter).toBe(2);
        expect(stats.byRule.rule_pack).toBe(2);
        expect(stats.byRule.cloud_keyword).toBe(2);
        expect(stats.byRule.reply_spam).toBe(1);

        const hist = stats.dailyHistory as Array<{ date: string; blocked: number; ads: number }>;
        expect(Array.isArray(hist)).toBe(true);
        expect(hist).toHaveLength(7);
        for (let i = 1; i < hist.length; i++) {
          expect(hist[i].date > hist[i - 1].date).toBe(true);
        }
        expect(hist.some((h) => h.date === formatLocalDateOffset(8))).toBe(false);
        expect(hist.some((h) => h.date === formatLocalDateOffset(7))).toBe(false);
        expect(hist[hist.length - 1]).toEqual({
          date: formatLocalDateOffset(0),
          blocked: 1,
          ads: 2,
        });

        liveStateForMount = structuredClone(stBeforeClear.data);
        (liveStateForMount.config as any).locale = 'en';

        // logs.clear preserves stats AND seenTweets dedup still prevents post-clear double-counting
        expect((await bg.sendCommand({ type: 'logs.clear' })).ok).toBe(true);
        expect(
          (
            await bg.sendCommand({
              type: 'logs.append',
              entries: [
                {
                  id: 't3-dup-replay-post-clear',
                  tweetId: '930000',
                  authorUid: '99112233445566',
                  authorScreenName: 'secret_canary_t3',
                  authorName: 'Secret Canary T3',
                  tweetSnippet: 'CANARY_DM_T3 private leak',
                  scene: 'reply',
                  ruleId: 'reply_spam',
                  reasonText: 'Post-clear replay',
                  timestamp: localTimestampForOffset(0, 5000),
                },
              ],
            })
          ).ok
        ).toBe(true);

        const stAfterClear = await bg.sendCommand<any>({ type: 'state.get' });
        expect(stAfterClear.data.logs).toHaveLength(0);
        expect(stAfterClear.data.stats.totalBlocked).toBe(9);
        expect(stAfterClear.data.stats.byRule.reply_spam).toBe(1);
      } finally {
        await cleanupBg(bg);
      }

      // Part B: Mount HistoryPage and verify light-theme zero-PII Canvas 2D Battle Report PNG
      const mounted = await mountExtensionComponent(loadHistory, liveStateForMount);
      try {
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
        expect(allText).toContain('9');
        expect(allText).not.toContain('NaN');
        expect(allText).not.toContain('secret_canary_t3');
        expect(allText).not.toContain('Secret Canary T3');
        expect(allText).not.toContain('99112233445566');
        expect(allText).not.toContain('CANARY_DM_T3');

        await verifyEmittedPngExport(mounted);
      } finally {
        await mounted.cleanup();
      }
    },
    { timeout: 15000 }
  );

  // -------------------------------------------------------------------------
  // T3-V2-23: F15 parse health × 5×/15s × PII redaction × RPC × auto-recovery
  // -------------------------------------------------------------------------
  it('T3-V2-23: F15 parse health × 5x/15s threshold × PII redaction × health.update/dismiss × auto-recovery', async () => {
    const pi = await bootPageInterceptorHarness({ startTimeMs: 1_700_000_000_000 });
    let bg: BackgroundHarness | undefined;
    try {
      bg = await bootBackgroundHarness();
      // (1) 4 empty HomeTimeline payloads over 21s (< 5 count) -> NO degraded
      for (let i = 0; i < 4; i++) {
        if (i > 0) pi.advanceNow(7000);
        await pi.sendGraphqlFetch(
          GRAPHQL_URLS.forYou,
          buildEmptyCoreGraphqlPayload('HomeTimeline')
        );
      }
      expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(false);

      // (2) 1 valid tweet resets streak; then 5 empty HomeLatestTimeline over 8s (< 15s span) -> NO degraded
      pi.advanceNow(1000);
      await pi.sendGraphqlFetch(
        GRAPHQL_URLS.forYou,
        buildHomeTimelinePayload([
          buildGraphqlTweetEntry({
            tweetId: '23001',
            text: 'Healthy reset tweet.',
            author: { restId: '23101', screenName: 'healthy_u' },
          }),
        ])
      );
      for (let i = 0; i < 5; i++) {
        pi.advanceNow(2000); // span across 5 responses = 8s < 15s
        await pi.sendGraphqlFetch(
          GRAPHQL_URLS.following,
          buildEmptyCoreGraphqlPayload('HomeLatestTimeline')
        );
      }
      expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(false);

      // (3) 6th empty HomeLatestTimeline at +8s (span = 16s >= 15s) with PII canaries -> emits degraded
      pi.advanceNow(8000);
      const dirtyUrl = `${GRAPHQL_URLS.following}?variables=SECRET_UID_T3&ct0=SECRET_CT0_T3`;
      const dirtyPayload = buildEmptyCoreGraphqlPayload('HomeLatestTimeline', {
        home_latest_v2: {
          secretHandle: '@pii_handle_t3',
          cookieVal: 'twid=u%3D999999',
        },
      });
      await pi.sendGraphqlFetch(dirtyUrl, dirtyPayload);

      const degraded = pi.healthEvents.find((e) => e.status === 'degraded');
      expect(degraded).toBeDefined();
      expect(degraded!.consecutiveZeroCount).toBeGreaterThanOrEqual(5);
      expect(degraded!.endpoints).toContain('HomeLatestTimeline');
      expect(degraded!.topKeys.length).toBeGreaterThan(0);

      const serialized = JSON.stringify(degraded);
      expect(serialized).not.toContain('SECRET_UID_T3');
      expect(serialized).not.toContain('SECRET_CT0_T3');
      expect(serialized).not.toContain('pii_handle_t3');
      expect(serialized).not.toContain('twid=u%3D999999');

      // (4) Forward via health.update (field name `report`!) & dismiss
      expect((await bg.sendCommand({ type: 'health.update', report: degraded })).ok).toBe(true);
      const stDeg = await bg.sendCommand<any>({ type: 'state.get' });
      expect(stDeg.data.health.status).toBe('degraded');

      expect((await bg.sendCommand({ type: 'health.dismiss' })).ok).toBe(true);
      const stDismissed = await bg.sendCommand<any>({ type: 'state.get' });
      expect(typeof stDismissed.data.health.dismissedAt).toBe('number');
      expect(stDismissed.data.health.dismissedAt).toBeGreaterThan(0);

      // (5) 1 valid tweet auto-recovers back to 'ok' and clears dismissedAt
      pi.advanceNow(2000);
      await pi.sendGraphqlFetch(
        GRAPHQL_URLS.forYou,
        buildHomeTimelinePayload([
          buildGraphqlTweetEntry({
            tweetId: '23002',
            text: 'Recovered valid timeline tweet.',
            author: { restId: '23102', screenName: 'recovered_u' },
          }),
        ])
      );
      const recovered = pi.healthEvents[pi.healthEvents.length - 1];
      expect(recovered?.status).toBe('ok');
      expect(recovered?.consecutiveZeroCount).toBe(0);

      expect((await bg.sendCommand({ type: 'health.update', report: recovered })).ok).toBe(true);
      const stRec = await bg.sendCommand<any>({ type: 'state.get' });
      expect(stRec.data.health.status).toBe('ok');
      expect(stRec.data.health.consecutiveZeroCount).toBe(0);
      expect(stRec.data.health.dismissedAt).toBeUndefined();
    } finally {
      pi.cleanup();
      if (bg) {
        await cleanupBg(bg);
      }
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-24: F15 parse health × extractedTweetCount under 100% strip & 0-reply
  // -------------------------------------------------------------------------
  it('T3-V2-24: F15 parse health × extractedTweetCount under 100% strip & zero-reply TweetDetail', async () => {
    const cfg = Shared.createDefaultConfig('standard');
    cfg.interceptionMode = 'strip';
    cfg.rules.keywords.items = [
      {
        id: 'kw-strip-24',
        pattern: 'strip_every_tweet',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
    ];

    const allStrippedPayload = buildHomeTimelinePayload([
      buildGraphqlTweetEntry({
        tweetId: '24001',
        text: 'One strip_every_tweet',
        author: { restId: '24101', screenName: 's1' },
      }),
      buildGraphqlTweetEntry({
        tweetId: '24002',
        text: 'Two strip_every_tweet',
        author: { restId: '24102', screenName: 's2' },
      }),
      buildGraphqlTweetEntry({
        tweetId: '24003',
        text: 'Three strip_every_tweet',
        author: { restId: '24103', screenName: 's3' },
      }),
    ]);

    // (1) Direct parser extractedTweetCount checks
    const directStripped = Shared.processGraphqlResponsePayload(
      structuredClone(allStrippedPayload),
      GRAPHQL_URLS.forYou,
      '/home',
      cfg
    ) as any;
    expect(directStripped.extractedTweetCount).toBe(3);
    expect(directStripped.modified).toBe(true);

    const zeroReplyDetail = buildTweetDetailPayload(
      {
        tweetId: '24010',
        text: 'Focal tweet with zero replies.',
        author: { restId: '24110', screenName: 'solo_op' },
      },
      []
    );
    const directDetail = Shared.processGraphqlResponsePayload(
      zeroReplyDetail,
      GRAPHQL_URLS.tweetDetail,
      '/solo_op/status/24010',
      cfg
    ) as any;
    expect(directDetail.extractedTweetCount).toBe(1);

    const directEmpty = Shared.processGraphqlResponsePayload(
      buildEmptyCoreGraphqlPayload('HomeTimeline'),
      GRAPHQL_URLS.forYou,
      '/home',
      cfg
    ) as any;
    expect(directEmpty.extractedTweetCount).toBe(0);

    // (2) Live page-interceptor: 6 consecutive 100%-stripped responses over 24s -> NO degraded
    const pi = await bootPageInterceptorHarness({
      startTimeMs: 1_700_000_000_000,
      config: cfg,
    });
    try {
      for (let i = 0; i < 6; i++) {
        pi.advanceNow(4000);
        await pi.sendGraphqlFetch(GRAPHQL_URLS.forYou, structuredClone(allStrippedPayload));
      }
      expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(false);

      // (3) Positive control: 5 empty payloads over 16s -> degraded; 1 stripped valid payload -> recovers to ok
      for (let i = 0; i < 5; i++) {
        pi.advanceNow(4000);
        await pi.sendGraphqlFetch(
          GRAPHQL_URLS.forYou,
          buildEmptyCoreGraphqlPayload('HomeTimeline')
        );
      }
      expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(true);

      pi.advanceNow(2000);
      await pi.sendGraphqlFetch(GRAPHQL_URLS.forYou, structuredClone(allStrippedPayload));
      expect(pi.healthEvents[pi.healthEvents.length - 1]?.status).toBe('ok');
    } finally {
      pi.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-25: F07 D1 0004 × F16 cloud-rules.ts CLI --dry-run & --file validation
  // -------------------------------------------------------------------------
  it(
    'T3-V2-25: F07 D1 0004 × F16 cloud-rules.ts CLI --dry-run & --file validation',
    async () => {
      const CLOUD_KEYWORD_LANG_GROUPS = requireExport<readonly string[]>(
        sharedMod,
        'CLOUD_KEYWORD_LANG_GROUPS',
        '@keepxclean/shared'
      );
      requireFile('apps/server/scripts/cloud-rules.ts', 'maintainer cloud-rules CLI');

      const rootPkg = JSON.parse(requireFile('package.json')) as {
        scripts?: Record<string, string>;
      };
      expect(typeof rootPkg.scripts?.['cloud-rules:push']).toBe('string');
      expect(typeof rootPkg.scripts?.['cloud-rules:list']).toBe('string');

      const manifest = JSON.parse(
        requireFile('apps/server/cloud-rules.json', 'cloud-rules manifest')
      ) as { version?: number; rules?: Array<Record<string, any>> };
      expect(manifest.version).toBe(1);
      expect(Array.isArray(manifest.rules)).toBe(true);
      const manifestIds = new Set<string>();
      for (const r of manifest.rules!) {
        expect(manifestIds.has(r.id)).toBe(false);
        manifestIds.add(r.id);
        expect(CLOUD_KEYWORD_LANG_GROUPS).toContain(r.langGroup);
        if (r.isRegex) {
          expect(() => new RegExp(r.pattern, 'i')).not.toThrow();
        }
      }

      const baseArgs = parseCliPushBaseArgs(rootPkg.scripts ?? {});
      const dryRunBase = baseArgs.includes('--dry-run') ? baseArgs : [...baseArgs, '--dry-run'];

      // (2) Real manifest --dry-run exits 0
      const mainRes = await runTsxCli('apps/server/scripts/cloud-rules.ts', dryRunBase, {
        timeoutMs: 12_000,
      });
      expect(mainRes.timedOut).toBe(false);
      expect(mainRes.exitCode).toBe(0);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kxc-t3-cli-'));
      const d1 = createSqliteD1Adapter();
      try {
        // (3) Positive control --file valid.json -> exit 0
        const validFp = path.join(tmpDir, 'valid.json');
        fs.writeFileSync(
          validFp,
          JSON.stringify(
            {
              version: 1,
              rules: [
                {
                  id: 't3-valid-probe',
                  pattern: 'valid_t3_token',
                  isRegex: false,
                  scopes: ['text'],
                  langGroup: 'de',
                  note: 'Valid T3 probe',
                  enabled: true,
                },
              ],
            },
            null,
            2
          ),
          'utf8'
        );
        const validRes = await runTsxCli(
          'apps/server/scripts/cloud-rules.ts',
          [...dryRunBase, '--file', validFp],
          { timeoutMs: 12_000 }
        );
        expect(validRes.timedOut).toBe(false);
        expect(validRes.exitCode).toBe(0);

        // 3 negative controls -> non-zero exit with specific validation errors
        const negCases: Array<{ name: string; content: unknown; expectedRe: RegExp }> = [
          {
            name: 'bad-regex.json',
            expectedRe: /(regex|regexp|pattern|syntax|invalid)/i,
            content: {
              version: 1,
              rules: [
                {
                  id: 'bad-rx',
                  pattern: '[unclosed',
                  isRegex: true,
                  scopes: ['text'],
                  langGroup: 'universal',
                  enabled: true,
                },
              ],
            },
          },
          {
            name: 'dup-id.json',
            expectedRe: /(duplicate|dup-t3|unique|already)/i,
            content: {
              version: 1,
              rules: [
                {
                  id: 'dup-t3',
                  pattern: 'aaa',
                  isRegex: false,
                  scopes: ['text'],
                  langGroup: 'en',
                  enabled: true,
                },
                {
                  id: 'dup-t3',
                  pattern: 'bbb',
                  isRegex: false,
                  scopes: ['text'],
                  langGroup: 'en',
                  enabled: true,
                },
              ],
            },
          },
          {
            name: 'bad-lang.json',
            expectedRe: /(langgroup|lang_group|lang|group|\bzz\b|unsupported|invalid)/i,
            content: {
              version: 1,
              rules: [
                {
                  id: 'bad-lang',
                  pattern: 'ccc',
                  isRegex: false,
                  scopes: ['text'],
                  langGroup: 'zz',
                  enabled: true,
                },
              ],
            },
          },
        ];

        for (const nc of negCases) {
          const fp = path.join(tmpDir, nc.name);
          fs.writeFileSync(fp, JSON.stringify(nc.content, null, 2), 'utf8');
          const res = await runTsxCli(
            'apps/server/scripts/cloud-rules.ts',
            [...dryRunBase, '--file', fp],
            { timeoutMs: 12_000 }
          );
          expect(res.timedOut).toBe(false);
          expect(res.exitCode).not.toBe(0);
          const combined = `${res.stderr}\n${res.stdout}`.trim();
          expect(combined.length).toBeGreaterThan(0);
          expect(combined).not.toMatch(/unknown\s+(option|flag)|ENOENT|no such file/i);
          expect(combined).toMatch(nc.expectedRe);
        }

        // (4) Apply D1 0001-0004 & verify hotfix 'de' rule + all 24 legacy IDs flow cleanly through /v1/snapshot.json
        await applyServerMigrations(d1, { requireMigration0004: true });
        const serverMod = await requireModule<{ app: any }>(
          'apps/server/src/index.ts',
          'Cloudflare Worker server'
        );
        const now = Date.now();
        await d1
          .prepare(
            `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, note, enabled, lang_group, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            't3-valid-probe',
            'valid_t3_token',
            0,
            JSON.stringify(['text']),
            'Valid T3 probe',
            1,
            'de',
            now
          )
          .run();

        const snapRes = await serverMod.app.request(
          'https://api.keepxclean.com/v1/snapshot.json?fresh=1',
          { method: 'GET' },
          { DB: d1 }
        );
        expect(snapRes.status).toBe(200);
        const snap = (await snapRes.json()) as any;
        const found = snap.cloudKeywords.find((k: any) => k.id === 't3-valid-probe');
        expect(found).toBeDefined();
        expect(found.langGroup).toBe('de');
        const snapIds = new Set(snap.cloudKeywords.map((k: any) => k.id));
        for (const legacyId of LEGACY_24_CLOUD_KEYWORD_IDS) {
          expect(snapIds.has(legacyId)).toBe(true);
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        d1.close();
      }
    },
    { timeout: 30000 }
  );

  // -------------------------------------------------------------------------
  // T3-V2-26: F16 zero public admin HTTP routes × Server D1 0004 snapshot & stats
  // -------------------------------------------------------------------------
  it('T3-V2-26: F16 zero public admin HTTP routes × Server D1 0004 snapshot & stats', async () => {
    const d1 = createSqliteD1Adapter();
    try {
      await applyServerMigrations(d1, { requireMigration0004: true });
      const serverMod = await requireModule<{ app: any }>(
        'apps/server/src/index.ts',
        'Cloudflare Worker server'
      );

      const adminProbes: Array<{ method: string; path: string }> = [
        { method: 'GET', path: '/admin' },
        { method: 'POST', path: '/admin' },
        { method: 'GET', path: '/v1/admin' },
        { method: 'POST', path: '/v1/admin/cloud-keywords' },
        { method: 'PUT', path: '/v1/admin/cloud-keywords' },
        { method: 'POST', path: '/v1/cloud-keywords' },
        { method: 'DELETE', path: '/v1/cloud-keywords/cloud-nsfw-bio-1' },
      ];
      for (const p of adminProbes) {
        const res = await serverMod.app.request(
          `https://api.keepxclean.com${p.path}`,
          {
            method: p.method,
            ...(p.method !== 'GET'
              ? { body: JSON.stringify({}), headers: { 'content-type': 'application/json' } }
              : {}),
          },
          { DB: d1 }
        );
        expect(res.status).toBe(404);
      }

      // Positive controls on same D1
      const snapRes = await serverMod.app.request(
        'https://api.keepxclean.com/v1/snapshot.json?fresh=1',
        { method: 'GET' },
        { DB: d1 }
      );
      expect(snapRes.status).toBe(200);
      const snap = (await snapRes.json()) as any;
      expect(snap.cloudKeywords.length).toBeGreaterThanOrEqual(24);
      for (const kw of snap.cloudKeywords) {
        expect(typeof kw.langGroup).toBe('string');
        expect(kw.langGroup.length).toBeGreaterThan(0);
      }

      const statsRes = await serverMod.app.request(
        'https://api.keepxclean.com/v1/stats',
        { method: 'GET' },
        { DB: d1 }
      );
      expect(statsRes.status).toBe(200);
      const statsBody = (await statsRes.json()) as any;
      expect(statsBody.ok).toBe(true);

      const reportRes = await serverMod.app.request(
        'https://api.keepxclean.com/v1/blocks/report',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            reporterUidHash: 't3-reporter-hash-0001',
            reporterAccountAgeDays: 100,
            targetUid: '9988776655',
            targetScreenName: 'spam_target_26',
            tag: 'reply_spam',
          }),
        },
        { DB: d1 }
      );
      expect(reportRes.status).toBe(200);
      const reportBody = (await reportRes.json()) as any;
      expect(reportBody.countedPublicly).toBe(true);
    } finally {
      d1.close();
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-27: F17 10-locale parity (shared + extension) × M00.1 manifest perms
  // -------------------------------------------------------------------------
  it('T3-V2-27: F17 10-locale parity (shared + extension) × M00.1 manifest permissions', async () => {
    // (1) Shared: > 24 cloud keywords, non-empty notes across 10 locales, distinct localization
    expect(Shared.DEFAULT_CLOUD_KEYWORDS.length).toBeGreaterThan(24);
    for (const kw of Shared.DEFAULT_CLOUD_KEYWORDS) {
      for (const loc of Shared.SUPPORTED_LOCALES) {
        expect(Shared.hasLocalizedCloudKeywordNote(kw.id, loc)).toBe(true);
        const note = Shared.getCloudKeywordNote(kw, loc);
        expect(typeof note).toBe('string');
        expect(note.trim().length).toBeGreaterThan(0);
        expect(note).not.toBe(kw.pattern);
      }
    }
    const sampleKw = Shared.DEFAULT_CLOUD_KEYWORDS.find((k) => k.id === 'cloud-follow-ja-1');
    expect(sampleKw).toBeDefined();
    expect(Shared.getCloudKeywordNote(sampleKw!, 'zh-CN')).not.toBe(
      Shared.getCloudKeywordNote(sampleKw!, 'en')
    );
    expect(Shared.getCloudKeywordNote(sampleKw!, 'ja')).not.toBe(
      Shared.getCloudKeywordNote(sampleKw!, 'en')
    );

    const enEngineMsgs = Shared.getEngineMessages('en');
    const enEngineKeys = collectAllKeys(enEngineMsgs);
    expect(typeof enEngineMsgs.grokShortMentionReason).toBe('string');
    expect(typeof enEngineMsgs.grokHiddenReplyReason).toBe('string');
    expect(typeof enEngineMsgs.replyDuplicateReason).toBe('string');
    expect(typeof enEngineMsgs.domainFilterReason).toBe('function');
    expect(typeof enEngineMsgs.rulePackKeywordReason).toBe('function');
    expect(typeof enEngineMsgs.rulePackDomainReason).toBe('function');
    expect(typeof enEngineMsgs.rulePackAccountReason).toBe('function');
    for (const loc of Shared.SUPPORTED_LOCALES) {
      const msgs = Shared.getEngineMessages(loc);
      expect(collectAllKeys(msgs)).toEqual(enEngineKeys);
      expect(msgs.grokShortMentionReason.trim().length).toBeGreaterThan(0);
      expect(msgs.grokHiddenReplyReason.trim().length).toBeGreaterThan(0);
      expect(msgs.replyDuplicateReason.trim().length).toBeGreaterThan(0);

      const domainReason = msgs.domainFilterReason(msgs.scopes.url, 't.me');
      expect(domainReason.trim().length).toBeGreaterThan(0);
      expect(domainReason).toContain('t.me');

      const packKwReason = msgs.rulePackKeywordReason('Demo Pack', msgs.scopes.text, 'spam');
      expect(packKwReason.trim().length).toBeGreaterThan(0);
      expect(packKwReason).toContain('Demo Pack');

      const packDomainReason = msgs.rulePackDomainReason('Demo Pack', msgs.scopes.url, 't.me');
      expect(packDomainReason.trim().length).toBeGreaterThan(0);
      expect(packDomainReason).toContain('Demo Pack');

      const packAccountReason = msgs.rulePackAccountReason('Demo Pack');
      expect(packAccountReason.trim().length).toBeGreaterThan(0);
      expect(packAccountReason).toContain('Demo Pack');
    }
    const zhEngineMsgs = Shared.getEngineMessages('zh-CN');
    const jaEngineMsgs = Shared.getEngineMessages('ja');
    expect(zhEngineMsgs.grokShortMentionReason).not.toBe(enEngineMsgs.grokShortMentionReason);
    expect(jaEngineMsgs.grokShortMentionReason).not.toBe(enEngineMsgs.grokShortMentionReason);
    expect(zhEngineMsgs.grokHiddenReplyReason).not.toBe(enEngineMsgs.grokHiddenReplyReason);
    expect(jaEngineMsgs.grokHiddenReplyReason).not.toBe(enEngineMsgs.grokHiddenReplyReason);
    expect(zhEngineMsgs.replyDuplicateReason).not.toBe(enEngineMsgs.replyDuplicateReason);
    expect(jaEngineMsgs.replyDuplicateReason).not.toBe(enEngineMsgs.replyDuplicateReason);
    expect(zhEngineMsgs.domainFilterReason(zhEngineMsgs.scopes.url, 't.me')).not.toBe(
      enEngineMsgs.domainFilterReason(enEngineMsgs.scopes.url, 't.me')
    );
    expect(jaEngineMsgs.domainFilterReason(jaEngineMsgs.scopes.url, 't.me')).not.toBe(
      enEngineMsgs.domainFilterReason(enEngineMsgs.scopes.url, 't.me')
    );
    expect(zhEngineMsgs.rulePackAccountReason('Demo Pack')).not.toBe(
      enEngineMsgs.rulePackAccountReason('Demo Pack')
    );
    expect(jaEngineMsgs.rulePackAccountReason('Demo Pack')).not.toBe(
      enEngineMsgs.rulePackAccountReason('Demo Pack')
    );

    // (2) Extension: LOCALES & ERROR_LOCALES 100% key/type parity + 11 rules.defs + 16 ruleLabels
    const coreMod = await requireModule<{
      LOCALES: Record<string, Record<string, any>>;
      ERROR_LOCALES: Record<string, Record<string, any>>;
    }>('apps/extension/src/i18n/core.ts', 'extension i18n core');

    const enKeys = collectAllKeys(coreMod.LOCALES.en);
    const enErrKeys = collectAllKeys(coreMod.ERROR_LOCALES.en);
    const expected11RuleDefs = [
      'replySpam',
      'engagementBait',
      'highFrequency',
      'crowdBlock',
      'keywords',
      'tagSpam',
      'accountQuality',
      'languageFilter',
      'hidePromotedAds',
      'grokFilter',
      'domainFilter',
    ];
    const expected16RuleLabels = [
      'local_blocklist',
      'reply_spam',
      'engagement_bait',
      'high_frequency_daily',
      'high_frequency_window',
      'crowd_block',
      'keyword',
      'cloud_keyword',
      'tag_spam',
      'account_quality',
      'language_filter',
      'promoted_ad',
      'impersonation',
      'grok_filter',
      'domain_filter',
      'rule_pack',
    ];

    for (const loc of Shared.SUPPORTED_LOCALES) {
      const dict = coreMod.LOCALES[loc];
      const errDict = coreMod.ERROR_LOCALES[loc];
      expect(dict).toBeDefined();
      expect(errDict).toBeDefined();
      expect(collectAllKeys(dict)).toEqual(enKeys);
      expect(collectAllKeys(errDict)).toEqual(enErrKeys);

      for (const defKey of expected11RuleDefs) {
        expect(dict.rules?.defs?.[defKey]).toBeDefined();
      }
      for (const lblKey of expected16RuleLabels) {
        expect(typeof dict.history?.ruleLabels?.[lblKey]).toBe('string');
        expect(dict.history.ruleLabels[lblKey].trim().length).toBeGreaterThan(0);
      }
    }
    expect(coreMod.LOCALES['zh-CN'].history.ruleLabels.grok_filter).not.toBe(
      coreMod.LOCALES.en.history.ruleLabels.grok_filter
    );
    expect(coreMod.LOCALES.ja.history.ruleLabels.grok_filter).not.toBe(
      coreMod.LOCALES.en.history.ruleLabels.grok_filter
    );

    // (3) Manifest permissions & version 0.2.0
    const wxtSrc = requireFile('apps/extension/wxt.config.ts');
    const permMatch = wxtSrc.match(/permissions\s*:\s*\[([^\]]*)\]/);
    expect(permMatch).not.toBeNull();
    const perms = [...permMatch![1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
    expect(perms).toEqual(['alarms', 'storage']);
    expect(wxtSrc).not.toMatch(/clipboardWrite|['"]tabs['"]|['"]scripting['"]/);
    expect(wxtSrc).toContain('keepxclean@keepxclean.com');

    const extPkg = JSON.parse(requireFile('apps/extension/package.json')) as { version?: string };
    expect(extPkg.version).toBe('0.2.0');

    for (const builtRel of [
      'apps/extension/.output/chrome-mv3/manifest.json',
      'apps/extension/.output/firefox-mv3/manifest.json',
    ]) {
      if (fileExists(builtRel)) {
        const mf = JSON.parse(requireFile(builtRel)) as {
          version?: string;
          permissions?: string[];
        };
        expect(mf.version).toBe('0.2.0');
        expect([...(mf.permissions ?? [])].sort()).toEqual(['alarms', 'storage']);
      }
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-28: F18 × F19 × M00.4 Web v0.2.0 versions, 10 locales, privacy & brand
  // -------------------------------------------------------------------------
  it('T3-V2-28: F18 × F19 × M00.4 Web v0.2.0 versions, 10 locales, 5-row privacyContent & brand compliance', async () => {
    // (1) All 5 workspace package.json files === '0.2.0' + web CURRENT_VERSION === 'v0.2.0'
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
    const webCfg = await requireModule<{ CURRENT_VERSION?: string }>(
      'apps/web/src/config.ts',
      'web config'
    );
    expect(webCfg.CURRENT_VERSION).toBe('v0.2.0');

    // (2) 10 web locales key parity + 0.2.0 markers + 0 stale 0.1.2 + distinct localization
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
      expect(String(dict.install?.readyStatus ?? '')).toContain('0.2.0');
      expect(String(dict.footer?.releaseZip ?? '')).toContain('0.2.0');

      const src = requireFile(`apps/web/src/locales/${loc}.ts`);
      expect(src).not.toMatch(/(?:^|[^0-9.])0\.1\.2(?![0-9])/);
    }
    expect(webLocales.getDictionary('zh-CN').hero.headline).not.toBe(enDict.hero.headline);
    expect(webLocales.getDictionary('ja').hero.headline).not.toBe(enDict.hero.headline);

    // (3) 5-row privacyContent.ts disclosing storage.sync (with local blocklist retention) & parse health
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

    // (4) Brand compliance (AGENTS.md)
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
    const logoVal = validateBrandLogoSvg(requireFile('apps/web/public/logo.svg'));
    expect(logoVal.valid).toBe(true);
    expect(logoVal.width).toBe(512);
    expect(logoVal.height).toBe(512);

    const tokensVal = validateBrandTokens(requireFile('apps/web/src/styles/tokens.css'));
    expect(tokensVal.valid).toBe(true);
  });

  // -------------------------------------------------------------------------
  // T3-V2-29: F18 HeroSandbox v0.2.0 dynamic categories × presets × scenes
  // -------------------------------------------------------------------------
  it('T3-V2-29: F18 HeroSandbox v0.2.0 dynamic categories × presets × scenes', async () => {
    const sampleDataSrc = requireFile('apps/web/src/components/HeroSandbox/sampleData.ts');
    const sandboxTsxSrc = requireFile('apps/web/src/components/HeroSandbox/HeroSandbox.tsx');
    const typesSrc = requireFile('apps/web/src/components/HeroSandbox/types.ts');
    const combinedSrc = `${sampleDataSrc}\n${sandboxTsxSrc}\n${typesSrc}`;

    const { getSandboxData } = await requireModule<{ getSandboxData: (loc: string) => any }>(
      'apps/web/src/components/HeroSandbox/sampleData.ts',
      'HeroSandbox sampleData'
    );
    const { isTweetIntercepted, PRESET_WEIGHT } = await requireModule<{
      isTweetIntercepted: (tweet: any, state: any) => boolean;
      PRESET_WEIGHT: Record<string, number>;
    }>('apps/web/src/components/HeroSandbox/types.ts', 'HeroSandbox types');

    const enData = getSandboxData('en');
    const zhData = getSandboxData('zh-CN');
    const twData = getSandboxData('zh-TW');

    // Verify genuine v0.2.0 HeroSandbox upgrades exist (supports literal or CURRENT_VERSION interpolation)
    expect(enData.originalPost.content).toContain('v0.2.0');
    expect(zhData.originalPost.content).toContain('v0.2.0');
    expect(/grok/i.test(combinedSrc)).toBe(true);
    expect(/(duplicate|复读|重复|dup)/i.test(combinedSrc)).toBe(true);
    expect(/(for[_\s-]?you|following|推荐|关注)/i.test(combinedSrc)).toBe(true);

    const enCategories = enData.replies
      .filter((r: any) => Boolean(r.filterReason))
      .map((r: any) => r.filterReason.category);
    const zhCategories = zhData.replies
      .filter((r: any) => Boolean(r.filterReason))
      .map((r: any) => r.filterReason.category);
    const twCategories = twData.replies
      .filter((r: any) => Boolean(r.filterReason))
      .map((r: any) => r.filterReason.category);
    expect(zhCategories).toEqual(enCategories);
    expect(twCategories).toEqual(enCategories);

    for (const dataset of [enData, zhData]) {
      const allCategories: Record<string, boolean> = {};
      for (const r of dataset.replies) {
        if (r.filterReason?.category) {
          allCategories[r.filterReason.category] = true;
        }
      }
      expect(Object.keys(allCategories).length).toBeGreaterThanOrEqual(5);

      const makeState = (preset: 'mild' | 'standard' | 'extreme', masterEnabled = true) => ({
        masterEnabled,
        preset,
        displayMode: 'folded' as const,
        categories: { ...allCategories },
        manuallyBlockedIds: new Set<string>(),
        restoredTweetIds: new Set<string>(),
        whitelistedHandles: new Set<string>(),
      });

      const counts: Record<string, number> = {};
      for (const preset of ['mild', 'standard', 'extreme'] as const) {
        const st = makeState(preset, true);
        const actual = dataset.replies.filter((r: any) => isTweetIntercepted(r, st)).length;
        const expected = dataset.replies.filter(
          (r: any) =>
            !r.isOriginalPost &&
            Boolean(r.filterReason) &&
            PRESET_WEIGHT[preset] >= PRESET_WEIGHT[r.filterReason.presetLevel]
        ).length;
        expect(actual).toBe(expected);
        counts[preset] = actual;
      }
      expect(counts.mild).toBeLessThanOrEqual(counts.standard);
      expect(counts.standard).toBeLessThanOrEqual(counts.extreme);
      expect(counts.extreme).toBeGreaterThanOrEqual(5);

      // Master toggle OFF allows all auto-noise while keeping manuallyBlockedIds active
      const clean = dataset.replies.find((r: any) => !r.filterReason && !r.isOriginalPost)!;
      const noise = dataset.replies.find(
        (r: any) => Boolean(r.filterReason) && r.filterReason.presetLevel !== 'extreme'
      )!;
      const offState = makeState('extreme', false);
      offState.manuallyBlockedIds.add(clean.id);
      expect(isTweetIntercepted(noise, offState)).toBe(false);
      expect(isTweetIntercepted(clean, offState)).toBe(true);

      // whitelistedHandles & restoredTweetIds override automatic interception
      expect(typeof noise.author?.handle).toBe('string');
      expect(noise.author.handle.length).toBeGreaterThan(0);
      const wlState = makeState('extreme', true);
      wlState.whitelistedHandles.add(noise.author.handle);
      expect(isTweetIntercepted(noise, wlState)).toBe(false);

      const restoredState = makeState('extreme', true);
      restoredState.restoredTweetIds.add(noise.id);
      expect(isTweetIntercepted(noise, restoredState)).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // T3-V2-30: F01 × F04 × F05 × F12 exact rule precedence peeling & <1ms budget
  // -------------------------------------------------------------------------
  it('T3-V2-30: F01 × F04 × F05 × F12 exact engine rule precedence peeling & <1ms CPU budget', () => {
    const ThreadDuplicateTracker = requireExport<new () => any>(
      sharedMod,
      'ThreadDuplicateTracker',
      '@keepxclean/shared'
    );
    const normalizeReplyForDedup = requireExport<
      (raw: string) => { normalized: string; weightedLength: number }
    >(sharedMod, 'normalizeReplyForDedup', '@keepxclean/shared');

    // Text '@grok checkthisnow12' has weightedLength=14 (inside [12, 16] overlap!)
    expect(normalizeReplyForDedup('@grok checkthisnow12').weightedLength).toBe(14);

    const tracker = new ThreadDuplicateTracker();
    const cfg = Shared.createDefaultConfig('strict') as any;
    cfg.locale = 'en';
    cfg.interceptionMode = 'collapse';
    cfg.sceneModes = { reply: 'bypass' };
    cfg.whitelistUids = {
      '300222': { uid: '300222', screenName: 'prio_actor', addedAt: 1_700_000_000_000 },
    };
    cfg.localBlocklistUids = {
      '300222': { uid: '300222', screenName: 'prio_actor', addedAt: 1_700_000_000_000 },
    };
    cfg.rules.hidePromotedAds.enabled = true;
    cfg.rules.highFrequency.enabled = false;
    cfg.rules.engagementBait.enabled = false;
    cfg.rules.tagSpam.enabled = false;
    cfg.rules.accountQuality.enabled = false;
    cfg.rules.languageFilter.enabled = false;
    cfg.rules.keywords = {
      enabled: true,
      items: [
        {
          id: 'kw-prio',
          pattern: 'checkthisnow12',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        },
      ],
    };
    cfg.rules.domainFilter = {
      enabled: true,
      items: [{ id: 'dom-prio', domain: 'scam-prio.example', enabled: true }],
    };
    cfg.installedPacks = [
      {
        ...createValidKxcPackV1({
          id: 'pack-prio',
          keywords: [
            {
              id: 'pk-prio-kw',
              pattern: 'pack_prio_bio_tok',
              isRegex: false,
              scopes: ['bio'],
              enabled: true,
            },
          ],
          domains: [{ id: 'pk-prio-dom', domain: 'pack-prio.example', enabled: true }],
          blockedUids: [],
        }),
        enabled: true,
        installedAt: 1_700_000_000_000,
      },
    ];
    cfg.enableCloudKeywords = true;
    cfg.rules.grokFilter = {
      enabled: true,
      protectOfficialGrok: true,
      blockShortMentions: true,
      maxMentionWeightedLength: 16,
      hideGrokReplies: false,
    };
    cfg.rules.replySpam = {
      ...cfg.rules.replySpam,
      enabled: true,
      blockDuplicateReplies: true,
      blockBioLinkSpam: false,
      blockPureMediaReplies: false,
      blockShortOrEmoji: false,
      blockImpersonation: false,
    };

    // Pre-seed ThreadDuplicateTracker with 1st reply from another author ('300111')
    const seedReply = makeExtractedTweet({
      tweetId: '30001',
      text: '@grok checkthisnow12',
      scene: 'reply',
      isReply: true,
      focalTweetId: '30000',
      inReplyToTweetId: '30000',
      author: makeExtractedAuthor({ restId: '300111', screenName: 'first_replier', followersCount: 6000 }),
    });
    const seedCfg = Shared.createDefaultConfig('standard') as any;
    seedCfg.rules.grokFilter.blockShortMentions = false;
    expect(Shared.evaluateTweet(seedReply, seedCfg, null, undefined, true, tracker).blocked).toBe(
      false
    );

    const multiHitTweet = makeExtractedTweet({
      tweetId: '30002',
      text: '@grok checkthisnow12',
      urls: ['https://sub.scam-prio.example/go', 'https://pack-prio.example/go'],
      scene: 'reply',
      isReply: true,
      isPromoted: true,
      focalTweetId: '30000',
      inReplyToTweetId: '30000',
      author: makeExtractedAuthor({
        restId: '300222',
        screenName: 'prio_actor',
        followersCount: 6000,
        bio: 'pack_prio_bio_tok onlyfans.com/prio',
      }),
    });

    // (1) promoted_ad beats whitelist + blocklist + bypass
    const step1 = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker) as any;
    expect(step1.blocked).toBe(true);
    expect(step1.ruleId).toBe('promoted_ad');
    expect(step1.action).toBe('strip');

    // (2) Remove isPromoted -> whitelist beats blocklist + bypass + all rules
    multiHitTweet.isPromoted = false;
    const step2 = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker);
    expect(step2.blocked).toBe(false);
    expect(step2.action).toBe('allow');

    // (3) Remove whitelist -> local_blocklist beats sceneModes.bypass
    cfg.whitelistUids = {};
    const step3 = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker);
    expect(step3.blocked).toBe(true);
    expect(step3.ruleId).toBe('local_blocklist');

    // (4) Remove localBlocklistUids -> sceneModes.bypass skips all auto rules
    cfg.localBlocklistUids = {};
    const step4 = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker);
    expect(step4.blocked).toBe(false);
    expect(step4.action).toBe('allow');

    // (5) sceneModes.reply = 'inherit' -> custom keyword wins
    cfg.sceneModes = { reply: 'inherit' };
    const step5 = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker) as any;
    expect(step5.blocked).toBe(true);
    expect(step5.ruleId).toBe('keyword');
    expect(step5.matchedTarget).toEqual({ kind: 'keyword', id: 'kw-prio' });

    // (6) Disable custom keyword -> domain_filter wins
    cfg.rules.keywords.items[0].enabled = false;
    const step6 = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker) as any;
    expect(step6.blocked).toBe(true);
    expect(step6.ruleId).toBe('domain_filter');
    expect(step6.matchedTarget).toEqual({ kind: 'domain', id: 'dom-prio' });

    // (7) Disable domainFilter -> rule_pack wins (domains -> keywords inside pack)
    cfg.rules.domainFilter.enabled = false;
    const step7a = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker) as any;
    expect(step7a.blocked).toBe(true);
    expect(step7a.ruleId).toBe('rule_pack');
    expect(step7a.matchedTarget).toEqual({
      kind: 'pack_item',
      id: 'pk-prio-dom',
      packId: 'pack-prio',
    });

    cfg.installedPacks[0].disabledItemIds = ['pk-prio-dom'];
    const step7b = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker) as any;
    expect(step7b.blocked).toBe(true);
    expect(step7b.ruleId).toBe('rule_pack');
    expect(step7b.matchedTarget).toEqual({
      kind: 'pack_item',
      id: 'pk-prio-kw',
      packId: 'pack-prio',
    });

    // (8) Disable pack -> cloud_keyword wins
    cfg.installedPacks[0].enabled = false;
    const step8 = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker) as any;
    expect(step8.blocked).toBe(true);
    expect(step8.ruleId).toBe('cloud_keyword');
    expect(step8.matchedTarget).toEqual({ kind: 'cloud_keyword', id: 'cloud-nsfw-bio-1' });

    // (9) Disable cloud keywords -> grok_filter (blockShortMentions) wins over reply_spam
    cfg.enableCloudKeywords = false;
    const step9 = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker) as any;
    expect(step9.blocked).toBe(true);
    expect(step9.ruleId).toBe('grok_filter');
    expect(step9.matchedTarget).toEqual({ kind: 'rule', id: 'grokFilter' });

    // (10) Disable blockShortMentions -> reply_spam (blockDuplicateReplies) wins
    cfg.rules.grokFilter.blockShortMentions = false;
    const step10 = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker) as any;
    expect(step10.blocked).toBe(true);
    expect(step10.ruleId).toBe('reply_spam');
    expect(step10.matchedTarget).toEqual({ kind: 'rule', id: 'replySpam' });

    // (11) Disable blockDuplicateReplies -> allow
    cfg.rules.replySpam.blockDuplicateReplies = false;
    const step11 = Shared.evaluateTweet(multiHitTweet, cfg, null, undefined, false, tracker);
    expect(step11.blocked).toBe(false);
    expect(step11.action).toBe('allow');

    // Rule G0 sub-assertion: Official @grok reply with hideGrokReplies=true beats custom keyword
    const g0Cfg = Shared.createDefaultConfig('standard') as any;
    g0Cfg.rules.grokFilter.hideGrokReplies = true;
    g0Cfg.rules.keywords.items = [
      { id: 'kw-g0', pattern: 'grok_g0_keyword', isRegex: false, scopes: ['text'], enabled: true },
    ];
    const g0Dec = Shared.evaluateTweet(
      makeExtractedTweet({
        tweetId: '30009',
        text: 'Official explanation containing grok_g0_keyword.',
        scene: 'reply',
        isReply: true,
        focalTweetId: '30000',
        inReplyToTweetId: '30000',
        author: makeOfficialGrokAuthor({ dailyTweetRate: 2, statusesCount: 730 }),
      }),
      g0Cfg
    ) as any;
    expect(g0Dec.blocked).toBe(true);
    expect(g0Dec.ruleId).toBe('grok_filter');

    // M00.2 CPU budget: 500 full evaluations with ALL rules + 45 cloud keywords + domain + pack + dupTracker < 1.0ms/tweet
    const benchCfg = Shared.createDefaultConfig('strict') as any;
    benchCfg.locale = 'zh-CN';
    benchCfg.enabledCloudLangGroups = [...(Shared as any).CLOUD_KEYWORD_LANG_GROUPS];
    benchCfg.rules.domainFilter = {
      enabled: true,
      items: [
        { id: 'b-dom-1', domain: 'pump.fun', enabled: true },
        { id: 'b-dom-2', domain: 't.me', enabled: true },
      ],
    };
    benchCfg.installedPacks = [
      {
        ...createValidKxcPackV1({ id: 'bench-pack' }),
        enabled: true,
        installedAt: 1_700_000_000_000,
      },
    ];
    const benchTracker = new ThreadDuplicateTracker();
    const benchTweet = makeExtractedTweet({
      tweetId: '30999',
      text: 'Normal engineering thread analyzing deterministic parser latency and memory footprints across MV3 builds.',
      urls: ['https://docs.example.org/architecture/mv3'],
      scene: 'reply',
      isReply: true,
      focalTweetId: '30900',
      inReplyToTweetId: '30900',
      author: makeExtractedAuthor({
        restId: '309999',
        screenName: 'perf_engineer',
        followersCount: 6500,
        bio: 'Systems engineer writing about compilers and web performance.',
      }),
    });

    // Warm up JIT (20 evals)
    for (let i = 0; i < 20; i++) {
      Shared.evaluateTweet(benchTweet, benchCfg, null, undefined, false, benchTracker);
    }

    const t0 = performance.now();
    for (let i = 0; i < 500; i++) {
      const d = Shared.evaluateTweet(benchTweet, benchCfg, null, undefined, false, benchTracker);
      expect(d.blocked).toBe(false);
    }
    const avgMs = (performance.now() - t0) / 500;
    expect(avgMs).toBeLessThan(1.0);
  });
});
