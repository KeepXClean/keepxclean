import { getActiveErrors } from '../i18n/errors';
import type { Command, Result } from './model';
import { normalizeServiceUrl } from './validation';

export function isExtensionContextValid(): boolean {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome.runtime?.id);
  } catch {
    return false;
  }
}

const cachedBaseUrl = (() => {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      return chrome.runtime.getURL('');
    }
  } catch {
    // Ignore outside extension context
  }
  return '/';
})();

export function runtimeUrl(path: string): string {
  const clean = path.replace(/^\/+/, '');
  try {
    if (isExtensionContextValid()) {
      return chrome.runtime.getURL(clean);
    }
  } catch {
    // Fallback to cached extension origin when context invalidates mid-render
  }
  return `${cachedBaseUrl.replace(/\/?$/, '/')}${clean}`;
}

export async function command<T = void>(action: Command): Promise<T> {
  const e = getActiveErrors();
  if (!isExtensionContextValid()) {
    throw new Error(e.contextInvalidated);
  }
  let result: Result<T> | undefined;
  try {
    result = (await chrome.runtime.sendMessage({
      type: 'KXC_COMMAND',
      action,
    })) as Result<T>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !isExtensionContextValid() ||
      /Extension context invalidated/i.test(message)
    ) {
      throw new Error(e.contextInvalidated);
    }
    throw error;
  }
  if (!result || !result.ok)
    throw new Error(
      result && !result.ok ? result.error : e.disconnected
    );
  return result.data;
}
export async function authorizeService(input: string) {
  const e = getActiveErrors();
  const normalized = normalizeServiceUrl(input);
  if (normalized) {
    const origins = [new URL(normalized).origin + '/*'];
    if (!(await chrome.permissions.request({ origins })))
      throw new Error(e.permissionDenied);
  }
  return normalized;
}
export function openOptions(page = 'rules') {
  return command({ type: 'options.open', page });
}
export function reloadXTabs() {
  return command<{ reloaded: number }>({ type: 'tabs.reloadX' });
}
