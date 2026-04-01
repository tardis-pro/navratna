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
  .use(registerAuthRoutes())
  .use(registerUserRoutes())
  .use(registerApprovalRoutes())
  .use(registerAuditRoutes())
  .use(registerSecurityRoutes())
  .use(registerSecurityStatsRoutes())
  .use(registerProviderRoutes())
  .use(registerOAuthRoutes())
  .use(registerPersonaRoutes())
  .use(registerKnowledgeRoutes())
  .use(registerContactRoutes())
  .use(registerToolPreferenceRoutes())
  .use(registerDashboardRoutes())
  .use(registerSecurityProjectRoutes())
  .use(registerOrchestrationProjectRoutes())
  .use(registerTaskRoutes(null as never))
  .use(registerWorkflowRoutes(null as never))
  .use(registerCapabilityRoutes())
  .use(registerMCPRoutes())
  .use(registerHealthRoutes())
  .use(registerToolRoutes())
  .use(registerWorkspaceRoutes())
  .use(registerGitHubWebhookRoutes())
  .use(registerJiraWebhookRoutes())

export type NavratnaGatewayApp = typeof gatewayApp
