# KeepXClean — Chrome Web Store 提交与更新指南 (v0.1.1)

本文档整理了 Chrome Web Store Developer Dashboard 所需的全部产物路径、优化后的通俗商店标题/副标题/详情页文案、官方网址与开源说明、权限理由及隐私合规问卷答案，可直接复制粘贴使用。

---

## 1. 提交产物清单

| 用途 | 规格要求 | 项目内文件路径 |
| --- | --- | --- |
| **扩展上传包 (ZIP)** | Manifest V3 `.zip` | `apps/extension/.output/keepxcleanextension-0.1.1-chrome.zip` |
| **商店图标 (Store Icon)** | `128×128` PNG | `apps/extension/public/icon/icon-128.png` |
| **截图 1（规则总览 EN）** | `1280×800`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/01-filter-rules-en.png` |
| **截图 2（公共词库包 EN）** | `1280×800`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/02-public-keyword-packs-en.png` |
| **截图 3（X 页内折叠条与浅色抽屉 EN）** | `1280×800`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/03-x-inpage-drawer-en.png` |
| **截图 4（多语言与偏好设置 EN）** | `1280×800`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/04-multilingual-preferences-en.png` |
| **截图 5（规则总览 简体中文）** | `1280×800`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/05-filter-rules-zh.png` |
| **小型宣传图 (Small Promo Tile)** | `440×280`, 24-bit RGB PNG (无透明通道) | `release/chrome-web-store/assets/promo-small-440x280.png` |

### 官方在线地址与开源仓库

- **Chrome Web Store 地址**: `https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd`
- **官方网站 (Official Website / Homepage URL)**: `https://keepxclean.com`
- **GitHub 开源仓库 (MIT License)**: `https://github.com/KeepXClean/keepxclean`
- **隐私政策 (Privacy Policy URL)**: `https://keepxclean.com/privacy/`
- **支持与反馈邮箱**: `support@keepxclean.com`
- **公开防垃圾快照 CDN**: `https://api.keepxclean.com/v1/snapshot.json` · `https://cdn.keepxclean.com/v1/snapshot.json`

---

## 2. Store Listing（商店详情页文案）

> 扩展包内已包含 10 种语言的 `_locales/*/messages.json`（默认 `default_locale: "en"`），商店标题（Title）与副标题/简短摘要（Summary）会自动从扩展包读取；下方提供优化后的完整详细描述（Detailed Description）供粘贴到 Chrome Web Store 后台。

### Category & Language

- **Primary Category**: `Social & Communication`（或 `Workflow & Planning`）
- **Mature Content**: `No`

### English (Default — `en`)

**Title**（来自 `_locales/en/messages.json`）:
```text
KeepXClean - Block Spam, Bots & Ads on X (Twitter)
```

**Summary / Subtitle**（来自 `_locales/en/messages.json`，≤ 132 字符限制）:
```text
Free, open-source filter for X (Twitter): auto-collapse or hide spam replies, bots, impersonators & ads locally. keepxclean.com
```

**Detailed Description**:
```text
Tired of opening a post on X (Twitter) only to scroll past Verified reply bots, scam impersonators, giveaway bait, and promoted ads? KeepXClean automatically cleans up your X timeline, search results, and reply sections in under 1 ms — right inside your browser.

🌐 Official Website & Live Demo: https://keepxclean.com
💻 100% Free & Open Source (MIT): https://github.com/KeepXClean/keepxclean

HOW IT FEELS IN DAILY USE

• Collapse Bar by Default (Never Miss Real Posts)
  - Collapse Bar (Default): Replaces filtered spam with a subtle one-line reason bar. Click anytime to peek at the original post, add a false positive to your allowlist, or block the account in one click.
  - Hide Cleanly: Prefer zero visual trace? Switch to Hide Cleanly to remove matched posts without placeholders. (Promoted ads are always removed cleanly in both modes.)

WHAT KEEPXCLEAN FILTERS FOR YOU

• Reply Spam, Bots & Impersonators — Blocks ultra-short bot replies, Verified engagement farmers, bio-link scam funnels, and lookalike accounts impersonating the original author.
• Engagement Bait & Follow Pods — Mutes "Comment X and I'll DM you" traps, fake giveaways, and follow-for-follow rings.
• High-Frequency Spammers — Filters accounts posting dozens or hundreds of times a day or flooding feeds in short bursts.
• 24 Built-in Public Anti-Spam Rules — Ready-to-use packs against AI slop/clichés, crypto shilling, follow pods, phishing funnels, and NSFW spam. Toggle any rule individually or customize your own copy.
• Custom Keywords & Regex — Filter by post text, bio, display name, or links, with reply-only mode and follower exemptions.
• Language & Tag Filters — Show only the languages you read (or block specific ones), and hide posts stuffed with #hashtags or $cashtags.
• Promoted Ads & Low-Quality New Accounts — Automatically strips promoted ads and catches brand-new default-avatar spam bots.
• Community Blocklist & Quote Penetration — Optionally filter repeat spammers reported by the community. Even when someone you follow quotes or retweets a scammer, KeepXClean accurately targets the quoted spammer.

THOUGHTFUL SAFEGUARDS

• 4.5-Second Undo Window — One-click quick-block applies locally right away with a 4.5-second undo toast before optionally syncing native X block or anonymous community reports.
• Permanent UID Lists & Easy Backups — Import your X blocklist by permanent numeric user ID (survives handle changes), inspect the 200 latest filter hits with clear reasons, and export/import JSON backups anytime.
• 10 Native UI Languages — English, 简体中文, 繁體中文, 日本語, 한국어, Español, Português, Français, Deutsch, and Русский.

OPEN SOURCE & LOCAL-FIRST PRIVACY

• 100% Open Source under the MIT License — Every line of code is public and auditable on GitHub: https://github.com/KeepXClean/keepxclean
• Zero Account Login & Zero Tracking — Never reads your passwords, cookies, auth tokens, or DMs. No third-party analytics SDKs and no remote code execution.
• Official Website: https://keepxclean.com
• Privacy Policy: https://keepxclean.com/privacy/
```

---

### 简体中文 (`zh-CN`)

**Title**（来自 `_locales/zh_CN/messages.json`）:
```text
KeepXClean - 屏蔽 X (Twitter) 垃圾评论、水军与广告
```

**Summary / Subtitle**（来自 `_locales/zh_CN/messages.json`，≤ 132 字符限制）:
```text
免费开源的 X (Twitter) 净化插件：自动折叠或屏蔽垃圾评论、水军机器人、高仿骗子、引流刷屏与推广广告，本地运行不读隐私。官网 keepxclean.com
```

**Detailed Description**:
```text
点开 X（原 Twitter）热门推文，评论区却全是蓝标复读机、卖课引流、高仿假号、币圈喊单和硬广？KeepXClean 帮你在浏览器本地自动净化时间线、搜索页与评论区，把干净清爽的阅读体验还给你。

🌐 官方网站与在线互动演示：https://keepxclean.com
💻 100% 免费开源（MIT 协议）：https://github.com/KeepXClean/keepxclean

为什么好用、不怕误伤？

• 默认“折叠提示”，也可一键“直接隐藏”
  - 折叠提示（默认）：将拦截内容收起为克制的单行原因提示条，想看原文随时点开核对，误判可一键加白名单，确认垃圾可一键拉黑。
  - 直接隐藏：追求极致清爽时可切换为直接隐藏，不留任何空白占位（注：原生推广广告在两种模式下均会直接无痕抹除）。

能帮你自动过滤哪些垃圾内容？

• 评论区水军与高仿骗子：拦截评论区敷衍水评、蓝标流量乞丐、简介挂外部导流链接的低粉号，以及模仿原推主头像昵称的高仿假号。
• 口令引流与互关车队：自动屏蔽“评论扣 1 私信发你”、虚假抽奖转发、蓝标互关互赞团伙。
• 高频刷屏与机器号：按日均发推数或短时连发频率，拦截全天候刷屏的营销号与搬运机器人。
• 内置 24 条开源防垃圾词库：涵盖 AI 烂梗套话、币圈喊单空投、互关车队、黑灰产诈骗引流、黄赌毒广告五大分类，支持逐条独立开关，也能一键复制改成你自己的规则。
• 自定义关键词与正则：支持匹配推文正文、简介、昵称、链接域名，可设置“仅在评论区生效”或高粉账号豁免。
• 语种过滤与标签堆砌拦截：支持“只看勾选语言”或“屏蔽指定语言”，自动过滤塞满 #话题标签 与 $代币符号 的垃圾推文。
• 推广广告与新注册三无号：无痕移除信息流与评论区推广广告，拦截刚注册、默认头像的低质水军号。
• 社区共治黑名单与转推穿透：可选启用社区高危黑名单；即使你关注的博主转发或引用了垃圾营销号，也能精准识别并指向被转引的违规账号。

贴心安全细节

• 4.5 秒防手滑撤销：页面内点“一键净空”先在本地生效，提供 4.5 秒随时撤销窗口，之后再按你的设置决定是否同步 X 原生拉黑与匿名社区举报。
• 永久数字 UID 名单与备份：按 X 永久数字 UID 管理黑白名单（骗子改名换皮也不失效），随时查看最近 200 条拦截原因明细，支持 JSON 配置导入导出。
• 10 种原生界面语言：内置简体中文、繁體中文、English、日本語、한국어、Español、Português、Français、Deutsch、Русский。

开源透明与本地隐私承诺

• 完全开源免费：项目基于 MIT 协议完整开源（https://github.com/KeepXClean/keepxclean），所有过滤逻辑与规则公开透明、可自行审查或自托管。
• 本地运行零隐私泄露：无需注册登录，绝不读取账号密码、Cookie 或私信，不含任何第三方统计追踪代码，单条推文判定不到 1 毫秒。
• 官方网站：https://keepxclean.com
• 隐私政策：https://keepxclean.com/privacy/
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
pnpm typecheck && pnpm test && pnpm test:e2e && pnpm --filter @keepxclean/extension zip
```

生成的上传包位于：
`apps/extension/.output/keepxcleanextension-0.1.1-chrome.zip`
