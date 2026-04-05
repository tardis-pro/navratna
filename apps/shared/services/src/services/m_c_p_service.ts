import { getControlPool } from '../database/drizzle/clients/index';
import { logger } from '@uaip/utils';
import type { MCPJobRequest } from '@uaip/types';

const MCP_ALLOWED_TABLES = new Set(['mcp_tool_calls', 'mcp_servers']);

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function assertSafeTable(table: string): void {
  if (!MCP_ALLOWED_TABLES.has(table)) {
    throw new Error(`Table "${table}" is not in the MCP allowed-tables whitelist`);
  }
}

function assertSafeColumn(column: string): void {
  if (!SAFE_IDENTIFIER.test(column)) {
    throw new Error(`Column name "${column}" contains unsafe characters`);
  }
}

async function updateRecordInTable(
  table: string,
  id: string,
  updates: Record<string, unknown>,
  notFoundMessage: string
): Promise<Record<string, unknown>> {
  assertSafeTable(table);
  const pool = getControlPool();
  const keys = Object.keys(updates);
  if (keys.length === 0) {
    const result = await pool.query(`SELECT * FROM "${table}" WHERE id = $1 LIMIT 1`, [id]);
    if (result.rows.length === 0) throw new Error(notFoundMessage);
    return result.rows[0];
  }
  for (const k of keys) assertSafeColumn(k);
  const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
  const values = [id, ...keys.map((k) => updates[k])];
  const result = await pool.query(
    `UPDATE "${table}" SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw new Error(notFoundMessage);
  return result.rows[0];
}

export class MCPService {
  private static instance: MCPService;

  private constructor() {}

  public static getInstance(): MCPService {
    if (!MCPService.instance) {
      MCPService.instance = new MCPService();
    }
    return MCPService.instance;
  }

  async createToolCall(request: MCPJobRequest): Promise<Record<string, unknown>> {
    const pool = getControlPool();

    const result = await pool.query(
      `INSERT INTO mcp_tool_calls (server_id, tool_name, agent_id, user_id, parameters, status, security_level, approval_required, timeout_seconds, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        request.serverId,
        request.toolName,
        request.agentId || null,
        request.userId || null,
        JSON.stringify(request.parameters),
        'pending',
        request.securityLevel || 'medium',
        request.approvalRequired || false,
        request.timeoutSeconds || 30,
        request.metadata ? JSON.stringify(request.metadata) : null,
      ]
    );

    const toolCall = result.rows[0];
    logger.info(
      `Created MCP tool call: ${toolCall.id} for ${request.serverId}:${request.toolName}`
    );
    return toolCall;
  }

  async updateToolCall(id: string, updates: Record<string, unknown>): Promise<Record<string, unknown>> {
    return updateRecordInTable('mcp_tool_calls', id, updates, `Tool call not found: ${id}`);
  }

  async getToolCall(id: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(`SELECT * FROM mcp_tool_calls WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0] ?? null;
  }

  async startToolCall(id: string): Promise<Record<string, unknown>> {
    return await this.updateToolCall(id, {
      status: 'running',
      start_time: new Date().toISOString(),
    });
  }

  async completeToolCall(
    id: string,
    resultData: Record<string, unknown>,
    executionTimeMs?: number
  ): Promise<Record<string, unknown>> {
    return await this.updateToolCall(id, {
      status: 'completed',
      result: JSON.stringify(resultData),
      end_time: new Date().toISOString(),
      execution_time_ms: executionTimeMs,
    });
  }

  async failToolCall(
    id: string,
    error: string,
    errorCode?: string,
    errorCategory?: 'network' | 'timeout' | 'validation' | 'execution' | 'permission' | 'resource'
  ): Promise<Record<string, unknown>> {
    return await this.updateToolCall(id, {
      status: 'failed',
      error,
      error_code: errorCode,
      error_category: errorCategory,
      end_time: new Date().toISOString(),
    });
  }

  async getToolCallsByServer(
    serverId: string,
    limit: number = 100
  ): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM mcp_tool_calls WHERE server_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [serverId, limit]
    );
    return result.rows;
  }

  async getToolCallsByAgent(
    agentId: string,
    limit: number = 100
  ): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM mcp_tool_calls WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [agentId, limit]
    );
    return result.rows;
  }

  async getToolCallsByStatus(
    status: 'pending' | 'running' | 'completed' | 'failed'
  ): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM mcp_tool_calls WHERE status = $1 ORDER BY created_at DESC`,
      [status]
    );
    return result.rows;
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
    const pool = getControlPool();
    let query = 'SELECT status, execution_time_ms FROM mcp_tool_calls';
    const params: unknown[] = [];

    if (serverId) {
      query += ' WHERE server_id = $1';
      params.push(serverId);
    }

    const result = await pool.query(query, params);
    type ToolCallRow = { status: string; execution_time_ms: number | null };
    const rows: ToolCallRow[] = result.rows as ToolCallRow[];

    const stats = {
      total: rows.length,
      completed: rows.filter((r: { status: string }) => r.status === 'completed').length,
      failed: rows.filter((r: { status: string }) => r.status === 'failed').length,
      pending: rows.filter((r: { status: string }) => r.status === 'pending').length,
      running: rows.filter((r: { status: string }) => r.status === 'running').length,
      averageExecutionTime: 0,
      successRate: 0,
    };

    const completedWithTimes = rows.filter(
      (r: { status: string; execution_time_ms: number | null }) =>
        r.status === 'completed' && r.execution_time_ms
    );

    if (completedWithTimes.length > 0) {
      stats.averageExecutionTime =
        completedWithTimes.reduce(
          (sum: number, r: { execution_time_ms: number }) => sum + r.execution_time_ms,
          0
        ) / completedWithTimes.length;
    }

    if (stats.total > 0) {
      stats.successRate = (stats.completed / stats.total) * 100;
    }

    return stats;
  }

  async createServer(serverData: Record<string, unknown>): Promise<Record<string, unknown>> {
    const pool = getControlPool();
    const result = await pool.query(
      `INSERT INTO mcp_servers (name, description, type, command, args, env, enabled, auto_start, retry_attempts, timeout, author, version, security_level, status, capabilities)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        serverData.name,
        serverData.description,
        serverData.type,
        serverData.command || null,
        serverData.args ? JSON.stringify(serverData.args) : '[]',
        serverData.env ? JSON.stringify(serverData.env) : '{}',
        serverData.enabled ?? true,
        serverData.autoStart ?? false,
        serverData.retryAttempts ?? 3,
        serverData.timeout ?? 30000,
        serverData.author || '',
        serverData.version || '1.0.0',
        serverData.securityLevel || 'medium',
        'stopped',
        serverData.capabilities ? JSON.stringify(serverData.capabilities) : null,
      ]
    );

    logger.info(`Created MCP server: ${result.rows[0].id} (${result.rows[0].name})`);
    return result.rows[0];
  }

  async updateServer(id: string, updates: Record<string, unknown>): Promise<Record<string, unknown>> {
    return updateRecordInTable('mcp_servers', id, updates, `Server not found: ${id}`);
  }

  async getServer(id: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(`SELECT * FROM mcp_servers WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0] ?? null;
  }

  async getServerByName(name: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(`SELECT * FROM mcp_servers WHERE name = $1 LIMIT 1`, [name]);
    return result.rows[0] ?? null;
  }

  async getAllServers(): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(`SELECT * FROM mcp_servers ORDER BY name ASC`);
    return result.rows;
  }

  async deleteServer(id: string): Promise<void> {
    const pool = getControlPool();
    await pool.query(`DELETE FROM mcp_servers WHERE id = $1`, [id]);
    logger.info(`Deleted MCP server: ${id}`);
  }

  async retryToolCall(id: string): Promise<Record<string, unknown> | null> {
    const toolCall = await this.getToolCall(id);
    if (!toolCall) return null;

    const rawMeta = toolCall.metadata;
    const meta: Record<string, unknown> =
      typeof rawMeta === 'object' && rawMeta !== null && !Array.isArray(rawMeta)
        ? (rawMeta as Record<string, unknown>)
        : {};

    const maxRetries = typeof meta.maxRetries === 'number' ? meta.maxRetries : 3;
    const retryCount = typeof meta.retryCount === 'number' ? meta.retryCount : 0;

    if (retryCount >= maxRetries) {
      logger.warn(`Max retries exceeded for tool call: ${id}`);
      return null;
    }

    return await this.updateToolCall(id, {
      status: 'pending',
      metadata: JSON.stringify({
        ...meta,
        retryCount: retryCount + 1,
      }),
    });
  }

  async cancelToolCall(
    id: string,
    reason?: string,
    cancelledBy?: string
  ): Promise<Record<string, unknown>> {
    return await this.updateToolCall(id, {
      status: 'failed',
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelledBy,
      cancellation_reason: reason || 'Job cancelled',
      error: 'Job was cancelled',
    });
  }

  async cleanupOldToolCalls(daysToKeep: number = 30): Promise<number> {
    const pool = getControlPool();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await pool.query(`DELETE FROM mcp_tool_calls WHERE created_at < $1`, [
      cutoffDate,
    ]);

    const deletedCount = result.rowCount ?? 0;
    logger.info(`Cleaned up ${deletedCount} old MCP tool calls older than ${daysToKeep} days`);
    return deletedCount;
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    pendingJobs: number;
    runningJobs: number;
    totalServers: number;
    runningServers: number;
  }> {
    try {
      const pool = getControlPool();
      const pendingResult = await pool.query(
        `SELECT COUNT(*) as count FROM mcp_tool_calls WHERE status = 'pending'`
      );
      const runningResult = await pool.query(
        `SELECT COUNT(*) as count FROM mcp_tool_calls WHERE status = 'running'`
      );
      const serversResult = await pool.query(`SELECT COUNT(*) as count FROM mcp_servers`);
      const runningServersResult = await pool.query(
        `SELECT COUNT(*) as count FROM mcp_servers WHERE status = 'running'`
      );

      return {
        healthy: true,
        pendingJobs: Number(pendingResult.rows[0].count),
        runningJobs: Number(runningResult.rows[0].count),
        totalServers: Number(serversResult.rows[0].count),
        runningServers: Number(runningServersResult.rows[0].count),
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
