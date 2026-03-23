import { logger } from '@uaip/utils';
import { DatabaseService } from '@uaip/infra/database';
import { Agent, AgentActivity, AgentLearningRecord, Operation } from '@uaip/shared-services';
import { OperationPriority, OperationStatus, OperationType } from '@uaip/types';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

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

/**
 * Agent Intelligence Store
 * Provides agent-intelligence-specific storage operations with real database persistence.
 */
export class AgentIntelligenceStore {
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

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
    await this.databaseService.update<Agent>(Agent, agentId, {
      status: state.status,
      capabilities: state.capabilities,
      performanceMetrics: state.performance,
      configuration: {
        ...((await this.databaseService.findById<Agent>(Agent, agentId))?.configuration ?? {}),
        lastStateContext: state.context,
      },
      lastActiveAt: this.toDate(state.timestamp),
    });
  }

  async storeAgentCapabilities(
    agentId: string,
    capabilities: AgentCapabilitiesData
  ): Promise<void> {
    logger.debug('Storing agent capabilities', { agentId });
    await this.databaseService.update<Agent>(Agent, agentId, {
      capabilities: capabilities.capabilities?.primary ?? [],
      capabilityScores: capabilities.capabilities?.scores ?? {},
      metadata: {
        ...((await this.databaseService.findById<Agent>(Agent, agentId))?.metadata ?? {}),
        lastCapabilityUpdate: this.toDate(capabilities.timestamp),
      },
    });
  }

  async storeAgentActivity(agentId: string, activity: AgentActivityData): Promise<void> {
    logger.debug('Storing agent activity', { agentId });
    await this.databaseService.create<AgentActivity>(AgentActivity, {
      agentId,
      type: activity.type,
      duration: activity.duration ?? 0,
      success: activity.success ?? true,
      context: activity.context,
      metadata: activity.metadata,
      timestamp: this.toDate(activity.timestamp),
    });
  }

  async getAgentActivities(agentId: string, timeRange?: TimeRangeData): Promise<AgentActivity[]> {
    logger.debug('Getting agent activities', { agentId, timeRange });
    try {
      const where: FindOptionsWhere<AgentActivity> = { agentId };

      if (timeRange?.start && timeRange?.end) {
        where.timestamp = Between(new Date(timeRange.start), new Date(timeRange.end));
      } else if (timeRange?.start) {
        where.timestamp = MoreThanOrEqual(new Date(timeRange.start));
      } else if (timeRange?.end) {
        where.timestamp = LessThanOrEqual(new Date(timeRange.end));
      }

      return await this.databaseService.findMany<AgentActivity>(AgentActivity, where, {
        order: { timestamp: 'DESC' },
      });
    } catch (error) {
      logger.warn('Failed to get agent activities', { error, agentId });
      return [];
    }
  }

  async storeLearningRecord(agentId: string, record: LearningRecordData): Promise<void> {
    logger.debug('Storing learning record', { agentId });
    await this.databaseService.create<AgentLearningRecord>(AgentLearningRecord, {
      agentId,
      operationId: record.operationId,
      learningData: record.learningData ?? {},
      confidenceAdjustments: record.confidenceAdjustments,
      version: record.version,
      timestamp: this.toDate(record.timestamp),
    });
  }

  async getLearningRecords(
    agentId: string,
    timeRange?: TimeRangeData
  ): Promise<AgentLearningRecord[]> {
    logger.debug('Getting learning records', { agentId, timeRange });
    try {
      const where: FindOptionsWhere<AgentLearningRecord> = { agentId };

      if (timeRange?.start && timeRange?.end) {
        where.timestamp = Between(new Date(timeRange.start), new Date(timeRange.end));
      } else if (timeRange?.start) {
        where.timestamp = MoreThanOrEqual(new Date(timeRange.start));
      } else if (timeRange?.end) {
        where.timestamp = LessThanOrEqual(new Date(timeRange.end));
      }

      return await this.databaseService.findMany<AgentLearningRecord>(AgentLearningRecord, where, {
        order: { timestamp: 'DESC' },
      });
    } catch (error) {
      logger.warn('Failed to get learning records', { error, agentId });
      return [];
    }
  }

  async storeExecutionPlan(plan: ExecutionPlanData): Promise<void> {
    logger.debug('Storing execution plan', { planId: plan?.id });

    const planExecutionData = {
      steps: plan.steps ?? [],
      dependencies: plan.dependencies ?? [],
      estimatedDuration: plan.estimatedDuration,
      constraints: plan.constraints ?? [],
    };

    if (plan.id) {
      const existing = await this.databaseService.findById<Operation>(Operation, plan.id);
      if (existing) {
        await this.databaseService.update<Operation>(Operation, plan.id, {
          executionPlan: planExecutionData,
          priority: this.toOperationPriority(plan.priority),
          metadata: plan.metadata,
        });
        return;
      }
    }

    await this.databaseService.create<Operation>(Operation, {
      ...(plan.id ? { id: plan.id } : {}),
      type: plan.type ?? OperationType.ANALYSIS,
      name: plan.type ?? 'Execution Plan',
      status: OperationStatus.PENDING,
      agentId: plan.agentId ?? 'system',
      userId: plan.userId ?? 'system',
      executionPlan: planExecutionData,
      priority: this.toOperationPriority(plan.priority),
      metadata: plan.metadata,
    });
  }

  async getOperationById(operationId: string): Promise<Operation | null> {
    logger.debug('Getting operation', { operationId });
    return this.databaseService.findById<Operation>(Operation, operationId);
  }
}
