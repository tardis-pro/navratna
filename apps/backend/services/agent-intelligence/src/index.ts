import { BaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { registerAgentRoutes } from './routes/agent_routes.js';
import { registerConstellationRoutes } from './routes/constellation_routes.js';

class AgentIntelligenceService extends BaseService {
  constructor() {
    super({
      name: 'agent-intelligence',
      port: parseInt(process.env.AGENT_INTELLIGENCE_PORT || '3001', 10),
      version: '1.0.0',
      enableWebSocket: false,
      enableNeo4j: true,
      enableEnterpriseEventBus: true,
    });
  }

  protected async initialize(): Promise<void> {
    logger.info('agent-intelligence: services initialized');
  }

  protected async setupRoutes(): Promise<void> {
    registerAgentRoutes(this.app);
    registerConstellationRoutes(this.app);
    this.app.get('/health', () => ({
      status: 'ok',
      service: 'agent-intelligence',
      version: '1.0.0',
    }));
    logger.info('agent-intelligence: routes configured');
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }
}

const service = new AgentIntelligenceService();
service.start().catch((error) => {
  logger.error('Failed to start agent-intelligence', { error });
  process.exit(1);
});
