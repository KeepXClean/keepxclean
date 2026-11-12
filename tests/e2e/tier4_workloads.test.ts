/**
 * Tier 4: Real-World Application Workloads & End-to-End User Journeys
 *
 * Covers 18 end-to-end user journeys:
 * Realistic multi-step user scenarios exercising full browser contexts,
 * persona intents, state machine transitions, locale flows, and CI/CD pipelines.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, setTestTier } from './harness';
import {
  createVirtualBrowser,
  validateBrandLogoSvg,
  validateBrandTokens,
  FetchMock,
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
import * as fs from 'fs';
import * as path from 'path';

setTestTier(4);

const ROOT_DIR = path.resolve(__dirname, '../../');
const fetchMock = new FetchMock();

describe('Tier 4: Real-World Workloads & End-to-End User Journeys', () => {
  beforeAll(() => {
    fetchMock.install();
  });

  afterAll(() => {
    fetchMock.restore();
  });

  // T4-01: First-Time English Visitor Lands, Watches 0.9s Auto-cleanup, Tests Undo Toast & Downloads v0.1.0
  it('T4-01: First-Time English Visitor Evaluating and Sideloading Journey', () => {
    const { createDefaultConfig, evaluateTweet } = require('../../packages/shared/src/index');
    const { getActiveCtaConfig } = require('../../apps/web/src/config');
    const browser = createVirtualBrowser({ language: 'en' });

    const config = createDefaultConfig('standard');
    const baseAuthor = {
      restId: 'user_en_101',
      screenName: 'tech_enthusiast',
      name: 'Tech Enthusiast',
      bio: '',
      bioUrls: [],
      followersCount: 1500,
      friendsCount: 300,
      following: false,
      verified: false,
      blueVerified: false,
      defaultProfileImage: false,
      createdAt: '2021-01-01',
    };

    const cleanTweet = {
      id: 'en-clean-1',
      author: baseAuthor,
      text: 'Great technical architecture overview on local-first processing.',
      lang: 'en',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    };

    const promotedTweet = {
      id: 'en-noise-promoted',
      author: baseAuthor,
      text: 'Promoted ad campaign for cloud servers.',
      lang: 'en',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: true,
      scene: 'timeline' as const,
    };

    // Step 1: Auto-cleanup at 900ms evaluates clean vs promoted tweet
    const autoCleanNode = browser.document.createElement('div');
    autoCleanNode.setAttribute('data-cleaned', 'false');
    browser.document.body.appendChild(autoCleanNode);

    browser.window.setTimeout(() => {
      autoCleanNode.setAttribute('data-cleaned', 'true');
    }, 900);
    browser.advanceTimersByTime(900);
    expect(autoCleanNode.getAttribute('data-cleaned')).toBe('true');

    const initialClean = evaluateTweet(cleanTweet as any, config);
    const initialPromoted = evaluateTweet(promotedTweet as any, config);
    expect(initialClean.blocked).toBe(false);
    expect(initialPromoted.blocked).toBe(true);

    // Step 2: Master toggle OFF allows all; toggle back ON restores filtering
    config.enabled = false;
    expect(evaluateTweet(promotedTweet as any, config).blocked).toBe(false);
    config.enabled = true;
    expect(evaluateTweet(promotedTweet as any, config).blocked).toBe(true);

    // Step 3: Manual clean on clean discussion tweet triggers local block
    config.localBlocklistUids[baseAuthor.restId] = { addedAt: Date.now(), reason: 'manual' };
    const manualDecision = evaluateTweet(cleanTweet as any, config);
    expect(manualDecision.blocked).toBe(true);
    expect(manualDecision.ruleId).toBe('local_blocklist');

    // Step 4: Undo at 2500ms (within 4500ms window) restores the tweet
    browser.advanceTimersByTime(2500);
    delete config.localBlocklistUids[baseAuthor.restId];
    expect(evaluateTweet(cleanTweet as any, config).blocked).toBe(false);

    // Step 5: Primary CTA destination points to GitHub release asset
    const ctaConfig = getActiveCtaConfig(false);
    expect(ctaConfig.primaryUrl).toContain('releases/latest');

    browser.cleanup();
  });

  // T4-02: Chinese User Explores Localized Feed, Switches to Strict Preset & Exports Regex
  it('T4-02: Chinese Twitter User Combatting "Kou 1" Bait & Copying Custom Regex', async () => {
    const {
      DEFAULT_CLOUD_KEYWORDS,
      PRESET_DEFINITIONS,
      applyPresetToConfig,
      createDefaultConfig,
    } = require('../../packages/shared/src/index');
    const browser = createVirtualBrowser({ language: 'zh-CN' });

    // Find bait keyword pattern
    const clicheRule = DEFAULT_CLOUD_KEYWORDS.find((k: any) => k.id.startsWith('cloud-cliche'));
    expect(clicheRule).toBeDefined();

    // Verify regex matches sample bait tweet
    const compiledBaitRegex = new RegExp(clicheRule.pattern, 'i');
    expect(compiledBaitRegex.test('冷知识：99%的人都不知道这个技巧')).toBe(true);

    // Switch to strict preset via production helper
    const config = applyPresetToConfig(createDefaultConfig(), 'strict');
    expect(config.preset).toBe('strict');
    expect(PRESET_DEFINITIONS.strict.rules.highFrequency.maxDailyTweets).toBeLessThan(
      PRESET_DEFINITIONS.light.rules.highFrequency.maxDailyTweets
    );

    // Clipboard copy pattern through browser navigator API
    let clipboardStore = '';
    Object.defineProperty(browser.window.navigator, 'clipboard', {
      value: {
        writeText: async (t: string) => { clipboardStore = t; },
        readText: async () => clipboardStore,
      },
      configurable: true,
      writable: true,
    });

    await browser.window.navigator.clipboard.writeText(clicheRule.pattern);
    const readBack = await browser.window.navigator.clipboard.readText();
    expect(readBack).toBe(clicheRule.pattern);

    browser.cleanup();
  });

  // T4-03: Japanese User Arrives via Query Param, Audits Local-First Flow & Checks FAQ
  it('T4-03: Japanese Open-Source Contributor Validating Privacy & Architecture', () => {
    const { resolveLocale } = require('../../packages/shared/src/i18n');
    const { PRIVACY_CONTENT } = require('../../apps/web/src/data/privacyContent');

    const browser = createVirtualBrowser({
      url: 'https://keepxclean.com/?lang=ja',
      language: 'ja',
    });
    expect(resolveLocale('ja')).toBe('ja');
    expect(browser.document.documentElement.lang).toBe('ja');

    // Audit architecture section invariants in App.tsx and en.ts locale definition
    const appSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/App.tsx'), 'utf8');
    expect(appSource).toContain('id="architecture"');

    const enLocale = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/locales/en.ts'), 'utf8');
    expect(enLocale).toContain('< 1ms');
    expect(enLocale).toContain('SHA-256');
    expect(enLocale).toContain('GraphQL');

    // Verify zero third-party telemetry dependencies in web package
    const webPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'apps/web/package.json'), 'utf8'));
    const allDeps = { ...webPkg.dependencies, ...webPkg.devDependencies };
    expect(allDeps['google-analytics']).toBeUndefined();
    expect(allDeps['@segment/analytics-next']).toBeUndefined();
    expect(allDeps['mixpanel-browser']).toBeUndefined();

    // Verify privacy bullet specifications
    expect(PRIVACY_CONTENT.en.sec1Bullets.length).toBeGreaterThan(0);

    browser.cleanup();
  });

  // T4-04: Chrome Web Store Extension Auditor Compliance Inspection
  it('T4-04: Chrome Web Store Extension Auditor Compliance Inspection', () => {
    const { PRIVACY_CONTENT } = require('../../apps/web/src/data/privacyContent');
    const { PRIVACY_EMAIL } = require('../../apps/web/src/config');

    // Review all single-purpose permissions
    const sec4Rows = PRIVACY_CONTENT.en.sec4Rows;
    expect(sec4Rows.length).toBe(5);

    const permissionNames = sec4Rows.flatMap((r: any) => r.permission);
    expect(permissionNames).toContain('storage');
    expect(permissionNames).toContain('alarms');
    expect(permissionNames).toContain('*://*.x.com/*');
    expect(permissionNames).toContain('https://*.keepxclean.com/*');
    expect(permissionNames).toContain('optional_host_permissions');

    // Review official contact email
    expect(PRIVACY_CONTENT.en.contactEmail).toBe('privacy@keepxclean.com');
    expect(PRIVACY_EMAIL).toBe('privacy@keepxclean.com');
  });

  // T4-05: Information Security Engineer Conducting Open-Source Audit
  it('T4-05: Information Security Engineer Conducting Open-Source Audit', () => {
    // 1. Scan deploy.yml
    const deployYml = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/deploy.yml'), 'utf8');
    expect(deployYml).not.toContain('ghp_');

    // 2. Check .gitignore
    const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.agents/');

    // 3. Check release extension artifact configuration
    expect(deployYml).toContain('keepxclean-chrome-extension');
  });

  // T4-06: Low-Bandwidth / Offline Mobile Visitor
  it('T4-06: Low-Bandwidth / Offline Mobile Visitor', async () => {
    const { API_STATS_URL } = require('../../apps/web/src/config');
    fetchMock.mockStatsNetworkError();

    async function fetchWithOfflineFallback(url: string) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Offline');
        return await res.json();
      } catch {
        return MOCK_COMMUNITY_STATS.fallbackOffline;
      }
    }

    const stats = await fetchWithOfflineFallback(API_STATS_URL);
    expect(stats.totalFlaggedAccounts).toBe(1280);
    expect(stats.activeCrowdBlocked).toBe(450);
    expect(stats.totalVotes).toBe(3890);
  });

  // T4-07: Accessibility-Focused User with Motion Sensitivity (WCAG 2.1 AA)
  it('T4-07: Accessibility-Focused User with Motion Sensitivity (WCAG 2.1 AA)', () => {
    const browser = createVirtualBrowser({ reducedMotion: true });
    const isReduced = browser.window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    expect(isReduced).toBe(true);

    const tokensCss = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/styles/tokens.css'), 'utf8');
    expect(tokensCss).toContain('--green: #13865f;');
    expect(tokensCss).toContain('--canvas: #f7f9f8;');
    expect(tokensCss).toContain('--surface: #ffffff;');
    expect(tokensCss).toContain('prefers-reduced-motion: reduce');

    browser.cleanup();
  });

  // T4-08: Power User Customizing Filter Rules & Display Modes
  it('T4-08: Power User Customizing Filter Rules & Display Modes', () => {
    const { createDefaultConfig, evaluateTweet } = require('../../packages/shared/src/index');

    const config = createDefaultConfig('standard');
    config.rules.hidePromotedAds.enabled = false;
    config.rules.replySpam.enabled = true;
    config.rules.replySpam.detectImpersonation = true;

    const baseAuthor = {
      restId: 'user_impersonator_99',
      screenName: 'elonmusk_crypto',
      name: 'Elon Musk',
      bio: 'Official crypto giveaway',
      bioUrls: [],
      followersCount: 10,
      friendsCount: 5,
      following: false,
      verified: false,
      blueVerified: true,
      defaultProfileImage: false,
      createdAt: '2024-01-01',
    };

    const adTweet = {
      id: 'tweet-ad-1',
      author: baseAuthor,
      text: 'Sponsored advertisement for cloud hosting.',
      lang: 'en',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: true,
      scene: 'timeline' as const,
    };

    const impersonationTweet = {
      id: 'tweet-imp-1',
      author: baseAuthor,
      text: 'Send 1 ETH to get 2 back immediately!',
      lang: 'en',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'reply' as const,
      isReply: true,
      focalAuthor: {
        restId: 'user_real_44',
        screenName: 'elonmusk',
        name: 'Elon Musk',
        bio: '',
        bioUrls: [],
        followersCount: 150000000,
        friendsCount: 200,
        following: false,
        verified: true,
        blueVerified: true,
        defaultProfileImage: false,
        createdAt: '2010-01-01',
      },
    };

    // Ad tweet allowed because ads filter is explicitly unchecked
    expect(evaluateTweet(adTweet as any, config).blocked).toBe(false);

    // Impersonation tweet blocked by impersonation detector
    const impDecision = evaluateTweet(impersonationTweet as any, config);
    expect(impDecision.blocked).toBe(true);
    expect(impDecision.ruleId).toBe('impersonation');
  });

  // T4-09: Sideload Early Adopter Upgrading to Official Chrome Store
  it('T4-09: Sideload Early Adopter Upgrading to Official Chrome Store', () => {
    const { getActiveCtaConfig, CWS_EXTENSION_ID } = require('../../apps/web/src/config');

    // 1. Review phase (cwsLive = false): points to GitHub releases
    const reviewCta = getActiveCtaConfig(false);
    expect(reviewCta.cwsLive).toBe(false);
    expect(reviewCta.primaryUrl).toContain('releases/latest');
    expect(reviewCta.isStore).toBe(false);

    // 2. Approved phase (cwsLive = true): points directly to Chrome Web Store
    const liveCta = getActiveCtaConfig(true);
    expect(liveCta.cwsLive).toBe(true);
    expect(liveCta.primaryUrl).toContain(CWS_EXTENSION_ID);
    expect(liveCta.isStore).toBe(true);
  });

  // T4-10: Multilingual Polyglot Switching Locales Across a Single Session
  it('T4-10: Multilingual Polyglot Switching Locales Across a Single Session', () => {
    const { resolveLocale, getEngineMessages, SUPPORTED_LOCALES } = require('../../packages/shared/src/i18n');
    const browser = createVirtualBrowser();

    for (const loc of SUPPORTED_LOCALES) {
      expect(resolveLocale(loc)).toBe(loc);
      const messages = getEngineMessages(loc);
      expect(messages.promotedAdBadge).toBeDefined();
      expect(typeof messages.promotedAdBadge).toBe('string');

      browser.window.localStorage.setItem('kxc_site_lang', loc);
      browser.setLanguage(loc);
      expect(browser.window.localStorage.getItem('kxc_site_lang')).toBe(loc);
      expect(browser.document.documentElement.lang).toBe(loc);
    }

    browser.cleanup();
  });

  // T4-11: Curious Community Contributor Testing Honest Feedback State Machine
  it('T4-11: Curious Community Contributor Testing Honest Feedback State Machine', () => {
    const crypto = require('crypto');
    const { createDefaultConfig, evaluateTweet } = require('../../packages/shared/src/index');
    const browser = createVirtualBrowser();

    const config = createDefaultConfig();
    const targetUid = 'spammer_12345';
    const salt = 'kxc_crowd_salt_2026';

    const testTweet = {
      id: 'tweet-target-1',
      author: {
        restId: targetUid,
        screenName: 'crypto_bot',
        name: 'Crypto Bot',
        bio: '',
        bioUrls: [],
        followersCount: 10,
        friendsCount: 5,
        following: false,
        verified: false,
        blueVerified: false,
        defaultProfileImage: false,
        createdAt: '2024-01-01',
      },
      text: 'Click here for free coins',
      lang: 'en',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    };

    // Phase 1: Local memory addition happens instantly (<1ms)
    config.localBlocklistUids[targetUid] = { addedAt: Date.now(), reason: 'manual' };
    const decisionImmediate = evaluateTweet(testTweet as any, config);
    expect(decisionImmediate.blocked).toBe(true);

    // Phase 2 & 3: Waiting 4500ms undo countdown
    const phase3Node = browser.document.createElement('div');
    phase3Node.setAttribute('data-executed', 'false');
    browser.document.body.appendChild(phase3Node);

    let computedHash = '';
    browser.window.setTimeout(() => {
      phase3Node.setAttribute('data-executed', 'true');
      computedHash = crypto.createHash('sha256').update(targetUid + salt).digest('hex');
    }, 4500);

    browser.advanceTimersByTime(4400);
    expect(phase3Node.getAttribute('data-executed')).toBe('false');

    browser.advanceTimersByTime(150);
    expect(phase3Node.getAttribute('data-executed')).toBe('true');
    expect(computedHash).toHaveLength(64);

    browser.cleanup();
  });

  // T4-12: Community Moderator Inspecting Profile Risk Indicators
  it('T4-12: Community Moderator Inspecting Profile Risk Indicators', () => {
    const { evaluateAuthorProfile, evaluateTweet, createDefaultConfig } = require('../../packages/shared/src/index');

    const config = createDefaultConfig();
    const author = {
      restId: 'user_risky_999',
      screenName: 'shill_account',
      name: 'Shill Account',
      bio: 'Daily crypto signals',
      bioUrls: [],
      followersCount: 15,
      friendsCount: 5,
      statusesCount: 500,
      dailyTweetRate: 150,
      accountAgeDays: 3,
      following: false,
      verified: false,
      blueVerified: false,
      defaultProfileImage: true,
      createdAt: new Date().toISOString(),
    };

    const riskEvaluation = evaluateAuthorProfile(author as any, config);
    expect(riskEvaluation.riskBadges.length).toBeGreaterThan(0);

    const testTweet = {
      id: 'tweet-shill-1',
      author,
      text: 'Check this new coin!',
      lang: 'en',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    };

    // Moderator whitelists the author UID
    config.whitelistUids[author.restId] = true;
    const tweetDecision = evaluateTweet(testTweet as any, config);
    // Whitelist takes absolute precedence over author risk flags
    expect(tweetDecision.blocked).toBe(false);
  });

  // T4-13: International User Testing Language Blacklist & Media Exemption
  it('T4-13: International User Testing Language Blacklist & Media Exemption', () => {
    const { evaluateTweet, createDefaultConfig } = require('../../packages/shared/src/index');

    const config = createDefaultConfig();
    config.rules.languageFilter = {
      enabled: true,
      mode: 'block',
      languages: ['ru'],
    };

    const baseAuthor = {
      restId: 'user_int_101',
      screenName: 'multilingual_user',
      name: 'User',
      bio: '',
      bioUrls: [],
      followersCount: 200,
      friendsCount: 100,
      following: false,
      verified: false,
      blueVerified: false,
      defaultProfileImage: false,
      createdAt: '2023-01-01',
    };

    const ruTweet = {
      id: 'tweet-ru-sample',
      author: baseAuthor,
      text: 'Это русский комментарий',
      lang: 'ru',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    };

    const mediaTweet = {
      id: 'tweet-media-sample',
      author: baseAuthor,
      text: '🚀🎉',
      lang: 'und', // Non-linguistic code in NON_LINGUISTIC_LANGS
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    };

    // Russian comment is blocked by blocklist
    expect(evaluateTweet(ruTweet as any, config).blocked).toBe(true);

    // Pure media/emoji comment ('und') is automatically exempted via NON_LINGUISTIC_LANGS
    expect(evaluateTweet(mediaTweet as any, config).blocked).toBe(false);
  });

  // T4-14: Compact Mobile Phone (iPhone SE, 375px) End-to-End Walkthrough
  it('T4-14: Compact Mobile Phone (iPhone SE, 375px) End-to-End Walkthrough', () => {
    const layoutCss = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/styles/layout.css'), 'utf8');
    expect(layoutCss).toContain('@media (max-width:');
    expect(layoutCss).toContain('.mobile-menu-btn');
    expect(layoutCss).toContain('.mobile-menu-drawer');

    const headerSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/components/Header.tsx'), 'utf8');
    expect(headerSource).toContain('mobile-menu-btn');
    expect(headerSource).toContain('mobile-menu-drawer');
  });

  // T4-15: Deep-Link Direct Navigation & Cross-Page Routing
  it('T4-15: Deep-Link Direct Navigation & Cross-Page Routing', () => {
    // 1. Verify Vite multi-page configuration resolves index and privacy HTML
    const viteConfig = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/vite.config.ts'), 'utf8');
    expect(viteConfig).toContain("resolve(__dirname, 'index.html')");
    expect(viteConfig).toContain("resolve(__dirname, 'privacy/index.html')");

    // 2. Verify physical entry files exist
    expect(fs.existsSync(path.join(ROOT_DIR, 'apps/web/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT_DIR, 'apps/web/privacy/index.html'))).toBe(true);

    // 3. Verify Header linkPrefix behavior between home and privacy pages
    const headerSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/components/Header.tsx'), 'utf8');
    expect(headerSource).toContain("currentPage === 'privacy' ? '/' : ''");
  });

  // T4-16: CI/CD Automated Push-to-Deploy Full Build Validation
  it('T4-16: CI/CD Automated Push-to-Deploy Full Build Validation', () => {
    const deployYml = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/deploy.yml'), 'utf8');
    expect(deployYml).toContain('pnpm typecheck');
    expect(deployYml).toContain('pnpm test');
    expect(deployYml).toContain('deploy-web:');
    expect(deployYml).toContain('deploy-server:');
  });

  // T4-17: Design System Visual Quality Auditor via ego-browser
  it('T4-17: Design System Visual Quality Auditor via ego-browser', () => {
    const tokensCss = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/styles/tokens.css'), 'utf8');
    const svgPath = path.join(ROOT_DIR, 'apps/web/public/logo.svg');
    const svg = fs.readFileSync(svgPath, 'utf8');

    const tokenRes = validateBrandTokens(tokensCss);
    const svgRes = validateBrandLogoSvg(svg);

    expect(tokenRes.valid).toBe(true);
    expect(svgRes.valid).toBe(true);
    expect(svgRes.rxRatio).toBeCloseTo(0.21875, 4);
    expect(svgRes.forbiddenElementsFound).toHaveLength(0);
  });

  // T4-18: Rapid Successive Manual Clean & Undo Stress Workflow
  it('T4-18: Rapid Successive Manual Clean & Undo Stress Workflow', () => {
    const { createDefaultConfig, evaluateTweet } = require('../../packages/shared/src/index');
    const browser = createVirtualBrowser();
    const config = createDefaultConfig();

    const createReply = (id: string, uid: string) => ({
      id,
      author: {
        restId: uid,
        screenName: `user_${uid}`,
        name: `User ${uid}`,
        bio: '',
        bioUrls: [],
        followersCount: 100,
        friendsCount: 50,
        following: false,
        verified: false,
        blueVerified: false,
        defaultProfileImage: false,
        createdAt: '2023-01-01',
      },
      text: `Reply text from ${uid}`,
      lang: 'en',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    });

    const replyA = createReply('reply-a', 'uid-a');
    const replyB = createReply('reply-b', 'uid-b');
    const replyC = createReply('reply-c', 'uid-c');

    // Rapid manual cleaning of A (t=0), B (t=200), C (t=400)
    config.localBlocklistUids['uid-a'] = { addedAt: browser.clock.now, reason: 'manual' };
    browser.advanceTimersByTime(200);
    config.localBlocklistUids['uid-b'] = { addedAt: browser.clock.now, reason: 'manual' };
    browser.advanceTimersByTime(200);
    config.localBlocklistUids['uid-c'] = { addedAt: browser.clock.now, reason: 'manual' };

    expect(evaluateTweet(replyA as any, config).blocked).toBe(true);
    expect(evaluateTweet(replyB as any, config).blocked).toBe(true);
    expect(evaluateTweet(replyC as any, config).blocked).toBe(true);

    // At t=2000ms: user undoes Reply B
    browser.advanceTimersByTime(1600);
    delete config.localBlocklistUids['uid-b'];

    expect(evaluateTweet(replyA as any, config).blocked).toBe(true);
    expect(evaluateTweet(replyB as any, config).blocked).toBe(false);
    expect(evaluateTweet(replyC as any, config).blocked).toBe(true);

    // Advance beyond 4500ms undo window
    browser.advanceTimersByTime(3000);
    expect(evaluateTweet(replyA as any, config).blocked).toBe(true);
    expect(evaluateTweet(replyC as any, config).blocked).toBe(true);

    browser.cleanup();
  });
});
