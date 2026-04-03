/**
 * Orchestration Pipeline API Client
 * Handles workflow execution, operation management, and pipeline control
 */

import { gatewayClient, edenWithCSRFRetry, edenRequest } from './eden';
import type {
  Operation,
  OperationStatus,
  OperationType,
  ExecuteOperationRequest,
  OperationStatusResponse,
} from '@uaip/contracts/api';
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTrigger,
  WorkflowExecution,
  WorkflowStepExecution,
  OperationListOptions,
} from '@uaip/contracts/api';

export type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTrigger,
  WorkflowExecution,
  WorkflowStepExecution,
  OperationListOptions,
};

type OrchestrationStats = {
  totalOperations: number;
  completedOperations: number;
  failedOperations: number;
  averageExecutionTime: number;
  operationsByType: Record<OperationType, number>;
  operationsByStatus: Record<OperationStatus, number>;
};

const operations = gatewayClient.api.v1.operations;
const workflows = gatewayClient.api.v1.workflows;

export const orchestrationAPI = {
  async executeOperation(
    request: ExecuteOperationRequest
  ): Promise<{ workflowInstanceId: string }> {
    return edenWithCSRFRetry(() => operations.post(request));
  },

  async getOperationStatus(operationId: string): Promise<OperationStatusResponse> {
    return edenRequest<OperationStatusResponse>(
      `/api/v1/operations/${operationId}/status`,
      { method: 'GET' }
    );
  },

  async pauseOperation(operationId: string, reason?: string): Promise<void> {
    await edenRequest(`/api/v1/operations/${operationId}/pause`, {
      method: 'POST',
      body: { reason },
    });
  },

  async resumeOperation(operationId: string, checkpointId?: string): Promise<void> {
    await edenRequest(`/api/v1/operations/${operationId}/resume`, {
      method: 'POST',
      body: { checkpointId },
    });
  },

  async cancelOperation(operationId: string, reason?: string): Promise<void> {
    await edenRequest(`/api/v1/operations/${operationId}/cancel`, {
      method: 'POST',
      body: { reason },
    });
  },

  async listOperations(options?: OperationListOptions): Promise<Operation[]> {
    return edenWithCSRFRetry(() => operations.get({ query: options as unknown as Record<string, unknown> }));
  },

  async getOperation(operationId: string): Promise<Operation> {
    return edenWithCSRFRetry(() => operations[operationId].get());
  },

  async getOperationHistory(operationId: string): Promise<unknown[]> {
    return edenRequest<unknown[]>(`/api/v1/operations/${operationId}/history`, { method: 'GET' });
  },

  async getOperationLogs(operationId: string): Promise<unknown[]> {
    return edenRequest<unknown[]>(`/api/v1/operations/${operationId}/logs`, { method: 'GET' });
  },

  async listWorkflows(options?: {
    page?: number;
    limit?: number;
    isActive?: boolean;
  }): Promise<WorkflowDefinition[]> {
    return edenWithCSRFRetry(() => workflows.get({ query: options as unknown as Record<string, unknown> }));
  },

  async getWorkflow(workflowId: string): Promise<WorkflowDefinition> {
    return edenWithCSRFRetry(() => workflows[workflowId].get());
  },

  async createWorkflow(
    workflow: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WorkflowDefinition> {
    return edenWithCSRFRetry(() => workflows.post(workflow));
  },

  async updateWorkflow(
    workflowId: string,
    updates: Partial<WorkflowDefinition>
  ): Promise<WorkflowDefinition> {
    return edenWithCSRFRetry(() => workflows[workflowId].put(updates));
  },

  async deleteWorkflow(workflowId: string): Promise<void> {
    await edenWithCSRFRetry(() => workflows[workflowId].delete());
  },

  async executeWorkflow(
    workflowId: string,
    input?: Record<string, unknown>
  ): Promise<WorkflowExecution> {
    return edenRequest<WorkflowExecution>(`/api/v1/workflows/${workflowId}/execute`, {
      method: 'POST',
      body: { input },
    });
  },

  async getWorkflowExecutions(
    workflowId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: OperationStatus;
    }
  ): Promise<WorkflowExecution[]> {
    const parts: string[] = [];
    if (options?.page !== undefined) parts.push(`page=${options.page}`);
    if (options?.limit !== undefined) parts.push(`limit=${options.limit}`);
    if (options?.status !== undefined) parts.push(`status=${options.status}`);
    const qs = parts.length ? `?${parts.join('&')}` : '';
    return edenRequest<WorkflowExecution[]>(
      `/api/v1/workflows/${workflowId}/executions${qs}`,
      { method: 'GET' }
    );
  },

  async getWorkflowExecution(workflowId: string, executionId: string): Promise<WorkflowExecution> {
    return edenRequest<WorkflowExecution>(
      `/api/v1/workflows/${workflowId}/executions/${executionId}`,
      { method: 'GET' }
    );
  },

  async getStats(days: number = 30): Promise<OrchestrationStats> {
    return edenRequest<OrchestrationStats>(
      `/api/v1/operations/stats?days=${encodeURIComponent(days)}`,
      { method: 'GET' }
    );
  },
};
