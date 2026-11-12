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

**KeepXClean** 直接在瀏覽器本地解析 X（`x.com`）既有的 GraphQL 資料流，以 **低於 1 ms** 的確定性規則即時攔截留言區機器人、高仿原推主、抽獎導流、幣圈洗版與推廣廣告——無需登入帳號，不觸碰隱私憑證，時間軸保持 60/120 FPS 絲滑流暢。

<div align="center">

https://github.com/user-attachments/assets/744a6b36-b6b5-4933-b22a-6471c5741ea7

</div>

## 核心亮點

- **本地優先與 `< 1ms` 確定性引擎**：直接複用瀏覽器已接收的 X GraphQL 回應，零額外 API 請求、零風控輪詢。
- **多維度噪音防線**：涵蓋留言區防灌水、藍標水軍短評、高仿號辨識、互動乞討、高頻洗版、標籤堆砌、**24 條內建公共詞庫**（支援逐條開關與複製自訂正規表示式）、語種過濾及推廣廣告移除。
- **折疊條與無痕隱藏 + 轉引穿透**：支援折疊為可展開檢視證據的單行提示條或無痕移除；已追隨帳號轉發/引用垃圾內容時，精準鎖定被轉引的垃圾來源帳號。
- **誠實三階段回饋與 4.5 秒復原視窗**：點擊淨空立即本地生效並提供 **4.5 秒復原倒數**；結束後依偏好執行 X 原生封鎖與加鹽 `SHA-256` 匿名社群計票（`1 帳號 = 1 票`，≥5 萬粉帳號享 `5×` 門檻保護）。
- **10 種原生介面語言**：完整支援繁中、簡中、英、日、韓、西、葡、法、德、俄 10 種語言。

## 安裝方式

### 方式一：Chrome 線上應用程式商店（推薦）

前往 [**Chrome 線上應用程式商店**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) 一鍵安裝，相容 Chrome、Edge、Brave、Arc 等所有 Chromium 桌面瀏覽器。

### 方式二：GitHub Releases 離線套件（`.zip`）

1. 從 [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) 下載最新 `keepxcleanextension-*-chrome.zip` 並解壓縮。
2. 開啟 `chrome://extensions`，啟用右上角 **開發人員模式**。
3. 點擊 **載入未打包項目** 並選取解壓縮後的資料夾。

## 隱私與安全

- **零憑證存取**：絕不讀取密碼、Cookie、登入 Token、信箱或私訊（DM）。
- **零第三方追蹤**：不含任何統計 SDK、廣告追蹤器或遠端程式碼執行。
- **匿名社群同步**：快照下載不帶憑證（`credentials: 'omit'`），社群回報僅傳送不可逆加鹽 `SHA-256` 雜湊值。
- 詳見官方雙語 [**隱私權政策**](https://keepxclean.com/privacy/)。

## 專案結構與本地開發

```text
packages/shared/   確定性規則引擎、X GraphQL 解析、24 條公共詞庫與多語言模組
apps/extension/    WXT (Manifest V3) 瀏覽器擴充功能與背景任務
apps/server/       Cloudflare Workers API、D1 計票聚合與 R2 快照快取
apps/web/          官方網站與瀏覽器模擬互動沙盒 (keepxclean.com)
tests/e2e/         5 層端對端與對抗性驗證測試套件
```

環境需求：**Node.js ≥ 20** 與 **pnpm**

```bash
pnpm install
pnpm dev:ext      # 啟動擴充功能開發模式
pnpm typecheck    # 全專案型別檢查
pnpm test         # 執行單元與整合測試
pnpm test:e2e     # 執行 5 層 E2E 測試套件
pnpm build        # 建置正式版產物
```

自架部署與 CI/CD 設定請參閱 [docs/DEPLOYMENT.md](../DEPLOYMENT.md)。

## 作者與開源授權

- **作者**：X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **開源授權**：基於 [MIT License](../../LICENSE) 開源發布。KeepXClean 為獨立開源專案，與 X Corp. 無任何隸屬或關聯關係。
