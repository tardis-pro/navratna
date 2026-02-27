import { WorkflowStep, CollaborationPattern } from '@uaip/types';
import { DatabaseService } from '../databaseService';
import { logger } from '@uaip/utils';

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  patternId: string;
  patternName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  metadata?: any;
}

export interface WorkflowStepExecution {
  id: string;
  workflowExecutionId: string;
  stepId: string;
  stepName: string;
  assignedAgentId: string;
  status: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  input?: any;
  output?: any;
  errorDetails?: string;
  metadata?: any;
}

export class WorkflowPersistenceService {
  private workflows = new Map<string, WorkflowExecution>();
  private steps = new Map<string, WorkflowStepExecution[]>();

  constructor(private databaseService?: DatabaseService) {}

  async createWorkflowExecution(
    workflowId: string,
    pattern: CollaborationPattern,
    metadata?: any
  ): Promise<WorkflowExecution> {
    const execution: WorkflowExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workflowId,
      patternId: pattern.id,
      patternName: pattern.name,
      status: 'running',
      startTime: new Date(),
      metadata,
    };

    this.workflows.set(workflowId, execution);

    // Initialize step executions
    const stepExecutions = pattern.steps.map((step) => ({
      id: `step-exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workflowExecutionId: execution.id,
      stepId: step.id,
      stepName: step.name,
      assignedAgentId: step.assignedAgentId,
      status: step.status,
      input: step.input,
      metadata: step.metadata,
    }));

    this.steps.set(workflowId, stepExecutions);

    try {
      // Persist to database if available
      if (this.databaseService) {
        // In a real implementation, this would use proper database entities
        // For now, we'll just log the creation
        logger.info(`Workflow execution created: ${workflowId} (${pattern.name})`);
      }
    } catch (error) {
      logger.error('Failed to persist workflow execution to database:', error);
      // Continue without database persistence
    }

    return execution;
  }

  async updateWorkflowExecution(
    workflowId: string,
    updates: Partial<WorkflowExecution>
  ): Promise<void> {
    const execution = this.workflows.get(workflowId);
    if (!execution) {
      throw new Error(`Workflow execution not found: ${workflowId}`);
    }

    Object.assign(execution, updates);

    if (updates.status && ['completed', 'failed', 'cancelled'].includes(updates.status)) {
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
    }

    try {
      if (this.databaseService) {
        logger.info(`Workflow execution updated: ${workflowId} - ${execution.status}`);
      }
    } catch (error) {
      logger.error('Failed to update workflow execution in database:', error);
    }
  }

  async persistWorkflowStep(workflowId: string, step: WorkflowStep): Promise<void> {
    const stepExecutions = this.steps.get(workflowId);
    if (!stepExecutions) {
      logger.warn(`No step executions found for workflow: ${workflowId}`);
      return;
    }

    const stepExecution = stepExecutions.find((s) => s.stepId === step.id);
    if (!stepExecution) {
      logger.warn(`Step execution not found: ${step.id} in workflow ${workflowId}`);
      return;
    }

    // Update step execution with current step data
    stepExecution.status = step.status;
    stepExecution.startTime = step.startTime;
    stepExecution.endTime = step.endTime;
    stepExecution.duration = step.duration;
    stepExecution.output = step.output;
    stepExecution.errorDetails = step.errorDetails;

    try {
      if (this.databaseService) {
        logger.debug(`Step execution updated: ${step.id} - ${step.status}`);
      }
    } catch (error) {
      logger.error('Failed to persist step execution to database:', error);
    }
  }

  async getWorkflowExecution(workflowId: string): Promise<WorkflowExecution | null> {
    return this.workflows.get(workflowId) || null;
  }

  async getWorkflowSteps(workflowId: string): Promise<WorkflowStepExecution[]> {
    return this.steps.get(workflowId) || [];
  }

  async getWorkflowHistory(limit = 50): Promise<WorkflowExecution[]> {
    const executions = Array.from(this.workflows.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);

    return executions;
  }

  async getAgentWorkflowHistory(agentId: string, limit = 20): Promise<WorkflowStepExecution[]> {
    const allSteps: WorkflowStepExecution[] = [];

    for (const stepExecutions of this.steps.values()) {
      const agentSteps = stepExecutions.filter((s) => s.assignedAgentId === agentId);
      allSteps.push(...agentSteps);
    }

    return allSteps
      .sort((a, b) => {
        const aTime = a.startTime || new Date(0);
        const bTime = b.startTime || new Date(0);
        return bTime.getTime() - aTime.getTime();
      })
      .slice(0, limit);
  }

  async getWorkflowMetrics(workflowId?: string): Promise<{
    totalExecutions: number;
    completedExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    successRate: number;
  }> {
    const executions = workflowId
      ? ([this.workflows.get(workflowId)].filter(Boolean) as WorkflowExecution[])
      : Array.from(this.workflows.values());

    const totalExecutions = executions.length;
    const completedExecutions = executions.filter((e) => e.status === 'completed').length;
    const failedExecutions = executions.filter((e) => e.status === 'failed').length;

    const durations = executions.filter((e) => e.duration !== undefined).map((e) => e.duration!);

    const averageDuration =
      durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

    const successRate = totalExecutions > 0 ? completedExecutions / totalExecutions : 0;

    return {
      totalExecutions,
      completedExecutions,
      failedExecutions,
      averageDuration,
      successRate,
    };
  }

  async cleanupOldExecutions(retentionDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let cleanedCount = 0;

    for (const [workflowId, execution] of this.workflows.entries()) {
      if (execution.startTime < cutoffDate && execution.status !== 'running') {
        this.workflows.delete(workflowId);
        this.steps.delete(workflowId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old workflow executions`);
    }

    return cleanedCount;
  }
}
