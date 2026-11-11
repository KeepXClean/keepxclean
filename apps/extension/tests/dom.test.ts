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
    config.interceptionMode = 'collapse';
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
    controller.getSnapshot().find((x) => x.kind === 'collapse')!.toggle!();
    expect(article.hasAttribute('data-kxc-hidden')).toBe(false);
    article.querySelector('a')!.href = '/another/status/222';
    controller.scan();
    expect(
      controller.getSnapshot().filter((x) => x.kind === 'collapse')
    ).toHaveLength(0);
    expect(article.hasAttribute('data-kxc-hidden')).toBe(false);
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

  it('mounts profile badge only on non-article profile header (including sub-tabs) and skips reserved paths', () => {
    document.body.innerHTML = `
      <main data-testid="primaryColumn">
        <article data-testid="tweet"><div data-testid="UserName">Tweet Author</div></article>
        <div id="profile-header" data-testid="UserName">Profile Header</div>
      </main>
    `;
    const controller = new DomController('');
    controller.update(createDefaultConfig(), createDefaultCrowdSnapshot());

    // 1. On a reserved route (/home), even if an author named "home" exists, never mount profile badge
    history.replaceState({}, '', '/home');
    controller.ingest(
      {},
      {
        home: {
          author: { ...tweet.author, screenName: 'home' },
        },
        sample: {
          author: tweet.author,
        },
      }
    );
    expect(
      controller.getSnapshot().find((x) => x.kind === 'profile')
    ).toBeUndefined();

    // 2. On profile sub-tab (/sample/with_replies), mount into #profile-header and never into article UserName
    history.replaceState({}, '', '/sample/with_replies');
    controller.scan();
    const profileItem = controller
      .getSnapshot()
      .find((x) => x.kind === 'profile');
    expect(profileItem).toBeDefined();
    const host = (profileItem!.container.getRootNode() as ShadowRoot).host;
    expect(host.parentElement?.id).toBe('profile-header');

    controller.dispose();
  });
});
