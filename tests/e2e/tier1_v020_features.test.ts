/**
 * Tier 1 (v0.2.0): Isolated Feature Coverage E2E Test Suite (M01 – M12)
 *
 * 70 genuine, opaque-box, requirement-driven happy-path tests (>= 5 per M01–M12)
 * derived strictly from ORIGINAL_REQUEST.md, PROJECT.md, v0.2.0_plan.md, and AGENTS.md.
 *
 * Parallel-safe: all v0.2.0 symbols/files are loaded lazily inside each `it(...)`
 * via `requireExport` / `requireModule` / `requireFile` so missing contracts fail
 * with crisp per-test AssertionErrors without crashing suite discovery.
 */

import * as Shared from '@keepxclean/shared';
import { describe, it, expect, setTestTier } from './harness';
import { createVirtualBrowser } from './fixtures/browser-env';
import {
  GRAPHQL_URLS,
  requireExport,
  requireModule,
  requireFile,
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
  triggerBattleReportRender,
} from './fixtures/v020-helpers';

setTestTier(1);

const sharedMod = Shared as unknown as Record<string, unknown>;

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
  expect(meta!.v).toBe(1);
  expect(typeof meta!.chunks).toBe('number');
  expect(meta!.chunks).toBeGreaterThanOrEqual(1);
  let joined = '';
  for (let i = 0; i < meta!.chunks; i++) {
    const chunkKey = `kxc_sync_chunk_${i}`;
    const chunk = syncStore[chunkKey];
    expect(typeof chunk).toBe('string');
    joined += chunk as string;
  }
  return { meta: meta!, payload: JSON.parse(joined) as Record<string, any> };
}

function formatLocalDateOffset(daysAgo: number): string {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const d = new Date(noon.getTime() - daysAgo * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeBaseUiState(
  configOverrides: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const config = {
    ...(Shared.createDefaultConfig('standard') as unknown as Record<string, unknown>),
    locale: 'en',
    theme: 'light',
    ...configOverrides,
  };
  return {
    config,
    snapshot: Shared.createDefaultCrowdSnapshot(),
    stats: {
      todayDate: formatLocalDateOffset(0),
      todayBlocked: 15,
      totalBlocked: 42,
      todayAdsHidden: 3,
      totalAdsHidden: 9,
      byRule: {
        reply_spam: 25,
        grok_filter: 10,
        domain_filter: 7,
      },
      dailyHistory: [
        { date: formatLocalDateOffset(6), blocked: 4, ads: 1 },
        { date: formatLocalDateOffset(5), blocked: 5, ads: 1 },
        { date: formatLocalDateOffset(4), blocked: 6, ads: 2 },
        { date: formatLocalDateOffset(3), blocked: 3, ads: 0 },
        { date: formatLocalDateOffset(2), blocked: 4, ads: 1 },
        { date: formatLocalDateOffset(1), blocked: 5, ads: 1 },
        { date: formatLocalDateOffset(0), blocked: 15, ads: 3 },
      ],
    },
    sync: { status: 'idle', source: 'builtin' },
    logs: [
      {
        id: 'log-1',
        tweetId: '70001',
        authorUid: '50001',
        authorScreenName: 'spam_reply_bot',
        authorName: 'Spam Reply Bot',
        tweetSnippet: 'Repeated reply spam snippet',
        scene: 'reply',
        ruleId: 'reply_spam',
        reasonText: 'Duplicate reply spam',
        timestamp: 1_764_000_100_000,
      },
      {
        id: 'log-2',
        tweetId: '70002',
        authorUid: '50002',
        authorScreenName: 'grok_summoner',
        authorName: 'Grok Summoner',
        tweetSnippet: '@grok explain this',
        scene: 'reply',
        ruleId: 'grok_filter',
        reasonText: 'Short @grok mention',
        timestamp: 1_764_000_200_000,
      },
      {
        id: 'log-3',
        tweetId: '70003',
        authorUid: '50003',
        authorScreenName: 'funnel_spammer',
        authorName: 'Funnel Spammer',
        tweetSnippet: 'Join pump.fun launch now',
        scene: 'timeline',
        ruleId: 'domain_filter',
        reasonText: 'Blocked external domain pump.fun',
        timestamp: 1_764_000_300_000,
      },
    ],
    operations: [],
    imports: [],
    ...extra,
  };
}

describe('Tier 1 (v0.2.0): Feature Coverage (M01 – M12)', () => {
  // =========================================================================
  // M01: Grok Filter (rules.grokFilter) — 6 Tests
  // =========================================================================
  describe('M01: Grok Interaction Control (rules.grokFilter)', () => {
    it('T1-V2-M01-01: OFFICIAL_GROK_UID and isOfficialGrokAuthor match official @grok by restId and handle', () => {
      const uid = requireExport<string>(sharedMod, 'OFFICIAL_GROK_UID', '@keepxclean/shared');
      const isOfficialGrokAuthor = requireExport<
        (author: { restId?: string; screenName?: string } | null | undefined) => boolean
      >(sharedMod, 'isOfficialGrokAuthor', '@keepxclean/shared');

      expect(uid).toBe('1720665183188922368');
      expect(
        isOfficialGrokAuthor({ restId: '1720665183188922368', screenName: 'renamed_handle' })
      ).toBe(true);
      expect(isOfficialGrokAuthor({ restId: '42', screenName: 'Grok' })).toBe(true);
      expect(isOfficialGrokAuthor({ restId: '42', screenName: 'grok' })).toBe(true);
      expect(isOfficialGrokAuthor(makeOfficialGrokAuthor())).toBe(true);
      expect(isOfficialGrokAuthor(makeLookalikeGrokAuthor())).toBe(false);
    });

    it('T1-V2-M01-02: Preset definitions and createDefaultConfig set exact grokFilter defaults across all 3 presets', () => {
      const light = Shared.createDefaultConfig('light') as any;
      const standard = Shared.createDefaultConfig('standard') as any;
      const strict = Shared.createDefaultConfig('strict') as any;

      for (const cfg of [light, standard, strict]) {
        expect(cfg.rules.grokFilter).toBeDefined();
        expect(cfg.rules.grokFilter.enabled).toBe(true);
        expect(cfg.rules.grokFilter.protectOfficialGrok).toBe(true);
        expect(cfg.rules.grokFilter.hideGrokReplies).toBe(false);
        expect(cfg.rules.grokFilter.maxMentionWeightedLength).toBe(16);
      }
      expect(light.rules.grokFilter.blockShortMentions).toBe(false);
      expect(standard.rules.grokFilter.blockShortMentions).toBe(false);
      expect(strict.rules.grokFilter.blockShortMentions).toBe(true);

      const defs = Shared.PRESET_DEFINITIONS as Record<string, any>;
      expect(defs.light.rules.grokFilter.blockShortMentions).toBe(false);
      expect(defs.standard.rules.grokFilter.blockShortMentions).toBe(false);
      expect(defs.strict.rules.grokFilter.blockShortMentions).toBe(true);
    });

    it('T1-V2-M01-03: protectOfficialGrok exempts @grok from highFrequency daily, sliding window, and replySpam', () => {
      const config = Shared.createDefaultConfig('strict') as any;
      expect(config.rules.grokFilter?.protectOfficialGrok).toBe(true);

      // Use followersCount: 100 so highFrequency.maxFollowersExempt cannot mask protection
      const grokAuthor = makeOfficialGrokAuthor({
        followersCount: 100,
        dailyTweetRate: 2000,
        statusesCount: 730_000,
      });

      const windowTracker = new Shared.SlidingWindowTracker();
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        windowTracker.recordAndCount(grokAuthor.restId, String(1000 + i), 3, now);
      }

      const dailyDecision = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '20001',
          text: 'Here is a comprehensive factual explanation of your question.',
          scene: 'timeline',
          author: grokAuthor,
        }),
        config,
        null,
        windowTracker
      );
      expect(dailyDecision.blocked).toBe(false);
      expect(dailyDecision.action).toBe('allow');

      const shortReplyDecision = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '20002',
          text: 'Yes.',
          scene: 'reply',
          isReply: true,
          inReplyToTweetId: '99999',
          focalTweetId: '99999',
          author: grokAuthor,
        }),
        config,
        null,
        windowTracker
      );
      expect(shortReplyDecision.blocked).toBe(false);
      expect(shortReplyDecision.action).toBe('allow');
    });

    it('T1-V2-M01-04: protectOfficialGrok exempts @grok from high-frequency risk badges in evaluateAuthorProfile', () => {
      const config = Shared.createDefaultConfig('strict') as any;
      expect(config.rules.grokFilter?.protectOfficialGrok).toBe(true);

      const grokAuthor = makeOfficialGrokAuthor({
        followersCount: 100,
        dailyTweetRate: 2000,
        statusesCount: 730_000,
      });
      const profileEval = Shared.evaluateAuthorProfile(grokAuthor, config, null);
      expect(profileEval.riskBadges).toHaveLength(0);
      expect(profileEval.primaryRuleId).toBeUndefined();
    });

    it('T1-V2-M01-05: blockShortMentions (strict) intercepts short @grok reply summons with ruleId grok_filter and matchedTarget', () => {
      const config = Shared.createDefaultConfig('strict') as any;
      expect(config.rules.grokFilter?.blockShortMentions).toBe(true);

      // '@grok explain this' -> after removing '@grok', 'explain this' has weighted length 11 (10 <= 11 <= 16)
      const decision = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '20005',
          text: '@grok explain this',
          scene: 'reply',
          isReply: true,
          inReplyToTweetId: '88888',
          focalTweetId: '88888',
          focalAuthor: { restId: '777777', screenName: 'thread_op', name: 'Thread OP' },
          author: makeExtractedAuthor({ restId: '333333', screenName: 'random_replier' }),
        }),
        config
      ) as any;

      expect(decision.blocked).toBe(true);
      expect(decision.ruleId).toBe('grok_filter');
      expect(decision.matchedTarget).toBeDefined();
      expect(decision.matchedTarget.kind).toBe('rule');
      expect(String(decision.matchedTarget.id)).toMatch(/^(grokFilter|grok_filter)$/);
    });

    it('T1-V2-M01-06: hideGrokReplies opt-in hides official @grok replies even when protectOfficialGrok is true', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      expect(config.rules.grokFilter).toBeDefined();
      config.rules.grokFilter.protectOfficialGrok = true;
      config.rules.grokFilter.hideGrokReplies = true;

      // Low-rate official @grok so ONLY hideGrokReplies can intercept it
      const lowRateGrok = makeOfficialGrokAuthor({
        dailyTweetRate: 2,
        statusesCount: 730,
        followersCount: 5_000_000,
      });
      const decision = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '20006',
          text: 'Based on publicly available records, the answer is straightforward and verifiable.',
          scene: 'reply',
          isReply: true,
          inReplyToTweetId: '88888',
          focalTweetId: '88888',
          author: lowRateGrok,
        }),
        config
      );

      expect(decision.blocked).toBe(true);
      expect(decision.ruleId).toBe('grok_filter');
    });
  });

  // =========================================================================
  // M02: Same-Thread Duplicate Reply Spam (blockDuplicateReplies) — 5 Tests
  // =========================================================================
  describe('M02: Same-Thread Duplicate Reply Spam (blockDuplicateReplies)', () => {
    it('T1-V2-M02-01: rules.replySpam.blockDuplicateReplies defaults to false in light and true in standard/strict', () => {
      const light = Shared.createDefaultConfig('light') as any;
      const standard = Shared.createDefaultConfig('standard') as any;
      const strict = Shared.createDefaultConfig('strict') as any;

      expect(light.rules.replySpam.blockDuplicateReplies).toBe(false);
      expect(standard.rules.replySpam.blockDuplicateReplies).toBe(true);
      expect(strict.rules.replySpam.blockDuplicateReplies).toBe(true);
    });

    it('T1-V2-M02-02: normalizeReplyForDedup strips mentions, URLs, punctuation, whitespace and computes NFKC weightedLength', () => {
      const normalizeReplyForDedup = requireExport<
        (raw: string) => { normalized: string; weightedLength: number }
      >(sharedMod, 'normalizeReplyForDedup', '@keepxclean/shared');

      const latin = normalizeReplyForDedup(
        '@alice Check https://example.com/path Hello, World!!'
      );
      expect(latin.normalized).toBe('checkhelloworld');
      expect(latin.weightedLength).toBe(15);

      const cjk = normalizeReplyForDedup('@bob 你好，世界！这是一个测试 https://t.co/abc');
      expect(cjk.normalized).not.toContain('@bob');
      expect(cjk.normalized).not.toContain('http');
      expect(cjk.normalized).not.toContain(' ');
      expect(cjk.normalized).not.toContain('，');
      expect(cjk.weightedLength).toBe(20);
    });

    it('T1-V2-M02-03: ThreadDuplicateTracker keeps first reply and flags subsequent replies from distinct authors until clear()', () => {
      const ThreadDuplicateTracker = requireExport<new () => any>(
        sharedMod,
        'ThreadDuplicateTracker',
        '@keepxclean/shared'
      );

      const tracker = new ThreadDuplicateTracker();
      const key = 'greatprojecttothemoon';
      expect(tracker.recordAndCheck('focal-1', 'tw-1', 'uid-1', key)).toBe(false);
      expect(tracker.recordAndCheck('focal-1', 'tw-2', 'uid-2', key)).toBe(true);
      expect(tracker.isDuplicate('focal-1', 'tw-2', 'uid-2', key)).toBe(true);
      expect(tracker.isDuplicate('focal-1', 'tw-1', 'uid-1', key)).toBe(false);

      tracker.clear();
      expect(tracker.recordAndCheck('focal-1', 'tw-3', 'uid-3', key)).toBe(false);
    });

    it('T1-V2-M02-04: evaluateTweet and processGraphqlResponsePayload keep 1st identical reply and block 2nd and 3rd from distinct UIDs', () => {
      const ThreadDuplicateTracker = requireExport<new () => any>(
        sharedMod,
        'ThreadDuplicateTracker',
        '@keepxclean/shared'
      );
      const config = Shared.createDefaultConfig('standard');
      const dupText = 'Amazing launch everyone should check out this milestone update';

      // Direct evaluateTweet with shared tracker
      const tracker = new ThreadDuplicateTracker();
      const focalAuthor = { restId: '100', screenName: 'op_handle', name: 'OP' };
      const r1 = (Shared.evaluateTweet as any)(
        makeExtractedTweet({
          tweetId: '501',
          text: dupText,
          scene: 'reply',
          isReply: true,
          inReplyToTweetId: '500',
          focalTweetId: '500',
          focalAuthor,
          author: makeExtractedAuthor({ restId: '201', screenName: 'bot_one' }),
        }),
        config,
        null,
        undefined,
        true,
        tracker
      );
      const r2 = (Shared.evaluateTweet as any)(
        makeExtractedTweet({
          tweetId: '502',
          text: dupText,
          scene: 'reply',
          isReply: true,
          inReplyToTweetId: '500',
          focalTweetId: '500',
          focalAuthor,
          author: makeExtractedAuthor({ restId: '202', screenName: 'bot_two' }),
        }),
        config,
        null,
        undefined,
        true,
        tracker
      );
      expect(r1.blocked).toBe(false);
      expect(r2.blocked).toBe(true);
      expect(r2.ruleId).toBe('reply_spam');

      // Full TweetDetail GraphQL payload flow
      const gqlTracker = new ThreadDuplicateTracker();
      const payload = buildTweetDetailPayload(
        {
          tweetId: '600',
          text: 'Original technical announcement post.',
          author: { restId: '100', screenName: 'op_handle' },
        },
        [
          { tweetId: '601', text: dupText, author: { restId: '301', screenName: 'army_a' } },
          { tweetId: '602', text: dupText, author: { restId: '302', screenName: 'army_b' } },
          { tweetId: '603', text: dupText, author: { restId: '303', screenName: 'army_c' } },
        ]
      );
      const result = (Shared.processGraphqlResponsePayload as any)(
        payload,
        GRAPHQL_URLS.tweetDetail,
        '/op_handle/status/600',
        config,
        null,
        undefined,
        gqlTracker
      );
      expect(result.decisionsByTweetId['601']?.decision.blocked).toBe(false);
      expect(result.decisionsByTweetId['602']?.decision.blocked).toBe(true);
      expect(result.decisionsByTweetId['602']?.decision.ruleId).toBe('reply_spam');
      expect(result.decisionsByTweetId['603']?.decision.blocked).toBe(true);
      expect(result.decisionsByTweetId['603']?.decision.ruleId).toBe('reply_spam');
    });

    it('T1-V2-M02-05: DomController maintains duplicate-reply parity collapsing 2nd identical reply and keeping 1st visible', async () => {
      const vb = createVirtualBrowser({
        url: 'https://x.com/op_handle/status/700',
        html: `<!DOCTYPE html><html><body>
          <main>
            <div data-testid="cellInnerDiv" id="cell-1">
              <article data-testid="tweet" id="art-1">
                <a href="/army_a/status/701"><time datetime="2026-11-25T00:00:00Z">1m</time></a>
              </article>
            </div>
            <div data-testid="cellInnerDiv" id="cell-2">
              <article data-testid="tweet" id="art-2">
                <a href="/army_b/status/702"><time datetime="2026-11-25T00:01:00Z">1m</time></a>
              </article>
            </div>
          </main>
        </body></html>`,
      });
      const restoreDom = installVirtualDomGlobals(vb);
      try {
        const { DomController } = await requireModule<{ DomController: new (css: string) => any }>(
          'apps/extension/src/content/dom-controller.ts',
          'DomController'
        );
        const config = Shared.createDefaultConfig('standard');
        const snapshot = Shared.createDefaultCrowdSnapshot();
        const controller = new DomController('');
        try {
          controller.update(config, snapshot);
          const dupText = 'Incredible breakthrough project check pinned post immediately';
          const focalAuthor = { restId: '100', screenName: 'op_handle', name: 'OP' };
          const t1 = makeExtractedTweet({
            tweetId: '701',
            text: dupText,
            scene: 'reply',
            isReply: true,
            inReplyToTweetId: '700',
            focalTweetId: '700',
            focalAuthor,
            author: makeExtractedAuthor({ restId: '401', screenName: 'army_a' }),
          });
          const t2 = makeExtractedTweet({
            tweetId: '702',
            text: dupText,
            scene: 'reply',
            isReply: true,
            inReplyToTweetId: '700',
            focalTweetId: '700',
            focalAuthor,
            author: makeExtractedAuthor({ restId: '402', screenName: 'army_b' }),
          });

          controller.ingest(
            { '701': { tweet: t1 }, '702': { tweet: t2 } },
            { army_a: { author: t1.author }, army_b: { author: t2.author } }
          );

          const art1 = vb.document.getElementById('art-1')!;
          const art2 = vb.document.getElementById('art-2')!;
          expect(art1.getAttribute('data-kxc-hidden')).toBeNull();
          expect(art2.getAttribute('data-kxc-hidden')).toBe('true');
          const collapseItems = controller
            .getSnapshot()
            .filter((i: { kind: string }) => i.kind === 'collapse');
          expect(collapseItems).toHaveLength(1);
        } finally {
          controller.dispose();
        }
      } finally {
        restoreDom();
        vb.cleanup();
      }
    });
  });

  // =========================================================================
  // M03: Structured External Domain Filter (rules.domainFilter) — 6 Tests
  // =========================================================================
  describe('M03: Structured External Domain Filter (rules.domainFilter)', () => {
    it('T1-V2-M03-01: Default domainFilter config and domain helper functions normalize, validate, extract, and match subdomains', () => {
      const normalizeDomainRule = requireExport<(raw: string) => string>(
        sharedMod,
        'normalizeDomainRule',
        '@keepxclean/shared'
      );
      const isValidDomainRule = requireExport<(domain: string) => boolean>(
        sharedMod,
        'isValidDomainRule',
        '@keepxclean/shared'
      );
      const extractHostnameFromUrl = requireExport<(rawUrl: string) => string | null>(
        sharedMod,
        'extractHostnameFromUrl',
        '@keepxclean/shared'
      );
      const matchesDomainRule = requireExport<(host: string, ruleDomain: string) => boolean>(
        sharedMod,
        'matchesDomainRule',
        '@keepxclean/shared'
      );

      const cfg = Shared.createDefaultConfig('standard') as any;
      expect(cfg.rules.domainFilter).toEqual({ enabled: true, items: [] });

      expect(normalizeDomainRule('https://www.Pump.Fun/coin')).toBe('pump.fun');
      expect(isValidDomainRule('pump.fun')).toBe(true);
      expect(extractHostnameFromUrl('https://sub.pump.fun/token?a=1')).toBe('sub.pump.fun');
      expect(matchesDomainRule('pump.fun', 'pump.fun')).toBe(true);
      expect(matchesDomainRule('app.pump.fun', 'pump.fun')).toBe(true);
    });

    it('T1-V2-M03-02: evaluateTweet blocks exact and subdomain URLs in tweet.urls with ruleId domain_filter and matchedTarget', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      expect(config.rules.domainFilter).toBeDefined();
      config.rules.domainFilter.items = [
        { id: 'dom-pump', domain: 'pump.fun', enabled: true },
      ];

      const exactDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '30001',
          text: 'Check out our newest community resource page here.',
          urls: ['https://pump.fun/launch'],
        }),
        config
      ) as any;
      expect(exactDec.blocked).toBe(true);
      expect(exactDec.ruleId).toBe('domain_filter');
      expect(exactDec.matchedTarget).toEqual({ kind: 'domain', id: 'dom-pump' });

      const subDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '30002',
          text: 'Visit our new web portal for details.',
          urls: ['https://app.pump.fun/pool'],
        }),
        config
      ) as any;
      expect(subDec.blocked).toBe(true);
      expect(subDec.ruleId).toBe('domain_filter');
      expect(subDec.matchedTarget).toEqual({ kind: 'domain', id: 'dom-pump' });
    });

    it('T1-V2-M03-03: evaluateTweet scans author.bioUrls and penetrates retweeted/quoted bioUrls with hit_uid evidence', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      expect(config.rules.domainFilter).toBeDefined();
      config.rules.domainFilter.items = [
        { id: 'dom-funnel', domain: 'funnel.example', enabled: true },
      ];

      const primaryDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '30003',
          text: 'Sharing my weekly update with everyone today.',
          author: makeExtractedAuthor({
            restId: '111111',
            bioUrls: ['https://go.funnel.example/join'],
          }),
        }),
        config
      );
      expect(primaryDec.blocked).toBe(true);
      expect(primaryDec.ruleId).toBe('domain_filter');

      const rtAuthor = makeExtractedAuthor({
        restId: '222222',
        screenName: 'rt_funnel_acct',
        bioUrls: ['https://vip.funnel.example/bio'],
      });
      const rtDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '30004',
          text: 'Interesting perspective worth reading carefully.',
          author: makeExtractedAuthor({ restId: '111112', screenName: 'clean_retweeter' }),
          retweetedAuthor: rtAuthor,
        }),
        config
      );
      expect(rtDec.blocked).toBe(true);
      expect(rtDec.ruleId).toBe('domain_filter');
      expect(rtDec.evidence?.some((e) => e.key === 'hit_uid' && e.value === '222222')).toBe(
        true
      );
    });

    it('T1-V2-M03-04: processGraphqlResponsePayload populates quotedUrls and blocks matching quoted domain with quotedAuthor hit_uid', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      expect(config.rules.domainFilter).toBeDefined();
      config.rules.domainFilter.items = [
        { id: 'dom-qt', domain: 'scamdrop.example', enabled: true },
      ];

      const payload = buildHomeTimelinePayload([
        buildGraphqlTweetEntry({
          tweetId: '30010',
          text: 'Quoting this thread for discussion purposes.',
          author: { restId: '9001', screenName: 'clean_quoter' },
          quotedTweet: {
            tweetId: '30011',
            text: 'Visit our site for the event details.',
            urls: ['https://claim.scamdrop.example/drop'],
            author: { restId: '9002', screenName: 'quoted_bad_actor' },
          },
        }),
      ]);

      const res = Shared.processGraphqlResponsePayload(
        payload,
        GRAPHQL_URLS.forYou,
        '/home',
        config
      );
      const entry = res.decisionsByTweetId['30010'] as any;
      expect(entry).toBeDefined();
      expect(entry.tweet.quotedUrls).toContain('https://claim.scamdrop.example/drop');
      expect(entry.decision.blocked).toBe(true);
      expect(entry.decision.ruleId).toBe('domain_filter');
      expect(
        entry.decision.evidence?.some(
          (e: { key: string; value: string }) => e.key === 'hit_uid' && e.value === '9002'
        )
      ).toBe(true);
    });

    it('T1-V2-M03-05: DomainRuleItem respects onlyInReplies and maxFollowersExempt thresholds', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      expect(config.rules.domainFilter).toBeDefined();
      config.rules.domainFilter.items = [
        {
          id: 'dom-reply-only',
          domain: 'replypromo.example',
          onlyInReplies: true,
          maxFollowersExempt: 5000,
          enabled: true,
        },
      ];

      const replyLowFollower = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '30020',
          text: 'Check out this link for more info.',
          scene: 'reply',
          isReply: true,
          urls: ['https://replypromo.example/offer'],
          author: makeExtractedAuthor({ restId: '6001', followersCount: 200 }),
        }),
        config
      );
      expect(replyLowFollower.blocked).toBe(true);
      expect(replyLowFollower.ruleId).toBe('domain_filter');

      const timelineTweet = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '30021',
          text: 'Check out this link for more info.',
          scene: 'timeline',
          isReply: false,
          urls: ['https://replypromo.example/offer'],
          author: makeExtractedAuthor({ restId: '6001', followersCount: 200 }),
        }),
        config
      );
      expect(timelineTweet.blocked).toBe(false);

      const replyHighFollower = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '30022',
          text: 'Check out this link for more info.',
          scene: 'reply',
          isReply: true,
          urls: ['https://replypromo.example/offer'],
          author: makeExtractedAuthor({ restId: '6002', followersCount: 10_000 }),
        }),
        config
      );
      expect(replyHighFollower.blocked).toBe(false);
    });

    it('T1-V2-M03-06: Extension background RPC domain.save and domain.delete persist and remove DomainRuleItem', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const saveRes = await bg.sendCommand({
          type: 'domain.save',
          item: {
            id: 'dom-rpc-1',
            domain: 'HTTPS://WWW.Pump.Fun/path',
            enabled: true,
            note: 'Memecoin launchpad',
          },
        });
        expect(saveRes.ok).toBe(true);

        const stateAfterSave = await bg.sendCommand<any>({ type: 'state.get' });
        expect(stateAfterSave.ok).toBe(true);
        const items = stateAfterSave.data.config.rules.domainFilter.items as any[];
        expect(items).toHaveLength(1);
        expect(items[0].id).toBe('dom-rpc-1');
        expect(items[0].domain).toBe('pump.fun');

        const delRes = await bg.sendCommand({
          type: 'domain.delete',
          id: 'dom-rpc-1',
          expected: JSON.stringify(items[0]),
        });
        expect(delRes.ok).toBe(true);

        const stateAfterDel = await bg.sendCommand<any>({ type: 'state.get' });
        expect(stateAfterDel.data.config.rules.domainFilter.items).toHaveLength(0);
      } finally {
        await bg.cleanup();
      }
    });
  });

  // =========================================================================
  // M04: 10-Language Public Keyword Packs & D1 0004 — 6 Tests
  // =========================================================================
  describe('M04: 10-Language Public Keyword Packs & D1 0004', () => {
    it('T1-V2-M04-01: CLOUD_KEYWORD_LANG_GROUPS has all 10 groups and DEFAULT_CLOUD_KEYWORDS has >= 2 valid rules per group', () => {
      const groups = requireExport<readonly string[]>(
        sharedMod,
        'CLOUD_KEYWORD_LANG_GROUPS',
        '@keepxclean/shared'
      );
      expect(groups).toEqual([
        'universal',
        'zh',
        'en',
        'ja',
        'ko',
        'es',
        'pt',
        'fr',
        'de',
        'ru',
      ]);

      expect(Shared.DEFAULT_CLOUD_KEYWORDS.length).toBeGreaterThan(24);
      const counts = new Map<string, number>();
      for (const rule of Shared.DEFAULT_CLOUD_KEYWORDS as Array<any>) {
        expect(typeof rule.langGroup).toBe('string');
        expect(groups).toContain(rule.langGroup);
        expect(() => new RegExp(rule.pattern, 'i')).not.toThrow();
        if (rule.enabled) {
          counts.set(rule.langGroup, (counts.get(rule.langGroup) ?? 0) + 1);
        }
      }
      for (const g of groups) {
        expect(counts.get(g) ?? 0).toBeGreaterThanOrEqual(2);
      }
    });

    it('T1-V2-M04-02: localeToCloudLangGroup maps all 10 locales and resolveEnabledCloudLangGroups defaults to universal+en+uiLangGroup', () => {
      const localeToCloudLangGroup = requireExport<(locale: string) => string>(
        sharedMod,
        'localeToCloudLangGroup',
        '@keepxclean/shared'
      );
      const resolveEnabledCloudLangGroups = requireExport<(config: any) => string[]>(
        sharedMod,
        'resolveEnabledCloudLangGroups',
        '@keepxclean/shared'
      );

      expect(localeToCloudLangGroup('en')).toBe('en');
      expect(localeToCloudLangGroup('zh-CN')).toBe('zh');
      expect(localeToCloudLangGroup('zh-TW')).toBe('zh');
      expect(localeToCloudLangGroup('ja')).toBe('ja');
      expect(localeToCloudLangGroup('ko')).toBe('ko');
      expect(localeToCloudLangGroup('es')).toBe('es');
      expect(localeToCloudLangGroup('pt')).toBe('pt');
      expect(localeToCloudLangGroup('fr')).toBe('fr');
      expect(localeToCloudLangGroup('de')).toBe('de');
      expect(localeToCloudLangGroup('ru')).toBe('ru');

      const jaCfg = Shared.createDefaultConfig('standard');
      jaCfg.locale = 'ja';
      const jaGroups = resolveEnabledCloudLangGroups(jaCfg);
      expect(jaGroups).toContain('universal');
      expect(jaGroups).toContain('en');
      expect(jaGroups).toContain('ja');
      expect(jaGroups).not.toContain('es');

      const zhCfg = Shared.createDefaultConfig('standard');
      zhCfg.locale = 'zh-CN';
      const zhGroups = resolveEnabledCloudLangGroups(zhCfg);
      expect(zhGroups).toContain('universal');
      expect(zhGroups).toContain('en');
      expect(zhGroups).toContain('zh');
    });

    it('T1-V2-M04-03: evaluateTweet activates cloud keywords strictly according to resolveEnabledCloudLangGroups', () => {
      requireExport(sharedMod, 'resolveEnabledCloudLangGroups', '@keepxclean/shared');
      const snapshot = Shared.createDefaultCrowdSnapshot();
      (snapshot.cloudKeywords as any[]).push({
        id: 'cloud-ja-pack-probe',
        pattern: '限定副業プロモーション',
        isRegex: false,
        scopes: ['text'],
        langGroup: 'ja',
        enabled: true,
        note: 'JA probe rule',
      });

      const tweet = makeExtractedTweet({
        tweetId: '40003',
        text: '今すぐ限定副業プロモーションに参加して収益を得ましょう',
        lang: 'ja',
      });

      const enCfg = Shared.createDefaultConfig('standard');
      enCfg.locale = 'en';
      const enDec = Shared.evaluateTweet(tweet, enCfg, snapshot);
      expect(enDec.blocked).toBe(false);

      const jaCfg = Shared.createDefaultConfig('standard');
      jaCfg.locale = 'ja';
      const jaDec = Shared.evaluateTweet(tweet, jaCfg, snapshot);
      expect(jaDec.blocked).toBe(true);
      expect(jaDec.ruleId).toBe('cloud_keyword');
    });

    it('T1-V2-M04-04: getCloudKeywordNote provides localized non-empty notes for all expanded DEFAULT_CLOUD_KEYWORDS across all 10 locales', () => {
      const groups = requireExport<readonly string[]>(
        sharedMod,
        'CLOUD_KEYWORD_LANG_GROUPS',
        '@keepxclean/shared'
      );
      expect(Shared.DEFAULT_CLOUD_KEYWORDS.length).toBeGreaterThan(24);
      const coveredGroups = new Set(
        (Shared.DEFAULT_CLOUD_KEYWORDS as Array<any>).map((k) => k.langGroup)
      );
      for (const g of groups) {
        expect(coveredGroups.has(g)).toBe(true);
      }

      for (const rule of Shared.DEFAULT_CLOUD_KEYWORDS) {
        for (const locale of Shared.SUPPORTED_LOCALES) {
          const note = Shared.getCloudKeywordNote(rule, locale);
          expect(typeof note).toBe('string');
          expect(note.trim().length).toBeGreaterThan(0);
          expect(note).not.toBe(rule.pattern);
        }
      }
    });

    it('T1-V2-M04-05: Extension background RPC cloudLangGroup.toggle enables and disables language groups in config', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const enableEs = await bg.sendCommand({
          type: 'cloudLangGroup.toggle',
          group: 'es',
          enabled: true,
        });
        expect(enableEs.ok).toBe(true);

        const state1 = await bg.sendCommand<any>({ type: 'state.get' });
        expect(state1.data.config.enabledCloudLangGroups).toContain('es');

        const disableEs = await bg.sendCommand({
          type: 'cloudLangGroup.toggle',
          group: 'es',
          enabled: false,
        });
        expect(disableEs.ok).toBe(true);

        const state2 = await bg.sendCommand<any>({ type: 'state.get' });
        expect(state2.data.config.enabledCloudLangGroups).not.toContain('es');
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M04-06: D1 migration 0004_cloud_keywords_lang_group.sql and /v1/snapshot.json emit langGroup per cloud keyword', async () => {
      const d1 = createSqliteD1Adapter();
      try {
        const applied = await applyServerMigrations(d1, { requireMigration0004: true });
        expect(applied.some((f) => f.startsWith('0004'))).toBe(true);

        await d1
          .prepare(
            `INSERT INTO cloud_keywords (id, pattern, is_regex, scopes, note, enabled, lang_group, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            'cloud-fr-hotfix-1',
            'gagnez\\s+crypto\\s+gratuit',
            1,
            JSON.stringify(['text']),
            'FR hotfix test',
            1,
            'fr',
            Date.now()
          )
          .run();

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
        const snapshot = (await res.json()) as { cloudKeywords: Array<Record<string, unknown>> };
        const frRule = snapshot.cloudKeywords.find((k) => k.id === 'cloud-fr-hotfix-1');
        expect(frRule).toBeDefined();
        expect(frRule!.langGroup).toBe('fr');
      } finally {
        d1.close();
      }
    });
  });

  // =========================================================================
  // M05: For You / Following Detection & Per-Scene Modes (sceneModes) — 6 Tests
  // =========================================================================
  describe('M05: For You / Following Detection & Per-Scene Modes (sceneModes)', () => {
    it('T1-V2-M05-01: detectTimelineFeedFromUrl maps HomeTimeline to for_you and HomeLatestTimeline to following', () => {
      const detectTimelineFeedFromUrl = requireExport<
        (graphqlUrl: string) => 'for_you' | 'following' | undefined
      >(sharedMod, 'detectTimelineFeedFromUrl', '@keepxclean/shared');

      expect(detectTimelineFeedFromUrl(GRAPHQL_URLS.forYou)).toBe('for_you');
      expect(detectTimelineFeedFromUrl(GRAPHQL_URLS.following)).toBe('following');
    });

    it('T1-V2-M05-02: processGraphqlResponsePayload stamps timelineFeed on HomeTimeline and HomeLatestTimeline tweets', () => {
      const config = Shared.createDefaultConfig('standard');
      const entry = buildGraphqlTweetEntry({
        tweetId: '50001',
        text: 'A standard timeline update about distributed systems.',
        author: { restId: '8001', screenName: 'eng_writer' },
      });

      const forYouRes = Shared.processGraphqlResponsePayload(
        buildHomeTimelinePayload([entry], 'for_you'),
        GRAPHQL_URLS.forYou,
        '/home',
        config
      );
      expect((forYouRes.decisionsByTweetId['50001']?.tweet as any)?.timelineFeed).toBe(
        'for_you'
      );

      const followingRes = Shared.processGraphqlResponsePayload(
        buildHomeTimelinePayload([entry], 'following'),
        GRAPHQL_URLS.following,
        '/home',
        config
      );
      expect((followingRes.decisionsByTweetId['50001']?.tweet as any)?.timelineFeed).toBe(
        'following'
      );
    });

    it('T1-V2-M05-03: sceneModes inherit follows global interceptionMode across all 4 scenes and non-default overrides survive validateConfig', async () => {
      const { validateConfig } = await requireModule<{
        validateConfig: (raw: unknown) => any;
      }>('apps/extension/src/services/validation.ts', 'extension config validator');

      const cfg = Shared.createDefaultConfig('standard') as any;
      cfg.interceptionMode = 'collapse';
      cfg.sceneModes = {
        for_you: 'inherit',
        following: 'inherit',
        reply: 'inherit',
        search: 'inherit',
      };
      cfg.rules.keywords.items = [
        {
          id: 'kw-scene-inherit',
          pattern: 'scene_inherit_probe',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        },
      ];

      const validated = validateConfig(cfg);
      expect(validated.sceneModes).toEqual(cfg.sceneModes);

      // Non-default sceneModes overrides MUST survive validateConfig verbatim (prevents silent drop to defaults)
      const customSceneModes = {
        for_you: 'strip',
        following: 'bypass',
        reply: 'collapse',
        search: 'inherit',
      } as const;
      const validatedCustom = validateConfig({
        ...cfg,
        sceneModes: { ...customSceneModes },
      });
      expect(validatedCustom.sceneModes).toEqual(customSceneModes);

      const scenes: Array<{ scene: 'timeline' | 'reply' | 'search'; feed?: 'for_you' | 'following' }> = [
        { scene: 'timeline', feed: 'for_you' },
        { scene: 'timeline', feed: 'following' },
        { scene: 'reply' },
        { scene: 'search' },
      ];
      for (const s of scenes) {
        const d1 = Shared.evaluateTweet(
          makeExtractedTweet({
            tweetId: `5003-${s.scene}-${s.feed ?? 'none'}`,
            text: 'Contains scene_inherit_probe payload.',
            scene: s.scene,
            isReply: s.scene === 'reply',
            timelineFeed: s.feed,
          }),
          validated
        );
        expect(d1.blocked).toBe(true);
        expect(d1.action).toBe('collapse');
      }

      validated.interceptionMode = 'strip';
      const dStrip = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '5003-strip',
          text: 'Contains scene_inherit_probe payload.',
          scene: 'timeline',
          timelineFeed: 'for_you',
        }),
        validated
      );
      expect(dStrip.blocked).toBe(true);
      expect(dStrip.action).toBe('strip');
    });

    it('T1-V2-M05-04: sceneModes for_you strip overrides global collapse and strips entry in GraphQL payload', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.interceptionMode = 'collapse';
      config.sceneModes = { for_you: 'strip' };
      config.rules.keywords.items = [
        {
          id: 'kw-strip-override',
          pattern: 'strip_me_on_for_you',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        },
      ];

      const direct = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '50004',
          text: 'This tweet has strip_me_on_for_you inside.',
          scene: 'timeline',
          timelineFeed: 'for_you',
        }),
        config
      );
      expect(direct.blocked).toBe(true);
      expect(direct.action).toBe('strip');

      const payload = buildHomeTimelinePayload([
        buildGraphqlTweetEntry({
          tweetId: '50004',
          text: 'This tweet has strip_me_on_for_you inside.',
          author: { restId: '8004', screenName: 'noisy_for_you' },
        }),
      ]);
      const res = Shared.processGraphqlResponsePayload(
        payload,
        GRAPHQL_URLS.forYou,
        '/home',
        config
      );
      expect(res.modified).toBe(true);
      const entries = (payload as any).data.home.home_timeline_urt.instructions[0].entries;
      expect(entries).toHaveLength(0);
    });

    it('T1-V2-M05-05: sceneModes reply collapse overrides global strip and retains TweetDetail entries', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.interceptionMode = 'strip';
      config.sceneModes = { reply: 'collapse' };
      config.rules.keywords.items = [
        {
          id: 'kw-reply-collapse',
          pattern: 'collapse_me_in_reply',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        },
      ];

      const payload = buildTweetDetailPayload(
        {
          tweetId: '50050',
          text: 'Focal post for reply mode test.',
          author: { restId: '8050', screenName: 'op_50' },
        },
        [
          {
            tweetId: '50051',
            text: 'This reply contains collapse_me_in_reply token.',
            author: { restId: '8051', screenName: 'replier_51' },
          },
        ]
      );

      const res = Shared.processGraphqlResponsePayload(
        payload,
        GRAPHQL_URLS.tweetDetail,
        '/op_50/status/50050',
        config
      );
      expect(res.decisionsByTweetId['50051']?.decision.blocked).toBe(true);
      expect(res.decisionsByTweetId['50051']?.decision.action).toBe('collapse');
      expect(res.modified).toBe(false);
    });

    it('T1-V2-M05-06: sceneModes following bypass skips heuristic rules on Following while blocking them on For You', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.sceneModes = { following: 'bypass' };
      config.rules.keywords.items = [
        {
          id: 'kw-bypass-check',
          pattern: 'bypass_heuristic_probe',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        },
      ];

      const followingDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '50060',
          text: 'Contains bypass_heuristic_probe text.',
          scene: 'timeline',
          timelineFeed: 'following',
        }),
        config
      );
      expect(followingDec.blocked).toBe(false);
      expect(followingDec.action).toBe('allow');

      const forYouDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '50061',
          text: 'Contains bypass_heuristic_probe text.',
          scene: 'timeline',
          timelineFeed: 'for_you',
        }),
        config
      );
      expect(forYouDec.blocked).toBe(true);
      expect(forYouDec.ruleId).toBe('keyword');
    });
  });

  // =========================================================================
  // M06: Collapse-Bar Deep-Link & One-Click target.disable — 6 Tests
  // =========================================================================
  describe('M06: Collapse-Bar Deep-Link & One-Click target.disable', () => {
    it('T1-V2-M06-01: evaluateTweet populates matchedTarget across keyword, cloud_keyword, domain, pack_item, and rule hits', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.locale = 'en';
      config.rules.keywords.items = [
        { id: 'kw-mt-1', pattern: 'mt_keyword_hit', isRegex: false, scopes: ['text'], enabled: true },
      ];
      expect(config.rules.domainFilter).toBeDefined();
      config.rules.domainFilter.items = [
        { id: 'dom-mt-1', domain: 'mt-domain.example', enabled: true },
      ];
      config.installedPacks = [
        {
          ...createValidKxcPackV1({ id: 'pack-mt-1' }),
          enabled: true,
          installedAt: 1_700_000_000_000,
        },
      ];

      const kwDec = Shared.evaluateTweet(
        makeExtractedTweet({ tweetId: '60001', text: 'This has mt_keyword_hit inside.' }),
        config
      ) as any;
      expect(kwDec.blocked).toBe(true);
      expect(kwDec.matchedTarget).toEqual({ kind: 'keyword', id: 'kw-mt-1' });

      const cloudDec = Shared.evaluateTweet(
        makeExtractedTweet({ tweetId: '60002', text: 'Check onlyfans.com/model link in bio.' }),
        config
      ) as any;
      expect(cloudDec.blocked).toBe(true);
      expect(cloudDec.matchedTarget?.kind).toBe('cloud_keyword');
      expect(cloudDec.matchedTarget?.id).toBe('cloud-nsfw-bio-1');

      const domDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '60003',
          text: 'Visit our partner portal today.',
          urls: ['https://mt-domain.example/landing'],
        }),
        config
      ) as any;
      expect(domDec.blocked).toBe(true);
      expect(domDec.matchedTarget).toEqual({ kind: 'domain', id: 'dom-mt-1' });

      const packDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '60004',
          text: 'Join our guaranteed 1000x moonshot alpha group!',
        }),
        config
      ) as any;
      expect(packDec.blocked).toBe(true);
      expect(packDec.ruleId).toBe('rule_pack');
      expect(packDec.matchedTarget).toEqual({
        kind: 'pack_item',
        id: 'pk-kw-1',
        packId: 'pack-mt-1',
      });

      const ruleDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '60005',
          text: 'High frequency spammer posting nonstop updates.',
          author: makeExtractedAuthor({
            restId: '66005',
            dailyTweetRate: 120,
            statusesCount: 12000,
            accountAgeDays: 100,
            followersCount: 50,
          }),
        }),
        config
      ) as any;
      expect(ruleDec.blocked).toBe(true);
      expect(ruleDec.matchedTarget?.kind).toBe('rule');
      expect(typeof ruleDec.matchedTarget?.id).toBe('string');
      expect(ruleDec.matchedTarget.id.length).toBeGreaterThan(0);
    });

    it('T1-V2-M06-02: Background RPC options.open encodes validated focus and tab query parameters in Options hash URL', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const res1 = await bg.sendCommand({
          type: 'options.open',
          page: 'rules',
          query: { focus: 'grokFilter' },
        });
        expect(res1.ok).toBe(true);
        const url1 = String(bg.chromeEnv.createdTabs[0]?.url ?? '');
        expect(url1).toContain('options.html#/rules?');
        const params1 = new URLSearchParams(url1.split('?')[1] ?? '');
        expect(params1.get('focus')).toBe('grokFilter');

        const updatedBefore2 = bg.chromeEnv.updatedTabs.length;
        const createdBefore2 = bg.chromeEnv.createdTabs.length;
        const res2 = await bg.sendCommand({
          type: 'options.open',
          page: 'keywords',
          query: { tab: 'domains', focus: 'dom-1' },
        });
        expect(res2.ok).toBe(true);
        const updatedUrl = bg.chromeEnv.updatedTabs
          .slice(updatedBefore2)
          .reverse()
          .find((u) => typeof u.props.url === 'string')?.props.url;
        const createdUrl =
          bg.chromeEnv.createdTabs.length > createdBefore2
            ? bg.chromeEnv.createdTabs[bg.chromeEnv.createdTabs.length - 1]?.url
            : undefined;
        const lastUrl = String(updatedUrl ?? createdUrl ?? '');
        expect(lastUrl).toContain('options.html#/keywords?');
        const params2 = new URLSearchParams(lastUrl.split('?')[1] ?? '');
        expect(params2.get('tab')).toBe('domains');
        expect(params2.get('focus')).toBe('dom-1');
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M06-03: Background RPC target.disable disables a custom keyword in place and restores tweet on re-evaluation', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const kw = {
          id: 'kw-disable-1',
          pattern: 'one_click_disable_me',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        };
        const saveRes = await bg.sendCommand({ type: 'keyword.save', item: kw });
        expect(saveRes.ok).toBe(true);

        const disRes = await bg.sendCommand({
          type: 'target.disable',
          target: { kind: 'keyword', id: 'kw-disable-1' },
        });
        expect(disRes.ok).toBe(true);

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        const found = state.data.config.rules.keywords.items.find(
          (k: any) => k.id === 'kw-disable-1'
        );
        expect(found).toBeDefined();
        expect(found.enabled).toBe(false);

        const dec = Shared.evaluateTweet(
          makeExtractedTweet({ tweetId: '60030', text: 'Testing one_click_disable_me recovery.' }),
          state.data.config
        );
        expect(dec.blocked).toBe(false);
        expect(dec.action).toBe('allow');
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M06-04: Background RPC target.disable disables cloud_keyword and domain items cleanly', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const saveDom = await bg.sendCommand({
          type: 'domain.save',
          item: { id: 'dom-dis-1', domain: 'disable-me.example', enabled: true },
        });
        expect(saveDom.ok).toBe(true);

        const disCloud = await bg.sendCommand({
          type: 'target.disable',
          target: { kind: 'cloud_keyword', id: 'cloud-nsfw-bio-1' },
        });
        expect(disCloud.ok).toBe(true);

        const disDom = await bg.sendCommand({
          type: 'target.disable',
          target: { kind: 'domain', id: 'dom-dis-1' },
        });
        expect(disDom.ok).toBe(true);

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        expect(state.data.config.disabledCloudKeywordIds).toContain('cloud-nsfw-bio-1');
        const domItem = state.data.config.rules.domainFilter.items.find(
          (d: any) => d.id === 'dom-dis-1'
        );
        expect(domItem).toBeDefined();
        expect(domItem.enabled).toBe(false);

        const dec = Shared.evaluateTweet(
          makeExtractedTweet({
            tweetId: '60040',
            text: 'Check onlyfans.com/user and our link.',
            urls: ['https://disable-me.example/page'],
          }),
          state.data.config
        );
        expect(dec.blocked).toBe(false);
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M06-05: Background RPC target.disable disables a single pack_item while sibling pack items stay active', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const pack = createValidKxcPackV1({ id: 'pack-dis-test' });
        const installRes = await bg.sendCommand({ type: 'pack.install', pack });
        expect(installRes.ok).toBe(true);

        const disRes = await bg.sendCommand({
          type: 'target.disable',
          target: { kind: 'pack_item', id: 'pk-kw-1', packId: 'pack-dis-test' },
        });
        expect(disRes.ok).toBe(true);

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        const installed = state.data.config.installedPacks.find(
          (p: any) => p.id === 'pack-dis-test'
        );
        expect(installed).toBeDefined();
        expect(installed.disabledItemIds).toContain('pk-kw-1');

        const disabledDec = Shared.evaluateTweet(
          makeExtractedTweet({
            tweetId: '60050',
            text: 'Guaranteed 1000x moonshot alpha signal.',
          }),
          state.data.config
        );
        expect(disabledDec.blocked).toBe(false);

        const siblingDec = Shared.evaluateTweet(
          makeExtractedTweet({
            tweetId: '60051',
            text: 'Hurry to claim free airdrop now before closing.',
          }),
          state.data.config
        );
        expect(siblingDec.blocked).toBe(true);
        expect(siblingDec.ruleId).toBe('rule_pack');
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M06-06: Live DomController restores collapsed article immediately after target.disable updates config', async () => {
      const bg = await bootBackgroundHarness();
      const vb = createVirtualBrowser({
        url: 'https://x.com/home',
        html: `<!DOCTYPE html><html><body>
          <main>
            <div data-testid="cellInnerDiv">
              <article data-testid="tweet" id="art-restore">
                <a href="/writer_restore/status/60060"><time datetime="2026-11-25T00:00:00Z">1m</time></a>
              </article>
            </div>
          </main>
        </body></html>`,
      });
      const restoreDom = installVirtualDomGlobals(vb);
      try {
        const saveRes = await bg.sendCommand({
          type: 'keyword.save',
          item: {
            id: 'kw-live-restore',
            pattern: 'restore_live_token',
            isRegex: false,
            scopes: ['text'],
            enabled: true,
          },
        });
        expect(saveRes.ok).toBe(true);

        const state1 = await bg.sendCommand<any>({ type: 'state.get' });
        const { DomController } = await requireModule<{ DomController: new (css: string) => any }>(
          'apps/extension/src/content/dom-controller.ts',
          'DomController'
        );
        const controller = new DomController('');
        try {
          controller.update(state1.data.config, state1.data.snapshot);
          const tweet = makeExtractedTweet({
            tweetId: '60060',
            text: 'Post mentioning restore_live_token right here.',
            author: makeExtractedAuthor({ restId: '6060', screenName: 'writer_restore' }),
          });
          controller.ingest(
            { '60060': { tweet } },
            { writer_restore: { author: tweet.author } }
          );

          const art = vb.document.getElementById('art-restore')!;
          expect(art.getAttribute('data-kxc-hidden')).toBe('true');
          expect(
            controller.getSnapshot().filter((i: { kind: string }) => i.kind === 'collapse')
          ).toHaveLength(1);

          const disRes = await bg.sendCommand({
            type: 'target.disable',
            target: { kind: 'keyword', id: 'kw-live-restore' },
          });
          expect(disRes.ok).toBe(true);

          const state2 = await bg.sendCommand<any>({ type: 'state.get' });
          controller.update(state2.data.config, state2.data.snapshot);
          expect(art.getAttribute('data-kxc-hidden')).toBeNull();
          expect(
            controller.getSnapshot().filter((i: { kind: string }) => i.kind === 'collapse')
          ).toHaveLength(0);
        } finally {
          controller.dispose();
        }
      } finally {
        restoreDom();
        vb.cleanup();
        await bg.cleanup();
      }
    });
  });

  // =========================================================================
  // M07: Privacy Defaults & First-Install Onboarding Card — 5 Tests
  // =========================================================================
  describe('M07: Privacy Defaults & First-Install Onboarding Card', () => {
    it('T1-V2-M07-01: createDefaultConfig sets syncNativeXBlock=false, enableCrowdReport=false, onboardingDismissed=true, version=1', () => {
      for (const preset of ['light', 'standard', 'strict'] as const) {
        const cfg = Shared.createDefaultConfig(preset) as any;
        expect(cfg.version).toBe(1);
        expect(cfg.syncNativeXBlock).toBe(false);
        expect(cfg.enableCrowdReport).toBe(false);
        expect(cfg.onboardingDismissed).toBe(true);
      }
    });

    it('T1-V2-M07-02: Fresh install initializeStorage writes onboardingDismissed=false and privacy flags false with zero auto-tabs', async () => {
      const bg = await bootBackgroundHarness();
      try {
        await bg.fireInstalled('install');
        expect(bg.chromeEnv.createdTabs).toHaveLength(0);

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        expect(state.ok).toBe(true);
        expect(state.data.config.onboardingDismissed).toBe(false);
        expect(state.data.config.syncNativeXBlock).toBe(false);
        expect(state.data.config.enableCrowdReport).toBe(false);
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M07-03: config.patch onboardingDismissed=true persists across state.get reads', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const initial = await bg.sendCommand<any>({ type: 'state.get' });
        expect(initial.data.config.onboardingDismissed).toBe(false);

        const patchRes = await bg.sendCommand({
          type: 'config.patch',
          patch: { onboardingDismissed: true },
        });
        expect(patchRes.ok).toBe(true);

        const after = await bg.sendCommand<any>({ type: 'state.get' });
        expect(after.data.config.onboardingDismissed).toBe(true);
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M07-04: Upgrading stored v0.1.2 config hydrates onboardingDismissed=true while preserving stored true privacy flags and zh lang group', async () => {
      const resolveEnabledCloudLangGroups = requireExport<(cfg: any) => string[]>(
        sharedMod,
        'resolveEnabledCloudLangGroups',
        '@keepxclean/shared'
      );
      const legacy = createLegacyV012ConfigFixture();
      const bg = await bootBackgroundHarness({
        local: { [Shared.STORAGE_KEYS.CONFIG]: legacy },
      });
      try {
        const state = await bg.sendCommand<any>({ type: 'state.get' });
        expect(state.ok).toBe(true);
        const cfg = state.data.config;
        expect(cfg.version).toBe(1);
        expect(cfg.onboardingDismissed).toBe(true);
        expect(cfg.syncNativeXBlock).toBe(true);
        expect(cfg.enableCrowdReport).toBe(true);
        expect(cfg.rules.keywords.items).toHaveLength(1);
        expect(Object.keys(cfg.localBlocklistUids)).toHaveLength(1);
        expect(cfg.localBlocklistUids['5544332211']).toBeDefined();
        expect(resolveEnabledCloudLangGroups(cfg)).toContain('zh');
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M07-05: Popup renders onboarding card inside .popup-body when onboardingDismissed=false and preserves header master switch first', async () => {
      const loadPopup = async () => {
        const mod = await requireModule<{ App?: any; default?: any }>(
          'apps/extension/entrypoints/popup/App.tsx',
          'Popup App'
        );
        return mod.App ?? mod.default;
      };

      const mountedOpen = await mountExtensionComponent(
        loadPopup,
        makeBaseUiState({ onboardingDismissed: false }),
        { url: 'chrome-extension://kxc-e2e-extension/popup.html' }
      );
      let openBodyButtonCount = 0;
      let openBodyTextLen = 0;
      try {
        const header = mountedOpen.document.querySelector('.popup-header');
        const body = mountedOpen.document.querySelector('.popup-body');
        expect(header).not.toBeNull();
        expect(body).not.toBeNull();

        const allSwitches = mountedOpen.document.querySelectorAll('button[role="switch"]');
        const headerSwitch = header!.querySelector('button[role="switch"]');
        expect(headerSwitch).not.toBeNull();
        expect(allSwitches[0]).toBe(headerSwitch);

        openBodyButtonCount = body!.querySelectorAll('button').length;
        openBodyTextLen = (body!.textContent ?? '').trim().length;
      } finally {
        await mountedOpen.cleanup();
      }

      const mountedDismissed = await mountExtensionComponent(
        loadPopup,
        makeBaseUiState({ onboardingDismissed: true }),
        { url: 'chrome-extension://kxc-e2e-extension/popup.html' }
      );
      try {
        const bodyDismissed = mountedDismissed.document.querySelector('.popup-body')!;
        const dismissedButtonCount = bodyDismissed.querySelectorAll('button').length;
        const dismissedTextLen = (bodyDismissed.textContent ?? '').trim().length;

        expect(openBodyButtonCount).toBeGreaterThan(dismissedButtonCount);
        expect(openBodyTextLen).toBeGreaterThan(dismissedTextLen);
      } finally {
        await mountedDismissed.cleanup();
      }
    },
    { timeout: 10000 }
    );
  });

  // =========================================================================
  // M08: Offline Shareable Topic Rule Packs (kxc-pack-v1) — 6 Tests
  // =========================================================================
  describe('M08: Offline Shareable Topic Rule Packs (kxc-pack-v1)', () => {
    it('T1-V2-M08-01: packs.ts exports RULE_PACK_FORMAT, validateRulePack, serializeRulePack with lossless round-trip', async () => {
      await requireModule('packages/shared/src/packs.ts', 'shared rule packs module');
      const RULE_PACK_FORMAT = requireExport<string>(
        sharedMod,
        'RULE_PACK_FORMAT',
        '@keepxclean/shared'
      );
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

      expect(RULE_PACK_FORMAT).toBe('kxc-pack-v1');
      const raw = createValidKxcPackV1();
      const validated = validateRulePack(raw);
      expect(validated.format).toBe('kxc-pack-v1');
      expect(validated.id).toBe(raw.id);
      expect(validated.keywords).toHaveLength(2);
      expect(validated.domains).toHaveLength(1);
      expect(validated.blockedUids).toHaveLength(1);

      const serialized = serializeRulePack(validated);
      const reparsed = validateRulePack(JSON.parse(serialized));
      expect(reparsed).toEqual(validated);
    });

    it('T1-V2-M08-02: evaluateTweet intercepts installedPacks keywords, domains, and blockedUids with rule_pack and matchedTarget', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.installedPacks = [
        {
          ...createValidKxcPackV1({ id: 'pack-eval-1' }),
          enabled: true,
          installedAt: 1_700_000_000_000,
        },
      ];

      const kwDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '80001',
          text: 'Join our guaranteed 1000x moonshot alpha call!',
        }),
        config
      ) as any;
      expect(kwDec.blocked).toBe(true);
      expect(kwDec.ruleId).toBe('rule_pack');
      expect(kwDec.matchedTarget).toEqual({
        kind: 'pack_item',
        id: 'pk-kw-1',
        packId: 'pack-eval-1',
      });

      const domDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '80002',
          text: 'Check out our newest token launch portal.',
          urls: ['https://app.pump-scam.example/mint'],
        }),
        config
      ) as any;
      expect(domDec.blocked).toBe(true);
      expect(domDec.ruleId).toBe('rule_pack');
      expect(domDec.matchedTarget).toEqual({
        kind: 'pack_item',
        id: 'pk-dom-1',
        packId: 'pack-eval-1',
      });

      const uidDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '80003',
          text: 'Normal looking tweet text from pack blocked author.',
          author: makeExtractedAuthor({ restId: '8877665544', screenName: 'pack_spam_bot' }),
        }),
        config
      ) as any;
      expect(uidDec.blocked).toBe(true);
      expect(uidDec.ruleId).toBe('rule_pack');
      expect(uidDec.matchedTarget?.kind).toBe('pack_item');
      expect(uidDec.matchedTarget?.packId).toBe('pack-eval-1');
    });

    it('T1-V2-M08-03: Setting pack.enabled=false pauses that pack while sibling enabled packs continue blocking', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.installedPacks = [
        {
          ...createValidKxcPackV1({ id: 'pack-paused' }),
          enabled: false,
          installedAt: 1_700_000_000_000,
        },
        {
          ...createValidKxcPackV1({
            id: 'pack-active',
            keywords: [
              {
                id: 'active-kw-1',
                pattern: 'active_pack_trigger_phrase',
                isRegex: false,
                scopes: ['text'],
                enabled: true,
              },
            ],
            domains: [],
            blockedUids: [],
          }),
          enabled: true,
          installedAt: 1_700_000_000_001,
        },
      ];

      const pausedDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '80030',
          text: 'Join our guaranteed 1000x moonshot alpha call!',
        }),
        config
      );
      expect(pausedDec.blocked).toBe(false);

      const activeDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '80031',
          text: 'Contains active_pack_trigger_phrase right here.',
        }),
        config
      );
      expect(activeDec.blocked).toBe(true);
      expect(activeDec.ruleId).toBe('rule_pack');
    });

    it('T1-V2-M08-04: pack.disabledItemIds disables only that item inside the pack while sibling items still block', () => {
      const config = Shared.createDefaultConfig('standard') as any;
      config.installedPacks = [
        {
          ...createValidKxcPackV1({ id: 'pack-partial' }),
          enabled: true,
          installedAt: 1_700_000_000_000,
          disabledItemIds: ['pk-kw-1'],
        },
      ];

      const disabledDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '80040',
          text: 'Guaranteed 1000x moonshot alpha signal.',
        }),
        config
      );
      expect(disabledDec.blocked).toBe(false);

      const siblingDec = Shared.evaluateTweet(
        makeExtractedTweet({
          tweetId: '80041',
          text: 'Visit our token page soon.',
          urls: ['https://pump-scam.example/drop'],
        }),
        config
      );
      expect(siblingDec.blocked).toBe(true);
      expect(siblingDec.ruleId).toBe('rule_pack');
    });

    it('T1-V2-M08-05: Background RPC pack.install and pack.toggle manage installedPacks without polluting personal rules', async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect(
          (
            await bg.sendCommand({
              type: 'keyword.save',
              item: {
                id: 'personal-kw-1',
                pattern: 'my_personal_word',
                isRegex: false,
                scopes: ['text'],
                enabled: true,
              },
            })
          ).ok
        ).toBe(true);

        const pack = createValidKxcPackV1({ id: 'pack-rpc-1' });
        const inst = await bg.sendCommand({ type: 'pack.install', pack });
        expect(inst.ok).toBe(true);

        const st1 = await bg.sendCommand<any>({ type: 'state.get' });
        expect(st1.data.config.installedPacks).toHaveLength(1);
        expect(st1.data.config.installedPacks[0].id).toBe('pack-rpc-1');
        expect(st1.data.config.installedPacks[0].enabled).toBe(true);
        // Personal lists strictly untouched
        expect(st1.data.config.rules.keywords.items).toHaveLength(1);
        expect(st1.data.config.rules.domainFilter.items).toHaveLength(0);
        expect(Object.keys(st1.data.config.localBlocklistUids)).toHaveLength(0);

        const tog = await bg.sendCommand({
          type: 'pack.toggle',
          id: 'pack-rpc-1',
          enabled: false,
        });
        expect(tog.ok).toBe(true);

        const st2 = await bg.sendCommand<any>({ type: 'state.get' });
        expect(st2.data.config.installedPacks[0].enabled).toBe(false);
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M08-06: Background RPC pack.uninstall cleanly removes pack with zero residue in installedPacks or personal rules', async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect(
          (
            await bg.sendCommand({
              type: 'keyword.save',
              item: {
                id: 'personal-keep',
                pattern: 'keep_personal_rule',
                isRegex: false,
                scopes: ['text'],
                enabled: true,
              },
            })
          ).ok
        ).toBe(true);
        const pack = createValidKxcPackV1({ id: 'pack-uninstall-1' });
        expect((await bg.sendCommand({ type: 'pack.install', pack })).ok).toBe(true);

        const uninst = await bg.sendCommand({
          type: 'pack.uninstall',
          id: 'pack-uninstall-1',
        });
        expect(uninst.ok).toBe(true);

        const st = await bg.sendCommand<any>({ type: 'state.get' });
        expect(st.data.config.installedPacks).toHaveLength(0);
        expect(st.data.config.rules.keywords.items).toHaveLength(1);
        expect(st.data.config.rules.keywords.items[0].id).toBe('personal-keep');
        expect(Object.keys(st.data.config.localBlocklistUids)).toHaveLength(0);
      } finally {
        await bg.cleanup();
      }
    });
  });

  // =========================================================================
  // M09: Optional Cross-Device Sync (chrome.storage.sync) — 6 Tests
  // =========================================================================
  describe('M09: Optional Cross-Device Sync (chrome.storage.sync)', () => {
    it('T1-V2-M09-01: UI_KEYS.cloudSync is kxc_cloud_sync_v1 and cross-device sync defaults OFF with zero sync writes', async () => {
      const modelMod = await requireModule<Record<string, unknown>>(
        'apps/extension/src/services/model.ts',
        'extension services model'
      );
      const UI_KEYS = requireExport<Record<string, string>>(modelMod, 'UI_KEYS', 'model.ts');
      expect(UI_KEYS.cloudSync).toBe('kxc_cloud_sync_v1');

      const bg = await bootBackgroundHarness();
      try {
        const state = await bg.sendCommand<any>({ type: 'state.get' });
        expect(state.ok).toBe(true);
        expect(state.data.cloudSync?.enabled).toBe(false);
        expect(Object.keys(bg.chromeEnv.syncStore)).toHaveLength(0);
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M09-02: cloudSync.enable on empty remote writes kxc_sync_meta_v1 and <= 6,144 B chunks to chrome.storage.sync', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const res = await bg.sendCommand({ type: 'cloudSync.enable' });
        expect(res.ok).toBe(true);

        const { meta, payload } = reconstructSyncedPayload(bg.chromeEnv.syncStore);
        expect(meta.sha256).toMatch(/^[a-f0-9]{64}$/i);
        expect(typeof meta.updatedAt).toBe('number');
        expect(typeof meta.deviceId).toBe('string');
        expect(meta.deviceId.length).toBeGreaterThan(0);

        for (let i = 0; i < meta.chunks; i++) {
          const chunk = String(bg.chromeEnv.syncStore[`kxc_sync_chunk_${i}`]);
          expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThanOrEqual(6144);
        }
        expect(payload).toBeDefined();

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        expect(state.data.cloudSync?.enabled).toBe(true);
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M09-03: Synced payload strictly includes allowlisted fields and excludes all 6 local-only fields', async () => {
      const localConfig = createLegacyV012ConfigFixture({
        customApiBaseUrl: 'https://private.internal.example',
        onboardingDismissed: false,
      });
      const bg = await bootBackgroundHarness({
        local: { [Shared.STORAGE_KEYS.CONFIG]: localConfig },
      });
      try {
        const res = await bg.sendCommand({ type: 'cloudSync.enable' });
        expect(res.ok).toBe(true);

        const { payload } = reconstructSyncedPayload(bg.chromeEnv.syncStore);
        const synced = (payload.config ?? payload) as Record<string, unknown>;
        expect(synced.preset).toBeDefined();
        expect(synced.rules).toBeDefined();
        expect(synced.locale).toBe('zh-CN');

        expect('localBlocklistUids' in synced).toBe(false);
        expect('whitelistUids' in synced).toBe(false);
        expect('syncNativeXBlock' in synced).toBe(false);
        expect('enableCrowdReport' in synced).toBe(false);
        expect('customApiBaseUrl' in synced).toBe(false);
        expect('onboardingDismissed' in synced).toBe(false);
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M09-04: cloudSync.pushNow chunks > 12 KB config across >= 3 chunks each <= 6,144 UTF-8 bytes', async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect((await bg.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);

        // Add enough keywords to exceed 12 KB serialized JSON
        for (let i = 0; i < 90; i++) {
          const r = await bg.sendCommand({
            type: 'keyword.save',
            item: {
              id: `kw-chunk-${i}`,
              pattern: `chunk_test_spam_pattern_${i}_${'x'.repeat(120)}`,
              isRegex: false,
              scopes: ['text', 'bio'],
              note: `Chunk boundary rule number ${i}`,
              enabled: true,
            },
          });
          expect(r.ok).toBe(true);
        }

        const pushRes = await bg.sendCommand({ type: 'cloudSync.pushNow' });
        expect(pushRes.ok).toBe(true);

        const { meta, payload } = reconstructSyncedPayload(bg.chromeEnv.syncStore);
        expect(meta.chunks).toBeGreaterThanOrEqual(3);
        for (let i = 0; i < meta.chunks; i++) {
          const chunk = String(bg.chromeEnv.syncStore[`kxc_sync_chunk_${i}`]);
          expect(Buffer.byteLength(chunk, 'utf8')).toBeLessThanOrEqual(6144);
        }
        const synced = (payload.config ?? payload) as any;
        expect(synced.rules.keywords.items.length).toBeGreaterThanOrEqual(90);
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M09-05: First-enable with existing remote data surfaces conflict and cloudSync.resolve applies remote/merge while preserving local-only lists', async () => {
      // Device A produces an authentic remote sync snapshot
      const bgA = await bootBackgroundHarness();
      let remoteSyncDump: Record<string, unknown> = {};
      try {
        expect(
          (await bgA.sendCommand({ type: 'config.preset', preset: 'strict' })).ok
        ).toBe(true);
        expect(
          (
            await bgA.sendCommand({
              type: 'keyword.save',
              item: {
                id: 'remote-kw-1',
                pattern: 'from_device_a',
                isRegex: false,
                scopes: ['text'],
                enabled: true,
              },
            })
          ).ok
        ).toBe(true);
        expect((await bgA.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);
        remoteSyncDump = structuredClone(bgA.chromeEnv.syncStore);
      } finally {
        await bgA.cleanup();
      }

      // Device B has its own local blocklist + local keyword + Device A's remote sync store
      const bgB = await bootBackgroundHarness({ sync: remoteSyncDump });
      try {
        expect(
          (
            await bgB.sendCommand({
              type: 'account.save',
              list: 'black',
              entry: {
                uid: '99887766',
                screenName: 'local_only_blocked',
                addedAt: 1_700_000_000_000,
              },
            })
          ).ok
        ).toBe(true);
        expect(
          (
            await bgB.sendCommand({
              type: 'keyword.save',
              item: {
                id: 'local-kw-b',
                pattern: 'from_device_b',
                isRegex: false,
                scopes: ['text'],
                enabled: true,
              },
            })
          ).ok
        ).toBe(true);

        const enableB = await bgB.sendCommand<any>({ type: 'cloudSync.enable' });
        expect(enableB.ok).toBe(true);

        const stateConflict = await bgB.sendCommand<any>({ type: 'state.get' });
        expect(
          stateConflict.data.cloudSync?.pendingRemote !== undefined ||
            stateConflict.data.cloudSync?.status === 'conflict'
        ).toBe(true);

        const mergeRes = await bgB.sendCommand({
          type: 'cloudSync.resolve',
          strategy: 'merge',
        });
        expect(mergeRes.ok).toBe(true);

        const afterMerge = await bgB.sendCommand<any>({ type: 'state.get' });
        const kwIds = afterMerge.data.config.rules.keywords.items.map((k: any) => k.id);
        expect(kwIds).toContain('remote-kw-1');
        expect(kwIds).toContain('local-kw-b');
        expect(afterMerge.data.config.localBlocklistUids['99887766']).toBeDefined();
      } finally {
        await bgB.cleanup();
      }
    });

    it('T1-V2-M09-06: cloudSync.disable turns sync off and stops subsequent config writes from touching chrome.storage.sync', async () => {
      const bg = await bootBackgroundHarness();
      try {
        expect((await bg.sendCommand({ type: 'cloudSync.enable' })).ok).toBe(true);
        expect((await bg.sendCommand({ type: 'cloudSync.disable' })).ok).toBe(true);

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        expect(state.data.cloudSync?.enabled).toBe(false);

        const setCallsBefore = bg.chromeEnv.counters.syncSetCalls;
        expect(
          (await bg.sendCommand({ type: 'config.patch', patch: { theme: 'dark' } })).ok
        ).toBe(true);
        await bg.flush(30);
        expect(bg.chromeEnv.counters.syncSetCalls).toBe(setCallsBefore);
      } finally {
        await bg.cleanup();
      }
    });
  });

  // =========================================================================
  // M10: Per-Rule Stats, 7-Day dailyHistory & Local Canvas 2D Battle Report — 5 Tests
  // =========================================================================
  describe('M10: Per-Rule Stats, 7-Day dailyHistory & Battle Report PNG', () => {
    it('T1-V2-M10-01: appendLogs persists dailyHistory (YYYY-MM-DD ascending) and byRule for v0.2.0 rule IDs', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const now = Date.now();
        const res = await bg.sendCommand({
          type: 'logs.append',
          entries: [
            {
              id: 'e1',
              tweetId: '100001',
              authorUid: '11',
              authorScreenName: 'a1',
              authorName: 'A1',
              tweetSnippet: '@grok hi',
              scene: 'reply',
              ruleId: 'grok_filter',
              reasonText: 'Grok short mention',
              timestamp: now,
            },
            {
              id: 'e2',
              tweetId: '100002',
              authorUid: '12',
              authorScreenName: 'a2',
              authorName: 'A2',
              tweetSnippet: 'pump.fun link',
              scene: 'timeline',
              ruleId: 'domain_filter',
              reasonText: 'Domain blocked',
              timestamp: now,
            },
            {
              id: 'e3',
              tweetId: '100003',
              authorUid: '13',
              authorScreenName: 'a3',
              authorName: 'A3',
              tweetSnippet: 'moonshot pack',
              scene: 'timeline',
              ruleId: 'rule_pack',
              reasonText: 'Pack matched',
              timestamp: now,
            },
          ],
        });
        expect(res.ok).toBe(true);

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        const stats = state.data.stats;
        expect(Array.isArray(stats.dailyHistory)).toBe(true);
        expect(stats.dailyHistory.length).toBeGreaterThanOrEqual(1);
        expect(stats.dailyHistory[stats.dailyHistory.length - 1].date).toMatch(
          /^\d{4}-\d{2}-\d{2}$/
        );
        expect(stats.dailyHistory[stats.dailyHistory.length - 1].blocked).toBe(3);
        expect(stats.byRule.grok_filter).toBe(1);
        expect(stats.byRule.domain_filter).toBe(1);
        expect(stats.byRule.rule_pack).toBe(1);
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M10-02: appendLogs separates promoted_ad into dailyHistory.ads without incrementing blocked or visible logs', async () => {
      const bg = await bootBackgroundHarness();
      try {
        const now = Date.now();
        const appendRes = await bg.sendCommand({
          type: 'logs.append',
          entries: [
            {
              id: 'ad1',
              tweetId: '100101',
              authorUid: '21',
              authorScreenName: 'ad_acct_1',
              authorName: 'Ad 1',
              tweetSnippet: 'Sponsored',
              scene: 'timeline',
              ruleId: 'promoted_ad',
              reasonText: 'Promoted',
              timestamp: now,
            },
            {
              id: 'ad2',
              tweetId: '100102',
              authorUid: '22',
              authorScreenName: 'ad_acct_2',
              authorName: 'Ad 2',
              tweetSnippet: 'Sponsored 2',
              scene: 'timeline',
              ruleId: 'promoted_ad',
              reasonText: 'Promoted',
              timestamp: now,
            },
            {
              id: 'sp1',
              tweetId: '100103',
              authorUid: '23',
              authorScreenName: 'spam_1',
              authorName: 'Spam 1',
              tweetSnippet: 'Spam',
              scene: 'reply',
              ruleId: 'reply_spam',
              reasonText: 'Reply spam',
              timestamp: now,
            },
          ],
        });
        expect(appendRes.ok).toBe(true);

        const state = await bg.sendCommand<any>({ type: 'state.get' });
        const stats = state.data.stats;
        expect(Array.isArray(stats.dailyHistory)).toBe(true);
        const latest = stats.dailyHistory[stats.dailyHistory.length - 1];
        expect(latest.blocked).toBe(1);
        expect(latest.ads).toBe(2);
        expect(state.data.logs).toHaveLength(1);
        expect(state.data.logs[0].ruleId).toBe('reply_spam');
      } finally {
        await bg.cleanup();
      }
    });

    it('T1-V2-M10-03: rollStats maintains trailing <= 7-day dailyHistory on day rollover while preserving totalBlocked and byRule', async () => {
      const repoMod = await requireModule<{ rollStats: (stats: any) => any }>(
        'apps/extension/src/background/repository.ts',
        'extension repository'
      );
      const historyDays = Array.from({ length: 9 }, (_, i) => {
        const daysAgo = 9 - i; // today - 9 .. today - 1
        return { date: formatLocalDateOffset(daysAgo), blocked: 10 + i, ads: 1 };
      });
      const oldestDate = formatLocalDateOffset(9);
      const secondOldestDate = formatLocalDateOffset(8);
      const yesterdayDate = formatLocalDateOffset(1);
      const todayDate = formatLocalDateOffset(0);

      const rolled = repoMod.rollStats({
        todayDate: yesterdayDate,
        todayBlocked: 12,
        totalBlocked: 120,
        todayAdsHidden: 4,
        totalAdsHidden: 30,
        byRule: { reply_spam: 80, grok_filter: 40 },
        dailyHistory: historyDays,
      });

      expect(rolled.todayDate).toBe(todayDate);
      expect(rolled.todayBlocked).toBe(0);
      expect(rolled.totalBlocked).toBe(120);
      expect(rolled.byRule.reply_spam).toBe(80);
      expect(Array.isArray(rolled.dailyHistory)).toBe(true);
      expect(rolled.dailyHistory.length).toBeLessThanOrEqual(7);
      expect(rolled.dailyHistory.length).toBeGreaterThanOrEqual(1);
      // Oldest stale entries (today - 9, today - 8) must be pruned
      expect(
        rolled.dailyHistory.some((d: { date: string }) => d.date === oldestDate)
      ).toBe(false);
      expect(
        rolled.dailyHistory.some((d: { date: string }) => d.date === secondOldestDate)
      ).toBe(false);
      // Yesterday (today - 1) must be retained within the trailing 7-day window
      expect(
        rolled.dailyHistory.some((d: { date: string }) => d.date === yesterdayDate)
      ).toBe(true);
      for (let i = 1; i < rolled.dailyHistory.length; i++) {
        expect(rolled.dailyHistory[i].date > rolled.dailyHistory[i - 1].date).toBe(true);
      }
    });

    it('T1-V2-M10-04: HistoryPage renders rule breakdown bars and clicking a rule bar cross-filters select and table rows', async () => {
      const loadHistory = async () => {
        const mod = await requireModule<{ HistoryPage: any }>(
          'apps/extension/src/features/history/HistoryPage.tsx',
          'HistoryPage'
        );
        return mod.HistoryPage;
      };

      const mounted = await mountExtensionComponent(loadHistory, makeBaseUiState());
      try {
        const selects = [...mounted.document.querySelectorAll('select')];
        const ruleSelect = selects.find((s) =>
          [...s.options].some((o) => o.value === 'reply_spam')
        );
        expect(ruleSelect).toBeDefined();
        expect(mounted.document.querySelectorAll('tbody tr').length).toBe(3);

        // Locate clickable rule breakdown bar outside table (matching reply_spam data attr or count 25 / Reply)
        const candidates = [
          ...mounted.document.querySelectorAll('button, [role="button"]'),
        ].filter((el) => !el.closest('table'));
        const replyBarBtn = candidates.find((el) => {
          const txt = (el.textContent ?? '').toLowerCase();
          const attr = [
            el.getAttribute('data-rule') ?? '',
            el.getAttribute('data-rule-id') ?? '',
            el.getAttribute('data-testid') ?? '',
            el.getAttribute('aria-label') ?? '',
          ]
            .join(' ')
            .toLowerCase();
          return (
            attr.includes('reply_spam') ||
            (txt.includes('25') && (txt.includes('reply') || txt.includes('spam')))
          );
        });
        expect(replyBarBtn).toBeDefined();

        await mounted.click(replyBarBtn!);
        expect(ruleSelect!.value).toBe('reply_spam');
        expect(mounted.document.querySelectorAll('tbody tr').length).toBe(1);
      } finally {
        await mounted.cleanup();
      }
    },
    { timeout: 10000 }
    );

    it('T1-V2-M10-05: HistoryPage Battle Report button renders local light-theme Canvas 2D PNG with watermark and counts', async () => {
      const loadHistory = async () => {
        const mod = await requireModule<{ HistoryPage: any }>(
          'apps/extension/src/features/history/HistoryPage.tsx',
          'HistoryPage'
        );
        return mod.HistoryPage;
      };

      const mounted = await mountExtensionComponent(loadHistory, makeBaseUiState());
      try {
        const reportBtn = await triggerBattleReportRender(mounted);
        expect(reportBtn).toBeDefined();

        expect(mounted.canvasRecorder.canvases.length).toBeGreaterThanOrEqual(1);
        expect(mounted.canvasRecorder.texts.length).toBeGreaterThan(0);
        expect(mounted.canvasRecorder.allText.toLowerCase()).toContain('keepxclean.com');
        expect(mounted.canvasRecorder.allText).toContain('42');
        expect(
          mounted.canvasRecorder.toBlobCalls.length +
            mounted.canvasRecorder.toDataUrlCalls.length
        ).toBeGreaterThanOrEqual(1);
        for (const call of [
          ...mounted.canvasRecorder.toBlobCalls,
          ...mounted.canvasRecorder.toDataUrlCalls,
        ]) {
          expect(call.type).toBe('image/png');
        }
      } finally {
        await mounted.cleanup();
      }
    },
    { timeout: 10000 }
    );
  });

  // =========================================================================
  // M11: Local Parse Health Self-Check & Maintainer Cloud Rules CLI — 6 Tests
  // =========================================================================
  describe('M11: Local Parse Health Self-Check & Maintainer Cloud Rules CLI', () => {
    it('T1-V2-M11-01: processGraphqlResponsePayload returns exact extractedTweetCount for populated and empty payloads', () => {
      const config = Shared.createDefaultConfig('standard');
      config.interceptionMode = 'strip';
      config.rules.keywords.items = [
        { id: 'kw-strip-all', pattern: 'strip_this', isRegex: false, scopes: ['text'], enabled: true },
      ];

      const twoTweets = buildHomeTimelinePayload([
        buildGraphqlTweetEntry({
          tweetId: '11001',
          text: 'First tweet with strip_this token.',
          author: { restId: '111', screenName: 'u1' },
        }),
        buildGraphqlTweetEntry({
          tweetId: '11002',
          text: 'Second normal tweet without trigger.',
          author: { restId: '112', screenName: 'u2' },
        }),
      ]);
      const resPop = Shared.processGraphqlResponsePayload(
        twoTweets,
        GRAPHQL_URLS.forYou,
        '/home',
        config
      ) as any;
      expect(resPop.extractedTweetCount).toBe(2);

      const resEmpty = Shared.processGraphqlResponsePayload(
        buildEmptyCoreGraphqlPayload('HomeTimeline'),
        GRAPHQL_URLS.forYou,
        '/home',
        config
      ) as any;
      expect(resEmpty.extractedTweetCount).toBe(0);
    });

    it('T1-V2-M11-02: page-interceptor emits KXC_PARSE_HEALTH degraded after 5 consecutive 0-tweet core payloads spanning >= 15s', async () => {
      const pi = await bootPageInterceptorHarness({ startTimeMs: 1_700_000_000_000 });
      try {
        for (let i = 0; i < 5; i++) {
          if (i > 0) pi.advanceNow(4000); // 0s, 4s, 8s, 12s, 16s -> 16s span >= 15s
          await pi.sendGraphqlFetch(
            GRAPHQL_URLS.forYou,
            buildEmptyCoreGraphqlPayload('HomeTimeline')
          );
        }

        const degraded = pi.healthEvents.find((e) => e.status === 'degraded');
        expect(degraded).toBeDefined();
        expect(Number(degraded!.consecutiveZeroCount)).toBeGreaterThanOrEqual(5);
        expect(Array.isArray(degraded!.endpoints)).toBe(true);
        expect((degraded!.endpoints as string[]).some((e) => /HomeTimeline/i.test(e))).toBe(
          true
        );
        expect(Array.isArray(degraded!.topKeys)).toBe(true);
        expect((degraded!.topKeys as string[]).length).toBeGreaterThan(0);
      } finally {
        pi.cleanup();
      }
    });

    it('T1-V2-M11-03: page-interceptor auto-recovers KXC_PARSE_HEALTH to ok upon 1 valid core payload with >= 1 tweet', async () => {
      const pi = await bootPageInterceptorHarness({ startTimeMs: 1_700_000_000_000 });
      try {
        for (let i = 0; i < 5; i++) {
          if (i > 0) pi.advanceNow(4000);
          await pi.sendGraphqlFetch(
            GRAPHQL_URLS.forYou,
            buildEmptyCoreGraphqlPayload('HomeTimeline')
          );
        }
        expect(pi.healthEvents.some((e) => e.status === 'degraded')).toBe(true);

        pi.advanceNow(2000);
        await pi.sendGraphqlFetch(
          GRAPHQL_URLS.forYou,
          buildHomeTimelinePayload([
            buildGraphqlTweetEntry({
              tweetId: '11030',
              text: 'Valid tweet restoring healthy parsing.',
              author: { restId: '1103', screenName: 'healthy_user' },
            }),
          ])
        );

        const lastEvent = pi.healthEvents[pi.healthEvents.length - 1];
        expect(lastEvent).toBeDefined();
        expect(lastEvent.status).toBe('ok');
        expect(lastEvent.consecutiveZeroCount).toBe(0);
      } finally {
        pi.cleanup();
      }
    });

    it('T1-V2-M11-04: UI_KEYS.health is kxc_health_v1 and background RPC health.update / health.dismiss persist state', async () => {
      const modelMod = await requireModule<Record<string, unknown>>(
        'apps/extension/src/services/model.ts',
        'extension services model'
      );
      const UI_KEYS = requireExport<Record<string, string>>(modelMod, 'UI_KEYS', 'model.ts');
      expect(UI_KEYS.health).toBe('kxc_health_v1');

      const bg = await bootBackgroundHarness();
      try {
        const upd = await bg.sendCommand({
          type: 'health.update',
          report: {
            status: 'degraded',
            consecutiveZeroCount: 5,
            firstFailureAt: 1_700_000_000_000,
            lastFailureAt: 1_700_000_016_000,
            endpoints: ['HomeTimeline'],
            topKeys: ['data.home_v2_renamed'],
          },
        });
        expect(upd.ok).toBe(true);

        const st1 = await bg.sendCommand<any>({ type: 'state.get' });
        expect(st1.data.health?.status).toBe('degraded');
        expect(st1.data.health?.consecutiveZeroCount).toBe(5);

        const dis = await bg.sendCommand({ type: 'health.dismiss' });
        expect(dis.ok).toBe(true);

        const st2 = await bg.sendCommand<any>({ type: 'state.get' });
        expect(typeof st2.data.health?.dismissedAt).toBe('number');
        expect(st2.data.health.dismissedAt).toBeGreaterThan(0);
      } finally {
        await bg.cleanup();
      }
    });

    it(
      'T1-V2-M11-05: apps/server/cloud-rules.json matches overlay manifest schema, root package.json defines CLI scripts, and push --dry-run exits 0',
      async () => {
        const groups = requireExport<readonly string[]>(
          sharedMod,
          'CLOUD_KEYWORD_LANG_GROUPS',
          '@keepxclean/shared'
        );
        const validScopes = new Set(['text', 'bio', 'name', 'url']);
        expect(Shared.DEFAULT_CLOUD_KEYWORDS.length).toBeGreaterThanOrEqual(24);

        const manifestRaw = requireFile('apps/server/cloud-rules.json', 'cloud rules manifest');
        const manifest = JSON.parse(manifestRaw) as {
          version?: number;
          rules?: Array<Record<string, unknown>>;
        };
        expect(manifest.version).toBe(1);
        expect(Array.isArray(manifest.rules)).toBe(true);

        const seenIds = new Set<string>();
        for (const r of manifest.rules!) {
          expect(typeof r.id).toBe('string');
          expect((r.id as string).trim().length).toBeGreaterThan(0);
          expect(seenIds.has(r.id as string)).toBe(false);
          seenIds.add(r.id as string);
          expect(typeof r.pattern).toBe('string');
          expect((r.pattern as string).trim().length).toBeGreaterThan(0);
          expect(typeof r.isRegex).toBe('boolean');
          if (r.isRegex) {
            expect(() => new RegExp(String(r.pattern), 'i')).not.toThrow();
          }
          expect(Array.isArray(r.scopes)).toBe(true);
          expect((r.scopes as unknown[]).length).toBeGreaterThan(0);
          for (const scope of r.scopes as unknown[]) {
            expect(typeof scope).toBe('string');
            expect(validScopes.has(scope as string)).toBe(true);
          }
          expect(groups).toContain(r.langGroup);
          expect(typeof r.enabled).toBe('boolean');
        }

        const rootPkg = JSON.parse(requireFile('package.json')) as {
          scripts?: Record<string, string>;
        };
        expect(rootPkg.scripts?.['cloud-rules:push']).toContain('cloud-rules.ts');
        expect(rootPkg.scripts?.['cloud-rules:list']).toContain('cloud-rules.ts');

        const baseArgs = parseCliPushBaseArgs(rootPkg.scripts ?? {});
        const args = baseArgs.includes('--dry-run')
          ? baseArgs
          : [...baseArgs, '--dry-run'];
        const dryRun = await runTsxCli('apps/server/scripts/cloud-rules.ts', args, {
          timeoutMs: 14_000,
        });
        expect(dryRun.timedOut).toBe(false);
        expect(dryRun.exitCode).toBe(0);
      },
      { timeout: 15000 }
    );

    it(
      'T1-V2-M11-06: Maintainer CLI cloud-rules.ts executes --dry-run cleanly offline with exit code 0',
      async () => {
        requireFile('apps/server/scripts/cloud-rules.ts', 'maintainer cloud-rules CLI');
        requireFile('apps/server/cloud-rules.json', 'cloud rules manifest');
        const rootPkg = JSON.parse(requireFile('package.json')) as {
          scripts?: Record<string, string>;
        };
        const baseArgs = parseCliPushBaseArgs(rootPkg.scripts ?? {});
        const args = baseArgs.includes('--dry-run')
          ? baseArgs
          : [...baseArgs, '--dry-run'];

        const result = await runTsxCli('apps/server/scripts/cloud-rules.ts', args, {
          timeoutMs: 14_000,
        });
        expect(result.timedOut).toBe(false);
        expect(result.exitCode).toBe(0);
      },
      { timeout: 15000 }
    );
  });

  // =========================================================================
  // M12: Website v0.2.0 Sync, 10-Locale Parity, Brand & Versions — 7 Tests
  // =========================================================================
  describe('M12: Website v0.2.0 Sync, 10-Locale Parity & Release Versions', () => {
    it('T1-V2-M12-01: All 5 workspace package.json files declare 0.2.0 and apps/web/src/config.ts exports CURRENT_VERSION v0.2.0', async () => {
      const pkgPaths = [
        'package.json',
        'packages/shared/package.json',
        'apps/extension/package.json',
        'apps/server/package.json',
        'apps/web/package.json',
      ];
      for (const rel of pkgPaths) {
        const pkg = JSON.parse(requireFile(rel)) as { version?: string };
        expect(pkg.version).toBe('0.2.0');
      }

      const webCfg = await requireModule<{ CURRENT_VERSION?: string }>(
        'apps/web/src/config.ts',
        'web config'
      );
      expect(webCfg.CURRENT_VERSION).toBe('v0.2.0');
    });

    it('T1-V2-M12-02: All 10 web locale dictionaries have 100% key parity and show v0.2.0 in release fields', async () => {
      const localesMod = await requireModule<{
        getDictionary: (lang: string) => Record<string, any>;
      }>('apps/web/src/locales/index.ts', 'web locales');

      const enKeys = collectAllKeys(localesMod.getDictionary('en'));
      expect(enKeys.size).toBeGreaterThan(20);

      for (const locale of Shared.SUPPORTED_LOCALES) {
        const dict = localesMod.getDictionary(locale);
        const keys = collectAllKeys(dict);
        expect(keys.size).toBe(enKeys.size);
        for (const [k, t] of enKeys) {
          expect(keys.get(k)).toBe(t);
        }
        expect(String(dict.nav?.downloadCta ?? '')).toContain('0.2.0');
        expect(String(dict.install?.readyStatus ?? '')).toContain('0.2.0');
        expect(String(dict.footer?.releaseZip ?? '')).toContain('0.2.0');
      }
    });

    it('T1-V2-M12-03: HeroSandbox updated to v0.2.0 demonstrating Grok, duplicate reply spam, and For You/Following scene switching', () => {
      const sampleSrc = requireFile('apps/web/src/components/HeroSandbox/sampleData.ts');
      const heroSrc = requireFile('apps/web/src/components/HeroSandbox/HeroSandbox.tsx');
      const typesSrc = requireFile('apps/web/src/components/HeroSandbox/types.ts');
      const combined = `${sampleSrc}\n${heroSrc}\n${typesSrc}`;

      expect(sampleSrc).toContain('v0.2.0');
      expect(/grok/i.test(combined)).toBe(true);
      expect(/(duplicate|复读|copy[- ]?paste|水军)/i.test(combined)).toBe(true);
      expect(/(for.?you|following|timelineFeed|sceneMode|推荐|关注)/i.test(combined)).toBe(true);
    });

    it('T1-V2-M12-04: apps/web/src/data/privacyContent.ts retains 5-row permissions table and discloses storage.sync and local parse health', async () => {
      const privacyMod = await requireModule<{ PRIVACY_CONTENT: Record<string, any> }>(
        'apps/web/src/data/privacyContent.ts',
        'web privacy content'
      );

      for (const lang of ['en', 'zh-CN'] as const) {
        const content = privacyMod.PRIVACY_CONTENT[lang];
        expect(content).toBeDefined();
        expect(content.sec4Rows).toHaveLength(5);
        const serialized = JSON.stringify(content);
        expect(/storage\.sync/i.test(serialized)).toBe(true);
        expect(/(parse\s*health|health|diagnostic|自检|诊断)/i.test(serialized)).toBe(true);
      }
    });

    it('T1-V2-M12-05: Extension LOCALES and ERROR_LOCALES achieve 100% parity across 10 locales covering 11 rules.defs and 16 ruleLabels', async () => {
      const coreMod = await requireModule<{
        LOCALES: Record<string, Record<string, any>>;
        ERROR_LOCALES: Record<string, Record<string, any>>;
      }>('apps/extension/src/i18n/core.ts', 'extension i18n core');

      const requiredRuleDefs = [
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
      const requiredRuleLabels = [
        'grok_filter',
        'domain_filter',
        'rule_pack',
        'reply_spam',
        'keyword',
        'cloud_keyword',
        'promoted_ad',
      ];

      const enLocaleKeys = collectAllKeys(coreMod.LOCALES.en);
      const enErrorKeys = collectAllKeys(coreMod.ERROR_LOCALES.en);

      for (const locale of Shared.SUPPORTED_LOCALES) {
        const loc = coreMod.LOCALES[locale];
        const err = coreMod.ERROR_LOCALES[locale];
        expect(loc).toBeDefined();
        expect(err).toBeDefined();

        const locKeys = collectAllKeys(loc);
        expect(locKeys.size).toBe(enLocaleKeys.size);
        for (const [k, t] of enLocaleKeys) {
          expect(locKeys.get(k)).toBe(t);
        }

        const errKeys = collectAllKeys(err);
        expect(errKeys.size).toBe(enErrorKeys.size);
        for (const [k, t] of enErrorKeys) {
          expect(errKeys.get(k)).toBe(t);
        }

        for (const rk of requiredRuleDefs) {
          expect(loc.rules?.defs?.[rk]).toBeDefined();
        }
        expect(Object.keys(loc.history?.ruleLabels ?? {}).length).toBeGreaterThanOrEqual(16);
        for (const rl of requiredRuleLabels) {
          expect(typeof loc.history?.ruleLabels?.[rl]).toBe('string');
          expect(loc.history.ruleLabels[rl].trim().length).toBeGreaterThan(0);
        }
      }
    });

    it('T1-V2-M12-06: ArchitectureFlow removes hardcoded 24 Cloud Keywords and CloudKeywordsCard uses expanded DEFAULT_CLOUD_KEYWORDS', () => {
      const archSrc = requireFile('apps/web/src/components/ArchitectureFlow.tsx');
      expect(archSrc).not.toMatch(/\b24\s+cloud\s+keywords/i);

      const cardSrc = requireFile('apps/web/src/components/BentoGrid/CloudKeywordsCard.tsx');
      expect(cardSrc).toContain('DEFAULT_CLOUD_KEYWORDS');
      expect(Shared.DEFAULT_CLOUD_KEYWORDS.length).toBeGreaterThan(24);
    });

    it('T1-V2-M12-07: Root CHANGELOG.md exists and documents v0.2.0 release notes', () => {
      const changelog = requireFile('CHANGELOG.md', 'root release changelog');
      expect(changelog).toMatch(/0\.2\.0/);
      expect(changelog.trim().length).toBeGreaterThan(40);
    });
  });
});
