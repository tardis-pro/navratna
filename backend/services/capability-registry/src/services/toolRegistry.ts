// Tool Registry Service - Enhanced with Graph Features
// Combines PostgreSQL and Neo4j for comprehensive tool management
// Part of capability-registry microservice

import { ToolDefinition } from '@uaip/types';
import { ToolDatabase, ToolGraphDatabase, ToolRelationship, ToolRecommendation } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { z } from 'zod';

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
    private postgresql: ToolDatabase,
    private neo4j: ToolGraphDatabase
  ) {}

  // Tool Registration and Management
  async registerTool(tool: ToolDefinition): Promise<void> {
    // Validate tool definition
    const validatedTool = ToolDefinitionSchema.parse(tool);
    
    try {
      // Store in PostgreSQL
      await this.postgresql.createTool(validatedTool as ToolDefinition);
      
      // Create node in Neo4j
      await this.neo4j.createToolNode(validatedTool as ToolDefinition);
      
      logger.info(`Tool registered successfully: ${tool.id}`);
    } catch (error) {
      logger.error(`Failed to register tool ${tool.id}:`, error);
      
      // Cleanup on failure
      try {
        await this.postgresql.deleteTool(tool.id);
        await this.neo4j.deleteToolNode(tool.id);
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
      await this.postgresql.updateTool(id, validatedUpdates);
      
      // Update node in Neo4j
      await this.neo4j.updateToolNode(id, validatedUpdates);
      
      logger.info(`Tool updated successfully: ${id}`);
    } catch (error) {
      logger.error(`Failed to update tool ${id}:`, error);
      throw error;
    }
  }

  async unregisterTool(id: string): Promise<void> {
    try {
      // Remove from PostgreSQL (cascades to related tables)
      await this.postgresql.deleteTool(id);
      
      // Remove node from Neo4j (detaches all relationships)
      await this.neo4j.deleteToolNode(id);
      
      logger.info(`Tool unregistered successfully: ${id}`);
    } catch (error) {
      logger.error(`Failed to unregister tool ${id}:`, error);
      throw error;
    }
  }

  // Tool Discovery and Retrieval
  async getTool(id: string): Promise<ToolDefinition | null> {
    return await this.postgresql.getTool(id);
  }

  async getTools(category?: string, enabled?: boolean): Promise<ToolDefinition[]> {
    return await this.postgresql.getTools(category, enabled);
  }

  async searchTools(query: string): Promise<ToolDefinition[]> {
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
    
    const tools = await this.postgresql.getTools();
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
    return await this.postgresql.getUsageStats(toolId, agentId, days);
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
    const tools = await this.getTools();
    return tools.filter(tool => 
      tool.isEnabled && 
      tags.some(tag => tool.tags.includes(tag))
    );
  }

  async getToolsRequiringApproval(): Promise<ToolDefinition[]> {
    const tools = await this.getTools();
    return tools.filter(tool => tool.requiresApproval && tool.isEnabled);
  }

  async getToolsBySecurityLevel(securityLevel: string): Promise<ToolDefinition[]> {
    const tools = await this.getTools();
    return tools.filter(tool => 
      tool.securityLevel === securityLevel && tool.isEnabled
    );
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
} 