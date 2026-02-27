import { logger } from '@uaip/utils';
import { DatabaseService } from '@uaip/infra/database';
import { Agent, AgentActivity, AgentLearningRecord, Operation } from '@uaip/shared-services';
import { LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

/**
 * Agent Intelligence Store
 * Provides agent-intelligence-specific storage operations with real database persistence.
 */
export class AgentIntelligenceStore {
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  async storeAgentState(agentId: string, state: any): Promise<void> {
    logger.debug('Storing agent state', { agentId });
    await this.databaseService.update<Agent>(Agent, agentId, {
      status: state.status,
      capabilities: state.capabilities,
      performanceMetrics: state.performance,
      configuration: {
        ...((await this.databaseService.findById<Agent>(Agent, agentId))?.configuration ?? {}),
        lastStateContext: state.context,
      },
      lastActiveAt: state.timestamp ?? new Date(),
    });
  }

  async storeAgentCapabilities(agentId: string, capabilities: any): Promise<void> {
    logger.debug('Storing agent capabilities', { agentId });
    await this.databaseService.update<Agent>(Agent, agentId, {
      capabilities: capabilities.capabilities?.primary ?? [],
      capabilityScores: capabilities.capabilities?.scores ?? {},
      metadata: {
        ...((await this.databaseService.findById<Agent>(Agent, agentId))?.metadata ?? {}),
        lastCapabilityUpdate: capabilities.timestamp ?? new Date(),
      },
    });
  }

  async storeAgentActivity(agentId: string, activity: any): Promise<void> {
    logger.debug('Storing agent activity', { agentId });
    await this.databaseService.create<AgentActivity>(AgentActivity, {
      agentId,
      type: activity.type,
      duration: activity.duration ?? 0,
      success: activity.success ?? true,
      context: activity.context,
      metadata: activity.metadata,
      timestamp: activity.timestamp ?? new Date(),
    });
  }

  async getAgentActivities(agentId: string, timeRange?: any): Promise<any[]> {
    logger.debug('Getting agent activities', { agentId, timeRange });
    try {
      const where: any = { agentId };
      if (timeRange?.start) {
        where.timestamp = MoreThanOrEqual(new Date(timeRange.start));
      }
      if (timeRange?.end) {
        where.timestamp = {
          ...(where.timestamp ?? {}),
          ...LessThanOrEqual(new Date(timeRange.end)),
        };
      }
      return await this.databaseService.findMany<AgentActivity>(AgentActivity, where, {
        order: { timestamp: 'DESC' },
      });
    } catch (error) {
      logger.warn('Failed to get agent activities', { error, agentId });
      return [];
    }
  }

  async storeLearningRecord(agentId: string, record: any): Promise<void> {
    logger.debug('Storing learning record', { agentId });
    await this.databaseService.create<AgentLearningRecord>(AgentLearningRecord, {
      agentId,
      operationId: record.operationId,
      learningData: record.learningData,
      confidenceAdjustments: record.confidenceAdjustments,
      version: record.version,
      timestamp: record.timestamp ?? new Date(),
    });
  }

  async getLearningRecords(agentId: string, timeRange?: any): Promise<any[]> {
    logger.debug('Getting learning records', { agentId, timeRange });
    try {
      const where: any = { agentId };
      if (timeRange?.start) {
        where.timestamp = MoreThanOrEqual(new Date(timeRange.start));
      }
      if (timeRange?.end) {
        where.timestamp = {
          ...(where.timestamp ?? {}),
          ...LessThanOrEqual(new Date(timeRange.end)),
        };
      }
      return await this.databaseService.findMany<AgentLearningRecord>(AgentLearningRecord, where, {
        order: { timestamp: 'DESC' },
      });
    } catch (error) {
      logger.warn('Failed to get learning records', { error, agentId });
      return [];
    }
  }

  async storeExecutionPlan(plan: any): Promise<void> {
    logger.debug('Storing execution plan', { planId: plan?.id });
    if (plan.id) {
      const existing = await this.databaseService.findById<Operation>(Operation, plan.id);
      if (existing) {
        await this.databaseService.update<Operation>(Operation, plan.id, {
          executionPlan: {
            steps: plan.steps,
            dependencies: plan.dependencies,
            estimatedDuration: plan.estimatedDuration,
            constraints: plan.constraints,
          },
          priority: plan.priority ?? 'medium',
          metadata: plan.metadata,
        });
        return;
      }
    }
    await this.databaseService.create<Operation>(Operation, {
      ...(plan.id ? { id: plan.id } : {}),
      type: plan.type ?? 'execution_plan',
      name: plan.type ?? 'Execution Plan',
      status: 'pending' as any,
      agentId: plan.agentId,
      userId: plan.userId ?? 'system',
      executionPlan: {
        steps: plan.steps,
        dependencies: plan.dependencies,
        estimatedDuration: plan.estimatedDuration,
        constraints: plan.constraints,
      },
      priority: plan.priority ?? 'medium',
      metadata: plan.metadata,
    });
  }

  async getOperationById(operationId: string): Promise<any> {
    logger.debug('Getting operation', { operationId });
    return this.databaseService.findById<Operation>(Operation, operationId);
  }
}
