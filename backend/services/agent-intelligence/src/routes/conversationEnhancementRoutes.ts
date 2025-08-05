/**
 * Conversation Enhancement API Routes
 * 
 * Provides REST API endpoints for conversation enhancement functionality
 * including persona selection, contextual responses, and conversation analysis.
 */

import { Router, Request, Response } from '@uaip/shared-services/express-compat';
import { z } from 'zod';
import { logger } from '@uaip/utils';
import { validateRequest, authMiddleware } from '@uaip/middleware';
import { ConversationEnhancementService } from '../services/conversation-enhancement.service.js';

// Request validation schemas
const enhancementRequestSchema = z.object({
  discussionId: z.string().min(1),
  availableAgentIds: z.array(z.string()).min(1),
  messageHistory: z.array(z.object({
    id: z.string(),
    speaker: z.string(),
    content: z.string(),
    timestamp: z.coerce.date(),
    metadata: z.record(z.any()).optional()
  })),
  currentTopic: z.string().min(1),
  conversationState: z.object({
    activePersonaId: z.string().nullable(),
    lastSpeakerContinuityCount: z.number(),
    recentContributors: z.array(z.string()),
    conversationEnergy: z.number().min(0).max(1),
    needsClarification: z.boolean(),
    topicStability: z.enum(['stable', 'shifting', 'diverging'])
  }).optional(),
  participantId: z.string().optional(),
  enhancementType: z.enum(['auto', 'manual', 'triggered']).optional(),
  context: z.record(z.any()).optional()
});

const analysisRequestSchema = z.object({
  discussionId: z.string().min(1),
  messageHistory: z.array(z.object({
    id: z.string(),
    speaker: z.string(),
    content: z.string(),
    timestamp: z.coerce.date(),
    metadata: z.record(z.any()).optional()
  })),
  conversationState: z.object({
    activePersonaId: z.string().nullable(),
    lastSpeakerContinuityCount: z.number(),
    recentContributors: z.array(z.string()),
    conversationEnergy: z.number().min(0).max(1),
    needsClarification: z.boolean(),
    topicStability: z.enum(['stable', 'shifting', 'diverging'])
  }),
  analysisType: z.enum(['flow', 'insights', 'health', 'patterns'])
});

const hybridPersonaRequestSchema = z.object({
  persona1Id: z.string().min(1),
  persona2Id: z.string().min(1),
  hybridConfig: z.object({
    name: z.string().optional(),
    dominantTraits: z.enum(['persona1', 'persona2', 'balanced']).optional(),
    blendRatio: z.number().min(0).max(1).optional(),
    customAttributes: z.record(z.any()).optional()
  }).optional()
});

const contextualResponseRequestSchema = z.object({
  agentId: z.string().min(1),
  personaId: z.string().min(1),
  context: z.object({
    recentTopics: z.array(z.string()),
    conversationMomentum: z.enum(['building', 'stable', 'declining', 'clarifying', 'deciding']),
    overallTone: z.enum(['collaborative', 'competitive', 'analytical', 'creative']),
    topicShiftDetected: z.boolean(),
    participantCount: z.number()
  }),
  baseContent: z.string().min(1)
});

export function createConversationEnhancementRoutes(
  conversationEnhancementService: ConversationEnhancementService
): Router {
  const router = Router();

  /**
   * POST /conversation/enhance
   * Get enhanced conversation contribution from available agents
   */
  router.post('/enhance', 
    authMiddleware,
    validateRequest({ body: enhancementRequestSchema }),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const requestData = req.body;
        
        logger.info('Processing conversation enhancement request', {
          discussionId: requestData.discussionId,
          agentCount: requestData.availableAgentIds.length,
          userId: req.user.id
        });

        // Get agent objects through conversation enhancement service
        const agents = await conversationEnhancementService.getAgentsByIds(requestData.availableAgentIds);

        if (agents.length === 0) {
          res.status(400).json({
            success: false,
            error: 'No valid agents found for enhancement'
          });
          return;
        }

        const result = await conversationEnhancementService.getEnhancedContribution({
          discussionId: requestData.discussionId,
          availableAgents: agents,
          messageHistory: requestData.messageHistory,
          currentTopic: requestData.currentTopic,
          conversationState: requestData.conversationState,
          participantId: requestData.participantId,
          enhancementType: requestData.enhancementType || 'manual',
          context: requestData.context
        });

        res.json({
          success: result.success,
          data: result.success ? {
            selectedAgent: result.selectedAgent,
            selectedPersona: result.selectedPersona,
            enhancedResponse: result.enhancedResponse,
            contributionScores: result.contributionScores,
            updatedState: result.updatedState,
            flowAnalysis: result.flowAnalysis,
            suggestions: result.suggestions,
            nextActions: result.nextActions
          } : undefined,
          error: result.error
        });

      } catch (error) {
        logger.error('Failed to process conversation enhancement request', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: req.user.id
        });

        res.status(500).json({
          success: false,
          error: 'Internal server error during conversation enhancement'
        });
      }
    }
  );

  /**
   * POST /conversation/analyze
   * Analyze conversation patterns, flow, and health
   */
  router.post('/analyze',
    authMiddleware,
    validateRequest({ body: analysisRequestSchema }),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const requestData = req.body;

        logger.info('Processing conversation analysis request', {
          discussionId: requestData.discussionId,
          analysisType: requestData.analysisType,
          messageCount: requestData.messageHistory.length,
          userId: req.user.id
        });

        const result = await conversationEnhancementService.analyzeConversation({
          discussionId: requestData.discussionId,
          messageHistory: requestData.messageHistory,
          conversationState: requestData.conversationState,
          analysisType: requestData.analysisType
        });

        res.json({
          success: true,
          data: result
        });

      } catch (error) {
        logger.error('Failed to analyze conversation', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: req.user.id
        });

        res.status(500).json({
          success: false,
          error: 'Failed to analyze conversation'
        });
      }
    }
  );

  /**
   * POST /conversation/hybrid-persona
   * Create a hybrid persona by cross-breeding two existing personas
   */
  router.post('/hybrid-persona',
    authMiddleware,
    validateRequest({ body: hybridPersonaRequestSchema }),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { persona1Id, persona2Id, hybridConfig } = req.body;

        logger.info('Creating hybrid persona', {
          persona1Id,
          persona2Id,
          userId: req.user.id
        });

        const hybridPersona = await conversationEnhancementService.createHybridPersona(
          persona1Id,
          persona2Id,
          hybridConfig
        );

        res.json({
          success: true,
          data: {
            hybridPersona
          }
        });

      } catch (error) {
        logger.error('Failed to create hybrid persona', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: req.user.id
        });

        res.status(500).json({
          success: false,
          error: 'Failed to create hybrid persona'
        });
      }
    }
  );

  /**
   * POST /conversation/contextual-response
   * Generate a contextual response for a specific agent/persona
   */
  router.post('/contextual-response',
    authMiddleware,
    validateRequest({ body: contextualResponseRequestSchema }),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { agentId, personaId, context, baseContent } = req.body;

        logger.info('Generating contextual response', {
          agentId,
          personaId,
          contentLength: baseContent.length,
          userId: req.user.id
        });

        const enhancedResponse = await conversationEnhancementService.generateContextualResponse(
          agentId,
          personaId,
          context,
          baseContent
        );

        res.json({
          success: true,
          data: {
            enhancedResponse,
            originalContent: baseContent,
            context
          }
        });

      } catch (error) {
        logger.error('Failed to generate contextual response', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: req.user.id
        });

        res.status(500).json({
          success: false,
          error: 'Failed to generate contextual response'
        });
      }
    }
  );

  /**
   * GET /conversation/personas/:agentId
   * Get available personas for a specific agent
   */
  router.get('/personas/:agentId',
    authMiddleware,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { agentId } = req.params;

        logger.info('Getting personas for agent', { agentId, userId: req.user.id });

        // Get agent through conversation enhancement service
        const agent = await conversationEnhancementService.getAgentById(agentId);
        if (!agent) {
          res.status(404).json({
            success: false,
            error: 'Agent not found'
          });
          return;
        }

        // Get personas from the conversation enhancement service
        // This would require adding a method to expose persona mappings
        // For now, return a placeholder response
        res.json({
          success: true,
          data: {
            agentId,
            personas: [
              {
                id: `${agentId}-primary`,
                name: agent.name,
                description: agent.description,
                role: agent.role
              }
            ]
          }
        });

      } catch (error) {
        logger.error('Failed to get agent personas', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: req.user.id
        });

        res.status(500).json({
          success: false,
          error: 'Failed to get agent personas'
        });
      }
    }
  );

  /**
   * GET /conversation/health/:discussionId
   * Get conversation health metrics for a discussion
   */
  router.get('/health/:discussionId',
    authMiddleware,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { discussionId } = req.params;

        logger.info('Getting conversation health', { discussionId, userId: req.user.id });

        // Verify user has access to the discussion through conversation service
        const discussion = await conversationEnhancementService.getDiscussion(discussionId);
        if (!discussion) {
          res.status(404).json({
            success: false,
            error: 'Discussion not found'
          });
          return;
        }

        // Get conversation health analysis
        // This would require implementing conversation state tracking
        // For now, return a placeholder response
        res.json({
          success: true,
          data: {
            discussionId,
            healthScore: 0.8,
            metrics: {
              participationBalance: 0.7,
              topicCohesion: 0.9,
              conversationFlow: 0.8,
              engagementLevel: 0.75
            },
            recommendations: [
              'Encourage more balanced participation',
              'Consider introducing new perspectives'
            ]
          }
        });

      } catch (error) {
        logger.error('Failed to get conversation health', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: req.user.id
        });

        res.status(500).json({
          success: false,
          error: 'Failed to get conversation health'
        });
      }
    }
  );

  return router;
}