import { Request, Response, NextFunction } from 'express';
import { 
  AgentIntelligenceService,
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
  private agentIntelligenceService: AgentIntelligenceService;
  private capabilityDiscoveryService: CapabilityDiscoveryService;
  private securityValidationService: SecurityValidationService;

  constructor() {
    this.agentIntelligenceService = new AgentIntelligenceService();
    this.capabilityDiscoveryService = new CapabilityDiscoveryService();
    this.securityValidationService = new SecurityValidationService();
  }

  public async analyzeContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { agentId } = req.params;
      const analysisRequest: AgentAnalysisRequest = req.body;

      logger.info('Starting context analysis', { agentId, requestId: 'unknown' });

      // Validate agent exists and user has access
      const agent = await this.agentIntelligenceService.getAgent(agentId);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      // Perform security validation
      const securityContext = {
        userId: 'anonymous', // TODO: Fix when auth middleware is properly configured
        agentId,
        operation: 'analyze_context',
        resources: [agentId]
      };

      const securityValidation = await this.securityValidationService.validateOperation(
        securityContext as any,
        'analyze_context',
        [agentId],
        analysisRequest
      );

      if (!securityValidation.allowed) {
        throw new ApiError(403, 'Operation not permitted', 'OPERATION_FORBIDDEN', {
          riskLevel: securityValidation.riskLevel,
          reasoning: securityValidation.reasoning
        });
      }

      // Perform context analysis
      const analysis = await this.agentIntelligenceService.analyzeContext(
        agent,
        analysisRequest.conversationContext,
        analysisRequest.userRequest || '',
        analysisRequest.constraints
      );

      // Discover available capabilities
      const capabilities = await this.capabilityDiscoveryService.searchCapabilities({
        query: analysisRequest.userRequest || '',
        agentContext: {
          agentId: agent.id,
          specializations: agent.persona?.capabilities || []
        },
        securityContext: {
          securityLevel: agent.securityContext?.securityLevel || 'medium',
          allowedCapabilities: agent.securityContext?.allowedCapabilities || []
        },
        limit: 10
      });

      // Build response
      const response: AgentAnalysisResponse = {
        analysis: analysis.analysis,
        recommendedActions: analysis.recommendedActions,
        confidence: analysis.confidence,
        explanation: analysis.explanation,
        availableCapabilities: capabilities,
        securityAssessment: securityValidation,
        meta: {
          timestamp: new Date(),
          processingTime: Date.now() - Date.now(),
          agentId,
          version: '1.0.0'
        }
      };

      logger.info('Context analysis completed', { 
        agentId, 
        requestId: 'unknown', 
        confidence: analysis.confidence,
        actionsCount: analysis.recommendedActions?.length || 0,
        capabilitiesCount: capabilities.length
      });

      res.status(200).json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Error in context analysis', { 
        agentId: req.params.agentId, 
        requestId: 'unknown', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async generatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { agentId } = req.params;
      const planRequest: AgentPlanRequest = req.body;

      logger.info('Starting plan generation', { agentId, requestId: 'unknown' });

      const agent = await this.agentIntelligenceService.getAgent(agentId);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      // Generate execution plan
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

      const approvalRequired = riskAssessment.overallRisk === RiskLevel.HIGH || riskAssessment.overallRisk === RiskLevel.CRITICAL;

      const response: AgentPlanResponse = {
        operationPlan: plan,
        estimatedDuration: plan.estimatedDuration,
        riskAssessment,
        approvalRequired,
        dependencies: plan.dependencies,
        meta: {
          timestamp: new Date(),
          processingTime: Date.now() - Date.now(),
          agentId,
          version: '1.0.0'
        }
      };

      logger.info('Plan generation completed', { 
        agentId, 
        requestId: 'unknown', 
        planType: plan.type,
        stepsCount: plan.steps?.length || 0,
        requiresApproval: approvalRequired
      });

      res.status(200).json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Error in plan generation', { 
        agentId: req.params.agentId, 
        requestId: 'unknown', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async createAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const agentData = req.body;

      logger.info('Creating new agent', { requestId: 'unknown' });

      const agent = await this.agentIntelligenceService.createAgent(agentData);

      logger.info('Agent created successfully', { 
        agentId: agent.id, 
        requestId: 'unknown' 
      });

      res.status(201).json({
        success: true,
        data: agent
      });

    } catch (error) {
      logger.error('Error creating agent', { 
        requestId: 'unknown', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async getAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { agentId } = req.params;

      const agent = await this.agentIntelligenceService.getAgent(agentId);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: agent
      });

    } catch (error) {
      logger.error('Error getting agent', { 
        agentId: req.params.agentId, 
        requestId: 'unknown', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async updateAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { agentId } = req.params;
      const updateData = req.body;

      const agent = await this.agentIntelligenceService.updateAgent(agentId, updateData);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      logger.info('Agent updated successfully', { 
        agentId, 
        requestId: 'unknown' 
      });

      res.status(200).json({
        success: true,
        data: agent
      });

    } catch (error) {
      logger.error('Error updating agent', { 
        agentId: req.params.agentId, 
        requestId: 'unknown', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async deleteAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { agentId } = req.params;

      await this.agentIntelligenceService.deleteAgent(agentId);

      logger.info('Agent deleted successfully', { 
        agentId, 
        requestId: 'unknown' 
      });

      res.status(204).send();

    } catch (error) {
      logger.error('Error deleting agent', { 
        agentId: req.params.agentId, 
        requestId: 'unknown', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async getAgentCapabilities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { agentId } = req.params;

      const agent = await this.agentIntelligenceService.getAgent(agentId);
      if (!agent) {
        throw new ApiError(404, 'Agent not found', 'AGENT_NOT_FOUND');
      }

      const capabilities = await this.capabilityDiscoveryService.getAgentCapabilities(agentId);

      res.status(200).json({
        success: true,
        data: {
          agentId,
          capabilities,
          totalCount: capabilities.length,
          lastUpdated: new Date()
        }
      });

    } catch (error) {
      logger.error('Error getting agent capabilities', { 
        agentId: req.params.agentId, 
        requestId: 'unknown', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }

  public async learnFromOperation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { agentId } = req.params;
      const { operationId, outcomes, feedback } = req.body;

      const learningResult = await this.agentIntelligenceService.learnFromOperation(
        agentId,
        operationId,
        outcomes,
        feedback
      );

      res.status(200).json({
        success: true,
        data: {
          learningApplied: learningResult.learningApplied,
          confidenceAdjustments: learningResult.confidenceAdjustments,
          newKnowledge: learningResult.newKnowledge
        }
      });

    } catch (error) {
      logger.error('Error in learning from operation', { 
        agentId: req.params.agentId, 
        requestId: 'unknown', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      next(error);
    }
  }
} 