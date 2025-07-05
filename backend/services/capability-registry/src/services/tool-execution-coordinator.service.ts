import { EventBusService, DatabaseService, redisCacheService } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import { randomUUID } from 'crypto';
import { UnifiedToolRegistry } from './unified-tool-registry.js';
import type { ToolExecution } from '@uaip/types';

interface ToolExecutionEvent {
  requestId: string;
  toolId: string;
  parameters: Record<string, any>;
  userId?: string;
  agentId?: string;
  projectId?: string;
  conversationId?: string;
  operationId?: string;
  context?: Record<string, any>;
}

interface ToolExecutionStatus {
  requestId: string;
  toolId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  startTime: number;
  endTime?: number;
  result?: any;
  error?: string;
  metadata?: Record<string, any>;
}

interface ToolExecutionResponse {
  requestId: string;
  toolId: string;
  status: 'SUCCESS' | 'ERROR';
  result?: any;
  error?: string;
  executionTime: number;
  metadata?: Record<string, any>;
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
    this.toolRegistry = new UnifiedToolRegistry();
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
      await this.eventBus.subscribe('tool.execute.request', this.handleToolExecutionRequest.bind(this));
      
      // Subscribe to sandbox execution requests
      await this.eventBus.subscribe('sandbox.execute.tool', this.handleSandboxExecutionRequest.bind(this));
      
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
        userId: event.userId,
        agentId: event.agentId,
        projectId: event.projectId
      });

      // Store execution status in Redis
      const executionStatus: ToolExecutionStatus = {
        requestId,
        toolId: event.toolId,
        status: 'PROCESSING',
        startTime,
        metadata: {
          userId: event.userId,
          agentId: event.agentId,
          projectId: event.projectId,
          conversationId: event.conversationId,
          operationId: event.operationId
        }
      };

      await this.updateExecutionStatus(executionStatus);

      // Emit execution started event
      await this.eventBus.publish('tool.execution.started', {
        requestId,
        toolId: event.toolId,
        timestamp: new Date(),
        context: event.context
      });

      // Execute the tool through the unified registry
      const result = await this.toolRegistry.executeTool(
        event.toolId,
        'execute',
        event.parameters || {},
        {
          userId: event.userId || '',
          agentId: event.agentId,
          projectId: event.projectId
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
          executionId: requestId
        }
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
        timestamp: new Date()
      });

      logger.info('Tool execution completed successfully', {
        requestId,
        executionTime: response.executionTime
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
        toolId: event.toolId
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
          projectId: event.projectId
        }
      );

      // Publish sandbox response
      await this.eventBus.publish(`sandbox.response.${requestId}`, {
        requestId,
        status: 'SUCCESS',
        result: result,
        executionTime: Date.now() - startTime,
        sandbox: true
      });

      logger.info('Sandbox execution completed', {
        requestId,
        executionTime: Date.now() - startTime
      });
    } catch (error) {
      await this.handleSandboxExecutionError(requestId, event, error, startTime);
    }
  }

  private async handleToolCancellation(event: { requestId: string; reason?: string }): Promise<void> {
    try {
      logger.info('Processing tool cancellation request', {
        requestId: event.requestId,
        reason: event.reason
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
          timestamp: new Date()
        });
      }
    } catch (error) {
      logger.error('Failed to handle tool cancellation', error);
    }
  }

  private async handleExecutionError(
    requestId: string,
    event: ToolExecutionEvent,
    error: any,
    startTime: number
  ): Promise<void> {
    logger.error('Tool execution failed', {
      requestId,
      toolId: event.toolId,
      error: error.message || String(error)
    });

    // Update execution status
    const executionStatus: ToolExecutionStatus = {
      requestId,
      toolId: event.toolId,
      status: 'FAILED',
      startTime,
      endTime: Date.now(),
      error: error.message || 'Tool execution failed'
    };
    await this.updateExecutionStatus(executionStatus);

    // Prepare error response
    const errorResponse: ToolExecutionResponse = {
      requestId,
      toolId: event.toolId,
      status: 'ERROR',
      error: error.message || 'Tool execution failed',
      executionTime: Date.now() - startTime
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
      timestamp: new Date()
    });
  }

  private async handleSandboxExecutionError(
    requestId: string,
    event: ToolExecutionEvent,
    error: any,
    startTime: number
  ): Promise<void> {
    logger.error('Sandbox execution failed', {
      requestId,
      toolId: event.toolId,
      error: error.message || String(error)
    });

    await this.eventBus.publish(`sandbox.response.${requestId}`, {
      requestId,
      status: 'ERROR',
      error: error.message || 'Sandbox execution failed',
      executionTime: Date.now() - startTime,
      sandbox: true
    });
  }

  private async updateExecutionStatus(status: ToolExecutionStatus): Promise<void> {
    try {
      const key = `tool:execution:${status.requestId}`;
      const ttl = this.executionTimeout / 1000; // Convert to seconds
      await this.redis.set(key, JSON.stringify(status), ttl);
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
   * Clean up old execution records from cache
   */
  async cleanupExecutionCache(olderThanMinutes: number = 60): Promise<number> {
    try {
      // This would be implemented with Redis SCAN command
      // For now, return 0
      logger.info(`Cleaning up execution cache older than ${olderThanMinutes} minutes`);
      return 0;
    } catch (error) {
      logger.error('Failed to cleanup execution cache', error);
      return 0;
    }
  }

  /**
   * Get execution metrics for monitoring
   */
  async getExecutionMetrics(timeWindowMinutes: number = 60): Promise<{
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
      byTool: {}
    };
  }
}