export const MEMORY_CONSOLIDATION_REQUEST = 'memory.consolidation.request' as const;
export const MEMORY_CONSOLIDATION_RESULT = 'memory.consolidation.result' as const;

export interface MemoryConsolidationRequestEvent {
  readonly agentId: string;
  readonly requestId: string;
  readonly requestedAt: string;
}

export interface MemoryConsolidationResultEvent {
  readonly agentId: string;
  readonly requestId: string;
  readonly consolidated: boolean;
  readonly episodesCreated?: number;
  readonly conceptsLearned?: number;
  readonly connectionsFormed?: number;
  readonly reason?: string;
  readonly completedAt: string;
}
