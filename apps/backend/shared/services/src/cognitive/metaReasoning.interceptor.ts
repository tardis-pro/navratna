import { EventBusService } from '../eventBusService';
import { logger } from '@uaip/utils';
import { v4 as uuidv4 } from 'uuid';
import type {
  MetaReasoningInput,
  MetaReasoningDecision,
  CapabilityGapResult,
  ErrorHistoryResult,
} from '@uaip/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const MEDIUM_CONFIDENCE_LOWER = 0.5;
const LOW_CONFIDENCE_LOWER = 0.3;
const ERROR_RATE_ESCALATION_THRESHOLD = 0.4;
const RECENT_ERROR_ESCALATION_THRESHOLD = 5;
const CLARIFICATION_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * MetaReasoningInterceptor sits between intent analysis and action execution.
 * Before an agent acts, the interceptor evaluates whether the agent SHOULD act,
 * producing a decision of proceed / clarify / delegate / abstain / escalate.
 */
export class MetaReasoningInterceptor {
  private static instance: MetaReasoningInterceptor;
  private eventBus: EventBusService;

  /** In-memory error history keyed by agentId */
  private errorHistory: Map<string, { errors: number; total: number }> = new Map();

  constructor(eventBus?: EventBusService) {
    this.eventBus = eventBus ?? EventBusService.getInstance();
    this.setupEventHandlers();
  }

  static getInstance(): MetaReasoningInterceptor {
    if (!MetaReasoningInterceptor.instance) {
      MetaReasoningInterceptor.instance = new MetaReasoningInterceptor();
    }
    return MetaReasoningInterceptor.instance;
  }

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  private setupEventHandlers(): void {
    this.eventBus.subscribe('agent.action.error', async (event) => {
      const data = event.data as { agentId: string };
      if (data?.agentId) {
        this.recordError(data.agentId);
      }
    });

    this.eventBus.subscribe('agent.action.success', async (event) => {
      const data = event.data as { agentId: string };
      if (data?.agentId) {
        this.recordSuccess(data.agentId);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Core Evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate whether the agent should proceed with the proposed action.
   */
  async evaluate(input: MetaReasoningInput): Promise<MetaReasoningDecision> {
    const { agentId, intent, proposedAction, confidence, context } = input;

    logger.info('Meta-reasoning evaluation started', {
      agentId,
      intent,
      proposedAction,
      confidence,
    });

    const warnings: string[] = [];

    try {
      // 1. Check error history — if error-prone, escalate immediately
      const errorHistory = await this.getErrorHistory(agentId);
      if (
        errorHistory.errorRate >= ERROR_RATE_ESCALATION_THRESHOLD &&
        errorHistory.recentErrors >= RECENT_ERROR_ESCALATION_THRESHOLD
      ) {
        const decision: MetaReasoningDecision = {
          action: 'escalate',
          confidence,
          reasoning: `Agent ${agentId} has a high error rate (${(errorHistory.errorRate * 100).toFixed(1)}%) with ${errorHistory.recentErrors} recent errors. Escalating to human oversight.`,
          warnings: [
            `Error rate: ${(errorHistory.errorRate * 100).toFixed(1)}%`,
            `Recent errors: ${errorHistory.recentErrors}`,
          ],
        };

        await this.publishDecisionEvent('meta.reasoning.escalation', input, decision);
        return decision;
      }

      // 2. Check capability gaps
      const capabilityGap = await this.checkCapabilityGap(agentId, intent);

      if (capabilityGap.hasGap) {
        // Find an agent that can handle the missing capabilities
        const suggestedDelegate = await this.findDelegateAgent(capabilityGap.missingCapabilities);

        const decision: MetaReasoningDecision = {
          action: 'delegate',
          confidence,
          reasoning: `Agent ${agentId} is missing capabilities: ${capabilityGap.missingCapabilities.join(', ')}. Delegating to a more capable agent.`,
          suggestedDelegate: suggestedDelegate ?? undefined,
          warnings: capabilityGap.missingCapabilities.map((cap) => `Missing capability: ${cap}`),
        };

        await this.publishDecisionEvent('meta.reasoning.delegation', input, decision);
        return decision;
      }

      // 3. Confidence-based decision routing
      if (confidence >= HIGH_CONFIDENCE_THRESHOLD) {
        // High confidence, no capability gaps — proceed
        const decision: MetaReasoningDecision = {
          action: 'proceed',
          confidence,
          reasoning: `High confidence (${confidence}) with full capability coverage. Proceeding with action.`,
          warnings,
        };

        await this.publishDecisionEvent('meta.reasoning.evaluated', input, decision);
        return decision;
      }

      if (confidence >= MEDIUM_CONFIDENCE_LOWER) {
        // Medium confidence — proceed with warnings
        warnings.push(`Moderate confidence (${confidence}). Consider verifying results.`);

        if (errorHistory.errorRate > 0.2) {
          warnings.push(
            `Agent has elevated error rate (${(errorHistory.errorRate * 100).toFixed(1)}%).`
          );
        }

        const decision: MetaReasoningDecision = {
          action: 'proceed',
          confidence,
          reasoning: `Moderate confidence (${confidence}) but agent has the required capabilities. Proceeding with caution.`,
          warnings,
        };

        await this.publishDecisionEvent('meta.reasoning.evaluated', input, decision);
        return decision;
      }

      if (confidence >= LOW_CONFIDENCE_LOWER) {
        // Low confidence — request clarification
        const clarification = await this.generateClarification(intent, context);

        const decision: MetaReasoningDecision = {
          action: 'clarify',
          confidence,
          reasoning: `Low confidence (${confidence}). Requesting clarification before proceeding.`,
          suggestedClarification: clarification,
          warnings: [`Confidence below action threshold: ${confidence}`],
        };

        await this.publishDecisionEvent('meta.reasoning.clarification', input, decision);
        return decision;
      }

      // Very low confidence — abstain
      const decision: MetaReasoningDecision = {
        action: 'abstain',
        confidence,
        reasoning: `Very low confidence (${confidence}). Agent cannot reliably perform this action and will abstain.`,
        warnings: [`Confidence critically low: ${confidence}`],
      };

      await this.publishDecisionEvent('meta.reasoning.evaluated', input, decision);
      return decision;
    } catch (error) {
      logger.error('Meta-reasoning evaluation failed', {
        agentId,
        intent,
        error: error instanceof Error ? error.message : String(error),
      });

      // On evaluation failure, default to clarify to avoid silent failures
      return {
        action: 'clarify',
        confidence: 0,
        reasoning:
          'Meta-reasoning evaluation encountered an error. Requesting clarification as a safety measure.',
        suggestedClarification:
          'Could you please rephrase or provide more context for your request?',
        warnings: ['Meta-reasoning evaluation failed — defaulting to clarification.'],
      };
    }
  }

  // -------------------------------------------------------------------------
  // Capability Gap Detection
  // -------------------------------------------------------------------------

  /**
   * Check whether the agent has a capability gap for the given intent.
   */
  async checkCapabilityGap(agentId: string, intent: string): Promise<CapabilityGapResult> {
    try {
      const requiredCapabilities = this.extractRequiredCapabilities(intent);
      const agentCapabilities = await this.getAgentCapabilities(agentId);

      const missingCapabilities = requiredCapabilities.filter(
        (cap) => !agentCapabilities.includes(cap)
      );

      return {
        hasGap: missingCapabilities.length > 0,
        missingCapabilities,
      };
    } catch (error) {
      logger.warn('Capability gap check failed, assuming no gap', {
        agentId,
        intent,
        error: error instanceof Error ? error.message : String(error),
      });

      return { hasGap: false, missingCapabilities: [] };
    }
  }

  /**
   * Extract required capabilities from intent text via pattern matching.
   */
  private extractRequiredCapabilities(intent: string): string[] {
    const capabilities: string[] = [];
    const lower = intent.toLowerCase();

    const capabilityPatterns: Array<{ pattern: RegExp; capability: string }> = [
      { pattern: /\b(code|program|implement|develop|refactor)\b/, capability: 'code_generation' },
      { pattern: /\b(deploy|release|ship|publish)\b/, capability: 'deployment' },
      { pattern: /\b(analy[sz]e|evaluate|assess|examine)\b/, capability: 'analysis' },
      { pattern: /\b(test|verify|validate|check)\b/, capability: 'testing' },
      { pattern: /\b(design|architect|plan|blueprint)\b/, capability: 'design' },
      { pattern: /\b(search|find|lookup|query)\b/, capability: 'search' },
      { pattern: /\b(write|document|describe|explain)\b/, capability: 'documentation' },
      { pattern: /\b(review|critique|feedback|audit)\b/, capability: 'review' },
      { pattern: /\b(debug|fix|repair|troubleshoot|diagnose)\b/, capability: 'debugging' },
      { pattern: /\b(translate|convert|transform|migrate)\b/, capability: 'transformation' },
      { pattern: /\b(monitor|observe|track|alert)\b/, capability: 'monitoring' },
      { pattern: /\b(security|encrypt|auth|protect)\b/, capability: 'security' },
    ];

    for (const { pattern, capability } of capabilityPatterns) {
      if (pattern.test(lower)) {
        capabilities.push(capability);
      }
    }

    return capabilities;
  }

  /**
   * Query agent capabilities via event bus.
   */
  private async getAgentCapabilities(agentId: string): Promise<string[]> {
    return new Promise<string[]>((resolve) => {
      const requestId = uuidv4();
      const timeout = setTimeout(() => {
        resolve([]); // Default to empty on timeout
      }, 5_000);

      this.eventBus.subscribe(`agent.capabilities.response.${requestId}`, async (event) => {
        clearTimeout(timeout);
        const data = event.data as { capabilities?: string[] };
        resolve(data?.capabilities ?? []);
      });

      this.eventBus.publish('agent.capabilities.request', {
        requestId,
        agentId,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Error History
  // -------------------------------------------------------------------------

  /**
   * Get error history for an agent.
   */
  async getErrorHistory(agentId: string): Promise<ErrorHistoryResult> {
    const history = this.errorHistory.get(agentId);

    if (!history || history.total === 0) {
      return { recentErrors: 0, errorRate: 0 };
    }

    return {
      recentErrors: history.errors,
      errorRate: history.errors / history.total,
    };
  }

  /**
   * Record a successful action for the agent.
   */
  private recordSuccess(agentId: string): void {
    const history = this.errorHistory.get(agentId) ?? { errors: 0, total: 0 };
    history.total += 1;
    this.errorHistory.set(agentId, history);
  }

  /**
   * Record an error for the agent.
   */
  private recordError(agentId: string): void {
    const history = this.errorHistory.get(agentId) ?? { errors: 0, total: 0 };
    history.errors += 1;
    history.total += 1;
    this.errorHistory.set(agentId, history);
  }

  // -------------------------------------------------------------------------
  // Clarification Generation
  // -------------------------------------------------------------------------

  /**
   * Generate a clarification question via LLM through the event bus.
   */
  async generateClarification(intent: string, context: Record<string, unknown>): Promise<string> {
    const requestId = uuidv4();

    try {
      const clarification = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Clarification generation timed out'));
        }, CLARIFICATION_TIMEOUT_MS);

        this.eventBus.subscribe(`llm.response.${requestId}`, async (event) => {
          clearTimeout(timeout);
          const data = event.data as { content?: string };
          resolve(data?.content ?? '');
        });

        const contextSummary = Object.entries(context)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join('\n');

        this.eventBus.publish('llm.global.request', {
          requestId,
          prompt: `The user's intent is: "${intent}"\n\nAvailable context:\n${contextSummary}\n\nGenerate a single, concise clarification question that would help resolve the ambiguity and allow confident action. Respond with only the question, nothing else.`,
          systemPrompt:
            'You are a meta-reasoning assistant. Your job is to generate precise clarification questions when an agent is uncertain about how to proceed.',
          maxTokens: 200,
          temperature: 0.4,
        });
      });

      return clarification || this.buildFallbackClarification(intent);
    } catch (error) {
      logger.warn('Clarification generation failed, using fallback', {
        intent,
        error: error instanceof Error ? error.message : String(error),
      });

      return this.buildFallbackClarification(intent);
    }
  }

  /**
   * Build a simple fallback clarification when LLM is unavailable.
   */
  private buildFallbackClarification(intent: string): string {
    return `I'm not fully confident I understand the request: "${intent}". Could you provide more details or rephrase?`;
  }

  // -------------------------------------------------------------------------
  // Delegation
  // -------------------------------------------------------------------------

  /**
   * Find an agent that has the missing capabilities.
   */
  private async findDelegateAgent(missingCapabilities: string[]): Promise<string | null> {
    const requestId = uuidv4();

    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 5_000);

      this.eventBus.subscribe(`agent.delegate.response.${requestId}`, async (event) => {
        clearTimeout(timeout);
        const data = event.data as { agentId?: string };
        resolve(data?.agentId ?? null);
      });

      this.eventBus.publish('agent.delegate.request', {
        requestId,
        requiredCapabilities: missingCapabilities,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Event Publishing
  // -------------------------------------------------------------------------

  /**
   * Publish a meta-reasoning decision event.
   */
  private async publishDecisionEvent(
    eventName: string,
    input: MetaReasoningInput,
    decision: MetaReasoningDecision
  ): Promise<void> {
    try {
      await this.eventBus.publish(eventName, {
        agentId: input.agentId,
        intent: input.intent,
        proposedAction: input.proposedAction,
        inputConfidence: input.confidence,
        decision,
        timestamp: Date.now(),
      });

      logger.info('Meta-reasoning decision published', {
        event: eventName,
        agentId: input.agentId,
        action: decision.action,
        confidence: decision.confidence,
      });
    } catch (error) {
      logger.error('Failed to publish meta-reasoning event', {
        eventName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
