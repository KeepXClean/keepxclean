import { useEffect, useState } from 'react';
import { History, ListFilter, Settings2, Type, Users } from 'lucide-react';
import { useDocumentLocale, useI18n } from '../../src/i18n';
import { useApp } from '../../src/state/store';
import {
  Brand,
  Loading,
  LoadError,
  perform,
  SaveError,
  SaveStatus,
  Switch,
} from '../../src/ui/components';
import { RulesPage } from '../../src/features/rules/RulesPage';
import { KeywordsPage } from '../../src/features/keywords/KeywordsPage';
import { AccountsPage } from '../../src/features/accounts/AccountsPage';
import { HistoryPage } from '../../src/features/history/HistoryPage';
import { PreferencesPage } from '../../src/features/preferences/PreferencesPage';

const routeDefs = [
  { id: 'rules', icon: ListFilter, component: RulesPage },
  { id: 'keywords', icon: Type, component: KeywordsPage },
  { id: 'accounts', icon: Users, component: AccountsPage },
  { id: 'history', icon: History, component: HistoryPage },
  { id: 'preferences', icon: Settings2, component: PreferencesPage },
] as const;

function currentRoute() {
  return location.hash.split('?')[0].replace('#/', '') || 'rules';
}

export function App() {
  const state = useApp();
  const { m, locale } = useI18n();
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => {
    const listener = () => setRoute(currentRoute());
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  const routes = routeDefs.map((r) => ({
    ...r,
    title: m.nav[r.id],
  }));
  const active = routes.find((x) => x.id === route) || routes[0];
  useDocumentLocale(m.meta.optionsTitle(active.title), locale);

  return (
    <div className="kxc-root">
      <div className="app-shell">
        <aside className="sidebar">
          <Brand />
          <nav aria-label={m.nav.ariaLabel}>
            {routes.map((r) => (
              <a
                className="nav-link"
                href={`#/${r.id}`}
                key={r.id}
                aria-current={active.id === r.id ? 'page' : undefined}
              >
                <r.icon size={18} />
                {r.title}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <p className="small">{m.nav.tagline}</p>
            <p className="small muted" style={{ marginTop: 5 }}>
              {m.nav.localFirst}
            </p>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              KeepXClean <span>/</span>
              {active.title}
            </div>
            {state.data && (
              <div className="row" style={{ gap: 10 }}>
                <SaveStatus />
                <span
                  className="status-pill"
                  data-enabled={String(state.data.config.enabled)}
                >
                  <span className="status-dot" />
                  {state.data.config.enabled
                    ? m.nav.statusActive
                    : m.nav.statusPaused}
                </span>
                <Switch
                  label={m.nav.enableFilter}
                  checked={state.data.config.enabled}
                  onChange={(enabled) =>
                    perform({ type: 'config.patch', patch: { enabled } })
                  }
                />
              </div>
            )}
          </header>
          {state.error ? (
            <LoadError error={state.error} />
          ) : !state.data ? (
            <Loading />
          ) : (
            <>
              {state.saveError && (
                <div className="sticky-error-wrap">
                  <SaveError />
                </div>
              )}
              <active.component key={active.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
