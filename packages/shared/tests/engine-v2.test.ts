import { describe, expect, it } from 'vitest';
import {
  applyPresetToConfig,
  CLOUD_KEYWORD_LANG_GROUPS,
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  DEFAULT_CLOUD_KEYWORDS,
  detectSceneFromUrl,
  detectTimelineFeedFromUrl,
  evaluateAuthorProfile,
  evaluateTweet,
  extractHostnameFromUrl,
  getBlockReasonLabels,
  getBridgeMessages,
  getCloudKeywordNote,
  getEngineMessages,
  getTweetLanguageLabel,
  hasLocalizedCloudKeywordNote,
  isCloudKeywordLangGroup,
  isOfficialGrokAuthor,
  isValidDomainRule,
  localeToCloudLangGroup,
  matchesDomainRule,
  mergeAuthors,
  mergeCloudKeywords,
  normalizeDomainRule,
  normalizeReplyForDedup,
  OFFICIAL_GROK_UID,
  PRESET_DEFINITIONS,
  processGraphqlResponsePayload,
  resolveEnabledCloudLangGroups,
  SlidingWindowTracker,
  SUPPORTED_LOCALES,
  ThreadDuplicateTracker,
  type BlockReasonTag,
  type ExtractedAuthor,
  type ExtractedTweet,
  type FilterConfig,
  type KeywordMatchScope,
  type KeywordRuleItem,
  type SupportedLocale,
  type TriggeredRuleId,
} from '../src';

function makeAuthor(overrides: Partial<ExtractedAuthor> = {}): ExtractedAuthor {
  return {
    restId: '20001',
    screenName: 'regular_user',
    name: 'Regular User',
    bio: 'Building clean software tools',
    bioUrls: [],
    createdAt: '2020-01-01T00:00:00.000Z',
    accountAgeDays: 1200,
    statusesCount: 800,
    dailyTweetRate: 1.5,
    followersCount: 900,
    friendsCount: 250,
    followRatio: 0.28,
    mediaCount: 40,
    favouritesCount: 300,
    isBlueVerified: false,
    following: false,
    defaultProfileImage: false,
    ...overrides,
  };
}

function makeTweet(
  overrides: Partial<ExtractedTweet> = {},
  authorOverrides: Partial<ExtractedAuthor> = {}
): ExtractedTweet {
  return {
    tweetId: '888001',
    text: 'A thoughtful post sharing engineering benchmarks and reproducible metrics.',
    urls: [],
    hashtagCount: 0,
    cashtagCount: 0,
    isPromoted: false,
    isReply: false,
    replyCount: 3,
    favoriteCount: 18,
    viewCount: 500,
    scene: 'timeline',
    author: makeAuthor(authorOverrides),
    ...overrides,
  };
}

describe('Engine v2 — F01–F03 Grok Interaction Controls', () => {
  it('identifies official @grok strictly by UID or exact handle and rejects lookalikes', () => {
    expect(
      isOfficialGrokAuthor({ restId: OFFICIAL_GROK_UID, screenName: 'grok' })
    ).toBe(true);
    expect(
      isOfficialGrokAuthor({
        restId: OFFICIAL_GROK_UID,
        screenName: 'GrokRenamed',
      })
    ).toBe(true);
    expect(isOfficialGrokAuthor({ restId: '99999', screenName: 'Grok' })).toBe(
      true
    );
    expect(isOfficialGrokAuthor({ restId: '99999', screenName: 'GROK' })).toBe(
      true
    );

    // Lookalikes and spoofs must NEVER match
    expect(
      isOfficialGrokAuthor({ restId: '99999', screenName: 'grok_bot' })
    ).toBe(false);
    expect(
      isOfficialGrokAuthor({ restId: '99999', screenName: 'grok123' })
    ).toBe(false);
    expect(isOfficialGrokAuthor({ restId: '99999', screenName: 'gr0k' })).toBe(
      false
    );
    expect(isOfficialGrokAuthor({ restId: '99999', screenName: 'grok ' })).toBe(
      false
    );
    expect(isOfficialGrokAuthor(null)).toBe(false);
    expect(isOfficialGrokAuthor(undefined)).toBe(false);
  });

  it('protects official @grok from highFrequency (daily, window, profile badge) and replySpam while catching lookalikes', () => {
    for (const preset of ['light', 'standard', 'strict'] as const) {
      const cfg = createDefaultConfig(preset);
      expect(cfg.rules.grokFilter.enabled).toBe(true);
      expect(cfg.rules.grokFilter.protectOfficialGrok).toBe(true);
      expect(cfg.rules.grokFilter.hideGrokReplies).toBe(false);
      expect(cfg.rules.grokFilter.maxMentionWeightedLength).toBe(16);
      expect(cfg.rules.grokFilter.blockShortMentions).toBe(preset === 'strict');
    }

    const config = createDefaultConfig('strict');
    const windowTracker = new SlidingWindowTracker();
    const dupTracker = new ThreadDuplicateTracker();

    const officialGrok = makeAuthor({
      restId: OFFICIAL_GROK_UID,
      screenName: 'grok',
      name: 'Grok',
      statusesCount: 500_000,
      dailyTweetRate: 5000,
      followersCount: 4_000_000,
    });

    // Zero high-frequency profile risk badges for official @grok
    const profileRes = evaluateAuthorProfile(officialGrok, config);
    expect(profileRes.riskBadges).toEqual([]);

    // Protected across daily rate AND sliding window spam thresholds
    for (let i = 1; i <= 10; i++) {
      const res = evaluateTweet(
        makeTweet({ tweetId: `g-${i}`, scene: 'timeline' }, officialGrok),
        config,
        null,
        windowTracker
      );
      expect(res.blocked).toBe(false);
    }

    // Protected from short reply & duplicate reply rules
    const grokShortReply = makeTweet(
      {
        tweetId: 'g-reply-1',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'f-1',
        text: '@user Yes.',
      },
      officialGrok
    );
    expect(
      evaluateTweet(grokShortReply, config, null, windowTracker, true, dupTracker)
        .blocked
    ).toBe(false);

    // Lookalike @grok_official with high daily tweet rate IS still caught
    const lookalikeTweet = makeTweet(
      { tweetId: 'fake-grok-1' },
      {
        restId: '55555',
        screenName: 'grok_official',
        name: 'Grok',
        statusesCount: 90_000,
        dailyTweetRate: 500,
      }
    );
    const lookalikeRes = evaluateTweet(lookalikeTweet, config);
    expect(lookalikeRes.blocked).toBe(true);
    expect(lookalikeRes.ruleId).toBe('high_frequency_daily');

    // Disabling protectOfficialGrok re-enables highFrequency on @grok
    config.rules.grokFilter.protectOfficialGrok = false;
    const unprotectedRes = evaluateTweet(
      makeTweet({ tweetId: 'g-unprotected' }, officialGrok),
      config
    );
    expect(unprotectedRes.blocked).toBe(true);
    expect(unprotectedRes.ruleId).toBe('high_frequency_daily');
    expect(
      evaluateAuthorProfile(officialGrok, config).riskBadges.length
    ).toBeGreaterThan(0);
  });

  it('supports opt-in hideGrokReplies overriding protectOfficialGrok while respecting whitelist, profile badge-only, and bypass', () => {
    const config = createDefaultConfig('standard');
    config.rules.grokFilter.protectOfficialGrok = true;
    config.rules.grokFilter.hideGrokReplies = true;

    const grokReply = makeTweet(
      {
        tweetId: 'gr-1',
        scene: 'reply',
        isReply: true,
        text: '@someone Here is the summary you requested.',
      },
      {
        restId: OFFICIAL_GROK_UID,
        screenName: 'grok',
        name: 'Grok',
        statusesCount: 500_000,
        dailyTweetRate: 5000,
      }
    );

    const hiddenRes = evaluateTweet(grokReply, config);
    expect(hiddenRes.blocked).toBe(true);
    expect(hiddenRes.ruleId).toBe('grok_filter');
    expect(hiddenRes.matchedTarget).toEqual({ kind: 'rule', id: 'grokFilter' });

    // Standalone original @grok timeline post is NOT hidden
    const grokOriginal = makeTweet(
      {
        tweetId: 'gr-orig',
        scene: 'timeline',
        isReply: false,
        text: 'Introducing Grok 3.',
      },
      grokReply.author
    );
    expect(evaluateTweet(grokOriginal, config).blocked).toBe(false);

    // Profile Replies tab respects profileSceneBadgeOnly
    const grokProfileReply = makeTweet(
      {
        tweetId: 'gr-profile',
        scene: 'profile',
        isReply: true,
        text: '@someone Here is an answer.',
      },
      grokReply.author
    );
    const badgeRes = evaluateTweet(grokProfileReply, config);
    expect(badgeRes.blocked).toBe(false);
    expect(badgeRes.action).toBe('badge_only');
    expect(badgeRes.ruleId).toBe('grok_filter');
    expect(badgeRes.matchedTarget).toEqual({ kind: 'rule', id: 'grokFilter' });

    // Scene bypass skips hideGrokReplies
    const bypassConfig = createDefaultConfig('standard');
    bypassConfig.rules.grokFilter.hideGrokReplies = true;
    bypassConfig.sceneModes = { reply: 'bypass' };
    expect(evaluateTweet(grokReply, bypassConfig).blocked).toBe(false);

    // Explicit whitelist overrides hideGrokReplies
    config.whitelistUids[OFFICIAL_GROK_UID] = {
      uid: OFFICIAL_GROK_UID,
      screenName: 'grok',
      addedAt: 1,
    };
    expect(evaluateTweet(grokReply, config).blocked).toBe(false);
  });

  it('filters reply-only short @grok summons before replySpam with exact boundary, regex safety, and exemptions', () => {
    const standardCfg = createDefaultConfig('standard');
    const shortSummon = makeTweet({
      scene: 'reply',
      isReply: true,
      text: '@op @grok 真的吗',
    });

    // Disabled in standard (falls through to replySpam only if < minWeightedLength 6; 真的吗 = 6 so allowed)
    expect(evaluateTweet(shortSummon, standardCfg).blocked).toBe(false);

    // Enabled in strict -> attributed strictly to 'grok_filter' (NOT 'reply_spam', even though weight 6 < strict min 10!)
    const strictCfg = createDefaultConfig('strict');
    const strictRes = evaluateTweet(shortSummon, strictCfg);
    expect(strictRes.blocked).toBe(true);
    expect(strictRes.ruleId).toBe('grok_filter');
    expect(strictRes.matchedTarget).toEqual({ kind: 'rule', id: 'grokFilter' });

    // Exact boundary: maxMentionWeightedLength = 16 -> 16 blocked, 17 allowed
    const len16 = makeTweet({
      scene: 'reply',
      isReply: true,
      text: '@grok abcdefghijklmnop', // 16 ASCII letters
    });
    const len17 = makeTweet({
      scene: 'reply',
      isReply: true,
      text: '@grok abcdefghijklmnopq', // 17 ASCII letters
    });
    expect(evaluateTweet(len16, strictCfg).ruleId).toBe('grok_filter');
    expect(evaluateTweet(len17, strictCfg).blocked).toBe(false);

    // No-space CJK before @grok and punctuation-only summons
    expect(
      evaluateTweet(
        makeTweet({ scene: 'reply', isReply: true, text: '请问@grok真的吗' }),
        strictCfg
      ).ruleId
    ).toBe('grok_filter');
    expect(
      evaluateTweet(
        makeTweet({ scene: 'reply', isReply: true, text: '@GROK?' }),
        strictCfg
      ).ruleId
    ).toBe('grok_filter');

    // Non-matches: email addresses, lookalike handles, URLs containing @grok, standalone timeline posts
    for (const safeText of [
      'Contact user@grok.com for press inquiries about this release.',
      'Email a.b@grok.io for documentation support on this topic.',
      'Reach out to @grok_ai about the benchmark results.',
      'See https://x.com/@grok for full changelog details.',
    ]) {
      const res = evaluateTweet(
        makeTweet({ scene: 'reply', isReply: true, text: safeText }),
        strictCfg
      );
      expect(res.ruleId, `Should not trigger grok_filter for: ${safeText}`).not.toBe(
        'grok_filter'
      );
    }

    // Standalone timeline tweet mentioning @grok is NOT blocked
    expect(
      evaluateTweet(
        makeTweet({ scene: 'timeline', isReply: false, text: '@grok' }),
        strictCfg
      ).blocked
    ).toBe(false);

    // Exemptions: focal OP, followed author, whitelist, official @grok
    expect(
      evaluateTweet(
        makeTweet(
          {
            scene: 'reply',
            isReply: true,
            text: '@grok 真的吗',
            focalAuthor: {
              restId: 'u-op',
              screenName: 'op',
              name: 'OP',
              followersCount: 5000,
            },
          },
          { restId: 'u-op' }
        ),
        strictCfg
      ).blocked
    ).toBe(false);

    expect(
      evaluateTweet(
        makeTweet(
          { scene: 'reply', isReply: true, text: '@grok 真的吗' },
          { following: true }
        ),
        strictCfg
      ).blocked
    ).toBe(false);

    expect(
      evaluateTweet(
        makeTweet(
          { scene: 'reply', isReply: true, text: '@grok 真的吗' },
          { restId: OFFICIAL_GROK_UID, screenName: 'grok' }
        ),
        strictCfg
      ).blocked
    ).toBe(false);
  });
});

describe('Engine v2 — F04 Same-Thread Duplicate Replies & ThreadDuplicateTracker', () => {
  it('normalizes replies with NFKC, case folding, mention/URL/punct stripping and enforces >= 12 boundary', () => {
    const a = normalizeReplyForDedup(
      '@alice @bob  Ｈｅｌｌｏ   World!! https://t.co/abc123 🔥'
    );
    const b = normalizeReplyForDedup('@charlie hello world???');
    expect(a.normalized).toBe('helloworld');
    expect(a.normalized).toBe(b.normalized);
    expect(a.weightedLength).toBe(10); // < 12

    const cjk = normalizeReplyForDedup('@op 这个观点真的太有道理了！');
    expect(cjk.weightedLength).toBe(22); // 11 CJK chars * 2
  });

  it('keeps 1st occurrence, blocks 2nd+ from different UIDs, stays idempotent on re-eval, and enforces exemptions', () => {
    const config = createDefaultConfig('standard');
    expect(PRESET_DEFINITIONS.light.rules.replySpam.blockDuplicateReplies).toBe(
      false
    );
    expect(
      PRESET_DEFINITIONS.standard.rules.replySpam.blockDuplicateReplies
    ).toBe(true);
    expect(
      PRESET_DEFINITIONS.strict.rules.replySpam.blockDuplicateReplies
    ).toBe(true);

    const tracker = new ThreadDuplicateTracker();

    // Boundary: weightedLength === 11 -> NOT deduplicated
    const short11A = makeTweet(
      {
        tweetId: 's11-1',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-1',
        text: '@op Hello World', // 10 letters
      },
      { restId: 'u-1' }
    );
    const short11B = makeTweet(
      {
        tweetId: 's11-2',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-1',
        text: '@op Hello World!',
      },
      { restId: 'u-2' }
    );
    const len11A = makeTweet(
      {
        tweetId: 'l11-1',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-1',
        text: '@op abcdefghijk', // 11
      },
      { restId: 'u-1' }
    );
    const len11B = makeTweet(
      {
        tweetId: 'l11-2',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-1',
        text: '@op abcdefghijk', // 11
      },
      { restId: 'u-2' }
    );
    expect(
      evaluateTweet(short11A, config, null, undefined, true, tracker).blocked
    ).toBe(false);
    expect(
      evaluateTweet(short11B, config, null, undefined, true, tracker).blocked
    ).toBe(false);
    expect(
      evaluateTweet(len11A, config, null, undefined, true, tracker).blocked
    ).toBe(false);
    expect(
      evaluateTweet(len11B, config, null, undefined, true, tracker).blocked
    ).toBe(false);

    // Exact boundary weightedLength === 12 -> 1st kept, 2nd & 3rd from different UIDs blocked
    const r1 = makeTweet(
      {
        tweetId: 'd-1',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-100',
        text: '@op abcdefghijkl',
      },
      { restId: 'bot-1' }
    );
    const r2 = makeTweet(
      {
        tweetId: 'd-2',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-100',
        text: '@other ＡＢＣＤＥＦＧＨＩＪＫＬ!! https://t.co/x',
      },
      { restId: 'bot-2' }
    );
    const r3 = makeTweet(
      {
        tweetId: 'd-3',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-100',
        text: 'abcdefghijkl🔥',
      },
      { restId: 'bot-3' }
    );

    expect(
      evaluateTweet(r1, config, null, undefined, true, tracker).blocked
    ).toBe(false);

    const res2 = evaluateTweet(r2, config, null, undefined, true, tracker);
    expect(res2.blocked).toBe(true);
    expect(res2.ruleId).toBe('reply_spam');
    expect(res2.matchedTarget).toEqual({ kind: 'rule', id: 'replySpam' });
    expect(res2.evidence).toContainEqual({
      label: 'Duplicate count',
      value: 2,
    });

    const res3 = evaluateTweet(r3, config, null, undefined, true, tracker);
    expect(res3.blocked).toBe(true);
    expect(res3.evidence).toContainEqual({
      label: 'Duplicate count',
      value: 3,
    });

    // Idempotency: re-evaluating 1st tweet still allows; re-evaluating 2nd with recordObservation=false still blocks
    expect(
      evaluateTweet(r1, config, null, undefined, false, tracker).blocked
    ).toBe(false);
    expect(
      evaluateTweet(r1, config, null, undefined, true, tracker).blocked
    ).toBe(false);
    expect(
      evaluateTweet(r2, config, null, undefined, false, tracker).blocked
    ).toBe(true);

    // Same author posting again is NOT self-blocked
    const sameAuthor = makeTweet(
      {
        tweetId: 'd-same',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-100',
        text: 'abcdefghijkl',
      },
      { restId: 'bot-1' }
    );
    expect(
      evaluateTweet(sameAuthor, config, null, undefined, true, tracker).blocked
    ).toBe(false);

    // Different thread does NOT collide
    const otherThread = makeTweet(
      {
        tweetId: 'd-other-th',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-200',
        text: 'abcdefghijkl',
      },
      { restId: 'bot-9' }
    );
    expect(
      evaluateTweet(otherThread, config, null, undefined, true, tracker).blocked
    ).toBe(false);

    // Timeline scene is NEVER blocked by blockDuplicateReplies
    const timelineCopy = makeTweet(
      {
        tweetId: 'd-tl',
        scene: 'timeline',
        isReply: true,
        focalTweetId: 'th-100',
        text: 'abcdefghijkl',
      },
      { restId: 'bot-8' }
    );
    expect(
      evaluateTweet(timelineCopy, config, null, undefined, true, tracker).blocked
    ).toBe(false);

    // Light preset has blockDuplicateReplies = false
    const lightCfg = createDefaultConfig('light');
    expect(
      evaluateTweet(r2, lightCfg, null, undefined, false, tracker).blocked
    ).toBe(false);

    // Exemptions: focal OP, followed author, whitelist
    const opCopy = makeTweet(
      {
        tweetId: 'd-op',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-100',
        text: 'abcdefghijkl',
        focalAuthor: {
          restId: 'u-op',
          screenName: 'op',
          name: 'OP',
          followersCount: 1000,
        },
      },
      { restId: 'u-op' }
    );
    expect(
      evaluateTweet(opCopy, config, null, undefined, false, tracker).blocked
    ).toBe(false);

    const followedCopy = makeTweet(
      {
        tweetId: 'd-fol',
        scene: 'reply',
        isReply: true,
        focalTweetId: 'th-100',
        text: 'abcdefghijkl',
      },
      { restId: 'u-fol', following: true }
    );
    expect(
      evaluateTweet(followedCopy, config, null, undefined, false, tracker)
        .blocked
    ).toBe(false);
  });

  it('evicts oldest threads/signatures gracefully under bounded memory and works across TweetDetail GraphQL pagination', () => {
    const tracker = new ThreadDuplicateTracker();
    // Insert 205 threads (cap is 200) -> oldest thread evicted cleanly
    for (let i = 0; i < 205; i++) {
      expect(
        tracker.recordAndCheck(`th-${i}`, `t-${i}`, 'u-1', 'sharedsignature123')
      ).toBe(false);
    }
    // th-0 was evicted so bot-2 is treated as new origin rather than duplicate
    expect(
      tracker.isDuplicate('th-0', 't-new', 'u-2', 'sharedsignature123')
    ).toBe(false);
    // th-204 is still retained
    expect(
      tracker.isDuplicate('th-204', 't-new', 'u-2', 'sharedsignature123')
    ).toBe(true);
    tracker.clear();
    expect(
      tracker.isDuplicate('th-204', 't-new', 'u-2', 'sharedsignature123')
    ).toBe(false);

    // GraphQL pagination across two TweetDetail responses sharing a tracker + single-response without 7th arg
    const config = createDefaultConfig('standard');
    config.interceptionMode = 'collapse';
    const makeReplyPayload = (tweetId: string, uid: string, text: string) => ({
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  entryId: `reply-${tweetId}`,
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: tweetId,
                          legacy: {
                            full_text: text,
                            in_reply_to_status_id_str: '7777',
                          },
                          core: {
                            user_results: {
                              result: {
                                rest_id: uid,
                                legacy: {
                                  screen_name: `user_${uid}`,
                                  name: `User ${uid}`,
                                  statuses_count: 100,
                                  followers_count: 150,
                                  created_at: 'Wed Jan 01 00:00:00 +0000 2022',
                                },
                              },
                            },
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
    });

    const sharedTracker = new ThreadDuplicateTracker();
    const page1 = processGraphqlResponsePayload(
      makeReplyPayload('8001', 'u-1', 'Amazing project launch to the moon!'),
      'https://x.com/i/api/graphql/xxx/TweetDetail',
      '/alice/status/7777',
      config,
      null,
      undefined,
      sharedTracker
    );
    expect(page1.decisionsByTweetId['8001'].decision.blocked).toBe(false);

    const page2 = processGraphqlResponsePayload(
      makeReplyPayload('8002', 'u-2', 'Amazing project launch to the moon!!!'),
      'https://x.com/i/api/graphql/xxx/TweetDetail',
      '/alice/status/7777',
      config,
      null,
      undefined,
      sharedTracker
    );
    expect(page2.decisionsByTweetId['8002'].decision.blocked).toBe(true);
    expect(page2.decisionsByTweetId['8002'].decision.ruleId).toBe('reply_spam');

    // Single-response duplicate detection works even when caller omits 7th duplicateTracker argument
    const combinedPayload = makeReplyPayload(
      '8101',
      'u-10',
      'Incredible announcement congrats to the team!'
    );
    combinedPayload.data.threaded_conversation_with_injections_v2.instructions[0].entries.push(
      makeReplyPayload(
        '8102',
        'u-11',
        'Incredible announcement congrats to the team!'
      ).data.threaded_conversation_with_injections_v2.instructions[0].entries[0]!
    );
    const singleRes = processGraphqlResponsePayload(
      combinedPayload,
      'https://x.com/i/api/graphql/xxx/TweetDetail',
      '/alice/status/7777',
      config
    );
    expect(singleRes.decisionsByTweetId['8101'].decision.blocked).toBe(false);
    expect(singleRes.decisionsByTweetId['8102'].decision.blocked).toBe(true);
    expect(singleRes.decisionsByTweetId['8102'].decision.ruleId).toBe(
      'reply_spam'
    );
  });
});

describe('Engine v2 — F05 Structured External Domain Filter & quotedUrls', () => {
  it('normalizes, validates, extracts hostnames, and strictly matches exact + subdomain rules', () => {
    expect(
      normalizeDomainRule('HTTPS://User:Pass@WWW.T.ME:443/abc?x=1#y')
    ).toBe('t.me');
    expect(normalizeDomainRule('*.sub.Pump.Fun.')).toBe('sub.pump.fun');
    expect(normalizeDomainRule('www.com')).toBe('www.com');
    expect(normalizeDomainRule('mailto:user@t.me')).toBe('');

    expect(isValidDomainRule('t.me')).toBe(true);
    expect(isValidDomainRule('sub-1.co.uk')).toBe(true);
    expect(isValidDomainRule('xn--mnchen-3ya.de')).toBe(true);

    for (const bad of [
      '',
      'localhost',
      'com',
      '192.168.1.1',
      '[::1]',
      'a..b.com',
      '-a.com',
      'a_b.com',
      'https://t.me',
      '*.t.me',
      't.me.',
      'a.x',
    ]) {
      expect(isValidDomainRule(bad), `Expected invalid: ${bad}`).toBe(false);
    }

    expect(extractHostnameFromUrl('https://sub.t.me.:8443/join')).toBe(
      'sub.t.me'
    );
    expect(extractHostnameFromUrl('mailto:user@t.me')).toBeNull();
    expect(extractHostnameFromUrl('javascript:alert(1)')).toBeNull();

    expect(matchesDomainRule('t.me', 't.me')).toBe(true);
    expect(matchesDomainRule('sub.t.me', 't.me')).toBe(true);
    expect(matchesDomainRule('www.t.me', 't.me')).toBe(true);
    // Anti-substring guarantees
    expect(matchesDomainRule('not-t.me', 't.me')).toBe(false);
    expect(matchesDomainRule('t.me.evil.com', 't.me')).toBe(false);
    expect(matchesDomainRule('xt.me', 't.me')).toBe(false);
    expect(matchesDomainRule('notpump.fun', 'pump.fun')).toBe(false);
    expect(matchesDomainRule('pump.fun.evil.com', 'pump.fun')).toBe(false);
  });

  it('scans tweet urls, quotedUrls, and primary/RT/QT bioUrls with secondary hit_uid and respects whitelisted quotedAuthor', () => {
    const config = createDefaultConfig('standard');
    config.rules.domainFilter.items.push({
      id: 'dom-spam-1',
      domain: 'https://www.spam-promo.example/ref',
      enabled: true,
    });
    config.rules.domainFilter.items.push({
      id: 'dom-reply-only',
      domain: 'reply-funnel.example',
      onlyInReplies: true,
      maxFollowersExempt: 5000,
      enabled: true,
    });

    // Subdomain match on tweet.urls
    const subHit = evaluateTweet(
      makeTweet({ urls: ['https://app.spam-promo.example/drop'] }),
      config
    );
    expect(subHit.blocked).toBe(true);
    expect(subHit.ruleId).toBe('domain_filter');
    expect(subHit.matchedTarget).toEqual({ kind: 'domain', id: 'dom-spam-1' });
    expect(subHit.evidence).toContainEqual({
      label: 'Matched domain',
      value: 'spam-promo.example',
    });
    expect(subHit.evidence).toContainEqual({
      label: 'Matched host',
      value: 'app.spam-promo.example',
    });

    // Quoted tweet URL attributes hit_uid to quotedAuthor
    const qtTweet = makeTweet(
      {
        text: 'Check what this account posted',
        quotedUrls: ['https://shop.spam-promo.example/item'],
        quotedAuthor: makeAuthor({
          restId: 'u-qt-99',
          screenName: 'qt_spammer',
        }),
      },
      { restId: 'u-friend', following: true }
    );
    const qtRes = evaluateTweet(qtTweet, config);
    expect(qtRes.blocked).toBe(true);
    expect(qtRes.ruleId).toBe('domain_filter');
    expect(qtRes.evidence).toContainEqual({
      key: 'hit_uid',
      label: 'Matched UID',
      value: 'u-qt-99',
    });

    // Whitelisted quotedAuthor MUST NOT be bypassed by leaking quotedUrls onto primary!
    config.whitelistUids['u-qt-99'] = {
      uid: 'u-qt-99',
      screenName: 'qt_spammer',
      addedAt: 1,
    };
    expect(evaluateTweet(qtTweet, config).blocked).toBe(false);

    // Also verify matchKeywordList respects whitelisted quotedAuthor for quotedUrls
    config.rules.keywords.items.push({
      id: 'kw-url-1',
      pattern: 'spam-promo.example',
      isRegex: false,
      scopes: ['url'],
      enabled: true,
    });
    expect(evaluateTweet(qtTweet, config).blocked).toBe(false);

    // Unwhitelisted quotedAuthor bioUrls + onlyInReplies + maxFollowersExempt
    const replyOnlyFail = evaluateTweet(
      makeTweet(
        { scene: 'timeline', isReply: false },
        { bioUrls: ['https://reply-funnel.example/me'], followersCount: 200 }
      ),
      config
    );
    expect(replyOnlyFail.blocked).toBe(false);

    const replyOnlyExempt = evaluateTweet(
      makeTweet(
        { scene: 'reply', isReply: true },
        { bioUrls: ['https://reply-funnel.example/me'], followersCount: 8000 }
      ),
      config
    );
    expect(replyOnlyExempt.blocked).toBe(false);

    const replyOnlyBlocked = evaluateTweet(
      makeTweet(
        { scene: 'reply', isReply: true },
        { bioUrls: ['https://go.reply-funnel.example/me'], followersCount: 200 }
      ),
      config
    );
    expect(replyOnlyBlocked.blocked).toBe(true);
    expect(replyOnlyBlocked.ruleId).toBe('domain_filter');
    expect(replyOnlyBlocked.matchedTarget).toEqual({
      kind: 'domain',
      id: 'dom-reply-only',
    });

    // applyPresetToConfig preserves domainFilter
    const switched = applyPresetToConfig(config, 'strict');
    expect(switched.rules.domainFilter).toEqual(config.rules.domainFilter);
  });

  it('extracts quotedUrls across legacy, 2026 Relay, NoteTweet, and RT-of-QT in GraphQL parser', () => {
    const config = createDefaultConfig('standard');
    config.rules.domainFilter.items.push({
      id: 'dom-qt',
      domain: 'quoted-evil.example',
      enabled: true,
    });
    config.rules.keywords.items.push({
      id: 'kw-note-url',
      pattern: 'note-link.example',
      isRegex: false,
      scopes: ['url'],
      enabled: true,
    });

    const rtOfQtPayload = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'rt-qt-1',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: '5001',
                            legacy: {
                              full_text: 'RT @cur: look',
                              retweeted_status_result: {
                                result: {
                                  rest_id: '5002',
                                  legacy: { full_text: 'Interesting thread' },
                                  core: {
                                    user_results: {
                                      result: {
                                        rest_id: 'u-rt',
                                        legacy: {
                                          screen_name: 'curator',
                                          name: 'Curator',
                                          statuses_count: 100,
                                          followers_count: 1000,
                                          created_at:
                                            'Wed Jan 01 00:00:00 +0000 2020',
                                        },
                                      },
                                    },
                                  },
                                  quoted_status_result: {
                                    result: {
                                      rest_id: '5003',
                                      note_tweet: {
                                        note_tweet_results: {
                                          result: {
                                            text: 'Long quoted note text',
                                            entity_set: {
                                              urls: [
                                                {
                                                  expanded_url:
                                                    'https://sub.quoted-evil.example/a',
                                                },
                                              ],
                                            },
                                          },
                                        },
                                      },
                                      core: {
                                        user_results: {
                                          result: {
                                            rest_id: 'u-qt',
                                            legacy: {
                                              screen_name: 'quoted_bad',
                                              name: 'Quoted Bad',
                                              statuses_count: 50,
                                              followers_count: 200,
                                              created_at:
                                                'Wed Jan 01 00:00:00 +0000 2022',
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                            core: {
                              user_results: {
                                result: {
                                  rest_id: 'u-main',
                                  legacy: {
                                    screen_name: 'main_user',
                                    name: 'Main User',
                                    statuses_count: 100,
                                    followers_count: 1000,
                                    created_at:
                                      'Wed Jan 01 00:00:00 +0000 2020',
                                  },
                                },
                              },
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
      },
    };

    const res = processGraphqlResponsePayload(
      rtOfQtPayload,
      'https://x.com/i/api/graphql/xxx/HomeLatestTimeline',
      '/home',
      config
    );
    expect(res.decisionsByTweetId['5001'].tweet.timelineFeed).toBe('following');
    expect(res.decisionsByTweetId['5001'].tweet.quotedUrls).toEqual([
      'https://sub.quoted-evil.example/a',
    ]);
    expect(res.decisionsByTweetId['5001'].decision.blocked).toBe(true);
    expect(res.decisionsByTweetId['5001'].decision.ruleId).toBe('domain_filter');
    expect(res.interceptedLogs[0].authorUid).toBe('u-qt');
  });
});

describe('Engine v2 — F06 10-Language Cloud Keyword Packs', () => {
  const LEGACY_24_IDS = [
    'cloud-cliche-trivia-1',
    'cloud-cliche-hottake-1',
    'cloud-cliche-clickbait-1',
    'cloud-cliche-breaking-1',
    'cloud-cliche-guru-1',
    'cloud-cliche-aislop-cn-1',
    'cloud-cliche-emotion-1',
    'cloud-cliche-aislop-en-1',
    'cloud-cliche-ai-reply-1',
    'cloud-crypto-trading-1',
    'cloud-crypto-meme-1',
    'cloud-crypto-airdrop-1',
    'cloud-scam-crypto-1',
    'cloud-scam-rebate-1',
    'cloud-follow-cn-1',
    'cloud-follow-intl-1',
    'cloud-nsfw-bio-1',
    'cloud-nsfw-bio-2',
    'cloud-scam-support-1',
    'cloud-scam-trojan-1',
    'cloud-spam-tg-1',
    'cloud-scam-whatsapp-1',
    'cloud-gambling-cn-1',
    'cloud-blackmarket-1',
  ];

  it('preserves all 24 legacy IDs, covers all 10 langGroups (45 rules), and has 450 direct 10-locale notes', () => {
    const idSet = new Set(DEFAULT_CLOUD_KEYWORDS.map((k) => k.id));
    for (const legacyId of LEGACY_24_IDS) {
      expect(idSet.has(legacyId), `Missing legacy ID: ${legacyId}`).toBe(true);
    }
    expect(DEFAULT_CLOUD_KEYWORDS).toHaveLength(45);

    const byGroup = new Map<string, number>();
    for (const kw of DEFAULT_CLOUD_KEYWORDS) {
      expect(isCloudKeywordLangGroup(kw.langGroup)).toBe(true);
      expect(kw.packCategory).toBeTruthy();
      expect(kw.maxFollowersExempt).toBeUndefined();
      expect(() => new RegExp(kw.pattern, 'i')).not.toThrow();
      byGroup.set(kw.langGroup!, (byGroup.get(kw.langGroup!) ?? 0) + 1);
      for (const loc of SUPPORTED_LOCALES) {
        expect(
          hasLocalizedCloudKeywordNote(kw.id, loc),
          `Missing direct note for ${kw.id} in ${loc}`
        ).toBe(true);
      }
    }

    for (const g of CLOUD_KEYWORD_LANG_GROUPS) {
      expect(byGroup.get(g) ?? 0, `Group ${g} count`).toBeGreaterThanOrEqual(3);
    }
  });

  it('maps locales to lang groups, resolves defaults vs explicit arrays (including []), and preserves metadata in mergeCloudKeywords', () => {
    expect(localeToCloudLangGroup('zh-CN')).toBe('zh');
    expect(localeToCloudLangGroup('zh-TW')).toBe('zh');
    expect(localeToCloudLangGroup('ja')).toBe('ja');
    expect(localeToCloudLangGroup('ru')).toBe('ru');

    expect(
      resolveEnabledCloudLangGroups({ locale: 'en' })
    ).toEqual(['universal', 'en']);
    expect(
      resolveEnabledCloudLangGroups({ locale: 'zh-CN' })
    ).toEqual(['universal', 'en', 'zh']);
    expect(
      resolveEnabledCloudLangGroups({ locale: 'zh-TW' })
    ).toEqual(['universal', 'en', 'zh']);
    expect(
      resolveEnabledCloudLangGroups({ locale: 'ja' })
    ).toEqual(['universal', 'en', 'ja']);
    expect(
      resolveEnabledCloudLangGroups({
        locale: 'ja',
        enabledCloudLangGroups: [],
      })
    ).toEqual([]);
    expect(
      resolveEnabledCloudLangGroups({
        locale: 'en',
        enabledCloudLangGroups: ['ko', 'ko'],
      })
    ).toEqual(['ko']);

    // mergeCloudKeywords keeps built-in langGroup/packCategory even when remote pauses a built-in rule with 'universal'
    const merged = mergeCloudKeywords([
      {
        id: 'cloud-gambling-cn-1',
        pattern: 'old',
        isRegex: true,
        scopes: ['text'],
        langGroup: 'universal',
        enabled: false,
      },
      {
        id: 'cloud-hotfix-no-lang',
        pattern: 'zero-day-scam',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
    ]);
    const paused = merged.find((k) => k.id === 'cloud-gambling-cn-1')!;
    expect(paused.enabled).toBe(false);
    expect(paused.langGroup).toBe('zh');
    expect(paused.packCategory).toBe('scam');

    const hotfix = merged.find((k) => k.id === 'cloud-hotfix-no-lang')!;
    expect(hotfix.langGroup).toBe('universal');
  });

  it('catches positive spam and avoids false positives across all 7 new language packs (ja, ko, es, pt, fr, de, ru)', () => {
    const samples: Array<{
      group: (typeof CLOUD_KEYWORD_LANG_GROUPS)[number];
      spam: string[];
      clean: string[];
    }> = [
      {
        group: 'ja',
        spam: [
          'リプでフォロバします！相互希望',
          '現金配布！LINE追加で無料プレゼント',
          '裏垢女子です、固ツイの動画見てね',
        ],
        clean: ['今日は渋谷でラーメンを食べました。'],
      },
      {
        group: 'ko',
        spam: [
          '맞팔환영 좋아요 반사해요',
          '무료 리딩방 급등주 추천 수익률 보장',
          '야동 링크 공유합니다 프로필 확인',
        ],
        clean: ['오늘 서울 날씨가 정말 좋네요. 리딩방 피해 뉴스를 읽었습니다.'],
      },
      {
        group: 'es',
        spam: [
          'Sígueme y te sigo 100% devuelvo follow',
          'Ganancias diarias garantizadas con señales cripto VIP',
          'Contenido exclusivo +18 en mi bio, mi página azul',
        ],
        clean: ['Mañana vamos a desplegar la nueva versión del servidor.'],
      },
      {
        group: 'pt',
        spam: [
          'Me segue que sigo de volta, SDV 100%',
          'Pix na hora! Plataforma nova pagando muito no horário pagante',
          'Conteúdo exclusivo +18 na bio e packzinho na DM',
        ],
        clean: ['Acabei de publicar o relatório técnico da semana.'],
      },
      {
        group: 'fr',
        spam: [
          'Abonne-toi, je rends les follows 100%',
          'Gagner de l’argent facilement avec nos signaux trading VIP',
          'Mon MYM en bio et contenu privé en DM',
        ],
        clean: ['Merci pour ce partage très clair sur TypeScript.'],
      },
      {
        group: 'de',
        spam: [
          'Ich folge jedem zurück! Gegenseitig folgen',
          'Garantierte Rendite! Komm in meine VIP-Gruppe für Krypto-Signale',
          'Exklusive Videos in meiner Bio und mein BestFans im Link',
        ],
        clean: ['Porsche Cayman S! Komm in die Gruppe! Ein klassisches Meme.'],
      },
      {
        group: 'ru',
        spam: [
          'Взаимная подписка! Подпишусь взаимно 100%',
          'Раскрутка счета, гарантированный доход и договорной матч',
          'Фулл в био и приватный канал в закрепе',
        ],
        clean: ['Опубликовал приватный репозиторий с тестами на Rust.'],
      },
    ];

    for (const { group, spam, clean } of samples) {
      const enabledCfg = createDefaultConfig('standard');
      enabledCfg.enabledCloudLangGroups = [group];
      const disabledCfg = createDefaultConfig('standard');
      disabledCfg.enabledCloudLangGroups = ['universal'];

      for (const s of spam) {
        const hit = evaluateTweet(makeTweet({ text: s }), enabledCfg);
        expect(hit.blocked, `Expected ${group} to block: ${s}`).toBe(true);
        expect(hit.ruleId).toBe('cloud_keyword');
        expect(hit.matchedTarget?.kind).toBe('cloud_keyword');

        expect(
          evaluateTweet(makeTweet({ text: s }), disabledCfg).blocked,
          `Expected ${group} disabled to allow: ${s}`
        ).toBe(false);
      }

      for (const c of clean) {
        expect(
          evaluateTweet(makeTweet({ text: c }), enabledCfg).blocked,
          `False positive in ${group} for: ${c}`
        ).toBe(false);
      }
    }
  });
});

describe('Engine v2 — F08 For You / Following Detection & sceneModes', () => {
  it('detects HomeLatestTimeline before HomeTimeline', () => {
    expect(
      detectTimelineFeedFromUrl(
        'https://x.com/i/api/graphql/abc/HomeLatestTimeline?variables=%7B%7D'
      )
    ).toBe('following');
    expect(
      detectTimelineFeedFromUrl(
        'https://x.com/i/api/graphql/abc/HomeTimeline?variables=%7B%7D'
      )
    ).toBe('for_you');
    expect(
      detectTimelineFeedFromUrl('https://x.com/i/api/graphql/abc/TweetDetail')
    ).toBeUndefined();
    expect(detectTimelineFeedFromUrl('SSR_RELAY')).toBeUndefined();
  });

  it('applies sceneModes collapse/strip/inherit/bypass while always enforcing promoted_ad, whitelist, and local_blocklist', () => {
    const config = createDefaultConfig('standard');
    config.interceptionMode = 'collapse';
    config.sceneModes = {
      for_you: 'strip',
      following: 'bypass',
      reply: 'collapse',
      search: 'strip',
    };
    config.localBlocklistUids['u-blocked'] = {
      uid: 'u-blocked',
      screenName: 'blocked_guy',
      addedAt: 1,
    };

    const highFreqForYou = makeTweet(
      { scene: 'timeline', timelineFeed: 'for_you' },
      { statusesCount: 9000, dailyTweetRate: 90 }
    );
    expect(evaluateTweet(highFreqForYou, config).action).toBe('strip');

    // timelineFeed === undefined inherits global interceptionMode ('collapse')
    const untypedTimeline = makeTweet(
      { scene: 'timeline' },
      { statusesCount: 9000, dailyTweetRate: 90 }
    );
    expect(evaluateTweet(untypedTimeline, config).action).toBe('collapse');

    // Following bypass skips automatic rules
    const highFreqFollowing = makeTweet(
      { scene: 'timeline', timelineFeed: 'following' },
      { statusesCount: 9000, dailyTweetRate: 90 }
    );
    expect(evaluateTweet(highFreqFollowing, config).blocked).toBe(false);

    // Following bypass STILL strips promoted ads
    const adFollowing = makeTweet({
      scene: 'timeline',
      timelineFeed: 'following',
      isPromoted: true,
    });
    const adRes = evaluateTweet(adFollowing, config);
    expect(adRes.blocked).toBe(true);
    expect(adRes.action).toBe('strip');
    expect(adRes.ruleId).toBe('promoted_ad');

    // Following bypass STILL enforces manual localBlocklistUids using global interceptionMode
    const localBlockedFollowing = makeTweet(
      { scene: 'timeline', timelineFeed: 'following' },
      { restId: 'u-blocked', screenName: 'blocked_guy' }
    );
    const localRes = evaluateTweet(localBlockedFollowing, config);
    expect(localRes.blocked).toBe(true);
    expect(localRes.action).toBe('collapse');
    expect(localRes.ruleId).toBe('local_blocklist');

    // Search override -> strip
    const searchSpam = makeTweet(
      { scene: 'search' },
      { statusesCount: 9000, dailyTweetRate: 90 }
    );
    expect(evaluateTweet(searchSpam, config).action).toBe('strip');
  });
});

describe('Engine v2 — F09 matchedTarget Completeness, F10–F11 Privacy Defaults & Raw v0.1.2 Compatibility', () => {
  it('sets privacy defaults to false and onboardingDismissed to true across all presets', () => {
    for (const preset of ['light', 'standard', 'strict'] as const) {
      const cfg = createDefaultConfig(preset);
      expect(cfg.version).toBe(1);
      expect(cfg.syncNativeXBlock).toBe(false);
      expect(cfg.enableCrowdReport).toBe(false);
      expect(cfg.onboardingDismissed).toBe(true);
      expect(cfg.enabledCloudLangGroups).toBeUndefined();
      expect(cfg.installedPacks).toEqual([]);
      expect(cfg.rules.domainFilter).toEqual({ enabled: true, items: [] });
      expect(cfg.sceneModes).toEqual({
        for_you: 'inherit',
        following: 'inherit',
        reply: 'inherit',
        search: 'inherit',
      });
    }
  });

  it('emits accurate matchedTarget for every single TriggeredRuleId (16/16)', () => {
    const observed = new Map<TriggeredRuleId, { kind: string; id: string }>();
    const record = (res: ReturnType<typeof evaluateTweet>) => {
      expect(res.blocked).toBe(true);
      expect(res.ruleId).toBeDefined();
      expect(res.matchedTarget).toBeDefined();
      observed.set(res.ruleId!, {
        kind: res.matchedTarget!.kind,
        id: res.matchedTarget!.id,
      });
    };

    const base = createDefaultConfig('strict');
    base.enabledCloudLangGroups = [...CLOUD_KEYWORD_LANG_GROUPS];

    // 1. promoted_ad
    record(evaluateTweet(makeTweet({ isPromoted: true }), base));

    // 2. local_blocklist
    const cLocal = createDefaultConfig('standard');
    cLocal.localBlocklistUids['u-l'] = { uid: 'u-l', screenName: 'l', addedAt: 1 };
    record(evaluateTweet(makeTweet({}, { restId: 'u-l' }), cLocal));

    // 3. grok_filter
    record(
      evaluateTweet(
        makeTweet({ scene: 'reply', isReply: true, text: '@grok hi' }),
        base
      )
    );

    // 4. crowd_block
    const snap = createDefaultCrowdSnapshot();
    snap.counts['u-cr'] = { c: 10, t: 'spam' };
    record(evaluateTweet(makeTweet({}, { restId: 'u-cr' }), base, snap));

    // 5. high_frequency_daily
    record(
      evaluateTweet(
        makeTweet({}, { statusesCount: 5000, dailyTweetRate: 200 }),
        base
      )
    );

    // 6. high_frequency_window
    const wt = new SlidingWindowTracker();
    let winRes = evaluateTweet(makeTweet({ tweetId: 'w-0' }), base, null, wt);
    for (let i = 1; i <= 8; i++) {
      winRes = evaluateTweet(
        makeTweet({ tweetId: `w-${i}` }, { restId: 'u-win' }),
        base,
        null,
        wt
      );
    }
    record(winRes);

    // 7. keyword
    const cKw = createDefaultConfig('standard');
    cKw.rules.keywords.items.push({
      id: 'kw-1',
      pattern: 'custom-trigger',
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    });
    record(evaluateTweet(makeTweet({ text: 'hit custom-trigger now' }), cKw));

    // 8. domain_filter
    const cDom = createDefaultConfig('standard');
    cDom.rules.domainFilter.items.push({
      id: 'dom-1',
      domain: 'bad-link.example',
      enabled: true,
    });
    record(
      evaluateTweet(makeTweet({ urls: ['https://bad-link.example/x'] }), cDom)
    );

    // 9. engagement_bait
    record(
      evaluateTweet(
        makeTweet({ text: 'Comment "YES" and I will DM you the template!' }),
        base
      )
    );

    // 10. rule_pack
    const cPack = createDefaultConfig('standard');
    cPack.installedPacks = [
      {
        format: 'kxc-pack-v1',
        id: 'pack-1',
        name: 'Pack One',
        description: 'Test',
        version: '1.0.0',
        updatedAt: '2026-11-01T00:00:00.000Z',
        enabled: true,
        installedAt: 1,
        keywords: [
          {
            id: 'pk-kw-1',
            pattern: 'pack-secret-token',
            isRegex: false,
            scopes: ['text'],
            enabled: true,
          },
        ],
      },
    ];
    record(evaluateTweet(makeTweet({ text: 'contains pack-secret-token' }), cPack));

    // 11. cloud_keyword
    record(
      evaluateTweet(
        makeTweet({ text: 'Check https://onlyfans.com/model' }),
        base
      )
    );

    // 12. impersonation
    record(
      evaluateTweet(
        makeTweet(
          {
            scene: 'reply',
            isReply: true,
            text: 'Claim your official community bonus right now please!',
            focalAuthor: {
              restId: 'u-f',
              screenName: 'VitalikButerin',
              name: 'Vitalik Buterin',
              followersCount: 5_000_000,
            },
          },
          {
            restId: 'u-imp',
            screenName: 'VitalikButer1n',
            name: 'Vitalik Buterin',
            followersCount: 10,
          }
        ),
        base
      )
    );

    // 13. reply_spam
    record(
      evaluateTweet(
        makeTweet({ scene: 'reply', isReply: true, text: '@op 🔥🔥' }),
        base
      )
    );

    // 14. tag_spam
    record(evaluateTweet(makeTweet({ hashtagCount: 10 }), base));

    // 15. account_quality
    record(
      evaluateTweet(
        makeTweet({}, { accountAgeDays: 2, followersCount: 10 }),
        base
      )
    );

    // 16. language_filter
    const cLang = createDefaultConfig('standard');
    cLang.rules.languageFilter = {
      enabled: true,
      mode: 'block',
      languages: ['tr'],
    };
    record(evaluateTweet(makeTweet({ lang: 'tr' }), cLang));

    expect(observed.size).toBe(16);
    expect(observed.get('keyword')).toEqual({ kind: 'keyword', id: 'kw-1' });
    expect(observed.get('domain_filter')).toEqual({
      kind: 'domain',
      id: 'dom-1',
    });
    expect(observed.get('cloud_keyword')).toEqual({
      kind: 'cloud_keyword',
      id: 'cloud-nsfw-bio-1',
    });
    expect(observed.get('rule_pack')).toEqual({
      kind: 'pack_item',
      id: 'pk-kw-1',
    });
    expect(observed.get('grok_filter')).toEqual({
      kind: 'rule',
      id: 'grokFilter',
    });
  });

  it('handles frozen raw v0.1.2 FilterConfig safely without crashing and defaults official @grok protection to true', () => {
    const rawV012Config = Object.freeze({
      version: 1,
      enabled: true,
      locale: 'en',
      theme: 'light',
      preset: 'standard',
      interceptionMode: 'collapse',
      exemptFollowing: true,
      profileSceneBadgeOnly: true,
      syncNativeXBlock: true,
      enableCrowdReport: true,
      enableCloudKeywords: true,
      disabledCloudKeywordIds: [],
      rules: Object.freeze({
        replySpam: Object.freeze({
          enabled: true,
          blockShortOrEmoji: true,
          minWeightedLength: 6,
          detectImpersonation: true,
          blockBioLinkSpam: true,
          bioLinkMaxFollowers: 1000,
          blockPureMediaReplies: false,
        }),
        engagementBait: Object.freeze({
          enabled: true,
          blockCommentGiveaway: true,
          blockFollowBack: true,
        }),
        highFrequency: Object.freeze({
          enabled: true,
          maxDailyTweets: 45,
          slidingWindowEnabled: true,
          slidingWindowHours: 1,
          slidingWindowMaxTweets: 8,
        }),
        crowdBlock: Object.freeze({ enabled: true, minBlockCount: 3 }),
        keywords: Object.freeze({ enabled: true, items: [] }),
        tagSpam: Object.freeze({ enabled: true, maxHashtags: 5, maxCashtags: 3 }),
        accountQuality: Object.freeze({
          enabled: true,
          minAccountAgeDays: 7,
          blockDefaultAvatarInReplies: true,
          maxFollowRatio: 15,
          minFollowingForRatioCheck: 500,
        }),
        languageFilter: Object.freeze({
          enabled: false,
          mode: 'allow',
          languages: ['zh', 'en', 'ja'],
        }),
        hidePromotedAds: Object.freeze({ enabled: true }),
      }),
      whitelistUids: Object.freeze({}),
      localBlocklistUids: Object.freeze({}),
    }) as unknown as FilterConfig;

    const grokTweet = makeTweet(
      {},
      {
        restId: OFFICIAL_GROK_UID,
        screenName: 'grok',
        statusesCount: 500_000,
        dailyTweetRate: 5000,
      }
    );

    expect(evaluateTweet(grokTweet, rawV012Config).blocked).toBe(false);
    expect(
      evaluateAuthorProfile(grokTweet.author, rawV012Config).riskBadges
    ).toEqual([]);

    // applyPresetToConfig hydrates missing v0.2.0 rule blocks while preserving user's stored true privacy flags
    const upgraded = applyPresetToConfig(rawV012Config, 'strict');
    expect(upgraded.syncNativeXBlock).toBe(true);
    expect(upgraded.enableCrowdReport).toBe(true);
    expect(upgraded.rules.grokFilter.protectOfficialGrok).toBe(true);
    expect(upgraded.rules.grokFilter.blockShortMentions).toBe(true);
    expect(upgraded.rules.replySpam.blockDuplicateReplies).toBe(true);
    expect(upgraded.rules.domainFilter).toEqual({ enabled: true, items: [] });
  });
});

describe('Engine v2 — M11 Parser extractedTweetCount & <1ms Performance Budget', () => {
  it('counts extracted tweets accurately including zero-reply TweetDetail while returning 0 on broken instructions', () => {
    const config = createDefaultConfig('standard');

    // Zero-reply TweetDetail with focal tweet + cursor only -> extractedTweetCount === 1, decisionsByTweetId empty
    const zeroReplyDetail = {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  entryId: 'focal',
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: '9000',
                          legacy: { full_text: 'Standalone post with 0 replies' },
                          core: {
                            user_results: {
                              result: {
                                rest_id: 'u-9000',
                                legacy: {
                                  screen_name: 'solo_author',
                                  name: 'Solo',
                                  statuses_count: 100,
                                  followers_count: 500,
                                  created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                {
                  entryId: 'cursor-bottom',
                  content: { value: 'CURSOR_XYZ', cursorType: 'Bottom' },
                },
              ],
            },
          ],
        },
      },
    };
    const zeroRes = processGraphqlResponsePayload(
      zeroReplyDetail,
      'https://x.com/i/api/graphql/xxx/TweetDetail?variables=%7B%22focalTweetId%22%3A%229000%22%7D',
      '/home', // SPA race pathname still /home -> URL fallback extracts focalTweetId 9000!
      config
    );
    expect(zeroRes.extractedTweetCount).toBe(1);
    expect(Object.keys(zeroRes.decisionsByTweetId)).toHaveLength(0);

    // Broken schema (renamed instructions key) -> MUST return 0 even though locateFocalAuthor finds focal tweet
    const brokenDetail = {
      data: {
        threaded_conversation_with_injections_v2: {
          renamed_instructions_v9:
            zeroReplyDetail.data.threaded_conversation_with_injections_v2
              .instructions,
        },
      },
    };
    const brokenRes = processGraphqlResponsePayload(
      brokenDetail,
      'https://x.com/i/api/graphql/xxx/TweetDetail',
      '/solo_author/status/9000',
      config
    );
    expect(brokenRes.extractedTweetCount).toBe(0);

    // Tombstone / empty data -> 0
    const tombstonePayload = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'tomb',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: { __typename: 'TweetTombstone' },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    };
    expect(
      processGraphqlResponsePayload(
        tombstonePayload,
        'https://x.com/i/api/graphql/xxx/HomeTimeline',
        '/home',
        config
      ).extractedTweetCount
    ).toBe(0);
  });

  it('evaluates 1,000 realistic mixed tweets well within the < 1ms per-tweet deterministic budget', () => {
    const config = createDefaultConfig('strict');
    config.enabledCloudLangGroups = [...CLOUD_KEYWORD_LANG_GROUPS];
    for (let i = 0; i < 20; i++) {
      config.rules.keywords.items.push({
        id: `bench-kw-${i}`,
        pattern: `custom_spam_token_${i}`,
        isRegex: i % 2 === 0,
        scopes: ['text', 'bio', 'url'],
        enabled: true,
      });
      config.rules.domainFilter.items.push({
        id: `bench-dom-${i}`,
        domain: `spamdomain-${i}.example`,
        enabled: true,
      });
    }
    config.installedPacks = [
      {
        format: 'kxc-pack-v1',
        id: 'bench-pack-1',
        name: 'Bench Pack 1',
        description: 'Benchmark',
        version: '1.0.0',
        updatedAt: '2026-11-01T00:00:00.000Z',
        enabled: true,
        installedAt: 1,
        keywords: Array.from({ length: 20 }, (_, i) => ({
          id: `pk1-kw-${i}`,
          pattern: `pack1_term_${i}`,
          isRegex: false,
          scopes: ['text', 'bio'],
          enabled: true,
        })),
        domains: Array.from({ length: 10 }, (_, i) => ({
          id: `pk1-dom-${i}`,
          domain: `pack1-bad-${i}.example`,
          enabled: true,
        })),
        blockedUids: Array.from({ length: 500 }, (_, i) => ({
          uid: String(9_000_000 + i),
          screenName: `blocked_${i}`,
          addedAt: 1,
        })),
      },
    ];

    const snapshot = createDefaultCrowdSnapshot();
    for (let i = 0; i < 1000; i++) {
      snapshot.counts[String(8_000_000 + i)] = { c: 5, t: 'spam' };
    }

    const windowTracker = new SlidingWindowTracker();
    const dupTracker = new ThreadDuplicateTracker();

    const tweets: ExtractedTweet[] = Array.from({ length: 1000 }, (_, i) =>
      makeTweet(
        {
          tweetId: `bench-${i}`,
          scene: i % 3 === 0 ? 'reply' : 'timeline',
          isReply: i % 3 === 0,
          focalTweetId: i % 3 === 0 ? `focal-${i % 10}` : undefined,
          timelineFeed: i % 3 === 0 ? undefined : i % 2 === 0 ? 'for_you' : 'following',
          text:
            i % 20 === 0
              ? 'Repeated spam campaign message for benchmark testing!'
              : `Engineering update #${i}: measuring local deterministic latency across rules.`,
          urls: [`https://docs.example.org/post/${i}`],
          quotedUrls: i % 5 === 0 ? [`https://news.example.com/item/${i}`] : undefined,
        },
        {
          restId: String(1_000_000 + i),
          bioUrls: [`https://github.com/dev${i}`],
        }
      )
    );

    // Warm up regex & WeakMap caches
    for (let i = 0; i < 10; i++) {
      evaluateTweet(tweets[i]!, config, snapshot, windowTracker, false, dupTracker);
    }

    const start = performance.now();
    for (const tw of tweets) {
      evaluateTweet(tw, config, snapshot, windowTracker, true, dupTracker);
    }
    const elapsedMs = performance.now() - start;
    const avgMs = elapsedMs / tweets.length;
    expect(avgMs).toBeLessThan(1.0);
  });
});

describe('Engine v2 — Round 2 Hardening, Isolation, Parser & Heavy Performance Regression Suite', () => {
  it('preserves built-in langGroup/packCategory on active remote rows with D1 0004 default universal and never mutates caller inputs', () => {
    const remoteRows: KeywordRuleItem[] = [
      Object.freeze({
        id: 'cloud-cliche-trivia-1',
        pattern: '(冷知识)',
        isRegex: true,
        scopes: Object.freeze(['text']) as unknown as KeywordRuleItem['scopes'],
        langGroup: 'universal',
        packCategory: 'remote-override-attempt',
        enabled: true,
      }),
      Object.freeze({
        id: 'cloud-gambling-cn-1',
        pattern: '(博彩平台)',
        isRegex: true,
        scopes: Object.freeze(['text']) as unknown as KeywordRuleItem['scopes'],
        langGroup: 'universal',
        enabled: true,
      }),
      Object.freeze({
        id: 'cloud-hotfix-active-1',
        pattern: 'brand-new-hotfix-scam',
        isRegex: false,
        scopes: Object.freeze(['text']) as unknown as KeywordRuleItem['scopes'],
        enabled: true,
      }),
    ];
    const frozenInput = Object.freeze(remoteRows);
    const merged = mergeCloudKeywords(frozenInput as KeywordRuleItem[]);

    const trivia = merged.find((k) => k.id === 'cloud-cliche-trivia-1')!;
    expect(trivia.enabled).toBe(true);
    expect(trivia.langGroup).toBe('zh');
    expect(trivia.packCategory).toBe('cliche');

    const gambling = merged.find((k) => k.id === 'cloud-gambling-cn-1')!;
    expect(gambling.enabled).toBe(true);
    expect(gambling.langGroup).toBe('zh');
    expect(gambling.packCategory).toBe('scam');

    const hotfix = merged.find((k) => k.id === 'cloud-hotfix-active-1')!;
    expect(hotfix.langGroup).toBe('universal');
    // Caller input was NOT mutated
    expect(remoteRows[2]!.langGroup).toBeUndefined();

    // English user with this post-0004 remote snapshot must NOT trigger Chinese rules
    const enConfig = createDefaultConfig('standard');
    enConfig.locale = 'en';
    const snap = createDefaultCrowdSnapshot();
    snap.cloudKeywords = remoteRows;
    expect(
      evaluateTweet(
        makeTweet({ text: '冷知识：章鱼其实有三颗心脏。' }),
        enConfig,
        snap
      ).blocked
    ).toBe(false);
    expect(
      evaluateTweet(
        makeTweet({ text: 'Beware of brand-new-hotfix-scam links' }),
        enConfig,
        snap
      ).ruleId
    ).toBe('cloud_keyword');
  });

  it('eliminates ja/pt/ru cloud pack false positives while preserving true spam detection and safe i18n prototype-key lookups', () => {
    const checkGroup = (
      group: (typeof CLOUD_KEYWORD_LANG_GROUPS)[number],
      cleanPosts: string[],
      spamPosts: string[],
      expectedRuleId: string
    ) => {
      const cfg = createDefaultConfig('standard');
      cfg.enabledCloudLangGroups = [group];
      for (const post of cleanPosts) {
        const res = evaluateTweet(makeTweet({ text: post }), cfg);
        expect(res.blocked, `False positive in ${group}: ${post}`).toBe(false);
      }
      for (const post of spamPosts) {
        const res = evaluateTweet(makeTweet({ text: post }), cfg);
        expect(res.blocked, `Expected ${group} spam hit: ${post}`).toBe(true);
        expect(res.ruleId).toBe('cloud_keyword');
        expect(res.matchedTarget).toEqual({
          kind: 'cloud_keyword',
          id: expectedRuleId,
        });
      }
    };

    checkGroup(
      'ja',
      [
        '新曲MVを公開しました！プロフのリンクから見てね',
        'プロフのリンクから無料ダウンロードできます',
        '固ツイの動画にチュートリアルをまとめました',
        '固ツイの特典キャンペーン実施中',
      ],
      [
        'プロフのリンクからえち動画見れます',
        '固ツイに裏動画アップしました！',
      ],
      'cloud-nsfw-ja-1'
    );

    checkGroup(
      'pt',
      [
        'O Banco Central confirmou o cronograma de lançamento do Pix automático para contas recorrentes.',
        'Nossa livraria agora aceita pagamento via Pix na hora sem taxas extras.',
      ],
      [
        'Ganhe Pix na hora no cadastro agora mesmo!',
        'Receba Pix automático jogando todo dia!',
        'Pix garantido todo dia sem esforço!',
      ],
      'cloud-scam-pt-1'
    );

    checkGroup(
      'ru',
      [
        'УЕФА начал расследование по подозрению на договорной матч во втором дивизионе.',
      ],
      [
        'Продам договорной матч, пиши в тг срочно!',
        'Договорной матч кэф 18, 100% проход в телеграм',
      ],
      'cloud-scam-ru-1'
    );

    // Prototype-key safety in getCloudKeywordNote / hasLocalizedCloudKeywordNote
    for (const protoKey of ['constructor', 'toString', '__proto__', 'valueOf']) {
      expect(hasLocalizedCloudKeywordNote(protoKey, 'en')).toBe(false);
      expect(hasLocalizedCloudKeywordNote(protoKey, 'ja')).toBe(false);
      const note = getCloudKeywordNote(
        {
          id: protoKey,
          pattern: 'fallback-pattern',
          isRegex: false,
          scopes: ['text'],
          note: 'Safe custom note',
          enabled: true,
        },
        'en'
      );
      expect(note).toBe('Safe custom note');
      const noNoteFallback = getCloudKeywordNote(
        {
          id: protoKey,
          pattern: 'fallback-pattern',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        },
        'ja'
      );
      expect(noNoteFallback).toBe('fallback-pattern');
    }

    // Polished Japanese cloud-scam-de-1 note wording
    const deScamRule = DEFAULT_CLOUD_KEYWORDS.find(
      (k) => k.id === 'cloud-scam-de-1'
    )!;
    expect(getCloudKeywordNote(deScamRule, 'ja')).toContain('配信グループ');
  });

  it('prevents all 3 whitelist leak cases (1A quotedText, 1B RT-of-QT, 1C RT of whitelisted author with URL)', () => {
    // Case 1A: Quote of whitelisted quotedAuthor with matching quotedText across keyword, cloud_keyword, and rule_pack
    const cfg1A = createDefaultConfig('standard');
    cfg1A.whitelistUids['qt-wl'] = {
      uid: 'qt-wl',
      screenName: 'trusted_qt',
      addedAt: 1,
    };
    cfg1A.rules.keywords.items.push({
      id: 'kw-text',
      pattern: 'secret_blocked_phrase',
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    });
    cfg1A.installedPacks = [
      {
        format: 'kxc-pack-v1',
        id: 'p1',
        name: 'Pack',
        description: 'Test',
        version: '1.0.0',
        updatedAt: '2026-11-20T00:00:00Z',
        enabled: true,
        installedAt: 1,
        keywords: [
          {
            id: 'pk-1',
            pattern: 'pack_blocked_phrase',
            isRegex: false,
            scopes: ['text'],
            enabled: true,
          },
        ],
      },
    ];
    const quoteWhitelisted = makeTweet(
      {
        text: 'Great thread, worth reading!',
        quotedText:
          'Discussing secret_blocked_phrase pack_blocked_phrase and https://onlyfans.com/example safely',
        quotedAuthor: makeAuthor({
          restId: 'qt-wl',
          screenName: 'trusted_qt',
        }),
      },
      { restId: 'stranger-1' }
    );
    expect(evaluateTweet(quoteWhitelisted, cfg1A).blocked).toBe(false);

    // Case 1B: E2E GraphQL RT-of-QT where outer & mid are unwhitelisted, but quotedAuthor IS whitelisted
    const cfg1B = createDefaultConfig('standard');
    cfg1B.whitelistUids['wl-qt'] = {
      uid: 'wl-qt',
      screenName: 'trusted_qt',
      addedAt: 1,
    };
    cfg1B.rules.keywords.items.push({
      id: 'kw-forbidden',
      pattern: 'forbidden_token_xyz',
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    });
    const makeRtOfQtPayload = () => ({
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'rt-qt-wl',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: '7001',
                            legacy: {
                              full_text: 'RT @mid_user: Look at this post',
                              retweeted_status_result: {
                                result: {
                                  rest_id: '7002',
                                  legacy: { full_text: 'Look at this post' },
                                  core: {
                                    user_results: {
                                      result: {
                                        rest_id: 'uid-mid',
                                        legacy: {
                                          screen_name: 'mid_user',
                                          name: 'Mid User',
                                          statuses_count: 100,
                                          followers_count: 500,
                                          created_at:
                                            'Wed Jan 01 00:00:00 +0000 2020',
                                        },
                                      },
                                    },
                                  },
                                  quoted_status_result: {
                                    result: {
                                      rest_id: '7003',
                                      legacy: {
                                        full_text:
                                          'Talking about forbidden_token_xyz safely',
                                      },
                                      core: {
                                        user_results: {
                                          result: {
                                            rest_id: 'wl-qt',
                                            legacy: {
                                              screen_name: 'trusted_qt',
                                              name: 'Trusted QT',
                                              statuses_count: 100,
                                              followers_count: 500,
                                              created_at:
                                                'Wed Jan 01 00:00:00 +0000 2020',
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                            core: {
                              user_results: {
                                result: {
                                  rest_id: 'uid-outer',
                                  legacy: {
                                    screen_name: 'outer_user',
                                    name: 'Outer User',
                                    statuses_count: 100,
                                    followers_count: 500,
                                    created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                                  },
                                },
                              },
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
      },
    });
    const res1B = processGraphqlResponsePayload(
      makeRtOfQtPayload(),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      cfg1B
    );
    expect(res1B.decisionsByTweetId['7001']!.decision.blocked).toBe(false);

    // Removing whitelist attributes hit_uid strictly to wl-qt (never uid-mid)
    delete cfg1B.whitelistUids['wl-qt'];
    const res1BUnwhitelisted = processGraphqlResponsePayload(
      makeRtOfQtPayload(),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      cfg1B
    );
    expect(
      res1BUnwhitelisted.decisionsByTweetId['7001']!.decision.blocked
    ).toBe(true);
    expect(
      res1BUnwhitelisted.decisionsByTweetId['7001']!.decision.evidence
    ).toContainEqual({
      key: 'hit_uid',
      label: 'Matched UID',
      value: 'wl-qt',
    });

    // Case 1C: E2E GraphQL RT of whitelisted retweetedAuthor whose tweet contains https://t.me/trusted_community
    // (including when X echoes retweetedRaw's url into outer rawTweet.legacy.entities.urls)
    const cfg1C = createDefaultConfig('standard');
    cfg1C.whitelistUids['wl-orig'] = {
      uid: 'wl-orig',
      screenName: 'trusted_orig',
      addedAt: 1,
    };
    cfg1C.rules.domainFilter.items.push({
      id: 'd1',
      domain: 't.me',
      enabled: true,
    });
    cfg1C.rules.keywords.items.push({
      id: 'kw-tme-url',
      pattern: 't.me',
      isRegex: false,
      scopes: ['url'],
      enabled: true,
    });

    const makeRtUrlPayload = () => ({
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'rt-url-wl',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: '7101',
                            legacy: {
                              full_text: 'RT @trusted_orig: Join our community',
                              entities: {
                                urls: [
                                  {
                                    expanded_url: 'https://t.me/trusted_community',
                                  },
                                ],
                              },
                              retweeted_status_result: {
                                result: {
                                  rest_id: '7102',
                                  legacy: {
                                    full_text: 'Join our community',
                                    entities: {
                                      urls: [
                                        {
                                          expanded_url:
                                            'https://t.me/trusted_community',
                                        },
                                      ],
                                    },
                                  },
                                  core: {
                                    user_results: {
                                      result: {
                                        rest_id: 'wl-orig',
                                        legacy: {
                                          screen_name: 'trusted_orig',
                                          name: 'Trusted Orig',
                                          statuses_count: 100,
                                          followers_count: 500,
                                          created_at:
                                            'Wed Jan 01 00:00:00 +0000 2020',
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                            core: {
                              user_results: {
                                result: {
                                  rest_id: 'random-rt',
                                  legacy: {
                                    screen_name: 'random_rt',
                                    name: 'Random RT',
                                    statuses_count: 100,
                                    followers_count: 500,
                                    created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                                  },
                                },
                              },
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
      },
    });

    const res1C = processGraphqlResponsePayload(
      makeRtUrlPayload(),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      cfg1C
    );
    expect(res1C.decisionsByTweetId['7101']!.tweet.urls).toEqual([]);
    expect(res1C.decisionsByTweetId['7101']!.tweet.retweetedUrls).toEqual([
      'https://t.me/trusted_community',
    ]);
    expect(res1C.decisionsByTweetId['7101']!.decision.blocked).toBe(false);

    // Without whitelist, RT URL hits retweetedAuthor cleanly with hit_uid === 'wl-orig'
    delete cfg1C.whitelistUids['wl-orig'];
    const res1CBlocked = processGraphqlResponsePayload(
      makeRtUrlPayload(),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      cfg1C
    );
    expect(res1CBlocked.decisionsByTweetId['7101']!.decision.blocked).toBe(true);
    expect(res1CBlocked.decisionsByTweetId['7101']!.decision.evidence).toContainEqual({
      key: 'hit_uid',
      label: 'Matched UID',
      value: 'wl-orig',
    });
  });

  it('fixes TweetDetail SPA focalTweetId race (including %20 spacing), query-string feed leakage, and empty expanded_url + unwound_url extraction', () => {
    // 1. detectTimelineFeedFromUrl ignores query strings & fragments
    expect(
      detectTimelineFeedFromUrl(
        'https://x.com/i/api/graphql/abc/Bookmarks?referrer=HomeTimeline'
      )
    ).toBeUndefined();
    expect(
      detectTimelineFeedFromUrl(
        'https://x.com/i/api/graphql/abc/Bookmarks#HomeLatestTimeline'
      )
    ).toBeUndefined();

    // 2. TweetDetail SPA navigation race: pagePathname still points to /alice/status/111111 while URL requests focalTweetId 222222
    const strictStrip = createDefaultConfig('strict');
    strictStrip.interceptionMode = 'strip';
    const makeSpaDetailPayload = (focalId: string) => ({
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  entryId: 'focal-new',
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: focalId,
                          legacy: { full_text: 'Hi!' },
                          core: {
                            user_results: {
                              result: {
                                rest_id: 'u-bob',
                                legacy: {
                                  screen_name: '',
                                  name: 'Bob',
                                  statuses_count: 100,
                                  followers_count: 500,
                                  created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                {
                  entryId: 'reply-new',
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: '222999',
                          legacy: {
                            full_text:
                              'Great breakdown of the architecture and latency trade-offs!',
                            in_reply_to_status_id_str: focalId,
                          },
                          core: {
                            user_results: {
                              result: {
                                rest_id: 'u-replier',
                                legacy: {
                                  screen_name: 'replier',
                                  name: 'Replier',
                                  statuses_count: 200,
                                  followers_count: 800,
                                  created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                                },
                              },
                            },
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
    });

    const spaPayload1 = makeSpaDetailPayload('222222');
    const spaRes1 = processGraphqlResponsePayload(
      spaPayload1,
      'https://x.com/i/api/graphql/abc/TweetDetail?variables=%7B%22focalTweetId%22%3A%22222222%22%7D',
      '/alice/status/111111',
      strictStrip
    );
    expect(spaRes1.decisionsByTweetId['222222']).toBeUndefined();
    expect(spaRes1.extractedTweetCount).toBe(2);
    expect(
      spaPayload1.data.threaded_conversation_with_injections_v2.instructions[0]
        .entries
    ).toHaveLength(2);
    expect(spaRes1.decisionsByTweetId['222999']!.tweet.focalTweetId).toBe(
      '222222'
    );
    // Must NOT leak stale 'alice' handle onto focalAuthor
    expect(
      spaRes1.decisionsByTweetId['222999']!.tweet.focalAuthor?.screenName
    ).toBe('');

    // %20 spacing around : in TweetDetail focalTweetId
    const spaPayload2 = makeSpaDetailPayload('333444');
    const spaRes2 = processGraphqlResponsePayload(
      spaPayload2,
      'https://x.com/i/api/graphql/abc/TweetDetail?variables=%7B%22focalTweetId%22%20%3A%20%22333444%22%7D',
      '/alice/status/111111',
      strictStrip
    );
    expect(spaRes2.decisionsByTweetId['333444']).toBeUndefined();
    expect(spaRes2.extractedTweetCount).toBe(2);

    // 3. extractExpandedUrls collects unwound_url even when expanded_url is '' OR a shortener
    const domCfg = createDefaultConfig('standard');
    domCfg.rules.domainFilter.items.push({
      id: 'dom-unwound',
      domain: 'scam-unwound.example',
      enabled: true,
    });
    const unwoundPayload = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'tw-empty-expanded',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: '8801',
                            legacy: {
                              full_text: 'Check this link',
                              entities: {
                                urls: [
                                  {
                                    expanded_url: '',
                                    unwound_url:
                                      'https://go.scam-unwound.example/a',
                                  },
                                ],
                              },
                            },
                            core: {
                              user_results: {
                                result: {
                                  rest_id: 'u-8801',
                                  legacy: {
                                    screen_name: 'u8801',
                                    name: 'U8801',
                                    statuses_count: 100,
                                    followers_count: 500,
                                    created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  {
                    entryId: 'tw-shortener-unwound',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: '8802',
                            legacy: {
                              full_text: 'Shortened link',
                              entities: {
                                urls: [
                                  {
                                    expanded_url: 'https://bit.ly/3xyz',
                                    unwound_url:
                                      'https://sub.scam-unwound.example/b',
                                  },
                                ],
                              },
                            },
                            core: {
                              user_results: {
                                result: {
                                  rest_id: 'u-8802',
                                  legacy: {
                                    screen_name: 'u8802',
                                    name: 'U8802',
                                    statuses_count: 100,
                                    followers_count: 500,
                                    created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                                  },
                                },
                              },
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
      },
    };
    const unwoundRes = processGraphqlResponsePayload(
      unwoundPayload,
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      domCfg
    );
    expect(unwoundRes.decisionsByTweetId['8801']!.decision.ruleId).toBe(
      'domain_filter'
    );
    expect(unwoundRes.decisionsByTweetId['8802']!.tweet.urls).toEqual([
      'https://bit.ly/3xyz',
      'https://sub.scam-unwound.example/b',
    ]);
    expect(unwoundRes.decisionsByTweetId['8802']!.decision.ruleId).toBe(
      'domain_filter'
    );
  });

  it('enforces domain IDN symmetry, scheme-less host:port/userinfo, backslash split, double trailing dot rejection, NFKC dedup invariance, Grok URL exclusion, and malformed domainFilter guard', () => {
    // 1. Domain IDN symmetry
    expect(matchesDomainRule('münchen.de', 'münchen.de')).toBe(true);
    expect(matchesDomainRule('sub.münchen.de', 'münchen.de')).toBe(true);
    expect(matchesDomainRule('例え.jp', 'xn--r8jz45g.jp')).toBe(true);
    expect(matchesDomainRule('t.me..', 't.me')).toBe(false);

    // 2. Scheme-less host:port & user:pass@host + backslash + double trailing dot
    expect(extractHostnameFromUrl('sub.t.me:8443/path')).toBe('sub.t.me');
    expect(extractHostnameFromUrl('user:pass@sub.t.me/path')).toBe('sub.t.me');
    expect(extractHostnameFromUrl('user:pass@sub.t.me:8443/path?x=1#y')).toBe(
      'sub.t.me'
    );
    expect(normalizeDomainRule('http://good.com\\@t.me')).toBe('good.com');
    expect(extractHostnameFromUrl('http://good.com\\@t.me')).toBe('good.com');
    expect(extractHostnameFromUrl('https://t.me../path')).toBeNull();
    expect(extractHostnameFromUrl('https://t.me./path')).toBe('t.me');
    expect(isValidDomainRule(normalizeDomainRule('t.me..'))).toBe(false);
    expect(isValidDomainRule(normalizeDomainRule('t.me.'))).toBe(true);
    expect(extractHostnameFromUrl('javascript://t.me/%0aalert(1)')).toBeNull();
    expect(extractHostnameFromUrl('ftp://t.me/file')).toBeNull();
    expect(extractHostnameFromUrl('mailto:user@t.me')).toBeNull();

    // 3. NFKC invariance in normalizeReplyForDedup
    const lig1 = normalizeReplyForDedup('fifififififi');
    const lig2 = normalizeReplyForDedup('ﬁﬁﬁﬁﬁﬁ');
    expect(lig2.normalized).toBe(lig1.normalized);
    expect(lig2.weightedLength).toBe(12);
    expect(lig1.weightedLength).toBe(12);

    const nfcHangul = normalizeReplyForDedup('안녕하세요');
    const nfdHangul = normalizeReplyForDedup('안녕하세요'.normalize('NFD'));
    expect(nfdHangul.normalized).toBe(nfcHangul.normalized);
    expect(nfdHangul.weightedLength).toBe(nfcHangul.weightedLength);

    const fullKata = normalizeReplyForDedup('ガギグゲゴ');
    const halfKata = normalizeReplyForDedup('ｶﾞｷﾞｸﾞｹﾞｺﾞ');
    expect(halfKata.normalized).toBe(fullKata.normalized);
    expect(halfKata.weightedLength).toBe(fullKata.weightedLength);

    // End-to-end ligature duplicate detection catches U+FB01 evasion!
    const dedupCfg = createDefaultConfig('standard');
    const dupTracker = new ThreadDuplicateTracker();
    expect(
      evaluateTweet(
        makeTweet(
          {
            tweetId: 'lig-1',
            scene: 'reply',
            isReply: true,
            focalTweetId: 'th-lig',
            text: 'fifififififi',
          },
          { restId: 'u-lig-1' }
        ),
        dedupCfg,
        null,
        undefined,
        true,
        dupTracker
      ).blocked
    ).toBe(false);
    expect(
      evaluateTweet(
        makeTweet(
          {
            tweetId: 'lig-2',
            scene: 'reply',
            isReply: true,
            focalTweetId: 'th-lig',
            text: 'ﬁﬁﬁﬁﬁﬁ',
          },
          { restId: 'u-lig-2' }
        ),
        dedupCfg,
        null,
        undefined,
        true,
        dupTracker
      ).ruleId
    ).toBe('reply_spam');

    // 4. Grok scheme-less URL false positive fixed
    const grokCfg = createDefaultConfig('strict');
    grokCfg.rules.replySpam.enabled = false;
    const grokUrlRes = evaluateTweet(
      makeTweet({ scene: 'reply', isReply: true, text: 'see x.com/@grok' }),
      grokCfg
    );
    expect(grokUrlRes.ruleId).not.toBe('grok_filter');
    expect(grokUrlRes.blocked).toBe(false);

    // 5. Malformed partial config with non-array domainFilter.items does not crash
    const malformedCfg = createDefaultConfig('standard');
    (malformedCfg.rules.domainFilter as unknown as { items: unknown }).items =
      undefined;
    expect(() => evaluateTweet(makeTweet(), malformedCfg)).not.toThrow();
  });

  it('keeps WeakMap keyword/domain/UID/cloud caches mutation-safe and handles regex backreferences accurately', () => {
    const config = createDefaultConfig('standard');
    config.enabledCloudLangGroups = ['universal'];
    // Add 10 keywords including a regex backreference to exercise combined pre-filter + directOnly path
    for (let i = 0; i < 9; i++) {
      config.rules.keywords.items.push({
        id: `m-kw-${i}`,
        pattern: `mut_token_${i}`,
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });
    }
    config.rules.keywords.items.push({
      id: 'm-kw-backref',
      pattern: '([a-z]{3})\\1',
      isRegex: true,
      scopes: ['text'],
      enabled: true,
    });
    config.rules.domainFilter.items.push({
      id: 'm-dom-1',
      domain: 'mut-dom.example',
      enabled: true,
    });
    config.installedPacks = [
      {
        format: 'kxc-pack-v1',
        id: 'mut-pack',
        name: 'Mut Pack',
        description: 'Test',
        version: '1.0.0',
        updatedAt: '2026-11-20T00:00:00Z',
        enabled: true,
        installedAt: 1,
        blockedUids: [{ uid: '777777', screenName: 'bad', addedAt: 1 }],
        disabledItemIds: [],
      },
    ];
    const snapshot = createDefaultCrowdSnapshot();

    // Warm caches
    expect(
      evaluateTweet(makeTweet({ text: 'hit mut_token_0 here' }), config, snapshot)
        .ruleId
    ).toBe('keyword');
    expect(
      evaluateTweet(makeTweet({ text: 'repeat xyzxyz ok' }), config, snapshot)
        .matchedTarget
    ).toEqual({ kind: 'keyword', id: 'm-kw-backref' });

    // Mutate keyword enabled/pattern/scopes in-place -> immediately reflected!
    config.rules.keywords.items[0]!.enabled = false;
    expect(
      evaluateTweet(makeTweet({ text: 'hit mut_token_0 here' }), config, snapshot)
        .blocked
    ).toBe(false);
    config.rules.keywords.items[0]!.enabled = true;
    config.rules.keywords.items[0]!.pattern = 'mut_renamed_token';
    expect(
      evaluateTweet(
        makeTweet({ text: 'hit mut_renamed_token here' }),
        config,
        snapshot
      ).ruleId
    ).toBe('keyword');
    config.rules.keywords.items[0]!.scopes.push('bio');
    expect(
      evaluateTweet(
        makeTweet({ text: 'clean' }, { bio: 'contains mut_renamed_token' }),
        config,
        snapshot
      ).ruleId
    ).toBe('keyword');

    // Mutate domain item in-place
    expect(
      evaluateTweet(
        makeTweet({ urls: ['https://mut-dom.example/x'] }),
        config,
        snapshot
      ).ruleId
    ).toBe('domain_filter');
    config.rules.domainFilter.items[0]!.enabled = false;
    expect(
      evaluateTweet(
        makeTweet({ urls: ['https://mut-dom.example/x'] }),
        config,
        snapshot
      ).blocked
    ).toBe(false);

    // Mutate pack.blockedUids & pack.disabledItemIds in-place
    expect(
      evaluateTweet(makeTweet({}, { restId: '777777' }), config, snapshot).ruleId
    ).toBe('rule_pack');
    config.installedPacks[0]!.disabledItemIds!.push('777777');
    expect(
      evaluateTweet(makeTweet({}, { restId: '777777' }), config, snapshot).blocked
    ).toBe(false);
    config.installedPacks[0]!.blockedUids!.push({
      uid: '888888',
      screenName: 'bad2',
      addedAt: 1,
    });
    expect(
      evaluateTweet(makeTweet({}, { restId: '888888' }), config, snapshot).ruleId
    ).toBe('rule_pack');

    // Mutate enabledCloudLangGroups & snapshot.cloudKeywords in-place
    expect(
      evaluateTweet(
        makeTweet({ text: '冷知识：章鱼其实有三颗心脏。' }),
        config,
        snapshot
      ).blocked
    ).toBe(false);
    config.enabledCloudLangGroups.push('zh');
    expect(
      evaluateTweet(
        makeTweet({ text: '冷知识：章鱼其实有三颗心脏。' }),
        config,
        snapshot
      ).ruleId
    ).toBe('cloud_keyword');
    const triviaInSnap = snapshot.cloudKeywords.find(
      (k) => k.id === 'cloud-cliche-trivia-1'
    )!;
    triviaInSnap.enabled = false;
    expect(
      evaluateTweet(
        makeTweet({ text: '冷知识：章鱼其实有三颗心脏。' }),
        config,
        snapshot
      ).blocked
    ).toBe(false);
  });

  it('stays well under < 1ms/tweet on Challenger 1 heavy workload (2,000 tweets, 2 max-cap packs, 50 custom kw/dom, 10 cloud packs, 1,000 crowd UIDs)', () => {
    const config = createDefaultConfig('strict');
    config.enabledCloudLangGroups = [...CLOUD_KEYWORD_LANG_GROUPS];

    for (let i = 0; i < 50; i++) {
      config.rules.keywords.items.push({
        id: `heavy-kw-${i}`,
        pattern: i % 2 === 0 ? `heavy_regex_spam_${i}\\b` : `heavy_literal_${i}`,
        isRegex: i % 2 === 0,
        scopes: ['text', 'bio', 'url'],
        enabled: true,
      });
      config.rules.domainFilter.items.push({
        id: `heavy-dom-${i}`,
        domain: `heavy-spam-${i}.example`,
        enabled: true,
      });
    }

    const makeHeavyPack = (packNum: number) => ({
      format: 'kxc-pack-v1' as const,
      id: `heavy-pack-${packNum}`,
      name: `Heavy Pack ${packNum}`,
      description: 'Max-cap benchmark pack',
      version: '1.0.0',
      updatedAt: '2026-11-20T00:00:00.000Z',
      enabled: true,
      installedAt: 1,
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `hp${packNum}-kw-${i}`,
        pattern:
          i % 3 === 0 ? `pack${packNum}_re_${i}\\d+` : `pack${packNum}_term_${i}`,
        isRegex: i % 3 === 0,
        scopes: ['text', 'bio'] as Array<'text' | 'bio'>,
        enabled: true,
      })),
      domains: Array.from({ length: 200 }, (_, i) => ({
        id: `hp${packNum}-dom-${i}`,
        domain: `pack${packNum}-bad-${i}.example`,
        enabled: true,
      })),
      blockedUids: Array.from({ length: 2000 }, (_, i) => ({
        uid: String(packNum * 10_000_000 + i),
        screenName: `p${packNum}_u_${i}`,
        addedAt: 1,
      })),
    });

    config.installedPacks = [makeHeavyPack(1), makeHeavyPack(2)];

    const snapshot = createDefaultCrowdSnapshot();
    for (let i = 0; i < 1000; i++) {
      snapshot.counts[String(8_000_000 + i)] = { c: 5, t: 'spam' };
    }

    const windowTracker = new SlidingWindowTracker();
    const dupTracker = new ThreadDuplicateTracker();

    const tweets: ExtractedTweet[] = Array.from({ length: 2000 }, (_, i) =>
      makeTweet(
        {
          tweetId: `heavy-${i}`,
          scene: i % 3 === 0 ? 'reply' : 'timeline',
          isReply: i % 3 === 0,
          focalTweetId: i % 3 === 0 ? `focal-${i % 25}` : undefined,
          timelineFeed:
            i % 3 === 0 ? undefined : i % 2 === 0 ? 'for_you' : 'following',
          text: `Realistic engineering post #${i}: reviewing distributed caching latency and deterministic benchmarks across clients.`,
          urls: [`https://docs.example.org/articles/${i}`],
          quotedUrls:
            i % 4 === 0 ? [`https://news.example.com/story/${i}`] : undefined,
          quotedAuthor:
            i % 4 === 0
              ? makeAuthor({
                  restId: String(5_000_000 + i),
                  screenName: `qt_${i}`,
                  bio: 'Systems engineer writing about Rust and TypeScript',
                  bioUrls: [`https://blog.example.net/u/${i}`],
                })
              : undefined,
        },
        {
          restId: String(2_000_000 + i),
          bio: 'Distributed systems developer sharing weekly engineering notes',
          bioUrls: [`https://github.com/eng${i}`],
        }
      )
    );

    // 100-tweet warmup
    for (let i = 0; i < 100; i++) {
      evaluateTweet(
        tweets[i]!,
        config,
        snapshot,
        windowTracker,
        false,
        dupTracker
      );
    }

    const start = performance.now();
    for (const tw of tweets) {
      evaluateTweet(tw, config, snapshot, windowTracker, true, dupTracker);
    }
    const elapsedMs = performance.now() - start;
    const avgMs = elapsedMs / tweets.length;
    expect(avgMs).toBeLessThan(1.0);
  });
});

describe('Engine v2 — Round 3 Real GraphQL RT Echo Isolation, Cache, Domain, i18n & Polish Suite', () => {
  const makeGraphqlRtPayload = (opts: {
    tweetId?: string;
    outerUid?: string;
    outerScreenName?: string;
    outerFollowing?: boolean;
    outerFollowers?: number;
    outerUrls?: Array<{ expanded_url?: string; unwound_url?: string }>;
    origUid?: string;
    origScreenName?: string;
    origFollowing?: boolean;
    origFollowers?: number;
    origText: string;
    origUrls?: Array<{ expanded_url?: string; unwound_url?: string }>;
    origHashtags?: number;
    quoted?: {
      uid: string;
      screenName: string;
      text: string;
      following?: boolean;
      followers?: number;
    };
  }) => {
    const outerScreen = opts.outerScreenName ?? 'random_rt';
    const origScreen = opts.origScreenName ?? 'orig_author';
    const hashtags = Array.from(
      { length: opts.origHashtags ?? 0 },
      (_, i) => ({ text: `tag${i}` })
    );
    return {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: `rt-entry-${opts.tweetId ?? '9501'}`,
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: opts.tweetId ?? '9501',
                            legacy: {
                              full_text: `RT @${origScreen}: ${opts.origText}`,
                              entities: {
                                urls: opts.outerUrls ?? opts.origUrls ?? [],
                                hashtags,
                              },
                              retweeted_status_result: {
                                result: {
                                  rest_id: `${opts.tweetId ?? '9501'}-orig`,
                                  legacy: {
                                    full_text: opts.origText,
                                    entities: {
                                      urls: opts.origUrls ?? [],
                                      hashtags,
                                    },
                                  },
                                  core: {
                                    user_results: {
                                      result: {
                                        rest_id: opts.origUid ?? 'u-orig',
                                        legacy: {
                                          screen_name: origScreen,
                                          name: origScreen,
                                          following: opts.origFollowing ?? false,
                                          statuses_count: 100,
                                          followers_count:
                                            opts.origFollowers ?? 500,
                                          created_at:
                                            'Wed Jan 01 00:00:00 +0000 2020',
                                        },
                                      },
                                    },
                                  },
                                  ...(opts.quoted
                                    ? {
                                        quoted_status_result: {
                                          result: {
                                            rest_id: `${opts.tweetId ?? '9501'}-qt`,
                                            legacy: {
                                              full_text: opts.quoted.text,
                                            },
                                            core: {
                                              user_results: {
                                                result: {
                                                  rest_id: opts.quoted.uid,
                                                  legacy: {
                                                    screen_name:
                                                      opts.quoted.screenName,
                                                    name: opts.quoted.screenName,
                                                    following:
                                                      opts.quoted.following ??
                                                      false,
                                                    statuses_count: 100,
                                                    followers_count:
                                                      opts.quoted.followers ??
                                                      500,
                                                    created_at:
                                                      'Wed Jan 01 00:00:00 +0000 2020',
                                                  },
                                                },
                                              },
                                            },
                                          },
                                        },
                                      }
                                    : {}),
                                },
                              },
                            },
                            core: {
                              user_results: {
                                result: {
                                  rest_id: opts.outerUid ?? 'u-outer-rt',
                                  legacy: {
                                    screen_name: outerScreen,
                                    name: outerScreen,
                                    following: opts.outerFollowing ?? false,
                                    statuses_count: 100,
                                    followers_count: opts.outerFollowers ?? 50,
                                    created_at:
                                      'Wed Jan 01 00:00:00 +0000 2020',
                                  },
                                },
                              },
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
      },
    };
  };

  it('prevents real X GraphQL Retweet echo leaks across whitelist, exemptFollowing, maxFollowersExempt, engagementBait, tagSpam, RT-of-QT, URL mismatch, and hit_uid attribution', () => {
    const baseCfg = () => {
      const cfg = createDefaultConfig('standard');
      cfg.rules.keywords.items.push({
        id: 'kw-rt-secret',
        pattern: 'secret_blocked_phrase',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });
      cfg.rules.keywords.items.push({
        id: 'kw-rt-bigv',
        pattern: 'exempt_topic_xyz',
        isRegex: false,
        scopes: ['text'],
        maxFollowersExempt: 10_000,
        enabled: true,
      });
      cfg.rules.domainFilter.items.push({
        id: 'dom-tme',
        domain: 't.me',
        enabled: true,
      });
      cfg.installedPacks = [
        {
          format: 'kxc-pack-v1',
          id: 'p-rt',
          name: 'RT Pack',
          description: 'Test',
          version: '1.0.0',
          updatedAt: '2026-11-20T00:00:00Z',
          enabled: true,
          installedAt: 1,
          keywords: [
            {
              id: 'pkw-rt',
              pattern: 'pack_secret_phrase',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
            },
          ],
        },
      ];
      return cfg;
    };

    // 1. Whitelisted RT author: keyword, cloud_keyword, rule_pack, engagement_bait, tag_spam -> ALL ALLOWED
    const wlCfg = baseCfg();
    wlCfg.whitelistUids['wl-orig'] = {
      uid: 'wl-orig',
      screenName: 'trusted_orig',
      addedAt: 1,
    };
    const wlCases = [
      { origText: 'Discussing secret_blocked_phrase safely' },
      { origText: 'BREAKING: 🚨 Important official announcement!' },
      { origText: 'Analysis of pack_secret_phrase trends' },
      { origText: 'Comment "GUIDE" and I\'ll DM you the open source handbook!' },
      { origText: 'Release notes #a #b #c #d #e #f #g', origHashtags: 7 },
    ];
    for (const c of wlCases) {
      const res = processGraphqlResponsePayload(
        makeGraphqlRtPayload({ origUid: 'wl-orig', ...c }),
        'https://x.com/i/api/graphql/abc/HomeTimeline',
        '/home',
        wlCfg
      );
      expect(
        res.decisionsByTweetId['9501']!.decision.blocked,
        `Whitelisted RT leaked on: ${c.origText}`
      ).toBe(false);
    }

    // 2. Followed RT author (exemptFollowing: true): rule_pack, cloud_keyword, engagement_bait, tag_spam -> ALL ALLOWED
    const folCfg = baseCfg();
    folCfg.exemptFollowing = true;
    const folCases = [
      { origText: 'Analysis of pack_secret_phrase trends' },
      { origText: 'BREAKING: 🚨 Important official announcement!' },
      { origText: 'Comment "FREE" and I\'ll DM you the PDF!' },
      { origText: 'Community tags #a #b #c #d #e #f #g', origHashtags: 7 },
    ];
    for (const c of folCases) {
      const res = processGraphqlResponsePayload(
        makeGraphqlRtPayload({
          origUid: 'fol-orig',
          origFollowing: true,
          ...c,
        }),
        'https://x.com/i/api/graphql/abc/HomeTimeline',
        '/home',
        folCfg
      );
      expect(
        res.decisionsByTweetId['9501']!.decision.blocked,
        `Followed RT leaked on: ${c.origText}`
      ).toBe(false);
    }

    // 3. High-follower RT author: maxFollowersExempt (500k >= 10k) & engagement_bait (150k >= 100k) -> ALLOWED
    const highFolCfg = baseCfg();
    const resBigKw = processGraphqlResponsePayload(
      makeGraphqlRtPayload({
        origUid: 'big-orig',
        origFollowers: 500_000,
        outerFollowers: 50,
        origText: 'Talking about exempt_topic_xyz today',
      }),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      highFolCfg
    );
    expect(resBigKw.decisionsByTweetId['9501']!.decision.blocked).toBe(false);

    const resBigBait = processGraphqlResponsePayload(
      makeGraphqlRtPayload({
        origUid: 'big-orig',
        origFollowers: 150_000,
        outerFollowers: 50,
        origText: 'Comment "PLAYBOOK" and I\'ll DM you the launch checklist!',
      }),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      highFolCfg
    );
    expect(resBigBait.decisionsByTweetId['9501']!.decision.blocked).toBe(false);

    // 4. Unwhitelisted spammer RT across keyword, rule_pack, cloud_keyword, engagement_bait, tag_spam ->
    // BLOCKED with hit_uid === spammerUid & interceptedLogs[0].authorUid === spammerUid
    const spamCfg = baseCfg();
    const spamCases: Array<{
      label: string;
      expectedRule: TriggeredRuleId;
      origText: string;
      origHashtags?: number;
      outerFollowing?: boolean;
    }> = [
      {
        label: 'keyword',
        expectedRule: 'keyword',
        origText: 'Buy secret_blocked_phrase right now!',
      },
      {
        label: 'rule_pack',
        expectedRule: 'rule_pack',
        origText: 'Claim pack_secret_phrase today!',
      },
      {
        label: 'cloud_keyword',
        expectedRule: 'cloud_keyword',
        origText: 'BREAKING: 🚨 Fake urgency clickbait!',
      },
      {
        label: 'engagement_bait (unfollowed RT)',
        expectedRule: 'engagement_bait',
        origText: 'Comment "AGENT" and I\'ll DM you the prompt!',
      },
      {
        label: 'engagement_bait (followed user RTing spammer)',
        expectedRule: 'engagement_bait',
        origText: 'Comment "AGENT" and I\'ll DM you the prompt!',
        outerFollowing: true,
      },
      {
        label: 'tag_spam (unfollowed RT)',
        expectedRule: 'tag_spam',
        origText: 'Pump #a #b #c #d #e #f #g',
        origHashtags: 7,
      },
      {
        label: 'tag_spam (followed user RTing spammer)',
        expectedRule: 'tag_spam',
        origText: 'Pump #a #b #c #d #e #f #g',
        origHashtags: 7,
        outerFollowing: true,
      },
    ];
    for (const c of spamCases) {
      const res = processGraphqlResponsePayload(
        makeGraphqlRtPayload({
          outerUid: 'u-outer-rt',
          outerFollowing: c.outerFollowing ?? false,
          origUid: 'u-spam-orig',
          origScreenName: 'spam_orig',
          origText: c.origText,
          origHashtags: c.origHashtags,
        }),
        'https://x.com/i/api/graphql/abc/HomeTimeline',
        '/home',
        spamCfg
      );
      const dec = res.decisionsByTweetId['9501']!.decision;
      expect(dec.blocked, `Expected block for ${c.label}`).toBe(true);
      expect(dec.ruleId, `Wrong rule for ${c.label}`).toBe(c.expectedRule);
      expect(dec.evidence, `Missing hit_uid for ${c.label}`).toContainEqual({
        key: 'hit_uid',
        label: 'Matched UID',
        value: 'u-spam-orig',
      });
      expect(res.interceptedLogs).toHaveLength(1);
      expect(res.interceptedLogs[0]!.authorUid).toBe('u-spam-orig');
    }

    // 5. RT-of-QT: both RT & QT whitelisted -> ALLOWED; whitelisted RT + spammer QT -> BLOCKED with hit_uid === qtUid
    const rtQtCfg = baseCfg();
    rtQtCfg.whitelistUids['wl-rt'] = {
      uid: 'wl-rt',
      screenName: 'wl_rt',
      addedAt: 1,
    };
    rtQtCfg.whitelistUids['wl-qt'] = {
      uid: 'wl-qt',
      screenName: 'wl_qt',
      addedAt: 1,
    };
    const bothWlRes = processGraphqlResponsePayload(
      makeGraphqlRtPayload({
        origUid: 'wl-rt',
        origScreenName: 'wl_rt',
        origText: 'Discussing secret_blocked_phrase carefully',
        quoted: {
          uid: 'wl-qt',
          screenName: 'wl_qt',
          text: 'Also discussing secret_blocked_phrase',
        },
      }),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      rtQtCfg
    );
    expect(bothWlRes.decisionsByTweetId['9501']!.decision.blocked).toBe(false);

    delete rtQtCfg.whitelistUids['wl-qt'];
    const badQtRes = processGraphqlResponsePayload(
      makeGraphqlRtPayload({
        origUid: 'wl-rt',
        origScreenName: 'wl_rt',
        origText: 'Discussing secret_blocked_phrase carefully',
        quoted: {
          uid: 'u-spam-qt',
          screenName: 'spam_qt',
          text: 'Buy secret_blocked_phrase now!',
        },
      }),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      rtQtCfg
    );
    expect(badQtRes.decisionsByTweetId['9501']!.decision.blocked).toBe(true);
    expect(badQtRes.decisionsByTweetId['9501']!.decision.evidence).toContainEqual(
      {
        key: 'hit_uid',
        label: 'Matched UID',
        value: 'u-spam-qt',
      }
    );
    expect(badQtRes.interceptedLogs[0]!.authorUid).toBe('u-spam-qt');

    // 6. Outer/inner RT URL normalization mismatch (trailing slash) on whitelisted RT -> ALLOWED; unwhitelisted -> BLOCKED with hit_uid
    const urlMismatchCfg = baseCfg();
    urlMismatchCfg.whitelistUids['wl-orig'] = {
      uid: 'wl-orig',
      screenName: 'trusted_orig',
      addedAt: 1,
    };
    const urlMismatchWl = processGraphqlResponsePayload(
      makeGraphqlRtPayload({
        origUid: 'wl-orig',
        origText: 'Join our verified community group',
        outerUrls: [{ expanded_url: 'https://t.me/trusted_group' }],
        origUrls: [{ expanded_url: 'https://t.me/trusted_group/' }],
      }),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      urlMismatchCfg
    );
    expect(urlMismatchWl.decisionsByTweetId['9501']!.tweet.urls).toEqual([]);
    expect(urlMismatchWl.decisionsByTweetId['9501']!.decision.blocked).toBe(
      false
    );

    delete urlMismatchCfg.whitelistUids['wl-orig'];
    const urlMismatchBlocked = processGraphqlResponsePayload(
      makeGraphqlRtPayload({
        origUid: 'wl-orig',
        origText: 'Join our community group',
        outerUrls: [{ expanded_url: 'https://t.me/trusted_group' }],
        origUrls: [{ expanded_url: 'https://t.me/trusted_group/' }],
      }),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      urlMismatchCfg
    );
    expect(urlMismatchBlocked.decisionsByTweetId['9501']!.decision.blocked).toBe(
      true
    );
    expect(
      urlMismatchBlocked.decisionsByTweetId['9501']!.decision.ruleId
    ).toBe('domain_filter');
    expect(
      urlMismatchBlocked.decisionsByTweetId['9501']!.decision.evidence
    ).toContainEqual({
      key: 'hit_uid',
      label: 'Matched UID',
      value: 'wl-orig',
    });
  });

  it('guards all i18n dictionary getters against prototype keys, invalidates getMergedCloudKeywords on note/packCategory mutation, enforces IDN delimiter symmetry, parses +-spaced focalTweetId, and bounds Russian cloud-scam-ru-1 safely', () => {
    // 1. i18n prototype-chain safety across all 4 dictionary getters
    for (const protoKey of ['constructor', '__proto__', 'toString', 'valueOf']) {
      expect(getTweetLanguageLabel(protoKey, 'en')).toBe(
        protoKey.toUpperCase()
      );
      expect(
        getTweetLanguageLabel(protoKey, protoKey as SupportedLocale)
      ).toBe(protoKey.toUpperCase());
      expect(getTweetLanguageLabel('zh', protoKey as SupportedLocale)).toBe(
        'Chinese'
      );
      expect(getBlockReasonLabels(protoKey as SupportedLocale)).toEqual(
        getBlockReasonLabels('en')
      );
      expect(getEngineMessages(protoKey as SupportedLocale)).toBe(
        getEngineMessages('en')
      );
      expect(getBridgeMessages(protoKey as SupportedLocale)).toBe(
        getBridgeMessages('en')
      );
    }

    // 2. getMergedCloudKeywords invalidates WeakMap cache on in-place note & packCategory mutation
    const mutCfg = createDefaultConfig('standard');
    mutCfg.locale = 'en';
    const remoteKw: KeywordRuleItem = {
      id: 'remote-note-mut-1',
      pattern: 'remote_note_mut_tok',
      isRegex: false,
      scopes: ['text'],
      langGroup: 'en',
      packCategory: 'scam',
      note: 'Old Remote Note',
      enabled: true,
    };
    const mutSnap = createDefaultCrowdSnapshot();
    mutSnap.cloudKeywords = [remoteKw];
    const r1 = evaluateTweet(
      makeTweet({ text: 'hit remote_note_mut_tok now' }),
      mutCfg,
      mutSnap
    );
    expect(r1.ruleId).toBe('cloud_keyword');
    expect(r1.reasonText).toContain('Old Remote Note');

    remoteKw.note = 'Updated Remote Note';
    remoteKw.packCategory = 'spam';
    const r2 = evaluateTweet(
      makeTweet({ text: 'hit remote_note_mut_tok now' }),
      mutCfg,
      mutSnap
    );
    expect(r2.ruleId).toBe('cloud_keyword');
    expect(r2.reasonText).toContain('Updated Remote Note');

    // 3. matchesDomainRule non-ASCII non-host strings return false (symmetric with ASCII)
    for (const badHost of [
      'münchen.de/evil',
      'münchen.de?q=1',
      'münchen.de#frag',
      'münchen.de:8443',
      'user@münchen.de',
      'münchen.de\\evil',
      'münchen.de extra',
    ]) {
      expect(
        matchesDomainRule(badHost, 'münchen.de'),
        `Expected non-host "${badHost}" to be rejected`
      ).toBe(false);
    }
    expect(matchesDomainRule('sub.münchen.de', 'münchen.de')).toBe(true);

    // 4. TweetDetail URL with URLSearchParams '+'-encoded spaces around focalTweetId
    const plusCfg = createDefaultConfig('strict');
    const plusPayload = {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  entryId: 'focal-plus',
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: '444555',
                          legacy: { full_text: 'Hi!' },
                          core: {
                            user_results: {
                              result: {
                                rest_id: 'u-focal-plus',
                                legacy: {
                                  screen_name: 'focal_plus',
                                  name: 'Focal Plus',
                                  statuses_count: 100,
                                  followers_count: 500,
                                  created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                {
                  entryId: 'reply-plus',
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: '444556',
                          legacy: {
                            full_text:
                              'Great writeup on URLSearchParams parsing and query encoding!',
                            in_reply_to_status_id_str: '444555',
                          },
                          core: {
                            user_results: {
                              result: {
                                rest_id: 'u-reply-plus',
                                legacy: {
                                  screen_name: 'reply_plus',
                                  name: 'Reply Plus',
                                  statuses_count: 100,
                                  followers_count: 500,
                                  created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                                },
                              },
                            },
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
    const plusRes = processGraphqlResponsePayload(
      plusPayload,
      'https://x.com/i/api/graphql/abc/TweetDetail?variables=%7B%22focalTweetId%22+%3A+%22444555%22%7D',
      '/stale_user/status/111111',
      plusCfg
    );
    expect(plusRes.decisionsByTweetId['444555']).toBeUndefined();
    expect(plusRes.decisionsByTweetId['444556']!.tweet.focalTweetId).toBe(
      '444555'
    );

    // 5. cloud-scam-ru-1 bounds Cyrillic тг|лс without false-positiving "Челси" and stays ReDoS-safe
    const ruCfg = createDefaultConfig('standard');
    ruCfg.enabledCloudLangGroups = ['ru'];
    expect(
      evaluateTweet(
        makeTweet({ text: 'Расследование: договорной матч клуба «Челси» опровергнуто' }),
        ruCfg
      ).blocked
    ).toBe(false);

    for (const ruSpam of [
      'договорной матч пиши в лс',
      'договорной матч в тг',
      'договорной матч, тг @bet_scam',
    ]) {
      const res = evaluateTweet(makeTweet({ text: ruSpam }), ruCfg);
      expect(res.blocked, `Expected Russian scam hit: ${ruSpam}`).toBe(true);
      expect(res.matchedTarget).toEqual({
        kind: 'cloud_keyword',
        id: 'cloud-scam-ru-1',
      });
    }

    // ReDoS safety check on 20 KB pathological input for cloud-scam-ru-1 (linear-time, CI-safe < 50ms after JIT warmup)
    const ruScamRule = DEFAULT_CLOUD_KEYWORDS.find(
      (k) => k.id === 'cloud-scam-ru-1'
    )!;
    const ruRe = new RegExp(ruScamRule.pattern, 'i');
    // Warm up V8 Irregexp compiler before timing so shared CI runners don't flake on cold compile
    ruRe.test('договорной матч Челси');
    const pathologicalInputs = [
      'договорной матч '.repeat(1300) + 'Челси',
      'договорной матч ' + 'а'.repeat(20_000) + ' ЧЕЛСИ',
      'договорные матч   ,.:;!?()«»"\'- '.repeat(700),
    ];
    for (const input of pathologicalInputs) {
      const t0 = performance.now();
      ruRe.test(input);
      expect(performance.now() - t0).toBeLessThan(50);
    }
  });
});

describe('Engine v2 — Round 4 Prototype-Chain Safety, @__proto__, RT Legacy/Empty Isolation & Domain Edge Cases', () => {
  const PROTO_KEYS = [
    'constructor',
    '__proto__',
    'toString',
    'valueOf',
    'hasOwnProperty',
  ] as const;

  it('prevents native-function and [object Object] leaks across evaluateAuthorProfile, evaluateTweet, and processGraphqlResponsePayload for crowdEntry.t and localBlocklistUids.tag', () => {
    for (const badTag of PROTO_KEYS) {
      // 1) Crowd blocked (c = 12) and badge-only (c = 2)
      for (const count of [12, 2]) {
        const cfg = createDefaultConfig('standard');
        cfg.locale = 'en';
        const snap = createDefaultCrowdSnapshot();
        snap.counts['999000111'] = {
          c: count,
          t: badTag as unknown as BlockReasonTag,
        };

        const profileEval = evaluateAuthorProfile(
          makeAuthor({ restId: '999000111', screenName: 'crowd_proto' }),
          cfg,
          snap
        );
        const tweetEval = evaluateTweet(
          makeTweet({}, { restId: '999000111', screenName: 'crowd_proto' }),
          cfg,
          snap
        );

        const payload = {
          data: {
            home: {
              home_timeline_urt: {
                instructions: [
                  {
                    type: 'TimelineAddEntries',
                    entries: [
                      {
                        entryId: 'crowd-proto-1',
                        content: {
                          itemContent: {
                            tweet_results: {
                              result: {
                                rest_id: '98001',
                                legacy: { full_text: 'Ordinary post' },
                                core: {
                                  user_results: {
                                    result: {
                                      rest_id: '999000111',
                                      legacy: {
                                        screen_name: 'crowd_proto',
                                        name: 'Crowd Proto',
                                        statuses_count: 50,
                                        followers_count: 200,
                                        created_at:
                                          'Wed Jan 01 00:00:00 +0000 2020',
                                      },
                                    },
                                  },
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
          },
        };
        const gqlRes = processGraphqlResponsePayload(
          payload,
          'https://x.com/i/api/graphql/abc/HomeTimeline',
          '/home',
          cfg,
          snap
        );

        const allStrings = [
          ...profileEval.riskBadges,
          profileEval.primaryReason ?? '',
          ...tweetEval.riskBadges,
          tweetEval.reasonText ?? '',
          ...(gqlRes.authorsByScreenName['crowd_proto']?.riskBadges ?? []),
          ...(gqlRes.decisionsByTweetId['98001']?.decision.riskBadges ?? []),
          gqlRes.decisionsByTweetId['98001']?.decision.reasonText ?? '',
        ];
        for (const str of allStrings) {
          expect(str, `Leak for crowd tag=${badTag}, c=${count}: ${str}`).not.toMatch(
            /native code|\[object Object\]|function /i
          );
        }
        expect(profileEval.riskBadges).toContain(`Community reports: ${count}`);
        expect(tweetEval.riskBadges).toContain(`Community reports: ${count}`);
        if (count >= 3) {
          expect(tweetEval.blocked).toBe(true);
          expect(tweetEval.ruleId).toBe('crowd_block');
          expect(tweetEval.reasonText).toBe(`Community reports: ${count}`);
        } else {
          expect(tweetEval.blocked).toBe(false);
        }
      }

      // 2) localBlocklistUids[uid].tag prototype key
      const localCfg = createDefaultConfig('standard');
      localCfg.locale = 'en';
      localCfg.localBlocklistUids['999000222'] = {
        uid: '999000222',
        screenName: 'local_proto',
        addedAt: 1,
        tag: badTag as unknown as BlockReasonTag,
      };
      const localProfile = evaluateAuthorProfile(
        makeAuthor({ restId: '999000222', screenName: 'local_proto' }),
        localCfg
      );
      const localTweet = evaluateTweet(
        makeTweet({}, { restId: '999000222', screenName: 'local_proto' }),
        localCfg
      );
      for (const str of [
        ...localProfile.riskBadges,
        localProfile.primaryReason ?? '',
        ...localTweet.riskBadges,
        localTweet.reasonText ?? '',
      ]) {
        expect(str, `Leak for local tag=${badTag}: ${str}`).not.toMatch(
          /native code|\[object Object\]|function /i
        );
      }
      expect(localTweet.blocked).toBe(true);
      expect(localTweet.ruleId).toBe('local_blocklist');
      expect(localTweet.reasonText).toBe('Local blocklist');
      expect(localProfile.riskBadges).toEqual(['Locally blocked']);
    }
  });

  it('safely ignores prototype-key scopes in both remote cloudKeywords (pre-filter path) and custom keywords (direct path), while still invalidating on in-place scopes mutation', () => {
    for (const badScope of ['constructor', 'toString', '__proto__']) {
      // 1. Pre-filter path (45 built-in + malformed remote cloud keywords: solo & mixed with valid scope)
      const cloudCfg = createDefaultConfig('standard');
      cloudCfg.locale = 'en';
      const snap = createDefaultCrowdSnapshot();
      snap.cloudKeywords = [
        {
          id: `remote-bad-scope-${badScope}`,
          pattern: 'function',
          isRegex: false,
          scopes: [badScope as unknown as KeywordMatchScope],
          langGroup: 'universal',
          enabled: true,
        },
        {
          id: `remote-mixed-scope-${badScope}`,
          pattern: 'mixed_scope_trigger_tok',
          isRegex: false,
          scopes: [badScope as unknown as KeywordMatchScope, 'text'],
          langGroup: 'universal',
          enabled: true,
        },
      ];
      const cloudRes = evaluateTweet(
        makeTweet({ text: 'Completely normal engineering update today.' }),
        cloudCfg,
        snap
      );
      expect(cloudRes.blocked).toBe(false);

      const mixedHit = evaluateTweet(
        makeTweet({ text: 'Contains mixed_scope_trigger_tok inside text' }),
        cloudCfg,
        snap
      );
      expect(mixedHit.blocked).toBe(true);
      expect(mixedHit.ruleId).toBe('cloud_keyword');
      expect(mixedHit.reasonText).not.toMatch(/native code|\[object Object\]/i);

      // 2. Direct path (< 7 active custom keywords)
      const customCfg = createDefaultConfig('standard');
      customCfg.locale = 'en';
      customCfg.enableCloudKeywords = false;
      const badCustomItem: KeywordRuleItem = {
        id: `custom-bad-scope-${badScope}`,
        pattern: 'function',
        isRegex: false,
        scopes: [badScope as unknown as KeywordMatchScope],
        enabled: true,
      };
      customCfg.rules.keywords.items = [badCustomItem];

      const directRes = evaluateTweet(
        makeTweet({ text: 'Completely normal engineering update today.' }),
        customCfg
      );
      expect(directRes.blocked).toBe(false);

      // 3. In-place scopes mutation from malformed to valid ['text'] MUST invalidate cache cleanly
      badCustomItem.scopes[0] = 'text';
      const afterMut = evaluateTweet(
        makeTweet({ text: 'This sentence contains function keyword now.' }),
        customCfg
      );
      expect(afterMut.blocked).toBe(true);
      expect(afterMut.ruleId).toBe('keyword');
      expect(afterMut.reasonText).not.toMatch(/native code|\[object Object\]/i);
    }
  });

  it('never falsely whitelists or blocklists authors whose restId matches Object.prototype keys against empty maps', () => {
    for (const badUid of ['constructor', 'toString', '__proto__', 'valueOf']) {
      const cfg = createDefaultConfig('standard');
      const emptySnap = createDefaultCrowdSnapshot();

      // Clean tweet by prototype-key restId MUST be allowed (not falsely matched in localBlocklistUids or crowdSnapshot.counts)
      const cleanRes = evaluateTweet(
        makeTweet({ text: 'Regular clean post' }, { restId: badUid }),
        cfg,
        emptySnap
      );
      expect(cleanRes.blocked, `Unexpected block on clean tweet for restId=${badUid}`).toBe(
        false
      );

      cfg.rules.keywords.items.push({
        id: 'kw-uid-check',
        pattern: 'blocked_secret_tok',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });

      const kwRes = evaluateTweet(
        makeTweet({ text: 'contains blocked_secret_tok' }, { restId: badUid }),
        cfg,
        emptySnap
      );
      expect(kwRes.blocked, `Expected keyword block for restId=${badUid}`).toBe(
        true
      );
      expect(kwRes.ruleId).toBe('keyword');

      const hfRes = evaluateTweet(
        makeTweet(
          { text: 'Normal text' },
          { restId: badUid, statusesCount: 5000, dailyTweetRate: 150 }
        ),
        cfg,
        emptySnap
      );
      expect(
        hfRes.blocked,
        `Expected high-frequency block for restId=${badUid}`
      ).toBe(true);
      expect(hfRes.ruleId).toBe('high_frequency_daily');

      const profRes = evaluateAuthorProfile(
        makeAuthor({ restId: badUid, statusesCount: 5000, dailyTweetRate: 150 }),
        cfg,
        emptySnap
      );
      expect(profRes.primaryRuleId).toBe('high_frequency_daily');
    }
  });

  it('preserves Object.prototype and creates own properties for @__proto__, @constructor, and @toString handles in processGraphqlResponsePayload', () => {
    const cfg = createDefaultConfig('standard');
    const makeEntry = (tweetId: string, uid: string, screenName: string, followers: number) => ({
      entryId: `proto-handle-${tweetId}`,
      content: {
        itemContent: {
          tweet_results: {
            result: {
              rest_id: tweetId,
              legacy: { full_text: `Post from @${screenName}` },
              core: {
                user_results: {
                  result: {
                    rest_id: uid,
                    legacy: {
                      screen_name: screenName,
                      name: `User ${screenName}`,
                      statuses_count: 120,
                      followers_count: followers,
                      created_at: 'Wed Jan 01 00:00:00 +0000 2020',
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const payload = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  makeEntry('98101', 'u-proto-1', '__proto__', 100),
                  makeEntry('98102', 'u-proto-1', '__proto__', 500),
                  makeEntry('98103', 'u-ctor-1', 'constructor', 250),
                  makeEntry('98104', 'u-tostr-1', 'toString', 300),
                  makeEntry('__proto__', 'u-proto-tid', 'proto_tid_user', 150),
                ],
              },
            ],
          },
        },
      },
    };

    const res = processGraphqlResponsePayload(
      payload,
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      cfg
    );

    expect(Object.getPrototypeOf(res.authorsByScreenName)).toBe(
      Object.prototype
    );
    expect(
      Object.prototype.hasOwnProperty.call(res.authorsByScreenName, '__proto__')
    ).toBe(true);
    expect(res.authorsByScreenName['author']).toBeUndefined();
    expect(res.authorsByScreenName['riskBadges']).toBeUndefined();
    expect(res.authorsByScreenName['__proto__']?.author.followersCount).toBe(
      500
    );
    expect(
      Object.prototype.hasOwnProperty.call(
        res.authorsByScreenName,
        'constructor'
      )
    ).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(res.authorsByScreenName, 'tostring')
    ).toBe(true);
    expect(Object.keys(res.authorsByScreenName)).toContain('__proto__');

    expect(Object.getPrototypeOf(res.decisionsByTweetId)).toBe(
      Object.prototype
    );
    expect(
      Object.prototype.hasOwnProperty.call(res.decisionsByTweetId, '__proto__')
    ).toBe(true);
    expect(res.decisionsByTweetId['decision']).toBeUndefined();
    expect(res.decisionsByTweetId['tweet']).toBeUndefined();
  });

  it('isolates GraphQL Retweet echoes when retweetedRaw.legacy uses text (no full_text) or omits full_text altogether', () => {
    const cfg = createDefaultConfig('standard');
    cfg.rules.keywords.items.push({
      id: 'kw-rt-legacy',
      pattern: 'secret_blocked_phrase',
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    });
    cfg.whitelistUids['wl-orig'] = {
      uid: 'wl-orig',
      screenName: 'trusted_orig',
      addedAt: 1,
    };

    const buildRtPayload = (
      innerLegacy: Record<string, unknown>,
      origUid = 'wl-orig',
      quotedLegacy?: Record<string, unknown>
    ) => ({
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'rt-legacy-1',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: '98201',
                            legacy: {
                              full_text:
                                'RT @trusted_orig: Legacy secret_blocked_phrase',
                              retweeted_status_result: {
                                result: {
                                  rest_id: '98201-orig',
                                  legacy: innerLegacy,
                                  core: {
                                    user_results: {
                                      result: {
                                        rest_id: origUid,
                                        legacy: {
                                          screen_name: 'trusted_orig',
                                          name: 'Trusted Orig',
                                          statuses_count: 100,
                                          followers_count: 500,
                                          created_at:
                                            'Wed Jan 01 00:00:00 +0000 2020',
                                        },
                                      },
                                    },
                                  },
                                  ...(quotedLegacy
                                    ? {
                                        quoted_status_result: {
                                          result: {
                                            rest_id: '98201-qt',
                                            legacy: quotedLegacy,
                                            core: {
                                              user_results: {
                                                result: {
                                                  rest_id: 'u-qt-legacy',
                                                  legacy: {
                                                    screen_name: 'qt_legacy',
                                                    name: 'QT Legacy',
                                                    statuses_count: 100,
                                                    followers_count: 200,
                                                    created_at:
                                                      'Wed Jan 01 00:00:00 +0000 2020',
                                                  },
                                                },
                                              },
                                            },
                                          },
                                        },
                                      }
                                    : {}),
                                },
                              },
                            },
                            core: {
                              user_results: {
                                result: {
                                  rest_id: 'u-random-rt',
                                  legacy: {
                                    screen_name: 'random_rt',
                                    name: 'Random RT',
                                    statuses_count: 100,
                                    followers_count: 50,
                                    created_at:
                                      'Wed Jan 01 00:00:00 +0000 2020',
                                  },
                                },
                              },
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
      },
    });

    // 1. Whitelisted RT using legacy.text (no full_text) -> ALLOWED
    const resLegacyText = processGraphqlResponsePayload(
      buildRtPayload({ text: 'Legacy secret_blocked_phrase' }),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      cfg
    );
    expect(resLegacyText.decisionsByTweetId['98201']!.tweet.retweetedText).toBe(
      'Legacy secret_blocked_phrase'
    );
    expect(resLegacyText.decisionsByTweetId['98201']!.decision.blocked).toBe(
      false
    );

    // 2. Whitelisted RT omitting full_text and text ({}) -> ALLOWED (retweetedText === '')
    const resOmittedText = processGraphqlResponsePayload(
      buildRtPayload({}),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      cfg
    );
    expect(resOmittedText.decisionsByTweetId['98201']!.tweet.retweetedText).toBe(
      ''
    );
    expect(resOmittedText.decisionsByTweetId['98201']!.decision.blocked).toBe(
      false
    );

    // 3. Unwhitelisted RT using legacy.text -> BLOCKED with hit_uid attributed to origUid
    const resUnwhitelisted = processGraphqlResponsePayload(
      buildRtPayload({ text: 'Legacy secret_blocked_phrase' }, 'u-spam-legacy'),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      cfg
    );
    expect(resUnwhitelisted.decisionsByTweetId['98201']!.decision.blocked).toBe(
      true
    );
    expect(
      resUnwhitelisted.decisionsByTweetId['98201']!.decision.evidence
    ).toContainEqual({
      key: 'hit_uid',
      label: 'Matched UID',
      value: 'u-spam-legacy',
    });

    // 4. Quoted tweet using legacy.text (no full_text) -> extracted and evaluated under quotedAuthor
    const resQuotedLegacy = processGraphqlResponsePayload(
      buildRtPayload({}, 'wl-orig', { text: 'Quoted secret_blocked_phrase' }),
      'https://x.com/i/api/graphql/abc/HomeTimeline',
      '/home',
      cfg
    );
    expect(resQuotedLegacy.decisionsByTweetId['98201']!.tweet.quotedText).toBe(
      'Quoted secret_blocked_phrase'
    );
    expect(resQuotedLegacy.decisionsByTweetId['98201']!.decision.blocked).toBe(
      true
    );
    expect(
      resQuotedLegacy.decisionsByTweetId['98201']!.decision.evidence
    ).toContainEqual({
      key: 'hit_uid',
      label: 'Matched UID',
      value: 'u-qt-legacy',
    });
  });

  it('rejects leading/trailing whitespace and Unicode+ASCII double trailing dots in matchesDomainRule and normalizeDomainRule while keeping valid single trailing dots', () => {
    // Whitespace-padded hosts strictly rejected by matchesDomainRule
    expect(matchesDomainRule('münchen.de ', 'münchen.de')).toBe(false);
    expect(matchesDomainRule(' münchen.de', 'münchen.de')).toBe(false);
    expect(matchesDomainRule('t.me ', 't.me')).toBe(false);
    expect(matchesDomainRule(' t.me', 't.me')).toBe(false);

    // normalizeDomainRule still trims user-entered UI whitespace cleanly
    expect(normalizeDomainRule('  t.me  ')).toBe('t.me');
    expect(isValidDomainRule(normalizeDomainRule('  t.me  '))).toBe(true);

    // Unicode + ASCII double trailing dots rejected by BOTH matchesDomainRule & normalizeDomainRule
    const badDoubleDotHosts = [
      'münchen.de..',
      'münchen.de。.',
      'münchen.de．.',
      'münchen.de｡.',
      'münchen.de.。',
      'münchen.de。。',
      't.me..',
      't.me。.',
      't.me．.',
      't.me｡.',
    ];
    for (const bad of badDoubleDotHosts) {
      const ruleTarget = bad.startsWith('t.me') ? 't.me' : 'münchen.de';
      expect(
        matchesDomainRule(bad, ruleTarget),
        `Expected matchesDomainRule("${bad}", "${ruleTarget}") === false`
      ).toBe(false);
      expect(
        isValidDomainRule(normalizeDomainRule(bad)),
        `Expected normalizeDomainRule("${bad}") to be invalid`
      ).toBe(false);
    }

    // Valid single trailing dot FQDNs still work
    expect(matchesDomainRule('t.me.', 't.me')).toBe(true);
    expect(matchesDomainRule('sub.münchen.de.', 'münchen.de')).toBe(true);
    expect(isValidDomainRule(normalizeDomainRule('t.me.'))).toBe(true);
    expect(isValidDomainRule(normalizeDomainRule('sub.münchen.de.'))).toBe(true);
  });

  it('T5-R1 regressions: ignores GraphQL query-param scene/focal spoofing (BUG-C1-1), guards mergeAuthors bioUrls (BUG-C1-5), and preserves viral-thread duplicate LRU recency (BUG-C1-7)', () => {
    // BUG-C1-1: query params containing TweetDetail / UserTweets / focalTweetId must NOT spoof scene or focalTweetId
    expect(
      detectSceneFromUrl(
        'https://x.com/i/api/graphql/q1/SearchTimeline?variables=%7B%22rawQuery%22%3A%22TweetDetail%22%7D',
        '/search'
      )
    ).toBe('search');
    expect(
      detectSceneFromUrl(
        'https://x.com/i/api/graphql/q1/HomeTimeline?variables=%7B%22cursor%22%3A%22UserTweets_abc%22%7D',
        '/home'
      )
    ).toBe('timeline');
    expect(
      detectTimelineFeedFromUrl(
        'https://x.com/i/api/graphql/q1/HomeTimeline?variables=%7B%22cursor%22%3A%22UserTweets_abc%22%7D'
      )
    ).toBe('for_you');

    const cfg = createDefaultConfig('standard');
    cfg.rules.keywords.enabled = true;
    cfg.rules.keywords.items = [
      {
        id: 'kw-spoof-test',
        pattern: 'spoofed_focal_spam',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
    ];
    const searchPayload = {
      data: {
        search_by_raw_query: {
          search_timeline: {
            timeline: {
              instructions: [
                {
                  type: 'TimelineAddEntries',
                  entries: [
                    {
                      entryId: 'tweet-1800000000000000099',
                      content: {
                        entryType: 'TimelineTimelineItem',
                        itemContent: {
                          itemType: 'TimelineTweet',
                          tweet_results: {
                            result: {
                              __typename: 'Tweet',
                              rest_id: '1800000000000000099',
                              core: {
                                user_results: {
                                  result: {
                                    __typename: 'User',
                                    rest_id: '555001',
                                    legacy: {
                                      screen_name: 'search_spammer',
                                      name: 'Spammer',
                                      description: '',
                                      followers_count: 10,
                                      friends_count: 5,
                                      statuses_count: 20,
                                      created_at: 'Mon Jan 01 00:00:00 +0000 2022',
                                    },
                                  },
                                },
                              },
                              legacy: {
                                id_str: '1800000000000000099',
                                full_text: 'Check out spoofed_focal_spam right now',
                                lang: 'en',
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
        },
      },
    };
    const spoofedSearchUrl =
      'https://x.com/i/api/graphql/q1/SearchTimeline?variables=%7B%22rawQuery%22%3A%22TweetDetail%20%5C%22focalTweetId%5C%22%3A%5C%221800000000000000099%5C%22%22%7D';
    const processed = processGraphqlResponsePayload(
      searchPayload,
      spoofedSearchUrl,
      '/search',
      cfg
    );
    expect(processed.decisionsByTweetId['1800000000000000099']?.decision.blocked).toBe(
      true
    );
    expect(processed.interceptedLogs).toHaveLength(1);

    // BUG-C1-5: mergeAuthors handles malformed missing bioUrls defensively
    const baseAuthor = makeAuthor({ bioUrls: ['https://existing.example'] });
    const malformedIncoming = {
      ...makeAuthor({ restId: baseAuthor.restId }),
      bioUrls: undefined as unknown as string[],
    };
    expect(mergeAuthors(baseAuthor, malformedIncoming).bioUrls).toEqual([
      'https://existing.example',
    ]);

    // BUG-C1-7: ThreadDuplicateTracker retains actively repeating spam wave across >500 unique replies via LRU touch
    const tracker = new ThreadDuplicateTracker();
    const spamSig = 'activerepeatedspamwave';
    expect(tracker.recordAndCheck('th1', 'tw-0', 'spam-0', spamSig)).toBe(false);
    for (let i = 1; i <= 500; i++) {
      expect(
        tracker.recordAndCheck('th1', `tw-uniq-${i}`, `user-${i}`, `uniquelegitreplycontent${i}`)
      ).toBe(false);
      if (i % 50 === 0) {
        expect(tracker.recordAndCheck('th1', `tw-spam-${i}`, `spam-${i}`, spamSig)).toBe(
          true
        );
      }
    }
    expect(tracker.recordAndCheck('th1', 'tw-spam-final', 'spam-final', spamSig)).toBe(
      true
    );
  });
});
