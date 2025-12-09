import { SecurityValidationService } from '../../securityValidationService.js';
import { DatabaseService } from '../../databaseService.js';
import {
  SecurityValidationResult,
  RiskAssessment,
  RiskFactor,
  RiskLevel,
  SecurityContext,
  SecurityLevel,
  ExecutionPlan,
} from '@uaip/types';

// Mock DatabaseService methods
const createMockDatabaseService = () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  getUserAuthDetails: jest.fn().mockResolvedValue({
    id: 'user-123',
    email: 'test@example.com',
    isActive: true,
    role: 'user',
    securityClearance: SecurityLevel.MEDIUM,
  }),
  getUserPermissions: jest.fn().mockResolvedValue({
    rolePermissions: [
      { operations: ['read:documents', 'write:documents'] },
      { operations: ['execute:basic_operations'] },
    ],
    directPermissions: [{ operations: ['admin:dashboard'] }],
  }),
  getUserRiskData: jest.fn().mockResolvedValue({
    recentActivityCount: 25,
    failedLoginAttempts: 0,
    lastLoginTime: new Date(),
    riskScore: 2,
  }),
  getUserHighestRole: jest.fn().mockResolvedValue('user'),
  createApprovalWorkflow: jest.fn().mockResolvedValue(undefined),
});

// Mock the DatabaseService
jest.mock('../../databaseService.js', () => ({
  DatabaseService: jest.fn().mockImplementation(() => createMockDatabaseService()),
}));

describe('SecurityValidationService', () => {
  let service: SecurityValidationService;
  let mockDatabaseService: ReturnType<typeof createMockDatabaseService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = new SecurityValidationService();
    mockDatabaseService = (service as any).databaseService;
  });

  describe('Service Initialization', () => {
    it('should initialize with database service dependency', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(SecurityValidationService);
    });

    it('should initialize database service when needed', async () => {
      const securityContext: SecurityContext = {
        userId: 'user-123',
        sessionId: 'session-456',
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 Test Browser',
        securityLevel: SecurityLevel.MEDIUM,
      };

      await service.validateOperation(securityContext, 'read:documents', ['doc-1'], {});

      expect(mockDatabaseService.initialize).toHaveBeenCalled();
    });
  });

  describe('Operation Validation', () => {
    const defaultSecurityContext: SecurityContext = {
      userId: 'user-123',
      sessionId: 'session-456',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Browser',
      securityLevel: SecurityLevel.MEDIUM,
    };

    describe('validateOperation', () => {
      it('should allow operation with valid authentication and permissions', async () => {
        const result = await service.validateOperation(
          defaultSecurityContext,
          'read:documents',
          ['doc-1'],
          { documentType: 'report' }
        );

        expect(result).toEqual({
          allowed: true,
          riskLevel: SecurityLevel.MEDIUM,
          approvalRequired: false,
          conditions: ['Standard monitoring required'],
          reasoning: expect.any(String),
        });

        expect(mockDatabaseService.getUserAuthDetails).toHaveBeenCalledWith('user-123');
        expect(mockDatabaseService.getUserPermissions).toHaveBeenCalledWith(
          'user-123',
          'read:documents',
          ['doc-1']
        );
      });

      it('should deny operation when user authentication fails', async () => {
        mockDatabaseService.getUserAuthDetails.mockResolvedValueOnce(null);

        const result = await service.validateOperation(
          defaultSecurityContext,
          'read:documents',
          ['doc-1'],
          {}
        );

        expect(result).toEqual({
          allowed: false,
          riskLevel: SecurityLevel.HIGH,
          approvalRequired: false,
          conditions: [],
          reasoning: 'User authentication failed',
        });
      });

      it('should deny operation when user account is disabled', async () => {
        mockDatabaseService.getUserAuthDetails.mockResolvedValueOnce({
          id: 'user-123',
          email: 'test@example.com',
          isActive: false,
          role: 'user',
        });

        const result = await service.validateOperation(
          defaultSecurityContext,
          'read:documents',
          ['doc-1'],
          {}
        );

        expect(result).toEqual({
          allowed: false,
          riskLevel: SecurityLevel.HIGH,
          approvalRequired: false,
          conditions: [],
          reasoning: 'User authentication failed',
        });
      });

      it('should deny operation when user lacks required permissions', async () => {
        mockDatabaseService.getUserPermissions.mockResolvedValueOnce({
          rolePermissions: [{ operations: ['read:basic'] }],
          directPermissions: [],
        });

        const result = await service.validateOperation(
          defaultSecurityContext,
          'admin:delete_system',
          ['critical-resource'],
          {}
        );

        expect(result).toEqual({
          allowed: false,
          riskLevel: SecurityLevel.HIGH,
          approvalRequired: false,
          conditions: [],
          reasoning: 'Insufficient permissions',
        });
      });

      it('should handle high-risk operations with approval requirements', async () => {
        const result = await service.validateOperation(
          defaultSecurityContext,
          'delete_agent',
          ['agent-123'],
          { agentType: 'critical' }
        );

        expect(result.approvalRequired).toBe(true);
        expect(result.conditions).toContain('Enhanced monitoring required');
      });

      it('should handle operations with sensitive data patterns', async () => {
        const sensitiveData = {
          api_key: 'sk-1234567890abcdef',
          password: 'secret123',
          credit_card: '4111-1111-1111-1111',
        };

        const result = await service.validateOperation(
          defaultSecurityContext,
          'process:data',
          ['sensitive-doc'],
          sensitiveData
        );

        expect(result.riskLevel).toBe(SecurityLevel.HIGH);
        expect(result.conditions).toContain('Enhanced monitoring required');
      });
    });

    describe('Risk Assessment Edge Cases', () => {
      it('should handle unusual user activity patterns', async () => {
        mockDatabaseService.getUserRiskData.mockResolvedValueOnce({
          recentActivityCount: 150, // High activity
          failedLoginAttempts: 2,
          lastLoginTime: new Date(),
          riskScore: 6,
        });

        const result = await service.validateOperation(
          defaultSecurityContext,
          'read:documents',
          ['doc-1'],
          {}
        );

        expect(result.reasoning).toContain('Unusually high activity detected');
      });

      it('should handle external system operations', async () => {
        const result = await service.validateOperation(
          defaultSecurityContext,
          'external_api_call',
          ['external-service'],
          { endpoint: 'https://api.external.com' }
        );

        expect(result.approvalRequired).toBe(true);
        expect(result.conditions).toContain('Network activity logging required');
      });
    });
  });

  describe('Risk Assessment', () => {
    const mockExecutionPlan: ExecutionPlan = {
      id: 'plan-123',
      type: 'data_processing',
      steps: Array.from({ length: 12 }, (_, i) => ({
        id: `step-${i}`,
        type: 'processing',
        dependencies: i > 0 ? [`step-${i - 1}`] : [],
      })),
      estimatedDuration: 7200, // 2 hours
    };

    describe('assessRisk', () => {
      it('should assess low risk for simple operations', async () => {
        const simplePlan: ExecutionPlan = {
          id: 'simple-plan',
          type: 'information_retrieval',
          steps: [{ id: 'step-1', type: 'read' }],
          estimatedDuration: 300, // 5 minutes
        };

        const result = await service.assessRisk(simplePlan, { securityLevel: 'low' });

        expect(result.level).toBe(SecurityLevel.LOW);
        expect(result.overallRisk).toBe(RiskLevel.LOW);
        expect(result.score).toBeLessThan(5);
        expect(result.factors).toHaveLength(0);
      });

      it('should assess high risk for complex operations', async () => {
        const result = await service.assessRisk(mockExecutionPlan, { securityLevel: 'high' });

        expect(result.level).toBeOneOf([SecurityLevel.MEDIUM, SecurityLevel.HIGH]);
        expect(result.overallRisk).toBeOneOf([RiskLevel.MEDIUM, RiskLevel.HIGH]);
        expect(result.factors.length).toBeGreaterThan(0);

        // Should identify complexity risk
        const complexityFactor = result.factors.find((f) => f.type === 'complexity');
        expect(complexityFactor).toBeDefined();
        expect(complexityFactor?.level).toBe(RiskLevel.HIGH);
      });

      it('should assess duration risk for long-running operations', async () => {
        const longPlan: ExecutionPlan = {
          ...mockExecutionPlan,
          estimatedDuration: 10800, // 3 hours
        };

        const result = await service.assessRisk(longPlan, { securityLevel: 'medium' });

        const durationFactor = result.factors.find((f) => f.type === 'duration');
        expect(durationFactor).toBeDefined();
        expect(durationFactor?.level).toBeOneOf([RiskLevel.MEDIUM, RiskLevel.HIGH]);
      });

      it('should assess resource risk for intensive operations', async () => {
        const resourceIntensivePlan: ExecutionPlan = {
          ...mockExecutionPlan,
          type: 'ml_training',
        };

        const result = await service.assessRisk(resourceIntensivePlan, { securityLevel: 'medium' });

        const resourceFactor = result.factors.find((f) => f.type === 'resource');
        expect(resourceFactor).toBeDefined();
      });

      it('should provide appropriate mitigation recommendations', async () => {
        const result = await service.assessRisk(mockExecutionPlan, { securityLevel: 'high' });

        expect(result.mitigations).toBeDefined();
        expect(result.mitigations.length).toBeGreaterThan(0);

        // Should recommend breaking down complex operations
        if (result.factors.some((f) => f.type === 'complexity')) {
          expect(result.mitigations).toContain('Break down into smaller operations');
        }
      });
    });
  });

  describe('Data Filtering', () => {
    const testData = {
      publicInfo: 'This is public',
      security_context: {
        api_keys: ['key1', 'key2'],
        credentials: { username: 'admin', password: 'secret' },
        public_info: 'Safe to share',
      },
      intelligence_config: {
        public_params: { setting1: 'value1' },
        internal_params: { secret_setting: 'hidden' },
      },
    };

    describe('filterSensitiveData', () => {
      it('should allow admin users to see all data', async () => {
        mockDatabaseService.getUserHighestRole.mockResolvedValueOnce('admin');

        const result = await service.filterSensitiveData(testData, 'admin-user', 'read');

        expect(result).toEqual(testData);
      });

      it('should filter sensitive data for operator users', async () => {
        mockDatabaseService.getUserHighestRole.mockResolvedValueOnce('operator');

        const result = await service.filterSensitiveData(testData, 'operator-user', 'read');

        expect(result.publicInfo).toBe('This is public');
        expect(result.security_context.public_info).toBe('Safe to share');
        expect(result.security_context.api_keys).toBeUndefined();
        expect(result.security_context.credentials).toBeUndefined();
        expect(result.intelligence_config).toBeDefined();
      });

      it('should heavily filter data for viewer users', async () => {
        mockDatabaseService.getUserHighestRole.mockResolvedValueOnce('viewer');

        const result = await service.filterSensitiveData(testData, 'viewer-user', 'read');

        expect(result.publicInfo).toBe('This is public');
        expect(result.security_context).toBeUndefined();
        expect(result.intelligence_config.public_params).toBeDefined();
        expect(result.intelligence_config.internal_params).toBeUndefined();
      });

      it('should deny access for unknown roles', async () => {
        mockDatabaseService.getUserHighestRole.mockResolvedValueOnce('unknown');

        await expect(service.filterSensitiveData(testData, 'unknown-user', 'read')).rejects.toThrow(
          'Access denied'
        );
      });

      it('should handle database errors gracefully', async () => {
        mockDatabaseService.getUserHighestRole.mockRejectedValueOnce(new Error('Database error'));

        await expect(service.filterSensitiveData(testData, 'user-123', 'read')).rejects.toThrow(
          'Database error'
        );
      });
    });
  });

  describe('Approval Workflow Management', () => {
    describe('createApprovalWorkflow', () => {
      it('should create approval workflow with required approvers', async () => {
        const workflowId = await service.createApprovalWorkflow(
          'operation-123',
          ['admin-1', 'admin-2'],
          { reason: 'High-risk operation', priority: 'urgent' }
        );

        expect(workflowId).toMatch(/^approval_\d+_[a-z0-9]+$/);
        expect(mockDatabaseService.createApprovalWorkflow).toHaveBeenCalledWith({
          id: workflowId,
          operationId: 'operation-123',
          requiredApprovers: ['admin-1', 'admin-2'],
          status: 'pending',
          metadata: { reason: 'High-risk operation', priority: 'urgent' },
        });
      });

      it('should handle database errors during workflow creation', async () => {
        mockDatabaseService.createApprovalWorkflow.mockRejectedValueOnce(
          new Error('Database constraint violation')
        );

        await expect(
          service.createApprovalWorkflow('operation-123', ['admin-1'], {})
        ).rejects.toThrow('Failed to create approval workflow');
      });
    });
  });

  describe('Security Context Validation', () => {
    it('should validate security levels correctly', async () => {
      const highSecurityContext: SecurityContext = {
        userId: 'admin-user',
        sessionId: 'session-789',
        ipAddress: '10.0.0.1',
        userAgent: 'Admin Browser',
        securityLevel: SecurityLevel.HIGH,
      };

      const result = await service.validateOperation(
        highSecurityContext,
        'admin:system_config',
        ['system'],
        {}
      );

      expect(result.allowed).toBe(true);
    });

    it('should handle suspicious IP addresses', async () => {
      const suspiciousContext: SecurityContext = {
        userId: 'user-123',
        sessionId: 'session-suspicious',
        ipAddress: '192.168.999.999', // Invalid IP format
        userAgent: 'Suspicious Browser',
        securityLevel: SecurityLevel.MEDIUM,
      };

      const result = await service.validateOperation(
        suspiciousContext,
        'read:documents',
        ['doc-1'],
        {}
      );

      // Service should still work but may apply additional security measures
      expect(result).toBeDefined();
      expect(result.conditions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent validation requests', async () => {
      const contexts = Array.from({ length: 10 }, (_, i) => ({
        userId: `user-${i}`,
        sessionId: `session-${i}`,
        ipAddress: `192.168.1.${i + 100}`,
        userAgent: 'Test Browser',
        securityLevel: SecurityLevel.MEDIUM,
      }));

      const validationPromises = contexts.map((context) =>
        service.validateOperation(context, 'read:documents', ['doc-1'], {})
      );

      const results = await Promise.all(validationPromises);

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(typeof result.allowed).toBe('boolean');
      });
    });

    it('should efficiently assess risks for multiple plans', async () => {
      const plans = Array.from({ length: 5 }, (_, i) => ({
        id: `plan-${i}`,
        name: `Plan ${i}`,
        type: 'analysis',
        steps: [{ id: 'step-1', type: 'process' }],
        estimatedDuration: 300 + i * 100,
      }));

      const assessmentPromises = plans.map((plan) =>
        service.assessRisk(plan as ExecutionPlan, { securityLevel: 'medium' })
      );

      const results = await Promise.all(assessmentPromises);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.level).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    const testSecurityContext: SecurityContext = {
      userId: 'user-123',
      sessionId: 'session-456',
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Browser',
      securityLevel: SecurityLevel.MEDIUM,
    };

    it('should handle database service unavailability gracefully', async () => {
      mockDatabaseService.getUserAuthDetails.mockRejectedValueOnce(
        new Error('Database connection timeout')
      );

      await expect(
        service.validateOperation(testSecurityContext, 'read:documents', ['doc-1'], {})
      ).rejects.toThrow('Security validation failed');
    });

    it('should handle malformed security contexts', async () => {
      const malformedContext = {
        userId: '', // Empty user ID
        sessionId: null,
        ipAddress: 'invalid-ip',
        userAgent: '',
        securityLevel: 'invalid' as any,
      };

      await expect(
        service.validateOperation(
          malformedContext as SecurityContext,
          'read:documents',
          ['doc-1'],
          {}
        )
      ).rejects.toThrow();
    });

    it('should provide meaningful error messages for validation failures', async () => {
      mockDatabaseService.getUserPermissions.mockResolvedValueOnce({
        rolePermissions: [],
        directPermissions: [],
      });

      const result = await service.validateOperation(
        testSecurityContext,
        'restricted:operation',
        ['restricted-resource'],
        {}
      );

      expect(result.allowed).toBe(false);
      expect(result.reasoning).toBe('Insufficient permissions');
      expect(typeof result.reasoning).toBe('string');
      expect(result.reasoning.length).toBeGreaterThan(0);
    });
  });
});

// Helper custom matcher
expect.extend({
  toBeOneOf(received, items) {
    const pass = items.includes(received);
    const message = () =>
      pass
        ? `expected ${received} not to be one of [${items.join(', ')}]`
        : `expected ${received} to be one of [${items.join(', ')}]`;

    return { message, pass };
  },
});

// Extend Jest matchers type
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(items: any[]): R;
    }
  }
}
