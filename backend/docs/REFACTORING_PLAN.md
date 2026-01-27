# Navratna Backend Refactoring Plan

> Status: P0 ✅ | P1 ✅ | P2 ✅ | P3 🔄 (EventBus + RedisCache done) | P4 ✅ | P5 🔄 (danger tools + approval checks done)

## Executive Summary

This document outlines a phased refactoring plan to achieve hard service boundaries, eliminate god-packages, and establish canonical orchestration contracts for the Navratna backend.

---

## Completed: P0 - Tool Execution Event Publishing ✅

**Commit**: `5a49125`

### Changes

- `tool-execution.service.ts` now publishes `tool.execute.request` events
- Added idempotency key generation for duplicate prevention
- Added correlation IDs for request-response tracking
- `ToolExecutionCoordinator` handles new event format

### Event Flow

```
Agent → ToolExecutionService → [tool.execute.request] → capability-registry → tool.response.{requestId}
```

---

## P1: Unify Step Types (3-7 days) - ✅ COMPLETE

### Changes Made

1. **Removed duplicate from `schemas.ts`**
   - File: `backend/services/orchestration-pipeline/src/types/schemas.ts`
   - Removed local `executionStepSchema` definition
   - Added import: `import type { ExecutionStep } from '@uaip/types'`

2. **Verified `stepExecutorService.ts` uses canonical types**
   - Already imports `ExecutionStep` from `@uaip/types`
   - Uses canonical step types: `tool`, `artifact`, `approval`, `delay`, `condition`, `parallel`

3. **Updated `StepExecutionManager.ts` for approval step**
   - Added `executeApproval()` handler for `approval` step type
   - Made `executeApprovalStep()` public in `stepExecutorService`

---

## P2: Canonical Event Envelope (2 days) - ✅ COMPLETE

### Changes Made

1. **Created `UAIPEvent<T>` interface**
   - File: `packages/shared-types/src/events.ts`
   - Added `ActorSchema`, `TenantSchema`, `UAIPEventSchema`
   - Added `createUAIPEvent()` helper function

2. **Updated `EventBusService.publish()`**
   - File: `backend/shared/services/src/eventBusService.ts`
   - Added `context` parameter for actor/tenant
   - Wraps messages in UAIPEvent format when security context provided
   - Backwards compatible with legacy EventMessage format

3. **Added token validation in subscribe**
   - Validates internal JWT tokens from message headers
   - Rejects messages with invalid tokens

4. **Created centralized EventBus types**
   - File: `packages/shared-types/src/event-bus.ts`
   - `EventBusMessage`, `EventBusHandler`, `EventBusSubscriptionOptions`, `EventBusConfig`, `EventBusPublishContext`

5. **Exported new types**
   - File: `packages/shared-types/src/index.ts`
   - Updated to export all new event-bus types

---

## P3: Split Shared Services - 🔄 PARTIAL COMPLETE

### Changes Made

1. **Created `@uaip/contracts` package**
   - Location: `packages/contracts/`
   - `src/tool.ts` - Tool execution & capability contracts
   - `src/orchestration.ts` - Pipeline & workflow contracts
   - `src/events.ts` - Event contracts for service communication

2. **Created `@uaip/infra` package structure**
   - Location: `backend/shared/infra/`
   - `package.json` with exports for eventBus, database, cache
   - EventBusService implementation moved here (from shared/services)

3. **Moved EventBusService to @uaip/infra** ✅ NEW
   - File: `backend/shared/infra/src/eventBus.ts`
   - Complete RabbitMQ event bus implementation
   - Lazy connection, reconnect logic, publish/subscribe, RPC-style requests
   - Token validation in subscribe for internal service authentication

4. **Updated @uaip/infra exports**
   - File: `backend/shared/infra/src/index.ts`
   - Now exports EventBusService from local implementation
   - Placeholders for DatabaseService and RedisCacheService (still in shared/services)

5. **Moved RedisCacheService to @uaip/infra** ✅ NEW
   - File: `backend/shared/infra/src/cache/redisCacheService.ts`
   - Complete Redis cache implementation with connection pooling, health checks
   - File: `backend/shared/infra/src/cache/index.ts` - exports the service
   - File: `backend/shared/infra/src/index.ts` - re-exports from @uaip/infra
   - Updated `shared/services/src/index.ts` to re-export from @uaip/infra

6. **Added centralized types**
   - `packages/shared-types/src/event-bus.ts` - EventBus types
   - `packages/shared-types/src/service-auth.ts` - Service credential types

7. **Updated shared/services exports**
   - Added `@uaip/infra` dependency
   - Re-exports EventBus from @uaip/infra

### What Remains ❌

| Item                  | Effort     | Description                                                             |
| --------------------- | ---------- | ----------------------------------------------------------------------- |
| Move DatabaseService  | Large      | `databaseService.ts` still in shared/services                           |
| Delete ServiceFactory | Large      | 513-line factory still pulls in all domain services                     |
| Move domain logic     | Very Large | `knowledge-graph/`, `agent-memory/` need to move to respective services |
| Update all imports    | Very Large | Services still import from `@uaip/shared-services`                      |

### Files Created

```
packages/contracts/
├── package.json
└── src/
    ├── index.ts
    ├── tool.ts
    ├── orchestration.ts
    └── events.ts

backend/shared/infra/
├── package.json
└── src/
    ├── index.ts
    ├── eventBus.ts
    ├── database/index.ts
    └── cache/index.ts

packages/shared-types/src/
├── event-bus.ts
└── service-auth.ts
```

---

## P4: Internal Service Auth (3 days) - ✅ COMPLETE

### Changes Made

1. **Added internal token endpoint**
   - File: `backend/services/security-gateway/src/http/auth.elysia.ts`
   - Route: `POST /api/v1/auth/internal-token`
   - Schema: `{ serviceName: string, apiKey: string }`
   - Returns: `{ token: string, expiresAt: string }`

2. **Created service auth types**
   - File: `packages/shared-types/src/service-auth.ts`
   - `ServiceCredential`, `InternalTokenPayload`, `InternalTokenRequest/Response`

3. **Updated EventBusService for token validation**
   - File: `backend/shared/services/src/eventBusService.ts`
   - Added `PublishContext` parameter with `actor` and `tenant`
   - Validates internal JWT tokens in message headers during subscribe

4. **Leveraged existing apiKeyAuth**
   - Uses `@uaip/middleware` apiKeyAuth for credential validation

### Security Flow

```
1. Service calls POST /api/v1/auth/internal-token with API key
2. Returns JWT with type: "internal" and service permissions
3. EventBus publish includes token in message headers
4. EventBus subscribe validates token before processing
```

---

## P5: Security Tightening - 🔄 PARTIAL COMPLETE

### Changes Made

1. **Wired approval step type to orchestration**
   - File: `backend/services/orchestration-pipeline/src/engine/StepExecutionManager.ts`
   - Added `case 'approval':` in step type switch
   - Implemented `executeApproval()` handler

2. **Made approval step executor public**
   - File: `backend/shared/services/src/stepExecutorService.ts`
   - Changed `executeApprovalStep()` from private to public

3. **Added audit logging for tool executions**
   - File: `backend/shared/services/src/stepExecutorService.ts`
   - Publishes `tool.executed` event after each tool execution
   - Includes tool ID, name, execution time, parameters, success status

4. **Defined "danger tool" list** ✅ NEW
   - File: `backend/services/capability-registry/src/services/dangerToolList.ts`
   - Defines high-risk tools requiring approval (file.write, process.run, database.delete, etc.)
   - Categories: FILE_SYSTEM, NETWORK, PROCESS_EXECUTION, DATABASE_WRITE, DATABASE_DELETE, SYSTEM_CONFIG, EXTERNAL_API, AUTH_SECURITY, DATA_EXPORT, CODE_EXECUTION
   - Risk levels: LOW, MEDIUM, HIGH, CRITICAL
   - Approval levels: NONE, USER_CONSENT, MANAGER, ADMIN, SECURITY_TEAM

5. **Added approval check in ToolExecutionCoordinator** ✅ NEW
   - File: `backend/services/capability-registry/src/services/tool-execution-coordinator.service.ts`
   - Added `checkAndEnforceApproval()` method for P5 security
   - Checks danger tool list before execution
   - Emits `tool.approval.required` events for blocked tools
   - Validates approval status from security context
   - Supports approval level hierarchy (NONE → USER_CONSENT → MANAGER → ADMIN → SECURITY_TEAM)

6. **Updated UnifiedToolRegistry validation** ✅ NEW
   - File: `backend/services/capability-registry/src/services/unified-tool-registry.ts`
   - Added danger tool validation in `validateToolExecution()`
   - Validates approval levels against danger tool requirements
   - Logs security checks for danger tools

### What Remains ❌

| Item                                | Description                                           |
| ----------------------------------- | ----------------------------------------------------- |
| Define "danger tool" list           | Create list in capability-registry of high-risk tools |
| Enforce LLM→plan→approval→execution | Add approval check in ToolExecutionCoordinator        |
| Add approval required check         | Validate approval status before tool execution        |
| End-to-end approval flow test       | Test complete LLM→plan→approval→execution pipeline    |

---

## Dependency Graph

```
P0: Tool Execution Events ✅
  │
  ├─ P1: Step Types Unification ✅
  │     │ Action: Delete schemas.ts, unify to shared-types
  │     └─ P2: Event Envelope ✅
  │           │ Action: Add actor/tenant to events
  │           └─ P4: Service Auth ✅
  │                 │ Action: Internal JWT between services
  │                 └─ P5: Security Tightening 🔄
  │                       │ Action: Approval gates for danger tools
  │
  └─ P3: Split Shared Services 🔄
        Action: Extract infra/contracts/clients (partial)
```

---

## Rollback Plan

Each phase should be reversible:

- Feature flags for new event envelope (P2)
- Dual-type support during migration (P1)
- Database migrations with rollback scripts
- Feature toggle for approval workflows (P5)

---

## Testing Strategy

1. **Unit Tests**: Each service with mocked dependencies
2. **Integration Tests**: Full flow with test RabbitMQ
3. **E2E Tests**: Critical paths (agent → tool → response)
4. **Load Tests**: Concurrent tool executions
5. **Security Tests**: Auth bypass attempts, approval bypass

---

## Quick Reference: File Locations

| Item                      | Location                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| Step types (operation.ts) | `packages/shared-types/src/operation.ts:100-148`                                          |
| Step types (schemas.ts)   | `backend/services/orchestration-pipeline/src/types/schemas.ts:97-119`                     |
| Step executor             | `backend/shared/services/src/stepExecutorService.ts:45+`                                  |
| Step execution manager    | `backend/services/orchestration-pipeline/src/engine/StepExecutionManager.ts`              |
| EventBus                  | `backend/shared/infra/src/eventBus.ts:1-50`                                               |
| UAIPEvent types           | `packages/shared-types/src/events.ts`                                                     |
| EventBus types            | `packages/shared-types/src/event-bus.ts`                                                  |
| Service auth types        | `packages/shared-types/src/service-auth.ts`                                               |
| Approval routes           | `backend/services/security-gateway/src/routes/approvalRoutes.ts`                          |
| Approval service          | `backend/services/security-gateway/src/services/approvalWorkflowService.ts`               |
| Internal token route      | `backend/services/security-gateway/src/http/auth.elysia.ts`                               |
| ServiceFactory            | `backend/shared/services/src/ServiceFactory.ts`                                           |
| @uaip/contracts           | `packages/contracts/src/`                                                                 |
| @uaip/infra               | `backend/shared/infra/src/`                                                               |
| @uaip/infra EventBus      | `backend/shared/infra/src/eventBus.ts`                                                    |
| @uaip/infra RedisCache    | `backend/shared/infra/src/cache/redisCacheService.ts`                                     |
| Danger tool list          | `backend/services/capability-registry/src/services/dangerToolList.ts`                     |
| ToolExecutionCoordinator  | `backend/services/capability-registry/src/services/tool-execution-coordinator.service.ts` |
| UnifiedToolRegistry       | `backend/services/capability-registry/src/services/unified-tool-registry.ts`              |

---

## References

- `backend/SERVICE_ARCHITECTURE.md` - Original architecture
- `backend/services/capability-registry/` - Tool execution coordinator
- `packages/shared-types/src/` - Type definitions
- `packages/contracts/src/` - Service contracts
- `backend/shared/infra/src/` - Infrastructure services
- Commit `5a49125` - P0 implementation
