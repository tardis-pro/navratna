import { APIClient } from './client';
import type { AuditEventType } from '@uaip/contracts/api';
import type {
  AuditEvent,
  AuditStats,
  ComplianceReport,
  AuditLogOptions,
  AuditExportOptions,
} from '@uaip/contracts/api';

export type { AuditEvent, AuditStats, ComplianceReport, AuditLogOptions, AuditExportOptions };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const auditAPI = {
  async getLogs(options?: AuditLogOptions): Promise<AuditEvent[]> {
    return APIClient.get<AuditEvent[]>('/api/v1/audit/logs', { params: options });
  },

  async getLog(id: string): Promise<AuditEvent> {
    return APIClient.get<AuditEvent>(`/api/v1/audit/logs/${id}`);
  },

  async getEventTypes(): Promise<AuditEventType[]> {
    return APIClient.get<AuditEventType[]>('/api/v1/audit/events/types');
  },

  async getStats(days: number = 30): Promise<AuditStats> {
    return APIClient.get<AuditStats>('/api/v1/audit/stats', { params: { days } });
  },

  async export(options: AuditExportOptions): Promise<Blob> {
    return APIClient.post<Blob>('/api/v1/audit/export', options, {
      responseType: 'blob',
    });
  },

  async resolveLog(id: string): Promise<{ id: string; message: string }> {
    return APIClient.request<{ id: string; message: string }>({
      url: `/api/v1/audit/logs/${id}/resolve`,
      method: 'PATCH',
    });
  },

  async search(query: string, filters?: unknown): Promise<AuditEvent[]> {
    return APIClient.get<AuditEvent[]>('/api/v1/audit/search', {
      params: { q: query, ...(isRecord(filters) ? filters : {}) },
    });
  },

  async getComplianceReports(options?: {
    page?: number;
    limit?: number;
    reportType?: string;
    status?: string;
  }): Promise<ComplianceReport[]> {
    return APIClient.get<ComplianceReport[]>('/api/v1/audit/compliance-reports', {
      params: options,
    });
  },

  async getComplianceReport(id: string): Promise<ComplianceReport> {
    return APIClient.get<ComplianceReport>(`/api/v1/audit/compliance-reports/${id}`);
  },

  async generateComplianceReport(options: {
    reportType: string;
    startDate: string;
    endDate: string;
    includeDetails?: boolean;
  }): Promise<ComplianceReport> {
    return APIClient.post<ComplianceReport>('/api/v1/audit/compliance-report', options);
  },

  async downloadComplianceReport(id: string, format: 'pdf' | 'csv' = 'pdf'): Promise<Blob> {
    return APIClient.get<Blob>(`/api/v1/audit/compliance-reports/${id}/download`, {
      params: { format },
      responseType: 'blob',
    });
  },

  async cleanup(olderThanDays: number): Promise<{ deleted: number }> {
    return APIClient.post('/api/v1/audit/cleanup', { olderThanDays });
  },

  async getUserActivity(userId: string, days: number = 30): Promise<AuditEvent[]> {
    return APIClient.get<AuditEvent[]>(`/api/v1/audit/user-activity/${userId}`, {
      params: { days },
    });
  },

  async getResourceHistory(resourceType: string, resourceId: string): Promise<AuditEvent[]> {
    return APIClient.get<AuditEvent[]>(`/api/v1/audit/resource-history/${resourceType}/${resourceId}`);
  },

  async getRetentionPolicy(): Promise<{
    retentionDays: number;
    autoCleanup: boolean;
    excludedEventTypes?: AuditEventType[];
  }> {
    return APIClient.get('/api/v1/audit/retention-policy');
  },

  async updateRetentionPolicy(policy: {
    retentionDays?: number;
    autoCleanup?: boolean;
    excludedEventTypes?: AuditEventType[];
  }): Promise<void> {
    return APIClient.put('/api/v1/audit/retention-policy', policy);
  },
};
