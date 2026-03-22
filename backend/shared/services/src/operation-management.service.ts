import { typeormService } from './typeormService';
import { createLogger } from '@uaip/utils';

/**
 * Operation Management Service
 * Provides high-level operations for operation and workflow management
 */
export class OperationManagementService {
  private logger = createLogger({
    serviceName: 'operation-management-service',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  });

  // Operation Operations
  async createOperation(operationData: unknown): Promise<unknown> {
    try {
      return await typeormService.create('Operation', operationData);
    } catch (error) {
      this.logger.error('Failed to create operation', { error: error.message, operationData });
      throw error;
    }
  }

  async getOperation(operationId: string): Promise<unknown> {
    try {
      return await typeormService.findById('Operation', operationId);
    } catch (error) {
      this.logger.error('Failed to get operation', { error: error.message, operationId });
      throw error;
    }
  }

  async updateOperation(operationId: string, updates: unknown): Promise<unknown> {
    try {
      return await typeormService.update('Operation', operationId, updates);
    } catch (error) {
      this.logger.error('Failed to update operation', {
        error: error.message,
        operationId,
        updates,
      });
      throw error;
    }
  }

  // Operation State Operations
  async createOperationState(stateData: unknown): Promise<unknown> {
    try {
      return await typeormService.create('OperationState', stateData);
    } catch (error) {
      this.logger.error('Failed to create operation state', { error: error.message, stateData });
      throw error;
    }
  }

  async updateOperationState(operationId: string, stateData: unknown): Promise<unknown> {
    try {
      return await typeormService.update('OperationState', operationId, stateData);
    } catch (error) {
      this.logger.error('Failed to update operation state', {
        error: error.message,
        operationId,
        stateData,
      });
      throw error;
    }
  }

  // Operation Checkpoint Operations
  async createCheckpoint(checkpointData: unknown): Promise<unknown> {
    try {
      return await typeormService.create('OperationCheckpoint', checkpointData);
    } catch (error) {
      this.logger.error('Failed to create checkpoint', { error: error.message, checkpointData });
      throw error;
    }
  }

  async getCheckpoints(operationId: string): Promise<unknown[]> {
    try {
      const { OperationCheckpoint } = await import('./entities/index');
      const repository = typeormService.getRepository(OperationCheckpoint);
      return await repository.find({
        where: { operationId },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error('Failed to get checkpoints', { error: error.message, operationId });
      throw error;
    }
  }

  // Step Result Operations
  async createStepResult(stepResultData: unknown): Promise<unknown> {
    try {
      return await typeormService.create('StepResult', stepResultData);
    } catch (error) {
      this.logger.error('Failed to create step result', { error: error.message, stepResultData });
      throw error;
    }
  }

  async getStepResults(operationId: string): Promise<unknown[]> {
    try {
      const { StepResult } = await import('./entities/index');
      const repository = typeormService.getRepository(StepResult);
      return await repository.find({
        where: { operationId },
        order: { createdAt: 'ASC' },
      });
    } catch (error) {
      this.logger.error('Failed to get step results', { error: error.message, operationId });
      throw error;
    }
  }

  // Workflow Instance Operations
  async createWorkflowInstance(workflowData: unknown): Promise<unknown> {
    try {
      return await typeormService.create('WorkflowInstance', workflowData);
    } catch (error) {
      this.logger.error('Failed to create workflow instance', {
        error: error.message,
        workflowData,
      });
      throw error;
    }
  }

  async getWorkflowInstance(workflowId: string): Promise<unknown> {
    try {
      return await typeormService.findById('WorkflowInstance', workflowId);
    } catch (error) {
      this.logger.error('Failed to get workflow instance', { error: error.message, workflowId });
      throw error;
    }
  }

  async updateWorkflowInstance(workflowId: string, updates: unknown): Promise<unknown> {
    try {
      return await typeormService.update('WorkflowInstance', workflowId, updates);
    } catch (error) {
      this.logger.error('Failed to update workflow instance', {
        error: error.message,
        workflowId,
        updates,
      });
      throw error;
    }
  }

  // Query Operations
  async getOperationsByStatus(status: string): Promise<unknown[]> {
    try {
      const { Operation } = await import('./entities/index');
      const repository = typeormService.getRepository(Operation);
      return await repository.find({
        where: { status: status as unknown },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error('Failed to get operations by status', { error: error.message, status });
      throw error;
    }
  }

  async getActiveOperations(): Promise<unknown[]> {
    try {
      const { Operation } = await import('./entities/index');
      const { In } = await import('typeorm');
      const repository = typeormService.getRepository(Operation);
      return await repository.find({
        where: {
          status: In(['running', 'pending', 'paused']) as unknown,
        },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error('Failed to get active operations', { error: error.message });
      throw error;
    }
  }

  async findStaleOperations(cutoffDate: Date): Promise<unknown[]> {
    try {
      const { Operation } = await import('./entities/index');
      const { In, LessThan } = await import('typeorm');
      const repository = typeormService.getRepository(Operation);
      return await repository.find({
        where: {
          status: In(['running', 'pending', 'paused']) as unknown,
          updatedAt: LessThan(cutoffDate),
        },
        order: { updatedAt: 'ASC' },
      });
    } catch (error) {
      this.logger.error('Failed to find stale operations', { error: error.message, cutoffDate });
      throw error;
    }
  }

  // Transaction support
  async executeInTransaction<T>(callback: (manager: unknown) => Promise<T>): Promise<T> {
    try {
      return await typeormService.transaction(callback);
    } catch (error) {
      this.logger.error('Transaction failed', { error: error.message });
      throw error;
    }
  }

  // Health check
  async isHealthy(): Promise<boolean> {
    try {
      const health = await typeormService.healthCheck();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  }
}
