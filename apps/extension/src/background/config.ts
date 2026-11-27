import {
  applyPresetToConfig,
  createDefaultConfig,
  isCloudKeywordLangGroup,
  resolveEnabledCloudLangGroups,
  validateRulePack,
  type FilterConfig,
  type InstalledRulePack,
  type RulePackPayload,
  type SceneModeKey,
  type SceneModeOverride,
  type ViewerProfile,
} from '@keepxclean/shared';
import { getActiveErrors, getErrors } from '../i18n/errors';
import { setActiveLocaleSetting } from '../i18n/state';
import { digest, type Command } from '../services/model';
import { PROTO_POLLUTION_KEYS, SCENE_MODE_KEYS } from '../services/schema';
import {
  assert,
  record,
  validateAccount,
  validateConfig,
  validateDomainRule,
  validateKeyword,
} from '../services/validation';

const SCENE_MODE_KEY_SET = new Set<string>(SCENE_MODE_KEYS);

export const ALLOWED_OPTIONS_PAGES = new Set([
  'rules',
  'keywords',
  'accounts',
  'history',
  'preferences',
]);

export const ALLOWED_OPTIONS_QUERY_KEYS = new Set([
  'rule',
  'focus',
  'tab',
  'pack',
  'action',
]);

export const OPTIONS_QUERY_VALUE_RE = /^[a-zA-Z0-9_.:-]{1,200}$/;

function isPrototypeKey(value: string): boolean {
  return PROTO_POLLUTION_KEYS.has(value) || value in Object.prototype;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function packHasItemId(
  pack: Pick<RulePackPayload, 'keywords' | 'domains' | 'blockedUids'>,
  id: string
): boolean {
  return Boolean(
    pack.keywords?.some((k) => k.id === id) ||
      pack.domains?.some((d) => d.id === id) ||
      pack.blockedUids?.some((u) => u.uid === id)
  );
}

export function buildOptionsUrl(
  baseUrl: string,
  page?: string,
  query?: Record<string, string>
): string {
  const e = getActiveErrors();
  const targetPage = page === undefined || page === '' ? 'rules' : page;
  assert(
    typeof targetPage === 'string' && ALLOWED_OPTIONS_PAGES.has(targetPage),
    e.unknownConfigField
  );
  let queryString = '';
  if (query !== undefined) {
    const rawQuery = record(query, 'query');
    const params = new URLSearchParams();
    for (const key of Object.keys(rawQuery)) {
      assert(ALLOWED_OPTIONS_QUERY_KEYS.has(key), e.unknownConfigField);
      const value = rawQuery[key];
      assert(
        typeof value === 'string' &&
          OPTIONS_QUERY_VALUE_RE.test(value) &&
          !isPrototypeKey(value),
        e.invalidString(`query.${key}`)
      );
      params.set(key, value);
    }
    const serialized = params.toString();
    if (serialized) queryString = `?${serialized}`;
  }
  return `${baseUrl}#/${targetPage}${queryString}`;
}

export async function openOptionsPage(
  page?: string,
  query?: Record<string, string>
) {
  const baseUrl = chrome.runtime.getURL('options.html');
  const targetUrl = buildOptionsUrl(baseUrl, page, query);
  const tabs = await chrome.tabs.query({ url: `${baseUrl}*` });
  const existing = tabs.find(
    (t) =>
      t.id !== undefined &&
      typeof t.url === 'string' &&
      (t.url === baseUrl ||
        t.url.startsWith(`${baseUrl}#`) ||
        t.url.startsWith(`${baseUrl}?`))
  );
  if (existing?.id !== undefined) {
    const updated = await chrome.tabs.update(existing.id, {
      url: targetUrl,
      active: true,
    });
    if (existing.windowId !== undefined && chrome.windows?.update) {
      await chrome.windows
        .update(existing.windowId, { focused: true })
        .catch(() => undefined);
    }
    return updated;
  }
  return chrome.tabs.create({ url: targetUrl });
}

export function applyConfigCommand(
  current: FilterConfig,
  command: Command
): FilterConfig {
  setActiveLocaleSetting(current.locale);
  const e = getErrors(current.locale);
  let next = structuredClone(current);
  switch (command.type) {
    case 'config.patch': {
      const rawPatch = record(command.patch, 'patch');
      const { rules, sceneModes, ...fields } = rawPatch;
      const allowed = new Set([
        'locale',
        'theme',
        'enabled',
        'interceptionMode',
        'exemptFollowing',
        'profileSceneBadgeOnly',
        'syncNativeXBlock',
        'enableCrowdReport',
        'enableCloudKeywords',
        'enabledCloudLangGroups',
        'disabledCloudKeywordIds',
        'customApiBaseUrl',
        'onboardingDismissed',
      ]);
      assert(
        Object.keys(fields).every((k) => allowed.has(k)),
        e.unknownConfigField
      );
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'enabledCloudLangGroups' && v === undefined) {
          delete next.enabledCloudLangGroups;
        } else if (v !== undefined) {
          (next as unknown as Record<string, unknown>)[k] = v;
        }
      }
      if (sceneModes !== undefined) {
        const rawModes = record(sceneModes, 'sceneModes');
        const merged: Partial<Record<SceneModeKey, SceneModeOverride>> = {
          for_you: 'inherit',
          following: 'inherit',
          reply: 'inherit',
          search: 'inherit',
          ...next.sceneModes,
        };
        for (const sceneKey of Object.keys(rawModes)) {
          assert(SCENE_MODE_KEY_SET.has(sceneKey), e.invalidSceneMode);
          if (rawModes[sceneKey] !== undefined) {
            merged[sceneKey as SceneModeKey] = rawModes[
              sceneKey
            ] as SceneModeOverride;
          }
        }
        next.sceneModes = merged;
      }
      if (rules !== undefined) {
        const rawRules = record(rules, 'rules');
        let mutatedPresetRule = false;
        for (const key of Object.keys(rawRules)) {
          assert(
            hasOwn(next.rules, key) && !PROTO_POLLUTION_KEYS.has(key),
            e.unknownRule
          );
          if (rawRules[key] === undefined) continue;
          const rawRulePatch = record(rawRules[key], `rules.${key}`);
          const targetRule = next.rules[
            key as keyof FilterConfig['rules']
          ] as unknown as Record<string, unknown>;
          assert(
            !hasOwn(rawRulePatch, 'items') &&
              Object.keys(rawRulePatch).every(
                (k) => hasOwn(targetRule, k) && !PROTO_POLLUTION_KEYS.has(k)
              ),
            e.unknownRuleParam
          );
          let appliedAnyParam = false;
          for (const [k, v] of Object.entries(rawRulePatch)) {
            if (v !== undefined) {
              targetRule[k] = v;
              appliedAnyParam = true;
            }
          }
          if (
            appliedAnyParam &&
            key !== 'keywords' &&
            key !== 'languageFilter' &&
            key !== 'domainFilter'
          ) {
            mutatedPresetRule = true;
          }
        }
        if (mutatedPresetRule) next.preset = 'custom';
      }
      break;
    }
    case 'config.preset':
      assert(
        ['light', 'standard', 'strict'].includes(command.preset),
        e.invalidPreset
      );
      next = applyPresetToConfig(next, command.preset);
      break;
    case 'config.replace':
      assert(
        digest(current) === command.expected,
        e.configChangedReloadPreview
      );
      next = validateConfig(command.config);
      break;
    case 'config.reset': {
      assert(
        digest(current) === command.expected,
        e.configChangedReconfirmReset
      );
      const defaults = createDefaultConfig();
      next = applyPresetToConfig(next, 'standard');
      next.interceptionMode = defaults.interceptionMode;
      next.exemptFollowing = defaults.exemptFollowing;
      next.profileSceneBadgeOnly = defaults.profileSceneBadgeOnly;
      next.sceneModes = structuredClone(defaults.sceneModes);
      next.rules.keywords.enabled = defaults.rules.keywords.enabled;
      next.rules.languageFilter = structuredClone(
        defaults.rules.languageFilter
      );
      next.rules.domainFilter.enabled = defaults.rules.domainFilter.enabled;
      break;
    }
    case 'keyword.save': {
      const item = validateKeyword(command.item),
        index = next.rules.keywords.items.findIndex((x) => x.id === item.id);
      assert(
        command.expected === undefined
          ? index < 0
          : index >= 0 &&
              digest(next.rules.keywords.items[index]) === command.expected,
        e.keywordModifiedReopen
      );
      if (index < 0) next.rules.keywords.items.push(item);
      else next.rules.keywords.items[index] = item;
      break;
    }
    case 'keyword.delete': {
      const item = next.rules.keywords.items.find((x) => x.id === command.id);
      assert(
        item !== undefined && digest(item) === command.expected,
        e.keywordChangedRefresh
      );
      next.rules.keywords.items = next.rules.keywords.items.filter(
        (x) => x.id !== command.id
      );
      break;
    }
    case 'domain.save': {
      const item = validateDomainRule(command.item);
      const index = next.rules.domainFilter.items.findIndex(
        (x) => x.id === item.id
      );
      assert(
        command.expected === undefined
          ? index < 0
          : index >= 0 &&
              digest(next.rules.domainFilter.items[index]) === command.expected,
        e.domainModifiedReopen
      );
      if (index < 0) next.rules.domainFilter.items.push(item);
      else next.rules.domainFilter.items[index] = item;
      break;
    }
    case 'domain.delete': {
      const item = next.rules.domainFilter.items.find(
        (x) => x.id === command.id
      );
      assert(
        item !== undefined && digest(item) === command.expected,
        e.domainChangedRefresh
      );
      next.rules.domainFilter.items = next.rules.domainFilter.items.filter(
        (x) => x.id !== command.id
      );
      break;
    }
    case 'cloudKeyword.toggle': {
      assert(
        typeof command.id === 'string' && command.id.trim().length > 0,
        e.invalidCloudKeywordId
      );
      assert(typeof command.enabled === 'boolean', e.expectBoolean('enabled'));
      const id = command.id.trim();
      next.disabledCloudKeywordIds = command.enabled
        ? next.disabledCloudKeywordIds.filter((x) => x !== id)
        : [...new Set([...next.disabledCloudKeywordIds, id])];
      break;
    }
    case 'cloudKeyword.customize': {
      assert(
        typeof command.sourceId === 'string' &&
          command.sourceId.trim().length > 0,
        e.invalidCloudKeywordId
      );
      const item = validateKeyword(command.item);
      assert(
        !next.rules.keywords.items.some((x) => x.id === item.id),
        e.duplicateCustomKeywordId
      );
      next.rules.keywords.items.push(item);
      next.rules.keywords.enabled = true;
      const sourceId = command.sourceId.trim();
      next.disabledCloudKeywordIds = [
        ...new Set([...next.disabledCloudKeywordIds, sourceId]),
      ];
      break;
    }
    case 'cloudLangGroup.toggle': {
      assert(isCloudKeywordLangGroup(command.group), e.invalidCloudLangGroup);
      assert(typeof command.enabled === 'boolean', e.expectBoolean('enabled'));
      // Materialize active defaults before toggling so first-time edits preserve defaults.
      const active = resolveEnabledCloudLangGroups(next);
      next.enabledCloudLangGroups = command.enabled
        ? [...new Set([...active, command.group])]
        : active.filter((group) => group !== command.group);
      break;
    }
    case 'target.disable': {
      const target = record(command.target, 'target');
      const kind = target.kind;
      const id = typeof target.id === 'string' ? target.id.trim() : '';
      assert(id.length > 0 && id.length <= 200, e.invalidDisableTarget);
      if (kind === 'cloud_keyword') {
        next.disabledCloudKeywordIds = [
          ...new Set([...next.disabledCloudKeywordIds, id]),
        ];
      } else if (kind === 'keyword') {
        const item = next.rules.keywords.items.find((x) => x.id === id);
        assert(item, e.targetNotFound);
        item.enabled = false;
      } else if (kind === 'domain') {
        const item = next.rules.domainFilter.items.find((x) => x.id === id);
        assert(item, e.targetNotFound);
        item.enabled = false;
      } else if (kind === 'pack_item') {
        const packId =
          typeof target.packId === 'string' ? target.packId.trim() : '';
        assert(packId.length > 0 && packId.length <= 100, e.invalidDisableTarget);
        const pack = (next.installedPacks ?? []).find((p) => p.id === packId);
        assert(pack, e.packNotFound);
        assert(packHasItemId(pack, id), e.targetNotFound);
        pack.disabledItemIds = [
          ...new Set([...(pack.disabledItemIds ?? []), id]),
        ];
      } else {
        throw new Error(e.invalidDisableTarget);
      }
      break;
    }
    case 'pack.install': {
      let payload: RulePackPayload;
      try {
        payload = validateRulePack(command.pack);
      } catch (err) {
        throw new Error(
          e.invalidRulePack(err instanceof Error ? err.message : String(err)),
          { cause: err }
        );
      }
      const packs = next.installedPacks ?? [];
      const existingIndex = packs.findIndex((p) => p.id === payload.id);
      if (existingIndex >= 0) {
        const existing = packs[existingIndex]!;
        const keptDisabled = existing.disabledItemIds?.filter((id) =>
          packHasItemId(payload, id)
        );
        const updated: InstalledRulePack = {
          ...payload,
          enabled: existing.enabled,
          installedAt: Date.now(),
          ...(keptDisabled && keptDisabled.length > 0
            ? { disabledItemIds: keptDisabled }
            : {}),
        };
        packs[existingIndex] = updated;
      } else {
        packs.push({
          ...payload,
          enabled: true,
          installedAt: Date.now(),
        });
      }
      next.installedPacks = packs;
      break;
    }
    case 'pack.toggle': {
      assert(
        typeof command.id === 'string' && command.id.trim().length > 0,
        e.packNotFound
      );
      assert(typeof command.enabled === 'boolean', e.expectBoolean('enabled'));
      const packId = command.id.trim();
      const pack = (next.installedPacks ?? []).find((p) => p.id === packId);
      assert(pack, e.packNotFound);
      pack.enabled = command.enabled;
      break;
    }
    case 'pack.uninstall': {
      assert(
        typeof command.id === 'string' && command.id.trim().length > 0,
        e.packNotFound
      );
      const packId = command.id.trim();
      const packs = next.installedPacks ?? [];
      assert(
        packs.some((p) => p.id === packId),
        e.packNotFound
      );
      next.installedPacks = packs.filter((p) => p.id !== packId);
      break;
    }
    case 'account.save': {
      const entry = validateAccount(command.entry);
      delete next.localBlocklistUids[entry.uid];
      delete next.whitelistUids[entry.uid];
      next[command.list === 'white' ? 'whitelistUids' : 'localBlocklistUids'][
        entry.uid
      ] = entry;
      break;
    }
    case 'account.delete':
      delete next[
        command.list === 'white' ? 'whitelistUids' : 'localBlocklistUids'
      ][command.uid];
      break;
    default:
      throw new Error(e.unknownConfigField);
  }
  const validated = validateConfig(next);
  setActiveLocaleSetting(validated.locale);
  return validated;
}
export function mergeViewerProfile(
  previous: ViewerProfile | undefined,
  incoming: ViewerProfile
): ViewerProfile {
  if (!previous || previous.restId !== incoming.restId) {
    return incoming;
  }
  return {
    ...incoming,
    screenName: incoming.screenName || previous.screenName,
    accountAgeDays:
      incoming.screenName && incoming.accountAgeDays > 0
        ? incoming.accountAgeDays
        : previous.accountAgeDays > 0
          ? previous.accountAgeDays
          : incoming.accountAgeDays,
    followersCount:
      incoming.followersCount > 0
        ? incoming.followersCount
        : previous.followersCount,
  };
}
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const pending = tail.then(work);
    tail = pending.catch(() => undefined);
    return pending;
  };
}
