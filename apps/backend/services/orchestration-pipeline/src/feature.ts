import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import { EnsureSystemActor, EventBusService, TaskService } from '@uaip/shared-services'
import { logger } from '@uaip/utils'

import { TaskController } from './controllers/task_controller.js'
import { registerApprovalRoutes } from './routes/approval_routes.js'
import { registerTaskRoutes } from './routes/task_routes.js'
import { registerWorkflowRoutes } from './routes/workflow_routes.js'
import { registerGitHubWebhookRoutes } from './routes/github_webhook_routes.js'
import { RDLOApprovalService } from './services/rdlo_approval_service.js'
import { WorkflowEngineService } from './services/workflow_engine_service.js'
import { WorkflowExecutorService } from './services/workflow_executor_service.js'

let taskController: TaskController
let workflowEngineService: WorkflowEngineService
let workflowExecutorService: WorkflowExecutorService
let rdloApprovalService: RDLOApprovalService

export const orchestrationFeature: Feature = {
  name: 'orchestration-pipeline',

  async initialize(deps: ServiceDeps): Promise<void> {
    // DIAGNOSTIC ONLY — FeatureFactory swallows init errors and mounts routes
    // anyway. Enforcement is CrossPlaneGuard in createOperation.
    try {
      await new EnsureSystemActor().verify()
    } catch (error) {
      logger.error('orchestration-pipeline: system actor missing — operation writes will be rejected', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const taskService = TaskService.getInstance()
    const eventBusService = deps.eventBusService ?? EventBusService.getInstance()
    taskController = new TaskController(taskService)
    workflowEngineService = new WorkflowEngineService(eventBusService)
    workflowExecutorService = new WorkflowExecutorService(eventBusService)
    rdloApprovalService = new RDLOApprovalService(eventBusService)

    // Consume the scheduled workflow triggers the engine registers — without this the
    // cron jobs fire into a queue nobody reads.
    await workflowExecutorService.initialize()
    await workflowEngineService.loadAll()
    await rdloApprovalService.initialize()
    logger.info('orchestration-pipeline feature initialized')
  },

  routes(app) {
    app.use(registerApprovalRoutes(rdloApprovalService))
    app.use(registerTaskRoutes(taskController))
    app.use(registerWorkflowRoutes(workflowEngineService))
    // GitHub webhook receiver (push/PR/check_run → CI monitor). HMAC-SHA256
    // signature verification is enforced per-request; only mount it when the
    // shared secret is configured so an unconfigured deploy doesn't expose a
    // route that fails on every request.
    if (process.env.GITHUB_WEBHOOK_SECRET) {
      app.use(registerGitHubWebhookRoutes())
    } else {
      logger.warn('orchestration-pipeline: GITHUB_WEBHOOK_SECRET not set — GitHub webhook route not mounted')
    }
    return app
  },
}
