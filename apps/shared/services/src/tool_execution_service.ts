import { createHash, randomUUID } from 'node:crypto';
import {
  ToolExecution as ToolExecutionType,
  ToolExecutionStatus,
  ToolExecutionOptions,
  ToolExecutionRequestEvent,
  ToolExecutionResponseEvent,
} from '@uaip/types';
import { logger } from '@uaip/utils';
<<<<<<< HEAD:apps/shared/services/src/tool_execution_service.ts
import { DatabaseService } from './database_service';
import { EventBusService } from './event_bus_service';
=======
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
>>>>>>> 441faaf (feat: fix stuff):backend/shared/services/src/tool-execution.service.ts

type ToolRequestInput =
  | string
  | {
      toolId: string;
      operation?: string;
      parameters: Record<string, unknown>;
      userId?: string;
      securityContext?: Record<string, unknown>;
    };

interface ToolExecutionEntity {
  id?: string;
  toolId: string;
  agentId?: string;
  userId?: string;
  operationId?: string;
  status: string;
  parameters?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  duration?: number;
  tokensUsed?: number;
  cost?: string;
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

<<<<<<< HEAD:apps/shared/services/src/tool_execution_service.ts
  private parseToolRequest(
    toolIdOrRequest: ToolRequestInput,
=======
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
>>>>>>> 441faaf (feat: fix stuff):backend/shared/services/src/tool-execution.service.ts
    agentId?: string,
    parameters?: Record<string, unknown>
  ): {
    toolId: string;
    actualAgentId: string;
    actualParameters: Record<string, unknown>;
    securityContext: Record<string, unknown> | undefined;
  } {
    if (typeof toolIdOrRequest === 'object') {
      return {
        toolId: toolIdOrRequest.toolId,
        actualAgentId: toolIdOrRequest.userId || agentId || 'unknown',
        actualParameters: {
          operation: toolIdOrRequest.operation,
          ...toolIdOrRequest.parameters,
        },
        securityContext: toolIdOrRequest.securityContext,
      };
    }
    return {
      toolId: toolIdOrRequest,
      actualAgentId: agentId || 'unknown',
      actualParameters: parameters || {},
      securityContext: undefined,
    };
  }

  private buildExecutionRecord(
    requestId: string,
    toolId: string,
    actualAgentId: string,
    actualParameters: Record<string, unknown>,
    options: ToolExecutionOptions,
    correlationId: string,
    idempotencyKey: string,
    timeoutOverride?: number
  ): ToolExecutionType {
    return {
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
        timeout: options.timeout || timeoutOverride || 30000,
        retryOnFailure: options.retryOnFailure || false,
        idempotencyKey,
        correlationId,
      },
    };
  }

  private markExecutionFailed(
    execution: ToolExecutionType,
    error: { message: string; stack?: string },
    logPrefix: string
  ): never {
    logger.error(logPrefix, error);
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

  private buildEventPayload(
    requestId: string,
    toolId: string,
    actualAgentId: string,
    actualParameters: Record<string, unknown>,
    securityContext: Record<string, unknown> | undefined,
    idempotencyKey: string,
    correlationId: string
  ): ToolExecutionRequestEvent {
    return {
      requestId,
      toolId,
      agentId: actualAgentId,
      parameters: actualParameters,
      securityContext,
      timestamp: new Date().toISOString(),
      idempotencyKey,
      correlationId,
    };
  }

  private prepareExecution(
    toolIdOrRequest: ToolRequestInput,
    agentId: string | undefined,
    parameters: Record<string, unknown> | undefined,
    options: ToolExecutionOptions,
    timeoutMs?: number
  ): {
    toolId: string;
    actualAgentId: string;
    actualParameters: Record<string, unknown>;
    securityContext: Record<string, unknown> | undefined;
    requestId: string;
    correlationId: string;
    idempotencyKey: string;
    execution: ToolExecutionType;
  } {
    const { toolId, actualAgentId, actualParameters, securityContext } = this.parseToolRequest(
      toolIdOrRequest,
      agentId,
      parameters
    );
    const requestId = randomUUID();
    const correlationId = this.generateCorrelationId();
    const idempotencyKey = this.generateIdempotencyKey(toolId, actualParameters, actualAgentId);
    const execution = this.buildExecutionRecord(
      requestId,
      toolId,
      actualAgentId,
      actualParameters,
      options,
      correlationId,
      idempotencyKey,
      timeoutMs
    );
    return { toolId, actualAgentId, actualParameters, securityContext, requestId, correlationId, idempotencyKey, execution };
  }

  private toEntityExecution(execution: ToolExecutionType): Partial<ToolExecutionEntity> {
    return {
      id: execution.id,
      toolId: execution.toolId,
      agentId: execution.agentId,
      parameters: execution.parameters,
      status: execution.status,
      result: ToolExecutionService.toRecord(execution.result),
      error: execution.error ? JSON.stringify(execution.error) : undefined,
      metadata: execution.metadata,
    };
  }

  private toEntityExecutionUpdates(
    updates: Partial<ToolExecutionType>
  ): Partial<ToolExecutionEntity> {
    return {
      result: ToolExecutionService.toRecord(updates.result),
      error: updates.error ? JSON.stringify(updates.error) : undefined,
    };
  }

  /**
   * Execute a tool with the given parameters
   * Publishes 'tool.execute.request' event to capability-registry for execution
   * Supports both object-style and parameter-style calls for agent compatibility
   */
  async executeTool(
    toolIdOrRequest: ToolRequestInput,
    agentId?: string,
    parameters?: Record<string, unknown>,
    options: ToolExecutionOptions = {}
  ): Promise<ToolExecutionType> {
    const { toolId, actualAgentId, actualParameters, securityContext, requestId, correlationId, idempotencyKey, execution } =
      this.prepareExecution(toolIdOrRequest, agentId, parameters, options);

    try {
      await this.databaseService.tools.createToolExecution(this.toEntityExecution(execution));

      const eventPayload = this.buildEventPayload(
        requestId, toolId, actualAgentId, actualParameters, securityContext, idempotencyKey, correlationId
      );

      await this.eventBus.publish('tool.execute.request', eventPayload, {
        correlationId,
        metadata: { idempotencyKey, service: this.serviceName },
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
      this.markExecutionFailed(execution, error, `Failed to initiate tool execution ${requestId}:`);
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
    toolIdOrRequest: ToolRequestInput,
    agentId?: string,
    parameters?: Record<string, unknown>,
    options: ToolExecutionOptions = {},
    timeoutMs: number = 30000
  ): Promise<ToolExecutionType> {
    const { toolId, actualAgentId, actualParameters, securityContext, requestId, correlationId, idempotencyKey, execution } =
      this.prepareExecution(toolIdOrRequest, agentId, parameters, options, timeoutMs);

    try {
      await this.databaseService.tools.createToolExecution(this.toEntityExecution(execution));

      const eventPayload = this.buildEventPayload(
        requestId, toolId, actualAgentId, actualParameters, securityContext, idempotencyKey, correlationId
      );

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
      this.markExecutionFailed(execution, error, `Failed to execute tool synchronously ${requestId}:`);
    }
  }
}
