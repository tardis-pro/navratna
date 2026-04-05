import { eq, desc, and, gte, lte, ilike, or, count } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import {
  auditEvents,
  type AuditEvent,
  type NewAuditEvent,
} from '../drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';

export class AuditRepository {
  private get db() {
    return getControlDb();
  }

  async getAuditLogById(id: string): Promise<AuditEvent | null> {
    try {
      const [row] = await this.db.select().from(auditEvents).where(eq(auditEvents.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('AuditRepository.getAuditLogById failed', { id, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getUserActivityAuditTrail(userId: string, filters: { startDate?: Date; endDate?: Date; limit?: number; offset?: number } = {}) {
    return this.getUserActivity(userId, filters);
  }

  async createAuditEvent(data: {
    eventType?: string;
    event_type?: string;
    userId?: string;
    actor_id?: string;
    agentId?: string;
    resourceType?: string;
    entity_type?: string;
    resourceId?: string;
    entity_id?: string;
    action?: string;
    outcome?: string;
    riskLevel?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    ip_address?: string;
    userAgent?: string;
    user_agent?: string;
  }): Promise<AuditEvent> {
    try {
      const insert: NewAuditEvent = {
        eventType: data.eventType ?? data.event_type ?? 'unknown',
        actorId: data.userId ?? data.actor_id ?? null,
        actorType: data.agentId ? 'agent' : 'user',
        entityType: data.resourceType ?? data.entity_type ?? null,
        entityId: data.resourceId ?? data.entity_id ?? null,
        action: data.action ?? data.eventType ?? data.event_type ?? 'unknown',
        outcome: data.outcome ?? data.riskLevel ?? 'info',
        details: data.details ?? null,
        ipAddress: data.ipAddress ?? data.ip_address ?? null,
        userAgent: data.userAgent ?? data.user_agent ?? null,
      };
      const [row] = await this.db.insert(auditEvents).values(insert).returning();
      return row;
    } catch (error) {
      logger.error('AuditRepository.createAuditEvent failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async searchAuditLogs(filters: {
    eventType?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    ipAddress?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AuditEvent[]; total: number }> {
    try {
      const clauses = [];
      if (filters.eventType) clauses.push(eq(auditEvents.eventType, filters.eventType));
      if (filters.userId) clauses.push(eq(auditEvents.actorId, filters.userId));
      if (filters.ipAddress) clauses.push(eq(auditEvents.ipAddress, filters.ipAddress));
      if (filters.startDate) clauses.push(gte(auditEvents.createdAt, filters.startDate));
      if (filters.endDate) clauses.push(lte(auditEvents.createdAt, filters.endDate));
      if (filters.search) {
        const pattern = `%${filters.search}%`;
        clauses.push(or(ilike(auditEvents.eventType, pattern), ilike(auditEvents.action, pattern)));
      }

      const where = clauses.length > 0 ? and(...(clauses as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])) : undefined;

      const [{ value: total }] = await this.db
        .select({ value: count() })
        .from(auditEvents)
        .where(where);

      const logs = await this.db
        .select()
        .from(auditEvents)
        .where(where)
        .orderBy(filters.sortOrder === 'ASC' ? auditEvents.createdAt : desc(auditEvents.createdAt))
        .limit(filters.limit ?? 20)
        .offset(filters.offset ?? 0);

      return { logs, total: Number(total) };
    } catch (error) {
      logger.error('AuditRepository.searchAuditLogs failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getStats(timeframe?: string): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    recentActivity: AuditEvent[];
  }> {
    try {
      const cutoff = new Date();
      const hours = timeframe === '1h' ? 1 : timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720;
      cutoff.setHours(cutoff.getHours() - hours);

      const allInWindow = await this.db
        .select()
        .from(auditEvents)
        .where(gte(auditEvents.createdAt, cutoff))
        .orderBy(desc(auditEvents.createdAt))
        .limit(500);

      const eventsByType: Record<string, number> = {};
      for (const ev of allInWindow) {
        eventsByType[ev.eventType] = (eventsByType[ev.eventType] ?? 0) + 1;
      }

      return {
        totalEvents: allInWindow.length,
        eventsByType,
        recentActivity: allInWindow.slice(0, 10),
      };
    } catch (error) {
      logger.error('AuditRepository.getStats failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getEventTypes(): Promise<string[]> {
    try {
      const rows = await this.db
        .selectDistinct({ eventType: auditEvents.eventType })
        .from(auditEvents)
        .orderBy(auditEvents.eventType);
      return rows.map((r) => r.eventType);
    } catch (error) {
      logger.error('AuditRepository.getEventTypes failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getUserActivity(userId: string, filters: { startDate?: Date; endDate?: Date; limit?: number; offset?: number } = {}): Promise<{ logs: AuditEvent[]; total: number }> {
    try {
      const clauses = [eq(auditEvents.actorId, userId)];
      if (filters.startDate) clauses.push(gte(auditEvents.createdAt, filters.startDate));
      if (filters.endDate) clauses.push(lte(auditEvents.createdAt, filters.endDate));
      const where = and(...(clauses as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]));

      const [{ value: total }] = await this.db.select({ value: count() }).from(auditEvents).where(where);
      const logs = await this.db.select().from(auditEvents).where(where).orderBy(desc(auditEvents.createdAt)).limit(filters.limit ?? 20).offset(filters.offset ?? 0);
      return { logs, total: Number(total) };
    } catch (error) {
      logger.error('AuditRepository.getUserActivity failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async queryAuditEvents(filters: Record<string, unknown> = {}): Promise<AuditEvent[]> {
    const clauses = [];
    if (filters['eventType']) clauses.push(eq(auditEvents.eventType, filters['eventType'] as string));
    if (filters['actorId']) clauses.push(eq(auditEvents.actorId, filters['actorId'] as string));
    const where = clauses.length > 0 ? and(...(clauses as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]]))  : undefined;
    return this.db.select().from(auditEvents).where(where).orderBy(desc(auditEvents.createdAt)).limit(100);
  }

  async archiveOldAuditEvents(_before: Date): Promise<number> {
    return 0;
  }

  async deleteOldArchivedAuditEvents(_before: Date): Promise<number> {
    return 0;
  }

  async countRecentAuditEvents(_filters: Record<string, unknown>): Promise<number> {
    const [{ value }] = await this.db.select({ value: count() }).from(auditEvents);
    return Number(value);
  }
}
