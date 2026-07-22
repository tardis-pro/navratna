import type {
  DispatchRequest,
  PEORLoopState,
  CortexEvent,
  DispatchPlan,
} from './types.js';

export interface CortexEventPublisher {
  publish(event: CortexEvent): Promise<void>;
}

export class UniversalDispatchCortexService {
  private readonly loops = new Map<string, PEORLoopState>();

  constructor(private readonly eventPublisher: CortexEventPublisher) {}

  async dispatch(request: DispatchRequest): Promise<PEORLoopState> {
    const loopId = `loop-${request.requestId}`;
    const plan: DispatchPlan = {
      planId: `plan-${request.requestId}`,
      requestId: request.requestId,
      intentCategory: request.input.includes('?') ? 'QUERY' as const : 'COMMAND' as const,
      metaReasoningAction: request.input.trim().length === 0 ? 'clarify' as const : 'proceed' as const,
      dagId: null,
      clarificationRequired: request.input.trim().length === 0,
      clarificationQuestion: request.input.trim().length === 0 ? 'What would you like me to do?' : null,
      plannedAt: new Date(),
    };
    const state: PEORLoopState = {
      loopId,
      requestId: request.requestId,
      currentPhase: 'PLAN',
      plan,
      nodeExecutions: [],
      replanCount: 0,
      maxReplans: 3,
      finalStatus: 'in-progress',
    };

    this.loops.set(loopId, state);
    await this.eventPublisher.publish({ type: 'cortex.plan.created', plan });
    return state;
  }

  async getLoopState(loopId: string): Promise<PEORLoopState | null> {
    return this.loops.get(loopId) ?? null;
  }

  async cancelLoop(loopId: string, reason: string): Promise<void> {
    const state = this.loops.get(loopId);
    if (!state) return;

    this.loops.set(loopId, {
      ...state,
      finalStatus: 'aborted',
    });
    await this.eventPublisher.publish({ type: 'cortex.escalated', loopId, reason });
  }
}
