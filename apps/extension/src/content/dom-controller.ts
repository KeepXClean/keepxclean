import {
  evaluateAuthorProfile,
  evaluateTweet,
  mergeAuthors,
  RESERVED_X_PATHS,
  SlidingWindowTracker,
  type CrowdBlockSnapshot,
  type ExtractedAuthor,
  type ExtractedTweet,
  type FilterConfig,
  type InterceptionDecision,
} from '@keepxclean/shared';

export interface InlineItem {
  id: string;
  container: HTMLElement;
  kind: 'quick' | 'collapse' | 'profile' | 'nav';
  author?: ExtractedAuthor;
  tweet?: ExtractedTweet;
  decision?: InterceptionDecision;
  expanded?: boolean;
  badges?: string[];
  hasCrowdBadge?: boolean;
  isSelf?: boolean;
  hasGrokGap?: boolean;
  toggle?: () => void;
}

function resolveQuickAnchor(article: HTMLElement):
  | {
      parent: HTMLElement;
      before: HTMLElement;
      hasGrokGap: boolean;
    }
  | undefined {
  const caret = article.querySelector<HTMLElement>('[data-testid="caret"]');
  if (!caret?.parentElement) return undefined;

  let caretBranch: HTMLElement = caret;
  let cur: HTMLElement | null = caret.parentElement;
  for (let depth = 0; depth < 6 && cur && cur !== article; depth++) {
    if (
      cur.querySelector('[data-testid="User-Name"]') ||
      cur.querySelector('time')
    ) {
      break;
    }
    const grokBtn = cur.querySelector<HTMLElement>(
      'button[aria-label*="grok" i], [role="button"][aria-label*="grok" i], [data-testid*="grok" i]'
    );
    if (grokBtn && grokBtn !== caret && !caretBranch.contains(grokBtn)) {
      let grokBranch: HTMLElement = grokBtn;
      while (grokBranch.parentElement && grokBranch.parentElement !== cur) {
        grokBranch = grokBranch.parentElement;
      }
      if (grokBranch.parentElement === cur) {
        return { parent: cur, before: grokBranch, hasGrokGap: true };
      }
    }
    caretBranch = cur;
    cur = cur.parentElement;
  }
  return { parent: caret.parentElement, before: caret, hasGrokGap: false };
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
  private viewerUid?: string;
  private nav?: InlineItem;
  private navResize?: ResizeObserver;
  private navAppearanceObserver?: MutationObserver;
  private profile?: InlineItem;
  private path = location.pathname;
  private style = document.createElement('style');
  constructor(
    private css: string,
    private isAlive?: () => boolean
  ) {
    this.style.textContent = [
      '[data-kxc-hidden="true"]{display:none!important}',
      'article[data-testid="tweet"] kxc-inline[data-kxc-kind="quick"]{opacity:0;pointer-events:none;transition:opacity .14s ease}',
      'article[data-testid="tweet"]:hover kxc-inline[data-kxc-kind="quick"],article[data-testid="tweet"]:focus-within kxc-inline[data-kxc-kind="quick"]{opacity:1;pointer-events:auto}',
      '@media (hover:none){article[data-testid="tweet"] kxc-inline[data-kxc-kind="quick"]{opacity:.85;pointer-events:auto}}',
      'article[data-testid="tweet"][data-kxc-expanded="true"]{background-color:#f4f7f5!important;box-shadow:inset 3px 0 0 #b8cbc0!important;transition:background-color .15s ease}',
      'article[data-testid="tweet"][data-kxc-expanded="true"]:hover{background-color:#eef3f0!important}',
      'html[style*="color-scheme: dark"] article[data-testid="tweet"][data-kxc-expanded="true"]{background-color:rgba(184,203,192,.08)!important;box-shadow:inset 3px 0 0 #4f6b5c!important}',
      'html[style*="color-scheme: dark"] article[data-testid="tweet"][data-kxc-expanded="true"]:hover{background-color:rgba(184,203,192,.12)!important}',
    ].join('\n');
    document.documentElement.append(this.style);
  }
  setViewer(uid?: string) {
    if (uid && uid !== this.viewerUid) {
      this.viewerUid = uid;
      this.scan();
    }
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
    host.dataset.kxcKind = kind;
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
    record.article.removeAttribute('data-kxc-expanded');
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
      if (
        !this.tweets.has(id) &&
        (tweet.scene === 'timeline' || tweet.scene === 'search')
      )
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
      if (record.expanded) {
        article.removeAttribute('data-kxc-hidden');
        article.dataset.kxcExpanded = 'true';
      } else {
        article.dataset.kxcHidden = 'true';
        article.removeAttribute('data-kxc-expanded');
      }
    }
    const quickAnchor = resolveQuickAnchor(article);
    const canQuickBlock = Boolean(
      this.config.enabled &&
        !decision?.blocked &&
        quickAnchor &&
        author &&
        /^\d{1,25}$/.test(author.restId) &&
        author.restId !== this.viewerUid &&
        !this.config.whitelistUids[author.restId] &&
        !this.config.localBlocklistUids[author.restId]
    );
    if (!canQuickBlock || !quickAnchor) {
      if (record.quick) {
        this.remove(record.quick);
        record.quick = undefined;
      }
    } else {
      const existingHost = record.quick
        ? ((record.quick.container.getRootNode() as ShadowRoot)
            .host as HTMLElement)
        : undefined;
      if (!record.quick || !existingHost?.isConnected) {
        record.quick = this.create(
          'quick',
          quickAnchor.parent,
          quickAnchor.before
        );
      } else if (
        existingHost.parentElement !== quickAnchor.parent ||
        existingHost.nextElementSibling !== quickAnchor.before
      ) {
        quickAnchor.parent.insertBefore(existingHost, quickAnchor.before);
      }
      record.quick = {
        ...record.quick,
        author,
        tweet,
        hasGrokGap: quickAnchor.hasGrokGap,
      };
    }
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
      rawHandle && !RESERVED_X_PATHS.has(rawHandle) ? rawHandle : undefined;
    const author = handle ? this.authors.get(handle) : undefined;
    const findHeaderEl = (testId: string) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          `[data-testid="primaryColumn"] [data-testid="${testId}"]`
        ),
      ].find((el) => !el.closest('article'));
    const rawAfter =
      findHeaderEl('UserProfileHeader_Items') ??
      findHeaderEl('UserDescription');
    const nameHeader = findHeaderEl('UserName');
    let targetParent: HTMLElement | undefined;
    let beforeNode: HTMLElement | undefined;
    if (
      nameHeader?.parentElement &&
      nameHeader.parentElement.tagName !== 'MAIN'
    ) {
      targetParent = nameHeader.parentElement;
      let anchorChild: HTMLElement = rawAfter ?? nameHeader;
      while (
        anchorChild.parentElement &&
        anchorChild.parentElement !== targetParent
      ) {
        anchorChild = anchorChild.parentElement;
      }
      if (anchorChild.parentElement === targetParent) {
        const next = anchorChild.nextElementSibling as HTMLElement | null;
        beforeNode =
          next && next.tagName.toLowerCase() !== 'kxc-inline'
            ? next
            : (next?.nextElementSibling as HTMLElement | null) ?? undefined;
      }
    } else if (rawAfter?.parentElement) {
      targetParent = rawAfter.parentElement;
      beforeNode =
        (rawAfter.nextElementSibling as HTMLElement | null) ?? undefined;
    } else {
      targetParent = nameHeader;
    }

    const profileEval =
      author && this.config?.enabled
        ? evaluateAuthorProfile(author, this.config, this.snapshot)
        : undefined;
    const badges = profileEval?.riskBadges ?? [];
    const hasCrowdBadge = profileEval?.hasCrowdBadge ?? false;
    const shouldShowProfile = Boolean(
      targetParent && author && this.config?.enabled
    );

    if (!shouldShowProfile || !targetParent || !author) {
      this.remove(this.profile);
      this.profile = undefined;
    } else {
      const currentHost = this.profile
        ? ((this.profile.container.getRootNode() as ShadowRoot)
            .host as HTMLElement)
        : undefined;
      if (!this.profile || currentHost?.parentElement !== targetParent) {
        this.remove(this.profile);
        this.profile = this.create('profile', targetParent, beforeNode);
      } else if (currentHost.nextElementSibling !== (beforeNode ?? null)) {
        targetParent.insertBefore(currentHost, beforeNode ?? null);
      }
      this.profile = {
        ...this.profile,
        author,
        badges,
        hasCrowdBadge,
        isSelf: Boolean(this.viewerUid && author.restId === this.viewerUid),
      };
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
    if (this.isAlive && !this.isAlive()) return;
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
      if (this.isAlive && !this.isAlive()) return;
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
          if (this.isAlive && !this.isAlive()) return;
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
