import { Router } from 'express';
import { AgentController } from '../controllers/agentController.js';
import { 
  validateRequest, 
  validateUUID,
  authMiddleware,
  AgentValidationMiddleware 
} from '@uaip/middleware';
import { AgentAnalysisSchema } from '@uaip/types';
import { AgentPlanRequestSchema } from '@uaip/types';
import { Request, Response, NextFunction } from 'express';

export function createAgentRoutes(agentController: AgentController): Router {
  const router: Router = Router();

  // Apply authentication middleware to all routes
  router.use(authMiddleware);

  // POST /api/v1/agents - Enhanced with persona transformation support
  router.post(
    '/',
    AgentValidationMiddleware.validateAgentCreation,
    agentController.createAgent.bind(agentController)
  );

  // GET /api/v1/agents - Enhanced with query validation
  router.get(
    '/',
    AgentValidationMiddleware.validateAgentQuery,
    (req: Request, res: Response, next: NextFunction) => agentController.getAgents(req, res, next)
  );

  // POST /api/v1/agents/:agentId/analyze
  router.post(
    '/:agentId/analyze',
    validateUUID('agentId'),
    validateRequest({ body: AgentAnalysisSchema }),
    agentController.analyzeContext.bind(agentController)
  );

  // POST /api/v1/agents/:agentId/plan
  router.post(
    '/:agentId/plan',
    validateUUID('agentId'),
    validateRequest({ body: AgentPlanRequestSchema }),
    agentController.generatePlan.bind(agentController)
  );

  // GET /api/v1/agents/:agentId
  router.get(
    '/:agentId',
    validateUUID('agentId'),
    agentController.getAgent.bind(agentController)
  );

  // GET /api/v1/agents/:agentId/with-persona - COMPOSITION MODEL
  router.get(
    '/:agentId/with-persona',
    validateUUID('agentId'),
    agentController.getAgentWithPersona.bind(agentController)
  );

  // PUT /api/v1/agents/:agentId - Enhanced with update validation
  router.put(
    '/:agentId',
    validateUUID('agentId'),
    AgentValidationMiddleware.validateAgentUpdate,
    agentController.updateAgent.bind(agentController)
  );

  // DELETE /api/v1/agents/:agentId
  router.delete(
    '/:agentId',
    validateUUID('agentId'),
    agentController.deleteAgent.bind(agentController)
  );

  // GET /api/v1/agents/:agentId/capabilities
  router.get(
    '/:agentId/capabilities',
    validateUUID('agentId'),
    agentController.getAgentCapabilities.bind(agentController)
  );

  // POST /api/v1/agents/:agentId/learn
  router.post(
    '/:agentId/learn',
    validateUUID('agentId'),
    agentController.learnFromOperation.bind(agentController)
  );

  // POST /api/v1/agents/:agentId/participate
  router.post(
    '/:agentId/participate',
    validateUUID('agentId'),
    agentController.participateInDiscussion.bind(agentController)
  );

  // POST /api/v1/agents/:agentId/chat - Casual conversation with agent
  router.post(
    '/:agentId/chat',
    validateUUID('agentId'),
    agentController.chatWithAgent.bind(agentController)
  );

  return router;
} 