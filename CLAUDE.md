# CLAUDE.md

Guidance for Claude Code in this repository. **Primary reference is `AGENTS.md`** — read that first for full architecture, service map, commands, and conventions.

## Quick Reference

**Stack**: TypeScript + Bun + Elysia (backend), React 19 + Vite + Tailwind 4 (frontend)
**Build**: NX + pnpm workspaces — `pnpm build`, `pnpm dev`, `pnpm lint` (oxlint), `pnpm format` (oxfmt)
**Active services**: `navratna-core` (port 3001) + `navratna-gateway` (port 3002) — v3.0 consolidation target
**Access**: Frontend http://localhost:5173 | API http://localhost:8081 | Credentials: admin/admin

## Puppeteer / Browser Testing

Use Puppeteer on port **5173** always (Vite dev server, hot-reload). The app is served at `http://localhost:5173`.

## Non-Obvious Facts

- **ORM is Drizzle** (not TypeORM). `src/entities/` files are legacy shims — do NOT add TypeORM decorators there. All schema changes → `apps/shared/services/src/database/drizzle/schemas/`
- **Two-plane schema**: `intelligence.schema.ts` (agents/discussions/knowledge — navratna-core) + `control.schema.ts` (users/auth/tools/ops — navratna-gateway). Cross-plane FKs: use `CrossPlaneGuard.verify()`, no DB-level FK constraints.
- **Event bus is BullMQ on Redis only** — RabbitMQ has been removed. `run-integration-tests.sh` script is stale (still references rabbitmq port 5673 — ignore).
- **CI workflows are stale** — `ci.yml` and `pr-checks.yml` reference old `backend/` path (pre-NX). Tests do not currently run in CI. Use `nx run-many -t test` locally.
- **No migration files exist** — schema applied via `drizzle-kit push`. Run `pnpm --filter @uaip/shared-services drizzle:generate` to produce migrations.
- **`navratna-core` and `navratna-gateway` have zero tests** — no `vitest.config.ts` exists for them yet.
- **`@ts-expect-error` in Elysia routes** is intentional — middleware injects `user` context that TS can't infer through nested Elysia groups; always add a reason comment.
- **`marketplace-service`** scheduled for removal — avoid adding features to it.
- **ALWAYS search before implementing** — never duplicate shared interfaces or utilities.

## Development Notes

- NX monorepo + pnpm workspaces — think globally, extend configs, no local-only things unless explicitly needed
- EC2 instance with Docker Compose hot-reload — changes apply immediately without restart
- **ALWAYS search for relevant code first** — never duplicate shared interfaces or utilities

## Commands

See `AGENTS.md` for full command reference. Key shortcuts:

```bash
pnpm dev                          # full stack
nx run @uaip/navratna-core:dev    # single service
pnpm build:shared                 # build shared packages first
pnpm test                         # all tests via NX
pnpm lint && pnpm format          # oxlint + oxfmt
docker-compose up -d              # infra (postgres, neo4j, redis, qdrant)
```