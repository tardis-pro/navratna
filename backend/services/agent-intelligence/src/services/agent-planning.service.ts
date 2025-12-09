/**
 * Agent Planning Service
 * Handles execution plan generation for agents
 * Part of the refactored agent-intelligence microservices
 */

import { Agent, ExecutionPlan, KnowledgeItem, KnowledgeType, SourceType } from '@uaip/types';
import { logger } from '@uaip/utils';
import { DatabaseService, EventBusService, KnowledgeGraphService } from '@uaip/shared-services';
import { v4 as uuidv4 } from 'uuid';

export interface AgentPlanningConfig {
  databaseService: DatabaseService;
  eventBusService: EventBusService;
  knowledgeGraphService?: KnowledgeGraphService;
  serviceName: string;
  securityLevel: number;
}

export class AgentPlanningService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private knowledgeGraphService?: KnowledgeGraphService;
  private serviceName: string;
  private securityLevel: number;

  constructor(config: AgentPlanningConfig) {
    this.databaseService = config.databaseService;
    this.eventBusService = config.eventBusService;
    this.knowledgeGraphService = config.knowledgeGraphService;
    this.serviceName = config.serviceName;
    this.securityLevel = config.securityLevel;
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
    analysis: any,
    userPreferences: any,
    securityContext: any
  ): Promise<ExecutionPlan> {
    try {
      logger.info('Generating enhanced execution plan', { agentId: agent.id });

      // Get relevant knowledge for plan generation
      const planningKnowledge = this.knowledgeGraphService
        ? await this.searchRelevantKnowledge(
            agent.id,
            `execution planning ${analysis?.intent?.primary}`,
            analysis
          )
        : [];

      // Determine plan type based on enhanced analysis
      const planType = this.determinePlanType(analysis);

      // Generate enhanced plan steps with knowledge integration
      const steps = await this.generateEnhancedPlanSteps(
        agent,
        analysis,
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
        priority: userPreferences?.priority || 'medium',
        constraints: securityContext?.constraints || [],
        metadata: {
          generatedBy: agent.id,
          basedOnAnalysis: analysis.timestamp,
          userPreferences,
          version: '2.0.0', // Enhanced version
        },
        created_at: new Date(),
      };

      // Validate plan against security constraints
      await this.validatePlanSecurity(plan, securityContext);

      // Store plan in database and knowledge graph
      await this.storePlan(plan);
      await this.storePlanKnowledge(agent.id, plan, analysis);

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
        planType,
        stepsCount: steps.length,
      });

      return plan;
    } catch (error) {
      logger.error('Failed to generate execution plan', { error, agentId: agent.id });
      throw error;
    }
  }

  /**
   * Determine plan type based on analysis
   */
  determinePlanType(analysis: any): string {
    const intent = analysis?.intent?.primary;
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
    agent: Agent,
    analysis: any,
    planType: string,
    knowledge: KnowledgeItem[]
  ): Promise<any[]> {
    const baseSteps = [
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
    steps: any[],
    knowledge: KnowledgeItem[]
  ): Promise<any[]> {
    const dependencies = [];

    // Sequential dependencies
    for (let i = 1; i < steps.length; i++) {
      dependencies.push({
        stepId: steps[i].id,
        dependsOn: [steps[i - 1].id],
        type: 'sequential',
      });
    }

    // Knowledge-based dependencies
    if (knowledge.length > 0) {
      const knowledgeStep = steps.find((s) => s.id === 'prepare_knowledge');
      if (knowledgeStep) {
        const executionSteps = steps.filter((s) =>
          ['execution', 'generation', 'analysis'].includes(s.type)
        );

        executionSteps.forEach((step) => {
          dependencies.push({
            stepId: step.id,
            dependsOn: [knowledgeStep.id],
            type: 'knowledge_dependency',
          });
        });
      }
    }

    return dependencies;
  }

  /**
   * Estimate enhanced duration with historical data
   */
  private async estimateEnhancedDuration(
    steps: any[],
    dependencies: any[],
    agentId: string
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
    steps: any[],
    userPreferences: any,
    knowledge: KnowledgeItem[]
  ): any[] {
    let optimizedSteps = [...steps];

    // Apply user preferences
    if (userPreferences?.priority === 'speed') {
      optimizedSteps = optimizedSteps.map((step) => ({
        ...step,
        estimatedDuration: Math.round(step.estimatedDuration * 0.8),
      }));
    }

    if (userPreferences?.priority === 'quality') {
      optimizedSteps = optimizedSteps.map((step) => ({
        ...step,
        estimatedDuration: Math.round(step.estimatedDuration * 1.2),
        qualityEnhanced: true,
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
  async validatePlanSecurity(plan: ExecutionPlan, securityContext: any): Promise<void> {
    // Check duration limits
    if (
      securityContext?.maxDuration &&
      plan.estimatedDuration &&
      plan.estimatedDuration > securityContext.maxDuration
    ) {
      throw new Error('Plan exceeds maximum allowed duration');
    }

    // Check step restrictions
    if (securityContext?.restrictedStepTypes) {
      const restrictedSteps = plan.steps.filter((step) =>
        securityContext.restrictedStepTypes.includes(step.type)
      );
      if (restrictedSteps.length > 0) {
        throw new Error(
          `Plan contains restricted step types: ${restrictedSteps.map((s) => s.type).join(', ')}`
        );
      }
    }

    // Check resource constraints
    if (securityContext?.maxSteps && plan.steps.length > securityContext.maxSteps) {
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

  /**
   * Store plan in database and knowledge graph
   */
  async storePlan(plan: ExecutionPlan): Promise<void> {
    try {
      // Store in database
      await this.databaseService.storeExecutionPlan({
        id: plan.id,
        type: plan.type,
        agentId: plan.agentId,
        steps: plan.steps,
        dependencies: plan.dependencies,
        estimatedDuration: plan.estimatedDuration,
        priority: plan.priority,
        constraints: plan.constraints,
        metadata: plan.metadata,
        createdAt: plan.created_at,
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
    analysis: any
  ): Promise<void> {
    if (this.knowledgeGraphService) {
      try {
        await this.knowledgeGraphService.ingest([
          {
            content: `Execution Plan: ${plan.type}
Steps: ${plan.steps?.length}
Duration: ${plan.estimatedDuration}
Based on Analysis: ${analysis.intent?.primary}`,
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
  private async handleGeneratePlan(event: any): Promise<void> {
    const { requestId, agent, analysis, userPreferences, securityContext } = event;
    try {
      const plan = await this.generateExecutionPlan(
        agent,
        analysis,
        userPreferences,
        securityContext
      );
      await this.respondToRequest(requestId, { success: true, data: plan });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleValidatePlan(event: any): Promise<void> {
    const { requestId, plan, securityContext } = event;
    try {
      await this.validatePlanSecurity(plan, securityContext);
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  private async handleStorePlan(event: any): Promise<void> {
    const { requestId, plan } = event;
    try {
      await this.storePlan(plan);
      await this.respondToRequest(requestId, { success: true });
    } catch (error) {
      await this.respondToRequest(requestId, { success: false, error: error.message });
    }
  }

  /**
   * Helper methods
   */
  private async searchRelevantKnowledge(
    agentId: string,
    query: string,
    context?: any
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
      return response.success ? response.data : null;
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

  private async publishPlanningEvent(channel: string, data: any): Promise<void> {
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

  private async respondToRequest(requestId: string, response: any): Promise<void> {
    await this.eventBusService.publish('agent.planning.response', {
      requestId,
      ...response,
      timestamp: new Date().toISOString(),
    });
  }

  private auditLog(event: string, data: any): void {
    logger.info(`AUDIT: ${event}`, {
      ...data,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      compliance: true,
    });
  }
}
