import { useEffect, useState, useRef } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { formatHandle, type UndoOperation } from './types';

export interface UndoToastProps {
  operation: UndoOperation | null;
  onUndo: (operationId: string) => void;
  onDismiss: () => void;
  locale?: string;
}

export function UndoToast({
  operation,
  onUndo,
  onDismiss,
  locale = 'zh-CN',
}: UndoToastProps) {
  const isZh = locale.startsWith('zh');
  const durationMs = operation?.durationMs || 4500;
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [exiting, setExiting] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!operation) return;

    setExiting(false);
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }

    const initialLeft = Math.max(0, operation.undoUntil - Date.now());
    setRemainingMs(initialLeft);

    const interval = setInterval(() => {
      const left = Math.max(0, operation.undoUntil - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        clearInterval(interval);
        setExiting(true);
        if (exitTimerRef.current) {
          clearTimeout(exitTimerRef.current);
        }
        exitTimerRef.current = setTimeout(onDismiss, 200);
      }
    }, 100);

    return () => {
      clearInterval(interval);
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [operation, onDismiss]);

  if (!operation) return null;

  const secondsDisplay = (Math.max(0, remainingMs) / 1000).toFixed(1) + 's';
  const progressPercent = Math.min(
    100,
    Math.max(0, (remainingMs / durationMs) * 100)
  );

  return (
    <div className="undo-toast-portal">
      <aside
        className={`undo-toast ${exiting ? 'exit' : ''}`}
        role="status"
        aria-live="assertive"
        aria-atomic="true"
      >
        <div className="undo-toast-main">
          <div className="undo-toast-info">
            <span className="undo-toast-icon">
              <Check size={18} />
            </span>
            <span className="undo-toast-label">
              {isZh
                ? `已拦截 ${formatHandle(operation.authorHandle)}`
                : `Intercepted ${formatHandle(operation.authorHandle)}`}
            </span>
          </div>

          <div className="undo-toast-actions">
            <button
              type="button"
              className="btn-toast-undo"
              onClick={() => {
                if (exitTimerRef.current) {
                  clearTimeout(exitTimerRef.current);
                  exitTimerRef.current = null;
                }
                onUndo(operation.id);
                setExiting(true);
                exitTimerRef.current = setTimeout(() => {
                  onDismiss();
                  exitTimerRef.current = null;
                }, 150);
              }}
            >
              <RotateCcw size={13} />
              <span>{isZh ? '撤销' : 'Undo'}</span>
              <span className="tabular-nums">({secondsDisplay})</span>
            </button>

            <button
              type="button"
              className="btn-toast-dismiss"
              aria-label={isZh ? '关闭提示' : 'Dismiss notification'}
              onClick={() => {
                setExiting(true);
                if (exitTimerRef.current) {
                  clearTimeout(exitTimerRef.current);
                }
                exitTimerRef.current = setTimeout(() => {
                  onDismiss();
                  exitTimerRef.current = null;
                }, 150);
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Dynamic linear countdown progress bar */}
        <div className="undo-toast-progress-track">
          <div
            className="undo-toast-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </aside>
    </div>
  );
}
