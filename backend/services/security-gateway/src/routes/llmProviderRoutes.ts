import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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
interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    role: string;
  };
}

export async function llmProviderRoutes(fastify: FastifyInstance) {
  // Middleware to ensure admin access
  fastify.addHook('preHandler', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    if (request.user.role !== 'admin' && request.user.role !== 'system') {
      reply.code(403).send({ error: 'Admin access required' });
      return;
    }
  });

  // Get all LLM providers
  fastify.get('/providers', {
    schema: {
      description: 'Get all LLM providers',
      tags: ['LLM Providers'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  type: { type: 'string' },
                  baseUrl: { type: 'string' },
                  hasApiKey: { type: 'boolean' },
                  defaultModel: { type: 'string' },
                  modelsList: { type: 'array' },
                  configuration: { type: 'object' },
                  status: { type: 'string' },
                  isActive: { type: 'boolean' },
                  priority: { type: 'number' },
                  stats: { type: 'object' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const providers = await llmProviderManagementService.getAllProviders();
      
      reply.send({
        success: true,
        data: providers
      });
    } catch (error) {
      logger.error('Error getting LLM providers', { error, userId: request.user?.id });
      reply.code(500).send({
        success: false,
        error: 'Failed to get LLM providers'
      });
    }
  });

  // Get active LLM providers
  fastify.get('/providers/active', {
    schema: {
      description: 'Get active LLM providers',
      tags: ['LLM Providers']
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const providers = await llmProviderManagementService.getActiveProviders();
      
      reply.send({
        success: true,
        data: providers
      });
    } catch (error) {
      logger.error('Error getting active LLM providers', { error, userId: request.user?.id });
      reply.code(500).send({
        success: false,
        error: 'Failed to get active LLM providers'
      });
    }
  });

  // Get LLM provider by ID
  fastify.get('/providers/:id', {
    schema: {
      description: 'Get LLM provider by ID',
      tags: ['LLM Providers'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const provider = await llmProviderManagementService.getProviderById(id);
      
      if (!provider) {
        reply.code(404).send({
          success: false,
          error: 'LLM provider not found'
        });
        return;
      }

      reply.send({
        success: true,
        data: provider
      });
    } catch (error) {
      logger.error('Error getting LLM provider by ID', { error, userId: request.user?.id });
      reply.code(500).send({
        success: false,
        error: 'Failed to get LLM provider'
      });
    }
  });

  // Create new LLM provider
  fastify.post('/providers', {
    schema: {
      description: 'Create new LLM provider',
      tags: ['LLM Providers'],
      body: createProviderSchema
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const providerData = request.body as CreateLLMProviderRequest;
      const provider = await llmProviderManagementService.createProvider(
        providerData,
        request.user!.id
      );
      
      reply.code(201).send({
        success: true,
        data: provider
      });
    } catch (error) {
      logger.error('Error creating LLM provider', { 
        error, 
        userId: request.user?.id,
        providerData: request.body 
      });
      
      if (error instanceof Error && error.message.includes('already exists')) {
        reply.code(409).send({
          success: false,
          error: error.message
        });
      } else {
        reply.code(500).send({
          success: false,
          error: 'Failed to create LLM provider'
        });
      }
    }
  });

  // Update LLM provider
  fastify.put('/providers/:id', {
    schema: {
      description: 'Update LLM provider',
      tags: ['LLM Providers'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      },
      body: updateProviderSchema
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const updateData = request.body as UpdateLLMProviderRequest;
      
      const provider = await llmProviderManagementService.updateProvider(
        id,
        updateData,
        request.user!.id
      );
      
      reply.send({
        success: true,
        data: provider
      });
    } catch (error) {
      logger.error('Error updating LLM provider', { 
        error, 
        userId: request.user?.id,
        providerId: (request.params as any)?.id
      });
      
      if (error instanceof Error && error.message.includes('not found')) {
        reply.code(404).send({
          success: false,
          error: error.message
        });
      } else {
        reply.code(500).send({
          success: false,
          error: 'Failed to update LLM provider'
        });
      }
    }
  });

  // Delete LLM provider
  fastify.delete('/providers/:id', {
    schema: {
      description: 'Delete LLM provider',
      tags: ['LLM Providers'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      
      await llmProviderManagementService.deleteProvider(id, request.user!.id);
      
      reply.send({
        success: true,
        message: 'LLM provider deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting LLM provider', { 
        error, 
        userId: request.user?.id,
        providerId: (request.params as any)?.id
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to delete LLM provider'
      });
    }
  });

  // Test LLM provider connection
  fastify.post('/providers/:id/test', {
    schema: {
      description: 'Test LLM provider connection',
      tags: ['LLM Providers'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      
      const result = await llmProviderManagementService.testProviderConnection(id);
      
      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error testing LLM provider connection', { 
        error, 
        userId: request.user?.id,
        providerId: (request.params as any)?.id
      });
      
      reply.code(500).send({
        success: false,
        error: 'Failed to test LLM provider connection'
      });
    }
  });

  // Get LLM provider statistics
  fastify.get('/providers/statistics', {
    schema: {
      description: 'Get LLM provider statistics',
      tags: ['LLM Providers']
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const stats = await llmProviderManagementService.getProviderStatistics();
      
      reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting LLM provider statistics', { error, userId: request.user?.id });
      reply.code(500).send({
        success: false,
        error: 'Failed to get LLM provider statistics'
      });
    }
  });
} 