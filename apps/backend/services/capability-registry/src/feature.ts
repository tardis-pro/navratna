import type { Feature } from '@uaip/shared-services/feature-factory'
import { registerCapabilityRoutes } from './routes/capability_routes.js'
import { registerMCPRoutes } from './routes/mcp_routes.js'
import { registerHealthRoutes } from './routes/health_routes.js'
import { registerToolRoutes } from './routes/tool_routes.js'
import { registerWorkspaceRoutes } from './routes/workspace_routes.js'

export const capabilityFeature: Feature = {
  name: 'capability-registry',

  routes(app) {
    registerCapabilityRoutes(app)
    registerMCPRoutes(app)
    registerHealthRoutes(app)
    registerToolRoutes(app)
    registerWorkspaceRoutes(app)
    return app
  },
}
