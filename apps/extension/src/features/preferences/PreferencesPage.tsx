import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Upload } from 'lucide-react';
import type { FilterConfig } from '@keepxclean/shared';
import { authorizeService } from '../../services/client';
import { digest } from '../../services/model';
import { validateConfig } from '../../services/validation';
import { mutate, useApp } from '../../state/store';
import {
  Banner,
  Button,
  Confirm,
  downloadJson,
  Field,
  formatTime,
  Modal,
  Page,
  Panel,
  perform,
  Pill,
  Setting,
  Switch,
} from '../../ui/components';

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { data } = useApp();
  const { sync, snapshot } = data!;
  if (compact)
    return (
      <div className="sync-line" role="status">
        <span
          className="dot"
          style={{
            background:
              sync.status === 'error'
                ? 'var(--warning)'
                : sync.source === 'builtin'
                  ? 'var(--muted)'
                  : undefined,
          }}
        />
        <span>
          {sync.status === 'syncing'
            ? '正在同步社区快照'
            : sync.status === 'error'
              ? '同步失败 · 使用可用缓存'
              : sync.source === 'builtin'
                ? '使用内置词库'
                : `最近同步 ${formatTime(sync.lastSuccess)}`}
        </span>
      </div>
    );
  return (
    <div className="stack-sm">
      <div className="row between">
        <div>
          <h3>社区快照</h3>
          <p className="small muted">
            同步失败时保留最后可用数据，本地过滤继续工作。
          </p>
        </div>
        <Button
          loading={sync.status === 'syncing'}
          onClick={() => perform({ type: 'snapshot.refresh' })}
        >
          <RefreshCw size={14} />
          立即同步
        </Button>
      </div>
      <div className="row wrap">
        <Pill kind="neutral">
          {sync.source === 'builtin'
            ? '内置数据'
            : sync.source === 'cache'
              ? '本地缓存'
              : '网络快照'}
        </Pill>
        <span className="small muted">
          最近成功拉取：{formatTime(sync.lastSuccess)}
        </span>
      </div>
      {sync.source !== 'builtin' && (
        <p className="small muted">
          数据生成：{formatTime(snapshot.updatedAt)} ·{' '}
          {snapshot.totalAccounts.toLocaleString()} 个账号 ·{' '}
          {snapshot.totalReports.toLocaleString()} 条记录
        </p>
      )}
      {sync.status === 'error' && (
        <Banner kind="warning">
          {sync.error || '同步失败'}。当前继续使用
          {sync.source === 'builtin' ? '内置词库' : '已缓存快照'}。
        </Banner>
      )}
    </div>
  );
}
function ImportConfigDialog({
  config: candidate,
  onClose,
}: {
  config: FilterConfig;
  onClose: () => void;
}) {
  const { data } = useApp();
  const [base, setBase] = useState(data!.config),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const differences = (
    before: Record<string, unknown>,
    after: Record<string, unknown>
  ) => {
    const added = Object.keys(after).filter((key) => !(key in before)).length;
    const removed = Object.keys(before).filter((key) => !(key in after)).length;
    const changed = Object.keys(after).filter(
      (key) => key in before && digest(before[key]) !== digest(after[key])
    ).length;
    return `新增 ${added} · 修改 ${changed} · 移除 ${removed}`;
  };
  const rows = [
    {
      label: '自定义关键词',
      before: base.rules.keywords.items.length,
      after: candidate.rules.keywords.items.length,
      detail: differences(
        Object.fromEntries(
          base.rules.keywords.items.map((item) => [item.id, item])
        ),
        Object.fromEntries(
          candidate.rules.keywords.items.map((item) => [item.id, item])
        )
      ),
    },
    {
      label: '本地黑名单',
      before: Object.keys(base.localBlocklistUids).length,
      after: Object.keys(candidate.localBlocklistUids).length,
      detail: differences(
        base.localBlocklistUids,
        candidate.localBlocklistUids
      ),
    },
    {
      label: '白名单',
      before: Object.keys(base.whitelistUids).length,
      after: Object.keys(candidate.whitelistUids).length,
      detail: differences(base.whitelistUids, candidate.whitelistUids),
    },
  ];
  const preferenceLabels = {
    enabled: '启用净空',
    interceptionMode: '呈现方式',
    exemptFollowing: '豁免已关注账号',
    profileSceneBadgeOnly: '主页仅显示标签',
    syncNativeXBlock: '同步 X 原生拉黑',
    enableCrowdReport: '社区共享',
    enableCloudKeywords: '公共词库',
    customApiBaseUrl: '服务地址',
  } as const;
  const preferenceValue = (value: unknown) =>
    typeof value === 'boolean'
      ? value
        ? '开启'
        : '关闭'
      : value === 'strip'
        ? '直接隐藏'
        : value === 'collapse'
          ? '折叠提示'
          : String(value || 'KeepXClean 社区服务');
  const changedPreferences = (
    Object.keys(preferenceLabels) as (keyof typeof preferenceLabels)[]
  ).filter((key) => (base[key] || '') !== (candidate[key] || ''));
  const ruleChanges = Object.keys(base.rules).filter(
    (key) =>
      digest(base.rules[key as keyof typeof base.rules]) !==
      digest(candidate.rules[key as keyof typeof candidate.rules])
  ).length;
  return (
    <Modal
      title="预览配置导入"
      description="确认后替换本地配置，不补发历史外部操作。"
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
              setPending(true);
              setError('');
              try {
                await authorizeService(candidate.customApiBaseUrl || '');
                await mutate({
                  type: 'config.replace',
                  config: candidate,
                  expected: digest(base),
                });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            确认替换配置
          </Button>
        </>
      }
    >
      <div className="stack">
        <Banner kind="warning">
          导入将替换当前规则、关键词、黑白名单和偏好。日志与统计保留；不会逐个调用
          X 拉黑或提交社区。
        </Banner>
        <Button onClick={() => downloadJson(base)}>
          <Download size={15} />
          先导出当前配置
        </Button>
        <div>
          <p>
            变化的规则组：<strong>{ruleChanges}</strong>
          </p>
          {rows.map((row) => (
            <div className="setting" key={row.label}>
              <div>
                <h3>{row.label}</h3>
                <p>{row.detail}</p>
              </div>
              <span>
                {row.before} → <strong>{row.after}</strong>
              </span>
            </div>
          ))}
          {changedPreferences.map((key) => (
            <div className="setting" key={key}>
              <span>{preferenceLabels[key]}</span>
              <span className="small break">
                {preferenceValue(base[key])} →{' '}
                <strong>{preferenceValue(candidate[key])}</strong>
              </span>
            </div>
          ))}
          {!changedPreferences.length && (
            <p className="small muted">呈现方式、同步与服务偏好没有变化。</p>
          )}
        </div>
        {digest(base) !== digest(data!.config) && (
          <Banner kind="warning">
            配置已在其他入口变化。
            <Button
              onClick={() => {
                setBase(data!.config);
                setError('');
              }}
            >
              更新预览
            </Button>
          </Banner>
        )}
        {error && <Banner kind="error">{error}</Banner>}
      </div>
    </Modal>
  );
}
export function PreferencesPage() {
  const { data } = useApp();
  const config = data!.config;
  const input = useRef<HTMLInputElement>(null);
  const [service, setService] = useState(config.customApiBaseUrl || ''),
    [serviceError, setServiceError] = useState(''),
    [servicePending, setServicePending] = useState(false),
    [importError, setImportError] = useState(''),
    [candidate, setCandidate] = useState<FilterConfig | null>(null),
    [resetBase, setResetBase] = useState<FilterConfig | null>(null),
    [success, setSuccess] = useState('');
  useEffect(
    () => setService(config.customApiBaseUrl || ''),
    [config.customApiBaseUrl]
  );
  const settings = [
    {
      key: 'syncNativeXBlock',
      title: '同步 X 原生拉黑',
      desc: '快捷净空的撤销窗口结束后尝试同步到 X，结果单独显示。',
    },
    {
      key: 'enableCrowdReport',
      title: '共享净空记录到社区',
      desc: '使用当前 X 账号的哈希标识、账号年龄及目标 UID 提交记录；关闭后仅保存在本地。',
    },
    {
      key: 'enableCloudKeywords',
      title: '启用公共词库',
      desc: '使用社区维护的防垃圾词库，独立于自定义词库开关。',
    },
  ] as const;
  return (
    <Page title="偏好设置" description="管理同步、数据来源与你的本地备份。">
      {success && <Banner>{success}</Banner>}
      <Panel title="同步与共享">
        {settings.map((setting) => (
          <Setting
            key={setting.key}
            title={setting.title}
            description={setting.desc}
          >
            <Switch
              label={setting.title}
              checked={config[setting.key]}
              onChange={(value) =>
                perform({
                  type: 'config.patch',
                  patch: { [setting.key]: value },
                })
              }
            />
          </Setting>
        ))}
      </Panel>
      <Panel>
        <SyncStatus />
      </Panel>
      <Panel
        title="服务地址"
        description="留空使用默认服务。自定义地址失败时，不会向其他服务提交数据。"
      >
        <div className="stack-sm">
          <Field
            label="自定义 API 地址"
            help="HTTPS 地址；本地开发可使用 localhost 的 HTTP 地址。"
          >
            <input
              className="input"
              type="url"
              placeholder="https://api.example.com"
              value={service}
              onChange={(e) => setService(e.target.value)}
            />
          </Field>
          <div className="row">
            <Button
              loading={servicePending}
              onClick={async () => {
                setServicePending(true);
                setServiceError('');
                try {
                  const url = await authorizeService(service);
                  await mutate({
                    type: 'config.patch',
                    patch: { customApiBaseUrl: url },
                  });
                  setSuccess('服务地址已保存。下一次同步将使用所选服务。');
                } catch (e) {
                  setServiceError((e as Error).message);
                } finally {
                  setServicePending(false);
                }
              }}
            >
              保存服务地址
            </Button>
          </div>
          {serviceError && <Banner kind="error">{serviceError}</Banner>}
        </div>
      </Panel>
      <Panel
        title="配置备份"
        description="导出规则、词库、名单与偏好，不包含日志、当前 X 身份和认证数据。"
      >
        <div className="row wrap">
          <Button onClick={() => downloadJson(config)}>
            <Download size={15} />
            导出 JSON
          </Button>
          <Button onClick={() => input.current?.click()}>
            <Upload size={15} />
            导入配置
          </Button>
          <span className="small muted">支持 v1 JSON · 最大 10 MiB</span>
        </div>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          aria-label="选择配置 JSON 文件"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setImportError('');
            try {
              if (file.size > 10 * 1024 * 1024)
                throw new Error('文件超过 10 MiB 上限');
              setCandidate(validateConfig(JSON.parse(await file.text())));
            } catch (error) {
              setImportError(
                error instanceof SyntaxError
                  ? '文件不是合法 JSON，请检查后重试。'
                  : (error as Error).message
              );
            }
          }}
        />
        {importError && (
          <div style={{ marginTop: 16 }}>
            <Banner kind="error">{importError}</Banner>
          </div>
        )}
      </Panel>
      <Panel
        title="重置过滤设置"
        description="恢复标准规则，不清空你自己整理的关键词与名单。"
      >
        <Setting
          title="恢复标准过滤参数"
          description="保留总启停、关键词条目、黑白名单、共享与同步偏好、服务地址、记录和统计。"
        >
          <Button variant="danger" onClick={() => setResetBase(config)}>
            重置过滤设置
          </Button>
        </Setting>
      </Panel>
      {candidate && (
        <ImportConfigDialog
          config={candidate}
          onClose={() => setCandidate(null)}
        />
      )}
      {resetBase && (
        <Confirm
          title="重置过滤设置？"
          actionLabel="恢复标准规则"
          danger
          onClose={() => setResetBase(null)}
          onConfirm={async () => {
            await mutate({ type: 'config.reset', expected: digest(resetBase) });
            setSuccess('已恢复标准过滤规则，关键词条目与名单均已保留。');
          }}
        >
          <p>恢复标准规则参数、直接隐藏模式、场景豁免和自定义词库总开关。</p>
          <Banner>
            保留关键词条目、总启停、黑白名单、同步与共享偏好、服务地址、记录和统计。
          </Banner>
        </Confirm>
      )}
    </Page>
  );
}
