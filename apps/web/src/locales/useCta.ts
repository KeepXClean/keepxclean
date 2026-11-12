import { useI18n } from './I18nContext';
import {
  CWS_LIVE,
  CWS_EXTENSION_ID,
  CWS_STORE_URL,
  GITHUB_RELEASE_URL,
  GITHUB_REPO_URL,
  CURRENT_VERSION,
} from '../config';

export interface UseCtaReturn {
  cwsLive: boolean;
  version: string;
  cwsExtensionId: string;
  cwsStoreUrl: string;
  githubReleaseUrl: string;
  githubRepoUrl: string;
  primaryUrl: string;
  secondaryUrl: string;
  primaryLabel: string;
  secondaryLabel: string;
  shortPrimaryLabel: string;
  badgeText?: string;
  headerBadgeText?: string;
  isStore: boolean;
}

export function useCta(cwsLiveOverride?: boolean): UseCtaReturn {
  const { t } = useI18n();
  const isLive = cwsLiveOverride !== undefined ? cwsLiveOverride : CWS_LIVE;

  const primaryUrl = isLive ? CWS_STORE_URL : GITHUB_RELEASE_URL;
  const secondaryUrl = GITHUB_REPO_URL;
  const primaryLabel = isLive
    ? t.hero.ctaStore || t.nav.addToChrome || 'Add to Chrome'
    : t.hero.ctaPrimary;
  const secondaryLabel = t.hero.ctaSecondary;
  const shortPrimaryLabel = isLive
    ? t.nav.addToChrome || 'Add to Chrome'
    : t.nav.downloadCta;

  return {
    cwsLive: isLive,
    version: CURRENT_VERSION,
    cwsExtensionId: CWS_EXTENSION_ID,
    cwsStoreUrl: CWS_STORE_URL,
    githubReleaseUrl: GITHUB_RELEASE_URL,
    githubRepoUrl: GITHUB_REPO_URL,
    primaryUrl,
    secondaryUrl,
    primaryLabel,
    secondaryLabel,
    shortPrimaryLabel,
    badgeText: !isLive ? t.hero.cwsBadge : undefined,
    headerBadgeText: !isLive ? t.nav.cwsReviewBadge : undefined,
    isStore: isLive,
  };
}
