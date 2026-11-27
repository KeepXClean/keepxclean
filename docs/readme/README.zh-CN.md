<div align="center">
  <img src="../../apps/web/public/logo.svg" width="72" height="72" alt="KeepXClean Logo" />
  <h1>KeepXClean</h1>
  <p><strong>本地优先、高信噪比的 X（Twitter）时间线与评论区净空扩展</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd"><img src="https://img.shields.io/badge/Chrome_应用商店-添加至_Chrome-13865F?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
    <a href="https://keepxclean.com/?lang=zh-CN"><img src="https://img.shields.io/badge/官方网站-keepxclean.com-0F1419?style=flat-square" alt="Website" /></a>
    <a href="https://x.com/linheitu"><img src="https://img.shields.io/badge/X-%40linheitu-000000?style=flat-square&logo=x&logoColor=white" alt="X @linheitu" /></a>
    <a href="https://30s.to/@linmo"><img src="https://img.shields.io/badge/30s.to-%40linmo-13865F?style=flat-square" alt="30s.to/@linmo" /></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/badge/开源协议-MIT-blue?style=flat-square" alt="MIT License" /></a>
    <a href="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml"><img src="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml/badge.svg" alt="CI & Auto Deploy" /></a>
  </p>

  <p>
    <a href="../../README.md">English</a> ·
    <strong>简体中文</strong> ·
    <a href="./README.zh-TW.md">繁體中文</a> ·
    <a href="./README.ja.md">日本語</a> ·
    <a href="./README.ko.md">한국어</a> ·
    <a href="./README.es.md">Español</a> ·
    <a href="./README.pt.md">Português</a> ·
    <a href="./README.fr.md">Français</a> ·
    <a href="./README.de.md">Deutsch</a> ·
    <a href="./README.ru.md">Русский</a>
  </p>
</div>

---

**KeepXClean** 直接在浏览器本地解析 X（`x.com`）既有的 GraphQL 数据流，以 **低于 1 ms** 的确定性规则毫秒级拦截评论区水军、高仿号、口令抽奖引流、币圈刷屏与推广广告——无需额外注册，支持可选 X 账号操作，刷推保持 60/120 FPS 丝滑顺畅。

<div align="center">

<a href="https://keepxclean.com/?lang=zh-CN#video">
    <img src="../../apps/web/public/promo/keepxclean-promo-poster.jpg" width="800" alt="KeepXClean 30 秒宣传视频预览" />
  </a>
  <p><a href="https://keepxclean.com/?lang=zh-CN#video"><strong>▶ 前往官网观看 30 秒宣传视频</strong></a></p>

</div>

## 核心亮点

- **本地优先、`< 1ms` 引擎与解析健康自检**：直接复用浏览器已接收的 X GraphQL 响应，零新增扩展权限（仅 `storage` + `alarms`）、零额外接口轮询、60/120 FPS 丝滑滚动，并内置纯本地 X GraphQL 解析健康自检（异常时提供脱敏诊断摘要、自动恢复、零遥测）。
- **多维高信噪比防线**：
  - 评论区防灌水、**同贴复读水军去重**（归一化精确匹配保留第 1 条，拦截第 2 条起复制刷屏）、蓝标水军短评识别、低粉简介外链导流拦截与原推主高仿号识别。
  - **Grok 互动控制**：全预设默认保护官方 `@grok` 回复不被高频规则误杀，可选拦截评论区短 `@grok` 召唤及按需隐藏 Grok 回复。
  - 口令抽奖/互动乞讨、互关涨粉车队、高频刷屏、`#hashtag` / `$cashtag` 堆砌，以及**结构化外链域名过滤**（根域名自动覆盖全部子域名，穿透推文与简介链接及转引内容）。
  - **10 语种公共词库包（内置 45 条规则）**（`universal` + 9 大语种分包，支持整包与单条开关及复制自定义正则）、自定义规则、**纯离线 `.kxc-pack.json` 主题规则包**（文件/剪贴板导入导出与独立一键卸载）、语种黑白名单及推广广告移除。
- **For You / Following 分场景策略与折叠条直达操作**：精准区分「为你推荐」与「正在关注」时间线并支持分场景模式（`inherit` / `collapse` / `strip` / `bypass`），配合转引穿透与折叠条展开直达「调整规则」及一键「停用此词条」即时恢复。
- **快速上手引导、规则统计与可选跨设备同步**：全新安装非侵入式引导卡（不自动弹标签页）、**按规则分布统计 + 7 日趋势 + 纯本地 Canvas 2D 净空战报 PNG**（零隐私信息）、**4.5 秒撤销窗口**与诚实三阶段反馈，以及默认关闭的**可选 `chrome.storage.sync` 跨设备配置同步**（本地黑白名单与日志始终留存本机）。
- **10 种原生界面语言与 Chrome / Firefox MV3**：完整支持 `en`、`zh-CN`、`zh-TW`、`ja`、`ko`、`es`、`pt`、`fr`、`de`、`ru`。

## 安装方式

### 方式一：Chrome 应用商店一键安装（推荐）

前往 [**Chrome 应用商店**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) 一键添加，完美支持 Google Chrome、Microsoft Edge、Brave、Arc 等所有 Chromium 内核桌面浏览器。

### 方式二：GitHub Releases 离线包加载（`.zip`）

1. 从 [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) 下载最新 `keepxcleanextension-*-chrome.zip` 并解压。
2. 打开浏览器 `chrome://extensions`，开启右上角 **开发者模式**。
3. 点击左上角 **加载已解压的扩展程序**，选择解压后的文件夹即可。

## 隐私与安全承诺

- KeepXClean 不索取密码或私信。扩展会在本地读取 X 账号 Cookie，用于账号识别及用户触发的 X 操作；会话 Cookie 和网页客户端授权值仅用于与 X 通信，不会发送至 KeepXClean 服务器。可选社区举报的数据范围见隐私政策。
- **默认关闭与本地留存**：全新安装时 `syncNativeXBlock`、`enableCrowdReport` 与可选跨设备同步（`chrome.storage.sync`）均默认关闭；可选同步不包含大体积本地黑白名单与历史日志，本地解析健康自检不含任何 PII 且零遥测。
- **零第三方遥测**：无任何统计分析 SDK、广告追踪器或远程代码执行。
- **匿名去重同步**：公共黑名单拉取不携带凭据（`credentials: 'omit'`），社区投票仅使用不可逆单向加盐 `SHA-256` 哈希去重。
- 详见官网中英双语 [**隐私政策**](https://keepxclean.com/privacy/)。

## 仓库结构与本地开发

```text
packages/shared/   共享确定性规则引擎、X GraphQL 解析、10 语种公共词库包（45 条规则）、离线规则包校验与多语言工具
apps/extension/    WXT (Manifest V3 — Chrome 与 Firefox) 浏览器扩展、Shadow DOM 界面、Canvas 2D 战报与后台任务
apps/server/       Cloudflare Workers 社区聚合 API、D1 数据库、快照缓存与维护者 cloud-rules CLI
apps/web/          官方网站与浏览器仿真交互沙盒 (keepxclean.com)
tests/e2e/         5 层场景与对抗性安全测试套件
tests/browser-e2e/ 真实 Chromium MV3 扩展 E2E 测试套件
```

环境要求：**Node.js ≥ 20** 与 **pnpm**

```bash
pnpm install
pnpm dev:ext      # 启动扩展开发调试模式
pnpm lint         # 全仓 ESLint 代码检查
pnpm typecheck    # 全仓 TypeScript 类型检查
pnpm test         # 运行全仓单元与集成测试
pnpm test:e2e     # 运行 5 层场景与对抗测试套件
pnpm build        # 构建生产环境产物
pnpm test:browser # 运行真实 Chromium MV3 扩展 E2E
```

版本更新日志请见 [CHANGELOG.md](../../CHANGELOG.md)。如需了解服务端自托管、维护者 `cloud-rules` CLI 与 CI/CD 自动发布配置，请参阅 [docs/DEPLOYMENT.md](../DEPLOYMENT.md)。

## 作者与开源协议

- **作者**：X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **开源协议**：基于 [MIT License](../../LICENSE) 开源发布。KeepXClean 是独立开源项目，与 X Corp. 无任何隶属或关联关系。
