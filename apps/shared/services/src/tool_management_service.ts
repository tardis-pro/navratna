import { getIntelligencePool, getControlPool, checkDatabaseHealth } from './database/index';
import { createLogger } from '@uaip/utils';
import type {
  NewToolDefinition,
  ToolDefinition,
} from './database/drizzle/schemas/control_schema';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

type ToolDefinitionColumn =
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'name'
  | 'description'
  | 'category'
  | 'parameters'
  | 'return_type'
  | 'examples'
  | 'security_level'
  | 'cost_estimate'
  | 'execution_time_estimate'
  | 'requires_approval'
  | 'dependencies'
  | 'version'
  | 'author'
  | 'tags'
  | 'is_enabled'
  | 'rate_limits'
  | 'total_executions'
  | 'successful_executions'
  | 'average_execution_time'
  | 'last_used_at'
  | 'documentation_url'
  | 'support_contact'
  | 'changelog'
  | 'deployment_config'
  | 'environment_requirements'
  | 'reliability_score'
  | 'user_rating'
  | 'maintenance_status';

const ALLOWED_TOOL_COLUMNS = new Set<ToolDefinitionColumn>([
  'id',
  'created_at',
  'updated_at',
  'name',
  'description',
  'category',
  'parameters',
  'return_type',
  'examples',
  'security_level',
  'cost_estimate',
  'execution_time_estimate',
  'requires_approval',
  'dependencies',
  'version',
  'author',
  'tags',
  'is_enabled',
  'rate_limits',
  'total_executions',
  'successful_executions',
  'average_execution_time',
  'last_used_at',
  'documentation_url',
  'support_contact',
  'changelog',
  'deployment_config',
  'environment_requirements',
  'reliability_score',
  'user_rating',
  'maintenance_status',
]);

const SAFE_IDENTIFIER_RE = /^[a-z][a-z0-9_]*$/;

function assertSafeToolColumn(col: string): asserts col is ToolDefinitionColumn {
  if (!SAFE_IDENTIFIER_RE.test(col) || !ALLOWED_TOOL_COLUMNS.has(col as ToolDefinitionColumn)) {
    throw new Error(`Column "${col}" is not in the tool_definitions allowed-columns whitelist`);
  }
}

type ToolUsageStats = {
  toolId: string;
  period: string;
  totalUsage: number;
  successfulUsage: number;
  successRate: number;
  totalCost: number;
  averageExecutionTime: number;
  uniqueAgents: number;
};

type AgentCapabilityMetricRow = {
  id: string;
  agent_id: string;
  tool_id: string;
  total_executions: number;
  successful_executions: number;
  total_execution_time: number;
  average_execution_time: number;
  success_rate: number;
  last_used: Date;
};

function objectKeys<T extends object>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}

export class ToolManagementService {
  private logger = createLogger({
    serviceName: 'tool-management-service',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  });

  async createTool(toolData: NewToolDefinition): Promise<ToolDefinition> {
    try {
      const pool = getControlPool();
      const keys = objectKeys(toolData);
      keys.forEach((k) => assertSafeToolColumn(String(k)));
      const values = keys.map((key) => toolData[key]);
      const cols = keys.map((k) => `"${String(k)}"`).join(', ');
      const placeholders = keys.map((_k, i) => `$${i + 1}`).join(', ');
      const queryStr = `INSERT INTO "tool_definitions" (${cols}) VALUES (${placeholders}) RETURNING *`;
      const result = await pool.query(queryStr, values);
      return result.rows[0];
    } catch (error) {
      this.logger.error('Failed to create tool', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async updateTool(toolId: string, updates: Partial<NewToolDefinition>): Promise<ToolDefinition | null> {
    try {
      const pool = getControlPool();
      const data = updates;
      const keys = Object.keys(data);
      if (keys.length === 0) {
        const rows = await pool.query(`SELECT * FROM "tool_definitions" WHERE id = $1 LIMIT 1`, [
          toolId,
        ]);
        return rows.rows[0] ?? null;
      }
      keys.forEach((k) => assertSafeToolColumn(k));
      const setClauses = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
      const values = [toolId, ...Object.values(data)];
      const result = await pool.query(
        `UPDATE "tool_definitions" SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
        values
      );
      return result.rows[0] ?? null;
    } catch (error) {
      this.logger.error('Failed to update tool', { error: error instanceof Error ? error.message : String(error), toolId });
      throw error;
    }
  }

  async deleteTool(toolId: string): Promise<boolean> {
    try {
      const pool = getControlPool();
      const result = await pool.query(`DELETE FROM "tool_definitions" WHERE id = $1`, [toolId]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      this.logger.error('Failed to delete tool', { error: error instanceof Error ? error.message : String(error), toolId });
      throw error;
    }
  }

  async getTool(toolId: string): Promise<ToolDefinition | null> {
    try {
      const pool = getControlPool();
      const rows = await pool.query(`SELECT * FROM "tool_definitions" WHERE id = $1 LIMIT 1`, [
        toolId,
      ]);
      return rows.rows[0] ?? null;
    } catch (error) {
      this.logger.error('Failed to get tool', { error: error instanceof Error ? error.message : String(error), toolId });
      throw error;
    }
  }

  async getTools(_filters?: { category?: string; isEnabled?: boolean }): Promise<ToolDefinition[]> {
    try {
      const pool = getControlPool();
      const result = await pool.query(`SELECT * FROM "tool_definitions" ORDER BY created_at DESC`);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get tools', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async recordToolUsage(usageData: {
    toolId: string;
    agentId: string;
      executionTime: number;
      success: boolean;
      cost?: number;
      metadata?: JsonObject;
    }): Promise<void> {
    try {
      const pool = getControlPool();
      const data = {
        ...usageData,
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const keys = Object.keys(data);
      const values = Object.values(data);
      const cols = keys.map((k) => `"${k}"`).join(', ');
      const placeholders = keys.map((_k, i) => `$${i + 1}`).join(', ');
      await pool.query(
        `INSERT INTO "tool_usage_records" (${cols}) VALUES (${placeholders})`,
        values
      );
      this.logger.info('Tool usage recorded', {
        toolId: usageData.toolId,
        agentId: usageData.agentId,
      });
    } catch (error) {
      this.logger.error('Failed to record tool usage', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getToolUsageStats(toolId: string, days = 30): Promise<ToolUsageStats> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const pool = getControlPool();
      const result = await pool.query<{
        success: boolean;
        cost: number;
        execution_time: number;
        agent_id: string;
      }>(`SELECT * FROM "tool_usage_records" WHERE tool_id = $1 AND created_at >= $2`, [
        toolId,
        since,
      ]);
      const usageRecords = result.rows;
      const totalUsage = usageRecords.length;
      const successfulUsage = usageRecords.filter((r) => r.success).length;
      const totalCost = usageRecords.reduce((sum, r) => sum + (r.cost || 0), 0);
      const avgExecTime =
        totalUsage > 0
          ? usageRecords.reduce((sum, r) => sum + (r.execution_time || 0), 0) / totalUsage
          : 0;
      return {
        toolId,
        period: `${days} days`,
        totalUsage,
        successfulUsage,
        successRate: totalUsage > 0 ? successfulUsage / totalUsage : 0,
        totalCost,
        averageExecutionTime: avgExecTime,
        uniqueAgents: new Set(usageRecords.map((r) => r.agent_id).filter(Boolean)).size,
      };
    } catch (error) {
      this.logger.error('Failed to get tool usage stats', {
        error: error instanceof Error ? error.message : String(error),
        toolId,
      });
      throw error;
    }
  }

  async updateCapabilityMetrics(data: {
    agentId: string;
    toolId: string;
    success: boolean;
    executionTime: number;
  }): Promise<void> {
    try {
      const pool = getIntelligencePool();
      const existing = await pool.query<{
        id: string;
        total_executions: number;
        successful_executions: number;
        total_execution_time: number;
      }>(`SELECT * FROM "agent_capability_metrics" WHERE agent_id = $1 AND tool_id = $2 LIMIT 1`, [
        data.agentId,
        data.toolId,
      ]);
      if (existing.rows[0]) {
        const m = existing.rows[0];
        const total = m.total_executions + 1;
        const successful = m.successful_executions + (data.success ? 1 : 0);
        const totalTime = m.total_execution_time + data.executionTime;
        await pool.query(
          `UPDATE "agent_capability_metrics" SET total_executions=$1, successful_executions=$2, total_execution_time=$3, average_execution_time=$4, success_rate=$5, last_used=NOW(), updated_at=NOW() WHERE id=$6`,
          [total, successful, totalTime, totalTime / total, successful / total, m.id]
        );
      } else {
        const pool = getIntelligencePool();
        await pool.query(
          `INSERT INTO "agent_capability_metrics" (agent_id, tool_id, total_executions, successful_executions, total_execution_time, average_execution_time, success_rate, last_used, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
          [
            data.agentId,
            data.toolId,
            1,
            data.success ? 1 : 0,
            data.executionTime,
            data.executionTime,
            data.success ? 1.0 : 0.0,
            new Date(),
          ]
        );
      }
    } catch (error) {
      this.logger.error('Failed to update capability metrics', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getAgentCapabilityMetrics(agentId: string): Promise<AgentCapabilityMetricRow[]> {
    try {
      const pool = getIntelligencePool();
      const result = await pool.query(
        `SELECT * FROM "agent_capability_metrics" WHERE agent_id = $1`,
        [agentId]
      );
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get agent capability metrics', {
        error: error instanceof Error ? error.message : String(error),
        agentId,
      });
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const health = await checkDatabaseHealth();
      return health.intelligence === 'healthy' && health.control === 'healthy';
    } catch {
      return false;
    }
  }
}
