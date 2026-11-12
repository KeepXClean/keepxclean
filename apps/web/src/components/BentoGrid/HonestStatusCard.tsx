import { useState, useEffect, useRef } from 'react';
import { RotateCcw, CheckCircle2, Loader2, Ban } from 'lucide-react';
import { useI18n } from '../../locales';
import { type HonestFeedbackPhase, type HonestStageStatus } from './types';

const TOTAL_DURATION_MS = 4500;
const PHASE1_END = 1500;
const PHASE2_END = 3500;

export function HonestStatusCard() {
  const { t } = useI18n();
  const c2 = t.bento.card2;

  const [elapsedMs, setElapsedMs] = useState(0);
  const [phase, setPhase] = useState<HonestFeedbackPhase>('phase1');
  const [isRunning, setIsRunning] = useState(true);
  const [isUndone, setIsUndone] = useState(false);
  const [runId, setRunId] = useState(0);

  const startTimeRef = useRef<number>(Date.now());
  const rafRef = useRef<number | null>(null);

  // Run the 4.5s simulation loop
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    if (prefersReducedMotion) {
      setElapsedMs(TOTAL_DURATION_MS);
      setPhase('settled');
      setIsRunning(false);
      return;
    }

    if (!isRunning || isUndone) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    startTimeRef.current = Date.now() - elapsedMs;

    const tick = () => {
      const now = Date.now();
      const currentElapsed = Math.min(now - startTimeRef.current, TOTAL_DURATION_MS);
      setElapsedMs(currentElapsed);

      if (currentElapsed < PHASE1_END) {
        setPhase('phase1');
      } else if (currentElapsed < PHASE2_END) {
        setPhase('phase2');
      } else if (currentElapsed < TOTAL_DURATION_MS) {
        setPhase('phase3');
      } else {
        setPhase('settled');
        setIsRunning(false);
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isRunning, isUndone, runId]);

  const handleUndo = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setIsRunning(false);
    setIsUndone(true);
    setPhase('cancelled');
  };

  const handleReplay = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setIsUndone(false);
    setElapsedMs(0);
    setPhase('phase1');
    setIsRunning(true);
    setRunId((r) => r + 1);
  };

  const progressPercent = Math.min(100, Math.round((elapsedMs / TOTAL_DURATION_MS) * 100));
  const remainingSeconds = Math.max(0, ((TOTAL_DURATION_MS - elapsedMs) / 1000)).toFixed(1);

  // Compute stage statuses
  const stageStatus: HonestStageStatus = {
    local: isUndone ? 'cancelled' : 'succeeded', // Local storage is instantaneous
    nativeX: isUndone
      ? 'cancelled'
      : elapsedMs >= PHASE2_END
      ? 'succeeded'
      : elapsedMs >= PHASE1_END
      ? 'running'
      : 'pending',
    community: isUndone
      ? 'cancelled'
      : elapsedMs >= TOTAL_DURATION_MS
      ? 'succeeded'
      : elapsedMs >= PHASE2_END
      ? 'running'
      : 'pending',
  };

  const canUndo = (phase === 'phase1' || phase === 'phase2') && !isUndone;

  return (
    <article
      className="bento-card bento-honest-card"
      data-testid="bento-card-honest"
    >
      <div className="bento-card-header">
        <span className="bento-card-tag">{c2.tag}</span>
        <h3 className="bento-card-title">{c2.title}</h3>
        <p className="bento-card-desc">{c2.desc}</p>
      </div>

      <div className="honest-progress-wrapper">
        <div
          className="honest-progress-bar-bg"
          role="progressbar"
          aria-label={c2.title}
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="honest-progress-bar-fill"
            style={{
              width: isUndone ? '0%' : `${progressPercent}%`,
              backgroundColor: isUndone ? 'var(--warning)' : undefined,
            }}
          />
        </div>

        <div className="honest-progress-meta">
          <span>
            {isUndone
              ? c2.rollbackCompleted
              : phase === 'settled'
              ? c2.settledCompleted
              : `${c2.undoPrompt} (${remainingSeconds}s)`}
          </span>
          <span className="honest-timer-badge">{isUndone ? '0.0s' : `${remainingSeconds}s`}</span>
        </div>
      </div>

      <div className="honest-phases-list" role="list">
        {/* Step 1: Local Saved */}
        <div
          role="listitem"
          className={`honest-phase-card ${
            stageStatus.local === 'succeeded'
              ? 'completed'
              : stageStatus.local === 'cancelled'
              ? 'cancelled'
              : ''
          }`}
          data-testid="honest-step-1"
        >
          <div className="honest-phase-icon">
            {stageStatus.local === 'succeeded' && (
              <CheckCircle2 size={18} className="honest-phase-icon succeeded" />
            )}
            {stageStatus.local === 'cancelled' && (
              <Ban size={18} className="honest-phase-icon cancelled" />
            )}
          </div>
          <div className="honest-phase-content">
            <div className="honest-phase-title">
              {c2.step1} <small className="text-muted">(&lt;1ms)</small>
            </div>
            <div className="honest-phase-desc">{c2.step1Desc}</div>
          </div>
        </div>

        {/* Step 2: X Native Block */}
        <div
          role="listitem"
          className={`honest-phase-card ${
            stageStatus.nativeX === 'succeeded'
              ? 'completed'
              : stageStatus.nativeX === 'running'
              ? 'active'
              : stageStatus.nativeX === 'cancelled'
              ? 'cancelled'
              : ''
          }`}
          data-testid="honest-step-2"
        >
          <div className="honest-phase-icon">
            {stageStatus.nativeX === 'succeeded' && (
              <CheckCircle2 size={18} className="honest-phase-icon succeeded" />
            )}
            {stageStatus.nativeX === 'running' && (
              <Loader2 size={18} className="honest-phase-icon running" />
            )}
            {stageStatus.nativeX === 'pending' && (
              <div className="honest-phase-icon pending">⚪</div>
            )}
            {stageStatus.nativeX === 'cancelled' && (
              <Ban size={18} className="honest-phase-icon cancelled" />
            )}
          </div>
          <div className="honest-phase-content">
            <div className="honest-phase-title">
              {c2.step2} <small className="text-muted">(1.5s - 3.5s)</small>
            </div>
            <div className="honest-phase-desc">{c2.step2Desc}</div>
          </div>
        </div>

        {/* Step 3: Community Hash Deduplication */}
        <div
          role="listitem"
          className={`honest-phase-card ${
            stageStatus.community === 'succeeded'
              ? 'completed'
              : stageStatus.community === 'running'
              ? 'active'
              : stageStatus.community === 'cancelled'
              ? 'cancelled'
              : ''
          }`}
          data-testid="honest-step-3"
        >
          <div className="honest-phase-icon">
            {stageStatus.community === 'succeeded' && (
              <CheckCircle2 size={18} className="honest-phase-icon succeeded" />
            )}
            {stageStatus.community === 'running' && (
              <Loader2 size={18} className="honest-phase-icon running" />
            )}
            {stageStatus.community === 'pending' && (
              <div className="honest-phase-icon pending">⚪</div>
            )}
            {stageStatus.community === 'cancelled' && (
              <Ban size={18} className="honest-phase-icon cancelled" />
            )}
          </div>
          <div className="honest-phase-content">
            <div className="honest-phase-title">
              {c2.step3} <small className="text-muted">(3.5s - 4.5s)</small>
            </div>
            <div className="honest-phase-desc">{c2.step3Desc}</div>
          </div>
        </div>
      </div>

      <div className="honest-controls-bar">
        <button
          type="button"
          className="btn-undo"
          onClick={handleUndo}
          disabled={!canUndo}
          data-testid="honest-undo-btn"
        >
          <RotateCcw size={14} />
          <span>{c2.undoActive} ({remainingSeconds}s)</span>
        </button>

        <button
          type="button"
          className="btn-replay"
          onClick={handleReplay}
          data-testid="honest-replay-btn"
        >
          <RotateCcw size={14} />
          <span>{c2.replayDemo}</span>
        </button>
      </div>
    </article>
  );
}
