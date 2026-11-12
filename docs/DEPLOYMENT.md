# Maintainer Deployment & CI/CD Guide

This document covers self-hosting and automated production deployment for KeepXClean's Cloudflare Workers API (`apps/server`), official website (`apps/web`), and Chrome Web Store releases.

## GitHub Actions Automated Deployment

Defined in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml), triggered on pushes to `main` or `v*` version tags:

1. **Quality Gate (`verify`)**: Runs `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `wxt zip`, uploading the packaged extension `.zip` as a workflow artifact.
2. **API & D1 Deployment (`deploy-server`)**: When `apps/server/`, `packages/shared/`, or workspace lockfiles change, runs `pnpm db:migrate:remote` and `pnpm deploy:server`, then warms `snapshot.json`.
3. **Website Deployment (`deploy-web`)**: When `apps/web/` changes, runs `pnpm deploy:web` and verifies `https://keepxclean.com` and `https://keepxclean.com/privacy/`.
4. **Extension Release (`release-extension`)**: Pushing a `v*` tag (e.g. `git tag v0.1.0 && git push origin v0.1.0`) publishes a GitHub Release with the built `.zip` archive and optionally uploads/publishes to the Chrome Web Store (`plngcinmibjmkjjpfjemhfabjfjjkhhd`) if `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN` secrets are configured.

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
