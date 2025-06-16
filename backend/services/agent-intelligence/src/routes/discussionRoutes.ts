import { Router } from 'express';
import { DiscussionController } from '../controllers/discussionController';
import { 
  validateRequest, 
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
    discussionController.getDiscussion.bind(discussionController)
  );

  // PUT /api/v1/discussions/:discussionId
  router.put(
    '/:discussionId',
   validateRequest({ body: UpdateDiscussionRequestSchema }),
    discussionController.updateDiscussion.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/start
  router.post(
    '/:discussionId/start',
   discussionController.startDiscussion.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/end
  router.post(
    '/:discussionId/end',
   discussionController.endDiscussion.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/participants
  router.post(
    '/:discussionId/participants',
   discussionController.addParticipant.bind(discussionController)
  );

  // DELETE /api/v1/discussions/:discussionId/participants/:participantId
  router.delete(
    '/:discussionId/participants/:participantId',
   
    discussionController.removeParticipant.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/participants/:participantId/messages
  router.post(
    '/:discussionId/participants/:participantId/messages',
   
    discussionController.sendMessage.bind(discussionController)
  );

  // GET /api/v1/discussions/:discussionId/messages
  router.get(
    '/:discussionId/messages',
   discussionController.getMessages.bind(discussionController)
  );

  // POST /api/v1/discussions/:discussionId/advance-turn
  router.post(
    '/:discussionId/advance-turn',
   discussionController.advanceTurn.bind(discussionController)
  );

  // GET /api/v1/discussions/:discussionId/analytics
  router.get(
    '/:discussionId/analytics',
   discussionController.getDiscussionAnalytics.bind(discussionController)
  );

  return router;
}

// For backward compatibility, export a default router
// This will be replaced when the service is properly initialized
export { router as discussionRoutes }; 