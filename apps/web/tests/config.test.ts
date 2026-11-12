import { describe, it, expect } from 'vitest';
import {
  CWS_EXTENSION_ID,
  CWS_LIVE,
  CWS_STORE_URL,
  GITHUB_RELEASE_URL,
  GITHUB_REPO_URL,
  GITHUB_ISSUES_URL,
  GITHUB_LICENSE_URL,
  API_STATS_URL,
  PRIVACY_EMAIL,
  AUTHOR_X_URL,
  AUTHOR_30STO_URL,
  CURRENT_VERSION,
  getActiveCtaConfig,
} from '../src/config';

describe('Feature 23: CTA Configuration & CWS Reservation', () => {
  it('CWS_EXTENSION_ID matches the official Chrome Web Store ID', () => {
    expect(CWS_EXTENSION_ID).toBe('plngcinmibjmkjjpfjemhfabjfjjkhhd');
  });

  it('CWS_LIVE is a boolean and enabled (true) now that Chrome Web Store is approved', () => {
    expect(typeof CWS_LIVE).toBe('boolean');
    expect(CWS_LIVE).toBe(true);
  });

  it('CWS_STORE_URL is accurately constructed from CWS_EXTENSION_ID', () => {
    expect(CWS_STORE_URL).toBe(
      'https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd'
    );
  });

  it('GitHub release and repository URLs point to KeepXClean official targets', () => {
    expect(GITHUB_RELEASE_URL).toBe(
      'https://github.com/KeepXClean/keepxclean/releases/latest'
    );
    expect(GITHUB_REPO_URL).toBe('https://github.com/KeepXClean/keepxclean');
    expect(GITHUB_ISSUES_URL).toBe('https://github.com/KeepXClean/keepxclean/issues');
    expect(GITHUB_LICENSE_URL).toBe('https://github.com/KeepXClean/keepxclean/blob/main/LICENSE');
  });

  it('API_STATS_URL points to official Cloudflare Workers statistics endpoint', () => {
    expect(API_STATS_URL).toBe('https://api.keepxclean.com/v1/stats');
  });

  it('PRIVACY_EMAIL, AUTHOR links, and CURRENT_VERSION are correct', () => {
    expect(PRIVACY_EMAIL).toBe('privacy@keepxclean.com');
    expect(AUTHOR_X_URL).toBe('https://x.com/linheitu');
    expect(AUTHOR_30STO_URL).toBe('https://30s.to/@linmo');
    expect(CURRENT_VERSION).toBe('v0.1.1');
  });

  it('getActiveCtaConfig returns Chrome Web Store URL by default when CWS_LIVE is true', () => {
    const config = getActiveCtaConfig();
    expect(config.cwsLive).toBe(true);
    expect(config.primaryUrl).toBe(CWS_STORE_URL);
    expect(config.secondaryUrl).toBe(GITHUB_REPO_URL);
    expect(config.isStore).toBe(true);
  });

  it('getActiveCtaConfig returns GitHub release when cwsLive is overridden to false', () => {
    const config = getActiveCtaConfig(false);
    expect(config.cwsLive).toBe(false);
    expect(config.primaryUrl).toBe(GITHUB_RELEASE_URL);
    expect(config.secondaryUrl).toBe(GITHUB_REPO_URL);
    expect(config.isStore).toBe(false);
  });
});
