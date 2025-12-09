import { ToolExecution as ToolExecutionType, ToolExecutionStatus } from '@uaip/types';
import { logger } from '@uaip/utils';
import { DatabaseService } from './databaseService.js';
import { ToolExecution } from './entities/toolExecution.entity.js';

export interface ToolExecutionOptions {
  timeout?: number;
  priority?: 'low' | 'normal' | 'high';
  retryOnFailure?: boolean;
  maxRetries?: number;
}

/**
 * Tool Execution Service - Simplified wrapper for tool execution
 * This service provides a basic interface for tool execution that can be used
 * across different services. The actual tool execution logic is handled by
 * the capability-registry service.
 */
export class ToolExecutionService {
  constructor(private databaseService: DatabaseService) {}

  /**
   * Execute a tool with the given parameters
   * This is a simplified interface - actual execution is delegated to capability-registry
   * Supports both object-style and parameter-style calls for agent compatibility
   */
  async executeTool(
    toolIdOrRequest:
      | string
      | {
          toolId: string;
          operation?: string;
          parameters: Record<string, any>;
          userId?: string;
          securityContext?: any;
        },
    agentId?: string,
    parameters?: Record<string, any>,
    options: ToolExecutionOptions = {}
  ): Promise<ToolExecutionType> {
    // Handle object-style call (agent compatibility)
    let toolId: string;
    let actualAgentId: string;
    let actualParameters: Record<string, any>;

    if (typeof toolIdOrRequest === 'object') {
      toolId = toolIdOrRequest.toolId;
      actualAgentId = toolIdOrRequest.userId || 'unknown';
      actualParameters = {
        operation: toolIdOrRequest.operation,
        ...toolIdOrRequest.parameters,
      };
    } else {
      // Handle parameter-style call
      toolId = toolIdOrRequest;
      actualAgentId = agentId || 'unknown';
      actualParameters = parameters || {};
    }
    // Create execution record
    const execution: ToolExecutionType = {
      id: `execution_${Date.now()}_${toolId}_${actualAgentId}`,
      toolId,
      agentId: actualAgentId,
      parameters: actualParameters,
      status: ToolExecutionStatus.PENDING,
      startTime: new Date(),
      approvalRequired: false,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      success: false, // Will be updated when execution completes
      data: null, // Will be populated with results
      metadata: {
        priority: options.priority || 'normal',
        timeout: options.timeout || 30000,
        retryOnFailure: options.retryOnFailure || false,
      },
    };

    try {
      // Store initial execution record
      await this.databaseService.tools.createToolExecution(execution as any);

      logger.info(`Tool execution initiated: ${execution.id}`, {
        toolId,
        agentId: actualAgentId,
        options,
      });

      return execution;
    } catch (error) {
      logger.error(`Failed to initiate tool execution ${execution.id}:`, error);
      execution.status = ToolExecutionStatus.FAILED;
      execution.success = false;
      execution.error = {
        type: 'execution',
        message: error.message,
        details: { stack: error.stack },
        recoverable: false,
      };
      execution.endTime = new Date();

      throw error;
    }
  }

  /**
   * Get tool execution status
   */
  async getExecution(executionId: string): Promise<ToolExecutionType | null> {
    try {
      return (await this.databaseService.tools.getToolExecution(executionId)) as any;
    } catch (error) {
      logger.error(`Failed to get tool execution ${executionId}:`, error);
      return null;
    }
  }

  /**
   * Update tool execution status
   */
  async updateExecution(executionId: string, updates: Partial<ToolExecution>): Promise<void> {
    try {
      await this.databaseService.tools.updateToolExecution(executionId, updates);
      logger.debug(`Tool execution updated: ${executionId}`, updates);
    } catch (error) {
      logger.error(`Failed to update tool execution ${executionId}:`, error);
      throw error;
    }
  }

  /**
   * Cancel a tool execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    try {
      await this.updateExecution(executionId, {
        status: ToolExecutionStatus.CANCELLED,
        endTime: new Date(),
      });
      logger.info(`Tool execution cancelled: ${executionId}`);
    } catch (error) {
      logger.error(`Failed to cancel tool execution ${executionId}:`, error);
      throw error;
    }
  }

  /**
   * Register a tool definition (for agent compatibility)
   */
  async registerTool(toolDefinition: any): Promise<void> {
    try {
      logger.info(`Tool registration requested: ${toolDefinition.id || 'unknown'}`);
      // Tool registration is handled by capability-registry service
      // This is a compatibility method for agent implementations
    } catch (error) {
      logger.error(`Failed to register tool:`, error);
      throw error;
    }
  }
}
