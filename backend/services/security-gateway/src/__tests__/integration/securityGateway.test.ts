import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { SecurityGatewayService } from '../../services/securityGatewayService.js';
import { ApprovalWorkflowService } from '../../services/approvalWorkflowService.js';
import { AuditService } from '../../services/auditService.js';
import {
  createMockDatabaseService,
  createMockAuditService,
  createMockApprovalWorkflowService
} from '../utils/mockServices.js';
import {
  SecurityValidationRequest,
  SecurityLevel,
  RiskLevel,
  AuditEventType
} from '@uaip/types';

// Mock all external dependencies for integration testing
jest.mock('@uaip/shared-services', () => ({
  DatabaseService: jest.fn().mockImplementation(() => createMockDatabaseService())
}));

jest.mock('../../services/auditService.js', () => ({
  AuditService: jest.fn().mockImplementation(() => createMockAuditService())
}));

jest.mock('../../services/approvalWorkflowService.js', () => ({
  ApprovalWorkflowService: jest.fn().mockImplementation(() => createMockApprovalWorkflowService())
}));

describe('Security Gateway Integration', () => {
  let securityGatewayService: SecurityGatewayService;
  let mockDatabaseService: ReturnType<typeof createMockDatabaseService>;
  let mockAuditService: ReturnType<typeof createMockAuditService>;
  let mockApprovalWorkflowService: ReturnType<typeof createMockApprovalWorkflowService>;

  beforeAll(() => {
    mockDatabaseService = createMockDatabaseService();
    mockAuditService = createMockAuditService();
    mockApprovalWorkflowService = createMockApprovalWorkflowService();

    securityGatewayService = new SecurityGatewayService(
      mockDatabaseService,
      mockApprovalWorkflowService,
      mockAuditService
    );
  });

  afterAll(() => {
    // Cleanup if needed
  });

  describe('Service Initialization', () => {
    it('should initialize successfully with all dependencies', () => {
      expect(securityGatewayService).toBeDefined();
      expect(securityGatewayService).toBeInstanceOf(SecurityGatewayService);
    });

    it('should have all required methods', () => {
      expect(typeof securityGatewayService.validateSecurity).toBe('function');
      expect(typeof securityGatewayService.assessRisk).toBe('function');
      expect(typeof securityGatewayService.createApprovalWorkflow).toBe('function');
      expect(typeof securityGatewayService.requiresApproval).toBe('function');
    });
  });

  describe('End-to-End Security Validation Workflows', () => {
    it('should handle complete low-risk operation workflow', async () => {
      const request: SecurityValidationRequest = {
        operation: {
          type: 'read',
          resource: 'public_data',
          context: {}
        },
        securityContext: {
          userId: 'user-123',
          userRole: 'user',
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          sessionId: 'session-123'
        }
      };

      // Validate security
      const validationResult = await securityGatewayService.validateSecurity(request);

      expect(validationResult.allowed).toBe(true);
      expect(validationResult.approvalRequired).toBe(false);
      expect(validationResult.riskLevel).toBe(SecurityLevel.LOW);

      // Verify audit logging occurred
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.PERMISSION_GRANTED,
          userId: 'user-123'
        })
      );
    });

    it('should handle complete high-risk operation workflow', async () => {
      const request: SecurityValidationRequest = {
        operation: {
          type: 'system_configuration_change',
          resource: 'production_database',
          context: {
            containsSensitiveData: true,
            externalAccess: true
          }
        },
        securityContext: {
          userId: 'admin-123',
          userRole: 'admin',
          ipAddress: '10.0.0.50',
          userAgent: 'Admin-Tool/1.0',
          sessionId: 'admin-session-456'
        }
      };

      // Step 1: Validate security (should require approval)
      const validationResult = await securityGatewayService.validateSecurity(request);

      expect(validationResult.allowed).toBe(false);
      expect(validationResult.approvalRequired).toBe(true);
      expect(validationResult.riskLevel).toBeOneOf([SecurityLevel.HIGH, SecurityLevel.CRITICAL]);
      expect(validationResult.requiredApprovers.length).toBeGreaterThan(0);

      // Step 2: Create approval workflow
      const riskAssessment = await securityGatewayService.assessRisk(request);
      const workflowId = await securityGatewayService.createApprovalWorkflow(
        'critical-operation-789',
        request,
        riskAssessment
      );

      expect(workflowId).toBe('workflow-123');
      expect(mockApprovalWorkflowService.createApprovalWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'critical-operation-789',
          operationType: 'system_configuration_change',
          requiredApprovers: expect.arrayContaining(['system-admin']),
          securityLevel: expect.any(String)
        })
      );

      // Verify both validation and workflow creation were audited
      expect(mockAuditService.logEvent).toHaveBeenCalledTimes(1);
    });

    it('should handle approval requirement assessment workflow', async () => {
      const mediumRiskRequest: SecurityValidationRequest = {
        operation: {
          type: 'write',
          resource: 'user_data',
          context: {
            bulkOperation: true
          }
        },
        securityContext: {
          userId: 'operator-123',
          userRole: 'operator',
          ipAddress: '172.16.1.25',
          userAgent: 'DataTool/2.1',
          sessionId: 'op-session-789'
        }
      };

      // Check if approval is required
      const approvalCheck = await securityGatewayService.requiresApproval(mediumRiskRequest);

      if (approvalCheck.required) {
        expect(approvalCheck.requirements).toBeDefined();
        expect(approvalCheck.requirements?.minimumApprovers).toBeGreaterThan(0);
        expect(approvalCheck.requirements?.requiredRoles).toContain('admin');
        expect(approvalCheck.requirements?.timeoutHours).toBeGreaterThan(0);
      }

      expect(approvalCheck.matchedPolicies).toBeInstanceOf(Array);
    });

    it('should handle time-sensitive operations correctly', async () => {
      // Mock weekend time (Saturday evening)
      const weekendDate = new Date();
      weekendDate.setDay(6); // Saturday
      weekendDate.setHours(20, 0, 0, 0); // 8 PM
      jest.spyOn(global, 'Date').mockImplementation(() => weekendDate as any);

      const request: SecurityValidationRequest = {
        operation: {
          type: 'data_export',
          resource: 'financial_data',
          context: {}
        },
        securityContext: {
          userId: 'analyst-123',
          userRole: 'analyst',
          ipAddress: '203.0.113.10',
          userAgent: 'AnalyticsTool/1.5',
          sessionId: 'analyst-session-321'
        }
      };

      const validationResult = await securityGatewayService.validateSecurity(request);

      // Weekend + evening should increase risk
      expect(validationResult.riskLevel).toBeOneOf([SecurityLevel.MEDIUM, SecurityLevel.HIGH]);
    });

    it('should handle user with security history correctly', async () => {
      // Mock user with recent security violations
      mockAuditService.queryEvents.mockResolvedValue([
        {
          id: 'violation-1',
          eventType: AuditEventType.SECURITY_VIOLATION,
          userId: 'risky-user-123',
          timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
          details: { violation: 'Unauthorized access attempt' }
        },
        {
          id: 'denied-1',
          eventType: AuditEventType.PERMISSION_DENIED,
          userId: 'risky-user-123',
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
          details: { reason: 'Insufficient privileges' }
        }
      ] as any);

      const request: SecurityValidationRequest = {
        operation: {
          type: 'write',
          resource: 'user_data',
          context: {}
        },
        securityContext: {
          userId: 'risky-user-123',
          userRole: 'user',
          ipAddress: '198.51.100.42',
          userAgent: 'StandardApp/1.0',
          sessionId: 'risky-session-654'
        }
      };

      const riskAssessment = await securityGatewayService.assessRisk(request);

      // Historical violations should increase risk
      expect(riskAssessment.score).toBeGreaterThan(2.0);
      
      const historicalFactor = riskAssessment.factors.find(f => f.type === 'historical');
      expect(historicalFactor).toBeDefined();
      expect(historicalFactor?.description).toContain('recent security events');
      expect(historicalFactor?.mitigations).toContain('Enhanced monitoring');
    });

    it('should handle service integration failures gracefully', async () => {
      // Mock audit service failure
      mockAuditService.logEvent.mockRejectedValueOnce(new Error('Audit service down'));

      const request: SecurityValidationRequest = {
        operation: {
          type: 'read',
          resource: 'public_data',
          context: {}
        },
        securityContext: {
          userId: 'user-123',
          userRole: 'user',
          ipAddress: '192.168.1.100',
          userAgent: 'TestApp/1.0',
          sessionId: 'test-session-999'
        }
      };

      // Should throw error but also attempt to log security violation
      await expect(securityGatewayService.validateSecurity(request)).rejects.toThrow('Audit service down');

      // Should have attempted to log the failure as a security violation
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.SECURITY_VIOLATION
        })
      );
    });

    it('should validate complete risk assessment pipeline', async () => {
      const comprehensiveRequest: SecurityValidationRequest = {
        operation: {
          type: 'user_privilege_escalation',
          resource: 'production_database',
          context: {
            containsSensitiveData: true,
            externalAccess: true,
            bulkOperation: true
          }
        },
        securityContext: {
          userId: 'test-user-456',
          userRole: 'user',
          ipAddress: '203.0.113.100',
          userAgent: 'CustomTool/3.0',
          sessionId: 'comprehensive-session-123'
        }
      };

      // Full risk assessment
      const riskAssessment = await securityGatewayService.assessRisk(comprehensiveRequest);

      // Should have all risk factor types
      const factorTypes = riskAssessment.factors.map(f => f.type);
      expect(factorTypes).toContain('operation_type');
      expect(factorTypes).toContain('resource_type');
      expect(factorTypes).toContain('user_role');
      expect(factorTypes).toContain('time_based');
      expect(factorTypes).toContain('context_based');
      expect(factorTypes).toContain('historical');

      // Should have comprehensive mitigations
      expect(riskAssessment.mitigations.length).toBeGreaterThan(5);
      expect(riskAssessment.mitigations).toContain('Data encryption required');
      expect(riskAssessment.mitigations).toContain('VPN required');
      expect(riskAssessment.mitigations).toContain('Rate limiting');

      // Overall risk should be high given all factors
      expect(riskAssessment.overallRisk).toBeOneOf([RiskLevel.HIGH, RiskLevel.CRITICAL]);
    });
  });

  describe('Service Health and Performance', () => {
    it('should handle concurrent security validations', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => ({
        operation: {
          type: 'read',
          resource: 'public_data',
          context: {}
        },
        securityContext: {
          userId: `concurrent-user-${i}`,
          userRole: 'user',
          ipAddress: `192.168.1.${100 + i}`,
          userAgent: 'ConcurrentApp/1.0',
          sessionId: `concurrent-session-${i}`
        }
      }));

      const validationPromises = requests.map(request => 
        securityGatewayService.validateSecurity(request)
      );

      const results = await Promise.all(validationPromises);

      results.forEach((result, index) => {
        expect(result.allowed).toBe(true);
        expect(result.riskLevel).toBe(SecurityLevel.LOW);
      });

      // All requests should have been audited
      expect(mockAuditService.logEvent).toHaveBeenCalledTimes(10);
    });

    it('should maintain consistent risk scoring', async () => {
      const consistentRequest: SecurityValidationRequest = {
        operation: {
          type: 'write',
          resource: 'user_data',
          context: {}
        },
        securityContext: {
          userId: 'consistent-user',
          userRole: 'user',
          ipAddress: '192.168.1.50',
          userAgent: 'ConsistentApp/1.0',
          sessionId: 'consistent-session'
        }
      };

      // Run multiple assessments
      const assessments = await Promise.all([
        securityGatewayService.assessRisk(consistentRequest),
        securityGatewayService.assessRisk(consistentRequest),
        securityGatewayService.assessRisk(consistentRequest)
      ]);

      // Scores should be consistent (allowing for minimal floating point differences)
      const scores = assessments.map(a => a.score);
      expect(Math.max(...scores) - Math.min(...scores)).toBeLessThan(0.1);

      // Risk levels should be the same
      const riskLevels = assessments.map(a => a.overallRisk);
      expect(new Set(riskLevels).size).toBe(1);
    });
  });
});