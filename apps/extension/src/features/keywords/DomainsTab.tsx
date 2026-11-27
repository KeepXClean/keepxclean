import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  isValidDomainRule,
  normalizeDomainRule,
  type DomainRuleItem,
} from '@keepxclean/shared';
import { formatCount, useI18n } from '../../i18n';
import { digest } from '../../services/model';
import { validateDomainRule } from '../../services/validation';
import { mutate, useApp } from '../../state/store';
import {
  Banner,
  Button,
  Confirm,
  Empty,
  Field,
  Modal,
  Panel,
  perform,
  Pill,
  SearchBox,
  Setting,
  Switch,
  usePagination,
} from '../../ui/components';
import { useFocusHighlight } from '../../ui/useHashQuery';

export function DomainEditor({
  item,
  existingDomains,
  onClose,
}: {
  item?: DomainRuleItem;
  existingDomains: DomainRuleItem[];
  onClose: () => void;
}) {
  const { m } = useI18n();
  const [draft, setDraft] = useState<DomainRuleItem>(
    () =>
      item ?? {
        id: crypto.randomUUID(),
        domain: '',
        enabled: true,
        onlyInReplies: false,
        note: '',
      }
  );
  const [exempt, setExempt] = useState(Boolean(item?.maxFollowersExempt));
  const [followers, setFollowers] = useState(
    String(item?.maxFollowersExempt || 20000)
  );
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [initial] = useState(digest({ draft, exempt, followers }));

  const normalized = draft.domain.trim()
    ? normalizeDomainRule(draft.domain)
    : '';
  const validDomain = Boolean(normalized && isValidDomainRule(normalized));
  const duplicate = Boolean(
    validDomain &&
      existingDomains.some(
        (d) =>
          d.id !== draft.id &&
          normalizeDomainRule(d.domain) === normalized
      )
  );

  const close = () => {
    if (digest({ draft, exempt, followers }) !== initial) setDiscard(true);
    else onClose();
  };

  async function save() {
    setError('');
    if (!validDomain) {
      setError(m.keywords.domains.editor.invalidDomainError);
      return;
    }
    if (duplicate) {
      setError(m.keywords.domains.editor.duplicateError);
      return;
    }
    if (exempt && (!followers.trim() || Number(followers) <= 0)) {
      setError(m.keywords.editor.exemptPositiveError);
      return;
    }
    setPending(true);
    try {
      const { maxFollowersExempt: _unused, ...rest } = draft;
      const validated = validateDomainRule({
        ...rest,
        domain: normalized,
        ...(exempt ? { maxFollowersExempt: Number(followers) } : {}),
      });
      await mutate({
        type: 'domain.save',
        item: validated,
        expected: item ? digest(item) : undefined,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Modal
        title={
          item
            ? m.keywords.domains.editor.editTitle
            : m.keywords.domains.editor.addTitle
        }
        description={m.keywords.domains.editor.desc}
        onClose={() => {
          if (!pending) close();
        }}
        footer={
          <>
            <Button disabled={pending} onClick={close}>
              {m.common.cancel}
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() => void save()}
            >
              {item
                ? m.keywords.domains.editor.saveEditBtn
                : m.keywords.domains.editor.saveAddBtn}
            </Button>
          </>
        }
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field
            label={m.keywords.domains.editor.domainLabel}
            help={m.keywords.domains.editor.domainHelp}
            error={
              duplicate
                ? m.keywords.domains.editor.duplicateError
                : draft.domain.trim() && !validDomain
                  ? m.keywords.domains.editor.invalidDomainError
                  : undefined
            }
          >
            <input
              autoFocus
              className="input"
              value={draft.domain}
              placeholder={m.keywords.domains.editor.domainPlaceholder}
              onChange={(e) => setDraft({ ...draft, domain: e.target.value })}
            />
          </Field>
          {validDomain && !duplicate && (
            <div className="row wrap" style={{ gap: 6 }}>
              <Pill>{m.keywords.domains.editor.normalizedPreview(normalized)}</Pill>
            </div>
          )}
          <Banner>{m.keywords.domains.editor.subdomainNote}</Banner>
          <Setting
            title={m.keywords.editor.onlyRepliesTitle}
            description={m.keywords.editor.onlyRepliesDesc}
          >
            <Switch
              label={m.keywords.editor.onlyRepliesTitle}
              checked={Boolean(draft.onlyInReplies)}
              onChange={(onlyInReplies) =>
                setDraft({ ...draft, onlyInReplies })
              }
            />
          </Setting>
          <Setting
            title={m.keywords.editor.exemptTitle}
            description={m.keywords.editor.exemptDesc}
          >
            <Switch
              label={m.keywords.editor.exemptTitle}
              checked={exempt}
              onChange={setExempt}
            />
          </Setting>
          {exempt && (
            <Field label={m.keywords.editor.exemptThresholdLabel}>
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={followers}
                onChange={(e) => setFollowers(e.target.value)}
              />
            </Field>
          )}
          <Field label={m.keywords.editor.noteLabel}>
            <input
              className="input"
              value={draft.note ?? ''}
              placeholder={m.keywords.editor.notePlaceholder}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </Field>
          <Setting title={m.keywords.domains.editor.enableItemTitle}>
            <Switch
              label={m.keywords.domains.editor.enableItemTitle}
              checked={draft.enabled}
              onChange={(enabled) => setDraft({ ...draft, enabled })}
            />
          </Setting>
          {error && <Banner kind="error">{error}</Banner>}
        </form>
      </Modal>
      {discard && (
        <Confirm
          title={m.keywords.editor.discardTitle}
          actionLabel={m.keywords.editor.discardBtn}
          onClose={() => setDiscard(false)}
          onConfirm={async () => onClose()}
        >
          <p>{m.keywords.editor.discardBody}</p>
        </Confirm>
      )}
    </>
  );
}

export function DomainsTab({
  focusId,
  focusNavKey,
  editorOpen,
  onCloseEditor,
}: {
  focusId: string | null;
  focusNavKey?: string;
  editorOpen: boolean;
  onCloseEditor: () => void;
}) {
  const { data } = useApp();
  const { m, locale } = useI18n();
  const { config } = data!;
  const items = config.rules.domainFilter.items;

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<DomainRuleItem | null>(null);
  const [deleting, setDeleting] = useState<DomainRuleItem | null>(null);
  const handledFilterNavRef = useRef<string | null>(null);
  const handledPageNavRef = useRef<string | null>(null);

  const navToken = focusId ? `${focusNavKey ?? ''}\0${focusId}` : null;

  useEffect(() => {
    if (!focusId || !navToken) {
      handledFilterNavRef.current = null;
      return;
    }
    if (handledFilterNavRef.current === navToken) return;
    handledFilterNavRef.current = navToken;
    if (items.some((d) => d.id === focusId)) {
      setQuery('');
    }
  }, [focusId, navToken, items]);

  const filtered = items.filter((d) =>
    `${d.domain} ${d.note ?? ''}`.toLowerCase().includes(query.toLowerCase())
  );
  const page = usePagination(filtered, `domains:${query}`);
  const { setPage, pageSize } = page;

  useEffect(() => {
    if (!focusId || !navToken) {
      handledPageNavRef.current = null;
      return;
    }
    if (handledPageNavRef.current === navToken) return;
    if (!items.some((d) => d.id === focusId)) {
      handledPageNavRef.current = navToken;
      return;
    }
    if (query !== '') return;
    const idx = filtered.findIndex((d) => d.id === focusId);
    if (idx < 0) return;
    handledPageNavRef.current = navToken;
    const targetPage = Math.floor(idx / pageSize) + 1;
    setPage(targetPage);
  }, [focusId, navToken, query, items, filtered, pageSize, setPage]);

  const focusReady =
    !focusId || (query === '' && page.items.some((d) => d.id === focusId));
  const activeFocusId = useFocusHighlight(focusId, {
    ready: focusReady,
    triggerKey: focusNavKey,
  });

  return (
    <>
      <Panel>
        <Setting
          title={m.keywords.domains.enableTitle}
          description={m.keywords.domains.enableDesc}
        >
          <Switch
            label={m.keywords.domains.enableTitle}
            checked={config.rules.domainFilter.enabled}
            onChange={(enabled) =>
              perform({
                type: 'config.patch',
                patch: { rules: { domainFilter: { enabled } } },
              })
            }
          />
        </Setting>
      </Panel>
      <div className="row between wrap">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder={m.keywords.domains.searchPlaceholder}
        />
        <span className="small muted">
          {m.keywords.domains.count(filtered.length)}
        </span>
      </div>
      <Panel className="table-panel">
        {filtered.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{m.keywords.domains.colDomain}</th>
                    <th>{m.keywords.domains.colCondition}</th>
                    <th>{m.keywords.domains.colExempt}</th>
                    <th style={{ textAlign: 'right' }}>
                      {m.keywords.domains.colActions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((d) => {
                    const rowDimmed =
                      !d.enabled || !config.rules.domainFilter.enabled;
                    const isFocused = activeFocusId === d.id;
                    return (
                      <tr
                        key={d.id}
                        data-item-id={d.id}
                        data-focus-id={d.id}
                        data-focused={isFocused ? 'true' : undefined}
                        className={isFocused ? 'focus-highlight' : undefined}
                        style={rowDimmed ? { opacity: 0.58 } : undefined}
                      >
                        <td>
                          <div className="cell-main">
                            <div className="row wrap" style={{ gap: 6 }}>
                              <strong className="ellipsis mono" title={d.domain}>
                                {d.domain}
                              </strong>
                              <Pill kind="neutral">
                                {m.keywords.domains.subdomainCoveragePill(
                                  d.domain
                                )}
                              </Pill>
                            </div>
                            <div
                              className="small muted ellipsis"
                              title={d.note ?? ''}
                            >
                              {d.note || m.keywords.noNote}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="row wrap" style={{ gap: 5 }}>
                            <Pill kind="neutral">
                              {m.keywords.domains.urlAndBioPill}
                            </Pill>
                            <Pill kind={d.onlyInReplies ? '' : 'neutral'}>
                              {d.onlyInReplies
                                ? m.keywords.onlyRepliesPill
                                : m.keywords.domains.allScenesPill}
                            </Pill>
                          </div>
                        </td>
                        <td className="small muted">
                          {d.maxFollowersExempt
                            ? `≥ ${formatCount(d.maxFollowersExempt, locale)}`
                            : m.common.none}
                        </td>
                        <td>
                          <div className="table-actions">
                            <Switch
                              label={m.keywords.domains.enableItemAria(d.domain)}
                              checked={d.enabled}
                              onChange={(enabled) =>
                                perform({
                                  type: 'domain.save',
                                  item: { ...d, enabled },
                                  expected: digest(d),
                                })
                              }
                            />
                            <Button
                              variant="ghost icon"
                              aria-label={m.keywords.domains.editItemAria(
                                d.domain
                              )}
                              onClick={() => setEditing(d)}
                            >
                              <Pencil size={15} />
                            </Button>
                            <Button
                              variant="ghost icon"
                              aria-label={m.keywords.domains.deleteItemAria(
                                d.domain
                              )}
                              onClick={() => setDeleting(d)}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {page.control}
          </>
        ) : (
          <Empty
            title={
              query
                ? m.keywords.domains.emptySearchTitle
                : m.keywords.domains.emptyInitTitle
            }
            description={
              query
                ? m.keywords.domains.emptySearchDesc
                : m.keywords.domains.emptyInitDesc
            }
          />
        )}
      </Panel>
      {(editorOpen || editing) && (
        <DomainEditor
          item={editing ?? undefined}
          existingDomains={items}
          onClose={() => {
            setEditing(null);
            onCloseEditor();
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={m.keywords.domains.deleteConfirmTitle}
          actionLabel={m.keywords.domains.deleteConfirmBtn}
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            mutate({
              type: 'domain.delete',
              id: deleting.id,
              expected: digest(deleting),
            })
          }
        >
          <p className="break mono">{deleting.domain}</p>
        </Confirm>
      )}
    </>
  );
}
