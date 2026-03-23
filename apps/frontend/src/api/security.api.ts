/**
 * Security API Client
 * Handles security policies, risk assessment, and compliance
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import type { RiskLevel } from '@uaip/types';
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
} from '@uaip/types';

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

export const securityAPI = {
  async assessRisk(resource: string, action: string, context?: unknown): Promise<RiskAssessment> {
    return APIClient.post<RiskAssessment>(API_ROUTES.SECURITY.ASSESS_RISK, {
      resource,
      action,
      context,
    });
  },

  async checkApprovalRequired(
    resource: string,
    action: string,
    context?: unknown
  ): Promise<{
    required: boolean;
    requirements?: ApprovalRequirement[];
  }> {
    return APIClient.post(API_ROUTES.SECURITY.CHECK_APPROVAL, {
      resource,
      action,
      context,
    });
  },

  // Policy management
  async listPolicies(options?: {
    page?: number;
    limit?: number;
    isActive?: boolean;
  }): Promise<SecurityPolicy[]> {
    return APIClient.get<SecurityPolicy[]>(API_ROUTES.SECURITY.LIST_POLICIES, { params: options });
  },

  async getPolicy(id: string): Promise<SecurityPolicy> {
    return APIClient.get<SecurityPolicy>(`${API_ROUTES.SECURITY.GET_POLICY}/${id}`);
  },

  async createPolicy(policy: PolicyCreate): Promise<SecurityPolicy> {
    return APIClient.post<SecurityPolicy>(API_ROUTES.SECURITY.CREATE_POLICY, policy);
  },

  async updatePolicy(id: string, updates: PolicyUpdate): Promise<SecurityPolicy> {
    return APIClient.put<SecurityPolicy>(`${API_ROUTES.SECURITY.UPDATE_POLICY}/${id}`, updates);
  },

  async deletePolicy(id: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.SECURITY.DELETE_POLICY}/${id}`);
  },

  async activatePolicy(id: string): Promise<SecurityPolicy> {
    return APIClient.post<SecurityPolicy>(`${API_ROUTES.SECURITY.ACTIVATE_POLICY}/${id}/activate`);
  },

  async deactivatePolicy(id: string): Promise<SecurityPolicy> {
    return APIClient.post<SecurityPolicy>(
      `${API_ROUTES.SECURITY.DEACTIVATE_POLICY}/${id}/deactivate`
    );
  },

  // Security events
  async getEvents(options?: {
    page?: number;
    limit?: number;
    severity?: string;
    type?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<SecurityEvent[]> {
    return APIClient.get<SecurityEvent[]>(API_ROUTES.SECURITY.EVENTS, { params: options });
  },

  async getEvent(id: string): Promise<SecurityEvent> {
    return APIClient.get<SecurityEvent>(`${API_ROUTES.SECURITY.EVENTS}/${id}`);
  },

  // Statistics
  async getStats(days: number = 30): Promise<SecurityStats> {
    return APIClient.get<SecurityStats>(API_ROUTES.SECURITY.STATS, { params: { days } });
  },

  // Compliance
  async checkCompliance(
    resource: string,
    action: string
  ): Promise<{
    compliant: boolean;
    violations?: string[];
    recommendations?: string[];
  }> {
    return APIClient.post(API_ROUTES.SECURITY.CHECK_COMPLIANCE, { resource, action });
  },

  async exportSecurityReport(format: 'pdf' | 'csv' | 'json' = 'pdf'): Promise<Blob> {
    const response = await APIClient.get(`${API_ROUTES.SECURITY.EXPORT}/report`, {
      params: { format },
      responseType: 'blob',
    });
    return response;
  },
};
