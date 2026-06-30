import type { Feature } from '@uaip/shared-services/feature-factory'
import { registerCapabilityRoutes } from './routes/capability_routes.js'
import { registerMCPRoutes } from './routes/mcp_routes.js'
import { registerHealthRoutes } from './routes/health_routes.js'
import { registerToolRoutes } from './routes/tool_routes.js'
import { registerWorkspaceRoutes } from './routes/workspace_routes.js'
import { registerFederationRoutes } from './routes/federation_routes.js'
import { registerCanvaRoutes } from './routes/canva_routes.js'
import { FederationRegistryService } from './services/federation_registry_service.js'

export const capabilityFeature: Feature = {
  name: 'capability-registry',

  async initialize(deps) {
    const federation = FederationRegistryService.getInstance()
    await federation.initialize({ eventBusService: deps?.eventBusService })
  },

  routes(app) {
    app.use(registerCapabilityRoutes())
    app.use(registerMCPRoutes())
    app.use(registerHealthRoutes())
    app.use(registerToolRoutes())
    app.use(registerWorkspaceRoutes())
    app.use(registerFederationRoutes())
    app.use(registerCanvaRoutes())
    return app
  },
}
