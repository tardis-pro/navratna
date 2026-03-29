import { BaseService } from '@uaip/shared-services'
import { FeatureFactory } from '@uaip/shared-services/feature-factory'
import { logger } from '@uaip/utils'
import { artifactFeature } from './feature.js'

class ArtifactServiceApp extends BaseService {
  private factory = new FeatureFactory().register(artifactFeature)

  constructor() {
    super({
      name: 'artifact-service',
      port: parseInt(process.env.ARTIFACT_SERVICE_PORT || '3006', 10),
      version: '1.0.0',
      enableEnterpriseEventBus: true,
    })
    this.registerEntities([])
  }

  protected async initialize(): Promise<void> {
    await this.factory.initialize({ eventBusService: this.eventBusService })
    logger.info('artifact-service: services initialized')
  }

  protected async setupRoutes(): Promise<void> {
    this.factory.mountRoutes(this.app)
    this.app.get('/health', () => ({
      status: 'ok',
      service: 'artifact-service',
      features: this.factory.activeFeatureNames,
    }))
    logger.info('artifact-service: routes configured')
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.factory.subscribeEvents(this.eventBusService)
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true
  }
}

const service = new ArtifactServiceApp()
service.start().catch((error) => {
  logger.error('Failed to start artifact-service', { error })
  process.exit(1)
})
