import {
  applyPresetToConfig,
  createDefaultConfig,
  type FilterConfig,
  type ViewerProfile,
} from '@keepxclean/shared';
import { getErrors } from '../i18n/errors';
import { setActiveLocaleSetting } from '../i18n/state';
import { digest, type Command } from '../services/model';
import {
  assert,
  validateAccount,
  validateConfig,
  validateKeyword,
} from '../services/validation';

export function applyConfigCommand(
  current: FilterConfig,
  command: Command
): FilterConfig {
  setActiveLocaleSetting(current.locale);
  const e = getErrors(current.locale);
  let next = structuredClone(current);
  switch (command.type) {
    case 'config.patch': {
      const { rules, ...fields } = command.patch;
      const allowed = [
        'locale',
        'enabled',
        'interceptionMode',
        'exemptFollowing',
        'profileSceneBadgeOnly',
        'syncNativeXBlock',
        'enableCrowdReport',
        'enableCloudKeywords',
        'disabledCloudKeywordIds',
        'customApiBaseUrl',
      ];
      assert(
        Object.keys(fields).every((k) => allowed.includes(k)),
        e.unknownConfigField
      );
      Object.assign(next, fields);
      if (rules) {
        for (const key of Object.keys(rules) as (keyof typeof rules)[]) {
          assert(key in next.rules, e.unknownRule);
          const patch = rules[key]!;
          assert(
            !('items' in patch) &&
              Object.keys(patch).every((k) => k in next.rules[key]),
            e.unknownRuleParam
          );
          Object.assign(next.rules[key], patch);
        }
        if (
          Object.keys(rules).some(
            (k) => k !== 'keywords' && k !== 'languageFilter'
          )
        )
          next.preset = 'custom';
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
      next.rules.keywords.enabled = defaults.rules.keywords.enabled;
      next.rules.languageFilter = structuredClone(
        defaults.rules.languageFilter
      );
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
      assert(digest(item) === command.expected, e.keywordChangedRefresh);
      next.rules.keywords.items = next.rules.keywords.items.filter(
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
