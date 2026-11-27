#!/usr/bin/env tsx
/**
 * Real Chromium MV3 Extension Browser E2E Suite (KeepXClean v0.2.0)
 *
 * Verifies built Chrome & Firefox MV3 manifests and runs the built Chrome extension
 * (`apps/extension/.output/chrome-mv3`) in real headless Chromium (`--headless=new`),
 * covering all 4 preserved baseline smoke flows plus all 7 KeepXClean v0.2.0 scenarios:
 *
 * 0. Scenario 7: Chrome & Firefox MV3 manifest pre-flight (`v0.2.0`, strict `['alarms','storage']`, Gecko ID).
 * 1. Flow 1: MV3 Service Worker boot & `extensionId`.
 * 2. Scenario 1 + Flow 2: Fresh-install zero auto-tabs, privacy defaults (`false`), Popup header master
 *    switch persistence, Onboarding Card 3-step controls + dismissal persistence across reload.
 * 3. Flow 3: All 5 Options routes (`rules`, `keywords`, `accounts`, `history`, `preferences`) & light/dark theme toggle.
 * 4. Flow 4: Simulated `https://x.com/home` MAIN GraphQL `fetch` + ISOLATED Shadow DOM collapse/expand.
 * 5. Scenario 2: `@grok` official protection (>400/day) + `strict` short `@grok` summon filtering & OP/followed exemptions.
 * 6. Scenario 3: Collapse-bar "Adjust rule" deep-link (`#/keywords?focus=...`) + one-click "Disable this item" live restore.
 * 7. Scenario 4: Offline `.kxc-pack.json` (`kxc-pack-v1`) rule pack preview import, toggle, and clean uninstall.
 * 8. Scenario 5: `#/history` per-rule breakdown click-to-filter, 7-day trend & local Canvas 2D Battle Report PNG (zero PII).
 * 9. Scenario 6: Parse Health self-check (5× 0-tweet over 18s), redacted diagnostic copy & live auto-recovery.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import {
  assert,
  buildBrokenHomeTimelinePayload,
  buildMockHomeTimelinePayload,
  buildMockTweetDetailPayload,
  buildMockTweetEntry,
  buildMockXHtml,
  buildValidRulePackV1,
  clickCollapseActionButton,
  closeExtensionPages,
  findCollapseActionButton,
  getStorageLocal,
  hasOnboardingCard,
  hasSevenDayTrendChart,
  hasVisibleHealthBanner,
  importRulePackViaUi,
  installCanvasTextSpy,
  installClipboardSpy,
  installNegativeOffsetClock,
  locateBattleReportButton,
  locateHealthBanner,
  locateInstalledPackContainer,
  locateOnboardingCard,
  locateRuleBreakdownBar,
  locateRulePacksTab,
  sendKxcCommand,
  setClockOffsetMs,
  sleep,
  verifyBattleReportCanvas,
  verifyBuiltManifests,
  waitForFocusedKeywordRow,
  waitForMainConfigSync,
  waitForStorageLocalInWorker,
  type KxcE2eWindow,
  type StoredFilterConfig,
  type StoredInterceptionLogEntry,
  type StoredParseHealthState,
  type StoredStats,
} from './v020-helpers';

const ROOT_DIR = path.resolve(__dirname, '../..');
const EXT_DIR = path.join(ROOT_DIR, 'apps/extension/.output/chrome-mv3');

function resolveChromeExecutable(): string {
  const pwChromium = (() => {
    try {
      return chromium.executablePath();
    } catch {
      return undefined;
    }
  })();
  const candidates = [
    process.env.CHROME_PATH,
    pwChromium,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No Chromium executable found. Run "pnpm exec playwright-core install chromium" or set CHROME_PATH.`
  );
}

function attachErrorCollector(page: Page, label: string): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    errors.push(`[${label}:pageerror] ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore expected network errors from offline/blocked remote API calls in isolated smoke test
      if (
        text.includes('keepxclean.com') ||
        text.includes('ERR_FAILED') ||
        text.includes('ERR_INTERNET_DISCONNECTED') ||
        text.includes('ERR_NAME_NOT_RESOLVED')
      ) {
        return;
      }
      errors.push(`[${label}:console.error] ${text}`);
    }
  });
  return errors;
}

function buildMockGraphqlTimeline() {
  return buildMockHomeTimelinePayload([
    buildMockTweetEntry({
      restId: '1900000000000000001',
      authorRestId: '9100000001',
      screenName: 'spam_giveaway_bot',
      name: 'Free AI Giveaway',
      description: 'Check onlyfans.com/spam_demo',
      createdAt: 'Mon Jan 01 00:00:00 +0000 2024',
      statusesCount: 500,
      followersCount: 42,
      friendsCount: 200,
      following: false,
      defaultProfileImage: false,
      text: 'Comment "AI" and I will DM you the secret bundle! Must be following me to receive.',
    }),
    buildMockTweetEntry({
      restId: '1900000000000000002',
      authorRestId: '9100000002',
      screenName: 'legit_builder',
      name: 'Legit Builder',
      description: 'Systems engineer writing open-source tools.',
      createdAt: 'Mon Jan 01 00:00:00 +0000 2020',
      statusesCount: 350,
      followersCount: 1800,
      friendsCount: 240,
      following: false,
      defaultProfileImage: false,
      text: 'Shipping a small performance improvement to our local SQLite indexer today.',
    }),
  ]);
}

const MOCK_X_HOME_HTML = buildMockXHtml([
  {
    cellId: 'cell-spam',
    screenName: 'spam_giveaway_bot',
    displayName: 'Free AI Giveaway',
    tweetId: '1900000000000000001',
    text: 'Comment "AI" and I will DM you the secret bundle!',
    timeLabel: '1m',
  },
  {
    cellId: 'cell-clean',
    screenName: 'legit_builder',
    displayName: 'Legit Builder',
    tweetId: '1900000000000000002',
    text: 'Shipping a small performance improvement to our local SQLite indexer today.',
    timeLabel: '2m',
  },
]);

function snapshotPersonalLists(cfg: StoredFilterConfig | undefined) {
  return {
    keywordIds: (cfg?.rules?.keywords?.items ?? []).map((item) => item.id).sort(),
    domainIds: (cfg?.rules?.domainFilter?.items ?? []).map((item) => item.id).sort(),
    blockedUids: Object.keys(cfg?.localBlocklistUids ?? {}).sort(),
  };
}

async function run() {
  // 0. Scenario 7 — Pre-flight Chrome & Firefox MV3 Manifest Verification (BEFORE launching Chromium)
  const verifiedManifests = verifyBuiltManifests(ROOT_DIR);
  console.log(
    `[browser-e2e] ✓ Scenario 7: Chrome & Firefox MV3 manifests verified (version=${verifiedManifests.version}, permissions=["alarms","storage"])`
  );

  const executablePath = resolveChromeExecutable();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kxc-chrome-e2e-'));
  let context: BrowserContext | undefined;

  console.log(`[browser-e2e] Chrome: ${executablePath}`);
  console.log(`[browser-e2e] Extension: ${EXT_DIR}`);

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: true,
      locale: 'en-US',
      args: [
        '--headless=new',
        '--lang=en-US',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        `--disable-extensions-except=${EXT_DIR}`,
        `--load-extension=${EXT_DIR}`,
      ],
    });

    // Block external keepxclean API sync during local smoke test so tests stay deterministic & fast
    await context.route('https://*.keepxclean.com/**', (route) =>
      route.abort('blockedbyclient')
    );

    // 1. Existing Flow 1 — Wait for MV3 Service Worker
    let worker = context.serviceWorkers()[0];
    if (!worker) {
      worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
    }
    const match = worker.url().match(/^chrome-extension:\/\/([^/]+)\//);
    assert(match, `Unexpected service worker URL: ${worker.url()}`);
    const extensionId = match[1];
    console.log(`[browser-e2e] ✓ Flow 1: Service worker booted (id=${extensionId})`);

    // 2. Scenario 1 + Existing Flow 2 — Fresh-install zero auto-tabs, privacy defaults,
    //    Popup header master toggle persistence, and Onboarding Card 3-step controls + dismissal
    const initialConfig = await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) => cfg !== undefined && typeof cfg === 'object',
      10_000,
      'fresh-install kxc_filter_config_v1 initialization'
    );
    assert(initialConfig, 'Expected kxc_filter_config_v1 to be initialized on fresh install');

    // Confirm zero auto-opened extension tabs on fresh install
    await sleep(400);
    const autoOpenedExtPages = context
      .pages()
      .filter((p) => p.url().startsWith('chrome-extension://'));
    assert(
      autoOpenedExtPages.length === 0,
      `Expected zero auto-opened extension tabs on fresh install, found: ${autoOpenedExtPages.map((p) => p.url()).join(', ')}`
    );

    // Strict fresh-install privacy & onboarding defaults
    assert(
      initialConfig.onboardingDismissed === false,
      `Expected fresh-install onboardingDismissed === false, got ${String(initialConfig.onboardingDismissed)}`
    );
    assert(
      initialConfig.syncNativeXBlock === false,
      `Expected fresh-install syncNativeXBlock === false, got ${String(initialConfig.syncNativeXBlock)}`
    );
    assert(
      initialConfig.enableCrowdReport === false,
      `Expected fresh-install enableCrowdReport === false, got ${String(initialConfig.enableCrowdReport)}`
    );

    const popupPage = await context.newPage();
    const popupErrors = attachErrorCollector(popupPage, 'popup');
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });
    await popupPage.waitForSelector('.kxc-root', { timeout: 10_000 });

    // Existing Flow 2 — Verify header owns .locator('button[role="switch"]').first() & persists OFF/ON
    const switchEl = popupPage.locator('button[role="switch"]').first();
    await switchEl.waitFor({ state: 'visible', timeout: 10_000 });
    const headerSwitchMeta = await popupPage.evaluate(() => {
      const firstSwitch = document.querySelector('button[role="switch"]');
      return {
        inPopupHeader: firstSwitch?.closest('.popup-header') !== null,
        ariaLabel: firstSwitch?.getAttribute('aria-label') ?? null,
        ariaChecked: firstSwitch?.getAttribute('aria-checked') ?? null,
      };
    });
    assert(
      headerSwitchMeta.inPopupHeader,
      'Expected first button[role="switch"] in Popup to reside inside .popup-header'
    );
    assert(
      headerSwitchMeta.ariaLabel === 'Enable filtering',
      `Expected header switch aria-label="Enable filtering", got ${JSON.stringify(headerSwitchMeta.ariaLabel)}`
    );
    assert(
      headerSwitchMeta.ariaChecked === 'true',
      `Expected master switch to start enabled, got ${String(headerSwitchMeta.ariaChecked)}`
    );

    await switchEl.click();
    await popupPage.waitForFunction(
      () =>
        document
          .querySelector('button[role="switch"]')
          ?.getAttribute('aria-checked') === 'false',
      { timeout: 5_000 }
    );
    const storedAfterOff = (
      await getStorageLocal<StoredFilterConfig>(popupPage, 'kxc_filter_config_v1')
    )?.enabled;
    assert(storedAfterOff === false, 'Expected chrome.storage.local enabled=false after toggle');

    await switchEl.click();
    await popupPage.waitForFunction(
      () =>
        document
          .querySelector('button[role="switch"]')
          ?.getAttribute('aria-checked') === 'true',
      { timeout: 5_000 }
    );

    // Scenario 1 — Verify Onboarding Card inside .popup-body with all 3 step controls wired to storage
    const onboardingCard = await locateOnboardingCard(popupPage);
    assert(await onboardingCard.isVisible(), 'Expected Onboarding Card to be visible in .popup-body');

    const cardLightBtn = onboardingCard.getByRole('button', { name: /light/i }).first();
    const cardBalancedBtn = onboardingCard
      .getByRole('button', { name: /balanced|standard/i })
      .first();
    const cardStrictBtn = onboardingCard.getByRole('button', { name: /strict/i }).first();
    const cardCollapseBtn = onboardingCard.getByRole('button', { name: /collapse/i }).first();
    const cardHideBtn = onboardingCard.getByRole('button', { name: /hide|strip/i }).first();
    const cardImportControl = onboardingCard
      .getByRole('button', { name: /import/i })
      .or(onboardingCard.getByRole('link', { name: /import/i }))
      .first();

    await cardLightBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await cardBalancedBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await cardStrictBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await cardCollapseBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await cardHideBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await cardImportControl.waitFor({ state: 'visible', timeout: 5_000 });

    // Prove card preset buttons are wired directly to storage (`light` -> `standard`)
    await cardLightBtn.click();
    await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) => cfg?.preset === 'light',
      5_000,
      'onboarding card Light preset click'
    );
    await cardBalancedBtn.click();
    const configAfterOnboardingPreset = await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) => cfg?.preset === 'standard',
      5_000,
      'onboarding card Balanced preset click'
    );
    assert(
      configAfterOnboardingPreset?.syncNativeXBlock === false &&
        configAfterOnboardingPreset?.enableCrowdReport === false,
      'Privacy flags syncNativeXBlock & enableCrowdReport must remain false during onboarding'
    );

    // Dismiss onboarding card and verify persistence across reload
    const dismissBtn = onboardingCard
      .locator('[data-kxc-onboarding-dismiss]')
      .or(onboardingCard.getByRole('button', { name: /dismiss|skip|got it|done|close|finish/i }))
      .first();
    await dismissBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await dismissBtn.click();

    await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) => cfg?.onboardingDismissed === true,
      5_000,
      'onboardingDismissed === true after clicking dismiss'
    );
    const hideDeadline = Date.now() + 5_000;
    while (Date.now() < hideDeadline && (await hasOnboardingCard(popupPage))) {
      await sleep(50);
    }
    assert(
      !(await hasOnboardingCard(popupPage)),
      'Onboarding card should disappear from Popup after dismissal'
    );

    await popupPage.reload({ waitUntil: 'domcontentloaded' });
    await popupPage.waitForSelector('.kxc-root', { timeout: 10_000 });
    await popupPage.locator('.popup-header button[role="switch"]').first().waitFor({
      state: 'visible',
      timeout: 10_000,
    });
    assert(
      !(await hasOnboardingCard(popupPage)),
      'Onboarding card must remain absent after Popup reload'
    );
    const persistedAfterReload = await getStorageLocal<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1'
    );
    assert(
      persistedAfterReload?.onboardingDismissed === true,
      'Expected onboardingDismissed === true to persist across Popup reload'
    );
    assert(popupErrors.length === 0, `Popup errors: ${popupErrors.join('; ')}`);
    await popupPage.close();
    console.log(
      '[browser-e2e] ✓ Scenario 1 + Flow 2: Fresh-install defaults, Popup header switch, and Onboarding Card verified'
    );

    // 3. Existing Flow 3 — Options pages smoke check across all 5 routes + theme switching
    const optionsPage = await context.newPage();
    const optionsErrors = attachErrorCollector(optionsPage, 'options');
    const routes = ['rules', 'keywords', 'accounts', 'history', 'preferences'];
    for (const route of routes) {
      await optionsPage.goto(`chrome-extension://${extensionId}/options.html#/${route}`, {
        waitUntil: 'domcontentloaded',
      });
      await optionsPage.waitForSelector('.kxc-root', { timeout: 10_000 });
      await optionsPage.waitForFunction(
        () => (document.body.textContent ?? '').trim().length > 40,
        { timeout: 10_000 }
      );
    }

    const initialTheme = await optionsPage.evaluate(
      () => document.documentElement.dataset.theme
    );
    assert(initialTheme === 'light', `Expected default light theme, got ${String(initialTheme)}`);

    await sendKxcCommand(optionsPage, { type: 'config.patch', patch: { theme: 'dark' } });
    await optionsPage.waitForFunction(
      () => document.documentElement.dataset.theme === 'dark',
      { timeout: 5_000 }
    );
    await sendKxcCommand(optionsPage, { type: 'config.patch', patch: { theme: 'light' } });
    await optionsPage.waitForFunction(
      () => document.documentElement.dataset.theme === 'light',
      { timeout: 5_000 }
    );
    assert(optionsErrors.length === 0, `Options errors: ${optionsErrors.join('; ')}`);
    await optionsPage.close();
    console.log(
      '[browser-e2e] ✓ Flow 3: All 5 options routes render cleanly and support live theme switching'
    );

    // 4. Existing Flow 4 — Simulated x.com/home MAIN GraphQL + ISOLATED Shadow DOM collapse/expand
    const xPage = await context.newPage();
    const xErrors = attachErrorCollector(xPage, 'x.com');

    await xPage.route('https://x.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/i/api/graphql/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(buildMockGraphqlTimeline()),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: MOCK_X_HOME_HTML,
      });
    });

    await xPage.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await waitForMainConfigSync(
      xPage,
      (cfg) => cfg.enabled === true,
      10_000,
      'Flow 4 x.com MAIN/ISOLATED sync'
    );

    const fetchOk = await xPage.evaluate(async () => {
      const res = await fetch('https://x.com/i/api/graphql/mockHash/HomeTimeline');
      return res.ok;
    });
    assert(fetchOk, 'Simulated GraphQL fetch should succeed');

    await xPage.waitForFunction(
      () => {
        const spamCell = document.getElementById('cell-spam');
        const spamArticle = spamCell?.querySelector('article[data-testid="tweet"]');
        const collapseHost = spamCell?.querySelector('kxc-inline[data-kxc-kind="collapse"]');
        return (
          spamArticle?.getAttribute('data-kxc-hidden') === 'true' &&
          Boolean(collapseHost?.shadowRoot?.textContent?.trim())
        );
      },
      { timeout: 10_000 }
    );

    const domState = await xPage.evaluate(() => {
      const spamArticle = document.querySelector('#cell-spam article[data-testid="tweet"]');
      const cleanArticle = document.querySelector('#cell-clean article[data-testid="tweet"]');
      const collapseHost = document.querySelector('#cell-spam kxc-inline[data-kxc-kind="collapse"]');
      return {
        spamHidden: spamArticle?.getAttribute('data-kxc-hidden'),
        cleanHidden: cleanArticle?.getAttribute('data-kxc-hidden'),
        collapseText: collapseHost?.shadowRoot?.textContent ?? '',
      };
    });

    assert(domState.spamHidden === 'true', 'Spam tweet should be hidden in collapse mode');
    assert(domState.cleanHidden === null, 'Clean tweet must remain visible');
    assert(
      domState.collapseText.includes('spam_giveaway_bot'),
      `Collapse bar should identify @spam_giveaway_bot, got: ${domState.collapseText}`
    );

    await xPage.evaluate(() => {
      const collapseHost = document.querySelector('#cell-spam kxc-inline[data-kxc-kind="collapse"]');
      const btn = collapseHost?.shadowRoot?.querySelector('button');
      if (!btn) throw new Error('Expand button not found in collapse Shadow DOM');
      btn.click();
    });
    await xPage.waitForFunction(
      () => {
        const spamArticle = document.querySelector('#cell-spam article[data-testid="tweet"]');
        return (
          spamArticle?.getAttribute('data-kxc-hidden') === null &&
          spamArticle?.getAttribute('data-kxc-expanded') === 'true'
        );
      },
      { timeout: 5_000 }
    );

    assert(xErrors.length === 0, `Simulated x.com errors: ${xErrors.join('; ')}`);
    await xPage.close();
    console.log(
      '[browser-e2e] ✓ Flow 4: MAIN GraphQL interceptor + ISOLATED Shadow DOM collapse/expand verified'
    );

    // 5. Scenario 2 — @grok Official Protection (>400/day) + strict Short @grok Summon Filtering
    const grokRpcPage = await context.newPage();
    const grokRpcErrors = attachErrorCollector(grokRpcPage, 'grok-rpc');
    await grokRpcPage.goto(`chrome-extension://${extensionId}/options.html#/rules`, {
      waitUntil: 'domcontentloaded',
    });
    await grokRpcPage.waitForSelector('.kxc-root', { timeout: 10_000 });
    await sendKxcCommand(grokRpcPage, { type: 'config.preset', preset: 'strict' });
    await sendKxcCommand(grokRpcPage, {
      type: 'config.patch',
      patch: { enabled: true, interceptionMode: 'collapse', exemptFollowing: true },
    });
    await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) => cfg?.preset === 'strict' && cfg?.enabled === true,
      5_000,
      'strict preset activation for Scenario 2'
    );

    const grokThreadPayload = buildMockTweetDetailPayload([
      buildMockTweetEntry({
        restId: '1000',
        authorRestId: '2001',
        screenName: 'alice',
        name: 'Alice Dev',
        description: 'Distributed systems researcher.',
        createdAt: 'Mon Jan 01 00:00:00 +0000 2020',
        statusesCount: 1000,
        followersCount: 5000,
        friendsCount: 250,
        following: false,
        text: 'What are the key differences between Chrome MV3 and Firefox MV3 service workers?',
      }),
      buildMockTweetEntry({
        restId: '1001',
        authorRestId: '1720665183188922368',
        screenName: 'grok',
        name: 'Grok',
        description: 'Official Grok AI assistant.',
        createdAt: 'Mon Jan 01 00:00:00 +0000 2024',
        statusesCount: 500000,
        followersCount: 3000000,
        friendsCount: 10,
        following: false,
        inReplyToStatusId: '1000',
        inReplyToUserId: '2001',
        text: '@alice Here is a factual breakdown of how MV3 service workers handle messaging.',
      }),
      buildMockTweetEntry({
        restId: '1002',
        authorRestId: '9200000002',
        screenName: 'stranger_summoner',
        name: 'Random Reader One',
        description: 'Regular reader discussing software.',
        createdAt: 'Mon Jan 01 00:00:00 +0000 2020',
        statusesCount: 300,
        followersCount: 600,
        friendsCount: 200,
        following: false,
        inReplyToStatusId: '1000',
        inReplyToUserId: '2001',
        text: '@grok explain',
      }),
      buildMockTweetEntry({
        restId: '1005',
        authorRestId: '9200000005',
        screenName: 'stranger_summoner2',
        name: 'Random Reader Two',
        description: 'Regular reader discussing software.',
        createdAt: 'Mon Jan 01 00:00:00 +0000 2020',
        statusesCount: 300,
        followersCount: 600,
        friendsCount: 200,
        following: false,
        inReplyToStatusId: '1000',
        inReplyToUserId: '2001',
        text: '@grok explain this',
      }),
      buildMockTweetEntry({
        restId: '1003',
        authorRestId: '2001',
        screenName: 'alice',
        name: 'Alice Dev',
        description: 'Distributed systems researcher.',
        createdAt: 'Mon Jan 01 00:00:00 +0000 2020',
        statusesCount: 1000,
        followersCount: 5000,
        friendsCount: 250,
        following: false,
        inReplyToStatusId: '1000',
        inReplyToUserId: '2001',
        text: '@grok explain',
      }),
      buildMockTweetEntry({
        restId: '1004',
        authorRestId: '9200000004',
        screenName: 'trusted_friend',
        name: 'Trusted Friend',
        description: 'Long-time colleague working on browsers.',
        createdAt: 'Mon Jan 01 00:00:00 +0000 2020',
        statusesCount: 300,
        followersCount: 600,
        friendsCount: 200,
        following: true,
        inReplyToStatusId: '1000',
        inReplyToUserId: '2001',
        text: '@grok explain',
      }),
    ]);

    const grokThreadHtml = buildMockXHtml(
      [
        {
          cellId: 'cell-focal',
          screenName: 'alice',
          displayName: 'Alice Dev',
          tweetId: '1000',
          text: 'What are the key differences between Chrome MV3 and Firefox MV3 service workers?',
          timeLabel: '10m',
        },
        {
          cellId: 'cell-grok-official',
          screenName: 'grok',
          displayName: 'Grok',
          tweetId: '1001',
          text: '@alice Here is a factual breakdown of how MV3 service workers handle messaging.',
          timeLabel: '8m',
        },
        {
          cellId: 'cell-stranger-grok-short',
          screenName: 'stranger_summoner',
          displayName: 'Random Reader One',
          tweetId: '1002',
          text: '@grok explain',
          timeLabel: '6m',
        },
        {
          cellId: 'cell-stranger-grok-mid',
          screenName: 'stranger_summoner2',
          displayName: 'Random Reader Two',
          tweetId: '1005',
          text: '@grok explain this',
          timeLabel: '5m',
        },
        {
          cellId: 'cell-op-grok',
          screenName: 'alice',
          displayName: 'Alice Dev',
          tweetId: '1003',
          text: '@grok explain',
          timeLabel: '4m',
        },
        {
          cellId: 'cell-followed-grok',
          screenName: 'trusted_friend',
          displayName: 'Trusted Friend',
          tweetId: '1004',
          text: '@grok explain',
          timeLabel: '3m',
        },
      ],
      'Alice Dev on X'
    );

    const grokPage = await context.newPage();
    const grokErrors = attachErrorCollector(grokPage, 'x.com:grok');
    await grokPage.route('https://x.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/i/api/graphql/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(grokThreadPayload),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: grokThreadHtml,
      });
    });

    await grokPage.goto('https://x.com/alice/status/1000', { waitUntil: 'domcontentloaded' });
    await waitForMainConfigSync(
      grokPage,
      (cfg) => cfg.preset === 'strict',
      10_000,
      'Scenario 2 strict preset MAIN/ISOLATED sync'
    );

    const grokFetchOk = await grokPage.evaluate(async () => {
      const res = await fetch('https://x.com/i/api/graphql/mockHash/TweetDetail');
      return res.ok;
    });
    assert(grokFetchOk, 'Simulated TweetDetail GraphQL fetch should succeed');

    await grokPage.waitForFunction(
      () => {
        for (const id of ['cell-stranger-grok-short', 'cell-stranger-grok-mid']) {
          const cell = document.getElementById(id);
          const article = cell?.querySelector('article[data-testid="tweet"]');
          const host = cell?.querySelector('kxc-inline[data-kxc-kind="collapse"]');
          if (
            article?.getAttribute('data-kxc-hidden') !== 'true' ||
            !host?.shadowRoot?.textContent?.trim()
          ) {
            return false;
          }
        }
        return true;
      },
      { timeout: 10_000 }
    );

    const grokDomState = await grokPage.evaluate(() => {
      const cells: Record<string, { hidden: string | null; hasCollapseHost: boolean }> = {};
      const entries: ReadonlyArray<readonly [string, string]> = [
        ['focal', 'cell-focal'],
        ['officialGrok', 'cell-grok-official'],
        ['strangerShort', 'cell-stranger-grok-short'],
        ['strangerMid', 'cell-stranger-grok-mid'],
        ['opReply', 'cell-op-grok'],
        ['followedReply', 'cell-followed-grok'],
      ];
      for (const [key, id] of entries) {
        const cell = document.getElementById(id);
        const article = cell?.querySelector('article[data-testid="tweet"]');
        const host = cell?.querySelector('kxc-inline[data-kxc-kind="collapse"]');
        cells[key] = {
          hidden: article?.getAttribute('data-kxc-hidden') ?? null,
          hasCollapseHost: host !== null,
        };
      }
      return {
        focal: cells.focal,
        officialGrok: cells.officialGrok,
        strangerShort: cells.strangerShort,
        strangerMid: cells.strangerMid,
        opReply: cells.opReply,
        followedReply: cells.followedReply,
      };
    });

    assert(
      grokDomState.strangerShort.hidden === 'true' && grokDomState.strangerShort.hasCollapseHost,
      'Stranger "@grok explain" (1002) should be collapsed in strict mode'
    );
    assert(
      grokDomState.strangerMid.hidden === 'true' && grokDomState.strangerMid.hasCollapseHost,
      'Stranger "@grok explain this" (1005) should be collapsed in strict mode'
    );
    assert(
      grokDomState.officialGrok.hidden === null && !grokDomState.officialGrok.hasCollapseHost,
      'Official @grok reply (1001, >400/day) must be protected and untouched'
    );
    assert(
      grokDomState.opReply.hidden === null && !grokDomState.opReply.hasCollapseHost,
      'Thread OP @alice "@grok explain" (1003) must be exempt'
    );
    assert(
      grokDomState.followedReply.hidden === null && !grokDomState.followedReply.hasCollapseHost,
      'Followed author @trusted_friend "@grok explain" (1004) must be exempt'
    );
    assert(
      grokDomState.focal.hidden === null && !grokDomState.focal.hasCollapseHost,
      'Focal tweet (1000) must remain untouched'
    );

    // Poll kxc_interception_logs_v1 asynchronously persisted by SW for tweet 1005 -> grok_filter
    const grokLogs = await waitForStorageLocalInWorker<StoredInterceptionLogEntry[]>(
      worker,
      'kxc_interception_logs_v1',
      (logs) => Array.isArray(logs) && logs.some((entry) => entry.tweetId === '1005'),
      8_000,
      'kxc_interception_logs_v1 entry for tweet 1005'
    );
    const entry1005 = grokLogs?.find((entry) => entry.tweetId === '1005');
    assert(
      entry1005?.ruleId === 'grok_filter',
      `Expected tweet 1005 ("@grok explain this") to be attributed to ruleId="grok_filter", got ${JSON.stringify(entry1005)}`
    );

    // Reset preset back to standard before Scenario 3
    await sendKxcCommand(grokRpcPage, { type: 'config.preset', preset: 'standard' });
    await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) => cfg?.preset === 'standard',
      5_000,
      'reset preset to standard after Scenario 2'
    );
    assert(grokErrors.length === 0, `Scenario 2 x.com errors: ${grokErrors.join('; ')}`);
    assert(grokRpcErrors.length === 0, `Scenario 2 rpc errors: ${grokRpcErrors.join('; ')}`);
    await grokPage.close();
    await grokRpcPage.close();
    console.log(
      '[browser-e2e] ✓ Scenario 2: @grok official protection (>400/day) + strict short summon filtering verified'
    );

    // 6. Scenario 3 — Collapse-Bar "Adjust rule" Deep-Link & One-Click "Disable this item" Live Restore
    const kwSeedPage = await context.newPage();
    const kwSeedErrors = attachErrorCollector(kwSeedPage, 'kw-seed');
    await kwSeedPage.goto(`chrome-extension://${extensionId}/options.html#/keywords`, {
      waitUntil: 'domcontentloaded',
    });
    await kwSeedPage.waitForSelector('.kxc-root', { timeout: 10_000 });
    await sendKxcCommand(kwSeedPage, {
      type: 'keyword.save',
      item: {
        id: 'e2e-kw-disable-1',
        pattern: 'zorkflub-promo',
        isRegex: false,
        scopes: ['text'],
        note: 'E2E disable target',
        enabled: true,
      },
    });
    await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) =>
        Boolean(
          cfg?.rules?.keywords?.items?.some(
            (k) => k.id === 'e2e-kw-disable-1' && k.enabled === true
          )
        ),
      5_000,
      'custom keyword e2e-kw-disable-1 seeded'
    );
    assert(kwSeedErrors.length === 0, `Scenario 3 seed errors: ${kwSeedErrors.join('; ')}`);

    // Crucial: close ALL open chrome-extension:// tabs before clicking "Adjust rule"
    await closeExtensionPages(context, extensionId);

    const kwTimelinePayload = buildMockHomeTimelinePayload([
      buildMockTweetEntry({
        restId: '1900000000000000031',
        authorRestId: '9100000031',
        screenName: 'clean_kw_author',
        name: 'Clean Author',
        description: 'Software notes and architecture discussions.',
        createdAt: 'Mon Jan 01 00:00:00 +0000 2020',
        statusesCount: 350,
        followersCount: 1800,
        friendsCount: 240,
        following: false,
        defaultProfileImage: false,
        text: 'Testing zorkflub-promo live disable flow today.',
      }),
    ]);
    const kwHomeHtml = buildMockXHtml([
      {
        cellId: 'cell-kw-target',
        screenName: 'clean_kw_author',
        displayName: 'Clean Author',
        tweetId: '1900000000000000031',
        text: 'Testing zorkflub-promo live disable flow today.',
        timeLabel: '1m',
      },
    ]);

    const kwPage = await context.newPage();
    const kwErrors = attachErrorCollector(kwPage, 'x.com:kw-disable');
    await kwPage.route('https://x.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/i/api/graphql/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(kwTimelinePayload),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: kwHomeHtml,
      });
    });

    await kwPage.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await waitForMainConfigSync(
      kwPage,
      (cfg) =>
        Boolean(
          cfg.rules?.keywords?.items?.some((k) => k.id === 'e2e-kw-disable-1' && k.enabled)
        ),
      10_000,
      'Scenario 3 custom keyword MAIN/ISOLATED sync'
    );

    const kwFetchOk = await kwPage.evaluate(async () => {
      const res = await fetch('https://x.com/i/api/graphql/mockHash/HomeTimeline');
      return res.ok;
    });
    assert(kwFetchOk, 'Scenario 3 HomeTimeline GraphQL fetch should succeed');

    await kwPage.waitForFunction(
      () => {
        const cell = document.getElementById('cell-kw-target');
        const article = cell?.querySelector('article[data-testid="tweet"]');
        const host = cell?.querySelector('kxc-inline[data-kxc-kind="collapse"]');
        return (
          article?.getAttribute('data-kxc-hidden') === 'true' &&
          Boolean(host?.shadowRoot?.textContent?.trim())
        );
      },
      { timeout: 10_000 }
    );

    // Expand collapse bar in Shadow DOM and verify BOTH "Adjust rule" & "Disable this item" exist
    await kwPage.evaluate(() => {
      const host = document.querySelector('#cell-kw-target kxc-inline[data-kxc-kind="collapse"]');
      const trigger = host?.shadowRoot?.querySelector<HTMLButtonElement>('button');
      if (!trigger) throw new Error('Collapse expand trigger not found on #cell-kw-target');
      trigger.click();
    });
    await kwPage.waitForFunction(
      () => {
        const host = document.querySelector('#cell-kw-target kxc-inline[data-kxc-kind="collapse"]');
        return host?.shadowRoot?.querySelector('.collapse-bar[data-expanded="true"]') !== null;
      },
      { timeout: 5_000 }
    );

    const adjustBtnInfo = await findCollapseActionButton(kwPage, 'cell-kw-target', 'adjust');
    assert(
      adjustBtnInfo.found,
      `Expected "Adjust rule" button in .collapse-actions, found: ${JSON.stringify(adjustBtnInfo.availableLabels)}`
    );
    const disableBtnInfo = await findCollapseActionButton(kwPage, 'cell-kw-target', 'disable');
    assert(
      disableBtnInfo.found,
      `Expected "Disable this item" button in .collapse-actions, found: ${JSON.stringify(disableBtnInfo.availableLabels)}`
    );

    // Click "Adjust rule" -> capture deep-link Options page -> verify route, focus param, tab & highlight
    const [deepLinkPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 10_000 }),
      clickCollapseActionButton(kwPage, 'cell-kw-target', 'adjust'),
    ]);
    const deepLinkErrors = attachErrorCollector(deepLinkPage, 'options:deep-link');
    await deepLinkPage.waitForLoadState('domcontentloaded');
    await deepLinkPage.waitForSelector('.kxc-root', { timeout: 10_000 });

    const parsedDeepLink = new URL(deepLinkPage.url());
    const [deepRoute, deepQuery = ''] = parsedDeepLink.hash.split('?');
    const deepParams = new URLSearchParams(deepQuery);
    assert(
      deepRoute === '#/keywords',
      `Expected deep-link route "#/keywords", got ${JSON.stringify(deepLinkPage.url())}`
    );
    assert(
      deepParams.get('focus') === 'e2e-kw-disable-1',
      `Expected deep-link focus="e2e-kw-disable-1", got ${JSON.stringify(parsedDeepLink.hash)}`
    );
    const deepTab = deepParams.get('tab');
    assert(
      deepTab === 'custom' || deepTab === 'local',
      `Expected deep-link tab to be "custom" or "local", got ${JSON.stringify(deepTab)}`
    );

    // Poll immediately upon mount so transient highlight-pulse animations are captured cleanly
    const focusInfo = await waitForFocusedKeywordRow(
      deepLinkPage,
      'e2e-kw-disable-1',
      'zorkflub-promo',
      5_000
    );

    const selectedTabText =
      (await deepLinkPage.locator('button[role="tab"][aria-selected="true"]').first().textContent()) ??
      '';
    assert(
      /custom/i.test(selectedTabText),
      `Expected Custom tab to be selected on deep-link, got ${JSON.stringify(selectedTabText)}`
    );
    assert(deepLinkErrors.length === 0, `Deep-link Options errors: ${deepLinkErrors.join('; ')}`);
    await deepLinkPage.close();

    // Back on kwPage WITHOUT reload: click "Disable this item" -> live restore + storage disabled
    await clickCollapseActionButton(kwPage, 'cell-kw-target', 'disable');
    await kwPage.waitForFunction(
      () => {
        const article = document.querySelector('#cell-kw-target article[data-testid="tweet"]');
        const collapseHost = document.querySelector(
          '#cell-kw-target kxc-inline[data-kxc-kind="collapse"]'
        );
        return (
          article?.getAttribute('data-kxc-hidden') === null &&
          article?.getAttribute('data-kxc-expanded') === null &&
          collapseHost === null
        );
      },
      { timeout: 8_000 }
    );

    await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) =>
        cfg?.rules?.keywords?.items?.find((k) => k.id === 'e2e-kw-disable-1')?.enabled === false,
      5_000,
      'e2e-kw-disable-1 disabled in storage'
    );
    assert(kwErrors.length === 0, `Scenario 3 x.com errors: ${kwErrors.join('; ')}`);
    await kwPage.close();
    console.log(
      `[browser-e2e] ✓ Scenario 3: Collapse-bar "Adjust rule" deep-link (${focusInfo.signal}) + one-click live restore verified`
    );

    // 7. Scenario 4 — Offline .kxc-pack.json Rule Pack Lifecycle (#/keywords?tab=packs)
    const beforePackConfig = await getStorageLocal<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1'
    );
    const personalBefore = snapshotPersonalLists(beforePackConfig);
    const validPack = buildValidRulePackV1();
    const validPackJson = JSON.stringify(validPack, null, 2);

    const packsPage = await context.newPage();
    const packsErrors = attachErrorCollector(packsPage, 'options:packs');
    await packsPage.goto(`chrome-extension://${extensionId}/options.html#/keywords?tab=packs`, {
      waitUntil: 'domcontentloaded',
    });
    await packsPage.waitForSelector('.kxc-root', { timeout: 10_000 });
    await packsPage.locator('[role="tablist"] button[role="tab"]').first().waitFor({
      state: 'visible',
      timeout: 10_000,
    });

    const packsTab = await locateRulePacksTab(packsPage);
    const packsTabSelected = await packsTab.getAttribute('aria-selected');
    assert(
      packsTabSelected === 'true',
      `Expected Rule Packs tab to be auto-selected on #/keywords?tab=packs, got aria-selected=${String(packsTabSelected)}`
    );

    await importRulePackViaUi(packsPage, validPackJson, validPack.name);

    const afterImportConfig = await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) =>
        Boolean(cfg?.installedPacks?.some((p) => p.id === validPack.id && p.enabled === true)),
      8_000,
      `installedPacks contains ${validPack.id} enabled=true`
    );
    await packsPage.waitForFunction(
      (name: string) => (document.querySelector('main.page')?.textContent ?? '').includes(name),
      validPack.name,
      { timeout: 5_000 }
    );
    assert(
      ((await packsPage.locator('main.page').textContent()) ?? '').includes(validPack.name),
      `Expected installed rule pack "${validPack.name}" to appear in Packs tab`
    );

    // Strict zero personal-list pollution check
    const personalAfterImport = snapshotPersonalLists(afterImportConfig);
    assert(
      JSON.stringify(personalAfterImport) === JSON.stringify(personalBefore),
      `Rule pack import polluted personal lists! Before=${JSON.stringify(personalBefore)} After=${JSON.stringify(personalAfterImport)}`
    );
    assert(
      !personalAfterImport.keywordIds.includes('pack-kw-1') &&
        !personalAfterImport.domainIds.includes('pack-dom-1') &&
        !personalAfterImport.blockedUids.includes('999888777666'),
      'Rule pack items must stay isolated inside installedPacks'
    );

    // Toggle pack OFF -> ON via its switch inside installed pack container
    const packContainer = await locateInstalledPackContainer(
      packsPage,
      validPack.id,
      validPack.name
    );
    const packSwitch = packContainer.locator('button[role="switch"]').first();
    await packSwitch.waitFor({ state: 'visible', timeout: 5_000 });
    assert(
      (await packSwitch.getAttribute('aria-checked')) === 'true',
      'Expected newly installed rule pack switch to start checked'
    );

    await packSwitch.click();
    await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) => cfg?.installedPacks?.find((p) => p.id === validPack.id)?.enabled === false,
      5_000,
      'rule pack toggled OFF'
    );
    const toggleOffDeadline = Date.now() + 5_000;
    while (
      Date.now() < toggleOffDeadline &&
      (await packSwitch.getAttribute('aria-checked')) !== 'false'
    ) {
      await sleep(50);
    }
    assert(
      (await packSwitch.getAttribute('aria-checked')) === 'false',
      'Expected rule pack switch aria-checked="false" after toggling OFF'
    );

    await packSwitch.click();
    await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) => cfg?.installedPacks?.find((p) => p.id === validPack.id)?.enabled === true,
      5_000,
      'rule pack toggled ON'
    );
    const toggleOnDeadline = Date.now() + 5_000;
    while (
      Date.now() < toggleOnDeadline &&
      (await packSwitch.getAttribute('aria-checked')) !== 'true'
    ) {
      await sleep(50);
    }
    assert(
      (await packSwitch.getAttribute('aria-checked')) === 'true',
      'Expected rule pack switch aria-checked="true" after toggling ON'
    );

    // Uninstall cleanly and verify zero residue in UI & storage
    const uninstallBtn = packContainer
      .locator('[data-kxc-pack-uninstall]')
      .or(packContainer.getByRole('button', { name: /uninstall|remove|delete/i }))
      .first();
    await uninstallBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await uninstallBtn.click();

    const confirmDialog = packsPage.locator('dialog[open]').last();
    const hasConfirm = await confirmDialog
      .waitFor({ state: 'visible', timeout: 1_500 })
      .then(() => true)
      .catch(() => false);
    if (hasConfirm) {
      const dangerConfirm = confirmDialog.locator('.dialog-foot button.danger').first();
      const primaryConfirm = confirmDialog.locator('.dialog-foot button.primary').first();
      const textConfirm = confirmDialog
        .getByRole('button', { name: /uninstall|remove|delete|confirm/i })
        .first();
      if ((await dangerConfirm.count()) > 0) {
        await dangerConfirm.click();
      } else if ((await primaryConfirm.count()) > 0) {
        await primaryConfirm.click();
      } else {
        await textConfirm.click();
      }
      await confirmDialog.waitFor({ state: 'detached', timeout: 5_000 });
    }

    const afterUninstallConfig = await waitForStorageLocalInWorker<StoredFilterConfig>(
      worker,
      'kxc_filter_config_v1',
      (cfg) => !(cfg?.installedPacks ?? []).some((p) => p.id === validPack.id),
      8_000,
      `installedPacks removed ${validPack.id}`
    );
    await packsPage.waitForFunction(
      ({ packId, name }: { packId: string; name: string }) => {
        const main = document.querySelector('main.page');
        if (!main) return false;
        const escapedId =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(packId)
            : packId;
        if (
          main.querySelector(
            `[data-pack-id="${escapedId}"], [data-kxc-pack-id="${escapedId}"], [data-item-id="${escapedId}"], [data-e2e-pack-container="true"]`
          )
        ) {
          return false;
        }
        const clone = main.cloneNode(true) as HTMLElement;
        for (const banner of clone.querySelectorAll('.banner.success[role="status"]')) {
          if (/uninstall|remov|delet/i.test(banner.textContent ?? '')) {
            banner.remove();
          }
        }
        const remainingText = clone.textContent ?? '';
        return !remainingText.includes(name) && !remainingText.includes(packId);
      },
      { packId: validPack.id, name: validPack.name },
      { timeout: 5_000 }
    );
    const personalAfterUninstall = snapshotPersonalLists(afterUninstallConfig);
    assert(
      JSON.stringify(personalAfterUninstall) === JSON.stringify(personalBefore),
      `Personal lists changed after rule pack uninstall! Before=${JSON.stringify(personalBefore)} After=${JSON.stringify(personalAfterUninstall)}`
    );
    assert(packsErrors.length === 0, `Scenario 4 packs errors: ${packsErrors.join('; ')}`);
    await packsPage.close();
    console.log(
      '[browser-e2e] ✓ Scenario 4: Offline .kxc-pack.json preview import, toggle & clean uninstall verified'
    );

    // 8. Scenario 5 — #/history Per-Rule Breakdown Click-to-Filter + Local Canvas 2D Battle Report PNG
    const HISTORY_PII_CANARIES = [
      'secret_pii_handle_xyz',
      'Secret PII Display Name',
      '777666555444',
      'PRIVATE_SNIPPET_TOKEN_999',
    ] as const;

    const historyPage = await context.newPage();
    const historyErrors = attachErrorCollector(historyPage, 'options:history');
    await installCanvasTextSpy(historyPage);

    await historyPage.goto(`chrome-extension://${extensionId}/options.html#/rules`, {
      waitUntil: 'domcontentloaded',
    });
    await historyPage.waitForSelector('.kxc-root', { timeout: 10_000 });

    // Compute 8 unseen deterministic logs in browser local timezone (today / -1d local noon / -2d local noon)
    const seededLogs = await historyPage.evaluate((): StoredInterceptionLogEntry[] => {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const d = now.getDate();
      const tsToday = Date.now();
      const tsYesterday = new Date(y, m, d - 1, 12, 0, 0).getTime();
      const tsTwoDaysAgo = new Date(y, m, d - 2, 12, 0, 0).getTime();

      const specs: Array<{
        tweetId: string;
        ruleId: string;
        scene: 'timeline' | 'reply' | 'search' | 'profile';
        reasonText: string;
        timestamp: number;
      }> = [
        {
          tweetId: '9800000000000000001',
          ruleId: 'keyword',
          scene: 'timeline',
          reasonText: 'Matched custom keyword',
          timestamp: tsToday - 10,
        },
        {
          tweetId: '9800000000000000002',
          ruleId: 'keyword',
          scene: 'reply',
          reasonText: 'Matched custom keyword',
          timestamp: tsYesterday + 1_000,
        },
        {
          tweetId: '9800000000000000003',
          ruleId: 'keyword',
          scene: 'timeline',
          reasonText: 'Matched custom keyword',
          timestamp: tsTwoDaysAgo + 1_000,
        },
        {
          tweetId: '9800000000000000004',
          ruleId: 'grok_filter',
          scene: 'reply',
          reasonText: 'Short @grok mention filtered',
          timestamp: tsToday - 20,
        },
        {
          tweetId: '9800000000000000005',
          ruleId: 'grok_filter',
          scene: 'reply',
          reasonText: 'Short @grok mention filtered',
          timestamp: tsYesterday + 2_000,
        },
        {
          tweetId: '9800000000000000006',
          ruleId: 'domain_filter',
          scene: 'timeline',
          reasonText: 'Blocked external domain',
          timestamp: tsToday - 30,
        },
        {
          tweetId: '9800000000000000007',
          ruleId: 'domain_filter',
          scene: 'search',
          reasonText: 'Blocked external domain',
          timestamp: tsTwoDaysAgo + 2_000,
        },
        {
          tweetId: '9800000000000000008',
          ruleId: 'promoted_ad',
          scene: 'timeline',
          reasonText: 'Promoted ad hidden',
          timestamp: tsToday - 40,
        },
      ];

      return specs.map((spec, idx) => ({
        id: `e2e-hist-${idx + 1}`,
        tweetId: spec.tweetId,
        authorUid: '777666555444',
        authorScreenName: 'secret_pii_handle_xyz',
        authorName: 'Secret PII Display Name',
        tweetSnippet: `PRIVATE_SNIPPET_TOKEN_999 seeded history entry ${idx + 1} (${spec.ruleId})`,
        scene: spec.scene,
        ruleId: spec.ruleId,
        reasonText: spec.reasonText,
        timestamp: spec.timestamp,
      }));
    });

    await sendKxcCommand(historyPage, { type: 'logs.append', entries: seededLogs });

    const statsAfterSeed = await waitForStorageLocalInWorker<StoredStats>(
      worker,
      'kxc_stats_v2',
      (st) =>
        Boolean(
          st &&
            (st.byRule?.keyword ?? 0) >= 3 &&
            (st.byRule?.grok_filter ?? 0) >= 2 &&
            (st.byRule?.domain_filter ?? 0) >= 2 &&
            (st.byRule?.promoted_ad ?? 0) >= 1
        ),
      8_000,
      'kxc_stats_v2 updated after seeding 8 logs'
    );
    assert(statsAfterSeed, 'Expected kxc_stats_v2 to be populated');
    assert(
      (statsAfterSeed.totalAdsHidden ?? 0) >= 1,
      `Expected totalAdsHidden >= 1 after promoted_ad seed, got ${String(statsAfterSeed.totalAdsHidden)}`
    );
    assert(
      Array.isArray(statsAfterSeed.dailyHistory) &&
        statsAfterSeed.dailyHistory.length >= 1 &&
        statsAfterSeed.dailyHistory.length <= 7,
      `Expected kxc_stats_v2.dailyHistory array with 1..7 entries, got ${JSON.stringify(statsAfterSeed.dailyHistory)}`
    );
    const historyDates = statsAfterSeed.dailyHistory.map((d) => d.date);
    const sortedHistoryDates = [...historyDates].sort();
    assert(
      JSON.stringify(historyDates) === JSON.stringify(sortedHistoryDates) &&
        historyDates.every((dateStr) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr)),
      `Expected dailyHistory dates in ascending YYYY-MM-DD order, got ${JSON.stringify(historyDates)}`
    );
    const nonZeroDays = statsAfterSeed.dailyHistory.filter((day) => day.blocked > 0).length;
    assert(
      nonZeroDays >= 2,
      `Expected >= 2 non-zero blocked days in dailyHistory, got ${JSON.stringify(statsAfterSeed.dailyHistory)}`
    );

    const allStoredLogs =
      (await getStorageLocal<StoredInterceptionLogEntry[]>(worker, 'kxc_interception_logs_v1')) ??
      [];
    assert(
      allStoredLogs.every((entry) => entry.ruleId !== 'promoted_ad'),
      'Expected promoted_ad entries to remain excluded from kxc_interception_logs_v1'
    );

    await historyPage.goto(`chrome-extension://${extensionId}/options.html#/history`, {
      waitUntil: 'domcontentloaded',
    });
    await historyPage.waitForSelector('.kxc-root', { timeout: 10_000 });
    await historyPage.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 10_000 });

    const expectedInitialRows = Math.min(allStoredLogs.length, 25);
    const expectedGrokRows = Math.min(
      allStoredLogs.filter((l) => l.ruleId === 'grok_filter').length,
      25
    );
    assert(
      expectedInitialRows >= 7,
      `Expected >= 7 initial non-ad history rows, got ${expectedInitialRows}`
    );
    assert(
      expectedGrokRows >= 2 && expectedGrokRows < expectedInitialRows,
      `Expected 2 <= expectedGrokRows < initialRows (${expectedInitialRows}), got ${expectedGrokRows}`
    );

    await historyPage.waitForFunction(
      (expected: number) => document.querySelectorAll('tbody tr').length === expected,
      expectedInitialRows,
      { timeout: 5_000 }
    );
    const actualInitialRows = await historyPage.locator('tbody tr').count();
    assert(
      actualInitialRows === expectedInitialRows,
      `Expected ${expectedInitialRows} visible tbody rows on #/history, got ${actualInitialRows}`
    );
    assert(
      await hasSevenDayTrendChart(historyPage),
      'Expected 7-day trend chart to be rendered on #/history'
    );

    // Click grok_filter breakdown bar -> cross-filters rule <select> & narrows tbody rows
    const grokBreakdownBar = await locateRuleBreakdownBar(historyPage, 'grok_filter', /grok/i);
    await grokBreakdownBar.click();

    const ruleSelect = historyPage.locator('select[aria-label="Filter by rule"]').first();
    await ruleSelect.waitFor({ state: 'visible', timeout: 5_000 });
    await historyPage.waitForFunction(
      () => {
        const sel = document.querySelector<HTMLSelectElement>('select[aria-label="Filter by rule"]');
        return sel?.value === 'grok_filter';
      },
      { timeout: 5_000 }
    );
    assert(
      (await ruleSelect.inputValue()) === 'grok_filter',
      'Expected select[aria-label="Filter by rule"] value to become "grok_filter"'
    );

    await historyPage.waitForFunction(
      (expectedCount: number) => document.querySelectorAll('tbody tr').length === expectedCount,
      expectedGrokRows,
      { timeout: 5_000 }
    );
    const filteredTableText = (await historyPage.locator('tbody').textContent()) ?? '';
    assert(
      filteredTableText.includes('(grok_filter)') &&
        !filteredTableText.includes('(domain_filter)') &&
        !filteredTableText.includes('(keyword)'),
      'Filtered tbody should contain grok_filter rows and exclude domain_filter/keyword rows'
    );

    // Open Battle Report modal and verify local Canvas 2D PNG (light theme, non-blank, zero PII, keepxclean.com)
    const reportBtn = await locateBattleReportButton(historyPage);
    await reportBtn.click();

    const reportMetrics = await verifyBattleReportCanvas(historyPage, HISTORY_PII_CANARIES);

    const closeModalBtn = historyPage.locator('dialog[open] button[aria-label="Close"]').first();
    if ((await closeModalBtn.count()) > 0) {
      await closeModalBtn.click();
    } else {
      await historyPage.keyboard.press('Escape');
    }
    await historyPage.locator('dialog[open]').first().waitFor({ state: 'detached', timeout: 5_000 });
    assert(historyErrors.length === 0, `Scenario 5 history errors: ${historyErrors.join('; ')}`);
    await historyPage.close();
    console.log(
      `[browser-e2e] ✓ Scenario 5: #/history breakdown click-to-filter + local Canvas 2D PNG verified (${reportMetrics.width}x${reportMetrics.height}, ${reportMetrics.decodedBytes}B, lum=${reportMetrics.avgCornerLuminance.toFixed(1)}, buckets=${reportMetrics.distinctColorBuckets})`
    );

    // 9. Scenario 6 — Parse Health Self-Check (5× 0-tweet over 18s), Redacted Diagnostic Copy & Live Auto-Recovery
    const healthPage = await context.newPage();
    const healthErrors = attachErrorCollector(healthPage, 'x.com:health');
    await installNegativeOffsetClock(healthPage);

    let healthRouteMode: 'broken' | 'healthy' = 'broken';
    const healthyRecoveryPayload = buildMockHomeTimelinePayload([
      buildMockTweetEntry({
        restId: '1900000000000000061',
        authorRestId: '9100000061',
        screenName: 'healthy_recovery_author',
        name: 'Healthy Recovery Author',
        description: 'Testing parse health recovery.',
        createdAt: 'Mon Jan 01 00:00:00 +0000 2020',
        statusesCount: 250,
        followersCount: 1500,
        friendsCount: 180,
        text: 'Normal healthy timeline tweet proving GraphQL parser recovery.',
      }),
    ]);
    const healthHtml = buildMockXHtml([
      {
        cellId: 'cell-health-recovery',
        screenName: 'healthy_recovery_author',
        displayName: 'Healthy Recovery Author',
        tweetId: '1900000000000000061',
        text: 'Normal healthy timeline tweet proving GraphQL parser recovery.',
        timeLabel: '1m',
      },
    ]);

    await healthPage.route('https://x.com/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/i/api/graphql/')) {
        const body =
          healthRouteMode === 'broken'
            ? buildBrokenHomeTimelinePayload()
            : healthyRecoveryPayload;
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(body),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: healthHtml,
      });
    });

    await healthPage.goto('https://x.com/home', { waitUntil: 'domcontentloaded' });
    await waitForMainConfigSync(
      healthPage,
      () => true,
      10_000,
      'Scenario 6 healthPage MAIN/ISOLATED sync'
    );

    // 5× 0-tweet HomeTimeline responses stepped over 18s (-20_000ms -> -2_000ms)
    const clockOffsets = [-20_000, -15_500, -11_000, -6_500, -2_000];
    for (const offset of clockOffsets) {
      await setClockOffsetMs(healthPage, offset);
      const ok = await healthPage.evaluate(async () => {
        const res = await fetch('https://x.com/i/api/graphql/mockHash/HomeTimeline');
        return res.ok;
      });
      assert(ok, `Broken HomeTimeline fetch at clock offset ${offset}ms should return HTTP 200`);
    }

    const degradedHealth = await waitForStorageLocalInWorker<StoredParseHealthState>(
      worker,
      'kxc_health_v1',
      (h) =>
        h?.status === 'degraded' &&
        (h.consecutiveZeroCount ?? 0) >= 5 &&
        Boolean(h.endpoints?.includes('HomeTimeline')),
      8_000,
      'kxc_health_v1 degraded after 5 zero-tweet responses over 18s'
    );
    assert(degradedHealth, 'Expected kxc_health_v1 to enter degraded state');

    // Open Popup with triple-layer clipboard spy and verify banner + header switch + redacted copy
    const healthPopup = await context.newPage();
    const healthPopupErrors = attachErrorCollector(healthPopup, 'popup:health');
    await installClipboardSpy(healthPopup);
    await healthPopup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });
    await healthPopup.waitForSelector('.kxc-root', { timeout: 10_000 });
    await healthPopup.locator('button[role="switch"]').first().waitFor({
      state: 'visible',
      timeout: 10_000,
    });

    const healthHeaderSwitchOk = await healthPopup.evaluate(() => {
      const firstSwitch = document.querySelector('button[role="switch"]');
      return (
        firstSwitch?.closest('.popup-header') !== null &&
        firstSwitch?.getAttribute('aria-checked') === 'true'
      );
    });
    assert(
      healthHeaderSwitchOk,
      'Header master switch must remain first and unaffected while degraded health banner is shown'
    );

    const bannerWaitDeadline = Date.now() + 8_000;
    while (Date.now() < bannerWaitDeadline && !(await hasVisibleHealthBanner(healthPopup))) {
      await sleep(100);
    }
    assert(
      await hasVisibleHealthBanner(healthPopup),
      'Expected degraded health banner to appear in .popup-body within 8000ms'
    );

    const healthBanner = await locateHealthBanner(healthPopup);
    assert(await healthBanner.isVisible(), 'Expected degraded health banner visible in .popup-body');

    const githubLink = healthBanner.locator('a[href*="github.com"]').first();
    const issueActionBtn = healthBanner
      .locator('button, a')
      .filter({ hasText: /github|issue|report/i })
      .filter({ hasNotText: /copy|diagnostic/i })
      .first();
    assert(
      (await githubLink.count()) > 0 || (await issueActionBtn.count()) > 0,
      'Expected degraded health banner to include a GitHub Issues link or report action'
    );

    const copyDiagBtn = healthBanner
      .getByRole('button', { name: /copy|diagnostic/i })
      .first();
    await copyDiagBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await copyDiagBtn.click();

    await healthPopup.waitForFunction(
      () => {
        const val = (window as unknown as KxcE2eWindow).__kxcCopiedDiagnostic;
        return typeof val === 'string' && val.trim().length > 0;
      },
      { timeout: 5_000 }
    );
    const copiedDiagnostic = await healthPopup.evaluate(
      () => (window as unknown as KxcE2eWindow).__kxcCopiedDiagnostic ?? ''
    );
    assert(
      copiedDiagnostic.includes('0.2.0'),
      `Diagnostic summary must include extension version "0.2.0", got: ${copiedDiagnostic}`
    );
    assert(
      copiedDiagnostic.includes('HomeTimeline'),
      `Diagnostic summary must include endpoint "HomeTimeline", got: ${copiedDiagnostic}`
    );
    assert(
      copiedDiagnostic.includes('home_v99_renamed'),
      `Diagnostic summary must include top-level key "home_v99_renamed", got: ${copiedDiagnostic}`
    );
    const HEALTH_PII_CANARIES = [
      'DO_NOT_LEAK_PII_TOKEN_888',
      'secret_health_user',
      'ct0=',
      'twid=',
      'auth_token',
    ];
    for (const canary of HEALTH_PII_CANARIES) {
      assert(
        !copiedDiagnostic.includes(canary),
        `Diagnostic summary leaked PII/credential canary "${canary}": ${copiedDiagnostic}`
      );
    }

    // Auto-recovery: 1 valid HomeTimeline payload clears kxc_health_v1 AND removes banner live without reload!
    healthRouteMode = 'healthy';
    await setClockOffsetMs(healthPage, 0);
    const recoveryOk = await healthPage.evaluate(async () => {
      const res = await fetch('https://x.com/i/api/graphql/mockHash/HomeTimeline');
      return res.ok;
    });
    assert(recoveryOk, 'Healthy recovery HomeTimeline fetch should succeed');

    await waitForStorageLocalInWorker<StoredParseHealthState>(
      worker,
      'kxc_health_v1',
      (h) => h?.status === 'ok' && h?.consecutiveZeroCount === 0,
      8_000,
      'kxc_health_v1 auto-recovered to ok / consecutiveZeroCount=0'
    );

    const recoveryDeadline = Date.now() + 8_000;
    while (Date.now() < recoveryDeadline && (await hasVisibleHealthBanner(healthPopup))) {
      await sleep(50);
    }
    assert(
      !(await hasVisibleHealthBanner(healthPopup)),
      'Degraded health banner must disappear live in open Popup upon auto-recovery without reload'
    );

    assert(healthErrors.length === 0, `Scenario 6 healthPage errors: ${healthErrors.join('; ')}`);
    assert(
      healthPopupErrors.length === 0,
      `Scenario 6 healthPopup errors: ${healthPopupErrors.join('; ')}`
    );
    await healthPopup.close();
    await healthPage.close();
    console.log(
      '[browser-e2e] ✓ Scenario 6: Parse Health degraded banner, redacted diagnostic copy & live auto-recovery verified'
    );

    console.log('[browser-e2e] ALL 11 BROWSER E2E FLOWS (4 BASELINE + 7 v0.2.0) PASSED');
  } finally {
    await context?.close().catch(() => undefined);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('[browser-e2e] FAILED:', err);
  process.exit(1);
});
