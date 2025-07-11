import { Router, Request, Response } from 'express';
import { UserLLMService } from '@uaip/llm-service';
import { authMiddleware } from '@uaip/middleware';
import { logger } from '@uaip/utils';
import { ModelCapabilityDetector, DatabaseService } from '@uaip/shared-services';

const router: Router = Router();
let userLLMService: UserLLMService | null = null;

// Lazy initialization of UserLLMService
function getUserLLMService(): UserLLMService {
  if (!userLLMService) {
    userLLMService = new UserLLMService();
  }
  return userLLMService;
}

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Provider Management Routes

// Get user's providers
router.get('/providers', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const providers = await getUserLLMService().getUserProviders(userId);

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
    return;
  }
});

// Create a new provider for user
router.post('/providers', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const { name, description, type, baseUrl, apiKey, defaultModel, configuration, priority } = req.body;

    if (!name || !type) {
      res.status(400).json({
        success: false,
        error: 'Name and type are required'
      });
      return;
    }

    const provider = await getUserLLMService().createUserProvider(userId, {
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
    return;
  }
});

// Update provider configuration
router.put('/providers/:providerId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const { providerId } = req.params;
    const { name, description, baseUrl, defaultModel, priority, configuration } = req.body;

    await getUserLLMService().updateUserProviderConfig(userId, providerId, {
      name,
      description,
      baseUrl,
      defaultModel,
      priority,
      configuration
    });

    res.json({
      success: true,
      message: 'Provider configuration updated successfully'
    });
  } catch (error) {
    logger.error('Error updating user provider configuration', {
      userId: req.user?.id,
      providerId: req.params.providerId,
      error: error instanceof Error ? error.message : error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update provider configuration',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
});

// Update provider API key
router.put('/providers/:providerId/api-key', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const { providerId } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      res.status(400).json({
        success: false,
        error: 'API key is required'
      });
      return;
    }

    await getUserLLMService().updateUserProviderApiKey(userId, providerId, apiKey);

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
    return;
  }
});

// Test provider connectivity
router.post('/providers/:providerId/test', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const result = await getUserLLMService().testUserProvider(userId);

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
    return;
  }
});

// Delete provider
router.delete('/providers/:providerId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const { providerId } = req.params;
    await getUserLLMService().deleteUserProvider(userId, providerId);

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
    return;
  }
});

// Get user's providers by type
router.get('/providers/type/:type', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const { type } = req.params;
    const providers = await getUserLLMService().getUserProvidersByType(userId, type as any);

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
    logger.error('Error getting user providers by type', {
      userId: req.user?.id,
      type: req.params.type,
      error: error instanceof Error ? error.message : error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get user providers by type',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
});

// LLM Generation Routes

// Get available models for user
router.get('/models', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }
    console.log('Getting available models for user', userId);
    const models = await getUserLLMService().getAvailableModels(userId);
    const healthResults = await getUserLLMService().testUserProvider(userId);
    console.log('healthResults', healthResults);
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
    return;
  }
});

// Generate LLM response
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const { prompt, systemPrompt, maxTokens, temperature, model, preferredType } = req.body;

    if (!prompt) {
      res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
      return;
    }

    const response = await getUserLLMService().generateResponse(userId, {
      prompt,
      systemPrompt,
      maxTokens,
      temperature,
      model
    });

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
    return;
  }
});

// Generate agent response
router.post('/agent-response', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const { agent, messages, context, tools } = req.body;

    if (!agent || !messages) {
      res.status(400).json({
        success: false,
        error: 'Agent and messages are required'
      });
      return;
    }

    const response = await getUserLLMService().generateAgentResponse(userId, {
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
    return;
  }
});

// Model Capabilities Routes

// Get model capabilities for user's providers
router.get('/capabilities', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const databaseService = DatabaseService.getInstance();
    const dataSource = await databaseService.getDataSource();
    const userLLMProviderRepo = dataSource.getRepository('UserLLMProvider');
    const userProviders = await userLLMProviderRepo.find({ where: { userId } });
    
    const capabilities = [];
    
    for (const provider of userProviders) {
      const providerCapabilities = {
        providerId: provider.id,
        providerName: provider.name,
        providerType: provider.type,
        defaultModel: provider.defaultModel,
        modelCapabilities: provider.configuration?.modelCapabilities || {},
        detectedCapabilities: provider.configuration?.detectedCapabilities || [],
        lastCapabilityCheck: provider.configuration?.lastCapabilityCheck,
        isActive: provider.isActive,
        status: provider.status
      };
      
      capabilities.push(providerCapabilities);
    }

    res.json({
      success: true,
      data: {
        userId,
        providers: capabilities,
        totalProviders: userProviders.length,
        activeProviders: userProviders.filter(p => p.isActive).length
      }
    });
  } catch (error) {
    logger.error('Error getting model capabilities', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get model capabilities',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
});

// Detect capabilities for a specific provider
router.post('/providers/:providerId/detect-capabilities', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const providerId = req.params.providerId;
    
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const databaseService = DatabaseService.getInstance();
    const dataSource = await databaseService.getDataSource();
    const userLLMProviderRepo = dataSource.getRepository('UserLLMProvider');
    const provider = await userLLMProviderRepo.findOne({ 
      where: { id: providerId, userId } 
    });
    
    if (!provider) {
      res.status(404).json({
        success: false,
        error: 'Provider not found'
      });
      return;
    }

    const detector = ModelCapabilityDetector.getInstance();
    const detection = await detector.detectCapabilities(
      provider.defaultModel,
      provider.type as any,
      provider.baseUrl,
      provider.apiKey
    );
    
    // Update provider configuration with detected capabilities
    provider.configuration = {
      ...provider.configuration,
      detectedCapabilities: detection.detectedCapabilities,
      lastCapabilityCheck: new Date(),
      capabilityTestResults: detection.testResults
    };
    
    await userLLMProviderRepo.save(provider);

    res.json({
      success: true,
      data: {
        providerId: provider.id,
        providerName: provider.name,
        modelId: provider.defaultModel,
        detection
      }
    });
  } catch (error) {
    logger.error('Error detecting capabilities', {
      userId: req.user?.id,
      providerId: req.params.providerId,
      error: error instanceof Error ? error.message : error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to detect capabilities',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
});

// Detect capabilities for all user providers
router.post('/detect-all-capabilities', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
      return;
    }

    const databaseService = DatabaseService.getInstance();
    const dataSource = await databaseService.getDataSource();
    const userLLMProviderRepo = dataSource.getRepository('UserLLMProvider');
    const userProviders = await userLLMProviderRepo.find({ where: { userId } });
    
    const detector = ModelCapabilityDetector.getInstance();
    const results = [];
    
    for (const provider of userProviders) {
      try {
        if (provider.defaultModel) {
          const detection = await detector.detectCapabilities(
            provider.defaultModel,
            provider.type as any,
            provider.baseUrl,
            provider.apiKey
          );
          
          // Update provider configuration with detected capabilities
          provider.configuration = {
            ...provider.configuration,
            detectedCapabilities: detection.detectedCapabilities,
            lastCapabilityCheck: new Date(),
            capabilityTestResults: detection.testResults
          };
          
          await userLLMProviderRepo.save(provider);
          
          results.push({
            providerId: provider.id,
            providerName: provider.name,
            modelId: provider.defaultModel,
            success: true,
            detection
          });
        }
      } catch (error) {
        results.push({
          providerId: provider.id,
          providerName: provider.name,
          modelId: provider.defaultModel,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: {
        userId,
        totalProviders: userProviders.length,
        processedProviders: results.length,
        successfulDetections: results.filter(r => r.success).length,
        failedDetections: results.filter(r => !r.success).length,
        results
      }
    });
  } catch (error) {
    logger.error('Error detecting all capabilities', {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : error
    });
    res.status(500).json({
      success: false,
      error: 'Failed to detect capabilities for all providers',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
});

export default router; 