import { useState, useMemo } from 'react';
import {
  DEFAULT_CLOUD_KEYWORDS,
  getCloudKeywordNote,
  type KeywordRuleItem,
} from '@keepxclean/shared';
import { Copy, Check, Eye, Search, X } from 'lucide-react';
import { useI18n } from '../../locales';
import { type KeywordCategory } from './types';

export function getCategoryForRule(id: string): KeywordCategory {
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

export function CloudKeywordsCard() {
  const { locale, t } = useI18n();
  const c1 = t.bento.card1;

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

  const activeCount = useMemo(() => {
    return DEFAULT_CLOUD_KEYWORDS.filter((r) => enabledRules[r.id]).length;
  }, [enabledRules]);

  const categoryCounts = useMemo(() => {
    const counts: Record<KeywordCategory, number> = {
      all: DEFAULT_CLOUD_KEYWORDS.length,
      cliche: 0,
      crypto: 0,
      follow: 0,
      nsfw: 0,
      scam: 0,
    };
    for (const rule of DEFAULT_CLOUD_KEYWORDS) {
      const cat = getCategoryForRule(rule.id);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, []);

  const filteredRules = useMemo(() => {
    return DEFAULT_CLOUD_KEYWORDS.filter((rule) => {
      if (selectedCategory !== 'all') {
        const cat = getCategoryForRule(rule.id);
        if (cat !== selectedCategory) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const note = getCloudKeywordNote(rule, locale).toLowerCase();
        const pattern = rule.pattern.toLowerCase();
        return note.includes(q) || pattern.includes(q) || rule.id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [selectedCategory, searchQuery, locale]);

  const handleToggle = (id: string) => {
    setEnabledRules((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyPattern = async (rule: KeywordRuleItem) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(rule.pattern);
      } else {
        // Fallback for environments without modern clipboard
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
      // In tests or restricted iframes, still show feedback
      setCopiedId(rule.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const categories: Array<{ id: KeywordCategory; label: string }> = [
    { id: 'all', label: `${c1.categoryAll} (${categoryCounts.all})` },
    { id: 'cliche', label: `${c1.categoryCliche} (${categoryCounts.cliche})` },
    { id: 'crypto', label: `${c1.categoryCrypto} (${categoryCounts.crypto})` },
    { id: 'follow', label: `${c1.categoryFollow} (${categoryCounts.follow})` },
    { id: 'nsfw', label: `${c1.categoryNsfw} (${categoryCounts.nsfw})` },
    { id: 'scam', label: `${c1.categoryScam} (${categoryCounts.scam})` },
  ];

  return (
    <article className="bento-card bento-keywords-card" data-testid="bento-card-keywords">
      <div className="bento-card-header">
        <span className="bento-card-tag">{c1.tag}</span>
        <h3 className="bento-card-title">{c1.title}</h3>
        <p className="bento-card-desc">{c1.desc}</p>
      </div>

      <div className="keywords-meta-bar">
        <span className="keywords-active-counter" data-testid="keywords-active-badge">
          {activeCount} / {DEFAULT_CLOUD_KEYWORDS.length} {c1.enabled}
        </span>
        <div className="keywords-tabs" role="tablist" aria-label="Keyword Categories">
          {categories.map((cat) => (
            <button
              key={cat.id}
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
          const isEnabled = !!enabledRules[rule.id];
          const isCopied = copiedId === rule.id;
          const localizedNote = getCloudKeywordNote(rule, locale);

          return (
            <div
              key={rule.id}
              role="listitem"
              className={`keyword-item ${!isEnabled ? 'disabled' : ''}`}
              data-testid={`keyword-item-${rule.id}`}
            >
              <div className="keyword-item-main">
                <div className="keyword-item-note" title={localizedNote}>
                  {localizedNote}
                </div>
                <div className="keyword-item-meta">
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
                  onClick={() => handleCopyPattern(rule)}
                  title={isCopied ? c1.copied : c1.copyRegex}
                  aria-label={`${c1.copyRegex} ${rule.id}`}
                >
                  {isCopied ? <Check size={14} /> : <Copy size={14} />}
                </button>

                <button
                  type="button"
                  className="btn-icon-subtle"
                  onClick={() =>
                    setInspectedRule((curr) => (curr?.id === rule.id ? null : rule))
                  }
                  title={c1.inspectRegex}
                  aria-label={`Inspect ${rule.id}`}
                >
                  <Eye size={14} />
                </button>

                <label className="switch-control" aria-label={`Toggle ${rule.id}`}>
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => handleToggle(rule.id)}
                  />
                  <span className="switch-slider" />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {inspectedRule && (
        <div className="regex-inspect-drawer" data-testid="regex-inspect-drawer">
          <div className="regex-inspect-header">
            <span>{inspectedRule.id}</span>
            <button
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
