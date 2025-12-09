import { Router } from 'express';
import { MarketplaceController } from '../controllers/marketplaceController.js';
import { MarketplaceService } from '../services/marketplaceService.js';
import { DatabaseService } from '@uaip/shared-services';

const router = Router();

// Initialize service and controller
const databaseService = new DatabaseService();
const marketplaceService = new MarketplaceService(databaseService);
const marketplaceController = new MarketplaceController(marketplaceService);

// Public routes (no auth required)
router.get('/search', marketplaceController.searchItems);
router.get('/trending', marketplaceController.getTrending);
router.get('/featured', marketplaceController.getFeatured);
router.get('/categories', marketplaceController.getCategories);
router.get('/:id', marketplaceController.getItemById);

// Protected routes (auth required)
// Note: These would need auth middleware in production
router.post('/', marketplaceController.createItem);
router.post('/:id/rate', marketplaceController.rateItem);
router.post('/:id/install', marketplaceController.installItem);

export default router;
