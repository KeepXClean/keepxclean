import { useEffect, useRef, useState } from 'react';
import { Cloud, Download, RefreshCw, Upload } from 'lucide-react';
import {
  UI_LOCALE_OPTIONS,
  detectRuntimeLanguage,
  resolveEnabledCloudLangGroups,
  resolveLocale,
  type FilterConfig,
  type UILocaleSetting,
  type UIThemeSetting,
} from '@keepxclean/shared';
import { formatCount, formatDateTime, useI18n } from '../../i18n';
import {
  authorizeService,
  disableCloudSync,
  enableCloudSync,
  pushCloudSyncNow,
  resolveCloudSync,
} from '../../services/client';
import {
  digest,
  type CloudSyncMeta,
  type CloudSyncStrategy,
  type SyncedConfigPayload,
} from '../../services/model';
import { validateConfig } from '../../services/validation';
import { mutate, useApp } from '../../state/store';
import {
  Banner,
  Button,
  Confirm,
  downloadJson,
  Field,
  Modal,
  Page,
  Panel,
  perform,
  Pill,
  Segmented,
  Setting,
  Switch,
} from '../../ui/components';

function resolveBrowserLocaleLabel(): string {
  const detected = resolveLocale('auto', detectRuntimeLanguage());
  return (
    UI_LOCALE_OPTIONS.find((opt) => opt.code === detected)?.nativeLabel ??
    'English'
  );
}

export function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { data } = useApp();
  const { m, locale } = useI18n();
  const { sync, snapshot } = data!;
  const lastSuccessText = formatDateTime(
    sync.lastSuccess,
    locale,
    m.common.neverSynced
  );
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
            ? m.preferences.syncingCompact
            : sync.status === 'error'
              ? m.preferences.syncErrorCompact
              : sync.source === 'builtin'
                ? m.preferences.usingBuiltinCompact
                : m.preferences.lastSyncedCompact(lastSuccessText)}
        </span>
      </div>
    );
  return (
    <div className="stack-sm">
      <div className="row between">
        <div>
          <h3>{m.preferences.snapshotTitle}</h3>
          <p className="small muted">{m.preferences.snapshotDesc}</p>
        </div>
        <Button
          loading={sync.status === 'syncing'}
          onClick={() => perform({ type: 'snapshot.refresh' })}
        >
          <RefreshCw size={14} />
          {m.preferences.syncNowBtn}
        </Button>
      </div>
      <div className="row wrap">
        <Pill kind="neutral">
          {sync.source === 'builtin'
            ? m.preferences.sourceBuiltin
            : sync.source === 'cache'
              ? m.preferences.sourceCache
              : m.preferences.sourceNetwork}
        </Pill>
        <span className="small muted">
          {m.preferences.lastPulled(lastSuccessText)}
        </span>
      </div>
      {sync.source !== 'builtin' && (
        <p className="small muted">
          {m.preferences.snapshotMeta(
            formatDateTime(snapshot.updatedAt, locale, m.common.neverSynced),
            formatCount(snapshot.totalAccounts, locale),
            formatCount(snapshot.totalReports, locale)
          )}
        </p>
      )}
      {sync.status === 'error' && (
        <Banner kind="warning">
          {m.preferences.syncFailedBanner(
            sync.error || m.errors.syncFailed,
            sync.source === 'builtin'
          )}
        </Banner>
      )}
    </div>
  );
}

export function computeRecordDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { added: number; changed: number; removed: number } {
  const hasBefore = (key: string) =>
    Object.prototype.hasOwnProperty.call(before, key);
  const hasAfter = (key: string) =>
    Object.prototype.hasOwnProperty.call(after, key);
  const added = Object.keys(after).filter((key) => !hasBefore(key)).length;
  const removed = Object.keys(before).filter((key) => !hasAfter(key)).length;
  const changed = Object.keys(after).filter(
    (key) => hasBefore(key) && digest(before[key]) !== digest(after[key])
  ).length;
  return { added, changed, removed };
}

function ImportConfigDialog({
  config: candidate,
  onClose,
}: {
  config: FilterConfig;
  onClose: () => void;
}) {
  const { data } = useApp();
  const { m } = useI18n();
  const [base, setBase] = useState(data!.config),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const browserLocaleLabel = resolveBrowserLocaleLabel();
  const differences = (
    before: Record<string, unknown>,
    after: Record<string, unknown>
  ) => {
    const { added, changed, removed } = computeRecordDiff(before, after);
    return m.preferences.importDialog.diffSummary(added, changed, removed);
  };
  const rows = [
    {
      label: m.preferences.importDialog.rowCustomKeywords,
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
      label: m.preferences.importDialog.rowDomains,
      before: base.rules.domainFilter.items.length,
      after: candidate.rules.domainFilter.items.length,
      detail: differences(
        Object.fromEntries(
          base.rules.domainFilter.items.map((item) => [item.id, item])
        ),
        Object.fromEntries(
          candidate.rules.domainFilter.items.map((item) => [item.id, item])
        )
      ),
    },
    {
      label: m.preferences.importDialog.rowRulePacks,
      before: (base.installedPacks ?? []).length,
      after: (candidate.installedPacks ?? []).length,
      detail: differences(
        Object.fromEntries(
          (base.installedPacks ?? []).map((pack) => [pack.id, pack])
        ),
        Object.fromEntries(
          (candidate.installedPacks ?? []).map((pack) => [pack.id, pack])
        )
      ),
    },
    {
      label: m.preferences.importDialog.rowLocalBlack,
      before: Object.keys(base.localBlocklistUids).length,
      after: Object.keys(candidate.localBlocklistUids).length,
      detail: differences(
        base.localBlocklistUids,
        candidate.localBlocklistUids
      ),
    },
    {
      label: m.preferences.importDialog.rowWhite,
      before: Object.keys(base.whitelistUids).length,
      after: Object.keys(candidate.whitelistUids).length,
      detail: differences(base.whitelistUids, candidate.whitelistUids),
    },
    ...(base.disabledCloudKeywordIds.length > 0 ||
    candidate.disabledCloudKeywordIds.length > 0
      ? [
          {
            label: m.preferences.importDialog.rowDisabledCloud,
            before: base.disabledCloudKeywordIds.length,
            after: candidate.disabledCloudKeywordIds.length,
            detail: m.preferences.importDialog.disabledCloudDetail(
              candidate.disabledCloudKeywordIds.length
            ),
          },
        ]
      : []),
  ];
  const preferenceLabels = m.preferences.importDialog.prefLabels;
  const preferenceValue = (
    key: keyof typeof preferenceLabels,
    value: unknown
  ) => {
    if (key === 'locale') {
      if (!value || value === 'auto') {
        return m.preferences.languageAuto(browserLocaleLabel);
      }
      return (
        UI_LOCALE_OPTIONS.find((opt) => opt.code === value)?.nativeLabel ??
        String(value)
      );
    }
    if (key === 'theme') {
      if (value === 'dark') return m.preferences.themeDark;
      if (value === 'system') return m.preferences.themeSystem;
      return m.preferences.themeLight;
    }
    if (typeof value === 'boolean') {
      return value ? m.common.on : m.common.off;
    }
    if (value === 'strip') return m.presets.modeStrip;
    if (value === 'collapse') return m.presets.modeCollapse;
    return String(value || m.preferences.defaultServiceName);
  };
  const changedPreferences = (
    Object.keys(preferenceLabels) as (keyof typeof preferenceLabels)[]
  ).filter((key) =>
    key === 'customApiBaseUrl'
      ? String(base[key] ?? '') !== String(candidate[key] ?? '')
      : base[key] !== candidate[key]
  );
  const ruleChanges = Object.keys(base.rules).filter(
    (key) =>
      digest(base.rules[key as keyof typeof base.rules]) !==
      digest(candidate.rules[key as keyof typeof candidate.rules])
  ).length;
  return (
    <Modal
      title={m.preferences.importDialog.title}
      description={m.preferences.importDialog.desc}
      onClose={() => {
        if (!pending) onClose();
      }}
      footer={
        <>
          <Button disabled={pending} onClick={onClose}>
            {m.common.cancel}
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
            {m.preferences.importDialog.confirmBtn}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Banner kind="warning">{m.preferences.importDialog.warningBanner}</Banner>
        <Button onClick={() => downloadJson(base)}>
          <Download size={15} />
          {m.preferences.importDialog.exportCurrentFirst}
        </Button>
        <div>
          <p>
            {m.preferences.importDialog.changedRuleGroups}:{' '}
            <strong>{ruleChanges}</strong>
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
                {preferenceValue(key, base[key])} →{' '}
                <strong>{preferenceValue(key, candidate[key])}</strong>
              </span>
            </div>
          ))}
          {!changedPreferences.length && (
            <p className="small muted">
              {m.preferences.importDialog.noPrefChanges}
            </p>
          )}
        </div>
        {digest(base) !== digest(data!.config) && (
          <Banner kind="warning">
            {m.preferences.importDialog.concurrentChangeWarning}
            <Button
              onClick={() => {
                setBase(data!.config);
                setError('');
              }}
            >
              {m.preferences.importDialog.refreshPreviewBtn}
            </Button>
          </Banner>
        )}
        {error && <Banner kind="error">{error}</Banner>}
      </div>
    </Modal>
  );
}

function formatSyncKb(bytes: number): string {
  const kb = bytes / 1024;
  return `${kb >= 10 ? kb.toFixed(0) : kb.toFixed(1)} KB`;
}

function CloudSyncConflictModal({
  localConfig,
  remote,
  remoteUpdatedAt,
  onResolved,
  onClose,
}: {
  localConfig: FilterConfig;
  remote: SyncedConfigPayload;
  remoteUpdatedAt?: number;
  onResolved: () => void;
  onClose: () => void;
}) {
  const { m, locale } = useI18n();
  const [busyStrategy, setBusyStrategy] = useState<CloudSyncStrategy | null>(
    null
  );
  const [error, setError] = useState('');
  const cm = m.preferences.cloudSync.conflictModal;

  const presetName = (preset: FilterConfig['preset']) =>
    preset === 'light'
      ? m.presets.lightTitle
      : preset === 'strict'
        ? m.presets.strictTitle
        : preset === 'custom'
          ? m.presets.customParams
          : m.presets.standardTitle;
  const modeName = (mode: FilterConfig['interceptionMode']) =>
    mode === 'strip' ? m.presets.modeStrip : m.presets.modeCollapse;

  const localLangCount = resolveEnabledCloudLangGroups(localConfig).length;
  const remoteLangCount = resolveEnabledCloudLangGroups({
    locale: remote.locale,
    enabledCloudLangGroups: remote.enabledCloudLangGroups,
  }).length;
  const diffRuleGroups = Object.keys(localConfig.rules).filter(
    (key) =>
      digest(localConfig.rules[key as keyof FilterConfig['rules']]) !==
      digest(remote.rules[key as keyof FilterConfig['rules']])
  ).length;

  async function choose(strategy: CloudSyncStrategy) {
    setBusyStrategy(strategy);
    setError('');
    try {
      const meta = await resolveCloudSync(strategy);
      if (meta?.status === 'synced') {
        onResolved();
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyStrategy(null);
    }
  }

  return (
    <Modal
      title={cm.title}
      description={cm.desc}
      onClose={() => {
        if (!busyStrategy) onClose();
      }}
      footer={
        <Button disabled={Boolean(busyStrategy)} onClick={onClose}>
          {m.common.cancel}
        </Button>
      }
    >
      <div className="stack">
        {typeof remoteUpdatedAt === 'number' &&
          Number.isFinite(remoteUpdatedAt) &&
          remoteUpdatedAt > 0 && (
            <p className="small muted">
              {cm.remoteUpdatedAt(
                formatDateTime(remoteUpdatedAt, locale, m.common.neverSynced)
              )}
            </p>
          )}
        <table className="sync-compare-table">
          <thead>
            <tr>
              <th>{cm.colField}</th>
              <th>{cm.colLocal}</th>
              <th>{cm.colRemote}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{cm.rowPreset}</td>
              <td>{presetName(localConfig.preset)}</td>
              <td>{presetName(remote.preset)}</td>
            </tr>
            <tr>
              <td>{cm.rowDisplayMode}</td>
              <td>{modeName(localConfig.interceptionMode)}</td>
              <td>{modeName(remote.interceptionMode)}</td>
            </tr>
            <tr>
              <td>{cm.rowCustomKeywords}</td>
              <td>{localConfig.rules.keywords.items.length}</td>
              <td>{remote.rules.keywords.items.length}</td>
            </tr>
            <tr>
              <td>{cm.rowDomains}</td>
              <td>{localConfig.rules.domainFilter.items.length}</td>
              <td>{remote.rules.domainFilter.items.length}</td>
            </tr>
            <tr>
              <td>{cm.rowRulePacks}</td>
              <td>{(localConfig.installedPacks ?? []).length}</td>
              <td>{(remote.installedPacks ?? []).length}</td>
            </tr>
            <tr>
              <td>{cm.rowLangPacks}</td>
              <td>{localLangCount}</td>
              <td>{remoteLangCount}</td>
            </tr>
            <tr>
              <td>{cm.rowRuleDiffs}</td>
              <td colSpan={2}>{diffRuleGroups}</td>
            </tr>
          </tbody>
        </table>

        <Banner>{cm.localSafeNote}</Banner>

        <div className="stack-sm">
          <div className="sync-choice-card">
            <div className="grow">
              <strong className="small">{cm.mergeBtn}</strong>
              <p className="small muted">{cm.mergeDesc}</p>
            </div>
            <Button
              variant="primary sm"
              loading={busyStrategy === 'merge'}
              disabled={Boolean(busyStrategy) && busyStrategy !== 'merge'}
              onClick={() => void choose('merge')}
            >
              {cm.mergeBtn}
            </Button>
          </div>
          <div className="sync-choice-card">
            <div className="grow">
              <strong className="small">{cm.keepLocalBtn}</strong>
              <p className="small muted">{cm.keepLocalDesc}</p>
            </div>
            <Button
              variant="sm"
              loading={busyStrategy === 'local'}
              disabled={Boolean(busyStrategy) && busyStrategy !== 'local'}
              onClick={() => void choose('local')}
            >
              {cm.keepLocalBtn}
            </Button>
          </div>
          <div className="sync-choice-card">
            <div className="grow">
              <strong className="small">{cm.useRemoteBtn}</strong>
              <p className="small muted">{cm.useRemoteDesc}</p>
            </div>
            <Button
              variant="sm"
              loading={busyStrategy === 'remote'}
              disabled={Boolean(busyStrategy) && busyStrategy !== 'remote'}
              onClick={() => void choose('remote')}
            >
              {cm.useRemoteBtn}
            </Button>
          </div>
        </div>

        {error && <Banner kind="error">{error}</Banner>}
      </div>
    </Modal>
  );
}

function CloudSyncPanel({
  config,
  cloudSync,
  onSuccess,
}: {
  config: FilterConfig;
  cloudSync: CloudSyncMeta;
  onSuccess: (msg: string) => void;
}) {
  const { m, locale } = useI18n();
  const cs = m.preferences.cloudSync;
  const [busy, setBusy] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [error, setError] = useState('');
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingConflict, setPendingConflict] = useState<{
    remote: SyncedConfigPayload;
    remoteUpdatedAt?: number;
  } | null>(null);
  const prevStatusRef = useRef(cloudSync.status);

  const activeRemote = cloudSync.pendingRemote ?? pendingConflict?.remote;
  const activeRemoteUpdatedAt =
    cloudSync.pendingRemote !== undefined
      ? cloudSync.remoteUpdatedAt
      : pendingConflict?.remoteUpdatedAt;

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = cloudSync.status;

    if (cloudSync.status === 'conflict' && cloudSync.pendingRemote) {
      if (pendingConflict !== null) {
        setPendingConflict(null);
      }
      return;
    }

    if (
      (prevStatus !== cloudSync.status && cloudSync.status !== 'conflict') ||
      (!activeRemote && conflictOpen)
    ) {
      if (conflictOpen) setConflictOpen(false);
      if (pendingConflict !== null) setPendingConflict(null);
    }
  }, [
    cloudSync.status,
    cloudSync.pendingRemote,
    pendingConflict,
    conflictOpen,
    activeRemote,
  ]);

  const lastPushAt =
    typeof cloudSync.lastPushAt === 'number' &&
    Number.isFinite(cloudSync.lastPushAt)
      ? cloudSync.lastPushAt
      : 0;
  const lastPullAt =
    typeof cloudSync.lastPullAt === 'number' &&
    Number.isFinite(cloudSync.lastPullAt)
      ? cloudSync.lastPullAt
      : 0;
  const lastSyncTs = Math.max(lastPushAt, lastPullAt);
  const statusPillKind =
    cloudSync.status === 'synced'
      ? ''
      : cloudSync.status === 'conflict' || cloudSync.status === 'quota_exceeded'
        ? 'warning'
        : cloudSync.status === 'error'
          ? 'danger'
          : 'neutral';

  async function toggleSync(nextEnabled: boolean) {
    setBusy(true);
    setError('');
    try {
      const meta = nextEnabled
        ? await enableCloudSync()
        : await disableCloudSync();
      if (nextEnabled && meta.status === 'conflict' && meta.pendingRemote) {
        setPendingConflict({
          remote: meta.pendingRemote,
          remoteUpdatedAt: meta.remoteUpdatedAt,
        });
        setConflictOpen(true);
      } else {
        setConflictOpen(false);
        setPendingConflict(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePushNow() {
    setSyncingNow(true);
    setError('');
    try {
      const meta = await pushCloudSyncNow();
      if (meta.status === 'synced') {
        onSuccess(cs.syncedNowNotice);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncingNow(false);
    }
  }

  return (
    <>
      <Panel title={cs.panelTitle} description={cs.panelDesc}>
        <div className="stack" data-kxc-cloud-sync="true">
          <Setting title={cs.enableTitle} description={cs.enableDesc}>
            <Switch
              label={cs.enableTitle}
              checked={cloudSync.enabled}
              disabled={busy}
              onChange={(next) => void toggleSync(next)}
            />
          </Setting>

          <div className="row between wrap" style={{ gap: 10 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <Pill kind={statusPillKind}>{cs.statuses[cloudSync.status]}</Pill>
              {lastSyncTs > 0 && (
                <span className="small muted">
                  {cs.lastSync(
                    formatDateTime(lastSyncTs, locale, m.common.neverSynced)
                  )}
                </span>
              )}
              {typeof cloudSync.bytesUsed === 'number' &&
                Number.isFinite(cloudSync.bytesUsed) &&
                cloudSync.bytesUsed > 0 && (
                  <span className="small muted">
                    {cs.usageMeta(
                      formatSyncKb(cloudSync.bytesUsed),
                      typeof cloudSync.chunkCount === 'number' &&
                        Number.isFinite(cloudSync.chunkCount) &&
                        cloudSync.chunkCount > 0
                        ? cloudSync.chunkCount
                        : 1
                    )}
                  </span>
                )}
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {cloudSync.status === 'conflict' && cloudSync.pendingRemote && (
                <Button
                  variant="primary sm"
                  onClick={() => setConflictOpen(true)}
                >
                  {cs.resolveBtn}
                </Button>
              )}
              {cloudSync.enabled && cloudSync.status !== 'conflict' && (
                <Button
                  variant="sm"
                  loading={syncingNow || cloudSync.status === 'syncing'}
                  onClick={() => void handlePushNow()}
                >
                  <Cloud size={14} />
                  {cs.syncNowBtn}
                </Button>
              )}
            </div>
          </div>

          {cloudSync.status === 'conflict' && (
            <Banner
              kind="warning"
              action={
                cloudSync.pendingRemote ? (
                  <Button variant="sm" onClick={() => setConflictOpen(true)}>
                    {cs.resolveBtn}
                  </Button>
                ) : undefined
              }
            >
              {cs.conflictBanner}
            </Banner>
          )}

          {cloudSync.status === 'quota_exceeded' && (
            <Banner kind="warning">{cs.quotaBanner}</Banner>
          )}

          {(error || (cloudSync.status === 'error' && cloudSync.error)) && (
            <Banner kind="error">{error || cloudSync.error}</Banner>
          )}

          <Banner>{cs.localOnlyNotice}</Banner>
        </div>
      </Panel>

      {conflictOpen && activeRemote && (
        <CloudSyncConflictModal
          localConfig={config}
          remote={activeRemote}
          remoteUpdatedAt={activeRemoteUpdatedAt}
          onResolved={() => onSuccess(cs.resolvedNotice)}
          onClose={() => {
            setConflictOpen(false);
            setPendingConflict(null);
          }}
        />
      )}
    </>
  );
}

export function PreferencesPage() {
  const { data } = useApp();
  const { m } = useI18n();
  const { config, cloudSync } = data!;
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
  const browserLocaleLabel = resolveBrowserLocaleLabel();
  const settings = [
    {
      key: 'syncNativeXBlock',
      title: m.preferences.syncNativeTitle,
      desc: m.preferences.syncNativeDesc,
    },
    {
      key: 'enableCrowdReport',
      title: m.preferences.crowdReportTitle,
      desc: m.preferences.crowdReportDesc,
    },
    {
      key: 'enableCloudKeywords',
      title: m.preferences.cloudKeywordsTitle,
      desc: m.preferences.cloudKeywordsDesc,
    },
  ] as const;
  return (
    <Page title={m.preferences.pageTitle} description={m.preferences.pageDesc}>
      {success && (
        <Banner kind="success" onDismiss={() => setSuccess('')}>
          {success}
        </Banner>
      )}
      <Panel title={m.preferences.languagePanelTitle}>
        <Setting
          title={m.preferences.themeTitle}
          description={m.preferences.themeDesc}
        >
          <Segmented<UIThemeSetting>
            label={m.preferences.themeTitle}
            value={config.theme}
            options={[
              { value: 'light', label: m.preferences.themeLight },
              { value: 'dark', label: m.preferences.themeDark },
              { value: 'system', label: m.preferences.themeSystem },
            ]}
            onChange={(theme) =>
              perform({
                type: 'config.patch',
                patch: { theme },
              })
            }
          />
        </Setting>
        <Setting
          title={m.preferences.languageTitle}
          description={m.preferences.languageDesc}
        >
          <select
            style={{ width: 'auto', minWidth: 180 }}
            aria-label={m.preferences.languageTitle}
            value={config.locale}
            onChange={(e) =>
              perform({
                type: 'config.patch',
                patch: { locale: e.target.value as UILocaleSetting },
              })
            }
          >
            <option value="auto">
              {m.preferences.languageAuto(browserLocaleLabel)}
            </option>
            {UI_LOCALE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.nativeLabel}
              </option>
            ))}
          </select>
        </Setting>
      </Panel>
      <Panel title={m.preferences.syncPanelTitle}>
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
      <CloudSyncPanel
        config={config}
        cloudSync={cloudSync}
        onSuccess={setSuccess}
      />
      <Panel
        title={m.preferences.servicePanelTitle}
        description={m.preferences.servicePanelDesc}
      >
        <div className="stack-sm">
          <Field
            label={m.preferences.customApiLabel}
            help={m.preferences.customApiHelp}
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
                  setSuccess(m.preferences.serviceSavedMsg);
                } catch (e) {
                  setServiceError((e as Error).message);
                } finally {
                  setServicePending(false);
                }
              }}
            >
              {m.preferences.saveServiceBtn}
            </Button>
          </div>
          {serviceError && <Banner kind="error">{serviceError}</Banner>}
        </div>
      </Panel>
      <Panel
        title={m.preferences.backupPanelTitle}
        description={m.preferences.backupPanelDesc}
      >
        <div className="row wrap">
          <Button onClick={() => downloadJson(config)}>
            <Download size={15} />
            {m.preferences.exportJsonBtn}
          </Button>
          <Button onClick={() => input.current?.click()}>
            <Upload size={15} />
            {m.preferences.importConfigBtn}
          </Button>
          <span className="small muted">{m.preferences.backupSpecHint}</span>
        </div>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          aria-label={m.preferences.selectJsonAria}
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setImportError('');
            try {
              if (file.size > 10 * 1024 * 1024)
                throw new Error(m.preferences.fileTooLargeError);
              setCandidate(validateConfig(JSON.parse(await file.text())));
            } catch (error) {
              setImportError(
                error instanceof SyntaxError
                  ? m.preferences.invalidJsonError
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
        title={m.preferences.resetPanelTitle}
        description={m.preferences.resetPanelDesc}
      >
        <Setting
          title={m.preferences.resetSettingTitle}
          description={m.preferences.resetSettingDesc}
        >
          <Button variant="danger" onClick={() => setResetBase(config)}>
            {m.preferences.resetBtn}
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
          title={m.preferences.resetConfirmTitle}
          actionLabel={m.preferences.resetConfirmBtn}
          danger
          onClose={() => setResetBase(null)}
          onConfirm={async () => {
            await mutate({ type: 'config.reset', expected: digest(resetBase) });
            setSuccess(m.preferences.resetSuccessMsg);
          }}
        >
          <p>{m.preferences.resetConfirmBody}</p>
          <Banner>{m.preferences.resetConfirmBanner}</Banner>
        </Confirm>
      )}
    </Page>
  );
}
