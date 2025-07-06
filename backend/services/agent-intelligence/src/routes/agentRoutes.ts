import { Router } from 'express';
import { 
  authMiddleware, 
  validateRequest,
  loadAgentContext,
  trackAgentOperation,
  agentRateLimit
} from '@uaip/middleware';
import { 
  AgentCreateRequestSchema,
  AgentUpdateRequestSchema,
  AgentAnalysisRequestSchema,
  AgentPlanRequestSchema,
  AgentAnalysisRequest,
  AgentPlanRequest,
  AgentUpdateRequest,
  SecurityLevel,
  AgentStatus,
  AgentRole
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { AgentService, ToolService } from '@uaip/shared-services';
import {
  AgentCoreService,
  AgentContextService,
  AgentPlanningService,
  AgentLearningService,
  AgentDiscussionService
} from '../services/index.js';

// Lazy initialization of services to avoid singleton issues
let agentService: AgentService | null = null;
let toolService: ToolService | null = null;
let agentCore: AgentCoreService | null = null;
let agentContext: AgentContextService | null = null;
let agentPlanning: AgentPlanningService | null = null;
let agentLearning: AgentLearningService | null = null;
let agentDiscussion: AgentDiscussionService | null = null;

function getServices() {
  if (!agentService) {
    try {
      agentService = AgentService.getInstance();
      toolService = ToolService.getInstance();
      agentCore = new AgentCoreService();
      agentContext = new AgentContextService();
      agentPlanning = new AgentPlanningService();
      agentLearning = new AgentLearningService();
      agentDiscussion = new AgentDiscussionService();
    } catch (error) {
      logger.warn('Services not yet initialized, retrying...', error);
      return null;
    }
  }
  return { agentService, toolService, agentCore, agentContext, agentPlanning, agentLearning, agentDiscussion };
}

// Middleware to ensure services are ready
const ensureServicesReady = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const services = getServices();
  if (!services) {
    return res.status(503).json({ 
      error: 'Service temporarily unavailable', 
      message: 'Services are still initializing' 
    });
  }
  next();
};

// Create router
export function createAgentRoutes(): Router {
  const router = Router();

  // Simple health check route first
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'agent-intelligence' });
  });

  // List all agents
  router.get('/',
    authMiddleware,
    ensureServicesReady,
    async (req, res, next) => {
      try {
        const { agentCore } = getServices();
        const agents = await agentCore!.listAgents();
        res.json(agents);
      } catch (error) {
        next(error);
      }
    }
  );

  // Create agent (admin only)
  router.post('/',
    authMiddleware,
    validateRequest({ body: AgentCreateRequestSchema }),
    trackAgentOperation('create-agent'),
    async (req, res, next) => {
      try {
        const { agentCore } = getServices();
        const agent = await agentCore!.createAgent(req.body, req.user?.id || 'system');
        res.status(201).json(agent);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get agent by ID
  router.get('/:agentId',
    authMiddleware,
    loadAgentContext,
    trackAgentOperation('get-agent'),
    async (req, res, next) => {
      try {
        const { agentService } = getServices();
        const agent = await agentService!.findAgentById(req.agentContext!.agentId);
        res.json(agent);
      } catch (error) {
        next(error);
      }
    }
  );

  // Analyze context
  router.post('/:agentId/analyze',
    authMiddleware,
    validateRequest({ body: AgentAnalysisRequestSchema }),
    loadAgentContext,
    trackAgentOperation('agent-analyze'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const analysisRequest = req.body as AgentAnalysisRequest;
        const conversationContext = {
          id: 'temp-' + Date.now(),
          agentId: req.agentContext.agentId,
          userId: req.agentContext.userId,
          messages: [],
          startedAt: new Date(),
          lastActivityAt: new Date()
        };
        const { agentContext } = getServices();
        const result = await agentContext!.analyzeContext(
          req.agentContext.agentId,
          analysisRequest.userRequest,
          conversationContext,
          analysisRequest.constraints
        );
        res.json({
          success: true,
          data: result,
          metadata: {
            agentId: req.agentContext.agentId,
            operation: 'agent-analyze',
            timestamp: new Date()
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Plan execution
  router.post('/:agentId/plan',
    authMiddleware,
    validateRequest({ body: AgentPlanRequestSchema }),
    loadAgentContext,
    trackAgentOperation('agent-plan'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const planRequest = req.body as AgentPlanRequest;
        const { agentPlanning } = getServices();
        const plan = await agentPlanning!.generateExecutionPlan(
          req.agentContext.agentId,
          planRequest.analysis,
          planRequest.userPreferences,
          planRequest.securityContext
        );
        
        // Update agent status  
        const { agentService } = getServices();
        await agentService!.updateAgentStatus(req.agentContext.agentId, AgentStatus.ACTIVE);
        
        res.json({
          success: true,
          data: plan,
          metadata: {
            agentId: req.agentContext.agentId,
            operation: 'agent-plan',
            timestamp: new Date()
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Agent learning endpoint
  router.post('/:agentId/learn',
    authMiddleware,
    loadAgentContext,
    trackAgentOperation('agent-learn'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const learningData = req.body as Record<string, unknown>;
        const result = await agentLearning.processLearningData({
          agentId: req.agentContext.agentId,
          executionData: learningData
        });
        res.json({
          success: true,
          data: result,
          metadata: {
            agentId: req.agentContext.agentId,
            operation: 'agent-learn',
            timestamp: new Date()
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Agent chat endpoint
  router.post('/:agentId/chat',
    authMiddleware,
    loadAgentContext,
    trackAgentOperation('agent-chat'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const messageData = req.body as Record<string, unknown>;
        const result = await agentDiscussion.processDiscussionMessage({
          agentId: req.agentContext.agentId,
          userId: req.agentContext.userId,
          message: messageData.message as string,
          conversationId: messageData.conversationId as string
        });
        res.json({
          success: true,
          data: result,
          metadata: {
            agentId: req.agentContext.agentId,
            operation: 'agent-chat',
            timestamp: new Date()
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

// Helper function to execute tool logic (would be moved to capability registry)
async function executeToolLogic(tool: any, input: any, context: any): Promise<any> {
  // This is a placeholder - actual implementation would delegate to capability registry
  logger.info(`Executing tool ${tool.name} with input:`, input);
  
  // Simulate tool execution
  return {
    success: true,
    output: `Tool ${tool.name} executed successfully`,
    metadata: {
      toolId: tool.id,
      executedAt: new Date(),
      context: context.metadata
    }
  };
}