import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Info,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { STORAGE_KEYS } from '@keepxclean/shared';
import {
  formatCount,
  formatDateTime,
  getActiveI18n,
  useI18n,
} from '../i18n';
import {
  command,
  isExtensionContextValid,
  reloadXTabs,
  runtimeUrl,
} from '../services/client';
import { digest, type Command } from '../services/model';
import { clearSaveError, mutate, reload, useApp } from '../state/store';

export function BrandIcon({ size = 32 }: { size?: number }) {
  const resource =
    size <= 16 ? 16 : size <= 24 ? 24 : size <= 32 ? 32 : size <= 48 ? 48 : 128;
  return (
    <img
      src={runtimeUrl(`icon/icon-${resource}.png`)}
      alt=""
      width={size}
      height={size}
    />
  );
}
export function Brand({ size = 32 }: { size?: number }) {
  return (
    <div className="brand">
      <BrandIcon size={size} />
      <span>KeepXClean</span>
    </div>
  );
}
export function Button({
  children,
  variant = '',
  loading,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn ${variant} ${className}`.trim()}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading && <Loader2 size={14} className="spin" />}
      {children}
    </button>
  );
}
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}
export function Setting({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting">
      <div className="grow">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title && (
        <div className="panel-header">
          <div>
            <h2>{title}</h2>
            {description && <p className="panel-subtitle">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Page({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {action}
      </div>
      <div className="stack">{children}</div>
    </main>
  );
}
export function Banner({
  children,
  kind = 'info',
  action,
  onDismiss,
}: {
  children: ReactNode;
  kind?: 'info' | 'success' | 'error' | 'warning';
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  const { m } = useI18n();
  const Icon =
    kind === 'error'
      ? AlertCircle
      : kind === 'warning'
        ? AlertTriangle
        : kind === 'success'
          ? CheckCircle2
          : Info;
  return (
    <div
      className={`banner ${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <Icon size={16} />
      <div className="grow">{children}</div>
      {action}
      {onDismiss && (
        <Button
          variant="ghost icon sm"
          aria-label={m.common.dismiss}
          onClick={onDismiss}
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}
export function ReloadXButton({
  label,
  variant = 'sm',
}: {
  label?: string;
  variant?: string;
}) {
  const { m } = useI18n();
  const buttonLabel = label ?? m.common.reloadXPage;
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'none'>(
    'idle'
  );
  useEffect(() => {
    if (status !== 'done' && status !== 'none') return;
    const timer = setTimeout(() => setStatus('idle'), 2200);
    return () => clearTimeout(timer);
  }, [status]);
  return (
    <Button
      variant={variant}
      loading={status === 'busy'}
      onClick={async () => {
        setStatus('busy');
        try {
          const res = await reloadXTabs();
          setStatus(res.reloaded > 0 ? 'done' : 'none');
        } catch {
          setStatus('idle');
        }
      }}
    >
      {status === 'done' ? (
        <>
          <Check size={13} />
          {m.common.reloaded}
        </>
      ) : status === 'none' ? (
        m.common.noOpenXTab
      ) : (
        <>
          <RefreshCw size={13} />
          {buttonLabel}
        </>
      )}
    </Button>
  );
}
export function Pill({
  children,
  kind = '',
  title,
}: {
  children: ReactNode;
  kind?: string;
  title?: string;
}) {
  return (
    <span className={`pill ${kind}`.trim()} title={title}>
      {children}
    </span>
  );
}
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((option, index) => (
        <button
          role="tab"
          type="button"
          key={option.value}
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          onKeyDown={(event) => {
            const next =
              event.key === 'ArrowRight'
                ? (index + 1) % options.length
                : event.key === 'ArrowLeft'
                  ? (index - 1 + options.length) % options.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? options.length - 1
                      : -1;
            if (next < 0) return;
            event.preventDefault();
            onChange(options[next].value);
            (
              event.currentTarget.parentElement?.children[
                next
              ] as HTMLButtonElement
            )?.focus();
          }}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { m } = useI18n();
  const text = placeholder ?? m.common.search;
  return (
    <div className="search">
      <Search size={16} />
      <input
        className="input"
        type="search"
        aria-label={text}
        value={value}
        placeholder={text}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {help && <span className="field-help">{help}</span>}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
export function NumberField({
  label,
  value,
  onCommit,
  min = 0,
  step = 1,
  unit,
  sliderMax,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => Promise<unknown>;
  min?: number;
  step?: number;
  unit?: string;
  sliderMax?: number;
}) {
  const { m } = useI18n();
  const [draft, setDraft] = useState(String(value)),
    [error, setError] = useState('');
  const id = useId();
  useEffect(() => {
    setDraft(String(value));
    setError('');
  }, [value]);
  async function commit(raw = draft) {
    const number = Number(raw);
    if (
      !raw.trim() ||
      !Number.isFinite(number) ||
      number < min ||
      (step === 1 && !Number.isInteger(number))
    ) {
      setError(m.common.numberValidationError(min, step === 1));
      return;
    }
    setError('');
    if (number !== value)
      try {
        await onCommit(number);
      } catch (e) {
        setError((e as Error).message);
      }
  }
  const parsedDraft = Number(draft);
  const rangeValue =
    draft.trim() && Number.isFinite(parsedDraft)
      ? Math.max(min, parsedDraft)
      : value;
  const rangeMax = sliderMax
    ? Math.max(sliderMax, value, rangeValue)
    : undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="number-control">
        {rangeMax !== undefined && (
          <input
            type="range"
            aria-label={m.common.sliderLabel(label)}
            min={min}
            max={rangeMax}
            step={step}
            value={rangeValue}
            onChange={(e) => {
              setDraft(e.target.value);
              setError('');
            }}
            onPointerUp={(e) => void commit(e.currentTarget.value)}
            onKeyUp={(e) => void commit(e.currentTarget.value)}
          />
        )}
        <input
          id={id}
          className="input"
          type="number"
          min={min}
          step={step}
          value={draft}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(String(value));
              setError('');
              e.currentTarget.blur();
            }
          }}
        />
        {unit && <span className="small muted">{unit}</span>}
      </div>
      {error && (
        <div id={`${id}-error`} className="field-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  footer,
  onClose,
  drawer = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  drawer?: boolean;
}) {
  const { m } = useI18n();
  const ref = useRef<HTMLDialogElement>(null),
    closeRef = useRef(onClose),
    id = useId();
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const focused =
      dialog.getRootNode() instanceof ShadowRoot
        ? ((dialog.getRootNode() as ShadowRoot)
            .activeElement as HTMLElement | null)
        : (document.activeElement as HTMLElement | null);
    dialog.showModal();
    const close = () => closeRef.current();
    dialog.addEventListener('close', close);
    return () => {
      dialog.removeEventListener('close', close);
      dialog.close();
      focused?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${drawer ? 'drawer' : ''}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-head">
        <div>
          <h2 id={id}>{title}</h2>
          {description && <p className="small muted">{description}</p>}
        </div>
        <Button variant="ghost icon" aria-label={m.common.close} onClick={onClose}>
          <X size={18} />
        </Button>
      </div>
      <div className="dialog-body">{children}</div>
      {footer && <div className="dialog-foot">{footer}</div>}
    </dialog>
  );
}
export function Confirm({
  title,
  children,
  actionLabel,
  onConfirm,
  onClose,
  danger = false,
}: {
  title: string;
  children: ReactNode;
  actionLabel?: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
  danger?: boolean;
}) {
  const { m } = useI18n();
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!pending) onClose();
      }}
      footer={
        <>
          <Button disabled={pending} onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={pending}
            onClick={async () => {
              setPending(true);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            {actionLabel ?? m.common.confirm}
          </Button>
        </>
      }
    >
      <div className="stack">
        {children}
        {error && <Banner kind="error">{error}</Banner>}
      </div>
    </Modal>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">
        <Inbox size={20} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Pagination({
  page,
  pages,
  count,
  onChange,
}: {
  page: number;
  pages: number;
  count: number;
  onChange: (page: number) => void;
}) {
  const { m, locale } = useI18n();
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <span>{m.common.paginationSummary(formatCount(count, locale))}</span>
      <div className="row">
        <Button
          variant="ghost icon"
          aria-label={m.common.prevPage}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </Button>
        <span>
          {page} / {pages}
        </span>
        <Button
          variant="ghost icon"
          aria-label={m.common.nextPage}
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
export function usePagination<T>(items: T[], resetKey: string) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / 25));
  useEffect(() => setPage(1), [resetKey]);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  return {
    items: items.slice(
      (Math.min(page, pages) - 1) * 25,
      Math.min(page, pages) * 25
    ),
    control: (
      <Pagination
        page={Math.min(page, pages)}
        pages={pages}
        count={items.length}
        onChange={setPage}
      />
    ),
  };
}
export function SaveStatus() {
  const state = useApp();
  const { m } = useI18n();
  const [visibleSaved, setVisibleSaved] = useState(false);
  useEffect(() => {
    if (!state.lastSavedAt) return;
    setVisibleSaved(true);
    const timer = setTimeout(() => setVisibleSaved(false), 3200);
    return () => clearTimeout(timer);
  }, [state.lastSavedAt]);

  if (state.pending) {
    return (
      <span className="save-status muted" role="status">
        <Loader2 size={13} className="spin" />
        {m.common.saving}
      </span>
    );
  }
  if (state.saveError) {
    return (
      <span className="save-status error" role="status">
        <AlertCircle size={13} />
        {m.common.saveFailed}
      </span>
    );
  }
  if (visibleSaved) {
    return (
      <span className="save-status saved" role="status">
        <Check size={13} />
        {m.common.saved}
      </span>
    );
  }
  return null;
}
export function SaveError() {
  const { saveError } = useApp();
  return saveError ? (
    <Banner kind="error" onDismiss={clearSaveError}>
      {saveError}
    </Banner>
  ) : null;
}
export function Loading() {
  const { m } = useI18n();
  return (
    <div
      className="stack"
      aria-label={m.common.loading}
      role="status"
      style={{ padding: 24 }}
    >
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
export function LoadError({ error }: { error: string }) {
  const { m } = useI18n();
  const [recover, setRecover] = useState(false);
  return (
    <div style={{ padding: 24 }} className="stack">
      <Banner kind="error">{m.common.loadConfigError(error)}</Banner>
      <div className="row wrap">
        <Button onClick={() => void reload()}>{m.common.reload}</Button>
        <Button
          onClick={async () => {
            if (!isExtensionContextValid()) return;
            const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
            downloadJson(data[STORAGE_KEYS.CONFIG], 'keepxclean-recovery.json');
          }}
        >
          {m.common.exportRawData}
        </Button>
        <Button variant="danger" onClick={() => setRecover(true)}>
          {m.common.restoreDefaults}
        </Button>
      </div>
      {recover && (
        <Confirm
          title={m.common.restoreDefaultsConfirmTitle}
          danger
          onClose={() => setRecover(false)}
          onConfirm={async () => {
            if (!isExtensionContextValid()) {
              throw new Error(m.errors.contextInvalidated);
            }
            const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
            await command({
              type: 'config.recover',
              expected: digest(data[STORAGE_KEYS.CONFIG]),
            });
            await reload();
          }}
        >
          <p>{m.common.restoreDefaultsConfirmBody}</p>
        </Confirm>
      )}
    </div>
  );
}
export function perform(action: Command) {
  void mutate(action).catch(() => undefined);
}
export function downloadJson(
  value: unknown,
  filename = `keepxclean-config-${new Date().toISOString().slice(0, 10)}.json`
) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function formatTime(value?: number | string) {
  const { locale, m } = getActiveI18n();
  return formatDateTime(value, locale, m.common.neverSynced);
}
