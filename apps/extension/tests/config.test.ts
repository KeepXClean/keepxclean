import { describe, expect, it } from 'vitest';
import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  STORAGE_KEYS,
} from '@keepxclean/shared';
import {
  applyConfigCommand,
  mergeViewerProfile,
  serialQueue,
} from '../src/background/config';
import { recoverConfig } from '../src/background/repository';
import { digest, UI_KEYS } from '../src/services/model';
import {
  validateConfigSilent,
  validateSnapshotSilent,
} from '../src/services/schema';
import {
  normalizeServiceUrl,
  parseAccountQuery,
  validateConfig,
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
          patch: { interceptionMode: 'collapse' },
        });
      }),
    ]);
    expect(config.enabled).toBe(false);
    expect(config.interceptionMode).toBe('collapse');
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
  it('preserves lists, custom words, locale and privacy when resetting rules', () => {
    const config = createDefaultConfig('strict');
    config.locale = 'ja';
    config.enabled = false;
    config.syncNativeXBlock = false;
    config.enableCrowdReport = false;
    config.customApiBaseUrl = 'https://example.com';
    config.localBlocklistUids['1'] = { uid: '1', screenName: '', addedAt: 1 };
    config.rules.keywords.items.push({
      id: 'custom',
      pattern: 'hello',
      scopes: ['text'],
      enabled: true,
      isRegex: false,
    });
    const next = applyConfigCommand(config, {
      type: 'config.reset',
      expected: digest(config),
    });
    expect(next.preset).toBe('standard');
    expect(next.interceptionMode).toBe('strip');
    expect(next.locale).toBe('ja');
    expect(next.enabled).toBe(false);
    expect(next.localBlocklistUids).toEqual(config.localBlocklistUids);
    expect(next.rules.keywords.items).toEqual(config.rules.keywords.items);
    expect(next.enableCrowdReport).toBe(false);
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
    delete old.rules.highFrequency.slidingWindowHours;
    expect(validateConfig(old).rules.highFrequency.maxDailyTweets).toBe(9999);
    expect(validateConfig(old).enableCloudKeywords).toBe(true);
    expect(validateConfig(old).locale).toBe('auto');
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
  it('rejects invalid community snapshots before cache replacement and merges built-in cloud keywords into older snapshots', () => {
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
      ],
    });
    expect(
      validated.cloudKeywords.some((k) => k.id === 'cloud-cliche-trivia-1')
    ).toBe(true);
    expect(
      validated.cloudKeywords.find((k) => k.id === 'cloud-nsfw-bio-1')?.enabled
    ).toBe(false);
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
      rules: 'corrupted-not-an-object',
    };
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: corrupted });
    await recoverConfig(digest(corrupted));

    const recovered = mock.values[STORAGE_KEYS.CONFIG] as ReturnType<
      typeof createDefaultConfig
    >;
    expect(recovered.version).toBe(1);
    expect(recovered.locale).toBe('ja');
    expect(recovered.preset).toBe('standard');
    expect(
      (mock.values[UI_KEYS.backup] as { config: unknown }).config
    ).toEqual(corrupted);
  });
  it('keeps silent schema validators in strict parity with localized validators', () => {
    const cfg = createDefaultConfig('strict');
    cfg.locale = 'es';
    cfg.disabledCloudKeywordIds = ['cloud-nsfw-bio-1'];
    expect(validateConfigSilent(cfg)).toEqual(validateConfig(cfg));
    expect(() =>
      validateConfigSilent({ ...cfg, version: 99 })
    ).toThrow();

    const snap = createDefaultCrowdSnapshot();
    snap.counts['12345'] = { c: 4, t: 'spam' };
    expect(validateSnapshotSilent(snap)).toEqual(validateSnapshot(snap));
    expect(() =>
      validateSnapshotSilent({ ...snap, counts: { bad_uid: { c: 1 } } })
    ).toThrow();
  });
});
