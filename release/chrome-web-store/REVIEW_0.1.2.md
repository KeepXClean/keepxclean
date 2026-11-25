# Chrome Web Store 0.1.2 review preparation

Date: 2026-11-16 (Asia/Shanghai)

- Extension: `plngcinmibjmkjjpfjemhfabjfjjkhhd` (KeepXClean).
- Rejected draft: 0.1.1; the existing public 0.1.0 listing remained live.
- Dashboard finding: Red Nickel / impersonation; `Icon → icon match to X icon` (violation dated 2026-11-12).
- Replacement: user-selected original black titanium shield with a symmetric rounded x, on a mint rounded tile. The original official X silhouette and obsolete mask are removed from production assets. White exterior matte is removed in the transparent master.
- Extension, website, website video, favicon and store icon share the selected artwork.
- Ten localized screenshot sets, five images each. Global fallback also has five English screenshots. Global small and marquee promotional tiles are replaced.
- Ten descriptions explain the actual features and independent-project status. Cookie/session disclosures match the existing account lookup, blocklist import and optional native X sync implementation. No new authentication or reporting behavior was added.
- Dashboard privacy disclosures include personally identifiable information, authentication information, location (request IP rate limits), user activity, and website content, including local-only processing as required by the Chrome Web Store FAQ. The bilingual public policy and reviewer testing instructions were updated accordingly.

## Package and validation

- Package: `apps/extension/.output/keepxcleanextension-0.1.2-chrome.zip`
- SHA-256: `5ced048da7117c36002cee1bffc125ce435c85b0d1e8413ab424ce6bdcdee404`
- Typecheck: passed.
- Unit/integration: 348 passed (shared 18, extension 45, server 6, web 279).
- Repository scenario suite: 423 passed (JSDOM/in-memory runner, not real-browser E2E).
- Ego visual QA: real extension components with sample data, all ten language layouts; transparent icon on light/dark backgrounds; video reveal and 30-frame contact sheet.
- Artifact check: nine icon sizes match between packaged extension and website; alpha is preserved, including antialiased coverage at tiny sizes. All 70 localized screenshot/promo files have the specified dimensions and RGB encoding.
- Website deployment: Cloudflare version `4cdd66bd-b899-4f36-9d00-5b457d7da126` (final bilingual policy update after the asset deployment); live logo, icon, MP4, WebM and poster SHA-256 hashes match local assets. Live homepage logos and bilingual policy were checked in Ego. The final privacy-content test passed (4 tests).

## Submission status

- Submitted 0.1.2 on 2026-11-16 with automatic publication enabled after approval.
- All ten localized screenshot sets and descriptions were reloaded and verified before submission: `creative/dashboard-verification.json`. The global fallback contains five English screenshots; both global promo tiles and the transparent store icon were replaced.
- The temporary “无法访问隐私权政策链接” validation message cleared after the privacy draft was saved and the new package was uploaded. The original policy URL remained unchanged and returned HTTP 200; no validator bypass or alternate URL was used.
- Submission dashboard snapshot: `creative/submission-verification.json`.
- **Published status (2026-11-24)**: Approved and publicly live on Chrome Web Store (`plngcinmibjmkjjpfjemhfabjfjjkhhd`). Monorepo package versions (`shared`, `server`, `extension`, `web`) and website/README brand assets synchronized to `0.1.2`.
