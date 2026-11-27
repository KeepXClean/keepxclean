import {
  MessageSquare,
  Repeat2,
  Heart,
  CheckCircle2,
  ArrowLeft,
  Bookmark,
  Share,
  MoreHorizontal,
} from 'lucide-react';
import {
  formatHandle,
  isTweetIntercepted,
  PRESET_WEIGHT,
  type FilterState,
  type SandboxScene,
  type SandboxTweet,
} from './types';
import { TweetItem, XVerifiedBadge } from './TweetItem';

export interface TweetFeedProps {
  originalPost: SandboxTweet;
  replies: SandboxTweet[];
  filterState: FilterState;
  onQuickClean: (tweet: SandboxTweet) => void;
  onWhitelist: (authorHandle: string) => void;
  onChangeScene?: (scene: SandboxScene) => void;
  locale?: string;
}

export function TweetFeed({
  originalPost,
  replies,
  filterState,
  onQuickClean,
  onWhitelist,
  onChangeScene,
  locale = 'zh-CN',
}: TweetFeedProps) {
  const isZh = locale.startsWith('zh');
  const isZhTW = locale === 'zh-TW';
  const activeScene: SandboxScene = filterState.scene ?? 'for_you';
  const showProtectionHints = filterState.masterEnabled;
  const showDuplicateKeptHint =
    filterState.masterEnabled &&
    activeScene === 'for_you' &&
    filterState.categories.duplicate_reply !== false &&
    PRESET_WEIGHT[filterState.preset] >= PRESET_WEIGHT.standard;

  // Count how many noisy replies are intercepted
  let interceptedCount = 0;
  const replyElements = replies.map((reply, idx) => {
    const isIntercepted = isTweetIntercepted(reply, filterState);
    if (isIntercepted) {
      interceptedCount++;
    }
    return (
      <TweetItem
        key={reply.id}
        tweet={reply}
        isFiltered={isIntercepted}
        displayMode={filterState.displayMode}
        staggerIndex={idx % 6}
        onQuickClean={onQuickClean}
        onWhitelist={onWhitelist}
        showProtectionHints={showProtectionHints}
        showDuplicateKeptHint={showDuplicateKeptHint}
        locale={locale}
      />
    );
  });

  const totalNoise = replies.filter((r) => Boolean(r.filterReason)).length;
  const allNoiseFiltered =
    filterState.masterEnabled &&
    activeScene === 'for_you' &&
    interceptedCount >= totalNoise;

  const postHeaderLabel = isZhTW ? '貼文' : isZh ? '帖子' : 'Post';
  const forYouTabLabel = isZhTW ? '為你推薦' : isZh ? '为你推荐' : 'For You';
  const followingTabLabel = isZhTW ? '正在跟隨' : isZh ? '正在关注' : 'Following';
  const bypassTagLabel = isZhTW ? '跳過過濾' : isZh ? '跳过过滤' : 'Bypass';
  const followLabel = isZhTW ? '跟隨' : isZh ? '关注' : 'Follow';
  const viewsLabel = isZhTW ? '次查看' : isZh ? '查看' : 'Views';
  const dateDetailText = isZhTW
    ? '上午10:24 · 2026年11月25日'
    : isZh
    ? '上午10:24 · 2026年11月25日'
    : '10:24 AM · Nov 25, 2026';
  const replyPlaceholder = isZhTW
    ? '發佈你的回覆'
    : isZh
    ? '发布你的回复'
    : 'Post your reply';
  const replyBtnLabel = isZhTW ? '回覆' : isZh ? '回复' : 'Reply';
  const sortLabel = isZhTW
    ? '最相關回覆'
    : isZh
    ? '最相关回复'
    : 'Most relevant replies';

  return (
    <div
      className="sandbox-feed"
      role="region"
      aria-label={
        isZh
          ? 'KeepXClean 交互沙盒时间线'
          : 'KeepXClean Interactive Sandbox Feed'
      }
      aria-live="polite"
    >
      {/* Authentic X For You / Following Scene Switcher (v0.2.0 HomeTimeline vs HomeLatestTimeline) */}
      <div
        className="x-scene-tabs"
        role="tablist"
        aria-label={isZh ? '时间线场景切换' : 'Timeline Scene Switcher'}
        data-testid="sandbox-scene-tabs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeScene === 'for_you'}
          className={`x-scene-tab ${activeScene === 'for_you' ? 'active' : ''}`}
          data-testid="scene-tab-for-you"
          onClick={() => onChangeScene?.('for_you')}
        >
          <span>{forYouTabLabel}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeScene === 'following'}
          className={`x-scene-tab ${activeScene === 'following' ? 'active' : ''}`}
          data-testid="scene-tab-following"
          onClick={() => onChangeScene?.('following')}
        >
          <span>{followingTabLabel}</span>
          {activeScene === 'following' && (
            <span className="x-scene-tab-pill">{bypassTagLabel}</span>
          )}
        </button>
      </div>

      {/* Following Bypass Notice Banner */}
      {filterState.masterEnabled && activeScene === 'following' && (
        <div
          className="sandbox-scene-bypass-banner"
          role="status"
          data-testid="sandbox-scene-bypass-banner"
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          <span>
            {isZhTW
              ? 'HomeLatestTimeline（正在跟隨）已套用 Bypass 模式：暫停自動啟發式規則，仍攔截贊助廣告與手動黑名單。'
              : isZh
              ? 'HomeLatestTimeline（正在关注）已启用 Bypass 策略：跳过自动启发式过滤，仍拦截赞助广告与手动拉黑。'
              : 'HomeLatestTimeline (Following) Bypass active: automatic heuristic rules paused while promoted ads and manual blocks remain enforced.'}
          </span>
        </div>
      )}

      {/* Authentic X Sticky Thread Header Bar */}
      <div className="x-post-topbar" aria-hidden="true">
        <span className="x-topbar-back">
          <ArrowLeft size={18} />
        </span>
        <span className="x-topbar-title">{postHeaderLabel}</span>
      </div>

      {/* 1. Main Original X Post (Authentic x.com Status Detail Layout) */}
      <article className="tweet-main">
        <div className="x-focal-author-bar">
          <div className="x-focal-author-left">
            <img
              src={originalPost.author.avatar}
              alt={originalPost.author.name}
              className="tweet-avatar tweet-avatar-org"
            />
            <div className="x-focal-author-meta">
              <div className="x-focal-name-line">
                <span className="tweet-author-name">
                  {originalPost.author.name}
                </span>
                {originalPost.author.isVerified && <XVerifiedBadge size={17} />}
                <span className="tweet-op-badge">OP</span>
              </div>
              <span className="tweet-author-handle">
                {formatHandle(originalPost.author.handle)}
              </span>
            </div>
          </div>

          <div className="x-focal-author-right" aria-hidden="true">
            <span className="x-follow-pill">{followLabel}</span>
            <span className="x-more-icon">
              <MoreHorizontal size={17} />
            </span>
          </div>
        </div>

        <p className="tweet-body-text x-focal-body-text">
          {originalPost.content}
        </p>

        {/* X Timestamp & Views Detail Line */}
        <div className="x-focal-dateline">
          <span>{dateDetailText}</span>
          {originalPost.metrics.views && (
            <>
              <span className="x-dot-sep">·</span>
              <span>
                <strong className="x-views-strong tabular-nums">
                  {originalPost.metrics.views}
                </strong>{' '}
                {viewsLabel}
              </span>
            </>
          )}
        </div>

        {/* X Post Engagement Action Bar */}
        <div className="tweet-metrics-row x-focal-metrics-bar">
          <span className="metric-item">
            <MessageSquare size={16} />
            <span className="tabular-nums">{originalPost.metrics.replies}</span>
          </span>
          <span className="metric-item">
            <Repeat2 size={16} />
            <span className="tabular-nums">
              {originalPost.metrics.retweets}
            </span>
          </span>
          <span className="metric-item">
            <Heart size={16} />
            <span className="tabular-nums">{originalPost.metrics.likes}</span>
          </span>
          <span className="metric-item" aria-hidden="true">
            <Bookmark size={16} />
          </span>
          <span className="metric-item" aria-hidden="true">
            <Share size={16} />
          </span>
        </div>

        {/* X Inline "Post your reply" Composer Row */}
        <div className="x-inline-composer" aria-hidden="true">
          <span className="x-composer-avatar">U</span>
          <span className="x-composer-placeholder">{replyPlaceholder}</span>
          <span className="x-composer-btn">{replyBtnLabel}</span>
        </div>
      </article>

      {/* X Replies Sort Divider */}
      <div className="x-replies-sort-bar" aria-hidden="true">
        <span>{sortLabel}</span>
        <span className="x-sort-chevron">▾</span>
      </div>

      {/* 2. Replies List */}
      <div className="tweet-replies-list">
        {replyElements}

        {/* Clean status banner when clean state is achieved */}
        {allNoiseFiltered && (
          <div className="sandbox-empty-clean-banner" role="status">
            <CheckCircle2 size={16} />
            <span>
              {isZh
                ? '全部噪音已自动净空，仅保留高质量深度讨论。可随时在上方切换预设或模式对比！'
                : 'All timeline noise has been cleaned. High-value discussions preserved! Try toggling presets above.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
