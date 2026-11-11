import { STORAGE_KEYS, type ViewerProfile } from '@keepxclean/shared';
import {
  applyConfigCommand,
  mergeViewerProfile,
} from '../src/background/config';
import {
  appendLogs,
  enqueue,
  initializeStorage,
  readConfig,
  readState,
  recoverConfig,
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
import { assert, UID } from '../src/services/validation';

export default defineBackground(() => {
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
      case 'cloudKeyword.toggle':
      case 'cloudKeyword.customize':
      case 'account.save':
      case 'account.delete':
        return enqueue(async () => {
          const next = applyConfigCommand(await readConfig(), action);
          await checkServicePermission(next);
          await writeConfig(next);
        });
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
          const viewer: ViewerProfile = action.viewer;
          assert(
            viewer &&
              UID.test(viewer.restId) &&
              /^[a-f0-9]{64}$/.test(viewer.reporterHash) &&
              Number.isFinite(viewer.accountAgeDays) &&
              viewer.accountAgeDays >= 0 &&
              Number.isFinite(viewer.followersCount),
            e.expectObject('viewer')
          );
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
        assert(!action.page || /^[a-z]+$/.test(action.page), e.unknownConfigField);
        return chrome.tabs.create({
          url: chrome.runtime.getURL(`options.html#/${action.page || 'rules'}`),
        });
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
