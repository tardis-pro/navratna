# scripts/ — Operational Scripts

Standalone operational scripts for the navratna monorepo. **Not NX targets** — invoke directly via `bash`, `node`, or `pnpm` alias (where defined in root `package.json`). 23 scripts grouped by concern.

## CATEGORIES

| Category | Scripts | Purpose |
| -------- | ------- | ------- |
| **Smoke tests** | `smoke-test-core.sh`, `smoke-test-gateway.sh` | v3 route coverage for navratna-core (14 groups) and navratna-gateway (23 groups). Run against a live local stack. Wired via `pnpm test:smoke`. |
| **Phase verification** | `verify-phase0.sh`, `verify-phase1.sh`, `verify-monitoring.sh`, `verify-ui-registry.mjs` | Post-change sanity checks for milestone phases and observability stack. |
| **Dev tooling** | `dev-start.sh`, `tmux-dev.sh`, `start-portal-system.sh`, `docker-debug-frontend.sh` | Local development orchestration (tmux panes, portal system bootstrap, frontend container debugging). |
| **Deployment** | `deploy-cloudflare.sh`, `deploy-tei.sh`, `setup-cloudflare-dns.sh`, `setup-wildcard-tls.sh`, `fix-deployment.sh`, `fix-monitoring.sh` | Cloudflare Worker/Pages deploy, TEI embedding service deploy, DNS/TLS setup, emergency fixes. |
| **Lint / registry** | `lint-filenames.mjs`, `check-registry-contrast.mjs` | File-naming enforcement and portal registry colour-contrast audit. `lint-filenames.mjs` wired via `pnpm lint:filenames`. |
| **Infra utilities** | `sync-knowledge-to-qdrant.mjs`, `test-websocket.js`, `run-integration-tests.sh`, `migrate-to-catalogs.js` | Data sync, manual WebSocket connection test, integration test orchestrator, pnpm catalog migration tool. |

## COMMANDS

```bash
# Smoke tests (require infra + services running)
pnpm test:smoke                     # both core + gateway
pnpm test:smoke:core
pnpm test:smoke:gateway

# Integration tests (requires infrastructure/docker-compose.test.yml up)
pnpm test:integration               # full suite
pnpm test:integration:setup         # just bring test infra up
pnpm test:integration:oauth         # OAuth tests only
pnpm test:integration:cleanup       # tear down test infra

# File naming
pnpm lint:filenames                 # node scripts/lint-filenames.mjs
```

## STALE / DEPRECATED SCRIPTS

- **`run-integration-tests.sh`** — references RabbitMQ port 5673 in the test compose file. RabbitMQ was removed (BullMQ on Redis is the event bus). Script still works for non-RabbitMQ paths but the compose reference is dead.
- **`fix-jest-mocks.js`** — references Jest. The codebase migrated to Vitest; this script is only useful for spelunking through legacy backups.
- **`migrate-to-catalogs.js`** — one-shot migration to pnpm catalog deps. Already applied. Kept for reference.

## CONVENTIONS

- Scripts use `#!/usr/bin/env bash` or `node`/`mjs`. Shebangs matter — `chmod +x` on all shell scripts.
- No shared helper lib — each script is self-contained. If a script grows complex, consider promoting it to an NX target under a specific package instead of living here.
- New operational scripts → add here, then (if worth aliasing) expose via `pnpm` script in root `package.json`.
- Never put Nx-replaceable logic here — build/test/lint/serve belong in NX targets on individual projects.
