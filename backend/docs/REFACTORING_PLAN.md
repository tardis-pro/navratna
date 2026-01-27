# Navratna Backend Refactoring Plan

> Status: P0 Complete | P1-P5 Analysis Complete

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

## P1: Unify Step Types (3-7 days) - ANALYSIS COMPLETE

### Problem: Three Competing Step Type Systems

| Location                                                    | File                  | Step Types                                                                                                                                          |
| ----------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared-types/src/operation.ts:103-114`            | `ExecutionStepSchema` | `'tool'`, `'artifact'`, `'validation'`, `'approval'`, `'delay'`, `'decision'`, `'agent-action'`, `'tool-execution'`, `'conditional'`, `'parallel'`  |
| `orchestration-pipeline/src/types/schemas.ts:100-109`       | `executionStepSchema` | `'tool_call'`, `'artifact_generate'`, `'api_request'`, `'data_transform'`, `'condition_check'`, `'delay'`, `'parallel_group'`, `'approval_request'` |
| `shared/services/src/stepExecutorService.ts`                | `switch(step.type)`   | Duplicates operation.ts types                                                                                                                       |
| `orchestration-pipeline/src/engine/StepExecutionManager.ts` | `switch(step.type)`   | `'agent-action'`, `'tool-execution'`, `'conditional'`, `'parallel'`                                                                                 |

### Mapping: Duplicates Identified

| Canonical Type | operation.ts              | schemas.ts          | Executor             |
| -------------- | ------------------------- | ------------------- | -------------------- |
| tool           | `tool`, `tool-execution`  | `tool_call`         | both                 |
| artifact       | `artifact`                | `artifact_generate` | both                 |
| approval       | `approval`                | `approval_request`  | both                 |
| delay          | `delay`                   | `delay`             | both                 |
| condition      | `decision`, `conditional` | `condition_check`   | both                 |
| parallel       | `parallel`                | `parallel_group`    | both                 |
| agent-action   | `agent-action`            | -                   | StepExecutionManager |
| validation     | `validation`              | `data_transform`    | -                    |
| -              | -                         | `api_request`       | -                    |

### Canonical Step Type Set

```
agent        - Pure reasoning step (from operation.ts)
tool         - Calls capability-registry
artifact     - Calls artifact-service
approval     - Calls security-gateway approval routes
delay        - Time-based delay
condition    - Conditional branching (unify decision/conditional)
parallel     - Parallel execution group
```

### Actions Required

1. ✅ Delete `schemas.ts` duplicate types, import from `shared-types`
2. Make `StepExecutionManager` delegate to `ToolExecutionCoordinator`
3. Update `stepExecutorService.ts` to use canonical types only
4. Delete `agent-action` (move to agent-intelligence service)
5. Delete `validation` (merge with condition or remove)

---

## P2: Canonical Event Envelope (2 days) - ANALYSIS COMPLETE

### Current EventMessage (eventBusService.ts:5-14)

```typescript
interface EventMessage {
  id: string;
  type: string;
  source: string;
  data: any;
  timestamp: Date;
  version: string;
  correlationId?: string;
  metadata?: Record<string, any>;
  [key: string]: unknown;
}
```

### Missing: Security Context

- No `actor` (userId, orgId, roles)
- No `tenant` (orgId)
- No `traceId` for distributed tracing

### Target: UAIPEvent<T> Envelope

```typescript
interface UAIPEvent<T> {
  id: string; // Unique event ID (UUID)
  type: string; // Event type
  source: string; // Service name
  timestamp: string; // ISO 8601
  correlationId: string; // Trace ID for request chain
  actor: {
    // Security context
    userId: string;
    orgId: string;
    roles: string[];
  };
  tenant: {
    // Multi-tenancy
    orgId: string;
  };
  data: T; // Payload
  version: '1'; // Schema version
}
```

### Actions Required

1. Create `UAIPEvent` interface in `packages/shared-types/src/events.ts`
2. Update `EventBusService.publish()` to wrap events
3. Update `EventBusService.subscribe()` to unwrap and validate
4. Add correlation middleware to all services
5. Update all event publishers to include actor context

### Current Event Publishers (examples)

- `agent-intelligence/src/agents/base-agent.ts:151` - tool.execute.request
- `tool-execution.service.ts` - tool.execute.request (P0)
- `approvalWorkflowService.ts:128` - approval.workflow.created

---

## P3: Split Shared Services (Ongoing) - ANALYSIS COMPLETE

### Current Structure: God Package

```
backend/shared/services/src/
├── ServiceFactory.ts           # 513 lines - pulls in everything
├── eventBusService.ts          # ✅ Infra
├── databaseService.ts          # ✅ Infra
├── redisCacheService.ts        # ✅ Infra
├── logger.ts                   # ✅ Infra
├── config.ts                   # ✅ Infra
├── knowledge-graph/            # ❌ Domain - extract
├── agent-memory/               # ❌ Domain - extract
├── conversation/               # ❌ Domain - extract
├── tool-execution.service.ts   # ❌ Domain - extract (now event-driven)
├── stepExecutorService.ts      # ❌ Domain - extract
├── operation-management.service.ts  # ❌ Domain
├── project-management.service.ts    # ❌ Domain
├── capabilities/               # ❌ Domain
├── collaboration/              # ❌ Domain
├── widgetService.ts            # ❌ Domain
├── securityValidationService.ts # ❌ Domain
├── integration/                # ❌ Domain
├── resourceManagerService.ts   # ❌ Domain
└── ...20+ more domain modules
```

### ServiceFactory Dependencies (line 47+)

```typescript
// ServiceFactory pulls in:
-knowledgeGraphService -
  toolExecutionService -
  operationManagementService -
  projectManagementService -
  contextOrchestrationService -
  agentMemoryService;
// ... and many more domain services
```

### Target Package Structure

```
packages/
├── shared-types/          # ✅ Zod schemas, event types
├── shared-config/         # ✅ Config loading
backend/
├── shared/
│   ├── infra/             # NEW - EventBus, Database, Redis, Logger
│   │   ├── src/
│   │   │   ├── eventBusService.ts
│   │   │   ├── databaseService.ts
│   │   │   ├── redisCacheService.ts
│   │   │   ├── logger.ts
│   │   │   └── config.ts
│   │   └── package.json   # @uaip/infra
│   │
│   ├── contracts/         # NEW - Interfaces only, no implementation
│   │   ├── src/
│   │   │   ├── tool-contracts.ts
│   │   │   ├── orchestration-contracts.ts
│   │   │   └── events.ts
│   │   └── package.json   # @uaip/contracts
│   │
│   └── clients/           # NEW - Service-to-service clients
│       ├── src/
│       │   ├── security-gateway.client.ts
│       │   ├── capability-registry.client.ts
│       │   └── llm.client.ts
│       └── package.json   # @uaip/clients
```

### Actions Required

1. Extract `@uaip/infra` from shared/services (eventBus, database, redis, logger, config)
2. Extract `@uaip/contracts` to shared-types or new package
3. Extract domain logic to respective services:
   - knowledge-graph → knowledge-graph service (new)
   - agent-memory → agent-intelligence
   - tool-execution → capability-registry
   - step-execution → orchestration-pipeline
4. Delete ServiceFactory or reduce to infra-only
5. Update imports across all services

---

## P4: Internal Service Auth (3 days) - ANALYSIS COMPLETE

### Current Auth Landscape

**security-gateway** (port 3004) provides:

- User authentication (JWT tokens)
- OAuth flows
- API key validation
- `ApprovalWorkflowService` for approvals

**Gap**: No service-to-service auth

- EventBus messages have no auth token
- Internal HTTP calls have no service credentials
- `apiKeyAuth.ts` exists but not enforced on internal calls

### Existing Security Context

```typescript
// In approvalRoutes.ts and securityRoutes.ts
interface SecurityValidationRequest {
  userId: string;
  operation: string;
  resource: string;
  metadata?: Record<string, any>;
}
```

### Target: Internal JWT Flow

```typescript
// 1. Service requests internal token from security-gateway
POST /api/v1/auth/internal-token
{
  "serviceName": "agent-intelligence",
  "apiKey": "service-api-key"
}
// Returns: { "token": "internal-jwt-signed-by-security-gateway" }

// 2. EventBus publish includes token
eventBus.publish('tool.execute.request', payload, {
  auth: {
    serviceToken: 'internal-jwt...',
    actor: { userId, orgId, roles },
  },
});

// 3. EventBus subscribe validates token
eventBus.subscribe('tool.execute.request', handler, {
  requireAuth: true,
});
```

### Actions Required

1. Add internal token endpoint in security-gateway
2. Create service credential storage
3. Add JWT validation middleware for internal calls
4. Update EventBusService to validate tokens
5. Add auth to all HTTP internal endpoints
6. Create `@uaip/clients` with auth built-in

---

## P5: Security Tightening (Ongoing) - ANALYSIS COMPLETE

### Existing Approval System

**security-gateway** already has:

- `ApprovalWorkflowService` (approvalWorkflowService.ts:45)
- Routes: `/api/v1/approvals/*`
- Events: `approval.workflow.created`, `approval.workflow.completed`

**Approval Workflow Flow**:

```
1. createApprovalWorkflow(request: ApprovalRequest)
2. processApprovalDecision(decision: ApprovalDecision)
3. getWorkflowStatus(workflowId): ApprovalWorkflowStatus
```

### Current Approval Triggers

- High/Critical risk operations
- System admin operations
- Agent operations
- High-risk OAuth operations

### Danger Tools Classification

From `securityGatewayService.ts`:

- High-risk operations (risk level HIGH, CRITICAL)
- System configuration changes
- Agent capability operations
- Bulk data exports

### Actions Required

1. ✅ Approval infrastructure exists in security-gateway
2. Wire approval step type to orchestration (P1)
3. Add audit logging for all tool executions (P0 done)
4. Define "danger tool" list in capability-registry
5. Enforce: LLM → plan → approval → tool execution
6. Add approval required check in ToolExecutionCoordinator

---

## Dependency Graph

```
P0: Tool Execution Events ✅
  │
  ├─ P1: Step Types Unification
  │     │ Action: Delete schemas.ts, unify to shared-types
  │     └─ P2: Event Envelope
  │           │ Action: Add actor/tenant to events
  │           └─ P4: Service Auth
  │                 │ Action: Internal JWT between services
  │                 └─ P5: Security Tightening
  │                       │ Action: Approval gates for danger tools
  │
  └─ P3: Split Shared Services (independent)
        Action: Extract infra/contracts/clients
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

| Item                      | Location                                                                     |
| ------------------------- | ---------------------------------------------------------------------------- |
| Step types (operation.ts) | `packages/shared-types/src/operation.ts:100-148`                             |
| Step types (schemas.ts)   | `backend/services/orchestration-pipeline/src/types/schemas.ts:97-119`        |
| Step executor             | `backend/shared/services/src/stepExecutorService.ts:45+`                     |
| Step execution manager    | `backend/services/orchestration-pipeline/src/engine/StepExecutionManager.ts` |
| EventBus                  | `backend/shared/services/src/eventBusService.ts:1-50`                        |
| Approval routes           | `backend/services/security-gateway/src/routes/approvalRoutes.ts`             |
| Approval service          | `backend/services/security-gateway/src/services/approvalWorkflowService.ts`  |
| ServiceFactory            | `backend/shared/services/src/ServiceFactory.ts`                              |

---

## References

- `backend/SERVICE_ARCHITECTURE.md` - Original architecture
- `backend/services/capability-registry/` - Tool execution coordinator
- `packages/shared-types/src/` - Type definitions
- Commit `5a49125` - P0 implementation
