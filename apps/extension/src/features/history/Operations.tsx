import { useEffect, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { BLOCK_REASON_LABELS, type BlockReasonTag } from '@keepxclean/shared';
import type { Operation, Stage } from '../../services/model';
import { useApp } from '../../state/store';
import { Button, perform, Pill } from '../../ui/components';
const labels: Record<Stage, string> = {
  not_requested: '未开启',
  pending: '等待提交',
  running: '处理中',
  succeeded: '已完成',
  not_counted: '未计公共票',
  failed: '失败',
  unknown: '结果未确认',
  cancelled: '已取消',
};
export function OperationCard({
  operation: op,
  dismiss,
}: {
  operation: Operation;
  dismiss?: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const undoable =
    op.undoUntil > now && !op.cancelled && op.local === 'succeeded';
  return (
    <div className="operation">
      <div className="row between">
        <div className="row">
          <Check size={16} />
          <strong className="small">
            {op.cancelled ? '已撤销本次本地操作' : '已加入本地黑名单'}
          </strong>
        </div>
        {dismiss && (
          <Button variant="ghost icon" aria-label="关闭提示" onClick={dismiss}>
            <X size={15} />
          </Button>
        )}
      </div>
      <p className="small muted break">
        {op.entry.screenName
          ? `@${op.entry.screenName}`
          : `UID ${op.entry.uid}`}
      </p>
      <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
        <Pill kind="neutral">本地 · {labels[op.local]}</Pill>
        <Pill
          kind={
            ['failed', 'unknown'].includes(op.nativeX) ? 'warning' : 'neutral'
          }
        >
          X · {labels[op.nativeX]}
        </Pill>
        <Pill
          kind={
            ['failed', 'unknown'].includes(op.community) ? 'warning' : 'neutral'
          }
        >
          社区 · {labels[op.community]}
        </Pill>
      </div>
      {undoable && (
        <>
          <div className="reason-options" aria-label="选择净空原因">
            {Object.entries(BLOCK_REASON_LABELS).map(([tag, label]) => (
              <button
                key={tag}
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
          <Button
            variant="ghost"
            onClick={() => perform({ type: 'block.undo', id: op.id })}
          >
            <RotateCcw size={13} />
            撤销 · {Math.ceil((op.undoUntil - now) / 1000)} 秒
          </Button>
        </>
      )}
      {(['nativeX', 'community'] as const).map(
        (stage) =>
          op.errors[stage] && (
            <div
              key={stage}
              className="small"
              style={{ marginTop: 8, color: 'var(--warning)' }}
            >
              {op.errors[stage]}
              {op[stage] === 'failed' && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    perform({ type: 'block.retry', id: op.id, stage })
                  }
                >
                  重试{stage === 'nativeX' ? ' X 同步' : '社区提交'}
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
  const [dismissed, setDismissed] = useState<string[]>([]);
  return (
    <div
      className="toast-region"
      role="region"
      aria-label="净空操作结果"
      aria-live="polite"
    >
      {data?.operations
        .filter(
          (op) =>
            op.createdAt > Date.now() - 60000 && !dismissed.includes(op.id)
        )
        .slice(0, 3)
        .map((op) => (
          <OperationCard
            key={op.id}
            operation={op}
            dismiss={() => setDismissed([...dismissed, op.id])}
          />
        ))}
    </div>
  );
}
