import { useEffect, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { useI18n } from '../../i18n';
import { localDate, type Stats } from '../../services/model';
import { Banner, Button, Modal } from '../../ui/components';
import { renderBattleReportPng } from './ReportCard';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function ReportCardModal({
  stats,
  onClose,
}: {
  stats: Stats;
  onClose: () => void;
}) {
  const { m, locale } = useI18n();
  const [dataUrl, setDataUrl] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'fallback'>(
    'idle'
  );
  const [downloadNotice, setDownloadNotice] = useState(false);

  useEffect(() => {
    let active = true;
    setError('');
    setBlob(null);
    setDataUrl('');
    void renderBattleReportPng(stats, m, locale)
      .then((res) => {
        if (!active) return;
        setDataUrl(res.dataUrl);
        setBlob(res.blob);
      })
      .catch((e) => {
        if (!active) return;
        setBlob(null);
        setDataUrl('');
        setError((e as Error).message || m.history.report.renderError);
      });
    return () => {
      active = false;
    };
  }, [stats, m, locale]);

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = setTimeout(() => setCopyState('idle'), 2400);
    return () => clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (!downloadNotice) return;
    const timer = setTimeout(() => setDownloadNotice(false), 2400);
    return () => clearTimeout(timer);
  }, [downloadNotice]);

  async function handleCopyImage() {
    if (!blob || error) return;
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === 'function' &&
      typeof ClipboardItem !== 'undefined'
    ) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopyState('copied');
        return;
      } catch {
        // Fall through to graceful download hint
      }
    }
    setCopyState('fallback');
  }

  function handleDownloadPng() {
    if (!blob || error) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStamp =
      typeof stats.todayDate === 'string' && ISO_DATE_RE.test(stats.todayDate)
        ? stats.todayDate
        : localDate();
    a.download = `keepxclean-report-${dateStamp}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloadNotice(true);
  }

  const actionsDisabled = !blob || Boolean(error);

  return (
    <Modal
      title={m.history.report.modalTitle}
      description={m.history.report.modalDesc}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{m.common.close}</Button>
          <Button
            disabled={actionsDisabled}
            onClick={() => void handleCopyImage()}
          >
            {copyState === 'copied' ? (
              <>
                <Check size={14} />
                {m.history.report.copiedImageBtn}
              </>
            ) : (
              <>
                <Copy size={14} />
                {m.history.report.copyImageBtn}
              </>
            )}
          </Button>
          <Button
            variant="primary"
            disabled={actionsDisabled}
            onClick={handleDownloadPng}
          >
            <Download size={14} />
            {m.history.report.downloadPngBtn}
          </Button>
        </>
      }
    >
      <div className="stack">
        {error ? (
          <Banner kind="error">{error}</Banner>
        ) : dataUrl ? (
          <div className="report-preview-frame" data-kxc-report-preview="true">
            <img
              className="report-preview-img"
              src={dataUrl}
              alt={m.history.report.modalTitle}
            />
          </div>
        ) : (
          <div className="skeleton" aria-label={m.history.report.generating} />
        )}

        <Banner>{m.history.report.privacyNote}</Banner>

        {copyState === 'fallback' && (
          <Banner kind="warning">{m.history.report.copyFallbackNotice}</Banner>
        )}
        {downloadNotice && (
          <Banner kind="success">{m.history.report.downloadedNotice}</Banner>
        )}
      </div>
    </Modal>
  );
}
