import { 
  EntitySubscriberInterface, 
  EventSubscriber, 
  InsertEvent, 
  UpdateEvent, 
  RemoveEvent 
} from 'typeorm';
import { MCPToolCall } from '../entities/mcpToolCall.entity.js';
import { OutboxPublisher } from '../integration/OutboxPublisher.js';
import { TypeOrmService } from '../typeormService.js';
import { logger } from '@uaip/utils';

@EventSubscriber()
export class MCPToolCallSubscriber implements EntitySubscriberInterface<MCPToolCall> {
  private outboxPublisher: OutboxPublisher | null = null;

  /**
   * Indicates that this subscriber only listen to MCPToolCall events.
   */
  listenTo() {
    return MCPToolCall;
  }

  /**
   * Initialize outbox publisher lazily
   */
  private getOutboxPublisher(): OutboxPublisher {
    if (!this.outboxPublisher) {
      const typeormService = TypeOrmService.getInstance();
      const integrationEventRepository = typeormService.integrationEventRepository;
      this.outboxPublisher = new OutboxPublisher(integrationEventRepository);
    }
    return this.outboxPublisher;
  }

  /**
   * Called after entity insertion.
   */
  async afterInsert(event: InsertEvent<MCPToolCall>): Promise<void> {
    try {
      const toolCall = event.entity;
      if (!toolCall || !toolCall.id) {
        logger.warn('MCPToolCall insert event missing entity or ID');
        return;
      }

      const outboxPublisher = this.getOutboxPublisher();
      await outboxPublisher.publishMCPToolCallEvent(
        toolCall.id,
        'CREATE',
        this.serializeToolCallData(toolCall)
      );

      logger.debug('MCPToolCall CREATE event published', { toolCallId: toolCall.id });
    } catch (error) {
      logger.error('Failed to publish MCPToolCall CREATE event', {
        toolCallId: event.entity?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Called after entity update.
   */
  async afterUpdate(event: UpdateEvent<MCPToolCall>): Promise<void> {
    try {
      const toolCall = event.entity as MCPToolCall;
      if (!toolCall || !toolCall.id) {
        logger.warn('MCPToolCall update event missing entity or ID');
        return;
      }

      const outboxPublisher = this.getOutboxPublisher();
      await outboxPublisher.publishMCPToolCallEvent(
        toolCall.id,
        'UPDATE',
        this.serializeToolCallData(toolCall)
      );

      logger.debug('MCPToolCall UPDATE event published', { toolCallId: toolCall.id });
    } catch (error) {
      logger.error('Failed to publish MCPToolCall UPDATE event', {
        toolCallId: (event.entity as MCPToolCall)?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Called before entity removal.
   */
  async beforeRemove(event: RemoveEvent<MCPToolCall>): Promise<void> {
    try {
      const toolCall = event.entity;
      if (!toolCall || !toolCall.id) {
        logger.warn('MCPToolCall remove event missing entity or ID');
        return;
      }

      const outboxPublisher = this.getOutboxPublisher();
      await outboxPublisher.publishMCPToolCallEvent(
        toolCall.id,
        'DELETE',
        this.serializeToolCallData(toolCall)
      );

      logger.debug('MCPToolCall DELETE event published', { toolCallId: toolCall.id });
    } catch (error) {
      logger.error('Failed to publish MCPToolCall DELETE event', {
        toolCallId: event.entity?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Serialize tool call data for the integration event
   */
  private serializeToolCallData(toolCall: MCPToolCall): Record<string, any> {
    return {
      id: toolCall.id,
      serverId: toolCall.serverId,
      toolName: toolCall.toolName,
      parameters: toolCall.parameters,
      timestamp: toolCall.timestamp,
      status: toolCall.status,
      result: toolCall.result,
      error: toolCall.error,
      duration: toolCall.duration,
      agentId: toolCall.agentId,
      userId: toolCall.userId,
      conversationId: toolCall.conversationId,
      operationId: toolCall.operationId,
      sessionId: toolCall.sessionId,
      metadata: {
        startTime: toolCall.startTime,
        endTime: toolCall.endTime,
        queueTimeMs: toolCall.queueTimeMs,
        executionTimeMs: toolCall.executionTimeMs,
        networkTimeMs: toolCall.networkTimeMs,
        memoryUsageMb: toolCall.memoryUsageMb,
        cpuUsagePercent: toolCall.cpuUsagePercent,
        networkBytesSent: toolCall.networkBytesSent,
        networkBytesReceived: toolCall.networkBytesReceived,
        retryCount: toolCall.retryCount,
        maxRetries: toolCall.maxRetries,
        timeoutSeconds: toolCall.timeoutSeconds,
        qualityScore: toolCall.qualityScore,
        userSatisfaction: toolCall.userSatisfaction,
        securityLevel: toolCall.securityLevel,
        approvalRequired: toolCall.approvalRequired,
        approvedBy: toolCall.approvedBy,
        approvedAt: toolCall.approvedAt,
        complianceTags: toolCall.complianceTags,
        auditTrail: toolCall.auditTrail,
        errorCode: toolCall.errorCode,
        errorCategory: toolCall.errorCategory,
        stackTrace: toolCall.stackTrace,
        debugInfo: toolCall.debugInfo,
        costEstimate: toolCall.costEstimate,
        actualCost: toolCall.actualCost,
        billingCategory: toolCall.billingCategory,
        cancelledAt: toolCall.cancelledAt,
        cancelledBy: toolCall.cancelledBy,
        cancellationReason: toolCall.cancellationReason,
        cleanupCompleted: toolCall.cleanupCompleted,
        cleanupAt: toolCall.cleanupAt,
        tags: toolCall.tags,
        callContext: toolCall.callContext,
        externalReferences: toolCall.externalReferences,
        createdAt: toolCall.createdAt,
        updatedAt: toolCall.updatedAt
      }
    };
  }
} 