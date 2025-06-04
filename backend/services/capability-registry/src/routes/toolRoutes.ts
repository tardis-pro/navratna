// Tool Routes - Express Router Configuration
// Defines all REST API routes for the tools system
// Part of capability-registry microservice

import { Router } from 'express';
import { ToolController } from '../controllers/toolController.js';
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

export function createToolRoutes(toolController: ToolController): Router {
  const router = Router();

  // Apply general rate limiting to all routes
  router.use(generalRateLimit);

  // Tool Management Routes
  router.get('/tools', toolController.getTools.bind(toolController));
  router.get('/tools/categories', toolController.getToolCategories.bind(toolController));
  router.get('/tools/recommendations', toolController.getRecommendations.bind(toolController));
  router.get('/tools/:id', toolController.getTool.bind(toolController));
  router.get('/tools/:id/related', toolController.getRelatedTools.bind(toolController));
  router.get('/tools/:id/similar', toolController.getSimilarTools.bind(toolController));
  router.get('/tools/:id/dependencies', toolController.getToolDependencies.bind(toolController));

  // Tool Registration Routes (with stricter rate limiting)
  router.post('/tools', registrationRateLimit, authMiddleware, toolController.registerTool.bind(toolController));
  router.put('/tools/:id', authMiddleware, toolController.updateTool.bind(toolController));
  router.delete('/tools/:id', authMiddleware, toolController.unregisterTool.bind(toolController));
  router.post('/tools/validate', toolController.validateTool.bind(toolController));

  // Tool Relationship Routes
  router.post('/tools/:id/relationships', authMiddleware, toolController.addRelationship.bind(toolController));

  // Tool Execution Routes (with execution rate limiting)
  router.post('/tools/:id/execute', executionRateLimit, authMiddleware, toolController.executeTool.bind(toolController));

  // Execution Management Routes
  router.get('/executions', toolController.getExecutions.bind(toolController));
  router.get('/executions/:id', toolController.getExecution.bind(toolController));
  router.post('/executions/:id/approve', authMiddleware, toolController.approveExecution.bind(toolController));
  router.post('/executions/:id/cancel', authMiddleware, toolController.cancelExecution.bind(toolController));

  // Analytics Routes
  router.get('/analytics/usage', toolController.getUsageAnalytics.bind(toolController));
  router.get('/analytics/popular', toolController.getPopularTools.bind(toolController));
  router.get('/analytics/agent/:agentId/preferences', toolController.getAgentPreferences.bind(toolController));

  // Health Check Route
  router.get('/health', toolController.healthCheck.bind(toolController));

  return router;
} 