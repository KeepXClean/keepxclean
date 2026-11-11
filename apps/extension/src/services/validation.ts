import {
  isUILocaleSetting,
  type AccountListEntry,
  type CrowdBlockSnapshot,
  type FilterConfig,
  type KeywordRuleItem,
} from '@keepxclean/shared';
import { getActiveErrors, getErrors } from '../i18n/errors';
import {
  assert,
  normalizeServiceUrlWithErrors,
  parseAccountQueryWithErrors,
  recordWithErrors,
  SCREEN_NAME,
  UID,
  validateAccountWithErrors,
  validateConfigWithErrors,
  validateKeywordWithErrors,
  validateSnapshotWithErrors,
} from './schema';

export { assert, SCREEN_NAME, UID };

export function record(value: unknown, path: string): Record<string, unknown> {
  return recordWithErrors(value, path, getActiveErrors());
}

export function parseAccountQuery(
  raw: string
): { kind: 'uid'; uid: string } | { kind: 'handle'; handle: string } {
  return parseAccountQueryWithErrors(raw, getActiveErrors());
}

export function validateKeyword(input: unknown): KeywordRuleItem {
  return validateKeywordWithErrors(input, getActiveErrors());
}

export function validateAccount(input: unknown): AccountListEntry {
  return validateAccountWithErrors(input, getActiveErrors());
}

export function normalizeServiceUrl(input: string): string {
  return normalizeServiceUrlWithErrors(input, getActiveErrors());
}

export function validateConfig(input: unknown): FilterConfig {
  const active = getActiveErrors();
  const x = recordWithErrors(input, 'config', active);
  const candidateLocale = isUILocaleSetting(x.locale) ? x.locale : undefined;
  const e = candidateLocale ? getErrors(candidateLocale) : active;
  return validateConfigWithErrors(x, e);
}

export function validateSnapshot(input: unknown): CrowdBlockSnapshot {
  return validateSnapshotWithErrors(input, getActiveErrors());
}
