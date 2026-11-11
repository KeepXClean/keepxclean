import { useState } from 'react';
import { Copy, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  getCloudKeywordNote,
  type KeywordMatchScope,
  type KeywordRuleItem,
} from '@keepxclean/shared';
import {
  formatCount,
  useI18n,
  type CloudCategoryKey,
} from '../../i18n';
import { digest } from '../../services/model';
import { validateKeyword } from '../../services/validation';
import { mutate, useApp } from '../../state/store';
import {
  Banner,
  Button,
  Confirm,
  Empty,
  Field,
  Modal,
  Page,
  Panel,
  perform,
  Pill,
  SearchBox,
  Segmented,
  Setting,
  Switch,
  Tabs,
  usePagination,
} from '../../ui/components';

export function KeywordEditor({
  item,
  customizeSource,
  initialPattern = '',
  onCustomized,
  onClose,
}: {
  item?: KeywordRuleItem;
  customizeSource?: KeywordRuleItem;
  initialPattern?: string;
  onCustomized?: (saved: KeywordRuleItem) => void;
  onClose: () => void;
}) {
  const { m, locale } = useI18n();
  const seed = customizeSource ?? item;
  const [draft, setDraft] = useState<KeywordRuleItem>(() =>
    customizeSource
      ? {
          ...structuredClone(customizeSource),
          id: crypto.randomUUID(),
          note:
            getCloudKeywordNote(customizeSource, locale) ||
            customizeSource.note,
          enabled: true,
        }
      : (item ?? {
          id: crypto.randomUUID(),
          pattern: initialPattern,
          isRegex: false,
          scopes: ['text', 'bio'],
          note: '',
          enabled: true,
        })
  );
  const [exempt, setExempt] = useState(
      seed ? !!seed.maxFollowersExempt : false
    ),
    [followers, setFollowers] = useState(
      String(seed?.maxFollowersExempt || 20000)
    ),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [initial] = useState(digest({ draft, exempt, followers }));
  const close = () => {
    if (digest({ draft, exempt, followers }) !== initial) setDiscard(true);
    else onClose();
  };
  async function save() {
    setPending(true);
    setError('');
    try {
      if (exempt && (!followers.trim() || Number(followers) <= 0))
        throw new Error(m.keywords.editor.exemptPositiveError);
      const { maxFollowersExempt: _unused, ...restDraft } = draft;
      const validated = validateKeyword({
        ...restDraft,
        ...(exempt ? { maxFollowersExempt: Number(followers) } : {}),
      });
      if (customizeSource) {
        await mutate({
          type: 'cloudKeyword.customize',
          sourceId: customizeSource.id,
          item: validated,
        });
        onCustomized?.(validated);
      } else {
        await mutate({
          type: 'keyword.save',
          item: validated,
          expected: item ? digest(item) : undefined,
        });
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const scopeEntries = Object.entries(m.keywords.scopes) as [
    KeywordMatchScope,
    string,
  ][];
  return (
    <>
      <Modal
        title={
          customizeSource
            ? m.keywords.editor.customizeTitle
            : item
              ? m.keywords.editor.editTitle
              : m.keywords.editor.addTitle
        }
        description={
          customizeSource
            ? m.keywords.editor.customizeDesc
            : m.keywords.editor.defaultDesc
        }
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
              {customizeSource
                ? m.keywords.editor.saveCustomizeBtn
                : item
                  ? m.keywords.editor.saveEditBtn
                  : m.keywords.editor.saveAddBtn}
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
          <Segmented
            label={m.keywords.editor.typeLabel}
            value={draft.isRegex ? 'regex' : 'text'}
            options={[
              { value: 'text', label: m.keywords.editor.typeText },
              { value: 'regex', label: m.keywords.editor.typeRegex },
            ]}
            onChange={(value) =>
              setDraft({ ...draft, isRegex: value === 'regex' })
            }
          />
          <Field
            label={
              draft.isRegex
                ? m.keywords.editor.regexFieldLabel
                : m.keywords.editor.textFieldLabel
            }
            help={
              draft.isRegex
                ? m.keywords.editor.regexHelp
                : m.keywords.editor.textHelp
            }
          >
            <input
              autoFocus
              className="input"
              value={draft.pattern}
              placeholder={
                draft.isRegex
                  ? m.keywords.editor.regexPlaceholder
                  : m.keywords.editor.textPlaceholder
              }
              onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
            />
          </Field>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">
              {m.keywords.editor.scopesLegend}
            </legend>
            <div className="row wrap">
              {scopeEntries.map(([scope, label]) => (
                <label className="check-label" key={scope}>
                  <input
                    type="checkbox"
                    checked={draft.scopes.includes(scope)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        scopes: e.target.checked
                          ? [...draft.scopes, scope]
                          : draft.scopes.filter((s) => s !== scope),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
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
          <Setting title={m.keywords.editor.enableItemTitle}>
            <Switch
              label={m.keywords.editor.enableItemTitle}
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

type EditorState =
  | { kind: 'new' }
  | { kind: 'edit'; item: KeywordRuleItem }
  | { kind: 'customize'; source: KeywordRuleItem }
  | null;

function getCloudCategory(
  item: KeywordRuleItem
): Exclude<CloudCategoryKey, 'all'> {
  if (item.id.startsWith('cloud-cliche-')) return 'cliche';
  if (
    item.id.startsWith('cloud-crypto-') ||
    item.id === 'cloud-scam-crypto-1' ||
    item.id === 'cloud-scam-rebate-1'
  ) {
    return 'crypto';
  }
  if (item.id.startsWith('cloud-follow-')) return 'follow';
  if (
    item.id.startsWith('cloud-nsfw-') ||
    item.id.startsWith('cloud-gambling-') ||
    item.id.startsWith('cloud-blackmarket-')
  ) {
    return 'nsfw_black';
  }
  return 'scam';
}

const cloudCategoryIds: CloudCategoryKey[] = [
  'all',
  'cliche',
  'crypto',
  'follow',
  'scam',
  'nsfw_black',
];

export function KeywordsPage() {
  const { data } = useApp();
  const { m, locale } = useI18n();
  const { config, snapshot } = data!;
  const [tab, setTab] = useState<'local' | 'cloud'>('local'),
    [cloudCategory, setCloudCategory] = useState<CloudCategoryKey>('all'),
    [query, setQuery] = useState(''),
    [editor, setEditor] = useState<EditorState>(null),
    [deleting, setDeleting] = useState<KeywordRuleItem | null>(null),
    [notice, setNotice] = useState('');
  const disabledCloudSet = new Set(config.disabledCloudKeywordIds);
  const upstreamCloudTotal = snapshot.cloudKeywords.filter(
    (k) => k.enabled
  ).length;
  const activeCloudCount = snapshot.cloudKeywords.filter(
    (k) => k.enabled && !disabledCloudSet.has(k.id)
  ).length;
  const disabledInSnapshotCount = upstreamCloudTotal - activeCloudCount;

  const cloudCategoryCounts: Record<CloudCategoryKey, number> = {
    all: snapshot.cloudKeywords.length,
    cliche: 0,
    crypto: 0,
    follow: 0,
    scam: 0,
    nsfw_black: 0,
  };
  for (const item of snapshot.cloudKeywords) {
    cloudCategoryCounts[getCloudCategory(item)]++;
  }

  const list = (
    tab === 'local'
      ? config.rules.keywords.items
      : snapshot.cloudKeywords.filter(
          (k) => cloudCategory === 'all' || getCloudCategory(k) === cloudCategory
        )
  ).filter((k) => {
    const note =
      tab === 'cloud' ? getCloudKeywordNote(k, locale) : (k.note ?? '');
    return `${k.pattern} ${note} ${k.note ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  const toggleableInList = list.filter((k) => k.enabled);
  const anyActiveInList = toggleableInList.some(
    (k) => !disabledCloudSet.has(k.id)
  );
  const page = usePagination(list, `${tab}:${cloudCategory}:${query}`);
  return (
    <Page
      title={m.keywords.pageTitle}
      description={m.keywords.pageDesc}
      action={
        tab === 'local' && (
          <Button variant="primary" onClick={() => setEditor({ kind: 'new' })}>
            <Plus size={16} />
            {m.keywords.addBtn}
          </Button>
        )
      }
    >
      {notice && (
        <Banner kind="success" onDismiss={() => setNotice('')}>
          {notice}
        </Banner>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          {
            value: 'local',
            label: m.keywords.tabLocal(config.rules.keywords.items.length),
          },
          {
            value: 'cloud',
            label:
              activeCloudCount === upstreamCloudTotal
                ? m.keywords.tabCloudAll(snapshot.cloudKeywords.length)
                : m.keywords.tabCloudPartial(
                    activeCloudCount,
                    upstreamCloudTotal
                  ),
          },
        ]}
      />
      <Panel>
        <Setting
          title={
            tab === 'local'
              ? m.keywords.enableLocalTitle
              : m.keywords.enableCloudTitle
          }
          description={
            tab === 'local'
              ? m.keywords.enableLocalDesc
              : m.keywords.enableCloudDesc
          }
        >
          <div className="row" style={{ gap: 10 }}>
            {tab === 'cloud' && disabledInSnapshotCount > 0 && (
              <Button
                variant="sm"
                onClick={() =>
                  perform({
                    type: 'config.patch',
                    patch: { disabledCloudKeywordIds: [] },
                  })
                }
              >
                <RotateCcw size={13} />
                {m.keywords.enableAllBtn}
              </Button>
            )}
            <Switch
              label={
                tab === 'local'
                  ? m.keywords.enableLocalTitle
                  : m.keywords.enableCloudTitle
              }
              checked={
                tab === 'local'
                  ? config.rules.keywords.enabled
                  : config.enableCloudKeywords
              }
              onChange={(enabled) =>
                perform({
                  type: 'config.patch',
                  patch:
                    tab === 'local'
                      ? { rules: { keywords: { enabled } } }
                      : { enableCloudKeywords: enabled },
                })
              }
            />
          </div>
        </Setting>
      </Panel>
      {tab === 'cloud' && (
        <div
          className="lang-grid"
          role="group"
          aria-label={m.keywords.categoryAria}
        >
          {cloudCategoryIds.map((catId) => {
            const selected = cloudCategory === catId;
            return (
              <button
                key={catId}
                type="button"
                className="lang-chip"
                aria-pressed={selected}
                onClick={() => setCloudCategory(catId)}
              >
                <span>{m.keywords.categories[catId]}</span>
                <span className="lang-code">{cloudCategoryCounts[catId]}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="row between wrap">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder={m.keywords.searchPlaceholder}
        />
        <div className="row" style={{ gap: 10 }}>
          {tab === 'cloud' &&
            cloudCategory !== 'all' &&
            toggleableInList.length > 0 && (
              <Button
                variant="ghost sm"
                onClick={() => {
                  const next = new Set(config.disabledCloudKeywordIds);
                  for (const item of toggleableInList) {
                    if (anyActiveInList) next.add(item.id);
                    else next.delete(item.id);
                  }
                  perform({
                    type: 'config.patch',
                    patch: { disabledCloudKeywordIds: [...next] },
                  });
                }}
              >
                {anyActiveInList
                  ? m.keywords.disableCategory
                  : m.keywords.enableCategory}
              </Button>
            )}
          <span className="small muted">
            {tab === 'local'
              ? m.keywords.localCount(list.length)
              : config.enableCloudKeywords
                ? m.keywords.cloudActiveCount(
                    activeCloudCount,
                    upstreamCloudTotal
                  )
                : m.keywords.cloudMasterOff(upstreamCloudTotal)}
          </span>
        </div>
      </div>
      <Panel className="table-panel">
        {list.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      {tab === 'cloud'
                        ? m.keywords.colCloudPack
                        : m.keywords.colPattern}
                    </th>
                    <th>{m.keywords.colScopes}</th>
                    <th>{m.keywords.colExempt}</th>
                    <th style={{ textAlign: 'right' }}>
                      {m.keywords.colActions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((k) => {
                    const cloudItemActive =
                      k.enabled && !disabledCloudSet.has(k.id);
                    const rowDimmed =
                      tab === 'local'
                        ? !k.enabled || !config.rules.keywords.enabled
                        : !cloudItemActive || !config.enableCloudKeywords;
                    const displayNote =
                      tab === 'cloud'
                        ? getCloudKeywordNote(k, locale)
                        : (k.note ?? '');
                    return (
                      <tr
                        key={k.id}
                        style={rowDimmed ? { opacity: 0.58 } : undefined}
                      >
                        <td>
                          {tab === 'cloud' && displayNote ? (
                            <div className="cell-main">
                              <div className="row">
                                <strong
                                  className="ellipsis"
                                  title={displayNote}
                                >
                                  {displayNote}
                                </strong>
                              </div>
                              <div className="row" style={{ gap: 6 }}>
                                {k.isRegex && (
                                  <Pill kind="neutral">
                                    {m.keywords.regexPill}
                                  </Pill>
                                )}
                                <span
                                  className="small muted ellipsis"
                                  title={k.pattern}
                                >
                                  {k.pattern}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="cell-main">
                              <div className="row">
                                <strong className="ellipsis" title={k.pattern}>
                                  {k.pattern}
                                </strong>
                                {k.isRegex && (
                                  <Pill kind="neutral">
                                    {m.keywords.regexPill}
                                  </Pill>
                                )}
                              </div>
                              <div
                                className="small muted ellipsis"
                                title={displayNote}
                              >
                                {displayNote || m.keywords.noNote}
                              </div>
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="row wrap" style={{ gap: 5 }}>
                            {k.scopes.map((scope) => (
                              <Pill key={scope} kind="neutral">
                                {m.keywords.scopes[scope]}
                              </Pill>
                            ))}
                            {k.onlyInReplies && (
                              <Pill>{m.keywords.onlyRepliesPill}</Pill>
                            )}
                          </div>
                        </td>
                        <td className="small muted">
                          {k.maxFollowersExempt
                            ? `≥ ${formatCount(k.maxFollowersExempt, locale)}`
                            : m.common.none}
                        </td>
                        <td>
                          <div className="table-actions">
                            {tab === 'local' ? (
                              <>
                                <Switch
                                  label={m.keywords.enableItemAria(k.pattern)}
                                  checked={k.enabled}
                                  onChange={(enabled) =>
                                    perform({
                                      type: 'keyword.save',
                                      item: { ...k, enabled },
                                      expected: digest(k),
                                    })
                                  }
                                />
                                <Button
                                  variant="ghost icon"
                                  aria-label={m.keywords.editItemAria(
                                    k.pattern
                                  )}
                                  onClick={() =>
                                    setEditor({ kind: 'edit', item: k })
                                  }
                                >
                                  <Pencil size={15} />
                                </Button>
                                <Button
                                  variant="ghost icon"
                                  aria-label={m.keywords.deleteItemAria(
                                    k.pattern
                                  )}
                                  onClick={() => setDeleting(k)}
                                >
                                  <Trash2 size={15} />
                                </Button>
                              </>
                            ) : k.enabled ? (
                              <>
                                <Button
                                  variant="ghost sm"
                                  title={m.keywords.customizeTooltip}
                                  aria-label={m.keywords.customizeAria(
                                    displayNote || k.pattern
                                  )}
                                  onClick={() =>
                                    setEditor({ kind: 'customize', source: k })
                                  }
                                >
                                  <Copy size={13} />
                                  {m.keywords.customizeBtn}
                                </Button>
                                <Switch
                                  label={m.keywords.enableCloudItemAria(
                                    displayNote || k.pattern
                                  )}
                                  checked={cloudItemActive}
                                  onChange={(enabled) =>
                                    perform({
                                      type: 'cloudKeyword.toggle',
                                      id: k.id,
                                      enabled,
                                    })
                                  }
                                />
                              </>
                            ) : (
                              <Pill kind="neutral">
                                {m.keywords.upstreamPaused}
                              </Pill>
                            )}
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
              query ? m.keywords.emptySearchTitle : m.keywords.emptyInitTitle
            }
            description={
              query ? m.keywords.emptySearchDesc : m.keywords.emptyInitDesc
            }
          />
        )}
      </Panel>
      {editor && (
        <KeywordEditor
          item={editor.kind === 'edit' ? editor.item : undefined}
          customizeSource={
            editor.kind === 'customize' ? editor.source : undefined
          }
          onCustomized={(saved) => {
            setTab('local');
            setQuery('');
            setNotice(
              m.keywords.customizedNotice(saved.note || saved.pattern)
            );
          }}
          onClose={() => setEditor(null)}
        />
      )}
      {deleting && (
        <Confirm
          title={m.keywords.deleteConfirmTitle}
          actionLabel={m.keywords.deleteConfirmBtn}
          danger
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            mutate({
              type: 'keyword.delete',
              id: deleting.id,
              expected: digest(deleting),
            })
          }
        >
          <p className="break">{deleting.pattern}</p>
        </Confirm>
      )}
    </Page>
  );
}
