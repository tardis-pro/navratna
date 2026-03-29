import { BaseService } from '@uaip/shared-services'
import { FeatureFactory } from '@uaip/shared-services/feature-factory'
import { logger } from '@uaip/utils'
import { llmFeature } from './feature.js'

class LLMServiceApp extends BaseService {
  private factory = new FeatureFactory().register(llmFeature)

  constructor() {
    super({
      name: 'llm-service',
      port: parseInt(process.env.LLM_SERVICE_PORT || '3007', 10),
      version: '1.0.0',
      enableEnterpriseEventBus: true,
    })
    this.registerEntities([])
  }

  protected async initialize(): Promise<void> {
    await this.factory.initialize({ eventBusService: this.eventBusService })
    logger.info('llm-service: services initialized')
  }

  protected async setupRoutes(): Promise<void> {
    this.factory.mountRoutes(this.app)
    this.app.get('/health', () => ({
      status: 'ok',
      service: 'llm-service',
      features: this.factory.activeFeatureNames,
    }))
    logger.info('llm-service: routes configured')
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.factory.subscribeEvents(this.eventBusService)
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true
  }
}

const service = new LLMServiceApp()
service.start().catch((error) => {
  logger.error('Failed to start llm-service', { error })
  process.exit(1)
})
