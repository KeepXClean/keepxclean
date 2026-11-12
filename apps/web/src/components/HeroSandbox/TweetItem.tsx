import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  UserCheck,
  Trash2,
  Ban,
  MessageSquare,
  Repeat2,
  Heart,
  BarChart3,
} from 'lucide-react';
import {
  formatHandle,
  type SandboxDisplayMode,
  type SandboxTweet,
} from './types';

export function XVerifiedBadge({ size = 15 }: { size?: number }) {
  return (
    <span className="tweet-verified-badge" title="Verified Account">
      <svg
        width={size}
        height={size}
        viewBox="0 0 22 22"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816z"
          fill="#1D9BF0"
        />
        <path
          d="M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
          fill="#FFFFFF"
        />
      </svg>
    </span>
  );
}

export interface TweetItemProps {
  tweet: SandboxTweet;
  isFiltered: boolean;
  displayMode: SandboxDisplayMode;
  staggerIndex: number;
  onQuickClean: (tweet: SandboxTweet) => void;
  onWhitelist: (authorHandle: string) => void;
  locale?: string;
}

export function TweetItem({
  tweet,
  isFiltered,
  displayMode,
  staggerIndex,
  onQuickClean,
  onWhitelist,
  locale = 'zh-CN',
}: TweetItemProps) {
  const [expanded, setExpanded] = useState(false);
  const isZh = locale.startsWith('zh');

  // Intercepted & Hide Mode: completely collapse to 0 height
  if (isFiltered && displayMode === 'hide') {
    return (
      <div
        className={`tweet-item-wrapper hidden stagger-${staggerIndex}`}
        aria-hidden="true"
        data-tweet-id={tweet.id}
      />
    );
  }

  // Intercepted & Folded Bar Mode
  if (isFiltered && displayMode === 'folded') {
    return (
      <div
        className={`tweet-item-wrapper stagger-${staggerIndex}`}
        data-tweet-id={tweet.id}
      >
        <div
          className={`folded-bar-container collapse-bar${
            expanded ? ' expanded' : ''
          }`}
          data-expanded={expanded ? 'true' : undefined}
        >
          <button
            type="button"
            className="folded-bar-summary collapse-trigger"
            aria-expanded={expanded}
            aria-controls={`folded-detail-${tweet.id}`}
            onClick={() => setExpanded(!expanded)}
          >
            <span className="folded-bar-icon">
              <img
                src="/logo-small.svg"
                alt="KeepXClean"
                width={16}
                height={16}
              />
            </span>
            <span className="folded-bar-text">
              <span className="folded-author">
                {formatHandle(tweet.author.handle)}
              </span>
              <span className="folded-sep">·</span>
              <span className="folded-reason">
                {tweet.filterReason?.ruleName ||
                  (isZh ? '已拦截内容' : 'Filtered Content')}
              </span>
            </span>
            <span className="btn-folded-toggle">
              {expanded
                ? isZh
                  ? '收起'
                  : 'Collapse'
                : isZh
                ? '展开查看'
                : 'View'}
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </span>
          </button>

          {expanded && (
            <div
              id={`folded-detail-${tweet.id}`}
              className="folded-expanded-view"
            >
              <div className="folded-expanded-header">
                <div className="folded-expanded-badges">
                  {tweet.filterReason && (
                    <span className={`risk-tag ${tweet.filterReason.category}`}>
                      {tweet.filterReason.category.toUpperCase()}
                    </span>
                  )}
                  <span className="tweet-author-handle">UID {tweet.id}</span>
                </div>
                <div className="folded-expanded-actions">
                  <button
                    type="button"
                    className="btn-collapse-action"
                    onClick={() => setExpanded(false)}
                  >
                    {isZh ? '收起' : 'Collapse'}
                  </button>
                  <button
                    type="button"
                    className="btn-collapse-action primary"
                    onClick={() => onWhitelist(tweet.author.handle)}
                  >
                    <UserCheck size={12} />
                    <span>{isZh ? '加入白名单' : 'Whitelist'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-collapse-action danger"
                    onClick={() => onQuickClean(tweet)}
                  >
                    <Trash2 size={12} />
                    <span>{isZh ? '净空' : 'Clean'}</span>
                  </button>
                </div>
              </div>

              {tweet.filterReason?.evidence && (
                <div className="folded-expanded-evidence">
                  <strong>{isZh ? '命中依据：' : 'Evidence: '}</strong>
                  <span>{tweet.filterReason.evidence}</span>
                </div>
              )}

              {/* Reveal original tweet content */}
              <div className="tweet-card" style={{ opacity: 0.9 }}>
                <div className="tweet-avatar-col">
                  <img
                    src={tweet.author.avatar}
                    alt={tweet.author.name}
                    className="tweet-avatar"
                  />
                </div>
                <div className="tweet-content-col">
                  <div className="tweet-header-row">
                    <div className="tweet-author-info">
                      <span className="tweet-author-name">
                        {tweet.author.name}
                      </span>
                      {(tweet.author.isBlueVerified ||
                        tweet.author.isVerified) && (
                        <XVerifiedBadge size={15} />
                      )}
                      <span className="tweet-author-handle">
                        {formatHandle(tweet.author.handle)}
                      </span>
                      <span className="tweet-timestamp">
                        · {tweet.createdAt}
                      </span>
                    </div>
                  </div>
                  <p className="tweet-body-text">{tweet.content}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Normal visible X reply
  return (
    <div
      className={`tweet-item-wrapper stagger-${staggerIndex}`}
      data-tweet-id={tweet.id}
    >
      <article className="tweet-card">
        <div className="tweet-avatar-col">
          <img
            src={tweet.author.avatar}
            alt={tweet.author.name}
            className="tweet-avatar"
          />
        </div>
        <div className="tweet-content-col">
          <div className="tweet-header-row">
            <div className="tweet-author-info">
              <span className="tweet-author-name">{tweet.author.name}</span>
              {tweet.author.isAuthor && (
                <span className="tweet-op-badge">OP</span>
              )}
              {(tweet.author.isBlueVerified || tweet.author.isVerified) && (
                <XVerifiedBadge size={15} />
              )}
              <span className="tweet-author-handle">
                {formatHandle(tweet.author.handle)}
              </span>
              <span className="tweet-timestamp">· {tweet.createdAt}</span>
              {tweet.sponsoredTag && (
                <span className="tweet-sponsored-tag">
                  {tweet.sponsoredTag}
                </span>
              )}
            </div>
            {!tweet.isOriginalPost && (
              <div className="tweet-top-actions">
                <button
                  type="button"
                  className="btn-quick-clean"
                  aria-label={
                    isZh
                      ? `净空拦截 ${formatHandle(tweet.author.handle)}`
                      : `Clean ${formatHandle(tweet.author.handle)}`
                  }
                  onClick={() => onQuickClean(tweet)}
                >
                  <Ban size={12} />
                  <span>{isZh ? '净空' : 'Clean'}</span>
                </button>
              </div>
            )}
          </div>
          <p className="tweet-body-text">{tweet.content}</p>

          {/* Authentic X Reply Engagement Bar */}
          <div className="x-reply-metrics" aria-hidden="true">
            <span className="x-reply-metric">
              <MessageSquare size={14} />
              <span className="tabular-nums">{tweet.metrics.replies}</span>
            </span>
            <span className="x-reply-metric">
              <Repeat2 size={14} />
              <span className="tabular-nums">{tweet.metrics.retweets}</span>
            </span>
            <span className="x-reply-metric">
              <Heart size={14} />
              <span className="tabular-nums">{tweet.metrics.likes}</span>
            </span>
            <span className="x-reply-metric">
              <BarChart3 size={14} />
              <span className="tabular-nums">
                {tweet.metrics.likes * 18 + 120}
              </span>
            </span>
          </div>
        </div>
      </article>
    </div>
  );
}
