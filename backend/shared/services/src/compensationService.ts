import { EventEmitter } from 'events';
import {
  CompensationAction,
  ExecutionStep,
  StepStatus,
  WorkflowInstance,
  OperationState
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { DatabaseService } from './databaseService.js';
import { EventBusService } from './eventBusService.js';

export interface CompensationStep {
  id: string;
  stepId: string; // The original step this compensates for
  action: string;
  description: string;
  compensationData: Record<string, any>;
  timeout: number;
  retryPolicy?: {
    maxAttempts: number;
    backoffStrategy: 'fixed' | 'exponential' | 'linear';
    retryDelay: number;
  };
}

export interface CompensationResult {
  stepId: string;
  compensationStepId: string;
  status: StepStatus;
  error?: string;
  executionTime: number;
  compensationData: Record<string, any>;
}

export class CompensationService extends EventEmitter {
  private databaseService: DatabaseService;
  private eventBusService: EventBusService;
  private activeCompensations = new Map<string, { steps: CompensationStep[]; controller: AbortController }>();

  constructor(databaseService: DatabaseService, eventBusService: EventBusService) {
    super();
    this.databaseService = databaseService;
    this.eventBusService = eventBusService;
  }

  /**
   * Run compensation for completed steps of a failed operation
   */
  public async runCompensation(
    operationId: string,
    completedStepIds: string[],
    reason: string
  ): Promise<CompensationResult[]> {
    const startTime = Date.now();
    const controller = new AbortController();
    
    try {
      logger.info('Starting compensation', {
        operationId,
        completedStepsCount: completedStepIds.length,
        reason
      });

      // Get operation details
      const operation = await this.databaseService.getOperation(operationId);
      if (!operation) {
        throw new Error(`Operation ${operationId} not found`);
      }

      // Get compensation steps for completed steps
      const compensationSteps = await this.getCompensationSteps(operation, completedStepIds);
      
      if (compensationSteps.length === 0) {
        logger.info('No compensation steps required', { operationId });
        return [];
      }

      // Store active compensation
      this.activeCompensations.set(operationId, { steps: compensationSteps, controller });

      // Execute compensation steps in reverse order
      const results: CompensationResult[] = [];
      const reversedSteps = [...compensationSteps].reverse();

      for (const compensationStep of reversedSteps) {
        if (controller.signal.aborted) {
          logger.warn('Compensation cancelled', { operationId });
          break;
        }

        const result = await this.executeCompensationStep(compensationStep, controller.signal);
        results.push(result);

        // Emit compensation step completed event
        await this.eventBusService.publishEvent('compensation.step.completed', {
          operationId,
          compensationStepId: compensationStep.id,
          result
        });
      }

      // Emit compensation completed event
      await this.eventBusService.publishEvent('compensation.completed', {
        operationId,
        reason,
        stepCount: results.length,
        duration: Date.now() - startTime,
        results
      });

      logger.info('Compensation completed', {
        operationId,
        stepCount: results.length,
        duration: Date.now() - startTime
      });

      return results;

    } catch (error) {
      logger.error('Compensation failed', {
        operationId,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      });

      // Emit compensation failed event
      await this.eventBusService.publishEvent('compensation.failed', {
        operationId,
        reason,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;

    } finally {
      // Clean up active compensation
      this.activeCompensations.delete(operationId);
    }
  }

  /**
   * Cancel ongoing compensation
   */
  public async cancelCompensation(operationId: string, reason: string): Promise<void> {
    const activeCompensation = this.activeCompensations.get(operationId);
    
    if (activeCompensation) {
      logger.info('Cancelling compensation', { operationId, reason });
      activeCompensation.controller.abort();
      this.activeCompensations.delete(operationId);

      // Emit compensation cancelled event
      await this.eventBusService.publishEvent('compensation.cancelled', {
        operationId,
        reason
      });
    }
  }

  /**
   * Get compensation status for an operation
   */
  public getCompensationStatus(operationId: string): {
    isActive: boolean;
    stepsCount: number;
    steps: CompensationStep[];
  } {
    const activeCompensation = this.activeCompensations.get(operationId);
    
    return {
      isActive: !!activeCompensation,
      stepsCount: activeCompensation?.steps.length || 0,
      steps: activeCompensation?.steps || []
    };
  }

  /**
   * Private helper methods
   */

  private async getCompensationSteps(
    operation: any,
    completedStepIds: string[]
  ): Promise<CompensationStep[]> {
    const compensationSteps: CompensationStep[] = [];

    // Find completed steps that need compensation
    const completedSteps = operation.executionPlan.steps.filter((step: ExecutionStep) => 
      step.id && completedStepIds.includes(step.id)
    );

    for (const step of completedSteps) {
      const compensationStep = await this.createCompensationStep(step);
      if (compensationStep) {
        compensationSteps.push(compensationStep);
      }
    }

    return compensationSteps;
  }

  private async createCompensationStep(originalStep: ExecutionStep): Promise<CompensationStep | null> {
    // Create compensation step based on the original step type
    switch (originalStep.type) {
      case 'tool':
        return this.createToolCompensationStep(originalStep);
      case 'artifact':
        return this.createArtifactCompensationStep(originalStep);
      case 'validation':
        // Validation steps typically don't need compensation
        return null;
      case 'approval':
        return this.createApprovalCompensationStep(originalStep);
      default:
        logger.warn('No compensation logic for step type', { stepType: originalStep.type });
        return null;
    }
  }

  private createToolCompensationStep(originalStep: ExecutionStep): CompensationStep {
    return {
      id: `comp_${originalStep.id}`,
      stepId: originalStep.id || `unknown_${Date.now()}`,
      action: 'undo_tool_execution',
      description: `Undo tool execution for ${originalStep.name}`,
      compensationData: {
        originalStepId: originalStep.id,
        originalStepName: originalStep.name,
        toolType: originalStep.input?.toolType || 'unknown'
      },
      timeout: 30000, // 30 seconds
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        retryDelay: 1000
      }
    };
  }

  private createArtifactCompensationStep(originalStep: ExecutionStep): CompensationStep {
    return {
      id: `comp_${originalStep.id}`,
      stepId: originalStep.id || `unknown_${Date.now()}`,
      action: 'cleanup_artifact',
      description: `Cleanup artifact created by ${originalStep.name}`,
      compensationData: {
        originalStepId: originalStep.id,
        originalStepName: originalStep.name,
        artifactType: originalStep.input?.artifactType || 'unknown'
      },
      timeout: 15000, // 15 seconds
      retryPolicy: {
        maxAttempts: 2,
        backoffStrategy: 'fixed',
        retryDelay: 2000
      }
    };
  }

  private createApprovalCompensationStep(originalStep: ExecutionStep): CompensationStep {
    return {
      id: `comp_${originalStep.id}`,
      stepId: originalStep.id || `unknown_${Date.now()}`,
      action: 'notify_approval_cancelled',
      description: `Notify that approval for ${originalStep.name} was cancelled`,
      compensationData: {
        originalStepId: originalStep.id,
        originalStepName: originalStep.name,
        approvalType: originalStep.input?.approvalType || 'unknown'
      },
      timeout: 10000, // 10 seconds
      retryPolicy: {
        maxAttempts: 2,
        backoffStrategy: 'fixed',
        retryDelay: 1000
      }
    };
  }

  private async executeCompensationStep(
    compensationStep: CompensationStep,
    signal: AbortSignal
  ): Promise<CompensationResult> {
    const startTime = Date.now();

    try {
      logger.info('Executing compensation step', {
        compensationStepId: compensationStep.id,
        action: compensationStep.action,
        originalStepId: compensationStep.stepId
      });

      // Execute compensation based on action type
      let compensationData: Record<string, any> = {};

      switch (compensationStep.action) {
        case 'undo_tool_execution':
          compensationData = await this.undoToolExecution(compensationStep, signal);
          break;
        case 'cleanup_artifact':
          compensationData = await this.cleanupArtifact(compensationStep, signal);
          break;
        case 'notify_approval_cancelled':
          compensationData = await this.notifyApprovalCancelled(compensationStep, signal);
          break;
        default:
          compensationData = await this.executeGenericCompensation(compensationStep, signal);
          break;
      }

      const result: CompensationResult = {
        stepId: compensationStep.stepId,
        compensationStepId: compensationStep.id,
        status: StepStatus.COMPLETED,
        executionTime: Date.now() - startTime,
        compensationData
      };

      logger.info('Compensation step completed', {
        compensationStepId: compensationStep.id,
        executionTime: result.executionTime
      });

      return result;

    } catch (error) {
      const result: CompensationResult = {
        stepId: compensationStep.stepId,
        compensationStepId: compensationStep.id,
        status: StepStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
        compensationData: {}
      };

      logger.error('Compensation step failed', {
        compensationStepId: compensationStep.id,
        error: result.error,
        executionTime: result.executionTime
      });

      return result;
    }
  }

  private async undoToolExecution(
    compensationStep: CompensationStep,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    // Simulate undoing tool execution
    await this.delay(Math.random() * 2000 + 1000, signal); // 1-3 seconds

    return {
      action: 'undo_tool_execution',
      originalStepId: compensationStep.stepId,
      undoResult: 'Tool execution effects reversed',
      undoneAt: new Date().toISOString()
    };
  }

  private async cleanupArtifact(
    compensationStep: CompensationStep,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    // Simulate artifact cleanup
    await this.delay(Math.random() * 1000 + 500, signal); // 0.5-1.5 seconds

    return {
      action: 'cleanup_artifact',
      originalStepId: compensationStep.stepId,
      cleanupResult: 'Artifact removed successfully',
      cleanedUpAt: new Date().toISOString()
    };
  }

  private async notifyApprovalCancelled(
    compensationStep: CompensationStep,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    // Simulate notification
    await this.delay(Math.random() * 500 + 200, signal); // 0.2-0.7 seconds

    return {
      action: 'notify_approval_cancelled',
      originalStepId: compensationStep.stepId,
      notificationResult: 'Approval cancellation notification sent',
      notifiedAt: new Date().toISOString()
    };
  }

  private async executeGenericCompensation(
    compensationStep: CompensationStep,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    // Generic compensation handler
    await this.delay(Math.random() * 1000 + 500, signal); // 0.5-1.5 seconds

    return {
      action: compensationStep.action,
      originalStepId: compensationStep.stepId,
      result: 'Generic compensation completed',
      executedAt: new Date().toISOString()
    };
  }

  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      
      const abortHandler = () => {
        clearTimeout(timeout);
        reject(new Error('Compensation step was cancelled'));
      };
      
      signal.addEventListener('abort', abortHandler);
      
      setTimeout(() => {
        signal.removeEventListener('abort', abortHandler);
      }, ms);
    });
  }
} 