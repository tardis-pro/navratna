import { Router, Request, Response } from 'express';
import { LLMService } from '@uaip/llm-service';
import { logger, ValidationError } from '@uaip/utils';

// Temporary asyncHandler implementation until shared package is rebuilt
const asyncHandler = (fn: (req: any, res: any, next?: any) => Promise<void>) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const router: Router = Router();
const llmService = LLMService.getInstance();

// Get available models from all providers
router.get('/models', asyncHandler(async (req: Request, res: Response) => {
  const models = await llmService.getAvailableModels();

  // Set cache headers (1 hour)
  res.set({
    'Cache-Control': 'public, max-age=3600',
    'ETag': `"models-${models.length}-${Date.now()}"`
  });

  res.json({
    success: true,
    data: models
  });
}));

// Get models from a specific provider
router.get('/models/:providerType', asyncHandler(async (req: Request, res: Response) => {
  const { providerType } = req.params;
  const models = await llmService.getModelsFromProvider(providerType);

  // Set cache headers (1 hour)
  res.set({
    'Cache-Control': 'public, max-age=3600',
    'ETag': `"provider-${providerType}-${models.length}-${Date.now()}"`
  });

  res.json({
    success: true,
    data: models
  });
}));

// Generate LLM response
router.post('/generate', asyncHandler(async (req: Request, res: Response) => {
  const { prompt, systemPrompt, maxTokens, temperature, model, preferredType } = req.body;

  if (!prompt) {
    throw new ValidationError('Prompt is required');
  }

  const response = await llmService.generateResponse({
    prompt,
    systemPrompt,
    maxTokens,
    temperature,
    model
  }, preferredType);

  res.json({
    success: true,
    data: response
  });
}));

// Generate agent response
router.post('/agent-response', asyncHandler(async (req: Request, res: Response) => {
  const { agent, messages, context, tools } = req.body;

  if (!agent || !messages) {
    throw new ValidationError('Agent and messages are required');
  }

  const response = await llmService.generateAgentResponse({
    agent,
    messages,
    context,
    tools
  });

  res.json({
    success: true,
    data: response
  });
}));

// Generate artifact
router.post('/artifact', asyncHandler(async (req: Request, res: Response) => {
  const { type, prompt, language, requirements } = req.body;

  if (!type || !prompt) {
    throw new ValidationError('Type and prompt are required');
  }

  const response = await llmService.generateArtifact({
    type,
    context: prompt,
    language,
    requirements,
    constraints: []
  });

  res.json({
    success: true,
    data: response
  });
}));

// Analyze context
router.post('/analyze-context', asyncHandler(async (req: Request, res: Response) => {
  const { conversationHistory, currentContext, userRequest, agentCapabilities } = req.body;

  if (!conversationHistory) {
    throw new ValidationError('Conversation history is required');
  }

  const response = await llmService.analyzeContext({
    conversationHistory,
    currentContext,
    userRequest,
    agentCapabilities
  });

  res.json({
    success: true,
    data: response
  });
}));

// Get provider statistics
router.get('/providers/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = await llmService.getProviderStats();

  res.json({
    success: true,
    data: stats
  });
}));

// Get all configured providers
router.get('/providers', asyncHandler(async (req: Request, res: Response) => {
  const providers = await llmService.getConfiguredProviders();

  // Set cache headers (1 hour)
  res.set({
    'Cache-Control': 'public, max-age=3600',
    'ETag': `"providers-${providers.length}-${Date.now()}"`
  });

  res.json({
    success: true,
    data: providers
  });
}));

// Check provider health
router.get('/providers/health', asyncHandler(async (req: Request, res: Response) => {
  const healthResults = await llmService.checkProviderHealth();

  res.json({
    success: true,
    data: healthResults
  });
}));

// Test event-driven integration
router.post('/test-events', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Testing event-driven LLM integration...');

  // Import the test function dynamically
  const { testLLMEventIntegration } = await import('../test-event-integration.js');
  
  // Run the test
  const result = await testLLMEventIntegration();

  res.json({
    success: true,
    data: result,
    message: result.testSuccess ? 'Event integration test passed' : 'Event integration test failed'
  });
}));

// Cache management endpoints
router.post('/cache/invalidate', asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.body;

  switch (type) {
    case 'models':
      await llmService.invalidateModelsCache();
      break;
    case 'providers':
      await llmService.invalidateProvidersCache();
      break;
    case 'all':
      await llmService.invalidateAllCache();
      break;
    default:
      await llmService.invalidateAllCache();
  }

  res.json({
    success: true,
    message: `Cache invalidated: ${type || 'all'}`
  });
}));

router.post('/cache/refresh', asyncHandler(async (req: Request, res: Response) => {
  await llmService.refreshProviders();

  res.json({
    success: true,
    message: 'Providers refreshed and cache cleared'
  });
}));

export default router; 