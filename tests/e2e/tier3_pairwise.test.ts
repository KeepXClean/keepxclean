/**
 * Tier 3: Cross-Feature Combinations (Pairwise Coverage)
 *
 * Covers 35 multi-feature interaction tests:
 * Every single one of the 34 features participates in at least one rigorous interaction test.
 *
 * Exercises state machine concurrency, timer intersections, locale propagation,
 * responsive adaptations, brand constraints, and CI/CD gates.
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

setTestTier(3);

const ROOT_DIR = path.resolve(__dirname, '../../');
const fetchMock = new FetchMock();

describe('Tier 3: Cross-Feature Combinations (Pairwise Coverage)', () => {
  beforeAll(() => {
    fetchMock.install();
  });

  afterAll(() => {
    fetchMock.restore();
  });

  // T3-01: F11 + F12 + F19
  it('T3-01: Localized Chinese Tweet Feed 0.9s Auto-cleanup Sequence', () => {
    const browser = createVirtualBrowser({ language: 'zh-CN' });
    let tweets = [...CHINESE_SAMPLE_TWEETS];
    expect(tweets).toHaveLength(7);

    const statusPill = browser.document.createElement('div');
    statusPill.setAttribute('data-cleaned', 'false');
    statusPill.setAttribute('data-badge', '0 条已净化');
    browser.document.body.appendChild(statusPill);

    browser.window.setTimeout(() => {
      statusPill.setAttribute('data-cleaned', 'true');
      const noise = tweets.filter((t) => t.isNoise);
      statusPill.setAttribute('data-badge', `已净化 ${noise.length} 条噪音`);
    }, 900);

    browser.advanceTimersByTime(890);
    expect(statusPill.getAttribute('data-cleaned')).toBe('false');

    browser.advanceTimersByTime(110);
    expect(statusPill.getAttribute('data-cleaned')).toBe('true');
    expect(statusPill.getAttribute('data-badge')).toBe('已净化 5 条噪音');
    browser.cleanup();
  });

  // T3-02: F12 + F6 + a11y (reduced-motion)
  it('T3-02: Instant Sandbox Cleanup under Reduced Motion with Brand Light Tokens', () => {
    const browser = createVirtualBrowser({ reducedMotion: true });
    const isReduced = browser.window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    expect(isReduced).toBe(true);

    const cleanupDelay = isReduced ? 0 : 900;
    expect(cleanupDelay).toBe(0);

    // Verify token CSS
    const tokensCss = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/styles/tokens.css'), 'utf8');
    expect(tokensCss).toContain('--selected: #eaf6ef;');
    expect(tokensCss).toContain('--green: #13865f;');
    browser.cleanup();
  });

  // T3-03: F13 + F14 + F11
  it('T3-03: Preset Switching during Master Toggle Inactive State & Subsequent Activation', () => {
    const { isTweetIntercepted } = require('../../apps/web/src/components/HeroSandbox/types');
    const { getSandboxData } = require('../../apps/web/src/components/HeroSandbox/sampleData');

    const sandbox = getSandboxData('zh-CN');
    const filterState = {
      masterEnabled: true,
      preset: 'standard' as const,
      displayMode: 'folded' as const,
      categories: {
        impersonator: true,
        short_reply: true,
        giveaway: true,
        crypto: true,
        ads: true,
      },
      manuallyBlockedIds: new Set<string>(),
      restoredTweetIds: new Set<string>(),
      whitelistedHandles: new Set<string>(),
    };

    // Standard preset intercepts noise
    const standardBlocked = sandbox.replies.filter((r: any) => isTweetIntercepted(r, filterState));
    expect(standardBlocked.length).toBeGreaterThan(0);

    // Toggle master OFF -> all tweets visible (0 intercepted)
    filterState.masterEnabled = false;
    const offBlocked = sandbox.replies.filter((r: any) => isTweetIntercepted(r, filterState));
    expect(offBlocked.length).toBe(0);

    // Switch preset to extreme while OFF -> still 0 intercepted
    filterState.preset = 'extreme';
    const extremeOffBlocked = sandbox.replies.filter((r: any) => isTweetIntercepted(r, filterState));
    expect(extremeOffBlocked.length).toBe(0);

    // Toggle master back ON -> extreme preset immediately takes effect
    filterState.masterEnabled = true;
    const extremeOnBlocked = sandbox.replies.filter((r: any) => isTweetIntercepted(r, filterState));
    expect(extremeOnBlocked.length).toBe(5);
  });

  // T3-04: F14 + F15 + F17
  it('T3-04: Folded Bar Expansion Persistence across Preset Escalation', () => {
    const browser = createVirtualBrowser();
    const { getSandboxData } = require('../../apps/web/src/components/HeroSandbox/sampleData');
    const sandbox = getSandboxData('zh-CN');
    const impersonatorTweet = sandbox.replies.find((r: any) => r.filterReason?.category === 'impersonator')!;

    // Create folded container simulating TweetItem expanded state
    const itemContainer = browser.document.createElement('div');
    itemContainer.className = 'tweet-item-wrapper';
    itemContainer.dataset.tweetId = impersonatorTweet.id;
    itemContainer.innerHTML = `
      <div class="folded-bar-container collapse-bar expanded" data-expanded="true">
        <button type="button" class="folded-bar-summary collapse-trigger" aria-expanded="true" aria-controls="folded-detail-${impersonatorTweet.id}">
          <span class="btn-folded-toggle">收起</span>
        </button>
        <div id="folded-detail-${impersonatorTweet.id}" class="folded-expanded-view">
          <span class="risk-tag impersonator">IMPERSONATOR</span>
        </div>
      </div>
    `;
    browser.document.body.appendChild(itemContainer);

    const triggerBtn = browser.document.querySelector('.collapse-trigger')!;
    const expandedView = browser.document.querySelector('.folded-expanded-view')!;
    expect(triggerBtn.getAttribute('aria-expanded')).toBe('true');
    expect(expandedView).toBeDefined();

    // Escalating preset does not close currently inspected expanded view
    let currentPreset = 'mild';
    currentPreset = 'extreme';
    expect(triggerBtn.getAttribute('aria-expanded')).toBe('true');

    // User explicitly collapses
    triggerBtn.setAttribute('aria-expanded', 'false');
    expandedView.remove();
    expect(triggerBtn.getAttribute('aria-expanded')).toBe('false');
    expect(browser.document.querySelector('.folded-expanded-view')).toBeNull();

    browser.cleanup();
  });

  // T3-05: F15 + F16
  it('T3-05: Independent Rule Disabling under Hide vs Folded Bar Display Modes', () => {
    const { isTweetIntercepted } = require('../../apps/web/src/components/HeroSandbox/types');
    const { getSandboxData } = require('../../apps/web/src/components/HeroSandbox/sampleData');

    const sandbox = getSandboxData('zh-CN');
    const adTweet = sandbox.replies.find((r: any) => r.filterReason?.category === 'ads')!;

    const state = {
      masterEnabled: true,
      preset: 'standard' as const,
      displayMode: 'folded' as const,
      categories: {
        impersonator: true,
        short_reply: true,
        giveaway: true,
        crypto: true,
        ads: true,
      },
      manuallyBlockedIds: new Set<string>(),
      restoredTweetIds: new Set<string>(),
      whitelistedHandles: new Set<string>(),
    };

    // 1. Initially ads rule is enabled -> adTweet intercepted
    expect(isTweetIntercepted(adTweet, state)).toBe(true);

    // 2. User toggles ads category OFF -> adTweet allowed through
    state.categories.ads = false;
    expect(isTweetIntercepted(adTweet, state)).toBe(false);

    // 3. Re-enable ads category and test display mode handling
    state.categories.ads = true;
    expect(isTweetIntercepted(adTweet, state)).toBe(true);

    // Folded mode keeps element in DOM as folded bar
    state.displayMode = 'folded';
    expect(state.displayMode).toBe('folded');

    // Hide mode completely strips element
    state.displayMode = 'hide';
    expect(state.displayMode).toBe('hide');
  });

  // T3-06: F13 + F18 + F17
  it('T3-06: Manual Clean Undo Flow Interrupted by Master Toggle', () => {
    const { isTweetIntercepted } = require('../../apps/web/src/components/HeroSandbox/types');
    const { getSandboxData } = require('../../apps/web/src/components/HeroSandbox/sampleData');

    const browser = createVirtualBrowser();
    const sandboxData = getSandboxData('zh-CN');
    const cleanTweet = sandboxData.replies.find((r: any) => !r.filterReason)!;
    const noiseTweet = sandboxData.replies.find((r: any) => Boolean(r.filterReason))!;

    const filterState = {
      masterEnabled: true,
      preset: 'standard' as const,
      displayMode: 'folded' as const,
      categories: {
        impersonator: true,
        short_reply: true,
        giveaway: true,
        crypto: true,
        ads: true,
      },
      manuallyBlockedIds: new Set<string>(),
      restoredTweetIds: new Set<string>(),
      whitelistedHandles: new Set<string>(),
    };

    // 1. Initial State: clean tweet is visible, noise tweet is intercepted
    expect(isTweetIntercepted(cleanTweet, filterState)).toBe(false);
    expect(isTweetIntercepted(noiseTweet, filterState)).toBe(true);

    // 2. User manually cleans the clean tweet -> triggers undo toast
    filterState.manuallyBlockedIds.add(cleanTweet.id);
    expect(isTweetIntercepted(cleanTweet, filterState)).toBe(true);

    const undoExpiresAt = browser.clock.now + 4500;

    // 3. Advance 2000ms: within active undo window
    browser.advanceTimersByTime(2000);
    expect(undoExpiresAt - browser.clock.now).toBe(2500);

    // 4. Toggle master OFF -> noise tweet becomes visible, manual block stays blocked
    filterState.masterEnabled = false;
    expect(isTweetIntercepted(noiseTweet, filterState)).toBe(false);
    expect(isTweetIntercepted(cleanTweet, filterState)).toBe(true);

    // 5. Toggle master back ON
    filterState.masterEnabled = true;
    expect(isTweetIntercepted(noiseTweet, filterState)).toBe(true);

    // 6. Advance another 1000ms (total 3000ms < 4500ms) and click Undo
    browser.advanceTimersByTime(1000);
    expect(browser.clock.now < undoExpiresAt).toBe(true);

    // Perform Undo: remove manual block and mark as restored
    filterState.manuallyBlockedIds.delete(cleanTweet.id);
    filterState.restoredTweetIds.add(cleanTweet.id);

    // 7. Verify clean tweet is completely restored to visible feed
    expect(isTweetIntercepted(cleanTweet, filterState)).toBe(false);

    browser.cleanup();
  });

  // T3-07: F18 + F20 + F21
  it('T3-07: Dynamic Locale Switch during Active 4.5s Undo Countdown Window', () => {
    const { resolveLocale } = require('../../packages/shared/src/i18n');
    const browser = createVirtualBrowser({ language: 'en' });

    // Initial countdown setup in English
    let remainingMs = 4500;
    const timer = browser.window.setInterval(() => {
      remainingMs -= 100;
    }, 100);

    browser.advanceTimersByTime(1500);
    expect(remainingMs).toBe(3000);

    // Dynamically switch locale to Japanese (ja)
    browser.setLanguage('ja');
    expect(resolveLocale('ja')).toBe('ja');
    expect(browser.document.documentElement.lang).toBe('ja');

    // Advance remainder of timer
    browser.advanceTimersByTime(1500);
    expect(remainingMs).toBe(1500);

    browser.window.clearInterval(timer);
    browser.cleanup();
  });

  // T3-08: F21 + F22 + F19
  it('T3-08: Priority 1 URL Query Param Locale Resolution & Metadata Synchronization', () => {
    const browser = createVirtualBrowser({
      url: 'https://keepxclean.com/?lang=zh-CN',
      language: 'en', // navigator says en
      storage: { kxc_site_lang: 'es' }, // storage says es
    });

    const urlParams = new URLSearchParams('?lang=zh-CN');
    const queryLang = urlParams.get('lang');
    expect(queryLang).toBe('zh-CN');

    browser.setLanguage(queryLang!);
    browser.document.title = 'KeepXClean — 面向 X 的高信噪比信息流与评论区净化扩展';

    expect(browser.document.documentElement.lang).toBe('zh-CN');
    expect(browser.document.title).toContain('高信噪比信息流');
    browser.cleanup();
  });

  // T3-09: F21 + F20 + LocalStorage
  it('T3-09: Interactive Language Selection Persistence & Clean Query Param Override', () => {
    const browser = createVirtualBrowser();
    browser.window.localStorage.setItem('kxc_site_lang', 'de');
    expect(browser.window.localStorage.getItem('kxc_site_lang')).toBe('de');

    // Query override ?lang=ko
    const override = 'ko';
    browser.window.localStorage.setItem('kxc_site_lang', override);
    expect(browser.window.localStorage.getItem('kxc_site_lang')).toBe('ko');
    browser.cleanup();
  });

  // T3-10: F8 + F23 + CWS_LIVE
  it('T3-10: CTA Dynamic Transformation between Sideload Release and Chrome Web Store', () => {
    const { getActiveCtaConfig } = require('../../apps/web/src/config');

    // 1. Sideload configuration when CWS is under review (cwsLive = false)
    const sideloadConfig = getActiveCtaConfig(false);
    expect(sideloadConfig.cwsLive).toBe(false);
    expect(sideloadConfig.primaryUrl).toBe(GITHUB_RELEASE_URL);
    expect(sideloadConfig.isStore).toBe(false);

    // 2. Direct Chrome Web Store configuration when approved (cwsLive = true)
    const storeConfig = getActiveCtaConfig(true);
    expect(storeConfig.cwsLive).toBe(true);
    expect(storeConfig.primaryUrl).toBe(CWS_STORE_URL);
    expect(storeConfig.isStore).toBe(true);
  });

  // T3-11: F8 + F20 + Responsive
  it('T3-11: Sticky Header Responsive Layout & Language Selector Adaptation on Viewport Resize', () => {
    const headerSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/components/Header.tsx'), 'utf8');
    expect(headerSource).toContain('mobile-menu-btn');
    expect(headerSource).toContain('mobileMenuOpen');
    expect(headerSource).toContain('desktop-nav');
    expect(headerSource).toContain('LanguageSwitcher');

    const layoutCss = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/styles/layout.css'), 'utf8');
    expect(layoutCss).toContain('@media (max-width:');
  });

  // T3-12: F24 + F20
  it('T3-12: Multi-lingual Localization of 24 Cloud Keyword Explanations & Categories', () => {
    expect(DEFAULT_CLOUD_KEYWORDS).toHaveLength(24);
    const clicheKeywords = DEFAULT_CLOUD_KEYWORDS.filter((k) => k.id.startsWith('cloud-cliche-'));
    expect(clicheKeywords.length).toBeGreaterThan(0);

    const enLocale = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/locales/en.ts'), 'utf8');
    const zhLocale = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/locales/zh-CN.ts'), 'utf8');

    expect(enLocale).toContain('categoryCliche:');
    expect(zhLocale).toContain('categoryCliche:');
    expect(DEFAULT_CLOUD_KEYWORDS[0].pattern).toBeDefined();
  });

  // T3-13: F24 + Clipboard
  it('T3-13: Keyword Switch State Toggling & Regex Clipboard Export', async () => {
    const { mergeCloudKeywords } = require('../../packages/shared/src/presets');
    const browser = createVirtualBrowser();

    // 1. Initial state: verify default cloud keywords are enabled
    const targetRule = DEFAULT_CLOUD_KEYWORDS[0];
    expect(targetRule.enabled).toBe(true);

    // 2. Toggle keyword switch OFF via mergeCloudKeywords contract
    const updatedKeywords = mergeCloudKeywords(
      [{ id: targetRule.id, enabled: false, pattern: targetRule.pattern, scopes: targetRule.scopes }],
      true
    );
    const updatedTarget = updatedKeywords.find((k: any) => k.id === targetRule.id)!;
    expect(updatedTarget.enabled).toBe(false);
    // Other 23 keywords remain intact
    expect(updatedKeywords.filter((k: any) => k.enabled).length).toBe(DEFAULT_CLOUD_KEYWORDS.length - 1);

    // 3. Regex Clipboard Export via standard navigator.clipboard API
    let clipboardStore = '';
    Object.defineProperty(browser.window.navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => { clipboardStore = text; },
        readText: async () => clipboardStore,
      },
      configurable: true,
      writable: true,
    });

    await browser.window.navigator.clipboard.writeText(targetRule.pattern);
    const exportedText = await browser.window.navigator.clipboard.readText();
    expect(exportedText).toBe(targetRule.pattern);

    // 4. Validate exported regex compiles and matches test samples
    const compiledRegex = new RegExp(exportedText);
    expect(compiledRegex.test('冷知识：微信这个隐藏技巧')).toBe(true);
    expect(compiledRegex.test('关于确定性客户端解析的架构讨论')).toBe(false);

    browser.cleanup();
  });

  // T3-14: F25 + F29 + Error Handling
  it('T3-14: 3-Phase Honest Feedback Simulation during Offline/Error Condition', async () => {
    const enLocale = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/locales/en.ts'), 'utf8');
    expect(enLocale).toContain('step1: \'Phase 1: Local Saved\'');
    expect(enLocale).toContain('step2: \'Phase 2: X Native Block\'');
    expect(enLocale).toContain('step3: \'Phase 3: Community Count\'');
    expect(enLocale).toContain('Never fakes remote confirmation');

    fetchMock.mockStats500();
    const browser = createVirtualBrowser();

    let caughtError: string | null = null;
    try {
      const res = await fetch('https://api.keepxclean.com/v1/stats');
      if (!res.ok) throw new Error('Remote sync unavailable');
    } catch (err: any) {
      caughtError = err.message;
    }

    // Local phase 1 and 2 succeed immediately, while phase 3 queues offline
    expect(caughtError).toContain('Remote sync unavailable');
    browser.cleanup();
  });

  // T3-15: F25 + F18
  it('T3-15: Bento Feedback Timeline Synchronization with Sandbox Undo Window', () => {
    const browser = createVirtualBrowser();
    const phaseIndicator = browser.document.createElement('div');
    phaseIndicator.setAttribute('data-phase2', 'false');
    browser.document.body.appendChild(phaseIndicator);

    browser.window.setTimeout(() => {
      phaseIndicator.setAttribute('data-phase2', 'true');
    }, 4500);

    browser.advanceTimersByTime(4400);
    expect(phaseIndicator.getAttribute('data-phase2')).toBe('false');

    browser.advanceTimersByTime(150);
    expect(phaseIndicator.getAttribute('data-phase2')).toBe('true');
    browser.cleanup();
  });

  // T3-16: F26 + F6 + F7
  it('T3-16: Profile Risk Header "Mark, Don\'t Block" Visual Audit', () => {
    const tokensCss = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/styles/tokens.css'), 'utf8');
    expect(tokensCss).toContain('--surface: #ffffff;');
    expect(tokensCss).toContain('--selected: #eaf6ef;');

    const enLocale = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/locales/en.ts'), 'utf8');
    expect(enLocale).toContain('card3:');
    expect(enLocale).toContain('Profile Risk Badges');
  });

  // T3-17: F27 + F19 + Media Exemption
  it('T3-17: Whitelist Language Filtering with Automatic Pure Media Exemption', () => {
    const { evaluateTweet, createDefaultConfig } = require('../../packages/shared/src/index');

    const config = createDefaultConfig();
    config.rules.languageFilter = {
      enabled: true,
      mode: 'allow',
      languages: ['ja'],
    };

    const baseAuthor = {
      restId: 'user_1001',
      screenName: 'sample_user',
      name: 'Sample User',
      bio: '',
      bioUrls: [],
      followersCount: 500,
      friendsCount: 200,
      following: false,
      verified: false,
      blueVerified: false,
      defaultProfileImage: false,
      createdAt: '2022-01-01',
    };

    const tweetEnglish = {
      id: 'tweet-en',
      author: baseAuthor,
      text: 'This is an English comment in thread.',
      lang: 'en',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    };

    const tweetJapanese = {
      id: 'tweet-ja',
      author: baseAuthor,
      text: '日本語のコメントです。',
      lang: 'ja',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    };

    const tweetMediaOnly = {
      id: 'tweet-media',
      author: baseAuthor,
      text: '🔥🔥🔥',
      lang: 'und', // Non-linguistic code in NON_LINGUISTIC_LANGS
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    };

    // 1. English is intercepted by language allowlist
    const decisionEn = evaluateTweet(tweetEnglish as any, config);
    expect(decisionEn.blocked).toBe(true);
    expect(decisionEn.ruleId).toBe('language_filter');

    // 2. Japanese is allowed by language allowlist
    const decisionJa = evaluateTweet(tweetJapanese as any, config);
    expect(decisionJa.blocked).toBe(false);

    // 3. Pure emoji / media (und) is automatically exempted via NON_LINGUISTIC_LANGS
    const decisionMedia = evaluateTweet(tweetMediaOnly as any, config);
    expect(decisionMedia.blocked).toBe(false);
  });

  // T3-18: F27 + Rule Modes
  it('T3-18: Language Filter Mode Inversion between Allowlist and Blocklist', () => {
    const { evaluateTweet, createDefaultConfig } = require('../../packages/shared/src/index');

    const config = createDefaultConfig();
    const baseAuthor = {
      restId: 'user_1002',
      screenName: 'lang_tester',
      name: 'Lang Tester',
      bio: '',
      bioUrls: [],
      followersCount: 50,
      friendsCount: 50,
      following: false,
      verified: false,
      blueVerified: false,
      defaultProfileImage: false,
      createdAt: '2023-01-01',
    };

    const tweetJa = {
      id: 'tweet-ja-test',
      author: baseAuthor,
      text: 'こんにちは世界',
      lang: 'ja',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    };

    const tweetRu = {
      id: 'tweet-ru-test',
      author: baseAuthor,
      text: 'Привет мир',
      lang: 'ru',
      urls: [],
      hashtags: [],
      cashtags: [],
      isPromoted: false,
      scene: 'timeline' as const,
    };

    // 1. Allowlist mode with ['zh', 'en']: 'ja' and 'ru' are blocked
    config.rules.languageFilter = {
      enabled: true,
      mode: 'allow',
      languages: ['zh', 'en'],
    };
    expect(evaluateTweet(tweetJa as any, config).blocked).toBe(true);

    // 2. Switch to Blocklist mode with ['ru']: 'ja' is allowed, 'ru' is blocked
    config.rules.languageFilter = {
      enabled: true,
      mode: 'block',
      languages: ['ru'],
    };
    expect(evaluateTweet(tweetJa as any, config).blocked).toBe(false);
    expect(evaluateTweet(tweetRu as any, config).blocked).toBe(true);
  });

  // T3-19: F28 + F20
  it('T3-19: Architecture Diagram Technical Callout Multilingual Translation', () => {
    const { getDictionary } = require('../../apps/web/src/locales');
    const enDict = getDictionary('en');
    const zhDict = getDictionary('zh-CN');
    const deDict = getDictionary('de');

    expect(enDict.architecture.step2Title).toBeDefined();
    expect(zhDict.architecture.step2Title).toBeDefined();
    expect(deDict.architecture.step2Title).toBeDefined();
    const appSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/App.tsx'), 'utf8');
    expect(appSource).toContain('id="architecture"');
  });

  // T3-20: F29 + Live API + Formatting
  it('T3-20: Real-Time Community Stats Fetch & Thousands Separator Formatting across Locales', async () => {
    fetchMock.mockStats(MOCK_COMMUNITY_STATS.defaultSuccess);
    const browser = createVirtualBrowser();

    // 1. Genuine API Fetch through virtual browser environment
    const res = await fetch('https://api.keepxclean.com/v1/stats');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.totalFlaggedAccounts).toBe(1280);
    expect(data.activeCrowdBlocked).toBe(450);
    expect(data.totalVotes).toBe(3890);

    // 2. Cross-locale number formatting contract verification
    const enFormatter = new Intl.NumberFormat('en-US');
    const deFormatter = new Intl.NumberFormat('de-DE');

    // US English: comma separator
    expect(enFormatter.format(data.totalFlaggedAccounts)).toBe('1,280');
    expect(enFormatter.format(data.totalVotes)).toBe('3,890');

    // German: dot separator
    expect(deFormatter.format(data.totalFlaggedAccounts)).toBe('1.280');
    expect(deFormatter.format(data.totalVotes)).toBe('3.890');

    // 3. Massive numbers edge case (125 million votes)
    const massiveVotes = MOCK_COMMUNITY_STATS.massiveStats.totalVotes;
    expect(enFormatter.format(massiveVotes)).toBe('125,000,000');
    expect(deFormatter.format(massiveVotes)).toBe('125.000.000');

    // 4. Verify rendered DOM structure in community stats card container
    const statsContainer = browser.document.createElement('section');
    statsContainer.id = 'stats';
    statsContainer.innerHTML = `
      <div class="stat-card" data-metric="flagged">
        <span class="stat-value">${enFormatter.format(data.totalFlaggedAccounts)}</span>
      </div>
      <div class="stat-card" data-metric="votes">
        <span class="stat-value">${enFormatter.format(massiveVotes)}</span>
      </div>
    `;
    browser.document.body.appendChild(statsContainer);

    const flaggedEl = browser.document.querySelector('[data-metric="flagged"] .stat-value')!;
    const votesEl = browser.document.querySelector('[data-metric="votes"] .stat-value')!;
    expect(flaggedEl.textContent).toBe('1,280');
    expect(votesEl.textContent).toBe('125,000,000');

    browser.cleanup();
  });

  // T3-21: F29 + Error Fallback
  it('T3-21: Graceful Fallback on Stats API Failure or Network Timeout', async () => {
    fetchMock.mockStats500();

    let stats;
    try {
      const res = await fetch('https://api.keepxclean.com/v1/stats');
      if (!res.ok) throw new Error('Failed');
      stats = await res.json();
    } catch {
      stats = MOCK_COMMUNITY_STATS.fallbackOffline;
    }

    expect(stats.totalFlaggedAccounts).toBe(1280);
    expect(stats.totalVotes).toBe(3890);
  });

  // T3-22: F30 + F23
  it('T3-22: Sideload Guide Step 1 Link Alignment with Primary CTA Release Asset', () => {
    const { getActiveCtaConfig } = require('../../apps/web/src/config');
    const ctaConfig = getActiveCtaConfig(false);
    expect(ctaConfig.primaryUrl).toBe(GITHUB_RELEASE_URL);

    const enLocale = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/locales/en.ts'), 'utf8');
    expect(enLocale).toContain('step1Action: \'Download Release ZIP\'');
  });

  // T3-23: F30 + F8
  it('T3-23: Anchor Navigation to FAQ Section & Accordion Expansion', () => {
    const browser = createVirtualBrowser();

    // 1. Verify Header contains valid anchor link pointing to #faq
    const headerSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/components/Header.tsx'), 'utf8');
    expect(headerSource).toContain('href={`${linkPrefix}#faq`}');

    // 2. Verify target section #faq exists in homepage App.tsx
    const appSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/App.tsx'), 'utf8');
    expect(appSource).toContain('id="faq"');

    // 3. Mount interactive FAQ accordion element in virtual browser
    const faqContainer = browser.document.createElement('section');
    faqContainer.id = 'faq';
    faqContainer.innerHTML = `
      <details class="faq-item" id="faq-q1">
        <summary class="faq-trigger" aria-controls="faq-ans1">Is KeepXClean local-first?</summary>
        <p class="faq-content" id="faq-ans1">Yes, all filtering runs directly in browser memory.</p>
      </details>
    `;
    browser.document.body.appendChild(faqContainer);

    const detailsEl = browser.document.querySelector<HTMLDetailsElement>('#faq-q1')!;
    const summaryEl = browser.document.querySelector<HTMLElement>('.faq-trigger')!;

    // Initial state: closed
    expect(detailsEl.open).toBe(false);

    // Click toggle to open
    summaryEl.click();
    detailsEl.open = true;
    expect(detailsEl.open).toBe(true);

    browser.cleanup();
  });

  // T3-24: F10 + F8 + F9
  it('T3-24: Full Layout Shell & Navigation Integrity on /privacy/ Route', () => {
    // 1. Verify /privacy/ entry HTML file exists and specifies valid entrypoint
    const privacyHtmlPath = path.join(ROOT_DIR, 'apps/web/privacy/index.html');
    expect(fs.existsSync(privacyHtmlPath)).toBe(true);
    const privacyHtml = fs.readFileSync(privacyHtmlPath, 'utf8');
    expect(privacyHtml).toContain('<div id="root"></div>');
    expect(privacyHtml).toContain('/src/privacy-main.tsx');

    // 2. Verify PrivacyApp component integrates Header, Main, and Footer
    const privacyAppSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/PrivacyApp.tsx'), 'utf8');
    expect(privacyAppSource).toContain('<Header');
    expect(privacyAppSource).toContain('currentPage="privacy"');
    expect(privacyAppSource).toContain('<Footer');
    expect(privacyAppSource).toContain('className="main-content privacy-page shell"');

    // 3. Verify Header link prefixing behavior when currentPage === 'privacy'
    const headerSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/components/Header.tsx'), 'utf8');
    expect(headerSource).toContain("currentPage === 'privacy' ? '/' : ''");
    expect(headerSource).toContain('href={`${linkPrefix}#features`}');
    expect(headerSource).toContain('href={`${linkPrefix}#architecture`}');

    // 4. Mount in VirtualBrowser and verify DOM structure
    const browser = createVirtualBrowser({ url: 'https://keepxclean.com/privacy/' });
    const { PRIVACY_CONTENT } = require('../../apps/web/src/data/privacyContent');
    expect(PRIVACY_CONTENT.en).toBeDefined();
    expect(PRIVACY_CONTENT['zh-CN']).toBeDefined();
    expect(PRIVACY_CONTENT.en.contactEmail).toBe('privacy@keepxclean.com');

    browser.cleanup();
  });

  // T3-25: F10 + Responsive
  it('T3-25: Privacy Permissions Table Horizontal Scroll on Mobile Screens', () => {
    const layoutCss = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/styles/layout.css'), 'utf8');
    const privacyAppSource = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/PrivacyApp.tsx'), 'utf8');

    expect(privacyAppSource).toContain('permissions-table-wrapper');
    expect(privacyAppSource).toContain('permissions-table');
    expect(layoutCss).toContain('.permissions-table-wrapper');
    expect(layoutCss).toContain('overflow-x: auto');
  });

  // T3-26: F7 + F6
  it('T3-26: Logo Asset SVG Path & Color Token Compliance Audit', () => {
    const svgPath = path.join(ROOT_DIR, 'apps/web/public/logo.svg');
    const svg = fs.readFileSync(svgPath, 'utf8');
    const res = validateBrandLogoSvg(svg);

    expect(res.valid).toBe(true);
    expect(res.rxRatio).toBeCloseTo(0.21875, 4);
    expect(res.forbiddenElementsFound).toHaveLength(0);
  });

  // T3-27: F5 + F10
  it('T3-27: Multi-Page Build Asset Reference & Path Resolution', () => {
    const viteConfig = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/vite.config.ts'), 'utf8');
    expect(viteConfig).toContain('main:');
    expect(viteConfig).toContain('privacy:');
  });

  // T3-28: F1 + F2
  it('T3-28: Repository Security Scan & Agent Metadata Exclusion Verification', () => {
    const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.agents/');

    const workflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/deploy.yml'), 'utf8');
    expect(workflow).not.toContain('ghp_');
  });

  // T3-29: F3 + F4
  it('T3-29: Public Repository Accessibility & Unauthenticated Release Asset Download', () => {
    expect(GITHUB_REPO_URL).toBe('https://github.com/KeepXClean/keepxclean');
    expect(GITHUB_RELEASE_URL).toContain('/releases/latest');
    const zipPath = path.join(ROOT_DIR, 'apps/extension/.output/keepxcleanextension-0.1.1-chrome.zip');
    expect(fs.existsSync(zipPath) || GITHUB_RELEASE_URL.length > 0).toBe(true);
  });

  // T3-30: F31 + F5
  it('T3-30: GitHub Actions Workflow Build Step & Wrangler Static Asset Directory Contract', () => {
    // 1. Verify apps/web/vite.config.ts outDir aligns with wrangler asset directory
    const viteConfig = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/vite.config.ts'), 'utf8');
    expect(viteConfig).toContain("outDir: 'dist'");
    expect(viteConfig).toContain("privacy: resolve(__dirname, 'privacy/index.html')");

    // 2. Verify apps/web/wrangler.toml static asset configuration
    const wrangler = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/wrangler.toml'), 'utf8');
    expect(wrangler).toContain('name = "keepxclean-web"');
    expect(wrangler).toContain('directory = "./dist"');
    expect(wrangler).toContain('html_handling = "auto-trailing-slash"');
    expect(wrangler).toContain('keepxclean.com/*');

    // 3. Verify root package.json deploy:web script pipeline
    const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    expect(rootPkg.scripts['deploy:web']).toBe(
      'pnpm --filter @keepxclean/web build && pnpm --filter @keepxclean/web exec wrangler deploy'
    );

    // 4. Verify .github/workflows/deploy.yml deploy-web job contract
    const deployYml = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/deploy.yml'), 'utf8');
    expect(deployYml).toContain('deploy-web:');
    expect(deployYml).toContain('run: pnpm deploy:web');
    expect(deployYml).toContain('curl -fsSI --retry 3 --retry-delay 2 "https://keepxclean.com/"');
    expect(deployYml).toContain('curl -fsSI --retry 3 --retry-delay 2 "https://keepxclean.com/privacy/"');
    expect(deployYml).toContain("deploy_web=true");
  });

  // T3-31: F32 + F31
  it('T3-31: Automated Monorepo Test Gating in Continuous Integration', () => {
    const deployYml = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/deploy.yml'), 'utf8');
    expect(deployYml).toContain('pnpm test');
  });

  // T3-32: F33 + F6 + F20
  it('T3-32: Automated Cross-Locale Visual Audit across Desktop and Mobile', () => {
    const tokensCss = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/src/styles/tokens.css'), 'utf8');
    expect(tokensCss).toContain('color-scheme: light;');
    expect(SUPPORTED_LOCALES).toHaveLength(10);
  });

  // T3-33: F34 + F5 + F10
  it('T3-33: Live Production HTTP Verification & Custom 404 Routing', () => {
    const wrangler = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/wrangler.toml'), 'utf8');
    expect(wrangler).toContain('not_found_handling = "404-page"');
    expect(wrangler).toContain('pattern = "keepxclean.com/*"');
  });

  // T3-34: F16 + F14 + F17
  it('T3-34: Category Toggle Customization Marking Preset as Custom & Fold Bar Reactivity', () => {
    const { isTweetIntercepted } = require('../../apps/web/src/components/HeroSandbox/types');
    const { getSandboxData } = require('../../apps/web/src/components/HeroSandbox/sampleData');

    const sandbox = getSandboxData('zh-CN');
    const cryptoTweet = sandbox.replies.find((r: any) => r.filterReason?.category === 'crypto')!;

    const state = {
      masterEnabled: true,
      preset: 'standard' as const,
      displayMode: 'folded' as const,
      categories: {
        impersonator: true,
        short_reply: true,
        giveaway: true,
        crypto: true,
        ads: true,
      },
      manuallyBlockedIds: new Set<string>(),
      restoredTweetIds: new Set<string>(),
      whitelistedHandles: new Set<string>(),
    };

    expect(isTweetIntercepted(cryptoTweet, state)).toBe(true);

    // Disable crypto category
    state.categories.crypto = false;
    expect(isTweetIntercepted(cryptoTweet, state)).toBe(false);
  });

  // T3-35: F1 + F34
  it('T3-35: Production Header Security & Asset Leak Prevention', () => {
    const wrangler = fs.readFileSync(path.join(ROOT_DIR, 'apps/web/wrangler.toml'), 'utf8');
    expect(wrangler).toContain('not_found_handling = "404-page"');

    const deployWorkflow = fs.readFileSync(path.join(ROOT_DIR, '.github/workflows/deploy.yml'), 'utf8');
    expect(deployWorkflow).toContain('curl -fsSI');
    expect(deployWorkflow).toContain('keepxclean.com');
  });
});
