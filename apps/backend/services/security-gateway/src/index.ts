import { BaseService } from '@uaip/shared-services'
import { FeatureFactory } from '@uaip/shared-services/feature-factory'
import { logger } from '@uaip/utils'
import { securityFeature } from './feature.js'

class SecurityGatewayService extends BaseService {
  private factory = new FeatureFactory().register(securityFeature)

  constructor() {
    super({
      name: 'security-gateway',
      port: parseInt(process.env.SECURITY_GATEWAY_PORT || '3004', 10),
      version: '1.0.0',
      enableEnterpriseEventBus: true,
    })
    this.registerEntities([])
  }

  protected async initialize(): Promise<void> {
    await this.factory.initialize({ eventBusService: this.eventBusService })
    logger.info('security-gateway: services initialized')
  }

  protected async setupRoutes(): Promise<void> {
    this.factory.mountRoutes(this.app)
    this.app.get('/health', () => ({
      status: 'ok',
      service: 'security-gateway',
      features: this.factory.activeFeatureNames,
    }))
    logger.info('security-gateway: routes configured')
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.factory.subscribeEvents(this.eventBusService)
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true
  }
}

const service = new SecurityGatewayService()
service.start().catch((error) => {
  logger.error('Failed to start security-gateway', { error })
  process.exit(1)
})
