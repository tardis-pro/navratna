// Tool Controller - REST API for Tools System
// Provides comprehensive REST endpoints for tool management and execution
// Part of capability-registry microservice

import { ToolRegistry } from '../services/tool_registry.js';
import { ToolExecutor } from '../services/tool_executor.js';
import { ToolDefinition, ToolCategory, SecurityLevel, ToolRelationship } from '@uaip/types';
import { logger } from '@uaip/utils';
import { z } from 'zod';

interface ElysiaCtx {
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, unknown>;
  set: { status: number };
}

// Request validation schemas
const RegisterToolSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().min(1),
  category: z.string().min(1),
  parameters: z.object({}).passthrough(),
  returnType: z.object({}).passthrough().optional(),
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']),
  requiresApproval: z.boolean(),
  isEnabled: z.boolean().optional().default(true),
  executionTimeEstimate: z.number().positive().optional(),
  costEstimate: z.number().min(0).optional(),
  author: z.string(),
  tags: z.array(z.string()),
  dependencies: z.array(z.string()).optional().default([]),
  examples: z.array(z.object({}).passthrough()).optional().default([]),
});

const ExecuteToolSchema = z.object({
  agentId: z.string(),
  parameters: z.record(z.any()),
  timeout: z.number().positive().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  retryOnFailure: z.boolean().optional(),
});

const AddRelationshipSchema = z.object({
  toToolId: z.string(),
  type: z.enum(['DEPENDS_ON', 'SIMILAR_TO', 'REPLACES', 'ENHANCES', 'REQUIRES']),
  strength: z.number().min(0).max(1),
  reason: z.string().optional(),
  metadata: z.object({}).passthrough().optional(),
});

export class ToolController {
  constructor(
    private toolRegistry: ToolRegistry,
    private toolExecutor: ToolExecutor
  ) {}

  // Tool Management Endpoints

  // GET /api/v1/tools
  async getTools({ query, set }: ElysiaCtx): Promise<unknown> {
    try {
      const { category, search, enabled, tags, securityLevel } = query ?? {};
      logger.info(
        `Getting tools with category: ${category}, search: ${search}, enabled: ${enabled}, tags: ${tags}, securityLevel: ${securityLevel}`
      );
      let tools;

      if (search) {
        logger.info(`Searching for tools with search: ${search}`);
        tools = await this.toolRegistry.searchTools(search as string);
      } else if (tags) {
        const tagArray = Array.isArray(tags) ? (tags as string[]) : [tags as string];
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

      return {
        success: true,
        data: {
          tools,
          count: tools.length,
        },
      };
    } catch (error) {
      logger.error('Failed to get tools:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve tools',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // GET /api/v1/tools/:id
  async getTool({ params, set }: ElysiaCtx): Promise<unknown> {
    try {
      logger.info(`getTool called - Params: ${JSON.stringify(params ?? {})}`);
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';
      if (!id) {
        set.status = 400;
        return {
          success: false,
          error: 'Invalid tool identifier',
          message: 'Tool identifier is required',
        };
      }

      const uuidResult = z.string().uuid().safeParse(id);
      const tool = uuidResult.success
        ? await this.toolRegistry.getTool(uuidResult.data)
        : await this.toolRegistry.lookup(id);

      if (!tool) {
        set.status = 404;
        return {
          success: false,
          error: 'Tool not found',
          message: uuidResult.success
            ? `Tool with ID ${uuidResult.data} does not exist`
            : `Tool matching "${id}" does not exist`,
        };
      }

      return {
        success: true,
        data: { tool },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get tool ${(params ?? {}).id}:`, error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve tool',
        message,
      };
    }
  }

  // POST /api/v1/tools
  async registerTool({ body, set }: ElysiaCtx): Promise<unknown> {
    try {
      const validatedTool = RegisterToolSchema.parse(body);
      const toolDefinition = this.transformToToolDefinition(validatedTool);
      await this.toolRegistry.registerTool(toolDefinition);

      set.status = 201;
      return {
        success: true,
        message: 'Tool registered successfully',
        data: { toolId: validatedTool.id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to register tool:', error);

      if (error instanceof z.ZodError) return this.buildZodErrorResponse(set, error);

      set.status = 500;
      return {
        success: false,
        error: 'Failed to register tool',
        message,
      };
    }
  }

  // PUT /api/v1/tools/:id
  async updateTool({ params, body, set }: ElysiaCtx): Promise<unknown> {
    try {
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';

      const validationResult = z.string().safeParse(id);
      if (!validationResult.success) return this.buildInvalidIdResponse(set);

      const updates = RegisterToolSchema.partial().parse(body);
      const transformedUpdates = this.transformToPartialToolDefinition(updates);

      await this.toolRegistry.updateTool(validationResult.data, transformedUpdates);

      return {
        success: true,
        message: 'Tool updated successfully',
        data: { toolId: validationResult.data },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to update tool ${(params ?? {}).id}:`, error);

      if (error instanceof z.ZodError) return this.buildZodErrorResponse(set, error);

      set.status = 500;
      return {
        success: false,
        error: 'Failed to update tool',
        message,
      };
    }
  }

  // DELETE /api/v1/tools/:id
  async unregisterTool({ params, set }: ElysiaCtx): Promise<unknown> {
    try {
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';

      const validationResult = z.string().safeParse(id);
      if (!validationResult.success) return this.buildInvalidIdResponse(set);

      await this.toolRegistry.unregisterTool(validationResult.data);

      return {
        success: true,
        message: 'Tool unregistered successfully',
        data: { toolId: validationResult.data },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to unregister tool ${(params ?? {}).id}:`, error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to unregister tool',
        message,
      };
    }
  }

  // Tool Execution Endpoints

  // POST /api/v1/tools/:id/execute
  async executeTool({ params, body, set }: ElysiaCtx): Promise<unknown> {
    try {
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';

      const validationResult = z.string().safeParse(id);
      if (!validationResult.success) return this.buildInvalidIdResponse(set);

      const validatedRequest = ExecuteToolSchema.parse(body);

      const execution = await this.toolExecutor.executeTool(
        validationResult.data,
        validatedRequest.agentId,
        validatedRequest.parameters,
        {
          timeout: validatedRequest.timeout,
          priority: validatedRequest.priority,
          retryOnFailure: validatedRequest.retryOnFailure,
        }
      );

      return {
        success: true,
        data: { execution },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to execute tool ${(params ?? {}).id}:`, error);

      if (error instanceof z.ZodError) return this.buildZodErrorResponse(set, error);

      set.status = 500;
      return {
        success: false,
        error: 'Failed to execute tool',
        message,
      };
    }
  }

  // GET /api/v1/executions/:id
  async getExecution({ params, set }: ElysiaCtx): Promise<unknown> {
    try {
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';
      const execution = await this.toolExecutor.getExecution(id);

      if (!execution) {
        set.status = 404;
        return {
          success: false,
          error: 'Execution not found',
          message: `Execution with ID ${id} does not exist`,
        };
      }

      return {
        success: true,
        data: { execution },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get execution ${(params ?? {}).id}:`, error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve execution',
        message,
      };
    }
  }

  // GET /api/v1/executions
  async getExecutions({ query, set }: ElysiaCtx): Promise<unknown> {
    try {
      const { toolId, agentId, status, limit } = query ?? {};

      const executions = await this.toolExecutor.getExecutions(
        toolId as string,
        agentId as string,
        status as string,
        limit ? parseInt(limit as string) : undefined
      );

      return {
        success: true,
        data: {
          executions,
          count: executions.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get executions:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve executions',
        message,
      };
    }
  }

  // POST /api/v1/executions/:id/approve
  async approveExecution({ params, body, set }: ElysiaCtx): Promise<unknown> {
    try {
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';
      const bodyData = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
      const approvedBy = typeof bodyData.approvedBy === 'string' ? bodyData.approvedBy : '';

      if (!approvedBy) {
        set.status = 400;
        return {
          success: false,
          error: 'Missing approvedBy field',
        };
      }

      const execution = await this.toolExecutor.approveExecution(id, approvedBy);

      return {
        success: true,
        message: 'Execution approved successfully',
        data: { execution },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to approve execution ${(params ?? {}).id}:`, error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to approve execution',
        message,
      };
    }
  }

  // POST /api/v1/executions/:id/cancel
  async cancelExecution({ params, set }: ElysiaCtx): Promise<unknown> {
    try {
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';
      const cancelled = await this.toolExecutor.cancelExecution(id);

      if (!cancelled) {
        set.status = 400;
        return {
          success: false,
          error: 'Cannot cancel execution',
          message: 'Execution may not exist or is already completed',
        };
      }

      return {
        success: true,
        message: 'Execution cancelled successfully',
        data: { executionId: id },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to cancel execution ${(params ?? {}).id}:`, error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to cancel execution',
        message,
      };
    }
  }

  // Graph-Enhanced Features

  // GET /api/v1/tools/:id/related
  async getRelatedTools({ params, query, set }: ElysiaCtx): Promise<unknown> {
    try {
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';

      const validationResult = z.string().safeParse(id);
      if (!validationResult.success) return this.buildInvalidIdResponse(set);

      const { types, minStrength } = query ?? {};

      const relationshipTypes = types ? (types as string).split(',') : undefined;
      const minStrengthValue = minStrength ? parseFloat(minStrength as string) : 0.5;

      const relatedTools = await this.toolRegistry.getRelatedTools(
        validationResult.data,
        relationshipTypes,
        minStrengthValue
      );

      return {
        success: true,
        data: {
          relatedTools,
          count: relatedTools.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get related tools for ${(params ?? {}).id}:`, error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve related tools',
        message,
      };
    }
  }

  // POST /api/v1/tools/:id/relationships
  async addRelationship({ params, body, set }: ElysiaCtx): Promise<unknown> {
    try {
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';
      const validatedRelationship = AddRelationshipSchema.parse(body);

      await this.toolRegistry.addToolRelationship(id, validatedRelationship.toToolId, {
        sourceToolId: id,
        targetToolId: validatedRelationship.toToolId,
        relationshipType: validatedRelationship.type as ToolRelationship['relationshipType'],
        type: validatedRelationship.type,
        strength: validatedRelationship.strength,
        reason: validatedRelationship.reason,
        metadata: validatedRelationship.metadata,
      });

      set.status = 201;
      return {
        success: true,
        message: 'Relationship added successfully',
        data: {
          fromToolId: id,
          toToolId: validatedRelationship.toToolId,
          type: validatedRelationship.type,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to add relationship for tool ${(params ?? {}).id}:`, error);

      if (error instanceof z.ZodError) return this.buildZodErrorResponse(set, error);

      set.status = 500;
      return {
        success: false,
        error: 'Failed to add relationship',
        message,
      };
    }
  }

  // GET /api/v1/tools/recommendations
  async getRecommendations({ query, set }: ElysiaCtx): Promise<unknown> {
    try {
      const { agentId, context, limit } = query ?? {};

      if (!agentId) {
        set.status = 400;
        return {
          success: false,
          error: 'Missing agentId parameter',
        };
      }

      const recommendations = await this.toolRegistry.getRecommendations(
        agentId as string,
        context as string,
        limit ? parseInt(limit as string) : 5
      );

      return {
        success: true,
        data: {
          recommendations,
          count: recommendations.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get recommendations:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve recommendations',
        message,
      };
    }
  }

  // GET /api/v1/tools/:id/similar
  async getSimilarTools({ params, query, set }: ElysiaCtx): Promise<unknown> {
    try {
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';
      const { minSimilarity, limit } = query ?? {};

      const similarTools = await this.toolRegistry.findSimilarTools(
        id,
        minSimilarity ? parseFloat(minSimilarity as string) : 0.6,
        limit ? parseInt(limit as string) : 5
      );

      return {
        success: true,
        data: {
          similarTools,
          count: similarTools.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get similar tools for ${(params ?? {}).id}:`, error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve similar tools',
        message,
      };
    }
  }

  // GET /api/v1/tools/:id/dependencies
  async getToolDependencies({ params, set }: ElysiaCtx): Promise<unknown> {
    try {
      const id = typeof (params ?? {}).id === 'string' ? ((params ?? {}).id as string) : '';
      const dependencies = await this.toolRegistry.getToolDependencies(id);

      return {
        success: true,
        data: {
          dependencies,
          count: dependencies.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get dependencies for tool ${(params ?? {}).id}:`, error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve tool dependencies',
        message,
      };
    }
  }

  // Analytics and Insights Endpoints

  // GET /api/v1/analytics/usage
  async getUsageAnalytics({ query, set }: ElysiaCtx): Promise<unknown> {
    try {
      const { toolId, agentId, days } = query ?? {};

      const stats = await this.toolRegistry.getUsageStats(
        toolId as string,
        agentId as string,
        days ? parseInt(days as string) : 30
      );

      return {
        success: true,
        data: { stats },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get usage analytics:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve usage analytics',
        message,
      };
    }
  }

  // GET /api/v1/analytics/popular
  async getPopularTools({ query, set }: ElysiaCtx): Promise<unknown> {
    try {
      const { category, limit } = query ?? {};

      const popularTools = await this.toolRegistry.getPopularTools(
        category as string,
        limit ? parseInt(limit as string) : 10
      );

      return {
        success: true,
        data: {
          popularTools,
          count: popularTools.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get popular tools:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve popular tools',
        message,
      };
    }
  }

  // GET /api/v1/analytics/agent/:agentId/preferences
  async getAgentPreferences({ params, set }: ElysiaCtx): Promise<unknown> {
    try {
      const agentId =
        typeof (params ?? {}).agentId === 'string' ? ((params ?? {}).agentId as string) : '';
      const preferences = await this.toolRegistry.getAgentToolPreferences(agentId);

      return {
        success: true,
        data: {
          preferences,
          count: preferences.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get preferences for agent ${(params ?? {}).agentId}:`, error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve agent preferences',
        message,
      };
    }
  }

  // Utility Endpoints

  // GET /api/v1/tools/categories
  async getToolCategories({ set }: ElysiaCtx): Promise<unknown> {
    try {
      const categories = await this.toolRegistry.getToolCategories();

      return {
        success: true,
        data: {
          categories,
          count: categories.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to get tool categories:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to retrieve tool categories',
        message,
      };
    }
  }

  // POST /api/v1/tools/validate
  async validateTool({ body, set }: ElysiaCtx): Promise<unknown> {
    try {
      const validation = await this.toolRegistry.validateToolDefinition(body);

      return {
        success: true,
        data: validation,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to validate tool:', error);
      set.status = 500;
      return {
        success: false,
        error: 'Failed to validate tool',
        message,
      };
    }
  }

  // GET /api/v1/health
  async healthCheck({ set }: ElysiaCtx): Promise<unknown> {
    try {
      const registryHealth = await this.toolRegistry.healthCheck();
      const executorHealth = await this.toolExecutor.healthCheck();

      const overallHealth =
        registryHealth.postgresql && registryHealth.neo4j && executorHealth.status === 'healthy';

      set.status = overallHealth ? 200 : 503;
      return {
        success: overallHealth,
        data: {
          status: overallHealth ? 'healthy' : 'unhealthy',
          components: {
            registry: registryHealth,
            executor: executorHealth,
          },
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Health check failed:', error);
      set.status = 503;
      return {
        success: false,
        error: 'Health check failed',
        message,
      };
    }
  }

  private applyToolDefinitionTransforms(transformed: Record<string, unknown>): void {
    // Transform category string to ToolCategory enum
    if (typeof transformed.category === 'string' && transformed.category.length > 0) {
      const categoryMap: Record<string, ToolCategory> = {
        api: ToolCategory.API,
        computation: ToolCategory.COMPUTATION,
        'file-system': ToolCategory.FILE_SYSTEM,
        database: ToolCategory.DATABASE,
        'web-search': ToolCategory.WEB_SEARCH,
        'code-execution': ToolCategory.CODE_EXECUTION,
        communication: ToolCategory.COMMUNICATION,
        'knowledge-graph': ToolCategory.KNOWLEDGE_GRAPH,
        deployment: ToolCategory.DEPLOYMENT,
        monitoring: ToolCategory.MONITORING,
        analysis: ToolCategory.ANALYSIS,
        generation: ToolCategory.GENERATION,
      };
      transformed.category = categoryMap[transformed.category] || ToolCategory.API;
    }

    // Transform securityLevel string to SecurityLevel enum
    if (typeof transformed.securityLevel === 'string' && transformed.securityLevel.length > 0) {
      const securityMap: Record<string, SecurityLevel> = {
        low: SecurityLevel.LOW,
        medium: SecurityLevel.MEDIUM,
        high: SecurityLevel.HIGH,
        critical: SecurityLevel.CRITICAL,
      };
      transformed.securityLevel = securityMap[transformed.securityLevel] || SecurityLevel.MEDIUM;
    }

    // Transform examples to proper ToolExample format
    if (transformed.examples && Array.isArray(transformed.examples)) {
      transformed.examples = transformed.examples.map((example: unknown, index: number) => {
        const ex =
          example && typeof example === 'object'
            ? (example as Record<string, unknown>)
            : ({} as Record<string, unknown>);
        return {
          name: typeof ex.name === 'string' ? ex.name : `Example ${index + 1}`,
          description:
            typeof ex.description === 'string' ? ex.description : `Example usage ${index + 1}`,
          input:
            (ex.input && typeof ex.input === 'object' ? ex.input : undefined) ||
            (ex.parameters && typeof ex.parameters === 'object' ? ex.parameters : undefined) ||
            {},
          expectedOutput: ex.expectedOutput ?? ex.output ?? 'Expected output',
        };
      });
    }
  }

  private buildInvalidIdResponse(set: { status: number }): Record<string, unknown> {
    set.status = 400;
    return {
      success: false,
      error: 'Invalid tool ID format',
      message: 'Tool ID must be a positive integer',
    };
  }

  private buildZodErrorResponse(set: { status: number }, error: z.ZodError): Record<string, unknown> {
    set.status = 400;
    return {
      success: false,
      error: 'Validation error',
      details: error.errors,
    };
  }

  private transformToToolDefinition(validatedTool: unknown): ToolDefinition {
    const transformed =
      validatedTool && typeof validatedTool === 'object'
        ? ({ ...validatedTool } as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    this.applyToolDefinitionTransforms(transformed);

    return transformed as unknown as ToolDefinition;
  }

  private transformToPartialToolDefinition(validatedTool: unknown): Partial<ToolDefinition> {
    const transformed =
      validatedTool && typeof validatedTool === 'object'
        ? ({ ...validatedTool } as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    this.applyToolDefinitionTransforms(transformed);

    return transformed as Partial<ToolDefinition>;
  }
}
