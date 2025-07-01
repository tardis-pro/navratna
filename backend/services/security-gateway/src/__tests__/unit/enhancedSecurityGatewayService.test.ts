import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EnhancedSecurityGatewayService } from '../../services/enhancedSecurityGatewayService.js';
import { OAuthProviderService } from '../../services/oauthProviderService.js';
import { EnhancedAuthService } from '../../services/enhancedAuthService.js';
import {
  createMockDatabaseService,
  createMockAuditService,
  createMockApprovalWorkflowService,
  createMockOAuthProviderService,
  createMockEnhancedAuthService
} from '../utils/mockServices.js';
import {
  EnhancedSecurityValidationRequest,
  SecurityValidationResult,
  SecurityLevel,
  RiskLevel,
  UserType,
  AgentCapability,
  OAuthProviderType,
  AuthenticationMethod,
  MFAMethod,
  AuditEventType
} from '@uaip/types';
import { ApiError } from '@uaip/utils';

// Mock external dependencies
jest.mock('@uaip/shared-services', () => ({
  DatabaseService: jest.fn().mockImplementation(() => createMockDatabaseService())
}));

jest.mock('@uaip/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  ApiError: jest.fn().mockImplementation((status: number, message: string, code?: string) => {
    const error = new Error(message);
    (error as any).status = status;
    (error as any).code = code;
    return error;
  })
}));

describe('EnhancedSecurityGatewayService', () => {
  let enhancedSecurityGatewayService: EnhancedSecurityGatewayService;
  let mockDatabaseService: any;
  let mockAuditService: any;
  let mockApprovalWorkflowService: any;
  let mockOAuthProviderService: any;
  let mockEnhancedAuthService: any;

  beforeEach(() => {
    // Create mock services
    mockDatabaseService = createMockDatabaseService();
    mockAuditService = createMockAuditService();
    mockApprovalWorkflowService = createMockApprovalWorkflowService();
    mockOAuthProviderService = createMockOAuthProviderService();
    mockEnhancedAuthService = createMockEnhancedAuthService();

    // Create service instance
    enhancedSecurityGatewayService = new EnhancedSecurityGatewayService(
      mockDatabaseService,
      mockApprovalWorkflowService,
      mockAuditService,
      mockOAuthProviderService,
      mockEnhancedAuthService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper function to create enhanced security requests
  const createEnhancedSecurityRequest = (overrides: any = {}): EnhancedSecurityValidationRequest => ({
    operation: {
      type: 'read',
      resource: 'test_resource',
      action: 'view',
      context: {}
    },
    securityContext: {
      userId: 'user-123',
      sessionId: 'session-123',
      userType: UserType.HUMAN,
      ipAddress: '192.168.1.100',
      userAgent: 'TestAgent/1.0',
      department: 'engineering',
      role: 'user',
      permissions: ['read'],
      securityLevel: SecurityLevel.MEDIUM,
      lastAuthentication: new Date(),
      mfaVerified: false,
      riskScore: 2,
      authenticationMethod: AuthenticationMethod.PASSWORD,
      deviceTrusted: false,
      locationTrusted: true,
      ...overrides.securityContext
    },
    requestMetadata: {
      requestId: 'req-123',
      source: 'test',
      priority: 'normal'
    },
    ...overrides
  });

  describe('Service Initialization', () => {
    it('should initialize successfully with all dependencies', () => {
      expect(enhancedSecurityGatewayService).toBeDefined();
      expect(enhancedSecurityGatewayService).toBeInstanceOf(EnhancedSecurityGatewayService);
    });

    it('should load agent security policies on initialization', () => {
      // Verify that the service initializes without errors
      expect(enhancedSecurityGatewayService).toBeDefined();
    });
  });

  describe('Enhanced Security Validation', () => {

    it('should validate human user operations successfully', async () => {
      const request = createEnhancedSecurityRequest();

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(request);

      expect(result).toBeDefined();
      expect(result.allowed).toBe(true);
      expect(result.riskLevel).toBe(SecurityLevel.LOW);
      expect(result.approvalRequired).toBe(false);
      expect(result.mfaRequired).toBe(false);
    });

    it('should validate agent operations with proper capabilities', async () => {
      const request = createEnhancedSecurityRequest({
        operation: {
          type: 'git_clone',
          resource: 'repository',
          action: 'clone'
        },
        securityContext: {
          userType: UserType.AGENT,
          agentCapabilities: [AgentCapability.CODE_REPOSITORY],
          agentContext: {
            agentId: 'agent-123',
            agentName: 'Test Agent',
            capabilities: [AgentCapability.CODE_REPOSITORY],
            connectedProviders: [],
            operationLimits: {
              maxDailyOperations: 100,
              currentDailyOperations: 10,
              maxConcurrentOperations: 5,
              currentConcurrentOperations: 1
            }
          }
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(request);

      expect(result).toBeDefined();
      expect(result.allowed).toBe(true);
      expect(result.agentRestrictions).toBeDefined();
      expect(result.agentRestrictions.monitoring).toBeDefined();
    });

    it('should reject agent operations without required capabilities', async () => {
      const request = createEnhancedSecurityRequest({
        operation: {
          type: 'git_clone',
          resource: 'repository',
          action: 'clone'
        },
        securityContext: {
          userType: UserType.AGENT,
          agentCapabilities: [AgentCapability.NOTE_TAKING], // Wrong capability
          agentContext: {
            agentId: 'agent-123',
            agentName: 'Test Agent',
            capabilities: [AgentCapability.NOTE_TAKING],
            connectedProviders: [],
            operationLimits: {
              maxDailyOperations: 100,
              currentDailyOperations: 10,
              maxConcurrentOperations: 5,
              currentConcurrentOperations: 1
            }
          }
        }
      });

      await expect(
        enhancedSecurityGatewayService.validateEnhancedSecurity(request)
      ).rejects.toThrow('Agent lacks required capability');
    });

    it('should require MFA for critical operations', async () => {
      const request = createEnhancedSecurityRequest({
        operation: {
          type: 'delete',
          resource: 'production_database',
          action: 'delete'
        },
        securityContext: {
          securityLevel: SecurityLevel.HIGH,
          mfaVerified: false
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(request);

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaMethods).toContain(MFAMethod.TOTP);
    });

    it('should require approval for high-risk agent operations', async () => {
      const request = createEnhancedSecurityRequest({
        operation: {
          type: 'git_push',
          resource: 'production_repository',
          action: 'push'
        },
        securityContext: {
          userType: UserType.AGENT,
          agentCapabilities: [AgentCapability.CODE_REPOSITORY],
          securityLevel: SecurityLevel.HIGH,
          agentContext: {
            agentId: 'agent-123',
            agentName: 'Test Agent',
            capabilities: [AgentCapability.CODE_REPOSITORY],
            connectedProviders: [],
            operationLimits: {
              maxDailyOperations: 100,
              currentDailyOperations: 10,
              maxConcurrentOperations: 5,
              currentConcurrentOperations: 1
            }
          }
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(request);

      expect(result.approvalRequired).toBe(true);
      expect(result.requiredApprovers).toContain('agent-supervisor');
    });

    it('should validate OAuth provider operations', async () => {
      mockOAuthProviderService.validateAgentOperation.mockResolvedValue({
        allowed: true,
        reason: 'Valid OAuth operation'
      });

      const request = createEnhancedSecurityRequest({
        operation: {
          type: 'email_read',
          resource: 'inbox',
          action: 'read'
        },
        securityContext: {
          userType: UserType.AGENT,
          oauthProvider: OAuthProviderType.GMAIL,
          agentCapabilities: [AgentCapability.EMAIL_ACCESS],
          agentContext: {
            agentId: 'agent-123',
            agentName: 'Test Agent',
            capabilities: [AgentCapability.EMAIL_ACCESS],
            connectedProviders: [{
              providerId: 'gmail-provider-1',
              providerType: OAuthProviderType.GMAIL,
              capabilities: [AgentCapability.EMAIL_ACCESS],
              lastUsed: new Date()
            }],
            operationLimits: {
              maxDailyOperations: 100,
              currentDailyOperations: 10,
              maxConcurrentOperations: 5,
              currentConcurrentOperations: 1
            }
          }
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(request);

      expect(result.allowed).toBe(true);
      expect(mockOAuthProviderService.validateAgentOperation).toHaveBeenCalledWith(
        'user-123',
        OAuthProviderType.GMAIL,
        'email_read',
        AgentCapability.EMAIL_ACCESS
      );
    });

    it('should handle validation errors gracefully', async () => {
      const request = createEnhancedSecurityRequest({
        securityContext: {
          userType: UserType.AGENT,
          agentContext: null // Missing agent context
        }
      });

      await expect(
        enhancedSecurityGatewayService.validateEnhancedSecurity(request)
      ).rejects.toThrow('Agent context required for agent operations');

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.SECURITY_VIOLATION
        })
      );
    });
  });

  describe('Risk Assessment Engine', () => {
    it('should assess user type risk correctly', async () => {
      const agentRequest = createEnhancedSecurityRequest({
        securityContext: {
          userType: UserType.AGENT,
          agentCapabilities: [AgentCapability.CODE_REPOSITORY],
          agentContext: {
            agentId: 'agent-123',
            agentName: 'Test Agent',
            capabilities: [AgentCapability.CODE_REPOSITORY],
            connectedProviders: [],
            operationLimits: {
              maxDailyOperations: 100,
              currentDailyOperations: 10,
              maxConcurrentOperations: 5,
              currentConcurrentOperations: 1
            }
          }
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(agentRequest);

      expect([SecurityLevel.MEDIUM, SecurityLevel.HIGH, SecurityLevel.CRITICAL]).toContain(result.riskLevel);
    });

    it('should assess authentication method risk', async () => {
      const apiKeyRequest = createEnhancedSecurityRequest({
        securityContext: {
          authenticationMethod: AuthenticationMethod.API_KEY
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(apiKeyRequest);

      expect([SecurityLevel.MEDIUM, SecurityLevel.HIGH, SecurityLevel.CRITICAL]).toContain(result.riskLevel);
    });

    it('should assess OAuth provider risk', async () => {
      const customProviderRequest = createEnhancedSecurityRequest({
        securityContext: {
          oauthProvider: OAuthProviderType.CUSTOM,
          userType: UserType.AGENT,
          agentCapabilities: [AgentCapability.EMAIL_ACCESS],
          agentContext: {
            agentId: 'agent-123',
            agentName: 'Test Agent',
            capabilities: [AgentCapability.EMAIL_ACCESS],
            connectedProviders: [],
            operationLimits: {
              maxDailyOperations: 100,
              currentDailyOperations: 10,
              maxConcurrentOperations: 5,
              currentConcurrentOperations: 1
            }
          }
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(customProviderRequest);

      expect([SecurityLevel.HIGH, SecurityLevel.CRITICAL]).toContain(result.riskLevel);
    });

    it('should assess agent capability risk', async () => {
      const highRiskCapabilitiesRequest = createEnhancedSecurityRequest({
        securityContext: {
          userType: UserType.AGENT,
          agentCapabilities: [
            AgentCapability.CODE_REPOSITORY,
            AgentCapability.EMAIL_ACCESS,
            AgentCapability.FILE_MANAGEMENT
          ],
          agentContext: {
            agentId: 'agent-123',
            agentName: 'Test Agent',
            capabilities: [
              AgentCapability.CODE_REPOSITORY,
              AgentCapability.EMAIL_ACCESS,
              AgentCapability.FILE_MANAGEMENT
            ],
            connectedProviders: [],
            operationLimits: {
              maxDailyOperations: 100,
              currentDailyOperations: 10,
              maxConcurrentOperations: 5,
              currentConcurrentOperations: 1
            }
          }
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(highRiskCapabilitiesRequest);

      expect([SecurityLevel.MEDIUM, SecurityLevel.HIGH, SecurityLevel.CRITICAL]).toContain(result.riskLevel);
      expect(result.agentRestrictions).toBeDefined();
      expect(result.agentRestrictions.rateLimit).toBeDefined();
    });

    it('should increase risk for untrusted devices', async () => {
      const untrustedDeviceRequest = createEnhancedSecurityRequest({
        securityContext: {
          deviceTrusted: false,
          locationTrusted: false
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(untrustedDeviceRequest);

      expect([SecurityLevel.MEDIUM, SecurityLevel.HIGH, SecurityLevel.CRITICAL]).toContain(result.riskLevel);
    });

    it('should increase risk when MFA is not verified', async () => {
      const noMfaRequest = createEnhancedSecurityRequest({
        securityContext: {
          mfaVerified: false,
          securityLevel: SecurityLevel.HIGH
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(noMfaRequest);

      expect(result.mfaRequired).toBe(true);
    });
  });

  describe('Agent Rate Limiting', () => {
    it('should enforce daily operation limits', async () => {
      const request = createEnhancedSecurityRequest({
        securityContext: {
          userType: UserType.AGENT,
          agentCapabilities: [AgentCapability.CODE_REPOSITORY],
          agentContext: {
            agentId: 'agent-123',
            agentName: 'Test Agent',
            capabilities: [AgentCapability.CODE_REPOSITORY],
            connectedProviders: [],
            operationLimits: {
              maxDailyOperations: 10,
              currentDailyOperations: 10, // At limit
              maxConcurrentOperations: 5,
              currentConcurrentOperations: 1
            }
          }
        }
      });

      await expect(
        enhancedSecurityGatewayService.validateEnhancedSecurity(request)
      ).rejects.toThrow('Daily operation limit exceeded');
    });

    it('should enforce concurrent operation limits', async () => {
      const request = createEnhancedSecurityRequest({
        securityContext: {
          userType: UserType.AGENT,
          agentCapabilities: [AgentCapability.CODE_REPOSITORY],
          agentContext: {
            agentId: 'agent-123',
            agentName: 'Test Agent',
            capabilities: [AgentCapability.CODE_REPOSITORY],
            connectedProviders: [],
            operationLimits: {
              maxDailyOperations: 100,
              currentDailyOperations: 10,
              maxConcurrentOperations: 2,
              currentConcurrentOperations: 2 // At limit
            }
          }
        }
      });

      await expect(
        enhancedSecurityGatewayService.validateEnhancedSecurity(request)
      ).rejects.toThrow('Concurrent operation limit exceeded');
    });
  });

  describe('MFA Requirements', () => {
    it('should require MFA for critical operations', async () => {
      const criticalRequest = createEnhancedSecurityRequest({
        operation: {
          type: 'delete',
          resource: 'production_database',
          action: 'delete'
        },
        securityContext: {
          securityLevel: SecurityLevel.CRITICAL,
          mfaVerified: false
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(criticalRequest);

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaMethods).toContain(MFAMethod.TOTP);
      expect(result.mfaMethods).toContain(MFAMethod.HARDWARE_TOKEN);
    });

    it('should require MFA for agent operations with sensitive capabilities', async () => {
      const sensitiveAgentRequest = createEnhancedSecurityRequest({
        operation: {
          type: 'email_send',
          resource: 'email',
          action: 'send'
        },
        securityContext: {
          userType: UserType.AGENT,
          agentCapabilities: [AgentCapability.EMAIL_ACCESS],
          mfaVerified: false,
          agentContext: {
            agentId: 'agent-123',
            agentName: 'Test Agent',
            capabilities: [AgentCapability.EMAIL_ACCESS],
            connectedProviders: [],
            operationLimits: {
              maxDailyOperations: 100,
              currentDailyOperations: 10,
              maxConcurrentOperations: 5,
              currentConcurrentOperations: 1
            }
          }
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(sensitiveAgentRequest);

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaMethods).toContain(MFAMethod.TOTP);
    });

    it('should not require MFA when already verified', async () => {
      const verifiedRequest = createEnhancedSecurityRequest({
        securityContext: {
          mfaVerified: true,
          securityLevel: SecurityLevel.HIGH
        }
      });

      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(verifiedRequest);

      expect(result.mfaRequired).toBe(false);
    });
  });
});
