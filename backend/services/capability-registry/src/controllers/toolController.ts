// Tool Controller - REST API for Tools System
// Provides comprehensive REST endpoints for tool management and execution
// Part of capability-registry microservice

import { Request, Response } from 'express';
import { ToolRegistry } from '../services/toolRegistry.js';
import { ToolExecutor } from '../services/toolExecutor.js';
import { ToolDefinition } from '@uaip/types';
import { logger } from '@uaip/utils';
import { z } from 'zod';

// Request validation schemas
const RegisterToolSchema = z.object({
  id: z.coerce.number().int().positive('ID must be a positive integer').optional(),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().min(1),
  category: z.string().min(1),
  parameters: z.object({}).passthrough(),
  returnType: z.object({}).passthrough().optional(),
  securityLevel: z.enum(['safe', 'moderate', 'restricted', 'dangerous']),
  requiresApproval: z.boolean(),
  isEnabled: z.boolean().optional().default(true),
  executionTimeEstimate: z.number().positive().optional(),
  costEstimate: z.number().min(0).optional(),
  author: z.string(),
  tags: z.array(z.string()),
  dependencies: z.array(z.string()).optional().default([]),
  examples: z.array(z.object({}).passthrough()).optional().default([])
});

const ExecuteToolSchema = z.object({
  agentId: z.coerce.number().int().positive('Agent ID must be a positive integer'),
  parameters: z.record(z.any()),
  timeout: z.number().positive().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  retryOnFailure: z.boolean().optional()
});

const AddRelationshipSchema = z.object({
  toToolId: z.coerce.number().int().positive('Tool ID must be a positive integer'),
  type: z.enum(['DEPENDS_ON', 'SIMILAR_TO', 'REPLACES', 'ENHANCES', 'REQUIRES']),
  strength: z.number().min(0).max(1),
  reason: z.string().optional(),
  metadata: z.object({}).passthrough().optional()
});

export class ToolController {
  constructor(
    private toolRegistry: ToolRegistry,
    private toolExecutor: ToolExecutor
  ) {}

  // Tool Management Endpoints

  // GET /api/v1/tools
  async getTools(req: Request, res: Response): Promise<void> {
    try {
      logger.info(`getTools method called - URL: ${req.url}, Method: ${req.method}, Path: ${req.path}`);
      const { category, search, enabled, tags, securityLevel } = req.query;
      logger.info(`Getting tools with category: ${category}, search: ${search}, enabled: ${enabled}, tags: ${tags}, securityLevel: ${securityLevel}`);
      let tools;
      
      if (search) {
        logger.info(`Searching for tools with search: ${search}`);
        tools = await this.toolRegistry.searchTools(search as string);
      } else if (tags) {
        const tagArray = Array.isArray(tags) ? tags as string[] : [tags as string];
        logger.info(`Searching for tools with tags: ${tagArray}`);
        tools = await this.toolRegistry.getToolsByTags(tagArray);
      } else if (securityLevel) {
        logger.info(`Searching for tools with security level: ${securityLevel}`);
        tools = await this.toolRegistry.getToolsBySecurityLevel(securityLevel as string);
      } else {
        const enabledFilter = enabled !== undefined ? enabled === 'true' : undefined;
        logger.info(`Searching for tools with category: ${category} and enabled: ${enabledFilter}`);
        tools = await this.toolRegistry.getTools(category as string, enabledFilter);
      }
      
      res.json({
        success: true,
        data: {
          tools,
          count: tools.length
        }
      });
    } catch (error) {
      logger.error('Failed to get tools:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tools',
        message: error.message
      });
    }
  }

  // GET /api/v1/tools/:id
  async getTool(req: Request, res: Response): Promise<void> {
    try {
      logger.info(`getTool method called - URL: ${req.url}, Method: ${req.method}, Path: ${req.path}, Params: ${JSON.stringify(req.params)}`);
      const { id } = req.params;
      
      // Temporarily log the ID to debug routing issue
      logger.error(`getTool called with ID: "${id}" - this should not happen for GET /api/v1/tools`);
      
      // Validate ID format
      const idSchema = z.coerce.number().int().positive();
      const validationResult = idSchema.safeParse(id);
      
      if (!validationResult.success) {
        logger.error(`Invalid ID format for tool ID: ${id}`);
        res.status(400).json({
          success: false,
          error: 'Invalid tool ID format',
          message: `Tool ID must be a positive integer. Received: "${id}"`
        });
        return;
      }
      
      const tool = await this.toolRegistry.getTool(validationResult.data);
      
      if (!tool) {
        res.status(404).json({
          success: false,
          error: 'Tool not found',
          message: `Tool with ID ${validationResult.data} does not exist`
        });
        return;
      }
      
      res.json({
        success: true,
        data: { tool }
      });
    } catch (error) {
      logger.error(`Failed to get tool ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tool',
        message: error.message
      });
    }
  }

  // POST /api/v1/tools
  async registerTool(req: Request, res: Response): Promise<void> {
    try {
      const validatedTool = RegisterToolSchema.parse(req.body);
      await this.toolRegistry.registerTool(validatedTool as ToolDefinition);
      
      res.status(201).json({
        success: true,
        message: 'Tool registered successfully',
        data: { toolId: validatedTool.id }
      });
    } catch (error) {
      logger.error('Failed to register tool:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
        return;
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to register tool',
        message: error.message
      });
    }
  }

  // PUT /api/v1/tools/:id
  async updateTool(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Validate ID format
      const idSchema = z.coerce.number().int().positive();
      const validationResult = idSchema.safeParse(id);
      
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid tool ID format',
          message: 'Tool ID must be a positive integer'
        });
        return;
      }
      
      const updates = RegisterToolSchema.partial().parse(req.body);
      
      await this.toolRegistry.updateTool(validationResult.data, updates);
      
      res.json({
        success: true,
        message: 'Tool updated successfully',
        data: { toolId: validationResult.data }
      });
    } catch (error) {
      logger.error(`Failed to update tool ${req.params.id}:`, error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
        return;
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to update tool',
        message: error.message
      });
    }
  }

  // DELETE /api/v1/tools/:id
  async unregisterTool(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Validate ID format
      const idSchema = z.coerce.number().int().positive();
      const validationResult = idSchema.safeParse(id);
      
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid tool ID format',
          message: 'Tool ID must be a positive integer'
        });
        return;
      }
      
      await this.toolRegistry.unregisterTool(validationResult.data);
      
      res.json({
        success: true,
        message: 'Tool unregistered successfully',
        data: { toolId: validationResult.data }
      });
    } catch (error) {
      logger.error(`Failed to unregister tool ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to unregister tool',
        message: error.message
      });
    }
  }

  // Tool Execution Endpoints

  // POST /api/v1/tools/:id/execute
  async executeTool(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Validate ID format
      const idSchema = z.coerce.number().int().positive();
      const validationResult = idSchema.safeParse(id);
      
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid tool ID format',
          message: 'Tool ID must be a positive integer'
        });
        return;
      }
      
      const validatedRequest = ExecuteToolSchema.parse(req.body);
      
      const execution = await this.toolExecutor.executeTool(
        validationResult.data,
        validatedRequest.agentId,
        validatedRequest.parameters,
        {
          timeout: validatedRequest.timeout,
          priority: validatedRequest.priority,
          retryOnFailure: validatedRequest.retryOnFailure
        }
      );
      
      res.json({
        success: true,
        data: { execution }
      });
    } catch (error) {
      logger.error(`Failed to execute tool ${req.params.id}:`, error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
        return;
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to execute tool',
        message: error.message
      });
    }
  }

  // GET /api/v1/executions/:id
  async getExecution(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const execution = await this.toolExecutor.getExecution(id);
      
      if (!execution) {
        res.status(404).json({
          success: false,
          error: 'Execution not found',
          message: `Execution with ID ${id} does not exist`
        });
        return;
      }
      
      res.json({
        success: true,
        data: { execution }
      });
    } catch (error) {
      logger.error(`Failed to get execution ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve execution',
        message: error.message
      });
    }
  }

  // GET /api/v1/executions
  async getExecutions(req: Request, res: Response): Promise<void> {
    try {
      const { toolId, agentId, status, limit } = req.query;
      
      const executions = await this.toolExecutor.getExecutions(
        toolId as string,
        agentId as string,
        status as string,
        limit ? parseInt(limit as string) : undefined
      );
      
      res.json({
        success: true,
        data: {
          executions,
          count: executions.length
        }
      });
    } catch (error) {
      logger.error('Failed to get executions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve executions',
        message: error.message
      });
    }
  }

  // POST /api/v1/executions/:id/approve
  async approveExecution(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { approvedBy } = req.body;
      
      if (!approvedBy) {
        res.status(400).json({
          success: false,
          error: 'Missing approvedBy field'
        });
        return;
      }
      
      const execution = await this.toolExecutor.approveExecution(id, approvedBy);
      
      res.json({
        success: true,
        message: 'Execution approved successfully',
        data: { execution }
      });
    } catch (error) {
      logger.error(`Failed to approve execution ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to approve execution',
        message: error.message
      });
    }
  }

  // POST /api/v1/executions/:id/cancel
  async cancelExecution(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const cancelled = await this.toolExecutor.cancelExecution(id);
      
      if (!cancelled) {
        res.status(400).json({
          success: false,
          error: 'Cannot cancel execution',
          message: 'Execution may not exist or is already completed'
        });
        return;
      }
      
      res.json({
        success: true,
        message: 'Execution cancelled successfully',
        data: { executionId: id }
      });
    } catch (error) {
      logger.error(`Failed to cancel execution ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel execution',
        message: error.message
      });
    }
  }

  // Graph-Enhanced Features

  // GET /api/v1/tools/:id/related
  async getRelatedTools(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // Validate ID format
      const idSchema = z.coerce.number().int().positive();
      const validationResult = idSchema.safeParse(id);
      
      if (!validationResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid tool ID format',
          message: 'Tool ID must be a positive integer'
        });
        return;
      }
      
      const { types, minStrength } = req.query;
      
      const relationshipTypes = types ? (types as string).split(',') : undefined;
      const minStrengthValue = minStrength ? parseFloat(minStrength as string) : 0.5;
      
      const relatedTools = await this.toolRegistry.getRelatedTools(
        validationResult.data,
        relationshipTypes,
        minStrengthValue
      );
      
      res.json({
        success: true,
        data: {
          relatedTools,
          count: relatedTools.length
        }
      });
    } catch (error) {
      logger.error(`Failed to get related tools for ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve related tools',
        message: error.message
      });
    }
  }

  // POST /api/v1/tools/:id/relationships
  async addRelationship(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const validatedRelationship = AddRelationshipSchema.parse(req.body);
      
      await this.toolRegistry.addToolRelationship(
        id,
        validatedRelationship.toToolId,
        {
          type: validatedRelationship.type,
          strength: validatedRelationship.strength,
          reason: validatedRelationship.reason,
          metadata: validatedRelationship.metadata
        }
      );
      
      res.status(201).json({
        success: true,
        message: 'Relationship added successfully',
        data: {
          fromToolId: id,
          toToolId: validatedRelationship.toToolId,
          type: validatedRelationship.type
        }
      });
    } catch (error) {
      logger.error(`Failed to add relationship for tool ${req.params.id}:`, error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
        return;
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to add relationship',
        message: error.message
      });
    }
  }

  // GET /api/v1/tools/recommendations
  async getRecommendations(req: Request, res: Response): Promise<void> {
    try {
      const { agentId, context, limit } = req.query;
      
      if (!agentId) {
        res.status(400).json({
          success: false,
          error: 'Missing agentId parameter'
        });
        return;
      }
      
      const recommendations = await this.toolRegistry.getRecommendations(
        agentId as string,
        context as string,
        limit ? parseInt(limit as string) : 5
      );
      
      res.json({
        success: true,
        data: {
          recommendations,
          count: recommendations.length
        }
      });
    } catch (error) {
      logger.error('Failed to get recommendations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve recommendations',
        message: error.message
      });
    }
  }

  // GET /api/v1/tools/:id/similar
  async getSimilarTools(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { minSimilarity, limit } = req.query;
      
      const similarTools = await this.toolRegistry.findSimilarTools(
        id,
        minSimilarity ? parseFloat(minSimilarity as string) : 0.6,
        limit ? parseInt(limit as string) : 5
      );
      
      res.json({
        success: true,
        data: {
          similarTools,
          count: similarTools.length
        }
      });
    } catch (error) {
      logger.error(`Failed to get similar tools for ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve similar tools',
        message: error.message
      });
    }
  }

  // GET /api/v1/tools/:id/dependencies
  async getToolDependencies(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dependencies = await this.toolRegistry.getToolDependencies(id);
      
      res.json({
        success: true,
        data: {
          dependencies,
          count: dependencies.length
        }
      });
    } catch (error) {
      logger.error(`Failed to get dependencies for tool ${req.params.id}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tool dependencies',
        message: error.message
      });
    }
  }

  // Analytics and Insights Endpoints

  // GET /api/v1/analytics/usage
  async getUsageAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { toolId, agentId, days } = req.query;
      
      const stats = await this.toolRegistry.getUsageStats(
        toolId as string,
        agentId as string,
        days ? parseInt(days as string) : 30
      );
      
      res.json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      logger.error('Failed to get usage analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve usage analytics',
        message: error.message
      });
    }
  }

  // GET /api/v1/analytics/popular
  async getPopularTools(req: Request, res: Response): Promise<void> {
    try {
      const { category, limit } = req.query;
      
      const popularTools = await this.toolRegistry.getPopularTools(
        category as string,
        limit ? parseInt(limit as string) : 10
      );
      
      res.json({
        success: true,
        data: {
          popularTools,
          count: popularTools.length
        }
      });
    } catch (error) {
      logger.error('Failed to get popular tools:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve popular tools',
        message: error.message
      });
    }
  }

  // GET /api/v1/analytics/agent/:agentId/preferences
  async getAgentPreferences(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const preferences = await this.toolRegistry.getAgentToolPreferences(agentId);
      
      res.json({
        success: true,
        data: {
          preferences,
          count: preferences.length
        }
      });
    } catch (error) {
      logger.error(`Failed to get preferences for agent ${req.params.agentId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve agent preferences',
        message: error.message
      });
    }
  }

  // Utility Endpoints

  // GET /api/v1/tools/categories
  async getToolCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await this.toolRegistry.getToolCategories();
      
      res.json({
        success: true,
        data: {
          categories,
          count: categories.length
        }
      });
    } catch (error) {
      logger.error('Failed to get tool categories:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tool categories',
        message: error.message
      });
    }
  }

  // POST /api/v1/tools/validate
  async validateTool(req: Request, res: Response): Promise<void> {
    try {
      const validation = await this.toolRegistry.validateToolDefinition(req.body);
      
      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      logger.error('Failed to validate tool:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate tool',
        message: error.message
      });
    }
  }

  // GET /api/v1/health
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const registryHealth = await this.toolRegistry.healthCheck();
      const executorHealth = await this.toolExecutor.healthCheck();
      
      const overallHealth = registryHealth.postgresql && registryHealth.neo4j && 
                           executorHealth.status === 'healthy';
      
      res.status(overallHealth ? 200 : 503).json({
        success: overallHealth,
        data: {
          status: overallHealth ? 'healthy' : 'unhealthy',
          components: {
            registry: registryHealth,
            executor: executorHealth
          },
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        success: false,
        error: 'Health check failed',
        message: error.message
      });
    }
  }
} 