import { Router, Request, Response } from 'express';
import { UserLLMService } from '@uaip/llm-service';
import { authMiddleware } from '@uaip/middleware';
import { logger } from '@uaip/utils';

const router: Router = Router();
const userLLMService = new UserLLMService();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Provider Management Routes

// Get user's providers
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const providers = await userLLMService.getUserProviders(userId);

    // Remove sensitive data (API keys) from response
    const sanitizedProviders = providers.map(provider => ({
      id: provider.id,
      name: provider.name,
      description: provider.description,
      type: provider.type,
      baseUrl: provider.baseUrl,
      defaultModel: provider.defaultModel,
      status: provider.status,
      isActive: provider.isActive,
      priority: provider.priority,
      totalTokensUsed: provider.totalTokensUsed,
      totalRequests: provider.totalRequests,
      totalErrors: provider.totalErrors,
      lastUsedAt: provider.lastUsedAt,
      healthCheckResult: provider.healthCheckResult,
      hasApiKey: provider.hasApiKey(),
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt
    }));

    res.json({
      success: true,
      data: sanitizedProviders
    });
  } catch (error) {
    logger.error('Error getting user providers', { 
      userId: req.user?.id,
      error: error instanceof Error ? error.message : error 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get user providers',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create a new provider for user
router.post('/providers', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { name, description, type, baseUrl, apiKey, defaultModel, configuration, priority } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        error: 'Name and type are required'
      });
    }

    const provider = await userLLMService.createUserProvider(userId, {
      name,
      description,
      type,
      baseUrl,
      apiKey,
      defaultModel,
      configuration,
      priority
    });

    // Return sanitized provider data
    res.json({
      success: true,
      data: {
        id: provider.id,
        name: provider.name,
        description: provider.description,
        type: provider.type,
        baseUrl: provider.baseUrl,
        defaultModel: provider.defaultModel,
        status: provider.status,
        isActive: provider.isActive,
        priority: provider.priority,
        hasApiKey: provider.hasApiKey(),
        createdAt: provider.createdAt
      }
    });
  } catch (error) {
    logger.error('Error creating user provider', { 
      userId: req.user?.id,
      error: error instanceof Error ? error.message : error 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create user provider',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update provider API key
router.put('/providers/:providerId/api-key', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { providerId } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }

    await userLLMService.updateUserProviderApiKey(userId, providerId, apiKey);

    res.json({
      success: true,
      message: 'API key updated successfully'
    });
  } catch (error) {
    logger.error('Error updating user provider API key', { 
      userId: req.user?.id,
      providerId: req.params.providerId,
      error: error instanceof Error ? error.message : error 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update API key',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test provider connectivity
router.post('/providers/:providerId/test', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { providerId } = req.params;
    const result = await userLLMService.testUserProvider(userId, providerId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error testing user provider', { 
      userId: req.user?.id,
      providerId: req.params.providerId,
      error: error instanceof Error ? error.message : error 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to test provider',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete provider
router.delete('/providers/:providerId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { providerId } = req.params;
    await userLLMService.deleteUserProvider(userId, providerId);

    res.json({
      success: true,
      message: 'Provider deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting user provider', { 
      userId: req.user?.id,
      providerId: req.params.providerId,
      error: error instanceof Error ? error.message : error 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete provider',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// LLM Generation Routes

// Get available models for user
router.get('/models', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const models = await userLLMService.getAvailableModels(userId);

    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    logger.error('Error getting available models for user', { 
      userId: req.user?.id,
      error: error instanceof Error ? error.message : error 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get available models',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Generate LLM response
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { prompt, systemPrompt, maxTokens, temperature, model, preferredType } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    const response = await userLLMService.generateResponse(userId, {
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
    logger.error('Error generating LLM response for user', { 
      userId: req.user?.id,
      error: error instanceof Error ? error.message : error 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate response',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Generate agent response
router.post('/agent-response', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const { agent, messages, context, tools } = req.body;

    if (!agent || !messages) {
      return res.status(400).json({
        success: false,
        error: 'Agent and messages are required'
      });
    }

    const response = await userLLMService.generateAgentResponse(userId, {
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
    logger.error('Error generating agent response for user', { 
      userId: req.user?.id,
      error: error instanceof Error ? error.message : error 
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate agent response',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 