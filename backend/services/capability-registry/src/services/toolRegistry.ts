// Tool Registry Service - Enhanced with Graph Features
// Combines PostgreSQL and Neo4j for comprehensive tool management
// Part of capability-registry microservice

import { ToolDefinition, ToolUsageRecord } from '@uaip/types';
import { ToolDatabase, ToolGraphDatabase, ToolRelationship, ToolRecommendation, TypeOrmService, DatabaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Define AgentCapabilityMetric interface locally since it's not exported from types
interface AgentCapabilityMetric {
  id: string;
  agentId: string;
  toolId: string;
  totalExecutions: number;
  successfulExecutions: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  successRate: number;
  lastUsed: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Validation schemas using Zod
const ToolDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().min(1),
  category: z.string().min(1),
  parameters: z.object({}).passthrough(),
  returnType: z.object({}).passthrough().optional(),
  securityLevel: z.enum(['safe', 'moderate', 'restricted', 'dangerous']),
  requiresApproval: z.boolean(),
  isEnabled: z.boolean(),
  executionTimeEstimate: z.number().positive().optional(),
  costEstimate: z.number().min(0).optional(),
  author: z.string(),
  tags: z.array(z.string()),
  dependencies: z.array(z.string()),
  examples: z.array(z.object({}).passthrough())
});

const ToolRelationshipSchema = z.object({
  type: z.enum(['DEPENDS_ON', 'SIMILAR_TO', 'REPLACES', 'ENHANCES', 'REQUIRES']),
  strength: z.number().min(0).max(1),
  reason: z.string().optional(),
  metadata: z.object({}).passthrough().optional()
});

export class ToolRegistry {
  constructor(
    private postgresql: DatabaseService,
    private neo4j: ToolGraphDatabase,
    private typeormService: TypeOrmService
  ) {}

  // Ensure database is initialized
  private async ensureInitialized(): Promise<void> {
    // The DatabaseService should already be initialized by the app
    // but we can add a check here if needed
    try {
      const healthCheck = await this.postgresql.healthCheck();
      if (healthCheck.status !== 'healthy') {
        throw new Error('Database is not healthy');
      }
    } catch (error) {
      throw new Error(`Database not properly initialized: ${error.message}`);
    }
  }

  // Tool Registration and Management
  async registerTool(tool: ToolDefinition): Promise<void> {
    // Validate tool definition
    const validatedTool = ToolDefinitionSchema.parse(tool);
    
    try {
      // Store in PostgreSQL
      
      // Create node in Neo4j
      await this.neo4j.createToolNode(validatedTool as ToolDefinition);

      // Create TypeORM ToolDefinition entity for enhanced tracking
      await this.typeormService.create('ToolDefinition', {
        id: validatedTool.id,
        name: validatedTool.name,
        description: validatedTool.description,
        version: validatedTool.version,
        category: validatedTool.category,
        parameters: validatedTool.parameters,
        returnType: validatedTool.returnType,
        securityLevel: validatedTool.securityLevel,
        requiresApproval: validatedTool.requiresApproval,
        isEnabled: validatedTool.isEnabled,
        executionTimeEstimate: validatedTool.executionTimeEstimate,
        costEstimate: validatedTool.costEstimate,
        author: validatedTool.author,
        tags: validatedTool.tags,
        dependencies: validatedTool.dependencies,
        examples: validatedTool.examples,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      logger.info(`Tool registered successfully: ${tool.id}`);
    } catch (error) {
      logger.error(`Failed to register tool ${tool.id}:`, error);
      
      // Cleanup on failure
      try {
        
        await this.neo4j.deleteToolNode(tool.id);
        await this.typeormService.delete('ToolDefinition', tool.id);
      } catch (cleanupError) {
        logger.error(`Failed to cleanup after registration failure:`, cleanupError);
      }
      
      throw error;
    }
  }

  async updateTool(id: string, updates: Partial<ToolDefinition>): Promise<void> {
    // Validate updates
    const validatedUpdates = ToolDefinitionSchema.partial().parse(updates);
    
    try {
      // Update in PostgreSQL
      
      // Update node in Neo4j
      await this.neo4j.updateToolNode(id, validatedUpdates);

      // Update TypeORM entity
      await this.typeormService.update('ToolDefinition', id, {
        ...validatedUpdates,
        updatedAt: new Date()
      });
      
      logger.info(`Tool updated successfully: ${id}`);
    } catch (error) {
      logger.error(`Failed to update tool ${id}:`, error);
      throw error;
    }
  }

  async unregisterTool(id: string): Promise<void> {
    try {
      // Remove from PostgreSQL (cascades to related tables)
      
      // Remove node from Neo4j (detaches all relationships)
      await this.neo4j.deleteToolNode(id);

      // Remove TypeORM entity
      await this.typeormService.delete('ToolDefinition', id);
      
      logger.info(`Tool unregistered successfully: ${id}`);
    } catch (error) {
      logger.error(`Failed to unregister tool ${id}:`, error);
      throw error;
    }
  }

  // Tool Discovery and Retrieval
  async getTool(id: string): Promise<ToolDefinition | null> {
    await this.ensureInitialized();
    return await this.postgresql.getTool(id);
  }

  async getTools(category?: string, enabled?: boolean): Promise<ToolDefinition[]> {
    await this.ensureInitialized();
    const filters: any = {};
    if (category) filters.category = category;
    if (enabled !== undefined) filters.enabled = enabled;
    return await this.postgresql.getTools(filters);
  }

  async searchTools(query: string): Promise<ToolDefinition[]> {
    await this.ensureInitialized();
    return await this.postgresql.searchTools(query);
  }

  async isEnabled(toolId: string): Promise<boolean> {
    const tool = await this.getTool(toolId);
    return tool?.isEnabled || false;
  }

  async setEnabled(toolId: string, enabled: boolean): Promise<void> {
    await this.updateTool(toolId, { isEnabled: enabled });
  }

  // Graph-Enhanced Features
  async getRelatedTools(toolId: string, relationshipTypes?: string[], minStrength = 0.5): Promise<ToolDefinition[]> {
    // Get related tool IDs from Neo4j
    const relatedTools = await this.neo4j.getRelatedTools(toolId, relationshipTypes, minStrength);
    
    // Get full tool definitions from PostgreSQL
    const toolIds = relatedTools.map(t => t.id);
    if (toolIds.length === 0) return [];
    
    const tools = await this.postgresql.getTools({});
    return tools.filter(tool => toolIds.includes(tool.id) && tool.isEnabled);
  }

  async addToolRelationship(
    fromToolId: string,
    toToolId: string,
    relationship: ToolRelationship
  ): Promise<void> {
    // Validate relationship
    const validatedRelationship = ToolRelationshipSchema.parse(relationship);
    
    // Verify both tools exist
    const fromTool = await this.getTool(fromToolId);
    const toTool = await this.getTool(toToolId);
    
    if (!fromTool) {
      throw new Error(`Source tool not found: ${fromToolId}`);
    }
    if (!toTool) {
      throw new Error(`Target tool not found: ${toToolId}`);
    }
    
    // Create the relationship object with validated data
    const relationshipData: ToolRelationship = {
      type: validatedRelationship.type,
      strength: validatedRelationship.strength,
      reason: validatedRelationship.reason,
      metadata: validatedRelationship.metadata
    };
    
    await this.neo4j.addToolRelationship(fromToolId, toToolId, relationshipData);
    logger.info(`Relationship added: ${fromToolId} -[${relationship.type}]-> ${toToolId}`);
  }

  async getRecommendations(agentId: string, context?: string, limit = 5): Promise<ToolRecommendation[]> {
    try {
      let recommendations: ToolRecommendation[] = [];
      
      // Get usage-based recommendations
      const usageRecommendations = await this.neo4j.getRecommendations(agentId, context, limit);
      recommendations.push(...usageRecommendations);
      
      // Get contextual recommendations if context provided
      if (context) {
        const contextualRecommendations = await this.neo4j.getContextualRecommendations(context, limit);
        recommendations.push(...contextualRecommendations);
      }
      
      // Remove duplicates and sort by score
      const uniqueRecommendations = recommendations.reduce((acc, current) => {
        const existing = acc.find(r => r.toolId === current.toolId);
        if (!existing || current.score > existing.score) {
          return [...acc.filter(r => r.toolId !== current.toolId), current];
        }
        return acc;
      }, [] as ToolRecommendation[]);
      
      return uniqueRecommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      logger.error(`Failed to get recommendations for agent ${agentId}:`, error);
      return [];
    }
  }

  async findSimilarTools(toolId: string, minSimilarity = 0.6, limit = 5): Promise<ToolRecommendation[]> {
    return await this.neo4j.findSimilarTools(toolId, minSimilarity, limit);
  }

  async getToolDependencies(toolId: string): Promise<string[]> {
    return await this.neo4j.getToolDependencies(toolId);
  }

  // Analytics and Insights
  async getUsageStats(toolId?: string, agentId?: string, days = 30): Promise<any[]> {
    await this.ensureInitialized();
    const filters: any = { days };
    if (toolId) filters.toolId = toolId;
    if (agentId) filters.agentId = agentId;
    return await this.postgresql.getToolUsageStats(filters);
  }

  async getToolUsageAnalytics(toolId?: string, agentId?: string): Promise<any[]> {
    return await this.neo4j.getToolUsageAnalytics(toolId, agentId);
  }

  async getPopularTools(category?: string, limit = 10): Promise<any[]> {
    return await this.neo4j.getPopularTools(category, limit);
  }

  async getAgentToolPreferences(agentId: string): Promise<any[]> {
    return await this.neo4j.getAgentToolPreferences(agentId);
  }

  // Utility Methods
  async validateToolDefinition(tool: Partial<ToolDefinition>): Promise<{ valid: boolean; errors: string[] }> {
    try {
      ToolDefinitionSchema.parse(tool);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        };
      }
      return { valid: false, errors: ['Unknown validation error'] };
    }
  }

  async getToolCategories(): Promise<string[]> {
    const tools = await this.getTools();
    const categories = [...new Set(tools.map(tool => tool.category))];
    return categories.sort();
  }

  async getToolsByTags(tags: string[]): Promise<ToolDefinition[]> {
    const tools = await this.getTools(undefined, true); // Only enabled tools
    return tools.filter(tool => 
      tags.some(tag => tool.tags.includes(tag))
    );
  }

  async getToolsRequiringApproval(): Promise<ToolDefinition[]> {
    const tools = await this.getTools(undefined, true); // Only enabled tools
    return tools.filter(tool => tool.requiresApproval);
  }

  async getToolsBySecurityLevel(securityLevel: string): Promise<ToolDefinition[]> {
    const tools = await this.getTools(undefined, true); // Only enabled tools
    return tools.filter(tool => tool.securityLevel === securityLevel);
  }

  // Health Check
  async healthCheck(): Promise<{ postgresql: boolean; neo4j: boolean }> {
    try {
      const postgresqlHealth = await this.postgresql.getTool('health-check') !== undefined;
      const neo4jHealth = await this.neo4j.verifyConnectivity().then(() => true).catch(() => false);
      
      return {
        postgresql: postgresqlHealth,
        neo4j: neo4jHealth
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        postgresql: false,
        neo4j: false
      };
    }
  }

  // Enhanced Tool Usage Tracking
  async recordToolUsage(
    toolId: string,
    agentId: string,
    executionTime: number,
    success: boolean,
    cost?: number,
    metadata?: any
  ): Promise<void> {
    try {
      const usageRecord: Partial<ToolUsageRecord> = {
        toolId,
        agentId,
        executionTime,
        success,
        cost: cost || 0,
        timestamp: new Date(),
        metadata: metadata || {}
      };

      await this.typeormService.create('ToolUsageRecord', usageRecord);
      
      // Update capability metrics
      await this.updateCapabilityMetrics(agentId, toolId, success, executionTime);
      
      logger.debug(`Tool usage recorded: ${toolId} by ${agentId}`);
    } catch (error) {
      logger.error(`Failed to record tool usage:`, error);
      // Don't throw - usage tracking shouldn't break tool execution
    }
  }

  private async updateCapabilityMetrics(
    agentId: string,
    toolId: string,
    success: boolean,
    executionTime: number
  ): Promise<void> {
    try {
      // Get existing metric using repository
      const repository = this.typeormService.agentCapabilityMetricRepository;
      let metric = await repository.findOne({
        where: { agentId, toolId }
      });

      if (metric) {
        // Update existing metric
        const totalExecutions = metric.totalExecutions + 1;
        const successfulExecutions = metric.successfulExecutions + (success ? 1 : 0);
        const totalExecutionTime = metric.totalExecutionTime + executionTime;

        await this.typeormService.update('AgentCapabilityMetric', metric.id, {
          totalExecutions,
          successfulExecutions,
          totalExecutionTime,
          averageExecutionTime: totalExecutionTime / totalExecutions,
          successRate: successfulExecutions / totalExecutions,
          lastUsed: new Date(),
          updatedAt: new Date()
        });
      } else {
        // Create new metric
        const newMetric: Partial<AgentCapabilityMetric> = {
          id: uuidv4(),
          agentId,
          toolId,
          totalExecutions: 1,
          successfulExecutions: success ? 1 : 0,
          totalExecutionTime: executionTime,
          averageExecutionTime: executionTime,
          successRate: success ? 1.0 : 0.0,
          lastUsed: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await this.typeormService.create('AgentCapabilityMetric', newMetric);
      }
    } catch (error) {
      logger.error(`Failed to update capability metrics:`, error);
    }
  }

  // Enhanced Analytics with TypeORM
  async getAgentCapabilityMetrics(agentId: string): Promise<AgentCapabilityMetric[]> {
    try {
      const repository = this.typeormService.agentCapabilityMetricRepository;
      return await repository.find({
        where: { agentId }
      });
    } catch (error) {
      logger.error(`Failed to get capability metrics for agent ${agentId}:`, error);
      return [];
    }
  }

  async getToolUsageStats(toolId: string, days = 30): Promise<any> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const repository = this.typeormService.toolUsageRecordRepository;
      const usageRecords = await repository.find({
        where: { 
          toolId,
          timestamp: { $gte: since }
        }
      });

      const totalUsage = usageRecords.length;
      const successfulUsage = usageRecords.filter((r: any) => r.success).length;
      const totalCost = usageRecords.reduce((sum: number, r: any) => sum + (r.cost || 0), 0);
      const avgExecutionTime = usageRecords.length > 0 
        ? usageRecords.reduce((sum: number, r: any) => sum + r.executionTime, 0) / usageRecords.length 
        : 0;

      return {
        toolId,
        period: `${days} days`,
        totalUsage,
        successfulUsage,
        successRate: totalUsage > 0 ? successfulUsage / totalUsage : 0,
        totalCost,
        averageExecutionTime: avgExecutionTime,
        uniqueAgents: new Set(usageRecords.map((r: any) => r.agentId)).size
      };
    } catch (error) {
      logger.error(`Failed to get tool usage stats for ${toolId}:`, error);
      return null;
    }
  }
} 