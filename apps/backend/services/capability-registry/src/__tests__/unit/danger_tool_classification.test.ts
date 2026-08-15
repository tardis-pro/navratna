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
