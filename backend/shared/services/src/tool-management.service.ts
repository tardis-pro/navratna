import { typeormService } from './typeormService.js';
import { createLogger } from '@uaip/utils';

/**
 * Tool Management Service
 * Provides high-level operations for tool management without exposing TypeORM details
 */
export class ToolManagementService {
  private logger = createLogger({
    serviceName: 'tool-management-service',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  });

  // Tool Definition Operations
  async createTool(toolData: any): Promise<any> {
    try {
      return await typeormService.create('ToolDefinition', toolData);
    } catch (error) {
      this.logger.error('Failed to create tool', { error: error.message, toolData });
      throw error;
    }
  }

  async updateTool(toolId: string, updates: any): Promise<any> {
    try {
      return await typeormService.update('ToolDefinition', toolId, updates);
    } catch (error) {
      this.logger.error('Failed to update tool', { error: error.message, toolId, updates });
      throw error;
    }
  }

  async deleteTool(toolId: string): Promise<boolean> {
    try {
      return await typeormService.delete('ToolDefinition', toolId);
    } catch (error) {
      this.logger.error('Failed to delete tool', { error: error.message, toolId });
      throw error;
    }
  }

  async getTool(toolId: string): Promise<any> {
    try {
      return await typeormService.findById('ToolDefinition', toolId);
    } catch (error) {
      this.logger.error('Failed to get tool', { error: error.message, toolId });
      throw error;
    }
  }

  async getTools(filters?: any): Promise<any[]> {
    try {
      const { ToolDefinition } = await import('./entities/index.js');
      const repository = typeormService.getRepository(ToolDefinition);
      return await repository.find(filters || {});
    } catch (error) {
      this.logger.error('Failed to get tools', { error: error.message, filters });
      throw error;
    }
  }

  // Tool Usage Operations
  async recordToolUsage(usageData: {
    toolId: string;
    agentId: string;
    executionTime: number;
    success: boolean;
    cost?: number;
    metadata?: any;
  }): Promise<void> {
    try {
      const usageRecord = {
        ...usageData,
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await typeormService.create('ToolUsageRecord', usageRecord);
      this.logger.info('Tool usage recorded', { toolId: usageData.toolId, agentId: usageData.agentId });
    } catch (error) {
      this.logger.error('Failed to record tool usage', { error: error.message, usageData });
      throw error;
    }
  }

  async getToolUsageStats(toolId: string, days = 30): Promise<any> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { ToolUsageRecord } = await import('./entities/index.js');
      const { MoreThanOrEqual } = await import('typeorm');
      const repository = typeormService.getRepository(ToolUsageRecord);
      const usageRecords = await repository.find({
        where: { 
          toolId,
          usedAt: MoreThanOrEqual(since)
        } as any
      });

      const totalUsage = usageRecords.length;
      const successfulUsage = usageRecords.filter((r: any) => r.success).length;
      const totalCost = usageRecords.reduce((sum: number, r: any) => sum + (r.cost || 0), 0);
      const avgExecutionTime = usageRecords.length > 0 
        ? usageRecords.reduce((sum: number, r: any) => sum + r.executionTime, 0) / usageRecords.length 
        : 0;

      return {
        toolId,
        period: `${days} days`,
        totalUsage,
        successfulUsage,
        successRate: totalUsage > 0 ? successfulUsage / totalUsage : 0,
        totalCost,
        averageExecutionTime: avgExecutionTime,
        uniqueAgents: new Set(usageRecords.map((r: any) => r.agentId)).size
      };
    } catch (error) {
      this.logger.error('Failed to get tool usage stats', { error: error.message, toolId });
      throw error;
    }
  }

  // Agent Capability Metrics Operations
  async updateCapabilityMetrics(data: {
    agentId: string;
    toolId: string;
    success: boolean;
    executionTime: number;
  }): Promise<void> {
    try {
      const { AgentCapabilityMetric } = await import('./entities/index.js');
      const repository = typeormService.getRepository(AgentCapabilityMetric);
      
      let metric = await repository.findOne({
        where: { agentId: data.agentId, toolId: data.toolId } as any
      });

      if (metric) {
        // Update existing metric
        const totalExecutions = (metric as any).totalExecutions + 1;
        const successfulExecutions = (metric as any).successfulExecutions + (data.success ? 1 : 0);
        const totalExecutionTime = (metric as any).totalExecutionTime + data.executionTime;

        await typeormService.update('AgentCapabilityMetric', metric.id, {
          totalExecutions,
          successfulExecutions,
          totalExecutionTime,
          averageExecutionTime: totalExecutionTime / totalExecutions,
          successRate: successfulExecutions / totalExecutions,
          lastUsed: new Date(),
          updatedAt: new Date()
        });
      } else {
        // Create new metric
        const newMetric = {
          agentId: data.agentId,
          toolId: data.toolId,
          totalExecutions: 1,
          successfulExecutions: data.success ? 1 : 0,
          totalExecutionTime: data.executionTime,
          averageExecutionTime: data.executionTime,
          successRate: data.success ? 1.0 : 0.0,
          lastUsed: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await typeormService.create('AgentCapabilityMetric', newMetric);
      }
    } catch (error) {
      this.logger.error('Failed to update capability metrics', { error: error.message, data });
      throw error;
    }
  }

  async getAgentCapabilityMetrics(agentId: string): Promise<any[]> {
    try {
      const { AgentCapabilityMetric } = await import('./entities/index.js');
      const repository = typeormService.getRepository(AgentCapabilityMetric);
      return await repository.find({
        where: { agentId }
      });
    } catch (error) {
      this.logger.error('Failed to get agent capability metrics', { error: error.message, agentId });
      throw error;
    }
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      const health = await typeormService.healthCheck();
      return health.status === 'healthy';
    } catch (error) {
      return false;
    }
  }
} 