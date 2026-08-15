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
  ApprovalPendingError,
  StepMetrics,
} from '@uaip/types';
import type { ApprovalDecisionRecord } from '@uaip/types';
import { logger, ValidationError } from '@uaip/utils';
import { StepExecutorService, ResourceManagerService } from '@uaip/shared-services';

export interface StepExecutionContext {
  operationId: string;
  workflowInstanceId: string;
  previousResults: Map<string, StepResult>;
  globalContext: Record<string, unknown>;
  /**
   * Approval decisions resolved outside this process (security-gateway), keyed
   * by step id. Present only on a resume after a suspension.
   */
  approvalDecisions?: Record<string, ApprovalDecisionRecord>;
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
    if (!step.id) {
      throw new OperationError('Step missing id', 'EXECUTION_ERROR');
    }
    const startTime = Date.now();
    this.activeSteps.set(step.id, step);

    // One controller per step execution, handed to every executor below. It used
    // to be `new AbortController().signal` at each call site — a fresh controller
    // that nothing ever aborted, so the cancellation plumbing was wired to a dead
    // end and a timeout could not reach the running work.
    const controller = new AbortController();

    try {
      // Emit step started event
      this.emit('step:started', {
        stepId: step.id,
        operationId: context.operationId,
        timestamp: new Date(),
      });

      // Check resource availability
      await this.checkResources(step);

      // Execute based on step type
      const run = (async (): Promise<StepResult> => {
        switch (step.type) {
          case 'agent-action':
            return await this.executeAgentAction(step, context, controller.signal);
          case 'tool-execution':
            return await this.executeToolExecution(step, context, controller.signal);
          case 'approval':
            return await this.executeApproval(step, context, controller.signal);
          case 'conditional':
            return await this.executeConditional(step, context);
          case 'parallel':
            return await this.executeParallel(step, context);
          default:
            throw new OperationError(`Unknown step type: ${step.type}`, 'EXECUTION_ERROR');
        }
      })();

      // Race the work against the deadline. Previously setStepTimeout only emitted
      // 'step:timeout' and dropped the activeSteps entry — it never touched the
      // in-flight promise, so the step went on to resolve normally and was reported
      // COMPLETED while having been declared timed out.
      let result: StepResult;
      if (step.timeout) {
        result = await this.raceStepTimeout(run, step, context, controller);
      } else {
        result = await run;
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
      // Cancel any work still in flight on a failure path too, so a step that
      // throws does not leave its executor running unobserved.
      controller.abort();

      // Approval-pending is a control-flow signal (suspend + wait for external
      // decision), NOT a failure — never retried, never emitted as step:failed.
      if (error instanceof ApprovalPendingError) {
        throw error;
      }

      // Handle retry logic
      if (step.retryPolicy && step.retryPolicy.maxRetries !== undefined && (step.retryCount || 0) < step.retryPolicy.maxRetries) {
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
    context: StepExecutionContext,
    signal: AbortSignal
  ): Promise<StepResult> {
    const params = this.toRecord(this.resolveParameters(step.parameters, context));

    const result = await this.stepExecutorService.executeAgentAction(step, params, signal);

    return {
      stepId: step.id,
      status: StepStatus.COMPLETED,
      output: result,
      startedAt: new Date(),
    };
  }

  private async executeToolExecution(
    step: ExecutionStep,
    context: StepExecutionContext,
    signal: AbortSignal
  ): Promise<StepResult> {
    const input = this.toRecord(this.resolveParameters(step.input, context));

    const result = await this.stepExecutorService.executeTool(step, input, signal);

    return {
      stepId: step.id,
      status: StepStatus.COMPLETED,
      output: result,
      startedAt: new Date(),
    };
  }

  private async executeApproval(
    step: ExecutionStep,
    context: StepExecutionContext,
    signal: AbortSignal
  ): Promise<StepResult> {
    const input = this.toRecord(this.resolveParameters(step.input, context));

    // Merge the externally-resolved decision for THIS step only. An
    // `approved: true` with no attributed approver is never merged — the gate
    // in executeApprovalStep already refuses it, and we do not construct it.
    const decision = step.id ? context.approvalDecisions?.[step.id] : undefined;
    const decided =
      decision && !(decision.approved === true && !decision.approvedBy)
        ? { approved: decision.approved, approvedBy: decision.approvedBy }
        : {};

    const result = await this.stepExecutorService.executeApprovalStep(
      step,
      { ...input, ...decided },
      signal
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

  /**
   * NOT IMPLEMENTED — and it now says so instead of lying.
   *
   * What this used to do: iterate each branch's step ids in a loop whose entire
   * body was the comment "This would need to be implemented to execute
   * sub-steps", synthesise `{ stepId, success: true }` for each, and report
   * StepStatus.COMPLETED. Every branch "succeeded", so ALL_SUCCESS passed
   * trivially, and downstream steps read the fabricated `branchResults` through
   * `$.stepId.…` as if it were real output. A workflow could therefore complete
   * green having executed nothing at all.
   *
   * Implementing it for real needs a way to resolve a branch's step ids back to
   * ExecutionStep objects and run them — which this class cannot do, since it is
   * handed one step at a time and the step list lives in WorkflowOrchestrator.
   * Nothing in the codebase currently authors a 'parallel' step (only
   * operation_validator's schema admits one), so the resolver is deliberately
   * not built on speculation.
   *
   * Use `dependsOn` groups instead: WorkflowOrchestrator.determineExecutionOrder
   * does a real topological sort and runs each group concurrently, which is what
   * parallel branches were reaching for.
   */
  private async executeParallel(
    step: ExecutionStep,
    _context: StepExecutionContext
  ): Promise<StepResult> {
    const branches = step.branches || [];
    throw new OperationError(
      `Step '${step.id}' is type 'parallel', which is not implemented. ` +
        `It would have reported success for ${branches.length} branch(es) without executing any of them. ` +
        `Express concurrency with 'dependsOn' groups instead — steps in the same dependency ` +
        `group already run concurrently.`,
      'EXECUTION_ERROR'
    );
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

  /**
   * Backoff for the next retry, honouring the step's own retry policy.
   *
   * It previously hardcoded `baseDelay = 1000` and applied an exponential curve
   * unconditionally, so `retryDelay` and `backoffStrategy` — both settable on
   * ExecutionStep.retryPolicy, both defaulted and validated by the schema — were
   * accepted and ignored. A step asking for a fixed 5s retry got 1s, 2s, 4s.
   */
  private calculateBackoff(step: ExecutionStep): number {
    const policy = step.retryPolicy;
    const baseDelay = typeof policy?.retryDelay === 'number' ? policy.retryDelay : 1000;
    const multiplier = typeof policy?.backoffMultiplier === 'number' ? policy.backoffMultiplier : 2;
    const attempt = step.retryCount || 1;

    switch (policy?.backoffStrategy ?? 'exponential') {
      case 'fixed':
        return baseDelay;
      case 'linear':
        return baseDelay * attempt;
      case 'exponential':
      default:
        return baseDelay * Math.pow(multiplier, attempt - 1);
    }
  }

  /**
   * Runs `work` against the step's deadline.
   *
   * The version this replaces (setStepTimeout) emitted 'step:timeout', deleted the
   * activeSteps entry, and returned. It never touched the promise, so the step
   * kept running, resolved normally, and was recorded COMPLETED — a step could be
   * reported both timed out and successful, and the caller was told the second
   * one.
   *
   * On expiry this now aborts the shared controller AND rejects, so executeStep
   * takes the failure path. JavaScript cannot forcibly kill an in-flight promise;
   * what it can do is stop believing it, which is what the error says.
   */
  private async raceStepTimeout(
    work: Promise<StepResult>,
    step: ExecutionStep,
    context: StepExecutionContext,
    controller: AbortController
  ): Promise<StepResult> {
    const stepId = step.id!;
    const timeoutMs = step.timeout!;

    // Without this the losing promise rejects with no handler attached once the
    // timeout wins the race, which surfaces as an unhandled rejection.
    work.catch(() => undefined);

    return await new Promise<StepResult>((resolve, reject) => {
      const handle = setTimeout(() => {
        controller.abort();
        this.emit('step:timeout', {
          stepId,
          operationId: context.operationId,
          timeout: timeoutMs,
        });
        reject(
          new OperationError(
            `Step '${stepId}' exceeded its ${timeoutMs}ms timeout and was abandoned. ` +
              `The executor was signalled to abort; any work it had already dispatched may ` +
              `still be running.`,
            'TIMEOUT_ERROR'
          )
        );
      }, timeoutMs);

      this.stepTimeouts.set(stepId, handle);

      work.then(
        (result) => {
          this.clearStepTimeout(stepId);
          resolve(result);
        },
        (error: unknown) => {
          this.clearStepTimeout(stepId);
          reject(error);
        }
      );
    });
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
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = v;
      }
      return result;
    }

    return {}
  }

  private getNestedProperty(obj: Record<string, unknown>, path: string[]): unknown {
    return path.reduce<unknown>(
      (current, prop) => {
        if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined;
        const rec: Record<string, unknown> = Object.fromEntries(Object.entries(current));
        return rec[prop];
      },
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
      if (typeof current !== 'object' || Array.isArray(current)) return undefined;
      const rec: Record<string, unknown> = Object.fromEntries(Object.entries(current));
      current = rec[segment];
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
      case '>': return typeof lhs === 'number' && typeof rhs === 'number' && lhs > rhs;
      case '>=': return typeof lhs === 'number' && typeof rhs === 'number' && lhs >= rhs;
      case '<': return typeof lhs === 'number' && typeof rhs === 'number' && lhs < rhs;
      case '<=': return typeof lhs === 'number' && typeof rhs === 'number' && lhs <= rhs;
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
