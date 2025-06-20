import { 
  EntitySubscriberInterface, 
  EventSubscriber, 
  InsertEvent, 
  UpdateEvent, 
  RemoveEvent 
} from 'typeorm';
import { MCPServer } from '../entities/mcpServer.entity.js';
import { OutboxPublisher } from '../integration/OutboxPublisher.js';
import { TypeOrmService } from '../typeormService.js';
import { logger } from '@uaip/utils';

@EventSubscriber()
export class MCPServerSubscriber implements EntitySubscriberInterface<MCPServer> {
  private outboxPublisher: OutboxPublisher | null = null;

  /**
   * Indicates that this subscriber only listen to MCPServer events.
   */
  listenTo() {
    return MCPServer;
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
  async afterInsert(event: InsertEvent<MCPServer>): Promise<void> {
    try {
      const server = event.entity;
      if (!server || !server.id) {
        logger.warn('MCPServer insert event missing entity or ID');
        return;
      }

      const outboxPublisher = this.getOutboxPublisher();
      await outboxPublisher.publishMCPServerEvent(
        server.id,
        'CREATE',
        this.serializeServerData(server)
      );

      logger.debug('MCPServer CREATE event published', { serverId: server.id });
    } catch (error) {
      logger.error('Failed to publish MCPServer CREATE event', {
        serverId: event.entity?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Called after entity update.
   */
  async afterUpdate(event: UpdateEvent<MCPServer>): Promise<void> {
    try {
      const server = event.entity as MCPServer;
      if (!server || !server.id) {
        logger.warn('MCPServer update event missing entity or ID');
        return;
      }

      const outboxPublisher = this.getOutboxPublisher();
      await outboxPublisher.publishMCPServerEvent(
        server.id,
        'UPDATE',
        this.serializeServerData(server)
      );

      logger.debug('MCPServer UPDATE event published', { serverId: server.id });
    } catch (error) {
      logger.error('Failed to publish MCPServer UPDATE event', {
        serverId: (event.entity as MCPServer)?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Called before entity removal.
   */
  async beforeRemove(event: RemoveEvent<MCPServer>): Promise<void> {
    try {
      const server = event.entity;
      if (!server || !server.id) {
        logger.warn('MCPServer remove event missing entity or ID');
        return;
      }

      const outboxPublisher = this.getOutboxPublisher();
      await outboxPublisher.publishMCPServerEvent(
        server.id,
        'DELETE',
        this.serializeServerData(server)
      );

      logger.debug('MCPServer DELETE event published', { serverId: server.id });
    } catch (error) {
      logger.error('Failed to publish MCPServer DELETE event', {
        serverId: event.entity?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Serialize server data for the integration event
   */
  private serializeServerData(server: MCPServer): Record<string, any> {
    return {
      id: server.id,
      name: server.name,
      description: server.description,
      type: server.type,
      status: server.status,
      enabled: server.enabled,
      autoStart: server.autoStart,
      capabilities: server.capabilities,
      tags: server.tags,
      author: server.author,
      version: server.version,
      securityLevel: server.securityLevel,
      metadata: {
        requiresApproval: server.requiresApproval,
        retryAttempts: server.retryAttempts,
        timeout: server.timeout,
        healthCheckInterval: server.healthCheckInterval,
        toolCount: server.toolCount,
        resourceCount: server.resourceCount,
        promptCount: server.promptCount,
        totalCalls: server.totalCalls,
        successfulCalls: server.successfulCalls,
        failedCalls: server.failedCalls,
        averageResponseTime: server.averageResponseTime,
        lastCallTime: server.lastCallTime,
        uptime: server.uptimeSeconds,
        restartCount: server.restartCount,
        crashCount: server.crashCount,
        createdAt: server.createdAt,
        updatedAt: server.updatedAt
      }
    };
  }
} 