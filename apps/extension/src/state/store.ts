import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '@keepxclean/shared';
import { command } from '../services/client';
import { UI_KEYS, localDate, type AppState } from '../services/model';
import { validateConfig, validateSnapshot } from '../services/validation';

interface Store {
  data?: AppState;
  loading: boolean;
  error?: string;
  pending: number;
  saveError?: string;
}
let current: Store = { loading: true, pending: 0 };
const listeners = new Set<() => void>();
let mounted = false;
let bufferedChanges: Record<string, chrome.storage.StorageChange> = {};
let readSequence = 0;
function emit(patch: Partial<Store>) {
  current = { ...current, ...patch };
  listeners.forEach((fn) => fn());
}
export async function reload() {
  const sequence = ++readSequence;
  emit({ loading: true, error: undefined });
  try {
    const data = await command<AppState>({ type: 'state.get' });
    if (sequence !== readSequence) return;
    emit({ data, loading: false });
    const pending = bufferedChanges;
    bufferedChanges = {};
    if (Object.keys(pending).length) onStorage(pending, 'local');
  } catch (error) {
    if (sequence === readSequence)
      emit({ loading: false, error: (error as Error).message });
  }
}
function onStorage(
  changes: Record<string, chrome.storage.StorageChange>,
  area: string
) {
  if (area !== 'local') return;
  if (current.loading) bufferedChanges = { ...bufferedChanges, ...changes };
  if (!current.data) return;
  const relevant = [
    STORAGE_KEYS.CONFIG,
    STORAGE_KEYS.CROWD_SNAPSHOT,
    STORAGE_KEYS.INTERCEPTION_LOGS,
    UI_KEYS.stats,
    UI_KEYS.sync,
    UI_KEYS.operations,
    UI_KEYS.imports,
  ];
  if (!relevant.some((key) => key in changes)) return;
  const data = { ...current.data };
  try {
    if (changes[STORAGE_KEYS.CONFIG])
      data.config = validateConfig(changes[STORAGE_KEYS.CONFIG].newValue);
    if (changes[STORAGE_KEYS.CROWD_SNAPSHOT])
      data.snapshot = validateSnapshot(
        changes[STORAGE_KEYS.CROWD_SNAPSHOT].newValue
      );
    if (changes[STORAGE_KEYS.INTERCEPTION_LOGS])
      data.logs = changes[STORAGE_KEYS.INTERCEPTION_LOGS].newValue ?? [];
    if (changes[UI_KEYS.stats]) data.stats = changes[UI_KEYS.stats].newValue;
    if (changes[UI_KEYS.sync]) data.sync = changes[UI_KEYS.sync].newValue;
    if (changes[UI_KEYS.operations])
      data.operations = changes[UI_KEYS.operations].newValue;
    if (changes[UI_KEYS.imports])
      data.imports = changes[UI_KEYS.imports].newValue;
    emit({ data, error: undefined });
  } catch (error) {
    emit({ error: (error as Error).message });
  }
}
export function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!mounted) {
    mounted = true;
    chrome.storage.onChanged.addListener(onStorage);
    void reload();
    dayTimer = setInterval(() => {
      if (current.data && current.data.stats.todayDate !== localDate())
        emit({
          data: {
            ...current.data,
            stats: {
              ...current.data.stats,
              todayDate: localDate(),
              todayBlocked: 0,
              partialDay: undefined,
            },
          },
        });
    }, 30000);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      mounted = false;
      chrome.storage.onChanged.removeListener(onStorage);
      clearInterval(dayTimer);
    }
  };
}
let dayTimer: ReturnType<typeof setInterval>;
export function getState() {
  return current;
}
export function useApp() {
  return useSyncExternalStore(subscribe, getState);
}
export async function mutate<T = void>(
  action: Parameters<typeof command>[0]
): Promise<T> {
  emit({ pending: current.pending + 1, saveError: undefined });
  try {
    return await command<T>(action);
  } catch (error) {
    emit({ saveError: (error as Error).message });
    throw error;
  } finally {
    emit({ pending: Math.max(0, current.pending - 1) });
  }
}
