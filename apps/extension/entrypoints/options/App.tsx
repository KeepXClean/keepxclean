import { useEffect, useState } from 'react';
import { History, ListFilter, Settings2, Type, Users } from 'lucide-react';
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
const routes = [
  { id: 'rules', title: '过滤规则', icon: ListFilter, component: RulesPage },
  { id: 'keywords', title: '关键词', icon: Type, component: KeywordsPage },
  { id: 'accounts', title: '黑白名单', icon: Users, component: AccountsPage },
  { id: 'history', title: '拦截记录', icon: History, component: HistoryPage },
  {
    id: 'preferences',
    title: '偏好设置',
    icon: Settings2,
    component: PreferencesPage,
  },
];
function currentRoute() {
  return location.hash.split('?')[0].replace('#/', '') || 'rules';
}
export function App() {
  const state = useApp();
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => {
    const listener = () => setRoute(currentRoute());
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  const active = routes.find((x) => x.id === route) || routes[0];
  return (
    <div className="kxc-root">
      <div className="app-shell">
        <aside className="sidebar">
          <Brand />
          <nav aria-label="设置导航">
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
            <p className="small">让阅读保持清爽。</p>
            <p className="small muted" style={{ marginTop: 5 }}>
              KeepXClean · 本地优先
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
              <div className="row">
                <SaveStatus />
                <span className="small muted">
                  {state.data.config.enabled ? '过滤开启' : '已暂停'}
                </span>
                <Switch
                  label="启用过滤"
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
              <div style={{ padding: '12px 40px 0' }}>
                <SaveError />
              </div>
              <active.component key={active.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
