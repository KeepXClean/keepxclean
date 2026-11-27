import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  evaluateAuthorProfile,
  evaluateTweet,
  OFFICIAL_GROK_UID,
  RULE_PACK_FORMAT,
  SlidingWindowTracker,
  ThreadDuplicateTracker,
  type ExtractedTweet,
} from '@keepxclean/shared';
import { applyConfigCommand } from '../src/background/config';
import { DomController } from '../src/content/dom-controller';
import { createMainBridge } from '../src/content/main-bridge';
import {
  detectXPageDark,
  nextThemeSetting,
  resolveThemeSetting,
} from '../src/ui/theme';
import {
  command,
  isExtensionContextValid,
  runtimeUrl,
} from '../src/services/client';
import { UI_KEYS } from '../src/services/model';
import { getState, reload, subscribe } from '../src/state/store';
import { mockChrome } from './mock-chrome';
const tweet: ExtractedTweet = {
  tweetId: '111',
  text: 'ordinary content',
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
    restId: '42',
    screenName: 'sample',
    name: 'Sample',
    bio: '',
    bioUrls: [],
    createdAt: '',
    accountAgeDays: 365,
    statusesCount: 100,
    dailyTweetRate: 1,
    followersCount: 1000,
    friendsCount: 100,
    followRatio: 0.1,
    mediaCount: 0,
    favouritesCount: 0,
    isBlueVerified: false,
    following: false,
    defaultProfileImage: false,
  },
};
function fixture() {
  document.body.innerHTML =
    '<div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/sample/status/111"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>';
  return document.querySelector<HTMLElement>('article')!;
}
afterEach(() => {
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-kxc-x-dark');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('content lifecycle', () => {
  it('restores only extension hiding when disabled or whitelisted', () => {
    const article = fixture();
    article.style.opacity = '.8';
    const controller = new DomController('');
    const config = createDefaultConfig();
    config.interceptionMode = 'strip';
    config.localBlocklistUids['42'] = {
      uid: '42',
      screenName: 'sample',
      addedAt: 1,
    };
    controller.update(config, createDefaultCrowdSnapshot());
    controller.ingest({ '111': { tweet } }, {});
    expect(article.parentElement?.dataset.kxcHidden).toBe('true');
    config.enabled = false;
    controller.update(config, createDefaultCrowdSnapshot());
    expect(article.parentElement?.hasAttribute('data-kxc-hidden')).toBe(false);
    expect(article.style.opacity).toBe('0.8');
    controller.dispose();
  });
  it('does not duplicate bars, and removes obsolete hiding when a node is reused', () => {
    const article = fixture();
    const config = createDefaultConfig();
    expect(config.interceptionMode).toBe('collapse');
    config.localBlocklistUids['42'] = {
      uid: '42',
      screenName: 'sample',
      addedAt: 1,
    };
    const controller = new DomController('');
    controller.update(config, createDefaultCrowdSnapshot());
    controller.ingest({ '111': { tweet } }, {});
    controller.scan();
    controller.scan();
    expect(
      controller.getSnapshot().filter((x) => x.kind === 'collapse')
    ).toHaveLength(1);
    expect(article.dataset.kxcHidden).toBe('true');
    expect(article.hasAttribute('data-kxc-expanded')).toBe(false);
    controller.getSnapshot().find((x) => x.kind === 'collapse')!.toggle!();
    expect(article.hasAttribute('data-kxc-hidden')).toBe(false);
    expect(article.dataset.kxcExpanded).toBe('true');
    article.querySelector('a')!.href = '/another/status/222';
    controller.scan();
    expect(
      controller.getSnapshot().filter((x) => x.kind === 'collapse')
    ).toHaveLength(0);
    expect(article.hasAttribute('data-kxc-hidden')).toBe(false);
    expect(article.hasAttribute('data-kxc-expanded')).toBe(false);
    controller.dispose();
    expect(document.querySelector('kxc-inline')).toBeNull();
  });
  it('does not reinsert expired observations during config reevaluation', () => {
    const config = createDefaultConfig();
    config.rules.highFrequency.slidingWindowHours = 1;
    const tracker = new SlidingWindowTracker();
    tracker.recordAndCount('42', '111', 1, 0);
    evaluateTweet(tweet, config, createDefaultCrowdSnapshot(), tracker, false);
    expect(tracker.count('42', 1)).toBe(0);
  });
  it('resolves every native bridge request, including missing MAIN replies', async () => {
    mockChrome();
    vi.useFakeTimers();
    const bridge = createMainBridge();
    const promise = bridge.request('GET_VIEWER');
    await vi.advanceTimersByTimeAsync(18001);
    expect(await promise).toMatchObject({ ok: false, code: 'TIMEOUT' });
    bridge.dispose();
  });
  it('matches native responses by request ID and ignores unrelated events', async () => {
    mockChrome();
    const bridge = createMainBridge();
    const onCommand = (event: Event) => {
      const { requestId } = (event as CustomEvent).detail;
      window.dispatchEvent(
        new CustomEvent('KXC_MAIN_RESULT', {
          detail: { requestId: 'wrong', ok: false },
        })
      );
      window.dispatchEvent(
        new CustomEvent('KXC_MAIN_RESULT', {
          detail: { requestId, ok: true, viewerUid: '123' },
        })
      );
    };
    window.addEventListener('KXC_MAIN_COMMAND', onCommand);
    expect(await bridge.request('GET_VIEWER')).toMatchObject({
      ok: true,
      viewerUid: '123',
    });
    window.removeEventListener('KXC_MAIN_COMMAND', onCommand);
    bridge.dispose();
  });

  it('mounts profile info bar for both normal and flagged accounts on non-article profile header and skips reserved paths', () => {
    document.body.innerHTML = `
      <main data-testid="primaryColumn">
        <article data-testid="tweet"><div data-testid="UserName">Tweet Author</div></article>
        <div id="profile-col">
          <div id="profile-header" data-testid="UserName">Profile Header</div>
          <div id="profile-bio-wrap"><div id="profile-bio" data-testid="UserDescription">Profile Bio</div></div>
          <div id="profile-follow-counts">10 Following · 200 Followers</div>
        </div>
      </main>
    `;
    const controller = new DomController('');
    const config = createDefaultConfig();
    controller.update(config, createDefaultCrowdSnapshot());

    // 1. On a reserved route (/home), even if an author named "home" exists, never mount profile badge
    history.replaceState({}, '', '/home');
    controller.ingest(
      {},
      {
        home: {
          author: { ...tweet.author, screenName: 'home', dailyTweetRate: 95 },
        },
        clean_user: {
          author: { ...tweet.author, screenName: 'clean_user', dailyTweetRate: 1.5 },
        },
        flagged: {
          author: { ...tweet.author, restId: '77', screenName: 'flagged', dailyTweetRate: 95 },
        },
      }
    );
    expect(
      controller.getSnapshot().find((x) => x.kind === 'profile')
    ).toBeUndefined();

    // 2. Normal unflagged profile (/clean_user) mounts profile info bar between bio and follow counts
    history.replaceState({}, '', '/clean_user');
    controller.scan();
    const cleanProfile = controller
      .getSnapshot()
      .find((x) => x.kind === 'profile');
    expect(cleanProfile).toBeDefined();
    expect(cleanProfile!.badges).toEqual([]);
    const cleanHost = (cleanProfile!.container.getRootNode() as ShadowRoot).host;
    expect(cleanHost.parentElement?.id).toBe('profile-col');
    expect(cleanHost.previousElementSibling?.id).toBe('profile-bio-wrap');
    expect(cleanHost.nextElementSibling?.id).toBe('profile-follow-counts');

    // 3. Flagged profile sub-tab (/flagged/with_replies) includes risk badges
    history.replaceState({}, '', '/flagged/with_replies');
    controller.scan();
    const profileItem = controller
      .getSnapshot()
      .find((x) => x.kind === 'profile');
    expect(profileItem).toBeDefined();
    expect(profileItem!.badges?.length).toBeGreaterThan(0);

    controller.dispose();
  });

  it('places quick-block button to the left of Grok actions when present and skips own/whitelisted/unhydrated tweets', () => {
    document.body.innerHTML = `
      <div data-testid="cellInnerDiv">
        <article data-testid="tweet">
          <div id="header-row">
            <div data-testid="User-Name"><a href="/sample/status/111"><time>now</time></a></div>
            <div id="action-cluster">
              <div id="grok-wrap"><button aria-label="Grok actions">Grok</button></div>
              <div id="caret-wrap"><div><button data-testid="caret">More</button></div></div>
            </div>
          </div>
        </article>
      </div>
    `;
    const article = document.querySelector<HTMLElement>('article')!;
    const controller = new DomController('');
    const config = createDefaultConfig();
    controller.update(config, createDefaultCrowdSnapshot());

    // Before GraphQL hydration (no author restId), do not mount quick button
    controller.scan();
    expect(controller.getSnapshot().filter((x) => x.kind === 'quick')).toHaveLength(0);

    // Hydrated foreign normal tweet mounts quick button directly BEFORE #grok-wrap inside #action-cluster
    controller.ingest({ '111': { tweet } }, {});
    const quickItems = controller.getSnapshot().filter((x) => x.kind === 'quick');
    expect(quickItems).toHaveLength(1);
    expect(quickItems[0].hasGrokGap).toBe(true);
    const quickHost = (quickItems[0].container.getRootNode() as ShadowRoot).host;
    expect(quickHost.parentElement?.id).toBe('action-cluster');
    expect(quickHost.nextElementSibling?.id).toBe('grok-wrap');

    // Viewer's own tweet removes quick button
    controller.setViewer('42');
    expect(controller.getSnapshot().filter((x) => x.kind === 'quick')).toHaveLength(0);

    // Whitelisted author also skips quick button
    controller.setViewer('999');
    config.whitelistUids['42'] = { uid: '42', screenName: 'sample', addedAt: 1 };
    controller.update(config, createDefaultCrowdSnapshot());
    expect(controller.getSnapshot().filter((x) => x.kind === 'quick')).toHaveLength(0);
    // Intercepted (collapsed) tweet omits duplicate hover quick button
    delete config.whitelistUids['42'];
    config.interceptionMode = 'collapse';
    const highFreqTweet: ExtractedTweet = {
      ...tweet,
      author: { ...tweet.author, dailyTweetRate: 95 },
    };
    controller.ingest({ '111': { tweet: highFreqTweet } }, {});
    controller.update(config, createDefaultCrowdSnapshot());
    expect(controller.getSnapshot().filter((x) => x.kind === 'collapse')).toHaveLength(1);
    expect(controller.getSnapshot().filter((x) => x.kind === 'quick')).toHaveLength(0);
    expect(article.isConnected).toBe(true);

    controller.dispose();
  });

  it('survives Chrome extension context invalidation without throwing uncaught errors', async () => {
    const mock = mockChrome();
    const bridge = createMainBridge();
    const unsubscribe = subscribe(() => {});
    expect(isExtensionContextValid()).toBe(true);

    // Simulate Chrome reloading/updating the extension while X tab remains open:
    // chrome.runtime.id becomes undefined and chrome.* methods throw synchronously.
    (mock.api.runtime as { id: string | undefined }).id = undefined;
    mock.api.runtime.getURL = () => {
      throw new Error('Extension context invalidated.');
    };
    mock.api.runtime.sendMessage.mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });
    mock.api.runtime.onMessage.removeListener.mockImplementation(() => {
      throw new Error('Extension context invalidated.');
    });
    mock.api.storage.onChanged.removeListener = () => {
      throw new Error('Extension context invalidated.');
    };

    expect(isExtensionContextValid()).toBe(false);
    expect(() => runtimeUrl('icon/icon-32.png')).not.toThrow();
    expect(runtimeUrl('icon/icon-32.png')).toContain('icon/icon-32.png');
    expect(() => bridge.dispose()).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();
    await expect(command({ type: 'state.get' })).rejects.toThrow(
      'Extension was just updated'
    );
  });

  it('adapts inline X Shadow DOM containers to X light, Dim, and Lights-out themes live', async () => {
    fixture();
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    expect(detectXPageDark()).toBe(false);

    const controller = new DomController('');
    const config = createDefaultConfig();
    config.interceptionMode = 'collapse';
    config.localBlocklistUids['42'] = {
      uid: '42',
      screenName: 'sample',
      addedAt: 1,
    };
    controller.update(config, createDefaultCrowdSnapshot());
    controller.ingest({ '111': { tweet } }, {});
    controller.start();

    const collapseItem = controller
      .getSnapshot()
      .find((x) => x.kind === 'collapse')!;
    expect(collapseItem.container.dataset.theme).toBe('light');
    expect(controller.isPageDark()).toBe(false);
    expect(document.documentElement.dataset.kxcXDark).toBe('false');

    const themeEvents: boolean[] = [];
    const offTheme = controller.subscribeTheme(() =>
      themeEvents.push(controller.isPageDark())
    );

    // Switch X background live to Dim (#15202b -> rgb(21, 32, 43))
    document.body.style.backgroundColor = 'rgb(21, 32, 43)';
    await Promise.resolve();
    expect(detectXPageDark()).toBe(true);
    expect(controller.isPageDark()).toBe(true);
    expect(collapseItem.container.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.kxcXDark).toBe('true');
    expect(themeEvents).toContain(true);

    // Switch X background live to Lights out (#000000 -> rgb(0, 0, 0))
    document.body.style.backgroundColor = 'rgb(0, 0, 0)';
    await Promise.resolve();
    expect(controller.isPageDark()).toBe(true);
    expect(collapseItem.container.dataset.theme).toBe('dark');

    // Switch back to Default Light
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    await Promise.resolve();
    expect(controller.isPageDark()).toBe(false);
    expect(collapseItem.container.dataset.theme).toBe('light');

    // Verify theme resolution & cycle helpers
    expect(resolveThemeSetting('light', true)).toBe('light');
    expect(resolveThemeSetting('dark', false)).toBe('dark');
    expect(resolveThemeSetting('system', true)).toBe('dark');
    expect(resolveThemeSetting('system', false)).toBe('light');
    expect(nextThemeSetting('light')).toBe('dark');
    expect(nextThemeSetting('dark')).toBe('system');
    expect(nextThemeSetting('system')).toBe('light');

    offTheme();
    controller.dispose();
    expect(document.documentElement.hasAttribute('data-kxc-x-dark')).toBe(false);
  });

  it('persists ThreadDuplicateTracker across rescans, toggles, and updates and restores cleanly on disable', () => {
    document.body.innerHTML = `
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/alice/status/1800000000000000001"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/bob/status/1800000000000000002"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/alice/status/1800000000000000003"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/op_user/status/1800000000000000004"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
    `;
    const articles = [
      ...document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
    ];
    const focalAuthor = { ...tweet.author, restId: '999', screenName: 'op_user' };
    const dupText = 'This is an identical copy pasted spam reply message!';
    const reply1: ExtractedTweet = {
      ...tweet,
      tweetId: '1800000000000000001',
      text: dupText,
      isReply: true,
      scene: 'reply',
      inReplyToTweetId: '1799999999999999999',
      focalAuthor,
      author: { ...tweet.author, restId: '101', screenName: 'alice' },
    };
    const reply2: ExtractedTweet = {
      ...reply1,
      tweetId: '1800000000000000002',
      text: '@op_user ' + dupText,
      author: { ...tweet.author, restId: '202', screenName: 'bob' },
    };
    const reply3SameAuthor: ExtractedTweet = {
      ...reply1,
      tweetId: '1800000000000000003',
      author: { ...tweet.author, restId: '101', screenName: 'alice' },
    };
    const reply4Op: ExtractedTweet = {
      ...reply1,
      tweetId: '1800000000000000004',
      author: focalAuthor,
    };

    const controller = new DomController('');
    const config = createDefaultConfig('standard');
    expect(config.rules.replySpam.blockDuplicateReplies).toBe(true);
    controller.update(config, createDefaultCrowdSnapshot());
    controller.ingest(
      {
        [reply1.tweetId]: { tweet: reply1 },
        [reply2.tweetId]: { tweet: reply2 },
        [reply3SameAuthor.tweetId]: { tweet: reply3SameAuthor },
        [reply4Op.tweetId]: { tweet: reply4Op },
      },
      {}
    );

    // Reply #1 kept, Reply #2 collapsed, same-author & OP replies kept
    const collapsed = () =>
      controller.getSnapshot().filter((x) => x.kind === 'collapse');
    expect(collapsed()).toHaveLength(1);
    expect(collapsed()[0]!.tweet?.tweetId).toBe(reply2.tweetId);
    expect(collapsed()[0]!.decision?.ruleId).toBe('reply_spam');
    expect(articles[0]!.hasAttribute('data-kxc-hidden')).toBe(false);
    expect(articles[1]!.dataset.kxcHidden).toBe('true');
    expect(articles[2]!.hasAttribute('data-kxc-hidden')).toBe(false);
    expect(articles[3]!.hasAttribute('data-kxc-hidden')).toBe(false);

    // Rescan & expand/collapse toggle preserve duplicate decision without flipping #1/#2
    controller.scan();
    controller.scan();
    expect(collapsed()).toHaveLength(1);
    collapsed()[0]!.toggle!();
    expect(articles[1]!.dataset.kxcExpanded).toBe('true');
    collapsed()[0]!.toggle!();
    expect(articles[1]!.dataset.kxcHidden).toBe('true');

    // Unrelated config update keeps Reply #2 collapsed
    const unrelated = structuredClone(config);
    unrelated.theme = 'dark';
    controller.update(unrelated, createDefaultCrowdSnapshot());
    expect(collapsed()).toHaveLength(1);
    expect(collapsed()[0]!.tweet?.tweetId).toBe(reply2.tweetId);

    // Disabling blockDuplicateReplies restores Reply #2 cleanly
    const disabled = structuredClone(config);
    disabled.rules.replySpam.blockDuplicateReplies = false;
    controller.update(disabled, createDefaultCrowdSnapshot());
    expect(collapsed()).toHaveLength(0);
    expect(articles[1]!.hasAttribute('data-kxc-hidden')).toBe(false);

    // Re-enabling immediately re-collapses Reply #2 without page reload
    controller.update(config, createDefaultCrowdSnapshot());
    expect(collapsed()).toHaveLength(1);
    expect(collapsed()[0]!.tweet?.tweetId).toBe(reply2.tweetId);

    controller.dispose();
  });

  it('enforces sceneModes bypass/strip/collapse transitions while preserving local blocklist in bypass', () => {
    const article = fixture();
    const followingHighFreq: ExtractedTweet = {
      ...tweet,
      timelineFeed: 'following',
      author: { ...tweet.author, dailyTweetRate: 95 },
    };
    const controller = new DomController('');
    const config = createDefaultConfig('standard');
    config.interceptionMode = 'collapse';
    config.sceneModes = {
      for_you: 'inherit',
      following: 'bypass',
      reply: 'inherit',
      search: 'inherit',
    };
    controller.update(config, createDefaultCrowdSnapshot());
    controller.ingest({ '111': { tweet: followingHighFreq } }, {});

    // Bypass skips automatic highFrequency rule
    expect(
      controller.getSnapshot().filter((x) => x.kind === 'collapse')
    ).toHaveLength(0);
    expect(article.parentElement?.hasAttribute('data-kxc-hidden')).toBe(false);

    // Bypass still enforces manual localBlocklistUids
    const withBlock = structuredClone(config);
    withBlock.localBlocklistUids['42'] = {
      uid: '42',
      screenName: 'sample',
      addedAt: 1,
    };
    controller.update(withBlock, createDefaultCrowdSnapshot());
    expect(
      controller.getSnapshot().filter((x) => x.kind === 'collapse')
    ).toHaveLength(1);

    // Switch scene override to strip even while global interceptionMode is collapse
    const withStrip = structuredClone(config);
    withStrip.sceneModes!.following = 'strip';
    controller.update(withStrip, createDefaultCrowdSnapshot());
    expect(
      controller.getSnapshot().filter((x) => x.kind === 'collapse')
    ).toHaveLength(0);
    expect(article.parentElement?.dataset.kxcHidden).toBe('true');

    // Switch global to strip + scene override to collapse
    const withCollapse = structuredClone(config);
    withCollapse.interceptionMode = 'strip';
    withCollapse.sceneModes!.following = 'collapse';
    controller.update(withCollapse, createDefaultCrowdSnapshot());
    expect(article.parentElement?.hasAttribute('data-kxc-hidden')).toBe(false);
    expect(
      controller.getSnapshot().filter((x) => x.kind === 'collapse')
    ).toHaveLength(1);

    controller.dispose();
  });

  it('propagates matchedTarget on collapse bars and restores tweet live after target.disable', () => {
    const article = fixture();
    const domainTweet: ExtractedTweet = {
      ...tweet,
      urls: ['https://promo.scamshop.example/deal'],
    };
    let config = createDefaultConfig('standard');
    config.rules.domainFilter.items.push({
      id: 'dom-live-1',
      domain: 'scamshop.example',
      enabled: true,
    });
    const controller = new DomController('');
    controller.update(config, createDefaultCrowdSnapshot());
    controller.ingest({ '111': { tweet: domainTweet } }, {});

    const bar = controller.getSnapshot().find((x) => x.kind === 'collapse');
    expect(bar?.decision?.ruleId).toBe('domain_filter');
    expect(bar?.decision?.matchedTarget).toEqual({
      kind: 'domain',
      id: 'dom-live-1',
    });

    // One-click target.disable restores tweet live
    config = applyConfigCommand(config, {
      type: 'target.disable',
      target: bar!.decision!.matchedTarget!,
    });
    controller.update(config, createDefaultCrowdSnapshot());
    expect(
      controller.getSnapshot().filter((x) => x.kind === 'collapse')
    ).toHaveLength(0);
    expect(article.hasAttribute('data-kxc-hidden')).toBe(false);

    // Also verify pack_item matchedTarget + target.disable live restore
    config = applyConfigCommand(config, {
      type: 'pack.install',
      pack: {
        format: RULE_PACK_FORMAT,
        id: 'pack-dom-live',
        name: 'Live Pack',
        description: 'Live restore test',
        version: '1.0.0',
        updatedAt: '2026-11-22T00:00:00.000Z',
        domains: [{ id: 'pd-live-1', domain: 'scamshop.example', enabled: true }],
      },
    });
    controller.update(config, createDefaultCrowdSnapshot());
    const packBar = controller.getSnapshot().find((x) => x.kind === 'collapse');
    expect(packBar?.decision?.matchedTarget).toEqual({
      kind: 'pack_item',
      id: 'pd-live-1',
      packId: 'pack-dom-live',
    });
    config = applyConfigCommand(config, {
      type: 'target.disable',
      target: packBar!.decision!.matchedTarget!,
    });
    controller.update(config, createDefaultCrowdSnapshot());
    expect(
      controller.getSnapshot().filter((x) => x.kind === 'collapse')
    ).toHaveLength(0);

    controller.dispose();
  });

  it('protects official @grok on profile headers and replies unless hideGrokReplies is enabled', () => {
    document.body.innerHTML = `
      <main data-testid="primaryColumn">
        <div id="profile-col">
          <div data-testid="UserName">Grok</div>
          <div data-testid="UserDescription">Official AI</div>
        </div>
        <div data-testid="cellInnerDiv">
          <article data-testid="tweet">
            <a href="/grok/status/111"><time>now</time></a>
            <div><button data-testid="caret">More</button></div>
          </article>
        </div>
      </main>
    `;
    history.replaceState({}, '', '/grok');
    const grokAuthor = {
      ...tweet.author,
      restId: OFFICIAL_GROK_UID,
      screenName: 'grok',
      name: 'Grok',
      dailyTweetRate: 5000,
    };
    const grokReply: ExtractedTweet = {
      ...tweet,
      tweetId: '111',
      text: 'Yes.',
      isReply: true,
      scene: 'reply',
      author: grokAuthor,
    };
    const controller = new DomController('');
    const config = createDefaultConfig('strict');
    controller.update(config, createDefaultCrowdSnapshot());
    controller.ingest({ '111': { tweet: grokReply } }, { grok: { author: grokAuthor } });

    // Official @grok receives zero high-frequency profile risk badges and is not collapsed in replies
    expect(
      evaluateAuthorProfile(grokAuthor, config, createDefaultCrowdSnapshot())
        .riskBadges
    ).toEqual([]);
    expect(
      controller.getSnapshot().filter((x) => x.kind === 'collapse')
    ).toHaveLength(0);

    // Enabling hideGrokReplies collapses official @grok replies
    const hideConfig = structuredClone(config);
    hideConfig.rules.grokFilter.hideGrokReplies = true;
    controller.update(hideConfig, createDefaultCrowdSnapshot());
    const collapse = controller.getSnapshot().find((x) => x.kind === 'collapse');
    expect(collapse?.decision?.ruleId).toBe('grok_filter');

    controller.dispose();
  });

  it('maintains MAIN vs DomController ThreadDuplicateTracker parity when Reply #1 is exempt or blocked by an earlier rule', () => {
    const dupText =
      'Great breakdown of the architecture and implementation tradeoffs here!';
    const baseReply = (
      id: string,
      uid: string,
      screenName: string,
      overrides: Partial<ExtractedTweet> = {}
    ): ExtractedTweet => ({
      ...tweet,
      tweetId: id,
      text: dupText,
      isReply: true,
      scene: 'reply',
      focalTweetId: '1900000000000000900',
      inReplyToTweetId: '1900000000000000900',
      focalAuthor: {
        restId: '9999',
        screenName: 'thread_op',
        name: 'Thread OP',
        followersCount: 1000,
      },
      author: {
        ...tweet.author,
        restId: uid,
        screenName,
        following: false,
      },
      ...overrides,
    });

    const cases: Array<{
      name: string;
      setup: (cfg: ReturnType<typeof createDefaultConfig>) => ExtractedTweet;
    }> = [
      {
        name: 'followed author (exemptFollowing)',
        setup: () =>
          baseReply('1900000000000000901', '101', 'followed_user', {
            author: {
              ...tweet.author,
              restId: '101',
              screenName: 'followed_user',
              following: true,
            },
          }),
      },
      {
        name: 'whitelisted author',
        setup: (cfg) => {
          cfg.whitelistUids['102'] = {
            uid: '102',
            screenName: 'white_user',
            addedAt: 1,
          };
          return baseReply('1900000000000000901', '102', 'white_user');
        },
      },
      {
        name: 'localBlocklistUids spammer',
        setup: (cfg) => {
          cfg.localBlocklistUids['103'] = {
            uid: '103',
            screenName: 'blocked_user',
            addedAt: 1,
          };
          return baseReply('1900000000000000901', '103', 'blocked_user');
        },
      },
      {
        name: 'protected official @grok',
        setup: () =>
          baseReply('1900000000000000901', OFFICIAL_GROK_UID, 'grok', {
            author: {
              ...tweet.author,
              restId: OFFICIAL_GROK_UID,
              screenName: 'grok',
              dailyTweetRate: 5000,
            },
          }),
      },
      {
        name: 'earlier custom keyword rule',
        setup: (cfg) => {
          cfg.rules.keywords.items.push({
            id: 'kw-parity-1',
            pattern: 'special_bio_trigger',
            isRegex: false,
            scopes: ['bio'],
            enabled: true,
          });
          return baseReply('1900000000000000901', '104', 'kw_user', {
            author: {
              ...tweet.author,
              restId: '104',
              screenName: 'kw_user',
              bio: 'special_bio_trigger',
            },
          });
        },
      },
    ];

    for (const testCase of cases) {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/first/status/1900000000000000901"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/regular/status/1900000000000000902"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
      const config = createDefaultConfig('standard');
      const snapshot = createDefaultCrowdSnapshot();
      const reply1 = testCase.setup(config);
      const reply2 = baseReply('1900000000000000902', '205', 'regular');

      // MAIN-world evaluation sequence
      const mainDup = new ThreadDuplicateTracker();
      evaluateTweet(reply1, config, snapshot, undefined, true, mainDup);
      const mainReply2Decision = evaluateTweet(
        reply2,
        config,
        snapshot,
        undefined,
        true,
        mainDup
      );
      expect(mainReply2Decision.blocked, testCase.name).toBe(false);

      // ISOLATED-world DomController sequence
      const controller = new DomController('');
      controller.update(config, snapshot);
      controller.ingest(
        {
          [reply1.tweetId]: { tweet: reply1 },
          [reply2.tweetId]: { tweet: reply2 },
        },
        {}
      );
      const reply2Collapsed = controller
        .getSnapshot()
        .some(
          (item) =>
            item.kind === 'collapse' && item.tweet?.tweetId === reply2.tweetId
        );
      expect(reply2Collapsed, testCase.name).toBe(false);
      controller.dispose();
    }
  });

  it('rebuilds ThreadDuplicateTracker cleanly on early-boot ingest before update() and live whitelist transitions', () => {
    document.body.innerHTML = `
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/u1/status/1900000000000000911"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/u2/status/1900000000000000912"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
    `;
    const reply1: ExtractedTweet = {
      ...tweet,
      tweetId: '1900000000000000911',
      text: 'Identical copy-pasted reply content across two different users!',
      isReply: true,
      scene: 'reply',
      focalTweetId: '1900000000000000910',
      author: { ...tweet.author, restId: '301', screenName: 'u1' },
    };
    const reply2: ExtractedTweet = {
      ...reply1,
      tweetId: '1900000000000000912',
      author: { ...tweet.author, restId: '302', screenName: 'u2' },
    };

    const controller = new DomController('');
    // Ingest BEFORE initial update(config, snapshot)
    controller.ingest(
      {
        [reply1.tweetId]: { tweet: reply1 },
        [reply2.tweetId]: { tweet: reply2 },
      },
      {}
    );

    const config = createDefaultConfig('standard');
    const snapshot = createDefaultCrowdSnapshot();
    controller.update(config, snapshot);
    expect(
      controller
        .getSnapshot()
        .filter(
          (item) =>
            item.kind === 'collapse' && item.tweet?.tweetId === reply2.tweetId
        )
    ).toHaveLength(1);

    // Live-whitelist Reply #1 author -> Reply #1 is no longer tracked, so Reply #2 becomes the 1st eligible reply and restores!
    const withWhitelist = structuredClone(config);
    withWhitelist.whitelistUids['301'] = {
      uid: '301',
      screenName: 'u1',
      addedAt: 1,
    };
    controller.update(withWhitelist, snapshot);
    expect(
      controller.getSnapshot().filter((item) => item.kind === 'collapse')
    ).toHaveLength(0);

    controller.dispose();
  });

  it('Scenario A: preserves duplicate reply order across HomeTimeline -> TweetDetail transition in both collapse and strip modes', () => {
    const dupText =
      'Exact duplicated spam reply seen in HomeTimeline then TweetDetail thread!';
    const r1Timeline: ExtractedTweet = {
      ...tweet,
      tweetId: '1900000000000000801',
      text: dupText,
      isReply: false,
      scene: 'timeline',
      author: { ...tweet.author, restId: '8011', screenName: 'alice_first' },
    };
    const r1Detail: ExtractedTweet = {
      ...r1Timeline,
      isReply: true,
      scene: 'reply',
      focalTweetId: '1900000000000000800',
    };
    const r2Detail: ExtractedTweet = {
      ...r1Detail,
      tweetId: '1900000000000000802',
      author: { ...tweet.author, restId: '8012', screenName: 'bob_dup' },
    };

    for (const mode of ['collapse', 'strip'] as const) {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv" id="cell-801"><article data-testid="tweet"><a href="/alice_first/status/1900000000000000801"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv" id="cell-802"><article data-testid="tweet"><a href="/bob_dup/status/1900000000000000802"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
      const config = createDefaultConfig('standard');
      config.interceptionMode = mode;
      const snapshot = createDefaultCrowdSnapshot();

      // MAIN-world parallel sequence
      const mainDup = new ThreadDuplicateTracker();
      evaluateTweet(r1Timeline, config, snapshot, undefined, true, mainDup);
      const mainR1 = evaluateTweet(
        r1Detail,
        config,
        snapshot,
        undefined,
        true,
        mainDup
      );
      const mainR2 = evaluateTweet(
        r2Detail,
        config,
        snapshot,
        undefined,
        true,
        mainDup
      );
      expect(mainR1.blocked, mode).toBe(false);
      expect(mainR2.blocked, mode).toBe(true);

      // ISOLATED-world DomController sequence
      const controller = new DomController('');
      controller.update(config, snapshot);
      controller.ingest({ [r1Timeline.tweetId]: { tweet: r1Timeline } }, {});
      controller.ingest(
        {
          [r1Detail.tweetId]: { tweet: r1Detail },
          [r2Detail.tweetId]: { tweet: r2Detail },
        },
        {}
      );

      const cell801 = document.getElementById('cell-801')!;
      const cell802 = document.getElementById('cell-802')!;
      if (mode === 'collapse') {
        const collapsedIds = controller
          .getSnapshot()
          .filter((item) => item.kind === 'collapse')
          .map((item) => item.tweet?.tweetId);
        expect(collapsedIds).toEqual([r2Detail.tweetId]);
        expect(cell801.dataset.kxcHidden).toBeUndefined();
      } else {
        expect(cell801.dataset.kxcHidden).toBeUndefined();
        expect(cell802.dataset.kxcHidden).toBe('true');
      }
      controller.dispose();
    }
  });

  it('Scenario B: keeps Reply #1 ahead of Reply #2 across HomeTimeline(Reply #2) -> TweetDetail -> update() rebuild', () => {
    document.body.innerHTML = `
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/alice/status/1900000000000000811"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/bob/status/1900000000000000812"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
    `;
    const dupText = 'Scenario B repeated reply text across timeline and detail!';
    const r1Detail: ExtractedTweet = {
      ...tweet,
      tweetId: '1900000000000000811',
      text: dupText,
      isReply: true,
      scene: 'reply',
      focalTweetId: '1900000000000000810',
      author: { ...tweet.author, restId: '8111', screenName: 'alice' },
    };
    const r2Timeline: ExtractedTweet = {
      ...tweet,
      tweetId: '1900000000000000812',
      text: dupText,
      isReply: false,
      scene: 'timeline',
      author: { ...tweet.author, restId: '8112', screenName: 'bob' },
    };
    const r2Detail: ExtractedTweet = {
      ...r2Timeline,
      isReply: true,
      scene: 'reply',
      focalTweetId: '1900000000000000810',
    };

    const config = createDefaultConfig('standard');
    const snapshot = createDefaultCrowdSnapshot();
    const controller = new DomController('');
    controller.update(config, snapshot);

    controller.ingest({ [r2Timeline.tweetId]: { tweet: r2Timeline } }, {});
    controller.ingest(
      {
        [r1Detail.tweetId]: { tweet: r1Detail },
        [r2Detail.tweetId]: { tweet: r2Detail },
      },
      {}
    );
    expect(
      controller
        .getSnapshot()
        .filter((i) => i.kind === 'collapse')
        .map((i) => i.tweet?.tweetId)
    ).toEqual([r2Detail.tweetId]);

    // Trigger rebuildDuplicateTracker() via update()
    controller.update({ ...config, theme: 'dark' }, snapshot);
    expect(
      controller
        .getSnapshot()
        .filter((i) => i.kind === 'collapse')
        .map((i) => i.tweet?.tweetId)
    ).toEqual([r2Detail.tweetId]);
    controller.dispose();
  });

  it('Scenario C (C1 & C2): preserves arrival order on same-thread refetch with inReplyToTweetId hydration and isolates sub-thread focus A -> B -> update() -> A return', () => {
    const dupText = 'Scenario C duplicated thread reply across refetch and subthread!';
    const config = createDefaultConfig('standard');
    const snapshot = createDefaultCrowdSnapshot();

    // C1: Same-thread refetch with inReplyToTweetId hydration
    {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/a1/status/1900000000000000821"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/a2/status/1900000000000000822"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
      const r1A: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000821',
        text: dupText,
        isReply: true,
        scene: 'reply',
        focalTweetId: '1900000000000000820',
        author: { ...tweet.author, restId: '8211', screenName: 'a1' },
      };
      const r2A: ExtractedTweet = {
        ...r1A,
        tweetId: '1900000000000000822',
        author: { ...tweet.author, restId: '8212', screenName: 'a2' },
      };
      const controller = new DomController('');
      controller.update(config, snapshot);
      controller.ingest(
        { [r1A.tweetId]: { tweet: r1A }, [r2A.tweetId]: { tweet: r2A } },
        {}
      );
      // Refetch Reply #1 with newly hydrated inReplyToTweetId while focalTweetId stays 'A'
      controller.ingest(
        {
          [r1A.tweetId]: {
            tweet: { ...r1A, inReplyToTweetId: '1900000000000000820' },
          },
        },
        {}
      );
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
      ).toEqual([r2A.tweetId]);

      controller.update({ ...config, theme: 'dark' }, snapshot);
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
      ).toEqual([r2A.tweetId]);
      controller.dispose();
    }

    // C2: Sub-thread focus A -> B -> update() -> return to A
    {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/a1/status/1900000000000000831"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/b2/status/1900000000000000832"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/a3/status/1900000000000000833"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
      const r1ThreadA: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000831',
        text: dupText,
        isReply: true,
        scene: 'reply',
        focalTweetId: '1900000000000000830',
        author: { ...tweet.author, restId: '8311', screenName: 'a1' },
      };
      const r3ThreadA: ExtractedTweet = {
        ...r1ThreadA,
        tweetId: '1900000000000000833',
        author: { ...tweet.author, restId: '8313', screenName: 'a3' },
      };
      const r1ThreadB: ExtractedTweet = {
        ...r1ThreadA,
        focalTweetId: '1900000000000000839',
      };
      const r2ThreadB: ExtractedTweet = {
        ...r1ThreadB,
        tweetId: '1900000000000000832',
        author: { ...tweet.author, restId: '8312', screenName: 'b2' },
      };

      const mainDup = new ThreadDuplicateTracker();
      evaluateTweet(r1ThreadA, config, snapshot, undefined, true, mainDup);
      evaluateTweet(r3ThreadA, config, snapshot, undefined, true, mainDup);
      const mainR1B = evaluateTweet(
        r1ThreadB,
        config,
        snapshot,
        undefined,
        true,
        mainDup
      );
      const mainR2B = evaluateTweet(
        r2ThreadB,
        config,
        snapshot,
        undefined,
        true,
        mainDup
      );
      expect(mainR1B.blocked).toBe(false);
      expect(mainR2B.blocked).toBe(true);

      const controller = new DomController('');
      controller.update(config, snapshot);
      controller.ingest(
        {
          [r1ThreadA.tweetId]: { tweet: r1ThreadA },
          [r3ThreadA.tweetId]: { tweet: r3ThreadA },
        },
        {}
      );
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
      ).toEqual([r3ThreadA.tweetId]);

      // Navigate into sub-thread B
      controller.ingest(
        {
          [r1ThreadB.tweetId]: { tweet: r1ThreadB },
          [r2ThreadB.tweetId]: { tweet: r2ThreadB },
        },
        {}
      );
      // Update rebuilds both Thread A and Thread B independently
      controller.update({ ...config, theme: 'dark' }, snapshot);
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
          .sort()
      ).toEqual([r2ThreadB.tweetId, r3ThreadA.tweetId]);

      // Return to Thread A -> 833 is STILL recognized as duplicate of 831
      controller.ingest({ [r3ThreadA.tweetId]: { tweet: r3ThreadA } }, {});
      expect(
        controller
          .getSnapshot()
          .filter(
            (i) => i.kind === 'collapse' && i.tweet?.tweetId === r3ThreadA.tweetId
          )
      ).toHaveLength(1);
      controller.dispose();
    }
  });

  it('Scenario D (D1 & D2): maintains SlidingWindowTracker parity across reply/profile/following(bypass) -> for_you/search and prevents Reply -> Timeline -> update() -> Reply boomerang inversion', () => {
    const snapshot = createDefaultCrowdSnapshot();

    // D1: SlidingWindowTracker parity (reply/profile/following bypass -> for_you/search)
    {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/burst_author/status/1900000000000000921"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/burst_author/status/1900000000000000922"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/burst_author/status/1900000000000000923"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
      const config = createDefaultConfig('standard');
      config.rules.highFrequency.slidingWindowEnabled = true;
      config.rules.highFrequency.slidingWindowHours = 1;
      config.rules.highFrequency.slidingWindowMaxTweets = 2;
      config.sceneModes = {
        for_you: 'inherit',
        following: 'bypass',
        reply: 'inherit',
        search: 'inherit',
      };
      const author = {
        ...tweet.author,
        restId: '9200',
        screenName: 'burst_author',
      };
      const t0Profile: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000920',
        scene: 'profile',
        author,
      };
      const t1Reply: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000921',
        isReply: true,
        scene: 'reply',
        author,
      };
      const tBypassFollowing: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000924',
        scene: 'timeline',
        timelineFeed: 'following',
        author,
      };
      const t2ForYou: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000922',
        scene: 'timeline',
        timelineFeed: 'for_you',
        author,
      };
      const t1ForYou: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000921',
        scene: 'timeline',
        timelineFeed: 'for_you',
        author,
      };
      const t3Search: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000923',
        scene: 'search',
        author,
      };

      const mainTracker = new SlidingWindowTracker();
      evaluateTweet(t0Profile, config, snapshot, mainTracker, true);
      evaluateTweet(t1Reply, config, snapshot, mainTracker, true);
      evaluateTweet(tBypassFollowing, config, snapshot, mainTracker, true);
      const mainT2 = evaluateTweet(t2ForYou, config, snapshot, mainTracker, true);
      expect(mainT2.blocked).toBe(false);

      const controller = new DomController('');
      controller.update(config, snapshot);
      controller.ingest(
        {
          [t0Profile.tweetId]: { tweet: t0Profile },
          [t1Reply.tweetId]: { tweet: t1Reply },
          [tBypassFollowing.tweetId]: { tweet: tBypassFollowing },
          [t2ForYou.tweetId]: { tweet: t2ForYou },
        },
        {}
      );
      expect(
        controller.getSnapshot().filter((i) => i.kind === 'collapse')
      ).toHaveLength(0);

      // Now T1 transitions reply -> for_you and T3 arrives in search -> count reaches 3 > 2
      evaluateTweet(t1ForYou, config, snapshot, mainTracker, true);
      const mainT3 = evaluateTweet(t3Search, config, snapshot, mainTracker, true);
      expect(mainT3.blocked).toBe(true);
      expect(mainT3.ruleId).toBe('high_frequency_window');

      controller.ingest(
        {
          [t1ForYou.tweetId]: { tweet: t1ForYou },
          [t3Search.tweetId]: { tweet: t3Search },
        },
        {}
      );
      const collapsed = controller
        .getSnapshot()
        .filter((i) => i.kind === 'collapse');
      expect(collapsed.some((i) => i.tweet?.tweetId === t3Search.tweetId)).toBe(
        true
      );
      expect(
        collapsed.every((i) => i.decision?.ruleId === 'high_frequency_window')
      ).toBe(true);
      controller.dispose();
    }

    // D2: Boomerang (Reply -> Timeline -> update() -> Reply)
    {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/b1/status/1900000000000000841"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/b2/status/1900000000000000842"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
      const config = createDefaultConfig('standard');
      const dupText = 'Boomerang duplicated reply text surviving timeline visit!';
      const r1Detail: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000841',
        text: dupText,
        isReply: true,
        scene: 'reply',
        focalTweetId: '1900000000000000840',
        author: { ...tweet.author, restId: '8411', screenName: 'b1' },
      };
      const r2Detail: ExtractedTweet = {
        ...r1Detail,
        tweetId: '1900000000000000842',
        author: { ...tweet.author, restId: '8412', screenName: 'b2' },
      };
      const r1Timeline: ExtractedTweet = {
        ...r1Detail,
        isReply: false,
        scene: 'timeline',
        focalTweetId: undefined,
      };

      const controller = new DomController('');
      controller.update(config, snapshot);
      controller.ingest(
        { [r1Detail.tweetId]: { tweet: r1Detail }, [r2Detail.tweetId]: { tweet: r2Detail } },
        {}
      );
      // User visits HomeTimeline which re-delivers 841 as timeline
      controller.ingest({ [r1Timeline.tweetId]: { tweet: r1Timeline } }, {});
      // Settings update triggers rebuildDuplicateTracker()
      controller.update({ ...config, theme: 'dark' }, snapshot);
      // User returns to TweetDetail(A)
      controller.ingest(
        { [r1Detail.tweetId]: { tweet: r1Detail }, [r2Detail.tweetId]: { tweet: r2Detail } },
        {}
      );
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
      ).toEqual([r2Detail.tweetId]);
      controller.dispose();
    }
  });

  it('Scenario E (E1, E2, E3): handles early-boot cross-scene ingest() before initial update()', () => {
    const config = createDefaultConfig('standard');
    const snapshot = createDefaultCrowdSnapshot();
    const dupText = 'Early-boot duplicated reply text across SPA transitions!';
    const r1Detail: ExtractedTweet = {
      ...tweet,
      tweetId: '1900000000000000851',
      text: dupText,
      isReply: true,
      scene: 'reply',
      focalTweetId: '1900000000000000850',
      author: { ...tweet.author, restId: '8511', screenName: 'e1' },
    };
    const r2Detail: ExtractedTweet = {
      ...r1Detail,
      tweetId: '1900000000000000852',
      author: { ...tweet.author, restId: '8512', screenName: 'e2' },
    };
    const r1Timeline: ExtractedTweet = {
      ...r1Detail,
      isReply: false,
      scene: 'timeline',
      focalTweetId: undefined,
    };
    const r2Timeline: ExtractedTweet = {
      ...r2Detail,
      isReply: false,
      scene: 'timeline',
      focalTweetId: undefined,
    };

    const mountArticles = () => {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/e1/status/1900000000000000851"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/e2/status/1900000000000000852"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
    };

    // E1: HomeTimeline(852) -> TweetDetail(851, 852) -> update()
    {
      mountArticles();
      const controller = new DomController('');
      controller.ingest({ [r2Timeline.tweetId]: { tweet: r2Timeline } }, {});
      controller.ingest(
        { [r1Detail.tweetId]: { tweet: r1Detail }, [r2Detail.tweetId]: { tweet: r2Detail } },
        {}
      );
      controller.update(config, snapshot);
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
      ).toEqual([r2Detail.tweetId]);
      controller.dispose();
    }

    // E2: TweetDetail(851, 852) -> HomeTimeline(851) -> TweetDetail(851, 852) -> update()
    {
      mountArticles();
      const controller = new DomController('');
      controller.ingest(
        { [r1Detail.tweetId]: { tweet: r1Detail }, [r2Detail.tweetId]: { tweet: r2Detail } },
        {}
      );
      controller.ingest({ [r1Timeline.tweetId]: { tweet: r1Timeline } }, {});
      controller.ingest(
        { [r1Detail.tweetId]: { tweet: r1Detail }, [r2Detail.tweetId]: { tweet: r2Detail } },
        {}
      );
      controller.update(config, snapshot);
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
      ).toEqual([r2Detail.tweetId]);
      controller.dispose();
    }

    // E3: HomeTimeline(851) -> update() -> TweetDetail(851, 852)
    {
      mountArticles();
      const controller = new DomController('');
      controller.ingest({ [r1Timeline.tweetId]: { tweet: r1Timeline } }, {});
      controller.update(config, snapshot);
      controller.ingest(
        { [r1Detail.tweetId]: { tweet: r1Detail }, [r2Detail.tweetId]: { tweet: r2Detail } },
        {}
      );
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
      ).toEqual([r2Detail.tweetId]);
      controller.dispose();
    }
  });

  it('Scenario F (F1, F2, F3): resists 3,050-tweet timeline floods, protects active-screen re-ingested tweets via LRU, and bounds 205-thread reply history cleanly', () => {
    const config = createDefaultConfig('standard');
    const snapshot = createDefaultCrowdSnapshot();
    const dupText = 'Cache eviction stress duplicated reply text in thread!';

    // F1: 3,050 timeline flood does not evict reply duplicate history
    {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/f1/status/1900000000000000861"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/f2/status/1900000000000000862"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
      const r1: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000861',
        text: dupText,
        isReply: true,
        scene: 'reply',
        focalTweetId: '1900000000000000860',
        author: { ...tweet.author, restId: '8611', screenName: 'f1' },
      };
      const r2: ExtractedTweet = {
        ...r1,
        tweetId: '1900000000000000862',
        author: { ...tweet.author, restId: '8612', screenName: 'f2' },
      };

      const controller = new DomController('');
      controller.update(config, snapshot);
      controller.ingest({ [r1.tweetId]: { tweet: r1 } }, {});

      const flood: Record<string, { tweet: ExtractedTweet }> = {};
      for (let i = 0; i < 3050; i++) {
        const tid = String(2000000000000000000n + BigInt(i));
        flood[tid] = {
          tweet: {
            ...tweet,
            tweetId: tid,
            text: `timeline filler ${i}`,
            scene: 'timeline',
            author: {
              ...tweet.author,
              restId: String(50000 + i),
              screenName: `filler_${i}`,
            },
          },
        };
      }
      controller.ingest(flood, {});
      controller.ingest({ [r2.tweetId]: { tweet: r2 } }, {});
      controller.update({ ...config, theme: 'dark' }, snapshot);
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
      ).toEqual([r2.tweetId]);
      controller.dispose();
    }

    // F2: Active-screen LRU protection prevents freshly re-ingested oldest slot from being evicted in its own batch
    {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/lru_user/status/1900000000000000871"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
      const cfgReplyKw = createDefaultConfig('standard');
      cfgReplyKw.rules.keywords.items.push({
        id: 'kw-lru-reply',
        pattern: 'lru_reply_sentinel',
        isRegex: false,
        scopes: ['text'],
        onlyInReplies: true,
        enabled: true,
      });
      const r1Timeline: ExtractedTweet = {
        ...tweet,
        tweetId: '1900000000000000871',
        text: 'lru_reply_sentinel content',
        scene: 'timeline',
        author: { ...tweet.author, restId: '8711', screenName: 'lru_user' },
      };
      const r1Reply: ExtractedTweet = {
        ...r1Timeline,
        isReply: true,
        scene: 'reply',
        focalTweetId: '1900000000000000870',
      };

      const controller = new DomController('');
      controller.update(cfgReplyKw, snapshot);
      controller.ingest({ [r1Timeline.tweetId]: { tweet: r1Timeline } }, {});

      const fillerBatch: Record<string, { tweet: ExtractedTweet }> = {};
      for (let i = 0; i < 2995; i++) {
        const tid = String(2100000000000000000n + BigInt(i));
        fillerBatch[tid] = {
          tweet: {
            ...tweet,
            tweetId: tid,
            text: `filler ${i}`,
            scene: 'timeline',
            author: {
              ...tweet.author,
              restId: String(60000 + i),
              screenName: `lru_f_${i}`,
            },
          },
        };
      }
      controller.ingest(fillerBatch, {});

      // Re-ingest 871 along with 10 more replies so total exceeds 3000 -> 871 MUST stay cached via LRU touch
      const detailBatch: Record<string, { tweet: ExtractedTweet }> = {
        [r1Reply.tweetId]: { tweet: r1Reply },
      };
      for (let i = 0; i < 10; i++) {
        const tid = String(2200000000000000000n + BigInt(i));
        detailBatch[tid] = {
          tweet: {
            ...tweet,
            tweetId: tid,
            text: `other reply ${i}`,
            isReply: true,
            scene: 'reply',
            focalTweetId: '1900000000000000870',
            author: {
              ...tweet.author,
              restId: String(70000 + i),
              screenName: `rep_${i}`,
            },
          },
        };
      }
      controller.ingest(detailBatch, {});
      expect(
        controller
          .getSnapshot()
          .filter(
            (i) => i.kind === 'collapse' && i.tweet?.tweetId === r1Reply.tweetId
          )
      ).toHaveLength(1);
      controller.dispose();
    }

    // F3: 205-thread bounded LRU retains newest thread #205 cleanly across update()
    {
      const lastFocal = '3000000000000000205';
      const lastR1Id = '3100000000000000205';
      const lastR2Id = '3200000000000000205';
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/t205_a/status/${lastR1Id}"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/t205_b/status/${lastR2Id}"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
      const controller = new DomController('');
      controller.update(config, snapshot);

      const batch: Record<string, { tweet: ExtractedTweet }> = {};
      for (let t = 1; t <= 205; t++) {
        const focal = String(3000000000000000000n + BigInt(t));
        const id1 = String(3100000000000000000n + BigInt(t));
        const id2 = String(3200000000000000000n + BigInt(t));
        const sharedText = `Bounded LRU thread ${t} duplicated reply content!`;
        batch[id1] = {
          tweet: {
            ...tweet,
            tweetId: id1,
            text: sharedText,
            isReply: true,
            scene: 'reply',
            focalTweetId: focal,
            author: {
              ...tweet.author,
              restId: String(80000 + t),
              screenName: `t${t}_a`,
            },
          },
        };
        batch[id2] = {
          tweet: {
            ...tweet,
            tweetId: id2,
            text: sharedText,
            isReply: true,
            scene: 'reply',
            focalTweetId: focal,
            author: {
              ...tweet.author,
              restId: String(90000 + t),
              screenName: `t${t}_b`,
            },
          },
        };
      }
      controller.ingest(batch, {});
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
      ).toEqual([lastR2Id]);

      controller.update({ ...config, theme: 'dark' }, snapshot);
      expect(
        controller
          .getSnapshot()
          .filter((i) => i.kind === 'collapse')
          .map((i) => i.tweet?.tweetId)
      ).toEqual([lastR2Id]);
      expect(lastFocal).toBeTruthy();
      controller.dispose();
    }
  });

  it('Scenario E4: buffers early-boot timeline/search tweets before initial update() for MAIN/DOM SlidingWindowTracker parity in both collapse and strip modes without mutating tracker on subsequent update()s (R3-3)', () => {
    const snapshot = createDefaultCrowdSnapshot();
    const author = {
      ...tweet.author,
      restId: '9500',
      screenName: 'early_boot_author',
    };

    const makeFollowingTweet = (id: string): ExtractedTweet => ({
      ...tweet,
      tweetId: id,
      scene: 'timeline',
      timelineFeed: 'following',
      author,
    });
    const makeForYouTweet = (id: string): ExtractedTweet => ({
      ...tweet,
      tweetId: id,
      scene: 'timeline',
      timelineFeed: 'for_you',
      author,
    });

    // Part 1: 3 early-boot bypassed Following tweets before update() + 1 clean For You tweet -> ALLOWED in BOTH collapse and strip modes (matching MAIN)
    for (const mode of ['collapse', 'strip'] as const) {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv" id="cell-e4-clean">
          <article data-testid="tweet">
            <a href="/early_boot_author/status/1900000000000000954"><time>now</time></a>
            <div><button data-testid="caret">More</button></div>
          </article>
        </div>
        <div data-testid="cellInnerDiv" id="cell-e4-clean-2">
          <article data-testid="tweet">
            <a href="/early_boot_author/status/1900000000000000955"><time>now</time></a>
            <div><button data-testid="caret">More</button></div>
          </article>
        </div>
      `;
      const config = createDefaultConfig('standard');
      config.interceptionMode = mode;
      config.sceneModes = {
        for_you: 'inherit',
        following: 'bypass',
        reply: 'inherit',
        search: 'inherit',
      };
      config.rules.highFrequency.slidingWindowEnabled = true;
      config.rules.highFrequency.slidingWindowHours = 1;
      config.rules.highFrequency.slidingWindowMaxTweets = 2;

      const f1 = makeFollowingTweet('1900000000000000951');
      const f2 = makeFollowingTweet('1900000000000000952');
      const f3 = makeFollowingTweet('1900000000000000953');
      const cleanForYou = makeForYouTweet('1900000000000000954');
      const cleanForYou2 = makeForYouTweet('1900000000000000955');

      // MAIN-world baseline (has fast-boot config synchronously)
      const mainTracker = new SlidingWindowTracker();
      evaluateTweet(f1, config, snapshot, mainTracker, true);
      evaluateTweet(f2, config, snapshot, mainTracker, true);
      evaluateTweet(f3, config, snapshot, mainTracker, true);
      const mainClean = evaluateTweet(
        cleanForYou,
        config,
        snapshot,
        mainTracker,
        true
      );
      expect(mainClean.blocked, mode).toBe(false);

      // ISOLATED-world DomController: early-boot ingest() BEFORE initial update()
      const controller = new DomController('');
      controller.ingest(
        {
          [f1.tweetId]: { tweet: f1 },
          [f2.tweetId]: { tweet: f2 },
          [f3.tweetId]: { tweet: f3 },
        },
        {}
      );
      controller.update(config, snapshot);
      controller.ingest({ [cleanForYou.tweetId]: { tweet: cleanForYou } }, {});

      const cell = document.getElementById('cell-e4-clean')!;
      expect(
        controller.getSnapshot().filter((item) => item.kind === 'collapse'),
        mode
      ).toHaveLength(0);
      expect(cell.hasAttribute('data-kxc-hidden'), mode).toBe(false);
      expect(
        cell.querySelector('article')?.hasAttribute('data-kxc-hidden'),
        mode
      ).toBe(false);

      // Subsequent update() disabling following bypass MUST NOT replay drained earlyWindowTweets into this.tracker
      const inheritFollowingConfig = structuredClone(config);
      inheritFollowingConfig.sceneModes!.following = 'inherit';
      controller.update(inheritFollowingConfig, snapshot);
      controller.ingest(
        { [cleanForYou2.tweetId]: { tweet: cleanForYou2 } },
        {}
      );
      const cell2 = document.getElementById('cell-e4-clean-2')!;
      expect(
        controller.getSnapshot().filter((item) => item.kind === 'collapse'),
        `${mode} after subsequent update`
      ).toHaveLength(0);
      expect(cell2.hasAttribute('data-kxc-hidden'), mode).toBe(false);
      controller.dispose();
    }

    // Part 2: Non-bypassed early-boot For You tweets ARE replayed once on initial update(),
    // subsequent update()s NEVER mutate this.tracker, and 3rd For You tweet IS intercepted in both modes!
    for (const mode of ['collapse', 'strip'] as const) {
      document.body.innerHTML = `
        <div data-testid="cellInnerDiv" id="cell-fy-1"><article data-testid="tweet"><a href="/early_boot_author/status/1900000000000000961"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv" id="cell-fy-2"><article data-testid="tweet"><a href="/early_boot_author/status/1900000000000000962"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
        <div data-testid="cellInnerDiv" id="cell-fy-3"><article data-testid="tweet"><a href="/early_boot_author/status/1900000000000000963"><time>now</time></a><div><button data-testid="caret">More</button></div></article></div>
      `;
      const config = createDefaultConfig('standard');
      config.interceptionMode = mode;
      config.rules.highFrequency.slidingWindowEnabled = true;
      config.rules.highFrequency.slidingWindowHours = 1;
      config.rules.highFrequency.slidingWindowMaxTweets = 2;

      const fy1 = makeForYouTweet('1900000000000000961');
      const fy2 = makeForYouTweet('1900000000000000962');
      const fy3 = makeForYouTweet('1900000000000000963');

      const controller = new DomController('');
      // 2 early-boot For You tweets buffered before update()
      controller.ingest(
        {
          [fy1.tweetId]: { tweet: fy1 },
          [fy2.tweetId]: { tweet: fy2 },
        },
        {}
      );
      // Initial update() replays fy1 & fy2 once (count = 2 <= 2 -> allowed)
      controller.update(config, snapshot);
      expect(
        controller.getSnapshot().filter((item) => item.kind === 'collapse'),
        `${mode} after initial update`
      ).toHaveLength(0);
      expect(
        document.getElementById('cell-fy-2')?.hasAttribute('data-kxc-hidden'),
        `${mode} after initial update`
      ).toBe(false);

      // Subsequent update() calls MUST NOT replay earlyWindowTweets or mutate this.tracker
      for (let i = 0; i < 4; i++) {
        controller.update(
          { ...config, theme: i % 2 === 0 ? 'dark' : 'light' },
          snapshot
        );
      }
      expect(
        controller.getSnapshot().filter((item) => item.kind === 'collapse'),
        `${mode} after repeated updates`
      ).toHaveLength(0);
      expect(
        document.getElementById('cell-fy-2')?.hasAttribute('data-kxc-hidden'),
        `${mode} after repeated updates`
      ).toBe(false);

      // 3rd For You tweet pushes sliding window count from 2 -> 3 (> 2) -> intercepted!
      controller.ingest({ [fy3.tweetId]: { tweet: fy3 } }, {});
      if (mode === 'collapse') {
        const collapsed = controller
          .getSnapshot()
          .filter((item) => item.kind === 'collapse');
        expect(collapsed.some((i) => i.tweet?.tweetId === fy3.tweetId)).toBe(
          true
        );
        expect(
          collapsed.every(
            (i) => i.decision?.ruleId === 'high_frequency_window'
          )
        ).toBe(true);
      } else {
        expect(document.getElementById('cell-fy-3')?.dataset.kxcHidden).toBe(
          'true'
        );
      }
      controller.dispose();
    }
  });

  it('BUG-C1-5, BUG-C2-4 & BUG-C2-5 regressions: DomController.ingest survives malformed MAIN payloads and store.ts handles storage removals safely', async () => {
    document.body.innerHTML =
      '<div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/valid_spammer/status/222"><time>now</time></a><p>bad_kw_target</p></article></div>';
    const cfg = createDefaultConfig('standard');
    cfg.interceptionMode = 'collapse';
    cfg.rules.keywords.enabled = true;
    cfg.rules.keywords.items = [
      {
        id: 'kw-malformed-batch',
        pattern: 'bad_kw_target',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
    ];
    const snapshot = createDefaultCrowdSnapshot();
    const controller = new DomController('');
    controller.update(cfg, snapshot);

    const validSpamTweet: ExtractedTweet = {
      ...tweet,
      tweetId: '222',
      text: 'This has bad_kw_target in text',
      author: {
        ...tweet.author,
        restId: '222001',
        screenName: 'valid_spammer',
      },
    };
    // Malformed tweets & authors MUST NOT crash ingest and MUST NOT prevent valid tweet 222 from collapsing
    expect(() =>
      controller.ingest(
        {
          '111': {
            tweet: {
              ...tweet,
              tweetId: '111',
              author: { ...tweet.author, bioUrls: undefined as unknown as string[] },
            },
          },
          '112': {
            tweet: {
              ...tweet,
              tweetId: '112',
              author: { ...tweet.author, restId: 'constructor' },
            },
          },
          '113': {
            tweet: {
              ...tweet,
              tweetId: '113',
              quotedAuthor: {
                ...tweet.author,
                bioUrls: undefined as unknown as string[],
              },
            },
          },
          '222': { tweet: validSpamTweet },
        },
        {
          existing: {
            author: {
              ...tweet.author,
              restId: '900',
              screenName: 'existing',
              bioUrls: undefined as unknown as string[],
            },
          },
          proto_user: {
            author: {
              ...tweet.author,
              restId: 'toString',
              screenName: 'proto_user',
            },
          },
        }
      )
    ).not.toThrow();

    expect(controller.findAuthor('constructor')).toBeUndefined();
    expect(controller.findAuthor('toString')).toBeUndefined();
    expect(
      controller
        .getSnapshot()
        .filter((i) => i.kind === 'collapse' && i.tweet?.tweetId === '222')
    ).toHaveLength(1);
    controller.dispose();

    // BUG-C2-5: removing sync/operations/imports keys in chrome.storage.local triggers safe nullish fallbacks
    const env = mockChrome({
      [UI_KEYS.sync]: { status: 'success', source: 'network' },
      [UI_KEYS.operations]: [{ id: 'op-1' }],
      [UI_KEYS.imports]: [{ id: 'imp-1' }],
    });
    env.api.runtime.sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        config: cfg,
        snapshot,
        logs: [],
        stats: {
          todayDate: '2026-11-26',
          todayBlocked: 0,
          totalBlocked: 0,
          byRule: {},
        },
        sync: { status: 'success', source: 'network' },
        cloudSync: { enabled: false, status: 'idle' },
        health: {
          status: 'ok',
          consecutiveZeroCount: 0,
          endpoints: [],
          topKeys: [],
        },
        operations: [{ id: 'op-1' }],
        imports: [{ id: 'imp-1' }],
        viewers: [],
      },
    });
    const unsub = subscribe(() => undefined);
    try {
      await reload();
      await env.api.storage.local.remove([
        UI_KEYS.sync,
        UI_KEYS.operations,
        UI_KEYS.imports,
      ]);
      const st = getState();
      expect(st.error).toBeUndefined();
      expect(st.data?.sync).toEqual({ status: 'idle', source: 'builtin' });
      expect(st.data?.operations).toEqual([]);
      expect(st.data?.imports).toEqual([]);
    } finally {
      unsub();
    }
  });

  it('BUG-R2-1 regression: DomController.ingest isolates all 6 malformed MAIN-world crash vectors (retweetedUrls null, non-string URL/bioUrls elements, missing author.name, malformed focalAuthor, non-string lang, throwing getters) without dropping valid sibling spam tweets', () => {
    // 1. Default standard config crash paths (retweetedUrls: null, reply missing author.name, reply malformed focalAuthor, throwing getters)
    document.body.innerHTML =
      '<div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/valid_spammer/status/222"><time>now</time></a><p>bad_kw_r2</p></article></div>';
    const stdCfg = createDefaultConfig('standard');
    stdCfg.interceptionMode = 'collapse';
    stdCfg.rules.keywords.enabled = true;
    stdCfg.rules.keywords.items = [
      {
        id: 'kw-r2-batch',
        pattern: 'bad_kw_r2',
        isRegex: false,
        scopes: ['text'],
        enabled: true,
      },
    ];
    stdCfg.rules.domainFilter.enabled = true;
    stdCfg.rules.domainFilter.items = [
      { id: 'dom-r2', domain: 'evil.example', enabled: true },
    ];
    stdCfg.rules.languageFilter.enabled = true;
    stdCfg.rules.languageFilter.mode = 'block';
    stdCfg.rules.languageFilter.languages = ['fr'];

    const controller = new DomController('');
    controller.update(stdCfg, createDefaultCrowdSnapshot());

    const validAuthor = {
      ...tweet.author,
      restId: '222001',
      screenName: 'valid_spammer',
    };
    const validSpamTweet: ExtractedTweet = {
      ...tweet,
      tweetId: '222',
      text: 'This has bad_kw_r2 in text',
      author: validAuthor,
    };

    let getterHits = 0;
    const throwingTweetInfo: Record<string, unknown> = {};
    Object.defineProperty(throwingTweetInfo, 'tweet', {
      enumerable: true,
      get() {
        getterHits += 1;
        throw new Error('hostile tweet getter');
      },
    });
    const hostileDecisions: Record<string, unknown> = {
      '11101': {
        tweet: {
          ...tweet,
          tweetId: '11101',
          retweetedAuthor: { ...validAuthor, restId: '30001' },
          retweetedUrls: null,
        },
      },
      '11102': {
        tweet: {
          ...tweet,
          tweetId: '11102',
          urls: [null, 123],
        },
      },
      '11103': {
        tweet: {
          ...tweet,
          tweetId: '11103',
          author: { ...validAuthor, restId: '30003', bioUrls: [null] },
        },
      },
      '11104': {
        tweet: {
          ...tweet,
          tweetId: '11104',
          scene: 'reply',
          isReply: true,
          focalAuthor: {
            restId: '999',
            screenName: 'op_handle',
            name: 'OP Name',
            followersCount: 5000,
          },
          author: {
            ...validAuthor,
            restId: '30004',
            followersCount: 10,
            name: undefined,
          },
        },
      },
      '11105': {
        tweet: {
          ...tweet,
          tweetId: '11105',
          scene: 'reply',
          isReply: true,
          focalAuthor: {
            restId: '999',
            followersCount: 5000,
          },
          author: {
            ...validAuthor,
            restId: '30005',
            followersCount: 10,
          },
        },
      },
      '11106': {
        tweet: {
          ...tweet,
          tweetId: '11106',
          lang: 123,
        },
      },
      '11107': throwingTweetInfo,
      '11109': new Proxy(
        {},
        {
          getOwnPropertyDescriptor() {
            throw new Error('hostile proxy descriptor trap');
          },
        }
      ),
      '222': { tweet: validSpamTweet },
    };
    Object.defineProperty(hostileDecisions, '11108', {
      enumerable: true,
      get() {
        getterHits += 1;
        throw new Error('hostile decision entry getter');
      },
    });

    const hostileAuthors: Record<string, unknown> = {
      bad_bio_el: {
        author: { ...validAuthor, restId: '40001', bioUrls: [null] },
      },
      missing_name: {
        author: { ...validAuthor, restId: '40002', name: undefined },
      },
    };
    Object.defineProperty(hostileAuthors, 'throwing_author', {
      enumerable: true,
      get() {
        getterHits += 1;
        throw new Error('hostile author entry getter');
      },
    });

    expect(() =>
      controller.ingest(
        hostileDecisions as Record<string, { tweet: ExtractedTweet }>,
        hostileAuthors as Record<string, { author: ExtractedTweet['author'] }>
      )
    ).not.toThrow();

    expect(getterHits).toBe(0);
    expect(controller.findAuthor('30001')).toBeUndefined();
    expect(controller.findAuthor('30004')).toBeUndefined();
    expect(controller.findAuthor('30005')).toBeUndefined();
    expect(controller.findAuthor('40001')).toBeUndefined();
    expect(controller.findAuthor('40002')).toBeUndefined();
    expect(
      controller
        .getSnapshot()
        .filter((i) => i.kind === 'collapse' && i.tweet?.tweetId === '222')
    ).toHaveLength(1);
    controller.dispose();
  });
});
