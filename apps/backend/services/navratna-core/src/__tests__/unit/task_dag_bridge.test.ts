import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EventBusMessage } from '@uaip/types'
import { TaskDAGSocketBridge } from '../../taskdag/task_dag_bridge.js'
import {
  TASKDAG_BUS_EVENTS,
  TASKDAG_SOCKET_SUBSCRIBE,
  TASKDAG_SOCKET_UNSUBSCRIBE,
} from '../../taskdag/task_dag_types.js'
import type { TaskDAGClientSocket, TaskDAGSocketServer } from '../../taskdag/task_dag_types.js'

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  isRecord: (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v),
}))

type BusHandler = (message: EventBusMessage) => Promise<void>

function makeBusMessage(type: string, data: unknown): EventBusMessage {
  return {
    id: 'evt_test',
    type,
    source: 'test',
    data,
    timestamp: new Date(),
    version: '1.0',
  }
}

function makeStubs() {
  const busHandlers = new Map<string, BusHandler>()
  const bus = {
    subscribe: vi.fn(async (eventType: string, handler: BusHandler) => {
      busHandlers.set(eventType, handler)
    }),
  }

  const emit = vi.fn()
  const io: TaskDAGSocketServer = {
    to: vi.fn(() => ({ emit })),
    on: vi.fn(),
  }

  const socketHandlers = new Map<string, (payload: unknown) => void>()
  const socket: TaskDAGClientSocket = {
    id: 'socket-1',
    join: vi.fn(),
    leave: vi.fn(),
    on: vi.fn((event: string, listener: (payload: unknown) => void) => {
      socketHandlers.set(event, listener)
    }),
  }

  return { bus, busHandlers, io, emit, socket, socketHandlers }
}

describe('TaskDAGSocketBridge', () => {
  let stubs: ReturnType<typeof makeStubs>
  let bridge: TaskDAGSocketBridge

  beforeEach(() => {
    stubs = makeStubs()
    bridge = new TaskDAGSocketBridge()
  })

  it('re-emits taskdag.step.completed to the taskdag.<id> room with the canonical payload', async () => {
    bridge.setIO(stubs.io)
    await bridge.subscribeToBus(stubs.bus)

    const handler = stubs.busHandlers.get(TASKDAG_BUS_EVENTS.stepCompleted)
    expect(handler).toBeDefined()

    await handler!(
      makeBusMessage(TASKDAG_BUS_EVENTS.stepCompleted, {
        dagId: 'dag-123',
        taskId: 'task-1',
        status: 'completed',
        batchIndex: 0,
        result: { ok: true },
        timestamp: '2026-08-01T00:00:00.000Z',
      })
    )

    expect(stubs.io.to).toHaveBeenCalledWith('taskdag.dag-123')
    expect(stubs.emit).toHaveBeenCalledWith(TASKDAG_BUS_EVENTS.stepCompleted, {
      dagId: 'dag-123',
      taskId: 'task-1',
      status: 'completed',
      batchIndex: 0,
      result: { ok: true },
      error: null,
      timestamp: '2026-08-01T00:00:00.000Z',
    })
  })

  it('normalises BOTH taskdag.failed publish shapes to the single canonical payload', async () => {
    bridge.setIO(stubs.io)
    await bridge.subscribeToBus(stubs.bus)
    const handler = stubs.busHandlers.get(TASKDAG_BUS_EVENTS.failed)
    expect(handler).toBeDefined()

    // Exception path shape: { dagId, goal, error, timestamp } — no status/nodeStatuses
    await handler!(
      makeBusMessage(TASKDAG_BUS_EVENTS.failed, {
        dagId: 'dag-err',
        goal: 'do the thing',
        error: 'boom',
        timestamp: '2026-08-01T00:00:01.000Z',
      })
    )
    expect(stubs.io.to).toHaveBeenCalledWith('taskdag.dag-err')
    expect(stubs.emit).toHaveBeenCalledWith(TASKDAG_BUS_EVENTS.failed, {
      dagId: 'dag-err',
      goal: 'do the thing',
      status: 'failed',
      error: 'boom',
      nodeStatuses: [],
      timestamp: '2026-08-01T00:00:01.000Z',
    })

    // Batch-failure path shape: { dagId, goal, status, nodeStatuses, timestamp } — no error
    await handler!(
      makeBusMessage(TASKDAG_BUS_EVENTS.failed, {
        dagId: 'dag-batch',
        goal: 'other thing',
        status: 'failed',
        nodeStatuses: [{ id: 'n1', status: 'failed' }],
        timestamp: '2026-08-01T00:00:02.000Z',
      })
    )
    expect(stubs.emit).toHaveBeenCalledWith(TASKDAG_BUS_EVENTS.failed, {
      dagId: 'dag-batch',
      goal: 'other thing',
      status: 'failed',
      error: null,
      nodeStatuses: [{ id: 'n1', status: 'failed' }],
      timestamp: '2026-08-01T00:00:02.000Z',
    })
  })

  it('ignores bus events without a usable dagId instead of emitting', async () => {
    bridge.setIO(stubs.io)
    await bridge.subscribeToBus(stubs.bus)
    const handler = stubs.busHandlers.get(TASKDAG_BUS_EVENTS.stepCompleted)

    await expect(handler!(makeBusMessage(TASKDAG_BUS_EVENTS.stepCompleted, { taskId: 't' }))).resolves.toBeUndefined()
    await expect(handler!(makeBusMessage(TASKDAG_BUS_EVENTS.stepCompleted, 'not-an-object'))).resolves.toBeUndefined()
    expect(stubs.emit).not.toHaveBeenCalled()
  })

  it('subscribe_taskdag with a malformed payload never throws and never joins a room', () => {
    bridge.registerSocketHandlers(stubs.socket)
    const subscribeHandler = stubs.socketHandlers.get(TASKDAG_SOCKET_SUBSCRIBE)
    expect(subscribeHandler).toBeDefined()

    expect(() => subscribeHandler!(undefined)).not.toThrow()
    expect(() => subscribeHandler!(null)).not.toThrow()
    expect(() => subscribeHandler!('taskdag.raw-string')).not.toThrow()
    expect(() => subscribeHandler!({})).not.toThrow()
    expect(() => subscribeHandler!({ dagId: 42 })).not.toThrow()
    expect(() => subscribeHandler!({ dagId: '' })).not.toThrow()
    expect(() => subscribeHandler!({ channel: 'taskdag.x' })).not.toThrow()
    expect(stubs.socket.join).not.toHaveBeenCalled()
  })

  it('subscribe_taskdag/unsubscribe_taskdag with a valid { dagId } joins and leaves the room', () => {
    bridge.registerSocketHandlers(stubs.socket)

    stubs.socketHandlers.get(TASKDAG_SOCKET_SUBSCRIBE)!({ dagId: 'dag-9' })
    expect(stubs.socket.join).toHaveBeenCalledWith('taskdag.dag-9')

    stubs.socketHandlers.get(TASKDAG_SOCKET_UNSUBSCRIBE)!({ dagId: 'dag-9' })
    expect(stubs.socket.leave).toHaveBeenCalledWith('taskdag.dag-9')
  })
})
