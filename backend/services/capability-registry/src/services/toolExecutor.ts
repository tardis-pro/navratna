// Tool Executor Service - Enhanced with Usage Tracking
// Handles tool execution with PostgreSQL logging and Neo4j usage pattern tracking
// Part of capability-registry microservice

import { ToolExecution, ToolUsageRecord, ToolExecutionStatus } from '@uaip/types';
import {  ToolGraphDatabase, UsagePattern, DatabaseService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { ToolRegistry } from './toolRegistry.js';
import { BaseToolExecutor } from './baseToolExecutor.js';

import { z } from 'zod';

// Validation schemas
const ExecutionParametersSchema = z.object({
  toolId: z.string().min(1),
  agentId: z.string().min(1),
  parameters: z.record(z.any()),
  timeout: z.number().positive().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional()
});

export interface ExecutionOptions {
  timeout?: number;
  priority?: 'low' | 'normal' | 'high';
  retryOnFailure?: boolean;
  maxRetries?: number;
}

export class ToolExecutor {
  constructor(
    private postgresql: DatabaseService,
    private neo4j: ToolGraphDatabase,
    private toolRegistry: ToolRegistry,
    private baseExecutor: BaseToolExecutor
  ) {}

  async executeTool(
    toolId: string,
    agentId: string,
    parameters: Record<string, any>,
    options: ExecutionOptions = {}
  ): Promise<ToolExecution> {
    // Validate input parameters
    const validatedInput = ExecutionParametersSchema.parse({
      toolId,
      agentId,
      parameters,
      timeout: options.timeout,
      priority: options.priority
    });

    // Get tool definition
    const tool = await this.toolRegistry.getTool(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    if (!tool.isEnabled) {
      throw new Error(`Tool ${toolId} is disabled`);
    }

    // Create execution record
    const execution: ToolExecution = {
      id: `execution_${Date.now()}_${toolId}_${agentId}`,
      toolId,
      agentId,
      parameters: validatedInput.parameters,
      status: ToolExecutionStatus.PENDING,
      startTime: new Date(),
      approvalRequired: tool.requiresApproval,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      metadata: {
        priority: options.priority || 'normal',
        timeout: options.timeout || 30000,
        retryOnFailure: options.retryOnFailure || false
      }
    };

    try {
      // Store initial execution record
      await this.postgresql.createToolExecution(execution);

      // Check if approval is required
      if (tool.requiresApproval) {
        execution.status = ToolExecutionStatus.APPROVAL_REQUIRED;
        await this.postgresql.updateToolExecution(execution.id, { status: ToolExecutionStatus.APPROVAL_REQUIRED });
        logger.info(`Tool execution requires approval: ${execution.id}`);
        return execution;
      }

      // Execute the tool
      return await this.performExecution(execution, tool);
    } catch (error) {
      logger.error(`Failed to initiate tool execution ${execution.id}:`, error);
      execution.status = ToolExecutionStatus.FAILED;
      execution.error = {
        type: 'execution',
        message: error.message,
        details: { stack: error.stack },
        recoverable: false
      };
      execution.endTime = new Date();

      await this.postgresql.updateToolExecution(execution.id, execution);
      await this.recordUsage(execution, false);
      
      throw error;
    }
  }

  private async performExecution(execution: ToolExecution, tool: any): Promise<ToolExecution> {
    const startTime = Date.now();
    
    try {
      // Update status to running
      execution.status = ToolExecutionStatus.RUNNING;
      await this.postgresql.updateToolExecution(execution.id, { status: ToolExecutionStatus.RUNNING });

      // Execute the tool logic
      const result = await this.executeToolLogic(
        execution.toolId,
        execution.parameters,
        execution.metadata?.timeout || 30000
      );

      const executionTime = Date.now() - startTime;
      
      // Update execution with success
      execution.status = ToolExecutionStatus.COMPLETED;
      execution.result = result;
      execution.endTime = new Date();
      execution.executionTimeMs = executionTime;
      execution.cost = this.calculateCost(tool, executionTime);

      await this.postgresql.updateToolExecution(execution.id, {
        status: ToolExecutionStatus.COMPLETED,
        result,
        endTime: execution.endTime,
        executionTimeMs: executionTime,
        cost: execution.cost
      });

      // Record successful usage with enhanced TypeORM tracking
      await this.recordUsage(execution, true);
      await this.recordToolUsageWithTypeORM(execution, true, executionTime);
      await this.updateUsagePattern(execution.agentId, execution.toolId, executionTime, true);

      logger.info(`Tool execution completed: ${execution.id} (${executionTime}ms)`);
      return execution;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // Update execution with failure
      execution.status = ToolExecutionStatus.FAILED;
      execution.error = {
        type: this.categorizeError(error),
        message: error.message,
        details: { stack: error.stack },
        recoverable: this.isRecoverableError(error)
      };
      execution.endTime = new Date();
      execution.executionTimeMs = executionTime;

      await this.postgresql.updateToolExecution(execution.id, {
        status: ToolExecutionStatus.FAILED,
        error: execution.error,
        endTime: execution.endTime,
        executionTimeMs: executionTime
      });

      // Record failed usage with enhanced TypeORM tracking
      await this.recordUsage(execution, false);
      await this.recordToolUsageWithTypeORM(execution, false, executionTime);
      await this.updateUsagePattern(execution.agentId, execution.toolId, executionTime, false);

      logger.error(`Tool execution failed: ${execution.id} (${executionTime}ms)`, error);
      
      // Retry if configured and error is recoverable
      if (execution.metadata?.retryOnFailure && 
          execution.error.recoverable && 
          execution.retryCount < execution.maxRetries) {
        return await this.retryExecution(execution.id);
      }

      throw error;
    }
  }

  // Enhanced TypeORM usage recording
  private async recordToolUsageWithTypeORM(
    execution: ToolExecution,
    success: boolean,
    executionTime: number
  ): Promise<void> {
    try {
      await this.toolRegistry.recordToolUsage(
        execution.toolId,
        execution.agentId,
        executionTime,
        success,
        execution.cost,
        {
          executionId: execution.id,
          priority: execution.metadata?.priority,
          retryCount: execution.retryCount,
          error: execution.error
        }
      );
    } catch (error) {
      logger.error(`Failed to record TypeORM tool usage:`, error);
      // Don't throw - usage tracking shouldn't break execution
    }
  }

  async retryExecution(executionId: string): Promise<ToolExecution> {
    const execution = await this.postgresql.getToolExecution(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.retryCount >= execution.maxRetries) {
      throw new Error(`Maximum retries exceeded for execution ${executionId}`);
    }

    // Increment retry count
    execution.retryCount++;
    execution.status = ToolExecutionStatus.PENDING;
    execution.startTime = new Date();
    execution.endTime = undefined;
    execution.error = undefined;

    await this.postgresql.updateToolExecution(executionId, {
      retryCount: execution.retryCount,
      status: ToolExecutionStatus.PENDING,
      startTime: execution.startTime,
      endTime: null,
      error: null
    });

    logger.info(`Retrying tool execution: ${executionId} (attempt ${execution.retryCount})`);

    const tool = await this.toolRegistry.getTool(execution.toolId);
    return await this.performExecution(execution, tool);
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    try {
      const execution = await this.postgresql.getToolExecution(executionId);
      if (!execution) {
        return false;
      }

      if (execution.status === ToolExecutionStatus.COMPLETED || execution.status === ToolExecutionStatus.FAILED || execution.status === ToolExecutionStatus.CANCELLED) {
        return false; // Cannot cancel already finished executions
      }

      await this.postgresql.updateToolExecution(executionId, {
        status: ToolExecutionStatus.CANCELLED,
        endTime: new Date()
      });

      logger.info(`Tool execution cancelled: ${executionId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to cancel execution ${executionId}:`, error);
      return false;
    }
  }

  async approveExecution(executionId: string, approvedBy: string): Promise<ToolExecution> {
    const execution = await this.postgresql.getToolExecution(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status !== ToolExecutionStatus.APPROVAL_REQUIRED) {
      throw new Error(`Execution ${executionId} does not require approval`);
    }

    // Update approval status
    await this.postgresql.updateToolExecution(executionId, {
      approvedBy,
      approvedAt: new Date(),
      status: ToolExecutionStatus.PENDING
    });

    execution.approvedBy = approvedBy;
    execution.approvedAt = new Date();
    execution.status = ToolExecutionStatus.PENDING;

    logger.info(`Tool execution approved: ${executionId} by ${approvedBy}`);

    // Now execute the tool
    const tool = await this.toolRegistry.getTool(execution.toolId);
    return await this.performExecution(execution, tool);
  }

  // Execution Management
  async getExecution(executionId: string): Promise<ToolExecution | null> {
    return await this.postgresql.getToolExecution(executionId);
  }

  async getExecutions(
    toolId?: string,
    agentId?: string,
    status?: string,
    limit = 100
  ): Promise<ToolExecution[]> {
    const filters: any = { limit };
    if (toolId) filters.toolId = toolId;
    if (agentId) filters.agentId = agentId;
    if (status) filters.status = status;
    return await this.postgresql.getToolExecutions(filters);
  }

  async getActiveExecutions(agentId?: string): Promise<ToolExecution[]> {
    const filters: any = { status: ToolExecutionStatus.RUNNING };
    if (agentId) filters.agentId = agentId;
    return await this.postgresql.getToolExecutions(filters);
  }

  // Private Helper Methods
  private async executeToolLogic(toolId: string, parameters: any, timeout: number): Promise<any> {
    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Tool execution timeout')), timeout);
    });

    // Execute the tool with timeout
    const executionPromise = this.baseExecutor.execute(toolId, parameters);

    return Promise.race([executionPromise, timeoutPromise]);
  }

  private async recordUsage(execution: ToolExecution, success: boolean): Promise<void> {
    try {
      const usage: Partial<ToolUsageRecord> = {
        toolId: execution.toolId,
        agentId: execution.agentId,
        startTime: execution.startTime,
        endTime: execution.endTime || new Date(),
        success,
        duration: execution.executionTimeMs,
        cost: execution.cost,
        errorCode: execution.error?.type,
        executionId: execution.id,
        metadata: execution.metadata
      };

      await this.postgresql.recordToolUsage(usage);
    } catch (error) {
      logger.error('Failed to record usage:', error);
    }
  }

  private async updateUsagePattern(
    agentId: string,
    toolId: string,
    executionTime: number,
    success: boolean
  ): Promise<void> {
    try {
      await this.neo4j.incrementUsage(agentId, toolId, executionTime, success);
    } catch (error) {
      logger.error('Failed to update usage pattern:', error);
    }
  }

  private calculateCost(tool: any, executionTime: number): number {
    // Simple cost calculation based on tool's cost estimate and execution time
    const baseCost = tool.costEstimate;
    const timeFactor = executionTime / (tool.executionTimeEstimate || 1000);
    return baseCost * timeFactor;
  }

  private categorizeError(error: Error): 'validation' | 'execution' | 'timeout' | 'permission' | 'quota' | 'dependency' | 'unknown' {
    if (error.message.includes('timeout')) return 'timeout';
    if (error.message.includes('permission')) return 'permission';
    if (error.message.includes('validation')) return 'validation';
    if (error.message.includes('quota')) return 'quota';
    if (error.message.includes('dependency')) return 'dependency';
    if (error.message.includes('execution')) return 'execution';
    return 'unknown';
  }

  private isRecoverableError(error: Error): boolean {
    const recoverableTypes = ['timeout', 'quota', 'dependency'];
    const errorType = this.categorizeError(error);
    return recoverableTypes.includes(errorType);
  }

  // Analytics
  async getExecutionStats(toolId?: string, agentId?: string, days = 30): Promise<any> {
    const filters: any = { days };
    if (toolId) filters.toolId = toolId;
    if (agentId) filters.agentId = agentId;
    const stats = await this.postgresql.getToolUsageStats(filters);
    
    return {
      totalExecutions: stats.reduce((sum, stat) => sum + parseInt(stat.total_uses), 0),
      successfulExecutions: stats.reduce((sum, stat) => sum + parseInt(stat.successful_uses), 0),
      averageExecutionTime: stats.reduce((sum, stat) => sum + parseFloat(stat.avg_execution_time || '0'), 0) / stats.length,
      totalCost: stats.reduce((sum, stat) => sum + parseFloat(stat.total_cost || '0'), 0),
      successRate: stats.length > 0 ? 
        stats.reduce((sum, stat) => sum + parseInt(stat.successful_uses), 0) / 
        stats.reduce((sum, stat) => sum + parseInt(stat.total_uses), 0) : 0
    };
  }

  // Health Check
  async healthCheck(): Promise<{ status: string; activeExecutions: number }> {
    try {
      const activeExecutions = await this.getActiveExecutions();
      return {
        status: 'healthy',
        activeExecutions: activeExecutions.length
      };
    } catch (error) {
      logger.error('Tool executor health check failed:', error);
      return {
        status: 'unhealthy',
        activeExecutions: -1
      };
    }
  }
} 