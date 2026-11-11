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
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { STORAGE_KEYS } from '@keepxclean/shared';
import { command } from '../services/client';
import { digest, type Command } from '../services/model';
import { mutate, reload, useApp } from '../state/store';

export function BrandIcon({ size = 32 }: { size?: number }) {
  const resource =
    size <= 16 ? 16 : size <= 24 ? 24 : size <= 32 ? 32 : size <= 48 ? 48 : 128;
  return (
    <img
      src={chrome.runtime.getURL(`icon/icon-${resource}.png`)}
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
      className={`btn ${variant} ${className}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading && <Loader2 size={15} className="spin" />}
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
    <section className={`panel ${className}`}>
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
}: {
  children: ReactNode;
  kind?: 'info' | 'error' | 'warning';
}) {
  return (
    <div
      className={`banner ${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <AlertCircle size={16} />
      <div className="grow">{children}</div>
    </div>
  );
}
export function Pill({
  children,
  kind = '',
}: {
  children: ReactNode;
  kind?: string;
}) {
  return <span className={`pill ${kind}`}>{children}</span>;
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
  placeholder = '搜索',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={16} />
      <input
        className="input"
        type="search"
        aria-label={placeholder}
        value={value}
        placeholder={placeholder}
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
      setError(`请输入不小于 ${min} 的${step === 1 ? '整数' : '数值'}`);
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
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="number-control">
        {sliderMax && (
          <input
            type="range"
            aria-label={`${label}滑杆`}
            min={min}
            max={Math.max(sliderMax, value)}
            step={step}
            value={draft || min}
            onChange={(e) => setDraft(e.target.value)}
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
        <Button variant="ghost icon" aria-label="关闭" onClick={onClose}>
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
  actionLabel = '确认',
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
            取消
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
            {actionLabel}
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
        <Inbox size={22} />
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
  return (
    <div className="pagination">
      <span>共 {count.toLocaleString()} 条 · 每页 25 条</span>
      <div className="row">
        <Button
          variant="ghost icon"
          aria-label="上一页"
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
          aria-label="下一页"
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
  return (
    <span className="row small muted" role="status">
      {state.pending ? (
        <>
          <Loader2 size={14} className="spin" />
          保存中
        </>
      ) : state.saveError ? (
        <>
          <AlertCircle size={14} />
          保存失败
        </>
      ) : (
        <>
          <Check size={14} />
          已保存到本地
        </>
      )}
    </span>
  );
}
export function SaveError() {
  const { saveError } = useApp();
  return saveError ? <Banner kind="error">{saveError}</Banner> : null;
}
export function Loading() {
  return (
    <div
      className="stack"
      aria-label="正在加载"
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
  const [recover, setRecover] = useState(false);
  return (
    <div style={{ padding: 24 }} className="stack">
      <Banner kind="error">无法读取配置：{error}</Banner>
      <div className="row wrap">
        <Button onClick={() => void reload()}>重新加载</Button>
        <Button
          onClick={async () => {
            const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
            downloadJson(data[STORAGE_KEYS.CONFIG], 'keepxclean-recovery.json');
          }}
        >
          导出原始数据
        </Button>
        <Button variant="danger" onClick={() => setRecover(true)}>
          恢复默认配置
        </Button>
      </div>
      {recover && (
        <Confirm
          title="恢复默认配置？"
          danger
          onClose={() => setRecover(false)}
          onConfirm={async () => {
            const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
            await command({
              type: 'config.recover',
              expected: digest(data[STORAGE_KEYS.CONFIG]),
            });
            await reload();
          }}
        >
          <p>
            仅在配置损坏、无法使用时恢复。当前原始数据会先备份到本地；建议同时导出文件。恢复后原关键词与名单不会自动启用。
          </p>
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
  return value
    ? new Date(value).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '尚未同步';
}
