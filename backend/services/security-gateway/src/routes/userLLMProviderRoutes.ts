import { Router, Request, Response, NextFunction } from 'express';
import { UserService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { authMiddleware } from '@uaip/middleware';
import { z } from 'zod';
import { LLMStudioProvider } from '../../../shared/llm-service/src/providers/LLMStudioProvider.js';
import { OllamaProvider } from '../../../shared/llm-service/src/providers/OllamaProvider.js';
import { OpenAIProvider } from '../../../shared/llm-service/src/providers/OpenAIProvider.js';

// Request/Response schemas with Zod validation
const createUserProviderSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  type: z.enum(['openai', 'anthropic', 'google', 'ollama', 'llmstudio', 'custom']),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  defaultModel: z.string().max(255).optional(),
  configuration: z.object({
    timeout: z.number().min(1000).optional(),
    retries: z.number().min(0).max(10).optional(),
    rateLimit: z.number().min(1).optional(),
    headers: z.record(z.string()).optional(),
    customEndpoints: z.object({
      models: z.string().optional(),
      chat: z.string().optional(),
      completions: z.string().optional()
    }).optional()
  }).optional(),
  priority: z.number().min(0).optional()
});

const updateUserProviderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  defaultModel: z.string().max(255).optional(),
  configuration: z.object({
    timeout: z.number().min(1000).optional(),
    retries: z.number().min(0).max(10).optional(),
    rateLimit: z.number().min(1).optional(),
    headers: z.record(z.string()).optional(),
    customEndpoints: z.object({
      models: z.string().optional(),
      chat: z.string().optional(),
      completions: z.string().optional()
    }).optional()
  }).optional(),
  priority: z.number().min(0).optional(),
  status: z.enum(['active', 'inactive', 'error', 'testing']).optional(),
  isActive: z.boolean().optional()
});

// Route handlers
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    permissions?: string[];
    sessionId?: string;
  };
}

// Role hierarchy for permission checking
const ROLE_HIERARCHY = {
  'guest': 0,
  'user': 1,
  'moderator': 2,
  'admin': 3,
  'system': 4
};

// Role-based provider limits (restrictive permissions)
const PROVIDER_LIMITS = {
  'guest': 0,     // Guests cannot create providers
  'user': 3,      // Regular users limited to 3 providers
  'moderator': 5, // Moderators can have 5 providers
  'admin': 10,    // Admins can have 10 providers
  'system': 50    // System users have higher limits
};

const router: Router = Router();

// Lazy initialization of services
let userService: UserService | null = null;

async function getServices() {
  if (!userService) {
    userService = UserService.getInstance();
  }
  return { userService };
}

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Check if user can create more providers
const canCreateProvider = async (req: AuthenticatedRequest): Promise<{ allowed: boolean; reason?: string }> => {
  const userRole = req.user!.role;
  const limit = PROVIDER_LIMITS[userRole as keyof typeof PROVIDER_LIMITS] || 0;
  
  if (limit === 0) {
    return { allowed: false, reason: 'Your user role does not have permission to create LLM providers' };
  }
  
  // Check current provider count using repository
  const databaseService = DatabaseService.getInstance();
  await databaseService.initialize();
  const providers = await databaseService.userLLMProviderRepository.findAllProvidersByUser(req.user!.id);
  const currentCount = providers.length;
  
  if (currentCount >= limit) {
    return { 
      allowed: false, 
      reason: `You have reached the maximum number of LLM providers (${limit}) for your role (${userRole})` 
    };
  }
  
  return { allowed: true };
};

// Helper function to convert provider entity to safe response format
const toSafeProvider = (provider: any) => ({
  id: provider.id,
  name: provider.name,
  description: provider.description,
  type: provider.type,
  baseUrl: provider.baseUrl,
  defaultModel: provider.defaultModel,
  configuration: provider.configuration,
  status: provider.status,
  isActive: provider.isActive,
  priority: provider.priority,
  hasApiKey: provider.hasApiKey(),
  totalTokensUsed: provider.totalTokensUsed,
  totalRequests: provider.totalRequests,
  totalErrors: provider.totalErrors,
  lastUsedAt: provider.lastUsedAt,
  lastHealthCheckAt: provider.lastHealthCheckAt,
  healthCheckResult: provider.healthCheckResult,
  createdAt: provider.createdAt,
  updatedAt: provider.updatedAt
});

// Get user's provider limits and current usage
router.get('/my-providers/limits', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    const limit = PROVIDER_LIMITS[userRole as keyof typeof PROVIDER_LIMITS] || 0;
    
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();
    const providers = await databaseService.userLLMProviderRepository.findAllProvidersByUser(req.user!.id);
    const currentCount = providers.length;
    
    res.json({
      success: true,
      data: {
        role: userRole,
        limit: limit,
        current: currentCount,
        remaining: Math.max(0, limit - currentCount),
        canCreateMore: currentCount < limit && limit > 0,
        restrictions: {
          maxProviders: limit,
          roleRequired: userRole,
          message: limit === 0 
            ? `Users with role '${userRole}' cannot create LLM providers`
            : `Users with role '${userRole}' can create up to ${limit} LLM providers`
        }
      }
    });
  } catch (error) {
    logger.error('Error getting provider limits', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get provider limits'
    });
  }
});

// Get user's LLM providers
router.get('/my-providers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();
    const providers = await databaseService.userLLMProviderRepository.findAllProvidersByUser(req.user!.id);
    
    const safeProviders = providers.map(toSafeProvider);
    
    res.json({
      success: true,
      data: safeProviders
    });
  } catch (error) {
    logger.error('Error getting user LLM providers', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get LLM providers'
    });
  }
});

// Get active LLM providers for current user
router.get('/my-providers/active', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();
    const providers = await databaseService.userLLMProviderRepository.findActiveProvidersByUser(req.user!.id);
    
    // Filter to only active providers (allow testing and active status)
    const activeProviders = providers.filter(p => p.isActive && (p.status === 'active' || p.status === 'testing'));
    
    const safeProviders = activeProviders.map(provider => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      defaultModel: provider.defaultModel,
          priority: provider.priority,
      hasApiKey: provider.hasApiKey()
    }));
    
    res.json({
      success: true,
      data: safeProviders
    });
  } catch (error) {
    logger.error('Error getting active user LLM providers', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get active LLM providers'
    });
  }
});

// Get all available models from user's providers
router.get('/my-providers/models', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userService } = await getServices();
    
    // Get user's active providers
    const providers = await userService.getUserLLMProviderRepository().findActiveProvidersByUser(req.user!.id);
    const activeProviders = providers.filter(p => p.isActive && (p.status === 'active' || p.status === 'testing'));
    
    logger.info('Fetching models from active providers', {
      userId: req.user!.id,
      providerCount: activeProviders.length,
      providers: activeProviders.map(p => `${p.name}(${p.type})`)
    });
    
    const allModels = [];
    
    // Fetch models from each active provider
    for (const provider of activeProviders) {
      try {
        let providerInstance;
        
        // Create provider instance based on type
        switch (provider.type) {
          case 'llmstudio':
            providerInstance = new LLMStudioProvider({
              type: provider.type,
              baseUrl: provider.baseUrl,
              defaultModel: provider.defaultModel || undefined,
              timeout: provider.configuration?.timeout || 30000,
              retries: provider.configuration?.retries || 3
            }, provider.name);
            break;
            
          case 'ollama':
            providerInstance = new OllamaProvider({
              type: provider.type,
              baseUrl: provider.baseUrl,
              defaultModel: provider.defaultModel || undefined,
              timeout: provider.configuration?.timeout || 30000,
              retries: provider.configuration?.retries || 3
            }, provider.name);
            break;
            
          case 'openai':
            providerInstance = new OpenAIProvider({
              type: provider.type,
              baseUrl: provider.baseUrl,
              apiKey: provider.getApiKey() || '',
              defaultModel: provider.defaultModel || undefined,
              timeout: provider.configuration?.timeout || 30000,
              retries: provider.configuration?.retries || 3
            }, provider.name);
            break;
            
          default:
            logger.warn(`Unsupported provider type: ${provider.type}`, { providerId: provider.id });
            continue;
        }
        
        // Fetch models from provider
        const models = await providerInstance.getAvailableModels();
        
        // Add models to response
        for (const model of models) {
          allModels.push({
            id: `${provider.id}-${model.name}`,
            name: model.name,
            description: model.description || `${model.name} from ${provider.name}`,
            source: provider.name,
            apiEndpoint: model.apiEndpoint || provider.baseUrl,
            apiType: provider.type,
            provider: provider.name,
            providerId: provider.id,
            isAvailable: true,
            isDefault: provider.defaultModel === model.name
          });
        }
        
        logger.info(`Fetched ${models.length} models from ${provider.name}`, {
          providerId: provider.id,
          models: models.map(m => m.name)
        });
        
      } catch (error) {
        logger.error(`Failed to fetch models from provider ${provider.name}`, {
          providerId: provider.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue with other providers
      }
    }
    
    logger.info('Models fetched successfully', {
      userId: req.user!.id,
      totalModels: allModels.length,
      providersProcessed: activeProviders.length
    });
    
    res.json({
      success: true,
      data: allModels
    });
  } catch (error) {
    logger.error('Error getting user LLM models', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get LLM models'
    });
  }
});

// Get LLM provider by ID
router.get('/my-providers/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { userService } = await getServices();
    
    const provider = await userService.getUserLLMProviderRepository().findById(id);
    
    if (provider && provider.userId !== req.user!.id) {
      res.status(404).json({
        success: false,
        error: 'LLM provider not found'
      });
      return;
    }
    
    if (!provider) {
      res.status(404).json({
        success: false,
        error: 'LLM provider not found'
      });
      return;
    }

    res.json({
      success: true,
      data: toSafeProvider(provider)
    });
  } catch (error) {
    logger.error('Error getting user LLM provider by ID', { error, userId: req.user?.id, providerId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get LLM provider'
    });
  }
});


// Create new LLM provider for user  
router.post('/my-providers', async (req: AuthenticatedRequest, res: Response) => {
  // Validate request body
  const validation = createUserProviderSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: validation.error.issues
    });
    return;
  }

  try {
    // Check if user can create more providers (restrictive permissions)
    const permissionCheck = await canCreateProvider(req);
    if (!permissionCheck.allowed) {
      res.status(403).json({
        success: false,
        error: 'Permission denied',
        message: permissionCheck.reason
      });
      return;
    }
    
    const providerData = validation.data;
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();
    
    // Create new provider using repository method
    const savedProvider = await databaseService.userLLMProviderRepository.createUserProvider({
      userId: req.user!.id,
      name: providerData.name,
      description: providerData.description,
      type: providerData.type,
      baseUrl: providerData.baseUrl,
      apiKey: providerData.apiKey,
      defaultModel: providerData.defaultModel,
      configuration: providerData.configuration,
      priority: providerData.priority || 100
    });
    
    logger.info('User LLM provider created successfully', {
      userId: req.user!.id,
      providerId: savedProvider.id,
      providerType: savedProvider.type
    });
    
    res.status(201).json({
      success: true,
      data: toSafeProvider(savedProvider)
    });
  } catch (error) {
    logger.error('Error creating user LLM provider', { 
      error, 
      userId: req.user?.id,
      providerData: { ...req.body, apiKey: '[REDACTED]' }
    });
    
    if (error instanceof Error && error.message.includes('already in use')) {
      res.status(409).json({
        success: false,
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to create LLM provider'
      });
    }
  }
});

// Update LLM provider
router.put('/my-providers/:id', async (req: AuthenticatedRequest, res: Response) => {
  // Validate request body
  const validation = updateUserProviderSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: validation.error.issues
    });
    return;
  }

  try {
    const { id } = req.params;
    const updateData = validation.data;
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();
    
    // Find provider to ensure user ownership
    const provider = await databaseService.userLLMProviderRepository.findById(id);
    if (!provider || provider.userId !== req.user!.id) {
      res.status(404).json({
        success: false,
        error: 'LLM provider not found'
      });
      return;
    }
    
    // Update configuration
    if (updateData.name || updateData.description || updateData.baseUrl || 
        updateData.defaultModel || updateData.priority || updateData.configuration) {
      await databaseService.userLLMProviderRepository.updateProviderConfig(id, req.user!.id, {
        name: updateData.name,
        description: updateData.description,
        baseUrl: updateData.baseUrl,
        defaultModel: updateData.defaultModel,
        priority: updateData.priority,
        configuration: updateData.configuration
      });
    }
    
    // Update API key if provided
    if (updateData.apiKey) {
      await databaseService.userLLMProviderRepository.updateApiKey(id, updateData.apiKey, req.user!.id);
    }
    
    // Update status if provided
    if (updateData.status) {
      await databaseService.userLLMProviderRepository.updateStatus(id, updateData.status, req.user!.id);
    }
    
    // Get updated provider
    const updatedProvider = await databaseService.userLLMProviderRepository.findById(id);
    
    logger.info('User LLM provider updated successfully', {
      userId: req.user!.id,
      providerId: id
    });
    
    res.json({
      success: true,
      data: toSafeProvider(updatedProvider!)
    });
  } catch (error) {
    logger.error('Error updating user LLM provider', { 
      error, 
      userId: req.user?.id,
      providerId: req.params.id,
      updateData: { ...req.body, apiKey: req.body.apiKey ? '[REDACTED]' : undefined }
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to update LLM provider'
    });
  }
});

// Delete LLM provider (soft delete)
router.delete('/my-providers/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();
    
    // Find provider to ensure user ownership
    const provider = await databaseService.userLLMProviderRepository.findById(id);
    if (!provider || provider.userId !== req.user!.id) {
      res.status(404).json({
        success: false,
        error: 'LLM provider not found'
      });
      return;
    }
    
    // Soft delete using repository method
    await databaseService.userLLMProviderRepository.deleteUserProvider(id, req.user!.id);
    
    logger.info('User LLM provider deleted successfully', {
      userId: req.user!.id,
      providerId: id,
      providerName: provider.name
    });
    
    res.json({
      success: true,
      message: 'LLM provider deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting user LLM provider', { 
      error, 
      userId: req.user?.id,
      providerId: req.params.id
    });
    
    // Check if this is a validation error (agents using provider)
    if (error instanceof Error && error.message.includes('Cannot delete provider')) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: 'PROVIDER_IN_USE'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete LLM provider'
      });
    }
  }
});

// Test LLM provider connection
router.post('/my-providers/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();
    
    // Find provider to ensure user ownership
    const provider = await databaseService.userLLMProviderRepository.findById(id);
    if (!provider || provider.userId !== req.user!.id) {
      res.status(404).json({
        success: false,
        error: 'LLM provider not found'
      });
      return;
    }
    
    // Test connection based on provider type
    const startTime = Date.now();
    let testResult: { status: 'healthy' | 'unhealthy'; error?: string; latency?: number };
    
    try {
      const config = provider.getProviderConfig();
      
      // Simple test based on provider type
      switch (provider.type) {
        case 'openai':
          // Test OpenAI API
          const response = await fetch(`${config.baseUrl}/v1/models`, {
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(10000)
          });
          
          if (response.ok) {
            testResult = { 
              status: 'healthy', 
              latency: Date.now() - startTime 
            };
          } else {
            testResult = { 
              status: 'unhealthy', 
              error: `HTTP ${response.status}: ${response.statusText}` 
            };
          }
          break;
          
        case 'anthropic':
          // Test Anthropic API
          const anthropicResponse = await fetch(`${config.baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'x-api-key': config.apiKey!,
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: config.defaultModel || 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }]
            }),
            signal: AbortSignal.timeout(10000)
          });
          
          if (anthropicResponse.ok || anthropicResponse.status === 400) {
            // 400 is OK for this test (means API is reachable)
            testResult = { 
              status: 'healthy', 
              latency: Date.now() - startTime 
            };
          } else {
            testResult = { 
              status: 'unhealthy', 
              error: `HTTP ${anthropicResponse.status}: ${anthropicResponse.statusText}` 
            };
          }
          break;
          
        case 'ollama':
        case 'llmstudio':
          // Test local providers
          const localResponse = await fetch(`${config.baseUrl}/api/tags`, {
            signal: AbortSignal.timeout(5000)
          });
          
          if (localResponse.ok) {
            testResult = { 
              status: 'healthy', 
              latency: Date.now() - startTime 
            };
          } else {
            testResult = { 
              status: 'unhealthy', 
              error: `HTTP ${localResponse.status}: ${localResponse.statusText}` 
            };
          }
          break;
          
        default:
          testResult = { 
            status: 'unhealthy', 
            error: 'Unsupported provider type for testing' 
          };
      }
    } catch (error) {
      testResult = { 
        status: 'unhealthy', 
        error: error instanceof Error ? error.message : 'Connection failed' 
      };
    }
    
    // Update provider health check using repository method
    await databaseService.userLLMProviderRepository.updateHealthCheck(id, testResult);
    
    logger.info('User LLM provider connection test completed', {
      userId: req.user!.id,
      providerId: id,
      result: testResult
    });
    
    res.json({
      success: true,
      data: {
        ...testResult,
        testedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error testing user LLM provider connection', { 
      error, 
      userId: req.user?.id,
      providerId: req.params.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to test LLM provider connection'
    });
  }
});

// Get provider usage statistics
router.get('/my-providers/:id/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const databaseService = DatabaseService.getInstance();
    await databaseService.initialize();
    
    const stats = await databaseService.userLLMProviderRepository.getProviderStats(id, req.user!.id);
    
    if (!stats) {
      res.status(404).json({
        success: false,
        error: 'LLM provider not found'
      });
      return;
    }
    
    res.json({
      success: true,
      data: {
        ...stats,
        errorRate: `${stats.errorRate.toFixed(2)}%`
      }
    });
  } catch (error) {
    logger.error('Error getting user LLM provider statistics', { 
      error, 
      userId: req.user?.id,
      providerId: req.params.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get provider statistics'
    });
  }
});

export default router;