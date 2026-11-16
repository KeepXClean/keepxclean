# KeepXClean — Chrome Web Store 提交与更新指南 (v0.1.2)

本文档整理了 Chrome Web Store Developer Dashboard 所需的全部产物路径、优化后的通俗商店标题/副标题/详情页文案、官方网址与开源说明、权限理由及隐私合规问卷答案，可直接复制粘贴使用。

---

## 1. 提交产物清单

| 用途 | 规格要求 | 项目内文件路径 |
| --- | --- | --- |
| **扩展上传包 (ZIP)** | Manifest V3 `.zip` | `apps/extension/.output/keepxcleanextension-0.1.2-chrome.zip` |
| **商店图标 (Store Icon)** | `128×128` PNG | `apps/extension/public/icon/icon-128.png` |
| **本地化截图（10 种语言 × 5 张）** | 每张 `1280×800`，RGB PNG | `release/chrome-web-store/assets/locales/<lang>/01-rules.png` 至 `05-preferences.png` |
| **小型宣传图块** | `440×280`，RGB PNG | `release/chrome-web-store/assets/promo-small-440x280.png` |
| **顶部宣传图块** | `1400×560`，RGB PNG | `release/chrome-web-store/assets/promo-large-1400x560.png` |

语言：`en`、`zh-CN`、`zh-TW`、`ja`、`ko`、`de`、`es`、`pt`、`fr`、`ru`。后台对应 `zh_CN`、`zh_TW`、`pt_BR`。每种语言均上传五张：过滤规则、关键词、折叠与恢复、黑白名单、偏好与可选共享；全球通用截图使用英文完整五张。全球宣传图使用英文；额外本地化宣传图保存在各语言目录，供后续渠道使用。

文案与复现方法见 `release/chrome-web-store/creative/`。所有截图来自实际扩展组件和明确标注的示例数据，含透明盾牌 + x 新品牌；不得继续上传旧 X 图标或只有单张中文的旧截图组合。

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

完整十语种描述以 `creative/descriptions/<lang>.txt` 为准，后台逐语种保存。

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
A free, open-source browser extension for a cleaner X (Twitter) timeline, search results and replies.

FEATURES

• Make room for better posts.
Filter spam replies, impersonators and promoted ads. Start with one of three presets.

• Your feed. Your rules.
24 public keyword rules, custom keywords and regex. Choose what gets filtered.

• Clean up without losing context.
Collapse unwanted posts, inspect the reason and expand them whenever you want.

• Keep the people you trust.
Manage block and allow lists by permanent account ID. Import your existing X blocklist.

• Local filtering. Clear choices.
Choose your language and theme. X block sync and community reporting are optional.

LOCAL-FIRST PRIVACY

KeepXClean does not request passwords or DMs. It reads X account cookies locally for account identification and user-triggered X operations. Session cookies and web-client authorization values are used only with X, never sent to KeepXClean servers. Optional community reporting is described in the privacy policy.

Optional reports include public details of the reported account, a reason, and a SHA-256-derived reporter identifier with account age. X session cookies and authorization values are not sent to KeepXClean servers.

KeepXClean is an independent project. It is not affiliated with, endorsed by, or produced by X Corp.

Website & demo: https://keepxclean.com
Privacy policy: https://keepxclean.com/privacy/
Source code (MIT): https://github.com/KeepXClean/keepxclean
```

---

### 简体中文 (`zh-CN`)

**Title**（来自 `_locales/zh_CN/messages.json`）:
```text
KeepXClean - 屏蔽 X (Twitter) 垃圾评论、水军与广告
```

**Summary / Subtitle**（来自 `_locales/zh_CN/messages.json`，≤ 132 字符限制）:
```text
免费开源的 X (Twitter) 净化插件：自动折叠或屏蔽垃圾评论、水军机器人、高仿骗子、引流刷屏与推广广告，本地过滤，规则可调。官网 keepxclean.com
```

**Detailed Description**:
```text
KeepXClean 是免费开源的浏览器扩展，帮助你管理 X（Twitter）时间线、搜索结果与评论区中的不想看内容。

功能亮点

• 把注意力留给值得读的内容
过滤垃圾回复、高仿账号与推广广告。三档强度，按你的习惯选择。

• 你的信息流，你来定规则
内置 24 条公共词库规则，支持自定义关键词与正则，逐条决定过滤范围。

• 收起噪音，也保留上下文
折叠不想看的帖子，查看拦截原因；需要时，随时展开原文。

• 屏蔽骚扰，留住值得关注的人
用永久账号 ID 管理黑白名单，也能导入你已有的 X 黑名单。

• 本地过滤，每项选择都清楚
界面支持 10 种语言与明暗主题；同步 X 拉黑、社区举报均可自行选择。

本地优先与隐私

KeepXClean 不索取密码或私信。扩展会在本地读取 X 账号 Cookie，用于账号识别及用户触发的 X 操作；会话 Cookie 和网页客户端授权值仅用于与 X 通信，不会发送至 KeepXClean 服务器。可选社区举报的数据范围见隐私政策。

可选举报包含被举报账号的公开资料、原因，以及提交者的 SHA-256 派生标识和账号年龄；X 会话 Cookie 与授权值不发送至 KeepXClean 服务器。

KeepXClean 是独立项目，与 X Corp. 无关联，未经其背书，也非其出品。

官网与演示: https://keepxclean.com
隐私政策: https://keepxclean.com/privacy/
开源代码（MIT）: https://github.com/KeepXClean/keepxclean
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
X/Twitter host access runs the local filter and in-page controls, reads the account UID cookie locally, and uses the existing X session for user-requested lookup, blocklist import and optional native blocking. Session cookies and authorization values are used only with X, never sent to KeepXClean. KeepXClean hosts provide public JSON snapshots and optional reports: public target UID/handle/name/follower count, reason, a SHA-256-derived reporter identifier and account age. The server uses request IPs for short-lived abuse rate limits. Optional HTTPS/local host access is requested only for a user-configured self-hosted service. No remote executable code is loaded.
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

按 [Chrome Web Store 官方 FAQ 第 3、4 项](https://developer.chrome.com/docs/webstore/user_data/) 披露完整处理范围：仅在本地处理的数据也需要勾选，不能以“不上传服务器”为由排除。

| 表单类别 | 选择 | 实际用途 |
| --- | --- | --- |
| Personally identifiable information | 勾选 | 本地账号 UID；可选举报中的目标公开 UID、用户名、昵称及提交者派生标识 |
| Authentication information | 勾选 | 现有 X 会话 Cookie、CSRF Cookie 和网页客户端授权值，用于用户触发的 X 操作；不会发送至 KeepXClean 服务器 |
| Location | 勾选 | 服务端使用请求 IP 执行短期防滥用限流；不请求设备定位 |
| User activity | 勾选 | X 页面请求拦截、本地过滤记录，以及用户触发的拉黑、导入与可选举报操作 |
| Website content | 勾选 | 本地处理 X 帖子和公开账号资料 |
| Health / Financial / Personal communications / Web history | 不勾选 | 不处理这些类别，不收集一般浏览历史、私信或支付信息 |

未开启社区共享时，不提交社区举报；公开快照请求不携带账号标识或 Cookie。开启后，用户触发的举报包含目标公开数字 UID、@handle、显示名称、粉丝数、原因、提交者 UID 的 SHA-256 派生标识及账号年龄。哈希标识用于去重，并非保证无法关联个人的匿名数据。

以下三项合规承诺均勾选：

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
`apps/extension/.output/keepxcleanextension-0.1.2-chrome.zip`
