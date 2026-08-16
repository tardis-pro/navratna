import { describe, it, expect, vi } from 'vitest';

import { handleAgentDiscussionTrigger } from '../../../../../../shared/agent-intelligence/src/events/discussion_agent_turn_handler';

/**
 * A discussion turn used to reach the LLM with no tools at all. The handler
 * built its AgentResponseRequest from `agent` and `messages` only — never
 * `tools`, never `assignedMCPTools` — and `UserLLMService.runWithTools`
 * short-circuits to a plain completion when `tools` is empty. So an agent could
 * be granted web-search, show it in its assigned list, and still be structurally
 * incapable of calling it the moment it spoke in a discussion.
 */

type Captured = { request?: any };

function deps(overrides: {
  assignedMCPTools?: unknown;
  captured: Captured;
  toolSchemaProvider?: (toolId: string) => Promise<{ description: string; parameters: any } | null>;
}) {
  return {
    agentIntelligenceService: {
      getAgent: vi.fn(async () => ({
        id: 'agent-1',
        name: 'Researcher',
        role: 'analyzer',
        createdBy: 'user-1',
        assignedMCPTools: overrides.assignedMCPTools ?? [],
      })),
    } as any,
    userLLMService: {
      generateAgentResponse: vi.fn(async (_userId: string, request: any) => {
        overrides.captured.request = request;
        return { content: 'here is what I found', model: 'test-model' };
      }),
    } as any,
    databaseService: {
      findMany: vi.fn(async () => [{ id: 'participant-1' }]),
    } as any,
    publish: vi.fn(async () => undefined),
    ...(overrides.toolSchemaProvider ? { toolSchemaProvider: overrides.toolSchemaProvider } : {}),
  };
}

const trigger = {
  data: {
    params: {
      discussionId: 'discussion-1',
      agentId: 'agent-1',
      userId: 'user-1',
      comment: 'What do we know about this?',
    },
  },
} as any;

describe('tool access on a discussion turn', () => {
  it('offers the agent its native tools, so the tool loop can actually run', async () => {
    const captured: Captured = {};
    const d = deps({
      captured,
      assignedMCPTools: [
        { toolId: 'web-search', toolName: 'web-search', serverName: '', enabled: true },
        { toolId: 'web-fetch', toolName: 'web-fetch', serverName: '', enabled: true },
      ],
      toolSchemaProvider: async (toolId) => ({
        description: `schema for ${toolId}`,
        parameters: { type: 'object', properties: {} },
      }),
    });

    await handleAgentDiscussionTrigger(trigger, d);

    const names = (captured.request?.tools ?? []).map((t: any) => t.name);
    expect(names, 'the request must carry resolved tools').toEqual(['web-search', 'web-fetch']);
    expect(
      captured.request?.agent?.assignedMCPTools?.length,
      'omitting assignedMCPTools strips the toolset downstream'
    ).toBe(2);
  });

  it('withholds MCP bindings, whose project scope cannot be established here', async () => {
    // A discussion trigger carries no projectId, so the chat path's
    // filterToolsForProject cannot run. An agent's assigned set spans every
    // project it was linked in, and an unscoped offer would expose a
    // credential bound in another project.
    const captured: Captured = {};
    const d = deps({
      captured,
      assignedMCPTools: [
        { toolId: 'web-search', toolName: 'web-search', serverName: '', enabled: true },
        {
          toolId: 'mcp-navratna-tardis-agent-list_tasks',
          toolName: 'list_tasks',
          serverName: 'navratna-tardis-agent',
          enabled: true,
        },
      ],
      toolSchemaProvider: async (toolId) => ({
        description: `schema for ${toolId}`,
        parameters: { type: 'object', properties: {} },
      }),
    });

    await handleAgentDiscussionTrigger(trigger, d);

    const names = (captured.request?.tools ?? []).map((t: any) => t.name);
    expect(names).toEqual(['web-search']);
    expect(names, 'project-bound MCP tools must not be offered unscoped').not.toContain(
      'list_tasks'
    );
  });

  it('omits tools entirely when the agent has none, rather than sending an empty list', async () => {
    const captured: Captured = {};
    const d = deps({
      captured,
      assignedMCPTools: [],
      toolSchemaProvider: async () => ({ description: 'x', parameters: {} }),
    });

    await handleAgentDiscussionTrigger(trigger, d);

    expect(captured.request?.tools).toBeUndefined();
  });

  it('still produces a turn when no schema provider is wired', async () => {
    // The provider is optional so the handler degrades to its previous
    // behaviour instead of failing the turn.
    const captured: Captured = {};
    const d = deps({
      captured,
      assignedMCPTools: [
        { toolId: 'web-search', toolName: 'web-search', serverName: '', enabled: true },
      ],
    });

    await handleAgentDiscussionTrigger(trigger, d);

    expect(captured.request?.tools).toBeUndefined();
    expect(d.publish).toHaveBeenCalledWith(
      'discussion.agent.message',
      expect.objectContaining({ content: 'here is what I found' })
    );
  });

  it('does not offer a disabled binding', async () => {
    const captured: Captured = {};
    const d = deps({
      captured,
      assignedMCPTools: [
        { toolId: 'web-search', toolName: 'web-search', serverName: '', enabled: false },
        { toolId: 'web-fetch', toolName: 'web-fetch', serverName: '', enabled: true },
      ],
      toolSchemaProvider: async (toolId) => ({
        description: `schema for ${toolId}`,
        parameters: {},
      }),
    });

    await handleAgentDiscussionTrigger(trigger, d);

    const names = (captured.request?.tools ?? []).map((t: any) => t.name);
    expect(names).toEqual(['web-fetch']);
  });
});
