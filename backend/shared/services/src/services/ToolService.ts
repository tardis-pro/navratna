import { Repository } from 'typeorm';
import { logger } from '@uaip/utils/logger';
import { TypeOrmService } from '../typeormService';
import { 
  ToolRepository, 
  ToolExecutionRepository, 
  ToolUsageRepository 
} from '../database/repositories/ToolRepository';
import { ToolDefinition } from '../entities/toolDefinition.entity';
import { ToolExecution } from '../entities/toolExecution.entity';
import { ToolUsageRecord } from '../entities/toolUsageRecord.entity';
import { ToolAssignment } from '../entities/toolAssignment.entity';
import { SecurityLevel } from '@uaip/types';

export class ToolService {
  private static instance: ToolService;
  private typeormService: TypeOrmService;
  
  // Repositories
  private toolRepository: ToolRepository | null = null;
  private toolExecutionRepository: ToolExecutionRepository | null = null;
  private toolUsageRepository: ToolUsageRepository | null = null;
  private toolAssignmentRepository: Repository<ToolAssignment> | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
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
      this.toolRepository = new ToolRepository(this.typeormService.dataSource, ToolDefinition);
    }
    return this.toolRepository;
  }

  public getToolExecutionRepository(): ToolExecutionRepository {
    if (!this.toolExecutionRepository) {
      this.toolExecutionRepository = new ToolExecutionRepository(this.typeormService.dataSource, ToolExecution);
    }
    return this.toolExecutionRepository;
  }

  public getToolUsageRepository(): ToolUsageRepository {
    if (!this.toolUsageRepository) {
      this.toolUsageRepository = new ToolUsageRepository(this.typeormService.dataSource, ToolUsageRecord);
    }
    return this.toolUsageRepository;
  }

  public getToolAssignmentRepository(): Repository<ToolAssignment> {
    if (!this.toolAssignmentRepository) {
      this.toolAssignmentRepository = this.typeormService.dataSource.getRepository(ToolAssignment);
    }
    return this.toolAssignmentRepository;
  }

  // Tool definition operations
  public async createTool(data: {
    name: string;
    displayName: string;
    description: string;
    category: string;
    isActive?: boolean;
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
    const tool = toolRepo.create({
      ...data,
      isActive: data.isActive ?? true,
      version: data.version || '1.0.0',
      securityLevel: data.securityLevel || SecurityLevel.MEDIUM,
      maxRetries: data.maxRetries || 3,
      timeout: data.timeout || 30000
    });

    return await toolRepo.save(tool);
  }

  public async findToolByName(name: string): Promise<ToolDefinition | null> {
    return await this.getToolRepository().findOne({ where: { name } });
  }

  public async findToolById(id: string): Promise<ToolDefinition | null> {
    return await this.getToolRepository().findOne({ where: { id } });
  }

  public async findActiveTools(): Promise<ToolDefinition[]> {
    return await this.getToolRepository().find({ where: { isActive: true } });
  }

  public async findToolsByCategory(category: string): Promise<ToolDefinition[]> {
    return await this.getToolRepository().find({ where: { category } });
  }

  public async updateTool(id: string, data: Partial<ToolDefinition>): Promise<ToolDefinition | null> {
    await this.getToolRepository().update(id, data);
    return await this.findToolById(id);
  }

  public async deactivateTool(id: string): Promise<boolean> {
    const result = await this.getToolRepository().update(id, { isActive: false });
    return result.affected !== 0;
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
    const execution = executionRepo.create({
      tool: { id: data.toolId },
      agent: data.agentId ? { id: data.agentId } : undefined,
      user: data.userId ? { id: data.userId } : undefined,
      input: data.input,
      context: data.context,
      traceId: data.traceId,
      status: 'pending',
      startedAt: new Date()
    });

    return await executionRepo.save(execution);
  }

  public async updateExecution(id: string, data: {
    status?: string;
    output?: any;
    error?: any;
    metadata?: any;
    duration?: number;
  }): Promise<ToolExecution | null> {
    const updates: any = { ...data };
    
    if (data.status === 'completed' || data.status === 'failed') {
      updates.completedAt = new Date();
    }

    await this.getToolExecutionRepository().update(id, updates);
    return await this.getToolExecutionRepository().findOne({ where: { id } });
  }

  public async findExecutionById(id: string): Promise<ToolExecution | null> {
    return await this.getToolExecutionRepository().findOne({
      where: { id },
      relations: ['tool', 'agent', 'user']
    });
  }

  public async findExecutionsByTool(toolId: string, limit?: number): Promise<ToolExecution[]> {
    return await this.getToolExecutionRepository().find({
      where: { tool: { id: toolId } },
      order: { startedAt: 'DESC' },
      take: limit || 100,
      relations: ['agent', 'user']
    });
  }

  public async findExecutionsByAgent(agentId: string, limit?: number): Promise<ToolExecution[]> {
    return await this.getToolExecutionRepository().find({
      where: { agent: { id: agentId } },
      order: { startedAt: 'DESC' },
      take: limit || 100,
      relations: ['tool']
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
    const usage = usageRepo.create({
      tool: { id: data.toolId },
      agent: data.agentId ? { id: data.agentId } : undefined,
      user: data.userId ? { id: data.userId } : undefined,
      execution: data.executionId ? { id: data.executionId } : undefined,
      inputTokens: data.inputTokens || 0,
      outputTokens: data.outputTokens || 0,
      executionTime: data.executionTime || 0,
      success: data.success,
      error: data.error
    });

    return await usageRepo.save(usage);
  }

  public async getToolUsageStats(toolId: string, days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const usageRepo = this.getToolUsageRepository();
    const stats = await usageRepo
      .createQueryBuilder('usage')
      .select('COUNT(*)', 'totalExecutions')
      .addSelect('SUM(CASE WHEN usage.success = true THEN 1 ELSE 0 END)', 'successfulExecutions')
      .addSelect('AVG(usage.executionTime)', 'avgExecutionTime')
      .addSelect('SUM(usage.inputTokens)', 'totalInputTokens')
      .addSelect('SUM(usage.outputTokens)', 'totalOutputTokens')
      .where('usage.toolId = :toolId', { toolId })
      .andWhere('usage.createdAt >= :startDate', { startDate })
      .getRawOne();

    return {
      toolId,
      period: `${days} days`,
      ...stats
    };
  }

  // Tool assignment operations
  public async assignToolToAgent(agentId: string, toolId: string, permissions: {
    canExecute?: boolean;
    canRead?: boolean;
    customConfig?: any;
  } = {}): Promise<ToolAssignment> {
    const assignmentRepo = this.getToolAssignmentRepository();
    
    // Check if assignment already exists
    const existing = await assignmentRepo.findOne({
      where: { agent: { id: agentId }, tool: { id: toolId } }
    });

    if (existing) {
      // Update existing assignment
      await assignmentRepo.update(existing.id, {
        canExecute: permissions.canExecute ?? existing.canExecute,
        canRead: permissions.canRead ?? existing.canRead,
        customConfig: permissions.customConfig ?? existing.customConfig
      });
      return await assignmentRepo.findOne({ where: { id: existing.id } }) as ToolAssignment;
    }

    // Create new assignment
    const assignment = assignmentRepo.create({
      agent: { id: agentId },
      tool: { id: toolId },
      canExecute: permissions.canExecute ?? true,
      canRead: permissions.canRead ?? true,
      customConfig: permissions.customConfig
    });

    return await assignmentRepo.save(assignment);
  }

  public async removeToolFromAgent(agentId: string, toolId: string): Promise<boolean> {
    const result = await this.getToolAssignmentRepository().delete({
      agent: { id: agentId },
      tool: { id: toolId }
    });
    return result.affected !== 0;
  }

  public async getAgentTools(agentId: string): Promise<ToolAssignment[]> {
    return await this.getToolAssignmentRepository().find({
      where: { agent: { id: agentId } },
      relations: ['tool']
    });
  }

  // Bulk operations
  public async createBulkTools(tools: Array<Partial<ToolDefinition>>): Promise<ToolDefinition[]> {
    const toolRepo = this.getToolRepository();
    const entities = tools.map(tool => toolRepo.create(tool));
    return await toolRepo.save(entities);
  }

  public async deactivateToolsByCategory(category: string): Promise<number> {
    const result = await this.getToolRepository().update(
      { category },
      { isActive: false }
    );
    return result.affected || 0;
  }
}