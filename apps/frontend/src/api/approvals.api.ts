/**
 * Approval Workflow API Client
 * Handles approval workflows, decisions, and pending approvals
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/apiConfig';
import type { RiskLevel } from '@uaip/types';

export interface ApprovalWorkflow {
  id: string;
  resourceType: string;
  resourceId: string;
  action: string;
  requesterId: string;
  requesterName?: string;
  riskLevel: RiskLevel;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requiredApprovals: number;
  currentApprovals: number;
  decisions: ApprovalDecision[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface ApprovalDecision {
  id: string;
  workflowId: string;
  approverId: string;
  approverName?: string;
  decision: 'approve' | 'reject';
  reason?: string;
  timestamp: string;
}

export interface ApprovalWorkflowCreate {
  resourceType: string;
  resourceId: string;
  action: string;
  reason?: string;
  metadata?: Record<string, any>;
  expiresIn?: number; // minutes
}

export interface ApprovalDecisionRequest {
  decision: 'approve' | 'reject';
  reason?: string;
}

export interface ApprovalStats {
  totalWorkflows: number;
  pendingWorkflows: number;
  approvedWorkflows: number;
  rejectedWorkflows: number;
  expiredWorkflows: number;
  averageApprovalTime: number; // minutes
  approvalsByRiskLevel: Record<RiskLevel, number>;
  topRequesters: Array<{
    userId: string;
    userName?: string;
    requestCount: number;
  }>;
  topApprovers: Array<{
    userId: string;
    userName?: string;
    approvalCount: number;
  }>;
}

export interface ApprovalListOptions {
  page?: number;
  limit?: number;
  status?: 'pending' | 'approved' | 'rejected' | 'expired';
  requesterId?: string;
  approverId?: string;
  resourceType?: string;
  riskLevel?: RiskLevel;
  sortBy?: 'createdAt' | 'updatedAt' | 'expiresAt';
  sortOrder?: 'asc' | 'desc';
}

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
