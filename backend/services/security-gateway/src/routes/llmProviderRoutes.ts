import { Router, Request, Response } from 'express';
import { 
  llmProviderManagementService,
  CreateLLMProviderRequest,
  UpdateLLMProviderRequest 
} from '../services/llmProviderManagementService';
import { logger } from '@uaip/utils';

// Request/Response schemas
const createProviderSchema = {
  type: 'object',
  required: ['name', 'type', 'baseUrl'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', maxLength: 500 },
    type: { 
      type: 'string',
      enum: ['ollama', 'openai', 'llmstudio', 'anthropic', 'custom']
    },
    baseUrl: { type: 'string', format: 'uri' },
    apiKey: { type: 'string' },
    defaultModel: { type: 'string', maxLength: 255 },
    modelsList: { 
      type: 'array',
      items: { type: 'string' }
    },
    configuration: {
      type: 'object',
      properties: {
        timeout: { type: 'number', minimum: 1000 },
        retries: { type: 'number', minimum: 0, maximum: 10 },
        rateLimit: { type: 'number', minimum: 1 },
        headers: { type: 'object' },
        customEndpoints: {
          type: 'object',
          properties: {
            models: { type: 'string' },
            chat: { type: 'string' },
            completions: { type: 'string' }
          }
        }
      }
    },
    priority: { type: 'number', minimum: 0 }
  }
};

const updateProviderSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    description: { type: 'string', maxLength: 500 },
    baseUrl: { type: 'string', format: 'uri' },
    apiKey: { type: 'string' },
    defaultModel: { type: 'string', maxLength: 255 },
    modelsList: { 
      type: 'array',
      items: { type: 'string' }
    },
    configuration: {
      type: 'object',
      properties: {
        timeout: { type: 'number', minimum: 1000 },
        retries: { type: 'number', minimum: 0, maximum: 10 },
        rateLimit: { type: 'number', minimum: 1 },
        headers: { type: 'object' },
        customEndpoints: {
          type: 'object',
          properties: {
            models: { type: 'string' },
            chat: { type: 'string' },
            completions: { type: 'string' }
          }
        }
      }
    },
    priority: { type: 'number', minimum: 0 },
    status: {
      type: 'string',
      enum: ['active', 'inactive', 'error', 'testing']
    }
  }
};

// Route handlers
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    sessionId?: string;
  };
}

const router: Router = Router();

// Middleware to ensure admin access
router.use((req: AuthenticatedRequest, res: Response, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'system') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
});

// Get all LLM providers
router.get('/providers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const providers = await llmProviderManagementService.getAllProviders();
    
    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    logger.error('Error getting LLM providers', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get LLM providers'
    });
  }
});

// Get active LLM providers
router.get('/providers/active', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const providers = await llmProviderManagementService.getActiveProviders();
    
    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    logger.error('Error getting active LLM providers', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get active LLM providers'
    });
  }
});

// Get LLM provider by ID
router.get('/providers/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const provider = await llmProviderManagementService.getProviderById(id);
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        error: 'LLM provider not found'
      });
    }

    res.json({
      success: true,
      data: provider
    });
  } catch (error) {
    logger.error('Error getting LLM provider by ID', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get LLM provider'
    });
  }
});

// Create new LLM provider
router.post('/providers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const providerData = req.body as CreateLLMProviderRequest;
    const provider = await llmProviderManagementService.createProvider(
      providerData,
      req.user!.id
    );
    
    res.status(201).json({
      success: true,
      data: provider
    });
  } catch (error) {
    logger.error('Error creating LLM provider', { 
      error, 
      userId: req.user?.id,
      providerData: req.body 
    });
    
    if (error instanceof Error && error.message.includes('already exists')) {
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
router.put('/providers/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body as UpdateLLMProviderRequest;
    
    const provider = await llmProviderManagementService.updateProvider(
      id,
      updateData,
      req.user!.id
    );
    
    res.json({
      success: true,
      data: provider
    });
  } catch (error) {
    logger.error('Error updating LLM provider', { 
      error, 
      userId: req.user?.id,
      providerId: req.params.id,
      updateData: req.body
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to update LLM provider'
    });
  }
});

// Delete LLM provider
router.delete('/providers/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    await llmProviderManagementService.deleteProvider(id, req.user!.id);
    
    res.json({
      success: true,
      message: 'LLM provider deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting LLM provider', { 
      error, 
      userId: req.user?.id,
      providerId: req.params.id
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete LLM provider'
    });
  }
});

// Test LLM provider connection
router.post('/providers/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await llmProviderManagementService.testProviderConnection(id);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error testing LLM provider connection', { 
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

// Get LLM provider statistics
router.get('/providers/statistics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await llmProviderManagementService.getProviderStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting LLM provider statistics', { error, userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to get LLM provider statistics'
    });
  }
});

export default router; 