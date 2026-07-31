import { describe, expect, it } from 'vitest';
import {
  MCP_TOOL_PREFIX,
  buildMcpToolRegistration,
  isMcpToolKey,
  mcpToolKey,
  parseMcpToolKey,
} from '../../utils/mcp_tool_key';

describe('mcpToolKey', () => {
  it('builds the dispatch key BaseToolExecutor switches on', () => {
    expect(mcpToolKey('calculator', 'add')).toBe('mcp-calculator-add');
    expect(mcpToolKey('calculator', 'add').startsWith(MCP_TOOL_PREFIX)).toBe(true);
  });

  it('keeps two servers exposing the same tool name distinct', () => {
    expect(mcpToolKey('github', 'search')).not.toBe(mcpToolKey('slack', 'search'));
  });
});

describe('isMcpToolKey', () => {
  it('recognises MCP keys and rejects everything else', () => {
    expect(isMcpToolKey('mcp-calculator-add')).toBe(true);
    expect(isMcpToolKey('shell-exec')).toBe(false);
    expect(isMcpToolKey('oauth-github-list-repos')).toBe(false);
    expect(isMcpToolKey('task-create')).toBe(false);
  });
});

describe('buildMcpToolRegistration', () => {
  it('registers under the dispatch key, not the raw MCP name', () => {
    const registration = buildMcpToolRegistration('calculator', { name: 'add' });

    expect(registration.name).toBe('mcp-calculator-add');
    expect(registration.id).toBe('mcp-calculator-add');
    expect(registration.displayName).toBe('add');
  });

  it('keeps two servers exposing the same tool name from colliding on the UNIQUE name column', () => {
    const github = buildMcpToolRegistration('github', { name: 'search' });
    const slack = buildMcpToolRegistration('slack', { name: 'search' });

    expect(github.name).not.toBe(slack.name);
    expect(github.displayName).toBe(slack.displayName);
  });

  it('carries the input schema through as parameters', () => {
    const schema = { type: 'object', properties: { q: { type: 'string' } } };
    const registration = buildMcpToolRegistration('github', {
      name: 'search',
      inputSchema: schema,
    });

    expect(registration.parameters).toEqual(schema);
  });

  it('records which server a tool came from', () => {
    const registration = buildMcpToolRegistration('github-copilot', { name: 'create_issue' });

    expect(registration.metadata).toEqual({
      mcpServer: 'github-copilot',
      mcpTool: 'create_issue',
      protocol: 'mcp',
    });
  });

  it('synthesises a description when the server omits one', () => {
    const registration = buildMcpToolRegistration('calculator', { name: 'add' });
    expect(registration.description).toBe('add from calculator MCP server');
  });

  it('prefers the server-supplied description', () => {
    const registration = buildMcpToolRegistration('calculator', {
      name: 'add',
      description: 'Adds two numbers',
    });
    expect(registration.description).toBe('Adds two numbers');
  });

  it('defaults parameters to an empty object when no schema is given', () => {
    expect(buildMcpToolRegistration('calculator', { name: 'add' }).parameters).toEqual({});
  });
});

describe('parseMcpToolKey', () => {
  const servers = ['calculator', 'github', 'github-copilot', 'atlassian'];

  it('round-trips a simple key', () => {
    expect(parseMcpToolKey(mcpToolKey('calculator', 'add'), servers)).toEqual({
      serverName: 'calculator',
      toolName: 'add',
    });
  });

  it('keeps hyphenated tool names intact', () => {
    expect(parseMcpToolKey('mcp-atlassian-create_issue-draft', servers)).toEqual({
      serverName: 'atlassian',
      toolName: 'create_issue-draft',
    });
  });

  it('resolves a hyphenated SERVER name, which a positional split gets wrong', () => {
    // The old `parts[1]` split returned server 'github' and tool 'copilot-create_issue'.
    expect(parseMcpToolKey('mcp-github-copilot-create_issue', servers)).toEqual({
      serverName: 'github-copilot',
      toolName: 'create_issue',
    });
  });

  it('prefers the longest matching server when one name prefixes another', () => {
    const parsed = parseMcpToolKey('mcp-github-copilot-search', ['github', 'github-copilot']);
    expect(parsed?.serverName).toBe('github-copilot');
  });

  it('still resolves the shorter server when the longer one does not match', () => {
    expect(parseMcpToolKey('mcp-github-search', servers)).toEqual({
      serverName: 'github',
      toolName: 'search',
    });
  });

  it('falls back to a positional split for an unregistered server', () => {
    expect(parseMcpToolKey('mcp-unknown-thing', [])).toEqual({
      serverName: 'unknown',
      toolName: 'thing',
    });
  });

  it('rejects a non-MCP key', () => {
    expect(parseMcpToolKey('shell-exec', servers)).toBeNull();
  });

  it('rejects a malformed key with no tool segment', () => {
    expect(parseMcpToolKey('mcp-calculator', servers)).toBeNull();
    expect(parseMcpToolKey('mcp-calculator-', servers)).toBeNull();
  });

  it('round-trips the key that discovery actually registers', () => {
    const registration = buildMcpToolRegistration('calculator', { name: 'add' });
    expect(parseMcpToolKey(registration.name, ['calculator'])).toEqual({
      serverName: 'calculator',
      toolName: 'add',
    });
  });

  it('round-trips every key it builds', () => {
    const cases: [string, string][] = [
      ['calculator', 'add'],
      ['github-copilot', 'create_issue'],
      ['atlassian', 'jira-search'],
    ];
    const names = cases.map(([server]) => server);

    for (const [server, tool] of cases) {
      expect(parseMcpToolKey(mcpToolKey(server, tool), names)).toEqual({
        serverName: server,
        toolName: tool,
      });
    }
  });
});
