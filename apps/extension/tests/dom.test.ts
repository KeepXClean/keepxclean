import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultConfig,
  createDefaultCrowdSnapshot,
  evaluateTweet,
  SlidingWindowTracker,
  type ExtractedTweet,
} from '@keepxclean/shared';
import { DomController } from '../src/content/dom-controller';
import { createMainBridge } from '../src/content/main-bridge';
import {
  command,
  isExtensionContextValid,
  runtimeUrl,
} from '../src/services/client';
import { subscribe } from '../src/state/store';
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
});
