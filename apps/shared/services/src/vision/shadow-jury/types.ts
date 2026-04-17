export type ModelTier = 'trivial' | 'medium' | 'complex';

export interface TierThresholds {
  readonly trivialMax: number;
  readonly mediumMax: number;
}

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  trivialMax: 20,
  mediumMax: 60,
};

export type ModelId = string;

export interface ShadowJuryConfig {
  readonly enabled: boolean;
  readonly shadowModelIds: ReadonlyArray<ModelId>;
  readonly maxParallelShadows: number;
  readonly metascoreEndpoint: string;
  readonly logToAuditEvents: boolean;
}

export interface ShadowJuryTurnResult {
  readonly turnId: string;
  readonly agentId: string;
  readonly primaryModelId: ModelId;
  readonly primaryResponse: string;
  readonly shadowResults: ReadonlyArray<ShadowModelResult>;
  readonly winnerModelId: ModelId;
  readonly evaluatedAt: Date;
}

export interface ShadowModelResult {
  readonly modelId: ModelId;
  readonly response: string;
  readonly metaScore: number;
  readonly metaScoreBreakdown: Record<string, number>;
  readonly latencyMs: number;
  readonly estimatedCostUsdCents: number;
}

export interface SmallestViableModelConfig {
  readonly tierThresholds: TierThresholds;
  readonly tierToModels: Record<ModelTier, ReadonlyArray<ModelId>>;
  readonly agentMinimumTierOverrides: Record<string, ModelTier>;
}

export interface TokenBudgetConfig {
  readonly workflowBudgetUsdCents: number;
  readonly downgradeTriggerPercent: number;
  readonly downgradeTo: ModelTier;
}

export interface TokenBudgetState {
  readonly workflowId: string;
  readonly spentUsdCents: number;
  readonly budgetUsdCents: number;
  readonly currentTier: ModelTier;
  readonly downgradeTriggered: boolean;
  readonly downgradeTriggeredAt: Date | null;
}

export interface RegressionCanaryResult {
  readonly runId: string;
  readonly modelId: ModelId;
  readonly goldenTestsPassed: number;
  readonly goldenTestsFailed: number;
  readonly averageMetaScore: number;
  readonly regressionDetected: boolean;
  readonly regressionDetails: ReadonlyArray<{
    readonly testCaseId: string;
    readonly expectedBehavior: string;
    readonly actualBehavior: string;
    readonly metaScoreDelta: number;
  }>;
  readonly completedAt: Date;
}

export type ModelRoutingDecision =
  | {
      readonly strategy: 'smallest-viable';
      readonly complexityScore: number;
      readonly resolvedTier: ModelTier;
      readonly selectedModelId: ModelId;
      readonly budgetDowngradeApplied: boolean;
    }
  | {
      readonly strategy: 'agent-static';
      readonly agentConfiguredModelId: ModelId;
      readonly selectedModelId: ModelId;
    };
