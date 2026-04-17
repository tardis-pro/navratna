export interface MetaScoreBreakdown {
  readonly actionAppropriateness: number;
  readonly calibrationQuality: number;
  readonly answerAccuracy: number;
  readonly clarificationQuality: number;
  readonly selfErrorDetection: number;
  readonly beliefUpdating: number;
  readonly overconfidencePenalty: number;
  readonly unnecessaryAbstentionPenalty: number;
  readonly total: number;
}

export interface LiveMetaScoreRecord {
  readonly recordId: string;
  readonly turnId: string;
  readonly agentId: string;
  readonly userId: string;
  readonly metaScore: MetaScoreBreakdown;
  readonly scoredAt: Date;
  readonly latencyMs: number;
  readonly badEquilibria: ReadonlyArray<'confident-liar' | 'timid-bureaucrat'>;
}

export interface AgentMetaScoreTrend {
  readonly agentId: string;
  readonly windowDays: number;
  readonly averageTotal: number;
  readonly averageBreakdown: MetaScoreBreakdown;
  readonly turnCount: number;
  readonly computedAt: Date;
}

export interface AGIVitalSigns {
  readonly agentId: string;
  readonly transferLearningIndex: number;
  readonly selfCorrectionRate: number;
  readonly capabilityVelocity: number;
  readonly generalizationWidth: number;
  readonly computedAt: Date;
}

export interface SemanticDriftAlert {
  readonly alertId: string;
  readonly agentId: string;
  readonly domain: string;
  readonly driftType: 'overconfidence' | 'underconfidence';
  readonly baselineAverage: number;
  readonly currentAverage: number;
  readonly deviationPercent: number;
  readonly detectedAt: Date;
}

export type BadEquilibriumType = 'confident-liar' | 'timid-bureaucrat';

export interface BadEquilibriumEvent {
  readonly eventId: string;
  readonly agentId: string;
  readonly turnId: string;
  readonly equilibriumType: BadEquilibriumType;
  readonly penaltyScore: number;
  readonly detectedAt: Date;
}

export interface MetaScoreMiddlewareConfig {
  readonly enabled: boolean;
  readonly basebenchUrl: string;
  readonly timeoutMs: number;
  readonly badEquilibriumOverconfidenceThreshold: number;
  readonly badEquilibriumAbstentionThreshold: number;
  readonly samplingRate: number;
}
