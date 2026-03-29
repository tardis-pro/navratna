import { BaseService } from '@uaip/shared-services'
import { FeatureFactory } from '@uaip/shared-services/feature-factory'
import { logger } from '@uaip/utils'
import { agentIntelligenceFeature } from './feature.js'

class AgentIntelligenceService extends BaseService {
  private factory = new FeatureFactory().register(agentIntelligenceFeature)

  constructor() {
    super({
      name: 'agent-intelligence',
      port: parseInt(process.env.AGENT_INTELLIGENCE_PORT || '3001', 10),
      version: '1.0.0',
      enableNeo4j: true,
      enableEnterpriseEventBus: true,
    })
    this.registerEntities([])
  }

  protected async initialize(): Promise<void> {
    await this.factory.initialize({ eventBusService: this.eventBusService })
    logger.info('agent-intelligence: services initialized')
  }

  protected async setupRoutes(): Promise<void> {
    this.factory.mountRoutes(this.app)
    this.app.get('/health', () => ({
      status: 'ok',
      service: 'agent-intelligence',
      features: this.factory.activeFeatureNames,
    }))
    logger.info('agent-intelligence: routes configured')
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.factory.subscribeEvents(this.eventBusService)
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true
  }
}

const service = new AgentIntelligenceService()
service.start().catch((error) => {
  logger.error('Failed to start agent-intelligence', { error })
  process.exit(1)
})
