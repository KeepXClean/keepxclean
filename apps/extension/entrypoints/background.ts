import { STORAGE_KEYS, type ViewerProfile } from '@keepxclean/shared';
import {
  applyConfigCommand,
  mergeViewerProfile,
  openOptionsPage,
} from '../src/background/config';
import {
  CLOUD_SYNC_PUSH_ALARM,
  disableCloudSync,
  enableCloudSync,
  flushCloudSyncPush,
  handleSyncStorageChanged,
  pullCloudSyncIfEnabled,
  pushCloudSyncNow,
  resolveCloudSync,
  scheduleCloudSyncPush,
} from '../src/background/cloud-sync';
import {
  appendLogs,
  dismissParseHealth,
  enqueue,
  initializeStorage,
  readConfig,
  readState,
  recoverConfig,
  setOnConfigWrittenHook,
  updateParseHealth,
  writeConfig,
} from '../src/background/repository';
import {
  checkServicePermission,
  refreshSnapshot,
} from '../src/background/remote';
import {
  applyImport,
  cancelImport,
  changeReason,
  resolveAccount,
  resumeJobs,
  retryBlock,
  retryImport,
  runOperation,
  startBlock,
  startImport,
  undoBlock,
} from '../src/background/jobs';
import { getActiveErrors } from '../src/i18n/errors';
import {
  errorText,
  UI_KEYS,
  type Command,
  type Result,
} from '../src/services/model';
import { assert, record, UID } from '../src/services/validation';

export default defineBackground(() => {
  setOnConfigWrittenHook(() => scheduleCloudSyncPush());

  let initialized: Promise<void> | undefined;
  const ready = () =>
    initialized ??
    (initialized = initializeStorage()
      .then(resumeJobs)
      .catch((error) => {
        initialized = undefined;
        throw error;
      }));
  const badge = async () => {
    try {
      const { config, stats } = await readState();
      await chrome.action.setBadgeText({
        text: !config.enabled
          ? 'OFF'
          : stats.todayBlocked
            ? stats.todayBlocked > 999
              ? '999+'
              : String(stats.todayBlocked)
            : '',
      });
      await chrome.action.setBadgeBackgroundColor({
        color: config.enabled ? '#13865F' : '#607168',
      });
    } catch {
      await chrome.action.setBadgeText({ text: '!' });
    }
  };
  void ready()
    .then(badge)
    .catch(() => undefined);
  const setup = async () => {
    await ready();
    if (!(await chrome.alarms.get('kxc-sync')))
      await chrome.alarms.create('kxc-sync', { periodInMinutes: 30 });
    void refreshSnapshot().catch(() => undefined);
    void pullCloudSyncIfEnabled().catch(() => undefined);
  };
  chrome.runtime.onInstalled.addListener(() => {
    void setup().catch(() => undefined);
  });
  chrome.runtime.onStartup.addListener(() => {
    void setup().catch(() => undefined);
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'kxc-sync')
      void refreshSnapshot().catch(() => undefined);
    if (alarm.name === CLOUD_SYNC_PUSH_ALARM)
      void ready()
        .then(() => flushCloudSyncPush())
        .catch(() => undefined);
    if (alarm.name.startsWith('kxc-op-'))
      void ready()
        .then(() => runOperation(alarm.name.slice(7)))
        .catch(() => undefined);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      (changes[STORAGE_KEYS.CONFIG] || changes[UI_KEYS.stats])
    )
      void badge();
    if (area === 'sync')
      void ready()
        .then(() => handleSyncStorageChanged(changes, area))
        .catch(() => undefined);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void enqueue(async () => {
      const data = await chrome.storage.local.get(UI_KEYS.viewers);
      const viewers = data[UI_KEYS.viewers] ?? {};
      delete viewers[tabId];
      await chrome.storage.local.set({ [UI_KEYS.viewers]: viewers });
    });
  });

  async function dispatch(
    action: Command,
    sender: chrome.runtime.MessageSender
  ): Promise<unknown> {
    await ready();
    const e = getActiveErrors();
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
        return enqueue(async () => {
          const next = applyConfigCommand(await readConfig(), action);
          await checkServicePermission(next);
          await writeConfig(next);
        });
      case 'cloudSync.enable':
        return enableCloudSync();
      case 'cloudSync.resolve':
        return resolveCloudSync(action.strategy);
      case 'cloudSync.disable':
        return disableCloudSync();
      case 'cloudSync.pushNow':
        return pushCloudSyncNow();
      case 'health.update':
        return enqueue(() => updateParseHealth(action.report));
      case 'health.dismiss':
        return enqueue(() => dismissParseHealth());
      case 'account.resolve':
        return resolveAccount(action.query, sender.tab?.id);
      case 'config.recover':
        return enqueue(() => recoverConfig(action.expected));
      case 'logs.clear':
        return enqueue(() =>
          chrome.storage.local.set({ [STORAGE_KEYS.INTERCEPTION_LOGS]: [] })
        );
      case 'logs.append':
        assert(
          Array.isArray(action.entries) && action.entries.length <= 2000,
          e.expectObject('entries')
        );
        return enqueue(() => appendLogs(action.entries));
      case 'snapshot.refresh':
        return refreshSnapshot();
      case 'viewer.set':
        return enqueue(async () => {
          assert(sender.tab?.id !== undefined, e.missingXTab);
          const rawViewer = record(action.viewer, 'viewer');
          assert(
            typeof rawViewer.restId === 'string' &&
              UID.test(rawViewer.restId) &&
              typeof rawViewer.reporterHash === 'string' &&
              /^[a-f0-9]{64}$/.test(rawViewer.reporterHash) &&
              typeof rawViewer.screenName === 'string' &&
              rawViewer.screenName.length <= 100 &&
              typeof rawViewer.accountAgeDays === 'number' &&
              Number.isFinite(rawViewer.accountAgeDays) &&
              rawViewer.accountAgeDays >= 0 &&
              typeof rawViewer.followersCount === 'number' &&
              Number.isFinite(rawViewer.followersCount) &&
              rawViewer.followersCount >= 0,
            e.expectObject('viewer')
          );
          const viewer: ViewerProfile = {
            restId: rawViewer.restId,
            screenName: rawViewer.screenName,
            accountAgeDays: rawViewer.accountAgeDays,
            followersCount: rawViewer.followersCount,
            reporterHash: rawViewer.reporterHash,
          };
          const data = await chrome.storage.local.get(UI_KEYS.viewers);
          const viewers = data[UI_KEYS.viewers] ?? {};
          const previous = viewers[sender.tab.id];
          viewers[sender.tab.id] = mergeViewerProfile(previous, viewer);
          await chrome.storage.local.set({ [UI_KEYS.viewers]: viewers });
        });
      case 'tabs.list':
        return (
          await chrome.tabs.query({
            url: ['*://*.x.com/*', '*://*.twitter.com/*'],
          })
        )
          .filter((t) => t.id !== undefined)
          .map((t) => ({
            id: t.id,
            title: t.title || t.url || 'X',
            url: t.url,
            current: t.id === sender.tab?.id,
          }));
      case 'tabs.reloadX': {
        if (sender.tab?.id !== undefined) {
          await chrome.tabs.reload(sender.tab.id);
          return { reloaded: 1 };
        }
        const xTabs = (
          await chrome.tabs.query({
            url: ['*://*.x.com/*', '*://*.twitter.com/*'],
          })
        ).filter((t) => t.id !== undefined);
        await Promise.all(xTabs.map((t) => chrome.tabs.reload(t.id!)));
        return { reloaded: xTabs.length };
      }
      case 'options.open':
        return openOptionsPage(action.page, action.query);
      case 'block.start':
        return startBlock(
          action.entry,
          sender.tab?.id,
          action.followers,
          action.nativeAlreadyDone
        );
      case 'block.reason':
        return changeReason(action.id, action.tag);
      case 'block.undo':
        return undoBlock(action.id);
      case 'block.retry':
        return retryBlock(action.id, action.stage);
      case 'import.read':
        return startImport(action.tabId);
      case 'import.apply':
        return applyImport(action.id, action.share, action.moveConflicts);
      case 'import.cancel':
        return cancelImport(action.id);
      case 'import.retry':
        return retryImport(action.id);
      default:
        throw new Error(e.unknownConfigField);
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      message?.type !== 'KXC_COMMAND' ||
      typeof message.action?.type !== 'string'
    )
      return false;
    void dispatch(message.action as Command, sender)
      .then((data) => respond({ ok: true, data } satisfies Result))
      .catch((error) =>
        respond({ ok: false, error: errorText(error) } satisfies Result)
      );
    return true;
  });
});
