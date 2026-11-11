import {
  createDefaultConfig,
  STORAGE_KEYS,
  type ViewerProfile,
} from '@keepxclean/shared';
import { applyConfigCommand } from '../src/background/config';
import {
  appendLogs,
  enqueue,
  initializeStorage,
  readConfig,
  readState,
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
  resumeJobs,
  retryBlock,
  retryImport,
  runOperation,
  startBlock,
  startImport,
  undoBlock,
} from '../src/background/jobs';
import {
  digest,
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
    switch (action.type) {
      case 'state.get':
        return readState();
      case 'config.patch':
      case 'config.preset':
      case 'config.replace':
      case 'config.reset':
      case 'keyword.save':
      case 'keyword.delete':
      case 'account.save':
      case 'account.delete':
        return enqueue(async () => {
          const next = applyConfigCommand(await readConfig(), action);
          await checkServicePermission(next);
          await writeConfig(next);
        });
      case 'config.recover':
        return enqueue(async () => {
          const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
          assert(
            digest(data[STORAGE_KEYS.CONFIG]) === action.expected,
            '配置已变化，请重新加载'
          );
          await chrome.storage.local.set({
            [UI_KEYS.backup]: {
              config: data[STORAGE_KEYS.CONFIG],
              savedAt: Date.now(),
            },
            [STORAGE_KEYS.CONFIG]: createDefaultConfig(),
          });
        });
      case 'logs.clear':
        return enqueue(() =>
          chrome.storage.local.set({ [STORAGE_KEYS.INTERCEPTION_LOGS]: [] })
        );
      case 'logs.append':
        assert(
          Array.isArray(action.entries) && action.entries.length <= 2000,
          '日志格式无效'
        );
        return enqueue(() => appendLogs(action.entries));
      case 'snapshot.refresh':
        return refreshSnapshot();
      case 'viewer.set':
        return enqueue(async () => {
          assert(sender.tab?.id !== undefined, '账号信息只能来自 X 标签页');
          const viewer: ViewerProfile = action.viewer;
          assert(
            viewer &&
              UID.test(viewer.restId) &&
              /^[a-f0-9]{64}$/.test(viewer.reporterHash) &&
              Number.isFinite(viewer.accountAgeDays) &&
              viewer.accountAgeDays >= 0 &&
              Number.isFinite(viewer.followersCount),
            '账号资料无效'
          );
          const data = await chrome.storage.local.get(UI_KEYS.viewers);
          const viewers = data[UI_KEYS.viewers] ?? {};
          const previous = viewers[sender.tab.id];
          viewers[sender.tab.id] =
            previous?.restId === viewer.restId
              ? {
                  ...viewer,
                  screenName: viewer.screenName || previous.screenName,
                  accountAgeDays:
                    viewer.screenName && viewer.accountAgeDays > 0
                      ? viewer.accountAgeDays
                      : previous.accountAgeDays > 0
                        ? previous.accountAgeDays
                        : viewer.accountAgeDays,
                  followersCount:
                    viewer.followersCount > 0
                      ? viewer.followersCount
                      : previous.followersCount,
                }
              : viewer;
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
      case 'options.open':
        assert(!action.page || /^[a-z]+$/.test(action.page), '页面参数无效');
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
        throw new Error('不支持的操作');
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
