// Tool Database Service - TypeORM Implementation
// Handles all database operations for the tools system using TypeORM
// Part of @uaip/shared-services

import { logger } from '@uaip/utils';
import { ToolDefinition, ToolExecution, ToolUsageRecord, ToolCategory, ToolExecutionStatus, ToolExample } from '@uaip/types';
import { DatabaseService } from '../databaseService.js';
import { ToolDefinition as ToolDefinitionEntity } from '../entities/toolDefinition.entity.js';
import { ToolExecution as ToolExecutionEntity } from '../entities/toolExecution.entity.js';

export class ToolDatabase {
  private databaseService: DatabaseService;

  constructor(dbConfig?: any) {
    // Ignore the dbConfig parameter for backward compatibility
    // TypeORM connection is managed by DatabaseService
    this.databaseService = DatabaseService.getInstance();
  }

  async close(): Promise<void> {
    // TypeORM connection is managed by DatabaseService
    // No need to close individual connections
    logger.debug('ToolDatabase close() called - connection managed by DatabaseService');
  }

  // Tool CRUD Operations
  async createTool(tool: ToolDefinition): Promise<void> {
    try {
      const entityData = this.convertToolToEntity(tool);
      await this.databaseService.createTool(entityData);
      logger.info(`Tool created: ${tool.id}`);
    } catch (error) {
      logger.error('Error creating tool', { tool, error: (error as Error).message });
      throw error;
    }
  }

  async getTool(id: string): Promise<ToolDefinition | null> {
    try {
      
      const entity = await this.databaseService.getTool(id);
      return entity ? this.convertEntityToTool(entity) : null;
    } catch (error) {
      logger.error('Error getting tool', { id, error: (error as Error).message });
      throw error;
    }
  }

  async getTools(category?: string, enabled?: boolean): Promise<ToolDefinition[]> {
    try {
      const entities = await this.databaseService.getTools({
        category,
        enabled
      });
      return entities.map(entity => this.convertEntityToTool(entity));
    } catch (error) {
      logger.error('Error getting tools', { category, enabled, error: (error as Error).message });
      throw error;
    }
  } 

  async updateTool(id: string, updates: Partial<ToolDefinition>): Promise<void> {
    try {

      const entityUpdates = this.convertToolToEntity(updates);
      const result = await this.databaseService.updateTool(id, entityUpdates);
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
      
      const deleted = await this.databaseService.deleteTool(id);
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
      const entities = await this.databaseService.searchTools(query);
      return entities.map(entity => this.convertEntityToTool(entity));
    } catch (error) {
      logger.error('Error searching tools', { query, error: (error as Error).message });
      throw error;
    }
  }

  // Tool Execution Operations
  async createExecution(execution: ToolExecution): Promise<void> {
    try {
      const entityData = this.convertExecutionToEntity(execution);
      await this.databaseService.createToolExecution(entityData);
      logger.debug(`Tool execution created`);
    } catch (error) {
      logger.error('Error creating tool execution', { execution, error: (error as Error).message });
      throw error;
    }
  }

  async updateExecution(id: string, updates: Partial<ToolExecution>): Promise<void> {
    try {
      const entityUpdates = this.convertExecutionToEntity(updates);
      const result = await this.databaseService.updateToolExecution(id, entityUpdates);
      if (!result) {
        throw new Error(`Tool execution not found: ${id}`);
      }
      logger.debug(`Tool execution updated: ${id}`);
    } catch (error) {
      logger.error('Error updating tool execution', { id, updates, error: (error as Error).message });
      throw error;
    }
  }

  async getExecution(id: string): Promise<ToolExecution | null> {
    try {
      return await this.databaseService.getToolExecution(id);
    } catch (error) {
      logger.error('Error getting tool execution', { id, error: (error as Error).message });
      throw error;
    }
  }

  async getExecutions(toolId?: string, agentId?: string, status?: string, limit = 100): Promise<ToolExecution[]> {
    try {
      return await this.databaseService.getToolExecutions({
        toolId: toolId,
        agentId,
        status,
        limit
      });
    } catch (error) {
      logger.error('Error getting tool executions', { toolId, agentId, status, limit, error: (error as Error).message });
      throw error;
    }
  }

  // Usage Analytics
  async recordUsage(usage: ToolUsageRecord): Promise<void> {
    try {
      await this.databaseService.recordToolUsage({
        toolId: usage.toolId,
        agentId: usage.agentId,
        usedAt: usage.startTime,
        success: usage.success,
        executionTimeMs: usage.duration,
        cost: usage.cost,
        error: usage.errorCode
      });

      // Update tool success metrics if execution was successful
      if (usage.success && usage.duration) {
        await this.databaseService.updateToolSuccessMetrics(
          usage.toolId,
          true,
          usage.duration
        );
      }

      logger.debug(`Tool usage recorded for tool: ${usage.toolId}`);
    } catch (error) {
      logger.error('Error recording tool usage', { usage, error: (error as Error).message });
      throw error;
    }
  }

    async getUsageStats(toolId?: string, agentId?: string, days = 30): Promise<any[]> {
    try {
      return await this.databaseService.getToolUsageStats({
        toolId,
        agentId,
        days
      });
    } catch (error) {
      logger.error('Error getting tool usage stats', { toolId, agentId, days, error: (error as Error).message });
      throw error;
    }
  }

  // Type conversion methods to handle differences between entity and interface types
  private convertToolToEntity(tool: Partial<ToolDefinition>): Partial<ToolDefinitionEntity> {
    const result: Partial<ToolDefinitionEntity> = {};
    
    // Copy all fields that don't need conversion
    Object.keys(tool).forEach(key => {
      if (key !== 'category' && key !== 'securityLevel') {
        (result as any)[key] = (tool as any)[key];
      }
    });

    // Convert enum fields if present
    if (tool.category) {
      result.category = this.mapCategoryToEnum(tool.category);
    }
    if (tool.securityLevel) {
      result.securityLevel = this.mapSecurityLevelToEnum(tool.securityLevel) as any;
    }

    return result;
  }

  private convertEntityToTool(entity: ToolDefinitionEntity): ToolDefinition {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      version: entity.version,
      category: entity.category as ToolCategory,
      parameters: entity.parameters as Record<string, any>,
      returnType: entity.returnType as Record<string, any>,
      securityLevel: entity.securityLevel as any,
      requiresApproval: entity.requiresApproval,
      isEnabled: entity.isEnabled,
      executionTimeEstimate: entity.executionTimeEstimate,
      costEstimate: entity.costEstimate,
      author: entity.author,
      tags: entity.tags,
      dependencies: entity.dependencies,
      rateLimits: entity.rateLimits as Record<string, any>,
      examples: entity.examples as ToolExample[]
    };
  }

  private convertExecutionToEntity(execution: Partial<ToolExecution>): Partial<ToolExecutionEntity> {
    const result: Partial<ToolExecutionEntity> = {};
    
    // Copy all fields that don't need conversion
    Object.keys(execution).forEach(key => {
      if (key !== 'status') {
        (result as any)[key] = (execution as any)[key];
      }
    });

    // Convert enum fields if present
    if (execution.status) {
      result.status = this.mapStatusToEnum(execution.status);
    }

    return result;
  }

  private convertEntityToExecution(entity: ToolExecutionEntity): ToolExecution {
    return {
      ...entity,
      status: entity.status as any
    };
  }

  private mapCategoryToEnum(category: string): ToolCategory {
    const categoryMap: Record<string, ToolCategory> = {
      'api': ToolCategory.API,
      'computation': ToolCategory.COMPUTATION,
      'file-system': ToolCategory.FILE_SYSTEM,
      'database': ToolCategory.DATABASE,
      'web-search': ToolCategory.WEB_SEARCH,
      'code-execution': ToolCategory.CODE_EXECUTION,
      'communication': ToolCategory.COMMUNICATION,
      'knowledge-graph': ToolCategory.KNOWLEDGE_GRAPH,
      'deployment': ToolCategory.DEPLOYMENT,
      'monitoring': ToolCategory.MONITORING,
      'analysis': ToolCategory.ANALYSIS,
      'generation': ToolCategory.GENERATION
    };
    return categoryMap[category] || ToolCategory.API;
  }

  private mapStatusToEnum(status: string): ToolExecutionStatus {
    const statusMap: Record<string, ToolExecutionStatus> = {
      'pending': ToolExecutionStatus.PENDING,
      'running': ToolExecutionStatus.RUNNING,
      'completed': ToolExecutionStatus.COMPLETED,
      'failed': ToolExecutionStatus.FAILED,
      'cancelled': ToolExecutionStatus.CANCELLED,
      'approval-required': ToolExecutionStatus.APPROVAL_REQUIRED
    };
    return statusMap[status] || ToolExecutionStatus.PENDING;
  }

  private mapSecurityLevelToEnum(level: string): any {
    // Map string security levels to enum values
    const levelMap: Record<string, string> = {
      'safe': 'low',
      'moderate': 'medium',
      'restricted': 'high',
      'dangerous': 'critical'
    };
    return levelMap[level] || 'medium';
  }

  // Helper methods for compatibility (keeping for interface compatibility)
  private mapRowToTool(row: any): ToolDefinition {
    return row as ToolDefinition;
  }

  private mapRowToExecution(row: any): ToolExecution {
    return row as ToolExecution;
  }

  private mapFieldToColumn(field: string): string | null {
    return field;
  }

  private serializeValue(field: string, value: any): any {
    return value;
  }
} 