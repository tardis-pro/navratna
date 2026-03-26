# Domain Services — @uaip/shared-services/services

All domain service classes accessed via `ServiceFactory`. Never instantiate with `new` — always use the factory.

## SERVICE CATALOG

| Class                          | Domain         | Key Responsibility                                              |
| ------------------------------ | -------------- | --------------------------------------------------------------- |
| `UserService.ts`               | Users          | User CRUD, LLM provider assignment per user                     |
| `AgentService.ts`              | Agents         | Agent CRUD, state management, capability attachment             |
| `ToolService.ts`               | Tools          | Tool CRUD, execution history, availability checks               |
| `AuditService.ts`              | Security       | Audit log writes, compliance records                            |
| `SecurityService.ts`           | Security       | RBAC policies, permission checks                                |
| `MFAService.ts`                | Auth           | TOTP setup/verify, MFA enforcement                              |
| `OAuthService.ts`              | Auth           | OAuth provider adapter orchestration                            |
| `SessionService.ts`            | Auth           | Session lifecycle (create/validate/revoke)                      |
| `ArtifactService.ts`           | Artifacts      | Artifact CRUD, status tracking                                  |
| `ProjectService.ts`            | Projects       | Project CRUD, allowed tools config, member management           |
| `OperationService.ts`          | Orchestration  | Operation lifecycle (pending→running→completed/failed)          |
| `task.service.ts`              | Orchestration  | Task CRUD, assignment, status transitions                       |
| `MCPService.ts`                | MCP Protocol   | MCP client/server — tool discovery, invocation, streaming       |
| `ModelSelectionOrchestrator.ts`| LLM Routing    | 5-strategy model selection waterfall                            |
| `UnifiedModelSelectionFacade.ts`| LLM Routing   | High-level facade over `ModelSelectionOrchestrator`             |
| `llmPreferenceResolutionService.ts` | LLM       | Resolves user + agent LLM preferences                          |
| `UserToolPreferencesService.ts`| Tools          | Per-user tool preference CRUD                                   |
| `CachedUserService.ts`         | Users          | Redis-cached wrapper for `UserService` (hot paths)              |
| `BaseDomainService.ts`         | Base           | Abstract base for all domain services (constructor pattern)     |
| `AgentTaskTypeResolver.ts`     | Agents         | Maps agent capabilities to appropriate task types               |

## USAGE

```typescript
import { ServiceFactory } from '@uaip/shared-services';

const factory = ServiceFactory.getInstance();

// Domain services
const userService = factory.getUserService();
const agentService = factory.getAgentService();
const toolService = factory.getToolService();
const auditService = factory.getAuditService();

// Never:
const svc = new UserService(); // ❌ bypasses DI, breaks singleton guarantees
```

## MODEL SELECTION WATERFALL

`ModelSelectionOrchestrator` applies strategies in order:

1. `AgentSpecificStrategy` — agent's configured model (`agentModels.json`)
2. `UserSpecificStrategy` — user's provider preference
3. `PerformanceOptimizedStrategy` — latency/cost-optimized
4. `ContextAwareStrategy` — context-length-aware
5. `SystemDefaultStrategy` — config fallback

Use `UnifiedModelSelectionFacade` for the simplified API — don't call strategies directly.

## CONVENTIONS

- All domain services extend `BaseDomainService` — provides logger, error handling, and constructor pattern
- `CachedUserService` wraps `UserService` — use it when user data is needed in hot paths (chat, auth validation)
- MFA and OAuth services are security-critical — changes require updating coverage threshold in jest.config
- `AgentTaskTypeResolver` is stateless — safe to call without factory

## ANTI-PATTERNS

- Importing domain services directly (`import { UserService } from './UserService'`) in service code — use `ServiceFactory`
- Calling `OperationService` from within a running operation handler — creates circular state transitions
- Bypassing `CachedUserService` for user lookups in discussion/chat hot paths — causes DB saturation
