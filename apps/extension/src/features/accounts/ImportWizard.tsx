import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { formatCount, useI18n } from '../../i18n';
import { command } from '../../services/client';
import { mutate, useApp } from '../../state/store';
import { Banner, Button, Empty, Field, Modal, Pill } from '../../ui/components';

export function ImportWizard({
  onClose,
  initialJobId,
}: {
  onClose: () => void;
  initialJobId?: string;
}) {
  const { data } = useApp();
  const { m, locale } = useI18n();
  const [tabs, setTabs] = useState<{ id: number; title: string }[]>([]),
    [tabId, setTabId] = useState(''),
    [jobId, setJobId] = useState(initialJobId),
    [share, setShare] = useState(false),
    [move, setMove] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const job = data?.imports.find((x) => x.id === jobId);
  const config = data!.config;
  useEffect(() => {
    void command<{ id: number; title: string; current?: boolean }[]>({
      type: 'tabs.list',
    })
      .then((list) => {
        setTabs(list);
        const currentTab = list.find((t) => t.current);
        if (currentTab) setTabId(String(currentTab.id));
        else if (list.length === 1) setTabId(String(list[0].id));
      })
      .catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const duplicates =
    job?.ids.filter((uid) => config.localBlocklistUids[uid]).length ?? 0;
  const conflicts =
    job?.ids.filter((uid) => config.whitelistUids[uid]).length ?? 0;
  const fresh = (job?.ids.length ?? 0) - duplicates - (move ? 0 : conflicts);
  const working = job && ['reading', 'sharing', 'saving'].includes(job.status);
  return (
    <Modal
      title={m.importWizard.title}
      description={m.importWizard.desc}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>
            {working ? m.importWizard.closeContinueBg : m.common.close}
          </Button>
          {working && (
            <Button
              disabled={busy}
              onClick={() =>
                void action(() => mutate({ type: 'import.cancel', id: job.id }))
              }
            >
              {m.importWizard.stopRemaining}
            </Button>
          )}
          {!job && (
            <Button
              variant="primary"
              loading={busy}
              disabled={!tabId}
              onClick={() =>
                void action(async () =>
                  setJobId(
                    await mutate<string>({
                      type: 'import.read',
                      tabId: Number(tabId),
                    })
                  )
                )
              }
            >
              <Download size={15} />
              {m.importWizard.readBlocklistBtn}
            </Button>
          )}
          {job?.status === 'preview' && (
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                void action(() =>
                  mutate({
                    type: 'import.apply',
                    id: job.id,
                    share,
                    moveConflicts: move,
                  })
                )
              }
            >
              {m.importWizard.confirmImportBtn(formatCount(fresh, locale))}
            </Button>
          )}
          {job && ['error', 'cancelled'].includes(job.status) && (
            <Button
              variant="primary"
              onClick={() => {
                setJobId(undefined);
                setError('');
              }}
            >
              {m.importWizard.rereadBtn}
            </Button>
          )}
        </>
      }
    >
      <div className="stack">
        {error && <Banner kind="error">{error}</Banner>}
        {!job && (
          <>
            {tabs.length ? (
              <Field
                label={m.importWizard.selectTabLabel}
                help={m.importWizard.selectTabHelp}
              >
                <select
                  value={tabId}
                  onChange={(e) => setTabId(e.target.value)}
                >
                  <option value="">{m.importWizard.selectTabPlaceholder}</option>
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Empty
                title={m.importWizard.noTabTitle}
                description={m.importWizard.noTabDesc}
                action={
                  <a
                    className="btn"
                    href="https://x.com/home"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {m.importWizard.openXBtn} <ExternalLink size={14} />
                  </a>
                }
              />
            )}
            <Banner>{m.importWizard.readSafeBanner}</Banner>
          </>
        )}
        {job?.status === 'reading' && (
          <>
            <div className="row">
              <Loader2 size={18} className="spin" />
              <h3>{m.importWizard.readingHeading}</h3>
            </div>
            <p className="muted">
              {m.importWizard.readingProgress(
                job.pages,
                formatCount(job.ids.length, locale)
              )}
            </p>
            <Banner>{m.importWizard.keepTabOpenBanner}</Banner>
          </>
        )}
        {job?.status === 'preview' && (
          <>
            <div className="row wrap">
              <Pill>
                {m.importWizard.readCompletePill(
                  formatCount(job.ids.length, locale)
                )}
              </Pill>
              <Pill kind="neutral">
                {m.importWizard.invalidRecordsPill(job.invalid)}
              </Pill>
            </div>
            <div className="stats">
              <div className="stat">
                <span className="small muted">
                  {m.importWizard.statNewLocal}
                </span>
                <strong>{fresh}</strong>
              </div>
              <div className="stat">
                <span className="small muted">
                  {m.importWizard.statExisting}
                </span>
                <strong>{duplicates}</strong>
              </div>
              <div className="stat">
                <span className="small muted">
                  {m.importWizard.statConflicts}
                </span>
                <strong>{conflicts}</strong>
              </div>
            </div>
            {conflicts > 0 && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={move}
                  onChange={(e) => setMove(e.target.checked)}
                />
                {m.importWizard.moveConflictsCheckbox}
              </label>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={share}
                disabled={!config.enableCrowdReport}
                onChange={(e) => setShare(e.target.checked)}
              />
              {m.importWizard.shareCommunityCheckbox}
            </label>
            {!config.enableCrowdReport && (
              <p className="small muted">{m.importWizard.crowdDisabledHint}</p>
            )}
            <p className="small muted">{m.importWizard.dedupeHint}</p>
            {job.ids.length === 0 && (
              <Empty
                title={m.importWizard.emptyBlocklistTitle}
                description={m.importWizard.emptyBlocklistDesc}
              />
            )}
          </>
        )}
        {job &&
          ['sharing', 'done', 'error', 'cancelled'].includes(job.status) && (
            <>
              <div className="row">
                <h3>
                  {job.status === 'sharing'
                    ? m.importWizard.statusSharing
                    : job.status === 'done'
                      ? m.importWizard.statusDone
                      : job.status === 'cancelled'
                        ? m.importWizard.statusCancelled
                        : m.importWizard.statusIncomplete}
                </h3>
                {job.status === 'sharing' && (
                  <Loader2 className="spin" size={16} />
                )}
              </div>
              <div className="stack-sm">
                <p>
                  {m.importWizard.resultLocalSummary(
                    job.localAdded,
                    job.skipped
                  )}
                </p>
                <p>
                  {m.importWizard.resultCommunitySummary(
                    job.communityAdded,
                    job.communityNotCounted
                  )}
                </p>
                <p className="small muted">
                  {m.importWizard.resultBatchesSummary(
                    job.completedBatches,
                    job.failedBatches.length
                  )}
                </p>
              </div>
              {job.error && <Banner kind="error">{job.error}</Banner>}
              {job.status === 'done' && job.failedBatches.length > 0 && (
                <Button
                  loading={busy}
                  onClick={() =>
                    void action(() =>
                      mutate({ type: 'import.retry', id: job.id })
                    )
                  }
                >
                  {m.importWizard.retryFailedBtn}
                </Button>
              )}
              <Banner>{m.importWizard.resultRetainedBanner}</Banner>
            </>
          )}
      </div>
    </Modal>
  );
}
