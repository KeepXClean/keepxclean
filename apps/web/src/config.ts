/**
 * KeepXClean Web Application Configuration & Store Constants
 *
 * Feature 23: Primary CTA & Chrome Web Store Reservation
 * Governs Chrome Web Store ID, live status toggle, repository URLs, and stats endpoints.
 */

/**
 * Chrome Web Store extension ID reserved for KeepXClean
 */
export const CWS_EXTENSION_ID = 'plngcinmibjmkjjpfjemhfabjfjjkhhd';

/**
 * CWS_LIVE toggle:
 * - false: Chrome Web Store submission is under review. Primary CTA points to GitHub Release v0.1.0 (.zip)
 *          accompanied by a "Chrome Web Store under review" / "Chrome 商店审核中" badge.
 * - true:  Chrome Web Store is approved & live. Primary CTA points directly to CWS_STORE_URL ("Add to Chrome").
 */
export const CWS_LIVE = true;

/**
 * Direct link to the Chrome Web Store listing for KeepXClean
 */
export const CWS_STORE_URL = `https://chromewebstore.google.com/detail/keepxclean/${CWS_EXTENSION_ID}`;

/**
 * Direct link to the latest GitHub Release (currently v0.1.0)
 */
export const GITHUB_RELEASE_URL = 'https://github.com/KeepXClean/keepxclean/releases/latest';

/**
 * Public GitHub repository root
 */
export const GITHUB_REPO_URL = 'https://github.com/KeepXClean/keepxclean';

/**
 * GitHub Issues URL for bug reports and feature requests
 */
export const GITHUB_ISSUES_URL = 'https://github.com/KeepXClean/keepxclean/issues';

/**
 * GitHub License URL
 */
export const GITHUB_LICENSE_URL = 'https://github.com/KeepXClean/keepxclean/blob/main/LICENSE';

/**
 * Public real-time community defense statistics API endpoint
 */
export const API_STATS_URL = 'https://api.keepxclean.com/v1/stats';

/**
 * Official compliance and privacy contact email
 */
export const PRIVACY_EMAIL = 'privacy@keepxclean.com';

/**
 * Author profile links
 */
export const AUTHOR_X_HANDLE = '@linheitu';
export const AUTHOR_X_URL = 'https://x.com/linheitu';
export const AUTHOR_30STO_LABEL = '30s.to/@linmo';
export const AUTHOR_30STO_URL = 'https://30s.to/@linmo';

/**
 * Current release version tag
 */
export const CURRENT_VERSION = 'v0.1.1';

/**
 * Runtime CTA configuration snapshot
 */
export interface ActiveCtaConfig {
  cwsLive: boolean;
  cwsExtensionId: string;
  cwsStoreUrl: string;
  githubReleaseUrl: string;
  githubRepoUrl: string;
  primaryUrl: string;
  secondaryUrl: string;
  isStore: boolean;
}

export function getActiveCtaConfig(cwsLiveOverride?: boolean): ActiveCtaConfig {
  const isLive = cwsLiveOverride !== undefined ? cwsLiveOverride : CWS_LIVE;
  return {
    cwsLive: isLive,
    cwsExtensionId: CWS_EXTENSION_ID,
    cwsStoreUrl: CWS_STORE_URL,
    githubReleaseUrl: GITHUB_RELEASE_URL,
    githubRepoUrl: GITHUB_REPO_URL,
    primaryUrl: isLive ? CWS_STORE_URL : GITHUB_RELEASE_URL,
    secondaryUrl: GITHUB_REPO_URL,
    isStore: isLive,
  };
}
