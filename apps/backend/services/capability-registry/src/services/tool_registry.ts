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
import { EventBusService } from '@uaip/infra';
import { logger, DatabaseError, NotFoundError } from '@uaip/utils';
import { z } from 'zod';

function getDisplayName(tool: Partial<ToolDefinition>): string {
  const candidate = (tool as { displayName?: unknown }).displayName;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : (tool.name ?? '');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const toolCategoryValues = new Set<unknown>(Object.values(ToolCategory));
function isToolCategory(v: unknown): v is ToolCategory {
  return toolCategoryValues.has(v);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ToolRegistry {
  private toolService: ToolService;

  private asRecord(value: unknown): Record<string, unknown> {
    if (isRecord(value)) return value;
    return {};
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
  /**
   * The event bus hands handlers an envelope and puts the published payload under
   * `data`, so reading `tool` off the top level always missed and registered an
   * empty object — silently creating nameless rows instead of the discovered
   * tools. The un-enveloped shape is still accepted for direct callers.
   */
  private toolRegistrationPayload(event: unknown): Record<string, unknown> {
    const envelope = this.asRecord(event);
    const inner = this.asRecord(envelope.data);
    return 'tool' in inner ? inner : envelope;
  }

  private async handleToolRegistration(event: unknown): Promise<void> {
    const payload = this.toolRegistrationPayload(event);
    const tool = this.asRecord(payload.tool);

    // A tool with no name cannot be dispatched or de-duplicated (the row name is
    // the dispatch key and is UNIQUE), so registering it would only create junk.
    if (!this.asString(tool.name)) {
      logger.warn('Ignoring tool.register event with no named tool', {
        source: this.asString(payload.source, 'unknown'),
      });
      return;
    }

    try {
      const source = this.asString(payload.source, 'unknown');
      logger.info(`Registering tool from ${source}: ${this.asString(tool.name, 'unknown-tool')}`);

      await this.registerTool({ ...tool });
    } catch (error) {
      logger.error(
        `Failed to handle tool registration for ${this.asString(tool.name, 'unknown-tool')}:`,
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
  /**
   * `name` is the dispatch key (BaseToolExecutor switches on it, and
   * UnifiedToolRegistry resolves non-uuid ids through findToolByName), so it must
   * be persisted verbatim. `displayName` is the human label and may differ.
   */
  async registerTool(tool: Partial<ToolDefinition>): Promise<string> {
    try {
      // Transform and create node in Neo4j
      const transformedTool = this.transformValidatedToToolDefinition(tool);
      // Neo4j operations now handled by knowledge graph service
      logger.debug('Tool node creation requested', { toolId: transformedTool.id });

      // Use ToolService for tool management
      // Discovery re-runs on every server start and on tools/list_changed, and
      // tool_definitions.name is UNIQUE, so a plain insert would throw on the second
      // pass and abort registration for the rest of the server's tools.
      const existing = tool.name ? await this.toolService.findToolByName(tool.name) : null;
      if (existing) {
        const existingId = typeof existing.id === 'string' ? existing.id : '';
        await this.toolService.updateTool(existingId, {
          description: tool.description ?? '',
          parameters: isRecord(tool.parameters) ? tool.parameters : {},
          returnType: isRecord(tool.returnType) ? tool.returnType : {},
          isEnabled: tool.isEnabled ?? true,
          version: tool.version ?? '1.0.0',
        });
        logger.info(`Tool re-registered (updated): ${tool.name}`);
        return existingId;
      }

      const created = await this.toolService.createTool({
        name: tool.name ?? '',
        displayName: getDisplayName(tool),
        description: tool.description ?? '',
        category: this.mapStringToToolCategory(tool.category),
        isEnabled: tool.isEnabled,
        version: tool.version ?? '1.0.0',
        inputSchema: isRecord(tool.parameters) ? tool.parameters : {},
        outputSchema: isRecord(tool.returnType) ? tool.returnType : {},
        securityLevel: this.toSecurityLevel(tool.securityLevel),
        author: tool.author,
        tags: tool.tags,
        requiresApproval: tool.requiresApproval,
        dependencies: tool.dependencies,
        examples: tool.examples,
        executionTimeEstimate: tool.executionTimeEstimate,
      });

      const createdId = typeof created.id === 'string' ? created.id : '';
      logger.info(`Tool registered successfully: ${createdId || tool.id}`);
      return createdId;
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

    try {
      // Update node in Neo4j
      // Transform and update node in Neo4j
      const _transformedUpdates = this.transformValidatedToToolDefinition(updates);
      // Neo4j operations now handled by knowledge graph service
      logger.debug('Tool node update requested', { toolId: validatedId });

      // Update tool via ToolService
      // Note: ToolService doesn't have updateTool method yet, using repository directly
      const toolRepo = this.toolService.getToolRepository();

      // Transform the updates to match entity types
      const entityUpdates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (updates.name) entityUpdates.name = updates.name;
      if (updates.description) entityUpdates.description = updates.description;
      if (updates.version) entityUpdates.version = updates.version;
      if (updates.category) entityUpdates.category = updates.category;
      if (updates.isEnabled !== undefined) entityUpdates.isEnabled = updates.isEnabled;
      if (updates.securityLevel) entityUpdates.securityLevel = updates.securityLevel;

      await toolRepo.updateTool(validatedId, entityUpdates);

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
      await toolRepo.deleteTool(validatedId);

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
    // Callers address native tools by their stable name ("http-request",
    // "shell-exec") as well as by the generated UUID — the HTTP route takes the
    // identifier straight from the URL. findToolById issues a `WHERE id = $1`
    // against a uuid column, so a name argument raises a Postgres cast error
    // instead of returning null. Resolve by name in that case, matching
    // UnifiedToolRegistry.executeTool.
    const entity = UUID_PATTERN.test(validatedId)
      ? await this.toolService.findToolById(validatedId)
      : await this.toolService.findToolByName(validatedId);
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
      throw new DatabaseError(`Failed to lookup tool: ${toolName}. ${errorMessage}`, { cause: error });
    }
  }

  async getTools(category?: string, enabled?: boolean): Promise<ToolDefinition[]> {
    await this.ensureInitialized();
    logger.info(`Getting tools with category: ${category}, enabled: ${enabled}`);

    if (category) {
      const entities = await this.toolService.findToolsByCategory(this.mapStringToToolCategory(category));
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
    // Verify both tools exist
    const fromTool = await this.getTool(fromToolId);
    const toTool = await this.getTool(toToolId);

    if (!fromTool) {
      throw new NotFoundError(`Source tool not found: ${fromToolId}`);
    }
    if (!toTool) {
      throw new NotFoundError(`Target tool not found: ${toToolId}`);
    }

    // Create the relationship object with validated data
    const _relationshipData = {
      sourceToolId: fromToolId,
      targetToolId: toToolId,
      relationshipType: relationship.relationshipType,
      type: relationship.type,
      strength: relationship.strength,
      reason: relationship.reason,
      metadata: relationship.metadata,
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
      const uniqueRecommendations = recommendations.reduce<ToolRecommendation[]>((acc, current) => {
        const existing = acc.find((r) => r.toolId === current.toolId);
        if (!existing || current.score > existing.score) {
          return [...acc.filter((r) => r.toolId !== current.toolId), current];
        }
        return acc;
      }, []);

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
    return [await usageRepo.getToolUsageStats(filters)];
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
    _tool: Partial<ToolDefinition>
  ): Promise<{ valid: boolean; errors: string[] }> {
    try {
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
        const tools = await this.toolService.getToolRepository().getTools({});
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

        const successRate = totalUses > 0 ? successfulUses / totalUses : 0;
        const metrics: AgentCapabilityMetrics = {
          id: `${this.asString(statRecord.agentId)}_${this.asString(statRecord.toolId)}`,
          agentId: this.asString(statRecord.agentId),
          capabilityId: this.asString(statRecord.toolId),
          performanceMetrics: {
            successRate,
            averageExecutionTime: avgExecutionTime,
            errorRate: 1 - successRate,
            resourceUtilization: 0,
          },
          usageMetrics: {
            totalExecutions: totalUses,
            uniqueContexts: 0,
            peakConcurrency: 0,
            lastUsed: new Date(),
          },
          qualityMetrics: {
            accuracy: successRate,
            reliability: successRate,
            consistency: 1,
            adaptability: 1,
          },
          securityMetrics: {
            authorizationSuccess: 1,
            validationRate: 1,
            complianceScore: 1,
            riskLevel: 'low',
          },
          timestamp: new Date(),
        };
        return metrics;
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
    if (isToolCategory(category)) {
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

    return this.recordToPartialToolDefinition(transformed);
  }

  private recordToPartialToolDefinition(r: Record<string, unknown>): Partial<ToolDefinition> {
    const result: Partial<ToolDefinition> = {};
    if (typeof r.id === 'string') result.id = r.id;
    if (typeof r.name === 'string') result.name = r.name;
    if (typeof r.description === 'string') result.description = r.description;
    if (isToolCategory(r.category)) result.category = r.category;
    if (isRecord(r.parameters)) result.parameters = r.parameters;
    if (isRecord(r.returnType)) result.returnType = r.returnType;
    if (Array.isArray(r.examples)) {
      result.examples = r.examples.map((ex, i) => {
        const exRec = isRecord(ex) ? ex : {};
        return {
          name: typeof exRec.name === 'string' ? exRec.name : `Example ${i + 1}`,
          description: typeof exRec.description === 'string' ? exRec.description : `Example usage ${i + 1}`,
          input: isRecord(exRec.input) ? exRec.input : {},
          expectedOutput: exRec.expectedOutput ?? exRec.output ?? 'Expected output',
        };
      });
    }
    if (typeof r.securityLevel === 'string') {
      result.securityLevel = this.toSecurityLevel(r.securityLevel);
    }
    if (typeof r.costEstimate === 'number') result.costEstimate = r.costEstimate;
    if (typeof r.executionTimeEstimate === 'number') result.executionTimeEstimate = r.executionTimeEstimate;
    if (typeof r.requiresApproval === 'boolean') result.requiresApproval = r.requiresApproval;
    if (Array.isArray(r.dependencies)) {
      result.dependencies = r.dependencies.filter((d): d is string => typeof d === 'string');
    }
    if (typeof r.version === 'string') result.version = r.version;
    if (typeof r.author === 'string') result.author = r.author;
    if (Array.isArray(r.tags)) {
      result.tags = r.tags.filter((t): t is string => typeof t === 'string');
    }
    if (typeof r.isEnabled === 'boolean') result.isEnabled = r.isEnabled;
    return result;
  }
}
