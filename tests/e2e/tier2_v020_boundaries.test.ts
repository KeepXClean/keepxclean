/**
 * Tier 2 (v0.2.0): Boundary, Corner & Negative Cases E2E Test Suite (M01 – M12)
 *
 * 72 genuine, opaque-box, requirement-driven boundary & negative tests (>= 5 per M01–M12)
 * derived strictly from ORIGINAL_REQUEST.md, PROJECT.md, TEST_INFRA.md, v0.2.0_plan.md,
 * and AGENTS.md.
 *
 * Every negative assertion on a v0.2.0 feature is paired with a positive control or
 * lazy contract check (`requireExport`/`requireModule`/`requireFile`) so ZERO tests can
 * ever pass vacuously when a feature is unimplemented.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as Shared from '@keepxclean/shared';
import { describe, it, expect, setTestTier } from './harness';
import { validateBrandLogoSvg } from './fixtures/browser-env';
import {
  REPO_ROOT,
  GRAPHQL_URLS,
  CHROME_SYNC_QUOTA_BYTES_PER_ITEM,
  PNG_MAGIC_BYTES,
  LEGACY_24_CLOUD_KEYWORD_IDS,
  requireExport,
  requireModule,
  requireFile,
  computeChromeStorageItemBytes,
  makeExtractedAuthor,
  makeExtractedTweet,
  makeOfficialGrokAuthor,
  makeLookalikeGrokAuthor,
  buildGraphqlTweetEntry,
  buildHomeTimelinePayload,
  buildEmptyCoreGraphqlPayload,
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
  validateVersionTestFileNoStale012,
} from './fixtures/v020-helpers';

setTestTier(2);

const sharedMod = Shared as unknown as Record<string, unknown>;

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

function parseCliPushBaseArgs(pkgScripts: Record<string, string>): string[] {
  const raw = pkgScripts['cloud-rules:push'] ?? '';
  const idx = raw.indexOf('cloud-rules.ts');
  if (idx === -1) return [];
  const tail = raw.slice(idx + 'cloud-rules.ts'.length).trim();
  return tail ? tail.split(/\s+/).filter(Boolean) : [];
}

function reconstructSyncedPayload(
  syncStore: Record<string, unknown>
): { meta: Record<string, any>; payload: Record<string, any> } {
  const meta = syncStore['kxc_sync_meta_v1'] as Record<string, any> | undefined;
  expect(meta).toBeDefined();
  let joined = '';
  for (let i = 0; i < meta!.chunks; i++) {
    joined += String(syncStore[`kxc_sync_chunk_${i}`]);
  }
  return { meta: meta!, payload: JSON.parse(joined) as Record<string, any> };
}

function formatLocalDateOffset(daysAgo: number): string {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const d = new Date(noon.getTime() - daysAgo * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  for (const m of s.matchAll(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/g)) {
    luminances.push(0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]));
  }
  for (const m of s.matchAll(/hsla?\([^,]+,[^,]+,\s*(\d+(?:\.\d+)?)%/g)) {
    luminances.push((Number(m[1]) / 100) * 255);
  }
  if (/\bwhite\b/.test(s)) luminances.push(255);
  if (/\bblack\b/.test(s)) luminances.push(0);

  return luminances.length > 0 && luminances.every((l) => l >= 200);
}

function makeHistoryUiState(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const config = {
    ...(Shared.createDefaultConfig('standard') as unknown as Record<string, unknown>),
    locale: 'en',
    theme: 'light',
  };
  return {
    config,
    snapshot: Shared.createDefaultCrowdSnapshot(),
    stats: {
      todayDate: formatLocalDateOffset(0),
      todayBlocked: 15,
      totalBlocked: 88,
      todayAdsHidden: 2,
      totalAdsHidden: 12,
      byRule: { reply_spam: 40, grok_filter: 28, domain_filter: 20 },
      dailyHistory: [
        { date: formatLocalDateOffset(6), blocked: 10, ads: 1 },
        { date: formatLocalDateOffset(5), blocked: 12, ads: 2 },
        { date: formatLocalDateOffset(4), blocked: 8, ads: 1 },
        { date: formatLocalDateOffset(3), blocked: 14, ads: 2 },
        { date: formatLocalDateOffset(2), blocked: 11, ads: 2 },
        { date: formatLocalDateOffset(1), blocked: 18, ads: 2 },
        { date: formatLocalDateOffset(0), blocked: 15, ads: 2 },
      ],
    },
    sync: { status: 'idle', source: 'builtin' },
    logs: [],
    operations: [],
    imports: [],
    ...overrides,
  };
}

describe('Tier 2 (v0.2.0): Boundary, Corner & Negative Cases (M01 – M12)', () => {
  // =========================================================================
  // M01: Grok Filter Boundaries — 6 Tests
  // =========================================================================
  describe('M01: Grok Filter Boundaries', () => {
    it('T2-V2-M01-01: Exact maxMentionWeightedLength boundary 16 blocked vs 17 allowed (Latin and CJK)', () => {
      const config = Shared.createDefaultConfig('strict') as any;
      expect(config.rules.grokFilter?.maxMentionWeightedLength).toBe(16);

      const mkReply = (tweetId: string, text: string) =>
        makeExtractedTweet({
          tweetId,
          text,
          scene: 'reply',
          isReply: true,
          inReplyToTweetId: '9000',
          focalTweetId: '9000',
          focalAuthor: { restId: '90001', screenName: 'op_user', name: 'OP' },
          author: makeExtractedAuthor({ restId: '30001', screenName: 'stranger_a' }),
        });

      // Latin: 'explain this thing' -> 7+4+5 = 16 (blocked); 'explain this things' -> 17 (allowed)
      const latin16 = Shared.evaluateTweet(mkReply('m1-l16', '@grok explain this thing'), config);
      expect(latin16.blocked).toBe(true);
      expect(latin16.ruleId).toBe('grok_filter');

      const latin17 = Shared.evaluateTweet(mkReply('m1-l17', '@grok explain this things'), config);
      expect(latin17.blocked).toBe(false);

      // CJK: 8 Han chars = 16 weighted (blocked); 9 Han chars = 18 weighted (allowed)
      const cjk16 = Shared.evaluateTweet(mkReply('m1-c16', '@grok 请帮我解释一下吧'), config);
      expect(cjk16.blocked).toBe(true);
      expect(cjk16.ruleId).toBe('grok_filter');

      const cjk18 = Shared.evaluateTweet(mkReply('m1-c18', '@grok 请帮我详细解释一下'), config);
      expect(cjk18.blocked).toBe(false);
    });

    it('T2-V2-M01-02: Lookalike @grok accounts are NOT protected by protectOfficialGrok and remain blocked', () => {
      const isOfficialGrokAuthor = requireExport<(a: any) => boolean>(
        sharedMod,
        'isOfficialGrokAuthor',
        '@keepxclean/shared'
      );
      const config = Shared.createDefaultConfig('standard') as any;
      expect(config.rules.grokFilter?.protectOfficialGrok).toBe(true);

      const lookalikes = [
        makeLookalikeGrokAuthor({ restId: '9998887771', screenName: 'grok_official' }),
        makeLookalikeGrokAuthor({ restId: '9998887772', screenName: 'grok_ai' }),
        makeLookalikeGrokAuthor({ restId: '9998887773', screenName: 'realgrok' }),
      ];

      for (const fake of lookalikes) {
        expect(isOfficialGrokAuthor(fake)).toBe(false);
        const dec = Shared.evaluateTweet(
          makeExtractedTweet({
            tweetId: `fake-${fake.restId}`,
            text: 'Automated response posted at extremely high frequency.',
            scene: 'timeline',
            author: fake,
          }),
          config
        );
        expect(dec.blocked).toBe(true);
        expect(dec.ruleId).toBe('high_frequency_daily');
      }
    });

    it('T2-V2-M01-03: blockShortMentions exempts focal OP, followed accounts, whitelisted accounts, and @grok itself', () => {
      const config = Shared.createDefaultConfig('strict') as any;
      expect(config.rules.grokFilter?.blockShortMentions).toBe(true);
      config.exemptFollowing = true;
      config.whitelistUids = {
        '40003': { uid: '40003', screenName: 'vip_replier', addedAt: 1_700_000_000_000 },
      };
      const focalAuthor = { restId: '40001', screenName: 'thread_op', name: 'OP' };

      // Positive control: stranger IS blocked
      const stranger = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm1-03-str',
          text: '@grok explain this',
          scene: 'reply',
          isReply: true,
          focalTweetId: '9100',
          focalAuthor,
          author: makeExtractedAuthor({ restId: '40099', screenName: 'stranger_99' }),
        }),
        config
      );
      expect(stranger.blocked).toBe(true);
      expect(stranger.ruleId).toBe('grok_filter');

      // 1. Focal OP exempt
      const opDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm1-03-op',
          text: '@grok explain this',
          scene: 'reply',
          isReply: true,
          focalTweetId: '9100',
          focalAuthor,
          author: makeExtractedAuthor({ restId: '40001', screenName: 'thread_op' }),
        }),
        config
      );
      expect(opDec.blocked).toBe(false);

      // 2. Followed author exempt
      const followedDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm1-03-fol',
          text: '@grok explain this',
          scene: 'reply',
          isReply: true,
          focalTweetId: '9100',
          focalAuthor,
          author: makeExtractedAuthor({
            restId: '40002',
            screenName: 'followed_friend',
            following: true,
          }),
        }),
        config
      );
      expect(followedDec.blocked).toBe(false);

      // 3. Whitelisted author exempt
      const whiteDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm1-03-wl',
          text: '@grok explain this',
          scene: 'reply',
          isReply: true,
          focalTweetId: '9100',
          focalAuthor,
          author: makeExtractedAuthor({ restId: '40003', screenName: 'vip_replier' }),
        }),
        config
      );
      expect(whiteDec.blocked).toBe(false);

      // 4. Official @grok itself exempt
      const grokSelfDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm1-03-grok',
          text: '@grok explain this',
          scene: 'reply',
          isReply: true,
          focalTweetId: '9100',
          focalAuthor,
          author: makeOfficialGrokAuthor(),
        }),
        config
      );
      expect(grokSelfDec.blocked).toBe(false);
    });

    it('T2-V2-M01-04: blockShortMentions is strictly reply-only and allows non-reply timeline @grok mentions', () => {
      const config = Shared.createDefaultConfig('strict') as any;
      expect(config.rules.grokFilter?.blockShortMentions).toBe(true);

      // Positive control: reply IS blocked
      const replyDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm1-04-rep',
          text: '@grok explain this',
          scene: 'reply',
          isReply: true,
          author: makeExtractedAuthor({ restId: '41001', screenName: 'user_41' }),
        }),
        config
      );
      expect(replyDec.blocked).toBe(true);
      expect(replyDec.ruleId).toBe('grok_filter');

      // Timeline non-reply is allowed
      const timelineDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm1-04-tl',
          text: '@grok explain this',
          scene: 'timeline',
          isReply: false,
          author: makeExtractedAuthor({ restId: '41001', screenName: 'user_41' }),
        }),
        config
      );
      expect(timelineDec.blocked).toBe(false);
    });

    it('T2-V2-M01-05: hideGrokReplies respects whitelistUids, profile badge_only, reply bypass, and grokFilter.enabled=false', () => {
      const baseCfg = Shared.createDefaultConfig('standard') as any;
      expect(baseCfg.rules.grokFilter).toBeDefined();
      baseCfg.rules.grokFilter.hideGrokReplies = true;

      const grok = makeOfficialGrokAuthor({ dailyTweetRate: 2, statusesCount: 730 });
      const mkGrokTweet = (overrides: Record<string, unknown> = {}) =>
        makeExtractedTweet({
          tweetId: 'm1-05-tw',
          text: 'A thorough factual explanation written by Grok.',
          scene: 'reply',
          isReply: true,
          author: grok,
          ...overrides,
        });

      // Positive control: unexempt @grok reply blocked
      const unexempt = Shared.evaluateTweet(mkGrokTweet(), baseCfg);
      expect(unexempt.blocked).toBe(true);
      expect(unexempt.ruleId).toBe('grok_filter');

      // 1. Whitelist overrides hideGrokReplies
      const wlCfg = structuredClone(baseCfg);
      wlCfg.whitelistUids = {
        [grok.restId]: { uid: grok.restId, screenName: 'grok', addedAt: 1_700_000_000_000 },
      };
      expect(Shared.evaluateTweet(mkGrokTweet(), wlCfg).blocked).toBe(false);

      // 2. Profile scene with profileSceneBadgeOnly -> badge_only (not stripped/collapsed)
      const profDec = Shared.evaluateTweet(
        mkGrokTweet({ scene: 'profile', isReply: true }),
        baseCfg
      );
      expect(profDec.action).toBe('badge_only');
      expect(profDec.action).not.toBe('strip');
      expect(profDec.action).not.toBe('collapse');

      // 3. sceneModes reply bypass -> allow
      const bypassCfg = structuredClone(baseCfg);
      bypassCfg.sceneModes = { reply: 'bypass' };
      expect(Shared.evaluateTweet(mkGrokTweet(), bypassCfg).blocked).toBe(false);

      // 4. grokFilter.enabled = false -> allow
      const offCfg = structuredClone(baseCfg);
      offCfg.rules.grokFilter.enabled = false;
      expect(Shared.evaluateTweet(mkGrokTweet(), offCfg).blocked).toBe(false);
    });

    it('T2-V2-M01-06: False-positive boundary: @grokfan and help@grok.com do NOT trigger grok_filter', () => {
      const config = Shared.createDefaultConfig('strict') as any;
      expect(config.rules.grokFilter?.blockShortMentions).toBe(true);

      const mkReply = (tweetId: string, text: string) =>
        makeExtractedTweet({
          tweetId,
          text,
          scene: 'reply',
          isReply: true,
          author: makeExtractedAuthor({ restId: '42001', screenName: 'user_42' }),
        });

      // Positive control
      expect(Shared.evaluateTweet(mkReply('m1-06-pos', '@grok explain this'), config).ruleId).toBe(
        'grok_filter'
      );

      // Negative boundaries
      expect(
        Shared.evaluateTweet(mkReply('m1-06-fan', '@grokfan explain this'), config).blocked
      ).toBe(false);
      expect(
        Shared.evaluateTweet(mkReply('m1-06-mail', 'help@grok.com explain this'), config).blocked
      ).toBe(false);
    });
  });

  // =========================================================================
  // M02: Duplicate Reply Spam Boundaries — 6 Tests
  // =========================================================================
  describe('M02: Duplicate Reply Spam Boundaries', () => {
    it('T2-V2-M02-01: Exact weighted length threshold 11 NOT deduped vs 12 IS deduped (Latin and CJK)', () => {
      const normalizeReplyForDedup = requireExport<
        (raw: string) => { normalized: string; weightedLength: number }
      >(sharedMod, 'normalizeReplyForDedup', '@keepxclean/shared');
      const ThreadDuplicateTracker = requireExport<new () => any>(
        sharedMod,
        'ThreadDuplicateTracker',
        '@keepxclean/shared'
      );

      expect(normalizeReplyForDedup('hello friend').weightedLength).toBe(11);
      expect(normalizeReplyForDedup('hello friends').weightedLength).toBe(12);
      expect(normalizeReplyForDedup('这是一个好').weightedLength).toBe(10);
      expect(normalizeReplyForDedup('这是一个好主').weightedLength).toBe(12);

      const config = Shared.createDefaultConfig('standard');
      const tracker = new ThreadDuplicateTracker();
      const evalReply = (tweetId: string, uid: string, text: string, focalId: string) =>
        (Shared.evaluateTweet as any)(
          makeExtractedTweet({
            tweetId,
            text,
            scene: 'reply',
            isReply: true,
            inReplyToTweetId: focalId,
            focalTweetId: focalId,
            author: makeExtractedAuthor({ restId: uid, screenName: `u_${uid}` }),
          }),
          config,
          null,
          undefined,
          true,
          tracker
        );

      // 11 weighted chars -> NOT deduped
      expect(evalReply('d11-1', '101', 'hello friend', 'f11').blocked).toBe(false);
      expect(evalReply('d11-2', '102', 'hello friend', 'f11').blocked).toBe(false);

      // 12 weighted chars -> 2nd IS deduped
      expect(evalReply('d12-1', '103', 'hello friends', 'f12').blocked).toBe(false);
      const d12Second = evalReply('d12-2', '104', 'hello friends', 'f12');
      expect(d12Second.blocked).toBe(true);
      expect(d12Second.ruleId).toBe('reply_spam');

      // CJK 10 (5 chars) -> NOT deduped; CJK 12 (6 chars) -> 2nd IS deduped
      expect(evalReply('c10-1', '105', '这是一个好', 'fc10').blocked).toBe(false);
      expect(evalReply('c10-2', '106', '这是一个好', 'fc10').blocked).toBe(false);
      expect(evalReply('c12-1', '107', '这是一个好主', 'fc12').blocked).toBe(false);
      const c12Second = evalReply('c12-2', '108', '这是一个好主', 'fc12');
      expect(c12Second.blocked).toBe(true);
      expect(c12Second.ruleId).toBe('reply_spam');
    });

    it('T2-V2-M02-02: Same author repeating identical reply is NOT flagged and re-evaluating with recordObservation=false is idempotent', () => {
      const ThreadDuplicateTracker = requireExport<new () => any>(
        sharedMod,
        'ThreadDuplicateTracker',
        '@keepxclean/shared'
      );
      const config = Shared.createDefaultConfig('standard');
      const tracker = new ThreadDuplicateTracker();
      const text = 'Detailed copy paste community campaign message here';

      const t1 = makeExtractedTweet({
        tweetId: 'idem-1',
        text,
        scene: 'reply',
        isReply: true,
        focalTweetId: 'f-idem',
        author: makeExtractedAuthor({ restId: '501', screenName: 'author_a' }),
      });
      const t1SameAuthor = makeExtractedTweet({
        tweetId: 'idem-1b',
        text,
        scene: 'reply',
        isReply: true,
        focalTweetId: 'f-idem',
        author: makeExtractedAuthor({ restId: '501', screenName: 'author_a' }),
      });
      const t2DiffAuthor = makeExtractedTweet({
        tweetId: 'idem-2',
        text,
        scene: 'reply',
        isReply: true,
        focalTweetId: 'f-idem',
        author: makeExtractedAuthor({ restId: '502', screenName: 'author_b' }),
      });

      expect((Shared.evaluateTweet as any)(t1, config, null, undefined, true, tracker).blocked).toBe(
        false
      );
      expect(
        (Shared.evaluateTweet as any)(t1SameAuthor, config, null, undefined, true, tracker).blocked
      ).toBe(false);
      const d2 = (Shared.evaluateTweet as any)(t2DiffAuthor, config, null, undefined, true, tracker);
      expect(d2.blocked).toBe(true);
      expect(d2.ruleId).toBe('reply_spam');

      // Re-evaluation (recordObservation = false) must preserve decisions idempotently
      expect((Shared.evaluateTweet as any)(t1, config, null, undefined, false, tracker).blocked).toBe(
        false
      );
      const d2Reeval = (Shared.evaluateTweet as any)(
        t2DiffAuthor,
        config,
        null,
        undefined,
        false,
        tracker
      );
      expect(d2Reeval.blocked).toBe(true);
      expect(d2Reeval.ruleId).toBe('reply_spam');
    });

    it('T2-V2-M02-03: Cross-thread isolation prevents identical replies in different focalTweetIds from colliding', () => {
      const ThreadDuplicateTracker = requireExport<new () => any>(
        sharedMod,
        'ThreadDuplicateTracker',
        '@keepxclean/shared'
      );
      const config = Shared.createDefaultConfig('standard');
      const tracker = new ThreadDuplicateTracker();
      const text = 'Congratulations on shipping the new release this week';

      const evalInThread = (tweetId: string, uid: string, focalTweetId: string) =>
        (Shared.evaluateTweet as any)(
          makeExtractedTweet({
            tweetId,
            text,
            scene: 'reply',
            isReply: true,
            inReplyToTweetId: focalTweetId,
            focalTweetId,
            author: makeExtractedAuthor({ restId: uid, screenName: `u_${uid}` }),
          }),
          config,
          null,
          undefined,
          true,
          tracker
        );

      expect(evalInThread('ct-1', '601', 'thread-100').blocked).toBe(false);
      // Same thread -> blocked
      expect(evalInThread('ct-2', '602', 'thread-100').blocked).toBe(true);
      // Different thread -> allowed (1st in thread-200)
      expect(evalInThread('ct-3', '603', 'thread-200').blocked).toBe(false);
    });

    it('T2-V2-M02-04: Duplicate reply exemptions (focal OP, followed, whitelisted) and non-reply timeline guard', () => {
      const ThreadDuplicateTracker = requireExport<new () => any>(
        sharedMod,
        'ThreadDuplicateTracker',
        '@keepxclean/shared'
      );
      const config = Shared.createDefaultConfig('standard');
      config.exemptFollowing = true;
      config.whitelistUids = {
        '703': { uid: '703', screenName: 'vip_703', addedAt: 1_700_000_000_000 },
      };
      const tracker = new ThreadDuplicateTracker();
      const focalAuthor = { restId: '701', screenName: 'thread_op_701', name: 'OP' };
      const text = 'Shared celebratory statement across multiple participants';

      // Seed 1st reply
      expect(
        (Shared.evaluateTweet as any)(
          makeExtractedTweet({
            tweetId: 'ex-1',
            text,
            scene: 'reply',
            isReply: true,
            focalTweetId: 'f-ex',
            focalAuthor,
            author: makeExtractedAuthor({ restId: '700', screenName: 'first_user' }),
          }),
          config,
          null,
          undefined,
          true,
          tracker
        ).blocked
      ).toBe(false);

      // Positive control: stranger 2nd reply IS blocked
      const stranger = (Shared.evaluateTweet as any)(
        makeExtractedTweet({
          tweetId: 'ex-str',
          text,
          scene: 'reply',
          isReply: true,
          focalTweetId: 'f-ex',
          focalAuthor,
          author: makeExtractedAuthor({ restId: '799', screenName: 'stranger_799' }),
        }),
        config,
        null,
        undefined,
        true,
        tracker
      );
      expect(stranger.blocked).toBe(true);
      expect(stranger.ruleId).toBe('reply_spam');

      // Focal OP exempt
      expect(
        (Shared.evaluateTweet as any)(
          makeExtractedTweet({
            tweetId: 'ex-op',
            text,
            scene: 'reply',
            isReply: true,
            focalTweetId: 'f-ex',
            focalAuthor,
            author: makeExtractedAuthor({ restId: '701', screenName: 'thread_op_701' }),
          }),
          config,
          null,
          undefined,
          true,
          tracker
        ).blocked
      ).toBe(false);

      // Followed exempt
      expect(
        (Shared.evaluateTweet as any)(
          makeExtractedTweet({
            tweetId: 'ex-fol',
            text,
            scene: 'reply',
            isReply: true,
            focalTweetId: 'f-ex',
            focalAuthor,
            author: makeExtractedAuthor({
              restId: '702',
              screenName: 'followed_702',
              following: true,
            }),
          }),
          config,
          null,
          undefined,
          true,
          tracker
        ).blocked
      ).toBe(false);

      // Whitelisted exempt
      expect(
        (Shared.evaluateTweet as any)(
          makeExtractedTweet({
            tweetId: 'ex-wl',
            text,
            scene: 'reply',
            isReply: true,
            focalTweetId: 'f-ex',
            focalAuthor,
            author: makeExtractedAuthor({ restId: '703', screenName: 'vip_703' }),
          }),
          config,
          null,
          undefined,
          true,
          tracker
        ).blocked
      ).toBe(false);

      // Non-reply timeline post NOT deduped
      expect(
        (Shared.evaluateTweet as any)(
          makeExtractedTweet({
            tweetId: 'ex-tl',
            text,
            scene: 'timeline',
            isReply: false,
            author: makeExtractedAuthor({ restId: '704', screenName: 'tl_704' }),
          }),
          config,
          null,
          undefined,
          true,
          tracker
        ).blocked
      ).toBe(false);
    });

    it('T2-V2-M02-05: Normalization equivalence catches replies differing only in @mentions, URLs, punctuation, whitespace, casing, or NFKC', () => {
      const normalizeReplyForDedup = requireExport<
        (raw: string) => { normalized: string; weightedLength: number }
      >(sharedMod, 'normalizeReplyForDedup', '@keepxclean/shared');
      const ThreadDuplicateTracker = requireExport<new () => any>(
        sharedMod,
        'ThreadDuplicateTracker',
        '@keepxclean/shared'
      );

      const variant1 = '@alice GREAT Project!! Check https://t.co/aaa111 now...';
      const variant2 = '@bob   ｇｒｅａｔ   project   check   now!!! https://example.org/bbb';
      const n1 = normalizeReplyForDedup(variant1);
      const n2 = normalizeReplyForDedup(variant2);
      expect(n1.normalized).toBe(n2.normalized);
      expect(n1.weightedLength).toBeGreaterThanOrEqual(12);

      const config = Shared.createDefaultConfig('standard');
      const tracker = new ThreadDuplicateTracker();
      const first = (Shared.evaluateTweet as any)(
        makeExtractedTweet({
          tweetId: 'norm-1',
          text: variant1,
          scene: 'reply',
          isReply: true,
          focalTweetId: 'f-norm',
          author: makeExtractedAuthor({ restId: '801', screenName: 'norm_a' }),
        }),
        config,
        null,
        undefined,
        true,
        tracker
      );
      const second = (Shared.evaluateTweet as any)(
        makeExtractedTweet({
          tweetId: 'norm-2',
          text: variant2,
          scene: 'reply',
          isReply: true,
          focalTweetId: 'f-norm',
          author: makeExtractedAuthor({ restId: '802', screenName: 'norm_b' }),
        }),
        config,
        null,
        undefined,
        true,
        tracker
      );
      expect(first.blocked).toBe(false);
      expect(second.blocked).toBe(true);
      expect(second.ruleId).toBe('reply_spam');
    });

    it('T2-V2-M02-06: ThreadDuplicateTracker stays fast and memory-bounded across 2,500 threads while tracking recent duplicates', () => {
      const ThreadDuplicateTracker = requireExport<new () => any>(
        sharedMod,
        'ThreadDuplicateTracker',
        '@keepxclean/shared'
      );
      const tracker = new ThreadDuplicateTracker();
      const start = Date.now();
      for (let i = 0; i < 2500; i++) {
        tracker.recordAndCheck(
          `thread-${i}`,
          `tw-${i}`,
          `uid-${i}`,
          `uniquecommentbody_${i}`
        );
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);

      // Recent thread still flags duplicate accurately
      expect(
        tracker.recordAndCheck('thread-2499', 'tw-dup', 'uid-other', 'uniquecommentbody_2499')
      ).toBe(true);
    });
  });

  // =========================================================================
  // M03: Domain Filter Boundaries — 6 Tests
  // =========================================================================
  describe('M03: Domain Filter Boundaries', () => {
    it('T2-V2-M03-01: Suffix spoofing (not-t.me, t.me.evil.com) and query param (?r=t.me) do NOT match t.me', () => {
      const matchesDomainRule = requireExport<(host: string, rule: string) => boolean>(
        sharedMod,
        'matchesDomainRule',
        '@keepxclean/shared'
      );
      expect(matchesDomainRule('t.me', 't.me')).toBe(true);
      expect(matchesDomainRule('sub.t.me', 't.me')).toBe(true);
      expect(matchesDomainRule('not-t.me', 't.me')).toBe(false);
      expect(matchesDomainRule('t.me.evil.com', 't.me')).toBe(false);

      const config = Shared.createDefaultConfig('standard') as any;
      config.rules.domainFilter.items = [{ id: 'dom-tg', domain: 't.me', enabled: true }];

      // Positive control
      const hit = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'dom-pos',
          text: 'Check out our group link.',
          urls: ['https://t.me/channel_demo'],
        }),
        config
      );
      expect(hit.blocked).toBe(true);
      expect(hit.ruleId).toBe('domain_filter');

      // Negative boundaries
      for (const safeUrl of [
        'https://not-t.me/channel',
        'https://t.me.evil.com/phish',
        'https://example.org/redirect?r=t.me',
      ]) {
        const res = Shared.evaluateTweet(
          makeExtractedTweet({
            tweetId: `dom-safe-${safeUrl.length}`,
            text: 'Check out this safe website link.',
            urls: [safeUrl],
          }),
          config
        );
        expect(res.blocked).toBe(false);
      }
    });

    it('T2-V2-M03-02: normalizeDomainRule strips scheme, www., uppercase, port, path, query, hash, and trailing dot', () => {
      const normalizeDomainRule = requireExport<(raw: string) => string>(
        sharedMod,
        'normalizeDomainRule',
        '@keepxclean/shared'
      );
      expect(normalizeDomainRule('HTTPS://WWW.Pump.Fun:443/token?x=1#top')).toBe('pump.fun');
      expect(normalizeDomainRule('  www.T.Me./join  ')).toBe('t.me');
      expect(normalizeDomainRule('Sub.Example.ORG.')).toBe('sub.example.org');
    });

    it('T2-V2-M03-03: isValidDomainRule and validateConfig reject malformed domains and duplicate domain IDs', async () => {
      const isValidDomainRule = requireExport<(d: string) => boolean>(
        sharedMod,
        'isValidDomainRule',
        '@keepxclean/shared'
      );
      for (const bad of ['', 'localhost', '*.t.me', 'bad domain.com', 'http://', '.example.com']) {
        expect(isValidDomainRule(bad)).toBe(false);
      }

      const { validateConfig } = await requireModule<{
        validateConfig: (raw: unknown) => any;
      }>('apps/extension/src/services/validation.ts', 'extension validator');

      // Positive control: valid & normalizable domainFilter.items survive validateConfig
      const validDomainCfg = Shared.createDefaultConfig('standard') as any;
      validDomainCfg.rules.domainFilter.items = [
        { id: 'd-ok', domain: 'pump.fun', enabled: true },
        { id: 'd-url', domain: 'HTTPS://WWW.Example.ORG/path?x=1', enabled: true },
        { id: 'd-wild', domain: '*.t.me', enabled: true },
      ];
      const validatedDomainCfg = validateConfig(validDomainCfg);
      expect(validatedDomainCfg.rules.domainFilter.items).toHaveLength(3);
      expect(validatedDomainCfg.rules.domainFilter.items[0].domain).toBe('pump.fun');
      expect(validatedDomainCfg.rules.domainFilter.items[1].domain).toBe('example.org');
      expect(validatedDomainCfg.rules.domainFilter.items[2].domain).toBe('t.me');

      // Malformed domains that remain invalid after normalizeDomainRule MUST be rejected
      for (const badDomain of [
        '',
        'localhost',
        'bad domain.com',
        'a.*.t.me',
        'http://',
        't.me..',
      ]) {
        const badDomainCfg = Shared.createDefaultConfig('standard') as any;
        badDomainCfg.rules.domainFilter.items = [
          { id: 'd1', domain: badDomain, enabled: true },
        ];
        expect(() => validateConfig(badDomainCfg)).toThrow();
      }

      const dupIdCfg = Shared.createDefaultConfig('standard') as any;
      dupIdCfg.rules.domainFilter.items = [
        { id: 'dup-dom', domain: 'pump.fun', enabled: true },
        { id: 'dup-dom', domain: 't.me', enabled: true },
      ];
      expect(() => validateConfig(dupIdCfg)).toThrow();
    });

    it('T2-V2-M03-04: Disabled domainFilter/item bypasses match and applyPresetToConfig preserves user domainFilter.items', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      expect(config.rules.domainFilter).toBeDefined();
      config.rules.domainFilter.items = [
        { id: 'keep-dom-1', domain: 'keep-me.example', enabled: true },
      ];

      const switched = Shared.applyPresetToConfig(config, 'strict') as any;
      expect(switched.rules.domainFilter.items).toHaveLength(1);
      expect(switched.rules.domainFilter.items[0].domain).toBe('keep-me.example');

      const tweet = makeExtractedTweet({
        tweetId: 'dom-dis-check',
        text: 'Sharing an external site link.',
        urls: ['https://keep-me.example/a'],
      });
      expect(Shared.evaluateTweet(tweet, switched).ruleId).toBe('domain_filter');

      // Item disabled
      switched.rules.domainFilter.items[0].enabled = false;
      expect(Shared.evaluateTweet(tweet, switched).blocked).toBe(false);

      // Re-enable item, disable top-level rule
      switched.rules.domainFilter.items[0].enabled = true;
      switched.rules.domainFilter.enabled = false;
      expect(Shared.evaluateTweet(tweet, switched).blocked).toBe(false);
    });

    it('T2-V2-M03-05: Whitelisted quoted/retweeted author exempts their bioUrls and quotedUrls from domain_filter', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      expect(config.rules.domainFilter).toBeDefined();
      config.rules.domainFilter.items = [
        { id: 'dom-wl-test', domain: 'partner.example', enabled: true },
      ];

      const qtAuthor = makeExtractedAuthor({
        restId: '777001',
        screenName: 'trusted_qt_author',
        bioUrls: ['https://partner.example/about'],
      });
      const tweet = makeExtractedTweet({
        tweetId: 'dom-wl-1',
        text: 'Commenting on this quoted thread.',
        quotedUrls: ['https://partner.example/doc'],
        quotedAuthor: qtAuthor,
        author: makeExtractedAuthor({ restId: '777002', screenName: 'regular_quoter' }),
      });

      // Positive control: non-whitelisted QT IS blocked
      expect(Shared.evaluateTweet(tweet, config).ruleId).toBe('domain_filter');

      // Whitelisted quoted author -> allowed
      config.whitelistUids = {
        '777001': { uid: '777001', screenName: 'trusted_qt_author', addedAt: 1_700_000_000_000 },
      };
      expect(Shared.evaluateTweet(tweet, config).blocked).toBe(false);
    });

    it('T2-V2-M03-06: extractHostnameFromUrl safely returns null on empty, malformed, javascript:, and data: URLs', () => {
      const extractHostnameFromUrl = requireExport<(raw: string) => string | null>(
        sharedMod,
        'extractHostnameFromUrl',
        '@keepxclean/shared'
      );
      expect(extractHostnameFromUrl('https://sub.example.com/path?q=1')).toBe('sub.example.com');
      for (const bad of ['', 'not-a-url', 'javascript:alert(1)', 'data:text/html,hi', '   ']) {
        expect(extractHostnameFromUrl(bad)).toBeNull();
      }
    });
  });

  // =========================================================================
  // M04: 10-Language Public Keyword Packs & D1 0004 Boundaries — 6 Tests
  // =========================================================================
  describe('M04: 10-Language Public Keyword Packs & D1 0004 Boundaries', () => {
    it('T2-V2-M04-01: All 24 exact legacy DEFAULT_CLOUD_KEYWORDS IDs are preserved and every item has a valid langGroup', () => {
      const groups = requireExport<readonly string[]>(
        sharedMod,
        'CLOUD_KEYWORD_LANG_GROUPS',
        '@keepxclean/shared'
      );
      const idSet = new Set(Shared.DEFAULT_CLOUD_KEYWORDS.map((k) => k.id));
      for (const legacyId of LEGACY_24_CLOUD_KEYWORD_IDS) {
        expect(idSet.has(legacyId)).toBe(true);
      }
      for (const item of Shared.DEFAULT_CLOUD_KEYWORDS as Array<any>) {
        expect(typeof item.langGroup).toBe('string');
        expect(groups).toContain(item.langGroup);
      }
    });

    it('T2-V2-M04-02: zh-CN and zh-TW both map to zh and Node locale auto resolves to deduplicated [universal, en]', () => {
      const localeToCloudLangGroup = requireExport<(locale: string) => string>(
        sharedMod,
        'localeToCloudLangGroup',
        '@keepxclean/shared'
      );
      const resolveEnabledCloudLangGroups = requireExport<(cfg: any) => string[]>(
        sharedMod,
        'resolveEnabledCloudLangGroups',
        '@keepxclean/shared'
      );

      expect(localeToCloudLangGroup('zh-CN')).toBe('zh');
      expect(localeToCloudLangGroup('zh-TW')).toBe('zh');

      const autoCfg = Shared.createDefaultConfig('standard');
      autoCfg.locale = 'auto';
      const resolved = resolveEnabledCloudLangGroups(autoCfg);
      expect(resolved).toContain('universal');
      expect(resolved).toContain('en');
      expect(new Set(resolved).size).toBe(resolved.length);
    });

    it('T2-V2-M04-03: Explicit enabledCloudLangGroups=[] disables ALL cloud packs without falling back to universal/en', () => {
      const resolveEnabledCloudLangGroups = requireExport<(cfg: any) => string[]>(
        sharedMod,
        'resolveEnabledCloudLangGroups',
        '@keepxclean/shared'
      );
      const tweet = makeExtractedTweet({
        tweetId: 'm4-empty-groups',
        text: 'Visit onlyfans.com/creator and check link in bio.',
      });
      // Positive control: exact same tweet IS blocked by cloud_keyword under default config
      const defaultCfg = Shared.createDefaultConfig('standard') as any;
      const posDec = Shared.evaluateTweet(tweet, defaultCfg);
      expect(posDec.blocked).toBe(true);
      expect(posDec.ruleId).toBe('cloud_keyword');

      const cfg = Shared.createDefaultConfig('standard') as any;
      cfg.enabledCloudLangGroups = [];
      expect(resolveEnabledCloudLangGroups(cfg)).toEqual([]);

      const dec = Shared.evaluateTweet(tweet, cfg);
      expect(dec.blocked).toBe(false);
    });

    it('T2-V2-M04-04: mergeCloudKeywords honors remote emergency pause and preserves langGroup on remote hotfix rules', () => {
      const groups = requireExport<readonly string[]>(
        sharedMod,
        'CLOUD_KEYWORD_LANG_GROUPS',
        '@keepxclean/shared'
      );
      expect(groups).toContain('ko');

      const merged = Shared.mergeCloudKeywords([
        {
          id: 'cloud-nsfw-bio-1',
          pattern: 'onlyfans\\.com',
          isRegex: true,
          scopes: ['text'],
          enabled: false,
        } as any,
        {
          id: 'cloud-ko-hotfix-99',
          pattern: '무료코인에어드랍',
          isRegex: false,
          scopes: ['text'],
          langGroup: 'ko',
          enabled: true,
        } as any,
      ]) as Array<any>;

      const paused = merged.find((k) => k.id === 'cloud-nsfw-bio-1');
      expect(paused?.enabled).toBe(false);

      const koHotfix = merged.find((k) => k.id === 'cloud-ko-hotfix-99');
      expect(koHotfix).toBeDefined();
      expect(koHotfix.langGroup).toBe('ko');
      expect(koHotfix.enabled).toBe(true);
    });

    it('T2-V2-M04-05: D1 migration 0004 backfills pre-existing legacy rows with default lang_group=universal in snapshot', async () => {
      const d1 = createSqliteD1Adapter();
      try {
        // Apply 0001..0003 first
        await applyServerMigrations(d1, { upToPrefix: '0003' });
        // Insert a pre-0004 row without lang_group column
        await d1
          .prepare(
            `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, note, enabled, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            'legacy-pre0004-rule',
            'legacy_pre0004_pattern',
            0,
            JSON.stringify(['text']),
            'Legacy pre-0004 row',
            1,
            Date.now()
          )
          .run();

        // Now apply 0004 migration
        const applied0004 = await applyServerMigrations(d1, {
          fromPrefix: '0004',
          requireMigration0004: true,
        });
        expect(applied0004.some((f) => f.startsWith('0004'))).toBe(true);

        const serverMod = await requireModule<{ app: any }>(
          'apps/server/src/index.ts',
          'Cloudflare Worker server'
        );
        const res = await serverMod.app.request(
          'https://api.keepxclean.com/v1/snapshot.json?fresh=1',
          { method: 'GET' },
          { DB: d1 }
        );
        expect(res.status).toBe(200);
        const snap = (await res.json()) as { cloudKeywords: Array<Record<string, unknown>> };
        const row = snap.cloudKeywords.find((k) => k.id === 'legacy-pre0004-rule');
        expect(row).toBeDefined();
        expect(row!.langGroup).toBe('universal');
      } finally {
        d1.close();
      }
    });

    it('T2-V2-M04-06: validateConfig rejects invalid enabledCloudLangGroups values while accepting [] and valid groups', async () => {
      const { validateConfig } = await requireModule<{
        validateConfig: (raw: unknown) => any;
      }>('apps/extension/src/services/validation.ts', 'extension validator');

      const validEmpty = Shared.createDefaultConfig('standard') as any;
      validEmpty.enabledCloudLangGroups = [];
      expect(validateConfig(validEmpty).enabledCloudLangGroups).toEqual([]);

      const validList = Shared.createDefaultConfig('standard') as any;
      validList.enabledCloudLangGroups = ['universal', 'ja'];
      expect(validateConfig(validList).enabledCloudLangGroups).toEqual(['universal', 'ja']);

      const badGroup = Shared.createDefaultConfig('standard') as any;
      badGroup.enabledCloudLangGroups = ['xx'];
      expect(() => validateConfig(badGroup)).toThrow();

      const badType = Shared.createDefaultConfig('standard') as any;
      badType.enabledCloudLangGroups = 'en';
      expect(() => validateConfig(badType)).toThrow();
    });
  });

  // =========================================================================
  // M05: For You / Following & sceneModes Boundaries — 6 Tests
  // =========================================================================
  describe('M05: For You / Following & sceneModes Boundaries', () => {
    it('T2-V2-M05-01: detectTimelineFeedFromUrl distinguishes HomeLatestTimeline from HomeTimeline and returns undefined for non-home URLs', () => {
      const detectTimelineFeedFromUrl = requireExport<
        (url: string) => 'for_you' | 'following' | undefined
      >(sharedMod, 'detectTimelineFeedFromUrl', '@keepxclean/shared');

      expect(detectTimelineFeedFromUrl(GRAPHQL_URLS.following)).toBe('following');
      expect(detectTimelineFeedFromUrl(GRAPHQL_URLS.forYou)).toBe('for_you');

      for (const nonHome of [
        GRAPHQL_URLS.tweetDetail,
        GRAPHQL_URLS.search,
        'https://x.com/i/api/graphql/xyz/UserTweets',
        'SSR_RELAY',
        '',
      ]) {
        expect(detectTimelineFeedFromUrl(nonHome)).toBeUndefined();
      }
    });

    it('T2-V2-M05-02: sceneModes following bypass STILL enforces manual localBlocklistUids', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.sceneModes = { following: 'bypass' };
      config.rules.keywords.items = [
        { id: 'kw-byp', pattern: 'bypass_probe_kw', isRegex: false, scopes: ['text'], enabled: true },
      ];
      config.localBlocklistUids = {
        '555001': { uid: '555001', screenName: 'manual_blocked', addedAt: 1_700_000_000_000 },
      };

      // Positive control: heuristic keyword IS bypassed on following
      const heuristic = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm5-02-h',
          text: 'Contains bypass_probe_kw text.',
          scene: 'timeline',
          timelineFeed: 'following',
          author: makeExtractedAuthor({ restId: '555999', screenName: 'unlisted' }),
        }),
        config
      );
      expect(heuristic.blocked).toBe(false);

      // Local blocklist STILL intercepts on following even under bypass!
      const blocked = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm5-02-b',
          text: 'Completely normal text from manually blocked author.',
          scene: 'timeline',
          timelineFeed: 'following',
          author: makeExtractedAuthor({ restId: '555001', screenName: 'manual_blocked' }),
        }),
        config
      );
      expect(blocked.blocked).toBe(true);
      expect(blocked.ruleId).toBe('local_blocklist');
    });

    it('T2-V2-M05-03: sceneModes following bypass STILL strips promoted ads when hidePromotedAds is enabled', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.sceneModes = { following: 'bypass' };
      config.rules.hidePromotedAds.enabled = true;
      config.rules.keywords.items = [
        { id: 'kw-byp-ad', pattern: 'bypass_ad_probe', isRegex: false, scopes: ['text'], enabled: true },
      ];

      // Positive control: heuristic bypassed
      expect(
        Shared.evaluateTweet(
          makeExtractedTweet({
            tweetId: 'm5-03-h',
            text: 'Contains bypass_ad_probe text.',
            scene: 'timeline',
            timelineFeed: 'following',
          }),
          config
        ).blocked
      ).toBe(false);

      // Promoted ad still stripped
      const adDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm5-03-ad',
          text: 'Buy our sponsored widget today!',
          isPromoted: true,
          scene: 'timeline',
          timelineFeed: 'following',
        }),
        config
      );
      expect(adDec.blocked).toBe(true);
      expect(adDec.ruleId).toBe('promoted_ad');
      expect(adDec.action).toBe('strip');

      // When hidePromotedAds is disabled, ad is allowed
      config.rules.hidePromotedAds.enabled = false;
      expect(
        Shared.evaluateTweet(
          makeExtractedTweet({
            tweetId: 'm5-03-adoff',
            text: 'Buy our sponsored widget today!',
            isPromoted: true,
            scene: 'timeline',
            timelineFeed: 'following',
          }),
          config
        ).blocked
      ).toBe(false);
    });

    it('T2-V2-M05-04: whitelistUids ALWAYS overrides sceneModes for_you strip', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.interceptionMode = 'collapse';
      config.sceneModes = { for_you: 'strip' };
      config.rules.keywords.items = [
        { id: 'kw-wl-strip', pattern: 'wl_strip_probe', isRegex: false, scopes: ['text'], enabled: true },
      ];
      config.whitelistUids = {
        '554001': { uid: '554001', screenName: 'vip_friend', addedAt: 1_700_000_000_000 },
      };

      // Positive control: non-whitelisted IS stripped (overriding global collapse)
      const nonWl = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm5-04-pos',
          text: 'Contains wl_strip_probe text.',
          scene: 'timeline',
          timelineFeed: 'for_you',
          author: makeExtractedAuthor({ restId: '554999', screenName: 'stranger_554' }),
        }),
        config
      );
      expect(nonWl.blocked).toBe(true);
      expect(nonWl.action).toBe('strip');

      // Whitelisted author is allowed
      const wl = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm5-04-wl',
          text: 'Contains wl_strip_probe text.',
          scene: 'timeline',
          timelineFeed: 'for_you',
          author: makeExtractedAuthor({ restId: '554001', screenName: 'vip_friend' }),
        }),
        config
      );
      expect(wl.blocked).toBe(false);
      expect(wl.action).toBe('allow');
    });

    it('T2-V2-M05-05: profile scene remains badge_only under profileSceneBadgeOnly regardless of sceneModes', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.interceptionMode = 'collapse';
      config.profileSceneBadgeOnly = true;
      config.sceneModes = { for_you: 'strip', following: 'strip', reply: 'strip', search: 'strip' };
      config.rules.keywords.items = [
        { id: 'kw-prof', pattern: 'prof_badge_probe', isRegex: false, scopes: ['text'], enabled: true },
      ];

      // Positive control: for_you strips
      const fy = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm5-05-fy',
          text: 'Contains prof_badge_probe text.',
          scene: 'timeline',
          timelineFeed: 'for_you',
        }),
        config
      );
      expect(fy.action).toBe('strip');

      // Profile scene returns badge_only
      const prof = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm5-05-pr',
          text: 'Contains prof_badge_probe text.',
          scene: 'profile',
        }),
        config
      );
      expect(prof.action).toBe('badge_only');
    });

    it('T2-V2-M05-06: validateConfig rejects invalid sceneModes keys and invalid mode values', async () => {
      const { validateConfig } = await requireModule<{
        validateConfig: (raw: unknown) => any;
      }>('apps/extension/src/services/validation.ts', 'extension validator');

      // Positive control: valid non-default sceneModes MUST survive validateConfig
      const validSceneModes = {
        for_you: 'strip',
        following: 'bypass',
        reply: 'collapse',
        search: 'inherit',
      } as const;
      const validCfg = Shared.createDefaultConfig('standard') as any;
      validCfg.sceneModes = { ...validSceneModes };
      expect(validateConfig(validCfg).sceneModes).toEqual(validSceneModes);

      const badKey = Shared.createDefaultConfig('standard') as any;
      badKey.sceneModes = { dm: 'strip' };
      expect(() => validateConfig(badKey)).toThrow();

      const badProfileKey = Shared.createDefaultConfig('standard') as any;
      badProfileKey.sceneModes = { profile: 'bypass' };
      expect(() => validateConfig(badProfileKey)).toThrow();

      const badMode = Shared.createDefaultConfig('standard') as any;
      badMode.sceneModes = { for_you: 'delete' };
      expect(() => validateConfig(badMode)).toThrow();
    });
  });

  // =========================================================================
  // M06: Collapse-Bar Deep-Link & target.disable Boundaries — 5 Tests
  // =========================================================================
  describe('M06: Collapse-Bar Deep-Link & target.disable Boundaries', () => {
    it('T2-V2-M06-01: options.open rejects path traversal, unknown pages, XSS query values, and disallowed query keys', async () => {
      const bg = await bootBackgroundHarness();
      try {
        // Positive control
        const valid = await bg.sendCommand({
          type: 'options.open',
          page: 'keywords',
          query: { tab: 'cloud', focus: 'cloud-nsfw-bio-1' },
        });
        expect(valid.ok).toBe(true);
        const okUrl = String(bg.chromeEnv.createdTabs[0]?.url ?? '');
        expect(okUrl).toContain('tab=cloud');
        expect(okUrl).toContain('focus=cloud-nsfw-bio-1');

        // 4 malicious inputs must fail cleanly
        const badInputs = [
          { type: 'options.open', page: '../evil' },
          { type: 'options.open', page: 'admin' },
          {
            type: 'options.open',
            page: 'rules',
            query: { focus: '<script>alert(1)</script>' },
          },
          {
            type: 'options.open',
            page: 'rules',
            query: { redirect: 'https://evil.example' },
          },
        ];
        for (const cmd of badInputs) {
          const r = await bg.sendCommand(cmd);
          expect(r.ok).toBe(false);
        }
        // Rejected calls MUST open/mutate zero tabs
        expect(bg.chromeEnv.createdTabs).toHaveLength(1);
        expect(bg.chromeEnv.updatedTabs).toHaveLength(0);
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M06-02: target.disable rejects non-disableable kind rule and empty id without altering config', async () => {
      const bg = await bootBackgroundHarness();
      try {
        // Positive control: disabling a real keyword succeeds
        expect(
          (
            await bg.sendCommand({
              type: 'keyword.save',
              item: { id: 'kw-pos-dis', pattern: 'pos_tok', isRegex: false, scopes: ['text'], enabled: true },
            })
          ).ok
        ).toBe(true);
        const pos = await bg.sendCommand({
          type: 'target.disable',
          target: { kind: 'keyword', id: 'kw-pos-dis' },
        });
        expect(pos.ok).toBe(true);

        const before = await bg.sendCommand<any>({ type: 'state.get' });
        const badRule = await bg.sendCommand({
          type: 'target.disable',
          target: { kind: 'rule', id: 'grokFilter' },
        });
        expect(badRule.ok).toBe(false);

        const badEmpty = await bg.sendCommand({
          type: 'target.disable',
          target: { kind: 'keyword', id: '' },
        });
        expect(badEmpty.ok).toBe(false);

        const after = await bg.sendCommand<any>({ type: 'state.get' });
        expect(after.data.config).toEqual(before.data.config);
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M06-03: target.disable on missing keyword/domain/pack item leaves sibling items intact', async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect(
          (
            await bg.sendCommand({
              type: 'keyword.save',
              item: { id: 'kw-sib-1', pattern: 'sib_one', isRegex: false, scopes: ['text'], enabled: true },
            })
          ).ok
        ).toBe(true);
        expect(
          (
            await bg.sendCommand({
              type: 'keyword.save',
              item: { id: 'kw-sib-2', pattern: 'sib_two', isRegex: false, scopes: ['text'], enabled: true },
            })
          ).ok
        ).toBe(true);

        // Positive control: disable sib-1
        expect(
          (
            await bg.sendCommand({
              type: 'target.disable',
              target: { kind: 'keyword', id: 'kw-sib-1' },
            })
          ).ok
        ).toBe(true);

        // Attempt disabling nonexistent ID (may return ok:true no-op or ok:false, MUST NOT harm sib-2)
        await bg.sendCommand({
          type: 'target.disable',
          target: { kind: 'keyword', id: 'kw-does-not-exist' },
        });

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        const items = state.data.config.rules.keywords.items as any[];
        expect(items).toHaveLength(2);
        expect(items.find((k) => k.id === 'kw-sib-1')?.enabled).toBe(false);
        expect(items.find((k) => k.id === 'kw-sib-2')?.enabled).toBe(true);
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M06-04: Allowed clean tweets omit matchedTarget while blocked tweets always populate matchedTarget', () => {
      const config = Shared.createDefaultConfig('standard');
      config.rules.keywords.items = [
        { id: 'kw-mt-check', pattern: 'mt_blocked_token', isRegex: false, scopes: ['text'], enabled: true },
      ];

      const blocked = Shared.evaluateTweet(
        makeExtractedTweet({ tweetId: 'm6-04-b', text: 'Contains mt_blocked_token here.' }),
        config
      ) as any;
      expect(blocked.blocked).toBe(true);
      expect(blocked.matchedTarget).toEqual({ kind: 'keyword', id: 'kw-mt-check' });

      const clean = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: 'm6-04-c',
          text: 'Normal informative discussion about web standards and browsers.',
        }),
        config
      ) as any;
      expect(clean.blocked).toBe(false);
      expect(clean.matchedTarget).toBeUndefined();
    });

    it('T2-V2-M06-05: Calling target.disable twice on the same cloud_keyword is idempotent with no duplicate IDs', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const first = await bg.sendCommand({
          type: 'target.disable',
          target: { kind: 'cloud_keyword', id: 'cloud-nsfw-bio-1' },
        });
        expect(first.ok).toBe(true);

        const second = await bg.sendCommand({
          type: 'target.disable',
          target: { kind: 'cloud_keyword', id: 'cloud-nsfw-bio-1' },
        });
        expect(second.ok).toBe(true);

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        const occurrences = (state.data.config.disabledCloudKeywordIds as string[]).filter(
          (id) => id === 'cloud-nsfw-bio-1'
        );
        expect(occurrences).toHaveLength(1);
      } finally {
        await bg.cleanup();
      }
    });
  });

  // =========================================================================
  // M07: Privacy Defaults & First-Install Onboarding Boundaries — 6 Tests
  // =========================================================================
  describe('M07: Privacy Defaults & First-Install Onboarding Boundaries', () => {
    it('T2-V2-M07-01: Upgrading stored v0.1.2 config with true privacy flags preserves true flags and hydrates onboardingDismissed=true', async () => {
      const legacy = createLegacyV012ConfigFixture({
        syncNativeXBlock: true,
        enableCrowdReport: true,
      });
      const bg = await bootBackgroundHarness({
        local: { [Shared.STORAGE_KEYS.CONFIG]: legacy },
      });
      try {
        const state = await bg.sendCommand<any>({ type: 'state.get' });
        const cfg = state.data.config;
        expect(cfg.version).toBe(1);
        expect(cfg.syncNativeXBlock).toBe(true);
        expect(cfg.enableCrowdReport).toBe(true);
        expect(cfg.onboardingDismissed).toBe(true);
        expect(cfg.rules.grokFilter?.protectOfficialGrok).toBe(true);
        expect(cfg.rules.domainFilter).toEqual({ enabled: true, items: [] });
        expect(cfg.rules.replySpam.blockDuplicateReplies).toBe(true);
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M07-02: Upgrading stored v0.1.2 config with false privacy flags preserves false flags and version=1', async () => {
      const legacy = createLegacyV012ConfigFixture({
        syncNativeXBlock: false,
        enableCrowdReport: false,
      });
      const bg = await bootBackgroundHarness({
        local: { [Shared.STORAGE_KEYS.CONFIG]: legacy },
      });
      try {
        const state = await bg.sendCommand<any>({ type: 'state.get' });
        const cfg = state.data.config;
        expect(cfg.version).toBe(1);
        expect(cfg.syncNativeXBlock).toBe(false);
        expect(cfg.enableCrowdReport).toBe(false);
        expect(cfg.onboardingDismissed).toBe(true);
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M07-03: Running initializeStorage twice on a fresh install preserves onboardingDismissed=false and opens 0 tabs', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const repoMod = await requireModule<{ initializeStorage: () => Promise<void> }>(
          'apps/extension/src/background/repository.ts',
          'extension repository'
        );
        await repoMod.initializeStorage();
        await repoMod.initializeStorage();
        expect(bg.chromeEnv.createdTabs).toHaveLength(0);

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        expect(state.data.config.onboardingDismissed).toBe(false);
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M07-04: config.reset keeps privacy defaults false and preserves personal keywords, domains, blocklist, and onboardingDismissed', async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect(
          (await bg.sendCommand({ type: 'config.patch', patch: { onboardingDismissed: true } })).ok
        ).toBe(true);
        expect(
          (
            await bg.sendCommand({
              type: 'keyword.save',
              item: { id: 'kw-keep-rst', pattern: 'keep_on_reset', isRegex: false, scopes: ['text'], enabled: true },
            })
          ).ok
        ).toBe(true);
        expect(
          (
            await bg.sendCommand({
              type: 'domain.save',
              item: { id: 'dom-keep-rst', domain: 'keep-reset.example', enabled: true },
            })
          ).ok
        ).toBe(true);
        expect(
          (
            await bg.sendCommand({
              type: 'account.save',
              list: 'black',
              entry: { uid: '88112233', screenName: 'keep_blocked', addedAt: 1_700_000_000_000 },
            })
          ).ok
        ).toBe(true);

        const before = await bg.sendCommand<any>({ type: 'state.get' });
        const resetRes = await bg.sendCommand({
          type: 'config.reset',
          expected: JSON.stringify(before.data.config),
        });
        expect(resetRes.ok).toBe(true);

        const after = await bg.sendCommand<any>({ type: 'state.get' });
        const cfg = after.data.config;
        expect(cfg.syncNativeXBlock).toBe(false);
        expect(cfg.enableCrowdReport).toBe(false);
        expect(cfg.onboardingDismissed).toBe(true);
        expect(cfg.rules.keywords.items.some((k: any) => k.id === 'kw-keep-rst')).toBe(true);
        expect(cfg.rules.domainFilter.items.some((d: any) => d.id === 'dom-keep-rst')).toBe(true);
        expect(cfg.localBlocklistUids['88112233']).toBeDefined();
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M07-05: applyPresetToConfig preserves syncNativeXBlock=false and enableCrowdReport=false across all preset transitions', () => {
      let cfg = Shared.createDefaultConfig('standard');
      expect(cfg.syncNativeXBlock).toBe(false);
      expect(cfg.enableCrowdReport).toBe(false);

      for (const next of ['strict', 'light', 'standard'] as const) {
        cfg = Shared.applyPresetToConfig(cfg, next);
        expect(cfg.syncNativeXBlock).toBe(false);
        expect(cfg.enableCrowdReport).toBe(false);
      }
    });

    it('T2-V2-M07-06: validateConfig rejects non-boolean onboardingDismissed values', async () => {
      const { validateConfig } = await requireModule<{
        validateConfig: (raw: unknown) => any;
      }>('apps/extension/src/services/validation.ts', 'extension validator');

      // Positive control: non-default onboardingDismissed=false MUST survive validateConfig
      const validFalse = Shared.createDefaultConfig('standard') as any;
      validFalse.onboardingDismissed = false;
      expect(validateConfig(validFalse).onboardingDismissed).toBe(false);

      const badStr = Shared.createDefaultConfig('standard') as any;
      badStr.onboardingDismissed = 'yes';
      expect(() => validateConfig(badStr)).toThrow();

      const badNum = Shared.createDefaultConfig('standard') as any;
      badNum.onboardingDismissed = 1;
      expect(() => validateConfig(badNum)).toThrow();
    });
  });

  // =========================================================================
  // M08: Offline Rule Packs (kxc-pack-v1) Boundaries — 7 Tests
  // =========================================================================
  describe('M08: Offline Rule Packs (kxc-pack-v1) Boundaries', () => {
    it('T2-V2-M08-01: validateRulePack rejects wrong/empty format and non-object inputs', async () => {
      await requireModule('packages/shared/src/packs.ts', 'shared packs');
      const validateRulePack = requireExport<(input: unknown) => any>(
        sharedMod,
        'validateRulePack',
        '@keepxclean/shared'
      );

      expect(validateRulePack(createValidKxcPackV1()).format).toBe('kxc-pack-v1');

      for (const bad of [
        null,
        undefined,
        42,
        'kxc-pack-v1',
        [],
        INVALID_KXC_PACK_CASES.wrongFormat(),
        INVALID_KXC_PACK_CASES.emptyFormat(),
        INVALID_KXC_PACK_CASES.missingMetadata(),
      ]) {
        expect(() => validateRulePack(bad)).toThrow();
      }
    });

    it('T2-V2-M08-02: validateRulePack rejects forbidden private keys and serializeRulePack never emits them', async () => {
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

      for (const bad of [
        INVALID_KXC_PACK_CASES.forbiddenWhitelistUids(),
        INVALID_KXC_PACK_CASES.forbiddenCustomApiBaseUrl(),
        INVALID_KXC_PACK_CASES.forbiddenSyncNativeXBlock(),
        INVALID_KXC_PACK_CASES.forbiddenEnableCrowdReport(),
      ]) {
        expect(() => validateRulePack(bad)).toThrow();
      }

      const serialized = serializeRulePack(createValidKxcPackV1());
      const parsed = JSON.parse(serialized) as Record<string, unknown>;
      expect('whitelistUids' in parsed).toBe(false);
      expect('customApiBaseUrl' in parsed).toBe(false);
      expect('syncNativeXBlock' in parsed).toBe(false);
      expect('enableCrowdReport' in parsed).toBe(false);
    });

    it('T2-V2-M08-03: validateRulePack rejects invalid regex syntax, ReDoS nested quantifiers, and oversized regex patterns in keywords', async () => {
      await requireModule('packages/shared/src/packs.ts', 'shared packs');
      const validateRulePack = requireExport<(input: unknown) => any>(
        sharedMod,
        'validateRulePack',
        '@keepxclean/shared'
      );

      expect(validateRulePack(createValidKxcPackV1()).keywords).toHaveLength(2);
      expect(() => validateRulePack(INVALID_KXC_PACK_CASES.invalidRegexSyntax())).toThrow();
      expect(() => validateRulePack(INVALID_KXC_PACK_CASES.redosRegexPattern())).toThrow();
      expect(() => validateRulePack(INVALID_KXC_PACK_CASES.oversizedRegexPattern())).toThrow();
    });

    it('T2-V2-M08-04: validateRulePack rejects invalid domains and non-numeric UIDs in blockedUids', async () => {
      await requireModule('packages/shared/src/packs.ts', 'shared packs');
      const validateRulePack = requireExport<(input: unknown) => any>(
        sharedMod,
        'validateRulePack',
        '@keepxclean/shared'
      );

      expect(validateRulePack(createValidKxcPackV1()).format).toBe('kxc-pack-v1');
      expect(() => validateRulePack(INVALID_KXC_PACK_CASES.invalidDomain())).toThrow();
      expect(() => validateRulePack(INVALID_KXC_PACK_CASES.invalidUid())).toThrow();
    });

    it('T2-V2-M08-05: validateRulePack rejects oversized packs exceeding item count limits', async () => {
      await requireModule('packages/shared/src/packs.ts', 'shared packs');
      const validateRulePack = requireExport<(input: unknown) => any>(
        sharedMod,
        'validateRulePack',
        '@keepxclean/shared'
      );

      expect(validateRulePack(createValidKxcPackV1()).format).toBe('kxc-pack-v1');
      expect(() => validateRulePack(INVALID_KXC_PACK_CASES.tooManyKeywords())).toThrow();
      expect(() => validateRulePack(INVALID_KXC_PACK_CASES.tooManyDomains())).toThrow();
      expect(() => validateRulePack(INVALID_KXC_PACK_CASES.tooManyBlockedUids())).toThrow();
    });

    it('T2-V2-M08-06: whitelistUids ALWAYS overrides installedPacks blockedUids, keywords, and domains', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.installedPacks = [
        {
          ...createValidKxcPackV1({ id: 'pack-wl-override' }),
          enabled: true,
          installedAt: 1_700_000_000_000,
        },
      ];

      const packTargetTweet = makeExtractedTweet({
        tweetId: 'm8-wl-1',
        text: 'Guaranteed 1000x moonshot alpha link.',
        urls: ['https://pump-scam.example/launch'],
        author: makeExtractedAuthor({ restId: '8877665544', screenName: 'pack_spam_bot' }),
      });

      // Positive control: blocked by rule_pack when NOT whitelisted
      const blocked = Shared.evaluateTweet(packTargetTweet, config);
      expect(blocked.blocked).toBe(true);
      expect(blocked.ruleId).toBe('rule_pack');

      // Whitelisted author wins over all 3 pack triggers
      config.whitelistUids = {
        '8877665544': { uid: '8877665544', screenName: 'pack_spam_bot', addedAt: 1_700_000_000_000 },
      };
      const allowed = Shared.evaluateTweet(packTargetTweet, config);
      expect(allowed.blocked).toBe(false);
      expect(allowed.action).toBe('allow');
    });

    it('T2-V2-M08-07: Re-installing same pack id updates in place without duplicating entries or polluting personal rules', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const v1 = createValidKxcPackV1({ id: 'pack-reinstall', version: '1.0.0' });
        const v2 = createValidKxcPackV1({ id: 'pack-reinstall', version: '2.0.0' });

        expect((await bg.sendCommand({ type: 'pack.install', pack: v1 })).ok).toBe(true);
        expect((await bg.sendCommand({ type: 'pack.install', pack: v2 })).ok).toBe(true);

        const st = await bg.sendCommand<any>({ type: 'state.get' });
        const matching = st.data.config.installedPacks.filter(
          (p: any) => p.id === 'pack-reinstall'
        );
        expect(matching).toHaveLength(1);
        expect(matching[0].version).toBe('2.0.0');
        expect(st.data.config.rules.keywords.items).toHaveLength(0);
      } finally {
        await bg.cleanup();
      }
    });
  });

  // =========================================================================
  // M09: Cross-Device Sync (chrome.storage.sync) Boundaries — 6 Tests
  // =========================================================================
  describe('M09: Cross-Device Sync (chrome.storage.sync) Boundaries', () => {
    it('T2-V2-M09-01: Multi-byte UTF-8 (CJK and emoji) chunks each stay <= 6,144 UTF-8 bytes and within Chrome 8,192 B item quota', async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect((await bg.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);
        for (let i = 0; i < 45; i++) {
          const r = await bg.sendCommand({
            type: 'keyword.save',
            item: {
              id: `kw-utf8-${i}`,
              pattern: `中文测试词条🔥🚀_${i}_${'屏蔽垃圾内容'.repeat(25)}`,
              isRegex: false,
              scopes: ['text'],
              note: `多字节注释✨_${i}`,
              enabled: true,
            },
          });
          expect(r.ok).toBe(true);
        }

        const pushRes = await bg.sendCommand({ type: 'cloudSync.pushNow' });
        expect(pushRes.ok).toBe(true);

        const { meta, payload } = reconstructSyncedPayload(bg.chromeEnv.syncStore);
        expect(meta.chunks).toBeGreaterThanOrEqual(2);
        for (let i = 0; i < meta.chunks; i++) {
          const key = `kxc_sync_chunk_${i}`;
          const val = String(bg.chromeEnv.syncStore[key]);
          expect(Buffer.byteLength(val, 'utf8')).toBeLessThanOrEqual(6144);
          expect(computeChromeStorageItemBytes(key, val)).toBeLessThanOrEqual(
            CHROME_SYNC_QUOTA_BYTES_PER_ITEM
          );
        }
        const synced = (payload.config ?? payload) as any;
        expect(synced.rules.keywords.items[0].pattern).toContain('中文测试词条🔥🚀');
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M09-02: Oversized config (> 90,000 B) degrades gracefully on cloudSync.pushNow without corrupting local storage', async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect((await bg.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);

        // Build ~100 KB valid config via 65 valid keywords (~1,550 bytes each)
        for (let i = 0; i < 65; i++) {
          const r = await bg.sendCommand({
            type: 'keyword.save',
            item: {
              id: `kw-big-${i}`,
              pattern: `big_pat_${i}_${'a'.repeat(950)}`,
              isRegex: false,
              scopes: ['text'],
              note: `big_note_${i}_${'b'.repeat(550)}`,
              enabled: true,
            },
          });
          expect(r.ok).toBe(true);
        }

        const beforeLocal = await bg.sendCommand<any>({ type: 'state.get' });
        const pushRes = await bg.sendCommand({ type: 'cloudSync.pushNow' });
        const afterState = await bg.sendCommand<any>({ type: 'state.get' });

        // Either pushRes reports error OR cloudSync meta records quota_exceeded/error
        expect(afterState.data.cloudSync).toBeDefined();
        const degraded =
          !pushRes.ok ||
          afterState.data.cloudSync?.status === 'quota_exceeded' ||
          afterState.data.cloudSync?.status === 'error' ||
          Boolean(afterState.data.cloudSync?.error);
        expect(degraded).toBe(true);

        // Local storage must remain 100% intact!
        expect(afterState.data.config.rules.keywords.items).toHaveLength(
          beforeLocal.data.config.rules.keywords.items.length
        );
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M09-03: Shrinking synced config from >= 3 chunks back to 1 chunk removes stale kxc_sync_chunk_1+ keys', async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect((await bg.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);

        const addedIds: string[] = [];
        for (let i = 0; i < 85; i++) {
          const id = `kw-shrink-${i}`;
          addedIds.push(id);
          expect(
            (
              await bg.sendCommand({
                type: 'keyword.save',
                item: {
                  id,
                  pattern: `shrink_pat_${i}_${'z'.repeat(130)}`,
                  isRegex: false,
                  scopes: ['text'],
                  enabled: true,
                },
              })
            ).ok
          ).toBe(true);
        }
        expect((await bg.sendCommand({ type: 'cloudSync.pushNow' })).ok).toBe(true);
        expect((bg.chromeEnv.syncStore['kxc_sync_meta_v1'] as any).chunks).toBeGreaterThanOrEqual(
          3
        );

        // Shrink back to empty keywords via config.replace
        const curState = await bg.sendCommand<any>({ type: 'state.get' });
        const shrunkCfg = structuredClone(curState.data.config);
        shrunkCfg.rules.keywords.items = [];
        expect(
          (
            await bg.sendCommand({
              type: 'config.replace',
              config: shrunkCfg,
              expected: JSON.stringify(curState.data.config),
            })
          ).ok
        ).toBe(true);

        expect((await bg.sendCommand({ type: 'cloudSync.pushNow' })).ok).toBe(true);
        const metaAfter = bg.chromeEnv.syncStore['kxc_sync_meta_v1'] as any;
        expect(metaAfter.chunks).toBe(1);
        expect(bg.chromeEnv.syncStore['kxc_sync_chunk_0']).toBeDefined();
        expect(bg.chromeEnv.syncStore['kxc_sync_chunk_1']).toBeUndefined();
        expect(bg.chromeEnv.syncStore['kxc_sync_chunk_2']).toBeUndefined();
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M09-04: cloudSync.resolve strategy local overwrites remote with local synced fields while keeping local-only lists off sync', async () => {
      const bgA = await bootBackgroundHarness();
      let remoteSyncDump: Record<string, unknown> = {};
      try {
        expect(
          (await bgA.sendCommand({ type: 'config.preset', preset: 'light' })).ok
        ).toBe(true);
        expect((await bgA.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);
        remoteSyncDump = structuredClone(bgA.chromeEnv.syncStore);
      } finally {
        await bgA.cleanup();
      }

      const bgB = await bootBackgroundHarness({ sync: remoteSyncDump });
      try {
        expect(
          (await bgB.sendCommand({ type: 'config.preset', preset: 'strict' })).ok
        ).toBe(true);
        expect(
          (
            await bgB.sendCommand({
              type: 'account.save',
              list: 'black',
              entry: { uid: '99001122', screenName: 'stay_local', addedAt: 1_700_000_000_000 },
            })
          ).ok
        ).toBe(true);
        expect((await bgB.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);
        expect(
          (await bgB.sendCommand({ type: 'cloudSync.resolve', strategy: 'local' })).ok
        ).toBe(true);

        const { payload } = reconstructSyncedPayload(bgB.chromeEnv.syncStore);
        const synced = (payload.config ?? payload) as Record<string, unknown>;
        expect(synced.preset).toBe('strict');
        expect('localBlocklistUids' in synced).toBe(false);
        expect('whitelistUids' in synced).toBe(false);
      } finally {
        await bgB.cleanup();
      }
    });

    it('T2-V2-M09-05: Echo suppression prevents storage.onChanged with matching deviceId/sha256 from triggering redundant sync pushes', async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect((await bg.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);
        await bg.flush(30);

        const meta = structuredClone(bg.chromeEnv.syncStore['kxc_sync_meta_v1']);
        expect(meta).toBeDefined();
        const writesBefore = bg.chromeEnv.counters.syncSetCalls;
        const localWritesBefore = bg.chromeEnv.counters.localSetCalls;

        // Re-emit identical sync meta (same deviceId & sha256)
        bg.chromeEnv.simulateRemoteSyncWrite({ kxc_sync_meta_v1: meta });
        await bg.flush(40);

        expect(bg.chromeEnv.counters.localSetCalls).toBe(localWritesBefore);
        expect(bg.chromeEnv.counters.syncSetCalls).toBe(writesBefore);
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M09-06: Corrupt or truncated remote chunks fail safely without corrupting chrome.storage.local', async () => {
      const modelMod = await requireModule<Record<string, unknown>>(
        'apps/extension/src/services/model.ts',
        'extension services model'
      );
      const UI_KEYS = requireExport<Record<string, string>>(modelMod, 'UI_KEYS', 'model.ts');
      expect(UI_KEYS.cloudSync).toBe('kxc_cloud_sync_v1');

      const bg = await bootBackgroundHarness({
        sync: {
          kxc_sync_meta_v1: {
            v: 1,
            chunks: 2,
            sha256: '0'.repeat(64),
            updatedAt: Date.now(),
            deviceId: 'remote-corrupt-dev',
          },
          kxc_sync_chunk_0: '{"broken_json":',
          // kxc_sync_chunk_1 intentionally missing!
        },
      });
      try {
        expect(
          (
            await bg.sendCommand({
              type: 'keyword.save',
              item: { id: 'kw-safe-local', pattern: 'must_survive', isRegex: false, scopes: ['text'], enabled: true },
            })
          ).ok
        ).toBe(true);
        const before = await bg.sendCommand<any>({ type: 'state.get' });

        const enableRes = await bg.sendCommand({ type: 'cloudSync.enable' });
        await bg.flush(30);

        const after = await bg.sendCommand<any>({ type: 'state.get' });
        expect(after.data.cloudSync).toBeDefined();
        expect(after.data.cloudSync.pendingRemote).toBeUndefined();
        const reportedCorruption =
          !enableRes.ok ||
          after.data.cloudSync.status === 'error' ||
          Boolean(after.data.cloudSync.error);
        expect(reportedCorruption).toBe(true);
        expect(after.data.config.rules.keywords.items).toEqual(
          before.data.config.rules.keywords.items
        );
      } finally {
        await bg.cleanup();
      }
    });
  });

  // =========================================================================
  // M10: Per-Rule Stats, 7-Day dailyHistory & Battle Report Boundaries — 5 Tests
  // =========================================================================
  describe('M10: Per-Rule Stats, 7-Day dailyHistory & Battle Report Boundaries', () => {
    it('T2-V2-M10-01: Appending logs across 10 calendar days prunes dailyHistory to trailing <= 7 ascending calendar days', async () => {
      const bg = await bootBackgroundHarness();
      try {
        // Construct 10 distinct local calendar days ending today at local noon
        const todayNoon = new Date();
        todayNoon.setHours(12, 0, 0, 0);
        const dayMs = 86_400_000;
        const dates: string[] = [];

        for (let offset = 9; offset >= 0; offset--) {
          const d = new Date(todayNoon.getTime() - offset * dayMs);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          dates.push(dateStr);

          expect(
            (
              await bg.sendCommand({
                type: 'logs.append',
                entries: [
                  {
                    id: `day-${offset}`,
                    tweetId: String(910000 + offset),
                    authorUid: String(1000 + offset),
                    authorScreenName: `u_${offset}`,
                    authorName: `User ${offset}`,
                    tweetSnippet: `Spam on ${dateStr}`,
                    scene: 'timeline',
                    ruleId: 'reply_spam',
                    reasonText: 'Spam',
                    timestamp: d.getTime(),
                  },
                ],
              })
            ).ok
          ).toBe(true);
        }

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        const history = state.data.stats.dailyHistory as Array<{
          date: string;
          blocked: number;
          ads: number;
        }>;
        expect(Array.isArray(history)).toBe(true);
        expect(history.length).toBeLessThanOrEqual(7);
        expect(history.length).toBeGreaterThanOrEqual(1);

        // Strictly ascending ISO dates
        for (let i = 1; i < history.length; i++) {
          expect(history[i].date > history[i - 1].date).toBe(true);
        }
        // Oldest 3 days pruned
        for (const oldDate of dates.slice(0, 3)) {
          expect(history.some((h) => h.date === oldDate)).toBe(false);
        }
        // Today preserved
        expect(history[history.length - 1].date).toBe(dates[dates.length - 1]);
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M10-02: Duplicate tweetId replay does NOT double-count dailyHistory/byRule and logs.clear preserves stats', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const entry = {
          id: 'dup-log-1',
          tweetId: '920001',
          authorUid: '2001',
          authorScreenName: 'dup_bot',
          authorName: 'Dup Bot',
          tweetSnippet: 'Duplicate tweet replay',
          scene: 'reply',
          ruleId: 'grok_filter',
          reasonText: 'Short grok mention',
          timestamp: Date.now(),
        };

        expect((await bg.sendCommand({ type: 'logs.append', entries: [entry] })).ok).toBe(true);
        expect(
          (
            await bg.sendCommand({
              type: 'logs.append',
              entries: [{ ...entry, id: 'dup-log-2' }],
            })
          ).ok
        ).toBe(true);

        const st1 = await bg.sendCommand<any>({ type: 'state.get' });
        expect(st1.data.stats.totalBlocked).toBe(1);
        expect(st1.data.stats.byRule.grok_filter).toBe(1);
        expect(Array.isArray(st1.data.stats.dailyHistory)).toBe(true);
        expect(st1.data.stats.dailyHistory[st1.data.stats.dailyHistory.length - 1].blocked).toBe(1);

        expect((await bg.sendCommand({ type: 'logs.clear' })).ok).toBe(true);
        const st2 = await bg.sendCommand<any>({ type: 'state.get' });
        expect(st2.data.logs).toHaveLength(0);
        expect(st2.data.stats.totalBlocked).toBe(1);
        expect(st2.data.stats.byRule.grok_filter).toBe(1);
        expect(st2.data.stats.dailyHistory.length).toBeGreaterThanOrEqual(1);
      } finally {
        await bg.cleanup();
      }
    });

    it('T2-V2-M10-03: Zero-hit empty state renders HistoryPage and Battle Report Canvas cleanly without NaN', async () => {
      const loadHistory = async () => {
        const mod = await requireModule<{ HistoryPage: any }>(
          'apps/extension/src/features/history/HistoryPage.tsx',
          'HistoryPage'
        );
        return mod.HistoryPage;
      };

      const mounted = await mountExtensionComponent(
        loadHistory,
        makeHistoryUiState({
          stats: {
            todayDate: formatLocalDateOffset(0),
            todayBlocked: 0,
            totalBlocked: 0,
            todayAdsHidden: 0,
            totalAdsHidden: 0,
            byRule: {},
            dailyHistory: [],
          },
          logs: [],
        })
      );
      try {
        expect(mounted.container.textContent ?? '').not.toContain('NaN');
        await triggerBattleReportRender(mounted);
        expect(mounted.canvasRecorder.canvases.length).toBeGreaterThanOrEqual(1);
        expect(mounted.canvasRecorder.allText).not.toContain('NaN');
        expect(mounted.canvasRecorder.allText.toLowerCase()).toContain('keepxclean.com');
      } finally {
        await mounted.cleanup();
      }
    },
    { timeout: 10000 }
    );

    it('T2-V2-M10-04: Battle Report Canvas contains ZERO PII canary handles, UIDs, or tweet snippets', async () => {
      const loadHistory = async () => {
        const mod = await requireModule<{ HistoryPage: any }>(
          'apps/extension/src/features/history/HistoryPage.tsx',
          'HistoryPage'
        );
        return mod.HistoryPage;
      };

      const mounted = await mountExtensionComponent(
        loadHistory,
        makeHistoryUiState({
          logs: [
            {
              id: 'pii-1',
              tweetId: '9988776655',
              authorUid: '99887766554433',
              authorScreenName: 'secret_victim_handle',
              authorName: 'Secret Victim Name',
              tweetSnippet: 'SECRET_DM_TEXT_CANARY_999',
              scene: 'reply',
              ruleId: 'reply_spam',
              reasonText: 'Duplicate reply spam',
              timestamp: 1_764_000_000_000,
            },
          ],
        })
      );
      try {
        await triggerBattleReportRender(mounted);
        expect(mounted.canvasRecorder.texts.length).toBeGreaterThan(0);
        const allText = mounted.canvasRecorder.allText;
        expect(allText).toContain('88');
        expect(allText).not.toContain('secret_victim_handle');
        expect(allText).not.toContain('Secret Victim Name');
        expect(allText).not.toContain('99887766554433');
        expect(allText).not.toContain('SECRET_DM_TEXT_CANARY_999');
      } finally {
        await mounted.cleanup();
      }
    },
    { timeout: 10000 }
    );

    it('T2-V2-M10-05: Battle Report Canvas enforces light-theme background and valid SUT-emitted PNG export', async () => {
      const loadHistory = async () => {
        const mod = await requireModule<{ HistoryPage: any }>(
          'apps/extension/src/features/history/HistoryPage.tsx',
          'HistoryPage'
        );
        return mod.HistoryPage;
      };

      const mounted = await mountExtensionComponent(loadHistory, makeHistoryUiState());
      try {
        await triggerBattleReportRender(mounted);
        expect(mounted.canvasRecorder.canvases.length).toBeGreaterThanOrEqual(1);

        // Largest filled background rect (or manual rounded-rect path fill) must be genuinely light-theme
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

        // Verify SUT requested image/png with non-zero dimensions and emitted valid PNG header bytes
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
            .find((b): b is Blob =>
              Boolean(b && typeof (b as Blob).arrayBuffer === 'function')
            );
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
          const emittedBlob =
            deliveredUrlBlob ?? deliveredClipboardBlob ?? blobCalls[0].blob;
          expect(emittedBlob).toBeDefined();
          expect(emittedBlob.type).toBe('image/png');
          const bytes = new Uint8Array(await emittedBlob.arrayBuffer());
          expect([...bytes.subarray(0, 8)]).toEqual([...PNG_MAGIC_BYTES]);
          verifiedEmittedPng = true;
        }
        if (dataUrlCalls.length > 0) {
          const dataUrl = dataUrlCalls[0].dataUrl;
          expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
          const buf = Buffer.from(
            dataUrl.slice('data:image/png;base64,'.length),
            'base64'
          );
          expect([...buf.subarray(0, 8)]).toEqual([...PNG_MAGIC_BYTES]);
          verifiedEmittedPng = true;
        }
        expect(verifiedEmittedPng).toBe(true);
      } finally {
        await mounted.cleanup();
      }
    },
    { timeout: 10000 }
    );
  });

  // =========================================================================
  // M11: Parse Health Self-Check & Maintainer CLI Boundaries — 7 Tests
  // =========================================================================
  describe('M11: Parse Health Self-Check & Maintainer CLI Boundaries', () => {
    it('T2-V2-M11-01: Exactly 4 consecutive 0-tweet core payloads over 20s do NOT emit degraded, while the 5th DOES', async () => {
      const pi = await bootPageInterceptorHarness({ startTimeMs: 1_700_000_000_000 });
      try {
        for (let i = 0; i < 4; i++) {
          if (i > 0) pi.advanceNow(7000); // 0s, 7s, 14s, 21s (span 21s >= 15s, count = 4 < 5)
          await pi.sendGraphqlFetch(
            GRAPHQL_URLS.forYou,
            buildEmptyCoreGraphqlPayload('HomeTimeline')
          );
        }
        expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(false);

        pi.advanceNow(1000); // 5th zero-tweet payload at 22s
        await pi.sendGraphqlFetch(
          GRAPHQL_URLS.forYou,
          buildEmptyCoreGraphqlPayload('HomeTimeline')
        );
        expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(true);
      } finally {
        pi.cleanup();
      }
    });

    it('T2-V2-M11-02: 5 consecutive 0-tweet core payloads within < 15s do NOT emit degraded, while a 6th at >= 15s DOES', async () => {
      const pi = await bootPageInterceptorHarness({ startTimeMs: 1_700_000_000_000 });
      try {
        for (let i = 0; i < 5; i++) {
          if (i > 0) pi.advanceNow(2000); // 0s, 2s, 4s, 6s, 8s (span 8s < 15s)
          await pi.sendGraphqlFetch(
            GRAPHQL_URLS.following,
            buildEmptyCoreGraphqlPayload('HomeLatestTimeline')
          );
        }
        expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(false);

        pi.advanceNow(8000); // now at 16s >= 15s
        await pi.sendGraphqlFetch(
          GRAPHQL_URLS.following,
          buildEmptyCoreGraphqlPayload('HomeLatestTimeline')
        );
        expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(true);
      } finally {
        pi.cleanup();
      }
    });

    it('T2-V2-M11-03: GraphQL { errors }, malformed JSON, and non-core ops do NOT trigger degraded (paired with positive control)', async () => {
      const pi = await bootPageInterceptorHarness({ startTimeMs: 1_700_000_000_000 });
      try {
        // 1. GraphQL errors payloads
        for (let i = 0; i < 6; i++) {
          pi.advanceNow(4000);
          await pi.sendGraphqlFetch(GRAPHQL_URLS.forYou, {
            errors: [{ message: 'Rate limit exceeded', code: 88 }],
          });
        }
        // 2. Malformed JSON payloads
        for (let i = 0; i < 6; i++) {
          pi.advanceNow(4000);
          await pi.sendGraphqlFetch(GRAPHQL_URLS.forYou, '{not valid json', { rawText: true });
        }
        // 3. Non-core GraphQL ops
        for (let i = 0; i < 6; i++) {
          pi.advanceNow(4000);
          await pi.sendGraphqlFetch(
            'https://x.com/i/api/graphql/xyz/UserByScreenName',
            { data: { user: { result: {} } } }
          );
        }
        expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(false);

        // Positive control: 5 real core empty payloads over >= 15s DO emit degraded
        for (let i = 0; i < 5; i++) {
          pi.advanceNow(4000);
          await pi.sendGraphqlFetch(
            GRAPHQL_URLS.search,
            buildEmptyCoreGraphqlPayload('SearchTimeline')
          );
        }
        expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(true);
      } finally {
        pi.cleanup();
      }
    });

    it('T2-V2-M11-04: 100%-filtered valid payload (all 3 tweets stripped) reports extractedTweetCount=3 and prevents degraded', async () => {
      const config = Shared.createDefaultConfig('standard');
      config.interceptionMode = 'strip';
      config.rules.keywords.items = [
        { id: 'kw-strip-3', pattern: 'strip_all_three', isRegex: false, scopes: ['text'], enabled: true },
      ];

      const payload = buildHomeTimelinePayload([
        buildGraphqlTweetEntry({
          tweetId: '11401',
          text: 'Tweet one strip_all_three',
          author: { restId: '1401', screenName: 'a1401' },
        }),
        buildGraphqlTweetEntry({
          tweetId: '11402',
          text: 'Tweet two strip_all_three',
          author: { restId: '1402', screenName: 'a1402' },
        }),
        buildGraphqlTweetEntry({
          tweetId: '11403',
          text: 'Tweet three strip_all_three',
          author: { restId: '1403', screenName: 'a1403' },
        }),
      ]);
      const direct = Shared.processGraphqlResponsePayload(
        structuredClone(payload),
        GRAPHQL_URLS.forYou,
        '/home',
        config
      ) as any;
      expect(direct.extractedTweetCount).toBe(3);

      const pi = await bootPageInterceptorHarness({
        startTimeMs: 1_700_000_000_000,
        config,
      });
      try {
        for (let i = 0; i < 6; i++) {
          pi.advanceNow(4000);
          await pi.sendGraphqlFetch(GRAPHQL_URLS.forYou, structuredClone(payload));
        }
        expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(false);

        // Positive control: 5 truly empty core payloads over >= 15s DO trigger degraded,
        // and a single 100%-filtered valid payload then auto-recovers back to ok!
        for (let i = 0; i < 5; i++) {
          pi.advanceNow(4000);
          await pi.sendGraphqlFetch(
            GRAPHQL_URLS.forYou,
            buildEmptyCoreGraphqlPayload('HomeTimeline')
          );
        }
        expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(true);

        pi.advanceNow(2000);
        await pi.sendGraphqlFetch(GRAPHQL_URLS.forYou, structuredClone(payload));
        const lastHealth = pi.healthEvents[pi.healthEvents.length - 1];
        expect(lastHealth?.status).toBe('ok');
      } finally {
        pi.cleanup();
      }
    });

    it('T2-V2-M11-05: KXC_PARSE_HEALTH redacts all PII canaries (handles, cookies, tokens, URL query vars) from event payload', async () => {
      const pi = await bootPageInterceptorHarness({ startTimeMs: 1_700_000_000_000 });
      try {
        const dirtyUrl = `${GRAPHQL_URLS.forYou}?variables=SECRET_UID_888999&ct0=SECRET_CT0_TOKEN`;
        const dirtyPayload = buildEmptyCoreGraphqlPayload('HomeTimeline', {
          home_v2_renamed: {
            secretHandle: '@secret_handle_xyz',
            cookieLeak: 'ct0=SECRET_COOKIE_VAL',
            authHeader: 'Bearer SECRET_BEARER_XYZ',
          },
        });

        for (let i = 0; i < 5; i++) {
          if (i > 0) pi.advanceNow(4000);
          await pi.sendGraphqlFetch(dirtyUrl, dirtyPayload);
        }

        const degraded = pi.healthEvents.find((e) => e.status === 'degraded');
        expect(degraded).toBeDefined();

        const serialized = JSON.stringify(degraded);
        expect(serialized).toContain('HomeTimeline');
        expect(serialized).toContain('home_v2_renamed');
        expect(serialized).not.toContain('secret_handle_xyz');
        expect(serialized).not.toContain('SECRET_UID_888999');
        expect(serialized).not.toContain('SECRET_CT0_TOKEN');
        expect(serialized).not.toContain('SECRET_COOKIE_VAL');
        expect(serialized).not.toContain('SECRET_BEARER_XYZ');
      } finally {
        pi.cleanup();
      }
    });

    it(
      'T2-V2-M11-06: Maintainer CLI cloud-rules.ts accepts valid --file fixture and rejects bad regex, duplicate ID, and invalid langGroup with validation errors',
      async () => {
        requireFile('apps/server/scripts/cloud-rules.ts', 'maintainer cloud-rules CLI');
        const rootPkg = JSON.parse(requireFile('package.json')) as {
          scripts?: Record<string, string>;
        };
        const baseArgs = parseCliPushBaseArgs(rootPkg.scripts ?? {});
        const dryRunBase = baseArgs.includes('--dry-run')
          ? baseArgs
          : [...baseArgs, '--dry-run'];
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kxc-cli-neg-'));
        try {
          // Positive control: valid temp manifest via --file MUST exit 0 (proves --file is honored)
          const validFp = path.join(tmpDir, 'valid.json');
          fs.writeFileSync(
            validFp,
            JSON.stringify(
              {
                version: 1,
                rules: [
                  {
                    id: 'valid-cli-probe-1',
                    pattern: 'valid_cli_probe_token',
                    isRegex: false,
                    scopes: ['text'],
                    langGroup: 'en',
                    note: 'Positive control rule',
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

          const cases: Array<{
            name: string;
            content: unknown;
            expectedErrorRe: RegExp;
          }> = [
            {
              name: 'bad-regex.json',
              expectedErrorRe: /(regex|regexp|regular expression|pattern|syntax|invalid)/i,
              content: {
                version: 1,
                rules: [
                  {
                    id: 'bad-rx-1',
                    pattern: '[unclosed_group',
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
              expectedErrorRe: /(duplicate|dup-rule-1|unique|already)/i,
              content: {
                version: 1,
                rules: [
                  {
                    id: 'dup-rule-1',
                    pattern: 'spam_a',
                    isRegex: false,
                    scopes: ['text'],
                    langGroup: 'en',
                    enabled: true,
                  },
                  {
                    id: 'dup-rule-1',
                    pattern: 'spam_b',
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
              expectedErrorRe: /(langgroup|lang_group|lang|group|locale|\bxx\b|unsupported|invalid)/i,
              content: {
                version: 1,
                rules: [
                  {
                    id: 'bad-lang-1',
                    pattern: 'spam_c',
                    isRegex: false,
                    scopes: ['text'],
                    langGroup: 'xx',
                    enabled: true,
                  },
                ],
              },
            },
          ];

          for (const tc of cases) {
            const fp = path.join(tmpDir, tc.name);
            fs.writeFileSync(fp, JSON.stringify(tc.content, null, 2), 'utf8');
            const res = await runTsxCli(
              'apps/server/scripts/cloud-rules.ts',
              [...dryRunBase, '--file', fp],
              { timeoutMs: 12_000 }
            );
            expect(res.timedOut).toBe(false);
            expect(res.exitCode).not.toBe(0);
            const combinedOut = `${res.stderr}\n${res.stdout}`.trim();
            expect(combinedOut.length).toBeGreaterThan(0);
            expect(combinedOut).not.toMatch(
              /unknown\s+(option|flag|argument)|unrecognized\s+(option|flag)|ENOENT|no such file/i
            );
            expect(combinedOut).toMatch(tc.expectedErrorRe);
          }
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      },
      { timeout: 30000 }
    );

    it('T2-V2-M11-07: Server exposes ZERO public admin HTTP routes (404) alongside applied 0004 migration', async () => {
      const d1 = createSqliteD1Adapter();
      try {
        await applyServerMigrations(d1, { requireMigration0004: true });
        const serverMod = await requireModule<{ app: any }>(
          'apps/server/src/index.ts',
          'Cloudflare Worker server'
        );

        const adminProbes: Array<{ method: string; path: string }> = [
          { method: 'POST', path: '/v1/admin/cloud-keywords' },
          { method: 'POST', path: '/v1/cloud-keywords' },
          { method: 'PUT', path: '/v1/admin/rules' },
          { method: 'DELETE', path: '/v1/cloud-keywords/cloud-nsfw-bio-1' },
        ];
        for (const p of adminProbes) {
          const res = await serverMod.app.request(
            `https://api.keepxclean.com${p.path}`,
            { method: p.method, body: JSON.stringify({}), headers: { 'content-type': 'application/json' } },
            { DB: d1 }
          );
          expect(res.status).toBe(404);
        }
      } finally {
        d1.close();
      }
    });
  });

  // =========================================================================
  // M12: Website v0.2.0, 10-Locale Parity, Brand & Permissions Boundaries — 6 Tests
  // =========================================================================
  describe('M12: Website v0.2.0, 10-Locale Parity, Brand & Permissions Boundaries', () => {
    it('T2-V2-M12-01: Zero stale 0.1.2 version strings across all 10 web locales, HeroSandbox.tsx, sampleData.ts, config.ts, and config.test.ts', () => {
      const localeFiles = Shared.SUPPORTED_LOCALES.map(
        (loc) => `apps/web/src/locales/${loc}.ts`
      );
      const runtimeTargets = [
        ...localeFiles,
        'apps/web/src/components/HeroSandbox/HeroSandbox.tsx',
        'apps/web/src/components/HeroSandbox/sampleData.ts',
        'apps/web/src/config.ts',
      ];
      for (const rel of runtimeTargets) {
        const src = requireFile(rel);
        const staleMatches = src.match(/(?:^|[^0-9.])0\.1\.2(?![0-9])/g) ?? [];
        expect({ file: rel, staleMatches }).toEqual({ file: rel, staleMatches: [] });
      }

      // Validate config.test.ts via TypeScript AST: require a genuine non-negated,
      // non-commented `expect(CURRENT_VERSION, ...).toBe|toEqual|toStrictEqual('v0.2.0')`
      // assertion and zero stale `0.1.2` / `v0.1.2` literals outside legitimate
      // `expect(...).not.<matcher>(...)` anti-regression guards.
      const configTestSrc = requireFile('apps/web/tests/config.test.ts');
      const configTestCheck = validateVersionTestFileNoStale012(
        configTestSrc,
        'apps/web/tests/config.test.ts'
      );
      expect(configTestCheck.hasPositiveV020Assertion).toBe(true);
      expect(configTestCheck.staleHits).toEqual([]);
      expect(configTestCheck.valid).toBe(true);
    });

    it('T2-V2-M12-02: wxt.config.ts strictly keeps permissions [storage, alarms], Firefox Gecko ID, and extension version 0.2.0', () => {
      const wxtSrc = requireFile('apps/extension/wxt.config.ts');
      const permMatch = wxtSrc.match(/permissions\s*:\s*\[([^\]]*)\]/);
      expect(permMatch).not.toBeNull();
      const perms = [...permMatch![1].matchAll(/['"]([^'"]+)['"]/g)]
        .map((m) => m[1])
        .sort();
      expect(perms).toEqual(['alarms', 'storage']);
      expect(wxtSrc).not.toMatch(/clipboardWrite|['"]tabs['"]|['"]scripting['"]/);
      expect(wxtSrc).toContain('keepxclean@keepxclean.com');

      const extPkg = JSON.parse(requireFile('apps/extension/package.json')) as {
        version?: string;
      };
      expect(extPkg.version).toBe('0.2.0');
    });

    it('T2-V2-M12-03: AGENTS.md brand compliance across apps/web/src (no Lucide Shield*, no forbidden CSS tokens, 512x512 logo.svg, v0.2.0)', async () => {
      const webCfg = await requireModule<{ CURRENT_VERSION?: string }>(
        'apps/web/src/config.ts',
        'web config'
      );
      expect(webCfg.CURRENT_VERSION).toBe('v0.2.0');

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

      const logoSvg = requireFile('apps/web/public/logo.svg');
      const validation = validateBrandLogoSvg(logoSvg);
      expect(validation.valid).toBe(true);
      expect(validation.width).toBe(512);
      expect(validation.height).toBe(512);
    });

    it('T2-V2-M12-04: privacyContent.ts keeps exact 5-row permission table and discloses device-local blocklist retention alongside storage.sync', async () => {
      const privacyMod = await requireModule<{ PRIVACY_CONTENT: Record<string, any> }>(
        'apps/web/src/data/privacyContent.ts',
        'web privacy content'
      );

      for (const lang of ['en', 'zh-CN'] as const) {
        const content = privacyMod.PRIVACY_CONTENT[lang];
        expect(content.sec4Rows).toHaveLength(5);
        const row0 = JSON.stringify(content.sec4Rows[0]);
        const full = JSON.stringify(content);
        expect(row0).toContain('storage');
        expect(/storage\.sync/i.test(full)).toBe(true);
        expect(/(local|device|本机|本地)/i.test(full)).toBe(true);
      }
    });

    it('T2-V2-M12-05: summarizeRule produces non-empty localized summaries for all 11 FilterRulesConfig keys across all 10 locales', async () => {
      const rulesMod = await requireModule<{
        summarizeRule: (key: string, config: any, cloudKeywords: any[]) => string;
      }>('apps/extension/src/features/rules/RulesPage.tsx', 'RulesPage');
      const i18nState = await requireModule<{
        setActiveLocaleSetting: (locale: string) => void;
      }>('apps/extension/src/i18n/state.ts', 'extension i18n state');

      const allRuleKeys = [
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
      const cfg = Shared.createDefaultConfig('standard');
      cfg.rules.languageFilter.enabled = true;
      const summariesByRule = new Map<string, Map<string, string>>();

      try {
        for (const locale of Shared.SUPPORTED_LOCALES) {
          const localizedCfg = { ...cfg, locale };
          i18nState.setActiveLocaleSetting(locale);
          for (const rk of allRuleKeys) {
            const summary = rulesMod.summarizeRule(
              rk,
              localizedCfg,
              Shared.DEFAULT_CLOUD_KEYWORDS
            );
            expect(typeof summary).toBe('string');
            expect(summary.trim().length).toBeGreaterThan(0);
            if (!summariesByRule.has(rk)) summariesByRule.set(rk, new Map());
            summariesByRule.get(rk)!.set(locale, summary);
          }
        }
        // Guard against silent fallback to 'en' (e.g. config.locale left at 'auto')
        for (const rk of ['replySpam', 'grokFilter', 'domainFilter'] as const) {
          const byLoc = summariesByRule.get(rk)!;
          expect(byLoc.get('zh-CN')).not.toBe(byLoc.get('en'));
          expect(byLoc.get('ja')).not.toBe(byLoc.get('en'));
          expect(new Set(byLoc.values()).size).toBeGreaterThanOrEqual(5);
        }
      } finally {
        i18nState.setActiveLocaleSetting('auto');
      }
    },
    { timeout: 10000 }
    );

    it('T2-V2-M12-06: All 10 Chrome MV3 _locales messages.json <= 132 chars and extension LOCALES/ERROR_LOCALES cover all 16 ruleLabels with zero empty strings', async () => {
      const chromeDirs = [
        'en',
        'zh_CN',
        'zh_TW',
        'ja',
        'ko',
        'es',
        'pt_BR',
        'fr',
        'de',
        'ru',
      ];
      for (const dir of chromeDirs) {
        const msgPath = `apps/extension/public/_locales/${dir}/messages.json`;
        const bundle = JSON.parse(requireFile(msgPath)) as Record<
          string,
          { message?: string }
        >;
        const desc = bundle.extDescription?.message ?? '';
        expect(desc.trim().length).toBeGreaterThan(0);
        expect(desc.length).toBeLessThanOrEqual(132);
      }

      const coreMod = await requireModule<{
        LOCALES: Record<string, Record<string, any>>;
        ERROR_LOCALES: Record<string, Record<string, any>>;
      }>('apps/extension/src/i18n/core.ts', 'extension i18n core');

      const expected16RuleIds = [
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

      const checkNoEmptyStrings = (obj: unknown) => {
        if (typeof obj === 'string') {
          expect(obj.trim().length).toBeGreaterThan(0);
          return;
        }
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          for (const val of Object.values(obj as Record<string, unknown>)) {
            checkNoEmptyStrings(val);
          }
        }
      };

      for (const locale of Shared.SUPPORTED_LOCALES) {
        const loc = coreMod.LOCALES[locale];
        const err = coreMod.ERROR_LOCALES[locale];
        expect(loc).toBeDefined();
        expect(err).toBeDefined();
        checkNoEmptyStrings(loc);
        checkNoEmptyStrings(err);

        const labels = loc.history?.ruleLabels ?? {};
        for (const id of expected16RuleIds) {
          expect(typeof labels[id]).toBe('string');
          expect(labels[id].trim().length).toBeGreaterThan(0);
        }
      }
    });
  });
});
