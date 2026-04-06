import { logger } from '@uaip/utils';
import { BaseDomainService } from './base_domain_service';
import {
  ToolRepository,
  ToolExecutionRepository,
  ToolExecutionRow,
  ToolUsageRepository,
  ToolAssignmentRepository,
  BaseCreateToolParams,
} from '../database/repositories/tool_repository';
import { SecurityLevel, ToolExecutionStatus, ToolCategory } from '@uaip/types';
import { RedisCacheService } from '../redis_cache_service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge_graph_service';
import { getControlPool } from '../database/drizzle/clients/index';

type ToolUsageData = {
  toolId: string;
  agentId?: string;
  userId?: string;
  executionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  executionTime?: number;
  success: boolean;
  error?: string;
};

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

  public getToolAssignmentRepository(): ToolAssignmentRepository {
    return this.getRepository('toolAssignRepo', () => new ToolAssignmentRepository());
  }

  public async createTool(data: BaseCreateToolParams & { displayName: string; category: ToolCategory; securityLevel?: SecurityLevel }): Promise<Record<string, unknown>> {
    const toolRepo = this.getToolRepository();
    return await toolRepo.createTool({
      name: data.name,
      description: data.description,
      category: data.category,
      isEnabled: data.isEnabled ?? true,
      version: data.version || '1.0.0',
      securityLevel: data.securityLevel || SecurityLevel.MEDIUM,
    });
  }

  public async findToolByName(name: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(`SELECT * FROM tool_definitions WHERE name = $1 LIMIT 1`, [
      name,
    ]);
    return result.rows[0] ?? null;
  }

  public async findToolById(id: string): Promise<Record<string, unknown> | null> {
    const toolRepo = this.getToolRepository();
    return await toolRepo.findById(id);
  }

  public async findActiveTools(): Promise<Record<string, unknown>[]> {
    const toolRepo = this.getToolRepository();
    return await toolRepo.getTools({ enabled: true });
  }

  public async findToolsByCategory(category: ToolCategory): Promise<Record<string, unknown>[]> {
    const toolRepo = this.getToolRepository();
    return await toolRepo.getTools({ category });
  }

  public async updateTool(
    id: string,
    data: Parameters<ToolRepository['updateTool']>[1]
  ): Promise<Record<string, unknown> | null> {
    const toolRepo = this.getToolRepository();
    await toolRepo.updateTool(id, data);
    return await this.findToolById(id);
  }

  public async deactivateTool(id: string): Promise<boolean> {
    const result = await this.getToolRepository().updateTool(id, { isEnabled: false });
    return result !== null;
  }

  public async createExecution(data: {
    toolId: string;
    agentId?: string;
    userId?: string;
    input: Record<string, unknown>;
    context?: Record<string, unknown>;
    traceId?: string;
  }): Promise<Record<string, unknown>> {
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
  ): Promise<Record<string, unknown> | null> {
    const executionRepo = this.getToolExecutionRepository();
    const updates: Parameters<ToolExecutionRepository['updateExecution']>[1] = {
      status: data.status,
      result: data.output,
    };

    if (data.error) {
      updates.error = JSON.stringify({
        type: 'execution',
        message: data.error,
        details: data.metadata,
        recoverable: false,
      });
    }

    if (data.metadata) {
      updates.metadata = data.metadata;
    }

    if (data.duration) {
      updates.duration = data.duration;
    }

    if (
      data.status === ToolExecutionStatus.COMPLETED ||
      data.status === ToolExecutionStatus.FAILED
    ) {
      updates.metadata = {
        ...(updates.metadata ?? {}),
        completedAt: new Date().toISOString(),
      };
    }

    await executionRepo.updateExecution(id, updates);
    return await executionRepo.getToolExecution(id);
  }

  public async findExecutionById(id: string): Promise<Record<string, unknown> | null> {
    const executionRepo = this.getToolExecutionRepository();
    return await executionRepo.getToolExecution(id);
  }

  public async findExecutionsByTool(
    toolId: string,
    limit?: number
  ): Promise<Record<string, unknown>[]> {
    const executionRepo = this.getToolExecutionRepository();
    return await executionRepo.getToolExecutions({
      toolId,
      limit: limit || 100,
    });
  }

  public async findExecutionsByAgent(
    agentId: string,
    limit?: number
  ): Promise<Record<string, unknown>[]> {
    const executionRepo = this.getToolExecutionRepository();
    return await executionRepo.getToolExecutions({
      agentId,
      limit: limit || 100,
    });
  }

  public async trackUsage(data: ToolUsageData): Promise<Record<string, unknown>> {
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
    const usageRepo = this.getToolUsageRepository();
    return await usageRepo.getToolUsageStats({
      toolId,
      days,
    });
  }

  public async assignToolToAgent(
    agentId: string,
    toolId: string,
    permissions: {
      canExecute?: boolean;
      canRead?: boolean;
      customConfig?: Record<string, unknown>;
    } = {}
  ): Promise<Record<string, unknown>> {
    const assignmentRepo = this.getToolAssignmentRepository();
    const pool = getControlPool();

    const existing = await assignmentRepo.findByAgentAndTool(agentId, toolId);

    if (existing) {
      await pool.query(
        `UPDATE tool_assignments SET is_enabled = $1, configuration = $2 WHERE id = $3`,
        [
          permissions.canExecute ?? true,
          JSON.stringify({
            canRead: permissions.canRead ?? true,
            customConfig: permissions.customConfig,
          }),
          existing.id,
        ]
      );
      return await assignmentRepo.findByAgentAndTool(agentId, toolId);
    }

    const result = await pool.query(
      `INSERT INTO tool_assignments (tool_id, agent_id, is_enabled, configuration)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        toolId,
        agentId,
        permissions.canExecute ?? true,
        JSON.stringify({
          canRead: permissions.canRead ?? true,
          customConfig: permissions.customConfig,
        }),
      ]
    );
    return result.rows[0];
  }

  public async removeToolFromAgent(agentId: string, toolId: string): Promise<boolean> {
    const pool = getControlPool();
    const result = await pool.query(
      `DELETE FROM tool_assignments WHERE agent_id = $1 AND tool_id = $2`,
      [agentId, toolId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async getAgentTools(agentId: string): Promise<Record<string, unknown>[]> {
    const assignmentRepo = this.getToolAssignmentRepository();
    return await assignmentRepo.findByAgent(agentId);
  }

  public async createBulkTools(
    tools: Array<Record<string, unknown>>
  ): Promise<Record<string, unknown>[]> {
    const toolRepo = this.getToolRepository();
    const results: Record<string, unknown>[] = [];
    for (const tool of tools) {
      const created = await toolRepo.createTool(tool as Parameters<typeof toolRepo.createTool>[0]);
      results.push(created);
    }
    return results;
  }

  public async deactivateToolsByCategory(category: ToolCategory): Promise<number> {
    const tools = await this.getToolRepository().getTools({ category });
    let count = 0;
    for (const tool of tools) {
      await this.getToolRepository().updateTool(tool.id, { isEnabled: false });
      count++;
    }
    return count;
  }

  public async createToolExecution(
    execution: Partial<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    const executionRepo = this.getToolExecutionRepository();
    return await executionRepo.createToolExecution(
      execution as Parameters<typeof executionRepo.createToolExecution>[0]
    );
  }

  public async getToolExecution(executionId: string): Promise<ToolExecutionRow | null> {
    const executionRepo = this.getToolExecutionRepository();
    return await executionRepo.getToolExecution(executionId);
  }

  public async updateToolExecution(
    executionId: string,
    updates: Parameters<ToolExecutionRepository['updateExecution']>[1]
  ): Promise<void> {
    const executionRepo = this.getToolExecutionRepository();
    await executionRepo.updateExecution(executionId, updates);
  }

  public getRedisService(): RedisCacheService {
    return this.redisService;
  }

  public get neo4jService(): KnowledgeGraphService | null {
    return this.knowledgeGraphService;
  }

  public async getTool(toolId: string): Promise<Record<string, unknown> | null> {
    return this.findToolById(toolId);
  }

  public async getTools(filters: {
    enabled?: boolean;
    category?: ToolCategory;
  }): Promise<Record<string, unknown>[]> {
    if (filters.category) {
      return this.findToolsByCategory(filters.category);
    }
    if (filters.enabled) {
      return this.findActiveTools();
    }
    return this.findActiveTools();
  }

  public async searchTools(query: string): Promise<Record<string, unknown>[]> {
    const tools = await this.findActiveTools();
    const q = query.toLowerCase();
    return tools.filter(
      (tool) =>
        (typeof tool.name === 'string' && tool.name.toLowerCase().includes(q)) ||
        (typeof tool.description === 'string' && tool.description.toLowerCase().includes(q))
    );
  }

  public async recordToolUsage(usage: ToolUsageData): Promise<void> {
    await this.trackUsage(usage);
  }

  public async getToolExecutions(filters: {
    toolId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    if (filters.toolId) {
      return this.findExecutionsByTool(filters.toolId, filters.limit);
    }
    if (filters.agentId) {
      return this.findExecutionsByAgent(filters.agentId, filters.limit);
    }
    return [];
  }

  public async createToolNode(tool: Record<string, unknown>): Promise<void> {
    if (this.knowledgeGraphService) {
      logger.info('Creating tool node in knowledge graph', { toolId: tool.id });
    }
  }

  public async getRecommendations(
    toolId: string,
    context?: string,
    _limit = 5
  ): Promise<unknown[]> {
    if (this.knowledgeGraphService) {
      logger.info('Getting tool recommendations from knowledge graph', { toolId, context });
    }
    return [];
  }

  public async getToolRelationships(toolId: string): Promise<unknown[]> {
    if (this.knowledgeGraphService) {
      logger.info('Getting tool relationships from knowledge graph', { toolId });
    }
    return [];
  }

  public async getToolsByCategory(category: ToolCategory): Promise<Record<string, unknown>[]> {
    return this.findToolsByCategory(category);
  }
}
