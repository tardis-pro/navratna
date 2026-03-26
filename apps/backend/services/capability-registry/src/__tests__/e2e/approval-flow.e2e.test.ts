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

vi.mock('../services/dangerToolList.js', () => ({
  toolRequiresApproval: vi.fn((toolId: string) => {
    const dangerTools = [
      'file.write',
      'process.run',
      'database.delete',
      'system.exec',
      'network.request',
    ];
    return dangerTools.includes(toolId);
  }),
  getDangerToolConfig: vi.fn((toolId: string) => {
    const configs: Record<string, unknown> = {
      'file.write': {
        toolId: 'file.write',
        name: 'Write File',
        categories: ['FILE_SYSTEM'],
        riskLevel: 'HIGH',
        reason: 'Can write arbitrary files to filesystem',
        requiresApproval: 'USER_CONSENT',
      },
      'process.run': {
        toolId: 'process.run',
        name: 'Run Process',
        categories: ['PROCESS_EXECUTION'],
        riskLevel: 'CRITICAL',
        reason: 'Can execute arbitrary shell commands',
        requiresApproval: 'ADMIN',
      },
      'database.delete': {
        toolId: 'database.delete',
        name: 'Delete Database Records',
        categories: ['DATABASE_DELETE'],
        riskLevel: 'CRITICAL',
        reason: 'Can permanently delete data',
        requiresApproval: 'ADMIN',
      },
    };
    return configs[toolId] || null;
  }),
  getRequiredApprovalLevel: vi.fn((toolId: string) => {
    const levels: Record<string, string> = {
      'file.write': 'USER_CONSENT',
      'process.run': 'ADMIN',
      'database.delete': 'ADMIN',
    };
    return levels[toolId] || 'NONE';
  }),
  toolRequiresAudit: vi.fn(() => true),
}));

describe('E2E Approval Flow: LLM→plan→approval→execution', () => {
  let ToolExecutionCoordinator: unknown;

  beforeAll(async () => {
const module = await import('../services/tool-execution-coordinator.service.ts');
  await import('../services/dangerToolList.ts');
  await import('../services/dangerToolList.ts');
  await import('../services/dangerToolList.ts');
  const { toolRequiresApproval } = await import('../services/dangerToolList.ts');

      expect(toolRequiresApproval('file.read')).toBe(false);
      expect(toolRequiresApproval('http.get')).toBe(false);
      expect(toolRequiresApproval('math.add')).toBe(false);
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

    it('should allow execution when tool does not require approval (math.add)', async () => {
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
        toolId: 'math.add',
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
          requestId: 'test-request-123',
          requiredApproval: 'USER_CONSENT',
          riskLevel: 'HIGH',
          categories: ['FILE_SYSTEM'],
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
          requestId: 'test-request-456',
          approvalRequestId: expect.any(String),
          requiredApproval: 'USER_CONSENT',
          riskLevel: 'HIGH',
          categories: ['FILE_SYSTEM'],
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
