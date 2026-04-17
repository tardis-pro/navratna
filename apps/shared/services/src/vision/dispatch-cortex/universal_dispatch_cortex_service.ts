import type {
  DispatchRequest,
  PEORLoopState,
  CortexEvent,
} from './types.js';

export interface CortexEventPublisher {
  publish(event: CortexEvent): Promise<void>;
}

export class UniversalDispatchCortexService {
  constructor(private readonly eventPublisher: CortexEventPublisher) {}

  async dispatch(request: DispatchRequest): Promise<PEORLoopState> {
    throw new Error('Not implemented — FOLLOW-UP-P');
  }

  async getLoopState(loopId: string): Promise<PEORLoopState | null> {
    throw new Error('Not implemented — FOLLOW-UP-P');
  }

  async cancelLoop(loopId: string, reason: string): Promise<void> {
    throw new Error('Not implemented — FOLLOW-UP-P');
  }
}
