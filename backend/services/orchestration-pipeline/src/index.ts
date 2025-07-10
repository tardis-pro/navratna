import { BaseService, ServiceConfig } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { authMiddleware } from '@uaip/middleware';
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
import { createTaskRoutes } from './routes/taskRoutes.js';

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
    // Apply auth middleware to all API routes
    this.app.use('/api/v1', authMiddleware);
  }

  protected async setupRoutes(): Promise<void> {
    // Task management routes
    this.app.use('/api/v1', createTaskRoutes(this.taskController));

    // Basic orchestration endpoints
    this.app.post('/api/v1/operations', async (req, res) => {
      try {
        const operation = req.body;
        const workflowInstanceId = await this.orchestrationEngine.executeOperation(operation);
        res.json({
          success: true,
          data: { workflowInstanceId }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'EXECUTION_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    this.app.get('/api/v1/operations/:operationId/status', async (req, res) => {
      try {
        const { operationId } = req.params;
        const status = await this.orchestrationEngine.getOperationStatus(operationId);
        res.json({
          success: true,
          data: status
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'STATUS_FETCH_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    this.app.post('/api/v1/operations/:operationId/pause', async (req, res) => {
      try {
        const { operationId } = req.params;
        const { reason } = req.body;
        await this.orchestrationEngine.pauseOperation(operationId, reason);
        res.json({
          success: true,
          data: { message: 'Operation paused successfully' }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'PAUSE_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    this.app.post('/api/v1/operations/:operationId/resume', async (req, res) => {
      try {
        const { operationId } = req.params;
        const { checkpointId } = req.body;
        await this.orchestrationEngine.resumeOperation(operationId, checkpointId);
        res.json({
          success: true,
          data: { message: 'Operation resumed successfully' }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'RESUME_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
      }
    });

    this.app.post('/api/v1/operations/:operationId/cancel', async (req, res) => {
      try {
        const { operationId } = req.params;
        const { reason, compensate = true, force = false } = req.body;
        await this.orchestrationEngine.cancelOperation(operationId, reason, compensate, force);
        res.json({
          success: true,
          data: { message: 'Operation cancelled successfully' }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: 'CANCEL_FAILED',
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        });
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

export default service;
