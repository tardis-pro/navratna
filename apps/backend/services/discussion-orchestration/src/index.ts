import { BaseService } from '@uaip/shared-services';
import { FeatureFactory } from '@uaip/shared-services/feature-factory';
import { logger } from '@uaip/utils';
import { discussionFeature } from './feature.js';

class DiscussionOrchestrationServiceApp extends BaseService {
  private factory = new FeatureFactory().register(discussionFeature);

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
    await this.factory.initialize({
      eventBusService: this.eventBusService,
      databaseService: this.databaseService,
    });
    logger.info('discussion-orchestration: services initialized');
  }

  protected async setupRoutes(): Promise<void> {
    this.factory.mountRoutes(this.app);
    this.app.get('/health', () => ({
      status: 'ok',
      service: 'discussion-orchestration',
      version: '1.0.0',
    }));
    logger.info('discussion-orchestration: routes configured');
  }

  protected async setupEventSubscriptions(): Promise<void> {
    await this.factory.subscribeEvents(this.eventBusService);
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
