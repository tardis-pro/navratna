import { Router, Request, Response, NextFunction } from 'express';
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

import {
  AgentCoreService,
  AgentContextService,
  AgentPlanningService,
  AgentLearningService,
  AgentDiscussionService
} from '../services/index.js';



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
    async (req, res, next) => {
      try {
        const agentCore = new AgentCoreService();
        const agents = await agentCore.listAgents();
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
        const agentCore = new AgentCoreService();
        const agent = await agentCore.createAgent(req.body, req.user?.id || 'system');
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
        const agentCore = new AgentCoreService();
        const agent = await agentCore.getAgent(req.params.agentId);
        res.json(agent);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update agent
  router.put('/:agentId',
    authMiddleware,
    validateRequest({ body: AgentUpdateRequestSchema }),
    loadAgentContext,
    trackAgentOperation('update-agent'),
    async (req, res, next) => {
      try {
        const agentCore = new AgentCoreService();
        const updatedAgent = await agentCore.updateAgent(req.params.agentId, req.body, req.user?.id || 'system');
        res.json(updatedAgent);
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
        const agentContext = new AgentContextService();
        const result = await agentContext.analyzeContext(
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
        const agentPlanning = new AgentPlanningService();
        const plan = await agentPlanning.generateExecutionPlan(
          req.agentContext.agentId,
          planRequest.analysis,
          planRequest.userPreferences,
          planRequest.securityContext
        );
        
        // Update agent status  
        const agentCore = new AgentCoreService();
        await agentCore.updateAgent(req.agentContext.agentId, { status: AgentStatus.ACTIVE }, req.user?.id || 'system');
        
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
    trackAgentOperation('agent-learn'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const agentLearning = new AgentLearningService();
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
    trackAgentOperation('agent-chat'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const agentDiscussion = new AgentDiscussionService();
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

