import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  RotateCcw,
  Download,
  Github,
  Sparkles,
  Lock,
  Clock,
  Code2,
  CheckCircle2,
  Home,
  Search,
  Bell,
  Mail,
  Bookmark,
  User,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Star,
  Puzzle,
  MoreVertical,
  Plus,
  X as CloseIcon,
} from 'lucide-react';
import type { SupportedLocale } from '@keepxclean/shared';
import type {
  FilterState,
  SandboxDatasetLocale,
  SandboxDisplayMode,
  SandboxNoiseCategory,
  SandboxPreset,
  SandboxTweet,
  UndoOperation,
} from './types';
import { formatHandle, isTweetIntercepted } from './types';
import { getSandboxData } from './sampleData';
import { Controls } from './Controls';
import { TweetFeed } from './TweetFeed';
import { UndoToast } from './UndoToast';
import { XVerifiedBadge } from './TweetItem';
import { getActiveCtaConfig } from '../../config';
import { getDictionary } from '../../locales';
import '../../styles/sandbox.css';

export interface HeroSandboxProps {
  locale?: SupportedLocale;
}

function OfficialXGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1200 1227"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z" />
    </svg>
  );
}

export function HeroSandbox({ locale = 'en' }: HeroSandboxProps) {
  const isZh = locale.startsWith('zh');
  const isZhTW = locale === 'zh-TW';
  const dict = useMemo(() => getDictionary(locale), [locale]);

  // Derive initial dataset locale
  const initialDatasetLocale: SandboxDatasetLocale = useMemo(() => {
    if (locale === 'zh-TW') return 'zh-TW';
    if (locale.startsWith('zh')) return 'zh-CN';
    return 'en';
  }, [locale]);

  const [datasetLang, setDatasetLang] =
    useState<SandboxDatasetLocale>(initialDatasetLocale);

  // Sync dataset locale if top-level page locale changes
  useEffect(() => {
    if (locale === 'zh-TW') {
      setDatasetLang('zh-TW');
    } else if (locale.startsWith('zh')) {
      setDatasetLang('zh-CN');
    } else {
      setDatasetLang('en');
    }
  }, [locale]);

  // Master switch and animation state
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [isEntranceAnimating, setIsEntranceAnimating] = useState(true);
  const [, setHasCleanedOnce] = useState(false);

  // Filter configuration states
  const [preset, setPreset] = useState<SandboxPreset>('standard');
  const [displayMode, setDisplayMode] = useState<SandboxDisplayMode>('folded');
  const [categories, setCategories] = useState<
    Record<SandboxNoiseCategory, boolean>
  >({
    impersonator: true,
    ads: true,
    giveaway: true,
    crypto: true,
    short_reply: true,
  });

  // User manual actions
  const [manuallyBlockedIds, setManuallyBlockedIds] = useState<Set<string>>(
    new Set()
  );
  const [restoredTweetIds, setRestoredTweetIds] = useState<Set<string>>(
    new Set()
  );
  const [whitelistedHandles, setWhitelistedHandles] = useState<Set<string>>(
    new Set()
  );
  const [activeOperation, setActiveOperation] = useState<UndoOperation | null>(
    null
  );
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feature 12: 0.9s auto-cleanup animation & prefers-reduced-motion
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion) {
      setMasterEnabled(true);
      setIsEntranceAnimating(false);
      setHasCleanedOnce(true);
      return;
    }

    setMasterEnabled(false);
    setIsEntranceAnimating(true);
    replayTimerRef.current = setTimeout(() => {
      setMasterEnabled(true);
      setIsEntranceAnimating(false);
      setHasCleanedOnce(true);
      replayTimerRef.current = null;
    }, 900);

    return () => {
      if (replayTimerRef.current) {
        clearTimeout(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, []);

  // Manual replay button
  const handleReplay = useCallback(() => {
    if (replayTimerRef.current) {
      clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }

    setMasterEnabled(false);
    setIsEntranceAnimating(true);
    replayTimerRef.current = setTimeout(() => {
      setMasterEnabled(true);
      setIsEntranceAnimating(false);
      setHasCleanedOnce(true);
      replayTimerRef.current = null;
    }, 900);
  }, []);

  // Category toggle handler
  const handleToggleCategory = useCallback((cat: SandboxNoiseCategory) => {
    setCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  }, []);

  // Quick clean handler (triggers 4.5s undo toast)
  const handleQuickClean = useCallback((tweet: SandboxTweet) => {
    setManuallyBlockedIds((prev) => new Set(prev).add(tweet.id));
    setActiveOperation({
      id: `op_${Date.now()}_${tweet.id}`,
      tweetId: tweet.id,
      authorHandle: tweet.author.handle,
      authorName: tweet.author.name,
      createdAt: Date.now(),
      undoUntil: Date.now() + 4500,
      durationMs: 4500,
      status: 'active',
    });
  }, []);

  // Undo restore handler
  const handleUndo = useCallback(
    (operationId: string) => {
      if (activeOperation && activeOperation.id === operationId) {
        const tweetId = activeOperation.tweetId;
        setManuallyBlockedIds((prev) => {
          const next = new Set(prev);
          next.delete(tweetId);
          return next;
        });
        setRestoredTweetIds((prev) => new Set(prev).add(tweetId));
        setActiveOperation(null);
      }
    },
    [activeOperation]
  );

  // Dismiss toast handler
  const handleDismissUndo = useCallback(() => {
    setActiveOperation(null);
  }, []);

  // Whitelist author handler
  const handleWhitelist = useCallback((authorHandle: string) => {
    const cleanHandle = authorHandle.replace(/^@/, '').toLowerCase();
    setWhitelistedHandles((prev) => {
      const next = new Set(prev);
      next.add(cleanHandle);
      next.add(authorHandle);
      return next;
    });
  }, []);

  // Retrieve current dataset
  const currentDataset = useMemo(
    () => getSandboxData(datasetLang),
    [datasetLang]
  );

  // Interleave spam near the top of the X thread so the 0.9s cleanup is immediately visible above the fold
  const threadReplies = useMemo(() => {
    const replies = currentDataset.replies;
    if (replies.length !== 7) return replies;
    const clean = replies.filter((r) => !r.filterReason);
    const noisy = replies.filter((r) => Boolean(r.filterReason));
    if (clean.length !== 2 || noisy.length !== 5) return replies;
    return [
      noisy[0],
      noisy[1],
      clean[0],
      noisy[2],
      noisy[3],
      clean[1],
      noisy[4],
    ];
  }, [currentDataset.replies]);

  // Current consolidated filter state
  const filterState: FilterState = useMemo(
    () => ({
      masterEnabled,
      preset,
      displayMode,
      categories,
      manuallyBlockedIds,
      restoredTweetIds,
      whitelistedHandles,
    }),
    [
      masterEnabled,
      preset,
      displayMode,
      categories,
      manuallyBlockedIds,
      restoredTweetIds,
      whitelistedHandles,
    ]
  );

  // Calculate filtered counts
  const filteredCount = useMemo(() => {
    return currentDataset.replies.filter((tweet) =>
      isTweetIntercepted(tweet, filterState)
    ).length;
  }, [currentDataset.replies, filterState]);

  const totalNoiseCount = useMemo(() => {
    return currentDataset.replies.filter((tweet) => Boolean(tweet.filterReason))
      .length;
  }, [currentDataset.replies]);

  const ctaConfig = getActiveCtaConfig();
  const isDatasetZh = datasetLang.startsWith('zh');
  const isDatasetZhTW = datasetLang === 'zh-TW';

  const xNavLabels = isDatasetZhTW
    ? {
        home: '首頁',
        explore: '探索',
        notifications: '通知',
        messages: '訊息',
        bookmarks: '書籤',
        profile: '個人資料',
        post: '發佈',
        search: '搜尋 X',
        relevant: '相關用戶',
        follow: '跟隨',
        telemetryTitle: 'KeepXClean 本頁攔截摘要',
        latency: 'GraphQL 流耗時',
        blocked: '本帖攔截噪音',
        extraReq: '額外 X 請求',
      }
    : isDatasetZh
    ? {
        home: '主页',
        explore: '探索',
        notifications: '通知',
        messages: '私信',
        bookmarks: '书签',
        profile: '个人资料',
        post: '发帖',
        search: '搜索 X',
        relevant: '相关用户',
        follow: '关注',
        telemetryTitle: 'KeepXClean 本页净空摘要',
        latency: 'GraphQL 流耗时',
        blocked: '本帖拦截噪音',
        extraReq: '额外 X 请求',
      }
    : {
        home: 'Home',
        explore: 'Explore',
        notifications: 'Notifications',
        messages: 'Messages',
        bookmarks: 'Bookmarks',
        profile: 'Profile',
        post: 'Post',
        search: 'Search X',
        relevant: 'Relevant people',
        follow: 'Follow',
        telemetryTitle: 'KeepXClean Live Thread Stats',
        latency: 'GraphQL Latency',
        blocked: 'Noise Intercepted',
        extraReq: 'Extra X API Calls',
      };

  const browserTabTitle = isDatasetZh
    ? `${currentDataset.originalPost.author.name} 在 X 上：“KeepXClean v0.1.0...” / X`
    : `${currentDataset.originalPost.author.name} on X: "KeepXClean v0.1.0..." / X`;

  return (
    <div className="hero-section-wrapper">
      {/* 1. Hero Intro & Headline Section (10-Language Localized) */}
      <div className="hero-intro">
        <div className="hero-badge-pill">
          <Sparkles size={14} />
          <span>{dict.hero.badge}</span>
        </div>

        <h1 className="hero-headline">
          {dict.hero.headlinePrefix}{' '}
          <span className="hero-headline-accent">
            {dict.hero.headlineHighlight}
          </span>
        </h1>

        <p className="hero-subheadline">{dict.hero.subheadline}</p>

        {/* Feature highlight tags */}
        <div className="hero-feature-tags">
          <span className="hero-tag">
            <Clock size={13} style={{ color: 'var(--green)' }} />
            <span>{isZh ? '<1ms 极速拦截' : '<1ms Interception'}</span>
          </span>
          <span className="hero-tag">
            <Lock size={13} style={{ color: 'var(--green)' }} />
            <span>{isZh ? '本地优先 0 隐私外泄' : 'Local-First Privacy'}</span>
          </span>
          <span className="hero-tag">
            <Code2 size={13} style={{ color: 'var(--green)' }} />
            <span>{isZh ? '100% 开源可审计' : '100% Open Source'}</span>
          </span>
        </div>

        {/* Action CTAs */}
        <div className="hero-actions-row">
          <a
            href={ctaConfig.primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-hero-primary"
          >
            <Download size={16} />
            <span>
              {ctaConfig.isStore ? dict.hero.ctaStore : dict.hero.ctaPrimary}
            </span>
          </a>

          {!ctaConfig.isStore && (
            <span className="cws-review-badge" title={dict.hero.cwsReview}>
              <CheckCircle2 size={13} />
              <span>{dict.hero.cwsBadge}</span>
            </span>
          )}

          <a
            href={ctaConfig.secondaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-hero-secondary"
          >
            <Github size={16} />
            <span>{dict.hero.ctaGitHub}</span>
          </a>
        </div>
      </div>

      {/* 2. Simulated Browser Window Running x.com + KeepXClean Extension */}
      <div className="hero-sandbox-container browser-window-frame">
        {/* 2A. Realistic Chromium Window Tab Strip + Address Bar */}
        <div className="browser-chrome-top" aria-hidden="true">
          {/* Tab Strip */}
          <div className="browser-tab-strip">
            <div className="browser-traffic-lights">
              <span className="traffic-dot dot-close" />
              <span className="traffic-dot dot-minimize" />
              <span className="traffic-dot dot-expand" />
            </div>

            <div className="browser-tabs-row">
              <div className="browser-tab active">
                <span className="browser-tab-favicon">
                  <OfficialXGlyph size={13} />
                </span>
                <span className="browser-tab-title">{browserTabTitle}</span>
                <span className="browser-tab-close">
                  <CloseIcon size={12} />
                </span>
              </div>

              <div className="browser-tab inactive">
                <span className="browser-tab-favicon muted">
                  <OfficialXGlyph size={12} />
                </span>
                <span className="browser-tab-title">
                  {isDatasetZh ? '(3) 主页 / X' : '(3) Home / X'}
                </span>
              </div>

              <span className="browser-newtab-icon">
                <Plus size={14} />
              </span>
            </div>
          </div>

          {/* Navigation Omnibox & Pinned KeepXClean Extension */}
          <div className="browser-navbar">
            <div className="browser-nav-btns">
              <span className="browser-nav-icon">
                <ArrowLeft size={15} />
              </span>
              <span className="browser-nav-icon disabled">
                <ArrowRight size={15} />
              </span>
              <span
                className="browser-nav-icon clickable"
                onClick={handleReplay}
                title={
                  isZh
                    ? '刷新页面并重放 0.9s 自动净空'
                    : 'Reload & replay 0.9s cleanup'
                }
              >
                <RotateCw
                  size={14}
                  className={isEntranceAnimating ? 'spin-once' : ''}
                />
              </span>
            </div>

            <div className="browser-omnibox">
              <span className="omnibox-lock">
                <Lock size={12} />
              </span>
              <span className="omnibox-url-text">
                <span className="omnibox-scheme">https://</span>
                <strong className="omnibox-domain">x.com</strong>
                <span className="omnibox-path">
                  /keepxclean/status/1895420819
                </span>
              </span>
              <span className="omnibox-star">
                <Star size={13} />
              </span>
            </div>

            <div className="browser-extensions-cluster">
              <div
                className={`browser-ext-pinned ${
                  masterEnabled ? 'active' : 'paused'
                }`}
                onClick={() => setMasterEnabled(!masterEnabled)}
                title="KeepXClean Chrome Extension"
              >
                <img
                  src="/logo-small.svg"
                  alt=""
                  width={18}
                  height={18}
                  className="browser-ext-icon"
                />
                <span className="browser-ext-name">KeepXClean</span>
                <span className="browser-ext-badge tabular-nums">
                  {masterEnabled ? filteredCount : 'OFF'}
                </span>
              </div>

              <span className="browser-chrome-icon">
                <Puzzle size={15} />
              </span>
              <span className="browser-chrome-icon">
                <MoreVertical size={15} />
              </span>
            </div>
          </div>
        </div>

        {/* 2B. Docked KeepXClean Extension Interactive Control Bar */}
        <div className="kxc-extension-dock">
          <div className="hero-sandbox-header">
            <div className="sandbox-header-left">
              <div
                className={`sandbox-status-pill ${
                  !masterEnabled ? 'inactive' : ''
                }`}
                role="status"
                aria-live="polite"
              >
                <span className="sandbox-status-dot" />
                <span>
                  {isEntranceAnimating
                    ? isZh
                      ? '⚡ 感知原始评论区噪音中 (0.9s)...'
                      : '⚡ Sensing raw timeline noise (0.9s)...'
                    : masterEnabled
                    ? isZh
                      ? '✨ 净空引擎已就绪 · 实时保护中'
                      : '✨ Clean Engine Active · Real-time Protection'
                    : isZh
                    ? '⏸️ 净化已暂停 · 呈现未过滤原貌'
                    : '⏸️ Filtering Paused · Raw Timeline View'}
                </span>
              </div>

              <span className="sandbox-hint-text">
                {isZh
                  ? '浏览器右上角插件实时接管 x.com · 拨动下方控件即刻体验'
                  : 'KeepXClean active on x.com · Toggle extension controls below'}
              </span>
            </div>

            <div className="sandbox-header-actions">
              {/* Feature 12: Manual Replay Button */}
              <button
                type="button"
                className="btn-replay-clean"
                onClick={handleReplay}
                title={
                  isZh
                    ? '重新播放 0.9s 自动净空入场动效'
                    : 'Replay 0.9s auto-cleanup entrance animation'
                }
              >
                <RotateCcw size={12} />
                <span>{isZh ? '重放净空动效' : 'Replay Cleanup'}</span>
              </button>
            </div>
          </div>

          <Controls
            masterEnabled={masterEnabled}
            onToggleMaster={setMasterEnabled}
            preset={preset}
            onChangePreset={setPreset}
            displayMode={displayMode}
            onChangeDisplayMode={setDisplayMode}
            categories={categories}
            onToggleCategory={handleToggleCategory}
            datasetLang={datasetLang}
            onSwitchDatasetLang={setDatasetLang}
            filteredCount={filteredCount}
            totalNoiseCount={totalNoiseCount}
            locale={datasetLang}
          />
        </div>

        {/* 2C. Authentic x.com Light Web Application Viewport */}
        <div className="x-webapp-viewport">
          <div className="x-webapp-grid">
            {/* Left Column: Authentic X Navigation Sidebar */}
            <aside className="x-left-rail" aria-hidden="true">
              <div className="x-left-rail-top">
                <div className="x-brand-circle">
                  <OfficialXGlyph size={22} />
                </div>

                <ul className="x-nav-list">
                  <li className="x-nav-link active">
                    <Home size={21} strokeWidth={2.4} />
                    <span className="x-nav-text">{xNavLabels.home}</span>
                  </li>
                  <li className="x-nav-link">
                    <Search size={21} strokeWidth={2} />
                    <span className="x-nav-text">{xNavLabels.explore}</span>
                  </li>
                  <li className="x-nav-link">
                    <Bell size={21} strokeWidth={2} />
                    <span className="x-nav-text">
                      {xNavLabels.notifications}
                    </span>
                  </li>
                  <li className="x-nav-link">
                    <Mail size={21} strokeWidth={2} />
                    <span className="x-nav-text">{xNavLabels.messages}</span>
                  </li>
                  <li className="x-nav-link">
                    <Bookmark size={21} strokeWidth={2} />
                    <span className="x-nav-text">{xNavLabels.bookmarks}</span>
                  </li>
                  <li className="x-nav-link">
                    <User size={21} strokeWidth={2} />
                    <span className="x-nav-text">{xNavLabels.profile}</span>
                  </li>
                </ul>

                <div className="x-post-cta-pill">
                  <span className="x-post-cta-text">{xNavLabels.post}</span>
                  <span className="x-post-cta-plus">+</span>
                </div>
              </div>
            </aside>

            {/* Center Column: Authentic 600px x.com Thread Column */}
            <div className="x-center-column">
              <TweetFeed
                originalPost={currentDataset.originalPost}
                replies={threadReplies}
                filterState={filterState}
                onQuickClean={handleQuickClean}
                onWhitelist={handleWhitelist}
                locale={datasetLang}
              />
            </div>

            {/* Right Column: Authentic x.com Search & Relevant People Sidebar */}
            <aside className="x-right-rail" aria-hidden="true">
              <div className="x-search-pill">
                <Search size={15} />
                <span>{xNavLabels.search}</span>
              </div>

              <div className="x-side-card">
                <div className="x-side-card-title">{xNavLabels.relevant}</div>
                <div className="x-relevant-user">
                  <img
                    src={currentDataset.originalPost.author.avatar}
                    alt=""
                    className="x-relevant-avatar"
                  />
                  <div className="x-relevant-info">
                    <div className="x-relevant-name-row">
                      <span className="x-relevant-name">
                        {currentDataset.originalPost.author.name}
                      </span>
                      <XVerifiedBadge size={14} />
                    </div>
                    <span className="x-relevant-handle">
                      {formatHandle(currentDataset.originalPost.author.handle)}
                    </span>
                  </div>
                  <span className="x-follow-pill compact">
                    {xNavLabels.follow}
                  </span>
                </div>
                {currentDataset.originalPost.author.bio && (
                  <p className="x-relevant-bio">
                    {currentDataset.originalPost.author.bio}
                  </p>
                )}
              </div>

              <div className="x-kxc-telemetry-card">
                <div className="x-telemetry-header">
                  <img src="/logo-small.svg" alt="" width={16} height={16} />
                  <span>{xNavLabels.telemetryTitle}</span>
                </div>
                <div className="x-telemetry-rows">
                  <div className="x-telemetry-row">
                    <span>{xNavLabels.blocked}</span>
                    <strong className="tabular-nums">
                      {masterEnabled ? filteredCount : 0} / {totalNoiseCount}
                    </strong>
                  </div>
                  <div className="x-telemetry-row">
                    <span>{xNavLabels.latency}</span>
                    <strong className="tabular-nums">&lt; 0.4 ms</strong>
                  </div>
                  <div className="x-telemetry-row">
                    <span>{xNavLabels.extraReq}</span>
                    <strong className="tabular-nums">0</strong>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Mobile X App Bottom Tab Bar */}
          <div className="x-mobile-bottom-bar" aria-hidden="true">
            <Home size={20} strokeWidth={2.4} />
            <Search size={20} />
            <Bell size={20} />
            <Mail size={20} />
          </div>
        </div>

        {/* Feature 18: 4.5s Undo Countdown Toast (Pinned at bottom of browser window) */}
        <UndoToast
          operation={activeOperation}
          onUndo={handleUndo}
          onDismiss={handleDismissUndo}
          locale={datasetLang}
        />
      </div>
    </div>
  );
}
