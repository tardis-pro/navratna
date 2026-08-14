import { describe, it, expect, vi } from 'vitest';

vi.mock('../../database/drizzle/clients/index', () => ({
  getControlDb: () => ({}),
  getIntelligenceDb: () => ({}),
  initializePlanes: async () => undefined,
}));

const { defaultToolBinding } = await import(
  '../../database/migrations/ensure_default_agent_tools'
);
const migrationSource = await import('node:fs').then((fs) =>
  fs.readFileSync(
    new URL('../../database/migrations/ensure_default_agent_tools.ts', import.meta.url),
    'utf8'
  )
);

/**
 * The binding's toolId doubles as BaseToolExecutor's dispatch key (the switch
 * matches on the string), and loadToolSchema resolves non-UUID ids by NAME.
 * A drifting name silently drops the tool from every turn.
 */
describe('defaultToolBinding', () => {
  it('uses the tool name as both id and name so name-based resolution and dispatch agree', () => {
    const binding = defaultToolBinding('time-utility');
    expect(binding.toolId).toBe('time-utility');
    expect(binding.toolName).toBe('time-utility');
    expect(binding.enabled).toBe(true);
    expect(binding.requiresApproval).toBe(false);
  });

  it('marks the server as native so the tool is never mistaken for an mcp-* integration', () => {
    expect(defaultToolBinding('math-calculator').serverName).toBe('native');
    // mcp-* prefixed ids default to requiresApproval in toAssignedTools; these must not.
    expect(defaultToolBinding('math-calculator').toolId.startsWith('mcp-')).toBe(false);
  });
});

describe('default tool selection (security invariants)', () => {
  it('never auto-assigns shell-exec or http-request', () => {
    // The DEFAULT_TOOLS list is module-private on purpose; assert on the source
    // so a future edit adding a dangerous default fails loudly here.
    const defaultsBlock = migrationSource.slice(
      migrationSource.indexOf('const DEFAULT_TOOLS'),
      migrationSource.indexOf('export const defaultToolBinding')
    );
    expect(defaultsBlock).not.toContain('shell-exec');
    expect(defaultsBlock).not.toContain('http-request');
    expect(defaultsBlock).toContain("name: 'time-utility'");
    expect(defaultsBlock).toContain("name: 'math-calculator'");
  });

  it('excludes the onboarding guide and gates the append on a containment probe', () => {
    // The guide is a server-driven interviewer; tools widen its injection
    // surface. The @> probe is what makes the UPDATE idempotent and safe under
    // concurrent multi-instance boot.
    expect(migrationSource).toContain('ONBOARDING_GUIDE_AGENT_ID');
    expect(migrationSource).toMatch(/NOT \(COALESCE\(assigned_mcp_tools, '\[\]'::jsonb\) @>/);
  });
});
