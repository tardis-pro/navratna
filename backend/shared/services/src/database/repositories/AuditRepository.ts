import { logger } from '@uaip/utils';
import { BaseRepository } from '../base/BaseRepository.js';
import { AuditEvent } from '../../entities/auditEvent.entity.js';

export class AuditRepository extends BaseRepository<AuditEvent> {
  constructor() {
    super(AuditEvent);
  }

  /**
   * Create audit event
   */
  public async createAuditEvent(eventData: {
    id: string;
    eventType: string;
    userId?: string;
    agentId?: string;
    resourceType?: string;
    resourceId?: string;
    details: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    riskLevel?: string;
    timestamp: Date;
  }): Promise<AuditEvent> {
    const event = this.repository.create(eventData);
    return await this.repository.save(event);
  }

  /**
   * Query audit events with filters (excludes archived events by default)
   */
  public async queryAuditEvents(filters: {
    eventTypes?: string[];
    userId?: string;
    agentId?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: string;
    limit?: number;
    offset?: number;
    includeArchived?: boolean;
  }): Promise<AuditEvent[]> {
    const queryBuilder = this.repository.createQueryBuilder('event');

    // Exclude archived events by default unless explicitly requested
    if (!filters.includeArchived) {
      queryBuilder.where('event.isArchived = :isArchived', { isArchived: false });
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      queryBuilder.andWhere('event.eventType = ANY(:eventTypes)', { eventTypes: filters.eventTypes });
    }

    if (filters.userId) {
      queryBuilder.andWhere('event.userId = :userId', { userId: filters.userId });
    }

    if (filters.agentId) {
      queryBuilder.andWhere('event.agentId = :agentId', { agentId: filters.agentId });
    }

    if (filters.resourceType) {
      queryBuilder.andWhere('event.resourceType = :resourceType', { resourceType: filters.resourceType });
    }

    if (filters.resourceId) {
      queryBuilder.andWhere('event.resourceId = :resourceId', { resourceId: filters.resourceId });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('event.timestamp >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('event.timestamp <= :endDate', { endDate: filters.endDate });
    }

    if (filters.riskLevel) {
      queryBuilder.andWhere('event.riskLevel = :riskLevel', { riskLevel: filters.riskLevel });
    }

    queryBuilder.orderBy('event.timestamp', 'DESC');

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    return await queryBuilder.getMany();
  }

  /**
   * Count recent events for security monitoring (excludes archived events)
   */
  public async countRecentAuditEvents(
    eventType: string,
    userId?: string,
    minutesBack: number = 5,
    detailsFilter?: Record<string, any>
  ): Promise<number> {
    const queryBuilder = this.repository.createQueryBuilder('event');

    const timeThreshold = new Date();
    timeThreshold.setMinutes(timeThreshold.getMinutes() - minutesBack);

    queryBuilder
      .where('event.eventType = :eventType', { eventType })
      .andWhere('event.timestamp >= :timeThreshold', { timeThreshold })
      .andWhere('event.isArchived = :isArchived', { isArchived: false });

    if (userId) {
      queryBuilder.andWhere('event.userId = :userId', { userId });
    }

    if (detailsFilter) {
      Object.keys(detailsFilter).forEach(key => {
        queryBuilder.andWhere(`event.details ->> :key = :value`, {
          key,
          value: detailsFilter[key]
        });
      });
    }

    return await queryBuilder.getCount();
  }

  /**
   * Get audit events for date range (for reports, excludes archived events by default)
   */
  public async getAuditEventsInRange(startDate: Date, endDate: Date, includeArchived: boolean = false): Promise<AuditEvent[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('event')
      .where('event.timestamp >= :startDate', { startDate })
      .andWhere('event.timestamp <= :endDate', { endDate });

    if (!includeArchived) {
      queryBuilder.andWhere('event.isArchived = :isArchived', { isArchived: false });
    }

    return await queryBuilder
      .orderBy('event.timestamp', 'DESC')
      .getMany();
  }

  /**
   * Archive old audit events (mark as archived instead of deleting)
   */
  public async archiveOldAuditEvents(compressionDate: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ 
        isArchived: true, 
        archivedAt: new Date(),
        updatedAt: new Date()
      })
      .where('timestamp < :compressionDate', { compressionDate })
      .andWhere('isArchived = :isArchived', { isArchived: false })
      .execute();
    return result.affected || 0;
  }

  /**
   * Delete old archived audit events
   */
  public async deleteOldArchivedAuditEvents(cutoffDate: Date): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoffDate', { cutoffDate })
      .andWhere('isArchived = :isArchived', { isArchived: true })
      .execute();
    return result.affected || 0;
  }

  /**
   * Get audit events excluding archived ones (for normal queries)
   */
  public async getActiveAuditEvents(filters: {
    eventTypes?: string[];
    userId?: string;
    agentId?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]> {
    const queryBuilder = this.repository.createQueryBuilder('event');

    // Exclude archived events by default
    queryBuilder.where('event.isArchived = :isArchived', { isArchived: false });

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      queryBuilder.andWhere('event.eventType = ANY(:eventTypes)', { eventTypes: filters.eventTypes });
    }

    if (filters.userId) {
      queryBuilder.andWhere('event.userId = :userId', { userId: filters.userId });
    }

    if (filters.agentId) {
      queryBuilder.andWhere('event.agentId = :agentId', { agentId: filters.agentId });
    }

    if (filters.resourceType) {
      queryBuilder.andWhere('event.resourceType = :resourceType', { resourceType: filters.resourceType });
    }

    if (filters.resourceId) {
      queryBuilder.andWhere('event.resourceId = :resourceId', { resourceId: filters.resourceId });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('event.timestamp >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('event.timestamp <= :endDate', { endDate: filters.endDate });
    }

    if (filters.riskLevel) {
      queryBuilder.andWhere('event.riskLevel = :riskLevel', { riskLevel: filters.riskLevel });
    }

    queryBuilder.orderBy('event.timestamp', 'DESC');

    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    return await queryBuilder.getMany();
  }

  /**
   * Search audit logs with complex filtering and pagination (for auditRoutes)
   */
  public async searchAuditLogs(filters: {
    eventType?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    ipAddress?: string;
    search?: string;
    sortBy?: 'timestamp' | 'eventType' | 'userId';
    sortOrder?: 'ASC' | 'DESC';
    limit?: number;
    offset?: number;
  }): Promise<{ logs: any[]; total: number }> {
    const queryBuilder = this.repository.createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .select([
        'event.id',
        'event.eventType',
        'event.userId',
        'event.details',
        'event.ipAddress',
        'event.userAgent',
        'event.timestamp',
        'user.email'
      ]);

    // Exclude archived events by default
    queryBuilder.where('event.isArchived = :isArchived', { isArchived: false });

    if (filters.eventType) {
      queryBuilder.andWhere('event.eventType = :eventType', { eventType: filters.eventType });
    }

    if (filters.userId) {
      queryBuilder.andWhere('event.userId = :userId', { userId: filters.userId });
    }

    if (filters.startDate) {
      queryBuilder.andWhere('event.timestamp >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('event.timestamp <= :endDate', { endDate: filters.endDate });
    }

    if (filters.ipAddress) {
      queryBuilder.andWhere('event.ipAddress = :ipAddress', { ipAddress: filters.ipAddress });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(event.eventType ILIKE :search OR CAST(event.details AS TEXT) ILIKE :search OR user.email ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    // Add sorting
    const sortBy = filters.sortBy || 'timestamp';
    const sortOrder = filters.sortOrder || 'DESC';
    queryBuilder.orderBy(`event.${sortBy}`, sortOrder);

    // Get total count for pagination
    const totalCount = await queryBuilder.getCount();

    // Add pagination
    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    const logs = await queryBuilder.getMany();

    return { logs, total: totalCount };
  }

  /**
   * Get audit log by ID with user details
   */
  public async getAuditLogById(logId: string): Promise<any | null> {
    const log = await this.repository.createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .select([
        'event.id',
        'event.eventType',
        'event.userId',
        'event.details',
        'event.ipAddress',
        'event.userAgent',
        'event.timestamp',
        'user.email',
        'user.role'
      ])
      .where('event.id = :logId', { logId })
      .andWhere('event.isArchived = :isArchived', { isArchived: false })
      .getOne();

    return log;
  }

  /**
   * Get distinct event types with counts
   */
  public async getAuditEventTypes(): Promise<Array<{ eventType: string; count: number }>> {
    const result = await this.repository.createQueryBuilder('event')
      .select('event.eventType', 'eventType')
      .addSelect('COUNT(*)', 'count')
      .where('event.isArchived = :isArchived', { isArchived: false })
      .groupBy('event.eventType')
      .orderBy('count', 'DESC')
      .addOrderBy('event.eventType', 'ASC')
      .getRawMany();

    return result.map(row => ({
      eventType: row.eventType,
      count: parseInt(row.count)
    }));
  }

  /**
   * Get audit statistics for a time period
   */
  public async getAuditStatistics(timeframe: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<{
    eventTypes: Array<{ eventType: string; count: number; uniqueUsers: number; uniqueIPs: number }>;
    hourlyDistribution: Array<{ hour: number; count: number }>;
    topUsers: Array<{ userId: string; email: string; eventCount: number }>;
    topIPAddresses: Array<{ ipAddress: string; eventCount: number; uniqueUsers: number }>;
    summary: { totalEvents: number; uniqueUsers: number; uniqueIPs: number };
  }> {
    // Calculate time condition
    const now = new Date();
    let timeThreshold: Date;
    switch (timeframe) {
      case '1h':
        timeThreshold = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        timeThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        timeThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        timeThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        timeThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Get event type statistics
    const eventTypeStats = await this.repository.createQueryBuilder('event')
      .select('event.eventType', 'eventType')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COUNT(DISTINCT event.userId)', 'uniqueUsers')
      .addSelect('COUNT(DISTINCT event.ipAddress)', 'uniqueIPs')
      .where('event.timestamp >= :timeThreshold', { timeThreshold })
      .andWhere('event.isArchived = :isArchived', { isArchived: false })
      .groupBy('event.eventType')
      .orderBy('count', 'DESC')
      .getRawMany();

    // Get hourly distribution
    const hourlyStats = await this.repository.createQueryBuilder('event')
      .select('EXTRACT(HOUR FROM event.timestamp)', 'hour')
      .addSelect('COUNT(*)', 'count')
      .where('event.timestamp >= :timeThreshold', { timeThreshold })
      .andWhere('event.isArchived = :isArchived', { isArchived: false })
      .groupBy('EXTRACT(HOUR FROM event.timestamp)')
      .orderBy('hour', 'ASC')
      .getRawMany();

    // Get top users
    const topUsers = await this.repository.createQueryBuilder('event')
      .leftJoin('event.user', 'user')
      .select('event.userId', 'userId')
      .addSelect('user.email', 'email')
      .addSelect('COUNT(*)', 'eventCount')
      .where('event.timestamp >= :timeThreshold', { timeThreshold })
      .andWhere('event.isArchived = :isArchived', { isArchived: false })
      .andWhere('event.userId IS NOT NULL')
      .groupBy('event.userId, user.email')
      .orderBy('eventCount', 'DESC')
      .limit(10)
      .getRawMany();

    // Get top IP addresses
    const topIPs = await this.repository.createQueryBuilder('event')
      .select('event.ipAddress', 'ipAddress')
      .addSelect('COUNT(*)', 'eventCount')
      .addSelect('COUNT(DISTINCT event.userId)', 'uniqueUsers')
      .where('event.timestamp >= :timeThreshold', { timeThreshold })
      .andWhere('event.isArchived = :isArchived', { isArchived: false })
      .andWhere('event.ipAddress IS NOT NULL')
      .groupBy('event.ipAddress')
      .orderBy('eventCount', 'DESC')
      .limit(10)
      .getRawMany();

    // Calculate summary
    const totalEvents = eventTypeStats.reduce((sum, row) => sum + parseInt(row.count), 0);
    const uniqueUsers = new Set(topUsers.map(row => row.userId)).size;
    const uniqueIPs = new Set(topIPs.map(row => row.ipAddress)).size;

    return {
      eventTypes: eventTypeStats.map(row => ({
        eventType: row.eventType,
        count: parseInt(row.count),
        uniqueUsers: parseInt(row.uniqueUsers),
        uniqueIPs: parseInt(row.uniqueIPs)
      })),
      hourlyDistribution: hourlyStats.map(row => ({
        hour: parseInt(row.hour),
        count: parseInt(row.count)
      })),
      topUsers: topUsers.map(row => ({
        userId: row.userId,
        email: row.email,
        eventCount: parseInt(row.eventCount)
      })),
      topIPAddresses: topIPs.map(row => ({
        ipAddress: row.ipAddress,
        eventCount: parseInt(row.eventCount),
        uniqueUsers: parseInt(row.uniqueUsers)
      })),
      summary: {
        totalEvents,
        uniqueUsers,
        uniqueIPs
      }
    };
  }

  /**
   * Get user activity audit trail with pagination
   */
  public async getUserActivityAuditTrail(filters: {
    userId: string;
    startDate?: Date;
    endDate?: Date;
    eventType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ activities: any[]; total: number }> {
    const queryBuilder = this.repository.createQueryBuilder('event')
      .leftJoin('event.user', 'user')
      .select([
        'event.id',
        'event.eventType',
        'event.details',
        'event.ipAddress',
        'event.userAgent',
        'event.timestamp',
        'user.email',
        'user.role'
      ])
      .where('event.userId = :userId', { userId: filters.userId })
      .andWhere('event.isArchived = :isArchived', { isArchived: false });

    if (filters.startDate) {
      queryBuilder.andWhere('event.timestamp >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('event.timestamp <= :endDate', { endDate: filters.endDate });
    }

    if (filters.eventType) {
      queryBuilder.andWhere('event.eventType = :eventType', { eventType: filters.eventType });
    }

    queryBuilder.orderBy('event.timestamp', 'DESC');

    // Get total count
    const total = await queryBuilder.getCount();

    // Add pagination
    if (filters.limit) {
      queryBuilder.limit(filters.limit);
    }

    if (filters.offset) {
      queryBuilder.offset(filters.offset);
    }

    const activities = await queryBuilder.getMany();

    return { activities, total };
  }
} 