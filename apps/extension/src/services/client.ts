import type {
  CloudKeywordLangGroup,
  DomainRuleItem,
  MatchedTarget,
  RulePackPayload,
} from '@keepxclean/shared';
import { getActiveErrors } from '../i18n/errors';
import type {
  CloudSyncMeta,
  CloudSyncStrategy,
  Command,
  ParseHealthReport,
  ParseHealthState,
  Result,
} from './model';
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
      throw new Error(e.contextInvalidated, { cause: error });
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
export function openOptions(page = 'rules', query?: Record<string, string>) {
  return command({
    type: 'options.open',
    page,
    ...(query ? { query } : {}),
  });
}
export function reloadXTabs() {
  return command<{ reloaded: number }>({ type: 'tabs.reloadX' });
}
export function saveDomain(item: DomainRuleItem, expected?: string) {
  return command({
    type: 'domain.save',
    item,
    ...(expected !== undefined ? { expected } : {}),
  });
}
export function deleteDomain(id: string, expected: string) {
  return command({ type: 'domain.delete', id, expected });
}
export function toggleCloudLangGroup(
  group: CloudKeywordLangGroup,
  enabled: boolean
) {
  return command({ type: 'cloudLangGroup.toggle', group, enabled });
}
export function disableMatchedTarget(target: MatchedTarget) {
  return command({ type: 'target.disable', target });
}
export function installRulePack(pack: RulePackPayload | string | unknown) {
  return command({ type: 'pack.install', pack });
}
export function toggleRulePack(id: string, enabled: boolean) {
  return command({ type: 'pack.toggle', id, enabled });
}
export function uninstallRulePack(id: string) {
  return command({ type: 'pack.uninstall', id });
}
export function enableCloudSync() {
  return command<CloudSyncMeta>({ type: 'cloudSync.enable' });
}
export function resolveCloudSync(strategy: CloudSyncStrategy) {
  return command<CloudSyncMeta>({ type: 'cloudSync.resolve', strategy });
}
export function disableCloudSync() {
  return command<CloudSyncMeta>({ type: 'cloudSync.disable' });
}
export function pushCloudSyncNow() {
  return command<CloudSyncMeta>({ type: 'cloudSync.pushNow' });
}
export function updateParseHealth(report: ParseHealthReport) {
  return command<ParseHealthState>({ type: 'health.update', report });
}
export function dismissParseHealth() {
  return command<ParseHealthState>({ type: 'health.dismiss' });
}
