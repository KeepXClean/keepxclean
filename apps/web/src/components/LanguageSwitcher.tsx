import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { UI_LOCALE_OPTIONS, type SupportedLocale } from '@keepxclean/shared';
import { useI18n } from '../locales';

export interface LanguageSwitcherProps {
  currentLocale?: SupportedLocale;
  onLocaleChange?: (locale: SupportedLocale) => void;
}

export function LanguageSwitcher({
  currentLocale,
  onLocaleChange,
}: LanguageSwitcherProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  let i18nContext: ReturnType<typeof useI18n> | null = null;
  try {
    i18nContext = useI18n();
  } catch (_) {}

  const activeLocale = currentLocale ?? i18nContext?.locale ?? 'en';
  const availableOptions = i18nContext?.availableLocales ?? UI_LOCALE_OPTIONS;

  // Close dropdown on click outside or escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const currentOption =
    availableOptions.find((opt) => opt.code === activeLocale) || availableOptions[0];

  const handleSelect = (code: SupportedLocale) => {
    setIsOpen(false);
    if (onLocaleChange) {
      onLocaleChange(code);
    } else if (i18nContext) {
      i18nContext.setLocale(code);
    } else {
      try {
        localStorage.setItem('kxc_site_lang', code);
      } catch (_) {}
      const url = new URL(window.location.href);
      url.searchParams.set('lang', code);
      window.history.pushState({}, '', url.toString());
      document.documentElement.lang = code;
    }
  };

  return (
    <div className="lang-switcher" ref={dropdownRef}>
      <button
        type="button"
        className="lang-switcher-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select language"
      >
        <Globe size={15} className="lang-icon" />
        <span className="lang-current-label">{currentOption.nativeLabel}</span>
        <ChevronDown size={13} className={`lang-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="lang-dropdown-menu" role="listbox" aria-label="Available languages">
          {availableOptions.map((opt) => {
            const isSelected = opt.code === activeLocale;
            return (
              <button
                key={opt.code}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`lang-option ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(opt.code)}
              >
                <span className="lang-option-label">{opt.nativeLabel}</span>
                <span className="lang-option-code">{opt.code}</span>
                {isSelected && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
