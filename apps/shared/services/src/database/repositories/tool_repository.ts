import { BaseRepository } from '../base/base_repository';
import { getControlPool } from '../drizzle/clients/index';

export class ToolRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'tool_definitions';
  }
  get plane(): 'control' {
    return 'control';
  }

  async createTool(data: {
    name: string;
    description: string;
    category: string;
    isEnabled?: boolean;
    version?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    configuration?: Record<string, unknown>;
    requiredPermissions?: string[];
    securityLevel?: string;
    maxRetries?: number;
    timeout?: number;
  }): Promise<Record<string, unknown>> {
    const pool = getControlPool();
    const result = await pool.query(
      `INSERT INTO tool_definitions (name, description, category, security_level, version, parameters, is_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        data.name,
        data.description,
        data.category,
        data.securityLevel || 'medium',
        data.version || '1.0.0',
        JSON.stringify({
          inputSchema: data.inputSchema,
          outputSchema: data.outputSchema,
          configuration: data.configuration,
        }),
        data.isEnabled ?? true,
      ]
    );
    return result.rows[0];
  }

  async getTools(filters: {
    enabled?: boolean;
    category?: string;
  }): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    let query = 'SELECT * FROM tool_definitions WHERE 1=1';
    const params: unknown[] = [];

    if (filters.enabled !== undefined) {
      params.push(filters.enabled);
      query += ` AND is_enabled = $${params.length}`;
    }
    if (filters.category) {
      params.push(filters.category);
      query += ` AND category = $${params.length}`;
    }

    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);
    return result.rows;
  }
}

export class ToolExecutionRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'tool_executions';
  }
  get plane(): 'control' {
    return 'control';
  }

  async createToolExecution(data: {
    toolId: string;
    agentId?: string;
    userId?: string;
    parameters?: Record<string, unknown>;
    status?: string;
    startTime?: Date;
    approvalRequired?: boolean;
    success?: boolean;
    retryCount?: number;
    maxRetries?: number;
  }): Promise<Record<string, unknown>> {
    const pool = getControlPool();
    const result = await pool.query(
      `INSERT INTO tool_executions (tool_id, agent_id, user_id, parameters, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        data.toolId,
        data.agentId || null,
        data.userId || null,
        JSON.stringify(data.parameters || {}),
        data.status || 'pending',
        JSON.stringify({
          approvalRequired: data.approvalRequired,
          retryCount: data.retryCount,
          maxRetries: data.maxRetries,
        }),
      ]
    );
    return result.rows[0];
  }

  async getToolExecution(id: string): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(`SELECT * FROM tool_executions WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0] ?? null;
  }

  async getToolExecutions(filters: {
    toolId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    let query = 'SELECT * FROM tool_executions WHERE 1=1';
    const params: unknown[] = [];

    if (filters.toolId) {
      params.push(filters.toolId);
      query += ` AND tool_id = $${params.length}`;
    }
    if (filters.agentId) {
      params.push(filters.agentId);
      query += ` AND agent_id = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';
    if (filters.limit) {
      params.push(filters.limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await pool.query(query, params);
    return result.rows;
  }
}

export class ToolUsageRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'tool_usage_records';
  }
  get plane(): 'control' {
    return 'control';
  }

  async recordToolUsage(data: {
    toolId: string;
    agentId?: string;
    userId?: string;
    executionTimeMs?: number;
    success?: boolean;
    error?: string;
    usedAt?: Date;
  }): Promise<Record<string, unknown>> {
    const pool = getControlPool();
    const result = await pool.query(
      `INSERT INTO tool_usage_records (tool_id, agent_id, user_id, duration, success, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        data.toolId,
        data.agentId || null,
        data.userId || null,
        data.executionTimeMs || 0,
        data.success ?? true,
        JSON.stringify({ error: data.error }),
        data.usedAt || new Date(),
      ]
    );
    return result.rows[0];
  }

  async getToolUsageStats(_filters: { toolId?: string; days?: number }): Promise<unknown> {
    return {};
  }
}

export class ToolAssignmentRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'tool_assignments';
  }
  get plane(): 'control' {
    return 'control';
  }

  async findByAgentAndTool(
    agentId: string,
    toolId: string
  ): Promise<Record<string, unknown> | null> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM tool_assignments WHERE agent_id = $1 AND tool_id = $2 LIMIT 1`,
      [agentId, toolId]
    );
    return result.rows[0] ?? null;
  }

  async findByAgent(agentId: string): Promise<Record<string, unknown>[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT ta.*, td.name as tool_name, td.description as tool_description
       FROM tool_assignments ta
       LEFT JOIN tool_definitions td ON ta.tool_id = td.id
       WHERE ta.agent_id = $1`,
      [agentId]
    );
    return result.rows;
  }
}
