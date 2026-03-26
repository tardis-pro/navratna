import { BaseRepository } from '../base/base_repository';
import { logger } from '@uaip/utils';

export class SecurityPolicyRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'security_policies';
  }
  get plane(): 'control' {
    return 'control';
  }

  async findEnabled(): Promise<Record<string, unknown>[]> {
    return this.findMany({ is_enabled: true });
  }

  async findByType(policyType: string): Promise<Record<string, unknown>[]> {
    return this.findMany({ policy_type: policyType });
  }
}

export class ApprovalWorkflowRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'approval_workflows';
  }
  get plane(): 'control' {
    return 'control';
  }

  async findByOperationId(operationId: string): Promise<Record<string, unknown> | null> {
    const rows = await this.findMany({ operation_id: operationId });
    return rows[0] ?? null;
  }

  async findPending(): Promise<Record<string, unknown>[]> {
    return this.findMany({ status: 'pending' });
  }

  async create(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return super.create(data);
  }

  async saveOperationState(operationId: string, state: Record<string, unknown>): Promise<void> {
    await this.update(operationId, { state });
  }

  async getOperationState(operationId: string): Promise<Record<string, unknown> | null> {
    return this.findById(operationId);
  }

  async updateOperationState(
    operationId: string,
    state: Record<string, unknown>,
    updates: Record<string, unknown>
  ): Promise<void> {
    await this.update(operationId, { ...state, ...updates });
  }
}

export class ApprovalDecisionRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'approval_decisions';
  }
  get plane(): 'control' {
    return 'control';
  }

  async findByWorkflowId(workflowId: string): Promise<Record<string, unknown>[]> {
    return this.findMany({ workflow_id: workflowId });
  }
}
