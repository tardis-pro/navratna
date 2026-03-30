import type { Feature } from '@uaip/shared-services/feature-factory'
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
import { registerToolPreferenceRoutes } from './http/tool_preferences_elysia.js'
import { registerDashboardRoutes } from './http/dashboard_elysia.js'

export const securityFeature: Feature = {
  name: 'security-gateway',

  routes<TApp extends Elysia>(app: TApp): TApp {
    registerAuthRoutes(app)
    registerUserRoutes(app)
    registerApprovalRoutes(app)
    registerAuditRoutes(app)
    registerSecurityRoutes(app)
    registerSecurityStatsRoutes(app)
    registerProviderRoutes(app)
    registerOAuthRoutes(app)
    registerPersonaRoutes(app)
    registerKnowledgeRoutes(app)
    registerContactRoutes(app)
    registerToolPreferenceRoutes(app)
    registerDashboardRoutes(app)
    return app
  },
}
