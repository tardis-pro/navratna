import type {
  LiveMetaScoreRecord,
  MetaScoreMiddlewareConfig,
  BadEquilibriumEvent,
  BadEquilibriumType,
  MetaScoreBreakdown,
} from './types.js';

export interface MetaScoreStorage {
  saveRecord(record: LiveMetaScoreRecord): Promise<void>;
  getAgentRecords(agentId: string, since: Date): Promise<ReadonlyArray<LiveMetaScoreRecord>>;
}

export interface BadEquilibriumEventPublisher {
  publish(event: BadEquilibriumEvent): Promise<void>;
}

export class MetaScoreMiddleware {
  constructor(
    private readonly config: MetaScoreMiddlewareConfig,
    private readonly storage: MetaScoreStorage,
    private readonly badEquilibriumPublisher: BadEquilibriumEventPublisher,
  ) {}

  async scoreAgentTurnAsync(
    turnId: string,
    agentId: string,
    userId: string,
    prompt: string,
    response: string,
  ): Promise<void> {
    throw new Error('Not implemented — FOLLOW-UP-T');
  }

  detectBadEquilibria(breakdown: MetaScoreBreakdown): ReadonlyArray<BadEquilibriumType> {
    const detected: BadEquilibriumType[] = [];

    if (breakdown.overconfidencePenalty > this.config.badEquilibriumOverconfidenceThreshold) {
      detected.push('confident-liar');
    }

    if (breakdown.unnecessaryAbstentionPenalty > this.config.badEquilibriumAbstentionThreshold) {
      detected.push('timid-bureaucrat');
    }

    return detected;
  }

  shouldSample(): boolean {
    return Math.random() < this.config.samplingRate;
  }
}
