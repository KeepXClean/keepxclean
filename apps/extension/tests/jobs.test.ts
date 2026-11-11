import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfig, STORAGE_KEYS } from '@keepxclean/shared';
import {
  applyImport,
  changeReason,
  resolveAccount,
  startBlock,
  startImport,
  undoBlock,
  retryBlock,
  retryImport,
} from '../src/background/jobs';
import {
  appendLogs,
  initializeStorage,
  readConfig,
} from '../src/background/repository';
import { UI_KEYS, type ImportJob, type Operation } from '../src/services/model';
import { mockChrome } from './mock-chrome';

let mock: ReturnType<typeof mockChrome>;
const entry = { uid: '456', screenName: 'sample', addedAt: 10 };
beforeEach(() => {
  const config = createDefaultConfig();
  config.enableCrowdReport = false;
  mock = mockChrome({ [STORAGE_KEYS.CONFIG]: config });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('durable operation boundaries', () => {
  it('waits for the undo window and keeps native success independent from a non-counted community submission', async () => {
    vi.useFakeTimers();
    const config = await readConfig();
    config.enableCrowdReport = true;
    config.syncNativeXBlock = true;
    mock.values[STORAGE_KEYS.CONFIG] = config;
    mock.values[UI_KEYS.viewers] = {
      '7': {
        restId: '123',
        reporterHash: 'a'.repeat(64),
        accountAgeDays: 365,
        followersCount: 100,
      },
    };
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, countedPublicly: false }),
    }));
    vi.stubGlobal('fetch', fetch);
    await startBlock(entry, 7);
    await vi.advanceTimersByTimeAsync(4400);
    expect(mock.api.tabs.sendMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect((mock.values[UI_KEYS.operations] as Operation[])[0]).toMatchObject({
      local: 'succeeded',
      nativeX: 'succeeded',
      community: 'not_counted',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mock.values[STORAGE_KEYS.CROWD_SNAPSHOT]).toBeUndefined();
  });
  it('marks an unacknowledged native request unknown and prevents a blind retry', async () => {
    vi.useFakeTimers();
    const config = await readConfig();
    config.syncNativeXBlock = true;
    mock.values[STORAGE_KEYS.CONFIG] = config;
    mock.values[UI_KEYS.viewers] = { '7': { restId: '123' } };
    mock.api.tabs.sendMessage.mockImplementation(() => new Promise(() => {}));
    const id = await startBlock(entry, 7);
    await vi.advanceTimersByTimeAsync(30000);
    expect((mock.values[UI_KEYS.operations] as Operation[])[0]).toMatchObject({
      local: 'succeeded',
      nativeX: 'unknown',
    });
    await expect(retryBlock(id, 'nativeX')).rejects.toThrow(
      'Only explicitly failed stages can be retried'
    );
  });
  it('retries only failed community import batches while retaining all local results', async () => {
    const config = await readConfig();
    config.enableCrowdReport = true;
    mock.values[STORAGE_KEYS.CONFIG] = config;
    mock.values[UI_KEYS.viewers] = {
      '7': {
        restId: '123',
        reporterHash: 'a'.repeat(64),
        accountAgeDays: 365,
        followersCount: 100,
      },
    };
    const ids = Array.from({ length: 502 }, (_, i) => String(1000 + i));
    mock.api.tabs.sendMessage.mockImplementation(async (_tab, message) =>
      (message as { action: string }).action === 'FETCH_EXISTING_BLOCKS'
        ? { ok: true, viewerUid: '123', ids, nextCursor: '0' }
        : { ok: true, viewerUid: '123' }
    );
    let attempt = 0;
    const fetch = vi.fn(async (_url: string, init: { body: string }) => {
      if (++attempt === 2) throw Error('offline');
      return {
        ok: true,
        json: async () => ({
          ok: true,
          countedPublicly: true,
          importedCount: JSON.parse(init.body).targetUids.length,
        }),
      };
    });
    vi.stubGlobal('fetch', fetch);
    const id = await startImport(7);
    await vi.waitFor(() =>
      expect((mock.values[UI_KEYS.imports] as ImportJob[])[0].status).toBe(
        'preview'
      )
    );
    await applyImport(id, true, false);
    await vi.waitFor(() =>
      expect((mock.values[UI_KEYS.imports] as ImportJob[])[0].status).toBe(
        'done'
      )
    );
    expect((mock.values[UI_KEYS.imports] as ImportJob[])[0]).toMatchObject({
      localAdded: 502,
      communityAdded: 500,
      failedBatches: [ids.slice(500)],
    });
    await retryImport(id);
    await vi.waitFor(() =>
      expect((mock.values[UI_KEYS.imports] as ImportJob[])[0].status).toBe(
        'done'
      )
    );
    expect((mock.values[UI_KEYS.imports] as ImportJob[])[0]).toMatchObject({
      communityAdded: 502,
      failedBatches: [],
    });
    expect(
      fetch.mock.calls.map(
        ([, init]) => JSON.parse(init.body).targetUids.length
      )
    ).toEqual([500, 2, 2]);
    expect(Object.keys((await readConfig()).localBlocklistUids)).toHaveLength(
      502
    );
  });
  it('undoes before external writes and restores the prior whitelist', async () => {
    vi.useFakeTimers();
    const config = createDefaultConfig();
    config.whitelistUids[entry.uid] = entry;
    mock.values[STORAGE_KEYS.CONFIG] = config;
    const id = await startBlock(entry, 7);
    expect(mock.api.tabs.sendMessage).not.toHaveBeenCalled();
    await changeReason(id, 'spam');
    await changeReason(id, 'scam');
    expect(mock.api.tabs.sendMessage).not.toHaveBeenCalled();
    await undoBlock(id);
    const restored = await readConfig();
    expect(restored.whitelistUids[entry.uid]).toEqual(entry);
    expect(restored.localBlocklistUids[entry.uid]).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mock.api.tabs.sendMessage).not.toHaveBeenCalled();
    expect((mock.values[UI_KEYS.operations] as Operation[])[0].cancelled).toBe(
      true
    );
  });
  it('does not undo a later account change from another surface', async () => {
    vi.useFakeTimers();
    const id = await startBlock(entry, 7);
    const config = await readConfig();
    config.localBlocklistUids[entry.uid].reason = 'later';
    await mock.api.storage.local.set({ [STORAGE_KEYS.CONFIG]: config });
    await expect(undoBlock(id)).rejects.toThrow('subsequent changes');
  });
  it('deduplicates quick repeated clicks into one pending operation', async () => {
    vi.useFakeTimers();
    const a = await startBlock(entry, 7),
      b = await startBlock(entry, 7);
    expect(a).toBe(b);
    expect((mock.values[UI_KEYS.operations] as Operation[]).length).toBe(1);
  });
  it('imports more than 500 locally, preserves whitelist conflicts, and never shares when disabled', async () => {
    const config = await readConfig();
    config.whitelistUids['1000'] = { uid: '1000', screenName: '', addedAt: 1 };
    mock.values[STORAGE_KEYS.CONFIG] = config;
    const ids = Array.from({ length: 502 }, (_, i) => String(i + 1000));
    mock.api.tabs.sendMessage.mockImplementation(
      async (_tab: unknown, message: unknown) =>
        (message as { action: string }).action === 'FETCH_EXISTING_BLOCKS'
          ? {
              ok: true,
              viewerUid: '123',
              ids: [...ids, ids[0], 'invalid'],
              nextCursor: '0',
            }
          : { ok: true, viewerUid: '123' }
    );
    const id = await startImport(7);
    await vi.waitFor(() =>
      expect((mock.values[UI_KEYS.imports] as ImportJob[])[0].status).toBe(
        'preview'
      )
    );
    const job = (mock.values[UI_KEYS.imports] as ImportJob[])[0];
    expect(job.ids.length).toBe(502);
    expect(job.invalid).toBe(1);
    await applyImport(id, false, false);
    const result = await readConfig();
    expect(Object.keys(result.localBlocklistUids).length).toBe(501);
    expect(result.whitelistUids['1000']).toBeDefined();
    expect((mock.values[UI_KEYS.imports] as ImportJob[])[0].localAdded).toBe(
      501
    );
  });
  it('does not mistake failed blacklist reading for an empty successful preview', async () => {
    mock.api.tabs.sendMessage.mockResolvedValue({ ok: false, viewerUid: '' });
    const id = await startImport(7);
    await vi.waitFor(() =>
      expect(
        (mock.values[UI_KEYS.imports] as ImportJob[]).find((j) => j.id === id)
          ?.status
      ).toBe('error')
    );
    await expect(applyImport(id, false, false)).rejects.toThrow('preview');
  });
  it('keeps corrupt config intact and backs it up for explicit recovery', async () => {
    const corrupt = { version: 9, important: 'keep me' };
    mock.values[STORAGE_KEYS.CONFIG] = corrupt;
    await initializeStorage();
    await expect(readConfig()).rejects.toThrow('version');
    expect(mock.values[STORAGE_KEYS.CONFIG]).toEqual(corrupt);
    expect((mock.values[UI_KEYS.backup] as { config: unknown }).config).toEqual(
      corrupt
    );
  });
  it('does not count repeated log batches or clearing retained logs as new history', async () => {
    await initializeStorage();
    const log = {
      id: 'a',
      tweetId: '789',
      authorUid: '456',
      authorScreenName: '',
      authorName: '',
      tweetSnippet: 'sample',
      scene: 'timeline' as const,
      ruleId: 'keyword' as const,
      reasonText: 'sample',
      timestamp: Date.now(),
    };
    await appendLogs([log, log]);
    await appendLogs([log]);
    await mock.api.storage.local.set({ [STORAGE_KEYS.INTERCEPTION_LOGS]: [] });
    await appendLogs([log]);
    expect(mock.values[STORAGE_KEYS.INTERCEPTION_LOGS]).toEqual([]);
    expect(
      (mock.values[UI_KEYS.stats] as { totalBlocked: number }).totalBlocked
    ).toBe(1);
  });
  it('keeps deduplication after the visible 200-row log window rolls over', async () => {
    await initializeStorage();
    const logs = Array.from({ length: 201 }, (_, i) => ({
      id: String(i),
      tweetId: String(1000 + i),
      authorUid: '456',
      authorScreenName: '',
      authorName: '',
      tweetSnippet: '',
      scene: 'timeline' as const,
      ruleId: 'keyword' as const,
      reasonText: 'test',
      timestamp: Date.now(),
    }));
    await appendLogs(logs);
    await appendLogs([logs[200]]);
    expect(
      (mock.values[UI_KEYS.stats] as { totalBlocked: number }).totalBlocked
    ).toBe(201);
  });
  it('resets today at local midnight while preserving migrated cumulative statistics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 23, 59));
    mock.values[STORAGE_KEYS.STATS] = {
      totalBlocked: 50,
      todayBlocked: 9,
      byRule: { keyword: 50 },
    };
    await initializeStorage();
    expect(mock.values[UI_KEYS.stats]).toMatchObject({
      totalBlocked: 50,
      todayBlocked: 0,
      partialDay: '2026-11-10',
    });
    vi.setSystemTime(new Date(2026, 10, 11, 0, 1));
    await appendLogs([
      {
        id: 'a',
        tweetId: '789',
        authorUid: '456',
        authorScreenName: '',
        authorName: '',
        tweetSnippet: '',
        scene: 'timeline',
        ruleId: 'keyword',
        reasonText: 'test',
        timestamp: Date.now(),
      },
    ]);
    expect(mock.values[UI_KEYS.stats]).toMatchObject({
      totalBlocked: 51,
      todayBlocked: 1,
      todayDate: '2026-11-11',
      partialDay: undefined,
    });
  });
  it('separates promoted_ad counts from content interceptions and keeps logs ad-free', async () => {
    await initializeStorage();
    await appendLogs([
      {
        id: 'ad-1',
        tweetId: '9001',
        authorUid: '501',
        authorScreenName: 'brand_ad',
        authorName: 'Brand',
        tweetSnippet: 'Promoted offer',
        scene: 'timeline',
        ruleId: 'promoted_ad',
        reasonText: '原生推广广告',
        timestamp: Date.now(),
      },
      {
        id: 'kw-1',
        tweetId: '9002',
        authorUid: '502',
        authorScreenName: 'spammer',
        authorName: 'Spammer',
        tweetSnippet: 'Buy my course',
        scene: 'timeline',
        ruleId: 'keyword',
        reasonText: '命中关键词',
        timestamp: Date.now(),
      },
    ]);
    expect(mock.values[STORAGE_KEYS.INTERCEPTION_LOGS]).toHaveLength(1);
    expect(
      (mock.values[STORAGE_KEYS.INTERCEPTION_LOGS] as { id: string }[])[0].id
    ).toBe('kw-1');
    expect(mock.values[UI_KEYS.stats]).toMatchObject({
      todayBlocked: 1,
      totalBlocked: 1,
      todayAdsHidden: 1,
      totalAdsHidden: 1,
      byRule: { promoted_ad: 1, keyword: 1 },
    });
  });
  it('resolves @handle from local logs first and falls back to X tab RESOLVE_USER_HANDLE', async () => {
    await initializeStorage();
    await appendLogs([
      {
        id: 'kw-local',
        tweetId: '9100',
        authorUid: '77001',
        authorScreenName: 'cached_author',
        authorName: 'Cached Author',
        tweetSnippet: 'hello',
        scene: 'timeline',
        ruleId: 'keyword',
        reasonText: '命中关键词',
        timestamp: Date.now(),
      },
    ]);
    const localHit = await resolveAccount('@Cached_Author');
    expect(localHit).toMatchObject({
      uid: '77001',
      screenName: 'cached_author',
      name: 'Cached Author',
    });
    expect(mock.api.tabs.sendMessage).not.toHaveBeenCalled();

    mock.api.tabs.sendMessage.mockImplementation(async (_tab, msg) => {
      if ((msg as { action: string }).action === 'RESOLVE_USER_HANDLE') {
        return {
          ok: true,
          viewerUid: '123',
          user: {
            uid: '88002',
            screenName: 'live_user',
            name: 'Live User',
          },
        };
      }
      return { ok: true, viewerUid: '123' };
    });
    const remoteHit = await resolveAccount('https://x.com/live_user');
    expect(remoteHit).toEqual({
      uid: '88002',
      screenName: 'live_user',
      name: 'Live User',
      avatarUrl: undefined,
    });
  });
});
