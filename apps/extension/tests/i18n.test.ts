import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultConfig,
  DEFAULT_CLOUD_KEYWORDS,
  SUPPORTED_LOCALES,
  UI_LOCALE_OPTIONS,
  type FilterRulesConfig,
  type TriggeredRuleId,
} from '@keepxclean/shared';
import {
  ERROR_LOCALES,
  getI18n,
  LOCALES,
  setActiveLocaleSetting,
} from '../src/i18n/core';
import { summarizeRule } from '../src/features/rules/RulesPage';
import { validateKeyword } from '../src/services/validation';
import { applyConfigCommand } from '../src/background/config';
import { digest } from '../src/services/model';

function extractParamNames(fn: (...args: never[]) => unknown): string[] {
  const src = fn.toString().trim();
  const arrowIdx = src.indexOf('=>');
  const openParen = src.indexOf('(');
  if (arrowIdx !== -1 && (openParen === -1 || arrowIdx < openParen)) {
    const single = src
      .slice(0, arrowIdx)
      .replace(/^async\s+/, '')
      .trim();
    return single ? [single] : [];
  }
  const closeParen = src.indexOf(')', openParen + 1);
  if (openParen === -1 || closeParen === -1) return [];
  const paramsRaw = src.slice(openParen + 1, closeParen).trim();
  if (!paramsRaw) return [];
  return paramsRaw
    .split(',')
    .map((param) => param.trim().replace(/^\.\.\./, '').split(/[:=\s]/)[0]!)
    .filter(Boolean);
}

function sampleArgSets(fn: (...args: never[]) => unknown): unknown[][] {
  const names = extractParamNames(fn);
  if (names.length === 0) return [[]];
  const perParamOptions: unknown[][] = names.map((name) => {
    if (
      /^(open|integer|windowEnabled|truncated|usingBuiltin|isWhite|positive)$/.test(
        name
      )
    ) {
      return [true, false];
    }
    if (name === 'mode') return ['allow', 'block'];
    if (
      /^(active|total|weight|cjkApprox|daily|hours|maxWindow|min|count|hashtags|cashtags|days|ratio|added|changed|removed|skipped|notCounted|completed|failed|seconds|months|status|chunks|keywordsCount|domainsCount|accountsCount|pages|followers|d|mo)$/.test(
        name
      )
    ) {
      return [3];
    }
    return ['sample'];
  });

  let combos: unknown[][] = [[]];
  for (const options of perParamOptions) {
    const next: unknown[][] = [];
    for (const prefix of combos) {
      for (const opt of options) {
        next.push([...prefix, opt]);
      }
    }
    combos = next;
  }
  return combos;
}

function assertCompleteDictionary(
  reference: Record<string, unknown>,
  target: Record<string, unknown>,
  locale: string,
  prefix = ''
) {
  const refKeys = Object.keys(reference).sort();
  const targetKeys = Object.keys(target).sort();
  expect(targetKeys, `Key mismatch at ${prefix || '<root>'} in ${locale}`).toEqual(
    refKeys
  );
  for (const key of refKeys) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const refVal = reference[key];
    const targetVal = target[key];
    expect(typeof targetVal, `Type mismatch at ${fullPath} in ${locale}`).toBe(
      typeof refVal
    );
    if (typeof refVal === 'string') {
      expect(
        (targetVal as string).trim().length,
        `Empty string at ${fullPath} in ${locale}`
      ).toBeGreaterThan(0);
    } else if (typeof refVal === 'function') {
      const argSets = sampleArgSets(refVal as (...args: never[]) => unknown);
      for (const args of argSets) {
        const out = (targetVal as (...a: unknown[]) => string)(...args);
        expect(
          typeof out,
          `Non-string return at ${fullPath}(${JSON.stringify(args)}) in ${locale}`
        ).toBe('string');
        expect(
          out.trim().length,
          `Empty formatted output at ${fullPath}(${JSON.stringify(args)}) in ${locale}`
        ).toBeGreaterThan(0);
        expect(
          out,
          `Output contains "undefined" at ${fullPath}(${JSON.stringify(args)}) in ${locale}`
        ).not.toContain('undefined');
        expect(
          out,
          `Output contains "NaN" at ${fullPath}(${JSON.stringify(args)}) in ${locale}`
        ).not.toContain('NaN');
        expect(
          out,
          `Output contains "[object Object]" at ${fullPath}(${JSON.stringify(args)}) in ${locale}`
        ).not.toContain('[object Object]');
        expect(
          out,
          `Output contains uninterpolated "\${" at ${fullPath}(${JSON.stringify(args)}) in ${locale}`
        ).not.toContain('${');
      }
    } else if (refVal && typeof refVal === 'object') {
      assertCompleteDictionary(
        refVal as Record<string, unknown>,
        targetVal as Record<string, unknown>,
        locale,
        fullPath
      );
    }
  }
}

describe('extension internationalization (10 locales)', () => {
  afterEach(() => {
    setActiveLocaleSetting('auto');
  });

  it('maintains 100% key and formatter parity across all 10 UI locales', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(10);
    expect(UI_LOCALE_OPTIONS).toHaveLength(10);
    for (const locale of SUPPORTED_LOCALES) {
      const dict = LOCALES[locale];
      expect(dict).toBeDefined();
      assertCompleteDictionary(
        LOCALES.en as unknown as Record<string, unknown>,
        dict as unknown as Record<string, unknown>,
        locale
      );
    }
  });

  it('summarizes all 11 filter rules cleanly in every supported locale', () => {
    const ruleKeys: (keyof FilterRulesConfig)[] = [
      'replySpam',
      'grokFilter',
      'engagementBait',
      'highFrequency',
      'crowdBlock',
      'keywords',
      'domainFilter',
      'tagSpam',
      'accountQuality',
      'languageFilter',
      'hidePromotedAds',
    ];
    for (const locale of SUPPORTED_LOCALES) {
      const config = createDefaultConfig('standard');
      config.locale = locale;
      config.rules.languageFilter = {
        enabled: true,
        mode: 'allow',
        languages: ['en', 'zh', 'ja', 'ko', 'es', 'fr'],
      };
      for (const key of ruleKeys) {
        const text = summarizeRule(key, config, DEFAULT_CLOUD_KEYWORDS);
        expect(
          text.trim().length,
          `Empty rule summary for ${key} in ${locale}`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('ships valid Chrome MV3 _locales/messages.json bundles within Chrome Web Store limits', () => {
    const localesRoot = path.resolve(__dirname, '../public/_locales');
    for (const opt of UI_LOCALE_OPTIONS) {
      const file = path.join(localesRoot, opt.chromeDir, 'messages.json');
      expect(fs.existsSync(file), `Missing ${file}`).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
        string,
        { message?: string }
      >;
      expect(parsed.extName?.message?.trim().length).toBeGreaterThan(0);
      expect(parsed.extActionTitle?.message?.trim().length).toBeGreaterThan(0);
      const desc = parsed.extDescription?.message ?? '';
      expect(desc.trim().length).toBeGreaterThan(0);
      expect(
        desc.length,
        `extDescription exceeds 132 chars in ${opt.chromeDir}: ${desc.length}`
      ).toBeLessThanOrEqual(132);
    }
  });

  it('switches validation and command errors dynamically with active locale', () => {
    const badRegex = {
      id: 'bad',
      pattern: '[',
      isRegex: true,
      scopes: ['text'],
      enabled: true,
    };

    setActiveLocaleSetting('en');
    expect(() => validateKeyword(badRegex)).toThrow(
      getI18n('en').m.errors.invalidRegex
    );

    setActiveLocaleSetting('zh-CN');
    expect(() => validateKeyword(badRegex)).toThrow(
      getI18n('zh-CN').m.errors.invalidRegex
    );

    setActiveLocaleSetting('ja');
    expect(() => validateKeyword(badRegex)).toThrow(
      getI18n('ja').m.errors.invalidRegex
    );

    const cfg = createDefaultConfig('standard');
    cfg.locale = 'ru';
    const staleDigest = digest(cfg);
    cfg.enabled = false;
    expect(() =>
      applyConfigCommand(cfg, {
        type: 'config.reset',
        expected: staleDigest,
      })
    ).toThrow(getI18n('ru').m.errors.configChangedReconfirmReset);
  });

  it('maintains 100% ERROR_LOCALES parity, 11 rules.defs, and 16 localized history.ruleLabels across all 10 locales', () => {
    const ruleDefKeys: (keyof FilterRulesConfig)[] = [
      'replySpam',
      'grokFilter',
      'engagementBait',
      'highFrequency',
      'crowdBlock',
      'keywords',
      'domainFilter',
      'tagSpam',
      'accountQuality',
      'languageFilter',
      'hidePromotedAds',
    ];
    const ruleLabelKeys: TriggeredRuleId[] = [
      'local_blocklist',
      'reply_spam',
      'engagement_bait',
      'high_frequency_daily',
      'high_frequency_window',
      'crowd_block',
      'keyword',
      'cloud_keyword',
      'tag_spam',
      'account_quality',
      'language_filter',
      'promoted_ad',
      'impersonation',
      'grok_filter',
      'domain_filter',
      'rule_pack',
    ];

    for (const locale of SUPPORTED_LOCALES) {
      const errDict = ERROR_LOCALES[locale];
      expect(errDict, `Missing ERROR_LOCALES for ${locale}`).toBeDefined();
      assertCompleteDictionary(
        ERROR_LOCALES.en as unknown as Record<string, unknown>,
        errDict as unknown as Record<string, unknown>,
        locale,
        'ERROR_LOCALES'
      );

      const dict = LOCALES[locale];
      expect(Object.keys(dict.rules.defs).sort()).toEqual([...ruleDefKeys].sort());
      for (const defKey of ruleDefKeys) {
        const def = dict.rules.defs[defKey];
        expect(def, `Missing rules.defs.${defKey} in ${locale}`).toBeDefined();
        expect(def.title.trim().length, `Empty rules.defs.${defKey}.title in ${locale}`).toBeGreaterThan(0);
        expect(def.desc.trim().length, `Empty rules.defs.${defKey}.desc in ${locale}`).toBeGreaterThan(0);
        expect(def.note.trim().length, `Empty rules.defs.${defKey}.note in ${locale}`).toBeGreaterThan(0);
      }

      expect(Object.keys(dict.history.ruleLabels).sort()).toEqual([...ruleLabelKeys].sort());
      for (const lblKey of ruleLabelKeys) {
        const label = dict.history.ruleLabels[lblKey];
        expect(typeof label, `Non-string history.ruleLabels.${lblKey} in ${locale}`).toBe('string');
        expect(label.trim().length, `Empty history.ruleLabels.${lblKey} in ${locale}`).toBeGreaterThan(0);
      }
    }

    for (const v2RuleId of ['grok_filter', 'domain_filter', 'rule_pack'] as const) {
      expect(LOCALES['zh-CN'].history.ruleLabels[v2RuleId]).not.toBe(
        LOCALES.en.history.ruleLabels[v2RuleId]
      );
      expect(LOCALES.ja.history.ruleLabels[v2RuleId]).not.toBe(
        LOCALES.en.history.ruleLabels[v2RuleId]
      );
    }
  });
});
