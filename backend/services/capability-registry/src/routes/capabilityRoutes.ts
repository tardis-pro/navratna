import { Router } from 'express';
import { CapabilityController } from '../controllers/capabilityController';

const router: Router = Router();
const capabilityController = new CapabilityController();

// Search capabilities
router.get('/search', capabilityController.searchCapabilities);

// Get capability categories
router.get('/categories', capabilityController.getCategories);

// Get capability recommendations
router.get('/recommendations', capabilityController.getRecommendations);

// Register new capability
router.post('/register', capabilityController.registerCapability);

// Get specific capability
router.get('/:id', capabilityController.getCapability);

// Update capability
router.put('/:id', capabilityController.updateCapability);

// Delete capability
router.delete('/:id', capabilityController.deleteCapability);

// Get capability dependencies
router.get('/:id/dependencies', capabilityController.getCapabilityDependencies);

// Validate capability
router.post('/:id/validate', capabilityController.validateCapability);

export { router as capabilityRoutes }; 