// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  matchLocaleCandidate,
  resolveSiteLocale,
  updateUrlQueryLang,
  STORAGE_KEY_LANG,
} from '../src/locales/resolve';

describe('Feature 21: 4-Tier Language Resolution & Candidate Matching', () => {
  describe('matchLocaleCandidate', () => {
    it('matches exact canonical codes case-insensitively', () => {
      expect(matchLocaleCandidate('en')).toBe('en');
      expect(matchLocaleCandidate('EN')).toBe('en');
      expect(matchLocaleCandidate('zh-CN')).toBe('zh-CN');
      expect(matchLocaleCandidate('zh-cn')).toBe('zh-CN');
      expect(matchLocaleCandidate('ZH-CN')).toBe('zh-CN');
      expect(matchLocaleCandidate('zh-TW')).toBe('zh-TW');
      expect(matchLocaleCandidate('zh-tw')).toBe('zh-TW');
      expect(matchLocaleCandidate('ja')).toBe('ja');
      expect(matchLocaleCandidate('ko')).toBe('ko');
      expect(matchLocaleCandidate('es')).toBe('es');
      expect(matchLocaleCandidate('pt')).toBe('pt');
      expect(matchLocaleCandidate('fr')).toBe('fr');
      expect(matchLocaleCandidate('de')).toBe('de');
      expect(matchLocaleCandidate('ru')).toBe('ru');
    });

    it('maps Chinese regional dialects and scripts correctly', () => {
      // Traditional Chinese regions
      expect(matchLocaleCandidate('zh-HK')).toBe('zh-TW');
      expect(matchLocaleCandidate('zh-hk')).toBe('zh-TW');
      expect(matchLocaleCandidate('zh-MO')).toBe('zh-TW');
      expect(matchLocaleCandidate('zh-Hant')).toBe('zh-TW');
      expect(matchLocaleCandidate('zh-Hant-TW')).toBe('zh-TW');

      // Simplified Chinese regions
      expect(matchLocaleCandidate('zh-SG')).toBe('zh-CN');
      expect(matchLocaleCandidate('zh-Hans')).toBe('zh-CN');
      expect(matchLocaleCandidate('zh-Hans-CN')).toBe('zh-CN');
      expect(matchLocaleCandidate('zh')).toBe('zh-CN');
    });

    it('maps regional language tags to supported base locales', () => {
      expect(matchLocaleCandidate('en-US')).toBe('en');
      expect(matchLocaleCandidate('en-GB')).toBe('en');
      expect(matchLocaleCandidate('en-CA')).toBe('en');
      expect(matchLocaleCandidate('ja-JP')).toBe('ja');
      expect(matchLocaleCandidate('ko-KR')).toBe('ko');
      expect(matchLocaleCandidate('es-ES')).toBe('es');
      expect(matchLocaleCandidate('es-419')).toBe('es');
      expect(matchLocaleCandidate('es-MX')).toBe('es');
      expect(matchLocaleCandidate('pt-BR')).toBe('pt');
      expect(matchLocaleCandidate('pt-PT')).toBe('pt');
      expect(matchLocaleCandidate('fr-FR')).toBe('fr');
      expect(matchLocaleCandidate('fr-CA')).toBe('fr');
      expect(matchLocaleCandidate('de-DE')).toBe('de');
      expect(matchLocaleCandidate('de-AT')).toBe('de');
      expect(matchLocaleCandidate('ru-RU')).toBe('ru');
    });

    it('returns null for unsupported languages or invalid formats', () => {
      expect(matchLocaleCandidate('it')).toBeNull();
      expect(matchLocaleCandidate('ar')).toBeNull();
      expect(matchLocaleCandidate('nl')).toBeNull();
      expect(matchLocaleCandidate('invalid')).toBeNull();
      expect(matchLocaleCandidate('')).toBeNull();
      expect(matchLocaleCandidate('   ')).toBeNull();
      expect(matchLocaleCandidate(null)).toBeNull();
      expect(matchLocaleCandidate(undefined)).toBeNull();
    });
  });

  describe('resolveSiteLocale 4-Tier Cascade', () => {
    it('Tier 1: URL ?lang= takes top priority', () => {
      const resolved = resolveSiteLocale({
        search: '?lang=ja',
        storageLang: 'fr',
        navLang: 'de',
      });
      expect(resolved).toBe('ja');
    });

    it('Tier 1: URL ?lang= resolves dialects correctly', () => {
      const resolved = resolveSiteLocale({
        search: '?lang=zh-HK',
        storageLang: 'es',
        navLang: 'en',
      });
      expect(resolved).toBe('zh-TW');
    });

    it('Tier 2: falls back to localStorage when URL param is absent', () => {
      const resolved = resolveSiteLocale({
        search: '',
        storageLang: 'ko',
        navLang: 'de',
      });
      expect(resolved).toBe('ko');
    });

    it('Tier 2: falls back to localStorage when URL param is invalid', () => {
      const resolved = resolveSiteLocale({
        search: '?lang=unsupported_lang',
        storageLang: 'es',
        navLang: 'ru',
      });
      expect(resolved).toBe('es');
    });

    it('Tier 3: falls back to navigator.language when URL and localStorage are absent', () => {
      const resolved = resolveSiteLocale({
        search: '',
        storageLang: null,
        navLang: 'fr-FR',
      });
      expect(resolved).toBe('fr');
    });

    it('Tier 3: falls back to navigator.language when URL and localStorage are invalid', () => {
      const resolved = resolveSiteLocale({
        search: '?lang=bad',
        storageLang: 'invalid_val',
        navLang: 'ru-RU',
      });
      expect(resolved).toBe('ru');
    });

    it('Tier 4: falls back to "en" when all tiers are absent or invalid', () => {
      const resolved = resolveSiteLocale({
        search: '?lang=foo',
        storageLang: 'bar',
        navLang: 'ar-SA',
      });
      expect(resolved).toBe('en');
    });
  });

  describe('Browser Environment Mocking', () => {
    const originalLocation = window.location;
    const originalLocalStorage = window.localStorage;
    const originalNavigator = window.navigator;

    let mockStorage: Record<string, string> = {};

    beforeEach(() => {
      mockStorage = {};
      const storageMock = {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          mockStorage = {};
        }),
      };
      Object.defineProperty(window, 'localStorage', {
        value: storageMock,
        writable: true,
      });
    });

    it('reads from actual window.location.search and localStorage in browser environment', () => {
      mockStorage[STORAGE_KEY_LANG] = 'pt';
      // No URL param -> reads localStorage 'pt'
      expect(resolveSiteLocale()).toBe('pt');
    });

    it('updateUrlQueryLang sets URL query param without crashing', () => {
      expect(() => updateUrlQueryLang('ja')).not.toThrow();
    });
  });
});
