# Maintainer Deployment & CI/CD Guide

This document covers self-hosting, maintainer cloud-rule hotfixes, and automated production deployment for KeepXClean's Cloudflare Workers API (`apps/server`), official website (`apps/web`), and Chrome Web Store releases.

## GitHub Actions Automated Deployment

Defined in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), triggered on pushes to `main` or `v*` version tags:

1. **Quality Gate (`verify`)**: Runs `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `wxt zip` (Chrome), `wxt build -b firefox --mv3` (Firefox), real Chromium MV3 extension smoke E2E (`pnpm test:browser`), and `pnpm --filter @keepxclean/web build`, uploading the packaged Chrome extension `.zip` as a workflow artifact.
2. **API & D1 Deployment (`deploy-server`)**: When `apps/server/`, `packages/shared/`, or workspace lockfiles change, runs `pnpm db:migrate:remote` (applying D1 migrations including `0004_cloud_keywords_lang_group.sql` for `cloud_keywords.lang_group`) and `pnpm deploy:server`, then warms `snapshot.json`.
3. **Website Deployment (`deploy-web`)**: When `apps/web/` changes, runs `pnpm deploy:web` and verifies `https://keepxclean.com` and `https://keepxclean.com/privacy/`.
4. **Extension Release (`release-extension`)**: Pushing a `v*` tag (e.g. `git tag v0.2.0 && git push origin v0.2.0`) publishes a GitHub Release with the built `.zip` archive and optionally uploads/publishes to the Chrome Web Store (`plngcinmibjmkjjpfjemhfabjfjjkhhd`) if `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN` secrets are configured.

### Required GitHub Secret

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with `Workers Scripts: Edit`, `D1: Edit`, and `Workers Routes: Edit` permissions on the `keepxclean.com` zone.

## Manual Commands

```bash
# Local D1 migration & local API server
pnpm db:migrate:local
pnpm dev:server

# Remote D1 migration & production deployment
CI=1 pnpm db:migrate:remote
pnpm deploy:server
pnpm deploy:web
```

## Maintainer Cloud Rules Hotfix CLI

KeepXClean manages public cloud keyword hotfixes via a local Wrangler-backed CLI (`apps/server/scripts/cloud-rules.ts`) without exposing any public HTTP Admin API.

- **Manifest file**: `apps/server/cloud-rules.json` (`{ "version": 1, "rules": [...] }`). Every push strictly validates the manifest (max 500 rules / 1 MB, unique rule `id`, valid JavaScript regular expressions, `scopes` subset of `text | bio | name | url`, and `langGroup` in the 10 `CLOUD_KEYWORD_LANG_GROUPS`).
- **Prerequisite**: Apply D1 migrations (including `0004_cloud_keywords_lang_group.sql`) via `pnpm db:migrate:local` or `pnpm db:migrate:remote` before pushing rules.

```bash
# Inspect rules in the local manifest file (default) or live D1 database
pnpm cloud-rules:list [--file <path> | --local [--persist-to <dir>] | --remote]

# Validate manifest and atomically sync cloud_keywords in D1 (defaults to --remote)
pnpm cloud-rules:push [--dry-run] [--local | --remote] [--file <path>] [--persist-to <dir>] [--no-refresh] [--api-url <url>]
```

### Flag Reference

- `--dry-run`: (`push` only) Validates the manifest and prints the generated SQL (`INSERT ... ON CONFLICT DO UPDATE` + `DELETE ... WHERE id NOT IN (...)`) without invoking Wrangler.
- `--local` / `--remote`: Target the local or remote `keepxclean-db` D1 database via `wrangler d1 execute` (mutually exclusive; `push` defaults to `--remote`, whereas `list` defaults to reading `--file` and forbids combining `--file` with `--local` or `--remote`).
- `--file <path>`: Override the manifest JSON path (default: `apps/server/cloud-rules.json`).
- `--persist-to <dir>`: Custom local Wrangler D1 persistence directory (requires `--local`).
- `--no-refresh`: (`push` only) Skip the automatic `GET <api-url>/v1/snapshot.json?fresh=1` rebuild after a `--remote` push. (Note: `?fresh=1` is rate-limited per IP to 12 requests/hour and gracefully falls back to the 10-minute cron rebuild if throttled.)
- `--api-url <url>`: Override the API base URL used for snapshot refresh (default: `https://api.keepxclean.com`; must be an `http://` or `https://` URL without embedded credentials, query string, or hash).
- `-h`, `--help`: Print the CLI usage reference.
