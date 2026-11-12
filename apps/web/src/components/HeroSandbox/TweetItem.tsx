import { useState } from 'react';
import { ChevronDown, ChevronUp, UserCheck, Trash2, Ban } from 'lucide-react';
import { formatHandle, type SandboxDisplayMode, type SandboxTweet } from './types';

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
          className={`folded-bar-container collapse-bar${expanded ? ' expanded' : ''}`}
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
              <span className="folded-author">{formatHandle(tweet.author.handle)}</span>
              <span className="folded-sep">·</span>
              <span className="folded-reason">
                {tweet.filterReason?.ruleName || (isZh ? '已拦截内容' : 'Filtered Content')}
              </span>
            </span>
            <span className="btn-folded-toggle">
              {expanded
                ? isZh ? '收起' : 'Collapse'
                : isZh ? '展开查看' : 'View'}
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
              <div className="tweet-card" style={{ opacity: 0.88 }}>
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
                      {tweet.author.isBlueVerified && (
                        <span
                          className="tweet-verified-badge"
                          title="Verified Account"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        </span>
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

  // Normal visible tweet
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
              {tweet.author.isBlueVerified && (
                <span
                  className="tweet-verified-badge"
                  title="Verified Account"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                </span>
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
        </div>
      </article>
    </div>
  );
}
