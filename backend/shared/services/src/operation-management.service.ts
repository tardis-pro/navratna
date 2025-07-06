import { typeormService } from './typeormService.js';
import { createLogger } from '@uaip/utils';

/**
 * Operation Management Service
 * Provides high-level operations for operation and workflow management
 */
export class OperationManagementService {
  private logger = createLogger({
    serviceName: 'operation-management-service',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  });

  // Operation Operations
  async createOperation(operationData: any): Promise<any> {
    try {
      return await typeormService.create('Operation', operationData);
    } catch (error) {
      this.logger.error('Failed to create operation', { error: error.message, operationData });
      throw error;
    }
  }

  async getOperation(operationId: string): Promise<any> {
    try {
      return await typeormService.findById('Operation', operationId);
    } catch (error) {
      this.logger.error('Failed to get operation', { error: error.message, operationId });
      throw error;
    }
  }

  async updateOperation(operationId: string, updates: any): Promise<any> {
    try {
      return await typeormService.update('Operation', operationId, updates);
    } catch (error) {
      this.logger.error('Failed to update operation', { error: error.message, operationId, updates });
      throw error;
    }
  }

  // Operation State Operations
  async createOperationState(stateData: any): Promise<any> {
    try {
      return await typeormService.create('OperationState', stateData);
    } catch (error) {
      this.logger.error('Failed to create operation state', { error: error.message, stateData });
      throw error;
    }
  }

  async updateOperationState(operationId: string, stateData: any): Promise<any> {
    try {
      return await typeormService.update('OperationState', operationId, stateData);
    } catch (error) {
      this.logger.error('Failed to update operation state', { error: error.message, operationId, stateData });
      throw error;
    }
  }

  // Operation Checkpoint Operations
  async createCheckpoint(checkpointData: any): Promise<any> {
    try {
      return await typeormService.create('OperationCheckpoint', checkpointData);
    } catch (error) {
      this.logger.error('Failed to create checkpoint', { error: error.message, checkpointData });
      throw error;
    }
  }

  async getCheckpoints(operationId: string): Promise<any[]> {
    try {
      const { OperationCheckpoint } = await import('./entities/index.js');
      const repository = typeormService.getRepository(OperationCheckpoint);
      return await repository.find({
        where: { operationId },
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      this.logger.error('Failed to get checkpoints', { error: error.message, operationId });
      throw error;
    }
  }

  // Step Result Operations
  async createStepResult(stepResultData: any): Promise<any> {
    try {
      return await typeormService.create('StepResult', stepResultData);
    } catch (error) {
      this.logger.error('Failed to create step result', { error: error.message, stepResultData });
      throw error;
    }
  }

  async getStepResults(operationId: string): Promise<any[]> {
    try {
      const { StepResult } = await import('./entities/index.js');
      const repository = typeormService.getRepository(StepResult);
      return await repository.find({
        where: { operationId },
        order: { createdAt: 'ASC' }
      });
    } catch (error) {
      this.logger.error('Failed to get step results', { error: error.message, operationId });
      throw error;
    }
  }

  // Workflow Instance Operations
  async createWorkflowInstance(workflowData: any): Promise<any> {
    try {
      return await typeormService.create('WorkflowInstance', workflowData);
    } catch (error) {
      this.logger.error('Failed to create workflow instance', { error: error.message, workflowData });
      throw error;
    }
  }

  async getWorkflowInstance(workflowId: string): Promise<any> {
    try {
      return await typeormService.findById('WorkflowInstance', workflowId);
    } catch (error) {
      this.logger.error('Failed to get workflow instance', { error: error.message, workflowId });
      throw error;
    }
  }

  async updateWorkflowInstance(workflowId: string, updates: any): Promise<any> {
    try {
      return await typeormService.update('WorkflowInstance', workflowId, updates);
    } catch (error) {
      this.logger.error('Failed to update workflow instance', { error: error.message, workflowId, updates });
      throw error;
    }
  }

  // Query Operations
  async getOperationsByStatus(status: string): Promise<any[]> {
    try {
      const { Operation } = await import('./entities/index.js');
      const repository = typeormService.getRepository(Operation);
      return await repository.find({
        where: { status: status as any },
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      this.logger.error('Failed to get operations by status', { error: error.message, status });
      throw error;
    }
  }

  async getActiveOperations(): Promise<any[]> {
    try {
      const { Operation } = await import('./entities/index.js');
      const { In } = await import('typeorm');
      const repository = typeormService.getRepository(Operation);
      return await repository.find({
        where: { 
          status: In(['RUNNING', 'PENDING', 'PAUSED']) as any
        },
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      this.logger.error('Failed to get active operations', { error: error.message });
      throw error;
    }
  }

  async findStaleOperations(cutoffDate: Date): Promise<any[]> {
    try {
      const { Operation } = await import('./entities/index.js');
      const { In, LessThan } = await import('typeorm');
      const repository = typeormService.getRepository(Operation);
      return await repository.find({
        where: { 
          status: In(['RUNNING', 'PENDING', 'PAUSED']) as any,
          updatedAt: LessThan(cutoffDate)
        },
        order: { updatedAt: 'ASC' }
      });
    } catch (error) {
      this.logger.error('Failed to find stale operations', { error: error.message, cutoffDate });
      throw error;
    }
  }

  // Transaction support
  async executeInTransaction<T>(callback: (manager: any) => Promise<T>): Promise<T> {
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
    } catch (error) {
      return false;
    }
  }
} 