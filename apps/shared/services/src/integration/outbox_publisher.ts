<<<<<<< HEAD:apps/shared/services/src/integration/outbox_publisher.ts
import { IntegrationEvent } from './integration_event';
=======
import { IntegrationEvent } from './IntegrationEvent';
>>>>>>> 441faaf (feat: fix stuff):backend/shared/services/src/integration/OutboxPublisher.ts
import { logger } from '@uaip/utils';
import { getControlPool } from '../database/drizzle/clients/index';

export class OutboxPublisher {
<<<<<<< HEAD:apps/shared/services/src/integration/outbox_publisher.ts
=======
  constructor() {}

>>>>>>> 441faaf (feat: fix stuff):backend/shared/services/src/integration/OutboxPublisher.ts
  async publishEvent(
    entityType: IntegrationEvent['entityType'],
    entityId: string,
    action: IntegrationEvent['action'],
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      const pool = getControlPool();
      const result = await pool.query(
        `INSERT INTO "integration_events" (id, "entityType", "entityId", action, payload, "timestamp", processed, retries, version)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), false, 0, 1) RETURNING *`,
        [entityType, entityId, action, JSON.stringify(payload)]
      );

      logger.debug('Integration event published', {
        eventId: result.rows[0]?.id,
        entityType,
        entityId,
        action,
      });
    } catch (error) {
      logger.error('Failed to publish integration event', {
        entityType,
        entityId,
        action,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async publishMCPServerEvent(
    serverId: string,
    action: IntegrationEvent['action'],
    serverData: Record<string, unknown>
  ): Promise<void> {
    await this.publishEvent('MCPServer', serverId, action, serverData);
  }

  async publishMCPToolCallEvent(
    toolCallId: string,
    action: IntegrationEvent['action'],
    toolCallData: Record<string, unknown>
  ): Promise<void> {
    await this.publishEvent('MCPToolCall', toolCallId, action, toolCallData);
  }

  async publishToolEvent(
    toolId: string,
    action: IntegrationEvent['action'],
    toolData: Record<string, unknown>
  ): Promise<void> {
    await this.publishEvent('Tool', toolId, action, toolData);
  }

  async publishAgentEvent(
    agentId: string,
    action: IntegrationEvent['action'],
    agentData: Record<string, unknown>
  ): Promise<void> {
    await this.publishEvent('Agent', agentId, action, agentData);
  }

  async getPendingEvents(limit: number = 100): Promise<IntegrationEvent[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM "integration_events" WHERE processed = false ORDER BY "timestamp" ASC LIMIT $1`,
      [limit]
    );
    return result.rows as IntegrationEvent[];
  }

  async markEventProcessed(eventId: string): Promise<void> {
    const pool = getControlPool();
    await pool.query(
      `UPDATE "integration_events" SET processed = true, "processedAt" = NOW() WHERE id = $1`,
      [eventId]
    );
  }

  async markEventFailed(eventId: string, error: string): Promise<void> {
    const pool = getControlPool();

<<<<<<< HEAD:apps/shared/services/src/integration/outbox_publisher.ts
    const eventResult = await pool.query(`SELECT * FROM "integration_events" WHERE id = $1`, [
      eventId,
    ]);
=======
    const eventResult = await pool.query(
      `SELECT * FROM "integration_events" WHERE id = $1`,
      [eventId]
    );
>>>>>>> 441faaf (feat: fix stuff):backend/shared/services/src/integration/OutboxPublisher.ts

    if (eventResult.rows.length === 0) {
      throw new Error(`Integration event not found: ${eventId}`);
    }

    const event = eventResult.rows[0] as IntegrationEvent;
    const retries = event.retries + 1;
    const maxRetries = 5;

    const nextRetryAt = new Date();
    nextRetryAt.setMinutes(nextRetryAt.getMinutes() + Math.pow(2, retries));

    await pool.query(
      `UPDATE "integration_events" SET retries = $1, "lastError" = $2, "nextRetryAt" = $3 WHERE id = $4`,
      [retries, error, retries < maxRetries ? nextRetryAt : null, eventId]
    );
  }

  async getRetryableEvents(limit: number = 50): Promise<IntegrationEvent[]> {
    const pool = getControlPool();
    const result = await pool.query(
      `SELECT * FROM "integration_events" WHERE processed = false AND retries < 5 AND "nextRetryAt" <= NOW() ORDER BY "nextRetryAt" ASC LIMIT $1`,
      [limit]
    );
    return result.rows as IntegrationEvent[];
  }

  async cleanupOldEvents(olderThanDays: number = 7): Promise<number> {
    const pool = getControlPool();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await pool.query(
      `DELETE FROM "integration_events" WHERE processed = true AND "processedAt" < $1`,
      [cutoffDate]
    );

    return result.rowCount || 0;
  }
}
