import { Router } from 'express';
import { z } from 'zod';
import { DiscussionController } from '../controllers/discussionController';
import { 
  validateRequest, 
  validateUUID,
  validateJSON,
  authMiddleware,
  requireOperator 
} from '@uaip/middleware';
import { 
  CreateDiscussionRequestSchema,
  UpdateDiscussionRequestSchema,
  DiscussionSchema 
} from '@uaip/types';

const router: Router = Router();

// Note: DiscussionController will be initialized with DiscussionService in the main service
// This is a factory function that takes the service instances
export function createDiscussionRoutes(discussionController: DiscussionController): Router {
  // Apply JSON validation middleware to all routes
  // router.use(validateJSON());

  // Apply authentication middleware to all routes
  router.use(authMiddleware);

  // GET /api/v1/discussions - List all discussions
  router.get(
    '/',
    discussionController.listDiscussions.bind(discussionController)
  );

  // POST /api/v1/discussions
  router.post(
    '/',
    validateRequest({ body: CreateDiscussionRequestSchema }),
    discussionController.createDiscussion.bind(discussionController)
  );

  // GET /api/v1/discussions/search
  router.get(
    '/search',
    discussionController.searchDiscussions.bind(discussionController)
  );

  // GET /api/v1/discussions/:discussionId
  router.get(
    '/:discussionId',
    validateUUID('discussionId'),
    discussionController.getDiscussion.bind(discussionController)
  );

  // PUT /api/v1/discussions/:discussionId
  router.put(
    '/:discussionId',
    validateUUID('discussionId'),
    validateRequest({ body: UpdateDiscussionRequestSchema }),
    discussionController.updateDiscussion.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/start
  router.post(
    '/:discussionId/start',
    validateUUID('discussionId'),
    discussionController.startDiscussion.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/end
  router.post(
    '/:discussionId/end',
    validateUUID('discussionId'),
    discussionController.endDiscussion.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/complete (alias for end)
  router.post(
    '/:discussionId/complete',
    validateUUID('discussionId'),
    discussionController.endDiscussion.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/pause
  router.post(
    '/:discussionId/pause',
    validateUUID('discussionId'),
    discussionController.pauseDiscussion.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/resume
  router.post(
    '/:discussionId/resume',
    validateUUID('discussionId'),
    discussionController.resumeDiscussion.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/participants
  router.post(
    '/:discussionId/participants',
    validateUUID('discussionId'),
    discussionController.addParticipant.bind(discussionController)
  );

  // DELETE /api/v1/discussions/:discussionId/participants/:participantId
  router.delete(
    '/:discussionId/participants/:participantId',
    validateRequest({
      params: z.object({
        discussionId: z.string().uuid(),
        participantId: z.string().uuid()
      })
    }),
    discussionController.removeParticipant.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/participants/:participantId/messages
  router.post(
    '/:discussionId/participants/:participantId/messages',
    validateRequest({
      params: z.object({
        discussionId: z.string().uuid(),
        participantId: z.string().uuid()
      })
    }),
    discussionController.sendMessage.bind(discussionController)
  );

  // GET /api/v1/discussions/:discussionId/messages
  router.get(
    '/:discussionId/messages',
    validateUUID('discussionId'),
    discussionController.getMessages.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/advance-turn
  router.post(
    '/:discussionId/advance-turn',
    validateUUID('discussionId'),
    discussionController.advanceTurn.bind(discussionController)
  );

  // GET /api/v1/discussions/:discussionId/analytics
  router.get(
    '/:discussionId/analytics',
    validateUUID('discussionId'),
    discussionController.getDiscussionAnalytics.bind(discussionController)
  );

  return router;
}

// For backward compatibility, export a default router
// This will be replaced when the service is properly initialized
export { router as discussionRoutes }; 