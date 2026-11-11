import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '@keepxclean/shared';
import {
  applyConfigCommand,
  mergeViewerProfile,
  serialQueue,
} from '../src/background/config';
import { digest } from '../src/services/model';
import {
  normalizeServiceUrl,
  validateConfig,
  validateKeyword,
  validateSnapshot,
} from '../src/services/validation';

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
  it('preserves lists, custom words and privacy when resetting rules', () => {
    const config = createDefaultConfig('strict');
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
    ).toThrow('重新预览');
    expect(current.enabled).toBe(false);
  });
  it('edits stable keyword IDs and rejects conflicting editors', () => {
    const current = createDefaultConfig();
    const item = current.rules.keywords.items[0];
    const next = applyConfigCommand(current, {
      type: 'keyword.save',
      item: { ...item, note: 'new' },
      expected: digest(item),
    });
    expect(next.rules.keywords.items.length).toBe(
      current.rules.keywords.items.length
    );
    expect(() =>
      applyConfigCommand(next, {
        type: 'keyword.save',
        item,
        expected: digest(item),
      })
    ).toThrow('重新打开');
  });
  it('validates regex, scopes, UID, finite numbers and versions', () => {
    const keyword = {
      id: 'a',
      pattern: '[',
      isRegex: true,
      scopes: ['text'],
      enabled: true,
    };
    expect(() => validateKeyword(keyword)).toThrow('正则');
    expect(() =>
      validateKeyword({ ...keyword, pattern: 'ok', scopes: [] })
    ).toThrow('范围');
    const config = createDefaultConfig();
    config.rules.highFrequency.maxDailyTweets = NaN;
    expect(() => validateConfig(config)).toThrow('数值');
    expect(() =>
      validateConfig({ ...createDefaultConfig(), version: 2 })
    ).toThrow('版本');
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
    delete old.rules.highFrequency.slidingWindowHours;
    expect(validateConfig(old).rules.highFrequency.maxDailyTweets).toBe(9999);
    expect(validateConfig(old).enableCloudKeywords).toBe(true);
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
      '密码'
    );
    expect(() => normalizeServiceUrl('http://example.com')).toThrow('HTTPS');
    expect(normalizeServiceUrl('http://localhost:8787/')).toBe(
      'http://localhost:8787'
    );
  });
  it('rejects invalid community snapshots before cache replacement', () => {
    expect(() => validateSnapshot({ version: 1, counts: {} })).toThrow();
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
});
