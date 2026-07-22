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
    if (!this.config.enabled || !this.shouldSample()) {
      return;
    }

    const promptLength = Math.max(1, prompt.trim().length);
    const responseLength = response.trim().length;
    const lengthRatio = Math.min(1, responseLength / (promptLength * 2));
    const breakdown: MetaScoreBreakdown = {
      actionAppropriateness: lengthRatio,
      calibrationQuality: 1 - Math.min(1, Math.abs(responseLength - promptLength) / (promptLength * 4)),
      answerAccuracy: lengthRatio,
      clarificationQuality: prompt.includes('?') ? 0.8 : 0.6,
      selfErrorDetection: response.toLowerCase().includes('error') ? 0.8 : 0.5,
      beliefUpdating: response.toLowerCase().includes('update') ? 0.8 : 0.5,
      overconfidencePenalty: response.includes('always') || response.includes('never') ? 0.7 : 0,
      unnecessaryAbstentionPenalty: response.toLowerCase().includes('cannot answer') ? 0.7 : 0,
      total: lengthRatio,
    };
    const badEquilibria = this.detectBadEquilibria(breakdown);
    const record: LiveMetaScoreRecord = {
      recordId: `${turnId}:${Date.now()}`,
      turnId,
      agentId,
      userId,
      metaScore: breakdown,
      scoredAt: new Date(),
      latencyMs: 0,
      badEquilibria,
    };

    await this.storage.saveRecord(record);
    await Promise.all(
      badEquilibria.map((equilibriumType) =>
        this.badEquilibriumPublisher.publish({
          eventId: `${record.recordId}:${equilibriumType}`,
          agentId,
          turnId,
          equilibriumType,
          penaltyScore: equilibriumType === 'confident-liar'
            ? breakdown.overconfidencePenalty
            : breakdown.unnecessaryAbstentionPenalty,
          detectedAt: record.scoredAt,
        })
      )
    );
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
