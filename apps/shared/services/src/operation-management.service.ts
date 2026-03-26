import { getControlDb } from './database/drizzle/clients/index';
import {
  operations,
  operationStates,
  operationCheckpoints,
  stepResults,
} from './database/drizzle/schemas/control.schema';
import { eq, inArray, and, lt, desc, asc } from 'drizzle-orm';
import { createLogger } from '@uaip/utils';
import { OperationStatus } from '@uaip/types';

type OperationRow = typeof operations.$inferSelect;
type OperationStateRow = typeof operationStates.$inferSelect;
type CheckpointRow = typeof operationCheckpoints.$inferSelect;
type StepResultRow = typeof stepResults.$inferSelect;

export class OperationManagementService {
  private logger = createLogger({
    serviceName: 'operation-management-service',
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  });

  private get db() {
    return getControlDb();
  }

  async createOperation(operationData: typeof operations.$inferInsert): Promise<OperationRow> {
    try {
      const [row] = await this.db.insert(operations).values(operationData).returning();
      return row;
    } catch (error) {
      this.logger.error('Failed to create operation', { error: (error as Error).message });
      throw error;
    }
  }

  async getOperation(operationId: string): Promise<OperationRow | null> {
    try {
      const [row] = await this.db
        .select()
        .from(operations)
        .where(eq(operations.id, operationId))
        .limit(1);
      return row ?? null;
    } catch (error) {
      this.logger.error('Failed to get operation', {
        error: (error as Error).message,
        operationId,
      });
      throw error;
    }
  }

  async updateOperation(
    operationId: string,
    updates: Partial<typeof operations.$inferInsert>
  ): Promise<OperationRow | null> {
    try {
      const [row] = await this.db
        .update(operations)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(operations.id, operationId))
        .returning();
      return row ?? null;
    } catch (error) {
      this.logger.error('Failed to update operation', {
        error: (error as Error).message,
        operationId,
      });
      throw error;
    }
  }

  async createOperationState(
    stateData: typeof operationStates.$inferInsert
  ): Promise<OperationStateRow> {
    try {
      const [row] = await this.db.insert(operationStates).values(stateData).returning();
      return row;
    } catch (error) {
      this.logger.error('Failed to create operation state', { error: (error as Error).message });
      throw error;
    }
  }

  async updateOperationState(
    operationId: string,
    stateData: Partial<typeof operationStates.$inferInsert>
  ): Promise<OperationStateRow | null> {
    try {
      const [row] = await this.db
        .update(operationStates)
        .set({ ...stateData, updatedAt: new Date() })
        .where(eq(operationStates.operationId, operationId))
        .returning();
      return row ?? null;
    } catch (error) {
      this.logger.error('Failed to update operation state', {
        error: (error as Error).message,
        operationId,
      });
      throw error;
    }
  }

  async createCheckpoint(
    checkpointData: typeof operationCheckpoints.$inferInsert
  ): Promise<CheckpointRow> {
    try {
      const [row] = await this.db.insert(operationCheckpoints).values(checkpointData).returning();
      return row;
    } catch (error) {
      this.logger.error('Failed to create checkpoint', { error: (error as Error).message });
      throw error;
    }
  }

  async getCheckpoints(operationId: string): Promise<CheckpointRow[]> {
    try {
      return await this.db
        .select()
        .from(operationCheckpoints)
        .where(eq(operationCheckpoints.operationId, operationId))
        .orderBy(desc(operationCheckpoints.createdAt));
    } catch (error) {
      this.logger.error('Failed to get checkpoints', {
        error: (error as Error).message,
        operationId,
      });
      throw error;
    }
  }

  async createStepResult(stepResultData: typeof stepResults.$inferInsert): Promise<StepResultRow> {
    try {
      const [row] = await this.db.insert(stepResults).values(stepResultData).returning();
      return row;
    } catch (error) {
      this.logger.error('Failed to create step result', { error: (error as Error).message });
      throw error;
    }
  }

  async getStepResults(operationId: string): Promise<StepResultRow[]> {
    try {
      return await this.db
        .select()
        .from(stepResults)
        .where(eq(stepResults.operationId, operationId))
        .orderBy(asc(stepResults.createdAt));
    } catch (error) {
      this.logger.error('Failed to get step results', {
        error: (error as Error).message,
        operationId,
      });
      throw error;
    }
  }

  async getOperationsByStatus(status: OperationStatus): Promise<OperationRow[]> {
    try {
      return await this.db
        .select()
        .from(operations)
        .where(eq(operations.status, status))
        .orderBy(desc(operations.createdAt));
    } catch (error) {
      this.logger.error('Failed to get operations by status', {
        error: (error as Error).message,
        status,
      });
      throw error;
    }
  }

  async getActiveOperations(): Promise<OperationRow[]> {
    try {
      const activeStatuses = [
        OperationStatus.RUNNING,
        OperationStatus.PENDING,
        OperationStatus.PAUSED,
      ] as OperationStatus[];
      return await this.db
        .select()
        .from(operations)
        .where(inArray(operations.status, activeStatuses))
        .orderBy(desc(operations.createdAt));
    } catch (error) {
      this.logger.error('Failed to get active operations', { error: (error as Error).message });
      throw error;
    }
  }

  async findStaleOperations(cutoffDate: Date): Promise<OperationRow[]> {
    try {
      const activeStatuses = [
        OperationStatus.RUNNING,
        OperationStatus.PENDING,
        OperationStatus.PAUSED,
      ] as OperationStatus[];
      return await this.db
        .select()
        .from(operations)
        .where(
          and(inArray(operations.status, activeStatuses), lt(operations.updatedAt, cutoffDate))
        )
        .orderBy(asc(operations.updatedAt));
    } catch (error) {
      this.logger.error('Failed to find stale operations', {
        error: (error as Error).message,
        cutoffDate,
      });
      throw error;
    }
  }

  async executeInTransaction<T>(
    callback: (db: ReturnType<typeof getControlDb>) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(callback);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const { sql } = await import('drizzle-orm');
      await this.db.execute(sql`SELECT 1`);
      return true;
    } catch {
      return false;
    }
  }
}
