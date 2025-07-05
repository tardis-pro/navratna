// Tool Registry Service - Enhanced with Graph Features
// Combines PostgreSQL and Neo4j for comprehensive tool management
// Part of capability-registry microservice

import { ToolDefinition, ToolUsageRecord, ToolCategory, SecurityLevel } from '@uaip/types';
import { ToolDatabase, ToolGraphDatabase, ToolRelationship, ToolRecommendation, DatabaseService, serviceFactory, EventBusService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
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
  examples: z.array(z.object({}).passthrough())
});

const ToolRelationshipSchema = z.object({
  type: z.enum(['DEPENDS_ON', 'SIMILAR_TO', 'REPLACES', 'ENHANCES', 'REQUIRES']),
  strength: z.number().min(0).max(1),
  reason: z.string().optional(),
  metadata: z.object({}).passthrough().optional()
});

export class ToolRegistry {
  private toolManagementService: any;

  constructor(
    private postgresql: DatabaseService,
    private neo4j: ToolGraphDatabase,
    private eventBusService?: EventBusService
  ) {
    this.setupEventSubscriptions();
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
          registrationTimestamp: new Date().toISOString()
        }
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
          examples: capability.examples || []
        });
      }
      
      logger.info(`Registered ${capabilities.length} OAuth capabilities for ${provider}`);
    } catch (error) {
      logger.error(`Failed to handle OAuth capabilities for ${event.provider}:`, error);
    }
  }

  private async getToolManagementService() {
    if (!this.toolManagementService) {
      this.toolManagementService = await serviceFactory.getToolManagementService();
    }
    return this.toolManagementService;
  }

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
  async registerTool(tool: Partial<ToolDefinition>): Promise<void> {
    // Validate tool definition
    const validatedTool = ToolDefinitionSchema.parse(tool);
    
    try {
      // Store in PostgreSQL
      
      // Transform and create node in Neo4j
      const transformedTool = this.transformValidatedToToolDefinition(validatedTool);
      await this.neo4j.createToolNode(transformedTool as ToolDefinition);

      // Create TypeORM ToolDefinition entity for enhanced tracking
      const toolManagement = await this.getToolManagementService();
      await toolManagement.createTool({
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
        const toolManagement = await this.getToolManagementService();
        await toolManagement.deleteTool(tool.id);
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
      await this.neo4j.updateToolNode(validatedId, transformedUpdates);

      // Update TypeORM entity
      const toolManagement = await this.getToolManagementService();
      await toolManagement.updateTool(validatedId, {
        ...validatedUpdates,
        updatedAt: new Date()
      });
      
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
      await this.neo4j.deleteToolNode(validatedId);

      // Remove TypeORM entity
      const toolManagement = await this.getToolManagementService();
      await toolManagement.deleteTool(validatedId);
      
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
    const tool = await this.postgresql.getTool(validatedId);
    return tool ? this.transformEntityToInterface(tool) : null;
  }

  async lookup(toolName: string): Promise<ToolDefinition | null> {
    await this.ensureInitialized();
    const validatedName = z.string().parse(toolName);
    
    try {
      // First try exact name match
      const tools = await this.getTools();
      let tool = tools.find(t => t.name === validatedName && t.isEnabled);
      
      if (!tool) {
        // Try case-insensitive match
        tool = tools.find(t => t.name.toLowerCase() === validatedName.toLowerCase() && t.isEnabled);
      }
      
      if (!tool) {
        // Try partial match in name or tags
        tool = tools.find(t => 
          (t.name.toLowerCase().includes(validatedName.toLowerCase()) || 
           t.tags.some(tag => tag.toLowerCase().includes(validatedName.toLowerCase()))) &&
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
    const filters: any = {};
    logger.info(`Getting tools with category: ${category}, enabled: ${enabled}`);
    if (category) filters.category = category;
    if (enabled !== undefined) filters.enabled = enabled;
    const tools = await this.postgresql.getTools(filters);
    return tools.map(tool => this.transformEntityToInterface(tool));
  }

  async searchTools(query: string): Promise<ToolDefinition[]> {
    await this.ensureInitialized();
    const tools = await this.postgresql.searchTools(query);
    return tools.map(tool => this.transformEntityToInterface(tool));
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
    const transformedTools = tools.map(tool => this.transformEntityToInterface(tool));
    return transformedTools.filter(tool => toolIds.includes(tool.id) && tool.isEnabled);
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
      const recommendations: ToolRecommendation[] = [];
      
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
      // Test PostgreSQL connection by attempting a simple query instead of looking for a specific tool
      let postgresqlHealth = false;
      try {
        const result = await this.postgresql.healthCheck();
        postgresqlHealth = result.status === 'healthy';
      } catch {
        postgresqlHealth = false;
      }

      let neo4jHealth = false;
      try {
        await this.neo4j.verifyConnectivity();
        neo4jHealth = true;
      } catch {
        neo4jHealth = false;
      }
      
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
        duration: executionTime,
        success,
        cost: cost,
        startTime: new Date(),
        endTime: new Date(),
        metadata: metadata || {}
      };

      const toolManagement = await this.getToolManagementService();
      await toolManagement.recordToolUsage({
        toolId,
        agentId,
        executionTime,
        success,
        cost,
        metadata
      });
      
      // Update capability metrics
      await toolManagement.updateCapabilityMetrics({
        agentId,
        toolId,
        success,
        executionTime
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
      const toolManagement = await this.getToolManagementService();
      await toolManagement.updateCapabilityMetrics({
        agentId,
        toolId,
        success,
        executionTime
      });
    } catch (error) {
      logger.error(`Failed to update capability metrics:`, error);
    }
  }

  // Enhanced Analytics with TypeORM
  async getAgentCapabilityMetrics(agentId: string): Promise<AgentCapabilityMetric[]> {
    try {
      const toolManagement = await this.getToolManagementService();
      return await toolManagement.getAgentCapabilityMetrics(agentId);
    } catch (error) {
      logger.error(`Failed to get capability metrics for agent ${agentId}:`, error);
      return [];
    }
  }

  async getToolUsageStats(toolId: string, days = 30): Promise<any> {
    try {
      const toolManagement = await this.getToolManagementService();
      return await toolManagement.getToolUsageStats(toolId, days);
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
      category: this.mapStringToToolCategory(entity.category)
    };
  }

  private mapToolSecurityLevelToSecurityLevel(toolSecurityLevel: any): SecurityLevel {
    // If it's already a SecurityLevel, return as is
    if (Object.values(SecurityLevel).includes(toolSecurityLevel)) {
      return toolSecurityLevel;
    }
    
    // Map from ToolSecurityLevel to SecurityLevel
    const mapping: Record<string, SecurityLevel> = {
      'SAFE': SecurityLevel.LOW,
      'MODERATE': SecurityLevel.MEDIUM,
      'RESTRICTED': SecurityLevel.HIGH,
      'DANGEROUS': SecurityLevel.CRITICAL
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
      'api': ToolCategory.API,
      'computation': ToolCategory.COMPUTATION,
      'file-system': ToolCategory.FILE_SYSTEM,
      'database': ToolCategory.DATABASE,
      'web-search': ToolCategory.WEB_SEARCH,
      'code-execution': ToolCategory.CODE_EXECUTION,
      'communication': ToolCategory.COMMUNICATION,
      'knowledge-graph': ToolCategory.KNOWLEDGE_GRAPH,
      'deployment': ToolCategory.DEPLOYMENT,
      'monitoring': ToolCategory.MONITORING,
      'analysis': ToolCategory.ANALYSIS,
      'generation': ToolCategory.GENERATION
    };
    
    return mapping[category] || ToolCategory.API;
  }

  private transformValidatedToToolDefinition(validatedTool: any): Partial<ToolDefinition> {
    const transformed: any = { ...validatedTool };
    
    // Transform category string to ToolCategory enum
    if (transformed.category) {
      const categoryMap: Record<string, ToolCategory> = {
        'api': ToolCategory.API,
        'computation': ToolCategory.COMPUTATION,
        'file-system': ToolCategory.FILE_SYSTEM,
        'database': ToolCategory.DATABASE,
        'web-search': ToolCategory.WEB_SEARCH,
        'code-execution': ToolCategory.CODE_EXECUTION,
        'communication': ToolCategory.COMMUNICATION,
        'knowledge-graph': ToolCategory.KNOWLEDGE_GRAPH,
        'deployment': ToolCategory.DEPLOYMENT,
        'monitoring': ToolCategory.MONITORING,
        'analysis': ToolCategory.ANALYSIS,
        'generation': ToolCategory.GENERATION
      };
      transformed.category = categoryMap[transformed.category] || ToolCategory.API;
    }
    
    // Transform securityLevel string to SecurityLevel enum
    if (transformed.securityLevel) {
      const securityMap: Record<string, SecurityLevel> = {
        'low': SecurityLevel.LOW,
        'medium': SecurityLevel.MEDIUM,
        'high': SecurityLevel.HIGH,
        'critical': SecurityLevel.CRITICAL
      };
      transformed.securityLevel = securityMap[transformed.securityLevel] || SecurityLevel.MEDIUM;
    }
    
    // Transform examples to proper ToolExample format
    if (transformed.examples && Array.isArray(transformed.examples)) {
      transformed.examples = transformed.examples.map((example: any, index: number) => ({
        name: example.name || `Example ${index + 1}`,
        description: example.description || `Example usage ${index + 1}`,
        input: example.input || example.parameters || {},
        expectedOutput: example.expectedOutput || example.output || 'Expected output'
      }));
    }
    
    return transformed;
  }
} 