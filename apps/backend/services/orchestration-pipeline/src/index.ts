import { BaseService } from '@uaip/shared-services'
import { FeatureFactory } from '@uaip/shared-services/feature-factory'
import { logger } from '@uaip/utils'
import { orchestrationFeature } from './feature.js'

class OrchestrationPipelineService extends BaseService {
  private factory = new FeatureFactory().register(orchestrationFeature)

  constructor() {
    super({
      name: 'orchestration-pipeline',
      port: parseInt(process.env.ORCHESTRATION_PIPELINE_PORT || '3002', 10),
      version: '1.0.0',
      enableEnterpriseEventBus: true,
    })
    this.registerEntities([])
  }

  protected async initialize(): Promise<void> {
    await this.factory.initialize({ eventBusService: this.eventBusService })
    logger.info('orchestration-pipeline: services initialized')
  }

  protected async setupRoutes(): Promise<void> {
    this.factory.mountRoutes(this.app)
    this.app.get('/health', () => ({
      status: 'ok',
      service: 'orchestration-pipeline',
      features: this.factory.activeFeatureNames,
    }))
    logger.info('orchestration-pipeline: routes configured')
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.factory.subscribeEvents(this.eventBusService)
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true
  }
}

const service = new OrchestrationPipelineService()
service.start().catch((error) => {
  logger.error('Failed to start orchestration-pipeline', { error })
  process.exit(1)
})
