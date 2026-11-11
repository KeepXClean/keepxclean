import {
  evaluateAuthorProfile,
  evaluateTweet,
  mergeAuthors,
  SlidingWindowTracker,
  type CrowdBlockSnapshot,
  type ExtractedAuthor,
  type ExtractedTweet,
  type FilterConfig,
  type InterceptionDecision,
} from '@keepxclean/shared';

const RESERVED_PATHS = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'bookmarks',
  'settings',
  'search',
  'i',
  'compose',
  'intent',
  'tos',
  'privacy',
  'jobs',
  'lists',
  'communities',
  'grok',
]);

export interface InlineItem {
  id: string;
  container: HTMLElement;
  kind: 'quick' | 'collapse' | 'profile' | 'nav';
  author?: ExtractedAuthor;
  tweet?: ExtractedTweet;
  decision?: InterceptionDecision;
  expanded?: boolean;
  badges?: string[];
  toggle?: () => void;
}
interface ArticleRecord {
  tweetId: string;
  article: HTMLElement;
  cell: HTMLElement;
  quick?: InlineItem;
  collapse?: InlineItem;
  expanded: boolean;
}
export class DomController {
  private tweets = new Map<string, ExtractedTweet>();
  private authors = new Map<string, ExtractedAuthor>();
  private articles = new Map<HTMLElement, ArticleRecord>();
  private items: InlineItem[] = [];
  private listeners = new Set<() => void>();
  private tracker = new SlidingWindowTracker();
  private observer?: MutationObserver;
  private frame = 0;
  private dirty = new Set<HTMLElement>();
  private config?: FilterConfig;
  private snapshot?: CrowdBlockSnapshot;
  private nav?: InlineItem;
  private navResize?: ResizeObserver;
  private navAppearanceObserver?: MutationObserver;
  private profile?: InlineItem;
  private path = location.pathname;
  private style = document.createElement('style');
  constructor(private css: string) {
    this.style.textContent = '[data-kxc-hidden="true"]{display:none!important}';
    document.documentElement.append(this.style);
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.items;
  private emit() {
    this.items = [...this.articles.values()]
      .flatMap((r) => [r.quick, r.collapse].filter(Boolean) as InlineItem[])
      .concat([this.nav, this.profile].filter(Boolean) as InlineItem[]);
    this.listeners.forEach((fn) => fn());
  }
  private create(
    kind: InlineItem['kind'],
    parent: HTMLElement,
    before?: HTMLElement
  ): InlineItem {
    const host = document.createElement('kxc-inline');
    host.dataset.kxcUi = 'true';
    host.style.display = kind === 'quick' ? 'inline-flex' : 'block';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = this.css;
    const container = document.createElement('div');
    container.className = 'kxc-root';
    container.style.background = 'transparent';
    shadow.append(style, container);
    parent.insertBefore(host, before || null);
    return { id: crypto.randomUUID(), container, kind };
  }
  private remove(item?: InlineItem) {
    if (item) (item.container.getRootNode() as ShadowRoot).host.remove();
  }
  private restore(record: ArticleRecord) {
    record.cell.removeAttribute('data-kxc-hidden');
    record.article.removeAttribute('data-kxc-hidden');
    this.remove(record.collapse);
    record.collapse = undefined;
  }
  ingest(
    decisions: Record<string, { tweet: ExtractedTweet }>,
    authors: Record<string, { author: ExtractedAuthor }>
  ) {
    for (const [id, info] of Object.entries(decisions)) {
      const tweet = info?.tweet;
      if (
        !/^\d+$/.test(id) ||
        !tweet?.author ||
        !Array.isArray(tweet.urls) ||
        typeof tweet.text !== 'string'
      )
        continue;
      if (!this.tweets.has(id))
        this.tracker.recordAndCount(
          tweet.author.restId,
          id,
          this.config?.rules.highFrequency.slidingWindowHours || 2
        );
      this.tweets.set(id, tweet);
      this.authors.set(tweet.author.screenName.toLowerCase(), tweet.author);
    }
    for (const [handle, info] of Object.entries(authors))
      if (info?.author?.restId && typeof info.author.screenName === 'string') {
        const prior = this.authors.get(handle.toLowerCase());
        this.authors.set(
          handle.toLowerCase(),
          prior ? mergeAuthors(prior, info.author) : info.author
        );
      }
    while (this.tweets.size > 3000)
      this.tweets.delete(this.tweets.keys().next().value!);
    while (this.authors.size > 3000)
      this.authors.delete(this.authors.keys().next().value!);
    this.scan();
  }
  findAuthor(uid: string) {
    return [...this.authors.values()].find((a) => a.restId === uid);
  }
  update(config: FilterConfig, snapshot: CrowdBlockSnapshot) {
    this.config = config;
    this.snapshot = snapshot;
    for (const record of this.articles.values()) record.expanded = false;
    this.scan();
  }
  private process(article: HTMLElement) {
    if (!this.config) return;
    const link =
      [
        ...article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]'),
      ].find((x) => !!x.querySelector('time')) ||
      article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
    const match = link?.getAttribute('href')?.match(/\/([\w]+)\/status\/(\d+)/);
    if (!match) {
      const obsolete = this.articles.get(article);
      if (obsolete) {
        this.restore(obsolete);
        this.remove(obsolete.quick);
        this.articles.delete(article);
      }
      return;
    }
    const [, handle, id] = match;
    let record = this.articles.get(article);
    if (record && (record.tweetId !== id || !record.cell.isConnected)) {
      this.restore(record);
      this.remove(record.quick);
      this.articles.delete(article);
      record = undefined;
    }
    if (!record) {
      record = {
        tweetId: id,
        article,
        cell:
          article.closest<HTMLElement>('[data-testid="cellInnerDiv"]') ||
          article,
        expanded: false,
      };
      this.articles.set(article, record);
    }
    const tweet = this.tweets.get(id),
      author = tweet?.author || this.authors.get(handle.toLowerCase());
    const decision = tweet
      ? evaluateTweet(tweet, this.config, this.snapshot, this.tracker, false)
      : undefined;
    if (!this.config.enabled || !decision?.blocked) this.restore(record);
    else if (decision.action === 'strip') {
      this.restore(record);
      record.cell.dataset.kxcHidden = 'true';
    } else if (decision.action === 'collapse') {
      record.cell.removeAttribute('data-kxc-hidden');
      if (
        !record.collapse ||
        !(record.collapse.container.getRootNode() as ShadowRoot).host
          .isConnected
      )
        record.collapse = this.create(
          'collapse',
          article.parentElement!,
          article
        );
      record.collapse = {
        ...record.collapse,
        author,
        tweet,
        decision,
        expanded: record.expanded,
        toggle: () => {
          const current = this.articles.get(article);
          if (current) {
            current.expanded = !current.expanded;
            this.process(article);
            this.emit();
          }
        },
      };
      if (record.expanded) article.removeAttribute('data-kxc-hidden');
      else article.dataset.kxcHidden = 'true';
    }
    const caret = article.querySelector<HTMLElement>('[data-testid="caret"]');
    if (
      caret?.parentElement &&
      (!record.quick ||
        !(record.quick.container.getRootNode() as ShadowRoot).host.isConnected)
    )
      record.quick = this.create('quick', caret.parentElement, caret);
    if (record.quick) record.quick = { ...record.quick, author, tweet };
  }
  private globals() {
    const nav = document.querySelector<HTMLElement>(
      'header nav[role="navigation"]'
    );
    if (
      this.nav &&
      (this.nav.container.getRootNode() as ShadowRoot).host.parentElement !==
        nav
    ) {
      this.remove(this.nav);
      this.nav = undefined;
      this.navResize?.disconnect();
      this.navAppearanceObserver?.disconnect();
    }
    if (nav && !this.nav) {
      this.nav = this.create('nav', nav);
      this.nav.container.classList.add('kxc-nav-root');
      const host = (this.nav.container.getRootNode() as ShadowRoot)
        .host as HTMLElement;
      host.style.width = '100%';
      if (typeof ResizeObserver !== 'undefined') {
        this.navResize = new ResizeObserver(this.syncNavAppearance);
        this.navResize.observe(nav);
      }
      this.navAppearanceObserver = new MutationObserver(this.syncNavAppearance);
      this.navAppearanceObserver.observe(nav, {
        attributes: true,
        subtree: true,
        attributeFilter: ['class', 'style', 'hidden'],
      });
      for (let node = nav.parentElement; node; node = node.parentElement) {
        this.navAppearanceObserver.observe(node, {
          attributes: true,
          attributeFilter: ['class', 'style'],
        });
      }
    }
    this.syncNavAppearance();
    const rawHandle = location.pathname
      .match(
        /^\/([a-zA-Z0-9_]{1,15})(?:\/(?:with_replies|media|highlights|likes))?\/?$/
      )?.[1]
      ?.toLowerCase();
    const handle =
      rawHandle && !RESERVED_PATHS.has(rawHandle) ? rawHandle : undefined;
    const author = handle ? this.authors.get(handle) : undefined;
    const header = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="primaryColumn"] [data-testid="UserName"]'
      ),
    ].find((el) => !el.closest('article'));
    if (!header || !author || !this.config?.enabled) {
      this.remove(this.profile);
      this.profile = undefined;
    } else {
      if (
        !this.profile ||
        (this.profile.container.getRootNode() as ShadowRoot).host
          .parentElement !== header
      ) {
        this.remove(this.profile);
        this.profile = this.create('profile', header);
      }
      const badges = evaluateAuthorProfile(
        author,
        this.config,
        this.snapshot
      ).riskBadges.map((x) =>
        x.replace(/全网 (\d+) 人(?:拉黑|标记)/g, '社区快照记录 $1 次')
      );
      this.profile = { ...this.profile, author, badges };
    }
  }
  private syncNavAppearance = () => {
    if (!this.nav) return;
    const container = this.nav.container;
    const nav = (container.getRootNode() as ShadowRoot).host.parentElement;
    if (!nav) return;
    // Read the native navigation, including X's text-size and compact-layout preferences.
    const links = [...nav.querySelectorAll<HTMLElement>('a[href]')].filter(
      (link) => link.querySelector('svg')
    );
    const reference =
      links.find(
        (link) =>
          !link.hasAttribute('aria-current') && link.getClientRects().length
      ) ??
      links.find((link) => !link.hasAttribute('aria-current')) ??
      links[0];
    const label =
      reference &&
      [...reference.querySelectorAll<HTMLElement>('span')].find(
        (span) => !span.children.length && span.textContent?.trim()
      );
    const labelRect = label?.getBoundingClientRect();
    const compact = Boolean(
      reference && (!labelRect || !labelRect.width || !labelRect.height)
    );
    container.dataset.compact = String(compact);
    const appearance = getComputedStyle(label || reference || nav);
    const icon = reference?.querySelector('svg')?.getBoundingClientRect();
    const gap =
      labelRect && icon && !compact ? labelRect.left - icon.right : 20;
    const properties = {
      '--kxc-nav-color': appearance.color,
      '--kxc-nav-font-family': appearance.fontFamily,
      '--kxc-nav-font-size': label ? appearance.fontSize : '20px',
      '--kxc-nav-line-height': label ? appearance.lineHeight : '26px',
      '--kxc-nav-font-weight': reference?.hasAttribute('aria-current')
        ? '400'
        : label
          ? appearance.fontWeight
          : '400',
      '--kxc-nav-gap': `${gap >= 0 && gap <= 48 ? gap : 20}px`,
      '--kxc-nav-icon-size': `${icon?.width || 26}px`,
    };
    for (const [key, value] of Object.entries(properties))
      container.style.setProperty(key, value);
  };
  scan = () => {
    for (const [article, record] of this.articles)
      if (!article.isConnected) {
        this.restore(record);
        this.remove(record.quick);
        this.articles.delete(article);
      }
    document
      .querySelectorAll<HTMLElement>('article[data-testid="tweet"]')
      .forEach((article) => this.process(article));
    this.globals();
    this.emit();
  };
  start() {
    this.scan();
    window.addEventListener('resize', this.syncNavAppearance);
    this.observer = new MutationObserver((records) => {
      for (const mutation of records) {
        const root =
          mutation.target instanceof HTMLElement
            ? mutation.target
            : mutation.target.parentElement;
        if (!root || root.closest('[data-kxc-ui]')) continue;
        const article = root.closest<HTMLElement>(
          'article[data-testid="tweet"]'
        );
        if (article) this.dirty.add(article);
        for (const node of mutation.addedNodes)
          if (node instanceof HTMLElement && !node.matches('[data-kxc-ui]')) {
            if (node.matches('article[data-testid="tweet"]'))
              this.dirty.add(node);
            node
              .querySelectorAll<HTMLElement>('article[data-testid="tweet"]')
              .forEach((a) => this.dirty.add(a));
          }
      }
      if (!this.frame)
        this.frame = requestAnimationFrame(() => {
          this.frame = 0;
          if (location.pathname !== this.path) {
            this.path = location.pathname;
            this.scan();
          } else {
            for (const [article, record] of this.articles)
              if (!article.isConnected) {
                this.restore(record);
                this.remove(record.quick);
                this.articles.delete(article);
              }
            this.dirty.forEach((article) => {
              if (article.isConnected) this.process(article);
            });
            this.globals();
            this.emit();
          }
          this.dirty.clear();
        });
    });
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href'],
    });
  }
  dispose() {
    this.observer?.disconnect();
    this.navResize?.disconnect();
    this.navAppearanceObserver?.disconnect();
    window.removeEventListener('resize', this.syncNavAppearance);
    cancelAnimationFrame(this.frame);
    for (const record of this.articles.values()) {
      this.restore(record);
      this.remove(record.quick);
    }
    this.remove(this.nav);
    this.remove(this.profile);
    this.style.remove();
    this.articles.clear();
    this.listeners.clear();
  }
}
