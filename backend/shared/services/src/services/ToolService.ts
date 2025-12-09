import { Repository } from 'typeorm';
import { logger } from '@uaip/utils';
import { TypeOrmService } from '../typeormService';
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

export class ToolService {
  private static instance: ToolService;
  private typeormService: TypeOrmService;
  private redisService: RedisCacheService;
  private knowledgeGraphService: KnowledgeGraphService | null = null;

  // Repositories
  private toolRepository: ToolRepository | null = null;
  private toolExecutionRepository: ToolExecutionRepository | null = null;
  private toolUsageRepository: ToolUsageRepository | null = null;
  private toolAssignmentRepository: Repository<ToolAssignment> | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
    this.redisService = RedisCacheService.getInstance();
    // knowledgeGraphService is optional and initialized lazily
  }

  public static getInstance(): ToolService {
    if (!ToolService.instance) {
      ToolService.instance = new ToolService();
    }
    return ToolService.instance;
  }

  // Repository getters with lazy initialization
  public getToolRepository(): ToolRepository {
    if (!this.toolRepository) {
      this.toolRepository = new ToolRepository();
    }
    return this.toolRepository;
  }

  public getToolExecutionRepository(): ToolExecutionRepository {
    if (!this.toolExecutionRepository) {
      this.toolExecutionRepository = new ToolExecutionRepository();
    }
    return this.toolExecutionRepository;
  }

  public getToolUsageRepository(): ToolUsageRepository {
    if (!this.toolUsageRepository) {
      this.toolUsageRepository = new ToolUsageRepository();
    }
    return this.toolUsageRepository;
  }

  public getToolAssignmentRepository(): Repository<ToolAssignment> {
    if (!this.toolAssignmentRepository) {
      this.toolAssignmentRepository = this.typeormService.getRepository(ToolAssignment);
    }
    return this.toolAssignmentRepository;
  }

  // Tool definition operations
  public async createTool(data: {
    name: string;
    displayName: string;
    description: string;
    category: ToolCategory;
    isEnabled?: boolean;
    version?: string;
    inputSchema?: any;
    outputSchema?: any;
    configuration?: any;
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
    input: any;
    context?: any;
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
      output?: any;
      error?: any;
      metadata?: any;
      duration?: number;
    }
  ): Promise<ToolExecution | null> {
    const updates: any = { ...data };

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

  public async getToolUsageStats(toolId: string, days: number = 30): Promise<any> {
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
      customConfig?: any;
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
      const created = await toolRepo.createTool(tool);
      results.push(created);
    }
    return results;
  }

  public async deactivateToolsByCategory(category: string): Promise<number> {
    const tools = await this.getToolRepository().getTools({ category });
    let count = 0;
    for (const tool of tools) {
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

  public async recordToolUsage(usage: any): Promise<void> {
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

  public async getRecommendations(toolId: string, context?: string, limit = 5): Promise<any[]> {
    if (this.knowledgeGraphService) {
      // Use knowledge graph for recommendations
      logger.info('Getting tool recommendations from knowledge graph', { toolId, context });
    }
    return [];
  }

  public async getToolRelationships(toolId: string): Promise<any[]> {
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
