import { Request, Response, NextFunction } from 'express';
import { 
  EnhancedAgentIntelligenceService,
  CapabilityDiscoveryService,
  SecurityValidationService
} from '@uaip/shared-services';
import { logger, ApiError } from '@uaip/utils';
import { 
  AgentAnalysisRequest, 
  AgentPlanRequest, 
  AgentAnalysisResponse,
  AgentPlanResponse,
  Agent,
  RiskLevel
} from '@uaip/types';

export class AgentController {
  private agentIntelligenceService: EnhancedAgentIntelligenceService;
  private capabilityDiscoveryService: CapabilityDiscoveryService;
  private securityValidationService: SecurityValidationService;

  constructor() {
    this.agentIntelligenceService = new EnhancedAgentIntelligenceService();
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
        actionsCount: analysis.recommendedActions?.length || 0,
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

      const approvalRequired = this.isApprovalRequired(riskAssessment.overallRisk);

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
        stepsCount: plan.steps?.length || 0,
        requiresApproval: approvalRequired
      });

      this.sendSuccessResponse(res, response);

    } catch (error) {
      this.handleError(error, 'plan generation', { agentId }, next);
    }
  }

  /**
   * Create a new agent with enhanced capabilities
   */
  public async createAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    const agentData = req.body;

    try {
      logger.info('Creating new enhanced agent', { name: agentData.name });

      const agent = await this.agentIntelligenceService.createAgent(agentData);

      logger.info('Enhanced agent created successfully', { agentId: agent.id });

      this.sendSuccessResponse(res, agent, 201);

    } catch (error) {
      this.handleError(error, 'agent creation', { name: agentData.name }, next);
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
   * Get all agents
   */
  public async getAgents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agents = await this.agentIntelligenceService.getAgents();
      this.sendSuccessResponse(res, agents);

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
  private isApprovalRequired(riskLevel: RiskLevel): boolean {
    return riskLevel === RiskLevel.HIGH || riskLevel === RiskLevel.CRITICAL;
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