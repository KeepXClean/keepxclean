import { useState, useEffect } from 'react';
import { Users, Ban, CheckCircle2, Globe, RefreshCw } from 'lucide-react';
import { useI18n } from '../locales';
import { API_STATS_URL } from '../config';

export interface CommunityStatsData {
  totalFlaggedAccounts: number;
  activeCrowdBlocked: number;
  totalVotes: number;
}

export const FALLBACK_STATS: CommunityStatsData = {
  totalFlaggedAccounts: 1280,
  activeCrowdBlocked: 450,
  totalVotes: 3890,
};

export function CommunityStats() {
  const { locale, t } = useI18n();
  const statsDict = t.stats;

  const [stats, setStats] = useState<CommunityStatsData>(FALLBACK_STATS);
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [displayCounts, setDisplayCounts] = useState({
    accounts: FALLBACK_STATS.totalFlaggedAccounts,
    blocked: FALLBACK_STATS.activeCrowdBlocked,
    votes: FALLBACK_STATS.totalVotes,
  });

  const fetchStats = async (externalSignal?: AbortSignal) => {
    setIsLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    try {
      const res = await fetch(API_STATS_URL, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (
        typeof json.totalFlaggedAccounts === 'number' &&
        typeof json.activeCrowdBlocked === 'number' &&
        typeof json.totalVotes === 'number'
      ) {
        setStats((prev) => {
          if (
            prev.totalFlaggedAccounts === json.totalFlaggedAccounts &&
            prev.activeCrowdBlocked === json.activeCrowdBlocked &&
            prev.totalVotes === json.totalVotes
          ) {
            return prev;
          }
          return {
            totalFlaggedAccounts: json.totalFlaggedAccounts,
            activeCrowdBlocked: json.activeCrowdBlocked,
            totalVotes: json.totalVotes,
          };
        });
        setIsLive(true);
      } else {
        throw new Error('Invalid schema');
      }
    } catch {
      // Graceful fallback to fixture
      setStats((prev) => (prev === FALLBACK_STATS ? prev : FALLBACK_STATS));
      setIsLive(false);
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal);
    return () => {
      controller.abort();
    };
  }, []);

  // Number roll-up animation
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion) {
      setDisplayCounts({
        accounts: stats.totalFlaggedAccounts,
        blocked: stats.activeCrowdBlocked,
        votes: stats.totalVotes,
      });
      return;
    }

    const duration = 800;
    const startTime = performance.now();
    let animId: number;

    const animate = (now: number) => {
      const elapsed = Math.max(0, Math.min(now - startTime, duration));
      const progress = Math.max(0, Math.min(1, elapsed / duration));
      // Ease out quad
      const rawEased = 1 - (1 - progress) * (1 - progress);
      const eased = Math.max(0, Math.min(1, rawEased));

      setDisplayCounts({
        accounts: Math.max(0, Math.round(stats.totalFlaggedAccounts * eased)),
        blocked: Math.max(0, Math.round(stats.activeCrowdBlocked * eased)),
        votes: Math.max(0, Math.round(stats.totalVotes * eased)),
      });

      if (elapsed < duration) {
        animId = requestAnimationFrame(animate);
      }
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [stats]);

  const numberFormatter = new Intl.NumberFormat(locale);

  const metrics = [
    {
      id: 'accounts',
      val: `${numberFormatter.format(displayCounts.accounts)}+`,
      title: statsDict.metricAccounts,
      desc: statsDict.metricAccountsDesc,
      icon: <Users size={20} />,
    },
    {
      id: 'blocked',
      val: `${numberFormatter.format(displayCounts.blocked)}+`,
      title: statsDict.metricBlocked,
      desc: statsDict.metricBlockedDesc,
      icon: <Ban size={20} />,
    },
    {
      id: 'votes',
      val: numberFormatter.format(displayCounts.votes),
      title: statsDict.metricVotes,
      desc: statsDict.metricVotesDesc,
      icon: <CheckCircle2 size={20} />,
    },
    {
      id: 'languages',
      val: '10',
      title: statsDict.metricLanguages,
      desc: statsDict.metricLanguagesDesc,
      icon: <Globe size={20} />,
    },
  ];

  return (
    <div className="stats-container" data-testid="community-stats-container">
      <div className="m5-section-header">
        <span className="m5-badge">{statsDict.badge}</span>
        <h2 className="m5-title">{statsDict.title}</h2>
        <p className="m5-desc">{statsDict.sub}</p>
      </div>

      {/* Status Bar */}
      <div className="stats-status-bar">
        <div
          className={`stats-status-pill ${isLive ? 'live' : 'fallback'}`}
          data-testid="stats-status-indicator"
          role="status"
          aria-live="polite"
        >
          <span className={`pulse-marker ${isLive ? 'live' : 'fallback'}`} />
          <span>{isLive ? statsDict.liveIndicator : statsDict.fallbackNotice}</span>
          {!isLive && (
            <button
              type="button"
              className="btn-icon-subtle"
              onClick={() => fetchStats()}
              disabled={isLoading}
              title="Retry sync"
              aria-label="Retry sync"
              style={{ width: 20, height: 20 }}
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* 4 Metrics Grid */}
      <div className="stats-grid">
        {metrics.map((m) => (
          <div
            key={m.id}
            className="stats-metric-card"
            data-testid={`stats-metric-${m.id}`}
          >
            <div className="stats-metric-icon">{m.icon}</div>
            <div className="stats-metric-val">{m.val}</div>
            <div className="stats-metric-title">{m.title}</div>
            <p className="stats-metric-desc">{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
