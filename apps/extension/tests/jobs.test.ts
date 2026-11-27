import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  STORAGE_KEYS,
  type InterceptionLogEntry,
} from '@keepxclean/shared';
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
  readState,
  rollStats,
} from '../src/background/repository';
import {
  defaultCloudSyncMeta,
  defaultParseHealth,
  localDate,
  UI_KEYS,
  type ImportJob,
  type Operation,
  type Stats,
} from '../src/services/model';
import { getState, subscribe } from '../src/state/store';
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
    config.syncNativeXBlock = true;
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

  it('tracks 7-day rolling dailyHistory across midnight crossings, seeds v0.1.2 upgrades, and avoids duplicate double-counting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 14, 0, 0));

    // Seed v0.1.2-style stats without dailyHistory
    mock.values[UI_KEYS.stats] = {
      todayDate: '2026-11-10',
      todayBlocked: 4,
      totalBlocked: 10,
      todayAdsHidden: 2,
      totalAdsHidden: 5,
      byRule: { keyword: 10, promoted_ad: 5 },
    };
    const migrated = rollStats(mock.values[UI_KEYS.stats] as Stats);
    expect(migrated.dailyHistory).toHaveLength(7);
    expect(migrated.dailyHistory!.map((d) => d.date)).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
    ]);
    expect(migrated.dailyHistory![6]).toEqual({
      date: '2026-11-10',
      blocked: 4,
      ads: 2,
    });

    // Append logs on Nov 10 (including a duplicate tweetId and a promoted_ad)
    const nov10Ts = new Date(2026, 10, 10, 15, 0, 0).getTime();
    await appendLogs([
      {
        id: 'd1',
        tweetId: '50001',
        authorUid: '1',
        authorScreenName: 'a',
        authorName: 'A',
        tweetSnippet: 'x',
        scene: 'timeline',
        ruleId: 'keyword',
        reasonText: 'kw',
        timestamp: nov10Ts,
      },
      {
        id: 'd1-dup',
        tweetId: '50001',
        authorUid: '1',
        authorScreenName: 'a',
        authorName: 'A',
        tweetSnippet: 'x',
        scene: 'timeline',
        ruleId: 'keyword',
        reasonText: 'kw',
        timestamp: nov10Ts,
      },
      {
        id: 'ad1',
        tweetId: '50002',
        authorUid: '2',
        authorScreenName: 'b',
        authorName: 'B',
        tweetSnippet: 'ad',
        scene: 'timeline',
        ruleId: 'promoted_ad',
        reasonText: 'ad',
        timestamp: nov10Ts,
      },
    ]);
    let stats = mock.values[UI_KEYS.stats] as Stats;
    expect(stats.dailyHistory![6]).toEqual({
      date: '2026-11-10',
      blocked: 5,
      ads: 3,
    });

    // Cross 3 days forward to Nov 13 and append a new block
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0, 0));
    await appendLogs([
      {
        id: 'd2',
        tweetId: '50003',
        authorUid: '3',
        authorScreenName: 'c',
        authorName: 'C',
        tweetSnippet: 'spam',
        scene: 'reply',
        ruleId: 'grok_filter',
        reasonText: 'grok',
        timestamp: Date.now(),
      },
    ]);
    stats = mock.values[UI_KEYS.stats] as Stats;
    expect(stats.todayDate).toBe(localDate());
    expect(stats.todayBlocked).toBe(1);
    expect(stats.dailyHistory).toHaveLength(7);
    expect(stats.dailyHistory!.find((d) => d.date === '2026-11-10')).toEqual({
      date: '2026-11-10',
      blocked: 5,
      ads: 3,
    });
    expect(stats.dailyHistory![6]).toEqual({
      date: '2026-11-13',
      blocked: 1,
      ads: 0,
    });

    // Cross >7 days forward to Nov 22: Nov 10 and Nov 13 are pruned to 7 clean days
    vi.setSystemTime(new Date(2026, 10, 22, 12, 0, 0));
    const pruned = rollStats(stats);
    expect(pruned.dailyHistory).toHaveLength(7);
    expect(pruned.dailyHistory![0]!.date).toBe('2026-11-16');
    expect(pruned.dailyHistory![6]!.date).toBe('2026-11-22');
    expect(pruned.dailyHistory!.every((d) => d.blocked === 0 && d.ads === 0)).toBe(
      true
    );
  });

  it('sets onboardingDismissed=false only on fresh install, hydrates true on v0.1.2 upgrade, and never opens tabs', async () => {
    // 1. Fresh install (empty storage)
    mock = mockChrome({});
    await initializeStorage();
    expect(mock.api.tabs.create).not.toHaveBeenCalled();
    const freshState = await readState();
    expect(freshState.config.onboardingDismissed).toBe(false);
    expect(freshState.config.syncNativeXBlock).toBe(false);
    expect(freshState.config.enableCrowdReport).toBe(false);
    expect(freshState.cloudSync).toEqual(defaultCloudSyncMeta());
    expect(freshState.health).toEqual(defaultParseHealth());

    // 2. Upgrade from v0.1.2 (config present without onboardingDismissed, privacy flags true, stuck cloudSync syncing)
    const v012 = createDefaultConfig('standard');
    v012.syncNativeXBlock = true;
    v012.enableCrowdReport = true;
    delete v012.onboardingDismissed;
    mock = mockChrome({
      [STORAGE_KEYS.CONFIG]: v012,
      [UI_KEYS.cloudSync]: { enabled: true, status: 'syncing' },
    });
    await initializeStorage();
    expect(mock.api.tabs.create).not.toHaveBeenCalled();
    const upgraded = await readState();
    expect(upgraded.config.onboardingDismissed).toBe(true);
    expect(upgraded.config.syncNativeXBlock).toBe(true);
    expect(upgraded.config.enableCrowdReport).toBe(true);
    expect(upgraded.cloudSync.status).toBe('idle');
    expect(upgraded.cloudSync.enabled).toBe(true);
  });

  it('rejects prototype-key and invalid ruleId values in appendLogs without corrupting stats.byRule or dailyHistory', async () => {
    await initializeStorage();
    const now = Date.now();
    await appendLogs([
      {
        id: 'bad-1',
        tweetId: '88001',
        authorUid: '1',
        authorScreenName: 'a',
        authorName: 'A',
        tweetSnippet: 'x',
        scene: 'timeline',
        ruleId: 'toString' as 'keyword',
        reasonText: 'spoof',
        timestamp: now,
      },
      {
        id: 'bad-2',
        tweetId: '88002',
        authorUid: '1',
        authorScreenName: 'a',
        authorName: 'A',
        tweetSnippet: 'x',
        scene: 'timeline',
        ruleId: '__proto__' as 'keyword',
        reasonText: 'spoof',
        timestamp: now,
      },
      {
        id: 'bad-3',
        tweetId: '88003',
        authorUid: '1',
        authorScreenName: 'a',
        authorName: 'A',
        tweetSnippet: 'x',
        scene: 'timeline',
        ruleId: 'constructor' as 'keyword',
        reasonText: 'spoof',
        timestamp: now,
      },
      {
        id: 'bad-4',
        tweetId: '88004',
        authorUid: '1',
        authorScreenName: 'a',
        authorName: 'A',
        tweetSnippet: 'x',
        scene: 'timeline',
        ruleId: undefined as unknown as 'keyword',
        reasonText: 'spoof',
        timestamp: now,
      },
      {
        id: 'good-1',
        tweetId: '88005',
        authorUid: '2',
        authorScreenName: 'b',
        authorName: 'B',
        tweetSnippet: 'ok',
        scene: 'timeline',
        ruleId: 'grok_filter',
        reasonText: 'valid',
        timestamp: now,
      },
    ]);

    const stats = mock.values[UI_KEYS.stats] as Stats;
    expect(Object.prototype.hasOwnProperty.call(stats.byRule, 'toString')).toBe(
      false
    );
    expect(
      Object.prototype.hasOwnProperty.call(stats.byRule, 'constructor')
    ).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(stats.byRule, 'undefined')).toBe(
      false
    );
    expect(stats.byRule.grok_filter).toBe(1);
    expect(stats.totalBlocked).toBe(1);
    expect(stats.todayBlocked).toBe(1);
    expect(stats.dailyHistory![6]!.blocked).toBe(1);
  });

  it('rolls v0.1.2 stats on storage change and survives UI_KEYS.stats removal across dayTimer ticks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 12, 0, 0));
    await initializeStorage();
    const initialState = await readState();
    mock.api.runtime.sendMessage.mockResolvedValue({
      ok: true,
      data: initialState,
    });

    const unsubscribe = subscribe(() => {});
    try {
      await vi.waitFor(() => {
        expect(getState().loading).toBe(false);
        expect(getState().data).toBeDefined();
      });

      // 1. Storage receives v0.1.2 stats without dailyHistory -> rolled immediately
      await mock.api.storage.local.set({
        [UI_KEYS.stats]: {
          todayDate: '2026-11-10',
          todayBlocked: 7,
          totalBlocked: 19,
          byRule: { keyword: 19 },
        },
      });
      expect(getState().data?.stats.dailyHistory).toHaveLength(7);
      expect(getState().data?.stats.dailyHistory![6]).toEqual({
        date: '2026-11-10',
        blocked: 7,
        ads: 0,
      });

      // 2. Removing UI_KEYS.stats falls back to defaultStats() and dayTimer ticks cleanly across midnight
      await mock.api.storage.local.remove(UI_KEYS.stats);
      expect(getState().data?.stats).toBeDefined();
      expect(getState().data?.stats.dailyHistory).toHaveLength(7);
      expect(getState().data?.stats.todayBlocked).toBe(0);

      vi.setSystemTime(new Date(2026, 10, 11, 0, 5, 0));
      expect(() => vi.advanceTimersByTime(31_000)).not.toThrow();
      expect(getState().data?.stats.todayDate).toBe('2026-11-11');
    } finally {
      unsubscribe();
    }
  });

  it('rejects coerced tweetIds, out-of-range timestamps, invalid scenes, getters, and sanitizes untrusted log fields in appendLogs (R2-3 / N2)', async () => {
    await initializeStorage();
    const now = Date.now();
    let arrayGetterCalls = 0;
    let propGetterCalls = 0;

    const baseValid = {
      id: 'ok-base',
      tweetId: '99100',
      authorUid: '12345',
      authorScreenName: 'alice',
      authorName: 'Alice',
      tweetSnippet: 'hello world',
      scene: 'reply' as const,
      ruleId: 'keyword' as const,
      reasonText: 'matched kw',
      timestamp: now,
    };

    const withOwnGetter: Record<string, unknown> = { ...baseValid };
    Object.defineProperty(withOwnGetter, 'tweetId', {
      enumerable: true,
      get() {
        propGetterCalls += 1;
        return '99199';
      },
    });

    const withCustomProto = Object.assign(
      Object.create({ inherited: true }),
      { ...baseValid, tweetId: '99198' }
    );

    const malicious: unknown[] = [
      // Coerced / malformed tweetIds (repeated array to ensure 0 dedup bypass)
      { ...baseValid, tweetId: ['55555'] },
      { ...baseValid, tweetId: ['55555'] },
      { ...baseValid, tweetId: 66666 },
      { ...baseValid, tweetId: '1'.repeat(31) },
      { ...baseValid, tweetId: 'abc' },
      // Out-of-range / non-numeric timestamps
      { ...baseValid, tweetId: '99101', timestamp: Number.MAX_SAFE_INTEGER },
      { ...baseValid, tweetId: '99102', timestamp: 8_640_000_000_000_001 },
      { ...baseValid, tweetId: '99103', timestamp: 1e20 },
      { ...baseValid, tweetId: '99104', timestamp: -1 },
      { ...baseValid, tweetId: '99105', timestamp: Number.NaN },
      { ...baseValid, tweetId: '99106', timestamp: Number.POSITIVE_INFINITY },
      { ...baseValid, tweetId: '99107', timestamp: '1700000000000' },
      // Invalid scenes
      { ...baseValid, tweetId: '99108', scene: 'toString' },
      { ...baseValid, tweetId: '99109', scene: ['reply'] },
      { ...baseValid, tweetId: '99110', scene: '' },
      // Own getter & custom prototype
      withOwnGetter,
      withCustomProto,
      // Valid boundary timestamps & field sanitization
      {
        ...baseValid,
        id: 'boundary-zero',
        tweetId: '99201',
        timestamp: 0,
        scene: undefined,
        authorUid: 'toString',
        authorAvatar: 'javascript:alert(1)',
        evidence: { bad: 1 },
        hugeBlob: 'A'.repeat(20_000),
      },
      {
        ...baseValid,
        id: 'boundary-max',
        tweetId: '99202',
        timestamp: 8_640_000_000_000_000,
        authorAvatar: 'https://pbs.twimg.com/profile_images/1/avatar.jpg',
        evidence: [
          { key: 'kw', label: 'Keyword', value: 'spam' },
          { label: 'Count', value: 3 },
          { label: 'Bad', value: { nested: true } },
        ],
      },
      {
        ...baseValid,
        id: 'valid-now',
        tweetId: '99203',
        timestamp: now,
      },
    ];

    // Sparse array with an element getter that must never be invoked
    const sparseEntries: unknown[] = [];
    sparseEntries[1] = malicious[0];
    Object.defineProperty(sparseEntries, 2, {
      enumerable: true,
      get() {
        arrayGetterCalls += 1;
        return { ...baseValid, tweetId: '99197' };
      },
    });
    sparseEntries[3] = malicious[malicious.length - 1];

    await appendLogs(malicious.slice(0, -1) as InterceptionLogEntry[]);
    await appendLogs(sparseEntries as InterceptionLogEntry[]);

    expect(arrayGetterCalls).toBe(0);
    expect(propGetterCalls).toBe(0);

    const storedLogs = mock.values[
      STORAGE_KEYS.INTERCEPTION_LOGS
    ] as InterceptionLogEntry[];
    const storedById = new Map(storedLogs.map((l) => [l.tweetId, l]));
    expect([...storedById.keys()].sort()).toEqual(['99201', '99202', '99203']);

    const zeroEntry = storedById.get('99201')!;
    expect(zeroEntry.scene).toBe('timeline');
    expect(zeroEntry.authorUid).toBe('');
    expect(zeroEntry.authorAvatar).toBeUndefined();
    expect(zeroEntry.evidence).toBeUndefined();
    expect('hugeBlob' in zeroEntry).toBe(false);

    const maxEntry = storedById.get('99202')!;
    expect(maxEntry.authorAvatar).toBe(
      'https://pbs.twimg.com/profile_images/1/avatar.jpg'
    );
    expect(maxEntry.evidence).toEqual([
      { key: 'kw', label: 'Keyword', value: 'spam' },
      { label: 'Count', value: 3 },
    ]);

    const stats = mock.values[UI_KEYS.stats] as Stats;
    expect(stats.totalBlocked).toBe(3);
    expect(stats.todayBlocked).toBe(1);
    expect(stats.byRule.keyword).toBe(3);
    expect(
      stats.dailyHistory?.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    ).toBe(true);
  });

  it('rejects array-coerced UIDs in startImport without adding them to job.ids', async () => {
    mock.api.tabs.sendMessage.mockImplementation(
      async (_tab: unknown, message: unknown) =>
        (message as { action: string }).action === 'FETCH_EXISTING_BLOCKS'
          ? {
              ok: true,
              viewerUid: '123',
              ids: ['1001', ['1002'], 1003],
              nextCursor: '0',
            }
          : { ok: true, viewerUid: '123' }
    );
    await startImport(7);
    await vi.waitFor(() =>
      expect((mock.values[UI_KEYS.imports] as ImportJob[])[0].status).toBe(
        'preview'
      )
    );
    const job = (mock.values[UI_KEYS.imports] as ImportJob[])[0];
    expect(job.ids).toEqual(['1001']);
    expect(job.invalid).toBe(2);
  });
});
