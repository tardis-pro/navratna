import { BaseService, TaskService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { TaskController } from './controllers/task_controller.js';
import { registerProjectRoutes } from './routes/project_routes.js';
import { registerTaskRoutes } from './routes/task_routes.js';

class OrchestrationPipelineService extends BaseService {
  private taskService!: TaskService;
  private taskController!: TaskController;

  constructor() {
    super({
      name: 'orchestration-pipeline',
      port: parseInt(process.env.ORCHESTRATION_PIPELINE_PORT || '3002', 10),
      version: '1.0.0',
      enableEnterpriseEventBus: true,
    });
    this.registerEntities([]);
  }

  protected async initialize(): Promise<void> {
    this.taskService = TaskService.getInstance();
    this.taskController = new TaskController(this.taskService);
    logger.info('orchestration-pipeline: services initialized');
  }

  protected async setupRoutes(): Promise<void> {
    registerProjectRoutes(this.app);
    registerTaskRoutes(this.app, this.taskController);

    this.app.get('/health', () => ({
      status: 'ok',
      service: 'orchestration-pipeline',
      version: '1.0.0',
    }));

    logger.info('orchestration-pipeline: routes configured');
  }

  protected async checkServiceHealth(): Promise<boolean> {
    return true;
  }
}

const service = new OrchestrationPipelineService();
service.start().catch((error) => {
  logger.error('Failed to start orchestration-pipeline', { error });
  process.exit(1);
});
