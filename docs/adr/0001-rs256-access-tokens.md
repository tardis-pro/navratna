# ADR 0001 — RS256 access tokens with aud/scp + org claim

**Status:** Accepted (2026-07-16). Ratifies TARDIS assimilation decisions D6/D11.
**Context:** Convergence sprint, Wave 2.

## Decision

User access tokens are signed with **RS256** (asymmetric) by default, verified via
the JWKS published at `/.well-known/jwks.json`. The edge (Cloudflare Worker) and
any federated `*.tardis.digital` subdomain can verify a token without sharing a
secret. Tokens carry `aud` (`uaip-services`), `scp` (role-derived scopes), and
`orgId` (tenant) alongside the existing identity claims.

- Refresh tokens stay **HS256** — they never leave the gateway (verified
  server-side against `JWT_REFRESH_SECRET` + DB), so asymmetric verification adds
  nothing.
- A **dual-verify window** is built in: the backend uses `verifyAny` (alg
  dispatch with downgrade protection) and the edge verifies both RS256 and HS256,
  so tokens issued before the flip keep working until they expire.
- `AUTH_ACCESS_TOKEN_ALG=HS256` is a rollback escape hatch.

## Why

- The prior HS256 model forced every verifier to hold the signing secret — a
  non-starter for federating auth across subdomains.
- The jose-based RS256/JWKS layer already existed in `@uaip/middleware`
  (`jwks.ts`) and was already used by `/subdomain-token`; this just moves the
  primary user token onto it.

## Consequences

- Deploy-later: generate + set the prod `JWT_PRIVATE_KEY`, serve JWKS at the root
  domain, verify, then retire the HS256 dual-verify window.
- Coding-node M2M tokens remain RS256 under their **own** issuer/audience
  (`uaip-coding-gateway`/`uaip-coding-node`) and signing key — a separate trust
  domain, intentionally not merged with the user-token JWKS.
