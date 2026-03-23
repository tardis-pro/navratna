import { typeormService } from './typeormService';
import { getIntelligencePool, getControlPool } from './database/drizzle/clients/index';
import { createLogger } from '@uaip/utils';

export class ToolManagementService {
  private logger = createLogger({
    serviceName: 'tool-management-service',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  });

  async createTool(toolData: unknown): Promise<unknown> {
    try {
      return await typeormService.create('tool_definitions', toolData as Record<string, unknown>);
    } catch (error) {
      this.logger.error('Failed to create tool', { error: (error as Error).message });
      throw error;
    }
  }

  async updateTool(toolId: string, updates: unknown): Promise<unknown> {
    try {
      return await typeormService.update('tool_definitions', toolId, updates as Record<string, unknown>);
    } catch (error) {
      this.logger.error('Failed to update tool', { error: (error as Error).message, toolId });
      throw error;
    }
  }

  async deleteTool(toolId: string): Promise<boolean> {
    try {
      return await typeormService.delete('tool_definitions', toolId);
    } catch (error) {
      this.logger.error('Failed to delete tool', { error: (error as Error).message, toolId });
      throw error;
    }
  }

  async getTool(toolId: string): Promise<unknown> {
    try {
      return await typeormService.findById('tool_definitions', toolId);
    } catch (error) {
      this.logger.error('Failed to get tool', { error: (error as Error).message, toolId });
      throw error;
    }
  }

  async getTools(_filters?: unknown): Promise<unknown[]> {
    try {
      const pool = getControlPool();
      const result = await pool.query(`SELECT * FROM "tool_definitions" ORDER BY created_at DESC`);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get tools', { error: (error as Error).message });
      throw error;
    }
  }

  async recordToolUsage(usageData: {
    toolId: string;
    agentId: string;
    executionTime: number;
    success: boolean;
    cost?: number;
    metadata?: unknown;
  }): Promise<void> {
    try {
      await typeormService.create('tool_usage_records', {
        ...usageData,
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      this.logger.info('Tool usage recorded', { toolId: usageData.toolId, agentId: usageData.agentId });
    } catch (error) {
      this.logger.error('Failed to record tool usage', { error: (error as Error).message });
      throw error;
    }
  }

  async getToolUsageStats(toolId: string, days = 30): Promise<unknown> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const pool = getControlPool();
      const result = await pool.query<{
        success: boolean; cost: number; execution_time: number; agent_id: string;
      }>(
        `SELECT * FROM "tool_usage_records" WHERE tool_id = $1 AND created_at >= $2`,
        [toolId, since]
      );
      const usageRecords = result.rows;
      const totalUsage = usageRecords.length;
      const successfulUsage = usageRecords.filter((r) => r.success).length;
      const totalCost = usageRecords.reduce((sum, r) => sum + (r.cost || 0), 0);
      const avgExecTime = totalUsage > 0
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
      this.logger.error('Failed to get tool usage stats', { error: (error as Error).message, toolId });
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
      const existing = await pool.query<{ id: string; total_executions: number; successful_executions: number; total_execution_time: number }>(
        `SELECT * FROM "agent_capability_metrics" WHERE agent_id = $1 AND tool_id = $2 LIMIT 1`,
        [data.agentId, data.toolId]
      );
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
        await typeormService.create('agent_capability_metrics', {
          agentId: data.agentId, toolId: data.toolId,
          totalExecutions: 1, successfulExecutions: data.success ? 1 : 0,
          totalExecutionTime: data.executionTime, averageExecutionTime: data.executionTime,
          successRate: data.success ? 1.0 : 0.0, lastUsed: new Date(),
        });
      }
    } catch (error) {
      this.logger.error('Failed to update capability metrics', { error: (error as Error).message });
      throw error;
    }
  }

  async getAgentCapabilityMetrics(agentId: string): Promise<unknown[]> {
    try {
      const pool = getIntelligencePool();
      const result = await pool.query(
        `SELECT * FROM "agent_capability_metrics" WHERE agent_id = $1`,
        [agentId]
      );
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get agent capability metrics', { error: (error as Error).message, agentId });
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const health = await typeormService.healthCheck();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }
}
