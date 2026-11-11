import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Upload } from 'lucide-react';
import {
  UI_LOCALE_OPTIONS,
  detectRuntimeLanguage,
  resolveLocale,
  type FilterConfig,
  type UILocaleSetting,
} from '@keepxclean/shared';
import { formatCount, formatDateTime, useI18n } from '../../i18n';
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
  Modal,
  Page,
  Panel,
  perform,
  Pill,
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
    const added = Object.keys(after).filter((key) => !(key in before)).length;
    const removed = Object.keys(before).filter((key) => !(key in after)).length;
    const changed = Object.keys(after).filter(
      (key) => key in before && digest(before[key]) !== digest(after[key])
    ).length;
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

export function PreferencesPage() {
  const { data } = useApp();
  const { m } = useI18n();
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
