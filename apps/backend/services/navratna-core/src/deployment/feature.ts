/**
 * Deployment Feature Module
 *
 * FeatureFactory-compatible module that registers the deployment adapter(s),
 * orchestrator, and routes into navratna-core.
 * Toggle: FEATURE_DEPLOYMENT env var (default: ON).
 */

import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import { logger } from '@uaip/utils'
import { DeploymentOrchestrator } from './deployment_orchestrator.js'
import { FlyAdapter } from './fly_adapter.js'
import { registerDeploymentRoutes } from './deployment_routes.js'

let orchestrator: DeploymentOrchestrator

export const deploymentFeature: Feature = {
  name: 'deployment',

  async initialize(deps: ServiceDeps): Promise<void> {
    orchestrator = new DeploymentOrchestrator()
    orchestrator.setEventBus(deps.eventBusService)

    // Register platform adapters
    if (process.env.FLY_API_TOKEN) {
      orchestrator.registerAdapter('fly', new FlyAdapter())
      logger.info('deployment: Fly.io adapter registered')
    } else {
      logger.warn('deployment: FLY_API_TOKEN not set — Fly.io adapter not registered')
    }

    logger.info('deployment feature initialized')
  },

  routes(app) {
    app.use(registerDeploymentRoutes(orchestrator))
    return app
  },
}
