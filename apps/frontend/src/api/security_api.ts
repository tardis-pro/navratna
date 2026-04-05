/**
 * Security API Client
 * Handles security policies, risk assessment, and compliance
 */

import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
import type {
  SecurityPolicy,
  SecurityRule,
  RiskAssessment,
  RiskFactor,
  ApprovalRequirement,
  SecurityEvent,
  SecurityStats,
  PolicyCreate,
  PolicyUpdate,
} from '@uaip/contracts/api';

export type {
  SecurityPolicy,
  SecurityRule,
  RiskAssessment,
  RiskFactor,
  ApprovalRequirement,
  SecurityEvent,
  SecurityStats,
  PolicyCreate,
  PolicyUpdate,
};

const security = gatewayClient.api.v1.security;

export const securityAPI = {
  async assessRisk(resource: string, action: string, context?: unknown): Promise<RiskAssessment> {
    return edenWithCSRFRetry(() => security['assess-risk'].post({ resource, action, context }));
  },

  async checkApprovalRequired(
    resource: string,
    action: string,
    context?: unknown
  ): Promise<{
    required: boolean;
    requirements?: ApprovalRequirement[];
  }> {
    return edenWithCSRFRetry(() =>
      security['check-approval-required'].post({ resource, action, context })
    );
  },

  async listPolicies(options?: {
    page?: number;
    limit?: number;
    isActive?: boolean;
  }): Promise<SecurityPolicy[]> {
    const query: Record<string, unknown> | undefined = options ? { ...options } : undefined;
    return edenWithCSRFRetry(() =>
      security.policies.get({ query })
    );
  },

  async getPolicy(id: string): Promise<SecurityPolicy> {
    return edenWithCSRFRetry(() => security.policies[id].get());
  },

  async createPolicy(policy: PolicyCreate): Promise<SecurityPolicy> {
    return edenWithCSRFRetry(() => security.policies.post(policy));
  },

  async updatePolicy(id: string, updates: PolicyUpdate): Promise<SecurityPolicy> {
    return edenWithCSRFRetry(() => security.policies[id].put(updates));
  },

  async deletePolicy(id: string): Promise<void> {
    await edenWithCSRFRetry(() => security.policies[id].delete());
  },

  async activatePolicy(id: string): Promise<SecurityPolicy> {
    return edenWithCSRFRetry(() => security.policies[id].activate.post());
  },

  async deactivatePolicy(id: string): Promise<SecurityPolicy> {
    return edenWithCSRFRetry(() => security.policies[id].deactivate.post());
  },

  async getEvents(options?: {
    page?: number;
    limit?: number;
    severity?: string;
    type?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<SecurityEvent[]> {
    const query: Record<string, unknown> | undefined = options ? { ...options } : undefined;
    return edenWithCSRFRetry(() =>
      security.events.get({ query })
    );
  },

  async getEvent(id: string): Promise<SecurityEvent> {
    return edenWithCSRFRetry(() => security.events[id].get());
  },

  async getStats(days: number = 30): Promise<SecurityStats> {
    return edenWithCSRFRetry(() => security.stats.get({ query: { days } }));
  },

  async checkCompliance(
    resource: string,
    action: string
  ): Promise<{
    compliant: boolean;
    violations?: string[];
    recommendations?: string[];
  }> {
    return edenWithCSRFRetry(() => security['check-compliance'].post({ resource, action }));
  },

  async exportSecurityReport(format: 'pdf' | 'csv' | 'json' = 'pdf'): Promise<Blob> {
    return edenRequest<Blob>(`/api/v1/security/report?format=${encodeURIComponent(format)}`, {
      method: 'GET',
      responseType: 'blob',
    });
  },
};
