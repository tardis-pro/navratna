import {
  KnowledgeGraphService,
  AgentMemoryService,
  PersonaService,
  DiscussionService,
  DatabaseService,
  EventBusService
} from '@uaip/shared-services';
import {
  KnowledgeSearchRequest,
  KnowledgeIngestRequest,
  WorkingMemoryUpdate,
  Episode,
  SemanticMemory,
  ContextRequest,
  KnowledgeType,
  SourceType,
  Agent,
  AgentAnalysis,
  ExecutionPlan,
  LearningResult
} from '@uaip/types';
import {
  AgentState,
  AgentActivity,
  AgentInteraction,
  AgentMetrics,
  KnowledgeItem
} from '@uaip/types';
import { logger, ApiError } from '@uaip/utils';
import { LLMService, UserLLMService } from '@uaip/llm-service';
import { 
  LLMRequest, 
  LLMResponse, 
  AgentResponseRequest, 
  ContextRequest as LLMContextRequest,
  ContextAnalysis as LLMContextAnalysis,
  Message,
  DocumentContext
} from '@uaip/llm-service';

export class EnhancedAgentIntelligenceService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private isInitialized: boolean = false;
  private knowledgeGraph?: KnowledgeGraphService;
  private agentMemory?: AgentMemoryService;
  private personaService?: PersonaService;
  private discussionService?: DiscussionService;
  private llmService: LLMService;
  private userLLMService: UserLLMService;
  private initializationPromise?: Promise<void>;

  constructor(
    knowledgeGraph?: KnowledgeGraphService,
    agentMemory?: AgentMemoryService,
    personaService?: PersonaService,
    discussionService?: DiscussionService,
    databaseService?: DatabaseService,
    eventBusService?: EventBusService,
    llmService?: LLMService
  ) {
    // Initialize core services with defaults if not provided
    this.databaseService = databaseService || new DatabaseService();
    this.eventBusService = eventBusService || new EventBusService({
      url: process.env.RABBITMQ_URL || 'amqp://localhost',
      serviceName: 'enhanced-agent-intelligence'
    }, logger as any);
    
    // Initialize LLM services
    this.llmService = llmService || LLMService.getInstance();
    this.userLLMService = new UserLLMService();
    
    // Store optional services - DO NOT create new instances to avoid circular dependencies
    this.knowledgeGraph = knowledgeGraph;
    this.agentMemory = agentMemory;
    this.personaService = personaService;
    this.discussionService = discussionService;
    
    // Note: PersonaService and DiscussionService will be initialized lazily if needed
    // This prevents circular dependencies during construction
  }

  /**
   * Initialize the service and its dependencies
   * Uses singleton pattern to prevent multiple initializations
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Prevent concurrent initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  /**
   * Internal initialization method
   */
  private async _doInitialize(): Promise<void> {
    try {
      // Initialize database service first
      await this.databaseService.initialize();
      logger.info('DatabaseService initialized successfully');

      // Test database connection using health check
      const healthCheck = await this.databaseService.healthCheck();
      if (healthCheck.status !== 'healthy') {
        throw new Error('Database health check failed');
      }
      
      // Connect to event bus (optional - don't fail if unavailable)
      try {
        await this.eventBusService.connect();
        logger.info('EventBusService connected successfully');
      } catch (error) {
        logger.warn('Event bus connection failed, continuing without event publishing:', error);
      }
      
      // Initialize optional services lazily only if they weren't provided
      if (!this.personaService) {
        try {
          this.personaService = new PersonaService({
            databaseService: this.databaseService,
            eventBusService: this.eventBusService,
            enableCaching: true,
            enableAnalytics: true
          });
          logger.info('PersonaService initialized successfully');
        } catch (error) {
          logger.warn('Failed to initialize PersonaService, will continue without it:', error);
        }
      }
      
      if (!this.discussionService && this.personaService) {
        try {
          this.discussionService = new DiscussionService({
            databaseService: this.databaseService,
            eventBusService: this.eventBusService,
            personaService: this.personaService,
            enableRealTimeEvents: true,
            enableAnalytics: true,
            maxParticipants: 20,
            defaultTurnTimeout: 300
          });
          logger.info('DiscussionService initialized successfully');
        } catch (error) {
          logger.warn('Failed to initialize DiscussionService, will continue without it:', error);
        }
      }
      
      this.isInitialized = true;
      logger.info('Enhanced Agent Intelligence Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Enhanced Agent Intelligence Service:', error);
      // Reset initialization state on failure
      this.isInitialized = false;
      this.initializationPromise = undefined;
      throw error;
    }
  }

  /**
   * Safely publish events to the event bus
   */
  private async safePublishEvent(eventType: string, data: any): Promise<void> {
    try {
      if (this.eventBusService && typeof this.eventBusService.publish === 'function') {
        await this.eventBusService.publish(eventType, data);
      }
    } catch (error) {
      logger.warn('Failed to publish event:', { eventType, error });
    }
  }

  /**
   * Validate numeric ID parameter
   */
  private validateIDParam(value: string, paramName: string): string {
    if (!value) {
      throw new ApiError(400, `Invalid ${paramName}: must be a non-empty string`, 'INVALID_ID');
    }
    return value;
  }

  // ===== BASIC AGENT CRUD OPERATIONS =====
  // These methods provide backward compatibility with the existing controller

  /**
   * Create a new agent with enhanced capabilities
   * COMPOSITION MODEL: Agent → Persona
   */
  async createAgent(agentData: any): Promise<Agent> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      logger.info('Creating new agent with enhanced capabilities', { name: agentData.name });

      // Handle ID validation - no longer generate UUIDs, let database auto-increment
      let agentId: string | undefined;
      if (agentData.id) {
        agentId = this.validateIDParam(agentData.id, 'agentId');
      }
      // If no ID provided, let database auto-generate

      // COMPOSITION MODEL: Handle personaId validation
      let personaId: string | undefined;
      if (agentData.personaId) {
        personaId = this.validateIDParam(agentData.personaId, 'personaId');
        
        // Validate that the persona exists
        if (this.personaService) {
          const persona = await this.personaService.getPersona(personaId);
          if (!persona) {
            throw new ApiError(400, `Persona not found: ${personaId}`, 'PERSONA_NOT_FOUND');
          }
          logger.info('Validated persona for agent creation', { personaId, personaName: persona.name });
        } else {
          logger.warn('PersonaService not available, skipping persona validation');
        }
      } else if (agentData.persona) {
        // Legacy mode: persona data provided directly (for transformation)
        logger.info('Creating agent with legacy persona data (transformation mode)');
      } else {
        throw new ApiError(400, 'Either personaId or persona data must be provided', 'MISSING_PERSONA');
      }

      const intelligenceConfig = agentData.intelligenceConfig || 
                                agentData.intelligence_config || 
                                {};
      
      const securityContext = agentData.securityContext || 
                             agentData.security_context || 
                             {};
      
      const configuration = agentData.configuration || {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        analysisDepth: 'intermediate',
        contextWindowSize: 4000,
        decisionThreshold: 0.7,
        learningEnabled: true,
        collaborationMode: 'collaborative'
      };
      
      const role = agentData.role || 'assistant';
      let createdBy = agentData.createdBy || agentData.created_by;
      
      if (createdBy) {
        createdBy = this.validateIDParam(createdBy, 'createdBy');
      } else {
        createdBy = null;
      }

      // Prepare data for DatabaseService
      const createPayload = {
        ...(agentId && { id: agentId }),
        name: agentData.name,
        role: role,
        // COMPOSITION MODEL: Include personaId
        ...(personaId && { personaId }),
        // Legacy persona data for backwards compatibility
        ...(agentData.persona && { legacyPersona: agentData.persona }),
        intelligenceConfig: intelligenceConfig,
        securityContext: securityContext,
        configuration: configuration,
        // Model configuration fields from agentData
        modelId: agentData.modelId,
        apiType: agentData.apiType,
        temperature: agentData.temperature,
        maxTokens: agentData.maxTokens,
        systemPrompt: agentData.systemPrompt,
        createdBy: createdBy,
        capabilities: agentData.capabilities || []
      };

      // Use DatabaseService createAgent method instead of raw SQL
      const savedAgent = await this.databaseService.createAgent(createPayload);

      await this.safePublishEvent('agent.created', {
        agentId: savedAgent.id,
        name: savedAgent.name,
        role: savedAgent.role,
        personaId: savedAgent.personaId,
        createdBy: savedAgent.createdBy,
        timestamp: new Date()
      });

      logger.info('Agent created successfully with persona relationship', { 
        agentId: savedAgent.id, 
        personaId: savedAgent.personaId,
        hasConfiguration: !!savedAgent.configuration,
        configurationKeys: savedAgent.configuration ? Object.keys(savedAgent.configuration) : []
      });

      return savedAgent;
    } catch (error: any) {
      logger.error('Error creating agent with enhanced capabilities', { error: error.message });
      
      if (error instanceof ApiError) {
        throw error;
      }
      
      throw new ApiError(500, 'Failed to create agent', 'DATABASE_ERROR');
    }
  }

  /**
   * Get an agent by ID
   */
  async getAgent(agentId: string): Promise<Agent | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const validatedId = this.validateIDParam(agentId, 'agentId');

      // Use DatabaseService getActiveAgentById method instead of raw SQL
      const agent = await this.databaseService.getActiveAgentById(validatedId);
      
      if (!agent) {
        return null;
      }

      // Map the agent entity to the Agent type, including model configuration fields
      const mappedAgent: Agent = {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        personaId: agent.personaId,
        persona: agent.persona,
        intelligenceConfig: agent.intelligenceConfig,
        securityContext: agent.securityContext,
        configuration: agent.configuration,
        isActive: agent.isActive,
        createdBy: agent.createdBy,
        lastActiveAt: agent.lastActiveAt,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        // Include model configuration fields
        modelId: agent.modelId,
        apiType: agent.apiType,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        systemPrompt: agent.systemPrompt
      };

      return mappedAgent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error getting agent', { agentId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Get an agent with its persona data populated
   * COMPOSITION MODEL: Returns agent with persona relationship
   */
  async getAgentWithPersona(agentId: string): Promise<(Agent & { personaData?: any }) | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const validatedId = this.validateIDParam(agentId, 'agentId');

      // Get the agent first
      const agent = await this.databaseService.getActiveAgentById(validatedId);
      if (!agent) {
        return null;
      }

      // If agent has a personaId, fetch the persona data
      let personaData = null;
      if (agent.personaId && this.personaService) {
        try {
          personaData = await this.personaService.getPersona(agent.personaId);
          logger.info('Fetched persona data for agent', { 
            agentId: agent.id, 
            personaId: agent.personaId,
            personaName: personaData?.name 
          });
        } catch (error) {
          logger.warn('Failed to fetch persona data for agent', { 
            agentId: agent.id, 
            personaId: agent.personaId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Return agent with persona data
      return {
        ...agent,
        personaData
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error getting agent with persona', { agentId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Get all active agents
   */
  async getAgents(limit?: number): Promise<Agent[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      // Use DatabaseService getActiveAgents method instead of raw SQL
      const agents = await this.databaseService.getActiveAgents(limit);
      
      return agents;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error getting agents', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Update an agent
   */
  async updateAgent(agentId: string, updateData: any): Promise<Agent | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const validatedId = this.validateIDParam(agentId, 'agentId');

      // Prepare update data for DatabaseService
      const updatePayload: any = {};
      if (updateData.name) updatePayload.name = updateData.name;
      if (updateData.role) updatePayload.role = updateData.role;
      if (updateData.personaId) updatePayload.personaId = updateData.personaId;
      if (updateData.isActive !== undefined) updatePayload.isActive = updateData.isActive;
      
      // Handle configuration object
      if (updateData.configuration) {
        updatePayload.configuration = updateData.configuration;
        
        // Extract modelId and apiType from configuration if present
        if (updateData.configuration.modelId && !updateData.modelId) {
          updatePayload.modelId = updateData.configuration.modelId;
          logger.info('Extracted modelId from configuration', { modelId: updateData.configuration.modelId });
        }
        if (updateData.configuration.apiType && !updateData.apiType) {
          updatePayload.apiType = updateData.configuration.apiType;
          logger.info('Extracted apiType from configuration', { apiType: updateData.configuration.apiType });
        }
      }
      
      if (updateData.intelligenceConfig || updateData.intelligence_config) {
        updatePayload.intelligenceConfig = updateData.intelligenceConfig || updateData.intelligence_config;
      }
      if (updateData.securityContext || updateData.security_context) {
        updatePayload.securityContext = updateData.securityContext || updateData.security_context;
      }
      
      // Handle direct model configuration fields (these take precedence)
      if (updateData.modelId) updatePayload.modelId = updateData.modelId;
      if (updateData.apiType) updatePayload.apiType = updateData.apiType;
      if (updateData.temperature !== undefined) updatePayload.temperature = updateData.temperature;
      if (updateData.maxTokens) updatePayload.maxTokens = updateData.maxTokens;
      if (updateData.systemPrompt) updatePayload.systemPrompt = updateData.systemPrompt;
      
      console.log('updateData', updateData);
      console.log('updatePayload', updatePayload);
      
      logger.info('Updating agent with enhanced payload', { 
        agentId: validatedId, 
        updateFields: Object.keys(updatePayload),
        modelId: updatePayload.modelId,
        apiType: updatePayload.apiType
      });
      
      if (Object.keys(updatePayload).length === 0) {
        throw new ApiError(400, 'No valid fields to update', 'NO_UPDATE_FIELDS');
      }

      // Use DatabaseService updateAgent method instead of raw SQL
      const updatedAgent = await this.databaseService.updateAgent(validatedId, updatePayload);
      
      if (!updatedAgent) {
        return null;
      }

      await this.safePublishEvent('agent.updated', {
        agentId: updatedAgent.id,
        updatedFields: Object.keys(updateData)
      });

      return updatedAgent;
    } catch (error: any) {
      logger.error('Error updating agent', { agentId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete an agent (soft delete)
   */
    async deleteAgent(agentId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const validatedId = this.validateIDParam(agentId, 'agentId');

      // Use DatabaseService method instead of raw SQL
      const wasDeactivated = await this.databaseService.deactivateAgent(validatedId);
      
      if (!wasDeactivated) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      await this.safePublishEvent('agent.deleted', { agentId: validatedId });

      logger.info('Agent deleted successfully', { agentId: validatedId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error deleting agent', { agentId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Enhanced context analysis with knowledge graph integration and LLM-powered insights
   */
  async analyzeContext(
    agent: Agent,
    conversationContext: any,
    userRequest: string,
    constraints?: any
  ): Promise<AgentAnalysis> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      logger.info('Analyzing context with enhanced LLM-powered capabilities', { agentId: agent.id });

      // Get relevant knowledge from knowledge graph
      const relevantKnowledge = this.knowledgeGraph ? 
        await this.searchRelevantKnowledge(agent.id, userRequest, conversationContext) : [];
      
      // Get agent's working memory
      const workingMemory = this.agentMemory ? 
        await this.agentMemory.getWorkingMemory(agent.id) : null;
      
      // Find similar past episodes
      const similarEpisodes = this.agentMemory ? 
        await this.agentMemory.findSimilarEpisodes(agent.id, userRequest) : [];

      // Use LLM for enhanced context analysis
      const llmContextAnalysis = await this.performLLMContextAnalysis(
        agent,
        conversationContext,
        userRequest,
        relevantKnowledge,
        similarEpisodes
      );

      // Extract contextual information (enhanced with LLM insights)
      const contextAnalysis = {
        ...this.extractContextualInformation(conversationContext),
        llmInsights: llmContextAnalysis.analysis
      };
      
      // Analyze user intent using LLM
      const intentAnalysis = await this.analyzeLLMUserIntent(userRequest, conversationContext, agent, agent.createdBy);
      
      // Generate enhanced action recommendations using LLM
      const actionRecommendations = await this.generateLLMEnhancedActionRecommendations(
        agent,
        contextAnalysis,
        intentAnalysis,
        constraints,
        relevantKnowledge,
        similarEpisodes,
        agent.createdBy
      );

      // Calculate enhanced confidence score
      const confidence = this.calculateEnhancedConfidence(
        contextAnalysis,
        intentAnalysis,
        actionRecommendations,
        agent.intelligenceConfig,
        relevantKnowledge,
        workingMemory
      );

      // Generate enhanced explanation using LLM
      const explanation = await this.generateLLMEnhancedExplanation(
        contextAnalysis,
        intentAnalysis,
        actionRecommendations,
        confidence,
        relevantKnowledge,
        similarEpisodes,
        agent,
        agent.createdBy
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

      // Store this analysis as knowledge
      await this.storeAnalysisKnowledge(agent.id, userRequest, analysis);

      await this.safePublishEvent('agent.context.analyzed', {
        agentId: agent.id,
        confidence,
        actionsCount: actionRecommendations.length,
        knowledgeUsed: relevantKnowledge.length,
        llmEnhanced: true,
        timestamp: new Date()
      });

      return analysis;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in enhanced LLM-powered context analysis', { agentId: agent.id, error: errorMessage });
      throw error;
    }
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
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      logger.info('Generating enhanced execution plan', { agentId: agent.id });

      // Get relevant knowledge for plan generation
      const planningKnowledge = this.knowledgeGraph ? 
        await this.searchRelevantKnowledge(
          agent.id, 
          `execution planning ${analysis?.intent?.primary}`,
          analysis
        ) : [];

      // Determine plan type based on enhanced analysis
      const planType = this.determinePlanType(analysis);
      
      // Generate enhanced plan steps with knowledge integration
      const steps = await this.generateEnhancedPlanSteps(agent, analysis, planType, planningKnowledge);
      
      // Calculate dependencies with knowledge graph insights
      const dependencies = await this.calculateEnhancedDependencies(steps, planningKnowledge);
      
      // Estimate duration with historical data
      const estimatedDuration = await this.estimateEnhancedDuration(steps, dependencies, agent.id);
      
      // Apply user preferences with knowledge-based optimization
      const optimizedSteps = this.applyEnhancedUserPreferences(steps, userPreferences, planningKnowledge);

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
          version: '2.0.0' // Enhanced version
        },
        created_at: new Date()
      };

      // Validate plan against security constraints
      await this.validatePlanSecurity(plan, securityContext);

      // Store plan in database and knowledge graph
      await this.storePlan(plan);
      await this.storePlanKnowledge(agent.id, plan, analysis);

      await this.safePublishEvent('agent.plan.generated', {
        agentId: agent.id,
        planId: plan.id,
        planType,
        stepsCount: steps.length,
        estimatedDuration,
        knowledgeUsed: planningKnowledge.length
      });

      return plan;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in enhanced plan generation', { agentId: agent.id, error: errorMessage });
      throw error;
    }
  }

  /**
   * Enhanced learning from operations with knowledge graph updates
   */
  async learnFromOperation(
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

      // Get operation details
      const operation = await this.getOperation(validatedOperationId);
      if (!operation || operation.agent_id !== validatedAgentId) {
        throw new ApiError(404, 'Operation not found', 'OPERATION_NOT_FOUND');
      }

      // Enhanced learning extraction with knowledge graph
      const learningData = await this.extractEnhancedLearning(operation, outcomes, feedback);
      
      // Update knowledge graph with new insights
      await this.updateKnowledgeGraph(validatedAgentId, learningData);
      
      // Store learning as episodic memory
      await this.storeOperationEpisode(validatedAgentId, validatedOperationId, operation, outcomes, feedback, learningData);
      
      // Update semantic memory
      await this.updateSemanticMemoryFromOperation(validatedAgentId, learningData);
      
      // Calculate enhanced confidence adjustments
      const confidenceAdjustments = this.calculateEnhancedConfidenceAdjustments(
        operation,
        outcomes,
        feedback,
        learningData
      );

      // Store enhanced learning record
      await this.storeEnhancedLearningRecord(validatedAgentId, validatedOperationId, learningData, confidenceAdjustments);

      const result: LearningResult = {
        learningApplied: true,
        confidenceAdjustments,
        newKnowledge: learningData.newKnowledge,
        improvedCapabilities: learningData.improvedCapabilities
      };

      await this.safePublishEvent('agent.learning.applied', {
        agentId: validatedAgentId,
        operationId: validatedOperationId,
        learningData: result,
        knowledgeUpdated: true
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in enhanced learning from operation', { agentId, operationId, error: errorMessage });
      throw error;
    }
  }

  // ===== ENHANCED AGENT CAPABILITIES =====
  // These are the advanced features that extend beyond basic CRUD

  /**
   * Initialize an agent with Knowledge Graph and Memory capabilities
   */
  async initializeAgent(agentId: string, personaId: string): Promise<AgentState> {
    try {
      // Initialize working memory
      const sessionId = `session-${Date.now()}`;
      await this.agentMemory.initializeWorkingMemory(agentId, sessionId);

      // Get persona information for context
      const persona = await this.personaService.getPersona(personaId);
      
      // Store persona knowledge in the Knowledge Graph
      if (persona) {
        await this.knowledgeGraph.ingest([{
          content: `Agent Persona: ${persona.name}
Background: ${persona.background}
Expertise: ${persona.expertise.map(e => e.name).join(', ')}
Communication Style: ${persona.conversationalStyle.tone}
Personality Traits: ${JSON.stringify(persona.traits)}`,
          type: KnowledgeType.CONCEPTUAL,
          tags: ['agent-persona', `agent-${agentId}`, 'initialization'],
          source: {
            type: SourceType.AGENT_INTERACTION,
            identifier: personaId,
            metadata: { agentId, personaId, persona }
          },
          confidence: 0.9
        }]);
      }

      return {
        agentId,
        status: 'active',
        capabilities: persona?.expertise.map(e => e.name) || [],
        performance: {
          responseTime: 0,
          successRate: 1.0,
          lastActivity: new Date()
        },
        context: {
          currentDiscussions: [],
          activeOperations: [],
          recentInteractions: []
        }
      };
    } catch (error) {
      console.error('Agent initialization error:', error);
      throw new Error(`Failed to initialize agent: ${error.message}`);
    }
  }

  /**
   * Process agent input with knowledge-enhanced reasoning and LLM-powered responses
   */
  async processAgentInput(agentId: string, input: {
    message: string;
    context?: any;
    discussionId?: string;
    operationId?: string;
    userId?: string;
  }): Promise<{
    response: string;
    reasoning: string[];
    knowledgeUsed: KnowledgeItem[];
    memoryUpdated: boolean;
    llmEnhanced: boolean;
  }> {
    try {
      // Get the agent first
      const agent = await this.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Search for relevant knowledge
      const relevantKnowledge = this.knowledgeGraph ? 
        await this.searchRelevantKnowledge(agentId, input.message, input.context) : [];
      
      // Get agent's working memory
      const workingMemory = this.agentMemory ? 
        await this.agentMemory.getWorkingMemory(agentId) : null;
      
      // Find similar past episodes
      const similarEpisodes = this.agentMemory ? 
        await this.agentMemory.findSimilarEpisodes(agentId, input.message) : [];
      
      // Generate reasoning based on knowledge and memory
      const reasoning = await this.generateReasoning(input.message, relevantKnowledge, similarEpisodes, workingMemory);
      
      // Generate LLM-enhanced agent response
      // Use provided userId or fall back to agent's creator
      const effectiveUserId = input.userId || agent.createdBy;
      logger.info('Processing agent input with user context', { 
        agentId, 
        userId: effectiveUserId, 
        source: input.userId ? 'provided' : 'agent-creator',
        hasUserContext: !!effectiveUserId 
      });
      const response = await this.generateLLMAgentResponse(agent, input, relevantKnowledge, reasoning, workingMemory, effectiveUserId);
      
      // Update working memory with this interaction
      if (this.agentMemory) {
        const memoryUpdate: WorkingMemoryUpdate = {
          lastInteraction: {
            input: input.message,
            response,
            timestamp: new Date(),
            confidence: 0.8
          },
          currentInput: input.message,
          retrievedEpisodes: similarEpisodes
        };
        
        await this.agentMemory.updateWorkingMemory(agentId, memoryUpdate);
      }
      
      // Store this interaction as knowledge
      await this.storeInteractionKnowledge(agentId, input, response, reasoning);
      
      return {
        response,
        reasoning,
        knowledgeUsed: relevantKnowledge,
        memoryUpdated: !!this.agentMemory,
        llmEnhanced: true
      };
    } catch (error) {
      logger.error('Agent input processing error:', { agentId, error });
      throw new Error(`Failed to process agent input: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate LLM-enhanced agent response
   */
  private async generateLLMAgentResponse(
    agent: Agent,
    input: any,
    relevantKnowledge: KnowledgeItem[],
    reasoning: string[],
    workingMemory: any,
    userId?: string
  ): Promise<string> {
    try {
      // Build conversation history from context
      const messages: Message[] = [];
      
      // Add working memory context if available
      if (workingMemory?.shortTermMemory?.recentInteractions?.length > 0) {
        const lastInteraction = workingMemory.shortTermMemory.recentInteractions[0];
        messages.push({
          id: 'memory-context',
          content: lastInteraction.description,
          sender: 'user',
          timestamp: lastInteraction.timestamp.toISOString(),
          type: 'user'
        });
        // Add a simple response based on the interaction success
        messages.push({
          id: 'memory-response',
          content: lastInteraction.success ? 'I was able to help with that successfully.' : 'I encountered some challenges with that request.',
          sender: agent.name || 'assistant',
          timestamp: lastInteraction.timestamp.toISOString(),
          type: 'assistant'
        });
      }

      // Add current input
      messages.push({
        id: 'current-input',
        content: input.message,
        sender: 'user',
        timestamp: new Date().toISOString(),
        type: 'user'
      });

      // Build document context from knowledge
      let documentContext: DocumentContext | undefined;
      if (relevantKnowledge.length > 0) {
        documentContext = {
          id: 'knowledge-context',
          title: 'Relevant Knowledge and Experience',
          content: [
            ...relevantKnowledge.slice(0, 3).map(k => `Knowledge: ${k.content}`),
            ...reasoning.map(r => `Reasoning: ${r}`)
          ].join('\n\n'),
          type: 'knowledge'
        };
      }

      // Use appropriate LLM service to generate agent response
      const agentRequest: AgentResponseRequest = {
        agent,
        messages,
        context: documentContext
      };

      let llmResponse;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        llmResponse = await this.userLLMService.generateAgentResponse(userId, agentRequest);
      } else {
        // Fall back to global LLM service
        llmResponse = await this.llmService.generateAgentResponse(agentRequest);
      }
      
      if (llmResponse.error) {
        logger.warn('LLM agent response failed, using fallback', { error: llmResponse.error });
        return this.generateResponse(input.message, reasoning, relevantKnowledge, userId);
      }

      return llmResponse.content;
    } catch (error) {
      logger.error('Error generating LLM agent response', { error });
      return this.generateResponse(input.message, reasoning, relevantKnowledge, userId);
    }
  }

  /**
   * Handle agent participation in discussions with knowledge enhancement
   */
  async participateInDiscussion(agentId: string, discussionId: string, message: string): Promise<{
    response: string;
    confidence: number;
    knowledgeContributed: boolean;
  }> {
    try {
      // Get discussion context
      const discussion = await this.discussionService.getDiscussion(discussionId);
      if (!discussion) {
        throw new Error('Discussion not found');
      }

      // Get discussion messages
      const discussionMessages = await this.discussionService.getMessages(discussionId);

      // Build context for knowledge search
      const context: ContextRequest = {
        discussionHistory: discussionMessages?.messages?.slice(-10) || [],
        relevantTags: [discussion.topic, ...discussion.tags],
        participantExpertise: discussion.participants.map(p => p.agentId).filter(Boolean).map(id => id)
      };

      // Get contextual knowledge
      const contextualKnowledge = await this.knowledgeGraph.getContextualKnowledge(context);
      
      // Update working memory with discussion context
      await this.agentMemory.updateWorkingMemory(agentId, {
        currentContext: {
          activeDiscussion: {
            discussionId,
            topic: discussion.topic,
            participants: discussion.participants.map(p => p.id),
            myRole: 'participant',
            conversationHistory: discussionMessages?.messages?.slice(-5) || [],
            currentGoals: ['contribute meaningfully', 'share relevant knowledge']
          }
        }
      });

      // Get the agent to access creator information
      const agent = await this.getAgent(agentId);
      
      // Generate knowledge-enhanced response
      const response = await this.generateDiscussionResponseInternal(
        message, 
        discussion, 
        contextualKnowledge,
        agentId,
        agent?.createdBy
      );

      // Store discussion participation as an episode
      const episode: Episode = {
        agentId,
        episodeId: Date.now() + discussionId,
        type: 'discussion',
        context: {
          when: new Date(),
          where: 'discussion-platform',
          who: discussion.participants.map(p => p.id),
          what: `Participated in discussion about ${discussion.topic}`,
          why: 'Knowledge sharing and collaboration',
          how: 'Text-based discussion'
        },
        experience: {
          actions: [{
            id: `action-${Date.now()}`,
            description: `Responded to message: ${message}`,
            type: 'communication',
            timestamp: new Date(),
            success: true
          }],
          decisions: [] as any[],
          outcomes: [{
            id: Date.now().toString(),
            description: 'Contributed to discussion',
            type: 'communication',
            success: true,
            impact: 0.7,
            timestamp: new Date()
          }],
          emotions: [{
            emotion: 'engaged',
            intensity: 0.8,
            trigger: 'meaningful discussion',
            timestamp: new Date()
          }],
          learnings: [`Discussed ${discussion.topic} with ${discussion.participants.length} participants`]
        },
        significance: {
          importance: 0.7,
          novelty: 0.6,
          success: 1.0,
          impact: 0.7
        },
        connections: {
          relatedEpisodes: [],
          triggeredBy: [`discussion-${discussionId}`],
          ledTo: [],
          similarTo: []
        }
      };

      await this.agentMemory.storeEpisode(agentId, episode);

      return {
        response,
        confidence: 0.8,
        knowledgeContributed: contextualKnowledge.length > 0
      };
    } catch (error) {
      console.error('Discussion participation error:', error);
      throw new Error(`Failed to participate in discussion: ${error.message}`);
    }
  }

  /**
   * Learn from agent interactions and update knowledge
   */
  async learnFromInteraction(agentId: string, interaction: AgentInteraction): Promise<void> {
    try {
      // Extract learnings from the interaction
      const learnings = this.extractLearnings(interaction);
      
      // Update semantic memory with new concepts
      for (const learning of learnings) {
        const concept: SemanticMemory = {
          agentId,
          concept: learning.concept,
          knowledge: {
            definition: learning.description,
            properties: learning.properties || {},
            relationships: [],
            examples: [interaction.context],
            counterExamples: []
          },
          confidence: learning.confidence,
          sources: {
            episodeIds: [],
            externalSources: [interaction.interactionType],
            reinforcements: 1
          },
          usage: {
            timesAccessed: 1,
            lastUsed: new Date(),
            successRate: interaction.outcome === 'success' ? 1.0 : 0.0,
            contexts: [interaction.interactionType]
          }
        };

        await this.agentMemory.updateSemanticMemory(agentId, concept);
      }

      // Store interaction as knowledge in the Knowledge Graph
      await this.knowledgeGraph.ingest([{
        content: `Agent Interaction: ${interaction.interactionType}
Context: ${interaction.context}
Outcome: ${interaction.outcome}
Learning Points: ${interaction.learningPoints.join('; ')}
Performance: Efficiency=${interaction.performanceMetrics.efficiency}, Accuracy=${interaction.performanceMetrics.accuracy}`,
        type: KnowledgeType.EXPERIENTIAL,
        tags: [
          'agent-learning',
          `agent-${agentId}`,
          interaction.interactionType,
          interaction.outcome
        ],
        source: {
          type: SourceType.AGENT_INTERACTION,
          identifier: `interaction-${Date.now()}`,
          metadata: { agentId, interaction }
        },
        confidence: interaction.performanceMetrics.efficiency
      }]);

      // Check if memory consolidation is needed
      if (await this.agentMemory.shouldConsolidate(agentId)) {
        await this.agentMemory.consolidateMemories(agentId);
      }
    } catch (error) {
      console.error('Learning from interaction error:', error);
    }
  }

  /**
   * Generate direct LLM response for an agent (for external API use)
   */
  async generateAgentResponse(
    agentId: string,
    messages: any[],
    context?: any,
    userId?: string
  ): Promise<{
    response: string;
    model: string;
    tokensUsed?: number;
    confidence?: number;
    error?: string;
    knowledgeUsed: number;
    memoryEnhanced: boolean;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Get the agent
      const agent = await this.getAgent(agentId);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      // Search for relevant knowledge
      const lastMessage = messages[messages.length - 1];
      const userMessage = lastMessage?.content || lastMessage?.message || '';
      
      const relevantKnowledge = this.knowledgeGraph ? 
        await this.searchRelevantKnowledge(agentId, userMessage, context) : [];

      // Get working memory if available
      const workingMemory = this.agentMemory ? 
        await this.agentMemory.getWorkingMemory(agentId) : null;

      // Convert messages to LLM format
      const llmMessages: Message[] = messages.map((msg, index) => ({
        id: `msg-${index}`,
        content: msg.content || msg.message || String(msg),
        sender: msg.sender || msg.from || (msg.role === 'user' ? 'user' : 'assistant'),
        timestamp: msg.timestamp || new Date().toISOString(),
        type: msg.type || msg.role || 'user'
      }));

      // Build document context from knowledge and memory
      let documentContext: DocumentContext | undefined;
      if (relevantKnowledge.length > 0 || workingMemory) {
        const contextParts = [];
        
        if (relevantKnowledge.length > 0) {
          contextParts.push('Relevant Knowledge:');
          relevantKnowledge.slice(0, 3).forEach((k, i) => {
            contextParts.push(`${i + 1}. ${k.content.substring(0, 300)}...`);
          });
        }

        if (workingMemory?.shortTermMemory?.recentInteractions?.length > 0) {
          contextParts.push('\nRecent Memory:');
          const lastInteraction = workingMemory.shortTermMemory.recentInteractions[0];
          contextParts.push(`Previous interaction: ${lastInteraction.description} (${lastInteraction.success ? 'successful' : 'failed'})`);
        }

        if (context) {
          contextParts.push('\nAdditional Context:');
          contextParts.push(typeof context === 'string' ? context : JSON.stringify(context));
        }

        documentContext = {
          id: 'enhanced-context',
          title: 'Knowledge and Memory Context',
          content: contextParts.join('\n'),
          type: 'enhanced'
        };
      }

      // Use appropriate LLM service based on user context
      const agentRequest: AgentResponseRequest = {
        agent,
        messages: llmMessages,
        context: documentContext
      };

      // Use provided userId or fall back to agent's creator
      const effectiveUserId = userId || agent.createdBy;
      
      let llmResponse;
      if (effectiveUserId) {
        // Use user-specific LLM service if userId is available
        logger.info('Using user-specific LLM service for agent response', { agentId, userId: effectiveUserId, source: userId ? 'provided' : 'agent-creator' });
        llmResponse = await this.userLLMService.generateAgentResponse(effectiveUserId, agentRequest);
      } else {
        // Fall back to global LLM service
        logger.warn('No userId available (neither provided nor agent creator), using global LLM service for agent response', { agentId });
        llmResponse = await this.llmService.generateAgentResponse(agentRequest);
      }

      // Update working memory with this interaction if available
      if (this.agentMemory && !llmResponse.error) {
        try {
          const memoryUpdate: WorkingMemoryUpdate = {
            lastInteraction: {
              input: userMessage,
              response: llmResponse.content,
              timestamp: new Date(),
              confidence: llmResponse.confidence || 0.8
            },
            currentInput: userMessage,
            retrievedEpisodes: []
          };
          await this.agentMemory.updateWorkingMemory(agentId, memoryUpdate);
        } catch (memoryError) {
          logger.warn('Failed to update working memory', { agentId, error: memoryError });
        }
      }

      // Store interaction as knowledge
      if (this.knowledgeGraph && !llmResponse.error) {
        try {
          await this.storeInteractionKnowledge(agentId, { message: userMessage, context }, llmResponse.content, []);
        } catch (knowledgeError) {
          logger.warn('Failed to store interaction knowledge', { agentId, error: knowledgeError });
        }
      }

      await this.safePublishEvent('agent.response.generated', {
        agentId,
        userId,
        responseLength: llmResponse.content.length,
        tokensUsed: llmResponse.tokensUsed,
        knowledgeUsed: relevantKnowledge.length,
        memoryEnhanced: !!workingMemory,
        timestamp: new Date()
      });

      return {
        response: llmResponse.content,
        model: llmResponse.model,
        tokensUsed: llmResponse.tokensUsed,
        confidence: llmResponse.confidence,
        error: llmResponse.error,
        knowledgeUsed: relevantKnowledge.length,
        memoryEnhanced: !!workingMemory
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error generating agent response', { agentId, userId, error: errorMessage });
      
      if (error instanceof ApiError) {
        throw error;
      }
      
      throw new ApiError(500, 'Failed to generate agent response', 'RESPONSE_GENERATION_ERROR');
    }
  }

  /**
   * Get agent performance metrics enhanced with knowledge analytics
   */
  async getAgentMetrics(agentId: string, timeRange: { start: Date; end: Date }): Promise<AgentMetrics & {
    knowledgeStats: {
      totalKnowledgeItems: number;
      knowledgeByType: Record<string, number>;
      memoryHealth: 'good' | 'moderate' | 'poor';
    };
  }> {
    try {
      // Get basic agent metrics (would be implemented based on stored activities)
      const basicMetrics: AgentMetrics = {
        agentId,
        timeRange,
        totalActivities: 0,
        successRate: 0.8,
        averageResponseTime: 1500,
        performanceScore: 0.85,
        learningProgress: 0.7
      };

      // Get knowledge statistics
      const knowledgeStats = await this.knowledgeGraph.getStatistics();
      const memoryStats = await this.agentMemory.getMemoryStatistics(agentId);

      return {
        ...basicMetrics,
        knowledgeStats: {
          totalKnowledgeItems: knowledgeStats.totalItems,
          knowledgeByType: knowledgeStats.itemsByType,
          memoryHealth: memoryStats.memoryHealth
        }
      };
    } catch (error) {
      console.error('Agent metrics retrieval error:', error);
      throw new Error(`Failed to get agent metrics: ${error.message}`);
    }
  }

  // ===== LLM-POWERED ENHANCEMENT METHODS =====
  // These methods use the LLM service to provide enhanced AI capabilities

  /**
   * Perform LLM-powered context analysis
   */
  private async performLLMContextAnalysis(
    agent: Agent,
    conversationContext: any,
    userRequest: string,
    relevantKnowledge: KnowledgeItem[],
    similarEpisodes: Episode[]
  ): Promise<LLMContextAnalysis> {
    try {
      // Convert conversation context to LLM format
      const messages: Message[] = conversationContext.messages?.map((msg: any, index: number) => ({
        id: `msg-${index}`,
        content: msg.content || msg.message || String(msg),
        sender: msg.sender || msg.from || 'user',
        timestamp: msg.timestamp || new Date().toISOString(),
        type: msg.type || 'user'
      })) || [];

      // Build context request for LLM
      const contextRequest: LLMContextRequest = {
        conversationHistory: messages,
        userRequest,
        agentCapabilities: agent.persona?.capabilities || []
      };

      // Add relevant knowledge as context if available
      if (relevantKnowledge.length > 0) {
        contextRequest.currentContext = {
          id: 'knowledge-context',
          title: 'Relevant Knowledge',
          content: relevantKnowledge.slice(0, 3).map(k => k.content).join('\n\n'),
          type: 'knowledge'
        };
      }

      return await this.llmService.analyzeContext(contextRequest);
    } catch (error) {
      logger.error('Error in LLM context analysis', { error });
      // Return fallback analysis
      return {
        content: 'Context analysis completed with basic methods',
        model: 'fallback',
        analysis: {
          intent: {
            primary: this.extractPrimaryIntent(userRequest),
            secondary: [],
            confidence: 0.6
          },
          context: {
            messageCount: conversationContext.messages?.length || 0,
            participants: conversationContext.participants || [],
            topics: this.extractTopics(conversationContext.messages || []),
            sentiment: 'neutral',
            complexity: 'medium'
          },
          recommendations: []
        }
      };
    }
  }

  /**
   * Analyze user intent using LLM
   */
  private async analyzeLLMUserIntent(userRequest: string, conversationContext: any, agent: Agent, userId?: string): Promise<any> {
    try {
      const llmRequest: LLMRequest = {
        prompt: `Analyze the user's intent from this request: "${userRequest}"

Context: ${JSON.stringify(conversationContext, null, 2)}

Please identify:
1. Primary intent (create, analyze, modify, information, etc.)
2. Secondary intents
3. Confidence level (0-1)
4. Key entities mentioned
5. Sentiment (positive, negative, neutral)

Respond in JSON format.`,
        systemPrompt: `You are an expert at analyzing user intent. Provide structured analysis in JSON format with fields: primary, secondary, confidence, entities, sentiment.`,
        maxTokens: 200,
        temperature: 0.3
      };

      let response;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        response = await this.llmService.generateResponse(llmRequest);
      }
      
      if (response.error) {
        return this.analyzeUserIntent(userRequest);
      }

      try {
        const parsed = JSON.parse(response.content);
        return {
          primary: parsed.primary || this.extractPrimaryIntent(userRequest),
          secondary: parsed.secondary || [],
          confidence: parsed.confidence || 0.7,
          entities: parsed.entities || this.extractEntities(userRequest),
          sentiment: parsed.sentiment || this.analyzeSentiment([{ content: userRequest }])
        };
      } catch (parseError) {
        logger.warn('Failed to parse LLM intent analysis, using fallback', { parseError });
        return this.analyzeUserIntent(userRequest);
      }
    } catch (error) {
      logger.error('Error in LLM intent analysis', { error });
      return this.analyzeUserIntent(userRequest);
    }
  }

  /**
   * Generate enhanced action recommendations using LLM
   */
  private async generateLLMEnhancedActionRecommendations(
    agent: Agent,
    contextAnalysis: any,
    intentAnalysis: any,
    constraints: any,
    relevantKnowledge: KnowledgeItem[],
    similarEpisodes: Episode[],
    userId?: string
  ): Promise<any[]> {
    try {
      const llmRequest: LLMRequest = {
        prompt: `Based on the following analysis, recommend specific actions:

User Intent: ${intentAnalysis.primary}
Context: ${JSON.stringify(contextAnalysis, null, 2)}
Agent Capabilities: ${JSON.stringify(agent.persona?.capabilities || [])}
Constraints: ${JSON.stringify(constraints || {})}
Available Knowledge: ${relevantKnowledge.length} items
Similar Past Episodes: ${similarEpisodes.length} episodes

Please recommend 2-4 specific actions with:
1. Action type (artifact_generation, tool_execution, etc.)
2. Confidence score (0-1)
3. Description
4. Estimated duration in seconds
5. Whether knowledge/memory support is available

Respond in JSON array format.`,
        systemPrompt: `You are an expert at recommending actions for AI agents. Provide practical, actionable recommendations in JSON array format.`,
        maxTokens: 400,
        temperature: 0.4
      };

      let response;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        response = await this.llmService.generateResponse(llmRequest);
      }
      
      if (response.error) {
        return this.generateEnhancedActionRecommendations(
          agent, contextAnalysis, intentAnalysis, constraints, relevantKnowledge, similarEpisodes
        );
      }

      try {
        const parsed = JSON.parse(response.content);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (parseError) {
        logger.warn('Failed to parse LLM action recommendations, using fallback', { parseError });
        return this.generateEnhancedActionRecommendations(
          agent, contextAnalysis, intentAnalysis, constraints, relevantKnowledge, similarEpisodes
        );
      }
    } catch (error) {
      logger.error('Error in LLM action recommendations', { error });
      return this.generateEnhancedActionRecommendations(
        agent, contextAnalysis, intentAnalysis, constraints, relevantKnowledge, similarEpisodes
      );
    }
  }

  /**
   * Generate enhanced explanation using LLM
   */
  private async generateLLMEnhancedExplanation(
    contextAnalysis: any,
    intentAnalysis: any,
    actionRecommendations: any[],
    confidence: number,
    relevantKnowledge: KnowledgeItem[],
    similarEpisodes: Episode[],
    agent: Agent,
    userId?: string
  ): Promise<string> {
    try {
      const llmRequest: LLMRequest = {
        prompt: `Generate a clear explanation for the user about my analysis and recommendations:

Intent Analysis: ${JSON.stringify(intentAnalysis)}
Recommended Actions: ${JSON.stringify(actionRecommendations)}
Confidence Level: ${Math.round(confidence * 100)}%
Knowledge Used: ${relevantKnowledge.length} items
Past Experience: ${similarEpisodes.length} similar episodes

Please explain:
1. What I understood from their request
2. Why I'm recommending these actions
3. How confident I am and why
4. What knowledge/experience I'm drawing from

Keep it conversational and helpful, as if speaking directly to the user.`,
        systemPrompt: `You are ${agent.name || 'an AI assistant'} explaining your analysis to a user. Be clear, helpful, and conversational. Explain your reasoning in a way that builds trust and understanding.`,
        maxTokens: 300,
        temperature: 0.6
      };

      let response;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        response = await this.llmService.generateResponse(llmRequest);
      }
      
      if (response.error) {
        return this.generateEnhancedExplanation(
          contextAnalysis, intentAnalysis, actionRecommendations, confidence, relevantKnowledge, similarEpisodes
        );
      }

      return response.content;
    } catch (error) {
      logger.error('Error in LLM explanation generation', { error });
      return this.generateEnhancedExplanation(
        contextAnalysis, intentAnalysis, actionRecommendations, confidence, relevantKnowledge, similarEpisodes
      );
    }
  }

  // ===== ENHANCED HELPER METHODS =====
  // These methods provide enhanced functionality for the basic operations

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
    // Enhanced intent analysis with knowledge graph support
    const intent = this.extractPrimaryIntent(userRequest);
    return {
      primary: intent,
      confidence: this.calculateIntentConfidence(userRequest, intent),
      entities: this.extractEntities(userRequest),
      sentiment: this.analyzeSentiment([{ content: userRequest }])
    };
  }

  private async generateEnhancedActionRecommendations(
    agent: Agent,
    contextAnalysis: any,
    intentAnalysis: any,
    constraints: any,
    relevantKnowledge: KnowledgeItem[],
    similarEpisodes: Episode[]
  ): Promise<any[]> {
    const recommendations = [];

    // Base recommendations from original logic
    switch (intentAnalysis.primary) {
      case 'create':
        recommendations.push({
          type: 'artifact_generation',
          confidence: 0.8,
          description: 'Generate artifact based on requirements',
          estimatedDuration: 120,
          knowledgeSupport: relevantKnowledge.length > 0
        });
        break;
      case 'analyze':
        recommendations.push({
          type: 'tool_execution',
          confidence: 0.9,
          description: 'Execute analysis tools',
          estimatedDuration: 60,
          knowledgeSupport: relevantKnowledge.length > 0
        });
        break;
      case 'modify':
        recommendations.push({
          type: 'hybrid_workflow',
          confidence: 0.7,
          description: 'Analyze current state and apply modifications',
          estimatedDuration: 180,
          knowledgeSupport: relevantKnowledge.length > 0
        });
        break;
      default:
        recommendations.push({
          type: 'information_retrieval',
          confidence: 0.6,
          description: 'Retrieve relevant information',
          estimatedDuration: 30,
          knowledgeSupport: relevantKnowledge.length > 0
        });
    }

    // Enhance recommendations with knowledge insights
    if (relevantKnowledge.length > 0) {
      recommendations.push({
        type: 'knowledge_synthesis',
        confidence: 0.85,
        description: `Synthesize insights from ${relevantKnowledge.length} knowledge items`,
        estimatedDuration: 45,
        knowledgeSupport: true
      });
    }

    // Add memory-based recommendations
    if (similarEpisodes.length > 0) {
      recommendations.push({
        type: 'experience_application',
        confidence: 0.75,
        description: `Apply learnings from ${similarEpisodes.length} similar experiences`,
        estimatedDuration: 30,
        memorySupport: true
      });
    }

    return recommendations;
  }

  private calculateEnhancedConfidence(
    contextAnalysis: any,
    intentAnalysis: any,
    actionRecommendations: any[],
    intelligenceConfig: any,
    relevantKnowledge: KnowledgeItem[],
    workingMemory: any
  ): number {
    const baseConfidence = intentAnalysis.confidence;
    const contextQuality = Math.min(contextAnalysis.messageCount / 10, 1);
    const recommendationConfidence = actionRecommendations.reduce(
      (sum, rec) => sum + rec.confidence, 0
    ) / actionRecommendations.length;
    
    // Knowledge enhancement factor
    const knowledgeBoost = Math.min(relevantKnowledge.length * 0.1, 0.3);
    
    // Memory enhancement factor
    const memoryBoost = workingMemory ? 0.1 : 0;
    
    return Math.min((baseConfidence + contextQuality + recommendationConfidence + knowledgeBoost + memoryBoost) / 3, 1);
  }

  private generateEnhancedExplanation(
    contextAnalysis: any,
    intentAnalysis: any,
    actionRecommendations: any[],
    confidence: number,
    relevantKnowledge: KnowledgeItem[],
    similarEpisodes: Episode[]
  ): string {
    let explanation = `Based on the conversation context with ${contextAnalysis.messageCount} messages and detected intent '${intentAnalysis.primary}', I recommend ${actionRecommendations.length} action(s).`;
    
    if (relevantKnowledge.length > 0) {
      explanation += ` I found ${relevantKnowledge.length} relevant knowledge items to inform my recommendations.`;
    }
    
    if (similarEpisodes.length > 0) {
      explanation += ` I can also draw from ${similarEpisodes.length} similar past experiences.`;
    }
    
    explanation += ` Confidence level: ${Math.round(confidence * 100)}%.`;
    
    return explanation;
  }

  private extractAgentCapabilities(agent: Agent): any {
    return {
      tools: agent.intelligenceConfig?.collaborationMode || 'collaborative',
      artifacts: agent.intelligenceConfig?.analysisDepth || 'intermediate',
      specializations: agent.persona?.capabilities || [],
      limitations: agent.securityContext?.restrictedDomains || [],
      knowledgeAccess: true,
      memoryEnabled: true
    };
  }

  private analyzeEnvironmentFactors(conversationContext: any): any {
    return {
      timeOfDay: new Date().getHours(),
      userLoad: conversationContext.participants?.length || 1,
      systemLoad: 'normal',
      availableResources: 'high',
      knowledgeGraphStatus: 'active',
      memorySystemStatus: 'active'
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

  private async generateEnhancedPlanSteps(agent: Agent, analysis: any, planType: string, knowledge: KnowledgeItem[]): Promise<any[]> {
    const baseSteps = [
      {
        id: 'validate_input',
        type: 'validation',
        description: 'Validate input parameters and permissions',
        estimatedDuration: 10,
        required: true
      }
    ];

    // Add knowledge preparation step if relevant knowledge exists
    if (knowledge.length > 0) {
      baseSteps.push({
        id: 'prepare_knowledge',
        type: 'knowledge_preparation',
        description: `Prepare and contextualize ${knowledge.length} knowledge items`,
        estimatedDuration: 20,
        required: true
      });
    }

    switch (planType) {
      case 'tool_execution':
        baseSteps.push({
          id: 'execute_tools',
          type: 'execution',
          description: 'Execute selected tools with knowledge enhancement',
          estimatedDuration: 60,
          required: true
        });
        break;
      case 'artifact_generation':
        baseSteps.push({
          id: 'generate_artifact',
          type: 'generation',
          description: 'Generate requested artifact with knowledge integration',
          estimatedDuration: 120,
          required: true
        });
        break;
      case 'hybrid_workflow':
        baseSteps.push(
          {
            id: 'analyze_current_state',
            type: 'analysis',
            description: 'Analyze current system state with knowledge context',
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
      description: 'Process and return results with learning integration',
      estimatedDuration: 15,
      required: true
    });

    return baseSteps;
  }

  private async calculateEnhancedDependencies(steps: any[], knowledge: KnowledgeItem[]): Promise<any[]> {
    // Enhanced dependency calculation with knowledge graph insights
    const dependencies = [];
    
    for (let i = 1; i < steps.length; i++) {
      dependencies.push({
        stepId: steps[i].id,
        dependsOn: [steps[i-1].id],
        type: 'sequential'
      });
    }
    
    return dependencies;
  }

  private async estimateEnhancedDuration(steps: any[], dependencies: any[], agentId: string): Promise<number> {
    // Get historical performance data for this agent
    const baseDuration = steps.reduce((sum, step) => sum + step.estimatedDuration, 0);
    
    // Apply agent-specific performance modifiers
    const performanceModifier = 0.9; // Assume enhanced agents are 10% faster
    
    return Math.round(baseDuration * performanceModifier);
  }

  private applyEnhancedUserPreferences(steps: any[], userPreferences: any, knowledge: KnowledgeItem[]): any[] {
    // Apply user preferences with knowledge-based optimization
    if (userPreferences?.priority === 'speed') {
      return steps.map(step => ({
        ...step,
        estimatedDuration: Math.round(step.estimatedDuration * 0.8)
      }));
    }
    
    if (userPreferences?.priority === 'quality') {
      return steps.map(step => ({
        ...step,
        estimatedDuration: Math.round(step.estimatedDuration * 1.2),
        qualityEnhanced: true
      }));
    }
    
    return steps;
  }

  private async validatePlanSecurity(plan: ExecutionPlan, securityContext: any): Promise<void> {
    // Enhanced security validation
    if (securityContext?.constraints?.length > 0) {
      for (const constraint of securityContext.constraints) {
        // Validate each constraint against the plan
        logger.debug('Validating security constraint', { constraint, planId: plan.id });
      }
    }
  }

  private async storePlan(plan: ExecutionPlan): Promise<void> {
    // Use DatabaseService storeExecutionPlan method instead of raw SQL
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
      createdAt: plan.created_at
    });
  }

  private async getOperation(operationId: string): Promise<any> {
    // Use DatabaseService getOperationById method instead of raw SQL
    return await this.databaseService.getOperationById(operationId);
  }

  private async extractEnhancedLearning(operation: any, outcomes: any, feedback: any): Promise<any> {
    return {
      newKnowledge: feedback?.insights || [],
      improvedCapabilities: outcomes?.successfulActions || [],
      adjustedStrategies: feedback?.improvements || [],
      enhancedInsights: [
        `Operation ${operation.id} completed with ${outcomes?.success ? 'success' : 'failure'}`,
        `Key learnings: ${feedback?.keyLearnings?.join(', ') || 'None specified'}`
      ]
    };
  }

  private async updateKnowledgeGraph(agentId: string, learningData: any): Promise<void> {
    // Update knowledge graph with new learning insights
    if (this.knowledgeGraph && learningData.enhancedInsights?.length > 0) {
      await this.knowledgeGraph.ingest(learningData.enhancedInsights.map((insight: string) => ({
        content: insight,
        type: KnowledgeType.EXPERIENTIAL,
        tags: ['agent-learning', `agent-${agentId}`, 'operation-feedback'],
        source: {
          type: SourceType.AGENT_INTERACTION,
          identifier: `learning-${Date.now()}`,
          metadata: { agentId, learningData }
        },
        confidence: 0.8
      })));
    }
  }

  private async storeOperationEpisode(agentId: string, operationId: string, operation: any, outcomes: any, feedback: any, learningData: any): Promise<void> {
    // Store operation as episodic memory
    if (this.agentMemory) {
      const episode: Episode = {
        agentId,
        episodeId: `operation-${operationId}`,
        type: 'operation',
        context: {
          when: new Date(),
          where: 'system',
          who: [agentId],
          what: `Executed operation ${operation.type}`,
          why: operation.purpose || 'Task execution',
          how: operation.method || 'Standard procedure'
        },
        experience: {
          actions: [{
            id: operationId,
            description: `Executed ${operation.type} operation`,
            type: 'execution',
            timestamp: new Date(),
            success: outcomes?.success || false
          }],
          decisions: [],
          outcomes: [{
            id: `outcome-${operationId}`,
            description: outcomes?.description || 'Operation completed',
            type: 'execution',
            success: outcomes?.success || false,
            impact: outcomes?.impact || 0.5,
            timestamp: new Date()
          }],
          emotions: [],
          learnings: learningData.enhancedInsights || []
        },
        significance: {
          importance: outcomes?.importance || 0.5,
          novelty: 0.3,
          success: outcomes?.success ? 1.0 : 0.0,
          impact: outcomes?.impact || 0.5
        },
        connections: {
          relatedEpisodes: [],
          triggeredBy: [operationId],
          ledTo: [],
          similarTo: []
        }
      };

      await this.agentMemory.storeEpisode(agentId, episode);
    }
  }

  private async updateSemanticMemoryFromOperation(agentId: string, learningData: any): Promise<void> {
    // Update semantic memory with operation learnings
    if (this.agentMemory && learningData.newKnowledge?.length > 0) {
      for (const knowledge of learningData.newKnowledge) {
        const concept: SemanticMemory = {
          agentId,
          concept: `operation_learning_${Date.now()}`,
          knowledge: {
            definition: knowledge,
            properties: {},
            relationships: [],
            examples: [],
            counterExamples: []
          },
          confidence: 0.7,
          sources: {
            episodeIds: [],
            externalSources: ['operation_feedback'],
            reinforcements: 1
          },
          usage: {
            timesAccessed: 1,
            lastUsed: new Date(),
            successRate: 1.0,
            contexts: ['operation_learning']
          }
        };

        await this.agentMemory.updateSemanticMemory(agentId, concept);
      }
    }
  }

  private calculateEnhancedConfidenceAdjustments(operation: any, outcomes: any, feedback: any, learningData: any): any {
    return {
      overall: outcomes?.success ? 0.1 : -0.1,
      specific: learningData.improvedCapabilities?.map((cap: string) => ({
        capability: cap,
        adjustment: 0.05
      })) || []
    };
  }

  private async storeEnhancedLearningRecord(agentId: string, operationId: string, learningData: any, confidenceAdjustments: any): Promise<void> {
    // Use DatabaseService storeEnhancedLearningRecord method instead of raw SQL
    await this.databaseService.storeEnhancedLearningRecord({
      agentId: agentId,
      operationId: operationId,
      learningData,
      confidenceAdjustments
    });
  }

  private async storeAnalysisKnowledge(agentId: string, userRequest: string, analysis: AgentAnalysis): Promise<void> {
    if (this.knowledgeGraph) {
      await this.knowledgeGraph.ingest([{
        content: `Context Analysis: ${userRequest}
Analysis Result: ${analysis.explanation}
Confidence: ${analysis.confidence}
Actions: ${analysis.recommendedActions?.map(a => a.type).join(', ')}`,
        type: KnowledgeType.EXPERIENTIAL,
        tags: ['context-analysis', `agent-${agentId}`, 'enhanced-analysis'],
        source: {
          type: SourceType.AGENT_INTERACTION,
          identifier: `analysis-${Date.now()}`,
          metadata: { agentId, userRequest, analysis }
        },
        confidence: analysis.confidence
      }]);
    }
  }

  private async storePlanKnowledge(agentId: string, plan: ExecutionPlan, analysis: any): Promise<void> {
    if (this.knowledgeGraph) {
      await this.knowledgeGraph.ingest([{
        content: `Execution Plan: ${plan.type}
Steps: ${plan.steps?.length}
Duration: ${plan.estimatedDuration}
Based on Analysis: ${analysis.intent?.primary}`,
        type: KnowledgeType.PROCEDURAL,
        tags: ['execution-plan', `agent-${agentId}`, plan.type],
        source: {
          type: SourceType.AGENT_INTERACTION,
          identifier: `plan-${plan.id}`,
          metadata: { agentId, plan, analysis }
        },
        confidence: 0.8
      }]);
    }
  }

  private extractTopics(messages: any[]): string[] {
    // Simple topic extraction
    return ['general'];
  }

  private analyzeSentiment(messages: any[]): string {
    // Simple sentiment analysis
    return 'neutral';
  }

  private assessComplexity(context: any): string {
    return context.messages?.length > 10 ? 'high' : 'low';
  }

  private detectUrgency(context: any): string {
    return 'normal';
  }

  private extractPrimaryIntent(userRequest: string): string {
    const request = userRequest.toLowerCase();
    if (request.includes('create') || request.includes('generate') || request.includes('make')) {
      return 'create';
    }
    if (request.includes('analyze') || request.includes('examine') || request.includes('study')) {
      return 'analyze';
    }
    if (request.includes('modify') || request.includes('change') || request.includes('update')) {
      return 'modify';
    }
    return 'information';
  }

  private calculateIntentConfidence(userRequest: string, intent: string): number {
    // Simple confidence calculation based on keyword presence
    return 0.8;
  }

  private extractEntities(userRequest: string): string[] {
    // Simple entity extraction
    return [];
  }

  // ===== ORIGINAL ENHANCED METHODS =====
  // These are the original advanced methods from the enhanced service

  // Private helper methods

  private async searchRelevantKnowledge(agentId: string, query: string, context?: any): Promise<KnowledgeItem[]> {
    if (!this.knowledgeGraph) {
      return [];
    }

    const searchRequest: KnowledgeSearchRequest = {
      query,
      filters: {
        tags: [`agent-${agentId}`],
        confidence: 0.5
      },
      options: {
        limit: 5,
        similarityThreshold: 0.6
      },
      timestamp: Date.now()
    };

    const results = await this.knowledgeGraph.search(searchRequest);
    return results.items;
  }

  private async generateReasoning(
    input: string, 
    knowledge: KnowledgeItem[], 
    episodes: Episode[], 
    workingMemory: any
  ): Promise<string[]> {
    const reasoning: string[] = [];

    // Analyze input
    reasoning.push(`Analyzing input: "${input}"`);

    // Consider relevant knowledge
    if (knowledge.length > 0) {
      reasoning.push(`Found ${knowledge.length} relevant knowledge items`);
      reasoning.push(`Key knowledge: ${knowledge.map(k => k.tags.join(', ')).join('; ')}`);
    }

    // Consider past episodes
    if (episodes.length > 0) {
      reasoning.push(`Found ${episodes.length} similar past episodes`);
      reasoning.push(`Past outcomes: ${episodes.map(e => e.significance.success).join(', ')}`);
    }

    // Consider current context
    if (workingMemory?.currentContext) {
      reasoning.push('Considering current working memory context');
    }

    return reasoning;
  }

  private async generateResponse(input: string, reasoning: string[], knowledge: KnowledgeItem[], userId?: string): Promise<string> {
    try {
      // Build context from knowledge and reasoning
      let contextInfo = '';
      if (knowledge.length > 0) {
        contextInfo += '\nRelevant Knowledge:\n';
        knowledge.slice(0, 3).forEach((item, index) => {
          contextInfo += `${index + 1}. ${item.content.substring(0, 200)}...\n`;
        });
      }

      if (reasoning.length > 0) {
        contextInfo += '\nReasoning Process:\n';
        reasoning.forEach((step, index) => {
          contextInfo += `${index + 1}. ${step}\n`;
        });
      }

      // Use LLM to generate a thoughtful response
      const llmRequest: LLMRequest = {
        prompt: `User Input: "${input}"

${contextInfo}

Please provide a helpful, accurate response based on the available knowledge and reasoning. Be concise but informative.`,
        systemPrompt: `You are an AI assistant that provides helpful responses based on available knowledge and reasoning. 
- Be direct and accurate
- Use the provided knowledge and reasoning to inform your response
- If you don't have enough information, acknowledge limitations
- Keep responses focused and relevant`,
        maxTokens: 300,
        temperature: 0.7
      };

      let response;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        response = await this.llmService.generateResponse(llmRequest);
      }
      
      if (response.error) {
        logger.warn('LLM response generation failed, falling back to structured response', { error: response.error });
        return this.generateFallbackResponse(input, reasoning, knowledge);
      }

      return response.content;
    } catch (error) {
      logger.error('Error generating LLM response', { error });
      return this.generateFallbackResponse(input, reasoning, knowledge);
    }
  }

  private generateFallbackResponse(input: string | Agent, reasoning: string[] | any, knowledge: KnowledgeItem[] | any): string {
    // Handle different parameter types for unified fallback response generation
    if (typeof input === 'string') {
      // Original signature: (input: string, reasoning: string[], knowledge: KnowledgeItem[])
      let response = `Based on my analysis of "${input}", `;
      
      if (Array.isArray(knowledge) && knowledge.length > 0) {
        response += `I found relevant knowledge about ${knowledge[0].tags?.slice(0, 2).join(' and ') || 'relevant topics'}. `;
      }
      
      if (Array.isArray(reasoning) && reasoning.length > 2) {
        response += `My reasoning process considered ${reasoning.length} factors. `;
      }
      
      response += 'I can provide more specific information if needed.';
      return response;
    } else {
      // Agent signature: (agent: Agent, context: any, knowledge: KnowledgeItem[])
      const agent = input;
      const context = reasoning;
      const knowledgeItems = knowledge;
      
      const responses = [
        `That's an interesting point about ${context?.discussionTopic || 'this topic'}. I'd like to add that we should consider the broader implications.`,
        `Based on my understanding, there are several factors we should examine more closely.`,
        `I think there's value in exploring different perspectives on this matter.`,
        `This discussion highlights some important considerations that deserve deeper analysis.`,
        `I appreciate the insights shared so far. Let me contribute a different angle to consider.`
      ];
      
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }

  private async generateDiscussionResponseInternal(
    message: string, 
    discussion: any, 
    knowledge: KnowledgeItem[],
    agentId: string,
    userId?: string
  ): Promise<string> {
    try {
      // Get the agent for context
      const agent = await this.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // Build discussion context for LLM
      const llmRequest: LLMRequest = {
        prompt: `I'm participating in a discussion about "${discussion.topic}".

Current message to respond to: "${message}"

Discussion context:
- Topic: ${discussion.topic}
- Participants: ${discussion.participants?.length || 0} people
- My role: Contributor and knowledge provider

${knowledge.length > 0 ? `
Relevant knowledge I can contribute:
${knowledge.slice(0, 3).map((k, i) => `${i + 1}. ${k.content.substring(0, 300)}...`).join('\n')}
` : ''}

Please provide a thoughtful, constructive response that:
1. Directly addresses the message
2. Contributes valuable insights
3. Uses relevant knowledge if available
4. Maintains a collaborative tone
5. Keeps the discussion moving forward

Keep the response concise but meaningful.`,
        systemPrompt: `You are ${agent.name || 'an AI assistant'} participating in a collaborative discussion. 
Your role is to contribute thoughtful, evidence-based insights while maintaining a respectful and collaborative tone. 
${agent.persona?.description ? `Your personality: ${agent.persona.description}` : ''}
Be helpful, knowledgeable, and constructive in your contributions.`,
        maxTokens: 200,
        temperature: 0.7
      };

      let response;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        response = await this.llmService.generateResponse(llmRequest);
      }
      
      if (response.error) {
        logger.warn('LLM discussion response failed, using fallback', { error: response.error });
        return this.generateFallbackDiscussionResponse(message, discussion, knowledge);
      }

      return response.content;
    } catch (error) {
      logger.error('Error generating LLM discussion response', { error, agentId });
      return this.generateFallbackDiscussionResponse(message, discussion, knowledge);
    }
  }

  private generateFallbackDiscussionResponse(
    message: string, 
    discussion: any, 
    knowledge: KnowledgeItem[]
  ): string {
    let response = `Regarding the discussion on ${discussion.topic}, `;
    
    if (knowledge.length > 0) {
      response += `I can contribute knowledge about ${knowledge[0].tags.slice(0, 2).join(' and ')}. `;
    }
    
    response += `In response to "${message}", I believe we should consider the broader context and available evidence.`;
    
    return response;
  }

  private async storeInteractionKnowledge(
    agentId: string, 
    input: any, 
    response: string, 
    reasoning: string[]
  ): Promise<void> {
    const ingestRequest: KnowledgeIngestRequest = {
      content: `Agent Interaction:
Input: ${input.message}
Response: ${response}
Reasoning: ${reasoning.join('; ')}
Context: ${JSON.stringify(input.context || {})}`,
      type: KnowledgeType.EXPERIENTIAL,
      tags: ['agent-interaction', `agent-${agentId}`, 'conversation'],
      source: {
        type: SourceType.AGENT_INTERACTION,
        identifier: `interaction-${Date.now()}`,
        metadata: { agentId, input, response, reasoning }
      },
      confidence: 0.7
    };

    await this.knowledgeGraph.ingest([ingestRequest]);
  }

  private extractLearnings(interaction: AgentInteraction): Array<{
    concept: string;
    description: string;
    confidence: number;
    properties?: Record<string, any>;
  }> {
    const learnings: Array<{
      concept: string;
      description: string;
      confidence: number;
      properties?: Record<string, any>;
    }> = [];

    // Extract concepts from learning points
    for (const learningPoint of interaction.learningPoints) {
      learnings.push({
        concept: `${interaction.interactionType}_learning`,
        description: learningPoint,
        confidence: interaction.performanceMetrics.efficiency,
        properties: {
          interactionType: interaction.interactionType,
          outcome: interaction.outcome
        }
      });
    }

    return learnings;
  }

  /**
   * Auto-participate agent in active discussions
   */
  async autoParticipateInDiscussions(agentId: string): Promise<{
    participations: Array<{
      discussionId: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const validatedId = this.validateIDParam(agentId, 'agentId');
      
      // Get agent details
      const agent = await this.getAgent(validatedId);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }
      
      // Find active discussions that this agent could participate in
      // For now, we'll simulate finding discussions - in a real implementation,
      // this would query the discussion service for active discussions
      const activeDiscussions = await this.findActiveDiscussions(validatedId);
      
      const participations = [];
      
      for (const discussion of activeDiscussions) {
        try {
          // Check if agent is already a participant
          const isParticipant = discussion.participants?.some(
            (p: any) => p.agentId === validatedId
          );
          
          if (!isParticipant) {
            // Add agent as participant
            await this.discussionService?.addParticipant(discussion.id, {
              agentId: validatedId,
              role: 'participant'
            });
            
            participations.push({
              discussionId: discussion.id,
              success: true
            });
            
            logger.info('Agent added to discussion', {
              agentId: validatedId,
              discussionId: discussion.id
            });
          } else {
            participations.push({
              discussionId: discussion.id,
              success: true,
              error: 'Already participating'
            });
          }
        } catch (error) {
          participations.push({
            discussionId: discussion.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          logger.warn('Failed to add agent to discussion', {
            agentId: validatedId,
            discussionId: discussion.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      await this.safePublishEvent('agent.discussions.auto_joined', {
        agentId: validatedId,
        participations,
        timestamp: new Date()
      });
      
      return { participations };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in auto-participate discussions', { agentId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Generate an intelligent response for discussion participation
   */
  async generateDiscussionResponse(
    agentId: string,
    discussionId: string,
    context: {
      lastMessage?: string;
      discussionTopic?: string;
      participantCount?: number;
      messageHistory?: any[];
    }
  ): Promise<{
    response: string;
    confidence: number;
    reasoning: string[];
    shouldRespond: boolean;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const validatedAgentId = this.validateIDParam(agentId, 'agentId');
      const validatedDiscussionId = this.validateIDParam(discussionId, 'discussionId');
      
      // Get agent details
      const agent = await this.getAgent(validatedAgentId);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }
      
      // Analyze if agent should respond
      const shouldRespond = await this.shouldAgentRespond(agent, context);
      
      if (!shouldRespond) {
        return {
          response: '',
          confidence: 0,
          reasoning: ['Agent determined it should not respond at this time'],
          shouldRespond: false
        };
      }
      
      // Get relevant knowledge for the discussion
      const relevantKnowledge = this.knowledgeGraph ? 
        await this.searchRelevantKnowledge(
          validatedAgentId, 
          context.lastMessage || context.discussionTopic || '',
          context
        ) : [];
      
      // Generate reasoning
      const reasoning = [
        `Analyzing discussion context for agent ${agent.name}`,
        `Topic: ${context.discussionTopic || 'General discussion'}`,
        `Participants: ${context.participantCount || 1}`,
        `Available knowledge: ${relevantKnowledge.length} items`
      ];
      
      // Generate response using LLM
      const response = await this.generateIntelligentResponse(
        agent,
        context,
        relevantKnowledge,
        reasoning,
        agent.createdBy
      );
      
      // Calculate confidence based on knowledge availability and context clarity
      const confidence = this.calculateResponseConfidence(
        context,
        relevantKnowledge,
        agent
      );
      
      return {
        response,
        confidence,
        reasoning,
        shouldRespond: true
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error generating discussion response', { 
        agentId, 
        discussionId, 
        error: errorMessage 
      });
      throw error;
    }
  }

  /**
   * Automatically generate and send discussion messages for active agents
   */
  async autoGenerateDiscussionMessages(): Promise<{
    messagesGenerated: number;
    errors: string[];
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const agents = await this.getAgents();
      const activeAgents = agents.filter(agent => agent.isActive);
      
      let messagesGenerated = 0;
      const errors: string[] = [];
      
      for (const agent of activeAgents) {
        try {
          // Find discussions this agent is participating in
          const agentDiscussions = await this.findAgentDiscussions(agent.id);
          
          for (const discussion of agentDiscussions) {
            // Check if it's the agent's turn or if they should contribute
            const shouldContribute = await this.shouldAgentContribute(
              agent.id,
              discussion.id,
              discussion
            );
            
            if (shouldContribute) {
              const responseData = await this.generateDiscussionResponse(
                agent.id,
                discussion.id,
                {
                  discussionTopic: discussion.topic,
                  participantCount: discussion.participants?.length || 0,
                  messageHistory: discussion.messages?.slice(-5) || []
                }
              );
              
              if (responseData.shouldRespond && responseData.response) {
                // Send the message to the discussion
                await this.discussionService?.sendMessage(
                  discussion.id,
                  agent.id, // This should be participant ID, but we'll use agent ID for now
                  responseData.response,
                  'text' as any // Cast to avoid type error
                );
                
                messagesGenerated++;
                
                logger.info('Auto-generated discussion message', {
                  agentId: agent.id,
                  discussionId: discussion.id,
                  confidence: responseData.confidence
                });
              }
            }
          }
        } catch (error) {
          const errorMessage = `Agent ${agent.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMessage);
          logger.warn('Failed to auto-generate message for agent', {
            agentId: agent.id,
            error: errorMessage
          });
        }
      }
      
      await this.safePublishEvent('agent.discussions.auto_messages_generated', {
        messagesGenerated,
        errors: errors.length,
        timestamp: new Date()
      });
      
      return {
        messagesGenerated,
        errors
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in auto-generate discussion messages', { error: errorMessage });
      throw error;
    }
  }

  // ===== PRIVATE HELPER METHODS FOR DISCUSSION AUTOMATION =====

  private async findActiveDiscussions(agentId: string): Promise<any[]> {
    // This would typically query the discussion service
    // For now, return empty array - implement based on your discussion service API
    try {
      if (this.discussionService) {
        // Implement actual query when discussion service supports it
        return [];
      }
      return [];
    } catch (error) {
      logger.warn('Failed to find active discussions', { agentId, error });
      return [];
    }
  }

  private async findAgentDiscussions(agentId: string): Promise<any[]> {
    // Find discussions where this agent is a participant
    try {
      if (this.discussionService) {
        // Implement actual query when discussion service supports it
        return [];
      }
      return [];
    } catch (error) {
      logger.warn('Failed to find agent discussions', { agentId, error });
      return [];
    }
  }

  private async shouldAgentRespond(agent: Agent, context: any): Promise<boolean> {
    // Intelligent decision making about whether agent should respond
    
    // Don't respond if no context
    if (!context.lastMessage && !context.discussionTopic) {
      return false;
    }
    
    // Don't respond too frequently (simple rate limiting)
    const lastResponseTime = agent.lastActiveAt;
    if (lastResponseTime) {
      const timeSinceLastResponse = Date.now() - lastResponseTime.getTime();
      if (timeSinceLastResponse < 30000) { // 30 seconds minimum between responses
        return false;
      }
    }
    
    // Agent should respond if they have relevant expertise
    if (context.discussionTopic && agent.persona?.capabilities) {
      const topicKeywords = context.discussionTopic.toLowerCase().split(' ');
      const hasRelevantExpertise = agent.persona.capabilities.some((capability: string) =>
        topicKeywords.some(keyword => capability.toLowerCase().includes(keyword))
      );
      
      if (hasRelevantExpertise) {
        return true;
      }
    }
    
    // Random chance to participate (to keep discussions lively)
    return Math.random() < 0.3; // 30% chance to respond
  }

  private async shouldAgentContribute(
    agentId: string,
    discussionId: string,
    discussion: any
  ): Promise<boolean> {
    // Check if it's the agent's turn in the discussion
    if (discussion.currentTurn?.participantId) {
      // Find participant record for this agent
      const participant = discussion.participants?.find(
        (p: any) => p.agentId === agentId
      );
      
      if (participant && discussion.currentTurn.participantId === participant.id) {
        return true;
      }
    }
    
    // For free-form discussions, check if agent should contribute
    if (!discussion.currentTurn || discussion.turnStrategy === 'free_form') {
      return await this.shouldAgentRespond(
        await this.getAgent(agentId) as Agent,
        {
          discussionTopic: discussion.topic,
          participantCount: discussion.participants?.length || 0,
          messageHistory: discussion.messages || []
        }
      );
    }
    
    return false;
  }

  private async generateIntelligentResponse(
    agent: Agent,
    context: any,
    knowledge: KnowledgeItem[],
    reasoning: string[],
    userId?: string
  ): Promise<string> {
    try {
      const llmRequest: LLMRequest = {
        prompt: `You are ${agent.name}, participating in a discussion.

Discussion Topic: ${context.discussionTopic || 'General conversation'}
Last Message: ${context.lastMessage || 'No recent message'}
Participants: ${context.participantCount || 1} people

${knowledge.length > 0 ? `
Available Knowledge:
${knowledge.slice(0, 2).map((k, i) => `${i + 1}. ${k.content.substring(0, 200)}...`).join('\n')}
` : ''}

Your reasoning process:
${reasoning.join('\n')}

Please provide a thoughtful, engaging response that:
1. Contributes meaningfully to the discussion
2. Shows your personality and expertise
3. Encourages further dialogue
4. Is concise but substantive (2-3 sentences)

Response:`,
        systemPrompt: `You are ${agent.name}. ${agent.persona?.description || 'You are an AI assistant.'} 
Be conversational, intelligent, and engaging. Stay true to your personality while contributing value to the discussion.`,
        maxTokens: 150,
        temperature: 0.7
      };

      let response;
      if (userId) {
        // Use user-specific LLM service if userId is provided
        response = await this.userLLMService.generateResponse(userId, llmRequest);
      } else {
        // Fall back to global LLM service
        response = await this.llmService.generateResponse(llmRequest);
      }
      
      if (response.error) {
        logger.warn('LLM response failed, using fallback', { error: response.error });
        return this.generateFallbackResponse(agent, context, knowledge);
      }

      return response.content;
    } catch (error) {
      logger.error('Error generating intelligent response', { error });
      return this.generateFallbackResponse(agent, context, knowledge);
    }
  }



  private calculateResponseConfidence(
    context: any,
    knowledge: KnowledgeItem[],
    agent: Agent
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Boost confidence if we have relevant knowledge
    if (knowledge.length > 0) {
      confidence += Math.min(knowledge.length * 0.1, 0.3);
    }
    
    // Boost confidence if agent has relevant expertise
    if (context.discussionTopic && agent.persona?.capabilities) {
      const topicKeywords = context.discussionTopic.toLowerCase().split(' ');
      const hasRelevantExpertise = agent.persona.capabilities.some((capability: string) =>
        topicKeywords.some(keyword => capability.toLowerCase().includes(keyword))
      );
      
      if (hasRelevantExpertise) {
        confidence += 0.2;
      }
    }
    
    // Reduce confidence if context is limited
    if (!context.lastMessage && !context.discussionTopic) {
      confidence -= 0.2;
    }
    
    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  /**
   * Trigger agent participation in a specific discussion
   */
  async triggerAgentParticipation(params: {
    discussionId: string;
    agentId: string;
    comment?: string;
  }): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const { discussionId, agentId, comment } = params;
      
      // Validate parameters
      const validatedAgentId = this.validateIDParam(agentId, 'agentId');
      const validatedDiscussionId = this.validateIDParam(discussionId, 'discussionId');
      
      // Get agent details
      const agent = await this.getAgent(validatedAgentId);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }
      
      console.log(`🤖 Agent ${agent.name} joining discussion ${discussionId}`);
      
      // Generate agent's response to the discussion
      const discussionPrompt = comment 
        ? `You are participating in a discussion. Context: ${comment}. Please provide your initial thoughts or response.`
        : `You are participating in a discussion. Please provide your initial thoughts.`;
      
      const response = await this.generateAgentResponse(validatedAgentId, [{ id: 'trigger-prompt', content: discussionPrompt, sender: 'user', timestamp: new Date().toISOString(), type: 'user' }]);
      
      // Here you would typically send the response to the discussion service
      // For now, we'll log it and return success
      console.log(`💬 Agent ${agent.name} response:`, response.response);
      
      return {
        success: true,
        message: `Agent ${agent.name} successfully joined discussion ${discussionId}`,
      };
      
    } catch (error) {
      console.error('❌ Failed to trigger agent participation:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
} 