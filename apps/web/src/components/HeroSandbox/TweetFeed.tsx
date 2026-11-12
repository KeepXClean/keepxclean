import { MessageSquare, Repeat2, Heart, BarChart3, CheckCircle2 } from 'lucide-react';
import { formatHandle, isTweetIntercepted, type FilterState, type SandboxTweet } from './types';
import { TweetItem } from './TweetItem';

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
  const allNoiseFiltered = filterState.masterEnabled && interceptedCount >= totalNoise;

  return (
    <div
      className="sandbox-feed"
      role="region"
      aria-label={isZh ? 'KeepXClean 交互沙盒时间线' : 'KeepXClean Interactive Sandbox Feed'}
      aria-live="polite"
    >
      {/* 1. Main Original Tweet */}
      <article className="tweet-main">
        <div className="tweet-thread-header">
          <span>{isZh ? '🧵 主推文 · KeepXClean 官方发布' : '🧵 Main Thread · Official Release'}</span>
        </div>
        <div className="tweet-card" style={{ padding: 0 }}>
          <div className="tweet-avatar-col">
            <img
              src={originalPost.author.avatar}
              alt={originalPost.author.name}
              className="tweet-avatar"
              style={{ width: 44, height: 44 }}
            />
          </div>
          <div className="tweet-content-col">
            <div className="tweet-header-row">
              <div className="tweet-author-info">
                <span className="tweet-author-name">{originalPost.author.name}</span>
                <span className="tweet-op-badge">OP</span>
                {originalPost.author.isVerified && (
                  <span className="tweet-verified-badge" title="Official Verified">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  </span>
                )}
                <span className="tweet-author-handle">{formatHandle(originalPost.author.handle)}</span>
                <span className="tweet-timestamp">· {originalPost.createdAt}</span>
              </div>
            </div>
            <p className="tweet-body-text" style={{ fontSize: '15px' }}>
              {originalPost.content}
            </p>
            <div className="tweet-metrics-row">
              <span className="metric-item">
                <MessageSquare size={14} />
                <span className="tabular-nums">{originalPost.metrics.replies}</span>
              </span>
              <span className="metric-item">
                <Repeat2 size={14} />
                <span className="tabular-nums">{originalPost.metrics.retweets}</span>
              </span>
              <span className="metric-item">
                <Heart size={14} />
                <span className="tabular-nums">{originalPost.metrics.likes}</span>
              </span>
              {originalPost.metrics.views && (
                <span className="metric-item">
                  <BarChart3 size={14} />
                  <span>{originalPost.metrics.views}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </article>

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
