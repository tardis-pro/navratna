# API Contract Gaps
**Date**: 2026-03-30  
**Source**: Automated gap analysis across all frontend API modules vs backend route handlers  
**Scope**: Frontend (`apps/frontend/src/api/`) ↔ Backend (`navratna-core` port 3001, `navratna-gateway` port 3002, via nginx port 8081)

---

## Summary

21 gaps identified across routing, data plumbing, performance, and correctness. This document covers the **API contract and data pipeline gaps only** — the subset directly actionable by the backend team or PM.

**P0 = blocks the product from functioning at all**  
**P1 = broken in production, workaround exists in dev**  
**P2 = incorrect behaviour, no crash**  
**P3 = lint/hygiene**

---

## P0 — Constellation Pipeline Completely Blocked

### GAP-01: Qdrant empty — no seed data, minClusterSize=20 returns zero constellations

**Symptom**: `GET /api/v1/knowledge/constellations` returns `{ constellations: [] }` on every fresh install.

**Root cause**:  
`apps/backend/services/agent-intelligence/src/knowledge-graph/knowledge_clustering_service.ts` line 48, 67:
```typescript
private readonly minClusterSize = 20;
// ...
if (allPoints.length < minClusterSize) {
  return { totalClusters: 0, ... clusters: [] };
}
```
Qdrant needs **≥20 vectors** before any constellation is returned. There is no seed data anywhere in `database/`. Postgres, Neo4j, and Qdrant are all empty on first run.

**What PM needs to arrange**:
1. A seed script (`database/seeds/knowledge_seed.ts`) that POSTs ≥20 knowledge items via `POST /api/v1/knowledge` at startup or via a `pnpm seed` command.
2. OR: lower `minClusterSize` to 3–5 for development and document the production threshold separately.

---

### GAP-02: Similarity threshold 0.85 — clustering functionally disabled on real content

**Symptom**: Even with ≥20 items in Qdrant, no clusters form because cosine similarity ≥0.85 requires near-identical content.

**Root cause**:  
`knowledge_clustering_service.ts` line 49:
```typescript
private readonly similarityThreshold = 0.85;
```
Real knowledge (documents on similar topics) scores 0.60–0.75. The threshold was set for deduplication, not semantic clustering.

**What PM needs to arrange**:
- Lower `similarityThreshold` to **0.65** for semantic grouping. Expose it as a config value (`KNOWLEDGE_CLUSTER_SIMILARITY_THRESHOLD` env var) so it can be tuned per deployment without code changes.

---

### GAP-03: Embedding dimension mismatch — Qdrant (1024-dim) vs TEI service (768-dim)

**Symptom**: All `upsert` calls to Qdrant fail silently if TEI is the active embedding service.

**Root cause**:  
- `apps/shared/infra/src/factory/qdrant_service.ts`: creates collections at **1024 dimensions**  
- `SmartEmbeddingService` priority order: TEI first, OpenAI fallback  
- TEI produces **768-dim** embeddings (documented in `AGENTS.md`)  
- Dimension mismatch → Qdrant rejects every vector write with an error that is caught and logged but not re-thrown

**What PM needs to arrange**:
- Decide on one canonical embedding dimension for the project: **768** (TEI native) or **1024** (OpenAI).  
- Update `qdrant_service.ts` to read dimension from `QDRANT_VECTOR_DIM` env var (default 768).  
- Update `sample.env` with `QDRANT_VECTOR_DIM=768`.  
- Ensure `SmartEmbeddingService` is configured to match.

---

### GAP-04: No TEI fallback — entire embedding pipeline crashes if TEI is unreachable

**Symptom**: Knowledge ingest fails completely when TEI container is down.

**Root cause**:  
`bootstrap_service.ts` line 57–59 configures `SmartEmbeddingService` with `preferTEI: true, fallbackToOpenAI: false`. If TEI is unreachable and fallback is disabled, every `generateEmbedding()` call throws.

**What PM needs to arrange**:
- Flip `fallbackToOpenAI: true` so the pipeline degrades gracefully to OpenAI when TEI is unavailable.  
- Add `OPENAI_API_KEY` to `sample.env` documentation as a required fallback credential.  
- OR: document TEI as a hard dependency and add a startup health check that blocks service boot if TEI is unreachable, with a clear error message.

---

### GAP-05: No automatic Qdrant sync on knowledge ingest — manual `/sync` required

**Symptom**: User uploads knowledge via `POST /api/v1/knowledge`, but Qdrant is not updated until someone calls `POST /api/v1/knowledge/sync`. Constellations never reflect newly ingested content.

**Root cause**:  
`KnowledgeGraphService.ingest()` writes to PostgreSQL only. The Qdrant sync step is a separate operation (`KnowledgeSyncService`) triggered manually via the `/sync` endpoint or at bootstrap.

**What PM needs to arrange**:
- `KnowledgeGraphService.ingest()` should call `KnowledgeSyncService.syncKnowledgeItem()` after each successful Postgres write (or queue it async via BullMQ).
- Alternatively: add a Postgres trigger / BullMQ job that auto-syncs on `INSERT` to `knowledge_items`.
- This is the single most impactful backend fix for making constellations reflect real data.

---

## P1 — Broken in Production

### GAP-06: `/api/v1/approvals` proxied to `navratna_gateway` — handler may not be registered there

**Symptom**: Browser console shows 500 on approvals poll. `UAIPContext` fails to load approvals on every 30s refresh.

**Root cause**:  
`nginx.conf line 275: proxy_pass http://navratna_gateway` routes `/api/v1/approvals` to `navratna-gateway` (port 3002).  
The actual handler `approval_elysia.ts` lives in `security-gateway` (port 3004, legacy v2 service).  
Whether `navratna-gateway` registers this handler as part of v3 consolidation is unconfirmed — no `approval` route import found in `navratna-gateway/src/`.

**What PM needs to arrange**:
- Confirm with backend lead: is `approval_elysia.ts` imported and registered in `navratna-gateway`?
- If not: either register it, or update `nginx.conf` to route `/api/v1/approvals` → `security-gateway` (matching the pattern of other legacy routes).
- This is likely the source of the 500 errors visible in the browser.

---

### GAP-07: `conversationEnhancement.api.ts` uses raw `fetch` — bypasses CSRF and auth error handling

**Symptom**: All conversation enhancement requests will 403 in production (no CSRF token). Auth failures are silent (no redirect to login).

**Root cause**:  
`apps/frontend/src/api/conversationEnhancement.api.ts` uses raw `fetch()` instead of `APIClient`. This means:
- `X-CSRF-Token` header is never attached → 403 on protected endpoints
- 401 responses do not fire `auth:unauthorized` → user stays on broken page
- Response envelopes `{success, data}` are not unwrapped → callers get raw response shape

**What PM needs to arrange**:
- Rewrite `conversationEnhancement.api.ts` to use `APIClient` from `./client`.
- Three consumers depend on this file; all will be fixed by the rewrite.

---

## P2 — Wrong Behaviour, No Crash

### GAP-08: `SecurityContext` returns 100% mock data — `securityAPI` never called

**Symptom**: `SecurityPortal`, `SecurityGateway`, and any component consuming `useSecurity()` display fabricated metrics (risk level, security score, blocked attempts, audit log).

**Root cause**:  
`apps/frontend/src/contexts/SecurityContext.tsx` initialises with hardcoded values and contains no calls to `securityAPI`. The real API client (`security.api.ts`) exists and is wired to working backend routes but is never invoked.

**What PM needs to arrange**:
- Wire `SecurityContext` to call `securityAPI.getStats()`, `securityAPI.getEvents()`, and `securityAPI.listPolicies()` on mount.
- This is a frontend task but requires PM to schedule it since it affects the security product surface.

---

### GAP-09: `OnboardingContext` hardcoded to always show onboarding

**Symptom**: Every authenticated user sees the onboarding flow on every page load, regardless of whether they have previously completed it.

**Root cause**:  
`apps/frontend/src/contexts/OnboardingContext.tsx` line 44–45:
```typescript
// For testing - always show onboarding for now
return true;
```
The real check (`userPersonaAPI.checkOnboardingStatus()`) is commented out at lines 47–59.

**What PM needs to arrange**:
- Uncomment the API check and remove the hardcoded `return true`.
- Requires `userPersonaAPI.checkOnboardingStatus()` backend endpoint to be live (it exists in `user-persona.api.ts` — verify backend is running).

---

### GAP-10: `UAIPContext` displays 6 hardcoded intelligence metrics as if live

**Symptom**: `IntelligencePanelPortal` shows `Decision Accuracy: 85%`, `Context Understanding: 90%`, etc. — these are constants, not real agent metrics.

**Root cause**:  
`apps/frontend/src/contexts/UAIPContext.tsx` lines 96–113:
```typescript
averageResponseTime: 250,    // Default value, would come from actual metrics
uptime: 0.95,                // Default value, would come from actual metrics
decisionAccuracy: 0.85,      // hardcoded
contextUnderstanding: 0.9,   // hardcoded
adaptationRate: 0.75,        // hardcoded
learningProgress: 0.6,       // hardcoded
```

**What PM needs to arrange**:
- Define the backend endpoint that serves per-agent intelligence metrics.
- OR: document these as placeholder values for v1 and remove them from the UI until real data is available.

---

## P3 — Lint / Hygiene

### GAP-11: `console.warn` / `console.error` violations (oxlint enforced, will fail CI)

**Files and lines**:

| File | Line | Call |
|---|---|---|
| `apps/frontend/src/api/knowledge_api.ts` | 65 | `console.warn('Invalid search response structure:', response)` |
| `apps/frontend/src/api/knowledge_api.ts` | 106 | `console.warn('Knowledge list response is not an array:', response)` |
| `apps/frontend/src/api/knowledge_api.ts` | 150 | `console.warn('Knowledge stats API error:', error)` |
| `apps/frontend/src/api/knowledge_api.ts` | 224 | `console.warn('Knowledge graph API error:', error)` |
| `apps/backend/.../knowledge_clustering_service.ts` | 145 | `console.error('Error finding similar chunks:', error)` |

`console.warn` and `console.error` are permitted by oxlint but `console.log`/`console.debug`/`console.info` are not. These are warnings, not errors — but should be replaced with the structured `logger` from `@uaip/utils` per project convention.

---

## Not a Gap (Confirmed Working)

| Item | Status |
|---|---|
| `/streaming` Socket.IO namespace | ✅ Registered in `streaming_handler.ts line 27` |
| Frontend constellation API shape | ✅ `use_constellations.ts` mapping matches `telescope.ts` type exactly |
| Vite proxy for `/api/v1/knowledge/constellations` | ✅ Fixed (routes to `navratna-core`) |
| nginx routing for `/api/v1/knowledge/constellations` | ✅ Fixed (separate location block before general `/api/v1/knowledge`) |
| Knowledge upload endpoint | ✅ `POST /api/v1/knowledge` wired in `knowledge_elysia.ts` |
| Knowledge search endpoint | ✅ `GET /api/v1/knowledge/search` wired |
| Discussions / WebSocket | ✅ `discussion-orchestration` fully wired |
| Auth / JWT flow | ✅ nginx `auth_request` + `security-gateway` JWT validation working |

---

## Recommended Fix Order for Backend Team

```
Week 1 (unblocks the surface):
  GAP-03  Fix embedding dimension — pick 768 or 1024, make it consistent
  GAP-04  Enable OpenAI fallback in SmartEmbeddingService
  GAP-05  Auto-sync Qdrant on knowledge ingest
  GAP-02  Lower similarityThreshold to 0.65
  GAP-01  Add seed script with ≥20 knowledge items

Week 2 (fixes broken UX):
  GAP-06  Confirm/fix approvals routing in navratna-gateway
  GAP-09  Uncomment onboarding API check

Week 3 (correctness):
  GAP-07  Rewrite conversationEnhancement.api.ts to use APIClient
  GAP-08  Wire SecurityContext to securityAPI
  GAP-10  Replace hardcoded UAIPContext metrics or remove from UI
  GAP-11  Replace console.warn/error with structured logger
```
