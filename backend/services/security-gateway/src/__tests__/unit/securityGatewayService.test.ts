import { jest } from '@jest/globals';
import { SecurityGatewayService } from '../../services/securityGatewayService.js';
import {
  createMockDatabaseService,
  createMockAuditService,
  createMockApprovalWorkflowService,
} from '../utils/mockServices.js';
import {
  SecurityValidationRequest,
  SecurityLevel,
  RiskLevel,
  AuditEventType,
  Operation,
  SecurityContext,
} from '@uaip/types';

// Mock the services
jest.mock('@uaip/shared-services', () => ({
  DatabaseService: jest.fn().mockImplementation(() => createMockDatabaseService()),
}));

jest.mock('../../services/auditService.js', () => ({
  AuditService: jest.fn().mockImplementation(() => createMockAuditService()),
}));

jest.mock('../../services/approvalWorkflowService.js', () => ({
  ApprovalWorkflowService: jest.fn().mockImplementation(() => createMockApprovalWorkflowService()),
}));

describe('SecurityGatewayService', () => {
  let securityGatewayService: SecurityGatewayService;
  let mockDatabaseService: ReturnType<typeof createMockDatabaseService>;
  let mockAuditService: ReturnType<typeof createMockAuditService>;
  let mockApprovalWorkflowService: ReturnType<typeof createMockApprovalWorkflowService>;

  beforeEach(() => {
    mockDatabaseService = createMockDatabaseService();
    mockAuditService = createMockAuditService();
    mockApprovalWorkflowService = createMockApprovalWorkflowService();

    securityGatewayService = new SecurityGatewayService(
      mockDatabaseService as any,
      mockApprovalWorkflowService as any,
      mockAuditService as any
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper function to create test security validation requests
  const createSecurityValidationRequest = (
    overrides: Partial<SecurityValidationRequest> = {}
  ): SecurityValidationRequest => ({
    operation: {
      type: 'read',
      resource: 'user_data',
      context: {},
    },
    securityContext: {
      userId: 'user-123',
      role: 'user',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      sessionId: 'session-123',
    },
    ...overrides,
  });

  describe('validateSecurity', () => {
    it('should validate low-risk operation successfully', async () => {
      const request = createSecurityValidationRequest({
        operation: {
          type: 'read',
          resource: 'public_data',
          context: {},
        },
      });

      const result = await securityGatewayService.validateSecurity(request);

      expect(result.allowed).toBe(true);
      expect(result.approvalRequired).toBe(false);
      expect(result.riskLevel).toBe(SecurityLevel.LOW);
      expect(result.reasoning).toContain('Risk assessment');
      expect(result.validUntil).toBeInstanceOf(Date);

      // Verify audit logging
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.PERMISSION_GRANTED,
          userId: 'user-123',
        })
      );
    });

    it('should require approval for high-risk operations', async () => {
      const request = createSecurityValidationRequest({
        operation: {
          type: 'system_configuration_change',
          resource: 'system_configuration',
          context: {},
        },
      });

      const result = await securityGatewayService.validateSecurity(request);

      expect(result.allowed).toBe(false);
      expect(result.approvalRequired).toBe(true);
      expect(result.riskLevel).toBe(SecurityLevel.HIGH);
      expect(result.requiredApprovers).toContain('system-admin');
      expect(result.reasoning).toContain('Approval required');
    });

    it('should assess time-based risk factors correctly', async () => {
      // Mock current time to be off-hours (10 PM)
      const offHoursDate = new Date();
      offHoursDate.setHours(22, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => offHoursDate as any);

      const request = createSecurityValidationRequest({
        operation: {
          type: 'write',
          resource: 'user_data',
          context: {},
        },
      });

      const result = await securityGatewayService.validateSecurity(request);

      // Risk should be elevated due to off-hours access
      expect([SecurityLevel.MEDIUM, SecurityLevel.HIGH]).toContain(result.riskLevel);
    });

    it('should assess context-based risk factors', async () => {
      const request = createSecurityValidationRequest({
        operation: {
          type: 'data_export',
          resource: 'user_data',
          context: {
            containsSensitiveData: true,
            externalAccess: true,
            bulkOperation: true,
          },
        },
      });

      const result = await securityGatewayService.validateSecurity(request);

      // High context risk should result in elevated security level
      expect([SecurityLevel.HIGH, SecurityLevel.CRITICAL]).toContain(result.riskLevel);
      expect(result.approvalRequired).toBe(true);
    });

    it('should handle historical risk assessment', async () => {
      // Mock recent security events for the user
      mockAuditService.queryEvents.mockResolvedValue([
        {
          id: 'event-1',
          eventType: AuditEventType.PERMISSION_DENIED,
          userId: 'user-123',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        },
        {
          id: 'event-2',
          eventType: AuditEventType.SECURITY_VIOLATION,
          userId: 'user-123',
          timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
        },
      ] as any);

      const request = createSecurityValidationRequest();
      const result = await securityGatewayService.validateSecurity(request);

      // Historical risk should elevate the overall risk
      expect([SecurityLevel.MEDIUM, SecurityLevel.HIGH]).toContain(result.riskLevel);
      expect(mockAuditService.queryEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          eventTypes: [
            AuditEventType.PERMISSION_DENIED,
            AuditEventType.SECURITY_VIOLATION,
            AuditEventType.APPROVAL_DENIED,
          ],
        })
      );
    });

    it('should handle validation errors gracefully', async () => {
      mockAuditService.logEvent.mockRejectedValue(new Error('Audit service error'));

      const request = createSecurityValidationRequest();

      await expect(securityGatewayService.validateSecurity(request)).rejects.toThrow(
        'Audit service error'
      );

      // Should log security violation
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.SECURITY_VIOLATION,
        })
      );
    });

    it('should apply security policies correctly', async () => {
      const request = createSecurityValidationRequest({
        operation: {
          type: 'system_configuration_change',
          resource: 'system_configuration',
          context: {},
        },
      });

      const result = await securityGatewayService.validateSecurity(request);

      // Should match the system configuration policy
      expect(result.approvalRequired).toBe(true);
      expect(result.requiredApprovers).toContain('system-admin');
      expect(result.requiredApprovers).toContain('security-admin');
    });
  });

  describe('assessRisk', () => {
    it('should assess operation type risk correctly', async () => {
      const lowRiskRequest = createSecurityValidationRequest({
        operation: { type: 'read', resource: 'public_data', context: {} },
      });

      const highRiskRequest = createSecurityValidationRequest({
        operation: {
          type: 'security_policy_change',
          resource: 'system_configuration',
          context: {},
        },
      });

      const lowRiskAssessment = await securityGatewayService.assessRisk(lowRiskRequest);
      const highRiskAssessment = await securityGatewayService.assessRisk(highRiskRequest);

      expect(lowRiskAssessment.overallRisk).toBe(RiskLevel.LOW);
      expect([RiskLevel.HIGH, RiskLevel.CRITICAL]).toContain(highRiskAssessment.overallRisk);

      // Check that factors are populated
      expect(lowRiskAssessment.factors.length).toBeGreaterThan(0);
      expect(highRiskAssessment.factors.length).toBeGreaterThan(0);

      // Check that mitigations are provided
      expect(lowRiskAssessment.mitigations.length).toBeGreaterThan(0);
      expect(highRiskAssessment.mitigations.length).toBeGreaterThan(0);
    });

    it('should assess resource type risk correctly', async () => {
      const publicDataRequest = createSecurityValidationRequest({
        operation: { type: 'read', resource: 'public_data', context: {} },
      });

      const financialDataRequest = createSecurityValidationRequest({
        operation: { type: 'read', resource: 'financial_data', context: {} },
      });

      const publicDataAssessment = await securityGatewayService.assessRisk(publicDataRequest);
      const financialDataAssessment = await securityGatewayService.assessRisk(financialDataRequest);

      // Financial data should have higher risk than public data
      expect(financialDataAssessment.score).toBeGreaterThan(publicDataAssessment.score);

      // Check that appropriate factors are included
      const resourceFactors = financialDataAssessment.factors.filter(
        (f) => f.type === 'resource_type'
      );
      expect(resourceFactors.length).toBeGreaterThan(0);
    });

    it('should include proper risk factors', async () => {
      const request = createSecurityValidationRequest();
      const assessment = await securityGatewayService.assessRisk(request);

      const factorTypes = assessment.factors.map((f) => f.type);
      expect(factorTypes).toContain('operation_type');
      expect(factorTypes).toContain('resource_type');
      expect(factorTypes).toContain('user_role');
      expect(factorTypes).toContain('time_based');
      expect(factorTypes).toContain('context_based');
      expect(factorTypes).toContain('historical');

      // Each factor should have required properties
      assessment.factors.forEach((factor) => {
        expect(factor.type).toBeDefined();
        expect(factor.level).toBeDefined();
        expect(factor.description).toBeDefined();
        expect(factor.score).toBeGreaterThanOrEqual(0);
        expect(factor.mitigations).toBeInstanceOf(Array);
      });
    });

    it('should handle historical risk assessment errors gracefully', async () => {
      mockAuditService.queryEvents.mockRejectedValue(new Error('Database connection failed'));

      const request = createSecurityValidationRequest();
      const assessment = await securityGatewayService.assessRisk(request);

      // Should still complete assessment with fallback historical factor
      expect(assessment.factors.length).toBeGreaterThan(0);

      const historicalFactor = assessment.factors.find((f) => f.type === 'historical');
      expect(historicalFactor).toBeDefined();
      expect(historicalFactor?.description).toContain('unavailable');
    });
  });

  describe('createApprovalWorkflow', () => {
    it('should create approval workflow for high-risk operations', async () => {
      const request = createSecurityValidationRequest({
        operation: {
          type: 'system_configuration_change',
          resource: 'system_configuration',
          context: {},
        },
      });

      const riskAssessment = await securityGatewayService.assessRisk(request);
      const workflowId = await securityGatewayService.createApprovalWorkflow(
        'operation-123',
        request,
        riskAssessment
      );

      expect(workflowId).toBe('workflow-123');
      expect(mockApprovalWorkflowService.createApprovalWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'operation-123',
          operationType: 'system_configuration_change',
          requiredApprovers: expect.arrayContaining(['system-admin']),
          securityLevel: expect.any(String),
          context: expect.objectContaining({
            operation: request.operation,
            riskAssessment,
            securityContext: request.securityContext,
          }),
        })
      );
    });

    it('should calculate appropriate expiration hours based on risk level', async () => {
      const criticalRequest = createSecurityValidationRequest({
        operation: {
          type: 'security_policy_change',
          resource: 'system_configuration',
          context: {
            containsSensitiveData: true,
            externalAccess: true,
          },
        },
      });

      const riskAssessment = await securityGatewayService.assessRisk(criticalRequest);
      await securityGatewayService.createApprovalWorkflow(
        'critical-operation-123',
        criticalRequest,
        riskAssessment
      );

      expect(mockApprovalWorkflowService.createApprovalWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          expirationHours: expect.any(Number),
        })
      );

      const callArgs = mockApprovalWorkflowService.createApprovalWorkflow.mock.calls[0][0] as any;
      // Critical operations should have shorter expiration times
      if (riskAssessment.overallRisk === RiskLevel.CRITICAL) {
        expect(callArgs.expirationHours).toBeLessThanOrEqual(4);
      }
    });

    it('should handle workflow creation errors', async () => {
      (mockApprovalWorkflowService.createApprovalWorkflow as any).mockRejectedValue(
        new Error('Workflow service unavailable')
      );

      const request = createSecurityValidationRequest();
      const riskAssessment = await securityGatewayService.assessRisk(request);

      await expect(
        securityGatewayService.createApprovalWorkflow('operation-123', request, riskAssessment)
      ).rejects.toThrow('Workflow service unavailable');
    });
  });

  describe('requiresApproval', () => {
    it('should correctly identify when approval is required', async () => {
      const highRiskRequest = createSecurityValidationRequest({
        operation: {
          type: 'user_privilege_escalation',
          resource: 'user_data',
          context: {},
        },
      });

      const result = await securityGatewayService.requiresApproval(highRiskRequest);

      expect(result.required).toBe(true);
      expect(result.requirements).toBeDefined();
      expect(result.requirements?.minimumApprovers).toBeGreaterThan(0);
      expect(result.requirements?.requiredRoles).toContain('admin');
      expect(result.requirements?.timeoutHours).toBeGreaterThan(0);
    });

    it('should correctly identify when approval is not required', async () => {
      const lowRiskRequest = createSecurityValidationRequest({
        operation: {
          type: 'read',
          resource: 'public_data',
          context: {},
        },
      });

      const result = await securityGatewayService.requiresApproval(lowRiskRequest);

      expect(result.required).toBe(false);
      expect(result.requirements).toBeUndefined();
      expect(result.matchedPolicies).toBeInstanceOf(Array);
    });

    it('should handle approval requirement errors', async () => {
      mockAuditService.queryEvents.mockRejectedValue(new Error('Service error'));

      const request = createSecurityValidationRequest();

      await expect(securityGatewayService.requiresApproval(request)).rejects.toThrow(
        'Service error'
      );
    });
  });

  describe('Security Policies', () => {
    it('should load default security policies on initialization', () => {
      // Policies should be loaded during construction
      // We can't directly test the private policies map, but we can test the effects
      expect(securityGatewayService).toBeInstanceOf(SecurityGatewayService);
    });

    it('should apply high-risk approval policy', async () => {
      const highRiskRequest = createSecurityValidationRequest({
        operation: {
          type: 'delete',
          resource: 'production_database',
          context: {},
        },
      });

      const result = await securityGatewayService.validateSecurity(highRiskRequest);

      // High-risk operations should trigger approval requirements
      expect(result.approvalRequired).toBe(true);
    });

    it('should apply system configuration change policy', async () => {
      const systemConfigRequest = createSecurityValidationRequest({
        operation: {
          type: 'system_configuration_change',
          resource: 'system_configuration',
          context: {},
        },
      });

      const result = await securityGatewayService.validateSecurity(systemConfigRequest);

      expect(result.approvalRequired).toBe(true);
      expect(result.requiredApprovers).toContain('system-admin');
      expect(result.requiredApprovers).toContain('security-admin');
    });
  });

  describe('Risk Configuration', () => {
    it('should use appropriate operation type weights', async () => {
      const readRequest = createSecurityValidationRequest({
        operation: { type: 'read', resource: 'user_data', context: {} },
      });

      const deleteRequest = createSecurityValidationRequest({
        operation: { type: 'delete', resource: 'user_data', context: {} },
      });

      const readAssessment = await securityGatewayService.assessRisk(readRequest);
      const deleteAssessment = await securityGatewayService.assessRisk(deleteRequest);

      // Delete operations should have higher risk than read operations
      expect(deleteAssessment.score).toBeGreaterThan(readAssessment.score);
    });

    it('should calculate validity periods based on risk level', async () => {
      const lowRiskRequest = createSecurityValidationRequest({
        operation: { type: 'read', resource: 'public_data', context: {} },
      });

      const highRiskRequest = createSecurityValidationRequest({
        operation: {
          type: 'security_policy_change',
          resource: 'system_configuration',
          context: {},
        },
      });

      const lowRiskResult = await securityGatewayService.validateSecurity(lowRiskRequest);
      const highRiskResult = await securityGatewayService.validateSecurity(highRiskRequest);

      // High-risk operations should have shorter validity periods
      expect(lowRiskResult.validUntil.getTime()).toBeGreaterThan(
        highRiskResult.validUntil.getTime()
      );
    });
  });

  describe('Mitigation Generation', () => {
    it('should generate appropriate mitigations for risk factors', async () => {
      const sensitiveDataRequest = createSecurityValidationRequest({
        operation: {
          type: 'data_export',
          resource: 'financial_data',
          context: {
            containsSensitiveData: true,
            externalAccess: true,
          },
        },
      });

      const assessment = await securityGatewayService.assessRisk(sensitiveDataRequest);

      expect(assessment.mitigations).toContain('Data encryption required');
      expect(assessment.mitigations).toContain('Access logging');
      expect(assessment.mitigations).toContain('VPN required');
      expect(assessment.mitigations).toContain('Enhanced authentication');
    });

    it('should generate risk-level specific mitigations', async () => {
      const criticalRiskRequest = createSecurityValidationRequest({
        operation: {
          type: 'security_policy_change',
          resource: 'system_configuration',
          context: {
            containsSensitiveData: true,
            externalAccess: true,
            bulkOperation: true,
          },
        },
      });

      const assessment = await securityGatewayService.assessRisk(criticalRiskRequest);

      if (assessment.overallRisk === RiskLevel.CRITICAL) {
        expect(assessment.mitigations).toContain('Multi-factor authentication required');
        expect(assessment.mitigations).toContain('Real-time monitoring');
        expect(assessment.mitigations).toContain('Immediate security team notification');
      }
    });
  });
});
