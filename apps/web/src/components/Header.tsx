import { useState } from 'react';
import { Download, Github, Menu, X, ExternalLink } from 'lucide-react';
import { type SupportedLocale } from '@keepxclean/shared';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useI18n } from '../locales';
import {
  CWS_LIVE,
  CWS_STORE_URL,
  GITHUB_RELEASE_URL,
  GITHUB_REPO_URL,
} from '../config';

export interface HeaderProps {
  currentPage?: 'home' | 'privacy';
  locale?: SupportedLocale;
  onLocaleChange?: (locale: SupportedLocale) => void;
}

export function Header({
  currentPage = 'home',
  locale: propLocale,
  onLocaleChange: propOnLocaleChange,
}: HeaderProps = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { locale: ctxLocale, setLocale: ctxSetLocale, t } = useI18n();

  // Use props if explicitly passed (for backwards compatibility/testing), else context
  const activeLocale = propLocale ?? ctxLocale;
  const handleLocaleChange = propOnLocaleChange ?? ctxSetLocale;

  // Link prefix: if on /privacy/, anchor links should navigate to /#features
  const linkPrefix = currentPage === 'privacy' ? '/' : '';

  const ctaUrl = CWS_LIVE ? CWS_STORE_URL : GITHUB_RELEASE_URL;
  const ctaLabel = CWS_LIVE ? (t.nav.addToChrome || 'Add to Chrome') : t.nav.downloadCta;

  return (
    <header className="site-header">
      <div className="header-inner shell">
        {/* Brand Logo & Name */}
        <a href="/" className="brand-link" aria-label="KeepXClean Home">
          <img
            src="/logo.svg"
            alt="KeepXClean Logo"
            width={32}
            height={32}
            className="brand-logo-img"
          />
          <span className="brand-name">KeepXClean</span>
        </a>

        {/* Desktop Navigation */}
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href={`${linkPrefix}#features`} className="nav-item">
            {t.nav.features}
          </a>
          <a href={`${linkPrefix}#architecture`} className="nav-item">
            {t.nav.architecture}
          </a>
          <a href={`${linkPrefix}#stats`} className="nav-item">
            {t.nav.stats}
          </a>
          <a href={`${linkPrefix}#install`} className="nav-item">
            {t.nav.install}
          </a>
          <a href={`${linkPrefix}#faq`} className="nav-item">
            {t.nav.faq}
          </a>
        </nav>

        {/* Header Actions */}
        <div className="header-actions">
          {/* 10-Language Switcher */}
          <LanguageSwitcher
            currentLocale={activeLocale}
            onLocaleChange={handleLocaleChange}
          />

          {/* GitHub Repository */}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
            aria-label="GitHub Repository"
            title={t.nav.github}
          >
            <Github size={18} />
          </a>

          {/* Dynamic CTA Button & Optional Review Badge */}
          <div className="header-cta-group">
            {!CWS_LIVE && (
              <span
                className="header-cws-badge"
                title="Chrome Web Store review in progress"
              >
                <span className="status-dot-pulse" aria-hidden="true" />
                <span>{t.nav.cwsReviewBadge}</span>
              </span>
            )}
            <a
              href={ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-header-cta"
            >
              {CWS_LIVE ? <ExternalLink size={14} /> : <Download size={14} />}
              <span>{ctaLabel}</span>
            </a>
          </div>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-menu-drawer">
          <nav className="mobile-nav" aria-label="Mobile navigation">
            <a href={`${linkPrefix}#features`} onClick={() => setMobileMenuOpen(false)}>
              {t.nav.features}
            </a>
            <a href={`${linkPrefix}#architecture`} onClick={() => setMobileMenuOpen(false)}>
              {t.nav.architecture}
            </a>
            <a href={`${linkPrefix}#stats`} onClick={() => setMobileMenuOpen(false)}>
              {t.nav.stats}
            </a>
            <a href={`${linkPrefix}#install`} onClick={() => setMobileMenuOpen(false)}>
              {t.nav.install}
            </a>
            <a href={`${linkPrefix}#faq`} onClick={() => setMobileMenuOpen(false)}>
              {t.nav.faq}
            </a>
            <a href="/privacy/" onClick={() => setMobileMenuOpen(false)}>
              {t.nav.privacy}
            </a>
          </nav>

          <div className="mobile-menu-footer">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mobile-github-link"
            >
              <Github size={16} />
              <span>GitHub</span>
            </a>

            <div className="mobile-cta-group">
              {!CWS_LIVE && (
                <span className="mobile-cws-badge">
                  <span className="status-dot-pulse" aria-hidden="true" />
                  <span>{t.nav.cwsReviewBadge}</span>
                </span>
              )}
              <a
                href={ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-header-cta"
                style={{ display: 'inline-flex' }}
              >
                {CWS_LIVE ? <ExternalLink size={14} /> : <Download size={14} />}
                <span>{ctaLabel}</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
