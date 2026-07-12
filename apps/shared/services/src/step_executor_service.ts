import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  ExecutionStep,
  StepStatus,
  StepExecutionResult as _StepExecutionResult,
  StepType as _StepType,
  RetryPolicy as _RetryPolicy,
  ValidationStep as _ValidationStep,
  WorkflowInstance as _WorkflowInstance,
  ExecutionContext,
  OperationError as _OperationError,
} from '@uaip/types';
import { logger } from '@uaip/utils';
import { EventBusService } from './event_bus_service';
import { delayWithAbort } from './utils/async_helpers';

export interface StepExecutionContext {
  operationId: string;
  stepId: string;
  variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  data: Record<string, unknown>;
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
  constraints?: Record<string, unknown>;
}

export class StepExecutorService extends EventEmitter {
  private activeSteps = new Map<string, { step: ExecutionStep; controller: AbortController }>();

  /**
   * Execute a step with the given variables and context
   */
  public async executeStep(
    step: ExecutionStep,
    variables: Record<string, unknown>,
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
      let stepData: Record<string, unknown> = {};

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
    _variables: Record<string, unknown>
  ): Record<string, unknown> {
    const input: Record<string, unknown> = { ...step.input };

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

  /**
   * Dispatch a real tool execution over the event bus to the ToolExecutionCoordinator
   * (capability-registry), which runs it via UnifiedToolRegistry (MCP / shell sandbox /
   * OAuth adapters). Blocks on the RPC reply. This is what makes a workflow step actually
   * DO something instead of returning a fabricated success string.
   */
  private async runToolViaCoordinator(
    toolId: string,
    parameters: Record<string, unknown>,
    agentId: string,
    timeoutMs: number
  ): Promise<unknown> {
    const eventBus = EventBusService.getInstance();
    const requestId = randomUUID();
    const response = await eventBus.publishAndWaitForResponse<{
      status?: string;
      result?: unknown;
      error?: string;
    }>(
      'tool.execute.request',
      { requestId, toolId, agentId, parameters, securityContext: { userId: agentId, agentId } },
      timeoutMs
    );

    if (response && response.status === 'ERROR') {
      throw new Error(response.error || `Tool ${toolId} execution failed`);
    }
    return response?.result ?? response;
  }

  private async executeToolStep(
    step: ExecutionStep,
    input: Record<string, unknown>,
    _signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    const startTime = Date.now();
    const toolId = step.toolId || (step.metadata?.toolId as string | undefined);
    if (!toolId) {
      throw new Error(`Tool step "${step.name}" has no toolId to execute`);
    }

    const agentId = (step.agentId as string) || 'system';
    const parameters = { ...input, ...(step.parameters ?? {}) };
    let result: unknown;
    let success = true;
    try {
      result = await this.runToolViaCoordinator(toolId, parameters, agentId, step.timeout ?? 60000);
    } catch (error) {
      success = false;
      throw error;
    } finally {
      // Audit logging for tool execution
      try {
        const eventBus = EventBusService.getInstance();
        await eventBus.publish(
          'tool.executed',
          {
            toolId,
            toolName: step.name,
            executionTime: Date.now() - startTime,
            success,
            parameters,
            stepId: step.id,
          },
          {
            correlationId: step.metadata?.correlationId,
          }
        );
      } catch (auditError) {
        logger.warn('Failed to publish tool execution audit event', {
          toolName: step.name,
          error: auditError instanceof Error ? auditError.message : 'Unknown error',
        });
      }
    }

    return {
      toolId,
      toolResult: result,
      executedAt: new Date().toISOString(),
    };
  }

  private async executeArtifactStep(
    step: ExecutionStep,
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
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
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
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

  public async executeApprovalStep(
    step: ExecutionStep,
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
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
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    const delayMs = typeof input.delayMs === 'number' ? input.delayMs : 1000;
    await this.delay(delayMs, signal);

    return {
      delayMs,
      delayedUntil: new Date().toISOString(),
    };
  }

  private async executeDecisionStep(
    step: ExecutionStep,
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    // Simulate decision making
    await this.delay(Math.random() * 1500 + 500, signal); // 0.5-2 seconds

    const condition = typeof input.condition === 'string' ? input.condition : 'true';
    const result = this.evaluateCondition(condition, input);

    return {
      condition,
      result,
      decidedAt: new Date().toISOString(),
    };
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return delayWithAbort(ms, signal, 'Step execution was cancelled');
  }

  /**
   * Dispatch a real agent-reasoning turn over the event bus to the llm-service
   * (navratna-core), which resolves the persona's systemPrompt and calls the LLM.
   * Blocks on the RPC reply. This is what makes an `agent-action` step actually
   * reason via a persona + LLM instead of returning a fabricated string.
   *
   * llm-service lives in a feature package that DEPENDS ON shared-services, so it
   * cannot be imported here (backward dependency). We go over the bus, mirroring
   * runToolViaCoordinator. The responder lives in
   * apps/backend/services/llm-service/src/feature.ts ('llm.step.generate.request').
   */
  private async runAgentViaLLM(
    request: { agentId?: string; prompt: string; systemPrompt?: string; model?: string },
    timeoutMs: number
  ): Promise<{ content: string; model?: string }> {
    const eventBus = EventBusService.getInstance();
    const requestId = randomUUID();
    const response = await eventBus.publishAndWaitForResponse<{
      content?: string;
      model?: string;
      error?: string;
    }>('llm.step.generate.request', { requestId, ...request }, timeoutMs);

    if (!response || typeof response.content !== 'string') {
      throw new Error(response?.error || 'Agent action returned no content from the LLM');
    }
    return { content: response.content, model: response.model };
  }

  public async executeAgentAction(
    step: ExecutionStep,
    input: Record<string, unknown>,
    _signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    const params = step.parameters ?? {};
    const prompt =
      (typeof params.prompt === 'string' && params.prompt ? params.prompt : undefined) ??
      (typeof input.prompt === 'string' && input.prompt ? input.prompt : undefined) ??
      (typeof step.action === 'string' && step.action ? step.action : undefined);

    if (!prompt) {
      throw new Error(`Agent-action step "${step.name}" has no prompt to send to the LLM`);
    }

    const agentId = (step.agentId as string) || undefined;
    const model = typeof params.model === 'string' ? params.model : undefined;
    const systemPrompt = typeof params.systemPrompt === 'string' ? params.systemPrompt : undefined;

    const result = await this.runAgentViaLLM(
      { agentId, prompt, systemPrompt, model },
      step.timeout ?? 60000
    );

    return {
      agentId: agentId || 'unknown',
      action: step.action || 'agent-action',
      actionResult: result.content,
      model: result.model,
      executedAt: new Date().toISOString(),
    };
  }

  public async executeTool(
    step: ExecutionStep,
    input: Record<string, unknown>,
    _signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    const toolId = step.toolId || (step.metadata?.toolId as string | undefined);
    if (!toolId) {
      throw new Error(`Tool-execution step "${step.name}" has no toolId to execute`);
    }

    const agentId = (step.agentId as string) || 'system';
    const parameters = { ...input, ...(step.parameters ?? {}) };
    const result = await this.runToolViaCoordinator(
      toolId,
      parameters,
      agentId,
      step.timeout ?? 60000
    );

    return {
      toolId,
      toolResult: result,
      executedAt: new Date().toISOString(),
    };
  }

  private async executeConditionalStep(
    step: ExecutionStep,
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    await this.delay(Math.random() * 500 + 200, signal);

    const condition =
      typeof input.condition === 'string'
        ? input.condition
        : typeof step.condition === 'string'
          ? step.condition
          : 'true';
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
    input: Record<string, unknown>,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
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

  private evaluateCondition(condition: string, _input: Record<string, unknown>): boolean {
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
