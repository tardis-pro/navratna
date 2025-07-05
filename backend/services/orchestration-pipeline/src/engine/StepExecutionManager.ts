/**
 * Step Execution Manager
 * Handles the execution of individual steps within an operation
 */

import { EventEmitter } from 'events';
import {
  ExecutionStep,
  StepStatus,
  StepResult,
  OperationError,
  StepMetrics,
  ParallelExecutionPolicy
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { StepExecutorService, ResourceManagerService } from '@uaip/shared-services';

export interface StepExecutionContext {
  operationId: string;
  workflowInstanceId: string;
  previousResults: Map<string, StepResult>;
  globalContext: Record<string, any>;
}

export class StepExecutionManager extends EventEmitter {
  private stepTimeouts = new Map<string, NodeJS.Timeout>();
  private activeSteps = new Map<string, ExecutionStep>();

  constructor(
    private stepExecutorService: StepExecutorService,
    private resourceManagerService: ResourceManagerService
  ) {
    super();
  }

  async executeStep(
    step: ExecutionStep,
    context: StepExecutionContext
  ): Promise<StepResult> {
    const startTime = Date.now();
    this.activeSteps.set(step.id, step);

    try {
      // Emit step started event
      this.emit('step:started', {
        stepId: step.id,
        operationId: context.operationId,
        timestamp: new Date()
      });

      // Set timeout if specified
      if (step.timeout) {
        this.setStepTimeout(step, context);
      }

      // Check resource availability
      await this.checkResources(step);

      // Execute based on step type
      let result: StepResult;
      switch (step.type) {
        case 'agent-action':
          result = await this.executeAgentAction(step, context);
          break;
        case 'tool-execution':
          result = await this.executeToolExecution(step, context);
          break;
        case 'conditional':
          result = await this.executeConditional(step, context);
          break;
        case 'parallel':
          result = await this.executeParallel(step, context);
          break;
        default:
          throw new OperationError(`Unknown step type: ${step.type}`, 'EXECUTION_ERROR');
      }

      // Clear timeout
      this.clearStepTimeout(step.id);

      // Record metrics
      const duration = Date.now() - startTime;
      const metrics: StepMetrics = {
        executionTime: duration,
        resourceUsage: await this.getResourceUsage(step.id),
        retryCount: step.retryCount || 0
      };

      result.metrics = metrics;
      result.completedAt = new Date();

      // Emit step completed event
      this.emit('step:completed', {
        stepId: step.id,
        operationId: context.operationId,
        result,
        timestamp: new Date()
      });

      return result;
    } catch (error) {
      this.clearStepTimeout(step.id);
      
      // Handle retry logic
      if (step.retryPolicy && (step.retryCount || 0) < step.retryPolicy.maxRetries) {
        return await this.retryStep(step, context, error);
      }

      // Emit step failed event
      this.emit('step:failed', {
        stepId: step.id,
        operationId: context.operationId,
        error: error.message,
        timestamp: new Date()
      });

      throw error;
    } finally {
      this.activeSteps.delete(step.id);
    }
  }

  private async executeAgentAction(
    step: ExecutionStep,
    context: StepExecutionContext
  ): Promise<StepResult> {
    const params = this.resolveParameters(step.parameters, context);
    
    const result = await this.stepExecutorService.executeAgentAction({
      agentId: step.agentId!,
      action: step.action!,
      parameters: params,
      context: context.globalContext
    });

    return {
      stepId: step.id,
      status: StepStatus.COMPLETED,
      output: result,
      startedAt: new Date()
    };
  }

  private async executeToolExecution(
    step: ExecutionStep,
    context: StepExecutionContext
  ): Promise<StepResult> {
    const input = this.resolveParameters(step.input, context);
    
    const result = await this.stepExecutorService.executeTool({
      toolId: step.toolId!,
      input,
      context: context.globalContext
    });

    return {
      stepId: step.id,
      status: StepStatus.COMPLETED,
      output: result,
      startedAt: new Date()
    };
  }

  private async executeConditional(
    step: ExecutionStep,
    context: StepExecutionContext
  ): Promise<StepResult> {
    const condition = this.evaluateCondition(step.condition!, context);
    const branch = condition ? step.trueBranch : step.falseBranch;

    return {
      stepId: step.id,
      status: StepStatus.COMPLETED,
      output: {
        conditionResult: condition,
        selectedBranch: condition ? 'true' : 'false',
        nextSteps: branch || []
      },
      startedAt: new Date()
    };
  }

  private async executeParallel(
    step: ExecutionStep,
    context: StepExecutionContext
  ): Promise<StepResult> {
    const policy = step.policy || ParallelExecutionPolicy.ALL_SUCCESS;
    const branches = step.branches || [];
    
    const branchPromises = branches.map(async (branch, index) => {
      try {
        // Execute branch steps sequentially
        let lastResult: any = null;
        for (const stepId of branch) {
          // This would need to be implemented to execute sub-steps
          lastResult = { stepId, success: true };
        }
        return { branch: index, success: true, result: lastResult };
      } catch (error) {
        return { branch: index, success: false, error: error.message };
      }
    });

    const results = await Promise.allSettled(branchPromises);
    const successCount = results.filter(r => 
      r.status === 'fulfilled' && r.value.success
    ).length;

    let overallSuccess = false;
    switch (policy) {
      case ParallelExecutionPolicy.ALL_SUCCESS:
        overallSuccess = successCount === branches.length;
        break;
      case ParallelExecutionPolicy.ANY_SUCCESS:
        overallSuccess = successCount > 0;
        break;
      case ParallelExecutionPolicy.BEST_EFFORT:
        overallSuccess = true;
        break;
    }

    if (!overallSuccess) {
      throw new OperationError('Parallel execution failed per policy', 'EXECUTION_ERROR');
    }

    return {
      stepId: step.id,
      status: StepStatus.COMPLETED,
      output: {
        branchResults: results,
        successCount,
        totalBranches: branches.length,
        policy
      },
      startedAt: new Date()
    };
  }

  private async retryStep(
    step: ExecutionStep,
    context: StepExecutionContext,
    error: any
  ): Promise<StepResult> {
    step.retryCount = (step.retryCount || 0) + 1;
    const backoff = this.calculateBackoff(step);

    logger.warn(`Retrying step ${step.id}`, {
      attempt: step.retryCount,
      maxRetries: step.retryPolicy!.maxRetries,
      backoffMs: backoff,
      error: error.message
    });

    // Wait for backoff period
    await new Promise(resolve => setTimeout(resolve, backoff));

    // Retry execution
    return this.executeStep(step, context);
  }

  private calculateBackoff(step: ExecutionStep): number {
    const baseDelay = 1000; // 1 second
    const multiplier = step.retryPolicy?.backoffMultiplier || 2;
    const attempt = step.retryCount || 1;
    return baseDelay * Math.pow(multiplier, attempt - 1);
  }

  private setStepTimeout(step: ExecutionStep, context: StepExecutionContext): void {
    const timeout = setTimeout(() => {
      this.emit('step:timeout', {
        stepId: step.id,
        operationId: context.operationId,
        timeout: step.timeout
      });

      // Force fail the step
      this.activeSteps.delete(step.id);
    }, step.timeout!);

    this.stepTimeouts.set(step.id, timeout);
  }

  private clearStepTimeout(stepId: string): void {
    const timeout = this.stepTimeouts.get(stepId);
    if (timeout) {
      clearTimeout(timeout);
      this.stepTimeouts.delete(stepId);
    }
  }

  private async checkResources(step: ExecutionStep): Promise<void> {
    const required = step.resourceRequirements;
    if (!required) return;

    const available = await this.resourceManagerService.checkAvailability(required);
    if (!available) {
      throw new OperationError('Insufficient resources for step execution', 'RESOURCE_ERROR');
    }
  }

  private async getResourceUsage(stepId: string): Promise<ResourceUsage> {
    return this.resourceManagerService.getUsage(stepId);
  }

  private resolveParameters(params: any, context: StepExecutionContext): any {
    if (!params) return params;

    // Handle parameter resolution from previous step results
    if (typeof params === 'string' && params.startsWith('$.')) {
      const path = params.substring(2);
      const [stepId, ...propertyPath] = path.split('.');
      const stepResult = context.previousResults.get(stepId);
      
      if (stepResult?.output) {
        return this.getNestedProperty(stepResult.output, propertyPath);
      }
    }

    // Recursively resolve nested parameters
    if (typeof params === 'object') {
      const resolved: any = Array.isArray(params) ? [] : {};
      for (const [key, value] of Object.entries(params)) {
        resolved[key] = this.resolveParameters(value, context);
      }
      return resolved;
    }

    return params;
  }

  private getNestedProperty(obj: any, path: string[]): any {
    return path.reduce((current, prop) => current?.[prop], obj);
  }

  private evaluateCondition(condition: string, context: StepExecutionContext): boolean {
    // Simple condition evaluation - in production this would be more sophisticated
    try {
      // Create a safe evaluation context
      const evalContext = {
        ...context.globalContext,
        results: Object.fromEntries(context.previousResults)
      };

      // This is a simplified example - in production use a proper expression evaluator
      const func = new Function('context', `return ${condition}`);
      return func(evalContext);
    } catch (error) {
      logger.error(`Failed to evaluate condition: ${condition}`, error);
      return false;
    }
  }

  public cleanup(): void {
    // Clear all timeouts
    for (const timeout of this.stepTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.stepTimeouts.clear();
    this.activeSteps.clear();
  }
}