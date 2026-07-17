# ADR 0004 — Convergence sprint: what we built, deferred, and killed

**Status:** Accepted (2026-07-16). **Context:** consolidation of 8 accumulated
`.omo/plans` + `_bmad-output` planning docs into one ship-oriented cycle.

## Why

Eight plan documents (Mar–Jul 2026) pulled in three directions — a SOTA
"provenance wedge", an infra "execution mesh", and "ship & amplify" adoption. A
12-agent audit against the live code found several load-bearing assumptions were
wrong (the "80%-built adoption engine" was stubs; OIE couldn't boot from env
vars; the Google button was already shipped; "execution-layer isolation" did not
exist). This ADR records the resulting single scope.

## Built this session (branch `convergence-sprint`, code-only, no deploy)

- **Security floor:** MCP-install RCE contained (launcher allowlist + execFile,
  no shell); EDGE_AUTH fail-closed in prod; gateway boot regression fixed;
  feature-factory route-mount isolation.
- **Ship-visible:** public artifact share loop (backend + `/shared/:code` page +
  Share button); Gmail scopes; GitHub webhook receiver (raw-body HMAC).
- **Identity:** RS256 access tokens + aud/scp + org propagation (ADR 0001).
- **Tenancy:** provisioning API + `runInTenantTransaction` + RLS coverage for all
  9 tables + cutover runbook (ADR 0002).
- **OIE:** stub tier gated off + fan-out fix (ADR 0003).
- **Coding tier:** chat contract repaired (`/prompt`).

## Deferred (specified, not built)

- Coding tier: lifecycle orchestration (reaper/idle-suspend/keepalive), Redis
  boot reconciliation, crash-recovery proof, receipts UI, GitHub-PR backend API
  (PRPanel currently calls nonexistent endpoints), real-Fly e2e.
- Agent Autopsy telemetry API + Telescope portal; OIE tsconfig conformance.
- RLS request-transaction adoption + prod cutover (runbook §2–§6).
- HS256→RS256 cutover completion; prod key/JWKS/secret provisioning.

## Killed (do not resurrect silently)

- Gap F "Lineage Control Plane" / provenance wedge — thesis to validate with the
  4 users, not build.
- OAuth login breadth (Jira/Confluence/Slack/Notion).
- Assimilation fleet-federation Waves 1–5; registry-driven multi-tenant OIE.
- sprint-plan Epics: Neo4j→AGE / Qdrant→pgvector consolidation (conflicts with
  shipped isolation code), Hetzner/Coolify (conflicts with Fly/CF), Stripe
  billing, SaaS self-serve signup/GTM.
- Self-building loop / Red Team agent narrative; SST IaC; multi-cloud deploy
  adapters.
