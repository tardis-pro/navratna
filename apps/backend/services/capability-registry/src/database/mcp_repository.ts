/**
 * McpRepository — Execution Plane data-access layer using Drizzle ORM.
 *
 * Uses the Control Plane DB via getControlDb() from @uaip/shared-services.
 * MCP tables (mcpServers, mcpToolCalls) live in the control schema.
 */

import { logger } from '@uaip/utils';
import { getControlDb, eq, desc, sql } from '@uaip/shared-services/drizzle/clients';
import { mcpServers, mcpToolCalls } from '@uaip/shared-services/drizzle/control';
import type { NewMCPServer } from '@uaip/shared-services/drizzle/control';
import type { ControlDB } from '@uaip/shared-services';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type MCPServer = typeof mcpServers.$inferSelect;

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
  parameters: unknown;
  agentId?: string;
  userId?: string;
  conversationId?: string;
  operationId?: string;
  sessionId?: string;
  securityLevel?: 'low' | 'medium' | 'high' | 'critical';
  approvalRequired?: boolean;
  timeoutSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface McpJobResult {
  success: boolean;
  result?: unknown;
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
 * McpRepository — Drizzle-based data-access layer for MCP servers and tool calls.
 *
 * Self-contained: uses getControlDb() directly (no constructor args).
 */
export class McpRepository {
  private get db(): ControlDB {
    return getControlDb();
  }

  private getErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  // ── Tool Call operations ──────────────────────────────────────────────────

  async createToolCall(req: McpJobRequest) {
    try {
      const [row] = await this.db
        .insert(mcpToolCalls)
        .values({
          serverId: req.serverId,
          toolName: req.toolName,
          parameters:
            isRecord(req.parameters)
              ? req.parameters
              : { value: req.parameters },
          agentId: req.agentId,
          status: 'pending',
          metadata: req.metadata,
        })
        .returning();

      logger.info(`McpRepository: created tool call ${row.id} (${req.serverId}:${req.toolName})`);
      return row;
    } catch (err: unknown) {
      throw new McpDatabaseError('Failed to create MCP tool call', {
        cause: this.getErrorMessage(err),
        req: { serverId: req.serverId, toolName: req.toolName },
      });
    }
  }

  async updateToolCall(id: string, updates: Record<string, unknown>) {
    try {
      const [row] = await this.db
        .update(mcpToolCalls)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(mcpToolCalls.id, id))
        .returning();

      if (!row) throw new McpDatabaseError(`Tool call not found: ${id}`);
      return row;
    } catch (err: unknown) {
      if (err instanceof McpDatabaseError) throw err;
      throw new McpDatabaseError('Failed to update MCP tool call', {
        id,
        cause: this.getErrorMessage(err),
      });
    }
  }

  async getToolCall(id: string) {
    const [row] = await this.db.select().from(mcpToolCalls).where(eq(mcpToolCalls.id, id)).limit(1);
    return row ?? null;
  }

  async startToolCall(id: string) {
    return this.updateToolCall(id, { status: 'running', startTime: new Date() });
  }

  async completeToolCall(id: string, result: unknown, executionTimeMs?: number) {
    return this.updateToolCall(id, {
      status: 'completed',
      result,
      endTime: new Date(),
      executionTimeMs,
    });
  }

  async failToolCall(id: string, error: string, errorCode?: string, errorCategory?: string) {
    return this.updateToolCall(id, {
      status: 'failed',
      error,
      errorCode,
      errorCategory,
      endTime: new Date(),
    });
  }

  async cancelToolCall(id: string, reason?: string, cancelledBy?: string) {
    return this.updateToolCall(id, {
      status: 'failed',
      cancelledAt: new Date(),
      cancelledBy,
      cancellationReason: reason ?? 'Job cancelled',
      error: 'Job was cancelled',
    });
  }

  async retryToolCall(id: string) {
    const row = await this.getToolCall(id);
    if (!row) return null;
    const rowRecord: Record<string, unknown> = isRecord(row) ? row : {};
    const currentRetryCount = typeof rowRecord.retryCount === 'number' ? rowRecord.retryCount : 0;
    const maxRetries = typeof rowRecord.maxRetries === 'number' ? rowRecord.maxRetries : 0;
    if (currentRetryCount >= maxRetries) {
      logger.warn(`McpRepository: max retries exceeded for tool call ${id}`);
      return null;
    }
    return this.updateToolCall(id, { retryCount: currentRetryCount + 1, status: 'pending' });
  }

  async getToolCallsByServer(serverId: string, limit = 100) {
    return this.db
      .select()
      .from(mcpToolCalls)
      .where(eq(mcpToolCalls.serverId, serverId))
      .orderBy(desc(mcpToolCalls.createdAt))
      .limit(limit);
  }

  async getToolCallsByAgent(agentId: string, limit = 100) {
    return this.db
      .select()
      .from(mcpToolCalls)
      .where(eq(mcpToolCalls.agentId, agentId))
      .orderBy(desc(mcpToolCalls.createdAt))
      .limit(limit);
  }

  async getToolCallsByStatus(status: string) {
    return this.db
      .select()
      .from(mcpToolCalls)
      .where(eq(mcpToolCalls.status, status))
      .orderBy(desc(mcpToolCalls.createdAt));
  }

  async getToolCallStats(serverId?: string) {
    const baseCondition = serverId ? eq(mcpToolCalls.serverId, serverId) : undefined;
    const rows = await this.db.select().from(mcpToolCalls).where(baseCondition);

    const completed = rows.filter((r) => r.status === 'completed');
    const avgExecTime =
      completed.length > 0
        ? completed.reduce(
            (s, r) => s + (isRecord(r) && typeof r.duration === 'number' ? r.duration : 0),
            0
          ) / completed.length
        : 0;

    return {
      total: rows.length,
      completed: completed.length,
      failed: rows.filter((r) => r.status === 'failed').length,
      pending: rows.filter((r) => r.status === 'pending').length,
      running: rows.filter((r) => r.status === 'running').length,
      averageExecutionTime: avgExecTime,
      successRate: rows.length > 0 ? (completed.length / rows.length) * 100 : 0,
    };
  }

  async cleanupOldToolCalls(daysToKeep = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const result = await this.db
      .delete(mcpToolCalls)
      .where(sql`${mcpToolCalls.createdAt} < ${cutoff}`);
    const count = result.rowCount ?? 0;
    logger.info(`McpRepository: cleaned up ${count} tool calls older than ${daysToKeep} days`);
    return count;
  }

  // ── Server operations ─────────────────────────────────────────────────────

  async createServer(data: NewMCPServer): Promise<MCPServer> {
    try {
      const insertQuery = this.db.insert(mcpServers).values(data);
      const [row] = await insertQuery.returning();

      logger.info(`McpRepository: created server ${row.id} (${row.name})`);
      return row;
    } catch (err: unknown) {
      throw new McpDatabaseError('Failed to create MCP server', {
        cause: this.getErrorMessage(err),
      });
    }
  }

  async updateServer(id: string, updates: Record<string, unknown>): Promise<MCPServer> {
    try {
      const [row] = await this.db
        .update(mcpServers)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(mcpServers.id, id))
        .returning();

      if (!row) throw new McpDatabaseError(`Server not found: ${id}`);
      return row;
    } catch (err: unknown) {
      if (err instanceof McpDatabaseError) throw err;
      throw new McpDatabaseError('Failed to update MCP server', {
        id,
        cause: this.getErrorMessage(err),
      });
    }
  }

  async getServer(id: string): Promise<MCPServer | null> {
    const [row] = await this.db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
    return row ?? null;
  }

  async getServerByName(name: string): Promise<MCPServer | null> {
    try {
      const [row] = await this.db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.name, name))
        .limit(1);
      return row ?? null;
    } catch (err: unknown) {
      throw new McpDatabaseError('Failed to get MCP server by name', {
        name,
        cause: this.getErrorMessage(err),
      });
    }
  }

  async getAllServers(): Promise<MCPServer[]> {
    try {
      return this.db.select().from(mcpServers).orderBy(mcpServers.name);
    } catch (err: unknown) {
      throw new McpDatabaseError('Failed to get all MCP servers', {
        cause: this.getErrorMessage(err),
      });
    }
  }

  async deleteServer(id: string): Promise<void> {
    try {
      await this.db.delete(mcpServers).where(eq(mcpServers.id, id));
      logger.info(`McpRepository: deleted server ${id}`);
    } catch (err: unknown) {
      throw new McpDatabaseError('Failed to delete MCP server', {
        id,
        cause: this.getErrorMessage(err),
      });
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
