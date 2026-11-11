import {
  API_BASE_URL,
  CDN_SNAPSHOT_URL,
  STORAGE_KEYS,
  type FilterConfig,
} from '@keepxclean/shared';
import { getActiveErrors, getErrors } from '../i18n/errors';
import { UI_KEYS, errorText, unconfirmedError } from '../services/model';
import {
  assert,
  normalizeServiceUrl,
  record,
  validateSnapshot,
} from '../services/validation';
import { enqueue, readConfig } from './repository';

export async function checkServicePermission(config: FilterConfig) {
  if (!config.customApiBaseUrl) return;
  const e = getErrors(config.locale);
  const origin =
    new URL(normalizeServiceUrl(config.customApiBaseUrl)).origin + '/*';
  assert(
    await chrome.permissions.contains({ origins: [origin] }),
    e.serviceAuthRequired
  );
}
export async function fetchJson(
  url: string,
  body?: unknown
): Promise<Record<string, unknown>> {
  const e = getActiveErrors();
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(e.serviceHttpStatus(response.status));
    return record(await response.json(), 'response');
  } catch (error) {
    if (controller.signal.aborted)
      throw unconfirmedError(e.requestTimeoutUnconfirmed);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export async function post(config: FilterConfig, path: string, body: unknown) {
  await checkServicePermission(config);
  return fetchJson(`${config.customApiBaseUrl || API_BASE_URL}${path}`, body);
}
let syncing: Promise<void> | undefined;
export function refreshSnapshot(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    const config = await readConfig();
    const e = getErrors(config.locale);
    const data = await chrome.storage.local.get(UI_KEYS.sync),
      previous = data[UI_KEYS.sync] ?? { source: 'builtin' };
    await chrome.storage.local.set({
      [UI_KEYS.sync]: {
        ...previous,
        status: 'syncing',
        lastAttempt: Date.now(),
        error: undefined,
      },
    });
    const urls = config.customApiBaseUrl
      ? [`${config.customApiBaseUrl}/v1/snapshot.json`]
      : [CDN_SNAPSHOT_URL, `${API_BASE_URL}/v1/snapshot.json`];
    let lastError = e.syncFailed;
    for (const url of urls) {
      try {
        await checkServicePermission(config);
        const snapshot = validateSnapshot(await fetchJson(url));
        await enqueue(async () => {
          const latest = await readConfig();
          assert(
            latest.customApiBaseUrl === config.customApiBaseUrl,
            getErrors(latest.locale).serviceUrlChanged
          );
          await chrome.storage.local.set({
            [STORAGE_KEYS.CROWD_SNAPSHOT]: snapshot,
            [UI_KEYS.sync]: {
              status: 'success',
              source: 'network',
              lastAttempt: Date.now(),
              lastSuccess: Date.now(),
              origin: new URL(url).origin,
            },
          });
        });
        return;
      } catch (error) {
        lastError = errorText(error);
      }
    }
    await chrome.storage.local.set({
      [UI_KEYS.sync]: {
        ...previous,
        status: 'error',
        lastAttempt: Date.now(),
        error: lastError,
      },
    });
    throw new Error(lastError);
  })().finally(() => {
    syncing = undefined;
  });
  return syncing;
}
