import { Router, Request, Response } from 'express';
import { LLMService, UserLLMService } from '@uaip/llm-service';
import { authMiddleware } from '@uaip/middleware';
import { logger } from '@uaip/utils';

// Interface for authenticated requests
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    permissions?: string[];
    sessionId?: string;
  };
}

const router: Router = Router();
const llmService = LLMService.getInstance();
const userLLMService = new UserLLMService();

// Get available models from all providers
router.get('/models', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    logger.error('Error getting available models', { 
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get available models',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get models from a specific provider
router.get('/models/:providerType', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    logger.error('Error getting models from provider', { error, providerType: req.params.providerType });
    res.status(500).json({
      success: false,
      error: 'Failed to get models from provider'
    });
      return;
  }
});

// Generate LLM response
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, systemPrompt, maxTokens, temperature, model, preferredType } = req.body;

    if (!prompt) {
      res.status(400).json({
        success: false,
        error: 'Prompt is defined in the body'
      });
      return;
      return;
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
  } catch (error) {
    logger.error('Error generating LLM response', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to generate response'
    });
      return;
  }
});

// Generate agent response
router.post('/agent-response', async (req: Request, res: Response) => {
  try {
    const { agent, messages, context, tools } = req.body;

    if (!agent || !messages) {
      res.status(400).json({
        success: false,
        error: 'Agent and messages are required'
      });
      return;
      return;
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
  } catch (error) {
    logger.error('Error generating agent response', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to generate agent response'
    });
      return;
  }
});

// Generate artifact
router.post('/artifact', async (req: Request, res: Response) => {
  try {
    const { type, prompt, language, framework, requirements } = req.body;

    if (!type || !prompt) {
      res.status(400).json({
        success: false,
        error: 'Type and prompt are required'
      });
      return;
      return;
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
  } catch (error) {
    logger.error('Error generating artifact', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to generate artifact'
    });
      return;
  }
});

// Analyze context
router.post('/analyze-context', async (req: Request, res: Response) => {
  try {
    const { conversationHistory, currentContext, userRequest, agentCapabilities } = req.body;

    if (!conversationHistory) {
      res.status(400).json({
        success: false,
        error: 'Messages are required'
      });
      return;
      return;
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
  } catch (error) {
    logger.error('Error analyzing context', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to analyze context'
    });
      return;
  }
});

// Get provider statistics
router.get('/providers/stats', async (req: Request, res: Response) => {
  try {
    const stats = await llmService.getProviderStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting provider stats', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get provider statistics'
    });
      return;
  }
});

// Get all configured providers
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const providers = await llmService.getConfiguredProviders();
    const healthResults = await llmService.checkProviderHealth();

    // Set cache headers (1 hour)
    res.set({
      'Cache-Control': 'public, max-age=3600',
      'ETag': `"providers-${providers.length}-${Date.now()}"`
    });

    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    logger.error('Error getting configured providers', { 
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get configured providers',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
      return;
  }
});

// Check provider health
router.get('/providers/health', async (req: Request, res: Response) => {
  try {
    const healthResults = await llmService.checkProviderHealth();

    res.json({
      success: true,
      data: healthResults
    });
  } catch (error) {
    logger.error('Error checking provider health', { 
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to check provider health',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
      return;
  }
});

// Test event-driven integration
router.post('/test-events', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    logger.error('Error testing event integration', { 
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to test event integration',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
      return;
  }
});

// Cache management endpoints
router.post('/cache/invalidate', async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    logger.error('Error invalidating cache', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate cache'
    });
      return;
  }
});

router.post('/cache/refresh', async (req: Request, res: Response) => {
  try {
    await llmService.refreshProviders();

    res.json({
      success: true,
      message: 'Providers refreshed and cache cleared'
    });
  } catch (error) {
    logger.error('Error refreshing providers', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to refresh providers'
    });
      return;
  }
});

export default router; 