import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultConfig,
  DEFAULT_CLOUD_KEYWORDS,
  SUPPORTED_LOCALES,
  UI_LOCALE_OPTIONS,
  type FilterRulesConfig,
} from '@keepxclean/shared';
import {
  getI18n,
  LOCALES,
  setActiveLocaleSetting,
} from '../src/i18n/core';
import { summarizeRule } from '../src/features/rules/RulesPage';
import { validateKeyword } from '../src/services/validation';
import { applyConfigCommand } from '../src/background/config';
import { digest } from '../src/services/model';

function sampleArgs(fn: (...args: never[]) => unknown): unknown[] {
  const src = fn.toString();
  const paramsRaw = src.slice(src.indexOf('(') + 1, src.indexOf(')'));
  if (!paramsRaw.trim()) return [];
  return paramsRaw.split(',').map((param) => {
    const name = param.trim().split(/[:=\s]/)[0]!;
    if (
      /^(open|integer|windowEnabled|truncated|usingBuiltin|isWhite|positive)$/.test(
        name
      )
    ) {
      return true;
    }
    if (name === 'mode') return 'allow';
    if (
      /^(active|total|weight|cjkApprox|daily|hours|maxWindow|min|count|hashtags|cashtags|days|ratio|added|changed|removed|skipped|notCounted|completed|failed|seconds|months|status)$/.test(
        name
      )
    ) {
      return 3;
    }
    return 'sample';
  });
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
      const args = sampleArgs(refVal as (...args: never[]) => unknown);
      const out = (targetVal as (...a: unknown[]) => string)(...args);
      expect(typeof out, `Non-string return at ${fullPath} in ${locale}`).toBe(
        'string'
      );
      expect(
        out.trim().length,
        `Empty formatted output at ${fullPath} in ${locale}`
      ).toBeGreaterThan(0);
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

  it('summarizes all 9 filter rules cleanly in every supported locale', () => {
    const ruleKeys: (keyof FilterRulesConfig)[] = [
      'replySpam',
      'engagementBait',
      'highFrequency',
      'crowdBlock',
      'keywords',
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
});
