/**
 * Agent Planning Service
 * Handles execution plan generation for agents
 * Part of the refactored agent-intelligence microservices
 */

import {
  Agent,
  AgentSchema,
  ExecutionPlan,
  ExecutionPlanSchema,
  KnowledgeItem,
  KnowledgeType,
  SourceType,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/event_bus';
import { AgentIntelligenceStore } from './agent_intelligence_store.js';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge_graph_service.js';

export interface AgentPlanningConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  knowledgeGraphService?: KnowledgeGraphService;
  serviceName: string;
  securityLevel: number;
}

interface PlanStep {
  id: string;
  type: string;
  description: string;
  estimatedDuration: number;
  required: boolean;
}

interface IntentDetails {
  primary?: string;
  description?: string;
}

interface PlanningAnalysis {
  intent?: IntentDetails;
  planningContext?: string[];
  timestamp?: Date;
  executeImmediately?: boolean;
  [key: string]: unknown;
}

interface PlanningUserPreferences {
  priority?: string;
  [key: string]: unknown;
}

interface PlanningSecurityContext {
  constraints?: string[];
  maxDuration?: number;
  restrictedStepTypes?: string[];
  maxSteps?: number;
  [key: string]: unknown;
}

interface StepValidationResult {
  isValid: boolean;
  confidence: number;
  mismatchReason?: string;
}

interface StepCorrectionAttempt {
  attemptNumber: number;
  parameters: Record<string, unknown>;
  output: Record<string, unknown>;
  validationResult: StepValidationResult;
  timestamp: Date;
}

interface GeneratePlanEventPayload {
  requestId: string;
  agent: Agent;
  analysis: PlanningAnalysis;
  userPreferences: PlanningUserPreferences;
  securityContext: PlanningSecurityContext;
}

interface ValidatePlanEventPayload {
  requestId: string;
  plan: ExecutionPlan;
  securityContext: PlanningSecurityContext;
}

interface StorePlanEventPayload {
  requestId: string;
  plan: ExecutionPlan;
}

export class AgentPlanningService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private knowledgeGraphService?: KnowledgeGraphService;
  private serviceName: string;
  private securityLevel: number;

  private store: AgentIntelligenceStore;
  private static readonly CORRECTION_CONFIDENCE_THRESHOLD = 0.6;
  private static readonly MAX_CORRECTION_RETRIES = 2;

  constructor(config: AgentPlanningConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.knowledgeGraphService = config.knowledgeGraphService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
    this.store = new AgentIntelligenceStore();
  }

  async initialize(): Promise<void> {
    // Set up event subscriptions
    await this.setupEventSubscriptions();

    logger.info('Agent Planning Service initialized', {
      service: this.serviceName,
      securityLevel: this.securityLevel,
    });
  }

  /**
   * Set up event bus subscriptions for planning operations
   */
  private async setupEventSubscriptions(): Promise<void> {
    await this.eventBusService.subscribe(
      'agent.planning.generate',
      this.handleGeneratePlan.bind(this)
    );
    await this.eventBusService.subscribe(
      'agent.planning.validate',
      this.handleValidatePlan.bind(this)
    );
    await this.eventBusService.subscribe('agent.planning.store', this.handleStorePlan.bind(this));

    logger.info('Agent Planning Service event subscriptions configured');
  }

  /**
   * Enhanced execution plan generation with knowledge integration
   */
  async generateExecutionPlan(
    agent: Agent,
    analysis: PlanningAnalysis,
    userPreferences: PlanningUserPreferences,
    securityContext: PlanningSecurityContext
  ): Promise<ExecutionPlan> {
    try {
      logger.info('Generating enhanced execution plan', { agentId: agent.id });

      const successfulEpisodeContext = await this.getSuccessfulEpisodeContext(agent.id, analysis);
      const enhancedAnalysis: PlanningAnalysis = {
        ...analysis,
        planningContext: [...(analysis.planningContext || []), ...successfulEpisodeContext],
      };

      // Get relevant knowledge for plan generation
      const planningKnowledge = this.knowledgeGraphService
        ? await this.searchRelevantKnowledge(
            agent.id,
            `execution planning ${this.getPrimaryIntent(enhancedAnalysis) || 'general assistance'}`,
            enhancedAnalysis
          )
        : [];

      // Determine plan type based on enhanced analysis
      const planType = this.determinePlanType(enhancedAnalysis);

      // Generate enhanced plan steps with knowledge integration
      const steps = await this.generateEnhancedPlanSteps(
        agent,
        enhancedAnalysis,
        planType,
        planningKnowledge
      );

      // Calculate dependencies with knowledge graph insights
      const dependencies = await this.calculateEnhancedDependencies(steps, planningKnowledge);

      // Estimate duration with historical data
      const estimatedDuration = await this.estimateEnhancedDuration(steps, dependencies, agent.id);

      // Apply user preferences with knowledge-based optimization
      const optimizedSteps = this.applyEnhancedUserPreferences(
        steps,
        userPreferences,
        planningKnowledge
      );

      const plan: ExecutionPlan = {
        id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: planType,
        agentId: agent.id,
        steps: optimizedSteps,
        dependencies,
        estimatedDuration,
        priority: userPreferences.priority || 'medium',
        constraints: securityContext.constraints || [],
        metadata: {
          generatedBy: agent.id,
          basedOnAnalysis: this.resolveAnalysisTimestamp(analysis),
          userPreferences,
          version: '2.0.0', // Enhanced version
        },
        created_at: new Date(),
      };

      // Validate plan against security constraints
      await this.validatePlanSecurity(plan, securityContext);

      // Store plan in database and knowledge graph
      await this.storePlan(plan);
      await this.storePlanKnowledge(agent.id, plan, enhancedAnalysis);

      await this.store.storeAgentActivity(agent.id, {
        type: 'plan_generated',
        duration: plan.estimatedDuration,
        success: true,
        metadata: {
          planId: plan.id,
          planType: plan.type,
          planSteps: plan.steps.length,
          intent: this.getPrimaryIntent(analysis) || this.extractPlanIntent(plan),
          plan,
        },
        timestamp: plan.created_at,
      });

      // Publish plan generated event
      await this.publishPlanningEvent('agent.plan.generated', {
        agentId: agent.id,
        planId: plan.id,
        planType,
        stepsCount: steps.length,
        estimatedDuration,
        knowledgeUsed: planningKnowledge.length,
      });

      this.auditLog('PLAN_GENERATED', {
        agentId: agent.id,
        planId: plan.id,
        planSteps: plan.steps.length,
        intent: this.getPrimaryIntent(analysis) || this.extractPlanIntent(plan),
        planJson: JSON.stringify(plan),
        timestamp: new Date(),
      });

      return plan;
    } catch (error) {
      logger.error('Failed to generate execution plan', { error, agentId: agent.id });
      throw error;
    }
  }

  private async getSuccessfulEpisodeContext(
    agentId: string,
    analysis: PlanningAnalysis
  ): Promise<string[]> {
    if (!this.knowledgeGraphService) {
      return [];
    }

    const query =
      this.getPrimaryIntent(analysis) || this.getIntentDescription(analysis) || 'general planning';
    const similarEpisodesResult = await this.knowledgeGraphService.search({
      query: `similar situation: ${query}`,
      filters: {
        tags: [`agent-${agentId}`, 'agent-memory'],
        types: [KnowledgeType.EPISODIC],
      },
      options: {
        limit: 3,
        similarityThreshold: 0.7,
      },
      timestamp: Date.now(),
    });

    const similarEpisodes = similarEpisodesResult.items;

    return similarEpisodes
      .filter((episode) => this.isSuccessfulEpisode(episode))
      .slice(0, 3)
      .map((episode) => `Similar past success: ${this.summarizeEpisode(episode)}`);
  }

  private isSuccessfulEpisode(episode: KnowledgeItem): boolean {
    const metadata = this.asRecord(episode.metadata);

    if (this.asString(metadata?.outcome) === 'success') {
      return true;
    }

    const significance = this.asRecord(metadata?.significance);
    const successScore = this.asNumber(significance?.success);
    if (successScore !== undefined && successScore >= 0.6) {
      return true;
    }

    const experience = this.asRecord(metadata?.experience);
    const outcomes = this.asArray(experience?.outcomes);
    const outcomeDescriptions = outcomes
      .map((outcome) => {
        if (typeof outcome === 'string') {
          return outcome.toLowerCase();
        }

        const outcomeRecord = this.asRecord(outcome);
        const description = this.asString(outcomeRecord?.description);
        return description ? description.toLowerCase() : '';
      })
      .filter(Boolean);

    return outcomeDescriptions.some((description: string) =>
      ['success', 'resolved', 'completed', 'achieved'].some((token) => description.includes(token))
    );
  }

  private summarizeEpisode(episode: KnowledgeItem): string {
    const metadata = this.asRecord(episode.metadata);
    const context = this.asRecord(metadata?.context);
    const what = this.asString(context?.what);

    const experience = this.asRecord(metadata?.experience);
    const outcomes = this.asArray(experience?.outcomes);
    const firstOutcome = outcomes[0];
    const firstOutcomeRecord = this.asRecord(firstOutcome);
    const firstOutcomeDescription = this.asString(firstOutcomeRecord?.description);

    return episode.summary || what || firstOutcomeDescription || 'successful prior execution';
  }

  /**
   * Determine plan type based on analysis
   */
  determinePlanType(analysis: PlanningAnalysis): string {
    const intent = (this.getPrimaryIntent(analysis) || '').toLowerCase();
    switch (intent) {
      case 'creation':
      case 'create':
        return 'artifact_generation';
      case 'analysis':
      case 'analyze':
        return 'tool_execution';
      case 'modification':
      case 'modify':
        return 'hybrid_workflow';
      case 'retrieval':
      case 'find':
      case 'search':
        return 'information_retrieval';
      default:
        return 'general_assistance';
    }
  }

  /**
   * Generate enhanced plan steps with knowledge integration
   */
  private async generateEnhancedPlanSteps(
    _agent: Agent,
    _analysis: PlanningAnalysis,
    planType: string,
    knowledge: KnowledgeItem[]
  ): Promise<PlanStep[]> {
    const baseSteps: PlanStep[] = [
      {
        id: 'validate_input',
        type: 'validation',
        description: 'Validate input parameters and permissions',
        estimatedDuration: 10,
        required: true,
      },
    ];

    // Add knowledge preparation step if relevant knowledge exists
    if (knowledge.length > 0) {
      baseSteps.push({
        id: 'prepare_knowledge',
        type: 'knowledge_preparation',
        description: `Prepare and contextualize ${knowledge.length} knowledge items`,
        estimatedDuration: 20,
        required: true,
      });
    }

    switch (planType) {
      case 'tool_execution':
        baseSteps.push({
          id: 'execute_tools',
          type: 'execution',
          description: 'Execute selected tools with knowledge enhancement',
          estimatedDuration: 60,
          required: true,
        });
        break;
      case 'artifact_generation':
        baseSteps.push({
          id: 'generate_artifact',
          type: 'generation',
          description: 'Generate requested artifact with knowledge integration',
          estimatedDuration: 120,
          required: true,
        });
        break;
      case 'hybrid_workflow':
        baseSteps.push(
          {
            id: 'analyze_current_state',
            type: 'analysis',
            description: 'Analyze current system state with knowledge context',
            estimatedDuration: 30,
            required: true,
          },
          {
            id: 'generate_modifications',
            type: 'generation',
            description: 'Generate necessary modifications',
            estimatedDuration: 90,
            required: true,
          },
          {
            id: 'apply_changes',
            type: 'execution',
            description: 'Apply generated changes',
            estimatedDuration: 60,
            required: true,
          }
        );
        break;
      case 'information_retrieval':
        baseSteps.push({
          id: 'search_information',
          type: 'retrieval',
          description: 'Search and retrieve relevant information',
          estimatedDuration: 30,
          required: true,
        });
        break;
      default:
        baseSteps.push({
          id: 'general_assistance',
          type: 'assistance',
          description: 'Provide general assistance based on context',
          estimatedDuration: 45,
          required: true,
        });
    }

    baseSteps.push({
      id: 'finalize_results',
      type: 'finalization',
      description: 'Process and return results with learning integration',
      estimatedDuration: 15,
      required: true,
    });

    return baseSteps;
  }

  /**
   * Calculate enhanced dependencies with knowledge graph insights
   */
  private async calculateEnhancedDependencies(
    steps: PlanStep[],
    knowledge: KnowledgeItem[]
  ): Promise<string[]> {
    const dependencies = new Set<string>();

    // Sequential dependencies
    for (let i = 1; i < steps.length; i++) {
      dependencies.add(steps[i - 1].id);
    }

    // Knowledge-based dependencies
    if (knowledge.length > 0) {
      const knowledgeStep = steps.find((s) => s.id === 'prepare_knowledge');
      if (knowledgeStep) {
        const executionSteps = steps.filter((s) =>
          ['execution', 'generation', 'analysis'].includes(s.type)
        );

        if (executionSteps.length > 0) {
          dependencies.add(knowledgeStep.id);
        }
      }
    }

    return Array.from(dependencies);
  }

  /**
   * Estimate enhanced duration with historical data
   */
  private async estimateEnhancedDuration(
    steps: PlanStep[],
    dependencies: string[],
    _agentId: string
  ): Promise<number> {
    // Get historical performance data for this agent
    const baseDuration = steps.reduce((sum, step) => sum + step.estimatedDuration, 0);

    // Apply agent-specific performance modifiers
    const performanceModifier = 0.9; // Assume enhanced agents are 10% faster

    // Apply dependency overhead
    const dependencyOverhead = dependencies.length * 2; // 2 seconds per dependency

    return Math.round(baseDuration * performanceModifier + dependencyOverhead);
  }

  /**
   * Apply enhanced user preferences with knowledge-based optimization
   */
  private applyEnhancedUserPreferences(
    steps: PlanStep[],
    userPreferences: PlanningUserPreferences,
    knowledge: KnowledgeItem[]
  ): PlanStep[] {
    let optimizedSteps = [...steps];
    const priority = (userPreferences.priority || '').toLowerCase();

    // Apply user preferences
    if (priority === 'speed') {
      optimizedSteps = optimizedSteps.map((step) => ({
        ...step,
        estimatedDuration: Math.round(step.estimatedDuration * 0.8),
      }));
    }

    if (priority === 'quality') {
      optimizedSteps = optimizedSteps.map((step) => ({
        ...step,
        estimatedDuration: Math.round(step.estimatedDuration * 1.2),
      }));
    }

    // Knowledge-based optimization
    if (knowledge.length > 5) {
      // If we have lots of knowledge, add extra processing time
      optimizedSteps = optimizedSteps.map((step) =>
        step.type === 'knowledge_preparation'
          ? { ...step, estimatedDuration: step.estimatedDuration + 10 }
          : step
      );
    }

    return optimizedSteps;
  }

  /**
   * Validate plan against security constraints
   */
  async validatePlanSecurity(
    plan: ExecutionPlan,
    securityContext: PlanningSecurityContext
  ): Promise<void> {
    // Check duration limits
    if (
      securityContext.maxDuration &&
      plan.estimatedDuration &&
      plan.estimatedDuration > securityContext.maxDuration
    ) {
      throw new Error('Plan exceeds maximum allowed duration');
    }

    // Check step restrictions
    if (securityContext.restrictedStepTypes) {
      const restrictedSteps = plan.steps.filter((step) =>
        securityContext.restrictedStepTypes?.includes(step.type)
      );
      if (restrictedSteps.length > 0) {
        throw new Error(
          `Plan contains restricted step types: ${restrictedSteps.map((s) => s.type).join(', ')}`
        );
      }
    }

    // Check resource constraints
    if (securityContext.maxSteps && plan.steps.length > securityContext.maxSteps) {
      throw new Error('Plan exceeds maximum allowed steps');
    }

    // Validate against agent capabilities
    const agent = await this.getAgentData(plan.agentId);
    if (agent && agent.securityContext?.restrictedDomains) {
      const planDomains = this.extractPlanDomains(plan);
      const restrictedDomains = planDomains.filter((domain) =>
        agent.securityContext.restrictedDomains.includes(domain)
      );
      if (restrictedDomains.length > 0) {
        throw new Error(`Plan accesses restricted domains: ${restrictedDomains.join(', ')}`);
      }
    }
  }

  validatePlanResult(originalIntent: string, toolOutput: unknown, planStep: PlanStep): boolean {
    if (toolOutput === null || toolOutput === undefined) {
      return false;
    }

    const outputRecord = this.asRecord(toolOutput);
    const outputStatus = this.asString(outputRecord?.status);
    const outputError = this.asString(outputRecord?.error);
    const outputSuccess = this.asBoolean(outputRecord?.success);

    if (
      outputSuccess === false ||
      !!outputError ||
      outputStatus === 'failed' ||
      outputStatus === 'error'
    ) {
      return false;
    }

    const outputText =
      typeof toolOutput === 'string'
        ? toolOutput.toLowerCase()
        : JSON.stringify(toolOutput).toLowerCase();

    if (/\berror\b|\bfailed\b|\bexception\b|\btimeout\b|\binvalid\b/.test(outputText)) {
      return false;
    }

    const normalizedIntent = (originalIntent || '').toLowerCase();
    const intentKeywords: Record<string, string[]> = {
      creation: ['create', 'generate', 'artifact', 'build', 'draft'],
      create: ['create', 'generate', 'artifact', 'build', 'draft'],
      analysis: ['analyze', 'analysis', 'insight', 'evaluate', 'assess'],
      analyze: ['analyze', 'analysis', 'insight', 'evaluate', 'assess'],
      modification: ['modify', 'change', 'update', 'patch', 'edit'],
      retrieval: ['search', 'find', 'retrieve', 'lookup', 'query'],
    };

    const expectedKeywords = intentKeywords[normalizedIntent] || [];
    const matchesIntent = expectedKeywords.some((keyword) => outputText.includes(keyword));

    const stepTerms = [planStep.type, ...planStep.description.split(/\s+/)]
      .map((term) => term.toLowerCase())
      .filter((term) => term.length > 3);
    const matchesStep = stepTerms.some((term) => outputText.includes(term));

    return matchesIntent || matchesStep || outputSuccess === true || !!outputRecord?.result;
  }

  /**
   * Validate step output against the original analysis intent and trigger
   * self-correction retries if the confidence score falls below the threshold.
   *
   * Publishes `agent.plan.step.corrected` events and audits each attempt.
   * Maximum retries: MAX_CORRECTION_RETRIES (2).
   *
   * @param toolOutput  Raw output from the tool execution
   * @param originalIntent  The primary intent string from the analysis
   * @param step  The plan step being validated
   * @param context  Execution context passed to retries
   */
  async validateStepOutput(
    toolOutput: unknown,
    originalIntent: string,
    step: PlanStep,
    context: Record<string, unknown>
  ): Promise<{ output: Record<string, unknown>; correctionAttempts: StepCorrectionAttempt[] }> {
    const correctionAttempts: StepCorrectionAttempt[] = [];

    let currentOutput = this.normalizeStepOutput(toolOutput);
    let confidence = this.computeOutputConfidence(currentOutput, originalIntent, step);

    let retryCount = 0;
    while (
      confidence < AgentPlanningService.CORRECTION_CONFIDENCE_THRESHOLD &&
      retryCount < AgentPlanningService.MAX_CORRECTION_RETRIES
    ) {
      retryCount++;

      const adjustedContext: Record<string, unknown> = {
        ...context,
        retryAttempt: retryCount,
        previousOutput: currentOutput,
        correctionHint: this.generateCorrectionHint(originalIntent, step, currentOutput),
      };

      logger.info('Self-correction: retrying step execution', {
        stepId: step.id,
        attemptNumber: retryCount,
        previousConfidence: confidence,
        originalIntent,
        service: this.serviceName,
      });

      // oxlint-disable-next-line no-await-in-loop -- sequential retry required for self-correction
      const retryOutput = await this.executePlanStep(step, adjustedContext);
      const retryConfidence = this.computeOutputConfidence(retryOutput, originalIntent, step);

      const mismatchReason =
        retryConfidence < AgentPlanningService.CORRECTION_CONFIDENCE_THRESHOLD
          ? `Output confidence ${retryConfidence.toFixed(2)} below threshold ${AgentPlanningService.CORRECTION_CONFIDENCE_THRESHOLD}`
          : undefined;

      const attempt: StepCorrectionAttempt = {
        attemptNumber: retryCount,
        parameters: adjustedContext,
        output: retryOutput,
        validationResult: {
          isValid: retryConfidence >= AgentPlanningService.CORRECTION_CONFIDENCE_THRESHOLD,
          confidence: retryConfidence,
          mismatchReason,
        },
        timestamp: new Date(),
      };

      correctionAttempts.push(attempt);

      this.auditLog('STEP_CORRECTION_ATTEMPT', {
        stepId: step.id,
        stepType: step.type,
        attemptNumber: retryCount,
        previousConfidence: confidence,
        newConfidence: retryConfidence,
        isValid: attempt.validationResult.isValid,
        originalIntent,
        mismatchReason,
      });

      // oxlint-disable-next-line no-await-in-loop -- sequential publish required for audit ordering
      await this.publishPlanningEvent('agent.plan.step.corrected', {
        stepId: step.id,
        stepType: step.type,
        attemptNumber: retryCount,
        previousConfidence: confidence,
        newConfidence: retryConfidence,
        isValid: attempt.validationResult.isValid,
        originalIntent,
        maxRetries: AgentPlanningService.MAX_CORRECTION_RETRIES,
      });

      currentOutput = retryOutput;
      confidence = retryConfidence;
    }

    return { output: currentOutput, correctionAttempts };
  }

  /**
   * Compute a normalized confidence score [0, 1] for how well the tool output
   * satisfies the original intent for the given step.
   *
   * Score breakdown:
   *  - 0.0-0.15: hard error indicators
   *  - 0.4      : neutral base (no error signals)
   *  - +0.25    : explicit success flag
   *  - +0.10    : completed status
   *  - +0.10    : result field present
   *  - +0.10    : output contains intent-aligned keywords
   *  - +0.05    : output contains step-type terms
   */
  private computeOutputConfidence(
    output: Record<string, unknown>,
    originalIntent: string,
    step: PlanStep
  ): number {
    const outputRecord = this.asRecord(output);
    if (!outputRecord) {
      return 0;
    }

    const outputSuccess = this.asBoolean(outputRecord.success);
    const outputError = this.asString(outputRecord.error);
    const outputStatus = this.asString(outputRecord.status);

    if (
      outputSuccess === false ||
      !!outputError ||
      outputStatus === 'failed' ||
      outputStatus === 'error'
    ) {
      return 0.1;
    }

    const outputText = JSON.stringify(output).toLowerCase();

    if (/\berror\b|\bfailed\b|\bexception\b|\btimeout\b/.test(outputText)) {
      return 0.15;
    }

    let score = 0.4;

    if (outputSuccess === true) {
      score += 0.25;
    }

    if (outputStatus === 'completed') {
      score += 0.1;
    }

    if (outputRecord.result !== undefined) {
      score += 0.1;
    }

    const normalizedIntent = (originalIntent || '').toLowerCase();
    const intentKeywords: Record<string, string[]> = {
      creation: ['create', 'generate', 'artifact', 'build', 'draft'],
      create: ['create', 'generate', 'artifact', 'build', 'draft'],
      analysis: ['analyze', 'analysis', 'insight', 'evaluate', 'assess'],
      analyze: ['analyze', 'analysis', 'insight', 'evaluate', 'assess'],
      modification: ['modify', 'change', 'update', 'patch', 'edit'],
      retrieval: ['search', 'find', 'retrieve', 'lookup', 'query'],
      find: ['search', 'find', 'retrieve', 'lookup', 'query'],
      search: ['search', 'find', 'retrieve', 'lookup', 'query'],
    };

    const expectedKeywords = intentKeywords[normalizedIntent] ?? [];
    if (expectedKeywords.length > 0 && expectedKeywords.some((kw) => outputText.includes(kw))) {
      score += 0.1;
    }

    const stepTerms = [step.type, ...step.description.split(/\s+/)]
      .map((term) => term.toLowerCase())
      .filter((term) => term.length > 3);

    if (stepTerms.some((term) => outputText.includes(term))) {
      score += 0.05;
    }

    return Math.min(score, 1);
  }

  private normalizeStepOutput(toolOutput: unknown): Record<string, unknown> {
    if (toolOutput === null || toolOutput === undefined) {
      return { success: false, status: 'empty', error: 'No output produced' };
    }

    if (this.isRecord(toolOutput)) {
      return toolOutput;
    }

    if (typeof toolOutput === 'string') {
      return { success: true, status: 'completed', result: toolOutput };
    }

    return { success: true, status: 'completed', result: toolOutput };
  }

  private generateCorrectionHint(
    originalIntent: string,
    step: PlanStep,
    previousOutput: Record<string, unknown>
  ): string {
    const previousError = this.asString(previousOutput.error);
    const previousStatus = this.asString(previousOutput.status);

    const hints: string[] = [
      `Original intent: ${originalIntent}`,
      `Step type: ${step.type}`,
      `Step description: ${step.description}`,
    ];

    if (previousError) {
      hints.push(`Previous attempt failed with: ${previousError}`);
      hints.push('Try alternative approach to avoid the previous error');
    } else if (previousStatus === 'failed' || previousStatus === 'error') {
      hints.push('Previous attempt did not meet quality threshold');
      hints.push('Adjust parameters and retry with focused scope');
    } else {
      hints.push('Previous output did not satisfy intent relevance criteria');
      hints.push(`Focus output on: ${originalIntent}`);
    }

    return hints.join('. ');
  }

  async executePlanWithSelfCorrection(
    plan: ExecutionPlan,
    originalIntent: string,
    context: Record<string, unknown>
  ): Promise<Array<{ stepId: string; output: Record<string, unknown> }>> {
    const executionResults: Array<{ stepId: string; output: Record<string, unknown> }> = [];

    for (const rawStep of plan.steps || []) {
      const step: PlanStep = {
        id: rawStep.id,
        type: rawStep.type,
        description: rawStep.description,
        estimatedDuration: rawStep.estimatedDuration,
        required: rawStep.required,
      };

      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const rawOutput = await this.executePlanStep(step, context);

      // oxlint-disable-next-line no-await-in-loop -- sequential processing required
      const { output, correctionAttempts } = await this.validateStepOutput(
        rawOutput,
        originalIntent,
        step,
        context
      );

      if (correctionAttempts.length > 0) {
        logger.info('Self-correction completed for step', {
          stepId: step.id,
          correctionCount: correctionAttempts.length,
          finalConfidence:
            correctionAttempts[correctionAttempts.length - 1]?.validationResult.confidence,
        });
      }

      executionResults.push({
        stepId: step.id,
        output,
      });
    }

    return executionResults;
  }

  private async executePlanStep(
    step: PlanStep,
    context: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const parameters = {
      stepId: step.id,
      stepType: step.type,
      description: step.description,
      context,
    };

    if (['execution', 'generation', 'analysis', 'retrieval'].includes(step.type)) {
      const result = await this.eventBusService.request('agent.tool.execute', {
        planStep: step,
        parameters,
      });

      if (this.isRecord(result)) {
        return result;
      }

      return {
        success: false,
        status: 'invalid_output',
        error: 'agent.tool.execute returned non-object output',
      };
    }

    return {
      success: true,
      stepId: step.id,
      status: 'completed',
      result: {
        skippedExecution: true,
        reason: 'no_tool_execution_required',
      },
    };
  }

  /**
   * Store plan in database and knowledge graph
   */
  async storePlan(plan: ExecutionPlan): Promise<void> {
    try {
      // Store in database
      await this.store.storeExecutionPlan({
        id: plan.id,
        type: plan.type,
        agentId: plan.agentId,
        steps: plan.steps,
        dependencies: plan.dependencies,
        estimatedDuration: plan.estimatedDuration,
        priority: plan.priority,
        constraints: plan.constraints,
        metadata: plan.metadata,
      });

      logger.info('Plan stored successfully', { planId: plan.id, agentId: plan.agentId });
    } catch (error) {
      logger.error('Failed to store plan', { error, planId: plan.id });
      throw error;
    }
  }

  /**
   * Store plan knowledge in knowledge graph
   */
  private async storePlanKnowledge(
    agentId: string,
    plan: ExecutionPlan,
    analysis: PlanningAnalysis
  ): Promise<void> {
    if (this.knowledgeGraphService) {
      try {
        await this.knowledgeGraphService.ingest([
          {
            content: `Execution Plan: ${plan.type}
Steps: ${plan.steps?.length}
Duration: ${plan.estimatedDuration}
Based on Analysis: ${this.getPrimaryIntent(analysis) || 'unknown'}`,
            type: KnowledgeType.PROCEDURAL,
            tags: ['execution-plan', `agent-${agentId}`, plan.type],
            source: {
              type: SourceType.AGENT_INTERACTION,
              identifier: `plan-${plan.id}`,
              metadata: { agentId, plan, analysis },
            },
            confidence: 0.8,
          },
        ]);
      } catch (error) {
        logger.warn('Failed to store plan knowledge', { error, planId: plan.id });
      }
    }
  }

  /**
   * Event handlers
   */
  private async handleGeneratePlan(event: Record<string, unknown>): Promise<void> {
    const payload = this.parseGeneratePlanEvent(event);
    if (!payload) {
      logger.warn('Invalid generate plan event payload', { event });
      return;
    }

    const { requestId, agent, analysis, userPreferences, securityContext } = payload;
    try {
      const plan = await this.generateExecutionPlan(
        agent,
        analysis,
        userPreferences,
        securityContext
      );

      if (analysis.executeImmediately) {
        const executionResults = await this.executePlanWithSelfCorrection(
          plan,
          this.getPrimaryIntent(analysis) || 'general_assistance',
          {
            agentId: agent.id,
            analysis,
            userPreferences,
            securityContext,
          }
        );

        await this.publishPlanningEvent('agent.plan.executed', {
          agentId: agent.id,
          planId: plan.id,
          executedSteps: executionResults.length,
        });
      }

      await this.respondToRequest(requestId, { success: true, data: plan });
    } catch (error) {
      await this.respondToRequest(requestId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleValidatePlan(event: Record<string, unknown>): Promise<void> {
    const payload = this.parseValidatePlanEvent(event);
    if (!payload) {
      logger.warn('Invalid validate plan event payload', { event });
      return;
    }

    const { requestId, plan, securityContext } = payload;
    try {
      await this.validatePlanSecurity(plan, securityContext);
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      await this.respondToRequest(requestId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleStorePlan(event: Record<string, unknown>): Promise<void> {
    const payload = this.parseStorePlanEvent(event);
    if (!payload) {
      logger.warn('Invalid store plan event payload', { event });
      return;
    }

    const { requestId, plan } = payload;
    try {
      await this.storePlan(plan);
      this.auditLog('EXECUTED_SUCCESSFULLY', {
        agentId: plan.agentId,
        planId: plan.id,
        planSteps: plan.steps?.length || 0,
        intent: this.extractPlanIntent(plan),
        planJson: JSON.stringify(plan),
        timestamp: new Date(),
      });
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      this.auditLog('EXECUTION_FAILED', {
        agentId: plan.agentId,
        planId: plan.id,
        planSteps: plan.steps.length || 0,
        intent: this.extractPlanIntent(plan),
        planJson: JSON.stringify(plan),
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      });
      await this.respondToRequest(requestId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Helper methods
   */
  private async searchRelevantKnowledge(
    agentId: string,
    query: string,
    _context?: PlanningAnalysis
  ): Promise<KnowledgeItem[]> {
    if (!this.knowledgeGraphService) return [];

    try {
      const searchResult = await this.knowledgeGraphService.search({
        query,
        filters: {
          agentId,
        },
        options: {
          limit: 10,
        },
        timestamp: Date.now(),
      });
      return searchResult.items;
    } catch (error) {
      logger.warn('Failed to search relevant knowledge', { error, agentId, query });
      return [];
    }
  }

  private async getAgentData(agentId: string): Promise<Agent | null> {
    // Request agent data through event bus
    try {
      const response = await this.eventBusService.request('agent.query.get', { agentId });
      if (!this.isRecord(response)) {
        return null;
      }

      const success = this.asBoolean(response.success);
      if (!success) {
        return null;
      }

      const parsedAgent = AgentSchema.safeParse(response.data);
      return parsedAgent.success ? parsedAgent.data : null;
    } catch (error) {
      logger.warn('Failed to get agent data', { error, agentId });
      return null;
    }
  }

  private extractPlanDomains(plan: ExecutionPlan): string[] {
    // Extract domains from plan steps and metadata
    const domains = new Set<string>();

    plan.steps.forEach((step) => {
      if (step.type === 'execution' && step.description.includes('tool')) {
        domains.add('tools');
      }
      if (step.type === 'generation') {
        domains.add('content-generation');
      }
      if (step.type === 'analysis') {
        domains.add('data-analysis');
      }
    });

    return Array.from(domains);
  }

  private async publishPlanningEvent(
    channel: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.eventBusService.publish(channel, {
        ...data,
        source: this.serviceName,
        securityLevel: this.securityLevel,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to publish planning event', { channel, error });
    }
  }

  private async respondToRequest(
    requestId: string,
    response: Record<string, unknown>
  ): Promise<void> {
    await this.eventBusService.publish('agent.planning.response', {
      requestId,
      ...response,
      timestamp: new Date().toISOString(),
    });
  }

  private extractPlanIntent(
    plan: ExecutionPlan | { type?: string; intent?: unknown } | undefined
  ): string {
    if (!plan) {
      return 'unknown';
    }

    if ('intent' in plan) {
      const rawIntent = plan.intent;
      if (typeof rawIntent === 'string') {
        return rawIntent;
      }

      const intentRecord = this.asRecord(rawIntent);
      const primary = this.asString(intentRecord?.primary);
      if (primary) {
        return primary;
      }
    }

    return plan.type || 'unknown';
  }

  private getPrimaryIntent(analysis: PlanningAnalysis): string | undefined {
    if (!analysis.intent) {
      return undefined;
    }

    return analysis.intent.primary;
  }

  private getIntentDescription(analysis: PlanningAnalysis): string | undefined {
    if (!analysis.intent) {
      return undefined;
    }

    return analysis.intent.description;
  }

  private resolveAnalysisTimestamp(analysis: PlanningAnalysis): Date {
    return analysis.timestamp instanceof Date ? analysis.timestamp : new Date();
  }

  private parseGeneratePlanEvent(event: Record<string, unknown>): GeneratePlanEventPayload | null {
    const requestId = this.asString(event.requestId);
    if (!requestId) {
      return null;
    }

    const agentParse = AgentSchema.safeParse(event.agent);
    if (!agentParse.success) {
      return null;
    }

    return {
      requestId,
      agent: agentParse.data,
      analysis: this.parsePlanningAnalysis(event.analysis),
      userPreferences: this.parseUserPreferences(event.userPreferences),
      securityContext: this.parseSecurityContext(event.securityContext),
    };
  }

  private parseValidatePlanEvent(event: Record<string, unknown>): ValidatePlanEventPayload | null {
    const requestId = this.asString(event.requestId);
    if (!requestId) {
      return null;
    }

    const planParse = ExecutionPlanSchema.safeParse(event.plan);
    if (!planParse.success) {
      return null;
    }

    return {
      requestId,
      plan: planParse.data,
      securityContext: this.parseSecurityContext(event.securityContext),
    };
  }

  private parseStorePlanEvent(event: Record<string, unknown>): StorePlanEventPayload | null {
    const requestId = this.asString(event.requestId);
    if (!requestId) {
      return null;
    }

    const planParse = ExecutionPlanSchema.safeParse(event.plan);
    if (!planParse.success) {
      return null;
    }

    return {
      requestId,
      plan: planParse.data,
    };
  }

  private parsePlanningAnalysis(value: unknown): PlanningAnalysis {
    const analysisRecord = this.asRecord(value);
    if (!analysisRecord) {
      return {};
    }

    const intentRecord = this.asRecord(analysisRecord.intent);
    const timestampValue = analysisRecord.timestamp;
    const timestamp = timestampValue instanceof Date ? timestampValue : undefined;

    return {
      intent: intentRecord
        ? {
            primary: this.asString(intentRecord.primary),
            description: this.asString(intentRecord.description),
          }
        : undefined,
      planningContext: this.asStringArray(analysisRecord.planningContext),
      timestamp,
      executeImmediately: this.asBoolean(analysisRecord.executeImmediately),
    };
  }

  private parseUserPreferences(value: unknown): PlanningUserPreferences {
    const preferencesRecord = this.asRecord(value);
    if (!preferencesRecord) {
      return {};
    }

    return {
      priority: this.asString(preferencesRecord.priority),
    };
  }

  private parseSecurityContext(value: unknown): PlanningSecurityContext {
    const contextRecord = this.asRecord(value);
    if (!contextRecord) {
      return {};
    }

    return {
      constraints: this.asStringArray(contextRecord.constraints),
      maxDuration: this.asNumber(contextRecord.maxDuration),
      restrictedStepTypes: this.asStringArray(contextRecord.restrictedStepTypes),
      maxSteps: this.asNumber(contextRecord.maxSteps),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return this.isRecord(value) ? value : undefined;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private asBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asStringArray(value: unknown): string[] {
    return this.asArray(value).filter((item): item is string => typeof item === 'string');
  }

  private auditLog(event: string, data: Record<string, unknown>): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true,
    });
  }
}
