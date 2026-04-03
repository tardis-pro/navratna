import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
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

const audit = gatewayClient.api.v1.audit;

export const auditAPI = {
  async getLogs(options?: AuditLogOptions): Promise<AuditEvent[]> {
    return edenWithCSRFRetry(() =>
      audit.logs.get({ query: options as Record<string, unknown> | undefined })
    );
  },

  async getLog(id: string): Promise<AuditEvent> {
    return edenWithCSRFRetry(() => audit.logs[id].get());
  },

  async getEventTypes(): Promise<AuditEventType[]> {
    return edenWithCSRFRetry(() => audit.events.types.get());
  },

  async getStats(days: number = 30): Promise<AuditStats> {
    return edenWithCSRFRetry(() => audit.stats.get({ query: { days } }));
  },

  async export(options: AuditExportOptions): Promise<Blob> {
    return edenRequest<Blob>('/api/v1/audit/export', {
      method: 'POST',
      body: options,
      responseType: 'blob',
    });
  },

  async resolveLog(id: string): Promise<{ id: string; message: string }> {
    return edenWithCSRFRetry(() => audit.logs[id].resolve.patch());
  },

  async search(query: string, filters?: unknown): Promise<AuditEvent[]> {
    const queryParams: Record<string, unknown> = {
      q: query,
      ...(isRecord(filters) ? filters : {}),
    };
    return edenWithCSRFRetry(() => audit.search.get({ query: queryParams }));
  },

  async getComplianceReports(options?: {
    page?: number;
    limit?: number;
    reportType?: string;
    status?: string;
  }): Promise<ComplianceReport[]> {
    return edenWithCSRFRetry(() => audit['compliance-reports'].get({ query: options }));
  },

  async getComplianceReport(id: string): Promise<ComplianceReport> {
    return edenWithCSRFRetry(() => audit['compliance-reports'][id].get());
  },

  async generateComplianceReport(options: {
    reportType: string;
    startDate: string;
    endDate: string;
    includeDetails?: boolean;
  }): Promise<ComplianceReport> {
    return edenWithCSRFRetry(() => audit['compliance-report'].post(options));
  },

  async downloadComplianceReport(id: string, format: 'pdf' | 'csv' = 'pdf'): Promise<Blob> {
    return edenRequest<Blob>(
      `/api/v1/audit/compliance-reports/${id}/download?format=${format}`,
      { method: 'GET', responseType: 'blob' }
    );
  },

  async cleanup(olderThanDays: number): Promise<{ deleted: number }> {
    return edenWithCSRFRetry(() => audit.cleanup.post({ olderThanDays }));
  },

  async getUserActivity(userId: string, days: number = 30): Promise<AuditEvent[]> {
    return edenWithCSRFRetry(() => audit['user-activity'][userId].get({ query: { days } }));
  },

  async getResourceHistory(resourceType: string, resourceId: string): Promise<AuditEvent[]> {
    return edenWithCSRFRetry(() => audit['resource-history'][resourceType][resourceId].get());
  },

  async getRetentionPolicy(): Promise<{
    retentionDays: number;
    autoCleanup: boolean;
    excludedEventTypes?: AuditEventType[];
  }> {
    return edenWithCSRFRetry(() => audit['retention-policy'].get());
  },

  async updateRetentionPolicy(policy: {
    retentionDays?: number;
    autoCleanup?: boolean;
    excludedEventTypes?: AuditEventType[];
  }): Promise<void> {
    await edenWithCSRFRetry(() => audit['retention-policy'].put(policy));
  },
};
