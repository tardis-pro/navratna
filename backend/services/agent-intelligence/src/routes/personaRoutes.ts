import { Router } from 'express';
import { PersonaController } from '../controllers/personaController';
import { 
  validateRequest, 
  validateUUID, 
  validateJSON,
  authMiddleware,
  requireOperator 
} from '@uaip/middleware';
import { 
  CreatePersonaRequestSchema,
  UpdatePersonaRequestSchema,
  PersonaSchema 
} from '@uaip/types';

const router: Router = Router();

// Note: PersonaController will be initialized with PersonaService in the main service
// This is a factory function that takes the service instances
export function createPersonaRoutes(personaController: PersonaController): Router {
  // Apply JSON validation middleware to all routes
  router.use(validateJSON());

  // Apply authentication middleware to all routes
  router.use(authMiddleware);

  // POST /api/v1/personas
  router.post(
    '/',
    validateRequest({ body: CreatePersonaRequestSchema }),
    personaController.createPersona.bind(personaController)
  );

  // GET /api/v1/personas/search
  router.get(
    '/search',
    personaController.searchPersonas.bind(personaController)
  );

  // GET /api/v1/personas/recommendations
  router.get(
    '/recommendations',
    personaController.getPersonaRecommendations.bind(personaController)
  );

  // GET /api/v1/personas/templates
  router.get(
    '/templates',
    personaController.getPersonaTemplates.bind(personaController)
  );

  // GET /api/v1/personas/:personaId
  router.get(
    '/:personaId',
    validateUUID('personaId'),
    personaController.getPersona.bind(personaController)
  );

  // PUT /api/v1/personas/:personaId
  router.put(
    '/:personaId',
    validateUUID('personaId'),
    validateRequest({ body: UpdatePersonaRequestSchema }),
    personaController.updatePersona.bind(personaController)
  );

  // DELETE /api/v1/personas/:personaId
  router.delete(
    '/:personaId',
    validateUUID('personaId'),
    personaController.deletePersona.bind(personaController)
  );

  // GET /api/v1/personas/:personaId/analytics
  router.get(
    '/:personaId/analytics',
    validateUUID('personaId'),
    personaController.getPersonaAnalytics.bind(personaController)
  );

  // POST /api/v1/personas/:personaId/validate
  router.post(
    '/:personaId/validate',
    validateUUID('personaId'),
    personaController.validatePersona.bind(personaController)
  );

  return router;
}

// For backward compatibility, export a default router
// This will be replaced when the service is properly initialized
export { router as personaRoutes }; 