import { useState } from 'react';
import { Image, Globe, CheckCircle2, Filter } from 'lucide-react';
import { useI18n } from '../../locales';

export function LangFilterCard() {
  const { t } = useI18n();
  const c4 = t.bento.card4;

  const [mode, setMode] = useState<'allow' | 'block'>('allow');
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en', 'zh', 'ja']);
  const [hasMedia, setHasMedia] = useState(true);

  // Toggle language in selected list
  const toggleLanguage = (langCode: string) => {
    setSelectedLangs((prev) =>
      prev.includes(langCode)
        ? prev.filter((c) => c !== langCode)
        : [...prev, langCode]
    );
  };

  // Sample post is in French ('fr')
  const sampleTweetLang = 'fr';
  const isLanguageFiltered =
    mode === 'allow'
      ? !selectedLangs.includes(sampleTweetLang)
      : selectedLangs.includes(sampleTweetLang);

  // When hasMedia is true, media/universal content ('und', images, emojis) smart-bypasses!
  const isBypassed = hasMedia && isLanguageFiltered;
  const isBlocked = !hasMedia && isLanguageFiltered;

  const availableLangs = [
    { code: 'en', label: 'English' },
    { code: 'zh', label: '中文' },
    { code: 'ja', label: '日本語' },
    { code: 'ko', label: '한국어' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
  ];

  return (
    <article
      className="bento-card bento-lang-card"
      data-testid="bento-card-lang"
    >
      <div className="bento-card-header">
        <span className="bento-card-tag">{c4.tag}</span>
        <h3 className="bento-card-title">{c4.title}</h3>
        <p className="bento-card-desc">{c4.desc}</p>
      </div>

      <div className="lang-controls-bar">
        {/* Whitelist / Blacklist Mode Switcher */}
        <div className="lang-mode-toggle" role="radiogroup" aria-label="Filter Mode">
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'allow'}
            className={`lang-mode-btn ${mode === 'allow' ? 'active' : ''}`}
            onClick={() => setMode('allow')}
            data-testid="lang-mode-allow"
          >
            {c4.modeAllow}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'block'}
            className={`lang-mode-btn ${mode === 'block' ? 'active' : ''}`}
            onClick={() => setMode('block')}
            data-testid="lang-mode-block"
          >
            {c4.modeBlock}
          </button>
        </div>

        <small className="text-muted">
          {mode === 'allow' ? c4.allowModeDesc : c4.blockModeDesc}
        </small>
      </div>

      {/* Language Chips */}
      <div className="lang-chips-row" aria-label="Available Languages">
        {availableLangs.map((lang) => {
          const isSelected = selectedLangs.includes(lang.code);
          return (
            <button
              key={lang.code}
              type="button"
              className={`lang-chip ${isSelected ? 'selected' : ''}`}
              onClick={() => toggleLanguage(lang.code)}
              aria-pressed={isSelected}
            >
              {lang.label} ({lang.code})
            </button>
          );
        })}
      </div>

      {/* Interactive Demo Tweet */}
      <div className="lang-demo-post">
        <div className="lang-demo-post-header">
          <div className="lang-demo-user">
            <div className="lang-demo-avatar" aria-hidden="true">
              FR
            </div>
            <div>
              <strong>Antoine Dubois</strong>{' '}
              <span className="text-muted">@antoine_fr · 2h</span>
            </div>
          </div>
          <span className="keyword-scope-pill">Lang: {sampleTweetLang}</span>
        </div>

        <div className="lang-demo-text">
          Magnifique coucher de soleil sur la Seine ce soir ! Paris est magique en automne. 🍂
        </div>

        {hasMedia && (
          <div className="lang-demo-media-box" data-testid="lang-media-box">
            <Image size={18} />
            <span>{c4.sampleMediaNotice}</span>
          </div>
        )}

        <div
          className={`lang-demo-status ${
            isBypassed
              ? 'bypassed'
              : isBlocked
              ? 'filtered'
              : 'bypassed'
          }`}
          data-testid="lang-status-indicator"
        >
          {isBypassed ? (
            <>
              <CheckCircle2 size={16} />
              <span>
                {c4.mediaExemptionTitle}: {c4.mediaExemptionDesc}
              </span>
            </>
          ) : isBlocked ? (
            <>
              <Filter size={16} />
              <span>{c4.filteredByLangNotice}</span>
            </>
          ) : (
            <>
              <Globe size={16} />
              <span>{c4.normalLangNotice}</span>
            </>
          )}
        </div>
      </div>

      {/* Media Toggle Switch */}
      <div className="media-toggle-row">
        <span>{c4.toggleMediaLabel}</span>
        <label className="switch-control" aria-label="Toggle media exemption simulation">
          <input
            type="checkbox"
            checked={hasMedia}
            onChange={(e) => setHasMedia(e.target.checked)}
            data-testid="media-exemption-toggle"
          />
          <span className="switch-slider" />
        </label>
      </div>
    </article>
  );
}
