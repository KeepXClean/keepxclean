<div align="center">
  <img src="apps/web/public/logo.svg" width="72" height="72" alt="KeepXClean Logo" />
  <h1>KeepXClean</h1>
  <p><strong>Local-first, high-signal timeline &amp; reply filter extension for X (Twitter)</strong></p>

  <p>
    <a href="https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd"><img src="https://img.shields.io/badge/Chrome_Web_Store-Add_to_Chrome-13865F?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Web Store" /></a>
    <a href="https://keepxclean.com"><img src="https://img.shields.io/badge/Website-keepxclean.com-0F1419?style=flat-square" alt="Website" /></a>
    <a href="https://x.com/linheitu"><img src="https://img.shields.io/badge/X-%40linheitu-000000?style=flat-square&logo=x&logoColor=white" alt="X @linheitu" /></a>
    <a href="https://30s.to/@linmo"><img src="https://img.shields.io/badge/30s.to-%40linmo-13865F?style=flat-square" alt="30s.to/@linmo" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License" /></a>
    <a href="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml"><img src="https://github.com/KeepXClean/keepxclean/actions/workflows/deploy.yml/badge.svg" alt="CI & Auto Deploy" /></a>
  </p>

  <p>
    <strong>English</strong> ·
    <a href="docs/readme/README.zh-CN.md">简体中文</a> ·
    <a href="docs/readme/README.zh-TW.md">繁體中文</a> ·
    <a href="docs/readme/README.ja.md">日本語</a> ·
    <a href="docs/readme/README.ko.md">한국어</a> ·
    <a href="docs/readme/README.es.md">Español</a> ·
    <a href="docs/readme/README.pt.md">Português</a> ·
    <a href="docs/readme/README.fr.md">Français</a> ·
    <a href="docs/readme/README.de.md">Deutsch</a> ·
    <a href="docs/readme/README.ru.md">Русский</a>
  </p>
</div>

---

**KeepXClean** filters spam, reply bots, lookalike impersonators, engagement bait, crypto shilling, and promoted ads on X (`x.com`) in under **1 ms** — directly inside your browser without reading your account credentials or slowing down timeline scrolling.

## Highlights

- **Local-First & `< 1ms` Deterministic Engine**: Evaluates tweet payloads already delivered to your browser via X's own GraphQL streams. Zero account login, zero extra X API polling, and smooth 60/120 FPS scrolling.
- **Comprehensive Noise Defense**:
  - Reply-section anti-flood, Blue-verified low-effort bot replies, bio link funnels, and OP lookalike impersonator detection.
  - Engagement/giveaway bait, mutual-follow rings, high-frequency daily/burst posters, and `#hashtag` / `$cashtag` stuffing.
  - **24 built-in public keyword rules** across 5 spam categories (per-rule toggles + one-click copy to custom regex), custom multi-scope rules, language whitelist/blacklist, and silent promoted-ad removal.
- **Folded Bar or Silent Strip + Quote Penetration**: Collapse intercepted posts into an inspectable single-line bar or remove them cleanly. When a followed account quotes or retweets spam, quick actions accurately target the quoted spammer.
- **Honest 3-Phase Quick Clean & 4.5s Undo**: Instant local block with a **4.5-second undo window**, followed by optional X native block and deduplicated anonymous community reporting (`1 account = 1 vote`, 30-day minimum reporter age, `5×` threshold protection for ≥50k-follower creators).
- **10 Native UI Languages**: Built-in support for `en`, `zh-CN`, `zh-TW`, `ja`, `ko`, `es`, `pt`, `fr`, `de`, and `ru`.

## Installation

### Option 1: Chrome Web Store (Recommended)

Install in 1 click from the [**Chrome Web Store**](https://chromewebstore.google.com/detail/keepxclean/plngcinmibjmkjjpfjemhfabjfjjkhhd) — compatible with Google Chrome, Microsoft Edge, Brave, Arc, and other Chromium desktop browsers.

### Option 2: Manual Sideload (`.zip`)

1. Download the latest `keepxcleanextension-*-chrome.zip` from [**GitHub Releases**](https://github.com/KeepXClean/keepxclean/releases/latest) and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder.

## Privacy & Security

- **Zero Credentials**: Never reads passwords, cookies, auth tokens, email addresses, or direct messages (DMs).
- **Zero Telemetry**: No third-party analytics SDKs, ad trackers, or remote code execution.
- **Anonymous Community Sync**: Optional snapshot downloads (`credentials: 'omit'`) and one-way salted `SHA-256` reporter hashes for vote deduplication.
- Read the full bilingual [**Privacy Policy**](https://keepxclean.com/privacy/).

## Repository Structure & Development

```text
packages/shared/   Deterministic rule engine, X GraphQL parser, 24 cloud rules & i18n
apps/extension/    WXT (Manifest V3) browser extension, Shadow DOM UI & background jobs
apps/server/       Cloudflare Workers API, D1 vote aggregation & R2 snapshot cache
apps/web/          Official website & interactive browser sandbox (keepxclean.com)
tests/e2e/         5-tier end-to-end & adversarial verification suite
```

Requires **Node.js ≥ 20** and **pnpm**:

```bash
pnpm install
pnpm dev:ext      # Launch extension in development mode
pnpm typecheck    # Typecheck all workspace packages
pnpm test         # Run unit & integration tests (shared, extension, server, web)
pnpm test:e2e     # Run 5-tier E2E test suite
pnpm build        # Production build across workspace
```

For Cloudflare Workers / D1 self-hosting and CI/CD release configuration, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Author & License

- **Author**: X [@linheitu](https://x.com/linheitu) · [30s.to/@linmo](https://30s.to/@linmo)
- **License**: Released under the [MIT License](LICENSE). KeepXClean is an independent open-source project and is not affiliated with X Corp.
