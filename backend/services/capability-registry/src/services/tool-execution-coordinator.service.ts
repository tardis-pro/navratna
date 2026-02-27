import { DatabaseService } from '@uaip/infra/database';
import { EventBusService } from '@uaip/infra/eventBus';
import { redisCacheService } from '@uaip/infra/cache';
import { logger } from '@uaip/utils';
import { randomUUID } from 'crypto';
import { UnifiedToolRegistry } from './unified-tool-registry.js';
import {
  getDangerToolConfig,
  toolRequiresApproval,
  getRequiredApprovalLevel,
  toolRequiresSecurityTeamApproval,
  toolRequiresAudit,
} from './dangerToolList.js';
import { config } from '../config/config.js';

/**
 * Security context for tool execution
 */
interface SecurityContext {
  userId: string;
  agentId: string;
  projectId?: string;
  approvalStatus?: ApprovalStatus;
}

interface ApprovalStatus {
  isApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  approvalLevel?: string;
}

/**
 * Tool Execution Event - consumed from tool.execute.request events
 * Supports both legacy format and new event-driven format with idempotency
 */
interface ToolExecutionEvent {
  requestId: string;
  toolId: string;
  agentId: string;
  parameters: Record<string, unknown>;
  securityContext?: SecurityContext;
  timestamp?: string;
  idempotencyKey?: string;
  correlationId?: string;
  // Legacy fields for backward compatibility
  userId?: string;
  projectId?: string;
  conversationId?: string;
  operationId?: string;
  context?: Record<string, unknown>;
}

interface ToolExecutionStatus {
  requestId: string;
  toolId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  startTime: number;
  endTime?: number;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface ToolExecutionResponse {
  requestId: string;
  toolId: string;
  status: 'SUCCESS' | 'ERROR';
  result?: unknown;
  error?: string;
  executionTime: number;
  metadata?: Record<string, unknown>;
}

/**
 * Central coordinator for tool execution requests
 * Listens to tool.execute.request events and routes them to appropriate executors
 */
export class ToolExecutionCoordinator {
  private static instance: ToolExecutionCoordinator;
  private eventBus: EventBusService;
  private database: DatabaseService;
  private redis: typeof redisCacheService;
  private toolRegistry: UnifiedToolRegistry;
  private isListening = false;
  private executionTimeout = 300000; // 5 minutes default

  private constructor() {
    this.eventBus = EventBusService.getInstance();
    this.database = DatabaseService.getInstance();
    this.redis = redisCacheService;
    this.toolRegistry = new UnifiedToolRegistry(this.eventBus);
  }

  static getInstance(): ToolExecutionCoordinator {
    if (!ToolExecutionCoordinator.instance) {
      ToolExecutionCoordinator.instance = new ToolExecutionCoordinator();
    }
    return ToolExecutionCoordinator.instance;
  }

  async initialize(): Promise<void> {
    if (this.isListening) {
      logger.warn('Tool execution coordinator already initialized');
      return;
    }

    try {
      // Initialize dependencies
      await this.toolRegistry.initialize();
      await this.redis.initialize();

      // Subscribe to tool execution requests
      await this.eventBus.subscribe(
        'tool.execute.request',
        this.handleToolExecutionRequest.bind(this)
      );

      // Subscribe to sandbox execution requests
      await this.eventBus.subscribe(
        'sandbox.execute.tool',
        this.handleSandboxExecutionRequest.bind(this)
      );

      // Subscribe to tool cancellation requests
      await this.eventBus.subscribe('tool.execute.cancel', this.handleToolCancellation.bind(this));

      this.isListening = true;
      logger.info('Tool execution coordinator initialized and listening');
    } catch (error) {
      logger.error('Failed to initialize tool execution coordinator', error);
      throw error;
    }
  }

  private async handleToolExecutionRequest(event: ToolExecutionEvent): Promise<void> {
    const startTime = Date.now();
    const requestId = event.requestId || randomUUID();

    try {
      logger.info('Processing tool execution request', {
        requestId,
        toolId: event.toolId,
        agentId: event.agentId,
        idempotencyKey: event.idempotencyKey,
        correlationId: event.correlationId,
        projectId: event.projectId,
      });

      // Check for idempotency - skip if already processing/executed with same key
      if (event.idempotencyKey) {
        const existingStatus = await this.getExecutionStatusByIdempotency(event.idempotencyKey);
        if (existingStatus && existingStatus.status !== 'FAILED') {
          logger.info('Duplicate execution detected, skipping', {
            idempotencyKey: event.idempotencyKey,
            existingStatus: existingStatus.status,
          });
          // Publish cached result if available
          if (existingStatus.status === 'COMPLETED' && existingStatus.result) {
            await this.eventBus.publish(`tool.response.${requestId}`, {
              requestId,
              toolId: event.toolId,
              status: 'SUCCESS',
              result: existingStatus.result,
              executionTime: Date.now() - startTime,
              metadata: { duplicated: true, originalRequestId: existingStatus.requestId },
            } as ToolExecutionResponse);
          }
          return;
        }
      }

      // P5 Security: Check if tool requires approval before execution
      if (config.tools.enableApprovalWorkflow) {
        const approvalResult = await this.checkAndEnforceApproval(event, requestId);
        if (approvalResult.blocked) {
          // Tool execution blocked due to missing approval
          logger.warn('Tool execution blocked - approval required', {
            requestId,
            toolId: event.toolId,
            requiredApproval: approvalResult.requiredApproval,
          });
          await this.eventBus.publish(`tool.response.${requestId}`, {
            requestId,
            toolId: event.toolId,
            status: 'ERROR',
            error: `APPROVAL_REQUIRED: This tool requires ${approvalResult.requiredApproval} approval before execution`,
            executionTime: Date.now() - startTime,
            metadata: {
              requiresApproval: true,
              requiredApproval: approvalResult.requiredApproval,
              approvalRequestId: approvalResult.approvalRequestId,
            },
          } as ToolExecutionResponse);
          return;
        }
      }

      // Store execution status in Redis
      const executionStatus: ToolExecutionStatus = {
        requestId,
        toolId: event.toolId,
        status: 'PROCESSING',
        startTime,
        metadata: {
          agentId: event.agentId,
          idempotencyKey: event.idempotencyKey,
          correlationId: event.correlationId,
          userId: event.userId,
          projectId: event.projectId,
          conversationId: event.conversationId,
          operationId: event.operationId,
        },
      };

      await this.updateExecutionStatus(executionStatus);

      // Emit execution started event
      await this.eventBus.publish('tool.execution.started', {
        requestId,
        toolId: event.toolId,
        timestamp: new Date(),
        context: event.context,
      });

      // Execute the tool through the unified registry
      const result = await this.toolRegistry.executeTool(
        event.toolId,
        'execute',
        event.parameters || {},
        {
          userId: event.userId || '',
          agentId: event.agentId,
          projectId: event.projectId,
        }
      );

      // Update execution status
      executionStatus.status = 'COMPLETED';
      executionStatus.endTime = Date.now();
      executionStatus.result = result;
      await this.updateExecutionStatus(executionStatus);

      // Prepare response
      const response: ToolExecutionResponse = {
        requestId,
        toolId: event.toolId,
        status: 'SUCCESS',
        result: result,
        executionTime: Date.now() - startTime,
        metadata: {
          executionId: requestId,
        },
      };

      // Publish response event
      await this.eventBus.publish(`tool.response.${requestId}`, response);

      // Publish completion event
      await this.eventBus.publish('tool.execution.completed', {
        requestId,
        toolId: event.toolId,
        executionTime: response.executionTime,
        userId: event.userId,
        agentId: event.agentId,
        timestamp: new Date(),
      });

      logger.info('Tool execution completed successfully', {
        requestId,
        executionTime: response.executionTime,
      });
    } catch (error) {
      await this.handleExecutionError(requestId, event, error, startTime);
    }
  }

  private async handleSandboxExecutionRequest(event: ToolExecutionEvent): Promise<void> {
    const startTime = Date.now();
    const requestId = event.requestId || randomUUID();

    try {
      logger.info('Processing sandbox execution request', {
        requestId,
        toolId: event.toolId,
      });

      // For now, delegate to regular execution with sandbox context
      // In production, this would create an isolated execution environment
      const result = await this.toolRegistry.executeTool(
        event.toolId,
        'execute',
        event.parameters,
        {
          userId: event.userId || '',
          agentId: event.agentId,
          projectId: event.projectId,
        }
      );

      // Publish sandbox response
      await this.eventBus.publish(`sandbox.response.${requestId}`, {
        requestId,
        status: 'SUCCESS',
        result: result,
        executionTime: Date.now() - startTime,
        sandbox: true,
      });

      logger.info('Sandbox execution completed', {
        requestId,
        executionTime: Date.now() - startTime,
      });
    } catch (error) {
      await this.handleSandboxExecutionError(requestId, event, error, startTime);
    }
  }

  private async handleToolCancellation(event: {
    requestId: string;
    reason?: string;
  }): Promise<void> {
    try {
      logger.info('Processing tool cancellation request', {
        requestId: event.requestId,
        reason: event.reason,
      });

      // Update execution status
      const status = await this.getExecutionStatus(event.requestId);
      if (status && status.status === 'PROCESSING') {
        status.status = 'FAILED';
        status.endTime = Date.now();
        status.error = `Cancelled: ${event.reason || 'User requested cancellation'}`;
        await this.updateExecutionStatus(status);

        // Emit cancellation event
        await this.eventBus.publish('tool.execution.cancelled', {
          requestId: event.requestId,
          reason: event.reason,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      logger.error('Failed to handle tool cancellation', error);
    }
  }

  private async handleExecutionError(
    requestId: string,
    event: ToolExecutionEvent,
    error: unknown,
    startTime: number
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Tool execution failed', {
      requestId,
      toolId: event.toolId,
      error: errorMessage,
    });

    // Update execution status
    const executionStatus: ToolExecutionStatus = {
      requestId,
      toolId: event.toolId,
      status: 'FAILED',
      startTime,
      endTime: Date.now(),
      error: errorMessage,
    };
    await this.updateExecutionStatus(executionStatus);

    // Prepare error response
    const errorResponse: ToolExecutionResponse = {
      requestId,
      toolId: event.toolId,
      status: 'ERROR',
      error: errorMessage || 'Tool execution failed',
      executionTime: Date.now() - startTime,
    };

    // Publish error response
    await this.eventBus.publish(`tool.response.${requestId}`, errorResponse);

    // Publish failure event
    await this.eventBus.publish('tool.execution.failed', {
      requestId,
      toolId: event.toolId,
      error: errorResponse.error,
      userId: event.userId,
      agentId: event.agentId,
      timestamp: new Date(),
    });
  }

  private async handleSandboxExecutionError(
    requestId: string,
    event: ToolExecutionEvent,
    error: unknown,
    startTime: number
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Sandbox execution failed', {
      requestId,
      toolId: event.toolId,
      error: errorMessage,
    });

    await this.eventBus.publish(`sandbox.response.${requestId}`, {
      requestId,
      status: 'ERROR',
      error: errorMessage || 'Sandbox execution failed',
      executionTime: Date.now() - startTime,
      sandbox: true,
    });
  }

  private async updateExecutionStatus(status: ToolExecutionStatus): Promise<void> {
    try {
      const key = `tool:execution:${status.requestId}`;
      const ttl = this.executionTimeout / 1000; // Convert to seconds
      await this.redis.set(key, JSON.stringify(status), ttl);

      // Store idempotency key mapping for duplicate detection
      if (status.metadata?.idempotencyKey) {
        const idempotencyKey = `tool:idempotency:${status.metadata.idempotencyKey}`;
        await this.redis.set(idempotencyKey, status.requestId, ttl);
      }
    } catch (error) {
      logger.error('Failed to update execution status in Redis', error);
    }
  }

  async getExecutionStatus(requestId: string): Promise<ToolExecutionStatus | null> {
    try {
      const key = `tool:execution:${requestId}`;
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('Failed to get execution status from Redis', error);
      return null;
    }
  }

  /**
   * Get execution status by idempotency key
   * Used to check if a duplicate request has already been processed
   */
  async getExecutionStatusByIdempotency(
    idempotencyKey: string
  ): Promise<ToolExecutionStatus | null> {
    try {
      const idempotencyKeyRedis = `tool:idempotency:${idempotencyKey}`;
      const requestId = await this.redis.get(idempotencyKeyRedis);

      if (!requestId) {
        logger.debug('Idempotency key not found', { idempotencyKey });
        return null;
      }

      return await this.getExecutionStatus(requestId);
    } catch (error) {
      logger.error('Failed to get execution status by idempotency key', error);
      return null;
    }
  }

  /**
   * Clean up old execution records from cache
   */
  async cleanupExecutionCache(_olderThanMinutes: number = 60): Promise<number> {
    try {
      // This would be implemented with Redis SCAN command
      // For now, return 0
      logger.info(`Cleaning up execution cache older than ${_olderThanMinutes} minutes`);
      return 0;
    } catch (error) {
      logger.error('Failed to cleanup execution cache', error);
      return 0;
    }
  }

  /**
   * Get execution metrics for monitoring
   */
  async getExecutionMetrics(_timeWindowMinutes: number = 60): Promise<{
    total: number;
    successful: number;
    failed: number;
    averageExecutionTime: number;
    byTool: Record<string, { count: number; avgTime: number }>;
  }> {
    // This would aggregate data from Redis
    // For now, return mock metrics
    return {
      total: 0,
      successful: 0,
      failed: 0,
      averageExecutionTime: 0,
      byTool: {},
    };
  }

  /**
   * P5 Security: Check if tool requires approval and enforce approval requirements
   * Returns { blocked: true } if approval is required but not granted
   */
  private async checkAndEnforceApproval(
    event: ToolExecutionEvent,
    requestId: string
  ): Promise<{ blocked: boolean; requiredApproval: string; approvalRequestId?: string }> {
    const toolId = event.toolId;

    // Check if tool requires approval
    if (!toolRequiresApproval(toolId)) {
      return { blocked: false, requiredApproval: 'NONE' };
    }

    // Get danger tool configuration
    const dangerConfig = getDangerToolConfig(toolId);
    if (!dangerConfig) {
      return { blocked: false, requiredApproval: 'NONE' };
    }

    // Get required approval level
    const requiredApproval = getRequiredApprovalLevel(toolId);

    // Check if execution is already approved
    const isApproved = event.securityContext?.approvalStatus?.isApproved === true;
    const approvedLevel = event.securityContext?.approvalStatus?.approvalLevel;

    // Check if the approval level meets the requirement
    const hasSufficientApproval = this.hasApprovalLevel(approvedLevel, requiredApproval);

    if (isApproved && hasSufficientApproval) {
      logger.info('Tool execution approved', {
        requestId,
        toolId,
        approvedBy: event.securityContext?.approvalStatus?.approvedBy,
        approvalLevel: approvedLevel,
      });
      return { blocked: false, requiredApproval };
    }

    // Tool requires approval but not granted - block execution
    const approvalRequestId = `approval_${requestId}_${Date.now()}`;

    // Emit approval required event
    await this.eventBus.publish('tool.approval.required', {
      approvalRequestId,
      toolId,
      requestId,
      requiredApproval,
      riskLevel: dangerConfig.riskLevel,
      categories: dangerConfig.categories,
      reason: dangerConfig.reason,
      userId: event.userId || event.securityContext?.userId,
      agentId: event.agentId,
      projectId: event.projectId,
      timestamp: new Date().toISOString(),
    });

    // Log audit event if required
    if (toolRequiresAudit(toolId)) {
      await this.eventBus.publish('tool.audit.log', {
        eventType: 'APPROVAL_REQUIRED',
        toolId,
        requestId,
        approvalRequestId,
        requiredApproval,
        riskLevel: dangerConfig.riskLevel,
        categories: dangerConfig.categories,
        userId: event.userId || event.securityContext?.userId,
        agentId: event.agentId,
        projectId: event.projectId,
        timestamp: new Date().toISOString(),
      });
    }

    return { blocked: true, requiredApproval, approvalRequestId };
  }

  /**
   * Check if a given approval level meets the required level
   */
  private hasApprovalLevel(userLevel: string | undefined, requiredLevel: string): boolean {
    const approvalHierarchy = ['NONE', 'USER_CONSENT', 'MANAGER', 'ADMIN', 'SECURITY_TEAM'];
    const userIndex = userLevel ? approvalHierarchy.indexOf(userLevel) : -1;
    const requiredIndex = approvalHierarchy.indexOf(requiredLevel);

    if (requiredIndex === -1) return false;
    if (userIndex === -1) return false;

    return userIndex >= requiredIndex;
  }
}
