import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  DEFAULT_CLOUD_KEYWORDS,
  RULE_PACK_FORMAT,
  STORAGE_KEYS,
  SUPPORTED_LOCALES,
  validateRulePack,
  type CrowdBlockSnapshot,
  type DomainRuleItem,
  type ExtractedAuthor,
  type ExtractedTweet,
  type FilterConfig,
  type InstalledRulePack,
  type InterceptionDecision,
  type InterceptionLogEntry,
  type KeywordRuleItem,
  type RulePackPayload,
  type TriggeredRuleId,
} from '@keepxclean/shared';
import { App as PopupApp } from '../entrypoints/popup/App';
import {
  disableCloudSync,
  enableCloudSync,
  pushCloudSyncNow,
  resetCloudSyncTimers,
  resolveCloudSync,
} from '../src/background/cloud-sync';
import { applyConfigCommand, openOptionsPage } from '../src/background/config';
import {
  dismissParseHealth,
  enqueue,
  readConfig,
  readState,
  setOnConfigWrittenHook,
  updateParseHealth,
  writeConfig,
} from '../src/background/repository';
import {
  ContentApp,
  isDisableableMatchedTarget,
  resolveAdjustRuleTarget,
} from '../src/content/ContentApp';
import { DomController, type InlineItem } from '../src/content/dom-controller';
import { AccountsPage } from '../src/features/accounts/AccountsPage';
import { HistoryPage } from '../src/features/history/HistoryPage';
import { ReportCardModal } from '../src/features/history/ReportCardModal';
import {
  getCloudCategory,
  KeywordsPage,
} from '../src/features/keywords/KeywordsPage';
import {
  computeRecordDiff,
  PreferencesPage,
} from '../src/features/preferences/PreferencesPage';
import { OnboardingCard } from '../src/features/quick-controls/OnboardingCard';
import {
  copyTextWithFallback,
  ParseHealthBanner,
  shouldShowParseHealthBanner,
} from '../src/features/quick-controls/ParseHealthBanner';
import {
  ruleDefinitions,
  RulesPage,
  summarizeRule,
} from '../src/features/rules/RulesPage';
import { getI18n, setActiveLocaleSetting } from '../src/i18n/core';
import {
  defaultCloudSyncMeta,
  defaultParseHealth,
  defaultStats,
  errorText,
  localDate,
  trailingLocalDates,
  UI_KEYS,
  type CloudSyncMeta,
  type CloudSyncStatus,
  type Command,
  type ParseHealthState,
  type Stats,
  type SyncedConfigPayload,
} from '../src/services/model';
import { formatRedactedHealthDiagnostic } from '../src/services/parse-health';
import { getState, reload, subscribe } from '../src/state/store';
import { parseHashQuery, useFocusHighlight } from '../src/ui/useHashQuery';
import { mockChrome, type MockChromeOptions } from './mock-chrome';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
      HTMLDialogElement.prototype.showModal = function showModal(
        this: HTMLDialogElement
      ) {
        this.setAttribute('open', '');
      };
    }
    if (typeof HTMLDialogElement.prototype.close !== 'function') {
      HTMLDialogElement.prototype.close = function close(
        this: HTMLDialogElement
      ) {
        if (!this.hasAttribute('open')) return;
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      };
    }
  }
});

interface MountedEntry {
  root: Root;
  container: HTMLDivElement;
}

const mountedEntries: MountedEntry[] = [];
const activeControllers: DomController[] = [];
const activeUnsubscribers: Array<() => void> = [];

async function renderMounted(element: ReactElement): Promise<MountedEntry> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const entry: MountedEntry = { root, container };
  mountedEntries.push(entry);
  await act(async () => {
    root.render(element);
  });
  return entry;
}

async function flushUi() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function flushRaf() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

async function setHash(hash: string) {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
  });
}

function setControlValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function clickEl(el: Element | null) {
  if (!el) throw new Error('Expected element to exist before click');
  await act(async () => {
    (el as HTMLElement).click();
  });
}

function findButtonByText(
  root: ParentNode,
  text: string
): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
    (btn) => btn.textContent?.trim() === text
  );
}

function findSwitchByLabel(
  root: ParentNode,
  label: string
): HTMLButtonElement | undefined {
  return Array.from(
    root.querySelectorAll<HTMLButtonElement>('button[role="switch"]')
  ).find((btn) => btn.getAttribute('aria-label') === label);
}

interface HarnessOptions {
  config?: FilterConfig;
  snapshot?: CrowdBlockSnapshot;
  logs?: InterceptionLogEntry[];
  stats?: Stats;
  cloudSync?: CloudSyncMeta;
  health?: ParseHealthState;
  initialSync?: Record<string, unknown>;
  chromeOpts?: MockChromeOptions;
  commandOverrides?: Partial<
    Record<Command['type'], (action: Command) => Promise<unknown>>
  >;
  preloadStore?: boolean;
}

async function setupHarness(options: HarnessOptions = {}) {
  const cfg = options.config ?? {
    ...createDefaultConfig('standard'),
    locale: 'en',
    onboardingDismissed: true,
  };
  const snapshot = options.snapshot ?? createDefaultCrowdSnapshot();
  const initialLocal: Record<string, unknown> = {
    [STORAGE_KEYS.CONFIG]: cfg,
    [STORAGE_KEYS.CROWD_SNAPSHOT]: snapshot,
    [STORAGE_KEYS.INTERCEPTION_LOGS]: options.logs ?? [],
    [UI_KEYS.stats]: options.stats ?? defaultStats(),
    [UI_KEYS.cloudSync]: options.cloudSync ?? defaultCloudSyncMeta(),
    [UI_KEYS.health]: options.health ?? defaultParseHealth(),
    [UI_KEYS.sync]: { status: 'idle', source: 'builtin' },
    [UI_KEYS.operations]: [],
    [UI_KEYS.imports]: [],
  };

  const env = mockChrome(initialLocal, options.initialSync ?? {}, options.chromeOpts);
  const dispatchedCommands: Command[] = [];
  const overrides = { ...(options.commandOverrides ?? {}) };

  async function dispatch(action: Command): Promise<unknown> {
    dispatchedCommands.push(action);
    const custom = overrides[action.type];
    if (custom) {
      return custom(action);
    }
    switch (action.type) {
      case 'state.get':
        return readState();
      case 'config.patch':
      case 'config.preset':
      case 'config.replace':
      case 'config.reset':
      case 'keyword.save':
      case 'keyword.delete':
      case 'domain.save':
      case 'domain.delete':
      case 'cloudKeyword.toggle':
      case 'cloudKeyword.customize':
      case 'cloudLangGroup.toggle':
      case 'target.disable':
      case 'pack.install':
      case 'pack.toggle':
      case 'pack.uninstall':
      case 'account.save':
      case 'account.delete':
        return enqueue(async () =>
          writeConfig(applyConfigCommand(await readConfig(), action))
        );
      case 'health.dismiss':
        return dismissParseHealth();
      case 'health.update':
        return updateParseHealth(action.report);
      case 'options.open':
        return openOptionsPage(action.page, action.query);
      case 'cloudSync.enable':
        return enableCloudSync();
      case 'cloudSync.resolve':
        return resolveCloudSync(action.strategy);
      case 'cloudSync.disable':
        return disableCloudSync();
      case 'cloudSync.pushNow':
        return pushCloudSyncNow();
      case 'tabs.list':
        return [{ id: 7, title: 'X · Home', current: true }];
      case 'logs.clear':
        return chrome.storage.local.set({
          [STORAGE_KEYS.INTERCEPTION_LOGS]: [],
        });
      default:
        return undefined;
    }
  }

  env.api.runtime.sendMessage.mockImplementation(
    async (message: { type?: string; action?: Command }) => {
      if (message?.type !== 'KXC_COMMAND' || !message.action) {
        return { ok: false, error: 'Invalid command envelope' };
      }
      try {
        const data = await dispatch(message.action);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: errorText(err) };
      }
    }
  );

  setActiveLocaleSetting(cfg.locale);
  if (options.preloadStore !== false) {
    await act(async () => {
      await reload();
    });
  }

  return {
    env,
    dispatchedCommands,
    overrides,
  };
}

function makeDecision(
  partial: Partial<InterceptionDecision>
): InterceptionDecision {
  return {
    blocked: true,
    action: 'collapse',
    ruleId: 'keyword',
    reasonText: 'Matched rule',
    riskBadges: [],
    ...partial,
  };
}

function makeSampleAuthor(overrides: Partial<ExtractedAuthor> = {}): ExtractedAuthor {
  return {
    restId: '888111222',
    screenName: 'spammer_bot',
    name: 'Spammer Bot',
    bio: '',
    bioUrls: [],
    createdAt: '2022-01-01T00:00:00.000Z',
    accountAgeDays: 800,
    statusesCount: 1600,
    dailyTweetRate: 2,
    followersCount: 500,
    friendsCount: 200,
    followRatio: 0.4,
    mediaCount: 20,
    favouritesCount: 100,
    isBlueVerified: false,
    following: false,
    defaultProfileImage: false,
    ...overrides,
  };
}

function makeSampleTweet(overrides: Partial<ExtractedTweet> = {}): ExtractedTweet {
  return {
    tweetId: '999001',
    text: 'Check out spamphrase right now!',
    scene: 'timeline',
    isReply: false,
    isPromoted: false,
    hasMedia: false,
    urls: [],
    hashtagCount: 0,
    cashtagCount: 0,
    replyCount: 0,
    favoriteCount: 0,
    viewCount: 10,
    author: makeSampleAuthor(),
    ...overrides,
  };
}

function makeSyncedPayload(
  overrides: Partial<SyncedConfigPayload> = {}
): SyncedConfigPayload {
  const base = createDefaultConfig('strict');
  return {
    version: 1,
    enabled: base.enabled,
    preset: base.preset,
    interceptionMode: base.interceptionMode,
    sceneModes: base.sceneModes,
    exemptFollowing: base.exemptFollowing,
    profileSceneBadgeOnly: base.profileSceneBadgeOnly,
    locale: 'en',
    theme: 'light',
    enableCloudKeywords: true,
    enabledCloudLangGroups: ['universal', 'en'],
    disabledCloudKeywordIds: [],
    rules: base.rules,
    installedPacks: [],
    ...overrides,
  };
}

function stubCanvasForModal(options: { blob: Blob | null }) {
  const stubCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() {},
    restore() {},
    clip() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillRect() {},
    fillText() {},
    drawImage() {},
    measureText(text: string) {
      return { width: text.length * 7 };
    },
  } as unknown as CanvasRenderingContext2D;

  const getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(
      stubCtx as unknown as ReturnType<HTMLCanvasElement['getContext']>
    );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,iVBORw0KGgo='
  );
  const toBlobSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((cb) => {
      queueMicrotask(() => cb(options.blob));
    });

  class FakeImage {
    naturalWidth = 128;
    naturalHeight = 128;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = '';
    get src() {
      return this._src;
    }
    set src(v: string) {
      this._src = v;
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);

  return { getContextSpy, toBlobSpy };
}

afterEach(async () => {
  while (activeUnsubscribers.length) {
    activeUnsubscribers.pop()?.();
  }
  while (activeControllers.length) {
    activeControllers.pop()?.dispose();
  }
  while (mountedEntries.length) {
    const entry = mountedEntries.pop()!;
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
  resetCloudSyncTimers();
  setOnConfigWrittenHook(undefined);
  setActiveLocaleSetting('auto');
  window.location.hash = '';
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('M4 Extension UI v2 Integration & Regression Suite', () => {
  describe('Suite 1: Popup switch selector invariant', () => {
    it('keeps OnboardingCard and ParseHealthBanner inside .popup-body so first role=switch is the header master switch', async () => {
      const cfg = {
        ...createDefaultConfig('standard'),
        locale: 'en' as const,
        onboardingDismissed: false,
      };
      const health: ParseHealthState = {
        status: 'degraded',
        consecutiveZeroCount: 5,
        firstFailureAt: 1000,
        lastFailureAt: 20_000,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      };
      const { dispatchedCommands } = await setupHarness({
        config: cfg,
        health,
      });
      const { m } = getI18n('en');

      const { container } = await renderMounted(<PopupApp />);
      await flushUi();

      const header = container.querySelector('.popup-header');
      const body = container.querySelector('.popup-body');
      const onboarding = container.querySelector('[data-kxc-onboarding="true"]');
      const healthBanner = container.querySelector(
        '[data-kxc-health-banner="true"]'
      );

      expect(header).not.toBeNull();
      expect(body).not.toBeNull();
      expect(onboarding).not.toBeNull();
      expect(healthBanner).not.toBeNull();

      expect(body!.contains(onboarding!)).toBe(true);
      expect(body!.contains(healthBanner!)).toBe(true);
      expect(header!.contains(onboarding!)).toBe(false);
      expect(header!.contains(healthBanner!)).toBe(false);

      expect(onboarding!.querySelectorAll('button[role="switch"]')).toHaveLength(
        0
      );
      expect(
        healthBanner!.querySelectorAll('button[role="switch"]')
      ).toHaveLength(0);

      const firstSwitch = container.querySelectorAll<HTMLButtonElement>(
        'button[role="switch"]'
      )[0];
      expect(firstSwitch).toBeDefined();
      expect(header!.contains(firstSwitch!)).toBe(true);
      expect(firstSwitch!.getAttribute('aria-label')).toBe(m.nav.enableFilter);
      expect(firstSwitch!.getAttribute('aria-checked')).toBe('true');

      await clickEl(firstSwitch!);
      await flushUi();

      expect(
        dispatchedCommands.some(
          (c) => c.type === 'config.patch' && c.patch.enabled === false
        )
      ).toBe(true);
      expect(firstSwitch!.getAttribute('aria-checked')).toBe('false');
    });
  });

  describe('Suite 2: OnboardingCard', () => {
    it('suppresses rendering when onboardingDismissed is true or undefined (v0.1.2 upgrade)', async () => {
      for (const dismissed of [true, undefined] as const) {
        const cfg = {
          ...createDefaultConfig('standard'),
          locale: 'en' as const,
          onboardingDismissed: dismissed,
        };
        await setupHarness({ config: cfg });
        const { container } = await renderMounted(<OnboardingCard />);
        expect(container.querySelector('[data-kxc-onboarding="true"]')).toBeNull();
      }
    });

    it('runs the 3-step fresh install flow with a single dismiss selector and keeps privacy flags false', async () => {
      const cfg = {
        ...createDefaultConfig('standard'),
        locale: 'en' as const,
        onboardingDismissed: false,
        syncNativeXBlock: false,
        enableCrowdReport: false,
      };
      const { dispatchedCommands } = await setupHarness({ config: cfg });
      const { m } = getI18n('en');

      const { container } = await renderMounted(<OnboardingCard />);
      expect(
        container.querySelector('[data-kxc-onboarding="true"]')
      ).not.toBeNull();

      // Strictly 1 dismiss CTA selector and 1 top-right close selector
      expect(
        container.querySelectorAll('[data-kxc-onboarding-dismiss="true"]')
      ).toHaveLength(1);
      expect(
        container.querySelectorAll('[data-kxc-onboarding-close="true"]')
      ).toHaveLength(1);

      // Step 1: select Strict preset
      await clickEl(findButtonByText(container, m.presets.strictTitle) ?? null);
      await flushUi();
      expect((await readConfig()).preset).toBe('strict');

      // Step 2: select Hide silently (strip)
      await clickEl(findButtonByText(container, m.presets.modeStrip) ?? null);
      await flushUi();
      expect((await readConfig()).interceptionMode).toBe('strip');

      // Step 3: click Import X Blocklist -> options.open accounts?action=import
      await clickEl(findButtonByText(container, m.onboarding.importBtn) ?? null);
      await flushUi();
      expect(dispatchedCommands).toContainEqual({
        type: 'options.open',
        page: 'accounts',
        query: { action: 'import' },
      });

      // Custom onImport callback (Drawer mode)
      const onImport = vi.fn();
      const drawerMount = await renderMounted(
        <OnboardingCard onImport={onImport} />
      );
      await clickEl(
        findButtonByText(drawerMount.container, m.onboarding.importBtn) ?? null
      );
      expect(onImport).toHaveBeenCalledTimes(1);

      // Dismiss persists onboardingDismissed: true and never flips privacy flags
      await clickEl(
        container.querySelector('[data-kxc-onboarding-dismiss="true"]')
      );
      await flushUi();
      const after = await readConfig();
      expect(after.onboardingDismissed).toBe(true);
      expect(after.syncNativeXBlock).toBe(false);
      expect(after.enableCrowdReport).toBe(false);
      expect(
        container.querySelector('[data-kxc-onboarding="true"]')
      ).toBeNull();
    });
  });

  describe('Suite 3: ParseHealthBanner', () => {
    it('evaluates outage-epoch visibility predicate accurately', () => {
      expect(shouldShowParseHealthBanner(undefined)).toBe(false);
      expect(
        shouldShowParseHealthBanner({
          status: 'ok',
          consecutiveZeroCount: 0,
          endpoints: [],
          topKeys: [],
        })
      ).toBe(false);
      expect(
        shouldShowParseHealthBanner({
          status: 'degraded',
          consecutiveZeroCount: 5,
          firstFailureAt: 1000,
          lastFailureAt: 20_000,
          endpoints: ['HomeTimeline'],
          topKeys: ['data.home'],
        })
      ).toBe(true);
      expect(
        shouldShowParseHealthBanner({
          status: 'degraded',
          consecutiveZeroCount: 5,
          firstFailureAt: 1000,
          lastFailureAt: 20_000,
          dismissedAt: 15_000,
          endpoints: ['HomeTimeline'],
          topKeys: ['data.home'],
        })
      ).toBe(false);
      expect(
        shouldShowParseHealthBanner({
          status: 'degraded',
          consecutiveZeroCount: 5,
          firstFailureAt: 25_000,
          lastFailureAt: 45_000,
          dismissedAt: 15_000,
          endpoints: ['SearchTimeline'],
          topKeys: ['data.search'],
        })
      ).toBe(true);
    });

    it('copies redacted diagnostic via clipboard API and fallback inside open dialogs, links GitHub issues, and dismisses', async () => {
      const health: ParseHealthState = {
        status: 'degraded',
        consecutiveZeroCount: 5,
        firstFailureAt: 1000,
        lastFailureAt: 20_000,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      };
      const { dispatchedCommands } = await setupHarness({ health });
      const { m } = getI18n('en');

      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      const { container } = await renderMounted(<ParseHealthBanner />);
      const banner = container.querySelector('[data-kxc-health-banner="true"]');
      expect(banner).not.toBeNull();

      // GitHub issue link
      const issueLink = banner!.querySelector<HTMLAnchorElement>('a[href]');
      expect(issueLink?.getAttribute('href')).toBe(
        'https://github.com/KeepXClean/keepxclean/issues/new'
      );
      expect(issueLink?.getAttribute('target')).toBe('_blank');
      expect(issueLink?.getAttribute('rel')).toBe('noreferrer');

      // Happy-path clipboard copy
      await clickEl(findButtonByText(banner!, m.health.copyDiagnosticBtn) ?? null);
      await flushUi();
      const expectedDiag = formatRedactedHealthDiagnostic(health, '0.2.0');
      expect(writeText).toHaveBeenCalledWith(expectedDiag);
      expect(expectedDiag).toContain('Version: 0.2.0');
      expect(expectedDiag).toContain('HomeTimeline');
      expect(expectedDiag).toContain('data.home');
      expect(expectedDiag).not.toContain('@');
      expect(expectedDiag).not.toContain('https://');

      // Fallback inside open light-DOM <dialog open>
      writeText.mockRejectedValueOnce(new Error('NotAllowedError'));
      const openDialog = document.createElement('dialog');
      openDialog.setAttribute('open', '');
      document.body.appendChild(openDialog);
      let mountedParentInExec: Node | null = null;
      const execCommand = vi.fn(() => {
        const ta = openDialog.querySelector('textarea');
        mountedParentInExec = ta?.parentNode ?? null;
        return true;
      });
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: execCommand,
      });

      const okDialogCopy = await copyTextWithFallback('diag-dialog');
      expect(okDialogCopy).toBe(true);
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(mountedParentInExec).toBe(openDialog);
      expect(openDialog.querySelector('textarea')).toBeNull();

      // Fallback inside open Shadow DOM <dialog open>
      writeText.mockRejectedValueOnce(new Error('NotAllowedError'));
      const shadowHost = document.createElement('div');
      shadowHost.tabIndex = 0;
      const shadow = shadowHost.attachShadow({ mode: 'open' });
      const shadowDialog = document.createElement('dialog');
      shadowDialog.setAttribute('open', '');
      shadow.appendChild(shadowDialog);
      document.body.appendChild(shadowHost);
      shadowHost.focus();

      let shadowMountedParent: Node | null = null;
      execCommand.mockImplementationOnce(() => {
        const ta = shadowDialog.querySelector('textarea');
        shadowMountedParent = ta?.parentNode ?? null;
        return true;
      });
      expect(await copyTextWithFallback('diag-shadow')).toBe(true);
      expect(shadowMountedParent).toBe(shadowDialog);
      expect(shadowDialog.querySelector('textarea')).toBeNull();
      shadowHost.remove();
      openDialog.remove();

      // Both clipboard and execCommand fail -> renders role="alert"
      writeText.mockRejectedValueOnce(new Error('Denied'));
      execCommand.mockReturnValueOnce(false);
      await clickEl(
        findButtonByText(banner!, m.health.copyDiagnosticBtn) ??
          findButtonByText(banner!, m.health.copiedBtn) ??
          null
      );
      await flushUi();
      expect(banner!.querySelector('[role="alert"]')?.textContent).toBe(
        m.health.copyFailedMsg
      );

      // Dismiss -> dispatches health.dismiss and unmounts banner
      await clickEl(
        banner!.querySelector(`button[aria-label="${m.common.dismiss}"]`)
      );
      await flushUi();
      expect(dispatchedCommands).toContainEqual({ type: 'health.dismiss' });
      expect(
        container.querySelector('[data-kxc-health-banner="true"]')
      ).toBeNull();
    });

    it('mounts fallback textarea inside ShadowRoot ContentApp Drawer dialog even when document.activeElement is not the shadow host (C1-R2-3)', async () => {
      const health: ParseHealthState = {
        status: 'degraded',
        consecutiveZeroCount: 5,
        firstFailureAt: 1000,
        lastFailureAt: 20_000,
        endpoints: ['HomeTimeline'],
        topKeys: ['data.home'],
      };
      await setupHarness({ health });
      const { m } = getI18n('en');

      const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      // Mount ContentApp inside an open ShadowRoot (matching content.ts)
      const shadowHost = document.createElement('div');
      document.body.appendChild(shadowHost);
      const shadow = shadowHost.attachShadow({ mode: 'open' });
      const shadowMount = document.createElement('div');
      shadow.appendChild(shadowMount);

      const navHost = document.createElement('div');
      document.body.appendChild(navHost);
      const navItems: InlineItem[] = [
        { id: 'nav-1', kind: 'nav', container: navHost },
      ];
      const stubController = {
        subscribe: () => () => {},
        getSnapshot: () => navItems,
        subscribeTheme: () => () => {},
        isPageDark: () => false,
      } as unknown as DomController;

      const shadowRootReact = createRoot(shadowMount);
      mountedEntries.push({ root: shadowRootReact, container: shadowHost });
      await act(async () => {
        shadowRootReact.render(<ContentApp controller={stubController} />);
      });
      await flushUi();

      // Open drawer via nav button; do NOT focus shadowHost so document.activeElement stays document.body
      await clickEl(navHost.querySelector('button.inline-nav'));
      await flushUi();

      const drawerDialog = shadow.querySelector<HTMLDialogElement>('dialog[open]');
      expect(drawerDialog).not.toBeNull();
      expect(document.activeElement).not.toBe(shadowHost);

      let mountedParentInExec: Node | null = null;
      const execCommand = vi.fn(() => {
        const taInDialog = drawerDialog!.querySelector('textarea');
        const taInBody = document.body.querySelector('textarea');
        mountedParentInExec =
          taInDialog?.parentNode ?? taInBody?.parentNode ?? null;
        return true;
      });
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: execCommand,
      });

      const copyBtn = findButtonByText(
        drawerDialog!,
        m.health.copyDiagnosticBtn
      );
      expect(copyBtn).toBeDefined();
      await clickEl(copyBtn!);
      await flushUi();

      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(mountedParentInExec).toBe(drawerDialog);
      expect(drawerDialog!.querySelector('textarea')).toBeNull();
      expect(document.body.querySelector('textarea')).toBeNull();
    });
  });

  describe('Suite 4: ContentApp collapse bar, prototype safety & live restore', () => {
    it('routes all MatchedTarget kinds and blocks prototype keys in resolveAdjustRuleTarget & isDisableableMatchedTarget', () => {
      expect(
        resolveAdjustRuleTarget(
          makeDecision({
            ruleId: 'keyword',
            matchedTarget: { kind: 'keyword', id: 'kw-1' },
          })
        )
      ).toEqual({ page: 'keywords', query: { tab: 'custom', focus: 'kw-1' } });

      expect(
        resolveAdjustRuleTarget(
          makeDecision({
            ruleId: 'cloud_keyword',
            matchedTarget: { kind: 'cloud_keyword', id: 'cloud-scam-1' },
          })
        )
      ).toEqual({
        page: 'keywords',
        query: { tab: 'cloud', focus: 'cloud-scam-1' },
      });

      expect(
        resolveAdjustRuleTarget(
          makeDecision({
            ruleId: 'domain_filter',
            matchedTarget: { kind: 'domain', id: 'dom-1' },
          })
        )
      ).toEqual({
        page: 'keywords',
        query: { tab: 'domains', focus: 'dom-1' },
      });

      expect(
        resolveAdjustRuleTarget(
          makeDecision({
            ruleId: 'rule_pack',
            matchedTarget: {
              kind: 'pack_item',
              id: 'pk-item-1',
              packId: 'crypto-defense',
            },
          })
        )
      ).toEqual({
        page: 'keywords',
        query: { tab: 'packs', pack: 'crypto-defense', focus: 'pk-item-1' },
      });

      expect(
        resolveAdjustRuleTarget(
          makeDecision({
            ruleId: 'grok_filter',
            matchedTarget: { kind: 'rule', id: 'grokFilter' },
          })
        )
      ).toEqual({ page: 'rules', query: { focus: 'grokFilter' } });

      expect(
        resolveAdjustRuleTarget(
          makeDecision({
            ruleId: 'local_blocklist',
            matchedTarget: { kind: 'rule', id: 'local_blocklist' },
          })
        )
      ).toEqual({ page: 'accounts' });

      expect(
        resolveAdjustRuleTarget(
          makeDecision({
            ruleId: 'high_frequency_daily',
            matchedTarget: undefined,
          })
        )
      ).toEqual({ page: 'rules', query: { focus: 'highFrequency' } });

      expect(
        resolveAdjustRuleTarget(
          makeDecision({
            ruleId: 'keyword',
            matchedTarget: { kind: 'keyword', id: 'bad id!' },
          })
        )
      ).toEqual({ page: 'keywords', query: { tab: 'custom' } });

      // Prototype-key safety regression (C1-1)
      for (const protoKey of [
        'toString',
        'constructor',
        'valueOf',
        '__proto__',
        'hasOwnProperty',
        'prototype',
      ]) {
        const resRule = resolveAdjustRuleTarget(
          makeDecision({
            ruleId: 'keyword',
            matchedTarget: { kind: 'rule', id: protoKey },
          })
        );
        expect(typeof resRule).toBe('object');
        expect(resRule).toEqual({ page: 'keywords', query: { tab: 'custom' } });

        const resFallback = resolveAdjustRuleTarget(
          makeDecision({
            ruleId: protoKey as unknown as TriggeredRuleId,
            matchedTarget: undefined,
          })
        );
        expect(typeof resFallback).toBe('object');
        expect(resFallback).toEqual({ page: 'rules' });

        const resKw = resolveAdjustRuleTarget(
          makeDecision({
            ruleId: 'keyword',
            matchedTarget: { kind: 'keyword', id: protoKey },
          })
        );
        expect(resKw).toEqual({ page: 'keywords', query: { tab: 'custom' } });
      }

      expect(isDisableableMatchedTarget({ kind: 'keyword', id: 'kw-1' })).toBe(
        true
      );
      expect(
        isDisableableMatchedTarget({ kind: 'cloud_keyword', id: 'c-1' })
      ).toBe(true);
      expect(isDisableableMatchedTarget({ kind: 'domain', id: 'd-1' })).toBe(
        true
      );
      expect(
        isDisableableMatchedTarget({
          kind: 'pack_item',
          id: 'item-1',
          packId: 'pack-1',
        })
      ).toBe(true);
      expect(
        isDisableableMatchedTarget({ kind: 'pack_item', id: 'item-1' })
      ).toBe(false);
      expect(
        isDisableableMatchedTarget({ kind: 'rule', id: 'highFrequency' })
      ).toBe(false);
      expect(isDisableableMatchedTarget(undefined)).toBe(false);

      // Runtime non-string safety regression (C1-R2-5)
      expect(
        isDisableableMatchedTarget({
          kind: 'keyword',
          id: 12345 as unknown as string,
        })
      ).toBe(false);
      expect(
        isDisableableMatchedTarget({
          kind: 'domain',
          id: {} as unknown as string,
        })
      ).toBe(false);
      expect(
        isDisableableMatchedTarget({
          kind: 'pack_item',
          id: 'item-1',
          packId: 999 as unknown as string,
        })
      ).toBe(false);
      expect(
        isDisableableMatchedTarget(123 as unknown as InterceptionDecision['matchedTarget'])
      ).toBe(false);
    });

    it('expands collapse bar, opens rule deep-link, disables hit keyword to live-restore DOM while preserving root toast', async () => {
      const kw: KeywordRuleItem = {
        id: 'kw-live-1',
        pattern: 'spamphrase',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      };
      const cfg = createDefaultConfig('standard');
      cfg.locale = 'en';
      cfg.interceptionMode = 'collapse';
      cfg.rules.keywords.enabled = true;
      cfg.rules.keywords.items = [kw];

      const { dispatchedCommands } = await setupHarness({ config: cfg });
      const { m } = getI18n('en');

      // Mount mock X tweet DOM
      const cell = document.createElement('div');
      cell.setAttribute('data-testid', 'cellInnerDiv');
      cell.innerHTML =
        '<article data-testid="tweet"><a href="/spammer_bot/status/999001"><time>now</time></a><p>Check out spamphrase right now!</p></article>';
      document.body.appendChild(cell);
      const article = cell.querySelector<HTMLElement>('article[data-testid="tweet"]')!;

      const controller = new DomController('');
      activeControllers.push(controller);
      const initial = getState().data!;
      controller.update(initial.config, initial.snapshot);
      controller.ingest({ '999001': { tweet: makeSampleTweet() } }, {});

      const unsub = subscribe(() => {
        const st = getState();
        if (st.data) {
          controller.update(st.data.config, st.data.snapshot);
        }
      });
      activeUnsubscribers.push(unsub);

      const { container } = await renderMounted(
        <ContentApp controller={controller} />
      );
      await flushUi();

      expect(article.getAttribute('data-kxc-hidden')).toBe('true');
      const inlineHost = cell.querySelector('kxc-inline[data-kxc-kind="collapse"]');
      expect(inlineHost?.shadowRoot).not.toBeNull();

      // Expand collapse bar
      const trigger = inlineHost!.shadowRoot!.querySelector('.collapse-trigger');
      await clickEl(trigger);
      await flushUi();

      const adjustBtn = inlineHost!.shadowRoot!.querySelector(
        '[data-kxc-action="adjust"]'
      );
      const disableBtn = inlineHost!.shadowRoot!.querySelector(
        '[data-kxc-action="disable"]'
      );
      expect(adjustBtn).not.toBeNull();
      expect(disableBtn).not.toBeNull();

      // Adjust button dispatches options.open
      await clickEl(adjustBtn);
      await flushUi();
      expect(dispatchedCommands).toContainEqual({
        type: 'options.open',
        page: 'keywords',
        query: { tab: 'custom', focus: 'kw-live-1' },
      });

      // Disable button runs real target.disable, restores tweet DOM, unmounts collapse bar, keeps root toast!
      await clickEl(disableBtn);
      await flushUi();

      expect((await readConfig()).rules.keywords.items[0]?.enabled).toBe(false);
      expect(article.hasAttribute('data-kxc-hidden')).toBe(false);
      expect(
        cell.querySelector('kxc-inline[data-kxc-kind="collapse"]')
      ).toBeNull();

      const toast = container.querySelector('[data-kxc-inline-toast="true"]');
      expect(toast?.textContent).toContain(m.content.itemDisabledToast);
    });

    it('renders error toast on disable failure and never renders adjust/disable for promoted_ad', async () => {
      const cfg = createDefaultConfig('standard');
      cfg.locale = 'en';
      await setupHarness({
        config: cfg,
        commandOverrides: {
          'target.disable': async () => {
            throw new Error('Write failure');
          },
        },
      });
      const { m } = getI18n('en');

      const portalHost = document.createElement('div');
      document.body.appendChild(portalHost);
      const adHost = document.createElement('div');
      document.body.appendChild(adHost);

      const items: InlineItem[] = [
        {
          id: 'c-fail',
          kind: 'collapse',
          container: portalHost,
          expanded: true,
          toggle: () => {},
          decision: makeDecision({
            ruleId: 'keyword',
            matchedTarget: { kind: 'keyword', id: 'kw-fail' },
          }),
        },
        {
          id: 'c-ad',
          kind: 'collapse',
          container: adHost,
          expanded: true,
          toggle: () => {},
          decision: makeDecision({
            ruleId: 'promoted_ad',
            matchedTarget: { kind: 'keyword', id: 'should-never-disable' },
          }),
        },
      ];

      const stubController = {
        subscribe: () => () => {},
        getSnapshot: () => items,
        subscribeTheme: () => () => {},
        isPageDark: () => false,
      } as unknown as DomController;

      const { container } = await renderMounted(
        <ContentApp controller={stubController} />
      );
      await flushUi();

      // promoted_ad has neither adjust nor disable even with synthetic item matchedTarget
      expect(adHost.querySelector('[data-kxc-action="adjust"]')).toBeNull();
      expect(adHost.querySelector('[data-kxc-action="disable"]')).toBeNull();

      // Failing disable renders error toast
      await clickEl(portalHost.querySelector('[data-kxc-action="disable"]'));
      await flushUi();
      const toast = container.querySelector('[data-kxc-inline-toast="true"]');
      expect(toast?.textContent).toContain(m.content.itemDisableFailedToast);
    });
  });

  describe('Suite 5: AccountsPage deep-links', () => {
    it('opens ImportWizard on ?tab=white&action=import, cleans hash on close, and reopens on live hashchange', async () => {
      await setupHarness();
      const { m } = getI18n('en');

      await setHash('#/accounts?tab=white&action=import');
      const { container } = await renderMounted(<AccountsPage />);
      await flushUi();

      expect(
        container
          .querySelector('[data-tab="white"]')
          ?.getAttribute('aria-selected')
      ).toBe('true');
      const dialog = container.querySelector('dialog[open]');
      expect(dialog?.textContent).toContain(m.importWizard.title);

      // Close modal -> removes action=import while preserving tab=white
      await clickEl(
        dialog!.querySelector(`button[aria-label="${m.common.close}"]`)
      );
      await flushUi();
      expect(container.querySelector('dialog[open]')).toBeNull();
      expect(window.location.hash).toBe('#/accounts?tab=white');

      // Reopen via action=import
      await setHash('#/accounts?tab=white&action=import');
      await flushUi();
      expect(container.querySelector('dialog[open]')).not.toBeNull();

      // Close again, then reopen via focus=import
      await clickEl(
        container.querySelector(
          `dialog[open] button[aria-label="${m.common.close}"]`
        )
      );
      await flushUi();
      await setHash('#/accounts?tab=white&focus=import');
      await flushUi();
      expect(container.querySelector('dialog[open]')).not.toBeNull();

      await clickEl(
        container.querySelector(
          `dialog[open] button[aria-label="${m.common.close}"]`
        )
      );
      await flushUi();
      expect(window.location.hash).toBe('#/accounts?tab=white');

      // Same-tab reuse after user switches to Black tab must restore White tab + reopen ImportWizard (C1-R2-4)
      await clickEl(container.querySelector('[data-tab="black"]'));
      await flushUi();
      expect(
        container
          .querySelector('[data-tab="black"]')
          ?.getAttribute('aria-selected')
      ).toBe('true');
      expect(
        container
          .querySelector('[data-tab="white"]')
          ?.getAttribute('aria-selected')
      ).toBe('false');

      await setHash('#/accounts?tab=white&action=import');
      await flushUi();
      expect(
        container
          .querySelector('[data-tab="white"]')
          ?.getAttribute('aria-selected')
      ).toBe('true');
      expect(container.querySelector('dialog[open]')).not.toBeNull();
    });
  });

  describe('Suite 6: RulesPage', () => {
    it('covers all 11 rules, grokFilter validation & slider max 64, duplicate replies, 10-locale summaries, sceneModes & deep-links', async () => {
      const defaults = createDefaultConfig('standard');
      expect(ruleDefinitions.map((r) => r.key).sort()).toEqual(
        Object.keys(defaults.rules).sort()
      );
      expect(ruleDefinitions).toHaveLength(11);

      // SummarizeRule across all 10 locales
      for (const locale of SUPPORTED_LOCALES) {
        for (const groups of [undefined, ['universal'] as const, [] as const]) {
          const cfg = createDefaultConfig('standard');
          cfg.locale = locale;
          cfg.enabledCloudLangGroups = groups ? [...groups] : undefined;
          cfg.disabledCloudKeywordIds = [DEFAULT_CLOUD_KEYWORDS[0]!.id];
          const summary = summarizeRule('keywords', cfg, DEFAULT_CLOUD_KEYWORDS);
          expect(summary.trim().length).toBeGreaterThan(0);
        }
        const disabledCfg = createDefaultConfig('standard');
        disabledCfg.locale = locale;
        disabledCfg.rules.keywords.enabled = false;
        expect(
          summarizeRule('keywords', disabledCfg, DEFAULT_CLOUD_KEYWORDS).trim()
            .length
        ).toBeGreaterThan(0);
        expect(
          summarizeRule('grokFilter', disabledCfg, DEFAULT_CLOUD_KEYWORDS).trim()
            .length
        ).toBeGreaterThan(0);
        expect(
          summarizeRule('domainFilter', disabledCfg, DEFAULT_CLOUD_KEYWORDS)
            .trim().length
        ).toBeGreaterThan(0);
      }

      const { dispatchedCommands } = await setupHarness();
      const { m } = getI18n('en');

      await setHash('#/rules?focus=grokFilter');
      const { container } = await renderMounted(<RulesPage />);
      await flushUi();

      expect(container.querySelectorAll('[data-rule-key]')).toHaveLength(11);
      const grokSection = container.querySelector<HTMLElement>(
        '[data-rule-key="grokFilter"]'
      )!;
      expect(grokSection.getAttribute('data-focused')).toBe('true');
      expect(window.location.hash).toContain('focus=grokFilter');

      // grokFilter switches and range/number controls
      expect(
        findSwitchByLabel(grokSection, m.rules.fields.protectOfficialGrok)
      ).toBeDefined();
      expect(
        findSwitchByLabel(grokSection, m.rules.fields.blockShortMentions)
      ).toBeDefined();
      expect(
        findSwitchByLabel(grokSection, m.rules.fields.hideGrokReplies)
      ).toBeDefined();

      const slider = grokSection.querySelector<HTMLInputElement>(
        'input[type="range"]'
      )!;
      const numInput = grokSection.querySelector<HTMLInputElement>(
        'input[type="number"]'
      )!;
      expect(slider.min).toBe('1');
      expect(slider.max).toBe('64');
      expect(numInput.min).toBe('1');

      const patchCountBefore = dispatchedCommands.filter(
        (c) => c.type === 'config.patch'
      ).length;
      for (const badVal of ['0', '-1', '1.5', '']) {
        await act(async () => {
          numInput.focus();
          setControlValue(numInput, badVal);
        });
        await act(async () => {
          numInput.blur();
        });
        await flushUi();
        expect(grokSection.querySelector('[role="alert"]')).not.toBeNull();
      }
      expect(
        dispatchedCommands.filter((c) => c.type === 'config.patch').length
      ).toBe(patchCountBefore);

      // Valid commit 64
      await act(async () => {
        numInput.focus();
        setControlValue(numInput, '64');
      });
      await act(async () => {
        numInput.blur();
      });
      await flushUi();
      expect((await readConfig()).rules.grokFilter.maxMentionWeightedLength).toBe(
        64
      );

      // Collapse grokFilter manually, then navigate via same-tab reuse (#/rules?rule=grokFilter)
      const grokTrigger = grokSection.querySelector<HTMLButtonElement>(
        'button.rule-open'
      )!;
      await clickEl(grokTrigger);
      expect(grokTrigger.getAttribute('aria-expanded')).toBe('false');
      await setHash('#/rules?rule=grokFilter');
      await flushUi();
      expect(grokTrigger.getAttribute('aria-expanded')).toBe('true');

      // Live hashchange to ?rule=domainFilter
      await setHash('#/rules?rule=domainFilter');
      await flushUi();
      const domainSection = container.querySelector<HTMLElement>(
        '[data-rule-key="domainFilter"]'
      )!;
      expect(domainSection.getAttribute('data-focused')).toBe('true');
      expect(
        domainSection.querySelector('a[href="#/keywords?tab=domains"]')
      ).not.toBeNull();

      // replySpam.blockDuplicateReplies toggle
      const replySection = container.querySelector<HTMLElement>(
        '[data-rule-key="replySpam"]'
      )!;
      await clickEl(replySection.querySelector('button.rule-open'));
      const dupSwitch = findSwitchByLabel(
        replySection,
        m.rules.fields.blockDuplicateReplies
      )!;
      expect(dupSwitch.getAttribute('aria-checked')).toBe('true');
      await clickEl(dupSwitch);
      await flushUi();
      expect((await readConfig()).rules.replySpam.blockDuplicateReplies).toBe(
        false
      );

      // sceneModes matrix + bypass note + reset all
      await clickEl(container.querySelector('.scene-modes-toggle'));
      await flushUi();
      const sceneRows = container.querySelectorAll('[data-scene-mode-row]');
      expect(sceneRows).toHaveLength(4);

      const forYouRow = container.querySelector(
        '[data-scene-mode-row="for_you"]'
      )!;
      const followingRow = container.querySelector(
        '[data-scene-mode-row="following"]'
      )!;
      await clickEl(
        findButtonByText(forYouRow, m.rules.sceneModes.modes.strip) ?? null
      );
      await flushUi();
      await clickEl(
        findButtonByText(followingRow, m.rules.sceneModes.modes.bypass) ?? null
      );
      await flushUi();
      expect((await readConfig()).sceneModes).toMatchObject({
        for_you: 'strip',
        following: 'bypass',
      });
      expect(container.textContent).toContain(m.rules.sceneModes.bypassNote);

      await clickEl(
        findButtonByText(container, m.rules.sceneModes.resetAllBtn) ?? null
      );
      await flushUi();
      expect((await readConfig()).sceneModes).toEqual({
        for_you: 'inherit',
        following: 'inherit',
        reply: 'inherit',
        search: 'inherit',
      });
      expect(container.textContent).not.toContain(
        m.rules.sceneModes.bypassNote
      );
    });
  });

  describe('Suite 7: KeywordsPage, DomainsTab & PacksTab', () => {
    it('classifies cloud rules by packCategory first and surfaces hotfix nsfw items under nsfw_black', async () => {
      const makeKw = (
        id: string,
        packCategory?: string
      ): KeywordRuleItem => ({
        id,
        pattern: id,
        isRegex: false,
        scopes: ['text'],
        enabled: true,
        ...(packCategory ? { packCategory } : {}),
      });

      expect(getCloudCategory(makeKw('hotfix-adult-99', 'nsfw'))).toBe(
        'nsfw_black'
      );
      expect(getCloudCategory(makeKw('hotfix-adult-100', 'nsfw_black'))).toBe(
        'nsfw_black'
      );
      expect(getCloudCategory(makeKw('hotfix-crypto-1', 'crypto'))).toBe(
        'crypto'
      );
      expect(getCloudCategory(makeKw('hotfix-cliche-1', 'cliche'))).toBe(
        'cliche'
      );
      expect(getCloudCategory(makeKw('hotfix-follow-1', 'follow'))).toBe(
        'follow'
      );
      expect(getCloudCategory(makeKw('cloud-gambling-cn-1', 'scam'))).toBe(
        'nsfw_black'
      );
      expect(getCloudCategory(makeKw('cloud-blackmarket-1', 'scam'))).toBe(
        'nsfw_black'
      );
      expect(getCloudCategory(makeKw('cloud-cliche-1'))).toBe('cliche');
      expect(getCloudCategory(makeKw('cloud-nsfw-1'))).toBe('nsfw_black');
      expect(getCloudCategory(makeKw('cloud-scam-crypto-1'))).toBe('crypto');

      const snapshot = createDefaultCrowdSnapshot();
      snapshot.cloudKeywords = [
        ...snapshot.cloudKeywords,
        {
          id: 'hotfix-adult-99',
          pattern: 'hotfix-nsfw-pattern',
          isRegex: false,
          scopes: ['text'],
          enabled: true,
          langGroup: 'en',
          packCategory: 'nsfw',
        },
      ];
      await setupHarness({ snapshot });
      const { m } = getI18n('en');

      await setHash('#/keywords?tab=cloud');
      const { container } = await renderMounted(<KeywordsPage />);
      await flushUi();

      const nsfwChip = Array.from(
        container.querySelectorAll<HTMLButtonElement>('.lang-chip')
      ).find((b) => b.textContent?.includes(m.keywords.categories.nsfw_black));
      await clickEl(nsfwChip ?? null);
      await flushUi();

      expect(
        container.querySelector('tr[data-item-id="hotfix-adult-99"]')
      ).not.toBeNull();
    });

    it('restores default language packs via config.replace so enabledCloudLangGroups clears to undefined', async () => {
      for (const pinnedGroups of [
        ['universal', 'en', 'ja'] as const,
        ['universal', 'en'] as const,
      ]) {
        const cfg = createDefaultConfig('standard');
        cfg.locale = 'en';
        cfg.enabledCloudLangGroups = [...pinnedGroups];
        const { dispatchedCommands } = await setupHarness({ config: cfg });
        const { m } = getI18n('en');

        await setHash('#/keywords?tab=cloud');
        const { container } = await renderMounted(<KeywordsPage />);
        await flushUi();

        const resetBtn = findButtonByText(
          container,
          m.keywords.resetLangGroupsBtn
        );
        expect(resetBtn).toBeDefined();
        await clickEl(resetBtn!);
        await flushUi();

        const replaceCmd = dispatchedCommands.find(
          (c) => c.type === 'config.replace'
        );
        expect(replaceCmd).toBeDefined();
        expect((await readConfig()).enabledCloudLangGroups).toBeUndefined();
      }
    });

    it('prevents pagination lock-in, search/category wipeout, and handles same-tab reuse cleanly', async () => {
      const cfg = createDefaultConfig('standard');
      cfg.locale = 'en';
      cfg.rules.keywords.items = Array.from({ length: 30 }, (_, i) => ({
        id: `kw-${String(i + 1).padStart(2, '0')}`,
        pattern: `pattern-${String(i + 1).padStart(2, '0')}`,
        isRegex: false,
        scopes: ['text' as const],
        enabled: true,
      }));
      cfg.rules.domainFilter.items = Array.from({ length: 30 }, (_, i) => ({
        id: `dom-${String(i + 1).padStart(2, '0')}`,
        domain: `d${i + 1}.example`,
        enabled: true,
      }));

      await setupHarness({ config: cfg });
      const { m } = getI18n('en');

      // Custom page-2 focus -> allows Prev Page back to 1/2 AND preserves search after toggle
      await setHash('#/keywords?tab=custom&focus=kw-27');
      const { container } = await renderMounted(<KeywordsPage />);
      await flushUi();

      expect(container.querySelector('tr[data-item-id="kw-27"]')).not.toBeNull();
      expect(container.querySelector('.pagination')?.textContent).toContain(
        '2 / 2'
      );

      await clickEl(
        container.querySelector(`button[aria-label="${m.common.prevPage}"]`)
      );
      await flushUi();
      expect(container.querySelector('.pagination')?.textContent).toContain(
        '1 / 2'
      );
      expect(container.querySelector('tr[data-item-id="kw-05"]')).not.toBeNull();

      // Typing in search box + toggling kw-05 switch must NOT wipe search text
      const searchInput = container.querySelector<HTMLInputElement>(
        'input[type="search"]'
      )!;
      await act(async () => {
        setControlValue(searchInput, 'pattern-05');
      });
      await flushUi();
      await clickEl(
        container.querySelector('tr[data-item-id="kw-05"] button[role="switch"]')
      );
      await flushUi();
      expect(searchInput.value).toBe('pattern-05');

      // Cloud category chip NOT wiped on cloud item toggle
      await setHash('#/keywords?tab=cloud&focus=cloud-follow-ja-1');
      await flushUi();
      const cryptoChip = Array.from(
        container.querySelectorAll<HTMLButtonElement>('.lang-chip')
      ).find((b) => b.textContent?.includes(m.keywords.categories.crypto))!;
      await clickEl(cryptoChip);
      await flushUi();
      expect(cryptoChip.getAttribute('aria-pressed')).toBe('true');

      const firstCloudSwitch = container.querySelector<HTMLButtonElement>(
        'tbody tr button[role="switch"]'
      )!;
      await clickEl(firstCloudSwitch);
      await flushUi();
      expect(cryptoChip.getAttribute('aria-pressed')).toBe('true');

      // Same-tab reuse: domains?focus=dom-01 -> click Custom -> hashchange domains?focus=dom-02 switches back to Domains
      await setHash('#/keywords?tab=domains&focus=dom-01');
      await flushUi();
      expect(
        container
          .querySelector('[data-tab="domains"]')
          ?.getAttribute('aria-selected')
      ).toBe('true');

      await clickEl(container.querySelector('[data-tab="custom"]'));
      await flushUi();
      expect(
        container
          .querySelector('[data-tab="custom"]')
          ?.getAttribute('aria-selected')
      ).toBe('true');

      await setHash('#/keywords?tab=domains&focus=dom-02');
      await flushUi();
      expect(
        container
          .querySelector('[data-tab="domains"]')
          ?.getAttribute('aria-selected')
      ).toBe('true');
    });

    it('scrolls DomainsTab page-2 cold-load target exactly once after mount, allows paginating back, and runs Domain CRUD', async () => {
      const cfg = createDefaultConfig('standard');
      cfg.locale = 'en';
      cfg.rules.domainFilter.items = Array.from({ length: 30 }, (_, i) => ({
        id: `dom-${String(i + 1).padStart(2, '0')}`,
        domain: `d${i + 1}.example`,
        enabled: true,
      }));
      await setupHarness({ config: cfg });
      const { m } = getI18n('en');

      const scrolledNodes: Element[] = [];
      const scrollSpy = vi.fn(function (this: Element) {
        scrolledNodes.push(this);
      });
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: scrollSpy,
      });

      await setHash('#/keywords?tab=domains&focus=dom-27');
      const { container } = await renderMounted(<KeywordsPage />);
      await flushUi();
      await flushRaf();

      const targetRow = container.querySelector('tr[data-focus-id="dom-27"]');
      expect(targetRow).not.toBeNull();
      expect(scrolledNodes).toEqual([targetRow]);

      // Click Prev Page -> stays on 1 / 2
      await clickEl(
        container.querySelector(`button[aria-label="${m.common.prevPage}"]`)
      );
      await flushUi();
      expect(container.querySelector('.pagination')?.textContent).toContain(
        '1 / 2'
      );

      // Domain CRUD: Add with normalization preview -> duplicate check -> toggle -> delete
      await clickEl(
        findButtonByText(container, m.keywords.domains.addBtn) ?? null
      );
      await flushUi();

      const dialog = container.querySelector('dialog[open]')!;
      const domainInput = dialog.querySelector<HTMLInputElement>('input.input')!;
      await act(async () => {
        setControlValue(domainInput, 'https://WWW.Spam.Example/path');
      });
      await flushUi();
      expect(dialog.textContent).toContain('spam.example');

      await clickEl(
        findButtonByText(dialog, m.keywords.domains.editor.saveAddBtn) ?? null
      );
      await flushUi();

      const afterAdd = (await readConfig()).rules.domainFilter.items;
      const added = afterAdd.find((d) => d.domain === 'spam.example');
      expect(added).toBeDefined();

      // Duplicate validation
      await clickEl(
        findButtonByText(container, m.keywords.domains.addBtn) ?? null
      );
      await flushUi();
      const dupDialog = container.querySelector('dialog[open]')!;
      const dupInput = dupDialog.querySelector<HTMLInputElement>('input.input')!;
      await act(async () => {
        setControlValue(dupInput, 'spam.example');
      });
      await flushUi();
      expect(dupDialog.textContent).toContain(
        m.keywords.domains.editor.duplicateError
      );
      await clickEl(findButtonByText(dupDialog, m.common.cancel) ?? null);
      await flushUi();
      // Discard confirm if dirty
      const discardBtn = findButtonByText(
        container,
        m.keywords.editor.discardBtn
      );
      if (discardBtn) {
        await clickEl(discardBtn);
        await flushUi();
      }

      // Filter down to spam.example, toggle, then delete
      const domSearch = container.querySelector<HTMLInputElement>(
        'input[type="search"]'
      )!;
      await act(async () => {
        setControlValue(domSearch, 'spam.example');
      });
      await flushUi();

      const row = container.querySelector(`tr[data-item-id="${added!.id}"]`)!;
      await clickEl(row.querySelector('button[role="switch"]'));
      await flushUi();
      expect(
        (await readConfig()).rules.domainFilter.items.find(
          (d) => d.id === added!.id
        )?.enabled
      ).toBe(false);

      await clickEl(
        row.querySelector(
          `button[aria-label="${m.keywords.domains.deleteItemAria('spam.example')}"]`
        )
      );
      await flushUi();
      await clickEl(
        findButtonByText(
          container.querySelector('dialog[open]')!,
          m.keywords.domains.deleteConfirmBtn
        ) ?? null
      );
      await flushUi();
      expect(
        (await readConfig()).rules.domainFilter.items.some(
          (d) => d.id === added!.id
        )
      ).toBe(false);
    });

    it('supports PacksTab collapse without lockout, file.text() error catching, preview/install, privacy-safe export & clean uninstall', async () => {
      const existingPack: InstalledRulePack = {
        format: RULE_PACK_FORMAT,
        id: 'pack-alpha',
        name: 'Alpha Pack',
        description: 'Existing installed pack',
        version: '1.0.0',
        updatedAt: '2026-05-01',
        enabled: true,
        installedAt: 1_700_000_000_000,
        keywords: [
          {
            id: 'pk-item-1',
            pattern: 'packspam',
            isRegex: false,
            scopes: ['text'],
            enabled: true,
          },
        ],
      };
      const personalKw: KeywordRuleItem = {
        id: 'personal-kw-1',
        pattern: 'my-personal-rule',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      };
      const personalDom: DomainRuleItem = {
        id: 'personal-dom-1',
        domain: 'personal.example',
        enabled: true,
      };
      const cfg = createDefaultConfig('standard');
      cfg.locale = 'en';
      cfg.rules.keywords.items = [personalKw];
      cfg.rules.domainFilter.items = [personalDom];
      cfg.whitelistUids = {
        '777001': { uid: '777001', screenName: 'trusted_user', addedAt: 1000 },
      };
      cfg.localBlocklistUids = {
        '888001': { uid: '888001', screenName: 'blocked_user', addedAt: 1000 },
      };
      cfg.installedPacks = [existingPack];

      await setupHarness({ config: cfg });
      const { m } = getI18n('en');

      // 1. Pack collapse NOT locked out on toggle when URL has ?pack=pack-alpha
      await setHash('#/keywords?tab=packs&pack=pack-alpha');
      const { container } = await renderMounted(<KeywordsPage />);
      await flushUi();

      expect(container.querySelector('.pack-items-box')).not.toBeNull();
      const collapseBtn = container.querySelector<HTMLButtonElement>(
        `button[aria-expanded="true"]`
      )!;
      await clickEl(collapseBtn);
      await flushUi();
      expect(container.querySelector('.pack-items-box')).toBeNull();

      await clickEl(
        container.querySelector(
          `button[role="switch"][aria-label="${m.keywords.packs.enablePackAria('Alpha Pack')}"]`
        )
      );
      await flushUi();
      expect(container.querySelector('.pack-items-box')).toBeNull();

      // 2. PackImportModal: file.text() rejection caught cleanly, invalid/forbidden rejected, valid preview shows overwrite & whitelist warnings -> install
      await clickEl(
        findButtonByText(container, m.keywords.packs.importBtn) ?? null
      );
      await flushUi();

      const importDialog = container.querySelector('dialog[open]')!;
      const fileInput =
        importDialog.querySelector<HTMLInputElement>('input[type="file"]')!;
      const brokenFile = new File(['{}'], 'broken.kxc-pack.json', {
        type: 'application/json',
      });
      Object.defineProperty(brokenFile, 'text', {
        value: vi.fn().mockRejectedValue(new Error('Disk read failed')),
      });
      await act(async () => {
        Object.defineProperty(fileInput, 'files', {
          configurable: true,
          value: [brokenFile],
        });
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flushUi();
      expect(importDialog.textContent).toContain('Disk read failed');

      // Forbidden key (whitelistUids) rejected
      const textarea = importDialog.querySelector<HTMLTextAreaElement>(
        'textarea'
      )!;
      await act(async () => {
        setControlValue(
          textarea,
          JSON.stringify({
            format: RULE_PACK_FORMAT,
            id: 'evil-pack',
            name: 'Evil',
            description: 'Bad',
            version: '1.0.0',
            updatedAt: '2026-05-10',
            whitelistUids: { '1': {} },
          })
        );
      });
      await clickEl(
        findButtonByText(importDialog, m.keywords.packs.importModal.previewBtn) ??
          null
      );
      await flushUi();
      expect(importDialog.querySelector('.banner.error')).not.toBeNull();
      expect(
        findButtonByText(
          importDialog,
          m.keywords.packs.importModal.confirmInstallBtn
        )?.disabled
      ).toBe(true);

      // Valid pack with overwrite ID ('pack-alpha') and whitelisted UID ('777001')
      const validPayload: RulePackPayload = {
        format: RULE_PACK_FORMAT,
        id: 'pack-alpha',
        name: 'Alpha Pack v2',
        description: 'Updated alpha pack',
        version: '2.0.0',
        updatedAt: '2026-05-10',
        keywords: [
          {
            id: 'pk-item-2',
            pattern: 'newpackspam',
            isRegex: false,
            scopes: ['text'],
            enabled: true,
          },
        ],
        blockedUids: [
          { uid: '777001', screenName: 'trusted_user', addedAt: 1000 },
        ],
      };
      await act(async () => {
        setControlValue(textarea, JSON.stringify(validPayload));
      });
      await clickEl(
        findButtonByText(importDialog, m.keywords.packs.importModal.previewBtn) ??
          null
      );
      await flushUi();
      const previewBox = importDialog.querySelector(
        '[data-kxc-pack-preview="true"]'
      )!;
      expect(previewBox).not.toBeNull();
      expect(previewBox.textContent).toContain(
        m.keywords.packs.importModal.overwriteWarning('1.0.0', '2.0.0')
      );
      expect(previewBox.textContent).toContain(
        m.keywords.packs.importModal.whitelistConflictWarning(1)
      );

      await clickEl(
        findButtonByText(
          importDialog,
          m.keywords.packs.importModal.confirmInstallBtn
        ) ?? null
      );
      await flushUi();
      expect((await readConfig()).installedPacks?.[0]?.version).toBe('2.0.0');

      // 3. Export / Share Pack: CJK name -> ASCII ID, blocked accounts unchecked by default, zero whitelist/prefs/API leakage
      let copiedJson = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: vi.fn(async (text: string) => {
            copiedJson = text;
          }),
        },
      });
      await clickEl(
        findButtonByText(container, m.keywords.packs.exportBtn) ?? null
      );
      await flushUi();
      const exportDialog = container.querySelector('dialog[open]')!;
      const nameInput =
        exportDialog.querySelector<HTMLInputElement>('input.input')!;
      await act(async () => {
        setControlValue(nameInput, '垃圾过滤包');
      });

      // Blocked accounts checkbox MUST be unchecked by default
      const accountCheckbox = Array.from(
        exportDialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      ).find((cb) => cb.parentElement?.textContent?.includes('@blocked_user'));
      expect(accountCheckbox?.checked).toBe(false);

      await clickEl(
        findButtonByText(exportDialog, m.keywords.packs.exportModal.copyBtn) ??
          null
      );
      await flushUi();
      const parsedExport = validateRulePack(JSON.parse(copiedJson));
      expect(/^[a-z0-9][a-z0-9._-]{1,63}$/.test(parsedExport.id)).toBe(true);
      expect(parsedExport.blockedUids).toBeUndefined();
      expect(copiedJson).not.toContain('whitelistUids');
      expect(copiedJson).not.toContain('customApiBaseUrl');
      expect(copiedJson).not.toContain('syncNativeXBlock');

      await clickEl(findButtonByText(exportDialog, m.common.cancel) ?? null);
      await flushUi();

      // 4. Uninstall pack leaves personal keywords & domains untouched
      await clickEl(
        container.querySelector('[data-kxc-pack-uninstall="true"]')
      );
      await flushUi();
      await clickEl(
        findButtonByText(
          container.querySelector('dialog[open]')!,
          m.keywords.packs.uninstallConfirmBtn
        ) ?? null
      );
      await flushUi();
      const afterUninstall = await readConfig();
      expect(afterUninstall.installedPacks ?? []).toHaveLength(0);
      expect(afterUninstall.rules.keywords.items).toEqual([personalKw]);
      expect(afterUninstall.rules.domainFilter.items).toEqual([personalDom]);
    });

    it('clears matching active search on live hashchange and jumps to page-2 target on Custom, Domains, and Cloud tabs (C1-R2-1)', async () => {
      const cfg = createDefaultConfig('standard');
      cfg.locale = 'en';
      cfg.rules.keywords.items = Array.from({ length: 30 }, (_, i) => ({
        id: `kw-${String(i + 1).padStart(2, '0')}`,
        pattern: `pattern_${String(i + 1).padStart(2, '0')}`,
        isRegex: false,
        scopes: ['text' as const],
        enabled: true,
      }));
      cfg.rules.domainFilter.items = Array.from({ length: 30 }, (_, i) => ({
        id: `dom-${String(i + 1).padStart(2, '0')}`,
        domain: `site-${String(i + 1).padStart(2, '0')}.example.com`,
        enabled: true,
      }));
      await setupHarness({ config: cfg });
      const { m } = getI18n('en');

      const scrolledNodes: Element[] = [];
      const scrollSpy = vi.fn(function (this: Element) {
        scrolledNodes.push(this);
      });
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: scrollSpy,
      });

      // 1. Custom tab: active search matches kw-27 (temporarily on Page 1), then live hashchange to focus=kw-27
      await setHash('#/keywords?tab=custom&focus=kw-01');
      const { container } = await renderMounted(<KeywordsPage />);
      await flushUi();
      await flushRaf();
      scrolledNodes.length = 0;

      const customSearch = container.querySelector<HTMLInputElement>(
        'input[type="search"]'
      )!;
      await act(async () => {
        setControlValue(customSearch, 'pattern_27');
      });
      await flushUi();
      expect(container.querySelectorAll('tbody tr')).toHaveLength(1);

      await setHash('#/keywords?tab=custom&focus=kw-27');
      await flushUi();
      await flushRaf();

      expect(customSearch.value).toBe('');
      expect(container.querySelector('.pagination')?.textContent).toContain(
        '2 / 2'
      );
      const customTargetRow = container.querySelector(
        'tr[data-focus-id="kw-27"]'
      );
      expect(customTargetRow).not.toBeNull();
      expect(customTargetRow?.getAttribute('data-focused')).toBe('true');
      expect(scrolledNodes).toEqual([customTargetRow]);

      // 2. Domains tab: active search matches dom-27 (temporarily on Page 1), then live hashchange to focus=dom-27
      await setHash('#/keywords?tab=domains&focus=dom-01');
      await flushUi();
      await flushRaf();
      scrolledNodes.length = 0;

      const domainsSearch = container.querySelector<HTMLInputElement>(
        'input[type="search"]'
      )!;
      await act(async () => {
        setControlValue(domainsSearch, 'site-2');
      });
      await flushUi();
      expect(container.querySelector('tr[data-focus-id="dom-27"]')).not.toBeNull();

      await setHash('#/keywords?tab=domains&focus=dom-27');
      await flushUi();
      await flushRaf();

      expect(domainsSearch.value).toBe('');
      expect(container.querySelector('.pagination')?.textContent).toContain(
        '2 / 2'
      );
      const domainTargetRow = container.querySelector(
        'tr[data-focus-id="dom-27"]'
      );
      expect(domainTargetRow).not.toBeNull();
      expect(domainTargetRow?.getAttribute('data-focused')).toBe('true');
      expect(scrolledNodes).toEqual([domainTargetRow]);

      // 3. Cloud tab: active search + category chip match collapsed-group item, then live hashchange clears filters & expands group before scrolling
      const jaTarget = DEFAULT_CLOUD_KEYWORDS.find((k) => k.langGroup === 'ja')!;
      await setHash('#/keywords?tab=cloud');
      await flushUi();
      scrolledNodes.length = 0;

      const cloudSearch = container.querySelector<HTMLInputElement>(
        'input[type="search"]'
      )!;
      await act(async () => {
        setControlValue(cloudSearch, jaTarget.pattern);
      });
      await flushUi();
      const followChip = Array.from(
        container.querySelectorAll<HTMLButtonElement>('.lang-chip')
      ).find((b) =>
        b.textContent?.includes(m.keywords.categories[getCloudCategory(jaTarget)])
      );
      if (followChip) {
        await clickEl(followChip);
        await flushUi();
      }
      expect(
        container.querySelector(`tr[data-focus-id="${jaTarget.id}"]`)
      ).not.toBeNull();

      await setHash(`#/keywords?tab=cloud&focus=${jaTarget.id}`);
      await flushUi();
      await flushRaf();

      expect(cloudSearch.value).toBe('');
      const allChip = Array.from(
        container.querySelectorAll<HTMLButtonElement>('.lang-chip')
      ).find((b) => b.textContent?.includes(m.keywords.categories.all));
      expect(allChip?.getAttribute('aria-pressed')).toBe('true');
      const cloudTargetRow = container.querySelector(
        `tr[data-focus-id="${jaTarget.id}"]`
      );
      expect(cloudTargetRow).not.toBeNull();
      expect(cloudTargetRow?.getAttribute('data-focused')).toBe('true');
      expect(scrolledNodes).toEqual([cloudTargetRow]);
    });

    it('scopes PacksTab item focus IDs by pack ID so shared item IDs across two packs never leak highlight or scroll wrong pack (C1-R2-2)', async () => {
      const packA: InstalledRulePack = {
        format: RULE_PACK_FORMAT,
        id: 'pack-a',
        name: 'Pack A',
        description: 'First pack',
        version: '1.0.0',
        updatedAt: '2026-05-01',
        enabled: true,
        installedAt: 1_700_000_000_000,
        keywords: [
          {
            id: 'shared-item',
            pattern: 'alpha-shared',
            isRegex: false,
            scopes: ['text'],
            enabled: true,
          },
        ],
        blockedUids: [
          { uid: '999888', screenName: 'shared_bot', addedAt: 1000 },
        ],
      };
      const packB: InstalledRulePack = {
        format: RULE_PACK_FORMAT,
        id: 'pack-b',
        name: 'Pack B',
        description: 'Second pack',
        version: '1.0.0',
        updatedAt: '2026-05-02',
        enabled: true,
        installedAt: 1_700_000_001_000,
        keywords: [
          {
            id: 'shared-item',
            pattern: 'beta-shared',
            isRegex: false,
            scopes: ['text'],
            enabled: true,
          },
        ],
        blockedUids: [
          { uid: '999888', screenName: 'shared_bot', addedAt: 1000 },
        ],
      };
      const cfg = createDefaultConfig('standard');
      cfg.locale = 'en';
      cfg.installedPacks = [packA, packB];
      await setupHarness({ config: cfg });

      const scrolledNodes: Element[] = [];
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: vi.fn(function (this: Element) {
          scrolledNodes.push(this);
        }),
      });

      // Expand pack-a first
      await setHash('#/keywords?tab=packs&pack=pack-a');
      const { container } = await renderMounted(<KeywordsPage />);
      await flushUi();
      await flushRaf();
      scrolledNodes.length = 0;

      // Navigate to pack-b's shared-item while pack-a remains expanded
      await setHash('#/keywords?tab=packs&pack=pack-b&focus=shared-item');
      await flushUi();
      await flushRaf();

      const packARow = container.querySelector(
        '[data-pack-id="pack-a"] [data-item-id="shared-item"]'
      );
      const packBRow = container.querySelector(
        '[data-pack-id="pack-b"] [data-item-id="shared-item"]'
      );
      expect(packARow).not.toBeNull();
      expect(packBRow).not.toBeNull();
      expect(packARow!.getAttribute('data-focused')).toBeNull();
      expect(packARow!.classList.contains('focus-highlight')).toBe(false);
      expect(packBRow!.getAttribute('data-focused')).toBe('true');
      expect(packBRow!.classList.contains('focus-highlight')).toBe(true);
      expect(scrolledNodes).toEqual([packBRow]);

      // Also verify shared blocked UID across both packs
      scrolledNodes.length = 0;
      await setHash('#/keywords?tab=packs&pack=pack-b&focus=999888');
      await flushUi();
      await flushRaf();

      const packAUidRow = container.querySelector(
        '[data-pack-id="pack-a"] [data-item-id="999888"]'
      );
      const packBUidRow = container.querySelector(
        '[data-pack-id="pack-b"] [data-item-id="999888"]'
      );
      expect(packAUidRow!.getAttribute('data-focused')).toBeNull();
      expect(packBUidRow!.getAttribute('data-focused')).toBe('true');
      expect(scrolledNodes).toEqual([packBUidRow]);
    });
  });

  describe('Suite 8: useFocusHighlight control-char & one-shot safety', () => {
    it('safely scrolls focusIds containing CSS control chars when CSS is undefined and does not re-scroll on ready bounce', async () => {
      vi.stubGlobal('CSS', undefined);
      const scrollSpy = vi.fn();
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: scrollSpy,
      });

      const nastyId = 'foo\nbar]baz"qux';
      expect(parseHashQuery('#/keywords?tab=packs&pack=crypto&focus=k1').get('pack')).toBe('crypto');
      expect(parseHashQuery('#/rules').toString()).toBe('');

      function Harness({
        focusId,
        ready,
      }: {
        focusId: string | null;
        ready: boolean;
      }) {
        const active = useFocusHighlight(focusId, { ready });
        return (
          <div
            data-focus-id={focusId ?? undefined}
            data-active={active ?? ''}
          />
        );
      }

      await setHash('#/test?focus=nasty');
      const mounted = await renderMounted(
        <Harness focusId={nastyId} ready={true} />
      );
      await flushRaf();
      expect(scrollSpy).toHaveBeenCalledTimes(1);

      // Ready bounce (true -> false -> true) with same hash MUST NOT re-scroll
      await act(async () => {
        mounted.root.render(<Harness focusId={nastyId} ready={false} />);
      });
      await act(async () => {
        mounted.root.render(<Harness focusId={nastyId} ready={true} />);
      });
      await flushRaf();
      expect(scrollSpy).toHaveBeenCalledTimes(1);

      // New hash navigation with SAME focusId MUST re-trigger scroll
      await setHash('#/test?focus=nasty&n=2');
      await flushRaf();
      expect(scrollSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Suite 9: HistoryPage & ReportCardModal', () => {
    it('cross-filters rule breakdown, hardens corrupt/prototype stats, memoizes rollStats, and handles ReportCardModal actions & errors', async () => {
      const now = new Date(2026, 4, 10, 12, 0, 0);
      const dates = trailingLocalDates(7, now);
      const logs: InterceptionLogEntry[] = [
        {
          id: 'l-1',
          tweetId: '1001',
          authorUid: '501',
          authorScreenName: 'rep_bot',
          authorName: 'Rep Bot',
          tweetSnippet: 'Duplicate reply spam',
          ruleId: 'reply_spam',
          reasonText: 'Duplicate reply',
          scene: 'reply',
          timestamp: Date.now() - 2000,
        },
        {
          id: 'l-2',
          tweetId: '1002',
          authorUid: '502',
          authorScreenName: 'grok_fan',
          authorName: 'Grok Fan',
          tweetSnippet: '@grok is this true',
          ruleId: 'grok_filter',
          reasonText: 'Short @grok mention',
          scene: 'reply',
          timestamp: Date.now() - 1000,
        },
      ];
      const stats: Stats = {
        ...defaultStats(now),
        todayBlocked: 15,
        totalBlocked: 120,
        todayAdsHidden: 4,
        totalAdsHidden: 60,
        byRule: {
          reply_spam: 80,
          grok_filter: 40,
          promoted_ad: 60,
        },
        dailyHistory: dates.map((date, idx) => ({
          date,
          blocked: idx + 1,
          ads: idx % 2,
        })),
      };

      await setupHarness({ logs, stats });
      const { m } = getI18n('en');

      const { container } = await renderMounted(<HistoryPage />);
      await flushUi();

      // promoted_ad renders as static div, NOT button
      const adRow = container.querySelector('[data-rule-id="promoted_ad"]');
      expect(adRow?.tagName).toBe('DIV');
      expect(adRow?.classList.contains('rule-dist-static')).toBe(true);

      // 7-day trend chart renders 7 columns
      expect(
        container.querySelectorAll('[data-kxc-trend="true"] .trend-col')
      ).toHaveLength(7);

      // Click reply_spam breakdown bar -> syncs <select> and filters table
      const replyBar = container.querySelector<HTMLButtonElement>(
        'button[data-rule-id="reply_spam"]'
      )!;
      const ruleSelect = container.querySelector<HTMLSelectElement>(
        `select[aria-label="${m.history.filterRuleAria}"]`
      )!;
      await clickEl(replyBar);
      await flushUi();
      expect(replyBar.getAttribute('aria-pressed')).toBe('true');
      expect(ruleSelect.value).toBe('reply_spam');
      expect(container.querySelectorAll('tbody tr')).toHaveLength(1);

      // Click again -> resets to 'all'
      await clickEl(replyBar);
      await flushUi();
      expect(ruleSelect.value).toBe('all');
      expect(container.querySelectorAll('tbody tr')).toHaveLength(2);

      // Memoized rollStats check: opening ReportCardModal then typing in search box MUST NOT re-invoke Canvas render
      const { getContextSpy } = stubCanvasForModal({
        blob: new Blob(['png'], { type: 'image/png' }),
      });
      await clickEl(container.querySelector('[data-kxc-report-btn="true"]'));
      await flushUi();
      const callsAfterOpen = getContextSpy.mock.calls.length;
      expect(callsAfterOpen).toBe(1);

      const historySearch = container.querySelector<HTMLInputElement>(
        'input[type="search"]'
      )!;
      await act(async () => {
        setControlValue(historySearch, 'Duplicate');
      });
      await flushUi();
      expect(getContextSpy.mock.calls.length).toBe(callsAfterOpen);
    });

    it('sanitizes prototype keys, unknown keys, fractional counts, and corrupt KPIs in HistoryPage without crashing', async () => {
      const poisonedByRule = JSON.parse(
        '{"__proto__":25,"constructor":15,"toString":10,"legacy_unknown":12,"grok_filter":0.4,"reply_spam":5}'
      ) as Partial<Record<TriggeredRuleId, number>>;
      const corruptStats: Stats = {
        ...defaultStats(),
        todayBlocked: Number.NaN,
        totalBlocked: Number.POSITIVE_INFINITY,
        todayAdsHidden: -3,
        totalAdsHidden: Number.POSITIVE_INFINITY,
        byRule: poisonedByRule,
      };
      await setupHarness({ stats: corruptStats });

      const { container } = await renderMounted(<HistoryPage />);
      await flushUi();

      const statStrongTexts = Array.from(
        container.querySelectorAll('.stats .stat strong')
      ).map((el) => el.textContent?.trim());
      expect(statStrongTexts).toEqual(['0', '0', '0']);
      expect(container.textContent).not.toContain('NaN');
      expect(container.textContent).not.toContain('∞');
      expect(container.textContent).not.toContain('-3');

      const distButtons = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button[data-rule-id]')
      ).map((b) => b.getAttribute('data-rule-id'));
      expect(distButtons).toEqual(['reply_spam']);
    });

    it('renders synthetic __proto__ log scene safely in table and detail modal without crashing (LOW-1)', async () => {
      const poisonedLog = {
        id: 'l-proto-scene',
        tweetId: '2001',
        authorUid: '601',
        authorScreenName: 'proto_user',
        authorName: 'Proto User',
        tweetSnippet: 'Synthetic poisoned scene log',
        ruleId: 'reply_spam' as const,
        reasonText: 'Poisoned scene check',
        scene: '__proto__' as unknown as InterceptionLogEntry['scene'],
        timestamp: Date.now() - 1000,
      };
      await setupHarness({ logs: [poisonedLog] });
      const { m } = getI18n('en');

      const { container } = await renderMounted(<HistoryPage />);
      await flushUi();

      const row = container.querySelector('tbody tr');
      expect(row).not.toBeNull();
      expect(row!.textContent).toContain('__proto__');

      // Open detail modal and ensure detail.scene also renders safely
      await clickEl(
        row!.querySelector(
          `button[aria-label="${m.history.viewDetailAria('2001')}"]`
        )
      );
      await flushUi();
      const dialog = container.querySelector('dialog[open]');
      expect(dialog).not.toBeNull();
      expect(dialog!.textContent).toContain('__proto__');
    });

    it('handles ReportCardModal copy fallback/success, localDate download fallback, and clears stale blob on re-render error', async () => {
      await setupHarness();
      const { m } = getI18n('en');

      const pngBlob = new Blob(['valid-png'], { type: 'image/png' });
      const { toBlobSpy } = stubCanvasForModal({ blob: pngBlob });

      const createObjectURL = vi.fn(() => 'blob:mock-report');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: createObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: revokeObjectURL,
      });
      let downloadedFilename = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
        function (this: HTMLAnchorElement) {
          downloadedFilename = this.download;
        }
      );

      const statsValidDate: Stats = {
        ...defaultStats(),
        todayDate: '2026-05-10',
        totalBlocked: 10,
      };
      const mounted = await renderMounted(
        <ReportCardModal stats={statsValidDate} onClose={vi.fn()} />
      );
      await flushUi();

      const copyBtn = findButtonByText(
        mounted.container,
        m.history.report.copyImageBtn
      )!;
      const downloadBtn = findButtonByText(
        mounted.container,
        m.history.report.downloadPngBtn
      )!;
      expect(copyBtn.disabled).toBe(false);
      expect(downloadBtn.disabled).toBe(false);

      // Copy fallback when ClipboardItem is undefined
      vi.stubGlobal('ClipboardItem', undefined);
      await clickEl(copyBtn);
      await flushUi();
      expect(mounted.container.textContent).toContain(
        m.history.report.copyFallbackNotice
      );

      // Copy happy path with ClipboardItem + clipboard.write
      class FakeClipboardItem {
        constructor(public readonly items: Record<string, Blob>) {}
      }
      vi.stubGlobal('ClipboardItem', FakeClipboardItem);
      const writeSpy = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { write: writeSpy },
      });
      await clickEl(copyBtn);
      await flushUi();
      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(mounted.container.textContent).toContain(
        m.history.report.copiedImageBtn
      );

      // Download with valid YYYY-MM-DD
      await clickEl(downloadBtn);
      expect(downloadedFilename).toBe('keepxclean-report-2026-05-10.png');

      // Invalid todayDate falls back to localDate()
      const statsBadDate: Stats = {
        ...defaultStats(),
        todayDate: 'bad-date',
        totalBlocked: 11,
      };
      await act(async () => {
        mounted.root.render(
          <ReportCardModal stats={statsBadDate} onClose={vi.fn()} />
        );
      });
      await flushUi();
      await clickEl(
        findButtonByText(mounted.container, m.history.report.downloadPngBtn) ??
          null
      );
      expect(downloadedFilename).toBe(`keepxclean-report-${localDate()}.png`);

      // Re-render error clears stale blob and disables BOTH Copy Image and Download PNG
      toBlobSpy.mockImplementation((cb) => {
        queueMicrotask(() => cb(null));
      });
      const statsNext: Stats = {
        ...defaultStats(),
        todayDate: '2026-05-11',
        totalBlocked: 12,
      };
      await act(async () => {
        mounted.root.render(
          <ReportCardModal stats={statsNext} onClose={vi.fn()} />
        );
      });
      await flushUi();

      expect(mounted.container.querySelector('.banner.error')).not.toBeNull();
      const copyBtnAfterErr =
        findButtonByText(mounted.container, m.history.report.copyImageBtn) ??
        findButtonByText(mounted.container, m.history.report.copiedImageBtn);
      const downloadBtnAfterErr = findButtonByText(
        mounted.container,
        m.history.report.downloadPngBtn
      );
      expect(copyBtnAfterErr?.disabled).toBe(true);
      expect(downloadBtnAfterErr?.disabled).toBe(true);
    });
  });

  describe('Suite 10: PreferencesPage Cross-Device Sync', () => {
    it('renders all 6 CloudSyncStatus states accurately with usage meta and local-only notice', async () => {
      const { m } = getI18n('en');
      const cs = m.preferences.cloudSync;
      const statuses: CloudSyncStatus[] = [
        'idle',
        'syncing',
        'synced',
        'conflict',
        'quota_exceeded',
        'error',
      ];
      for (const status of statuses) {
        const meta: CloudSyncMeta = {
          enabled: status === 'synced' || status === 'syncing',
          status,
          bytesUsed: 4096,
          chunkCount: 2,
          lastPushAt: Date.now() - 10_000,
          ...(status === 'error' ? { error: 'Boom' } : {}),
          ...(status === 'conflict'
            ? {
                pendingRemote: makeSyncedPayload(),
                remoteUpdatedAt: 1_700_000_000_000,
              }
            : {}),
        };
        await setupHarness({ cloudSync: meta });
        const { container } = await renderMounted(<PreferencesPage />);
        await flushUi();

        const syncBox = container.querySelector('[data-kxc-cloud-sync="true"]')!;
        expect(syncBox.textContent).toContain(cs.statuses[status]);
        expect(syncBox.textContent).toContain(cs.localOnlyNotice);
        expect(syncBox.textContent).toContain(cs.usageMeta('4.0 KB', 2));
        if (status === 'quota_exceeded') {
          expect(syncBox.textContent).toContain(cs.quotaBanner);
        }
        if (status === 'conflict') {
          expect(syncBox.textContent).toContain(cs.conflictBanner);
        }
        if (status === 'error') {
          expect(syncBox.textContent).toContain('Boom');
        }
      }

      // Defense-in-depth: non-finite bytesUsed (Infinity) must NOT render "Infinity KB" (LOW-2)
      await setupHarness({
        cloudSync: {
          enabled: true,
          status: 'synced',
          bytesUsed: Number.POSITIVE_INFINITY,
          chunkCount: Number.POSITIVE_INFINITY,
        },
      });
      const { container: infContainer } = await renderMounted(
        <PreferencesPage />
      );
      await flushUi();
      const infBox = infContainer.querySelector('[data-kxc-cloud-sync="true"]')!;
      expect(infBox.textContent).not.toContain('Infinity');
      expect(infBox.textContent).not.toContain('NaN');
    });

    it('opens conflict modal immediately on IPC lag, guards against stale auto-pop, suppresses stray 0, and gates success toast on synced', async () => {
      const remotePayload = makeSyncedPayload();
      const { env, dispatchedCommands, overrides } = await setupHarness({
        cloudSync: defaultCloudSyncMeta(),
        commandOverrides: {
          'cloudSync.enable': async () => ({
            enabled: false,
            status: 'conflict' as const,
            pendingRemote: remotePayload,
            remoteUpdatedAt: 0,
          }),
        },
      });
      const { m } = getI18n('en');
      const cs = m.preferences.cloudSync;

      const { container } = await renderMounted(<PreferencesPage />);
      await flushUi();

      // 1. IPC race (enableCloudSync returns conflict before storage.local updates) -> modal opens immediately
      const enableSwitch = container.querySelector<HTMLButtonElement>(
        `button[role="switch"][aria-label="${cs.enableTitle}"]`
      )!;
      await clickEl(enableSwitch);
      await flushUi();

      const modal = container.querySelector('dialog[open]')!;
      expect(modal).not.toBeNull();
      expect(modal.textContent).toContain(cs.conflictModal.title);

      // 2. remoteUpdatedAt === 0 MUST NOT render a stray literal "0" text node
      const stack = modal.querySelector('.dialog-body > .stack')!;
      const directTextNodes = Array.from(stack.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .filter(Boolean);
      expect(directTextNodes).not.toContain('0');

      // 3. Stale conflictOpen guard: storage catches up to conflict, then resolves externally -> later conflict MUST NOT auto-pop
      await act(async () => {
        await env.api.storage.local.set({
          [UI_KEYS.cloudSync]: {
            enabled: false,
            status: 'conflict',
            pendingRemote: remotePayload,
            remoteUpdatedAt: 1_700_000_000_000,
          },
        });
      });
      await flushUi();
      expect(container.querySelector('dialog[open]')).not.toBeNull();

      await act(async () => {
        await env.api.storage.local.set({
          [UI_KEYS.cloudSync]: {
            enabled: true,
            status: 'synced',
          },
        });
      });
      await flushUi();
      expect(container.querySelector('dialog[open]')).toBeNull();

      await act(async () => {
        await env.api.storage.local.set({
          [UI_KEYS.cloudSync]: {
            enabled: false,
            status: 'conflict',
            pendingRemote: remotePayload,
            remoteUpdatedAt: 1_700_000_001_000,
          },
        });
      });
      await flushUi();
      expect(container.querySelector('dialog[open]')).toBeNull();

      // 4. Non-'synced' resolution (quota_exceeded) closes modal WITHOUT green resolvedNotice
      overrides['cloudSync.resolve'] = async () => {
        const degraded: CloudSyncMeta = {
          enabled: true,
          status: 'quota_exceeded',
        };
        await env.api.storage.local.set({ [UI_KEYS.cloudSync]: degraded });
        return degraded;
      };
      await clickEl(findButtonByText(container, cs.resolveBtn) ?? null);
      await flushUi();
      await clickEl(
        findButtonByText(
          container.querySelector('dialog[open]')!,
          cs.conflictModal.mergeBtn
        ) ?? null
      );
      await flushUi();
      expect(container.querySelector('dialog[open]')).toBeNull();
      expect(container.textContent).toContain(cs.quotaBanner);
      expect(container.textContent).not.toContain(cs.resolvedNotice);

      // 5. All 3 strategies ('merge', 'local', 'remote') returning 'synced' dispatch exact command & show green toast
      const strategyButtons: Array<{
        strategy: 'merge' | 'local' | 'remote';
        label: string;
      }> = [
        { strategy: 'merge', label: cs.conflictModal.mergeBtn },
        { strategy: 'local', label: cs.conflictModal.keepLocalBtn },
        { strategy: 'remote', label: cs.conflictModal.useRemoteBtn },
      ];

      for (const item of strategyButtons) {
        await act(async () => {
          await env.api.storage.local.set({
            [UI_KEYS.cloudSync]: {
              enabled: false,
              status: 'conflict',
              pendingRemote: remotePayload,
              remoteUpdatedAt: 1_700_000_002_000,
            },
          });
        });
        await flushUi();
        overrides['cloudSync.resolve'] = async () => {
          const synced: CloudSyncMeta = {
            enabled: true,
            status: 'synced',
            lastPushAt: Date.now(),
          };
          await env.api.storage.local.set({ [UI_KEYS.cloudSync]: synced });
          return synced;
        };

        await clickEl(findButtonByText(container, cs.resolveBtn) ?? null);
        await flushUi();
        await clickEl(
          findButtonByText(
            container.querySelector('dialog[open]')!,
            item.label
          ) ?? null
        );
        await flushUi();

        expect(dispatchedCommands).toContainEqual({
          type: 'cloudSync.resolve',
          strategy: item.strategy,
        });
        expect(container.textContent).toContain(cs.resolvedNotice);
      }
    });

    it('BUG-C2-1, BUG-C2-2 & BUG-C2-4 UI regressions: computeRecordDiff handles prototype-key IDs accurately and ContentApp ignores prototype-key restIds', async () => {
      // BUG-C2-2: adding/changing/removing items with Object.prototype property names
      const kwBefore = {
        id: 'constructor',
        pattern: 'spam_a',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      };
      const kwChanged = { ...kwBefore, pattern: 'spam_b' };
      expect(
        computeRecordDiff(
          Object.fromEntries([]),
          Object.fromEntries([
            ['constructor', kwBefore],
            ['toString', { ...kwBefore, id: 'toString' }],
            ['valueOf', { ...kwBefore, id: 'valueOf' }],
          ])
        )
      ).toEqual({ added: 3, changed: 0, removed: 0 });
      expect(
        computeRecordDiff(
          Object.fromEntries([
            ['constructor', kwBefore],
            ['valueOf', { ...kwBefore, id: 'valueOf' }],
          ]),
          Object.fromEntries([])
        )
      ).toEqual({ added: 0, changed: 0, removed: 2 });
      expect(
        computeRecordDiff(
          Object.fromEntries([['constructor', kwBefore]]),
          Object.fromEntries([['constructor', kwChanged]])
        )
      ).toEqual({ added: 0, changed: 1, removed: 0 });

      // BUG-C2-1: PacksTab defense-in-depth does not falsely expand a pack with a prototype-colliding ID on initial render
      const cfg = createDefaultConfig('standard');
      cfg.locale = 'en';
      cfg.installedPacks = [
        {
          format: RULE_PACK_FORMAT,
          id: 'constructor',
          name: 'Proto Pack',
          description: 'Legacy proto ID test',
          version: '1.0.0',
          updatedAt: '2026-11-25T00:00:00Z',
          keywords: [
            {
              id: 'k-proto-1',
              pattern: 'proto_kw_item',
              isRegex: false,
              scopes: ['text'],
              enabled: true,
            },
          ],
          enabled: true,
          installedAt: 1_700_000_000_000,
        },
      ];
      await setupHarness({
        commandOverrides: {
          'state.get': async () => ({
            config: cfg,
            snapshot: createDefaultCrowdSnapshot(),
            logs: [],
            stats: defaultStats(),
            sync: { status: 'idle', source: 'builtin' },
            cloudSync: defaultCloudSyncMeta(),
            health: defaultParseHealth(),
            operations: [],
            imports: [],
            viewers: [],
          }),
        },
      });
      window.location.hash = '#/keywords?tab=packs';
      const { container: kwContainer } = await renderMounted(<KeywordsPage />);
      const packCard = kwContainer.querySelector('[data-pack-id="constructor"]');
      expect(packCard).not.toBeNull();
      // Must NOT be falsely expanded by Object.prototype.constructor!
      expect(packCard!.querySelector('.pack-items-box')).toBeNull();
      const expandBtn = packCard!.querySelector<HTMLButtonElement>(
        'button[aria-expanded]'
      );
      expect(expandBtn?.getAttribute('aria-expanded')).toBe('false');
      await clickEl(expandBtn);
      await flushUi();
      expect(packCard!.querySelector('.pack-items-box')).not.toBeNull();
      expect(expandBtn?.getAttribute('aria-expanded')).toBe('true');

      // BUG-C2-4: ContentApp profile inline bar does NOT falsely mark restId="constructor" as allowlisted/blocked
      const fakeAuthor: ExtractedAuthor = {
        restId: 'constructor',
        screenName: 'proto_profile',
        name: 'Proto',
        bio: '',
        bioUrls: [],
        createdAt: '',
        accountAgeDays: 100,
        statusesCount: 50,
        dailyTweetRate: 0.5,
        followersCount: 100,
        friendsCount: 50,
        followRatio: 0.5,
        mediaCount: 0,
        favouritesCount: 0,
        isBlueVerified: false,
        following: false,
        defaultProfileImage: false,
      };
      const profileHost = document.createElement('div');
      document.body.appendChild(profileHost);
      const profileItem: InlineItem = {
        id: 'profile:proto_profile',
        container: profileHost,
        kind: 'profile',
        author: fakeAuthor,
        badges: [],
      };
      const snapshotItems = [profileItem];
      const stubController = {
        subscribe: () => () => undefined,
        getSnapshot: () => snapshotItems,
        subscribeTheme: () => () => undefined,
        isPageDark: () => false,
      } as unknown as DomController;
      await renderMounted(<ContentApp controller={stubController} />);
      const { m } = getI18n('en');
      expect(profileHost.textContent).not.toContain(m.content.inWhitelistPill);
      expect(profileHost.textContent).not.toContain(m.content.unblockBtn);
      expect(profileHost.textContent).not.toContain('Community:');
    });
  });
});
