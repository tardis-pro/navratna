# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed with `pnpm` workspaces. Core code lives in `apps/frontend` (React + Vite), `backend/services/*` (agent-intelligence, security-gateway, capability-registry, orchestration-pipeline, discussion-orchestration, artifact-service, marketplace), and shared libraries in `backend/shared` plus `packages/shared-types` and `packages/shared-utils`.
- `docs/` hosts architecture, setup, and testing references; `scripts/` holds operational helpers; `api-gateway/nginx.conf` defines HTTP routing; `docker-compose*.yml` files spin up databases/queues locally.
- Use `sample.env` as the template for any environment files; keep secrets out of version control.

## Build, Test, and Development Commands
- Install: `pnpm install` (workspace-aware).
- Local dev: `pnpm dev` (runs frontend + backend concurrently) or `pnpm dev:frontend` / `pnpm dev:backend` when focusing on one side.
- Build: `pnpm build` for all packages; `pnpm build:backend` / `pnpm build:frontend` for targeted builds.
- Lint: `pnpm lint` (workspace-wide) or `pnpm lint:fix` to auto-fix.
- Tests: `pnpm test` (workspace), `pnpm test:integration` for scripted integration flows, and `pnpm test:artifacts*` for artifact-service demos.
- Services sometimes rely on infra (`docker-compose up -d`); match ports defined in `docker-compose.yml`.

## Coding Style & Naming Conventions
- Primary language is TypeScript; prefer `ts/tsx` over JS. ESLint (`eslint.config.mjs`) enforces no unused vars (prefix `_` to ignore), `prefer-const`, and `no-var`.
- Use camelCase for functions/variables, PascalCase for React components/classes, and kebab-case for file/folder names.
- Keep functions small, favor dependency injection for services, and avoid silent catches—log with structured messages where relevant.
- Run `pnpm lint` before pushing; no Prettier is configured, so follow existing patterns.

## Testing Guidelines
- Jest with `ts-jest` powers unit/integration tests. Place tests under `__tests__` with `.test.ts` suffix; reuse shared setup files (e.g., `backend/shared/services/src/__tests__/setup.ts`).
- Coverage guidance is 80%+ (see `docs/technical/TESTING.md`); add focused cases for new logic and regression scenarios.
- Integration suites live in `backend/services/*/src/__tests__/integration`; prefer in-memory or dockerized deps over mocking when validating flows.
- Run relevant suites (`pnpm test`, `pnpm test:integration`, service-specific scripts in `backend/`) before submitting.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits (`feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`) with scoped segments from `commitlint.config.js` (e.g., `feat(frontend): add discussion timeline` or `fix(security-gateway): harden oauth flow`).
- For PRs: include a concise summary, link to the issue/task, list commands/tests run, and attach screenshots for UI-facing changes. Note any config or migration impacts.
- Keep changes logically scoped; prefer smaller PRs with clear acceptance criteria and rollback considerations.

## Security & Configuration Tips
- Do not commit secrets; load env vars from `.env` derived from `sample.env`. Rotate keys used in tests or fixtures.
- When touching nginx or compose files, document port changes and expected health endpoints. For auth-sensitive areas (security-gateway, API gateway), ensure MFA/OAuth flows remain covered by tests before merging.
