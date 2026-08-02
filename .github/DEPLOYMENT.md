# Deployment Runbook

Operator-ready setup for the CI/CD workflows. This tells you exactly what to
obtain and where each value goes. No real secrets live in this repo, and none
should.

The stack has five surfaces:

| Surface               | What it is                         | Where its config lives            |
| --------------------- | ---------------------------------- | --------------------------------- |
| Frontend              | React SPA on Cloudflare Pages      | Built by CI, baked at build time  |
| Fly core              | `navratna-core` on Fly.io          | Fly app secrets                   |
| Fly gateway           | `navratna-gateway` on Fly.io       | Fly app secrets                   |
| Cloudflare API Worker | `navratna-api-gateway` edge router | Wrangler secrets + committed vars |
| Sentry                | Error tracking for all three apps  | Sentry SaaS (not self-hosted)     |

Two rules before you start:

1. Secrets never go in the repo. GitHub secrets, Fly secrets, and Wrangler
   secrets are the only homes for sensitive values.
2. Some values must be **identical across surfaces**. See [Equality
   constraints](#equality-constraints) before you set `EDGE_AUTH_SECRET`, the
   JWT keys, or the coding-tier keys.

---

## A. GitHub Actions secrets

Set these at **Settings → Secrets and variables → Actions → Secrets** (repo
level). The production deploy job reads them from the `production` GitHub
Environment, so add them there too (or scope them to that environment).

| Secret                  | Purpose                                                           | How to obtain                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FLY_API_TOKEN`         | Lets CI run `flyctl deploy` to both Fly apps                      | Fly.io dashboard → Account → Settings → Personal Access Tokens, or run `fly auth token`. Needs deploy rights on the org.                                                                 |
| `CLOUDFLARE_API_TOKEN`  | Deploys the Pages frontend and the API Worker                     | Cloudflare dashboard → My Profile → API Tokens → Create Token. Grant Workers Scripts: Edit, Pages: Edit, Account Settings: Read (add R2 Storage: Edit if the Worker uses the R2 bucket). |
| `CLOUDFLARE_ACCOUNT_ID` | Identifies your Cloudflare account to wrangler                    | Cloudflare dashboard → Workers & Pages → Overview, or any domain's Overview sidebar.                                                                                                     |
| `SENTRY_AUTH_TOKEN`     | Uploads source maps and creates releases                          | sentry.io → Settings → Auth Tokens → Create Token. Scope: `project:releases`, `project:write`, `org:read`.                                                                               |
| `VITE_SENTRY_DSN`       | Frontend error reporting DSN, baked into the bundle at build time | sentry.io → your frontend project → Settings → Client Keys (DSN).                                                                                                                        |

Notes:

- `VITE_SENTRY_DSN` is public at runtime (it ships in the browser bundle), but
  store it as a GitHub secret so CI can inject it at build time without
  committing it.
- The `FLY_API_TOKEN` here is the **deploy** token CI uses to push releases. It
  is not the same as the Machines token the gateway uses at runtime to spawn
  coding VMs. See [section C](#c-fly-runtime-secrets-per-app).

---

## B. GitHub repository variables

Set these at **Settings → Secrets and variables → Actions → Variables**. These
are not secret. They are slugs and URLs that change per account.

| Variable                   | Required | Purpose                                    | How to obtain                                                                                                                                    |
| -------------------------- | -------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SENTRY_ORG`               | Yes      | Sentry organization slug                   | The slug in your Sentry URL: `sentry.io/organizations/<slug>/`.                                                                                  |
| `SENTRY_CORE_PROJECT`      | Yes      | Sentry project slug for `navratna-core`    | Project slug from the core project's Sentry URL.                                                                                                 |
| `SENTRY_GATEWAY_PROJECT`   | Yes      | Sentry project slug for `navratna-gateway` | Project slug from the gateway project's Sentry URL.                                                                                              |
| `SENTRY_FRONTEND_PROJECT`  | Yes      | Sentry project slug for the frontend       | Project slug from the frontend project's Sentry URL.                                                                                             |
| `CLOUDFLARE_PAGES_PROJECT` | Optional | Pages project name for the frontend        | Defaults to `navratna`. Set only if yours differs.                                                                                               |
| `VITE_API_BASE_URL`        | Optional | API origin baked into the frontend bundle  | Defaults to `https://api.navratna.tardis.digital`. The production build fails without a value, so CI supplies a default if you leave this unset. |

---

## C. Fly runtime secrets per app

Set with `fly secrets set`. These are read by the running services, never by CI.

Backend Sentry DSNs go here, as `SENTRY_DSN` on each app. They do **not** go in
GitHub. Only the frontend DSN lives in GitHub (section A), because it is baked
into the browser bundle at build time.

### Hard requirements (both apps)

Three of these throw at module load if missing: `JWT_SECRET`,
`JWT_REFRESH_SECRET`, and `DELETION_HASH_SALT`. `POSTGRES_URL` is operationally
mandatory (the app cannot serve real data without it) but is not one of those
throw expressions. `JWT_PRIVATE_KEY` falls back to an auto-generated dev keypair
when unset, but production must set a real one so the Worker can verify RS256
tokens via JWKS.

| Secret               | Notes                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_URL`       | PostgreSQL connection string. Operationally mandatory, the app cannot serve real data without it.                                                                                           |
| `JWT_SECRET`         | HS256 signing secret (legacy symmetric path). Must match the Worker's `JWT_SECRET`.                                                                                                         |
| `JWT_REFRESH_SECRET` | Refresh-token signing secret.                                                                                                                                                               |
| `DELETION_HASH_SALT` | GDPR erasure HMAC salt. Generate: `openssl rand -hex 32`.                                                                                                                                   |
| `JWT_PRIVATE_KEY`    | PKCS8 PEM, RS256 signing key. Generate: `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out key.pem`. Its public half is published at `/.well-known/jwks.json`.              |
| `EDGE_AUTH_SECRET`   | Shared secret proving a request came through the Worker. Must be identical on the Worker and both Fly apps. In production, if unset the backends fail closed and refuse forwarded identity. |
| `SENTRY_DSN`         | Backend Sentry DSN for this app.                                                                                                                                                            |

### Operational (both apps, non-fatal at boot)

These degrade gracefully. The app still starts without them, but the features
they power (cache/queue, graph, vector search) are unavailable until set.

| Secret                                                       | Powers                                     |
| ------------------------------------------------------------ | ------------------------------------------ |
| `REDIS_URL`                                                  | Cache, sessions, pub/sub, BullMQ event bus |
| `NEO4J_URL` (or `NEO4J_URI`), `NEO4J_USER`, `NEO4J_PASSWORD` | Knowledge graph, recommendations           |
| `QDRANT_URL`, `QDRANT_API_KEY`                               | Vector embeddings, semantic search         |

### Gateway coding tier (feature-gated)

These live on `navratna-gateway` only. If any one is missing, the coding tier
disables itself (its workspace and GitHub App routes are not mounted) and the
rest of the gateway serves normally. Set all of them, or none.

| Secret                            | Notes                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CODING_NODE_JWT_PRIVATE_KEY_PEM` | RS256/EdDSA PEM. Private half stays on the gateway.                                                                                                                             |
| `CODING_NODE_JWT_PUBLIC_KEY_PEM`  | Public half, handed to coding nodes.                                                                                                                                            |
| `GITHUB_APP_ID`                   | GitHub App that brokers repo-scoped tokens.                                                                                                                                     |
| `GITHUB_APP_PRIVATE_KEY_PEM`      | GitHub App private key.                                                                                                                                                         |
| `GITHUB_IAT_ENCRYPTION_KEY`       | 32-byte AES-256 key as 64 hex chars: `openssl rand -hex 32`.                                                                                                                    |
| `FLY_API_TOKEN`                   | **Machines API token** for provisioning coding microVMs. This is a different token from the GitHub `FLY_API_TOKEN` deploy token in section A, even though the name is the same. |
| `FLY_CODING_APP`                  | Fly app hosting the coding machines.                                                                                                                                            |
| `FLY_CODING_IMAGE`                | coding-node image ref.                                                                                                                                                          |
| `FLY_CODING_PRIMARY_REGION`       | e.g. `sin`.                                                                                                                                                                     |
| `FLY_CODING_FALLBACK_REGIONS`     | Optional, comma-separated.                                                                                                                                                      |

### Placeholder commands

Replace every `<...>` with a real value. Do not paste real values into a shell
history you intend to keep.

```bash
# navratna-core (hard requirements)
fly secrets set \
  POSTGRES_URL='<postgres-connection-string>' \
  JWT_SECRET='<hs256-secret>' \
  JWT_REFRESH_SECRET='<refresh-secret>' \
  DELETION_HASH_SALT='<openssl rand -hex 32>' \
  JWT_PRIVATE_KEY='<pkcs8-pem>' \
  EDGE_AUTH_SECRET='<shared-edge-secret>' \
  SENTRY_DSN='<core-backend-dsn>' \
  --app navratna-core

# navratna-core (operational, optional but recommended)
fly secrets set \
  REDIS_URL='<redis-url>' \
  NEO4J_URL='<neo4j-url>' \
  NEO4J_USER='<neo4j-user>' \
  NEO4J_PASSWORD='<neo4j-password>' \
  QDRANT_URL='<qdrant-url>' \
  QDRANT_API_KEY='<qdrant-key>' \
  --app navratna-core

# navratna-gateway (hard requirements)
fly secrets set \
  POSTGRES_URL='<postgres-connection-string>' \
  JWT_SECRET='<hs256-secret>' \
  JWT_REFRESH_SECRET='<refresh-secret>' \
  DELETION_HASH_SALT='<openssl rand -hex 32>' \
  JWT_PRIVATE_KEY='<pkcs8-pem>' \
  EDGE_AUTH_SECRET='<shared-edge-secret>' \
  SENTRY_DSN='<gateway-backend-dsn>' \
  --app navratna-gateway

# navratna-gateway (coding tier, feature-gated: set all or none)
fly secrets set \
  CODING_NODE_JWT_PRIVATE_KEY_PEM='<coding-private-pem>' \
  CODING_NODE_JWT_PUBLIC_KEY_PEM='<coding-public-pem>' \
  GITHUB_APP_ID='<github-app-id>' \
  GITHUB_APP_PRIVATE_KEY_PEM='<github-app-private-pem>' \
  GITHUB_IAT_ENCRYPTION_KEY='<openssl rand -hex 32>' \
  FLY_API_TOKEN='<machines-api-token>' \
  FLY_CODING_APP='<coding-fly-app>' \
  FLY_CODING_IMAGE='<coding-node-image>' \
  FLY_CODING_PRIMARY_REGION='sin' \
  FLY_CODING_FALLBACK_REGIONS='<optional-regions>' \
  --app navratna-gateway
```

---

## D. Cloudflare Worker secrets

Set on the `navratna-api-gateway` Worker, `production` environment. Run from
`deploy/cloudflare/`. Wrangler prompts for each value, so nothing lands in shell
history.

| Secret             | Purpose                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `JWT_SECRET`       | HS256 secret for legacy symmetric token verification. Must match the Fly apps' `JWT_SECRET`. |
| `EDGE_AUTH_SECRET` | Stamped onto forwarded requests as `X-Edge-Auth`. Must match both Fly apps.                  |

```bash
cd deploy/cloudflare
wrangler secret put JWT_SECRET --env production
wrangler secret put EDGE_AUTH_SECRET --env production
```

---

## E. Cloudflare plaintext vars (already committed)

These are not secrets. They live in `deploy/cloudflare/wrangler.toml` under
`[env.production.vars]` and ship with the Worker. You normally do not touch
them. Listed here so you know what the Worker sees.

| Var            | Value                                                            | Meaning              |
| -------------- | ---------------------------------------------------------------- | -------------------- |
| `ENVIRONMENT`  | `production`                                                     | Runtime mode         |
| `CORE_URL`     | `https://navratna-core.fly.dev`                                  | Fly core origin      |
| `GATEWAY_URL`  | `https://navratna-gateway.fly.dev`                               | Fly gateway origin   |
| `FRONTEND_URL` | `https://navratna.tardis.digital`                                | Frontend origin      |
| `CORS_ORIGINS` | `https://navratna.tardis.digital,https://navratna-23w.pages.dev` | Allowed CORS origins |

`JWKS_URL` is an optional plaintext var. Leave it unset and the Worker defaults
to `GATEWAY_URL/.well-known/jwks.json`.

---

## Equality constraints

Get these wrong and auth silently breaks. Verify before your first deploy.

1. **`EDGE_AUTH_SECRET`**: one value, three places. The Worker, `navratna-core`,
   and `navratna-gateway` must all hold the identical string. If the Worker sets
   it but a backend does not (or vice versa), forwarded identity is rejected.

2. **Worker JWT / JWKS compatibility**:
   - HS256 (legacy): the Worker's `JWT_SECRET` must equal the Fly apps'
     `JWT_SECRET`.
   - RS256 (default): the Worker verifies against the JWKS the gateway publishes
     at `/.well-known/jwks.json`. That JWKS is derived from the gateway's
     `JWT_PRIVATE_KEY`. So the gateway's private key and the Worker's JWKS source
     must agree. Rotate by updating `JWT_PRIVATE_KEY` on the gateway; the Worker
     re-fetches JWKS on a `kid` miss.

3. **Coding-tier keys**: `CODING_NODE_JWT_PRIVATE_KEY_PEM` stays on the gateway,
   `CODING_NODE_JWT_PUBLIC_KEY_PEM` goes to the coding nodes. They must be a
   matching keypair.

---

## Environments and branch protection

- Production deploys run in the **`production`** GitHub Environment. Scope
  production-only secrets there, or add them at repo level so the environment
  inherits them.
- CD starts from a successful **`CI`** workflow completion on **`main`** (plus
  manual `workflow_dispatch`). Make the `CI` check **required** on `main` under
  **Settings → Branches → Branch protection rules**, so untested code cannot
  reach the deploy trigger.

---

## Quick checklist

- [ ] GitHub secrets (section A): `FLY_API_TOKEN`, `CLOUDFLARE_API_TOKEN`,
      `CLOUDFLARE_ACCOUNT_ID`, `SENTRY_AUTH_TOKEN`, `VITE_SENTRY_DSN`
- [ ] GitHub variables (section B): `SENTRY_ORG`, `SENTRY_CORE_PROJECT`,
      `SENTRY_GATEWAY_PROJECT`, `SENTRY_FRONTEND_PROJECT` (+ optional two)
- [ ] Fly secrets on `navratna-core` (section C)
- [ ] Fly secrets on `navratna-gateway` (section C, + coding tier if used)
- [ ] Worker secrets (section D): `JWT_SECRET`, `EDGE_AUTH_SECRET`
- [ ] Equality constraints verified (section above)
- [ ] `production` environment + required `main` CI check configured
