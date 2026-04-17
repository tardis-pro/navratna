import type {
  ShadowJuryConfig,
  ShadowJuryTurnResult,
  ModelId,
} from './types.js';

export class ShadowJuryService {
  constructor(private readonly config: ShadowJuryConfig) {}

  async evaluateTurn(
    turnId: string,
    agentId: string,
    primaryModelId: ModelId,
    primaryResponse: string,
    prompt: string,
  ): Promise<ShadowJuryTurnResult> {
    throw new Error('Not implemented — FOLLOW-UP-F');
  }

  async getQualityDistribution(
    agentId: string,
    modelId: ModelId,
    since: Date,
  ): Promise<{ averageMetaScore: number; turnCount: number }> {
    throw new Error('Not implemented — FOLLOW-UP-F');
  }
}
