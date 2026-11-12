import { useState } from 'react';
import {
  UserRoundCheck,
  Ban,
  RotateCcw,
  Info,
  Calendar,
  Activity,
  Hash,
  Eye,
} from 'lucide-react';
import { useI18n } from '../../locales';

export function ProfileBadgeCard() {
  const { t } = useI18n();
  const c3 = t.bento.card3;

  const [isFollowing, setIsFollowing] = useState(false);
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [isCleaned, setIsCleaned] = useState(false);
  const [showUndoToast, setShowUndoToast] = useState(false);

  const handleToggleFollowing = () => {
    setIsFollowing((prev) => !prev);
    // Reset whitelisted/cleaned when toggling following
    setIsWhitelisted(false);
    setIsCleaned(false);
    setShowUndoToast(false);
  };

  const handleWhitelist = () => {
    setIsWhitelisted((prev) => !prev);
    if (isCleaned) setIsCleaned(false);
    setShowUndoToast(false);
  };

  const handleClean = () => {
    setIsCleaned(true);
    setIsWhitelisted(false);
    setShowUndoToast(true);
  };

  const handleUndoClean = () => {
    setIsCleaned(false);
    setShowUndoToast(false);
  };

  return (
    <article
      className="bento-card bento-profile-card"
      data-testid="bento-card-profile"
    >
      <div className="bento-card-header">
        <span className="bento-card-tag">{c3.tag}</span>
        <h3 className="bento-card-title">{c3.title}</h3>
        <p className="bento-card-desc">{c3.desc}</p>
      </div>

      <div className="profile-sim-box">
        {/* Profile Banner */}
        <div className="profile-sim-cover" />

        <div className="profile-sim-body">
          <div className="profile-sim-avatar-row">
            <div className="profile-sim-avatar" aria-hidden="true">
              🚀
            </div>
            <div className="profile-sim-actions">
              <button
                type="button"
                className={`btn-icon-subtle ${isWhitelisted ? 'copied' : ''}`}
                onClick={handleWhitelist}
                title={c3.actionWhitelist}
                aria-label={c3.actionWhitelist}
                data-testid="profile-whitelist-btn"
              >
                <UserRoundCheck size={16} />
              </button>
              <button
                type="button"
                className="btn-icon-subtle"
                onClick={handleClean}
                title={c3.actionClean}
                aria-label={c3.actionClean}
                data-testid="profile-clean-btn"
              >
                <Ban size={16} />
              </button>
            </div>
          </div>

          <div className="profile-sim-user">
            <div className="profile-sim-name-row">
              <span className="profile-sim-display-name">
                Free Crypto AirDrop 🚀
              </span>
              <span className="keyword-scope-pill">{c3.verifiedBotBadge}</span>
            </div>
            <div className="profile-sim-handle">@airdrop_fast_claim</div>
          </div>

          <div className="profile-sim-bio">
            Official 10,000 $SOL Giveaway! Connect wallet to claim. DM for early whitelist spot.
          </div>

          <div className="profile-sim-counts">
            <span><strong>14</strong> {c3.followingCount}</span>
            <span><strong>82</strong> {c3.followersCount}</span>
          </div>

          {/* Injected Risk Bar ("Mark, don't block" simulation) */}
          <div
            className={`profile-injected-bar ${
              isFollowing || isWhitelisted ? 'exempt' : ''
            }`}
            data-testid="profile-injected-bar"
          >
            <div className="profile-injected-left">
              <img
                src="/logo.svg"
                alt="KeepXClean"
                width={16}
                height={16}
                style={{ borderRadius: 'var(--radius-logo)' }}
              />

              {isFollowing ? (
                <span className="profile-risk-chip safe">
                  {c3.exemptionLabel}
                </span>
              ) : isWhitelisted ? (
                <span className="profile-risk-chip safe">
                  {c3.whitelistedBadge}
                </span>
              ) : isCleaned ? (
                <span className="profile-risk-chip warning">
                  {c3.locallyBlockedBadge}
                </span>
              ) : (
                <>
                  {/* Account Age with Tooltip */}
                  <div className="tooltip-wrapper">
                    <span className="profile-risk-chip warning" data-testid="chip-age">
                      <Calendar size={11} /> 14d
                    </span>
                    <div className="tooltip-box">
                      {c3.badgeAccountAge}: {c3.tooltipAccountAge}
                    </div>
                  </div>

                  {/* Daily Tweet Rate with Tooltip */}
                  <div className="tooltip-wrapper">
                    <span className="profile-risk-chip warning" data-testid="chip-rate">
                      <Activity size={11} /> 148/day
                    </span>
                    <div className="tooltip-box">
                      {c3.badgeDailyRate}: {c3.tooltipDailyRate}
                    </div>
                  </div>

                  {/* Community Flags with Tooltip */}
                  <div className="tooltip-wrapper">
                    <span className="profile-risk-chip warning" data-testid="chip-flags">
                      <Hash size={11} /> 12x
                    </span>
                    <div className="tooltip-box">
                      {c3.badgeCrowdFlags}: {c3.tooltipCrowdFlags}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="profile-mark-notice">
              <Eye size={12} />
              <span>{c3.badgeActionMark}</span>
            </div>
          </div>

          {/* Preserved Tweets Explanation */}
          <div className="profile-preserved-posts">
            <span>
              {isCleaned
                ? c3.timelineCollapsedNotice
                : c3.timelineVisibleNotice}
            </span>
            {showUndoToast && (
              <button
                type="button"
                className="btn-undo"
                style={{ padding: '2px 8px', fontSize: '11px' }}
                onClick={handleUndoClean}
                data-testid="undo-clean-toast-btn"
              >
                <RotateCcw size={10} /> {c3.undoButton}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Following Exemption Toggle */}
      <div className="profile-controls-row">
        <label className="following-toggle-wrapper">
          <input
            type="checkbox"
            checked={isFollowing}
            onChange={handleToggleFollowing}
            data-testid="following-exemption-toggle"
          />
          <span>{c3.toggleFollowingLabel} ({isFollowing ? c3.statusFollowing : c3.statusNotFollowing})</span>
        </label>
        <small className="text-muted">{c3.exemptionDesc}</small>
      </div>
    </article>
  );
}
