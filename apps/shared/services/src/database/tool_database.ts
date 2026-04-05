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
  ToolExecutionError,
  SecurityLevel,
} from '@uaip/types';
import { DatabaseService } from '../database_service';

function getStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function getNum(v: unknown, fallback?: number): number | undefined {
  return typeof v === 'number' ? v : fallback;
}
function getBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function getRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}
function getArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function toEnum<T extends Record<string, string>>(enumObj: T, v: unknown): T[keyof T] | undefined {
  const values: string[] = Object.values(enumObj);
  return typeof v === 'string' && values.includes(v) ? (v as T[keyof T]) : undefined;
}

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
        inputSchema: tool.parameters,
        outputSchema: tool.returnType,
        securityLevel: tool.securityLevel,
        maxRetries: 3,
        timeout: 30000,
      };
      await this.databaseService.tools.createTool(toolData);
      logger.info(`Tool created: ${tool.id}`);
    } catch (error) {
      logger.error('Error creating tool', { tool, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getTool(id: string): Promise<ToolDefinition | null> {
    try {
      const entity = await this.databaseService.tools.findToolById(id);
      return entity ? this.convertEntityToTool(entity) : null;
    } catch (error) {
      logger.error('Error getting tool', { id, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getTools(category?: string, _enabled?: boolean): Promise<ToolDefinition[]> {
    try {
      const entities = await this.databaseService.tools.findActiveTools();
      return entities.map((entity) => this.convertEntityToTool(entity));
    } catch (error) {
      logger.error('Error getting tools', { category, error: error instanceof Error ? error.message : String(error) });
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
      logger.error('Error updating tool', { id, updates, error: error instanceof Error ? error.message : String(error) });
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
      logger.error('Error deleting tool', { id, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async searchTools(query: string): Promise<ToolDefinition[]> {
    try {
      const entities = await this.databaseService.tools.searchTools(query);
      return entities.map((entity) => this.convertEntityToTool(entity));
    } catch (error) {
      logger.error('Error searching tools', { query, error: error instanceof Error ? error.message : String(error) });
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
      logger.error('Error creating tool execution', { execution, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async updateExecution(id: string, updates: Partial<ToolExecution>): Promise<void> {
    try {
      const result = await this.databaseService.tools.updateExecution(id, {
        status: updates.status,
        output:
          typeof updates.result === 'object' && updates.result !== null
            ? { ...updates.result as Record<string, unknown> }
            : undefined,
        error: updates.error ? JSON.stringify(updates.error) : undefined,
        metadata: updates.metadata,
        duration: updates.executionTimeMs,
      });
      if (!result) {
        throw new Error(`Tool execution not found: ${id}`);
      }
      logger.debug(`Tool execution updated: ${id}`);
    } catch (error) {
      logger.error('Error updating tool execution', { id,
      updates, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getExecution(id: string): Promise<ToolExecution | null> {
    try {
      const result = await this.databaseService.tools.findExecutionById(id);
      return result ? this.convertEntityToExecution(result) : null;
    } catch (error) {
      logger.error('Error getting tool execution', { id, error: error instanceof Error ? error.message : String(error) });
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
      logger.error('Error getting tool executions', { toolId,
      agentId,
      limit, error: error instanceof Error ? error.message : String(error) });
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
      logger.error('Error recording tool usage', { usage, error: error instanceof Error ? error.message : String(error) });
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
          typeof stats === 'object' && stats !== null ? { ...stats as Record<string, unknown> } : {},
        ];
      } else {
        // Return empty array for general stats without toolId
        return [];
      }
    } catch (error) {
      logger.error('Error getting tool usage stats', { toolId,
      days, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  // Type conversion methods to handle differences between entity and interface types
  private convertToolToEntity(tool: Partial<ToolDefinition>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Copy all fields that don't need conversion
    const toolRecord: Record<string, unknown> = { ...tool };
    Object.keys(toolRecord).forEach((key) => {
      if (key !== 'category' && key !== 'securityLevel') {
        result[key] = toolRecord[key];
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
      id: getStr(entity.id),
      name: getStr(entity.name),
      description: getStr(entity.description),
      version: getStr(entity.version),
      category: toEnum(ToolCategory, entity.category) ?? ToolCategory.API,
      parameters: getRecord(entity.parameters) ?? { type: 'object', properties: {} },
      returnType: getRecord(entity.returnType) ?? { type: 'object', properties: {} },
      securityLevel: toEnum(SecurityLevel, entity.security_level) ?? SecurityLevel.LOW,
      requiresApproval: getBool(entity.requires_approval, false),
      isEnabled: getBool(entity.is_enabled, true),
      executionTimeEstimate: getNum(entity.execution_time_estimate),
      costEstimate: getNum(entity.cost_estimate),
      author: getStr(entity.author),
      tags: getArr<string>(entity.tags),
      dependencies: getArr<string>(entity.dependencies),
      rateLimits: getRecord(entity.rate_limits),
      examples: getArr<ToolExample>(entity.examples),
    };
  }

  private convertEntityToExecution(entity: Record<string, unknown>): ToolExecution {
    return {
      id: getStr(entity.id),
      toolId: getStr(entity.tool_id),
      agentId: getStr(entity.agent_id),
      parameters: getRecord(entity.parameters) ?? {},
      status: toEnum(ToolExecutionStatus, entity.status) ?? ToolExecutionStatus.PENDING,
      startTime: entity.created_at instanceof Date ? entity.created_at : new Date(),
      endTime: entity.end_time instanceof Date ? entity.end_time : undefined,
      result: entity.result,
      error: typeof entity.error === 'string' && entity.error !== ''
        ? ({ type: 'unknown' as const, message: entity.error, recoverable: false } satisfies ToolExecutionError)
        : undefined,
      approvalRequired: false,
      approvedBy: undefined,
      approvedAt: undefined,
      cost: getNum(entity.cost),
      executionTimeMs: getNum(entity.duration),
      retryCount: 0,
      maxRetries: 3,
      metadata: getRecord(entity.metadata),
      success: getBool(entity.success, false),
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
