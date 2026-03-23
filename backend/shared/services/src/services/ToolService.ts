import { Repository } from 'typeorm';
import { logger } from '@uaip/utils';
import { BaseDomainService } from './BaseDomainService';
import {
  ToolRepository,
  ToolExecutionRepository,
  ToolUsageRepository,
} from '../database/repositories/ToolRepository';
import { ToolDefinition } from '../entities/toolDefinition.entity';
import { ToolExecution } from '../entities/toolExecution.entity';
import { ToolUsageRecord } from '../entities/toolUsageRecord.entity';
import { ToolAssignment } from '../entities/toolAssignment.entity';
import { SecurityLevel, ToolExecutionStatus, ToolCategory } from '@uaip/types';
import { RedisCacheService } from '../redis-cache.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';

export class ToolService extends BaseDomainService {
  private redisService: RedisCacheService;
  private knowledgeGraphService: KnowledgeGraphService | null = null;

  protected constructor() {
    super();
    this.redisService = RedisCacheService.getInstance();
  }

  public static getInstance(): ToolService {
    return BaseDomainService.resolve<ToolService>(ToolService);
  }

  public getToolRepository(): ToolRepository {
    return this.getRepository('toolRepo', () => new ToolRepository());
  }

  public getToolExecutionRepository(): ToolExecutionRepository {
    return this.getRepository('toolExecRepo', () => new ToolExecutionRepository());
  }

  public getToolUsageRepository(): ToolUsageRepository {
    return this.getRepository('toolUsageRepo', () => new ToolUsageRepository());
  }

  public getToolAssignmentRepository(): Repository<ToolAssignment> {
    return this.getRepository('toolAssignRepo', () =>
      this.typeormService.getRepository(ToolAssignment)
    );
  }

  // Tool definition operations
  public async createTool(data: {
    name: string;
    displayName: string;
    description: string;
    category: ToolCategory;
    isEnabled?: boolean;
    version?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    configuration?: Record<string, unknown>;
    requiredPermissions?: string[];
    securityLevel?: SecurityLevel;
    maxRetries?: number;
    timeout?: number;
  }): Promise<ToolDefinition> {
    const toolRepo = this.getToolRepository();
    return await toolRepo.createTool({
      ...data,
      isEnabled: data.isEnabled ?? true,
      version: data.version || '1.0.0',
      securityLevel: data.securityLevel || SecurityLevel.MEDIUM,
    });
  }

  public async findToolByName(name: string): Promise<ToolDefinition | null> {
    const tools = await this.getToolRepository().findMany({ name });
    return tools.length > 0 ? tools[0] : null;
  }

  public async findToolById(id: string): Promise<ToolDefinition | null> {
    return await this.getToolRepository().findById(id);
  }

  public async findActiveTools(): Promise<ToolDefinition[]> {
    return await this.getToolRepository().getTools({ enabled: true });
  }

  public async findToolsByCategory(category: string): Promise<ToolDefinition[]> {
    return await this.getToolRepository().getTools({ category });
  }

  public async updateTool(
    id: string,
    data: Partial<ToolDefinition>
  ): Promise<ToolDefinition | null> {
    await this.getToolRepository().update(id, data);
    return await this.findToolById(id);
  }

  public async deactivateTool(id: string): Promise<boolean> {
    const result = await this.getToolRepository().update(id, { isEnabled: false });
    return result !== null;
  }

  // Tool execution operations
  public async createExecution(data: {
    toolId: string;
    agentId?: string;
    userId?: string;
    input: Record<string, unknown>;
    context?: Record<string, unknown>;
    traceId?: string;
  }): Promise<ToolExecution> {
    const executionRepo = this.getToolExecutionRepository();
    return await executionRepo.createToolExecution({
      toolId: data.toolId,
      agentId: data.agentId || '',
      parameters: data.input,
      status: ToolExecutionStatus.PENDING,
      startTime: new Date(),
      approvalRequired: false,
      success: false,
      retryCount: 0,
      maxRetries: 3,
    });
  }

  public async updateExecution(
    id: string,
    data: {
      status?: ToolExecutionStatus;
      output?: Record<string, unknown>;
      error?: string;
      metadata?: Record<string, unknown>;
      duration?: number;
    }
  ): Promise<ToolExecution | null> {
    const updates: Partial<ToolExecution> & { endTime?: Date } = {
      status: data.status,
      result: data.output,
      error: data.error
        ? {
            type: 'execution',
            message: data.error,
            details: data.metadata,
            recoverable: false,
          }
        : undefined,
      metadata: data.metadata,
      executionTimeMs: data.duration,
    };

    if (
      data.status === ToolExecutionStatus.COMPLETED ||
      data.status === ToolExecutionStatus.FAILED
    ) {
      updates.endTime = new Date();
    }

    await this.getToolExecutionRepository().update(id, updates);
    return await this.getToolExecutionRepository().getToolExecution(id);
  }

  public async findExecutionById(id: string): Promise<ToolExecution | null> {
    return await this.getToolExecutionRepository().getToolExecution(id);
  }

  public async findExecutionsByTool(toolId: string, limit?: number): Promise<ToolExecution[]> {
    return await this.getToolExecutionRepository().getToolExecutions({
      toolId,
      limit: limit || 100,
    });
  }

  public async findExecutionsByAgent(agentId: string, limit?: number): Promise<ToolExecution[]> {
    return await this.getToolExecutionRepository().getToolExecutions({
      agentId,
      limit: limit || 100,
    });
  }

  // Tool usage tracking
  public async trackUsage(data: {
    toolId: string;
    agentId?: string;
    userId?: string;
    executionId?: string;
    inputTokens?: number;
    outputTokens?: number;
    executionTime?: number;
    success: boolean;
    error?: string;
  }): Promise<ToolUsageRecord> {
    const usageRepo = this.getToolUsageRepository();
    return await usageRepo.recordToolUsage({
      toolId: data.toolId,
      agentId: data.agentId || '',
      executionTimeMs: data.executionTime || 0,
      success: data.success,
      error: data.error,
      usedAt: new Date(),
    });
  }

  public async getToolUsageStats(toolId: string, days: number = 30): Promise<unknown> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const usageRepo = this.getToolUsageRepository();
    return await usageRepo.getToolUsageStats({
      toolId,
      days,
    });
  }

  // Tool assignment operations
  public async assignToolToAgent(
    agentId: string,
    toolId: string,
    permissions: {
      canExecute?: boolean;
      canRead?: boolean;
      customConfig?: Record<string, unknown>;
    } = {}
  ): Promise<ToolAssignment> {
    const assignmentRepo = this.getToolAssignmentRepository();

    // Check if assignment already exists
    const existing = await assignmentRepo.findOne({
      where: { agent: { id: agentId }, tool: { id: toolId } },
    });

    if (existing) {
      // Update existing assignment
      await assignmentRepo.update(existing.id, {
        canExecute: permissions.canExecute ?? existing.canExecute,
        canRead: permissions.canRead ?? existing.canRead,
        customConfig: permissions.customConfig ?? existing.customConfig,
      });
      return (await assignmentRepo.findOne({ where: { id: existing.id } })) as ToolAssignment;
    }

    // Create new assignment
    const assignment = assignmentRepo.create({
      agent: { id: agentId },
      tool: { id: toolId },
      canExecute: permissions.canExecute ?? true,
      canRead: permissions.canRead ?? true,
      customConfig: permissions.customConfig,
    });

    return await assignmentRepo.save(assignment);
  }

  public async removeToolFromAgent(agentId: string, toolId: string): Promise<boolean> {
    const result = await this.getToolAssignmentRepository().delete({
      agent: { id: agentId },
      tool: { id: toolId },
    });
    return result.affected !== 0;
  }

  public async getAgentTools(agentId: string): Promise<ToolAssignment[]> {
    return await this.getToolAssignmentRepository().find({
      where: { agent: { id: agentId } },
      relations: ['tool'],
    });
  }

  // Bulk operations
  public async createBulkTools(tools: Array<Partial<ToolDefinition>>): Promise<ToolDefinition[]> {
    const toolRepo = this.getToolRepository();
    const results: ToolDefinition[] = [];
    for (const tool of tools) {
      // eslint-disable-next-line no-await-in-loop
      const created = await toolRepo.createTool(tool);
      results.push(created);
    }
    return results;
  }

  public async deactivateToolsByCategory(category: string): Promise<number> {
    const tools = await this.getToolRepository().getTools({ category });
    let count = 0;
    for (const tool of tools) {
      // eslint-disable-next-line no-await-in-loop
      await this.getToolRepository().update(tool.id, { isEnabled: false });
      count++;
    }
    return count;
  }

  // Tool execution operations
  public async createToolExecution(execution: Partial<ToolExecution>): Promise<ToolExecution> {
    const executionRepo = this.getToolExecutionRepository();
    return await executionRepo.createToolExecution(execution);
  }

  public async getToolExecution(executionId: string): Promise<ToolExecution | null> {
    const executionRepo = this.getToolExecutionRepository();
    return await executionRepo.getToolExecution(executionId);
  }

  public async updateToolExecution(
    executionId: string,
    updates: Partial<ToolExecution>
  ): Promise<void> {
    const executionRepo = this.getToolExecutionRepository();
    await executionRepo.update(executionId, updates);
  }

  // Redis service access
  public getRedisService(): RedisCacheService {
    return this.redisService;
  }

  // Knowledge graph service access (optional)
  public get neo4jService(): KnowledgeGraphService | null {
    return this.knowledgeGraphService;
  }

  // Helper methods for capability-registry compatibility
  public async getTool(toolId: string): Promise<ToolDefinition | null> {
    return this.findToolById(toolId);
  }

  public async getTools(filters: {
    enabled?: boolean;
    category?: string;
  }): Promise<ToolDefinition[]> {
    if (filters.category) {
      return this.findToolsByCategory(filters.category);
    }
    if (filters.enabled) {
      return this.findActiveTools();
    }
    return this.findActiveTools();
  }

  public async searchTools(query: string): Promise<ToolDefinition[]> {
    const tools = await this.findActiveTools();
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(query.toLowerCase()) ||
        tool.description.toLowerCase().includes(query.toLowerCase())
    );
  }

  public async recordToolUsage(usage: {
    toolId: string;
    agentId?: string;
    userId?: string;
    executionId?: string;
    inputTokens?: number;
    outputTokens?: number;
    executionTime?: number;
    success: boolean;
    error?: string;
  }): Promise<void> {
    await this.trackUsage(usage);
  }

  public async getToolExecutions(filters: {
    toolId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<ToolExecution[]> {
    if (filters.toolId) {
      return this.findExecutionsByTool(filters.toolId, filters.limit);
    }
    if (filters.agentId) {
      return this.findExecutionsByAgent(filters.agentId, filters.limit);
    }
    return [];
  }

  // Neo4j-related methods for tool relationships (using knowledge graph if available)
  public async createToolNode(tool: ToolDefinition): Promise<void> {
    if (this.knowledgeGraphService) {
      // Use knowledge graph for tool relationships
      logger.info('Creating tool node in knowledge graph', { toolId: tool.id });
    }
  }

  public async getRecommendations(
    toolId: string,
    context?: string,
    _limit = 5
  ): Promise<unknown[]> {
    if (this.knowledgeGraphService) {
      // Use knowledge graph for recommendations
      logger.info('Getting tool recommendations from knowledge graph', { toolId, context });
    }
    return [];
  }

  public async getToolRelationships(toolId: string): Promise<unknown[]> {
    if (this.knowledgeGraphService) {
      // Use knowledge graph for tool relationships
      logger.info('Getting tool relationships from knowledge graph', { toolId });
    }
    return [];
  }

  public async getToolsByCategory(category: string): Promise<ToolDefinition[]> {
    return this.findToolsByCategory(category);
  }
}
