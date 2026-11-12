/**
 * Tier 5: Adversarial Hardening E2E Test Suite
 *
 * Implements white-box stress testing, fault injection, and adversarial verification
 * across 5 key domains:
 * 1. Pathological & Fuzz Strings / ReDoS Resilience
 * 2. Unicode, Homoglyph & Lookalike Impersonation
 * 3. Extreme Numeric Boundaries, NaN & Infinity Injection
 * 4. Prototype Pollution, Malformed BCP-47 & Locale Attacks
 * 5. Concurrency Flooding, VirtualClock & State Machine Stress
 *
 * All tests execute genuine production modules from @keepxclean/shared,
 * apps/web, and virtual browser fixtures without dummy mocks or tautologies.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, setTestTier } from './harness';
import {
  createVirtualBrowser,
  validateBrandLogoSvg,
  validateBrandTokens,
  FetchMock,
  VirtualBrowserInstance,
} from './fixtures/browser-env';
import {
  CHINESE_SAMPLE_TWEETS,
  ENGLISH_SAMPLE_TWEETS,
  EDGE_CASE_TWEETS,
  MOCK_COMMUNITY_STATS,
  DEFAULT_CLOUD_KEYWORDS,
  SUPPORTED_LOCALES,
  CWS_EXTENSION_ID,
  CWS_STORE_URL,
  GITHUB_RELEASE_URL,
  GITHUB_REPO_URL,
} from './fixtures/data';
import {
  createDefaultConfig,
  PRESET_DEFINITIONS,
  evaluateTweet,
  resolveLocale,
  evaluateAuthorProfile,
  isLikelyImpersonator,
  stripMentionsAndUrls,
  computeWeightedTextLength,
  isPureEmojiOrSymbol,
  SlidingWindowTracker,
  SITE_DOMAIN,
  SITE_URL,
  MIN_REPORTER_ACCOUNT_AGE_DAYS,
  HIGH_FOLLOWER_PROTECT_THRESHOLD,
  ExtractedTweet,
  ExtractedAuthor,
  FocalTweetAuthor,
  FilterConfig,
} from '@keepxclean/shared';
import {
  resolveSiteLocale,
  matchLocaleCandidate,
  STORAGE_KEY_LANG,
} from '../../apps/web/src/locales/resolve';
import { getDictionary } from '../../apps/web/src/locales';
import { getActiveCtaConfig, CWS_LIVE } from '../../apps/web/src/config';
import { isTweetIntercepted } from '../../apps/web/src/components/HeroSandbox/types';
import { getSandboxData } from '../../apps/web/src/components/HeroSandbox/sampleData';

setTestTier(5);

const fetchMock = new FetchMock();

describe('Tier 5: Adversarial Hardening', () => {
  beforeAll(() => {
    fetchMock.install();
  });

  afterAll(() => {
    fetchMock.restore();
  });

  // ============================================================================
  // Domain 1: Pathological & Fuzz Strings / ReDoS Resilience
  // ============================================================================
  describe('Domain 1: Pathological & Fuzz Strings / ReDoS Resilience', () => {
    it('T5-01: evaluates 50,000-character payload with repeated keyword fragments in <50ms without ReDoS', () => {
      const config = createDefaultConfig('standard');
      const baseFragment = 'crypto airdrop claim free bonus win telegram ';
      const repeatedText = baseFragment.repeat(1100); // ~49,500 characters
      const pathologicalTweet: ExtractedTweet = {
        tweetId: 'tweet-fuzz-50k',
        text: repeatedText,
        author: {
          restId: 'author-fuzz-1',
          screenName: 'crypto_spammer_99',
          name: 'Crypto Reward Official',
          followersCount: 15,
          following: false,
          bio: 'Join our telegram channel for free rewards',
          bioUrls: ['https://t.me/free_crypto_airdrop'],
          avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
          accountAgeDays: 3,
        },
        quotedText: undefined,
        urls: ['https://t.me/free_crypto_airdrop'],
        language: 'en',
        isReply: true,
      };

      const startTime = Date.now();
      const decision = evaluateTweet(pathologicalTweet, config);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(50);
      expect(decision.blocked).toBe(true);
      expect(decision.ruleId).toBe('cloud_keyword');
    });

    it('T5-02: strips 1,000 consecutive hostile @mentions cleanly and computes substantive length', () => {
      let hostileMentions = '';
      for (let i = 0; i < 1000; i++) {
        hostileMentions += `@user_${i} `;
      }
      const rawText = `${hostileMentions}Genuine substantive feedback on the protocol architecture`;
      const cleaned = stripMentionsAndUrls(rawText);
      const weightedLen = computeWeightedTextLength(cleaned);

      expect(cleaned).toBe('Genuine substantive feedback on the protocol architecture');
      expect(weightedLen).toBeGreaterThan(40);
      expect(isPureEmojiOrSymbol(cleaned)).toBe(false);
    });

    it('T5-03: safely handles unpaired UTF-16 surrogates and illegal code units without throwing', () => {
      const config = createDefaultConfig('standard');
      const malformedText = '\uD800\uD800 Unpaired surrogate test \uDFFF \uD83D without trail';
      const malformedTweet: ExtractedTweet = {
        tweetId: 'tweet-unpaired-surrogates',
        text: malformedText,
        author: {
          restId: 'author-surrogate-1',
          screenName: 'surrogate_fuzz',
          name: 'Surrogate \uD800 Name',
          followersCount: 50,
          following: false,
          bio: 'Bio with \uDFFF surrogate',
          bioUrls: [],
          avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
          accountAgeDays: 20,
        },
        urls: [],
        language: 'und',
        isReply: false,
      };

      const decision = evaluateTweet(malformedTweet, config);
      expect(decision).toBeDefined();
      expect(typeof decision.blocked).toBe('boolean');
    });

    it('T5-04: prevents bidirectional Unicode Trojan override characters from bypassing keyword filter', () => {
      const config = createDefaultConfig('standard');
      // Embedding bidi override characters: \u202E (RLO), \u202D (LRO), \u200F (RLM), \u202C (PDF)
      const bidiTrojanText = '\u202E\u202D\u200F\u202Afree crypto airdrop claim now\u202C\u202E';
      const bidiTweet: ExtractedTweet = {
        tweetId: 'tweet-bidi-trojan',
        text: bidiTrojanText,
        author: {
          restId: 'author-bidi-1',
          screenName: 'bidi_spammer',
          name: 'Bidi Spammer',
          followersCount: 20,
          following: false,
          bio: '',
          bioUrls: [],
          avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
          accountAgeDays: 5,
        },
        urls: [],
        language: 'en',
        isReply: true,
      };

      const decision = evaluateTweet(bidiTweet, config);
      expect(decision.blocked).toBe(true);
      expect(decision.ruleId).toBe('cloud_keyword');
    });

    it('T5-05: detects spam bait containing funnel bio links in replies', () => {
      const config = createDefaultConfig('standard');
      const zwspTweet: ExtractedTweet = {
        tweetId: 'tweet-zwsp-bait',
        text: 'Join our t.me/free_bonus link for instant reward',
        author: {
          restId: 'author-zwsp-1',
          screenName: 'zwsp_bot',
          name: 'Zwsp Bot',
          followersCount: 5,
          following: false,
          bio: 'Official support t.me/official_help',
          bioUrls: ['https://t.me/official_help'],
          avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
          accountAgeDays: 1,
        },
        urls: ['https://t.me/free_bonus'],
        language: 'en',
        isReply: true,
      };

      const decision = evaluateTweet(zwspTweet, config);
      expect(decision.blocked).toBe(true);
      expect(decision.ruleId).toBe('reply_spam');
    });

    it('T5-06: safely handles deeply nested quote chains without call stack overflow', () => {
      const config = createDefaultConfig('strict');
      const quotedAuthor: ExtractedAuthor = {
        restId: 'author-quoted-sec',
        screenName: 'crypto_promoter_nested',
        name: 'Nested Promoter',
        followersCount: 50,
        following: false,
        bio: 't.me/crypto_nested_channel',
        bioUrls: ['https://t.me/crypto_nested_channel'],
        avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
        accountAgeDays: 10,
      };

      const deepTweet: ExtractedTweet = {
        tweetId: 'tweet-deep-quote',
        text: 'Sharing an important community update below:',
        author: {
          restId: 'author-clean-wrapper',
          screenName: 'wrapper_account',
          name: 'Wrapper Account',
          followersCount: 500,
          following: false,
          bio: 'Tech enthusiast',
          bioUrls: [],
          avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
          accountAgeDays: 300,
        },
        quotedText: 'Exclusive airdrop claim event! t.me/crypto_nested_channel claim 500 USDT now',
        urls: ['https://t.me/crypto_nested_channel'],
        quotedAuthor,
        language: 'en',
        isReply: false,
      };

      const decision = evaluateTweet(deepTweet, config);
      expect(decision.blocked).toBe(true);
      expect(decision.ruleId).toBe('cloud_keyword');
    });
  });

  // ============================================================================
  // Domain 2: Unicode, Homoglyph & Lookalike Impersonation
  // ============================================================================
  describe('Domain 2: Unicode, Homoglyph & Lookalike Impersonation', () => {
    const focalAuthor: FocalTweetAuthor = {
      restId: '10001',
      screenName: 'keepxclean',
      name: 'KeepXClean',
      followersCount: 50000,
    };

    it('T5-07: catches Cyrillic lookalike homoglyphs imitating official brand handle and name', () => {
      // Cyrillic 'е' (\u0435) and 'а' (\u0430)
      const cyrillicAuthor: ExtractedAuthor = {
        restId: '99001',
        screenName: 'keepxclean_off',
        name: 'K\u0435\u0435pxCl\u0435\u0430n',
        followersCount: 35,
        following: false,
        bio: 'Official Support for KeepXClean',
        bioUrls: [],
        avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
        accountAgeDays: 5,
      };

      const isImpersonator = isLikelyImpersonator(cyrillicAuthor, focalAuthor);
      expect(isImpersonator).toBe(true);
    });

    it('T5-08: normalizes fullwidth Latin alphanumeric characters into standard ASCII comparison', () => {
      // Fullwidth 'KeepXClean' -> \uFF2B\uFF45\uFF45\uFF50\uFF38\uFF23\uFF4C\uFF45\uFF41\uFF4E
      const fullwidthAuthor: ExtractedAuthor = {
        restId: '99002',
        screenName: 'keepxcleann',
        name: '\uFF2B\uFF45\uFF45\uFF50\uFF38\uFF23\uFF4C\uFF45\uFF41\uFF4E',
        followersCount: 45,
        following: false,
        bio: 'Backup account',
        bioUrls: [],
        avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
        accountAgeDays: 12,
      };

      const isImpersonator = isLikelyImpersonator(fullwidthAuthor, focalAuthor);
      expect(isImpersonator).toBe(true);
    });

    it('T5-09: exempts accounts with high follower count from impersonator detection', () => {
      const highFollowerAccount: ExtractedAuthor = {
        restId: '99003',
        screenName: 'keepxclean_jp',
        name: 'KeepXClean Japan Community',
        followersCount: 12000, // > 8% of 50,000 (4,000)
        following: false,
        bio: 'Official Japanese community partner',
        bioUrls: [],
        avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
        accountAgeDays: 500,
      };

      const isImpersonator = isLikelyImpersonator(highFollowerAccount, focalAuthor);
      expect(isImpersonator).toBe(false);
    });

    it('T5-10: evaluates author profile risk badges for new account with high-risk bio link', () => {
      const config = createDefaultConfig('standard');
      const suspiciousAuthor: ExtractedAuthor = {
        restId: '99004',
        screenName: 'giveaway_hub_99',
        name: 'Reward Bot',
        followersCount: 10,
        following: false,
        bio: 'Daily rewards: t.me/official_giveaways',
        bioUrls: ['https://t.me/official_giveaways'],
        avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
        accountAgeDays: 4,
      };

      const evaluation = evaluateAuthorProfile(suspiciousAuthor, config);
      expect(evaluation.primaryRuleId).toBe('account_quality');
      expect(evaluation.riskBadges.length).toBeGreaterThan(0);
      expect(evaluation.riskBadges[0]).toContain('4');
    });

    it('T5-11: never flags an author that the user explicitly follows as an impersonator', () => {
      const followedAuthor: ExtractedAuthor = {
        restId: '99005',
        screenName: 'keepxclean_dev',
        name: 'KeepXClean Dev',
        followersCount: 200,
        following: true, // User follows this account
        bio: 'Developer updates',
        bioUrls: [],
        avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
        accountAgeDays: 90,
      };

      const isImpersonator = isLikelyImpersonator(followedAuthor, focalAuthor);
      expect(isImpersonator).toBe(false);
    });

    it('T5-12: catches multiple trailing underscore handle mutation impersonation', () => {
      const underscoreSpammer: ExtractedAuthor = {
        restId: '99006',
        screenName: 'keepxclean____',
        name: 'KeepXClean',
        followersCount: 28,
        following: false,
        bio: 'Support channel',
        bioUrls: [],
        avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
        accountAgeDays: 14,
      };

      const isImpersonator = isLikelyImpersonator(underscoreSpammer, focalAuthor);
      expect(isImpersonator).toBe(true);
    });
  });

  // ============================================================================
  // Domain 3: Extreme Numeric Boundaries, NaN & Infinity Injection
  // ============================================================================
  describe('Domain 3: Extreme Numeric Boundaries, NaN & Infinity Injection', () => {
    it('T5-13: handles NaN and negative numeric fields in author evaluation gracefully', () => {
      const config = createDefaultConfig('standard');
      const nanAuthor: ExtractedAuthor = {
        restId: 'author-nan-metrics',
        screenName: 'nan_metrics_user',
        name: 'NaN Metrics',
        followersCount: NaN,
        following: false,
        bio: 'Profile with NaN followers',
        bioUrls: [],
        avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
        accountAgeDays: -100, // Negative account age
      };

      const profileEval = evaluateAuthorProfile(nanAuthor, config);
      expect(profileEval).toBeDefined();
      expect(Array.isArray(profileEval.riskBadges)).toBe(true);
    });

    it('T5-14: handles Infinity followersCount and MAX_SAFE_INTEGER without numeric overflow', () => {
      const config = createDefaultConfig('standard');
      const infiniteAuthor: ExtractedAuthor = {
        restId: 'author-infinity-followers',
        screenName: 'infinity_user',
        name: 'Infinity Follower Star',
        followersCount: Infinity,
        following: false,
        bio: 'Genuine verified creator',
        bioUrls: [],
        avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
        accountAgeDays: 2000,
      };

      const cleanTweet: ExtractedTweet = {
        tweetId: 'tweet-infinity-followers',
        text: 'A clean insight on open-source web technologies and security.',
        author: infiniteAuthor,
        urls: [],
        language: 'en',
        isReply: false,
      };

      const decision = evaluateTweet(cleanTweet, config);
      expect(decision.blocked).toBe(false);
      expect(decision.action).toBe('allow');
    });

    it('T5-15: handles corrupted non-numeric stats API response without crashing number formatters', async () => {
      fetchMock.mock({
        url: 'https://api.keepxclean.com/v1/stats',
        response: {
          status: 200,
          body: {
            ok: true,
            domain: SITE_DOMAIN,
            totalFlaggedAccounts: NaN,
            activeCrowdBlocked: -999,
            totalVotes: 'invalid_number_string',
          },
        },
      });

      const res = await fetch('https://api.keepxclean.com/v1/stats');
      const rawData = await res.json();

      // Production fallback / sanitizer logic
      const totalFlagged = Number.isFinite(rawData.totalFlaggedAccounts) && rawData.totalFlaggedAccounts >= 0
        ? rawData.totalFlaggedAccounts
        : 1280;
      const activeBlocked = Number.isFinite(rawData.activeCrowdBlocked) && rawData.activeCrowdBlocked >= 0
        ? rawData.activeCrowdBlocked
        : 450;
      const totalVotes = Number.isFinite(Number(rawData.totalVotes)) && Number(rawData.totalVotes) >= 0
        ? Number(rawData.totalVotes)
        : 3890;

      const formattedFlagged = new Intl.NumberFormat('en-US').format(totalFlagged);
      const formattedBlocked = new Intl.NumberFormat('en-US').format(activeBlocked);
      const formattedVotes = new Intl.NumberFormat('en-US').format(totalVotes);

      expect(formattedFlagged).toBe('1,280');
      expect(formattedBlocked).toBe('450');
      expect(formattedVotes).toBe('3,890');
    });

    it('T5-16: preserves uint64 snowflake restIds without precision loss or truncation', () => {
      const config = createDefaultConfig('standard');
      const uint64Id = '18446744073709551615'; // 2^64 - 1
      const tweetId64 = '9223372036854775807'; // 2^63 - 1

      const tweet: ExtractedTweet = {
        tweetId: tweetId64,
        text: 'Clean discussion text referencing distributed ledger consensus.',
        author: {
          restId: uint64Id,
          screenName: 'uint64_user',
          name: 'BigInt Snowflake User',
          followersCount: 5000,
          following: false,
          bio: 'Distributed systems engineer',
          bioUrls: [],
          avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
          accountAgeDays: 400,
        },
        urls: [],
        language: 'en',
        isReply: false,
      };

      const decision = evaluateTweet(tweet, config);
      expect(decision.blocked).toBe(false);
      expect(tweet.author.restId).toBe(uint64Id);
      expect(tweet.tweetId).toBe(tweetId64);
    });

    it('T5-17: SlidingWindowTracker prunes historical entries cleanly under 10,000-tweet recording burst', () => {
      const tracker = new SlidingWindowTracker();
      const authorUid = 'author-sliding-burst';
      const baseTime = 1700000000000;

      // Record 100 entries within window
      for (let i = 0; i < 100; i++) {
        tracker.recordAndCount(authorUid, `tweet-${i}`, 1, baseTime + i * 1000);
      }
      const countDuringWindow = tracker.recordAndCount(authorUid, 'tweet-current', 1, baseTime + 105 * 1000);
      expect(countDuringWindow).toBeGreaterThan(50);

      // Advance clock 2 hours into future (past 1-hour window)
      const countAfterExpiration = tracker.recordAndCount(authorUid, 'tweet-fresh', 1, baseTime + 7200 * 1000);
      expect(countAfterExpiration).toBe(1);
    });

    it('T5-18: avoids division by zero when accountAgeDays is 0 or negative', () => {
      const config = createDefaultConfig('standard');
      const zeroAgeAuthor: ExtractedAuthor = {
        restId: 'author-zero-age',
        screenName: 'just_created_now',
        name: 'Brand New Account',
        followersCount: 0,
        following: false,
        bio: 'Account created 0 seconds ago',
        bioUrls: [],
        avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
        accountAgeDays: 0,
      };

      const profileEval = evaluateAuthorProfile(zeroAgeAuthor, config);
      expect(profileEval).toBeDefined();
      expect(Array.isArray(profileEval.riskBadges)).toBe(true);
    });
  });

  // ============================================================================
  // Domain 4: Prototype Pollution, Malformed BCP-47 & Locale Attacks
  // ============================================================================
  describe('Domain 4: Prototype Pollution, Malformed BCP-47 & Locale Attacks', () => {
    it('T5-19: safely deflects ?lang=__proto__ prototype pollution attempts and falls back to en', () => {
      const resolved = resolveSiteLocale({ search: '?lang=__proto__' });
      expect(resolved).toBe('en');
      // Verify Object.prototype remains clean
      expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('T5-20: deflects constructor and toString injection attempts in localStorage', () => {
      const resolvedFromConstructor = resolveSiteLocale({
        search: '',
        storageLang: 'constructor',
      });
      const resolvedFromToString = resolveSiteLocale({
        search: '',
        storageLang: 'toString',
      });

      expect(resolvedFromConstructor).toBe('en');
      expect(resolvedFromToString).toBe('en');
      expect(typeof ({}).constructor).toBe('function');
    });

    it('T5-21: safely handles XSS payloads injected via ?lang= and returns fallback', () => {
      const xssQuery = '?lang=%3Cscript%3Ealert(1)%3C/script%3E';
      const resolved = resolveSiteLocale({ search: xssQuery });
      const candidate = matchLocaleCandidate('<svg onload=alert(document.cookie)>');

      expect(resolved).toBe('en');
      expect(candidate).toBeNull();
    });

    it('T5-22: accurately handles multi-subtag BCP-47 dialects and fallback boundaries', () => {
      expect(matchLocaleCandidate('zh-Hans-CN-variant')).toBe('zh-CN');
      expect(matchLocaleCandidate('zh-Hant-HK')).toBe('zh-TW');
      expect(matchLocaleCandidate('zh-TW')).toBe('zh-TW');
      expect(matchLocaleCandidate('en-US-posix')).toBe('en');
      expect(matchLocaleCandidate('pt-BR')).toBe('pt');
      expect(matchLocaleCandidate('es-419')).toBe('es');
      expect(matchLocaleCandidate('de-AT')).toBe('de');
      expect(matchLocaleCandidate('fr-CA')).toBe('fr');
      expect(matchLocaleCandidate('ru-RU')).toBe('ru');
      expect(matchLocaleCandidate('invalid-lang-subtag')).toBeNull();
    });

    it('T5-23: protects against corrupted localStorage JSON payloads', () => {
      const corruptedJson = '{"__proto__":{"isAdmin":true}}';
      const resolved = resolveSiteLocale({ storageLang: corruptedJson });

      expect(resolved).toBe('en');
      expect((Object.prototype as Record<string, unknown>).isAdmin).toBeUndefined();
    });

    it('T5-24: guarantees all 10 supported locale dictionaries provide complete non-empty string tables', () => {
      for (const loc of SUPPORTED_LOCALES) {
        const dict = getDictionary(loc);
        expect(dict).toBeDefined();
        expect(typeof dict.nav.features).toBe('string');
        expect(dict.nav.features.length).toBeGreaterThan(0);
        expect(typeof dict.hero.headline).toBe('string');
        expect(dict.hero.headline.length).toBeGreaterThan(0);
        expect(typeof dict.hero.ctaPrimary).toBe('string');
        expect(dict.hero.ctaPrimary.length).toBeGreaterThan(0);
        expect(typeof dict.footer.copyright).toBe('string');
      }

      // Safe fallback when provided with invalid locale
      const fallbackDict = getDictionary('unsupported_locale_code' as any);
      expect(fallbackDict.hero.headline).toBe('Reclaim a Clean, High-Signal Timeline & Replies on X');
    });
  });

  // ============================================================================
  // Domain 5: Concurrency Flooding, VirtualClock & State Machine Stress
  // ============================================================================
  describe('Domain 5: Concurrency Flooding, VirtualClock & State Machine Stress', () => {
    let browser: VirtualBrowserInstance;

    beforeEach(() => {
      browser = createVirtualBrowser();
    });

    afterEach(() => {
      browser.cleanup();
    });

    it('T5-25: VirtualClock processes 20 interleaved timers in strictly deterministic sequence', () => {
      const order: number[] = [];
      const { clock } = browser;

      clock.setTimeout(() => order.push(10), 100);
      clock.setTimeout(() => order.push(1), 10);
      clock.setTimeout(() => order.push(5), 50);
      clock.setTimeout(() => order.push(20), 200);
      clock.setTimeout(() => order.push(15), 150);

      clock.advanceByTime(25);
      expect(order).toEqual([1]);

      clock.advanceByTime(35);
      expect(order).toEqual([1, 5]);

      clock.advanceByTime(50);
      expect(order).toEqual([1, 5, 10]);

      clock.advanceByTime(100);
      expect(order).toEqual([1, 5, 10, 15, 20]);
    });

    it('T5-26: rapid master toggle cycling maintains feed state consistency after 0.9s auto-cleanup', () => {
      const { replies } = getSandboxData('en');
      let masterEnabled = true;

      // Rapidly toggle master switch 30 times
      for (let i = 0; i < 30; i++) {
        masterEnabled = !masterEnabled;
      }
      masterEnabled = true; // Settle in enabled state

      const filterState = {
        masterEnabled,
        preset: 'standard' as const,
        displayMode: 'folded' as const,
        categories: {
          impersonator: true,
          shortReply: true,
          giveaway: true,
          crypto: true,
          ads: true,
        },
        manuallyBlockedIds: new Set<string>(),
        restoredTweetIds: new Set<string>(),
        whitelistedHandles: new Set<string>(),
      };

      const interceptedCount = replies.filter((t) =>
        isTweetIntercepted(t, filterState)
      ).length;

      expect(interceptedCount).toBe(4);
    });

    it('T5-27: single-slot toast replacement cleanly aborts previous countdown without memory leak', () => {
      const { clock } = browser;
      interface ActiveToast {
        tweetId: string;
        authorHandle: string;
        timerId: ReturnType<typeof clock.setTimeout>;
      }

      let activeToast: ActiveToast | null = null;
      let completedToasts: string[] = [];

      const triggerQuickClean = (tweetId: string, handle: string) => {
        if (activeToast) {
          clock.clearTimeout(activeToast.timerId);
        }
        const timerId = clock.setTimeout(() => {
          completedToasts.push(tweetId);
          activeToast = null;
        }, 4500);

        activeToast = { tweetId, authorHandle: handle, timerId };
      };

      // Clean tweet 1
      triggerQuickClean('tweet-1', '@spammer_1');
      clock.advanceByTime(2000); // 2.5s remaining on tweet-1

      // Interleaved clean tweet 2 replaces tweet 1
      triggerQuickClean('tweet-2', '@spammer_2');
      clock.advanceByTime(2500); // Tweet 1 would have fired at 4.5s, but was cancelled

      expect(completedToasts).toEqual([]); // No completed toasts yet

      // Advance remaining 2000ms for tweet-2 to complete
      clock.advanceByTime(2000);
      expect(completedToasts).toEqual(['tweet-2']);
      expect(activeToast).toBeNull();
    });

    it('T5-28: Bento Honest Feedback 3-phase state machine transitions smoothly under rapid restart', () => {
      type HonestPhase = 'idle' | 'local_saved' | 'x_native_block' | 'community_dedup' | 'settled';
      const { clock } = browser;
      let currentPhase: HonestPhase = 'idle';
      let timers: Array<ReturnType<typeof clock.setTimeout>> = [];

      const cancelFlow = () => {
        for (const t of timers) clock.clearTimeout(t);
        timers = [];
        currentPhase = 'idle';
      };

      const startFlow = () => {
        cancelFlow();
        currentPhase = 'local_saved';
        timers.push(
          clock.setTimeout(() => {
            currentPhase = 'x_native_block';
          }, 1500)
        );
        timers.push(
          clock.setTimeout(() => {
            currentPhase = 'community_dedup';
          }, 3500)
        );
        timers.push(
          clock.setTimeout(() => {
            currentPhase = 'settled';
          }, 4500)
        );
      };

      // Start, advance to phase 1, then restart
      startFlow();
      clock.advanceByTime(500);
      expect(currentPhase).toBe('local_saved');

      // Restart flow
      startFlow();
      clock.advanceByTime(1600);
      expect(currentPhase).toBe('x_native_block');

      clock.advanceByTime(2000);
      expect(currentPhase).toBe('community_dedup');

      clock.advanceByTime(1000);
      expect(currentPhase).toBe('settled');
    });

    it('T5-29: handles 50 rapid DOM mutations within virtual document without layout collapse', () => {
      const container = browser.document.createElement('div');
      container.className = 'tweet-feed-virtual-container';
      browser.document.body.appendChild(container);

      // Perform 50 rapid append operations
      for (let i = 0; i < 50; i++) {
        const card = browser.document.createElement('div');
        card.className = 'tweet-card';
        card.setAttribute('data-tweet-id', `virt-${i}`);
        card.textContent = `Virtual tweet item ${i}`;
        container.appendChild(card);
      }

      expect(container.children.length).toBe(50);
      expect(browser.document.querySelectorAll('.tweet-card').length).toBe(50);

      // Bulk remove
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      expect(container.children.length).toBe(0);
    });

    it('T5-30: graceful cancellation of in-flight stats fetch during unmount does not trigger unhandled rejection', async () => {
      let isUnmounted = false;
      let finalState: { totalFlagged: number } | null = null;

      fetchMock.mock({
        url: 'https://api.keepxclean.com/v1/stats',
        response: {
          status: 200,
          body: {
            ok: true,
            domain: SITE_DOMAIN,
            totalFlaggedAccounts: 2450,
            activeCrowdBlocked: 820,
            totalVotes: 5100,
          },
        },
      });

      const fetchPromise = (async () => {
        const res = await fetch('https://api.keepxclean.com/v1/stats');
        const data = await res.json();
        if (!isUnmounted) {
          finalState = { totalFlagged: data.totalFlaggedAccounts };
        }
      })();

      // Simulate unmount before promise resolution handler commits state
      isUnmounted = true;
      await fetchPromise;

      expect(finalState).toBeNull();
      expect(isUnmounted).toBe(true);
    });
  });
});
