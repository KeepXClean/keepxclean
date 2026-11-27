import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

export function parseHashQuery(
  hash: string = typeof location !== 'undefined' ? location.hash : ''
): URLSearchParams {
  const qIndex = hash.indexOf('?');
  return new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : '');
}

function subscribeHash(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('hashchange', onStoreChange);
  window.addEventListener('popstate', onStoreChange);
  return () => {
    window.removeEventListener('hashchange', onStoreChange);
    window.removeEventListener('popstate', onStoreChange);
  };
}

function getHashSnapshot(): string {
  return typeof location !== 'undefined' ? location.hash : '';
}

/**
 * Reactively reads `location.hash` on cold load and live `hashchange`/`popstate`
 * (including MV3 tab reuse via `chrome.tabs.update`).
 */
export function useHash(): string {
  return useSyncExternalStore(subscribeHash, getHashSnapshot, () => '');
}

/**
 * Reactively reads query parameters from `location.hash` (e.g. `#/keywords?tab=custom&focus=id`).
 * Works on cold load AND live `hashchange`/`popstate` (including MV3 tab reuse via `tabs.update`).
 */
export function useHashQuery(): URLSearchParams {
  const hash = useHash();
  return useMemo(() => parseHashQuery(hash), [hash]);
}

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/**
 * Tracks a transient highlighted focus target (`focusId`), scrolls the matching
 * `[data-focus-id]` element into view once mounted (`ready === true`), and clears
 * the highlight after `durationMs` (default 3000ms). Fires once per `(triggerKey, focusId)`
 * navigation so subsequent user pagination/filtering does not re-trigger scroll, while
 * a new hash navigation re-triggers cleanly even if `focusId` is unchanged.
 * Does NOT strip URL query params on mount.
 */
export function useFocusHighlight(
  focusId: string | null,
  options?: { ready?: boolean; durationMs?: number; triggerKey?: string }
): string | null {
  const hash = useHash();
  const ready = options?.ready ?? true;
  const durationMs = options?.durationMs ?? 3000;
  const navKey = options?.triggerKey ?? hash;
  const [activeId, setActiveId] = useState<string | null>(
    ready ? focusId : null
  );
  const handledTokenRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unmount cleanup also resets handledTokenRef so React StrictMode double-invoke reschedules cleanly.
  useEffect(() => {
    return () => {
      handledTokenRef.current = null;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!focusId) {
      handledTokenRef.current = null;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setActiveId(null);
      return;
    }
    if (!ready) return;

    const token = `${navKey}\0${focusId}`;
    if (handledTokenRef.current === token) return;
    handledTokenRef.current = token;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    setActiveId(focusId);

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (typeof document === 'undefined') return;
      const el = Array.from(
        document.querySelectorAll<HTMLElement>('[data-focus-id]')
      ).find((node) => node.dataset.focusId === focusId);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'center',
        });
      }
    });

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setActiveId((prev) => (prev === focusId ? null : prev));
    }, durationMs);
  }, [focusId, ready, durationMs, navKey]);

  return activeId;
}
