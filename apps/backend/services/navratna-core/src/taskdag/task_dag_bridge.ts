import type { EventBusMessage } from '@uaip/types'
import { logger, isRecord } from '@uaip/utils'
import {
  TASKDAG_BUS_EVENTS,
  TASKDAG_SOCKET_SUBSCRIBE,
  TASKDAG_SOCKET_UNSUBSCRIBE,
} from './task_dag_types.js'
import type {
  TaskDAGClientSocket,
  TaskDAGCompletedPayload,
  TaskDAGCreatedPayload,
  TaskDAGEventBus,
  TaskDAGFailedPayload,
  TaskDAGNodeStatus,
  TaskDAGSocketServer,
  TaskDAGStepCompletedPayload,
} from './task_dag_types.js'

const MAX_DAG_ID_LENGTH = 128

function roomFor(dagId: string): string {
  return `taskdag.${dagId}`
}

/** Extracts a safe dagId from a socket payload ({ dagId }) — null on anything malformed. */
function extractDagId(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const dagId = payload.dagId
  if (typeof dagId !== 'string') return null
  const trimmed = dagId.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_DAG_ID_LENGTH) return null
  return trimmed
}

function toNodeStatuses(value: unknown): TaskDAGNodeStatus[] {
  if (!Array.isArray(value)) return []
  const statuses: TaskDAGNodeStatus[] = []
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.id === 'string' && typeof entry.status === 'string') {
      statuses.push({ id: entry.id, status: entry.status })
    }
  }
  return statuses
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * Bridges TaskDAGService's BullMQ bus events ('taskdag.created',
 * 'taskdag.step.completed', 'taskdag.completed', 'taskdag.failed') to the
 * Socket.IO room `taskdag.${dagId}` so TaskDAGView receives live updates.
 *
 * Room membership is managed through the DEDICATED events
 * 'subscribe_taskdag' / 'unsubscribe_taskdag' ({ dagId }) — never through the
 * generic 'subscribe' event, which is owned by the coding-agent and streaming
 * handlers and carries a plain string sessionId.
 */
export class TaskDAGSocketBridge {
  private io: TaskDAGSocketServer | undefined

  setIO(io: TaskDAGSocketServer): void {
    this.io = io
    io.on('connection', (socket) => this.registerSocketHandlers(socket))
  }

  registerSocketHandlers(socket: TaskDAGClientSocket): void {
    socket.on(TASKDAG_SOCKET_SUBSCRIBE, (payload: unknown) => {
      try {
        const dagId = extractDagId(payload)
        if (!dagId) {
          logger.warn('TaskDAGSocketBridge: ignoring malformed subscribe_taskdag payload', {
            socketId: socket.id,
          })
          return
        }
        socket.join(roomFor(dagId))
        logger.info('TaskDAGSocketBridge: socket joined DAG room', {
          socketId: socket.id,
          room: roomFor(dagId),
        })
      } catch (error) {
        logger.error('TaskDAGSocketBridge: subscribe_taskdag handler error', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    socket.on(TASKDAG_SOCKET_UNSUBSCRIBE, (payload: unknown) => {
      try {
        const dagId = extractDagId(payload)
        if (!dagId) return
        socket.leave(roomFor(dagId))
      } catch (error) {
        logger.error('TaskDAGSocketBridge: unsubscribe_taskdag handler error', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  async subscribeToBus(bus: TaskDAGEventBus): Promise<void> {
    await bus.subscribe(TASKDAG_BUS_EVENTS.created, async (message) =>
      this.forward(message, TASKDAG_BUS_EVENTS.created, (data, dagId) => {
        const payload: TaskDAGCreatedPayload = {
          dagId,
          goal: asString(data.goal, ''),
          nodeCount: typeof data.nodeCount === 'number' ? data.nodeCount : 0,
          edgeCount: typeof data.edgeCount === 'number' ? data.edgeCount : 0,
          timestamp: asString(data.timestamp, new Date().toISOString()),
        }
        return payload
      })
    )

    await bus.subscribe(TASKDAG_BUS_EVENTS.stepCompleted, async (message) =>
      this.forward(message, TASKDAG_BUS_EVENTS.stepCompleted, (data, dagId) => {
        const payload: TaskDAGStepCompletedPayload = {
          dagId,
          taskId: asString(data.taskId, ''),
          status: asString(data.status, 'pending'),
          batchIndex: typeof data.batchIndex === 'number' ? data.batchIndex : 0,
          result: data.result,
          error: typeof data.error === 'string' ? data.error : null,
          timestamp: asString(data.timestamp, new Date().toISOString()),
        }
        return payload
      })
    )

    await bus.subscribe(TASKDAG_BUS_EVENTS.completed, async (message) =>
      this.forward(message, TASKDAG_BUS_EVENTS.completed, (data, dagId) => {
        const payload: TaskDAGCompletedPayload = {
          dagId,
          goal: asString(data.goal, ''),
          status: asString(data.status, 'completed'),
          nodeStatuses: toNodeStatuses(data.nodeStatuses),
          timestamp: asString(data.timestamp, new Date().toISOString()),
        }
        return payload
      })
    )

    // 'taskdag.failed' is published with two different shapes (batch-failure vs
    // exception path in TaskDAGService.executeDAG). Normalise to ONE canonical
    // shape here — see TaskDAGFailedPayload.
    await bus.subscribe(TASKDAG_BUS_EVENTS.failed, async (message) =>
      this.forward(message, TASKDAG_BUS_EVENTS.failed, (data, dagId) => {
        const payload: TaskDAGFailedPayload = {
          dagId,
          goal: asString(data.goal, ''),
          status: 'failed',
          error: typeof data.error === 'string' ? data.error : null,
          nodeStatuses: toNodeStatuses(data.nodeStatuses),
          timestamp: asString(data.timestamp, new Date().toISOString()),
        }
        return payload
      })
    )

    logger.info('TaskDAGSocketBridge: subscribed to taskdag.* bus events')
  }

  private forward(
    message: EventBusMessage,
    eventName: string,
    buildPayload: (data: Record<string, unknown>, dagId: string) => unknown
  ): void {
    try {
      const data = message.data
      if (!isRecord(data) || typeof data.dagId !== 'string' || data.dagId.length === 0) {
        logger.warn('TaskDAGSocketBridge: dropping bus event without a usable dagId', {
          eventName,
        })
        return
      }
      if (!this.io) {
        logger.warn('TaskDAGSocketBridge: Socket.IO server not bound yet — dropping event', {
          eventName,
          dagId: data.dagId,
        })
        return
      }
      this.io.to(roomFor(data.dagId)).emit(eventName, buildPayload(data, data.dagId))
    } catch (error) {
      logger.error('TaskDAGSocketBridge: failed to forward bus event', {
        eventName,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
