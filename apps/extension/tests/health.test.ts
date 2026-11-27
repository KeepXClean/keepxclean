import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  processGraphqlResponsePayload,
} from '@keepxclean/shared';
import {
  dismissParseHealth,
  readParseHealth,
  updateParseHealth,
} from '../src/background/repository';
import {
  CORE_GRAPHQL_OPS,
  detectCoreGraphqlOp,
  extractSanitizedTopKeys,
  formatRedactedHealthDiagnostic,
  isSafeKeyPath,
  isSafeKeySegment,
  normalizeParseHealth,
  PARSE_HEALTH_EMIT_THROTTLE_MS,
  PARSE_HEALTH_MIN_SPAN_MS,
  PARSE_HEALTH_MIN_STREAK,
  ParseHealthTracker,
  sanitizeParseHealthReport,
} from '../src/services/parse-health';
import { UI_KEYS } from '../src/services/model';
import { getState, reload, subscribe } from '../src/state/store';
import { mockChrome } from './mock-chrome';

const HOME_URL = 'https://x.com/i/api/graphql/abc123/HomeTimeline?variables={}';
const LATEST_URL =
  'https://x.com/i/api/graphql/def456/HomeLatestTimeline?variables={}';
const DETAIL_URL =
  'https://x.com/i/api/graphql/ghi789/TweetDetail?variables=%7B%22focalTweetId%22%3A%221899999999999999999%22%7D';
const SEARCH_URL =
  'https://x.com/i/api/graphql/jkl012/SearchTimeline?variables={}';

const BROKEN_PAYLOAD = {
  data: {
    home: {
      home_timeline_urt: {
        unexpected_v2_nodes: [{ id: 'not_a_tweet' }],
      },
    },
  },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('local X GraphQL parse health self-check (F15)', () => {
  it('matches only the 4 core GraphQL operations and rejects lookalikes and query spoofing', () => {
    expect(CORE_GRAPHQL_OPS).toEqual([
      'HomeTimeline',
      'HomeLatestTimeline',
      'TweetDetail',
      'SearchTimeline',
    ]);
    expect(detectCoreGraphqlOp(HOME_URL)).toBe('HomeTimeline');
    expect(detectCoreGraphqlOp(LATEST_URL)).toBe('HomeLatestTimeline');
    expect(detectCoreGraphqlOp(DETAIL_URL)).toBe('TweetDetail');
    expect(detectCoreGraphqlOp(SEARCH_URL)).toBe('SearchTimeline');
    expect(
      detectCoreGraphqlOp('https://x.com/i/api/graphql/xyz/hometimeline')
    ).toBe('HomeTimeline');

    // Non-core endpoints and spoofing attempts must return null
    expect(detectCoreGraphqlOp('SSR_RELAY')).toBeNull();
    expect(
      detectCoreGraphqlOp('https://x.com/i/api/graphql/abc/Viewer')
    ).toBeNull();
    expect(
      detectCoreGraphqlOp('https://x.com/i/api/graphql/abc/UserByScreenName')
    ).toBeNull();
    expect(
      detectCoreGraphqlOp('https://x.com/i/api/graphql/abc/UserTweets')
    ).toBeNull();
    expect(
      detectCoreGraphqlOp('https://x.com/i/api/graphql/abc/HomeTimelineExtra')
    ).toBeNull();
    expect(
      detectCoreGraphqlOp(
        'https://x.com/i/api/graphql/abc/Viewer?op=HomeTimeline#TweetDetail'
      )
    ).toBeNull();
  });

  it('enforces exact >=5 streak and >=15s span thresholds without false positives', () => {
    const tracker = new ParseHealthTracker();
    const t0 = 1_700_000_000_000;

    // 5 zeros within 14,999ms MUST NOT trigger degradation
    for (let i = 0; i < PARSE_HEALTH_MIN_STREAK; i++) {
      const report = tracker.observe({
        url: HOME_URL,
        rawText: JSON.stringify(BROKEN_PAYLOAD),
        parsed: BROKEN_PAYLOAD,
        extractedTweetCount: 0,
        httpStatus: 200,
        now: t0 + Math.floor((i * (PARSE_HEALTH_MIN_SPAN_MS - 1)) / 4),
      });
      expect(report).toBeNull();
    }
    expect(tracker.getState().status).toBe('ok');

    // 4 zeros over 60,000ms MUST NOT trigger degradation
    tracker.reset();
    for (let i = 0; i < PARSE_HEALTH_MIN_STREAK - 1; i++) {
      const report = tracker.observe({
        url: HOME_URL,
        rawText: JSON.stringify(BROKEN_PAYLOAD),
        parsed: BROKEN_PAYLOAD,
        extractedTweetCount: 0,
        httpStatus: 200,
        now: t0 + i * 20_000,
      });
      expect(report).toBeNull();
    }
    expect(tracker.getState().status).toBe('ok');

    // 5th zero at t0 + 15_000ms triggers 'degraded'
    tracker.reset();
    for (let i = 0; i < 4; i++) {
      expect(
        tracker.observe({
          url: HOME_URL,
          rawText: JSON.stringify(BROKEN_PAYLOAD),
          parsed: BROKEN_PAYLOAD,
          extractedTweetCount: 0,
          httpStatus: 200,
          now: t0 + i * 3_500,
        })
      ).toBeNull();
    }
    const degraded = tracker.observe({
      url: HOME_URL,
      rawText: JSON.stringify(BROKEN_PAYLOAD),
      parsed: BROKEN_PAYLOAD,
      extractedTweetCount: 0,
      httpStatus: 200,
      now: t0 + PARSE_HEALTH_MIN_SPAN_MS,
    });
    expect(degraded).not.toBeNull();
    expect(degraded?.status).toBe('degraded');
    expect(degraded?.consecutiveZeroCount).toBe(5);
    expect(degraded?.endpoints).toEqual(['HomeTimeline']);
    expect(degraded?.topKeys).toContain('data.home.home_timeline_urt');
  });

  it('ignores HTTP errors, empty payloads, and GraphQL error responses', () => {
    const tracker = new ParseHealthTracker();
    const t0 = 1_700_000_000_000;

    const ignoredCases = [
      { httpStatus: 429, parsed: BROKEN_PAYLOAD },
      { httpStatus: 401, parsed: BROKEN_PAYLOAD },
      { httpStatus: 500, parsed: BROKEN_PAYLOAD },
      { httpStatus: 200, rawText: '{}', parsed: {} },
      { httpStatus: 200, parsed: { errors: [{ message: 'Rate limit' }] } },
      {
        httpStatus: 200,
        parsed: { data: null, errors: [{ message: 'Auth failed' }] },
      },
      {
        httpStatus: 200,
        parsed: { data: {}, errors: [{ message: 'Empty' }] },
      },
      {
        httpStatus: 200,
        parsed: {
          data: { home: null },
          errors: [{ message: 'Partial outage' }],
        },
      },
    ];

    ignoredCases.forEach((c, idx) => {
      const report = tracker.observe({
        url: HOME_URL,
        rawText: c.rawText ?? JSON.stringify(c.parsed),
        parsed: c.parsed,
        extractedTweetCount: 0,
        httpStatus: c.httpStatus,
        now: t0 + idx * 10_000,
      });
      expect(report).toBeNull();
    });

    expect(tracker.getState().status).toBe('ok');
    expect(tracker.getState().consecutiveZeroCount).toBe(0);
  });

  it('auto-recovers immediately on extractedTweetCount >= 1 including zero-reply TweetDetail and supports emitOnFirstHealthy', () => {
    const tracker = new ParseHealthTracker({ emitOnFirstHealthy: true });
    const t0 = 1_700_000_000_000;

    // First healthy response emits one-shot 'ok' (for cross-reload recovery), second stays silent
    const initialOk = tracker.observe({
      url: HOME_URL,
      parsed: { data: { home: {} } },
      extractedTweetCount: 3,
      httpStatus: 200,
      now: t0,
    });
    expect(initialOk?.status).toBe('ok');
    expect(
      tracker.observe({
        url: HOME_URL,
        parsed: { data: { home: {} } },
        extractedTweetCount: 2,
        httpStatus: 200,
        now: t0 + 1000,
      })
    ).toBeNull();

    // Drive into degraded state
    for (let i = 0; i < 5; i++) {
      tracker.observe({
        url: HOME_URL,
        parsed: BROKEN_PAYLOAD,
        extractedTweetCount: 0,
        httpStatus: 200,
        now: t0 + 10_000 + i * 4_000,
      });
    }
    expect(tracker.getState().status).toBe('degraded');

    // Real processGraphqlResponsePayload on a zero-reply TweetDetail yields extractedTweetCount === 1
    const zeroReplyDetail = {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  entryId: 'tweet-1899999999999999999',
                  content: {
                    entryType: 'TimelineTimelineItem',
                    itemContent: {
                      itemType: 'TimelineTweet',
                      tweet_results: {
                        result: {
                          __typename: 'Tweet',
                          rest_id: '1899999999999999999',
                          core: {
                            user_results: {
                              result: {
                                __typename: 'User',
                                rest_id: '44196397',
                                legacy: {
                                  screen_name: 'author_zero',
                                  name: 'Author Zero',
                                  created_at: 'Tue Jun 02 20:12:29 +0000 2009',
                                  followers_count: 500,
                                  friends_count: 100,
                                  statuses_count: 200,
                                },
                              },
                            },
                          },
                          legacy: {
                            id_str: '1899999999999999999',
                            full_text: 'Standalone focal tweet with zero replies',
                            entities: { urls: [], hashtags: [], symbols: [] },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    };
    const processed = processGraphqlResponsePayload(
      zeroReplyDetail,
      DETAIL_URL,
      '/author_zero/status/1899999999999999999',
      createDefaultConfig('standard')
    );
    expect(processed.extractedTweetCount).toBe(1);

    const recovered = tracker.observe({
      url: DETAIL_URL,
      parsed: zeroReplyDetail,
      extractedTweetCount: processed.extractedTweetCount,
      httpStatus: 200,
      now: t0 + 40_000,
    });
    expect(recovered).toEqual({
      status: 'ok',
      consecutiveZeroCount: 0,
      endpoints: [],
      topKeys: [],
    });
  });

  it('strictly redacts PII, UIDs, handles, hex hashes, URLs, and prototype keys from topKeys and diagnostics', () => {
    expect(isSafeKeySegment('home_timeline_urt')).toBe(true);
    expect(isSafeKeySegment('__typename')).toBe(true);
    expect(isSafeKeySegment('1890123456789012345')).toBe(false);
    expect(isSafeKeySegment('user_12345678')).toBe(false);
    expect(isSafeKeySegment('deadbeefcafebabe1234')).toBe(false);
    expect(isSafeKeySegment('@victim')).toBe(false);
    expect(isSafeKeySegment('https://secret.example')).toBe(false);
    expect(isSafeKeySegment('__proto__')).toBe(false);
    expect(isSafeKeySegment('constructor')).toBe(false);
    expect(isSafeKeyPath('data.home.home_timeline_urt')).toBe(true);
    expect(isSafeKeyPath('data.user_12345678.secret')).toBe(false);

    const adversarial = JSON.parse(`{
      "data": {
        "home": {
          "home_timeline_urt": {
            "screen_name": "@victim_secret_handle",
            "cookie": "ct0=super_secret_csrf_token; auth_token=abcd1234",
            "tweet_text": "Private DM content https://private.example/token=xyz"
          },
          "1890123456789012345": { "nested": true },
          "user_12345678": { "nested": true },
          "deadbeefcafebabe12345678": { "nested": true },
          "@victim_key": { "nested": true },
          "user@email.com": { "nested": true },
          "https://secret.example/path": { "nested": true },
          "key-with-dashes": { "nested": true },
          "__proto__": { "polluted": true }
        }
      }
    }`);

    const keys = extractSanitizedTopKeys(adversarial);
    expect(keys).toEqual(['data.home.home_timeline_urt']);

    const diag = formatRedactedHealthDiagnostic(
      {
        status: 'degraded',
        consecutiveZeroCount: 5,
        firstFailureAt: 1_700_000_000_000,
        lastFailureAt: 1_700_000_020_000,
        endpoints: ['HomeTimeline'],
        topKeys: [
          ...keys,
          'data.user_12345678',
          'data.@victim',
          'data.https://evil.example',
        ],
      },
      '0.2.0'
    );
    expect(diag).toContain('Version: 0.2.0');
    expect(diag).toContain('HomeTimeline');
    expect(diag).toContain('data.home.home_timeline_urt');
    expect(diag).not.toContain('victim');
    expect(diag).not.toContain('12345678');
    expect(diag).not.toContain('secret');
    expect(diag).not.toContain('ct0=');
    expect(diag).not.toContain('evil.example');
  });

  it('throttles degraded re-emissions for 30s unless a new core op fails', () => {
    const tracker = new ParseHealthTracker();
    const t0 = 1_700_000_000_000;

    for (let i = 0; i < 4; i++) {
      tracker.observe({
        url: HOME_URL,
        parsed: BROKEN_PAYLOAD,
        extractedTweetCount: 0,
        httpStatus: 200,
        now: t0 + i * 4_000,
      });
    }
    const firstEmit = tracker.observe({
      url: HOME_URL,
      parsed: BROKEN_PAYLOAD,
      extractedTweetCount: 0,
      httpStatus: 200,
      now: t0 + 16_000,
    });
    expect(firstEmit?.status).toBe('degraded');

    // Immediate subsequent failure on same op is throttled
    expect(
      tracker.observe({
        url: HOME_URL,
        parsed: BROKEN_PAYLOAD,
        extractedTweetCount: 0,
        httpStatus: 200,
        now: t0 + 20_000,
      })
    ).toBeNull();

    // Failure on a newly affected core op emits immediately
    const newOpEmit = tracker.observe({
      url: SEARCH_URL,
      parsed: BROKEN_PAYLOAD,
      extractedTweetCount: 0,
      httpStatus: 200,
      now: t0 + 22_000,
    });
    expect(newOpEmit?.endpoints).toEqual(['HomeTimeline', 'SearchTimeline']);

    // Same op again within 30s is throttled, then emits once >= 30s elapsed
    expect(
      tracker.observe({
        url: HOME_URL,
        parsed: BROKEN_PAYLOAD,
        extractedTweetCount: 0,
        httpStatus: 200,
        now: t0 + 22_000 + PARSE_HEALTH_EMIT_THROTTLE_MS - 1,
      })
    ).toBeNull();
    const afterThrottle = tracker.observe({
      url: HOME_URL,
      parsed: BROKEN_PAYLOAD,
      extractedTweetCount: 0,
      httpStatus: 200,
      now: t0 + 22_000 + PARSE_HEALTH_EMIT_THROTTLE_MS,
    });
    expect(afterThrottle?.consecutiveZeroCount).toBe(9);
  });

  it('sanitizes background health.update reports, preserves dismissal across throttled updates, and clears on recovery', async () => {
    mockChrome({});

    // Completely spoofed report with only non-core endpoint is rejected
    expect(
      sanitizeParseHealthReport({
        status: 'degraded',
        consecutiveZeroCount: 5,
        endpoints: ['Viewer'],
        topKeys: ['data.viewer'],
      })
    ).toBeNull();
    await updateParseHealth({
      status: 'degraded',
      consecutiveZeroCount: 5,
      endpoints: ['Viewer'],
      topKeys: ['data.user_12345678'],
    });
    expect((await readParseHealth()).status).toBe('ok');

    // Mixed report keeps only allowlisted core ops and safe key paths
    const degraded = await updateParseHealth({
      status: 'degraded',
      consecutiveZeroCount: 5,
      firstFailureAt: 1_700_000_000_000,
      lastFailureAt: 1_700_000_020_000,
      endpoints: ['Viewer', 'HomeTimeline'],
      topKeys: ['data.home.home_timeline_urt', 'data.user_98765432', '@handle'],
    });
    expect(degraded.status).toBe('degraded');
    expect(degraded.endpoints).toEqual(['HomeTimeline']);
    expect(degraded.topKeys).toEqual(['data.home.home_timeline_urt']);

    // User dismisses banner
    const dismissed = await dismissParseHealth();
    expect(dismissed.dismissedAt).toBeGreaterThan(0);

    // Throttled follow-up degraded report preserves earliest firstFailureAt and dismissedAt
    const followUp = await updateParseHealth({
      status: 'degraded',
      consecutiveZeroCount: 8,
      firstFailureAt: 1_700_000_005_000,
      lastFailureAt: 1_700_000_060_000,
      endpoints: ['SearchTimeline'],
      topKeys: ['data.search_by_raw_query.search_timeline'],
    });
    expect(followUp.firstFailureAt).toBe(1_700_000_000_000);
    expect(followUp.lastFailureAt).toBe(1_700_000_060_000);
    expect(followUp.consecutiveZeroCount).toBe(8);
    expect(followUp.endpoints).toEqual(['HomeTimeline', 'SearchTimeline']);
    expect(followUp.dismissedAt).toBe(dismissed.dismissedAt);

    // Auto-recovery to 'ok' clears dismissedAt so future incidents surface again
    const recovered = await updateParseHealth({
      status: 'ok',
      consecutiveZeroCount: 0,
      endpoints: [],
      topKeys: [],
    });
    expect(recovered).toEqual({
      status: 'ok',
      consecutiveZeroCount: 0,
      endpoints: [],
      topKeys: [],
    });
  });

  it('hardens against out-of-range timestamps, prefixed hex PII tokens, GraphQL subpath spoofing, and NaN key bounds', async () => {
    mockChrome({});

    // 1. Out-of-range timestamps (> MAX_DATE_MS) are dropped and never crash formatRedactedHealthDiagnostic
    const sanitized = sanitizeParseHealthReport({
      status: 'degraded',
      consecutiveZeroCount: 5,
      firstFailureAt: Number.MAX_SAFE_INTEGER,
      lastFailureAt: 1e20,
      endpoints: ['HomeTimeline'],
      topKeys: ['data.home'],
    });
    expect(sanitized).not.toBeNull();
    expect(sanitized?.firstFailureAt).toBeUndefined();
    expect(sanitized?.lastFailureAt).toBeUndefined();

    await updateParseHealth({
      status: 'degraded',
      consecutiveZeroCount: 5,
      firstFailureAt: Number.MAX_SAFE_INTEGER,
      lastFailureAt: 1e20,
      endpoints: ['HomeTimeline'],
      topKeys: ['data.home'],
    });
    expect(() =>
      formatRedactedHealthDiagnostic(
        {
          status: 'degraded',
          consecutiveZeroCount: 5,
          firstFailureAt: Number.MAX_SAFE_INTEGER,
          lastFailureAt: 1e20,
          endpoints: ['HomeTimeline'],
          topKeys: ['data.home'],
        },
        '0.2.0'
      )
    ).not.toThrow();
    const diag = formatRedactedHealthDiagnostic(
      await readParseHealth(),
      '0.2.0'
    );
    expect(diag).toContain('Version: 0.2.0');

    // 2. Prefixed hex tokens are stripped from segments, key paths, and diagnostics
    expect(isSafeKeySegment('ct0_a1b2c3d4e5f6a7b8c9d0e1f2')).toBe(false);
    expect(isSafeKeySegment('token_deadbeefcafebabe')).toBe(false);
    expect(
      extractSanitizedTopKeys({
        data: {
          ct0_a1b2c3d4e5f6a7b8c9d0e1f2: { nested: true },
          token_deadbeefcafebabe: { nested: true },
          home_timeline_urt: { entries: [] },
        },
      })
    ).toEqual(['data.home_timeline_urt.entries']);

    // 3. Subpath spoofing returns null while trailing slash remains allowed
    expect(
      detectCoreGraphqlOp('https://x.com/i/api/graphql/x/HomeTimeline/Viewer')
    ).toBeNull();
    expect(
      detectCoreGraphqlOp('https://x.com/i/api/graphql/x/HomeTimeline/')
    ).toBe('HomeTimeline');

    // 4. Non-finite maxDepth / maxKeys return [] instead of bypassing the key ceiling
    const wideObj = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`field_${i}`, i])
    );
    expect(extractSanitizedTopKeys(wideObj, 3, Number.NaN)).toEqual([]);
    expect(extractSanitizedTopKeys(wideObj, Number.NaN, 10)).toEqual([]);
    expect(extractSanitizedTopKeys(wideObj, 3, Number.POSITIVE_INFINITY)).toEqual(
      []
    );
  });

  it('BUG-C1-4 regression: rejects spoofed <5 streaks, inverted/<15s timestamps, custom prototypes, symbols, and getter traps with 0 hits, and guards backward clock skew', async () => {
    mockChrome({});

    // 1. Sub-threshold streak (1..4) rejected
    for (const count of [0, 1, 2, 3, 4]) {
      expect(
        sanitizeParseHealthReport({
          status: 'degraded',
          consecutiveZeroCount: count,
          firstFailureAt: 1_700_000_000_000,
          lastFailureAt: 1_700_000_020_000,
          endpoints: ['HomeTimeline'],
          topKeys: ['data.home'],
        })
      ).toBeNull();
    }

    // 2. Inverted timestamps & sub-15s spans rejected
    expect(
      sanitizeParseHealthReport({
        status: 'degraded',
        consecutiveZeroCount: 5,
        firstFailureAt: 1_800_000_000_000,
        lastFailureAt: 1_700_000_000_000,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      })
    ).toBeNull();
    expect(
      sanitizeParseHealthReport({
        status: 'degraded',
        consecutiveZeroCount: 5,
        firstFailureAt: 1_700_000_000_000,
        lastFailureAt: 1_700_000_014_999,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      })
    ).toBeNull();

    // 3. Getter traps (object + array elements), custom class instances, and symbol keys rejected with 0 getter hits
    let getterHits = 0;
    const getterObj = {
      consecutiveZeroCount: 5,
      endpoints: ['HomeTimeline'],
      topKeys: ['data.home'],
    };
    Object.defineProperty(getterObj, 'status', {
      enumerable: true,
      get() {
        getterHits += 1;
        return 'degraded';
      },
    });
    expect(sanitizeParseHealthReport(getterObj)).toBeNull();

    const getterArr: string[] = [];
    Object.defineProperty(getterArr, 0, {
      enumerable: true,
      get() {
        getterHits += 1;
        return 'HomeTimeline';
      },
    });
    expect(
      sanitizeParseHealthReport({
        status: 'degraded',
        consecutiveZeroCount: 5,
        endpoints: getterArr,
        topKeys: ['data.home'],
      })
    ).toBeNull();

    class CustomReport {
      status = 'degraded';
      consecutiveZeroCount = 5;
      endpoints = ['HomeTimeline'];
      topKeys = ['data.home'];
    }
    expect(sanitizeParseHealthReport(new CustomReport())).toBeNull();

    const symObj = {
      status: 'degraded',
      consecutiveZeroCount: 5,
      endpoints: ['HomeTimeline'],
      topKeys: ['data.home'],
      [Symbol('evil')]: 1,
    };
    expect(sanitizeParseHealthReport(symObj)).toBeNull();
    expect(getterHits).toBe(0);

    // 4. ParseHealthTracker.observe guards backward clock skew cleanly
    const tracker = new ParseHealthTracker();
    tracker.observe({
      url: HOME_URL,
      parsed: BROKEN_PAYLOAD,
      extractedTweetCount: 0,
      now: 1_700_000_020_000,
    });
    tracker.observe({
      url: HOME_URL,
      parsed: BROKEN_PAYLOAD,
      extractedTweetCount: 0,
      now: 1_700_000_005_000, // backward jump
    });
    expect(tracker.getState().lastFailureAt).toBe(1_700_000_020_000);
    for (let i = 0; i < 2; i++) {
      tracker.observe({
        url: HOME_URL,
        parsed: BROKEN_PAYLOAD,
        extractedTweetCount: 0,
        now: 1_700_000_025_000 + i * 2000,
      });
    }
    const degraded = tracker.observe({
      url: HOME_URL,
      parsed: BROKEN_PAYLOAD,
      extractedTweetCount: 0,
      now: 1_700_000_036_000,
    });
    expect(degraded).not.toBeNull();
    expect(degraded!.lastFailureAt!).toBeGreaterThanOrEqual(
      degraded!.firstFailureAt! + PARSE_HEALTH_MIN_SPAN_MS
    );
  });

  it('BUG-R2-2 regression: rejects single-sided timestamps, keeps omitted/dropped timestamps round-trip consistent across storage/readParseHealth/store.ts, and prevents storage-vs-UI split-brain', async () => {
    const env = mockChrome({});
    const now = Date.now();

    // 1. Single-sided firstFailureAt-only (future & epoch 0) and lastFailureAt-only reports are rejected
    const singleSidedReports = [
      {
        status: 'degraded',
        consecutiveZeroCount: 5,
        firstFailureAt: now + 60_000,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      },
      {
        status: 'degraded',
        consecutiveZeroCount: 5,
        firstFailureAt: 0,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      },
      {
        status: 'degraded',
        consecutiveZeroCount: 5,
        lastFailureAt: now,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      },
      {
        status: 'degraded',
        consecutiveZeroCount: 5,
        firstFailureAt: 1_700_000_000_000,
        lastFailureAt: 1e20,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      },
    ];
    for (const bad of singleSidedReports) {
      expect(sanitizeParseHealthReport(bad)).toBeNull();
      const updated = await updateParseHealth(bad);
      expect(updated.status).toBe('ok');
      expect((await readParseHealth()).status).toBe('ok');
      expect(env.values[UI_KEYS.health]).toBeUndefined();
    }

    // 2. Both omitted & both out-of-range-dropped timestamps round-trip identically without fabricating span===0
    for (const noTsReport of [
      {
        status: 'degraded',
        consecutiveZeroCount: 5,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      },
      {
        status: 'degraded',
        consecutiveZeroCount: 6,
        firstFailureAt: Number.MAX_SAFE_INTEGER,
        lastFailureAt: 1e20,
        endpoints: ['SearchTimeline'],
        topKeys: ['data.search'],
      },
    ]) {
      const updated = await updateParseHealth(noTsReport);
      const rawStored = env.values[UI_KEYS.health] as Record<string, unknown>;
      const readBack = await readParseHealth();
      expect(updated.status).toBe('degraded');
      expect(updated.firstFailureAt).toBeUndefined();
      expect(updated.lastFailureAt).toBeUndefined();
      expect(rawStored.firstFailureAt).toBeUndefined();
      expect(rawStored.lastFailureAt).toBeUndefined();
      expect(readBack).toEqual(updated);
      expect(normalizeParseHealth(rawStored)).toEqual(updated);
    }

    // 3. Merging valid timestamp pair into timestamp-omitted degraded state adopts valid span,
    // and subsequent timestamp-omitted follow-up preserves that valid span without synthesizing now
    const withSpan = await updateParseHealth({
      status: 'degraded',
      consecutiveZeroCount: 7,
      firstFailureAt: 1_700_000_000_000,
      lastFailureAt: 1_700_000_020_000,
      endpoints: ['HomeTimeline'],
      topKeys: ['data.home'],
    });
    expect(withSpan.firstFailureAt).toBe(1_700_000_000_000);
    expect(withSpan.lastFailureAt).toBe(1_700_000_020_000);
    const preserved = await updateParseHealth({
      status: 'degraded',
      consecutiveZeroCount: 9,
      endpoints: ['TweetDetail'],
      topKeys: ['data.detail'],
    });
    expect(preserved.firstFailureAt).toBe(1_700_000_000_000);
    expect(preserved.lastFailureAt).toBe(1_700_000_020_000);
    expect(await readParseHealth()).toEqual(preserved);

    // 4. store.ts onStorage normalizes corrupt/spoofed kxc_health_v1 storage writes to match readParseHealth()
    env.api.runtime.sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        config: createDefaultConfig('standard'),
        snapshot: {
          version: 1,
          updatedAt: '2026-11-26T00:00:00.000Z',
          domain: 'keepxclean.com',
          totalAccounts: 0,
          totalReports: 0,
          counts: {},
          cloudKeywords: [],
        },
        logs: [],
        stats: {
          todayDate: '2026-11-26',
          todayBlocked: 0,
          totalBlocked: 0,
          byRule: {},
        },
        sync: { status: 'idle', source: 'builtin' },
        cloudSync: { enabled: false, status: 'idle' },
        health: await readParseHealth(),
        operations: [],
        imports: [],
      },
    });
    const unsub = subscribe(() => undefined);
    try {
      await reload();
      expect(getState().data?.health.status).toBe('degraded');

      // Direct corrupt storage writes (span===0, inverted, single-sided) MUST normalize to 'ok' in live UI store
      for (const corrupt of [
        {
          status: 'degraded',
          consecutiveZeroCount: 5,
          firstFailureAt: now,
          lastFailureAt: now,
          endpoints: ['HomeTimeline'],
          topKeys: ['data.home'],
        },
        {
          status: 'degraded',
          consecutiveZeroCount: 5,
          firstFailureAt: now + 60_000,
          lastFailureAt: now,
          endpoints: ['HomeTimeline'],
          topKeys: ['data.home'],
        },
        {
          status: 'degraded',
          consecutiveZeroCount: 5,
          firstFailureAt: 0,
          endpoints: ['HomeTimeline'],
          topKeys: ['data.home'],
        },
      ]) {
        await env.api.storage.local.set({ [UI_KEYS.health]: corrupt });
        expect(getState().data?.health.status).toBe('ok');
        expect(getState().data?.health).toEqual(await readParseHealth());
      }

      // Timestamp-omitted valid degraded write via updateParseHealth syncs identically into store.ts
      await updateParseHealth({
        status: 'degraded',
        consecutiveZeroCount: 5,
        firstFailureAt: Number.MAX_SAFE_INTEGER,
        lastFailureAt: 1e20,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      });
      const expectedHealth = await readParseHealth();
      expect(expectedHealth.status).toBe('degraded');
      expect(expectedHealth.firstFailureAt).toBeUndefined();
      expect(expectedHealth.lastFailureAt).toBeUndefined();
      expect(getState().data?.health).toEqual(expectedHealth);
    } finally {
      unsub();
    }
  });
});
