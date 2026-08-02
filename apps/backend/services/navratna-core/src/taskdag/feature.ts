import type { Server as SocketIOServer } from 'socket.io'
import type { Feature, ServiceDeps } from '@uaip/shared-services/feature-factory'
import type { EventBusService } from '@uaip/shared-services'
import { TaskDAGService } from '@uaip/shared-services'
import { logger } from '@uaip/utils'
import { TaskDAGSocketBridge } from './task_dag_bridge.js'
import { registerTaskDAGRoutes } from './task_dag_routes.js'

let taskDAGService: TaskDAGService | undefined
const bridge = new TaskDAGSocketBridge()

export const taskDAGFeature = {
  name: 'task-dag',

  async initialize(deps: ServiceDeps): Promise<void> {
    taskDAGService = new TaskDAGService(deps.eventBusService)
    logger.info('task-dag feature initialized')
  },

  routes(app) {
    // FeatureFactory mounts routes even when initialize() threw, so
    // taskDAGService may be undefined here — the registrar guards with a 503.
    app.use(registerTaskDAGRoutes(taskDAGService))
    return app
  },

  async events(bus: EventBusService): Promise<void> {
    await bridge.subscribeToBus(bus)
  },

  websocket(io) {
    bridge.setIO(io as SocketIOServer)
    logger.info('task-dag: TaskDAGSocketBridge bound to io')
  },
} satisfies Feature
