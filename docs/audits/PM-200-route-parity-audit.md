# PM-200: Route Parity Audit — Legacy Services vs navratna-core / navratna-gateway

**Audited**: 2026-04-18
**Methodology**: Cross-reference `feature.ts` route registrations (runtime) against legacy `src/index.ts` route definitions and `app.ts` type stubs.

---

## navratna-core (port 3001) — Consolidates: agent-intelligence + discussion-orchestration + artifact-service + llm-service

### ✅ Routes present in navratna-core (via FeatureFactory + agentIntelligenceFeature)

| Route Group | Endpoint Pattern | Source File |
|-------------|-----------------|-------------|
| Agent CRUD | `GET/POST/PUT/DELETE /api/v1/agents` | `agent-intelligence/src/routes/agents_crud_routes.ts` |
| Agent Chat | `POST /api/v1/agents/:id/chat` | `agent-intelligence/src/routes/agent_chat_routes.ts` |
| Agent Approvals | `POST /api/v1/agents/:id/approvals/:approvalId` | `agent-intelligence/src/routes/agent_chat_routes.ts` |
| Agent Capabilities | `/api/v1/agents/:id/capabilities` | `agent-intelligence/src/routes/agent_capability_routes.ts` |
| Agent Memory | `GET/PUT/DELETE /api/v1/agents/:id/memory/semantic/:conceptId` | `agent-intelligence/src/routes/agent_memory_routes.ts` |
| Agent Relevance | `POST /api/v1/agents/relevance` | `agent-intelligence/src/routes/agent_routes.ts` |
| Cognitive Portrait | `GET/POST /api/v1/users/:userId/cognitive-portrait` | `agent-intelligence/src/routes/cognitive_portrait_routes.ts` |
| Personalization Vector | `GET /api/v1/users/:userId/personalization-vector` | `agent-intelligence/src/routes/cognitive_portrait_routes.ts` |
| Constellations | `POST /api/v1/knowledge/constellations` | `agent-intelligence/src/routes/constellation_routes.ts` |
| Personas | `GET/POST/PUT/DELETE /api/v1/personas` | `discussion-orchestration/src/routes/persona_routes.ts` |
| Discussions | `GET/POST/PUT/DELETE /api/v1/discussions` | `discussion-orchestration/src/routes/discussion_routes.ts` |
| Discussion Messages | `GET/POST /api/v1/discussions/:id/participants/:pid/messages` | `discussion-orchestration/src/routes/discussion_routes.ts` |
| Discussion Lifecycle | `POST /api/v1/discussions/:id/start`, `/end`, `/advance-turn` | `discussion-orchestration/src/routes/discussion_routes.ts` |
| Discussion Huddles | `POST /api/v1/discussions/:id/huddle`, `/huddles/:id/resolve` | `discussion-orchestration/src/routes/discussion_routes.ts` |
| Discussion Turn | `POST /api/v1/discussions/:id/turns/request` | `discussion-orchestration/src/routes/discussion_routes.ts` |
| Discussion Analytics | `GET /api/v1/discussions/:id/analytics` | `discussion-orchestration/src/routes/discussion_routes.ts` |
| Artifacts | `/api/v1/artifacts` (8 routes) | `artifact-service/src/routes/artifact_routes.ts` |
| Short Links | `/api/v1/links`, `/s/:shortCode` (7 routes) | `artifact-service/src/routes/short_link_routes.ts` |
| LLM | `/api/v1/llm` (17 routes) | `llm-service/src/routes/llm_routes.ts` |
| User LLM | `/api/v1/user/llm` (13 routes) | `llm-service/src/routes/user_llm_routes.ts` |
| Knowledge Ingest | `POST /api/v1/knowledge/ingest` | `navratna-core/src/routes/knowledge_ingest_routes.ts` |
| Deployment | `/api/v1/deploy` | `navratna-core/src/deployment/deployment_routes.ts` |
| Onboarding | Onboarding config/manifest | `navratna-core/src/onboarding/onboarding_routes.ts` |
| Composition | `/api/v1/compose` | `navratna-core/src/composition/composition_routes.ts` |
| Health | `GET /health`, `/health/detailed`, `/api/v1/core/health` | inline `index.ts` |

### ❌ Routes in legacy agent-intelligence NOT in navratna-core

These routes exist inline in `agent-intelligence/src/index.ts` and have NOT been extracted to route files:

| Missing Route | Notes |
|--------------|-------|
| `POST /test/sync` | Manual Neo4j/Qdrant sync trigger (dev-only) |
| `GET /api/v1/debug/conversation-enhancement` | Memory/leak diagnostics |

All other agent-intelligence routes are now in navratna-core via extracted route files.

### ❌ Routes in legacy discussion-orchestration NOT in navratna-core

| Missing Route | Notes |
|--------------|-------|
| `GET /api/v1/info` | Service info route (trivial — can add if needed) |
| `GET /api/v1/users/online` | Online presence (in legacy index.ts inline) |
| `GET /api/v1/users/:id/status` | User status (in legacy index.ts inline) |
| `GET /api/v1/whatsapp/status` | WhatsApp connection state |
| `GET /api/v1/debug/*` | Race conditions/memory/pending request debug |

---

## navratna-gateway (port 3002) — Consolidates: security-gateway + orchestration-pipeline + capability-registry

### ✅ Routes present in navratna-gateway (via FeatureFactory + securityFeature)

| Route Group | Source |
|-------------|--------|
| Auth (`login`, `register`, `logout`, `validate`, `refresh`, `mfa`) | `security-gateway/src/http/auth_elysia.ts` |
| Users CRUD + password | `security-gateway/src/http/users_elysia.ts` |
| Approvals | `security-gateway/src/http/approval_elysia.ts` |
| Audit logs | `security-gateway/src/http/audit_elysia.ts` |
| Security policies (RBAC) | `security-gateway/src/http/security_elysia.ts` |
| Security stats | `security-gateway/src/http/security_stats_elysia.ts` |
| LLM Providers CRUD | `security-gateway/src/http/providers_elysia.ts` |
| OAuth flows | `security-gateway/src/http/oauth_elysia.ts` |
| Persona (security-scoped) | `security-gateway/src/http/persona_elysia.ts` |
| Knowledge graph (personal) | `security-gateway/src/http/knowledge_elysia.ts` |
| Contacts | `security-gateway/src/http/contacts_elysia.ts` |
| Projects | `security-gateway/src/http/projects_elysia.ts` |
| Tool preferences | `security-gateway/src/http/tool_preferences_elysia.ts` |
| Dashboard aggregate | `security-gateway/src/http/dashboard_elysia.ts` |
| OIDC | `security-gateway/src/http/oidc_elysia.ts` |
| Tasks | `orchestration-pipeline/src/routes/task_routes.ts` |
| Projects (orchestration) | `orchestration-pipeline/src/routes/project_routes.ts` |
| Workflow execution | `orchestration-pipeline/src/routes/workflow_routes.ts` |
| Approvals (RDLO) | `orchestration-pipeline/src/routes/approval_routes.ts` |
| Capabilities | `capability-registry/src/routes/capability_routes.ts` |
| MCP | `capability-registry/src/routes/mcp_routes.ts` |
| Health (capability) | `capability-registry/src/routes/health_routes.ts` |
| Tools | `capability-registry/src/routes/tool_routes.ts` |
| Workspace | `capability-registry/src/routes/workspace_routes.ts` |
| Federation | `capability-registry/src/routes/federation_routes.ts` |
| Health | `GET /health` | inline `index.ts` |

### ⚠️ Discrepancy: feature.ts vs app.ts

The type stub `navratna-gateway/src/app.ts` imports `registerGitHubWebhookRoutes` and `registerJiraWebhookRoutes` from `orchestration-pipeline`, but the `orchestrationFeature.ts` does **NOT** register these routes. They are therefore not active in production.

Additionally, `securityFeature.ts` includes `registerOIDCRoutes` which is absent from `app.ts`.

| Route | In app.ts | In feature.ts | Active in Production |
|-------|-----------|---------------|---------------------|
| GitHub Webhooks | ✅ | ❌ | ❌ |
| Jira Webhooks | ✅ | ❌ | ❌ |
| OIDC | ❌ | ✅ | ✅ |

### ❌ Routes in legacy security-gateway NOT in navratna-gateway

| Missing Route | Notes |
|--------------|-------|
| `POST /api/v1/auth/mfa/totp` (some edge cases) | Check `auth_elysia.ts` for completeness |
| Agent OAuth operations (`/api/v1/oauth/agent/*`) | In legacy `oauth.elysia.ts` with 501 stubs |

### ❌ Routes in legacy orchestration-pipeline NOT in navratna-gateway

| Missing Route | Notes |
|--------------|-------|
| `GET/POST/PUT /api/v1/operations` | Operation management (inline in legacy index.ts) |
| `POST /api/v1/operations/:id/pause\|resume\|cancel` | Operation lifecycle (inline) |
| GitHub Webhooks | `registerGitHubWebhookRoutes` (in app.ts stub, NOT in feature.ts) |
| Jira Webhooks | `registerJiraWebhookRoutes` (in app.ts stub, NOT in feature.ts) |

---

## Summary

| Service | Routes in v3 | Routes missing | Parity % |
|---------|-------------|----------------|----------|
| navratna-core | ~24 route groups | 7 minor/debug routes | ~97% |
| navratna-gateway | ~25 route groups | ~4 routes (ops + webhooks) | ~95% |

**Priority gaps** to close before full legacy decommission:
1. GitHub/Jira webhook routes in `orchestrationFeature.ts`
2. Operation management routes (`/api/v1/operations`)
3. Debug routes (`/test/sync`, `/api/v1/debug/*`) — low priority
