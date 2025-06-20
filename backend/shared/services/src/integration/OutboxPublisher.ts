import { Repository } from 'typeorm';
import { IntegrationEventEntity } from '../entities/integrationEvent.entity.js';
import { IntegrationEvent } from './IntegrationEvent.js';
import { logger } from '@uaip/utils';

export class OutboxPublisher {
  constructor(
    private readonly integrationEventRepository: Repository<IntegrationEventEntity>
  ) {}

  /**
   * Publish an integration event to the outbox
   */
  async publishEvent(
    entityType: IntegrationEvent['entityType'],
    entityId: string,
    action: IntegrationEvent['action'],
    payload: Record<string, any>
  ): Promise<void> {
    try {
      const event = this.integrationEventRepository.create({
        entityType,
        entityId,
        action,
        payload,
        processed: false,
        retries: 0,
        version: 1
      });

      await this.integrationEventRepository.save(event);
      
      logger.debug('Integration event published', {
        eventId: event.id,
        entityType,
        entityId,
        action
      });
    } catch (error) {
      logger.error('Failed to publish integration event', {
        entityType,
        entityId,
        action,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Publish MCP Server event
   */
  async publishMCPServerEvent(
    serverId: string,
    action: IntegrationEvent['action'],
    serverData: Record<string, any>
  ): Promise<void> {
    await this.publishEvent('MCPServer', serverId, action, serverData);
  }

  /**
   * Publish MCP Tool Call event
   */
  async publishMCPToolCallEvent(
    toolCallId: string,
    action: IntegrationEvent['action'],
    toolCallData: Record<string, any>
  ): Promise<void> {
    await this.publishEvent('MCPToolCall', toolCallId, action, toolCallData);
  }

  /**
   * Publish Tool event
   */
  async publishToolEvent(
    toolId: string,
    action: IntegrationEvent['action'],
    toolData: Record<string, any>
  ): Promise<void> {
    await this.publishEvent('Tool', toolId, action, toolData);
  }

  /**
   * Publish Agent event
   */
  async publishAgentEvent(
    agentId: string,
    action: IntegrationEvent['action'],
    agentData: Record<string, any>
  ): Promise<void> {
    await this.publishEvent('Agent', agentId, action, agentData);
  }

  /**
   * Get pending events for processing
   */
  async getPendingEvents(limit: number = 100): Promise<IntegrationEventEntity[]> {
    return this.integrationEventRepository.find({
      where: { processed: false },
      order: { timestamp: 'ASC' },
      take: limit
    });
  }

  /**
   * Mark event as processed
   */
  async markEventProcessed(eventId: string): Promise<void> {
    await this.integrationEventRepository.update(eventId, {
      processed: true,
      processedAt: new Date()
    });
  }

  /**
   * Mark event as failed and increment retry count
   */
  async markEventFailed(eventId: string, error: string): Promise<void> {
    const event = await this.integrationEventRepository.findOne({
      where: { id: eventId }
    });

    if (!event) {
      throw new Error(`Integration event not found: ${eventId}`);
    }

    const retries = event.retries + 1;
    const maxRetries = 5;
    
    // Calculate next retry time with exponential backoff
    const nextRetryAt = new Date();
    nextRetryAt.setMinutes(nextRetryAt.getMinutes() + Math.pow(2, retries));

    await this.integrationEventRepository.update(eventId, {
      retries,
      lastError: error,
      nextRetryAt: retries < maxRetries ? nextRetryAt : null
    });
  }

  /**
   * Get events ready for retry
   */
  async getRetryableEvents(limit: number = 50): Promise<IntegrationEventEntity[]> {
    return this.integrationEventRepository
      .createQueryBuilder('event')
      .where('event.processed = :processed', { processed: false })
      .andWhere('event.retries < :maxRetries', { maxRetries: 5 })
      .andWhere('event.nextRetryAt <= :now', { now: new Date() })
      .orderBy('event.nextRetryAt', 'ASC')
      .limit(limit)
      .getMany();
  }

  /**
   * Clean up old processed events
   */
  async cleanupOldEvents(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.integrationEventRepository
      .createQueryBuilder()
      .delete()
      .where('processed = :processed', { processed: true })
      .andWhere('processedAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }
} 