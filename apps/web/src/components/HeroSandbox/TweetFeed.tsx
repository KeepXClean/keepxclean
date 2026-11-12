import {
  MessageSquare,
  Repeat2,
  Heart,
  BarChart3,
  CheckCircle2,
  ArrowLeft,
  Bookmark,
  Share,
  MoreHorizontal,
} from 'lucide-react';
import {
  formatHandle,
  isTweetIntercepted,
  type FilterState,
  type SandboxTweet,
} from './types';
import { TweetItem, XVerifiedBadge } from './TweetItem';

export interface TweetFeedProps {
  originalPost: SandboxTweet;
  replies: SandboxTweet[];
  filterState: FilterState;
  onQuickClean: (tweet: SandboxTweet) => void;
  onWhitelist: (authorHandle: string) => void;
  locale?: string;
}

export function TweetFeed({
  originalPost,
  replies,
  filterState,
  onQuickClean,
  onWhitelist,
  locale = 'zh-CN',
}: TweetFeedProps) {
  const isZh = locale.startsWith('zh');
  const isZhTW = locale === 'zh-TW';

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
        locale={locale}
      />
    );
  });

  const totalNoise = replies.filter((r) => Boolean(r.filterReason)).length;
  const allNoiseFiltered =
    filterState.masterEnabled && interceptedCount >= totalNoise;

  const postHeaderLabel = isZhTW ? '貼文' : isZh ? '帖子' : 'Post';
  const followLabel = isZhTW ? '跟隨' : isZh ? '关注' : 'Follow';
  const viewsLabel = isZhTW ? '次查看' : isZh ? '查看' : 'Views';
  const dateDetailText = isZhTW
    ? '上午10:24 · 2026年11月12日'
    : isZh
    ? '上午10:24 · 2026年11月12日'
    : '10:24 AM · Nov 12, 2026';
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
