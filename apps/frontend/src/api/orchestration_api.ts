/**
 * Orchestration Pipeline API Client
 * Handles workflow execution, operation management, and pipeline control
 */

import { APIClient } from './client';
import { API_ROUTES } from '@/config/api_config';
import type {
  Operation,
  OperationStatus,
  OperationType,
  OperationPriority,
  ExecuteOperationRequest,
  OperationStatusResponse,
} from '@uaip/types';
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTrigger,
  WorkflowExecution,
  WorkflowStepExecution,
  OperationListOptions,
} from '@uaip/types';

export type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTrigger,
  WorkflowExecution,
  WorkflowStepExecution,
  OperationListOptions,
};

export const orchestrationAPI = {
  async executeOperation(
    request: ExecuteOperationRequest
  ): Promise<{ workflowInstanceId: string }> {
    return APIClient.post<{ workflowInstanceId: string }>(
      API_ROUTES.ORCHESTRATION.EXECUTE,
      request
    );
  },

  async getOperationStatus(operationId: string): Promise<OperationStatusResponse> {
    return APIClient.get<OperationStatusResponse>(
      `${API_ROUTES.ORCHESTRATION.STATUS}/${operationId}/status`
    );
  },

  async pauseOperation(operationId: string, reason?: string): Promise<void> {
    return APIClient.post(`${API_ROUTES.ORCHESTRATION.PAUSE}/${operationId}/pause`, { reason });
  },

  async resumeOperation(operationId: string, checkpointId?: string): Promise<void> {
    return APIClient.post(`${API_ROUTES.ORCHESTRATION.RESUME}/${operationId}/resume`, {
      checkpointId,
    });
  },

  async cancelOperation(operationId: string, reason?: string): Promise<void> {
    return APIClient.post(`${API_ROUTES.ORCHESTRATION.CANCEL}/${operationId}/cancel`, { reason });
  },

  async listOperations(options?: OperationListOptions): Promise<Operation[]> {
    return APIClient.get<Operation[]>(API_ROUTES.ORCHESTRATION.LIST, { params: options });
  },

  async getOperation(operationId: string): Promise<Operation> {
    return APIClient.get<Operation>(`${API_ROUTES.ORCHESTRATION.GET}/${operationId}`);
  },

  async getOperationHistory(operationId: string): Promise<unknown[]> {
    return APIClient.get(`${API_ROUTES.ORCHESTRATION.GET}/${operationId}/history`);
  },

  async getOperationLogs(operationId: string): Promise<unknown[]> {
    return APIClient.get(`${API_ROUTES.ORCHESTRATION.GET}/${operationId}/logs`);
  },

  // Workflow management
  async listWorkflows(options?: {
    page?: number;
    limit?: number;
    isActive?: boolean;
  }): Promise<WorkflowDefinition[]> {
    return APIClient.get<WorkflowDefinition[]>(`${API_ROUTES.ORCHESTRATION.WORKFLOWS}/workflows`, {
      params: options,
    });
  },

  async getWorkflow(workflowId: string): Promise<WorkflowDefinition> {
    return APIClient.get<WorkflowDefinition>(
      `${API_ROUTES.ORCHESTRATION.WORKFLOWS}/workflows/${workflowId}`
    );
  },

  async createWorkflow(
    workflow: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WorkflowDefinition> {
    return APIClient.post<WorkflowDefinition>(
      `${API_ROUTES.ORCHESTRATION.WORKFLOWS}/workflows`,
      workflow
    );
  },

  async updateWorkflow(
    workflowId: string,
    updates: Partial<WorkflowDefinition>
  ): Promise<WorkflowDefinition> {
    return APIClient.put<WorkflowDefinition>(
      `${API_ROUTES.ORCHESTRATION.WORKFLOWS}/workflows/${workflowId}`,
      updates
    );
  },

  async deleteWorkflow(workflowId: string): Promise<void> {
    return APIClient.delete(`${API_ROUTES.ORCHESTRATION.WORKFLOWS}/workflows/${workflowId}`);
  },

  async executeWorkflow(
    workflowId: string,
    input?: Record<string, unknown>
  ): Promise<WorkflowExecution> {
    return APIClient.post<WorkflowExecution>(
      `${API_ROUTES.ORCHESTRATION.WORKFLOWS}/workflows/${workflowId}/execute`,
      {
        input,
      }
    );
  },

  async getWorkflowExecutions(
    workflowId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: OperationStatus;
    }
  ): Promise<WorkflowExecution[]> {
    return APIClient.get<WorkflowExecution[]>(
      `${API_ROUTES.ORCHESTRATION.WORKFLOWS}/workflows/${workflowId}/executions`,
      {
        params: options,
      }
    );
  },

  async getWorkflowExecution(workflowId: string, executionId: string): Promise<WorkflowExecution> {
    return APIClient.get<WorkflowExecution>(
      `${API_ROUTES.ORCHESTRATION.WORKFLOWS}/workflows/${workflowId}/executions/${executionId}`
    );
  },

  // Statistics
  async getStats(days: number = 30): Promise<{
    totalOperations: number;
    completedOperations: number;
    failedOperations: number;
    averageExecutionTime: number;
    operationsByType: Record<OperationType, number>;
    operationsByStatus: Record<OperationStatus, number>;
  }> {
    return APIClient.get(`${API_ROUTES.ORCHESTRATION.STATS}/stats`, { params: { days } });
  },
};
