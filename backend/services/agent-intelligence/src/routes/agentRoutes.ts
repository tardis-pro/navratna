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

import { AgentController } from '../controllers/agentController.js';



// Create router
export function createAgentRoutes(): Router {
  const router = Router();
  
  // Initialize shared controller instance
  const agentController = new AgentController();
  
  // Initialize controller asynchronously when first accessed
  let controllerInitialized = false;
  const ensureInitialized = async () => {
    if (!controllerInitialized) {
      await agentController.initialize();
      controllerInitialized = true;
    }
    return agentController;
  };

  // Simple health check route first
  router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'agent-intelligence' });
  });

  // List all agents
  router.get('/',
    authMiddleware,
    async (req, res, next) => {
      try {
        const controller = await ensureInitialized();
        await controller.listAgents(req, res, next);
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
        const controller = await ensureInitialized();
        await controller.createAgent(req, res, next);
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
        const controller = await ensureInitialized();
        // Map agentId to id for controller compatibility
        req.params.id = req.params.agentId;
        await controller.getAgent(req, res, next);
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
        const controller = await ensureInitialized();
        // Map agentId to id for controller compatibility
        req.params.id = req.params.agentId;
        await controller.updateAgent(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Delete agent
  router.delete('/:agentId',
    authMiddleware,
    loadAgentContext,
    trackAgentOperation('delete-agent'),
    async (req, res, next) => {
      try {
        const controller = await ensureInitialized();
        // Map agentId to id for controller compatibility
        req.params.id = req.params.agentId;
        await controller.deleteAgent(req, res, next);
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
        const controller = await ensureInitialized();
        // Map agentId to id for controller compatibility
        req.params.id = req.params.agentId;
        
        // Adapt the request body to match controller expectations
        const analysisRequest = req.body as AgentAnalysisRequest;
        req.body = {
          conversationContext: {
            id: 'temp-' + Date.now(),
            agentId: req.agentContext.agentId,
            userId: req.agentContext.userId,
            messages: [],
            startedAt: new Date(),
            lastActivityAt: new Date()
          },
          userRequest: analysisRequest.userRequest,
          constraints: analysisRequest.constraints
        };
        
        await controller.analyzeContext(req, res, next);
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
        const controller = await ensureInitialized();
        // Map agentId to id for controller compatibility
        req.params.id = req.params.agentId;
        
        const planRequest = req.body as AgentPlanRequest;
        
        // Execute plan generation through controller
        await controller.planExecution(req, res, next);
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
        const controller = await ensureInitialized();
        // Map agentId to id for controller compatibility
        req.params.id = req.params.agentId;
        
        await controller.learnFromExecution(req, res, next);
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
        const controller = await ensureInitialized();
        // Map agentId to id for controller compatibility
        req.params.id = req.params.agentId;
        
        // Adapt the request body to include agentContext data
        const messageData = req.body as Record<string, unknown>;
        req.body = {
          ...messageData,
          agentId: req.agentContext.agentId,
          userId: req.agentContext.userId
        };
        
        await controller.handleAgentChat(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Generic Tool Management Routes (for all tool types)
  
  // Add any tool to agent
  router.post('/:agentId/tools',
    authMiddleware,
    trackAgentOperation('add-tool-to-agent'),
    async (req, res, next) => {
      try {
        const { agentId } = req.params;
        const { toolId } = req.body;
        
        if (!toolId) {
          res.status(400).json({ 
            success: false, 
            error: 'toolId is required' 
          });
          return;
        }

        // TODO: Implement actual tool attachment logic
        // For now, return success response
        logger.info(`Adding tool ${toolId} to agent ${agentId}`);
        
        res.json({
          success: true,
          data: {
            agentId,
            toolId,
            message: 'Tool added to agent successfully'
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Remove any tool from agent
  router.delete('/:agentId/tools/:toolId',
    authMiddleware,
    trackAgentOperation('remove-tool-from-agent'),
    async (req, res, next) => {
      try {
        const { agentId, toolId } = req.params;
        
        // TODO: Implement actual tool removal logic
        logger.info(`Removing tool ${toolId} from agent ${agentId}`);
        
        res.json({
          success: true,
          data: {
            agentId,
            toolId,
            message: 'Tool removed from agent successfully'
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // Get agent's attached tools
  router.get('/:agentId/tools',
    authMiddleware,
    trackAgentOperation('get-agent-tools'),
    async (req, res, next) => {
      try {
        const { agentId } = req.params;
        
        // TODO: Implement actual tool retrieval logic
        // For now, return empty array
        res.json({
          success: true,
          data: {
            agentId,
            tools: [],
            count: 0
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // MCP Tool Management Routes
  
  // Get available MCP tools
  router.get('/mcp-tools',
    trackAgentOperation('get-mcp-tools'),
    async (req, res, next) => {
      try {
        const controller = await ensureInitialized();
        await controller.getAvailableMCPTools(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get agent's assigned MCP tools
  router.get('/:agentId/mcp-tools',
    trackAgentOperation('get-agent-mcp-tools'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const controller = await ensureInitialized();
        req.params.id = req.params.agentId;
        await controller.getAgentMCPTools(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Assign MCP tools to agent
  router.post('/:agentId/mcp-tools',
    trackAgentOperation('assign-agent-mcp-tools'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const controller = await ensureInitialized();
        req.params.id = req.params.agentId;
        await controller.assignMCPToolsToAgent(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update agent's MCP tool assignment
  router.put('/:agentId/mcp-tools/:toolId',
    trackAgentOperation('update-agent-mcp-tool'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const controller = await ensureInitialized();
        req.params.id = req.params.agentId;
        await controller.updateAgentMCPTool(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Remove MCP tool from agent
  router.delete('/:agentId/mcp-tools/:toolId',
    trackAgentOperation('remove-agent-mcp-tool'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const controller = await ensureInitialized();
        req.params.id = req.params.agentId;
        await controller.removeMCPToolFromAgent(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update agent's MCP tool settings
  router.put('/:agentId/mcp-settings',
    trackAgentOperation('update-agent-mcp-settings'),
    async (req, res, next) => {
      try {
        if (!req.agentContext) {
          res.status(401).json({ error: 'Agent context required' });
          return;
        }
        const controller = await ensureInitialized();
        req.params.id = req.params.agentId;
        await controller.updateAgentMCPSettings(req, res, next);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

