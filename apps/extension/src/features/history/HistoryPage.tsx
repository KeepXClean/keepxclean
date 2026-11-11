import { useState } from 'react';
import {
  ArrowUpRight,
  Ban,
  ChevronRight,
  Trash2,
  UserRoundCheck,
} from 'lucide-react';
import type { InterceptionLogEntry } from '@keepxclean/shared';
import { formatCount, formatDateTime, useI18n } from '../../i18n';
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
        m.history.blockedFromLogReason(ruleLabels[log.ruleId] ?? log.ruleId)
      );
      setSuccess(
        m.history.addedBlackNotice(log.authorScreenName || log.authorUid)
      );
    } catch {
      /* SaveError owns the failure message. */
    }
  };

  const todayAds = stats.todayAdsHidden ?? 0;
  const totalAds = stats.totalAdsHidden ?? stats.byRule?.promoted_ad ?? 0;

  return (
    <Page
      title={m.history.pageTitle}
      description={m.history.pageDesc}
      action={
        <Button
          variant="danger"
          disabled={!logs.length}
          onClick={() => setClear(true)}
        >
          <Trash2 size={15} />
          {m.history.clearBtn}
        </Button>
      }
    >
      <div className="stats">
        <div className="stat">
          <span className="small muted">
            {stats.partialDay === stats.todayDate
              ? m.history.statTodayPartial
              : m.history.statToday}
          </span>
          <strong>{formatCount(stats.todayBlocked, locale)}</strong>
          <span className="small muted">
            {m.history.statTodayAds(formatCount(todayAds, locale))}
          </span>
        </div>
        <div className="stat">
          <span className="small muted">{m.history.statTotal}</span>
          <strong>{formatCount(stats.totalBlocked, locale)}</strong>
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
                            {ruleLabels[log.ruleId] || log.ruleId}
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
                          {sceneLabels[log.scene]}
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
                · {sceneLabels[detail.scene]}
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
    </Page>
  );
}
