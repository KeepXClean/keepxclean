import { useState } from 'react';
import { ArrowUpRight, Plus, RefreshCw, UserRoundCheck } from 'lucide-react';
import { openOptions } from '../../services/client';
import { useApp, mutate } from '../../state/store';
import {
  Banner,
  Button,
  Empty,
  Panel,
  perform,
  Setting,
  Switch,
} from '../../ui/components';
import { Presets, Presentation, rulePatch } from '../rules/RulesPage';
import { SyncStatus } from '../preferences/PreferencesPage';
import { ruleLabels, whitelistLog } from '../history/HistoryPage';
import { NumberField } from '../../ui/components';
export function QuickControls({ drawer = false }: { drawer?: boolean }) {
  const { data } = useApp();
  const { config, stats, logs, sync } = data!;
  const [keyword, setKeyword] = useState(''),
    [message, setMessage] = useState(''),
    [adding, setAdding] = useState(false);
  async function addKeyword() {
    if (!keyword.trim()) return;
    setAdding(true);
    setMessage('');
    try {
      await mutate({
        type: 'keyword.save',
        item: {
          id: crypto.randomUUID(),
          pattern: keyword.trim(),
          isRegex: false,
          enabled: true,
          scopes: ['text', 'bio'],
          maxFollowersExempt: 20000,
        },
      });
      setKeyword('');
      setMessage('关键词已添加');
    } catch {
      /* shared save error */
    } finally {
      setAdding(false);
    }
  }
  return (
    <div className="compact stack">
      {!config.enabled && (
        <Banner kind="warning">过滤已暂停。下面的修改会在恢复后生效。</Banner>
      )}
      <div className="stats">
        <div className="stat">
          <span className="small muted">
            {stats.partialDay === stats.todayDate
              ? '今日（升级后）'
              : '今日拦截'}
          </span>
          <strong>{stats.todayBlocked.toLocaleString()}</strong>
        </div>
        <div className="stat">
          <span className="small muted">累计拦截</span>
          <strong>{stats.totalBlocked.toLocaleString()}</strong>
        </div>
      </div>
      <div className="stack-sm">
        <div className="row between">
          <h3>净空强度</h3>
          {config.preset === 'custom' && (
            <span className="small muted">自定义</span>
          )}
        </div>
        <Presets config={config} />
      </div>
      <div className="stack-sm">
        <h3>呈现方式</h3>
        <Presentation config={config} />
        <p className="small muted">
          已直接剔除的内容，切换后需刷新 X 重新加载。
        </p>
      </div>
      {drawer && (
        <Panel>
          <div className="stack">
            <NumberField
              label="历史日均上限"
              value={config.rules.highFrequency.maxDailyTweets}
              unit="条 / 天"
              step={0.1}
              sliderMax={150}
              onCommit={(value) =>
                rulePatch('highFrequency', 'maxDailyTweets', value)
              }
            />
            <NumberField
              label="社区记录门槛"
              value={config.rules.crowdBlock.minBlockCount}
              unit="次"
              min={1}
              sliderMax={20}
              onCommit={(value) =>
                rulePatch('crowdBlock', 'minBlockCount', value)
              }
            />
          </div>
          <Setting title="豁免已关注账号">
            <Switch
              label="豁免已关注账号"
              checked={config.exemptFollowing}
              onChange={(exemptFollowing) =>
                perform({ type: 'config.patch', patch: { exemptFollowing } })
              }
            />
          </Setting>
        </Panel>
      )}
      <div className="stack-sm">
        <div className="row between">
          <h3>快速添加关键词</h3>
          <button
            className="btn ghost"
            onClick={() => void openOptions('keywords')}
          >
            更多选项 <ArrowUpRight size={13} />
          </button>
        </div>
        <form
          className="row"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void addKeyword();
          }}
        >
          <input
            className="input"
            aria-label="快速关键词"
            placeholder="输入不想看到的词语"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button
            type="submit"
            variant="primary icon"
            aria-label="添加关键词"
            loading={adding}
            disabled={!keyword.trim()}
          >
            <Plus size={16} />
          </Button>
        </form>
        <p className="small muted">
          匹配正文与简介 · 普通文字 · 2 万粉及以上豁免
        </p>
        {message && (
          <p className="small" role="status" style={{ color: 'var(--green)' }}>
            {message}
          </p>
        )}
      </div>
      <div>
        <div className="row between">
          <h3>最近拦截</h3>
          <Button variant="ghost" onClick={() => void openOptions('history')}>
            全部记录 <ArrowUpRight size={13} />
          </Button>
        </div>
        {logs.length ? (
          logs.slice(0, 5).map((log) => (
            <div className="recent-row" key={log.id}>
              <span className="avatar">
                {log.authorName?.slice(0, 1) || '#'}
              </span>
              <div className="grow">
                <strong className="small">
                  {log.authorName || log.authorScreenName || log.authorUid}
                </strong>
                <p className="small muted ellipsis">
                  {ruleLabels[log.ruleId]} · {log.reasonText}
                </p>
              </div>
              {log.ruleId !== 'promoted_ad' ? (
                <Button
                  variant="ghost icon"
                  aria-label={`加白 ${log.authorScreenName || log.authorUid}`}
                  onClick={() =>
                    void whitelistLog(log)
                      .then(() =>
                        setMessage(
                          '已加入白名单；直接剔除的内容需刷新 X 恢复。'
                        )
                      )
                      .catch(() => undefined)
                  }
                >
                  <UserRoundCheck size={15} />
                </Button>
              ) : (
                <Button
                  variant="ghost icon"
                  aria-label="调整广告规则"
                  onClick={() => void openOptions('rules')}
                >
                  <ArrowUpRight size={15} />
                </Button>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="还没有拦截记录"
            description="新的过滤记录会显示在这里。"
          />
        )}
      </div>
      <div className="row between">
        <SyncStatus compact />
        <Button
          variant="ghost icon"
          aria-label="刷新社区快照"
          loading={sync.status === 'syncing'}
          onClick={() => perform({ type: 'snapshot.refresh' })}
        >
          <RefreshCw size={14} />
        </Button>
      </div>
    </div>
  );
}
