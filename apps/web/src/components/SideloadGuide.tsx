import { useState } from 'react';
import { Download, Copy, Check, ExternalLink, Laptop } from 'lucide-react';
import { useI18n } from '../locales';
import { GITHUB_RELEASE_URL } from '../config';

export function SideloadGuide() {
  const { t } = useI18n();
  const install = t.install;

  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyExtensionsUrl = async () => {
    const text = 'chrome://extensions';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="install-container" data-testid="sideload-guide-container">
      <div className="m5-section-header">
        <span className="m5-badge">{install.badge}</span>
        <h2 className="m5-title">{install.title}</h2>
        <p className="m5-desc">{install.sub}</p>
      </div>

      <div className="install-steps-grid">
        {/* Step 1: Download Release Package */}
        <div className="install-step-card" data-testid="install-step-1">
          <div className="install-step-badge">1</div>
          <h3 className="install-step-title">{install.step1Title}</h3>
          <p className="install-step-desc">{install.step1Desc}</p>
          <div className="install-step-action">
            <a
              href={GITHUB_RELEASE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-install-primary"
              data-testid="download-release-btn"
            >
              <Download size={16} />
              <span>{install.step1Action}</span>
            </a>
          </div>
        </div>

        {/* Step 2: Open Extensions Page & Enable Developer Mode */}
        <div className="install-step-card" data-testid="install-step-2">
          <div className="install-step-badge">2</div>
          <h3 className="install-step-title">{install.step2Title}</h3>
          <p className="install-step-desc">{install.step2Desc}</p>
          <div className="install-step-action">
            <button
              type="button"
              className="code-chip-copy"
              onClick={handleCopyExtensionsUrl}
              data-testid="copy-chrome-extensions-chip"
              title={install.copyTooltip}
              aria-label={install.copyTooltip}
            >
              <span>chrome://extensions</span>
              {copiedUrl ? <Check size={14} className="text-green" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Step 3: Load Unpacked Extension */}
        <div className="install-step-card" data-testid="install-step-3">
          <div className="install-step-badge">3</div>
          <h3 className="install-step-title">{install.step3Title}</h3>
          <p className="install-step-desc">{install.step3Desc}</p>
          <div className="install-step-action">
            <div className="install-step3-visual">
              <img
                src="/logo.svg"
                alt="KeepXClean Logo"
                width={20}
                height={20}
                style={{ borderRadius: 'var(--radius-logo)' }}
              />
              <span>{install.readyStatus}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Notice Banner */}
      <div className="install-notice-banner" data-testid="desktop-notice-banner">
        <Laptop size={18} className="flex-shrink-0 text-muted" />
        <span>{install.desktopNotice}</span>
      </div>
    </div>
  );
}
