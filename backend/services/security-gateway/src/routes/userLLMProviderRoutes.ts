import { Router, Request, Response, NextFunction } from 'express';
import { UserService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { authMiddleware } from '@uaip/middleware';
import { z } from 'zod';
import { UserLLMService, ModelBootstrapService } from '@uaip/llm-service';

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
let userLLMService: UserLLMService | null = null;
let modelBootstrapService: ModelBootstrapService | null = null;

async function getServices() {
  if (!userService) {
    userService = UserService.getInstance();
  }
  if (!userLLMService) {
    userLLMService = new UserLLMService();
  }
  if (!modelBootstrapService) {
    modelBootstrapService = ModelBootstrapService.getInstance();
  }
  return { userService, userLLMService, modelBootstrapService };
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
  const userService = UserService.getInstance();
  const providers = await userService.getUserLLMProviderRepository().findAllProvidersByUser(req.user!.id);
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
    
    const userService = UserService.getInstance();
    const providers = await userService.getUserLLMProviderRepository().findAllProvidersByUser(req.user!.id);
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
    const userService = UserService.getInstance();
    const providers = await userService.getUserLLMProviderRepository().findAllProvidersByUser(req.user!.id);
    
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
    const userService = UserService.getInstance();
    const providers = await userService.getUserLLMProviderRepository().findActiveProvidersByUser(req.user!.id);
    
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
    const { userLLMService, modelBootstrapService } = await getServices();
    const userId = req.user!.id;
    
    logger.info('Fetching models for user', { userId });
    
    // Try to get cached models first (fast path)
    let allModels = await modelBootstrapService.getCachedUserModels(userId);
    
    if (!allModels) {
      // Cache miss - fetch fresh models
      logger.info('Cache miss for user models, fetching fresh', { userId });
      allModels = await userLLMService.getAvailableModels(userId);
      
      // Trigger cache refresh in background (no await)
      modelBootstrapService.refreshUserModels(userId).catch(error => {
        logger.warn('Background model cache refresh failed', { userId, error });
      });
    } else {
      logger.debug('Using cached models for user', { userId, modelCount: allModels.length });
    }
    
    // Transform to legacy format for compatibility
    const transformedModels = allModels.map(model => ({
      id: `${model.provider}-${model.name}`,
      name: model.name,
      description: model.description || `${model.name} from ${model.provider}`,
      source: model.provider,
      apiEndpoint: model.apiEndpoint,
      apiType: model.apiType,
      provider: model.provider,
      providerId: model.providerId || model.provider, // fallback for compatibility
      isAvailable: model.isAvailable,
      isDefault: false // We don't have this info in the new format
    }));
    
    logger.info('Models fetched successfully', {
      userId,
      totalModels: transformedModels.length,
      source: allModels === await modelBootstrapService.getCachedUserModels(userId) ? 'cache' : 'fresh'
    });
    
    res.json({
      success: true,
      data: transformedModels
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
    const userService = UserService.getInstance();
    
    // Create new provider using repository method
    const savedProvider = await userService.getUserLLMProviderRepository().createUserProvider({
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
    const userService = UserService.getInstance();
    
    // Find provider to ensure user ownership
    const provider = await userService.getUserLLMProviderRepository().findById(id);
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
      await userService.getUserLLMProviderRepository().updateProviderConfig(id, req.user!.id, {
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
      await userService.getUserLLMProviderRepository().updateApiKey(id, updateData.apiKey, req.user!.id);
    }
    
    // Update status if provided
    if (updateData.status) {
      await userService.getUserLLMProviderRepository().updateStatus(id, updateData.status, req.user!.id);
    }
    
    // Get updated provider
    const updatedProvider = await userService.getUserLLMProviderRepository().findById(id);
    
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
    const userService = UserService.getInstance();
    
    // Find provider to ensure user ownership
    const provider = await userService.getUserLLMProviderRepository().findById(id);
    if (!provider || provider.userId !== req.user!.id) {
      res.status(404).json({
        success: false,
        error: 'LLM provider not found'
      });
      return;
    }
    
    // Soft delete using repository method
    await userService.getUserLLMProviderRepository().deleteUserProvider(id, req.user!.id);
    
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
    const { userService, userLLMService } = await getServices();
    const userId = req.user!.id;
    
    // Find provider to ensure user ownership
    const provider = await userService.getUserLLMProviderRepository().findById(id);
    if (!provider || provider.userId !== userId) {
      res.status(404).json({
        success: false,
        error: 'LLM provider not found'
      });
      return;
    }
    
    logger.info('Testing user LLM provider connection', {
      userId,
      providerId: id,
      providerName: provider.name,
      providerType: provider.type
    });
    
    // Use UserLLMService for connection testing
    const testResult = await userLLMService.testUserProvider(userId);
    
    logger.info('User LLM provider connection test completed', {
      userId,
      providerId: id,
      result: testResult
    });
    
    res.json({
      success: true,
      data: {
        status: testResult.isHealthy ? 'healthy' : 'unhealthy',
        latency: testResult.responseTime,
        error: testResult.error,
        modelCount: testResult.modelCount,
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
    const userService = UserService.getInstance();
    
    const stats = await userService.getUserLLMProviderRepository().getProviderStats(id, req.user!.id);
    
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