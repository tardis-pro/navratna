import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mocks } = vi.hoisted(() => {
  // config.ts throws at module scope when these are absent, which aborts the
  // whole suite at import time. capability-registry has no vitest setupFile.
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
  return {
    mocks: {
      listServerKeys: vi.fn(),
      integrationCallTool: vi.fn(),
      legacyExecuteTool: vi.fn(),
      getRegisteredServerNames: vi.fn(),
    },
  };
});

vi.mock('@uaip/shared-services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/shared-services')>();
  return {
    ...actual,
    McpConnectionResolver: {
      getInstance: () => ({ listServerKeys: mocks.listServerKeys }),
    },
  };
});

vi.mock('../../services/integration_mcp_executor', () => ({
  IntegrationMcpExecutor: {
    getInstance: () => ({ callTool: mocks.integrationCallTool }),
  },
}));

vi.mock('../../services/mcp_client_service', () => ({
  MCPClientService: {
    getInstance: () => ({
      executeTool: mocks.legacyExecuteTool,
      getRegisteredServerNames: mocks.getRegisteredServerNames,
    }),
  },
}));

vi.mock('@uaip/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uaip/utils')>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});

const { BaseToolExecutor } = await import('../../services/base_tool_executor');
const { MCP_CONTEXT_PARAM, withMcpExecutionContext } = await import('../../utils/mcp_tool_key');

const CONTEXT = { userId: 'user-1', projectId: 'proj-1', agentId: 'agent-1' };

beforeEach(() => {
  mocks.listServerKeys.mockReset().mockResolvedValue(['github', 'atlassian']);
  mocks.integrationCallTool.mockReset().mockResolvedValue({ content: [{ text: 'ok' }] });
  mocks.legacyExecuteTool.mockReset().mockResolvedValue({ legacy: true });
  mocks.getRegisteredServerNames.mockReset().mockReturnValue(['calculator', 'filesystem']);
});

describe('integration MCP dispatch', () => {
  it('routes a DB-registered integration server to the caller-scoped executor', async () => {
    const executor = new BaseToolExecutor();

    await executor.execute(
      'mcp-github-create_issue',
      withMcpExecutionContext({ title: 'Bug' }, CONTEXT)
    );

    expect(mocks.integrationCallTool).toHaveBeenCalledTimes(1);
    expect(mocks.legacyExecuteTool).not.toHaveBeenCalled();
  });

  it('passes the authenticated identity, never a model-supplied one', async () => {
    const executor = new BaseToolExecutor();

    await executor.execute(
      'mcp-github-create_issue',
      withMcpExecutionContext({ title: 'Bug', userId: 'attacker' }, CONTEXT)
    );

    expect(mocks.integrationCallTool).toHaveBeenCalledWith(
      {
        serverKey: 'github',
        projectId: 'proj-1',
        agentId: 'agent-1',
        actorUserId: 'user-1',
      },
      'create_issue',
      { title: 'Bug', userId: 'attacker' }
    );
  });

  it('strips the internal context before the arguments reach the remote server', async () => {
    const executor = new BaseToolExecutor();

    await executor.execute(
      'mcp-github-search',
      withMcpExecutionContext({ query: 'bug' }, CONTEXT)
    );

    const forwardedArgs = mocks.integrationCallTool.mock.calls[0][2];
    expect(Object.keys(forwardedArgs)).toEqual(['query']);
    expect(forwardedArgs).not.toHaveProperty(MCP_CONTEXT_PARAM);
  });

  it('resolves a hyphenated integration server key correctly', async () => {
    mocks.listServerKeys.mockResolvedValue(['google-calendar']);
    const executor = new BaseToolExecutor();

    await executor.execute(
      'mcp-google-calendar-events_list',
      withMcpExecutionContext({}, CONTEXT)
    );

    expect(mocks.integrationCallTool.mock.calls[0][0].serverKey).toBe('google-calendar');
    expect(mocks.integrationCallTool.mock.calls[0][1]).toBe('events_list');
  });

  it('returns the provider result inside the standard MCP envelope', async () => {
    mocks.integrationCallTool.mockResolvedValue({ content: [{ text: 'created #12' }] });
    const executor = new BaseToolExecutor();

    const result = await executor.execute(
      'mcp-github-create_issue',
      withMcpExecutionContext({}, CONTEXT)
    );

    expect(result).toMatchObject({
      toolId: 'mcp-github-create_issue',
      serverName: 'github',
      toolName: 'create_issue',
      protocol: 'mcp',
      success: true,
      result: { content: [{ text: 'created #12' }] },
    });
  });
});

describe('authorization', () => {
  it('refuses an integration tool with no authenticated context', async () => {
    const executor = new BaseToolExecutor();

    await expect(
      executor.execute('mcp-github-create_issue', { title: 'Bug' })
    ).rejects.toThrow(/authenticated user, project and agent context/);
  });

  it('never reaches the provider when the context is missing', async () => {
    const executor = new BaseToolExecutor();

    await executor.execute('mcp-github-create_issue', { title: 'Bug' }).catch(() => undefined);

    expect(mocks.integrationCallTool).not.toHaveBeenCalled();
    expect(mocks.legacyExecuteTool).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing agentId', { userId: 'u', projectId: 'p' }],
    ['a missing projectId', { userId: 'u', agentId: 'a' }],
    ['a missing userId', { projectId: 'p', agentId: 'a' }],
  ])('refuses %s rather than executing under a partial identity', async (_label, partial) => {
    const executor = new BaseToolExecutor();

    await expect(
      executor.execute('mcp-github-create_issue', {
        title: 'Bug',
        [MCP_CONTEXT_PARAM]: partial,
      })
    ).rejects.toThrow(/authenticated user, project and agent context/);
    expect(mocks.integrationCallTool).not.toHaveBeenCalled();
  });

  it('surfaces a resolver refusal instead of falling back to the legacy path', async () => {
    mocks.integrationCallTool.mockRejectedValue(
      Object.assign(new Error('No enabled integration connection'), {
        code: 'no_integration_connection',
      })
    );
    const executor = new BaseToolExecutor();

    await expect(
      executor.execute('mcp-github-create_issue', withMcpExecutionContext({}, CONTEXT))
    ).rejects.toThrow(/No enabled integration connection/);
    expect(mocks.legacyExecuteTool).not.toHaveBeenCalled();
  });
});

describe('legacy MCP path is unchanged', () => {
  it('routes a non-integration server to the existing client service', async () => {
    const executor = new BaseToolExecutor();

    await executor.execute('mcp-calculator-add', { a: 1, b: 2 });

    expect(mocks.legacyExecuteTool).toHaveBeenCalledWith('calculator', 'add', { a: 1, b: 2 });
    expect(mocks.integrationCallTool).not.toHaveBeenCalled();
  });

  it('does not require an authenticated context for a legacy server', async () => {
    const executor = new BaseToolExecutor();

    await expect(executor.execute('mcp-calculator-add', { a: 1 })).resolves.toMatchObject({
      serverName: 'calculator',
      success: true,
    });
  });

  it('keeps working when no integration servers are registered at all', async () => {
    mocks.listServerKeys.mockResolvedValue([]);
    const executor = new BaseToolExecutor();

    await executor.execute('mcp-filesystem-read_file', { path: '/tmp/a' });

    expect(mocks.legacyExecuteTool).toHaveBeenCalledWith('filesystem', 'read_file', {
      path: '/tmp/a',
    });
  });

  it('rejects a malformed MCP tool id', async () => {
    const executor = new BaseToolExecutor();

    await expect(executor.execute('mcp-onlyserver', {})).rejects.toThrow(/MCP execution failed/);
  });
});
