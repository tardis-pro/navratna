import { BaseRepository } from '../base/base_repository';
import { logger } from '@uaip/utils';
import { getControlDb } from '../drizzle/clients/index';

export class OperationRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'operations';
  }
  get plane(): 'control' {
    return 'control';
  }

  async createOperation(data: {
    id: string;
    type: string;
    agentId: string;
    executionPlan?: Record<string, unknown>;
    context?: Record<string, unknown>;
    createdAt: Date;
  }): Promise<Record<string, unknown>> {
    return this.create({
      id: data.id,
      type: data.type,
      agent_id: data.agentId,
      execution_plan: data.executionPlan ? JSON.stringify(data.executionPlan) : null,
      context: data.context ? JSON.stringify(data.context) : null,
      status: 'pending',
      created_at: data.createdAt,
      updated_at: data.createdAt,
    });
  }

  async getOperationById(id: string): Promise<Record<string, unknown> | null> {
    return this.findById(id);
  }

  async findByAgentId(agentId: string): Promise<Record<string, unknown>[]> {
    return this.findMany({ agent_id: agentId });
  }

  async findByStatus(status: string): Promise<Record<string, unknown>[]> {
    return this.findMany({ status });
  }
}

export class OperationStateRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'operation_states';
  }
  get plane(): 'control' {
    return 'control';
  }
  async saveOperationState(operationId: string, state: Record<string, unknown>): Promise<void> {
    await this.create({ operation_id: operationId, state });
  }
  async getOperationState(operationId: string): Promise<Record<string, unknown> | null> {
    const r = await this.findMany({ operation_id: operationId }, { limit: 1 });
    return r[0] ?? null;
  }
  async updateOperationState(
    operationId: string,
    state: Record<string, unknown>,
    updates: Record<string, unknown>
  ): Promise<void> {
    await this.update(operationId, { ...state, ...updates });
  }
  async deleteOldOperationStates(cutoffDate: Date): Promise<number> {
    return 0;
  }
  async getStateStatistics(): Promise<{
    totalOperations: number;
    activeOperations: number;
    totalCheckpoints: number;
    averageStateSize: number;
  }> {
    return { totalOperations: 0, activeOperations: 0, totalCheckpoints: 0, averageStateSize: 0 };
  }
}
export class OperationCheckpointRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'operation_checkpoints';
  }
  get plane(): 'control' {
    return 'control';
  }
  async saveCheckpoint(operationId: string, checkpoint: Record<string, unknown>): Promise<void> {
    await this.create({ operation_id: operationId, ...checkpoint });
  }
  async getCheckpoint(
    operationId: string,
    checkpointId: string
  ): Promise<Record<string, unknown> | null> {
    return this.findById(checkpointId);
  }
  async listCheckpoints(operationId: string): Promise<Record<string, unknown>[]> {
    return this.findMany({ operation_id: operationId });
  }
}
export class StepResultRepository extends BaseRepository<Record<string, unknown>> {
  get tableName() {
    return 'step_results';
  }
  get plane(): 'control' {
    return 'control';
  }
}
