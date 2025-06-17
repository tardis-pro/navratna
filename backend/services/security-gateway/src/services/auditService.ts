
import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { DatabaseService } from '@uaip/shared-services';
import {
  AuditEvent,
  AuditEventType,
  SecurityLevel,
  User
} from '@uaip/types';

export interface AuditLogRequest {
  eventType: AuditEventType;
  userId?: string;
  agentId?: string;
  resourceType?: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  riskLevel?: SecurityLevel;
}

export interface AuditQuery {
  eventTypes?: AuditEventType[];
  userId?: string;
  agentId?: string;
  resourceType?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  riskLevel?: SecurityLevel;
  limit?: number;
  offset?: number;
}

export interface AuditReport {
  summary: {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByRiskLevel: Record<string, number>;
    uniqueUsers: number;
    timeRange: {
      start: Date;
      end: Date;
    };
  };
  events: AuditEvent[];
  trends: {
    dailyActivity: Array<{
      date: string;
      count: number;
      riskEvents: number;
    }>;
    topUsers: Array<{
      userId: string;
      eventCount: number;
      riskEvents: number;
    }>;
    topResources: Array<{
      resourceType: string;
      resourceId: string;
      eventCount: number;
    }>;
  };
}

export interface SecurityMetrics {
  totalSecurityEvents: number;
  criticalEvents: number;
  highRiskEvents: number;
  failedLogins: number;
  permissionDenials: number;
  approvalRequests: number;
  approvalDenials: number;
  securityViolations: number;
  averageRiskScore: number;
  complianceScore: number;
}

export class AuditService {
  private retentionDays: number = 365; // Default retention period
  private batchSize: number = 1000;
  private compressionThreshold: number = 90; // Days after which to compress logs

  constructor(private databaseService: DatabaseService) {
    this.setupAuditTables();
  }

  /**
   * Log an audit event
   */
  public async logEvent(request: AuditLogRequest): Promise<AuditEvent> {
    try {
      const auditEvent: Omit<AuditEvent, 'id'> = {
        eventType: request.eventType,
        userId: request.userId,
        agentId: request.agentId,
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        details: request.details,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        riskLevel: request.riskLevel || this.calculateRiskLevel(request),
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save to database
      const savedEvent = await this.saveAuditEvent(auditEvent);

      // Log to application logger for immediate visibility
      logger.info('Audit event logged', {
        eventId: savedEvent.id,
        eventType: auditEvent.eventType,
        userId: auditEvent.userId,
        resourceType: auditEvent.resourceType,
        riskLevel: auditEvent.riskLevel
      });

      // Check for security alerts
      await this.checkSecurityAlerts(savedEvent);

      return savedEvent;

    } catch (error) {
      logger.error('Failed to log audit event', {
        eventType: request.eventType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Query audit events
   */
  public async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    try {
      const events = await this.databaseService.queryAuditEvents({
        eventTypes: query.eventTypes,
        userId: query.userId,
        agentId: query.agentId,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        startDate: query.startDate,
        endDate: query.endDate,
        riskLevel: query.riskLevel,
        limit: query.limit,
        offset: query.offset
      });

      return events.map(this.mapEntityToAuditEvent);

    } catch (error) {
      logger.error('Failed to query audit events', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Generate audit report
   */
  public async generateReport(
    startDate: Date,
    endDate: Date,
    options?: {
      includeDetails?: boolean;
      groupBy?: 'day' | 'hour';
      filterRiskLevel?: SecurityLevel;
    }
  ): Promise<AuditReport> {
    try {
      logger.info('Generating audit report', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        options
      });

      // Get all events in date range
      const events = await this.queryEvents({
        startDate,
        endDate,
        riskLevel: options?.filterRiskLevel
      });

      // Generate summary
      const summary = this.generateSummary(events, startDate, endDate);

      // Generate trends
      const trends = await this.generateTrends(events, startDate, endDate, options?.groupBy);

      const report: AuditReport = {
        summary,
        events: options?.includeDetails ? events : [],
        trends
      };

      logger.info('Audit report generated successfully', {
        totalEvents: summary.totalEvents,
        uniqueUsers: summary.uniqueUsers,
        timeRange: summary.timeRange
      });

      return report;

    } catch (error) {
      logger.error('Failed to generate audit report', {
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get security metrics
   */
  public async getSecurityMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<SecurityMetrics> {
    try {
      const events = await this.queryEvents({ startDate, endDate });

      const metrics: SecurityMetrics = {
        totalSecurityEvents: events.length,
        criticalEvents: events.filter(e => e.riskLevel === SecurityLevel.CRITICAL).length,
        highRiskEvents: events.filter(e => e.riskLevel === SecurityLevel.HIGH).length,
        failedLogins: events.filter(e => e.eventType === AuditEventType.USER_LOGIN && e.details.success === false).length,
        permissionDenials: events.filter(e => e.eventType === AuditEventType.PERMISSION_DENIED).length,
        approvalRequests: events.filter(e => e.eventType === AuditEventType.APPROVAL_REQUESTED).length,
        approvalDenials: events.filter(e => e.eventType === AuditEventType.APPROVAL_DENIED).length,
        securityViolations: events.filter(e => e.eventType === AuditEventType.SECURITY_VIOLATION).length,
        averageRiskScore: this.calculateAverageRiskScore(events),
        complianceScore: this.calculateComplianceScore(events)
      };

      return metrics;

    } catch (error) {
      logger.error('Failed to get security metrics', {
        startDate,
        endDate,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Export audit logs for compliance
   */
  public async exportLogs(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' | 'xml' = 'json'
  ): Promise<string> {
    try {
      const events = await this.queryEvents({ startDate, endDate });

      switch (format) {
        case 'json':
          return JSON.stringify(events, null, 2);
        case 'csv':
          return this.convertToCSV(events);
        case 'xml':
          return this.convertToXML(events);
        default:
          throw new ApiError(400, 'Unsupported export format', 'INVALID_FORMAT');
      }

    } catch (error) {
      logger.error('Failed to export audit logs', {
        startDate,
        endDate,
        format,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Archive old audit logs using TypeORM
   */
  public async archiveOldLogs(): Promise<{ archived: number; deleted: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      const compressionDate = new Date();
      compressionDate.setDate(compressionDate.getDate() - this.compressionThreshold);

      // Archive logs older than compression threshold (mark as archived)
      const archivedCount = await this.databaseService.archiveOldAuditEvents(compressionDate);

      // Delete logs older than retention period (only archived ones)
      const deletedCount = await this.databaseService.deleteOldArchivedAuditEvents(cutoffDate);

      logger.info('Audit log archival completed', {
        archived: archivedCount,
        deleted: deletedCount,
        compressionDate: compressionDate.toISOString(),
        cutoffDate: cutoffDate.toISOString()
      });

      return {
        archived: archivedCount,
        deleted: deletedCount
      };

    } catch (error) {
      logger.error('Failed to archive audit logs', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Check for security alerts based on audit events
   */
  private async checkSecurityAlerts(event: AuditEvent): Promise<void> {
    try {
      // Check for suspicious patterns
      const alerts: string[] = [];

      // Multiple failed logins
      if (event.eventType === AuditEventType.USER_LOGIN && event.details.success === false) {
        const recentFailures = await this.countRecentEvents(
          AuditEventType.USER_LOGIN,
          event.userId,
          5, // 5 minutes
          { success: false }
        );

        if (recentFailures >= 5) {
          alerts.push('Multiple failed login attempts detected');
        }
      }

      // High-risk operations
      if (event.riskLevel === SecurityLevel.CRITICAL) {
        alerts.push('Critical risk operation detected');
      }

      // Permission denials
      if (event.eventType === AuditEventType.PERMISSION_DENIED) {
        const recentDenials = await this.countRecentEvents(
          AuditEventType.PERMISSION_DENIED,
          event.userId,
          10 // 10 minutes
        );

        if (recentDenials >= 3) {
          alerts.push('Multiple permission denials detected');
        }
      }

      // Send alerts if any detected
      if (alerts.length > 0) {
        await this.sendSecurityAlert(event, alerts);
      }

    } catch (error) {
      logger.error('Failed to check security alerts', {
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Count recent events for pattern detection
   */
  private async countRecentEvents(
    eventType: AuditEventType,
    userId?: string,
    minutesBack: number = 5,
    detailsFilter?: Record<string, any>
  ): Promise<number> {
    return await this.databaseService.countRecentAuditEvents(
      eventType,
      userId,
      minutesBack,
      detailsFilter
    );
  }

  /**
   * Send security alert
   */
  private async sendSecurityAlert(event: AuditEvent, alerts: string[]): Promise<void> {
    logger.warn('Security alert triggered', {
      eventId: event.id,
      eventType: event.eventType,
      userId: event.userId,
      alerts,
      riskLevel: event.riskLevel
    });

    // Here you would integrate with alerting systems like:
    // - Email notifications to security team
    // - Slack/Teams notifications
    // - SIEM system integration
    // - Incident management system
  }

  /**
   * Calculate risk level for an event
   */
  private calculateRiskLevel(request: AuditLogRequest): SecurityLevel {
    // High-risk event types
    const highRiskEvents = [
      AuditEventType.SECURITY_VIOLATION,
      AuditEventType.PERMISSION_DENIED,
      AuditEventType.APPROVAL_DENIED
    ];

    // Medium-risk event types
    const mediumRiskEvents = [
      AuditEventType.APPROVAL_REQUESTED,
      AuditEventType.CONFIGURATION_CHANGE,
      AuditEventType.DATA_ACCESS
    ];

    if (highRiskEvents.includes(request.eventType)) {
      return SecurityLevel.HIGH;
    } else if (mediumRiskEvents.includes(request.eventType)) {
      return SecurityLevel.MEDIUM;
    } else {
      return SecurityLevel.LOW;
    }
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(events: AuditEvent[], startDate: Date, endDate: Date) {
    const eventsByType: Record<string, number> = {};
    const eventsByRiskLevel: Record<string, number> = {};
    const uniqueUsers = new Set<string>();

    events.forEach(event => {
      // Count by type
      eventsByType[event.eventType] = (eventsByType[event.eventType]) + 1;

      // Count by risk level
      if (event.riskLevel) {
        eventsByRiskLevel[event.riskLevel] = (eventsByRiskLevel[event.riskLevel]) + 1;
      }

      // Track unique users
      if (event.userId) {
        uniqueUsers.add(event.userId);
      }
    });

    return {
      totalEvents: events.length,
      eventsByType,
      eventsByRiskLevel,
      uniqueUsers: uniqueUsers.size,
      timeRange: {
        start: startDate,
        end: endDate
      }
    };
  }

  /**
   * Generate trend analysis
   */
  private async generateTrends(
    events: AuditEvent[],
    startDate: Date,
    endDate: Date,
    groupBy: 'day' | 'hour' = 'day'
  ) {
    // Daily activity
    const dailyActivity = this.groupEventsByTime(events, groupBy);

    // Top users by activity
    const userActivity: Record<string, { total: number; risk: number }> = {};
    events.forEach(event => {
      if (event.userId) {
        if (!userActivity[event.userId]) {
          userActivity[event.userId] = { total: 0, risk: 0 };
        }
        userActivity[event.userId].total++;
        if (event.riskLevel === SecurityLevel.HIGH || event.riskLevel === SecurityLevel.CRITICAL) {
          userActivity[event.userId].risk++;
        }
      }
    });

    const topUsers = Object.entries(userActivity)
      .map(([userId, activity]) => ({
        userId,
        eventCount: activity.total,
        riskEvents: activity.risk
      }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    // Top resources by activity
    const resourceActivity: Record<string, number> = {};
    events.forEach(event => {
      if (event.resourceType && event.resourceId) {
        const key = `${event.resourceType}:${event.resourceId}`;
        resourceActivity[key] = (resourceActivity[key]) + 1;
      }
    });

    const topResources = Object.entries(resourceActivity)
      .map(([resource, count]) => {
        const [resourceType, resourceId] = resource.split(':');
        return { resourceType, resourceId, eventCount: count };
      })
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    return {
      dailyActivity,
      topUsers,
      topResources
    };
  }

  /**
   * Group events by time period
   */
  private groupEventsByTime(events: AuditEvent[], groupBy: 'day' | 'hour') {
    const grouped: Record<string, { count: number; riskEvents: number }> = {};

    events.forEach(event => {
      const date = new Date(event.timestamp);
      let key: string;

      if (groupBy === 'day') {
        key = date.toISOString().split('T')[0];
      } else {
        key = date.toISOString().substring(0, 13) + ':00:00.000Z';
      }

      if (!grouped[key]) {
        grouped[key] = { count: 0, riskEvents: 0 };
      }

      grouped[key].count++;
      if (event.riskLevel === SecurityLevel.HIGH || event.riskLevel === SecurityLevel.CRITICAL) {
        grouped[key].riskEvents++;
      }
    });

    return Object.entries(grouped)
      .map(([date, data]) => ({
        date,
        count: data.count,
        riskEvents: data.riskEvents
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Calculate average risk score
   */
  private calculateAverageRiskScore(events: AuditEvent[]): number {
    if (events.length === 0) return 0;

    const riskScores = events.map(event => {
      switch (event.riskLevel) {
        case SecurityLevel.CRITICAL: return 4;
        case SecurityLevel.HIGH: return 3;
        case SecurityLevel.MEDIUM: return 2;
        case SecurityLevel.LOW: return 1;
        default: return 1;
      }
    });

    return riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length;
  }

  /**
   * Calculate compliance score
   */
  private calculateComplianceScore(events: AuditEvent[]): number {
    if (events.length === 0) return 100;

    const violations = events.filter(e => 
      e.eventType === AuditEventType.SECURITY_VIOLATION ||
      e.eventType === AuditEventType.PERMISSION_DENIED
    ).length;

    return Math.max(0, 100 - (violations / events.length) * 100);
  }

  /**
   * Convert events to CSV format
   */
  private convertToCSV(events: AuditEvent[]): string {
    const headers = [
      'ID', 'Event Type', 'User ID', 'Agent ID', 'Resource Type', 'Resource ID',
      'Risk Level', 'IP Address', 'User Agent', 'Timestamp', 'Details'
    ];

    const rows = events.map(event => [
      event.id,
      event.eventType,
      event.userId,
      event.agentId,
      event.resourceType || '',
      event.resourceId,
      event.riskLevel || '',
      event.ipAddress || '',
      event.userAgent || '',
      event.timestamp.toISOString(),
      JSON.stringify(event.details)
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }

  /**
   * Convert events to XML format
   */
  private convertToXML(events: AuditEvent[]): string {
    const xmlEvents = events.map(event => `
      <event>
        <id>${event.id}</id>
        <eventType>${event.eventType}</eventType>
        <userId>${event.userId}</userId>
        <agentId>${event.agentId}</agentId>
        <resourceType>${event.resourceType || ''}</resourceType>
        <resourceId>${event.resourceId}</resourceId>
        <riskLevel>${event.riskLevel || ''}</riskLevel>
        <ipAddress>${event.ipAddress || ''}</ipAddress>
        <userAgent><![CDATA[${event.userAgent || ''}]]></userAgent>
        <timestamp>${event.timestamp.toISOString()}</timestamp>
        <details><![CDATA[${JSON.stringify(event.details)}]]></details>
      </event>
    `).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
    <auditLog>
      <exportDate>${new Date().toISOString()}</exportDate>
      <events>${xmlEvents}
      </events>
    </auditLog>`;
  }

  /**
   * Save audit event to database
   */
  private async saveAuditEvent(event: Omit<AuditEvent, 'id'>): Promise<AuditEvent> {
    const savedEvent = await this.databaseService.createAuditEvent({
      id: `event_${Date.now()}`,
      eventType: event.eventType,
      userId: event.userId,
      agentId: event.agentId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      details: event.details,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      riskLevel: event.riskLevel,
      timestamp: event.timestamp
    });
    return savedEvent;
  }

  /**
   * Map entity to audit event
   */
  private mapEntityToAuditEvent(entity: any): AuditEvent {
    return {
      id: entity.id,
      eventType: entity.eventType,
      userId: entity.userId,
      agentId: entity.agentId,
      resourceType: entity.resourceType,
      resourceId: entity.resourceId,
      details: entity.details || {},
      ipAddress: entity.ipAddress,
      userAgent: entity.userAgent,
      riskLevel: entity.riskLevel as SecurityLevel,
      timestamp: entity.timestamp,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }

  /**
   * Setup audit tables
   */
  private async setupAuditTables(): Promise<void> {
    // This would be handled by migrations in a real application
    logger.info('Audit service initialized');
  }

  /**
   * Log a security event (alias for logEvent)
   */
  public async logSecurityEvent(request: AuditLogRequest): Promise<AuditEvent> {
    return this.logEvent(request);
  }

  /**
   * Export audit logs (alias for exportLogs)
   */
  public async exportAuditLogs(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' | 'xml' = 'json'
  ): Promise<string> {
    return this.exportLogs(startDate, endDate, format);
  }

  /**
   * Generate compliance report
   */
  public async generateComplianceReport(options: {
    startDate: Date;
    endDate: Date;
    includeDetails?: boolean;
    complianceFramework?: string;
  }): Promise<{
    summary: {
      totalEvents: number;
      complianceScore: number;
      criticalViolations: number;
      recommendations: string[];
    };
    violations: Array<{
      type: string;
      severity: string;
      count: number;
      description: string;
    }>;
    trends: {
      complianceScoreOverTime: Array<{
        date: string;
        score: number;
      }>;
    };
  }> {
    try {
      const events = await this.queryEvents({
        startDate: options.startDate,
        endDate: options.endDate
      });

      const complianceScore = this.calculateComplianceScore(events);
      const criticalViolations = events.filter(e => 
        e.riskLevel === 'critical' && 
        [AuditEventType.PERMISSION_DENIED, AuditEventType.SECURITY_VIOLATION, AuditEventType.UNAUTHORIZED_ACCESS].includes(e.eventType)
      ).length;

      const violations = this.analyzeViolations(events);
      const trends = this.generateComplianceTrends(events, options.startDate, options.endDate);

      return {
        summary: {
          totalEvents: events.length,
          complianceScore,
          criticalViolations,
          recommendations: this.generateComplianceRecommendations(events)
        },
        violations,
        trends
      };
    } catch (error) {
      logger.error('Failed to generate compliance report', { error });
      throw new ApiError(500, 'Failed to generate compliance report');
    }
  }

  /**
   * Clean up old logs (alias for archiveOldLogs)
   */
  public async cleanupOldLogs(options?: {
    retentionDays?: number;
    dryRun?: boolean;
  }): Promise<{ archived: number; deleted: number }> {
    return this.archiveOldLogs();
  }

  private analyzeViolations(events: AuditEvent[]) {
    const violationTypes = new Map<string, { count: number; severity: string; description: string }>();

    events.forEach(event => {
      if ([AuditEventType.PERMISSION_DENIED, AuditEventType.SECURITY_VIOLATION, AuditEventType.UNAUTHORIZED_ACCESS, AuditEventType.FAILED_LOGIN].includes(event.eventType)) {
        const key = event.eventType;
        const existing = violationTypes.get(key) || { count: 0, severity: 'medium', description: '' };
        
        existing.count++;
        
        switch (event.eventType) {
          case AuditEventType.PERMISSION_DENIED:
            existing.severity = 'medium';
            existing.description = 'User attempted to access resources without proper permissions';
            break;
          case AuditEventType.SECURITY_VIOLATION:
            existing.severity = 'high';
            existing.description = 'Security policy violation detected';
            break;
          case AuditEventType.UNAUTHORIZED_ACCESS:
            existing.severity = 'critical';
            existing.description = 'Unauthorized access attempt detected';
            break;
          case AuditEventType.FAILED_LOGIN:
            existing.severity = 'low';
            existing.description = 'Failed login attempts';
            break;
        }
        
        violationTypes.set(key, existing);
      }
    });

    return Array.from(violationTypes.entries()).map(([type, data]) => ({
      type,
      severity: data.severity,
      count: data.count,
      description: data.description
    }));
  }

  private generateComplianceTrends(events: AuditEvent[], startDate: Date, endDate: Date) {
    const dailyEvents = this.groupEventsByTime(events, 'day');
    
    return {
      complianceScoreOverTime: dailyEvents.map(({ date, count, riskEvents }) => ({
        date,
        score: count > 0 ? Math.max(0, 100 - (riskEvents / count) * 100) : 100
      }))
    };
  }

  private generateComplianceRecommendations(events: AuditEvent[]): string[] {
    const recommendations: string[] = [];
    
    const failedLogins = events.filter(e => e.eventType === AuditEventType.FAILED_LOGIN).length;
    const permissionDenials = events.filter(e => e.eventType === AuditEventType.PERMISSION_DENIED).length;
    const securityViolations = events.filter(e => e.eventType === AuditEventType.SECURITY_VIOLATION).length;

    if (failedLogins > 100) {
      recommendations.push('Consider implementing stronger password policies and account lockout mechanisms');
    }
    
    if (permissionDenials > 50) {
      recommendations.push('Review and optimize role-based access control (RBAC) policies');
    }
    
    if (securityViolations > 10) {
      recommendations.push('Investigate and address recurring security policy violations');
    }

    if (recommendations.length === 0) {
      recommendations.push('Security posture appears healthy. Continue monitoring.');
    }

    return recommendations;
  }
} 