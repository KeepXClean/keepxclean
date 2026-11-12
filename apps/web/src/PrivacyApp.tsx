import { useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { PRIVACY_CONTENT, type PrivacyLocaleContent } from './data/privacyContent';
import { I18nProvider, useI18n } from './locales';
import './styles/tokens.css';
import './styles/layout.css';

function PrivacyContent() {
  const { locale, setLocale, t } = useI18n();

  // Determine active privacy language ('zh-CN' vs 'en')
  const isChinese = locale === 'zh-CN' || locale === 'zh-TW';
  const privacyLang: 'en' | 'zh-CN' = isChinese ? 'zh-CN' : 'en';
  const content: PrivacyLocaleContent = PRIVACY_CONTENT[privacyLang];

  // Update document title and lang attribute for legal privacy page
  useEffect(() => {
    document.title =
      privacyLang === 'zh-CN'
        ? '隐私政策（Privacy Policy） — KeepXClean'
        : 'Privacy Policy — KeepXClean';
    document.documentElement.lang = privacyLang;
  }, [privacyLang]);

  const handleTogglePrivacyLang = (target: 'en' | 'zh-CN') => {
    setLocale(target);
  };

  // Informational notice if user selected a non-bilingual locale (e.g. ja, ko, es, etc.)
  const isOtherLocale =
    locale !== 'en' && locale !== 'zh-CN' && locale !== 'zh-TW';

  return (
    <div className="app-shell">
      <Header currentPage="privacy" />

      <main className="main-content privacy-page shell">
        <div className="privacy-toolbar">
          <div className="privacy-lang-toggle" role="group" aria-label="Privacy language selector">
            <button
              type="button"
              className={`privacy-toggle-btn ${privacyLang === 'en' ? 'active' : ''}`}
              onClick={() => handleTogglePrivacyLang('en')}
              aria-pressed={privacyLang === 'en'}
            >
              English
            </button>
            <button
              type="button"
              className={`privacy-toggle-btn ${privacyLang === 'zh-CN' ? 'active' : ''}`}
              onClick={() => handleTogglePrivacyLang('zh-CN')}
              aria-pressed={privacyLang === 'zh-CN'}
            >
              简体中文
            </button>
          </div>

          {isOtherLocale && (
            <div className="privacy-notice">
              {t.privacy?.bilingualNotice || 'Official legal policy is provided in English and Simplified Chinese.'}
            </div>
          )}
        </div>

        <article className="prose-card" data-lang={privacyLang}>
          <header className="prose-header">
            <h1 className="prose-title">{content.title}</h1>
            <p className="prose-meta">
              <span>{content.effectiveDate}</span> · <span>{content.appliesTo}</span>
            </p>
          </header>

          {/* Section 1 */}
          <section className="prose-section">
            <h2>{content.sec1Title}</h2>
            <p>{content.sec1Intro}</p>
            <ul>
              {content.sec1Bullets.map((bullet, idx) => (
                <li key={idx}>{bullet}</li>
              ))}
            </ul>
          </section>

          {/* Section 2 */}
          <section className="prose-section">
            <h2>{content.sec2Title}</h2>
            <p>{content.sec2Intro}</p>
            <ul>
              {content.sec2Bullets.map((bullet, idx) => (
                <li key={idx}>{bullet}</li>
              ))}
            </ul>
            <p>{content.sec2Outro}</p>
          </section>

          {/* Section 3 */}
          <section className="prose-section">
            <h2>{content.sec3Title}</h2>
            <p>{content.sec3Intro}</p>

            <h3>{content.sec3SyncTitle}</h3>
            <p>{content.sec3SyncDesc}</p>

            <h3>{content.sec3ReportTitle}</h3>
            <p>{content.sec3ReportIntro}</p>
            <ul>
              {content.sec3ReportBullets.map((bullet, idx) => (
                <li key={idx}>{bullet}</li>
              ))}
            </ul>
            <p>{content.sec3ReportNote}</p>

            <h3>{content.sec3NativeTitle}</h3>
            <p>{content.sec3NativeDesc}</p>
          </section>

          {/* Section 4 */}
          <section className="prose-section">
            <h2>{content.sec4Title}</h2>
            <div className="permissions-table-wrapper">
              <table className="permissions-table">
                <thead>
                  <tr>
                    <th style={{ width: '38%' }}>{content.sec4Headers[0]}</th>
                    <th style={{ width: '62%' }}>{content.sec4Headers[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {content.sec4Rows.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <div className="permission-badges">
                          {row.permission.map((perm) => (
                            <code key={perm} className="perm-badge">
                              {perm}
                            </code>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="perm-reason">{row.reason}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 5 */}
          <section className="prose-section">
            <h2>{content.sec5Title}</h2>
            <ul>
              {content.sec5Bullets.map((bullet, idx) => (
                <li key={idx}>
                  <strong>{bullet.label} </strong>
                  <span>{bullet.text}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Section 6 */}
          <section className="prose-section">
            <h2>{content.sec6Title}</h2>
            <p>
              {content.sec6Intro}{' '}
              <a href={`mailto:${content.contactEmail}`}>{content.contactEmail}</a>
            </p>
          </section>
        </article>
      </main>

      <Footer currentPage="privacy" />
    </div>
  );
}

export function PrivacyApp() {
  return (
    <I18nProvider syncDomMeta={false}>
      <PrivacyContent />
    </I18nProvider>
  );
}

export default PrivacyApp;
