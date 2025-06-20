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
import { EnhancedAgentIntelligenceService } from '../services/enhanced-agent-intelligence.service.js';
import { 
  KnowledgeGraphService, 
  AgentMemoryService, 
  PersonaService, 
  DiscussionService,
  DatabaseService,
  EventBusService
} from '@uaip/shared-services';

export class AgentController {
  private agentIntelligenceService: EnhancedAgentIntelligenceService;
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
    // Initialize EnhancedAgentIntelligenceService with proper dependencies
    this.agentIntelligenceService = new EnhancedAgentIntelligenceService(
      knowledgeGraphService,
      agentMemoryService,
      personaService,
      discussionService,
      databaseService,
      eventBusService
    );
    
    this.capabilityDiscoveryService = new CapabilityDiscoveryService();
    this.securityValidationService = new SecurityValidationService();
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
      const analysis = await this.agentIntelligenceService.analyzeContext(
        agent,
        analysisRequest.conversationContext,
        analysisRequest.userRequest || '',
        analysisRequest.constraints
      );

      // Get available capabilities
      const capabilities = await this.fetchAgentCapabilities(agent, analysisRequest.userRequest || '');

      // Build enhanced response
      const response: AgentAnalysisResponse = {
        analysis: analysis.analysis,
        recommendedActions: analysis.recommendedActions,
        confidence: analysis.confidence,
        explanation: analysis.explanation,
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
        actionsCount: analysis.recommendedActions?.length,
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
      const plan = await this.agentIntelligenceService.generateExecutionPlan(
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

      // Validate the final request against schema
      const validatedRequest = AgentCreateRequestSchema.parse(agentRequest);
      
      // Add user context (when auth is properly implemented)
      const agentData = {
        ...validatedRequest,
        createdBy: req.user?.id || 'anonymous' // TODO: Fix when auth middleware is configured
      };

      // Create the agent (service will validate persona exists)
      const agent = await this.agentIntelligenceService.createAgent(agentData);

      logger.info('Enhanced agent created successfully', { 
        agentId: agent.id,
        role: agent.role,
        personaId: agent.personaId,
        transformationApplied: !rawData.personaId
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
      const agentWithPersona = await this.agentIntelligenceService.getAgentWithPersona(agentId);
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
      const agents = await this.agentIntelligenceService.getAgents(limit);
      
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
      const agent = await this.agentIntelligenceService.updateAgent(agentId, updateData);
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
      await this.agentIntelligenceService.deleteAgent(agentId);
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
      const learningResult = await this.agentIntelligenceService.learnFromOperation(
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

      const result = await this.agentIntelligenceService.triggerAgentParticipation({
        agentId,
        discussionId,
        comment
      });

      logger.info('Agent participation triggered', { 
        agentId,
        discussionId,
        success: result.success
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
      const agentWithPersona = await this.agentIntelligenceService.getAgentWithPersona(agentId);
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

      // Generate response using the enhanced agent intelligence service
      const result = await this.agentIntelligenceService.generateAgentResponse(
        agentId,
        messages,
        {
          conversationType: 'casual_chat',
          agentPersona: agentWithPersona.personaData,
          additionalContext: context,
          enableMemoryRetrieval: true,
          enableKnowledgeSearch: true
        },
        userId
      );

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
          expertise: agentWithPersona.personaData.expertise?.map((e: any) => e.name || e) || [],
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
    const agent = await this.agentIntelligenceService.getAgent(agentId);
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
} 