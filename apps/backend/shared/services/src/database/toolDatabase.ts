// Tool Database Service - Drizzle Implementation
// Handles all database operations for the tools system using Drizzle
// Part of @uaip/shared-services

import { logger } from '@uaip/utils';
import {
  ToolDefinition,
  ToolExecution,
  ToolUsageRecord,
  ToolCategory,
  ToolExecutionStatus,
  ToolExample,
} from '@uaip/types';
import { DatabaseService } from '../databaseService';



export class ToolDatabase {
  private databaseService: DatabaseService;

  constructor(_dbConfig?: Record<string, unknown>) {
    // Ignore the dbConfig parameter for backward compatibility
    // Drizzle connection is managed by DatabaseService
    this.databaseService = DatabaseService.getInstance();
  }

  async close(): Promise<void> {
    // Drizzle connection is managed by DatabaseService
    // No need to close individual connections
    logger.debug('ToolDatabase close() called - connection managed by DatabaseService');
  }

  // Tool CRUD Operations
  async createTool(tool: ToolDefinition): Promise<void> {
    try {
      // Convert ToolDefinition to the format expected by ToolService.createTool
      const toolData = {
        name: tool.name,
        displayName: tool.name, // Use name as displayName if not provided
        description: tool.description,
        category: tool.category,
        version: tool.version,
        inputSchema: tool.parameters as Record<string, unknown>,
        outputSchema: tool.returnType as Record<string, unknown>,
        securityLevel: tool.securityLevel,
        maxRetries: 3,
        timeout: 30000,
      };
      await this.databaseService.tools.createTool(toolData);
      logger.info(`Tool created: ${tool.id}`);
    } catch (error) {
      logger.error('Error creating tool', { tool, error: (error as Error).message });
      throw error;
    }
  }

  async getTool(id: string): Promise<ToolDefinition | null> {
    try {
      const entity = await this.databaseService.tools.findToolById(id);
      return entity ? this.convertEntityToTool(entity) : null;
    } catch (error) {
      logger.error('Error getting tool', { id, error: (error as Error).message });
      throw error;
    }
  }

  async getTools(category?: string, _enabled?: boolean): Promise<ToolDefinition[]> {
    try {
      const entities = await this.databaseService.tools.findActiveTools();
      return entities.map((entity) => this.convertEntityToTool(entity));
    } catch (error) {
      logger.error('Error getting tools', { category, error: (error as Error).message });
      throw error;
    }
  }

  async updateTool(id: string, updates: Partial<ToolDefinition>): Promise<void> {
    try {
      const entityUpdates = this.convertToolToEntity(updates);
      const result = await this.databaseService.tools.updateTool(id, entityUpdates);
      if (!result) {
        throw new Error(`Tool not found: ${id}`);
      }
      logger.info(`Tool updated: ${id}`);
    } catch (error) {
      logger.error('Error updating tool', { id, updates, error: (error as Error).message });
      throw error;
    }
  }

  async deleteTool(id: string): Promise<void> {
    try {
      const deleted = await this.databaseService.tools.deactivateTool(id);
      if (!deleted) {
        throw new Error(`Tool not found: ${id}`);
      }
      logger.info(`Tool deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting tool', { id, error: (error as Error).message });
      throw error;
    }
  }

  async searchTools(query: string): Promise<ToolDefinition[]> {
    try {
      const entities = await this.databaseService.tools.findToolsByCategory(query);
      return entities.map((entity) => this.convertEntityToTool(entity));
    } catch (error) {
      logger.error('Error searching tools', { query, error: (error as Error).message });
      throw error;
    }
  }

  // Tool Execution Operations
  async createExecution(execution: ToolExecution): Promise<void> {
    try {
      // Convert ToolExecution to the format expected by ToolService.createExecution
      const executionData = {
        toolId: execution.toolId,
        agentId: execution.agentId,
        input: execution.parameters || {},
        context: execution.metadata,
        traceId: execution.id,
      };
      await this.databaseService.tools.createExecution(executionData);
      logger.debug(`Tool execution created`);
    } catch (error) {
      logger.error('Error creating tool execution', { execution, error: (error as Error).message });
      throw error;
    }
  }

  async updateExecution(id: string, updates: Partial<ToolExecution>): Promise<void> {
    try {
      const result = await this.databaseService.tools.updateExecution(id, {
        status: updates.status,
        output:
          typeof updates.result === 'object' && updates.result !== null
            ? (updates.result as Record<string, unknown>)
            : undefined,
        error: updates.error ? JSON.stringify(updates.error) : undefined,
        metadata: updates.metadata as Record<string, unknown> | undefined,
        duration: updates.executionTimeMs,
      });
      if (!result) {
        throw new Error(`Tool execution not found: ${id}`);
      }
      logger.debug(`Tool execution updated: ${id}`);
    } catch (error) {
      logger.error('Error updating tool execution', {
        id,
        updates,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async getExecution(id: string): Promise<ToolExecution | null> {
    try {
      const result = await this.databaseService.tools.findExecutionById(id);
      return result ? this.convertEntityToExecution(result) : null;
    } catch (error) {
      logger.error('Error getting tool execution', { id, error: (error as Error).message });
      throw error;
    }
  }

  async getExecutions(
    toolId?: string,
    agentId?: string,
    _status?: string,
    limit = 100
  ): Promise<ToolExecution[]> {
    try {
      if (toolId) {
        const results = await this.databaseService.tools.findExecutionsByTool(toolId, limit);
        return results.map((entity) => this.convertEntityToExecution(entity));
      } else if (agentId) {
        const results = await this.databaseService.tools.findExecutionsByAgent(agentId, limit);
        return results.map((entity) => this.convertEntityToExecution(entity));
      } else {
        // For general queries, use findExecutionsByTool with no filter (returns empty)
        return [];
      }
    } catch (error) {
      logger.error('Error getting tool executions', {
        toolId,
        agentId,
        limit,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Usage Analytics
  async recordUsage(usage: ToolUsageRecord): Promise<void> {
    try {
      await this.databaseService.tools.trackUsage({
        toolId: usage.toolId,
        agentId: usage.agentId,
        executionTime: usage.duration,
        success: usage.success,
        error: usage.errorCode,
      });

      logger.debug(`Tool usage recorded for tool: ${usage.toolId}`);
    } catch (error) {
      logger.error('Error recording tool usage', { usage, error: (error as Error).message });
      throw error;
    }
  }

  async getUsageStats(
    toolId?: string,
    _agentId?: string,
    days = 30
  ): Promise<Record<string, unknown>[]> {
    try {
      if (toolId) {
        const stats = await this.databaseService.tools.getToolUsageStats(toolId, days);
        return [
          typeof stats === 'object' && stats !== null ? (stats as Record<string, unknown>) : {},
        ];
      } else {
        // Return empty array for general stats without toolId
        return [];
      }
    } catch (error) {
      logger.error('Error getting tool usage stats', {
        toolId,
        days,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  // Type conversion methods to handle differences between entity and interface types
  private convertToolToEntity(tool: Partial<ToolDefinition>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Copy all fields that don't need conversion
    Object.keys(tool).forEach((key) => {
      if (key !== 'category' && key !== 'securityLevel') {
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic property copy between compatible types
        (result as any)[key] = (tool as any)[key];
      }
    });

    // Convert enum fields if present
    if (tool.category) {
      result.category = tool.category;
    }
    if (tool.securityLevel) {
      result.securityLevel = tool.securityLevel;
    }

    return result;
  }

  private convertEntityToTool(entity: Record<string, unknown>): ToolDefinition {
    return {
      id: entity.id as string,
      name: entity.name as string,
      description: entity.description as string,
      version: entity.version as string,
      category: (entity.category as ToolCategory) || ToolCategory.API,
      parameters: (entity.parameters as Record<string, unknown>) || { type: 'object', properties: {} },
      returnType: (entity.returnType as Record<string, unknown>) || { type: 'object', properties: {} },
      securityLevel: (entity.security_level as string) as ToolDefinition['securityLevel'],
      requiresApproval: (entity.requires_approval as boolean) || false,
      isEnabled: (entity.is_enabled as boolean) ?? true,
      executionTimeEstimate: entity.execution_time_estimate as number | undefined,
      costEstimate: entity.cost_estimate as number | undefined,
      author: (entity.author as string) || '',
      tags: (entity.tags as string[]) || [],
      dependencies: (entity.dependencies as string[]) || [],
      rateLimits: entity.rate_limits as Record<string, unknown> | undefined,
      examples: (entity.examples as ToolExample[]) || [],
    };
  }

  private convertEntityToExecution(entity: Record<string, unknown>): ToolExecution {
    return {
      id: entity.id as string,
      toolId: entity.tool_id as string,
      agentId: (entity.agent_id as string) || '',
      parameters: (entity.parameters as Record<string, unknown>) || {},
      status: (entity.status as ToolExecutionStatus) || ToolExecutionStatus.PENDING,
      startTime: (entity.created_at as Date) || new Date(),
      endTime: entity.end_time as Date | undefined,
      result: entity.result as unknown,
      error: entity.error as ToolExecution['error'],
      approvalRequired: false,
      approvedBy: undefined,
      approvedAt: undefined,
      cost: entity.cost as number | undefined,
      executionTimeMs: entity.duration as number | undefined,
      retryCount: 0,
      maxRetries: 3,
      metadata: entity.metadata as Record<string, unknown> | undefined,
      success: (entity.success as boolean) || false,
      data: entity.result,
    };
  }

  private mapCategoryToEnum(category: string): ToolCategory {
    const categoryMap: Record<string, ToolCategory> = {
      api: ToolCategory.API,
      computation: ToolCategory.COMPUTATION,
      'file-system': ToolCategory.FILE_SYSTEM,
      database: ToolCategory.DATABASE,
      'web-search': ToolCategory.WEB_SEARCH,
      'code-execution': ToolCategory.CODE_EXECUTION,
      communication: ToolCategory.COMMUNICATION,
      'knowledge-graph': ToolCategory.KNOWLEDGE_GRAPH,
      deployment: ToolCategory.DEPLOYMENT,
      monitoring: ToolCategory.MONITORING,
      analysis: ToolCategory.ANALYSIS,
      generation: ToolCategory.GENERATION,
    };
    return categoryMap[category] || ToolCategory.API;
  }

  private mapStatusToEnum(status: string): ToolExecutionStatus {
    const statusMap: Record<string, ToolExecutionStatus> = {
      pending: ToolExecutionStatus.PENDING,
      running: ToolExecutionStatus.RUNNING,
      completed: ToolExecutionStatus.COMPLETED,
      failed: ToolExecutionStatus.FAILED,
      cancelled: ToolExecutionStatus.CANCELLED,
      'approval-required': ToolExecutionStatus.APPROVAL_REQUIRED,
    };
    return statusMap[status] || ToolExecutionStatus.PENDING;
  }
}
