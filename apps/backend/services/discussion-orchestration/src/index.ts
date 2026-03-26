import { BaseService, getDatabaseConnectionString } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { DiscussionOrchestrationService } from './services/discussion_orchestration_service.js';
import { DiscussionService } from './services/discussion_service.js';
import { PersonaService } from './services/persona_service.js';

class DiscussionOrchestrationServiceApp extends BaseService {
  private orchestrationService!: DiscussionOrchestrationService;
  private discussionService!: DiscussionService;
  private personaService!: PersonaService;

  constructor() {
    super({
      name: 'discussion-orchestration',
      port: parseInt(process.env.DISCUSSION_ORCHESTRATION_PORT || '3005', 10),
      version: '1.0.0',
      enableEnterpriseEventBus: true,
    });
    this.registerEntities([]);
  }

  protected async initialize(): Promise<void> {
    this.personaService = new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      cacheConfig: {
        redis: getDatabaseConnectionString(
          'discussion-orchestration',
          'redis',
          'redis-application'
        ),
        ttl: 300,
        securityLevel: 3,
      },
    });

    this.discussionService = new DiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      personaService: this.personaService,
      enableRealTimeEvents: true,
      enableAnalytics: false,
      auditMode: 'comprehensive',
    });

    this.orchestrationService = new DiscussionOrchestrationService(
      this.discussionService,
      this.eventBusService
    );

    logger.info('discussion-orchestration: services initialized');
  }

  protected async setupRoutes(): Promise<void> {
    this.app.get('/health', () => ({
      status: 'ok',
      service: 'discussion-orchestration',
      version: '1.0.0',
    }));

    logger.info('discussion-orchestration: routes configured');
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }
}

const service = new DiscussionOrchestrationServiceApp();
service.start().catch((error) => {
  logger.error('Failed to start discussion-orchestration', { error });
  process.exit(1);
});
