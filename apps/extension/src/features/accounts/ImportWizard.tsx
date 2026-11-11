import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { command } from '../../services/client';
import { mutate, useApp } from '../../state/store';
import { Banner, Button, Empty, Field, Modal, Pill } from '../../ui/components';

export function ImportWizard({
  onClose,
  initialJobId,
}: {
  onClose: () => void;
  initialJobId?: string;
}) {
  const { data } = useApp();
  const [tabs, setTabs] = useState<{ id: number; title: string }[]>([]),
    [tabId, setTabId] = useState(''),
    [jobId, setJobId] = useState(initialJobId),
    [share, setShare] = useState(false),
    [move, setMove] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const job = data?.imports.find((x) => x.id === jobId);
  const config = data!.config;
  useEffect(() => {
    void command<{ id: number; title: string; current?: boolean }[]>({
      type: 'tabs.list',
    })
      .then((list) => {
        setTabs(list);
        const currentTab = list.find((t) => t.current);
        if (currentTab) setTabId(String(currentTab.id));
        else if (list.length === 1) setTabId(String(list[0].id));
      })
      .catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const duplicates =
    job?.ids.filter((uid) => config.localBlocklistUids[uid]).length ?? 0;
  const conflicts =
    job?.ids.filter((uid) => config.whitelistUids[uid]).length ?? 0;
  const fresh = (job?.ids.length ?? 0) - duplicates - (move ? 0 : conflicts);
  const working = job && ['reading', 'sharing', 'saving'].includes(job.status);
  return (
    <Modal
      title="从 X 导入黑名单"
      description="先预览，再选择保存与共享范围。"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>
            {working ? '后台继续，关闭窗口' : '关闭'}
          </Button>
          {working && (
            <Button
              disabled={busy}
              onClick={() =>
                void action(() => mutate({ type: 'import.cancel', id: job.id }))
              }
            >
              停止后续处理
            </Button>
          )}
          {!job && (
            <Button
              variant="primary"
              loading={busy}
              disabled={!tabId}
              onClick={() =>
                void action(async () =>
                  setJobId(
                    await mutate<string>({
                      type: 'import.read',
                      tabId: Number(tabId),
                    })
                  )
                )
              }
            >
              <Download size={15} />
              读取黑名单
            </Button>
          )}
          {job?.status === 'preview' && (
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                void action(() =>
                  mutate({
                    type: 'import.apply',
                    id: job.id,
                    share,
                    moveConflicts: move,
                  })
                )
              }
            >
              确认导入 {fresh.toLocaleString()} 个账号
            </Button>
          )}
          {job && ['error', 'cancelled'].includes(job.status) && (
            <Button
              variant="primary"
              onClick={() => {
                setJobId(undefined);
                setError('');
              }}
            >
              重新读取
            </Button>
          )}
        </>
      }
    >
      <div className="stack">
        {error && <Banner kind="error">{error}</Banner>}
        {!job && (
          <>
            {tabs.length ? (
              <Field
                label="选择 X 标签页"
                help="读取过程绑定此标签页当前登录的账号。"
              >
                <select
                  value={tabId}
                  onChange={(e) => setTabId(e.target.value)}
                >
                  <option value="">请选择标签页</option>
                  {tabs.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Empty
                title="需要一个已登录的 X 标签页"
                description="打开 X 并登录，然后重新进入导入向导。"
                action={
                  <a
                    className="btn"
                    href="https://x.com/home"
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开 X <ExternalLink size={14} />
                  </a>
                }
              />
            )}
            <Banner>
              读取黑名单不会新增 X 拉黑。本地导入和社区提交将在预览后由你选择。
            </Banner>
          </>
        )}
        {job?.status === 'reading' && (
          <>
            <div className="row">
              <Loader2 size={18} className="spin" />
              <h3>正在读取 X 黑名单</h3>
            </div>
            <p className="muted">
              已读取 {job.pages} 页，共 {job.ids.length.toLocaleString()}{' '}
              个有效账号。
            </p>
            <Banner>请保持目标 X 标签页打开。读取失败不会被当成空名单。</Banner>
          </>
        )}
        {job?.status === 'preview' && (
          <>
            <div className="row wrap">
              <Pill>已完整读取 {job.ids.length.toLocaleString()} 个</Pill>
              <Pill kind="neutral">无效记录 {job.invalid}</Pill>
            </div>
            <div className="stats">
              <div className="stat">
                <span className="small muted">本地新增</span>
                <strong>{fresh}</strong>
              </div>
              <div className="stat">
                <span className="small muted">已经存在</span>
                <strong>{duplicates}</strong>
              </div>
              <div className="stat">
                <span className="small muted">白名单冲突</span>
                <strong>{conflicts}</strong>
              </div>
            </div>
            {conflicts > 0 && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={move}
                  onChange={(e) => setMove(e.target.checked)}
                />
                将冲突账号从白名单移入黑名单（默认保留白名单）
              </label>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={share}
                disabled={!config.enableCrowdReport}
                onChange={(e) => setShare(e.target.checked)}
              />
              同时提交社区
            </label>
            {!config.enableCrowdReport && (
              <p className="small muted">
                社区共享已关闭，可在偏好设置开启。本地导入不受影响。
              </p>
            )}
            <p className="small muted">
              已有本地记录将跳过；确认时会按最新配置再次去重。
            </p>
            {job.ids.length === 0 && (
              <Empty title="X 黑名单为空" description="没有需要导入的账号。" />
            )}
          </>
        )}
        {job &&
          ['sharing', 'done', 'error', 'cancelled'].includes(job.status) && (
            <>
              <div className="row">
                <h3>
                  {job.status === 'sharing'
                    ? '正在提交社区'
                    : job.status === 'done'
                      ? '导入处理完成'
                      : job.status === 'cancelled'
                        ? '已停止后续处理'
                        : '导入未完成'}
                </h3>
                {job.status === 'sharing' && (
                  <Loader2 className="spin" size={16} />
                )}
              </div>
              <div className="stack-sm">
                <p>
                  本地新增 <strong>{job.localAdded}</strong> 个 · 跳过{' '}
                  {job.skipped} 个
                </p>
                <p>
                  社区新计入 <strong>{job.communityAdded}</strong> 个 ·
                  未新增计票 {job.communityNotCounted} 个
                </p>
                <p className="small muted">
                  已完成 {job.completedBatches} 批 · 失败{' '}
                  {job.failedBatches.length} 批
                </p>
              </div>
              {job.error && <Banner kind="error">{job.error}</Banner>}
              {job.status === 'done' && job.failedBatches.length > 0 && (
                <Button
                  loading={busy}
                  onClick={() =>
                    void action(() =>
                      mutate({ type: 'import.retry', id: job.id })
                    )
                  }
                >
                  重试失败批次
                </Button>
              )}
              <Banner>
                已经保存的本地结果保留。社区计数以服务端响应为准，不会重复执行 X
                拉黑。
              </Banner>
            </>
          )}
      </div>
    </Modal>
  );
}
