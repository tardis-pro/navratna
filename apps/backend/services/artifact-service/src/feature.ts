import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import { logger } from '@uaip/utils'

import { ArtifactService } from './artifact_service.js'
import { registerArtifactRoutes } from './routes/artifact_routes.js'
import { registerShortLinkRoutes } from './routes/short_link_routes.js'

let artifactService: ArtifactService

export const artifactFeature: Feature = {
  name: 'artifact-service',

  async initialize(deps: ServiceDeps): Promise<void> {
    artifactService = new ArtifactService(deps.eventBusService)
    await artifactService.initialize()
    logger.info('artifact-service feature initialized')
  },

  routes(app) {
    app.use(registerArtifactRoutes(artifactService))
    app.use(registerShortLinkRoutes())
    return app
  },
}
