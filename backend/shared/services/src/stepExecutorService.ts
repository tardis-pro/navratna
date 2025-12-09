import { EventEmitter } from 'events';
import {
  ExecutionStep,
  StepStatus,
  StepExecutionResult,
  StepType,
  RetryPolicy,
  ValidationStep,
  WorkflowInstance,
  ExecutionContext,
  OperationError,
} from '@uaip/types';
import { logger } from '@uaip/utils';

export interface StepExecutionContext {
  operationId: string;
  stepId: string;
  variables: Record<string, any>;
  metadata: Record<string, any>;
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  data: Record<string, any>;
  error?: string;
  executionTime: number;
  metadata: {
    startedAt: Date;
    completedAt?: Date;
    failedAt?: Date;
    retryCount: number;
  };
}

export interface OperationContext {
  executionContext: ExecutionContext;
  conversationId?: string;
  sessionId?: string;
  userRequest?: string;
  environment?: string;
  constraints?: Record<string, any>;
}

export class StepExecutorService extends EventEmitter {
  private activeSteps = new Map<string, { step: ExecutionStep; controller: AbortController }>();

  constructor() {
    super();
  }

  /**
   * Execute a step with the given variables and context
   */
  public async executeStep(
    step: ExecutionStep,
    variables: Record<string, any>,
    context: OperationContext
  ): Promise<StepResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    const stepKey = `${context.executionContext.agentId || 'unknown'}:${step.id}`;

    // Store active step for potential cancellation
    this.activeSteps.set(stepKey, { step, controller });

    try {
      logger.info('Executing step', {
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
      });

      // Prepare step input using input mapping
      const stepInput = this.prepareStepInput(step, variables);

      // Execute based on step type
      let stepData: Record<string, any> = {};

      switch (step.type) {
        case 'tool':
          stepData = await this.executeToolStep(step, stepInput, controller.signal);
          break;
        case 'artifact':
          stepData = await this.executeArtifactStep(step, stepInput, controller.signal);
          break;
        case 'validation':
          stepData = await this.executeValidationStep(step, stepInput, controller.signal);
          break;
        case 'approval':
          stepData = await this.executeApprovalStep(step, stepInput, controller.signal);
          break;
        case 'delay':
          stepData = await this.executeDelayStep(step, stepInput, controller.signal);
          break;
        case 'decision':
          stepData = await this.executeDecisionStep(step, stepInput, controller.signal);
          break;
        case 'agent-action':
          stepData = await this.executeAgentAction(step, stepInput, controller.signal);
          break;
        case 'tool-execution':
          stepData = await this.executeTool(step, stepInput, controller.signal);
          break;
        case 'conditional':
          stepData = await this.executeConditionalStep(step, stepInput, controller.signal);
          break;
        case 'parallel':
          stepData = await this.executeParallelStep(step, stepInput, controller.signal);
          break;
        default:
          throw new Error(`Unsupported step type: ${step.type}`);
      }

      const result: StepResult = {
        stepId: step.id || Date.now().toString(),
        status: StepStatus.COMPLETED,
        data: stepData,
        executionTime: Date.now() - startTime,
        metadata: {
          startedAt: new Date(startTime),
          completedAt: new Date(),
          retryCount: step.metadata?.retryCount,
        },
      };

      logger.info('Step executed successfully', {
        stepId: step.id,
        executionTime: result.executionTime,
      });

      return result;
    } catch (error) {
      const result: StepResult = {
        stepId: step.id || Date.now().toString(),
        status: StepStatus.FAILED,
        data: {},
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
        metadata: {
          startedAt: new Date(startTime),
          failedAt: new Date(),
          retryCount: step.metadata?.retryCount,
        },
      };

      logger.error('Step execution failed', {
        stepId: step.id,
        error: result.error,
        executionTime: result.executionTime,
      });

      return result;
    } finally {
      // Clean up active step
      this.activeSteps.delete(stepKey);
    }
  }

  /**
   * Cancel a specific step
   */
  public async cancelStep(operationId: string, stepId: string, reason: string): Promise<void> {
    const stepKey = `${operationId}:${stepId}`;
    const activeStep = this.activeSteps.get(stepKey);

    if (activeStep) {
      logger.info('Cancelling step', { operationId, stepId, reason });
      activeStep.controller.abort();
      this.activeSteps.delete(stepKey);
    }
  }

  /**
   * Force stop a step (for emergency shutdown)
   */
  public async forceStopStep(operationId: string): Promise<void> {
    const stepsToStop = Array.from(this.activeSteps.entries()).filter(([key]) =>
      key.startsWith(`${operationId}:`)
    );

    for (const [key, { controller }] of stepsToStop) {
      controller.abort();
      this.activeSteps.delete(key);
    }

    logger.info('Force stopped all steps for operation', {
      operationId,
      stoppedSteps: stepsToStop.length,
    });
  }

  /**F
   * Private helper methods
   */

  private prepareStepInput(
    step: ExecutionStep,
    variables: Record<string, any>
  ): Record<string, any> {
    const input: Record<string, any> = { ...step.input };

    // Apply input mapping
    // TODO: Fix TypeScript errors
    /*
    if (step.inputMapping) {
      for (const [stepInputKey, variableName] of Object.entries(step.inputMapping)) {
        if (variables[variableName] !== undefined) {
          input[stepInputKey] = variables[variableName];
        }
      }
    }
    */

    return input;
  }

  private async executeToolStep(
    step: ExecutionStep,
    input: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    // Simulate tool execution
    await this.delay(Math.random() * 2000 + 1000, signal); // 1-3 seconds

    return {
      toolResult: `Tool ${step.name} executed successfully`,
      toolOutput: input,
      executedAt: new Date().toISOString(),
    };
  }

  private async executeArtifactStep(
    step: ExecutionStep,
    input: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    // Simulate artifact generation
    await this.delay(Math.random() * 3000 + 2000, signal); // 2-5 seconds

    return {
      artifactId: Date.now().toString(), // Use timestamp as simple numeric ID
      artifactType: input.artifactType || 'document',
      artifactContent: `Generated artifact for ${step.name}`,
      createdAt: new Date().toISOString(),
    };
  }

  private async executeValidationStep(
    step: ExecutionStep,
    input: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    // Simulate validation
    await this.delay(Math.random() * 1000 + 500, signal); // 0.5-1.5 seconds

    const isValid = Math.random() > 0.1; // 90% success rate

    return {
      isValid,
      validationResult: isValid ? 'passed' : 'failed',
      validationDetails: input,
      validatedAt: new Date().toISOString(),
    };
  }

  private async executeApprovalStep(
    step: ExecutionStep,
    input: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    // Simulate approval (in real implementation, this would wait for user input)
    await this.delay(Math.random() * 5000 + 3000, signal); // 3-8 seconds

    const approved = Math.random() > 0.2; // 80% approval rate

    return {
      approved,
      approvalResult: approved ? 'approved' : 'rejected',
      approvedBy: 'system', // In real implementation, this would be the actual approver
      approvedAt: new Date().toISOString(),
    };
  }

  private async executeDelayStep(
    step: ExecutionStep,
    input: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    const delayMs = input.delayMs || 1000;
    await this.delay(delayMs, signal);

    return {
      delayMs,
      delayedUntil: new Date().toISOString(),
    };
  }

  private async executeDecisionStep(
    step: ExecutionStep,
    input: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    // Simulate decision making
    await this.delay(Math.random() * 1500 + 500, signal); // 0.5-2 seconds

    const condition = input.condition || 'true';
    const result = this.evaluateCondition(condition, input);

    return {
      condition,
      result,
      decidedAt: new Date().toISOString(),
    };
  }

  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      const abortHandler = () => {
        clearTimeout(timeout);
        reject(new Error('Step execution was cancelled'));
      };

      signal.addEventListener('abort', abortHandler);

      setTimeout(() => {
        signal.removeEventListener('abort', abortHandler);
      }, ms);
    });
  }

  // Add missing methods
  public async executeAgentAction(
    step: ExecutionStep,
    input: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    await this.delay(Math.random() * 2000 + 1000, signal);

    return {
      agentId: step.agentId || 'unknown',
      action: step.action || 'unknown',
      actionResult: `Agent action ${step.action} executed`,
      executedAt: new Date().toISOString(),
    };
  }

  public async executeTool(
    step: ExecutionStep,
    input: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    await this.delay(Math.random() * 1500 + 500, signal);

    return {
      toolId: step.toolId || 'unknown',
      toolResult: `Tool ${step.toolId} executed successfully`,
      toolOutput: input,
      executedAt: new Date().toISOString(),
    };
  }

  private async executeConditionalStep(
    step: ExecutionStep,
    input: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    await this.delay(Math.random() * 500 + 200, signal);

    const condition = input.condition || step.condition;
    const result = this.evaluateCondition(condition, input);

    return {
      condition,
      result,
      trueBranch: step.trueBranch || [],
      falseBranch: step.falseBranch || [],
      branchTaken: result ? 'true' : 'false',
      executedAt: new Date().toISOString(),
    };
  }

  private async executeParallelStep(
    step: ExecutionStep,
    input: Record<string, any>,
    signal: AbortSignal
  ): Promise<Record<string, any>> {
    await this.delay(Math.random() * 1000 + 500, signal);

    const policy = step.policy || { policy: 'all_success' };
    const branches = step.branches || [];

    return {
      policy,
      branches,
      parallelResults: branches.map(() => ({ status: 'completed', result: 'success' })),
      executedAt: new Date().toISOString(),
    };
  }

  private evaluateCondition(condition: string, input: Record<string, any>): boolean {
    // Simple condition evaluation - in production, use a proper expression evaluator
    try {
      // For safety, only allow simple true/false conditions for now
      if (condition === 'true') return true;
      if (condition === 'false') return false;

      // You could extend this to support more complex conditions
      return Math.random() > 0.5; // Random decision for demo
    } catch (error) {
      logger.warn('Failed to evaluate condition', { condition, error });
      return false;
    }
  }
}
