import { useI18n } from '../locales';
import {
  API_STATS_URL,
  CWS_LIVE,
  CWS_STORE_URL,
  GITHUB_ISSUES_URL,
  GITHUB_LICENSE_URL,
  GITHUB_RELEASE_URL,
  GITHUB_REPO_URL,
  PRIVACY_EMAIL,
} from '../config';

export interface FooterProps {
  currentPage?: 'home' | 'privacy';
}

export function Footer({ currentPage = 'home' }: FooterProps) {
  const { t } = useI18n();
  const currentYear = new Date().getFullYear();
  const linkPrefix = currentPage === 'privacy' ? '/' : '';

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
            © {currentYear} KeepXClean contributors. {t.footer.releasedUnder}{' '}
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
