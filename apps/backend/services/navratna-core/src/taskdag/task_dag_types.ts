import type { EventBusMessage } from '@uaip/types'

/** Bus event names published by TaskDAGService (apps/shared/services/src/cognitive/task_d_a_g_service.ts). */
export const TASKDAG_BUS_EVENTS = {
  created: 'taskdag.created',
  stepCompleted: 'taskdag.step.completed',
  completed: 'taskdag.completed',
  failed: 'taskdag.failed',
} as const

/** Dedicated socket event names — the generic 'subscribe'/'unsubscribe' handlers
 * (coding_agent_socket_handler.ts / streaming_handler.ts) expect a string sessionId
 * and must not be reused for DAG subscriptions. */
export const TASKDAG_SOCKET_SUBSCRIBE = 'subscribe_taskdag'
export const TASKDAG_SOCKET_UNSUBSCRIBE = 'unsubscribe_taskdag'

export interface TaskDAGNodeStatus {
  id: string
  status: string
}

export interface TaskDAGCreatedPayload {
  dagId: string
  goal: string
  nodeCount: number
  edgeCount: number
  timestamp: string
}

export interface TaskDAGStepCompletedPayload {
  dagId: string
  taskId: string
  status: string
  batchIndex: number
  result: unknown
  error: string | null
  timestamp: string
}

export interface TaskDAGCompletedPayload {
  dagId: string
  goal: string
  status: string
  nodeStatuses: TaskDAGNodeStatus[]
  timestamp: string
}

/**
 * Canonical 'taskdag.failed' payload. The service publishes two shapes:
 *  - batch-failure path: { dagId, goal, status, nodeStatuses, timestamp } (no error)
 *  - exception path:     { dagId, goal, error, timestamp } (no status/nodeStatuses)
 * The bridge normalises both to this single shape so socket consumers never branch:
 * `error` is null on the batch path, `nodeStatuses` is [] on the exception path.
 */
export interface TaskDAGFailedPayload {
  dagId: string
  goal: string
  status: 'failed'
  error: string | null
  nodeStatuses: TaskDAGNodeStatus[]
  timestamp: string
}

/** Structural subset of EventBusService the bridge needs (test-friendly). */
export interface TaskDAGEventBus {
  subscribe(eventType: string, handler: (message: EventBusMessage) => Promise<void>): Promise<void>
}

/** Structural subset of a socket.io room broadcast operator. */
export interface TaskDAGRoomEmitter {
  emit(event: string, payload: unknown): unknown
}

/** Structural subset of socket.io Server used by the bridge (test-friendly). */
export interface TaskDAGSocketServer {
  to(room: string): TaskDAGRoomEmitter
  on(event: 'connection', listener: (socket: TaskDAGClientSocket) => void): unknown
}

/** Structural subset of a connected socket.io Socket used by the bridge. */
export interface TaskDAGClientSocket {
  id: string
  join(room: string): unknown
  leave(room: string): unknown
  on(event: string, listener: (payload: unknown) => void): unknown
}
