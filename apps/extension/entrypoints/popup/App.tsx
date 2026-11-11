import { ArrowUpRight, RefreshCw, Settings2 } from 'lucide-react';
import { useDocumentLocale, useI18n } from '../../src/i18n';
import { useApp } from '../../src/state/store';
import { openOptions } from '../../src/services/client';
import {
  Brand,
  Button,
  Loading,
  LoadError,
  perform,
  SaveError,
  SaveStatus,
  Switch,
} from '../../src/ui/components';
import { QuickControls } from '../../src/features/quick-controls/QuickControls';
import { SyncStatus } from '../../src/features/preferences/PreferencesPage';

export function App() {
  const state = useApp();
  const { m, locale } = useI18n();
  useDocumentLocale(m.meta.popupTitle, locale);
  const enabled = state.data?.config.enabled ?? true;
  return (
    <div className="kxc-root">
      <div className="popup">
        <header className="popup-header row between">
          <div className="row" style={{ gap: 10 }}>
            <Brand size={26} />
            {state.data && (
              <span className="status-pill" data-enabled={String(enabled)}>
                <span className="status-dot" />
                {enabled ? m.nav.statusCleaning : m.nav.statusPaused}
              </span>
            )}
          </div>
          {state.data && (
            <div className="row" style={{ gap: 6 }}>
              <SaveStatus />
              <Switch
                label={m.nav.enableFilter}
                checked={enabled}
                onChange={(next) =>
                  perform({ type: 'config.patch', patch: { enabled: next } })
                }
              />
              <Button
                variant="ghost icon sm"
                aria-label={m.nav.openFullSettings}
                title={m.nav.openFullSettings}
                onClick={() => void openOptions()}
              >
                <Settings2 size={15} />
              </Button>
            </div>
          )}
        </header>
        <div className="popup-body stack">
          {state.error ? (
            <LoadError error={state.error} />
          ) : !state.data ? (
            <Loading />
          ) : (
            <>
              <SaveError />
              <QuickControls />
            </>
          )}
        </div>
        <footer className="popup-footer row between">
          {state.data ? (
            <div className="row" style={{ gap: 4, minWidth: 0 }}>
              <SyncStatus compact />
              <Button
                variant="ghost icon sm"
                aria-label={m.quick.refreshSnapshotAria}
                title={m.preferences.syncNowBtn}
                loading={state.data.sync.status === 'syncing'}
                onClick={() => perform({ type: 'snapshot.refresh' })}
              >
                <RefreshCw size={13} />
              </Button>
            </div>
          ) : (
            <span />
          )}
          <Button variant="ghost sm" onClick={() => void openOptions()}>
            {m.nav.fullSettings} <ArrowUpRight size={13} />
          </Button>
        </footer>
      </div>
    </div>
  );
}
