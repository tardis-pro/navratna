import { DataSource, Repository } from 'typeorm';
import { MCPToolCall } from '../entities/mcpToolCall.entity.js';
import { MCPServer } from '../entities/mcpServer.entity.js';
import { logger } from '@uaip/utils';
import { DatabaseError } from '../databaseService.js';

export interface MCPJobRequest {
  serverId: string;
  toolName: string;
  parameters: any;
  agentId?: string;
  userId?: string;
  conversationId?: string;
  operationId?: string;
  sessionId?: string;
  securityLevel?: 'low' | 'medium' | 'high' | 'critical';
  approvalRequired?: boolean;
  timeoutSeconds?: number;
  metadata?: Record<string, any>;
}

export interface MCPJobResult {
  success: boolean;
  result?: any;
  error?: string;
  errorCode?: string;
  errorCategory?: string;
  executionTimeMs?: number;
  resourceUsage?: {
    memoryUsageMb?: number;
    cpuUsagePercent?: number;
    networkBytesSent?: number;
    networkBytesReceived?: number;
  };
}

export class MCPService {
  private static instance: MCPService;
  private dataSource: DataSource | null = null;
  private toolCallRepository: Repository<MCPToolCall> | null = null;
  private serverRepository: Repository<MCPServer> | null = null;

  private constructor() {}

  public static getInstance(): MCPService {
    if (!MCPService.instance) {
      MCPService.instance = new MCPService();
    }
    return MCPService.instance;
  }

  public setDataSource(dataSource: DataSource): void {
    this.dataSource = dataSource;
    this.toolCallRepository = dataSource.getRepository(MCPToolCall);
    this.serverRepository = dataSource.getRepository(MCPServer);
  }

  private getToolCallRepository(): Repository<MCPToolCall> {
    if (!this.toolCallRepository) {
      throw new DatabaseError('MCP tool call repository not initialized');
    }
    return this.toolCallRepository;
  }

  private getServerRepository(): Repository<MCPServer> {
    if (!this.serverRepository) {
      throw new DatabaseError('MCP server repository not initialized');
    }
    return this.serverRepository;
  }

  // Tool Call Operations
  async createToolCall(request: MCPJobRequest): Promise<MCPToolCall> {
    try {
      const repository = this.getToolCallRepository();

      const toolCall = repository.create({
        serverId: request.serverId,
        toolName: request.toolName,
        parameters: request.parameters,
        agentId: request.agentId,
        userId: request.userId,
        conversationId: request.conversationId,
        operationId: request.operationId,
        sessionId: request.sessionId,
        securityLevel: request.securityLevel || 'medium',
        approvalRequired: request.approvalRequired || false,
        timeoutSeconds: request.timeoutSeconds || 30,
        metadata: request.metadata,
        timestamp: new Date(),
        status: 'pending',
        retryCount: 0,
      });

      const result = await repository.save(toolCall);
      logger.info(
        `Created MCP tool call: ${result.id} for ${request.serverId}:${request.toolName}`
      );
      return result;
    } catch (error) {
      logger.error('Failed to create MCP tool call:', error);
      throw new DatabaseError('Failed to create MCP tool call', {
        originalError: error.message,
        details: request,
      });
    }
  }

  async updateToolCall(id: string, updates: Partial<MCPToolCall>): Promise<MCPToolCall> {
    try {
      const repository = this.getToolCallRepository();
      await repository.update(id, updates);

      const result = await repository.findOne({ where: { id } });
      if (!result) {
        throw new DatabaseError(`Tool call not found: ${id}`);
      }

      return result;
    } catch (error) {
      logger.error('Failed to update MCP tool call:', error);
      throw new DatabaseError('Failed to update MCP tool call', {
        originalError: error.message,
        details: { id, updates },
      });
    }
  }

  async getToolCall(id: string): Promise<MCPToolCall | null> {
    try {
      const repository = this.getToolCallRepository();
      return await repository.findOne({ where: { id } });
    } catch (error) {
      logger.error('Failed to get MCP tool call:', error);
      throw new DatabaseError('Failed to get MCP tool call', {
        originalError: error.message,
        details: { id },
      });
    }
  }

  async startToolCall(id: string): Promise<MCPToolCall> {
    try {
      const updates = {
        status: 'running' as const,
        startTime: new Date(),
      };

      return await this.updateToolCall(id, updates);
    } catch (error) {
      logger.error('Failed to start MCP tool call:', error);
      throw new DatabaseError('Failed to start MCP tool call', {
        originalError: error.message,
        details: { id },
      });
    }
  }

  async completeToolCall(id: string, result: any, executionTimeMs?: number): Promise<MCPToolCall> {
    try {
      const updates = {
        status: 'completed' as const,
        result,
        endTime: new Date(),
        executionTimeMs,
      };

      return await this.updateToolCall(id, updates);
    } catch (error) {
      logger.error('Failed to complete MCP tool call:', error);
      throw new DatabaseError('Failed to complete MCP tool call', {
        originalError: error.message,
        details: { id, result },
      });
    }
  }

  async failToolCall(
    id: string,
    error: string,
    errorCode?: string,
    errorCategory?: 'network' | 'timeout' | 'validation' | 'execution' | 'permission' | 'resource'
  ): Promise<MCPToolCall> {
    try {
      const updates = {
        status: 'failed' as const,
        error,
        errorCode,
        errorCategory,
        endTime: new Date(),
      };

      return await this.updateToolCall(id, updates);
    } catch (err: any) {
      logger.error('Failed to fail MCP tool call:', err);
      throw new DatabaseError('Failed to fail MCP tool call', {
        originalError: err.message,
        details: { id, error, errorCode, errorCategory },
      });
    }
  }

  async getToolCallsByServer(serverId: string, limit: number = 100): Promise<MCPToolCall[]> {
    try {
      const repository = this.getToolCallRepository();
      return await repository.find({
        where: { serverId },
        order: { timestamp: 'DESC' },
        take: limit,
      });
    } catch (error) {
      logger.error('Failed to get tool calls by server:', error);
      throw new DatabaseError('Failed to get tool calls by server', {
        originalError: error.message,
        details: { serverId, limit },
      });
    }
  }

  async getToolCallsByAgent(agentId: string, limit: number = 100): Promise<MCPToolCall[]> {
    try {
      const repository = this.getToolCallRepository();
      return await repository.find({
        where: { agentId },
        order: { timestamp: 'DESC' },
        take: limit,
      });
    } catch (error) {
      logger.error('Failed to get tool calls by agent:', error);
      throw new DatabaseError('Failed to get tool calls by agent', {
        originalError: error.message,
        details: { agentId, limit },
      });
    }
  }

  async getToolCallsByStatus(
    status: 'pending' | 'running' | 'completed' | 'failed'
  ): Promise<MCPToolCall[]> {
    try {
      const repository = this.getToolCallRepository();
      return await repository.find({
        where: { status },
        order: { timestamp: 'DESC' },
      });
    } catch (error) {
      logger.error('Failed to get tool calls by status:', error);
      throw new DatabaseError('Failed to get tool calls by status', {
        originalError: error.message,
        details: { status },
      });
    }
  }

  async getToolCallStats(serverId?: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    running: number;
    averageExecutionTime: number;
    successRate: number;
  }> {
    try {
      const repository = this.getToolCallRepository();
      const query = repository.createQueryBuilder('call');

      if (serverId) {
        query.where('call.serverId = :serverId', { serverId });
      }

      const [results, total] = await query.getManyAndCount();

      const stats = {
        total,
        completed: results.filter((r) => r.status === 'completed').length,
        failed: results.filter((r) => r.status === 'failed').length,
        pending: results.filter((r) => r.status === 'pending').length,
        running: results.filter((r) => r.status === 'running').length,
        averageExecutionTime: 0,
        successRate: 0,
      };

      // Calculate average execution time
      const completedWithTimes = results.filter(
        (r) => r.status === 'completed' && r.executionTimeMs
      );

      if (completedWithTimes.length > 0) {
        stats.averageExecutionTime =
          completedWithTimes.reduce((sum, call) => sum + (call.executionTimeMs || 0), 0) /
          completedWithTimes.length;
      }

      // Calculate success rate
      if (total > 0) {
        stats.successRate = (stats.completed / total) * 100;
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get tool call stats:', error);
      throw new DatabaseError('Failed to get tool call stats', {
        originalError: error.message,
        details: { serverId },
      });
    }
  }

  // Server Operations
  async createServer(serverData: Partial<MCPServer>): Promise<MCPServer> {
    try {
      const repository = this.getServerRepository();
      const server = repository.create(serverData);
      const result = await repository.save(server);

      logger.info(`Created MCP server: ${result.id} (${result.name})`);
      return result;
    } catch (error) {
      logger.error('Failed to create MCP server:', error);
      throw new DatabaseError('Failed to create MCP server', {
        originalError: error.message,
        details: serverData,
      });
    }
  }

  async updateServer(id: string, updates: Partial<MCPServer>): Promise<MCPServer> {
    try {
      const repository = this.getServerRepository();
      await repository.update(id, updates);

      const result = await repository.findOne({ where: { id } });
      if (!result) {
        throw new DatabaseError(`Server not found: ${id}`);
      }

      return result;
    } catch (error) {
      logger.error('Failed to update MCP server:', error);
      throw new DatabaseError('Failed to update MCP server', {
        originalError: error.message,
        details: { id, updates },
      });
    }
  }

  async getServer(id: string): Promise<MCPServer | null> {
    try {
      const repository = this.getServerRepository();
      return await repository.findOne({ where: { id } });
    } catch (error) {
      logger.error('Failed to get MCP server:', error);
      throw new DatabaseError('Failed to get MCP server', {
        originalError: error.message,
        details: { id },
      });
    }
  }

  async getServerByName(name: string): Promise<MCPServer | null> {
    try {
      const repository = this.getServerRepository();
      return await repository.findOne({ where: { name } });
    } catch (error) {
      logger.error('Failed to get MCP server by name:', error);
      throw new DatabaseError('Failed to get MCP server by name', {
        originalError: error.message,
        details: { name },
      });
    }
  }

  async getAllServers(): Promise<MCPServer[]> {
    try {
      const repository = this.getServerRepository();
      return await repository.find({ order: { name: 'ASC' } });
    } catch (error) {
      logger.error('Failed to get all MCP servers:', error);
      throw new DatabaseError('Failed to get all MCP servers', {
        originalError: error.message,
      });
    }
  }

  async deleteServer(id: string): Promise<void> {
    try {
      const repository = this.getServerRepository();
      await repository.delete(id);
      logger.info(`Deleted MCP server: ${id}`);
    } catch (error) {
      logger.error('Failed to delete MCP server:', error);
      throw new DatabaseError('Failed to delete MCP server', {
        originalError: error.message,
        details: { id },
      });
    }
  }

  // Utility methods
  async retryToolCall(id: string): Promise<MCPToolCall | null> {
    try {
      const toolCall = await this.getToolCall(id);
      if (!toolCall) return null;

      if (toolCall.retryCount >= toolCall.maxRetries) {
        logger.warn(`Max retries exceeded for tool call: ${id}`);
        return null;
      }

      return await this.updateToolCall(id, {
        retryCount: toolCall.retryCount + 1,
        status: 'pending',
      });
    } catch (error) {
      logger.error('Failed to retry MCP tool call:', error);
      throw new DatabaseError('Failed to retry MCP tool call', {
        originalError: error.message,
        details: { id },
      });
    }
  }

  async cancelToolCall(id: string, reason?: string, cancelledBy?: string): Promise<MCPToolCall> {
    try {
      return await this.updateToolCall(id, {
        status: 'failed',
        cancelledAt: new Date(),
        cancelledBy,
        cancellationReason: reason || 'Job cancelled',
        error: 'Job was cancelled',
      });
    } catch (error) {
      logger.error('Failed to cancel MCP tool call:', error);
      throw new DatabaseError('Failed to cancel MCP tool call', {
        originalError: error.message,
        details: { id, reason, cancelledBy },
      });
    }
  }

  async cleanupOldToolCalls(daysToKeep: number = 30): Promise<number> {
    try {
      const repository = this.getToolCallRepository();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await repository
        .createQueryBuilder()
        .delete()
        .where('timestamp < :cutoffDate', { cutoffDate })
        .execute();

      const deletedCount = result.affected || 0;
      logger.info(`Cleaned up ${deletedCount} old MCP tool calls older than ${daysToKeep} days`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old MCP tool calls:', error);
      throw new DatabaseError('Failed to cleanup old MCP tool calls', {
        originalError: error.message,
        details: { daysToKeep },
      });
    }
  }

  // Health check
  async healthCheck(): Promise<{
    healthy: boolean;
    pendingJobs: number;
    runningJobs: number;
    totalServers: number;
    runningServers: number;
  }> {
    try {
      const pendingJobs = await this.getToolCallsByStatus('pending');
      const runningJobs = await this.getToolCallsByStatus('running');
      const allServers = await this.getAllServers();
      const runningServers = allServers.filter((s) => s.status === 'running');

      return {
        healthy: true,
        pendingJobs: pendingJobs.length,
        runningJobs: runningJobs.length,
        totalServers: allServers.length,
        runningServers: runningServers.length,
      };
    } catch (error) {
      logger.error('MCP service health check failed:', error);
      return {
        healthy: false,
        pendingJobs: -1,
        runningJobs: -1,
        totalServers: -1,
        runningServers: -1,
      };
    }
  }
}
