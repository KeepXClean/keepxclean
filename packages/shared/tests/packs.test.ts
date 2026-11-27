import { describe, expect, it } from 'vitest';
import {
  checkRegexSafety,
  createDefaultConfig,
  DEFAULT_CLOUD_KEYWORDS,
  evaluateTweet,
  isSafeRegexPattern,
  MAX_RULE_PACK_BLOCKED_UIDS,
  MAX_RULE_PACK_BYTES,
  MAX_RULE_PACK_DOMAINS,
  MAX_RULE_PACK_KEYWORDS,
  MAX_RULE_PACK_REGEX_LENGTH,
  RULE_PACK_FORMAT,
  serializeRulePack,
  SUPPORTED_LOCALES,
  validateRulePack,
  type ExtractedAuthor,
  type ExtractedTweet,
  type InstalledRulePack,
  type KeywordMatchScope,
  type RulePackPayload,
} from '../src';

function makeValidPack(
  overrides: Partial<RulePackPayload> = {}
): RulePackPayload {
  return {
    format: RULE_PACK_FORMAT,
    id: 'crypto-spam-pack-v1',
    name: 'Crypto Scam Shield',
    description: 'Blocks common memecoin and wallet phishing funnels.',
    author: 'community_maintainer',
    version: '1.0.0',
    locale: 'universal',
    updatedAt: '2026-11-20T00:00:00.000Z',
    keywords: [
      {
        id: 'pk-kw-1',
        pattern: 'instant\\s+bonus\\s+voucher',
        isRegex: true,
        scopes: ['text', 'bio'],
        enabled: true,
      },
    ],
    domains: [
      {
        id: 'pk-dom-1',
        domain: 'HTTPS://WWW.Scam-Drop.Example/claim',
        enabled: true,
      },
    ],
    blockedUids: [
      {
        uid: '1234567890',
        screenName: 'scam_bot_1',
        name: 'Scam Bot',
        avatarUrl: 'https://pbs.twimg.com/profile_images/1/avatar.jpg',
        tag: 'scam',
        reason: 'Phishing wallet drainer',
        addedAt: 1700000000000,
      },
    ],
    ...overrides,
  };
}

function makeAuthor(overrides: Partial<ExtractedAuthor> = {}): ExtractedAuthor {
  return {
    restId: '30001',
    screenName: 'user_a',
    name: 'User A',
    bio: 'Regular bio',
    bioUrls: [],
    createdAt: '2021-01-01T00:00:00.000Z',
    accountAgeDays: 1000,
    statusesCount: 400,
    dailyTweetRate: 1,
    followersCount: 600,
    friendsCount: 200,
    followRatio: 0.33,
    mediaCount: 20,
    favouritesCount: 150,
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
    tweetId: '777001',
    text: 'Ordinary conversation about open-source tools.',
    urls: [],
    hashtagCount: 0,
    cashtagCount: 0,
    isPromoted: false,
    isReply: false,
    replyCount: 1,
    favoriteCount: 5,
    viewCount: 100,
    scene: 'timeline',
    author: makeAuthor(authorOverrides),
    ...overrides,
  };
}

describe('Offline Rule Packs (kxc-pack-v1) — Validation & Serialization Security', () => {
  it('validates, normalizes domains, and round-trips cleanly through serializeRulePack', () => {
    const raw = makeValidPack();
    const validated = validateRulePack(raw);
    expect(validated.format).toBe('kxc-pack-v1');
    expect(validated.domains?.[0]?.domain).toBe('scam-drop.example');

    // Accepts JSON string input directly
    const json = serializeRulePack(validated);
    const reparsed = validateRulePack(json);
    expect(reparsed).toEqual(validated);

    // Accepts supported locale values as well as 'universal'
    expect(validateRulePack(makeValidPack({ locale: 'ja' })).locale).toBe('ja');
    expect(validateRulePack(makeValidPack({ locale: 'zh-CN' })).locale).toBe(
      'zh-CN'
    );

    // serializeRulePack strips InstalledRulePack local metadata cleanly
    const installed: InstalledRulePack = {
      ...validated,
      enabled: true,
      installedAt: 1700000000000,
      disabledItemIds: ['pk-kw-1'],
    };
    const exportedJson = serializeRulePack(installed);
    const parsedExport = JSON.parse(exportedJson) as Record<string, unknown>;
    expect(parsedExport.enabled).toBeUndefined();
    expect(parsedExport.installedAt).toBeUndefined();
    expect(parsedExport.disabledItemIds).toBeUndefined();
    expect(validateRulePack(exportedJson)).toEqual(validated);
  });

  it('rejects malformed payloads, wrong format, missing metadata, and forbidden config/prototype keys', () => {
    expect(() => validateRulePack(null)).toThrow();
    expect(() => validateRulePack([])).toThrow();
    expect(() => validateRulePack('not json{')).toThrow(/valid JSON/i);
    expect(() =>
      validateRulePack({ ...makeValidPack(), format: 'kxc-pack-v2' })
    ).toThrow(/format/i);
    expect(() =>
      validateRulePack({ ...makeValidPack(), id: '' })
    ).toThrow(/id/i);
    expect(() =>
      validateRulePack({ ...makeValidPack(), id: '../evil' })
    ).toThrow(/id/i);
    expect(() =>
      validateRulePack({ ...makeValidPack(), name: '   ' })
    ).toThrow(/name/i);
    expect(() =>
      validateRulePack({ ...makeValidPack(), version: '' })
    ).toThrow(/version/i);
    expect(() =>
      validateRulePack({ ...makeValidPack(), updatedAt: 'not-a-date' })
    ).toThrow(/updatedAt/i);
    expect(() =>
      validateRulePack({ ...makeValidPack(), locale: 'xx-INVALID' })
    ).toThrow(/locale/i);

    // Reject ALL forbidden top-level config keys
    const forbiddenKeys = [
      'whitelistUids',
      'localBlocklistUids',
      'customApiBaseUrl',
      'syncNativeXBlock',
      'enableCrowdReport',
      'enableSync',
      'enableCloudKeywords',
      'disabledCloudKeywordIds',
      'enabledCloudLangGroups',
      'rules',
      'preset',
      'interceptionMode',
      'sceneModes',
      'installedPacks',
      'onboardingDismissed',
      'exemptFollowing',
      'profileSceneBadgeOnly',
      'theme',
      'enabled',
    ];
    for (const key of forbiddenKeys) {
      expect(
        () => validateRulePack({ ...makeValidPack(), [key]: {} }),
        `Expected forbidden key "${key}" to be rejected`
      ).toThrow(/forbidden/i);
    }

    // Reject prototype pollution via JSON string (nested & top-level)
    const protoJson = JSON.stringify(makeValidPack()).replace(
      '{',
      '{"__proto__":{"polluted":true},'
    );
    expect(() => validateRulePack(protoJson)).toThrow(/forbidden/i);

    const nestedConstructorJson = JSON.stringify({
      ...makeValidPack(),
      keywords: [
        {
          id: 'k1',
          pattern: 'abc',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        },
      ],
    }).replace('"id":"k1"', '"constructor":{"polluted":true},"id":"k1"');
    expect(() => validateRulePack(nestedConstructorJson)).toThrow(/forbidden/i);

    // Reject forbidden keys even if passed to serializeRulePack
    expect(() =>
      serializeRulePack({
        ...makeValidPack(),
        whitelistUids: { '1': {} },
      } as unknown as RulePackPayload)
    ).toThrow(/forbidden/i);
  });

  it('rejects invalid regex, overlong regex, invalid domains, non-numeric UIDs, unsafe avatarUrl, duplicate IDs, and caps', () => {
    // Invalid regex
    expect(() =>
      validateRulePack(
        makeValidPack({
          keywords: [
            {
              id: 'bad-re',
              pattern: '[unclosed',
              isRegex: true,
              scopes: ['text'],
              enabled: true,
            },
          ],
        })
      )
    ).toThrow(/regular expression/i);

    // Overlong regex (> 500)
    expect(() =>
      validateRulePack(
        makeValidPack({
          keywords: [
            {
              id: 'long-re',
              pattern: 'a'.repeat(MAX_RULE_PACK_REGEX_LENGTH + 1),
              isRegex: true,
              scopes: ['text'],
              enabled: true,
            },
          ],
        })
      )
    ).toThrow(/pattern/i);

    // Empty scopes
    expect(() =>
      validateRulePack(
        makeValidPack({
          keywords: [
            {
              id: 'empty-scope',
              pattern: 'abc',
              isRegex: false,
              scopes: [],
              enabled: true,
            },
          ],
        })
      )
    ).toThrow(/scopes/i);

    // Duplicate keyword IDs
    expect(() =>
      validateRulePack(
        makeValidPack({
          keywords: [
            {
              id: 'dup',
              pattern: 'a',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
            },
            {
              id: 'dup',
              pattern: 'b',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
            },
          ],
        })
      )
    ).toThrow(/duplicate/i);

    // Invalid domain
    expect(() =>
      validateRulePack(
        makeValidPack({
          domains: [{ id: 'd1', domain: 'localhost', enabled: true }],
        })
      )
    ).toThrow(/domain/i);

    // Non-numeric UID
    expect(() =>
      validateRulePack(
        makeValidPack({
          blockedUids: [{ uid: 'not_a_number', screenName: 'x', addedAt: 1 }],
        })
      )
    ).toThrow(/uid/i);

    // Unsafe avatarUrl schemes rejected
    for (const badAvatar of [
      'http://pbs.twimg.com/a.jpg',
      'javascript:alert(1)',
      'data:image/svg+xml,<svg/>',
    ]) {
      expect(() =>
        validateRulePack(
          makeValidPack({
            blockedUids: [
              {
                uid: '12345',
                screenName: 'x',
                avatarUrl: badAvatar,
                addedAt: 1,
              },
            ],
          })
        )
      ).toThrow(/https:\/\//i);
    }

    // Count caps: keywords > 200, domains > 200, blockedUids > 2000
    expect(() =>
      validateRulePack(
        makeValidPack({
          keywords: Array.from({ length: MAX_RULE_PACK_KEYWORDS + 1 }, (_, i) => ({
            id: `k-${i}`,
            pattern: `p-${i}`,
            isRegex: false,
            scopes: ['text'],
            enabled: true,
          })),
        })
      )
    ).toThrow(/maximum count/i);

    expect(() =>
      validateRulePack(
        makeValidPack({
          domains: Array.from({ length: MAX_RULE_PACK_DOMAINS + 1 }, (_, i) => ({
            id: `d-${i}`,
            domain: `d${i}.example`,
            enabled: true,
          })),
        })
      )
    ).toThrow(/maximum count/i);

    expect(() =>
      validateRulePack(
        makeValidPack({
          blockedUids: Array.from(
            { length: MAX_RULE_PACK_BLOCKED_UIDS + 1 },
            (_, i) => ({
              uid: String(10000 + i),
              screenName: `u${i}`,
              addedAt: 1,
            })
          ),
        })
      )
    ).toThrow(/maximum count/i);

    // Size cap (> 2 MiB)
    const hugeString = ' '.repeat(MAX_RULE_PACK_BYTES + 10);
    expect(() => validateRulePack(hugeString)).toThrow(/maximum size/i);
  });

  it('blocks toJSON size-cap bypass, sparse arrays, cross-section ID collisions, non-ISO updatedAt, control-char avatarUrl, and exponential DAGs while allowing shared acyclic refs and near-2-MiB round-trips', () => {
    // 1. toJSON() 2 MiB cap bypass (enumerable & non-enumerable) and non-JSON value types rejected
    const hugeBlocked = Array.from({ length: 1800 }, (_, i) => ({
      uid: String(100000 + i),
      screenName: `scam_${i}`,
      name: '中'.repeat(180),
      reason: '骗'.repeat(450),
      addedAt: 1700000000000,
    }));
    const evilEnumerable = {
      ...makeValidPack({ blockedUids: hugeBlocked }),
      toJSON() {
        return '{}';
      },
    };
    expect(() => validateRulePack(evilEnumerable)).toThrow(/JSON-compatible/i);

    const evilNonEnumerable = { ...makeValidPack({ blockedUids: hugeBlocked }) };
    Object.defineProperty(evilNonEnumerable, 'toJSON', {
      value: () => '{}',
      enumerable: false,
    });
    expect(() => validateRulePack(evilNonEnumerable)).toThrow(
      /JSON-compatible/i
    );

    expect(() =>
      validateRulePack({ ...makeValidPack(), extraBig: 123n })
    ).toThrow(/JSON-compatible/i);
    expect(() =>
      validateRulePack({ ...makeValidPack(), extraSym: Symbol('x') })
    ).toThrow(/JSON-compatible/i);

    // 2. Near-2-MiB pack where compact <= 2 MiB but pretty > 2 MiB MUST round-trip through serializeRulePack
    const nearCapEntries = Array.from({ length: 2000 }, (_, i) => ({
      uid: String(1000000 + i),
      screenName: `spammer_${i}`,
      name: 'A'.repeat(180),
      reason: 'B'.repeat(490),
      avatarUrl: `https://pbs.twimg.com/profile_images/${i}/${'x'.repeat(200)}.png`,
      tag: 'scam' as const,
      addedAt: 1700000000000,
    }));
    const nearCapPack = makeValidPack({
      keywords: undefined,
      domains: undefined,
      blockedUids: nearCapEntries,
    });
    const prettySize = new TextEncoder().encode(
      JSON.stringify(nearCapPack, null, 2)
    ).byteLength;
    const compactSize = new TextEncoder().encode(
      JSON.stringify(nearCapPack)
    ).byteLength;
    expect(compactSize).toBeLessThanOrEqual(MAX_RULE_PACK_BYTES);
    expect(prettySize).toBeGreaterThan(MAX_RULE_PACK_BYTES);

    const exportedNearCap = serializeRulePack(nearCapPack);
    expect(
      new TextEncoder().encode(exportedNearCap).byteLength
    ).toBeLessThanOrEqual(MAX_RULE_PACK_BYTES);
    expect(validateRulePack(exportedNearCap)).toEqual(
      validateRulePack(nearCapPack)
    );

    // 3. Sparse arrays rejected across keywords, domains, blockedUids, and scopes
    const sparseKeywords: unknown[] = [];
    sparseKeywords[1] = {
      id: 'k-sparse',
      pattern: 'abc',
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    };
    expect(() =>
      validateRulePack({ ...makeValidPack(), keywords: sparseKeywords })
    ).toThrow(/sparse/i);

    const sparseDomains: unknown[] = [];
    sparseDomains[1] = { id: 'd-sparse', domain: 'evil.example', enabled: true };
    expect(() =>
      validateRulePack({ ...makeValidPack(), domains: sparseDomains })
    ).toThrow(/sparse/i);

    const sparseUids: unknown[] = [];
    sparseUids[1] = { uid: '999999', screenName: 'x', addedAt: 1 };
    expect(() =>
      validateRulePack({ ...makeValidPack(), blockedUids: sparseUids })
    ).toThrow(/sparse/i);

    const sparseScopes: unknown[] = [];
    sparseScopes[1] = 'text';
    expect(() =>
      validateRulePack({
        ...makeValidPack(),
        keywords: [
          {
            id: 'k1',
            pattern: 'abc',
            isRegex: false,
            scopes: sparseScopes,
            enabled: true,
          },
        ],
      })
    ).toThrow(/sparse/i);

    // 4. Shared acyclic references PASS, while true cycles and exponential DAGs THROW
    const sharedScopes: KeywordMatchScope[] = ['text', 'bio'];
    const sharedPack = makeValidPack({
      keywords: [
        {
          id: 'k-shared-1',
          pattern: 'alpha',
          isRegex: false,
          scopes: sharedScopes,
          enabled: true,
        },
        {
          id: 'k-shared-2',
          pattern: 'beta',
          isRegex: false,
          scopes: sharedScopes,
          enabled: true,
        },
      ],
    });
    const validatedShared = validateRulePack(sharedPack);
    expect(validatedShared.keywords).toHaveLength(2);
    expect(validateRulePack(serializeRulePack(sharedPack))).toEqual(
      validatedShared
    );

    const cyclic: Record<string, unknown> = { ...makeValidPack() };
    cyclic.self = cyclic;
    expect(() => validateRulePack(cyclic)).toThrow(/circular/i);

    let dag: unknown = { leaf: 1 };
    for (let i = 0; i < 18; i++) {
      dag = [dag, dag];
    }
    expect(() =>
      validateRulePack({ ...makeValidPack(), extraDag: dag })
    ).toThrow(/complexity/i);

    // 5. Pack-wide cross-section ID uniqueness prevents disabledItemIds collisions
    expect(() =>
      validateRulePack(
        makeValidPack({
          keywords: [
            {
              id: 'shared-id',
              pattern: 'trigger',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
            },
          ],
          domains: [{ id: 'shared-id', domain: 'evil.example', enabled: true }],
          blockedUids: undefined,
        })
      )
    ).toThrow(/duplicate/i);

    expect(() =>
      validateRulePack(
        makeValidPack({
          keywords: [
            {
              id: '1234567890',
              pattern: 'trigger',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
            },
          ],
          domains: undefined,
          blockedUids: [
            { uid: '1234567890', screenName: 'bot', addedAt: 1 },
          ],
        })
      )
    ).toThrow(/duplicate/i);

    expect(() =>
      validateRulePack(
        makeValidPack({
          keywords: undefined,
          domains: [{ id: '1234567890', domain: 'evil.example', enabled: true }],
          blockedUids: [
            { uid: '1234567890', screenName: 'bot', addedAt: 1 },
          ],
        })
      )
    ).toThrow(/duplicate/i);

    // 6. Strict ISO-8601 updatedAt validation rejects permissive Date.parse garbage
    for (const badDate of ['not-a-date 1', '1', 'foo 2026', '2026-13-01']) {
      expect(
        () => validateRulePack({ ...makeValidPack(), updatedAt: badDate }),
        `Expected bad updatedAt "${badDate}" to be rejected`
      ).toThrow(/updatedAt/i);
    }
    for (const okDate of [
      '2026-11-20',
      '2026-11-20T00:00:00Z',
      '2026-11-20T08:30:00+08:00',
    ]) {
      expect(validateRulePack(makeValidPack({ updatedAt: okDate })).updatedAt).toBe(
        okDate
      );
    }

    // 7. Reject ASCII control characters (\r, \n, \t, \0) in avatarUrl
    for (const badAvatar of [
      'https://pbs.twimg.com/a\r\n\t.png',
      'https://pbs.twimg.com/a\n.png',
      'https://pbs.twimg.com/a\u0000.png',
    ]) {
      expect(() =>
        validateRulePack(
          makeValidPack({
            blockedUids: [
              {
                uid: '55555',
                screenName: 'bot',
                avatarUrl: badAvatar,
                addedAt: 1,
              },
            ],
          })
        )
      ).toThrow(/control/i);
    }
  });
});

describe('Offline Rule Packs — Engine Evaluation, Penetration, Exemptions & 10-Locale i18n', () => {
  it('evaluates pack blockedUids, domains (including quotedUrls & bioUrls), and keywords with matchedTarget & hit_uid', () => {
    const validated = validateRulePack(makeValidPack());
    const installed: InstalledRulePack = {
      ...validated,
      enabled: true,
      installedAt: 1700000000000,
    };

    const config = createDefaultConfig('standard');
    config.installedPacks = [installed];

    // 1. Pack blockedUids (direct & secondary RT/QT penetration)
    const uidHit = evaluateTweet(
      makeTweet({}, { restId: '1234567890', screenName: 'scam_bot_1' }),
      config
    );
    expect(uidHit.blocked).toBe(true);
    expect(uidHit.ruleId).toBe('rule_pack');
    expect(uidHit.matchedTarget).toEqual({
      kind: 'pack_item',
      id: '1234567890',
      packId: 'crypto-spam-pack-v1',
    });

    const rtUidHit = evaluateTweet(
      makeTweet(
        {
          retweetedAuthor: makeAuthor({
            restId: '1234567890',
            screenName: 'scam_bot_1',
            following: false,
          }),
        },
        { restId: 'u-friend', following: true }
      ),
      config
    );
    expect(rtUidHit.blocked).toBe(true);
    expect(rtUidHit.ruleId).toBe('rule_pack');
    expect(rtUidHit.evidence).toContainEqual({
      key: 'hit_uid',
      label: 'Matched UID',
      value: '1234567890',
    });

    // 2. Pack domain via quotedUrls with secondary hit_uid
    const qtDomHit = evaluateTweet(
      makeTweet(
        {
          quotedUrls: ['https://app.scam-drop.example/go'],
          quotedAuthor: makeAuthor({
            restId: 'u-qt-bad',
            screenName: 'qt_bad',
            following: false,
          }),
        },
        { restId: 'u-friend', following: true }
      ),
      config
    );
    expect(qtDomHit.blocked).toBe(true);
    expect(qtDomHit.ruleId).toBe('rule_pack');
    expect(qtDomHit.matchedTarget).toEqual({
      kind: 'pack_item',
      id: 'pk-dom-1',
      packId: 'crypto-spam-pack-v1',
    });
    expect(qtDomHit.evidence).toContainEqual({
      key: 'hit_uid',
      label: 'Matched UID',
      value: 'u-qt-bad',
    });

    // 3. Pack keyword
    const kwHit = evaluateTweet(
      makeTweet({ text: 'Visit now for instant bonus voucher!' }),
      config
    );
    expect(kwHit.blocked).toBe(true);
    expect(kwHit.ruleId).toBe('rule_pack');
    expect(kwHit.matchedTarget).toEqual({
      kind: 'pack_item',
      id: 'pk-kw-1',
      packId: 'crypto-spam-pack-v1',
    });

    // 4. Respects exemptFollowing for primary author
    const followedAuthor = evaluateTweet(
      makeTweet(
        { text: 'Discussing instant bonus voucher scam tactics' },
        { restId: '1234567890', following: true }
      ),
      config
    );
    expect(followedAuthor.blocked).toBe(false);

    // 5. Respects whitelistUids
    config.whitelistUids['1234567890'] = {
      uid: '1234567890',
      screenName: 'scam_bot_1',
      addedAt: 1,
    };
    expect(
      evaluateTweet(
        makeTweet(
          { text: 'instant bonus voucher' },
          { restId: '1234567890', following: false }
        ),
        config
      ).blocked
    ).toBe(false);

    // 6. Respects pack.disabledItemIds (one-click disable of single item inside pack)
    installed.disabledItemIds = ['pk-kw-1'];
    expect(
      evaluateTweet(
        makeTweet({ text: 'Visit now for instant bonus voucher!' }),
        config
      ).blocked
    ).toBe(false);
    // Other items in the same pack still work!
    expect(
      evaluateTweet(
        makeTweet({ urls: ['https://scam-drop.example/go'] }),
        config
      ).ruleId
    ).toBe('rule_pack');

    // 7. Respects pack.enabled === false
    installed.enabled = false;
    expect(
      evaluateTweet(
        makeTweet({ urls: ['https://scam-drop.example/go'] }),
        config
      ).blocked
    ).toBe(false);
  });

  it('produces localized rule_pack reason strings across all 10 locales', () => {
    const installed: InstalledRulePack = {
      ...validateRulePack(makeValidPack()),
      enabled: true,
      installedAt: 1700000000000,
    };

    for (const loc of SUPPORTED_LOCALES) {
      const config = createDefaultConfig('standard');
      config.locale = loc;
      config.installedPacks = [installed];

      const kwRes = evaluateTweet(
        makeTweet({ text: 'Visit for instant bonus voucher' }),
        config
      );
      const domRes = evaluateTweet(
        makeTweet({ urls: ['https://scam-drop.example/x'] }),
        config
      );
      const uidRes = evaluateTweet(
        makeTweet({}, { restId: '1234567890' }),
        config
      );

      for (const res of [kwRes, domRes, uidRes]) {
        expect(res.ruleId).toBe('rule_pack');
        expect(res.reasonText).toContain('Crypto Scam Shield');
      }
    }
  });

  it('exempts followed secondary quoted/retweeted authors consistently across pack blockedUids, domains, keywords, and cloud_keyword', () => {
    const validated = validateRulePack(makeValidPack());
    const installed: InstalledRulePack = {
      ...validated,
      enabled: true,
      installedAt: 1700000000000,
    };

    const config = createDefaultConfig('standard');
    config.exemptFollowing = true;
    config.installedPacks = [installed];

    const followedQuotedAuthor = makeAuthor({
      restId: '1234567890', // matches pack.blockedUids
      screenName: 'followed_creator',
      bio: 'Reporting on instant bonus voucher and https://onlyfans.com/fake scams',
      bioUrls: ['https://app.scam-drop.example/report'],
      following: true,
    });

    const unfollowedQuotingFollowed = makeTweet(
      {
        text: 'Interesting thread worth reading.',
        quotedText: 'Analysis of instant bonus voucher and https://onlyfans.com/fake',
        quotedUrls: ['https://scam-drop.example/evidence'],
        quotedAuthor: followedQuotedAuthor,
      },
      { restId: 'stranger-primary', following: false }
    );

    // All 3 pack rule types + cloud_keyword MUST exempt the followed quotedAuthor
    expect(evaluateTweet(unfollowedQuotingFollowed, config).blocked).toBe(false);

    // Same for followed retweetedAuthor (with realistic X GraphQL RT echo in tweet.text)
    const unfollowedRetweetingFollowed = makeTweet(
      {
        text: 'RT @followed_creator: Analysis of instant bonus voucher and https://onlyfans.com/fake',
        retweetedText: 'Analysis of instant bonus voucher and https://onlyfans.com/fake',
        retweetedUrls: ['https://scam-drop.example/evidence'],
        retweetedAuthor: followedQuotedAuthor,
      },
      { restId: 'stranger-rt', following: false }
    );
    expect(evaluateTweet(unfollowedRetweetingFollowed, config).blocked).toBe(
      false
    );

    // When exemptFollowing is disabled, pack rules block consistently
    config.exemptFollowing = false;
    const unexemptRes = evaluateTweet(unfollowedQuotingFollowed, config);
    expect(unexemptRes.blocked).toBe(true);
    expect(unexemptRes.ruleId).toBe('rule_pack');
  });

  it('hardens assertSafeGraph against array toJSON/subclass/symbol/proto/accessor attacks, 600MB shared-string DoS, and impossible calendar dates', () => {
    const validKw = {
      id: 'k-0',
      pattern: 'p0',
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    };

    // 1. Enumerable toJSON TOCTOU count-cap bypass attempt on Array -> rejected without executing toJSON
    let executed = false;
    const toctouArr = [validKw] as unknown as Record<string, unknown> &
      Array<typeof validKw>;
    toctouArr.toJSON = () => {
      executed = true;
      for (let i = 1; i <= 250; i++) {
        toctouArr.push({
          id: `k-${i}`,
          pattern: `p${i}`,
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        });
      }
      return [];
    };
    expect(() =>
      validateRulePack({ ...makeValidPack(), keywords: toctouArr })
    ).toThrow(/JSON-compatible/i);
    expect(() =>
      serializeRulePack({
        ...makeValidPack(),
        keywords: toctouArr as unknown as RulePackPayload['keywords'],
      })
    ).toThrow(/JSON-compatible/i);
    expect(executed).toBe(false);
    expect(toctouArr).toHaveLength(1);

    // 2. Non-enumerable toJSON on Array -> rejected without executing
    const nonEnumArr = [validKw];
    Object.defineProperty(nonEnumArr, 'toJSON', {
      value: () => {
        executed = true;
        return [];
      },
      enumerable: false,
    });
    expect(() =>
      validateRulePack({ ...makeValidPack(), keywords: nonEnumArr })
    ).toThrow(/JSON-compatible/i);
    expect(() =>
      serializeRulePack({
        ...makeValidPack(),
        keywords: nonEnumArr as unknown as RulePackPayload['keywords'],
      })
    ).toThrow(/JSON-compatible/i);
    expect(executed).toBe(false);

    // 3. Array subclass with inherited toJSON -> rejected without executing
    class EvilArray<T> extends Array<T> {
      toJSON() {
        executed = true;
        return [];
      }
    }
    const evilSubArr = new EvilArray(validKw);
    expect(() =>
      validateRulePack({ ...makeValidPack(), keywords: evilSubArr })
    ).toThrow(/plain JSON arrays/i);
    expect(executed).toBe(false);

    // 4. Array with Symbol key, own __proto__, own constructor, extra own property, or element getter
    const symArr = [validKw] as unknown as Record<PropertyKey, unknown>;
    symArr[Symbol('evil')] = 1;
    expect(() =>
      validateRulePack({ ...makeValidPack(), keywords: symArr })
    ).toThrow(/JSON-compatible/i);

    const protoArr = [validKw];
    Object.defineProperty(protoArr, '__proto__', {
      value: { polluted: true },
      enumerable: false,
    });
    expect(() =>
      validateRulePack({ ...makeValidPack(), keywords: protoArr })
    ).toThrow(/forbidden property "__proto__"/i);

    const ctorArr = [validKw];
    Object.defineProperty(ctorArr, 'constructor', {
      value: { polluted: true },
      enumerable: false,
    });
    expect(() =>
      validateRulePack({ ...makeValidPack(), keywords: ctorArr })
    ).toThrow(/forbidden property "constructor"/i);

    const extraPropArr = [validKw] as unknown as Record<string, unknown>;
    extraPropArr.evilFn = () => {};
    expect(() =>
      validateRulePack({ ...makeValidPack(), keywords: extraPropArr })
    ).toThrow(/JSON-compatible/i);

    const getterArr: unknown[] = [];
    Object.defineProperty(getterArr, '0', {
      enumerable: true,
      get() {
        executed = true;
        return validKw;
      },
    });
    expect(() =>
      validateRulePack({ ...makeValidPack(), keywords: getterArr })
    ).toThrow(/JSON-compatible/i);
    expect(executed).toBe(false);

    // 5. Plain object with accessor getter -> rejected without invoking getter on both validateRulePack & serializeRulePack
    const getterPack: Record<string, unknown> = { ...makeValidPack() };
    delete getterPack.keywords;
    Object.defineProperty(getterPack, 'keywords', {
      enumerable: true,
      get() {
        executed = true;
        return [validKw];
      },
    });
    expect(() => validateRulePack(getterPack)).toThrow(/JSON-compatible/i);
    expect(() =>
      serializeRulePack(getterPack as unknown as RulePackPayload)
    ).toThrow(/JSON-compatible/i);
    expect(executed).toBe(false);

    // 6. 600 MB shared-string DoS -> fails fast with standard MAX_RULE_PACK_BYTES error (NOT RangeError)
    const bigStr = 'A'.repeat(1_000_000);
    const bigArr = Array.from({ length: 600 }, () => bigStr);
    const t0 = performance.now();
    let caughtErr: unknown;
    try {
      validateRulePack({ ...makeValidPack(), extra: bigArr });
    } catch (err) {
      caughtErr = err;
    }
    const elapsedMs = performance.now() - t0;
    expect(caughtErr).toBeInstanceOf(Error);
    expect(caughtErr).not.toBeInstanceOf(RangeError);
    expect((caughtErr as Error).message).toContain(String(MAX_RULE_PACK_BYTES));
    expect(elapsedMs).toBeLessThan(100);

    // Shared nested object with big string also trips estChars via WeakMap cache
    const sharedBox = { payload: 'B'.repeat(600_000) };
    const sharedBoxes = Array.from({ length: 20 }, () => sharedBox);
    expect(() =>
      validateRulePack({ ...makeValidPack(), extra: sharedBoxes })
    ).toThrow(new RegExp(String(MAX_RULE_PACK_BYTES)));

    // 7. Impossible calendar dates rejected; valid leap days accepted
    const impossibleDates = [
      '2026-02-29',
      '2026-02-30',
      '2026-02-31',
      '2026-02-31T00:00:00Z',
      '2026-04-31T00:00:00Z',
      '2026-06-31',
      '2026-11-31T12:00:00+08:00',
      '2100-02-29',
    ];
    for (const badDate of impossibleDates) {
      expect(
        () => validateRulePack({ ...makeValidPack(), updatedAt: badDate }),
        `Expected impossible calendar date "${badDate}" to be rejected`
      ).toThrow(/updatedAt/i);
    }
    for (const validLeap of ['2024-02-29', '2024-02-29T23:59:59Z', '2000-02-29']) {
      expect(
        validateRulePack(makeValidPack({ updatedAt: validLeap })).updatedAt
      ).toBe(validLeap);
    }

    // 8. Reject out-of-range times (24:00:00 rollover, :60) and impossible space-separated timezone offsets
    const impossibleTimesAndOffsets = [
      '2026-11-25 12:00:00+99:00',
      '2026-11-25 12:00:00-99:00',
      '2026-11-25 12:00:00+25:00',
      '2026-11-25 12:00:00+24:00',
      '2026-11-25 12:00:00+9999',
      '2026-11-25 12:00+9900',
      '2026-11-25 12:00:00+08:60',
      '2026-11-25T24:00:00Z',
      '2026-11-25 24:00:00Z',
      '2026-11-25T12:60:00Z',
      '2026-11-25T12:00:60Z',
    ];
    for (const badTs of impossibleTimesAndOffsets) {
      expect(
        () => validateRulePack({ ...makeValidPack(), updatedAt: badTs }),
        `Expected impossible time/offset "${badTs}" to be rejected`
      ).toThrow(/updatedAt/i);
    }
    for (const validTs of [
      '2026-11-25 12:00:00+08:00',
      '2026-11-25T23:59:59.999Z',
      '2026-11-25T12:30:00-05:30',
    ]) {
      expect(
        validateRulePack(makeValidPack({ updatedAt: validTs })).updatedAt
      ).toBe(validTs);
    }
  });
});

describe('Offline Rule Packs — Static Regex ReDoS Hardening', () => {
  function packWithRegex(pattern: string, isRegex = true): RulePackPayload {
    return makeValidPack({
      keywords: [
        {
          id: 'regex-test-item',
          pattern,
          isRegex,
          scopes: ['text'],
          enabled: true,
        },
      ],
    });
  }

  function expectUnsafeRegexRejected(pattern: string): void {
    const res = checkRegexSafety(pattern);
    expect(res.safe, `Expected checkRegexSafety(${JSON.stringify(pattern)}) to be unsafe`).toBe(
      false
    );
    expect(res.reason).toBeTruthy();
    expect(isSafeRegexPattern(pattern)).toBe(false);

    let caught: unknown;
    try {
      validateRulePack(packWithRegex(pattern));
    } catch (err) {
      caught = err;
    }
    expect(
      caught,
      `Expected validateRulePack to reject ${JSON.stringify(pattern)}`
    ).toBeInstanceOf(Error);
    expect(
      caught,
      `Expected plain Error (not SyntaxError) for ${JSON.stringify(pattern)}`
    ).not.toBeInstanceOf(SyntaxError);
    expect((caught as Error).message).toMatch(
      /^keywords\[0\]\.pattern is an unsafe regular expression \(.+\)$/i
    );
  }

  function expectSafeRegexAccepted(pattern: string): void {
    const res = checkRegexSafety(pattern);
    expect(
      res,
      `Expected checkRegexSafety(${JSON.stringify(pattern)}) to be safe, got: ${res.reason ?? ''}`
    ).toEqual({ safe: true });
    expect(isSafeRegexPattern(pattern)).toBe(true);

    const validated = validateRulePack(packWithRegex(pattern));
    expect(validated.keywords?.[0]?.pattern).toBe(pattern);
  }

  it('Group 1: accepts ALL 45 DEFAULT_CLOUD_KEYWORDS with zero false positives', () => {
    expect(DEFAULT_CLOUD_KEYWORDS).toHaveLength(45);

    for (const item of DEFAULT_CLOUD_KEYWORDS) {
      expect(item.isRegex).toBe(true);
      const safety = checkRegexSafety(item.pattern);
      expect(
        safety,
        `Cloud keyword "${item.id}" was falsely flagged: ${safety.reason ?? ''}`
      ).toEqual({ safe: true });
      expect(isSafeRegexPattern(item.pattern)).toBe(true);

      const singlePack = validateRulePack(makeValidPack({ keywords: [item] }));
      expect(singlePack.keywords?.[0]?.id).toBe(item.id);
    }

    // All 45 packed together also validate and serialize cleanly
    const combined = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    const serialized = serializeRulePack(combined);
    const reparsed = validateRulePack(serialized);
    expect(reparsed.keywords).toHaveLength(45);
  });

  it('Group 2: rejects nested quantifiers and star-height >= 2 ReDoS patterns', () => {
    const nestedQuantifierCases = [
      '(a+)+$',
      '([a-z]+)*',
      '(a*)*',
      '(\\w+)+',
      '(a+){2,}',
      '(?:a+){2,}',
      '(?<x>a+)+',
      '((a+))+',
      '(a+?)+',
      '(a+)+?',
      '(.*a){20}',
      '(a{1,5}){1,5}',
      '(a{1,5}){2}',
      '(a+b?)+',
      '(a?){20}',
      '(a?)+',
      '(?=(a+)+$)',
      '((?=a+)a)+',
      '((?=a)?a)+',
      '(?=a)+',
      '\\\\(a+)+',
      '[\\\\](a+)+',
      '(a+\\\\)+',
      '(\\p{1,5})+$',
      '(\\u{1,5})+$',
      '([a-z]+,)+',
    ];

    for (const pattern of nestedQuantifierCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // ES2025 modifier group checked directly by static analyzer
    const modUnsafe = checkRegexSafety('(?i:a+)+');
    expect(modUnsafe.safe).toBe(false);
    expect(modUnsafe.reason).toBeTruthy();
  });

  it('Group 3: rejects ambiguous / overlapping alternations inside repeating quantifiers', () => {
    const ambiguousAltCases = [
      '(a|a)+',
      '(a|aa)+',
      '(a|a?)+',
      '(a|)+',
      '(?:a(?:a|))+',
      '(\\w|\\d)+',
      '(a|.)+',
      '([a-z]|a)+',
      '([a-z]|[A-Z])+',
      '(.*|a)+',
      '(ab|aba)+',
      '((a|b)|a)+',
      '(?:x(?:a|a))+',
      '([🚨]|[🔥])+$',
      '([А-Я]|[а-я])+',
    ];

    for (const pattern of ambiguousAltCases) {
      expectUnsafeRegexRejected(pattern);
    }
  });

  it('Group 4: rejects adjacent overlapping unbounded quantifiers and unrolled wildcard chains', () => {
    const adjacentOverlapCases = [
      'a+a+',
      'a*a+',
      '\\w+\\w+',
      '\\w+\\d+',
      '\\d+\\d+',
      '\\d+[0-9]+',
      '.*.*',
      '.+.+',
      '.*a+',
      'a+.*',
      '[a-z]+[a-z]+',
      '[a-z]+[A-Z]+',
      '\\s+\\s+',
      '(a+)(a+)',
      '(ab)+(ab)+',
      'a+()a+',
      'a+(?=a)a+',
      'a+a?a+',
      '.*a?.*',
      '(a+|b+)a+',
      '(a+|c)a+',
      'a+(?:a?a+)',
      'a+(?:a+)?a+',
      '.*a.*a.*a.*a.*a.*a.*a',
      '\\w+a\\w+a\\w+a\\w+a\\w+a\\w+a\\w+',
    ];

    for (const pattern of adjacentOverlapCases) {
      expectUnsafeRegexRejected(pattern);
    }
  });

  it('Group 5: rejects backreferences inside repeating quantifiers', () => {
    const backrefCases = [
      '(.+)\\1+',
      '(a+)\\1+',
      '((a)\\1)+',
      '(?<g>.+)\\k<g>+',
      '(a)\\1{2,}',
      '(a)\\1{2}',
      '(\\1a)+',
    ];

    for (const pattern of backrefCases) {
      expectUnsafeRegexRejected(pattern);
    }
  });

  it('Group 6: enforces nesting depth, finite bound, and fixed expansion guards and safely handles malformed syntax', () => {
    const depthBoundCases = [
      '('.repeat(28) + 'a' + ')'.repeat(28),
      'a{1,10000}',
      'a{10001}',
      'a{1,9999999999999999999999}',
      '((a{50}){50}){5}',
    ];

    for (const pattern of depthBoundCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Direct checkRegexSafety calls on syntactically malformed patterns must never throw or hang
    const malformedCases = [
      '[unclosed',
      '(abc',
      'abc\\',
      'abc)',
      '*abc',
      '+abc',
      '?abc',
      'a++',
      'a{5,2}',
      '[z-a]',
      '(?<1bad>a)',
      '(?<>a)',
      '(?<a-b>x)',
      '(?<a>x)(?<a>y)',
      '(?<a>(?<a>x))',
      '(?<name>a)\\k<missing>',
      '[\\p{z-a}]',
      '[a-\\c!]',
      '(?im-i:a)',
      '(?ss:a)',
      '(?s-s:a)',
      '(?invalid)',
      '(?<=a)+',
      '(?<©>a)',
      '(?<€>a)',
    ];
    for (const pattern of malformedCases) {
      const res = checkRegexSafety(pattern);
      expect(res, `Expected malformed ${JSON.stringify(pattern)} to fail cleanly`).toEqual({
        safe: false,
        reason: 'invalid regular expression syntax',
      });
    }
  });

  it('Group 7: accepts safe escapes, character classes, fixed-bounded, optional-wrapped, and disjoint patterns', () => {
    const safePatterns = [
      '\\(a+\\)+',
      '\\\\\\(a+\\\\\\)+',
      '\\x28a+\\x29+',
      '\\u0028a+\\u0029+',
      '[a+*(){}|]+',
      '[\\]]+',
      '[\\\\]+',
      '[^]+',
      '[]',
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      'https?://[\\w.-]+(?:/[\\w./?%&=-]*)?',
      '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}',
      '(\\d{3}-){2}',
      '(\\d{3}-){2}\\d{4}',
      '(?:[0-9a-f]{2}:){5}[0-9a-f]{2}',
      '(\\d{3}-){1,3}',
      '(a|b)+',
      '(foo|bar|baz)+',
      '([a-z]|[0-9])+',
      '(?:http://|https://)+',
      '(🚨|🔥)+',
      'foo.*bar',
      'foo.{0,20}bar',
      '.*https?://[\\w.-]+',
      '\\s*\\d+\\s*',
      '\\S+\\s+',
      '[^\\s]+\\s+',
      '[\\u4e00-\\u9fa5]+\\s+',
      '([\\u4e00-\\u9fa5]|[\\u3040-\\u309f])+',
      'foo\\s*,?\\s*bar',
      'a+b+',
      '\\w+\\s+\\w+',
      '\\w+\\s+\\w+\\s+\\w+\\s+\\w+\\s+\\w+',
      '(?:ll\\s+)?',
      '(?:diarias\\s+)?',
      '(?:journaliers?\\s+)?',
      '(?:jedem\\s+|allen\\s+|sofort\\s+)?',
      '撸毛(?!孩子|猫|狗)',
      '(?!\\s+up\\b)',
      '(?:(?!foo|bar).)+',
      '(?<=foo)bar',
      'foo.*bar(?:s)?',
      'a+ba+$',
      '(?:ab)+xyz(?:ab)+$',
      '(cat|catalog)',
      'a{foo}',
      'a{,5}',
      'a{1, 2}',
      'wa\\.me/\\d{6,}',
      'claim\\s+free\\s+airdrop\\s+now',
      '(?:[a-z]{2}){3}',
      '[A-\\c!]',
      '\\k<foo>',
    ];

    for (const pattern of safePatterns) {
      expectSafeRegexAccepted(pattern);
    }

    // ES2025 modifier groups & non-/u \p escapes directly via checkRegexSafety
    expect(checkRegexSafety('(?i:foo)')).toEqual({ safe: true });
    expect(checkRegexSafety('(?-i:foo)')).toEqual({ safe: true });
    expect(checkRegexSafety('(?-i:(a|A)+)$')).toEqual({ safe: true });
    expect(checkRegexSafety('(?s:foo)')).toEqual({ safe: true });
    expect(checkRegexSafety('(?s:(?-s:.|\\n)+)$')).toEqual({ safe: true });
    expect(checkRegexSafety('\\p{Letter}+')).toEqual({ safe: true });
    expect(checkRegexSafety('[\\p{L}\\d]+')).toEqual({ safe: true });
    expect(checkRegexSafety('[^\\p{Letter}]+')).toEqual({ safe: true });
    // Negated class [^p{Letr}] still contains 'a', so alternation with 'a' inside '+' is rejected
    expect(checkRegexSafety('([^\\p{Letter}]|a)+').safe).toBe(false);
  });

  it('Group 8: preserves isRegex: false bypass, syntax error precedence, plain Error class, and serializeRulePack rejection', () => {
    // 1. Plain literal containing ReDoS-like text MUST pass when isRegex is false
    const literalPack = validateRulePack(packWithRegex('(a+)+$', false));
    expect(literalPack.keywords?.[0]?.pattern).toBe('(a+)+$');
    expect(literalPack.keywords?.[0]?.isRegex).toBe(false);

    // 2. Syntax error takes precedence over safety error and remains plain Error (not SyntaxError)
    let syntaxErr: unknown;
    try {
      validateRulePack(packWithRegex('[unclosed', true));
    } catch (err) {
      syntaxErr = err;
    }
    expect(syntaxErr).toBeInstanceOf(Error);
    expect(syntaxErr).not.toBeInstanceOf(SyntaxError);
    expect((syntaxErr as Error).message).toBe(
      'keywords[0].pattern is not a valid regular expression'
    );

    // 3. ReDoS error is a plain Error (never SyntaxError, so PacksTab won't misreport Invalid JSON)
    let redosErr: unknown;
    try {
      validateRulePack(packWithRegex('(a+)+$', true));
    } catch (err) {
      redosErr = err;
    }
    expect(redosErr).toBeInstanceOf(Error);
    expect(redosErr).not.toBeInstanceOf(SyntaxError);
    expect((redosErr as Error).message).toMatch(
      /^keywords\[0\]\.pattern is an unsafe regular expression \(.+\)$/i
    );

    // 4. serializeRulePack also rejects unsafe regexes
    expect(() => serializeRulePack(packWithRegex('(a+)+$', true))).toThrow(
      /unsafe regular expression/i
    );
  });

  it('Group 9: analyzes 500-char worst-case patterns in linear O(N) time (< 5ms each)', () => {
    // Collect 495 distinct 2-range BMP /i-foldable single literals (SD_495_2rng_fold_seq_500ch)
    const seenCanon = new Set<number>();
    const bmpFoldLits: string[] = [];
    for (let c = 0x80; c <= 0xffff && bmpFoldLits.length < 495; c++) {
      if (c >= 0xd800 && c <= 0xdfff) continue;
      const up = String.fromCharCode(c).toUpperCase();
      if (up.length === 1) {
        const uc = up.charCodeAt(0);
        if (uc !== c && uc >= 0x80 && !seenCanon.has(uc)) {
          seenCanon.add(uc);
          bmpFoldLits.push(String.fromCharCode(c));
        }
      }
    }

    const r10Lits8 = Array.from({ length: 8 }, (_, i) => String.fromCharCode(0x6000 + i));
    const makeInterleaved24 = (offset: number, numRanges: number, extra?: string) => {
      let s = '[';
      for (let i = 0; i < numRanges; i++) s += String.fromCharCode(0x4e00 + i * 32 + offset * 2);
      if (extra) s += extra;
      return s + ']';
    };
    const sdSafe24RngP15 =
      `(?:${r10Lits8.join('|')})(?:(?:${Array.from({ length: 8 }, (_, i) => makeInterleaved24(i + 8, 24)).join('|')})(?:${Array.from({ length: 8 }, (_, i) => makeInterleaved24(i, 24, r10Lits8[i]!)).join('|')})){15}`;
    const sdQuantInterlv24Nc =
      `(?:(?:${Array.from({ length: 8 }, (_, i) => makeInterleaved24(i, 24)).join('|')})(?:${Array.from({ length: 8 }, (_, i) => makeInterleaved24(i + 8, 24)).join('|')})){16}`;
    const mkStridedCls = (base: number, stride: number, count: number) =>
      '[' + Array.from({ length: count }, (_, i) => String.fromCharCode(base + i * stride)).join('') + ']';
    const bombSd1 =
      `(?:(?:${Array.from({ length: 8 }, (_, i) => mkStridedCls(0x5000 + i, 24, 8)).join('|')})(?:${Array.from({ length: 8 }, (_, i) => mkStridedCls(0x5008 + i, 24, 8)).join('|')})){2}(?:${Array.from({ length: 8 }, (_, i) => mkStridedCls(0x5010 + i, 24, 28)).join('|')}){27}`;
    const sdR10166x0020 = '[' + '\u0020-\u14e0'.repeat(166) + ']';
    const sdR10166xStagger =
      '[' +
      Array.from(
        { length: 166 },
        (_, i) => String.fromCharCode(0x00e0 + (i % 4)) + '-' + String.fromCharCode(0x14e0 - (i % 4))
      ).join('') +
      ']';
    const sdR1095xHugeSeqAb =
      Array.from(
        { length: 95 },
        (_, i) => `[${String.fromCharCode(0x00c0 + i * 3)}-${String.fromCharCode(0x1f00 + i * 3)}]`
      ).join('') + '(?:a|b)';
    const mkWide0200 = (count: number) =>
      Array.from(
        { length: count },
        (_, i) => `[${String.fromCharCode(0x0200 + i)}-${String.fromCharCode(0x1200 + i)}]`
      ).join('');
    // Round 11 Secondary Reviewer F2 self-DoS regressions (computeLeadingWork & computeSharedPrefixWork)
    const safeDot60x92 = '.{60}(?:.{60}|.{60}|.{60})z' + mkWide0200(92);
    const dot100x92 = '.{100}(?:.{100}|.{100}|.{100})z' + mkWide0200(92);
    const dot250x94 = '.{250}' + mkWide0200(94) + '(?:a|b)';
    const safeDot250Cjk250 =
      '.{250}' + Array.from({ length: 250 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('') + '(?:a|b)';
    // Round 11 Challenger 1 BUG-R11-3 self-DoS regressions (computeProductDagDp fan-out & prefix metrics)
    const sdR11K150M6T185Safe =
      `(?:${Array.from({ length: 150 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('|')})a?b?c?d?e?f?` +
      Array.from({ length: 185 }, (_, i) => String.fromCharCode(0x5000 + i)).join('');
    const sdR11K130M6T225Safe =
      `(?:${Array.from({ length: 130 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('|')})a?b?c?d?e?f?` +
      Array.from({ length: 225 }, (_, i) => String.fromCharCode(0x5000 + i)).join('');
    const sdR11K130M8T221Rej =
      `(?:${Array.from({ length: 130 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('|')})a?b?c?d?e?f?g?h?` +
      Array.from({ length: 221 }, (_, i) => String.fromCharCode(0x5000 + i)).join('');
    // Round 12 Challenger 1 BUG-R12-3 self-DoS regressions (compatSum O(preds^2) & computePrefixMetrics off-diag twins)
    const sdR12SupOptP8L31 =
      `(?:${['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((c) => `${c}{1,31}|${c}{1,31}`).join('|')})(?:x|y|z)?`;
    const sdR12SupOptP12L20 =
      `(?:${['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map((c) => `${c}{1,20}|${c}{1,20}`).join('|')})(?:x|y|z)?`;
    const sdR12SupP1L250 = '(?:a{1,250}|a{1,250})(?:x|y|z)';
    const sdR12Rng210G4E8 = (() => {
      const lits = Array.from({ length: 210 }, (_, i) => String.fromCharCode(0x4e00 + i));
      const step = Math.ceil(210 / 4);
      const grps = Array.from(
        { length: 4 },
        (_, g) => `[${String.fromCharCode(0x4e00 + g * step)}-${String.fromCharCode(0x4e00 + Math.min(209, (g + 1) * step - 1))}]`
      );
      const exs = Array.from({ length: 8 }, (_, i) => String.fromCharCode(0x6000 + i));
      return `(?:${lits.join('|')}|${grps.join('|')})(?:${exs.join('|')})`;
    })();

    // Round 13 Challenger 1 BUG-R13-4 self-DoS regressions (per-csId cached isComplexCharSet in analyzeCyclicSccs)
    const mkDense8Ranges = (width: number, shift = 0) =>
      [0x0080, 0x0290, 0x04a0, 0x1d00, 0x1f10, 0x2120, 0x2c00, 0xa640]
        .map((s) => `${String.fromCharCode(s + shift)}-${String.fromCharCode(s + shift + width)}`)
        .join('');
    const sdR13Dense8x511Mod =
      `(?-i:(?:${Array.from({ length: 28 }, (_, i) => `${String.fromCharCode(0x5000 + i * 2)}+`).join('|')})` +
      `(?:${Array.from({ length: 12 }, () => `[${mkDense8Ranges(511)}]`).join('|')}))`;
    const sdR13Dense8x512Mod =
      `(?-i:(?:${Array.from({ length: 28 }, (_, i) => `${String.fromCharCode(0x5000 + i * 2)}+`).join('|')})` +
      `(?:${Array.from({ length: 12 }, (_, i) => `[${mkDense8Ranges(512, i)}]`).join('|')}))`;

    const worstCasePatterns = [
      'a'.repeat(490),
      '('.repeat(20) + 'a' + ')'.repeat(20),
      `(${Array.from({ length: 100 }, (_, i) => `k${i}`).join('|')})`,
      `(${Array.from({ length: 100 }, (_, i) => `k${i}`).join('|')})+`,
      '[' + Array.from({ length: 80 }, (_, i) => String.fromCharCode(0x100 + i * 2)).join('') + ']+',
      '('.repeat(24) + '[a-z0-9_]+'.repeat(10) + ')'.repeat(24),
      'a{' + '1'.repeat(498),
      '{1,'.repeat(166),
      // 80 captures before 120-branch alternation (481 chars): verifies O(N) analysis with zero per-branch capture cloning
      '(a)'.repeat(80) + '(' + Array(120).fill('b').join('|') + ')',
      // Round 7 Secondary Reviewer F4 self-DoS regressions (63x63 & 88x45 distinct CJK branches)
      '(' + Array(63).fill('a').join('|') + ')(' + Array.from({ length: 63 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('|') + ')',
      '(' + Array(88).fill('a').join('|') + ')(' + Array.from({ length: 45 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('|') + ')',
      // Round 8 Challenger 2 R8-BUG-1 checkPairwiseIda self-DoS regressions
      'z0' + '(?:a{24})+x'.repeat(19),
      '(?:[a-b]{24})+c'.repeat(20),
      // Round 9 Secondary Reviewer F2 & Primary Reviewer #1 checkStartPumpable / coprime self-DoS regressions
      '[a-b]{308}' + '(?:a{23}b)+c'.repeat(8),
      'a{308}' + '(?:[a-b]{24})+c'.repeat(8),
      '[a-b]{280}z' + '(?:a{23}b)+z'.repeat(8),
      '(?:a{23}b)+a(?:a{22}b)+a(?:a{21}b)+a(?:a{20}b)+a(?:a{19}b)+a(?:a{18}b)+a(?:a{17}b)+a(?:a{16}b)+z',
      // Round 9 Challenger 1 BUG-R9-3 & Challenger 2 R9-BUG-2 computeMinterms sweep-line self-DoS regressions
      bmpFoldLits.join('') + '[a-b]',
      '.' + Array.from({ length: 499 }, (_, i) => String.fromCharCode(0x4e00 + i)).join(''),
      Array.from({ length: 249 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('|'),
      // Round 10 Secondary Reviewer F1, Challenger 1 BUG-R10-4, & Challenger 2 R10-BUG-1 self-DoS regressions
      sdSafe24RngP15,
      sdQuantInterlv24Nc,
      bombSd1,
      sdR10166x0020,
      sdR10166xStagger,
      sdR1095xHugeSeqAb,
      // Round 11 Secondary Reviewer F2 & Challenger 1 BUG-R11-3 self-DoS regressions
      safeDot60x92,
      dot100x92,
      dot250x94,
      safeDot250Cjk250,
      sdR11K150M6T185Safe,
      sdR11K130M6T225Safe,
      sdR11K130M8T221Rej,
      // Round 12 Challenger 1 BUG-R12-3 self-DoS regressions
      sdR12SupOptP8L31,
      sdR12SupOptP12L20,
      sdR12SupP1L250,
      sdR12Rng210G4E8,
      // Round 13 Challenger 1 BUG-R13-4 self-DoS regressions
      sdR13Dense8x511Mod,
      sdR13Dense8x512Mod,
    ];

    // Warm up JIT (all generic parser/analyzer hot paths, including >64-state chains, equiv skipping, off-diag twins, and high-fanout DAGs) and lazy BMP fold table before measuring
    const warmWide70 =
      Array.from({ length: 70 }, (_, i) => `[${String.fromCharCode(0x00c0 + i * 3)}-${String.fromCharCode(0x1f00 + i * 3)}]`).join('') + '(?:a|b)';
    const warmDag25 =
      `(?:${r10Lits8.slice(0, 5).join('|')})(?:(?:${Array.from({ length: 5 }, (_, i) => makeInterleaved24(i + 5, 8)).join('|')})(?:${Array.from({ length: 5 }, (_, i) => makeInterleaved24(i, 8, r10Lits8[i]!)).join('|')})){9}`;
    const warmUnknown34 = `[${Array.from({ length: 34 }, (_, i) => String.fromCharCode(0x4e00 + i * 2)).join('')}]`;
    const warmDotLead = `.{20}(?:.{20}|.{20})[\\u0100-\\u0200][\\u0100-\\u0200]${warmUnknown34}${warmUnknown34}z` + mkWide0200(24);
    const warmFanoutDag =
      `(?:${Array.from({ length: 32 }, (_, i) => String.fromCharCode(0x4f00 + i)).join('|')})a?b?c?` +
      Array.from({ length: 32 }, (_, i) => String.fromCharCode(0x5200 + i)).join('');
    const warmOffDiagTwin =
      '(?:a{1,17}|a{1,17}|b{1,17}|b{1,17}|c{1,17}|c{1,17})(?:x|y|z)?';
    const warmComplexExit =
      `(?-i:(?:${Array.from({ length: 4 }, (_, i) => `${String.fromCharCode(0x5000 + i * 2)}+`).join('|')})(?:[${mkDense8Ranges(128)}]|[${mkDense8Ranges(128, 1)}]))`;
    for (let w = 0; w < 60; w++) {
      checkRegexSafety('warmup\\s+(a|b){1,2}c{1[\\u0100-\\u0200]');
      checkRegexSafety('(a)'.repeat(20) + '(b|c)');
      checkRegexSafety('(' + Array(16).fill('a').join('|') + ')(' + Array.from({ length: 16 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('|') + ')');
      checkRegexSafety('z0' + '(?:a{8})+x'.repeat(4));
      checkRegexSafety(bmpFoldLits.slice(0, 80).join('') + '[a-b]');
      checkRegexSafety('.' + Array.from({ length: 80 }, (_, i) => String.fromCharCode(0x4e00 + i)).join(''));
      checkRegexSafety(Array.from({ length: 80 }, (_, i) => String.fromCharCode(0x4e00 + i)).join('|'));
      checkRegexSafety('[' + '\u0020-\u14e0'.repeat(16) + ']');
      checkRegexSafety(warmWide70);
      checkRegexSafety(warmDag25);
      checkRegexSafety(warmDotLead);
      checkRegexSafety(warmFanoutDag);
      checkRegexSafety(warmOffDiagTwin);
      checkRegexSafety(warmComplexExit);
    }

    type CpuUsageSample = { user: number; system: number };
    type NodeProcessLike = {
      threadCpuUsage?: (prev?: CpuUsageSample) => CpuUsageSample;
      cpuUsage?: (prev?: CpuUsageSample) => CpuUsageSample;
    };
    const nodeProcess = (globalThis as unknown as { process?: NodeProcessLike }).process;
    const readCpuUsage: ((prev?: CpuUsageSample) => CpuUsageSample) | undefined =
      typeof nodeProcess?.threadCpuUsage === 'function'
        ? (prev?: CpuUsageSample) => nodeProcess.threadCpuUsage!(prev)
        : typeof nodeProcess?.cpuUsage === 'function'
          ? (prev?: CpuUsageSample) => nodeProcess.cpuUsage!(prev)
          : undefined;
    expect(typeof readCpuUsage).toBe('function');

    for (const pattern of worstCasePatterns) {
      expect(pattern.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      const cpuSamples: number[] = [];
      const wallSamples: number[] = [];
      let res: ReturnType<typeof checkRegexSafety> = { safe: false };
      for (let run = 0; run < 5; run++) {
        const cpu0 = readCpuUsage!();
        const t0 = performance.now();
        res = checkRegexSafety(pattern);
        const wallMs = performance.now() - t0;
        const dCpu = readCpuUsage!(cpu0);
        cpuSamples.push((dCpu.user + dCpu.system) / 1000);
        wallSamples.push(wallMs);
      }
      cpuSamples.sort((a, b) => a - b);
      wallSamples.sort((a, b) => a - b);
      const medianCpuMs = cpuSamples[2]!;
      const medianWallMs = wallSamples[2]!;
      expect(typeof res.safe).toBe('boolean');
      expect(
        medianCpuMs,
        `Analyzer median CPU took ${medianCpuMs.toFixed(2)}ms on ${pattern.length}-char pattern`
      ).toBeLessThan(5);
      expect(
        medianWallMs,
        `Analyzer median wall took ${medianWallMs.toFixed(2)}ms on ${pattern.length}-char pattern`
      ).toBeLessThan(50);
    }
  });

  it('Group 10: closes all Round 2 soundness bypasses (wide non-ASCII /i folds, Annex B \\c, non-/u \\p, ES2025 (?s:...), nullable separators, grouped/unrolled chains, lookarounds, undelimited backrefs)', () => {
    // Fix 1: Wide non-ASCII ranges (> 64 code units) /i case folding (including multi-way sigma)
    const wideNonAsciiFoldCases = [
      '([\\u0400-\\u0450]|[\\u0451-\\u04ff])+$',
      '([\\u00b0-\\u00ff]|[\\u0100-\\u017f])+$',
      '([\\u03cf-\\u042f]|[\\u0430-\\u0490])+$',
      '([\\u0080-\\u00df]|[\\u00e0-\\u0121])+$',
      '([\\u036f-\\u03b0]|[\\u03b1-\\u03f2])+$',
      '([\\u03ee-\\u042f]|[\\u0430-\\u0471])+$',
      '([\\u0080-\\u00df]|[\\u00e0-\\u0125])+$',
      '[\\u03cf-\\u042f]+[\\u0430-\\u0490]+$',
      '([\\u0300-\\u03c2]|[\\u03c3-\\u03ff])+$',
    ];
    for (const pattern of wideNonAsciiFoldCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Fix 2: Exact ECMA-262 Annex B \c escape semantics inside and outside [...]
    const annexBControlCases = [
      '(\\c!|\\\\c!)+$',
      '([\\c!]|\\\\)+$',
      '[\\c!]+\\\\+$',
      '(\\\\c|1|\\c1)+$',
    ];
    for (const pattern of annexBControlCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Fix 3: Exact non-/u \p / \P IdentityEscape semantics
    const nonUnicodePropCases = [
      '(\\p{a}x|p\\{a\\}x)+$',
      '(\\p{' + 'a'.repeat(400) + '}){1000}',
    ];
    for (const pattern of nonUnicodePropCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Fix 4: ES2025 (?s:...) / (?-s:...) dotAll modifier tracking (direct checkRegexSafety for Chrome 125+ parity)
    const dotAllModifierCases = [
      '(?s:(.|\\n)+)$',
      '((?s:.)|\\n)+a$',
      '(?s:.+\\n+)',
      '(?s:.)+\\n+$',
      '(?is:(.|\\r)+)$',
      '(?s:(.+))\\n\\1$',
    ];
    for (const pattern of dotAllModifierCases) {
      const res = checkRegexSafety(pattern);
      expect(res.safe, `Expected ES2025 dotAll ReDoS ${JSON.stringify(pattern)} to be rejected`).toBe(
        false
      );
      expect(res.reason).toBeTruthy();
    }

    // Fix 5: Nullable-separator soundness (unanchored cubic, unbounded/multi-char sep, leading-unbounded cubic, chains)
    const nullableSeparatorCases = [
      'a+b?a+$',
      'a+b*a+$',
      'a+(?:b?a+)$',
      '(?:a+b?)a+$',
      '\\s*,?\\s*',
      '\\s*,?\\s*$',
      'xa+b*a+y',
      'xa+(?:bc)?a+y',
      'xa+b{0,2}a+y',
      'xa+a?a+y',
      'xa+b?a+b?a+y',
      'x+a+b?a+y',
      'x+ca+b?a+y',
      'a+b?'.repeat(8) + 'a+$',
      'a+b?'.repeat(11) + 'a+$',
      'a+b?'.repeat(16) + 'a+$',
      '\\w+\\.?'.repeat(7) + '$',
      '\\d+\\.?'.repeat(7) + '$',
      '\\s*,?'.repeat(18) + '\\s*$',
      '(?:x|a+b?)a+$',
      'a+(?:x|b?a+)$',
    ];
    for (const pattern of nullableSeparatorCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Fix 6: Grouped wildcards & overlapping-separator chains (cap <= 3)
    const groupedChainCases = [
      '.*a.*a.*a.*a$',
      '.*a.*a.*a.*a.*a.*a$',
      '(?:.*a)'.repeat(4) + '$',
      '(?:.*a)'.repeat(10) + 'b',
      '(?:.*a)'.repeat(16) + '$',
      '(?:.*a|x)'.repeat(4) + '$',
      '(?:.*a|x)'.repeat(10) + '$',
      '(?:[ab]+b)'.repeat(4) + '$',
      '(?:[ab]+b)'.repeat(16) + '$',
      '(\\w+a)'.repeat(4) + '$',
      '(?:\\w+a)'.repeat(8) + '!',
      '(a+b?)'.repeat(8) + '$',
    ];
    for (const pattern of groupedChainCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Fix 7: Unrolled exponential backtracking & bounded variable quantifier chains
    const unrolledAndBoundedCases = [
      'a?'.repeat(24) + 'a'.repeat(24),
      '(?:a|b)?'.repeat(25) + 'a'.repeat(25),
      'a{0,2}'.repeat(18) + 'a'.repeat(18) + '$',
      'a{1,2}'.repeat(18) + 'b',
      'a{1,2}'.repeat(24) + 'b',
      'a{0,500}a{0,500}a{0,500}a{0,500}$',
      'a{0,1000}a{0,1000}$',
      '[a-z]{0,50}'.repeat(10) + '$',
      'a{1,50}'.repeat(12) + '$',
      '(a|a)'.repeat(7) + '$',
      '(a|a)'.repeat(24) + '$',
      '(a|aa)'.repeat(24) + '$',
      '(a|a)x'.repeat(7),
      '(?:a?a)'.repeat(15) + '$',
      '(?:a?a|b)'.repeat(15) + '$',
      '(?:a|)'.repeat(10) + 'a'.repeat(10),
      'a{0,500}a+$',
      'a+a{0,500}$',
      '(a|a)'.repeat(6) + 'a?'.repeat(8) + 'a'.repeat(8),
    ];
    for (const pattern of unrolledAndBoundedCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Fix 8: Nested unbounded lookarounds & lookaround wildcard propagation
    const lookaroundCases = [
      '.*(?=.*(?=.*(?=.*(?=.*x))))',
      '.*(?=.*(?=.*(?=.*x)))',
      '\\w+(?=\\w+(?=\\w+(?=\\w+x)))',
      '(?=.*a)(?=.*b)(?=.*c)(?=.*d)',
      '(?=\\w+a)'.repeat(4),
    ];
    for (const pattern of lookaroundCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Fix 9: Unquantified backreference to unbounded/large-variable capture without disjoint delimiter
    const undelimitedBackrefCases = [
      '(a+)\\1$',
      '(.+)\\1$',
      '(?<g>a+)\\k<g>$',
      '([a-z]+)a?\\1$',
      '(a+)b?\\1$',
      '([a-z]+)a\\1$',
      '(?=(a+))\\1$',
      '(a{0,500})\\1$',
    ];
    for (const pattern of undelimitedBackrefCases) {
      expectUnsafeRegexRejected(pattern);
    }
  });

  it('Group 11: closes all Round 3 structural soundness bypasses (exact Canonicalize & (?-i:...), multiplicative alt fanout, multi-char & phase-shift overlap, cap=2 & Fix 5 hardening, nested quantified lookarounds, complete backreference soundness)', () => {
    // Fix R3-1A: Exact Canonicalize(ch) in addCodeUnitCI & narrow ranges (<= 64)
    const canonicalizeBypassCases = [
      '([^\\u1e9e]|\\u00df)+$',
      '([^\\u1f88]|\\u1f80)+$',
      '([^\\u1e90-\\u1ec0]|\\u00df)+$',
      '[^\\u1e9e]+\\u00df+$',
      '([^\\u1ffc]|\\u1ff3)+$',
    ];
    for (const pattern of canonicalizeBypassCases) {
      expectUnsafeRegexRejected(pattern);
    }
    // Multi-way Greek sigma fold: [^\u03c2] excludes all of Σ/σ/ς so disjoint from \u03c3
    expectSafeRegexAccepted('([^\\u03c2]|\\u03c3)+$');

    // Fix R3-1B: Scoped ES2025 (?-i:...) ignoreCase modifier (direct checkRegexSafety for Chrome 125+ parity)
    const ignoreCaseModifierUnsafeCases = [
      '(?-i:([^a]|A)+)x$',
      '(?-i:[^a]+A+)x$',
      '(?-i:([^a-z]|[A-Z])+)$',
      '(?-i:([^\\u0410-\\u042f]|[\\u0430-\\u044f])+)$',
    ];
    for (const pattern of ignoreCaseModifierUnsafeCases) {
      const res = checkRegexSafety(pattern);
      expect(
        res.safe,
        `Expected ES2025 (?-i:...) ReDoS ${JSON.stringify(pattern)} to be rejected`
      ).toBe(false);
      expect(res.reason).toBeTruthy();
    }
    expect(checkRegexSafety('(?-i:foo)')).toEqual({ safe: true });
    expect(checkRegexSafety('(?-i:(a|A)+)$')).toEqual({ safe: true });
    expect(checkRegexSafety('(?-i:([a-z]|[A-Z])+)$')).toEqual({ safe: true });

    // Fix R3-2: Multiplicative ambiguous alternation fanout (ambiguousAltProduct)
    const wideAltCases = [
      `(${Array(20).fill('a').join('|')})`.repeat(6) + '$',
      `(${Array(35).fill('a').join('|')})`.repeat(6) + '$',
      `(${[...Array(20).fill('a'), 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'].join('|')})`.repeat(6) + 'b',
      '(a|.|\\w|\\S|\\D|[^1]|[^2]|[^3]|[^4]|[^5]|[^6]|[^7]|[^8]|[^9]|[^b]|[^c])'.repeat(6) + 'b',
      '(?:a|[a-b]|[a-c]|[a-d]|[a-e]|[a-f]|[a-g]|[a-h]|[a-i]|[a-j]|[a-k]|[a-l])'.repeat(6) + 'z',
      '(a|.|\\w|\\S|\\D|[^1]|[^2]|[^3]|[^4]|[^5])'.repeat(6) + 'b',
      `(${Array(20).fill('a').join('|')})`.repeat(4) + 'a?'.repeat(8) + 'a'.repeat(8) + '$',
      `(${Array(35).fill('a').join('|')})`.repeat(4) + 'a?'.repeat(6) + 'b',
      `(${Array(20).fill('a').join('|')})`.repeat(3) + 'a?'.repeat(7) + 'a'.repeat(7),
    ];
    for (const pattern of wideAltCases) {
      expectUnsafeRegexRejected(pattern);
    }
    // Single top-level 100-branch alternation MUST remain accepted
    expectSafeRegexAccepted(
      `(${Array.from({ length: 100 }, (_, i) => `k${i}`).join('|')})`
    );

    // Fix R3-3: Multi-char repeating unit overlap & phase-shifted overlaps
    const multiCharAndPhaseShiftCases = [
      '(?:ab){1,2}'.repeat(24) + 'c',
      '(?:ab){0,2}ab'.repeat(16) + '$',
      '(?:ab){0,500}'.repeat(4) + '$',
      '(?:ab){0,1000}'.repeat(2) + '$',
      '(?:ab){1,50}'.repeat(12) + '$',
      '(?:ab)+(?:ab){0,500}$',
      '(?:ab){0,500}(?:ab)+$',
      '(?:ab)*ab'.repeat(16) + '$',
      '(?:ab)+ab'.repeat(10) + '$',
      '(?:.b)*ab'.repeat(16) + '$',
      '(?:ab)+?ab'.repeat(16) + '$',
      '(?:(?:ab)+ab)'.repeat(10) + '$',
      '(?:ab)?'.repeat(25) + 'ab'.repeat(25) + '$',
      '(?:ab|ac)?'.repeat(25) + 'ab'.repeat(25),
      '(?:ab)+a(?:ba)+$',
      '(?:ab)+a(?:ba)+b'.repeat(8) + '$',
      '(?:abc)+ab(?:cab)+$',
      '(?:abc)+a(?:bca)+$',
      '(?:ab)+ab(?:ab)+ab(?:ab)+$',
      '(?:abc){0,500}abc(?:abc){0,500}d',
      'x(?:ab)+c?(?:ab)+y'.repeat(16) + '$',
    ];
    for (const pattern of multiCharAndPhaseShiftCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Fix R3-4: Tightened cap = 2 & hardened Fix 5 single-pair nullable exemption
    const tightenedCapAndFix5Cases = [
      '[ab]+a[ab]+a[ab]+a$',
      '[ab]+a[ab]+a[ab]+c',
      'a+aa+aa+c',
      '[a-z]+a[a-z]+a[a-z]+$',
      '[a-z]+a[a-z]+a[a-z]+az',
      '.*a.*a.*a$',
      '.*a.*a.*az',
      '.*?a.*?a.*?a$',
      'z[zx]+ca+b?a+y',
      'xa+b?a+y'.repeat(3),
      'xa+b?a+ya+b?a+ya+b?a+yz',
      'z[zx]+ca+b?a+yca+b?a+yca+b?a+y',
      'b(?:ab)+c?(?:ab)+y',
    ];
    for (const pattern of tightenedCapAndFix5Cases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Fix R3-5: Nested quantified lookarounds (MAX_QUANTIFIED_LOOKAROUND_DEPTH = 1)
    const nestedQuantifiedLookaroundCases = [
      'a{0,500}(?=a{0,500}(?=a{0,500}(?=a{0,500}x)))',
      'a{0,500}(?=a{0,500}(?=a{0,500}(?=a{0,500}(?=a{0,500}x))))',
      '(?=.{0,100}(?=.{0,100}x))',
      '(?=.{0,100}(?=.{0,100}(?=.{0,100}(?=.{0,100}(?=.{0,100}x)))))',
      '(?=a{0,200}(?=a{0,200}(?=a{0,200}(?=a{0,200}x))))',
      'a+(?=a+(?=a+b))',
      '.*(?=.*(?=.*b))',
      '(?<=(?<=(?<=b)a+)a+)a+',
      'a+(?=a+b)',
    ];
    for (const pattern of nestedQuantifiedLookaroundCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Fix R3-6: Complete backreference soundness (internal body chars, RTL lookbehind, ES2025 duplicate named captures)
    const backrefSoundnessCases = [
      '((?:ab)+)ab(?:ab)+\\1$',
      '(.+b)a\\1$',
      '([ab]+b)a\\1$',
      '([a-z]+b)c([a-z]+b)c([a-z]+b)c\\1\\2\\3$',
      '(?<=c\\1(a+))',
      '(?<=x\\1(a+))b',
      '(?<=x\\1\\1(a+))b',
    ];
    for (const pattern of backrefSoundnessCases) {
      expectUnsafeRegexRejected(pattern);
    }
    // ES2025 duplicate named captures (direct checkRegexSafety for Chrome 125+ parity)
    const dupNamedBackrefUnsafeCases = [
      '((?<g>a+)x|(?<g>a+))\\k<g>$',
      '(?:(?<g>a+)b|(?<g>a+))\\k<g>$',
      '(?:(?<g>.+)\\n|(?<g>.+))\\k<g>$',
      '((?<a>a+)b|(?<a>a+))\\k<a>$',
    ];
    for (const pattern of dupNamedBackrefUnsafeCases) {
      const res = checkRegexSafety(pattern);
      expect(
        res.safe,
        `Expected ES2025 duplicate named backref ${JSON.stringify(pattern)} to be rejected`
      ).toBe(false);
      expect(res.reason).toBeTruthy();
    }
    // Under strict regular-language fail-closed policy (Round 7), ALL backreferences
    // including ES2025 duplicate named captures are rejected in rule packs.
    const dupNamedFixedRes = checkRegexSafety(
      '((?<g>[a-z]{3})x|(?<g>[a-z]{3})y)\\k<g>$'
    );
    expect(dupNamedFixedRes.safe).toBe(false);
    expect(dupNamedFixedRes.reason).toBeTruthy();
  });

  it('Group 12: enforces Round 4 fail-closed safe-subset hardening (R4-1..R4-5) closing every Round 3 Reviewer & Challenger bypass', () => {
    const distinct4 = '(?:a|[a-b]|[a-c]|[a-d])';
    const distinct12 =
      '(?:a|[a-b]|[a-c]|[a-d]|[a-e]|[a-f]|[a-g]|[a-h]|[a-i]|[a-j]|[a-k]|[a-l])';
    const distinct16 =
      '(a|.|\\w|\\S|\\D|[^1]|[^2]|[^3]|[^4]|[^5]|[^6]|[^7]|[^8]|[^9]|[^b]|[^c])';

    // Rule R4-1: Fail closed on non-fixed-length, optional, lookaround, forward, and nested backreferences
    // (Includes stricter fail-closed safe-subset policy for variable-length captures previously allowed with delimiters)
    const r4Rule1BackrefCases = [
      // Round 3 bypasses (Reviewer 2 Finding 3, Challenger 2 R3-ATK-7A / 7B)
      '(a)(\\1a{0,1000})\\2$',
      '(a)(\\1.{0,1000})\\2$',
      '(?<x>a)(?<y>\\k<x>a{0,1000})\\k<y>$',
      '(?<=c\\2(\\1a{0,500})(a))',
      '(?<=b(a+))a+\\1$',
      distinct4.repeat(6) + 'b(a+)c\\1$',
      // Optional captures / optional backreferences
      '(a)?\\1',
      '(a)?\\1(a)?\\2(a)?\\3(a)?\\4(a)?\\5(a)?\\6(a)?\\7(a)?\\8(a)?\\9(a)?\\10z',
      '(a)' + '\\1?'.repeat(10) + 'b',
      // Fail-closed safe-subset rejections moved from Group 7 (non-fixed or lookaround backrefs)
      '\\b(\\w+)\\s+\\1\\b',
      '(?<word>\\w+)\\s+\\k<word>',
      '(.+)\\n\\1$',
      '(?<=c\\1\\s+(a+))',
      '(?<=\\1([a-z]{3}))',
    ];
    for (const pattern of r4Rule1BackrefCases) {
      expectUnsafeRegexRejected(pattern);
    }
    // ES2025 duplicate named variable-length capture backref rejected under R4-1 fail-closed policy
    expect(
      checkRegexSafety('((?<g>a+)x|(?<g>a+)y)\\k<g>$').safe
    ).toBe(false);

    // Rule R4-2: Fail closed on unsafe/stacked/lookbehind/repeating-context/broad-wildcard lookarounds
    const r4Rule2LookaroundCases = [
      // Repeating-context lookarounds (Reviewer 1 Finding 2, Challenger 2 R3-BUG-1)
      '(?:(?!' + distinct12.repeat(3) + '$)a)+$',
      '(?:(?!' + distinct4.repeat(6) + 'b)a)+z',
      '(?:(?!' + '(?:a|a|a|a)'.repeat(6) + 'b)a)+z',
      '(?:(?!' + '(?:a|a|a|a)'.repeat(6) + 'b)a){200}z',
      '(?:(?=(a|a))a)+$',
      // Quantified / ambiguous lookbehinds (Challenger 1 oracle hit, Challenger 2 R3-EXTRA-9)
      '\\w*(?:ab|cd){1,16}[a-c]*(?<!\\w{0,2}b)!',
      'a+a(?<=a+)a+a(?<=a+)z',
      'a+(?:(?<=a+b)c|x)',
      // Quantified lookaheads (Reviewer 1 Finding 1, Reviewer 2 Finding 2, Challenger 1 BUG-R3-4, Challenger 2 R3-BUG-3)
      'a+(?=' + 'a?'.repeat(10) + 'a'.repeat(10) + 'b)',
      '.*a.*(?=' + 'a?'.repeat(10) + 'a'.repeat(10) + 'b)',
      'a+aa+(?=a{0,9}a{0,9}a{0,9}b)',
      'a+(?=a{0,9}a{0,9}a{0,9}b)',
      'a+aa+(?=a{0,15}a{0,15}b)',
      'a+aa+(?=' + '(?:a|a|a|a)'.repeat(6) + 'b)',
      'a+aa+(?:(?=a+b)c|x)',
      'a+aa+(?:(?=a+b)|x)',
      'a+aa+a(?=a+b)',
      'a{0,500}(?:(?=a{0,500}b)c|x)',
      'a+(?:(?=a+b)|x)',
      'a+(?:(?=a+b)c|x)',
      'a+a(?=a+b)a+a(?=a+b)c',
      'a+(?:(?=a+b)|x)aa+(?:(?=a+b)|x)c',
      'a{0,1000}(?:(?=a+b)|x)aa+(?:(?=a+b)|x)c',
      '(a+)a{1,16}(?=a+b)a{1,16}(?:ba)+c',
      'a+a(?!a+b)a+a(?!a+b)z',
      '[ab]+a(?![ab]+c)[ab]+a(?![ab]+c)z',
      'a+a' + '(?!a+b)'.repeat(20) + 'a+az',
      'a{0,500}a(?!a{0,500}b)z',
      'a+a(?!' + distinct4.repeat(6) + 'b)z',
      // Fail-closed safe-subset rejection moved from Group 7 (broad-wildcard lookahead)
      '(?=.*a)(?=.*b)',
    ];
    for (const pattern of r4Rule2LookaroundCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Rule R4-3: Unified polynomial x finite-branching complexity budget & large-var promotion
    const r4Rule3ComplexityCases = [
      // Reviewer 1 Finding 1 & Reviewer 2 Finding 1
      '.*a.*' + 'a?'.repeat(10) + 'a'.repeat(10) + 'b',
      '.*a.*' + 'a?'.repeat(10) + 'a'.repeat(10) + '$',
      '.*a.*' + distinct12.repeat(3) + '$',
      '.*a.*' + ('(' + Array(60).fill('a').join('|') + ')').repeat(2) + 'b',
      '.*a.*(' + Array(200).fill('a').join('|') + ')b',
      '.*a.*(' + Array(240).fill('a').join('|') + ')$',
      '.*a.*' + '(?:a|a|a|a)'.repeat(6) + '$',
      'a+aa+' + '(?:a|a|a|a)'.repeat(6) + '$',
      'a+' + 'a?'.repeat(10) + 'a'.repeat(10) + '$',
      'a+' + '(?:a|a|a|a)'.repeat(6) + '$',
      'a+' + distinct12.repeat(3) + '$',
      '(?:a|a|a|a)'.repeat(6) + 'ca+b?a+y',
      // Challenger 1 BUG-R3-2 & BUG-R3-3
      '.*a.*' + '(a|.|\\w|\\S)'.repeat(6) + 'b',
      'a+aa+' + distinct16.repeat(3) + 'b',
      'a+' + distinct16.repeat(3) + 'b',
      'a+aa+' + '(a|aa|aaa|aaaa)'.repeat(6) + 'b',
      'a+aa+(' + Array.from({ length: 28 }, (_, i) => 'a'.repeat(i + 1)).join('|') + ')b',
      'a+?aa+?' + '(a|a|a|a)'.repeat(6) + 'b',
      'a+aa+aa{0,1000}b',
      'a{0,1000}aa+aa+b',
      '.*a.*a.{0,1000}b',
      '(?:ab)+ab(?:ab)+ab(?:ab){0,1000}$',
      'a+aa+aa{0,31}a{0,31}b',
      'a+aa+a' + 'a?'.repeat(10) + 'b',
      'a+a' + '(a|a)'.repeat(6) + 'a?'.repeat(6) + 'b',
      // Challenger 2 R3-BUG-2 & R3-EXTRA-1/2/3/7/10 & R3-ATK-6A
      distinct4.repeat(6) + '.*a.*z',
      '(?:' + Array(200).fill('a').join('|') + ').*a.*z',
      distinct4.repeat(6) + '[a-z]+a[a-z]+z',
      'a?'.repeat(10) + 'a'.repeat(10) + '.*a.*z',
      'a{1,2}'.repeat(10) + '.*a.*z',
      '(?:a|[a-b])(?:a|[a-b])' + 'a{1,2}'.repeat(10) + '.*a.*z',
      '(?:a|[a-b])(?:a|[a-b])a{0,31}a{0,31}b.*a.*z',
      distinct4.repeat(6) + '.*z',
      distinct4.repeat(6) + 'a+az',
      distinct4.repeat(6) + 'a+b',
      distinct4.repeat(6) + 'xa+b?a+y$',
      '(?:(?:a|a)?)?'.repeat(6) + 'b',
      // Tightened polyDegree=2 / polyDegree=1 edge cases caught by oracle fuzzing
      '.*a.*(?:a|a)(?:a|a)z',
      '.*a.*a?a?aaz',
      '.*a{1,3}a.*z',
      'a+a(?:a|[a-b])(?:a|[a-b])(?:a|[a-b])(?:a|[a-b])z',
      'a+aa{0,15}z',
    ];
    for (const pattern of r4Rule3ComplexityCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Rule R4-4: Overlapping small/medium variable quantifier bridges between unbounded quantifiers
    const r4Rule4VarBridgeCases = [
      'a+a{1,8}a+!',
      '.*a{1,8}.*z',
      'a*a{1,16}a+z',
      '[ab]+a{1,16}a{1,16}a+$',
      '\\w+[ab]{1,16}(?:ba)+z',
      'a+' + 'a{1,2}'.repeat(10) + 'a+!',
    ];
    for (const pattern of r4Rule4VarBridgeCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // Rule R4-5: General overlapping bridge detector (multi-char phase shifts, full-period wraps, single-char bridges)
    const r4Rule5OverlapBridgeCases = [
      'a+aa+$',
      'a+a{5}a+$',
      '(?:ab)+ab(?:ab)+$',
      '(?:abc)+abc(?:abc)+$',
      '(?:aab)+a{2}(?:baa)+$',
      '(?:aab)+a{2}(?:baa){0,500}$',
      '(?:ab)+a{1,2}(?:ba)+$',
      '(?:ab)+(?:a|ax)(?:ba)+$',
      '(?:ab)+(?:aa|a)(?:ba)+$',
      '(?:abc)+a{1,500}(?:bca)+$',
      '(?:ab)+aba(?:ba)+$',
      '(?:ab|caa)+a(?:ba|aac)+$',
      '(?:ab|xxa)+a(?:ba)+$',
      '(?:abc|defg)+ab(?:cab)+$',
    ];
    for (const pattern of r4Rule5OverlapBridgeCases) {
      expectUnsafeRegexRejected(pattern);
    }
  });

  it('Group 13: closes all Round 4 Reviewer & Challenger bypasses (R5-1 fixed repeat/lookaround/backref coupling, R5-2 shared-prefix alts, R5-3 additive alt budgets, R5-4 isSingleCharBroad & alt-wrapped bridges, R5-5 per-pack regex cost budget)', () => {
    const distinct4 = '(?:a|[a-b]|[a-c]|[a-d])';

    // R5-1: Fixed repeating quantifiers ({K}) inside lookarounds, stacked lookarounds, & fixed-repeat/backref/literal coupling
    const r5FixedAndLookaroundCases = [
      // Primary Reviewer F1 & Challenger 2 R4-BUG-1
      '(?:' + '(?!a{140}b)'.repeat(40) + 'a)+$',
      '(?:' + '(?!.{140}b)'.repeat(40) + 'a)+$',
      '(?:' + '(?!(?:a|b){100}c)'.repeat(20) + 'a)+$',
      '(?:' + '(?!a{70}b)'.repeat(40) + 'a)+$',
      '(?:(?!a{140}b)a)+$',
      '(?:(?!a{500}b)a)+$',
      '.*a' + '(?!a{140}b)'.repeat(40) + '.*z',
      '.*a(?!a{140}b).*z',
      '(?<=a{50})b',
      '(?:' + '(?!a{100}b)'.repeat(40) + 'a)+a$',
      '(?:' + '(?!(?:a{50}){3}b)'.repeat(20) + 'a)+a$',
      '.*a.*' + '(?!a{100}b)'.repeat(20) + 'a$',
      '.*a.*(?!a{100}b)a$',
      '.*a.*' + '(?<!a{100}b)'.repeat(20) + 'a$',
      'a+aa{1,8}' + '(?!a{100}b)'.repeat(20) + 'a$',
      'a+a(?:a|[a-b])(?:a|[a-b])(?:a|[a-b])' + '(?!a{100}b)'.repeat(20) + 'a$',
      'a+a' + '(?!a{100}b)'.repeat(40) + 'a$',
      '.*a.*' + `(?!${'a'.repeat(100)}b)`.repeat(4) + 'a$',
      // Secondary Reviewer F1 (all 18) & Challenger 1 BUG-R4-2 & Challenger 2 R4-BUG-2
      '.*a.*(?=(?:a{10}){15}b)',
      '.*a.*(?=a{150}b)',
      '.*a.*(?=a{140}b)',
      '.*a.*(?=a{10}z)',
      '.*a.*(?=.{100}b)',
      '.*a.*(?<=a{100})b',
      '.*a.*(?<=[a-b]{140}c)',
      '.*a.*(?:(?:a{5}){5}){4}b',
      '.*a.*(?:a{10}){10}b',
      '.*a.*(?:[a-b]{10}){10}a$',
      '.*a.*(?:[a-b]{20}){10}c',
      '.*a.*a{100}$',
      '.*a.*a{100}a$',
      '.*a.*a{140}b',
      '.*a.*a{50}b',
      '.*a.*a{20}b',
      '.*a.*a{10}b',
      '.*a.*.{100}b',
      '.*a.*.{10}b',
      '.*a.*\\w{10}z',
      '.*a.*a{5}b',
      '.*a.*a{5}z',
      '.*a.*[a-z]{70}a$',
      '.*a.*[a-z]{70}[a-z]{70}a$',
      '.*a.*(a{100})\\1$',
      '.*a.*(a{50})\\1\\1$',
      '.*a.*(a{10})' + '\\1'.repeat(15) + '$',
      '.*(a{100}).*\\1$',
      '.*a.*([a-b]{20})\\1z',
      '.*a.*' + 'a'.repeat(50) + '$',
      '.*a.*' + 'a'.repeat(23) + '$',
      'a?'.repeat(10) + 'a'.repeat(10) + '(?=a{200}b)',
      'a?'.repeat(10) + 'a'.repeat(10) + 'a{50}b',
      'a?'.repeat(10) + 'a'.repeat(10) + '(a{100})\\1$',
      distinct4.repeat(5) + '(a{100})\\1$',
      distinct4.repeat(5) + 'a{100}b',
      'a+(?=a{1000}b)',
      'a+(?=a{500}b)',
      'a+(?=\\w{140}c)',
      'a+(?<=a{500})b',
      'a+a{500}b',
      'a+aa{500}b',
      'a+aa{16}b',
      'a+aa?a?a?a{150}b',
      'a+a(?:a|[a-b])(?:a|[a-b])(?:a|[a-b])[a-z]{70}a$',
      'a+a(?:a|[a-b])(?:a|[a-b])(?:a|[a-b])(a{70})\\1$',
      'a+a(a{100})\\1$',
      '(?:(?=' + 'a{1000}'.repeat(20) + 'b)a)+',
      '(?:(?<=' + 'a{1000}'.repeat(20) + ')a)+',
      '(?:(?![a-b]{140}c)a)+$',
      '(?:' + '(?![a-b]{140}c)'.repeat(20) + 'a)+$',
      'a+aa?a?a?' + `(?!${'a'.repeat(31)}b)`.repeat(2) + 'a$',
    ];
    for (const pattern of r5FixedAndLookaroundCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // R5-2: Shared-prefix & wide multi-branch alternations coupled with backtracking / repeating lookarounds
    const r5SharedPrefixAltCases = [
      '.*a.*(?:' + Array.from({ length: 25 }, (_, i) => `a{15}${i.toString(36)}`).join('|') + ')',
      'a+(?:' + Array.from({ length: 32 }, (_, i) => `a{15}${i.toString(36)}`).join('|') + ')',
      '(?:(?!(?:' + Array.from({ length: 20 }, (_, i) => `[a-b]{15}${i.toString(36)}`).join('|') + '))a)+$',
      '.*a.*(?:' + Array.from({ length: 24 }, (_, i) => `${'a'.repeat(15)}${i.toString(36)}`).join('|') + ')',
      '.*a.*(?!' + Array.from({ length: 25 }, (_, i) => `a{15}${String.fromCharCode(98 + i)}`).join('|') + ')a$',
      '.*a.*(?:' + Array.from({ length: 25 }, (_, i) => `${String.fromCharCode(98 + i)}z`).join('|') + ')$',
      '.*a.*(?:' + Array.from({ length: 32 }, (_, i) => `${i.toString(36)}z`).join('|') + ')',
      'a+a(?:[a-b]{15}0|[a-b]{15}1)z',
    ];
    for (const pattern of r5SharedPrefixAltCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // R5-3: Additive multi-branch polynomial / high-var / quantified-lookaround budgets in case 'alt' (flat & nested)
    let nested5DotStar = '.*a.*z';
    for (let d = 0; d < 5; d++) {
      nested5DotStar = `(?:${nested5DotStar}|${nested5DotStar})`;
    }
    const r5MultiBranchAltCases = [
      Array(70).fill('.*a.*z').join('|'),
      Array(70).fill('.*a.*b').join('|'),
      '(' + Array(70).fill('.*a.*b').join('|') + ')',
      '(' + Array(8).fill('(' + Array(8).fill('.*a.*b').join('|') + ')').join('|') + ')',
      Array(10).fill('(?:' + Array(4).fill('.*a.*z').join('|') + ')').join('|'),
      nested5DotStar,
      Array.from({ length: 70 }, (_, i) => `.*a.*${'bcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i % 61]}`).join('|'),
      Array(70).fill('.*aa+z').join('|'),
      Array(70).fill('.*a.*$').join('|'),
      Array(50).fill('a.*a.*b').join('|'),
      Array(33).fill('.*a.*b').join('|'),
      Array(41).fill('.*a{140}.*z').join('|'),
      '(?:.*a.*z)?|(?:.*a.*z)?',
      Array(45).fill('a+aa{1,8}z').join('|'),
      Array.from({ length: 45 }, (_, i) => `a+aa{0,7}${'bcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ'[i]}`).join('|'),
      Array(30).fill('a+aa?a?a?b').join('|'),
      Array(55).fill('xa+b?a+z').join('|'),
      Array.from({ length: 15 }, (_, i) => `a+a(?:[a-b]{15}0|[a-b]{15}1)${String.fromCharCode(98 + i)}`).join('|'),
      Array(15).fill('a?'.repeat(10) + 'a'.repeat(10) + 'b').join('|'),
      Array.from({ length: 15 }, (_, i) => 'a?'.repeat(10) + 'a'.repeat(10) + String.fromCharCode(98 + i)).join('|'),
      Array(45).fill('a{0,500}az').join('|'),
      Array(40).fill('(?=[a-z]+!)').join('|'),
      Array(50).fill('(?=a+b)c').join('|'),
      Array(50).fill('(?=a+b)z').join('|'),
    ];
    for (const pattern of r5MultiBranchAltCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // R5-4: isSingleCharBroad multi-char repeating units & compositional alt/optional-wrapped R4-5 bridges
    const r5BridgeCases = [
      '(?:.a)+a(?:.a)+z',
      '(?:.a)+a{2}(?:a.)+z',
      '(?:[^z]a)+a{2}(?:a[^z])+z',
      '(?:[^z]a)+a{5}(?:[^z]a)+$',
      '(?:\\Sa)+a{5}(?:\\Sa)+$',
      '(?:.a)+a{5}(?:.a)+$',
      '(?:.bc)+abc(?:.bc)+$',
      '(?:.b)+ab(?:.b)+$',
      '(?:.b)+a(?:b.)+$',
      '(?:[^1]b)+a(?:b[^1])+$',
      '(?:a+a|x)a+$',
      'a+(?:aa+|x)$',
      '(?:a+a|x)(?:aa+|y)$',
      '(?:(?:ab)+a|x)(?:ba)+$',
      '(?:ab)+(?:a(?:ba)+|x)$',
      '(?:a+a{5}|x)a+$',
      '(?:(?:ab)+ab|x)(?:ab)+$',
      '(?:(?:abc)+ab|x)(?:cab)+$',
      '(?:(?:aab)+a{2}|x)(?:baa)+$',
      '(?:a+a|x)a+a{100}b',
      'a+a(?:b+)?a+$',
      '(?:(?:a+a|x)a|y)a+$',
      'a+(?:a(?:aa+|y)|x)$',
      '(?:a+a)?a+$',
      'a+(?:aa+)?$',
      '(?:(?:.b)+a|x)(?:b.)+$',
      '(?:.b)+(?:a(?:b.)+|x)$',
    ];
    for (const pattern of r5BridgeCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // R5-5: Per-pack cumulative regex complexity budget rejects pack amplification with plain Error (never SyntaxError)
    const packAmplificationCases: Array<{ name: string; patterns: string[] }> = [
      { name: '200x .*a.*z_i', patterns: Array.from({ length: 200 }, (_, i) => `.*a.*z${i}`) },
      { name: '48x .*a.*z_i', patterns: Array.from({ length: 48 }, (_, i) => `.*a.*z${i}`) },
      { name: '48x .*(?<g>a).*z_i', patterns: Array.from({ length: 48 }, (_, i) => `.*(?<g>a).*z${i}`) },
      { name: '4x .*a.*z_i', patterns: Array.from({ length: 4 }, (_, i) => `.*a.*z${i}`) },
      { name: '200x a?^10 a^10 z_i', patterns: Array.from({ length: 200 }, (_, i) => 'a?'.repeat(10) + 'a'.repeat(10) + `z${i}`) },
      { name: '200x 4-way^5 z_i', patterns: Array.from({ length: 200 }, (_, i) => distinct4.repeat(5) + `z${i}`) },
      { name: '31x a+aa{1,8}z_i', patterns: Array.from({ length: 31 }, (_, i) => `a+aa{1,8}z${i}`) },
    ];
    for (const { name, patterns } of packAmplificationCases) {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, idx) => ({
          id: `amp-${idx}`,
          pattern,
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected pack amplification "${name}" to be rejected`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      // Under Round 7 NFA product-automaton analysis, these patterns are caught immediately
      // at single-rule level (cubic IDA >= 3, DAG path mult > 64, or cycle overlap work > 8).
      expect((caught as Error).message).toMatch(
        /unsafe regular expression|aggregate regular expression complexity budget/i
      );
      expect(() => serializeRulePack(pack)).toThrow(
        /unsafe regular expression|aggregate regular expression complexity budget/i
      );
    }

    // Positive guarantees: 200 standard linear regexes, all 45 DEFAULT_CLOUD_KEYWORDS combined, & safe patterns remain accepted
    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `lin-${i}`,
        pattern: `\\bspam_offer_${i}\\s+promo\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(linear200Pack)).keywords).toHaveLength(200);

    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);

    const preservedSafePatterns = [
      'foo.*bar',
      'foo.*bar(?:s)?',
      'foo.{0,20}bar',
      '.*https?://[\\w.-]+',
      '(?:(?!foo|bar).)+',
      '撸毛(?!孩子|猫|狗)',
      '(?!\\s+up\\b)',
      '(?<=foo)bar',
      '(?:http://|https://)+',
      '(foo|bar|baz)+',
      '(\\d{3}-){2}\\d{4}',
      '(?:[0-9a-f]{2}:){5}[0-9a-f]{2}',
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      'https?://[\\w.-]+(?:/[\\w./?%&=-]*)?',
      'a+ba+$',
      '(?:ab)+xyz(?:ab)+$',
      `(${Array.from({ length: 100 }, (_, i) => `k${i}`).join('|')})`,
    ];
    for (const pattern of preservedSafePatterns) {
      expectSafeRegexAccepted(pattern);
    }
  });

  it('Group 14: closes all Round 5 Reviewer & Challenger bypasses (R6-1 overlapBridgePending merge/alt, R6-2 near-fixed & MAX_FIXED_EXPANSION=256, R6-3 sharedPrefix >=16 & unrolled literal runs, R6-4 alt lookaround sum & post-unbounded lookarounds, R6-5 heavy alt/backref branch work, R6-6 uncapped poly1 & broad wildcard pack cost)', () => {
    // R6-1: overlapBridgePending nullable-unbounded merge & independent trailing/leading overlap bridges
    const r6BridgeCases = [
      'a+b*aa+$',
      'a+x*aa+$',
      'a+(?:b+)?aa+$',
      'a+b{0,500}aa+$',
      'a+x{0,20}aa+$',
      'a+x*y*aa+$',
      'a+(?:b|c)*aa+$',
      '(?:ab)+c*a(?:ba)+$',
      '(?:ab)+x*a(?:ba)+$',
      '(?:ab)+c*ab(?:ab)+$',
      '(?:.b)+c*a(?:b.)+$',
      '(?:.b)+x*a(?:b.)+$',
      '(?:a+b*a|x)a+$',
      '(?:a+a|b+)a+$',
      '(?:a+a|x+)a+$',
      '(?:a+a|.*)a+$',
      '(?:a+a|b+)a+b',
      '(?:a+aaaaaaaaaa|b+)a+$',
      '(?:(?:ab)+ab|c+)(?:ab)+$',
      '(?:(?:ab)+a|x+)(?:ba)+$',
      'a+(?:a|b+)a+$',
      'a+(?:b+b|x)?aa+$',
      'a+(?:b*aa+|x)$',
      'a+(?:a(?:c+|aa+)|x)$',
      'a+(?:(?:b+|a)a+|x)$',
    ];
    for (const pattern of r6BridgeCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // R6-2: Near-fixed variable quantifiers (min >= 2), unbounded high-min quantifiers, & MAX_FIXED_EXPANSION = 256
    const r6NearFixedAndExpansionCases = [
      '(?:[a-b]{50}){100}[cd]',
      '(?:a{50}){100}b',
      '(?:[a-b]{50}){100,}[cd]',
      'a+a(?:a|[a-b])(?:a|[a-b])[a-b]{500,501}a$',
      'a{0,500}a[a-b]{500,501}z',
      'a+a[a-b]{500,501}z',
      'a?'.repeat(9) + 'a'.repeat(9) + '[a-b]{140,141}a$',
      'a+a[a-b]{140,141}z',
      'a+aa{140,141}z',
      Array(4).fill('a+a[a-b]{70,71}[a-b]{70,71}[a-b]{70,71}a$').join('|'),
      'a{0,7}[a-b]{140,141}z0',
      'a{0,7}[a-b]{64,65}z_0',
      'a{0,7}[a-b]{140,}z',
    ];
    for (const pattern of r6NearFixedAndExpansionCases) {
      expectUnsafeRegexRejected(pattern);
    }
    // ES2025 modifier near-fixed variants (checked directly via checkRegexSafety for Chrome 125+ parity)
    for (const es25Pattern of [
      '(?-i:a+a[a-b]{140,147}a$)',
      '(?s:a+a.{140,147}a$)',
      '(?-i:a+x*aa+$)',
    ]) {
      const res = checkRegexSafety(es25Pattern);
      expect(res.safe, `Expected ES2025 ${JSON.stringify(es25Pattern)} to be unsafe`).toBe(false);
      expect(res.reason).toBeTruthy();
    }

    // R6-3: sharedPrefixWork monotonicity for >= 16-char prefixes & unrolled overlapping literal runs
    const r6SharedPrefixAndUnrollCases = [
      'a+(?:' + Array.from({ length: 8 }, (_, i) => 'a'.repeat(58) + i).join('|') + ')',
      'a+' + 'a'.repeat(300) + 'a{1,8}b',
      'a+' + 'a'.repeat(480) + 'b',
      'a?'.repeat(9) + 'a'.repeat(109) + 'z',
      Array(6).fill('a{0,15}' + 'a'.repeat(64) + 'c').join('|'),
    ];
    for (const pattern of r6SharedPrefixAndUnrollCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // R6-4: Additive lookaround count/work in alt & bounded lookarounds after unbounded quantifiers
    const r6LookaroundCases = [
      'a+(?:' + Array(28).fill('(?=' + 'a'.repeat(11) + 'b)').join('|') + ')',
      'a+(?:' + Array(13).fill('(?=' + 'a'.repeat(31) + 'b)').join('|') + ')',
      'a+(?=' + 'a'.repeat(31) + 'b)',
      'a+(?<=' + 'a'.repeat(31) + 'b)',
      '(?:' + Array.from({ length: 22 }, (_, i) => `(?!aaaaaaaaaaaaaaa!)${i.toString(36)}`).join('|') + ')+$',
      'a+a(?:a|[a-b])(?:a|[a-b])(?:a|[a-b])(?:' +
        Array.from({ length: 22 }, (_, i) => `(?!a!)${i.toString(36)}`).join('|') +
        ')$',
    ];
    for (const pattern of r6LookaroundCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // R6-5 & R6-6 (single-rule): Heavy branch work (var*fixed, fixed, largeVar, backref alts) & poly1 cap = 16
    const r6HeavyAltAndPoly1Cases = [
      Array.from({ length: 26 }, (_, i) => `a{0,15}[a-b]{64}${String.fromCharCode(97 + i)}`).join('|'),
      Array(21).fill('a{0,7}[a-b]{140,141}a$').join('|'),
      Array.from({ length: 20 }, (_, i) => `a?a?a?(a{32})\\${i + 1}a$`).join('|'),
      Array(38).fill('[a-b]{140}a$').join('|'),
      Array(38).fill('[a-b]{140}').join('|'),
      Array(35).fill('[a-b]{1,140}z').join('|'),
      Array.from({ length: 20 }, (_, i) => `a{0,15}(?:[a-b]{8}){8}${String.fromCharCode(97 + i)}`).join('|'),
      Array(18).fill('a?a?a?a?[a-b]{64}c').join('|'),
      Array(16).fill('a?a?a?a?(?:[a-b]{16}){4}a$').join('|'),
      Array(20).fill('[a-b]{0,15}[a-b]{64}c').join('|'),
      'a+aa{1,8}a$',
      Array(4).fill('a+aa{1,8}a$').join('|'),
      Array(4).fill('a+aa{1,8}z').join('|'),
      Array(32).fill('a+a$').join('|'),
      Array(50).fill('a+z').join('|'),
      Array(100).fill('a+$').join('|'),
      Array(60).fill('[a-z]+$').join('|'),
      Array.from({ length: 16 }, (_, j) => `a?a?a?a?${'a'.repeat(15)}${j.toString(36)}`).join('|'),
    ];
    for (const pattern of r6HeavyAltAndPoly1Cases) {
      expectUnsafeRegexRejected(pattern);
    }

    // R6-4 / R6-5 / R6-6: Pack amplification rejections (plain Error, never SyntaxError)
    // Pure pack-budget rejections (individually safe under NFA rules, rejected by aggregate 250 budget):
    const r6PurePackBudgetCases: Array<{ name: string; patterns: string[] }> = [
      { name: '125x a+a$', patterns: Array.from({ length: 125 }, () => 'a+a$') },
      { name: '125x .*xyz_i', patterns: Array.from({ length: 125 }, (_, i) => `.*xyz_${i}`) },
      { name: '200x a+(?=aab)', patterns: Array.from({ length: 200 }, () => 'a+(?=aab)') },
      { name: '200x [a-b]+z_i', patterns: Array.from({ length: 200 }, (_, i) => `[a-b]+z_${i}`) },
      { name: '200x [a-b]{140}z_i', patterns: Array.from({ length: 200 }, (_, i) => `[a-b]{140}z_${i}`) },
    ];
    for (const { name, patterns } of r6PurePackBudgetCases) {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, idx) => ({
          id: `r6-amp-${idx}`,
          pattern,
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected R6 pack budget rejection "${name}"`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((caught as Error).message).toMatch(/aggregate regular expression complexity budget/i);
      expect(() => serializeRulePack(pack)).toThrow(/aggregate regular expression complexity budget/i);
    }

    // Strengthened single-rule rejections under Round 7/8 Glushkov NFA engine (caught on rule 0 itself):
    const r6StrengthenedSingleCases: Array<{ name: string; patterns: string[] }> = [
      { name: '200x [a-b]{1,140}z_i', patterns: Array.from({ length: 200 }, (_, i) => `[a-b]{1,140}z_${i}`) },
      { name: '200x a{0,7}[a-b]{64}z_i', patterns: Array.from({ length: 200 }, (_, i) => `a{0,7}[a-b]{64}z_${i}`) },
      { name: '200x a?a?a?(a{32})\\1z_i', patterns: Array.from({ length: 200 }, (_, i) => `a?a?a?(a{32})\\1z_${i}`) },
      {
        name: '200x 40br [a-b]{16}z',
        patterns: Array.from({ length: 200 }, (_, i) => `(?<g>z${i})|` + Array(40).fill('[a-b]{16}z').join('|')),
      },
      {
        name: '200x 20br a?^4 a$',
        patterns: Array.from({ length: 200 }, (_, i) => `(?<g>z${i})|` + Array(20).fill('a?a?a?a?a$').join('|')),
      },
      {
        name: '200x 20br ([a-b]{16})\\j z',
        patterns: Array.from({ length: 200 }, (_, i) => `(?<g>z${i})|` + Array.from({ length: 20 }, (_, j) => `([a-b]{16})\\${j + 2}z`).join('|')),
      },
      {
        name: '200x 15br (?=a^11 b)',
        patterns: Array.from({ length: 200 }, () => Array(15).fill('(?=' + 'a'.repeat(11) + 'b)').join('|')),
      },
      { name: '2x (16x a+a$)', patterns: Array.from({ length: 2 }, () => Array(16).fill('a+a$').join('|')) },
      { name: '2x (2x a+aa{1,8}z)', patterns: Array.from({ length: 2 }, () => Array(2).fill('a+aa{1,8}z').join('|')) },
    ];
    for (const { name, patterns } of r6StrengthenedSingleCases) {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, idx) => ({
          id: `r6-single-${idx}`,
          pattern,
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected strengthened single-rule rejection for "${name}"`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((caught as Error).message).toMatch(/unsafe regular expression/i);
      expect(() => serializeRulePack(pack)).toThrow(/unsafe regular expression/i);
    }

    // Positive guarantees: ALL 45/45 DEFAULT_CLOUD_KEYWORDS combined, 200 linear regexes, & safe patterns remain accepted
    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);

    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r6-lin-${i}`,
        pattern: `\\bclean_rule_${i}\\s+match\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(linear200Pack)).keywords).toHaveLength(200);

    const r6SafePatterns = [
      'https?://[\\w.-]+(?:/[\\w./?%&=-]*)?',
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      '[a-z0-9.-]+\\.[a-z]{2,}\\.[a-z]{2,}',
      'foo.*bar',
      'foo.*bar(?:s)?',
      'foo.{0,20}bar',
      '.*https?://[\\w.-]+',
      'a+ba+$',
      'a+b*ca+$',
      'a+b*ba+$',
      '(?:ab)+xyz(?:ab)+$',
      'foo\\s*,?\\s*bar',
      '(?:(?!foo|bar).)+',
      '(?<=foo)bar',
      '(?!\\s+up\\b)',
      '撸毛(?!孩子|猫|狗)',
      '(\\d{3}-){2}\\d{4}',
      '(?:[0-9a-f]{2}:){5}[0-9a-f]{2}',
      '(cat|catalog)',
      `foo(${Array.from({ length: 100 }, (_, i) => `k${i}`).join('|')})`,
      `(${Array.from({ length: 100 }, (_, i) => `k${i}`).join('|')})`,
    ];
    for (const pattern of r6SafePatterns) {
      expectSafeRegexAccepted(pattern);
    }
  });

  it('Group 15: verifies Round 7 Glushkov NFA + Product-Automaton EDA/IDA + Product-DAG sameWordDp + Smooth Cost Budget closing every Round 6 Reviewer & Challenger finding', () => {
    // 1. Unanchored cubic O(N^3) IDA >= 3 rejections (including Secondary F3, Challenger 1 BUG-R6-1, & tightened cubic .*foo.*bar)
    const r7CubicIdaCases = [
      '.*aa+$',
      '.+aa+$',
      '[\\s\\S]*aa+$',
      '.*(?:aa+)$',
      '.*(?:aa+|x)$',
      '.*a\\w+$',
      '.*a.*(?:' + '[a-b]'.repeat(80) + '|x)$',
      '.*a.*(?:' + 'a'.repeat(450) + '|x)$',
      '.*foo.*bar',
      '.*foo.*bar(?:s)?',
    ];
    for (const pattern of r7CubicIdaCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // 2. Cycle pre/post overlap, exit fan-out, & cyclic SCC state cap (Secondary F1/F2, Challenger 1 BUG-R6-1, Challenger 2 R6-BUG-1/2, oracle revCDp)
    const r7CycleOverlapAndExitCases = [
      'a+a{1,8}(?:' + 'a'.repeat(300) + '|c)b',
      'a+(?:' + 'a'.repeat(300) + '|c)a{1,8}b',
      'a+(?:' + 'a'.repeat(400) + 'b|c)',
      'a+(?:' + 'a'.repeat(400) + 'b)?z',
      'a+(?:' + 'a'.repeat(300) + '|x+)z',
      'a+(?:' + 'a'.repeat(450) + '|)z',
      'a+(?:' + 'a'.repeat(36) + '){0,7}z',
      'a+(?:' + 'a'.repeat(8) + '){0,7}z',
      'a+(?:' + '[a-b]'.repeat(90) + '|x)b',
      'a+(?:' + '[a-b]'.repeat(50) + '|x)a{1,8}z',
      'a+a{1,8}z',
      'a+a{1,4}z',
      'a+aa{1,8}z',
      Array(2).fill('a+aa{1,8}z').join('|'),
      '(?:[a-b]{64})+z',
      Array(16).fill('(?:[a-b]{64})+z').join('|'),
      Array(16).fill('[a-b]+z').join('|'),
      Array(16).fill('a+$').join('|'),
      'a+(?:' + '|'.repeat(31) + ')z',
      'a+(?:' + Array(32).fill('b?').join('|') + ')z',
      Array(8).fill('a+(?:b?|c?)(?:d?|e?)(?:f?|g?)(?:h?|i?)(?:j?|k?)z').join('|'),
      '.a{1,8}[a-c][a-b]*b',
      '(?:a|ab)?[a-c]*.{4}a$',
      'xa{1,8}a+$',
      'xa{0,500}a+$',
    ];
    for (const pattern of r7CycleOverlapAndExitCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // 3. Acyclic finite DAG & shared-prefix work (Secondary F1, Challenger 1 BUG-R6-1, Challenger 2 R6-BUG-1/3)
    const r7AcyclicDagCases = [
      'a?'.repeat(9) + '(?:' + 'a'.repeat(300) + '|c)z',
      'a?'.repeat(9) + '(?:' + 'a'.repeat(300) + ')?z',
      'a?'.repeat(4) + '(?:' + '[a-b]'.repeat(40) + '|x)z',
      Array(4).fill('a?a?a?a?(?:' + '[a-b]'.repeat(20) + '|x)z').join('|'),
      Array.from({ length: 28 }, (_, i) => `[a-b]{1,16}z${i}`).join('|'),
      Array.from({ length: 5 }, (_, i) => '(?:' + '[a-b]'.repeat(16) + '){0,15}z' + i).join('|'),
      '(' + Array(50).fill('a').join('|') + ')' + '[a-b]'.repeat(20) + 'z',
      Array.from({ length: 20 }, (_, i) => 'ab'.repeat(8) + `z${i}`).join('|'),
      Array.from({ length: 16 }, (_, j) => 'a'.repeat(16) + `z${j}`).join('|'),
      Array.from({ length: 16 }, (_, j) => 'ab'.repeat(8) + `z${j}`).join('|'),
    ];
    for (const pattern of r7AcyclicDagCases) {
      expectUnsafeRegexRejected(pattern);
    }

    // 4. Strict fail-closed regular-language backreference policy (Option A — closes Challenger 1 BUG-R6-2 & all backrefs)
    const r7BackrefCases = [
      '([a-b]{30})' + '\\1'.repeat(200) + 'z',
      'a?a?a?([a-b]{32})' + '\\1'.repeat(200) + 'z',
      '([a-z]{3})\\1',
      '(?<tok>[a-z]{3})-\\k<tok>',
    ];
    for (const pattern of r7BackrefCases) {
      expectUnsafeRegexRejected(pattern);
    }
    expect(checkRegexSafety('((?<g>[a-z]{3})x|(?<g>[a-z]{3})y)\\k<g>$').safe).toBe(false);
    // Literal \k<foo> (no named captures in pattern) stays ACCEPTED; invalid \k<missing> stays syntax error
    expectSafeRegexAccepted('\\k<foo>');
    expect(checkRegexSafety('(?<name>a)\\k<missing>')).toEqual({
      safe: false,
      reason: 'invalid regular expression syntax',
    });

    // 5. Fail-closed lookaround & ES2025 modifier cases
    const r7LookaroundCases = [
      '(?=[a-b]+z0)|(?=[a-b]+y0)',
      'a+(?=' + 'a'.repeat(15) + 'b)',
      'a+(?<=' + 'a'.repeat(15) + 'b)',
      '(?:(?!' + 'a'.repeat(7) + 'b)a)+$',
      '(?:(?!ab|a)a)+$',
    ];
    for (const pattern of r7LookaroundCases) {
      expectUnsafeRegexRejected(pattern);
    }
    for (const es25Pat of [
      '(?-i:a+(?:' + 'a'.repeat(36) + '){0,7}z)',
      '(?s:.*a.*(?:' + '[a-b]'.repeat(80) + '|x)$)',
      '(?s:.*aa+$)',
      '(?-i:(?:[a-b]{32})+z)',
    ]) {
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 ${JSON.stringify(es25Pat)} rejected`).toBe(false);
      expect(res.reason).toBeTruthy();
    }

    // 6. Pure NFA per-pack aggregate budget tests (strictly asserting aggregate budget error & plain Error, never SyntaxError)
    const r7PurePackBudgetCases: Array<{ name: string; patterns: string[] }> = [
      { name: '31x [a-b]+z_i', patterns: Array.from({ length: 31 }, (_, i) => `[a-b]+z_${i}`) },
      { name: '200x (?=[a-b]+z_i)', patterns: Array.from({ length: 200 }, (_, i) => `(?=[a-b]+z_${i})`) },
      { name: '200x (?:a|(?=[a-b]+z_i))', patterns: Array.from({ length: 200 }, (_, i) => `(?:a|(?=[a-b]+z_${i}))`) },
      { name: '200x [a-b]{64}z_i', patterns: Array.from({ length: 200 }, (_, i) => `[a-b]{64}z_${i}`) },
      { name: '200x [a-b]{1,64}$', patterns: Array.from({ length: 200 }, (_, i) => `(?<g>z${i})|[a-b]{1,64}$`) },
      { name: '200x [a-b]{0,63}z_i', patterns: Array.from({ length: 200 }, (_, i) => `[a-b]{0,63}z_${i}`) },
      { name: '200x 4x [a-b]{16}z', patterns: Array.from({ length: 200 }, (_, i) => `(?<g>z${i})|` + Array(4).fill('[a-b]{16}z').join('|')) },
      { name: '200x a?^4 [a-b]{4}z', patterns: Array.from({ length: 200 }, (_, i) => `a?a?a?a?[a-b]{4}z_${i}`) },
      { name: '200x (?:[a-b][c-d]){32}z_i', patterns: Array.from({ length: 200 }, (_, i) => `(?:[a-b][c-d]){32}z_${i}`) },
      { name: '200x x.{0,24}y_i', patterns: Array.from({ length: 200 }, (_, i) => `x.{0,24}y_${i}`) },
      { name: '200x 12br a^16 z_j', patterns: Array.from({ length: 200 }, () => Array.from({ length: 12 }, (_, j) => 'a'.repeat(16) + `z${j}`).join('|')) },
      { name: '200x 12br (ab)^8 z_j', patterns: Array.from({ length: 200 }, () => Array.from({ length: 12 }, (_, j) => 'ab'.repeat(8) + `z${j}`).join('|')) },
    ];
    for (const { name, patterns } of r7PurePackBudgetCases) {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, idx) => ({
          id: `r7-bud-${idx}`,
          pattern,
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected R7 pack budget rejection "${name}"`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((caught as Error).message).toMatch(/aggregate regular expression complexity budget/i);
      expect(() => serializeRulePack(pack)).toThrow(/aggregate regular expression complexity budget/i);
    }

    // 7. Public checkRegexSafety return-shape invariant (zero leaked internal fields like costWeight)
    expect(Object.keys(checkRegexSafety('foo.*bar'))).toEqual(['safe']);
    expect(Object.keys(checkRegexSafety('.*aa+$')).sort()).toEqual(['reason', 'safe']);
    expect(Object.keys(checkRegexSafety('[unclosed')).sort()).toEqual(['reason', 'safe']);

    // 8. Retained positive guarantees (all 45/45 cloud keywords combined, 200 linear rules, safe regexes)
    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);
    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r7-lin-${i}`,
        pattern: `\\bvalid_rule_${i}\\s+signal\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
  });

  it('Group 16: closes all Round 7 Secondary Reviewer (F1-F4), Challenger 1 (BUG-R7-1..5), and Challenger 2 (R7-BUG-1..3 + single-pattern budget consistency) findings via automata-native fixes R8-1..R8-7', () => {
    // 1. R8-1: Multi-state cyclic SCC pass-through in computeProductDagDp (Secondary Reviewer F1)
    const r8MultiStateSccCases = [
      '(?:ab)+' + '(?:c|[c-d])'.repeat(24) + 'z',
      '(?:ab)+' + '(?:c|[c-d])'.repeat(40) + 'z',
      'x(?:ab)+' + '(?:c|[c-d])'.repeat(40) + 'z',
      '(?:ab)+' + '(?:c|[c-d]|[c-e]|[c-f])'.repeat(12) + 'z',
      '(?:ab)+' + '(?:c|[c-d])'.repeat(20) + 'd+z',
      '(?:ab)+c{0,20}c{0,20}c{0,20}c{0,20}z',
      '(?=(?:ab)+' + '(?:c|[c-d])'.repeat(6) + 'z)',
    ];
    for (const pattern of r8MultiStateSccCases) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
    }

    // 2. R8-2 & R8-4: Unified prefix-compatible path DP, lookbehind entry paths, & non-ASCII literal check (Challenger 1 BUG-R7-1, BUG-R7-2, BUG-R7-4)
    const r8PrefixPathCases = [
      'x{1,500}\\s*,?\\s*z',
      'x{1,500}[a-b]+,?[a-b]+z',
      '(?:xy){1,250}[a-b]+,?[a-b]+z',
      'x{1,20}c\\s*,?\\s*z',
      'x+(?:a{1})?(?:a{2})?(?:a{4})?(?:a{8})?(?:a{16})?(?:a{32})?(?:(a)|[a-c]){6}z',
      'a(?:ba){0,240}(?:(b)|[b-c])(?:(a)|[a-c])(?:(b)|[b-c])(?:(a)|[a-c])(?:(b)|[b-c])(?:(a)|[a-c])(?<=' + '[a-b]'.repeat(16) + ')z',
      'a(?:ba){0,20}(?<=' + '[a-b]'.repeat(16) + ')z',
      'a{1,250}z',
      'a{1,250}$',
      'a{1,250}\\b',
      '[\\u4e00-\\u4e02]{1,250}z',
      '(?:a[b-c]){1,125}z',
      'x{1,250}[a-b]+z',
      'x{1,250}(?=[a-b]+z)',
      'x{1,220}(?:[a-b]{24})+[a-b]{8}z',
    ];
    for (const pattern of r8PrefixPathCases) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
    }

    // 3. R8-3: Repeating lookahead single-literal body, bounded repeat cap <= 16, & cyclic exit guards (Challenger 1 BUG-R7-3 & Challenger 2 R7-BUG-1/2)
    const r8RepeatingLookaheadCases = [
      '(?:(?=' + '[a-b]'.repeat(5) + ')[a-b])+[a-b]{6}z',
      '(?:(?=' + '[a-b]'.repeat(6) + ')a){1,248}z',
      '(?:(?=' + '[a-b]'.repeat(6) + ')a){120}z',
      '(?:(?=' + '[a-b]'.repeat(6) + ')a){250}z',
      'x{1,248}(?:(?=' + '[a-b]'.repeat(6) + ')[a-b])+z',
      '(?:(?=' + '[a-b]'.repeat(6) + ').)+[a-b]{15}z',
      '(?:(?=' + '[a-b]'.repeat(6) + ')[a-b])+[a-b]{8}z',
      '(?:(?=' + '[a-b]'.repeat(6) + ')[a-b])+z',
      'x[a-b]+c?(?:(?=' + '[a-b]'.repeat(6) + ')[a-b])+z',
      'x(?:a|a)[a-b]+c?(?:(?=' + '[a-b]'.repeat(6) + ')[a-b])+[a-b]{7}z',
      '(?:(?=foo)a){120}z',
      '(?:(?=aaaa)[a-b])*z',
      '(?:(?=aaaa).)+a{4}z',
    ];
    for (const pattern of r8RepeatingLookaheadCases) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
    }

    // 4. R8-5, R8-6 (single-rule), & R8-7: Post-cycle nonLitOverlapWork, outExitSum on all cyclic SCCs, leading multi-state SCC cost, 1-char-prefixed shared-prefix trees, & single-pattern cost > 250 consistency
    const r8CycleAndBudgetSingleCases = [
      'c[a-b]+,?[a-b]+[a-b]{7}z',
      'x[a-b]+c?[a-b]+[a-b]{7}z',
      '[a-b]+[a-b]{8}z',
      '.+[a-b]{15}z',
      '.+[a-b]{16}z',
      '.*a{15}z',
      '.*(?:ab){8}z',
      '(?:[a-b]{24})+z',
      '(?:[a-b]{24})+[a-b]{4}z',
      '(?:[a-b]{24})+[a-b]{8}z',
      'x+[a-b]*(?:c?|d?)(?:e?|f?)(?:[c-d]{16})z',
      'a(?:' + Array.from({ length: 18 }, (_, j) => 'a'.repeat(16) + `z${j}`).join('|') + ')',
      'a(?:' + Array.from({ length: 18 }, (_, j) => 'ba'.repeat(8) + `z${j}`).join('|') + ')',
      'a(?:[b-c][a-b]){0,30}(?:[b-c][a-b]){0,30}z',
      // Challenger 2 Non-Blocking Note #1: checkRegexSafety(p) MUST be consistent with 1-rule validateRulePack(p)
      'x' + '(?:a|a)'.repeat(6) + 'a'.repeat(40) + 'z',
    ];
    for (const pattern of r8CycleAndBudgetSingleCases) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
    }

    // ES2025 modifier & duplicate named group variants (checked directly via checkRegexSafety for Chrome 125+ parity)
    for (const es25Pat of [
      '(?-i:x{1,500}[a-b]+,?[a-b]+z)',
      '(?s:.+[a-b]{15}z)',
      '(?-i:(?:ab)+' + '(?:c|[c-d])'.repeat(24) + 'z)',
      '(?<g>foo)|(?<g>x{1,500}[a-b]+,?[a-b]+z)',
      '(?<g>foo)|(?<g>(?:[a-b]{24})+z)',
    ]) {
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 ${JSON.stringify(es25Pat)} rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 5. Pack-amplification rejections (plain Error, never SyntaxError, across validateRulePack & serializeRulePack)
    const r8PackBudgetCases: Array<{ name: string; patterns: string[] }> = [
      { name: '10x c[a-b]+,?[a-b]+z_i', patterns: Array.from({ length: 10 }, (_, i) => `c[a-b]+,?[a-b]+z_${i}`) },
      { name: '10x x[a-b]+c?[a-b]+z_i', patterns: Array.from({ length: 10 }, (_, i) => `x[a-b]+c?[a-b]+z_${i}`) },
      {
        name: '200x a(?:18br (?:[b-c][a-b]){6} d_j)',
        patterns: Array.from(
          { length: 200 },
          (_, i) => `a(?:${Array.from({ length: 18 }, (_, j) => `(?:[b-c][a-b]){6}${String.fromCharCode(100 + j)}`).join('|')}|w${i})`
        ),
      },
      {
        name: '200x a(?:18br [b-c]{12} d_j)',
        patterns: Array.from(
          { length: 200 },
          (_, i) => `a(?:${Array.from({ length: 18 }, (_, j) => `[b-c]{12}${String.fromCharCode(100 + j)}`).join('|')}|w${i})`
        ),
      },
      {
        name: '200x a(?:20br (?:[c-d]a){5}z_j)',
        patterns: Array.from(
          { length: 200 },
          (_, i) => `a(?:${Array.from({ length: 20 }, (_, j) => `(?:[c-d]a){5}z${j}`).join('|')}|w${i})`
        ),
      },
      {
        name: '200x a(?:20br [c-d]{10}z_j)',
        patterns: Array.from(
          { length: 200 },
          (_, i) => `a(?:${Array.from({ length: 20 }, (_, j) => `[c-d]{10}z${j}`).join('|')}|w${i})`
        ),
      },
      {
        name: '200x [\\u4e00-\\u4e02]{250}z_i',
        patterns: Array.from({ length: 200 }, (_, i) => `[\\u4e00-\\u4e02]{250}z_${i}`),
      },
    ];
    for (const { name, patterns } of r8PackBudgetCases) {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, idx) => ({
          id: `r8-bud-${idx}`,
          pattern,
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected R8 pack budget rejection "${name}"`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((caught as Error).message).toMatch(/aggregate regular expression complexity budget/i);
      expect(() => serializeRulePack(pack)).toThrow(/aggregate regular expression complexity budget/i);
    }

    // 6. Positive guarantees (45/45 DEFAULT_CLOUD_KEYWORDS combined, 200 linear pack, safe custom idioms, backslash parity)
    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);

    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r8-lin-${i}`,
        pattern: `\\bclean_rule_${i}\\s+signal\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(linear200Pack)).keywords).toHaveLength(200);

    const r8PositiveSafePatterns = [
      `foo(${Array.from({ length: 100 }, (_, i) => `k${i}`).join('|')})`,
      `(${Array.from({ length: 100 }, (_, i) => `k${i}`).join('|')})`,
      '(?:http://|https://)+',
      'foo\\s*,?\\s*bar',
      'start\\d+,?\\d+end',
      'start[f-g]+:?[f-g]+end',
      'a+a$',
      'foo.*bar',
      '.*https?://[\\w.-]+',
      '(?:(?!foo|bar).)+',
      '(?<=foo)bar',
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      '[a-z0-9.-]+\\.[a-z]{2,}\\.[a-z]{2,}',
      '\\k<foo>',
    ];
    for (const pattern of r8PositiveSafePatterns) {
      expectSafeRegexAccepted(pattern);
      expect(Object.keys(checkRegexSafety(pattern))).toEqual(['safe']);
    }
    expect(checkRegexSafety('(?<name>a)\\k<missing>')).toEqual({
      safe: false,
      reason: 'invalid regular expression syntax',
    });
  });

  it('Group 17: closes all Round 8 Secondary Reviewer (F1-F2), Challenger 1 (BUG-R8-1..5), and Challenger 2 (R8-BUG-1..4) findings via automata-native fixes R9-1..R9-7', () => {
    // 1. R9-1: cDp propagation across distinct single- & multi-state cyclic SCCs + barrierFree lookbehind coupling (Secondary F1 & Challenger 1 BUG-R8-1)
    const r9CdpShieldCases = [
      '[a-d]+c[a-b]+(?:(c)|[c-d]){6}z',
      '[a-d]+c(?:ab)+(?:(c)|[c-d]){6}z',
      '[a-d]+c[a-b]+(?:(c)|[c-d]){3}(?<=' + '[c-d]'.repeat(8) + ')z',
      '.*c[a-b]+[c-d]{20}z',
      '.*c(?:ab)+[c-d]{20}z',
      '[a-d]+c[a-b]+[c-d]{20}z',
      '[a-d]+c[a-b]+d{1,60}z',
      '[a-d]+c[a-b]+(?:c|d|cc|dd|cd|dc)[c-d]{10}z',
      '(?:ab)+a+(?:(b)|[b-c])(?:(a)|[a-c])(?:(b)|[b-c])(?:(a)|[a-c])(?:(b)|[b-c])(?:(a)|[a-c])(?:ba){14}z',
      '(?:ab)+a+b(?:ab){1,63}z',
      '(?:ab)+a+(?:(b)|[b-c])(?:(a)|[a-c])(?:(b)|[b-c])(?<=' + '[a-b]'.repeat(8) + ')z',
    ];
    for (const pattern of r9CdpShieldCases) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }

    // 2. R9-2: Multi-state & total cyclic SCC caps + checkPairwiseIda self-DoS protection (Challenger 2 R8-BUG-1)
    const r9SelfDosCases = [
      'z0' + '(?:a{24})+x'.repeat(19),
      'z' + '(?:a{24})+x'.repeat(20),
      '(?:[a-b]{24})+c'.repeat(20),
      '(?:[a-b]{16})+x'.repeat(30),
    ];
    for (const pattern of r9SelfDosCases) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
    }

    // 3. R9-3: Empty capturing groups & excessive captures inside repeating/cyclic patterns (Challenger 1 BUG-R8-2)
    const r9CaptureCases = [
      '(?:' + '()'.repeat(200) + '[a-b])+z',
      'x{1,2}[a-b]+,?(?:' + '()'.repeat(200) + '[a-b])+z',
      '('.repeat(22) + '[a-b]' + ')'.repeat(22) + '+z',
      'a(?:' + '()'.repeat(100) + '[b-c]a){125}z',
      '[a-b]+' + '()'.repeat(200) + 'z',
      '[a-b]+' + '('.repeat(22) + 'z' + ')'.repeat(22),
    ];
    for (const pattern of r9CaptureCases) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
    }

    // 4. R9-4: Trailing zero-width assertions ($, \b, \B) after repeating-lookahead cyclic SCCs (Secondary F2 & Challenger 1 BUG-R8-3)
    const r9TrailingAssertCases = [
      '(?:(?=aaaa)[a-b])+$',
      '(?:(?=aaaa)[a-b])+\\b',
      '(?:(?=aaaa)[a-b])+\\B',
      '(?:(?=aaaa).)+$',
      '(?:(?!aaab)[a-b])+$',
      '(?:(?!aaab).)+$',
      '(?:(?!b)[a-b])+$',
      '(?:(?!b).)+$',
      '(?:(?!foo|bar).)+$',
    ];
    for (const pattern of r9TrailingAssertCases) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
    }

    // 5. R9-5 & R9-6 (single-rule): Indirect post-cycle boundary exits, leading cycle total-state/non-lit scaling, broad non-lit tightening, & safePunctPair prefix/exit hardening (Challenger 1 BUG-R8-4 & Challenger 2 R8-BUG-2/4)
    const r9CycleAndPunctSingleCases = [
      'a+a(?:' + Array.from({ length: 80 }, (_, i) => `(c${i})`).join('|') + ')',
      'a+a{3}(?:' + Array.from({ length: 80 }, (_, i) => `(c${i})`).join('|') + ')',
      'a+a(?:' + Array.from({ length: 39 }, (_, i) => `([c-d]${i})`).join('|') + ')',
      '(?:a{24})+z',
      '(?:[a-b]{4}a{20})+z',
      '(?:[a-b]a{5}[a-b]a{5}[a-b]a{5}[a-b]a{5})+z',
      '(?:[a-b]{4})+[a-b]{2}az',
      '(?:a{11})+az',
      '(?:[a-b]{6}a{6})+z',
      '.*a[b-c][d-e]fghijklmnopz',
      'x{1,2}[a-b]+,?[a-b]+z',
      'c[a-b]?[a-b]+,?[a-b]+z',
      'c[a-b]?[a-b]+,?[a-b]+(?:' + Array.from({ length: 11 }, (_, i) => `([c-d]${i})`).join('|') + ')',
      'c[a-b]+,?[a-b]+(?:' + Array.from({ length: 11 }, (_, i) => `([c-d]${i})`).join('|') + ')',
    ];
    for (const pattern of r9CycleAndPunctSingleCases) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
    }

    // 6. ES2025 modifier & duplicate named group variants (Chrome 125+ parity)
    for (const es25Pat of [
      '(?-i:[a-d]+c[a-b]+(?:(c)|[c-d]){6}z)',
      '(?s:.*c[a-b]+[c-d]{20}z)',
      '(?i:(?:ab)+a+b(?:ab){1,63}z)',
      '(?m:(?:(?=aaaa)[a-b])+$)',
      '(?-i:(?:a{24})+z)',
      '(?<g>foo)|(?<g>[a-d]+c[a-b]+(?:(c)|[c-d]){6}z)',
      '(?<g>foo)|(?<g>(?:()()()()()[a-b])+z)',
    ]) {
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 ${JSON.stringify(es25Pat)} rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 7. R9-6 & R9-7 pack-amplification rejections (plain Error, never SyntaxError, across validateRulePack & serializeRulePack)
    const r9PackBudgetCases: Array<{ name: string; patterns: string[] }> = [
      { name: '5x c[a-b]+,?[a-b]+z_i', patterns: Array.from({ length: 5 }, (_, i) => `c[a-b]+,?[a-b]+z_${i}`) },
      { name: '200x a(?:[b-c]a){125}z_i', patterns: Array.from({ length: 200 }, (_, i) => `a(?:[b-c]a){125}z_${i}`) },
      {
        name: '200x CJK a(?:[b-c]a){125}z_i',
        patterns: Array.from({ length: 200 }, (_, i) => `\\u4e00(?:[\\u4e01-\\u4e02]\\u4e00){125}z_${i}`),
      },
      { name: '200x a(?:[b-c]{12}a){1,16}z_i', patterns: Array.from({ length: 200 }, (_, i) => `a(?:[b-c]{12}a){1,16}z_${i}`) },
      { name: '200x a{250}[x-y]_i', patterns: Array.from({ length: 200 }, (_, i) => `a{250}[x-y]_${i}`) },
      { name: '31x a{500}[x-y]_i', patterns: Array.from({ length: 31 }, (_, i) => `a{500}[x-y]_${i}`) },
      {
        name: '200x a(?:(?:[b-c]a){10}){1,12}[x-y]_i',
        patterns: Array.from({ length: 200 }, (_, i) => `a(?:(?:[b-c]a){10}){1,12}[x-y]_${i}`),
      },
      { name: '200x (?:ab){126}[x-y]_i', patterns: Array.from({ length: 200 }, (_, i) => `(?:ab){126}[x-y]_${i}`) },
    ];
    for (const { name, patterns } of r9PackBudgetCases) {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, idx) => ({
          id: `r9-bud-${idx}`,
          pattern,
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected R9 pack budget rejection "${name}"`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((caught as Error).message).toMatch(/aggregate regular expression complexity budget/i);
      expect(() => serializeRulePack(pack)).toThrow(/aggregate regular expression complexity budget/i);
    }

    // 8. Retained positive guarantees (45/45 DEFAULT_CLOUD_KEYWORDS combined <= 250, 200-rule linear pack, all safe custom idioms)
    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);

    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r9-lin-${i}`,
        pattern: `\\bclean_linear_${i}\\s+signal\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(linear200Pack)).keywords).toHaveLength(200);

    const r9PositiveSafePatterns = [
      '[a-z0-9.-]+\\.[a-z]{2,}\\.[a-z]{2,}',
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      '(?:(?!foo|bar).)+',
      '(?:http://|https://)+',
      '.*https?://[\\w.-]+',
      'foo\\s*,?\\s*bar',
      'head[p-q]+;?[p-q]+tail',
      '(\\d{3}-){2}\\d{4}',
      '(a)'.repeat(80) + '(' + Array(120).fill('b').join('|') + ')',
      'a+a$',
      'foo.*bar',
    ];
    for (const pattern of r9PositiveSafePatterns) {
      expectSafeRegexAccepted(pattern);
      expect(Object.keys(checkRegexSafety(pattern))).toEqual(['safe']);
    }
  });

  it('Group 18: closes all Round 9 Primary Reviewer (F1-R9), Secondary Reviewer (F1-F2), Challenger 1 (BUG-R9-1..3), and Challenger 2 (R9-BUG-1..2) findings via automata-native fixes R10-1..R10-5', () => {
    // 1. R10-1: 1-state cyclic SCC self-loops in computeProductDagDp (Challenger 1 BUG-R9-1)
    const exp28Chain =
      '!' +
      'abcdefghijklmnopqrstuvwxyz01'
        .split('')
        .map((c) => `${c}+${c}?`)
        .join('') +
      'z';
    const exp25Chain =
      'abcdefghijklmnopqrstuvwxy'
        .split('')
        .map((c) => `${c}+${c}?`)
        .join('') + 'z';
    const cjk28Chain =
      '!' +
      Array.from({ length: 28 }, (_, i) => {
        const c1 = String.fromCharCode(0x4e00 + i * 2);
        const c2 = String.fromCharCode(0x4e01 + i * 2);
        return `[${c1}-${c2}]+[${c1}-${c2}]?`;
      }).join('') +
      'z';
    const cjk3WaySplit =
      '!' +
      Array.from({ length: 20 }, (_, i) => {
        const c = String.fromCharCode(0x4e00 + i * 2);
        const d = String.fromCharCode(0x4e01 + i * 2);
        return `${c}+(?:${c}${c}${d}|${c}${d}|${d})`;
      }).join('') +
      'z';

    const r10ExpSingleCases = [exp28Chain, exp25Chain, cjk28Chain, cjk3WaySplit];
    for (const pattern of r10ExpSingleCases) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }

    // ES2025 modifier & duplicate-named-group variants of R10-1 and R10-2
    const lead2Cap12Cls =
      '(([a-b]))+(?:([c-d])|([e-f])|([g-h])|([i-j])|([k-l])|([m-n])|[o-p]|[q-r]|[s-t]|[u-v]|[w-x]|[y-z])';
    const lead0Cap12Cls =
      '[a-b]+(?:[c-d]|[e-f]|[g-h]|[i-j]|[k-l]|[m-n]|[o-p]|[q-r]|[s-t]|[u-v]|[w-x]|[y-z])';

    for (const es25Pat of [
      `(?-i:${exp28Chain})`,
      `(?<g>foo)|(?<g>${exp28Chain})`,
      `(?-i:${lead2Cap12Cls})`,
      `(?<g>foo)|(?<g>${lead2Cap12Cls})`,
    ]) {
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 ${JSON.stringify(es25Pat)} rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 2. R10-2: Leading-cycle non-literal exit fan-out & capturesInRepeating scaling (Primary Reviewer F1-R9 & Challenger 1 NB#1)
    for (const pattern of [lead2Cap12Cls, lead0Cap12Cls]) {
      expectUnsafeRegexRejected(pattern);
      expect(() => serializeRulePack(packWithRegex(pattern))).toThrow(/unsafe regular expression/i);
    }

    // 4-rule packs of F1-R9 (2-cap & 0-cap) + 4x (([a-b]))+z_i rejected with plain Error (never SyntaxError)
    const r10LeadPacks: Array<{ name: string; patterns: string[]; expectedMatch: RegExp }> = [
      {
        name: '4x F1-R9 2cap 12cls',
        patterns: Array.from(
          { length: 4 },
          (_, i) =>
            `(([a-b]))+(?:([c-d])|([e-f])|([g-h])|([i-j])|([k-l])|([m-n])|[o-p]|[q-r]|[s-t]|[u-v]|[w-x]|[y-z]${i})`
        ),
        expectedMatch: /unsafe regular expression/i,
      },
      {
        name: '4x F1-R9 0cap 12cls',
        patterns: Array.from(
          { length: 4 },
          (_, i) => `[a-b]+(?:[c-d]|[e-f]|[g-h]|[i-j]|[k-l]|[m-n]|[o-p]|[q-r]|[s-t]|[u-v]|[w-x]|[y-z]${i})`
        ),
        expectedMatch: /unsafe regular expression/i,
      },
      {
        name: '4x (([a-b]))+z_i',
        patterns: Array.from({ length: 4 }, (_, i) => `(([a-b]))+z_${i}`),
        expectedMatch: /aggregate regular expression complexity budget/i,
      },
    ];
    for (const { name, patterns, expectedMatch } of r10LeadPacks) {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, idx) => ({
          id: `r10-lead-${idx}`,
          pattern,
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected R10-2 pack rejection "${name}"`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((caught as Error).message).toMatch(expectedMatch);
      expect(() => serializeRulePack(pack)).toThrow(expectedMatch);
    }

    // 3. R10-3: Pure-literal periodic chains (period-1 & period-2) pack-amplification rejections
    const r10PeriodicPackCases: Array<{ name: string; patterns: string[] }> = [
      { name: '200x a{250}z_i', patterns: Array.from({ length: 200 }, (_, i) => `a{250}z_${i}`) },
      { name: '200x a{250}\\b', patterns: Array.from({ length: 200 }, () => 'a{250}\\b') },
      { name: '200x a{250}(?:x|y)_i', patterns: Array.from({ length: 200 }, (_, i) => `a{250}(?:x${i}|y${i})`) },
      { name: '200x ((a)){250}(?:x|y)_i', patterns: Array.from({ length: 200 }, (_, i) => `((a)){250}(?:x${i}|y${i})`) },
      { name: '200x \\u4e00{250}\\b', patterns: Array.from({ length: 200 }, () => '\\u4e00{250}\\b') },
      { name: '200x \\u4e00{250}(?=x_i)', patterns: Array.from({ length: 200 }, (_, i) => `\\u4e00{250}(?=x${i})`) },
      { name: '200x \\u03c3{250}(?:y|z)_i', patterns: Array.from({ length: 200 }, (_, i) => `\\u03c3{250}(?:y${i}|z${i})`) },
      { name: '200x a{250}(?=x_i)', patterns: Array.from({ length: 200 }, (_, i) => `a{250}(?=x${i})`) },
      { name: '200x a{250}z?w_i', patterns: Array.from({ length: 200 }, (_, i) => `a{250}z?w${i}`) },
      { name: '200x a{250}(?<=aaaa)z_i', patterns: Array.from({ length: 200 }, (_, i) => `a{250}(?<=aaaa)z${i}`) },
      { name: '31x a{480}(?=x_i)', patterns: Array.from({ length: 31 }, (_, i) => `a{480}(?=x${i})`) },
      { name: '200x (?:ab){125}z_i', patterns: Array.from({ length: 200 }, (_, i) => `(?:ab){125}z_${i}`) },
      { name: '200x (?:(a)(b)){125}z_i', patterns: Array.from({ length: 200 }, (_, i) => `(?:(a)(b)){125}z_${i}`) },
      { name: '200x (?:ab){125}\\b', patterns: Array.from({ length: 200 }, () => '(?:ab){125}\\b') },
      { name: '200x (?:ab){125}(?:x|y)_i', patterns: Array.from({ length: 200 }, (_, i) => `(?:ab){125}(?:x${i}|y${i})`) },
      { name: '200x a{125}(?:b|c)a{125}_i', patterns: Array.from({ length: 200 }, (_, i) => `a{125}(?:b|c)a{125}_${i}`) },
      { name: '200x a{60}z_i', patterns: Array.from({ length: 200 }, (_, i) => `a{60}z_${i}`) },
    ];
    for (const { name, patterns } of r10PeriodicPackCases) {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, idx) => ({
          id: `r10-per-${idx}`,
          pattern,
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected R10-3 pack rejection "${name}"`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((caught as Error).message).toMatch(/aggregate regular expression complexity budget/i);
      expect(() => serializeRulePack(pack)).toThrow(/aggregate regular expression complexity budget/i);
    }

    // ES2025 200x (?-i:a{250}z_i): rejected cleanly with plain Error (never SyntaxError) on both Default V8 & Chrome 125+ ES2025 V8
    const es25PeriodicPack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r10-es25-${i}`,
        pattern: `(?-i:a{250}z_${i})`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    let es25Caught: unknown;
    try {
      validateRulePack(es25PeriodicPack);
    } catch (err) {
      es25Caught = err;
    }
    expect(es25Caught).toBeInstanceOf(Error);
    expect(es25Caught).not.toBeInstanceOf(SyntaxError);
    expect((es25Caught as Error).message).toMatch(
      /not a valid regular expression|aggregate regular expression complexity budget/i
    );
    expect(() => serializeRulePack(es25PeriodicPack)).toThrow(
      /not a valid regular expression|aggregate regular expression complexity budget/i
    );

    // 4. Positive guarantees: 45/45 DEFAULT_CLOUD_KEYWORDS combined (<= 250), 200x 150-char English phrases, 200x linear regexes, & safe custom idioms
    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);
    const frRule = DEFAULT_CLOUD_KEYWORDS.find((k) => k.id === 'cloud-follow-fr-1')!;
    const deRule = DEFAULT_CLOUD_KEYWORDS.find((k) => k.id === 'cloud-follow-de-1')!;
    expectSafeRegexAccepted(frRule.pattern);
    expectSafeRegexAccepted(deRule.pattern);

    const english150Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r10-eng-${i}`,
        pattern: `exclusive investigative report edition ${String(i).padStart(3, '0')} detailing decentralized governance treasury allocation audit findings and community roadmap summary`.slice(0, 150),
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(english150Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(english150Pack)).keywords).toHaveLength(200);

    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r10-lin-${i}`,
        pattern: `\\bclean_linear_${i}\\s+signal\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(linear200Pack)).keywords).toHaveLength(200);

    const r10PositiveSafePatterns = [
      '(a)'.repeat(80) + '(' + Array(120).fill('b').join('|') + ')',
      '[a-z0-9.-]+\\.[a-z]{2,}\\.[a-z]{2,}',
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      '(?:(?!foo|bar).)+',
      '(?:http://|https://)+',
      '(foo|bar|baz)+',
      '.*https?://[\\w.-]+',
      '(\\d{3}-){2}\\d{4}',
      'foo\\s*,?\\s*bar',
      'head[p-q]+;?[p-q]+tail',
      'a+a$',
      'a+ba+$',
      'a+b*ca+$',
      'a+b*ba+$',
      '(?:ab)+xyz(?:ab)+$',
      'foo.*bar',
    ];
    for (const pattern of r10PositiveSafePatterns) {
      expectSafeRegexAccepted(pattern);
      expect(Object.keys(checkRegexSafety(pattern))).toEqual(['safe']);
    }
  });

  it('Group 19: closes all Round 10 Secondary Reviewer (F1-F2), Challenger 1 (BUG-R10-1..4), and Challenger 2 (R10-BUG-1..2) findings via automata-native fixes R11-1..R11-4', () => {
    const assertPlainErrorPackReject = (name: string, patterns: string[], expectedMatch: RegExp) => {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, idx) => ({
          id: `r11-${idx}`,
          pattern,
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected R11 pack rejection "${name}"`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((caught as Error).message).toMatch(expectedMatch);
      let serCaught: unknown;
      try {
        serializeRulePack(pack);
      } catch (err) {
        serCaught = err;
      }
      expect(serCaught, `Expected serializeRulePack rejection "${name}"`).toBeInstanceOf(Error);
      expect(serCaught, `Expected plain Error (not SyntaxError) on serialize for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((serCaught as Error).message).toMatch(expectedMatch);
    };

    // 1. R11-1: Cross-alphabet cycle-to-cycle exponential splits (Challenger 1 BUG-R10-1)
    const pairs14: Array<[string, string]> = [
      ['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j'], ['k', 'l'], ['m', 'n'],
      ['o', 'p'], ['q', 'r'], ['s', 't'], ['u', 'v'], ['w', 'x'], ['y', 'z'], ['0', '1'],
    ];
    const lead14 = pairs14.map(([a, b]) => `${a}+(?:${a}|${b})${b}+`).join('') + 'Z';
    const lead14x64 = pairs14.map(([a, b]) => `${a}+(?:${a}|${b})${b}+`).join('') + '(?:8|8){6}Z';
    const cjkLead14 =
      Array.from({ length: 14 }, (_, i) => {
        const a = String.fromCharCode(0x4e00 + i * 2);
        const b = String.fromCharCode(0x4e01 + i * 2);
        return `${a}+(?:${a}|${b})${b}+`;
      }).join('') + 'Z';
    const prefLead14 = '!' + lead14;

    for (const pattern of [lead14, lead14x64, cjkLead14, prefLead14]) {
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`R11-1 single ${pattern.slice(0, 20)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    for (const es25Pat of [`(?-i:${lead14})`, `(?<g>ok)|(?<g>${lead14})`]) {
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 R11-1 ${es25Pat.slice(0, 30)} rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 2. R11-2: Post-leading cyclic SCC exit fan-out & state scaling (Challenger 1 BUG-R10-2)
    const ex12Na =
      '([\\u03b5-\\u03b6])|([\\u03b7-\\u03b8])|([\\u03b9-\\u03ba])|([\\u03bb-\\u03bc])|([\\u03bd-\\u03be])|([\\u03bf-\\u03c0])|[\\u03c1-\\u03c2]|[\\u03c4-\\u03c5]|[\\u03c6-\\u03c7]|[\\u03c8-\\u03c9]|[\\u03ca-\\u03cb]|[\\u03d2-\\u03d3]';
    const ex12Asc =
      '([e-f])|([g-h])|([i-j])|([k-l])|([m-n])|([o-p])|[q-r]|[s-t]|[u-v]|[w-x]|[y-z]|[0-1]';
    const shNa2Cap = `[\\u03b1-\\u03b2]+(([\\u03b3-\\u03b4]))+(?:${ex12Na})`;
    const shAsc2Cap = `[a-b]+(([c-d]))+(?:${ex12Asc})`;
    for (const pattern of [shNa2Cap, shAsc2Cap]) {
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`R11-2 shielded ${pattern.slice(0, 20)}`, [pattern], /unsafe regular expression/i);
    }

    // 3. R11-3: Fail-closed decoyed period-2 pack rejections (Secondary F2, Challenger 1 BUG-R10-3, Challenger 2 R10-BUG-2)
    const decoy64Sec = '(?:c|d|e|f|g|h|i|j)(?:k|l|m|n|o|p|q|r)(?:c|d|e|f|g|h|i|j)(?:k|l|m|n|o|p|q|r)s{13}';
    const decoy64Ch1 = '(?:0|1|2|3|4|5|6|7){4}x{13}';
    const decoy64Ch2 = '(?:(?:c|d|e|f|g|h|i|j)(?:1|2|3|4|5|6|7|8)){2}q{14}';
    const r11Period2PackCases: Array<{ name: string; patterns: string[] }> = [
      {
        name: '200x DEC64_sig79_s_alt2',
        patterns: Array.from(
          { length: 200 },
          () => `(?:${decoy64Sec}|(?:(\\u03c3)(\\u03c4)){79}\\u03c3(?:\\u03c5|\\u03c6))`
        ),
      },
      {
        name: '200x DEC64_sig79_s_alt2_lb4',
        patterns: Array.from(
          { length: 200 },
          () => `(?:${decoy64Sec}|(?:(\\u03c3)(\\u03c4)){79}\\u03c3(?<=\\u03c4\\u03c3\\u03c4\\u03c3)(?:\\u03c5|\\u03c6))`
        ),
      },
      {
        name: '200x decoy|(?:(a)(b)){79}(?:y|z)',
        patterns: Array.from({ length: 200 }, () => `${decoy64Ch1}|(?:(a)(b)){79}(?:y|z)`),
      },
      {
        name: '200x decoy|(?:ab){79}(?=z)',
        patterns: Array.from({ length: 200 }, () => `${decoy64Ch1}|(?:ab){79}(?=z)`),
      },
      {
        name: '200x decoy|(?:ab){79}\\b',
        patterns: Array.from({ length: 200 }, () => `${decoy64Ch1}|(?:ab){79}\\b`),
      },
      {
        name: '200x F9-decoy64-cap2-64to79-posLB4-ex16lit',
        patterns: Array.from(
          { length: 200 },
          () =>
            `${decoy64Ch2}|(?:(\\u03c3)(\\u03b1)){64,79}(?<=\\u03c3\\u03b1\\u03c3\\u03b1)(?:w|x|y|z|k|l|m|n|p|r|s|t|u|v|0|2)`
        ),
      },
      {
        name: '200x F8-decoy64-cap2-79-ex16lit',
        patterns: Array.from(
          { length: 200 },
          () =>
            `${decoy64Ch2}|(?:(\\u03c3)(\\u03b1)){79}(?:w|x|y|z|k|l|m|n|p|r|s|t|u|v|0|2)`
        ),
      },
    ];
    for (const { name, patterns } of r11Period2PackCases) {
      assertPlainErrorPackReject(name, patterns, /aggregate regular expression complexity budget/i);
    }

    // 4. R11-4: Batched BMP /i folding exactness on wide ranges, negated classes, and ES2025 (?-i:...)
    expectUnsafeRegexRejected('([\\u13a0-\\u13f5]|\\uab70)+$');
    expectUnsafeRegexRejected('([\\u10d0-\\u10fa]|\\u1c90)+$');
    expectSafeRegexAccepted('([^\\u00c0-\\u00ff]|\\u0178)+$');
    expect(checkRegexSafety('(?-i:([^\\u00c0-\\u00ff]|\\u0178)+)$').safe).toBe(false);

    // 5. Positive guarantees: 45/45 DEFAULT_CLOUD_KEYWORDS combined (exact cost 243 <= 250), 200x linear, 200x English, & safe idioms
    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);
    const pad7 = Array.from({ length: 7 }, (_, i) => ({
      id: `r11-pad-${i}`,
      pattern: `r11_pad_token_${i}`,
      isRegex: true,
      scopes: ['text'] as KeywordMatchScope[],
      enabled: true,
    }));
    expect(validateRulePack(makeValidPack({ keywords: [...DEFAULT_CLOUD_KEYWORDS, ...pad7] })).keywords).toHaveLength(52);
    expect(() =>
      validateRulePack(
        makeValidPack({
          keywords: [
            ...DEFAULT_CLOUD_KEYWORDS,
            ...pad7,
            { id: 'r11-pad-7', pattern: 'r11_pad_token_7', isRegex: true, scopes: ['text'], enabled: true },
          ],
        })
      )
    ).toThrow(/aggregate regular expression complexity budget/i);

    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r11-lin-${i}`,
        pattern: `\\bclean_linear_${i}\\s+signal\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(linear200Pack)).keywords).toHaveLength(200);

    const english150Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r11-eng-${i}`,
        pattern: `exclusive investigative report edition ${String(i).padStart(3, '0')} detailing decentralized governance treasury allocation audit findings and community roadmap summary`.slice(0, 150),
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(english150Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(english150Pack)).keywords).toHaveLength(200);

    const r11PositiveSafePatterns = [
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      '[a-z0-9.-]+\\.[a-z]{2,}\\.[a-z]{2,}',
      '(?:(?!foo|bar).)+',
      '(?:http://|https://)+',
      '.*https?://[\\w.-]+',
      'a+ba+$',
      'a+b*ca+$',
      '(?:ab)+xyz(?:ab)+$',
      'foo\\s*,?\\s*bar',
      'pre[m-n]+;?[m-n]+post',
    ];
    for (const pattern of r11PositiveSafePatterns) {
      expectSafeRegexAccepted(pattern);
      expect(Object.keys(checkRegexSafety(pattern))).toEqual(['safe']);
    }
  });

  it('Group 20: closes all Round 11 Secondary Reviewer (F1-F2), Challenger 1 (BUG-R11-1..3), and Challenger 2 (R11-BUG-1) findings via automata-native fixes R12-1..R12-4', () => {
    const assertPlainErrorPackReject = (name: string, patterns: string[], expectedMatch: RegExp) => {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, idx) => ({
          id: `r12-${idx}`,
          pattern,
          isRegex: true,
          scopes: ['text'],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected R12 pack rejection "${name}"`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((caught as Error).message).toMatch(expectedMatch);
      let serCaught: unknown;
      try {
        serializeRulePack(pack);
      } catch (err) {
        serCaught = err;
      }
      expect(serCaught, `Expected serializeRulePack rejection "${name}"`).toBeInstanceOf(Error);
      expect(serCaught, `Expected plain Error (not SyntaxError) on serialize for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((serCaught as Error).message).toMatch(expectedMatch);
    };

    const pairs14: Array<[string, string]> = [
      ['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['i', 'j'], ['k', 'l'], ['m', 'n'],
      ['o', 'p'], ['q', 'r'], ['s', 't'], ['u', 'v'], ['w', 'x'], ['y', 'z'], ['0', '1'],
    ];

    // 1. R12-1 (Secondary F1): Single-state character-class cross-cycle bridges, multi-state SCC convergence, BMP /i, & ES2025
    const cls14Body = pairs14.map(([a, b]) => `${a}+[${a}${b}]${b}+`).join('');
    const cls14X64Z = cls14Body + '(?:8|8){6}Z';
    const prefCls14X64Z = '!' + cls14X64Z;
    const prefCls14Z = '!' + cls14Body + 'Z';
    const cjkCls14X64Z =
      Array.from({ length: 14 }, (_, i) => {
        const a = String.fromCharCode(0x4e00 + i * 2);
        const b = String.fromCharCode(0x4e01 + i * 2);
        return `${a}+[${a}${b}]${b}+`;
      }).join('') + '(?:8|8){6}Z';
    const dot14Z = pairs14.map(([a, b]) => `${a}+.${b}+`).join('') + 'Z';
    const prefDot14X64Z = '!' + pairs14.map(([a, b]) => `${a}+.${b}+`).join('') + '(?:8|8){6}Z';
    const w14X64Z = pairs14.map(([a, b]) => `${a}+\\w${b}+`).join('') + '(?:8|8){6}Z';
    const negCls14X64Z = pairs14.map(([a, b]) => `${a}+[^!]${b}+`).join('') + '(?:8|8){6}Z';
    const clsB2Plus14 = pairs14.map(([a, b]) => `${a}+[${a}${b}]${b}{2,}`).join('') + 'Z';
    const clsExtraBridge14 = pairs14.map(([a, b]) => `${a}+${a}[${a}${b}]${b}+`).join('') + 'Z';
    const clsRepeatBridge14 = pairs14.map(([a, b]) => `${a}+[${a}${b}]{2}${b}+`).join('') + 'Z';
    const clsAltPair14 = pairs14.map(([a, b]) => `${a}+(?:${a}${a}|${b}${b})${b}+`).join('') + 'Z';
    const clsAsymPair14 = pairs14.map(([a, b]) => `${a}+${a}(?:${a}|${b}${b})${b}+`).join('') + 'Z';
    const multiStateScc4A =
      Array.from({ length: 4 }, (_, i) => {
        const a = String.fromCharCode(0x61 + i * 3);
        const b = String.fromCharCode(0x62 + i * 3);
        const c = String.fromCharCode(0x63 + i * 3);
        return `${a}+[${a}${b}](?:${c}|${b}${c})+`;
      }).join('') + 'Z';
    const multiStateScc4B =
      Array.from({ length: 4 }, (_, i) => {
        const a = String.fromCharCode(0x61 + i * 4);
        const b = String.fromCharCode(0x62 + i * 4);
        const c = String.fromCharCode(0x63 + i * 4);
        const d = String.fromCharCode(0x64 + i * 4);
        return `${a}+[${a}${b}](?:${c}${d}|${b}${c}${d})+`;
      }).join('') + 'Z';
    const adjChain27 =
      Array.from({ length: 26 }, (_, i) => {
        const a = String.fromCharCode(0x61 + i);
        const b = String.fromCharCode(0x62 + i);
        return i === 0 ? `${a}+[${a}${b}]${b}+` : `[${a}${b}]${b}+`;
      }).join('') + 'Z';
    const bmpCrossCycleCases = [
      // Greek /i (alpha..omega uppercase bridge)
      Array.from({ length: 6 }, (_, i) => {
        const a = String.fromCharCode(0x03b1 + i * 2);
        const b = String.fromCharCode(0x03b2 + i * 2);
        const A = String.fromCharCode(0x0391 + i * 2);
        const B = String.fromCharCode(0x0392 + i * 2);
        return `${a}+[${A}${B}]${b}+`;
      }).join('') + 'Z',
      // Cherokee /i (0x13A0.. + 0xAB70..)
      Array.from({ length: 6 }, (_, i) => {
        const a = String.fromCharCode(0x13a0 + i * 2);
        const b = String.fromCharCode(0x13a1 + i * 2);
        const loA = String.fromCharCode(0xab70 + i * 2);
        const loB = String.fromCharCode(0xab71 + i * 2);
        return `${a}+[${loA}${loB}]${b}+`;
      }).join('') + 'Z',
      // Georgian Mtavruli /i (0x10D0.. + 0x1C90..)
      Array.from({ length: 6 }, (_, i) => {
        const a = String.fromCharCode(0x10d0 + i * 2);
        const b = String.fromCharCode(0x10d1 + i * 2);
        const upA = String.fromCharCode(0x1c90 + i * 2);
        const upB = String.fromCharCode(0x1c91 + i * 2);
        return `${a}+[${upA}${upB}]${b}+`;
      }).join('') + 'Z',
    ];

    for (const pattern of [
      cls14X64Z,
      prefCls14X64Z,
      cjkCls14X64Z,
      prefCls14Z,
      dot14Z,
      prefDot14X64Z,
      w14X64Z,
      negCls14X64Z,
      clsB2Plus14,
      clsExtraBridge14,
      clsRepeatBridge14,
      clsAltPair14,
      clsAsymPair14,
      multiStateScc4A,
      multiStateScc4B,
      adjChain27,
      ...bmpCrossCycleCases,
    ]) {
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`R12-1 single ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    for (const es25Pat of [`(?-i:${cls14X64Z})`, `(?<g>ok)|(?<g>${cls14X64Z})`]) {
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 R12-1 ${es25Pat.slice(0, 30)} rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 2. R12-1 (Challenger 1 BUG-R11-1 & Challenger 2 R11-BUG-1): Acyclic-bridge cross-alphabet splits
    const bridge14 = pairs14.map(([a, b]) => `${a}+${a}(?:${a}|${b})${b}+`).join('') + 'Z';
    const bridge14x64 = pairs14.map(([a, b]) => `${a}+${a}(?:${a}|${b})${b}+`).join('') + '(?:8|8){6}Z';
    const cjkBridge14 =
      Array.from({ length: 14 }, (_, i) => {
        const a = String.fromCharCode(0x4e00 + i * 2);
        const b = String.fromCharCode(0x4e01 + i * 2);
        return `${a}+${a}(?:${a}|${b})${b}+`;
      }).join('') + 'Z';
    const cjkBridge14x64 =
      Array.from({ length: 14 }, (_, i) => {
        const a = String.fromCharCode(0x4e00 + i * 2);
        const b = String.fromCharCode(0x4e01 + i * 2);
        return `${a}+${a}(?:${a}|${b})${b}+`;
      }).join('') + '(?:8|8){6}Z';
    const prefBridge14 = '!' + bridge14;
    const sib2Step14 = pairs14.map(([a, b]) => `${a}+${a}${a}(?:${a}|${b})${b}+`).join('') + 'Z';
    const sibLazy14 = pairs14.map(([a, b]) => `${a}+?${a}(?:${a}|${b})${b}+`).join('') + 'Z';
    const sibB2Plus14 = pairs14.map(([a, b]) => `${a}+${a}(?:${a}|${b})${b}{2,}`).join('') + 'Z';

    for (const pattern of [
      bridge14,
      bridge14x64,
      cjkBridge14,
      cjkBridge14x64,
      prefBridge14,
      sib2Step14,
      sibLazy14,
      sibB2Plus14,
    ]) {
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`R12-1 bridge ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    for (const es25Pat of [`(?-i:${bridge14x64})`, `(?<g>ok)|(?<g>${bridge14})`]) {
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 R12-1 bridge ${es25Pat.slice(0, 30)} rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 3. R12-2 (Challenger 1 BUG-R11-2 & Proactive Parallel-Cycle Amplification): totalPathsDp[v] & compatCluster
    const dsAlphaAsc = 'abcdefghijklmnoprstuvwxyz0123456789';
    const mkDsAsc = (k: number) => {
      const alts: string[] = [];
      let cur = '';
      for (let i = 0; i < k; i++) {
        cur = dsAlphaAsc[i]! + cur;
        alts.push(cur);
      }
      return `(?:${alts.join('|')})`;
    };
    const mkDsCjk = (k: number) => {
      const alts: string[] = [];
      let cur = '';
      for (let i = 0; i < k; i++) {
        cur = String.fromCharCode(0x4e00 + i) + cur;
        alts.push(cur);
      }
      return `(?:${alts.join('|')})`;
    };
    const ds28Sp4Ex1r = `${mkDsAsc(28)}q[\u03b3-\u03b4]+,?[\u03b3-\u03b4]+(?:\u03b5|\u03b6|\u03b7|\u03b8)`;
    const ds28Sp2Cap1r = `${mkDsAsc(28)}q(([\u03b3-\u03b4]))+,?[\u03b3-\u03b4]+\u03b5`;
    const ds20Sp4Ex1r = `${mkDsAsc(20)}q[\u03b3-\u03b4]+,?[\u03b3-\u03b4]+(?:\u03b5|\u03b6|\u03b7|\u03b8)`;
    const ds28Sp1Ex1r = `${mkDsAsc(28)}q[\u03b3-\u03b4]+,?[\u03b3-\u03b4]+\u03b5`;
    const ds8Sp4Ex1r = `${mkDsAsc(8)}q[\u03b3-\u03b4]+,?[\u03b3-\u03b4]+(?:\u03b5|\u03b6|\u03b7|\u03b8)`;
    const ds5Sp1Ex1r = `${mkDsAsc(5)}q[\u03b3-\u03b4]+,?[\u03b3-\u03b4]+\u03b5`;
    const ds4Sp4Ex1r = `${mkDsAsc(4)}q[\u03b3-\u03b4]+,?[\u03b3-\u03b4]+(?:\u03b5|\u03b6|\u03b7|\u03b8)`;
    const abc3Sp1Ex1r = '(?:a|b|c){3}q[\u03b3-\u03b4]+,?[\u03b3-\u03b4]+\u03b5';

    for (const pattern of [
      ds28Sp4Ex1r,
      ds28Sp2Cap1r,
      ds20Sp4Ex1r,
      ds28Sp1Ex1r,
      ds8Sp4Ex1r,
      ds5Sp1Ex1r,
      ds4Sp4Ex1r,
      abc3Sp1Ex1r,
    ]) {
      expect(pattern.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`R12-2 single ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    for (const es25Pat of [`(?-i:${ds28Sp4Ex1r})`, `(?<g>ok)|(?<g>${ds28Sp1Ex1r})`]) {
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 R12-2 ${es25Pat.slice(0, 30)} rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    const ex12Na =
      '([\u03b5-\u03b6])|([\u03b7-\u03b8])|([\u03b9-\u03ba])|([\u03bb-\u03bc])|([\u03bd-\u03be])|([\u03bf-\u03c0])|[\u03c1-\u03c2]|[\u03c4-\u03c5]|[\u03c6-\u03c7]|[\u03c8-\u03c9]|[\u03ca-\u03cb]|[\u03d2-\u03d3]';
    const ex12Asc =
      '([e-f])|([g-h])|([i-j])|([k-l])|([m-n])|([o-p])|[q-r]|[s-t]|[u-v]|[w-x]|[y-z]|[0-1]';
    const wb2Ds21Asc = `${mkDsAsc(21)}q(([c-d]))+(?:${ex12Asc})`;
    const wb2Ds21Cjk = `${mkDsCjk(21)}q(([\u03b3-\u03b4]))+(?:${ex12Na})`;
    const wb2Abc11 = `(?:abc){1,11}q(([\u03b3-\u03b4]))+(?:${ex12Na})`;
    const ds18Alt24 =
      `${mkDsAsc(18)}q(?:${Array.from({ length: 24 }, (_, i) => `[\u03b3-\u03b4]+${String.fromCharCode(0x5100 + i)}`).join('|')})`;
    const ds14Alt28 =
      `${mkDsAsc(14)}q(?:${Array.from({ length: 28 }, (_, i) => `[\u03b3-\u03b4]+${String.fromCharCode(0x5100 + i)}`).join('|')})`;
    const ds18Alt20Bridge =
      `${mkDsAsc(18)}q(?:${Array.from({ length: 20 }, (_, i) => `p[\u03b3-\u03b4]+${String.fromCharCode(0x5100 + i)}`).join('|')})`;
    const ex10AscShort = '[e-f]|[g-h]|[i-j]|[k-l]|[m-n]|[o-p]|[q-r]|[s-t]|[u-v]|[w-x]';
    const q6Alt10Nl2Cap =
      `q(?:${Array.from({ length: 6 }, (_, i) => `${i === 0 ? '(([\u03b3-\u03b4]))+' : '[\u03b3-\u03b4]+'}(?:${ex10AscShort})`).join('|')})`;
    const ds4Sp1Ex = `${mkDsAsc(4)}q[\u03b3-\u03b4]+,?[\u03b3-\u03b4]+\u03b5`;
    const ds2Sp1Ex = `${mkDsAsc(2)}q[\u03b3-\u03b4]+,?[\u03b3-\u03b4]+\u03b5`;

    const r12PackBudgetCases: Array<{ name: string; patterns: string[] }> = [
      { name: '200x WB2_DS21_asc_12nl_2cap', patterns: Array.from({ length: 200 }, () => wb2Ds21Asc) },
      { name: '200x WB2_DS21_cjk_12nl_2cap', patterns: Array.from({ length: 200 }, () => wb2Ds21Cjk) },
      { name: '200x WB2_abc11_12nl_2cap', patterns: Array.from({ length: 200 }, () => wb2Abc11) },
      { name: '200x DS18_24alt_1ex', patterns: Array.from({ length: 200 }, () => ds18Alt24) },
      { name: '200x DS14_28alt_1ex', patterns: Array.from({ length: 200 }, () => ds14Alt28) },
      { name: '200x DS18_20alt_pbridge', patterns: Array.from({ length: 200 }, () => ds18Alt20Bridge) },
      { name: '200x q_6alt_10nl_2cap', patterns: Array.from({ length: 200 }, () => q6Alt10Nl2Cap) },
      { name: '3x DS2_sp_1ex', patterns: [ds2Sp1Ex, ds2Sp1Ex, ds2Sp1Ex] },
    ];
    for (const { name, patterns } of r12PackBudgetCases) {
      assertPlainErrorPackReject(name, patterns, /aggregate regular expression complexity budget/i);
    }
    // Strengthened in R13-2: multi-start DS4_sp_1ex (startBranchesReachingU=4 > 1, uPrePaths=4 > 2) is rejected single-rule,
    // while DS2_sp_1ex (costWeight = 102) fits up to 2 rules and rejects 3 rules via aggregate budget.
    expectUnsafeRegexRejected(ds4Sp1Ex);
    assertPlainErrorPackReject('2x DS4_sp_1ex (single-rule rejected)', [ds4Sp1Ex, ds4Sp1Ex], /unsafe regular expression/i);
    expectSafeRegexAccepted(ds2Sp1Ex);
    expect(validateRulePack(packWithRegex(ds2Sp1Ex)).keywords).toHaveLength(1);

    // 4. Positive guarantees: 45/45 DEFAULT_CLOUD_KEYWORDS exact 243/250 (+7 accept / +8 reject), 200x packs, & safe idioms
    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);
    for (const cloudId of [
      'cloud-follow-fr-1',
      'cloud-follow-de-1',
      'cloud-crypto-airdrop-1',
      'cloud-scam-support-1',
      'cloud-scam-fr-1',
      'cloud-scam-ru-1',
    ]) {
      const rule = DEFAULT_CLOUD_KEYWORDS.find((k) => k.id === cloudId);
      expect(rule, `Expected cloud rule ${cloudId}`).toBeDefined();
      expectSafeRegexAccepted(rule!.pattern);
      expect(Object.keys(checkRegexSafety(rule!.pattern))).toEqual(['safe']);
    }
    const pad7 = Array.from({ length: 7 }, (_, i) => ({
      id: `r12-pad-${i}`,
      pattern: `r12_pad_token_${i}`,
      isRegex: true,
      scopes: ['text'] as KeywordMatchScope[],
      enabled: true,
    }));
    expect(validateRulePack(makeValidPack({ keywords: [...DEFAULT_CLOUD_KEYWORDS, ...pad7] })).keywords).toHaveLength(52);
    assertPlainErrorPackReject(
      'DEFAULT_CLOUD_KEYWORDS + 8 pad (251/250)',
      [...DEFAULT_CLOUD_KEYWORDS.map((k) => k.pattern), ...pad7.map((p) => p.pattern), 'r12_pad_token_7'],
      /aggregate regular expression complexity budget/i
    );

    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r12-lin-${i}`,
        pattern: `\\bclean_r12_linear_${i}\\s+signal\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(linear200Pack)).keywords).toHaveLength(200);

    const english150Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r12-eng-${i}`,
        pattern: `verified editorial digest number ${String(i).padStart(3, '0')} covering open protocol maintenance updates and public community engineering notes with clear prose`.slice(0, 150),
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(english150Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(english150Pack)).keywords).toHaveLength(200);

    const r12PositiveSafePatterns = [
      'foo\\s*,?\\s*bar',
      'foos?\\s*,?\\s*bar',
      '(?:foo|bar)\\s*,?\\s*baz',
      'pre[m-n]+;?[m-n]+post',
      '((?:c|d)q)a+b',
      'pre(?:foo|bar|baz|qux)+end',
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      '[a-z0-9.-]+\\.[a-z]{2,}\\.[a-z]{2,}',
      '(?:(?!foo|bar).)+',
      '(?:http://|https://)+',
      '.*https?://[\\w.-]+',
      'a+ba+$',
      'a+b*ca+$',
      '(?:ab)+xyz(?:ab)+$',
      pairs14.map(([a, b]) => `${a}+${a}${b}+`).join('') + 'Z',
      'a+c[ab]b+',
      'a+(?:b|c)b+',
      pairs14.slice(0, 10).map(([a, b]) => `${a}+(?:${a}|!)${b}+`).join('') + 'Z',
      'a+(?:ab|cb)+',
    ];
    for (const pattern of r12PositiveSafePatterns) {
      expectSafeRegexAccepted(pattern);
      expect(Object.keys(checkRegexSafety(pattern))).toEqual(['safe']);
    }
    // ES2025 genuinely disjoint case-sensitive control under (?-i:...)
    const es25SafeDisjoint = '(?-i:!a+[AB]b+c+[CD]d+e+[EF]f+g+[GH]h+i+[IJ]j+Z)';
    expect(checkRegexSafety(es25SafeDisjoint)).toEqual({ safe: true });
    expect(Object.keys(checkRegexSafety(es25SafeDisjoint))).toEqual(['safe']);
  });

  it('Group 21: closes all Round 12 Challenger 1 (BUG-R12-1..3) and Challenger 2 (R12-BUG-1..2) findings via automata-native fixes R13-1..R13-3', () => {
    const assertPlainErrorPackReject = (name: string, patterns: string[], expectedMatch: RegExp): void => {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, i) => ({
          id: `r13-kw-${i}`,
          pattern,
          isRegex: true,
          scopes: ['text'] as KeywordMatchScope[],
          enabled: true,
        })),
      });
      let caught: unknown;
      try {
        validateRulePack(pack);
      } catch (err) {
        caught = err;
      }
      expect(caught, `Expected R13 pack rejection "${name}"`).toBeInstanceOf(Error);
      expect(caught, `Expected plain Error (not SyntaxError) for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((caught as Error).message).toMatch(expectedMatch);

      let strCaught: unknown;
      try {
        validateRulePack(JSON.stringify(pack));
      } catch (err) {
        strCaught = err;
      }
      expect(strCaught, `Expected R13 JSON-string pack rejection "${name}"`).toBeInstanceOf(Error);
      expect(strCaught, `Expected plain Error (not SyntaxError) on JSON string for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((strCaught as Error).message).toMatch(expectedMatch);

      let serCaught: unknown;
      try {
        serializeRulePack(pack);
      } catch (err) {
        serCaught = err;
      }
      expect(serCaught, `Expected serializeRulePack R13 rejection "${name}"`).toBeInstanceOf(Error);
      expect(serCaught, `Expected plain Error (not SyntaxError) on serialize for "${name}"`).not.toBeInstanceOf(SyntaxError);
      expect((serCaught as Error).message).toMatch(expectedMatch);
    };

    const dsAlphaAsc = 'abcdefghijklmnoprstuvwxyz0123456789';
    const mkDsAsc = (k: number) => {
      const alts: string[] = [];
      let cur = '';
      for (let i = 0; i < k; i++) {
        cur = dsAlphaAsc[i]! + cur;
        alts.push(cur);
      }
      return `(?:${alts.join('|')})`;
    };
    const mkDsContig = (base: number, k: number) => {
      const alts: string[] = [];
      let cur = '';
      for (let i = 0; i < k; i++) {
        cur = String.fromCharCode(base + i) + cur;
        alts.push(cur);
      }
      return `(?:${alts.join('|')})`;
    };
    const mkUt28Contig = (qBase: number, dEnd: number) => {
      const branches: string[] = [];
      for (let i = 0; i < 28; i++) {
        const qi = String.fromCharCode(qBase + i);
        const rangeLo = String.fromCharCode(qBase + i + 1);
        const rangeHi = String.fromCharCode(dEnd);
        branches.push(`${qi}[${rangeLo}-${rangeHi}]+`);
      }
      return `(?:${branches.join('|')})`;
    };

    // 1. R13-1 (Challenger 1 BUG-R12-1): upper-triangular disjoint-start parallel cycles + complex non-ASCII exits + preMult
    const r12b1Ds18 = mkDsContig(0x4e1c, 18);
    const r12b1Ut28 = mkUt28Contig(0x4e00, 0x4e2d);
    const r12b1SrDs18Amb3Bmp = `${r12b1Ds18}(?:z|z){3}${r12b1Ut28}(?:[\u0100-\u024f]|[\u0370-\u04ff]|\u5204|\u5205|\u5206)`;
    const r12b1Ds18Cjk = `${r12b1Ds18}${r12b1Ut28}(?:[\u5200-\u5201]|[\u5202-\u5203]|\u5204|\u5205|\u5206)`;
    const r12b1Ds18Bmp = `${r12b1Ds18}${r12b1Ut28}(?:[\u0100-\u024f]|[\u0370-\u04ff]|\u5204|\u5205|\u5206)`;
    const r12b1Ds19Bmp = `${mkDsContig(0x4e1c, 19)}${mkUt28Contig(0x4e00, 0x4e2e)}(?:[\u0100-\u024f]|[\u0370-\u04ff]|\u5204|\u5205|\u5206)`;

    for (const pattern of [r12b1SrDs18Amb3Bmp, r12b1Ds18Cjk, r12b1Ds18Bmp, r12b1Ds19Bmp]) {
      expect(pattern.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`R13-1 BUG-R12-1 ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    for (const es25Pat of [`(?-i:${r12b1SrDs18Amb3Bmp})`, `(?<g>ok)|(?<g>${r12b1SrDs18Amb3Bmp})`]) {
      expect(es25Pat.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 BUG-R12-1 rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 2. R13-2 (Challenger 1 BUG-R12-2 & Challenger 2 R12-BUG-1): validateSafePunctPair startBranchesReachingU & complex non-ASCII
    const mkCjk32 = (base: number) =>
      '[' + Array.from({ length: 32 }, (_, i) => String.fromCharCode(base + i * 2)).join('') + ']';
    const cyc32 = mkCjk32(0x4e00);
    const ex32_0 = mkCjk32(0x5000);
    const ex32_1 = mkCjk32(0x5100);
    const ex32_2 = mkCjk32(0x5200);
    const ex32_3 = mkCjk32(0x5300);

    const r12b2SpDs4AllBmp = `${mkDsAsc(4)}q[\u0100-\u024f]+,?[\u0100-\u024f]+[\u0370-\u04ff]`;
    const r12b2SpDs3AllBmp = `${mkDsAsc(3)}q[\u0100-\u024f]+,?[\u0100-\u024f]+[\u0370-\u04ff]`;
    const r12b2SpDs2AllBmp = `${mkDsAsc(2)}q[\u0100-\u024f]+,?[\u0100-\u024f]+[\u0370-\u04ff]`;
    const spDs2Bmp = `${mkDsAsc(2)}q[\u4e00-\u4e01]+,?[\u4e00-\u4e01]+[\u0100-\u024f]`;
    const r12b1Ds4SpCjk32 = `${mkDsAsc(4)}q${cyc32}+,?${cyc32}+${ex32_0}`;
    const r12b1Ds2SpCjk32_4Ex = `${mkDsAsc(2)}q${cyc32}+,?${cyc32}+(?:${ex32_0}|${ex32_1}|${ex32_2}|${ex32_3})`;
    const r12b1Ds2SpCjk32 = `${mkDsAsc(2)}q${cyc32}+,?${cyc32}+${ex32_0}`;

    for (const pattern of [
      r12b2SpDs4AllBmp,
      r12b2SpDs3AllBmp,
      r12b2SpDs2AllBmp,
      spDs2Bmp,
      r12b1Ds4SpCjk32,
      r12b1Ds2SpCjk32_4Ex,
      r12b1Ds2SpCjk32,
    ]) {
      expect(pattern.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`R13-2 single ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    assertPlainErrorPackReject('4x R12B2_SP_DS2_allbmp', Array.from({ length: 4 }, () => r12b2SpDs2AllBmp), /unsafe regular expression/i);
    assertPlainErrorPackReject('4x SP_DS2_bmp', Array.from({ length: 4 }, () => spDs2Bmp), /unsafe regular expression/i);
    assertPlainErrorPackReject('4x R12B1_DS2_sp_cjk32', Array.from({ length: 4 }, () => r12b1Ds2SpCjk32), /unsafe regular expression/i);
    for (const es25Pat of [
      `(?-i:${r12b2SpDs4AllBmp})`,
      `(?-i:${r12b2SpDs2AllBmp})`,
      `(?<g>ok)|(?<g>${r12b2SpDs2AllBmp})`,
      `(?-i:${r12b1Ds4SpCjk32})`,
      `(?<g>ok)|(?<g>${r12b1Ds2SpCjk32})`,
    ]) {
      expect(es25Pat.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 R13-2 rejected: ${es25Pat.slice(0, 30)}`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 3. R13-1 aggregate disjoint-branch work (Challenger 2 R12-BUG-2): SB20_na_0cap_12nl8c & SB19_multi4_12nl8c
    const ex12Na8c =
      '([\u03b5-\u03b6])|([\u03b7-\u03b8])|([\u03b9-\u03ba])|([\u03bb-\u03bc])|([\u03bd-\u03be])|([\u03bf-\u03c0])|([\u03c1-\u03c2])|([\u03c4-\u03c5])|[\u03c6-\u03c7]|[\u03c8-\u03c9]|[\u03ca-\u03cb]|[\u03d2-\u03d3]';
    const mkSplitBranches = (k: number, multiCount: number) => {
      const branches: string[] = [];
      let cur = '';
      for (let i = 0; i < k; i++) {
        cur = dsAlphaAsc[i]! + cur;
        const body = i < multiCount ? '(?:[\u03b3-\u03b4]w)+' : '[\u03b3-\u03b4]+';
        branches.push(`${cur}${body}`);
      }
      return `(?:${branches.join('|')})(?:${ex12Na8c})`;
    };
    const sb20Na0Cap12Nl8c = mkSplitBranches(20, 0);
    const sb19Multi4_12Nl8c = mkSplitBranches(19, 4);
    expect(sb20Na0Cap12Nl8c.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
    expect(sb19Multi4_12Nl8c.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);

    assertPlainErrorPackReject(
      '200x SB20_na_0cap_12nl8c',
      Array.from({ length: 200 }, () => sb20Na0Cap12Nl8c),
      /aggregate regular expression complexity budget/i
    );
    assertPlainErrorPackReject(
      '135x SB20_na_p135_sync88KB',
      Array.from({ length: 135 }, () => sb20Na0Cap12Nl8c),
      /aggregate regular expression complexity budget/i
    );
    assertPlainErrorPackReject(
      '200x SB19_multi4_12nl8c',
      Array.from({ length: 200 }, () => sb19Multi4_12Nl8c),
      /aggregate regular expression complexity budget/i
    );
    const sb20Es25Mod = `(?-i:${sb20Na0Cap12Nl8c})`;
    expect(sb20Es25Mod.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
    expect(checkRegexSafety(sb20Es25Mod)).toEqual({ safe: true });
    let runtimeSupportsEs25Modifiers = false;
    try {
      new RegExp('(?-i:a)', 'i');
      runtimeSupportsEs25Modifiers = true;
    } catch {
      // Runtime V8 does not enable ES2025 inline modifiers
    }
    assertPlainErrorPackReject(
      '200x ES25 SB20_na_0cap_12nl8c',
      Array.from({ length: 200 }, () => sb20Es25Mod),
      runtimeSupportsEs25Modifiers
        ? /aggregate regular expression complexity budget/i
        : /not a valid regular expression/i
    );

    // 4. R13-3 semantic preservation: safe BUG-R12-3 patterns remain accepted while unsafe P1_L250 remains rejected
    const r12b3P8L31 = `(?:${['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((c) => `${c}{1,31}|${c}{1,31}`).join('|')})(?:x|y|z)?`;
    const r12b3P12L20 = `(?:${['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map((c) => `${c}{1,20}|${c}{1,20}`).join('|')})(?:x|y|z)?`;
    const r12b3P1L250 = '(?:a{1,250}|a{1,250})(?:x|y|z)';
    expectSafeRegexAccepted(r12b3P8L31);
    expectSafeRegexAccepted(r12b3P12L20);
    expectUnsafeRegexRejected(r12b3P1L250);

    // 5. Positive guarantees: 45/45 DEFAULT_CLOUD_KEYWORDS exact 243/250 (+7 ok / +8 plain Error), cloud-follow-fr-1 exact 51, 200x packs, safe idioms
    for (const kw of DEFAULT_CLOUD_KEYWORDS) {
      expectSafeRegexAccepted(kw.pattern);
      expect(Object.keys(checkRegexSafety(kw.pattern))).toEqual(['safe']);
    }
    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);

    const pad7 = Array.from({ length: 7 }, (_, i) => ({
      id: `r13-pad-${i}`,
      pattern: `r13_pad_token_${i}`,
      isRegex: true,
      scopes: ['text'] as KeywordMatchScope[],
      enabled: true,
    }));
    expect(validateRulePack(makeValidPack({ keywords: [...DEFAULT_CLOUD_KEYWORDS, ...pad7] })).keywords).toHaveLength(52);
    assertPlainErrorPackReject(
      'DEFAULT_CLOUD_KEYWORDS + 8 pad (251/250)',
      [...DEFAULT_CLOUD_KEYWORDS.map((k) => k.pattern), ...pad7.map((p) => p.pattern), 'r13_pad_token_7'],
      /aggregate regular expression complexity budget/i
    );

    // Exact cost 51 check on cloud-follow-fr-1 (4 * 51 + 46 = 250 accept, 4 * 51 + 47 = 251 reject)
    const frRule = DEFAULT_CLOUD_KEYWORDS.find((k) => k.id === 'cloud-follow-fr-1')!;
    const frPad46 = Array.from({ length: 46 }, (_, i) => `r13_fr_pad_${i}`);
    expect(
      validateRulePack(
        makeValidPack({
          keywords: [frRule.pattern, frRule.pattern, frRule.pattern, frRule.pattern, ...frPad46].map((pattern, i) => ({
            id: `fr-ok-${i}`,
            pattern,
            isRegex: true,
            scopes: ['text'] as KeywordMatchScope[],
            enabled: true,
          })),
        })
      ).keywords
    ).toHaveLength(50);
    assertPlainErrorPackReject(
      '4x cloud-follow-fr-1 + 47 pad (251/250)',
      [frRule.pattern, frRule.pattern, frRule.pattern, frRule.pattern, ...frPad46, 'r13_fr_pad_46'],
      /aggregate regular expression complexity budget/i
    );

    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r13-lin-${i}`,
        pattern: `\\bclean_r13_linear_${i}\\s+signal\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(linear200Pack)).keywords).toHaveLength(200);

    const english200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r13-eng-${i}`,
        pattern: `verified editorial digest number ${String(i).padStart(3, '0')} covering open protocol maintenance updates and public community engineering notes with clear prose`.slice(0, 150),
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(english200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(english200Pack)).keywords).toHaveLength(200);

    const r13SafeIdioms = [
      'foo\\s*,?\\s*bar',
      'foos?\\s*,?\\s*bar',
      '(?:foo|bar)\\s*,?\\s*baz',
      'pre[m-n]+;?[m-n]+post',
      '[a-z0-9.-]+\\.[a-z]{2,}\\.[a-z]{2,}',
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      '(?:(?!foo|bar).)+',
      '(?:http://|https://)+',
      '.*https?://[\\w.-]+',
    ];
    for (const pattern of r13SafeIdioms) {
      expectSafeRegexAccepted(pattern);
      expect(Object.keys(checkRegexSafety(pattern))).toEqual(['safe']);
    }
  });

  it('Group 22: closes all Round 13 Secondary Reviewer (F1-R13), Challenger 1 (BUG-R13-1..4), and Challenger 2 (R13-BUG-1..3) findings via unified R14-1..R14-4 hardening', () => {
    const assertPlainErrorPackReject = (name: string, patterns: string[], expectedMatch: RegExp): void => {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, i) => ({
          id: `r14-kw-${i}`,
          pattern,
          isRegex: true,
          scopes: ['text'] as KeywordMatchScope[],
          enabled: true,
        })),
      });
      for (const [label, fn] of [
        ['validateRulePack(obj)', () => validateRulePack(pack)],
        ['validateRulePack(str)', () => validateRulePack(JSON.stringify(pack))],
        ['serializeRulePack(pack)', () => serializeRulePack(pack)],
      ] as const) {
        let caught: unknown;
        try {
          fn();
        } catch (err) {
          caught = err;
        }
        expect(caught, `Expected R14 ${label} rejection "${name}"`).toBeInstanceOf(Error);
        expect(caught, `Expected plain Error (not SyntaxError) on ${label} for "${name}"`).not.toBeInstanceOf(SyntaxError);
        expect((caught as Error).message).toMatch(expectedMatch);
      }
    };

    const mkCjk = (base: number, count: number) =>
      '[' + Array.from({ length: count }, (_, i) => String.fromCharCode(base + i * 2)).join('') + ']';
    const mkDsContig = (base: number, k: number) => {
      const alts: string[] = [];
      let cur = '';
      for (let i = 0; i < k; i++) {
        cur = String.fromCharCode(base + i) + cur;
        alts.push(cur);
      }
      return `(?:${alts.join('|')})`;
    };

    const cyc32 = mkCjk(0x4e00, 32);
    const cyc80 = mkCjk(0x4e00, 80);
    const ex8Bmp =
      '[\u0100-\u024f]|[\u0370-\u04ff]|[\u1e00-\u1eff]|[\u1f00-\u1fff]|[\u0100-\u024f]|[\u0370-\u04ff]|[\u1e00-\u1eff]|[\u1f00-\u1fff]';
    const ascC30 = "!#%\x27)+\\-/13579;=?CEGIKMOSUW\\[_\\{~";
    const ascE24 = '"$&(*02468:<DFHJLNPRTV\\]`\\\\|';
    const oddCtrl16 = Array.from({ length: 16 }, (_, i) => String.fromCharCode(i * 2 + 1)).join('');
    const evenCtrl16 = Array.from({ length: 15 }, (_, i) => String.fromCharCode(i * 2 + 2)).join('');
    const asc46 = `[${oddCtrl16}${ascC30}]`;
    const ascE39 = `[${evenCtrl16}${ascE24}]`;
    const asc1 = '!#%+13579;=?EGIKMOSUWY_';
    const asc2 = '"$&*02468<>@DFHJLNPRTVX';
    const cyc0Asc = `[${asc1}]`;
    const ex0Asc = `[${asc2}]`;
    const cyc1m = `[${asc1}\u4e00]`;
    const mkEx1m = (k: number) => `[${asc2}${String.fromCharCode(0x4e01 + k * 0x20)}]`;
    const cyc8m = `[${asc1}\u4e00\u4e02\u4e04\u4e06\u4e08\u4e0a\u4e0c\u4e0e]`;
    const mkEx8m = (k: number) =>
      `[${asc2}${Array.from({ length: 8 }, (_, i) => String.fromCharCode(0x4e01 + k * 0x20 + i * 2)).join('')}]`;

    // 1. Secondary Reviewer F1-R13 (leading / post-leading cycles with complex body / exits)
    const f1LeadCjk32_8Bmp = `${cyc32}+(?:${ex8Bmp})`;
    const f1PostLeadOptA = `a?${cyc32}+(?:${ex8Bmp})`;
    const f1LeadCjk1_8Bmp = `[\u4e00-\u4e01]+(?:${ex8Bmp})`;
    const f1LeadCjk32_2Bmp6Lit = `${cyc32}+(?:[\u0100-\u024f]|[\u0370-\u04ff]|\u5400|\u5401|\u5402|\u5403|\u5404|\u5405)`;
    const f1LeadCjk32_1Bmp = `${cyc32}+[\u0100-\u024f]`;

    for (const pattern of [
      f1LeadCjk32_8Bmp,
      f1PostLeadOptA,
      f1LeadCjk1_8Bmp,
      f1LeadCjk32_2Bmp6Lit,
      f1LeadCjk32_1Bmp,
    ]) {
      expect(pattern.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`F1-R13 ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    for (const es25Pat of [`(?-i:${f1LeadCjk32_8Bmp})`, `(?<g>ok)|(?<g>${f1LeadCjk32_8Bmp})`, `(?-i:${f1LeadCjk32_1Bmp})`]) {
      expect(es25Pat.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 F1-R13 rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 2. Challenger 1 BUG-R13-1 & Challenger 2 R13-BUG-1 (multi-range ASCII/mixed classes & self-overlapping single-start prefix in validateSafePunctPair)
    const r13b1AbaqAsc30 = `a(?:ba)?q[${ascC30}]+,?[${ascC30}]+[${ascE24}]`;
    const r13b1AbaqAsc46 = `a(?:ba)?q${asc46}+,?${asc46}+${ascE39}`;
    const r13b1PlainQAsc46 = `q${asc46}+,?${asc46}+${ascE39}`;
    const r13b1Ds2Asc30 = `(?:ba|a)q[${ascC30}]+,?[${ascC30}]+[${ascE24}]`;
    const b1AbaC8m4Ex = `a(?:ba)?q${cyc8m}+,?${cyc8m}+(?:${mkEx8m(0)}|${mkEx8m(1)}|${mkEx8m(2)}|${mkEx8m(3)})`;
    const mechSpAba1na4Ex = `a(?:ba)?q${cyc1m}+,?${cyc1m}+(?:${mkEx1m(0)}|${mkEx1m(1)}|${mkEx1m(2)}|${mkEx1m(3)})`;
    const mechSp0Pref1na = `q${cyc1m}+,?${cyc1m}+${mkEx1m(0)}`;
    const selfOverlapPre3 = 'a(?:ba(?:ba)?)?q[m-n]+,?[m-n]+z';

    for (const pattern of [
      r13b1AbaqAsc30,
      r13b1AbaqAsc46,
      r13b1PlainQAsc46,
      r13b1Ds2Asc30,
      b1AbaC8m4Ex,
      mechSpAba1na4Ex,
      mechSp0Pref1na,
      selfOverlapPre3,
    ]) {
      expect(pattern.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`R14-3 SP ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    // Self-overlapping single-start prefix a(?:ba)?q on simple class costs 102 (2x=204 ok, 3x=306 > 250 rejected)
    const simpleAbaqSp = 'a(?:ba)?q[m-n]+,?[m-n]+z';
    expectSafeRegexAccepted(simpleAbaqSp);
    expect(
      validateRulePack(
        makeValidPack({
          keywords: [simpleAbaqSp, simpleAbaqSp].map((pattern, i) => ({
            id: `abaq-ok-${i}`,
            pattern,
            isRegex: true,
            scopes: ['text'] as KeywordMatchScope[],
            enabled: true,
          })),
        })
      ).keywords
    ).toHaveLength(2);
    assertPlainErrorPackReject(
      '3x a(?:ba)?q[m-n]+,?[m-n]+z (306/250)',
      [simpleAbaqSp, simpleAbaqSp, simpleAbaqSp],
      /aggregate regular expression complexity budget/i
    );
    for (const es25Pat of [
      `(?-i:${r13b1AbaqAsc30})`,
      `(?<g>ok)|(?<g>${r13b1AbaqAsc30})`,
      `(?-i:${b1AbaC8m4Ex})`,
      `(?-i:${mechSp0Pref1na})`,
    ]) {
      expect(es25Pat.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 R14-3 rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 3. Challenger 1 BUG-R13-2 & Challenger 2 R13-BUG-2 (non-leading preMult < 4 & complex-class cliffs)
    const ds20 = mkDsContig(0x6000, 20);
    const ds21 = mkDsContig(0x6000, 21);
    const r13b2Ds20M3Asc46 = `${ds20}(?:z|z|z)q${asc46}+(?:${ascE39}|${ascE39}|\u5204|\u5205|\u5206)`;
    const r13b2Abc11M3Asc30 = `(?:abc){1,11}(?:z|z|z)q[${ascC30}]+(?:[${ascE24}]|[${ascE24}]|\u5204|\u5205|\u5206)`;
    const a1Ds21M3C8m = `${ds21}(?:z|z|z)q${cyc8m}+(?:${mkEx8m(0)}|${mkEx8m(1)}|\u5204|\u5205|\u5206)`;
    const a1Ds21M3PureAsc = `${ds21}(?:z|z|z)q${cyc0Asc}+(?:${ex0Asc}|${ex0Asc}|\u5204|\u5205|\u5206)`;
    const hole2Ds21Pre3Simple = `${ds21}(?:z|z|z)q[\u03b3-\u03b4]+(?:[\u03b5-\u03b6]|[\u03b7-\u03b8]|\u5400|\u5401|\u5402)`;
    const hole1Pre3Asc30 = `(?:cba|ba|a)q(([${ascC30}]))+(?:${Array(12).fill(`[${ascE24}]`).join('|')})`;

    for (const pattern of [r13b2Ds20M3Asc46, r13b2Abc11M3Asc30, a1Ds21M3C8m, a1Ds21M3PureAsc]) {
      expect(pattern.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`R14-4 single ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    assertPlainErrorPackReject('200x R13B2_DS20_m3_asc46', Array.from({ length: 200 }, () => r13b2Ds20M3Asc46), /unsafe regular expression/i);
    assertPlainErrorPackReject('80x A1_DS21_m3_c8m_sync', Array.from({ length: 80 }, () => a1Ds21M3C8m), /unsafe regular expression/i);
    assertPlainErrorPackReject(
      '200x R13B2_abc11_m3_asc30_sync',
      Array.from({ length: 200 }, () => r13b2Abc11M3Asc30),
      /unsafe regular expression/i
    );
    assertPlainErrorPackReject(
      '200x HOLE2_DS21_pre3_simple',
      Array.from({ length: 200 }, () => hole2Ds21Pre3Simple),
      /aggregate regular expression complexity budget/i
    );
    assertPlainErrorPackReject(
      '2x HOLE1_pre3_asc30_12ex',
      [hole1Pre3Asc30, hole1Pre3Asc30],
      /aggregate regular expression complexity budget/i
    );
    for (const es25Pat of [`(?-i:${a1Ds21M3C8m})`, `(?-i:${r13b2Ds20M3Asc46})`, `(?-i:${r13b2Abc11M3Asc30})`]) {
      expect(es25Pat.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 R14-4 rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 4. Challenger 1 BUG-R13-3 & Challenger 2 R13-BUG-3 (leading cycles with complex ASCII/mixed/BMP classes + leading non-lit exit scaling)
    const r13b3Lead2Asc46 = `(?:${asc46}+(?:${ascE39}|${ascE39})|${asc46}+(?:${ascE39}|${ascE39}))`;
    const r13b3Lead2Asc30 = `(?:[${ascC30}]+(?:[${ascE24}]|[${ascE24}])|[${ascC30}]+(?:[${ascE24}]|[${ascE24}]))`;
    const r13b3Lead1Asc46 = `${asc46}+(?:${ascE39}|${ascE39}|0|2|4|6|8|<)`;
    const r13b3Lead1Asc30 = `[${ascC30}]+(?:[${ascE24}]|[${ascE24}]|0|2|4|6|8|<)`;
    const cLead2CycC8m2Ex = `(?:${cyc8m}+(?:${mkEx8m(0)}|${mkEx8m(1)})|${cyc8m}+(?:${mkEx8m(2)}|${mkEx8m(3)}))`;
    const cLead1CycC8m2Ex = `${cyc8m}+(?:${mkEx8m(0)}|${mkEx8m(1)})`;
    const c7_2LeadBmp2Ex6l =
      '(?:[\u0100-\u024f\u0370-\u03ff\u0400-\u04ff]+(?:[\u0530-\u058f\u2c00-\u2c5f]|[\u10a0-\u10ff\ua640-\ua69f]|a|b|c|d|e|f)|[\u0100-\u024f\u0370-\u03ff\u0400-\u04ff]+(?:[\u1e00-\u1eff]|[\u1f00-\u1fff]|g|h|i|j|k|l))';
    const c5Lead2Cyc80 = `(?:${cyc80}+a|${cyc80}+b)`;
    const cLead2CycPureAsc2Ex = `(?:${cyc0Asc}+(?:${ex0Asc}|${ex0Asc})|${cyc0Asc}+(?:${ex0Asc}|${ex0Asc}))`;
    const lead1Cjk1_8Space = '[\u4e00-\u4e01]+(?:\\s|\\s|\\s|\\s|\\s|\\s|\\s|\\s)';
    const mix2_8 = '[!#\u4e00\u4e02\u4e04\u4e06\u4e08\u4e0a\u4e0c\u4e0e]';
    const mix2_8e = '["$\u4e01\u4e03\u4e05\u4e07\u4e09\u4e0b\u4e0d\u4e0f]';
    const lead2Mix2_8_2Ex = `(?:${mix2_8}+(?:${mix2_8e}|${mix2_8e})|${mix2_8}+(?:${mix2_8e}|${mix2_8e}))`;

    for (const pattern of [
      r13b3Lead2Asc46,
      r13b3Lead2Asc30,
      r13b3Lead1Asc46,
      r13b3Lead1Asc30,
      cLead2CycC8m2Ex,
      cLead1CycC8m2Ex,
      c7_2LeadBmp2Ex6l,
      c5Lead2Cyc80,
      cLead2CycPureAsc2Ex,
      lead1Cjk1_8Space,
      lead2Mix2_8_2Ex,
      '\\S+[\u0100-\u024f]',
      '.+[\u0100-\u024f]',
      `\\S+${asc46}`,
      `${cyc32}+\\s`,
      `${asc46}+z`,
      `${cyc8m}+z`,
    ]) {
      expect(pattern.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`R14-2 lead ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    assertPlainErrorPackReject('4x R13B3_LEAD1_asc30', Array.from({ length: 4 }, () => r13b3Lead1Asc30), /unsafe regular expression/i);
    for (const es25Pat of [
      `(?-i:${r13b3Lead2Asc46})`,
      `(?-i:${cLead2CycC8m2Ex})`,
      `(?<g>ok)|(?<g>${c7_2LeadBmp2Ex6l})`,
      `(?-i:[^a\u0100-\u024f]+[\u0100-\u024f])`,
      `[^a\u0100-\u024f]+[\u0100-\u024f]`,
    ]) {
      expect(es25Pat.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, `Expected ES2025 R14-2 rejected`).toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 5. Positive guarantees: 45/45 DEFAULT_CLOUD_KEYWORDS exact 243/250, cloud-follow-fr-1 exact 51, 200x packs, safe idioms
    for (const kw of DEFAULT_CLOUD_KEYWORDS) {
      expectSafeRegexAccepted(kw.pattern);
      expect(Object.keys(checkRegexSafety(kw.pattern))).toEqual(['safe']);
    }
    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);

    const pad7 = Array.from({ length: 7 }, (_, i) => ({
      id: `r14-pad-${i}`,
      pattern: `r14_pad_token_${i}`,
      isRegex: true,
      scopes: ['text'] as KeywordMatchScope[],
      enabled: true,
    }));
    expect(validateRulePack(makeValidPack({ keywords: [...DEFAULT_CLOUD_KEYWORDS, ...pad7] })).keywords).toHaveLength(52);
    assertPlainErrorPackReject(
      'R14 DEFAULT_CLOUD_KEYWORDS + 8 pad (251/250)',
      [...DEFAULT_CLOUD_KEYWORDS.map((k) => k.pattern), ...pad7.map((p) => p.pattern), 'r14_pad_token_7'],
      /aggregate regular expression complexity budget/i
    );

    const frRule = DEFAULT_CLOUD_KEYWORDS.find((k) => k.id === 'cloud-follow-fr-1')!;
    const frPad46 = Array.from({ length: 46 }, (_, i) => `r14_fr_pad_${i}`);
    expect(
      validateRulePack(
        makeValidPack({
          keywords: [frRule.pattern, frRule.pattern, frRule.pattern, frRule.pattern, ...frPad46].map((pattern, i) => ({
            id: `r14-fr-ok-${i}`,
            pattern,
            isRegex: true,
            scopes: ['text'] as KeywordMatchScope[],
            enabled: true,
          })),
        })
      ).keywords
    ).toHaveLength(50);
    assertPlainErrorPackReject(
      'R14 4x cloud-follow-fr-1 + 47 pad (251/250)',
      [frRule.pattern, frRule.pattern, frRule.pattern, frRule.pattern, ...frPad46, 'r14_fr_pad_46'],
      /aggregate regular expression complexity budget/i
    );

    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r14-lin-${i}`,
        pattern: `\\bclean_r14_linear_${i}\\s+signal\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(linear200Pack)).keywords).toHaveLength(200);

    const english200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r14-eng-${i}`,
        pattern: `verified engineering bulletin number ${String(i).padStart(3, '0')} summarizing local deterministic automata updates and community safety checks cleanly`.slice(0, 150),
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(english200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(english200Pack)).keywords).toHaveLength(200);

    const r14SafeIdioms = [
      '.*https?://[\\w.-]+',
      '(?:(?!foo|bar).)+',
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      '\\S+foo',
      'foo\\s*,?\\s*bar',
      'foos?\\s*,?\\s*bar',
      '([^\\u00c0-\\u00ff]|\\u0178)+$',
      '(?:http://|https://)+',
    ];
    for (const pattern of r14SafeIdioms) {
      expectSafeRegexAccepted(pattern);
      expect(Object.keys(checkRegexSafety(pattern))).toEqual(['safe']);
    }
  });

  it('Group 23: closes all Round 14 Secondary Reviewer (F1-R14..F3-R14), Challenger 1 (BUG-R14-1..3), and Challenger 2 (R14-BUG-1) findings via surgical R15-1..R15-4 hardening', () => {
    const assertPlainErrorPackReject = (name: string, patterns: string[], expectedMatch: RegExp): void => {
      const pack = makeValidPack({
        keywords: patterns.map((pattern, i) => ({
          id: `r15-kw-${i}`,
          pattern,
          isRegex: true,
          scopes: ['text'] as KeywordMatchScope[],
          enabled: true,
        })),
      });
      for (const [label, fn] of [
        ['validateRulePack(obj)', () => validateRulePack(pack)],
        ['validateRulePack(str)', () => validateRulePack(JSON.stringify(pack))],
        ['serializeRulePack(pack)', () => serializeRulePack(pack)],
      ] as const) {
        let caught: unknown;
        try {
          fn();
        } catch (err) {
          caught = err;
        }
        expect(caught, `Expected R15 ${label} rejection "${name}"`).toBeInstanceOf(Error);
        expect(caught, `Expected plain Error (not SyntaxError) on ${label} for "${name}"`).not.toBeInstanceOf(SyntaxError);
        expect((caught as Error).message).toMatch(expectedMatch);
      }
    };

    const mkFoldDisjoint = (count: number): string => {
      const out: string[] = [];
      let last = -10;
      for (let cp = 0x0100; cp <= 0x2cff && out.length < count; cp++) {
        const ch = String.fromCharCode(cp);
        if (ch.toUpperCase() !== ch.toLowerCase() && cp - last >= 3) {
          out.push(ch);
          last = cp;
        }
      }
      return out.join('');
    };
    const mkCjkStep = (base: number, count: number, offset = 0): string =>
      Array.from({ length: count }, (_, i) => String.fromCharCode(base + i * 2 + offset)).join('');
    const mkDsContig = (base: number, k: number): string => {
      const alts: string[] = [];
      let cur = '';
      for (let i = 0; i < k; i++) {
        cur = String.fromCharCode(base + i) + cur;
        alts.push(cur);
      }
      return `(?:${alts.join('|')})`;
    };
    const mkSc = (base: number, levels: number): string => {
      let cur = '';
      for (let i = 0; i < levels; i++) {
        const a = String.fromCharCode(base + i * 3);
        const b = String.fromCharCode(base + i * 3 + 1);
        const c = String.fromCharCode(base + i * 3 + 2);
        const block = `${a}${b}${c}`;
        cur = cur ? `(?:${cur}${block}|${block}|${b}${c}|${c})` : `(?:${block}|${b}${c}|${c})`;
      }
      return cur;
    };

    const mix2_8_55 = '[02\u5500\u5502\u5504\u5506\u5508\u550a\u550c\u550e]';
    const nl1 = '[46\u4d00\u4d02\u4d04\u4d06\u4d08\u4d0a\u4d0c\u4d0e]';
    const nl2 = '[8<\u4d10\u4d12\u4d14\u4d16\u4d18\u4d1a\u4d1c\u4d1e]';
    const nl3 = '[>@\u4d20\u4d22\u4d24\u4d26\u4d28\u4d2a\u4d2c\u4d2e]';
    const lits7 = '\u5600|\u5601|\u5602|\u5603|\u5604|\u5605|\u5606';

    // 1. F1-R14: leading / post-leading complex exit (*5) & unconditional validateSafePunctPair complex-exit reject
    const exFold300 = `[!#%+1357${mkFoldDisjoint(300)}]`;
    const exFold350 = `[!#%+1357${mkFoldDisjoint(350)}]`;
    const exFold400 = `[!#%+1357${mkFoldDisjoint(400)}]`;
    const f1LeadMixFold350_1Lit = `${mix2_8_55}+(?:${exFold350}|\u5600)`;
    const f1PostLeadFold300_3Nl7Lit = `z?${mix2_8_55}+(?:${exFold300}|${nl1}|${nl2}|${nl3}|${lits7})`;
    const f1LeadMixTinyBmp3Nl7Lit = `${mix2_8_55}+(?:[\u0100-\u024f\u0370-\u04ff\u1e00-\u1eff\u1f00-\u1fff]|${nl1}|${nl2}|${nl3}|${lits7})`;
    const t12Sp7fFold400 = `q[02468<>~]+,?[02468<>~]+${exFold400}`;

    for (const pattern of [
      f1LeadMixFold350_1Lit,
      f1PostLeadFold300_3Nl7Lit,
      f1LeadMixTinyBmp3Nl7Lit,
      t12Sp7fFold400,
    ]) {
      expect(pattern.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`F1-R14 ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }

    // 2. F2-R14 & BUG-R14-2: multi-state cyclic SCC per-state cycleIsComplex (union-collapse & 'unknown'-erasure)
    const oddAscii = '!#%\')+\\-/13579;=?ACEGIKMOQSUW';
    const evenAscii = '"$&(*,.02468:<>@BDFHJLNPRTVX';
    const s1PMix = `[${oddAscii}${mkCjkStep(0x4e00, 24, 0)}]`;
    const s2PMix = `[${evenAscii}${mkCjkStep(0x4e00, 24, 1)}]`;
    const cjk8Below = `[${mkCjkStep(0x4d00, 8, 0)}]`;
    const ds20 = mkDsContig(0x6000, 20);
    const f2NlDs20_2stPMix = `${ds20}\u5300(?:${s1PMix}${s2PMix})+(?:${cjk8Below}|${cjk8Below}|\u5204|\u5205|\u5206)`;

    const cP72E = `[${oddAscii}${mkCjkStep(0x4e00, 32, 0)}\u4e3f]`;
    const cP72O = `[${evenAscii}${mkCjkStep(0x4e00, 32, 1)}]`;
    const mix28E1 = '[\\{\\}\u4f00\u4f02\u4f04\u4f06\u4f08\u4f0a\u4f0c\u4f0e]';
    const mix28E2 = '[\\(\\)\\u4f20\\u4f22\\u4f24\\u4f26\\u4f28\\u4f2a\\u4f2c\\u4f2e]';
    const r14b2Lead2CP72_1r = `(?:(?:${cP72E}${cP72O})+(?:${mix28E1}|y|z|\u5100|\u5101|\u5102|\u5103|\u5104)|(?:${cP72E}${cP72O})+(?:${mix28E2}|\u5105|\u5106|\u5107|\u5108|\u5109|\u510a|\u510b))`;
    const r14b2UnkErase = `(?:[${mkCjkStep(0x4e00, 120, 0)}][^a-z])+z`;

    expect(r14b2Lead2CP72_1r.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
    expectUnsafeRegexRejected(r14b2Lead2CP72_1r);
    assertPlainErrorPackReject('R14B2_lead2_cP72_1r', [r14b2Lead2CP72_1r], /unsafe regular expression/i);
    expect(r14b2UnkErase.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
    expectUnsafeRegexRejected(r14b2UnkErase);
    assertPlainErrorPackReject('R14B2_unkErase', [r14b2UnkErase], /unsafe regular expression/i);
    expect(f2NlDs20_2stPMix.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
    assertPlainErrorPackReject(
      'F2_NL_DS20_2st_pMix_p200',
      Array.from({ length: 200 }, () => f2NlDs20_2stPMix),
      /aggregate regular expression complexity budget|unsafe regular expression/i
    );
    for (const es25Pat of [`(?-i:${r14b2Lead2CP72_1r})`, `(?<g>ok)|(?<g>${r14b2Lead2CP72_1r})`]) {
      expect(es25Pat.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, 'Expected ES2025 R14B2 rejected').toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 3. F3-R14: raw non-ASCII run max in isComplexCharSet (prevents (?-i:...) fold-collapse bypass)
    const es25ModSupported = (() => {
      try {
        new RegExp('(?-i:a)', 'i');
        return true;
      } catch {
        return false;
      }
    })();
    const c16 = '[!#%+1357\u0110\u0112\u0114\u0116\u0118\u011a\u011c\u011e]';
    const e16 = '["$&*0246\u0100\u0102\u0104\u0106\u0108\u010a\u010c\u010e]';
    const f3Es25SpAbaC16_2Ex = `(?-i:a(?:ba)?q${c16}+,?${c16}+(?:${e16}|${e16}))`;
    const f3Es25NlDs20C16 = `(?-i:${ds20}q${c16}+(?:${e16}|${e16}|\u5204|\u5205|\u5206))`;
    expect(f3Es25SpAbaC16_2Ex.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
    const f3SpRes = checkRegexSafety(f3Es25SpAbaC16_2Ex);
    expect(f3SpRes.safe).toBe(false);
    expect(Object.keys(f3SpRes).sort()).toEqual(['reason', 'safe']);
    assertPlainErrorPackReject(
      'F3_ES25_SP_aba_c16_2ex_1r',
      [f3Es25SpAbaC16_2Ex],
      es25ModSupported ? /unsafe regular expression/i : /unsafe regular expression|not a valid regular expression/i
    );
    expect(f3Es25NlDs20C16.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
    assertPlainErrorPackReject(
      'F3_ES25_NL_DS20_c16_p200',
      Array.from({ length: 200 }, () => f3Es25NlDs20C16),
      es25ModSupported
        ? /aggregate regular expression complexity budget|unsafe regular expression/i
        : /aggregate regular expression complexity budget|unsafe regular expression|not a valid regular expression/i
    );

    // 4. BUG-R14-1 & R14-BUG-1: post-leading parallel compatible cluster & preCycleMult pricing
    const ascEx27 = 'EFGHIJKLMNOPQRSTUVW01234567'.split('');
    const mix2_8 = '[!#\u4e00\u4e02\u4e04\u4e06\u4e08\u4e0a\u4e0c\u4e0e]';
    const mix2_8e = '["$\u4e01\u4e03\u4e05\u4e07\u4e09\u4e0b\u4e0d\u4e0f]';
    const plPar27AscMult8 = `a+p(?:x|x)(?:y|y)(?:z|z)q(?:${ascEx27.map((e) => `[c-d]+${e}`).join('|')})`;
    const plPar27AscNoMult = `a+q(?:${ascEx27.map((e) => `[c-d]+${e}`).join('|')})`;
    const a2cPostLeadMix2_8 = `a+p(?:x|x)(?:y|y)(?:z|z)q${mix2_8}+(?:${mix2_8e}|e|f|g|h|i|j|k)`;
    const r14b1Amb8_5Dig = 'a+(?:q|q)(?:r|r)(?:s|s)(?:[0-9]+b|[0-9]+c|[0-9]+d|[0-9]+e|[0-9]+f)';
    const r14b1Amb8_1Mix = `a+(?:q|q)(?:r|r)(?:s|s)${mix2_8}+(?:${mix28E1}|b|c|d|e|f|g|h)`;
    const r14b1Amb1_27Mix = `a+q(?:${ascEx27.map((e) => `${mix2_8}+${e}`).join('|')})`;

    for (const pattern of [
      plPar27AscMult8,
      plPar27AscNoMult,
      a2cPostLeadMix2_8,
      r14b1Amb8_5Dig,
      r14b1Amb8_1Mix,
      r14b1Amb1_27Mix,
    ]) {
      expect(pattern.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      expectUnsafeRegexRejected(pattern);
      assertPlainErrorPackReject(`BUG-R14-1 ${pattern.slice(0, 24)}`, [pattern], /unsafe regular expression/i);
      expect(Object.keys(checkRegexSafety(pattern)).sort()).toEqual(['reason', 'safe']);
    }
    for (const es25Pat of [`(?-i:${plPar27AscMult8})`, `(?<g>ok)|(?<g>${r14b1Amb8_5Dig})`]) {
      expect(es25Pat.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
      const res = checkRegexSafety(es25Pat);
      expect(res.safe, 'Expected ES2025 BUG-R14-1 rejected').toBe(false);
      expect(Object.keys(res).sort()).toEqual(['reason', 'safe']);
    }

    // 5. BUG-R14-3: non-leading preTp >= 12 high-fanout / multi-state cliff
    const sc33 = mkSc(0x6100, 11);
    const r14b3Sc33_2stCP72 = `${sc33}z(?:${cP72E}${cP72O})+(?:${mix28E1}|${mix28E2}|y|\u52d0|\u52d1)`;
    const r14b3Sc33Asc1stMix28 = `${sc33}z${mix2_8}+(?:${mix2_8e}|${mix2_8e}|y|\u52d0|\u52d1)`;

    expect(r14b3Sc33_2stCP72.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
    expect(r14b3Sc33Asc1stMix28.length).toBeLessThanOrEqual(MAX_RULE_PACK_REGEX_LENGTH);
    assertPlainErrorPackReject(
      'R14B3_sc33_2st_cP72_p200',
      Array.from({ length: 200 }, () => r14b3Sc33_2stCP72),
      /aggregate regular expression complexity budget|unsafe regular expression/i
    );
    assertPlainErrorPackReject(
      'R14B3_sc33Asc_1st_mix28_p200_sync',
      Array.from({ length: 200 }, () => r14b3Sc33Asc1stMix28),
      /aggregate regular expression complexity budget/i
    );

    // 6. Positive guarantees: 45/45 DEFAULT_CLOUD_KEYWORDS exact 243/250, cloud-follow-fr-1 exact 51, 200x packs, safe idioms
    for (const kw of DEFAULT_CLOUD_KEYWORDS) {
      expectSafeRegexAccepted(kw.pattern);
      expect(Object.keys(checkRegexSafety(kw.pattern))).toEqual(['safe']);
    }
    const cloud45Pack = makeValidPack({ keywords: DEFAULT_CLOUD_KEYWORDS });
    expect(validateRulePack(cloud45Pack).keywords).toHaveLength(45);
    expect(validateRulePack(serializeRulePack(cloud45Pack)).keywords).toHaveLength(45);

    const pad7 = Array.from({ length: 7 }, (_, i) => ({
      id: `r15-pad-${i}`,
      pattern: `r15_pad_token_${i}`,
      isRegex: true,
      scopes: ['text'] as KeywordMatchScope[],
      enabled: true,
    }));
    expect(validateRulePack(makeValidPack({ keywords: [...DEFAULT_CLOUD_KEYWORDS, ...pad7] })).keywords).toHaveLength(52);
    assertPlainErrorPackReject(
      'R15 DEFAULT_CLOUD_KEYWORDS + 8 pad (251/250)',
      [...DEFAULT_CLOUD_KEYWORDS.map((k) => k.pattern), ...pad7.map((p) => p.pattern), 'r15_pad_token_7'],
      /aggregate regular expression complexity budget/i
    );

    const frRule = DEFAULT_CLOUD_KEYWORDS.find((k) => k.id === 'cloud-follow-fr-1')!;
    const frPad46 = Array.from({ length: 46 }, (_, i) => `r15_fr_pad_${i}`);
    expect(
      validateRulePack(
        makeValidPack({
          keywords: [frRule.pattern, frRule.pattern, frRule.pattern, frRule.pattern, ...frPad46].map((pattern, i) => ({
            id: `r15-fr-ok-${i}`,
            pattern,
            isRegex: true,
            scopes: ['text'] as KeywordMatchScope[],
            enabled: true,
          })),
        })
      ).keywords
    ).toHaveLength(50);
    assertPlainErrorPackReject(
      'R15 4x cloud-follow-fr-1 + 47 pad (251/250)',
      [frRule.pattern, frRule.pattern, frRule.pattern, frRule.pattern, ...frPad46, 'r15_fr_pad_46'],
      /aggregate regular expression complexity budget/i
    );

    const linear200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r15-lin-${i}`,
        pattern: `\\bclean_r15_linear_${i}\\s+signal\\b`,
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(linear200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(linear200Pack)).keywords).toHaveLength(200);

    const english200Pack = makeValidPack({
      keywords: Array.from({ length: 200 }, (_, i) => ({
        id: `r15-eng-${i}`,
        pattern: `verified engineering bulletin number ${String(i).padStart(3, '0')} summarizing deterministic automata updates and community safety checks cleanly`.slice(0, 150),
        isRegex: true,
        scopes: ['text'],
        enabled: true,
      })),
    });
    expect(validateRulePack(english200Pack).keywords).toHaveLength(200);
    expect(validateRulePack(serializeRulePack(english200Pack)).keywords).toHaveLength(200);

    const r15SafeIdioms = [
      '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}',
      '[a-z0-9.-]+\\.[a-z]{2,}\\.[a-z]{2,}',
      '.*https?://[\\w.-]+',
      '.*foo\\s+bar',
      '(?:(?!foo|bar).)+',
      '([^\\u00c0-\\u00ff]|\\u0178)+$',
      '\\w+\\s+\\w+\\s+\\w+\\s+\\w+\\s+\\w+',
      '(?:http://|https://)+',
      'a+ba+$',
      'a+b*ca+$',
      '(?:ab)+xyz(?:ab)+$',
    ];
    for (const pattern of r15SafeIdioms) {
      expectSafeRegexAccepted(pattern);
      expect(Object.keys(checkRegexSafety(pattern))).toEqual(['safe']);
    }
  });

  it('BUG-C2-1 regression: rejects JavaScript Object.prototype property names as rule pack IDs', () => {
    for (const badId of [
      'constructor',
      'toString',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
      'prototype',
      '__proto__',
    ]) {
      const candidate = makeValidPack({ id: badId });
      expect(
        () => validateRulePack(candidate),
        `Expected pack id "${badId}" to be rejected`
      ).toThrow(/Rule pack id/i);
    }
  });
});
