import { Repository } from 'typeorm';
import { IntegrationEventEntity } from '../entities/integrationEvent.entity.js';
import { ToolGraphDatabase } from '../database/toolGraphDatabase.js';
import { OutboxPublisher } from './OutboxPublisher.js';
import { IntegrationEvent, GraphSyncResult, GraphSyncBatch } from './IntegrationEvent.js';
import { logger } from '@uaip/utils';

export class GraphSyncWorker {
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;
  private readonly batchSize: number = 50;
  private readonly intervalMs: number = 5000; // 5 seconds

  constructor(
    private readonly outboxPublisher: OutboxPublisher,
    private readonly toolGraphDatabase: ToolGraphDatabase
  ) {}

  /**
   * Start the sync worker
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('GraphSyncWorker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting GraphSyncWorker', { 
      batchSize: this.batchSize, 
      intervalMs: this.intervalMs 
    });

    this.intervalId = setInterval(async () => {
      try {
        await this.processBatch();
      } catch (error) {
        logger.error('Error in GraphSyncWorker batch processing', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.intervalMs);
  }

  /**
   * Stop the sync worker
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    logger.info('GraphSyncWorker stopped');
  }

  /**
   * Process a batch of pending events
   */
  private async processBatch(): Promise<void> {
    const events = await this.outboxPublisher.getPendingEvents(this.batchSize);
    
    if (events.length === 0) {
      return; // No events to process
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    logger.debug('Processing integration event batch', {
      batchId,
      eventCount: events.length
    });

    const batch: GraphSyncBatch = {
      events: events.map(this.mapEntityToEvent),
      batchId,
      startTime: new Date()
    };

    const results = await Promise.allSettled(
      batch.events.map(event => this.processEvent(event))
    );

    // Handle results
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const event = batch.events[i];

      if (result.status === 'fulfilled') {
        const syncResult = result.value;
        if (syncResult.success) {
          await this.outboxPublisher.markEventProcessed(event.id);
          logger.debug('Event processed successfully', {
            eventId: event.id,
            entityType: event.entityType,
            action: event.action
          });
        } else {
          await this.outboxPublisher.markEventFailed(event.id, syncResult.error || 'Unknown error');
          logger.warn('Event processing failed', {
            eventId: event.id,
            error: syncResult.error,
            retryable: syncResult.retryable
          });
        }
      } else {
        await this.outboxPublisher.markEventFailed(event.id, result.reason?.toString() || 'Processing error');
        logger.error('Event processing threw exception', {
          eventId: event.id,
          error: result.reason
        });
      }
    }

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    logger.info('Batch processing completed', {
      batchId,
      totalEvents: events.length,
      successCount,
      failedCount: events.length - successCount
    });
  }

  /**
   * Process a single integration event
   */
  private async processEvent(event: IntegrationEvent): Promise<GraphSyncResult> {
    try {
      switch (event.entityType) {
        case 'MCPServer':
          return await this.processMCPServerEvent(event);
        case 'MCPToolCall':
          return await this.processMCPToolCallEvent(event);
        case 'Tool':
          return await this.processToolEvent(event);
        case 'Agent':
          return await this.processAgentEvent(event);
        default:
          return {
            success: false,
            eventId: event.id,
            error: `Unknown entity type: ${event.entityType}`,
            retryable: false
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Determine if error is retryable
      const retryable = this.isRetryableError(error);
      
      return {
        success: false,
        eventId: event.id,
        error: errorMessage,
        retryable
      };
    }
  }

  /**
   * Process MCP Server events
   */
  private async processMCPServerEvent(event: IntegrationEvent): Promise<GraphSyncResult> {
    const { action, payload } = event;

    switch (action) {
      case 'CREATE':
      case 'UPDATE':
        await this.toolGraphDatabase.createMcpServerNode({
          id: event.entityId,
          name: payload.name,
          type: payload.type,
          status: payload.status,
          capabilities: payload.capabilities,
          tags: payload.tags,
          metadata: payload.metadata
        });
        break;

      case 'DELETE':
        await this.toolGraphDatabase.deleteMcpServerNode(event.entityId);
        break;

      default:
        return {
          success: false,
          eventId: event.id,
          error: `Unknown action for MCPServer: ${action}`,
          retryable: false
        };
    }

    return {
      success: true,
      eventId: event.id,
      retryable: false
    };
  }

  /**
   * Process MCP Tool Call events
   */
  private async processMCPToolCallEvent(event: IntegrationEvent): Promise<GraphSyncResult> {
    const { action, payload } = event;

    switch (action) {
      case 'CREATE':
        await this.toolGraphDatabase.createMcpToolCallNode({
          id: event.entityId,
          serverId: payload.serverId,
          toolName: payload.toolName,
          status: payload.status,
          duration: payload.duration,
          agentId: payload.agentId,
          timestamp: new Date(payload.timestamp),
          metadata: payload.metadata
        });
        break;

      case 'UPDATE':
        await this.toolGraphDatabase.updateMcpToolCallNode(event.entityId, {
          status: payload.status,
          duration: payload.duration,
          metadata: payload.metadata
        });
        break;

      case 'DELETE':
        // Tool calls are typically not deleted, but if they are:
        await this.toolGraphDatabase.updateMcpToolCallNode(event.entityId, {
          status: 'deleted',
          metadata: { ...payload.metadata, deletedAt: new Date().toISOString() }
        });
        break;

      default:
        return {
          success: false,
          eventId: event.id,
          error: `Unknown action for MCPToolCall: ${action}`,
          retryable: false
        };
    }

    return {
      success: true,
      eventId: event.id,
      retryable: false
    };
  }

  /**
   * Process Tool events
   */
  private async processToolEvent(event: IntegrationEvent): Promise<GraphSyncResult> {
    const { action, payload } = event;

    switch (action) {
      case 'CREATE':
      case 'UPDATE':
        await this.toolGraphDatabase.createToolNode({
          id: event.entityId,
          name: payload.name,
          description: payload.description || '',
          category: payload.category,
          version: payload.version || '1.0.0',
          parameters: payload.parameters || {},
          returnType: payload.returnType || {},
          examples: payload.examples || [],
          securityLevel: payload.securityLevel || 'safe',
          requiresApproval: payload.requiresApproval || false,
          dependencies: payload.dependencies || [],
          author: payload.author || 'system',
          tags: payload.tags || [],
          isEnabled: payload.isEnabled !== false,
          executionTimeEstimate: payload.executionTimeEstimate || 1000,
          costEstimate: payload.costEstimate || 0
        });

        // Link to MCP Server if specified
        if (payload.mcpServerId) {
          await this.toolGraphDatabase.linkToolToMcpServer(event.entityId, payload.mcpServerId);
        }
        break;

      case 'DELETE':
        await this.toolGraphDatabase.deleteToolNode(event.entityId);
        break;

      default:
        return {
          success: false,
          eventId: event.id,
          error: `Unknown action for Tool: ${action}`,
          retryable: false
        };
    }

    return {
      success: true,
      eventId: event.id,
      retryable: false
    };
  }

  /**
   * Process Agent events
   */
  private async processAgentEvent(event: IntegrationEvent): Promise<GraphSyncResult> {
    const { action, payload } = event;

    switch (action) {
      case 'CREATE':
      case 'UPDATE':
        // Create or update Agent node in Neo4j
        await this.toolGraphDatabase.createAgentNode({
          id: event.entityId,
          name: payload.name,
          role: payload.role,
          isActive: payload.isActive,
          capabilities: payload.capabilities || []
        });
        break;

      case 'DELETE':
        await this.toolGraphDatabase.deactivateAgentNode(event.entityId);
        break;

      default:
        return {
          success: false,
          eventId: event.id,
          error: `Unknown action for Agent: ${action}`,
          retryable: false
        };
    }

    return {
      success: true,
      eventId: event.id,
      retryable: false
    };
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || error.toString();
    
    // Neo4j connection errors are retryable
    if (errorMessage.includes('connection') || 
        errorMessage.includes('timeout') || 
        errorMessage.includes('network')) {
      return true;
    }

    // Temporary Neo4j errors
    if (errorMessage.includes('TransientError') ||
        errorMessage.includes('DeadlockDetected')) {
      return true;
    }

    // Schema errors are not retryable
    if (errorMessage.includes('constraint') ||
        errorMessage.includes('schema') ||
        errorMessage.includes('syntax')) {
      return false;
    }

    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Map TypeORM entity to IntegrationEvent interface
   */
  private mapEntityToEvent(entity: IntegrationEventEntity): IntegrationEvent {
    return {
      id: entity.id,
      entityType: entity.entityType,
      entityId: entity.entityId,
      action: entity.action,
      payload: entity.payload,
      timestamp: entity.timestamp,
      processed: entity.processed,
      retries: entity.retries,
      lastError: entity.lastError,
      version: entity.version
    };
  }

  /**
   * Process retry events
   */
  async processRetries(): Promise<void> {
    const retryableEvents = await this.outboxPublisher.getRetryableEvents();
    
    if (retryableEvents.length === 0) {
      return;
    }

    logger.info('Processing retry events', { count: retryableEvents.length });

    for (const entity of retryableEvents) {
      const event = this.mapEntityToEvent(entity);
      const result = await this.processEvent(event);

      if (result.success) {
        await this.outboxPublisher.markEventProcessed(event.id);
      } else {
        await this.outboxPublisher.markEventFailed(event.id, result.error || 'Retry failed');
      }
    }
  }

  /**
   * Get worker status
   */
  getStatus(): {
    isRunning: boolean;
    batchSize: number;
    intervalMs: number;
  } {
    return {
      isRunning: this.isRunning,
      batchSize: this.batchSize,
      intervalMs: this.intervalMs
    };
  }
} 