# Navratna Backend Refactoring Plan

> Status: P0 ✅ | P1 ✅ | P2 ✅ | P3 🔄 (IN PROGRESS) | P4 ✅ | P5 ✅ (E2E test added)

## Executive Summary

This document outlines a phased refactoring plan to achieve hard service boundaries, eliminate god-packages, and establish canonical orchestration contracts for the Navratna backend.

---

## Overall Progress

| Phase                        | Status         | Completion Date | Notes                       |
| ---------------------------- | -------------- | --------------- | --------------------------- |
| P0: Tool Execution Events    | ✅ Complete    | -               | Commit `5a49125`            |
| P1: Unify Step Types         | ✅ Complete    | -               | Removed duplicate schemas   |
| P2: Canonical Event Envelope | ✅ Complete    | -               | UAIPEvent interface created |
| P3: Split Shared Services    | 🔄 In Progress | -               | EventBus + RedisCache moved |
| P4: Internal Service Auth    | ✅ Complete    | -               | Internal JWT tokens         |
| P5: Security Tightening      | ✅ Complete    | -               | Danger tool approval flow   |

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

3. **Moved EventBusService to @uaip/infra** ✅
   - File: `backend/shared/infra/src/eventBus.ts`
   - Complete RabbitMQ event bus implementation
   - Lazy connection, reconnect logic, publish/subscribe, RPC-style requests
   - Token validation in subscribe for internal service authentication

4. **Updated @uaip/infra exports**
   - File: `backend/shared/infra/src/index.ts`
   - Now exports EventBusService from local implementation
   - Placeholders for DatabaseService and RedisCacheService (still in shared/services)

5. **Moved RedisCacheService to @uaip/infra** ✅
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

| Item                                        | Effort     | Description                                                      |
| ------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Move DatabaseService infrastructure         | Large      | `databaseService.ts` TypeORM wrapper → `@uaip/infra/database`    |
| Create pure DatabaseService in @uaip/infra  | Medium     | Extract TypeORM connection, pool management, health checks       |
| Refactor/Delete ServiceFactory              | Large      | 513-line factory pulls all domain services, needs decomposition  |
| Move knowledge-graph/ to agent-intelligence | Very Large | 66 files of domain logic should be in agent-intelligence service |
| Move agent-memory/ to agent-intelligence    | Very Large | 14 files of agent memory should be in agent-intelligence service |
| Update all @uaip/shared-services imports    | Very Large | 171 files import from shared-services, need updated paths        |

### DatabaseService Analysis (892 lines)

**Current Problem**: DatabaseService is a "god-service" mixing infrastructure and domain logic:

```
INFRASTRUCTURE (should move to @uaip/infra):
├── TypeOrmService wrapper
├── Connection pooling & health checks
├── Bulk operations (bulkInsert, executeQuery)
└── Repository access patterns

DOMAIN (should stay or move to domain services):
├── UserService, ToolService, AgentService
├── SecurityService, AuditService
├── Knowledge graph services (Qdrant, ToolGraphDatabase)
└── 15+ delegated service getters
```

### Import Analysis (171 files)

**Current Import Patterns**:

- `import { DatabaseService, EventBusService } from '@uaip/shared-services'`
- `import { UserService, ToolService } from '@uaip/shared-services'`
- `import { KnowledgeGraphService } from '@uaip/shared-services'`

**Target Import Patterns**:

- Infrastructure: `import { EventBusService } from '@uaip/infra/eventBus'`
- Infrastructure: `import { DatabaseService } from '@uaip/infra/database'`
- Domain services: Direct imports from respective service packages

### P3.1: Move DatabaseService Infrastructure to @uaip/infra

**Step 1**: Create pure infrastructure DatabaseService

```typescript
// backend/shared/infra/src/database/databaseService.ts
export class DatabaseService {
  // TypeORM wrapper only
  // Connection pooling
  // Health checks
  // No domain service delegation
}
```

**Step 2**: Move TypeOrmService to @uaip/infra

```typescript
// backend/shared/infra/src/database/typeormService.ts
export class TypeOrmService {
  // Pure TypeORM connection management
  // No domain entities
}
```

**Step 3**: Export from @uaip/infra

```typescript
// backend/shared/infra/src/database/index.ts
export { DatabaseService } from './databaseService.js';
export { TypeOrmService } from './typeormService.js';
```

### P3.2: Decompose ServiceFactory

**Current**: 513 lines managing everything
**Target**: Separate concerns

```
SPLIT INTO:
├── InfrastructureFactory → @uaip/infra
│   ├── TypeORM initialization
│   ├── Redis cache initialization
│   └── Qdrant initialization
├──
├── KnowledgeGraphFactory → agent-intelligence
│   ├── KnowledgeRepository
│   ├── Embedding services
│   └── KnowledgeGraphService
└──
└── MemoryFactory → agent-intelligence
    ├── WorkingMemoryManager
    ├── EpisodicMemoryManager
    └── SemanticMemoryManager
```

### P3.3: Move Domain Logic to Respective Services

**knowledge-graph/ (66 files)** → Move to `backend/services/agent-intelligence/src/knowledge-graph/`

- embedding.service.ts
- knowledge-graph.service.ts
- enhanced-rag.service.ts
- 50+ supporting files

**agent-memory/ (14 files)** → Move to `backend/services/agent-intelligence/src/agent-memory/`

- agent-memory.service.ts
- working-memory.manager.ts
- episodic-memory.manager.ts
- semantic-memory.manager.ts

### P3.4: Update Import Paths (171 files)

**Affected Services**:
| Service | Files | Primary Imports |
|---------|-------|-----------------|
| agent-intelligence | 45 | KnowledgeGraphService, AgentMemoryService, EventBusService |
| capability-registry | 28 | DatabaseService, EventBusService, ToolService |
| security-gateway | 40 | DatabaseService, UserService, EventBusService |
| orchestration-pipeline | 15 | DatabaseService, EventBusService, OperationService |
| discussion-orchestration | 20 | DiscussionService, EventBusService |
| llm-service | 12 | EventBusService, ModelCapabilityDetector |
| marketplace-service | 8 | DatabaseService, BaseEntity |
| artifact-service | 3 | DatabaseService, EventBusService |

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
    ├── database/
    │   ├── index.ts           ← Needs full implementation
    │   └── typeormService.ts  ← Needs creation
    └── cache/
        ├── index.ts
        └── redisCacheService.ts

packages/shared-types/src/
├── event-bus.ts
└── service-auth.ts
```

---

## P3 Implementation Roadmap

### Phase 1: Extract Infrastructure (Est. 3-4 days)

#### P3.1: Create Pure DatabaseService in @uaip/infra

**Files to Create/Modify**:

```
backend/shared/infra/src/database/
├── index.ts                 ← Export DatabaseService
├── databaseService.ts       ← NEW: Pure TypeORM wrapper
├── typeormService.ts        ← NEW: Connection management
└── health.ts               ← NEW: Health check utilities
```

**Changes**:

1. Create `backend/shared/infra/src/database/databaseService.ts`:
   - Extract TypeORM connection pooling
   - Extract repository access patterns
   - Remove ALL domain service delegation
   - Keep: bulk operations, query execution, health checks

2. Create `backend/shared/infra/src/database/typeormService.ts`:
   - Move from `shared/services/src/typeormService.ts`
   - Remove entity imports
   - Pure connection management only

3. Update `backend/shared/infra/src/database/index.ts`:

   ```typescript
   export { DatabaseService } from './databaseService.js';
   export { TypeOrmService } from './typeormService.js';
   ```

4. Update imports in 171 files:

   ```typescript
   // Before
   import { DatabaseService } from '@uaip/shared-services';

   // After
   import { DatabaseService } from '@uaip/infra/database';
   ```

#### P3.2: Decompose ServiceFactory

**Approach**: Split ServiceFactory into focused factories

**Files to Create**:

```
backend/shared/infra/src/
└── factory/
    ├── index.ts
    ├── infrastructureFactory.ts    ← TypeORM, Redis, Qdrant
    └── serviceRegistry.ts          ← Service lookup (optional)
```

**Refactoring Steps**:

1. Extract infrastructure initialization to `InfrastructureFactory`
2. Remove domain service creation (KnowledgeGraph, Memory services)
3. Keep only: TypeORM, Redis Cache, Qdrant initialization

### Phase 2: Move Domain Logic (Est. 4-5 days)

#### P3.3: Move knowledge-graph/ to agent-intelligence

**Source**: `backend/shared/services/src/knowledge-graph/` (66 files)
**Destination**: `backend/services/agent-intelligence/src/knowledge-graph/`

**Files to Move**:

```
knowledge-graph/
├── embedding.service.ts
├── tei-embedding.service.ts
├── smart-embedding.service.ts
├── knowledge-graph.service.ts
├── enhanced-rag.service.ts
├── knowledge-sync.service.ts
├── bootstrap.service.ts
├── content-classifier.service.ts
├── relationship-detector.service.ts
├── entities/
│   ├── knowledge-item.entity.ts
│   ├── knowledge-relationship.entity.ts
│   └── [8 more entity files]
└── [50+ supporting files]
```

**Import Updates** (45 files in agent-intelligence):

```typescript
// Before
import { KnowledgeGraphService } from '@uaip/shared-services';

// After
import { KnowledgeGraphService } from '@/knowledge-graph/knowledge-graph.service.js';
```

#### P3.4: Move agent-memory/ to agent-intelligence

**Source**: `backend/shared/services/src/agent-memory/` (14 files)
**Destination**: `backend/services/agent-intelligence/src/agent-memory/`

**Files to Move**:

```
agent-memory/
├── index.ts
├── agent-memory.service.ts
├── working-memory.manager.ts
├── episodic-memory.manager.ts
├── semantic-memory.manager.ts
├── memory-consolidator.service.ts
└── memory-commit-hook.ts
```

**Import Updates** (30+ files across services):

```typescript
// Before
import { AgentMemoryService } from '@uaip/shared-services';

// After
import { AgentMemoryService } from '@/agent-memory/agent-memory.service.js';
```

### Phase 3: Update All Imports (Est. 2-3 days)

#### Import Migration Matrix

| Import Pattern        | From                    | To                                          |
| --------------------- | ----------------------- | ------------------------------------------- |
| EventBusService       | `@uaip/shared-services` | `@uaip/infra/eventBus`                      |
| DatabaseService       | `@uaip/shared-services` | `@uaip/infra/database`                      |
| RedisCacheService     | `@uaip/shared-services` | `@uaip/infra/cache`                         |
| UserService           | `@uaip/shared-services` | `@uaip/shared-services/user` (keep or move) |
| ToolService           | `@uaip/shared-services` | `@uaip/shared-services/tool` (keep or move) |
| KnowledgeGraphService | `@uaip/shared-services` | `@agent-intelligence/knowledge-graph`       |
| AgentMemoryService    | `@uaip/shared-services` | `@agent-intelligence/agent-memory`          |
| BaseEntity            | `@uaip/shared-services` | `@uaip/types` or keep                       |

#### Batch Import Updates (by Service)

**agent-intelligence** (45 files):

- `KnowledgeGraphService` → local import
- `AgentMemoryService` → local import
- `EventBusService` → `@uaip/infra/eventBus`
- `DatabaseService` → `@uaip/infra/database`

**capability-registry** (28 files):

- `DatabaseService` → `@uaip/infra/database`
- `EventBusService` → `@uaip/infra/eventBus`
- `ToolService` → keep in shared or move to capability-registry

**security-gateway** (40 files):

- `DatabaseService` → `@uaip/infra/database`
- `UserService` → keep or move to security-gateway
- `EventBusService` → `@uaip/infra/eventBus`

**orchestration-pipeline** (15 files):

- `DatabaseService` → `@uaip/infra/database`
- `EventBusService` → `@uaip/infra/eventBus`
- `OperationService` → keep or move

**discussion-orchestration** (20 files):

- `DiscussionService` → keep or move
- `EventBusService` → `@uaip/infra/eventBus`

**llm-service** (12 files):

- `EventBusService` → `@uaip/infra/eventBus`
- `ModelCapabilityDetector` → keep or move

### Rollback Strategy for P3

1. **Feature Flag**: Export both old and new paths during migration

   ```typescript
   // shared/services/src/index.ts
   export { DatabaseService } from './databaseService.js'; // OLD
   export { DatabaseService } from '@uaip/infra/database'; // NEW
   ```

2. **Dual Export Period**: 1 week overlap for gradual migration

3. **Import Mapping Script**: Automate import path updates
   ```bash
   # Example using sed (backup first!)
   find . -name "*.ts" -exec sed -i \
     's|from "@uaip/shared-services"|from "@uaip/infra/database"|g' {} \;
   ```

---

## Updated Dependency Graph

```
P0: Tool Execution Events ✅
  │
  ├─ P1: Step Types Unification ✅
  │     │ Action: Delete schemas.ts, unify to shared-types
  │     └─ P2: Event Envelope ✅
  │           │ Action: Add actor/tenant to events
  │           └─ P4: Service Auth ✅
  │                 │ Action: Internal JWT between services
  │                 └─ P5: Security Tightening ✅
  │                       │ Action: Approval gates for danger tools
  │
  └─ P3: Split Shared Services 🔄 (IN PROGRESS)
        │
        ├─ P3.1: Extract DatabaseService Infrastructure
        │     │ Action: Create pure TypeORM wrapper in @uaip/infra
        │     └─ Update imports (171 files)
        │
        ├─ P3.2: Decompose ServiceFactory
        │     │ Action: Split into InfrastructureFactory + DomainFactories
        │     └─ Remove domain logic from shared/services
        │
        ├─ P3.3: Move knowledge-graph/ to agent-intelligence
        │     │ Action: Move 66 files to respective service
        │     └─ Update agent-intelligence imports (45 files)
        │
        └─ P3.4: Move agent-memory/ to agent-intelligence
              │ Action: Move 14 files to respective service
              └─ Update imports (30+ files)
```

---

## Completion Checklist

### P3.1: DatabaseService Infrastructure Extraction

- [ ] Create `backend/shared/infra/src/database/databaseService.ts`
- [ ] Create `backend/shared/infra/src/database/typeormService.ts`
- [ ] Update `backend/shared/infra/src/database/index.ts`
- [ ] Update imports in 171 files
- [ ] Verify all services compile

### P3.2: ServiceFactory Decomposition

- [ ] Create `backend/shared/infra/src/factory/infrastructureFactory.ts`
- [ ] Move infrastructure initialization logic
- [ ] Remove domain service creation from ServiceFactory
- [ ] Update services to use new factory pattern

### P3.3: knowledge-graph/ Migration

- [ ] Move 66 files to `backend/services/agent-intelligence/src/knowledge-graph/`
- [ ] Update tsconfig paths in agent-intelligence
- [ ] Update 45 imports in agent-intelligence
- [ ] Verify knowledge graph functionality

### P3.4: agent-memory/ Migration

- [ ] Move 14 files to `backend/services/agent-intelligence/src/agent-memory/`
- [ ] Update tsconfig paths in agent-intelligence
- [ ] Update imports across all services (30+ files)
- [ ] Verify agent memory functionality

### Final Verification

- [ ] All 171 files updated with new import paths
- [ ] `pnpm build` passes for all packages
- [ ] `pnpm test` passes for all services
- [ ] Integration tests pass (agent → tool → response)
- [ ] No circular dependencies introduced
- [ ] TypeScript strict mode passes

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
| E2E Approval Flow Test    | `backend/services/capability-registry/src/__tests__/e2e/approval-flow.e2e.test.ts`        |

---

## Effort Estimates

| Phase                                | Tasks         | Estimated Time |
| ------------------------------------ | ------------- | -------------- |
| P3.1: DatabaseService Infrastructure | 4 tasks       | 3-4 days       |
| P3.2: ServiceFactory Decomposition   | 4 tasks       | 2-3 days       |
| P3.3: knowledge-graph/ Migration     | 4 tasks       | 3-4 days       |
| P3.4: agent-memory/ Migration        | 4 tasks       | 1-2 days       |
| Import Updates (all phases)          | 171 files     | 2-3 days       |
| **Total P3 Completion**              | **~21 tasks** | **11-16 days** |

---

## Risk Assessment

| Risk                         | Impact | Mitigation                                 |
| ---------------------------- | ------ | ------------------------------------------ |
| Import path breaking changes | High   | Dual-export during migration window        |
| Domain logic coupling        | High   | Careful extraction, comprehensive tests    |
| Circular dependencies        | Medium | Dependency graph analysis before migration |
| Test failures                | Medium | Run full test suite after each phase       |
| Build failures               | Medium | Incremental builds after each file move    |

---

## Quick Reference: Updated File Locations

| Item                        | New Location                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Step types (operation.ts)   | `packages/shared-types/src/operation.ts:100-148`                                                            |
| Step types (schemas.ts)     | `backend/services/orchestration-pipeline/src/types/schemas.ts:97-119`                                       |
| Step executor               | `backend/shared/services/src/stepExecutorService.ts:45+`                                                    |
| Step execution manager      | `backend/services/orchestration-pipeline/src/engine/StepExecutionManager.ts`                                |
| EventBus                    | `backend/shared/infra/src/eventBus.ts:1-50`                                                                 |
| UAIPEvent types             | `packages/shared-types/src/events.ts`                                                                       |
| EventBus types              | `packages/shared-types/src/event-bus.ts`                                                                    |
| Service auth types          | `packages/shared-types/src/service-auth.ts`                                                                 |
| Approval routes             | `backend/services/security-gateway/src/routes/approvalRoutes.ts`                                            |
| Approval service            | `backend/services/security-gateway/src/services/approvalWorkflowService.ts`                                 |
| Internal token route        | `backend/services/security-gateway/src/http/auth.elysia.ts`                                                 |
| ServiceFactory              | `backend/shared/services/src/ServiceFactory.ts` (to be refactored)                                          |
| @uaip/contracts             | `packages/contracts/src/`                                                                                   |
| @uaip/infra                 | `backend/shared/infra/src/`                                                                                 |
| @uaip/infra EventBus        | `backend/shared/infra/src/eventBus.ts`                                                                      |
| @uaip/infra RedisCache      | `backend/shared/infra/src/cache/redisCacheService.ts`                                                       |
| @uaip/infra DatabaseService | `backend/shared/infra/src/database/` (NEW - to be created)                                                  |
| Danger tool list            | `backend/services/capability-registry/src/services/dangerToolList.ts`                                       |
| ToolExecutionCoordinator    | `backend/services/capability-registry/src/services/tool-execution-coordinator.service.ts`                   |
| UnifiedToolRegistry         | `backend/services/capability-registry/src/services/unified-tool-registry.ts`                                |
| E2E Approval Flow Test      | `backend/services/capability-registry/src/__tests__/e2e/approval-flow.e2e.test.ts`                          |
| **knowledge-graph/**        | `backend/shared/services/src/knowledge-graph/` → `backend/services/agent-intelligence/src/knowledge-graph/` |
| **agent-memory/**           | `backend/shared/services/src/agent-memory/` → `backend/services/agent-intelligence/src/agent-memory/`       |

---

## References

- `backend/SERVICE_ARCHITECTURE.md` - Original architecture
- `backend/services/capability-registry/` - Tool execution coordinator
- `packages/shared-types/src/` - Type definitions
- `packages/contracts/src/` - Service contracts
- `backend/shared/infra/src/` - Infrastructure services
- Commit `5a49125` - P0 implementation

---

## Code Review: PR #295 Issues Found ✅ ALL FIXED

> Reviewed: Refactoring Execution PR (12 commits, +2,951 −99 changes)
> **Status**: All 9 issues from PR #295 have been fixed ✅

### Summary Table (UPDATED)

| Severity     | Issue                                            | File                                    | Lines      | Status                    |
| ------------ | ------------------------------------------------ | --------------------------------------- | ---------- | ------------------------- |
| ~~CRITICAL~~ | ~~EventBus auth missing signature verification~~ | `eventBus.ts`                           | 537-570    | ✅ FIXED commit `38da559` |
| ~~CRITICAL~~ | ~~Response handler structure mismatch~~          | `tool-execution.service.ts`             | 354-356    | ✅ FIXED commit `eada421` |
| ~~HIGH~~     | ~~Wildcard pattern matching bug~~                | `dangerToolList.ts`                     | 59-62      | ✅ FIXED commit `2bfbf6f` |
| ~~HIGH~~     | ~~Weak idempotency key (base64, not crypto)~~    | `tool-execution.service.ts`             | 75-80      | ✅ FIXED commit `cf87fb8` |
| ~~HIGH~~     | ~~Poison message risk (indefinite requeue)~~     | `eventBus.ts`                           | 614-617    | ✅ FIXED commit `35c7da0` |
| ~~HIGH~~     | ~~x-max-retries not standard RabbitMQ~~          | `eventBus.ts`                           | 505-507    | ✅ FIXED commit `35c7da0` |
| ~~HIGH~~     | ~~Idempotency lookup returns null~~              | `tool-execution-coordinator.service.ts` | 445-450    | ✅ FIXED commit `28fa99e` |
| ~~MEDIUM~~   | ~~Token in query param (security)~~              | `nginx.conf`                            | 105-113    | ✅ FIXED commit `40451f6` |
| ~~MEDIUM~~   | ~~Duplicate response object code~~               | `toolRoutes.ts`                         | throughout | ✅ FIXED commit `2f57e1d` |

**All PR #295 issues have been resolved. CRITICAL issues should be deployed after review.**

---

## P3 Refactoring Progress Update (January 2026)

### What Was Completed

| Item                                     | Status             | Details                                                                                                                                                       |
| ---------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P3.1: DatabaseService Infrastructure** | ✅ Already Existed | `@uaip/infra/database` with `DatabaseService` and `TypeOrmService`                                                                                            |
| **P3.3: knowledge-graph Migration**      | ✅ Complete        | 66 files moved to `backend/services/agent-intelligence/src/knowledge-graph/`                                                                                  |
| **P3.4: agent-memory Migration**         | ✅ Complete        | 14 files moved to `backend/services/agent-intelligence/src/agent-memory/`                                                                                     |
| **@uaip/infra Path Mappings**            | ✅ Complete        | Added to all service `tsconfig.json` files                                                                                                                    |
| **@uaip/infra Project References**       | ✅ Complete        | Added to 7 services (capability-registry, security-gateway, agent-intelligence, discussion-orchestration, marketplace-service, llm-service, artifact-service) |
| **@uaip/infra Dependencies**             | ✅ Updated         | Added `neo4j-driver` and `@qdrant/js-client-rest` to `package.json`                                                                                           |

### Files Created/Moved

```
backend/services/agent-intelligence/src/
├── knowledge-graph/     (66 files - MOVED from shared/services)
│   ├── index.ts
│   ├── knowledge-graph.service.ts
│   ├── embedding.service.ts
│   ├── smart-embedding.service.ts
│   └── entities/
├── agent-memory/        (14 files - MOVED from shared/services)
│   ├── index.ts
│   ├── agent-memory.service.ts
│   ├── working-memory.manager.ts
│   └── ...
└── database/
    └── repositories/    (46 files - COPIED for local access)
```

### Configuration Changes

**Updated tsconfig.json files:**

- `backend/shared/infra/tsconfig.json` - Created with project references
- `backend/shared/services/tsconfig.json` - Added `@uaip/infra/*` path mapping and infra reference
- `backend/services/capability-registry/tsconfig.json` - Added `@uaip/infra` reference
- `backend/services/security-gateway/tsconfig.json` - Added `@uaip/infra` reference
- `backend/services/agent-intelligence/tsconfig.json` - Added `@uaip/infra` reference
- `backend/services/discussion-orchestration/tsconfig.json` - Added `@uaip/infra` reference
- `backend/services/marketplace-service/tsconfig.json` - Added `@uaip/infra` reference
- `backend/services/llm-service/tsconfig.json` - Added `@uaip/infra` reference
- `backend/services/artifact-service/tsconfig.json` - Added `@uaip/infra` reference
- `backend/services/orchestration-pipeline/tsconfig.json` - Added `@uaip/infra` path mapping

### Known Issues (Pre-existing)

The `@uaip/infra` package has build errors that are **NOT caused by this refactoring**:

1. Type errors in `infrastructureFactory.ts` (Config properties not found)
2. Type errors in `databaseService.ts` (TypeORM generic issues)
3. Type errors in `qdrantService.ts` (Qdrant client API changes)
4. Type errors in `toolGraphDatabase.ts` (Neo4j driver type changes)

**To fix these issues (requires separate task):**

```bash
cd backend/shared/infra
pnpm install
# Then fix the type errors in the affected files
```

### Remaining Work

1. **Fix @uaip/infra build errors** - Resolve pre-existing type errors in factory services
2. **Complete import path updates** - Update remaining services to use new canonical import paths:
   - `DatabaseService` → `@uaip/infra/database`
   - `EventBusService` → `@uaip/infra/eventBus`
   - `RedisCacheService` → `@uaip/infra/cache`
3. **Final build verification** - Run `pnpm build` to confirm everything compiles

### Canonical Import Paths

After full completion, services should import:

```typescript
// Infrastructure services (from @uaip/infra)
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/eventBus';
import { RedisCacheService, redisCacheService } from '@uaip/infra/cache';

// Agent intelligence services (local to agent-intelligence)
import { KnowledgeGraphService } from '@/knowledge-graph/knowledge-graph.service';
import { AgentMemoryService } from '@/agent-memory/agent-memory.service';

// Domain services (keep in @uaip/shared-services)
import { UserService, ToolService, AgentService } from '@uaip/shared-services';
import { StateManagerService, StepExecutorService } from '@uaip/shared-services';
```
