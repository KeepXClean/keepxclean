# Changelog

All notable changes to KeepXClean are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-25

### Added
- **Grok Interaction Control (`rules.grokFilter`)**: Added a dedicated first-class rule protecting official `@grok` replies (`restId: 1720665183188922368`) from high-frequency false positives across all presets (`protectOfficialGrok: true`), an optional reply-only short `@grok` summon filter (`blockShortMentions`, default ON in `strict`, configurable max weighted length defaulting to `16`, exempting OP/followed/whitelist), and opt-in hiding of official Grok replies (`hideGrokReplies`).
- **Same-Thread Duplicate Reply Spam (`rules.replySpam.blockDuplicateReplies`)**: Added normalized exact-match deduplication (`weightedLength >= 12`, stripping `@mentions`, URLs, whitespace, and punctuation) in reply threads; keeps the first reply and intercepts 2nd+ identical copy-paste replies from other accounts while exempting OP, followed, and whitelisted accounts (default ON in `standard` and `strict`).
- **Structured External-Link Domain Filter (`rules.domainFilter`)**: Added a dedicated "Domains" tab in `#/keywords` supporting normalized root-domain matching (exact host + all subdomains) across tweet URLs, quoted URLs, and primary/RT/QT author bio URLs.
- **10-Language Public Keyword Packs (`langGroup`)**: Expanded built-in public keyword rules from 24 to **45 rules** organized into `universal` (8) plus 9 regional language packs (`zh`: 13; `en`, `ja`, `ko`, `es`, `pt`, `fr`, `de`, `ru`: 3 each), with whole-pack toggles, per-rule overrides, automatic activation of `['universal', 'en', currentUiLangGroup]`, and D1 migration `0004_cloud_keywords_lang_group.sql`.
- **For You / Following Detection & Per-Scene Presentation Modes (`sceneModes`)**: Extended `graphql-parser.ts` to distinguish `HomeTimeline` (`for_you`) vs. `HomeLatestTimeline` (`following`), and added per-scene overrides (`inherit`, `collapse`, `strip`, `bypass`) for `for_you`, `following`, `reply`, and `search`.
- **Collapse-Bar Deep-Link & One-Click Item Disable (`matchedTarget`)**: Expanded collapse bars now include "Adjust rule" (opens Options and highlights the matched rule/item) and one-click "Disable this item" (disables the matched custom keyword, cloud keyword, domain, or rule-pack entry and immediately restores the post).
- **First-Install Non-Intrusive Onboarding Card**: Added a dismissible 3-step quick-start card inside the Popup and X settings drawer for fresh installs only (zero auto-opened tabs; upgrades from `v0.1.2` automatically skip onboarding).
- **Offline Shareable Topic Rule Packs (`kxc-pack-v1`)**: Added pure-offline `.kxc-pack.json` file and clipboard import/export with strict schema/regex/domain/UID validation, isolated `installedPacks` management, preview modal, whole-pack toggle, and clean one-click uninstall (zero remote URL subscriptions).
- **Optional Cross-Device Sync (`chrome.storage.sync`)**: Added opt-in (default OFF) cross-device settings sync with zero new browser permissions, `<= 6 KB` UTF-8 chunking, 3-way first-enable conflict resolution (`local`, `remote`, `merge`), and strict device-local retention for large local blocklists, allowlists, logs, stats, and parse health diagnostics.
- **Per-Rule Analytics, 7-Day Trend & Local Battle Report PNG**: Added rolling 7-day `dailyHistory`, clickable per-rule breakdown bars cross-filtering `#/history`, and a pure-local Canvas 2D light-theme Battle Report PNG generator (zero PII, transparent `shield-x-v1` brand mark, `keepxclean.com` watermark) with Copy and Download actions.
- **Local X GraphQL Parse Health Self-Check & Maintainer Cloud Rules CLI**: Added pure-local degraded-state detection (5+ consecutive zero-tweet core GraphQL responses spanning `>= 15s`, auto-recovering with zero telemetry) plus redacted diagnostic summary copy, and introduced `apps/server/scripts/cloud-rules.ts` (`pnpm cloud-rules:push` / `pnpm cloud-rules:list`) syncing `apps/server/cloud-rules.json` via Wrangler D1 without exposing any public HTTP Admin API.
- **Official Website (`keepxclean.com`) & Repo Sync**: Upgraded `HeroSandbox` (official `@grok` protection, short `@grok` summons, duplicate reply defense, `For You`/`Following` scene switcher), 10-language `CloudKeywordsCard`, v0.2.0 Bento highlights, bilingual Privacy Policy (`chrome.storage.sync` + local parse health), 10 web locales, READMEs, Chrome Web Store descriptions, and atomic monorepo version alignment to `0.2.0`.

### Changed
- Aligned fresh-install privacy defaults: `syncNativeXBlock` and `enableCrowdReport` now default to `false`, requiring explicit opt-in while preserving stored `true` preferences when upgrading from `v0.1.2`.
- Maintained strictly zero new extension permissions (`['storage', 'alarms']` only on both Chrome MV3 and Firefox MV3).

## [0.1.2] - 2026-11-25

### Changed
- Adopted the user-selected transparent `shield-x-v1` brand identity (black titanium shield + symmetric rounded `x` on `#EAF6EF` mint rounded tile) across extension icons, website, promo video, and Chrome Web Store creative assets (10 locales × 5 screenshots + promo tiles); published live on the Chrome Web Store (`plngcinmibjmkjjpfjemhfabjfjjkhhd`).
- Added dark theme support and auto-adapting X inline controls.
- Hardened Cloudflare Worker API IP rate limits, snapshot caching, stats endpoint, and cron pruning.
- Restored promo video hardware playback and updated bilingual Privacy Policy and Chrome Web Store data-usage disclosures.
- Added workspace ESLint configuration, Firefox MV3 build verification, and real Chromium MV3 browser E2E smoke suite.

## [0.1.1] - 2026-11-12

### Changed
- Defaulted interception presentation to collapse mode.
- Refined 10-locale store listing copy and embedded the 30-second promo video on `keepxclean.com` and localized READMEs.

## [0.1.0] - 2026-11-11

### Added
- Initial open-source release of KeepXClean with `< 1ms` local-first GraphQL filter engine, 24 built-in public keyword rules, 10-language UI, interactive website sandbox, Cloudflare Workers community backend, and 5-tier E2E suite.
