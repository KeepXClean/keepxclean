import {
  createDefaultConfig,
  type AccountListEntry,
  type CrowdBlockSnapshot,
  type FilterConfig,
  type KeywordRuleItem,
} from '@keepxclean/shared';

export const UID = /^\d{1,25}$/;
const scopes = ['text', 'bio', 'name', 'url'];
const tags = ['spam', 'nsfw', 'scam', 'ad', 'bot', 'other'];
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function record(value: unknown, path: string): Record<string, unknown> {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${path}：应为对象`
  );
  return value as Record<string, unknown>;
}
function string(
  value: unknown,
  path: string,
  max = 1000,
  empty = true
): string {
  assert(
    typeof value === 'string' &&
      value.length <= max &&
      (empty || value.trim().length > 0),
    `${path}：文本为空或过长`
  );
  return value;
}
function number(
  value: unknown,
  path: string,
  min = 0,
  integer = false
): number {
  assert(
    typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= min &&
      (!integer || Number.isSafeInteger(value)),
    `${path}：请输入${min > 0 ? '正' : '非负'}${integer ? '整数' : '数值'}`
  );
  return value;
}
function bool(value: unknown, path: string): boolean {
  assert(typeof value === 'boolean', `${path}：应为开关值`);
  return value;
}
export function validateKeyword(input: unknown): KeywordRuleItem {
  const x = record(input, '关键词');
  const pattern = string(x.pattern, '关键词内容', 2000, false);
  const isRegex = bool(x.isRegex, '正则开关');
  if (isRegex) {
    try {
      new RegExp(pattern, 'i');
    } catch {
      throw new Error('正则表达式无效，请检查括号、转义和量词。');
    }
  }
  assert(
    Array.isArray(x.scopes) &&
      x.scopes.length > 0 &&
      x.scopes.every((s) => scopes.includes(s)),
    '匹配范围：至少选择一种有效范围'
  );
  return {
    id: string(x.id, '关键词 ID', 200, false),
    pattern,
    isRegex,
    scopes: [...new Set(x.scopes)] as KeywordRuleItem['scopes'],
    enabled: bool(x.enabled, '关键词启用'),
    ...(x.note !== undefined ? { note: string(x.note, '备注', 2000) } : {}),
    ...(x.maxFollowersExempt !== undefined
      ? {
          maxFollowersExempt: number(x.maxFollowersExempt, '粉丝豁免', 0, true),
        }
      : {}),
  };
}
export function validateAccount(input: unknown): AccountListEntry {
  const x = record(input, '账号');
  assert(
    typeof x.uid === 'string' && UID.test(x.uid),
    '账号 UID 必须为 1–25 位数字，不能用 Handle 代替'
  );
  const out: AccountListEntry = {
    uid: x.uid,
    screenName: string(x.screenName ?? '', 'Handle', 100),
    addedAt: number(x.addedAt, '添加时间'),
  };
  for (const key of ['name', 'avatarUrl', 'reason'] as const)
    if (x[key] !== undefined) out[key] = string(x[key], key, 2000);
  if (x.tag !== undefined) {
    assert(tags.includes(String(x.tag)), '无效的原因标签');
    out.tag = x.tag as AccountListEntry['tag'];
  }
  if (out.avatarUrl && !/^https:\/\//.test(out.avatarUrl)) delete out.avatarUrl;
  return out;
}
export function normalizeServiceUrl(input: string): string {
  if (!input.trim()) return '';
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('请输入完整服务地址，例如 https://api.example.com');
  }
  assert(
    url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)),
    '服务地址必须使用 HTTPS；本地开发地址可使用 HTTP'
  );
  assert(
    !url.username && !url.password && !url.search && !url.hash,
    '服务地址不能包含账号、密码、查询参数或片段'
  );
  return url.href.replace(/\/+$/, '');
}
export function validateConfig(input: unknown): FilterConfig {
  const x = record(input, '配置');
  assert(x.version === 1, '配置版本不支持：仅支持 version 1');
  const defaults = createDefaultConfig();
  const out = structuredClone(defaults);
  for (const key of [
    'enabled',
    'exemptFollowing',
    'profileSceneBadgeOnly',
    'syncNativeXBlock',
    'enableCrowdReport',
    'enableCloudKeywords',
  ] as const)
    if (x[key] !== undefined) out[key] = bool(x[key], key);
  if (x.preset !== undefined) {
    assert(
      ['light', 'standard', 'strict', 'custom'].includes(String(x.preset)),
      '无效预设'
    );
    out.preset = x.preset as FilterConfig['preset'];
  }
  if (x.interceptionMode !== undefined) {
    assert(
      ['strip', 'collapse'].includes(String(x.interceptionMode)),
      '无效呈现方式'
    );
    out.interceptionMode =
      x.interceptionMode as FilterConfig['interceptionMode'];
  }
  if (x.customApiBaseUrl !== undefined)
    out.customApiBaseUrl = normalizeServiceUrl(
      string(x.customApiBaseUrl, '服务地址', 2048)
    );
  const rules = record(x.rules, 'rules');
  for (const key of Object.keys(
    defaults.rules
  ) as (keyof FilterConfig['rules'])[]) {
    if (rules[key] === undefined) continue;
    const rule = record(rules[key], `rules.${key}`);
    const target = out.rules[key] as unknown as Record<string, unknown>;
    for (const [field, defaultValue] of Object.entries(defaults.rules[key])) {
      if (field === 'items' || rule[field] === undefined) continue;
      const value = rule[field];
      target[field] =
        typeof defaultValue === 'boolean'
          ? bool(value, `${key}.${field}`)
          : number(
              value,
              `${key}.${field}`,
              field === 'slidingWindowHours' ? 0.1 : 0,
              ![
                'slidingWindowHours',
                'maxDailyTweets',
                'maxFollowRatio',
              ].includes(field)
            );
    }
  }
  if (rules.keywords !== undefined) {
    const k = record(rules.keywords, 'rules.keywords');
    if (k.items !== undefined) {
      assert(Array.isArray(k.items), 'keywords.items 应为数组');
      out.rules.keywords.items = k.items.map(validateKeyword);
    }
  }
  const ids = out.rules.keywords.items.map((k) => k.id);
  assert(new Set(ids).size === ids.length, '关键词 ID 重复');
  for (const key of ['whitelistUids', 'localBlocklistUids'] as const) {
    out[key] = {};
    if (x[key] === undefined) continue;
    for (const [uid, entry] of Object.entries(record(x[key], key))) {
      const validated = validateAccount(entry);
      assert(uid === validated.uid, `${key} 的键必须与账号 UID 一致`);
      out[key][uid] = validated;
    }
  }
  assert(
    !Object.keys(out.whitelistUids).some((uid) => out.localBlocklistUids[uid]),
    '同一 UID 不能同时存在于黑名单和白名单'
  );
  return out;
}
export function validateSnapshot(input: unknown): CrowdBlockSnapshot {
  const x = record(input, '社区快照');
  assert(x.version === 1, '社区快照版本不支持');
  assert(
    typeof x.updatedAt === 'string' && Number.isFinite(Date.parse(x.updatedAt)),
    '快照时间无效'
  );
  const counts: CrowdBlockSnapshot['counts'] = {};
  for (const [uid, raw] of Object.entries(record(x.counts, '快照计数'))) {
    assert(UID.test(uid), '快照 UID 无效');
    const entry = record(raw, '快照账号');
    counts[uid] = { c: number(entry.c, '社区计数', 0, true) };
    if (entry.t !== undefined) {
      assert(tags.includes(String(entry.t)), '快照标签无效');
      counts[uid].t = entry.t as AccountListEntry['tag'];
    }
    if (entry.p !== undefined) counts[uid].p = bool(entry.p, '高粉保护');
  }
  assert(Array.isArray(x.cloudKeywords), '公共词库结构无效');
  return {
    version: 1,
    updatedAt: x.updatedAt,
    domain: string(x.domain, '快照来源'),
    totalAccounts: number(x.totalAccounts, '账号总数', 0, true),
    totalReports: number(x.totalReports, '记录总数', 0, true),
    counts,
    cloudKeywords: x.cloudKeywords.map(validateKeyword),
  };
}
