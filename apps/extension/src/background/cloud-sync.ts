import {
  createDefaultConfig,
  resolveEnabledCloudLangGroups,
  type CloudKeywordLangGroup,
  type FilterConfig,
  type InstalledRulePack,
  type SceneModeKey,
  type SceneModeOverride,
} from '@keepxclean/shared';
import { getActiveErrors } from '../i18n/errors';
import {
  errorText,
  type CloudSyncMeta,
  type CloudSyncStrategy,
  type SyncedConfigFields,
  type SyncedConfigPayload,
} from '../services/model';
import { PROTO_POLLUTION_KEYS, SCENE_MODE_KEYS } from '../services/schema';
import { assert, record, validateConfig } from '../services/validation';
import {
  enqueue,
  readCloudSyncMeta,
  readConfig,
  writeCloudSyncMeta,
  writeConfig,
} from './repository';

export const SYNC_META_KEY = 'kxc_sync_meta_v1';
export const SYNC_CHUNK_PREFIX = 'kxc_sync_chunk_';
export const MAX_SYNC_ITEM_BYTES = 6144;
export const MAX_SYNC_TOTAL_BYTES = 90_000;
export const MAX_SYNC_CHUNKS = 32;
export const CLOUD_SYNC_DEBOUNCE_MS = 1500;
export const CLOUD_SYNC_PUSH_ALARM = 'kxc-cloud-sync-push';

export interface SyncStorageMeta {
  v: 1;
  chunks: number;
  sha256: string;
  updatedAt: number;
  deviceId: string;
}

export const SYNCED_CONFIG_KEYS: readonly (keyof SyncedConfigFields)[] = [
  'enabled',
  'preset',
  'interceptionMode',
  'sceneModes',
  'exemptFollowing',
  'profileSceneBadgeOnly',
  'locale',
  'theme',
  'enableCloudKeywords',
  'enabledCloudLangGroups',
  'disabledCloudKeywordIds',
  'rules',
  'installedPacks',
] as const;

const ALLOWED_SYNC_PAYLOAD_KEYS = new Set<string>([
  'version',
  ...SYNCED_CONFIG_KEYS,
]);

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const CHUNK_KEY_RE = /^kxc_sync_chunk_(\d+)$/;
const RATE_LIMIT_ERROR_RE = /MAX_(?:SUSTAINED_)?WRITE_OPERATIONS/i;
const QUOTA_ERROR_RE = /QUOTA_BYTES|MAX_ITEMS|QuotaExceeded/i;
const TOTAL_QUOTA_ERROR_RE =
  /(?:^|\b)QUOTA_BYTES(?!_PER_ITEM)|\bMAX_ITEMS\b|QuotaExceeded/i;
const PER_ITEM_QUOTA_ERROR_RE = /QUOTA_BYTES_PER_ITEM/i;
const textEncoder = new TextEncoder();

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let scheduleGeneration = 0;

function hasQuotaExceededErrorName(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'QuotaExceededError'
  );
}

function isStorageQuotaError(msg: string, err?: unknown): boolean {
  if (RATE_LIMIT_ERROR_RE.test(msg)) return false;
  return QUOTA_ERROR_RE.test(msg) || hasQuotaExceededErrorName(err);
}

function isTotalQuotaError(msg: string, err?: unknown): boolean {
  if (RATE_LIMIT_ERROR_RE.test(msg) || PER_ITEM_QUOTA_ERROR_RE.test(msg)) {
    return false;
  }
  return TOTAL_QUOTA_ERROR_RE.test(msg) || hasQuotaExceededErrorName(err);
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function getSyncArea(): chrome.storage.SyncStorageArea | undefined {
  try {
    return typeof chrome !== 'undefined' ? chrome.storage?.sync : undefined;
  } catch {
    return undefined;
  }
}

function clearPendingSchedule() {
  scheduleGeneration += 1;
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  try {
    void chrome.alarms?.clear?.(CLOUD_SYNC_PUSH_ALARM)?.catch?.(() => undefined);
  } catch {
    // Ignore when alarms API is unavailable
  }
}

export function resetCloudSyncTimers(): void {
  clearPendingSchedule();
}

export function utf8Bytes(str: string): number {
  return textEncoder.encode(str).byteLength;
}

export function storageItemBytes(key: string, value: unknown): number {
  return utf8Bytes(key) + utf8Bytes(JSON.stringify(value));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined ? 'null' : canonicalJson(item)
    );
    return `[${items.join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];
  for (const key of keys) {
    const entryVal = obj[key];
    if (entryVal === undefined) continue;
    pairs.push(`${JSON.stringify(key)}:${canonicalJson(entryVal)}`);
  }
  return `{${pairs.join(',')}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const encoded = textEncoder.encode(input);
  const buffer = new Uint8Array(encoded).buffer;
  const digestBuf = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digestBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function jsonEscapedUtf8Cost(ch: string, cp: number): number {
  if (cp >= 0x20 && cp <= 0x7e) {
    return cp === 0x22 || cp === 0x5c ? 2 : 1;
  }
  return utf8Bytes(JSON.stringify(ch)) - 2;
}

export function chunkSyncPayload(rawJson: string): string[] {
  if (rawJson.length === 0) return [''];
  const chunks: string[] = [];
  let pos = 0;
  let chunkIndex = 0;

  while (pos < rawJson.length) {
    const key = `${SYNC_CHUNK_PREFIX}${chunkIndex}`;
    const maxInnerBytes = MAX_SYNC_ITEM_BYTES - utf8Bytes(key) - 2;
    const start = pos;
    let currentBytes = 0;

    while (pos < rawJson.length) {
      const cp = rawJson.codePointAt(pos)!;
      const charLen = cp > 0xffff ? 2 : 1;
      const ch = rawJson.slice(pos, pos + charLen);
      const cost = jsonEscapedUtf8Cost(ch, cp);

      if (currentBytes + cost > maxInnerBytes && pos > start) {
        break;
      }
      currentBytes += cost;
      pos += charLen;
    }

    chunks.push(rawJson.slice(start, pos));
    chunkIndex += 1;
  }

  return chunks;
}

export type ReassembleResult =
  | { status: 'empty' }
  | { status: 'incomplete' }
  | { status: 'invalid'; error: string }
  | {
      status: 'ok';
      meta: SyncStorageMeta;
      rawJson: string;
      bytesUsed: number;
    };

export function reassembleSyncChunks(
  records: Record<string, unknown>
): ReassembleResult {
  const e = getActiveErrors();
  if (!hasOwn(records, SYNC_META_KEY) || records[SYNC_META_KEY] === undefined) {
    return { status: 'empty' };
  }
  const rawMeta = records[SYNC_META_KEY];
  if (
    !rawMeta ||
    typeof rawMeta !== 'object' ||
    Array.isArray(rawMeta) ||
    Object.prototype.toString.call(rawMeta) !== '[object Object]'
  ) {
    return { status: 'invalid', error: e.cloudSyncCorruptRemote };
  }
  const m = rawMeta as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(m)) {
    if (PROTO_POLLUTION_KEYS.has(key)) {
      return { status: 'invalid', error: e.cloudSyncCorruptRemote };
    }
  }
  if (
    m.v !== 1 ||
    typeof m.chunks !== 'number' ||
    !Number.isSafeInteger(m.chunks) ||
    m.chunks < 1 ||
    m.chunks > MAX_SYNC_CHUNKS ||
    typeof m.sha256 !== 'string' ||
    !SHA256_HEX_RE.test(m.sha256) ||
    typeof m.updatedAt !== 'number' ||
    !Number.isFinite(m.updatedAt) ||
    m.updatedAt <= 0 ||
    typeof m.deviceId !== 'string' ||
    m.deviceId.trim().length === 0 ||
    m.deviceId.length > 128
  ) {
    return { status: 'invalid', error: e.cloudSyncCorruptRemote };
  }

  const meta: SyncStorageMeta = {
    v: 1,
    chunks: m.chunks,
    sha256: m.sha256,
    updatedAt: m.updatedAt,
    deviceId: m.deviceId,
  };

  let bytesUsed = storageItemBytes(SYNC_META_KEY, meta);
  const parts: string[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    const key = `${SYNC_CHUNK_PREFIX}${i}`;
    if (!hasOwn(records, key) || records[key] === undefined) {
      return { status: 'incomplete' };
    }
    const chunk = records[key];
    if (typeof chunk !== 'string') {
      return { status: 'invalid', error: e.cloudSyncCorruptRemote };
    }
    parts.push(chunk);
    bytesUsed += storageItemBytes(key, chunk);
  }

  return {
    status: 'ok',
    meta,
    rawJson: parts.join(''),
    bytesUsed,
  };
}

export function extractSyncedPayload(
  config: FilterConfig
): SyncedConfigPayload {
  return {
    version: 1,
    enabled: config.enabled,
    preset: config.preset,
    interceptionMode: config.interceptionMode,
    sceneModes: structuredClone(
      config.sceneModes ?? {
        for_you: 'inherit',
        following: 'inherit',
        reply: 'inherit',
        search: 'inherit',
      }
    ),
    exemptFollowing: config.exemptFollowing,
    profileSceneBadgeOnly: config.profileSceneBadgeOnly,
    locale: config.locale,
    theme: config.theme,
    enableCloudKeywords: config.enableCloudKeywords,
    ...(config.enabledCloudLangGroups !== undefined
      ? { enabledCloudLangGroups: [...config.enabledCloudLangGroups] }
      : {}),
    disabledCloudKeywordIds: [...config.disabledCloudKeywordIds],
    rules: structuredClone(config.rules),
    installedPacks: structuredClone(config.installedPacks ?? []),
  };
}

export function validateSyncedPayload(raw: unknown): SyncedConfigPayload {
  const e = getActiveErrors();
  const obj = record(raw, 'syncPayload');
  assert(obj.version === 1, e.unsupportedConfigVersion);
  for (const key of Object.keys(obj)) {
    assert(ALLOWED_SYNC_PAYLOAD_KEYS.has(key), e.unknownConfigField);
  }
  const base = createDefaultConfig();
  const candidate = structuredClone(base) as unknown as Record<string, unknown>;
  for (const key of SYNCED_CONFIG_KEYS) {
    if (hasOwn(obj, key) && obj[key] !== undefined) {
      candidate[key] = obj[key];
    } else if (key === 'enabledCloudLangGroups') {
      delete candidate.enabledCloudLangGroups;
    }
  }
  const validated = validateConfig(candidate);
  return extractSyncedPayload(validated);
}

export function applySyncedPayloadToLocal(
  local: FilterConfig,
  remote: SyncedConfigPayload
): FilterConfig {
  const validatedRemote = validateSyncedPayload(remote);
  const candidate = structuredClone(local);
  candidate.enabled = validatedRemote.enabled;
  candidate.preset = validatedRemote.preset;
  candidate.interceptionMode = validatedRemote.interceptionMode;
  candidate.sceneModes = structuredClone(validatedRemote.sceneModes);
  candidate.exemptFollowing = validatedRemote.exemptFollowing;
  candidate.profileSceneBadgeOnly = validatedRemote.profileSceneBadgeOnly;
  candidate.locale = validatedRemote.locale;
  candidate.theme = validatedRemote.theme;
  candidate.enableCloudKeywords = validatedRemote.enableCloudKeywords;
  if (validatedRemote.enabledCloudLangGroups !== undefined) {
    candidate.enabledCloudLangGroups = [
      ...validatedRemote.enabledCloudLangGroups,
    ];
  } else {
    delete candidate.enabledCloudLangGroups;
  }
  candidate.disabledCloudKeywordIds = [
    ...validatedRemote.disabledCloudKeywordIds,
  ];
  candidate.rules = structuredClone(validatedRemote.rules);
  candidate.installedPacks = structuredClone(
    validatedRemote.installedPacks ?? []
  );
  return validateConfig(candidate);
}

function packItemIdSet(pack: InstalledRulePack): Set<string> {
  const ids = new Set<string>();
  for (const k of pack.keywords ?? []) ids.add(k.id);
  for (const d of pack.domains ?? []) ids.add(d.id);
  for (const u of pack.blockedUids ?? []) ids.add(u.uid);
  return ids;
}

export function mergeSyncedPayloads(
  local: SyncedConfigPayload,
  remote: SyncedConfigPayload
): SyncedConfigPayload {
  const cleanLocal = validateSyncedPayload(local);
  const cleanRemote = validateSyncedPayload(remote);
  const merged = structuredClone(cleanLocal);

  // 1. Custom keywords: ID union (local wins on collision)
  const kwIds = new Set(merged.rules.keywords.items.map((k) => k.id));
  for (const item of cleanRemote.rules.keywords.items) {
    if (!kwIds.has(item.id)) {
      kwIds.add(item.id);
      merged.rules.keywords.items.push(structuredClone(item));
    }
  }
  merged.rules.keywords.enabled =
    cleanLocal.rules.keywords.enabled || cleanRemote.rules.keywords.enabled;

  // 2. External domains: union by ID and normalized domain (local wins on collision)
  const domainIds = new Set(merged.rules.domainFilter.items.map((d) => d.id));
  const domainNames = new Set(
    merged.rules.domainFilter.items.map((d) => d.domain)
  );
  for (const item of cleanRemote.rules.domainFilter.items) {
    if (!domainIds.has(item.id) && !domainNames.has(item.domain)) {
      domainIds.add(item.id);
      domainNames.add(item.domain);
      merged.rules.domainFilter.items.push(structuredClone(item));
    }
  }
  merged.rules.domainFilter.enabled =
    cleanLocal.rules.domainFilter.enabled ||
    cleanRemote.rules.domainFilter.enabled;

  // 3. Installed packs: union by ID; newer installedAt wins on collision (local on tie) + union disabledItemIds
  const localPacks = merged.installedPacks ?? [];
  const packIndexById = new Map(localPacks.map((p, i) => [p.id, i]));
  for (const remotePack of cleanRemote.installedPacks ?? []) {
    const idx = packIndexById.get(remotePack.id);
    if (idx === undefined) {
      packIndexById.set(remotePack.id, localPacks.length);
      localPacks.push(structuredClone(remotePack));
    } else {
      const localPack = localPacks[idx]!;
      const winner =
        remotePack.installedAt > localPack.installedAt
          ? structuredClone(remotePack)
          : structuredClone(localPack);
      const validIds = packItemIdSet(winner);
      const unionDisabled = [
        ...new Set([
          ...(localPack.disabledItemIds ?? []),
          ...(remotePack.disabledItemIds ?? []),
        ]),
      ].filter((id) => validIds.has(id));
      if (unionDisabled.length > 0) {
        winner.disabledItemIds = unionDisabled;
      } else {
        delete winner.disabledItemIds;
      }
      localPacks[idx] = winner;
    }
  }
  merged.installedPacks = localPacks;

  // 4. Disabled cloud keyword IDs: set union
  merged.disabledCloudKeywordIds = [
    ...new Set([
      ...cleanLocal.disabledCloudKeywordIds,
      ...cleanRemote.disabledCloudKeywordIds,
    ]),
  ];

  // 5. Enabled cloud language groups: keep undefined if both undefined, else union resolved groups
  if (
    cleanLocal.enabledCloudLangGroups === undefined &&
    cleanRemote.enabledCloudLangGroups === undefined
  ) {
    delete merged.enabledCloudLangGroups;
  } else {
    const localGroups = resolveEnabledCloudLangGroups(cleanLocal);
    const remoteGroups = resolveEnabledCloudLangGroups(cleanRemote);
    merged.enabledCloudLangGroups = [
      ...new Set<CloudKeywordLangGroup>([...localGroups, ...remoteGroups]),
    ];
  }

  // 6. Scene modes: preserve non-inherit local override, else adopt remote non-inherit override
  const mergedScenes: Record<SceneModeKey, SceneModeOverride> = {
    for_you: 'inherit',
    following: 'inherit',
    reply: 'inherit',
    search: 'inherit',
  };
  for (const scene of SCENE_MODE_KEYS) {
    const localMode = cleanLocal.sceneModes?.[scene] ?? 'inherit';
    const remoteMode = cleanRemote.sceneModes?.[scene] ?? 'inherit';
    mergedScenes[scene] =
      localMode !== 'inherit'
        ? localMode
        : remoteMode !== 'inherit'
          ? remoteMode
          : 'inherit';
  }
  merged.sceneModes = mergedScenes;

  // 7. Language filter codes: union if both enabled with same mode
  if (
    cleanLocal.rules.languageFilter.enabled &&
    cleanRemote.rules.languageFilter.enabled &&
    cleanLocal.rules.languageFilter.mode ===
      cleanRemote.rules.languageFilter.mode
  ) {
    merged.rules.languageFilter.languages = [
      ...new Set([
        ...cleanLocal.rules.languageFilter.languages,
        ...cleanRemote.rules.languageFilter.languages,
      ]),
    ];
  }

  return validateSyncedPayload(merged);
}

type RemoteReadResult =
  | { kind: 'empty' }
  | { kind: 'incomplete' }
  | { kind: 'invalid'; error: string }
  | {
      kind: 'ok';
      meta: SyncStorageMeta;
      payload: SyncedConfigPayload;
      bytesUsed: number;
    };

async function readRemoteSyncPayload(): Promise<RemoteReadResult> {
  const e = getActiveErrors();
  const syncArea = getSyncArea();
  if (!syncArea) {
    return { kind: 'invalid', error: e.cloudSyncUnavailable };
  }
  const records = (await syncArea.get(null)) as Record<string, unknown>;
  const reassembled = reassembleSyncChunks(records);
  if (reassembled.status === 'empty') return { kind: 'empty' };
  if (reassembled.status === 'incomplete') return { kind: 'incomplete' };
  if (reassembled.status === 'invalid') {
    return { kind: 'invalid', error: reassembled.error };
  }

  const computedHash = await sha256Hex(reassembled.rawJson);
  if (computedHash !== reassembled.meta.sha256) {
    return { kind: 'invalid', error: e.cloudSyncCorruptRemote };
  }
  try {
    const parsed: unknown = JSON.parse(reassembled.rawJson);
    const payload = validateSyncedPayload(parsed);
    return {
      kind: 'ok',
      meta: reassembled.meta,
      payload,
      bytesUsed: reassembled.bytesUsed,
    };
  } catch {
    return { kind: 'invalid', error: e.cloudSyncCorruptRemote };
  }
}

function ensureDeviceId(meta: CloudSyncMeta): string {
  if (meta.deviceId && meta.deviceId.trim()) return meta.deviceId;
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `kxc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function pushLocalPayload(
  config: FilterConfig,
  currentMeta: CloudSyncMeta
): Promise<CloudSyncMeta> {
  const e = getActiveErrors();
  const syncArea = getSyncArea();
  const deviceId = ensureDeviceId(currentMeta);
  if (!syncArea) {
    const failed: CloudSyncMeta = {
      ...currentMeta,
      deviceId,
      status: 'error',
      error: e.cloudSyncUnavailable,
      pendingRemote: undefined,
      remoteUpdatedAt: undefined,
    };
    await writeCloudSyncMeta(failed);
    return failed;
  }

  const payload = extractSyncedPayload(config);
  const rawJson = canonicalJson(payload);
  const sha256 = await sha256Hex(rawJson);
  const chunks = chunkSyncPayload(rawJson);
  const updatedAt = Date.now();
  const syncMetaRecord: SyncStorageMeta = {
    v: 1,
    chunks: chunks.length,
    sha256,
    updatedAt,
    deviceId,
  };

  let totalBytes = storageItemBytes(SYNC_META_KEY, syncMetaRecord);
  const batch: Record<string, unknown> = {
    [SYNC_META_KEY]: syncMetaRecord,
  };
  for (let i = 0; i < chunks.length; i++) {
    const key = `${SYNC_CHUNK_PREFIX}${i}`;
    batch[key] = chunks[i];
    totalBytes += storageItemBytes(key, chunks[i]);
  }

  if (chunks.length > MAX_SYNC_CHUNKS || totalBytes > MAX_SYNC_TOTAL_BYTES) {
    const exceeded: CloudSyncMeta = {
      ...currentMeta,
      deviceId,
      status: 'quota_exceeded',
      bytesUsed: totalBytes,
      chunkCount: chunks.length,
      error: e.cloudSyncQuotaExceeded,
      pendingRemote: undefined,
      remoteUpdatedAt: undefined,
    };
    await writeCloudSyncMeta(exceeded);
    return exceeded;
  }

  let staleKeys: string[] = [];
  try {
    const existing = (await syncArea.get(null)) as Record<string, unknown>;
    staleKeys = Object.keys(existing).filter((key) => {
      const m = CHUNK_KEY_RE.exec(key);
      return m !== null && Number(m[1]) >= chunks.length;
    });
  } catch {
    // Ignore stale key inspection errors; proceed with atomic set
  }

  try {
    await syncArea.set(batch);
  } catch (err) {
    const msg = errorText(err);
    if (isTotalQuotaError(msg, err) && staleKeys.length > 0) {
      try {
        await syncArea.remove(staleKeys);
        staleKeys = [];
        await syncArea.set(batch);
      } catch (retryErr) {
        const retryMsg = errorText(retryErr);
        const degraded: CloudSyncMeta = isStorageQuotaError(retryMsg, retryErr)
          ? {
              ...currentMeta,
              deviceId,
              status: 'quota_exceeded',
              bytesUsed: totalBytes,
              chunkCount: chunks.length,
              error: e.cloudSyncQuotaExceeded,
              pendingRemote: undefined,
              remoteUpdatedAt: undefined,
            }
          : {
              ...currentMeta,
              deviceId,
              status: 'error',
              error: e.cloudSyncFailed(retryMsg),
              pendingRemote: undefined,
              remoteUpdatedAt: undefined,
            };
        await writeCloudSyncMeta(degraded);
        return degraded;
      }
    } else {
      const degraded: CloudSyncMeta = isStorageQuotaError(msg, err)
        ? {
            ...currentMeta,
            deviceId,
            status: 'quota_exceeded',
            bytesUsed: totalBytes,
            chunkCount: chunks.length,
            error: e.cloudSyncQuotaExceeded,
            pendingRemote: undefined,
            remoteUpdatedAt: undefined,
          }
        : {
            ...currentMeta,
            deviceId,
            status: 'error',
            error: e.cloudSyncFailed(msg),
            pendingRemote: undefined,
            remoteUpdatedAt: undefined,
          };
      await writeCloudSyncMeta(degraded);
      return degraded;
    }
  }

  if (staleKeys.length > 0) {
    try {
      await syncArea.remove(staleKeys);
    } catch {
      // Non-fatal trailing cleanup failure does not invalidate committed chunks
    }
  }

  const synced: CloudSyncMeta = {
    ...currentMeta,
    deviceId,
    enabled: true,
    status: 'synced',
    lastPushAt: updatedAt,
    bytesUsed: totalBytes,
    chunkCount: chunks.length,
    lastSyncedSha256: sha256,
    error: undefined,
    pendingRemote: undefined,
    remoteUpdatedAt: undefined,
  };
  await writeCloudSyncMeta(synced);
  return synced;
}

export async function enableCloudSync(): Promise<CloudSyncMeta> {
  return enqueue(async () => {
    clearPendingSchedule();
    const e = getActiveErrors();
    const syncArea = getSyncArea();
    assert(syncArea, e.cloudSyncUnavailable);

    const config = await readConfig();
    const currentMeta = await readCloudSyncMeta();
    const deviceId = ensureDeviceId(currentMeta);
    const localPayload = extractSyncedPayload(config);
    const localHash = await sha256Hex(canonicalJson(localPayload));

    const remote = await readRemoteSyncPayload();
    if (remote.kind === 'empty') {
      return pushLocalPayload(config, {
        ...currentMeta,
        deviceId,
        enabled: false,
        pendingRemote: undefined,
        remoteUpdatedAt: undefined,
      });
    }
    if (remote.kind === 'incomplete' || remote.kind === 'invalid') {
      const failed: CloudSyncMeta = {
        ...currentMeta,
        deviceId,
        enabled: false,
        status: 'error',
        error:
          remote.kind === 'invalid' ? remote.error : e.cloudSyncCorruptRemote,
        pendingRemote: undefined,
        remoteUpdatedAt: undefined,
      };
      await writeCloudSyncMeta(failed);
      return failed;
    }

    const remoteCanonicalHash = await sha256Hex(canonicalJson(remote.payload));
    if (remote.meta.sha256 === localHash || remoteCanonicalHash === localHash) {
      const synced: CloudSyncMeta = {
        ...currentMeta,
        deviceId,
        enabled: true,
        status: 'synced',
        lastPullAt: Date.now(),
        bytesUsed: remote.bytesUsed,
        chunkCount: remote.meta.chunks,
        lastSyncedSha256: localHash,
        error: undefined,
        pendingRemote: undefined,
        remoteUpdatedAt: undefined,
      };
      await writeCloudSyncMeta(synced);
      return synced;
    }

    const conflict: CloudSyncMeta = {
      ...currentMeta,
      deviceId,
      enabled: false,
      status: 'conflict',
      pendingRemote: remote.payload,
      remoteUpdatedAt: remote.meta.updatedAt,
      bytesUsed: remote.bytesUsed,
      chunkCount: remote.meta.chunks,
      error: undefined,
    };
    await writeCloudSyncMeta(conflict);
    return conflict;
  });
}

export async function resolveCloudSync(
  strategy: CloudSyncStrategy
): Promise<CloudSyncMeta> {
  return enqueue(async () => {
    const e = getActiveErrors();
    assert(
      strategy === 'local' || strategy === 'remote' || strategy === 'merge',
      e.cloudSyncInvalidStrategy
    );
    const syncArea = getSyncArea();
    assert(syncArea, e.cloudSyncUnavailable);

    const currentMeta = await readCloudSyncMeta();
    assert(currentMeta.status === 'conflict', e.cloudSyncNoPendingConflict);
    clearPendingSchedule();
    const config = await readConfig();
    const deviceId = ensureDeviceId(currentMeta);

    if (strategy === 'local') {
      return pushLocalPayload(config, {
        ...currentMeta,
        deviceId,
        enabled: false,
        pendingRemote: undefined,
        remoteUpdatedAt: undefined,
        error: undefined,
      });
    }

    const freshRemote = await readRemoteSyncPayload();
    let remotePayload: SyncedConfigPayload | undefined;
    let remoteBytes = currentMeta.bytesUsed;
    let remoteChunks = currentMeta.chunkCount;

    if (freshRemote.kind === 'ok') {
      remotePayload = freshRemote.payload;
      remoteBytes = freshRemote.bytesUsed;
      remoteChunks = freshRemote.meta.chunks;
    } else if (currentMeta.pendingRemote) {
      remotePayload = validateSyncedPayload(currentMeta.pendingRemote);
    }

    assert(remotePayload !== undefined, e.cloudSyncNoPendingConflict);

    if (strategy === 'remote') {
      const nextConfig = applySyncedPayloadToLocal(config, remotePayload);
      await writeConfig(nextConfig, { skipCloudSync: true });
      const appliedHash = await sha256Hex(
        canonicalJson(extractSyncedPayload(nextConfig))
      );
      const synced: CloudSyncMeta = {
        ...currentMeta,
        deviceId,
        enabled: true,
        status: 'synced',
        lastPullAt: Date.now(),
        bytesUsed: remoteBytes,
        chunkCount: remoteChunks,
        lastSyncedSha256: appliedHash,
        error: undefined,
        pendingRemote: undefined,
        remoteUpdatedAt: undefined,
      };
      await writeCloudSyncMeta(synced);
      return synced;
    }

    const mergedPayload = mergeSyncedPayloads(
      extractSyncedPayload(config),
      remotePayload
    );
    const nextConfig = applySyncedPayloadToLocal(config, mergedPayload);
    await writeConfig(nextConfig, { skipCloudSync: true });
    return pushLocalPayload(nextConfig, {
      ...currentMeta,
      deviceId,
      enabled: false,
      pendingRemote: undefined,
      remoteUpdatedAt: undefined,
      error: undefined,
    });
  });
}

export async function disableCloudSync(): Promise<CloudSyncMeta> {
  return enqueue(async () => {
    clearPendingSchedule();
    const currentMeta = await readCloudSyncMeta();
    const disabled: CloudSyncMeta = {
      ...currentMeta,
      enabled: false,
      status: 'idle',
      pendingRemote: undefined,
      remoteUpdatedAt: undefined,
      error: undefined,
    };
    await writeCloudSyncMeta(disabled);
    return disabled;
  });
}

export async function pushCloudSyncNow(): Promise<CloudSyncMeta> {
  return enqueue(async () => {
    clearPendingSchedule();
    const currentMeta = await readCloudSyncMeta();
    if (!currentMeta.enabled) return currentMeta;
    const config = await readConfig();
    return pushLocalPayload(config, currentMeta);
  });
}

export async function flushCloudSyncPush(): Promise<CloudSyncMeta> {
  return enqueue(async () => {
    clearPendingSchedule();
    const currentMeta = await readCloudSyncMeta();
    if (!currentMeta.enabled) return currentMeta;
    const config = await readConfig();
    const hash = await sha256Hex(canonicalJson(extractSyncedPayload(config)));
    if (hash === currentMeta.lastSyncedSha256 && currentMeta.status === 'synced') {
      return currentMeta;
    }
    return pushLocalPayload(config, currentMeta);
  });
}

export function scheduleCloudSyncPush(): void {
  const gen = ++scheduleGeneration;
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    void flushCloudSyncPush().catch(() => undefined);
  }, CLOUD_SYNC_DEBOUNCE_MS);
  void readCloudSyncMeta()
    .then((meta) => {
      if (gen !== scheduleGeneration) return undefined;
      if (!meta.enabled) {
        if (debounceTimer !== undefined) {
          clearTimeout(debounceTimer);
          debounceTimer = undefined;
        }
        return undefined;
      }
      return chrome.alarms?.create?.(CLOUD_SYNC_PUSH_ALARM, {
        delayInMinutes: 0.5,
      });
    })
    .catch(() => undefined);
}

async function pullRemoteIfEnabledLocked(): Promise<void> {
  const currentMeta = await readCloudSyncMeta();
  if (!currentMeta.enabled) return;

  const remote = await readRemoteSyncPayload();
  if (remote.kind === 'empty' || remote.kind === 'incomplete') {
    return;
  }
  if (remote.kind === 'invalid') {
    if (currentMeta.status === 'quota_exceeded') {
      return;
    }
    await writeCloudSyncMeta({
      ...currentMeta,
      status: 'error',
      error: remote.error,
      pendingRemote: undefined,
      remoteUpdatedAt: undefined,
    });
    return;
  }

  // Barrier 1: ignore echoes written by this device
  if (currentMeta.deviceId && remote.meta.deviceId === currentMeta.deviceId) {
    return;
  }

  const local = await readConfig();
  const localHash = await sha256Hex(canonicalJson(extractSyncedPayload(local)));
  const remoteCanonicalHash = await sha256Hex(canonicalJson(remote.payload));

  // Barrier 2a: true convergence between local and remote content
  if (remote.meta.sha256 === localHash || remoteCanonicalHash === localHash) {
    if (
      currentMeta.lastSyncedSha256 !== localHash ||
      currentMeta.status !== 'synced' ||
      currentMeta.error !== undefined ||
      currentMeta.pendingRemote !== undefined ||
      currentMeta.remoteUpdatedAt !== undefined
    ) {
      await writeCloudSyncMeta({
        ...currentMeta,
        status: 'synced',
        lastPullAt: Date.now(),
        bytesUsed: remote.bytesUsed,
        chunkCount: remote.meta.chunks,
        lastSyncedSha256: localHash,
        error: undefined,
        pendingRemote: undefined,
        remoteUpdatedAt: undefined,
      });
    }
    return;
  }

  // Barrier 2b: remote unchanged since last convergence while local has unpushed edits/error/quota_exceeded
  if (
    remote.meta.sha256 === currentMeta.lastSyncedSha256 ||
    remoteCanonicalHash === currentMeta.lastSyncedSha256
  ) {
    return;
  }

  // Protect diverged unpushed local changes from silent overwrite
  if (currentMeta.status === 'quota_exceeded') {
    return;
  }
  const hasUnpushedLocalChanges =
    currentMeta.lastSyncedSha256 !== undefined
      ? localHash !== currentMeta.lastSyncedSha256
      : currentMeta.status === 'error';
  if (hasUnpushedLocalChanges) {
    clearPendingSchedule();
    await writeCloudSyncMeta({
      ...currentMeta,
      enabled: false,
      status: 'conflict',
      pendingRemote: remote.payload,
      remoteUpdatedAt: remote.meta.updatedAt,
      bytesUsed: remote.bytesUsed,
      chunkCount: remote.meta.chunks,
      error: undefined,
    });
    return;
  }

  clearPendingSchedule();
  const next = applySyncedPayloadToLocal(local, remote.payload);
  await writeConfig(next, { skipCloudSync: true });
  await writeCloudSyncMeta({
    ...currentMeta,
    enabled: true,
    status: 'synced',
    lastPullAt: Date.now(),
    bytesUsed: remote.bytesUsed,
    chunkCount: remote.meta.chunks,
    lastSyncedSha256: remoteCanonicalHash,
    error: undefined,
    pendingRemote: undefined,
    remoteUpdatedAt: undefined,
  });
}

export async function handleSyncStorageChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  area: string
): Promise<void> {
  if (area !== 'sync') return;
  const relevant = Object.keys(changes).some(
    (key) => key === SYNC_META_KEY || key.startsWith(SYNC_CHUNK_PREFIX)
  );
  if (!relevant) return;
  return enqueue(pullRemoteIfEnabledLocked);
}

export async function pullCloudSyncIfEnabled(): Promise<void> {
  return enqueue(pullRemoteIfEnabledLocked);
}
