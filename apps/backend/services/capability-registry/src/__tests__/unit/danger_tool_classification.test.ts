import { describe, it, expect, vi } from 'vitest';

// @uaip/shared-services transitively loads @uaip/config, which throws unless the
// JWT env is present. Same preamble the other unit tests in this directory use.
vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
  process.env.DELETION_HASH_SALT ||= 'test-deletion-hash-salt';
});

const { PROJECT_TASK_TOOL_IDS, CALENDAR_TOOL_IDS } = await import('@uaip/shared-services');
const { BASE_TOOL_EXECUTOR_TOOL_IDS } = await import('../../services/base_tool_executor');
const {
  DANGER_TOOLS,
  UNCLASSIFIED_TOOL,
  assertToolsClassified,
  classifyTool,
  getDangerToolConfig,
  getRequiredApprovalLevel,
  isToolClassified,
  matchesDangerToolPattern,
  toolRequiresApproval,
} = await import('../../services/danger_tool_list');

/**
 * The bug these cover: danger_tool_list keyed dotted ids ('process.run') while
 * base_tool_executor dispatched hyphenated ones ('shell-exec'). The two sets had
 * zero overlap, so getDangerToolConfig returned null for every real tool and both
 * enforcement paths read null as "not dangerous".
 */
describe('danger tool classification', () => {
  describe('the ids that actually reach an executor', () => {
    it('classifies shell-exec as requiring approval', () => {
      expect(isToolClassified('shell-exec')).toBe(true);
      expect(toolRequiresApproval('shell-exec')).toBe(true);
      expect(getRequiredApprovalLevel('shell-exec')).toBe('ADMIN');
      expect(classifyTool('shell-exec').riskLevel).toBe('CRITICAL');
    });

    it('leaves http-request runnable but audited', () => {
      expect(isToolClassified('http-request')).toBe(true);
      expect(toolRequiresApproval('http-request')).toBe(false);
      expect(classifyTool('http-request').auditRequired).toBe(true);
    });

    it('has an explicit row for every id BaseToolExecutor dispatches by name', () => {
      const unclassified = BASE_TOOL_EXECUTOR_TOOL_IDS.filter((id) => !isToolClassified(id));
      expect(unclassified).toEqual([]);
    });

    it('has a row for every statically-known project/task and calendar tool', () => {
      const ids = [...PROJECT_TASK_TOOL_IDS, ...CALENDAR_TOOL_IDS];
      expect(ids.filter((id) => !isToolClassified(id))).toEqual([]);
    });
  });

  describe('fail closed', () => {
    it('refuses an id no row matches rather than assuming it is safe', () => {
      expect(getDangerToolConfig('totally-unknown-tool')).toBeNull();
      expect(isToolClassified('totally-unknown-tool')).toBe(false);
      expect(classifyTool('totally-unknown-tool')).toBe(UNCLASSIFIED_TOOL);
      expect(toolRequiresApproval('totally-unknown-tool')).toBe(true);
      expect(getRequiredApprovalLevel('totally-unknown-tool')).toBe('SECURITY_TEAM');
    });

    it('assertToolsClassified throws and names the offenders', () => {
      expect(() => assertToolsClassified(['shell-exec'])).not.toThrow();
      expect(() => assertToolsClassified(['shell-exec', 'brand-new-tool'])).toThrow(
        /brand-new-tool/
      );
    });
  });

  describe('pattern matching', () => {
    it('matches hyphenated dynamic families', () => {
      expect(matchesDangerToolPattern('mcp-navratna-list_tasks', 'mcp-*')).toBe(true);
      expect(matchesDangerToolPattern('oauth-github-list-repos', 'oauth-*')).toBe(true);
      expect(isToolClassified('mcp-navratna-list_tasks')).toBe(true);
      expect(isToolClassified('oauth-github-list-repos')).toBe(true);
    });

    it('still matches the dotted patterns', () => {
      expect(matchesDangerToolPattern('file.write', 'file.write')).toBe(true);
      expect(matchesDangerToolPattern('eval.something', 'eval.*')).toBe(true);
    });

    it('resolves the more specific mcp pattern first', () => {
      // 'mcp.*' listed before 'mcp.server.*' would swallow this at MEDIUM/NONE.
      expect(getRequiredApprovalLevel('mcp.server.restart')).toBe('MANAGER');
      expect(getRequiredApprovalLevel('mcp.something')).toBe('NONE');
    });

    it('orders concrete ids ahead of the wildcard family rows', () => {
      expect(classifyTool('task-create').auditRequired).toBe(true);
      expect(classifyTool('task-list').auditRequired).toBe(false);
      expect(classifyTool('calendar-event-delete').riskLevel).toBe('HIGH');
      expect(classifyTool('calendar-list').riskLevel).toBe('LOW');
    });
  });

  it('never lets a NONE-approval row omit a reason', () => {
    for (const row of DANGER_TOOLS) {
      expect(row.reason.length).toBeGreaterThan(0);
    }
  });
});

const { toolDispatchKey } = await import('../../services/unified_tool_registry');

/**
 * The near-miss these cover: validateToolExecution originally classified
 * `tool.id`, which is the DB primary key — a generated UUID — while
 * executeStandard dispatches on the semantic NAME. Gating on the uuid would have
 * guarded a different identifier from the one that actually runs: every tool
 * would resolve to UNCLASSIFIED and be refused, including math-calculator. That
 * is the same shape as the original bug (danger list keyed on ids nothing
 * dispatched), so both sides now derive the key from toolDispatchKey.
 */
describe('dispatch key', () => {
  it('prefers the name over the generated uuid id', () => {
    expect(
      toolDispatchKey({ id: '7f3a1c92-4b21-4d3e-9c77-2a5b8e1f0d64', name: 'shell-exec' })
    ).toBe('shell-exec');
  });

  it('keeps a federation id, which IS the routing key', () => {
    expect(
      toolDispatchKey({ id: 'federation:sub-1:remote-tool', name: 'remote-tool' })
    ).toBe('federation:sub-1:remote-tool');
  });

  it('falls back to the id when there is no name', () => {
    expect(toolDispatchKey({ id: 'shell-exec' })).toBe('shell-exec');
  });

  it('classifies a DB-registered native tool by the key it dispatches on', () => {
    const tool = { id: '7f3a1c92-4b21-4d3e-9c77-2a5b8e1f0d64', name: 'shell-exec' };
    const key = toolDispatchKey(tool);

    // Classified and gated via the dispatch key...
    expect(isToolClassified(key)).toBe(true);
    expect(getRequiredApprovalLevel(key)).toBe('ADMIN');
    // ...whereas the raw uuid is unclassified, which is what would have refused
    // every tool in the system had the gate kept using tool.id.
    expect(isToolClassified(tool.id)).toBe(false);
  });

  it('leaves a harmless DB-registered tool runnable', () => {
    const key = toolDispatchKey({
      id: 'c1d2e3f4-a5b6-4789-9abc-def012345678',
      name: 'math-calculator',
    });
    expect(toolRequiresApproval(key)).toBe(false);
  });
});
