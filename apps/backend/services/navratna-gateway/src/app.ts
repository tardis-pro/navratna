import { Elysia } from 'elysia'

import { registerAuthRoutes } from '../../security-gateway/src/http/auth_elysia.js'
import { registerUserRoutes } from '../../security-gateway/src/http/users_elysia.js'
import { registerApprovalRoutes } from '../../security-gateway/src/http/approval_elysia.js'
import { registerAuditRoutes } from '../../security-gateway/src/http/audit_elysia.js'
import { registerSecurityRoutes } from '../../security-gateway/src/http/security_elysia.js'
import { registerSecurityStatsRoutes } from '../../security-gateway/src/http/security_stats_elysia.js'
import { registerProviderRoutes } from '../../security-gateway/src/http/providers_elysia.js'
import { registerOAuthRoutes } from '../../security-gateway/src/http/oauth_elysia.js'
import { registerPersonaRoutes } from '../../security-gateway/src/http/persona_elysia.js'
import { registerKnowledgeRoutes } from '../../security-gateway/src/http/knowledge_elysia.js'
import { registerContactRoutes } from '../../security-gateway/src/http/contacts_elysia.js'
import { registerToolPreferenceRoutes } from '../../security-gateway/src/http/tool_preferences_elysia.js'
import { registerDashboardRoutes } from '../../security-gateway/src/http/dashboard_elysia.js'
import { registerProjectRoutes as registerSecurityProjectRoutes } from '../../security-gateway/src/http/projects_elysia.js'
import { registerProjectRoutes as registerOrchestrationProjectRoutes } from '../../orchestration-pipeline/src/routes/project_routes.js'
import { registerTaskRoutes } from '../../orchestration-pipeline/src/routes/task_routes.js'
import { registerWorkflowRoutes } from '../../orchestration-pipeline/src/routes/workflow_routes.js'
import { registerCapabilityRoutes } from '../../capability-registry/src/routes/capability_routes.js'
import { registerMCPRoutes } from '../../capability-registry/src/routes/mcp_routes.js'
import { registerHealthRoutes } from '../../capability-registry/src/routes/health_routes.js'
import { registerToolRoutes } from '../../capability-registry/src/routes/tool_routes.js'
import { registerWorkspaceRoutes } from '../../capability-registry/src/routes/workspace_routes.js'
import { registerGitHubWebhookRoutes } from '../../orchestration-pipeline/src/routes/github_webhook_routes.js'
import { registerJiraWebhookRoutes } from '../../orchestration-pipeline/src/routes/jira_webhook_routes.js'

export const gatewayApp = new Elysia({ name: 'navratna-gateway' })
  .get('/health', () => ({ status: 'ok' as 'ok' | 'degraded', service: 'navratna-gateway', features: [] as string[] }))
  .use(registerAuthRoutes(new Elysia()))
  .use(registerUserRoutes(new Elysia()))
  .use(registerApprovalRoutes(new Elysia()))
  .use(registerAuditRoutes(new Elysia()))
  .use(registerSecurityRoutes(new Elysia()))
  .use(registerSecurityStatsRoutes(new Elysia()))
  .use(registerProviderRoutes(new Elysia()))
  .use(registerOAuthRoutes(new Elysia()))
  .use(registerPersonaRoutes(new Elysia()))
  .use(registerKnowledgeRoutes(new Elysia()))
  .use(registerContactRoutes(new Elysia()))
  .use(registerToolPreferenceRoutes(new Elysia()))
  .use(registerDashboardRoutes(new Elysia()))
  .use(registerSecurityProjectRoutes(new Elysia()))
  .use(registerOrchestrationProjectRoutes(new Elysia()))
  .use(registerTaskRoutes(new Elysia(), null as never))
  .use(registerWorkflowRoutes(new Elysia(), null as never))
  .use(registerCapabilityRoutes(new Elysia()))
  .use(registerMCPRoutes(new Elysia()))
  .use(registerHealthRoutes(new Elysia()))
  .use(registerToolRoutes(new Elysia()))
  .use(registerWorkspaceRoutes(new Elysia()))
  .use(registerGitHubWebhookRoutes(new Elysia()))
  .use(registerJiraWebhookRoutes(new Elysia()))

export type NavratnaGatewayApp = typeof gatewayApp
