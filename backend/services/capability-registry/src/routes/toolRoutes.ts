// Tool Routes - Express Router Configuration
// Defines all REST API routes for the tools system
// Part of capability-registry microservice

import { Router } from 'express';
import { ToolController } from '../controllers/toolController.js';
import { ToolRegistry } from '../services/toolRegistry.js';
import { ToolExecutor } from '../services/toolExecutor.js';
import { DatabaseService, ToolGraphDatabase, TypeOrmService } from '@uaip/shared-services';
import { authMiddleware, createRateLimiter, rateLimiter } from '@uaip/middleware';

// Rate limiting configurations using shared middleware
const generalRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.'
  }
});

const executionRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 executions per minute
  message: {
    success: false,
    error: 'Execution rate limit exceeded',
    message: 'Too many tool executions. Please try again later.'
  }
});

const registrationRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 registrations per minute
  message: {
    success: false,
    error: 'Registration rate limit exceeded',
    message: 'Too many tool registrations. Please try again later.'
  }
});

// Initialize services and create default controller
const databaseService = DatabaseService.getInstance();
const typeormService = TypeOrmService.getInstance();

// For now, create a mock ToolGraphDatabase and ToolExecutor
// These should be properly configured in a real implementation
const mockToolGraphDatabase = {
  createToolNode: async () => {},
  updateToolNode: async () => {},
  deleteToolNode: async () => {},
  getRelatedTools: async () => [],
  addToolRelationship: async () => {},
  getRecommendations: async () => [],
  getContextualRecommendations: async () => [],
  findSimilarTools: async () => [],
  getToolDependencies: async () => [],
  getToolUsageAnalytics: async () => [],
  getPopularTools: async () => [],
  getAgentToolPreferences: async () => [],
  verifyConnectivity: async () => true
} as any;

const toolRegistry = new ToolRegistry(databaseService, mockToolGraphDatabase, typeormService);

const mockBaseExecutor = {
  execute: async () => ({ success: true, result: null })
} as any;

const mockToolExecutor = new ToolExecutor(
  databaseService,
  mockToolGraphDatabase,
  toolRegistry,
  mockBaseExecutor,
  typeormService
);
const defaultToolController = new ToolController(toolRegistry, mockToolExecutor);

export function createToolRoutes(toolController?: ToolController): Router {
  const router = Router();
  const controller = toolController || defaultToolController;

  // Apply general rate limiting to all routes
  router.use(generalRateLimit);

  // Add debugging middleware to see what paths are being processed
  router.use((req, res, next) => {
    console.log(`Router middleware: ${req.method} ${req.originalUrl} - Path: ${req.path}, BaseUrl: ${req.baseUrl}`);
    next();
  });

  // IMPORTANT: Specific routes must come BEFORE parameterized routes
  // Otherwise Express will match "categories" as an :id parameter
  
  // Tool Management Routes - Specific routes first
  router.get('/', (req, res, next) => {
    console.log(`Route matched: GET / - URL: ${req.url}, Path: ${req.path}, OriginalUrl: ${req.originalUrl}`);
    return controller.getTools(req, res);
  });
  
  // Add a test route to verify routing
  router.get('/test', (req, res) => {
    console.log(`Test route matched: ${req.method} ${req.originalUrl}`);
    res.json({ success: true, message: 'Test route working', path: req.path, originalUrl: req.originalUrl });
  });
  
  router.get('/categories', (req, res) => controller.getToolCategories(req, res));
  router.get('/recommendations', (req, res) => controller.getRecommendations(req, res));
  router.post('/validate', (req, res) => controller.validateTool(req, res));
  
  // Execution Management Routes - Specific routes
  router.get('/executions', controller.getExecutions.bind(controller));
  router.get('/executions/:id', controller.getExecution.bind(controller));
  router.post('/executions/:id/approve', authMiddleware, controller.approveExecution.bind(controller));
  router.post('/executions/:id/cancel', authMiddleware, controller.cancelExecution.bind(controller));

  // Analytics Routes - Specific routes
  router.get('/analytics/usage', controller.getUsageAnalytics.bind(controller));
  router.get('/analytics/popular', controller.getPopularTools.bind(controller));
  router.get('/analytics/agent/:agentId/preferences', controller.getAgentPreferences.bind(controller));

  // Health Check Route - Specific route
  router.get('/health', controller.healthCheck.bind(controller));

  // Tool Registration Routes (with stricter rate limiting) - Specific routes
  router.post('/', registrationRateLimit, authMiddleware, controller.registerTool.bind(controller));

  // PARAMETERIZED ROUTES MUST COME LAST
  // These routes use :id parameter and will match anything
  router.get('/:id', (req, res, next) => {
    console.log(`Route matched: GET /:id - URL: ${req.url}, Path: ${req.path}, ID: ${req.params.id}`);
    return controller.getTool(req, res);
  });
  router.get('/:id/related', controller.getRelatedTools.bind(controller));
  router.get('/:id/similar', controller.getSimilarTools.bind(controller));
  router.get('/:id/dependencies', controller.getToolDependencies.bind(controller));
  router.put('/:id', authMiddleware, controller.updateTool.bind(controller));
  router.delete('/:id', authMiddleware, controller.unregisterTool.bind(controller));
  
  // Tool Relationship Routes - Parameterized routes
  router.post('/:id/relationships', authMiddleware, controller.addRelationship.bind(controller));

  // Tool Execution Routes (with execution rate limiting) - Parameterized routes
  router.post('/:id/execute', executionRateLimit, authMiddleware, controller.executeTool.bind(controller));

  return router;
}

// Export default routes
export const toolRoutes = createToolRoutes();