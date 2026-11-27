import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  CLOUD_KEYWORD_LANG_GROUPS,
  getCloudKeywordNote,
  resolveEnabledCloudLangGroups,
  type CloudKeywordLangGroup,
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
import {
  parseHashQuery,
  useFocusHighlight,
  useHash,
} from '../../ui/useHashQuery';
import { DomainsTab } from './DomainsTab';
import { PacksTab } from './PacksTab';

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

export function getCloudCategory(
  item: KeywordRuleItem
): Exclude<CloudCategoryKey, 'all'> {
  const rawCategory = item.packCategory?.trim().toLowerCase();
  if (rawCategory === 'cliche') return 'cliche';
  if (rawCategory === 'crypto') return 'crypto';
  if (rawCategory === 'follow') return 'follow';
  if (
    rawCategory === 'nsfw' ||
    rawCategory === 'nsfw_black' ||
    rawCategory === 'gambling' ||
    rawCategory === 'blackmarket'
  ) {
    return 'nsfw_black';
  }
  if (rawCategory === 'scam') {
    if (
      item.id.startsWith('cloud-gambling-') ||
      item.id.startsWith('cloud-blackmarket-')
    ) {
      return 'nsfw_black';
    }
    return 'scam';
  }
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

type KeywordsTabId = 'custom' | 'cloud' | 'domains' | 'packs';

function parseTabParam(raw: string | null): KeywordsTabId | null {
  if (raw === 'custom' || raw === 'local') return 'custom';
  if (raw === 'cloud' || raw === 'domains' || raw === 'packs') return raw;
  return null;
}

export function KeywordsPage() {
  const { data } = useApp();
  const { m, locale } = useI18n();
  const { config, snapshot } = data!;

  const hash = useHash();
  const hashQuery = useMemo(() => parseHashQuery(hash), [hash]);
  const tabParam = parseTabParam(hashQuery.get('tab'));
  const focusParam = hashQuery.get('focus');
  const packParam = hashQuery.get('pack');

  const [tab, setTab] = useState<KeywordsTabId>(tabParam ?? 'custom'),
    [deepLinkDismissedHash, setDeepLinkDismissedHash] = useState<string | null>(
      null
    ),
    [cloudCategory, setCloudCategory] = useState<CloudCategoryKey>('all'),
    [query, setQuery] = useState(''),
    [editor, setEditor] = useState<EditorState>(null),
    [domainEditorOpen, setDomainEditorOpen] = useState(false),
    [deleting, setDeleting] = useState<KeywordRuleItem | null>(null),
    [notice, setNotice] = useState(''),
    [expandedGroups, setExpandedGroups] = useState<
      Partial<Record<CloudKeywordLangGroup, boolean>>
    >({ universal: true });

  const handledCustomFilterNavRef = useRef<string | null>(null);
  const handledCustomPageNavRef = useRef<string | null>(null);
  const handledCloudNavRef = useRef<string | null>(null);

  useEffect(() => {
    if (tabParam) {
      setTab(tabParam);
    }
  }, [hash, tabParam]);

  const isDeepLinkActive = deepLinkDismissedHash !== hash;
  const tabMatchesDeepLink =
    isDeepLinkActive && (tabParam === null || tab === tabParam);
  const activeCustomFocus =
    tabMatchesDeepLink && tab === 'custom' ? focusParam : null;
  const activeCloudFocus =
    tabMatchesDeepLink && tab === 'cloud' ? focusParam : null;
  const activeDomainsFocus =
    tabMatchesDeepLink && tab === 'domains' ? focusParam : null;
  const activePacksFocus =
    tabMatchesDeepLink && tab === 'packs' ? focusParam : null;
  const activePackParam =
    tabMatchesDeepLink && tab === 'packs' ? packParam : null;

  const disabledCloudSet = new Set(config.disabledCloudKeywordIds);
  const enabledLangGroups = resolveEnabledCloudLangGroups(config);
  const enabledLangGroupSet = new Set(enabledLangGroups);
  const hasCustomLangGroups = config.enabledCloudLangGroups !== undefined;

  const upstreamCloudTotal = snapshot.cloudKeywords.filter(
    (k) => k.enabled
  ).length;
  const activeCloudCount = snapshot.cloudKeywords.filter(
    (k) =>
      k.enabled &&
      !disabledCloudSet.has(k.id) &&
      enabledLangGroupSet.has(k.langGroup ?? 'universal')
  ).length;

  useEffect(() => {
    if (!activeCustomFocus) {
      handledCustomFilterNavRef.current = null;
      return;
    }
    const navToken = `${hash}\0custom\0${activeCustomFocus}`;
    if (handledCustomFilterNavRef.current === navToken) return;
    handledCustomFilterNavRef.current = navToken;
    if (config.rules.keywords.items.some((k) => k.id === activeCustomFocus)) {
      setQuery('');
    }
  }, [hash, activeCustomFocus, config.rules.keywords.items]);

  useEffect(() => {
    if (!activeCloudFocus) {
      handledCloudNavRef.current = null;
      return;
    }
    const navToken = `${hash}\0cloud\0${activeCloudFocus}`;
    if (handledCloudNavRef.current === navToken) return;
    handledCloudNavRef.current = navToken;
    const target = snapshot.cloudKeywords.find(
      (k) => k.id === activeCloudFocus
    );
    if (target) {
      setQuery('');
      setCloudCategory('all');
      const grp = target.langGroup ?? 'universal';
      setExpandedGroups((prev) =>
        prev[grp] ? prev : { ...prev, [grp]: true }
      );
    }
  }, [hash, activeCloudFocus, snapshot.cloudKeywords]);

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

  const customFiltered = config.rules.keywords.items.filter((k) =>
    `${k.pattern} ${k.note ?? ''}`.toLowerCase().includes(query.toLowerCase())
  );
  const customPage = usePagination(customFiltered, `custom:${query}`);
  const { setPage: setCustomPage, pageSize: customPageSize } = customPage;

  useEffect(() => {
    if (!activeCustomFocus) {
      handledCustomPageNavRef.current = null;
      return;
    }
    const navToken = `${hash}\0custom\0${activeCustomFocus}`;
    if (handledCustomPageNavRef.current === navToken) return;
    if (!config.rules.keywords.items.some((k) => k.id === activeCustomFocus)) {
      handledCustomPageNavRef.current = navToken;
      return;
    }
    if (query !== '') return;
    const idx = customFiltered.findIndex((k) => k.id === activeCustomFocus);
    if (idx < 0) return;
    handledCustomPageNavRef.current = navToken;
    const targetPage = Math.floor(idx / customPageSize) + 1;
    setCustomPage(targetPage);
  }, [
    hash,
    activeCustomFocus,
    query,
    config.rules.keywords.items,
    customFiltered,
    customPageSize,
    setCustomPage,
  ]);

  const cloudFiltered = snapshot.cloudKeywords
    .filter(
      (k) => cloudCategory === 'all' || getCloudCategory(k) === cloudCategory
    )
    .filter((k) => {
      const note = getCloudKeywordNote(k, locale);
      return `${k.pattern} ${note} ${k.note ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase());
    });

  const toggleableInCloudList = cloudFiltered.filter((k) => k.enabled);
  const anyActiveInCloudList = toggleableInCloudList.some(
    (k) => !disabledCloudSet.has(k.id)
  );

  const pageFocusId = activeCustomFocus ?? activeCloudFocus;
  const focusedCloudItem = activeCloudFocus
    ? snapshot.cloudKeywords.find((k) => k.id === activeCloudFocus)
    : undefined;
  const focusedCloudGroup = focusedCloudItem
    ? (focusedCloudItem.langGroup ?? 'universal')
    : null;
  const cloudTargetOpen = focusedCloudGroup
    ? Boolean(query.trim()) ||
      cloudCategory !== 'all' ||
      Boolean(expandedGroups[focusedCloudGroup])
    : false;

  const focusReady =
    tab === 'custom'
      ? !activeCustomFocus ||
        (query === '' &&
          customPage.items.some((k) => k.id === activeCustomFocus))
      : tab === 'cloud'
        ? !activeCloudFocus ||
          Boolean(
            focusedCloudItem &&
              query === '' &&
              cloudCategory === 'all' &&
              cloudTargetOpen &&
              cloudFiltered.some((k) => k.id === focusedCloudItem.id)
          )
        : false;

  const activeFocusId = useFocusHighlight(pageFocusId, {
    ready: focusReady,
    triggerKey: hash,
  });

  const installedPacksCount = config.installedPacks?.length ?? 0;

  return (
    <Page
      title={m.keywords.pageTitle}
      description={m.keywords.pageDesc}
      action={
        tab === 'custom' ? (
          <Button variant="primary" onClick={() => setEditor({ kind: 'new' })}>
            <Plus size={16} />
            {m.keywords.addBtn}
          </Button>
        ) : tab === 'domains' ? (
          <Button variant="primary" onClick={() => setDomainEditorOpen(true)}>
            <Plus size={16} />
            {m.keywords.domains.addBtn}
          </Button>
        ) : undefined
      }
    >
      {notice && (
        <Banner kind="success" onDismiss={() => setNotice('')}>
          {notice}
        </Banner>
      )}
      <Tabs<KeywordsTabId>
        value={tab}
        onChange={(nextTab) => {
          if (nextTab !== tab) {
            setTab(nextTab);
            setDeepLinkDismissedHash(hash);
          }
        }}
        options={[
          {
            value: 'custom',
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
          {
            value: 'domains',
            label: m.keywords.tabDomains(config.rules.domainFilter.items.length),
          },
          {
            value: 'packs',
            label: m.keywords.tabPacks(installedPacksCount),
          },
        ]}
      />

      {tab === 'domains' ? (
        <DomainsTab
          focusId={activeDomainsFocus}
          focusNavKey={hash}
          editorOpen={domainEditorOpen}
          onCloseEditor={() => setDomainEditorOpen(false)}
        />
      ) : tab === 'packs' ? (
        <PacksTab
          packParam={activePackParam}
          focusId={activePacksFocus}
          focusNavKey={hash}
          onNotice={setNotice}
        />
      ) : tab === 'custom' ? (
        <>
          <Panel>
            <Setting
              title={m.keywords.enableLocalTitle}
              description={m.keywords.enableLocalDesc}
            >
              <Switch
                label={m.keywords.enableLocalTitle}
                checked={config.rules.keywords.enabled}
                onChange={(enabled) =>
                  perform({
                    type: 'config.patch',
                    patch: { rules: { keywords: { enabled } } },
                  })
                }
              />
            </Setting>
          </Panel>
          <div className="row between wrap">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder={m.keywords.searchPlaceholder}
            />
            <span className="small muted">
              {m.keywords.localCount(customFiltered.length)}
            </span>
          </div>
          <Panel className="table-panel">
            {customFiltered.length ? (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{m.keywords.colPattern}</th>
                        <th>{m.keywords.colScopes}</th>
                        <th>{m.keywords.colExempt}</th>
                        <th style={{ textAlign: 'right' }}>
                          {m.keywords.colActions}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {customPage.items.map((k) => {
                        const rowDimmed =
                          !k.enabled || !config.rules.keywords.enabled;
                        const isFocused = activeFocusId === k.id;
                        return (
                          <tr
                            key={k.id}
                            data-item-id={k.id}
                            data-focus-id={k.id}
                            data-focused={isFocused ? 'true' : undefined}
                            className={
                              isFocused ? 'focus-highlight' : undefined
                            }
                            style={rowDimmed ? { opacity: 0.58 } : undefined}
                          >
                            <td>
                              <div className="cell-main">
                                <div className="row">
                                  <strong
                                    className="ellipsis"
                                    title={k.pattern}
                                  >
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
                                  title={k.note ?? ''}
                                >
                                  {k.note || m.keywords.noNote}
                                </div>
                              </div>
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
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {customPage.control}
              </>
            ) : (
              <Empty
                title={
                  query
                    ? m.keywords.emptySearchTitle
                    : m.keywords.emptyInitTitle
                }
                description={
                  query ? m.keywords.emptySearchDesc : m.keywords.emptyInitDesc
                }
              />
            )}
          </Panel>
        </>
      ) : (
        <>
          <Panel>
            <Setting
              title={m.keywords.enableCloudTitle}
              description={m.keywords.enableCloudDesc}
            >
              <div className="row wrap" style={{ gap: 8 }}>
                {hasCustomLangGroups && (
                  <Button
                    variant="sm"
                    onClick={() => {
                      const { enabledCloudLangGroups: _removed, ...restConfig } =
                        config;
                      perform({
                        type: 'config.replace',
                        config: restConfig,
                        expected: digest(config),
                      });
                    }}
                  >
                    <RotateCcw size={13} />
                    {m.keywords.resetLangGroupsBtn}
                  </Button>
                )}
                {config.disabledCloudKeywordIds.length > 0 && (
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
                  label={m.keywords.enableCloudTitle}
                  checked={config.enableCloudKeywords}
                  onChange={(enabled) =>
                    perform({
                      type: 'config.patch',
                      patch: { enableCloudKeywords: enabled },
                    })
                  }
                />
              </div>
            </Setting>
          </Panel>

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
                  <span className="lang-code">
                    {cloudCategoryCounts[catId]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="row between wrap">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder={m.keywords.searchPlaceholder}
            />
            <div className="row" style={{ gap: 10 }}>
              {cloudCategory !== 'all' && toggleableInCloudList.length > 0 && (
                <Button
                  variant="ghost sm"
                  onClick={() => {
                    const next = new Set(config.disabledCloudKeywordIds);
                    for (const item of toggleableInCloudList) {
                      if (anyActiveInCloudList) next.add(item.id);
                      else next.delete(item.id);
                    }
                    perform({
                      type: 'config.patch',
                      patch: { disabledCloudKeywordIds: [...next] },
                    });
                  }}
                >
                  {anyActiveInCloudList
                    ? m.keywords.disableCategory
                    : m.keywords.enableCategory}
                </Button>
              )}
              <span className="small muted">
                {config.enableCloudKeywords
                  ? m.keywords.cloudActiveCount(
                      activeCloudCount,
                      upstreamCloudTotal
                    )
                  : m.keywords.cloudMasterOff(upstreamCloudTotal)}
              </span>
            </div>
          </div>

          <div className="row between wrap">
            <h3>{m.keywords.langGroupsHeading}</h3>
            <span className="small muted">{m.keywords.langGroupsHint}</span>
          </div>

          {cloudFiltered.length ? (
            <div className="stack">
              {CLOUD_KEYWORD_LANG_GROUPS.map((group) => {
                const groupAllItems = snapshot.cloudKeywords.filter(
                  (k) => (k.langGroup ?? 'universal') === group
                );
                const groupVisibleItems = cloudFiltered.filter(
                  (k) => (k.langGroup ?? 'universal') === group
                );
                if (
                  groupAllItems.length === 0 ||
                  ((query.trim() || cloudCategory !== 'all') &&
                    groupVisibleItems.length === 0)
                ) {
                  return null;
                }
                const groupEnabled = enabledLangGroupSet.has(group);
                const groupLabel = m.keywords.langGroups[group];
                const groupTotalEnabled = groupAllItems.filter(
                  (k) => k.enabled
                ).length;
                const groupActiveCount = groupEnabled
                  ? groupAllItems.filter(
                      (k) => k.enabled && !disabledCloudSet.has(k.id)
                    ).length
                  : 0;
                const isOpen =
                  Boolean(query.trim()) ||
                  cloudCategory !== 'all' ||
                  Boolean(expandedGroups[group]);

                return (
                  <section
                    key={group}
                    className="lang-group-card"
                    data-lang-group={group}
                    style={
                      !groupEnabled || !config.enableCloudKeywords
                        ? { opacity: 0.72 }
                        : undefined
                    }
                  >
                    <div className="lang-group-header">
                      <button
                        type="button"
                        className="lang-group-trigger"
                        aria-expanded={isOpen}
                        aria-label={m.keywords.langGroupExpandAria(
                          isOpen,
                          groupLabel
                        )}
                        onClick={() =>
                          setExpandedGroups((prev) => ({
                            ...prev,
                            [group]: !isOpen,
                          }))
                        }
                      >
                        {isOpen ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                        <strong>{groupLabel}</strong>
                        <Pill kind={groupEnabled ? '' : 'neutral'}>
                          {m.keywords.langGroupCount(
                            groupActiveCount,
                            groupTotalEnabled
                          )}
                        </Pill>
                      </button>
                      <Switch
                        label={m.keywords.langGroupToggleAria(groupLabel)}
                        checked={groupEnabled}
                        onChange={(enabled) =>
                          perform({
                            type: 'cloudLangGroup.toggle',
                            group,
                            enabled,
                          })
                        }
                      />
                    </div>
                    {isOpen && groupVisibleItems.length > 0 && (
                      <div className="lang-group-body table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>{m.keywords.colCloudPack}</th>
                              <th>{m.keywords.colScopes}</th>
                              <th>{m.keywords.colExempt}</th>
                              <th style={{ textAlign: 'right' }}>
                                {m.keywords.colActions}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupVisibleItems.map((k) => {
                              const cloudItemActive =
                                k.enabled && !disabledCloudSet.has(k.id);
                              const rowDimmed =
                                !cloudItemActive ||
                                !groupEnabled ||
                                !config.enableCloudKeywords;
                              const displayNote = getCloudKeywordNote(
                                k,
                                locale
                              );
                              const isFocused = activeFocusId === k.id;
                              return (
                                <tr
                                  key={k.id}
                                  data-item-id={k.id}
                                  data-focus-id={k.id}
                                  data-focused={isFocused ? 'true' : undefined}
                                  className={
                                    isFocused ? 'focus-highlight' : undefined
                                  }
                                  style={
                                    rowDimmed ? { opacity: 0.58 } : undefined
                                  }
                                >
                                  <td>
                                    {displayNote ? (
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
                                          <strong
                                            className="ellipsis"
                                            title={k.pattern}
                                          >
                                            {k.pattern}
                                          </strong>
                                          {k.isRegex && (
                                            <Pill kind="neutral">
                                              {m.keywords.regexPill}
                                            </Pill>
                                          )}
                                        </div>
                                        <div className="small muted">
                                          {m.keywords.noNote}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <div
                                      className="row wrap"
                                      style={{ gap: 5 }}
                                    >
                                      {k.scopes.map((scope) => (
                                        <Pill key={scope} kind="neutral">
                                          {m.keywords.scopes[scope]}
                                        </Pill>
                                      ))}
                                      {k.onlyInReplies && (
                                        <Pill>
                                          {m.keywords.onlyRepliesPill}
                                        </Pill>
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
                                      {k.enabled ? (
                                        <>
                                          <Button
                                            variant="ghost sm"
                                            title={m.keywords.customizeTooltip}
                                            aria-label={m.keywords.customizeAria(
                                              displayNote || k.pattern
                                            )}
                                            onClick={() =>
                                              setEditor({
                                                kind: 'customize',
                                                source: k,
                                              })
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
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <Panel>
              <Empty
                title={m.keywords.emptySearchTitle}
                description={m.keywords.emptySearchDesc}
              />
            </Panel>
          )}
        </>
      )}

      {editor && (
        <KeywordEditor
          item={editor.kind === 'edit' ? editor.item : undefined}
          customizeSource={
            editor.kind === 'customize' ? editor.source : undefined
          }
          onCustomized={(saved) => {
            setTab('custom');
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
