/**
 * E2E Approval Flow Test
 *
 * Tests the complete LLM→plan→approval→execution pipeline:
 * 1. Agent creates a plan with a danger tool
 * 2. ToolExecutionCoordinator checks and blocks (requires approval)
 * 3. Approval workflow is created
 * 4. Approval is granted
 * 5. Tool execution proceeds
 */

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

const mockEventBus = {
  publish: vi.fn().mockResolvedValue(undefined),
  subscribe: vi
    .fn()
    .mockImplementation((topic: string, handler: (event: unknown) => Promise<void>) => {
      const subscriptionId = generateId();
      return { subscriptionId, topic, handler, unsubscribe: vi.fn() };
    }),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  request: vi.fn().mockResolvedValue({ success: true, data: {} }),
  publishSync: vi.fn().mockResolvedValue(undefined),
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// The approval-request event is only published when the workflow feature is on
// (config.tools.enableApprovalWorkflow, default false). Blocking happens either
// way — the flag only chooses whether the refusal also raises a reviewable
// request — and the "should emit tool.approval.required" cases below are about
// exactly that branch, so the flag has to be on for this file. Set before the
// coordinator module is imported in beforeAll, since config is read at module
// evaluation time.
process.env.ENABLE_APPROVAL_WORKFLOW = 'true';

// NOTE: this file used to vi.mock('../services/danger_tool_list.js') with a
// hand-written classification table. Two things were wrong with that. The path
// was wrong — vi.mock resolves relative to *this* file, so '../services/…' meant
// src/__tests__/services/…, which does not exist, and the mock silently never
// applied. And had it applied it would have been worse: an approval-flow E2E
// that replaces the module deciding what needs approval is asserting its own
// fixture, not the platform's policy. The real danger_tool_list is used here on
// purpose; its rows for file.write / process.run are what these cases assert.

describe('E2E Approval Flow: LLM→plan→approval→execution', () => {
  let ToolExecutionCoordinator: unknown;

  beforeAll(async () => {
    const module = await import('../../services/tool_execution_coordinator_service.ts');
    ToolExecutionCoordinator = (module as Record<string, unknown>).ToolExecutionCoordinator;
  });

  describe('danger-tool classification is fail-closed', () => {
    it('demands approval for ids no DANGER_TOOLS row matches', async () => {
      const { toolRequiresApproval, getRequiredApprovalLevel, isToolClassified } = await import(
        '../../services/danger_tool_list.js'
      );

      // These three ids describe tools that do not exist in this service. The
      // original version of this test asserted they need NO approval, which was
      // true back when an unmatched id returned null and every caller read null
      // as "safe" — the hole that let shell-exec reach execAsync unapproved.
      // classifyTool now falls back to UNCLASSIFIED_TOOL, so an id nobody has
      // classified is the most restricted thing in the system, not the least.
      for (const unknownToolId of ['file.read', 'http.get', 'math.add']) {
        expect(isToolClassified(unknownToolId)).toBe(false);
        expect(toolRequiresApproval(unknownToolId)).toBe(true);
        expect(getRequiredApprovalLevel(unknownToolId)).toBe('SECURITY_TEAM');
      }
    });

    it('lets explicitly-classified harmless tools through without approval', async () => {
      const { toolRequiresApproval, isToolClassified } = await import(
        '../../services/danger_tool_list.js'
      );

      // The counterpart to the above: "no approval needed" must come from a
      // reviewed LOW/NONE row, never from the absence of a row.
      for (const safeToolId of ['file-reader', 'math-calculator', 'web-search']) {
        expect(isToolClassified(safeToolId)).toBe(true);
        expect(toolRequiresApproval(safeToolId)).toBe(false);
      }
    });
  });

  describe('ToolExecutionCoordinator.checkAndEnforceApproval', () => {
    it('should block execution when approval is required but not granted (file.write)', async () => {
      const mockCoordinator = {
        eventBus: mockEventBus,
        logger: mockLogger,
        hasApprovalLevel: function (userLevel: string | undefined, requiredLevel: string): boolean {
          const approvalHierarchy = ['NONE', 'USER_CONSENT', 'MANAGER', 'ADMIN', 'SECURITY_TEAM'];
          const userIndex = userLevel ? approvalHierarchy.indexOf(userLevel) : -1;
          const requiredIndex = approvalHierarchy.indexOf(requiredLevel);
          if (requiredIndex === -1) return false;
          if (userIndex === -1) return false;
          return userIndex >= requiredIndex;
        },
      };

      const checkAndEnforceApproval =
        ToolExecutionCoordinator.prototype.checkAndEnforceApproval.bind(mockCoordinator);

      const event = {
        toolId: 'file.write',
        requestId: generateId(),
        userId: 'user-123',
        agentId: 'agent-456',
        projectId: 'project-789',
        securityContext: {
          approvalStatus: {
            isApproved: false,
            approvalLevel: undefined,
          },
        },
      };

      const result = await checkAndEnforceApproval(event, event.requestId);

      expect(result.blocked).toBe(true);
      expect(result.requiredApproval).toBe('USER_CONSENT');
      expect(result.approvalRequestId).toBeDefined();
      expect(result.approvalRequestId).toContain('approval_');
    });

    // 'math-calculator', not 'math.add': the id has to be one the real
    // danger-tool table classifies LOW/NONE. 'math.add' is not in the table at
    // all, and an unclassified id is now refused rather than waved through.
    it('should allow execution when tool does not require approval (math-calculator)', async () => {
      const mockCoordinator = {
        eventBus: mockEventBus,
        logger: mockLogger,
        hasApprovalLevel: function (userLevel: string | undefined, requiredLevel: string): boolean {
          const approvalHierarchy = ['NONE', 'USER_CONSENT', 'MANAGER', 'ADMIN', 'SECURITY_TEAM'];
          const userIndex = userLevel ? approvalHierarchy.indexOf(userLevel) : -1;
          const requiredIndex = approvalHierarchy.indexOf(requiredLevel);
          if (requiredIndex === -1) return false;
          if (userIndex === -1) return false;
          return userIndex >= requiredIndex;
        },
      };

      const checkAndEnforceApproval =
        ToolExecutionCoordinator.prototype.checkAndEnforceApproval.bind(mockCoordinator);

      const event = {
        toolId: 'math-calculator',
        requestId: generateId(),
        userId: 'user-123',
        agentId: 'agent-456',
        projectId: 'project-789',
        securityContext: {
          approvalStatus: {
            isApproved: false,
            approvalLevel: undefined,
          },
        },
      };

      const result = await checkAndEnforceApproval(event, event.requestId);

      expect(result.blocked).toBe(false);
      expect(result.requiredApproval).toBe('NONE');
    });

    it('should allow execution when approval is granted with sufficient level', async () => {
      const mockCoordinator = {
        eventBus: mockEventBus,
        logger: mockLogger,
        hasApprovalLevel: function (userLevel: string | undefined, requiredLevel: string): boolean {
          const approvalHierarchy = ['NONE', 'USER_CONSENT', 'MANAGER', 'ADMIN', 'SECURITY_TEAM'];
          const userIndex = userLevel ? approvalHierarchy.indexOf(userLevel) : -1;
          const requiredIndex = approvalHierarchy.indexOf(requiredLevel);
          if (requiredIndex === -1) return false;
          if (userIndex === -1) return false;
          return userIndex >= requiredIndex;
        },
      };

      const checkAndEnforceApproval =
        ToolExecutionCoordinator.prototype.checkAndEnforceApproval.bind(mockCoordinator);

      const event = {
        toolId: 'file.write',
        requestId: generateId(),
        userId: 'user-123',
        agentId: 'agent-456',
        projectId: 'project-789',
        securityContext: {
          approvalStatus: {
            isApproved: true,
            approvedBy: 'admin-user',
            approvalLevel: 'MANAGER',
          },
        },
      };

      const result = await checkAndEnforceApproval(event, event.requestId);

      // USER_CONSENT is satisfied by MANAGER level
      expect(result.blocked).toBe(false);
      expect(result.requiredApproval).toBe('USER_CONSENT');
    });

    it('should block execution when approval level is insufficient (CRITICAL risk)', async () => {
      const mockCoordinator = {
        eventBus: mockEventBus,
        logger: mockLogger,
        hasApprovalLevel: function (userLevel: string | undefined, requiredLevel: string): boolean {
          const approvalHierarchy = ['NONE', 'USER_CONSENT', 'MANAGER', 'ADMIN', 'SECURITY_TEAM'];
          const userIndex = userLevel ? approvalHierarchy.indexOf(userLevel) : -1;
          const requiredIndex = approvalHierarchy.indexOf(requiredLevel);
          if (requiredIndex === -1) return false;
          if (userIndex === -1) return false;
          return userIndex >= requiredIndex;
        },
      };

      const checkAndEnforceApproval =
        ToolExecutionCoordinator.prototype.checkAndEnforceApproval.bind(mockCoordinator);

      const event = {
        toolId: 'process.run',
        requestId: generateId(),
        userId: 'user-123',
        agentId: 'agent-456',
        projectId: 'project-789',
        securityContext: {
          approvalStatus: {
            isApproved: true,
            approvedBy: 'manager-user',
            approvalLevel: 'MANAGER',
          },
        },
      };

      const result = await checkAndEnforceApproval(event, event.requestId);

      // ADMIN is required, but MANAGER is insufficient
      expect(result.blocked).toBe(true);
      expect(result.requiredApproval).toBe('ADMIN');
    });
  });

  describe('Approval Level Hierarchy', () => {
    it('should correctly compare approval levels', () => {
      const approvalHierarchy = ['NONE', 'USER_CONSENT', 'MANAGER', 'ADMIN', 'SECURITY_TEAM'];

      // USER_CONSENT satisfies USER_CONSENT
      expect(approvalHierarchy.indexOf('USER_CONSENT')).toBeGreaterThanOrEqual(
        approvalHierarchy.indexOf('USER_CONSENT')
      );

      // MANAGER satisfies USER_CONSENT
      expect(approvalHierarchy.indexOf('MANAGER')).toBeGreaterThanOrEqual(
        approvalHierarchy.indexOf('USER_CONSENT')
      );

      // ADMIN satisfies MANAGER
      expect(approvalHierarchy.indexOf('ADMIN')).toBeGreaterThanOrEqual(
        approvalHierarchy.indexOf('MANAGER')
      );

      // SECURITY_TEAM satisfies all
      expect(approvalHierarchy.indexOf('SECURITY_TEAM')).toBeGreaterThanOrEqual(
        approvalHierarchy.indexOf('ADMIN')
      );

      // USER_CONSENT does NOT satisfy ADMIN
      expect(approvalHierarchy.indexOf('USER_CONSENT')).toBeLessThan(
        approvalHierarchy.indexOf('ADMIN')
      );
    });
  });

  describe('Full Approval Flow Integration', () => {
    it('should emit tool.approval.required event when blocking execution', async () => {
      const mockCoordinator = {
        eventBus: mockEventBus,
        logger: mockLogger,
        hasApprovalLevel: function (userLevel: string | undefined, requiredLevel: string): boolean {
          const approvalHierarchy = ['NONE', 'USER_CONSENT', 'MANAGER', 'ADMIN', 'SECURITY_TEAM'];
          const userIndex = userLevel ? approvalHierarchy.indexOf(userLevel) : -1;
          const requiredIndex = approvalHierarchy.indexOf(requiredLevel);
          if (requiredIndex === -1) return false;
          if (userIndex === -1) return false;
          return userIndex >= requiredIndex;
        },
      };

      const checkAndEnforceApproval =
        ToolExecutionCoordinator.prototype.checkAndEnforceApproval.bind(mockCoordinator);

      const event = {
        toolId: 'file.write',
        requestId: 'test-request-123',
        userId: 'user-123',
        agentId: 'agent-456',
        projectId: 'project-789',
        securityContext: {
          approvalStatus: {
            isApproved: false,
            approvalLevel: undefined,
          },
        },
      };

      await checkAndEnforceApproval(event, event.requestId);

      // Verify the event was published
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'tool.approval.required',
        expect.objectContaining({
          approvalRequestId: expect.any(String),
          toolId: 'file.write',
          requestId: expect.any(String),
          requiredApproval: 'USER_CONSENT',
          riskLevel: 'HIGH',
          categories: expect.arrayContaining(['FILE_SYSTEM']),
          userId: 'user-123',
          agentId: 'agent-456',
          projectId: 'project-789',
          timestamp: expect.any(String),
        })
      );
    });

    it('should emit tool.audit.log event when auditing is required', async () => {
      const mockCoordinator = {
        eventBus: mockEventBus,
        logger: mockLogger,
        hasApprovalLevel: function (userLevel: string | undefined, requiredLevel: string): boolean {
          const approvalHierarchy = ['NONE', 'USER_CONSENT', 'MANAGER', 'ADMIN', 'SECURITY_TEAM'];
          const userIndex = userLevel ? approvalHierarchy.indexOf(userLevel) : -1;
          const requiredIndex = approvalHierarchy.indexOf(requiredLevel);
          if (requiredIndex === -1) return false;
          if (userIndex === -1) return false;
          return userIndex >= requiredIndex;
        },
      };

      const checkAndEnforceApproval =
        ToolExecutionCoordinator.prototype.checkAndEnforceApproval.bind(mockCoordinator);

      const event = {
        toolId: 'file.write',
        requestId: 'test-request-456',
        userId: 'user-123',
        agentId: 'agent-456',
        projectId: 'project-789',
        securityContext: {
          approvalStatus: {
            isApproved: false,
            approvalLevel: undefined,
          },
        },
      };

      await checkAndEnforceApproval(event, event.requestId);

      // Verify the audit event was published
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        'tool.audit.log',
        expect.objectContaining({
          eventType: 'APPROVAL_REQUIRED',
          toolId: 'file.write',
          requestId: expect.any(String),
          approvalRequestId: expect.any(String),
          requiredApproval: 'USER_CONSENT',
          riskLevel: 'HIGH',
          categories: expect.arrayContaining(['FILE_SYSTEM']),
          userId: 'user-123',
          agentId: 'agent-456',
          projectId: 'project-789',
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('Approval Workflow Creation', () => {
    it('should generate unique approval request IDs', async () => {
      const requestIds = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const approvalRequestId = `approval_${generateId()}_${Date.now()}`;
        requestIds.add(approvalRequestId);
      }

      // All IDs should be unique
      expect(requestIds.size).toBe(100);
    });
  });
});
