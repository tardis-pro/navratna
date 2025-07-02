import { jest } from '@jest/globals';
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
  SecurityLevel,
  UserType,
  AgentCapability,
  OAuthProviderType,
  AuthenticationMethod,
  MFAMethod,
  AuditEventType
} from '@uaip/types';

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
  ApiError: jest.fn().mockImplementation((status, message: string, code) => {
    const error = new Error(message);
    (error as any).status = status;
    (error as any).code = code;
    return error;
  })
}));

describe('Enhanced Security Integration Tests', () => {
  let enhancedSecurityGatewayService: EnhancedSecurityGatewayService;
  let mockDatabaseService: any;
  let mockAuditService: any;
  let mockApprovalWorkflowService: any;
  let mockOAuthProviderService: any;
  let mockEnhancedAuthService: any;

  beforeAll(async () => {
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('End-to-End Agent GitHub Integration', () => {
    it('should handle complete agent GitHub operation workflow', async () => {
      // Setup: Agent with GitHub OAuth connection
      const agentRequest: EnhancedSecurityValidationRequest = {
        operation: {
          type: 'git_clone',
          resource: 'github.com/test/repo',
          action: 'clone',
          context: {
            repository: 'test/repo',
            branch: 'main'
          }
        },
        securityContext: {
          userId: 'agent-123',
          sessionId: 'session-123',
          userType: UserType.AGENT,
          ipAddress: '192.168.1.100',
          userAgent: 'AgentBot/1.0',
          department: 'automation',
          role: 'agent',
          permissions: ['code_repository'],
          securityLevel: SecurityLevel.MEDIUM,
          lastAuthentication: new Date(),
          mfaVerified: true,
          riskScore: 3,
          authenticationMethod: AuthenticationMethod.AGENT_TOKEN,
          oauthProvider: OAuthProviderType.GITHUB,
          agentCapabilities: [AgentCapability.CODE_REPOSITORY],
          deviceTrusted: true,
          locationTrusted: true,
          agentContext: {
            agentId: 'agent-123',
            agentName: 'GitHub Integration Agent',
            capabilities: [AgentCapability.CODE_REPOSITORY],
            connectedProviders: [{
              providerId: 'github-provider-1',
              providerType: OAuthProviderType.GITHUB,
              capabilities: [AgentCapability.CODE_REPOSITORY],
              lastUsed: new Date()
            }],
            operationLimits: {
              maxDailyOperations: 1000,
              currentDailyOperations: 50,
              maxConcurrentOperations: 10,
              currentConcurrentOperations: 2
            }
          }
        },
        requestMetadata: {
          requestId: 'req-github-123',
          source: 'agent-orchestrator',
          priority: 'normal'
        }
      };

      // Mock OAuth provider validation
      mockOAuthProviderService.validateAgentOperation.mockResolvedValue({
        allowed: true,
        reason: 'Agent has valid GitHub access token with repo scope'
      });

      // Execute validation
      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(agentRequest);

      // Verify results
      expect(result.allowed).toBe(true);
      expect(result.approvalRequired).toBe(false);
      expect(result.mfaRequired).toBe(false);
      expect(result.agentRestrictions).toBeDefined();
      expect(result.agentRestrictions.monitoring.logLevel).toBe('detailed');

      // Verify OAuth validation was called
      expect(mockOAuthProviderService.validateAgentOperation).toHaveBeenCalledWith(
        'agent-123',
        OAuthProviderType.GITHUB,
        'git_clone',
        AgentCapability.CODE_REPOSITORY
      );

      // Verify audit logging
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.PERMISSION_GRANTED,
          agentId: 'agent-123',
          details: expect.objectContaining({
            operation: agentRequest.operation,
            agentCapabilities: [AgentCapability.CODE_REPOSITORY],
            oauthProvider: OAuthProviderType.GITHUB
          })
        })
      );
    });

    it('should handle agent GitHub operation requiring approval', async () => {
      const highRiskRequest: EnhancedSecurityValidationRequest = {
        operation: {
          type: 'git_push',
          resource: 'github.com/production/critical-app',
          action: 'push',
          context: {
            repository: 'production/critical-app',
            branch: 'main',
            changes: ['src/security/auth.ts']
          }
        },
        securityContext: {
          userId: 'agent-123',
          sessionId: 'session-123',
          userType: UserType.AGENT,
          ipAddress: '192.168.1.100',
          userAgent: 'AgentBot/1.0',
          department: 'automation',
          role: 'agent',
          permissions: ['code_repository'],
          securityLevel: SecurityLevel.HIGH,
          lastAuthentication: new Date(),
          mfaVerified: true,
          riskScore: 7,
          authenticationMethod: AuthenticationMethod.AGENT_TOKEN,
          oauthProvider: OAuthProviderType.GITHUB,
          agentCapabilities: [AgentCapability.CODE_REPOSITORY],
          deviceTrusted: true,
          locationTrusted: true,
          agentContext: {
            agentId: 'agent-123',
            agentName: 'GitHub Integration Agent',
            capabilities: [AgentCapability.CODE_REPOSITORY],
            connectedProviders: [{
              providerId: 'github-provider-1',
              providerType: OAuthProviderType.GITHUB,
              capabilities: [AgentCapability.CODE_REPOSITORY],
              lastUsed: new Date()
            }],
            operationLimits: {
              maxDailyOperations: 1000,
              currentDailyOperations: 50,
              maxConcurrentOperations: 10,
              currentConcurrentOperations: 2
            }
          }
        },
        requestMetadata: {
          requestId: 'req-github-push-123',
          source: 'agent-orchestrator',
          priority: 'high'
        }
      };

      // Mock OAuth provider validation
      mockOAuthProviderService.validateAgentOperation.mockResolvedValue({
        allowed: true,
        reason: 'Agent has valid GitHub access token with repo scope'
      });

      // Execute validation
      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(highRiskRequest);

      // Verify results
      expect(result.allowed).toBe(false); // Not allowed without approval
      expect(result.approvalRequired).toBe(true);
      expect(result.requiredApprovers).toContain('agent-supervisor');
      expect(result.riskLevel).toBe(SecurityLevel.HIGH);

      // Verify audit logging for denied operation
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.PERMISSION_DENIED,
          agentId: 'agent-123'
        })
      );
    });
  });

  describe('End-to-End Agent Gmail Integration', () => {
    it('should handle agent email reading operation', async () => {
      const emailReadRequest: EnhancedSecurityValidationRequest = {
        operation: {
          type: 'email_read',
          resource: 'gmail.inbox',
          action: 'read',
          context: {
            folder: 'inbox',
            limit: 10
          }
        },
        securityContext: {
          userId: 'agent-456',
          sessionId: 'session-456',
          userType: UserType.AGENT,
          ipAddress: '192.168.1.101',
          userAgent: 'EmailAgent/1.0',
          department: 'customer-service',
          role: 'agent',
          permissions: ['email_access'],
          securityLevel: SecurityLevel.MEDIUM,
          lastAuthentication: new Date(),
          mfaVerified: true,
          riskScore: 2,
          authenticationMethod: AuthenticationMethod.AGENT_TOKEN,
          oauthProvider: OAuthProviderType.GMAIL,
          agentCapabilities: [AgentCapability.EMAIL_ACCESS],
          deviceTrusted: true,
          locationTrusted: true,
          agentContext: {
            agentId: 'agent-456',
            agentName: 'Email Processing Agent',
            capabilities: [AgentCapability.EMAIL_ACCESS],
            connectedProviders: [{
              providerId: 'gmail-provider-1',
              providerType: OAuthProviderType.GMAIL,
              capabilities: [AgentCapability.EMAIL_ACCESS],
              lastUsed: new Date()
            }],
            operationLimits: {
              maxDailyOperations: 500,
              currentDailyOperations: 25,
              maxConcurrentOperations: 5,
              currentConcurrentOperations: 1
            }
          }
        },
        requestMetadata: {
          requestId: 'req-email-read-123',
          source: 'email-processor',
          priority: 'normal'
        }
      };

      // Mock OAuth provider validation
      mockOAuthProviderService.validateAgentOperation.mockResolvedValue({
        allowed: true,
        reason: 'Agent has valid Gmail access token with read scope'
      });

      // Execute validation
      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(emailReadRequest);

      // Verify results
      expect(result.allowed).toBe(true);
      expect(result.approvalRequired).toBe(false);
      expect(result.mfaRequired).toBe(false);
      expect(result.agentRestrictions).toBeDefined();

      // Verify OAuth validation was called
      expect(mockOAuthProviderService.validateAgentOperation).toHaveBeenCalledWith(
        'agent-456',
        OAuthProviderType.GMAIL,
        'email_read',
        AgentCapability.EMAIL_ACCESS
      );
    });
  });

  describe('Multi-Provider Agent Operations', () => {
    it('should handle agent with multiple OAuth providers', async () => {
      const multiProviderRequest: EnhancedSecurityValidationRequest = {
        operation: {
          type: 'data_sync',
          resource: 'github_to_email',
          action: 'sync',
          context: {
            source: 'github',
            destination: 'email'
          }
        },
        securityContext: {
          userId: 'agent-789',
          sessionId: 'session-789',
          userType: UserType.AGENT,
          ipAddress: '192.168.1.102',
          userAgent: 'SyncAgent/1.0',
          department: 'integration',
          role: 'agent',
          permissions: ['code_repository', 'email_access'],
          securityLevel: SecurityLevel.MEDIUM,
          lastAuthentication: new Date(),
          mfaVerified: true,
          riskScore: 4,
          authenticationMethod: AuthenticationMethod.AGENT_TOKEN,
          oauthProvider: OAuthProviderType.GITHUB, // Primary provider for this operation
          agentCapabilities: [AgentCapability.CODE_REPOSITORY, AgentCapability.EMAIL_ACCESS],
          deviceTrusted: true,
          locationTrusted: true,
          agentContext: {
            agentId: 'agent-789',
            agentName: 'Multi-Provider Sync Agent',
            capabilities: [AgentCapability.CODE_REPOSITORY, AgentCapability.EMAIL_ACCESS],
            connectedProviders: [
              {
                providerId: 'github-provider-1',
                providerType: OAuthProviderType.GITHUB,
                capabilities: [AgentCapability.CODE_REPOSITORY],
                lastUsed: new Date()
              },
              {
                providerId: 'gmail-provider-1',
                providerType: OAuthProviderType.GMAIL,
                capabilities: [AgentCapability.EMAIL_ACCESS],
                lastUsed: new Date()
              }
            ],
            operationLimits: {
              maxDailyOperations: 200,
              currentDailyOperations: 15,
              maxConcurrentOperations: 3,
              currentConcurrentOperations: 1
            }
          }
        },
        requestMetadata: {
          requestId: 'req-multi-sync-123',
          source: 'sync-orchestrator',
          priority: 'normal'
        }
      };

      // Mock OAuth provider validation
      mockOAuthProviderService.validateAgentOperation.mockResolvedValue({
        allowed: true,
        reason: 'Agent has valid access tokens for both providers'
      });

      // Execute validation
      const result = await enhancedSecurityGatewayService.validateEnhancedSecurity(multiProviderRequest);

      // Verify results
      expect(result.allowed).toBe(true);
      expect(result.agentRestrictions).toBeDefined();
      expect(result.agentRestrictions.rateLimit).toBeDefined(); // Should have rate limits due to high-risk capabilities
    });
  });
});
