import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import {
  StateManagerService,
  ResourceManagerService,
  StepExecutorService,
  CompensationService,
  serviceFactory,
  TaskService
} from '@uaip/shared-services';
import { OrchestrationEngine } from './orchestrationEngine.js';
import { TaskController } from './controllers/taskController.js';
import { registerTaskRoutes } from './routes/taskRoutes.js';
import { registerProjectRoutes } from './routes/projectRoutes.js';

class OrchestrationPipelineService extends BaseService {
  private stateManagerService!: StateManagerService;
  private resourceManagerService!: ResourceManagerService;
  private stepExecutorService!: StepExecutorService;
  private compensationService!: CompensationService;
  private operationManagementService: any;
  private orchestrationEngine!: OrchestrationEngine;
  private taskService!: TaskService;
  private taskController!: TaskController;

  constructor() {
    super({
      name: 'orchestration-pipeline',
      port: parseInt(process.env.PORT || '3002', 10)
    });
  }

  protected async initialize(): Promise<void> {
    // Get operation management service
    this.operationManagementService = await serviceFactory.getOperationManagementService();
    
    // Initialize services that depend on core services
    this.stateManagerService = new StateManagerService(this.databaseService);
    this.resourceManagerService = new ResourceManagerService();
    this.stepExecutorService = new StepExecutorService();
    this.compensationService = new CompensationService(this.databaseService, this.eventBusService);
    
    // Initialize orchestration engine with all dependencies
    this.orchestrationEngine = new OrchestrationEngine(
      this.databaseService,
      this.eventBusService,
      this.stateManagerService,
      this.resourceManagerService,
      this.stepExecutorService,
      this.compensationService,
      this.operationManagementService
    );

    // Initialize task service and controller
    this.taskService = TaskService.getInstance();
    this.taskController = new TaskController(this.taskService);

    logger.info('Orchestration Pipeline services initialized successfully');
  }

  protected setupCustomMiddleware(): void {
    // Auth middleware is handled at route level in Elysia
    // Authentication will be checked via headers['x-user-id'] in routes
  }

  protected async setupRoutes(): Promise<void> {
    // Task management routes
    registerTaskRoutes(this.app, this.taskController);

    // Project management routes
    registerProjectRoutes(this.app);

    // Basic orchestration endpoints
    this.app.post('/api/v1/operations', async ({ body, set }) => {
      try {
        const operation = body;
        const workflowInstanceId = await this.orchestrationEngine.executeOperation(operation);
        return {
          success: true,
          data: { workflowInstanceId }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            code: 'EXECUTION_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        };
      }
    });

    this.app.get('/api/v1/operations/:operationId/status', async ({ params, set }) => {
      try {
        const { operationId } = params;
        const status = await this.orchestrationEngine.getOperationStatus(operationId);
        return {
          success: true,
          data: status
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            code: 'STATUS_FETCH_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        };
      }
    });

    this.app.post('/api/v1/operations/:operationId/pause', async ({ params, body, set }) => {
      try {
        const { operationId } = params;
        const { reason } = body as any;
        await this.orchestrationEngine.pauseOperation(operationId, reason);
        return {
          success: true,
          data: { message: 'Operation paused successfully' }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            code: 'PAUSE_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        };
      }
    });

    this.app.post('/api/v1/operations/:operationId/resume', async ({ params, body, set }) => {
      try {
        const { operationId } = params;
        const { checkpointId } = body as any;
        await this.orchestrationEngine.resumeOperation(operationId, checkpointId);
        return {
          success: true,
          data: { message: 'Operation resumed successfully' }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            code: 'RESUME_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        };
      }
    });

    this.app.post('/api/v1/operations/:operationId/cancel', async ({ params, body, set }) => {
      try {
        const { operationId } = params;
        const { reason, compensate = true, force = false } = body as any;
        await this.orchestrationEngine.cancelOperation(operationId, reason, compensate, force);
        return {
          success: true,
          data: { message: 'Operation cancelled successfully' }
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          error: {
            code: 'CANCEL_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        };
      }
    });
  }

  protected async getHealthInfo(): Promise<any> {
    const isHealthy = await this.operationManagementService.isHealthy();
    return {
      operationManagement: isHealthy ? 'healthy' : 'unhealthy'
    };
  }

  protected async checkServiceHealth(): Promise<boolean> {
    try {
      const isHealthy = await this.operationManagementService.isHealthy();
      return isHealthy;
    } catch {
      return false;
    }
  }

  protected async cleanup(): Promise<void> {
    // The OrchestrationEngine has its own signal handlers for graceful shutdown
    // Add any additional cleanup here if needed
  }
}

// Initialize and start the service
const service = new OrchestrationPipelineService();

// Start the service
service.start().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
});

// Named export to avoid Bun auto-serve on default export
export { service, OrchestrationPipelineService };
