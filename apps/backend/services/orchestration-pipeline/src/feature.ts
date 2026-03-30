import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import { EventBusService, TaskService } from '@uaip/shared-services'
import { logger } from '@uaip/utils'

import { TaskController } from './controllers/task_controller.js'
import { registerProjectRoutes } from './routes/project_routes.js'
import { registerTaskRoutes } from './routes/task_routes.js'
import { registerWorkflowRoutes } from './routes/workflow_routes.js'
import { WorkflowEngineService } from './services/workflow_engine_service.js'

let taskController: TaskController
let workflowEngineService: WorkflowEngineService

export const orchestrationFeature: Feature = {
  name: 'orchestration-pipeline',

  async initialize(_deps: ServiceDeps): Promise<void> {
    const taskService = TaskService.getInstance()
    const eventBusService = EventBusService.getInstance()
    taskController = new TaskController(taskService)
    workflowEngineService = new WorkflowEngineService(eventBusService)
    await workflowEngineService.loadAll()
    logger.info('orchestration-pipeline feature initialized')
  },

  routes(app) {
    registerProjectRoutes(app)
    registerTaskRoutes(app, taskController)
    registerWorkflowRoutes(app, workflowEngineService)
    return app
  },
}
