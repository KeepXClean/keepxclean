import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  RULE_PACK_FORMAT,
  STORAGE_KEYS,
  type FilterConfig,
} from '@keepxclean/shared';
import {
  applySyncedPayloadToLocal,
  canonicalJson,
  chunkSyncPayload,
  CLOUD_SYNC_DEBOUNCE_MS,
  disableCloudSync,
  enableCloudSync,
  extractSyncedPayload,
  flushCloudSyncPush,
  handleSyncStorageChanged,
  MAX_SYNC_ITEM_BYTES,
  mergeSyncedPayloads,
  pullCloudSyncIfEnabled,
  pushCloudSyncNow,
  reassembleSyncChunks,
  resetCloudSyncTimers,
  resolveCloudSync,
  scheduleCloudSyncPush,
  sha256Hex,
  storageItemBytes,
  SYNC_CHUNK_PREFIX,
  SYNC_META_KEY,
  validateSyncedPayload,
  type SyncStorageMeta,
} from '../src/background/cloud-sync';
import {
  enqueue,
  initializeStorage,
  readCloudSyncMeta,
  readConfig,
  setOnConfigWrittenHook,
  writeConfig,
} from '../src/background/repository';
import { ERROR_LOCALES } from '../src/i18n/errors';
import { UI_KEYS } from '../src/services/model';
import { mockChrome } from './mock-chrome';

async function buildRemoteSyncRecords(
  config: FilterConfig,
  deviceId = 'remote-device-1',
  updatedAt = 1_700_000_000_000
): Promise<Record<string, unknown>> {
  const payload = extractSyncedPayload(config);
  const rawJson = canonicalJson(payload);
  const sha256 = await sha256Hex(rawJson);
  const chunks = chunkSyncPayload(rawJson);
  const meta: SyncStorageMeta = {
    v: 1,
    chunks: chunks.length,
    sha256,
    updatedAt,
    deviceId,
  };
  const out: Record<string, unknown> = { [SYNC_META_KEY]: meta };
  chunks.forEach((chunk, i) => {
    out[`${SYNC_CHUNK_PREFIX}${i}`] = chunk;
  });
  return out;
}

afterEach(async () => {
  setOnConfigWrittenHook(undefined);
  resetCloudSyncTimers();
  await enqueue(async () => undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cross-device sync (chrome.storage.sync)', () => {
  it('stays disabled by default and never writes to storage.sync on local config updates', async () => {
    const mock = mockChrome({});
    setOnConfigWrittenHook(() => scheduleCloudSyncPush());
    await initializeStorage();

    expect((await readCloudSyncMeta()).enabled).toBe(false);
    const config = await readConfig();
    config.theme = 'dark';
    await writeConfig(config);
    await flushCloudSyncPush();

    expect(mock.api.storage.sync.set).not.toHaveBeenCalled();
    expect(mock.syncValues).toEqual({});
  });

  it('syncs only the 13 allowlisted fields and strictly excludes device-local lists and privacy flags', async () => {
    const config = createDefaultConfig('strict');
    config.locale = 'ja';
    config.theme = 'dark';
    config.sceneModes = {
      for_you: 'strip',
      following: 'bypass',
      reply: 'collapse',
      search: 'inherit',
    };
    config.enabledCloudLangGroups = ['universal', 'en', 'ja'];
    config.disabledCloudKeywordIds = ['cloud-nsfw-bio-1'];
    config.rules.keywords.items.push({
      id: 'kw-sync-1',
      pattern: 'crypto airdrop',
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    });
    config.rules.domainFilter.items.push({
      id: 'dom-sync-1',
      domain: 'scam.example',
      enabled: true,
    });
    config.installedPacks = [
      {
        format: RULE_PACK_FORMAT,
        id: 'pack-sync-1',
        name: 'Sync Pack',
        description: 'Synced pack',
        version: '1.0.0',
        updatedAt: '2026-11-22T00:00:00.000Z',
        domains: [{ id: 'pd-1', domain: 'ads.example', enabled: true }],
        enabled: true,
        installedAt: 1000,
      },
    ];
    // Strictly device-local fields
    config.localBlocklistUids['11111'] = {
      uid: '11111',
      screenName: 'local_blocked',
      addedAt: 100,
    };
    config.whitelistUids['22222'] = {
      uid: '22222',
      screenName: 'local_white',
      addedAt: 200,
    };
    config.syncNativeXBlock = true;
    config.enableCrowdReport = true;
    config.customApiBaseUrl = 'https://private.example.com';
    config.onboardingDismissed = false;

    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: config });
    const meta = await enableCloudSync();
    expect(meta.enabled).toBe(true);
    expect(meta.status).toBe('synced');
    expect(meta.chunkCount).toBeGreaterThanOrEqual(1);

    const reassembled = reassembleSyncChunks(mock.syncValues);
    expect(reassembled.status).toBe('ok');
    if (reassembled.status !== 'ok') throw new Error('expected ok');
    const parsed = JSON.parse(reassembled.rawJson) as Record<string, unknown>;

    expect(parsed.locale).toBe('ja');
    expect(parsed.theme).toBe('dark');
    expect(parsed.sceneModes).toEqual(config.sceneModes);
    expect(parsed.enabledCloudLangGroups).toEqual(['universal', 'en', 'ja']);
    expect(parsed.installedPacks).toHaveLength(1);

    // Local-only fields MUST NOT appear anywhere in sync payload
    for (const forbidden of [
      'localBlocklistUids',
      'whitelistUids',
      'syncNativeXBlock',
      'enableCrowdReport',
      'customApiBaseUrl',
      'onboardingDismissed',
      'updatedAt',
      'deviceId',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(parsed, forbidden)).toBe(
        false
      );
    }
    expect(reassembled.rawJson).not.toContain('local_blocked');
    expect(reassembled.rawJson).not.toContain('local_white');
    expect(reassembled.rawJson).not.toContain('private.example.com');
  });

  it('chunks large multibyte/emoji/escaped JSON safely under 6144 UTF-8 bytes per item and cleans up stale trailing chunks', async () => {
    const config = createDefaultConfig('standard');
    for (let i = 0; i < 65; i++) {
      config.rules.keywords.items.push({
        id: `kw-mb-${i}`,
        pattern: `垃圾广告🔥🚀\\"quoted\\"_${i}_${'中文日本語한국어😀'.repeat(6)}`,
        isRegex: false,
        scopes: ['text', 'bio'],
        note: `备注说明 🎯 \\ "test" ${'测试'.repeat(8)}`,
        enabled: true,
      });
    }
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: config });
    const pushed = await enableCloudSync();
    expect(pushed.status).toBe('synced');
    expect(pushed.chunkCount).toBeGreaterThanOrEqual(3);

    // Verify every single sync chunk respects Chrome's exact UTF-8 byte budget <= 6144
    for (let i = 0; i < pushed.chunkCount!; i++) {
      const key = `${SYNC_CHUNK_PREFIX}${i}`;
      const chunk = mock.syncValues[key];
      expect(typeof chunk).toBe('string');
      expect(storageItemBytes(key, chunk)).toBeLessThanOrEqual(
        MAX_SYNC_ITEM_BYTES
      );
      // Verify no broken UTF-16 surrogate halves in any chunk
      const str = chunk as string;
      const firstCode = str.charCodeAt(0);
      const lastCode = str.charCodeAt(str.length - 1);
      expect(firstCode >= 0xdc00 && firstCode <= 0xdfff).toBe(false);
      expect(lastCode >= 0xd800 && lastCode <= 0xdbff).toBe(false);
    }

    // Round-trip reassembly must be 100% lossless
    const reassembled = reassembleSyncChunks(mock.syncValues);
    expect(reassembled.status).toBe('ok');
    if (reassembled.status !== 'ok') throw new Error('expected ok');
    expect(reassembled.rawJson).not.toContain('\uFFFD');
    expect(validateSyncedPayload(JSON.parse(reassembled.rawJson))).toEqual(
      extractSyncedPayload(config)
    );

    // Shrink config back to 1 keyword and push: stale trailing chunks MUST be removed
    const previousChunks = pushed.chunkCount!;
    config.rules.keywords.items = config.rules.keywords.items.slice(0, 1);
    await writeConfig(config);
    const shrunk = await pushCloudSyncNow();
    expect(shrunk.status).toBe('synced');
    expect(shrunk.chunkCount).toBe(1);
    expect(mock.api.storage.sync.remove).toHaveBeenCalled();
    for (let i = 1; i < previousChunks; i++) {
      expect(mock.syncValues[`${SYNC_CHUNK_PREFIX}${i}`]).toBeUndefined();
    }
  });

  it('degrades gracefully on >90 KB pre-flight cap and runtime quota errors without corrupting local config', async () => {
    const hugeConfig = createDefaultConfig('standard');
    for (let i = 0; i < 120; i++) {
      hugeConfig.rules.keywords.items.push({
        id: `kw-huge-${i}`,
        pattern: `p_${i}_${'A'.repeat(900)}`,
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });
    }
    const mockPre = mockChrome({ [STORAGE_KEYS.CONFIG]: hugeConfig });
    const preResult = await enableCloudSync();
    expect(preResult.status).toBe('quota_exceeded');
    expect(preResult.error).toBeTruthy();
    expect(mockPre.api.storage.sync.set).not.toHaveBeenCalled();
    expect(await readConfig()).toEqual(hugeConfig);

    // Runtime QUOTA_BYTES rejection from browser sync storage
    const normalConfig = createDefaultConfig('standard');
    normalConfig.rules.keywords.items.push({
      id: 'kw-rt-1',
      pattern: 'runtime quota test ' + 'x'.repeat(800),
      isRegex: false,
      scopes: ['text'],
      enabled: true,
    });
    const mockRt = mockChrome(
      { [STORAGE_KEYS.CONFIG]: normalConfig },
      {},
      { syncQuotaBytes: 512 }
    );
    const rtResult = await enableCloudSync();
    expect(rtResult.status).toBe('quota_exceeded');
    expect(rtResult.error).toBeTruthy();
    expect(await readConfig()).toEqual(normalConfig);
    expect(mockRt.syncValues).toEqual({});
  });

  it('handles first-enable SHA-256 identity match and 3-way conflict resolution (local / remote / merge)', async () => {
    // 1. Identical config across devices (different key order & remote deviceId/updatedAt) -> zero conflict
    const identicalLocal = createDefaultConfig('standard');
    identicalLocal.theme = 'dark';
    const identicalRemoteRecords = await buildRemoteSyncRecords(
      identicalLocal,
      'other-device',
      1_700_000_001_000
    );
    const mockSame = mockChrome(
      { [STORAGE_KEYS.CONFIG]: identicalLocal },
      identicalRemoteRecords
    );
    const sameMeta = await enableCloudSync();
    expect(sameMeta.enabled).toBe(true);
    expect(sameMeta.status).toBe('synced');
    expect(sameMeta.pendingRemote).toBeUndefined();
    expect(mockSame.api.storage.sync.set).not.toHaveBeenCalled();

    // 2. Divergent configs -> status 'conflict' without mutating local or remote
    const localCfg = createDefaultConfig('standard');
    localCfg.locale = 'ja';
    localCfg.sceneModes = {
      for_you: 'strip',
      following: 'inherit',
      reply: 'inherit',
      search: 'inherit',
    };
    localCfg.disabledCloudKeywordIds = ['cloud-nsfw-bio-1'];
    localCfg.enabledCloudLangGroups = ['universal', 'ja'];
    localCfg.rules.keywords.items = [
      {
        id: 'kw-shared',
        pattern: 'local-pattern',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
      {
        id: 'kw-local-only',
        pattern: 'only-local',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
    ];
    localCfg.rules.domainFilter.items = [
      { id: 'dom-local', domain: 'local.example', enabled: true },
    ];
    localCfg.installedPacks = [
      {
        format: RULE_PACK_FORMAT,
        id: 'pack-shared',
        name: 'Shared Old',
        description: 'Local older version',
        version: '1.0.0',
        updatedAt: '2026-11-20T00:00:00.000Z',
        domains: [{ id: 'd1', domain: 'p1.example', enabled: true }],
        enabled: true,
        installedAt: 1000,
        disabledItemIds: ['d1'],
      },
    ];
    // Local-only privacy & account lists MUST survive every resolution strategy
    localCfg.localBlocklistUids['777'] = {
      uid: '777',
      screenName: 'local_bad',
      addedAt: 1,
    };
    localCfg.whitelistUids['888'] = {
      uid: '888',
      screenName: 'local_friend',
      addedAt: 1,
    };
    localCfg.syncNativeXBlock = true;
    localCfg.enableCrowdReport = true;
    localCfg.customApiBaseUrl = 'https://local-only.example';
    localCfg.onboardingDismissed = false;

    const remoteCfg = createDefaultConfig('strict');
    remoteCfg.locale = 'fr';
    remoteCfg.theme = 'dark';
    remoteCfg.sceneModes = {
      for_you: 'collapse',
      following: 'bypass',
      reply: 'inherit',
      search: 'inherit',
    };
    remoteCfg.disabledCloudKeywordIds = ['cloud-spam-tg-1'];
    remoteCfg.enabledCloudLangGroups = ['universal', 'fr'];
    remoteCfg.rules.keywords.items = [
      {
        id: 'kw-shared',
        pattern: 'remote-pattern',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
      {
        id: 'kw-remote-only',
        pattern: 'only-remote',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
    ];
    remoteCfg.rules.domainFilter.items = [
      { id: 'dom-dup-domain', domain: 'local.example', enabled: true },
      { id: 'dom-remote', domain: 'remote.example', enabled: true },
    ];
    remoteCfg.installedPacks = [
      {
        format: RULE_PACK_FORMAT,
        id: 'pack-shared',
        name: 'Shared New',
        description: 'Remote newer version',
        version: '1.1.0',
        updatedAt: '2026-11-22T00:00:00.000Z',
        domains: [
          { id: 'd1', domain: 'p1.example', enabled: true },
          { id: 'd2', domain: 'p2.example', enabled: true },
        ],
        enabled: true,
        installedAt: 2000,
        disabledItemIds: ['d2'],
      },
      {
        format: RULE_PACK_FORMAT,
        id: 'pack-remote',
        name: 'Remote Pack',
        description: 'Remote only',
        version: '1.0.0',
        updatedAt: '2026-11-22T00:00:00.000Z',
        domains: [{ id: 'rd1', domain: 'r.example', enabled: true }],
        enabled: true,
        installedAt: 2000,
      },
    ];

    const remoteRecords = await buildRemoteSyncRecords(remoteCfg);

    // 2a. Resolve 'local'
    const mockLocal = mockChrome(
      { [STORAGE_KEYS.CONFIG]: localCfg },
      remoteRecords
    );
    const conflict1 = await enableCloudSync();
    expect(conflict1.status).toBe('conflict');
    expect(conflict1.enabled).toBe(false);
    expect(conflict1.pendingRemote?.locale).toBe('fr');
    expect(conflict1.remoteUpdatedAt).toBe(1_700_000_000_000);
    expect((await readConfig()).locale).toBe('ja');

    const resolvedLocal = await resolveCloudSync('local');
    expect(resolvedLocal.status).toBe('synced');
    expect(resolvedLocal.enabled).toBe(true);
    expect((await readConfig()).locale).toBe('ja');
    const localPushed = reassembleSyncChunks(mockLocal.syncValues);
    expect(localPushed.status).toBe('ok');
    if (localPushed.status === 'ok') {
      expect(JSON.parse(localPushed.rawJson).locale).toBe('ja');
    }

    // 2b. Resolve 'remote' (preserves ALL 6 local-only fields!)
    mockChrome({ [STORAGE_KEYS.CONFIG]: localCfg }, remoteRecords);
    expect((await enableCloudSync()).status).toBe('conflict');
    const resolvedRemote = await resolveCloudSync('remote');
    expect(resolvedRemote.status).toBe('synced');
    expect(resolvedRemote.enabled).toBe(true);
    const afterRemote = await readConfig();
    expect(afterRemote.locale).toBe('fr');
    expect(afterRemote.theme).toBe('dark');
    expect(afterRemote.preset).toBe('strict');
    expect(afterRemote.localBlocklistUids).toEqual(localCfg.localBlocklistUids);
    expect(afterRemote.whitelistUids).toEqual(localCfg.whitelistUids);
    expect(afterRemote.syncNativeXBlock).toBe(true);
    expect(afterRemote.enableCrowdReport).toBe(true);
    expect(afterRemote.customApiBaseUrl).toBe('https://local-only.example');
    expect(afterRemote.onboardingDismissed).toBe(false);

    // 2c. Resolve 'merge' (deterministic smart merge + push + local-only preservation)
    mockChrome({ [STORAGE_KEYS.CONFIG]: localCfg }, remoteRecords);
    expect((await enableCloudSync()).status).toBe('conflict');
    const resolvedMerge = await resolveCloudSync('merge');
    expect(resolvedMerge.status).toBe('synced');
    expect(resolvedMerge.enabled).toBe(true);
    const merged = await readConfig();
    expect(merged.locale).toBe('ja'); // scalar preference kept from local
    expect(merged.rules.keywords.items.map((k) => k.id)).toEqual([
      'kw-shared',
      'kw-local-only',
      'kw-remote-only',
    ]);
    expect(
      merged.rules.keywords.items.find((k) => k.id === 'kw-shared')?.pattern
    ).toBe('local-pattern');
    expect(merged.rules.domainFilter.items.map((d) => d.domain)).toEqual([
      'local.example',
      'remote.example',
    ]);
    expect(merged.disabledCloudKeywordIds).toEqual([
      'cloud-nsfw-bio-1',
      'cloud-spam-tg-1',
    ]);
    expect(merged.enabledCloudLangGroups).toEqual(['universal', 'ja', 'fr']);
    expect(merged.sceneModes).toEqual({
      for_you: 'strip',
      following: 'bypass',
      reply: 'inherit',
      search: 'inherit',
    });
    expect(merged.installedPacks?.map((p) => p.id)).toEqual([
      'pack-shared',
      'pack-remote',
    ]);
    const mergedSharedPack = merged.installedPacks!.find(
      (p) => p.id === 'pack-shared'
    )!;
    expect(mergedSharedPack.version).toBe('1.1.0');
    expect(mergedSharedPack.disabledItemIds).toEqual(['d1', 'd2']);
    expect(merged.localBlocklistUids).toEqual(localCfg.localBlocklistUids);
    expect(merged.whitelistUids).toEqual(localCfg.whitelistUids);
    expect(merged.syncNativeXBlock).toBe(true);
    expect(merged.enableCrowdReport).toBe(true);
    expect(merged.customApiBaseUrl).toBe('https://local-only.example');
    expect(merged.onboardingDismissed).toBe(false);

    // Reject invalid strategy
    await expect(
      resolveCloudSync('invalid' as 'local')
    ).rejects.toThrow();
  });

  it('debounces rapid local edits by 1.5s and skips sync writes on local-only field mutations', async () => {
    vi.useFakeTimers();
    const config = createDefaultConfig('standard');
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: config });
    setOnConfigWrittenHook(() => scheduleCloudSyncPush());
    await enableCloudSync();
    mock.api.storage.sync.set.mockClear();

    // Rapid bursts of synced edits coalesce into 1 sync write after 1500ms
    const c1 = await readConfig();
    c1.theme = 'dark';
    await writeConfig(c1);
    vi.advanceTimersByTime(500);
    const c2 = await readConfig();
    c2.locale = 'de';
    await writeConfig(c2);
    vi.advanceTimersByTime(1000);
    await enqueue(async () => undefined);
    expect(mock.api.storage.sync.set).not.toHaveBeenCalled();

    vi.advanceTimersByTime(CLOUD_SYNC_DEBOUNCE_MS);
    await enqueue(async () => undefined);
    expect(mock.api.storage.sync.set).toHaveBeenCalledTimes(1);

    // Local-only edit produces identical synced hash -> ZERO storage.sync writes
    mock.api.storage.sync.set.mockClear();
    const c3 = await readConfig();
    c3.localBlocklistUids['99999'] = {
      uid: '99999',
      screenName: 'local_only',
      addedAt: 1,
    };
    c3.onboardingDismissed = true;
    await writeConfig(c3);
    vi.advanceTimersByTime(CLOUD_SYNC_DEBOUNCE_MS + 100);
    await enqueue(async () => undefined);
    expect(mock.api.storage.sync.set).not.toHaveBeenCalled();
  });

  it('pulls foreign updates without echo loops, tolerates partial chunks, and isolates corrupted remote data', async () => {
    const localCfg = createDefaultConfig('standard');
    localCfg.localBlocklistUids['555'] = {
      uid: '555',
      screenName: 'keep_me',
      addedAt: 1,
    };
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: localCfg });
    setOnConfigWrittenHook(() => scheduleCloudSyncPush());
    const meta = await enableCloudSync();
    mock.api.storage.sync.set.mockClear();

    // 1. Echo from own deviceId is ignored
    await handleSyncStorageChanged(
      { [SYNC_META_KEY]: { oldValue: undefined, newValue: mock.syncValues[SYNC_META_KEY] } },
      'sync'
    );
    expect(mock.api.storage.sync.set).not.toHaveBeenCalled();

    // 2. Foreign device update applies allowlist without bounce push and keeps localBlocklistUids
    const foreignCfg = createDefaultConfig('strict');
    foreignCfg.theme = 'dark';
    foreignCfg.locale = 'ko';
    const foreignRecords = await buildRemoteSyncRecords(
      foreignCfg,
      'foreign-device-2',
      Date.now() + 5000
    );
    Object.assign(mock.syncValues, foreignRecords);
    await handleSyncStorageChanged(
      {
        [SYNC_META_KEY]: {
          oldValue: undefined,
          newValue: foreignRecords[SYNC_META_KEY],
        },
      },
      'sync'
    );
    const updated = await readConfig();
    expect(updated.theme).toBe('dark');
    expect(updated.locale).toBe('ko');
    expect(updated.preset).toBe('strict');
    expect(updated.localBlocklistUids['555']?.screenName).toBe('keep_me');
    await flushCloudSyncPush();
    expect(mock.api.storage.sync.set).not.toHaveBeenCalled();

    // 3. Partial chunk delivery (meta claims 2 chunks, only chunk 0 present) does NOT error or overwrite local
    const partialMeta: SyncStorageMeta = {
      ...(foreignRecords[SYNC_META_KEY] as SyncStorageMeta),
      chunks: 2,
      deviceId: 'foreign-device-3',
    };
    mock.syncValues[SYNC_META_KEY] = partialMeta;
    delete mock.syncValues[`${SYNC_CHUNK_PREFIX}1`];
    await handleSyncStorageChanged(
      { [SYNC_META_KEY]: { oldValue: undefined, newValue: partialMeta } },
      'sync'
    );
    expect((await readCloudSyncMeta()).status).toBe('synced');
    expect((await readConfig()).locale).toBe('ko');

    // 4. Corrupted chunk (SHA-256 mismatch) sets status='error' and preserves local config
    mock.syncValues[SYNC_META_KEY] = {
      ...partialMeta,
      chunks: 1,
      sha256: '0'.repeat(64),
    };
    await pullCloudSyncIfEnabled();
    expect((await readCloudSyncMeta()).status).toBe('error');
    expect((await readConfig()).locale).toBe('ko');

    // 5. disableCloudSync stops syncing without wiping remote storage.sync
    const syncKeysBeforeDisable = Object.keys(mock.syncValues);
    const disabled = await disableCloudSync();
    expect(disabled.enabled).toBe(false);
    expect(disabled.status).toBe('idle');
    expect(Object.keys(mock.syncValues)).toEqual(syncKeysBeforeDisable);
    expect(meta.deviceId).toBeTruthy();

    // Sanity check direct applySyncedPayloadToLocal & mergeSyncedPayloads purity
    const applied = applySyncedPayloadToLocal(
      localCfg,
      extractSyncedPayload(foreignCfg)
    );
    expect(applied.localBlocklistUids['555']).toBeDefined();
    const directMerge = mergeSyncedPayloads(
      extractSyncedPayload(localCfg),
      extractSyncedPayload(foreignCfg)
    );
    expect(directMerge.version).toBe(1);
    expect(mock.values[UI_KEYS.cloudSync]).toBeDefined();
  });

  it('keeps enabled=false on fresh enableCloudSync >90 KB so subsequent foreign sync never wipes local keywords', async () => {
    const hugeLocal = createDefaultConfig('standard');
    for (let i = 0; i < 65; i++) {
      hugeLocal.rules.keywords.items.push({
        id: `kw-big-${i}`,
        pattern: `pattern_${i}_${'K'.repeat(1600)}`,
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });
    }
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: hugeLocal });
    const meta = await enableCloudSync();
    expect(meta.status).toBe('quota_exceeded');
    expect(meta.enabled).toBe(false);
    expect(mock.syncValues).toEqual({});

    // Foreign device later pushes empty default config to storage.sync
    const foreignEmpty = createDefaultConfig('standard');
    const foreignRecords = await buildRemoteSyncRecords(
      foreignEmpty,
      'foreign-device-b',
      Date.now() + 1000
    );
    Object.assign(mock.syncValues, foreignRecords);
    await handleSyncStorageChanged(
      {
        [SYNC_META_KEY]: {
          oldValue: undefined,
          newValue: foreignRecords[SYNC_META_KEY],
        },
      },
      'sync'
    );
    await pullCloudSyncIfEnabled();

    expect((await readConfig()).rules.keywords.items).toHaveLength(65);
    expect((await readCloudSyncMeta()).enabled).toBe(false);
    expect((await readCloudSyncMeta()).status).toBe('quota_exceeded');
  });

  it('keeps enabled=false when resolveCloudSync(local|merge) exceeds 90 KB so pullCloudSyncIfEnabled never wipes local keywords', async () => {
    // 1. resolveCloudSync('local') exceeding 90 KB
    const hugeLocal = createDefaultConfig('standard');
    hugeLocal.locale = 'ja';
    for (let i = 0; i < 65; i++) {
      hugeLocal.rules.keywords.items.push({
        id: `kw-loc-${i}`,
        pattern: `loc_${i}_${'L'.repeat(1600)}`,
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });
    }
    const remoteSmall = createDefaultConfig('standard');
    remoteSmall.locale = 'fr';
    const remoteSmallRecords = await buildRemoteSyncRecords(
      remoteSmall,
      'device-remote',
      1_700_000_000_000
    );
    mockChrome({ [STORAGE_KEYS.CONFIG]: hugeLocal }, remoteSmallRecords);
    expect((await enableCloudSync()).status).toBe('conflict');

    const localRes = await resolveCloudSync('local');
    expect(localRes.status).toBe('quota_exceeded');
    expect(localRes.enabled).toBe(false);
    expect(localRes.pendingRemote).toBeUndefined();
    expect(localRes.remoteUpdatedAt).toBeUndefined();

    // Simulated browser restart pull must NOT overwrite local with rejected remote
    await pullCloudSyncIfEnabled();
    const afterRestartLocal = await readConfig();
    expect(afterRestartLocal.locale).toBe('ja');
    expect(afterRestartLocal.rules.keywords.items).toHaveLength(65);

    // 2. resolveCloudSync('merge') combining 35 local + 35 remote > 90 KB
    const localHalf = createDefaultConfig('standard');
    for (let i = 0; i < 35; i++) {
      localHalf.rules.keywords.items.push({
        id: `kw-m-loc-${i}`,
        pattern: `mloc_${i}_${'M'.repeat(1600)}`,
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });
    }
    const remoteHalf = createDefaultConfig('standard');
    for (let i = 0; i < 35; i++) {
      remoteHalf.rules.keywords.items.push({
        id: `kw-m-rem-${i}`,
        pattern: `mrem_${i}_${'R'.repeat(1600)}`,
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });
    }
    const remoteHalfRecords = await buildRemoteSyncRecords(
      remoteHalf,
      'device-remote-2',
      1_700_000_001_000
    );
    mockChrome({ [STORAGE_KEYS.CONFIG]: localHalf }, remoteHalfRecords);
    expect((await enableCloudSync()).status).toBe('conflict');

    const mergeRes = await resolveCloudSync('merge');
    expect(mergeRes.status).toBe('quota_exceeded');
    expect(mergeRes.enabled).toBe(false);
    expect((await readConfig()).rules.keywords.items).toHaveLength(70);

    // Simulated browser restart pull must preserve all 70 merged keywords
    await pullCloudSyncIfEnabled();
    expect((await readConfig()).rules.keywords.items).toHaveLength(70);
  });

  it('preserves quota_exceeded and unpushed local edits across startup pull (Barrier 2b) and foreign updates (Probe 1.11)', async () => {
    const baseCfg = createDefaultConfig('standard');
    const remoteV1Records = await buildRemoteSyncRecords(
      baseCfg,
      'device-B',
      1_700_000_000_000
    );
    const mock = mockChrome(
      { [STORAGE_KEYS.CONFIG]: baseCfg },
      remoteV1Records
    );
    const enabledMeta = await enableCloudSync();
    expect(enabledMeta.enabled).toBe(true);
    expect(enabledMeta.status).toBe('synced');

    // Local grows beyond 90 KB and fails push
    const bigLocal = await readConfig();
    for (let i = 0; i < 65; i++) {
      bigLocal.rules.keywords.items.push({
        id: `kw-unpushed-${i}`,
        pattern: `unpushed_${i}_${'U'.repeat(1600)}`,
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });
    }
    await writeConfig(bigLocal, { skipCloudSync: true });
    const exceeded = await flushCloudSyncPush();
    expect(exceeded.status).toBe('quota_exceeded');
    expect(exceeded.error).toBeTruthy();

    // 1. Barrier 2b: startup pull while remote is unchanged at V1 MUST keep status='quota_exceeded' & error
    await pullCloudSyncIfEnabled();
    const afterStartup = await readCloudSyncMeta();
    expect(afterStartup.status).toBe('quota_exceeded');
    expect(afterStartup.error).toBe(exceeded.error);
    expect((await readConfig()).rules.keywords.items).toHaveLength(65);

    // 2. Probe 1.11: foreign device pushes minor change V2 while Device A is in quota_exceeded -> NEVER wipe local keywords
    const foreignV2 = createDefaultConfig('standard');
    foreignV2.theme = 'dark';
    const remoteV2Records = await buildRemoteSyncRecords(
      foreignV2,
      'device-B',
      1_700_000_005_000
    );
    Object.assign(mock.syncValues, remoteV2Records);
    await handleSyncStorageChanged(
      {
        [SYNC_META_KEY]: {
          oldValue: remoteV1Records[SYNC_META_KEY],
          newValue: remoteV2Records[SYNC_META_KEY],
        },
      },
      'sync'
    );
    expect((await readConfig()).rules.keywords.items).toHaveLength(65);
    expect((await readConfig()).theme).toBe('light');
    expect((await readCloudSyncMeta()).status).toBe('quota_exceeded');

    // 3. Diverged unpushed local edit under 'synced' (pre-debounce) + foreign push -> transitions to 'conflict' instead of wiping local
    const smallLocal = createDefaultConfig('standard');
    const mockDiv = mockChrome(
      { [STORAGE_KEYS.CONFIG]: smallLocal },
      remoteV1Records
    );
    expect((await enableCloudSync()).status).toBe('synced');
    const editedLocal = await readConfig();
    editedLocal.locale = 'ja';
    await writeConfig(editedLocal, { skipCloudSync: true }); // unpushed edit
    Object.assign(mockDiv.syncValues, remoteV2Records);
    await handleSyncStorageChanged(
      {
        [SYNC_META_KEY]: {
          oldValue: remoteV1Records[SYNC_META_KEY],
          newValue: remoteV2Records[SYNC_META_KEY],
        },
      },
      'sync'
    );
    const conflictMeta = await readCloudSyncMeta();
    expect(conflictMeta.status).toBe('conflict');
    expect(conflictMeta.enabled).toBe(false);
    expect(conflictMeta.pendingRemote?.theme).toBe('dark');
    expect((await readConfig()).locale).toBe('ja');
  });

  it('preserves existing remote chunks on QUOTA_BYTES_PER_ITEM, maps Firefox QuotaExceededError, clears stale conflict metadata on error, and accepts non-canonical valid remote JSON', async () => {
    // 1. Seed a 5+ chunk remote snapshot
    const multiChunkCfg = createDefaultConfig('standard');
    for (let i = 0; i < 45; i++) {
      multiChunkCfg.rules.keywords.items.push({
        id: `kw-mc-${i}`,
        pattern: `mc_${i}_${'X'.repeat(650)}`,
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });
    }
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: multiChunkCfg });
    const initial = await enableCloudSync();
    expect(initial.status).toBe('synced');
    expect(initial.chunkCount).toBeGreaterThanOrEqual(5);

    // Shrink local config to 1 chunk, then simulate QUOTA_BYTES_PER_ITEM rejection
    const shrunkCfg = createDefaultConfig('standard');
    await writeConfig(shrunkCfg, { skipCloudSync: true });
    mock.api.storage.sync.set.mockRejectedValueOnce(
      new Error('QUOTA_BYTES_PER_ITEM quota exceeded')
    );
    mock.api.storage.sync.remove.mockClear();

    const perItemRes = await pushCloudSyncNow();
    expect(perItemRes.status).toBe('quota_exceeded');
    expect(mock.api.storage.sync.remove).not.toHaveBeenCalled();
    expect(reassembleSyncChunks(mock.syncValues).status).toBe('ok');

    // 2. Firefox MV3 QuotaExceededError maps to 'quota_exceeded'
    mock.api.storage.sync.set.mockRejectedValue(
      new Error(
        'QuotaExceededError: storage.sync API call exceeded its quota limitations.'
      )
    );
    const ffRes = await pushCloudSyncNow();
    expect(ffRes.status).toBe('quota_exceeded');

    // 3. Rate limit MAX_WRITE_OPERATIONS_PER_MINUTE still maps to 'error' and clears pendingRemote/remoteUpdatedAt
    mock.values[UI_KEYS.cloudSync] = {
      ...(mock.values[UI_KEYS.cloudSync] as object),
      enabled: true,
      pendingRemote: extractSyncedPayload(shrunkCfg),
      remoteUpdatedAt: 1_700_000_000_000,
    };
    mock.api.storage.sync.set.mockReset();
    mock.api.storage.sync.set.mockRejectedValueOnce(
      new Error('MAX_WRITE_OPERATIONS_PER_MINUTE exceeded')
    );
    const rateRes = await pushCloudSyncNow();
    expect(rateRes.status).toBe('error');
    expect(rateRes.pendingRemote).toBeUndefined();
    expect(rateRes.remoteUpdatedAt).toBeUndefined();

    // 4. Non-canonical pretty-printed valid remote JSON matches identity in enableCloudSync()
    const cleanCfg = createDefaultConfig('standard');
    cleanCfg.locale = 'es';
    const payload = extractSyncedPayload(cleanCfg);
    const nonCanonicalJson = JSON.stringify(payload, null, 2);
    const nonCanonicalSha = await sha256Hex(nonCanonicalJson);
    const nonCanonicalRecords: Record<string, unknown> = {
      [SYNC_META_KEY]: {
        v: 1,
        chunks: 1,
        sha256: nonCanonicalSha,
        updatedAt: 1_700_000_123_000,
        deviceId: 'external-writer',
      },
      [`${SYNC_CHUNK_PREFIX}0`]: nonCanonicalJson,
    };
    const mockNonCanon = mockChrome(
      { [STORAGE_KEYS.CONFIG]: cleanCfg },
      nonCanonicalRecords
    );
    const nonCanonMeta = await enableCloudSync();
    expect(nonCanonMeta.status).toBe('synced');
    expect(nonCanonMeta.enabled).toBe(true);
    expect(mockNonCanon.api.storage.sync.set).not.toHaveBeenCalled();
  });

  it('does not leave a dangling alarm when disableCloudSync races with async scheduleCloudSyncPush', async () => {
    const cfg = createDefaultConfig('standard');
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: cfg });
    await enableCloudSync();
    mock.api.alarms.create.mockClear();
    mock.api.alarms.clear.mockClear();

    let releaseDelayedRead!: () => void;
    const origGet = mock.api.storage.local.get.getMockImplementation()!;
    let intercepted = false;
    mock.api.storage.local.get.mockImplementation(async (keys) => {
      if (!intercepted && keys === UI_KEYS.cloudSync) {
        intercepted = true;
        await new Promise<void>((resolve) => {
          releaseDelayedRead = resolve;
        });
      }
      return origGet(keys);
    });

    scheduleCloudSyncPush();
    await disableCloudSync();
    releaseDelayedRead();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mock.api.alarms.clear).toHaveBeenCalled();
    expect(mock.api.alarms.create).not.toHaveBeenCalled();
  });

  it('auto-recovers from torn 1-chunk remote updates and transient push errors when local has zero edits, while preserving real conflicts and quota_exceeded (R2-1 & SUBTLE-1)', async () => {
    const v1Cfg = createDefaultConfig('standard');
    const v2Cfg = createDefaultConfig('standard');
    v2Cfg.theme = 'dark';
    v2Cfg.locale = 'fr';
    const v1Records = await buildRemoteSyncRecords(
      v1Cfg,
      'device-B',
      1_700_000_000_000
    );
    const v2Records = await buildRemoteSyncRecords(
      v2Cfg,
      'device-B',
      1_700_000_010_000
    );
    const v2Meta = v2Records[SYNC_META_KEY] as SyncStorageMeta;

    // Case A1: meta-first torn 1-chunk update with 0 local edits -> auto-recovers when chunk_0 arrives
    {
      const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: v1Cfg }, v1Records);
      expect((await enableCloudSync()).status).toBe('synced');

      // Step 1: meta(V2) arrives before chunk_0(V2) -> checksum mismatch sets 'error'
      mock.syncValues[SYNC_META_KEY] = v2Records[SYNC_META_KEY];
      await handleSyncStorageChanged(
        {
          [SYNC_META_KEY]: {
            oldValue: v1Records[SYNC_META_KEY],
            newValue: v2Records[SYNC_META_KEY],
          },
        },
        'sync'
      );
      const midMeta = await readCloudSyncMeta();
      expect(midMeta.enabled).toBe(true);
      expect(midMeta.status).toBe('error');

      // Step 2: chunk_0(V2) arrives -> must auto-recover (NO false conflict!)
      mock.syncValues[`${SYNC_CHUNK_PREFIX}0`] =
        v2Records[`${SYNC_CHUNK_PREFIX}0`];
      await handleSyncStorageChanged(
        {
          [`${SYNC_CHUNK_PREFIX}0`]: {
            oldValue: v1Records[`${SYNC_CHUNK_PREFIX}0`],
            newValue: v2Records[`${SYNC_CHUNK_PREFIX}0`],
          },
        },
        'sync'
      );
      const finalMeta = await readCloudSyncMeta();
      expect(finalMeta.enabled).toBe(true);
      expect(finalMeta.status).toBe('synced');
      expect(finalMeta.error).toBeUndefined();
      expect(finalMeta.lastSyncedSha256).toBe(v2Meta.sha256);
      expect((await readConfig()).theme).toBe('dark');
      expect((await readConfig()).locale).toBe('fr');
    }

    // Case A2: chunk-first torn 1-chunk update with 0 local edits -> auto-recovers when meta arrives
    {
      const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: v1Cfg }, v1Records);
      expect((await enableCloudSync()).status).toBe('synced');

      mock.syncValues[`${SYNC_CHUNK_PREFIX}0`] =
        v2Records[`${SYNC_CHUNK_PREFIX}0`];
      await handleSyncStorageChanged(
        {
          [`${SYNC_CHUNK_PREFIX}0`]: {
            oldValue: v1Records[`${SYNC_CHUNK_PREFIX}0`],
            newValue: v2Records[`${SYNC_CHUNK_PREFIX}0`],
          },
        },
        'sync'
      );
      expect((await readCloudSyncMeta()).status).toBe('error');

      mock.syncValues[SYNC_META_KEY] = v2Records[SYNC_META_KEY];
      await handleSyncStorageChanged(
        {
          [SYNC_META_KEY]: {
            oldValue: v1Records[SYNC_META_KEY],
            newValue: v2Records[SYNC_META_KEY],
          },
        },
        'sync'
      );
      const finalMeta = await readCloudSyncMeta();
      expect(finalMeta.enabled).toBe(true);
      expect(finalMeta.status).toBe('synced');
      expect(finalMeta.error).toBeUndefined();
      expect((await readConfig()).theme).toBe('dark');
    }

    // Case A3: transient pushCloudSyncNow() rate-limit error with 0 local edits -> auto-recovers on foreign V2
    {
      const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: v1Cfg }, v1Records);
      expect((await enableCloudSync()).status).toBe('synced');
      mock.api.storage.sync.set.mockRejectedValueOnce(
        new Error(
          'This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.'
        )
      );
      const pushed = await pushCloudSyncNow();
      expect(pushed.enabled).toBe(true);
      expect(pushed.status).toBe('error');

      Object.assign(mock.syncValues, v2Records);
      await handleSyncStorageChanged(
        {
          [SYNC_META_KEY]: {
            oldValue: v1Records[SYNC_META_KEY],
            newValue: v2Records[SYNC_META_KEY],
          },
        },
        'sync'
      );
      const recovered = await readCloudSyncMeta();
      expect(recovered.enabled).toBe(true);
      expect(recovered.status).toBe('synced');
      expect(recovered.error).toBeUndefined();
      expect((await readConfig()).theme).toBe('dark');
    }

    // Case B: failed local edit push (status === 'error') + foreign V2 -> surfaces real 'conflict'
    {
      const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: v1Cfg }, v1Records);
      expect((await enableCloudSync()).status).toBe('synced');
      const edited = await readConfig();
      edited.locale = 'ja';
      await writeConfig(edited, { skipCloudSync: true });
      mock.api.storage.sync.set.mockRejectedValueOnce(
        new Error('Network disconnected')
      );
      const failedPush = await pushCloudSyncNow();
      expect(failedPush.enabled).toBe(true);
      expect(failedPush.status).toBe('error');

      Object.assign(mock.syncValues, v2Records);
      await handleSyncStorageChanged(
        {
          [SYNC_META_KEY]: {
            oldValue: v1Records[SYNC_META_KEY],
            newValue: v2Records[SYNC_META_KEY],
          },
        },
        'sync'
      );
      const conflictMeta = await readCloudSyncMeta();
      expect(conflictMeta.enabled).toBe(false);
      expect(conflictMeta.status).toBe('conflict');
      expect(conflictMeta.pendingRemote?.theme).toBe('dark');
      expect((await readConfig()).locale).toBe('ja');
    }

    // Case C: quota_exceeded + torn 1-chunk update preserves quota_exceeded, then shrinks to recover via Barrier 2a
    {
      const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: v1Cfg }, v1Records);
      expect((await enableCloudSync()).status).toBe('synced');
      const huge = await readConfig();
      for (let i = 0; i < 65; i++) {
        huge.rules.keywords.items.push({
          id: `kw-torn-${i}`,
          pattern: `torn_${i}_${'Q'.repeat(1600)}`,
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        });
      }
      await writeConfig(huge, { skipCloudSync: true });
      const exceeded = await flushCloudSyncPush();
      expect(exceeded.status).toBe('quota_exceeded');

      // Torn V2 meta arrives first -> must NOT downgrade quota_exceeded to 'error'
      mock.syncValues[SYNC_META_KEY] = v2Records[SYNC_META_KEY];
      await handleSyncStorageChanged(
        {
          [SYNC_META_KEY]: {
            oldValue: v1Records[SYNC_META_KEY],
            newValue: v2Records[SYNC_META_KEY],
          },
        },
        'sync'
      );
      expect((await readCloudSyncMeta()).status).toBe('quota_exceeded');
      expect((await readCloudSyncMeta()).enabled).toBe(true);

      // Torn V2 chunk_0 arrives next -> must STILL stay quota_exceeded & preserve local keywords
      mock.syncValues[`${SYNC_CHUNK_PREFIX}0`] =
        v2Records[`${SYNC_CHUNK_PREFIX}0`];
      await handleSyncStorageChanged(
        {
          [`${SYNC_CHUNK_PREFIX}0`]: {
            oldValue: v1Records[`${SYNC_CHUNK_PREFIX}0`],
            newValue: v2Records[`${SYNC_CHUNK_PREFIX}0`],
          },
        },
        'sync'
      );
      expect((await readCloudSyncMeta()).status).toBe('quota_exceeded');
      expect((await readConfig()).rules.keywords.items).toHaveLength(65);

      // Shrink local to match V2 -> Barrier 2a recovers cleanly to 'synced'
      await writeConfig(v2Cfg, { skipCloudSync: true });
      await pullCloudSyncIfEnabled();
      const healed = await readCloudSyncMeta();
      expect(healed.enabled).toBe(true);
      expect(healed.status).toBe('synced');
      expect(healed.error).toBeUndefined();
      expect(healed.lastSyncedSha256).toBe(v2Meta.sha256);
    }

    // Case D: synthetic enabled: true with lastSyncedSha256: undefined
    {
      // D1: status 'synced' pulls remote and heals lastSyncedSha256
      const mockSynced = mockChrome(
        {
          [STORAGE_KEYS.CONFIG]: v1Cfg,
          [UI_KEYS.cloudSync]: {
            enabled: true,
            status: 'synced',
            deviceId: 'device-A',
          },
        },
        v2Records
      );
      await pullCloudSyncIfEnabled();
      const meta1 = await readCloudSyncMeta();
      expect(meta1.enabled).toBe(true);
      expect(meta1.status).toBe('synced');
      expect(meta1.lastSyncedSha256).toBe(v2Meta.sha256);
      expect((await readConfig()).theme).toBe('dark');
      void mockSynced;

      // D2: status 'error' conservatively enters conflict without overwriting local
      const mockErr = mockChrome(
        {
          [STORAGE_KEYS.CONFIG]: v1Cfg,
          [UI_KEYS.cloudSync]: {
            enabled: true,
            status: 'error',
            deviceId: 'device-A',
            error: 'prior transient failure',
          },
        },
        v2Records
      );
      await pullCloudSyncIfEnabled();
      const meta2 = await readCloudSyncMeta();
      expect(meta2.enabled).toBe(false);
      expect(meta2.status).toBe('conflict');
      expect(meta2.pendingRemote?.theme).toBe('dark');
      expect((await readConfig()).theme).toBe('light');
      void mockErr;
    }
  });

  it('classifies all 3 verbatim Chromium write-rate-limit errors as error without deleting remote chunks and maps Firefox DOMException QuotaExceededError to quota_exceeded (R2-2)', async () => {
    // Seed a 5+ chunk remote snapshot so staleKeys.length > 0 when pushing a 1-chunk config
    const multiChunkCfg = createDefaultConfig('standard');
    for (let i = 0; i < 45; i++) {
      multiChunkCfg.rules.keywords.items.push({
        id: `kw-rl-${i}`,
        pattern: `rl_${i}_${'R'.repeat(650)}`,
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      });
    }
    const mock = mockChrome({ [STORAGE_KEYS.CONFIG]: multiChunkCfg });
    const initial = await enableCloudSync();
    expect(initial.status).toBe('synced');
    expect(initial.chunkCount).toBeGreaterThanOrEqual(5);

    const smallCfg = createDefaultConfig('standard');
    await writeConfig(smallCfg, { skipCloudSync: true });

    const chromiumRateLimitErrors = [
      'This request exceeds the MAX_WRITE_OPERATIONS_PER_MINUTE quota.',
      'This request exceeds the MAX_WRITE_OPERATIONS_PER_HOUR quota.',
      'This request exceeds the MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE quota.',
    ];

    for (const errMsg of chromiumRateLimitErrors) {
      mock.values[UI_KEYS.cloudSync] = {
        ...(mock.values[UI_KEYS.cloudSync] as object),
        enabled: true,
        pendingRemote: extractSyncedPayload(smallCfg),
        remoteUpdatedAt: 1_700_000_000_000,
      };
      mock.api.storage.sync.remove.mockClear();
      mock.api.storage.sync.set.mockRejectedValueOnce(new Error(errMsg));

      const res = await pushCloudSyncNow();
      expect(res.status, errMsg).toBe('error');
      expect(res.error, errMsg).toContain('WRITE_OPERATIONS');
      expect(res.error, errMsg).not.toBe(
        ERROR_LOCALES.en.cloudSyncQuotaExceeded
      );
      expect(res.pendingRemote, errMsg).toBeUndefined();
      expect(res.remoteUpdatedAt, errMsg).toBeUndefined();
      expect(mock.api.storage.sync.remove, errMsg).not.toHaveBeenCalled();
      expect(reassembleSyncChunks(mock.syncValues).status, errMsg).toBe('ok');
    }

    // Firefox DOMException with name === 'QuotaExceededError' (message omits 'QuotaExceededError')
    mock.api.storage.sync.set.mockRejectedValue(
      new DOMException(
        'storage.sync API call exceeded its quota limitations.',
        'QuotaExceededError'
      )
    );
    const ffDomRes = await pushCloudSyncNow();
    expect(ffDomRes.status).toBe('quota_exceeded');
    expect(ffDomRes.error).toBe(ERROR_LOCALES.en.cloudSyncQuotaExceeded);
  });

  it('rejects in-memory getter objects passed directly to validateSyncedPayload with 0 getter invocations', () => {
    const base = extractSyncedPayload(createDefaultConfig('standard'));
    let getterCalls = 0;

    // 1. Top-level property getter
    const topGetter = { ...base };
    Object.defineProperty(topGetter, 'theme', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return 'dark';
      },
    });
    expect(() => validateSyncedPayload(topGetter)).toThrow();

    // 2. Nested object getter (sceneModes.for_you & rules.grokFilter.enabled)
    const nestedSceneGetter = structuredClone(base);
    Object.defineProperty(nestedSceneGetter.sceneModes, 'for_you', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return 'strip';
      },
    });
    expect(() => validateSyncedPayload(nestedSceneGetter)).toThrow();

    const nestedRuleGetter = structuredClone(base);
    Object.defineProperty(nestedRuleGetter.rules.grokFilter, 'enabled', {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return true;
      },
    });
    expect(() => validateSyncedPayload(nestedRuleGetter)).toThrow();

    // 3. Nested array element getter and [Symbol.iterator] getter
    const nestedElemGetter = structuredClone(base);
    const getterItems: unknown[] = [];
    Object.defineProperty(getterItems, 0, {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return {
          id: 'kw-elem',
          pattern: 'spam',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
        };
      },
    });
    nestedElemGetter.rules.keywords.items =
      getterItems as typeof nestedElemGetter.rules.keywords.items;
    expect(() => validateSyncedPayload(nestedElemGetter)).toThrow();

    const nestedArrGetter = structuredClone(base);
    const evilScopes: string[] = ['text'];
    Object.defineProperty(evilScopes, Symbol.iterator, {
      configurable: true,
      get() {
        getterCalls += 1;
        return function* () {
          yield 'EVIL_SCOPE';
        };
      },
    });
    nestedArrGetter.rules.keywords.items = [
      {
        id: 'kw-getter',
        pattern: 'spam',
        isRegex: false,
        scopes: evilScopes as ['text'],
        enabled: true,
      },
    ];
    expect(() => validateSyncedPayload(nestedArrGetter)).toThrow();

    // 4. Inherited & own [Symbol.toStringTag] getters
    const inheritedTag = Object.create(
      Object.defineProperty({}, Symbol.toStringTag, {
        configurable: true,
        get() {
          getterCalls += 1;
          return 'Object';
        },
      })
    );
    expect(() => validateSyncedPayload(inheritedTag)).toThrow();

    const ownTag = { ...base };
    Object.defineProperty(ownTag, Symbol.toStringTag, {
      configurable: true,
      get() {
        getterCalls += 1;
        return 'Object';
      },
    });
    expect(() => validateSyncedPayload(ownTag)).toThrow();

    expect(getterCalls).toBe(0);

    // 5. Valid payload still validates cleanly and returns an isolated clone
    const cleanInput = structuredClone(base);
    const validated = validateSyncedPayload(cleanInput);
    cleanInput.sceneModes!.for_you = 'strip';
    expect(validated.sceneModes?.for_you).toBe('inherit');
  });

  it('BUG-C1-2 & BUG-C1-3 regressions: guards resolveCloudSync on conflict status and clears dangling debounceTimer when disabled', async () => {
    const remoteCfg = createDefaultConfig('standard');
    remoteCfg.locale = 'fr';
    remoteCfg.theme = 'dark';
    const remoteRecords = await buildRemoteSyncRecords(remoteCfg, 'device-remote');

    const localCfg = createDefaultConfig('standard');
    localCfg.locale = 'ja';
    localCfg.theme = 'light';

    const env = mockChrome({
      [STORAGE_KEYS.CONFIG]: localCfg,
      [UI_KEYS.cloudSync]: { enabled: false, status: 'idle' },
    });
    await env.api.storage.sync.set(remoteRecords);

    // BUG-C1-2: resolveCloudSync MUST reject when status === 'idle' for all strategies
    for (const strategy of ['local', 'remote', 'merge'] as const) {
      await expect(resolveCloudSync(strategy)).rejects.toThrow();
    }
    expect((await readConfig()).locale).toBe('ja');
    expect((await readConfig()).theme).toBe('light');
    expect((await readCloudSyncMeta()).enabled).toBe(false);
    expect((await readCloudSyncMeta()).status).toBe('idle');

    // Enter conflict -> resolve with 'local' -> now status === 'synced'
    const conflict = await enableCloudSync();
    expect(conflict.status).toBe('conflict');
    const synced = await resolveCloudSync('local');
    expect(synced.status).toBe('synced');
    expect(synced.enabled).toBe(true);

    // BUG-C1-2: resolveCloudSync MUST also reject once status === 'synced'
    for (const strategy of ['local', 'remote', 'merge'] as const) {
      await expect(resolveCloudSync(strategy)).rejects.toThrow();
    }

    // Disable sync and verify BUG-C1-3: scheduleCloudSyncPush disarms its 1500ms timer cleanly
    await disableCloudSync();
    vi.useFakeTimers();
    const syncSetSpy = vi.spyOn(env.api.storage.sync, 'set');
    try {
      scheduleCloudSyncPush();
      // Let readCloudSyncMeta().then(...) microtask chain settle
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(CLOUD_SYNC_DEBOUNCE_MS + 500);
      expect(syncSetSpy).not.toHaveBeenCalled();
    } finally {
      syncSetSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
