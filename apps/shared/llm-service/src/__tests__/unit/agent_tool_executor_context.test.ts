import { describe, expect, it } from 'vitest';
import type { LLMToolCall } from '@uaip/types';
import { AgentToolExecutor } from '../../agent_tool_executor';

const binding = {
  toolId: 'mcp-github-create_issue',
  toolName: 'mcp-github-create_issue',
  serverName: 'github',
  enabled: true,
};

const call: LLMToolCall = {
  id: 'call-1',
  type: 'function',
  function: { name: 'mcp-github-create_issue', arguments: '{"title":"x"}' },
};

const makeBus = () => {
  const published: Record<string, unknown>[] = [];
  return {
    published,
    bus: {
      publishAndWaitForResponse: async (_channel: string, payload: Record<string, unknown>) => {
        published.push(payload);
        return { status: 'SUCCESS', result: {} };
      },
    },
  };
};

describe('AgentToolExecutor carries the project scope', () => {
  it('publishes the projectId so the MCP resolver can find the binding', async () => {
    const { bus, published } = makeBus();
    const executor = new AgentToolExecutor(
      bus as unknown as ConstructorParameters<typeof AgentToolExecutor>[0],
      [binding]
    );

    await executor.execute(call, 'agent-1', 'user-1', 'project-1');

    expect(published).toHaveLength(1);
    expect(
      published[0].projectId,
      'without projectId every integration MCP tool throws "requires an authenticated user, project and agent context"'
    ).toBe('project-1');
  });

  it('still publishes the agent and user identity alongside it', async () => {
    const { bus, published } = makeBus();
    const executor = new AgentToolExecutor(
      bus as unknown as ConstructorParameters<typeof AgentToolExecutor>[0],
      [binding]
    );

    await executor.execute(call, 'agent-1', 'user-1', 'project-1');

    expect(published[0]).toMatchObject({
      agentId: 'agent-1',
      userId: 'user-1',
      projectId: 'project-1',
    });
  });

  it('omits projectId rather than inventing one when the caller has no project', async () => {
    const { bus, published } = makeBus();
    const executor = new AgentToolExecutor(
      bus as unknown as ConstructorParameters<typeof AgentToolExecutor>[0],
      [binding]
    );

    await executor.execute(call, 'agent-1', 'user-1');

    expect(published[0].projectId).toBeUndefined();
  });

  it('never publishes a tool that is not bound to the agent', async () => {
    const { bus, published } = makeBus();
    const executor = new AgentToolExecutor(
      bus as unknown as ConstructorParameters<typeof AgentToolExecutor>[0],
      []
    );

    const result = await executor.execute(call, 'agent-1', 'user-1', 'project-1');

    expect(result.success).toBe(false);
    expect(published).toHaveLength(0);
  });
});
