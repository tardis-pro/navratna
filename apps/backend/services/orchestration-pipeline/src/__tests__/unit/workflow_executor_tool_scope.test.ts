/**
 * The identity a scheduled run acts as, and the project it is scoped to.
 *
 * ToolExecutionCoordinator.toToolExecutionEvent() passes the published payload
 * through as-is and then reads event.userId / event.agentId / event.projectId.
 * A userId nested only inside securityContext was therefore never seen, and every
 * call arrived at UnifiedToolRegistry with userId ''. shell-exec and http-request
 * do not care; any `mcp-*` tool is refused outright without a full
 * (user, agent, project) identity — which is why nothing scheduled could ever
 * call one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createOperationMock = vi.fn();
const selectRows: unknown[] = [];

const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000001';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000002';

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
  userId?: string;
  agentId?: string;
  projectId?: string;
  securityContext?: { userId?: string; agentId?: string };
}

function createEventBus() {
  return {
    subscribe: vi.fn().mockResolvedValue(undefined),
    publishAndWaitForResponse: vi.fn().mockResolvedValue({ stdout: 'ok' }),
  };
}

function definition(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'wf-1',
    name: 'nightly-triage',
    description: null,
    steps: [{ type: 'bash', command: 'echo hi' }],
    agentId: null,
    sessionKey: null,
    model: null,
    delivery: null,
    projectId: null,
    ...overrides,
  };
}

async function run(
  eventBus: ReturnType<typeof createEventBus>,
  id = 'wf-1'
): Promise<{ status?: string; outcomes?: Array<{ status: string; error?: string }> } | null> {
  const service = new WorkflowExecutorService(eventBus as never);
  return (await (
    service as unknown as { runDefinition: (id: string) => Promise<unknown> }
  ).runDefinition(id)) as never;
}

function llmPrompt(eventBus: ReturnType<typeof createEventBus>): string {
  const call = eventBus.publishAndWaitForResponse.mock.calls.find(
    (c) => c[0] === 'llm.step.generate.request'
  );
  if (!call) throw new Error('no llm.step.generate.request was published');
  return (call[1] as { prompt: string }).prompt;
}

function toolRequests(eventBus: ReturnType<typeof createEventBus>): ToolRequest[] {
  return eventBus.publishAndWaitForResponse.mock.calls
    .filter((call) => call[0] === 'tool.execute.request')
    .map((call) => call[1] as ToolRequest);
}

describe('WorkflowExecutorService run scope', () => {
  beforeEach(() => {
    createOperationMock.mockReset().mockResolvedValue(undefined);
    selectRows.length = 0;
  });

  it('publishes the caller identity at the TOP LEVEL, where the coordinator reads it', async () => {
    selectRows.push(definition());
    const eventBus = createEventBus();

    await run(eventBus);

    const [request] = toolRequests(eventBus);
    // The coordinator does `event.userId || ''`. Nested-only identity resolved to
    // the empty string, which is exactly what the registry rejects.
    expect(request.userId).toBe(SYSTEM_USER_ID);
    expect(request.agentId).toBe(SYSTEM_AGENT_ID);
  });

  it('keeps securityContext agreeing with the top level rather than going stale', async () => {
    selectRows.push(definition({ agentId: 'agent-7' }));
    const eventBus = createEventBus();

    await run(eventBus);

    const [request] = toolRequests(eventBus);
    expect(request.securityContext).toEqual({ userId: SYSTEM_USER_ID, agentId: 'agent-7' });
    expect(request.agentId).toBe('agent-7');
  });

  it('scopes a toolCall to the project on the DEFINITION so an MCP tool resolves', async () => {
    selectRows.push(
      definition({
        projectId: '87da881f-0000-0000-0000-000000000000',
        steps: [
          {
            type: 'toolCall',
            id: 'gather.runtime',
            toolId: 'mcp-navratna-tardis-agent-find_anomalies',
            arguments: { window: '24h' },
          },
        ],
      })
    );
    const eventBus = createEventBus();

    await run(eventBus);

    const [request] = toolRequests(eventBus);
    expect(request.toolId).toBe('mcp-navratna-tardis-agent-find_anomalies');
    expect(request.projectId).toBe('87da881f-0000-0000-0000-000000000000');
    expect(request.parameters).toEqual({ window: '24h' });
  });

  it('ignores a projectId the STEP names — scope may not be widened from inside a run', async () => {
    selectRows.push(
      definition({
        projectId: 'owning-project',
        steps: [
          {
            type: 'toolCall',
            toolId: 'mcp-navratna-tardis-agent-recent_errors',
            projectId: 'someone-elses-project',
            arguments: {},
          },
        ],
      })
    );
    const eventBus = createEventBus();

    await run(eventBus);

    expect(toolRequests(eventBus)[0].projectId).toBe('owning-project');
  });

  it('sends no project scope when the definition has none, leaving the registry to decide', async () => {
    // A self-credentialed MCP server is allowed without a project; a caller-bound
    // one is not. That distinction lives in the registry, which knows the server's
    // credential mode — refusing here would break the servers it would have allowed.
    selectRows.push(
      definition({
        steps: [{ type: 'toolCall', toolId: 'mcp-cloudflare-docs-search', arguments: {} }],
      })
    );
    const eventBus = createEventBus();

    await run(eventBus);

    expect(toolRequests(eventBus)[0].projectId).toBeUndefined();
  });

  it('fails only the offending step when a toolCall names no tool', async () => {
    selectRows.push(
      definition({ steps: [{ type: 'toolCall', id: 'broken', arguments: {} }] })
    );
    const eventBus = createEventBus();

    const result = await run(eventBus);

    expect(toolRequests(eventBus)).toHaveLength(0);
    expect(result?.status).toBe('failed');
    expect(result?.outcomes?.[0].error).toContain('no toolId');
  });

  it('gives a reasoning step the outputs of the steps before it', async () => {
    selectRows.push(
      definition({
        projectId: 'p-1',
        steps: [
          { type: 'toolCall', id: 'gather.runtime', toolId: 'mcp-x-find_anomalies', arguments: {} },
          { type: 'agentTurn', id: 'triage', prompt: 'Rank these.' },
        ],
      })
    );
    const eventBus = createEventBus();
    eventBus.publishAndWaitForResponse.mockImplementation((event: string) =>
      Promise.resolve(
        event === 'tool.execute.request' ? { anomalies: ['5xx spike on checkout'] } : { content: 'ranked' }
      )
    );

    await run(eventBus);

    const prompt = llmPrompt(eventBus);
    expect(prompt).toContain('Rank these.');
    expect(prompt).toContain('gather.runtime');
    expect(prompt).toContain('5xx spike on checkout');
  });

  it('truncates evidence per step so one noisy gather cannot blow up the prompt', async () => {
    selectRows.push(
      definition({
        steps: [
          { type: 'toolCall', id: 'noisy', toolId: 'mcp-x-list', arguments: {} },
          { type: 'agentTurn', id: 'triage', prompt: 'Rank.' },
        ],
      })
    );
    const eventBus = createEventBus();
    eventBus.publishAndWaitForResponse.mockImplementation((event: string) =>
      Promise.resolve(event === 'tool.execute.request' ? { blob: 'x'.repeat(50_000) } : { content: 'ok' })
    );

    await run(eventBus);

    const prompt = llmPrompt(eventBus);
    expect(prompt).toContain('truncated from');
    expect(prompt.length).toBeLessThan(10_000);
  });

  it('carries the same identity into a bash step, which had it silently empty before', async () => {
    selectRows.push(definition({ steps: [{ type: 'bash', command: 'ls' }] }));
    const eventBus = createEventBus();

    await run(eventBus);

    const [request] = toolRequests(eventBus);
    expect(request.toolId).toBe('shell-exec');
    expect(request.userId).toBe(SYSTEM_USER_ID);
  });
});
