import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { dismissParseHealth } from '../../services/client';
import type { ParseHealthState } from '../../services/model';
import { formatRedactedHealthDiagnostic } from '../../services/parse-health';
import { useApp } from '../../state/store';
import { Button } from '../../ui/components';

export function shouldShowParseHealthBanner(
  health?: ParseHealthState
): boolean {
  if (!health || health.status !== 'degraded') return false;
  return (
    !health.dismissedAt ||
    (health.firstFailureAt !== undefined &&
      health.dismissedAt < health.firstFailureAt)
  );
}

export function getExtensionVersion(): string {
  try {
    if (
      typeof chrome !== 'undefined' &&
      typeof chrome.runtime?.getManifest === 'function'
    ) {
      const version = chrome.runtime.getManifest()?.version;
      if (typeof version === 'string' && version.trim()) {
        return version.trim();
      }
    }
  } catch {
    // Context invalidated or non-extension harness
  }
  return 'unknown';
}

export async function copyTextWithFallback(
  text: string,
  anchor?: Node | null
): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }
  if (typeof document === 'undefined' || !document.body) return false;
  const anchorDialog =
    anchor instanceof Element
      ? anchor.closest('dialog[open]')
      : (anchor?.parentElement?.closest('dialog[open]') ?? null);
  const shadowDialogs =
    document.activeElement?.shadowRoot?.querySelectorAll('dialog[open]');
  const lightDialogs = document.querySelectorAll('dialog[open]');
  const mountRoot =
    anchorDialog ??
    (shadowDialogs && shadowDialogs.length > 0
      ? shadowDialogs[shadowDialogs.length - 1]
      : null) ??
    (lightDialogs.length > 0
      ? lightDialogs[lightDialogs.length - 1]
      : null) ??
    document.body;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.opacity = '0';
  mountRoot.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    return (
      typeof document.execCommand === 'function' &&
      document.execCommand('copy')
    );
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export function ParseHealthBanner() {
  const { data } = useApp();
  const { m } = useI18n();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle'
  );
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), 2200);
    return () => clearTimeout(timer);
  }, [copyState]);

  const health = data?.health;
  if (!shouldShowParseHealthBanner(health)) return null;

  async function handleCopy(anchor?: Node | null) {
    const summary = formatRedactedHealthDiagnostic(
      health!,
      getExtensionVersion()
    );
    const ok = await copyTextWithFallback(summary, anchor);
    setCopyState(ok ? 'copied' : 'error');
  }

  async function handleDismiss() {
    setDismissing(true);
    try {
      await dismissParseHealth();
    } catch {
      // Ignore transient IPC error; banner stays visible
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div
      className="banner warning health-banner"
      role="status"
      data-kxc-health-banner="true"
    >
      <AlertTriangle size={16} style={{ marginTop: 2 }} />
      <div className="grow stack-sm" style={{ gap: 7 }}>
        <div
          className="row between"
          style={{ gap: 6, alignItems: 'flex-start' }}
        >
          <strong className="small">{m.health.degradedTitle}</strong>
          <Button
            variant="ghost icon sm"
            aria-label={m.common.dismiss}
            disabled={dismissing}
            onClick={() => void handleDismiss()}
          >
            <X size={14} />
          </Button>
        </div>
        <p className="small" style={{ color: 'inherit' }}>
          {m.health.degradedDesc}
        </p>
        <div className="row wrap" style={{ gap: 6 }}>
          <Button variant="sm" onClick={(e) => void handleCopy(e.currentTarget)}>
            {copyState === 'copied' ? (
              <>
                <Check size={12} />
                {m.health.copiedBtn}
              </>
            ) : (
              <>
                <Copy size={12} />
                {m.health.copyDiagnosticBtn}
              </>
            )}
          </Button>
          <a
            className="btn sm"
            href="https://github.com/KeepXClean/keepxclean/issues/new"
            target="_blank"
            rel="noreferrer"
          >
            {m.health.reportIssueBtn}
            <ExternalLink size={12} />
          </a>
        </div>
        {copyState === 'error' && (
          <span className="small" role="alert">
            {m.health.copyFailedMsg}
          </span>
        )}
      </div>
    </div>
  );
}
