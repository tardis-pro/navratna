/**
 * Approval Workflow API Client
 * Handles approval workflows, decisions, and pending approvals
 */

import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
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

const approvals = gatewayClient.api.v1.approvals;

export const approvalsAPI = {
  async create(workflow: ApprovalWorkflowCreate): Promise<ApprovalWorkflow> {
    return edenWithCSRFRetry(() => approvals.post(workflow));
  },

  async submitDecision(
    workflowId: string,
    decision: ApprovalDecisionRequest
  ): Promise<ApprovalDecision> {
    return edenWithCSRFRetry(() => approvals[workflowId].decisions.post(decision));
  },

  async getPending(options?: ApprovalListOptions): Promise<ApprovalWorkflow[]> {
    return edenWithCSRFRetry(() =>
      approvals.pending.get({ query: { ...options, status: 'pending' } })
    );
  },

  async getMyPending(): Promise<ApprovalWorkflow[]> {
    return edenWithCSRFRetry(() => approvals['my-pending'].get());
  },

  async getMyRequests(options?: ApprovalListOptions): Promise<ApprovalWorkflow[]> {
    return edenWithCSRFRetry(() =>
      approvals['my-requests'].get({ query: options as Record<string, unknown> | undefined })
    );
  },

  async list(options?: ApprovalListOptions): Promise<ApprovalWorkflow[]> {
    return edenWithCSRFRetry(() =>
      approvals.get({ query: options as Record<string, unknown> | undefined })
    );
  },

  async get(id: string): Promise<ApprovalWorkflow> {
    return edenWithCSRFRetry(() => approvals[id].get());
  },

  async cancel(id: string, reason?: string): Promise<void> {
    await edenWithCSRFRetry(() => approvals[id].cancel.post({ reason }));
  },

  async getStats(days: number = 30): Promise<ApprovalStats> {
    return edenWithCSRFRetry(() => approvals.stats.get({ query: { days } }));
  },

  async getHistory(options?: {
    page?: number;
    limit?: number;
    userId?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<ApprovalWorkflow[]> {
    return edenWithCSRFRetry(() =>
      approvals.history.get({ query: options as Record<string, unknown> | undefined })
    );
  },

  async bulkApprove(
    workflowIds: string[],
    reason?: string
  ): Promise<{
    success: number;
    failed: number;
    errors?: string[];
  }> {
    return edenWithCSRFRetry(() => approvals['bulk-approve'].post({ workflowIds, reason }));
  },

  async bulkReject(
    workflowIds: string[],
    reason?: string
  ): Promise<{
    success: number;
    failed: number;
    errors?: string[];
  }> {
    return edenWithCSRFRetry(() => approvals['bulk-reject'].post({ workflowIds, reason }));
  },

  async getDecisions(workflowId: string): Promise<ApprovalDecision[]> {
    return edenWithCSRFRetry(() => approvals[workflowId].decisions.get());
  },

  async export(
    format: 'csv' | 'json' | 'pdf' = 'csv',
    filters?: ApprovalListOptions
  ): Promise<Blob> {
    const params = new URLSearchParams({ format });
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined) params.append(k, String(v));
      });
    }
    return edenRequest<Blob>(`/api/v1/approvals/export?${params.toString()}`, {
      method: 'GET',
      responseType: 'blob',
    });
  },
};
