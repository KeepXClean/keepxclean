import { vi } from 'vitest';

export interface MockTab {
  id: number;
  active?: boolean;
  url?: string;
  windowId?: number;
  title?: string;
}

export interface MockChromeOptions {
  syncQuotaBytes?: number;
  syncQuotaBytesPerItem?: number;
  syncMaxItems?: number;
  tabs?: MockTab[];
}

const textEncoder = new TextEncoder();

function utf8Len(str: string): number {
  return textEncoder.encode(str).byteLength;
}

function entryBytes(key: string, value: unknown): number {
  return utf8Len(key) + utf8Len(JSON.stringify(value));
}

function matchUrlPattern(url: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\\\./g, '(?:[^/]+\\.)?')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(url);
}

function readAreaKeys(
  store: Record<string, unknown>,
  keys?: string | string[] | Record<string, unknown> | null
): Record<string, unknown> {
  if (keys === null || keys === undefined) {
    return Object.fromEntries(
      Object.entries(store).map(([k, v]) => [k, structuredClone(v)])
    );
  }
  if (typeof keys === 'string') {
    return keys in store ? { [keys]: structuredClone(store[keys]) } : {};
  }
  if (Array.isArray(keys)) {
    return Object.fromEntries(
      keys
        .filter((k) => k in store)
        .map((k) => [k, structuredClone(store[k])])
    );
  }
  const out: Record<string, unknown> = {};
  for (const [k, fallback] of Object.entries(keys)) {
    out[k] = k in store ? structuredClone(store[k]) : structuredClone(fallback);
  }
  return out;
}

export function mockChrome(
  initial: Record<string, unknown> = {},
  initialSync: Record<string, unknown> = {},
  options: MockChromeOptions = {}
) {
  const values = structuredClone(initial);
  const syncValues = structuredClone(initialSync);
  const syncQuotaBytes = options.syncQuotaBytes ?? 102_400;
  const syncQuotaBytesPerItem = options.syncQuotaBytesPerItem ?? 8192;
  const syncMaxItems = options.syncMaxItems ?? 512;
  const tabsList: MockTab[] = options.tabs
    ? structuredClone(options.tabs)
    : [{ id: 7, active: true, url: 'https://x.com/home', windowId: 1 }];
  let nextTabId =
    tabsList.reduce((max, t) => Math.max(max, t.id), 10) + 1;

  const listeners = new Set<
    (
      changes: Record<string, { oldValue: unknown; newValue: unknown }>,
      area: string
    ) => void
  >();

  const emitStorageChanged = (
    changes: Record<string, { oldValue: unknown; newValue: unknown }>,
    area: 'local' | 'sync'
  ) => {
    if (Object.keys(changes).length === 0) return;
    listeners.forEach((fn) => fn(changes, area));
  };

  const localStorageArea = {
    get: vi.fn(
      async (keys?: string | string[] | Record<string, unknown> | null) =>
        readAreaKeys(values, keys)
    ),
    set: vi.fn(async (patch: Record<string, unknown>) => {
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> =
        {};
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        changes[key] = {
          oldValue: values[key],
          newValue: structuredClone(value),
        };
        values[key] = structuredClone(value);
      }
      emitStorageChanged(changes, 'local');
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const list = typeof keys === 'string' ? [keys] : keys;
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> =
        {};
      for (const key of list) {
        if (key in values) {
          changes[key] = { oldValue: values[key], newValue: undefined };
          delete values[key];
        }
      }
      emitStorageChanged(changes, 'local');
    }),
    clear: vi.fn(async () => {
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> =
        {};
      for (const key of Object.keys(values)) {
        changes[key] = { oldValue: values[key], newValue: undefined };
        delete values[key];
      }
      emitStorageChanged(changes, 'local');
    }),
  };

  const syncStorageArea = {
    QUOTA_BYTES: syncQuotaBytes,
    QUOTA_BYTES_PER_ITEM: syncQuotaBytesPerItem,
    MAX_ITEMS: syncMaxItems,
    get: vi.fn(
      async (keys?: string | string[] | Record<string, unknown> | null) =>
        readAreaKeys(syncValues, keys)
    ),
    set: vi.fn(async (patch: Record<string, unknown>) => {
      const candidate: Record<string, unknown> = { ...syncValues };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (entryBytes(key, value) > syncQuotaBytesPerItem) {
          throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
        }
        candidate[key] = structuredClone(value);
      }
      if (Object.keys(candidate).length > syncMaxItems) {
        throw new Error('MAX_ITEMS quota exceeded');
      }
      let totalBytes = 0;
      for (const [key, value] of Object.entries(candidate)) {
        totalBytes += entryBytes(key, value);
      }
      if (totalBytes > syncQuotaBytes) {
        throw new Error('QUOTA_BYTES quota exceeded');
      }
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> =
        {};
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        changes[key] = {
          oldValue: syncValues[key],
          newValue: structuredClone(value),
        };
        syncValues[key] = structuredClone(value);
      }
      emitStorageChanged(changes, 'sync');
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const list = typeof keys === 'string' ? [keys] : keys;
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> =
        {};
      for (const key of list) {
        if (key in syncValues) {
          changes[key] = { oldValue: syncValues[key], newValue: undefined };
          delete syncValues[key];
        }
      }
      emitStorageChanged(changes, 'sync');
    }),
    clear: vi.fn(async () => {
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> =
        {};
      for (const key of Object.keys(syncValues)) {
        changes[key] = { oldValue: syncValues[key], newValue: undefined };
        delete syncValues[key];
      }
      emitStorageChanged(changes, 'sync');
    }),
    getBytesInUse: vi.fn(async (keys?: string | string[] | null) => {
      const list =
        keys === null || keys === undefined
          ? Object.keys(syncValues)
          : typeof keys === 'string'
            ? [keys]
            : keys;
      let total = 0;
      for (const key of list) {
        if (key in syncValues) {
          total += entryBytes(key, syncValues[key]);
        }
      }
      return total;
    }),
  };

  const api = {
    storage: {
      local: localStorageArea,
      sync: syncStorageArea,
      onChanged: {
        addListener: (
          fn: (
            changes: Record<string, { oldValue: unknown; newValue: unknown }>,
            area: string
          ) => void
        ) => listeners.add(fn),
        removeListener: (
          fn: (
            changes: Record<string, { oldValue: unknown; newValue: unknown }>,
            area: string
          ) => void
        ) => listeners.delete(fn),
      },
    },
    runtime: {
      id: 'test-extension',
      getURL: (path: string) => `chrome-extension://test/${path}`,
      getManifest: vi.fn(() => ({ version: '0.2.0' })),
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: {
      query: vi.fn(async (query?: { url?: string | string[] }) => {
        if (!query?.url) {
          return tabsList.map((t) => ({ ...t }));
        }
        const patterns = Array.isArray(query.url) ? query.url : [query.url];
        return tabsList
          .filter(
            (t) =>
              typeof t.url === 'string' &&
              patterns.some((p) => matchUrlPattern(t.url!, p))
          )
          .map((t) => ({ ...t }));
      }),
      create: vi.fn(async (props: { url?: string; active?: boolean }) => {
        const created: MockTab = {
          id: nextTabId++,
          active: props.active ?? true,
          url: props.url,
          windowId: 1,
        };
        tabsList.push(created);
        return { ...created };
      }),
      update: vi.fn(
        async (tabId: number, props: { url?: string; active?: boolean }) => {
          const found = tabsList.find((t) => t.id === tabId);
          if (found) {
            if (props.url !== undefined) found.url = props.url;
            if (props.active !== undefined) found.active = props.active;
            return { ...found };
          }
          return { id: tabId, ...props };
        }
      ),
      reload: vi.fn(async () => {}),
      sendMessage: vi.fn(async (_tab: unknown, _message: unknown) => ({
        ok: true,
        viewerUid: '123',
      })),
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    windows: {
      update: vi.fn(async (windowId: number, info: Record<string, unknown>) => ({
        id: windowId,
        ...info,
      })),
    },
    alarms: {
      create: vi.fn(async () => {}),
      clear: vi.fn(async () => true),
      get: vi.fn(async () => undefined),
      onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
    },
    permissions: { contains: vi.fn(async () => true) },
  };
  vi.stubGlobal('chrome', api);
  return { values, syncValues, tabs: tabsList, emitStorageChanged, api };
}
