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
 *   forEach   → one toolCall per item in a list an earlier step produced
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

/**
 * HARD ceiling on how wide one `forEach` step may fan out. A step may ask for
 * fewer (`maxItems`); nothing may ask for more.
 *
 * THE CAP IS SMALL ON PURPOSE, AND IT IS A SMELL DETECTOR, NOT A BUDGET.
 *
 * A fan-out is meant to iterate over GROUPS a reasoning step has already
 * clustered — "the checkout 5xx cluster", "the unhandled-promise family" — never
 * over raw findings. The project this was built for carries ~3,600 open issues.
 * The obvious, lazy wiring (fan out over every finding, file a task each) would
 * bury the board on the first night and make the second night's digest unreadable
 * on top of the wreckage of the first. A primitive whose natural use destroys the
 * thing it reports into is not a feature.
 *
 * So 25 is set below any plausible count of real, deduplicated causes in one
 * codebase overnight. Hitting it is not "a big night" — it is evidence that the
 * step feeding this one is emitting findings rather than groups, and the fix is
 * upstream, in that step's prompt. The truncation warning says exactly that
 * rather than quietly making a wide fan-out feel routine.
 *
 * The mechanical reasons agree with the editorial one: each item is a real
 * `tool.execute.request` with a 120s ceiling against a bus shared with the rest of
 * the stack, run sequentially.
 */
const FANOUT_MAX_ITEMS = 25;

/**
 * Fences a model wraps JSON in. Stripped because they are an unambiguous,
 * self-delimiting wrapper — unlike prose around JSON, which we deliberately do
 * NOT try to scavenge (see parseFanOutItems).
 */
const JSON_FENCE = /^```(?:json|jsonc|js|javascript)?[ \t]*\r?\n?([\s\S]*?)\r?\n?```$/;

/**
 * Keys that carry a step's payload as TEXT inside an envelope object. Exactly the
 * three `extractStdout` already knows, and for the same reason: an `agentTurn`
 * outcome is `{ content, model }`, not the bare list the model wrote, so a
 * fan-out over `{{steps.triage.output}}` would otherwise see an object with no
 * array in it and refuse the single most important case this feature exists for.
 * One envelope layer is unwrapped, never two — see interpretFanOutSource.
 */
const FANOUT_TEXT_CARRIERS = ['content', 'stdout', 'output'] as const;

interface WorkflowStep {
  type: 'bash' | 'agentTurn' | 'httpCall' | 'toolCall' | 'forEach';
  id?: string;
  command?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
  prompt?: string;
  agentId?: string;
  model?: string;
  /** `toolCall`/`forEach`: any tool id the registry resolves, including `mcp-<server>-<tool>`. */
  toolId?: string;
  /**
   * `toolCall`: the tool's own arguments, placeholder-resolved (see resolveArguments).
   * `forEach`: the PER-ITEM argument template, additionally resolving `{{item…}}`.
   */
  arguments?: Record<string, unknown>;
  /**
   * `forEach` only, required: a placeholder naming where the list comes from,
   * e.g. `{{steps.triage.output}}`. Same vocabulary as `arguments`, so there is
   * one thing to learn rather than two. Point it at a step that produces GROUPS,
   * not one that produces raw findings — see runForEach.
   */
  itemsFrom?: string;
  /** `forEach` only: lower the fan-out width for this step. Cannot raise it above FANOUT_MAX_ITEMS. */
  maxItems?: number;
}

/** One invocation inside a `forEach`, kept so a partial run is diagnosable rather than merely "failed". */
interface FanOutItemResult {
  index: number;
  status: 'completed' | 'failed';
  output?: unknown;
  error?: string;
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
        // Whether this tool needs a project scope — and whether the one on the
        // definition satisfies it — is decided by UnifiedToolRegistry, which
        // alone knows the server's credential mode. Re-deciding it here would
        // refuse self-credentialed servers the registry would have allowed.
        //
        // Arguments used to go through completely untouched, which made the last
        // step of a gather → reason → act workflow impossible: an agentTurn can
        // see what earlier steps produced (withPriorEvidence) and a toolCall
        // could not, so "file what the triage decided" could only ever file a
        // hardcoded string. A step that appears to act on the run's findings and
        // actually posts a constant is worse than no step at all.
        const output = await this.runTool(
          step.toolId,
          this.resolveArguments(step.arguments ?? {}, priorOutcomes),
          scope
        );
        return { stepId, type: step.type, status: 'completed', output };
      }

      if (step.type === 'forEach') {
        // Validation errors thrown inside fall through to the catch below and fail
        // the step, which is what we want: a fan-out that cannot even name its
        // source or its tool has not "done nothing", it is broken.
        return await this.runForEach(step, stepId, scope, priorOutcomes);
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
   * FAN-OUT — one step, N tool invocations, driven by a list an earlier step produced.
   *
   * This exists because the executor runs a flat, ordered step list, so a workflow
   * could gather evidence, reason over it, and then file exactly ONE thing. The
   * nightly triage says so in its own seed comment: "a task per survivor is not
   * expressible here". A digest that arrives as a single wall of text is a report,
   * and reports do not get accepted, rejected, or assigned — items do.
   *
   * WHAT IT IS MEANT TO ITERATE OVER: groups, not findings. The list is expected to
   * be the output of a reasoning step that has already deduplicated symptoms down
   * to underlying causes — one entry per cause, the way the triage prompt already
   * demands. Pointing this at a raw gather step instead ("fan out over every
   * anomaly") is the one usage that must not become normal: on a codebase with
   * thousands of open issues it files thousands of tasks, and a board nobody can
   * read is worse than the single digest this replaced. FANOUT_MAX_ITEMS is
   * deliberately set below any believable number of real causes so that wiring
   * trips the cap and announces itself on the first run rather than the tenth.
   *
   * It is deliberately NOT `parallel` (a step type known to throw elsewhere in this
   * codebase). There is no concurrency here at all: items run one after another, in
   * order, exactly like the outer step loop, for the same reason the outer loop is
   * sequential — every item is an RPC with a 120s ceiling against a bus shared with
   * everything else on the stack, and 25 of them in flight is a burst nobody sized
   * for. Sequential and boring is the whole design.
   *
   * THE FOUR THINGS THAT CAN GO WRONG, and what each does:
   *
   * 1. The source is not a list we can read. The items come from a model, so the
   *    text may be prose, an apology, half a sentence, or a placeholder that never
   *    resolved. Every one of those FAILS THE STEP, loudly, with the offending text
   *    in the error. It must never degrade into "zero items, all good" — a step
   *    that appears to act on the run's findings and silently acts on nothing is
   *    worse than no step, because the run still reports success.
   *
   * 2. The list is legitimately empty (`[]`). This is the ONLY zero-item case that
   *    is not an error: the model was asked to rank and said nothing cleared the
   *    bar, which the triage prompt explicitly invites. It completes, and records
   *    `requested: 0` in its output so "nothing to do" is readable afterwards
   *    rather than inferred from an absence.
   *
   * 3. More items than the cap. Runs the first FANOUT_MAX_ITEMS (or `maxItems`, if
   *    the step asked for fewer), and says so — a warn log naming the likely cause
   *    (a source emitting findings instead of groups) AND `truncated: true` with
   *    the original count in the outcome. Silent truncation is the failure mode
   *    being defended against here: 25 tasks filed out of 500 findings looks
   *    identical to 25 findings if nothing writes down that there were 500.
   *
   * 4. An individual item fails. EVERY REMAINING ITEM STILL RUNS. Aborting at item
   *    3 of 10 would leave seven findings unfiled with no record they existed,
   *    which is strictly worse than the one failure we already know about. The
   *    successes and the failures are both kept in `results`. The STEP outcome is
   *    then `failed` if any item failed — so the run is honest about being partial,
   *    and (because the outer loop breaks on a failed step) nothing downstream acts
   *    on a half-finished list while believing it is whole.
   */
  private async runForEach(
    step: WorkflowStep,
    stepId: string,
    scope: RunScope,
    priorOutcomes: StepOutcome[]
  ): Promise<StepOutcome> {
    if (!step.itemsFrom) throw new Error(`forEach step "${stepId}" has no itemsFrom`);
    if (!step.toolId) throw new Error(`forEach step "${stepId}" has no toolId`);

    // Routed through resolveArguments rather than a second resolver so the source
    // placeholder and the per-item template can never drift apart in what they
    // accept — and so an unresolvable source arrives here still wearing its
    // literal `{{…}}`, which parseFanOutItems can then name in the error.
    const resolvedSource = this.resolveArguments({ items: step.itemsFrom }, priorOutcomes).items;
    const sourceText =
      typeof resolvedSource === 'string' ? resolvedSource : JSON.stringify(resolvedSource);

    const allItems = this.parseFanOutItems(sourceText ?? '', stepId, step.itemsFrom);
    const requested = allItems.length;

    if (requested === 0) {
      logger.info('forEach fan-out had an empty list — nothing to do', {
        stepId,
        itemsFrom: step.itemsFrom,
      });
      return {
        stepId,
        type: step.type,
        status: 'completed',
        output: { requested: 0, ran: 0, succeeded: 0, failed: 0, truncated: false, results: [] },
      };
    }

    // `maxItems` may only narrow. A definition is editable by anyone with write
    // access to the row, and a per-step field that could raise the ceiling would
    // make the ceiling advisory.
    const cap =
      typeof step.maxItems === 'number' && step.maxItems > 0
        ? Math.min(step.maxItems, FANOUT_MAX_ITEMS)
        : FANOUT_MAX_ITEMS;
    const items = allItems.slice(0, cap);
    const truncated = requested > items.length;
    if (truncated) {
      logger.warn(
        'forEach fan-out TRUNCATED — items beyond the cap were NOT run. A list this wide almost always means the source step is emitting individual findings rather than deduplicated groups; fix it there, not by raising the cap',
        {
          stepId,
          toolId: step.toolId,
          itemsFrom: step.itemsFrom,
          requested,
          ran: items.length,
          cap,
          dropped: requested - items.length,
        }
      );
    }

    const results: FanOutItemResult[] = [];
    let failedCount = 0;

    for (let i = 0; i < items.length; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop -- deliberately sequential; see the block comment above
        const output = await this.runTool(
          step.toolId,
          this.resolveArguments(step.arguments ?? {}, priorOutcomes, items[i]),
          scope
        );
        results.push({ index: i, status: 'completed', output });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedCount += 1;
        results.push({ index: i, status: 'failed', error: message });
        logger.warn('forEach item failed — continuing with the rest', {
          stepId,
          toolId: step.toolId,
          index: i,
          error: message,
        });
      }
    }

    logger.info('forEach fan-out finished', {
      stepId,
      toolId: step.toolId,
      requested,
      ran: items.length,
      succeeded: items.length - failedCount,
      failed: failedCount,
      truncated,
    });

    return {
      stepId,
      type: step.type,
      status: failedCount > 0 ? 'failed' : 'completed',
      output: {
        requested,
        ran: items.length,
        succeeded: items.length - failedCount,
        failed: failedCount,
        truncated,
        results,
      },
      error:
        failedCount > 0
          ? `${failedCount} of ${items.length} fan-out items failed`
          : undefined,
    };
  }

  /**
   * Turn whatever the source step produced into a list, or refuse.
   *
   * The input is untrusted model text. Every branch below is a decision about a
   * shape a model has actually been observed to emit, and the bias throughout is
   * that AMBIGUITY IS AN ERROR: it is always better to fail a step a human then
   * looks at than to fan out over a list we guessed at.
   *
   * Accepted:
   *   [...]                  — a JSON array, the shape asked for.
   *   ```json\n[...]\n```    — the same, fenced. Fences are stripped because they
   *                            are explicit delimiters; there is nothing to guess.
   *   { "groups": [...] }    — an object with EXACTLY ONE array-valued property.
   *                            Models wrap constantly, and refusing this would make
   *                            the feature fragile for no safety gained: with one
   *                            candidate there is no guess to get wrong.
   *   { "content": "[...]" } — ONE envelope layer, unwrapped via FANOUT_TEXT_CARRIERS.
   *
   * Refused, every one of them by throwing:
   *   prose, apologies, truncated JSON — not parseable.
   *   an object with two or more arrays — WHICH list is a guess, and guessing wrong
   *                                       fans out over the wrong data silently.
   *   an object with no array and no single text carrier, a number, a bare string,
   *   null — not a list.
   *   text still carrying a `{{…}}` we recognise — the source step never ran or
   *                                       never completed. Naming that is far more
   *                                       useful than "invalid JSON".
   *
   * Note what is NOT here: no scanning for the first `[` in a wall of prose. That
   * heuristic succeeds often enough to be trusted and fails by silently selecting
   * some unrelated bracketed fragment, which is precisely the class of quiet wrong
   * answer this whole path is built to avoid.
   */
  private parseFanOutItems(text: string, stepId: string, itemsFrom: string): unknown[] {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      throw new Error(
        `forEach step "${stepId}": item source ${itemsFrom} resolved to empty text — the step it names produced no output`
      );
    }

    // Did the SOURCE TEMPLATE fail to resolve? Answered by looking only for the
    // placeholders `itemsFrom` itself contained, not for placeholder-shaped text
    // in general.
    //
    // The general check was written first and was wrong: model output legitimately
    // contains `{{…}}` — a triage summarising a broken workflow will happily quote
    // the placeholder it saw filed on the board — and a fan-out then refused to run
    // over data that was perfectly fine. Comparing against the template instead
    // keeps the diagnostic ("the step you named never completed") while leaving
    // model-authored braces alone, which matters because substituted text is
    // never re-scanned and so those braces are inert by construction.
    const templatePlaceholders = itemsFrom.match(/\{\{\s*(?:previous|steps\.|item)[^}]*\}\}/g) ?? [];
    const stillUnresolved = templatePlaceholders.find((p) => trimmed.includes(p));
    if (stillUnresolved) {
      throw new Error(
        `forEach step "${stepId}": item source still contains an unresolved placeholder ${stillUnresolved} — the step it names did not run, did not complete, or is spelled differently`
      );
    }

    return this.interpretFanOutSource(trimmed, stepId, 0);
  }

  /**
   * The shape-by-shape half of parseFanOutItems, split out only so the envelope
   * case can re-enter it once.
   *
   * `depth` exists to make "once" enforceable. An envelope inside an envelope is
   * not a shape any real step produces, and allowing it would turn a bounded
   * accommodation into an open-ended search for an array somewhere in the tree —
   * which is the guessing this function refuses to do everywhere else.
   */
  private interpretFanOutSource(text: string, stepId: string, depth: number): unknown[] {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new Error(`forEach step "${stepId}": item source is empty`);
    }

    const fenced = trimmed.match(JSON_FENCE);
    const body = fenced ? fenced[1].trim() : trimmed;

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(
        `forEach step "${stepId}": item source is not JSON, so there is no list to fan out over. First 200 chars: ${body.slice(0, 200)}`
      );
    }

    if (Array.isArray(parsed)) return parsed;

    if (parsed !== null && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const arrayKeys = Object.entries(record).filter(([, v]) => Array.isArray(v));

      if (arrayKeys.length === 1) {
        logger.info('forEach unwrapped a single array-valued property from the item source', {
          stepId,
          property: arrayKeys[0][0],
        });
        return arrayKeys[0][1] as unknown[];
      }

      if (arrayKeys.length === 0 && depth === 0) {
        const carriers = FANOUT_TEXT_CARRIERS.filter((k) => typeof record[k] === 'string');
        if (carriers.length === 1) {
          logger.info('forEach unwrapped a text envelope from the item source', {
            stepId,
            property: carriers[0],
          });
          return this.interpretFanOutSource(record[carriers[0]] as string, stepId, depth + 1);
        }
      }

      throw new Error(
        `forEach step "${stepId}": item source is an object with ${arrayKeys.length} array-valued properties (keys: ${Object.keys(record).join(', ') || 'none'}) — refusing to guess which one holds the items`
      );
    }

    throw new Error(
      `forEach step "${stepId}": item source parsed to a ${parsed === null ? 'null' : typeof parsed}, not a list`
    );
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
  /**
   * Let a toolCall's arguments reference what earlier steps produced.
   *
   * Three placeholders, resolved inside string values only:
   *   {{steps.<stepId>.output}} — that step's output
   *   {{previous.output}}       — the most recent completed step's output
   *   {{item}} / {{item.a.b}}   — inside a `forEach`, the current item or a path
   *                               into it. Outside one, there is no item, so these
   *                               are left in place like any other unknown.
   *
   * An UNKNOWN placeholder is left in place rather than replaced with an empty
   * string. A task filed with a literal `{{steps.triage.output}}` in its body is
   * visibly broken and gets fixed; one filed with a silently empty body reads as
   * "the triage found nothing", which is exactly the kind of false all-clear this
   * pipeline exists to stop producing. `{{item.title}}` on an item that has no
   * `title` follows the same rule for the same reason.
   *
   * ONE PASS, one regex, deliberately. Substituted text is never re-scanned, so a
   * value the model wrote cannot smuggle in a `{{steps.…}}` of its own and read a
   * sibling step's output through an argument it was never given.
   *
   * The step-id character class is `[^}\s]+` rather than `[^.}\s]+` so that DOTTED
   * step ids resolve. Every gather step in the nightly triage is named
   * `gather.runtime`, `gather.quality` and so on, and under the narrower class
   * `{{steps.gather.quality.output}}` matched nothing and passed straight through
   * as literal text — the failure was at least visible, per the rule above, but it
   * made half the existing step ids unreferenceable. Greedy matching plus the
   * trailing `\.output` backtracks correctly for both shapes.
   */
  private resolveArguments(
    args: Record<string, unknown>,
    priorOutcomes: StepOutcome[],
    item?: unknown
  ): Record<string, unknown> {
    const completed = priorOutcomes.filter(
      (o) => o.status === 'completed' && o.output !== undefined
    );
    // An item alone is reason enough to walk the arguments, even on the first step
    // of a run where nothing has completed yet.
    if (completed.length === 0 && item === undefined) return args;

    const asText = (value: unknown): string =>
      typeof value === 'string' ? value : JSON.stringify(value);

    const byId = new Map(completed.map((o) => [o.stepId, asText(o.output)]));
    const previous =
      completed.length > 0 ? asText(completed[completed.length - 1].output) : undefined;

    /** Walk a dotted path into the current item. Anything missing yields undefined. */
    const fromItem = (path: string): unknown => {
      if (path.length === 0) return item;
      let cursor: unknown = item;
      for (const key of path.split('.')) {
        if (cursor === null || typeof cursor !== 'object') return undefined;
        cursor = (cursor as Record<string, unknown>)[key];
      }
      return cursor;
    };

    const substitute = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return value.replace(
          /\{\{\s*(previous\.output|steps\.[^}\s]+\.output|item(?:\.[^}\s]+)?)\s*\}\}/g,
          (whole: string, ref: string) => {
            if (ref === 'previous.output') return previous ?? whole;
            if (ref === 'item' || ref.startsWith('item.')) {
              if (item === undefined) return whole;
              const resolved = fromItem(ref === 'item' ? '' : ref.slice('item.'.length));
              return resolved === undefined ? whole : asText(resolved);
            }
            const id = ref.slice('steps.'.length, -'.output'.length);
            return byId.has(id) ? (byId.get(id) as string) : whole;
          }
        );
      }
      if (Array.isArray(value)) return value.map(substitute);
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substitute(v)])
        );
      }
      return value;
    };

    return substitute(args) as Record<string, unknown>;
  }

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
