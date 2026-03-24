import { BaseService } from '@uaip/shared-services';
import { LLMService, UserLLMService, ModelBootstrapService } from '@uaip/llm-service';
import { logger } from '@uaip/utils';

import { registerAgentRoutes } from '../../agent-intelligence/src/routes/agent.routes.js';
import { registerConstellationRoutes } from '../../agent-intelligence/src/routes/constellation.routes.js';
import { ArtifactService } from '../../artifact-service/src/ArtifactService.js';
import { registerArtifactRoutes } from '../../artifact-service/src/routes/artifactRoutes.js';
import { registerShortLinkRoutes } from '../../artifact-service/src/routes/shortLinkRoutes.js';
import { registerLLMRoutes } from '../../llm-service/src/routes/llm.routes.js';
import { registerUserLLMRoutes } from '../../llm-service/src/routes/user-llm.routes.js';

class NavratnaCoreService extends BaseService {
  private artifactService!: ArtifactService;
  private llmService!: LLMService;
  private userLLMService!: UserLLMService;
  private modelBootstrapService!: ModelBootstrapService;

  constructor() {
    super({
      name: 'navratna-core',
      port: parseInt(process.env.NAVRATNA_CORE_PORT || '3001', 10),
      version: '3.0.0',
      enableWebSocket: true,
      enableNeo4j: true,
      enableEnterpriseEventBus: true,
    });
    this.registerEntities([]);
  }

  protected async initialize(): Promise<void> {
    this.artifactService = new ArtifactService(this.eventBusService);
    await this.artifactService.initialize();

    this.llmService = LLMService.getInstance();
    this.userLLMService = new UserLLMService(this.modelSelectionFacade);
    this.modelBootstrapService = ModelBootstrapService.getInstance();

    logger.info('navratna-core services initialized');
  }

  protected async setupRoutes(): Promise<void> {
    registerAgentRoutes(this.app);
    registerConstellationRoutes(this.app);
    registerArtifactRoutes(this.app, this.artifactService);
    registerShortLinkRoutes(this.app);
    registerLLMRoutes(this.app, this.llmService, this.modelBootstrapService, this.userLLMService);
    registerUserLLMRoutes(this.app, this.userLLMService);

    this.app.get('/health', () => ({
      status: 'ok',
      service: 'navratna-core',
      consolidates: ['agent-intelligence', 'discussion-orchestration', 'artifact-service', 'llm-service'],
    }));

    logger.info('navratna-core routes configured');
  }

  protected async setupEventSubscriptions(): Promise<void> {
    logger.info('navratna-core event subscriptions configured');
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }
}

const service = new NavratnaCoreService();
service.start().catch((error) => {
  logger.error('Failed to start navratna-core', { error });
  process.exit(1);
});
