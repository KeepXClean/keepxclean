import { ExternalLink } from 'lucide-react';
import { useI18n } from '../locales';
import {
  API_STATS_URL,
  AUTHOR_30STO_LABEL,
  AUTHOR_30STO_URL,
  AUTHOR_X_HANDLE,
  AUTHOR_X_URL,
  CWS_LIVE,
  CWS_STORE_URL,
  GITHUB_ISSUES_URL,
  GITHUB_LICENSE_URL,
  GITHUB_RELEASE_URL,
  GITHUB_REPO_URL,
  PRIVACY_EMAIL,
} from '../config';

const AUTHOR_BYLINE_LABELS: Record<string, string> = {
  en: 'Author',
  'zh-CN': '作者',
  'zh-TW': '作者',
  ja: '作者',
  ko: '제작자',
  es: 'Autor',
  pt: 'Autor',
  fr: 'Auteur',
  de: 'Autor',
  ru: 'Автор',
};

export interface FooterProps {
  currentPage?: 'home' | 'privacy';
}

export function Footer({ currentPage = 'home' }: FooterProps) {
  const { locale, t } = useI18n();
  const currentYear = new Date().getFullYear();
  const linkPrefix = currentPage === 'privacy' ? '/' : '';
  const authorLabel = AUTHOR_BYLINE_LABELS[locale] || AUTHOR_BYLINE_LABELS.en;

  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-top">
          {/* Brand Column */}
          <div className="footer-brand-col">
            <a href="/" className="footer-brand" aria-label="KeepXClean Home">
              <img
                src="/logo.svg"
                alt="KeepXClean Logo"
                width={28}
                height={28}
                className="brand-logo-img"
              />
              <span className="brand-name">KeepXClean</span>
            </a>
            <p className="footer-tagline">
              {t.footer.tagline}
            </p>
            <div className="footer-badges">
              <span className="footer-badge">{t.footer.badgeEarlyAccess}</span>
              <span className="footer-badge">{t.footer.badgeLocalFirst}</span>
              <span className="footer-badge">{t.footer.badgeLanguages}</span>
            </div>
            <div className="footer-author-row" data-testid="footer-author-links">
              <span className="footer-author-label">{authorLabel}:</span>
              <a
                href={AUTHOR_X_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-author-pill"
              >
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 1200 1227"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z" />
                </svg>
                <span>{AUTHOR_X_HANDLE}</span>
              </a>
              <a
                href={AUTHOR_30STO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-author-pill"
              >
                <ExternalLink size={12} aria-hidden="true" />
                <span>{AUTHOR_30STO_LABEL}</span>
              </a>
            </div>
          </div>

          {/* Links Grid */}
          <div className="footer-links-grid">
            <div className="footer-col">
              <h4 className="footer-col-title">{t.footer.colProduct}</h4>
              <ul className="footer-links-list">
                <li><a href={`${linkPrefix}#hero`}>{t.footer.sandbox}</a></li>
                <li><a href={`${linkPrefix}#features`}>{t.footer.bento}</a></li>
                <li><a href={`${linkPrefix}#architecture`}>{t.footer.architecture}</a></li>
                <li><a href={`${linkPrefix}#stats`}>{t.footer.stats}</a></li>
                <li><a href={`${linkPrefix}#install`}>{t.footer.install}</a></li>
                <li><a href={`${linkPrefix}#faq`}>{t.footer.faq}</a></li>
              </ul>
            </div>

            <div className="footer-col">
              <h4 className="footer-col-title">{t.footer.colResources}</h4>
              <ul className="footer-links-list">
                {CWS_LIVE && (
                  <li>
                    <a
                      href={CWS_STORE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Chrome Web Store
                    </a>
                  </li>
                )}
                <li>
                  <a
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.footer.githubRepo}
                  </a>
                </li>
                <li>
                  <a
                    href={GITHUB_RELEASE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.footer.releaseZip}
                  </a>
                </li>
                <li>
                  <a
                    href={API_STATS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.footer.statsApi}
                  </a>
                </li>
                <li>
                  <a
                    href={GITHUB_ISSUES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.footer.issues}
                  </a>
                </li>
              </ul>
            </div>

            <div className="footer-col">
              <h4 className="footer-col-title">{t.footer.colLegal}</h4>
              <ul className="footer-links-list">
                <li>
                  <a href="/privacy/" className="footer-privacy-link">
                    {t.footer.privacyPolicy}
                  </a>
                </li>
                <li>
                  <a
                    href={GITHUB_LICENSE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.footer.mitLicense}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${PRIVACY_EMAIL}`}>
                    {PRIVACY_EMAIL}
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="copyright-text">
            © {currentYear} KeepXClean contributors · {authorLabel}:{' '}
            <a
              href={AUTHOR_X_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              X ({AUTHOR_X_HANDLE})
            </a>
            {' · '}
            <a
              href={AUTHOR_30STO_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {AUTHOR_30STO_LABEL}
            </a>
            {' · '}
            {t.footer.releasedUnder}{' '}
            <a
              href={GITHUB_LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              MIT License
            </a>.
          </p>
          <p className="disclaimer-text">
            {t.footer.disclaimer}
          </p>
        </div>
      </div>
    </footer>
  );
}
