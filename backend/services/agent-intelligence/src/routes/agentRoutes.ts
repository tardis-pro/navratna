import { Router } from 'express';
import { 
  authMiddleware, 
  requireAdmin, 
  validateRequest,
  loadAgentContext,
  requireAgentPermission,
  requireSecurityLevel,
  trackAgentOperation,
  executeAgentOperation,
  requireAgentCapability,
  requireAgentStatus,
  agentOperationChain,
  agentRateLimit
} from '@uaip/middleware';
import { 
  AgentCreateRequestSchema,
  AgentUpdateRequestSchema,
  AgentAnalysisRequestSchema,
  AgentPlanRequestSchema,
  SecurityLevel,
  AgentStatus,
  AgentRole
} from '@uaip/types';
import { logger } from '@uaip/utils/logger';
import { AgentService } from '@uaip/shared-services/services/AgentService';
import { ToolService } from '@uaip/shared-services/services/ToolService';
import {
  AgentCoreService,
  AgentContextService,
  AgentPlanningService,
  AgentLearningService,
  AgentDiscussionService,
  AgentEventOrchestrator
} from '../services/index.js';

// Initialize services
const agentService = AgentService.getInstance();
const toolService = ToolService.getInstance();

// Initialize intelligence services
const agentCore = new AgentCoreService({
  databaseService: agentService as any,
  eventBusService: {} as any,
  serviceName: 'agent-intelligence',
  securityLevel: 3
});

const agentContext = new AgentContextService({
  knowledgeGraphService: {} as any,
  llmService: {} as any,
  eventBusService: {} as any,
  serviceName: 'agent-intelligence',
  securityLevel: 3
});

const agentPlanning = new AgentPlanningService({
  databaseService: agentService as any,
  eventBusService: {} as any,
  serviceName: 'agent-intelligence',
  securityLevel: 3
});

const agentLearning = new AgentLearningService({
  knowledgeGraphService: {} as any,
  eventBusService: {} as any,
  serviceName: 'agent-intelligence',
  securityLevel: 3
});

const agentDiscussion = new AgentDiscussionService({
  discussionService: {} as any,
  eventBusService: {} as any,
  serviceName: 'agent-intelligence',
  securityLevel: 3
});

// Create router
export function createAgentRoutes(): Router {
  const router = Router();

  // List all agents
  router.get('/',
    authMiddleware,
    agentRateLimit(),
    trackAgentOperation('list-agents'),
    async (req, res, next) => {
      try {
        const agents = await agentService.findActiveAgents();
        res.json(agents);
      } catch (error) {
        next(error);
      }
    }
  );

  // Create agent (admin only)
  router.post('/',
    authMiddleware,
    requireAdmin,
    validateRequest(AgentCreateRequestSchema),
    trackAgentOperation('create-agent'),
    async (req, res, next) => {
      try {
        const agent = await agentCore.createAgent(req.body);
        res.status(201).json(agent);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get agent by ID
  router.get('/:agentId',
    authMiddleware,
    ...agentOperationChain({
      trackOperation: 'get-agent',
      rateLimit: true
    }),
    async (req, res, next) => {
      try {
        const agent = req.agentContext!.agent;
        res.json(agent);
      } catch (error) {
        next(error);
      }
    }
  );

  // Update agent
  router.put('/:agentId',
    authMiddleware,
    requireAdmin,
    validateRequest(AgentUpdateRequestSchema),
    ...agentOperationChain({
      trackOperation: 'update-agent',
      allowedStatuses: [AgentStatus.READY, AgentStatus.INACTIVE]
    }),
    executeAgentOperation(async (context, params) => {
      return await agentCore.updateAgent(context.agentId, params.body);
    })
  );

  // Delete agent
  router.delete('/:agentId',
    authMiddleware,
    requireAdmin,
    ...agentOperationChain({
      trackOperation: 'delete-agent',
      allowedStatuses: [AgentStatus.INACTIVE]
    }),
    executeAgentOperation(async (context) => {
      return await agentCore.deleteAgent(context.agentId);
    })
  );

  // Analyze context
  router.post('/:agentId/analyze',
    authMiddleware,
    validateRequest(AgentAnalysisRequestSchema),
    ...agentOperationChain({
      requiredCapability: 'analysis',
      minSecurityLevel: SecurityLevel.MEDIUM,
      allowedStatuses: [AgentStatus.READY, AgentStatus.ACTIVE],
      trackOperation: 'agent-analyze',
      rateLimit: true
    }),
    executeAgentOperation(async (context, params) => {
      return await agentContext.analyzeContext({
        agentId: context.agentId,
        ...params.body
      });
    })
  );

  // Plan execution
  router.post('/:agentId/plan',
    authMiddleware,
    validateRequest(AgentPlanRequestSchema),
    ...agentOperationChain({
      requiredCapability: 'planning',
      minSecurityLevel: SecurityLevel.HIGH,
      allowedStatuses: [AgentStatus.READY],
      trackOperation: 'agent-plan',
      rateLimit: true
    }),
    executeAgentOperation(async (context, params) => {
      const plan = await agentPlanning.createExecutionPlan({
        agentId: context.agentId,
        ...params.body
      });
      
      // Update agent status
      await agentService.updateAgentStatus(context.agentId, AgentStatus.ACTIVE);
      
      return plan;
    })
  );

  // Execute tool
  router.post('/:agentId/tools/:toolName/execute',
    authMiddleware,
    ...agentOperationChain({
      requiredCapability: 'tool-execution',
      minSecurityLevel: SecurityLevel.MEDIUM,
      allowedStatuses: [AgentStatus.READY, AgentStatus.ACTIVE],
      trackOperation: 'agent-tool-execute',
      rateLimit: true
    }),
    executeAgentTool(req => req.params.toolName),
    executeAgentOperation(async (context, params) => {
      const { toolName, body } = params;
      
      // Create tool execution record
      const tool = await toolService.findToolByName(toolName);
      if (!tool) {
        throw new Error(`Tool ${toolName} not found`);
      }

      const execution = await toolService.createExecution({
        toolId: tool.id,
        agentId: context.agentId,
        userId: params.userId,
        input: body,
        context: context.metadata
      });

      // Execute tool (this would be delegated to capability registry)
      try {
        const result = await executeToolLogic(tool, body, context);
        
        await toolService.updateExecution(execution.id, {
          status: 'completed',
          output: result,
          duration: Date.now() - execution.startedAt.getTime()
        });

        // Track usage
        await toolService.trackUsage({
          toolId: tool.id,
          agentId: context.agentId,
          executionId: execution.id,
          success: true,
          executionTime: Date.now() - execution.startedAt.getTime()
        });

        return result;
      } catch (error) {
        await toolService.updateExecution(execution.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        await toolService.trackUsage({
          toolId: tool.id,
          agentId: context.agentId,
          executionId: execution.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        throw error;
      }
    })
  );

  // Get agent capabilities
  router.get('/:agentId/capabilities',
    authMiddleware,
    ...agentOperationChain({
      trackOperation: 'get-agent-capabilities',
      rateLimit: true
    }),
    async (req, res, next) => {
      try {
        const capabilities = req.agentContext!.agent.capabilities || [];
        res.json(capabilities);
      } catch (error) {
        next(error);
      }
    }
  );

  // Assign capability to agent
  router.post('/:agentId/capabilities/:capabilityId',
    authMiddleware,
    requireAdmin,
    ...agentOperationChain({
      trackOperation: 'assign-capability',
      allowedStatuses: [AgentStatus.READY, AgentStatus.INACTIVE]
    }),
    executeAgentOperation(async (context, params) => {
      await agentService.assignCapabilityToAgent(context.agentId, params.capabilityId);
      return { message: 'Capability assigned successfully' };
    })
  );

  // Get agent tools
  router.get('/:agentId/tools',
    authMiddleware,
    ...agentOperationChain({
      trackOperation: 'get-agent-tools',
      rateLimit: true
    }),
    async (req, res, next) => {
      try {
        const tools = await toolService.getAgentTools(req.agentContext!.agentId);
        res.json(tools);
      } catch (error) {
        next(error);
      }
    }
  );

  // Assign tool to agent
  router.post('/:agentId/tools/:toolId',
    authMiddleware,
    requireAdmin,
    ...agentOperationChain({
      trackOperation: 'assign-tool',
      allowedStatuses: [AgentStatus.READY, AgentStatus.INACTIVE]
    }),
    executeAgentOperation(async (context, params) => {
      await toolService.assignToolToAgent(context.agentId, params.toolId, {
        canExecute: params.body?.canExecute ?? true,
        canRead: params.body?.canRead ?? true,
        customConfig: params.body?.customConfig
      });
      return { message: 'Tool assigned successfully' };
    })
  );

  // Get agent metrics
  router.get('/:agentId/metrics',
    authMiddleware,
    ...agentOperationChain({
      trackOperation: 'get-agent-metrics',
      rateLimit: true
    }),
    executeAgentOperation(async (context, params) => {
      const days = parseInt(params.query?.days as string) || 30;
      return await agentService.getAgentMetrics(context.agentId, days);
    })
  );

  // Agent learning endpoint
  router.post('/:agentId/learn',
    authMiddleware,
    ...agentOperationChain({
      requiredCapability: 'learning',
      minSecurityLevel: SecurityLevel.HIGH,
      allowedStatuses: [AgentStatus.READY, AgentStatus.ACTIVE],
      trackOperation: 'agent-learn'
    }),
    executeAgentOperation(async (context, params) => {
      return await agentLearning.learnFromExecution({
        agentId: context.agentId,
        executionData: params.body
      });
    })
  );

  // Agent chat endpoint
  router.post('/:agentId/chat',
    authMiddleware,
    ...agentOperationChain({
      requiredCapability: 'chat',
      allowedStatuses: [AgentStatus.READY, AgentStatus.ACTIVE],
      trackOperation: 'agent-chat',
      rateLimit: true
    }),
    executeAgentOperation(async (context, params) => {
      return await agentDiscussion.handleChatMessage({
        agentId: context.agentId,
        userId: params.userId,
        message: params.body.message,
        conversationId: params.body.conversationId
      });
    })
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