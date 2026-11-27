import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  evaluateTweet,
  RULE_PACK_FORMAT,
  type ExtractedTweet,
  type RulePackPayload,
} from '@keepxclean/shared';
import {
  applyConfigCommand,
  buildOptionsUrl,
  openOptionsPage,
} from '../src/background/config';
import { ERROR_LOCALES } from '../src/i18n/errors';
import { digest } from '../src/services/model';
import { validateConfigSilent } from '../src/services/schema';
import { validateConfig } from '../src/services/validation';
import { mockChrome } from './mock-chrome';

const samplePack: RulePackPayload = {
  format: RULE_PACK_FORMAT,
  id: 'pack-crypto-spam',
  name: 'Crypto Spam Shield',
  description: 'Blocks common crypto giveaway domains and keywords',
  author: 'KeepXClean Community',
  version: '1.0.0',
  locale: 'en',
  updatedAt: '2026-11-22T00:00:00.000Z',
  keywords: [
    {
      id: 'pk-kw-1',
      pattern: 'double your eth',
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    },
  ],
  domains: [
    {
      id: 'pk-dom-1',
      domain: 'airdrop-scam.example',
      enabled: true,
    },
  ],
  blockedUids: [
    {
      uid: '99001122',
      screenName: 'scambot99',
      addedAt: 1_700_000_000_000,
    },
  ],
};

function makeTweet(overrides: Partial<ExtractedTweet> = {}): ExtractedTweet {
  return {
    tweetId: '1850000000000000001',
    text: 'Ordinary conversation message about software engineering',
    urls: [],
    hashtagCount: 0,
    cashtagCount: 0,
    isPromoted: false,
    isReply: false,
    replyCount: 0,
    favoriteCount: 0,
    viewCount: 0,
    scene: 'timeline',
    author: {
      restId: '5001',
      screenName: 'regular_user',
      name: 'Regular User',
      bio: '',
      bioUrls: [],
      createdAt: '',
      accountAgeDays: 500,
      statusesCount: 300,
      dailyTweetRate: 1,
      followersCount: 800,
      friendsCount: 200,
      followRatio: 0.25,
      mediaCount: 0,
      favouritesCount: 0,
      isBlueVerified: false,
      following: false,
      defaultProfileImage: false,
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rule packs, target.disable, domains, cloudLangGroup.toggle & options.open', () => {
  it('installs, upgrades, toggles, and uninstalls offline rule packs without mutating personal lists', () => {
    let config = createDefaultConfig('standard');
    config.rules.keywords.items.push({
      id: 'personal-kw',
      pattern: 'my personal word',
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    });
    config.rules.domainFilter.items.push({
      id: 'personal-dom',
      domain: 'personal.example',
      enabled: true,
    });
    config.localBlocklistUids['12345'] = {
      uid: '12345',
      screenName: 'personal_block',
      addedAt: 1,
    };

    // Install
    config = applyConfigCommand(config, {
      type: 'pack.install',
      pack: samplePack,
    });
    expect(config.installedPacks).toHaveLength(1);
    expect(config.installedPacks![0]!.enabled).toBe(true);
    expect(config.rules.keywords.items.map((k) => k.id)).toEqual([
      'personal-kw',
    ]);
    expect(config.rules.domainFilter.items.map((d) => d.id)).toEqual([
      'personal-dom',
    ]);
    expect(Object.keys(config.localBlocklistUids)).toEqual(['12345']);

    // Disable one pack item and toggle pack off, then upgrade pack -> preserves enabled=false and still-present disabledItemIds
    config = applyConfigCommand(config, {
      type: 'target.disable',
      target: { kind: 'pack_item', id: 'pk-kw-1', packId: 'pack-crypto-spam' },
    });
    config = applyConfigCommand(config, {
      type: 'pack.toggle',
      id: 'pack-crypto-spam',
      enabled: false,
    });
    expect(config.installedPacks![0]!.enabled).toBe(false);

    config = applyConfigCommand(config, {
      type: 'pack.install',
      pack: {
        ...samplePack,
        version: '1.1.0',
      },
    });
    expect(config.installedPacks).toHaveLength(1);
    expect(config.installedPacks![0]!.version).toBe('1.1.0');
    expect(config.installedPacks![0]!.enabled).toBe(false);
    expect(config.installedPacks![0]!.disabledItemIds).toEqual(['pk-kw-1']);

    // Uninstall leaves zero residue and personal rules stay intact
    config = applyConfigCommand(config, {
      type: 'pack.uninstall',
      id: 'pack-crypto-spam',
    });
    expect(config.installedPacks).toEqual([]);
    expect(config.rules.keywords.items.map((k) => k.id)).toEqual([
      'personal-kw',
    ]);
    expect(config.rules.domainFilter.items.map((d) => d.id)).toEqual([
      'personal-dom',
    ]);
    expect(Object.keys(config.localBlocklistUids)).toEqual(['12345']);

    expect(() =>
      applyConfigCommand(config, {
        type: 'pack.toggle',
        id: 'missing-pack',
        enabled: true,
      })
    ).toThrow();
    expect(() =>
      applyConfigCommand(config, {
        type: 'pack.uninstall',
        id: 'missing-pack',
      })
    ).toThrow();
  });

  it('rejects malicious or invalid rule packs on install and schema validation', () => {
    const config = createDefaultConfig('standard');
    const forbiddenPayloads = [
      { ...samplePack, whitelistUids: {} },
      { ...samplePack, customApiBaseUrl: 'https://evil.example' },
      { ...samplePack, syncNativeXBlock: true },
      { ...samplePack, enableCrowdReport: true },
      JSON.parse(
        '{"format":"kxc-pack-v1","id":"p1","name":"P","description":"D","version":"1.0","updatedAt":"2026-11-22T00:00:00.000Z","__proto__":{"x":1}}'
      ),
      {
        ...samplePack,
        keywords: [
          {
            id: 'bad-re',
            pattern: '[unterminated',
            isRegex: true,
            scopes: ['text'],
            enabled: true,
          },
        ],
      },
      {
        ...samplePack,
        domains: [{ id: 'bad-dom', domain: 'not a domain', enabled: true }],
      },
      {
        ...samplePack,
        blockedUids: [{ uid: 'not_numeric', screenName: 'x', addedAt: 1 }],
      },
    ];

    for (const payload of forbiddenPayloads) {
      expect(() =>
        applyConfigCommand(config, { type: 'pack.install', pack: payload })
      ).toThrow();
    }

    // Duplicate pack IDs in config rejected by both localized and silent validators
    const installed = { ...samplePack, enabled: true, installedAt: 100 };
    const dupConfig = { ...config, installedPacks: [installed, installed] };
    expect(() => validateConfig(dupConfig)).toThrow();
    expect(() => validateConfigSilent(dupConfig)).toThrow();
  });

  it('disables all 4 disableable matchedTarget kinds atomically and flips evaluateTweet to allow', () => {
    const snapshot = createDefaultCrowdSnapshot();
    let config = createDefaultConfig('standard');
    config.locale = 'en';

    // 1. Custom keyword
    config = applyConfigCommand(config, {
      type: 'keyword.save',
      item: {
        id: 'kw-t1',
        pattern: 'secret promo token',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
    });
    const kwTweet = makeTweet({ text: 'Claim your secret promo token now!' });
    const kwDecision = evaluateTweet(kwTweet, config, snapshot);
    expect(kwDecision.blocked).toBe(true);
    expect(kwDecision.matchedTarget).toEqual({ kind: 'keyword', id: 'kw-t1' });
    config = applyConfigCommand(config, {
      type: 'target.disable',
      target: kwDecision.matchedTarget!,
    });
    expect(evaluateTweet(kwTweet, config, snapshot).blocked).toBe(false);

    // 2. Cloud keyword
    const cloudTweet = makeTweet({
      author: { ...makeTweet().author, bio: 'Visit onlyfans.com/promo now' },
    });
    const cloudDecision = evaluateTweet(cloudTweet, config, snapshot);
    expect(cloudDecision.blocked).toBe(true);
    expect(cloudDecision.matchedTarget?.kind).toBe('cloud_keyword');
    config = applyConfigCommand(config, {
      type: 'target.disable',
      target: cloudDecision.matchedTarget!,
    });
    expect(evaluateTweet(cloudTweet, config, snapshot).blocked).toBe(false);

    // 3. Domain filter item
    config = applyConfigCommand(config, {
      type: 'domain.save',
      item: { id: 'dom-t1', domain: 'phish.example', enabled: true },
    });
    const domTweet = makeTweet({ urls: ['https://login.phish.example/auth'] });
    const domDecision = evaluateTweet(domTweet, config, snapshot);
    expect(domDecision.blocked).toBe(true);
    expect(domDecision.matchedTarget).toEqual({
      kind: 'domain',
      id: 'dom-t1',
    });
    config = applyConfigCommand(config, {
      type: 'target.disable',
      target: domDecision.matchedTarget!,
    });
    expect(evaluateTweet(domTweet, config, snapshot).blocked).toBe(false);

    // 4. Rule pack items (keyword, domain, blockedUid)
    config = applyConfigCommand(config, {
      type: 'pack.install',
      pack: samplePack,
    });
    const packTweets = [
      makeTweet({ text: 'Send 1 ETH and double your eth right now!' }),
      makeTweet({ urls: ['https://claim.airdrop-scam.example/go'] }),
      makeTweet({
        author: { ...makeTweet().author, restId: '99001122', screenName: 'scambot99' },
      }),
    ];
    for (const pt of packTweets) {
      const dec = evaluateTweet(pt, config, snapshot);
      expect(dec.blocked).toBe(true);
      expect(dec.matchedTarget?.kind).toBe('pack_item');
      config = applyConfigCommand(config, {
        type: 'target.disable',
        target: dec.matchedTarget!,
      });
      // Idempotent second call
      config = applyConfigCommand(config, {
        type: 'target.disable',
        target: dec.matchedTarget!,
      });
      expect(evaluateTweet(pt, config, snapshot).blocked).toBe(false);
    }

    // Non-disableable 'rule' target and unknown IDs must throw
    expect(() =>
      applyConfigCommand(config, {
        type: 'target.disable',
        target: { kind: 'rule', id: 'highFrequency' },
      })
    ).toThrow();
    expect(() =>
      applyConfigCommand(config, {
        type: 'target.disable',
        target: { kind: 'domain', id: 'nonexistent-domain' },
      })
    ).toThrow();
    expect(() =>
      applyConfigCommand(config, {
        type: 'target.disable',
        target: { kind: 'pack_item', id: 'nonexistent-item', packId: 'pack-crypto-spam' },
      })
    ).toThrow();
  });

  it('supports domain.save/delete with optimistic concurrency and cloudLangGroup.toggle with default materialization', () => {
    let config = createDefaultConfig('standard');
    config.locale = 'ja';
    expect(config.enabledCloudLangGroups).toBeUndefined();

    // Toggling off 'en' materializes ['universal', 'en', 'ja'] first -> ['universal', 'ja']
    config = applyConfigCommand(config, {
      type: 'cloudLangGroup.toggle',
      group: 'en',
      enabled: false,
    });
    expect(config.enabledCloudLangGroups).toEqual(['universal', 'ja']);

    // Adding 'ko' appends cleanly
    config = applyConfigCommand(config, {
      type: 'cloudLangGroup.toggle',
      group: 'ko',
      enabled: true,
    });
    expect(config.enabledCloudLangGroups).toEqual(['universal', 'ja', 'ko']);

    // Toggling all remaining off yields explicit empty array []
    for (const group of ['universal', 'ja', 'ko'] as const) {
      config = applyConfigCommand(config, {
        type: 'cloudLangGroup.toggle',
        group,
        enabled: false,
      });
    }
    expect(config.enabledCloudLangGroups).toEqual([]);

    // Domain save normalizes domain, preserves preset, and rejects stale expected digest
    config = applyConfigCommand(config, {
      type: 'domain.save',
      item: {
        id: 'dom-1',
        domain: 'https://WWW.SpamSite.Example/offer?ref=1',
        onlyInReplies: true,
        enabled: true,
      },
    });
    expect(config.preset).toBe('standard');
    const saved = config.rules.domainFilter.items[0]!;
    expect(saved.domain).toBe('spamsite.example');
    expect(saved.onlyInReplies).toBe(true);

    const updated = applyConfigCommand(config, {
      type: 'domain.save',
      item: { ...saved, note: 'Updated note', onlyInReplies: false },
      expected: digest(saved),
    });
    expect(updated.rules.domainFilter.items[0]!.note).toBe('Updated note');
    expect(updated.rules.domainFilter.items[0]!.onlyInReplies).toBeUndefined();

    expect(() =>
      applyConfigCommand(updated, {
        type: 'domain.save',
        item: saved,
        expected: digest(saved),
      })
    ).toThrow(ERROR_LOCALES.ja.domainModifiedReopen);

    const deleted = applyConfigCommand(updated, {
      type: 'domain.delete',
      id: 'dom-1',
      expected: digest(updated.rules.domainFilter.items[0]),
    });
    expect(deleted.rules.domainFilter.items).toEqual([]);
  });

  it('validates options.open deep-link pages/queries against injection and reuses open options tabs safely', async () => {
    const base = 'chrome-extension://test/options.html';
    expect(buildOptionsUrl(base)).toBe(`${base}#/rules`);
    expect(
      buildOptionsUrl(base, 'keywords', { tab: 'domains', focus: 'dom-1' })
    ).toBe(`${base}#/keywords?tab=domains&focus=dom-1`);
    expect(
      buildOptionsUrl(base, 'accounts', { action: 'import' })
    ).toBe(`${base}#/accounts?action=import`);

    // Reject path traversal, unknown pages, unknown query keys, XSS/injection values, and proto keys
    expect(() => buildOptionsUrl(base, '../popup')).toThrow();
    expect(() => buildOptionsUrl(base, 'admin')).toThrow();
    expect(() =>
      buildOptionsUrl(base, 'rules', { redirect: 'https://evil.com' })
    ).toThrow();
    expect(() =>
      buildOptionsUrl(base, 'rules', { focus: '<script>alert(1)</script>' })
    ).toThrow();
    expect(() =>
      buildOptionsUrl(base, 'rules', { focus: 'javascript:alert(1)' })
    ).toThrow();
    expect(() =>
      buildOptionsUrl(base, 'rules', JSON.parse('{"__proto__":"x"}'))
    ).toThrow();

    // When only x.com tab is open, opens a new options tab (NEVER updates x.com tab!)
    const mock = mockChrome({});
    const created = await openOptionsPage('keywords', {
      tab: 'packs',
      pack: 'pack-1',
    });
    expect(mock.api.tabs.create).toHaveBeenCalledWith({
      url: `${base}#/keywords?tab=packs&pack=pack-1`,
    });
    expect(mock.api.tabs.update).not.toHaveBeenCalled();

    // Second open reuses the existing options.html tab via tabs.update + windows.update
    expect(created?.id).toBeDefined();
    await openOptionsPage('rules', { focus: 'grokFilter' });
    expect(mock.api.tabs.create).toHaveBeenCalledTimes(1);
    expect(mock.api.tabs.update).toHaveBeenCalledWith(created!.id, {
      url: `${base}#/rules?focus=grokFilter`,
      active: true,
    });
    expect(mock.api.windows.update).toHaveBeenCalledWith(1, { focused: true });

    // Refuses to reuse a lookalike prefix tab (options.html2#/evil) and opens a fresh options tab
    const lookalikeMock = mockChrome(
      {},
      {},
      {
        tabs: [
          {
            id: 99,
            active: false,
            url: 'chrome-extension://test/options.html2#/evil',
            windowId: 1,
          },
        ],
      }
    );
    await openOptionsPage('rules', { focus: 'grokFilter' });
    expect(lookalikeMock.api.tabs.update).not.toHaveBeenCalled();
    expect(lookalikeMock.api.tabs.create).toHaveBeenCalledWith({
      url: `${base}#/rules?focus=grokFilter`,
    });
  });
});
