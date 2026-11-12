<div align="center">
  <img src="../../apps/web/public/logo.svg" width="72" height="72" alt="KeepXClean Logo" />
  <h1>KeepXClean</h1>
  <p><strong>ローカルファースト・高シグナルな X（Twitter）タイムライン＆リプライ浄化拡張機能</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd"><img src="https://img.shields.io/badge/Chrome_Web_Store-Chromeに追加-13865F?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
    <a href="https://keepxclean.com/?lang=ja"><img src="https://img.shields.io/badge/Website-keepxclean.com-0F1419?style=flat-square" alt="Website" /></a>
    <a href="https://x.com/linheitu"><img src="https://img.shields.io/badge/X-%40linheitu-000000?style=flat-square&logo=x&logoColor=white" alt="X @linheitu" /></a>
    <a href="https://30s.to/@linmo"><img src="https://img.shields.io/badge/30s.to-%40linmo-13865F?style=flat-square" alt="30s.to/@linmo" /></a>
    <a href="../../LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License" /></a>
    <a href="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml"><img src="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml/badge.svg" alt="CI & Auto Deploy" /></a>
  </p>

  <p>
    <a href="../../README.md">English</a> ·
    <a href="./README.zh-CN.md">简体中文</a> ·
    <a href="./README.zh-TW.md">繁體中文</a> ·
    <strong>日本語</strong> ·
    <a href="./README.ko.md">한국어</a> ·
    <a href="./README.es.md">Español</a> ·
    <a href="./README.pt.md">Português</a> ·
    <a href="./README.fr.md">Français</a> ·
    <a href="./README.de.md">Deutsch</a> ·
    <a href="./README.ru.md">Русский</a>
  </p>
</div>

---

**KeepXClean** は、ブラウザがすでに受信した X（`x.com`）の GraphQL レスポンスをローカルメモリ上で直接解析し、インプレゾンビ・なりすまし・懸賞誘導・暗号資産スパム・プロモーション広告を **1 ms 未満** で遮断するオープンソース拡張機能です。

## 主な特長

- **完全ローカル処理＆ `< 1ms` 決定論的エンジン**：ログイン不要、追加の X API ポーリングゼロ、60/120 FPS の滑らかなスクロールを維持。
- **多層スパム防御**：インプレゾンビ短文リプライ、投稿主なりすまし、プレゼント企画誘導、高頻度連投、ハッシュタグ乱用、**24種類の内蔵クラウドキーワードパック**、言語フィルター、プロモ広告除去に対応。
- **1行折りたたみ表示＆サイレント非表示 + 引用貫通**：判定根拠を確認できる1行バーへの折りたたみと完全非表示を切替可能。フォロー中のユーザーがスパムを引用した場合は引用元スパマーのみを正確に特定。
- **4.5秒の取り消し猶予＆誠実な3段階フィードバック**：即時ローカル遮断後 **4.5秒間の復元トースト** を表示し、その後オプションで X 公式ブロックとソルト付き `SHA-256` 匿名コミュニティ集計（`1アカウント＝1票`、フォロワー5万人以上は `5倍` 保護閾値）を実行。
- **10言語ネイティブ対応**：日本語・英語・中国語（簡体/繁体）・韓国語・スペイン語・ポルトガル語・フランス語・ドイツ語・ロシア語を内蔵。

## インストール方法

### 方法 1：Chrome ウェブストアから導入（推奨）

[**Chrome ウェブストア**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) からワンクリックで追加できます（Chrome / Edge / Brave / Arc などのデスクトップ Chromium ブラウザ対応）。

### 方法 2：GitHub Releases から手動導入（`.zip`）

1. [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) から最新の `keepxcleanextension-*-chrome.zip` をダウンロードして解凍します。
2. `chrome://extensions` を開き、右上の **デベロッパーモード** を有効化します。
3. **パッケージ化されていない拡張機能を読み込む** から解凍したフォルダを選択します。

## プライバシーとセキュリティ

- **認証情報アクセスゼロ**：パスワード、Cookie、認証トークン、メールアドレス、DM には一切触れません。
- **外部トラッキングゼロ**：サードパーティ解析 SDK や広告トラッカー、リモートコード実行は一切ありません。
- 詳細は公式バイリンガル [**プライバシーポリシー**](https://keepxclean.com/privacy/) をご覧ください。

## リポジトリ構成と開発コマンド

```text
packages/shared/   決定論的ルールエンジン、X GraphQL パーサー、24種キーワード＆i18n
apps/extension/    WXT (Manifest V3) ブラウザ拡張機能本体
apps/server/       Cloudflare Workers API、D1 集計＆R2 スナップショット配信
apps/web/          公式サイト＆インタラクティブ・ブラウザサンドボックス
tests/e2e/         5階層エンドツーエンド＆敵対的テストスイート
```

必須環境：**Node.js ≥ 20**、**pnpm**

```bash
pnpm install
pnpm dev:ext      # 開発モードで拡張機能を起動
pnpm typecheck    # 型チェック
pnpm test         # 単体・結合テストを実行
pnpm test:e2e     # 5階層 E2E テストを実行
pnpm build        # 本番ビルド
```

セルフホストおよび CI/CD 設定は [docs/DEPLOYMENT.md](../DEPLOYMENT.md) を参照してください。

## 作者とライセンス

- **作者**：X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **ライセンス**：[MIT License](../../LICENSE) の下で公開されています。KeepXClean は独立したオープンソースプロジェクトであり、X Corp. とは無関係です。
