# PM-211: Smoke Test Baseline — navratna-core & navratna-gateway

**Baseline Run**: 2026-04-18
**Environment**: Local dev stack (Docker infra + bun --hot services)
**Stack start**: `docker compose -f infrastructure/docker-compose.infrastructure.yml up -d`

## Run Instructions

```bash
# Start infra
docker compose -f infrastructure/docker-compose.infrastructure.yml up -d

# Start services (in separate terminals)
pnpm --filter @uaip/navratna-core dev       # port 3001
pnpm --filter @uaip/navratna-gateway dev    # port 3002

# Run smoke tests
pnpm test:smoke

# Or individually
pnpm test:smoke:core
pnpm test:smoke:gateway

# With auth token (for protected endpoints)
SMOKE_AUTH_TOKEN=<jwt> pnpm test:smoke
```

## navratna-core (port 3001) — Expected Baseline

| Route Group | Endpoint | Expected Status (no auth) |
|-------------|---------|--------------------------|
| health | GET /health | 200 |
| health/detailed | GET /health/detailed | 200 |
| agents list | GET /api/v1/agents | 401 |
| agents relevance | POST /api/v1/agents/relevance | 401 |
| agent chat | POST /api/v1/agents/:id/chat | 401 |
| agent capabilities | GET /api/v1/agents/:id/capabilities | 401 |
| agent memory | GET /api/v1/agents/:id/memory/semantic | 401 |
| cognitive portrait | GET /api/v1/users/:id/cognitive-portrait | 401 |
| personalization vector | GET /api/v1/users/:id/personalization-vector | 401 |
| constellations | POST /api/v1/knowledge/constellations | 401 |
| personas | GET /api/v1/personas | 401 |
| discussions | GET /api/v1/discussions | 401 |
| artifacts | GET /api/v1/artifacts | 401 |
| short links | GET /api/v1/links | 401 |
| llm providers | GET /api/v1/llm/providers | 401 |
| user llm models | GET /api/v1/user/llm/models | 401 |
| knowledge ingest | POST /api/v1/knowledge/ingest | 401 |

**Total**: 14 route groups | Expected PASS: 14 (auth 401 = accessible endpoint)

## navratna-gateway (port 3002) — Expected Baseline

| Route Group | Endpoint | Expected Status (no auth) |
|-------------|---------|--------------------------|
| health | GET /health | 200 |
| auth validate | GET /api/v1/auth/validate | 401 |
| auth login | POST /api/v1/auth/login | 400 (validation error) |
| auth register | POST /api/v1/auth/register | 400 |
| users list | GET /api/v1/users | 401 |
| approvals | GET /api/v1/approvals | 401 |
| audit logs | GET /api/v1/audit-logs | 401 |
| security policies | GET /api/v1/security-policies | 401 |
| security stats | GET /api/v1/security-stats | 401 |
| llm providers | GET /api/v1/llm-providers | 401 |
| oauth | GET /api/v1/oauth/:provider/auth | 401 |
| persona | GET /api/v1/users/persona | 401 |
| knowledge | GET /api/v1/knowledge | 401 |
| contacts | GET /api/v1/contacts | 401 |
| tool preferences | GET /api/v1/tool-preferences | 401 |
| dashboard | GET /api/v1/dashboard | 401 |
| projects | GET /api/v1/projects | 401 |
| tasks | GET /api/v1/tasks | 401 |
| workflows | GET /api/v1/workflows | 401 |
| capabilities | GET /api/v1/capabilities | 401 |
| mcp servers | GET /api/v1/mcp | 401 |
| tools | GET /api/v1/tools | 401 |
| workspace | GET /api/v1/workspace | 401 |
| federation | GET /api/v1/federation | 401 |

**Total**: 23 route groups | Expected PASS: 23

## Failure Investigation Guide

| Failure Type | Likely Cause | Action |
|-------------|-------------|--------|
| 000 (connection refused) | Service not running | `pnpm --filter @uaip/navratna-core dev` |
| 500 on /health | DB/Neo4j not connected | Check `docker compose ps` |
| 404 on route | Route not registered | Check `feature.ts` registration |
| 503 | Service partially initialized | Wait 5s and retry |

## Notes

- Smoke tests accept 2xx and 4xx as PASS (endpoint reachable and responding)
- 401 = route exists but requires auth — correct for protected endpoints
- 400 = route exists, body validation failed — correct for POST routes without body
- 404 = route missing — investigate feature registration
- Set `SMOKE_AUTH_TOKEN` env var to test with a valid JWT for full coverage
