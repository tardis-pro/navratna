const { mocks } = vi.hoisted(() => ({
  mocks: {
    agentRow: null as { assigned: unknown[] } | null,
    updates: [] as Record<string, unknown>[],
    txError: null as Error | null,
  },
}));

/**
 * assign() reads FOR UPDATE and writes inside one transaction, so the mock has to
 * expose the same builder chain; a plainer mock would let the locking read be
 * removed without any test noticing.
 */
vi.mock('../../database/drizzle/clients/index', () => ({
  getIntelligenceDb: () => ({
    transaction: async (fn: (tx: unknown) => Promise<number>) => {
      if (mocks.txError) throw mocks.txError;
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: async () => (mocks.agentRow ? [mocks.agentRow] : []),
              }),
            }),
          }),
        }),
        update: () => ({
          set: (patch: Record<string, unknown>) => ({
            where: async () => {
              mocks.updates.push(patch);
            },
          }),
        }),
      };
      return await fn(tx);
    },
  }),
}));

const { AgentMcpToolAssignmentService } = await import(
  '../../services/agent_mcp_tool_assignment_service'
);

const AGENT_ID = '11111111-1111-4111-8111-111111111111';

const service = () => new AgentMcpToolAssignmentService();

const stored = () =>
  (mocks.updates[0]?.assignedMCPTools ?? []) as {
    toolId: string;
    requiresApproval?: boolean;
  }[];

beforeEach(() => {
  mocks.agentRow = { assigned: [] };
  mocks.updates = [];
  mocks.txError = null;
});

describe('assign — approval policy survives the write', () => {
  it('stores requiresApproval so chat can gate the call', async () => {
    await service().assign(AGENT_ID, [
      {
        toolId: 'mcp-github-create_issue',
        toolName: 'mcp-github-create_issue',
        serverName: 'github',
        requiresApproval: true,
      },
    ]);

    expect(
      stored()[0].requiresApproval,
      'agent chat rebuilds its gate from the stored assignment, so dropping this auto-executes'
    ).toBe(true);
  });

  it('stores false for a tool the server marked read-only', async () => {
    await service().assign(AGENT_ID, [
      {
        toolId: 'mcp-github-search',
        toolName: 'mcp-github-search',
        serverName: 'github',
        requiresApproval: false,
      },
    ]);

    expect(stored()[0].requiresApproval).toBe(false);
  });

  it('defaults to requiring approval when the caller says nothing', async () => {
    await service().assign(AGENT_ID, [
      {
        toolId: 'mcp-github-unknown',
        toolName: 'mcp-github-unknown',
        serverName: 'github',
      },
    ]);

    expect(stored()[0].requiresApproval).toBe(true);
  });

  it('keeps the tools the agent already had', async () => {
    mocks.agentRow = {
      assigned: [
        { toolId: 'existing', toolName: 'existing', serverName: 'other', enabled: true },
      ],
    };

    await service().assign(AGENT_ID, [
      { toolId: 'mcp-github-search', toolName: 'mcp-github-search', serverName: 'github' },
    ]);

    expect(stored().map((tool) => tool.toolId)).toEqual(['existing', 'mcp-github-search']);
  });

  it('upgrades an existing assignment that predates the approval policy', async () => {
    mocks.agentRow = {
      assigned: [
        {
          toolId: 'mcp-github-create_issue',
          toolName: 'mcp-github-create_issue',
          serverName: 'github',
          enabled: true,
        },
      ],
    };

    await service().assign(AGENT_ID, [
      {
        toolId: 'mcp-github-create_issue',
        toolName: 'mcp-github-create_issue',
        serverName: 'github',
        requiresApproval: true,
      },
    ]);

    // Skipping a known toolId leaves a legacy assignment ungated forever, so
    // rediscovery could never repair a tool registered before the policy existed.
    expect(stored()[0].requiresApproval).toBe(true);
  });

  it('writes nothing when an already-gated assignment needs no repair', async () => {
    mocks.agentRow = {
      assigned: [
        {
          toolId: 'mcp-github-create_issue',
          toolName: 'mcp-github-create_issue',
          serverName: 'github',
          enabled: true,
          requiresApproval: true,
        },
      ],
    };

    await service().assign(AGENT_ID, [
      {
        toolId: 'mcp-github-create_issue',
        toolName: 'mcp-github-create_issue',
        serverName: 'github',
        requiresApproval: true,
      },
    ]);

    // Repair must be idempotent: rediscovery runs on every restart, so an
    // unchanged policy must not rewrite the row on each pass.
    expect(mocks.updates).toHaveLength(0);
  });

  it('preserves a user-disabled assignment while repairing its policy', async () => {
    mocks.agentRow = {
      assigned: [
        {
          toolId: 'mcp-github-create_issue',
          toolName: 'mcp-github-create_issue',
          serverName: 'github',
          enabled: false,
        },
      ],
    };

    await service().assign(AGENT_ID, [
      {
        toolId: 'mcp-github-create_issue',
        toolName: 'mcp-github-create_issue',
        serverName: 'github',
        requiresApproval: true,
      },
    ]);

    const row = stored()[0] as { enabled?: boolean; requiresApproval?: boolean };
    expect(row.requiresApproval).toBe(true);
    expect(row.enabled, 'rediscovery must not silently re-enable a tool the user turned off').toBe(
      false
    );
  });

  it('does not re-add a tool the agent already has', async () => {
    mocks.agentRow = {
      assigned: [
        {
          toolId: 'mcp-github-search',
          toolName: 'mcp-github-search',
          serverName: 'github',
          enabled: true,
          requiresApproval: true,
        },
      ],
    };

    const added = await service().assign(AGENT_ID, [
      { toolId: 'mcp-github-search', toolName: 'mcp-github-search', serverName: 'github' },
    ]);

    expect(added).toBe(0);
    expect(stored()).toHaveLength(0);
  });

  it('counts only genuinely new tools, not repaired ones', async () => {
    mocks.agentRow = {
      assigned: [
        {
          toolId: 'mcp-github-search',
          toolName: 'mcp-github-search',
          serverName: 'github',
          enabled: true,
        },
      ],
    };

    const added = await service().assign(AGENT_ID, [
      { toolId: 'mcp-github-search', toolName: 'mcp-github-search', serverName: 'github' },
    ]);

    // The row IS rewritten (its missing policy is repaired), but nothing new was
    // assigned, so the caller's "assigned N tools" log must not claim otherwise.
    expect(added).toBe(0);
    expect(stored()[0].requiresApproval).toBe(true);
  });

  it('assigns nothing to a missing agent', async () => {
    mocks.agentRow = null;

    const added = await service().assign(AGENT_ID, [
      { toolId: 'mcp-github-search', toolName: 'mcp-github-search', serverName: 'github' },
    ]);

    expect(added).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it('never fails the link when the write throws', async () => {
    mocks.txError = new Error('intelligence plane unavailable');

    await expect(
      service().assign(AGENT_ID, [
        { toolId: 'mcp-github-search', toolName: 'mcp-github-search', serverName: 'github' },
      ])
    ).resolves.toBe(0);
  });
});

describe('unassignServer', () => {
  it('removes only the tools of that server', async () => {
    mocks.agentRow = {
      assigned: [
        { toolId: 'mcp-github-a', toolName: 'a', serverName: 'github', enabled: true },
        { toolId: 'mcp-slack-b', toolName: 'b', serverName: 'slack', enabled: true },
      ],
    };

    const removed = await service().unassignServer(AGENT_ID, 'github');

    expect(removed).toBe(1);
    expect(stored().map((tool) => tool.toolId)).toEqual(['mcp-slack-b']);
  });

  it('writes nothing when the agent has none of that server\'s tools', async () => {
    mocks.agentRow = {
      assigned: [{ toolId: 'mcp-slack-b', toolName: 'b', serverName: 'slack', enabled: true }],
    };

    const removed = await service().unassignServer(AGENT_ID, 'github');

    expect(removed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });
});
