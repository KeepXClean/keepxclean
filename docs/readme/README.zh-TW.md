<div align="center">
  <img src="../../apps/web/public/logo.svg" width="72" height="72" alt="KeepXClean Logo" />
  <h1>KeepXClean</h1>
  <p><strong>本地優先、高信噪比的 X（Twitter）時間軸與留言區淨空擴充功能</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd"><img src="https://img.shields.io/badge/Chrome_線上應用程式商店-添加至_Chrome-13865F?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
    <a href="https://keepxclean.com/?lang=zh-TW"><img src="https://img.shields.io/badge/官方網站-keepxclean.com-0F1419?style=flat-square" alt="Website" /></a>
    <a href="https://x.com/linheitu"><img src="https://img.shields.io/badge/X-%40linheitu-000000?style=flat-square&logo=x&logoColor=white" alt="X @linheitu" /></a>
    <a href="https://30s.to/@linmo"><img src="https://img.shields.io/badge/30s.to-%40linmo-13865F?style=flat-square" alt="30s.to/@linmo" /></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/badge/開源授權-MIT-blue?style=flat-square" alt="MIT License" /></a>
    <a href="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml"><img src="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml/badge.svg" alt="CI & Auto Deploy" /></a>
  </p>

  <p>
    <a href="../../README.md">English</a> ·
    <a href="./README.zh-CN.md">简体中文</a> ·
    <strong>繁體中文</strong> ·
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

**KeepXClean** 直接在瀏覽器本地解析 X（`x.com`）既有的 GraphQL 資料流，以 **低於 1 ms** 的確定性規則即時攔截留言區機器人、高仿原推主、抽獎導流、幣圈洗版與推廣廣告——無需額外註冊，支援可選 X 帳號操作，時間軸保持 60/120 FPS 絲滑流暢。

<div align="center">

<a href="https://keepxclean.com/?lang=zh-TW#video">
    <img src="../../apps/web/public/promo/keepxclean-promo-poster.jpg" width="800" alt="KeepXClean 30 秒宣傳影片預覽" />
  </a>
  <p><a href="https://keepxclean.com/?lang=zh-TW#video"><strong>▶ 前往官網觀看 30 秒宣傳影片</strong></a></p>

</div>

## 核心亮點

- **本地優先、`< 1ms` 引擎與解析健康自檢**：直接複用瀏覽器已接收的 X GraphQL 回應，零新增擴充權限（僅 `storage` + `alarms`）、零額外 API 請求、60/120 FPS 流暢捲動，並內建純本機解析健康自檢（異常時提供脫敏診斷摘要、自動恢復、零遙測）。
- **多維度噪音防線**：涵蓋留言區防灌水、**同貼複讀水軍去重**（保留首條並攔截重複洗版）、**官方 `@grok` 保護與短召喚過濾**、高仿號辨識、互動乞討、高頻洗版、**結構化外連網域過濾**、**10 語種公共詞庫包（內建 45 條規則）**、**純離線 `.kxc-pack.json` 主題規則包**、語種過濾及推廣廣告移除。
- **分場景策略、折疊條直達與轉引穿透**：區分 **For You** 與 **Following** 並支援分場景模式（`inherit` / `collapse` / `strip` / `bypass`），展開折疊條可直達調整命中規則或一鍵停用該詞條並即時恢復。
- **快速上手卡、規則統計與可選同步**：全新安裝非侵入式快速上手卡（零自動開啟分頁）、依規則統計與近 7 日趨勢及**純本機 Canvas 2D 淨空戰報 PNG**（零隱私資訊）、**4.5 秒復原視窗**，以及預設關閉的**可選 `chrome.storage.sync` 跨裝置同步**（本機黑白名單與日誌始終留存本機）。
- **10 種原生介面語言與 Chrome / Firefox MV3**：完整支援繁中、簡中、英、日、韓、西、葡、法、德、俄 10 種語言。

## 安裝方式

### 方式一：Chrome 線上應用程式商店（推薦）

前往 [**Chrome 線上應用程式商店**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) 一鍵安裝，相容 Chrome、Edge、Brave、Arc 等所有 Chromium 桌面瀏覽器。

### 方式二：GitHub Releases 離線套件（`.zip`）

1. 從 [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) 下載最新 `keepxcleanextension-*-chrome.zip` 並解壓縮。
2. 開啟 `chrome://extensions`，啟用右上角 **開發人員模式**。
3. 點擊 **載入未打包項目** 並選取解壓縮後的資料夾。

## 隱私與安全

- KeepXClean 不索取密碼或私訊。擴充功能會在本機讀取 X 帳號 Cookie，用於帳號識別及使用者觸發的 X 操作；工作階段 Cookie 與網頁客戶端授權值僅用於與 X 通訊，不會傳送至 KeepXClean 伺服器。可選社群回報的資料範圍請見隱私權政策。
- **預設關閉與本機留存**：全新安裝下 `syncNativeXBlock`、`enableCrowdReport` 與可選跨裝置同步（`chrome.storage.sync`）皆預設關閉；可選同步排除大體積本機黑白名單與歷史日誌，本機解析自檢不含 PII 且零遙測。
- **零第三方追蹤**：不含任何統計 SDK、廣告追蹤器或遠端程式碼執行。
- **匿名社群同步**：快照下載不帶憑證（`credentials: 'omit'`），社群回報僅傳送不可逆加鹽 `SHA-256` 雜湊值。
- 詳見官方雙語 [**隱私權政策**](https://keepxclean.com/privacy/)。

## 專案結構與本地開發

```text
packages/shared/   確定性規則引擎、X GraphQL 解析、10 語種公共詞庫包（45 條規則）、離線規則包校驗與多語言模組
apps/extension/    WXT (Manifest V3 — Chrome 與 Firefox) 瀏覽器擴充功能、Shadow DOM 介面、Canvas 2D 戰報與背景任務
apps/server/       Cloudflare Workers API、D1 計票聚合、快照快取與維護者 cloud-rules CLI
apps/web/          官方網站與瀏覽器模擬互動沙盒 (keepxclean.com)
tests/e2e/         5 層端對端與對抗性驗證測試套件
tests/browser-e2e/ 真實 Chromium MV3 擴充功能 E2E 測試套件
```

環境需求：**Node.js ≥ 20** 與 **pnpm**

```bash
pnpm install
pnpm dev:ext      # 啟動擴充功能開發模式
pnpm lint         # 全專案 ESLint 程式碼檢查
pnpm typecheck    # 全專案型別檢查
pnpm test         # 執行單元與整合測試
pnpm test:e2e     # 執行 5 層 E2E 測試套件
pnpm build        # 建置正式版產物
pnpm test:browser # 執行真實 Chromium MV3 擴充功能 E2E
```

版本更新紀錄請見 [CHANGELOG.md](../../CHANGELOG.md)。自架部署與 CI/CD 設定請參閱 [docs/DEPLOYMENT.md](../DEPLOYMENT.md)。

## 作者與開源授權

- **作者**：X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **開源授權**：基於 [MIT License](../../LICENSE) 開源發布。KeepXClean 為獨立開源專案，與 X Corp. 無任何隸屬或關聯關係。
