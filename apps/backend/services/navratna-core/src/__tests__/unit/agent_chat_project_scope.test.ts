import { describe, it, expect, vi } from 'vitest';

vi.mock('@uaip/utils', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  isRecord: (val: unknown) => typeof val === 'object' && val !== null && !Array.isArray(val),
}));

const { filterToolsForProject } = await import('@uaip/agent-intelligence-core');

const tool = (toolId: string, serverName: string) => ({
  toolId,
  toolName: toolId,
  serverName,
  enabled: true,
});

const GITHUB = tool('mcp-github-create_issue', 'github');
const SLACK = tool('mcp-slack-post_message', 'slack');
const LOCAL = tool('mcp-calc-add', 'calc');

describe('filterToolsForProject', () => {
  it('keeps an integration tool bound to this project', () => {
    const kept = filterToolsForProject([GITHUB], {
      integrationServerKeys: ['github', 'slack'],
      boundServerKeys: ['github'],
    });

    expect(kept.map((t) => t.toolId)).toEqual(['mcp-github-create_issue']);
  });

  it('drops an integration tool bound only to a DIFFERENT project', () => {
    const kept = filterToolsForProject([GITHUB, SLACK], {
      integrationServerKeys: ['github', 'slack'],
      boundServerKeys: ['github'],
    });

    expect(
      kept.map((t) => t.toolId),
      "slack is bound elsewhere, so this project's chat must not be offered it"
    ).toEqual(['mcp-github-create_issue']);
  });

  it('leaves a non-integration MCP tool alone', () => {
    const kept = filterToolsForProject([LOCAL], {
      integrationServerKeys: ['github', 'slack'],
      boundServerKeys: [],
    });

    expect(kept.map((t) => t.toolId)).toEqual(['mcp-calc-add']);
  });

  it('drops every integration tool when the caller named no project', () => {
    const kept = filterToolsForProject([GITHUB, SLACK, LOCAL], {
      integrationServerKeys: ['github', 'slack'],
      boundServerKeys: [],
    });

    expect(
      kept.map((t) => t.toolId),
      'without a project the credential cannot resolve, so offering the tool guarantees a failed call'
    ).toEqual(['mcp-calc-add']);
  });

  it('keeps everything when no server is a caller-bound integration', () => {
    const kept = filterToolsForProject([GITHUB, LOCAL], {
      integrationServerKeys: [],
      boundServerKeys: [],
    });

    expect(kept).toHaveLength(2);
  });

  it('hides every mcp tool when the scope could not be read', () => {
    const kept = filterToolsForProject([GITHUB, SLACK, LOCAL], {
      integrationServerKeys: [],
      boundServerKeys: [],
      unknownScope: true,
    });

    expect(
      kept,
      'an unreadable scope must hide tools, not expose a credential bound elsewhere'
    ).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const assigned = [GITHUB, SLACK];

    filterToolsForProject(assigned, {
      integrationServerKeys: ['github', 'slack'],
      boundServerKeys: [],
    });

    expect(assigned).toHaveLength(2);
  });
});

const { toAssignedTools } = await import('@uaip/agent-intelligence-core');

describe('toAssignedTools approval default', () => {
  it('gates an external tool whose stored row predates the approval policy', () => {
    const [parsed] = toAssignedTools([
      { toolId: 'mcp-github-create_issue', toolName: 'mcp-github-create_issue', serverName: 'github' },
    ]);

    expect(
      parsed.requiresApproval,
      'a legacy row carries no flag; reading that as false auto-executes a third-party action'
    ).toBe(true);
  });

  it('honours an explicit false from the server annotations', () => {
    const [parsed] = toAssignedTools([
      {
        toolId: 'mcp-github-search',
        toolName: 'mcp-github-search',
        serverName: 'github',
        requiresApproval: false,
      },
    ]);

    expect(parsed.requiresApproval).toBe(false);
  });

  it('honours an explicit true', () => {
    const [parsed] = toAssignedTools([
      {
        toolId: 'mcp-github-delete',
        toolName: 'mcp-github-delete',
        serverName: 'github',
        requiresApproval: true,
      },
    ]);

    expect(parsed.requiresApproval).toBe(true);
  });

  it('leaves a built-in tool ungated by default', () => {
    const [parsed] = toAssignedTools([
      { toolId: 'file-reader', toolName: 'file-reader', serverName: '' },
    ]);

    expect(parsed.requiresApproval).toBe(false);
  });
});
