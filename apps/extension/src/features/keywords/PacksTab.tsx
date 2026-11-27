import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Package,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  MAX_RULE_PACK_BYTES,
  RULE_PACK_FORMAT,
  UI_LOCALE_OPTIONS,
  serializeRulePack,
  validateRulePack,
  type InstalledRulePack,
  type RulePackPayload,
  type SupportedLocale,
} from '@keepxclean/shared';
import { useI18n } from '../../i18n';
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
  Switch,
} from '../../ui/components';
import { useFocusHighlight } from '../../ui/useHashQuery';
import { copyTextWithFallback } from '../quick-controls/ParseHealthBanner';

function downloadTextFile(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugifyPackId(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-+$/, '')
    .slice(0, 60);
  return cleaned || `pack-${Date.now().toString(36)}`;
}

function packItemFocusId(packId: string, itemId: string): string {
  return `${packId}:${itemId}`;
}

function packHasItem(pack: InstalledRulePack, itemId: string): boolean {
  return Boolean(
    pack.keywords?.some((k) => k.id === itemId) ||
      pack.domains?.some((d) => d.id === itemId) ||
      pack.blockedUids?.some((u) => u.uid === itemId)
  );
}

function PackImportModal({
  onInstalled,
  onClose,
}: {
  onInstalled: (name: string) => void;
  onClose: () => void;
}) {
  const { data } = useApp();
  const { m } = useI18n();
  const { config } = data!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<RulePackPayload | null>(null);
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState(false);

  function parseAndValidate(text: string) {
    setError('');
    setPreview(null);
    if (!text.trim()) return;
    const byteLen = new TextEncoder().encode(text).byteLength;
    if (byteLen > MAX_RULE_PACK_BYTES) {
      setError(m.keywords.packs.importModal.fileTooLargeError);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const validated = validateRulePack(parsed);
      setPreview(validated);
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? m.keywords.packs.importModal.invalidJsonError
          : (e as Error).message
      );
    }
  }

  const existingPack = preview
    ? (config.installedPacks ?? []).find((p) => p.id === preview.id)
    : undefined;
  const whitelistConflictCount = preview?.blockedUids
    ? preview.blockedUids.filter((u) => Boolean(config.whitelistUids[u.uid]))
        .length
    : 0;

  async function install() {
    if (!preview) return;
    setInstalling(true);
    setError('');
    try {
      await mutate({ type: 'pack.install', pack: preview });
      onInstalled(preview.name);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Modal
      title={m.keywords.packs.importModal.title}
      description={m.keywords.packs.importModal.desc}
      onClose={() => {
        if (!installing) onClose();
      }}
      footer={
        <>
          <Button disabled={installing} onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button
            variant="primary"
            loading={installing}
            disabled={!preview}
            onClick={() => void install()}
          >
            {m.keywords.packs.importModal.confirmInstallBtn}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="row wrap" style={{ gap: 8 }}>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload size={14} />
            {m.keywords.packs.importModal.uploadBtn}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,.kxc-pack.json"
            aria-label={m.keywords.packs.importModal.selectFileAria}
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (file.size > MAX_RULE_PACK_BYTES) {
                setError(m.keywords.packs.importModal.fileTooLargeError);
                setPreview(null);
                return;
              }
              try {
                const text = await file.text();
                setRawText(text);
                parseAndValidate(text);
              } catch (err) {
                setPreview(null);
                setError(
                  err instanceof Error && err.message
                    ? err.message
                    : m.keywords.packs.importModal.invalidJsonError
                );
              }
            }}
          />
        </div>

        <Field label={m.keywords.packs.importModal.pasteLabel}>
          <textarea
            className="input"
            rows={5}
            style={{ minHeight: 96, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
            value={rawText}
            placeholder={m.keywords.packs.importModal.pastePlaceholder}
            onChange={(e) => {
              setRawText(e.target.value);
              setPreview(null);
              setError('');
            }}
          />
        </Field>

        <div>
          <Button
            variant="sm"
            disabled={!rawText.trim()}
            onClick={() => parseAndValidate(rawText)}
          >
            {m.keywords.packs.importModal.previewBtn}
          </Button>
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        {preview && (
          <div className="pack-card" data-kxc-pack-preview="true">
            <div className="row between wrap" style={{ gap: 6 }}>
              <div>
                <strong>{preview.name}</strong>
                <span className="small muted mono" style={{ marginLeft: 8 }}>
                  {preview.id}
                </span>
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                <Pill>
                  {m.keywords.packs.importModal.metaVersion(preview.version)}
                </Pill>
                {preview.author && (
                  <Pill kind="neutral">
                    {m.keywords.packs.importModal.metaAuthor(preview.author)}
                  </Pill>
                )}
              </div>
            </div>
            <p className="small muted">{preview.description}</p>
            <p className="small">
              {m.keywords.packs.packCounts(
                preview.keywords?.length ?? 0,
                preview.domains?.length ?? 0,
                preview.blockedUids?.length ?? 0
              )}
            </p>
            {existingPack && (
              <Banner kind="warning">
                {m.keywords.packs.importModal.overwriteWarning(
                  existingPack.version,
                  preview.version
                )}
              </Banner>
            )}
            {whitelistConflictCount > 0 && (
              <Banner kind="warning">
                {m.keywords.packs.importModal.whitelistConflictWarning(
                  whitelistConflictCount
                )}
              </Banner>
            )}
            <Banner>{m.keywords.packs.importModal.safetyNote}</Banner>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PackExportModal({
  onExported,
  onClose,
}: {
  onExported: (name: string) => void;
  onClose: () => void;
}) {
  const { data } = useApp();
  const { m } = useI18n();
  const { config } = data!;

  const customKeywords = config.rules.keywords.items;
  const customDomains = config.rules.domainFilter.items;
  const blockedAccounts = Object.values(config.localBlocklistUids);

  const [name, setName] = useState('');
  const [idInput, setIdInput] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [packLocale, setPackLocale] = useState<'universal' | SupportedLocale>(
    'universal'
  );
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(() =>
    customKeywords.map((k) => k.id)
  );
  const [selectedDomains, setSelectedDomains] = useState<string[]>(() =>
    customDomains.map((d) => d.id)
  );
  // Blocked accounts are explicitly opt-in (unchecked by default for privacy)
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'fallback'>(
    'idle'
  );

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = setTimeout(() => setCopyState('idle'), 2200);
    return () => clearTimeout(timer);
  }, [copyState]);

  function toggleId(list: string[], id: string, setter: (next: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function buildSerialized(): { json: string; id: string; packName: string } | null {
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(m.keywords.packs.exportModal.nameRequiredError);
      return null;
    }
    const keywords = customKeywords.filter((k) =>
      selectedKeywords.includes(k.id)
    );
    const domains = customDomains.filter((d) => selectedDomains.includes(d.id));
    const blockedUids = blockedAccounts.filter((u) =>
      selectedUids.includes(u.uid)
    );
    if (
      keywords.length === 0 &&
      domains.length === 0 &&
      blockedUids.length === 0
    ) {
      setError(m.keywords.packs.exportModal.selectAtLeastOneError);
      return null;
    }
    const resolvedId = idInput.trim() || slugifyPackId(trimmedName);
    const payload: RulePackPayload = {
      format: RULE_PACK_FORMAT,
      id: resolvedId,
      name: trimmedName,
      description: description.trim() || trimmedName,
      version: version.trim() || '1.0.0',
      updatedAt: new Date().toISOString().slice(0, 10),
      ...(author.trim() ? { author: author.trim() } : {}),
      locale: packLocale,
      ...(keywords.length ? { keywords } : {}),
      ...(domains.length ? { domains } : {}),
      ...(blockedUids.length ? { blockedUids } : {}),
    };
    try {
      const json = serializeRulePack(payload);
      return { json, id: resolvedId, packName: trimmedName };
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }

  function handleDownload() {
    const built = buildSerialized();
    if (!built) return;
    downloadTextFile(built.json, `${built.id}.kxc-pack.json`);
    onExported(built.packName);
    onClose();
  }

  async function handleCopy(anchor?: Node | null) {
    const built = buildSerialized();
    if (!built) return;
    const ok = await copyTextWithFallback(built.json, anchor);
    setCopyState(ok ? 'copied' : 'fallback');
  }

  return (
    <Modal
      title={m.keywords.packs.exportModal.title}
      description={m.keywords.packs.exportModal.desc}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{m.common.cancel}</Button>
          <Button onClick={(e) => void handleCopy(e.currentTarget)}>
            {copyState === 'copied' ? (
              <>
                <Check size={14} />
                {m.keywords.packs.exportModal.copiedBtn}
              </>
            ) : (
              <>
                <Copy size={14} />
                {m.keywords.packs.exportModal.copyBtn}
              </>
            )}
          </Button>
          <Button variant="primary" onClick={handleDownload}>
            <Download size={14} />
            {m.keywords.packs.exportModal.downloadBtn}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="detail-grid">
          <Field label={m.keywords.packs.exportModal.nameLabel}>
            <input
              autoFocus
              className="input"
              value={name}
              placeholder={m.keywords.packs.exportModal.namePlaceholder}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={m.keywords.packs.exportModal.versionLabel}>
            <input
              className="input"
              value={version}
              placeholder="1.0.0"
              onChange={(e) => setVersion(e.target.value)}
            />
          </Field>
        </div>
        <div className="detail-grid">
          <Field
            label={m.keywords.packs.exportModal.idLabel}
            help={m.keywords.packs.exportModal.idHelp}
          >
            <input
              className="input mono"
              value={idInput}
              placeholder={name.trim() ? slugifyPackId(name) : 'my-rule-pack'}
              onChange={(e) => setIdInput(e.target.value)}
            />
          </Field>
          <Field label={m.keywords.packs.exportModal.authorLabel}>
            <input
              className="input"
              value={author}
              placeholder={m.keywords.packs.exportModal.authorPlaceholder}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </Field>
        </div>
        <div className="detail-grid">
          <Field label={m.keywords.packs.exportModal.descLabel}>
            <input
              className="input"
              value={description}
              placeholder={m.keywords.packs.exportModal.descPlaceholder}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label={m.keywords.packs.exportModal.localeLabel}>
            <select
              className="input"
              value={packLocale}
              onChange={(e) =>
                setPackLocale(e.target.value as 'universal' | SupportedLocale)
              }
            >
              <option value="universal">
                {m.keywords.packs.exportModal.localeUniversal}
              </option>
              {UI_LOCALE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.nativeLabel}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {customKeywords.length > 0 && (
          <div className="stack-sm">
            <div className="row between">
              <span className="field-label" style={{ marginBottom: 0 }}>
                {m.keywords.packs.exportModal.selectKeywordsHeading(
                  selectedKeywords.length
                )}
              </span>
              <div className="row" style={{ gap: 6 }}>
                <Button
                  variant="ghost sm"
                  onClick={() =>
                    setSelectedKeywords(customKeywords.map((k) => k.id))
                  }
                >
                  {m.keywords.packs.exportModal.selectAllBtn}
                </Button>
                <Button
                  variant="ghost sm"
                  onClick={() => setSelectedKeywords([])}
                >
                  {m.keywords.packs.exportModal.selectNoneBtn}
                </Button>
              </div>
            </div>
            <div className="pack-export-list">
              {customKeywords.map((k) => (
                <label className="check-label small" key={k.id}>
                  <input
                    type="checkbox"
                    checked={selectedKeywords.includes(k.id)}
                    onChange={() =>
                      toggleId(selectedKeywords, k.id, setSelectedKeywords)
                    }
                  />
                  <span className="ellipsis">{k.pattern}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {customDomains.length > 0 && (
          <div className="stack-sm">
            <div className="row between">
              <span className="field-label" style={{ marginBottom: 0 }}>
                {m.keywords.packs.exportModal.selectDomainsHeading(
                  selectedDomains.length
                )}
              </span>
              <div className="row" style={{ gap: 6 }}>
                <Button
                  variant="ghost sm"
                  onClick={() =>
                    setSelectedDomains(customDomains.map((d) => d.id))
                  }
                >
                  {m.keywords.packs.exportModal.selectAllBtn}
                </Button>
                <Button
                  variant="ghost sm"
                  onClick={() => setSelectedDomains([])}
                >
                  {m.keywords.packs.exportModal.selectNoneBtn}
                </Button>
              </div>
            </div>
            <div className="pack-export-list">
              {customDomains.map((d) => (
                <label className="check-label small" key={d.id}>
                  <input
                    type="checkbox"
                    checked={selectedDomains.includes(d.id)}
                    onChange={() =>
                      toggleId(selectedDomains, d.id, setSelectedDomains)
                    }
                  />
                  <span className="ellipsis mono">{d.domain}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {blockedAccounts.length > 0 && (
          <div className="stack-sm">
            <div className="row between">
              <div>
                <span className="field-label" style={{ marginBottom: 0 }}>
                  {m.keywords.packs.exportModal.selectAccountsHeading(
                    selectedUids.length
                  )}
                </span>
                <p className="small muted">
                  {m.keywords.packs.exportModal.accountsOptInHint}
                </p>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Button
                  variant="ghost sm"
                  onClick={() =>
                    setSelectedUids(blockedAccounts.map((a) => a.uid))
                  }
                >
                  {m.keywords.packs.exportModal.selectAllBtn}
                </Button>
                <Button variant="ghost sm" onClick={() => setSelectedUids([])}>
                  {m.keywords.packs.exportModal.selectNoneBtn}
                </Button>
              </div>
            </div>
            <div className="pack-export-list">
              {blockedAccounts.map((a) => (
                <label className="check-label small" key={a.uid}>
                  <input
                    type="checkbox"
                    checked={selectedUids.includes(a.uid)}
                    onChange={() =>
                      toggleId(selectedUids, a.uid, setSelectedUids)
                    }
                  />
                  <span className="ellipsis">
                    {a.screenName ? `@${a.screenName}` : `UID ${a.uid}`}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <Banner>{m.keywords.packs.exportModal.privacyNote}</Banner>
        {copyState === 'fallback' && (
          <Banner kind="warning">
            {m.keywords.packs.exportModal.copyFallbackNote}
          </Banner>
        )}
        {error && <Banner kind="error">{error}</Banner>}
      </div>
    </Modal>
  );
}

export function PacksTab({
  packParam,
  focusId,
  focusNavKey,
  onNotice,
}: {
  packParam: string | null;
  focusId: string | null;
  focusNavKey?: string;
  onNotice: (text: string) => void;
}) {
  const { data } = useApp();
  const { m } = useI18n();
  const installedPacks = data!.config.installedPacks;
  const packs = useMemo(() => installedPacks ?? [], [installedPacks]);

  const [expandedPacks, setExpandedPacks] = useState<Set<string>>(() =>
    packParam ? new Set([packParam]) : new Set()
  );
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [uninstalling, setUninstalling] = useState<InstalledRulePack | null>(
    null
  );
  const handledExpandNavRef = useRef<string | null>(null);

  const expandToken =
    packParam || focusId
      ? `${focusNavKey ?? ''}\0${packParam ?? ''}\0${focusId ?? ''}`
      : null;

  const ownerPack = useMemo(() => {
    if (!focusId) return undefined;
    const byParam = packParam
      ? packs.find((p) => p.id === packParam)
      : undefined;
    if (byParam) return byParam;
    return packs.find((p) => packHasItem(p, focusId));
  }, [packs, packParam, focusId]);

  useEffect(() => {
    if (!expandToken) {
      handledExpandNavRef.current = null;
      return;
    }
    if (handledExpandNavRef.current === expandToken) return;
    handledExpandNavRef.current = expandToken;
    const expandPackId = ownerPack?.id ?? packParam;
    if (expandPackId) {
      setExpandedPacks((prev) => {
        if (prev.has(expandPackId)) return prev;
        const next = new Set(prev);
        next.add(expandPackId);
        return next;
      });
    }
  }, [expandToken, ownerPack, packParam]);

  const targetIsPackItem = Boolean(
    focusId && ownerPack && packHasItem(ownerPack, focusId)
  );
  const targetFocusId = focusId
    ? targetIsPackItem && ownerPack
      ? packItemFocusId(ownerPack.id, focusId)
      : !packParam && packs.some((p) => p.id === focusId)
        ? focusId
        : ownerPack
          ? packItemFocusId(ownerPack.id, focusId)
          : focusId
    : packParam;

  const focusReady = useMemo(() => {
    if (!targetFocusId) return true;
    if (!focusId) {
      return Boolean(packParam && packs.some((p) => p.id === packParam));
    }
    if (targetIsPackItem && ownerPack) {
      return expandedPacks.has(ownerPack.id);
    }
    if (!packParam && packs.some((p) => p.id === focusId)) {
      return true;
    }
    return false;
  }, [
    targetFocusId,
    focusId,
    packParam,
    packs,
    targetIsPackItem,
    ownerPack,
    expandedPacks,
  ]);

  const activeFocusId = useFocusHighlight(targetFocusId, {
    ready: focusReady,
    triggerKey: focusNavKey,
  });

  function resharePack(pack: InstalledRulePack) {
    try {
      const json = serializeRulePack(pack);
      downloadTextFile(json, `${pack.id}.kxc-pack.json`);
      onNotice(m.keywords.packs.exportedNotice(pack.name));
    } catch {
      // Ignore invalid pack edge case
    }
  }

  return (
    <>
      <Banner>{m.keywords.packs.offlineBanner}</Banner>

      <div className="row wrap" style={{ gap: 8 }}>
        <Button variant="primary" onClick={() => setImportOpen(true)}>
          <Upload size={15} />
          {m.keywords.packs.importBtn}
        </Button>
        <Button onClick={() => setExportOpen(true)}>
          <Share2 size={15} />
          {m.keywords.packs.exportBtn}
        </Button>
      </div>

      {packs.length ? (
        <div className="stack">
          {packs.map((pack) => {
            const expanded = expandedPacks.has(pack.id);
            const disabledSet = new Set(pack.disabledItemIds ?? []);
            const isPackFocused = activeFocusId === pack.id;
            const keywords = pack.keywords ?? [];
            const domains = pack.domains ?? [];
            const blockedUids = pack.blockedUids ?? [];

            return (
              <section
                key={pack.id}
                className={`pack-card${isPackFocused ? ' focus-highlight' : ''}`}
                data-pack-id={pack.id}
                data-focus-id={pack.id}
                data-focused={isPackFocused ? 'true' : undefined}
                data-disabled={String(!pack.enabled)}
              >
                <div className="row between wrap" style={{ gap: 10 }}>
                  <div className="grow" style={{ minWidth: 200 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <Package size={16} />
                      <h3>{pack.name}</h3>
                      <Pill kind="neutral">v{pack.version}</Pill>
                      {pack.author && <Pill kind="neutral">{pack.author}</Pill>}
                      {disabledSet.size > 0 && (
                        <Pill kind="warning">
                          {m.keywords.packs.disabledItemsPill(disabledSet.size)}
                        </Pill>
                      )}
                    </div>
                    <p className="small muted" style={{ marginTop: 4 }}>
                      {pack.description}
                    </p>
                    <p className="small muted" style={{ marginTop: 4 }}>
                      {m.keywords.packs.packCounts(
                        keywords.length,
                        domains.length,
                        blockedUids.length
                      )}
                    </p>
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <Switch
                      label={m.keywords.packs.enablePackAria(pack.name)}
                      checked={pack.enabled}
                      onChange={(enabled) =>
                        perform({ type: 'pack.toggle', id: pack.id, enabled })
                      }
                    />
                    <Button
                      variant="ghost sm"
                      aria-expanded={expanded}
                      aria-label={m.keywords.packs.expandPackAria(
                        expanded,
                        pack.name
                      )}
                      onClick={() =>
                        setExpandedPacks((prev) => {
                          const next = new Set(prev);
                          if (expanded) next.delete(pack.id);
                          else next.add(pack.id);
                          return next;
                        })
                      }
                    >
                      {expanded ? (
                        <>
                          <ChevronDown size={14} />
                          {m.keywords.packs.hideItemsBtn}
                        </>
                      ) : (
                        <>
                          <ChevronRight size={14} />
                          {m.keywords.packs.viewItemsBtn}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost sm"
                      aria-label={m.keywords.packs.reshareAria(pack.name)}
                      onClick={() => resharePack(pack)}
                    >
                      <Download size={13} />
                      {m.keywords.packs.reshareBtn}
                    </Button>
                    <Button
                      variant="ghost sm"
                      data-kxc-pack-uninstall="true"
                      aria-label={m.keywords.packs.uninstallAria(pack.name)}
                      onClick={() => setUninstalling(pack)}
                    >
                      <Trash2 size={13} />
                      {m.keywords.packs.uninstallBtn}
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <div className="pack-items-box">
                    {keywords.length > 0 && (
                      <div className="stack-sm">
                        <span className="field-label" style={{ marginBottom: 0 }}>
                          {m.keywords.packs.sectionKeywords} ({keywords.length})
                        </span>
                        {keywords.map((k) => {
                          const disabled = disabledSet.has(k.id);
                          const itemFocusId = packItemFocusId(pack.id, k.id);
                          const focused = activeFocusId === itemFocusId;
                          return (
                            <div
                              key={k.id}
                              data-item-id={k.id}
                              data-focus-id={itemFocusId}
                              data-focused={focused ? 'true' : undefined}
                              className={`pack-item-row${focused ? ' focus-highlight' : ''}`}
                              style={disabled ? { opacity: 0.56 } : undefined}
                            >
                              <div className="row wrap" style={{ gap: 6, minWidth: 0 }}>
                                <strong className="small ellipsis">
                                  {k.pattern}
                                </strong>
                                {k.isRegex && (
                                  <Pill kind="neutral">
                                    {m.keywords.regexPill}
                                  </Pill>
                                )}
                                {k.note && (
                                  <span className="small muted ellipsis">
                                    {k.note}
                                  </span>
                                )}
                              </div>
                              {disabled ? (
                                <Pill kind="neutral">
                                  {m.keywords.packs.itemDisabledPill}
                                </Pill>
                              ) : (
                                <Button
                                  variant="ghost sm"
                                  aria-label={m.keywords.packs.disableItemAria(
                                    k.pattern
                                  )}
                                  onClick={() =>
                                    void mutate({
                                      type: 'target.disable',
                                      target: {
                                        kind: 'pack_item',
                                        id: k.id,
                                        packId: pack.id,
                                      },
                                    })
                                      .then(() =>
                                        onNotice(
                                          m.keywords.packs.itemDisabledNotice
                                        )
                                      )
                                      .catch(() => undefined)
                                  }
                                >
                                  {m.keywords.packs.disableItemBtn}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {domains.length > 0 && (
                      <div className="stack-sm">
                        <span className="field-label" style={{ marginBottom: 0 }}>
                          {m.keywords.packs.sectionDomains} ({domains.length})
                        </span>
                        {domains.map((d) => {
                          const disabled = disabledSet.has(d.id);
                          const itemFocusId = packItemFocusId(pack.id, d.id);
                          const focused = activeFocusId === itemFocusId;
                          return (
                            <div
                              key={d.id}
                              data-item-id={d.id}
                              data-focus-id={itemFocusId}
                              data-focused={focused ? 'true' : undefined}
                              className={`pack-item-row${focused ? ' focus-highlight' : ''}`}
                              style={disabled ? { opacity: 0.56 } : undefined}
                            >
                              <div className="row wrap" style={{ gap: 6, minWidth: 0 }}>
                                <strong className="small mono ellipsis">
                                  {d.domain}
                                </strong>
                                {d.note && (
                                  <span className="small muted ellipsis">
                                    {d.note}
                                  </span>
                                )}
                              </div>
                              {disabled ? (
                                <Pill kind="neutral">
                                  {m.keywords.packs.itemDisabledPill}
                                </Pill>
                              ) : (
                                <Button
                                  variant="ghost sm"
                                  aria-label={m.keywords.packs.disableItemAria(
                                    d.domain
                                  )}
                                  onClick={() =>
                                    void mutate({
                                      type: 'target.disable',
                                      target: {
                                        kind: 'pack_item',
                                        id: d.id,
                                        packId: pack.id,
                                      },
                                    })
                                      .then(() =>
                                        onNotice(
                                          m.keywords.packs.itemDisabledNotice
                                        )
                                      )
                                      .catch(() => undefined)
                                  }
                                >
                                  {m.keywords.packs.disableItemBtn}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {blockedUids.length > 0 && (
                      <div className="stack-sm">
                        <span className="field-label" style={{ marginBottom: 0 }}>
                          {m.keywords.packs.sectionBlockedAccounts} (
                          {blockedUids.length})
                        </span>
                        {blockedUids.map((u) => {
                          const disabled = disabledSet.has(u.uid);
                          const itemFocusId = packItemFocusId(pack.id, u.uid);
                          const focused = activeFocusId === itemFocusId;
                          const label = u.screenName
                            ? `@${u.screenName}`
                            : `UID ${u.uid}`;
                          return (
                            <div
                              key={u.uid}
                              data-item-id={u.uid}
                              data-focus-id={itemFocusId}
                              data-focused={focused ? 'true' : undefined}
                              className={`pack-item-row${focused ? ' focus-highlight' : ''}`}
                              style={disabled ? { opacity: 0.56 } : undefined}
                            >
                              <div className="row wrap" style={{ gap: 6, minWidth: 0 }}>
                                <strong className="small">{label}</strong>
                                <span className="small muted mono">{u.uid}</span>
                              </div>
                              {disabled ? (
                                <Pill kind="neutral">
                                  {m.keywords.packs.itemDisabledPill}
                                </Pill>
                              ) : (
                                <Button
                                  variant="ghost sm"
                                  aria-label={m.keywords.packs.disableItemAria(
                                    label
                                  )}
                                  onClick={() =>
                                    void mutate({
                                      type: 'target.disable',
                                      target: {
                                        kind: 'pack_item',
                                        id: u.uid,
                                        packId: pack.id,
                                      },
                                    })
                                      .then(() =>
                                        onNotice(
                                          m.keywords.packs.itemDisabledNotice
                                        )
                                      )
                                      .catch(() => undefined)
                                  }
                                >
                                  {m.keywords.packs.disableItemBtn}
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <Panel>
          <Empty
            title={m.keywords.packs.emptyTitle}
            description={m.keywords.packs.emptyDesc}
          />
        </Panel>
      )}

      {importOpen && (
        <PackImportModal
          onInstalled={(packName) =>
            onNotice(m.keywords.packs.installedNotice(packName))
          }
          onClose={() => setImportOpen(false)}
        />
      )}

      {exportOpen && (
        <PackExportModal
          onExported={(packName) =>
            onNotice(m.keywords.packs.exportedNotice(packName))
          }
          onClose={() => setExportOpen(false)}
        />
      )}

      {uninstalling && (
        <Confirm
          title={m.keywords.packs.uninstallConfirmTitle}
          actionLabel={m.keywords.packs.uninstallConfirmBtn}
          danger
          onClose={() => setUninstalling(null)}
          onConfirm={async () => {
            await mutate({ type: 'pack.uninstall', id: uninstalling.id });
            onNotice(m.keywords.packs.uninstalledNotice(uninstalling.name));
          }}
        >
          <p>{m.keywords.packs.uninstallConfirmBody(uninstalling.name)}</p>
        </Confirm>
      )}
    </>
  );
}
