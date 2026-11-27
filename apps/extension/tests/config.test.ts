import { describe, expect, it } from 'vitest';
import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  DEFAULT_CLOUD_KEYWORDS,
  RULE_PACK_FORMAT,
  STORAGE_KEYS,
  SUPPORTED_LOCALES,
} from '@keepxclean/shared';
import {
  applyConfigCommand,
  buildOptionsUrl,
  mergeViewerProfile,
  serialQueue,
} from '../src/background/config';
import { recoverConfig } from '../src/background/repository';
import { ERROR_LOCALES } from '../src/i18n/errors';
import { digest, UI_KEYS } from '../src/services/model';
import {
  validateConfigSilent,
  validateSnapshotSilent,
} from '../src/services/schema';
import {
  normalizeServiceUrl,
  parseAccountQuery,
  validateAccount,
  validateConfig,
  validateDomainRule,
  validateInstalledPack,
  validateKeyword,
  validateSnapshot,
} from '../src/services/validation';
import { mockChrome } from './mock-chrome';

describe('configuration contracts', () => {
  it('merges concurrent semantic writes against the latest config', async () => {
    let config = createDefaultConfig();
    const queue = serialQueue();
    await Promise.all([
      queue(async () => {
        await Promise.resolve();
        config = applyConfigCommand(config, {
          type: 'config.patch',
          patch: { enabled: false },
        });
      }),
      queue(async () => {
        config = applyConfigCommand(config, {
          type: 'config.patch',
          patch: { interceptionMode: 'strip' },
        });
      }),
    ]);
    expect(config.enabled).toBe(false);
    expect(config.interceptionMode).toBe('strip');
  });
  it('keeps the queue usable after a failed write', async () => {
    const queue = serialQueue();
    await expect(
      queue(async () => {
        throw Error('quota');
      })
    ).rejects.toThrow('quota');
    expect(await queue(async () => 42)).toBe(42);
  });
  it('preserves lists, custom words, domains, packs, locale and opt-in privacy when resetting rules', () => {
    const freshDefaults = createDefaultConfig();
    expect(freshDefaults.syncNativeXBlock).toBe(false);
    expect(freshDefaults.enableCrowdReport).toBe(false);
    expect(freshDefaults.onboardingDismissed).toBe(true);

    const config = createDefaultConfig('strict');
    config.interceptionMode = 'strip';
    config.sceneModes = {
      for_you: 'strip',
      following: 'bypass',
      reply: 'collapse',
      search: 'inherit',
    };
    config.locale = 'ja';
    config.theme = 'dark';
    config.enabled = false;
    config.syncNativeXBlock = true;
    config.enableCrowdReport = true;
    config.onboardingDismissed = false;
    config.enabledCloudLangGroups = ['universal', 'ja'];
    config.customApiBaseUrl = 'https://example.com';
    config.localBlocklistUids['1'] = { uid: '1', screenName: '', addedAt: 1 };
    config.rules.keywords.items.push({
      id: 'custom',
      pattern: 'hello',
      scopes: ['text'],
      enabled: true,
      isRegex: false,
    });
    config.rules.domainFilter.enabled = false;
    config.rules.domainFilter.items.push({
      id: 'dom-1',
      domain: 'spam.example',
      enabled: true,
    });
    config.installedPacks = [
      {
        format: RULE_PACK_FORMAT,
        id: 'pack-keep',
        name: 'Keep Pack',
        description: 'Preserved on reset',
        version: '1.0.0',
        updatedAt: '2026-11-20T00:00:00.000Z',
        domains: [{ id: 'pd-1', domain: 'ads.example', enabled: true }],
        enabled: true,
        installedAt: 1000,
      },
    ];
    const next = applyConfigCommand(config, {
      type: 'config.reset',
      expected: digest(config),
    });
    expect(next.preset).toBe('standard');
    expect(next.interceptionMode).toBe('collapse');
    expect(next.sceneModes).toEqual({
      for_you: 'inherit',
      following: 'inherit',
      reply: 'inherit',
      search: 'inherit',
    });
    expect(next.rules.grokFilter.blockShortMentions).toBe(false);
    expect(next.rules.domainFilter.enabled).toBe(true);
    expect(next.rules.domainFilter.items).toEqual(
      config.rules.domainFilter.items
    );
    expect(next.installedPacks).toEqual(config.installedPacks);
    expect(next.locale).toBe('ja');
    expect(next.theme).toBe('dark');
    expect(next.enabled).toBe(false);
    expect(next.localBlocklistUids).toEqual(config.localBlocklistUids);
    expect(next.rules.keywords.items).toEqual(config.rules.keywords.items);
    expect(next.syncNativeXBlock).toBe(true);
    expect(next.enableCrowdReport).toBe(true);
    expect(next.onboardingDismissed).toBe(false);
    expect(next.enabledCloudLangGroups).toEqual(['universal', 'ja']);
    expect(next.customApiBaseUrl).toBe(config.customApiBaseUrl);
  });
  it('rejects stale import previews without modifying current values', () => {
    const current = createDefaultConfig();
    const expected = digest(current);
    current.enabled = false;
    expect(() =>
      applyConfigCommand(current, {
        type: 'config.replace',
        config: createDefaultConfig('strict'),
        expected,
      })
    ).toThrow('preview');
    expect(current.enabled).toBe(false);
  });
  it('edits stable keyword IDs and rejects conflicting editors', () => {
    const base = createDefaultConfig();
    const seed = {
      id: 'kw-seed-1',
      pattern: 'spamword',
      isRegex: false,
      scopes: ['text'] as ('text' | 'bio' | 'name' | 'url')[],
      onlyInReplies: true,
      enabled: true,
    };
    const current = applyConfigCommand(base, {
      type: 'keyword.save',
      item: seed,
    });
    const item = current.rules.keywords.items[0]!;
    expect(item.onlyInReplies).toBe(true);
    const next = applyConfigCommand(current, {
      type: 'keyword.save',
      item: { ...item, note: 'new', onlyInReplies: false },
      expected: digest(item),
    });
    expect(next.rules.keywords.items.length).toBe(
      current.rules.keywords.items.length
    );
    expect(next.rules.keywords.items[0]!.onlyInReplies).toBeUndefined();
    expect(() =>
      applyConfigCommand(next, {
        type: 'keyword.save',
        item,
        expected: digest(item),
      })
    ).toThrow('reopen');
  });
  it('validates languageFilter mode and codes without marking preset custom', () => {
    const base = createDefaultConfig('standard');
    const patched = applyConfigCommand(base, {
      type: 'config.patch',
      patch: {
        locale: 'fr',
        rules: {
          languageFilter: {
            enabled: true,
            mode: 'block',
            languages: ['ar', 'hi'],
          },
        },
      },
    });
    expect(patched.preset).toBe('standard');
    expect(patched.locale).toBe('fr');
    expect(patched.rules.languageFilter).toEqual({
      enabled: true,
      mode: 'block',
      languages: ['ar', 'hi'],
    });
    expect(() =>
      applyConfigCommand(base, {
        type: 'config.patch',
        patch: {
          rules: {
            languageFilter: {
              languages: ['invalid-lang'],
            },
          },
        },
      })
    ).toThrow('language code');
  });
  it('toggles individual cloud keywords and customizes cloud rules atomically', () => {
    let config = createDefaultConfig('standard');
    config.rules.keywords.enabled = false;

    config = applyConfigCommand(config, {
      type: 'cloudKeyword.toggle',
      id: 'cloud-nsfw-bio-1',
      enabled: false,
    });
    config = applyConfigCommand(config, {
      type: 'cloudKeyword.toggle',
      id: 'cloud-spam-tg-1',
      enabled: false,
    });
    expect(config.disabledCloudKeywordIds).toEqual([
      'cloud-nsfw-bio-1',
      'cloud-spam-tg-1',
    ]);

    config = applyConfigCommand(config, {
      type: 'cloudKeyword.toggle',
      id: 'cloud-nsfw-bio-1',
      enabled: true,
    });
    expect(config.disabledCloudKeywordIds).toEqual(['cloud-spam-tg-1']);

    config = applyConfigCommand(config, {
      type: 'cloudKeyword.customize',
      sourceId: 'cloud-scam-whatsapp-1',
      item: {
        id: 'custom-wa-1',
        pattern: 'wa\\.me/\\d{6,}',
        isRegex: true,
        scopes: ['text', 'url'],
        maxFollowersExempt: 10000,
        note: '自定义 WhatsApp 门槛',
        enabled: true,
      },
    });
    expect(config.rules.keywords.enabled).toBe(true);
    expect(config.rules.keywords.items).toHaveLength(1);
    expect(config.rules.keywords.items[0]!.id).toBe('custom-wa-1');
    expect(config.disabledCloudKeywordIds).toContain('cloud-scam-whatsapp-1');
  });
  it('validates regex, scopes, UID, locale, finite numbers and versions', () => {
    const keyword = {
      id: 'a',
      pattern: '[',
      isRegex: true,
      scopes: ['text'],
      enabled: true,
    };
    expect(() => validateKeyword(keyword)).toThrow('regular expression');
    expect(() =>
      validateKeyword({ ...keyword, pattern: 'ok', scopes: [] })
    ).toThrow('scope');
    const config = createDefaultConfig();
    config.rules.highFrequency.maxDailyTweets = NaN;
    expect(() => validateConfig(config)).toThrow('number');
    expect(() =>
      validateConfig({ ...createDefaultConfig(), version: 2 })
    ).toThrow('version');
    expect(() =>
      validateConfig({ ...createDefaultConfig(), locale: 'klingon' })
    ).toThrow('language');
    expect(() =>
      validateConfig({ ...createDefaultConfig(), theme: 'neon' })
    ).toThrow('theme');
    expect(() =>
      validateConfig({
        ...createDefaultConfig(),
        localBlocklistUids: {
          handle_foo: { uid: 'handle_foo', screenName: 'foo', addedAt: 1 },
        },
      })
    ).toThrow('UID');
  });
  it('fills missing older fields without clipping valid larger numbers', () => {
    const config = createDefaultConfig();
    config.rules.highFrequency.maxDailyTweets = 9999;
    const old = JSON.parse(JSON.stringify(config));
    delete old.enableCloudKeywords;
    delete old.locale;
    delete old.theme;
    delete old.rules.highFrequency.slidingWindowHours;
    expect(validateConfig(old).rules.highFrequency.maxDailyTweets).toBe(9999);
    expect(validateConfig(old).enableCloudKeywords).toBe(true);
    expect(validateConfig(old).locale).toBe('auto');
    expect(validateConfig(old).theme).toBe('light');
  });
  it('enforces disjoint lists and precise service origins', () => {
    const c = createDefaultConfig();
    const entry = { uid: '1', screenName: '', addedAt: 1 };
    c.localBlocklistUids['1'] = entry;
    const next = applyConfigCommand(c, {
      type: 'account.save',
      list: 'white',
      entry,
    });
    expect(next.localBlocklistUids['1']).toBeUndefined();
    expect(next.whitelistUids['1']).toBeDefined();
    expect(normalizeServiceUrl('https://example.com/')).toBe(
      'https://example.com'
    );
    expect(() => normalizeServiceUrl('https://user:pass@example.com')).toThrow(
      'credentials'
    );
    expect(() => normalizeServiceUrl('http://example.com')).toThrow('HTTPS');
    expect(normalizeServiceUrl('http://localhost:8787/')).toBe(
      'http://localhost:8787'
    );
  });
  it('rejects invalid community snapshots before cache replacement and merges built-in cloud keywords with langGroup into older snapshots', () => {
    expect(() => validateSnapshot({ version: 1, counts: {} })).toThrow();
    const validated = validateSnapshot({
      version: 1,
      updatedAt: '2026-11-11T00:00:00.000Z',
      domain: 'keepxclean.com',
      totalAccounts: 0,
      totalReports: 0,
      counts: {},
      cloudKeywords: [
        {
          id: 'cloud-nsfw-bio-1',
          pattern: '(onlyfans\\.com)',
          isRegex: true,
          scopes: ['bio'],
          enabled: false,
          note: 'old',
        },
        {
          id: 'cloud-hotfix-ja-99',
          pattern: '怪しい副業リンク',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
          langGroup: 'ja',
          packCategory: 'scam',
        },
      ],
    });
    expect(validated.cloudKeywords.length).toBe(
      DEFAULT_CLOUD_KEYWORDS.length + 1
    );
    expect(
      validated.cloudKeywords.some((k) => k.id === 'cloud-cliche-trivia-1')
    ).toBe(true);
    expect(
      validated.cloudKeywords.find((k) => k.id === 'cloud-nsfw-bio-1')?.enabled
    ).toBe(false);
    expect(
      validated.cloudKeywords.find((k) => k.id === 'cloud-nsfw-bio-1')
        ?.langGroup
    ).toBe('universal');
    const hotfix = validated.cloudKeywords.find(
      (k) => k.id === 'cloud-hotfix-ja-99'
    );
    expect(hotfix?.langGroup).toBe('ja');
    expect(hotfix?.packCategory).toBe('scam');
  });
  it('preserves rich GraphQL viewer profile across cookie-only GET_VIEWER pings while replacing on account switch', () => {
    const rich = {
      restId: '44196397',
      screenName: 'alice',
      accountAgeDays: 1200,
      followersCount: 850,
      reporterHash: 'a'.repeat(64),
    };
    const cookiePing = {
      restId: '44196397',
      screenName: '',
      accountAgeDays: 5800,
      followersCount: 0,
      reporterHash: 'a'.repeat(64),
    };
    expect(mergeViewerProfile(rich, cookiePing)).toEqual(rich);

    const switched = {
      restId: '99887766',
      screenName: '',
      accountAgeDays: 4000,
      followersCount: 0,
      reporterHash: 'b'.repeat(64),
    };
    expect(mergeViewerProfile(rich, switched)).toEqual(switched);
  });
  it('parses numeric UIDs, @handles, and X profile URLs while rejecting reserved paths', () => {
    expect(parseAccountQuery('44196397')).toEqual({
      kind: 'uid',
      uid: '44196397',
    });
    expect(parseAccountQuery('@jack')).toEqual({
      kind: 'handle',
      handle: 'jack',
    });
    expect(parseAccountQuery('https://x.com/elonmusk/with_replies?s=20')).toEqual({
      kind: 'handle',
      handle: 'elonmusk',
    });
    expect(parseAccountQuery('https://twitter.com/i/user/44196397')).toEqual({
      kind: 'uid',
      uid: '44196397',
    });
    expect(() => parseAccountQuery('https://x.com/home')).toThrow(
      'Could not extract a valid X @handle'
    );
    expect(() => parseAccountQuery('https://example.com/user')).toThrow(
      'Only x.com or twitter.com URLs are supported'
    );
  });
  it('preserves valid UI locale when recovering corrupted config and backs up corrupted payload', async () => {
    const corrupted = {
      version: 1,
      locale: 'ja',
      theme: 'system',
      rules: 'corrupted-not-an-object',
    };
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: corrupted });
    await recoverConfig(digest(corrupted));

    const recovered = mock.values[STORAGE_KEYS.CONFIG] as ReturnType<
      typeof createDefaultConfig
    >;
    expect(recovered.version).toBe(1);
    expect(recovered.locale).toBe('ja');
    expect(recovered.theme).toBe('system');
    expect(recovered.preset).toBe('standard');
    expect(
      (mock.values[UI_KEYS.backup] as { config: unknown }).config
    ).toEqual(corrupted);
  });
  it('keeps silent schema validators in strict parity with localized validators across all v0.2.0 fields', () => {
    const cfg = createDefaultConfig('strict');
    cfg.locale = 'es';
    cfg.theme = 'dark';
    cfg.disabledCloudKeywordIds = ['cloud-nsfw-bio-1'];
    cfg.enabledCloudLangGroups = ['universal', 'es'];
    cfg.sceneModes = {
      for_you: 'strip',
      following: 'bypass',
      reply: 'collapse',
      search: 'inherit',
    };
    cfg.onboardingDismissed = false;
    cfg.rules.grokFilter = {
      enabled: true,
      protectOfficialGrok: true,
      blockShortMentions: true,
      maxMentionWeightedLength: 20,
      hideGrokReplies: true,
    };
    cfg.rules.replySpam.blockDuplicateReplies = true;
    cfg.rules.domainFilter = {
      enabled: true,
      items: [
        {
          id: 'dom-parity-1',
          domain: 'spam.example',
          onlyInReplies: true,
          maxFollowersExempt: 5000,
          note: 'Spam domain',
          enabled: true,
        },
      ],
    };
    cfg.installedPacks = [
      {
        format: RULE_PACK_FORMAT,
        id: 'pack-parity',
        name: 'Parity Pack',
        description: 'Schema parity test',
        version: '1.0.0',
        locale: 'es',
        updatedAt: '2026-11-22T00:00:00.000Z',
        keywords: [
          {
            id: 'pk-kw-1',
            pattern: 'oferta falsa',
            isRegex: false,
            scopes: ['text'],
            enabled: true,
          },
        ],
        domains: [{ id: 'pk-dom-1', domain: 'estafa.example', enabled: true }],
        enabled: true,
        installedAt: 1700000000000,
        disabledItemIds: ['pk-dom-1'],
      },
    ];

    expect(validateConfigSilent(cfg)).toEqual(validateConfig(cfg));
    expect(() => validateConfigSilent({ ...cfg, theme: 'invalid' })).toThrow();
    expect(() => validateConfigSilent({ ...cfg, version: 99 })).toThrow();
    expect(() =>
      validateConfigSilent({
        ...cfg,
        rules: {
          ...cfg.rules,
          grokFilter: { ...cfg.rules.grokFilter, maxMentionWeightedLength: 0 },
        },
      })
    ).toThrow();
    expect(() =>
      validateConfig({
        ...cfg,
        rules: {
          ...cfg.rules,
          grokFilter: { ...cfg.rules.grokFilter, maxMentionWeightedLength: 0 },
        },
      })
    ).toThrow();
    expect(() =>
      validateConfigSilent({
        ...cfg,
        sceneModes: { for_you: 'invalid_mode' },
      })
    ).toThrow();
    expect(() =>
      validateConfigSilent({
        ...cfg,
        enabledCloudLangGroups: ['mars'],
      })
    ).toThrow();
    expect(() =>
      validateConfigSilent({
        ...cfg,
        rules: {
          ...cfg.rules,
          domainFilter: {
            enabled: true,
            items: [
              { id: 'd1', domain: 'bad host', enabled: true },
            ],
          },
        },
      })
    ).toThrow();
    const installedPacks = cfg.installedPacks ?? [];
    expect(() =>
      validateConfigSilent({
        ...cfg,
        installedPacks: [...installedPacks, { ...installedPacks[0]! }],
      })
    ).toThrow();

    const snap = createDefaultCrowdSnapshot();
    snap.counts['12345'] = { c: 4, t: 'spam' };
    expect(validateSnapshotSilent(snap)).toEqual(validateSnapshot(snap));
    expect(() =>
      validateSnapshotSilent({ ...snap, counts: { bad_uid: { c: 1 } } })
    ).toThrow();
  });

  it('migrates v0.1.2 configs cleanly while preserving privacy flags and undefined enabledCloudLangGroups', () => {
    const v012 = {
      version: 1,
      enabled: true,
      locale: 'zh-CN',
      theme: 'light',
      preset: 'standard',
      interceptionMode: 'collapse',
      exemptFollowing: true,
      profileSceneBadgeOnly: true,
      syncNativeXBlock: true,
      enableCrowdReport: true,
      enableCloudKeywords: true,
      disabledCloudKeywordIds: ['cloud-nsfw-bio-1'],
      rules: {
        replySpam: {
          enabled: true,
          blockShortOrEmoji: true,
          minWeightedLength: 6,
          detectImpersonation: true,
          blockBioLinkSpam: true,
          bioLinkMaxFollowers: 1000,
          blockPureMediaReplies: false,
        },
        engagementBait: {
          enabled: true,
          blockCommentGiveaway: true,
          blockFollowBack: true,
        },
        highFrequency: {
          enabled: true,
          maxDailyTweets: 45,
          slidingWindowEnabled: true,
          slidingWindowHours: 1,
          slidingWindowMaxTweets: 8,
        },
        crowdBlock: { enabled: true, minBlockCount: 3 },
        keywords: { enabled: true, items: [] },
        tagSpam: { enabled: true, maxHashtags: 5, maxCashtags: 3 },
        accountQuality: {
          enabled: true,
          minAccountAgeDays: 7,
          blockDefaultAvatarInReplies: true,
          maxFollowRatio: 15,
          minFollowingForRatioCheck: 500,
        },
        languageFilter: {
          enabled: false,
          mode: 'allow',
          languages: ['zh', 'en', 'ja'],
        },
        hidePromotedAds: { enabled: true },
      },
      whitelistUids: {},
      localBlocklistUids: {},
    };

    const hydrated = validateConfig(v012);
    expect(hydrated.syncNativeXBlock).toBe(true);
    expect(hydrated.enableCrowdReport).toBe(true);
    expect(hydrated.onboardingDismissed).toBe(true);
    expect(hydrated.enabledCloudLangGroups).toBeUndefined();
    expect(hydrated.rules.grokFilter).toEqual({
      enabled: true,
      protectOfficialGrok: true,
      blockShortMentions: false,
      maxMentionWeightedLength: 16,
      hideGrokReplies: false,
    });
    expect(hydrated.rules.replySpam.blockDuplicateReplies).toBe(true);
    expect(hydrated.rules.domainFilter).toEqual({ enabled: true, items: [] });
    expect(hydrated.sceneModes).toEqual({
      for_you: 'inherit',
      following: 'inherit',
      reply: 'inherit',
      search: 'inherit',
    });
    expect(hydrated.installedPacks).toEqual([]);

    // Explicit empty array [] must be preserved distinctly from undefined
    const explicitEmpty = validateConfig({
      ...hydrated,
      enabledCloudLangGroups: [],
    });
    expect(explicitEmpty.enabledCloudLangGroups).toEqual([]);
  });

  it('keeps preset on domainFilter patches, marks custom on grokFilter/replySpam patches, shallow-merges sceneModes, and blocks prototype pollution', () => {
    let config = createDefaultConfig('standard');
    config = applyConfigCommand(config, {
      type: 'config.patch',
      patch: {
        rules: { domainFilter: { enabled: false } },
      },
    });
    expect(config.preset).toBe('standard');
    expect(config.rules.domainFilter.enabled).toBe(false);

    config = applyConfigCommand(config, {
      type: 'config.patch',
      patch: { sceneModes: { for_you: 'strip' } },
    });
    config = applyConfigCommand(config, {
      type: 'config.patch',
      patch: { sceneModes: { following: 'bypass' } },
    });
    expect(config.sceneModes).toEqual({
      for_you: 'strip',
      following: 'bypass',
      reply: 'inherit',
      search: 'inherit',
    });

    const grokPatched = applyConfigCommand(config, {
      type: 'config.patch',
      patch: { rules: { grokFilter: { blockShortMentions: true } } },
    });
    expect(grokPatched.preset).toBe('custom');
    expect(grokPatched.rules.grokFilter.blockShortMentions).toBe(true);

    const dupPatched = applyConfigCommand(createDefaultConfig('standard'), {
      type: 'config.patch',
      patch: { rules: { replySpam: { blockDuplicateReplies: false } } },
    });
    expect(dupPatched.preset).toBe('custom');

    // Reject prototype-pollution keys across config.patch and schema validation
    const protoPatch = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(() =>
      applyConfigCommand(config, {
        type: 'config.patch',
        patch: protoPatch,
      })
    ).toThrow();
    const protoRulePatch = JSON.parse('{"rules":{"constructor":{"x":1}}}');
    expect(() =>
      applyConfigCommand(config, {
        type: 'config.patch',
        patch: protoRulePatch,
      })
    ).toThrow();
    const protoScenePatch = JSON.parse(
      '{"sceneModes":{"__proto__":"strip"}}'
    );
    expect(() =>
      applyConfigCommand(config, {
        type: 'config.patch',
        patch: protoScenePatch,
      })
    ).toThrow();

    // Direct domain & installed pack validators normalize and enforce rules
    expect(
      validateDomainRule({
        id: 'd-norm',
        domain: 'HTTPS://Sub.Example.COM/path?q=1',
        enabled: true,
      }).domain
    ).toBe('sub.example.com');
    expect(() =>
      validateInstalledPack({
        format: RULE_PACK_FORMAT,
        id: 'bad-pack',
        name: 'Bad',
        description: 'Has forbidden key',
        version: '1.0.0',
        updatedAt: '2026-11-22T00:00:00.000Z',
        whitelistUids: { '1': { uid: '1', screenName: 'a', addedAt: 1 } },
        enabled: true,
        installedAt: 100,
      })
    ).toThrow();
  });

  it('maintains 10-locale ERROR_LOCALES key parity, formatter compatibility, and native translations for v0.2.0 keys', () => {
    const enKeys = Object.keys(ERROR_LOCALES.en).sort();
    const v2Keys = [
      'invalidDomain',
      'duplicateDomainId',
      'invalidCloudLangGroup',
      'invalidSceneMode',
      'invalidRulePack',
      'duplicatePackId',
      'domainModifiedReopen',
      'domainChangedRefresh',
      'packNotFound',
      'invalidDisableTarget',
      'targetNotFound',
      'cloudSyncQuotaExceeded',
      'cloudSyncCorruptRemote',
      'cloudSyncNoPendingConflict',
      'cloudSyncInvalidStrategy',
      'cloudSyncUnavailable',
      'cloudSyncFailed',
    ] as const;

    for (const locale of SUPPORTED_LOCALES) {
      const dict = ERROR_LOCALES[locale];
      expect(Object.keys(dict).sort()).toEqual(enKeys);
      for (const key of v2Keys) {
        const refVal = ERROR_LOCALES.en[key];
        const val = dict[key];
        expect(typeof val).toBe(typeof refVal);
        if (typeof val === 'string') {
          expect(val.trim().length).toBeGreaterThan(0);
          if (locale !== 'en') {
            expect(val).not.toBe(refVal);
          }
        } else if (typeof val === 'function') {
          // Ensure parenthesized parameters for i18n.test.ts:sampleArgs compatibility
          expect(val.toString()).toMatch(/^\([^)]+\)\s*=>/);
          const formatted = (val as (detail: string) => string)('sample');
          expect(formatted).toContain('sample');
          if (locale !== 'en') {
            expect(formatted).not.toBe(
              (refVal as (detail: string) => string)('sample')
            );
          }
        }
      }
    }
  });

  it('rejects String(...) array-coercion bypasses in both localized and silent validators', () => {
    const base = createDefaultConfig('standard');
    const badInterception = { ...base, interceptionMode: ['strip'] };
    const badPreset = { ...base, preset: ['strict'] };
    const badAccountTag = {
      ...base,
      localBlocklistUids: {
        '42': { uid: '42', screenName: 'bad', addedAt: 1, tag: ['spam'] },
      },
    };
    for (const candidate of [badInterception, badPreset, badAccountTag]) {
      expect(() => validateConfig(candidate)).toThrow();
      expect(() => validateConfigSilent(candidate)).toThrow();
    }

    const badSnapshot = {
      ...createDefaultCrowdSnapshot(),
      counts: { '42': { c: 3, t: ['spam'] } },
    };
    expect(() => validateSnapshot(badSnapshot)).toThrow();
    expect(() => validateSnapshotSilent(badSnapshot)).toThrow();
  });

  it('hydrates v0.1.2 light and strict presets with their preset-specific v0.2.0 rule defaults', () => {
    const stripV2Fields = (preset: 'light' | 'strict') => {
      const legacy = JSON.parse(JSON.stringify(createDefaultConfig(preset)));
      delete legacy.rules.grokFilter;
      delete legacy.rules.domainFilter;
      delete legacy.rules.replySpam.blockDuplicateReplies;
      delete legacy.sceneModes;
      delete legacy.installedPacks;
      delete legacy.onboardingDismissed;
      return legacy;
    };

    const hydratedLight = validateConfig(stripV2Fields('light'));
    expect(hydratedLight.preset).toBe('light');
    expect(hydratedLight.rules.replySpam.blockDuplicateReplies).toBe(false);
    expect(hydratedLight.rules.grokFilter.blockShortMentions).toBe(false);
    expect(hydratedLight.rules.grokFilter.protectOfficialGrok).toBe(true);
    expect(validateConfigSilent(stripV2Fields('light'))).toEqual(hydratedLight);

    const hydratedStrict = validateConfig(stripV2Fields('strict'));
    expect(hydratedStrict.preset).toBe('strict');
    expect(hydratedStrict.rules.replySpam.blockDuplicateReplies).toBe(true);
    expect(hydratedStrict.rules.grokFilter.blockShortMentions).toBe(true);
    expect(validateConfigSilent(stripV2Fields('strict'))).toEqual(
      hydratedStrict
    );
  });

  it('ignores explicit undefined values in config.patch without clobbering state or flipping preset to custom', () => {
    const disabled = createDefaultConfig('strict');
    disabled.enabled = false;
    disabled.enabledCloudLangGroups = ['universal', 'en'];

    const afterUndefinedFields = applyConfigCommand(disabled, {
      type: 'config.patch',
      patch: {
        enabled: undefined,
        rules: {
          grokFilter: { blockShortMentions: undefined },
        },
      },
    });
    expect(afterUndefinedFields.enabled).toBe(false);
    expect(afterUndefinedFields.preset).toBe('strict');
    expect(afterUndefinedFields.rules.grokFilter.blockShortMentions).toBe(true);

    // Explicit enabledCloudLangGroups: undefined still resets language groups back to auto
    const resetLangGroups = applyConfigCommand(afterUndefinedFields, {
      type: 'config.patch',
      patch: { enabledCloudLangGroups: undefined },
    });
    expect(resetLangGroups.enabledCloudLangGroups).toBeUndefined();
  });

  it('rejects getters on install metadata and sparse disabledItemIds arrays in validateInstalledPack', () => {
    const basePack = {
      format: RULE_PACK_FORMAT,
      id: 'pack-hardened',
      name: 'Hardened Pack',
      description: 'Getter and sparse array checks',
      version: '1.0.0',
      updatedAt: '2026-11-22T00:00:00.000Z',
      domains: [{ id: 'd1', domain: 'ads.example', enabled: true }],
      enabled: true,
      installedAt: 1000,
    };

    for (const metaKey of ['enabled', 'installedAt', 'disabledItemIds'] as const) {
      const withGetter = { ...basePack };
      Object.defineProperty(withGetter, metaKey, {
        enumerable: true,
        configurable: true,
        get: () => (metaKey === 'enabled' ? true : metaKey === 'installedAt' ? 1 : []),
      });
      expect(() => validateInstalledPack(withGetter)).toThrow();
      expect(() =>
        validateConfigSilent({
          ...createDefaultConfig(),
          installedPacks: [withGetter],
        })
      ).toThrow();
    }

    const sparse: string[] = [];
    sparse[1] = 'd1';
    const withSparse = { ...basePack, disabledItemIds: sparse };
    expect(() => validateInstalledPack(withSparse)).toThrow();
    expect(() =>
      validateConfigSilent({
        ...createDefaultConfig(),
        installedPacks: [withSparse],
      })
    ).toThrow();
  });

  it('rejects sparse arrays, element getters, and own/prototype getters with 0 invocations across all 9 array fields in both localized and silent validators, while accepting Object.create(null) (N3)', () => {
    const validKeyword = {
      id: 'kw-n3-1',
      pattern: 'spamword',
      isRegex: false,
      scopes: ['text'] as const,
      enabled: true,
    };
    const validDomain = {
      id: 'dom-n3-1',
      domain: 'spam.example',
      enabled: true,
    };
    const validPack = {
      format: RULE_PACK_FORMAT,
      id: 'pack-n3-1',
      name: 'N3 Pack',
      description: 'Valid pack',
      version: '1.0.0',
      updatedAt: '2026-11-22T00:00:00.000Z',
      domains: [validDomain],
      enabled: true,
      installedAt: 1000,
    };

    const makeSparse = <T,>(item: T): T[] => {
      const arr: T[] = [];
      arr[1] = item;
      return arr;
    };

    const makeElementGetter = <T,>(item: T, onGet: () => void): T[] => {
      const arr: T[] = [];
      Object.defineProperty(arr, 0, {
        enumerable: true,
        configurable: true,
        get() {
          onGet();
          return item;
        },
      });
      return arr;
    };

    // 1. All 8 config array fields: sparse arrays & element getters rejected with 0 getter calls in BOTH validators
    const configArrayCases: Array<{
      name: string;
      build: (arr: unknown[]) => unknown;
      validItem: unknown;
    }> = [
      {
        name: 'keyword.scopes',
        validItem: 'text',
        build: (arr) => {
          const c = createDefaultConfig('standard');
          return {
            ...c,
            rules: {
              ...c.rules,
              keywords: {
                ...c.rules.keywords,
                items: [{ ...validKeyword, scopes: arr }],
              },
            },
          };
        },
      },
      {
        name: 'installedPack.disabledItemIds',
        validItem: 'dom-n3-1',
        build: (arr) => ({
          ...createDefaultConfig('standard'),
          installedPacks: [{ ...validPack, disabledItemIds: arr }],
        }),
      },
      {
        name: 'config.enabledCloudLangGroups',
        validItem: 'en',
        build: (arr) => ({
          ...createDefaultConfig('standard'),
          enabledCloudLangGroups: arr,
        }),
      },
      {
        name: 'config.disabledCloudKeywordIds',
        validItem: 'cloud-nsfw-bio-1',
        build: (arr) => ({
          ...createDefaultConfig('standard'),
          disabledCloudKeywordIds: arr,
        }),
      },
      {
        name: 'config.rules.languageFilter.languages',
        validItem: 'en',
        build: (arr) => {
          const c = createDefaultConfig('standard');
          return {
            ...c,
            rules: {
              ...c.rules,
              languageFilter: { ...c.rules.languageFilter, languages: arr },
            },
          };
        },
      },
      {
        name: 'config.rules.keywords.items',
        validItem: validKeyword,
        build: (arr) => {
          const c = createDefaultConfig('standard');
          return {
            ...c,
            rules: {
              ...c.rules,
              keywords: { ...c.rules.keywords, items: arr },
            },
          };
        },
      },
      {
        name: 'config.rules.domainFilter.items',
        validItem: validDomain,
        build: (arr) => {
          const c = createDefaultConfig('standard');
          return {
            ...c,
            rules: {
              ...c.rules,
              domainFilter: { ...c.rules.domainFilter, items: arr },
            },
          };
        },
      },
      {
        name: 'config.installedPacks',
        validItem: validPack,
        build: (arr) => ({
          ...createDefaultConfig('standard'),
          installedPacks: arr,
        }),
      },
    ];

    let getterCalls = 0;
    for (const tc of configArrayCases) {
      const sparseCandidate = tc.build(makeSparse(tc.validItem));
      expect(() => validateConfig(sparseCandidate), `${tc.name} sparse`).toThrow();
      expect(
        () => validateConfigSilent(sparseCandidate),
        `${tc.name} sparse silent`
      ).toThrow();

      const getterArr = makeElementGetter(tc.validItem, () => {
        getterCalls += 1;
      });
      const getterCandidate = tc.build(getterArr);
      expect(() => validateConfig(getterCandidate), `${tc.name} getter`).toThrow();
      expect(
        () => validateConfigSilent(getterCandidate),
        `${tc.name} getter silent`
      ).toThrow();
    }

    // 2. 9th array field: snapshot.cloudKeywords
    const sparseSnap = {
      ...createDefaultCrowdSnapshot(),
      cloudKeywords: makeSparse(validKeyword),
    };
    expect(() => validateSnapshot(sparseSnap)).toThrow();
    expect(() => validateSnapshotSilent(sparseSnap)).toThrow();

    const getterSnap = {
      ...createDefaultCrowdSnapshot(),
      cloudKeywords: makeElementGetter(validKeyword, () => {
        getterCalls += 1;
      }),
    };
    expect(() => validateSnapshot(getterSnap)).toThrow();
    expect(() => validateSnapshotSilent(getterSnap)).toThrow();

    // 3. Inherited prototype getters & own object getters rejected with 0 invocations
    const protoGetterPack = Object.create({
      get enabled() {
        getterCalls += 1;
        return true;
      },
      get installedAt() {
        getterCalls += 1;
        return 1000;
      },
    });
    Object.assign(protoGetterPack, {
      format: RULE_PACK_FORMAT,
      id: 'pack-proto-getter',
      name: 'Proto Pack',
      description: 'Inherited getters',
      version: '1.0.0',
      updatedAt: '2026-11-22T00:00:00.000Z',
      domains: [validDomain],
    });
    expect(() => validateInstalledPack(protoGetterPack)).toThrow();
    expect(() =>
      validateConfig({
        ...createDefaultConfig('standard'),
        installedPacks: [protoGetterPack],
      })
    ).toThrow();
    expect(() =>
      validateConfigSilent({
        ...createDefaultConfig('standard'),
        installedPacks: [protoGetterPack],
      })
    ).toThrow();

    const configLocaleGetter = { ...createDefaultConfig('standard') };
    Object.defineProperty(configLocaleGetter, 'locale', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'en';
      },
    });
    expect(() => validateConfig(configLocaleGetter)).toThrow();
    expect(() => validateConfigSilent(configLocaleGetter)).toThrow();

    const grokGetterCfg = createDefaultConfig('standard');
    Object.defineProperty(grokGetterCfg.rules.grokFilter, 'enabled', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return true;
      },
    });
    expect(() => validateConfig(grokGetterCfg)).toThrow();
    expect(() => validateConfigSilent(grokGetterCfg)).toThrow();

    const kwPatternGetter = { ...validKeyword };
    Object.defineProperty(kwPatternGetter, 'pattern', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'spam';
      },
    });
    expect(() => validateKeyword(kwPatternGetter)).toThrow();

    const domainGetter = { ...validDomain };
    Object.defineProperty(domainGetter, 'domain', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'spam.example';
      },
    });
    expect(() => validateDomainRule(domainGetter)).toThrow();

    const accountGetter = { uid: '42', screenName: 'a', addedAt: 1 };
    Object.defineProperty(accountGetter, 'uid', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return '42';
      },
    });
    expect(() => validateAccount(accountGetter)).toThrow();

    expect(getterCalls).toBe(0);

    // 4. Object.create(null) plain objects validate cleanly & localized === silent parity
    const baseV2 = createDefaultConfig('standard');
    baseV2.enabledCloudLangGroups = ['universal', 'en'];
    baseV2.disabledCloudKeywordIds = ['cloud-nsfw-bio-1'];
    baseV2.rules.keywords.items = [{ ...validKeyword, scopes: ['text'] }];
    baseV2.rules.domainFilter.items = [validDomain];
    baseV2.installedPacks = [validPack];

    const nullProtoCfg = Object.assign(Object.create(null), baseV2);
    const localized = validateConfig(nullProtoCfg);
    const silent = validateConfigSilent(nullProtoCfg);
    expect(silent).toEqual(localized);
    expect(localized.installedPacks).toHaveLength(1);

    const nullProtoSnap = Object.assign(
      Object.create(null),
      createDefaultCrowdSnapshot()
    );
    expect(validateSnapshotSilent(nullProtoSnap)).toEqual(
      validateSnapshot(nullProtoSnap)
    );

    // 5. parseAccountQuery rejects non-string input cleanly
    expect(() => parseAccountQuery(123 as unknown as string)).toThrow();
  });

  it('rejects [Symbol.iterator] scopes bypasses, non-index/Symbol array properties, and inherited/own [Symbol.toStringTag] & Symbol getters with 0 invocations while preserving Object.create(null) (R3-1 & R3-2)', () => {
    const validKeyword = {
      id: 'kw-r4-1',
      pattern: 'spamword',
      isRegex: false,
      scopes: ['text'] as const,
      enabled: true,
    };
    const validDomain = {
      id: 'dom-r4-1',
      domain: 'spam.example',
      enabled: true,
    };
    const validPack = {
      format: RULE_PACK_FORMAT,
      id: 'pack-r4-1',
      name: 'R4 Pack',
      description: 'Valid pack for R3-1/R3-2 checks',
      version: '1.0.0',
      updatedAt: '2026-11-22T00:00:00.000Z',
      domains: [validDomain],
      enabled: true,
      installedAt: 1000,
    };

    let getterCalls = 0;

    // 1. [Symbol.iterator] getter & generator bypass on keyword.scopes across all 5 validators
    const evilScopesGetter = ['text'];
    Object.defineProperty(evilScopesGetter, Symbol.iterator, {
      configurable: true,
      get() {
        getterCalls += 1;
        return function* () {
          yield '__proto__';
          yield 'EVIL_SCOPE';
          yield 999;
        };
      },
    });
    const evilScopesData = ['text'];
    Object.defineProperty(evilScopesData, Symbol.iterator, {
      configurable: true,
      value: function* () {
        getterCalls += 1;
        yield 'EVIL_SCOPE';
      },
    });

    for (const badScopes of [evilScopesGetter, evilScopesData]) {
      const badKw = { ...validKeyword, scopes: badScopes };
      expect(() => validateKeyword(badKw)).toThrow();

      const cfgWithBadKw = createDefaultConfig('standard');
      const badCfg = {
        ...cfgWithBadKw,
        rules: {
          ...cfgWithBadKw.rules,
          keywords: { ...cfgWithBadKw.rules.keywords, items: [badKw] },
        },
      };
      expect(() => validateConfig(badCfg)).toThrow();
      expect(() => validateConfigSilent(badCfg)).toThrow();

      const badSnap = {
        ...createDefaultCrowdSnapshot(),
        cloudKeywords: [badKw],
      };
      expect(() => validateSnapshot(badSnap)).toThrow();
      expect(() => validateSnapshotSilent(badSnap)).toThrow();
    }

    // 2. Non-index own property/getter (toJSON) and own Symbol getter on all 9 validated arrays
    const makeToJsonGetterArr = <T,>(item: T): T[] => {
      const arr = [item];
      Object.defineProperty(arr, 'toJSON', {
        configurable: true,
        get() {
          getterCalls += 1;
          return () => ['evil'];
        },
      });
      return arr;
    };
    const customSym = Symbol('evilArraySym');
    const makeSymbolGetterArr = <T,>(item: T): T[] => {
      const arr = [item];
      Object.defineProperty(arr, customSym, {
        configurable: true,
        get() {
          getterCalls += 1;
          return 'evil';
        },
      });
      return arr;
    };

    const arrayCases: Array<{
      name: string;
      validItem: unknown;
      build: (arr: unknown[]) => unknown;
      isSnapshot?: boolean;
    }> = [
      {
        name: 'keyword.scopes',
        validItem: 'text',
        build: (arr) => {
          const c = createDefaultConfig('standard');
          return {
            ...c,
            rules: {
              ...c.rules,
              keywords: {
                ...c.rules.keywords,
                items: [{ ...validKeyword, scopes: arr }],
              },
            },
          };
        },
      },
      {
        name: 'installedPack.disabledItemIds',
        validItem: 'dom-r4-1',
        build: (arr) => ({
          ...createDefaultConfig('standard'),
          installedPacks: [{ ...validPack, disabledItemIds: arr }],
        }),
      },
      {
        name: 'config.enabledCloudLangGroups',
        validItem: 'en',
        build: (arr) => ({
          ...createDefaultConfig('standard'),
          enabledCloudLangGroups: arr,
        }),
      },
      {
        name: 'config.disabledCloudKeywordIds',
        validItem: 'cloud-nsfw-bio-1',
        build: (arr) => ({
          ...createDefaultConfig('standard'),
          disabledCloudKeywordIds: arr,
        }),
      },
      {
        name: 'config.rules.languageFilter.languages',
        validItem: 'en',
        build: (arr) => {
          const c = createDefaultConfig('standard');
          return {
            ...c,
            rules: {
              ...c.rules,
              languageFilter: { ...c.rules.languageFilter, languages: arr },
            },
          };
        },
      },
      {
        name: 'config.rules.keywords.items',
        validItem: validKeyword,
        build: (arr) => {
          const c = createDefaultConfig('standard');
          return {
            ...c,
            rules: {
              ...c.rules,
              keywords: { ...c.rules.keywords, items: arr },
            },
          };
        },
      },
      {
        name: 'config.rules.domainFilter.items',
        validItem: validDomain,
        build: (arr) => {
          const c = createDefaultConfig('standard');
          return {
            ...c,
            rules: {
              ...c.rules,
              domainFilter: { ...c.rules.domainFilter, items: arr },
            },
          };
        },
      },
      {
        name: 'config.installedPacks',
        validItem: validPack,
        build: (arr) => ({
          ...createDefaultConfig('standard'),
          installedPacks: arr,
        }),
      },
      {
        name: 'snapshot.cloudKeywords',
        validItem: validKeyword,
        isSnapshot: true,
        build: (arr) => ({
          ...createDefaultCrowdSnapshot(),
          cloudKeywords: arr,
        }),
      },
    ];

    for (const tc of arrayCases) {
      for (const badArr of [
        makeToJsonGetterArr(tc.validItem),
        makeSymbolGetterArr(tc.validItem),
      ]) {
        const candidate = tc.build(badArr);
        if (tc.isSnapshot) {
          expect(() => validateSnapshot(candidate), tc.name).toThrow();
          expect(() => validateSnapshotSilent(candidate), tc.name).toThrow();
        } else {
          expect(() => validateConfig(candidate), tc.name).toThrow();
          expect(() => validateConfigSilent(candidate), tc.name).toThrow();
        }
      }
    }

    // 3. Inherited [Symbol.toStringTag] getter on custom-prototype object (0 invocations)
    const customProtoWithTag = Object.create(
      Object.defineProperty({}, Symbol.toStringTag, {
        configurable: true,
        get() {
          getterCalls += 1;
          return 'Object';
        },
      })
    );
    expect(() => validateConfig(customProtoWithTag)).toThrow();
    expect(() => validateConfigSilent(customProtoWithTag)).toThrow();
    expect(() => validateInstalledPack(customProtoWithTag)).toThrow();

    // 4. Own [Symbol.toStringTag] getter & custom Symbol getter on plain objects (0 invocations)
    const objSym = Symbol('evilObjSym');
    const cfgWithTagGetter = { ...createDefaultConfig('standard') };
    Object.defineProperty(cfgWithTagGetter, Symbol.toStringTag, {
      configurable: true,
      get() {
        getterCalls += 1;
        return 'Object';
      },
    });
    expect(() => validateConfig(cfgWithTagGetter)).toThrow();
    expect(() => validateConfigSilent(cfgWithTagGetter)).toThrow();

    const cfgWithCustomSymGetter = { ...createDefaultConfig('standard') };
    Object.defineProperty(cfgWithCustomSymGetter, objSym, {
      configurable: true,
      get() {
        getterCalls += 1;
        return 'evil';
      },
    });
    expect(() => validateConfig(cfgWithCustomSymGetter)).toThrow();
    expect(() => validateConfigSilent(cfgWithCustomSymGetter)).toThrow();

    const packWithTagGetter = { ...validPack };
    Object.defineProperty(packWithTagGetter, Symbol.toStringTag, {
      configurable: true,
      get() {
        getterCalls += 1;
        return 'Object';
      },
    });
    expect(() => validateInstalledPack(packWithTagGetter)).toThrow();

    const packWithCustomSymGetter = { ...validPack };
    Object.defineProperty(packWithCustomSymGetter, objSym, {
      configurable: true,
      get() {
        getterCalls += 1;
        return 'evil';
      },
    });
    expect(() => validateInstalledPack(packWithCustomSymGetter)).toThrow();

    // Forged built-in (Date with prototype overwritten to Object.prototype / null) still rejected
    const forgedDate = Object.setPrototypeOf(new Date(), Object.prototype);
    const forgedNullDate = Object.setPrototypeOf(new Date(), null);
    expect(() => validateConfig(forgedDate)).toThrow();
    expect(() => validateConfigSilent(forgedNullDate)).toThrow();

    // Zero getter invocations across ALL hostile inputs above!
    expect(getterCalls).toBe(0);

    // 5. Object.create(null) still succeeds across config, silent config, and installed pack
    const nullPack = Object.assign(Object.create(null), validPack);
    expect(validateInstalledPack(nullPack).id).toBe(validPack.id);
    const nullCfg = Object.assign(Object.create(null), {
      ...createDefaultConfig('standard'),
      installedPacks: [nullPack],
    });
    expect(validateConfigSilent(nullCfg)).toEqual(validateConfig(nullCfg));
  });

  it('BUG-C2-1 regression: buildOptionsUrl rejects prototype-colliding query values and keyword.delete rejects missing items', () => {
    for (const badVal of [
      '__proto__',
      'constructor',
      'prototype',
      'toString',
      'valueOf',
      'hasOwnProperty',
    ]) {
      expect(
        () =>
          buildOptionsUrl('chrome-extension://ext/options.html', 'keywords', {
            tab: 'packs',
            pack: badVal,
          }),
        `pack=${badVal}`
      ).toThrow();
      expect(
        () =>
          buildOptionsUrl('chrome-extension://ext/options.html', 'keywords', {
            focus: badVal,
          }),
        `focus=${badVal}`
      ).toThrow();
    }

    const cfg = createDefaultConfig('standard');
    expect(() =>
      applyConfigCommand(cfg, {
        type: 'keyword.delete',
        id: 'non-existent-kw',
        expected: undefined as unknown as string,
      })
    ).toThrow();
  });
});
