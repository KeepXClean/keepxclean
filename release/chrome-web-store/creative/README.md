# Store artwork — shield + x (2026-11-16)

Each of the ten supported languages has five 1280 × 800 RGB PNG screenshots, plus optional 440 × 280 and 1400 × 560 promotional artwork. The store's global promotional slots use English. Language-specific screenshots show localized production components with labeled sample data.

1. Three filter presets and collapse/hide controls.
2. Public keyword rules, custom keywords and regex.
3. Collapse, inspect and restore posts in context.
4. Permanent-ID block and allow lists, with X blocklist import.
5. Language/theme preferences and optional X sync/community reporting.

`catalog.json` contains the exact artwork copy and localized fixture text. `descriptions/` contains the corresponding store descriptions, including accurate local-session and optional-report disclosures and an independent-project statement.

Run `pnpm --filter @keepxclean/extension preview:ui`, then open these pages in Ego:

- `http://127.0.0.1:5178/store-assets.html?lang=zh-CN&shot=1`
- `http://127.0.0.1:5178/promo-assets.html?lang=zh-CN&size=small`
- `http://127.0.0.1:5178/promo-assets.html?lang=zh-CN&size=large`

Use the matching viewport size and device scale factor 1, wait for `window.assetReady`, and capture through Ego. The 50 screenshots are stored under `../assets/locales/<lang>/`. Screenshot filenames are `01-rules.png`, `02-keywords.png`, `03-context.png`, `04-accounts.png`, and `05-preferences.png`. Legacy asset paths are refreshed copies for compatibility.

The brand master and deterministic white-matte removal/export script are in `design/ui-light-v1/icon-concepts/shield-x-v1/`. PNG icons preserve transparency outside the rounded mint tile; screenshots and promotional artwork are RGB without alpha.
