import type { SupportedLocale } from '@keepxclean/shared';

export interface MetaTranslations {
  title: string;
  description: string;
}

export interface NavTranslations {
  logo: string;
  features: string;
  architecture: string;
  stats: string;
  install: string;
  faq: string;
  privacy: string;
  github: string;
  downloadCta: string;
  addToChrome: string;
  cwsBadge: string;
  cwsReviewBadge: string;
  openMenu: string;
  closeMenu: string;
}

export interface HeroTranslations {
  badge: string;
  cwsReview: string;
  cwsBadge: string;
  headline: string;
  headlinePrefix: string;
  headlineHighlight: string;
  subheadline: string;
  ctaDownload: string;
  ctaPrimary: string;
  ctaStore: string;
  ctaSecondary: string;
  ctaGitHub: string;
  releaseNote: string;
}

export interface SandboxFoldedBarTranslations {
  expand: string;
  collapse: string;
  blockedBy: string;
  reason: string;
  rule: string;
  evidence: string;
}

export interface SandboxUndoToastTranslations {
  blockedMsg: string;
  undoBtn: string;
  restoredMsg: string;
}

export interface SandboxFocalTweetTranslations {
  author: string;
  handle: string;
  content: string;
  time: string;
  replies: string;
  reposts: string;
  likes: string;
}

export interface SandboxTranslations {
  title: string;
  livePreview: string;
  autoCleanNotice: string;
  masterToggle: string;
  masterToggleOn: string;
  masterToggleOff: string;
  presetsLabel: string;
  presetMild: string;
  presetStandard: string;
  presetStrict: string;
  presetMildDesc: string;
  presetStandardDesc: string;
  presetStrictDesc: string;
  displayModeLabel: string;
  modeHide: string;
  modeFold: string;
  categoriesLabel: string;
  categoryImpersonator: string;
  categoryShortReply: string;
  categoryGiveaway: string;
  categoryCrypto: string;
  categoryAds: string;
  counterLabel: string;
  counterSuffix: string;
  quickCleanTooltip: string;
  discussionHeader: string;
  foldedBar: SandboxFoldedBarTranslations;
  undoToast: SandboxUndoToastTranslations;
  focalTweet: SandboxFocalTweetTranslations;
}

export interface BentoCard1Translations {
  tag: string;
  title: string;
  desc: string;
  categoryAll: string;
  categoryCliche: string;
  categoryCrypto: string;
  categoryFollow: string;
  categoryNsfw: string;
  categoryScam: string;
  enabled: string;
  disabled: string;
  copyRegex: string;
  copied: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  clearSearch: string;
  inspectRegex: string;
  closeInspector: string;
}

export interface BentoCard2Translations {
  tag: string;
  title: string;
  desc: string;
  step1: string;
  step1Desc: string;
  step2: string;
  step2Desc: string;
  step3: string;
  step3Desc: string;
  undoActive: string;
  undoPrompt: string;
  rollbackCompleted: string;
  settledCompleted: string;
  replayDemo: string;
}

export interface BentoCard3Translations {
  tag: string;
  title: string;
  desc: string;
  exemptionLabel: string;
  exemptionDesc: string;
  badgeAccountAge: string;
  badgeDailyRate: string;
  badgeCrowdFlags: string;
  badgeActionMark: string;
  actionWhitelist: string;
  actionClean: string;
  verifiedBotBadge: string;
  followingCount: string;
  followersCount: string;
  whitelistedBadge: string;
  locallyBlockedBadge: string;
  tooltipAccountAge: string;
  tooltipDailyRate: string;
  tooltipCrowdFlags: string;
  timelineCollapsedNotice: string;
  timelineVisibleNotice: string;
  undoButton: string;
  toggleFollowingLabel: string;
  statusFollowing: string;
  statusNotFollowing: string;
}

export interface BentoCard4Translations {
  tag: string;
  title: string;
  desc: string;
  modeAllow: string;
  modeBlock: string;
  mediaExemptionTitle: string;
  mediaExemptionDesc: string;
  sampleLanguages: string;
  allowModeDesc: string;
  blockModeDesc: string;
  sampleMediaNotice: string;
  filteredByLangNotice: string;
  normalLangNotice: string;
  toggleMediaLabel: string;
}

export interface BentoTranslations {
  badge: string;
  title: string;
  sub: string;
  sectionTitle: string;
  sectionDesc: string;
  card1: BentoCard1Translations;
  card2: BentoCard2Translations;
  card3: BentoCard3Translations;
  card4: BentoCard4Translations;
}

export interface ArchitectureTranslations {
  badge: string;
  title: string;
  sub: string;
  sectionTitle: string;
  sectionDesc: string;
  stepPrefix: string;
  dataIngest: string;
  executionLogic: string;
  privacyAssurance: string;
  step1Title: string;
  step1Desc: string;
  step2Title: string;
  step2Desc: string;
  step3Title: string;
  step3Desc: string;
  step4Title: string;
  step4Desc: string;
  assuranceTitle: string;
  assurance1: string;
  assurance1Desc: string;
  assurance2: string;
  assurance2Desc: string;
  assurance3: string;
  assurance3Desc: string;
}

export interface StatsTranslations {
  badge: string;
  title: string;
  sub: string;
  sectionTitle: string;
  sectionDesc: string;
  metricAccounts: string;
  metricAccountsDesc: string;
  metricBlocked: string;
  metricBlockedDesc: string;
  metricVotes: string;
  metricVotesDesc: string;
  metricLanguages: string;
  metricLanguagesDesc: string;
  liveIndicator: string;
  fallbackNotice: string;
}

export interface InstallTranslations {
  badge: string;
  title: string;
  sub: string;
  sectionTitle: string;
  sectionDesc: string;
  copyTooltip: string;
  readyStatus: string;
  step1Title: string;
  step1Desc: string;
  step1Action: string;
  step2Title: string;
  step2Desc: string;
  step3Title: string;
  step3Desc: string;
  desktopNotice: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqTranslations {
  badge: string;
  title: string;
  sub: string;
  sectionTitle: string;
  sectionDesc: string;
  items: FaqItem[];
}

export interface FooterTranslations {
  tagline: string;
  badgeEarlyAccess: string;
  badgeLocalFirst: string;
  badgeLanguages: string;
  colProduct: string;
  colResources: string;
  colLegal: string;
  sandbox: string;
  bento: string;
  architecture: string;
  stats: string;
  install: string;
  faq: string;
  githubRepo: string;
  releaseZip: string;
  statsApi: string;
  issues: string;
  privacyPolicy: string;
  mitLicense: string;
  contact: string;
  releasedUnder: string;
  copyright: string;
  disclaimer: string;
}

export interface PrivacyPageTranslations {
  backToHome: string;
  bilingualNotice: string;
  notice: string;
  viewEnglish: string;
  viewChinese: string;
}

export interface PromoVideoTranslations {
  badge: string;
  title: string;
  sub: string;
  ariaLabel: string;
}

export interface TranslationDictionary {
  locale: SupportedLocale;
  meta: MetaTranslations;
  nav: NavTranslations;
  hero: HeroTranslations;
  sandbox: SandboxTranslations;
  bento: BentoTranslations;
  architecture: ArchitectureTranslations;
  stats: StatsTranslations;
  install: InstallTranslations;
  faq: FaqTranslations;
  footer: FooterTranslations;
  promoVideo: PromoVideoTranslations;
  privacy: PrivacyPageTranslations;
}
