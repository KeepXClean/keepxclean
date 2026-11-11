import type { FilterRulesConfig, KeywordMatchScope } from '@keepxclean/shared';

export type ImportStatusKey =
  | 'reading'
  | 'preview'
  | 'saving'
  | 'sharing'
  | 'done'
  | 'error'
  | 'cancelled';

export type StageKey =
  | 'not_requested'
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'not_counted'
  | 'failed'
  | 'unknown'
  | 'cancelled';

export type CloudCategoryKey =
  | 'all'
  | 'cliche'
  | 'crypto'
  | 'follow'
  | 'scam'
  | 'nsfw_black';

export interface ExtensionMessages {
  meta: {
    optionsTitle: (section: string) => string;
    popupTitle: string;
  };
  nav: {
    ariaLabel: string;
    rules: string;
    keywords: string;
    accounts: string;
    history: string;
    preferences: string;
    tagline: string;
    localFirst: string;
    statusActive: string;
    statusCleaning: string;
    statusPaused: string;
    enableFilter: string;
    openFullSettings: string;
    fullSettings: string;
  };
  common: {
    cancel: string;
    close: string;
    confirm: string;
    dismiss: string;
    search: string;
    reloadXPage: string;
    reloadX: string;
    reloadXApply: string;
    reloaded: string;
    noOpenXTab: string;
    saving: string;
    saveFailed: string;
    saved: string;
    loading: string;
    loadConfigError: (err: string) => string;
    reload: string;
    exportRawData: string;
    restoreDefaults: string;
    restoreDefaultsConfirmTitle: string;
    restoreDefaultsConfirmBody: string;
    paginationSummary: (count: string) => string;
    prevPage: string;
    nextPage: string;
    neverSynced: string;
    sliderLabel: (label: string) => string;
    numberValidationError: (min: number, integer: boolean) => string;
    on: string;
    off: string;
    none: string;
  };
  presets: {
    lightTitle: string;
    lightDesc: string;
    standardTitle: string;
    standardBadge: string;
    standardDesc: string;
    strictTitle: string;
    strictDesc: string;
    customBadge: string;
    customParams: string;
    liveBadge: string;
    restoreStandard: string;
    presentationLabel: string;
    modeStrip: string;
    modeCollapse: string;
  };
  rules: {
    pageTitle: string;
    pageDesc: string;
    pausedBanner: string;
    resumeCleaning: string;
    strengthTitle: string;
    strengthDesc: string;
    presentationTitle: string;
    presentationDesc: string;
    dimensionsHeading: string;
    enabledCount: (active: number, total: number) => string;
    enableRule: (title: string) => string;
    expandParams: (open: boolean, title: string) => string;
    manageKeywordsLink: string;
    exemptionsTitle: string;
    exemptionsDesc: string;
    exemptFollowingTitle: string;
    exemptFollowingDesc: string;
    profileBadgeOnlyTitle: string;
    profileBadgeOnlyDesc: string;
    langModeTitle: string;
    langModeDesc: string;
    langModeAllow: string;
    langModeBlock: string;
    langAllowHeading: string;
    langBlockHeading: string;
    langSelectedCount: (count: number) => string;
    langGridAria: string;
    defs: Record<
      keyof FilterRulesConfig,
      { title: string; desc: string; note: string }
    >;
    fields: {
      minWeightedLength: { title: string; unit: string };
      bioLinkMaxFollowers: { title: string; unit: string };
      maxDailyTweets: { title: string; unit: string };
      slidingWindowHours: { title: string; unit: string };
      slidingWindowMaxTweets: { title: string; unit: string };
      minBlockCount: { title: string; unit: string };
      maxHashtags: { title: string; unit: string };
      maxCashtags: { title: string; unit: string };
      minAccountAgeDays: { title: string; unit: string };
      maxFollowRatio: { title: string; unit: string };
      minFollowingForRatioCheck: { title: string; unit: string };
      detectImpersonation: string;
      blockShortOrEmoji: string;
      blockBioLinkSpam: string;
      blockPureMediaReplies: string;
      blockCommentGiveaway: string;
      blockFollowBack: string;
      slidingWindowEnabled: string;
      blockDefaultAvatarInReplies: string;
    };
    summary: {
      disabled: string;
      enabledSelectItems: string;
      impersonation: string;
      shortReply: (weight: number, cjkApprox: number) => string;
      bioLink: (followers: string) => string;
      pureMedia: string;
      giveaway: string;
      followBack: string;
      engagementPrefix: (parts: string) => string;
      highFreq: (
        daily: number,
        windowEnabled: boolean,
        hours: number,
        maxWindow: number
      ) => string;
      crowdBlock: (min: number) => string;
      keywordsLocalOn: (count: number) => string;
      keywordsLocalOff: string;
      keywordsCloudAll: (count: number) => string;
      keywordsCloudPartial: (active: number, total: number) => string;
      keywordsCloudOff: string;
      tagSpam: (hashtags: number, cashtags: number) => string;
      minAge: (days: number) => string;
      defaultAvatar: string;
      followRatio: (ratio: number) => string;
      langEmpty: string;
      langSummary: (
        mode: 'allow' | 'block',
        list: string,
        total: number,
        truncated: boolean
      ) => string;
      hideAds: string;
    };
  };
  quick: {
    pausedBanner: string;
    todayCleaned: string;
    todayCleanedPartial: string;
    totalCleaned: string;
    adsHiddenBadge: (count: string) => string;
    adsHiddenTooltip: string;
    strengthHeading: string;
    presentationHeading: string;
    dailyMaxLabel: string;
    dailyMaxUnit: string;
    crowdMinLabel: string;
    crowdMinUnit: string;
    exemptFollowing: string;
    quickKeywordHeading: string;
    manageKeywords: string;
    quickKeywordAria: string;
    quickKeywordPlaceholder: string;
    addKeywordAria: string;
    exempt20kLabel: string;
    addedKeywordExempt: string;
    addedKeywordAll: string;
    recentHeading: string;
    allLogs: string;
    whitelistedPill: string;
    whitelistBtn: string;
    whitelistAria: (target: string) => string;
    whitelistedStripMsg: (target: string) => string;
    whitelistedMsg: (target: string) => string;
    emptyTitle: string;
    emptyDesc: string;
    refreshSnapshotAria: string;
  };
  keywords: {
    pageTitle: string;
    pageDesc: string;
    addBtn: string;
    tabLocal: (count: number) => string;
    tabCloudAll: (count: number) => string;
    tabCloudPartial: (active: number, total: number) => string;
    enableLocalTitle: string;
    enableLocalDesc: string;
    enableCloudTitle: string;
    enableCloudDesc: string;
    enableAllBtn: string;
    categoryAria: string;
    categories: Record<CloudCategoryKey, string>;
    searchPlaceholder: string;
    disableCategory: string;
    enableCategory: string;
    localCount: (count: number) => string;
    cloudActiveCount: (active: number, total: number) => string;
    cloudMasterOff: (total: number) => string;
    colCloudPack: string;
    colPattern: string;
    colScopes: string;
    colExempt: string;
    colActions: string;
    regexPill: string;
    noNote: string;
    scopes: Record<KeywordMatchScope, string>;
    onlyRepliesPill: string;
    enableItemAria: (pattern: string) => string;
    editItemAria: (pattern: string) => string;
    deleteItemAria: (pattern: string) => string;
    customizeBtn: string;
    customizeTooltip: string;
    customizeAria: (label: string) => string;
    enableCloudItemAria: (label: string) => string;
    upstreamPaused: string;
    emptySearchTitle: string;
    emptySearchDesc: string;
    emptyInitTitle: string;
    emptyInitDesc: string;
    customizedNotice: (label: string) => string;
    deleteConfirmTitle: string;
    deleteConfirmBtn: string;
    editor: {
      customizeTitle: string;
      editTitle: string;
      addTitle: string;
      customizeDesc: string;
      defaultDesc: string;
      saveCustomizeBtn: string;
      saveEditBtn: string;
      saveAddBtn: string;
      typeLabel: string;
      typeText: string;
      typeRegex: string;
      regexFieldLabel: string;
      textFieldLabel: string;
      regexHelp: string;
      textHelp: string;
      regexPlaceholder: string;
      textPlaceholder: string;
      scopesLegend: string;
      onlyRepliesTitle: string;
      onlyRepliesDesc: string;
      exemptTitle: string;
      exemptDesc: string;
      exemptThresholdLabel: string;
      exemptPositiveError: string;
      noteLabel: string;
      notePlaceholder: string;
      enableItemTitle: string;
      discardTitle: string;
      discardBtn: string;
      discardBody: string;
    };
  };
  accounts: {
    pageTitle: string;
    pageDesc: string;
    importFromXBtn: string;
    addAccountBtn: string;
    tabBlack: (count: number) => string;
    tabWhite: (count: number) => string;
    tabCommunity: (count: number) => string;
    bannerWhite: string;
    bannerCommunity: string;
    bannerBlack: string;
    searchPlaceholder: string;
    accountCount: (count: string) => string;
    snapshotGeneratedAt: (time: string) => string;
    colAccount: string;
    colCommunityVotes: string;
    colAddedAt: string;
    colCategoryNote: string;
    colActions: string;
    openProfileTooltip: string;
    votesCount: (count: number) => string;
    highFollowerShieldPill: string;
    manualAdded: string;
    inWhitelistPill: string;
    exemptBtn: string;
    moveToWhiteBtn: string;
    moveToWhiteTooltip: string;
    removeAria: (uid: string) => string;
    removeTooltip: string;
    emptySearchTitle: string;
    emptySearchDesc: string;
    emptyWhiteTitle: string;
    emptyWhiteDesc: string;
    emptyCommunityTitle: string;
    emptyCommunityDesc: string;
    emptyBlackTitle: string;
    emptyBlackDesc: string;
    recentImportsTitle: string;
    importSummary: (added: number, statusText: string) => string;
    importStatuses: Record<ImportStatusKey, string>;
    viewResultBtn: string;
    addedNotice: (account: string, isWhite: boolean) => string;
    removeConfirmTitle: string;
    removeConfirmBtn: string;
    removeConfirmBody: (account: string) => string;
    whitelistConfirmTitle: string;
    whitelistConfirmBtn: string;
    whitelistConfirmBody: string;
    editor: {
      titleWhite: string;
      titleBlack: string;
      desc: string;
      resolvingBtn: string;
      confirmBtn: string;
      queryLabel: string;
      queryHelp: string;
      queryPlaceholder: string;
      categoryLabel: string;
      displayNameLabel: string;
      displayNamePlaceholder: string;
      noteLabel: string;
      notePlaceholder: string;
      bannerWhite: string;
      bannerBlack: string;
    };
  };
  importWizard: {
    title: string;
    desc: string;
    closeContinueBg: string;
    stopRemaining: string;
    readBlocklistBtn: string;
    confirmImportBtn: (count: string) => string;
    rereadBtn: string;
    selectTabLabel: string;
    selectTabHelp: string;
    selectTabPlaceholder: string;
    noTabTitle: string;
    noTabDesc: string;
    openXBtn: string;
    readSafeBanner: string;
    readingHeading: string;
    readingProgress: (pages: number, count: string) => string;
    keepTabOpenBanner: string;
    readCompletePill: (count: string) => string;
    invalidRecordsPill: (count: number) => string;
    statNewLocal: string;
    statExisting: string;
    statConflicts: string;
    moveConflictsCheckbox: string;
    shareCommunityCheckbox: string;
    crowdDisabledHint: string;
    dedupeHint: string;
    emptyBlocklistTitle: string;
    emptyBlocklistDesc: string;
    statusSharing: string;
    statusDone: string;
    statusCancelled: string;
    statusIncomplete: string;
    resultLocalSummary: (added: number, skipped: number) => string;
    resultCommunitySummary: (added: number, notCounted: number) => string;
    resultBatchesSummary: (completed: number, failed: number) => string;
    retryFailedBtn: string;
    resultRetainedBanner: string;
  };
  history: {
    pageTitle: string;
    pageDesc: string;
    clearBtn: string;
    ruleLabels: Record<string, string>;
    sceneLabels: Record<'timeline' | 'reply' | 'search' | 'profile', string>;
    blockedFromLogReason: (ruleLabel: string) => string;
    addedWhiteNotice: (account: string) => string;
    addedBlackNotice: (account: string) => string;
    statToday: string;
    statTodayPartial: string;
    statTodayAds: (count: string) => string;
    statTotal: string;
    statTotalAds: (count: string) => string;
    statRetained: string;
    statRetainedHint: string;
    searchPlaceholder: string;
    filterRuleAria: string;
    allRules: string;
    filterSceneAria: string;
    allScenes: string;
    colContent: string;
    colReason: string;
    colTimeScene: string;
    colActions: string;
    openOnXTooltip: string;
    noSnippet: string;
    adRuleLink: string;
    whitelistedPill: string;
    whitelistBtn: string;
    whitelistTooltip: string;
    blacklistedPill: string;
    blacklistAria: (account: string) => string;
    blacklistTooltip: string;
    viewDetailAria: (tweetId: string) => string;
    viewDetailTooltip: string;
    emptyFilterTitle: string;
    emptyFilterDesc: string;
    emptyCleanTitle: string;
    emptyCleanDesc: string;
    operationsTitle: string;
    operationsDesc: string;
    detailTitle: string;
    adjustAdRuleBtn: string;
    addToBlackBtn: string;
    addToWhiteBtn: string;
    noSavedSnippet: string;
    noStructuredEvidence: string;
    viewOriginalTweet: string;
    viewAuthorProfile: string;
    clearConfirmTitle: string;
    clearConfirmBtn: string;
    clearConfirmBody: (count: number) => string;
  };
  operations: {
    stages: Record<StageKey, string>;
    undoneTitle: (account: string) => string;
    cleanedTitle: (account: string) => string;
    undoBtn: (seconds: number) => string;
    localPill: (stage: string) => string;
    nativeXPill: (stage: string) => string;
    communityPill: (stage: string) => string;
    selectReasonAria: string;
    retryNativeX: string;
    retryCommunity: string;
    toastRegionAria: string;
  };
  preferences: {
    pageTitle: string;
    pageDesc: string;
    languagePanelTitle: string;
    languageTitle: string;
    languageDesc: string;
    languageAuto: (resolvedLabel: string) => string;
    syncPanelTitle: string;
    syncNativeTitle: string;
    syncNativeDesc: string;
    crowdReportTitle: string;
    crowdReportDesc: string;
    cloudKeywordsTitle: string;
    cloudKeywordsDesc: string;
    syncingCompact: string;
    syncErrorCompact: string;
    usingBuiltinCompact: string;
    lastSyncedCompact: (time: string) => string;
    snapshotTitle: string;
    snapshotDesc: string;
    syncNowBtn: string;
    sourceBuiltin: string;
    sourceCache: string;
    sourceNetwork: string;
    lastPulled: (time: string) => string;
    snapshotMeta: (
      updatedAt: string,
      accounts: string,
      reports: string
    ) => string;
    syncFailedBanner: (err: string, usingBuiltin: boolean) => string;
    servicePanelTitle: string;
    servicePanelDesc: string;
    customApiLabel: string;
    customApiHelp: string;
    saveServiceBtn: string;
    serviceSavedMsg: string;
    defaultServiceName: string;
    backupPanelTitle: string;
    backupPanelDesc: string;
    exportJsonBtn: string;
    importConfigBtn: string;
    backupSpecHint: string;
    selectJsonAria: string;
    fileTooLargeError: string;
    invalidJsonError: string;
    resetPanelTitle: string;
    resetPanelDesc: string;
    resetSettingTitle: string;
    resetSettingDesc: string;
    resetBtn: string;
    resetConfirmTitle: string;
    resetConfirmBtn: string;
    resetConfirmBody: string;
    resetConfirmBanner: string;
    resetSuccessMsg: string;
    importDialog: {
      title: string;
      desc: string;
      confirmBtn: string;
      warningBanner: string;
      exportCurrentFirst: string;
      changedRuleGroups: string;
      diffSummary: (added: number, changed: number, removed: number) => string;
      rowCustomKeywords: string;
      rowLocalBlack: string;
      rowWhite: string;
      rowDisabledCloud: string;
      disabledCloudDetail: (count: number) => string;
      prefLabels: Record<
        | 'locale'
        | 'enabled'
        | 'interceptionMode'
        | 'exemptFollowing'
        | 'profileSceneBadgeOnly'
        | 'syncNativeXBlock'
        | 'enableCrowdReport'
        | 'enableCloudKeywords'
        | 'customApiBaseUrl',
        string
      >;
      noPrefChanges: string;
      concurrentChangeWarning: string;
      refreshPreviewBtn: string;
    };
  };
  content: {
    navButton: string;
    quickBlockAria: (screenName: string) => string;
    quickBlockTitle: (screenName: string) => string;
    relationRetweet: string;
    relationQuote: string;
    collapsedFallback: string;
    matchedRuleFallback: string;
    expandHint: string;
    collapseHint: string;
    collapseTooltip: string;
    unblockTargetTitle: (screenName: string) => string;
    unblockTargetSecondary: (screenName: string) => string;
    unblockBtn: string;
    whitelistTargetTitle: (screenName: string) => string;
    whitelistTargetSecondary: (screenName: string) => string;
    whitelistBtn: string;
    blockTargetAria: (screenName: string) => string;
    blockTargetTitle: (screenName: string) => string;
    blockTargetSecondary: (screenName: string) => string;
    blockBtn: string;
    ageUnknown: string;
    ageDays: (days: number) => string;
    ageMonths: (months: number) => string;
    ageYears: (years: string) => string;
    dailyRateZero: string;
    dailyRate: (rate: string) => string;
    createdHint: (dateStr: string, uid: string) => string;
    totalPostsHint: (count: string) => string;
    communityCountStat: (count: number) => string;
    inWhitelistPill: string;
    noAnomalyPill: string;
    currentAccountPill: string;
    removeFromWhiteBtn: string;
    cleanThisAccountAria: string;
    drawerTitle: string;
    drawerDesc: string;
    importXBlocklistBtn: string;
    enableCleanTitle: string;
    enableCleanDesc: string;
  };
  errors: {
    contextInvalidated: string;
    disconnected: string;
    permissionDenied: string;
    serviceAuthRequired: string;
    serviceHttpStatus: (status: number) => string;
    requestTimeoutUnconfirmed: string;
    syncFailed: string;
    serviceUrlChanged: string;
    restartedSyncInterrupted: string;
    corruptSnapshotFallback: string;
    enterAccountQuery: string;
    invalidProfileUrl: string;
    onlyXDomains: string;
    unrecognizedHandleInUrl: string;
    invalidHandleFormat: string;
    expectObject: (path: string) => string;
    invalidString: (path: string) => string;
    invalidNumber: (
      path: string,
      positive: boolean,
      integer: boolean
    ) => string;
    expectBoolean: (path: string) => string;
    invalidRegex: string;
    selectAtLeastOneScope: string;
    uidNumericOnly: string;
    invalidReasonTag: string;
    enterFullServiceUrl: string;
    serviceHttpsOnly: string;
    serviceCleanUrlOnly: string;
    unsupportedConfigVersion: string;
    invalidLocale: string;
    invalidPreset: string;
    invalidInterceptionMode: string;
    invalidLanguageMode: string;
    unsupportedLanguageCode: string;
    duplicateKeywordId: string;
    uidKeyMismatch: (key: string) => string;
    disjointListsRequired: string;
    unsupportedSnapshotVersion: string;
    invalidSnapshotTime: string;
    invalidSnapshotUid: string;
    invalidSnapshotTag: string;
    invalidCloudKeywords: string;
    unknownConfigField: string;
    unknownRule: string;
    unknownRuleParam: string;
    configChangedReloadPreview: string;
    configChangedReconfirmReset: string;
    configChangedReload: string;
    keywordModifiedReopen: string;
    keywordChangedRefresh: string;
    invalidCloudKeywordId: string;
    duplicateCustomKeywordId: string;
    missingXTab: string;
    xRequestTimeout: string;
    xConnectionFailed: (detail: string) => string;
    xAccountSwitchedOrLoggedOut: string;
    viewerProfileMissing: string;
    operationNotFound: string;
    importJobNotFound: string;
    viewerUnconfirmed: string;
    xBlockUnconfirmed: string;
    communityResponseInvalid: string;
    communityNotCountedNote: string;
    undoWindowExpired: string;
    accountModifiedExternally: string;
    reasonWindowExpired: string;
    retryFailedOnly: string;
    selectXTab: string;
    tabImportAlreadyRunning: string;
    duplicateCursor: string;
    incompleteBlocklistResponse: string;
    rereadPreviewRequired: string;
    xAccountChangedReread: string;
    enableCrowdReportFirst: string;
    importedFromXReason: string;
    crowdReportDisabledRemaining: string;
    batchResponseInvalid: string;
    noRetryableBatches: string;
    openXTabToResolveHandle: (handle: string) => string;
    cannotResolveHandle: (handle: string) => string;
    pageUnresponsive: string;
    pageClosed: string;
  };
}
