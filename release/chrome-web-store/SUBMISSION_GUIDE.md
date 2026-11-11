# KeepXClean — Chrome Web Store 提交指南 (v0.1.0)

本文档整理了 Chrome Web Store Developer Dashboard 提审所需的全部产物路径、双语商店文案、权限理由与隐私合规问卷答案，可直接复制粘贴使用。

---

## 1. 提交产物清单

| 用途 | 规格要求 | 项目内文件路径 |
| --- | --- | --- |
| **扩展上传包 (ZIP)** | Manifest V3 `.zip` | `apps/extension/.output/keepxcleanextension-0.1.0-chrome.zip` |
| **商店图标 (Store Icon)** | `128×128` PNG | `apps/extension/public/icon/icon-128.png` |
| **截图 1（规则总览 EN）** | `1280×800`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/01-filter-rules-en.png` |
| **截图 2（公共词库包 EN）** | `1280×800`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/02-public-keyword-packs-en.png` |
| **截图 3（X 页内折叠条与浅色抽屉 EN）** | `1280×800`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/03-x-inpage-drawer-en.png` |
| **截图 4（多语言与偏好设置 EN）** | `1280×800`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/04-multilingual-preferences-en.png` |
| **截图 5（规则总览 简体中文）** | `1280×800`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/05-filter-rules-zh.png` |
| **小型宣传图 (Small Promo Tile)** | `440×280`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/promo-small-440x280.png` |

### 官方在线地址（已部署上线 & 已提审）

- **Chrome Web Store Extension ID**: `plngcinmibjmkjjpfjemhfabjfjjkhhd`（v0.1.0 已提审，通过后自动发布地址：`https://chromewebstore.google.com/detail/plngcinmibjmkjjpfjemhfabjfjjkhhd`）
- **Official URL / Homepage URL**: `https://keepxclean.com`
- **Privacy Policy URL**: `https://keepxclean.com/privacy/`
- **Support / Feedback Email**: `support@keepxclean.com`（或在 Dashboard 填写开发者联系邮箱）
- **Live Cloud Snapshot API / CDN**: `https://api.keepxclean.com/v1/snapshot.json` · `https://cdn.keepxclean.com/v1/snapshot.json`

---

## 2. Store Listing（商店详情页文案）

> 扩展包内已包含 10 种语言的 `_locales/*/messages.json`（默认 `default_locale: "en"`），商店标题与简短摘要会自动从扩展包读取；下方提供完整详细描述供粘贴。

### Category & Language

- **Primary Category**: `Workflow & Planning`（或 `Social & Communication`）
- **Mature Content**: `No`

### English (Default — `en`)

**Title**（来自 `_locales/en/messages.json`）:
```text
KeepXClean - High-Signal Filter for X
```

**Summary**（118 chars，≤ 132 字符限制）:
```text
Keep X (Twitter) clean: filter reply spam, impersonators, bots, engagement bait, ads, and crowd-blocked accounts.
```

**Detailed Description**:
```text
KeepXClean keeps your X (formerly Twitter) timeline, search results, and reply threads calm, readable, and high-signal.

Instead of scraping pages with extra API calls, KeepXClean evaluates X’s own timeline and reply responses locally in your browser — letting you strip noise cleanly or collapse filtered posts into a single-line reason bar with one-click expand, allowlist, or block actions.

KEY CAPABILITIES

• 9 Deterministic Filter Dimensions & 3 Presets (Light / Balanced / Strict)
  1. Reply Spam & Impersonators — Catch ultra-short reply spam, Verified boost bots, low-follower bio-link funnels, and lookalike author impersonators.
  2. Engagement Bait & Giveaways — Mute "comment X to get DM" funnels, giveaway loops, and follow-for-follow pods.
  3. High-Frequency Posting — Filter accounts exceeding your daily average or rolling 1-hour burst thresholds.
  4. Community Blocklist — Optionally filter accounts flagged by aggregated public community reports.
  5. Custom Keywords & Regular Expressions — Match across post text, bio, display name, or URLs, with optional reply-only scope and follower exemptions.
  6. Public Keyword Packs — 24 curated rules across Clichés & Slop, Crypto & Shilling, Follow Pods, Phishing & Funnels, and NSFW & Illicit. Toggle any rule individually or click "Customize" to edit your own copy.
  7. Post Language Filter — Block specific languages or allow only your preferred reading languages.
  8. Hashtag & Cashtag Stuffing — Filter posts overloaded with #hashtags or $cashtags.
  9. Account Quality & Promoted Ads — Catch brand-new default-avatar spam accounts and hide promoted timeline/reply ads.

• Two Clean Display Modes
  - Hide Cleanly: Strip matched items from timeline/reply responses without leaving empty placeholders.
  - Collapse Bar: Replace matched posts with a subtle one-line reason bar so you can expand, allowlist, or block on demand.

• Safe Quick-Block with 4.5-Second Undo Window
  - Saves locally first and gives you 4.5 seconds to undo or pick a reason tag before optionally syncing native X block or anonymous community reporting.
  - Undoing restores only the current action and never accidentally unblocks previously blocked X accounts.

• Transparent Activity Log & Portable JSON Backups
  - Review the 200 most recent filter hits with exact rule evidence (never fabricated).
  - Import your existing X blocklist by numeric UID with conflict detection against your allowlist.
  - Export and import validated JSON configuration backups anytime.

• 10 Interface Languages
  - English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, Portuguese, French, German, and Russian.

LOCAL-FIRST PRIVACY
• Zero account registration, zero third-party analytics SDKs, and zero remote code execution.
• Filtering runs locally in your browser. Optional native X blocking and optional hashed community reporting are controlled explicitly by your preferences.
• Privacy Policy: https://keepxclean.com/privacy/
```

---

### 简体中文 (`zh-CN`)

**Title**（来自 `_locales/zh_CN/messages.json`）:
```text
KeepXClean - X 高信噪比净空插件
```

**Summary**:
```text
让 X (Twitter) 保持清爽：无感过滤评论区水评与高仿号、高频刷屏号、口令引流、推广广告与社区高危账号 (keepxclean.com)
```

**Detailed Description**:
```text
KeepXClean 是一款面向 X（原 Twitter）的信息流与评论区高信噪比过滤扩展，帮助你在不额外轮询 X 接口、无需注册登录的前提下，重获清爽安静的阅读体验。

核心能力

• 九大确定性过滤维度与三档预设（轻度 / 标准 / 极致）
  1. 评论区防灌水与防高仿：精准识别评论区极短水评、蓝标水军回复、低粉简介导流号及高仿原推主账号。
  2. 口令引流与互动乞讨拦截：拦截“评论扣 1 领资料”、抽奖转发诱导、互关互赞车队。
  3. 高频刷屏拦截：同时支持历史日均发推上限与观察窗口短期爆发上限。
  4. 社区高危名单：可选参考社区公开聚合举报阈值进行过滤。
  5. 自定义关键词与正则：支持匹配推文正文、简介、昵称与外链域名，支持仅限评论区生效与粉丝数豁免。
  6. 公共词库包：内置 24 条精细规则（烂梗套话、币圈喊单、互关车队、黑灰产导流、黄赌毒广告），支持分类筛选、逐条独立开关，以及一键“复制自定义”微调。
  7. 推文语言过滤：支持屏蔽指定语种，或仅保留你阅读的目标语种。
  8. 标签堆砌过滤：拦截堆砌过多 #话题标签 或 $代币符号 的营销内容。
  9. 账号质量与推广广告净空：过滤新建默认头像低质号，无痕移除时间线与评论区推广广告。

• 两种净空展示模式
  - 直接无痕隐藏：在数据层剔除命中内容，不留空白占位。
  - 单行折叠提示：保留克制的单行命中原因条，随时点击展开查看、加入白名单或一键净空（转发/引用推文命中时精准指向被转引账号）。

• 4.5 秒安全撤销窗口与数字 UID 名单管理
  - 页面内快捷净空先写入本地并提供 4.5 秒撤销窗口；窗口结束后再按偏好决定是否同步 X 原生拉黑与匿名社区共享，三阶段状态真实呈现。
  - 支持从 X 导入既有拉黑名单（基于数字 UID 永久识别，改名不失效），自动检测重复与白名单冲突。

• 透明拦截记录与 10 种界面语言
  - 保留最近 200 条命中证据明细，支持 JSON 配置校验导入与本地备份导出。
  - 内置简体中文、繁體中文、English、日本語、한국어、Español、Português、Français、Deutsch、Русский 10 种界面语言。

本地优先与隐私承诺
• 零账号注册、零第三方统计 SDK、零远程代码执行。
• 全部内容过滤均在浏览器本地完成；隐私政策详见：https://keepxclean.com/privacy/
```

---

## 3. Privacy Practices（隐私权实践标签页）

### 3.1 Single Purpose Description（单一用途说明）

```text
KeepXClean filters unwanted posts, reply spam, impersonators, engagement bait, and promoted ads on X (x.com and twitter.com) locally in the user's browser according to user-configured rules and allow/block lists.
```

### 3.2 Permission Justifications（权限理由）

#### `storage`
```text
Required to store the user's filter rules, preset selection, interface language, custom keywords, local UID allowlist/blocklist, cached public community snapshot, and the 200 most recent local interception log entries on the user's device via chrome.storage.local.
```

#### `alarms`
```text
Required in Manifest V3 service workers to schedule periodic background refreshes (every 30 minutes) of the static public community blocklist/keyword snapshot JSON and to process the 4.5-second quick-block undo window reliably across service worker suspension.
```

#### Host Permissions (`*://*.x.com/*`, `*://*.twitter.com/*`, `https://*.keepxclean.com/*`, `https://keepxclean.com/*`)
```text
Access to x.com and twitter.com is required to run the local timeline/reply filter script, render the in-page collapse bar, quick-block button, and settings drawer, and optionally sync the user's own X blocklist when explicitly triggered by the user. Access to keepxclean.com and *.keepxclean.com is required to download the read-only public community anti-spam snapshot (snapshot.json) and, only when opted in by the user, submit anonymized spam account UID reports.
```

#### Optional Host Permissions (`https://*/*`, `http://localhost/*`, `http://127.0.0.1/*`)
```text
Requested at runtime ONLY if an advanced user explicitly configures a custom self-hosted community snapshot HTTPS/local server URL in Preferences. Never requested by default.
```

### 3.3 Remote Code（远程代码声明）

- **Are you using remote code?** → 选择 **`No, I am not using remote code`**
- 说明（如审核表单要求补充）：
  ```text
  All executable JavaScript and CSS are bundled inside the extension package at build time. Periodic updates from keepxclean.com consist strictly of declarative JSON data (UID report counts and plain keyword/regex strings) parsed with JSON.parse and evaluated by the bundled rule engine; no external scripts or eval() are ever loaded or executed.
  ```

### 3.4 Data Usage Disclosures（数据使用勾选指南）

1. **默认状态（未开启“向社区共享拉黑记录”时）**：所有规则匹配、配置与日志完全保存在用户浏览器本地；扩展仅匿名拉取公开静态文件 `snapshot.json`。
2. **当用户主动在设置中勾选社区共享时**：扩展向 `api.keepxclean.com` 发送目标公开 X 账号的数字 UID、用户选择的举报原因分类，以及当前账号 UID 的单向 SHA-256 匿名哈希值（仅用于服务端防重复计票）。
3. **表单勾选项建议**：
   - **Personally identifiable information**（姓名、地址、邮箱、身份证号等）：**不勾选**
   - **Health / Financial / Authentication / Personal communications / Location / Web history**：**全部不勾选**（绝不收集密码、Cookie、私信或非 X 浏览记录）
   - **User activity**（仅限用户在 X 内主动点击举报时的操作记录 / 匿名哈希）：若审核口径要求披露可选的社区举报请求，可勾选 **Website content / User activity**（或仅在说明中注明用户可选提交公开违规账号 UID），并**务必勾选以下三项合规承诺**：
     - [x] I do not sell or transfer user data to third parties, outside of the approved use cases
     - [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
     - [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### 3.5 Privacy Policy URL

```text
https://keepxclean.com/privacy/
```

---

## 4. 发布前一键复验命令

每次重新打包上传前可执行：

```bash
pnpm typecheck && pnpm test && pnpm --filter @keepxclean/extension zip
```

生成的上传包位于：
`apps/extension/.output/keepxcleanextension-0.1.0-chrome.zip`
