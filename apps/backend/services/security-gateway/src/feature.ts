import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import { logger } from '@uaip/utils'
import { Elysia } from 'elysia'

import { registerAuthRoutes } from './http/auth_elysia.js'
import { registerUserRoutes } from './http/users_elysia.js'
import { registerApprovalRoutes } from './http/approval_elysia.js'
import { registerAuditRoutes } from './http/audit_elysia.js'
import { registerSecurityRoutes } from './http/security_elysia.js'
import { registerSecurityStatsRoutes } from './http/security_stats_elysia.js'
import { registerProviderRoutes } from './http/providers_elysia.js'
import { registerOAuthRoutes } from './http/oauth_elysia.js'
import { registerPersonaRoutes } from './http/persona_elysia.js'
import { registerKnowledgeRoutes } from './http/knowledge_elysia.js'
import { registerContactRoutes } from './http/contacts_elysia.js'
import { registerProjectRoutes } from './http/projects_elysia.js'
import { registerToolPreferenceRoutes } from './http/tool_preferences_elysia.js'
import { registerDashboardRoutes } from './http/dashboard_elysia.js'
import { registerOIDCRoutes } from './http/oidc_elysia.js'
import { registerOrganizationRoutes } from './http/organizations_elysia.js'
import { registerLLMAgentProviderRoutes } from './routes/llm_agent_provider_routes.js'
import { ErasureSweepJob } from './jobs/erasure_sweep_job.js'
import { AuditRetentionJob } from './jobs/audit_retention_job.js'
import { TokenCleanupJob } from './jobs/token_cleanup_job.js'
import { CrossTenantProbeJob } from './jobs/cross_tenant_probe_job.js'

let erasureSweepJob: ErasureSweepJob | null = null
let auditRetentionJob: AuditRetentionJob | null = null
let tokenCleanupJob: TokenCleanupJob | null = null
let crossTenantProbeJob: CrossTenantProbeJob | null = null

export const securityFeature: Feature = {
  name: 'security-gateway',

  async initialize(_deps: ServiceDeps): Promise<void> {
    erasureSweepJob = new ErasureSweepJob()
    try {
      await erasureSweepJob.start()
    } catch (err) {
      logger.error('security-gateway: ErasureSweepJob failed to start', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    auditRetentionJob = new AuditRetentionJob()
    try {
      await auditRetentionJob.start()
    } catch (err) {
      logger.error('security-gateway: AuditRetentionJob failed to start', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    tokenCleanupJob = new TokenCleanupJob()
    try {
      await tokenCleanupJob.start()
    } catch (err) {
      logger.error('security-gateway: TokenCleanupJob failed to start', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    crossTenantProbeJob = new CrossTenantProbeJob()
    try {
      await crossTenantProbeJob.initialize()
    } catch (err) {
      logger.error('security-gateway: CrossTenantProbeJob failed to start', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    logger.info('security-gateway GDPR cron jobs started')
  },

  routes<TApp extends Elysia>(app: TApp): TApp {
    app.use(registerAuthRoutes())
    app.use(registerUserRoutes())
    app.use(registerApprovalRoutes())
    app.use(registerAuditRoutes())
    app.use(registerSecurityRoutes())
    app.use(registerSecurityStatsRoutes())
    app.use(registerProviderRoutes())
    app.use(registerOAuthRoutes())
    app.use(registerPersonaRoutes())
    app.use(registerKnowledgeRoutes())
    app.use(registerContactRoutes())
    app.use(registerProjectRoutes())
    app.use(registerToolPreferenceRoutes())
    app.use(registerDashboardRoutes())
    app.use(registerOIDCRoutes())
    app.use(registerOrganizationRoutes())
    app.use(registerLLMAgentProviderRoutes())
    // GitHub webhooks are now mounted by orchestration-pipeline (HMAC-SHA256
    // verified, gated on GITHUB_WEBHOOK_SECRET). jira_webhook_routes.ts remains
    // unmounted until its signature verification is implemented.
    return app
  },

  async shutdown(): Promise<void> {
    if (erasureSweepJob !== null) {
      try {
        await erasureSweepJob.stop()
      } catch (err) {
        logger.error('security-gateway: ErasureSweepJob failed to stop', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      erasureSweepJob = null
    }

    if (auditRetentionJob !== null) {
      try {
        await auditRetentionJob.stop()
      } catch (err) {
        logger.error('security-gateway: AuditRetentionJob failed to stop', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      auditRetentionJob = null
    }

    if (tokenCleanupJob !== null) {
      try {
        await tokenCleanupJob.stop()
      } catch (err) {
        logger.error('security-gateway: TokenCleanupJob failed to stop', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      tokenCleanupJob = null
    }

    if (crossTenantProbeJob !== null) {
      try {
        await crossTenantProbeJob.stop()
      } catch (err) {
        logger.error('security-gateway: CrossTenantProbeJob failed to stop', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
      crossTenantProbeJob = null
    }
  },
}
