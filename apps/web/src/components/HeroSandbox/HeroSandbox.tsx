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
import { isTweetIntercepted } from './types';
import { getSandboxData } from './sampleData';
import { Controls } from './Controls';
import { TweetFeed } from './TweetFeed';
import { UndoToast } from './UndoToast';
import { getActiveCtaConfig, CURRENT_VERSION } from '../../config';
import '../../styles/sandbox.css';

export interface HeroSandboxProps {
  locale?: SupportedLocale;
}

export function HeroSandbox({ locale = 'en' }: HeroSandboxProps) {
  const isZh = locale.startsWith('zh');

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

  return (
    <div className="hero-section-wrapper">
      {/* 1. Hero Intro & Headline Section */}
      <div className="hero-intro">
        <div className="hero-badge-pill">
          <Sparkles size={14} />
          <span>
            {isZh
              ? 'Local-First · 确定性净空引擎'
              : 'Local-First · Deterministic Clean Engine'}
          </span>
        </div>

        <h1 className="hero-headline">
          {isZh ? (
            <>
              重还推特最初的
              <span className="hero-headline-accent">宁静与纯粹</span>
            </>
          ) : (
            <>
              Clean, Deterministic Timeline for{' '}
              <span className="hero-headline-accent">X (Twitter)</span>
            </>
          )}
        </h1>

        <p className="hero-subheadline">
          {isZh
            ? '直接在浏览器内存对 GraphQL 响应流执行确定性拦截。零数据回传、零 Cookie 索取、<1ms 零延迟，彻底告别高仿钓鱼、口令引流与蓝标垃圾评论。'
            : 'Sub-millisecond interception directly on existing GraphQL streams in your browser. Zero tracking, zero cookie collection, and 100% auditable open source.'}
        </p>

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
              {ctaConfig.isStore
                ? isZh
                  ? '添加至 Chrome 浏览器'
                  : 'Add to Chrome'
                : isZh
                ? `下载 Release ${CURRENT_VERSION} (.zip)`
                : `Download Release ${CURRENT_VERSION} (.zip)`}
            </span>
          </a>

          {!ctaConfig.isStore && (
            <span
              className="cws-review-badge"
              title={
                isZh
                  ? 'Chrome 网上应用店正在审核中，当前可直接下载离线安装包或查看 GitHub 源码'
                  : 'Chrome Web Store submission is under review; manual sideload or GitHub download available'
              }
            >
              <CheckCircle2 size={13} />
              <span>
                {isZh ? 'Chrome 商店审核中' : 'Chrome Web Store under review'}
              </span>
            </span>
          )}

          <a
            href={ctaConfig.secondaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-hero-secondary"
          >
            <Github size={16} />
            <span>{isZh ? '查看 GitHub 源码' : 'View on GitHub'}</span>
          </a>
        </div>
      </div>

      {/* 2. Interactive Sandbox Simulator Container */}
      <div className="hero-sandbox-container">
        {/* Sandbox Header Status Bar */}
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
                ? '提示：可拨动下方控制栏实时对比净化效果与拦截细节'
                : 'Interactive Sandbox: Toggle controls below to test filtering in real time'}
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

        {/* Controls Toolbar */}
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

        {/* Tweet Timeline Feed */}
        <TweetFeed
          originalPost={currentDataset.originalPost}
          replies={currentDataset.replies}
          filterState={filterState}
          onQuickClean={handleQuickClean}
          onWhitelist={handleWhitelist}
          locale={datasetLang}
        />

        {/* Feature 18: 4.5s Undo Countdown Toast */}
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
