import { eq, and, desc, inArray, count } from 'drizzle-orm';
import { getControlDb } from '../drizzle/clients/index';
import {
  operations,
  operationStates,
  operationCheckpoints,
  stepResults,
  type Operation,
  type NewOperation,
} from '../drizzle/schemas/control_schema';
import { logger } from '@uaip/utils';
import { OperationStatus } from '@uaip/types';

const OPERATION_STATUS_VALUES: string[] = Object.values(OperationStatus);
function isOperationStatus(v: string): v is OperationStatus {
  return OPERATION_STATUS_VALUES.includes(v);
}

export class OperationRepository {
  private get db() {
    return getControlDb();
  }

  async createOperation(data: NewOperation): Promise<Operation> {
    try {
      const [row] = await this.db.insert(operations).values(data).returning();
      return row;
    } catch (error) {
      logger.error('OperationRepository.createOperation failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async findById(id: string): Promise<Operation | null> {
    try {
      const [row] = await this.db.select().from(operations).where(eq(operations.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('OperationRepository.findById failed', { id, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getOperationById(id: string): Promise<Operation | null> {
    return this.findById(id);
  }

  async findByAgentId(agentId: string): Promise<Operation[]> {
    try {
      return this.db.select().from(operations).where(eq(operations.agentId, agentId)).orderBy(desc(operations.createdAt));
    } catch (error) {
      logger.error('OperationRepository.findByAgentId failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async findByStatus(status: string): Promise<Operation[]> {
    try {
      const statusValue = isOperationStatus(status) ? status : OperationStatus.PENDING;
      return this.db.select().from(operations).where(eq(operations.status, statusValue)).orderBy(desc(operations.createdAt));
    } catch (error) {
      logger.error('OperationRepository.findByStatus failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async findByUserId(userId: string, options: { limit?: number; offset?: number } = {}): Promise<{ operations: Operation[]; total: number }> {
    try {
      const where = eq(operations.userId, userId);
      const [{ value: total }] = await this.db.select({ value: count() }).from(operations).where(where);
      const rows = await this.db.select().from(operations).where(where).orderBy(desc(operations.createdAt)).limit(options.limit ?? 50).offset(options.offset ?? 0);
      return { operations: rows, total: Number(total) };
    } catch (error) {
      logger.error('OperationRepository.findByUserId failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async update(id: string, data: Partial<NewOperation>): Promise<Operation | null> {
    try {
      const [row] = await this.db.update(operations).set(data).where(eq(operations.id, id)).returning();
      return row ?? null;
    } catch (error) {
      logger.error('OperationRepository.update failed', { id, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getOperationStatus(id: string): Promise<{ status: string; progress: string | null } | null> {
    try {
      const [row] = await this.db.select({ status: operations.status, progress: operations.progress }).from(operations).where(eq(operations.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('OperationRepository.getOperationStatus failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}

export class OperationStateRepository {
  private get db() {
    return getControlDb();
  }

  async saveOperationState(operationId: string, state: Record<string, unknown>): Promise<void> {
    try {
      await this.db.insert(operationStates).values({ operationId, state });
    } catch (error) {
      logger.error('OperationStateRepository.saveOperationState failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getOperationState(operationId: string): Promise<Record<string, unknown> | null> {
    try {
      const [row] = await this.db.select().from(operationStates).where(eq(operationStates.operationId, operationId)).limit(1);
      return row?.state ?? null;
    } catch (error) {
      logger.error('OperationStateRepository.getOperationState failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async updateOperationState(operationId: string, _state: Record<string, unknown>, updates: Record<string, unknown>): Promise<void> {
    return this.saveOperationState(operationId, updates);
  }

  async deleteOldOperationStates(_cutoffDate: Date): Promise<number> {
    return 0;
  }

  async getStateStatistics(): Promise<{ totalOperations: number; activeOperations: number; totalCheckpoints: number; averageStateSize: number }> {
    return { totalOperations: 0, activeOperations: 0, totalCheckpoints: 0, averageStateSize: 0 };
  }
}

export class OperationCheckpointRepository {
  private get db() {
    return getControlDb();
  }

  async saveCheckpoint(operationId: string, data: Record<string, unknown>): Promise<void> {
    try {
      const stepIndex = typeof data['stepIndex'] === 'number' ? data['stepIndex'] : 0;
      await this.db.insert(operationCheckpoints).values({ operationId, stepIndex, data });
    } catch (error) {
      logger.error('OperationCheckpointRepository.saveCheckpoint failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async listCheckpoints(operationId: string): Promise<(typeof operationCheckpoints.$inferSelect)[]> {
    try {
      return this.db.select().from(operationCheckpoints).where(eq(operationCheckpoints.operationId, operationId));
    } catch (error) {
      logger.error('OperationCheckpointRepository.listCheckpoints failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async getCheckpoint(
    operationId: string,
    checkpointId: string
  ): Promise<(typeof operationCheckpoints.$inferSelect) | null> {
    try {
      const [row] = await this.db
        .select()
        .from(operationCheckpoints)
        .where(
          and(
            eq(operationCheckpoints.operationId, operationId),
            eq(operationCheckpoints.id, checkpointId)
          )
        )
        .limit(1);

      return row ?? null;
    } catch (error) {
      logger.error('OperationCheckpointRepository.getCheckpoint failed', {
        operationId,
        checkpointId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export class StepResultRepository {
  private get db() {
    return getControlDb();
  }

  async create(data: typeof stepResults.$inferInsert): Promise<typeof stepResults.$inferSelect> {
    try {
      const [row] = await this.db.insert(stepResults).values(data).returning();
      return row;
    } catch (error) {
      logger.error('StepResultRepository.create failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async findByOperation(operationId: string): Promise<(typeof stepResults.$inferSelect)[]> {
    try {
      return this.db.select().from(stepResults).where(eq(stepResults.operationId, operationId));
    } catch (error) {
      logger.error('StepResultRepository.findByOperation failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
}

export async function mergeAndUpdateState(
  repo: OperationStateRepository,
  operationId: string,
  state: Record<string, unknown>,
  updates: Record<string, unknown>
): Promise<void> {
  return repo.updateOperationState(operationId, state, updates);
}
