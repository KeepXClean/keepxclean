import {
  createDefaultConfig,
  isUILocaleSetting,
  mergeCloudKeywords,
  RESERVED_X_PATHS,
  TWEET_LANGUAGE_CODES,
  type AccountListEntry,
  type CrowdBlockSnapshot,
  type FilterConfig,
  type KeywordRuleItem,
  type LanguageFilterMode,
} from '@keepxclean/shared';
import type { ErrorMessages } from '../i18n/errors';

export type ValidationErrors = Pick<
  ErrorMessages,
  | 'enterAccountQuery'
  | 'invalidProfileUrl'
  | 'onlyXDomains'
  | 'unrecognizedHandleInUrl'
  | 'invalidHandleFormat'
  | 'expectObject'
  | 'invalidString'
  | 'invalidNumber'
  | 'expectBoolean'
  | 'invalidRegex'
  | 'selectAtLeastOneScope'
  | 'uidNumericOnly'
  | 'invalidReasonTag'
  | 'enterFullServiceUrl'
  | 'serviceHttpsOnly'
  | 'serviceCleanUrlOnly'
  | 'unsupportedConfigVersion'
  | 'invalidLocale'
  | 'invalidPreset'
  | 'invalidInterceptionMode'
  | 'invalidLanguageMode'
  | 'unsupportedLanguageCode'
  | 'duplicateKeywordId'
  | 'uidKeyMismatch'
  | 'disjointListsRequired'
  | 'unsupportedSnapshotVersion'
  | 'invalidSnapshotTime'
  | 'invalidSnapshotUid'
  | 'invalidSnapshotTag'
  | 'invalidCloudKeywords'
>;

export const SILENT_VALIDATION_ERRORS: ValidationErrors = {
  enterAccountQuery: 'Invalid account query',
  invalidProfileUrl: 'Invalid profile URL',
  onlyXDomains: 'Invalid X domain',
  unrecognizedHandleInUrl: 'Invalid handle in URL',
  invalidHandleFormat: 'Invalid handle',
  expectObject: (path) => `${path}: object expected`,
  invalidString: (path) => `${path}: invalid string`,
  invalidNumber: (path) => `${path}: invalid number`,
  expectBoolean: (path) => `${path}: boolean expected`,
  invalidRegex: 'Invalid regex',
  selectAtLeastOneScope: 'Invalid scopes',
  uidNumericOnly: 'Invalid UID',
  invalidReasonTag: 'Invalid tag',
  enterFullServiceUrl: 'Invalid service URL',
  serviceHttpsOnly: 'HTTPS required',
  serviceCleanUrlOnly: 'Clean URL required',
  unsupportedConfigVersion: 'Unsupported config version',
  invalidLocale: 'Invalid locale',
  invalidPreset: 'Invalid preset',
  invalidInterceptionMode: 'Invalid interception mode',
  invalidLanguageMode: 'Invalid language mode',
  unsupportedLanguageCode: 'Unsupported language code',
  duplicateKeywordId: 'Duplicate keyword ID',
  uidKeyMismatch: (key) => `${key}: UID mismatch`,
  disjointListsRequired: 'Disjoint lists required',
  unsupportedSnapshotVersion: 'Unsupported snapshot version',
  invalidSnapshotTime: 'Invalid snapshot time',
  invalidSnapshotUid: 'Invalid snapshot UID',
  invalidSnapshotTag: 'Invalid snapshot tag',
  invalidCloudKeywords: 'Invalid cloud keywords',
};

export const UID = /^\d{1,25}$/;
export const SCREEN_NAME = /^[a-zA-Z0-9_]{1,15}$/;

const scopes = ['text', 'bio', 'name', 'url'];
const tags = ['spam', 'nsfw', 'scam', 'ad', 'bot', 'other'];
const validLanguageCodes = new Set<string>(TWEET_LANGUAGE_CODES);

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function recordWithErrors(
  value: unknown,
  path: string,
  e: ValidationErrors
): Record<string, unknown> {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    e.expectObject(path)
  );
  return value as Record<string, unknown>;
}

function stringWithErrors(
  value: unknown,
  path: string,
  e: ValidationErrors,
  max = 1000,
  empty = true
): string {
  assert(
    typeof value === 'string' &&
      value.length <= max &&
      (empty || value.trim().length > 0),
    e.invalidString(path)
  );
  return value;
}

function numberWithErrors(
  value: unknown,
  path: string,
  e: ValidationErrors,
  min = 0,
  integer = false
): number {
  assert(
    typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= min &&
      (!integer || Number.isSafeInteger(value)),
    e.invalidNumber(path, min > 0, integer)
  );
  return value;
}

function boolWithErrors(
  value: unknown,
  path: string,
  e: ValidationErrors
): boolean {
  assert(typeof value === 'boolean', e.expectBoolean(path));
  return value;
}

export function parseAccountQueryWithErrors(
  raw: string,
  e: ValidationErrors
): { kind: 'uid'; uid: string } | { kind: 'handle'; handle: string } {
  const trimmed = raw.trim();
  assert(trimmed.length > 0, e.enterAccountQuery);
  if (UID.test(trimmed)) {
    return { kind: 'uid', uid: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error(e.invalidProfileUrl);
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    assert(
      host === 'x.com' ||
        host === 'twitter.com' ||
        host === 'mobile.x.com' ||
        host === 'mobile.twitter.com',
      e.onlyXDomains
    );
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'i' && parts[1] === 'user' && UID.test(parts[2] ?? '')) {
      return { kind: 'uid', uid: parts[2] };
    }
    const candidate = parts[0]?.replace(/^@/, '') ?? '';
    assert(
      SCREEN_NAME.test(candidate) &&
        !RESERVED_X_PATHS.has(candidate.toLowerCase()),
      e.unrecognizedHandleInUrl
    );
    return { kind: 'handle', handle: candidate };
  }
  const cleanHandle = trimmed.replace(/^@/, '');
  assert(SCREEN_NAME.test(cleanHandle), e.invalidHandleFormat);
  return { kind: 'handle', handle: cleanHandle };
}

export function validateKeywordWithErrors(
  input: unknown,
  e: ValidationErrors
): KeywordRuleItem {
  const x = recordWithErrors(input, 'keyword', e);
  const pattern = stringWithErrors(x.pattern, 'keyword.pattern', e, 2000, false);
  const isRegex = boolWithErrors(x.isRegex, 'keyword.isRegex', e);
  if (isRegex) {
    try {
      new RegExp(pattern, 'i');
    } catch {
      throw new Error(e.invalidRegex);
    }
  }
  assert(
    Array.isArray(x.scopes) &&
      x.scopes.length > 0 &&
      x.scopes.every((s) => scopes.includes(s)),
    e.selectAtLeastOneScope
  );
  if (x.onlyInReplies !== undefined) {
    boolWithErrors(x.onlyInReplies, 'keyword.onlyInReplies', e);
  }
  return {
    id: stringWithErrors(x.id, 'keyword.id', e, 200, false),
    pattern,
    isRegex,
    scopes: [...new Set(x.scopes)] as KeywordRuleItem['scopes'],
    enabled: boolWithErrors(x.enabled, 'keyword.enabled', e),
    ...(x.onlyInReplies === true ? { onlyInReplies: true } : {}),
    ...(x.note !== undefined
      ? { note: stringWithErrors(x.note, 'keyword.note', e, 2000) }
      : {}),
    ...(x.maxFollowersExempt !== undefined
      ? (() => {
          const val = numberWithErrors(
            x.maxFollowersExempt,
            'keyword.maxFollowersExempt',
            e,
            0,
            true
          );
          return val > 0 ? { maxFollowersExempt: val } : {};
        })()
      : {}),
  };
}

export function validateAccountWithErrors(
  input: unknown,
  e: ValidationErrors
): AccountListEntry {
  const x = recordWithErrors(input, 'account', e);
  assert(typeof x.uid === 'string' && UID.test(x.uid), e.uidNumericOnly);
  const out: AccountListEntry = {
    uid: x.uid,
    screenName: stringWithErrors(x.screenName ?? '', 'screenName', e, 100),
    addedAt: numberWithErrors(x.addedAt, 'addedAt', e),
  };
  for (const key of ['name', 'avatarUrl', 'reason'] as const)
    if (x[key] !== undefined) out[key] = stringWithErrors(x[key], key, e, 2000);
  if (x.tag !== undefined) {
    assert(tags.includes(String(x.tag)), e.invalidReasonTag);
    out.tag = x.tag as AccountListEntry['tag'];
  }
  if (out.avatarUrl && !/^https:\/\//.test(out.avatarUrl)) delete out.avatarUrl;
  return out;
}

export function normalizeServiceUrlWithErrors(
  input: string,
  e: ValidationErrors
): string {
  if (!input.trim()) return '';
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(e.enterFullServiceUrl);
  }
  assert(
    url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)),
    e.serviceHttpsOnly
  );
  assert(
    !url.username && !url.password && !url.search && !url.hash,
    e.serviceCleanUrlOnly
  );
  return url.href.replace(/\/+$/, '');
}

export function validateConfigWithErrors(
  input: unknown,
  e: ValidationErrors
): FilterConfig {
  const x = recordWithErrors(input, 'config', e);
  assert(x.version === 1, e.unsupportedConfigVersion);
  const defaults = createDefaultConfig();
  const out = structuredClone(defaults);
  if (x.locale !== undefined) {
    assert(isUILocaleSetting(x.locale), e.invalidLocale);
    out.locale = x.locale;
  }
  for (const key of [
    'enabled',
    'exemptFollowing',
    'profileSceneBadgeOnly',
    'syncNativeXBlock',
    'enableCrowdReport',
    'enableCloudKeywords',
  ] as const)
    if (x[key] !== undefined) out[key] = boolWithErrors(x[key], key, e);
  if (x.preset !== undefined) {
    assert(
      ['light', 'standard', 'strict', 'custom'].includes(String(x.preset)),
      e.invalidPreset
    );
    out.preset = x.preset as FilterConfig['preset'];
  }
  if (x.interceptionMode !== undefined) {
    assert(
      ['strip', 'collapse'].includes(String(x.interceptionMode)),
      e.invalidInterceptionMode
    );
    out.interceptionMode =
      x.interceptionMode as FilterConfig['interceptionMode'];
  }
  if (x.disabledCloudKeywordIds !== undefined) {
    assert(
      Array.isArray(x.disabledCloudKeywordIds),
      e.expectObject('disabledCloudKeywordIds')
    );
    out.disabledCloudKeywordIds = [
      ...new Set(
        x.disabledCloudKeywordIds.map((id) =>
          stringWithErrors(id, 'disabledCloudKeywordIds', e, 200, false).trim()
        )
      ),
    ];
  }
  if (x.customApiBaseUrl !== undefined)
    out.customApiBaseUrl = normalizeServiceUrlWithErrors(
      stringWithErrors(x.customApiBaseUrl, 'customApiBaseUrl', e, 2048),
      e
    );
  const rules = recordWithErrors(x.rules, 'rules', e);
  for (const key of Object.keys(
    defaults.rules
  ) as (keyof FilterConfig['rules'])[]) {
    if (rules[key] === undefined) continue;
    const rule = recordWithErrors(rules[key], `rules.${key}`, e);
    const target = out.rules[key] as unknown as Record<string, unknown>;
    for (const [field, defaultValue] of Object.entries(defaults.rules[key])) {
      if (
        field === 'items' ||
        field === 'mode' ||
        field === 'languages' ||
        rule[field] === undefined
      )
        continue;
      const value = rule[field];
      target[field] =
        typeof defaultValue === 'boolean'
          ? boolWithErrors(value, `${key}.${field}`, e)
          : numberWithErrors(
              value,
              `${key}.${field}`,
              e,
              field === 'slidingWindowHours'
                ? 0.1
                : field === 'minWeightedLength' || field === 'minBlockCount'
                  ? 1
                  : 0,
              ![
                'slidingWindowHours',
                'maxDailyTweets',
                'maxFollowRatio',
              ].includes(field)
            );
    }
  }
  if (rules.languageFilter !== undefined) {
    const lf = recordWithErrors(rules.languageFilter, 'rules.languageFilter', e);
    if (lf.mode !== undefined) {
      assert(
        lf.mode === 'allow' || lf.mode === 'block',
        e.invalidLanguageMode
      );
      out.rules.languageFilter.mode = lf.mode as LanguageFilterMode;
    }
    if (lf.languages !== undefined) {
      assert(Array.isArray(lf.languages), e.expectObject('languages'));
      const langs = [
        ...new Set(
          lf.languages.map((code) =>
            stringWithErrors(code, 'language', e, 16, false).toLowerCase().trim()
          )
        ),
      ];
      assert(
        langs.every((code) => validLanguageCodes.has(code)),
        e.unsupportedLanguageCode
      );
      out.rules.languageFilter.languages = langs;
    }
  }
  if (rules.keywords !== undefined) {
    const k = recordWithErrors(rules.keywords, 'rules.keywords', e);
    if (k.items !== undefined) {
      assert(Array.isArray(k.items), e.expectObject('keywords.items'));
      out.rules.keywords.items = k.items.map((item) =>
        validateKeywordWithErrors(item, e)
      );
    }
  }
  const ids = out.rules.keywords.items.map((k) => k.id);
  assert(new Set(ids).size === ids.length, e.duplicateKeywordId);
  for (const key of ['whitelistUids', 'localBlocklistUids'] as const) {
    out[key] = {};
    if (x[key] === undefined) continue;
    for (const [uid, entry] of Object.entries(recordWithErrors(x[key], key, e))) {
      const validated = validateAccountWithErrors(entry, e);
      assert(uid === validated.uid, e.uidKeyMismatch(key));
      out[key][uid] = validated;
    }
  }
  assert(
    !Object.keys(out.whitelistUids).some((uid) => out.localBlocklistUids[uid]),
    e.disjointListsRequired
  );
  return out;
}

export function validateSnapshotWithErrors(
  input: unknown,
  e: ValidationErrors
): CrowdBlockSnapshot {
  const x = recordWithErrors(input, 'snapshot', e);
  assert(x.version === 1, e.unsupportedSnapshotVersion);
  assert(
    typeof x.updatedAt === 'string' && Number.isFinite(Date.parse(x.updatedAt)),
    e.invalidSnapshotTime
  );
  const counts: CrowdBlockSnapshot['counts'] = {};
  for (const [uid, raw] of Object.entries(
    recordWithErrors(x.counts, 'snapshot.counts', e)
  )) {
    assert(UID.test(uid), e.invalidSnapshotUid);
    const entry = recordWithErrors(raw, 'snapshot.entry', e);
    counts[uid] = { c: numberWithErrors(entry.c, 'snapshot.c', e, 0, true) };
    if (entry.t !== undefined) {
      assert(tags.includes(String(entry.t)), e.invalidSnapshotTag);
      counts[uid].t = entry.t as AccountListEntry['tag'];
    }
    if (entry.p !== undefined)
      counts[uid].p = boolWithErrors(entry.p, 'snapshot.p', e);
  }
  assert(Array.isArray(x.cloudKeywords), e.invalidCloudKeywords);
  return {
    version: 1,
    updatedAt: x.updatedAt,
    domain: stringWithErrors(x.domain, 'snapshot.domain', e),
    totalAccounts: numberWithErrors(
      x.totalAccounts,
      'snapshot.totalAccounts',
      e,
      0,
      true
    ),
    totalReports: numberWithErrors(
      x.totalReports,
      'snapshot.totalReports',
      e,
      0,
      true
    ),
    counts,
    cloudKeywords: mergeCloudKeywords(
      x.cloudKeywords.map((item) => validateKeywordWithErrors(item, e)),
      true
    ),
  };
}

export function validateConfigSilent(input: unknown): FilterConfig {
  return validateConfigWithErrors(input, SILENT_VALIDATION_ERRORS);
}

export function validateSnapshotSilent(input: unknown): CrowdBlockSnapshot {
  return validateSnapshotWithErrors(input, SILENT_VALIDATION_ERRORS);
}
