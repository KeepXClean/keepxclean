// Test-only browser host. Never part of extension entrypoints or production output.
import { createRoot } from 'react-dom/client';
import '../../entrypoints/popup/popup.css';
import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  isUILocaleSetting,
  STORAGE_KEYS,
  type ExtractedTweet,
  type InterceptionLogEntry,
} from '@keepxclean/shared';
import { App as Options } from '../../entrypoints/options/App';
import { App as Popup } from '../../entrypoints/popup/App';
import { ContentApp } from '../../src/content/ContentApp';
import { DomController } from '../../src/content/dom-controller';
import { applyConfigCommand } from '../../src/background/config';
import {
  enqueue,
  readConfig,
  readState,
  writeConfig,
} from '../../src/background/repository';
import {
  applyImport,
  cancelImport,
  changeReason,
  resolveAccount,
  retryBlock,
  retryImport,
  startBlock,
  startImport,
  undoBlock,
} from '../../src/background/jobs';
import { refreshSnapshot } from '../../src/background/remote';
import {
  defaultStats,
  errorText,
  UI_KEYS,
  type Command,
} from '../../src/services/model';
import { getState, subscribe } from '../../src/state/store';
import '../../src/styles/global.css';
import css from '../../src/ui/ui.css?inline';
const params = new URLSearchParams(location.search),
  scenario = params.get('state') || 'normal',
  surface = params.get('surface') || 'options',
  langParam = params.get('lang');
const config = createDefaultConfig();
if (langParam && isUILocaleSetting(langParam)) {
  config.locale = langParam;
}
config.syncNativeXBlock = false;
config.enableCrowdReport = false;
if (scenario === 'paused') config.enabled = false;
const snapshot = createDefaultCrowdSnapshot();
snapshot.counts = {
  '2001001': { c: 8, t: 'spam' },
  '2001002': { c: 12, t: 'scam', p: true },
};
snapshot.totalAccounts = 2;
snapshot.totalReports = 20;
const logs: InterceptionLogEntry[] =
  scenario === 'empty'
    ? []
    : Array.from({ length: 8 }, (_, i) => ({
        id: `sample-${i}`,
        tweetId: String(12345001 + i),
        authorUid: String(2001001 + i),
        authorScreenName: `sample_${i + 1}`,
        authorName: [
          '示例 · 窗边',
          '示例 · 山野来信',
          '示例 · 云端日记',
          '示例 · 午后花园',
        ][i % 4],
        tweetSnippet: [
          '记录旅行中的一些碎片与发现。',
          '今日资讯摘要，仅用于界面验收。',
          '这是一条脱敏的示例内容。',
        ][i % 3],
        scene: i % 2 ? 'reply' : 'timeline',
        ruleId: (
          [
            'high_frequency_daily',
            'reply_spam',
            'impersonation',
            'engagement_bait',
          ] as const
        )[i % 4],
        reasonText: [
          '历史日均 95 条，超过当前门槛',
          '评论区极短灌水回复',
          '疑似高仿原推主 (@sample_author)',
          '口令引流 / 诱导转赞评',
        ][i % 4],
        timestamp: Date.now() - i * 600000,
        evidence: [{ label: '数据类型', value: '脱敏测试样本' }],
      }));
const values: Record<string, unknown> = {
  [STORAGE_KEYS.CONFIG]: config,
  [STORAGE_KEYS.CROWD_SNAPSHOT]: snapshot,
  [STORAGE_KEYS.INTERCEPTION_LOGS]: logs,
  [UI_KEYS.stats]: {
    ...defaultStats(),
    todayBlocked: scenario === 'empty' ? 0 : 128,
    totalBlocked: scenario === 'empty' ? 0 : 2846,
    todayAdsHidden: scenario === 'empty' ? 0 : 34,
    totalAdsHidden: scenario === 'empty' ? 0 : 612,
  },
  [UI_KEYS.sync]: {
    status: scenario === 'offline' ? 'error' : 'success',
    source: 'network',
    lastSuccess: Date.now() - 120000,
    error: scenario === 'offline' ? '测试网络离线' : undefined,
  },
  [UI_KEYS.operations]: [],
  [UI_KEYS.imports]: [],
  [UI_KEYS.viewers]: {
    7: {
      restId: '123',
      screenName: 'test_viewer',
      reporterHash: 'a'.repeat(64),
      accountAgeDays: 365,
      followersCount: 100,
    },
  },
};
if (scenario !== 'empty') {
  config.localBlocklistUids['2001001'] = {
    uid: '2001001',
    screenName: 'sample_1',
    name: '示例账号',
    tag: 'spam',
    addedAt: Date.now(),
  };
  config.whitelistUids['3001001'] = {
    uid: '3001001',
    screenName: 'sample_friend',
    name: '示例 · 阅读伙伴',
    addedAt: Date.now(),
  };
}
const storageListeners = new Set<
  (changes: Record<string, unknown>, area: string) => void
>();
const nativeCalls: unknown[] = [];
Object.defineProperty(window, 'chrome', {
  configurable: true,
  value: {
    storage: {
      local: {
        async get(keys: string | string[] | null) {
          return Object.fromEntries(
            (keys === null
              ? Object.keys(values)
              : typeof keys === 'string'
                ? [keys]
                : keys
            )
              .filter((k) => k in values)
              .map((k) => [k, structuredClone(values[k])])
          );
        },
        async set(patch: Record<string, unknown>) {
          const changes: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(patch)) {
            changes[key] = {
              oldValue: values[key],
              newValue: structuredClone(value),
            };
            values[key] = structuredClone(value);
          }
          storageListeners.forEach((fn) => fn(changes, 'local'));
        },
      },
      onChanged: {
        addListener: (
          fn: (changes: Record<string, unknown>, area: string) => void
        ) => storageListeners.add(fn),
        removeListener: (
          fn: (changes: Record<string, unknown>, area: string) => void
        ) => storageListeners.delete(fn),
      },
    },
    runtime: {
      id: 'kxc-ui-test',
      getURL: (path: string) => `/${path}`,
      async sendMessage(message: { action: Command }) {
        try {
          const data = await dispatch(message.action);
          return { ok: true, data };
        } catch (error) {
          return { ok: false, error: errorText(error) };
        }
      },
    },
    alarms: { create: async () => {}, clear: async () => true },
    permissions: { contains: async () => true, request: async () => true },
    tabs: {
      async query() {
        return [{ id: 7, active: true, title: 'X · 测试标签页', url: 'https://x.com/home' }];
      },
      async reload() {},
      async sendMessage(
        _tab: number,
        message: { action: string; screenName?: string }
      ) {
        nativeCalls.push(message);
        if (scenario === 'native-error')
          return { ok: false, error: '测试 X 同步失败' };
        if (message.action === 'RESOLVE_USER_HANDLE') {
          const handle = String(message.screenName || '').replace(/^@/, '');
          return {
            ok: true,
            viewerUid: '123',
            user: {
              uid: '8800101',
              screenName: handle || 'resolved_user',
              name: `解析示例 · ${handle || 'user'}`,
            },
          };
        }
        return message.action === 'FETCH_EXISTING_BLOCKS'
          ? {
              ok: true,
              viewerUid: '123',
              ids: [
                '2001001',
                '3001001',
                ...Array.from({ length: 504 }, (_, i) => String(4000000 + i)),
              ],
              nextCursor: '0',
            }
          : { ok: true, viewerUid: '123' };
      },
    },
  },
});
const actualFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (
    String(input).includes('keepxclean.com') ||
    String(input).includes('chosen.example')
  ) {
    if (scenario === 'offline') throw Error('测试网络离线');
    return new Response(
      JSON.stringify(
        init?.method === 'POST'
          ? {
              ok: true,
              countedPublicly: true,
              isNewVote: true,
              importedCount: 1,
            }
          : snapshot
      ),
      { status: 200 }
    );
  }
  return actualFetch(input, init);
};
async function dispatch(action: Command): Promise<unknown> {
  switch (action.type) {
    case 'state.get':
      if (scenario === 'loading') return new Promise(() => {});
      if (scenario === 'error') throw Error('测试读取失败');
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
      return enqueue(async () =>
        writeConfig(applyConfigCommand(await readConfig(), action))
      );
    case 'logs.clear':
      return chrome.storage.local.set({ [STORAGE_KEYS.INTERCEPTION_LOGS]: [] });
    case 'snapshot.refresh':
      return refreshSnapshot();
    case 'account.resolve':
      return resolveAccount(action.query, 7);
    case 'tabs.list':
      return [{ id: 7, title: 'X · 测试标签页' }];
    case 'tabs.reloadX':
      return 1;
    case 'options.open':
      location.href = `/?surface=options#/${action.page || 'rules'}`;
      return;
    case 'import.read':
      return startImport(action.tabId);
    case 'import.apply':
      return applyImport(action.id, action.share, action.moveConflicts);
    case 'import.cancel':
      return cancelImport(action.id);
    case 'import.retry':
      return retryImport(action.id);
    case 'block.start':
      return startBlock(action.entry, 7, action.followers);
    case 'block.undo':
      return undoBlock(action.id);
    case 'block.reason':
      return changeReason(action.id, action.tag);
    case 'block.retry':
      return retryBlock(action.id, action.stage);
    default:
      throw Error('未配置此测试操作');
  }
}
Object.assign(window, { __kxcTest: { values, nativeCalls } });
if (surface === 'x') {
  const isDark = params.get('theme') === 'dark';
  const isProfile = params.get('view') === 'profile';
  if (isProfile) history.replaceState({}, '', '/sample_3');
  document.body.style.background = isDark ? '#15202b' : '#fff';
  document.body.innerHTML = `<div style="max-width:1100px;margin:auto;display:grid;grid-template-columns:240px 600px;gap:30px;color:${isDark ? '#fff' : '#172b24'};font:15px system-ui"><header class="fixture-sidebar"><h2>X · 测试宿主</h2><nav role="navigation">${['Home', 'Explore', 'Notifications', 'Profile', 'More'].map((name, i) => `<a href="#fixture-${i}" ${i === 0 ? 'aria-current="page"' : ''}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 10 12 3l8 7v10h-6v-6h-4v6H4z"/></svg><span>${name}</span></a>`).join('')}</nav><button class="fixture-post">Post</button></header><main data-testid="primaryColumn">${isProfile ? `<div style="padding:16px 20px;border:1px solid #8c9c9226;margin-bottom:12px"><div data-testid="UserName" style="margin-bottom:10px"><strong style="font-size:19px">示例账号 3</strong><div style="opacity:.65;font-size:14px">@sample_3</div></div><div style="margin-bottom:10px"><div data-testid="UserDescription">专注技术与产品记录的普通创作者。</div></div><div style="margin-bottom:12px;opacity:.7;font-size:13px"><div data-testid="UserProfileHeader_Items">Joined November 2022</div></div><div style="font-size:13px;opacity:.8"><strong>128</strong> Following &nbsp; <strong>1,000</strong> Followers</div></div>` : `<h2>为你推荐</h2>`}${[1, 2, 3].map((i) => `<div data-testid="cellInnerDiv" style="border:1px solid #8c9c9226;margin:0 0 -1px"><article data-testid="tweet" style="padding:12px 16px"><div style="display:flex;justify-content:space-between;align-items:center"><div data-testid="User-Name"><a href="/sample_${i}/status/${12345000 + i}" style="color:inherit;text-decoration:none"><strong>示例账号 ${i}</strong> <span style="opacity:.65">@sample_${i} · <time>刚刚</time></span></a></div><div style="display:flex;align-items:center;gap:8px"><div><button aria-label="Grok actions" style="background:transparent;border:0;color:inherit;opacity:.65;padding:2px;cursor:pointer" title="Grok">✦</button></div><div><div><button data-testid="caret" aria-label="More" style="background:transparent;border:0;color:inherit;opacity:.65;padding:2px;cursor:pointer">···</button></div></div></div></div><p style="margin:8px 0 0">这是一条用于测试样式隔离与过滤恢复的示例推文。</p></article></div>`).join('')}</main></div><div id="content-root"></div>`;
  const nativeStyle = document.createElement('style');
  nativeStyle.textContent = `
    .fixture-sidebar nav { display:flex; flex-direction:column; align-items:flex-start; }
    .fixture-sidebar nav > a { display:flex; gap:20px; align-items:center; padding:12px; text-decoration:none; color:inherit; font:400 20px/26px system-ui; white-space:nowrap; }
    .fixture-sidebar nav > a[aria-current] { font-weight:700; }
    .fixture-sidebar nav svg { flex-shrink:0; }
    .fixture-post { width:100%; margin-top:12px; border:0; border-radius:28px; background:#0f1419; color:white; padding:14px; font:700 17px system-ui; }
    @media (max-width:1265px) { .fixture-sidebar { width:72px; } .fixture-sidebar nav { align-items:center; } .fixture-sidebar nav > a span { display:none; } }
  `;
  document.head.append(nativeStyle);
  const controller = new DomController(css);
  const tweets: Record<string, { tweet: ExtractedTweet }> = {};
  for (let i = 1; i <= 3; i++)
    tweets[String(12345000 + i)] = {
      tweet: {
        tweetId: String(12345000 + i),
        text: '普通示例',
        urls: [],
        hashtagCount: 0,
        cashtagCount: 0,
        isPromoted: false,
        isReply: false,
        replyCount: 0,
        favoriteCount: 0,
        viewCount: 0,
        scene: 'timeline',
        author: {
          restId: String(2001000 + i),
          screenName: `sample_${i}`,
          name: `示例账号 ${i}`,
          bio: '',
          bioUrls: [],
          createdAt: '',
          accountAgeDays: 365,
          statusesCount: 100,
          dailyTweetRate: i === 2 ? 85 : 1,
          followersCount: 1000,
          friendsCount: 100,
          followRatio: 0.1,
          mediaCount: 0,
          favouritesCount: 0,
          isBlueVerified: false,
          following: false,
          defaultProfileImage: false,
        },
      },
    };
  config.interceptionMode = 'collapse';
  controller.update(config, snapshot);
  controller.ingest(tweets, {});
  controller.start();
  const root = document
    .getElementById('content-root')!
    .attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  const container = document.createElement('div');
  root.append(style, container);
  createRoot(container).render(<ContentApp controller={controller} />);
  let lastConfig = config,
    lastSnapshot = snapshot;
  subscribe(() => {
    const state = getState();
    if (
      state.data &&
      (lastConfig !== state.data.config || lastSnapshot !== state.data.snapshot)
    ) {
      lastConfig = state.data.config;
      lastSnapshot = state.data.snapshot;
      controller.update(lastConfig, lastSnapshot);
    }
  });
} else {
  if (surface === 'popup')
    document.documentElement.classList.add('kxc-popup-document');
  createRoot(document.getElementById('root')!).render(
    surface === 'popup' ? <Popup /> : <Options />
  );
}
