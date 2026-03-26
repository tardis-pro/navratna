import { BaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { registerCapabilityRoutes } from './routes/capability_routes.js';
import { registerHealthRoutes } from './routes/health_routes.js';
import { registerMCPRoutes } from './routes/mcp_routes.js';
import { registerToolRoutes } from './routes/tool_routes.js';
import { registerWorkspaceRoutes } from './routes/workspace_routes.js';

class CapabilityRegistryService extends BaseService {
  constructor() {
    super({
      name: 'capability-registry',
      port: parseInt(process.env.CAPABILITY_REGISTRY_PORT || '3003', 10),
      version: '1.0.0',
      enableNeo4j: true,
      enableEnterpriseEventBus: true,
    });
    this.registerEntities([]);
  }

  protected async initialize(): Promise<void> {
    logger.info('capability-registry: services initialized');
  }

  protected async setupRoutes(): Promise<void> {
    registerCapabilityRoutes(this.app);
    registerHealthRoutes(this.app);
    registerMCPRoutes(this.app);
    registerToolRoutes(this.app);
    registerWorkspaceRoutes(this.app);

    this.app.get('/health', () => ({
      status: 'ok',
      service: 'capability-registry',
      version: '1.0.0',
    }));

    logger.info('capability-registry: routes configured');
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }
}

const service = new CapabilityRegistryService();
service.start().catch((error) => {
  logger.error('Failed to start capability-registry', { error });
  process.exit(1);
});
