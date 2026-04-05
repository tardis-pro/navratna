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
  ParallelExecutionPolicy,
} from '@uaip/types';
import { logger, ValidationError } from '@uaip/utils';
import { StepExecutorService, ResourceManagerService } from '@uaip/shared-services';

export interface StepExecutionContext {
  operationId: string;
  workflowInstanceId: string;
  previousResults: Map<string, StepResult>;
  globalContext: Record<string, unknown>;
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

  async executeStep(step: ExecutionStep, context: StepExecutionContext): Promise<StepResult> {
    const startTime = Date.now();
    this.activeSteps.set(step.id, step);

    try {
      // Emit step started event
      this.emit('step:started', {
        stepId: step.id,
        operationId: context.operationId,
        timestamp: new Date(),
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
        case 'approval':
          result = await this.executeApproval(step, context);
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
        retryCount: step.retryCount || 0,
      };

      result.metrics = metrics;
      result.completedAt = new Date();

      // Emit step completed event
      this.emit('step:completed', {
        stepId: step.id,
        operationId: context.operationId,
        result,
        timestamp: new Date(),
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
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
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
    const params = this.toRecord(this.resolveParameters(step.parameters, context));

    const result = await this.stepExecutorService.executeAgentAction(
      step,
      params,
      new AbortController().signal
    );

    return {
      stepId: step.id,
      status: StepStatus.COMPLETED,
      output: result,
      startedAt: new Date(),
    };
  }

  private async executeToolExecution(
    step: ExecutionStep,
    context: StepExecutionContext
  ): Promise<StepResult> {
    const input = this.toRecord(this.resolveParameters(step.input, context));

    const result = await this.stepExecutorService.executeTool(
      step,
      input,
      new AbortController().signal
    );

    return {
      stepId: step.id,
      status: StepStatus.COMPLETED,
      output: result,
      startedAt: new Date(),
    };
  }

  private async executeApproval(
    step: ExecutionStep,
    context: StepExecutionContext
  ): Promise<StepResult> {
    const input = this.toRecord(this.resolveParameters(step.input, context));

    const result = await this.stepExecutorService.executeApprovalStep(
      step,
      input,
      new AbortController().signal
    );

    return {
      stepId: step.id,
      status: StepStatus.COMPLETED,
      output: result,
      startedAt: new Date(),
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
        nextSteps: branch || [],
      },
      startedAt: new Date(),
    };
  }

  private async executeParallel(
    step: ExecutionStep,
    _context: StepExecutionContext
  ): Promise<StepResult> {
    const policy = step.policy || ParallelExecutionPolicy.ALL_SUCCESS;
    const branches = step.branches || [];

    const branchPromises = branches.map(async (branch, index) => {
      try {
        // Execute branch steps sequentially
        let lastResult: { stepId: string; success: boolean } | null = null;
        for (const stepId of branch) {
          // This would need to be implemented to execute sub-steps
          lastResult = { stepId, success: true };
        }
        return { branch: index, success: true, result: lastResult };
      } catch (error) {
        return {
          branch: index,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const results = await Promise.allSettled(branchPromises);
    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;

    let overallSuccess = false;
    const policyValue = typeof policy === 'string' ? policy : policy.policy;
    switch (policyValue) {
      case ParallelExecutionPolicy.ALL_SUCCESS:
        overallSuccess = successCount === branches.length;
        break;
      case ParallelExecutionPolicy.ANY_SUCCESS:
        overallSuccess = successCount > 0;
        break;
      case ParallelExecutionPolicy.MAJORITY_SUCCESS:
        overallSuccess = successCount > branches.length / 2;
        break;
      default:
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
        policy,
      },
      startedAt: new Date(),
    };
  }

  private async retryStep(
    step: ExecutionStep,
    context: StepExecutionContext,
    error: unknown
  ): Promise<StepResult> {
    step.retryCount = (step.retryCount || 0) + 1;
    const backoff = this.calculateBackoff(step);

    logger.warn(`Retrying step ${step.id}`, {
      attempt: step.retryCount,
      maxRetries: step.retryPolicy!.maxRetries,
      backoffMs: backoff,
      error: error instanceof Error ? error.message : String(error),
    });

    // Wait for backoff period
    await new Promise((resolve) => setTimeout(resolve, backoff));

    // Retry execution
    return this.executeStep(step, context);
  }

  private calculateBackoff(step: ExecutionStep): number {
    const baseDelay = 1000; // 1 second
    const multiplier = (step.retryPolicy?.backoffMultiplier as number) || 2;
    const attempt = step.retryCount || 1;
    return baseDelay * Math.pow(multiplier, attempt - 1);
  }

  private setStepTimeout(step: ExecutionStep, context: StepExecutionContext): void {
    const timeout = setTimeout(() => {
      this.emit('step:timeout', {
        stepId: step.id,
        operationId: context.operationId,
        timeout: step.timeout,
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

    // Convert to ResourceLimits format
    const resourceLimits = {
      maxMemory: required.memory || 1024 * 1024 * 1024, // 1GB default
      maxCpu: required.cpu || 1, // 1 core default
      maxDuration: required.estimatedDuration || 3600000, // 1 hour default
    };

    const available = await this.resourceManagerService.checkAvailability(resourceLimits);
    if (!available.available) {
      throw new OperationError('Insufficient resources for step execution', 'RESOURCE_ERROR');
    }
  }

  private async getResourceUsage(_stepId: string): Promise<import('@uaip/types').ResourceUsage> {
    return this.resourceManagerService.getUsage();
  }

  private resolveParameters(params: unknown, context: StepExecutionContext): unknown {
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
    if (Array.isArray(params)) {
      return params.map((value) => this.resolveParameters(value, context));
    }

    if (typeof params === 'object') {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params)) {
        resolved[key] = this.resolveParameters(value, context);
      }
      return resolved;
    }

    return params;
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }

    return {}
  }

  private getNestedProperty(obj: Record<string, unknown>, path: string[]): unknown {
    return path.reduce<unknown>(
      (current, prop) => (current as Record<string, unknown>)?.[prop],
      obj
    );
  }

  /**
   * Safely evaluate a workflow condition string without arbitrary code execution.
   *
   * Supported syntax:
   *   - Property access on context: `context.someKey`, `results.stepId.output`
   *   - Comparison operators: `===`, `!==`, `==`, `!=`, `>`, `>=`, `<`, `<=`
   *   - Literal values: `true`, `false`, `null`, quoted strings, numbers
   *   - Logical operators: `&&`, `||`
   *   - Negation: `!expr`
   *
   * Examples:
   *   "context.approved === true"
   *   "results.analysis.output.score >= 0.8"
   *   "context.env === 'production' && context.approved !== false"
   */
  private evaluateCondition(condition: string, context: StepExecutionContext): boolean {
    try {
      const evalContext: Record<string, unknown> = {
        ...context.globalContext,
        results: Object.fromEntries(context.previousResults),
      };

      return this.safeEvaluateExpression(condition.trim(), evalContext);
    } catch (error) {
      logger.error('Failed to evaluate condition safely', {
        condition,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private resolvePropertyPath(path: string, context: Record<string, unknown>): unknown {
    const segments = path.split('.');
    let current: unknown = context;

    for (const segment of segments) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private parseValueToken(token: string, context: Record<string, unknown>): unknown {
    const trimmed = token.trim();

    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (trimmed === 'undefined') return undefined;

    if (
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      return trimmed.slice(1, -1);
    }

    const num = Number(trimmed);
    if (!Number.isNaN(num) && trimmed.length > 0) return num;

    // Property path — validate against injection (safe chars only: letters, digits, dots, underscores)
    if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(trimmed)) {
      return this.resolvePropertyPath(trimmed, context);
    }

    throw new ValidationError(`Unsafe or unrecognised token in condition: "${trimmed}"`);
  }

  private safeEvaluateExpression(expr: string, context: Record<string, unknown>): boolean {
    const trimmed = expr.trim();

    const orParts = this.splitAtTopLevel(trimmed, '||');
    if (orParts.length > 1) {
      return orParts.some((part) => this.safeEvaluateExpression(part, context));
    }

    const andParts = this.splitAtTopLevel(trimmed, '&&');
    if (andParts.length > 1) {
      return andParts.every((part) => this.safeEvaluateExpression(part, context));
    }

    if (trimmed.startsWith('!') && !trimmed.startsWith('!=')) {
      const inner = trimmed.slice(1).trim();
      if (inner.startsWith('(') && inner.endsWith(')')) {
        return !this.safeEvaluateExpression(inner.slice(1, -1), context);
      }
      return !this.safeEvaluateExpression(inner, context);
    }

    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      return this.safeEvaluateExpression(trimmed.slice(1, -1), context);
    }

    const comparisonOps = ['===', '!==', '==', '!=', '>=', '<=', '>', '<'] as const;
    for (const op of comparisonOps) {
      const idx = trimmed.indexOf(op);
      if (idx !== -1) {
        const lhs = this.parseValueToken(trimmed.slice(0, idx), context);
        const rhs = this.parseValueToken(trimmed.slice(idx + op.length), context);
        return this.applyComparison(op, lhs, rhs);
      }
    }

    const val = this.parseValueToken(trimmed, context);
    return Boolean(val);
  }

  private splitAtTopLevel(expr: string, operator: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = 0;

    for (let i = 0; i < expr.length; i++) {
      if (expr[i] === '(') depth++;
      else if (expr[i] === ')') depth--;
      else if (depth === 0 && expr.slice(i, i + operator.length) === operator) {
        parts.push(expr.slice(current, i));
        i += operator.length - 1;
        current = i + 1;
      }
    }
    parts.push(expr.slice(current));

    return parts.length > 1 ? parts : [expr];
  }

  private applyComparison(op: string, lhs: unknown, rhs: unknown): boolean {
    switch (op) {
      case '===': return lhs === rhs;
      case '!==': return lhs !== rhs;
      case '==': return lhs == rhs;
      case '!=': return lhs != rhs;
      case '>': return (lhs as number) > (rhs as number);
      case '>=': return (lhs as number) >= (rhs as number);
      case '<': return (lhs as number) < (rhs as number);
      case '<=': return (lhs as number) <= (rhs as number);
      default: throw new ValidationError(`Unknown comparison operator: ${op}`);
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
