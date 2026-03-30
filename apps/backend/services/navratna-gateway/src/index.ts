import { BaseService } from '@uaip/shared-services'
import { FeatureFactory } from '@uaip/shared-services/feature-factory'
import { logger } from '@uaip/utils'

import { securityFeature } from '../../security-gateway/src/feature.js'
import { orchestrationFeature } from '../../orchestration-pipeline/src/feature.js'
import { capabilityFeature } from '../../capability-registry/src/feature.js'

class NavratnaGatewayService extends BaseService {
  private keepAliveTimer?: ReturnType<typeof setInterval>

  private factory = new FeatureFactory()
    .register(process.env.FEATURE_AUTH !== 'false' && securityFeature)
    .register(process.env.FEATURE_ORCHESTRATION !== 'false' && orchestrationFeature)
    .register(process.env.FEATURE_REGISTRY !== 'false' && capabilityFeature)

  constructor() {
    super({
      name: 'navratna-gateway',
      port: parseInt(process.env.NAVRATNA_GATEWAY_PORT || '3002', 10),
      version: '3.0.0',
      enableEnterpriseEventBus: true,
    })
    this.registerEntities([])
  }

  protected async initialize(): Promise<void> {
    await this.factory.initialize({
      eventBusService: this.eventBusService,
    })
    logger.info('navratna-gateway services initialized')
  }

  protected async setupRoutes(): Promise<void> {
    this.factory.mountRoutes(this.app)

    this.app.get('/health', () => ({
      status: 'ok',
      service: 'navratna-gateway',
      features: this.factory.activeFeatureNames,
    }))

    logger.info('navratna-gateway routes configured')
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.factory.subscribeEvents(this.eventBusService)
    logger.info('navratna-gateway event subscriptions configured')
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true
  }

  public override async start(): Promise<void> {
    await super.start()
    if (!this.keepAliveTimer) {
      this.keepAliveTimer = setInterval(() => {}, 60_000)
    }
  }

  protected override async cleanup(): Promise<void> {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = undefined
    }
  }
}

const service = new NavratnaGatewayService()
service.start().catch((error) => {
  logger.error('Failed to start navratna-gateway', { error })
  process.exit(1)
})
