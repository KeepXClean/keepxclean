import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  STORAGE_KEYS,
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
});
