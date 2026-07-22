import type {
  ShadowJuryConfig,
  ShadowJuryTurnResult,
  ModelId,
} from './types.js';

export class ShadowJuryService {
  private readonly results: ShadowJuryTurnResult[] = [];

  constructor(private readonly config: ShadowJuryConfig) {}

  async evaluateTurn(
    turnId: string,
    agentId: string,
    primaryModelId: ModelId,
    primaryResponse: string,
    prompt: string,
  ): Promise<ShadowJuryTurnResult> {
    const primaryScore = Math.min(1, Math.max(0, primaryResponse.trim().length / Math.max(1, prompt.length * 2)));
    const shadowResults = this.config.shadowModelIds.slice(0, this.config.maxParallelShadows).map((modelId) => ({
      modelId,
      response: primaryResponse,
      metaScore: primaryScore,
      metaScoreBreakdown: {
        responseLengthRatio: primaryScore,
      },
      latencyMs: 0,
      estimatedCostUsdCents: 0,
    }));
    const result: ShadowJuryTurnResult = {
      turnId,
      agentId,
      primaryModelId,
      primaryResponse,
      shadowResults,
      winnerModelId: shadowResults[0]?.modelId ?? primaryModelId,
      evaluatedAt: new Date(),
    };

    this.results.push(result);
    return result;
  }

  async getQualityDistribution(
    agentId: string,
    modelId: ModelId,
    since: Date,
  ): Promise<{ averageMetaScore: number; turnCount: number }> {
    const matchingScores = this.results
      .filter((result) => result.agentId === agentId && result.evaluatedAt >= since)
      .flatMap((result) => result.shadowResults.filter((shadow) => shadow.modelId === modelId))
      .map((shadow) => shadow.metaScore);

    const total = matchingScores.reduce((sum, score) => sum + score, 0);
    return {
      averageMetaScore: matchingScores.length > 0 ? total / matchingScores.length : 0,
      turnCount: matchingScores.length,
    };
  }
}
