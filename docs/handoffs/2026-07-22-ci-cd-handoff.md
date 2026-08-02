# CI/CD and Environment Handoff — 2026-07-22

## USER REQUESTS (AS-IS)

- "lets write the github workflows, parallely, also tell me what i should get for the env variables? i need both frontend backend and gateway,"
- "BEFORE YOU DO THAT, MAKE SURE YOU GET ALL THE LATEST PACKAGES FOR THE WORKFLOW ACTIONS. DONT USE THE OLD ONES. HAVE A LIBRARY OR EXPLORE AGENT GET THAT INFORMATION TO YOU, I AM READY WITH SENTRY DSN / CONFIGS, WILL ADD FLY / CF TOKEN IN THE GITHUB TOKENS WHEN YOU CREATE THE PR."
- "what matrix bro? we are deploying to fix environments."

## GOAL

Finish and verify the fixed-production GitHub Actions pipeline, commit the deployment runbook, then open a PR after the backend lint/feature-completion work is green.

## WORK COMPLETED

- Work is on branch `ci/github-actions-delivery` in the nested application repo `navratna/.git` (`origin = tardis-pro/navratna`).
- Two commits already exist on the branch:
  - `792e64c4 feat: add ci / cd / observability`
  - `74957705 feat: add cd`
- `.github/workflows/ci.yml` was replaced with an Nx/pnpm CI workflow using current action releases resolved on 2026-07-22 and pinned to immutable commit SHAs.
- `.github/workflows/cd.yml` deploys four explicit fixed production surfaces. There is no deployment matrix abstraction:
  - `deploy-core` → `navratna-core` on Fly.io
  - `deploy-gateway` → `navratna-gateway` on Fly.io
  - `deploy-frontend` → Cloudflare Pages
  - `deploy-edge` → Cloudflare Worker
- Core and gateway jobs depend only on `prepare`, so they run in parallel for an `all` deployment.
- CD runs after successful `CI` completion on `main`, and supports manual `workflow_dispatch` targeting `all`, `core`, `gateway`, `frontend`, or `edge`.
- Fly deployments build SHA-tagged images, push to the Fly registry, deploy the exact image, check public `/health`, and create Sentry releases.
- Frontend deployment builds with production Vite variables, uploads Sentry source maps, strips map files from the public artifact, deploys Pages, and checks the custom domain.
- Edge deployment publishes the production Worker and checks the public API health surface.
- `.github/DEPLOYMENT.md` was generated as an operator runbook. It is currently untracked and must be reviewed, added, and committed.

## CURRENT STATE

- `HEAD`: `74957705` on `ci/github-actions-delivery`.
- `origin/main`: `9baf068f`.
- User reports the full Nx build now passes; remaining failures are backend lint failures.
- The workflow files were actionlint-checked before the latest commits and produced no diagnostics. Re-run actionlint on current `HEAD` before the PR.
- Current untracked paths include:
  - `.github/DEPLOYMENT.md` — intended deliverable; review and commit.
  - `_bmad-output/` — user-owned; do not stage.
  - `apps/frontend/.cortexkit/`, `apps/frontend/.debug-journal.md`, and `apps/frontend/src/api/eden.contract.test-d.ts` — user/frontend artifacts; do not stage or modify.
- Branch diff versus `origin/main` currently includes the two workflows, TypeScript project-reference/config changes, and frontend Vite/source-map configuration already committed before the backend-only scope correction.

## REQUIRED GITHUB ACTIONS SECRETS

Set at repository or `production` GitHub Environment scope:

| Secret                  | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `FLY_API_TOKEN`         | CI deploy token for both Fly apps          |
| `CLOUDFLARE_API_TOKEN`  | Pages and Worker deployment                |
| `CLOUDFLARE_ACCOUNT_ID` | Wrangler account selection                 |
| `SENTRY_AUTH_TOKEN`     | Sentry releases and source-map upload      |
| `VITE_SENTRY_DSN`       | Frontend Sentry DSN injected at build time |

## REQUIRED GITHUB ACTIONS VARIABLES

| Variable                   | Requirement                                                 |
| -------------------------- | ----------------------------------------------------------- |
| `SENTRY_ORG`               | Required Sentry organization slug                           |
| `SENTRY_CORE_PROJECT`      | Required core Sentry project slug                           |
| `SENTRY_GATEWAY_PROJECT`   | Required gateway Sentry project slug                        |
| `SENTRY_FRONTEND_PROJECT`  | Required frontend Sentry project slug                       |
| `CLOUDFLARE_PAGES_PROJECT` | Optional; defaults to `navratna`                            |
| `VITE_API_BASE_URL`        | Optional; defaults to `https://api.navratna.tardis.digital` |

## RUNTIME ENVIRONMENT REQUIREMENTS

The complete placeholder commands and acquisition instructions are in `.github/DEPLOYMENT.md`. Critical rules:

- Both Fly apps need `POSTGRES_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DELETION_HASH_SALT`, `JWT_PRIVATE_KEY`, `EDGE_AUTH_SECRET`, and their own `SENTRY_DSN`.
- Redis, Neo4j, and Qdrant variables are operationally recommended but non-fatal at boot.
- The gateway coding tier is all-or-nothing: set its complete coding-tier secret set or leave the feature disabled.
- The GitHub Actions `FLY_API_TOKEN` is a deploy token. The gateway runtime `FLY_API_TOKEN` is a separate Machines API token even though the variable name is the same.
- Worker `EDGE_AUTH_SECRET` must exactly match both Fly apps.
- Worker legacy `JWT_SECRET` must match both Fly apps; RS256 verification uses gateway JWKS derived from `JWT_PRIVATE_KEY`.
- The backend DSNs are Fly secrets named `SENTRY_DSN`; only the browser DSN is a GitHub secret named `VITE_SENTRY_DSN`.

## PENDING TASKS

1. Review `.github/DEPLOYMENT.md` against the current workflows and commit it separately as documentation.
2. Re-run actionlint against `.github/workflows/ci.yml` and `.github/workflows/cd.yml`.
3. Run YAML parsing and changed-file formatting checks.
4. Finish backend-only lint/feature completion described in the companion handoff.
5. Run backend lint, backend tests, full Nx build, and production Docker builds.
6. Inspect `git status`, `git diff`, and recent log; stage only intended files.
7. Push `ci/github-actions-delivery` and open a PR.
8. Add the GitHub secrets/variables above before merging or triggering production CD.

## KEY FILES

- `.github/workflows/ci.yml` — PR/push quality and build pipeline.
- `.github/workflows/cd.yml` — fixed production deployment jobs.
- `.github/DEPLOYMENT.md` — untracked operator env/secrets runbook.
- `deploy/fly/Dockerfile.core` — core production image.
- `deploy/fly/Dockerfile.gateway` — gateway production image.
- `deploy/fly/fly.core.toml` — core Fly configuration.
- `deploy/fly/fly.gateway.toml` — gateway Fly configuration.
- `deploy/cloudflare/wrangler.toml` — Worker production vars and routes.
- `apps/frontend/vite.config.ts` — committed hidden source-map configuration.

## EXPLICIT CONSTRAINTS

- "DONT USE THE OLD ONES."
- "what matrix bro? we are deploying to fix environments."
- "dont do the frontend changes, only work through the backend errors please."
- "dont remove. see where they were supposed to be used, and consume them. complete the incomplete feature."

## CONTEXT FOR CONTINUATION

- Do not replace the four explicit deployment jobs with a matrix.
- Do not touch frontend TypeScript while completing backend lint work. Existing committed frontend deployment/source-map config predates that correction.
- Do not stage `_bmad-output/` or the untracked frontend artifacts.
- Treat `.github/DEPLOYMENT.md` as the canonical env checklist once reviewed and committed.
