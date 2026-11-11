import { vi } from 'vitest';
export function mockChrome(initial: Record<string, unknown> = {}) {
  const values = structuredClone(initial);
  const listeners = new Set<
    (
      changes: Record<string, { oldValue: unknown; newValue: unknown }>,
      area: string
    ) => void
  >();
  const storage = {
    get: vi.fn(async (keys: string | string[] | null) =>
      Object.fromEntries(
        (keys === null
          ? Object.keys(values)
          : typeof keys === 'string'
            ? [keys]
            : keys
        )
          .filter((k) => k in values)
          .map((k) => [k, structuredClone(values[k])])
      )
    ),
    set: vi.fn(async (patch: Record<string, unknown>) => {
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> =
        {};
      for (const [key, value] of Object.entries(patch)) {
        changes[key] = {
          oldValue: values[key],
          newValue: structuredClone(value),
        };
        values[key] = structuredClone(value);
      }
      listeners.forEach((fn) => fn(changes, 'local'));
    }),
  };
  const api = {
    storage: {
      local: storage,
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
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabs: {
      query: vi.fn(async () => [{ id: 7, active: true, url: 'https://x.com/home' }]),
      reload: vi.fn(async () => {}),
      sendMessage: vi.fn(async (_tab: unknown, _message: unknown) => ({
        ok: true,
        viewerUid: '123',
      })),
    },
    alarms: { create: vi.fn(async () => {}), clear: vi.fn(async () => true) },
    permissions: { contains: vi.fn(async () => true) },
  };
  vi.stubGlobal('chrome', api);
  return { values, api };
}
