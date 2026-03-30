# API & Runtime Bugs
**Date**: 2026-03-30  
**Source**: Playwright end-to-end testing + static code analysis  
**Tested against**: navratna-core 3001 + navratna-gateway 3002 (Docker), nginx 8081

---

## P0 — Broken, blocks core user flows

---

### BUG-01: Socket.IO authentication fails — "Authentication required" on every connection

**Symptom**: Every Socket.IO connection immediately errors with `Authentication required`. Discussion portal shows "Disconnected". Streaming chat never connects. IntelligencePanelPortal crashes on open.

**Root cause**:  
nginx routes `/socket.io` to `navratna_gateway`. The gateway validates socket connections using the `auth_request` directive. The frontend connects with `withCredentials: true` (cookie-based) but the nginx socket.io proxy block is missing the `proxy_http_version 1.1` and `proxy_set_header Upgrade $http_upgrade` websocket upgrade headers. The connection falls back to polling, which then hits the auth middleware without a valid session cookie being forwarded.

**Evidence**:  
- `use_enhanced_web_socket.ts:95–107` — connects with `withCredentials: true`, no explicit auth token
- `use_streaming_chat.ts:36–37` — same pattern  
- Browser: `[Socket.IO] Connection error: Error: Authentication required`

**Files**:
- `src/hooks/use_enhanced_web_socket.ts:95`
- `src/hooks/use_streaming_chat.ts:36`
- `api-gateway/nginx.conf` — socket.io upstream block

**Fix**:  
Add to nginx socket.io location block:
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Cookie $http_cookie;
```

---

### BUG-02: Agent create always returns 400 "Failed to create agent" — missing `providerId`

**Symptom**: Creating an agent via AgentManagerPortal returns `{"success":false,"error":"Failed to create agent"}`. Confirmed via direct API test.

**Root cause**:  
The backend `POST /api/v1/agents` requires `providerId` (the LLM provider record ID, not the provider type string). The AgentManagerPortal form maps the selected model to `modelId` but never sends `providerId`. The backend `agentsAPI.create()` sends:
```json
{ "name": "Pro", "role": "analyst", "modelId": "claude-3-5-sonnet-20241022" }
```
But requires:
```json
{ "name": "Pro", "role": "analyst", "modelId": "...", "providerId": "<uuid-of-provider-record>" }
```

**Evidence**:  
- Direct API call with `{ name, role, modelId }` → 400
- `GET /api/v1/llm/my-providers/models` returns models with both `id` (modelId) and `providerId` (UUID)
- Backend error: `"Unsupported provider type: undefined"` when chat is attempted on created agent

**Files**:
- `src/components/futuristic/portals/AgentManagerPortal.tsx` — form submission (around line 1450)
- `src/api/agents_api.ts` — `create()` method

**Fix**:  
When user selects a model from the dropdown, also store the `providerId` from the model object. Include it in the create payload:
```typescript
const selectedModel = models.find(m => m.id === formData.modelId);
await agentsAPI.create({ ...formData, providerId: selectedModel?.providerId });
```

---

### BUG-03: nginx upstream stale — navratna-gateway returns 502 until nginx reload

**Symptom**: Even after `navratna-gateway` container starts healthy, all requests to `/api/v1/auth/*`, `/api/v1/agents`, `/api/v1/discussions` return 502. Requires `docker exec uaip-api-gateway nginx -s reload` to recover.

**Root cause**:  
nginx resolves DNS for upstream hosts at startup only. When `navratna-gateway` starts after nginx, the upstream is marked as permanently down. nginx has no `resolver` directive and no `valid=` TTL on the upstream.

**Files**:
- `api-gateway/nginx.conf:57–59`

**Fix**:  
Add a resolver and use variable-based upstream resolution, or add `keepalive` with health checks:
```nginx
resolver 127.0.0.11 valid=10s;  # Docker internal DNS

upstream navratna_gateway {
    server navratna-gateway:3002 max_fails=3 fail_timeout=10s;
}
```
Or for zero-downtime: use `resolver` with a variable proxy_pass so nginx re-resolves on each request.

---

### BUG-04: Agent chat response never renders — messages list empty despite API success

**Symptom**: User types message in ChatPortal, hits Enter, Cancel button appears (streaming triggered), API returns `{"success":true,"data":{"content":"..."}}`, but the chat message history area remains empty. No messages visible.

**Root cause**:  
`ChatPortal` uses `useStreamingChat` which connects via Socket.IO `/streaming` namespace. Since Socket.IO auth fails (BUG-01), the streaming connection never establishes. The fallback REST call via `agentsAPI.chat()` succeeds and returns a response, but the response is never surfaced to the UI because ChatPortal only renders messages from the streaming hook state, not the REST fallback response.

**Files**:
- `src/components/futuristic/portals/ChatPortal.tsx` — message rendering logic
- `src/hooks/use_streaming_chat.ts:36`

**Fix**: Fix BUG-01 (Socket.IO auth). Additionally, when the streaming socket is unavailable, fall back to rendering the REST response directly in the message list.

---

## P1 — Broken, workaround exists or degraded experience

---

### BUG-05: IntelligencePanelPortal crashes silently on open — blank portal

**Symptom**: Opening Intelligence portal from the launcher results in a blank white portal that auto-closes within 2 seconds. No visible error to user.

**Root cause**:  
`IntelligencePanelPortal.tsx` mounts and immediately calls `useUAIP()` which dispatches 4 concurrent API calls (agents, operations, capabilities, approvals). The `approvals` call hits `/api/v1/approvals` which returns 500 (backend error, confirmed). An unhandled rejection in one of these calls propagates to the React render cycle, throwing inside the component body which is not wrapped in an ErrorBoundary at the portal level.

**Files**:
- `src/components/futuristic/portals/IntelligencePanelPortal.tsx:1`
- `src/contexts/UAIPContext.tsx` — approvals fetch throws on 500

**Fix**:  
1. Wrap portal content in `<ErrorBoundary>` with a fallback (Portal already has one via `<Suspense>` but not for runtime errors)
2. In `UAIPContext`, catch approval fetch errors individually instead of letting them propagate

---

### BUG-06: AgentManagerPortal — Create Agent form resets on scroll

**Symptom**: Filling the Create Agent form and scrolling down to find the Submit button causes the Agent Name field to clear. User must re-fill form after scrolling.

**Root cause**:  
The `AgentManagerPortal` mounts the create form inside a scrollable container. The `AgentNameInput` component uses a local `useState` with no debounce/persistence, and the parent container has `key={activeView}` which re-mounts the entire form tree when the scroll triggers a layout recalculation that changes `activeView` state. This is a stale closure / key-based unmount bug.

**Files**:
- `src/components/futuristic/portals/AgentManagerPortal.tsx` — create form, `activeView` state management

**Fix**:  
Move form state to the parent (lift state up) so it survives the `activeView` key change, or remove the `key` prop from the create form container.

---

### BUG-07: `APIClient.setAuthToken()` and `getAuthToken()` are no-ops

**Symptom**: Any code calling `uaipAPI.client.setAuthToken(token)` or `uaipAPI.client.getAuthToken()` silently does nothing. Auth token is never stored in the client.

**Root cause**:  
```typescript
// src/api/client.ts:116
public setAuthToken(_token: string | null): void {}  // empty body

// src/api/client.ts:120-122
public getAuthToken(): string | null {
  return null;  // always null
}
```
These were placeholder stubs that were never implemented. The app works because auth is cookie-based, but any code relying on `getAuthToken()` for non-cookie paths (e.g., mobile, SSE, explicit Bearer flows) gets null.

**Files**:
- `src/api/client.ts:116–122`

**Fix**:  
Store token in memory (or localStorage if `rememberMe`):
```typescript
private _token: string | null = null;
public setAuthToken(token: string | null): void { this._token = token; }
public getAuthToken(): string | null { return this._token; }
```

---

### BUG-08: `conversationEnhancement.api.ts` uses raw `fetch` — no CSRF, no error handling

**Symptom**: All conversation enhancement API calls (analyze conversation, get enhanced contribution, create hybrid persona) will 403 in any environment with CSRF enforcement. Auth failures are silent — no redirect to login.

**Root cause**:  
`src/api/conversation_enhancement_api.ts` uses `fetch()` directly instead of `APIClient`. Confirmed in `api/AGENTS.md`: *"uses raw fetch, NOT APIClient — do not copy this pattern"*.

```typescript
// conversationEnhancement.api.ts
const response = await fetch(`/api/v1/...`, {  // no x-csrf-token header
  method: 'POST',
  credentials: 'include',
  ...
});
```

**Files**:
- `src/api/conversation_enhancement_api.ts` — entire file

**Fix**: Replace all `fetch()` calls with `APIClient.post/get()`. Three consumers affected.

---

### BUG-09: `OnboardingContext` hardcoded to always show onboarding

**Symptom**: Every authenticated user sees the onboarding flow on every page load, regardless of whether they've completed it.

**Root cause**:  
```typescript
// src/contexts/OnboardingContext.tsx:44-45
// For testing - always show onboarding for now
return true;
```
The real API check (`userPersonaAPI.checkOnboardingStatus()`) is commented out at lines 47–59.

**Files**:
- `src/contexts/OnboardingContext.tsx:44`

**Fix**: Uncomment the API check, remove the `return true` override.

---

### BUG-10: `SecurityContext` returns 100% mock data

**Symptom**: Security Portal, SecurityGateway portal, and audit log display fabricated risk scores, fake event counts, and hardcoded security metrics.

**Root cause**:  
`src/contexts/SecurityContext.tsx` initializes with hardcoded values and never calls `securityAPI`. All 3 consumers get fake data.

**Files**:
- `src/contexts/SecurityContext.tsx` — entire file

**Fix**: Wire `SecurityContext` to `securityAPI.getStats()`, `securityAPI.getEvents()`, `securityAPI.listPolicies()` on mount.

---

### BUG-11: `UAIPContext` hardcodes 6 intelligence metrics displayed as live

**Symptom**: IntelligencePanelPortal shows `Decision Accuracy: 85%`, `Uptime: 95%` etc. as live agent metrics. These are constants.

**Root cause**:  
```typescript
// src/contexts/UAIPContext.tsx:96-113
averageResponseTime: 250,    // "Default value, would come from actual metrics"
uptime: 0.95,                // "Default value, would come from actual metrics"
decisionAccuracy: 0.85,      // hardcoded
contextUnderstanding: 0.9,   // hardcoded
adaptationRate: 0.75,        // hardcoded
learningProgress: 0.6,       // hardcoded
```

**Files**:
- `src/contexts/UAIPContext.tsx:96–113`

**Fix**: Either fetch real metrics from `agentsAPI.getMetrics(id)` or remove these fields from the UI until a real endpoint exists.

---

## P2 — Incorrect behaviour, no crash

---

### BUG-12: Constellation endpoint returns empty — `minClusterSize=20` too high

**Symptom**: Surface always shows welcome placeholder cards instead of real knowledge constellations. Backend returns `{ constellations: [] }`.

**Root cause**:  
`knowledge_clustering_service.ts:48`: `minClusterSize = 20`. Requires 20+ near-identical vectors (similarity ≥ 0.85) to form one cluster. No real dataset will hit this threshold naturally.

**Files**:
- `apps/backend/services/agent-intelligence/src/knowledge-graph/knowledge_clustering_service.ts:25–48`

**Fix**: Lower `minClusterSize` to 3–5, `similarityThreshold` to 0.65.

---

### BUG-13: Qdrant collection dimension mismatch — embeddings fail silently

**Symptom**: Knowledge uploads succeed (written to Postgres) but never appear in vector search or clustering.

**Root cause**:  
Qdrant collection created at 1024 dimensions. TEI embedding service produces 768-dim vectors. Every `upsert` call silently fails with a dimension mismatch error that is caught and swallowed.

**Files**:
- `apps/shared/infra/src/factory/qdrant_service.ts` — collection creation
- `apps/backend/services/agent-intelligence/src/knowledge-graph/smart_embedding_service.ts` — TEI produces 768-dim

**Fix**: Set `QDRANT_VECTOR_DIM=768` env var and propagate it to collection creation config.

---

### BUG-14: Knowledge ingest does not auto-sync to Qdrant

**Symptom**: User uploads knowledge, it saves to Postgres, but constellations never reflect it because Qdrant isn't updated.

**Root cause**:  
`KnowledgeGraphService.ingest()` writes to Postgres only. Qdrant sync requires a separate `POST /api/v1/knowledge/sync` call (manual or triggered by bootstrap).

**Files**:
- `apps/shared/services/src/knowledge-graph/knowledge_graph_service.ts` — `ingest()` method

**Fix**: After Postgres write, dispatch a BullMQ job or inline call to `KnowledgeSyncService.syncKnowledgeItem()`.

---

### BUG-15: `parseUser()` in AuthContext loses `firstName`/`lastName` — API returns them separately

**Symptom**: User name displays as empty string in portals. Chat portal shows no user name.

**Root cause**:  
```typescript
// AuthContext.tsx:52-58
function parseUser(userData: { id?: string; email?: string; name?: string; role?: string }): User {
  return {
    firstName: userData.name?.split(' ')[0] || '',  // expects "name" field
    lastName: userData.name?.split(' ').slice(1).join(' ') || '',
  };
}
```
But `GET /api/v1/auth/me` returns `{ firstName: "System", lastName: "Administrator" }` — no `name` field. So `firstName` and `lastName` are always empty.

**Files**:
- `src/contexts/AuthContext.tsx:52–58`

**Fix**:
```typescript
function parseUser(userData: { id?: string; email?: string; name?: string; firstName?: string; lastName?: string; role?: string }): User {
  return {
    firstName: userData.firstName || userData.name?.split(' ')[0] || '',
    lastName: userData.lastName || userData.name?.split(' ').slice(1).join(' ') || '',
  };
}
```

---

### BUG-16: 3 registered portals render placeholder text only

**Symptom**: Opening Discussion Log, Discussion Controls, or General Settings from the portal launcher shows a single `<p>` tag: *"Discussion log portal - to be implemented"*.

**Root cause**:  
These are genuine stub files (14–16 lines each) that were created but never implemented.

| Portal | File | Lines |
|---|---|---|
| `discussion-log` | `DiscussionLogPortal.tsx` | 14 |
| `discussion-controls` | `DiscussionControlsPortal.tsx` | 16 |
| `general-settings` | `GeneralSettingsPortal.tsx` | 14 |

**Fix**: Implement or remove from registry until implemented.

---

### BUG-17: `use-toast.ts` duplicated — wrong file imported in some portals

**Symptom**: Toast notifications may not work in portals that import from `components/ui/use-toast.ts` instead of `hooks/use-toast.ts`.

**Root cause**:  
Two files exist:
- `src/hooks/use-toast.ts` — canonical, wired to `ToastProvider`
- `src/components/ui/use-toast.ts` — duplicate, may not be connected to the same provider

**Files**:
- `src/components/ui/use-toast.ts` — should be removed or re-exported from hooks

**Fix**: Delete `src/components/ui/use-toast.ts`, update any imports pointing to it to use `hooks/use-toast.ts`.

---

## P3 — Lint / Build hygiene

---

### BUG-18: `knowledge_api.ts` — 4 `console.warn` calls violate logging convention

```
src/api/knowledge_api.ts:65   console.warn('Invalid search response structure:', response)
src/api/knowledge_api.ts:106  console.warn('Knowledge list response is not an array:', response)
src/api/knowledge_api.ts:150  console.warn('Knowledge stats API error:', error)
src/api/knowledge_api.ts:224  console.warn('Knowledge graph API error:', error)
```

**Fix**: Replace with `logger.warn(...)` from `@uaip/utils`.

---

### BUG-19: `AuthContext.tsx:251` — `console.error` call

```
src/contexts/AuthContext.tsx:251  console.error('Auth status check failed:', error)
```

**Fix**: Replace with `logger.error(...)`.

---

### BUG-20: `APIClient.ts` — type errors in error handler (pre-existing, noImplicitAny violations)

**Lines**: 76, 96–99  
`Property 'error' does not exist on type '{}'` and related — `strictNullChecks` is off globally so these don't block the build but will if strict mode is ever enabled.

**Fix**: Add proper type guards or cast to `AxiosError`.

---

## Summary

| ID | Description | Severity | Component |
|---|---|---|---|
| BUG-01 | Socket.IO auth fails — nginx missing websocket headers | **P0** | nginx, sockets |
| BUG-02 | Agent create 400 — missing `providerId` in payload | **P0** | AgentManagerPortal |
| BUG-03 | nginx upstream stale — 502 until reload | **P0** | nginx |
| BUG-04 | Chat messages never render — socket down, no REST fallback | **P0** | ChatPortal |
| BUG-05 | IntelligencePanelPortal crashes silently — unhandled rejection | **P1** | IntelligencePortal |
| BUG-06 | Create Agent form resets on scroll | **P1** | AgentManagerPortal |
| BUG-07 | `setAuthToken` / `getAuthToken` are no-ops | **P1** | APIClient |
| BUG-08 | `conversationEnhancement.api.ts` raw fetch — no CSRF | **P1** | API layer |
| BUG-09 | OnboardingContext hardcoded always-show | **P1** | OnboardingContext |
| BUG-10 | SecurityContext 100% mock data | **P1** | SecurityContext |
| BUG-11 | 6 UAIPContext intelligence metrics hardcoded | **P1** | UAIPContext |
| BUG-12 | Constellation empty — minClusterSize=20 too high | **P2** | Backend clustering |
| BUG-13 | Qdrant dimension mismatch 1024 vs 768 | **P2** | Backend infra |
| BUG-14 | Knowledge ingest not auto-synced to Qdrant | **P2** | Backend service |
| BUG-15 | `parseUser()` loses firstName/lastName | **P2** | AuthContext |
| BUG-16 | 3 portals render placeholder text only | **P2** | Portals |
| BUG-17 | `use-toast.ts` duplicated | **P2** | Hooks |
| BUG-18 | 4x `console.warn` in knowledge_api.ts | **P3** | API |
| BUG-19 | `console.error` in AuthContext | **P3** | Auth |
| BUG-20 | APIClient type errors in error handler | **P3** | APIClient |
