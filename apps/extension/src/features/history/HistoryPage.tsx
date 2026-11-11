import { useState } from 'react';
import {
  ArrowUpRight,
  ChevronRight,
  Trash2,
  UserRoundCheck,
} from 'lucide-react';
import type { InterceptionLogEntry } from '@keepxclean/shared';
import { mutate, useApp } from '../../state/store';
import {
  Banner,
  Button,
  Confirm,
  Empty,
  formatTime,
  Modal,
  Page,
  Panel,
  perform,
  Pill,
  SearchBox,
  usePagination,
} from '../../ui/components';
import { OperationCard } from './Operations';
export const ruleLabels: Record<string, string> = {
  local_blocklist: '本地黑名单',
  crowd_block: '社区记录',
  high_frequency_daily: '历史高频',
  high_frequency_window: '短期刷屏',
  keyword: '自定义关键词',
  cloud_keyword: '公共词库',
  blue_reply_spam: '蓝标回复',
  tag_spam: '标签刷屏',
  account_quality: '账号质量',
  promoted_ad: '推广广告',
};
export const sceneLabels: Record<string, string> = {
  timeline: '信息流',
  reply: '回复区',
  search: '搜索',
  profile: '个人主页',
};
export function whitelistLog(log: InterceptionLogEntry) {
  return mutate({
    type: 'account.save',
    list: 'white',
    entry: {
      uid: log.authorUid,
      screenName: log.authorScreenName,
      name: log.authorName,
      addedAt: Date.now(),
    },
  });
}
export function HistoryPage() {
  const { data } = useApp();
  const { logs, stats, operations } = data!;
  const [query, setQuery] = useState(''),
    [rule, setRule] = useState('all'),
    [scene, setScene] = useState('all'),
    [detail, setDetail] = useState<InterceptionLogEntry | null>(null),
    [clear, setClear] = useState(false),
    [success, setSuccess] = useState('');
  const filtered = logs.filter(
    (x) =>
      (rule === 'all' || x.ruleId === rule) &&
      (scene === 'all' || x.scene === scene) &&
      `${x.authorName} ${x.authorScreenName} ${x.tweetSnippet} ${x.reasonText}`
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  const page = usePagination(filtered, query + rule + scene);
  const addWhite = async (log: InterceptionLogEntry) => {
    try {
      await whitelistLog(log);
      setSuccess(
        '已加入本地白名单。已从响应剔除的内容需要刷新 X 重新加载；X 原生拉黑不受影响。'
      );
    } catch {
      /* SaveError owns the failure message. */
    }
  };
  return (
    <Page
      title="拦截记录"
      description="了解过滤发生的原因，随时调整你的选择。"
      action={
        <Button
          variant="danger"
          disabled={!logs.length}
          onClick={() => setClear(true)}
        >
          <Trash2 size={15} />
          清空记录
        </Button>
      }
    >
      <div className="stats">
        <div className="stat">
          <span className="small muted">
            {stats.partialDay === stats.todayDate
              ? '今日（升级后）'
              : '今日拦截'}
          </span>
          <strong>{stats.todayBlocked.toLocaleString()}</strong>
          <span className="small muted">按设备本地日期统计</span>
        </div>
        <div className="stat">
          <span className="small muted">累计拦截</span>
          <strong>{stats.totalBlocked.toLocaleString()}</strong>
          <span className="small muted">保留历史累计</span>
        </div>
        <div className="stat">
          <span className="small muted">当前记录</span>
          <strong>{logs.length}</strong>
          <span className="small muted">最多保留最近 200 条</span>
        </div>
      </div>
      {success && <Banner>{success}</Banner>}
      <div className="row wrap">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="搜索账号、内容或命中原因"
        />
        <select
          style={{ width: 'auto' }}
          aria-label="按规则筛选"
          value={rule}
          onChange={(e) => setRule(e.target.value)}
        >
          <option value="all">全部规则</option>
          {Object.entries(ruleLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          style={{ width: 'auto' }}
          aria-label="按场景筛选"
          value={scene}
          onChange={(e) => setScene(e.target.value)}
        >
          <option value="all">全部场景</option>
          {Object.entries(sceneLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <Panel className="table-panel">
        {filtered.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>账号与内容</th>
                    <th>命中原因</th>
                    <th>时间 / 场景</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <div className="cell-main">
                          <strong>
                            {log.authorName ||
                              `@${log.authorScreenName}` ||
                              log.authorUid}
                          </strong>
                          <p
                            className="small muted ellipsis"
                            title={log.tweetSnippet}
                          >
                            {log.tweetSnippet || '未记录正文'}
                          </p>
                        </div>
                      </td>
                      <td>
                        <Pill kind="neutral">{ruleLabels[log.ruleId]}</Pill>
                        <p
                          className="small muted break"
                          style={{ maxWidth: 260, marginTop: 5 }}
                        >
                          {log.reasonText}
                        </p>
                      </td>
                      <td className="small muted">
                        {formatTime(log.timestamp)}
                        <br />
                        {sceneLabels[log.scene]}
                      </td>
                      <td>
                        <div className="table-actions">
                          {log.ruleId === 'promoted_ad' ? (
                            <a
                              href="#/rules?rule=hidePromotedAds"
                              className="small"
                            >
                              调整广告规则
                            </a>
                          ) : (
                            <Button
                              variant="ghost icon"
                              aria-label={`加白 ${log.authorScreenName || log.authorUid}`}
                              onClick={() => void addWhite(log)}
                            >
                              <UserRoundCheck size={16} />
                            </Button>
                          )}
                          <Button
                            variant="ghost icon"
                            aria-label={`查看记录 ${log.tweetId}`}
                            onClick={() => setDetail(log)}
                          >
                            <ChevronRight size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {page.control}
          </>
        ) : (
          <Empty
            title={
              logs.length ? '没有符合条件的记录' : '阅读很清爽，还没有拦截记录'
            }
            description={
              logs.length
                ? '尝试调整筛选条件或搜索内容。'
                : '过滤发生后，这里会展示主要命中原因。'
            }
          />
        )}
      </Panel>
      {operations.length > 0 && (
        <Panel
          title="净空操作结果"
          description="本地、X 与社区分别记录；这里保留最近操作的实际结果。"
        >
          {operations.slice(0, 10).map((op) => (
            <OperationCard key={op.id} operation={op} />
          ))}
        </Panel>
      )}
      {detail && (
        <Modal
          title="拦截详情"
          onClose={() => setDetail(null)}
          footer={
            <>
              <Button onClick={() => setDetail(null)}>关闭</Button>
              {detail.ruleId === 'promoted_ad' ? (
                <a
                  className="btn primary"
                  href="#/rules?rule=hidePromotedAds"
                  onClick={() => setDetail(null)}
                >
                  调整广告规则
                </a>
              ) : (
                <Button variant="primary" onClick={() => void addWhite(detail)}>
                  加入白名单
                </Button>
              )}
            </>
          }
        >
          <div className="stack">
            <div>
              <h3>{detail.authorName || detail.authorScreenName}</h3>
              <p className="small muted">
                UID {detail.authorUid} · {formatTime(detail.timestamp)} ·{' '}
                {sceneLabels[detail.scene]}
              </p>
            </div>
            <p className="break">{detail.tweetSnippet || '未保存正文摘要'}</p>
            <Banner>{detail.reasonText}</Banner>
            {detail.evidence && (
              <div className="stack-sm">
                {detail.evidence.map((item, i) => (
                  <div className="row between" key={i}>
                    <span className="muted small">{item.label}</span>
                    <span className="small break">{String(item.value)}</span>
                  </div>
                ))}
              </div>
            )}
            {!detail.evidence && (
              <p className="small muted">
                这条旧记录未保存结构化证据，以上是命中当时保存的原因。
              </p>
            )}
            {/^\d+$/.test(detail.tweetId) && (
              <a
                href={`https://x.com/i/status/${detail.tweetId}`}
                target="_blank"
                rel="noreferrer"
                className="row"
              >
                在 X 查看 <ArrowUpRight size={15} />
              </a>
            )}
          </div>
        </Modal>
      )}
      {clear && (
        <Confirm
          title="清空最近拦截记录？"
          actionLabel="清空记录"
          danger
          onClose={() => setClear(false)}
          onConfirm={() => mutate({ type: 'logs.clear' })}
        >
          <p>清空当前 {logs.length} 条记录，保留今日与累计统计、规则和名单。</p>
        </Confirm>
      )}
    </Page>
  );
}
