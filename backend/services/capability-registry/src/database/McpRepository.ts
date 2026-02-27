import { DataSource, Repository } from 'typeorm';
import { logger } from '@uaip/utils';
import { MCPServer } from './entities/mcp-server.entity.js';
import { MCPToolCall } from './entities/mcp-tool-call.entity.js';

// ── Domain error ────────────────────────────────────────────────────────────

export class McpDatabaseError extends Error {
  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'McpDatabaseError';
  }
}

// ── Request / result DTOs ────────────────────────────────────────────────────

export interface McpJobRequest {
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

export interface McpJobResult {
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

// ── Repository ────────────────────────────────────────────────────────────────

/**
 * McpRepository — Execution Plane data-access layer.
 *
 * Fully self-contained: initialized with the plane's own DataSource.
 * No dependency on @uaip/shared-services.
 */
export class McpRepository {
  private readonly servers: Repository<MCPServer>;
  private readonly toolCalls: Repository<MCPToolCall>;

  constructor(dataSource: DataSource) {
    this.servers = dataSource.getRepository(MCPServer);
    this.toolCalls = dataSource.getRepository(MCPToolCall);
  }

  // ── Tool Call operations ──────────────────────────────────────────────────

  async createToolCall(req: McpJobRequest): Promise<MCPToolCall> {
    try {
      const row = this.toolCalls.create({
        serverId: req.serverId,
        toolName: req.toolName,
        parameters: req.parameters,
        agentId: req.agentId,
        userId: req.userId,
        conversationId: req.conversationId,
        operationId: req.operationId,
        sessionId: req.sessionId,
        securityLevel: req.securityLevel ?? 'medium',
        approvalRequired: req.approvalRequired ?? false,
        timeoutSeconds: req.timeoutSeconds ?? 30,
        metadata: req.metadata,
        timestamp: new Date(),
        status: 'pending',
        retryCount: 0,
      });
      const saved = await this.toolCalls.save(row);
      logger.info(`McpRepository: created tool call ${saved.id} (${req.serverId}:${req.toolName})`);
      return saved;
    } catch (err: any) {
      throw new McpDatabaseError('Failed to create MCP tool call', {
        cause: err?.message,
        req: req as unknown as Record<string, unknown>,
      });
    }
  }

  async updateToolCall(id: string, updates: Partial<MCPToolCall>): Promise<MCPToolCall> {
    try {
      await this.toolCalls.update(id, updates);
      const row = await this.toolCalls.findOne({ where: { id } });
      if (!row) throw new McpDatabaseError(`Tool call not found: ${id}`);
      return row;
    } catch (err: any) {
      if (err instanceof McpDatabaseError) throw err;
      throw new McpDatabaseError('Failed to update MCP tool call', { id, cause: err?.message });
    }
  }

  async getToolCall(id: string): Promise<MCPToolCall | null> {
    return this.toolCalls.findOne({ where: { id } });
  }

  async startToolCall(id: string): Promise<MCPToolCall> {
    return this.updateToolCall(id, { status: 'running', startTime: new Date() });
  }

  async completeToolCall(id: string, result: any, executionTimeMs?: number): Promise<MCPToolCall> {
    return this.updateToolCall(id, {
      status: 'completed',
      result,
      endTime: new Date(),
      executionTimeMs,
    });
  }

  async failToolCall(
    id: string,
    error: string,
    errorCode?: string,
    errorCategory?: MCPToolCall['errorCategory']
  ): Promise<MCPToolCall> {
    return this.updateToolCall(id, {
      status: 'failed',
      error,
      errorCode,
      errorCategory,
      endTime: new Date(),
    });
  }

  async cancelToolCall(id: string, reason?: string, cancelledBy?: string): Promise<MCPToolCall> {
    return this.updateToolCall(id, {
      status: 'failed',
      cancelledAt: new Date(),
      cancelledBy,
      cancellationReason: reason ?? 'Job cancelled',
      error: 'Job was cancelled',
    });
  }

  async retryToolCall(id: string): Promise<MCPToolCall | null> {
    const row = await this.getToolCall(id);
    if (!row) return null;
    if (row.retryCount >= row.maxRetries) {
      logger.warn(`McpRepository: max retries exceeded for tool call ${id}`);
      return null;
    }
    return this.updateToolCall(id, { retryCount: row.retryCount + 1, status: 'pending' });
  }

  async getToolCallsByServer(serverId: string, limit = 100): Promise<MCPToolCall[]> {
    return this.toolCalls.find({ where: { serverId }, order: { timestamp: 'DESC' }, take: limit });
  }

  async getToolCallsByAgent(agentId: string, limit = 100): Promise<MCPToolCall[]> {
    return this.toolCalls.find({ where: { agentId }, order: { timestamp: 'DESC' }, take: limit });
  }

  async getToolCallsByStatus(status: MCPToolCall['status']): Promise<MCPToolCall[]> {
    return this.toolCalls.find({ where: { status }, order: { timestamp: 'DESC' } });
  }

  async getToolCallStats(serverId?: string) {
    const qb = this.toolCalls.createQueryBuilder('call');
    if (serverId) qb.where('call.serverId = :serverId', { serverId });
    const [rows, total] = await qb.getManyAndCount();

    const completed = rows.filter((r) => r.status === 'completed');
    const avgExecTime =
      completed.length > 0
        ? completed.reduce((s, r) => s + (r.executionTimeMs ?? 0), 0) / completed.length
        : 0;

    return {
      total,
      completed: completed.length,
      failed: rows.filter((r) => r.status === 'failed').length,
      pending: rows.filter((r) => r.status === 'pending').length,
      running: rows.filter((r) => r.status === 'running').length,
      averageExecutionTime: avgExecTime,
      successRate: total > 0 ? (completed.length / total) * 100 : 0,
    };
  }

  async cleanupOldToolCalls(daysToKeep = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const res = await this.toolCalls
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoff', { cutoff })
      .execute();
    const count = res.affected ?? 0;
    logger.info(`McpRepository: cleaned up ${count} tool calls older than ${daysToKeep} days`);
    return count;
  }

  // ── Server operations ─────────────────────────────────────────────────────

  async createServer(data: Partial<MCPServer>): Promise<MCPServer> {
    try {
      const row = this.servers.create(data);
      const saved = await this.servers.save(row);
      logger.info(`McpRepository: created server ${saved.id} (${saved.name})`);
      return saved;
    } catch (err: any) {
      throw new McpDatabaseError('Failed to create MCP server', { cause: err?.message });
    }
  }

  async updateServer(id: string, updates: Partial<MCPServer>): Promise<MCPServer> {
    try {
      await this.servers.update(id, updates);
      const row = await this.servers.findOne({ where: { id } });
      if (!row) throw new McpDatabaseError(`Server not found: ${id}`);
      return row;
    } catch (err: any) {
      if (err instanceof McpDatabaseError) throw err;
      throw new McpDatabaseError('Failed to update MCP server', { id, cause: err?.message });
    }
  }

  async getServer(id: string): Promise<MCPServer | null> {
    return this.servers.findOne({ where: { id } });
  }

  async getServerByName(name: string): Promise<MCPServer | null> {
    try {
      return await this.servers.findOne({ where: { name } });
    } catch (err: any) {
      throw new McpDatabaseError('Failed to get MCP server by name', { name, cause: err?.message });
    }
  }

  async getAllServers(): Promise<MCPServer[]> {
    try {
      return await this.servers.find({ order: { name: 'ASC' } });
    } catch (err: any) {
      throw new McpDatabaseError('Failed to get all MCP servers', { cause: err?.message });
    }
  }

  async deleteServer(id: string): Promise<void> {
    try {
      await this.servers.delete(id);
      logger.info(`McpRepository: deleted server ${id}`);
    } catch (err: any) {
      throw new McpDatabaseError('Failed to delete MCP server', { id, cause: err?.message });
    }
  }

  // ── Health check ──────────────────────────────────────────────────────────

  async healthCheck() {
    try {
      const [pending, running, allServers] = await Promise.all([
        this.getToolCallsByStatus('pending'),
        this.getToolCallsByStatus('running'),
        this.getAllServers(),
      ]);
      return {
        healthy: true,
        pendingJobs: pending.length,
        runningJobs: running.length,
        totalServers: allServers.length,
        runningServers: allServers.filter((s) => s.status === 'running').length,
      };
    } catch (err) {
      logger.error('McpRepository: health check failed', err);
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
