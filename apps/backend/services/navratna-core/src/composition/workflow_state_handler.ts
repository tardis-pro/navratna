import { Server } from 'socket.io';
import { logger } from '@uaip/utils';

type EventBusSubscriber = {
  subscribe(topic: string, handler: (event: { data: unknown }) => Promise<void>): Promise<void>;
};

type WorkflowStateChangedData = {
  compositionId: string;
  workflowId: string;
  instanceId: string;
  currentState: Record<string, unknown>;
  machineState: string;
  stateVersion: number;
  updatedAt: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toWorkflowStateChangedData(data: unknown): WorkflowStateChangedData | null {
  if (!isRecord(data)) return null;
  const compositionId = typeof data['compositionId'] === 'string' ? data['compositionId'] : undefined;
  const workflowId = typeof data['workflowId'] === 'string' ? data['workflowId'] : compositionId;
  const instanceId = typeof data['instanceId'] === 'string' ? data['instanceId'] : '';
  const machineState = typeof data['machineState'] === 'string' ? data['machineState'] : 'unknown';
  const stateVersion = typeof data['stateVersion'] === 'number' ? data['stateVersion'] : 0;
  const updatedAt = typeof data['updatedAt'] === 'string' ? data['updatedAt'] : new Date().toISOString();
  const currentState = isRecord(data['currentState']) ? data['currentState'] : {};

  if (!compositionId || !workflowId) return null;

  return { compositionId, workflowId, instanceId, currentState, machineState, stateVersion, updatedAt };
}

export class WorkflowStateHandler {
  private io: Server;
  private bus: EventBusSubscriber;

  constructor(io: Server, bus: EventBusSubscriber) {
    this.io = io;
    this.bus = bus;
  }

  async subscribe(): Promise<void> {
    await this.bus.subscribe('workflow.state-changed', async (event: EventBusMessage) => {
      try {
        const payload = toWorkflowStateChangedData(event.data);
        if (!payload) {
          logger.warn('WorkflowStateHandler: invalid event data', { event });
          return;
        }

        const room = `workflow:${payload.compositionId}`;
        this.io.to(room).emit('workflow:state-change', {
          workflowId: payload.workflowId,
          instanceId: payload.instanceId,
          currentState: payload.currentState,
          machineState: payload.machineState,
          stateVersion: payload.stateVersion,
          updatedAt: payload.updatedAt,
        });

        logger.info('WorkflowStateHandler: emitted workflow:state-change', {
          compositionId: payload.compositionId,
          room,
          machineState: payload.machineState,
          stateVersion: payload.stateVersion,
        });
      } catch (error) {
        logger.error('WorkflowStateHandler: error handling workflow.state-changed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    logger.info('WorkflowStateHandler: subscribed to workflow.state-changed');
  }

  setupSocketJoin(io: Server): void {
    io.on('connection', (socket) => {
      socket.on('join:workflow', (compositionId: unknown) => {
        if (typeof compositionId !== 'string') return;
        const room = `workflow:${compositionId}`;
        socket.join(room);
        logger.info('WorkflowStateHandler: socket joined workflow room', {
          socketId: socket.id,
          room,
        });
      });

      socket.on('leave:workflow', (compositionId: unknown) => {
        if (typeof compositionId !== 'string') return;
        const room = `workflow:${compositionId}`;
        socket.leave(room);
      });
    });
  }
}
