import { Router } from '@uaip/shared-services/express-compat';
import { PersonaController } from '../controllers/personaController';
import { 
  validateRequest, 
  validateUUID, 
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
  // ===== DEBUG ROUTE (NO AUTH) =====
  
  // GET /api/v1/personas/debug - Debug personas without auth for testing
  router.get(
    '/debug',
    personaController.getPersonasForDisplay.bind(personaController)
  );

  // Apply authentication middleware to all routes
  router.use(authMiddleware);

  // ===== SIMPLIFIED FRONTEND ROUTES =====
  
  // GET /api/v1/personas/display - Get personas for frontend display
  router.get(
    '/display',
    personaController.getPersonasForDisplay.bind(personaController)
  );

  // GET /api/v1/personas/search/simple - Simple search for frontend
  router.get(
    '/search/simple',
    personaController.searchPersonasSimple.bind(personaController)
  );

  // GET /api/v1/personas/categories - Get persona categories
  router.get(
    '/categories',
    personaController.getPersonaCategories.bind(personaController)
  );

  // ===== EXISTING ROUTES =====

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

  // GET /api/v1/personas/:personaId/display - Get single persona for display
  router.get(
    '/:personaId/display',
    validateUUID('personaId'),
    personaController.getPersonaForDisplay.bind(personaController)
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