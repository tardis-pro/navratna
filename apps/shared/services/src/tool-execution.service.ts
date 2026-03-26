import { createHash, randomUUID } from 'node:crypto';
import {
  ToolExecution as ToolExecutionType,
  ToolExecutionStatus,
  ToolExecutionOptions,
  ToolExecutionRequestEvent,
  ToolExecutionResponseEvent,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { DatabaseService } from './databaseService';
import { EventBusService } from './eventBusService';

interface ToolExecutionEntity {
  id?: string;
  toolId: string;
  agentId?: string;
  userId?: string;
  operationId?: string;
  status: string;
  parameters?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration?: number;
  tokensUsed?: number;
  cost?: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Tool Execution Service - Event-driven wrapper for tool execution
 * This service provides an interface for tool execution that publishes events
 * to the capability-registry service via BullMQ event bus.
 */
export class ToolExecutionService {
  private eventBus: EventBusService;
  private serviceName = 'shared-services';

  constructor(
    private databaseService: DatabaseService,
    eventBus?: EventBusService
  ) {
    this.eventBus = eventBus || EventBusService.getInstance();
  }

  /**
   * Generate an idempotency key for tool execution
   * Creates a hash-based key from toolId, normalized parameters, and day bucket
   * to prevent duplicate executions from retries
   */
  private generateIdempotencyKey(
    toolId: string,
    parameters: Record<string, unknown>,
    agentId: string
  ): string {
    // Create a day-bucketed key to prevent infinite retries while allowing retries within a day
    const dayBucket = new Date().toISOString().split('T')[0];

    // Normalize parameters by sorting keys for consistent hashing
    const normalizedParams = JSON.stringify(parameters, Object.keys(parameters).sort());

    const keyMaterial = `${toolId}:${normalizedParams}:${agentId}:${dayBucket}`;
    const hash = createHash('sha256').update(keyMaterial).digest('hex').slice(0, 32);

    return `tool_${toolId}_${hash}`;
  }

  /**
   * Generate a correlation ID for request-response tracking
   */
  private generateCorrelationId(): string {
    return `corr_${Date.now()}_${randomUUID().slice(0, 8)}`;
  }

  private static toRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private toEntityExecution(execution: ToolExecutionType): Partial<ToolExecutionEntity> {
    return {
      id: execution.id,
      toolId: execution.toolId,
      agentId: execution.agentId,
      parameters: execution.parameters,
      status: execution.status,
      result: execution.result,
      error: execution.error ? JSON.stringify(execution.error) : undefined,
      metadata: execution.metadata,
    };
  }

  private toEntityExecutionUpdates(
    updates: Partial<ToolExecutionType>
  ): Partial<ToolExecutionEntity> {
    return {
      result: updates.result,
      error: updates.error ? JSON.stringify(updates.error) : undefined,
    };
  }

  /**
   * Execute a tool with the given parameters
   * Publishes 'tool.execute.request' event to capability-registry for execution
   * Supports both object-style and parameter-style calls for agent compatibility
   */
  async executeTool(
    toolIdOrRequest:
      | string
      | {
          toolId: string;
          operation?: string;
          parameters: Record<string, unknown>;
          userId?: string;
          securityContext?: Record<string, unknown>;
        },
    agentId?: string,
    parameters?: Record<string, unknown>,
    options: ToolExecutionOptions = {}
  ): Promise<ToolExecutionType> {
    // Handle object-style call (agent compatibility)
    let toolId: string;
    let actualAgentId: string;
    let actualParameters: Record<string, unknown>;
    let securityContext: Record<string, unknown> | undefined;

    if (typeof toolIdOrRequest === 'object') {
      toolId = toolIdOrRequest.toolId;
      actualAgentId = toolIdOrRequest.userId || agentId || 'unknown';
      actualParameters = {
        operation: toolIdOrRequest.operation,
        ...toolIdOrRequest.parameters,
      };
      securityContext = toolIdOrRequest.securityContext;
    } else {
      // Handle parameter-style call
      toolId = toolIdOrRequest;
      actualAgentId = agentId || 'unknown';
      actualParameters = parameters || {};
    }

    // Generate request ID and correlation ID
    const requestId = randomUUID();
    const correlationId = this.generateCorrelationId();

    // Generate idempotency key to prevent duplicate executions
    const idempotencyKey = this.generateIdempotencyKey(toolId, actualParameters, actualAgentId);

    // Create execution record
    const execution: ToolExecutionType = {
      id: requestId,
      toolId,
      agentId: actualAgentId,
      parameters: actualParameters,
      status: ToolExecutionStatus.PENDING,
      startTime: new Date(),
      approvalRequired: false,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      success: false,
      data: null,
      metadata: {
        priority: options.priority || 'normal',
        timeout: options.timeout || 30000,
        retryOnFailure: options.retryOnFailure || false,
        idempotencyKey,
        correlationId,
      },
    };

    try {
      // Store initial execution record
      await this.databaseService.tools.createToolExecution(this.toEntityExecution(execution));

      // Publish tool execution request event to capability-registry
      const eventPayload: ToolExecutionRequestEvent = {
        requestId,
        toolId,
        agentId: actualAgentId,
        parameters: actualParameters,
        securityContext,
        timestamp: new Date().toISOString(),
        idempotencyKey,
        correlationId,
      };

      await this.eventBus.publish('tool.execute.request', eventPayload, {
        correlationId,
        metadata: {
          idempotencyKey,
          service: this.serviceName,
        },
      });

      logger.info(`Tool execution initiated: ${requestId}`, {
        toolId,
        agentId: actualAgentId,
        idempotencyKey,
        correlationId,
        options,
      });

      return execution;
    } catch (error) {
      logger.error(`Failed to initiate tool execution ${requestId}:`, error);
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
      const result = await this.databaseService.tools.getToolExecution(executionId);
      return result as unknown as ToolExecutionType | null;
    } catch (error) {
      logger.error(`Failed to get tool execution ${executionId}:`, error);
      return null;
    }
  }

  /**
   * Update tool execution status
   */
  async updateExecution(executionId: string, updates: Partial<ToolExecutionType>): Promise<void> {
    try {
      await this.databaseService.tools.updateToolExecution(
        executionId,
        this.toEntityExecutionUpdates(updates)
      );
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
  async registerTool(toolDefinition: { id?: string }): Promise<void> {
    try {
      logger.info(`Tool registration requested: ${toolDefinition.id || 'unknown'}`);
      // Tool registration is handled by capability-registry service
      // This is a compatibility method for agent implementations
    } catch (error) {
      logger.error(`Failed to register tool:`, error);
      throw error;
    }
  }

  /**
   * Execute a tool synchronously and wait for the result
   * Uses publish-subscribe pattern with correlation ID for request-response
   */
  async executeToolSync(
    toolIdOrRequest:
      | string
      | {
          toolId: string;
          operation?: string;
          parameters: Record<string, unknown>;
          userId?: string;
          securityContext?: Record<string, unknown>;
        },
    agentId?: string,
    parameters?: Record<string, unknown>,
    options: ToolExecutionOptions = {},
    timeoutMs: number = 30000
  ): Promise<ToolExecutionType> {
    // Handle object-style call (agent compatibility)
    let toolId: string;
    let actualAgentId: string;
    let actualParameters: Record<string, unknown>;
    let securityContext: Record<string, unknown> | undefined;

    if (typeof toolIdOrRequest === 'object') {
      toolId = toolIdOrRequest.toolId;
      actualAgentId = toolIdOrRequest.userId || agentId || 'unknown';
      actualParameters = {
        operation: toolIdOrRequest.operation,
        ...toolIdOrRequest.parameters,
      };
      securityContext = toolIdOrRequest.securityContext;
    } else {
      toolId = toolIdOrRequest;
      actualAgentId = agentId || 'unknown';
      actualParameters = parameters || {};
    }

    // Generate request ID and correlation ID
    const requestId = randomUUID();
    const correlationId = this.generateCorrelationId();
    const idempotencyKey = this.generateIdempotencyKey(toolId, actualParameters, actualAgentId);

    // Create execution record
    const execution: ToolExecutionType = {
      id: requestId,
      toolId,
      agentId: actualAgentId,
      parameters: actualParameters,
      status: ToolExecutionStatus.PENDING,
      startTime: new Date(),
      approvalRequired: false,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      success: false,
      data: null,
      metadata: {
        priority: options.priority || 'normal',
        timeout: options.timeout || timeoutMs,
        retryOnFailure: options.retryOnFailure || false,
        idempotencyKey,
        correlationId,
      },
    };

    try {
      // Store initial execution record
      await this.databaseService.tools.createToolExecution(this.toEntityExecution(execution));

      // Prepare event payload
      const eventPayload: ToolExecutionRequestEvent = {
        requestId,
        toolId,
        agentId: actualAgentId,
        parameters: actualParameters,
        securityContext,
        timestamp: new Date().toISOString(),
        idempotencyKey,
        correlationId,
      };

      // Subscribe to response before publishing to avoid race condition
      const responsePromise = new Promise<ToolExecutionType>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Tool execution timeout: ${toolId}`));
        }, timeoutMs);

        const responseHandler = async (message: { data: unknown }) => {
          clearTimeout(timeout);
          await this.eventBus.unsubscribe(`tool.response.${requestId}`, responseHandler);

          const isToolExecutionResponse = (data: unknown): data is ToolExecutionResponseEvent => {
            return (
              typeof data === 'object' &&
              data !== null &&
              'requestId' in data &&
              'toolId' in data &&
              'status' in data &&
              'executionTime' in data
            );
          };

          if (!isToolExecutionResponse(message.data)) {
            execution.status = ToolExecutionStatus.FAILED;
            execution.success = false;
            execution.error = {
              type: 'execution',
              message: 'Tool execution failed - invalid response format',
              recoverable: false,
            };
            execution.endTime = new Date();
            reject(new Error('Tool execution failed - invalid response format'));
            return;
          }

          const response = message.data;

          if (response.status === 'SUCCESS') {
            execution.status = ToolExecutionStatus.COMPLETED;
            execution.success = true;
            execution.data = response.result;
            execution.endTime = new Date();
            resolve(execution);
          } else {
            execution.status = ToolExecutionStatus.FAILED;
            execution.success = false;
            execution.error = {
              type: 'execution',
              message: response.error || 'Tool execution failed',
              recoverable: false,
            };
            execution.endTime = new Date();
            reject(new Error(response.error || 'Tool execution failed'));
          }
        };

        this.eventBus.subscribe(`tool.response.${requestId}`, responseHandler);
      });

      // Publish tool execution request
      await this.eventBus.publish('tool.execute.request', eventPayload, {
        correlationId,
        metadata: {
          idempotencyKey,
          service: this.serviceName,
        },
      });

      logger.info(`Tool execution initiated (sync): ${requestId}`, {
        toolId,
        agentId: actualAgentId,
        idempotencyKey,
        correlationId,
      });

      return await responsePromise;
    } catch (error) {
      logger.error(`Failed to execute tool synchronously ${requestId}:`, error);
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
}
