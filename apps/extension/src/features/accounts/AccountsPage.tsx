import { useState } from 'react';
import {
  ArrowUpRight,
  Download,
  Plus,
  Trash2,
  UserRoundCheck,
} from 'lucide-react';
import {
  getBlockReasonLabels,
  type AccountListEntry,
  type BlockReasonTag,
} from '@keepxclean/shared';
import { formatCount, formatDateTime, useI18n } from '../../i18n';
import { command } from '../../services/client';
import type { ResolvedAccount } from '../../services/model';
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
  ReloadXButton,
  SearchBox,
  Tabs,
  usePagination,
} from '../../ui/components';
import { ImportWizard } from './ImportWizard';

export function accountProfileUrl(uid: string, screenName?: string) {
  return screenName
    ? `https://x.com/${encodeURIComponent(screenName)}`
    : `https://x.com/i/user/${encodeURIComponent(uid)}`;
}

function AccountEditor({
  list,
  onClose,
  onSaved,
}: {
  list: 'black' | 'white';
  onClose: () => void;
  onSaved: (entry: AccountListEntry) => void;
}) {
  const { m, locale } = useI18n();
  const reasonLabels = getBlockReasonLabels(locale);
  const [query, setQuery] = useState(''),
    [name, setName] = useState(''),
    [reason, setReason] = useState(''),
    [tag, setTag] = useState<BlockReasonTag>('other'),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);

  async function save() {
    setError('');
    setPending(true);
    try {
      const resolved = await command<ResolvedAccount>({
        type: 'account.resolve',
        query,
      });
      const entry = validateAccount({
        uid: resolved.uid,
        screenName: resolved.screenName,
        name: name.trim() || resolved.name || undefined,
        avatarUrl: resolved.avatarUrl,
        reason: reason.trim() || undefined,
        ...(list === 'black' ? { tag } : {}),
        addedAt: Date.now(),
      });
      await mutate({ type: 'account.save', list, entry });
      onSaved(entry);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      title={
        list === 'white'
          ? m.accounts.editor.titleWhite
          : m.accounts.editor.titleBlack
      }
      description={m.accounts.editor.desc}
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
            disabled={!query.trim()}
            onClick={() => void save()}
          >
            {pending
              ? m.accounts.editor.resolvingBtn
              : m.accounts.editor.confirmBtn}
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
          label={m.accounts.editor.queryLabel}
          help={m.accounts.editor.queryHelp}
        >
          <input
            autoFocus
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.accounts.editor.queryPlaceholder}
          />
        </Field>
        {list === 'black' && (
          <div>
            <span className="field-label">
              {m.accounts.editor.categoryLabel}
            </span>
            <div className="reason-options" style={{ marginTop: 0 }}>
              {Object.entries(reasonLabels).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tag === k}
                  onClick={() => setTag(k as BlockReasonTag)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="detail-grid">
          <Field label={m.accounts.editor.displayNameLabel}>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={m.accounts.editor.displayNamePlaceholder}
            />
          </Field>
          <Field label={m.accounts.editor.noteLabel}>
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={m.accounts.editor.notePlaceholder}
            />
          </Field>
        </div>
        <Banner>
          {list === 'white'
            ? m.accounts.editor.bannerWhite
            : m.accounts.editor.bannerBlack}
        </Banner>
        {error && <Banner kind="error">{error}</Banner>}
      </form>
    </Modal>
  );
}

export function AccountsPage() {
  const { data } = useApp();
  const { m, locale } = useI18n();
  const { config, snapshot, imports, logs } = data!;
  const reasonLabels = getBlockReasonLabels(locale);
  const [tab, setTab] = useState<'black' | 'white' | 'community'>('black'),
    [query, setQuery] = useState(''),
    [editor, setEditor] = useState(false),
    [wizard, setWizard] = useState<string | null>(null),
    [removing, setRemoving] = useState<AccountListEntry | null>(null),
    [whitelisting, setWhitelisting] = useState<AccountListEntry | null>(null),
    [notice, setNotice] = useState('');

  const knownMeta = new Map<string, { screenName: string; name?: string }>();
  for (const log of logs) {
    if (log.authorUid && (log.authorScreenName || log.authorName)) {
      knownMeta.set(log.authorUid, {
        screenName: log.authorScreenName,
        name: log.authorName || undefined,
      });
    }
  }
  for (const item of [
    ...Object.values(config.localBlocklistUids),
    ...Object.values(config.whitelistUids),
  ]) {
    if (item.screenName || item.name) {
      knownMeta.set(item.uid, {
        screenName: item.screenName,
        name: item.name,
      });
    }
  }

  const local =
    tab === 'white' ? config.whitelistUids : config.localBlocklistUids;
  const rows: (AccountListEntry & { count?: number; protected?: boolean })[] =
    tab === 'community'
      ? Object.entries(snapshot.counts)
          .map(([uid, entry]) => {
            const meta = knownMeta.get(uid);
            return {
              uid,
              screenName: meta?.screenName ?? '',
              name: meta?.name,
              addedAt: 0,
              count: entry.c,
              tag: entry.t,
              protected: entry.p,
            };
          })
          .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      : Object.values(local)
          .map((x) => {
            if (x.screenName || x.name) return x;
            const meta = knownMeta.get(x.uid);
            return meta
              ? { ...x, screenName: meta.screenName, name: meta.name }
              : x;
          })
          .sort((a, b) => b.addedAt - a.addedAt);

  const filtered = rows.filter((x) =>
    `${x.uid} ${x.screenName} ${x.name ?? ''} ${x.reason ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const page = usePagination(filtered, tab + query);

  return (
    <Page
      title={m.accounts.pageTitle}
      description={m.accounts.pageDesc}
      action={
        <div className="row">
          <Button onClick={() => setWizard('new')}>
            <Download size={15} />
            {m.accounts.importFromXBtn}
          </Button>
          {tab !== 'community' && (
            <Button variant="primary" onClick={() => setEditor(true)}>
              <Plus size={15} />
              {m.accounts.addAccountBtn}
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
            label: m.accounts.tabBlack(
              Object.keys(config.localBlocklistUids).length
            ),
          },
          {
            value: 'white',
            label: m.accounts.tabWhite(
              Object.keys(config.whitelistUids).length
            ),
          },
          {
            value: 'community',
            label: m.accounts.tabCommunity(Object.keys(snapshot.counts).length),
          },
        ]}
      />
      {notice && (
        <Banner
          kind="success"
          action={<ReloadXButton />}
          onDismiss={() => setNotice('')}
        >
          {notice}
        </Banner>
      )}
      <Banner>
        {tab === 'white'
          ? m.accounts.bannerWhite
          : tab === 'community'
            ? m.accounts.bannerCommunity
            : m.accounts.bannerBlack}
      </Banner>
      <div className="row between wrap">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder={m.accounts.searchPlaceholder}
        />
        <span className="small muted">
          {m.accounts.accountCount(formatCount(filtered.length, locale))}
          {tab === 'community'
            ? m.accounts.snapshotGeneratedAt(
                formatDateTime(
                  snapshot.updatedAt,
                  locale,
                  m.common.neverSynced
                )
              )
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
                    <th>{m.accounts.colAccount}</th>
                    <th>
                      {tab === 'community'
                        ? m.accounts.colCommunityVotes
                        : m.accounts.colAddedAt}
                    </th>
                    <th>{m.accounts.colCategoryNote}</th>
                    <th style={{ textAlign: 'right' }}>
                      {m.accounts.colActions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((entry) => {
                    const inWhite = Boolean(config.whitelistUids[entry.uid]);
                    return (
                      <tr key={entry.uid}>
                        <td>
                          <div className="row">
                            <span className="avatar">
                              {entry.name?.slice(0, 1) ||
                                entry.screenName?.slice(0, 1).toUpperCase() ||
                                '#'}
                            </span>
                            <div className="cell-main">
                              <a
                                className="account-link"
                                href={accountProfileUrl(
                                  entry.uid,
                                  entry.screenName
                                )}
                                target="_blank"
                                rel="noreferrer"
                                title={m.accounts.openProfileTooltip}
                              >
                                <span className="ellipsis">
                                  {entry.name ||
                                    (entry.screenName
                                      ? `@${entry.screenName}`
                                      : `UID ${entry.uid}`)}
                                </span>
                                <ArrowUpRight size={13} />
                              </a>
                              <p className="small muted mono">
                                {entry.screenName
                                  ? `@${entry.screenName} · ${entry.uid}`
                                  : `UID ${entry.uid}`}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td>
                          {tab === 'community' ? (
                            <strong>
                              {m.accounts.votesCount(entry.count ?? 0)}
                            </strong>
                          ) : (
                            <span className="small muted">
                              {formatDateTime(
                                entry.addedAt,
                                locale,
                                m.common.neverSynced
                              )}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="row wrap" style={{ gap: 6 }}>
                            {entry.tag && (
                              <Pill kind="neutral">
                                {reasonLabels[entry.tag]}
                              </Pill>
                            )}
                            {entry.protected && (
                              <Pill>{m.accounts.highFollowerShieldPill}</Pill>
                            )}
                            {entry.reason && (
                              <span className="small muted">{entry.reason}</span>
                            )}
                            {!entry.tag && !entry.reason && (
                              <span className="small muted">
                                {m.accounts.manualAdded}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="table-actions">
                            {tab === 'community' ? (
                              inWhite ? (
                                <Pill>{m.accounts.inWhitelistPill}</Pill>
                              ) : (
                                <Button
                                  variant="ghost sm"
                                  aria-label={m.quick.whitelistAria(entry.uid)}
                                  onClick={() => setWhitelisting(entry)}
                                >
                                  <UserRoundCheck size={14} />
                                  {m.accounts.exemptBtn}
                                </Button>
                              )
                            ) : (
                              <>
                                {tab === 'black' && (
                                  <Button
                                    variant="ghost sm"
                                    aria-label={m.quick.whitelistAria(
                                      entry.uid
                                    )}
                                    title={m.accounts.moveToWhiteTooltip}
                                    onClick={() => setWhitelisting(entry)}
                                  >
                                    <UserRoundCheck size={14} />
                                    {m.accounts.moveToWhiteBtn}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost icon"
                                  aria-label={m.accounts.removeAria(entry.uid)}
                                  title={m.accounts.removeTooltip}
                                  onClick={() => setRemoving(entry)}
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </>
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
              query
                ? m.accounts.emptySearchTitle
                : tab === 'white'
                  ? m.accounts.emptyWhiteTitle
                  : tab === 'community'
                    ? m.accounts.emptyCommunityTitle
                    : m.accounts.emptyBlackTitle
            }
            description={
              query
                ? m.accounts.emptySearchDesc
                : tab === 'white'
                  ? m.accounts.emptyWhiteDesc
                  : tab === 'community'
                    ? m.accounts.emptyCommunityDesc
                    : m.accounts.emptyBlackDesc
            }
          />
        )}
      </Panel>
      {imports.length > 0 && (
        <Panel title={m.accounts.recentImportsTitle}>
          <div className="stack-sm">
            {imports.slice(0, 5).map((job) => (
              <div className="row between" key={job.id}>
                <div>
                  <strong className="small">
                    {formatDateTime(
                      job.createdAt,
                      locale,
                      m.common.neverSynced
                    )}
                  </strong>
                  <p className="small muted">
                    {m.accounts.importSummary(
                      job.localAdded,
                      m.accounts.importStatuses[job.status]
                    )}
                  </p>
                </div>
                <Button onClick={() => setWizard(job.id)}>
                  {m.accounts.viewResultBtn}
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {editor && tab !== 'community' && (
        <AccountEditor
          list={tab}
          onClose={() => setEditor(false)}
          onSaved={(saved) =>
            setNotice(
              m.accounts.addedNotice(
                saved.screenName ? `@${saved.screenName}` : `UID ${saved.uid}`,
                tab === 'white'
              )
            )
          }
        />
      )}
      {wizard && (
        <ImportWizard
          initialJobId={wizard === 'new' ? undefined : wizard}
          onClose={() => setWizard(null)}
        />
      )}
      {removing && (
        <Confirm
          title={m.accounts.removeConfirmTitle}
          danger
          actionLabel={m.accounts.removeConfirmBtn}
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
            {m.accounts.removeConfirmBody(
              removing.screenName
                ? `@${removing.screenName} (UID ${removing.uid})`
                : `UID ${removing.uid}`
            )}
          </p>
        </Confirm>
      )}
      {whitelisting && (
        <Confirm
          title={m.accounts.whitelistConfirmTitle}
          actionLabel={m.accounts.whitelistConfirmBtn}
          onClose={() => setWhitelisting(null)}
          onConfirm={async () => {
            await mutate({
              type: 'account.save',
              list: 'white',
              entry: { ...whitelisting, addedAt: Date.now() },
            });
            setNotice(
              m.accounts.addedNotice(
                whitelisting.screenName
                  ? `@${whitelisting.screenName}`
                  : `UID ${whitelisting.uid}`,
                true
              )
            );
          }}
        >
          <p>{m.accounts.whitelistConfirmBody}</p>
        </Confirm>
      )}
    </Page>
  );
}
