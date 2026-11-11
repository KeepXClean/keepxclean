import { ArrowUpRight } from 'lucide-react';
import { useApp } from '../../src/state/store';
import { openOptions } from '../../src/services/client';
import {
  Brand,
  Button,
  Loading,
  LoadError,
  perform,
  SaveError,
  Switch,
} from '../../src/ui/components';
import { QuickControls } from '../../src/features/quick-controls/QuickControls';
export function App() {
  const state = useApp();
  return (
    <div className="kxc-root">
      <div className="popup">
        <header className="popup-header row between">
          <div>
            <Brand size={28} />
            <p className="small muted" style={{ marginTop: 5 }}>
              {state.data?.config.enabled
                ? '净空已开启 · 让阅读保持清爽'
                : '净空控制台'}
            </p>
          </div>
          {state.data && (
            <Switch
              label="启用过滤"
              checked={state.data.config.enabled}
              onChange={(enabled) =>
                perform({ type: 'config.patch', patch: { enabled } })
              }
            />
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
        <footer className="popup-footer">
          <Button variant="ghost full" onClick={() => void openOptions()}>
            打开完整设置 <ArrowUpRight size={15} />
          </Button>
        </footer>
      </div>
    </div>
  );
}
