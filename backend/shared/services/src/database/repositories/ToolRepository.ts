import { logger } from '@uaip/utils';
import { BaseRepository } from '../base/BaseRepository.js';
import { ToolDefinition } from '../../entities/toolDefinition.entity.js';
import { ToolExecution } from '../../entities/toolExecution.entity.js';
import { ToolUsageRecord } from '../../entities/toolUsageRecord.entity.js';

export class ToolRepository extends BaseRepository<ToolDefinition> {
  constructor() {
    super(ToolDefinition);
  }

  /**
   * Create a new tool definition
   */
  public async createTool(toolData: Partial<ToolDefinition>): Promise<ToolDefinition> {
    const tool = this.repository.create(toolData);
    return await this.repository.save(tool);
  }

  /**
   * Get tools with optional filtering
   */
  public async getTools(filters: {
    category?: string;
    enabled?: boolean;
    securityLevel?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolDefinition[]> {
    const queryBuilder = this.repository.createQueryBuilder('tool');

    if (filters.category) {
      queryBuilder.andWhere('tool.category = :category', { category: filters.category });
    }

    if (filters.enabled !== undefined) {
      queryBuilder.andWhere('tool.isEnabled = :enabled', { enabled: filters.enabled });
    }

    if (filters.securityLevel) {
      queryBuilder.andWhere('tool.securityLevel = :securityLevel', { securityLevel: filters.securityLevel });
    }

    queryBuilder.orderBy('tool.name', 'ASC');

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }
    logger.info(`Getting tools with filters: ${JSON.stringify(filters)}`);
    return await queryBuilder.getMany();
  }

  /**
   * Search tools with advanced filtering and ranking
   */
  public async searchTools(searchQuery: string, filters: {
    category?: string;
    securityLevel?: string;
    limit?: number;
  } = {}): Promise<ToolDefinition[]> {
    const queryBuilder = this.repository.createQueryBuilder('tool');

    // Base condition: only enabled tools
    queryBuilder.where('tool.isEnabled = :enabled', { enabled: true });

    // Search conditions with ranking
    const searchTerm = `%${searchQuery}%`;
    queryBuilder.andWhere(
      '(tool.name ILIKE :searchTerm OR tool.description ILIKE :searchTerm OR :searchQuery = ANY(tool.tags) OR tool.category ILIKE :searchTerm)',
      { searchTerm, searchQuery }
    );

    // Additional filters
    if (filters.category) {
      queryBuilder.andWhere('tool.category = :category', { category: filters.category });
    }

    if (filters.securityLevel) {
      queryBuilder.andWhere('tool.securityLevel = :securityLevel', { securityLevel: filters.securityLevel });
    }

    // Ranking by relevance and usage
    queryBuilder.orderBy(`
      CASE 
        WHEN tool.name ILIKE :searchTerm THEN 1
        WHEN tool.description ILIKE :searchTerm THEN 2
        WHEN :searchQuery = ANY(tool.tags) THEN 3
        ELSE 4
      END
    `, 'ASC');
    queryBuilder.addOrderBy('tool.totalExecutions', 'DESC');

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    return await queryBuilder.getMany();
  }

  /**
   * Update tool success metrics
   */
  public async updateToolSuccessMetrics(toolId: string, wasSuccessful: boolean, executionTime?: number): Promise<void> {
    try {
      if (wasSuccessful) {
        const updateData: any = {
          successfulExecutions: () => 'successful_executions + 1',
          updatedAt: new Date()
        };

        if (executionTime) {
          // Update average execution time
          updateData.averageExecutionTime = () => `
            CASE 
              WHEN total_executions = 0 THEN ${executionTime}
              ELSE (average_execution_time * (total_executions - 1) + ${executionTime}) / total_executions
            END
          `;
        }

        await this.repository
          .createQueryBuilder()
          .update()
          .set(updateData)
          .where('id = :toolId', { toolId })
          .execute();
      }
    } catch (error) {
      logger.error('Error updating tool success metrics', { toolId, wasSuccessful, executionTime, error: (error as Error).message });
      // Don't throw here as this is a background operation
    }
  }

  /**
   * Increment tool usage count (internal helper)
   */
  public async incrementToolUsageCount(toolId: string): Promise<void> {
    try {
      await this.repository
        .createQueryBuilder()
        .update()
        .set({
          totalExecutions: () => 'total_executions + 1',
          lastUsedAt: new Date(),
          updatedAt: new Date()
        })
        .where('id = :toolId', { toolId })
        .execute();
    } catch (error) {
      logger.error('Error incrementing tool usage count', { toolId, error: (error as Error).message });
      // Don't throw here as this is a background operation
    }
  }

  /**
   * Get tool performance analytics
   */
  public async getToolPerformanceAnalytics(toolId?: string): Promise<{
    tools: Array<{
      id: string;
      name: string;
      totalExecutions: number;
      successfulExecutions: number;
      successRate: number;
      averageExecutionTime: number;
      lastUsedAt: Date;
    }>;
  }> {
    const queryBuilder = this.repository.createQueryBuilder('tool');

    queryBuilder.select([
      'tool.id',
      'tool.name',
      'tool.totalExecutions',
      'tool.successfulExecutions',
      'CASE WHEN tool.totalExecutions > 0 THEN (tool.successfulExecutions::float / tool.totalExecutions * 100) ELSE 0 END as successRate',
      'tool.averageExecutionTime',
      'tool.lastUsedAt'
    ]);

    if (toolId) {
      queryBuilder.where('tool.id = :toolId', { toolId });
    }

    queryBuilder.orderBy('tool.totalExecutions', 'DESC');

    const tools = await queryBuilder.getRawMany();

    return { tools };
  }
}

export class ToolExecutionRepository extends BaseRepository<ToolExecution> {
  constructor() {
    super(ToolExecution);
  }

  /**
   * Create a tool execution record
   */
  public async createToolExecution(executionData: Partial<ToolExecution>): Promise<ToolExecution> {
    const execution = this.repository.create(executionData);
    return await this.repository.save(execution);
  }

  /**
   * Get a tool execution by ID
   */
  public async getToolExecution(id: string): Promise<ToolExecution | null> {
    return await this.repository.findOne({ where: { id } });
  }

  /**
   * Get tool executions with filtering
   */
  public async getToolExecutions(filters: {
    toolId?: string;
    agentId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolExecution[]> {
    const queryBuilder = this.repository.createQueryBuilder('execution');

    if (filters.toolId) {
      queryBuilder.andWhere('execution.toolId = :toolId', { toolId: filters.toolId });
    }

    if (filters.agentId) {
      queryBuilder.andWhere('execution.agentId = :agentId', { agentId: filters.agentId });
    }

    if (filters.status) {
      queryBuilder.andWhere('execution.status = :status', { status: filters.status });
    }

    queryBuilder.orderBy('execution.startTime', 'DESC');

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    return await queryBuilder.getMany();
  }

  /**
   * Get a tool execution by ID with relations
   */
  public async getToolExecutionWithRelations(id: string): Promise<ToolExecution | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['tool', 'agent']
    });
  }
}

export class ToolUsageRepository extends BaseRepository<ToolUsageRecord> {
  constructor() {
    super(ToolUsageRecord);
  }

  /**
   * Record tool usage for analytics
   */
  public async recordToolUsage(usageData: Partial<ToolUsageRecord>): Promise<ToolUsageRecord> {
    const usage = this.repository.create(usageData);
    const savedUsage = await this.repository.save(usage);

    // Update tool usage count using repository factory
    if (usageData.toolId) {
      const { repositoryFactory } = await import('../base/RepositoryFactory.js');
      const toolRepo = repositoryFactory.getToolRepository();
      await toolRepo.incrementToolUsageCount(usageData.toolId);
    }

    logger.debug(`Tool usage recorded: ${savedUsage.id}`);
    return savedUsage;
  }

  /**
   * Get tool usage statistics
   */
  public async getToolUsageStats(filters: {
    toolId?: string;
    agentId?: string;
    days?: number;
  } = {}): Promise<any[]> {
    const queryBuilder = this.repository.createQueryBuilder('usage');

    // Default to last 30 days
    const days = filters.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    queryBuilder
      .select([
        'usage.toolId',
        'usage.agentId',
        'COUNT(*) as totalUses',
        'COUNT(*) FILTER (WHERE usage.success = true) as successfulUses',
        'AVG(usage.executionTimeMs) as avgExecutionTime',
        'SUM(usage.cost) as totalCost',
        'DATE_TRUNC(\'day\', usage.usedAt) as date'
      ])
      .where('usage.usedAt >= :startDate', { startDate });

    if (filters.toolId) {
      queryBuilder.andWhere('usage.toolId = :toolId', { toolId: filters.toolId });
    }

    if (filters.agentId) {
      queryBuilder.andWhere('usage.agentId = :agentId', { agentId: filters.agentId });
    }

    queryBuilder
      .groupBy('usage.toolId, usage.agentId, DATE_TRUNC(\'day\', usage.usedAt)')
      .orderBy('date', 'DESC');

    return await queryBuilder.getRawMany();
  }
} 