import { jest } from '@jest/globals';
import { OAuthProviderService } from '../../services/oauthProviderService.js';
import {
  createMockDatabaseService,
  createMockAuditService
} from '../utils/mockServices.js';
import {
  OAuthProviderConfig,
  OAuthProviderType,
  UserType,
  AgentCapability,
  SecurityLevel,
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
  ApiError: jest.fn().mockImplementation((status, message: string, code) => {
    const error = new Error(message);
    (error as any).status = status;
    (error as any).code = code;
    return error;
  })
}));

jest.mock('axios', () => ({
  default: {
    post: jest.fn(),
    get: jest.fn()
  }
}));

describe('OAuthProviderService', () => {
  let oauthProviderService: OAuthProviderService;
  let mockDatabaseService: any;
  let mockAuditService: any;

  beforeEach(() => {
    // Create mock services
    mockDatabaseService = createMockDatabaseService();
    mockAuditService = createMockAuditService();

    // Create service instance
    oauthProviderService = new OAuthProviderService(
      mockDatabaseService,
      mockAuditService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Provider Configuration', () => {
    const createGitHubProviderConfig = (): OAuthProviderConfig => ({
      id: 'github-provider-1',
      name: 'GitHub OAuth Provider',
      type: OAuthProviderType.GITHUB,
      clientId: 'github-client-id',
      clientSecret: 'github-client-secret',
      redirectUri: 'https://app.example.com/auth/github/callback',
      scope: ['repo', 'user:email'],
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      isEnabled: true,
      priority: 1,
      securityConfig: {
        requirePKCE: true,
        requireState: true,
        allowedUserTypes: [UserType.HUMAN, UserType.AGENT],
        minimumSecurityLevel: SecurityLevel.MEDIUM
      },
      agentConfig: {
        allowAgentAccess: true,
        requiredCapabilities: [AgentCapability.CODE_REPOSITORY],
        permissions: ['clone', 'pull', 'push'],
        rateLimit: {
          requests: 5000,
          windowMs: 3600000 // 1 hour
        },
        monitoring: {
          logAllRequests: true,
          alertOnSuspiciousActivity: true,
          maxDailyRequests: 1000
        }
      }
    });

    it('should create OAuth provider configuration successfully', async () => {
      const config = createGitHubProviderConfig();

      const result = await oauthProviderService.createProvider(config);

      expect(result).toBeDefined();
      expect(result.id).toBe(config.id);
      expect(result.type).toBe(OAuthProviderType.GITHUB);
      expect(mockDatabaseService.createOAuthProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          type: OAuthProviderType.GITHUB,
          agentConfig: expect.objectContaining({
            allowAgentAccess: true,
            requiredCapabilities: [AgentCapability.CODE_REPOSITORY]
          })
        })
      );
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.SECURITY_CONFIG_CHANGE,
          details: expect.objectContaining({
            action: 'create_oauth_provider',
            providerId: config.id,
            providerType: OAuthProviderType.GITHUB
          })
        })
      );
    });

    it('should validate provider configuration', async () => {
      const invalidConfig = {
        ...createGitHubProviderConfig(),
        clientId: '', // Invalid empty client ID
        authorizationUrl: 'invalid-url' // Invalid URL
      };

      await expect(
        oauthProviderService.createProvider(invalidConfig)
      ).rejects.toThrow();
    });

    it('should generate authorization URL with PKCE', async () => {
      const config = createGitHubProviderConfig();
      await oauthProviderService.createProvider(config);

      const result = await oauthProviderService.generateAuthorizationUrl(
        config.id,
        'https://app.example.com/auth/github/callback',
        UserType.HUMAN
      );

      expect(result).toBeDefined();
      expect(result.url).toContain('https://github.com/login/oauth/authorize');
      expect(result.url).toContain('client_id=github-client-id');
      expect(result.url).toContain('state=');
      expect(result.url).toContain('code_challenge=');
      expect(result.state).toBeDefined();
      expect(result.codeVerifier).toBeDefined();
    });

    it('should generate authorization URL for agents with capabilities', async () => {
      const config = createGitHubProviderConfig();
      await oauthProviderService.createProvider(config);

      const result = await oauthProviderService.generateAuthorizationUrl(
        config.id,
        'https://app.example.com/auth/github/callback',
        UserType.AGENT,
        [AgentCapability.CODE_REPOSITORY]
      );

      expect(result).toBeDefined();
      expect(result.url).toContain('scope=repo%20user%3Aemail');
    });

    it('should reject unauthorized user types', async () => {
      const config = {
        ...createGitHubProviderConfig(),
        securityConfig: {
          ...createGitHubProviderConfig().securityConfig!,
          allowedUserTypes: [UserType.HUMAN] // Only humans allowed
        }
      };
      await oauthProviderService.createProvider(config);

      await expect(
        oauthProviderService.generateAuthorizationUrl(
          config.id,
          'https://app.example.com/auth/github/callback',
          UserType.AGENT // Agent not allowed
        )
      ).rejects.toThrow('User type not allowed for this provider');
    });
  });

  describe('Agent Operation Validation', () => {
    it('should validate agent operation with proper capabilities', async () => {
      // Setup: Mock agent OAuth connection
      mockDatabaseService.getAgentOAuthConnection.mockResolvedValue({
        id: 'connection-123',
        agentId: 'agent-123',
        providerId: 'github-provider-1',
        providerType: OAuthProviderType.GITHUB,
        capabilities: [AgentCapability.CODE_REPOSITORY],
        permissions: ['clone', 'pull', 'push'],
        isActive: true,
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        usageStats: {
          totalRequests: 100,
          dailyRequests: 10,
          lastResetDate: new Date(),
          errors: 0,
          rateLimitHits: 0
        }
      });

      const result = await oauthProviderService.validateAgentOperation(
        'agent-123',
        OAuthProviderType.GITHUB,
        'git_clone',
        AgentCapability.CODE_REPOSITORY
      );

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Valid operation');
    });

    it('should reject agent operation without required capability', async () => {
      // Setup: Mock agent OAuth connection without required capability
      mockDatabaseService.getAgentOAuthConnection.mockResolvedValue({
        id: 'connection-123',
        agentId: 'agent-123',
        providerId: 'github-provider-1',
        providerType: OAuthProviderType.GITHUB,
        capabilities: [AgentCapability.NOTE_TAKING], // Wrong capability
        permissions: ['clone', 'pull'],
        isActive: true,
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });

      const result = await oauthProviderService.validateAgentOperation(
        'agent-123',
        OAuthProviderType.GITHUB,
        'git_clone',
        AgentCapability.CODE_REPOSITORY
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Missing required capability');
    });

    it('should reject agent operation when connection is inactive', async () => {
      // Setup: Mock inactive agent OAuth connection
      mockDatabaseService.getAgentOAuthConnection.mockResolvedValue({
        id: 'connection-123',
        agentId: 'agent-123',
        providerId: 'github-provider-1',
        providerType: OAuthProviderType.GITHUB,
        capabilities: [AgentCapability.CODE_REPOSITORY],
        permissions: ['clone', 'pull'],
        isActive: false, // Inactive connection
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000)
      });

      const result = await oauthProviderService.validateAgentOperation(
        'agent-123',
        OAuthProviderType.GITHUB,
        'git_clone',
        AgentCapability.CODE_REPOSITORY
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No active OAuth connection');
    });

    it('should reject agent operation when token is expired', async () => {
      // Setup: Mock agent OAuth connection with expired token
      mockDatabaseService.getAgentOAuthConnection.mockResolvedValue({
        id: 'connection-123',
        agentId: 'agent-123',
        providerId: 'github-provider-1',
        providerType: OAuthProviderType.GITHUB,
        capabilities: [AgentCapability.CODE_REPOSITORY],
        permissions: ['clone', 'pull'],
        isActive: true,
        tokenExpiresAt: new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago (expired)
      });

      const result = await oauthProviderService.validateAgentOperation(
        'agent-123',
        OAuthProviderType.GITHUB,
        'git_clone',
        AgentCapability.CODE_REPOSITORY
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Token expired');
    });

    it('should handle rate limiting for agent operations', async () => {
      // Setup: Mock agent OAuth connection with high usage
      mockDatabaseService.getAgentOAuthConnection.mockResolvedValue({
        id: 'connection-123',
        agentId: 'agent-123',
        providerId: 'github-provider-1',
        providerType: OAuthProviderType.GITHUB,
        capabilities: [AgentCapability.CODE_REPOSITORY],
        permissions: ['clone', 'pull'],
        isActive: true,
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        usageStats: {
          totalRequests: 5000,
          dailyRequests: 1000, // At daily limit
          lastResetDate: new Date(),
          errors: 0,
          rateLimitHits: 5
        },
        restrictions: {
          allowedOperations: ['clone', 'pull'],
          timeRestrictions: {
            allowedHours: [9, 10, 11, 12, 13, 14, 15, 16, 17], // Business hours only
            timezone: 'UTC'
          }
        }
      });

      const result = await oauthProviderService.validateAgentOperation(
        'agent-123',
        OAuthProviderType.GITHUB,
        'git_clone',
        AgentCapability.CODE_REPOSITORY
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit exceeded');
      expect(result.rateLimit).toBeDefined();
    });
  });

  describe('OAuth Callback Handling', () => {
    it('should handle OAuth callback successfully', async () => {
      // Setup: Mock OAuth state and provider
      mockDatabaseService.getOAuthState.mockResolvedValue({
        state: 'state-123',
        providerId: 'github-provider-1',
        redirectUri: 'https://app.example.com/auth/github/callback',
        codeVerifier: 'verifier-123',
        userType: UserType.HUMAN,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
      });

      // Mock axios for token exchange
      const axios = require('axios');
      axios.default.post.mockResolvedValue({
        data: {
          access_token: 'github-access-token',
          token_type: 'bearer',
          scope: 'repo,user:email'
        }
      });

      // Mock axios for user info
      axios.default.get.mockResolvedValue({
        data: {
          id: 'github-user-123',
          login: 'testuser',
          email: 'test@example.com',
          name: 'Test User'
        }
      });

      const result = await oauthProviderService.handleCallback(
        'auth-code-123',
        'state-123',
        'https://app.example.com/auth/github/callback'
      );

      expect(result).toBeDefined();
      expect(result.tokens.access_token).toBe('github-access-token');
      expect(result.userInfo.id).toBe('github-user-123');
      expect(result.provider.id).toBe('github-provider-1');
    });

    it('should reject expired OAuth state', async () => {
      // Setup: Mock expired OAuth state
      mockDatabaseService.getOAuthState.mockResolvedValue({
        state: 'state-123',
        providerId: 'github-provider-1',
        redirectUri: 'https://app.example.com/auth/github/callback',
        userType: UserType.HUMAN,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago (expired)
      });

      await expect(
        oauthProviderService.handleCallback(
          'auth-code-123',
          'state-123',
          'https://app.example.com/auth/github/callback'
        )
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should reject invalid OAuth state', async () => {
      // Setup: Mock no OAuth state found
      mockDatabaseService.getOAuthState.mockResolvedValue(null);

      await expect(
        oauthProviderService.handleCallback(
          'auth-code-123',
          'invalid-state',
          'https://app.example.com/auth/github/callback'
        )
      ).rejects.toThrow('Invalid or expired OAuth state');
    });
  });

  describe('Agent Connection Management', () => {
    it('should create agent OAuth connection', async () => {
      const connectionData = {
        agentId: 'agent-123',
        providerId: 'github-provider-1',
        providerType: OAuthProviderType.GITHUB,
        capabilities: [AgentCapability.CODE_REPOSITORY],
        accessToken: 'encrypted-access-token',
        scope: ['repo', 'user:email'],
        permissions: ['clone', 'pull', 'push']
      };

      const result = await oauthProviderService.createAgentConnection(
        connectionData.agentId,
        connectionData.providerId,
        { access_token: connectionData.accessToken, token_type: 'Bearer' },
        connectionData.capabilities,
        connectionData.permissions
      );

      expect(result).toBeDefined();
      expect(result.agentId).toBe('agent-123');
      expect(result.providerType).toBe(OAuthProviderType.GITHUB);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.OAUTH_CONNECTION_CREATED,
          agentId: 'agent-123'
        })
      );
    });

    it('should record agent operation usage', async () => {
      await oauthProviderService.recordAgentOperation(
        'agent-123',
        'github-provider-1',
        'git_clone',
        true
      );

      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: AuditEventType.AGENT_OPERATION,
          agentId: 'agent-123',
          details: expect.objectContaining({
            operation: 'git_clone',
            success: true,
            providerId: 'github-provider-1'
          })
        })
      );
    });
  });
});
