import { logger } from '@uaip/utils';
import { BaseRepository } from '../base/BaseRepository.js';
import { Operation } from '../../entities/operation.entity.js';
import { OperationState } from '../../entities/operationState.entity.js';
import { OperationCheckpoint } from '../../entities/operationCheckpoint.entity.js';
import { StepResult } from '../../entities/stepResult.entity.js';

export class OperationRepository extends BaseRepository<Operation> {
  constructor() {
    super(Operation);
  }

  /**
   * Create operation with specific data
   */
  public async createOperation(operationData: Partial<Operation>): Promise<Operation> {
    const operation = this.repository.create(operationData);
    return await this.repository.save(operation);
  }

  /**
   * Update operation result
   */
  public async updateOperationResult(operationId: string, result: any): Promise<void> {
    await this.repository.update(operationId, {
      result,
      status: 'completed' as any,
      completedAt: new Date(),
      updatedAt: new Date()
    });
  }

  /**
   * Get operation by ID (raw query for compatibility)
   */
  public async getOperationById(operationId: string): Promise<any | null> {
    try {
      const manager = this.getEntityManager();
      const query = 'SELECT * FROM operations WHERE id = $1';
      const result = await manager.query(query, [operationId]);
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      logger.error('Error getting operation by ID', { operationId, error: (error as Error).message });
      throw error;
    }
  }
}

export class OperationStateRepository extends BaseRepository<OperationState> {
  constructor() {
    super(OperationState);
  }

  /**
   * Save operation state
   */
  public async saveOperationState(operationId: string, state: any): Promise<void> {
    try {
      // Check if state already exists
      const existingState = await this.repository.findOne({
        where: { operationId }
      });

      if (existingState) {
        // Update existing state
        await this.repository.update(
          { operationId },
          { 
            toStatus: state.status || existingState.toStatus,
            context: state,
            transitionedAt: new Date(),
            updatedAt: new Date()
          }
        );
      } else {
        // Create new state
        const newState = this.repository.create({
          operationId,
          toStatus: state.status || 'pending',
          context: state,
          transitionedAt: new Date(),
          isAutomatic: true
        });
        await this.repository.save(newState);
      }
    } catch (error) {
      logger.error('Failed to save operation state', { operationId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get operation state
   */
  public async getOperationState(operationId: string): Promise<any> {
    try {
      const state = await this.repository.findOne({
        where: { operationId },
        order: { transitionedAt: 'DESC' }
      });
      return state?.context || null;
    } catch (error) {
      logger.error('Failed to get operation state', { operationId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Update operation state
   */
  public async updateOperationState(operationId: string, state: any, updates: any): Promise<void> {
    try {
      await this.repository.update(
        { operationId },
        { 
          context: { ...state, ...updates },
          transitionedAt: new Date(),
          updatedAt: new Date()
        }
      );
    } catch (error) {
      logger.error('Failed to update operation state', { operationId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Delete old operation states
   */
  public async deleteOldOperationStates(cutoffDate: Date): Promise<number> {
    try {
      const result = await this.repository
        .createQueryBuilder()
        .delete()
        .where('transitionedAt < :cutoffDate', { cutoffDate })
        .execute();
      return result.affected;
    } catch (error) {
      logger.error('Failed to delete old operation states', { cutoffDate, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get state statistics
   */
  public async getStateStatistics(): Promise<{
    totalOperations: number;
    activeOperations: number;
    totalCheckpoints: number;
    averageStateSize: number;
  }> {
    try {
      const checkpointRepo = new OperationCheckpointRepository();

      const [totalOperations, activeOperations, totalCheckpoints] = await Promise.all([
        this.repository.count(),
        this.repository.count({
          where: { toStatus: 'running' as any }
        }),
        checkpointRepo.count()
      ]);

      return {
        totalOperations,
        activeOperations,
        totalCheckpoints,
        averageStateSize: 0 // Would need complex query to calculate
      };
    } catch (error) {
      logger.error('Failed to get state statistics', { error: (error as Error).message });
      throw error;
    }
  }
}

export class OperationCheckpointRepository extends BaseRepository<OperationCheckpoint> {
  constructor() {
    super(OperationCheckpoint);
  }

  /**
   * Save checkpoint
   */
  public async saveCheckpoint(operationId: string, checkpoint: any): Promise<void> {
    try {
      const newCheckpoint = this.repository.create({
        id: checkpoint.id,
        operationId,
        name: checkpoint.name || `Checkpoint ${checkpoint.id}`,
        checkpointType: checkpoint.type || 'automatic',
        state: checkpoint,
        createdAt: new Date()
      });
      await this.repository.save(newCheckpoint);
    } catch (error) {
      logger.error('Failed to save checkpoint', { operationId, checkpointId: checkpoint.id, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get checkpoint
   */
  public async getCheckpoint(operationId: string, checkpointId: string): Promise<any> {
    try {
      const checkpoint = await this.repository.findOne({
        where: { operationId, id: checkpointId }
      });
      return checkpoint?.state || null;
    } catch (error) {
      logger.error('Failed to get checkpoint', { operationId, checkpointId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * List checkpoints
   */
  public async listCheckpoints(operationId: string): Promise<any[]> {
    try {
      const checkpoints = await this.repository.find({
        where: { operationId },
        order: { createdAt: 'DESC' }
      });
      return checkpoints.map(cp => cp.state);
    } catch (error) {
      logger.error('Failed to list checkpoints', { operationId, error: (error as Error).message });
      throw error;
    }
  }
}

export class StepResultRepository extends BaseRepository<StepResult> {
  constructor() {
    super(StepResult);
  }

  /**
   * Save step result
   */
  public async saveStepResult(operationId: string, result: any): Promise<void> {
    try {
      const stepResult = this.repository.create({
        operationId,
        stepNumber: result.stepNumber,
        stepName: result.stepName || result.stepId || 'Unknown Step',
        stepType: result.stepType || 'generic',
        status: result.status || 'completed',
        output: result,
        completedAt: new Date(),
        createdAt: new Date()
      });
      await this.repository.save(stepResult);
    } catch (error) {
      logger.error('Failed to save step result', { operationId, stepId: result.stepId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Get step results for an operation
   */
    public async getStepResults(operationId: string): Promise<StepResult[]> {
    return await this.repository.find({
      where: { operationId },
      order: { stepNumber: 'ASC', createdAt: 'ASC' }
    });
  }
} 