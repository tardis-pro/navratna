import { Pool } from 'pg';
import { DatabaseService } from './databaseService.js';
import { EventBusService } from './eventBusService.js';
import { logger, ApiError } from '@uaip/utils';
import { Agent, AgentAnalysis, AgentRole, ExecutionPlan, LearningResult, Persona, PersonaStatus, PersonaVisibility } from '@uaip/types';

interface MessageWithContent {
  content?: string;
}

export class AgentIntelligenceService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private isInitialized: boolean = false;

  constructor(databaseService?: DatabaseService, eventBusService?: EventBusService) {
    this.databaseService = databaseService || new DatabaseService();
    this.eventBusService = eventBusService || new EventBusService({
      url: process.env.RABBITMQ_URL || 'amqp://localhost',
      serviceName: 'agent-intelligence'
    }, console as any);
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.databaseService.initialize();
      logger.info('DatabaseService initialized successfully');

      const maxRetries = 3;
      let retryCount = 0;
      
      while (retryCount < maxRetries && !this.isInitialized) {
        try {
          await this.eventBusService.connect();
          this.isInitialized = true;
          logger.info('AgentIntelligenceService initialized successfully');
          break;
        } catch (error) {
          retryCount++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`EventBus connection attempt ${retryCount}/${maxRetries} failed: ${errorMessage}`);
          
          if (retryCount >= maxRetries) {
            logger.error('Failed to initialize EventBus after max retries, continuing without event publishing');
            this.isInitialized = true;
          } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to initialize AgentIntelligenceService', { error: errorMessage });
      throw new ApiError(500, 'Service initialization failed', 'INITIALIZATION_ERROR');
    }
  }

  private async safePublishEvent(eventType: string, eventData: any): Promise<void> {
    try {
      const healthCheck = await this.eventBusService.healthCheck();
      if (healthCheck.status === 'healthy') {
        await this.eventBusService.publish(eventType, eventData);
      } else {
        logger.warn('EventBus not healthy, skipping event publish', { eventType, status: healthCheck.status });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to publish event', { eventType, error: errorMessage });
    }
  }

  private validateIDParam(id: string, paramName: string = 'id'): string {
    return id;
  }

  public async getAgents(): Promise<Agent[] | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const agents = await this.databaseService.getActiveAgents(6);
      if (agents.length === 0) {
        return null;
      }

      const mappedAgents: Agent[] = agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        role: agent.role as AgentRole,
        persona: this.mapPersonaFromEntity(agent.persona),
        intelligenceConfig: agent.intelligenceConfig,
        securityContext: agent.securityContext,
        isActive: agent.isActive
      }));

      return mappedAgents;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error getting agents', { error: errorMessage });
      throw new ApiError(500, 'Failed to retrieve agents', 'DATABASE_ERROR');
    }
  }

  public async getAgent(agentId: string): Promise<Agent | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const validatedId = this.validateIDParam(agentId, 'agentId');
      const agent = await this.databaseService.getActiveAgentById(validatedId);
      
      if (!agent) {
        return null;
      }

      const mappedAgent: Agent = {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        persona: this.mapPersonaFromEntity(agent.persona),
        intelligenceConfig: agent.intelligenceConfig,
        securityContext: agent.securityContext,
        isActive: agent.isActive,
        createdBy: agent.createdBy,
        lastActiveAt: agent.lastActiveAt,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt
      };

      return mappedAgent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error getting agent', { agentId, error: errorMessage });
      throw new ApiError(500, 'Failed to retrieve agent', 'DATABASE_ERROR');
    }
  }

  public async analyzeContext(
    agent: Agent,
    conversationContext: any,
    userRequest: string,
    constraints?: any
  ): Promise<AgentAnalysis> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      logger.info('Analyzing context for agent', { agentId: agent.id });

      const contextAnalysis = this.extractContextualInformation(conversationContext);
      const intentAnalysis = this.analyzeUserIntent(userRequest);
      const actionRecommendations = await this.generateActionRecommendations(
        agent,
        contextAnalysis,
        intentAnalysis,
        constraints
      );

      const confidence = this.calculateConfidence(
        contextAnalysis,
        intentAnalysis,
        actionRecommendations,
        agent.intelligenceConfig
      );

      const explanation = this.generateExplanation(
        contextAnalysis,
        intentAnalysis,
        actionRecommendations,
        confidence
      );

      const analysis: AgentAnalysis = {
        analysis: {
          context: contextAnalysis,
          intent: intentAnalysis,
          agentCapabilities: this.extractAgentCapabilities(agent),
          environmentFactors: this.analyzeEnvironmentFactors(conversationContext)
        },
        recommendedActions: actionRecommendations,
        confidence,
        explanation,
        timestamp: new Date()
      };

      await this.safePublishEvent('agent.context.analyzed', {
        agentId: agent.id,
        confidence,
        actionsCount: actionRecommendations.length,
        timestamp: new Date()
      });

      return analysis;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error analyzing context', { agentId: agent.id, error: errorMessage });
      throw new ApiError(500, 'Failed to analyze context', 'ANALYSIS_ERROR');
    }
  }

  public async generateExecutionPlan(
    agent: Agent,
    analysis: any,
    userPreferences: any,
    securityContext: any
  ): Promise<ExecutionPlan> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      logger.info('Generating execution plan', { agentId: agent.id });

      const planType = this.determinePlanType(analysis);
      const steps = await this.generatePlanSteps(agent, analysis, planType);
      const dependencies = await this.calculateDependencies(steps);
      const estimatedDuration = this.estimateDuration(steps, dependencies);
      const optimizedSteps = this.applyUserPreferences(steps, userPreferences);

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
          version: '1.0.0'
        },
        created_at: new Date()
      };

      await this.validatePlanSecurity(plan, securityContext);
      await this.storePlan(plan);

      await this.safePublishEvent('agent.plan.generated', {
        agentId: agent.id,
        planId: plan.id,
        planType,
        stepsCount: steps.length,
        estimatedDuration
      });

      return plan;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error generating execution plan', { agentId: agent.id, error: errorMessage });
      throw new ApiError(500, 'Failed to generate execution plan', 'PLAN_GENERATION_ERROR');
    }
  }

  public async updateAgent(agentId: string, updateData: any): Promise<Agent> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const validatedId = this.validateIDParam(agentId, 'agentId');

      const updatePayload: any = {};
      if (updateData.name) updatePayload.name = updateData.name;
      if (updateData.persona) updatePayload.persona = updateData.persona;
      if (updateData.intelligenceConfig) updatePayload.intelligenceConfig = updateData.intelligenceConfig;
      if (updateData.securityContext) updatePayload.securityContext = updateData.securityContext;

      const updatedAgent = await this.databaseService.updateAgent(validatedId, updatePayload);
      if (!updatedAgent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      const agent: Agent = {
        id: updatedAgent.id,
        name: updatedAgent.name,
        role: updatedAgent.role,
        persona: this.mapPersonaFromEntity(updatedAgent.persona),
        intelligenceConfig: updatedAgent.intelligenceConfig,
        securityContext: updatedAgent.securityContext,
        isActive: updatedAgent.isActive,
        createdBy: updatedAgent.createdBy,
        lastActiveAt: updatedAgent.lastActiveAt,
        createdAt: updatedAgent.createdAt,
        updatedAt: updatedAgent.updatedAt
      };

      return agent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error updating agent', { agentId, error: errorMessage });
      throw new ApiError(500, 'Failed to update agent', 'DATABASE_ERROR');
    }
  }

  public async createAgent(agentData: any): Promise<Agent> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      logger.info('Creating new agent', { name: agentData.name });

      let agentId: string | undefined;
      if (agentData.id) {
        agentId = this.validateIDParam(agentData.id, 'agentId');
      }

      const intelligenceConfig = agentData.intelligenceConfig || 
                                agentData.intelligence_config || 
                                agentData.configuration || 
                                {};
      
      const securityContext = agentData.securityContext || 
                             agentData.security_context || 
                             {};
      
      const role = agentData.role || 'assistant';
      
      let createdBy = agentData.createdBy || agentData.created_by;
      
      if (createdBy) {
        createdBy = this.validateIDParam(createdBy, 'createdBy');
      } else {
        createdBy = null;
      }

      const createPayload = {
        ...(agentId && { id: agentId }),
        name: agentData.name,
        role: role,
        persona: agentData.persona || {},
        intelligenceConfig: intelligenceConfig,
        securityContext: securityContext,
        createdBy: createdBy
      };

      const savedAgent = await this.databaseService.createAgent(createPayload);
      
      const agent: Agent = {
        id: savedAgent.id,
        name: savedAgent.name,
        role: savedAgent.role,
        persona: this.mapPersonaFromEntity(savedAgent.persona),
        intelligenceConfig: savedAgent.intelligenceConfig,
        securityContext: savedAgent.securityContext,
        isActive: savedAgent.isActive,
        createdBy: savedAgent.createdBy,
        lastActiveAt: savedAgent.lastActiveAt,
        createdAt: savedAgent.createdAt,
        updatedAt: savedAgent.updatedAt
      };

      await this.safePublishEvent('agent.created', {
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        createdBy: agent.createdBy,
        timestamp: new Date()
      });

      return agent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error creating agent', { error: errorMessage });
      
      if (error instanceof ApiError) {
        throw error;
      }
      
      throw new ApiError(500, 'Failed to create agent', 'DATABASE_ERROR');
    }
  }

  public async deleteAgent(agentId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const validatedId = this.validateIDParam(agentId, 'agentId');
      const wasDeactivated = await this.databaseService.deactivateAgent(validatedId);

      if (!wasDeactivated) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      await this.safePublishEvent('agent.deleted', {
        agentId: validatedId,
        timestamp: new Date()
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error deleting agent', { agentId, error: errorMessage });
      throw new ApiError(500, 'Failed to delete agent', 'DATABASE_ERROR');
    }
  }

  public async learnFromOperation(
    agentId: string,
    operationId: string,
    outcomes: any,
    feedback: any
  ): Promise<LearningResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const validatedAgentId = this.validateIDParam(agentId, 'agentId');
      const validatedOperationId = this.validateIDParam(operationId, 'operationId');

      const operation = await this.getOperation(validatedOperationId);
      if (!operation || operation.agent_id !== validatedAgentId) {
        throw new ApiError(404, 'Operation not found', 'OPERATION_NOT_FOUND');
      }

      const learningData = this.extractLearning(operation, outcomes, feedback);
      await this.updateAgentKnowledge(validatedAgentId, learningData);
      
      const confidenceAdjustments = this.calculateConfidenceAdjustments(
        operation,
        outcomes,
        feedback
      );

      await this.storeLearningRecord(validatedAgentId, validatedOperationId, learningData, confidenceAdjustments);

      const result: LearningResult = {
        learningApplied: true,
        confidenceAdjustments,
        newKnowledge: learningData.newKnowledge,
        improvedCapabilities: learningData.improvedCapabilities
      };

      await this.safePublishEvent('agent.learning.applied', {
        agentId: validatedAgentId,
        operationId: validatedOperationId,
        learningData: result
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in learning from operation', { agentId, operationId, error: errorMessage });
      throw error;
    }
  }

  // Private helper methods

  private mapPersonaFromEntity(personaData: any): Persona {
    if (!personaData) {
      return this.getDefaultPersona();
    }

    return {
      id: personaData.id || 'default',
      name: personaData.name || 'Default Persona',
      role: personaData.role || 'Assistant',
      description: personaData.description || 'A helpful AI assistant',
      traits: personaData.traits || [],
      expertise: personaData.expertise?.map((exp: any, index: number) => ({
        id: `${Date.now()}-${index}`,
        name: typeof exp === 'string' ? exp : exp.name || 'General',
        description: '',
        category: 'general',
        level: 'intermediate' as const,
        keywords: [],
        relatedDomains: []
      })) || [],
      background: personaData.background || 'AI assistant background',
      systemPrompt: personaData.systemPrompt || 'You are a helpful AI assistant.',
      conversationalStyle: personaData.conversationalStyle || {
        tone: 'friendly',
        verbosity: 'moderate',
        formality: 'neutral',
        empathy: 0.7,
        assertiveness: 0.5,
        creativity: 0.5,
        analyticalDepth: 0.6,
        questioningStyle: 'exploratory',
        responsePattern: 'structured'
      },
      status: personaData.status || PersonaStatus.ACTIVE,
      visibility: personaData.visibility || PersonaVisibility.PRIVATE,
      createdBy: personaData.createdBy || 'system',
      organizationId: personaData.organizationId,
      teamId: personaData.teamId,
      version: personaData.version || 1,
      parentPersonaId: personaData.parentPersonaId,
      tags: personaData.tags || [],
      validation: personaData.validation,
      usageStats: personaData.usageStats || {
        totalUsages: 0,
        uniqueUsers: 0,
        averageSessionDuration: 0,
        popularityScore: 0,
        feedbackCount: 0
      },
      configuration: personaData.configuration || {},
      capabilities: personaData.capabilities || [],
      restrictions: personaData.restrictions || {},
      metadata: personaData.metadata,
      createdAt: personaData.createdAt || new Date(),
      updatedAt: personaData.updatedAt || new Date()
    };
  }

  private getDefaultPersona(): Persona {
    return {
      id: 'default',
      name: 'Default Assistant',
      role: 'AI Assistant',
      description: 'A helpful AI assistant',
      traits: [],
      expertise: [],
      background: 'General AI assistant',
      systemPrompt: 'You are a helpful AI assistant.',
      conversationalStyle: {
        tone: 'friendly',
        verbosity: 'moderate',
        formality: 'neutral',
        empathy: 0.7,
        assertiveness: 0.5,
        creativity: 0.5,
        analyticalDepth: 0.6,
        questioningStyle: 'exploratory',
        responsePattern: 'structured'
      },
      status: PersonaStatus.ACTIVE,
      visibility: PersonaVisibility.PRIVATE,
      createdBy: 'system',
      version: 1,
      tags: [],
      usageStats: {
        totalUsages: 0,
        uniqueUsers: 0,
        averageSessionDuration: 0,
        popularityScore: 0,
        feedbackCount: 0
      },
      configuration: {},
      capabilities: [],
      restrictions: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private extractContextualInformation(conversationContext: any): any {
    return {
      messageCount: conversationContext.messages?.length,
      participants: conversationContext.participants || [],
      topics: this.extractTopics(conversationContext.messages || []),
      sentiment: this.analyzeSentiment(conversationContext.messages || []),
      complexity: this.assessComplexity(conversationContext),
      urgency: this.detectUrgency(conversationContext)
    };
  }

  private analyzeUserIntent(userRequest: string): any {
    const intentPatterns = {
      create: /create|make|build|generate|develop/i,
      analyze: /analyze|examine|check|review|assess/i,
      modify: /change|update|modify|edit|fix/i,
      delete: /delete|remove|destroy|clean/i,
      query: /find|search|get|show|list|what|how/i
    };

    const detectedIntents = Object.entries(intentPatterns)
      .filter(([intent, pattern]) => pattern.test(userRequest))
      .map(([intent]) => intent);

    return {
      primary: detectedIntents[0] || 'query',
      secondary: detectedIntents.slice(1),
      confidence: detectedIntents.length > 0 ? 0.8 : 0.3,
      entities: this.extractEntities(userRequest),
      complexity: this.assessRequestComplexity(userRequest)
    };
  }

  private async generateActionRecommendations(
    agent: Agent,
    contextAnalysis: any,
    intentAnalysis: any,
    constraints: any
  ): Promise<any[]> {
    const recommendations = [];

    switch (intentAnalysis.primary) {
      case 'create':
        recommendations.push({
          type: 'artifact_generation',
          confidence: 0.8,
          description: 'Generate artifact based on requirements',
          estimatedDuration: 120
        });
        break;
      case 'analyze':
        recommendations.push({
          type: 'tool_execution',
          confidence: 0.9,
          description: 'Execute analysis tools',
          estimatedDuration: 60
        });
        break;
      case 'modify':
        recommendations.push({
          type: 'hybrid_workflow',
          confidence: 0.7,
          description: 'Analyze current state and apply modifications',
          estimatedDuration: 180
        });
        break;
      default:
        recommendations.push({
          type: 'information_retrieval',
          confidence: 0.6,
          description: 'Retrieve relevant information',
          estimatedDuration: 30
        });
    }

    return recommendations;
  }

  private calculateConfidence(
    contextAnalysis: any,
    intentAnalysis: any,
    actionRecommendations: any[],
    intelligenceConfig: any
  ): number {
    const baseConfidence = intentAnalysis.confidence;
    const contextQuality = Math.min(contextAnalysis.messageCount / 10, 1);
    const recommendationConfidence = actionRecommendations.reduce(
      (sum, rec) => sum + rec.confidence, 0
    ) / actionRecommendations.length;
    
    return Math.min((baseConfidence + contextQuality + recommendationConfidence) / 3, 1);
  }

  private generateExplanation(
    contextAnalysis: any,
    intentAnalysis: any,
    actionRecommendations: any[],
    confidence: number
  ): string {
    return `Based on the conversation context with ${contextAnalysis.messageCount} messages and detected intent '${intentAnalysis.primary}', I recommend ${actionRecommendations.length} action(s). Confidence level: ${Math.round(confidence * 100)}%.`;
  }

  private extractAgentCapabilities(agent: Agent): any {
    return {
      tools: agent.intelligenceConfig?.collaborationMode || 'collaborative',
      artifacts: agent.intelligenceConfig?.analysisDepth || 'intermediate',
      specializations: agent.persona?.capabilities || [],
      limitations: agent.securityContext?.restrictedDomains || []
    };
  }

  private analyzeEnvironmentFactors(conversationContext: any): any {
    return {
      timeOfDay: new Date().getHours(),
      userLoad: conversationContext.participants?.length || 1,
      systemLoad: 'normal',
      availableResources: 'high'
    };
  }

  private determinePlanType(analysis: any): string {
    const intent = analysis.intent?.primary;
    switch (intent) {
      case 'create': return 'artifact_generation';
      case 'analyze': return 'tool_execution';
      case 'modify': return 'hybrid_workflow';
      default: return 'information_retrieval';
    }
  }

  private async generatePlanSteps(agent: Agent, analysis: any, planType: string): Promise<any[]> {
    const baseSteps = [
      {
        id: 'validate_input',
        type: 'validation',
        description: 'Validate input parameters and permissions',
        estimatedDuration: 10,
        required: true
      }
    ];

    switch (planType) {
      case 'tool_execution':
        baseSteps.push({
          id: 'execute_tools',
          type: 'execution',
          description: 'Execute selected tools',
          estimatedDuration: 60,
          required: true
        });
        break;
      case 'artifact_generation':
        baseSteps.push({
          id: 'generate_artifact',
          type: 'generation',
          description: 'Generate requested artifact',
          estimatedDuration: 120,
          required: true
        });
        break;
      case 'hybrid_workflow':
        baseSteps.push(
          {
            id: 'analyze_current_state',
            type: 'analysis',
            description: 'Analyze current system state',
            estimatedDuration: 30,
            required: true
          },
          {
            id: 'generate_modifications',
            type: 'generation',
            description: 'Generate necessary modifications',
            estimatedDuration: 90,
            required: true
          },
          {
            id: 'apply_changes',
            type: 'execution',
            description: 'Apply generated changes',
            estimatedDuration: 60,
            required: true
          }
        );
        break;
    }

    baseSteps.push({
      id: 'finalize_results',
      type: 'finalization',
      description: 'Process and return results',
      estimatedDuration: 15,
      required: true
    });

    return baseSteps;
  }

  private async calculateDependencies(steps: any[]): Promise<string[]> {
    return steps.slice(0, -1).map(step => step.id);
  }

  private estimateDuration(steps: any[], dependencies: string[]): number {
    return steps.reduce((total, step) => total + step.estimatedDuration, 0);
  }

  private applyUserPreferences(steps: any[], userPreferences: any): any[] {
    if (userPreferences?.speed === 'fast') {
      return steps.map(step => ({
        ...step,
        estimatedDuration: Math.floor(step.estimatedDuration * 0.7)
      }));
    }
    return steps;
  }

  private async validatePlanSecurity(plan: ExecutionPlan, securityContext: any): Promise<void> {
    if (securityContext?.maxDuration && plan.estimatedDuration && plan.estimatedDuration > securityContext.maxDuration) {
      throw new ApiError(403, 'Plan exceeds maximum allowed duration', 'SECURITY_VIOLATION');
    }
  }

  private async storePlan(plan: ExecutionPlan): Promise<void> {
    await this.databaseService.storeExecutionPlan({
      id: plan.id,
      type: plan.type,
      agentId: plan.agentId,
      plan: plan,
      context: plan.metadata,
      createdAt: plan.created_at
    });
  }

  private async getOperation(operationId: string): Promise<any> {
    const validatedId = this.validateIDParam(operationId, 'operationId');
    return await this.databaseService.getOperationById(validatedId);
  }

  private extractLearning(operation: any, outcomes: any, feedback: any): any {
    return {
      newKnowledge: feedback?.insights || [],
      improvedCapabilities: outcomes?.successfulActions || [],
      adjustedStrategies: feedback?.improvements || []
    };
  }

  private async updateAgentKnowledge(agentId: string, learningData: any): Promise<void> {
    logger.info('Updating agent knowledge', { agentId, learningData });
  }

  private calculateConfidenceAdjustments(operation: any, outcomes: any, feedback: any): any {
    return {
      overallAdjustment: outcomes?.success ? 0.05 : -0.1,
      specificAdjustments: feedback?.specificFeedback || {}
    };
  }

  private async storeLearningRecord(
    agentId: string,
    operationId: string,
    learningData: any,
    confidenceAdjustments: any
  ): Promise<void> {
    logger.info('Storing learning record', { agentId, operationId });
  }

  private extractTopics(messages: any[]): string[] {
    const commonWords = messages
      .flatMap(msg => msg.content?.split(' ') || [])
      .filter(word => word.length > 3)
      .slice(0, 10);
    return [...new Set(commonWords)];
  }

  private analyzeSentiment(messages: any[]): string {
    return 'neutral';
  }

  private assessComplexity(context: any): string {
    const messageCount = context.messages?.length;
    if (messageCount > 20) return 'high';
    if (messageCount > 5) return 'medium';
    return 'low';
  }

  private detectUrgency(context: any): string {
    const urgentWords = /urgent|asap|immediately|critical|emergency/i;
    const hasUrgentWords = context.messages?.some((msg: MessageWithContent) => 
      urgentWords.test(msg.content || '')
    );
    return hasUrgentWords ? 'high' : 'normal';
  }

  private extractEntities(text: string): any[] {
    return [];
  }

  private assessRequestComplexity(request: string): string {
    const wordCount = request.split(' ').length;
    if (wordCount > 50) return 'high';
    if (wordCount > 20) return 'medium';
    return 'low';
  }
} 