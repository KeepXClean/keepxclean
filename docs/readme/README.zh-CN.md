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

**KeepXClean** 直接在浏览器本地解析 X（`x.com`）既有的 GraphQL 数据流，以 **低于 1 ms** 的确定性规则毫秒级拦截评论区水军、高仿号、口令抽奖引流、币圈刷屏与推广广告——无需登录任何账号，不触碰隐私凭据，刷推保持 60/120 FPS 丝滑顺畅。

## 核心亮点

- **本地优先与 `< 1ms` 确定性引擎**：直接复用浏览器已接收的 X GraphQL 响应，零额外账号资料请求、零风控轮询、零大模型阻塞开销。
- **多维高信噪比防线**：
  - 评论区防灌水、蓝标水军短评识别、低粉简介外链导流拦截与原推主高仿号识别。
  - 口令抽奖/互动乞讨、互关涨粉车队、日均/短期爆发高频刷屏及 `#hashtag` / `$cashtag` 堆砌过滤。
  - 内置 **5 大分类共 24 条公共词库包**（支持逐条独立开关与一键复制自定义正则）、多范围自定义规则、语种黑白名单及推广流无痕移除。
- **单行折叠条与无痕隐藏 + 转引穿透**：支持折叠为可随时展开核查命中证据的单行提示条，或彻底无痕移除；已关注博主转发/引用垃圾内容时，快捷按钮精准指向被转引的源头垃圾号。
- **诚实三阶段净空与 4.5 秒撤销窗口**：点击净空后本地立即生效并提供 **4.5 秒倒计时撤销**；窗口结束后按偏好执行 X 原生拉黑与单向加盐 `SHA-256` 匿名社区计票（严格 `1 账号 = 1 票`，投票号需满 30 天，≥5 万粉大 V 享 `5×` 门槛保护）。
- **10 种原生界面语言**：完整内置简中、繁中、英、日、韩、西、葡、法、德、俄 10 国语言支持。

## 安装方式

### 方式一：Chrome 应用商店一键安装（推荐）

前往 [**Chrome 应用商店**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) 一键添加，完美支持 Google Chrome、Microsoft Edge、Brave、Arc 等所有 Chromium 内核桌面浏览器。

### 方式二：GitHub Releases 离线包加载（`.zip`）

1. 从 [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) 下载最新 `keepxcleanextension-*-chrome.zip` 并解压。
2. 打开浏览器 `chrome://extensions`，开启右上角 **开发者模式**。
3. 点击左上角 **加载已解压的扩展程序**，选择解压后的文件夹即可。

## 隐私与安全承诺

- **零凭据读取**：绝不读取账号密码、Cookie、登录 Token、邮箱或私信（DM）。
- **零第三方遥测**：无任何统计分析 SDK、广告追踪器或远程代码执行。
- **匿名去重同步**：公共黑名单拉取不携带凭据（`credentials: 'omit'`），社区投票仅使用不可逆单向加盐 `SHA-256` 哈希去重。
- 详见官网中英双语 [**隐私政策**](https://keepxclean.com/privacy/)。

## 仓库结构与本地开发

```text
packages/shared/   共享确定性规则引擎、X GraphQL 解析、24 条公共词库与多语言工具
apps/extension/    WXT (Manifest V3) 浏览器扩展、Shadow DOM 界面与后台串行任务
apps/server/       Cloudflare Workers 社区聚合 API、D1 数据库与 R2 快照缓存
apps/web/          官方网站与浏览器仿真交互沙盒 (keepxclean.com)
tests/e2e/         5 层端到端与对抗性安全测试套件
```

环境要求：**Node.js ≥ 20** 与 **pnpm**

```bash
pnpm install
pnpm dev:ext      # 启动扩展开发调试模式
pnpm typecheck    # 全仓 TypeScript 类型检查
pnpm test         # 运行全仓单元与集成测试
pnpm test:e2e     # 运行 5 层端到端测试套件
pnpm build        # 构建生产环境产物
```

如需了解服务端自托管与 CI/CD 自动发布配置，请参阅 [docs/DEPLOYMENT.md](../DEPLOYMENT.md)。

## 作者与开源协议

- **作者**：X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **开源协议**：基于 [MIT License](../../LICENSE) 开源发布。KeepXClean 是独立开源项目，与 X Corp. 无任何隶属或关联关系。
