// Tool Database Service - PostgreSQL Operations
// Handles all PostgreSQL operations for the tools system
// Part of @uaip/shared-services

import { Pool, PoolClient } from 'pg';
import { ToolDefinition, ToolExecution, ToolUsageRecord } from '@uaip/types';
import { logger } from '@uaip/utils';

export interface ToolDatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export class ToolDatabase {
  private pool: Pool;

  constructor(config: ToolDatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
    });

    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Tool CRUD Operations
  async createTool(tool: ToolDefinition): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO tools (
          id, name, description, version, category, parameters, return_type,
          security_level, requires_approval, is_enabled, execution_time_estimate,
          cost_estimate, author, tags, dependencies, rate_limits, examples
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          tool.id,
          tool.name,
          tool.description,
          tool.version,
          tool.category,
          JSON.stringify(tool.parameters),
          JSON.stringify(tool.returnType),
          tool.securityLevel,
          tool.requiresApproval,
          tool.isEnabled,
          tool.executionTimeEstimate,
          tool.costEstimate,
          tool.author,
          tool.tags,
          tool.dependencies,
          JSON.stringify(tool.rateLimits),
          JSON.stringify(tool.examples)
        ]
      );
      logger.info(`Tool created: ${tool.id}`);
    } finally {
      client.release();
    }
  }

  async getTool(id: string): Promise<ToolDefinition | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM tools WHERE id = $1', [id]);
      if (result.rows.length === 0) return null;
      return this.mapRowToTool(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getTools(category?: string, enabled?: boolean): Promise<ToolDefinition[]> {
    const client = await this.pool.connect();
    try {
      let query = 'SELECT * FROM tools WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (enabled !== undefined) {
        query += ` AND is_enabled = $${paramIndex}`;
        params.push(enabled);
        paramIndex++;
      }

      query += ' ORDER BY name';

      const result = await client.query(query, params);
      return result.rows.map(row => this.mapRowToTool(row));
    } finally {
      client.release();
    }
  }

  async updateTool(id: string, updates: Partial<ToolDefinition>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const setClause: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbColumn = this.mapFieldToColumn(key);
          if (dbColumn) {
            setClause.push(`${dbColumn} = $${paramIndex}`);
            params.push(this.serializeValue(key, value));
            paramIndex++;
          }
        }
      });

      if (setClause.length === 0) return;

      setClause.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(id);

      const query = `UPDATE tools SET ${setClause.join(', ')} WHERE id = $${paramIndex}`;
      await client.query(query, params);
      logger.info(`Tool updated: ${id}`);
    } finally {
      client.release();
    }
  }

  async deleteTool(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('DELETE FROM tools WHERE id = $1', [id]);
      logger.info(`Tool deleted: ${id}`);
    } finally {
      client.release();
    }
  }

  async searchTools(query: string): Promise<ToolDefinition[]> {
    const client = await this.pool.connect();
    try {
      const searchQuery = `
        SELECT * FROM tools 
        WHERE is_enabled = true 
        AND (
          name ILIKE $1 
          OR description ILIKE $1 
          OR $2 = ANY(tags)
          OR category ILIKE $1
        )
        ORDER BY 
          CASE 
            WHEN name ILIKE $1 THEN 1
            WHEN description ILIKE $1 THEN 2
            WHEN $2 = ANY(tags) THEN 3
            ELSE 4
          END,
          usage_count DESC
      `;
      const searchTerm = `%${query}%`;
      const result = await client.query(searchQuery, [searchTerm, query]);
      return result.rows.map(row => this.mapRowToTool(row));
    } finally {
      client.release();
    }
  }

  // Tool Execution Operations
  async createExecution(execution: ToolExecution): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO tool_executions (
          id, tool_id, agent_id, parameters, status, start_time,
          approval_required, retry_count, max_retries, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          execution.id,
          execution.toolId,
          execution.agentId,
          JSON.stringify(execution.parameters),
          execution.status,
          execution.startTime,
          execution.approvalRequired,
          execution.retryCount,
          execution.maxRetries,
          JSON.stringify(execution.metadata)
        ]
      );
    } finally {
      client.release();
    }
  }

  async updateExecution(id: string, updates: Partial<ToolExecution>): Promise<void> {
    const client = await this.pool.connect();
    try {
      const setClause: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (updates.status) {
        setClause.push(`status = $${paramIndex}`);
        params.push(updates.status);
        paramIndex++;
      }

      if (updates.result !== undefined) {
        setClause.push(`result = $${paramIndex}`);
        params.push(JSON.stringify(updates.result));
        paramIndex++;
      }

      if (updates.error) {
        setClause.push(`error_type = $${paramIndex}, error_message = $${paramIndex + 1}, error_details = $${paramIndex + 2}`);
        params.push(updates.error.type, updates.error.message, JSON.stringify(updates.error.details));
        paramIndex += 3;
      }

      if (updates.endTime) {
        setClause.push(`end_time = $${paramIndex}`);
        params.push(updates.endTime);
        paramIndex++;
      }

      if (updates.executionTimeMs) {
        setClause.push(`execution_time_ms = $${paramIndex}`);
        params.push(updates.executionTimeMs);
        paramIndex++;
      }

      if (updates.cost) {
        setClause.push(`cost = $${paramIndex}`);
        params.push(updates.cost);
        paramIndex++;
      }

      if (setClause.length === 0) return;

      params.push(id);
      const query = `UPDATE tool_executions SET ${setClause.join(', ')} WHERE id = $${paramIndex}`;
      await client.query(query, params);
    } finally {
      client.release();
    }
  }

  async getExecution(id: string): Promise<ToolExecution | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM tool_executions WHERE id = $1', [id]);
      if (result.rows.length === 0) return null;
      return this.mapRowToExecution(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async getExecutions(toolId?: string, agentId?: string, status?: string, limit = 100): Promise<ToolExecution[]> {
    const client = await this.pool.connect();
    try {
      let query = 'SELECT * FROM tool_executions WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (toolId) {
        query += ` AND tool_id = $${paramIndex}`;
        params.push(toolId);
        paramIndex++;
      }

      if (agentId) {
        query += ` AND agent_id = $${paramIndex}`;
        params.push(agentId);
        paramIndex++;
      }

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY start_time DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await client.query(query, params);
      return result.rows.map(row => this.mapRowToExecution(row));
    } finally {
      client.release();
    }
  }

  // Usage Analytics
  async recordUsage(usage: ToolUsageRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO tool_usage_records (
          tool_id, agent_id, execution_id, timestamp, success,
          execution_time_ms, cost, error_type, parameters_hash, context_tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          usage.toolId,
          usage.agentId,
          null, // execution_id will be set separately if needed
          usage.timestamp,
          usage.success,
          usage.executionTime,
          usage.cost,
          usage.errorType,
          null, // parameters_hash for privacy
          [] // context_tags
        ]
      );

      // Update tool usage count
      await client.query(
        'UPDATE tools SET usage_count = usage_count + 1 WHERE id = $1',
        [usage.toolId]
      );
    } finally {
      client.release();
    }
  }

  async getUsageStats(toolId?: string, agentId?: string, days = 30): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT 
          tool_id,
          agent_id,
          COUNT(*) as total_uses,
          COUNT(*) FILTER (WHERE success = true) as successful_uses,
          AVG(execution_time_ms) as avg_execution_time,
          SUM(cost) as total_cost,
          DATE_TRUNC('day', timestamp) as date
        FROM tool_usage_records 
        WHERE timestamp >= NOW() - INTERVAL '${days} days'
      `;
      
      const params: any[] = [];
      let paramIndex = 1;

      if (toolId) {
        query += ` AND tool_id = $${paramIndex}`;
        params.push(toolId);
        paramIndex++;
      }

      if (agentId) {
        query += ` AND agent_id = $${paramIndex}`;
        params.push(agentId);
        paramIndex++;
      }

      query += ' GROUP BY tool_id, agent_id, DATE_TRUNC(\'day\', timestamp) ORDER BY date DESC';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Helper methods
  private mapRowToTool(row: any): ToolDefinition {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      category: row.category,
      parameters: row.parameters,
      returnType: row.return_type,
      securityLevel: row.security_level,
      requiresApproval: row.requires_approval,
      isEnabled: row.is_enabled,
      executionTimeEstimate: row.execution_time_estimate,
      costEstimate: parseFloat(row.cost_estimate || '0'),
      author: row.author,
      tags: row.tags || [],
      dependencies: row.dependencies || [],
      rateLimits: row.rate_limits,
      examples: row.examples || []
    };
  }

  private mapRowToExecution(row: any): ToolExecution {
    return {
      id: row.id,
      toolId: row.tool_id,
      agentId: row.agent_id,
      parameters: row.parameters || {},
      status: row.status,
      startTime: row.start_time,
      endTime: row.end_time,
      result: row.result,
      error: row.error_type ? {
        type: row.error_type,
        message: row.error_message,
        details: row.error_details,
        recoverable: false,
        suggestedAction: undefined
      } : undefined,
      approvalRequired: row.approval_required,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      cost: parseFloat(row.cost || '0'),
      executionTimeMs: row.execution_time_ms,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      metadata: row.metadata || {}
    };
  }

  private mapFieldToColumn(field: string): string | null {
    const fieldMap: Record<string, string> = {
      'name': 'name',
      'description': 'description',
      'version': 'version',
      'category': 'category',
      'parameters': 'parameters',
      'returnType': 'return_type',
      'securityLevel': 'security_level',
      'requiresApproval': 'requires_approval',
      'isEnabled': 'is_enabled',
      'executionTimeEstimate': 'execution_time_estimate',
      'costEstimate': 'cost_estimate',
      'author': 'author',
      'tags': 'tags',
      'dependencies': 'dependencies',
      'rateLimits': 'rate_limits',
      'examples': 'examples'
    };
    return fieldMap[field] || null;
  }

  private serializeValue(field: string, value: any): any {
    const jsonFields = ['parameters', 'returnType', 'rateLimits', 'examples'];
    if (jsonFields.includes(field)) {
      return JSON.stringify(value);
    }
    return value;
  }
} 