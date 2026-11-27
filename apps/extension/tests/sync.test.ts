import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  DEFAULT_CLOUD_KEYWORDS,
  STORAGE_KEYS,
  type CrowdBlockSnapshot,
} from '@keepxclean/shared';
import { refreshSnapshot } from '../src/background/remote';
import { UI_KEYS } from '../src/services/model';
import { mockChrome } from './mock-chrome';
afterEach(() => vi.unstubAllGlobals());
describe('snapshot truth and selected origin', () => {
  it('records permission failures without replacing the usable cache', async () => {
    const config = createDefaultConfig();
    config.customApiBaseUrl = 'https://chosen.example';
    const snapshot = createDefaultCrowdSnapshot();
    const mock = mockChrome({
      [STORAGE_KEYS.CONFIG]: config,
      [STORAGE_KEYS.CROWD_SNAPSHOT]: snapshot,
      [UI_KEYS.sync]: { source: 'cache', lastSuccess: 10 },
    });
    mock.api.permissions.contains.mockResolvedValue(false);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(refreshSnapshot()).rejects.toThrow('permission');
    expect(fetch).not.toHaveBeenCalled();
    expect(mock.values[UI_KEYS.sync]).toMatchObject({
      status: 'error',
      lastSuccess: 10,
    });
    expect(mock.values[STORAGE_KEYS.CROWD_SNAPSHOT]).toEqual(snapshot);
  });
  it('keeps the last good snapshot and does not fall back to a different service', async () => {
    const config = createDefaultConfig();
    config.customApiBaseUrl = 'https://chosen.example';
    const snapshot = createDefaultCrowdSnapshot();
    const mock = mockChrome({
      [STORAGE_KEYS.CONFIG]: config,
      [STORAGE_KEYS.CROWD_SNAPSHOT]: snapshot,
      [UI_KEYS.sync]: { status: 'success', source: 'network', lastSuccess: 10 },
    });
    const fetch = vi.fn(async (_url: string, _options: unknown) => {
      throw Error('offline');
    });
    vi.stubGlobal('fetch', fetch);
    await expect(refreshSnapshot()).rejects.toThrow('offline');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://chosen.example/v1/snapshot.json'
    );
    expect(mock.values[STORAGE_KEYS.CROWD_SNAPSHOT]).toEqual(snapshot);
    expect(mock.values[UI_KEYS.sync]).toMatchObject({
      status: 'error',
      lastSuccess: 10,
    });
  });
  it('does not treat an invalid successful HTTP response as fresh data', async () => {
    const config = createDefaultConfig();
    config.customApiBaseUrl = 'https://chosen.example';
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: config });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ counts: {} }) }))
    );
    await expect(refreshSnapshot()).rejects.toThrow('version');
    expect(mock.values[STORAGE_KEYS.CROWD_SNAPSHOT]).toBeUndefined();
  });
  it('preserves built-in langGroup/packCategory and flows remote hotfix langGroup on refreshSnapshot', async () => {
    const config = createDefaultConfig();
    config.customApiBaseUrl = 'https://chosen.example';
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: config });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          version: 1,
          updatedAt: '2026-11-24T00:00:00.000Z',
          domain: 'chosen.example',
          totalAccounts: 1,
          totalReports: 5,
          counts: { '12345': { c: 5, t: 'spam' } },
          cloudKeywords: [
            // Legacy D1 0004 row defaulting built-in zh rule to 'universal' must keep built-in 'zh'
            {
              id: 'cloud-cliche-trivia-1',
              pattern: '冷知识',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
              langGroup: 'universal',
            },
            // Remote-only hotfix with explicit langGroup
            {
              id: 'cloud-hotfix-ko-99',
              pattern: '무료 코인 에어드랍',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
              langGroup: 'ko',
              packCategory: 'scam',
            },
            // Remote-only hotfix omitting langGroup defaults to 'universal'
            {
              id: 'cloud-hotfix-univ-1',
              pattern: 'free-airdrop-bot',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
            },
          ],
        }),
      }))
    );

    await refreshSnapshot();
    const saved = mock.values[
      STORAGE_KEYS.CROWD_SNAPSHOT
    ] as CrowdBlockSnapshot;
    expect(saved.cloudKeywords).toHaveLength(DEFAULT_CLOUD_KEYWORDS.length + 2);
    expect(
      saved.cloudKeywords.find((k) => k.id === 'cloud-cliche-trivia-1')
        ?.langGroup
    ).toBe('zh');
    const koHotfix = saved.cloudKeywords.find(
      (k) => k.id === 'cloud-hotfix-ko-99'
    );
    expect(koHotfix?.langGroup).toBe('ko');
    expect(koHotfix?.packCategory).toBe('scam');
    expect(
      saved.cloudKeywords.find((k) => k.id === 'cloud-hotfix-univ-1')?.langGroup
    ).toBe('universal');
  });
});
