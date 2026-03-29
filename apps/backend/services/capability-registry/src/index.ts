import { BaseService } from '@uaip/shared-services'
import { FeatureFactory } from '@uaip/shared-services/feature-factory'
import { logger } from '@uaip/utils'
import { capabilityFeature } from './feature.js'

class CapabilityRegistryService extends BaseService {
  private factory = new FeatureFactory().register(capabilityFeature)

  constructor() {
    super({
      name: 'capability-registry',
      port: parseInt(process.env.CAPABILITY_REGISTRY_PORT || '3003', 10),
      version: '1.0.0',
      enableNeo4j: true,
      enableEnterpriseEventBus: true,
    })
    this.registerEntities([])
  }

  protected async initialize(): Promise<void> {
    await this.factory.initialize({ eventBusService: this.eventBusService })
    logger.info('capability-registry: services initialized')
  }

  protected async setupRoutes(): Promise<void> {
    this.factory.mountRoutes(this.app)
    this.app.get('/health', () => ({
      status: 'ok',
      service: 'capability-registry',
      features: this.factory.activeFeatureNames,
    }))
    logger.info('capability-registry: routes configured')
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.factory.subscribeEvents(this.eventBusService)
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true
  }
}

const service = new CapabilityRegistryService()
service.start().catch((error) => {
  logger.error('Failed to start capability-registry', { error })
  process.exit(1)
})
