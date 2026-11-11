import { useState } from 'react';
import { Download, Plus, Trash2, UserRoundCheck } from 'lucide-react';
import { BLOCK_REASON_LABELS, type AccountListEntry } from '@keepxclean/shared';
import { mutate, useApp } from '../../state/store';
import { validateAccount } from '../../services/validation';
import {
  Banner,
  Button,
  Confirm,
  Empty,
  Field,
  Modal,
  Page,
  Panel,
  Pill,
  SearchBox,
  Tabs,
  formatTime,
  usePagination,
} from '../../ui/components';
import { ImportWizard } from './ImportWizard';

function AccountEditor({
  list,
  onClose,
}: {
  list: 'black' | 'white';
  onClose: () => void;
}) {
  const [uid, setUid] = useState(''),
    [handle, setHandle] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  return (
    <Modal
      title={`添加到${list === 'white' ? '白' : '黑'}名单`}
      onClose={() => {
        if (!pending) onClose();
      }}
      footer={
        <>
          <Button disabled={pending} onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={pending}
            onClick={async () => {
              setError('');
              setPending(true);
              try {
                const entry = validateAccount({
                  uid: uid.trim(),
                  screenName: handle.replace(/^@/, '').trim(),
                  name: name.trim(),
                  addedAt: Date.now(),
                });
                await mutate({ type: 'account.save', list, entry });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            添加账号
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field
          label="账号 UID"
          help="1–25 位数字。可从命中记录或页面内账号操作添加，不支持仅凭 Handle 查询 UID。"
        >
          <input
            autoFocus
            className="input mono"
            inputMode="numeric"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            placeholder="例如 1234567890"
          />
        </Field>
        <Field label="Handle（可选）">
          <input
            className="input"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@username"
          />
        </Field>
        <Field label="显示名称（可选）">
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="用于辨认账号"
          />
        </Field>
        <Banner>
          {list === 'white'
            ? '加入白名单会移除同 UID 的本地黑名单记录，不会取消 X 原生拉黑。'
            : '加入本地黑名单会移除同 UID 的白名单记录，不会自动提交社区或调用 X 拉黑。'}
        </Banner>
        {error && <Banner kind="error">{error}</Banner>}
      </div>
    </Modal>
  );
}
export function AccountsPage() {
  const { data } = useApp();
  const { config, snapshot, imports } = data!;
  const [tab, setTab] = useState<'black' | 'white' | 'community'>('black'),
    [query, setQuery] = useState(''),
    [editor, setEditor] = useState(false),
    [wizard, setWizard] = useState<string | null>(null),
    [removing, setRemoving] = useState<AccountListEntry | null>(null),
    [whitelisting, setWhitelisting] = useState<AccountListEntry | null>(null);
  const local =
    tab === 'white' ? config.whitelistUids : config.localBlocklistUids;
  const rows: (AccountListEntry & { count?: number; protected?: boolean })[] =
    tab === 'community'
      ? Object.entries(snapshot.counts).map(([uid, entry]) => ({
          uid,
          screenName: '',
          addedAt: 0,
          count: entry.c,
          tag: entry.t,
          protected: entry.p,
        }))
      : Object.values(local).sort((a, b) => b.addedAt - a.addedAt);
  const filtered = rows.filter((x) =>
    `${x.uid} ${x.screenName} ${x.name ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const page = usePagination(filtered, tab + query);
  return (
    <Page
      title="黑白名单"
      description="你主动做出的选择，始终清晰可控。"
      action={
        <div className="row">
          <Button onClick={() => setWizard('new')}>
            <Download size={15} />从 X 导入
          </Button>
          {tab !== 'community' && (
            <Button variant="primary" onClick={() => setEditor(true)}>
              <Plus size={15} />
              添加账号
            </Button>
          )}
        </div>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          {
            value: 'black',
            label: `本地黑名单 · ${Object.keys(config.localBlocklistUids).length}`,
          },
          {
            value: 'white',
            label: `白名单 · ${Object.keys(config.whitelistUids).length}`,
          },
          { value: 'community', label: '社区记录' },
        ]}
      />
      <Banner>
        {tab === 'white'
          ? '白名单豁免一般规则，推广广告仍按广告规则处理。加白不会解除 X 原生拉黑。'
          : tab === 'community'
            ? '只读社区快照，仅展示已有的 UID、计数与标签。这里的记录不代表已核实风险。'
            : '本地移除只改变本地过滤，不会自动取消 X 原生拉黑或撤回社区记录。'}
      </Banner>
      <div className="row between wrap">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="搜索 UID、Handle 或名称"
        />
        <span className="small muted">
          {filtered.length.toLocaleString()} 个账号
          {tab === 'community'
            ? ` · 数据生成 ${formatTime(snapshot.updatedAt)}`
            : ''}
        </span>
      </div>
      <Panel className="table-panel">
        {filtered.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>账号</th>
                    <th>{tab === 'community' ? '社区记录' : '添加时间'}</th>
                    <th>备注 / 标签</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((entry) => (
                    <tr key={entry.uid}>
                      <td>
                        <div className="row">
                          <span className="avatar">
                            {entry.name?.slice(0, 1) ||
                              entry.screenName?.slice(0, 1).toUpperCase() ||
                              '#'}
                          </span>
                          <div className="cell-main">
                            <strong>
                              {entry.name ||
                                (entry.screenName
                                  ? `@${entry.screenName}`
                                  : 'UID 账号')}
                            </strong>
                            <p className="small muted mono">{entry.uid}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {tab === 'community' ? (
                          <>{entry.count} 次</>
                        ) : (
                          <span className="small muted">
                            {formatTime(entry.addedAt)}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="row wrap">
                          {entry.tag && (
                            <Pill kind="neutral">
                              {BLOCK_REASON_LABELS[entry.tag]}
                            </Pill>
                          )}
                          {entry.protected && <Pill>高粉保护</Pill>}
                          {!entry.tag && (
                            <span className="small muted">
                              {entry.reason || '手动添加'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {tab === 'community' ? (
                          <Pill kind="neutral">只读</Pill>
                        ) : (
                          <div className="table-actions">
                            {tab === 'black' && (
                              <Button
                                variant="ghost icon"
                                aria-label={`加白 ${entry.uid}`}
                                onClick={() => setWhitelisting(entry)}
                              >
                                <UserRoundCheck size={16} />
                              </Button>
                            )}
                            <Button
                              variant="ghost icon"
                              aria-label={`移除 ${entry.uid}`}
                              onClick={() => setRemoving(entry)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        )}
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
              query
                ? '没有匹配的账号'
                : tab === 'white'
                  ? '白名单还是空的'
                  : tab === 'community'
                    ? '暂无社区快照记录'
                    : '本地黑名单还是空的'
            }
            description={
              query
                ? '试试其他搜索内容。'
                : tab === 'white'
                  ? '将想保留的账号加入白名单。'
                  : tab === 'community'
                    ? '可在偏好设置同步最新数据；当前本地过滤仍可使用。'
                    : '在 X 中净空账号，或从现有黑名单导入。'
            }
          />
        )}
      </Panel>
      {imports.length > 0 && (
        <Panel title="最近导入">
          <div className="stack-sm">
            {imports.slice(0, 5).map((job) => (
              <div className="row between" key={job.id}>
                <div>
                  <strong className="small">{formatTime(job.createdAt)}</strong>
                  <p className="small muted">
                    本地新增 {job.localAdded} 个 ·{' '}
                    {
                      {
                        reading: '读取中',
                        preview: '等待确认',
                        saving: '保存中',
                        sharing: '社区提交中',
                        done: '处理完成',
                        error: '处理中断',
                        cancelled: '已停止',
                      }[job.status]
                    }
                  </p>
                </div>
                <Button onClick={() => setWizard(job.id)}>查看结果</Button>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {editor && tab !== 'community' && (
        <AccountEditor list={tab} onClose={() => setEditor(false)} />
      )}
      {wizard && (
        <ImportWizard
          initialJobId={wizard === 'new' ? undefined : wizard}
          onClose={() => setWizard(null)}
        />
      )}
      {removing && (
        <Confirm
          title="移除这条本地记录？"
          danger
          actionLabel="移除"
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            mutate({
              type: 'account.delete',
              list: tab === 'white' ? 'white' : 'black',
              uid: removing.uid,
            })
          }
        >
          <p>
            UID {removing.uid}。仅改变本地列表，不影响 X 原生拉黑或社区记录。
          </p>
        </Confirm>
      )}
      {whitelisting && (
        <Confirm
          title="移入白名单？"
          actionLabel="加入白名单"
          onClose={() => setWhitelisting(null)}
          onConfirm={() =>
            mutate({
              type: 'account.save',
              list: 'white',
              entry: { ...whitelisting, addedAt: Date.now() },
            })
          }
        >
          <p>移除该账号的本地黑名单记录。不会取消 X 原生拉黑。</p>
        </Confirm>
      )}
    </Page>
  );
}
