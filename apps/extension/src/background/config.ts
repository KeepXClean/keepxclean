import {
  applyPresetToConfig,
  createDefaultConfig,
  type FilterConfig,
} from '@keepxclean/shared';
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
  let next = structuredClone(current);
  switch (command.type) {
    case 'config.patch': {
      const { rules, ...fields } = command.patch;
      const allowed = [
        'enabled',
        'interceptionMode',
        'exemptFollowing',
        'profileSceneBadgeOnly',
        'syncNativeXBlock',
        'enableCrowdReport',
        'enableCloudKeywords',
        'customApiBaseUrl',
      ];
      assert(
        Object.keys(fields).every((k) => allowed.includes(k)),
        '未知配置字段'
      );
      Object.assign(next, fields);
      if (rules) {
        for (const key of Object.keys(rules) as (keyof typeof rules)[]) {
          assert(key in next.rules, '未知规则');
          const patch = rules[key]!;
          assert(
            !('items' in patch) &&
              Object.keys(patch).every((k) => k in next.rules[key]),
            '未知规则参数'
          );
          Object.assign(next.rules[key], patch);
        }
        if (Object.keys(rules).some((k) => k !== 'keywords'))
          next.preset = 'custom';
      }
      break;
    }
    case 'config.preset':
      assert(
        ['light', 'standard', 'strict'].includes(command.preset),
        '预设无效'
      );
      next = applyPresetToConfig(next, command.preset);
      break;
    case 'config.replace':
      assert(
        digest(current) === command.expected,
        '配置已在其他窗口修改，请重新预览'
      );
      next = validateConfig(command.config);
      break;
    case 'config.reset': {
      assert(
        digest(current) === command.expected,
        '配置已变化，请重新确认重置'
      );
      const defaults = createDefaultConfig();
      next = applyPresetToConfig(next, 'standard');
      next.interceptionMode = defaults.interceptionMode;
      next.exemptFollowing = defaults.exemptFollowing;
      next.profileSceneBadgeOnly = defaults.profileSceneBadgeOnly;
      next.rules.keywords.enabled = defaults.rules.keywords.enabled;
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
        '这条关键词已被修改，请重新打开编辑器'
      );
      if (index < 0) next.rules.keywords.items.push(item);
      else next.rules.keywords.items[index] = item;
      break;
    }
    case 'keyword.delete': {
      const item = next.rules.keywords.items.find((x) => x.id === command.id);
      assert(digest(item) === command.expected, '关键词已变化，请刷新后重试');
      next.rules.keywords.items = next.rules.keywords.items.filter(
        (x) => x.id !== command.id
      );
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
      throw new Error('不是配置命令');
  }
  return validateConfig(next);
}
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const pending = tail.then(work);
    tail = pending.catch(() => undefined);
    return pending;
  };
}
