import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import { TaskService } from '@uaip/shared-services'
import { logger } from '@uaip/utils'

import { TaskController } from './controllers/task_controller.js'
import { registerProjectRoutes } from './routes/project_routes.js'
import { registerTaskRoutes } from './routes/task_routes.js'

let taskController: TaskController

export const orchestrationFeature: Feature = {
  name: 'orchestration-pipeline',

  async initialize(_deps: ServiceDeps): Promise<void> {
    const taskService = TaskService.getInstance()
    taskController = new TaskController(taskService)
    logger.info('orchestration-pipeline feature initialized')
  },

  routes(app) {
    registerProjectRoutes(app)
    registerTaskRoutes(app, taskController)
    return app
  },
}
