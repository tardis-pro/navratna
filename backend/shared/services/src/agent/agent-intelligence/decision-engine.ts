import { ActionRecommendation, AgentAnalysis, ToolDefinition, SecurityLevel } from '@uaip/types';
import { CapabilityResolver } from './capability-resolver.js';
import { AgentStateMachine } from '../../agent-state/agent-state-machine.js';
import { AgentEventBus } from '../../observability/agent-event-bus.js';
import { logger } from '@uaip/utils';

export interface DecisionResult {
  selectedAction: ActionRecommendation | null;
  resolvedCapabilities: ToolDefinition[];
  confidence: number;
  reasoning: string;
  executionPlan?: {
    steps: Array<{ tool: ToolDefinition; parameters: any }>;
    estimatedDuration: number;
  };
}

export class DecisionEngine {
  constructor(
    private capabilityResolver: CapabilityResolver,
    private stateMachine: AgentStateMachine,
    private eventBus?: AgentEventBus
  ) {}

  async selectAction(
    analysis: AgentAnalysis,
    availableActions: ActionRecommendation[]
  ): Promise<DecisionResult> {
    const startTime = Date.now();
    const agentId = this.stateMachine.getContext().stateMetadata?.agentId as string;

    try {
      // Check agent state can execute
      if (!this.stateMachine.canExecute()) {
        return {
          selectedAction: null,
          resolvedCapabilities: [],
          confidence: 0,
          reasoning: `Agent in error state: ${this.stateMachine.getContext().errorDetails}`,
        };
      }

      // Start thinking state
      this.stateMachine.startThinking('decision_analysis');

      // Filter actions by confidence threshold
      const viableActions = availableActions.filter((action) => action.confidence >= 0.5);

      if (viableActions.length === 0) {
        return {
          selectedAction: null,
          resolvedCapabilities: [],
          confidence: 0,
          reasoning: 'No viable actions with sufficient confidence',
        };
      }

      // Resolve capabilities for each action
      const actionResults: Array<{
        action: ActionRecommendation;
        resolvedCapabilities: ToolDefinition[];
        validationResult: { valid: boolean; missing: string[] };
      }> = [];

      for (const action of viableActions) {
        const validationResult = await this.capabilityResolver.validateCapabilities(
          action.requiredCapabilities
        );
        const resolvedCapabilities: ToolDefinition[] = [];

        for (const capability of action.requiredCapabilities) {
          const tool = await this.capabilityResolver.lookup(capability);
          if (tool) {
            resolvedCapabilities.push(tool);
          }
        }

        actionResults.push({
          action,
          resolvedCapabilities,
          validationResult,
        });
      }

      // Filter to only actions with all capabilities available
      const executableActions = actionResults.filter((result) => result.validationResult.valid);

      if (executableActions.length === 0) {
        const allMissing = actionResults.flatMap((result) => result.validationResult.missing);
        return {
          selectedAction: null,
          resolvedCapabilities: [],
          confidence: 0,
          reasoning: `Required capabilities not available: ${[...new Set(allMissing)].join(', ')}`,
        };
      }

      // Select best action based on confidence, risk, and capability availability
      const bestAction = executableActions.reduce((best, current) => {
        const bestScore = this.calculateActionScore(best.action, best.resolvedCapabilities);
        const currentScore = this.calculateActionScore(
          current.action,
          current.resolvedCapabilities
        );
        return currentScore > bestScore ? current : best;
      });

      // Create execution plan if action selected
      let executionPlan;
      if (bestAction.action.type === 'tool_execution') {
        executionPlan = this.createExecutionPlan(bestAction.resolvedCapabilities);
      }

      const duration = Date.now() - startTime;

      // Emit decision event
      if (this.eventBus && agentId) {
        this.eventBus.emitDecisionMade(
          agentId,
          bestAction.action,
          availableActions,
          bestAction.action.confidence,
          bestAction.action.reasoning,
          duration
        );

        // Emit performance metric
        this.eventBus.emitPerformanceMetric('decision_time', duration, 'ms', agentId, {
          action_type: bestAction.action.type,
        });
      }

      logger.info(
        `Decision made: ${bestAction.action.type} with confidence ${bestAction.action.confidence} (${duration}ms)`
      );

      return {
        selectedAction: bestAction.action,
        resolvedCapabilities: bestAction.resolvedCapabilities,
        confidence: bestAction.action.confidence,
        reasoning: bestAction.action.reasoning,
        executionPlan,
      };
    } catch (error) {
      logger.error('Decision engine error:', error);
      this.stateMachine.setError(`Decision engine failed: ${error.message}`);

      return {
        selectedAction: null,
        resolvedCapabilities: [],
        confidence: 0,
        reasoning: `Decision engine error: ${error.message}`,
      };
    }
  }

  private calculateActionScore(
    action: ActionRecommendation,
    capabilities: ToolDefinition[]
  ): number {
    let score = action.confidence;

    // Adjust for risk level (lower risk is better)
    switch (action.riskLevel) {
      case 'low':
        score += 0.1;
        break;
      case 'medium':
        break; // no adjustment
      case 'high':
        score -= 0.2;
        break;
    }

    // Adjust for estimated duration (shorter is better for similar confidence)
    if (action.estimatedDuration) {
      const durationPenalty = Math.min(action.estimatedDuration / 3600, 0.3); // max 30% penalty for 1+ hour tasks
      score -= durationPenalty;
    }

    // Adjust for capability availability and quality
    const avgCapabilityScore =
      capabilities.reduce((sum, cap) => {
        // Higher security level tools get slight preference (more powerful)
        const securityBonus =
          cap.securityLevel === SecurityLevel.LOW
            ? 0
            : cap.securityLevel === SecurityLevel.MEDIUM
              ? 0.05
              : 0.1;
        return sum + securityBonus;
      }, 0) / Math.max(capabilities.length, 1);

    score += avgCapabilityScore;

    return Math.max(0, Math.min(1, score)); // clamp to [0,1]
  }

  private createExecutionPlan(capabilities: ToolDefinition[]) {
    const steps = capabilities.map((tool) => ({
      tool,
      parameters: {}, // Would be populated based on action context
    }));

    const estimatedDuration = capabilities.reduce(
      (total, tool) => total + (tool.executionTimeEstimate || 30),
      0
    );

    return {
      steps,
      estimatedDuration,
    };
  }
}
