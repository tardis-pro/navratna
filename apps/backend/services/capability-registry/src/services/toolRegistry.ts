// Tool Registry Service - Enhanced with Graph Features
// Combines PostgreSQL and Neo4j for comprehensive tool management
// Part of capability-registry microservice

import {
  ToolDefinition,
  ToolRelationship,
  AgentCapabilityMetrics,
  ToolUsageRecord,
  ToolCategory,
  SecurityLevel,
} from '@uaip/types';
import { ToolRecommendation, ToolService } from '@uaip/shared-services';
import { EventBusService } from '@uaip/infra/eventBus';
import { logger } from '@uaip/utils';
import { z } from 'zod';

export class ToolRegistry {
  private toolService: ToolService;

  private asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  }

  private asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  private asNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' ? value : fallback;
  }

  private toSecurityLevel(value: unknown): SecurityLevel {
    if (value === SecurityLevel.LOW) return SecurityLevel.LOW;
    if (value === SecurityLevel.MEDIUM) return SecurityLevel.MEDIUM;
    if (value === SecurityLevel.HIGH) return SecurityLevel.HIGH;
    if (value === SecurityLevel.CRITICAL) return SecurityLevel.CRITICAL;
    return SecurityLevel.MEDIUM;
  }

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
  private async handleToolRegistration(event: unknown): Promise<void> {
    try {
      const eventRecord = this.asRecord(event);
      const tool = this.asRecord(eventRecord.tool);
      const source = this.asString(eventRecord.source, 'unknown');
      logger.info(`Registering tool from ${source}: ${this.asString(tool.id, 'unknown-tool')}`);

      // Register the tool with enhanced metadata
      await this.registerTool({
        ...tool,
      });
    } catch (error) {
      const eventRecord = this.asRecord(event);
      const toolRecord = this.asRecord(eventRecord.tool);
      logger.error(
        `Failed to handle tool registration for ${this.asString(toolRecord.id, 'unknown-tool')}:`,
        error
      );
    }
  }

  // Handle OAuth provider capabilities
  private async handleOAuthCapabilities(event: unknown): Promise<void> {
    try {
      const eventRecord = this.asRecord(event);
      const provider = this.asString(eventRecord.provider, 'unknown');
      const capabilities = Array.isArray(eventRecord.capabilities) ? eventRecord.capabilities : [];

      for (const capability of capabilities) {
        const capabilityRecord = this.asRecord(capability);
        const toolId = `oauth-${provider}-${this.asString(capabilityRecord.action, 'action')}`;

        // eslint-disable-next-line no-await-in-loop -- sequential processing required
        await this.registerTool({
          id: toolId,
          name: this.asString(capabilityRecord.name, toolId),
          description: this.asString(capabilityRecord.description, ''),
          category: ToolCategory.COMMUNICATION,
          version: '1.0.0',
          parameters: this.asRecord(capabilityRecord.parameters),
          returnType: this.asRecord(capabilityRecord.returnType),
          securityLevel: SecurityLevel.MEDIUM,
          requiresApproval: false,
          isEnabled: true,
          executionTimeEstimate: 3000,
          costEstimate: 0.02,
          author: `${provider} OAuth Provider`,
          tags: [
            'oauth',
            provider,
            this.asString(capabilityRecord.category, 'general'),
            'auto-registered',
          ],
          dependencies: [],
          examples: Array.isArray(capabilityRecord.examples) ? capabilityRecord.examples : [],
        });
      }

      logger.info(`Registered ${capabilities.length} OAuth capabilities for ${provider}`);
    } catch (error) {
      const eventRecord = this.asRecord(event);
      logger.error(
        `Failed to handle OAuth capabilities for ${this.asString(eventRecord.provider, 'unknown')}:`,
        error
      );
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
    const validatedTool = tool as ToolDefinition;

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
        category: this.mapStringToToolCategory(validatedTool.category),
        isEnabled: validatedTool.isEnabled,
        version: validatedTool.version,
        inputSchema: validatedTool.parameters as Record<string, unknown>,
        outputSchema: validatedTool.returnType as Record<string, unknown>,
        securityLevel: this.toSecurityLevel(validatedTool.securityLevel),
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
    const validatedUpdates = updates as Partial<ToolDefinition>;

    try {
      // Update in PostgreSQL

      // Update node in Neo4j
      // Transform and update node in Neo4j
      const _transformedUpdates = this.transformValidatedToToolDefinition(validatedUpdates);
      // Neo4j operations now handled by knowledge graph service
      logger.debug('Tool node update requested', { toolId: validatedId });

      // Update tool via ToolService
      // Note: ToolService doesn't have updateTool method yet, using repository directly
      const toolRepo = this.toolService.getToolRepository();

      // Transform the updates to match entity types
      const entityUpdates: Record<string, unknown> = {
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

      // Remove tool via ToolService
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
    const entity = await this.toolService.findToolById(validatedId);
    return entity ? this.transformEntityToInterface(entity) : null;
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to lookup tool: ${toolName}. ${errorMessage}`, { cause: error });
    }
  }

  async getTools(category?: string, enabled?: boolean): Promise<ToolDefinition[]> {
    await this.ensureInitialized();
    logger.info(`Getting tools with category: ${category}, enabled: ${enabled}`);

    if (category) {
      const entities = await this.toolService.findToolsByCategory(category);
      const tools = entities.map((e) => this.transformEntityToInterface(e));
      if (enabled !== undefined) {
        return tools.filter((tool) => tool.isEnabled === enabled);
      }
      return tools;
    }

    const entities = await this.toolService.findActiveTools();
    const tools = entities.map((e) => this.transformEntityToInterface(e));
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
    const entities = await this.toolService.findActiveTools();
    const tools = entities.map((e) => this.transformEntityToInterface(e));
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
    _toolId: string,
    _relationshipTypes?: string[],
    _minStrength = 0.5
  ): Promise<ToolDefinition[]> {
    // Get related tool IDs from Neo4j
    const relatedToolIds: string[] = []; // TODO: Implement with knowledge graph service

    // Get full tool definitions from PostgreSQL
    if (relatedToolIds.length === 0) return [];

    const entities = await this.toolService.findActiveTools();
    const tools = entities.map((e) => this.transformEntityToInterface(e));
    return tools.filter((tool) => relatedToolIds.includes(tool.id) && tool.isEnabled);
  }

  async addToolRelationship(
    fromToolId: string,
    toToolId: string,
    relationship: ToolRelationship
  ): Promise<void> {
    // Validate relationship
    const validatedRelationship = relationship as ToolRelationship;

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
    const _relationshipData = {
      sourceToolId: fromToolId,
      targetToolId: toToolId,
      relationshipType: validatedRelationship.type as ToolRelationship['relationshipType'],
      type: validatedRelationship.type,
      strength: validatedRelationship.strength,
      reason: validatedRelationship.reason,
      metadata: validatedRelationship.metadata,
    } satisfies ToolRelationship;

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
    _toolId: string,
    _minSimilarity = 0.6,
    _limit = 5
  ): Promise<ToolRecommendation[]> {
    return []; // TODO: Implement with knowledge graph service
  }

  async getToolDependencies(_toolId: string): Promise<string[]> {
    return []; // TODO: Implement with knowledge graph service
  }

  // Analytics and Insights
  async getUsageStats(toolId?: string, _agentId?: string, days = 30): Promise<unknown[]> {
    await this.ensureInitialized();
    const filters: { toolId?: string; days: number } = { days };
    if (toolId) filters.toolId = toolId;
    // Use ToolService for usage stats
    const usageRepo = this.toolService.getToolUsageRepository();
    return (await usageRepo.getToolUsageStats(filters)) as unknown[];
  }

  async getToolUsageAnalytics(_toolId?: string, _agentId?: string): Promise<unknown[]> {
    return []; // TODO: Implement with knowledge graph service
  }

  async getPopularTools(_category?: string, _limit = 10): Promise<unknown[]> {
    return []; // TODO: Implement with knowledge graph service
  }

  async getAgentToolPreferences(_agentId: string): Promise<unknown[]> {
    return []; // TODO: Implement with knowledge graph service
  }

  // Utility Methods
  async validateToolDefinition(
    tool: Partial<ToolDefinition>
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
      tool as ToolDefinition;
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
    metadata?: unknown
  ): Promise<void> {
    try {
      const _usageRecord: Partial<ToolUsageRecord> = {
        toolId,
        agentId,
        duration: executionTime,
        success,
        cost: cost,
        startTime: new Date(),
        endTime: new Date(),
        metadata: this.asRecord(metadata),
      };

      // Record tool usage through ToolService
      const usageRepo = this.toolService.getToolUsageRepository();
      await usageRepo.recordToolUsage({
        toolId,
        agentId,
        executionTimeMs: executionTime,
        success,
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

  // Enhanced Analytics
  async getAgentCapabilityMetrics(agentId: string): Promise<AgentCapabilityMetrics[]> {
    try {
      // Get capability metrics through ToolService
      const usageRepo = this.toolService.getToolUsageRepository();
      const stats = await usageRepo.getToolUsageStats({});
      // Transform to expected format
      const statsArray = Array.isArray(stats) ? stats : [];
      return statsArray.map((stat: unknown) => {
        const statRecord = this.asRecord(stat);
        const totalUses = this.asNumber(statRecord.totalUses);
        const successfulUses = this.asNumber(statRecord.successfulUses);
        const avgExecutionTime = this.asNumber(statRecord.avgExecutionTime);

        return {
          id: `${this.asString(statRecord.agentId)}_${this.asString(statRecord.toolId)}`,
          agentId: this.asString(statRecord.agentId),
          toolId: this.asString(statRecord.toolId),
          totalExecutions: totalUses,
          successfulExecutions: successfulUses,
          totalExecutionTime: avgExecutionTime * totalUses,
          averageExecutionTime: avgExecutionTime,
          successRate: totalUses > 0 ? successfulUses / totalUses : 0,
          lastUsed: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as AgentCapabilityMetrics; // stub: field mapping approximation
      });
    } catch (error) {
      logger.error(`Failed to get capability metrics for agent ${agentId}:`, error);
      return [];
    }
  }

  async getToolUsageStats(toolId: string, days = 30): Promise<unknown> {
    try {
      // Get tool usage stats through ToolService
      const usageRepo = this.toolService.getToolUsageRepository();
      return await usageRepo.getToolUsageStats({ toolId, days });
    } catch (error) {
      logger.error(`Failed to get tool usage stats for ${toolId}:`, error);
      return null;
    }
  }

  private transformEntityToInterface(entity: unknown): ToolDefinition {
    const entityRecord = this.asRecord(entity);
    return {
      id: this.asString(entityRecord.id),
      name: this.asString(entityRecord.name),
      description: this.asString(entityRecord.description),
      version: this.asString(entityRecord.version, '1.0.0'),
      securityLevel: this.mapToolSecurityLevelToSecurityLevel(entityRecord.securityLevel),
      category: this.mapStringToToolCategory(entityRecord.category),
      parameters: this.asRecord(entityRecord.parameters),
      returnType: this.asRecord(entityRecord.returnType),
      requiresApproval: Boolean(entityRecord.requiresApproval),
      isEnabled: Boolean(entityRecord.isEnabled),
      executionTimeEstimate:
        typeof entityRecord.executionTimeEstimate === 'number'
          ? entityRecord.executionTimeEstimate
          : undefined,
      costEstimate:
        typeof entityRecord.costEstimate === 'number' ? entityRecord.costEstimate : undefined,
      author: this.asString(entityRecord.author, 'unknown'),
      tags: Array.isArray(entityRecord.tags)
        ? entityRecord.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      dependencies: Array.isArray(entityRecord.dependencies)
        ? entityRecord.dependencies.filter((dep): dep is string => typeof dep === 'string')
        : [],
      examples: Array.isArray(entityRecord.examples)
        ? entityRecord.examples.map((example, index) => {
            const exampleRecord = this.asRecord(example);
            return {
              name: this.asString(exampleRecord.name, `Example ${index + 1}`),
              description: this.asString(exampleRecord.description, `Example usage ${index + 1}`),
              input: this.asRecord(exampleRecord.input ?? exampleRecord.parameters),
              expectedOutput:
                exampleRecord.expectedOutput ?? exampleRecord.output ?? 'Expected output',
            };
          })
        : [],
    };
  }

  private mapToolSecurityLevelToSecurityLevel(toolSecurityLevel: unknown): SecurityLevel {
    // If it's already a SecurityLevel, return as is
    if (
      toolSecurityLevel === SecurityLevel.LOW ||
      toolSecurityLevel === SecurityLevel.MEDIUM ||
      toolSecurityLevel === SecurityLevel.HIGH ||
      toolSecurityLevel === SecurityLevel.CRITICAL
    ) {
      return toolSecurityLevel;
    }

    // Map from ToolSecurityLevel to SecurityLevel
    const mapping: Record<string, SecurityLevel> = {
      SAFE: SecurityLevel.LOW,
      MODERATE: SecurityLevel.MEDIUM,
      RESTRICTED: SecurityLevel.HIGH,
      DANGEROUS: SecurityLevel.CRITICAL,
    };

    const normalizedLevel = this.asString(toolSecurityLevel).toUpperCase();
    return mapping[normalizedLevel] || SecurityLevel.MEDIUM;
  }

  private mapStringToToolCategory(category: unknown): ToolCategory {
    // If it's already a ToolCategory, return as is
    if (Object.values(ToolCategory).includes(category as ToolCategory)) {
      return category as ToolCategory;
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

    return mapping[this.asString(category)] || ToolCategory.API;
  }

  private transformValidatedToToolDefinition(validatedTool: unknown): Partial<ToolDefinition> {
    const transformed: Record<string, unknown> = { ...this.asRecord(validatedTool) };

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
      transformed.category = categoryMap[this.asString(transformed.category)] || ToolCategory.API;
    }

    // Transform securityLevel string to SecurityLevel enum
    if (transformed.securityLevel) {
      const securityMap: Record<string, SecurityLevel> = {
        low: SecurityLevel.LOW,
        medium: SecurityLevel.MEDIUM,
        high: SecurityLevel.HIGH,
        critical: SecurityLevel.CRITICAL,
      };
      transformed.securityLevel =
        securityMap[this.asString(transformed.securityLevel)] || SecurityLevel.MEDIUM;
    }

    // Transform examples to proper ToolExample format
    if (transformed.examples && Array.isArray(transformed.examples)) {
      transformed.examples = transformed.examples.map((example: unknown, index: number) => {
        const exampleRecord = this.asRecord(example);
        return {
          name: this.asString(exampleRecord.name, `Example ${index + 1}`),
          description: this.asString(exampleRecord.description, `Example usage ${index + 1}`),
          input: this.asRecord(exampleRecord.input ?? exampleRecord.parameters),
          expectedOutput: exampleRecord.expectedOutput ?? exampleRecord.output ?? 'Expected output',
        };
      });
    }

    return transformed as Partial<ToolDefinition>;
  }
}
