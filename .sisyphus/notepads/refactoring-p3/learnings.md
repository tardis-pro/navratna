# P3 Refactoring Learnings

## What Was Found

### Infrastructure Already Moved

- ✅ EventBusService → @uaip/infra (31KB implementation)
- ✅ RedisCacheService → @uaip/infra
- @uaip/infra structure exists with database/ and cache/ directories
- DatabaseService.ts and TypeOrmService.ts exist in @uaip/infra (need verification)

### What Remains

- ❌ knowledge-graph/ → agent-intelligence (66 files)
- ❌ agent-memory/ → agent-intelligence (14 files)
- ❌ ServiceFactory decomposition (512 lines)
- ❌ Import updates (90 files across 7 services)

### Key Findings

1. **agent-intelligence** target directories DO NOT exist yet
2. **security-gateway** has highest dependency (43 files) on shared-services
3. **DatabaseService** is most widely imported (6 of 7 services)
4. ServiceFactory is 512 lines mixing infrastructure + domain logic
5. DatabaseService is 891 lines mixing TypeORM wrapper + domain services

## Patterns Identified

### Import Patterns

- Infrastructure: DatabaseService, EventBusService, RedisCacheService
- Domain: UserService, ToolService, KnowledgeGraphService, AgentMemoryService
- Base: BaseService, ServiceConfig

### Refactoring Strategy

1. Move knowledge-graph/ and agent-memory/ first (domain logic)
2. Decompose ServiceFactory (separate infrastructure factory)
3. Update all imports in batches by service
4. Verify each service compiles after import updates

## Gotchas

- 90 files need import updates (not 171 as originally estimated)
- Some imports use relative paths within shared-services
- Tests also import from shared-services (need updates too)

## 2026-01-27 Shared-Services Import Census

Scope: backend/** (apps/** had no matches)
Tools:

- grep pattern: `from '@uaip/shared-services'`
- ast-grep pattern: `import { $$ } from '@uaip/shared-services'` (tool returned no matches)

Totals:

- Files with imports: 236
- Import lines: 284

Multiline import blocks (expanded):

- backend/services/orchestration-pipeline/src/orchestrationEngine.ts
  - import { DatabaseService, EventBusService, StateManagerService, ResourceManagerService, StepExecutorService, CompensationService, OperationManagementService } from '@uaip/shared-services';
- backend/services/orchestration-pipeline/src/controllers/taskController.ts
  - import { TaskService, CreateTaskRequest, UpdateTaskRequest, TaskAssignmentRequest, TaskFilters } from '@uaip/shared-services';
- backend/services/orchestration-pipeline/src/index.ts
  - import { StateManagerService, ResourceManagerService, StepExecutorService, CompensationService, serviceFactory, TaskService } from '@uaip/shared-services';
- backend/services/security-gateway/src/routes/approvalRoutes.ts
  - import { Router, Request, Response, NextFunction, RouterType } from '@uaip/shared-services';
- backend/services/security-gateway/src/routes/securityRoutes.ts
  - import { SecurityService, EventBusService, AuditService as DomainAuditService, DatabaseService } from '@uaip/shared-services';
- backend/services/security-gateway/src/routes/knowledgeRoutes.ts
  - import { UserKnowledgeService, getUserKnowledgeService, servicesHealthCheck } from '@uaip/shared-services';
- backend/services/security-gateway/src/**tests**/utils/testHelpers.ts
  - import { UserEntity, Agent as AgentEntity, SecurityPolicy as SecurityPolicyEntity, OAuthProviderEntity, AgentOAuthConnectionEntity, OAuthStateEntity, AuditEvent as AuditLogEntity, SessionEntity } from '@uaip/shared-services';
- backend/services/security-gateway/src/http/contacts.elysia.ts
  - import { DatabaseService, ContactStatus as RepoContactStatus, ContactType } from '@uaip/shared-services';
- backend/services/security-gateway/src/http/security.elysia.ts
  - import { SecurityService, EventBusService, AuditService as DomainAuditService, DatabaseService } from '@uaip/shared-services';
- backend/services/security-gateway/src/http/knowledge.elysia.ts
  - import { servicesHealthCheck, getUserKnowledgeService, type UserKnowledgeService } from '@uaip/shared-services';
- backend/services/security-gateway/src/services/llmProviderManagementService.ts
  - import { LLMProviderRepository, LLMProvider, DatabaseService, EventBusService } from '@uaip/shared-services';
- backend/services/security-gateway/src/**tests**/integration/oauth-flow.integration.test.ts
  - import { OAuthProviderEntity, Agent as AgentEntity, UserEntity, AgentOAuthConnectionEntity, OAuthStateEntity } from '@uaip/shared-services';
- backend/services/security-gateway/src/**tests**/integration/security-validation.integration.test.ts
  - import { Agent as AgentEntity, UserEntity, SecurityPolicy as SecurityPolicyEntity, AuditEvent as AuditLogEntity, SessionEntity } from '@uaip/shared-services';
- backend/shared/llm-service/src/LLMService.ts
  - import { LLMProviderRepository, LLMProvider, UserLLMProviderRepository, UserLLMProvider, RedisCacheService } from '@uaip/shared-services';
- backend/shared/llm-service/src/UserLLMService.ts
  - import { UserLLMProviderRepository, UserLLMProvider, UserLLMProviderType, DatabaseService, UnifiedModelSelectionFacade, UnifiedModelSelection, AgentTaskTypeResolver } from '@uaip/shared-services';
- backend/services/agent-intelligence/src/services/agent-intent.service.ts
  - import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService } from '@uaip/shared-services';
- backend/services/agent-intelligence/src/services/agent-metrics.service.ts
  - import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService } from '@uaip/shared-services';
- backend/services/agent-intelligence/src/services/agent-context.service.ts
  - import { EventBusService, KnowledgeGraphService, SERVICE_ACCESS_MATRIX } from '@uaip/shared-services';
- backend/services/agent-intelligence/src/services/agent-core.service.ts
  - import { DatabaseService, EventBusService, Repository, validateServiceAccess, AccessLevel, PersonaService } from '@uaip/shared-services';
- backend/services/agent-intelligence/src/services/agent-discussion.service.ts
  - import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService, DiscussionService, LLMRequestTracker, ThoughtParserService } from '@uaip/shared-services';
- backend/services/agent-intelligence/src/services/conversation-intelligence.service.ts
  - import { EventBusService, UserKnowledgeService, QdrantService, EmbeddingService } from '@uaip/shared-services';
- backend/services/agent-intelligence/src/services/agent-initialization.service.ts
  - import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService, PersonaService } from '@uaip/shared-services';
- backend/services/agent-intelligence/src/services/agent-learning.service.ts
  - import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService } from '@uaip/shared-services';
- backend/services/capability-registry/src/services/mcpClientService.ts
  - import { EventBusService, DatabaseService, ToolGraphDatabase, SecurityLevel } from '@uaip/shared-services';
- backend/services/capability-registry/src/services/toolRegistry.ts
  - import { ToolDatabase, ToolRelationship, ToolRecommendation, ToolService, serviceFactory, EventBusService } from '@uaip/shared-services';
- backend/services/capability-registry/src/controllers/capabilityController.ts
  - import { CapabilityDiscoveryService, SecurityValidationService, DatabaseService } from '@uaip/shared-services';
- backend/services/discussion-orchestration/src/services/discussionOrchestrationService.ts
  - import { DiscussionService, EventBusService, ParticipantManagementService } from '@uaip/shared-services';
- backend/services/discussion-orchestration/src/index.ts
  - import { SERVICE_ACCESS_MATRIX, validateServiceAccess, getDatabaseConnectionString, AccessLevel } from '@uaip/shared-services';

Per-file import lines (raw grep hits):
backend/services/security-gateway/src/routes/userPersonaRoutes.ts
import express, { Request, Response, Router } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services';
import { DefaultUserLLMProviderSeed, ModelCapabilityDetector } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/approvalRoutes.ts
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/auditRoutes.ts
import express, { Router } from '@uaip/shared-services';
import { Request, Response } from '@uaip/shared-services';
import { AuditService as DomainAuditService } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/userRoutes.js
import { Router } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/userRoutes.ts
import express, { Router } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services';
import { Request, Response } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/approvalRoutes.js
import { Router, } from '@uaip/shared-services';
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/securityRoutes.ts
import express, { Router } from '@uaip/shared-services';
import { Request, Response } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/llmProviderRoutes.ts
import { Router, Request, Response, NextFunction } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/oauthRoutes.ts
import { Router, Request, Response, RouterType } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/contactRoutes.ts
import express, { Router } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services';
import { Request, Response } from '@uaip/shared-services';
import { ContactStatus } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/auditRoutes.js
import { Router } from '@uaip/shared-services';
import { AuditService as DomainAuditService } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/userLLMProviderRoutes.js
import { Router } from '@uaip/shared-services';
import { UserService, DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/oauthRoutes.d.ts
import { RouterType } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/userPersonaRoutes.js
import { Router } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services';
import { DefaultUserLLMProviderSeed, ModelCapabilityDetector } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/oauthRoutes.js
import { Router } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/knowledgeRoutes.js
import { Router } from '@uaip/shared-services';
import { getUserKnowledgeService, servicesHealthCheck, } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/knowledgeRoutes.ts
import { Router, Request, Response } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/userToolPreferencesRoutes.ts
import { Router } from '@uaip/shared-services';
import { UserToolPreferencesService, DatabaseService } from '@uaip/shared-services';
import { Request, Response } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/contactRoutes.js
import { Router } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services';
import { ContactStatus } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/securityRoutes.js
import { Router } from '@uaip/shared-services';
import { SecurityService, EventBusService, AuditService as DomainAuditService, DatabaseService, } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/llmProviderRoutes.js
import { Router } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/userToolPreferencesRoutes.js
import { Router } from '@uaip/shared-services';
import { UserToolPreferencesService, DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/routes/userLLMProviderRoutes.ts
import { Router, Request, Response, NextFunction } from '@uaip/shared-services';
import { UserService, DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/utils/testHelpers.d.ts
import { UserEntity, Agent as AgentEntity, SecurityPolicy as SecurityPolicyEntity, OAuthProviderEntity, AuditEvent as AuditLogEntity } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/utils/testHelpers.ts
import { UserEntity, Agent as AgentEntity, SecurityPolicy as SecurityPolicyEntity, OAuthProviderEntity, AgentOAuthConnectionEntity, OAuthStateEntity, AuditEvent as AuditLogEntity, SessionEntity } from '@uaip/shared-services';
backend/services/artifact-service/src/ArtifactService.js
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/utils/testHelpers.js
import { UserEntity, Agent as AgentEntity, SecurityPolicy as SecurityPolicyEntity, OAuthProviderEntity, AgentOAuthConnectionEntity, OAuthStateEntity, AuditEvent as AuditLogEntity, SessionEntity, } from '@uaip/shared-services';
backend/services/artifact-service/src/index.js
import { BaseService } from '@uaip/shared-services';
backend/services/artifact-service/src/ArtifactService.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/artifact-service/src/index.d.ts
import { BaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/enhancedSecurityGatewayService.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/artifact-service/src/routes/artifactRoutes.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/approvalWorkflowService.d.ts
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/auditService.js
import { AuditService as DomainAuditService } from '@uaip/shared-services';
backend/services/artifact-service/src/routes/artifactRoutes.js
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/securityGatewayService.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/artifact-service/src/services/shortLink.service.d.ts
import { ShortLinkEntity, LinkType } from '@uaip/shared-services';
backend/services/security-gateway/src/services/auditService.ts
import { AuditService as DomainAuditService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/modelService.js
import { LLMModelRepository } from '@uaip/shared-services';
backend/services/security-gateway/src/services/approvalWorkflowService.ts
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';
backend/services/artifact-service/src/services/shortLink.service.js
import { TypeOrmService } from '@uaip/shared-services';
import { ShortLinkEntity, LinkType, LinkStatus } from '@uaip/shared-services';
backend/services/security-gateway/src/services/apiKeyDecryptionHandler.d.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/enhancedAuthService.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/artifact-service/src/services/shortLink.service.ts
import { TypeOrmService } from '@uaip/shared-services';
import { ShortLinkEntity, LinkType, LinkStatus } from '@uaip/shared-services';
backend/services/security-gateway/src/services/llmProviderManagementService.d.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/enhancedSecurityGatewayService.d.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/oauthProviderService.ts
import { OAuthService } from '@uaip/shared-services';
backend/services/artifact-service/src/index.ts
import { BaseService, ServiceConfig } from '@uaip/shared-services';
backend/services/security-gateway/src/services/modelService.ts
import { LLMModel, LLMModelRepository } from '@uaip/shared-services';
backend/services/security-gateway/src/services/llmProviderManagementService.js
import { LLMProviderRepository, DatabaseService, } from '@uaip/shared-services';
backend/services/security-gateway/src/services/apiKeyDecryptionHandler.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
import { UserLLMProvider } from '@uaip/shared-services';
backend/services/security-gateway/src/services/llmProviderManagementService.ts
import { LLMProviderRepository, LLMProvider, DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/notificationService.ts
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/enhancedAuthService.d.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/integration/oauth-flow.integration.test.js
import { OAuthProviderEntity, Agent as AgentEntity, UserEntity, AgentOAuthConnectionEntity, OAuthStateEntity, } from '@uaip/shared-services';
backend/services/security-gateway/src/services/apiKeyDecryptionHandler.js
import { UserLLMProvider } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/integration/oauth-flow.integration.test.ts
import { OAuthProviderEntity, Agent as AgentEntity, UserEntity, AgentOAuthConnectionEntity, OAuthStateEntity } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/integration/security-validation.integration.test.ts
import { Agent as AgentEntity, UserEntity, SecurityPolicy as SecurityPolicyEntity, AuditEvent as AuditLogEntity, SessionEntity } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/integration/security-validation.integration.test.js
import { Agent as AgentEntity, UserEntity, SecurityPolicy as SecurityPolicyEntity, AuditEvent as AuditLogEntity, } from '@uaip/shared-services';
backend/services/capability-registry/src/routes/toolRoutes.js
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/auth.elysia.ts
import { UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/users.elysia.js
import { UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/contacts.elysia.ts
import { DatabaseService, ContactStatus as RepoContactStatus, ContactType } from '@uaip/shared-services';
import { ContactStatus } from '@uaip/shared-services';
backend/services/capability-registry/src/routes/toolRoutes.ts
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/index.d.ts
import { BaseService } from '@uaip/shared-services';
backend/shared/llm-service/src/UserLLMService.js
import { DatabaseService, AgentTaskTypeResolver, } from '@uaip/shared-services';
backend/shared/llm-service/src/StreamingService.js
import { EventBusService } from '@uaip/shared-services';
backend/shared/llm-service/src/StreamingService.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/capability-registry/src/routes/toolRoutes.d.ts
import { EventBusService } from '@uaip/shared-services';
backend/shared/llm-service/src/LLMService.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/contacts.elysia.js
import { DatabaseService, ContactStatus as RepoContactStatus, } from '@uaip/shared-services';
backend/shared/llm-service/src/UserLLMService.d.ts
import { UserLLMProvider, UserLLMProviderType, UnifiedModelSelectionFacade, UnifiedModelSelection } from '@uaip/shared-services';
backend/services/security-gateway/src/http/projects.elysia.js
import { ProjectManagementService, DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/tool-preferences.elysia.ts
import { UserToolPreferencesService, DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/oauth.elysia.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/index.d.ts
import { BaseService } from '@uaip/shared-services';
backend/shared/llm-service/src/services/ApiKeyDecryptionService.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/security.elysia.ts
import { SecurityService, EventBusService, AuditService as DomainAuditService, DatabaseService } from '@uaip/shared-services';
backend/shared/llm-service/src/services/ApiKeyDecryptionService.d.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/approval.elysia.js
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/shared/llm-service/src/services/ModelSyncService.ts
import { LLMModel, LLMModelRepository, UserLLMProviderRepository } from '@uaip/shared-services';
backend/shared/llm-service/src/services/ModelBootstrapService.js
import { DatabaseService, RedisCacheService, UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/oauth.elysia.js
import { DatabaseService } from '@uaip/shared-services';
backend/shared/llm-service/src/services/ModelBootstrapService.ts
import { DatabaseService, RedisCacheService, UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/persona.elysia.ts
import { DatabaseService, DefaultUserLLMProviderSeed } from '@uaip/shared-services';
backend/shared/llm-service/src/services/ModelSyncService.js
import { LLMModel, LLMModelRepository, UserLLMProviderRepository } from '@uaip/shared-services';
backend/services/security-gateway/src/http/projects.elysia.ts
import { ProjectManagementService, DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/auth.elysia.js
import { UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/audit.elysia.js
import { AuditService as DomainAuditService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/toolExecutor.ts
import { DatabaseService, ToolService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/toolRegistry.d.ts
import { ToolRelationship, ToolRecommendation, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/tool-preferences.elysia.js
import { UserToolPreferencesService, DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/mcpClientService.js
import { ToolGraphDatabase, SecurityLevel, } from '@uaip/shared-services';
backend/services/security-gateway/src/http/providers.elysia.js
import { EventBusService, UserService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/oauthCapabilityDiscovery.d.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/security.elysia.js
import { SecurityService, EventBusService, AuditService as DomainAuditService, DatabaseService, } from '@uaip/shared-services';
backend/shared/llm-service/src/UserLLMService.ts
import { UserLLMProviderRepository, UserLLMProvider, UserLLMProviderType, DatabaseService, UnifiedModelSelectionFacade, UnifiedModelSelection, AgentTaskTypeResolver } from '@uaip/shared-services';
backend/services/capability-registry/src/services/tool-recommendation.service.ts
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/providers.elysia.ts
import { EventBusService, UserService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/tool-execution-coordinator.service.js
import { EventBusService, DatabaseService, redisCacheService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/knowledge.elysia.js
import { servicesHealthCheck, getUserKnowledgeService, } from '@uaip/shared-services';
backend/services/capability-registry/src/services/unified-tool-registry.js
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/knowledge.elysia.ts
import { servicesHealthCheck, getUserKnowledgeService, type UserKnowledgeService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/project-tool-integration.service.ts
import { EventBusService, DatabaseService, ProjectManagementService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/users.elysia.ts
import { UserService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/enterprise-tool-registry.js
import { SERVICE_ACCESS_MATRIX, validateServiceAccess, AccessLevel } from '@uaip/shared-services';
backend/shared/llm-service/src/LLMService.js
import { RedisCacheService, } from '@uaip/shared-services';
import { DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/toolExecutor.d.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/tool-recommendation.service.js
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/persona.elysia.js
import { DatabaseService, DefaultUserLLMProviderSeed } from '@uaip/shared-services';
backend/services/capability-registry/src/services/project-tool-integration.service.js
import { ProjectManagementService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/approval.elysia.ts
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/mcpClientService.ts
import { EventBusService, DatabaseService, ToolGraphDatabase, SecurityLevel } from '@uaip/shared-services';
backend/services/capability-registry/src/services/toolRegistry.ts
import { ToolDatabase, ToolRelationship, ToolRecommendation, ToolService, serviceFactory, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/audit.elysia.ts
import { AuditService as DomainAuditService } from '@uaip/shared-services';
backend/services/security-gateway/src/index.js
import { BaseService } from '@uaip/shared-services';
import { initializeServices } from '@uaip/shared-services';
backend/services/capability-registry/src/services/mcpResourceDiscoveryService.d.ts
import { RedisCacheService } from '@uaip/shared-services';
backend/services/security-gateway/src/index.ts
import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { initializeServices } from '@uaip/shared-services';
backend/services/capability-registry/src/services/oauthCapabilityDiscovery.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/project-tool-integration.service.d.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/agents/pm-bot/pm-bot.agent.ts
import { EventBusService, ToolExecutionService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/agents/pm-bot/pm-bot.agent.d.ts
import { EventBusService, ToolExecutionService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/agents/base-agent.d.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/agents/qa-bot/qa-bot.agent.ts
import { EventBusService, KnowledgeGraphService, QdrantService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/agents/qa-bot/qa-bot.agent.d.ts
import { EventBusService, KnowledgeGraphService, QdrantService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/agents/base-agent.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/tool-execution-coordinator.service.ts
import { EventBusService, DatabaseService, redisCacheService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/toolRegistry.js
import { ToolService, } from '@uaip/shared-services';
backend/services/capability-registry/src/services/unified-tool-registry.ts
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/sandbox-execution.service.js
import { EventBusService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/index.d.ts
import { BaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/enterprise-tool-registry.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
import { SERVICE_ACCESS_MATRIX, validateServiceAccess, AccessLevel } from '@uaip/shared-services';
backend/services/capability-registry/src/services/mcpClientService.d.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/enterprise-tool-registry.d.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/sandbox-execution.service.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/tool-cache.service.ts
import { redisCacheService, DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/tool-cache.service.js
import { redisCacheService, DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/mcpResourceDiscoveryService.ts
import { RedisCacheService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/conversation-enhancement.service.ts
import { DatabaseService, EventBusService, LLMRequestTracker } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-event-orchestrator.service.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/conversation-enhancement.service.js
import { LLMRequestTracker } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-intent.service.ts
import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-intent.service.d.ts
import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-planning.service.ts
import { DatabaseService, EventBusService, KnowledgeGraphService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-metrics.service.ts
import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-metrics.service.d.ts
import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-discussion.service.js
import { LLMRequestTracker, ThoughtParserService, } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-planning.service.d.ts
import { DatabaseService, EventBusService, KnowledgeGraphService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-event-orchestrator.service.d.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-learning.service.d.ts
import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-core.service.d.ts
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/index.d.ts
import { BaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/unified-tool-registry.js
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/conversation-enhancement.service.d.ts
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-initialization.service.d.ts
import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService, PersonaService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/project-tool-integration.service.ts
import { EventBusService, DatabaseService, ProjectManagementService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/enterprise-tool-registry.js
import { SERVICE_ACCESS_MATRIX, validateServiceAccess, AccessLevel } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/conversation-intelligence.service.d.ts
import { EventBusService, UserKnowledgeService, QdrantService, EmbeddingService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/toolExecutor.d.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/services/discussionOrchestrationService.js
import { ParticipantManagementService, } from '@uaip/shared-services';
backend/services/capability-registry/src/services/tool-recommendation.service.js
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-context.service.ts
import { EventBusService, KnowledgeGraphService, SERVICE_ACCESS_MATRIX } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/services/eventDrivenDiscussionService.d.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-core.service.js
import { validateServiceAccess, AccessLevel, PersonaService, } from '@uaip/shared-services';
backend/services/capability-registry/src/services/project-tool-integration.service.js
import { ProjectManagementService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-discussion.service.d.ts
import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService, DiscussionService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-core.service.ts
import { DatabaseService, EventBusService, Repository, validateServiceAccess, AccessLevel, PersonaService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-discussion.service.ts
import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService, DiscussionService, LLMRequestTracker, ThoughtParserService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/mcpClientService.ts
import { EventBusService, DatabaseService, ToolGraphDatabase, SecurityLevel } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/conversation-intelligence.service.ts
import { EventBusService, UserKnowledgeService, QdrantService, EmbeddingService } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/services/discussionOrchestrationService.ts
import { DiscussionService, EventBusService, ParticipantManagementService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/mcpResourceDiscoveryService.d.ts
import { RedisCacheService } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-context.service.d.ts
import { EventBusService, KnowledgeGraphService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/oauthCapabilityDiscovery.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/integration/oauth-flow.integration.test.js
import { OAuthProviderEntity, Agent as AgentEntity, UserEntity, AgentOAuthConnectionEntity, OAuthStateEntity, } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/services/eventDrivenDiscussionService.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/project-tool-integration.service.d.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/integration/oauth-flow.integration.test.ts
import { OAuthProviderEntity, Agent as AgentEntity, UserEntity, AgentOAuthConnectionEntity, OAuthStateEntity } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/services/conversationEnhancementService.ts
import { ConversationUtils } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-initialization.service.ts
import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService, PersonaService } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/integration/security-validation.integration.test.ts
import { Agent as AgentEntity, UserEntity, SecurityPolicy as SecurityPolicyEntity, AuditEvent as AuditLogEntity, SessionEntity } from '@uaip/shared-services';
backend/services/capability-registry/src/services/tool-execution-coordinator.service.ts
import { EventBusService, DatabaseService, redisCacheService } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/services/discussionOrchestrationService.d.ts
import { DiscussionService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/**tests**/integration/security-validation.integration.test.js
import { Agent as AgentEntity, UserEntity, SecurityPolicy as SecurityPolicyEntity, AuditEvent as AuditLogEntity, } from '@uaip/shared-services';
backend/services/agent-intelligence/src/services/agent-learning.service.ts
import { DatabaseService, EventBusService, KnowledgeGraphService, AgentMemoryService } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/services/conversationEnhancementService.js
import { ConversationUtils } from '@uaip/shared-services';
backend/services/agent-intelligence/src/index.js
import { BaseService, DiscussionService, PersonaService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/toolRegistry.js
import { ToolService, } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/index.js
import { BaseService } from '@uaip/shared-services';
import { DiscussionService, PersonaService } from '@uaip/shared-services';
import { SERVICE_ACCESS_MATRIX, validateServiceAccess, getDatabaseConnectionString, AccessLevel, } from '@uaip/shared-services';
backend/services/agent-intelligence/src/index.ts
import { BaseService, DiscussionService, PersonaService } from '@uaip/shared-services';
backend/services/security-gateway/src/index.d.ts
import { BaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/unified-tool-registry.ts
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/sandbox-execution.service.js
import { EventBusService } from '@uaip/shared-services';
backend/services/marketplace-service/src/index.refactored.js
import { BaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/enterprise-tool-registry.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
import { SERVICE_ACCESS_MATRIX, validateServiceAccess, AccessLevel } from '@uaip/shared-services';
backend/services/capability-registry/src/services/mcpClientService.d.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
backend/services/marketplace-service/src/routes/marketplaceRoutes.js
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/enhancedSecurityGatewayService.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/enterprise-tool-registry.d.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/handlers/debateHandler.js
import { DebateOrchestratorService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/approvalWorkflowService.d.ts
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';
backend/services/marketplace-service/src/routes/marketplaceRoutes.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/handlers/debateHandler.ts
import { EventBusService, DebateOrchestratorService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/sandbox-execution.service.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/marketplace-service/src/index.refactored.ts
import { BaseService, ServiceConfig } from '@uaip/shared-services';
backend/services/security-gateway/src/services/securityGatewayService.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/handlers/debateHandler.d.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/marketplace-service/src/index.ts
import { BaseService, ServiceConfig } from '@uaip/shared-services';
backend/services/marketplace-service/src/index.refactored.d.ts
import { BaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/modelService.js
import { LLMModelRepository } from '@uaip/shared-services';
backend/services/discussion-orchestration/src/index.ts
import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { DiscussionService, PersonaService } from '@uaip/shared-services';
import { SERVICE_ACCESS_MATRIX, validateServiceAccess, getDatabaseConnectionString, AccessLevel } from '@uaip/shared-services';
backend/services/marketplace-service/src/index.js
import { BaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/tool-cache.service.ts
import { redisCacheService, DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/mcpResourceDiscoveryService.ts
import { RedisCacheService } from '@uaip/shared-services';
backend/services/capability-registry/src/index.js
import { BaseService } from '@uaip/shared-services';
import { ToolGraphDatabase, IntegrationService } from '@uaip/shared-services';
backend/services/marketplace-service/src/services/marketplaceService.d.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/services/tool-cache.service.js
import { redisCacheService, DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/index.ts
import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { ToolGraphDatabase, DatabaseService, IntegrationService } from '@uaip/shared-services';
backend/services/capability-registry/src/controllers/capabilityController.d.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/capability-registry/src/controllers/capabilityController.ts
import { CapabilityDiscoveryService, SecurityValidationService, DatabaseService } from '@uaip/shared-services';
backend/services/marketplace-service/src/entities/marketplaceRating.entity.js
import { BaseEntity } from '@uaip/shared-services';
backend/services/security-gateway/src/services/apiKeyDecryptionHandler.d.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
backend/services/marketplace-service/src/entities/marketplaceRating.entity.d.ts
import { BaseEntity } from '@uaip/shared-services';
backend/services/marketplace-service/src/entities/marketplaceItem.entity.js
import { BaseEntity } from '@uaip/shared-services';
backend/services/marketplace-service/src/entities/marketplaceItem.entity.ts
import { BaseEntity } from '@uaip/shared-services';
backend/services/marketplace-service/src/services/marketplaceService.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/marketplace-service/src/entities/marketplaceInstallation.entity.ts
import { BaseEntity } from '@uaip/shared-services';
backend/services/marketplace-service/src/entities/marketplaceInstallation.entity.js
import { BaseEntity } from '@uaip/shared-services';
backend/services/marketplace-service/src/entities/marketplaceRating.entity.ts
import { BaseEntity } from '@uaip/shared-services';
backend/services/marketplace-service/src/entities/marketplaceItem.entity.d.ts
import { BaseEntity } from '@uaip/shared-services';
backend/services/security-gateway/src/services/oauthProviderService.ts
import { OAuthService } from '@uaip/shared-services';
backend/services/marketplace-service/src/entities/marketplaceInstallation.entity.d.ts
import { BaseEntity } from '@uaip/shared-services';
backend/services/security-gateway/src/services/approvalWorkflowService.ts
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/modelService.ts
import { LLMModel, LLMModelRepository } from '@uaip/shared-services';
backend/services/security-gateway/src/services/llmProviderManagementService.js
import { LLMProviderRepository, DatabaseService, } from '@uaip/shared-services';
backend/services/security-gateway/src/services/enhancedAuthService.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/oauthProviderService.js
import { OAuthService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/llmProviderManagementService.ts
import { LLMProviderRepository, LLMProvider, DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/llmProviderManagementService.d.ts
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/apiKeyDecryptionHandler.ts
import { EventBusService, DatabaseService } from '@uaip/shared-services';
import { UserLLMProvider } from '@uaip/shared-services';
backend/services/security-gateway/src/index.ts
import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { initializeServices } from '@uaip/shared-services';
backend/services/security-gateway/src/services/enhancedSecurityGatewayService.d.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/apiKeyDecryptionHandler.js
import { UserLLMProvider } from '@uaip/shared-services';
backend/services/security-gateway/src/index.js
import { BaseService } from '@uaip/shared-services';
import { initializeServices } from '@uaip/shared-services';
backend/services/security-gateway/src/services/notificationService.ts
import { DatabaseService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/securityGatewayService.d.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/audit.elysia.ts
import { AuditService as DomainAuditService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/enhancedAuthService.d.ts
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/approval.elysia.ts
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/auditService.ts
import { AuditService as DomainAuditService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/persona.elysia.js
import { DatabaseService, DefaultUserLLMProviderSeed } from '@uaip/shared-services';
backend/services/security-gateway/src/http/users.elysia.ts
import { UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/services/auditService.js
import { AuditService as DomainAuditService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/knowledge.elysia.ts
import { servicesHealthCheck, getUserKnowledgeService, type UserKnowledgeService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/knowledge.elysia.js
import { servicesHealthCheck, getUserKnowledgeService, } from '@uaip/shared-services';
backend/services/security-gateway/src/http/tool-preferences.elysia.js
import { UserToolPreferencesService, DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/security.elysia.js
import { SecurityService, EventBusService, AuditService as DomainAuditService, DatabaseService, } from '@uaip/shared-services';
backend/services/security-gateway/src/http/approval.elysia.js
import { DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/providers.elysia.js
import { EventBusService, UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/providers.elysia.ts
import { EventBusService, UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/security.elysia.ts
import { SecurityService, EventBusService, AuditService as DomainAuditService, DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/tool-preferences.elysia.ts
import { UserToolPreferencesService, DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/projects.elysia.js
import { ProjectManagementService, DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/contacts.elysia.js
import { DatabaseService, ContactStatus as RepoContactStatus, } from '@uaip/shared-services';
backend/services/security-gateway/src/http/oauth.elysia.js
import { DatabaseService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/auth.elysia.ts
import { UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/audit.elysia.js
import { AuditService as DomainAuditService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/users.elysia.js
import { UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/auth.elysia.js
import { UserService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/persona.elysia.ts
import { DatabaseService, DefaultUserLLMProviderSeed } from '@uaip/shared-services';
backend/services/security-gateway/src/http/contacts.elysia.ts
import { DatabaseService, ContactStatus as RepoContactStatus, ContactType } from '@uaip/shared-services';
import { ContactStatus } from '@uaip/shared-services';
backend/services/security-gateway/src/http/projects.elysia.ts
import { ProjectManagementService, DatabaseService, EventBusService } from '@uaip/shared-services';
backend/services/security-gateway/src/http/oauth.elysia.ts
import { DatabaseService } from '@uaip/shared-services';
