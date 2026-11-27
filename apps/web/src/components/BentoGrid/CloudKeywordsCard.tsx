import { memo, useCallback, useMemo, useState } from 'react';
import {
  CLOUD_KEYWORD_LANG_GROUPS,
  DEFAULT_CLOUD_KEYWORDS,
  getCloudKeywordNote,
  getTweetLanguageLabel,
  type CloudKeywordLangGroup,
  type KeywordRuleItem,
} from '@keepxclean/shared';
import { Copy, Check, Eye, Search, X } from 'lucide-react';
import { useI18n } from '../../locales';
import { type KeywordCategory } from './types';

const VALID_CATEGORIES = new Set<KeywordCategory>([
  'cliche',
  'crypto',
  'follow',
  'nsfw',
  'scam',
]);

export function getCategoryForRule(
  ruleOrId: string | Pick<KeywordRuleItem, 'id' | 'packCategory'>
): KeywordCategory {
  if (
    typeof ruleOrId !== 'string' &&
    ruleOrId.packCategory &&
    VALID_CATEGORIES.has(ruleOrId.packCategory as KeywordCategory)
  ) {
    return ruleOrId.packCategory as KeywordCategory;
  }
  const id = typeof ruleOrId === 'string' ? ruleOrId : ruleOrId.id;
  if (id.startsWith('cloud-cliche-')) return 'cliche';
  if (
    id.startsWith('cloud-crypto-') ||
    id === 'cloud-scam-crypto-1' ||
    id === 'cloud-scam-rebate-1'
  ) {
    return 'crypto';
  }
  if (id.startsWith('cloud-follow-')) return 'follow';
  if (id.startsWith('cloud-nsfw-')) return 'nsfw';
  if (
    id.startsWith('cloud-scam-') ||
    id.startsWith('cloud-spam-') ||
    id.startsWith('cloud-gambling-') ||
    id.startsWith('cloud-blackmarket-')
  ) {
    return 'scam';
  }
  return 'cliche';
}

interface KeywordItemRowProps {
  rule: KeywordRuleItem;
  isEnabled: boolean;
  isCopied: boolean;
  localizedNote: string;
  langGroupLabel: string;
  copyRegexLabel: string;
  copiedLabel: string;
  inspectRegexLabel: string;
  onToggle: (id: string) => void;
  onCopyPattern: (rule: KeywordRuleItem) => void;
  onInspect: (rule: KeywordRuleItem) => void;
}

const KeywordItemRow = memo(function KeywordItemRow({
  rule,
  isEnabled,
  isCopied,
  localizedNote,
  langGroupLabel,
  copyRegexLabel,
  copiedLabel,
  inspectRegexLabel,
  onToggle,
  onCopyPattern,
  onInspect,
}: KeywordItemRowProps) {
  return (
    <div
      role="listitem"
      className={`keyword-item ${!isEnabled ? 'disabled' : ''}`}
      data-testid={`keyword-item-${rule.id}`}
    >
      <div className="keyword-item-main">
        <div className="keyword-item-note" title={localizedNote}>
          {localizedNote}
        </div>
        <div className="keyword-item-meta">
          <span
            className="keyword-lang-pill"
            data-testid={`keyword-lang-${rule.id}`}
          >
            {langGroupLabel}
          </span>
          {rule.scopes.map((s) => (
            <span key={s} className="keyword-scope-pill">
              {s}
            </span>
          ))}
          {rule.onlyInReplies && (
            <span className="keyword-scope-pill">replies-only</span>
          )}
        </div>
      </div>

      <div className="keyword-item-actions">
        <button
          type="button"
          className={`btn-icon-subtle ${isCopied ? 'copied' : ''}`}
          onClick={() => onCopyPattern(rule)}
          title={isCopied ? copiedLabel : copyRegexLabel}
          aria-label={`${copyRegexLabel} ${rule.id}`}
        >
          {isCopied ? <Check size={14} /> : <Copy size={14} />}
        </button>

        <button
          type="button"
          className="btn-icon-subtle"
          onClick={() => onInspect(rule)}
          title={inspectRegexLabel}
          aria-label={`Inspect ${rule.id}`}
        >
          <Eye size={14} />
        </button>

        <label className="switch-control" aria-label={`Toggle ${rule.id}`}>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={() => onToggle(rule.id)}
          />
          <span className="switch-slider" />
        </label>
      </div>
    </div>
  );
});

export function CloudKeywordsCard() {
  const { locale, t } = useI18n();
  const c1 = t.bento.card1;

  const [selectedLangGroup, setSelectedLangGroup] = useState<
    CloudKeywordLangGroup | 'all'
  >('all');
  const [selectedCategory, setSelectedCategory] = useState<KeywordCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [enabledRules, setEnabledRules] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const rule of DEFAULT_CLOUD_KEYWORDS) {
      initial[rule.id] = rule.enabled ?? true;
    }
    return initial;
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inspectedRule, setInspectedRule] = useState<KeywordRuleItem | null>(null);

  const langGroupLabels = useMemo(() => {
    const map: Record<CloudKeywordLangGroup | 'all', string> = {
      all: c1.langPackAll,
      universal: c1.langPackUniversal,
      zh: getTweetLanguageLabel('zh', locale),
      en: getTweetLanguageLabel('en', locale),
      ja: getTweetLanguageLabel('ja', locale),
      ko: getTweetLanguageLabel('ko', locale),
      es: getTweetLanguageLabel('es', locale),
      pt: getTweetLanguageLabel('pt', locale),
      fr: getTweetLanguageLabel('fr', locale),
      de: getTweetLanguageLabel('de', locale),
      ru: getTweetLanguageLabel('ru', locale),
    };
    return map;
  }, [c1.langPackAll, c1.langPackUniversal, locale]);

  const localizedNotesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const rule of DEFAULT_CLOUD_KEYWORDS) {
      map.set(rule.id, getCloudKeywordNote(rule, locale));
    }
    return map;
  }, [locale]);

  const langGroupCounts = useMemo(() => {
    const counts: Record<CloudKeywordLangGroup | 'all', number> = {
      all: DEFAULT_CLOUD_KEYWORDS.length,
      universal: 0,
      zh: 0,
      en: 0,
      ja: 0,
      ko: 0,
      es: 0,
      pt: 0,
      fr: 0,
      de: 0,
      ru: 0,
    };
    for (const rule of DEFAULT_CLOUD_KEYWORDS) {
      const group: CloudKeywordLangGroup = rule.langGroup ?? 'universal';
      counts[group] = (counts[group] || 0) + 1;
    }
    return counts;
  }, []);

  const langScopedRules = useMemo(() => {
    if (selectedLangGroup === 'all') {
      return DEFAULT_CLOUD_KEYWORDS;
    }
    return DEFAULT_CLOUD_KEYWORDS.filter(
      (rule) => (rule.langGroup ?? 'universal') === selectedLangGroup
    );
  }, [selectedLangGroup]);

  const activeCount = useMemo(() => {
    return DEFAULT_CLOUD_KEYWORDS.filter((r) => enabledRules[r.id]).length;
  }, [enabledRules]);

  const activeInSelectedPack = useMemo(() => {
    return langScopedRules.filter((r) => enabledRules[r.id]).length;
  }, [langScopedRules, enabledRules]);

  const allSelectedPackEnabled =
    langScopedRules.length > 0 && activeInSelectedPack === langScopedRules.length;

  const categoryCounts = useMemo(() => {
    const counts: Record<KeywordCategory, number> = {
      all: langScopedRules.length,
      cliche: 0,
      crypto: 0,
      follow: 0,
      nsfw: 0,
      scam: 0,
    };
    for (const rule of langScopedRules) {
      const cat = getCategoryForRule(rule);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [langScopedRules]);

  const filteredRules = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return langScopedRules.filter((rule) => {
      if (selectedCategory !== 'all') {
        const cat = getCategoryForRule(rule);
        if (cat !== selectedCategory) return false;
      }
      if (q) {
        const note = (localizedNotesById.get(rule.id) ?? '').toLowerCase();
        const pattern = rule.pattern.toLowerCase();
        const group: CloudKeywordLangGroup = rule.langGroup ?? 'universal';
        const groupLabel = langGroupLabels[group].toLowerCase();
        return (
          note.includes(q) ||
          pattern.includes(q) ||
          rule.id.toLowerCase().includes(q) ||
          group.includes(q) ||
          groupLabel.includes(q)
        );
      }
      return true;
    });
  }, [langScopedRules, selectedCategory, searchQuery, localizedNotesById, langGroupLabels]);

  const handleToggle = useCallback((id: string) => {
    setEnabledRules((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const handleToggleSelectedPack = useCallback(() => {
    if (selectedLangGroup === 'all') return;
    const targetEnabled = !allSelectedPackEnabled;
    setEnabledRules((prev) => {
      const next = { ...prev };
      for (const rule of langScopedRules) {
        next[rule.id] = targetEnabled;
      }
      return next;
    });
  }, [selectedLangGroup, allSelectedPackEnabled, langScopedRules]);

  const handleCopyPattern = useCallback(async (rule: KeywordRuleItem) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(rule.pattern);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = rule.pattern;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedId(rule.id);
      setTimeout(() => {
        setCopiedId((curr) => (curr === rule.id ? null : curr));
      }, 2000);
    } catch {
      setCopiedId(rule.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  const handleInspect = useCallback((rule: KeywordRuleItem) => {
    setInspectedRule((curr) => (curr?.id === rule.id ? null : rule));
  }, []);

  const categories: Array<{ id: KeywordCategory; label: string }> = [
    { id: 'all', label: `${c1.categoryAll} (${categoryCounts.all})` },
    { id: 'cliche', label: `${c1.categoryCliche} (${categoryCounts.cliche})` },
    { id: 'crypto', label: `${c1.categoryCrypto} (${categoryCounts.crypto})` },
    { id: 'follow', label: `${c1.categoryFollow} (${categoryCounts.follow})` },
    { id: 'nsfw', label: `${c1.categoryNsfw} (${categoryCounts.nsfw})` },
    { id: 'scam', label: `${c1.categoryScam} (${categoryCounts.scam})` },
  ];

  const langPackButtons: Array<{ id: CloudKeywordLangGroup | 'all'; label: string }> = [
    { id: 'all', label: `${langGroupLabels.all} (${langGroupCounts.all})` },
    ...CLOUD_KEYWORD_LANG_GROUPS.map((group) => ({
      id: group,
      label: `${langGroupLabels[group]} (${langGroupCounts[group]})`,
    })),
  ];

  return (
    <article className="bento-card bento-keywords-card" data-testid="bento-card-keywords">
      <div className="bento-card-header">
        <span className="bento-card-tag">{c1.tag}</span>
        <h3 className="bento-card-title">{c1.title}</h3>
        <p className="bento-card-desc">{c1.desc}</p>
      </div>

      {/* 10-Language Public Pack Filter Strip */}
      <div
        className="keywords-lang-packs"
        role="group"
        aria-label={c1.langPacksAriaLabel}
        data-testid="keywords-lang-packs"
      >
        {langPackButtons.map((pack) => (
          <button
            key={pack.id}
            type="button"
            aria-pressed={selectedLangGroup === pack.id}
            className={`keywords-lang-pack-btn ${selectedLangGroup === pack.id ? 'active' : ''}`}
            data-testid={`lang-pack-btn-${pack.id}`}
            onClick={() => setSelectedLangGroup(pack.id)}
          >
            {pack.label}
          </button>
        ))}
      </div>

      {selectedLangGroup !== 'all' && (
        <div className="keywords-pack-bar" data-testid="lang-pack-action-bar">
          <span className="keywords-pack-bar-summary">
            {langGroupLabels[selectedLangGroup]} · {activeInSelectedPack} / {langScopedRules.length} {c1.enabled}
          </span>
          <button
            type="button"
            className="keywords-pack-toggle-btn"
            data-testid="lang-pack-toggle-btn"
            onClick={handleToggleSelectedPack}
          >
            {allSelectedPackEnabled ? c1.disablePack : c1.enablePack}
          </button>
        </div>
      )}

      <div className="keywords-meta-bar">
        <span className="keywords-active-counter" data-testid="keywords-active-badge">
          {activeCount} / {DEFAULT_CLOUD_KEYWORDS.length} {c1.enabled}
        </span>
        <div className="keywords-tabs" role="tablist" aria-label="Keyword Categories">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat.id}
              className={`keywords-tab-btn ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="keywords-search-box">
        <Search size={14} className="text-muted" aria-hidden="true" />
        <input
          type="text"
          className="keywords-search-input"
          placeholder={c1.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label={c1.searchAriaLabel}
        />
        {searchQuery && (
          <button
            type="button"
            className="btn-icon-subtle"
            onClick={() => setSearchQuery('')}
            aria-label={c1.clearSearch}
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="keywords-list" role="list">
        {filteredRules.map((rule) => {
          const group: CloudKeywordLangGroup = rule.langGroup ?? 'universal';
          return (
            <KeywordItemRow
              key={rule.id}
              rule={rule}
              isEnabled={!!enabledRules[rule.id]}
              isCopied={copiedId === rule.id}
              localizedNote={localizedNotesById.get(rule.id) ?? rule.pattern}
              langGroupLabel={langGroupLabels[group]}
              copyRegexLabel={c1.copyRegex}
              copiedLabel={c1.copied}
              inspectRegexLabel={c1.inspectRegex}
              onToggle={handleToggle}
              onCopyPattern={handleCopyPattern}
              onInspect={handleInspect}
            />
          );
        })}
      </div>

      {inspectedRule && (
        <div className="regex-inspect-drawer" data-testid="regex-inspect-drawer">
          <div className="regex-inspect-header">
            <span>{inspectedRule.id}</span>
            <button
              type="button"
              className="btn-icon-subtle"
              onClick={() => setInspectedRule(null)}
              aria-label={c1.closeInspector}
            >
              <X size={12} />
            </button>
          </div>
          <div className="regex-inspect-code">{inspectedRule.pattern}</div>
        </div>
      )}
    </article>
  );
}
