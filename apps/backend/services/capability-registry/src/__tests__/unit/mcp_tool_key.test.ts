import { describe, expect, it } from 'vitest';
import {
  MCP_CONTEXT_PARAM,
  MCP_TOOL_PREFIX,
  buildMcpToolRegistration,
  extractMcpExecutionContext,
  isMcpToolKey,
  mcpToolKey,
  parseMcpToolKey,
  withMcpExecutionContext,
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

describe('MCP execution context', () => {
  const context = { userId: 'user-1', projectId: 'proj-1', agentId: 'agent-1' };

  it('round-trips the trusted identity', () => {
    const params = withMcpExecutionContext({ query: 'bug' }, context);

    expect(extractMcpExecutionContext(params)).toEqual({
      context,
      args: { query: 'bug' },
    });
  });

  it('overrides a model-supplied context, so an identity cannot be forged', () => {
    const forged = {
      query: 'bug',
      [MCP_CONTEXT_PARAM]: { userId: 'victim', projectId: 'p', agentId: 'a' },
    };

    const extracted = extractMcpExecutionContext(withMcpExecutionContext(forged, context));

    expect(extracted.context).toEqual(context);
  });

  it('never forwards internal ids to the remote server as tool arguments', () => {
    const params = withMcpExecutionContext({ query: 'bug' }, context);

    const { args } = extractMcpExecutionContext(params);

    expect(Object.keys(args)).toEqual(['query']);
    expect(JSON.stringify(args)).not.toContain('user-1');
    expect(JSON.stringify(args)).not.toContain('proj-1');
  });

  it('reports no context when none was injected', () => {
    expect(extractMcpExecutionContext({ query: 'bug' })).toEqual({
      context: null,
      args: { query: 'bug' },
    });
  });

  it.each([
    ['a missing agentId', { userId: 'u', projectId: 'p' }],
    ['a missing projectId', { userId: 'u', agentId: 'a' }],
    ['a missing userId', { projectId: 'p', agentId: 'a' }],
    ['a non-string userId', { userId: 7, projectId: 'p', agentId: 'a' }],
    ['a non-object value', 'not-a-context'],
  ])('rejects %s rather than trusting it', (_label, raw) => {
    const extracted = extractMcpExecutionContext({ query: 'bug', [MCP_CONTEXT_PARAM]: raw });

    expect(extracted.context).toBeNull();
    expect(extracted.args).toEqual({ query: 'bug' });
  });

  it('strips the reserved key even when the context is malformed', () => {
    const { args } = extractMcpExecutionContext({
      query: 'bug',
      [MCP_CONTEXT_PARAM]: { userId: 'u' },
    });

    expect(Object.keys(args)).toEqual(['query']);
  });

  it('tolerates null and undefined parameters', () => {
    expect(extractMcpExecutionContext(null)).toEqual({ context: null, args: {} });
    expect(extractMcpExecutionContext(undefined)).toEqual({ context: null, args: {} });
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

  it('requires approval for a third-party tool with no annotations', () => {
    const registration = buildMcpToolRegistration('github', { name: 'create_issue' });

    expect(
      registration.requiresApproval,
      'an unannotated remote tool may mutate a real external system, so it must not auto-approve'
    ).toBe(true);
  });

  it('does not require approval for a tool the server marks read-only', () => {
    const registration = buildMcpToolRegistration('github', {
      name: 'search',
      annotations: { readOnlyHint: true },
    });

    expect(registration.requiresApproval).toBe(false);
  });

  it('requires approval when the server marks the tool destructive', () => {
    const registration = buildMcpToolRegistration('github', {
      name: 'delete_repo',
      annotations: { readOnlyHint: false, destructiveHint: true },
    });

    expect(registration.requiresApproval).toBe(true);
  });

  it('lets destructiveHint override a contradictory readOnlyHint', () => {
    // A server advertising BOTH is self-contradictory; the destructive claim has
    // to win, or a mislabelled delete would auto-approve.
    const registration = buildMcpToolRegistration('github', {
      name: 'delete_repo',
      annotations: { readOnlyHint: true, destructiveHint: true },
    });

    expect(registration.requiresApproval).toBe(true);
  });

  it('ignores a readOnlyHint that is not a boolean', () => {
    const registration = buildMcpToolRegistration('github', {
      name: 'search',
      annotations: { readOnlyHint: 'yes' },
    });

    expect(registration.requiresApproval).toBe(true);
  });

  it('preserves the server annotations so policy can be revisited later', () => {
    const registration = buildMcpToolRegistration('github', {
      name: 'search',
      annotations: { readOnlyHint: true, title: 'Search' },
    });

    expect(registration.metadata.annotations).toEqual({ readOnlyHint: true, title: 'Search' });
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

  it('refuses an unregistered server rather than guessing positionally', () => {
    expect(parseMcpToolKey('mcp-unknown-thing', [])).toBeNull();
  });

  it('resolves against a registered server even when the TOOL name has hyphens', () => {
    // Genuinely ambiguous: with only `github` registered this is server `github`
    // + tool `copilot-create_issue`, which is a real shape. The registered-name
    // match is the disambiguation — a wrong guess here fails at the remote with
    // "unknown tool" rather than performing another server's action.
    expect(parseMcpToolKey('mcp-github-copilot-create_issue', ['github'])).toEqual({
      serverName: 'github',
      toolName: 'copilot-create_issue',
    });
  });

  it('still resolves once the hyphenated server is registered', () => {
    expect(parseMcpToolKey('mcp-github-copilot-create_issue', ['github', 'github-copilot'])).toEqual(
      { serverName: 'github-copilot', toolName: 'create_issue' }
    );
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
