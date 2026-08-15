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
 *   toolCall  → tool.execute.request { toolId: <any registered tool>, parameters: step.arguments }
 *   agentTurn → agent-reason (persona + LLM)   [not yet wired — recorded as skipped]
 *
 * The tool.execute.request is answered by ToolExecutionCoordinator → UnifiedToolRegistry.
 * WHERE a shell step ultimately runs (gateway sandbox vs a registered exec-mesh node) is a
 * property of that executor, not of this service — which is why this stays runtime-agnostic.
 *
 * IDENTITY IS PUBLISHED AT THE TOP LEVEL of the event, not only inside
 * securityContext. ToolExecutionCoordinator.toToolExecutionEvent() passes the payload
 * through as-is and then reads event.userId / event.agentId / event.projectId; a userId
 * nested inside securityContext was never seen, so every call arrived with userId ''.
 * That is invisible to shell-exec and http-request, which are not project-scoped, and
 * fatal to any `mcp-*` tool, which UnifiedToolRegistry refuses without a full
 * (user, agent, project) identity. `toolCall` exists to reach those tools, so it could
 * not work until the identity did.
 *
 * The project scope comes from the definition row, never from the step: a step that
 * could name its own project would let anyone with write access to a definition read
 * another project's data through a capability bound to it.
 */

import {
  EventBusService,
  getControlDb,
  OperationRepository,
  SYSTEM_AGENT_ID,
  SYSTEM_USER_ID,
} from '@uaip/shared-services';
import { eq } from '@uaip/shared-services/drizzle/clients';
import { workflowDefinitions } from '@uaip/shared-services/drizzle/control';
import { operations } from '@uaip/shared-services/drizzle/control';
import { logger } from '@uaip/utils';
import { OperationStatus } from '@uaip/types';
import { randomUUID } from 'crypto';

const WORKFLOW_QUEUE_EVENT = 'workflow.definition.trigger';

/** Per-step ceiling on evidence pasted into a reasoning step's prompt. */
const EVIDENCE_CHARS_PER_STEP = 4000;

interface WorkflowStep {
  type: 'bash' | 'agentTurn' | 'httpCall' | 'toolCall';
  id?: string;
  command?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  prompt?: string;
  agentId?: string;
  model?: string;
  /** `toolCall` only: any tool id the registry resolves, including `mcp-<server>-<tool>`. */
  toolId?: string;
  /** `toolCall` only: the tool's own arguments, passed through untouched. */
  arguments?: Record<string, unknown>;
}

/**
 * Who a run acts as. Assembled once per run from the definition row and passed
 * down, so no step can widen it.
 */
interface RunScope {
  userId: string;
  agentId: string;
  projectId?: string;
}

interface StepOutcome {
  stepId: string;
  type: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
}

export interface WorkflowRunSummary {
  operationId: string;
  workflowDefinitionId: string;
  status: 'completed' | 'failed';
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  outcomes: StepOutcome[];
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
          error:
            error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
        });
      }
    });
    this.listening = true;
    logger.info('WorkflowExecutorService listening on workflow.definition.trigger');
  }

  async runDefinition(definitionId: string): Promise<WorkflowRunSummary | null> {
    const db = getControlDb();
    const [definition] = await db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, definitionId))
      .limit(1);

    if (!definition) {
      logger.warn('Fired workflow definition not found', { definitionId });
      return null;
    }

    const steps = (definition.steps ?? []) as WorkflowStep[];
    const agentId = definition.agentId || SYSTEM_AGENT_ID;
    // A scheduled run has no signed-in caller, so it acts as the system user. That
    // is the honest attribution — it is what the execution is audited against —
    // and it is a real user row, which an empty string never was.
    const scope: RunScope = {
      userId: SYSTEM_USER_ID,
      agentId,
      projectId: definition.projectId ?? undefined,
    };
    const operationId = randomUUID();
    const startedAt = new Date();

    // Via the repository so the cross-plane agentId is verified before insert.
    await new OperationRepository().createOperation({
      id: operationId,
      type: 'hybrid_workflow',
      status: OperationStatus.RUNNING,
      agentId,
      userId: SYSTEM_USER_ID,
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
      const outcome = await this.runStep(step, stepId, scope, previousStdout, outcomes);
      outcomes.push(outcome);

      // eslint-disable-next-line no-await-in-loop
      await db
        .update(operations)
        .set({
          currentStep: i + 1,
          stepDetails: { outcomes } as unknown as Record<string, unknown>,
        })
        .where(eq(operations.id, operationId));

      if (outcome.status === 'failed') {
        failed = true;
        break;
      }
      previousStdout = this.extractStdout(outcome.output);
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    await db
      .update(operations)
      .set({
        status: failed ? OperationStatus.FAILED : OperationStatus.COMPLETED,
        completedAt,
        actualDuration: durationMs,
        result: { outcomes } as unknown as Record<string, unknown>,
        error: failed
          ? (outcomes.find((o) => o.status === 'failed')?.error ?? 'step failed')
          : null,
      })
      .where(eq(operations.id, operationId));

    if (!failed && definition.delivery) {
      await this.deliver(definition.delivery, outcomes, definition.name, scope).catch((error) => {
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

    return {
      operationId,
      workflowDefinitionId: definitionId,
      status: failed ? 'failed' : 'completed',
      startedAt,
      completedAt,
      durationMs,
      outcomes,
    };
  }

  private async runStep(
    step: WorkflowStep,
    stepId: string,
    scope: RunScope,
    previousStdout: string,
    priorOutcomes: StepOutcome[]
  ): Promise<StepOutcome> {
    try {
      if (step.type === 'bash') {
        if (!step.command) throw new Error(`bash step "${stepId}" has no command`);
        const output = await this.runTool(
          'shell-exec',
          { command: step.command, stdin: previousStdout },
          scope
        );
        return { stepId, type: step.type, status: 'completed', output };
      }

      if (step.type === 'httpCall') {
        if (!step.url) throw new Error(`httpCall step "${stepId}" has no url`);
        const output = await this.runTool(
          'http-request',
          { method: step.method ?? 'GET', url: step.url, headers: step.headers, body: step.body },
          scope
        );
        return { stepId, type: step.type, status: 'completed', output };
      }

      if (step.type === 'toolCall') {
        if (!step.toolId) throw new Error(`toolCall step "${stepId}" has no toolId`);
        // The arguments go through untouched. Whether this tool needs a project
        // scope — and whether the one on the definition satisfies it — is decided
        // by UnifiedToolRegistry, which alone knows the server's credential mode.
        // Re-deciding it here would refuse self-credentialed servers the registry
        // would have allowed.
        const output = await this.runTool(step.toolId, step.arguments ?? {}, scope);
        return { stepId, type: step.type, status: 'completed', output };
      }

      if (step.type === 'agentTurn') {
        // Persona + LLM reasoning step. Dispatch to the llm-service responder over the bus
        // (it resolves the persona's systemPrompt by id-or-name and calls the LLM), then
        // block on the reply — same RPC shape as the tool path.
        if (!step.prompt) throw new Error(`agentTurn step "${stepId}" has no prompt`);
        const requestId = randomUUID();
        // An agentTurn used to receive nothing but its own prompt, which made a
        // "judge the evidence" step impossible: the evidence was gathered by the
        // steps before it and then dropped on the floor. previousStdout does not
        // serve here — it is the stdin-piping channel for shell steps and comes
        // back empty for a tool result, which is an object, not a stream.
        const output = await this.eventBus.publishAndWaitForResponse<{
          content?: string;
          model?: string;
        }>(
          'llm.step.generate.request',
          {
            requestId,
            agentId: step.agentId,
            prompt: this.withPriorEvidence(step.prompt, priorOutcomes),
            model: step.model,
          },
          120000
        );
        return { stepId, type: step.type, status: 'completed', output };
      }

      return {
        stepId,
        type: step.type,
        status: 'failed',
        error: `unknown step type: ${step.type}`,
      };
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
    scope: RunScope
  ): Promise<unknown> {
    const requestId = randomUUID();
    const response = await this.eventBus.publishAndWaitForResponse<{
      status?: string;
      result?: unknown;
      error?: string;
    }>(
      'tool.execute.request',
      {
        requestId,
        toolId,
        parameters,
        // Top level is where the coordinator reads identity from. securityContext
        // is kept because other publishers of this event still send it, and a
        // consumer that reads it should see the same identity, not a stale one.
        userId: scope.userId,
        agentId: scope.agentId,
        projectId: scope.projectId,
        securityContext: { userId: scope.userId, agentId: scope.agentId },
      },
      120000
    );
    if (response && response.status === 'ERROR') {
      throw new Error(response.error || `Tool ${toolId} failed`);
    }
    return response?.result ?? response;
  }

  /**
   * Appends the outputs of the steps that already ran, so a reasoning step can
   * judge evidence rather than titles.
   *
   * TRUNCATED, and deliberately so. The gather steps this is built for can return
   * thousands of findings; pasting all of them produces a prompt no model will
   * read to the end and a bill nobody sanctioned. A run that needs more than this
   * wants a narrower gather step, not a bigger prompt.
   */
  private withPriorEvidence(prompt: string, priorOutcomes: StepOutcome[]): string {
    const completed = priorOutcomes.filter(
      (o) => o.status === 'completed' && o.output !== undefined
    );
    if (completed.length === 0) return prompt;

    const evidence = completed
      .map((o) => {
        const body = typeof o.output === 'string' ? o.output : JSON.stringify(o.output);
        const clipped =
          body.length > EVIDENCE_CHARS_PER_STEP
            ? `${body.slice(0, EVIDENCE_CHARS_PER_STEP)}… [truncated from ${body.length} chars]`
            : body;
        return `## ${o.stepId}\n${clipped}`;
      })
      .join('\n\n');

    return `${prompt}\n\n# Evidence from earlier steps in this run\n\n${evidence}`;
  }

  private extractStdout(output: unknown): string {
    if (output && typeof output === 'object') {
      const rec = output as Record<string, unknown>;
      if (typeof rec.stdout === 'string') return rec.stdout;
      if (typeof rec.content === 'string') return rec.content; // agentTurn LLM output
      if (typeof rec.output === 'string') return rec.output;
    }
    return typeof output === 'string' ? output : '';
  }

  private async deliver(
    delivery: { type: string; target: string },
    outcomes: StepOutcome[],
    workflowName: string,
    scope: RunScope
  ): Promise<void> {
    const summary = `Workflow *${workflowName}* completed: ${outcomes
      .map((o) => `${o.stepId}=${o.status}`)
      .join(', ')}`;

    if (delivery.type === 'webhook') {
      await this.runTool(
        'http-request',
        {
          method: 'POST',
          url: delivery.target,
          headers: { 'Content-Type': 'application/json' },
          body: { workflow: workflowName, outcomes, summary },
        },
        scope
      );
      return;
    }

    if (delivery.type === 'slack') {
      // delivery.target is a Slack incoming-webhook URL.
      await this.runTool(
        'http-request',
        {
          method: 'POST',
          url: delivery.target,
          headers: { 'Content-Type': 'application/json' },
          body: { text: summary },
        },
        scope
      );
      return;
    }

    if (delivery.type === 'whatsapp') {
      // Meta WhatsApp Cloud API. target = recipient phone (E.164). Credentials from env.
      const token = process.env.WHATSAPP_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !phoneNumberId) {
        logger.warn(
          'WhatsApp delivery skipped — WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set',
          {
            workflowName,
          }
        );
        return;
      }
      await this.runTool(
        'http-request',
        {
          method: 'POST',
          url: `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: {
            messaging_product: 'whatsapp',
            to: delivery.target,
            type: 'text',
            text: { body: summary },
          },
        },
        scope
      );
      return;
    }

    // email intentionally not implemented.
    logger.info('Workflow delivery channel not implemented', {
      channel: delivery.type,
      target: delivery.target,
      summary,
    });
  }
}
