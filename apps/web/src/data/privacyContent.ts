export interface PermissionRow {
  permission: string[];
  reason: string;
}

export interface PrivacyLocaleContent {
  title: string;
  effectiveDate: string;
  appliesTo: string;
  sec1Title: string;
  sec1Intro: string;
  sec1Bullets: string[];
  sec2Title: string;
  sec2Intro: string;
  sec2Bullets: string[];
  sec2Outro: string;
  sec3Title: string;
  sec3Intro: string;
  sec3SyncTitle: string;
  sec3SyncDesc: string;
  sec3ReportTitle: string;
  sec3ReportIntro: string;
  sec3ReportBullets: string[];
  sec3ReportNote: string;
  sec3NativeTitle: string;
  sec3NativeDesc: string;
  sec4Title: string;
  sec4Headers: [string, string];
  sec4Rows: PermissionRow[];
  sec5Title: string;
  sec5Bullets: Array<{ label: string; text: string }>;
  sec6Title: string;
  sec6Intro: string;
  contactEmail: string;
}

export const PRIVACY_CONTENT: Record<'en' | 'zh-CN', PrivacyLocaleContent> = {
  en: {
    title: 'Privacy Policy',
    effectiveDate: 'Effective Date: November 11, 2026',
    appliesTo:
      'Applies to the KeepXClean Browser Extension & keepxclean.com Cloud Snapshot Service',
    sec1Title: '1. Core Privacy Principles',
    sec1Intro:
      'KeepXClean is designed around local-first content filtering and zero account registration:',
    sec1Bullets: [
      'All timeline, search, and reply filtering runs locally in your browser against X (x.com / twitter.com) page responses.',
      'KeepXClean never collects, reads, or transmits your browsing history outside X, direct messages (DMs), passwords, cookies, session tokens, email addresses, or private tweets.',
      'KeepXClean uses zero third-party analytics SDKs, zero advertising trackers, and zero remote code execution.',
    ],
    sec2Title: '2. Data Stored Locally on Your Device',
    sec2Intro:
      'KeepXClean uses your browser’s local extension storage (chrome.storage.local) and an on-origin fast-boot cache on x.com solely to store:',
    sec2Bullets: [
      'Your filter rules, preset selection, interface language, and display preferences;',
      'Your custom keywords/regular expressions, local allowlist UIDs, and local blocklist UIDs;',
      'Up to the 200 most recent interception log entries and daily/cumulative counter summaries so you can review or undo filter hits;',
      'The cached public community snapshot (snapshot.json) downloaded from keepxclean.com (or your self-hosted endpoint).',
    ],
    sec2Outro:
      'All locally stored data remains on your device unless you explicitly export a JSON backup file. Uninstalling the extension removes its chrome.storage.local data.',
    sec3Title: '3. Network Requests & Optional Community Sharing',
    sec3Intro:
      'KeepXClean communicates over HTTPS only in the following strictly scoped scenarios:',
    sec3SyncTitle: 'Public Snapshot Sync (Read-Only GET):',
    sec3SyncDesc:
      "Periodically fetches the compiled public snapshot (/v1/snapshot.json) from cdn.keepxclean.com / api.keepxclean.com without sending user identifiers or cookies (credentials: 'omit').",
    sec3ReportTitle: 'Optional Community Block Reporting (Opt-Out Anytime):',
    sec3ReportIntro:
      'Only when Community Sharing (enableCrowdReport) is enabled and you explicitly block an account or choose to share imported X blocks, the extension submits:',
    sec3ReportBullets: [
      'Target account’s public numeric X targetUid, public @handle / display name, public follower count, and your chosen block reason tag (spam, nsfw, scam, ad, bot, or other);',
      'A one-way salted SHA-256 hash (reporterUidHash) derived locally from your X numeric ID solely to deduplicate votes (1 account = 1 vote), plus your account’s approximate age in days (used only to enforce the ≥30-day anti-abuse threshold). Your raw X UID, handle, and credentials are never sent to KeepXClean servers.',
    ],
    sec3ReportNote:
      'Standard transient IP-based sliding-window rate-limiting is applied on the server solely to prevent automated abuse.',
    sec3NativeTitle: 'Optional Native X Block Sync:',
    sec3NativeDesc:
      'When Sync Native X Block (syncNativeXBlock) is enabled, block and blocklist-read requests are executed directly between your open X tab and x.com using X’s own web client session. KeepXClean servers never receive or proxy your X credentials.',
    sec4Title: '4. Browser Permissions Justification',
    sec4Headers: ['Permission', 'Single-Purpose Reason'],
    sec4Rows: [
      {
        permission: ['storage'],
        reason:
          'Saves filter settings, custom keywords, local allow/block lists, cached snapshots, and recent interception logs locally on the device.',
      },
      {
        permission: ['alarms'],
        reason:
          'Schedules periodic background refreshes of the public snapshot and completes the 4.5-second Quick-Block undo window reliably in MV3 service workers.',
      },
      {
        permission: ['*://*.x.com/*', '*://*.twitter.com/*'],
        reason:
          'Runs the local timeline/reply filter script and mounts the light in-page controls, collapse bars, and risk badges on X pages.',
      },
      {
        permission: ['https://*.keepxclean.com/*'],
        reason:
          'Downloads public community snapshots and submits optional deduplicated block reports.',
      },
      {
        permission: ['optional_host_permissions'],
        reason:
          'Requested interactively only when an advanced user enters a custom self-hosted HTTPS snapshot/API server URL in Preferences.',
      },
    ],
    sec5Title: '5. Data Sharing, Retention & Your Controls',
    sec5Bullets: [
      {
        label: 'No Sale or Brokerage:',
        text: 'We never sell, rent, or transfer user data to third parties, advertisers, or data brokers.',
      },
      {
        label: 'Retraction & Opt-Out:',
        text: 'You can disable Community Sharing at any time in Preferences, undo any Quick Block within the 4.5-second window, or clear local logs and lists with one click.',
      },
      {
        label: 'Aggregated Public Output:',
        text: 'Public snapshots (/v1/snapshot.json) publish only aggregated vote counts and dominant category tags for accounts meeting the minimum report threshold — never reporter hashes or individual report records.',
      },
    ],
    sec6Title: '6. Contact',
    sec6Intro:
      'For privacy questions or data inquiries regarding KeepXClean, please contact:',
    contactEmail: 'privacy@keepxclean.com',
  },
  'zh-CN': {
    title: '隐私政策（Privacy Policy）',
    effectiveDate: '生效日期：2026 年 11 月 11 日',
    appliesTo:
      '适用于 KeepXClean 浏览器扩展及 keepxclean.com 公共快照服务',
    sec1Title: '1. 核心隐私原则',
    sec1Intro:
      'KeepXClean 采用本地优先过滤与零账号注册登录架构：',
    sec1Bullets: [
      '所有推荐流、搜索页、评论区的规则匹配均在浏览器本地对 X（x.com / twitter.com）页面自身返回的数据完成。',
      'KeepXClean 绝不收集、读取或上传您在 X 以外的浏览历史、私信（DM）、账号密码、Cookie、登录凭据、邮箱或非公开推文。',
      '扩展内不包含任何第三方统计分析 SDK、广告追踪器或远程动态执行代码（Remote Code）。',
    ],
    sec2Title: '2. 保存在您设备本地的数据',
    sec2Intro:
      '扩展仅使用浏览器本地存储（chrome.storage.local）及 x.com 同源启动缓存保存以下必要数据：',
    sec2Bullets: [
      '您的过滤规则开关、预设档位、界面语言及展示偏好；',
      '您的自定义关键词/正则表达式、本地白名单 UID 与本地黑名单 UID；',
      '最近最多 200 条本地拦截记录及今日/累计拦截计数，便于您核查命中原因或误拦加白；',
      '从 keepxclean.com（或您自建服务地址）拉取的公共社区快照缓存。',
    ],
    sec2Outro:
      '除您主动导出 JSON 备份外，上述本地配置不会离开您的设备；卸载扩展时浏览器会自动清除对应的本地存储。',
    sec3Title: '3. 网络通信与可选社区共享',
    sec3Intro: 'KeepXClean 仅在以下明确场景发起 HTTPS 请求：',
    sec3SyncTitle: '拉取公共快照（只读 GET）：',
    sec3SyncDesc:
      "定期从 cdn.keepxclean.com / api.keepxclean.com 下载聚合后的公共快照（/v1/snapshot.json），请求不携带任何 Cookie 或个人身份标识（credentials: 'omit'）。",
    sec3ReportTitle: '可选的社区黑名单共建上报（随时可关闭）：',
    sec3ReportIntro:
      '仅当您开启「社区共享」（enableCrowdReport）并主动点击快捷净空，或在导入 X 黑名单时勾选共享社区时，扩展才会提交：',
    sec3ReportBullets: [
      '被拉黑目标账号的公开数字 targetUid、公开 @handle / 昵称、公开粉丝数及原因分类标签；',
      '在本地对您当前 X 数字 ID 计算的单向加盐 SHA-256 哈希（reporterUidHash，仅用于“一账号一票”去重）以及账号大致注册天数（仅用于校验 ≥30 天防刷门槛）。您的原始 X UID、用户名及登录凭据绝不会发送至 KeepXClean 服务器。',
    ],
    sec3ReportNote:
      '服务端仅使用短期滑动窗口限流防止恶意刷票。',
    sec3NativeTitle: '可选的同步 X 原生拉黑：',
    sec3NativeDesc:
      '开启 syncNativeXBlock 时，拉黑与读取已有黑名单请求均在您的 X 标签页内直接发往 x.com 官方接口，KeepXClean 服务器从不接触或中转任何 X 登录凭据。',
    sec4Title: '4. 浏览器权限用途说明',
    sec4Headers: ['权限名称', '单一用途说明'],
    sec4Rows: [
      {
        permission: ['storage'],
        reason:
          '在本地设备保存过滤规则、自定义词条、本地黑白名单、快照缓存及最近 200 条拦截记录。',
      },
      {
        permission: ['alarms'],
        reason:
          '在 MV3 后台定时刷新公共快照，并可靠执行快捷净空 4.5 秒撤销窗口结束后的后续任务。',
      },
      {
        permission: ['*://*.x.com/*', '*://*.twitter.com/*'],
        reason:
          '在 X 页面本地运行信息流/评论区过滤引擎，并挂载浅色快捷净空按钮、折叠条、主页风险徽章与设置抽屉。',
      },
      {
        permission: ['https://*.keepxclean.com/*'],
        reason: '拉取公共快照及提交可选的去重社区拉黑票数。',
      },
      {
        permission: ['optional_host_permissions'],
        reason:
          '仅当高级用户在偏好设置中填写自建 HTTPS 服务地址时，按需向浏览器申请对应域名授权。',
      },
    ],
    sec5Title: '5. 数据共享、留存与用户控制权',
    sec5Bullets: [
      {
        label: '绝不出售或交易数据：',
        text: '我们绝不向任何第三方、广告商或数据经纪商出售、出租或转让用户数据。',
      },
      {
        label: '随时关闭与撤销：',
        text: '您可随时在「偏好设置」关闭社区共享，在快捷净空 4.5 秒窗口内一键撤销，或随时一键清空本地拦截记录与名单。',
      },
      {
        label: '公开聚合快照不含提交者信息：',
        text: '/v1/snapshot.json 仅包含达到票数门槛的目标账号统计票数与主要标签，不包含任何 reporterUidHash 或单次提交明细。',
      },
    ],
    sec6Title: '6. 联系方式',
    sec6Intro: '如对本隐私政策有任何疑问，请联系：',
    contactEmail: 'privacy@keepxclean.com',
  },
};
