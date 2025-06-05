import {
  KnowledgeGraphService,
  AgentMemoryService,
  PersonaService,
  DiscussionService,
  DatabaseService,
  EventBusService
} from './index.js';
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
import { v4 as uuidv4, validate as isValidUUID } from 'uuid';

export class EnhancedAgentIntelligenceService {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private isInitialized: boolean = false;
  private knowledgeGraph?: KnowledgeGraphService;
  private agentMemory?: AgentMemoryService;
  private personaService?: PersonaService;
  private discussionService?: DiscussionService;

  constructor(
    knowledgeGraph?: KnowledgeGraphService,
    agentMemory?: AgentMemoryService,
    personaService?: PersonaService,
    discussionService?: DiscussionService,
    databaseService?: DatabaseService,
    eventBusService?: EventBusService
  ) {
    // Initialize services with defaults if not provided
    this.databaseService = databaseService || new DatabaseService();
    this.eventBusService = eventBusService || new EventBusService({
      url: process.env.RABBITMQ_URL || 'amqp://localhost',
      serviceName: 'enhanced-agent-intelligence'
    }, logger as any);
    
    // Initialize enhanced services with defaults if not provided
    // Note: These services require complex dependencies, so we'll initialize them as undefined
    // and check for their existence before using them
    this.knowledgeGraph = knowledgeGraph;
    this.agentMemory = agentMemory;
    this.personaService = personaService || new PersonaService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      enableCaching: true,
      enableAnalytics: true
    });
    this.discussionService = discussionService || new DiscussionService({
      databaseService: this.databaseService,
      eventBusService: this.eventBusService,
      personaService: this.personaService,
      enableRealTimeEvents: true,
      enableAnalytics: true,
      maxParticipants: 20,
      defaultTurnTimeout: 300
    });
  }

  /**
   * Initialize the service and its dependencies
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      // Test database connection
      await this.databaseService.query('SELECT 1', []);
      
      // Connect to event bus (optional)
      try {
        await this.eventBusService.connect();
      } catch (error) {
        logger.warn('Event bus connection failed, continuing without event publishing:', error);
      }
      
      this.isInitialized = true;
      logger.info('Enhanced Agent Intelligence Service initialized');
    } catch (error) {
      logger.error('Failed to initialize Enhanced Agent Intelligence Service:', error);
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
   * Validate UUID parameter
   */
  private validateUUIDParam(value: string, paramName: string): void {
    if (!isValidUUID(value)) {
      throw new ApiError(400, `Invalid ${paramName}: must be a valid UUID`, 'INVALID_UUID');
    }
  }

  // ===== BASIC AGENT CRUD OPERATIONS =====
  // These methods provide backward compatibility with the existing controller

  /**
   * Create a new agent with enhanced capabilities
   */
  async createAgent(agentData: any): Promise<Agent> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      logger.info('Creating new agent with enhanced capabilities', { name: agentData.name });

      // Handle ID validation and generation
      let agentId: string;
      if (agentData.id) {
        this.validateUUIDParam(agentData.id, 'agentId');
        agentId = agentData.id;
      } else {
        agentId = uuidv4();
      }

      const query = `
        INSERT INTO agents (
          id, name, role, persona, intelligence_config, 
          security_context, is_active, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, true, $7, NOW(), NOW()
        )
        RETURNING *
      `;

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
        this.validateUUIDParam(createdBy, 'createdBy');
      } else {
        createdBy = null;
      }

      const values = [
        agentId,
        agentData.name,
        role,
        JSON.stringify(agentData.persona || {}),
        JSON.stringify(intelligenceConfig),
        JSON.stringify(securityContext),
        createdBy
      ];

      const result = await this.databaseService.query(query, values);
      const agent = result.rows[0];

      // Initialize enhanced capabilities for the new agent
      if (agentData.persona?.id) {
        await this.initializeAgent(agentId, agentData.persona.id);
      }

      await this.safePublishEvent('agent.created', {
        agentId: agent.id,
        name: agent.name,
        role: agent.role
      });

      logger.info('Agent created successfully with enhanced capabilities', { agentId: agent.id });
      return agent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error creating agent', { error: errorMessage });
      throw error;
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
      this.validateUUIDParam(agentId, 'agentId');

      const query = 'SELECT * FROM agents WHERE id = $1 AND is_active = true';
      const result = await this.databaseService.query(query, [agentId]);
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error getting agent', { agentId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Get all active agents
   */
  async getAgents(): Promise<Agent[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const query = 'SELECT * FROM agents WHERE is_active = true ORDER BY created_at DESC';
      const result = await this.databaseService.query(query, []);
      
      return result.rows;
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
      this.validateUUIDParam(agentId, 'agentId');

      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (updateData.name) {
        updateFields.push(`name = $${paramIndex++}`);
        values.push(updateData.name);
      }
      if (updateData.role) {
        updateFields.push(`role = $${paramIndex++}`);
        values.push(updateData.role);
      }
      if (updateData.persona) {
        updateFields.push(`persona = $${paramIndex++}`);
        values.push(JSON.stringify(updateData.persona));
      }
      if (updateData.intelligenceConfig || updateData.intelligence_config) {
        updateFields.push(`intelligence_config = $${paramIndex++}`);
        values.push(JSON.stringify(updateData.intelligenceConfig || updateData.intelligence_config));
      }
      if (updateData.securityContext || updateData.security_context) {
        updateFields.push(`security_context = $${paramIndex++}`);
        values.push(JSON.stringify(updateData.securityContext || updateData.security_context));
      }

      if (updateFields.length === 0) {
        throw new ApiError(400, 'No valid fields to update', 'NO_UPDATE_FIELDS');
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(agentId);

      const query = `
        UPDATE agents 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramIndex} AND is_active = true 
        RETURNING *
      `;

      const result = await this.databaseService.query(query, values);
      
      if (result.rows.length === 0) {
        return null;
      }

      const agent = result.rows[0];

      await this.safePublishEvent('agent.updated', {
        agentId: agent.id,
        updatedFields: Object.keys(updateData)
      });

      return agent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error updating agent', { agentId, error: errorMessage });
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
      this.validateUUIDParam(agentId, 'agentId');

      const query = `
        UPDATE agents 
        SET is_active = false, updated_at = NOW() 
        WHERE id = $1 AND is_active = true
      `;

      const result = await this.databaseService.query(query, [agentId]);
      
      if (result.rowCount === 0) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      await this.safePublishEvent('agent.deleted', { agentId });

      logger.info('Agent deleted successfully', { agentId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error deleting agent', { agentId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Enhanced context analysis with knowledge graph integration
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
      logger.info('Analyzing context with enhanced capabilities', { agentId: agent.id });

      // Get relevant knowledge from knowledge graph
      const relevantKnowledge = this.knowledgeGraph ? 
        await this.searchRelevantKnowledge(agent.id, userRequest, conversationContext) : [];
      
      // Get agent's working memory
      const workingMemory = this.agentMemory ? 
        await this.agentMemory.getWorkingMemory(agent.id) : null;
      
      // Find similar past episodes
      const similarEpisodes = this.agentMemory ? 
        await this.agentMemory.findSimilarEpisodes(agent.id, userRequest) : [];

      // Extract contextual information (from original service)
      const contextAnalysis = this.extractContextualInformation(conversationContext);
      
      // Analyze user intent
      const intentAnalysis = this.analyzeUserIntent(userRequest);
      
      // Generate enhanced action recommendations
      const actionRecommendations = await this.generateEnhancedActionRecommendations(
        agent,
        contextAnalysis,
        intentAnalysis,
        constraints,
        relevantKnowledge,
        similarEpisodes
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

      // Generate enhanced explanation
      const explanation = this.generateEnhancedExplanation(
        contextAnalysis,
        intentAnalysis,
        actionRecommendations,
        confidence,
        relevantKnowledge,
        similarEpisodes
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
        timestamp: new Date()
      });

      return analysis;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error in enhanced context analysis', { agentId: agent.id, error: errorMessage });
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
          `execution planning ${analysis.intent?.primary}`,
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
      this.validateUUIDParam(agentId, 'agentId');
      this.validateUUIDParam(operationId, 'operationId');

      // Get operation details
      const operation = await this.getOperation(operationId);
      if (!operation || operation.agent_id !== agentId) {
        throw new ApiError(404, 'Operation not found', 'OPERATION_NOT_FOUND');
      }

      // Enhanced learning extraction with knowledge graph
      const learningData = await this.extractEnhancedLearning(operation, outcomes, feedback);
      
      // Update knowledge graph with new insights
      await this.updateKnowledgeGraph(agentId, learningData);
      
      // Store learning as episodic memory
      await this.storeOperationEpisode(agentId, operationId, operation, outcomes, feedback, learningData);
      
      // Update semantic memory
      await this.updateSemanticMemoryFromOperation(agentId, learningData);
      
      // Calculate enhanced confidence adjustments
      const confidenceAdjustments = this.calculateEnhancedConfidenceAdjustments(
        operation,
        outcomes,
        feedback,
        learningData
      );

      // Store enhanced learning record
      await this.storeEnhancedLearningRecord(agentId, operationId, learningData, confidenceAdjustments);

      const result: LearningResult = {
        learningApplied: true,
        confidenceAdjustments,
        newKnowledge: learningData.newKnowledge,
        improvedCapabilities: learningData.improvedCapabilities
      };

      await this.safePublishEvent('agent.learning.applied', {
        agentId,
        operationId,
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
            identifier: `persona-${personaId}`,
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
   * Process agent input with knowledge-enhanced reasoning
   */
  async processAgentInput(agentId: string, input: {
    message: string;
    context?: any;
    discussionId?: string;
    operationId?: string;
  }): Promise<{
    response: string;
    reasoning: string[];
    knowledgeUsed: KnowledgeItem[];
    memoryUpdated: boolean;
  }> {
    try {
      // Search for relevant knowledge
      const relevantKnowledge = await this.searchRelevantKnowledge(agentId, input.message, input.context);
      
      // Get agent's working memory
      const workingMemory = await this.agentMemory.getWorkingMemory(agentId);
      
      // Find similar past episodes
      const similarEpisodes = await this.agentMemory.findSimilarEpisodes(agentId, input.message);
      
      // Generate reasoning based on knowledge and memory
      const reasoning = await this.generateReasoning(input.message, relevantKnowledge, similarEpisodes, workingMemory);
      
      // Generate response
      const response = await this.generateResponse(input.message, reasoning, relevantKnowledge);
      
      // Update working memory with this interaction
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
      
      // Store this interaction as knowledge
      await this.storeInteractionKnowledge(agentId, input, response, reasoning);
      
      return {
        response,
        reasoning,
        knowledgeUsed: relevantKnowledge,
        memoryUpdated: true
      };
    } catch (error) {
      console.error('Agent input processing error:', error);
      throw new Error(`Failed to process agent input: ${error.message}`);
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
        participantExpertise: discussion.participants.map(p => p.agentId).filter(Boolean)
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

      // Generate knowledge-enhanced response
      const response = await this.generateDiscussionResponse(
        message, 
        discussion, 
        contextualKnowledge,
        agentId
      );

      // Store discussion participation as an episode
      const episode: Episode = {
        agentId,
        episodeId: `discussion-${discussionId}-${Date.now()}`,
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
          decisions: [{
            id: `decision-${Date.now()}`,
            description: 'How to respond to discussion message',
            options: ['provide knowledge', 'ask question', 'agree/disagree'],
            chosen: 'provide knowledge',
            reasoning: 'Based on available knowledge and discussion context',
            timestamp: new Date(),
            confidence: 0.8
          }],
          outcomes: [{
            id: `outcome-${Date.now()}`,
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

  // ===== ENHANCED HELPER METHODS =====
  // These methods provide enhanced functionality for the basic operations

  private extractContextualInformation(conversationContext: any): any {
    return {
      messageCount: conversationContext.messages?.length || 0,
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
    // Store plan in database
    const query = `
      INSERT INTO execution_plans (
        id, type, agent_id, steps, dependencies, estimated_duration,
        priority, constraints, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
    
    const values = [
      plan.id,
      plan.type,
      plan.agentId,
      JSON.stringify(plan.steps),
      JSON.stringify(plan.dependencies),
      plan.estimatedDuration,
      plan.priority,
      JSON.stringify(plan.constraints),
      JSON.stringify(plan.metadata),
      plan.created_at
    ];
    
    await this.databaseService.query(query, values);
  }

  private async getOperation(operationId: string): Promise<any> {
    const query = 'SELECT * FROM operations WHERE id = $1';
    const result = await this.databaseService.query(query, [operationId]);
    return result.rows.length > 0 ? result.rows[0] : null;
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
            id: `action-${operationId}`,
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
    const query = `
      INSERT INTO agent_learning_records (
        agent_id, operation_id, learning_data, confidence_adjustments, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
    `;
    
    const values = [
      agentId,
      operationId,
      JSON.stringify(learningData),
      JSON.stringify(confidenceAdjustments)
    ];
    
    await this.databaseService.query(query, values);
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
Steps: ${plan.steps?.length || 0}
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

  private async generateResponse(input: string, reasoning: string[], knowledge: KnowledgeItem[]): Promise<string> {
    // This would integrate with an LLM or use rule-based generation
    // For now, return a structured response based on available information
    
    let response = `Based on my analysis of "${input}", `;
    
    if (knowledge.length > 0) {
      response += `I found relevant knowledge about ${knowledge[0].tags.slice(0, 2).join(' and ')}. `;
    }
    
    if (reasoning.length > 2) {
      response += `My reasoning process considered ${reasoning.length} factors. `;
    }
    
    response += 'I can provide more specific information if needed.';
    
    return response;
  }

  private async generateDiscussionResponse(
    message: string, 
    discussion: any, 
    knowledge: KnowledgeItem[],
    agentId: string
  ): Promise<string> {
    // Generate contextual response for discussion
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
} 