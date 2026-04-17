import type {
  SmallestViableModelConfig,
  TokenBudgetConfig,
  TokenBudgetState,
  ModelRoutingDecision,
  ModelTier,
  ModelId,
} from './types.js';

export class SmallestViableModelService {
  constructor(private readonly config: SmallestViableModelConfig) {}

  resolveTier(complexityScore: number, agentId: string): ModelTier {
    const override = this.config.agentMinimumTierOverrides[agentId];
    const { trivialMax, mediumMax } = this.config.tierThresholds;

    let tier: ModelTier =
      complexityScore < trivialMax
        ? 'trivial'
        : complexityScore < mediumMax
          ? 'medium'
          : 'complex';

    if (override) {
      const tierRank: Record<ModelTier, number> = {
        trivial: 0,
        medium: 1,
        complex: 2,
      };
      if (tierRank[override] > tierRank[tier]) {
        tier = override;
      }
    }

    return tier;
  }

  selectModel(tier: ModelTier): ModelId {
    const models = this.config.tierToModels[tier];
    if (!models || models.length === 0) {
      throw new Error(`No models configured for tier: ${tier}`);
    }
    return models[0] as ModelId;
  }

  buildRoutingDecision(
    complexityScore: number,
    agentId: string,
    budgetDowngradeApplied: boolean,
  ): ModelRoutingDecision {
    const resolvedTier = this.resolveTier(complexityScore, agentId);
    const selectedModelId = this.selectModel(resolvedTier);
    return {
      strategy: 'smallest-viable',
      complexityScore,
      resolvedTier,
      selectedModelId,
      budgetDowngradeApplied,
    };
  }
}

export class TokenBudgetEnforcer {
  constructor(private readonly config: TokenBudgetConfig) {}

  checkAndMaybeDowngrade(state: TokenBudgetState): TokenBudgetState {
    const spendPercent = (state.spentUsdCents / state.budgetUsdCents) * 100;
    const shouldDowngrade =
      !state.downgradeTriggered &&
      spendPercent >= this.config.downgradeTriggerPercent;

    if (!shouldDowngrade) {
      return state;
    }

    return {
      ...state,
      currentTier: this.config.downgradeTo,
      downgradeTriggered: true,
      downgradeTriggeredAt: new Date(),
    };
  }

  recordSpend(state: TokenBudgetState, spentUsdCents: number): TokenBudgetState {
    return this.checkAndMaybeDowngrade({
      ...state,
      spentUsdCents: state.spentUsdCents + spentUsdCents,
    });
  }
}
