import {
  API_BASE_URL,
  CDN_SNAPSHOT_URL,
  STORAGE_KEYS,
  type FilterConfig,
} from '@keepxclean/shared';
import { UI_KEYS, errorText } from '../services/model';
import {
  assert,
  normalizeServiceUrl,
  record,
  validateSnapshot,
} from '../services/validation';
import { enqueue, readConfig } from './repository';

export async function checkServicePermission(config: FilterConfig) {
  if (!config.customApiBaseUrl) return;
  const origin =
    new URL(normalizeServiceUrl(config.customApiBaseUrl)).origin + '/*';
  assert(
    await chrome.permissions.contains({ origins: [origin] }),
    '请先授权此服务地址的访问权限'
  );
}
export async function fetchJson(
  url: string,
  body?: unknown
): Promise<Record<string, unknown>> {
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
    if (!response.ok) throw new Error(`服务返回 HTTP ${response.status}`);
    return record(await response.json(), '服务响应');
  } catch (error) {
    if (controller.signal.aborted) throw new Error('请求超时，结果未确认');
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
      ? [`${config.customApiBaseUrl}/v1/snapshot.json?fresh=1`]
      : [
          `${CDN_SNAPSHOT_URL}?fresh=1`,
          `${API_BASE_URL}/v1/snapshot.json?fresh=1`,
        ];
    let lastError = '同步失败';
    for (const url of urls) {
      try {
        await checkServicePermission(config);
        const snapshot = validateSnapshot(await fetchJson(url));
        await enqueue(async () => {
          const latest = await readConfig();
          assert(
            latest.customApiBaseUrl === config.customApiBaseUrl,
            '服务地址已变化，请重新同步'
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
