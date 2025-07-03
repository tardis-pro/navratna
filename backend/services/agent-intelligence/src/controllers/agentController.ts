import { Request, Response, NextFunction } from 'express';
import {

  CapabilityDiscoveryService,
  SecurityValidationService,
} from '@uaip/shared-services';
import { logger, ApiError } from '@uaip/utils';
import {
  AgentAnalysisRequest,
  AgentPlanRequest,
  AgentAnalysisResponse,
  AgentPlanResponse,
  Agent,
  RiskLevel,
  SecurityLevel,
  AgentCreateRequestSchema
} from '@uaip/types';
import { z } from 'zod';
import { AgentTransformationService } from '@uaip/middleware';
import {
  AgentCoreService,
  AgentContextService,
  AgentPlanningService,
  AgentLearningService,
  AgentDiscussionService,
  AgentEventOrchestrator
} from '../services/index.js';
import {
  KnowledgeGraphService,
  AgentMemoryService,
  PersonaService,
  DiscussionService,
  DatabaseService,
  EventBusService
} from '@uaip/shared-services';

/**
 * AgentController - Refactored to use modular agent intelligence services
 * 
 * Services Used:
 * - AgentCoreService: CRUD operations
 * - AgentContextService: Context analysis
 * - AgentPlanningService: Execution planning
 * - AgentLearningService: Learning from operations
 * - AgentDiscussionService: Discussion participation and chat
 * - AgentEventOrchestrator: Event-driven coordination
 */
export class AgentController {
  private agentCore: AgentCoreService;
  private agentContext: AgentContextService;
  private agentPlanning: AgentPlanningService;
  private agentLearning: AgentLearningService;
  private agentDiscussion: AgentDiscussionService;
  private agentOrchestrator: AgentEventOrchestrator;
  private capabilityDiscoveryService: CapabilityDiscoveryService;
  private securityValidationService: SecurityValidationService;

  constructor(
    knowledgeGraphService?: KnowledgeGraphService,
    agentMemoryService?: AgentMemoryService,
    personaService?: PersonaService,
    discussionService?: DiscussionService,
    databaseService?: DatabaseService,
    eventBusService?: EventBusService
  ) {
    // Initialize refactored agent services with proper dependencies
    this.agentCore = new AgentCoreService({
      databaseService: databaseService || new DatabaseService(),
      eventBusService: eventBusService || new EventBusService({ 
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672', 
        serviceName: 'agent-intelligence',
        exchangePrefix: 'uaip.enterprise',
        complianceMode: true
      }, logger as any),
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.agentContext = new AgentContextService({
      knowledgeGraphService: knowledgeGraphService || {} as any, // Will be initialized by service
      llmService: {} as any, // Will be initialized by service
      eventBusService: eventBusService || new EventBusService({ 
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672', 
        serviceName: 'agent-intelligence',
        exchangePrefix: 'uaip.enterprise',
        complianceMode: true
      }, logger as any),
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.agentPlanning = new AgentPlanningService({
      databaseService: databaseService || new DatabaseService(),
      eventBusService: eventBusService || new EventBusService({ 
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672', 
        serviceName: 'agent-intelligence',
        exchangePrefix: 'uaip.enterprise',
        complianceMode: true
      }, logger as any),
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.agentLearning = new AgentLearningService({
      agentMemoryService,
      knowledgeGraphService,
      databaseService: databaseService || new DatabaseService(),
      eventBusService: eventBusService || new EventBusService({ 
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672', 
        serviceName: 'agent-intelligence',
        exchangePrefix: 'uaip.enterprise',
        complianceMode: true
      }, logger as any),
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.agentDiscussion = new AgentDiscussionService({
      discussionService,
      databaseService: databaseService || new DatabaseService(),
      eventBusService: eventBusService || new EventBusService({ 
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672', 
        serviceName: 'agent-intelligence',
        exchangePrefix: 'uaip.enterprise',
        complianceMode: true
      }, logger as any),
      llmService: undefined, // Will be initialized by service
      userLLMService: undefined, // Will be initialized by service
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.agentOrchestrator = new AgentEventOrchestrator({
      eventBusService: eventBusService || new EventBusService({ 
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672', 
        serviceName: 'agent-intelligence',
        exchangePrefix: 'uaip.enterprise',
        complianceMode: true
      }, logger as any),
      databaseService: databaseService || new DatabaseService(),
      orchestrationPipelineUrl: process.env.ORCHESTRATION_PIPELINE_URL || 'http://localhost:3002',
      serviceName: 'agent-intelligence',
      securityLevel: 3
    });

    this.capabilityDiscoveryService = new CapabilityDiscoveryService();
    this.securityValidationService = new SecurityValidationService();
  }

  /**
   * Initialize all agent services
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing AgentController services...');

      // Initialize all agent services
      await this.agentCore.initialize();
      await this.agentContext.initialize();
      await this.agentPlanning.initialize();
      await this.agentLearning.initialize();
      await this.agentDiscussion.initialize();

      // Initialize orchestrator with all services
      await this.agentOrchestrator.initialize({
        agentCoreService: this.agentCore,
        agentContextService: this.agentContext,
        agentPlanningService: this.agentPlanning,
        agentLearningService: this.agentLearning,
        agentDiscussionService: this.agentDiscussion,
        agentMetricsService: undefined, // Not available in controller
        agentIntentService: undefined, // Not available in controller
        agentInitializationService: undefined // Not available in controller
      });

      // Set up WebSocket agent chat event subscription
      await this.setupChatEventSubscription();

      logger.info('AgentController services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AgentController services:', error);
      throw error;
    }
  }

  /**
   * Set up event subscription for WebSocket agent chat requests
   */
  private async setupChatEventSubscription(): Promise<void> {
    try {
      // Use the orchestrator's event bus service for consistency
      const eventBusService = this.agentOrchestrator.eventBusService;
      
      if (eventBusService) {
        // Debug: Test if event bus is working at all
        logger.info('Setting up event bus subscriptions with service:', { 
          connected: !!eventBusService,
          serviceName: eventBusService.constructor.name 
        });
        
        await eventBusService.subscribe('agent.chat.request', async (event) => {
          logger.info('Raw event received:', { event });
          const { userId, agentId, message, conversationHistory, context, connectionId, messageId } = event.data || event;
          
          logger.info('Received WebSocket agent chat request', { 
            userId, 
            agentId, 
            messageId,
            messageLength: message?.length 
          });

          try {
            // Process the chat request using the existing chat method
            const chatRequest = {
              agentId,
              message,
              conversationHistory: conversationHistory || [],
              context: context || {}
            };

            // Use the existing chat method from the controller
            const mockReq = { 
              params: { agentId }, 
              body: chatRequest,
              user: { id: userId } 
            } as any;
            
            const mockRes = {
              json: (data: any) => {
                // Extract response data and publish back via event bus
                if (data.success && data.data) {
                  eventBusService.publish('agent.chat.response', {
                    connectionId,
                    agentId,
                    response: data.data.response,
                    agentName: data.data.agentName,
                    confidence: data.data.confidence,
                    memoryEnhanced: data.data.memoryEnhanced,
                    knowledgeUsed: data.data.knowledgeUsed,
                    toolsExecuted: data.data.toolsExecuted,
                    messageId,
                    timestamp: new Date().toISOString()
                  });
                } else {
                  // Send error response
                  eventBusService.publish('agent.chat.response', {
                    connectionId,
                    agentId,
                    response: 'Sorry, I encountered an error processing your message.',
                    agentName: 'System',
                    error: data.error?.message || 'Unknown error',
                    messageId,
                    timestamp: new Date().toISOString()
                  });
                }
              },
              status: () => ({ json: () => {} })
            } as any;

            // Call the existing chat method
            await this.chatWithAgent(mockReq, mockRes, () => {});

          } catch (error) {
            logger.error('Error processing WebSocket agent chat request', { 
              agentId, 
              messageId, 
              error 
            });

            // Send error response back via WebSocket
            await eventBusService.publish('agent.chat.response', {
              connectionId,
              agentId,
              response: 'Sorry, I encountered an error processing your message.',
              agentName: 'System',
              error: error instanceof Error ? error.message : 'Unknown error',
              messageId,
              timestamp: new Date().toISOString()
            });
          }
        });

        logger.info('WebSocket agent chat event subscription set up successfully');
      } else {
        logger.warn('EventBusService not available for WebSocket subscription');
      }
    } catch (error) {
      logger.error('Failed to set up WebSocket agent chat event subscription', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  /**
   * Analyze context for an agent with enhanced capabilities
   */
  public async analyzeContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { agentId } = req.params;
    const analysisRequest: AgentAnalysisRequest = req.body;

    try {
      logger.info('Starting enhanced context analysis', { agentId });

      // Validate agent exists
      const agent = await this.validateAgentExists(agentId);

      // Perform security validation
      await this.validateSecurity(agentId, 'analyze_context', analysisRequest);

      // Perform enhanced context analysis
      const analysis = await this.agentContext.analyzeContext(
        agent.id,
        analysisRequest.conversationContext || {},
        analysisRequest.userRequest || '',
        req.user?.id || 'anonymous'
      );

      // Get available capabilities
      const capabilities = await this.fetchAgentCapabilities(agent, analysisRequest.userRequest || '');

      // Build enhanced response
      const response: AgentAnalysisResponse = {
        analysis: typeof analysis.userIntent === 'string' ? analysis.userIntent : (analysis.userIntent?.primary || 'Context analyzed successfully'),
        recommendedActions: analysis.recommendations || [],
        confidence: analysis.confidence,
        explanation: typeof analysis.userIntent === 'string' ? analysis.userIntent : (analysis.userIntent?.primary || 'Analysis completed'),
        availableCapabilities: capabilities,
        securityAssessment: { allowed: true, riskLevel: RiskLevel.LOW, reasoning: 'Validated' },
        meta: {
          timestamp: new Date(),
          processingTime: 0,
          agentId,
          version: '2.0.0' // Enhanced version
        }
      };

      logger.info('Enhanced context analysis completed', {
        agentId,
        confidence: analysis.confidence,
        actionsCount: analysis.recommendations?.length,
        capabilitiesCount: capabilities.length
      });

      this.sendSuccessResponse(res, response);

    } catch (error) {
      this.handleError(error, 'context analysis', { agentId }, next);
    }
  }

  /**
   * Generate execution plan with enhanced capabilities
   */
  public async generatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { agentId } = req.params;
    const planRequest: AgentPlanRequest = req.body;

    try {
      logger.info('Starting enhanced plan generation', { agentId });

      // Validate agent exists
      const agent = await this.validateAgentExists(agentId);

      // Generate enhanced execution plan
      const plan = await this.agentPlanning.generateExecutionPlan(
        agent,
        planRequest.analysis,
        planRequest.userPreferences,
        planRequest.securityContext
      );

      // Perform risk assessment
      const riskAssessment = await this.securityValidationService.assessRisk(
        plan,
        agent.securityContext
      );

      const approvalRequired = this.isApprovalRequired(riskAssessment.level);

      const response: AgentPlanResponse = {
        operationPlan: plan,
        estimatedDuration: plan.estimatedDuration,
        riskAssessment,
        approvalRequired,
        dependencies: plan.dependencies,
        meta: {
          timestamp: new Date(),
          processingTime: 0,
          agentId,
          version: '2.0.0' // Enhanced version
        }
      };

      logger.info('Enhanced plan generation completed', {
        agentId,
        planType: plan.type,
        stepsCount: plan.steps?.length,
        requiresApproval: approvalRequired
      });

      this.sendSuccessResponse(res, response);

    } catch (error) {
      this.handleError(error, 'plan generation', { agentId }, next);
    }
  }

  /**
   * Create a new agent with enhanced capabilities and persona composition
   * COMPOSITION MODEL: Agent → Persona
   */
  public async createAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    const rawData = req.body;

    try {
      logger.info('Creating new enhanced agent', {
        name: rawData.name,
        inputFormat: this.detectInputFormat(rawData),
        hasPersonaId: !!rawData.personaId,
        hasPersonaData: !!rawData.persona
      });

      // COMPOSITION MODEL: Handle different input formats
      let agentRequest;

      if (rawData.personaId) {
        // COMPOSITION MODEL: Direct personaId provided
        logger.info('Creating agent with persona reference', { personaId: rawData.personaId });
        agentRequest = rawData;
      } else if (rawData.persona || this.isPersonaFormat(rawData)) {
        // TRANSFORMATION MODE: Persona data provided, need to transform
        logger.info('Transforming persona format to agent request', { name: rawData.name });

        agentRequest = AgentTransformationService.transformPersonaToAgentRequest(rawData);

        // Validate transformation result
        if (!AgentTransformationService.validateTransformation(agentRequest)) {
          throw new ApiError(400, 'Persona transformation failed validation', 'TRANSFORMATION_ERROR');
        }

        logger.info('Persona transformation successful', {
          originalRole: rawData.role || rawData.persona?.role,
          mappedRole: agentRequest.role,
          capabilities: agentRequest.capabilities
        });
      } else {
        // ERROR: Neither personaId nor persona data provided
        throw new ApiError(400, 'Either personaId or persona data must be provided', 'MISSING_PERSONA_REFERENCE');
      }

      // Log the request data before validation
      logger.info('Agent request before validation', {
        agentRequest: JSON.stringify(agentRequest, null, 2),
        capabilities: agentRequest.capabilities,
        capabilitiesType: typeof agentRequest.capabilities,
        capabilitiesLength: Array.isArray(agentRequest.capabilities) ? agentRequest.capabilities.length : 'not array'
      });

      // Validate the final request against schema
      const validatedRequest = AgentCreateRequestSchema.parse(agentRequest);

      // Add user context (when auth is properly implemented)
      const agentData = {
        ...validatedRequest,
        createdBy: req.user?.id || 'anonymous' // TODO: Fix when auth middleware is configured
      };

      // Create the agent (service will validate persona exists)
      const agent = await this.agentCore.createAgent(agentData, agentData.createdBy || 'anonymous');

      // Attach tools if provided
      if (agentData.attachedTools && agentData.attachedTools.length > 0) {
        await this.attachToolsToAgent(agent.id, agentData.attachedTools);
        logger.info('Tools attached to agent', {
          agentId: agent.id,
          toolsCount: agentData.attachedTools.length,
          tools: agentData.attachedTools.map(t => t.toolName)
        });
      }

      // Set up chat configuration
      if (agentData.chatConfig) {
        await this.configureChatCapabilities(agent.id, agentData.chatConfig);
        logger.info('Chat configuration applied', {
          agentId: agent.id,
          chatConfig: agentData.chatConfig
        });
      }

      logger.info('Enhanced agent created successfully', {
        agentId: agent.id,
        role: agent.role,
        personaId: agent.personaId,
        transformationApplied: !rawData.personaId,
        toolsAttached: agentData.attachedTools?.length || 0
      });

      // Return agent with composition information
      const response = {
        ...agent,
        meta: {
          compositionModel: true,
          personaLinked: !!agent.personaId,
          transformationApplied: !rawData.personaId,
          timestamp: new Date()
        }
      };

      this.sendSuccessResponse(res, response, 201);

    } catch (error) {
      // Log the full error for debugging
      logger.error('Agent creation error details', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        requestData: rawData,
        errorType: error.constructor.name
      });

      this.handleEnhancedError(error, 'agent creation', { name: rawData.name }, next);
    }
  }

  /**
   * Get agent by ID
   */
  public async getAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { agentId } = req.params;

    try {
      const agent = await this.validateAgentExists(agentId);
      this.sendSuccessResponse(res, agent);

    } catch (error) {
      this.handleError(error, 'get agent', { agentId }, next);
    }
  }

  /**
   * Get agent with persona data populated
   * COMPOSITION MODEL: Returns agent with persona relationship
   */
  public async getAgentWithPersona(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { agentId } = req.params;

    try {
      const agentWithPersona = await this.agentCore.getAgentWithPersona(agentId);
      if (!agentWithPersona) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      // Add composition metadata
      const response = {
        ...agentWithPersona,
        meta: {
          compositionModel: true,
          personaLinked: !!agentWithPersona.personaId,
          personaDataFetched: !!agentWithPersona.personaData,
          timestamp: new Date()
        }
      };

      logger.info('Fetched agent with persona data', {
        agentId,
        personaId: agentWithPersona.personaId,
        personaName: agentWithPersona.personaData?.name
      });

      this.sendSuccessResponse(res, response);

    } catch (error) {
      this.handleError(error, 'get agent with persona', { agentId }, next);
    }
  }

  /**
   * Get all agents
   */
  public async getAgents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Get validated query parameters from middleware
      const queryParams = (req as any).validatedQuery || {};

      // For now, pass the limit parameter to the service
      const limit = queryParams.limit;
      const agents = await this.agentCore.getAgents(limit);

      // Apply client-side filtering for other parameters until we implement server-side filtering
      let filteredAgents = agents;

      if (queryParams.role) {
        filteredAgents = filteredAgents.filter(agent => agent.role === queryParams.role);
      }

      if (queryParams.isActive !== undefined) {
        filteredAgents = filteredAgents.filter(agent => agent.isActive === queryParams.isActive);
      }

      if (queryParams.capabilities && queryParams.capabilities.length > 0) {
        filteredAgents = filteredAgents.filter(agent =>
          queryParams.capabilities.some((cap: string) =>
            (agent as any).capabilities?.includes(cap)
          )
        );
      }

      // Apply sorting
      if (queryParams.sortBy) {
        const sortField = queryParams.sortBy;
        const sortOrder = queryParams.sortOrder || 'desc';

        filteredAgents.sort((a: any, b: any) => {
          let aVal = a[sortField];
          let bVal = b[sortField];

          // Handle date fields
          if (sortField === 'createdAt' || sortField === 'lastActiveAt') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
          }

          if (sortOrder === 'asc') {
            return aVal > bVal ? 1 : -1;
          } else {
            return aVal < bVal ? 1 : -1;
          }
        });
      }

      // Apply offset
      if (queryParams.offset) {
        filteredAgents = filteredAgents.slice(queryParams.offset);
      }

      // Apply limit after filtering and offset
      if (queryParams.limit && !limit) { // Only apply if we didn't already limit at DB level
        filteredAgents = filteredAgents.slice(0, queryParams.limit);
      }

      this.sendSuccessResponse(res, {
        agents: filteredAgents,
        total: filteredAgents.length,
        filters: queryParams
      });

    } catch (error) {
      this.handleError(error, 'get agents', {}, next);
    }
  }

  /**
   * Update agent
   */
  public async updateAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { agentId } = req.params;
    const updateData = req.body;

    try {
      const agent = await this.agentCore.updateAgent(agentId, updateData, req.user?.id || 'anonymous');
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      logger.info('Agent updated successfully', { agentId });
      this.sendSuccessResponse(res, agent);

    } catch (error) {
      this.handleError(error, 'agent update', { agentId }, next);
    }
  }

  /**
   * Delete agent
   */
  public async deleteAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { agentId } = req.params;

    try {
      await this.agentCore.deleteAgent(agentId, req.user?.id || 'anonymous');
      logger.info('Agent deleted successfully', { agentId });

      res.status(204).send();

    } catch (error) {
      this.handleError(error, 'agent deletion', { agentId }, next);
    }
  }

  /**
   * Get agent capabilities
   */
  public async getAgentCapabilities(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { agentId } = req.params;

    try {
      const agent = await this.validateAgentExists(agentId);
      const capabilities = await this.capabilityDiscoveryService.getAgentCapabilities(agentId);

      const response = {
        agentId,
        capabilities,
        totalCount: capabilities.length,
        lastUpdated: new Date(),
        enhanced: true // Indicates enhanced capabilities
      };

      this.sendSuccessResponse(res, response);

    } catch (error) {
      this.handleError(error, 'get agent capabilities', { agentId }, next);
    }
  }

  /**
   * Learn from operation with enhanced capabilities
   */
  public async learnFromOperation(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { agentId } = req.params;
    const { operationId, outcomes, feedback } = req.body;

    try {
      const learningResult = await this.agentLearning.learnFromOperation(
        agentId,
        operationId,
        outcomes,
        feedback
      );

      const response = {
        learningApplied: learningResult.learningApplied,
        confidenceAdjustments: learningResult.confidenceAdjustments,
        newKnowledge: learningResult.newKnowledge,
        improvedCapabilities: learningResult.improvedCapabilities,
        enhanced: true // Indicates enhanced learning capabilities
      };

      this.sendSuccessResponse(res, response);

    } catch (error) {
      this.handleError(error, 'learning from operation', { agentId, operationId }, next);
    }
  }

  public async participateInDiscussion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { agentId } = req.params;
      const { discussionId, comment } = req.body;

      logger.info('Triggering agent participation in discussion', {
        agentId,
        discussionId,
        hasComment: !!comment
      });

      const result = await this.agentDiscussion.participateInDiscussion(
        agentId,
        discussionId,
        comment || ''
      );

      logger.info('Agent participation triggered', {
        agentId,
        discussionId,
        response: result.response
      });

      res.status(200).json({
        success: true,
        data: result,
        meta: {
          timestamp: new Date(),
          version: '1.0.0'
        }
      });

    } catch (error) {
      logger.error('Error triggering agent participation', {
        agentId: req.params.agentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  /**
   * Casual chat with agent - leverages persona and memories for natural conversation
   */
  public async chatWithAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { agentId } = req.params;
    const { message, conversationHistory, context } = req.body;

    try {
      logger.info('Starting casual chat with agent', {
        agentId,
        messageLength: message?.length,
        hasHistory: !!conversationHistory?.length,
        hasContext: !!context
      });

      // Validate agent exists and get with persona data
      const agentWithPersona = await this.agentCore.getAgentWithPersona(agentId);
      if (!agentWithPersona) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      // Validate required fields
      if (!message || typeof message !== 'string') {
        throw new ApiError(400, 'Message is required and must be a string', 'INVALID_MESSAGE');
      }

      // Build conversation messages from history
      const messages = [];

      // Add conversation history if provided
      if (conversationHistory && Array.isArray(conversationHistory)) {
        conversationHistory.forEach((msg, index) => {
          messages.push({
            id: `history-${index}`,
            content: msg.content || msg.message || String(msg),
            sender: msg.sender || msg.from || (msg.role === 'assistant' ? agentWithPersona.name : 'user'),
            timestamp: msg.timestamp || new Date().toISOString(),
            type: msg.type || msg.role || 'user'
          });
        });
      }

      // Add current message
      messages.push({
        id: `current-${Date.now()}`,
        content: message,
        sender: 'user',
        timestamp: new Date().toISOString(),
        type: 'user'
      });

      // Get user ID from request for LLM service context
      const userId = req.user?.id || agentWithPersona.createdBy;

      // Get agent's available tools and capabilities
      const availableTools = await this.getAgentAvailableTools(agentId);
      const agentCapabilities = await this.fetchAgentCapabilities(agentWithPersona, message);

      // Enhanced chat context with all agent functions
      const enhancedContext = {
        conversationType: 'enhanced_chat',
        agentPersona: agentWithPersona.personaData,
        additionalContext: context,
        enableMemoryRetrieval: true,
        enableKnowledgeSearch: true,
        enableToolExecution: true,
        availableTools,
        agentCapabilities,
        chatConfig: agentWithPersona.metadata?.chatConfig,
        // Allow agent to analyze and plan if needed
        enableContextAnalysis: true,
        enablePlanGeneration: true,
        // Real-time capabilities
        enableRealTimeSearch: true,
        enableLearning: true
      };

      // Generate response using the enhanced agent intelligence service
      const result = await this.agentDiscussion.generateAgentResponse(
        agentId,
        messages,
        enhancedContext,
        userId
      );

      // Execute any tools if the agent decided to use them
      let toolResults = null;
      if (result.suggestedTools && result.suggestedTools.length > 0) {
        toolResults = await this.executeToolsInChat(agentId, result.suggestedTools, userId);
        
        // Generate follow-up response with tool results if tools were executed
        if (toolResults && toolResults.some(r => r.success)) {
          const followUpResult = await this.agentDiscussion.generateAgentResponse(
            agentId,
            [...messages, {
              id: `tool-results-${Date.now()}`,
              content: `Tool execution results: ${JSON.stringify(toolResults)}`,
              sender: 'system',
              timestamp: new Date().toISOString(),
              type: 'tool-result'
            }],
            { ...enhancedContext, toolResults },
            userId
          );
          
          // Merge results
          result.response = followUpResult.response;
          result.toolsExecuted = toolResults;
        }
      }

      // Build response with persona and memory information
      const response = {
        agentId,
        agentName: agentWithPersona.name,
        response: result.response,
        confidence: result.confidence || 0.8,
        model: result.model,
        tokensUsed: result.tokensUsed,
        // Memory and knowledge context
        memoryEnhanced: result.memoryEnhanced,
        knowledgeUsed: result.knowledgeUsed,
        // Persona information
        persona: agentWithPersona.personaData ? {
          name: agentWithPersona.personaData.name,
          role: agentWithPersona.personaData.role,
          personality: agentWithPersona.personaData.traits,
          expertise: Array.isArray(agentWithPersona.personaData.expertise) 
            ? agentWithPersona.personaData.expertise.map((e: string | { name: string }) => 
                typeof e === 'string' ? e : e.name) 
            : [],
          communicationStyle: agentWithPersona.personaData.conversationalStyle
        } : null,
        // Conversation metadata
        conversationContext: {
          messageCount: messages.length,
          hasHistory: conversationHistory?.length > 0,
          contextProvided: !!context
        },
        timestamp: new Date(),
        error: result.error
      };

      if (result.error) {
        logger.warn('Chat response generated with errors', {
          agentId,
          error: result.error,
          fallbackUsed: true
        });
      }

      logger.info('Casual chat completed successfully', {
        agentId,
        agentName: agentWithPersona.name,
        responseLength: result.response?.length,
        memoryEnhanced: result.memoryEnhanced,
        knowledgeUsed: result.knowledgeUsed,
        hasPersona: !!agentWithPersona.personaData
      });

      this.sendSuccessResponse(res, response);

    } catch (error) {
      this.handleError(error, 'casual chat', { agentId }, next);
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Validate that an agent exists and return it
   */
  private async validateAgentExists(agentId: string): Promise<Agent> {
    const agent = await this.agentCore.getAgent(agentId);
    if (!agent) {
      throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
    }
    return agent;
  }

  /**
   * Validate security for an operation
   */
  private async validateSecurity(agentId: string, operation: string, data: any): Promise<void> {
    const securityContext = {
      userId: 'anonymous', // TODO: Fix when auth middleware is properly configured
      agentId,
      operation,
      resources: [agentId]
    };

    const securityValidation = await this.securityValidationService.validateOperation(
      securityContext as any,
      operation,
      [agentId],
      data
    );

    if (!securityValidation.allowed) {
      throw new ApiError(403, 'Operation not permitted', 'OPERATION_FORBIDDEN', {
        riskLevel: securityValidation.riskLevel,
        reasoning: securityValidation.reasoning
      });
    }
  }

  /**
   * Fetch agent capabilities (private helper method)
   */
  private async fetchAgentCapabilities(agent: Agent, userRequest: string): Promise<any[]> {
    return await this.capabilityDiscoveryService.getAgentCapabilities(agent.id);
  }



  /**
   * Check if approval is required based on risk level
   */
  private isApprovalRequired(securityLevel: SecurityLevel): boolean {
    return securityLevel === SecurityLevel.HIGH || securityLevel === SecurityLevel.CRITICAL;
  }

  /**
   * Send standardized success response
   */
  private sendSuccessResponse(res: Response, data: any, statusCode: number = 200): void {
    res.status(statusCode).json({
      success: true,
      data
    });
  }

  /**
   * Detects if the input is in persona format vs agent format
   */
  private isPersonaFormat(input: any): boolean {
    // Check for persona-specific indicators
    const hasPersonaStructure = input.persona ||
      (input.role && !['assistant', 'analyzer', 'orchestrator', 'specialist'].includes(input.role)) ||
      (input.expertise && !input.capabilities) ||
      input.traits ||
      input.background;

    // Check for missing agent-specific required fields
    const missingAgentFields = !input.capabilities || !input.description;

    return hasPersonaStructure || missingAgentFields;
  }

  /**
   * Detects the input format for logging
   */
  private detectInputFormat(input: any): string {
    if (input.persona) return 'nested-persona';
    if (input.role && !['assistant', 'analyzer', 'orchestrator', 'specialist'].includes(input.role)) return 'persona-role';
    if (input.expertise && !input.capabilities) return 'persona-expertise';
    if (input.capabilities && input.description) return 'agent-standard';
    return 'unknown';
  }

  /**
   * Enhanced error handling with transformation context
   */
  private handleEnhancedError(error: any, operation: string, context: any, next: NextFunction): void {
    logger.error(`Agent controller error during ${operation}`, {
      error: error.message,
      stack: error.stack,
      context,
      enhanced: true
    });

    if (error instanceof z.ZodError) {
      // Log detailed Zod validation errors
      logger.error('Zod validation failed with details', {
        operation,
        errors: error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
          received: e.received,
          expected: e.expected
        })),
        fullErrors: error.errors
      });

      // Enhanced Zod validation error handling
      const enhancedError = new ApiError(400, 'Request validation failed', 'VALIDATION_ERROR', {
        details: error.errors,
        hint: 'If sending persona data, ensure it includes name, role, and expertise/capabilities fields',
        supportedFormats: ['agent-standard', 'persona-legacy'],
        transformationStats: AgentTransformationService.getTransformationStats()
      });
      next(enhancedError);
    } else if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(500, `Internal server error during ${operation}`, 'INTERNAL_ERROR'));
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: any, operation: string, context: any, next: NextFunction): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error in ${operation}`, {
      ...context,
      error: errorMessage
    });
    next(error);
  }

  /**
   * Attach tools to an agent during creation/update
   */
  private async attachToolsToAgent(agentId: string, tools: Array<{toolId: string, toolName: string, category: string, permissions?: string[]}>): Promise<void> {
    try {
      for (const tool of tools) {
        await this.capabilityDiscoveryService.assignCapabilityToAgent(agentId, tool.toolId, {
          permissions: tool.permissions || ['execute'],
          category: tool.category,
          metadata: {
            attachedAt: new Date().toISOString(),
            source: 'agent-creation'
          }
        });
      }
      
      // Publish tool attachment event
      await this.agentOrchestrator.publishEvent('agent.tools.attached', {
        agentId,
        tools: tools.map(t => ({ id: t.toolId, name: t.toolName, category: t.category })),
        timestamp: new Date().toISOString()
      });
      
      logger.info('Tools successfully attached to agent', {
        agentId,
        toolCount: tools.length,
        toolIds: tools.map(t => t.toolId)
      });
    } catch (error) {
      logger.error('Failed to attach tools to agent', {
        agentId,
        tools,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new ApiError(500, 'Failed to attach tools to agent', 'TOOL_ATTACHMENT_ERROR');
    }
  }

  /**
   * Configure chat capabilities for an agent
   */
  private async configureChatCapabilities(agentId: string, chatConfig: any): Promise<void> {
    try {
      // Store chat configuration in agent metadata
      await this.agentCore.updateAgent(agentId, {
        metadata: {
          chatConfig: {
            ...chatConfig,
            configuredAt: new Date().toISOString()
          }
        }
      }, 'system');

      // Initialize chat-specific capabilities
      if (chatConfig.enableKnowledgeAccess) {
        await this.enableKnowledgeAccess(agentId);
      }
      
      if (chatConfig.enableToolExecution) {
        await this.enableToolExecutionInChat(agentId);
      }
      
      if (chatConfig.enableMemoryEnhancement) {
        await this.enableMemoryEnhancement(agentId);
      }

      // Publish chat configuration event
      await this.agentOrchestrator.publishEvent('agent.chat.configured', {
        agentId,
        chatConfig,
        timestamp: new Date().toISOString()
      });

      logger.info('Chat capabilities configured for agent', {
        agentId,
        chatConfig
      });
    } catch (error) {
      logger.error('Failed to configure chat capabilities', {
        agentId,
        chatConfig,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new ApiError(500, 'Failed to configure chat capabilities', 'CHAT_CONFIG_ERROR');
    }
  }

  /**
   * Enable knowledge access for agent during chat
   */
  private async enableKnowledgeAccess(agentId: string): Promise<void> {
    // Add knowledge search capability to agent
    await this.capabilityDiscoveryService.assignCapabilityToAgent(agentId, 'knowledge-search', {
      permissions: ['search', 'read'],
      category: 'knowledge',
      metadata: {
        enabledForChat: true,
        configuredAt: new Date().toISOString()
      }
    });
  }

  /**
   * Enable tool execution during chat conversations
   */
  private async enableToolExecutionInChat(agentId: string): Promise<void> {
    // Configure agent for in-chat tool execution
    await this.agentCore.updateAgent(agentId, {
      capabilities: ['chat-tool-execution', 'real-time-computation']
    }, 'system');
  }

  /**
   * Enable memory enhancement for chat conversations
   */
  private async enableMemoryEnhancement(agentId: string): Promise<void> {
    // Add memory enhancement capabilities
    await this.capabilityDiscoveryService.assignCapabilityToAgent(agentId, 'memory-enhancement', {
      permissions: ['read', 'write', 'analyze'],
      category: 'memory',
      metadata: {
        enhancementType: 'conversational',
        configuredAt: new Date().toISOString()
      }
    });
  }

  /**
   * Get all available tools for an agent
   */
  private async getAgentAvailableTools(agentId: string): Promise<any[]> {
    try {
      const capabilities = await this.capabilityDiscoveryService.getAgentCapabilities(agentId);
      return capabilities.map(cap => ({
        id: cap.id,
        name: cap.name,
        category: cap.category,
        description: cap.description,
        parameters: cap.parameters,
        permissions: cap.permissions
      }));
    } catch (error) {
      logger.warn('Failed to get agent tools', { agentId, error });
      return [];
    }
  }

  /**
   * Execute tools during chat conversation
   */
  private async executeToolsInChat(agentId: string, suggestedTools: any[], userId: string): Promise<any[]> {
    const results = [];
    
    for (const toolSuggestion of suggestedTools) {
      try {
        // Validate agent has permission to use this tool
        const hasPermission = await this.validateToolPermission(agentId, toolSuggestion.toolId);
        if (!hasPermission) {
          results.push({
            toolId: toolSuggestion.toolId,
            success: false,
            error: 'Permission denied for tool execution',
            timestamp: new Date().toISOString()
          });
          continue;
        }

        // Execute the tool
        const toolResult = await this.capabilityDiscoveryService.executeTool(
          toolSuggestion.toolId,
          toolSuggestion.parameters,
          {
            agentId,
            userId,
            context: 'chat-execution',
            timestamp: new Date().toISOString()
          }
        );

        results.push({
          toolId: toolSuggestion.toolId,
          toolName: toolSuggestion.toolName,
          success: true,
          result: toolResult,
          parameters: toolSuggestion.parameters,
          timestamp: new Date().toISOString()
        });

        logger.info('Tool executed successfully in chat', {
          agentId,
          toolId: toolSuggestion.toolId,
          userId
        });

      } catch (error) {
        results.push({
          toolId: toolSuggestion.toolId,
          success: false,
          error: error instanceof Error ? error.message : 'Tool execution failed',
          timestamp: new Date().toISOString()
        });

        logger.error('Tool execution failed in chat', {
          agentId,
          toolId: toolSuggestion.toolId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Validate if agent has permission to execute a specific tool
   */
  private async validateToolPermission(agentId: string, toolId: string): Promise<boolean> {
    try {
      const agentCapabilities = await this.capabilityDiscoveryService.getAgentCapabilities(agentId);
      return agentCapabilities.some(cap => cap.id === toolId && cap.permissions?.includes('execute'));
    } catch (error) {
      logger.warn('Failed to validate tool permission', { agentId, toolId, error });
      return false;
    }
  }
} 