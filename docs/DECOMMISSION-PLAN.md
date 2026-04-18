# Legacy Service Decommission Plan

**Version**: v3.0 Consolidation | **Updated**: 2026-04-18
**Related**: PM-212, `docs/audits/PM-200-route-parity-audit.md`

## Overview

navratna-core (port 3001) and navratna-gateway (port 3002) now cover ~97% of legacy service routes. Once the remaining gaps are closed and smoke tests pass against the v3 stack, the legacy services can be decommissioned.

## Services to Decommission

| Service | Port | Replacement | Parity | Blocker |
|---------|------|-------------|--------|---------|
| `agent-intelligence` | 3001 | navratna-core | ~99% | None — all routes extracted |
| `discussion-orchestration` | 3005 | navratna-core | ~90% | Debug + presence routes inline |
| `artifact-service` | 3006 | navratna-core | 100% | None |
| `llm-service` | 3007 | navratna-core | 100% | None |
| `security-gateway` | 3004 | navratna-gateway | 100% | None |
| `orchestration-pipeline` | 3002 | navratna-gateway | ~90% | `/api/v1/operations` inline; GH/Jira webhooks missing |
| `capability-registry` | 3003 | navratna-gateway | 100% | None |
| `marketplace-service` | 3008 | **Remove entirely** | N/A | Scheduled for removal, do not add features |

## Ports to Retire

After decommission:

| Port | Service | Action |
|------|---------|--------|
| 3001 | agent-intelligence (legacy) | **Keep** — now navratna-core's port |
| 3002 | orchestration-pipeline (legacy) | **Retire** — navratna-gateway uses 3002 |
| 3003 | capability-registry | Retire |
| 3004 | security-gateway | Retire |
| 3005 | discussion-orchestration | Retire |
| 3006 | artifact-service | Retire |
| 3007 | llm-service | Retire |
| 3008 | marketplace-service | Retire + delete service |

## Pre-Decommission Checklist

### Close Parity Gaps (blockers)

- [ ] Add `GET /api/v1/operations`, `POST /api/v1/operations/:id/pause|resume|cancel` to `orchestrationFeature.ts`
- [ ] Add `registerGitHubWebhookRoutes` and `registerJiraWebhookRoutes` to `orchestrationFeature.ts`
- [ ] Add `GET /api/v1/users/online`, `GET /api/v1/users/:id/status` to discussion feature routes
- [ ] Decide on fate of `GET /api/v1/whatsapp/status` (move to feature or drop)
- [ ] Remove `event_driven_discussion_service.ts` custom RPC (replaced by Elysia routes — PM-324)

### Infrastructure

- [ ] Update nginx `api-gateway/nginx.conf` to remove proxy_pass entries for legacy ports
- [ ] Update `docker-compose.yml` to remove legacy service definitions
- [ ] Update `infrastructure/docker-compose.infrastructure.yml` if it references legacy ports
- [ ] Remove per-service Dockerfiles for decommissioned services from `apps/backend/docker/`
- [ ] Remove legacy service entries from `pnpm-workspace.yaml` (if applicable)

### Verification

- [ ] Run `pnpm test:smoke:core` and `pnpm test:smoke:gateway` — all PASS
- [ ] Run integration test suite: `pnpm test:integration`
- [ ] Verify Socket.IO namespaces with `scripts/test-websocket-connection.js`
- [ ] Test frontend at `http://localhost:5173` against v3 backend only (no legacy)
- [ ] Verify nginx `auth_request` flows through navratna-gateway only

### Cleanup

- [ ] Delete `apps/backend/services/agent-intelligence/` (after routes confirmed in navratna-core)
- [ ] Delete `apps/backend/services/discussion-orchestration/` (after routes confirmed)
- [ ] Delete `apps/backend/services/artifact-service/` (after routes confirmed)
- [ ] Delete `apps/backend/services/llm-service/` (after routes confirmed)
- [ ] Delete `apps/backend/services/security-gateway/` (after routes confirmed)
- [ ] Delete `apps/backend/services/orchestration-pipeline/` (after routes confirmed)
- [ ] Delete `apps/backend/services/capability-registry/` (after routes confirmed)
- [ ] Delete `apps/backend/services/marketplace-service/` (unconditional)

## Decommission Order (safe sequence)

1. `marketplace-service` (3008) — no dependencies, scheduled for removal
2. `artifact-service` (3006) + `llm-service` (3007) — fully absorbed by navratna-core
3. `agent-intelligence` (3001 legacy) — once all inline routes extracted
4. `discussion-orchestration` (3005) — after presence/debug routes addressed
5. `security-gateway` (3004) — after navratna-gateway auth confirmed stable
6. `orchestration-pipeline` (3002) + `capability-registry` (3003) — after operations routes added

## Rollback Plan

Keep legacy services runnable (but not default-started) for 2 sprints after decommission announcement. Use `FEATURE_*=false` env vars in navratna-core/gateway to disable features if needed while legacy fallback is available.

## References

- Route parity audit: `docs/audits/PM-200-route-parity-audit.md`
- Smoke test baseline: `docs/audits/PM-211-smoke-test-baseline.md`
- FeatureFactory pattern: `apps/shared/services/src/feature_factory.ts`
