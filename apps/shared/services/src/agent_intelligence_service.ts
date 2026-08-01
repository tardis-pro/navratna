import { Pool as _Pool } from 'pg';
import { DatabaseService } from './database_service';
import { EventBusService } from './event_bus_service';
import { logger, createLogger, ApiError } from '@uaip/utils';
import {
  Agent,
  AgentAnalysis,
  AgentRole,
  AgentSkillSchema,
  type AgentSkill,
  ExecutionPlan,
  LearningResult,
  OperationStatus,
  Persona,
  PersonaStatus,
  PersonaVisibility,
} from '@uaip/types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function getNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

function getStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function toAgentSkills(v: unknown): AgentSkill[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const parsed = v.flatMap((entry) => {
    const result = AgentSkillSchema.safeParse(entry);
    if (!result.success) {
      logger.warn('Dropping invalid agent skill', {
        issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      });
      return [];
    }
    return [result.data];
  });
  return parsed;
}

function toEnum<T extends Record<string, string>>(enumObj: T, v: unknown): T[keyof T] | undefined {
  if (typeof v !== 'string') return undefined;
  const found = (Object.values(enumObj) as T[keyof T][]).find((val) => val === v);
  return found;
}

function toAgentRole(v: string): AgentRole {
  const found = Object.values(AgentRole).find((r) => r === v);
  return found ?? AgentRole.ASSISTANT;
}

const validLlmProviders = ['custom', 'ollama', 'llmstudio', 'openai', 'anthropic'] as const;
type LlmProviderType = (typeof validLlmProviders)[number];
function isLlmProviderType(v: unknown): v is LlmProviderType {
  return typeof v === 'string' && validLlmProviders.some((p) => p === v);
}

export class AgentIntelligenceService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private isInitialized: boolean = false;

  constructor(databaseService?: DatabaseService, eventBusService?: EventBusService) {
    this.databaseService = databaseService || new DatabaseService();
    this.eventBusService =
      eventBusService ||
      new EventBusService(
        {
          serviceName: 'agent-intelligence',
        },
        createLogger({
          serviceName: 'agent-intelligence-eventbus',
          environment: process.env.NODE_ENV || 'development',
          logLevel: 'info',
        })
      );
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.databaseService.initialize();
      logger.info('DatabaseService initialized successfully');

      const maxRetries = 3;
      const connectWithRetry = async (retryCount: number): Promise<void> => {
        if (this.isInitialized) {
          return;
        }

        try {
          await this.eventBusService.connect();
          this.isInitialized = true;
          logger.info('AgentIntelligenceService initialized successfully');
          return;
        } catch (error) {
          const nextRetryCount = retryCount + 1;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(
            `EventBus connection attempt ${nextRetryCount}/${maxRetries} failed: ${errorMessage}`
          );

          if (nextRetryCount >= maxRetries) {
            logger.error(
              'Failed to initialize EventBus after max retries, continuing without event publishing'
            );
            this.isInitialized = true;
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
          await connectWithRetry(nextRetryCount);
        }
      };

      await connectWithRetry(0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to initialize AgentIntelligenceService', { error: errorMessage });
      throw new ApiError(500, 'Service initialization failed', 'INITIALIZATION_ERROR');
    }
  }

  private async safePublishEvent(eventType: string, eventData: unknown): Promise<void> {
    try {
      const healthCheck = await this.eventBusService.healthCheck();
      if (healthCheck.status === 'healthy') {
        await this.eventBusService.publish(eventType, eventData);
      } else {
        logger.warn('EventBus not healthy, skipping event publish', {
          eventType,
          status: healthCheck.status,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to publish event', { eventType, error: errorMessage });
    }
  }

  private validateIDParam(id: string, _paramName: string = 'id'): string {
    return id;
  }

  private async resolvePersonaForAgent(personaId: string | null | undefined): Promise<Persona> {
    if (!personaId) {
      throw new ApiError(422, 'Agent is not linked to a persona', 'AGENT_PERSONA_REQUIRED');
    }

    const persona = await this.databaseService.agents.findPersonaById(personaId);
    if (!persona) {
      throw new ApiError(422, `Persona ${personaId} was not found`, 'AGENT_PERSONA_NOT_FOUND');
    }
    return this.mapPersonaFromEntity(persona);
  }

  public async getAgents(): Promise<Agent[] | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const agents = await this.databaseService.agents.findActiveAgents();
      const limitedAgents = agents.slice(0, 6);
      if (limitedAgents.length === 0) {
        return null;
      }

      const mappedAgents: Agent[] = await Promise.all(
        limitedAgents.map(async (agent) => {
          const persona = await this.resolvePersonaForAgent(agent.personaId);
          return {
            id: agent.id,
            name: agent.name,
            role: agent.role,
            persona,
            intelligenceConfig: agent.intelligenceConfig,
            securityContext: agent.securityContext,
            configuration: agent.configuration,
            isActive: agent.isActive,
            skills: toAgentSkills(agent.skills) ?? [],
          };
        })
      );

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
      const agent = await this.databaseService.agents.findAgentById(validatedId);

      if (!agent) {
        return null;
      }

      const persona = await this.resolvePersonaForAgent(agent.personaId);

      const mappedAgent: Agent = {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        persona,
        intelligenceConfig: agent.intelligenceConfig,
        securityContext: agent.securityContext,
        configuration: agent.configuration,
        isActive: agent.isActive,
        createdBy: agent.createdBy,
        lastActiveAt: agent.lastActiveAt,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        modelId: agent.modelId,
        apiType: isLlmProviderType(agent.apiType) ? agent.apiType : undefined,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        systemPrompt: agent.systemPrompt,
        skills: toAgentSkills(agent.skills) ?? [],
        // Agent chat builds the model's toolset from this field. Omitting it here
        // silently strips EVERY assigned MCP tool from the LLM request, so the
        // model answers from memory instead of calling the tool it was given.
        assignedMCPTools: agent.assignedMCPTools ?? [],
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
    conversationContext: unknown,
    userRequest: string,
    constraints?: unknown
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
          environmentFactors: this.analyzeEnvironmentFactors(conversationContext),
        },
        recommendedActions: actionRecommendations,
        confidence,
        explanation,
        timestamp: new Date(),
      };

      await this.safePublishEvent('agent.context.analyzed', {
        agentId: agent.id,
        confidence,
        actionsCount: actionRecommendations.length,
        timestamp: new Date(),
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
    analysis: Record<string, unknown>,
    userPreferences: Record<string, unknown>,
    securityContext: Record<string, unknown>
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
        priority: typeof userPreferences?.priority === 'string' ? userPreferences.priority : 'medium',
        constraints: Array.isArray(securityContext?.constraints)
          ? securityContext.constraints.filter((c): c is string => typeof c === 'string')
          : [],
        metadata: {
          generatedBy: agent.id,
          basedOnAnalysis: analysis.timestamp instanceof Date ? analysis.timestamp : new Date(),
          userPreferences,
          version: '1.0.0',
        },
        created_at: new Date(),
      };

      await this.validatePlanSecurity(plan, securityContext);
      await this.storePlan(plan);

      await this.safePublishEvent('agent.plan.generated', {
        agentId: agent.id,
        planId: plan.id,
        planType,
        stepsCount: steps.length,
        estimatedDuration,
      });

      return plan;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error generating execution plan', { agentId: agent.id, error: errorMessage });
      throw new ApiError(500, 'Failed to generate execution plan', 'PLAN_GENERATION_ERROR');
    }
  }

  public async updateAgent(agentId: string, updateData: Record<string, unknown>): Promise<Agent> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const validatedId = this.validateIDParam(agentId, 'agentId');

      const updatePayload: Record<string, unknown> = {};
      if (updateData.name) updatePayload.name = updateData.name;
      if (updateData.persona) updatePayload.persona = updateData.persona;
      if (updateData.personaId) updatePayload.personaId = updateData.personaId;
      if (updateData.intelligenceConfig)
        updatePayload.intelligenceConfig = updateData.intelligenceConfig;
      if (updateData.securityContext) updatePayload.securityContext = updateData.securityContext;
      if (updateData.isActive !== undefined) updatePayload.isActive = updateData.isActive;

      if (updateData.configuration && isRecord(updateData.configuration)) {
        const configuration = updateData.configuration;
        updatePayload.configuration = configuration;

        if (configuration.modelId && !updateData.modelId) {
          updatePayload.modelId = configuration.modelId;
          logger.info('Extracted modelId from configuration', { modelId: configuration.modelId });
        }
        if (configuration.apiType && !updateData.apiType) {
          updatePayload.apiType = configuration.apiType;
          logger.info('Extracted apiType from configuration', { apiType: configuration.apiType });
        }
      }

      // Handle direct model configuration fields (these take precedence)
      if (updateData.modelId) updatePayload.modelId = updateData.modelId;
      if (updateData.apiType) updatePayload.apiType = updateData.apiType;
      if (updateData.temperature !== undefined) updatePayload.temperature = updateData.temperature;
      if (updateData.maxTokens) updatePayload.maxTokens = updateData.maxTokens;
      if (updateData.systemPrompt) updatePayload.systemPrompt = updateData.systemPrompt;

      if (updateData.skills !== undefined) {
        const skills = toAgentSkills(updateData.skills);
        if (skills) updatePayload.skills = skills;
      }

      logger.info('Updating agent with payload', {
        agentId: validatedId,
        updateFields: Object.keys(updatePayload),
        modelId: updatePayload.modelId,
        apiType: updatePayload.apiType,
      });

      const updatedAgent = await this.databaseService.agents.updateAgent(
        validatedId,
        updatePayload
      );
      if (!updatedAgent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      const persona = await this.resolvePersonaForAgent(updatedAgent.personaId);

      const agent: Agent = {
        id: updatedAgent.id,
        name: updatedAgent.name,
        role: updatedAgent.role,
        persona,
        intelligenceConfig: updatedAgent.intelligenceConfig,
        securityContext: updatedAgent.securityContext,
        configuration: updatedAgent.configuration,
        isActive: updatedAgent.isActive,
        createdBy: updatedAgent.createdBy,
        lastActiveAt: updatedAgent.lastActiveAt,
        createdAt: updatedAgent.createdAt,
        updatedAt: updatedAgent.updatedAt,
        skills: toAgentSkills(updatedAgent.skills) ?? [],
      };

      return agent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error updating agent', { agentId, error: errorMessage });
      throw new ApiError(500, 'Failed to update agent', 'DATABASE_ERROR');
    }
  }

  public async createAgent(agentData: Record<string, unknown>): Promise<Agent> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      logger.info('Creating new agent', {
        name: agentData.name,
        hasConfiguration: !!agentData.configuration,
        configurationKeys: agentData.configuration ? Object.keys(agentData.configuration) : [],
      });

      let agentId: string | undefined;
      if (agentData.id) {
        agentId = this.validateIDParam(typeof agentData.id === 'string' ? agentData.id : String(agentData.id), 'agentId');
      }

      const intelligenceConfig =
        agentData.intelligenceConfig || agentData.intelligence_config || {};

      const securityContext = agentData.securityContext || agentData.security_context || {};

      const configuration = agentData.configuration || {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        analysisDepth: 'intermediate',
        contextWindowSize: 4000,
        decisionThreshold: 0.7,
        learningEnabled: true,
        collaborationMode: 'collaborative',
      };

      const role = typeof agentData.role === 'string' ? agentData.role : 'assistant';

      let createdBy: string | null =
        (typeof agentData.createdBy === 'string' ? agentData.createdBy : null) ||
        (typeof agentData.created_by === 'string' ? agentData.created_by : null);

      if (createdBy) {
        createdBy = this.validateIDParam(createdBy, 'createdBy');
      }

      let organizationId: string | null =
        (typeof agentData.organizationId === 'string' ? agentData.organizationId : null) ||
        (typeof agentData.organization_id === 'string' ? agentData.organization_id : null);

      if (organizationId) {
        organizationId = this.validateIDParam(organizationId, 'organizationId');
      }

      const createPayload = {
        id: agentId,
        name: typeof agentData.name === 'string' ? agentData.name : '',
        description: typeof agentData.description === 'string' ? agentData.description : undefined,
        role: toAgentRole(role),
        personaId: typeof agentData.personaId === 'string' ? agentData.personaId : undefined,
        instructions: typeof agentData.systemPrompt === 'string' ? agentData.systemPrompt : undefined,
        modelId: typeof agentData.modelId === 'string' ? agentData.modelId
          : typeof agentData.modelName === 'string' ? agentData.modelName : undefined,
        temperature: typeof agentData.temperature === 'number' ? agentData.temperature : undefined,
        maxTokens: typeof agentData.maxTokens === 'number' ? agentData.maxTokens : undefined,
        intelligenceConfig: isRecord(intelligenceConfig) ? intelligenceConfig : {},
        securityContext: isRecord(securityContext) ? securityContext : {},
        configuration: isRecord(configuration) ? configuration : {},
        createdBy: createdBy || 'system',
        organizationId: organizationId || undefined,
        skills: toAgentSkills(agentData.skills) ?? [],
      };

      const savedAgent = await this.databaseService.agents.createAgent(createPayload);

      const persona = await this.resolvePersonaForAgent(savedAgent.personaId);

      const agent: Agent = {
        id: savedAgent.id,
        name: savedAgent.name,
        role: savedAgent.role,
        persona,
        intelligenceConfig: savedAgent.intelligenceConfig,
        securityContext: savedAgent.securityContext,
        configuration: savedAgent.configuration,
        isActive: savedAgent.isActive,
        createdBy: savedAgent.createdBy,
        lastActiveAt: savedAgent.lastActiveAt,
        createdAt: savedAgent.createdAt,
        updatedAt: savedAgent.updatedAt,
        skills: toAgentSkills(savedAgent.skills) ?? [],
      };

      await this.safePublishEvent('agent.created', {
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        createdBy: agent.createdBy,
        timestamp: new Date(),
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
      const { AgentStatus } = await import('@uaip/types');
      const wasDeactivated = await this.databaseService.agents.updateAgentStatus(
        validatedId,
        AgentStatus.INACTIVE
      );

      if (!wasDeactivated) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      await this.safePublishEvent('agent.deleted', {
        agentId: validatedId,
        timestamp: new Date(),
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
    outcomes: Record<string, unknown>,
    feedback: Record<string, unknown>
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

      await this.storeLearningRecord(
        validatedAgentId,
        validatedOperationId,
        learningData,
        confidenceAdjustments
      );

      const result: LearningResult = {
        learningApplied: true,
        confidenceAdjustments,
        newKnowledge: getStrArray(learningData.newKnowledge),
        improvedCapabilities: getStrArray(learningData.improvedCapabilities),
      };

      await this.safePublishEvent('agent.learning.applied', {
        agentId: validatedAgentId,
        operationId: validatedOperationId,
        learningData: result,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in learning from operation', {
        agentId,
        operationId,
        error: errorMessage,
      });
      throw error;
    }
  }

  // Private helper methods

  private mapPersonaFromEntity(personaData: unknown): Persona {
    if (!personaData || !isRecord(personaData)) {
      throw new ApiError(422, 'Agent persona data is invalid', 'AGENT_PERSONA_INVALID');
    }

    const p = personaData;

    return {
      id: getStr(p.id, 'default'),
      name: getStr(p.name, 'Default Persona'),
      role: getStr(p.role, 'Assistant'),
      description: getStr(p.description, 'A helpful AI assistant'),
      traits: Array.isArray(p.traits) ? p.traits : [],
      expertise:
        Array.isArray(p.expertise)
          ? p.expertise.map((exp: unknown, index: number) => ({
              id: `${Date.now()}-${index}`,
              name: typeof exp === 'string' ? exp : isRecord(exp) ? getStr(exp.name, 'General') : 'General',
              description: '',
              category: 'general',
              level: 'intermediate' as const,
              keywords: Array<string>(),
              relatedDomains: Array<string>(),
            }))
          : [],
      background: getStr(p.background, 'AI assistant background'),
      systemPrompt: getStr(p.systemPrompt, 'You are a helpful AI assistant.'),
      conversationalStyle: isRecord(p.conversationalStyle) ? p.conversationalStyle : {
        tone: 'friendly',
        verbosity: 'moderate',
        formality: 'neutral',
        empathy: 0.7,
        assertiveness: 0.5,
        creativity: 0.5,
        analyticalDepth: 0.6,
        questioningStyle: 'exploratory',
        responsePattern: 'structured',
      },
      status: toEnum(PersonaStatus, p.status) ?? PersonaStatus.ACTIVE,
      visibility: toEnum(PersonaVisibility, p.visibility) ?? PersonaVisibility.PRIVATE,
      createdBy: getStr(p.createdBy, 'system'),
      organizationId: typeof p.organizationId === 'string' ? p.organizationId : undefined,
      teamId: typeof p.teamId === 'string' ? p.teamId : undefined,
      version: getNum(p.version, 1),
      parentPersonaId: typeof p.parentPersonaId === 'string' ? p.parentPersonaId : undefined,
      tags: getStrArray(p.tags),
      validation: isRecord(p.validation) ? p.validation : undefined,
      usageStats: isRecord(p.usageStats) ? p.usageStats : {
        totalUsages: 0,
        uniqueUsers: 0,
        averageSessionDuration: 0,
        popularityScore: 0,
        feedbackCount: 0,
      },
      configuration: isRecord(p.configuration) ? p.configuration : {},
      capabilities: Array.isArray(p.capabilities) ? p.capabilities : [],
      restrictions: isRecord(p.restrictions) ? p.restrictions : {},
      metadata: isRecord(p.metadata) ? p.metadata : undefined,
      createdAt: p.createdAt instanceof Date ? p.createdAt : new Date(),
      updatedAt: p.updatedAt instanceof Date ? p.updatedAt : new Date(),
    };
  }

  private extractContextualInformation(conversationContext: unknown): Record<string, unknown> {
    const ctx = isRecord(conversationContext) ? conversationContext : {};
    const messages = Array.isArray(ctx.messages) ? ctx.messages : [];
    return {
      messageCount: messages.length,
      participants: Array.isArray(ctx.participants) ? ctx.participants : [],
      topics: this.extractTopics(messages),
      sentiment: this.analyzeSentiment(messages),
      complexity: this.assessComplexity(ctx),
      urgency: this.detectUrgency(ctx),
    };
  }

  private analyzeUserIntent(userRequest: string): Record<string, unknown> {
    const intentPatterns = {
      create: /create|make|build|generate|develop/i,
      analyze: /analyze|examine|check|review|assess/i,
      modify: /change|update|modify|edit|fix/i,
      delete: /delete|remove|destroy|clean/i,
      query: /find|search|get|show|list|what|how/i,
    };

    const detectedIntents = Object.entries(intentPatterns)
      .filter(([_intent, pattern]) => pattern.test(userRequest))
      .map(([intent]) => intent);

    return {
      primary: detectedIntents[0] || 'query',
      secondary: detectedIntents.slice(1),
      confidence: detectedIntents.length > 0 ? 0.8 : 0.3,
      entities: this.extractEntities(userRequest),
      complexity: this.assessRequestComplexity(userRequest),
    };
  }

  private async generateActionRecommendations(
    agent: Agent,
    contextAnalysis: Record<string, unknown>,
    intentAnalysis: Record<string, unknown>,
    _constraints: unknown
  ): Promise<Record<string, unknown>[]> {
    const recommendations: Record<string, unknown>[] = [];

    switch (intentAnalysis.primary) {
      case 'create':
        recommendations.push({
          type: 'artifact_generation',
          confidence: 0.8,
          description: 'Generate artifact based on requirements',
          estimatedDuration: 120,
        });
        break;
      case 'analyze':
        recommendations.push({
          type: 'tool_execution',
          confidence: 0.9,
          description: 'Execute analysis tools',
          estimatedDuration: 60,
        });
        break;
      case 'modify':
        recommendations.push({
          type: 'hybrid_workflow',
          confidence: 0.7,
          description: 'Analyze current state and apply modifications',
          estimatedDuration: 180,
        });
        break;
      default:
        recommendations.push({
          type: 'information_retrieval',
          confidence: 0.6,
          description: 'Retrieve relevant information',
          estimatedDuration: 30,
        });
    }

    return recommendations;
  }

  private calculateConfidence(
    contextAnalysis: Record<string, unknown>,
    intentAnalysis: Record<string, unknown>,
    actionRecommendations: Record<string, unknown>[],
    _intelligenceConfig: unknown
  ): number {
    const baseConfidence = getNum(intentAnalysis.confidence);
    const contextQuality = Math.min(getNum(contextAnalysis.messageCount) / 10, 1);
    const recommendationConfidence =
      actionRecommendations.reduce((sum, rec) => sum + getNum(rec.confidence), 0) /
      (actionRecommendations.length || 1);

    return Math.min((baseConfidence + contextQuality + recommendationConfidence) / 3, 1);
  }

  private generateExplanation(
    contextAnalysis: Record<string, unknown>,
    intentAnalysis: Record<string, unknown>,
    actionRecommendations: Record<string, unknown>[],
    confidence: number
  ): string {
    return `Based on the conversation context with ${contextAnalysis.messageCount} messages and detected intent '${intentAnalysis.primary}', I recommend ${actionRecommendations.length} action(s). Confidence level: ${Math.round(confidence * 100)}%.`;
  }

  private extractAgentCapabilities(agent: Agent): Record<string, unknown> {
    return {
      tools: agent.intelligenceConfig?.collaborationMode || 'collaborative',
      artifacts: agent.intelligenceConfig?.analysisDepth || 'intermediate',
      specializations: agent.persona?.capabilities || [],
      limitations: agent.securityContext?.restrictedDomains || [],
    };
  }

  private analyzeEnvironmentFactors(conversationContext: unknown): Record<string, unknown> {
    const ctx = isRecord(conversationContext) ? conversationContext : {};
    return {
      timeOfDay: new Date().getHours(),
      userLoad: Array.isArray(ctx.participants) ? ctx.participants.length : 1,
      systemLoad: 'normal',
      availableResources: 'high',
    };
  }

  private determinePlanType(analysis: Record<string, unknown>): string {
    const intentRaw = analysis.intent;
    const intent = isRecord(intentRaw) ? intentRaw.primary : undefined;
    switch (intent) {
      case 'create':
        return 'artifact_generation';
      case 'analyze':
        return 'tool_execution';
      case 'modify':
        return 'hybrid_workflow';
      default:
        return 'information_retrieval';
    }
  }

  private async generatePlanSteps(
    agent: Agent,
    analysis: Record<string, unknown>,
    planType: string
  ): Promise<Record<string, unknown>[]> {
    const baseSteps = [
      {
        id: 'validate_input',
        type: 'validation',
        description: 'Validate input parameters and permissions',
        estimatedDuration: 10,
        required: true,
      },
    ];

    switch (planType) {
      case 'tool_execution':
        baseSteps.push({
          id: 'execute_tools',
          type: 'execution',
          description: 'Execute selected tools',
          estimatedDuration: 60,
          required: true,
        });
        break;
      case 'artifact_generation':
        baseSteps.push({
          id: 'generate_artifact',
          type: 'generation',
          description: 'Generate requested artifact',
          estimatedDuration: 120,
          required: true,
        });
        break;
      case 'hybrid_workflow':
        baseSteps.push(
          {
            id: 'analyze_current_state',
            type: 'analysis',
            description: 'Analyze current system state',
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
    }

    baseSteps.push({
      id: 'finalize_results',
      type: 'finalization',
      description: 'Process and return results',
      estimatedDuration: 15,
      required: true,
    });

    return baseSteps;
  }

  private async calculateDependencies(steps: Record<string, unknown>[]): Promise<string[]> {
    return steps.slice(0, -1).map((step) => typeof step.id === 'string' ? step.id : '');
  }

  private estimateDuration(steps: Record<string, unknown>[], _dependencies: string[]): number {
    return steps.reduce((total, step) => total + getNum(step.estimatedDuration), 0);
  }

  private applyUserPreferences(
    steps: Record<string, unknown>[],
    userPreferences: Record<string, unknown>
  ): Record<string, unknown>[] {
    if (userPreferences?.speed === 'fast') {
      return steps.map((step) => ({
        ...step,
        estimatedDuration: Math.floor(getNum(step.estimatedDuration) * 0.7),
      }));
    }
    return steps;
  }

  private async validatePlanSecurity(
    plan: ExecutionPlan,
    securityContext: Record<string, unknown>
  ): Promise<void> {
    if (
      securityContext?.maxDuration &&
      plan.estimatedDuration &&
      typeof securityContext.maxDuration === 'number' &&
      plan.estimatedDuration > securityContext.maxDuration
    ) {
      throw new ApiError(403, 'Plan exceeds maximum allowed duration', 'SECURITY_VIOLATION');
    }
  }

  private async storePlan(plan: ExecutionPlan): Promise<void> {
    const repo = this.databaseService.operations.getOperationRepository();
    await repo.createOperation({
      id: plan.id,
      type: plan.type,
      agentId: plan.agentId,
      userId: plan.agentId,
      name: plan.type || 'execution-plan',
      status: OperationStatus.PENDING,
      executionPlan: plan,
      context: isRecord(plan.metadata) ? plan.metadata : {},
    });
  }

  private async getOperation(operationId: string): Promise<Record<string, unknown> | null> {
    const validatedId = this.validateIDParam(operationId, 'operationId');
    const repo = this.databaseService.operations.getOperationRepository();
    return await repo.getOperationById(validatedId);
  }

  private extractLearning(
    operation: Record<string, unknown>,
    outcomes: Record<string, unknown>,
    feedback: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      newKnowledge: feedback?.insights || [],
      improvedCapabilities: outcomes?.successfulActions || [],
      adjustedStrategies: feedback?.improvements || [],
    };
  }

  private async updateAgentKnowledge(agentId: string, learningData: unknown): Promise<void> {
    logger.info('Updating agent knowledge', { agentId, learningData });
  }

  private calculateConfidenceAdjustments(
    _operation: Record<string, unknown>,
    outcomes: Record<string, unknown>,
    feedback: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      overallAdjustment: outcomes?.success ? 0.05 : -0.1,
      specificAdjustments: isRecord(feedback?.specificFeedback) ? feedback.specificFeedback : {},
    };
  }

  private async storeLearningRecord(
    agentId: string,
    operationId: string,
    _learningData: Record<string, unknown>,
    _confidenceAdjustments: Record<string, unknown>
  ): Promise<void> {
    logger.info('Storing learning record', { agentId, operationId });
  }

  private extractTopics(messages: unknown[]): string[] {
    const commonWords = messages
      .flatMap((msg) => {
        if (!isRecord(msg) || typeof msg.content !== 'string') return [];
        return msg.content.split(' ');
      })
      .filter((word) => word.length > 3)
      .slice(0, 10);
    return [...new Set(commonWords)];
  }

  private analyzeSentiment(_messages: unknown[]): string {
    return 'neutral';
  }

  private assessComplexity(context: Record<string, unknown>): string {
    const messageCount = Array.isArray(context.messages) ? context.messages.length : 0;
    if (messageCount > 20) return 'high';
    if (messageCount > 5) return 'medium';
    return 'low';
  }

  private detectUrgency(context: Record<string, unknown>): string {
    const urgentWords = /urgent|asap|immediately|critical|emergency/i;
    const hasUrgentWords =
      Array.isArray(context.messages) &&
      context.messages.some(
        (msg) => isRecord(msg) && typeof msg.content === 'string' && urgentWords.test(msg.content)
      );
    return hasUrgentWords ? 'high' : 'normal';
  }

  private extractEntities(_text: string): unknown[] {
    return [];
  }

  private assessRequestComplexity(request: string): string {
    const wordCount = request.split(' ').length;
    if (wordCount > 50) return 'high';
    if (wordCount > 20) return 'medium';
    return 'low';
  }
}
