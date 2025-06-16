import { Router } from 'express';
import { authMiddleware } from '@uaip/middleware';
import { CapabilityController } from '../controllers/capabilityController.js';

export function createCapabilityRoutes(capabilityController: CapabilityController): Router {
  const router: Router = Router();

  // 🚨 CRITICAL: ALL CAPABILITY ROUTES ARE DISABLED
  // These routes are commented out pending completion of:
  // 1. Tool Database Service TypeORM migration (15+ raw SQL queries)
  // 2. UUID to Auto-Increment migration (128 TypeScript errors)
  // 3. Database schema implementation for capabilities
  // 
  // The Capability Registry Service is currently NON-FUNCTIONAL
  // DO NOT ENABLE these routes until the above issues are resolved

  // Apply auth middleware to all routes
  // router.use(authMiddleware);

  // // Search capabilities
  // router.get('/search', capabilityController.searchCapabilities);

  // // Get capability categories
  // router.get('/categories', capabilityController.getCategories);

  // // Get capability recommendations
  // router.get('/recommendations', capabilityController.getRecommendations);

  // // Register new capability
  // router.post('/register', capabilityController.registerCapability);

  // // Get specific capability
  // router.get('/:id', capabilityController.getCapability);

  // // Update capability
  // router.put('/:id', capabilityController.updateCapability);

  // // Delete capability
  // router.delete('/:id', capabilityController.deleteCapability);

  // // Get capability dependencies
  // router.get('/:id/dependencies', capabilityController.getCapabilityDependencies);

  // // Validate capability
  // router.post('/:id/validate', capabilityController.validateCapability);

  return router;
}

// For backward compatibility, create a default instance
const defaultCapabilityController = new CapabilityController();
export const capabilityRoutes = createCapabilityRoutes(defaultCapabilityController); 