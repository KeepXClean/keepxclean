import { useState } from 'react';
import {
  ArrowUpRight,
  Play,
  Plus,
  RefreshCw,
  UserRoundCheck,
} from 'lucide-react';
import { formatCount, useI18n } from '../../i18n';
import { openOptions } from '../../services/client';
import { useApp, mutate } from '../../state/store';
import {
  Banner,
  Button,
  Empty,
  NumberField,
  Panel,
  perform,
  Pill,
  ReloadXButton,
  Setting,
  Switch,
} from '../../ui/components';
import { Presets, Presentation, rulePatch } from '../rules/RulesPage';
import { SyncStatus } from '../preferences/PreferencesPage';
import { whitelistLog } from '../history/HistoryPage';

export function QuickControls({ drawer = false }: { drawer?: boolean }) {
  const { data } = useApp();
  const { m, locale } = useI18n();
  const { config, stats, logs, sync } = data!;
  const [keyword, setKeyword] = useState(''),
    [exemptBigV, setExemptBigV] = useState(false),
    [needsReloadHint, setNeedsReloadHint] = useState(false),
    [message, setMessage] = useState(''),
    [adding, setAdding] = useState(false);

  const visibleLogs = logs
    .filter((log) => log.ruleId !== 'promoted_ad')
    .slice(0, drawer ? 5 : 3);
  const todayAds = stats.todayAdsHidden ?? 0;

  async function addKeyword() {
    if (!keyword.trim()) return;
    setAdding(true);
    setMessage('');
    try {
      await mutate({
        type: 'keyword.save',
        item: {
          id: crypto.randomUUID(),
          pattern: keyword.trim(),
          isRegex: false,
          enabled: true,
          scopes: ['text', 'bio'],
          ...(exemptBigV ? { maxFollowersExempt: 20000 } : {}),
        },
      });
      setKeyword('');
      setMessage(
        exemptBigV ? m.quick.addedKeywordExempt : m.quick.addedKeywordAll
      );
    } catch {
      /* shared save error */
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="compact stack">
      {!config.enabled && (
        <Banner
          kind="warning"
          action={
            <div className="row" style={{ gap: 6 }}>
              <ReloadXButton label={m.common.reloadX} />
              <Button
                variant="primary sm"
                onClick={() =>
                  perform({ type: 'config.patch', patch: { enabled: true } })
                }
              >
                <Play size={12} />
                {m.rules.resumeCleaning}
              </Button>
            </div>
          }
        >
          {m.quick.pausedBanner}
        </Banner>
      )}

      <div className="stats-strip">
        <div className="stats-strip-main">
          <span className="stats-strip-item primary">
            <span className="small muted">
              {stats.partialDay === stats.todayDate
                ? m.quick.todayCleanedPartial
                : m.quick.todayCleaned}
            </span>
            <strong>{formatCount(stats.todayBlocked, locale)}</strong>
          </span>
          <span className="stats-divider" />
          <span className="stats-strip-item">
            <span className="small muted">{m.quick.totalCleaned}</span>
            <strong>{formatCount(stats.totalBlocked, locale)}</strong>
          </span>
        </div>
        {(todayAds > 0 || config.rules.hidePromotedAds.enabled) && (
          <Pill kind="neutral" title={m.quick.adsHiddenTooltip}>
            {m.quick.adsHiddenBadge(formatCount(todayAds, locale))}
          </Pill>
        )}
      </div>

      <div className={!config.enabled ? 'stack paused-dim' : 'stack'}>
        <div className="stack-sm">
          <div className="row between">
            <h3>{m.quick.strengthHeading}</h3>
            {config.preset === 'custom' && (
              <Pill kind="neutral">{m.presets.customParams}</Pill>
            )}
          </div>
          <Presets config={config} />
        </div>

        <div className="stack-sm">
          <div className="row between">
            <h3>{m.quick.presentationHeading}</h3>
            {needsReloadHint && <ReloadXButton label={m.common.reloadXApply} />}
          </div>
          <Presentation
            config={config}
            onChanged={() => setNeedsReloadHint(true)}
          />
        </div>

        {drawer && (
          <Panel>
            <div className="stack">
              <NumberField
                label={m.quick.dailyMaxLabel}
                value={config.rules.highFrequency.maxDailyTweets}
                unit={m.quick.dailyMaxUnit}
                step={0.1}
                sliderMax={150}
                onCommit={(value) =>
                  rulePatch('highFrequency', 'maxDailyTweets', value)
                }
              />
              <NumberField
                label={m.quick.crowdMinLabel}
                value={config.rules.crowdBlock.minBlockCount}
                unit={m.quick.crowdMinUnit}
                min={1}
                sliderMax={20}
                onCommit={(value) =>
                  rulePatch('crowdBlock', 'minBlockCount', value)
                }
              />
            </div>
            <Setting title={m.quick.exemptFollowing}>
              <Switch
                label={m.quick.exemptFollowing}
                checked={config.exemptFollowing}
                onChange={(exemptFollowing) =>
                  perform({ type: 'config.patch', patch: { exemptFollowing } })
                }
              />
            </Setting>
          </Panel>
        )}

        <div className="stack-sm">
          <div className="row between">
            <h3>{m.quick.quickKeywordHeading}</h3>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => void openOptions('keywords')}
            >
              {m.quick.manageKeywords} <ArrowUpRight size={12} />
            </button>
          </div>
          <form
            className="row"
            style={{ gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              void addKeyword();
            }}
          >
            <input
              className="input"
              style={{ minHeight: 32, padding: '5px 10px' }}
              aria-label={m.quick.quickKeywordAria}
              placeholder={m.quick.quickKeywordPlaceholder}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Button
              type="submit"
              variant="primary icon"
              style={{ width: 32, minHeight: 32 }}
              aria-label={m.quick.addKeywordAria}
              loading={adding}
              disabled={!keyword.trim()}
            >
              <Plus size={15} />
            </Button>
          </form>
          <div className="row between">
            <label
              className="check-label small muted"
              style={{ fontSize: 12, gap: 6 }}
            >
              <input
                type="checkbox"
                checked={exemptBigV}
                onChange={(e) => setExemptBigV(e.target.checked)}
              />
              {m.quick.exempt20kLabel}
            </label>
          </div>
          {message && (
            <div className="row between" role="status">
              <span className="small" style={{ color: 'var(--green-hover)' }}>
                {message}
              </span>
              {needsReloadHint && <ReloadXButton label={m.common.reloadX} />}
            </div>
          )}
        </div>
      </div>

      <div className="stack-sm">
        <div className="row between">
          <h3>{m.quick.recentHeading}</h3>
          <Button variant="ghost sm" onClick={() => void openOptions('history')}>
            {m.quick.allLogs} <ArrowUpRight size={12} />
          </Button>
        </div>
        {visibleLogs.length ? (
          <div className="recent-list">
            {visibleLogs.map((log) => {
              const whitelisted = Boolean(config.whitelistUids[log.authorUid]);
              const target = log.authorScreenName || log.authorUid;
              return (
                <div className="recent-row" key={log.id}>
                  <div className="grow">
                    <div className="row" style={{ gap: 6 }}>
                      <strong className="small ellipsis">
                        {log.authorScreenName
                          ? `@${log.authorScreenName}`
                          : log.authorName || log.authorUid}
                      </strong>
                      <Pill kind="neutral">
                        {m.history.ruleLabels[log.ruleId] || log.ruleId}
                      </Pill>
                    </div>
                    <p
                      className="small muted ellipsis"
                      title={log.tweetSnippet || log.reasonText}
                    >
                      {log.tweetSnippet || log.reasonText}
                    </p>
                  </div>
                  {whitelisted ? (
                    <Pill>{m.quick.whitelistedPill}</Pill>
                  ) : (
                    <Button
                      variant="ghost sm"
                      aria-label={m.quick.whitelistAria(target)}
                      onClick={() =>
                        void whitelistLog(log)
                          .then(() => {
                            setNeedsReloadHint(
                              config.interceptionMode === 'strip'
                            );
                            setMessage(
                              config.interceptionMode === 'strip'
                                ? m.quick.whitelistedStripMsg(target)
                                : m.quick.whitelistedMsg(target)
                            );
                          })
                          .catch(() => undefined)
                      }
                    >
                      <UserRoundCheck size={13} />
                      {m.quick.whitelistBtn}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty title={m.quick.emptyTitle} description={m.quick.emptyDesc} />
        )}
      </div>

      {drawer && (
        <div className="row between">
          <SyncStatus compact />
          <Button
            variant="ghost icon sm"
            aria-label={m.quick.refreshSnapshotAria}
            loading={sync.status === 'syncing'}
            onClick={() => perform({ type: 'snapshot.refresh' })}
          >
            <RefreshCw size={13} />
          </Button>
        </div>
      )}
    </div>
  );
}
