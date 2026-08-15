/**
 * `forEach` — one step, N tool invocations, over a list an earlier step produced.
 *
 * The executor ran a flat, ordered step list, so a gather → reason → act workflow
 * could act exactly ONCE: the nightly triage could rank a whole night of evidence
 * and then file a single task carrying the lot. These tests pin the behaviour that
 * makes the step trustworthy rather than merely present, because the input is
 * MODEL OUTPUT and every degenerate shape below has been seen in the wild.
 *
 * The rule underneath all of them: a step that appears to act on a run's findings
 * and silently acts on nothing is worse than no step, because the run still
 * reports success. So "the model returned prose" fails loudly, "the model returned
 * []" completes and says zero, and those two are never confused for one another.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createOperationMock = vi.fn();
const selectRows: unknown[] = [];

vi.mock('@uaip/shared-services', () => ({
  EventBusService: class {},
  OperationRepository: class {
    createOperation = createOperationMock;
  },
  SYSTEM_AGENT_ID: '00000000-0000-0000-0000-000000000001',
  SYSTEM_USER_ID: '00000000-0000-0000-0000-000000000002',
  getControlDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectRows),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  }),
}));

vi.mock('@uaip/shared-services/drizzle/clients', () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock('@uaip/shared-services/drizzle/control', () => ({
  workflowDefinitions: { id: 'workflow_definitions.id' },
  operations: { id: 'operations.id' },
}));

import { WorkflowExecutorService } from '../../services/workflow_executor_service.js';

interface ToolRequest {
  toolId: string;
  parameters: Record<string, unknown>;
}

interface FanOutOutput {
  requested: number;
  ran: number;
  succeeded: number;
  failed: number;
  truncated: boolean;
  results: Array<{ index: number; status: string; output?: unknown; error?: string }>;
}

interface RunResult {
  status?: string;
  outcomes?: Array<{ stepId: string; status: string; error?: string; output?: unknown }>;
}

/**
 * An event bus whose LLM step returns `llm`, and whose tool calls return `{ ok: true }`
 * unless `onTool` says otherwise. `onTool` throwing stands in for a tool that failed.
 */
function createEventBus(llm: unknown = { content: '[]' }, onTool?: (n: number) => unknown) {
  let toolCalls = 0;
  return {
    subscribe: vi.fn().mockResolvedValue(undefined),
    publishAndWaitForResponse: vi.fn().mockImplementation((event: string) => {
      if (event === 'llm.step.generate.request') return Promise.resolve(llm);
      const n = toolCalls;
      toolCalls += 1;
      if (onTool) {
        try {
          return Promise.resolve(onTool(n));
        } catch (error) {
          return Promise.reject(error);
        }
      }
      return Promise.resolve({ ok: true });
    }),
  };
}

function definition(steps: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 'wf-1',
    name: 'nightly-triage',
    description: null,
    steps,
    agentId: null,
    sessionKey: null,
    model: null,
    delivery: null,
    projectId: 'p-1',
  };
}

async function run(eventBus: ReturnType<typeof createEventBus>): Promise<RunResult | null> {
  const service = new WorkflowExecutorService(eventBus as never);
  return (await (
    service as unknown as { runDefinition: (id: string) => Promise<unknown> }
  ).runDefinition('wf-1')) as RunResult | null;
}

function toolRequests(eventBus: ReturnType<typeof createEventBus>): ToolRequest[] {
  return eventBus.publishAndWaitForResponse.mock.calls
    .filter((call) => call[0] === 'tool.execute.request')
    .map((call) => call[1] as ToolRequest);
}

/** The canonical wiring: reason, then fan out over the GROUPS the reasoning produced. */
function triageThenFanOut(overrides: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  return [
    { type: 'agentTurn', id: 'triage', prompt: 'Cluster and rank.' },
    {
      type: 'forEach',
      id: 'file.each',
      itemsFrom: '{{steps.triage.output}}',
      toolId: 'mcp-navratna-tardis-agent-create_task',
      arguments: {
        title: '{{item.title}}',
        body: '{{item.why}}',
        labels: ['auto-detected'],
      },
      ...overrides,
    },
  ];
}

function fanOutOutput(result: RunResult | null): FanOutOutput {
  const outcome = result?.outcomes?.find((o) => o.stepId === 'file.each');
  if (!outcome) throw new Error('no forEach outcome was recorded');
  return outcome.output as FanOutOutput;
}

describe('WorkflowExecutorService forEach fan-out', () => {
  beforeEach(() => {
    createOperationMock.mockReset().mockResolvedValue(undefined);
    selectRows.length = 0;
  });

  it('files one task per GROUP the reasoning step produced, substituting per-item fields', async () => {
    selectRows.push(definition(triageThenFanOut()));
    const eventBus = createEventBus({
      content: JSON.stringify([
        { title: 'checkout 5xx cluster', why: 'started with release 41' },
        { title: 'unhandled promise family', why: 'six services, one helper' },
      ]),
    });

    const result = await run(eventBus);

    const requests = toolRequests(eventBus);
    expect(requests).toHaveLength(2);
    expect(requests[0].toolId).toBe('mcp-navratna-tardis-agent-create_task');
    expect(requests[0].parameters).toEqual({
      title: 'checkout 5xx cluster',
      body: 'started with release 41',
      labels: ['auto-detected'],
    });
    expect(requests[1].parameters.title).toBe('unhandled promise family');

    expect(result?.status).toBe('completed');
    const output = fanOutOutput(result);
    expect(output).toMatchObject({ requested: 2, ran: 2, succeeded: 2, failed: 0, truncated: false });
  });

  it('unwraps a fenced array, because that is how a model actually answers', async () => {
    selectRows.push(definition(triageThenFanOut()));
    const eventBus = createEventBus({
      content: '```json\n[{"title":"one"},{"title":"two"},{"title":"three"}]\n```',
    });

    await run(eventBus);

    expect(toolRequests(eventBus)).toHaveLength(3);
  });

  it('unwraps a single array-valued property, since there is no guess to get wrong', async () => {
    selectRows.push(definition(triageThenFanOut()));
    const eventBus = createEventBus({ content: '{"groups":[{"title":"a"},{"title":"b"}]}' });

    await run(eventBus);

    expect(toolRequests(eventBus)).toHaveLength(2);
  });

  it('REFUSES an object with two arrays rather than picking one', async () => {
    selectRows.push(definition(triageThenFanOut()));
    const eventBus = createEventBus({ content: '{"groups":[{"title":"a"}],"dropped":[{"t":"b"}]}' });

    const result = await run(eventBus);

    expect(toolRequests(eventBus)).toHaveLength(0);
    expect(result?.status).toBe('failed');
    expect(result?.outcomes?.[1].error).toContain('refusing to guess');
  });

  // The constraint this whole file exists for.
  it('FAILS LOUDLY when the model returns prose instead of JSON — never "zero items, all good"', async () => {
    selectRows.push(definition(triageThenFanOut()));
    const eventBus = createEventBus({
      content: "I reviewed the evidence and honestly nothing looks urgent tonight, though the checkout latency is worth a glance.",
    });

    const result = await run(eventBus);

    expect(toolRequests(eventBus)).toHaveLength(0);
    expect(result?.status).toBe('failed');
    const error = result?.outcomes?.[1].error ?? '';
    expect(error).toContain('not JSON');
    // The offending text is carried in the error, so the fix does not require a log dive.
    expect(error).toContain('I reviewed the evidence');
  });

  it('distinguishes an EMPTY list from a broken one — it completes, and records zero', async () => {
    selectRows.push(definition(triageThenFanOut()));
    const eventBus = createEventBus({ content: '[]' });

    const result = await run(eventBus);

    expect(toolRequests(eventBus)).toHaveLength(0);
    // "Nothing cleared the bar" is an answer the triage prompt explicitly invites,
    // so it is a completed run — but the zero is written down rather than inferred.
    expect(result?.status).toBe('completed');
    const outcome = result?.outcomes?.find((o) => o.stepId === 'file.each');
    expect(outcome?.status).toBe('completed');
    expect(outcome?.error).toBeUndefined();
    expect(fanOutOutput(result)).toMatchObject({ requested: 0, ran: 0, succeeded: 0, failed: 0 });
  });

  it('caps a runaway list at 25 and records that it was truncated', async () => {
    selectRows.push(definition(triageThenFanOut()));
    const eventBus = createEventBus({
      content: JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ title: `finding ${i}` }))),
    });

    const result = await run(eventBus);

    // A model that emits 500 must not fire 500 tool calls.
    expect(toolRequests(eventBus)).toHaveLength(25);
    const output = fanOutOutput(result);
    expect(output.truncated).toBe(true);
    // The ORIGINAL count survives. Without it, 25 tasks out of 500 findings is
    // indistinguishable from 25 findings.
    expect(output.requested).toBe(500);
    expect(output.ran).toBe(25);
  });

  it('lets a step narrow the cap but never widen it', async () => {
    selectRows.push(definition(triageThenFanOut({ maxItems: 100 })));
    const eventBus = createEventBus({
      content: JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ title: `g${i}` }))),
    });

    await run(eventBus);

    expect(toolRequests(eventBus)).toHaveLength(25);

    selectRows.length = 0;
    selectRows.push(definition(triageThenFanOut({ maxItems: 3 })));
    const narrowed = createEventBus({
      content: JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ title: `g${i}` }))),
    });

    await run(narrowed);

    expect(toolRequests(narrowed)).toHaveLength(3);
  });

  it('runs every remaining item when one fails, and reports the step as failed', async () => {
    selectRows.push(definition(triageThenFanOut()));
    const eventBus = createEventBus(
      { content: JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ title: `g${i}` }))) },
      (n) => {
        if (n === 2) throw new Error('board rejected the task');
        return { ok: true };
      }
    );

    const result = await run(eventBus);

    // Aborting at item 3 would leave seven groups unfiled with no record they existed.
    expect(toolRequests(eventBus)).toHaveLength(10);

    const output = fanOutOutput(result);
    expect(output).toMatchObject({ requested: 10, ran: 10, succeeded: 9, failed: 1 });
    expect(output.results[2]).toMatchObject({ index: 2, status: 'failed' });
    expect(output.results[2].error).toContain('board rejected the task');
    expect(output.results[3].status).toBe('completed');

    // The run is honest about being partial rather than reporting success.
    expect(result?.status).toBe('failed');
    expect(result?.outcomes?.[1].error).toContain('1 of 10');
  });

  it('names the unresolved placeholder when the source step never ran', async () => {
    selectRows.push(
      definition([
        {
          type: 'forEach',
          id: 'file.each',
          itemsFrom: '{{steps.triage.output}}',
          toolId: 'mcp-x-create_task',
          arguments: {},
        },
      ])
    );
    const eventBus = createEventBus();

    const result = await run(eventBus);

    expect(toolRequests(eventBus)).toHaveLength(0);
    const error = result?.outcomes?.[0].error ?? '';
    expect(error).toContain('unresolved placeholder');
    expect(error).toContain('{{steps.triage.output}}');
  });

  it('fails the step when it names no itemsFrom or no toolId', async () => {
    selectRows.push(definition([{ type: 'forEach', id: 'broken', toolId: 'mcp-x-create_task' }]));
    const noSource = createEventBus();
    const a = await run(noSource);
    expect(a?.outcomes?.[0].error).toContain('no itemsFrom');

    selectRows.length = 0;
    selectRows.push(definition([{ type: 'forEach', id: 'broken', itemsFrom: '{{previous.output}}' }]));
    const noTool = createEventBus();
    const b = await run(noTool);
    expect(b?.outcomes?.[0].error).toContain('no toolId');
  });

  it('leaves an item placeholder the item cannot satisfy visibly in place', async () => {
    selectRows.push(
      definition(
        triageThenFanOut({
          arguments: { title: '{{item.title}}', body: '{{item.missing}}' },
        })
      )
    );
    const eventBus = createEventBus({ content: '[{"title":"only a title"}]' });

    await run(eventBus);

    const [request] = toolRequests(eventBus);
    expect(request.parameters.title).toBe('only a title');
    // A task filed with a literal placeholder is visibly broken and gets fixed; one
    // filed with a silently empty body reads as "there was nothing to say".
    expect(request.parameters.body).toBe('{{item.missing}}');
  });

  it('passes the whole item through {{item}} when the template wants it verbatim', async () => {
    selectRows.push(
      definition(triageThenFanOut({ arguments: { body: '{{item}}', title: 'group' } }))
    );
    const eventBus = createEventBus({ content: '[{"title":"a","severity":"BLOCKER"}]' });

    await run(eventBus);

    expect(toolRequests(eventBus)[0].parameters.body).toBe('{"title":"a","severity":"BLOCKER"}');
  });

  it('does not re-scan substituted text, so an item cannot read a sibling step through it', async () => {
    selectRows.push(
      definition([
        { type: 'toolCall', id: 'secret', toolId: 'mcp-x-list', arguments: {} },
        { type: 'agentTurn', id: 'triage', prompt: 'Cluster.' },
        {
          type: 'forEach',
          id: 'file.each',
          itemsFrom: '{{steps.triage.output}}',
          toolId: 'mcp-x-create_task',
          arguments: { body: '{{item.title}}' },
        },
      ])
    );
    const eventBus = createEventBus({
      content: JSON.stringify([{ title: 'see {{steps.secret.output}}' }]),
    });

    await run(eventBus);

    const filed = toolRequests(eventBus).filter((r) => r.toolId === 'mcp-x-create_task');
    expect(filed[0].parameters.body).toBe('see {{steps.secret.output}}');
  });

  it('resolves a DOTTED step id, which every gather step in the triage uses', async () => {
    selectRows.push(
      definition([
        { type: 'toolCall', id: 'gather.quality', toolId: 'mcp-x-code_quality', arguments: {} },
        {
          type: 'forEach',
          id: 'file.each',
          itemsFrom: '{{steps.gather.quality.output}}',
          toolId: 'mcp-x-create_task',
          arguments: { title: '{{item.rule}}' },
        },
      ])
    );
    const eventBus = createEventBus(undefined, (n) => (n === 0 ? [{ rule: 'S1234' }] : { ok: true }));

    await run(eventBus);

    const filed = toolRequests(eventBus).filter((r) => r.toolId === 'mcp-x-create_task');
    expect(filed).toHaveLength(1);
    expect(filed[0].parameters.title).toBe('S1234');
  });
});
