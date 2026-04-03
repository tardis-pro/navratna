import { logger } from '@uaip/utils';
import {
  getIntelligenceDb,
  getControlDb,
  agents,
  agentActivity,
  agentLearningRecords,
  operations,
  eq,
  and,
  gte,
  lte,
  desc,
} from '@uaip/shared-services';
import { OperationPriority, OperationStatus, OperationType } from '@uaip/types';

interface AgentStateData {
  status?: string;
  capabilities?: string[];
  performance?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timestamp?: Date | string;
}

interface AgentCapabilitiesData {
  capabilities?: {
    primary?: string[];
    scores?: Record<string, number>;
  };
  timestamp?: Date | string;
}

interface AgentActivityData {
  type: string;
  duration?: number;
  success?: boolean;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp?: Date | string;
}

interface TimeRangeData {
  start?: Date | string;
  end?: Date | string;
}

interface LearningRecordData {
  operationId?: string;
  learningData?: Record<string, unknown>;
  confidenceAdjustments?: Record<string, unknown>;
  version?: string;
  timestamp?: Date | string;
}

interface ExecutionPlanData {
  id?: string;
  type?: string;
  agentId?: string;
  userId?: string;
  steps?: Array<{
    id?: string;
    type?: string;
    description?: string;
    estimatedDuration?: number;
    required?: boolean;
  }>;
  dependencies?: string[];
  estimatedDuration?: number;
  constraints?: string[];
  priority?: string;
  metadata?: Record<string, unknown>;
}

type AgentActivityRow = typeof agentActivity.$inferSelect;
type AgentLearningRow = typeof agentLearningRecords.$inferSelect;
type OperationRow = typeof operations.$inferSelect;

export class AgentIntelligenceStore {
  private toDate(value?: Date | string): Date {
    return value ? new Date(value) : new Date();
  }

  private toOperationPriority(priority?: string): OperationPriority {
    switch (priority) {
      case OperationPriority.LOW:
        return OperationPriority.LOW;
      case OperationPriority.HIGH:
        return OperationPriority.HIGH;
      case OperationPriority.URGENT:
        return OperationPriority.URGENT;
      case OperationPriority.MEDIUM:
      default:
        return OperationPriority.MEDIUM;
    }
  }

  async storeAgentState(agentId: string, state: AgentStateData): Promise<void> {
    logger.debug('Storing agent state', { agentId });
    try {
      const db = getIntelligenceDb();
      const existing = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
      const current = existing[0];

      await db
        .update(agents)
        .set({
          status: state.status ?? current?.status,
          capabilities: state.capabilities ?? current?.capabilities,
          performanceMetrics: state.performance ?? current?.performanceMetrics,
          configuration: {
            ...(current?.configuration ?? {}),
            lastStateContext: state.context,
          },
          lastActiveAt: this.toDate(state.timestamp),
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agentId));
    } catch (error) {
      logger.warn('Failed to store agent state', { agentId, error: (error as Error).message });
    }
  }

  async storeAgentCapabilities(
    agentId: string,
    capabilities: AgentCapabilitiesData
  ): Promise<void> {
    logger.debug('Storing agent capabilities', { agentId });
    try {
      const db = getIntelligenceDb();
      const existing = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
      const current = existing[0];

      await db
        .update(agents)
        .set({
          capabilities: capabilities.capabilities?.primary ?? current?.capabilities,
          capabilityScores: capabilities.capabilities?.scores ?? current?.capabilityScores,
          metadata: {
            ...(current?.metadata ?? {}),
            lastCapabilityUpdate: this.toDate(capabilities.timestamp),
          },
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agentId));
    } catch (error) {
      logger.warn('Failed to store agent capabilities', {
        agentId,
        error: (error as Error).message,
      });
    }
  }

  async storeAgentActivity(agentId: string, activity: AgentActivityData): Promise<void> {
    logger.debug('Storing agent activity', { agentId });
    try {
      const db = getIntelligenceDb();
      await db.insert(agentActivity).values({
        agentId,
        activityType: activity.type,
        duration: activity.duration ?? 0,
        success: activity.success ?? true,
        metadata: {
          ...(activity.metadata ?? {}),
          context: activity.context,
        },
      });
    } catch (error) {
      logger.warn('Failed to store agent activity', { agentId, error: (error as Error).message });
    }
  }

  async getAgentActivities(
    agentId: string,
    timeRange?: TimeRangeData
  ): Promise<AgentActivityRow[]> {
    logger.debug('Getting agent activities', { agentId, timeRange });
    try {
      const db = getIntelligenceDb();
      const conditions = [eq(agentActivity.agentId, agentId)];

      if (timeRange?.start && timeRange?.end) {
        conditions.push(gte(agentActivity.createdAt, new Date(timeRange.start)));
        conditions.push(lte(agentActivity.createdAt, new Date(timeRange.end)));
      } else if (timeRange?.start) {
        conditions.push(gte(agentActivity.createdAt, new Date(timeRange.start)));
      } else if (timeRange?.end) {
        conditions.push(lte(agentActivity.createdAt, new Date(timeRange.end)));
      }

      return await db
        .select()
        .from(agentActivity)
        .where(and(...conditions))
        .orderBy(desc(agentActivity.createdAt));
    } catch (error) {
      logger.warn('Failed to get agent activities', { error, agentId });
      return [];
    }
  }

  async storeLearningRecord(agentId: string, record: LearningRecordData): Promise<void> {
    logger.debug('Storing learning record', { agentId });
    try {
      const db = getIntelligenceDb();
      await db.insert(agentLearningRecords).values({
        agentId,
        lessonType: record.operationId ? 'operation' : 'general',
        content: {
          ...(record.learningData ?? {}),
          operationId: record.operationId,
          confidenceAdjustments: record.confidenceAdjustments,
          version: record.version,
        },
        metadata: { operationId: record.operationId, version: record.version },
      });
    } catch (error) {
      logger.warn('Failed to store learning record', { agentId, error: (error as Error).message });
    }
  }

  async getLearningRecords(
    agentId: string,
    timeRange?: TimeRangeData
  ): Promise<AgentLearningRow[]> {
    logger.debug('Getting learning records', { agentId, timeRange });
    try {
      const db = getIntelligenceDb();
      const conditions = [eq(agentLearningRecords.agentId, agentId)];

      if (timeRange?.start && timeRange?.end) {
        conditions.push(gte(agentLearningRecords.createdAt, new Date(timeRange.start)));
        conditions.push(lte(agentLearningRecords.createdAt, new Date(timeRange.end)));
      } else if (timeRange?.start) {
        conditions.push(gte(agentLearningRecords.createdAt, new Date(timeRange.start)));
      } else if (timeRange?.end) {
        conditions.push(lte(agentLearningRecords.createdAt, new Date(timeRange.end)));
      }

      return await db
        .select()
        .from(agentLearningRecords)
        .where(and(...conditions))
        .orderBy(desc(agentLearningRecords.createdAt));
    } catch (error) {
      logger.warn('Failed to get learning records', { error, agentId });
      return [];
    }
  }

  async storeExecutionPlan(plan: ExecutionPlanData): Promise<void> {
    logger.debug('Storing execution plan', { planId: plan?.id });
    try {
      const db = getControlDb();

      const planExecutionData = {
        steps: plan.steps ?? [],
        dependencies: plan.dependencies ?? [],
        estimatedDuration: plan.estimatedDuration,
        constraints: plan.constraints ?? [],
      };

      if (plan.id) {
        const existing = await db
          .select()
          .from(operations)
          .where(eq(operations.id, plan.id))
          .limit(1);

        if (existing[0]) {
          await db
            .update(operations)
            .set({
              executionPlan: planExecutionData as unknown as import('@uaip/types').ExecutionPlan,
              priority: this.toOperationPriority(plan.priority),
              metadata: plan.metadata,
              updatedAt: new Date(),
            })
            .where(eq(operations.id, plan.id));
          return;
        }
      }

      await db.insert(operations).values({
        ...(plan.id ? { id: plan.id } : {}),
        type: plan.type ?? OperationType.ANALYSIS,
        name: plan.type ?? 'Execution Plan',
        status: OperationStatus.PENDING,
        agentId: plan.agentId ?? 'system',
        userId: plan.userId ?? 'system',
        executionPlan: planExecutionData as unknown as import('@uaip/types').ExecutionPlan,
        priority: this.toOperationPriority(plan.priority),
        metadata: plan.metadata,
        dependencies: plan.dependencies ?? [],
        dependentOperations: [],
        tags: [],
        currentStep: 0,
        retryCount: 0,
        maxRetries: 3,
      });
    } catch (error) {
      logger.warn('Failed to store execution plan', { error: (error as Error).message });
    }
  }

  async getPlanAuditLogs(
    agentId: string,
    timeRange?: TimeRangeData
  ): Promise<AgentActivityRow[]> {
    logger.debug('Getting plan audit logs', { agentId });
    try {
      const db = getIntelligenceDb();
      const conditions = [
        eq(agentActivity.agentId, agentId),
        eq(agentActivity.activityType, 'plan_generated'),
      ];

      if (timeRange?.start) {
        conditions.push(gte(agentActivity.createdAt, new Date(timeRange.start)));
      }
      if (timeRange?.end) {
        conditions.push(lte(agentActivity.createdAt, new Date(timeRange.end)));
      }

      return await db
        .select()
        .from(agentActivity)
        .where(and(...conditions))
        .orderBy(desc(agentActivity.createdAt));
    } catch (error) {
      logger.warn('Failed to get plan audit logs', { error, agentId });
      return [];
    }
  }

  async getOperationById(operationId: string): Promise<OperationRow | null> {
    logger.debug('Getting operation', { operationId });
    try {
      const db = getControlDb();
      const rows = await db
        .select()
        .from(operations)
        .where(eq(operations.id, operationId))
        .limit(1);
      return rows[0] ?? null;
    } catch (error) {
      logger.warn('Failed to get operation', { operationId, error: (error as Error).message });
      return null;
    }
  }
}
