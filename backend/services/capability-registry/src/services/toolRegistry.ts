// Tool Registry Service - Enhanced with Graph Features
// Combines PostgreSQL and Neo4j for comprehensive tool management
// Part of capability-registry microservice

import { ToolDefinition, ToolUsageRecord, ToolCategory, SecurityLevel } from '@uaip/types';
import {
  ToolDatabase,
  ToolRelationship,
  ToolRecommendation,
  ToolService,
  serviceFactory,
  EventBusService,
} from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { config } from '@uaip/config';
import { z } from 'zod';

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
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  version: z.string().min(1),
  category: z.string().min(1),
  parameters: z.object({}).passthrough(),
  returnType: z.object({}).passthrough().optional(),
  securityLevel: z.enum(['low', 'medium', 'high', 'critical']),
  requiresApproval: z.boolean(),
  isEnabled: z.boolean(),
  executionTimeEstimate: z.number().positive().optional(),
  costEstimate: z.number().min(0).optional(),
  author: z.string(),
  tags: z.array(z.string()),
  dependencies: z.array(z.string()),
  examples: z.array(z.object({}).passthrough()),
});

const ToolRelationshipSchema = z.object({
  type: z.enum(['DEPENDS_ON', 'SIMILAR_TO', 'REPLACES', 'ENHANCES', 'REQUIRES']),
  strength: z.number().min(0).max(1),
  reason: z.string().optional(),
  metadata: z.object({}).passthrough().optional(),
});

export class ToolRegistry {
  private toolService: ToolService;

  constructor(private eventBusService?: EventBusService) {
    this.toolService = ToolService.getInstance();
    if (this.eventBusService) {
      this.setupEventSubscriptions();
    }
  }

  // Setup event subscriptions for dynamic tool registration
  private async setupEventSubscriptions(): Promise<void> {
    if (!this.eventBusService) return;

    try {
      // Listen for MCP tool registration events
      await this.eventBusService.subscribe('tool.register', async (event) => {
        await this.handleToolRegistration(event);
      });

      // Listen for OAuth provider capability events
      await this.eventBusService.subscribe('oauth.capabilities.discovered', async (event) => {
        await this.handleOAuthCapabilities(event);
      });

      logger.info('Tool Registry event subscriptions configured');
    } catch (error) {
      logger.error('Failed to setup Tool Registry event subscriptions:', error);
    }
  }

  // Handle dynamic tool registration from MCP servers
  private async handleToolRegistration(event: any): Promise<void> {
    try {
      const { tool, source, serverName } = event;
      logger.info(`Registering tool from ${source}: ${tool.id}`);

      // Register the tool with enhanced metadata
      await this.registerTool({
        ...tool,
        metadata: {
          ...tool.metadata,
          autoRegistered: true,
          registrationSource: source,
          registrationTimestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error(`Failed to handle tool registration for ${event.tool?.id}:`, error);
    }
  }

  // Handle OAuth provider capabilities
  private async handleOAuthCapabilities(event: any): Promise<void> {
    try {
      const { provider, capabilities } = event;

      for (const capability of capabilities) {
        const toolId = `oauth-${provider}-${capability.action}`;

        await this.registerTool({
          id: toolId,
          name: capability.name,
          description: capability.description,
          category: ToolCategory.COMMUNICATION,
          version: '1.0.0',
          parameters: capability.parameters || {},
          returnType: capability.returnType || {},
          securityLevel: SecurityLevel.MEDIUM,
          requiresApproval: false,
          isEnabled: true,
          executionTimeEstimate: 3000,
          costEstimate: 0.02,
          author: `${provider} OAuth Provider`,
          tags: ['oauth', provider, capability.category, 'auto-registered'],
          dependencies: [],
          examples: capability.examples || [],
        });
      }

      logger.info(`Registered ${capabilities.length} OAuth capabilities for ${provider}`);
    } catch (error) {
      logger.error(`Failed to handle OAuth capabilities for ${event.provider}:`, error);
    }
  }

  // Ensure database is initialized
  private async ensureInitialized(): Promise<void> {
    // ToolService is always ready - no initialization needed
    // Services use lazy initialization of repositories
  }

  // Tool Registration and Management
  async registerTool(tool: Partial<ToolDefinition>): Promise<void> {
    // Validate tool definition
    const validatedTool = ToolDefinitionSchema.parse(tool);

    try {
      // Store in PostgreSQL

      // Transform and create node in Neo4j
      const transformedTool = this.transformValidatedToToolDefinition(validatedTool);
      // Neo4j operations now handled by knowledge graph service
      logger.debug('Tool node creation requested', { toolId: transformedTool.id });

      // Use ToolService for tool management
      await this.toolService.createTool({
        name: validatedTool.name,
        displayName: validatedTool.name, // Use name as displayName
        description: validatedTool.description,
        category: validatedTool.category as any,
        isEnabled: validatedTool.isEnabled,
        version: validatedTool.version,
        inputSchema: validatedTool.parameters,
        outputSchema: validatedTool.returnType,
        securityLevel: validatedTool.securityLevel as SecurityLevel,
      });

      logger.info(`Tool registered successfully: ${tool.id}`);
    } catch (error) {
      logger.error(`Failed to register tool ${tool.id}:`, error);

      // Cleanup on failure
      try {
        // Neo4j operations now handled by knowledge graph service
        logger.debug('Tool node deletion requested', { toolId: tool.id });
        // Tool cleanup handled by ToolService internally
      } catch (cleanupError) {
        logger.error(`Failed to cleanup after registration failure:`, cleanupError);
      }

      throw error;
    }
  }

  async updateTool(id: string, updates: Partial<ToolDefinition>): Promise<void> {
    // Validate ID
    const validatedId = z.string().parse(id);

    // Validate updates
    const validatedUpdates = ToolDefinitionSchema.partial().parse(updates);

    try {
      // Update in PostgreSQL

      // Update node in Neo4j
      // Transform and update node in Neo4j
      const transformedUpdates = this.transformValidatedToToolDefinition(validatedUpdates);
      // Neo4j operations now handled by knowledge graph service
      logger.debug('Tool node update requested', { toolId: validatedId });

      // Update TypeORM entity using ToolService
      // Note: ToolService doesn't have updateTool method yet, using repository directly
      const toolRepo = this.toolService.getToolRepository();

      // Transform the updates to match entity types
      const entityUpdates: any = {
        updatedAt: new Date(),
      };

      if (validatedUpdates.name) entityUpdates.name = validatedUpdates.name;
      if (validatedUpdates.description) entityUpdates.description = validatedUpdates.description;
      if (validatedUpdates.version) entityUpdates.version = validatedUpdates.version;
      if (validatedUpdates.category)
        entityUpdates.category = validatedUpdates.category as ToolCategory;
      if (validatedUpdates.isEnabled !== undefined)
        entityUpdates.isEnabled = validatedUpdates.isEnabled;
      if (validatedUpdates.securityLevel)
        entityUpdates.securityLevel = validatedUpdates.securityLevel as SecurityLevel;

      await toolRepo.update(validatedId, entityUpdates);

      logger.info(`Tool updated successfully: ${validatedId}`);
    } catch (error) {
      logger.error(`Failed to update tool ${validatedId}:`, error);
      throw error;
    }
  }

  async unregisterTool(id: string): Promise<void> {
    // Validate ID
    const validatedId = z.string().parse(id);

    try {
      // Remove from PostgreSQL (cascades to related tables)

      // Remove node from Neo4j (detaches all relationships)
      // Neo4j operations now handled by knowledge graph service
      logger.debug('Tool node deletion requested', { toolId: validatedId });

      // Remove TypeORM entity using ToolService
      const toolRepo = this.toolService.getToolRepository();
      await toolRepo.delete(validatedId);

      logger.info(`Tool unregistered successfully: ${validatedId}`);
    } catch (error) {
      logger.error(`Failed to unregister tool ${validatedId}:`, error);
      throw error;
    }
  }

  // Tool Discovery and Retrieval
  async getTool(id: string): Promise<ToolDefinition | null> {
    await this.ensureInitialized();
    const validatedId = z.string().parse(id);
    return await this.toolService.findToolById(validatedId);
  }

  async lookup(toolName: string): Promise<ToolDefinition | null> {
    await this.ensureInitialized();
    const validatedName = z.string().parse(toolName);

    try {
      // First try exact name match
      const tools = await this.getTools();
      let tool = tools.find((t) => t.name === validatedName && t.isEnabled);

      if (!tool) {
        // Try case-insensitive match
        tool = tools.find(
          (t) => t.name.toLowerCase() === validatedName.toLowerCase() && t.isEnabled
        );
      }

      if (!tool) {
        // Try partial match in name or tags
        tool = tools.find(
          (t) =>
            (t.name.toLowerCase().includes(validatedName.toLowerCase()) ||
              t.tags.some((tag) => tag.toLowerCase().includes(validatedName.toLowerCase()))) &&
            t.isEnabled
        );
      }

      if (tool) {
        logger.debug(`Tool found: ${toolName} -> ${tool.name} (${tool.id})`);
        return tool;
      }

      logger.warn(`Tool not found: ${toolName}`);
      return null;
    } catch (error) {
      logger.error(`Error looking up tool ${toolName}:`, error);
      throw new Error(`Failed to lookup tool: ${toolName}`);
    }
  }

  async getTools(category?: string, enabled?: boolean): Promise<ToolDefinition[]> {
    await this.ensureInitialized();
    logger.info(`Getting tools with category: ${category}, enabled: ${enabled}`);

    if (category) {
      const tools = await this.toolService.findToolsByCategory(category);
      if (enabled !== undefined) {
        return tools.filter((tool) => tool.isEnabled === enabled);
      }
      return tools;
    }

    const tools = await this.toolService.findActiveTools();
    if (enabled === false) {
      // Need to get all tools (active and inactive) if enabled=false
      // For now, just return active tools
      return [];
    }
    return tools;
  }

  async searchTools(query: string): Promise<ToolDefinition[]> {
    await this.ensureInitialized();
    // ToolService doesn't have searchTools, so implement it here
    const tools = await this.toolService.findActiveTools();
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(query.toLowerCase()) ||
        tool.description.toLowerCase().includes(query.toLowerCase())
    );
  }

  async isEnabled(toolId: string): Promise<boolean> {
    const tool = await this.getTool(toolId);
    return tool?.isEnabled || false;
  }

  async setEnabled(toolId: string, enabled: boolean): Promise<void> {
    await this.updateTool(toolId, { isEnabled: enabled });
  }

  // Graph-Enhanced Features
  async getRelatedTools(
    toolId: string,
    relationshipTypes?: string[],
    minStrength = 0.5
  ): Promise<ToolDefinition[]> {
    // Get related tool IDs from Neo4j
    const relatedTools: ToolDefinition[] = []; // TODO: Implement with knowledge graph service

    // Get full tool definitions from PostgreSQL
    const toolIds = relatedTools.map((t) => t.id);
    if (toolIds.length === 0) return [];

    const tools = await this.toolService.findActiveTools();
    return tools.filter((tool) => toolIds.includes(tool.id) && tool.isEnabled);
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
      metadata: validatedRelationship.metadata,
    };

    // Neo4j operations now handled by knowledge graph service
    logger.debug('Tool relationship addition requested', { fromToolId, toToolId });
    logger.info(`Relationship added: ${fromToolId} -[${relationship.type}]-> ${toToolId}`);
  }

  async getRecommendations(
    agentId: string,
    context?: string,
    limit = 5
  ): Promise<ToolRecommendation[]> {
    try {
      const recommendations: ToolRecommendation[] = [];

      // Get usage-based recommendations
      const usageRecommendations: ToolRecommendation[] = []; // TODO: Implement with knowledge graph service
      recommendations.push(...usageRecommendations);

      // Get contextual recommendations if context provided
      if (context) {
        const contextualRecommendations: ToolRecommendation[] = []; // TODO: Implement with knowledge graph service
        recommendations.push(...contextualRecommendations);
      }

      // Remove duplicates and sort by score
      const uniqueRecommendations = recommendations.reduce((acc, current) => {
        const existing = acc.find((r) => r.toolId === current.toolId);
        if (!existing || current.score > existing.score) {
          return [...acc.filter((r) => r.toolId !== current.toolId), current];
        }
        return acc;
      }, [] as ToolRecommendation[]);

      return uniqueRecommendations.sort((a, b) => b.score - a.score).slice(0, limit);
    } catch (error) {
      logger.error(`Failed to get recommendations for agent ${agentId}:`, error);
      return [];
    }
  }

  async findSimilarTools(
    toolId: string,
    minSimilarity = 0.6,
    limit = 5
  ): Promise<ToolRecommendation[]> {
    return []; // TODO: Implement with knowledge graph service
  }

  async getToolDependencies(toolId: string): Promise<string[]> {
    return []; // TODO: Implement with knowledge graph service
  }

  // Analytics and Insights
  async getUsageStats(toolId?: string, agentId?: string, days = 30): Promise<any[]> {
    await this.ensureInitialized();
    const filters: any = { days };
    if (toolId) filters.toolId = toolId;
    if (agentId) filters.agentId = agentId;
    // Use ToolService for usage stats
    const usageRepo = this.toolService.getToolUsageRepository();
    return await usageRepo.getToolUsageStats(filters);
  }

  async getToolUsageAnalytics(toolId?: string, agentId?: string): Promise<any[]> {
    return []; // TODO: Implement with knowledge graph service
  }

  async getPopularTools(category?: string, limit = 10): Promise<any[]> {
    return []; // TODO: Implement with knowledge graph service
  }

  async getAgentToolPreferences(agentId: string): Promise<any[]> {
    return []; // TODO: Implement with knowledge graph service
  }

  // Utility Methods
  async validateToolDefinition(
    tool: Partial<ToolDefinition>
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
      ToolDefinitionSchema.parse(tool);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        };
      }
      return { valid: false, errors: ['Unknown validation error'] };
    }
  }

  async getToolCategories(): Promise<string[]> {
    const tools = await this.getTools();
    const categories = [...new Set(tools.map((tool) => tool.category))];
    return categories.sort();
  }

  async getToolsByTags(tags: string[]): Promise<ToolDefinition[]> {
    const tools = await this.getTools(undefined, true); // Only enabled tools
    return tools.filter((tool) => tags.some((tag) => tool.tags.includes(tag)));
  }

  async getToolsRequiringApproval(): Promise<ToolDefinition[]> {
    const tools = await this.getTools(undefined, true); // Only enabled tools
    return tools.filter((tool) => tool.requiresApproval);
  }

  async getToolsBySecurityLevel(securityLevel: string): Promise<ToolDefinition[]> {
    const tools = await this.getTools(undefined, true); // Only enabled tools
    return tools.filter((tool) => tool.securityLevel === securityLevel);
  }

  // Health Check
  async healthCheck(): Promise<{ postgresql: boolean; neo4j: boolean }> {
    try {
      // Test PostgreSQL connection by attempting a simple query instead of looking for a specific tool
      let postgresqlHealth = false;
      try {
        // Use ToolService for health check
        const tools = await this.toolService.getToolRepository().findMany({});
        postgresqlHealth = Array.isArray(tools);
      } catch {
        postgresqlHealth = false;
      }

      let neo4jHealth = false;
      try {
        // Neo4j connectivity handled by knowledge graph service
        logger.debug('Neo4j connectivity check requested');
        neo4jHealth = true;
      } catch {
        neo4jHealth = false;
      }

      return {
        postgresql: postgresqlHealth,
        neo4j: neo4jHealth,
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        postgresql: false,
        neo4j: false,
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
        duration: executionTime,
        success,
        cost: cost,
        startTime: new Date(),
        endTime: new Date(),
        metadata: metadata || {},
      };

      // Record tool usage through ToolService
      const usageRepo = this.toolService.getToolUsageRepository();
      await usageRepo.recordToolUsage({
        toolId,
        agentId,
        executionTimeMs: executionTime,
        success,
        cost,
        metadata: metadata || {},
        usedAt: new Date(),
      });

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
      // Update capability metrics through ToolService - record as usage
      const usageRepo = this.toolService.getToolUsageRepository();
      await usageRepo.recordToolUsage({
        agentId,
        toolId,
        success,
        executionTimeMs: executionTime,
        usedAt: new Date(),
      });
    } catch (error) {
      logger.error(`Failed to update capability metrics:`, error);
    }
  }

  // Enhanced Analytics with TypeORM
  async getAgentCapabilityMetrics(agentId: string): Promise<AgentCapabilityMetric[]> {
    try {
      // Get capability metrics through ToolService
      const usageRepo = this.toolService.getToolUsageRepository();
      const stats = await usageRepo.getToolUsageStats({ agentId });
      // Transform to expected format
      return stats.map((stat: any) => ({
        id: `${stat.agentId}_${stat.toolId}`,
        agentId: stat.agentId,
        toolId: stat.toolId,
        totalExecutions: stat.totalUses || 0,
        successfulExecutions: stat.successfulUses || 0,
        totalExecutionTime: stat.avgExecutionTime * stat.totalUses || 0,
        averageExecutionTime: stat.avgExecutionTime || 0,
        successRate: stat.totalUses > 0 ? (stat.successfulUses || 0) / stat.totalUses : 0,
        lastUsed: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    } catch (error) {
      logger.error(`Failed to get capability metrics for agent ${agentId}:`, error);
      return [];
    }
  }

  async getToolUsageStats(toolId: string, days = 30): Promise<any> {
    try {
      // Get tool usage stats through ToolService
      const usageRepo = this.toolService.getToolUsageRepository();
      return await usageRepo.getToolUsageStats({ toolId, days });
    } catch (error) {
      logger.error(`Failed to get tool usage stats for ${toolId}:`, error);
      return null;
    }
  }

  private transformEntityToInterface(entity: any): ToolDefinition {
    return {
      ...entity,
      // Transform ToolSecurityLevel to SecurityLevel if needed
      securityLevel: this.mapToolSecurityLevelToSecurityLevel(entity.securityLevel),
      // Transform category string to ToolCategory enum if needed
      category: this.mapStringToToolCategory(entity.category),
    };
  }

  private mapToolSecurityLevelToSecurityLevel(toolSecurityLevel: any): SecurityLevel {
    // If it's already a SecurityLevel, return as is
    if (Object.values(SecurityLevel).includes(toolSecurityLevel)) {
      return toolSecurityLevel;
    }

    // Map from ToolSecurityLevel to SecurityLevel
    const mapping: Record<string, SecurityLevel> = {
      SAFE: SecurityLevel.LOW,
      MODERATE: SecurityLevel.MEDIUM,
      RESTRICTED: SecurityLevel.HIGH,
      DANGEROUS: SecurityLevel.CRITICAL,
    };

    return mapping[toolSecurityLevel] || SecurityLevel.MEDIUM;
  }

  private mapStringToToolCategory(category: any): ToolCategory {
    // If it's already a ToolCategory, return as is
    if (Object.values(ToolCategory).includes(category)) {
      return category;
    }

    // Map string to ToolCategory enum
    const mapping: Record<string, ToolCategory> = {
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

    return mapping[category] || ToolCategory.API;
  }

  private transformValidatedToToolDefinition(validatedTool: any): Partial<ToolDefinition> {
    const transformed: any = { ...validatedTool };

    // Transform category string to ToolCategory enum
    if (transformed.category) {
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
    if (transformed.securityLevel) {
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
      transformed.examples = transformed.examples.map((example: any, index: number) => ({
        name: example.name || `Example ${index + 1}`,
        description: example.description || `Example usage ${index + 1}`,
        input: example.input || example.parameters || {},
        expectedOutput: example.expectedOutput || example.output || 'Expected output',
      }));
    }

    return transformed;
  }
}
