import {
  createDefaultConfig,
  isCloudKeywordLangGroup,
  isUILocaleSetting,
  isUIThemeSetting,
  isValidDomainRule,
  mergeCloudKeywords,
  normalizeDomainRule,
  RESERVED_X_PATHS,
  TWEET_LANGUAGE_CODES,
  validateRulePack,
  type AccountListEntry,
  type CloudKeywordLangGroup,
  type CrowdBlockSnapshot,
  type DomainRuleItem,
  type FilterConfig,
  type InstalledRulePack,
  type KeywordRuleItem,
  type LanguageFilterMode,
  type SceneModeKey,
  type SceneModeOverride,
} from '@keepxclean/shared';
import type { ErrorMessages } from '../i18n/errors';

export const PROTO_POLLUTION_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

export const SCENE_MODE_KEYS: readonly SceneModeKey[] = [
  'for_you',
  'following',
  'reply',
  'search',
];

export const SCENE_MODE_OVERRIDES: readonly SceneModeOverride[] = [
  'inherit',
  'collapse',
  'strip',
  'bypass',
];

const SCENE_MODE_KEY_SET = new Set<string>(SCENE_MODE_KEYS);
const SCENE_MODE_OVERRIDE_SET = new Set<string>(SCENE_MODE_OVERRIDES);

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

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
  | 'invalidTheme'
  | 'invalidPreset'
  | 'invalidInterceptionMode'
  | 'invalidLanguageMode'
  | 'unsupportedLanguageCode'
  | 'duplicateKeywordId'
  | 'invalidDomain'
  | 'duplicateDomainId'
  | 'invalidCloudLangGroup'
  | 'invalidSceneMode'
  | 'invalidRulePack'
  | 'duplicatePackId'
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
  invalidTheme: 'Invalid theme',
  invalidPreset: 'Invalid preset',
  invalidInterceptionMode: 'Invalid interception mode',
  invalidLanguageMode: 'Invalid language mode',
  unsupportedLanguageCode: 'Unsupported language code',
  duplicateKeywordId: 'Duplicate keyword ID',
  invalidDomain: 'Invalid domain',
  duplicateDomainId: 'Duplicate domain ID',
  invalidCloudLangGroup: 'Invalid cloud keyword language group',
  invalidSceneMode: 'Invalid scene mode',
  invalidRulePack: (detail) => `Invalid rule pack: ${detail}`,
  duplicatePackId: 'Duplicate rule pack ID',
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
  const proto = Object.getPrototypeOf(value);
  assert(proto === Object.prototype || proto === null, e.expectObject(path));
  assert(
    Object.getOwnPropertySymbols(value).length === 0,
    e.expectObject(path)
  );
  assert(
    Object.prototype.toString.call(value) === '[object Object]',
    e.expectObject(path)
  );
  const obj = value as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(obj)) {
    assert(!PROTO_POLLUTION_KEYS.has(key), e.expectObject(path));
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    assert(
      desc !== undefined &&
        'value' in desc &&
        typeof desc.get !== 'function' &&
        typeof desc.set !== 'function',
      e.expectObject(path)
    );
  }
  return obj;
}

function assertDenseArrayWithErrors(
  value: unknown,
  path: string,
  e: ValidationErrors,
  errorMessage = e.expectObject(path)
): unknown[] {
  assert(
    Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype,
    errorMessage
  );
  assert(Object.getOwnPropertySymbols(value).length === 0, errorMessage);
  for (let i = 0; i < value.length; i++) {
    const desc = Object.getOwnPropertyDescriptor(value, i);
    assert(
      desc !== undefined &&
        'value' in desc &&
        typeof desc.get !== 'function' &&
        typeof desc.set !== 'function',
      errorMessage
    );
  }
  assert(
    Object.getOwnPropertyNames(value).length === value.length + 1,
    errorMessage
  );
  return value;
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
  assert(typeof raw === 'string', e.enterAccountQuery);
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
  const rawScopes = assertDenseArrayWithErrors(
    x.scopes,
    'keyword.scopes',
    e,
    e.selectAtLeastOneScope
  );
  assert(rawScopes.length > 0, e.selectAtLeastOneScope);
  const seenScopes = new Set<KeywordRuleItem['scopes'][number]>();
  const cleanScopes: KeywordRuleItem['scopes'] = [];
  for (let i = 0; i < rawScopes.length; i++) {
    const s = rawScopes[i];
    assert(
      typeof s === 'string' && scopes.includes(s),
      e.selectAtLeastOneScope
    );
    const typed = s as KeywordRuleItem['scopes'][number];
    if (!seenScopes.has(typed)) {
      seenScopes.add(typed);
      cleanScopes.push(typed);
    }
  }
  if (x.onlyInReplies !== undefined) {
    boolWithErrors(x.onlyInReplies, 'keyword.onlyInReplies', e);
  }
  let langGroup: CloudKeywordLangGroup | undefined;
  if (x.langGroup !== undefined) {
    assert(isCloudKeywordLangGroup(x.langGroup), e.invalidCloudLangGroup);
    langGroup = x.langGroup;
  }
  let packCategory: string | undefined;
  if (x.packCategory !== undefined) {
    const cat = stringWithErrors(
      x.packCategory,
      'keyword.packCategory',
      e,
      64,
      true
    ).trim();
    if (cat) packCategory = cat;
  }
  return {
    id: stringWithErrors(x.id, 'keyword.id', e, 200, false),
    pattern,
    isRegex,
    scopes: cleanScopes,
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
    ...(langGroup !== undefined ? { langGroup } : {}),
    ...(packCategory !== undefined ? { packCategory } : {}),
  };
}

export function validateDomainRuleWithErrors(
  input: unknown,
  e: ValidationErrors
): DomainRuleItem {
  const x = recordWithErrors(input, 'domain', e);
  const id = stringWithErrors(x.id, 'domain.id', e, 200, false).trim();
  const rawDomain = stringWithErrors(x.domain, 'domain.domain', e, 2048, false);
  const domain = normalizeDomainRule(rawDomain);
  assert(isValidDomainRule(domain), e.invalidDomain);
  if (x.onlyInReplies !== undefined) {
    boolWithErrors(x.onlyInReplies, 'domain.onlyInReplies', e);
  }
  return {
    id,
    domain,
    enabled: boolWithErrors(x.enabled, 'domain.enabled', e),
    ...(x.onlyInReplies === true ? { onlyInReplies: true } : {}),
    ...(x.note !== undefined
      ? { note: stringWithErrors(x.note, 'domain.note', e, 2000) }
      : {}),
    ...(x.maxFollowersExempt !== undefined
      ? (() => {
          const val = numberWithErrors(
            x.maxFollowersExempt,
            'domain.maxFollowersExempt',
            e,
            0,
            true
          );
          return val > 0 ? { maxFollowersExempt: val } : {};
        })()
      : {}),
  };
}

export function validateInstalledPackWithErrors(
  input: unknown,
  e: ValidationErrors
): InstalledRulePack {
  const x = recordWithErrors(input, 'installedPack', e);
  assert(
    Object.getOwnPropertySymbols(x).length === 0,
    e.invalidRulePack('invalid symbols')
  );
  // Strip ONLY local install metadata so any forbidden config keys (e.g. whitelistUids, customApiBaseUrl)
  // are preserved in `candidate` and rejected by `validateRulePack`.
  const candidate: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(x)) {
    const desc = Object.getOwnPropertyDescriptor(x, key);
    if (
      !desc ||
      typeof desc.get === 'function' ||
      typeof desc.set === 'function'
    ) {
      throw new Error(e.invalidRulePack(`invalid property "${key}"`));
    }
    if (
      key === 'enabled' ||
      key === 'installedAt' ||
      key === 'disabledItemIds'
    ) {
      continue;
    }
    candidate[key] = desc.value;
  }
  let payload;
  try {
    payload = validateRulePack(candidate);
  } catch (err) {
    throw new Error(
      e.invalidRulePack(err instanceof Error ? err.message : String(err)),
      { cause: err }
    );
  }
  const enabled = boolWithErrors(
    hasOwn(x, 'enabled') ? x.enabled : undefined,
    'installedPack.enabled',
    e
  );
  const installedAt = numberWithErrors(
    hasOwn(x, 'installedAt') ? x.installedAt : undefined,
    'installedPack.installedAt',
    e,
    0,
    false
  );
  let disabledItemIds: string[] | undefined;
  if (hasOwn(x, 'disabledItemIds') && x.disabledItemIds !== undefined) {
    const rawDisabled = assertDenseArrayWithErrors(
      x.disabledItemIds,
      'installedPack.disabledItemIds',
      e
    );
    const seenDisabled = new Set<string>();
    const normalizedDisabled: string[] = [];
    for (let i = 0; i < rawDisabled.length; i++) {
      const cleanId = stringWithErrors(
        rawDisabled[i],
        'installedPack.disabledItemIds',
        e,
        200,
        false
      ).trim();
      if (!seenDisabled.has(cleanId)) {
        seenDisabled.add(cleanId);
        normalizedDisabled.push(cleanId);
      }
    }
    disabledItemIds = normalizedDisabled;
  }
  return {
    ...payload,
    enabled,
    installedAt,
    ...(disabledItemIds !== undefined ? { disabledItemIds } : {}),
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
    assert(
      typeof x.tag === 'string' && tags.includes(x.tag),
      e.invalidReasonTag
    );
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
  let preset: FilterConfig['preset'] = 'standard';
  if (x.preset !== undefined) {
    assert(
      typeof x.preset === 'string' &&
        ['light', 'standard', 'strict', 'custom'].includes(x.preset),
      e.invalidPreset
    );
    preset = x.preset as FilterConfig['preset'];
  }
  const presetForDefaults =
    preset === 'light' || preset === 'standard' || preset === 'strict'
      ? preset
      : 'standard';
  const defaults = createDefaultConfig(presetForDefaults);
  const out = structuredClone(defaults);
  out.preset = preset;
  if (x.locale !== undefined) {
    assert(isUILocaleSetting(x.locale), e.invalidLocale);
    out.locale = x.locale;
  }
  if (x.theme !== undefined) {
    assert(isUIThemeSetting(x.theme), e.invalidTheme);
    out.theme = x.theme;
  }
  for (const key of [
    'enabled',
    'exemptFollowing',
    'profileSceneBadgeOnly',
    'syncNativeXBlock',
    'enableCrowdReport',
    'enableCloudKeywords',
    'onboardingDismissed',
  ] as const)
    if (x[key] !== undefined) out[key] = boolWithErrors(x[key], key, e);
  if (x.interceptionMode !== undefined) {
    assert(
      typeof x.interceptionMode === 'string' &&
        ['strip', 'collapse'].includes(x.interceptionMode),
      e.invalidInterceptionMode
    );
    out.interceptionMode =
      x.interceptionMode as FilterConfig['interceptionMode'];
  }
  if (x.sceneModes !== undefined) {
    const rawModes = recordWithErrors(x.sceneModes, 'sceneModes', e);
    const mergedModes: Record<SceneModeKey, SceneModeOverride> = {
      for_you: 'inherit',
      following: 'inherit',
      reply: 'inherit',
      search: 'inherit',
    };
    for (const sceneKey of Object.keys(rawModes)) {
      assert(SCENE_MODE_KEY_SET.has(sceneKey), e.invalidSceneMode);
      const val = rawModes[sceneKey];
      if (val === undefined) continue;
      assert(
        typeof val === 'string' && SCENE_MODE_OVERRIDE_SET.has(val),
        e.invalidSceneMode
      );
      mergedModes[sceneKey as SceneModeKey] = val as SceneModeOverride;
    }
    out.sceneModes = mergedModes;
  }
  if (x.enabledCloudLangGroups !== undefined) {
    const rawLangGroups = assertDenseArrayWithErrors(
      x.enabledCloudLangGroups,
      'enabledCloudLangGroups',
      e
    );
    const groups: CloudKeywordLangGroup[] = [];
    const seen = new Set<CloudKeywordLangGroup>();
    for (let i = 0; i < rawLangGroups.length; i++) {
      const rawGroup = rawLangGroups[i];
      assert(isCloudKeywordLangGroup(rawGroup), e.invalidCloudLangGroup);
      if (!seen.has(rawGroup)) {
        seen.add(rawGroup);
        groups.push(rawGroup);
      }
    }
    out.enabledCloudLangGroups = groups;
  }
  if (x.disabledCloudKeywordIds !== undefined) {
    const rawDisabledCloud = assertDenseArrayWithErrors(
      x.disabledCloudKeywordIds,
      'disabledCloudKeywordIds',
      e
    );
    out.disabledCloudKeywordIds = [
      ...new Set(
        rawDisabledCloud.map((id) =>
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
    if (!hasOwn(rules, key) || rules[key] === undefined) continue;
    const rule = recordWithErrors(rules[key], `rules.${key}`, e);
    const target = out.rules[key] as unknown as Record<string, unknown>;
    for (const [field, defaultValue] of Object.entries(defaults.rules[key])) {
      if (
        field === 'items' ||
        field === 'mode' ||
        field === 'languages' ||
        !hasOwn(rule, field) ||
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
                : field === 'minWeightedLength' ||
                    field === 'minBlockCount' ||
                    field === 'maxMentionWeightedLength'
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
  if (hasOwn(rules, 'languageFilter') && rules.languageFilter !== undefined) {
    const lf = recordWithErrors(rules.languageFilter, 'rules.languageFilter', e);
    if (lf.mode !== undefined) {
      assert(
        lf.mode === 'allow' || lf.mode === 'block',
        e.invalidLanguageMode
      );
      out.rules.languageFilter.mode = lf.mode as LanguageFilterMode;
    }
    if (lf.languages !== undefined) {
      const rawLangs = assertDenseArrayWithErrors(
        lf.languages,
        'languages',
        e
      );
      const langs = [
        ...new Set(
          rawLangs.map((code) =>
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
  if (hasOwn(rules, 'keywords') && rules.keywords !== undefined) {
    const k = recordWithErrors(rules.keywords, 'rules.keywords', e);
    if (k.items !== undefined) {
      const rawKeywordItems = assertDenseArrayWithErrors(
        k.items,
        'keywords.items',
        e
      );
      out.rules.keywords.items = rawKeywordItems.map((item) =>
        validateKeywordWithErrors(item, e)
      );
    }
  }
  const ids = out.rules.keywords.items.map((k) => k.id);
  assert(new Set(ids).size === ids.length, e.duplicateKeywordId);

  if (hasOwn(rules, 'domainFilter') && rules.domainFilter !== undefined) {
    const df = recordWithErrors(rules.domainFilter, 'rules.domainFilter', e);
    if (df.items !== undefined) {
      const rawDomainItems = assertDenseArrayWithErrors(
        df.items,
        'domainFilter.items',
        e
      );
      out.rules.domainFilter.items = rawDomainItems.map((item) =>
        validateDomainRuleWithErrors(item, e)
      );
    }
  }
  const domainIds = out.rules.domainFilter.items.map((d) => d.id);
  assert(new Set(domainIds).size === domainIds.length, e.duplicateDomainId);

  if (x.installedPacks !== undefined) {
    const rawPacks = assertDenseArrayWithErrors(
      x.installedPacks,
      'installedPacks',
      e
    );
    out.installedPacks = rawPacks.map((pack) =>
      validateInstalledPackWithErrors(pack, e)
    );
    const packIds = out.installedPacks.map((p) => p.id);
    assert(new Set(packIds).size === packIds.length, e.duplicatePackId);
  }

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
    !Object.keys(out.whitelistUids).some((uid) =>
      hasOwn(out.localBlocklistUids, uid)
    ),
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
      assert(
        typeof entry.t === 'string' && tags.includes(entry.t),
        e.invalidSnapshotTag
      );
      counts[uid].t = entry.t as AccountListEntry['tag'];
    }
    if (entry.p !== undefined)
      counts[uid].p = boolWithErrors(entry.p, 'snapshot.p', e);
  }
  const rawCloudKeywords = assertDenseArrayWithErrors(
    x.cloudKeywords,
    'snapshot.cloudKeywords',
    e,
    e.invalidCloudKeywords
  );
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
      rawCloudKeywords.map((item) => validateKeywordWithErrors(item, e)),
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
