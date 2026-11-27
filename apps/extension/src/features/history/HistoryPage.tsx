import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Ban,
  ChevronRight,
  Image as ImageIcon,
  Trash2,
  UserRoundCheck,
} from 'lucide-react';
import type { InterceptionLogEntry, TriggeredRuleId } from '@keepxclean/shared';
import { formatCount, formatDateTime, useI18n } from '../../i18n';
import { rollStats } from '../../services/model';
import { mutate, useApp } from '../../state/store';
import {
  Banner,
  Button,
  Confirm,
  Empty,
  Modal,
  Page,
  Panel,
  Pill,
  ReloadXButton,
  SearchBox,
  usePagination,
} from '../../ui/components';
import { accountProfileUrl } from '../accounts/AccountsPage';
import { OperationCard } from './Operations';
import { ReportCardModal } from './ReportCardModal';

function safeNonNegInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function whitelistLog(log: InterceptionLogEntry) {
  return mutate({
    type: 'account.save',
    list: 'white',
    entry: {
      uid: log.authorUid,
      screenName: log.authorScreenName,
      name: log.authorName,
      avatarUrl: log.authorAvatar,
      addedAt: Date.now(),
    },
  });
}

function blocklistLog(log: InterceptionLogEntry, reason: string) {
  return mutate({
    type: 'account.save',
    list: 'black',
    entry: {
      uid: log.authorUid,
      screenName: log.authorScreenName,
      name: log.authorName,
      avatarUrl: log.authorAvatar,
      tag: 'spam',
      reason,
      addedAt: Date.now(),
    },
  });
}

export function HistoryPage() {
  const { data } = useApp();
  const { m, locale } = useI18n();
  const { config, logs, stats, operations } = data!;
  const [query, setQuery] = useState(''),
    [rule, setRule] = useState('all'),
    [scene, setScene] = useState('all'),
    [detail, setDetail] = useState<InterceptionLogEntry | null>(null),
    [clear, setClear] = useState(false),
    [reportOpen, setReportOpen] = useState(false),
    [success, setSuccess] = useState('');

  const ruleLabels = m.history.ruleLabels;
  const sceneLabels = m.history.sceneLabels;

  const filtered = logs.filter(
    (x) =>
      (rule === 'all' || x.ruleId === rule) &&
      (scene === 'all' || x.scene === scene) &&
      `${x.authorName} ${x.authorScreenName} ${x.tweetSnippet} ${x.reasonText}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  const page = usePagination(filtered, query + rule + scene);

  const addWhite = async (log: InterceptionLogEntry) => {
    try {
      await whitelistLog(log);
      setSuccess(
        m.history.addedWhiteNotice(log.authorScreenName || log.authorUid)
      );
    } catch {
      /* SaveError owns the failure message. */
    }
  };
  const addBlack = async (log: InterceptionLogEntry) => {
    try {
      await blocklistLog(
        log,
        m.history.blockedFromLogReason(
          Object.prototype.hasOwnProperty.call(ruleLabels, log.ruleId)
            ? ruleLabels[log.ruleId]
            : String(log.ruleId)
        )
      );
      setSuccess(
        m.history.addedBlackNotice(log.authorScreenName || log.authorUid)
      );
    } catch {
      /* SaveError owns the failure message. */
    }
  };

  const rolledStats = useMemo(() => rollStats(stats), [stats]);
  const todayBlocked = safeNonNegInt(rolledStats.todayBlocked);
  const totalBlocked = safeNonNegInt(rolledStats.totalBlocked);
  const todayAds = safeNonNegInt(rolledStats.todayAdsHidden);
  const rawByRule =
    rolledStats.byRule && typeof rolledStats.byRule === 'object'
      ? rolledStats.byRule
      : {};
  const totalAds =
    rolledStats.totalAdsHidden !== undefined
      ? safeNonNegInt(rolledStats.totalAdsHidden)
      : Object.prototype.hasOwnProperty.call(rawByRule, 'promoted_ad')
        ? safeNonNegInt(rawByRule.promoted_ad)
        : 0;

  const ruleBreakdownMap = new Map<TriggeredRuleId, number>();
  for (const [k, v] of Object.entries(rawByRule)) {
    if (!Object.prototype.hasOwnProperty.call(ruleLabels, k)) continue;
    const count = safeNonNegInt(v);
    if (count > 0) {
      ruleBreakdownMap.set(k as TriggeredRuleId, count);
    }
  }
  if (totalAds > 0 && !ruleBreakdownMap.has('promoted_ad')) {
    ruleBreakdownMap.set('promoted_ad', totalAds);
  }
  const ruleBreakdown = [...ruleBreakdownMap.entries()]
    .map(([ruleId, count]) => ({
      ruleId,
      label: ruleLabels[ruleId],
      count,
    }))
    .sort((a, b) => b.count - a.count);
  const maxRuleCount = Math.max(1, ruleBreakdown[0]?.count ?? 1);

  const dailyHistory = rolledStats.dailyHistory ?? [];
  const sevenDayTotal = dailyHistory.reduce(
    (sum, d) => sum + safeNonNegInt(d.blocked) + safeNonNegInt(d.ads),
    0
  );
  const maxDailyTotal = Math.max(
    1,
    ...dailyHistory.map((d) => safeNonNegInt(d.blocked) + safeNonNegInt(d.ads))
  );

  return (
    <Page
      title={m.history.pageTitle}
      description={m.history.pageDesc}
      action={
        <div className="row" style={{ gap: 8 }}>
          <Button
            data-kxc-report-btn="true"
            onClick={() => setReportOpen(true)}
          >
            <ImageIcon size={15} />
            {m.history.reportBtn}
          </Button>
          <Button
            variant="danger"
            disabled={!logs.length}
            onClick={() => setClear(true)}
          >
            <Trash2 size={15} />
            {m.history.clearBtn}
          </Button>
        </div>
      }
    >
      <div className="stats">
        <div className="stat">
          <span className="small muted">
            {rolledStats.partialDay === rolledStats.todayDate
              ? m.history.statTodayPartial
              : m.history.statToday}
          </span>
          <strong>{formatCount(todayBlocked, locale)}</strong>
          <span className="small muted">
            {m.history.statTodayAds(formatCount(todayAds, locale))}
          </span>
        </div>
        <div className="stat">
          <span className="small muted">{m.history.statTotal}</span>
          <strong>{formatCount(totalBlocked, locale)}</strong>
          <span className="small muted">
            {m.history.statTotalAds(formatCount(totalAds, locale))}
          </span>
        </div>
        <div className="stat">
          <span className="small muted">{m.history.statRetained}</span>
          <strong>{logs.length}</strong>
          <span className="small muted">{m.history.statRetainedHint}</span>
        </div>
      </div>

      <div className="analytics-grid">
        <Panel
          title={m.history.distributionTitle}
          description={m.history.distributionHint}
          action={
            rule !== 'all' ? (
              <Button variant="ghost sm" onClick={() => setRule('all')}>
                {m.history.clearRuleFilterBtn}
              </Button>
            ) : undefined
          }
        >
          {ruleBreakdown.length > 0 ? (
            <div className="rule-dist-list">
              {ruleBreakdown.map((item) => {
                const widthPct = Math.max(
                  4,
                  Math.round((item.count / maxRuleCount) * 100)
                );
                if (item.ruleId === 'promoted_ad') {
                  return (
                    <div
                      key={item.ruleId}
                      className="rule-dist-row rule-dist-static"
                      data-rule-id={item.ruleId}
                    >
                      <div className="row between" style={{ gap: 8 }}>
                        <span className="row" style={{ gap: 6 }}>
                          <span className="small" style={{ fontWeight: 550 }}>
                            {item.label}
                          </span>
                          <Pill kind="neutral">{m.history.adsNotLoggedHint}</Pill>
                        </span>
                        <span className="small muted">
                          {formatCount(item.count, locale)}
                        </span>
                      </div>
                      <div className="rule-dist-track">
                        <div
                          className="rule-dist-fill"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  );
                }
                const active = rule === item.ruleId;
                return (
                  <button
                    key={item.ruleId}
                    type="button"
                    className="rule-dist-row"
                    data-rule-id={item.ruleId}
                    aria-pressed={active}
                    onClick={() => setRule(active ? 'all' : item.ruleId)}
                  >
                    <div className="row between" style={{ gap: 8 }}>
                      <span className="small" style={{ fontWeight: 550 }}>
                        {item.label}
                      </span>
                      <span className="small muted">
                        {formatCount(item.count, locale)}
                      </span>
                    </div>
                    <div className="rule-dist-track">
                      <div
                        className="rule-dist-fill"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="small muted">{m.history.distributionEmpty}</p>
          )}
        </Panel>

        <Panel
          title={m.history.trendTitle}
          description={m.history.trendDesc}
          action={
            <Pill kind="neutral">
              {m.history.trendTotal(formatCount(sevenDayTotal, locale))}
            </Pill>
          }
        >
          <div className="trend-chart" data-kxc-trend="true">
            {dailyHistory.map((day) => {
              const blocked = safeNonNegInt(day.blocked);
              const ads = safeNonNegInt(day.ads);
              const total = blocked + ads;
              const barHeightPct =
                total > 0 ? Math.max(8, Math.round((total / maxDailyTotal) * 100)) : 0;
              const blockedShare = total > 0 ? (blocked / total) * 100 : 0;
              const adsShare = total > 0 ? (ads / total) * 100 : 0;
              const shortLabel = day.date.slice(5).replace('-', '/');
              const isToday = day.date === rolledStats.todayDate;
              return (
                <div
                  key={day.date}
                  className="trend-col"
                  data-date={day.date}
                  data-today={isToday ? 'true' : undefined}
                  title={`${day.date} · ${m.history.trendBlockedLegend}: ${blocked} · ${m.history.trendAdsLegend}: ${ads}`}
                >
                  <div className="trend-bar-wrap">
                    {total > 0 && (
                      <span className="small muted" style={{ fontSize: 10.5 }}>
                        {total}
                      </span>
                    )}
                    <div
                      className="trend-bar-stack"
                      style={{ height: total > 0 ? `${barHeightPct}%` : '4px' }}
                    >
                      {blocked > 0 && (
                        <div
                          className="trend-bar-blocked"
                          style={{ height: `${blockedShare}%` }}
                        />
                      )}
                      {ads > 0 && (
                        <div
                          className="trend-bar-ads"
                          style={{ height: `${adsShare}%` }}
                        />
                      )}
                    </div>
                  </div>
                  <span className="trend-day-label">{shortLabel}</span>
                </div>
              );
            })}
          </div>
          <div className="row wrap" style={{ gap: 14, marginTop: 10 }}>
            <span className="row small muted" style={{ gap: 6 }}>
              <span className="dot" />
              {m.history.trendBlockedLegend}
            </span>
            <span className="row small muted" style={{ gap: 6 }}>
              <span
                className="dot"
                style={{ background: 'var(--control-border)' }}
              />
              {m.history.trendAdsLegend}
            </span>
          </div>
        </Panel>
      </div>

      {success && (
        <Banner
          kind="success"
          action={<ReloadXButton />}
          onDismiss={() => setSuccess('')}
        >
          {success}
        </Banner>
      )}

      <div className="row wrap">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder={m.history.searchPlaceholder}
        />
        <select
          style={{ width: 'auto' }}
          aria-label={m.history.filterRuleAria}
          value={rule}
          onChange={(e) => setRule(e.target.value)}
        >
          <option value="all">{m.history.allRules}</option>
          {Object.entries(ruleLabels)
            .filter(([key]) => key !== 'promoted_ad')
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </select>
        <select
          style={{ width: 'auto' }}
          aria-label={m.history.filterSceneAria}
          value={scene}
          onChange={(e) => setScene(e.target.value)}
        >
          <option value="all">{m.history.allScenes}</option>
          {Object.entries(sceneLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <Panel className="table-panel">
        {filtered.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{m.history.colContent}</th>
                    <th>{m.history.colReason}</th>
                    <th>{m.history.colTimeScene}</th>
                    <th style={{ textAlign: 'right' }}>
                      {m.history.colActions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((log) => {
                    const isWhite = Boolean(config.whitelistUids[log.authorUid]);
                    const isBlack = Boolean(
                      config.localBlocklistUids[log.authorUid]
                    );
                    const targetLabel = log.authorScreenName || log.authorUid;
                    return (
                      <tr key={log.id}>
                        <td>
                          <div className="cell-main">
                            <div className="row" style={{ gap: 6 }}>
                              <a
                                className="account-link"
                                href={accountProfileUrl(
                                  log.authorUid,
                                  log.authorScreenName
                                )}
                                target="_blank"
                                rel="noreferrer"
                                title={m.history.openOnXTooltip}
                              >
                                <span className="ellipsis">
                                  {log.authorName ||
                                    (log.authorScreenName
                                      ? `@${log.authorScreenName}`
                                      : log.authorUid)}
                                </span>
                                <ArrowUpRight size={12} />
                              </a>
                              {log.authorScreenName && log.authorName && (
                                <span className="small muted">
                                  @{log.authorScreenName}
                                </span>
                              )}
                            </div>
                            <p
                              className="small muted ellipsis"
                              title={log.tweetSnippet}
                            >
                              {log.tweetSnippet || m.history.noSnippet}
                            </p>
                          </div>
                        </td>
                        <td>
                          <Pill kind="neutral">
                            {Object.prototype.hasOwnProperty.call(
                              ruleLabels,
                              log.ruleId
                            )
                              ? ruleLabels[log.ruleId]
                              : String(log.ruleId)}
                          </Pill>
                          <p
                            className="small muted break"
                            style={{ maxWidth: 260, marginTop: 4 }}
                          >
                            {log.reasonText}
                          </p>
                        </td>
                        <td className="small muted">
                          {formatDateTime(
                            log.timestamp,
                            locale,
                            m.common.neverSynced
                          )}
                          <br />
                          {Object.prototype.hasOwnProperty.call(
                            sceneLabels,
                            log.scene
                          )
                            ? sceneLabels[log.scene]
                            : String(log.scene)}
                        </td>
                        <td>
                          <div className="table-actions">
                            {log.ruleId === 'promoted_ad' ? (
                              <a
                                href="#/rules?rule=hidePromotedAds"
                                className="small"
                              >
                                {m.history.adRuleLink}
                              </a>
                            ) : (
                              <>
                                {isWhite ? (
                                  <Pill>{m.history.whitelistedPill}</Pill>
                                ) : (
                                  <Button
                                    variant="ghost sm"
                                    aria-label={m.quick.whitelistAria(
                                      targetLabel
                                    )}
                                    title={m.history.whitelistTooltip}
                                    onClick={() => void addWhite(log)}
                                  >
                                    <UserRoundCheck size={14} />
                                    {m.history.whitelistBtn}
                                  </Button>
                                )}
                                {isBlack ? (
                                  <Pill kind="neutral">
                                    {m.history.blacklistedPill}
                                  </Pill>
                                ) : (
                                  !isWhite &&
                                  /^\d{1,25}$/.test(log.authorUid) && (
                                    <Button
                                      variant="ghost icon sm"
                                      aria-label={m.history.blacklistAria(
                                        targetLabel
                                      )}
                                      title={m.history.blacklistTooltip}
                                      onClick={() => void addBlack(log)}
                                    >
                                      <Ban size={14} />
                                    </Button>
                                  )
                                )}
                              </>
                            )}
                            <Button
                              variant="ghost icon sm"
                              aria-label={m.history.viewDetailAria(log.tweetId)}
                              title={m.history.viewDetailTooltip}
                              onClick={() => setDetail(log)}
                            >
                              <ChevronRight size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {page.control}
          </>
        ) : (
          <Empty
            title={
              logs.length
                ? m.history.emptyFilterTitle
                : m.history.emptyCleanTitle
            }
            description={
              logs.length ? m.history.emptyFilterDesc : m.history.emptyCleanDesc
            }
          />
        )}
      </Panel>

      {operations.length > 0 && (
        <Panel
          title={m.history.operationsTitle}
          description={m.history.operationsDesc}
        >
          {operations.slice(0, 10).map((op) => (
            <OperationCard key={op.id} operation={op} />
          ))}
        </Panel>
      )}

      {detail && (
        <Modal
          title={m.history.detailTitle}
          onClose={() => setDetail(null)}
          footer={
            <>
              <Button onClick={() => setDetail(null)}>{m.common.close}</Button>
              {detail.ruleId === 'promoted_ad' ? (
                <a
                  className="btn primary"
                  href="#/rules?rule=hidePromotedAds"
                  onClick={() => setDetail(null)}
                >
                  {m.history.adjustAdRuleBtn}
                </a>
              ) : (
                <>
                  {!config.localBlocklistUids[detail.authorUid] &&
                    /^\d{1,25}$/.test(detail.authorUid) && (
                      <Button
                        variant="danger"
                        onClick={() => {
                          void addBlack(detail);
                          setDetail(null);
                        }}
                      >
                        <Ban size={14} />
                        {m.history.addToBlackBtn}
                      </Button>
                    )}
                  <Button
                    variant="primary"
                    onClick={() => {
                      void addWhite(detail);
                      setDetail(null);
                    }}
                  >
                    <UserRoundCheck size={14} />
                    {m.history.addToWhiteBtn}
                  </Button>
                </>
              )}
            </>
          }
        >
          <div className="stack">
            <div>
              <h3>
                {detail.authorName || `@${detail.authorScreenName}`}
                {detail.authorScreenName && detail.authorName
                  ? ` (@${detail.authorScreenName})`
                  : ''}
              </h3>
              <p className="small muted">
                UID {detail.authorUid} ·{' '}
                {formatDateTime(
                  detail.timestamp,
                  locale,
                  m.common.neverSynced
                )}{' '}
                ·{' '}
                {Object.prototype.hasOwnProperty.call(sceneLabels, detail.scene)
                  ? sceneLabels[detail.scene]
                  : String(detail.scene)}
              </p>
            </div>
            <p className="break">
              {detail.tweetSnippet || m.history.noSavedSnippet}
            </p>
            <Banner>{detail.reasonText}</Banner>
            {detail.evidence && (
              <div className="stack-sm">
                {detail.evidence.map((item, i) => (
                  <div className="row between" key={i}>
                    <span className="muted small">{item.label}</span>
                    <span className="small break">{String(item.value)}</span>
                  </div>
                ))}
              </div>
            )}
            {!detail.evidence && (
              <p className="small muted">{m.history.noStructuredEvidence}</p>
            )}
            <div className="row wrap" style={{ gap: 16 }}>
              {/^\d+$/.test(detail.tweetId) && (
                <a
                  href={`https://x.com/i/status/${detail.tweetId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="row"
                  style={{ gap: 4 }}
                >
                  {m.history.viewOriginalTweet} <ArrowUpRight size={14} />
                </a>
              )}
              <a
                href={accountProfileUrl(
                  detail.authorUid,
                  detail.authorScreenName
                )}
                target="_blank"
                rel="noreferrer"
                className="row"
                style={{ gap: 4 }}
              >
                {m.history.viewAuthorProfile} <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        </Modal>
      )}

      {clear && (
        <Confirm
          title={m.history.clearConfirmTitle}
          actionLabel={m.history.clearConfirmBtn}
          danger
          onClose={() => setClear(false)}
          onConfirm={() => mutate({ type: 'logs.clear' })}
        >
          <p>{m.history.clearConfirmBody(logs.length)}</p>
        </Confirm>
      )}

      {reportOpen && (
        <ReportCardModal
          stats={rolledStats}
          onClose={() => setReportOpen(false)}
        />
      )}
    </Page>
  );
}
