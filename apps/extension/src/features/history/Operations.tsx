import { useEffect, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { getBlockReasonLabels, type BlockReasonTag } from '@keepxclean/shared';
import { useI18n } from '../../i18n';
import type { Operation } from '../../services/model';
import { useApp } from '../../state/store';
import { Button, perform, Pill } from '../../ui/components';

function isToastActive(op: Operation, now: number): boolean {
  if (op.cancelled) {
    return now - op.createdAt < 2200;
  }
  if (op.local === 'succeeded' && op.undoUntil > now) {
    return true;
  }
  const working =
    ['pending', 'running'].includes(op.nativeX) ||
    ['pending', 'running'].includes(op.community);
  if (working) {
    return now - op.createdAt < 28000;
  }
  const hasIssue =
    ['failed', 'unknown'].includes(op.nativeX) ||
    ['failed', 'unknown'].includes(op.community);
  if (hasIssue) {
    return now - op.createdAt < 30000;
  }
  const settleBase = Math.max(op.createdAt, op.undoUntil);
  return now - settleBase < 2400;
}

export function OperationCard({
  operation: op,
  now: externalNow,
  dismiss,
}: {
  operation: Operation;
  now?: number;
  dismiss?: () => void;
}) {
  const { m, locale } = useI18n();
  const [internalNow, setInternalNow] = useState(Date.now());
  const now = externalNow ?? internalNow;
  const needsOwnTimer =
    externalNow === undefined && !op.cancelled && op.undoUntil > internalNow;

  useEffect(() => {
    if (!needsOwnTimer) return;
    const timer = setInterval(() => setInternalNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [needsOwnTimer]);

  const undoable =
    op.undoUntil > now && !op.cancelled && op.local === 'succeeded';
  const accountLabel = op.entry.screenName
    ? `@${op.entry.screenName}`
    : `UID ${op.entry.uid}`;
  const stages = m.operations.stages;
  const reasonLabels = getBlockReasonLabels(locale);

  return (
    <div className="operation">
      <div className="row between" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 6, minWidth: 0 }}>
          <Check size={15} style={{ color: 'var(--green)' }} />
          <strong className="small ellipsis">
            {op.cancelled
              ? m.operations.undoneTitle(accountLabel)
              : m.operations.cleanedTitle(accountLabel)}
          </strong>
        </div>
        <div className="row" style={{ gap: 4 }}>
          {undoable && (
            <Button
              variant="sm"
              onClick={() => perform({ type: 'block.undo', id: op.id })}
            >
              <RotateCcw size={12} />
              {m.operations.undoBtn(
                Math.max(1, Math.ceil((op.undoUntil - now) / 1000))
              )}
            </Button>
          )}
          {dismiss && (
            <Button
              variant="ghost icon sm"
              aria-label={m.common.dismiss}
              onClick={dismiss}
            >
              <X size={14} />
            </Button>
          )}
        </div>
      </div>
      <div className="row wrap" style={{ gap: 5, marginTop: 7 }}>
        <Pill kind="neutral">{m.operations.localPill(stages[op.local])}</Pill>
        {op.nativeX !== 'not_requested' && (
          <Pill
            kind={
              ['failed', 'unknown'].includes(op.nativeX) ? 'warning' : 'neutral'
            }
          >
            {m.operations.nativeXPill(stages[op.nativeX])}
          </Pill>
        )}
        {op.community !== 'not_requested' && (
          <Pill
            kind={
              ['failed', 'unknown'].includes(op.community)
                ? 'warning'
                : 'neutral'
            }
          >
            {m.operations.communityPill(stages[op.community])}
          </Pill>
        )}
      </div>
      {undoable && (
        <div className="reason-options" aria-label={m.operations.selectReasonAria}>
          {Object.entries(reasonLabels).map(([tag, label]) => (
            <button
              key={tag}
              type="button"
              aria-pressed={(op.entry.tag ?? 'other') === tag}
              onClick={() =>
                perform({
                  type: 'block.reason',
                  id: op.id,
                  tag: tag as BlockReasonTag,
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {(['nativeX', 'community'] as const).map(
        (stage) =>
          op.errors[stage] && (
            <div
              key={stage}
              className="row between wrap small"
              style={{ marginTop: 7, color: 'var(--warning)', gap: 6 }}
            >
              <span>{op.errors[stage]}</span>
              {op[stage] === 'failed' && (
                <Button
                  variant="sm"
                  onClick={() =>
                    perform({ type: 'block.retry', id: op.id, stage })
                  }
                >
                  {stage === 'nativeX'
                    ? m.operations.retryNativeX
                    : m.operations.retryCommunity}
                </Button>
              )}
            </div>
          )
      )}
    </div>
  );
}

export function OperationToasts() {
  const { data } = useApp();
  const { m } = useI18n();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());

  const candidates =
    data?.operations.filter(
      (op) => !dismissed.includes(op.id) && isToastActive(op, now)
    ) ?? [];

  useEffect(() => {
    if (!candidates.length) return;
    const timer = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(timer);
  }, [candidates.length]);

  useEffect(() => {
    setNow(Date.now());
  }, [data?.operations]);

  if (!candidates.length) return null;

  return (
    <div
      className="toast-region"
      role="region"
      aria-label={m.operations.toastRegionAria}
      aria-live="polite"
    >
      {candidates.slice(0, 3).map((op) => (
        <OperationCard
          key={op.id}
          operation={op}
          now={now}
          dismiss={() => setDismissed((prev) => [...prev, op.id])}
        />
      ))}
    </div>
  );
}
