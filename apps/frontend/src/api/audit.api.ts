/**
 * Audit and Compliance API Client
 * Handles audit logs, compliance reports, and event tracking
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import type { AuditEventType } from '@uaip/types';

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  userId?: string;
  userName?: string;
  userEmail?: string;
  resourceType: string;
  resourceId: string;
  action: string;
  result: 'success' | 'failure';
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

export interface AuditStats {
  totalEvents: number;
  eventsByType: Record<AuditEventType, number>;
  eventsByResult: {
    success: number;
    failure: number;
  };
  eventsByResource: Record<string, number>;
  topUsers: Array<{
    userId: string;
    userName?: string;
    eventCount: number;
  }>;
  recentActivity: Array<{
    date: string;
    count: number;
  }>;
}

export interface ComplianceReport {
  id: string;
  reportType: string;
  period: {
    start: string;
    end: string;
  };
  status: 'generated' | 'generating' | 'failed';
  summary: {
    totalEvents: number;
    complianceScore: number;
    violations: number;
    warnings: number;
  };
  details?: any;
  generatedAt: string;
  generatedBy?: string;
}

export interface AuditLogOptions {
  page?: number;
  limit?: number;
  eventType?: AuditEventType;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  result?: 'success' | 'failure';
  startDate?: string;
  endDate?: string;
  sortBy?: 'timestamp' | 'eventType' | 'userId';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditExportOptions {
  format: 'csv' | 'json' | 'pdf';
  eventType?: AuditEventType;
  userId?: string;
  startDate?: string;
  endDate?: string;
  includeMetadata?: boolean;
}

export const auditAPI = {
  async getLogs(options?: AuditLogOptions): Promise<AuditEvent[]> {
    return APIClient.get<AuditEvent[]>(API_ROUTES.AUDIT.LOGS, { params: options });
  },

  async getLog(id: string): Promise<AuditEvent> {
    return APIClient.get<AuditEvent>(`${API_ROUTES.AUDIT.LOGS}/${id}`);
  },

  async getEventTypes(): Promise<AuditEventType[]> {
    return APIClient.get<AuditEventType[]>(API_ROUTES.AUDIT.EVENT_TYPES);
  },

  async getStats(days: number = 30): Promise<AuditStats> {
    return APIClient.get<AuditStats>(API_ROUTES.AUDIT.STATS, { params: { days } });
  },

  async export(options: AuditExportOptions): Promise<Blob> {
    const response = await APIClient.post(API_ROUTES.AUDIT.EXPORT, options, {
      responseType: 'blob'
    });
    return response;
  },

  async search(query: string, filters?: any): Promise<AuditEvent[]> {
    return APIClient.get<AuditEvent[]>(API_ROUTES.AUDIT.SEARCH, {
      params: { q: query, ...filters }
    });
  },

  // Compliance
  async getComplianceReports(options?: {
    page?: number;
    limit?: number;
    reportType?: string;
    status?: string;
  }): Promise<ComplianceReport[]> {
    return APIClient.get<ComplianceReport[]>(API_ROUTES.AUDIT.COMPLIANCE_REPORTS, { params: options });
  },

  async getComplianceReport(id: string): Promise<ComplianceReport> {
    return APIClient.get<ComplianceReport>(`${API_ROUTES.AUDIT.COMPLIANCE_REPORTS}/${id}`);
  },

  async generateComplianceReport(options: {
    reportType: string;
    startDate: string;
    endDate: string;
    includeDetails?: boolean;
  }): Promise<ComplianceReport> {
    return APIClient.post<ComplianceReport>(API_ROUTES.AUDIT.GENERATE_COMPLIANCE_REPORT, options);
  },

  async downloadComplianceReport(id: string, format: 'pdf' | 'csv' = 'pdf'): Promise<Blob> {
    const response = await APIClient.get(`${API_ROUTES.AUDIT.COMPLIANCE_REPORTS}/${id}/download`, {
      params: { format },
      responseType: 'blob'
    });
    return response;
  },

  // Cleanup
  async cleanup(olderThanDays: number): Promise<{ deleted: number }> {
    return APIClient.post(API_ROUTES.AUDIT.CLEANUP, { olderThanDays });
  },

  // User activity
  async getUserActivity(userId: string, days: number = 30): Promise<AuditEvent[]> {
    return APIClient.get<AuditEvent[]>(`${API_ROUTES.AUDIT.USER_ACTIVITY}/${userId}`, {
      params: { days }
    });
  },

  // Resource history
  async getResourceHistory(resourceType: string, resourceId: string): Promise<AuditEvent[]> {
    return APIClient.get<AuditEvent[]>(`${API_ROUTES.AUDIT.RESOURCE_HISTORY}/${resourceType}/${resourceId}`);
  },

  // Retention policy
  async getRetentionPolicy(): Promise<{
    retentionDays: number;
    autoCleanup: boolean;
    excludedEventTypes?: AuditEventType[];
  }> {
    return APIClient.get(API_ROUTES.AUDIT.RETENTION_POLICY);
  },

  async updateRetentionPolicy(policy: {
    retentionDays?: number;
    autoCleanup?: boolean;
    excludedEventTypes?: AuditEventType[];
  }): Promise<void> {
    return APIClient.put(API_ROUTES.AUDIT.RETENTION_POLICY, policy);
  }
};