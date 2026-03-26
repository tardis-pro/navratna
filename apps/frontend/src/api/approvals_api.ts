/**
 * Approval Workflow API Client
 * Handles approval workflows, decisions, and pending approvals
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/api_config';
import type { RiskLevel } from '@uaip/contracts/api';
import type {
  ApprovalWorkflow,
  ApprovalDecision,
  ApprovalWorkflowCreate,
  ApprovalDecisionRequest,
  ApprovalStats,
  ApprovalListOptions,
} from '@uaip/contracts/api';

export type {
  ApprovalWorkflow,
  ApprovalDecision,
  ApprovalWorkflowCreate,
  ApprovalDecisionRequest,
  ApprovalStats,
  ApprovalListOptions,
};

export const approvalsAPI = {
  async create(workflow: ApprovalWorkflowCreate): Promise<ApprovalWorkflow> {
    return APIClient.post<ApprovalWorkflow>(API_ROUTES.APPROVALS.CREATE, workflow);
  },

  async submitDecision(
    workflowId: string,
    decision: ApprovalDecisionRequest
  ): Promise<ApprovalDecision> {
    return APIClient.post<ApprovalDecision>(
      `${API_ROUTES.APPROVALS.SUBMIT_DECISION}/${workflowId}/decisions`,
      decision
    );
  },

  async getPending(options?: ApprovalListOptions): Promise<ApprovalWorkflow[]> {
    return APIClient.get<ApprovalWorkflow[]>(API_ROUTES.APPROVALS.PENDING, {
      params: { ...options, status: 'pending' },
    });
  },

  async getMyPending(): Promise<ApprovalWorkflow[]> {
    return APIClient.get<ApprovalWorkflow[]>(API_ROUTES.APPROVALS.MY_PENDING);
  },

  async getMyRequests(options?: ApprovalListOptions): Promise<ApprovalWorkflow[]> {
    return APIClient.get<ApprovalWorkflow[]>(API_ROUTES.APPROVALS.MY_REQUESTS, { params: options });
  },

  async list(options?: ApprovalListOptions): Promise<ApprovalWorkflow[]> {
    return APIClient.get<ApprovalWorkflow[]>(API_ROUTES.APPROVALS.LIST, { params: options });
  },

  async get(id: string): Promise<ApprovalWorkflow> {
    return APIClient.get<ApprovalWorkflow>(`${API_ROUTES.APPROVALS.GET}/${id}`);
  },

  async cancel(id: string, reason?: string): Promise<void> {
    return APIClient.post(`${API_ROUTES.APPROVALS.CANCEL}/${id}/cancel`, { reason });
  },

  async getStats(days: number = 30): Promise<ApprovalStats> {
    return APIClient.get<ApprovalStats>(API_ROUTES.APPROVALS.STATS, { params: { days } });
  },

  async getHistory(options?: {
    page?: number;
    limit?: number;
    userId?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ApprovalWorkflow[]> {
    return APIClient.get<ApprovalWorkflow[]>(API_ROUTES.APPROVALS.HISTORY, { params: options });
  },

  async bulkApprove(
    workflowIds: string[],
    reason?: string
  ): Promise<{
    success: number;
    failed: number;
    errors?: string[];
  }> {
    return APIClient.post(API_ROUTES.APPROVALS.BULK_APPROVE, { workflowIds, reason });
  },

  async bulkReject(
    workflowIds: string[],
    reason?: string
  ): Promise<{
    success: number;
    failed: number;
    errors?: string[];
  }> {
    return APIClient.post(API_ROUTES.APPROVALS.BULK_REJECT, { workflowIds, reason });
  },

  async getDecisions(workflowId: string): Promise<ApprovalDecision[]> {
    return APIClient.get<ApprovalDecision[]>(`${API_ROUTES.APPROVALS.GET}/${workflowId}/decisions`);
  },

  async export(
    format: 'csv' | 'json' | 'pdf' = 'csv',
    filters?: ApprovalListOptions
  ): Promise<Blob> {
    const response = await APIClient.get(API_ROUTES.APPROVALS.EXPORT, {
      params: { format, ...filters },
      responseType: 'blob',
    });
    return response;
  },
};
