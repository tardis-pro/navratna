/**
 * WorkflowExecutorService — the missing consumer of `workflow.definition.trigger`.
 *
 * WorkflowEngineService registers BullMQ repeatable (cron) jobs but nothing consumed the
 * fired jobs, so schedules fired into the void. This service consumes them and turns each
 * firing into an Operation (the user's model: an Operation is a composition of workflow
 * steps), running each step through the tool-execution seam:
 *
 *   bash      → tool.execute.request { toolId: 'shell-exec',   parameters: { command } }
 *   httpCall  → tool.execute.request { toolId: 'http-request', parameters: { method, url, ... } }
 *   agentTurn → agent-reason (persona + LLM)   [not yet wired — recorded as skipped]
 *
 * The tool.execute.request is answered by ToolExecutionCoordinator → UnifiedToolRegistry.
 * WHERE a shell step ultimately runs (gateway sandbox vs a registered exec-mesh node) is a
 * property of that executor, not of this service — which is why this stays runtime-agnostic.
 */

import { EventBusService, getControlDb } from '@uaip/shared-services';
import { eq } from '@uaip/shared-services/drizzle/clients';
import { workflowDefinitions } from '@uaip/shared-services/drizzle/control';
import { operations } from '@uaip/shared-services/drizzle/control';
import { logger } from '@uaip/utils';
import { OperationStatus } from '@uaip/types';
import { randomUUID } from 'crypto';

const WORKFLOW_QUEUE_EVENT = 'workflow.definition.trigger';
const SYSTEM_ID = '00000000-0000-0000-0000-000000000001';

interface WorkflowStep {
  type: 'bash' | 'agentTurn' | 'httpCall';
  id?: string;
  command?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  prompt?: string;
  agentId?: string;
  model?: string;
}

interface StepOutcome {
  stepId: string;
  type: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
}

export class WorkflowExecutorService {
  private listening = false;

  constructor(private readonly eventBus: EventBusService) {}

  async initialize(): Promise<void> {
    if (this.listening) return;
    await this.eventBus.subscribe(WORKFLOW_QUEUE_EVENT, async (message) => {
      const data = (message.data ?? {}) as { workflowDefinitionId?: string; workflowName?: string };
      if (!data.workflowDefinitionId) return;
      try {
        await this.runDefinition(data.workflowDefinitionId);
      } catch (error) {
        logger.error('Workflow execution failed', {
          workflowDefinitionId: data.workflowDefinitionId,
          error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        });
      }
    });
    this.listening = true;
    logger.info('WorkflowExecutorService listening on workflow.definition.trigger');
  }

  private async runDefinition(definitionId: string): Promise<void> {
    const db = getControlDb();
    const [definition] = await db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, definitionId))
      .limit(1);

    if (!definition) {
      logger.warn('Fired workflow definition not found', { definitionId });
      return;
    }

    const steps = (definition.steps ?? []) as WorkflowStep[];
    const agentId = definition.agentId || SYSTEM_ID;
    const operationId = randomUUID();
    const startedAt = new Date();

    // Record the run as an Operation — the composition instance for this firing.
    await db.insert(operations).values({
      id: operationId,
      type: 'hybrid_workflow',
      status: OperationStatus.RUNNING,
      agentId,
      userId: SYSTEM_ID,
      name: `workflow:${definition.name}`,
      description: definition.description ?? null,
      executionPlan: { steps } as unknown as Record<string, unknown>,
      context: { workflowDefinitionId: definitionId, sessionKey: definition.sessionKey },
      startedAt,
      totalSteps: steps.length,
      metadata: { source: 'workflow.definition.trigger', model: definition.model },
    });

    const outcomes: StepOutcome[] = [];
    let previousStdout = '';
    let failed = false;

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const stepId = step.id || `step-${i}`;
      // eslint-disable-next-line no-await-in-loop -- steps are sequential; later steps consume earlier stdout
      const outcome = await this.runStep(step, stepId, agentId, previousStdout);
      outcomes.push(outcome);

      // eslint-disable-next-line no-await-in-loop
      await db
        .update(operations)
        .set({ currentStep: i + 1, stepDetails: { outcomes } as unknown as Record<string, unknown> })
        .where(eq(operations.id, operationId));

      if (outcome.status === 'failed') {
        failed = true;
        break;
      }
      previousStdout = this.extractStdout(outcome.output);
    }

    await db
      .update(operations)
      .set({
        status: failed ? OperationStatus.FAILED : OperationStatus.COMPLETED,
        completedAt: new Date(),
        actualDuration: Date.now() - startedAt.getTime(),
        result: { outcomes } as unknown as Record<string, unknown>,
        error: failed ? outcomes.find((o) => o.status === 'failed')?.error ?? 'step failed' : null,
      })
      .where(eq(operations.id, operationId));

    if (!failed && definition.delivery) {
      await this.deliver(definition.delivery, outcomes, definition.name).catch((error) => {
        logger.warn('Workflow delivery failed', {
          definitionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    logger.info('Workflow execution finished', {
      definitionId,
      operationId,
      status: failed ? 'failed' : 'completed',
      steps: outcomes.length,
    });
  }

  private async runStep(
    step: WorkflowStep,
    stepId: string,
    agentId: string,
    previousStdout: string
  ): Promise<StepOutcome> {
    try {
      if (step.type === 'bash') {
        if (!step.command) throw new Error(`bash step "${stepId}" has no command`);
        const output = await this.runTool('shell-exec', { command: step.command, stdin: previousStdout }, agentId);
        return { stepId, type: step.type, status: 'completed', output };
      }

      if (step.type === 'httpCall') {
        if (!step.url) throw new Error(`httpCall step "${stepId}" has no url`);
        const output = await this.runTool(
          'http-request',
          { method: step.method ?? 'GET', url: step.url, headers: step.headers, body: step.body },
          agentId
        );
        return { stepId, type: step.type, status: 'completed', output };
      }

      if (step.type === 'agentTurn') {
        // Persona + LLM reasoning step. The agent-reason execution path is not yet wired
        // (executeAgentAction is still simulated), so record it as skipped rather than
        // fabricate output. This is the next foundation piece.
        logger.warn('agentTurn step skipped — persona/LLM execution not yet wired', { stepId });
        return {
          stepId,
          type: step.type,
          status: 'skipped',
          error: 'agentTurn execution not yet wired (persona + LLM)',
        };
      }

      return { stepId, type: step.type, status: 'failed', error: `unknown step type: ${step.type}` };
    } catch (error) {
      return {
        stepId,
        type: step.type,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async runTool(
    toolId: string,
    parameters: Record<string, unknown>,
    agentId: string
  ): Promise<unknown> {
    const requestId = randomUUID();
    const response = await this.eventBus.publishAndWaitForResponse<{
      status?: string;
      result?: unknown;
      error?: string;
    }>(
      'tool.execute.request',
      { requestId, toolId, agentId, parameters, securityContext: { userId: SYSTEM_ID, agentId } },
      120000
    );
    if (response && response.status === 'ERROR') {
      throw new Error(response.error || `Tool ${toolId} failed`);
    }
    return response?.result ?? response;
  }

  private extractStdout(output: unknown): string {
    if (output && typeof output === 'object') {
      const rec = output as Record<string, unknown>;
      if (typeof rec.stdout === 'string') return rec.stdout;
      if (typeof rec.output === 'string') return rec.output;
    }
    return typeof output === 'string' ? output : '';
  }

  private async deliver(
    delivery: { type: string; target: string },
    outcomes: StepOutcome[],
    workflowName: string
  ): Promise<void> {
    const summary = `Workflow ${workflowName} completed: ${outcomes
      .map((o) => `${o.stepId}=${o.status}`)
      .join(', ')}`;

    if (delivery.type === 'webhook') {
      await this.runTool('http-request', {
        method: 'POST',
        url: delivery.target,
        headers: { 'Content-Type': 'application/json' },
        body: { workflow: workflowName, outcomes, summary },
      }, SYSTEM_ID);
      return;
    }

    // email / slack delivery route through their own tools once registered; log until then.
    logger.info('Workflow delivery (not yet wired for this channel)', {
      channel: delivery.type,
      target: delivery.target,
      summary,
    });
  }
}
